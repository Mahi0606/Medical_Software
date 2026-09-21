import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Download, FileCheck2, Settings2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { cn, formatDateIN, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, Field, Input, Money, PageHeader, Sheet, Spinner, Stat } from '@/components/ui';

type Kind = 'tally-sales' | 'tally-purchases' | 'tally-both' | 'einvoice' | 'gstr1';
const KINDS: { id: Kind; name: string; group: string }[] = [
  { id: 'tally-both', name: 'Tally XML — sales & purchases', group: 'Tally' },
  { id: 'tally-sales', name: 'Tally XML — sales only', group: 'Tally' },
  { id: 'tally-purchases', name: 'Tally XML — purchases only', group: 'Tally' },
  { id: 'einvoice', name: 'e-Invoice JSON (B2B bills)', group: 'GST' },
  { id: 'gstr1', name: 'GSTR-1 JSON (offline tool)', group: 'GST' },
];

export function ExportsPage() {
  const search = useSearch({ from: '/app/exports' });
  const nav = useNavigate();
  const { can } = useAuth();
  const today = todayIST();
  const kind: Kind = KINDS.some((k) => k.id === search.kind) ? (search.kind as Kind) : 'tally-both';
  const from = search.from ?? `${today.slice(0, 8)}01`;
  const to = search.to ?? today;
  const def = KINDS.find((k) => k.id === kind)!;
  const set = (patch: Partial<typeof search>) => nav({ to: '/exports', search: (s) => ({ ...s, ...patch }) });
  const [ledgersOpen, setLedgersOpen] = useState(false);
  const rangeOk = from <= to;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <nav aria-label="Export kinds" className="card h-fit p-2">
        {[...new Set(KINDS.map((k) => k.group))].map((g) => (
          <div key={g} className="mb-2">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-3">{g}</p>
            {KINDS.filter((k) => k.group === g).map((k) => <button key={k.id} onClick={() => set({ kind: k.id })} aria-current={kind === k.id ? 'page' : undefined} className={cn('block w-full rounded px-2 py-2.5 text-left text-sm', kind === k.id ? 'bg-accent-bg font-medium text-accent' : 'text-text-2 hover:bg-surface-2 hover:text-text')}>{k.name}</button>)}
          </div>
        ))}
      </nav>
      <div className="min-w-0">
        <PageHeader title={def.name} description={`${formatDateIN(from)} to ${formatDateIN(to)} · only posted documents are included; cancelled ones are left out`}
          actions={<>
            <label className="text-xs text-text-2">From<Input dense type="date" value={from} max={to} onChange={(e) => set({ from: e.target.value })} aria-label="From date" /></label>
            <label className="text-xs text-text-2">To<Input dense type="date" value={to} min={from} max={today} onChange={(e) => set({ to: e.target.value })} aria-label="To date" /></label>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => set({ from: `${today.slice(0, 8)}01`, to: today })}>This month</Button>
              <Button size="sm" variant="ghost" onClick={() => { const d = new Date(today); d.setUTCDate(0); const lastTo = d.toISOString().slice(0, 10); set({ from: `${lastTo.slice(0, 8)}01`, to: lastTo }); }}>Last month</Button>
            </div>
            {kind.startsWith('tally') && can('settings.write') && <Button size="sm" variant="secondary" icon={<Settings2 className="h-4 w-4" />} onClick={() => setLedgersOpen(true)}>Tally ledger names</Button>}
          </>} />
        {!rangeOk && <Callout tone="warning" title="The From date is after the To date">Pick a range where From comes first.</Callout>}
        {rangeOk && kind.startsWith('tally') && <TallyExport from={from} to={to} kind={kind === 'tally-both' ? 'both' : kind === 'tally-sales' ? 'sales' : 'purchases'} />}
        {rangeOk && kind === 'einvoice' && <EinvoiceExport from={from} to={to} />}
        {rangeOk && kind === 'gstr1' && <Gstr1Export from={from} to={to} />}
      </div>
      {ledgersOpen && <TallyLedgerSheet onClose={() => setLedgersOpen(false)} />}
    </div>
  );
}

/** Anchor styled like a primary button; the browser saves the response as a file. */
function DownloadLink({ href, children, filename }: { href: string; children: ReactNode; filename: string }) {
  return <a href={href} download={filename} className="inline-flex h-11 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent bg-accent px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-hover"><Download className="h-4 w-4" aria-hidden />{children}</a>;
}

function Steps({ children }: { children: ReactNode }) { return <ol className="mt-1 list-decimal space-y-0.5 pl-5">{children}</ol>; }

// ---------- Tally ----------
interface RegisterTotals { rows: { status: string }[]; totals: { totalPaise: number; n: number } }
interface TallySettings { companyName: string; cashLedger: string; salesLedgerPattern: string; purchaseLedgerPattern: string; cgstOut: string; sgstOut: string; igstOut: string; cgstIn: string; sgstIn: string; igstIn: string; roundOff: string; otherCharges: string }

function TallyExport({ from, to, kind }: { from: string; to: string; kind: 'sales' | 'purchases' | 'both' }) {
  const sales = useQuery({ queryKey: ['report', '/reports/sales-register', { from, to }], queryFn: () => api.get<RegisterTotals>('/reports/sales-register', { from, to }), enabled: kind !== 'purchases' });
  const purchases = useQuery({ queryKey: ['report', '/reports/purchase-register', { from, to }], queryFn: () => api.get<RegisterTotals>('/reports/purchase-register', { from, to }), enabled: kind !== 'sales' });
  const settings = useQuery({ queryKey: ['tally-settings'], queryFn: () => api.get<TallySettings>('/exports/tally-settings') });
  const loading = sales.isLoading || purchases.isLoading;
  const error = sales.error ?? purchases.error;
  const nothing = (kind === 'purchases' || sales.data?.totals.n === 0) && (kind === 'sales' || purchases.data?.totals.n === 0) && !loading && !error;
  const s = settings.data;
  return (
    <div className="space-y-4">
      <Callout tone="accent" title="What this file is">
        One Tally voucher per posted document: bills as <em>Sales</em>, customer credit notes as <em>Credit Note</em>, supplier invoices as <em>Purchase</em> and returns to suppliers as <em>Debit Note</em>. Each voucher is split by GST rate into the ledger names shown below, so Tally's GST reports match this app rupee for rupee.
        <Steps>
          <li>In TallyPrime open the company, then <strong>Gateway of Tally → Import → Vouchers</strong> (older Tally: Import of Data → Vouchers).</li>
          <li>Choose the downloaded XML file and accept.</li>
          <li>If Tally lists ledgers as missing, create them with the exact names below (or change the names here) and import again. Re-importing the same file creates duplicates, so import each period once.</li>
        </Steps>
      </Callout>
      {loading ? <Spinner /> : error ? <Callout tone="danger" title="Could not count the documents">{(error as Error).message}</Callout> : nothing ? <EmptyState title="Nothing to export in this range">There are no posted bills or purchases between {formatDateIN(from)} and {formatDateIN(to)}. Pick another range.</EmptyState> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kind !== 'purchases' && sales.data && <><Stat label="Bills" value={sales.data.totals.n} sub={`${sales.data.rows.filter((r) => r.status === 'cancelled').length} cancelled, left out`} /><Stat label="Sales value" value={rupees(sales.data.totals.totalPaise)} /></>}
          {kind !== 'sales' && purchases.data && <><Stat label="Supplier invoices" value={purchases.data.totals.n} /><Stat label="Purchase value" value={rupees(purchases.data.totals.totalPaise)} /></>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <DownloadLink href={api.downloadUrl('/exports/tally', { from, to, kind })} filename={`tally-${kind}-${from}-${to}.xml`}>Download Tally XML</DownloadLink>
        <span className="text-sm text-text-2">Cash and UPI bills go to the party ledger “{s?.cashLedger ?? 'Cash Sales'}”; bills for GST-registered or credit customers use the customer's name.</span>
      </div>
      {s && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold">Ledger names this file uses</h3>
          <p className="mt-0.5 text-xs text-text-2">“{'{rate}'}” becomes the GST rate, e.g. 5, 12 or 18 for sales ledgers and 2.5, 6 or 9 for CGST/SGST.</p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {[['Company', s.companyName || 'Store name from Settings'], ['Walk-in party', s.cashLedger], ['Sales', s.salesLedgerPattern], ['Purchases', s.purchaseLedgerPattern], ['Output CGST', s.cgstOut], ['Output SGST', s.sgstOut], ['Output IGST', s.igstOut], ['Input CGST', s.cgstIn], ['Input SGST', s.sgstIn], ['Input IGST', s.igstIn], ['Round off', s.roundOff], ['Other charges', s.otherCharges]].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-border py-1 last:border-0"><dt className="text-text-2">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
        </div>
      )}
    </div>
  );
}

const LEDGER_FIELDS: { key: keyof TallySettings; label: string; hint?: string }[] = [
  { key: 'companyName', label: 'Tally company name', hint: 'Exactly as it appears in Tally. Leave blank to use the store name.' },
  { key: 'cashLedger', label: 'Party ledger for walk-in bills' },
  { key: 'salesLedgerPattern', label: 'Sales ledger', hint: 'Use {rate} where the GST rate goes' },
  { key: 'purchaseLedgerPattern', label: 'Purchase ledger' },
  { key: 'cgstOut', label: 'Output CGST ledger' }, { key: 'sgstOut', label: 'Output SGST ledger' }, { key: 'igstOut', label: 'Output IGST ledger' },
  { key: 'cgstIn', label: 'Input CGST ledger' }, { key: 'sgstIn', label: 'Input SGST ledger' }, { key: 'igstIn', label: 'Input IGST ledger' },
  { key: 'roundOff', label: 'Round-off ledger' }, { key: 'otherCharges', label: 'Other charges ledger (supplier freight etc.)' },
];

function TallyLedgerSheet({ onClose }: { onClose: () => void }) {
  const q = useQuery({ queryKey: ['tally-settings'], queryFn: () => api.get<TallySettings>('/exports/tally-settings') });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Tally ledger names" description="Match these to the ledgers in your Tally company so imports post without manual fixes." width="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" form="tally-form" type="submit" disabled={!q.data}>Save names</Button></>}>
      {q.isLoading ? <Spinner /> : q.error ? <Callout tone="danger" title="Could not load the ledger names">{(q.error as Error).message}</Callout> : q.data && <TallyLedgerForm initial={q.data} onSaved={onClose} />}
    </Sheet>
  );
}

function TallyLedgerForm({ initial, onSaved }: { initial: TallySettings; onSaved: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: TallySettings) => api.put<TallySettings>('/exports/tally-settings', body),
    onSuccess: (data) => { qc.setQueryData(['tally-settings'], data); toast.success('Tally ledger names saved'); onSaved(); },
    onError: (e: Error) => setErr(e.message),
  });
  const empty = LEDGER_FIELDS.filter((f) => f.key !== 'companyName' && !v[f.key].trim());
  return (
    <form id="tally-form" noValidate className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (empty.length) { setErr(`Fill in: ${empty.map((f) => f.label).join(', ')}`); return; } setErr(null); save.mutate(v); }}>
      {err && <Callout tone="danger" title="Could not save">{err}</Callout>}
      {LEDGER_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`tally-${f.key}`} hint={f.hint} required={f.key !== 'companyName'} error={empty.some((x) => x.key === f.key) && err ? 'Required' : null}>
          {(id, d) => <Input id={id} aria-describedby={d} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
        </Field>
      ))}
      <Button type="button" variant="link" className="justify-self-start" onClick={() => setV({ ...initial, companyName: v.companyName, cashLedger: 'Cash Sales', salesLedgerPattern: 'Sales @ {rate}%', purchaseLedgerPattern: 'Purchase @ {rate}%', cgstOut: 'Output CGST @ {rate}%', sgstOut: 'Output SGST @ {rate}%', igstOut: 'Output IGST @ {rate}%', cgstIn: 'Input CGST @ {rate}%', sgstIn: 'Input SGST @ {rate}%', igstIn: 'Input IGST @ {rate}%', roundOff: 'Round Off', otherCharges: 'Other Charges' })}>Reset to the standard names</Button>
    </form>
  );
}

// ---------- e-Invoice ----------
interface Check { seller: string[]; bills: { saleId: number; invoiceNo: string | null; date: string; customerId: number | null; customerName: string | null; gstin: string; totalPaise: number; problems: string[] }[]; total: number; withProblems: number }

function EinvoiceExport({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['einvoice-check', from, to], queryFn: () => api.get<Check>('/exports/einvoice-check', { from, to }) });
  const c = q.data;
  const clean = c && c.seller.length === 0 && c.withProblems === 0;
  return (
    <div className="space-y-4">
      <Callout tone="accent" title="What this file is">
        A JSON array in the GST e-invoice format (schema 1.1), one entry per posted bill to a GST-registered customer, plus credit notes against such bills. Walk-in bills are not e-invoiced. e-Invoicing is mandatory once yearly turnover crosses ₹5 crore; below that this file is optional.
        <Steps>
          <li>Sign in to the e-invoice portal (einvoice1.gst.gov.in) and open <strong>e-Invoice → Bulk Upload</strong>, or hand the file to your GSP / accounting software.</li>
          <li>Upload the JSON; the portal returns an IRN and QR code for each bill. Rejections name the field, so run the check below first.</li>
          <li>Print the IRN on the bill copy you give the customer, or keep the acknowledgement with your records.</li>
        </Steps>
      </Callout>
      <section aria-labelledby="einv-check" className="card p-4">
        <div className="flex items-center justify-between gap-3"><h3 id="einv-check" className="text-sm font-semibold">Pre-check: will the portal accept these bills?</h3>{c && <Badge tone={clean ? 'success' : 'warning'} icon={FileCheck2}>{clean ? 'All clear' : `${c.withProblems + (c.seller.length ? 1 : 0)} to fix`}</Badge>}</div>
        {q.isLoading ? <Spinner className="mt-3" /> : q.error ? <Callout tone="danger" className="mt-3" title="Could not run the check">{(q.error as Error).message}</Callout> : c && (
          <div className="mt-3 space-y-3">
            {c.seller.length > 0 && <Callout tone="danger" title="Your store details need fixing first" actions={<Link to="/settings" search={{ tab: 'store' }} className="text-sm font-medium text-accent underline">Open store settings</Link>}><ul className="list-disc pl-4">{c.seller.map((m) => <li key={m}>{m}</li>)}</ul></Callout>}
            {c.total === 0 ? <EmptyState title="No bills to GST-registered customers in this range">Only bills where the customer's GSTIN was recorded are e-invoiced. Add the GSTIN on the customer record before billing.</EmptyState> : (
              <div className="table-wrap"><table className="tbl dense"><thead><tr><th scope="col">Bill</th><th scope="col">Date</th><th scope="col">Customer</th><th scope="col">GSTIN</th><th scope="col" className="num">Total</th><th scope="col">Check</th></tr></thead>
                <tbody>{c.bills.map((b) => <tr key={b.saleId} data-tone={b.problems.length ? 'warning' : undefined}><td><Link to="/sales/$id" params={{ id: String(b.saleId) }} className="text-accent hover:underline">{b.invoiceNo}</Link></td><td>{formatDateIN(b.date)}</td><td>{b.customerId ? <Link to="/customers" search={{ q: b.customerName ?? '' }} className="text-accent hover:underline">{b.customerName}</Link> : b.customerName}</td><td className="font-mono text-xs">{b.gstin}</td><td className="num"><Money paise={b.totalPaise} /></td><td>{b.problems.length === 0 ? <Badge tone="success">Ready</Badge> : <ul className="space-y-0.5">{b.problems.map((p) => <li key={p}><Badge tone="warning">Fix</Badge> <span className="text-xs">{p}</span></li>)}</ul>}</td></tr>)}</tbody></table></div>
            )}
          </div>
        )}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <DownloadLink href={api.downloadUrl('/exports/einvoice', { from, to })} filename={`einvoice-${from}-${to}.json`}>Download e-Invoice JSON</DownloadLink>
        {c && !clean && c.total > 0 && <span className="text-sm text-warning">Bills marked “Fix” will be rejected by the portal until the master data is corrected. Rebuild the file after fixing.</span>}
      </div>
    </div>
  );
}

// ---------- GSTR-1 ----------
interface G1 { b2b: unknown[]; b2cByRate: { ratePct: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }[]; hsnB2B: unknown[]; hsnB2C: unknown[]; creditNotes: unknown[]; documents: { first: string | null; last: string | null; total: number; cancelled: number | null }; nilExempt: { taxablePaise: number } }

function Gstr1Export({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['report', '/reports/gstr1', { from, to }], queryFn: () => api.get<G1>('/reports/gstr1', { from, to }) });
  const d = q.data;
  const fp = `${to.slice(5, 7)}/${to.slice(0, 4)}`;
  const b2cTaxable = d?.b2cByRate.reduce((a, r) => a + r.taxablePaise, 0) ?? 0;
  return (
    <div className="space-y-4">
      <Callout tone="accent" title="What this file is">
        Your outward supplies for the period in the layout the GST offline tool reads: B2B invoices per customer GSTIN (table 4), walk-in sales by rate (table 7 B2C-others), credit notes (tables 9B), HSN summary (table 12) and the invoice series (table 13). Return period: <strong>{fp}</strong>. Pick a whole month or quarter to match your filing frequency.
        <Steps>
          <li>Open the <strong>GSTR-1 Offline Tool</strong> (download from gst.gov.in → Downloads → Offline Tools), choose Import Files → <strong>Import JSON</strong>.</li>
          <li>Check the section summaries against the GSTR-1 report in this app, then Generate the upload file and upload it under Returns Dashboard → GSTR-1 → Prepare Offline.</li>
          <li>Purchases (GSTR-2B / 3B) are not part of GSTR-1; use the GSTR-3B summary report for those.</li>
        </Steps>
      </Callout>
      {q.isLoading ? <Spinner /> : q.error ? <Callout tone="danger" title="Could not load the summary">{(q.error as Error).message}</Callout> : d && (d.documents.total === 0 ? <EmptyState title="No bills in this period" /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="B2B invoices" value={d.b2b.length} sub="Registered customers" />
          <Stat label="B2C taxable" value={rupees(b2cTaxable)} sub={`${d.b2cByRate.length} GST ${d.b2cByRate.length === 1 ? 'rate' : 'rates'}`} />
          <Stat label="Credit notes" value={d.creditNotes.length} tone={d.creditNotes.length ? 'warning' : 'neutral'} />
          <Stat label="Invoice series" value={`${d.documents.total - (d.documents.cancelled ?? 0)} net`} sub={`${d.documents.first ?? ''} → ${d.documents.last ?? ''}${d.documents.cancelled ? ` · ${d.documents.cancelled} cancelled` : ''}`} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <DownloadLink href={api.downloadUrl('/exports/gstr1-json', { from, to })} filename={`gstr1-${from}-${to}.json`}>Download GSTR-1 JSON</DownloadLink>
        <Link to="/reports" search={{ report: 'gstr1', from, to }} className="text-sm font-medium text-accent underline">Open the GSTR-1 report to compare</Link>
      </div>
    </div>
  );
}
