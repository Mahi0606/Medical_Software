import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Printer, Search, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { roundHalfUp, splitExclusive } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { cn, daysBetween, formatStock, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, Dialog, EmptyState, ExpiryBadge, Field, Input, Money, NativeSelect, PageHeader, Spinner, Switch, Textarea } from '@/components/ui';
import { BATCH_STATUS_LABEL, describeError, packOf, paiseToRupee, rupeeToPaise, type BatchRow, type DescribedError } from '../items/item-shared';
import { RETURN_REASON_LABEL, printReturnNote, type PurchaseReturnDetail, type StoreInfo } from './return-note';
import { SupplierPicker, useSupplier, type Supplier } from './supplier-picker';

type Reason = 'expired' | 'near_expiry' | 'damaged' | 'excess' | 'recall' | 'other';
type Route = 'credit_note' | 'supply_invoice';
type Quick = 'expired' | 'expiring' | 'all';
interface Pick { qtyUnits: string; rate: string; reason: Reason }

export function PurchaseReturnPage() {
  const search = useSearch({ from: '/app/purchases/returns' });
  const nav = useNavigate();
  const { store } = useAuth();
  const toast = useToast();
  const today = todayIST();
  const nearDays = store?.nearExpiryDays ?? 90;
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState(today);
  const [route, setRoute] = useState<Route>('credit_note');
  const [supplierRef, setSupplierRef] = useState('');
  const [notes, setNotes] = useState('');
  const [allSuppliers, setAllSuppliers] = useState(false);
  const [quick, setQuick] = useState<Quick>('all');
  const [q, setQ] = useState('');
  const [picks, setPicks] = useState<Map<number, Pick>>(new Map());
  const [extra, setExtra] = useState<BatchRow[]>([]);
  const [error, setError] = useState<DescribedError | null>(null);
  const [done, setDone] = useState<PurchaseReturnDetail | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const prefill = useSupplier(search.supplierId);
  useEffect(() => { if (prefill.data && !supplier) setSupplier(prefill.data); }, [prefill.data, supplier]);
  const storeInfo = useQuery({ queryKey: ['store'], queryFn: () => api.get<StoreInfo>('/store') });

  const batches = useQuery({
    queryKey: ['batches', 'return-candidates', allSuppliers ? null : supplier?.id, q],
    queryFn: () => api.get<{ rows: BatchRow[] }>('/batches', { supplierId: allSuppliers ? undefined : supplier?.id, inStock: true, pageSize: 500, q: q || undefined }),
    enabled: allSuppliers || !!supplier,
  });
  // Preselect ?batchId= (from an item page or the inventory list) even if it belongs to a different filter.
  const preselected = useRef(false);
  useEffect(() => {
    if (!search.batchId || preselected.current) return;
    preselected.current = true;
    api.get<BatchRow>(`/batches/${search.batchId}`).then((b) => {
      setExtra([b]);
      setPicks((m) => new Map(m).set(b.id, defaultPick(b, today, nearDays)));
      if (!supplier && !search.supplierId && b.supplierId) api.get<Supplier>(`/suppliers/${b.supplierId}`).then(setSupplier).catch(() => undefined);
    }).catch(() => toast.warn('Could not load the batch to preselect'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.batchId]);

  const rows = useMemo(() => {
    const list = [...(batches.data?.rows ?? [])];
    for (const e of extra) if (!list.some((b) => b.id === e.id)) list.unshift(e);
    return list.filter((b) => b.qtyUnits > 0 && b.status !== 'returned' && b.status !== 'disposed').filter((b) => {
      const d = daysBetween(today, b.expiryDate);
      return quick === 'all' || (quick === 'expired' ? d < 0 : d >= 0 && d <= nearDays) || picks.has(b.id);
    });
  }, [batches.data, extra, quick, today, nearDays, picks]);

  const interstate = !!supplier?.stateCode && !!store?.stateCode && supplier.stateCode !== store.stateCode;
  const byId = useMemo(() => new Map([...(batches.data?.rows ?? []), ...extra].map((b) => [b.id, b])), [batches.data, extra]);
  const summary = useMemo(() => {
    let taxable = 0, cgst = 0, sgst = 0, igst = 0, n = 0;
    for (const [id, p] of picks) {
      const b = byId.get(id); const qty = Math.floor(Number(p.qtyUnits) || 0);
      if (!b || qty <= 0) continue;
      const rate = rupeeToPaise(p.rate);
      const split = splitExclusive(roundHalfUp((rate * qty) / b.unitsPerPack), b.gstRatePct, interstate);
      taxable += split.taxablePaise; cgst += split.cgstPaise; sgst += split.sgstPaise; igst += split.igstPaise; n++;
    }
    const tax = cgst + sgst + igst;
    return { n, taxable, cgst, sgst, igst, tax, total: taxable + tax, itc: route === 'credit_note' ? tax : 0 };
  }, [picks, byId, interstate, route]);

  const toggle = (b: BatchRow, on: boolean) => setPicks((m) => { const n = new Map(m); if (on) n.set(b.id, defaultPick(b, today, nearDays)); else n.delete(b.id); return n; });
  const patch = (id: number, p: Partial<Pick>) => setPicks((m) => { const n = new Map(m); const cur = n.get(id); if (cur) n.set(id, { ...cur, ...p }); return n; });

  const post = useMutation({
    mutationFn: () => api.post<PurchaseReturnDetail>('/purchase-returns', {
      supplierId: supplier!.id, date, route, supplierRef: supplierRef.trim() || null, notes: notes.trim() || null,
      lines: [...picks].map(([batchId, p]) => ({ batchId, qtyUnits: Math.floor(Number(p.qtyUnits) || 0), ratePaise: rupeeToPaise(p.rate), reason: p.reason })).filter((l) => l.qtyUnits > 0),
    }),
    onSuccess: (r) => { setDone(r); setPicks(new Map()); },
    onError: (e) => { setError(describeError(e)); setTimeout(() => errorRef.current?.focus(), 0); },
  });
  const submit = () => {
    const problems: { path: string; message: string }[] = [];
    if (!supplier) problems.push({ path: 'Supplier', message: 'choose the supplier the goods go back to' });
    if (!date) problems.push({ path: 'Date', message: 'required' });
    const lines = [...picks].filter(([, p]) => Math.floor(Number(p.qtyUnits) || 0) > 0);
    if (lines.length === 0) problems.push({ path: 'Batches', message: 'tick at least one batch and enter the units to return' });
    for (const [id, p] of lines) { const b = byId.get(id); const qty = Math.floor(Number(p.qtyUnits)); if (b && qty > b.qtyUnits) problems.push({ path: `${b.itemName} ${b.batchNo}`, message: `only ${b.qtyUnits} units in stock` }); }
    if (problems.length) { setError({ title: 'Before posting', fields: problems }); setTimeout(() => errorRef.current?.focus(), 0); return; }
    setError(null); post.mutate();
  };

  return (
    <div>
      <PageHeader title="Return to supplier" description="Send expired, damaged or excess stock back. Stock leaves the batch immediately and the GST paperwork is created."
        actions={<Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav({ to: '/purchases', search: { tab: 'returns' } })}>All returns</Button>} />
      {error && <div ref={errorRef} tabIndex={-1} className="mb-3 outline-none"><Callout tone="danger" title={error.title}>{error.detail}{error.fields.length > 0 && <ul className="list-disc pl-5">{error.fields.map((f, i) => <li key={i}>{f.path ? <><span className="font-medium">{f.path}</span>: </> : null}{f.message}</li>)}</ul>}</Callout></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card p-4" aria-labelledby="h-sup">
            <h2 id="h-sup" className="text-base">1. Supplier and route</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Supplier" required hint={interstate ? `Inter-state supply (${supplier?.stateCode} → ${store?.stateCode}): IGST applies.` : undefined}>{(id) => <SupplierPicker id={id} value={supplier} onChange={(s) => { setSupplier(s); if (!allSuppliers) setPicks(new Map()); }} allowClear />}</Field>
              <Field label="Return date" required>{(id) => <Input id={id} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />}</Field>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-medium">GST route <span className="font-normal text-text-2">(both follow CBIC Circular 72/46/2018-GST)</span></legend>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  {([
                    { id: 'credit_note' as Route, title: 'Supplier issues credit note (we reverse ITC)', body: 'Usual for expired or near-expiry stock. We send a return note; the supplier issues a credit note and we reverse the input tax credit taken on these goods.' },
                    { id: 'supply_invoice' as Route, title: 'We issue a return tax invoice (supplier claims ITC)', body: 'We raise a tax invoice for the goods going back and pay output tax; the supplier takes the credit. Use when the supplier asks for it.' },
                  ]).map((o) => (
                    <label key={o.id} className={cn('flex cursor-pointer gap-3 rounded-md border p-3 text-sm', route === o.id ? 'border-accent bg-accent-bg' : 'border-border hover:bg-surface-2')}>
                      <input type="radio" name="route" className="mt-1 h-4 w-4 shrink-0" checked={route === o.id} onChange={() => setRoute(o.id)} />
                      <span><span className="block font-medium">{o.title}</span><span className="block text-xs text-text-2">{o.body}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Supplier reference" hint="Their return authorisation / debit note number, if any.">{(id, d) => <Input id={id} aria-describedby={d} value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />}</Field>
              <Field label="Notes">{(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />}</Field>
            </div>
          </section>

          <section className="card p-4" aria-labelledby="h-bat">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="h-bat" className="text-base">2. Batches to return</h2>
              <div role="radiogroup" aria-label="Quick filter" className="ml-auto flex gap-1">
                {([['expired', 'Expired'], ['expiring', `Expiring ≤ ${nearDays} d`], ['all', 'All in stock']] as [Quick, string][]).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={quick === k} onClick={() => setQuick(k)} className={cn('h-9 rounded-full border px-3 text-xs font-medium', quick === k ? 'border-accent bg-accent-bg text-accent' : 'border-border text-text-2 hover:bg-surface-2')}>{l}</button>)}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item or batch no" aria-label="Search batches" addonStart={<Search className="h-4 w-4" />} className="w-64" />
              <div className="flex items-center gap-2"><Switch id="all-sup" checked={allSuppliers} onCheckedChange={setAllSuppliers} /><label htmlFor="all-sup" className="text-sm">Show batches from all suppliers</label></div>
            </div>
            {!supplier && !allSuppliers ? <p className="mt-4 text-sm text-text-2">Choose a supplier to see the batches bought from them, or switch on “all suppliers”.</p> : batches.isLoading ? <div className="mt-4"><Spinner /></div> : batches.isError ? <Callout tone="danger" className="mt-4" title="Could not load batches">{describeError(batches.error).title}</Callout> : rows.length === 0 ? (
              <EmptyState icon={Undo2} title={quick === 'expired' ? 'No expired stock from this supplier' : quick === 'expiring' ? `Nothing expiring within ${nearDays} days` : 'No stock from this supplier'}>{allSuppliers ? 'Try another filter.' : 'Switch on “all suppliers” if the batch was bought elsewhere.'}</EmptyState>
            ) : (
              <div className="mt-3 overflow-auto">
                <table className="tbl dense min-w-215">
                  <thead><tr><th className="w-10"><span className="sr-only">Select</span></th><th>Item</th><th>Batch</th><th>Expiry</th><th className="num">In stock</th><th className="w-28">Units to return</th><th className="w-32">Rate ₹ / pack</th><th className="w-36">Reason</th></tr></thead>
                  <tbody>{rows.map((b) => {
                    const p = picks.get(b.id);
                    const d = daysBetween(today, b.expiryDate);
                    const qty = Math.floor(Number(p?.qtyUnits) || 0);
                    return (
                      <tr key={b.id} data-state={p ? 'selected' : undefined} data-tone={!p && d < 0 ? 'danger' : !p && d <= nearDays ? 'warning' : undefined}>
                        <td><input type="checkbox" className="h-4 w-4" aria-label={`Return ${b.itemName} batch ${b.batchNo}`} checked={!!p} onChange={(e) => toggle(b, e.target.checked)} /></td>
                        <td><span className="font-medium">{b.itemName}</span>{b.status === 'quarantined' && <Badge tone="warning" className="ml-1">{BATCH_STATUS_LABEL[b.status]}</Badge>}<div className="text-[11px] text-text-2">{b.supplierName ?? 'Supplier unknown'} · GST {b.gstRatePct}%</div></td>
                        <td>{b.batchNo}</td>
                        <td><ExpiryBadge expiryDate={b.expiryDate} today={today} /></td>
                        <td className="num">{formatStock(b.qtyUnits, packOf(b))}<div className="text-[11px] text-text-2">{b.qtyUnits} {b.baseUnit}s</div></td>
                        <td>{p && <><Input dense type="number" min={1} max={b.qtyUnits} inputMode="numeric" aria-label={`Units of ${b.itemName} ${b.batchNo} to return`} value={p.qtyUnits} invalid={qty > b.qtyUnits || qty <= 0} onChange={(e) => patch(b.id, { qtyUnits: e.target.value })} />{qty > b.qtyUnits && <p role="alert" className="mt-0.5 text-[11px] text-danger">Max {b.qtyUnits}</p>}</>}</td>
                        <td>{p && <Input dense type="number" step="0.01" min={0} inputMode="decimal" aria-label={`Rate per pack for ${b.itemName} ${b.batchNo}`} value={p.rate} onChange={(e) => patch(b.id, { rate: e.target.value })} />}</td>
                        <td>{p && <NativeSelect dense aria-label={`Reason for ${b.itemName} ${b.batchNo}`} value={p.reason} onChange={(e) => patch(b.id, { reason: e.target.value as Reason })}>{(Object.keys(RETURN_REASON_LABEL) as Reason[]).map((r) => <option key={r} value={r}>{RETURN_REASON_LABEL[r]}</option>)}</NativeSelect>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-16 lg:self-start" aria-labelledby="h-sum">
          <div className="card p-4 text-sm">
            <h2 id="h-sum" className="text-base">3. Summary</h2>
            <div className="mt-3 grid grid-cols-2 gap-y-1" aria-live="polite">
              <span className="text-text-2">Batches</span><span className="num">{summary.n}</span>
              <span className="text-text-2">Taxable</span><Money paise={summary.taxable} />
              {interstate ? <><span className="text-text-2">IGST</span><Money paise={summary.igst} /></> : <><span className="text-text-2">CGST</span><Money paise={summary.cgst} /><span className="text-text-2">SGST</span><Money paise={summary.sgst} /></>}
              <span className="font-semibold">Total</span><span className="num text-lg font-semibold">{rupees(summary.total)}</span>
              {route === 'credit_note' && <><span className="text-text-2">ITC to reverse</span><Money paise={summary.itc} className="text-warning" /></>}
            </div>
            <p className="mt-2 border-t border-border pt-2 text-xs text-text-2">Figures are indicative; the server recomputes them when posting. Quarantined and expired batches with no stock left are closed automatically.</p>
            <Button variant="primary" size="lg" className="mt-3 w-full" loading={post.isPending} onClick={submit} icon={<Undo2 className="h-5 w-5" />}>Post return{summary.total > 0 ? ` · ${rupees(summary.total)}` : ''}</Button>
          </div>
        </aside>
      </div>

      {done && (
        <Dialog open onOpenChange={(o) => { if (!o) { setDone(null); nav({ to: '/purchases', search: { tab: 'returns' } }); } }} title={`Return ${done.docNo ?? ''} posted`} description={`${done.supplierName} · ${rupees(done.totalPaise)}${done.route === 'credit_note' ? ` · ITC to reverse ${rupees(done.itcReversalPaise)}` : ''}`}
          footer={<><Button variant="ghost" onClick={() => { setDone(null); nav({ to: '/purchases', search: { tab: 'returns' } }); }}>Back to purchases</Button><Button variant="primary" icon={<Printer className="h-4 w-4" />} disabled={!storeInfo.data} onClick={() => storeInfo.data && printReturnNote(done, storeInfo.data)}>Print return note</Button></>}>
          <p className="text-sm text-text-2">{done.lines.length} {done.lines.length === 1 ? 'batch' : 'batches'} left stock. {done.route === 'credit_note' ? 'Hand the return note to the supplier and record their credit note against the account when it arrives.' : 'Give the return invoice to the supplier; it is a tax invoice for the goods going back.'}</p>
        </Dialog>
      )}
    </div>
  );
}

function defaultPick(b: BatchRow, today: string, nearDays: number): Pick {
  const d = daysBetween(today, b.expiryDate);
  return { qtyUnits: String(b.qtyUnits), rate: paiseToRupee(b.purchaseRatePaise) || '0', reason: d < 0 ? 'expired' : d <= nearDays ? 'near_expiry' : 'excess' };
}
