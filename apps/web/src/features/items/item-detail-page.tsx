import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Printer, ShoppingCart } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { parseExpiry } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { cn, formatDateIN, formatDateTimeIN, formatExpiry, formatStock, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, ConfirmDialog, Dialog, EmptyState, ExpiryBadge, Field, Input, Money, MoneyInput, NativeSelect, PageHeader, ScheduleBadge, Spinner, Stat, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { tallManText } from '../billing/item-search';
import { ItemFormSheet } from './item-form-sheet';
import { BATCH_STATUS_LABEL, STOCK_REASON_LABEL, describeError, packOf, type BatchRow, type ItemFull, type ItemSearchRow, type LedgerRow } from './item-shared';

export function ItemDetailPage() {
  const { id } = useParams({ from: '/app/items/$id' });
  const nav = useNavigate();
  const { can } = useAuth();
  const today = todayIST();
  const [editOpen, setEditOpen] = useState(false);
  const item = useQuery({ queryKey: ['item', id], queryFn: () => api.get<ItemFull>(`/items/${id}`) });
  const batches = useQuery({
    queryKey: ['item-batches-detail', id],
    queryFn: async () => {
      // /items/:id/batches returns active batches only; pull quarantined/returned/disposed ones with stock via /batches.
      const [active, ...others] = await Promise.all([
        api.get<BatchRow[]>(`/items/${id}/batches`, { includeEmpty: true }),
        ...(['quarantined', 'returned', 'disposed'] as const).map((status) => api.get<{ rows: BatchRow[] }>('/batches', { itemId: id, status, pageSize: 500 }).then((r) => r.rows)),
      ]);
      const seen = new Set<number>();
      return [...active, ...others.flat()].filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true))).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    },
  });
  const it = item.data;
  const stats = useMemo(() => {
    const rows = (batches.data ?? []).filter((b) => b.status === 'active' && b.qtyUnits > 0);
    const upp = it?.unitsPerPack ?? 1;
    const sellable = rows.filter((b) => b.expiryDate >= today);
    return {
      units: sellable.reduce((a, b) => a + b.qtyUnits, 0),
      mrp: rows.reduce((a, b) => a + Math.round((b.qtyUnits * b.mrpPaise) / upp), 0),
      cost: rows.reduce((a, b) => a + Math.round((b.qtyUnits * b.purchaseRatePaise) / upp), 0),
      nearest: sellable[0]?.expiryDate ?? null,
      inStockIds: rows.filter((b) => b.expiryDate >= today).map((b) => b.id),
    };
  }, [batches.data, it, today]);

  if (item.isLoading) return <Spinner />;
  if (!it) return <Callout tone="danger" title="Item not found">{item.error ? describeError(item.error).title : 'It may have been removed.'} <Link to="/items" className="text-accent underline">Back to items</Link></Callout>;

  return (
    <div>
      <PageHeader title={it.name} description={<span className="flex flex-wrap items-center gap-2"><span>{it.genericText ? tallManText(it.genericText) : 'No composition on file'}</span>{it.manufacturer && <span>· {it.manufacturer}</span>}<span>· {it.form}</span><ScheduleBadge schedule={it.schedule} />{it.narcotic && <Badge tone="danger">Narcotic</Badge>}{it.coldChain && <Badge tone="accent">Cold chain 2–8 °C</Badge>}{it.notForSale && <Badge tone="danger">Not for sale</Badge>}{!it.active && <Badge tone="neutral">Inactive</Badge>}</span>}
        actions={<>
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav({ to: '/items' })}>All items</Button>
          {can('label.print') && <Button icon={<Printer className="h-4 w-4" />} disabled={stats.inStockIds.length === 0} onClick={() => nav({ to: '/labels', search: { batchIds: stats.inStockIds.map((b) => `${b}:1`).join(',') } })}>Print labels</Button>}
          {!it.notForSale && <Button icon={<ShoppingCart className="h-4 w-4" />} onClick={() => nav({ to: '/billing' })}>Bill this item</Button>}
          {can('item.write') && <Button variant="primary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>Edit</Button>}
        </>} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="In stock" value={formatStock(stats.units, packOf(it))} sub={stats.units === 0 ? 'Out of stock' : it.minStockUnits > 0 && stats.units <= it.minStockUnits ? `Low · min ${it.minStockUnits}` : undefined} tone={stats.units === 0 ? 'danger' : it.minStockUnits > 0 && stats.units <= it.minStockUnits ? 'warning' : 'neutral'} />
        <Stat label="Value at MRP" value={rupees(stats.mrp)} />
        <Stat label="Value at cost" value={rupees(stats.cost)} />
        <Stat label="Nearest expiry" value={stats.nearest ? formatExpiry(stats.nearest) : '—'} sub={stats.nearest ? <ExpiryBadge expiryDate={stats.nearest} today={today} /> : undefined} />
        <Stat label="Rack" value={it.rack ?? '—'} />
        <Stat label="Min / max" value={`${it.minStockUnits} / ${it.maxStockUnits || '—'}`} sub={it.reorderQtyPacks ? `Reorder ${it.reorderQtyPacks} ${it.packName}s` : 'units'} />
      </div>

      <Tabs defaultValue="batches">
        <TabsList><TabsTrigger value="batches" count={batches.data?.length}>Batches</TabsTrigger><TabsTrigger value="movements">Movements</TabsTrigger><TabsTrigger value="subs">Substitutes</TabsTrigger><TabsTrigger value="details">Details</TabsTrigger></TabsList>
        <TabsContent value="batches" className="pt-4"><BatchesTab item={it} batches={batches} today={today} /></TabsContent>
        <TabsContent value="movements" className="pt-4"><MovementsTab id={id} /></TabsContent>
        <TabsContent value="subs" className="pt-4"><SubstitutesTab id={id} today={today} /></TabsContent>
        <TabsContent value="details" className="pt-4"><DetailsTab item={it} /></TabsContent>
      </Tabs>

      <ItemFormSheet open={editOpen} onOpenChange={setEditOpen} item={it} />
    </div>
  );
}

// ---------- Batches ----------
type BatchAction = { kind: 'adjust' | 'edit'; batch: BatchRow } | { kind: 'status'; batch: BatchRow; status: 'active' | 'quarantined' | 'disposed' } | null;

function BatchesTab({ item, batches, today }: { item: ItemFull; batches: UseQueryResult<BatchRow[]>; today: string }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const [action, setAction] = useState<BatchAction>(null);
  if (batches.isLoading) return <Spinner />;
  if (batches.isError) return <Callout tone="danger" title="Could not load batches">{describeError(batches.error).title}</Callout>;
  const rows = batches.data ?? [];
  if (rows.length === 0) return <EmptyState title="No batches yet" action={can('purchase.create') ? <Button variant="primary" onClick={() => nav({ to: '/purchases/new' })}>Receive stock</Button> : undefined}>Stock arrives through a purchase receipt or opening stock.</EmptyState>;
  const adjust = can('stock.adjust');
  return (
    <>
      <div className="table-wrap">
        <table className="tbl dense">
          <thead><tr><th>Batch</th><th>Expiry</th><th className="num">MRP</th><th className="num">Purchase rate</th><th className="num">Stock</th><th>Supplier</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map((b) => {
            const expired = b.expiryDate < today;
            const tone = b.status === 'quarantined' || expired ? 'danger' : undefined;
            return (
              <tr key={b.id} data-tone={b.qtyUnits > 0 ? tone : undefined} className={cn(b.qtyUnits === 0 && 'text-text-3')}>
                <td className="font-medium">{b.batchNo}{b.mfgDate && <div className="text-[11px] font-normal text-text-2">Mfg {formatExpiry(b.mfgDate)}</div>}</td>
                <td><ExpiryBadge expiryDate={b.expiryDate} today={today} /></td>
                <td className="num"><Money paise={b.mrpPaise} /></td>
                <td className="num"><Money paise={b.purchaseRatePaise} /></td>
                <td className="num">{b.qtyUnits === 0 ? <span>Empty</span> : formatStock(b.qtyUnits, packOf(b))}</td>
                <td className="text-text-2">{b.supplierName ?? '—'}</td>
                <td>{b.status === 'active' ? (expired && b.qtyUnits > 0 ? <Badge tone="danger">Expired · segregate</Badge> : <Badge tone="success">Active</Badge>) : <Badge tone={b.status === 'quarantined' ? 'warning' : 'neutral'}>{BATCH_STATUS_LABEL[b.status]}</Badge>}</td>
                <td>
                  <div className="flex flex-wrap justify-end gap-1">
                    {adjust && b.status !== 'returned' && b.status !== 'disposed' && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'adjust', batch: b })}>Adjust</Button>}
                    {adjust && b.status === 'active' && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'status', batch: b, status: 'quarantined' })}>Quarantine</Button>}
                    {adjust && b.status === 'quarantined' && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'status', batch: b, status: 'active' })}>Reactivate</Button>}
                    {adjust && (b.status === 'active' || b.status === 'quarantined') && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'status', batch: b, status: 'disposed' })}>Dispose</Button>}
                    {adjust && b.status !== 'returned' && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'edit', batch: b })}>Edit batch</Button>}
                    {can('label.print') && <Button size="sm" variant="ghost" onClick={() => nav({ to: '/labels', search: { batchIds: `${b.id}:1` } })}>Label</Button>}
                    {can('purchase.return') && b.qtyUnits > 0 && b.status !== 'returned' && b.status !== 'disposed' && <Button size="sm" variant="ghost" onClick={() => nav({ to: '/purchases/returns', search: { batchId: b.id, supplierId: b.supplierId ?? undefined } })}>Return to supplier</Button>}
                  </div>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {action?.kind === 'adjust' && <AdjustDialog batch={action.batch} item={item} onClose={() => setAction(null)} />}
      {action?.kind === 'edit' && <EditBatchDialog batch={action.batch} onClose={() => setAction(null)} />}
      {action?.kind === 'status' && <StatusDialog batch={action.batch} status={action.status} onClose={() => setAction(null)} />}
    </>
  );
}

function useBatchInvalidate(itemId: number) {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ['item-batches-detail', String(itemId)] }); qc.invalidateQueries({ queryKey: ['item-ledger', String(itemId)] }); qc.invalidateQueries({ queryKey: ['batches'] }); qc.invalidateQueries({ queryKey: ['items'] }); qc.invalidateQueries({ queryKey: ['item-batches'] }); };
}

function AdjustDialog({ batch, item, onClose }: { batch: BatchRow; item: ItemFull; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useBatchInvalidate(item.id);
  const [dir, setDir] = useState<'+' | '-'>('+');
  const [units, setUnits] = useState('');
  const [reason, setReason] = useState<'adjustment' | 'disposal'>('adjustment');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const n = Math.floor(Number(units) || 0);
  const delta = dir === '+' ? n : -n;
  const after = batch.qtyUnits + delta;
  const m = useMutation({
    mutationFn: () => api.post('/batches/adjust', { batchId: batch.id, qtyDeltaUnits: delta, reason, note }),
    onSuccess: () => { invalidate(); toast.success('Stock adjusted', `${batch.itemName} ${batch.batchNo}: now ${formatStock(after, packOf(batch))}`); onClose(); },
    onError: (e) => setError(describeError(e).title),
  });
  const submit = () => {
    if (n <= 0) { setError('Enter how many units to add or remove.'); return; }
    if (after < 0) { setError(`Only ${batch.qtyUnits} units are in this batch; you cannot remove ${n}.`); return; }
    if (note.trim().length < 3) { setError('Give a short reason — it goes into the audit log.'); return; }
    setError(null); m.mutate();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Adjust stock · ${batch.batchNo}`} description={`${batch.itemName} · currently ${formatStock(batch.qtyUnits, packOf(batch))} (${batch.qtyUnits} ${batch.baseUnit}s)`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={submit}>Save adjustment</Button></>}>
      <div className="space-y-3">
        {error && <Callout tone="danger" title={error} />}
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div role="radiogroup" aria-label="Direction" className="flex gap-1 self-end">
            <button type="button" role="radio" aria-checked={dir === '+'} onClick={() => setDir('+')} className={cn('h-11 rounded-md border px-4 text-sm font-medium', dir === '+' ? 'border-accent bg-accent-bg text-accent' : 'border-border')}>+ Add</button>
            <button type="button" role="radio" aria-checked={dir === '-'} onClick={() => setDir('-')} className={cn('h-11 rounded-md border px-4 text-sm font-medium', dir === '-' ? 'border-accent bg-accent-bg text-accent' : 'border-border')}>− Remove</button>
          </div>
          <Field label={`Units (${batch.baseUnit}s)`} required hint={batch.unitsPerPack > 1 ? `${batch.unitsPerPack} ${batch.baseUnit}s = 1 ${batch.packName}. After: ${formatStock(Math.max(0, after), packOf(batch))}` : `After: ${Math.max(0, after)}`}>{(id, d) => <Input id={id} aria-describedby={d} type="number" min={1} inputMode="numeric" autoFocus value={units} onChange={(e) => setUnits(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />}</Field>
        </div>
        <Field label="Type">{(id) => <NativeSelect id={id} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}><option value="adjustment">Count correction (physical stock differs)</option><option value="disposal">Disposal / breakage</option></NativeSelect>}</Field>
        <Field label="Reason" required hint="Recorded in the stock ledger and audit log.">{(id, d) => <Textarea id={id} aria-describedby={d} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Physical count on 12/09: 3 strips short" />}</Field>
      </div>
    </Dialog>
  );
}

function StatusDialog({ batch, status, onClose }: { batch: BatchRow; status: 'active' | 'quarantined' | 'disposed'; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useBatchInvalidate(batch.itemId);
  const [reason, setReason] = useState('');
  const copy = {
    quarantined: { title: `Put batch ${batch.batchNo} in quarantine?`, label: 'Put in quarantine', body: 'The batch stays in stock but cannot be billed until you reactivate it. Use this for expired, recalled or damaged stock before returning it to the supplier.' },
    active: { title: `Reactivate batch ${batch.batchNo}?`, label: 'Reactivate', body: 'The batch becomes sellable again immediately.' },
    disposed: { title: `Dispose of batch ${batch.batchNo}?`, label: 'Dispose', body: `All ${batch.qtyUnits} remaining units are written off and the batch is closed. This cannot be undone; if the supplier will take it back, use “Return to supplier” instead.` },
  }[status];
  const m = useMutation({
    mutationFn: () => api.post(`/batches/${batch.id}/status`, { status, note: reason }),
    onSuccess: () => { invalidate(); toast.success(copy.label, `${batch.itemName} · ${batch.batchNo}`); onClose(); },
    onError: (e) => toast.error('Could not change status', describeError(e).title),
  });
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={copy.title} confirmLabel={copy.label} tone={status === 'active' ? 'primary' : 'danger'} onConfirm={() => m.mutate()} loading={m.isPending} requireReason reason={reason} onReason={setReason}>
      <p>{copy.body}</p>
    </ConfirmDialog>
  );
}

function EditBatchDialog({ batch, onClose }: { batch: BatchRow; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useBatchInvalidate(batch.itemId);
  const [expiry, setExpiry] = useState(formatExpiry(batch.expiryDate));
  const [mfg, setMfg] = useState(batch.mfgDate ? formatExpiry(batch.mfgDate) : '');
  const [mrp, setMrp] = useState(batch.mrpPaise);
  const [batchNo, setBatchNo] = useState(batch.batchNo);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const expiryIso = parseExpiry(expiry);
  const mfgIso = mfg.trim() ? parseExpiry(mfg) : null;
  const m = useMutation({
    mutationFn: () => api.put(`/batches/${batch.id}`, { expiryDate: expiryIso, mrpPaise: mrp, batchNo: batchNo.trim(), mfgDate: mfg.trim() ? mfgIso?.replace(/-\d{2}$/, '-01') : null, reason }),
    onSuccess: () => { invalidate(); toast.success('Batch updated'); onClose(); },
    onError: (e) => setError(describeError(e).title),
  });
  const submit = () => {
    if (!expiryIso) { setError('Expiry must be MM/YY or MM/YYYY, e.g. 08/27.'); return; }
    if (mfg.trim() && !mfgIso) { setError('Mfg date must be MM/YY or blank.'); return; }
    if (!batchNo.trim()) { setError('Batch number cannot be blank.'); return; }
    if (reason.trim().length < 3) { setError('Give a short reason — it goes into the audit log.'); return; }
    setError(null); m.mutate();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Edit batch ${batch.batchNo}`} description={`${batch.itemName}. Correct typing mistakes here; quantities are changed with “Adjust”.`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={submit}>Save changes</Button></>}>
      <div className="space-y-3">
        {error && <Callout tone="danger" title={error} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Batch no" required>{(id) => <Input id={id} value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />}</Field>
          <Field label="MRP per pack" required>{(id) => <MoneyInput id={id} valuePaise={mrp} onChangePaise={setMrp} />}</Field>
          <Field label="Expiry (MM/YY)" required error={expiry && !expiryIso ? 'Use MM/YY, e.g. 08/27' : null} hint={expiryIso ? `Sellable through ${formatDateIN(expiryIso)}` : undefined}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!expiry && !expiryIso} value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="MM/YY" />}</Field>
          <Field label="Mfg (MM/YY)" error={mfg.trim() && !mfgIso ? 'Use MM/YY' : null}>{(id) => <Input id={id} value={mfg} onChange={(e) => setMfg(e.target.value)} placeholder="Optional" />}</Field>
        </div>
        <Field label="Reason" required hint="Recorded in the audit log.">{(id, d) => <Textarea id={id} aria-describedby={d} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Expiry typed wrongly at receipt" />}</Field>
      </div>
    </Dialog>
  );
}

// ---------- Movements ----------
function MovementsTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['item-ledger', id], queryFn: () => api.get<LedgerRow[]>(`/items/${id}/ledger`) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <Callout tone="danger" title="Could not load movements">{describeError(q.error).title}</Callout>;
  if (!q.data?.length) return <EmptyState title="No movements yet">Receipts, sales, returns and adjustments will appear here.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="tbl dense">
        <thead><tr><th>When</th><th>Batch</th><th className="num">Qty</th><th className="num">Balance</th><th>Reason</th><th>Document</th><th>By</th><th>Note</th></tr></thead>
        <tbody>{q.data.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap">{formatDateTimeIN(r.createdAt)}</td>
            <td>{r.batchNo}</td>
            <td className={cn('num font-medium', r.qtyDelta < 0 ? 'text-danger' : 'text-success')}>{r.qtyDelta > 0 ? '+' : ''}{r.qtyDelta}</td>
            <td className="num">{r.balanceAfter}</td>
            <td>{STOCK_REASON_LABEL[r.reason] ?? r.reason}</td>
            <td className="text-text-2">{r.docType ? <DocLink type={r.docType} id={r.docId} /> : '—'}</td>
            <td className="text-text-2">{r.userName ?? '—'}</td>
            <td className="max-w-xs truncate text-text-2" title={r.note ?? undefined}>{r.note ?? ''}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function DocLink({ type, id }: { type: string; id: number | null }) {
  if (!id) return <>{type}</>;
  if (type === 'GRN') return <Link to="/purchases/$id" params={{ id: String(id) }} className="text-accent hover:underline">GRN #{id}</Link>;
  if (type === 'SALE' || type === 'INV') return <Link to="/sales/$id" params={{ id: String(id) }} className="text-accent hover:underline">Bill #{id}</Link>;
  return <>{type} #{id}</>;
}

// ---------- Substitutes ----------
function SubstitutesTab({ id, today }: { id: string; today: string }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['item-subs', Number(id)], queryFn: () => api.get<ItemSearchRow[]>(`/items/${id}/substitutes`) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <Callout tone="danger" title="Could not load substitutes">{describeError(q.error).title}</Callout>;
  if (!q.data?.length) return <EmptyState title="No in-stock substitute">Substitutes are other brands with the same salts and strengths that are currently in stock. Add the composition to items so they can be matched.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="tbl dense">
        <thead><tr><th>Brand</th><th>Manufacturer</th><th className="num">MRP</th><th className="num">Stock</th><th>Nearest expiry</th><th>Rack</th></tr></thead>
        <tbody>{q.data.map((s) => (
          <tr key={s.id} className="cursor-pointer" tabIndex={0} onClick={() => nav({ to: '/items/$id', params: { id: String(s.id) } })} onKeyDown={(e) => { if (e.key === 'Enter') nav({ to: '/items/$id', params: { id: String(s.id) } }); }}>
            <td><span className="font-medium">{s.name}</span> <ScheduleBadge schedule={s.schedule} /></td>
            <td className="text-text-2">{s.manufacturer ?? '—'}</td>
            <td className="num"><Money paise={s.mrpPaise} /></td>
            <td className="num">{formatStock(s.stockUnits, packOf(s))}</td>
            <td>{s.nearestExpiry ? <ExpiryBadge expiryDate={s.nearestExpiry} today={today} /> : '—'}</td>
            <td>{s.rack ?? '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ---------- Details ----------
function DetailsTab({ item: it }: { item: ItemFull }) {
  const rows: [string, ReactNode][] = [
    ['Name', it.name], ['Form', it.form], ['Manufacturer', it.manufacturer ?? '—'], ['Composition', it.genericText || '—'],
    ['Salts', it.salts.length ? <ul className="list-disc pl-4">{it.salts.map((s) => <li key={s.id}>{s.salt}{s.strength ? ` ${s.strength}${s.unit ? ` ${s.unit}` : ''}` : ''}</li>)}</ul> : '—'],
    ['HSN', it.hsn], ['GST rate', `${it.gstRatePct}%`], ['Schedule', it.schedule === 'NONE' ? 'None' : `Schedule ${it.schedule}`], ['Narcotic', it.narcotic ? 'Yes' : 'No'], ['Cold chain', it.coldChain ? 'Yes (2–8 °C)' : 'No'], ['Not for sale', it.notForSale ? 'Yes — blocked at billing' : 'No'],
    ['Pack', `${it.unitsPerPack} ${it.baseUnit}${it.unitsPerPack === 1 ? '' : 's'} per ${it.packName}${it.packsPerBox ? ` · ${it.packsPerBox} ${it.packName}s per box` : ''}`], ['Loose sale', it.allowLoose ? 'Allowed' : 'Not allowed'],
    ['Rack', it.rack ?? '—'], ['Minimum stock', `${it.minStockUnits} units`], ['Maximum stock', it.maxStockUnits ? `${it.maxStockUnits} units` : '—'], ['Reorder quantity', it.reorderQtyPacks ? `${it.reorderQtyPacks} ${it.packName}s` : '—'],
    ['EAN / GTIN', it.ean ?? '—'], ['Active', it.active ? 'Yes' : 'No'], ['Notes', it.notes ?? '—'], ['Created', formatDateTimeIN(it.createdAt)], ['Updated', formatDateTimeIN(it.updatedAt)],
  ];
  return (
    <div className="card p-4">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-text-2">{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  );
}
