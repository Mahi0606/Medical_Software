import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '@/lib/api';
import { rupees, todayIST } from '@/lib/utils';
import { Button, Callout, Field, Input, Money, MoneyInput, Textarea } from '@/components/ui';
import { ItemPicker } from '../items/item-picker';
import { type BatchRow, type DescribedError, type ItemSearchRow } from '../items/item-shared';
import { SupplierPicker, type Supplier } from '../purchases/supplier-picker';
import type { PurchaseOrder } from './po-shared';

export interface EditLine { key: number; itemId: number | null; itemName: string; packName: string; unitsPerPack: number; stockUnits: number | null; qty: string; ratePaise: number; mrpPaise: number; note: string }
export interface EditorValue { supplier: Supplier | null; date: string; expectedDate: string; notes: string; lines: EditLine[]; nextKey: number }
export interface PoPayload { supplierId: number; date: string; expectedDate: string | null; notes: string | null; lines: { itemId: number; qtyPacks: number; ratePaise: number | null; mrpPaise: number | null; note: string | null }[] }

const blankLine = (key: number): EditLine => ({ key, itemId: null, itemName: '', packName: 'pack', unitsPerPack: 1, stockUnits: null, qty: '', ratePaise: 0, mrpPaise: 0, note: '' });
export const hasContent = (l: EditLine) => !!(l.itemId || l.qty || l.ratePaise || l.note);

export function blankEditor(supplier: Supplier | null = null): EditorValue {
  return { supplier, date: todayIST(), expectedDate: '', notes: '', lines: [blankLine(1), blankLine(2), blankLine(3)], nextKey: 4 };
}

/** Editor value from an existing PO (for editing a draft). */
export function editorFromPo(po: PurchaseOrder): EditorValue {
  const s = po.supplier;
  const supplier: Supplier = { id: s.id, name: s.name, phone: s.phone, email: s.email, gstin: s.gstin, drugLicenceNo: s.drugLicenceNo, address: s.address, city: s.city, stateCode: s.stateCode, creditDays: 0, active: true };
  const lines = po.lines.map((l, i) => ({ key: i + 1, itemId: l.itemId, itemName: l.itemName, packName: l.packName, unitsPerPack: l.unitsPerPack, stockUnits: l.stockUnits, qty: String(l.qtyPacks), ratePaise: l.ratePaise ?? 0, mrpPaise: l.mrpPaise ?? 0, note: l.note ?? '' }));
  return { supplier, date: po.date, expectedDate: po.expectedDate ?? '', notes: po.notes ?? '', lines: lines.length ? lines : [blankLine(1)], nextKey: lines.length + 1 };
}

export function validateEditor(v: EditorValue): DescribedError | null {
  const f: { path: string; message: string }[] = [];
  if (!v.supplier) f.push({ path: 'Supplier', message: 'choose who the order goes to' });
  if (!v.date) f.push({ path: 'Order date', message: 'required' });
  const active = v.lines.filter(hasContent);
  if (active.length === 0) f.push({ path: 'Lines', message: 'add at least one item' });
  active.forEach((l, i) => {
    const p: string[] = [];
    if (!l.itemId) p.push('item');
    if (!(Math.floor(Number(l.qty)) >= 1)) p.push('qty in packs');
    if (p.length) f.push({ path: `Line ${i + 1}${l.itemName ? ` (${l.itemName})` : ''}`, message: `needs ${p.join(' and ')}` });
  });
  return f.length ? { title: 'A few things are missing before this can be saved', fields: f } : null;
}

export function editorPayload(v: EditorValue): PoPayload {
  return {
    supplierId: v.supplier!.id, date: v.date, expectedDate: v.expectedDate || null, notes: v.notes.trim() || null,
    lines: v.lines.filter(hasContent).map((l) => ({ itemId: l.itemId!, qtyPacks: Math.max(1, Math.floor(Number(l.qty) || 0)), ratePaise: l.ratePaise || null, mrpPaise: l.mrpPaise || null, note: l.note.trim() || null })),
  };
}

/** onChange takes an updater so async prefill (last purchase rate) never clobbers edits made in the meantime. */
interface Props { value: EditorValue; onChange: (update: (prev: EditorValue) => EditorValue) => void; error: DescribedError | null; errorRef?: React.RefObject<HTMLDivElement | null>; idPrefix?: string; supplierLocked?: boolean }

/** Header fields + lines grid shared by the new-PO page and the draft-edit sheet. Enter moves across a row; Enter on the last cell adds a row. */
export function PoEditor({ value: v, onChange, error, errorRef, idPrefix = 'po', supplierLocked }: Props) {
  const [pickedRate, setPickedRate] = useState<Record<number, number>>({});
  const localRef = useRef<HTMLDivElement>(null);
  const ref = errorRef ?? localRef;
  const setLine = useCallback((key: number, patch: Partial<EditLine>) => onChange((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })), [onChange]);
  const set = (patch: Partial<EditorValue>) => onChange((p) => ({ ...p, ...patch }));
  const addLine = (): number => { const k = v.nextKey; onChange((p) => ({ ...p, lines: [...p.lines, blankLine(k)], nextKey: k + 1 })); return k; };
  const removeLine = (key: number) => onChange((p) => ({ ...p, lines: p.lines.length === 1 ? [blankLine(p.nextKey)] : p.lines.filter((l) => l.key !== key), nextKey: p.nextKey + 1 }));
  const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 60);

  const pickItem = async (key: number, it: ItemSearchRow | null) => {
    if (!it) { setLine(key, { itemId: null, itemName: '' }); return; }
    setLine(key, { itemId: it.id, itemName: it.name, packName: it.packName, unitsPerPack: it.unitsPerPack, stockUnits: it.stockUnits, mrpPaise: it.mrpPaise ?? 0, ratePaise: pickedRate[it.id] ?? 0 });
    focus(`${idPrefix}-qty-${key}`);
    if (pickedRate[it.id] === undefined) {
      // Best effort: prefill the expected rate from the most recent batch's purchase rate.
      try {
        const batches = await api.get<BatchRow[]>(`/items/${it.id}/batches`, { includeEmpty: true });
        const last = [...batches].sort((a, b) => b.id - a.id)[0];
        const rate = last?.purchaseRatePaise ?? 0;
        setPickedRate((m) => ({ ...m, [it.id]: rate }));
        if (rate > 0) onChange((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key && l.itemId === it.id ? { ...l, ratePaise: l.ratePaise || rate } : l)) }));
      } catch { /* rate stays blank */ }
    }
  };

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, key: number, isLast: boolean) => {
    if (e.key !== 'Enter') return;
    const t = e.target as HTMLElement;
    if (!(t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    e.preventDefault();
    const cells = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input:not([type=hidden]), select, button[role=combobox]'));
    const i = cells.indexOf(t);
    if (i >= 0 && i < cells.length - 1) { cells[i + 1]!.focus(); return; }
    if (isLast) { const k = addLine(); focus(`${idPrefix}-item-${k}`); } else { const next = v.lines[v.lines.findIndex((l) => l.key === key) + 1]; if (next) focus(`${idPrefix}-item-${next.key}`); }
  };

  const active = useMemo(() => v.lines.filter(hasContent), [v.lines]);
  const totals = useMemo(() => active.reduce((a, l) => { const q = Math.max(0, Math.floor(Number(l.qty) || 0)); return { packs: a.packs + q, amount: a.amount + q * l.ratePaise }; }, { packs: 0, amount: 0 }), [active]);

  return (
    <div className="space-y-4">
      {error && <div ref={ref} tabIndex={-1} className="outline-none"><Callout tone="danger" title={error.title}>{error.detail}{error.fields.length > 0 && <ul className="list-disc pl-5">{error.fields.map((f, i) => <li key={i}>{f.path ? <><span className="font-medium">{f.path}</span>: </> : null}{f.message}</li>)}</ul>}</Callout></div>}

      <section className="card p-4" aria-labelledby={`${idPrefix}-h-head`}>
        <h2 id={`${idPrefix}-h-head`} className="sr-only">Order header</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Supplier" required className="xl:col-span-2" htmlFor={`${idPrefix}-supplier`} hint={supplierLocked ? 'The supplier cannot change once the order exists.' : undefined}>{(id) => supplierLocked ? <Input id={id} value={v.supplier?.name ?? ''} readOnly /> : <SupplierPicker id={id} value={v.supplier} onChange={(s) => set({ supplier: s })} allowClear />}</Field>
          <Field label="Order date" required>{(id) => <Input id={id} type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} />}</Field>
          <Field label="Expected delivery" hint="Shown to the supplier on the order.">{(id, d) => <Input id={id} aria-describedby={d} type="date" min={v.date} value={v.expectedDate} onChange={(e) => set({ expectedDate: e.target.value })} />}</Field>
        </div>
        <Field label="Notes to supplier" className="mt-3">{(id) => <Textarea id={id} rows={2} className="min-h-11" value={v.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Deliver before 11 am; no short-expiry batches" />}</Field>
      </section>

      <section className="card overflow-hidden" aria-labelledby={`${idPrefix}-h-lines`}>
        <h2 id={`${idPrefix}-h-lines`} className="sr-only">Order lines</h2>
        <div className="overflow-auto">
          <table className="tbl dense min-w-220">
            <caption className="sr-only">Lines on this order. Press Enter to move to the next cell; Enter on the last cell adds a line.</caption>
            <thead><tr><th className="w-8">#</th><th className="min-w-65">Item</th><th className="num w-24">In stock</th><th className="w-24">Qty (packs)</th><th className="w-32">Expected rate ₹</th><th className="w-32">MRP ₹</th><th className="w-44">Note</th><th className="num w-28">Amount</th><th className="w-10"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>{v.lines.map((l, i) => {
              const filled = hasContent(l);
              const q = Math.max(0, Math.floor(Number(l.qty) || 0));
              return (
                <tr key={l.key} onKeyDown={(e) => onRowKey(e, l.key, i === v.lines.length - 1)}>
                  <td className="text-text-2">{i + 1}</td>
                  <td>
                    <ItemPicker id={`${idPrefix}-item-${l.key}`} ariaLabel={`Item for line ${i + 1}`} dense value={l.itemId ? { id: l.itemId, name: l.itemName } : null} onPick={(it) => void pickItem(l.key, it)} invalid={filled && !l.itemId} placeholder="Item" />
                    {l.itemId && <div className="mt-0.5 text-[11px] text-text-2">{l.unitsPerPack} {l.unitsPerPack === 1 ? 'unit' : 'units'}/{l.packName}</div>}
                  </td>
                  <td className="num text-text-2">{l.itemId && l.stockUnits !== null ? `${l.stockUnits} u` : ''}</td>
                  <td><Input id={`${idPrefix}-qty-${l.key}`} dense type="number" min={1} inputMode="numeric" aria-label={`Quantity in packs, line ${i + 1}`} value={l.qty} invalid={filled && q < 1} onChange={(e) => setLine(l.key, { qty: e.target.value })} className="num" /></td>
                  <td><MoneyInput dense aria-label={`Expected rate per pack, line ${i + 1}`} valuePaise={l.ratePaise} onChangePaise={(p) => setLine(l.key, { ratePaise: p })} placeholder="0.00" /></td>
                  <td><MoneyInput dense aria-label={`MRP per pack, line ${i + 1}`} valuePaise={l.mrpPaise} onChangePaise={(p) => setLine(l.key, { mrpPaise: p })} placeholder="0.00" /></td>
                  <td><Input dense aria-label={`Note, line ${i + 1}`} value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })} placeholder="e.g. same batch as last time" /></td>
                  <td className="num">{filled && l.ratePaise > 0 ? <Money paise={q * l.ratePaise} /> : ''}</td>
                  <td><Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Remove line ${i + 1}`} onClick={() => removeLine(l.key)}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-sm">
          <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => { const k = addLine(); focus(`${idPrefix}-item-${k}`); }}>Add line</Button>
          <span className="text-xs text-text-2">Rates are only an estimate for the supplier; the real cost is entered when the stock arrives.</span>
          <span className="ml-auto text-text-2" aria-live="polite">{active.length} {active.length === 1 ? 'line' : 'lines'} · {totals.packs} packs{totals.amount > 0 && <> · est. <span className="font-medium text-text">{rupees(totals.amount)}</span></>}</span>
        </div>
      </section>
    </div>
  );
}
