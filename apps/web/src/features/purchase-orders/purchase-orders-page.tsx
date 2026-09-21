import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ClipboardPlus, Plus, RefreshCw, Search, ShoppingCart } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { formatDateIN, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, Field, Input, Money, NativeSelect, PageHeader, Pagination, Spinner, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { describeError } from '../items/item-shared';
import { SupplierPicker, type Supplier } from '../purchases/supplier-picker';
import { PO_STATUS, PoStatusBadge, type PoRow, type PoStatus, type PurchaseOrder, type ReorderGroup, type ReorderLine, type ReorderResponse } from './po-shared';

const PAGE = 50;
const COVER = [15, 30, 45, 60];
const WINDOW = [30, 60, 90];

export function PurchaseOrdersPage() {
  const search = useSearch({ from: '/app/purchase-orders' });
  const nav = useNavigate();
  const { can } = useAuth();
  const tab = search.tab === 'orders' ? 'orders' : 'suggestions';
  const suppliers = useQuery({ queryKey: ['suppliers', 'all-active'], queryFn: () => api.get<Supplier[]>('/suppliers') });
  const set = (patch: Partial<typeof search>) => nav({ to: '/purchase-orders', search: (s) => ({ ...s, page: 1, ...patch }) });
  return (
    <div>
      <PageHeader title="Reorder & purchase orders" description="See what is running low, turn it into an order per supplier, and track what has arrived."
        actions={can('purchase.create') ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => nav({ to: '/purchase-orders/new', search: {} })}>New PO</Button> : undefined} />
      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'orders' ? 'orders' : undefined, q: undefined, status: undefined, from: undefined, to: undefined })}>
        <TabsList><TabsTrigger value="suggestions">Reorder suggestions</TabsTrigger><TabsTrigger value="orders">Purchase orders</TabsTrigger></TabsList>
        <TabsContent value="suggestions"><SuggestionsTab supplierId={search.supplierId} suppliers={suppliers.data ?? []} onSupplier={(id) => set({ supplierId: id })} /></TabsContent>
        <TabsContent value="orders"><OrdersTab suppliers={suppliers.data ?? []} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Reorder suggestions ----------
type Pick = { checked: boolean; qty: string };

function SuggestionsTab({ supplierId, suppliers, onSupplier }: { supplierId?: number; suppliers: Supplier[]; onSupplier: (id: number | undefined) => void }) {
  const nav = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [coverDays, setCoverDays] = useState(30);
  const [windowDays, setWindowDays] = useState(90);
  const [onlyBelowMin, setOnlyBelowMin] = useState(false);
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [manualSupplier, setManualSupplier] = useState<Supplier | null>(null);
  const q = useQuery({ queryKey: ['reorder', coverDays, windowDays, onlyBelowMin, supplierId], queryFn: () => api.get<ReorderResponse>('/reorder', { coverDays, windowDays, onlyBelowMin, supplierId }), placeholderData: (p) => p });

  // Seed the checkbox + qty for every line the first time it appears; keep the user's edits afterwards.
  useEffect(() => {
    if (!q.data) return;
    setPicks((prev) => {
      const next = { ...prev };
      for (const g of q.data!.groups) for (const l of g.lines) if (!next[l.itemId]) next[l.itemId] = { checked: l.suggestedPacks > 0, qty: String(l.suggestedPacks || l.reorderQtyPacks || 1) };
      return next;
    });
  }, [q.data]);

  const create = useMutation({
    mutationFn: (body: { supplierId: number; lines: { itemId: number; qtyPacks: number; ratePaise: number | null; mrpPaise: number | null; note: string | null }[] }) =>
      api.post<PurchaseOrder>('/purchase-orders', { supplierId: body.supplierId, date: todayIST(), expectedDate: null, notes: `From reorder suggestions: ${coverDays} days of cover, ${windowDays}-day sales window`, lines: body.lines }),
    onSuccess: (po) => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['reorder'] }); toast.success(`${po.poNo} created as a draft`, 'Review it, then mark it as sent.'); nav({ to: '/purchase-orders/$id', params: { id: String(po.id) } }); },
    onError: (e) => toast.error('Could not create the order', describeError(e).title),
  });

  const chosen = (g: ReorderGroup) => g.lines.filter((l) => picks[l.itemId]?.checked && qtyOf(l) >= 1);
  const qtyOf = (l: ReorderLine) => Math.max(0, Math.floor(Number(picks[l.itemId]?.qty) || 0));
  const groupTotal = (g: ReorderGroup) => chosen(g).reduce((s, l) => s + qtyOf(l) * (l.lastRatePaise ?? 0), 0);
  const createFor = (g: ReorderGroup) => {
    const sid = g.supplierId ?? manualSupplier?.id;
    if (!sid) { toast.warn('Pick a supplier first', 'These items have no supplier on their last batch.'); return; }
    const lines = chosen(g).map((l) => ({ itemId: l.itemId, qtyPacks: qtyOf(l), ratePaise: l.lastRatePaise || null, mrpPaise: l.mrpPaise || null, note: l.reason }));
    if (!lines.length) { toast.warn('Nothing ticked', 'Tick at least one item to order.'); return; }
    create.mutate({ supplierId: sid, lines });
  };
  const setAll = (g: ReorderGroup, checked: boolean) => setPicks((p) => { const n = { ...p }; for (const l of g.lines) n[l.itemId] = { checked, qty: n[l.itemId]?.qty ?? String(l.suggestedPacks || 1) }; return n; });
  const totals = useMemo(() => { const gs = q.data?.groups ?? []; const lines = gs.flatMap((g) => g.lines); const ticked = lines.filter((l) => picks[l.itemId]?.checked && qtyOf(l) >= 1); return { items: lines.length, ticked: ticked.length, packs: ticked.reduce((s, l) => s + qtyOf(l), 0), amount: ticked.reduce((s, l) => s + qtyOf(l) * (l.lastRatePaise ?? 0), 0) }; }, [q.data, picks]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-3 space-y-3">
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <Field label="Order enough for"><NativeSelect dense value={coverDays} onChange={(e) => setCoverDays(Number(e.target.value))} aria-label="Days of cover" className="w-32">{COVER.map((d) => <option key={d} value={d}>{d} days</option>)}</NativeSelect></Field>
        <Field label="Based on sales in the last"><NativeSelect dense value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} aria-label="Sales window" className="w-32">{WINDOW.map((d) => <option key={d} value={d}>{d} days</option>)}</NativeSelect></Field>
        <Field label="Supplier"><NativeSelect dense value={supplierId ?? ''} onChange={(e) => onSupplier(e.target.value ? Number(e.target.value) : undefined)} aria-label="Filter by supplier" className="w-56"><option value="">All suppliers</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <div className="flex h-9 items-center gap-2"><Switch id="only-min" checked={onlyBelowMin} onCheckedChange={setOnlyBelowMin} /><label htmlFor="only-min" className="text-sm">Only items below minimum</label></div>
        <Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4" />} loading={q.isFetching} onClick={() => q.refetch()} className="ml-auto">Refresh</Button>
      </div>
      <Callout tone="accent">Suggested packs = daily sales over the last {windowDays} days × {coverDays} days, minus stock on hand and packs already on order, rounded up to whole packs; anything at or below its minimum gets at least its reorder quantity.</Callout>

      {q.isLoading ? <div className="p-6"><Spinner /></div> : q.isError ? <Callout tone="danger" title="Could not work out suggestions">{describeError(q.error).title}</Callout> : !q.data?.groups.length ? (
        <div className="card"><EmptyState icon={ShoppingCart} title="Nothing needs ordering right now">{onlyBelowMin ? 'No item is at or below its minimum stock. Turn the switch off to see items that will run out within the cover period.' : 'Every item has enough stock for the chosen number of days, or is already on order.'}</EmptyState></div>
      ) : (
        <>
          <p className="text-sm text-text-2" aria-live="polite">{totals.items} {totals.items === 1 ? 'item' : 'items'} suggested · {totals.ticked} ticked · {totals.packs} packs{totals.amount > 0 && <> · about <span className="font-medium text-text">{rupees(totals.amount)}</span> at last rates</>} · as of {new Date(q.data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
          {q.data.groups.map((g) => {
            const sel = chosen(g);
            const allOn = g.lines.every((l) => picks[l.itemId]?.checked);
            return (
              <section key={g.supplierId ?? 'none'} className="card overflow-hidden" aria-labelledby={`grp-${g.supplierId ?? 'none'}`}>
                <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h2 id={`grp-${g.supplierId ?? 'none'}`} className="text-base font-semibold">{g.supplierId ? <Link to="/suppliers" search={{ id: g.supplierId }} className="hover:underline">{g.supplierName}</Link> : g.supplierName}</h2>
                    <p className="text-xs text-text-2">{g.lines.length} {g.lines.length === 1 ? 'item' : 'items'}{g.supplierPhone && ` · ${g.supplierPhone}`}{sel.length > 0 && <> · ticked {sel.reduce((s, l) => s + qtyOf(l), 0)} packs ≈ {rupees(groupTotal(g))}</>}</p>
                  </div>
                  {!g.supplierId && <div className="w-64"><SupplierPicker dense value={manualSupplier} onChange={setManualSupplier} allowCreate={false} /></div>}
                  <Button size="sm" variant="ghost" onClick={() => setAll(g, !allOn)}>{allOn ? 'Untick all' : 'Tick all'}</Button>
                  {can('purchase.create') && <Button variant="primary" icon={<ClipboardPlus className="h-4 w-4" />} loading={create.isPending} disabled={sel.length === 0} onClick={() => createFor(g)}>Create PO for {g.supplierId ? g.supplierName.split(' ')[0] : manualSupplier?.name.split(' ')[0] ?? 'supplier'} ({sel.length} {sel.length === 1 ? 'line' : 'lines'})</Button>}
                </div>
                <div className="overflow-auto">
                  <table className="tbl dense min-w-240">
                    <thead><tr><th className="w-10"><span className="sr-only">Order</span></th><th>Item</th><th className="num">In stock</th><th className="num">Min</th><th className="num">Sold / day</th><th className="num">Lasts</th><th className="num">On order</th><th>Why</th><th className="num">Last rate</th><th className="w-28">Order (packs)</th><th className="num">Amount</th></tr></thead>
                    <tbody>{g.lines.map((l) => {
                      const p = picks[l.itemId] ?? { checked: false, qty: String(l.suggestedPacks) };
                      const qty = qtyOf(l);
                      return (
                        <tr key={l.itemId} data-state={p.checked ? 'selected' : undefined} data-tone={l.stockUnits <= 0 ? 'danger' : l.belowMin ? 'warning' : undefined}>
                          <td><input type="checkbox" className="h-5 w-5" aria-label={`Order ${l.itemName}`} checked={p.checked} onChange={(e) => setPicks((s) => ({ ...s, [l.itemId]: { ...p, checked: e.target.checked } }))} /></td>
                          <td><Link to="/items/$id" params={{ id: String(l.itemId) }} className="font-medium text-accent hover:underline">{l.itemName}</Link><div className="text-[11px] text-text-2">{l.genericText}{l.rack && ` · Rack ${l.rack}`} · {l.unitsPerPack}/{l.packName}</div></td>
                          <td className="num">{l.stockUnits} <span className="text-text-2">u</span></td>
                          <td className="num text-text-2">{l.minStockUnits || '—'}</td>
                          <td className="num">{l.velocityPerDay > 0 ? l.velocityPerDay : <span className="text-text-2">0</span>}</td>
                          <td className="num">{l.daysOfCover === null ? <span className="text-text-2">—</span> : `${Math.floor(l.daysOfCover)} d`}</td>
                          <td className="num">{l.pendingPacks > 0 ? `${l.pendingPacks} pk` : <span className="text-text-2">—</span>}</td>
                          <td><Badge tone={l.stockUnits <= 0 ? 'danger' : l.belowMin ? 'warning' : l.suggestedPacks > 0 ? 'accent' : 'neutral'}>{l.reason}</Badge></td>
                          <td className="num">{l.lastRatePaise ? <Money paise={l.lastRatePaise} /> : <span className="text-text-2">—</span>}</td>
                          <td><Input dense type="number" min={0} inputMode="numeric" aria-label={`Packs to order for ${l.itemName}`} value={p.qty} onChange={(e) => setPicks((s) => ({ ...s, [l.itemId]: { checked: Number(e.target.value) > 0, qty: e.target.value } }))} className="num" /></td>
                          <td className="num">{p.checked && qty > 0 && l.lastRatePaise ? <Money paise={qty * l.lastRatePaise} /> : ''}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

// ---------- Purchase orders list ----------
function OrdersTab({ suppliers }: { suppliers: Supplier[] }) {
  const search = useSearch({ from: '/app/purchase-orders' });
  const nav = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState(search.q ?? '');
  useEffect(() => { setQ(search.q ?? ''); }, [search.q]);
  const page = search.page ?? 1;
  const status = (search.status && search.status in PO_STATUS ? search.status : undefined) as PoStatus | undefined;
  const set = (patch: Partial<typeof search>) => nav({ to: '/purchase-orders', search: (s) => ({ ...s, page: 1, ...patch }) });
  const list = useQuery({ queryKey: ['purchase-orders', search.q, status, search.supplierId, search.from, search.to, page], queryFn: () => api.get<{ rows: PoRow[]; total: number }>('/purchase-orders', { q: search.q, status, supplierId: search.supplierId, from: search.from, to: search.to, page, pageSize: PAGE }), placeholderData: (p) => p });
  const filtered = !!(search.q || status || search.supplierId || search.from || search.to);
  return (
    <div className="mt-3">
      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || undefined }); }}>
        <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="PO no or supplier" aria-label="Search purchase orders" addonStart={<Search className="h-4 w-4" />} className="w-64" />
        <NativeSelect dense value={status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })} aria-label="Status" className="w-44"><option value="">All statuses</option>{(Object.keys(PO_STATUS) as PoStatus[]).map((s) => <option key={s} value={s}>{PO_STATUS[s].label}</option>)}</NativeSelect>
        <NativeSelect dense value={search.supplierId ?? ''} onChange={(e) => set({ supplierId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Supplier" className="w-56"><option value="">All suppliers</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
        <label className="text-xs text-text-2">From<Input dense type="date" value={search.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} aria-label="From date" /></label>
        <label className="text-xs text-text-2">To<Input dense type="date" value={search.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} aria-label="To date" /></label>
        <Button type="submit" size="sm">Search</Button>
        {filtered && <Button type="button" size="sm" variant="ghost" onClick={() => set({ q: undefined, status: undefined, supplierId: undefined, from: undefined, to: undefined })}>Clear</Button>}
      </form>
      <div className="table-wrap">
        {list.isLoading ? <div className="p-6"><Spinner /></div> : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load purchase orders">{describeError(list.error).title}</Callout></div> : !list.data?.rows.length ? (
          <EmptyState icon={ClipboardPlus} title={filtered ? 'No orders match these filters' : 'No purchase orders yet'} action={can('purchase.create') && !filtered ? <Button variant="primary" onClick={() => nav({ to: '/purchase-orders/new', search: {} })}>New PO</Button> : undefined}>{filtered ? 'Widen the date range or clear the search.' : 'Start from the Reorder suggestions tab, or write an order by hand.'}</EmptyState>
        ) : (
          <table className="tbl dense">
            <thead><tr><th>PO no</th><th>Date</th><th>Supplier</th><th className="num">Lines</th><th className="num">Estimated</th><th>Received</th><th>Status</th></tr></thead>
            <tbody>{list.data.rows.map((r) => {
              const pctDone = r.orderedPacks > 0 ? Math.round((r.receivedPacks / r.orderedPacks) * 100) : 0;
              return (
                <tr key={r.id} className="cursor-pointer" tabIndex={0} onClick={() => nav({ to: '/purchase-orders/$id', params: { id: String(r.id) } })} onKeyDown={(e) => { if (e.key === 'Enter') nav({ to: '/purchase-orders/$id', params: { id: String(r.id) } }); }} aria-label={`Open ${r.poNo ?? `order ${r.id}`}`} data-tone={r.status === 'cancelled' ? 'danger' : undefined}>
                  <td><span className="font-medium text-accent">{r.poNo ?? `#${r.id}`}</span>{r.sentAt && <div className="text-[11px] text-text-2">Sent {formatDateIN(r.sentAt.slice(0, 10))}</div>}</td>
                  <td>{formatDateIN(r.date)}{r.expectedDate && <div className="text-[11px] text-text-2">Due {formatDateIN(r.expectedDate)}</div>}</td>
                  <td><Link to="/suppliers" search={{ id: r.supplierId }} className="hover:underline" onClick={(e) => e.stopPropagation()}>{r.supplierName}</Link></td>
                  <td className="num">{r.lineCount}</td>
                  <td className="num">{r.estimatedPaise > 0 ? <Money paise={r.estimatedPaise} /> : <span className="text-text-2">—</span>}</td>
                  <td>{r.status === 'draft' || r.status === 'cancelled' ? <span className="text-text-2">—</span> : <span className="num">{r.receivedPacks} / {r.orderedPacks} pk · {pctDone}%</span>}</td>
                  <td><PoStatusBadge status={r.status} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
      {list.data && <div className="mt-3 flex justify-end"><Pagination page={page} pageSize={PAGE} total={list.data.total} onPage={(p) => nav({ to: '/purchase-orders', search: (s) => ({ ...s, page: p }) })} /></div>}
    </div>
  );
}
