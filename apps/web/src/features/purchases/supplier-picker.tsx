import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Button, Callout, Combobox, Dialog, Field, Input, type ComboOption } from '@/components/ui';
import { describeError, useDebounced } from '../items/item-shared';

export interface Supplier { id: number; name: string; phone: string | null; email: string | null; gstin: string | null; drugLicenceNo: string | null; address: string | null; city: string | null; stateCode: string | null; creditDays: number; active: boolean; balancePaise?: number }

interface Props { value: Supplier | null; onChange: (s: Supplier | null) => void; id?: string; dense?: boolean; invalid?: boolean; allowCreate?: boolean; allowClear?: boolean; autoFocus?: boolean }

/** Server-searched supplier combobox with an inline "add supplier" dialog. */
export function SupplierPicker({ value, onChange, id, dense, invalid, allowCreate = true, allowClear }: Props) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const [creating, setCreating] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['suppliers', dq], queryFn: () => api.get<Supplier[]>('/suppliers', { q: dq || undefined }), placeholderData: (p) => p });
  const rows = useMemo(() => list.data ?? [], [list.data]);
  const options = useMemo<ComboOption<number>[]>(() => {
    const o: ComboOption<number>[] = rows.map((s) => ({ value: s.id, label: s.name, description: [s.city, s.gstin, s.phone].filter(Boolean).join(' · ') || undefined }));
    if (value && !o.some((x) => x.value === value.id)) o.unshift({ value: value.id, label: value.name });
    return o;
  }, [rows, value]);
  return (
    <>
      <Combobox<number> id={id} dense={dense} invalid={invalid} allowClear={allowClear} placeholder="Search supplier…" options={options} value={value?.id ?? null} onSearch={setQ} loading={list.isFetching && rows.length === 0}
        emptyText="No supplier with that name" onChange={(v) => onChange(v === null ? null : rows.find((s) => s.id === v) ?? value)} onCreate={allowCreate ? (name) => setCreating(name) : undefined} createLabel={(s) => `Add supplier “${s}”`} />
      {creating !== null && <NewSupplierDialog name={creating} onClose={() => setCreating(null)} onCreated={(s) => { setCreating(null); onChange(s); }} />}
    </>
  );
}

function NewSupplierDialog({ name: initial, onClose, onCreated }: { name: string; onClose: () => void; onCreated: (s: Supplier) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(initial);
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [errors, setErrors] = useState<{ title: string; fields: { path: string; message: string }[] } | null>(null);
  const m = useMutation({
    mutationFn: () => api.post<Supplier>('/suppliers', { name: name.trim(), phone: phone.trim() || null, gstin: gstin.trim().toUpperCase() || null, stateCode: gstin.trim().length === 15 ? gstin.trim().slice(0, 2) : null }),
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Supplier added', s.name); onCreated(s); },
    onError: (e) => setErrors(describeError(e)),
  });
  const fieldErr = (p: string) => errors?.fields.find((f) => f.path === p || f.path === `body.${p}`)?.message ?? null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add supplier" size="sm" description="Just the basics for now; add GSTIN, licence and address later under Suppliers."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => { if (!name.trim()) { setErrors({ title: 'Name is required', fields: [{ path: 'name', message: 'Required' }] }); return; } setErrors(null); m.mutate(); }}>Add supplier</Button></>}>
      <div className="space-y-3">
        {errors && <Callout tone="danger" title={errors.title}>{errors.fields.length > 0 && <ul className="list-disc pl-5">{errors.fields.map((f, i) => <li key={i}>{f.path}: {f.message}</li>)}</ul>}</Callout>}
        <Field label="Name" required error={fieldErr('name')}>{(id) => <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} invalid={!!fieldErr('name')} />}</Field>
        <Field label="Phone" error={fieldErr('phone')} hint="10-digit mobile">{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!fieldErr('phone')} />}</Field>
        <Field label="GSTIN" error={fieldErr('gstin')} hint="15 characters; the first two digits set the state for IGST.">{(id, d) => <Input id={id} aria-describedby={d} value={gstin} onChange={(e) => setGstin(e.target.value)} invalid={!!fieldErr('gstin')} className="uppercase" />}</Field>
      </div>
    </Dialog>
  );
}

/** Load one supplier by id (for ?supplierId= prefills). */
export function useSupplier(id: number | null | undefined) {
  return useQuery({ queryKey: ['supplier', id], queryFn: () => api.get<Supplier>(`/suppliers/${id}`), enabled: !!id });
}
