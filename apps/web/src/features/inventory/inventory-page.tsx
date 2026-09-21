import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Boxes, PackagePlus, Plus, Printer, Search, ShieldAlert, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { parseExpiry } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { cn, daysBetween, formatDateIN, formatStock, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, ConfirmDialog, EmptyState, ExpiryBadge, Input, Money, MoneyInput, PageHeader, Pagination, Sheet, Spinner } from '@/components/ui';
import { ItemPicker } from '../items/item-picker';
import { BATCH_STATUS_LABEL, describeError, packOf, type BatchRow, type ItemSearchRow } from '../items/item-shared';

type View = 'all' | 'expiring' | 'expired' | 'quarantined' | 'low';
const PAGE = 50;

interface LowRow { id: number; name: string; genericText: string; rack: string | null; unitsPerPack: number; packName: string; baseUnit: string; minStockUnits: number; reorderQtyPacks: number; stockUnits: number; valueCostPaise: number; valueMrpPaise: number; sold30: number; lastSold: string | null; supplierName: string | null }

export function InventoryPage() {
  const search = useSearch({ from: '/app/inventory' });
  const nav = useNavigate();
  const { can, store } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const today = todayIST();
  const nearDays = store?.nearExpiryDays ?? 90;
  const view = (search.view as View | undefined) ?? 'all';
  const page = search.page ?? 1;
  const [q, setQ] = useState(search.q ?? '');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [quarantineOpen, setQuarantineOpen] = useState(false);
  const [qReason, setQReason] = useState('');
  const [openingOpen, setOpeningOpen] = useState(false);
  useEffect(() => { setSelected(new Set()); }, [view, page, search.q, search.itemId]);
  useEffect(() => { setQ(search.q ?? ''); }, [search.q]);

  const batchParams = useMemo(() => {
    const base: Record<string, string | number | boolean | undefined> = { q: search.q, itemId: search.itemId, page, pageSize: PAGE };
    if (view === 'expiring') return { ...base, expiringWithinDays: nearDays };
    if (view === 'expired') return { ...base, expired: true };
    if (view === 'quarantined') return { ...base, status: 'quarantined' };
    return base;
  }, [view, search.q, search.itemId, page, nearDays]);
  const batches = useQuery({ queryKey: ['batches', batchParams], queryFn: () => api.get<{ rows: BatchRow[]; total: number }>('/batches', batchParams), enabled: view !== 'low', placeholderData: (p) => p });
  const low = useQuery({ queryKey: ['stock-low'], queryFn: () => api.get<LowRow[]>('/reports/stock', { lowOnly: true }), enabled: view === 'low' });
  const itemName = useQuery({ queryKey: ['item', String(search.itemId)], queryFn: () => api.get<{ name: string }>(`/items/${search.itemId}`), enabled: !!search.itemId });

  const set = (patch: Partial<typeof search>) => nav({ to: '/inventory', search: (s) => ({ ...s, page: 1, ...patch }) });
  const rows = batches.data?.rows ?? [];
  const totals = useMemo(() => rows.reduce((a, b) => ({ cost: a.cost + Math.round((b.qtyUnits * b.purchaseRatePaise) / b.unitsPerPack), mrp: a.mrp + Math.round((b.qtyUnits * b.mrpPaise) / b.unitsPerPack) }), { cost: 0, mrp: 0 }), [rows]);
  const sel = rows.filter((b) => selected.has(b.id));
  const allSelected = rows.length > 0 && sel.length === rows.length;

  const quarantine = useMutation({
    mutationFn: async () => { const failed: string[] = []; for (const b of sel) { try { await api.post(`/batches/${b.id}/status`, { status: 'quarantined', note: qReason }); } catch (e) { failed.push(`${b.itemName} ${b.batchNo}: ${describeError(e).title}`); } } return failed; },
    onSuccess: (failed) => {
      qc.invalidateQueries({ queryKey: ['batches'] }); qc.invalidateQueries({ queryKey: ['items'] }); qc.invalidateQueries({ queryKey: ['item-batches-detail'] });
      setQuarantineOpen(false); setQReason(''); setSelected(new Set());
      if (failed.length) toast.warn(`${sel.length - failed.length} of ${sel.length} batches quarantined`, failed.join('; ')); else toast.success(`${sel.length} ${sel.length === 1 ? 'batch' : 'batches'} put in quarantine`, 'They stay in stock but cannot be billed.');
    },
  });

  const views: { id: View; label: string }[] = [{ id: 'all', label: 'All batches' }, { id: 'expiring', label: `Expiring in ${nearDays} days` }, { id: 'expired', label: 'Expired' }, { id: 'quarantined', label: 'In quarantine' }, { id: 'low', label: 'Low stock' }];
  const sameSupplier = sel.length > 0 && sel.every((b) => b.supplierId && b.supplierId === sel[0]!.supplierId) ? sel[0]!.supplierId! : undefined;

  return (
    <div>
      <PageHeader title="Batches & expiry" description="Every batch on the shelf with its expiry and value. Use the views to find what needs action."
        actions={can('stock.adjust') ? <Button variant="primary" icon={<PackagePlus className="h-4 w-4" />} onClick={() => setOpeningOpen(true)}>Opening stock</Button> : undefined} />

      <div role="tablist" aria-label="View" className="mb-3 flex flex-wrap gap-1 border-b border-border">
        {views.map((v) => <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => set({ view: v.id === 'all' ? undefined : v.id })} className={cn('-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium', view === v.id ? 'border-accent text-accent' : 'border-transparent text-text-2 hover:text-text')}>{v.label}</button>)}
      </div>

      {view === 'expired' && <Callout tone="danger" className="mb-3" title="Expired stock cannot be sold (Drugs Rules 65(17))">Quarantine it, then return it to the supplier; the return creates the GST documents.</Callout>}
      {view === 'quarantined' && <Callout tone="warning" className="mb-3" title="Quarantined batches are held back from billing">Return them to the supplier from here, or reactivate a batch from its item page if it was quarantined by mistake.</Callout>}

      <form className="mb-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || undefined }); }}>
        <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item name or batch no" aria-label="Search batches" addonStart={<Search className="h-4 w-4" />} className="w-72" />
        <Button type="submit" size="sm">Search</Button>
        {search.itemId && <Badge tone="accent">Item: {itemName.data?.name ?? `#${search.itemId}`} <button type="button" className="ml-1 underline" onClick={() => set({ itemId: undefined })} aria-label="Clear item filter">clear</button></Badge>}
        {sel.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2 rounded-md border border-accent-border bg-accent-bg px-2 py-1 text-sm" role="region" aria-label="Bulk actions">
            <span className="font-medium">{sel.length} selected</span>
            {can('stock.adjust') && view !== 'quarantined' && <Button size="sm" icon={<ShieldAlert className="h-4 w-4" />} onClick={() => setQuarantineOpen(true)}>Quarantine selected</Button>}
            {can('label.print') && <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => nav({ to: '/labels', search: { batchIds: sel.map((b) => `${b.id}:1`).join(',') } })}>Print labels</Button>}
            {can('purchase.return') && <Button size="sm" icon={<Undo2 className="h-4 w-4" />} onClick={() => nav({ to: '/purchases/returns', search: { supplierId: sameSupplier, batchId: sel[0]!.id } })}>Return to supplier</Button>}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </form>

      {view === 'low' ? <LowTable q={low} /> : (
        <>
          <div className="table-wrap">
            {batches.isLoading ? <div className="p-6"><Spinner /></div> : batches.isError ? <div className="p-4"><Callout tone="danger" title="Could not load batches">{describeError(batches.error).title}</Callout></div> : rows.length === 0 ? (
              <EmptyState icon={Boxes} title={view === 'expired' ? 'No expired stock on the shelf' : view === 'expiring' ? `Nothing expires in the next ${nearDays} days` : view === 'quarantined' ? 'Nothing in quarantine' : search.q ? `No batches match “${search.q}”` : 'No stock yet'}
                action={view === 'all' && !search.q && can('purchase.create') ? <Button variant="primary" onClick={() => nav({ to: '/purchases/new' })}>Receive stock</Button> : undefined}>
                {view === 'all' && !search.q ? 'Stock arrives through a purchase receipt or opening stock.' : view === 'all' ? 'Try the brand name or part of the batch number.' : 'Good — nothing to do here.'}
              </EmptyState>
            ) : (
              <table className="tbl dense">
                <thead><tr>
                  <th className="w-10"><input type="checkbox" aria-label="Select all batches on this page" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((b) => b.id)) : new Set())} className="h-4 w-4" /></th>
                  <th>Item</th><th>Batch</th><th>Expiry</th><th className="num">MRP</th><th className="num">Purchase rate</th><th className="num">Qty</th><th className="num">Value at cost</th><th>Supplier</th><th>Status</th>
                </tr></thead>
                <tbody>{rows.map((b) => {
                  const days = daysBetween(today, b.expiryDate);
                  const tone = b.qtyUnits > 0 && (days < 0 || b.status === 'quarantined') ? 'danger' : b.qtyUnits > 0 && days <= nearDays ? 'warning' : undefined;
                  return (
                    <tr key={b.id} data-tone={tone} data-state={selected.has(b.id) ? 'selected' : undefined}>
                      <td><input type="checkbox" className="h-4 w-4" aria-label={`Select ${b.itemName} batch ${b.batchNo}`} checked={selected.has(b.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })} /></td>
                      <td><Link to="/items/$id" params={{ id: String(b.itemId) }} className="font-medium text-accent hover:underline">{b.itemName}</Link><div className="text-[11px] text-text-2">{b.genericText}{b.rack && <> · Rack {b.rack}</>}</div></td>
                      <td>{b.batchNo}</td>
                      <td><ExpiryBadge expiryDate={b.expiryDate} today={today} />{days >= 0 && days > 90 && <div className="text-[11px] text-text-2">{days} days left</div>}</td>
                      <td className="num"><Money paise={b.mrpPaise} /></td>
                      <td className="num"><Money paise={b.purchaseRatePaise} /></td>
                      <td className="num">{formatStock(b.qtyUnits, packOf(b))}</td>
                      <td className="num"><Money paise={Math.round((b.qtyUnits * b.purchaseRatePaise) / b.unitsPerPack)} /></td>
                      <td className="text-text-2">{b.supplierName ?? '—'}</td>
                      <td>{b.status === 'active' ? (days < 0 ? <Badge tone="danger">Expired · segregate</Badge> : <Badge tone="success">Active</Badge>) : <Badge tone={b.status === 'quarantined' ? 'warning' : 'neutral'}>{BATCH_STATUS_LABEL[b.status]}</Badge>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
          </div>
          {batches.data && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-text-2">
              <p aria-live="polite">{batches.data.total} {batches.data.total === 1 ? 'batch' : 'batches'} · this page: value at cost <span className="font-medium text-text">{rupees(totals.cost)}</span> · at MRP <span className="font-medium text-text">{rupees(totals.mrp)}</span></p>
              <Pagination page={page} pageSize={PAGE} total={batches.data.total} onPage={(p) => nav({ to: '/inventory', search: (s) => ({ ...s, page: p }) })} />
            </div>
          )}
        </>
      )}

      <ConfirmDialog open={quarantineOpen} onOpenChange={setQuarantineOpen} title={`Put ${sel.length} ${sel.length === 1 ? 'batch' : 'batches'} in quarantine?`} confirmLabel="Put in quarantine" onConfirm={() => quarantine.mutate()} loading={quarantine.isPending} requireReason reason={qReason} onReason={setQReason}>
        <p>The batches stay in stock but cannot be billed until reactivated. Next step: return them to the supplier.</p>
        <ul className="max-h-40 list-disc overflow-auto pl-5">{sel.map((b) => <li key={b.id}>{b.itemName} · {b.batchNo}</li>)}</ul>
      </ConfirmDialog>
      {openingOpen && <OpeningStockSheet onClose={() => setOpeningOpen(false)} />}
    </div>
  );
}

function LowTable({ q }: { q: UseQueryResult<LowRow[]> }) {
  const nav = useNavigate();
  if (q.isLoading) return <div className="table-wrap p-6"><Spinner /></div>;
  if (q.isError) return <Callout tone="danger" title="Could not load the low-stock list">{describeError(q.error).title}. This view needs the “view reports” permission.</Callout>;
  if (!q.data?.length) return <div className="table-wrap"><EmptyState icon={Boxes} title="Nothing is below its minimum">Set a minimum stock on items to be warned here before they run out.</EmptyState></div>;
  return (
    <>
      <div className="table-wrap">
        <table className="tbl dense">
          <thead><tr><th>Item</th><th className="num">Stock</th><th className="num">Minimum</th><th className="num">Reorder qty</th><th>Last supplier</th><th className="num">Sold last 30 days</th><th>Last sold</th></tr></thead>
          <tbody>{q.data.map((r) => (
            <tr key={r.id} data-tone={r.stockUnits === 0 ? 'danger' : 'warning'}>
              <td><Link to="/items/$id" params={{ id: String(r.id) }} className="font-medium text-accent hover:underline">{r.name}</Link><div className="text-[11px] text-text-2">{r.genericText}{r.rack && <> · Rack {r.rack}</>}</div></td>
              <td className="num">{r.stockUnits === 0 ? <Badge tone="danger">Out</Badge> : <span className="font-medium text-warning">{formatStock(r.stockUnits, { baseUnit: r.baseUnit, unitsPerPack: r.unitsPerPack, packName: r.packName, allowLoose: true })}</span>}</td>
              <td className="num">{r.minStockUnits} {r.baseUnit}s</td>
              <td className="num">{r.reorderQtyPacks ? `${r.reorderQtyPacks} ${r.packName}s` : '—'}</td>
              <td className="text-text-2">{r.supplierName ?? '—'}</td>
              <td className="num">{r.sold30} {r.baseUnit}s</td>
              <td className="text-text-2">{r.lastSold ? formatDateIN(r.lastSold) : 'Never'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-text-2"><span>{q.data.length} {q.data.length === 1 ? 'item' : 'items'} below minimum</span><Button size="sm" onClick={() => nav({ to: '/purchases/new' })}>Receive stock</Button></div>
    </>
  );
}

// ---------- Opening stock ----------
interface OpenRow { key: number; item: ItemSearchRow | null; batchNo: string; expiry: string; mrp: number; rate: number; packs: string }
const blankRow = (key: number): OpenRow => ({ key, item: null, batchNo: '', expiry: '', mrp: 0, rate: 0, packs: '' });

function OpeningStockSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [rows, setRows] = useState<OpenRow[]>([blankRow(1)]);
  const [error, setError] = useState<{ title: string; fields: { path: string; message: string }[] } | null>(null);
  const patch = (key: number, p: Partial<OpenRow>) => setRows((l) => l.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = () => setRows((l) => [...l, blankRow((l.at(-1)?.key ?? 0) + 1)]);
  const filled = rows.filter((r) => r.item || r.batchNo || r.expiry || r.packs);
  const problems = (r: OpenRow) => {
    const p: string[] = [];
    if (!r.item) p.push('choose an item');
    if (!r.batchNo.trim()) p.push('batch no');
    if (!parseExpiry(r.expiry)) p.push('expiry as MM/YY');
    if (r.mrp <= 0) p.push('MRP');
    if (!(Math.floor(Number(r.packs)) >= 1)) p.push('qty in packs');
    return p;
  };
  const totalUnits = filled.reduce((a, r) => a + (r.item ? Math.floor(Number(r.packs) || 0) * r.item.unitsPerPack : 0), 0);
  const m = useMutation({
    mutationFn: () => api.post<{ batchIds: number[] }>('/batches/opening', { rows: filled.map((r) => ({ itemId: r.item!.id, batchNo: r.batchNo.trim(), expiryDate: parseExpiry(r.expiry), mrpPaise: r.mrp, purchaseRatePaise: r.rate, qtyUnits: Math.floor(Number(r.packs)) * r.item!.unitsPerPack })) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['batches'] }); qc.invalidateQueries({ queryKey: ['items'] }); qc.invalidateQueries({ queryKey: ['item-batches-detail'] }); qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`Opening stock booked for ${filled.length} ${filled.length === 1 ? 'batch' : 'batches'}`, 'You can print labels for them from the Labels page.');
      onClose();
      if (res.batchIds.length) nav({ to: '/inventory', search: (s) => ({ ...s, view: undefined, q: undefined, page: 1 }) });
    },
    onError: (e) => setError(describeError(e)),
  });
  const submit = () => {
    if (filled.length === 0) { setError({ title: 'Add at least one row', fields: [] }); return; }
    const bad = filled.map((r, i) => ({ i, p: problems(r) })).filter((x) => x.p.length);
    if (bad.length) { setError({ title: 'Some rows are incomplete', fields: bad.map((b) => ({ path: `Row ${b.i + 1}`, message: `needs ${b.p.join(', ')}` })) }); return; }
    setError(null); m.mutate();
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Opening stock" width="xl" description="Book stock that is already on the shelf without a supplier invoice. Quantities are in packs; units are worked out from the item's pack size."
      footer={<><span className="mr-auto text-sm text-text-2">{filled.length} {filled.length === 1 ? 'row' : 'rows'} · {totalUnits} units</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={submit}>Book opening stock</Button></>}>
      <div className="space-y-3">
        {error && <Callout tone="danger" title={error.title}>{error.fields.length > 0 && <ul className="list-disc pl-5">{error.fields.map((f, i) => <li key={i}>{f.path}: {f.message}</li>)}</ul>}</Callout>}
        <div className="overflow-auto">
          <table className="tbl dense min-w-215">
            <thead><tr><th className="w-[26%]">Item</th><th>Batch no</th><th className="w-24">Expiry</th><th className="w-28">MRP ₹</th><th className="w-28">Purchase rate ₹</th><th className="w-24">Qty (packs)</th><th className="w-28">Units</th><th className="w-10"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>{rows.map((r, i) => {
              const exp = parseExpiry(r.expiry);
              return (
                <tr key={r.key} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); const cells = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input, button[role=combobox]')); const idx = cells.indexOf(e.target as HTMLElement); if (idx >= 0 && idx < cells.length - 2) cells[idx + 1]!.focus(); else if (i === rows.length - 1) { add(); setTimeout(() => document.getElementById(`open-item-${r.key + 1}`)?.focus(), 0); } } }}>
                  <td><ItemPicker id={`open-item-${r.key}`} dense value={r.item} onPick={(it) => patch(r.key, { item: it, mrp: r.mrp || it?.mrpPaise || 0 })} placeholder="Item" /></td>
                  <td><Input dense aria-label={`Batch no, row ${i + 1}`} value={r.batchNo} onChange={(e) => patch(r.key, { batchNo: e.target.value })} /></td>
                  <td><Input dense aria-label={`Expiry MM/YY, row ${i + 1}`} placeholder="MM/YY" value={r.expiry} invalid={!!r.expiry && !exp} onChange={(e) => patch(r.key, { expiry: e.target.value })} />{r.expiry && !exp && <p role="alert" className="mt-0.5 text-[11px] text-danger">Use MM/YY</p>}</td>
                  <td><MoneyInput dense aria-label={`MRP, row ${i + 1}`} valuePaise={r.mrp} onChangePaise={(p) => patch(r.key, { mrp: p })} placeholder="0.00" /></td>
                  <td><MoneyInput dense aria-label={`Purchase rate, row ${i + 1}`} valuePaise={r.rate} onChangePaise={(p) => patch(r.key, { rate: p })} placeholder="0.00" /></td>
                  <td><Input dense type="number" min={1} inputMode="numeric" aria-label={`Quantity in packs, row ${i + 1}`} value={r.packs} onChange={(e) => patch(r.key, { packs: e.target.value })} /></td>
                  <td className="text-sm text-text-2">{r.item ? `${Math.floor(Number(r.packs) || 0) * r.item.unitsPerPack} ${r.item.baseUnit}s` : '—'}{r.item && r.item.unitsPerPack > 1 && <div className="text-[11px]">{r.item.unitsPerPack}/{r.item.packName}</div>}</td>
                  <td><Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((l) => (l.length === 1 ? [blankRow(1)] : l.filter((x) => x.key !== r.key)))}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={add}>Add row</Button>
        <p className="text-xs text-text-2">Tip: press Enter to move across a row; Enter on the last cell adds a new row. Purchase rate is optional but makes stock valuation and margin reports accurate.</p>
      </div>
    </Sheet>
  );
}
