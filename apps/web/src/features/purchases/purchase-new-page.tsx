import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, FileUp, Plus, Printer, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseExpiry, pct, roundHalfUp, roundToRupee, splitExclusive } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { cn, formatDateIN, formatExpiry, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, Dialog, Field, Input, Money, NativeSelect, PageHeader, Sheet, Spinner, Switch, Textarea } from '@/components/ui';
import { ItemFormSheet } from '../items/item-form-sheet';
import { ItemPicker } from '../items/item-picker';
import { describeError, paiseToRupee, rupeeToPaise, type DescribedError, type ItemFull, type ItemSearchRow } from '../items/item-shared';
import { SupplierPicker, type Supplier } from './supplier-picker';

const DRAFT_KEY = 'grn-draft';
const GST = [0, 5, 12, 18, 28];

interface Line { key: number; itemId: number | null; itemName: string; unitsPerPack: number; packName: string; baseUnit: string; hsn: string; batchNo: string; expiry: string; qtyPacks: string; freePacks: string; rate: string; discountPct: string; mrp: string; gstRatePct: number; schemeNote: string; csvName?: string }
interface Draft { supplier: Supplier | null; invoiceNo: string; invoiceDate: string; receivedDate: string; interstate: boolean; interstateTouched: boolean; otherCharges: string; notes: string; lines: Line[]; nextKey: number; /** Phase 2: purchase order being received (from ?poId=). */ poId?: number | null; poNo?: string | null }
interface Preview { lines: { itemName: string; unitsReceived: number; taxablePaise: number; totalPaise: number; effectiveCostPerPackPaise: number; marginPct: number }[]; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; otherChargesPaise: number; roundOffPaise: number; totalPaise: number; warnings: { line: number; level: 'warning' | 'info'; message: string }[] }
interface Posted { id: number; grnNo: string; totalPaise: number; warnings: Preview['warnings']; batches: { batchId: number; units: number }[] }
interface ImportedLine { row: number; itemName: string; itemId: number | null; matchedName: string | null; batchNo: string; expiry: string | null; expiryRaw: string; qtyPacks: number; freePacks: number; ratePaise: number; mrpPaise: number; discountPct: number; gstRatePct: number; hsn: string | null; problems: string[] }

const blankLine = (key: number): Line => ({ key, itemId: null, itemName: '', unitsPerPack: 1, packName: 'pack', baseUnit: 'unit', hsn: '3004', batchNo: '', expiry: '', qtyPacks: '', freePacks: '', rate: '', discountPct: '', mrp: '', gstRatePct: 12, schemeNote: '' });
const blankDraft = (): Draft => ({ supplier: null, invoiceNo: '', invoiceDate: todayIST(), receivedDate: todayIST(), interstate: false, interstateTouched: false, otherCharges: '', notes: '', lines: [blankLine(1), blankLine(2), blankLine(3)], nextKey: 4 });
const hasContent = (l: Line) => !!(l.itemId || l.batchNo || l.qtyPacks || l.rate || l.mrp || l.csvName);
const int = (s: string) => Math.max(0, Math.floor(Number(s) || 0));

/** Same arithmetic as previewPurchase on the API so the on-screen numbers match the posted document. */
function calcLine(l: Line, interstate: boolean, composition: boolean) {
  const qty = int(l.qtyPacks), free = int(l.freePacks), ratePaise = rupeeToPaise(l.rate), mrpPaise = rupeeToPaise(l.mrp), disc = Math.min(100, Math.max(0, Number(l.discountPct) || 0));
  const grossPaise = roundHalfUp(ratePaise * qty);
  const discountPaise = pct(grossPaise, disc);
  const split = splitExclusive(grossPaise - discountPaise, l.gstRatePct, interstate);
  const packs = qty + free;
  const eff = packs > 0 ? roundHalfUp((composition ? split.totalPaise : split.taxablePaise) / packs) : 0;
  const marginPct = mrpPaise > 0 ? Math.round(((mrpPaise - eff) / mrpPaise) * 1000) / 10 : 0;
  return { qty, free, packs, units: packs * l.unitsPerPack, grossPaise, discountPaise, ...split, effectiveCostPerPackPaise: eff, marginPct, mrpPaise, expiryIso: parseExpiry(l.expiry) };
}

export function PurchaseNewPage() {
  const nav = useNavigate();
  const search = useSearch({ from: '/app/purchases/new' });
  const { store, can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const today = todayIST();
  const composition = store?.gstScheme === 'composition';
  const [d, setD] = useState<Draft>(blankDraft);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<DescribedError | null>(null);
  const [preview, setPreview] = useState<{ key: string; data: Preview } | null>(null);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [imported, setImported] = useState<{ lines: ImportedLine[]; columns: string[] } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  // ---- draft: restore once, then autosave
  useEffect(() => {
    try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) { const saved = JSON.parse(raw) as Draft; if (saved.lines?.some(hasContent) || saved.invoiceNo || saved.supplier) { setD({ ...blankDraft(), ...saved }); setRestored(true); } } } catch { /* ignore corrupt draft */ }
    loaded.current = true;
  }, []);
  useEffect(() => { if (!loaded.current) return; const t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* quota */ } }, 300); return () => clearTimeout(t); }, [d]);
  // ---- Phase 2: receiving against a purchase order → prefill supplier + pending lines and carry purchaseOrderId
  useEffect(() => {
    if (!search.poId) return;
    let alive = true;
    (async () => {
      try {
        const po = await api.get<{ id: number; poNo: string | null; status: string; supplier: { id: number; name: string; phone: string | null; email: string | null; gstin: string | null; drugLicenceNo: string | null; address: string | null; city: string | null; stateCode: string | null }; lines: { itemId: number; itemName: string; qtyPacks: number; receivedPacks: number; pendingPacks: number; ratePaise: number | null; mrpPaise: number | null; unitsPerPack: number; packName: string; baseUnit: string }[] }>(`/purchase-orders/${search.poId}`);
        const items = await Promise.all(po.lines.map((l) => api.get<ItemFull>(`/items/${l.itemId}`).catch(() => null)));
        if (!alive) return;
        const supplier: Supplier = { ...po.supplier, creditDays: 0, active: true };
        let k = 1;
        const lines: Line[] = po.lines.filter((l) => l.pendingPacks > 0 || po.lines.every((x) => x.pendingPacks === 0)).map((l, i) => {
          const it = items[i];
          return { ...blankLine(k++), itemId: l.itemId, itemName: l.itemName, unitsPerPack: l.unitsPerPack, packName: l.packName, baseUnit: l.baseUnit, hsn: it?.hsn ?? '3004', gstRatePct: it && GST.includes(it.gstRatePct) ? it.gstRatePct : 12, qtyPacks: String(l.pendingPacks || l.qtyPacks), rate: paiseToRupee(l.ratePaise), mrp: paiseToRupee(l.mrpPaise) };
        });
        setD((s) => ({ ...blankDraft(), supplier, interstate: !!(supplier.stateCode && store?.stateCode && supplier.stateCode !== store.stateCode), notes: s.notes, lines: lines.length ? lines : [blankLine(1)], nextKey: k, poId: po.id, poNo: po.poNo }));
        setRestored(false); setPreview(null); setError(null);
        setTimeout(() => document.getElementById('grn-invoice-no')?.focus(), 0);
      } catch (e) { toast.error('Could not load the purchase order', describeError(e).title); }
    })();
    return () => { alive = false; };
  }, [search.poId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setD(blankDraft()); setRestored(false); setError(null); setPreview(null); setPosted(null); try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } setTimeout(() => document.getElementById('grn-supplier')?.focus(), 0); };

  const setLine = useCallback((key: number, patch: Partial<Line>) => setD((s) => ({ ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })), []);
  const addLine = (): number => { const k = d.nextKey; setD((s) => ({ ...s, lines: [...s.lines, blankLine(k)], nextKey: Math.max(s.nextKey, k) + 1 })); return k; };
  const removeLine = (key: number) => setD((s) => ({ ...s, lines: s.lines.length === 1 ? [blankLine(s.nextKey)] : s.lines.filter((l) => l.key !== key), nextKey: s.nextKey + 1 }));
  const pickItem = (key: number, it: ItemSearchRow | null) => {
    if (!it) { setLine(key, { itemId: null, itemName: '' }); return; }
    setLine(key, { itemId: it.id, itemName: it.name, unitsPerPack: it.unitsPerPack, packName: it.packName, baseUnit: it.baseUnit, hsn: it.hsn, gstRatePct: GST.includes(it.gstRatePct) ? it.gstRatePct : 12, mrp: it.mrpPaise ? paiseToRupee(it.mrpPaise) : '', csvName: undefined });
    setTimeout(() => document.getElementById(`grn-batch-${key}`)?.focus(), 60);
  };
  const onSupplier = (s: Supplier | null) => setD((st) => ({ ...st, supplier: s, interstate: st.interstateTouched ? st.interstate : !!(s?.stateCode && store?.stateCode && s.stateCode !== store.stateCode) }));

  // ---- computed
  const calc = useMemo(() => d.lines.map((l) => calcLine(l, d.interstate, composition)), [d.lines, d.interstate, composition]);
  const active = d.lines.map((l, i) => ({ l, c: calc[i]! })).filter(({ l }) => hasContent(l));
  const totals = useMemo(() => {
    const t = active.reduce((a, { c }) => ({ taxable: a.taxable + c.taxablePaise, cgst: a.cgst + c.cgstPaise, sgst: a.sgst + c.sgstPaise, igst: a.igst + c.igstPaise, units: a.units + c.units }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, units: 0 });
    const other = rupeeToPaise(d.otherCharges);
    const { roundedPaise, roundOffPaise } = roundToRupee(t.taxable + t.cgst + t.sgst + t.igst + other);
    return { ...t, other, roundOff: roundOffPaise, total: roundedPaise };
  }, [active, d.otherCharges]);

  const payload = () => ({
    supplierId: d.supplier?.id, invoiceNo: d.invoiceNo.trim(), invoiceDate: d.invoiceDate, receivedDate: d.receivedDate || undefined, interstate: d.interstate, otherChargesPaise: rupeeToPaise(d.otherCharges), notes: d.notes.trim() || null,
    purchaseOrderId: d.poId ?? null, // Phase 2: links the GRN to the PO and updates its received packs
    lines: active.map(({ l, c }) => ({ itemId: l.itemId, batchNo: l.batchNo.trim(), expiryDate: c.expiryIso, qtyPacks: c.qty, freePacks: c.free, ratePaise: rupeeToPaise(l.rate), discountPct: Number(l.discountPct) || 0, mrpPaise: c.mrpPaise, gstRatePct: l.gstRatePct, hsn: /^\d{4,8}$/.test(l.hsn) ? l.hsn : undefined, schemeNote: l.schemeNote.trim() || null })),
  });
  const payloadKey = JSON.stringify(payload());
  const previewFresh = preview?.key === payloadKey;

  const validate = (): DescribedError | null => {
    const f: { path: string; message: string }[] = [];
    if (!d.supplier) f.push({ path: 'Supplier', message: 'choose who sent the goods' });
    if (!d.invoiceNo.trim()) f.push({ path: 'Invoice no', message: 'copy it from the supplier invoice' });
    if (!d.invoiceDate) f.push({ path: 'Invoice date', message: 'required' });
    if (active.length === 0) f.push({ path: 'Lines', message: 'add at least one item' });
    active.forEach(({ l, c }, i) => {
      const p: string[] = [];
      if (!l.itemId) p.push(l.csvName ? `pick the item for “${l.csvName}”` : 'item');
      if (!l.batchNo.trim()) p.push('batch no');
      if (!c.expiryIso) p.push('expiry as MM/YY');
      if (c.packs <= 0) p.push('qty or free packs');
      if (p.length) f.push({ path: `Line ${i + 1}${l.itemName ? ` (${l.itemName})` : ''}`, message: `needs ${p.join(', ')}` });
    });
    return f.length ? { title: 'A few things are missing before this can be checked', fields: f } : null;
  };
  const showError = (e: DescribedError | null) => { setError(e); if (e) setTimeout(() => errorRef.current?.focus(), 0); };

  const check = useMutation({
    mutationFn: () => api.post<Preview>('/purchases/preview', payload()),
    onSuccess: (data) => { setPreview({ key: payloadKey, data }); setError(null); setTimeout(() => document.getElementById('grn-preview')?.focus(), 0); },
    onError: (e) => showError(describeError(e)),
  });
  const post = useMutation({
    mutationFn: () => api.post<Posted>('/purchases', payload()),
    onSuccess: (r) => {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      if (d.poId) { qc.invalidateQueries({ queryKey: ['purchase-order', String(d.poId)] }); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['reorder'] }); }
      qc.invalidateQueries({ queryKey: ['purchases'] }); qc.invalidateQueries({ queryKey: ['batches'] }); qc.invalidateQueries({ queryKey: ['items'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['item-batches'] }); qc.invalidateQueries({ queryKey: ['item-batches-detail'] });
      setPosted(r);
    },
    onError: (e) => showError(describeError(e)),
  });
  const onCheck = () => { const v = validate(); if (v) { showError(v); return; } check.mutate(); };
  const onPost = () => { const v = validate(); if (v) { showError(v); return; } post.mutate(); };

  // ---- CSV import
  const importCsv = useMutation({
    mutationFn: (f: File) => api.upload<{ lines: ImportedLine[]; columns: string[] }>('/purchases/import', f),
    onSuccess: (r) => { if (r.lines.length === 0) toast.warn('The file has no data rows'); else setImported(r); },
    onError: (e) => toast.error('Could not read the CSV', describeError(e).title),
  });
  const loadImported = async (rows: (ImportedLine & { picked?: ItemSearchRow | null })[]) => {
    const details = new Map<number, ItemFull | ItemSearchRow>();
    for (const r of rows) if (r.picked) details.set(r.picked.id, r.picked);
    const missing = [...new Set(rows.map((r) => r.itemId).filter((x): x is number => !!x && !details.has(x)))];
    const fetched = await Promise.all(missing.map((id) => api.get<ItemFull>(`/items/${id}`).catch(() => null)));
    fetched.forEach((it) => { if (it) details.set(it.id, it); });
    setD((s) => {
      let k = s.nextKey;
      const lines: Line[] = rows.map((r) => {
        const it = r.itemId ? details.get(r.itemId) : undefined;
        return { key: k++, itemId: it?.id ?? null, itemName: it?.name ?? '', unitsPerPack: it?.unitsPerPack ?? 1, packName: it?.packName ?? 'pack', baseUnit: it?.baseUnit ?? 'unit', hsn: r.hsn ?? it?.hsn ?? '3004', batchNo: r.batchNo, expiry: r.expiry ? formatExpiry(r.expiry) : r.expiryRaw, qtyPacks: r.qtyPacks ? String(r.qtyPacks) : '', freePacks: r.freePacks ? String(r.freePacks) : '', rate: paiseToRupee(r.ratePaise), discountPct: r.discountPct ? String(r.discountPct) : '', mrp: paiseToRupee(r.mrpPaise), gstRatePct: GST.includes(r.gstRatePct) ? r.gstRatePct : (it?.gstRatePct ?? 12), schemeNote: '', csvName: it ? undefined : r.itemName };
      });
      return { ...s, lines: [...s.lines.filter(hasContent), ...lines], nextKey: k };
    });
    setImported(null); setPreview(null);
    toast.success(`${rows.length} lines loaded`, 'Check batch numbers and expiry, then “Check & preview”.');
  };

  // ---- keyboard: Enter moves across the row; Enter on the last cell adds a row
  const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, key: number, isLast: boolean) => {
    if (e.key !== 'Enter') return;
    const t = e.target as HTMLElement;
    if (!(t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    e.preventDefault();
    const cells = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input:not([type=hidden]), select, button[role=combobox]'));
    const i = cells.indexOf(t);
    if (i >= 0 && i < cells.length - 1) { cells[i + 1]!.focus(); return; }
    if (isLast) { const k = addLine(); setTimeout(() => document.getElementById(`grn-item-${k}`)?.focus(), 0); } else { const next = d.lines[d.lines.findIndex((l) => l.key === key) + 1]; if (next) document.getElementById(`grn-item-${next.key}`)?.focus(); }
  };

  if (!can('purchase.create')) return <Callout tone="warning" title="You cannot receive stock with this login">Ask the owner or pharmacist to enter the receipt.</Callout>;

  return (
    <div>
      <PageHeader title="Receive stock" description="Enter the supplier invoice line by line, or import the distributor's CSV. Stock goes on the shelf when you post."
        actions={<>
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav({ to: '/purchases' })}>All receipts</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Distributor CSV file" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv.mutate(f); e.target.value = ''; }} />
          <Button icon={<FileUp className="h-4 w-4" />} loading={importCsv.isPending} onClick={() => fileRef.current?.click()}>Import distributor CSV</Button>
        </>} />

      {d.poId && <Callout tone="accent" className="mb-3" title={`Receiving against PO ${d.poNo ?? `#${d.poId}`}`} actions={<><Button size="sm" variant="ghost" onClick={() => nav({ to: '/purchase-orders/$id', params: { id: String(d.poId) } })}>Open order</Button><Button size="sm" variant="ghost" onClick={reset}>Unlink</Button></>}>Supplier and pending lines are prefilled from the order; adjust quantities to match the invoice. Posting updates the order's received packs.</Callout>}
      {restored && <Callout tone="accent" className="mb-3" title="Unsaved receipt restored" actions={<Button size="sm" variant="ghost" onClick={reset}>Discard</Button>}>This receipt was in progress when the page was last closed.</Callout>}
      {error && <div ref={errorRef} tabIndex={-1} className="mb-3 outline-none"><Callout tone="danger" title={error.title}>{error.detail}{error.fields.length > 0 && <ul className="list-disc pl-5">{error.fields.map((f, i) => <li key={i}>{f.path ? <><span className="font-medium">{f.path}</span>: </> : null}{f.message}</li>)}</ul>}</Callout></div>}

      <section className="card mb-4 p-4" aria-labelledby="h-head">
        <h2 id="h-head" className="sr-only">Invoice header</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Supplier" required className="xl:col-span-2" htmlFor="grn-supplier">{(id) => <SupplierPicker id={id} value={d.supplier} onChange={onSupplier} allowClear />}</Field>
          <Field label="Supplier invoice no" required htmlFor="grn-invoice-no">{(id) => <Input id={id} value={d.invoiceNo} onChange={(e) => setD({ ...d, invoiceNo: e.target.value })} />}</Field>
          <Field label="Invoice date" required>{(id) => <Input id={id} type="date" value={d.invoiceDate} max={today} onChange={(e) => setD({ ...d, invoiceDate: e.target.value })} />}</Field>
          <Field label="Received on">{(id) => <Input id={id} type="date" value={d.receivedDate} max={today} onChange={(e) => setD({ ...d, receivedDate: e.target.value })} />}</Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Switch id="grn-interstate" checked={d.interstate} onCheckedChange={(v) => setD({ ...d, interstate: v, interstateTouched: true })} /><label htmlFor="grn-interstate">Inter-state purchase (IGST)</label>
          <span className="text-xs text-text-2">{d.supplier?.stateCode ? `Supplier state ${d.supplier.stateCode}, store ${store?.stateCode}` : 'Set automatically when the supplier has a GSTIN'}{composition && ' · Composition scheme: GST is added to cost'}</span>
        </div>
      </section>

      <section className="card mb-4 overflow-hidden" aria-labelledby="h-lines">
        <h2 id="h-lines" className="sr-only">Invoice lines</h2>
        <div className="overflow-auto">
          <table className="tbl dense min-w-295">
            <caption className="sr-only">Lines on this receipt. Press Enter to move to the next cell; Enter on the last cell adds a line.</caption>
            <thead><tr><th className="w-8">#</th><th className="min-w-55">Item</th><th className="w-28">Batch</th><th className="w-24">Expiry</th><th className="w-20">Qty</th><th className="w-20">Free</th><th className="w-28">Rate ₹</th><th className="w-20">Disc %</th><th className="w-28">MRP ₹</th><th className="w-24">GST</th><th className="w-32">Scheme</th><th className="num w-20">Units</th><th className="num w-28">Amount</th><th className="num w-20">Margin</th><th className="w-10"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>{d.lines.map((l, i) => {
              const c = calc[i]!;
              const filled = hasContent(l);
              return (
                <tr key={l.key} onKeyDown={(e) => onRowKey(e, l.key, i === d.lines.length - 1)} data-tone={filled && l.itemId && c.marginPct < 0 ? 'warning' : undefined}>
                  <td className="text-text-2">{i + 1}</td>
                  <td>
                    <ItemPicker id={`grn-item-${l.key}`} ariaLabel={`Item for line ${d.lines.findIndex((x) => x.key === l.key) + 1}`} dense value={l.itemId ? { id: l.itemId, name: l.itemName } : null} onPick={(it) => pickItem(l.key, it)} invalid={filled && !l.itemId} placeholder={l.csvName ? `Pick item for “${l.csvName}”` : 'Item'} />
                    {l.itemId && <div className="mt-0.5 text-[11px] text-text-2">{l.unitsPerPack} {l.baseUnit}{l.unitsPerPack === 1 ? '' : 's'}/{l.packName} · HSN {l.hsn}</div>}
                    {!l.itemId && l.csvName && <div className="mt-0.5 text-[11px] text-danger">From CSV: {l.csvName}</div>}
                  </td>
                  <td><Input id={`grn-batch-${l.key}`} dense aria-label={`Batch no, line ${i + 1}`} value={l.batchNo} invalid={filled && !l.batchNo.trim()} onChange={(e) => setLine(l.key, { batchNo: e.target.value })} /></td>
                  <td><Input dense aria-label={`Expiry MM/YY, line ${i + 1}`} placeholder="MM/YY" value={l.expiry} invalid={!!l.expiry && !c.expiryIso} onChange={(e) => setLine(l.key, { expiry: e.target.value })} />{l.expiry && (c.expiryIso ? <div className="text-[11px] text-text-2">{formatDateIN(c.expiryIso)}</div> : <div role="alert" className="text-[11px] text-danger">Use MM/YY</div>)}</td>
                  <td><Input dense type="number" min={0} inputMode="numeric" aria-label={`Qty packs, line ${i + 1}`} value={l.qtyPacks} onChange={(e) => setLine(l.key, { qtyPacks: e.target.value })} /></td>
                  <td><Input dense type="number" min={0} inputMode="numeric" aria-label={`Free packs, line ${i + 1}`} value={l.freePacks} onChange={(e) => setLine(l.key, { freePacks: e.target.value })} /></td>
                  <td><Input dense type="number" min={0} step="0.01" inputMode="decimal" aria-label={`Rate per pack before GST, line ${i + 1}`} value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} className="num" /></td>
                  <td><Input dense type="number" min={0} max={100} step="0.01" inputMode="decimal" aria-label={`Discount percent, line ${i + 1}`} value={l.discountPct} onChange={(e) => setLine(l.key, { discountPct: e.target.value })} className="num" /></td>
                  <td><Input dense type="number" min={0} step="0.01" inputMode="decimal" aria-label={`MRP per pack, line ${i + 1}`} value={l.mrp} onChange={(e) => setLine(l.key, { mrp: e.target.value })} className="num" /></td>
                  <td><NativeSelect dense aria-label={`GST rate, line ${i + 1}`} value={l.gstRatePct} onChange={(e) => setLine(l.key, { gstRatePct: Number(e.target.value) })}>{GST.map((g) => <option key={g} value={g}>{g}%</option>)}</NativeSelect></td>
                  <td><Input dense aria-label={`Scheme note, line ${i + 1}`} placeholder="10+1" value={l.schemeNote} onChange={(e) => setLine(l.key, { schemeNote: e.target.value })} /></td>
                  <td className="num text-text-2">{filled ? c.units : ''}</td>
                  <td className="num">{filled ? <><Money paise={c.totalPaise} /><div className="text-[11px] text-text-2">{rupees(c.taxablePaise)} + tax</div></> : ''}</td>
                  <td className={cn('num', c.marginPct < 0 && 'font-medium text-danger', c.marginPct >= 0 && c.marginPct < 10 && filled && 'text-warning')}>{filled && c.mrpPaise > 0 ? `${c.marginPct}%` : ''}</td>
                  <td><Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Remove line ${i + 1}`} onClick={() => removeLine(l.key)}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-3 py-2"><Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => { const k = addLine(); setTimeout(() => document.getElementById(`grn-item-${k}`)?.focus(), 0); }}>Add line</Button><span className="text-xs text-text-2">Rate is the purchase price per pack before GST (PTR). Margin = (MRP − cost per pack) ÷ MRP, with free packs spreading the cost.</span></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Other charges ₹" hint="Freight, round-off from the invoice; can be negative.">{(id, dd) => <Input id={id} aria-describedby={dd} type="number" step="0.01" inputMode="decimal" value={d.otherCharges} onChange={(e) => setD({ ...d, otherCharges: e.target.value })} className="num" />}</Field>
            <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} className="min-h-11" rows={2} />}</Field>
          </div>
          {previewFresh && preview && (
            <div id="grn-preview" tabIndex={-1} className="outline-none">
              <Callout tone={preview.data.warnings.some((w) => w.level === 'warning') ? 'warning' : 'success'} title={preview.data.warnings.length ? `Checked · ${preview.data.warnings.length} ${preview.data.warnings.length === 1 ? 'note' : 'notes'} to review` : 'Checked · nothing unusual'}>
                {preview.data.warnings.length > 0 && <ul className="list-disc pl-5">{preview.data.warnings.map((w, i) => <li key={i}>{w.level === 'warning' ? <Badge tone="warning" className="mr-1">Line {w.line}</Badge> : <Badge tone="neutral" className="mr-1">Line {w.line}</Badge>}{w.message}</li>)}</ul>}
                <p className="mt-1 text-xs">These do not block posting. Server total {rupees(preview.data.totalPaise)}{preview.data.totalPaise !== totals.total && ' (differs from the on-screen total; the server figure is used)'}.</p>
              </Callout>
            </div>
          )}
        </div>
        <div className="card p-4 text-sm lg:sticky lg:top-16 lg:self-start">
          <div className="grid grid-cols-2 gap-y-1" aria-live="polite">
            <span className="text-text-2">Lines / units</span><span className="num">{active.length} / {totals.units}</span>
            <span className="text-text-2">Taxable</span><Money paise={totals.taxable} />
            {d.interstate ? <><span className="text-text-2">IGST</span><Money paise={totals.igst} /></> : <><span className="text-text-2">CGST</span><Money paise={totals.cgst} /><span className="text-text-2">SGST</span><Money paise={totals.sgst} /></>}
            <span className="text-text-2">Other charges</span><Money paise={totals.other} signed />
            <span className="text-text-2">Round off</span><Money paise={totals.roundOff} signed />
            <span className="font-semibold">Total</span><span className="num text-lg font-semibold">{rupees(totals.total)}</span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Button size="lg" loading={check.isPending} onClick={onCheck} icon={<CheckCircle2 className="h-5 w-5" />}>Check & preview</Button>
            <Button size="lg" variant="primary" loading={post.isPending} onClick={onPost}>Post receipt{totals.total > 0 ? ` · ${rupees(totals.total)}` : ''}</Button>
            {!previewFresh && active.length > 0 && <p className="text-xs text-text-2">Tip: “Check & preview” asks the server for warnings (expiry, MRP drop, cost above MRP) without posting.</p>}
          </div>
        </div>
      </div>

      {posted && (
        <Dialog open onOpenChange={(o) => { if (!o) reset(); }} title={`Receipt ${posted.grnNo} posted`} description={`${rupees(posted.totalPaise)} · ${posted.batches.length} ${posted.batches.length === 1 ? 'batch' : 'batches'} added to stock`}
          footer={<>
            <Button variant="ghost" onClick={() => { const id = posted.id; reset(); nav({ to: '/purchases/$id', params: { id: String(id) } }); }}>View receipt</Button>
            <Button onClick={reset}>New receipt</Button>
            {can('label.print') && <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={() => { const ids = posted.batches.map((b, i) => `${b.batchId}:${Math.max(1, (active[i]?.c.packs ?? 1))}`).join(','); reset(); nav({ to: '/labels', search: { batchIds: ids } }); }}>Print labels</Button>}
          </>}>
          {posted.warnings.length > 0 ? <ul className="list-disc pl-5 text-sm text-text-2">{posted.warnings.map((w, i) => <li key={i}>Line {w.line}: {w.message}</li>)}</ul> : <p className="text-sm text-text-2">Labels print one per pack received (qty + free) so every strip can be scanned at billing.</p>}
        </Dialog>
      )}
      {imported && <ImportReview data={imported} onClose={() => setImported(null)} onLoad={loadImported} />}
    </div>
  );
}

// ---------- CSV review ----------
type ReviewRow = ImportedLine & { picked?: ItemSearchRow | null };

function ImportReview({ data, onClose, onLoad }: { data: { lines: ImportedLine[]; columns: string[] }; onClose: () => void; onLoad: (rows: ReviewRow[]) => Promise<void> }) {
  const [rows, setRows] = useState<ReviewRow[]>(data.lines);
  const [creating, setCreating] = useState<{ row: number; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const unmatched = rows.filter((r) => !r.itemId).length;
  const bad = rows.filter((r) => !r.expiry || !r.batchNo).length;
  const setRow = (row: number, p: Partial<ReviewRow>) => setRows((l) => l.map((r) => (r.row === row ? { ...r, ...p } : r)));
  const pick = (row: number, it: ItemSearchRow | null) => setRow(row, { itemId: it?.id ?? null, matchedName: it?.name ?? null, picked: it, problems: rows.find((r) => r.row === row)?.problems.filter((p) => !/item/i.test(p)) ?? [] });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Review imported lines" width="xl" description={`${rows.length} lines read · columns: ${data.columns.join(', ')}`}
      footer={<><span className="mr-auto text-sm text-text-2">{unmatched > 0 ? `${unmatched} ${unmatched === 1 ? 'line needs' : 'lines need'} an item` : 'All items matched'}{bad > 0 && ` · ${bad} with missing batch/expiry (fix in the grid)`}</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={loading} onClick={async () => { setLoading(true); try { await onLoad(rows); } finally { setLoading(false); } }}>Load into receipt</Button></>}>
      <div className="overflow-auto">
        <table className="tbl dense min-w-250">
          <thead><tr><th>Row</th><th className="min-w-65">Item</th><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th className="num">Free</th><th className="num">Rate</th><th className="num">MRP</th><th className="num">Disc</th><th className="num">GST</th><th>Problems</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.row} data-tone={!r.itemId || !r.expiry || !r.batchNo ? 'danger' : r.problems.length ? 'warning' : undefined}>
              <td className="text-text-2">{r.row}</td>
              <td>
                <div className="text-xs text-text-2">CSV: {r.itemName || <span className="italic">blank</span>}</div>
                <div className="mt-1 flex items-center gap-1"><div className="flex-1"><ItemPicker dense value={r.itemId ? { id: r.itemId, name: r.matchedName ?? `#${r.itemId}` } : null} onPick={(it) => pick(r.row, it)} placeholder="Pick item" onCreate={(name) => setCreating({ row: r.row, name })} /></div>{!r.itemId && <Button size="sm" variant="outline" onClick={() => setCreating({ row: r.row, name: r.itemName })}>Create</Button>}</div>
              </td>
              <td>{r.batchNo || <Badge tone="danger">Missing</Badge>}</td>
              <td>{r.expiry ? formatExpiry(r.expiry) : <Badge tone="danger">“{r.expiryRaw || '—'}”</Badge>}</td>
              <td className="num">{r.qtyPacks}</td><td className="num">{r.freePacks || ''}</td><td className="num">{(r.ratePaise / 100).toFixed(2)}</td><td className="num">{r.mrpPaise ? (r.mrpPaise / 100).toFixed(2) : <Badge tone="warning">0</Badge>}</td><td className="num">{r.discountPct || ''}</td><td className="num">{r.gstRatePct}%</td>
              <td className="text-xs">{r.problems.length ? <ul className="list-disc pl-4">{r.problems.map((p, i) => <li key={i}>{p}</li>)}</ul> : <span className="text-success">OK</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="p-6"><Spinner /></div>}
      {creating && <ItemFormSheet open onOpenChange={(o) => !o && setCreating(null)} initialName={creating.name} onSaved={(it) => { pick(creating.row, { ...it, manufacturer: it.manufacturer, stockUnits: 0, nearestExpiry: null, mrpPaise: null, batchCount: 0 } as unknown as ItemSearchRow); setCreating(null); }} />}
    </Sheet>
  );
}
