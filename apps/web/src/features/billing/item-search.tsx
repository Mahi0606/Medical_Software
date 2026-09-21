import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, ChevronDown, ChevronUp, PackageX, Search } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Schedule } from '@pharma/shared';
import { data } from '@/lib/offline';
import { cn, formatStock, tallMan, todayIST } from '@/lib/utils';
import { Badge, Button, ExpiryBadge, Money, ScheduleBadge, Spinner } from '@/components/ui';

export interface ItemRow { id: number; name: string; form: string; manufacturer: string | null; genericText: string; hsn: string; gstRatePct: number; schedule: Schedule; baseUnit: string; unitsPerPack: number; packName: string; allowLoose: boolean; rack: string | null; ean: string | null; notForSale: boolean; stockUnits: number; nearestExpiry: string | null; mrpPaise: number | null; batchCount: number }
export interface BatchRow { id: number; itemId: number; batchNo: string; expiryDate: string; mrpPaise: number; purchaseRatePaise: number; qtyUnits: number; status: string; itemName: string; genericText: string; unitsPerPack: number; packName: string; baseUnit: string; allowLoose: boolean; rack: string | null; schedule: Schedule; gstRatePct: number; hsn: string; notForSale: boolean; manufacturer: string | null; supplierName: string | null }

export type SearchMode = 'any' | 'name' | 'salt' | 'rack';
export interface ItemSearchHandle { focus: () => void; clear: () => void }

interface Props { onPick: (batch: BatchRow, item: ItemRow) => void; inStockOnly: boolean; onToggleInStock: () => void; onScan: (raw: string) => void }

export const ItemSearch = forwardRef<ItemSearchHandle, Props>(function ItemSearch({ onPick, inStockOnly, onToggleInStock, onScan }, ref) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [mode, setMode] = useState<SearchMode>('any');
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [subsFor, setSubsFor] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayIST();
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), clear: () => { setQ(''); setDebounced(''); setExpanded(null); } }));
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 140); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setActive(0); setExpanded(null); setSubsFor(null); }, [debounced, mode, inStockOnly]);

  const search = useQuery({
    queryKey: ['items-search', debounced, mode, inStockOnly],
    queryFn: () => data.searchItems({ q: debounced, mode, inStockOnly, pageSize: 25 }) as Promise<{ rows: ItemRow[]; total: number }>,
    enabled: debounced.length >= 1, placeholderData: (p) => p,
  });
  const rows = useMemo(() => search.data?.rows ?? [], [search.data]);
  const expandedItem = rows.find((r) => r.id === expanded) ?? null;
  const batches = useQuery({ queryKey: ['item-batches', expanded], queryFn: () => data.itemBatches(expanded!) as Promise<BatchRow[]>, enabled: expanded !== null });
  const subs = useQuery({ queryKey: ['item-subs', subsFor], queryFn: () => data.substitutes(subsFor!) as Promise<ItemRow[]>, enabled: subsFor !== null });

  // Enter adds the first-expiry batch straight away; → or the chevron opens the batch list.
  const pickItem = async (item: ItemRow, openBatches = false) => {
    if (item.notForSale) return;
    if (openBatches) { setExpanded(item.id); return; }
    const typed = q; // clear only what was typed for this pick, never text typed afterwards
    const list = (await data.itemBatches(item.id)) as BatchRow[];
    const sellable = list.filter((b) => b.expiryDate >= today && b.qtyUnits > 0);
    if (sellable[0]) { onPick(sellable[0], item); setQ((cur) => (cur === typed ? '' : cur)); setDebounced((cur) => (cur === typed.trim() ? '' : cur)); inputRef.current?.focus(); }
    else { setExpanded(item.id); setSubsFor(item.id); }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const raw = q.trim();
      if (/^(PB|PI)\d{4,}$/i.test(raw) || /^\d{8,14}$/.test(raw) || raw.startsWith(']') || /^https?:/.test(raw)) { onScan(raw); setQ(''); return; }
      const r = rows[active]; if (r) void pickItem(r);
    }
    else if (e.key === 'ArrowRight' && rows[active]) { e.preventDefault(); setExpanded(rows[active]!.id); }
    else if (e.key === 'Escape') { setQ(''); setExpanded(null); }
  };

  const modes: { id: SearchMode; label: string }[] = [{ id: 'any', label: 'Any' }, { id: 'name', label: 'Brand' }, { id: 'salt', label: 'Salt / composition' }, { id: 'rack', label: 'Rack' }];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-3" aria-hidden />
          <input ref={inputRef} data-scan="allow" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} autoFocus autoComplete="off" spellCheck={false} type="search" aria-describedby="item-search-help" aria-label="Search items by brand, salt, rack or scan a barcode"
            placeholder="Type brand or salt, or scan a barcode…" className="h-12 w-full rounded-md border border-border-strong/80 bg-surface pl-10 pr-16 text-base placeholder:text-text-3" />
          <span className="kbd absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>F2</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="radiogroup" aria-label="Search by" className="flex gap-1">
            {modes.map((m) => <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className={cn('h-8 rounded-full border px-3 text-xs font-medium', mode === m.id ? 'border-accent bg-accent-bg text-accent' : 'border-border text-text-2 hover:bg-surface-2')}>{m.label}</button>)}
          </div>
          <button onClick={onToggleInStock} aria-pressed={inStockOnly} className={cn('ml-auto h-8 rounded-full border px-3 text-xs font-medium', inStockOnly ? 'border-accent bg-accent-bg text-accent' : 'border-border text-text-2')}>In stock only <span className="kbd ml-1">F10</span></button>
        </div>
      </div>
      <p id="item-search-help" className="sr-only">Use up and down arrows to highlight a result, Enter to add it to the bill, right arrow to choose a batch.</p>
      <div className="sr-only" aria-live="polite">{rows[active] && debounced ? `${rows[active]!.name}, ${rows[active]!.stockUnits > 0 ? 'in stock' : 'out of stock'}. Press Enter to add.` : ''}</div>
      <div className="min-h-0 flex-1 overflow-auto" id="item-results" role="region" aria-label="Matching items" tabIndex={-1}>
        {debounced.length === 0 && (
          <div className="p-6 text-sm text-text-2">
            <p className="font-medium text-text">Start typing to find an item</p>
            <ul className="mt-2 list-disc space-y-1 pl-5"><li>First letters of the brand, e.g. <span className="font-medium">dol</span> for Dolo</li><li>Salt name, e.g. <span className="font-medium">parac</span> for paracetamol</li><li>Scan the pack barcode or our shelf label</li><li><span className="kbd">↑</span> <span className="kbd">↓</span> to move, <span className="kbd">Enter</span> to add, <span className="kbd">→</span> to choose a batch</li></ul>
          </div>
        )}
        {search.isFetching && rows.length === 0 && <div className="p-4"><Spinner /></div>}
        {search.isError && <div className="m-3 rounded-md border border-danger-border bg-danger-bg p-3 text-sm text-danger" role="alert">Search failed: {(search.error as Error).message}</div>}
        {debounced && !search.isFetching && !search.isError && rows.length === 0 && <div className="p-6 text-sm text-text-2">No items match “{debounced}”{inStockOnly && ' in stock'}. Try the salt name or turn off “In stock only”.</div>}
        {rows.map((r, i) => {
          const out = r.stockUnits <= 0;
          const isExp = expanded === r.id;
          return (
            <div key={r.id} className={cn('border-b border-border', i === active && 'bg-accent-bg/60')}>
              <div className={cn('flex items-center gap-3 px-3 py-2', r.notForSale && 'opacity-60')} onMouseEnter={() => setActive(i)} onDoubleClick={() => setExpanded(r.id)}>
                <button type="button" id={`item-opt-${r.id}`} onClick={() => void pickItem(r)} disabled={r.notForSale} aria-label={`Add ${r.name}${r.notForSale ? ' (not for sale)' : ''}`} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-[15px] font-semibold">{r.name}</span><ScheduleBadge schedule={r.schedule} />{r.notForSale && <Badge tone="danger">Not for sale</Badge>}{r.rack && <span className="text-xs text-text-2">Rack {r.rack}</span>}</div>
                  <div className="truncate text-xs text-text-2">{r.genericText ? tallManText(r.genericText) : <span className="italic">No composition on file</span>}{r.manufacturer && <> · {r.manufacturer}</>} · {r.unitsPerPack > 1 ? `${r.unitsPerPack} ${r.baseUnit}s/${r.packName}` : r.packName}</div>
                </div>
                <div className="hidden w-28 text-right sm:block"><Money paise={r.mrpPaise} className="text-sm font-medium" /><div className="text-[11px] text-text-2">MRP / {r.packName}</div></div>
                <div className="w-32 text-right">
                  {out ? <Badge tone="danger" icon={PackageX}>Out of stock</Badge> : <><div className={cn('text-sm font-medium', r.stockUnits <= r.unitsPerPack * 2 && 'text-warning')}>{formatStock(r.stockUnits, { baseUnit: r.baseUnit, unitsPerPack: r.unitsPerPack, packName: r.packName, allowLoose: r.allowLoose })}</div>{r.nearestExpiry && <ExpiryBadge expiryDate={r.nearestExpiry} today={today} />}</>}
                </div>
                </button>
                <button type="button" aria-label={isExp ? `Hide batches of ${r.name}` : `Choose batch for ${r.name}`} aria-expanded={isExp} onClick={() => setExpanded(isExp ? null : r.id)} className="rounded p-1.5 text-text-2 hover:bg-surface-2">{isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
              </div>
              {isExp && (
                <div className="border-t border-border bg-surface-2/60 px-3 py-2">
                  {batches.isLoading ? <Spinner /> : (
                    <>
                      {(batches.data ?? []).filter((b) => b.qtyUnits > 0).length === 0 ? <p className="text-sm text-text-2">No stock in any batch.</p> : (
                        <table className="w-full text-sm">
                          <thead><tr className="text-left text-xs text-text-2"><th className="py-1 font-medium">Batch</th><th className="font-medium">Expiry</th><th className="text-right font-medium">MRP</th><th className="text-right font-medium">Stock</th><th /></tr></thead>
                          <tbody>{(batches.data ?? []).filter((b) => b.qtyUnits > 0).map((b, bi) => { const expired = b.expiryDate < today; return (
                            <tr key={b.id} className={cn(expired && 'text-text-3')}>
                              <td className="py-1 font-medium">{b.batchNo}{bi === 0 && !expired && <Badge tone="accent" className="ml-2">FEFO</Badge>}</td><td><ExpiryBadge expiryDate={b.expiryDate} today={today} /></td><td className="text-right"><Money paise={b.mrpPaise} /></td>
                              <td className="text-right">{formatStock(b.qtyUnits, { baseUnit: b.baseUnit, unitsPerPack: b.unitsPerPack, packName: b.packName, allowLoose: b.allowLoose })}</td>
                              <td className="py-1 text-right"><Button size="sm" variant={bi === 0 ? 'primary' : 'secondary'} disabled={expired || r.notForSale} onClick={() => { onPick(b, expandedItem!); setQ(''); setDebounced(''); setExpanded(null); inputRef.current?.focus(); }}>{expired ? 'Expired' : 'Add'}</Button></td>
                            </tr>); })}</tbody>
                        </table>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <Button size="sm" variant="ghost" icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setSubsFor(subsFor === r.id ? null : r.id)}>Substitutes with the same salt</Button>
                      </div>
                      {subsFor === r.id && (
                        <div className="mt-1 rounded border border-border bg-surface p-2">
                          {subs.isLoading ? <Spinner /> : (subs.data ?? []).length === 0 ? <p className="text-sm text-text-2">No in-stock substitute with the same composition and strength.</p> : (
                            <ul className="divide-y divide-border">{subs.data!.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 text-sm"><span><span className="font-medium">{s.name}</span> <span className="text-text-2">{s.manufacturer}</span> · <Money paise={s.mrpPaise} /></span><Button size="sm" onClick={() => void pickItem(s)}>Add</Button></li>)}</ul>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

/** Apply Tall Man lettering to each salt word in a composition string. */
export function tallManText(generic: string): string {
  return generic.split(' + ').map((part) => { const [first, ...rest] = part.split(' '); return [tallMan(first ?? ''), ...rest].join(' '); }).join(' + ');
}
