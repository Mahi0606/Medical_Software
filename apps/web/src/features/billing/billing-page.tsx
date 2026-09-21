import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eraser, FilePlus2, MessageCircle, PauseCircle, Percent, Printer, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Schedule } from '@pharma/shared';
import { api } from '@/lib/api';
import { data, enqueueOfflineSale, getSnapStore, isNetworkError, type LocalPostResult } from '@/lib/offline';
import { InteractionCallouts, useInteractionCheck } from './interaction-panel';
import { InvoicePrint, type PrintSale, type PrintStore } from '../sales/invoice-print';
import { useAuth } from '@/lib/auth';
import { localDb } from '@/lib/db';
import { useHotkeys } from '@/lib/hotkeys';
import { useScanner } from '@/lib/scanner';
import { useToast } from '@/lib/toast';
import { cn, formatStock, newClientRef, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, Dialog, ExpiryBadge, Input, Money, ScheduleBadge } from '@/components/ui';
import { computeTotals, newBill, reducer, toSalePayload, type BillState, type CartLine } from './billing-state';
import { ItemSearch, tallManText, type BatchRow, type ItemRow, type ItemSearchHandle } from './item-search';
import { CustomerBar, describeApiError, HoldsSheet, PaymentPanel, PriceOverride, RxPanel, type HoldRow } from './panels';

const DRAFT_KEY = 'current';

export function BillingPage() {
  const { store, pharmacistOnDuty, user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const search = useSearch({ from: '/app/billing' });
  const [state, dispatch] = useReducer(reducer, undefined, () => newBill(newClientRef()));
  const [error, setError] = useState<ReturnType<typeof describeApiError> | null>(null);
  const [holdsOpen, setHoldsOpen] = useState(false);
  const [done, setDone] = useState<{ id: number; invoiceNo: string; totalPaise: number; changePaise: number; creditPaise: number; phone: string | null; warnings: { message: string }[]; offline?: boolean } | null>(null);
  const [restored, setRestored] = useState(false);
  const [priceEdit, setPriceEdit] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [overrideReason, setOverrideReason] = useState<string | null>(null);
  const [offlinePrint, setOfflinePrint] = useState<{ sale: PrintSale; store: PrintStore } | null>(null);
  const messaging = useQuery({ queryKey: ['messages-status'], queryFn: () => api.get<{ configured: boolean }>('/messages/status').catch(() => ({ configured: false })), staleTime: 300_000 });
  const searchRef = useRef<ItemSearchHandle>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const cashRef = useRef<HTMLInputElement>(null);
  const billDiscRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const today = todayIST();
  const scheme = store?.gstScheme ?? 'regular';
  const totals = useMemo(() => computeTotals(state, scheme, pharmacistOnDuty), [state, scheme, pharmacistOnDuty]);
  const cap = user?.role === 'owner' ? 100 : user?.role === 'pharmacist' ? (store?.maxDiscountPctPharmacist ?? 20) : (store?.maxDiscountPctClerk ?? 10);
  const interactions = useInteractionCheck(state.lines, state.customer?.id ?? null);
  useEffect(() => { if (!interactions.hasMajor) setOverrideReason(null); }, [interactions.hasMajor]);

  // ---- drafts: restore on mount, autosave on change
  const loadedRef = useRef(false);
  useEffect(() => {
    (async () => {
      if (search.resume) {
        const local = await localDb.drafts.get(search.resume);
        if (local) { dispatch({ type: 'load', state: local.payload as BillState }); loadedRef.current = true; return; }
        const holds = await api.get<HoldRow[]>('/holds');
        const h = holds.find((x) => x.clientRef === search.resume);
        if (h) dispatch({ type: 'load', state: h.payload as BillState });
      } else if (search.rebill) {
        await rebill(search.rebill);
      } else {
        const d = await localDb.drafts.get(DRAFT_KEY);
        if (d && (d.payload as BillState).lines.length > 0) { dispatch({ type: 'load', state: d.payload as BillState }); setRestored(true); }
      }
      loadedRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!loadedRef.current) return;
    const t = setTimeout(() => { void localDb.drafts.put({ clientRef: DRAFT_KEY, updatedAt: Date.now(), payload: state }); }, 300);
    return () => clearTimeout(t);
  }, [state]);

  const rebill = async (saleId: number) => {
    const s = await api.get<{ customerId: number | null; lines: { itemId: number; qty: number; unitMode: 'pack' | 'unit' }[]; customerName: string | null; customerPhone: string | null }>(`/sales/${saleId}`);
    for (const l of s.lines) {
      const batches = await api.get<BatchRow[]>(`/items/${l.itemId}/batches`);
      const b = batches.find((x) => x.expiryDate >= today && x.qtyUnits > 0);
      if (b) addBatch(b, l.unitMode, l.qty); else toast.warn(`${batches[0]?.itemName ?? 'An item'} is out of stock and was skipped`);
    }
    if (s.customerId) { const c = await api.get<Parameters<typeof CustomerBar>[0]['customer']>(`/customers/${s.customerId}`); if (c) dispatch({ type: 'customer', customer: c }); }
    else dispatch({ type: 'quickCustomer', name: s.customerName ?? '', phone: s.customerPhone ?? '' });
  };

  const addBatch = useCallback((b: BatchRow, unitMode: 'pack' | 'unit' = 'pack', qty = 1) => {
    setError(null);
    dispatch({ type: 'addLine', unitMode, qty, line: {
      batchId: b.id, itemId: b.itemId, itemName: b.itemName, genericText: b.genericText, manufacturer: b.manufacturer, batchNo: b.batchNo, expiryDate: b.expiryDate, mrpPaise: b.mrpPaise, unitsPerPack: b.unitsPerPack, packName: b.packName, baseUnit: b.baseUnit,
      allowLoose: b.allowLoose, schedule: b.schedule as Schedule, gstRatePct: b.gstRatePct, availableUnits: b.qtyUnits, rack: b.rack, purchaseRatePaise: b.purchaseRatePaise,
    } });
  }, []);

  const onPick = (b: BatchRow, _item: ItemRow) => addBatch(b, 'pack', 1);

  // ---- scanner
  const scan = useMutation({
    mutationFn: (raw: string) => data.resolveScan(raw) as Promise<{ scan: { kind: string }; item: { id: number; name: string } | null; batch: BatchRow | null; batches: BatchRow[]; message: string }>,
    onSuccess: (r) => {
      if (r.batch && r.batch.qtyUnits > 0 && r.batch.expiryDate >= today) { addBatch(r.batch); return; }
      const fefo = r.batches.find((b) => b.qtyUnits > 0 && b.expiryDate >= today);
      if (fefo) { addBatch(fefo); if (r.batch) toast.info('Scanned batch is not sellable; FEFO batch added instead'); return; }
      toast.warn(r.item ? `${r.item.name}: no sellable stock` : 'Barcode not recognised', r.message);
    },
    onError: (e: Error) => toast.error('Scan failed', e.message),
  });
  useScanner((code) => scan.mutate(code));

  // ---- holds
  const serverHolds = useQuery({ queryKey: ['holds'], queryFn: () => api.get<HoldRow[]>('/holds'), enabled: holdsOpen });
  const localDrafts = useLiveQuery(() => localDb.drafts.where('clientRef').notEqual(DRAFT_KEY).toArray(), []) ?? [];
  const holds: HoldRow[] = [...(serverHolds.data ?? []).map((h) => ({ ...h, source: 'server' as const })), ...localDrafts.map((d) => ({ clientRef: d.clientRef, label: d.label ?? null, updatedAt: d.updatedAt, payload: d.payload, source: 'local' as const }))];
  const hold = useMutation({
    mutationFn: async () => {
      const label = state.customer?.name || state.customerName || state.lines[0]?.itemName || 'Held bill';
      try { await api.put('/holds', { clientRef: state.clientRef, label, payload: state }); } catch { await localDb.drafts.put({ clientRef: state.clientRef, updatedAt: Date.now(), payload: state, label }); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['holds'] }); toast.success('Bill put on hold'); startNew(); },
  });
  const resumeHold = async (h: HoldRow) => {
    dispatch({ type: 'load', state: h.payload as BillState }); setHoldsOpen(false);
    if (h.source === 'local') await localDb.drafts.delete(h.clientRef); else { await api.del(`/holds/${h.clientRef}`); qc.invalidateQueries({ queryKey: ['holds'] }); }
  };
  const deleteHold = async (h: HoldRow) => { if (h.source === 'local') await localDb.drafts.delete(h.clientRef); else { await api.del(`/holds/${h.clientRef}`); qc.invalidateQueries({ queryKey: ['holds'] }); } };

  // ---- post
  const post = useMutation({
    mutationFn: async (): Promise<{ id: number; invoiceNo: string; totalPaise: number; creditPaise: number; changePaise?: number; customerPhone: string | null; duplicate: boolean; warnings: { message: string }[]; offline?: boolean }> => {
      const payload = toSalePayload(state, totals, getCounter(), overrideReason);
      const phone = state.customer?.phone ?? state.customerPhone ?? null;
      try {
        if (!navigator.onLine) throw new TypeError('Failed to fetch');
        return await api.post('/sales', payload);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        // Network is down: keep the bill on this device and print from local data.
        const snapStore = (await getSnapStore()) as PrintStore | undefined;
        if (!snapStore) throw new Error('No connection and no offline copy on this device yet. Reconnect once to download it (Offline & sync page).');
        const printable = buildLocalPrintSale(state, totals, snapStore);
        const r: LocalPostResult = await enqueueOfflineSale(payload as unknown as Record<string, unknown>, printable, totals, phone, totals.lines.map((l) => ({ batchId: state.lines.find((x) => x.key === l.key)!.batchId, qtyUnits: l.qtyUnits })));
        setOfflinePrint({ sale: { ...printable, invoiceNo: r.invoiceNo }, store: snapStore });
        return { ...r, customerPhone: phone };
      }
    },
    onSuccess: async (s) => {
      await localDb.drafts.delete(DRAFT_KEY);
      if (!s.offline) { api.del(`/holds/${state.clientRef}`).catch(() => undefined); qc.invalidateQueries({ queryKey: ['dashboard'] }); }
      qc.invalidateQueries({ queryKey: ['items-search'] }); qc.invalidateQueries({ queryKey: ['item-batches'] });
      setDone({ id: s.id, invoiceNo: s.invoiceNo, totalPaise: s.totalPaise, changePaise: s.changePaise ?? totals.changePaise, creditPaise: s.creditPaise, phone: s.customerPhone, warnings: s.warnings ?? [], offline: s.offline });
    },
    onError: (e) => { setError(describeApiError(e)); setTimeout(() => errorRef.current?.focus(), 0); },
  });
  const canPost = state.lines.length > 0 && !post.isPending && !totals.lines.some((l) => l.overStock) && !(interactions.hasMajor && !overrideReason);
  const submit = () => {
    if (!canPost) return;
    if (totals.missingRx.length) { setError({ title: `Schedule ${totals.schedule} bill needs: ${totals.missingRx.join(', ')}` }); setTimeout(() => errorRef.current?.focus(), 0); return; }
    if (totals.creditPaise > 0 && !state.customer) { setError({ title: `${rupees(totals.creditPaise)} is unpaid. Take the full payment or pick a customer to record it as credit.` }); phoneRef.current?.focus(); return; }
    post.mutate();
  };
  const startNew = () => { dispatch({ type: 'reset', clientRef: newClientRef() }); setError(null); setDone(null); setRestored(false); setOverrideReason(null); setOfflinePrint(null); void localDb.drafts.delete(DRAFT_KEY); searchRef.current?.clear(); setTimeout(() => searchRef.current?.focus(), 0); };

  const sendWhatsApp = async (d: NonNullable<typeof done>) => {
    if (messaging.data?.configured && !d.offline && d.id > 0) {
      try { await api.post(`/messages/bill/${d.id}`); toast.success('Bill sent on WhatsApp'); return; } catch (e) { toast.warn('Could not queue the WhatsApp message', (e as Error).message); }
    }
    window.open(whatsappUrl(d.phone!, `${store?.name}: your bill ${d.invoiceNo} for ${rupees(d.totalPaise)} is ready. Thank you!`), '_blank');
  };

  // ---- hotkeys (Marg-compatible where the browser allows); handlers read the latest totals through a ref
  const totalsRef = useRef(totals); totalsRef.current = totals;
  const submitRef = useRef(submit); submitRef.current = submit;
  useHotkeys(useMemo(() => [
    { key: 'F2', handler: () => searchRef.current?.focus(), description: 'Search' },
    { key: 'F4', handler: () => billDiscRef.current?.focus(), description: 'Bill discount' },
    { key: 'F7', handler: () => { dispatch({ type: 'payments', payments: [{ mode: 'cash', amountPaise: totalsRef.current.totalPaise, reference: '' }] }); cashRef.current?.focus(); } },
    { key: 'F8', handler: () => dispatch({ type: 'payments', payments: [{ mode: 'upi', amountPaise: totalsRef.current.totalPaise, reference: '' }] }) },
    { key: 'F9', handler: () => cashRef.current?.focus() },
    { key: 'F10', handler: () => setInStockOnly((v) => !v) },
    { key: 'n', alt: true, handler: () => startNew() },
    { key: 's', alt: true, handler: () => submitRef.current() },
    { key: 'h', alt: true, handler: () => { if (state.lines.length) hold.mutate(); } },
    { key: 'c', alt: true, handler: () => phoneRef.current?.focus() },
    { key: 'F12', handler: () => submitRef.current() },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [state.lines.length]));

  const selected = state.lines.find((l) => l.key === state.selectedKey) ?? null;

  return (
    <div className="-m-3 flex h-[calc(100vh-3.5rem)] flex-col md:-m-5 lg:flex-row">
      {/* Left: search */}
      <section aria-label="Find items" className="flex min-h-[40vh] flex-1 flex-col border-b border-border bg-surface lg:min-h-0 lg:w-[55%] lg:border-b-0 lg:border-r">
        <ItemSearch ref={searchRef} onPick={onPick} inStockOnly={inStockOnly} onToggleInStock={() => setInStockOnly((v) => !v)} onScan={(raw) => scan.mutate(raw)} />
      </section>

      {/* Right: cart */}
      <section aria-label="Current bill" className="flex min-h-0 flex-1 flex-col bg-page lg:w-[45%]">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
          <h1 className="text-base">New bill</h1>
          <span className="text-xs text-text-2">{state.lines.length} {state.lines.length === 1 ? 'item' : 'items'}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" icon={<PauseCircle className="h-4 w-4" />} onClick={() => setHoldsOpen(true)}>Held bills</Button>
            <Button size="sm" variant="ghost" icon={<Eraser className="h-4 w-4" />} onClick={startNew} disabled={state.lines.length === 0 && !state.customer}>Clear</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
          {restored && <Callout tone="accent" title="Unsaved bill restored" actions={<Button size="sm" variant="ghost" onClick={startNew}>Discard</Button>}>This bill was in progress when the page was last closed.</Callout>}
          {error && (
            <div ref={errorRef} tabIndex={-1} className="outline-none"><Callout tone="danger" title={error.title}>{error.detail}{error.fields && error.fields.length > 0 && <ul className="list-disc pl-5">{error.fields.map((f, i) => <li key={i}>{f.path ? `${f.path}: ` : ''}{f.message}</li>)}</ul>}</Callout></div>
          )}
          <CustomerBar customer={state.customer} name={state.customerName} phone={state.customerPhone} onCustomer={(c) => dispatch({ type: 'customer', customer: c })} onQuick={(p) => dispatch({ type: 'quickCustomer', ...p })} phoneRef={phoneRef} />
          <InteractionCallouts result={interactions} overrideReason={overrideReason} onOverride={setOverrideReason} />

          <div className="card overflow-hidden">
            {state.lines.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-2"><FilePlus2 className="mx-auto mb-2 h-6 w-6 text-text-3" aria-hidden />No items yet. Search on the left or scan a pack.</div>
            ) : (
              <ul aria-label="Items on this bill" className="divide-y divide-border">
                {state.lines.map((l, idx) => {
                  const t = totals.lines.find((x) => x.key === l.key)!;
                  const pack = { baseUnit: l.baseUnit, unitsPerPack: l.unitsPerPack, packName: l.packName, allowLoose: l.allowLoose };
                  const isSel = l.key === state.selectedKey;
                  return (
                    <LineRow key={l.key} index={idx + 1} line={l} t={t} isSel={isSel} pack={pack} today={today} cap={cap} priceEdit={priceEdit === l.key}
                      onSelect={() => dispatch({ type: 'select', key: l.key })} onPatch={(patch) => dispatch({ type: 'updateLine', key: l.key, patch })} onRemove={() => dispatch({ type: 'removeLine', key: l.key })} onTogglePrice={() => setPriceEdit(priceEdit === l.key ? null : l.key)} />
                  );
                })}
              </ul>
            )}
          </div>

          {(totals.schedule !== 'NONE' || state.rx.doctorName || state.rx.patientName) && (
            <RxPanel rx={state.rx} schedule={totals.schedule} missing={totals.missingRx} onChange={(p) => dispatch({ type: 'rx', patch: p })} pharmacistOnDuty={pharmacistOnDuty} />
          )}
          {totals.schedule === 'NONE' && !state.rx.doctorName && state.lines.length > 0 && (
            <button type="button" className="text-xs text-accent hover:underline" onClick={() => dispatch({ type: 'rx', patch: { patientName: state.customer?.name ?? state.customerName } })}>+ Add prescriber / patient details (optional for non-scheduled items)</button>
          )}

          {state.lines.length > 0 && <PaymentPanel payments={state.payments} totalPaise={totals.totalPaise} tendered={totals.tenderedPaise} change={totals.changePaise} credit={totals.creditPaise} hasCustomer={!!state.customer} onChange={(p) => dispatch({ type: 'payments', payments: p })} firstRef={cashRef} />}
        </div>

        {/* Totals + actions, fixed at bottom right */}
        <div className="border-t border-border bg-surface p-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-text-2">Gross</span><Money paise={totals.grossPaise} />
            <label className="flex items-center gap-2 text-text-2">Discount
              <span className="inline-flex items-center gap-1 rounded border border-border px-1"><Percent className="h-3 w-3" aria-hidden /><input ref={billDiscRef} aria-label="Bill discount percent" type="number" min={0} max={cap} step="0.5" value={state.billDiscountPct || ''} placeholder="0" onChange={(e) => dispatch({ type: 'billDiscount', pct: Math.min(cap, Math.max(0, Number(e.target.value) || 0)) })} className="h-7 w-14 bg-transparent text-right text-sm outline-none" /><span className="kbd">F4</span></span>
            </label><Money paise={-totals.discountPaise} />
            {scheme === 'regular' && <><span className="text-text-2">Taxable</span><Money paise={totals.taxablePaise} /><span className="text-text-2">CGST + SGST</span><Money paise={totals.cgstPaise + totals.sgstPaise} /></>}
            <span className="text-text-2">Round off</span><Money paise={totals.roundOffPaise} signed />
            <span className="text-lg font-semibold">Total</span><span className="num text-2xl font-semibold tabular-nums">{rupees(totals.totalPaise)}</span>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" icon={<PauseCircle className="h-4 w-4" />} kbd="Alt+H" onClick={() => hold.mutate()} disabled={state.lines.length === 0} loading={hold.isPending}>Hold</Button>
            <Button variant="primary" size="lg" className="flex-1" icon={<Save className="h-5 w-5" />} kbd="Alt+S" onClick={submit} disabled={!canPost} loading={post.isPending}>
              {totals.creditPaise > 0 && state.customer ? 'Save on credit & print' : 'Save & print bill'}
            </Button>
          </div>
          {selected && <p className="mt-1 text-[11px] text-text-3">Selected: {selected.itemName} · <span className="kbd">F3</span> line discount</p>}
        </div>
      </section>

      {offlinePrint && <div className="print-only"><InvoicePrint sale={offlinePrint.sale} store={offlinePrint.store} /></div>}

      <HoldsSheet open={holdsOpen} onOpenChange={setHoldsOpen} holds={holds} onResume={(h) => void resumeHold(h)} onDelete={(h) => void deleteHold(h)} />

      <Dialog open={!!done} onOpenChange={(o) => { if (!o) startNew(); }} title="Bill saved" size="sm" description={done ? `${done.invoiceNo} · ${rupees(done.totalPaise)}` : undefined}
        footer={<><Button variant="ghost" onClick={startNew} kbd="Alt+N">New bill</Button>{done?.phone && <Button variant="secondary" icon={<MessageCircle className="h-4 w-4" />} onClick={() => sendWhatsApp(done)}>WhatsApp</Button>}<Button variant="primary" icon={<Printer className="h-4 w-4" />} autoFocus onClick={() => { if (done!.offline) window.print(); else window.open(`/sales/${done!.id}?print=true`, '_blank', 'noopener'); }}>Print</Button></>}>
        {done && (
          <div className="space-y-2 text-sm">
            {done.changePaise > 0 && <p className="rounded bg-success-bg p-2 text-base font-semibold text-success">Return change {rupees(done.changePaise)}</p>}
            {done.creditPaise > 0 && <p className="rounded bg-warning-bg p-2 font-medium text-warning">{rupees(done.creditPaise)} recorded as credit</p>}
            {done.offline && <p className="rounded bg-warning-bg p-2 font-medium text-warning">Saved offline as {done.invoiceNo}. It will sync automatically; see Offline & sync.</p>}
            {done.warnings.map((w, i) => <p key={i} className="text-warning">{w.message}</p>)}
            <p className="text-text-2">Press <span className="kbd">Enter</span> to print, <span className="kbd">Alt+N</span> for the next customer.</p>
            {!done.offline && <Button variant="link" onClick={() => nav({ to: '/sales/$id', params: { id: String(done.id) } })}>Open bill</Button>}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function getCounter() { try { return localStorage.getItem('pms-counter-code') || 'C1'; } catch { return 'C1'; } }

/** Builds the same shape the server returns, so the offline bill prints identically. */
function buildLocalPrintSale(s: BillState, t: ReturnType<typeof computeTotals>, store: PrintStore): PrintSale {
  const now = new Date().toISOString();
  return {
    id: 0, invoiceNo: '', kind: store.gstScheme === 'composition' ? 'BILL_OF_SUPPLY' : t.lines.some((l) => l.cgstPaise + l.sgstPaise === 0 && l.taxablePaise > 0) && t.cgstPaise + t.sgstPaise > 0 ? 'INVOICE_CUM_BILL_OF_SUPPLY' : t.cgstPaise + t.sgstPaise > 0 ? 'TAX_INVOICE' : 'BILL_OF_SUPPLY',
    date: now.slice(0, 10), createdAt: now, status: 'posted', customerName: s.customer?.name ?? s.customerName ?? null, customerPhone: s.customer?.phone ?? s.customerPhone ?? null, customerGstin: s.customerGstin || null,
    doctorName: s.rx.doctorName || null, doctorRegNo: s.rx.doctorRegNo || null, patientName: s.rx.patientName || null, patientAddress: s.rx.patientAddress || null, patientAge: s.rx.patientAge ? Number(s.rx.patientAge) : null, strictestSchedule: t.schedule,
    grossPaise: t.grossPaise, discountPaise: t.discountPaise, taxablePaise: t.taxablePaise, cgstPaise: t.cgstPaise, sgstPaise: t.sgstPaise, igstPaise: 0, roundOffPaise: t.roundOffPaise, totalPaise: t.totalPaise, paidPaise: t.paidPaise, creditPaise: t.creditPaise, createdByName: null, pharmacist: null,
    lines: s.lines.map((l, i) => { const tl = t.lines.find((x) => x.key === l.key)!; return { id: i + 1, itemName: l.itemName, genericText: l.genericText, manufacturer: l.manufacturer, batchNo: l.batchNo, expiryDate: l.expiryDate, hsn: '3004', schedule: l.schedule, unitMode: l.unitMode, qty: l.qty, qtyUnits: tl.qtyUnits, packName: l.packName, baseUnit: l.baseUnit, mrpPaise: l.mrpPaise, unitPricePaise: tl.unitPricePaise, discountPct: tl.effectiveDiscountPct, netPaise: tl.netPaise, gstRatePct: l.gstRatePct, taxablePaise: tl.taxablePaise, cgstPaise: tl.cgstPaise, sgstPaise: tl.sgstPaise, igstPaise: 0, returnedUnits: 0, unitsPerPack: l.unitsPerPack }; }),
    payments: s.payments.filter((p) => p.amountPaise > 0).map((p) => ({ mode: p.mode, amountPaise: p.amountPaise, reference: p.reference || null })),
  };
}

function LineRow({ index, line: l, t, isSel, pack, today, cap, priceEdit, onSelect, onPatch, onRemove, onTogglePrice }: { index: number; line: CartLine; t: ReturnType<typeof computeTotals>['lines'][number]; isSel: boolean; pack: { baseUnit: string; unitsPerPack: number; packName: string; allowLoose: boolean }; today: string; cap: number; priceEdit: boolean; onSelect: () => void; onPatch: (p: Partial<CartLine>) => void; onRemove: () => void; onTogglePrice: () => void }) {
  const qtyRef = useRef<HTMLInputElement>(null);
  const discRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isSel) qtyRef.current?.focus(); }, [isSel]);
  useHotkeys(useMemo(() => [{ key: 'F3', handler: () => discRef.current?.focus() }], []), isSel);
  return (
    <li onClick={onSelect} aria-current={isSel ? 'true' : undefined} className={cn('px-3 py-2', isSel && 'bg-accent-bg/50', t.overStock && 'bg-danger-bg')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2"><span className="text-xs text-text-2">{index}.</span><span className="break-words font-semibold">{l.itemName}</span><ScheduleBadge schedule={l.schedule} /></div>
          <div className="text-xs text-text-2">{tallManText(l.genericText)}</div>
        </div>
        <div className="shrink-0 text-right"><Money paise={t.netPaise} className="text-[15px] font-semibold" />{t.discountPaise > 0 && <div className="text-[11px] text-text-2">−{rupees(t.discountPaise)}</div>}</div>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-2">
        <span>B. {l.batchNo}</span><ExpiryBadge expiryDate={l.expiryDate} today={today} /><span>Stock {formatStock(l.availableUnits, pack)}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onTogglePrice(); }} className={cn('rounded px-1 hover:bg-surface-2', l.unitPricePaise !== null && 'font-medium text-warning')} aria-expanded={priceEdit}>@ {rupees(t.unitPricePaise)}{l.unitPricePaise !== null ? ' (below MRP)' : ` / ${l.unitMode === 'unit' ? l.baseUnit : l.packName}`}</button>
      </div>
      {t.overStock && <div className="mt-1 text-xs font-medium text-danger" role="alert">Only {formatStock(l.availableUnits, pack)} in this batch. <BatchSwitch line={l} onPatch={onPatch} today={today} /></div>}
      {t.belowCost && !t.overStock && <p className="mt-1 text-xs font-medium text-warning">Below purchase cost</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1">
          <label htmlFor={`qty-${l.key}`} className="text-xs text-text-2">Qty</label>
          <Input id={`qty-${l.key}`} ref={qtyRef} dense type="number" min={1} step={1} inputMode="numeric" aria-label={`Quantity of ${l.itemName}`} value={l.qty} onChange={(e) => onPatch({ qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} onFocus={(e) => e.target.select()} className="w-16 text-center" />
          {l.allowLoose && l.unitsPerPack > 1 ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); onPatch({ unitMode: l.unitMode === 'pack' ? 'unit' : 'pack', unitPricePaise: null, priceReason: null }); }} className="h-9 rounded border border-border px-2 text-xs font-medium text-text-2 hover:bg-surface-2" aria-label={`Unit: ${l.unitMode === 'pack' ? l.packName : l.baseUnit}. Click to switch`}>{l.unitMode === 'pack' ? l.packName : l.baseUnit} ⇄</button>
          ) : <span className="text-xs text-text-2">{l.packName}</span>}
        </div>
        <div className="flex items-center gap-1">
          <label htmlFor={`disc-${l.key}`} className="text-xs text-text-2">Disc %</label>
          <Input id={`disc-${l.key}`} ref={discRef} dense type="number" min={0} max={cap} step="0.5" inputMode="decimal" aria-label={`Discount percent for ${l.itemName}`} value={l.discountPct || ''} placeholder="0" onChange={(e) => onPatch({ discountPct: Math.min(cap, Math.max(0, Number(e.target.value) || 0)) })} className="w-16 text-right" />
        </div>
        <Button variant="ghost" size="icon" className="ml-auto h-9 w-9" aria-label={`Remove ${l.itemName}`} onClick={(e) => { e.stopPropagation(); onRemove(); }}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {priceEdit && <div className="mt-2"><PriceOverride mrpUnitPaise={t.mrpUnitPaise} valuePaise={l.unitPricePaise} reason={l.priceReason} onChange={(p) => { onPatch(p); onTogglePrice(); }} /></div>}
    </li>
  );
}

function BatchSwitch({ line, onPatch, today }: { line: CartLine; onPatch: (p: Partial<CartLine>) => void; today: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['item-batches', line.itemId], queryFn: () => api.get<BatchRow[]>(`/items/${line.itemId}/batches`), enabled: open });
  const need = line.unitMode === 'unit' ? line.qty : line.qty * line.unitsPerPack;
  const others = (q.data ?? []).filter((b) => b.id !== line.batchId && b.expiryDate >= today && b.qtyUnits > 0);
  if (!open) return <button type="button" className="underline" onClick={() => setOpen(true)}>Choose another batch</button>;
  if (q.isLoading) return <span className="text-text-2">Loading batches…</span>;
  if (others.length === 0) return <span className="text-text-2">No other batch in stock. Reduce the quantity.</span>;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {others.map((b) => <button key={b.id} type="button" onClick={() => { onPatch({ batchId: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate, mrpPaise: b.mrpPaise, availableUnits: b.qtyUnits, purchaseRatePaise: b.purchaseRatePaise, unitPricePaise: null, priceReason: null }); setOpen(false); }}
        className={cn('rounded border px-1.5 py-0.5 text-[11px] font-medium', b.qtyUnits >= need ? 'border-success-border bg-success-bg text-success' : 'border-border bg-surface text-text-2')}>{b.batchNo} · Exp {b.expiryDate.slice(5, 7)}/{b.expiryDate.slice(2, 4)} · {formatStock(b.qtyUnits, { baseUnit: line.baseUnit, unitsPerPack: line.unitsPerPack, packName: line.packName, allowLoose: line.allowLoose })}</button>)}
    </span>
  );
}

export function whatsappUrl(phone: string, text: string) {
  const p = phone.replace(/\D/g, '');
  return `https://wa.me/${p.length === 10 ? '91' + p : p}?text=${encodeURIComponent(text)}`;
}

export { Badge };
