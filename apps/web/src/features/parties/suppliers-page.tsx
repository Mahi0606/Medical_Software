import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Download, Pencil, Plus, Search, Truck, Undo2, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { supplierSchema, type SupplierInput } from '@pharma/shared';
import { api, downloadCsv } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { formatDateIN } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, Field, Input, Money, NativeSelect, PageHeader, Sheet, Spinner, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { applyApiErrors, fieldIds, FormErrorSummary } from './form-utils';
import { DetailRow, LedgerTable, PaymentDialog, PaymentsTable, type LedgerRow, type PaymentRow } from './party-shared';

interface Supplier { id: number; name: string; phone: string | null; email: string | null; gstin: string | null; drugLicenceNo: string | null; address: string | null; city: string | null; stateCode: string | null; creditDays: number; active: boolean; notes: string | null; createdAt: string; balancePaise: number }
type SupplierDetail = Supplier & { ledger: LedgerRow[]; payments: PaymentRow[] };

const CSV_COLUMNS = [
  { key: 'name', label: 'Supplier' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'gstin', label: 'GSTIN' }, { key: 'drugLicenceNo', label: 'Drug licence no' },
  { key: 'city', label: 'City' }, { key: 'creditDays', label: 'Credit days' }, { key: 'balancePaise', label: 'Payable (₹)', paise: true },
];

export function SuppliersPage() {
  const search = useSearch({ from: '/app/suppliers' });
  const nav = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState(search.q ?? '');
  const [editing, setEditing] = useState<Supplier | null | 'new'>(null);
  const showInactive = search.status === 'all';

  const list = useQuery({ queryKey: ['suppliers', search.q, showInactive], queryFn: () => api.get<Supplier[]>('/suppliers', { q: search.q, all: showInactive ? true : undefined }), placeholderData: (p) => p });
  const set = (patch: Partial<typeof search>) => nav({ to: '/suppliers', search: (s) => ({ ...s, ...patch }) });
  const openDetail = (id: number | undefined) => set({ id });

  const totalPayable = useMemo(() => (list.data ?? []).reduce((a, s) => a + Math.max(0, s.balancePaise), 0), [list.data]);

  return (
    <div>
      <PageHeader title="Suppliers" description="Distributors and stockists you buy from. Open a supplier to see what you owe, record payments and return stock."
        actions={<>
          <Button variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => list.data && downloadCsv('suppliers', list.data as unknown as Record<string, unknown>[], CSV_COLUMNS)}>Export CSV</Button>
          {can('party.write') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add supplier</Button>}
        </>} />

      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: q || undefined, page: 1 }); }}>
        <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search suppliers" addonStart={<Search className="h-4 w-4" />} className="w-72" />
        <NativeSelect dense value={showInactive ? 'all' : 'active'} onChange={(e) => set({ status: e.target.value === 'all' ? 'all' : undefined })} aria-label="Show" className="w-44"><option value="active">Active suppliers</option><option value="all">Including inactive</option></NativeSelect>
        <Button type="submit" size="sm">Search</Button>
        {list.data && <span className="ml-auto text-sm text-text-2">Total payable: <Money paise={totalPayable} className={totalPayable > 0 ? 'font-medium text-warning' : ''} /></span>}
      </form>

      <div className="table-wrap">
        {list.isLoading ? <div className="p-6"><Spinner /></div>
          : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load suppliers">{(list.error as Error).message}</Callout></div>
          : !list.data?.length ? <EmptyState icon={Truck} title={search.q ? 'No suppliers match' : 'No suppliers yet'} action={can('party.write') && !search.q ? <Button variant="primary" onClick={() => setEditing('new')}>Add your first supplier</Button> : undefined}>{search.q ? 'Try a shorter name or clear the search.' : 'Add the distributors you buy from so receipts and payments can be tracked against them.'}</EmptyState>
          : (
            <table className="tbl dense">
              <thead><tr><th scope="col">Supplier</th><th scope="col">Phone</th><th scope="col">GSTIN</th><th scope="col" className="num">Credit days</th><th scope="col" className="num">Payable</th></tr></thead>
              <tbody>{list.data.map((s) => (
                <tr key={s.id} data-state={search.id === s.id ? 'selected' : undefined} className="cursor-pointer" onClick={() => openDetail(s.id)}>
                  <td><button type="button" className="text-left font-medium text-accent hover:underline" onClick={(e) => { e.stopPropagation(); openDetail(s.id); }}>{s.name}</button>{!s.active && <Badge tone="neutral" className="ml-2">Inactive</Badge>}{s.city && <div className="text-[11px] text-text-2">{s.city}</div>}</td>
                  <td>{s.phone ?? <span className="text-text-3">—</span>}</td>
                  <td className="font-mono text-xs">{s.gstin ?? <span className="font-sans text-text-3">—</span>}</td>
                  <td className="num">{s.creditDays}</td>
                  <td className="num">{s.balancePaise > 0 ? <span className="inline-flex items-center gap-1 text-warning"><Money paise={s.balancePaise} className="font-medium text-warning" /><span className="text-[11px]">due</span></span> : <Money paise={s.balancePaise} />}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
      </div>
      {list.data && <p className="mt-2 text-xs text-text-2">{list.data.length} {list.data.length === 1 ? 'supplier' : 'suppliers'}</p>}

      {search.id !== undefined && <SupplierDetailSheet id={search.id} onClose={() => openDetail(undefined)} onEdit={(s) => setEditing(s)} />}
      {editing !== null && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(s) => { setEditing(null); openDetail(s.id); }} />}
    </div>
  );
}

function SupplierDetailSheet({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (s: Supplier) => void }) {
  const nav = useNavigate();
  const { can } = useAuth();
  const [payOpen, setPayOpen] = useState(false);
  const q = useQuery({ queryKey: ['supplier', id], queryFn: () => api.get<SupplierDetail>(`/suppliers/${id}`) });
  const s = q.data;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={s?.name ?? 'Supplier'} width="lg" description={s ? [s.city, s.phone].filter(Boolean).join(' · ') || undefined : undefined}
      footer={s && <>
        <Button variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => nav({ to: '/purchases/returns', search: { supplierId: s.id } })}>Return stock</Button>
        <Button variant="ghost" icon={<Truck className="h-4 w-4" />} onClick={() => nav({ to: '/purchases', search: { q: s.name } })}>View receipts</Button>
        {can('party.write') && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(s)}>Edit</Button>}
        {can('payment.write') && <Button variant="primary" icon={<Wallet className="h-4 w-4" />} onClick={() => setPayOpen(true)}>Record payment</Button>}
      </>}>
      {q.isLoading ? <Spinner /> : q.isError ? <Callout tone="danger" title="Could not load this supplier">{(q.error as Error).message}</Callout> : s && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-2">Balance payable</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${s.balancePaise > 0 ? 'text-warning' : ''}`}><Money paise={s.balancePaise} className={s.balancePaise > 0 ? 'text-warning' : ''} /></p>
              <p className="text-xs text-text-2">{s.balancePaise > 0 ? 'Amount you still owe this supplier.' : s.balancePaise < 0 ? 'You have paid more than billed (advance).' : 'Nothing outstanding.'}</p>
            </div>
            <div className="text-right text-sm text-text-2">Credit terms: <span className="font-medium text-text">{s.creditDays} days</span>{!s.active && <div><Badge tone="neutral">Inactive</Badge></div>}</div>
          </div>

          <dl className="card divide-y divide-border px-4 py-1">
            <DetailRow label="Phone">{s.phone}</DetailRow>
            <DetailRow label="Email">{s.email}</DetailRow>
            <DetailRow label="GSTIN">{s.gstin && <span className="font-mono text-xs">{s.gstin}</span>}</DetailRow>
            <DetailRow label="Drug licence no">{s.drugLicenceNo}</DetailRow>
            <DetailRow label="Address">{[s.address, s.city, s.stateCode && `State code ${s.stateCode}`].filter(Boolean).join(', ') || null}</DetailRow>
            <DetailRow label="Notes">{s.notes}</DetailRow>
            <DetailRow label="Added on">{formatDateIN(s.createdAt.slice(0, 10))}</DetailRow>
          </dl>

          <Tabs defaultValue="ledger">
            <TabsList><TabsTrigger value="ledger" count={s.ledger.length}>Ledger</TabsTrigger><TabsTrigger value="payments" count={s.payments.length}>Payments</TabsTrigger></TabsList>
            <TabsContent value="ledger" className="pt-3"><LedgerTable party="supplier" rows={s.ledger} /></TabsContent>
            <TabsContent value="payments" className="pt-3"><PaymentsTable rows={s.payments} /></TabsContent>
          </Tabs>
        </div>
      )}
      {s && <PaymentDialog open={payOpen} onOpenChange={setPayOpen} party="supplier" partyId={s.id} partyName={s.name} balancePaise={s.balancePaise} />}
    </Sheet>
  );
}

type FormValues = SupplierInput;
const LABELS: Record<string, string> = { name: 'Name', phone: 'Phone', email: 'Email', gstin: 'GSTIN', drugLicenceNo: 'Drug licence no', address: 'Address', city: 'City', stateCode: 'State code', creditDays: 'Credit days', notes: 'Notes', active: 'Active' };

function SupplierForm({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: (s: Supplier) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const idFor = fieldIds('sup');
  const [headline, setHeadline] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: supplier?.name ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', gstin: supplier?.gstin ?? '', drugLicenceNo: supplier?.drugLicenceNo ?? '', address: supplier?.address ?? '', city: supplier?.city ?? '', stateCode: supplier?.stateCode ?? '', creditDays: supplier?.creditDays ?? 0, active: supplier?.active ?? true, notes: supplier?.notes ?? '' },
  });
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, watch, setValue } = form;
  const active = watch('active');
  useEffect(() => { if (Object.keys(errors).length) setHeadline((h) => h ?? 'Please correct the highlighted fields'); }, [errors]);

  const save = useMutation({
    mutationFn: (v: FormValues) => (supplier ? api.put<Supplier>(`/suppliers/${supplier.id}`, v) : api.post<Supplier>('/suppliers', v)),
    onSuccess: (s) => { toast.success(supplier ? 'Supplier updated' : 'Supplier added', s.name); qc.invalidateQueries({ queryKey: ['suppliers'] }); qc.invalidateQueries({ queryKey: ['supplier', s.id] }); onSaved(s); },
    onError: (e: unknown) => setHeadline(applyApiErrors(e, setError)),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={supplier ? `Edit ${supplier.name}` : 'Add supplier'} width="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" form="supplier-form" type="submit" loading={save.isPending || isSubmitting}>{supplier ? 'Save changes' : 'Add supplier'}</Button></>}>
      <form id="supplier-form" noValidate onSubmit={handleSubmit((v) => { setHeadline(null); save.mutate(v); }, () => setHeadline('Please correct the highlighted fields'))} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormErrorSummary message={headline} errors={errors} idFor={idFor} labels={LABELS} /></div>
        <Field label="Name" required htmlFor={idFor('name')} error={errors.name?.message} className="sm:col-span-2">{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.name} autoFocus {...register('name')} />}</Field>
        <Field label="Phone" htmlFor={idFor('phone')} hint="10-digit mobile" error={errors.phone?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" invalid={!!errors.phone} {...register('phone')} />}</Field>
        <Field label="Email" htmlFor={idFor('email')} error={errors.email?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="email" invalid={!!errors.email} {...register('email')} />}</Field>
        <Field label="GSTIN" htmlFor={idFor('gstin')} hint="15 characters; needed to claim input tax credit" error={errors.gstin?.message}>{(id, d) => <Input id={id} aria-describedby={d} className="uppercase" maxLength={15} invalid={!!errors.gstin} {...register('gstin')} />}</Field>
        <Field label="Drug licence no" htmlFor={idFor('drugLicenceNo')} hint="Form 20B/21B wholesale licence — check it before the first purchase" error={errors.drugLicenceNo?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.drugLicenceNo} {...register('drugLicenceNo')} />}</Field>
        <Field label="Address" htmlFor={idFor('address')} error={errors.address?.message} className="sm:col-span-2">{(id, d) => <Textarea id={id} aria-describedby={d} className="min-h-[64px]" invalid={!!errors.address} {...register('address')} />}</Field>
        <Field label="City" htmlFor={idFor('city')} error={errors.city?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.city} {...register('city')} />}</Field>
        <Field label="GST state code" htmlFor={idFor('stateCode')} hint="2 digits, e.g. 27 for Maharashtra" error={errors.stateCode?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={2} className="w-24" invalid={!!errors.stateCode} {...register('stateCode')} />}</Field>
        <Field label="Credit days" htmlFor={idFor('creditDays')} hint="Days allowed to pay after a receipt; 0 = pay on delivery" error={errors.creditDays?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="number" min={0} className="w-28" invalid={!!errors.creditDays} {...register('creditDays', { valueAsNumber: true })} />}</Field>
        <Field label="Active" htmlFor={idFor('active')} hint="Inactive suppliers are hidden from the purchase screen but their history stays.">{(id) => <Switch id={id} checked={!!active} onCheckedChange={(v) => setValue('active', v, { shouldDirty: true })} label="Active supplier" />}</Field>
        <Field label="Notes" htmlFor={idFor('notes')} error={errors.notes?.message} className="sm:col-span-2">{(id, d) => <Textarea id={id} aria-describedby={d} className="min-h-[64px]" invalid={!!errors.notes} {...register('notes')} />}</Field>
      </form>
    </Sheet>
  );
}
