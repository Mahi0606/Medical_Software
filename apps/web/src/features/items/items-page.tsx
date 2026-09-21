import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PackageX, Plus, Search, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SCHEDULES } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatStock, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, Dialog, EmptyState, ExpiryBadge, Input, Money, NativeSelect, PageHeader, Pagination, ScheduleBadge, Spinner } from '@/components/ui';
import { tallManText } from '../billing/item-search';
import { ItemFormSheet } from './item-form-sheet';
import { describeError, packOf, type ItemSearchRow } from './item-shared';

type Mode = 'any' | 'name' | 'salt' | 'rack';
const MODES: { id: Mode; label: string }[] = [{ id: 'any', label: 'Any' }, { id: 'name', label: 'Brand' }, { id: 'salt', label: 'Salt' }, { id: 'rack', label: 'Rack' }];
const PAGE = 50;

export function ItemsPage() {
  const search = useSearch({ from: '/app/items' });
  const nav = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState(search.q ?? '');
  const [formOpen, setFormOpen] = useState(!!search.new);
  const [importOpen, setImportOpen] = useState(false);
  const today = todayIST();
  const page = search.page ?? 1;
  const mode = (search.mode as Mode | undefined) ?? 'any';
  const inStockOnly = search.status === 'instock';
  const showInactive = search.tab === 'all';
  const schedule = search.from && (SCHEDULES as readonly string[]).includes(search.from) ? search.from : '';

  useEffect(() => { if (search.new) setFormOpen(true); }, [search.new]);
  useEffect(() => { setQ(search.q ?? ''); }, [search.q]);

  const query = useQuery({
    queryKey: ['items', search.q ?? '', mode, inStockOnly, showInactive, schedule, page],
    queryFn: () => api.get<{ rows: ItemSearchRow[]; total: number }>('/items', { q: search.q || undefined, mode, inStockOnly: inStockOnly || undefined, schedule: schedule || undefined, active: showInactive ? undefined : true, page, pageSize: PAGE }),
    placeholderData: (p) => p,
  });
  const set = (patch: Partial<typeof search>) => nav({ to: '/items', search: (s) => ({ ...s, page: 1, ...patch }) });

  return (
    <div>
      <PageHeader title="Items" description="Every medicine and product you stock. Open an item to see its batches, movements and substitutes."
        actions={<>{can('item.write') && <Button icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Import CSV</Button>}{can('item.write') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>New item</Button>}</>} />

      <form className="mb-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || undefined }); }}>
        <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Brand, salt, rack or barcode" aria-label="Search items" addonStart={<Search className="h-4 w-4" />} className="w-72" data-scan="allow" />
        <div role="radiogroup" aria-label="Search by" className="flex gap-1">
          {MODES.map((m) => <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => set({ mode: m.id === 'any' ? undefined : m.id })} className={cn('h-9 rounded-full border px-3 text-xs font-medium', mode === m.id ? 'border-accent bg-accent-bg text-accent' : 'border-border text-text-2 hover:bg-surface-2')}>{m.label}</button>)}
        </div>
        <button type="button" aria-pressed={inStockOnly} onClick={() => set({ status: inStockOnly ? undefined : 'instock' })} className={cn('h-9 rounded-full border px-3 text-xs font-medium', inStockOnly ? 'border-accent bg-accent-bg text-accent' : 'border-border text-text-2 hover:bg-surface-2')}>In stock only</button>
        <NativeSelect dense value={schedule} onChange={(e) => set({ from: e.target.value || undefined })} aria-label="Schedule" className="w-40"><option value="">All schedules</option>{SCHEDULES.map((s) => <option key={s} value={s}>{s === 'NONE' ? 'No schedule' : `Schedule ${s}`}</option>)}</NativeSelect>
        <label className="flex items-center gap-2 text-sm text-text-2"><input type="checkbox" className="h-4 w-4" checked={showInactive} onChange={(e) => set({ tab: e.target.checked ? 'all' : undefined })} />Show inactive</label>
        <Button type="submit" size="sm">Search</Button>
      </form>

      <div className="table-wrap">
        {query.isLoading ? <div className="p-6"><Spinner /></div> : query.isError ? <div className="p-4"><Callout tone="danger" title="Could not load items">{describeError(query.error).title}. Check the connection and try again.</Callout></div> : !query.data?.rows.length ? (
          <EmptyState icon={PackageX} title={search.q ? `No items match “${search.q}”` : 'No items yet'} action={can('item.write') ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setFormOpen(true)}>Add {search.q ? `“${search.q}”` : 'your first item'}</Button> : undefined}>
            {search.q ? 'Try the salt name, another spelling, or turn off “In stock only”.' : 'Create items one by one or import a CSV from your old software.'}
          </EmptyState>
        ) : (
          <table className="tbl dense">
            <thead><tr><th>Item</th><th>Schedule</th><th className="num">Stock</th><th className="num">MRP</th><th>Nearest expiry</th><th>Rack</th><th>HSN / GST</th></tr></thead>
            <tbody>{query.data.rows.map((r) => {
              const out = r.stockUnits <= 0;
              const low = !out && r.minStockUnits > 0 && r.stockUnits <= r.minStockUnits;
              return (
                <tr key={r.id} className={cn('cursor-pointer', !r.active && 'opacity-60')} onClick={() => nav({ to: '/items/$id', params: { id: String(r.id) } })} onKeyDown={(e) => { if (e.key === 'Enter') nav({ to: '/items/$id', params: { id: String(r.id) } }); }} tabIndex={0} aria-label={`Open ${r.name}`}>
                  <td>
                    <div className="flex flex-wrap items-center gap-x-2"><span className="font-semibold text-[15px]">{r.name}</span>{!r.active && <Badge tone="neutral">Inactive</Badge>}{r.notForSale && <Badge tone="danger">Not for sale</Badge>}{r.coldChain && <Badge tone="accent">Cold chain</Badge>}</div>
                    <div className="text-xs text-text-2">{r.genericText ? tallManText(r.genericText) : <span className="italic">No composition</span>}{r.manufacturer && <> · {r.manufacturer}</>} · {r.form}</div>
                  </td>
                  <td><ScheduleBadge schedule={r.schedule} /></td>
                  <td className="num">{out ? <Badge tone="danger" icon={PackageX}>Out</Badge> : <span className={cn(low && 'font-medium text-warning')}>{formatStock(r.stockUnits, packOf(r))}{low && <span className="block text-[11px]">Low · min {r.minStockUnits}</span>}</span>}</td>
                  <td className="num"><Money paise={r.mrpPaise} /></td>
                  <td>{r.nearestExpiry ? <ExpiryBadge expiryDate={r.nearestExpiry} today={today} /> : <span className="text-text-3">—</span>}</td>
                  <td>{r.rack ?? <span className="text-text-3">—</span>}</td>
                  <td className="text-text-2">{r.hsn} · {r.gstRatePct}%</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
      {query.data && <div className="mt-3 flex justify-end"><Pagination page={page} pageSize={PAGE} total={query.data.total} onPage={(p) => nav({ to: '/items', search: (s) => ({ ...s, page: p }) })} /></div>}

      <ItemFormSheet open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o && search.new) nav({ to: '/items', search: (s) => ({ ...s, new: undefined }) }); }} onSaved={(it) => nav({ to: '/items/$id', params: { id: String(it.id) } })} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const m = useMutation({
    mutationFn: (f: File) => api.upload<{ created: number; updated: number; skipped: number; errors: { row: number; message: string }[] }>('/items/import', f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); qc.invalidateQueries({ queryKey: ['manufacturers'] }); },
  });
  const close = () => { onOpenChange(false); setFile(null); m.reset(); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title="Import items from CSV" size="lg" description="Existing items (same name) are updated; new names are created."
      footer={<><Button variant="ghost" onClick={close}>{m.data ? 'Close' : 'Cancel'}</Button>{!m.data && <Button variant="primary" loading={m.isPending} onClick={() => { if (file) m.mutate(file); else inputRef.current?.focus(); }}>Import</Button>}</>}>
      <div className="space-y-3 text-sm">
        <label className="block font-medium">CSV file<input ref={inputRef} type="file" accept=".csv,text/csv" className="mt-1 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        {!file && !m.data && <p className="text-text-2">Choose a file to continue.</p>}
        <details className="rounded border border-border p-3"><summary className="cursor-pointer font-medium">Accepted column headers</summary>
          <p className="mt-2 text-text-2">Header names are case-insensitive. Only <span className="font-medium text-text">name</span> is required.</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-text-2 sm:grid-cols-3">{['name', 'generic', 'form', 'manufacturer', 'hsn', 'gst', 'schedule', 'units_per_pack', 'pack_name', 'base_unit', 'rack', 'ean', 'min_stock'].map((h) => <li key={h}><code className="kbd">{h}</code></li>)}</ul>
          <p className="mt-2 text-xs text-text-2">Example: <code>name,generic,form,manufacturer,hsn,gst,schedule,units_per_pack,pack_name,base_unit,rack,ean,min_stock</code></p>
        </details>
        {m.isError && <Callout tone="danger" title="Import failed">{describeError(m.error).title}. Check that the file is a CSV with a header row.</Callout>}
        {m.data && (
          <Callout tone={m.data.errors.length ? 'warning' : 'success'} title={`${m.data.created} created · ${m.data.updated} updated · ${m.data.skipped} skipped`}>
            {m.data.errors.length > 0 ? <><p>{m.data.errors.length} {m.data.errors.length === 1 ? 'row' : 'rows'} could not be imported. Fix these rows and import the file again; already-imported rows will simply be updated.</p><ul className="mt-1 max-h-48 list-disc overflow-auto pl-5">{m.data.errors.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}</ul></> : 'All rows imported.'}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
