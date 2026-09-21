import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { DOSAGE_FORMS, SCHEDULES, itemSchema, scheduleRequirements, type ItemInput, type Schedule } from '@pharma/shared';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Button, Callout, Field, Input, NativeSelect, Sheet, Switch, Textarea } from '@/components/ui';
import { describeError, type DescribedError, type ItemFull } from './item-shared';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Existing item to edit; omit to create. */
  item?: ItemFull | null;
  /** Prefill the name when creating (e.g. from a CSV row). */
  initialName?: string;
  onSaved?: (item: ItemFull) => void;
}

const GST_RATES = [0, 5, 12, 18, 28];

function toFormValues(item?: ItemFull | null, initialName = ''): ItemInput {
  if (!item) {
    return { name: initialName, form: 'tablet', manufacturer: null, salts: [], hsn: '3004', gstRatePct: 12, schedule: 'NONE', scheduleEffectiveFrom: null, baseUnit: 'tablet', unitsPerPack: 10, packName: 'strip', packsPerBox: null, allowLoose: true, rack: null, minStockUnits: 0, maxStockUnits: 0, reorderQtyPacks: 0, ean: null, coldChain: false, notForSale: false, narcotic: false, active: true, notes: null };
  }
  return {
    name: item.name, form: item.form as ItemInput['form'], manufacturer: item.manufacturer, salts: item.salts.map((s) => ({ salt: s.salt, strength: s.strength === null || s.strength === '' ? null : Number(s.strength), unit: s.unit })),
    hsn: item.hsn, gstRatePct: item.gstRatePct, schedule: item.schedule, scheduleEffectiveFrom: null, baseUnit: item.baseUnit, unitsPerPack: item.unitsPerPack, packName: item.packName, packsPerBox: item.packsPerBox, allowLoose: item.allowLoose,
    rack: item.rack, minStockUnits: item.minStockUnits, maxStockUnits: item.maxStockUnits, reorderQtyPacks: item.reorderQtyPacks, ean: item.ean, coldChain: item.coldChain, notForSale: item.notForSale, narcotic: item.narcotic, active: item.active, notes: item.notes,
  };
}

/** Create / edit an item master. Server field errors are shown next to the field and summarised at the top; the submit button is never disabled. */
export function ItemFormSheet({ open, onOpenChange, item, initialName, onSaved }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<DescribedError | null>(null);
  const [pasteText, setPasteText] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const form = useForm<ItemInput>({ resolver: zodResolver(itemSchema), defaultValues: toFormValues(item, initialName), mode: 'onBlur' });
  const { register, control, handleSubmit, reset, setError, setValue, watch, formState: { errors, isSubmitting } } = form;
  const salts = useFieldArray({ control, name: 'salts' });
  const manufacturers = useQuery({ queryKey: ['manufacturers'], queryFn: () => api.get<{ id: number; name: string }[]>('/manufacturers'), enabled: open });

  useEffect(() => { if (open) { reset(toFormValues(item, initialName)); setServerError(null); setPasteText(item?.genericText ?? ''); } }, [open, item, initialName, reset]);

  const parse = useMutation({
    mutationFn: () => api.post<{ salt: string; strength: number | null; unit: string | null }[]>('/items/parse-generic', { text: pasteText }),
    onSuccess: (rows) => { salts.replace(rows.map((r) => ({ salt: r.salt, strength: r.strength, unit: r.unit }))); if (rows.length === 0) toast.info('Nothing to parse', 'Type a composition like "Paracetamol 500 mg + Caffeine 30 mg".'); },
    onError: (e: Error) => toast.error('Could not parse composition', e.message),
  });

  const save = useMutation({
    mutationFn: (values: ItemInput) => (item ? api.put<ItemFull>(`/items/${item.id}`, values) : api.post<ItemFull>('/items', values)),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['items'] }); qc.invalidateQueries({ queryKey: ['item', String(saved.id)] }); qc.invalidateQueries({ queryKey: ['items-search'] }); qc.invalidateQueries({ queryKey: ['items-picker'] }); qc.invalidateQueries({ queryKey: ['manufacturers'] });
      toast.success(item ? 'Item updated' : 'Item created', saved.name);
      onSaved?.(saved); onOpenChange(false);
    },
    onError: (e) => {
      const d = describeError(e);
      setServerError(d);
      for (const f of d.fields) { if (f.path) setError(f.path.replace(/^body\./, '') as FieldPath<ItemInput>, { type: 'server', message: f.message }); }
      setTimeout(() => errorRef.current?.focus(), 0);
    },
  });

  const schedule = watch('schedule');
  const clientErrors = Object.entries(errors).filter(([k]) => k !== 'salts').map(([k, v]) => ({ path: k, message: (v as { message?: string })?.message ?? 'Check this field' }));
  const unitsPerPack = watch('unitsPerPack');
  const err = (name: keyof ItemInput) => (errors[name] as { message?: string } | undefined)?.message ?? null;

  const onSubmit = handleSubmit((values) => { setServerError(null); save.mutate(values); }, () => { setServerError({ title: 'Some fields need attention', fields: [] }); setTimeout(() => errorRef.current?.focus(), 0); });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={item ? `Edit ${item.name}` : 'New item'} width="lg" description={item ? 'Changes apply to future bills; posted documents keep their own copy.' : 'Fill in the essentials; you can refine the rest later.'}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" form="item-form" type="submit" loading={save.isPending || isSubmitting}>{item ? 'Save changes' : 'Create item'}</Button></>}>
      <form id="item-form" onSubmit={onSubmit} noValidate className="space-y-6">
        {(serverError || clientErrors.length > 0) && (
          <div ref={errorRef} tabIndex={-1} className="outline-none">
            <Callout tone="danger" title={serverError?.title ?? 'Some fields need attention'}>
              {serverError?.detail}
              {(serverError?.fields.length ? serverError.fields : clientErrors).length > 0 && <ul className="list-disc pl-5">{(serverError?.fields.length ? serverError.fields : clientErrors).map((f, i) => <li key={i}>{f.path ? <><span className="font-medium">{f.path}</span>: </> : null}{f.message}</li>)}</ul>}
            </Callout>
          </div>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Identity</legend>
          <Field label="Brand / item name" required error={err('name')} hint="As printed on the pack, e.g. Dolo 650">{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.name} autoFocus {...register('name')} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Form" error={err('form')}>{(id) => <NativeSelect id={id} {...register('form')}>{DOSAGE_FORMS.map((f) => <option key={f} value={f}>{f[0]!.toUpperCase() + f.slice(1)}</option>)}</NativeSelect>}</Field>
            <Field label="Manufacturer" error={err('manufacturer')}>{(id) => <><Input id={id} list="mfr-list" placeholder="e.g. Micro Labs" {...register('manufacturer')} /><datalist id="mfr-list">{manufacturers.data?.map((m) => <option key={m.id} value={m.name} />)}</datalist></>}</Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Composition</legend>
          <Field label="Paste composition" hint='Type or paste, e.g. "Amoxicillin 500 mg + Clavulanic acid 125 mg", then press Parse.'>
            {(id, d) => <div className="flex gap-2"><Input id={id} aria-describedby={d} value={pasteText} onChange={(e) => setPasteText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); parse.mutate(); } }} placeholder="Salt strength unit + salt strength unit" /><Button icon={<Wand2 className="h-4 w-4" />} loading={parse.isPending} onClick={() => parse.mutate()}>Parse</Button></div>}
          </Field>
          {salts.fields.length === 0 ? <p className="text-sm text-text-2">No salts yet. Parse a composition above or add a row.</p> : (
            <table className="tbl dense">
              <thead><tr><th>Salt</th><th className="w-28">Strength</th><th className="w-28">Unit</th><th className="w-12"><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>{salts.fields.map((f, i) => (
                <tr key={f.id}>
                  <td><Input dense aria-label={`Salt ${i + 1}`} invalid={!!errors.salts?.[i]?.salt} {...register(`salts.${i}.salt` as const)} />{errors.salts?.[i]?.salt && <p role="alert" className="mt-1 text-xs text-danger">{errors.salts[i]?.salt?.message}</p>}</td>
                  <td><Input dense type="number" step="any" inputMode="decimal" aria-label={`Strength of salt ${i + 1}`} {...register(`salts.${i}.strength` as const, { setValueAs: (v) => (v === '' || v === null || v === undefined ? null : Number(v)) })} /></td>
                  <td><Input dense list="unit-list" aria-label={`Unit of salt ${i + 1}`} placeholder="mg" {...register(`salts.${i}.unit` as const)} /></td>
                  <td><Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Remove salt ${i + 1}`} onClick={() => salts.remove(i)}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
          <datalist id="unit-list">{['mg', 'mcg', 'g', 'ml', 'iu', '%', 'mg/ml', 'mg/5ml'].map((u) => <option key={u} value={u} />)}</datalist>
          <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => salts.append({ salt: '', strength: null, unit: 'mg' })}>Add salt</Button>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Tax</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="HSN" error={err('hsn')} hint="3004 for most medicines">{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" invalid={!!errors.hsn} {...register('hsn')} />}</Field>
            <Field label="GST rate" error={err('gstRatePct')}>{(id) => <NativeSelect id={id} {...register('gstRatePct', { valueAsNumber: true })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</NativeSelect>}</Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Regulation</legend>
          <Field label="Schedule" error={err('schedule')} hint={scheduleRequirements(schedule as Schedule).label || 'No prescription needed'}>{(id, d) => <NativeSelect id={id} aria-describedby={d} {...register('schedule')}>{SCHEDULES.map((s) => <option key={s} value={s}>{s === 'NONE' ? 'None (no schedule)' : `Schedule ${s}`}</option>)}</NativeSelect>}</Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Controller control={control} name="narcotic" render={({ field }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} /> Narcotic (NDPS)</label>} />
            <Controller control={control} name="coldChain" render={({ field }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} /> Cold chain (2–8 °C)</label>} />
            <Controller control={control} name="notForSale" render={({ field }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} /> Not for sale</label>} />
          </div>
          <p className="text-xs text-text-2">Not for sale: physician samples / govt supply — blocked at billing.</p>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Pack</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Base unit" required error={err('baseUnit')} hint="tablet, capsule, ml…">{(id, d) => <Input id={id} aria-describedby={d} {...register('baseUnit')} />}</Field>
            <Field label="Units per pack" required error={err('unitsPerPack')}>{(id) => <Input id={id} type="number" min={1} inputMode="numeric" invalid={!!errors.unitsPerPack} {...register('unitsPerPack', { valueAsNumber: true })} />}</Field>
            <Field label="Pack name" required error={err('packName')} hint="strip, bottle, vial, tube">{(id, d) => <Input id={id} aria-describedby={d} {...register('packName')} />}</Field>
            <Field label="Packs per box" error={err('packsPerBox')}>{(id) => <Input id={id} type="number" min={1} inputMode="numeric" {...register('packsPerBox', { setValueAs: (v) => (v === '' || v === null || v === undefined ? null : Number(v)) })} />}</Field>
          </div>
          <Controller control={control} name="allowLoose" render={({ field }) => <div className="flex items-center gap-3"><Switch id="allow-loose" checked={field.value} onCheckedChange={field.onChange} /><label htmlFor="allow-loose" className="text-sm">Allow loose sale of single {watch('baseUnit') || 'unit'}s{unitsPerPack > 1 ? ` (a ${watch('packName') || 'pack'} of ${unitsPerPack})` : ''}</label></div>} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Stock control</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Rack / shelf" error={err('rack')}>{(id) => <Input id={id} placeholder="A3" {...register('rack')} />}</Field>
            <Field label="Minimum stock (units)" error={err('minStockUnits')} hint="Below this the item shows as low">{(id, d) => <Input id={id} aria-describedby={d} type="number" min={0} inputMode="numeric" {...register('minStockUnits', { valueAsNumber: true })} />}</Field>
            <Field label="Maximum stock (units)" error={err('maxStockUnits')}>{(id) => <Input id={id} type="number" min={0} inputMode="numeric" {...register('maxStockUnits', { valueAsNumber: true })} />}</Field>
            <Field label="Reorder qty (packs)" error={err('reorderQtyPacks')}>{(id) => <Input id={id} type="number" min={0} inputMode="numeric" {...register('reorderQtyPacks', { valueAsNumber: true })} />}</Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Barcode & notes</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="EAN / GTIN on the pack" error={err('ean')} hint="Scan the pack barcode into this box">{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" data-scan="allow" {...register('ean')} />}</Field>
            <Controller control={control} name="active" render={({ field }) => <div className="flex items-center gap-3 pt-6"><Switch id="item-active" checked={field.value} onCheckedChange={field.onChange} /><label htmlFor="item-active" className="text-sm">Active (shown in search and billing)</label></div>} />
          </div>
          <Field label="Notes" error={err('notes')}>{(id) => <Textarea id={id} {...register('notes')} />}</Field>
        </fieldset>
      </form>
    </Sheet>
  );
}
