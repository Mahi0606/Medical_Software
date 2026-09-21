import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { type ReactNode } from 'react';
import { api, downloadCsv } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateIN, formatExpiry, formatStock, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, ExpiryBadge, Input, Money, NativeSelect, PageHeader, Spinner, Stat } from '@/components/ui';
import { AnalyticsPanel } from '../exports/analytics-panel';

type ReportId = 'analytics' | 'day-book' | 'sales-register' | 'purchase-register' | 'gstr1' | 'gstr3b' | 'stock' | 'expiry' | 'dead-stock' | 'profit' | 'outstanding' | 'schedule-sales';
const REPORTS: { id: ReportId; name: string; group: string; finance?: boolean; range?: boolean; single?: boolean }[] = [
  { id: 'analytics', name: 'Analytics & trends', group: 'Overview', finance: true },
  { id: 'day-book', name: 'Day book / counter close', group: 'Daily', single: true },
  { id: 'sales-register', name: 'Sales register', group: 'Sales', range: true },
  { id: 'profit', name: 'Profit & margins', group: 'Sales', range: true, finance: true },
  { id: 'schedule-sales', name: 'Scheduled drug sales', group: 'Sales', range: true },
  { id: 'purchase-register', name: 'Purchase register', group: 'Purchases', range: true },
  { id: 'gstr1', name: 'GSTR-1 summary (outward)', group: 'GST', range: true, finance: true },
  { id: 'gstr3b', name: 'GSTR-3B summary', group: 'GST', range: true, finance: true },
  { id: 'stock', name: 'Stock summary & reorder', group: 'Stock' },
  { id: 'expiry', name: 'Near-expiry & expired', group: 'Stock' },
  { id: 'dead-stock', name: 'Dead / non-moving stock', group: 'Stock' },
  { id: 'outstanding', name: 'Outstanding: customers & suppliers', group: 'Money' },
];

export function ReportsPage() {
  const search = useSearch({ from: '/app/reports' });
  const nav = useNavigate();
  const { can } = useAuth();
  const report = (search.report as ReportId) ?? 'day-book';
  const today = todayIST();
  const from = search.from ?? `${today.slice(0, 8)}01`;
  const to = search.to ?? today;
  const group = search.group ?? 'item';
  const def = REPORTS.find((r) => r.id === report) ?? REPORTS[0]!;
  const set = (patch: Partial<typeof search>) => nav({ to: '/reports', search: (s) => ({ ...s, ...patch }) });
  const allowed = REPORTS.filter((r) => !r.finance || can('report.finance'));
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <nav aria-label="Reports" className="card h-fit p-2">
        {[...new Set(allowed.map((r) => r.group))].map((g) => (
          <div key={g} className="mb-2">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-3">{g}</p>
            {allowed.filter((r) => r.group === g).map((r) => <button key={r.id} onClick={() => set({ report: r.id })} aria-current={report === r.id ? 'page' : undefined} className={`block w-full rounded px-2 py-2 text-left text-sm ${report === r.id ? 'bg-accent-bg font-medium text-accent' : 'text-text-2 hover:bg-surface-2 hover:text-text'}`}>{r.name}</button>)}
          </div>
        ))}
      </nav>
      <div className="min-w-0">
        <PageHeader title={def.name} description={def.range ? `${formatDateIN(from)} to ${formatDateIN(to)}` : def.single ? formatDateIN(to) : undefined}
          actions={<>
            {def.single && <label className="text-xs text-text-2">Date<Input dense type="date" max={today} value={to} onChange={(e) => set({ to: e.target.value })} aria-label="Date" /></label>}
            {def.range && <><label className="text-xs text-text-2">From<Input dense type="date" value={from} onChange={(e) => set({ from: e.target.value })} aria-label="From date" /></label><label className="text-xs text-text-2">To<Input dense type="date" value={to} onChange={(e) => set({ to: e.target.value })} aria-label="To date" /></label>
              <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => set({ from: `${today.slice(0, 8)}01`, to: today })}>This month</Button><Button size="sm" variant="ghost" onClick={() => { const d = new Date(today); d.setUTCDate(0); const lastTo = d.toISOString().slice(0, 10); set({ from: `${lastTo.slice(0, 8)}01`, to: lastTo }); }}>Last month</Button></div></>}
          </>} />
        {report === 'analytics' && <AnalyticsPanel />}
        {report === 'day-book' && <DayBook date={to} />}
        {report === 'sales-register' && <SalesRegister from={from} to={to} />}
        {report === 'purchase-register' && <PurchaseRegister from={from} to={to} />}
        {report === 'gstr1' && <Gstr1 from={from} to={to} />}
        {report === 'gstr3b' && <Gstr3b from={from} to={to} />}
        {report === 'stock' && <StockReport />}
        {report === 'expiry' && <ExpiryReport />}
        {report === 'dead-stock' && <DeadStock />}
        {report === 'profit' && <Profit from={from} to={to} group={group} onGroup={(g) => set({ group: g })} />}
        {report === 'outstanding' && <Outstanding />}
        {report === 'schedule-sales' && <ScheduleSales from={from} to={to} />}
      </div>
    </div>
  );
}

function useReport<T>(path: string, query: Record<string, string | number | boolean | undefined>) {
  return useQuery({ queryKey: ['report', path, query], queryFn: () => api.get<T>(path, query), placeholderData: (p) => p });
}
function Frame({ q, children, onExport }: { q: { isLoading: boolean; error: Error | null; data: unknown }; children: ReactNode; onExport?: () => void }) {
  if (q.isLoading) return <Spinner />;
  if (q.error) return <Callout tone="danger" title="Could not load this report">{q.error.message}</Callout>;
  return <div className="space-y-4">{onExport && <div className="flex justify-end"><Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={onExport}>Export CSV</Button></div>}{children}</div>;
}
const Tot = ({ label, paise }: { label: string; paise: number }) => <div className="flex justify-between gap-4 text-sm"><span className="text-text-2">{label}</span><Money paise={paise} className="font-medium" /></div>;

function DayBook({ date }: { date: string }) {
  interface D { sales: { n: number; gross: number; discount: number; taxable: number; tax: number; total: number; credit: number; cancelled: number }; byMode: { mode: string; total: number; n: number }[]; returns: { n: number; total: number; cash: number }; purchases: { n: number; total: number }; received: { mode: string; total: number }[]; paid: { mode: string; total: number }[]; cashIn: number; cashOut: number; netCash: number; rows: { id: number; invoiceNo: string; createdAt: string; customerName: string | null; totalPaise: number; paidPaise: number; creditPaise: number; status: string; createdByName: string | null }[] }
  const q = useReport<D>('/reports/day-book', { date });
  const d = q.data;
  return (
    <Frame q={q} onExport={() => d && downloadCsv(`day-book-${date}`, d.rows as unknown as Record<string, unknown>[])}>
      {d && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Bills" value={d.sales.n} sub={`${d.sales.cancelled} cancelled`} /><Stat label="Sales total" value={rupees(d.sales.total)} sub={`Credit ${rupees(d.sales.credit)}`} /><Stat label="Returns" value={rupees(d.returns.total)} sub={`${d.returns.n} credit notes`} tone={d.returns.n ? 'warning' : 'neutral'} /><Stat label="Net cash movement" value={rupees(d.netCash)} sub={`In ${rupees(d.cashIn)} · Out ${rupees(d.cashOut)}`} tone="success" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card p-4"><h3 className="mb-2 text-sm font-semibold">Collections by mode</h3>{d.byMode.length === 0 ? <p className="text-sm text-text-2">No collections.</p> : d.byMode.map((m) => <Tot key={m.mode} label={`${m.mode.toUpperCase()} (${m.n})`} paise={m.total} />)}{d.received.map((m) => <Tot key={'r' + m.mode} label={`Dues received by ${m.mode.toUpperCase()}`} paise={m.total} />)}</div>
          <div className="card p-4"><h3 className="mb-2 text-sm font-semibold">Sales breakdown</h3><Tot label="Gross" paise={d.sales.gross} /><Tot label="Discount" paise={-d.sales.discount} /><Tot label="Taxable" paise={d.sales.taxable} /><Tot label="GST" paise={d.sales.tax} /><Tot label="Total" paise={d.sales.total} /></div>
          <div className="card p-4"><h3 className="mb-2 text-sm font-semibold">Purchases & payments out</h3><Tot label={`Receipts posted (${d.purchases.n})`} paise={d.purchases.total} />{d.paid.map((m) => <Tot key={m.mode} label={`Paid to suppliers by ${m.mode.toUpperCase()}`} paise={m.total} />)}<Tot label="Cash refunds" paise={d.returns.cash} /></div>
        </div>
        <div className="table-wrap"><table className="tbl dense"><thead><tr><th>Bill</th><th>Time</th><th>Customer</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Credit</th><th>Status</th><th>By</th></tr></thead><tbody>{d.rows.map((r) => <tr key={r.id} data-tone={r.status === 'cancelled' ? 'danger' : undefined}><td><Link to="/sales/$id" params={{ id: String(r.id) }} className="text-accent hover:underline">{r.invoiceNo}</Link></td><td>{new Date(r.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td><td>{r.customerName ?? 'Walk-in'}</td><td className="num"><Money paise={r.totalPaise} /></td><td className="num"><Money paise={r.paidPaise} /></td><td className="num"><Money paise={r.creditPaise} /></td><td>{r.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Posted</Badge>}</td><td>{r.createdByName}</td></tr>)}</tbody></table></div>
      </>}
    </Frame>
  );
}

function SalesRegister({ from, to }: { from: string; to: string }) {
  interface R { rows: { id: number; date: string; invoiceNo: string; kind: string; status: string; customerName: string | null; customerGstin: string | null; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; roundOffPaise: number; totalPaise: number; returnedPaise: number }[]; totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number; n: number } }
  const q = useReport<R>('/reports/sales-register', { from, to });
  return (
    <Frame q={q} onExport={() => q.data && downloadCsv(`sales-register-${from}-${to}`, q.data.rows as unknown as Record<string, unknown>[])}>
      {q.data && (q.data.rows.length === 0 ? <EmptyState title="No bills in this period" /> : <div className="table-wrap"><table className="tbl dense"><thead><tr><th>Date</th><th>Bill</th><th>Type</th><th>Customer</th><th>GSTIN</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total</th></tr></thead>
        <tbody>{q.data.rows.map((r) => <tr key={r.id} data-tone={r.status === 'cancelled' ? 'danger' : undefined}><td>{formatDateIN(r.date)}</td><td><Link to="/sales/$id" params={{ id: String(r.id) }} className="text-accent hover:underline">{r.invoiceNo}</Link>{r.status === 'cancelled' && <Badge tone="danger" className="ml-1">Cancelled</Badge>}</td><td className="text-xs">{r.kind.replace(/_/g, ' ').toLowerCase()}</td><td>{r.customerName ?? 'Walk-in'}</td><td className="text-xs">{r.customerGstin ?? '—'}</td><td className="num"><Money paise={r.taxablePaise} /></td><td className="num"><Money paise={r.cgstPaise} /></td><td className="num"><Money paise={r.sgstPaise} /></td><td className="num"><Money paise={r.igstPaise} /></td><td className="num"><Money paise={r.totalPaise} /></td></tr>)}</tbody>
        <tfoot><tr className="font-semibold"><td colSpan={5} className="px-3 py-2">Total ({q.data.totals.n} posted bills)</td><td className="num px-3"><Money paise={q.data.totals.taxablePaise} /></td><td className="num px-3"><Money paise={q.data.totals.cgstPaise} /></td><td className="num px-3"><Money paise={q.data.totals.sgstPaise} /></td><td className="num px-3"><Money paise={q.data.totals.igstPaise} /></td><td className="num px-3"><Money paise={q.data.totals.totalPaise} /></td></tr></tfoot></table></div>)}
    </Frame>
  );
}

function PurchaseRegister({ from, to }: { from: string; to: string }) {
  interface R { rows: { id: number; invoiceDate: string; grnNo: string; invoiceNo: string; status: string; supplierName: string; supplierGstin: string | null; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }[]; totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number; n: number } }
  const q = useReport<R>('/reports/purchase-register', { from, to });
  return (
    <Frame q={q} onExport={() => q.data && downloadCsv(`purchase-register-${from}-${to}`, q.data.rows as unknown as Record<string, unknown>[])}>
      {q.data && (q.data.rows.length === 0 ? <EmptyState title="No purchase invoices in this period" /> : <div className="table-wrap"><table className="tbl dense"><thead><tr><th>Inv. date</th><th>GRN</th><th>Supplier invoice</th><th>Supplier</th><th>GSTIN</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total</th></tr></thead>
        <tbody>{q.data.rows.map((r) => <tr key={r.id} data-tone={r.status === 'cancelled' ? 'danger' : undefined}><td>{formatDateIN(r.invoiceDate)}</td><td><Link to="/purchases/$id" params={{ id: String(r.id) }} className="text-accent hover:underline">{r.grnNo}</Link></td><td>{r.invoiceNo}</td><td>{r.supplierName}</td><td className="text-xs">{r.supplierGstin ?? '—'}</td><td className="num"><Money paise={r.taxablePaise} /></td><td className="num"><Money paise={r.cgstPaise} /></td><td className="num"><Money paise={r.sgstPaise} /></td><td className="num"><Money paise={r.igstPaise} /></td><td className="num"><Money paise={r.totalPaise} /></td></tr>)}</tbody>
        <tfoot><tr className="font-semibold"><td colSpan={5} className="px-3 py-2">Total ({q.data.totals.n} posted)</td><td className="num px-3"><Money paise={q.data.totals.taxablePaise} /></td><td className="num px-3"><Money paise={q.data.totals.cgstPaise} /></td><td className="num px-3"><Money paise={q.data.totals.sgstPaise} /></td><td className="num px-3"><Money paise={q.data.totals.igstPaise} /></td><td className="num px-3"><Money paise={q.data.totals.totalPaise} /></td></tr></tfoot></table></div>)}
    </Frame>
  );
}

function Gstr1({ from, to }: { from: string; to: string }) {
  interface G { b2b: { invoiceNo: string; date: string; customerName: string | null; gstin: string | null; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }[]; b2cByRate: { ratePct: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }[]; hsnB2B: HsnRow[]; hsnB2C: HsnRow[]; creditNotes: { creditNoteNo: string; date: string; invoiceNo: string; gstin: string | null; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }[]; documents: { first: string | null; last: string | null; total: number; cancelled: number }; nilExempt: { taxablePaise: number } }
  interface HsnRow { hsn: string; ratePct: number; qtyUnits: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }
  const q = useReport<G>('/reports/gstr1', { from, to });
  const d = q.data;
  const HsnTable = ({ rows, title }: { rows: HsnRow[]; title: string }) => (
    <div className="card"><div className="flex items-center justify-between border-b border-border px-4 py-2"><h3 className="text-sm font-semibold">{title}</h3><Button size="sm" variant="ghost" onClick={() => downloadCsv(`${title.replace(/\W+/g, '-')}-${from}-${to}`, rows as unknown as Record<string, unknown>[])}>CSV</Button></div>
      {rows.length === 0 ? <p className="p-4 text-sm text-text-2">Nothing in this period.</p> : <table className="tbl dense"><thead><tr><th>HSN</th><th className="num">Rate</th><th className="num">Qty (units)</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.hsn}</td><td className="num">{r.ratePct}%</td><td className="num">{r.qtyUnits}</td><td className="num"><Money paise={r.taxablePaise} /></td><td className="num"><Money paise={r.cgstPaise} /></td><td className="num"><Money paise={r.sgstPaise} /></td><td className="num"><Money paise={r.igstPaise} /></td><td className="num"><Money paise={r.totalPaise} /></td></tr>)}</tbody></table>}</div>
  );
  return (
    <Frame q={q}>
      {d && <>
        <Callout tone="accent" title="How to use this">Figures follow GSTR-1 tables: B2B invoice-wise (Table 4), B2C rate-wise (Table 7), HSN summary split B2B / B2C (Table 12), credit notes (Table 9B) and the document series (Table 13). Share the CSVs with your accountant or key them into the portal.</Callout>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Documents issued" value={d.documents.total} sub={`${d.documents.first ?? '—'} → ${d.documents.last ?? '—'}`} /><Stat label="Cancelled" value={d.documents.cancelled} /><Stat label="Nil-rated / exempt" value={rupees(d.nilExempt.taxablePaise)} /><Stat label="B2B invoices" value={d.b2b.length} /></div>
        <div className="card"><div className="flex items-center justify-between border-b border-border px-4 py-2"><h3 className="text-sm font-semibold">B2C – rate-wise (Table 7)</h3></div><table className="tbl dense"><thead><tr><th>Rate</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th></tr></thead><tbody>{d.b2cByRate.map((r) => <tr key={r.ratePct}><td>{r.ratePct}%</td><td className="num"><Money paise={r.taxablePaise} /></td><td className="num"><Money paise={r.cgstPaise} /></td><td className="num"><Money paise={r.sgstPaise} /></td><td className="num"><Money paise={r.igstPaise} /></td></tr>)}</tbody></table></div>
        <div className="card"><div className="flex items-center justify-between border-b border-border px-4 py-2"><h3 className="text-sm font-semibold">B2B – invoice-wise (Table 4)</h3><Button size="sm" variant="ghost" onClick={() => downloadCsv(`gstr1-b2b-${from}-${to}`, d.b2b as unknown as Record<string, unknown>[])}>CSV</Button></div>{d.b2b.length === 0 ? <p className="p-4 text-sm text-text-2">No bills to GST-registered customers.</p> : <table className="tbl dense"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>GSTIN</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th><th className="num">Total</th></tr></thead><tbody>{d.b2b.map((r) => <tr key={r.invoiceNo}><td>{r.invoiceNo}</td><td>{formatDateIN(r.date)}</td><td>{r.customerName}</td><td>{r.gstin}</td><td className="num"><Money paise={r.taxablePaise} /></td><td className="num"><Money paise={r.cgstPaise} /></td><td className="num"><Money paise={r.sgstPaise} /></td><td className="num"><Money paise={r.igstPaise} /></td><td className="num"><Money paise={r.totalPaise} /></td></tr>)}</tbody></table>}</div>
        <HsnTable rows={d.hsnB2C} title="HSN summary – B2C (Table 12)" /><HsnTable rows={d.hsnB2B} title="HSN summary – B2B (Table 12)" />
        <div className="card"><div className="border-b border-border px-4 py-2"><h3 className="text-sm font-semibold">Credit notes (Table 9B)</h3></div>{d.creditNotes.length === 0 ? <p className="p-4 text-sm text-text-2">No credit notes.</p> : <table className="tbl dense"><thead><tr><th>Credit note</th><th>Date</th><th>Against</th><th>GSTIN</th><th className="num">Taxable</th><th className="num">Tax</th><th className="num">Total</th></tr></thead><tbody>{d.creditNotes.map((r) => <tr key={r.creditNoteNo}><td>{r.creditNoteNo}</td><td>{formatDateIN(r.date)}</td><td>{r.invoiceNo}</td><td>{r.gstin ?? 'B2C'}</td><td className="num"><Money paise={r.taxablePaise} /></td><td className="num"><Money paise={r.cgstPaise + r.sgstPaise + r.igstPaise} /></td><td className="num"><Money paise={r.totalPaise} /></td></tr>)}</tbody></table>}</div>
      </>}
    </Frame>
  );
}

function Gstr3b({ from, to }: { from: string; to: string }) {
  interface G { outward: { taxablePaise: number; exemptPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }; creditNotes: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }; itc: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }; itcReversalPaise: number; purchaseReturnsAsSupply: { taxablePaise: number; taxPaise: number } }
  const q = useReport<G>('/reports/gstr3b', { from, to });
  const d = q.data;
  return (
    <Frame q={q}>
      {d && <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4"><h3 className="mb-2 text-sm font-semibold">3.1 Outward supplies</h3><Tot label="Taxable outward (net of credit notes)" paise={d.outward.taxablePaise - d.creditNotes.taxablePaise} /><Tot label="Nil-rated / exempt" paise={d.outward.exemptPaise} /><Tot label="CGST" paise={d.outward.cgstPaise - d.creditNotes.cgstPaise} /><Tot label="SGST" paise={d.outward.sgstPaise - d.creditNotes.sgstPaise} /><Tot label="IGST" paise={d.outward.igstPaise - d.creditNotes.igstPaise} />{d.purchaseReturnsAsSupply.taxablePaise > 0 && <p className="mt-2 text-xs text-text-2">Includes returns to suppliers issued as our tax invoice: taxable {rupees(d.purchaseReturnsAsSupply.taxablePaise)}, tax {rupees(d.purchaseReturnsAsSupply.taxPaise)}.</p>}</div>
        <div className="card p-4"><h3 className="mb-2 text-sm font-semibold">4. Eligible ITC</h3><Tot label="Purchases (taxable value)" paise={d.itc.taxablePaise} /><Tot label="CGST" paise={d.itc.cgstPaise} /><Tot label="SGST" paise={d.itc.sgstPaise} /><Tot label="IGST" paise={d.itc.igstPaise} /><Tot label="ITC to reverse (expired-goods credit notes)" paise={-d.itcReversalPaise} /><p className="mt-2 text-xs text-text-2">Match against GSTR-2B before filing; ITC on goods later destroyed is blocked under s.17(5)(h).</p></div>
      </div>}
    </Frame>
  );
}

function StockReport() {
  interface S { id: number; name: string; genericText: string; rack: string | null; unitsPerPack: number; packName: string; baseUnit: string; minStockUnits: number; reorderQtyPacks: number; stockUnits: number; valueCostPaise: number; valueMrpPaise: number; sold30: number; lastSold: string | null; supplierName: string | null }
  const q = useReport<S[]>('/reports/stock', {});
  const rows = q.data ?? [];
  const low = rows.filter((r) => r.minStockUnits > 0 && r.stockUnits <= r.minStockUnits);
  return (
    <Frame q={q} onExport={() => downloadCsv('stock-summary', rows as unknown as Record<string, unknown>[])}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Items" value={rows.length} /><Stat label="Value at cost" value={rupees(rows.reduce((a, r) => a + r.valueCostPaise, 0))} /><Stat label="Value at MRP" value={rupees(rows.reduce((a, r) => a + r.valueMrpPaise, 0))} /><Stat label="Below minimum" value={low.length} tone={low.length ? 'warning' : 'success'} /></div>
      <div className="table-wrap"><table className="tbl dense"><thead><tr><th>Item</th><th>Rack</th><th className="num">Stock</th><th className="num">Min</th><th className="num">Sold 30 d</th><th>Last sold</th><th className="num">At cost</th><th className="num">At MRP</th><th>Suggested order</th></tr></thead>
        <tbody>{rows.map((r) => { const isLow = r.minStockUnits > 0 && r.stockUnits <= r.minStockUnits; const pack = { baseUnit: r.baseUnit, unitsPerPack: r.unitsPerPack, packName: r.packName, allowLoose: true }; return <tr key={r.id} data-tone={r.stockUnits === 0 ? 'danger' : isLow ? 'warning' : undefined}><td><Link to="/items/$id" params={{ id: String(r.id) }} className="font-medium text-accent hover:underline">{r.name}</Link><div className="text-xs text-text-2">{r.genericText}</div></td><td>{r.rack}</td><td className="num">{formatStock(r.stockUnits, pack)}{r.stockUnits === 0 && <Badge tone="danger" className="ml-1">Out</Badge>}{isLow && r.stockUnits > 0 && <Badge tone="warning" className="ml-1">Low</Badge>}</td><td className="num">{r.minStockUnits ? formatStock(r.minStockUnits, pack) : '—'}</td><td className="num">{r.sold30}</td><td>{r.lastSold ? formatDateIN(r.lastSold) : '—'}</td><td className="num"><Money paise={r.valueCostPaise} /></td><td className="num"><Money paise={r.valueMrpPaise} /></td><td>{isLow ? `${r.reorderQtyPacks || Math.ceil(r.minStockUnits * 2 / r.unitsPerPack)} ${r.packName}s${r.supplierName ? ` from ${r.supplierName}` : ''}` : '—'}</td></tr>; })}</tbody></table></div>
    </Frame>
  );
}

function ExpiryReport() {
  interface E { batchId: number; itemId: number; itemName: string; batchNo: string; expiryDate: string; status: string; qtyUnits: number; unitsPerPack: number; packName: string; baseUnit: string; mrpPaise: number; purchaseRatePaise: number; valueCostPaise: number; valueMrpPaise: number; supplierId: number | null; supplierName: string | null; daysLeft: number }
  const { store } = useAuth();
  const q = useReport<E[]>('/reports/expiry', { days: store?.nearExpiryDays ?? 90, includeExpired: true });
  const rows = q.data ?? [];
  const today = todayIST();
  const bySupplier = rows.reduce<Record<string, E[]>>((acc, r) => { (acc[r.supplierName ?? 'Unknown supplier'] ??= []).push(r); return acc; }, {});
  return (
    <Frame q={q} onExport={() => downloadCsv('near-expiry', rows as unknown as Record<string, unknown>[])}>
      <Callout tone="warning" title="Grouped by supplier for return claims">Most distributors accept expiry returns 3 to 6 months before expiry and cap them at a share of purchases. Send the list early. <Link to="/purchases/returns" className="font-medium text-accent underline">Create a return</Link>.</Callout>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><Stat label="Batches" value={rows.length} /><Stat label="Expired in stock" value={rows.filter((r) => r.daysLeft < 0).length} tone="danger" /><Stat label="Value at cost" value={rupees(rows.reduce((a, r) => a + r.valueCostPaise, 0))} /></div>
      {Object.entries(bySupplier).map(([sup, list]) => (
        <div key={sup} className="card"><div className="flex items-center justify-between border-b border-border px-4 py-2"><h3 className="text-sm font-semibold">{sup}</h3><span className="text-xs text-text-2">{list.length} batches · {rupees(list.reduce((a, r) => a + r.valueCostPaise, 0))} at cost</span></div>
          <table className="tbl dense"><thead><tr><th>Item</th><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th className="num">MRP</th><th className="num">At cost</th><th>Status</th></tr></thead><tbody>{list.map((r) => <tr key={r.batchId} data-tone={r.daysLeft < 0 ? 'danger' : r.daysLeft <= 30 ? 'warning' : undefined}><td><Link to="/items/$id" params={{ id: String(r.itemId) }} className="text-accent hover:underline">{r.itemName}</Link></td><td>{r.batchNo}</td><td><ExpiryBadge expiryDate={r.expiryDate} today={today} /></td><td className="num">{formatStock(r.qtyUnits, { baseUnit: r.baseUnit, unitsPerPack: r.unitsPerPack, packName: r.packName, allowLoose: true })}</td><td className="num"><Money paise={r.mrpPaise} /></td><td className="num"><Money paise={r.valueCostPaise} /></td><td><Badge tone={r.status === 'quarantined' ? 'warning' : 'neutral'}>{r.status}</Badge></td></tr>)}</tbody></table></div>
      ))}
    </Frame>
  );
}

function DeadStock() {
  interface S { id: number; name: string; genericText: string; rack: string | null; unitsPerPack: number; packName: string; baseUnit: string; stockUnits: number; valueCostPaise: number; lastSold: string | null }
  const q = useReport<S[]>('/reports/dead-stock', { days: 90 });
  const rows = q.data ?? [];
  return (
    <Frame q={q} onExport={() => downloadCsv('dead-stock', rows as unknown as Record<string, unknown>[])}>
      <Callout tone="accent">Items with stock but no sale in the last 90 days. Consider returning to the supplier, offering a substitute, or lowering the reorder level.</Callout>
      {rows.length === 0 ? <EmptyState title="No dead stock" /> : <div className="table-wrap"><table className="tbl dense"><thead><tr><th>Item</th><th>Rack</th><th className="num">Stock</th><th>Last sold</th><th className="num">Value at cost</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><Link to="/items/$id" params={{ id: String(r.id) }} className="text-accent hover:underline">{r.name}</Link><div className="text-xs text-text-2">{r.genericText}</div></td><td>{r.rack}</td><td className="num">{formatStock(r.stockUnits, { baseUnit: r.baseUnit, unitsPerPack: r.unitsPerPack, packName: r.packName, allowLoose: true })}</td><td>{r.lastSold ? formatDateIN(r.lastSold) : 'Never'}</td><td className="num"><Money paise={r.valueCostPaise} /></td></tr>)}</tbody></table></div>}
    </Frame>
  );
}

function Profit({ from, to, group, onGroup }: { from: string; to: string; group: string; onGroup: (g: string) => void }) {
  interface P { key: string; bills: number; qtyUnits: number; revenuePaise: number; costPaise: number; discountPaise: number; marginPaise: number; marginPct: number }
  const q = useReport<P[]>('/reports/profit', { from, to, group });
  const rows = q.data ?? [];
  const rev = rows.reduce((a, r) => a + r.revenuePaise, 0), cost = rows.reduce((a, r) => a + r.costPaise, 0);
  return (
    <Frame q={q} onExport={() => downloadCsv(`profit-by-${group}-${from}-${to}`, rows as unknown as Record<string, unknown>[])}>
      <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Group by <NativeSelect dense value={group} onChange={(e) => onGroup(e.target.value)} className="ml-2 inline-block w-40">{['item', 'salt', 'supplier', 'customer', 'doctor', 'user', 'day'].map((g) => <option key={g} value={g}>{g}</option>)}</NativeSelect></label></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Revenue (taxable)" value={rupees(rev)} /><Stat label="Cost of goods" value={rupees(cost)} /><Stat label="Gross margin" value={rupees(rev - cost)} tone="success" /><Stat label="Margin %" value={rev ? `${Math.round(((rev - cost) / rev) * 1000) / 10}%` : '—'} /></div>
      <div className="table-wrap"><table className="tbl dense"><thead><tr><th className="capitalize">{group}</th><th className="num">Bills</th><th className="num">Units</th><th className="num">Revenue</th><th className="num">Cost</th><th className="num">Discount given</th><th className="num">Margin</th><th className="num">Margin %</th></tr></thead><tbody>{rows.map((r) => <tr key={r.key}><td>{group === 'day' ? formatDateIN(r.key) : r.key}</td><td className="num">{r.bills}</td><td className="num">{r.qtyUnits}</td><td className="num"><Money paise={r.revenuePaise} /></td><td className="num"><Money paise={r.costPaise} /></td><td className="num"><Money paise={r.discountPaise} /></td><td className="num"><Money paise={r.marginPaise} /></td><td className="num">{r.marginPct}%</td></tr>)}</tbody></table></div>
    </Frame>
  );
}

function Outstanding() {
  interface O { customers: { id: number; name: string; phone: string; balancePaise: number; lastDate: string | null }[]; suppliers: { id: number; name: string; phone: string | null; balancePaise: number; lastDate: string | null }[] }
  const q = useReport<O>('/reports/outstanding', {});
  const d = q.data;
  return (
    <Frame q={q}>
      {d && <div className="grid gap-4 md:grid-cols-2">
        <div className="card"><div className="flex items-center justify-between border-b border-border px-4 py-2"><h3 className="text-sm font-semibold">Customers owing us</h3><span className="text-sm font-medium">{rupees(d.customers.reduce((a, c) => a + c.balancePaise, 0))}</span></div>{d.customers.length === 0 ? <p className="p-4 text-sm text-text-2">No dues.</p> : <table className="tbl dense"><thead><tr><th>Customer</th><th>Phone</th><th>Last activity</th><th className="num">Due</th></tr></thead><tbody>{d.customers.map((c) => <tr key={c.id}><td><Link to="/customers" search={{ id: c.id }} className="text-accent hover:underline">{c.name}</Link></td><td>{c.phone}</td><td>{c.lastDate ? formatDateIN(c.lastDate) : '—'}</td><td className="num"><Money paise={c.balancePaise} /></td></tr>)}</tbody></table>}</div>
        <div className="card"><div className="flex items-center justify-between border-b border-border px-4 py-2"><h3 className="text-sm font-semibold">Payable to suppliers</h3><span className="text-sm font-medium">{rupees(d.suppliers.reduce((a, c) => a + c.balancePaise, 0))}</span></div>{d.suppliers.length === 0 ? <p className="p-4 text-sm text-text-2">Nothing payable.</p> : <table className="tbl dense"><thead><tr><th>Supplier</th><th>Phone</th><th>Last activity</th><th className="num">Payable</th></tr></thead><tbody>{d.suppliers.map((c) => <tr key={c.id}><td><Link to="/suppliers" search={{ id: c.id }} className="text-accent hover:underline">{c.name}</Link></td><td>{c.phone}</td><td>{c.lastDate ? formatDateIN(c.lastDate) : '—'}</td><td className="num"><Money paise={c.balancePaise} /></td></tr>)}</tbody></table>}</div>
      </div>}
    </Frame>
  );
}

function ScheduleSales({ from, to }: { from: string; to: string }) {
  const q = useReport<{ schedule: string; lines: number; qtyUnits: number; netPaise: number }[]>('/reports/schedule-sales', { from, to });
  const rows = q.data ?? [];
  const label: Record<string, string> = { NONE: 'Non-scheduled', G: 'Schedule G', H: 'Schedule H', H1: 'Schedule H1', X: 'Schedule X' };
  return (
    <Frame q={q}>
      <Callout tone="accent">Volumes by schedule. H1 and X sales must each have a register entry; open <Link to="/registers" className="font-medium text-accent underline">Schedule registers</Link> to review or print them.</Callout>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>Schedule</th><th className="num">Lines</th><th className="num">Units</th><th className="num">Net sales</th></tr></thead><tbody>{rows.map((r) => <tr key={r.schedule}><td>{label[r.schedule] ?? r.schedule}</td><td className="num">{r.lines}</td><td className="num">{r.qtyUnits}</td><td className="num"><Money paise={r.netPaise} /></td></tr>)}</tbody></table></div>
    </Frame>
  );
}

export { formatExpiry };
