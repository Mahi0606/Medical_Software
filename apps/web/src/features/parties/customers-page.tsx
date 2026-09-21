import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Download, MessageCircle, Pencil, Plus, Search, ShoppingCart, Users, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { customerSchema, type CustomerInput } from '@pharma/shared';
import { api, downloadCsv } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { formatDateIN, rupees } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, Field, Input, Money, MoneyInput, PageHeader, Sheet, Spinner, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { applyApiErrors, fieldIds, FormErrorSummary } from './form-utils';
import { DetailRow, LedgerTable, PaymentDialog, PaymentsTable, type LedgerRow, type PaymentRow } from './party-shared';

interface Customer { id: number; name: string; phone: string; altPhone: string | null; address: string | null; city: string | null; gstin: string | null; dob: string | null; isMinor: boolean; guardianName: string | null; consentMarketing: boolean; creditLimitPaise: number; active: boolean; notes: string | null; createdAt: string; balancePaise: number }
interface SaleRow { id: number; invoiceNo: string; date: string; totalPaise: number; creditPaise: number; status: string }
type CustomerDetail = Customer & { ledger: LedgerRow[]; payments: PaymentRow[]; sales: SaleRow[] };

const CSV_COLUMNS = [
  { key: 'name', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'city', label: 'City' }, { key: 'balancePaise', label: 'Dues (₹)', paise: true }, { key: 'creditLimitPaise', label: 'Credit limit (₹)', paise: true },
];

export function CustomersPage() {
  const search = useSearch({ from: '/app/customers' });
  const nav = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState(search.q ?? '');
  const [editing, setEditing] = useState<Customer | null | 'new'>(null);
  const duesOnly = search.status === 'dues';

  const list = useQuery({ queryKey: ['customers', search.q, duesOnly], queryFn: () => api.get<Customer[]>('/customers', { q: search.q, dues: duesOnly ? true : undefined }), placeholderData: (p) => p });
  const set = (patch: Partial<typeof search>) => nav({ to: '/customers', search: (s) => ({ ...s, ...patch }) });
  const openDetail = (id: number | undefined) => set({ id });
  const totalDues = useMemo(() => (list.data ?? []).reduce((a, c) => a + Math.max(0, c.balancePaise), 0), [list.data]);

  return (
    <div>
      <PageHeader title="Customers" description="Regular customers and credit accounts. Open a customer to see dues, receive payments and view past bills."
        actions={<>
          <Button variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => list.data && downloadCsv(duesOnly ? 'customers-with-dues' : 'customers', list.data as unknown as Record<string, unknown>[], CSV_COLUMNS)}>Export CSV</Button>
          {can('party.write') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add customer</Button>}
        </>} />

      <form className="mb-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: q || undefined, page: 1 }); }}>
        <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" aria-label="Search customers" addonStart={<Search className="h-4 w-4" />} className="w-72" />
        <Button type="submit" size="sm">Search</Button>
        <button type="button" role="switch" aria-checked={duesOnly} onClick={() => set({ status: duesOnly ? undefined : 'dues' })}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${duesOnly ? 'border-accent bg-accent-bg text-accent' : 'border-border-strong/70 bg-surface text-text-2 hover:bg-surface-2'}`}>
          <Wallet className="h-4 w-4" aria-hidden />With dues only{duesOnly && <span className="sr-only"> (on)</span>}
        </button>
        {list.data && <span className="ml-auto text-sm text-text-2">Total dues: <Money paise={totalDues} className={totalDues > 0 ? 'font-medium text-warning' : ''} /></span>}
      </form>

      <div className="table-wrap">
        {list.isLoading ? <div className="p-6"><Spinner /></div>
          : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load customers">{(list.error as Error).message}</Callout></div>
          : !list.data?.length ? <EmptyState icon={Users} title={duesOnly ? 'No customers with dues' : search.q ? 'No customers match' : 'No customers yet'} action={can('party.write') && !search.q && !duesOnly ? <Button variant="primary" onClick={() => setEditing('new')}>Add a customer</Button> : duesOnly ? <Button onClick={() => set({ status: undefined })}>Show all customers</Button> : undefined}>{duesOnly ? 'Everyone is settled up.' : search.q ? 'Check the spelling or try the phone number.' : 'Customers are also created automatically from the billing screen when you enter a phone number.'}</EmptyState>
          : (
            <table className="tbl dense">
              <thead><tr><th scope="col">Customer</th><th scope="col">Phone</th><th scope="col">City</th><th scope="col" className="num">Dues</th><th scope="col" className="num">Credit limit</th></tr></thead>
              <tbody>{list.data.map((c) => (
                <tr key={c.id} data-state={search.id === c.id ? 'selected' : undefined} className="cursor-pointer" onClick={() => openDetail(c.id)}>
                  <td><button type="button" className="text-left font-medium text-accent hover:underline" onClick={(e) => { e.stopPropagation(); openDetail(c.id); }}>{c.name}</button>{c.isMinor && <Badge tone="neutral" className="ml-2">Minor</Badge>}</td>
                  <td className="tabular-nums">{c.phone}</td>
                  <td>{c.city ?? <span className="text-text-3">—</span>}</td>
                  <td className="num">{c.balancePaise > 0 ? <span className="inline-flex items-center gap-1 text-warning"><Money paise={c.balancePaise} className="font-medium text-warning" /><span className="text-[11px]">due</span></span> : <Money paise={c.balancePaise} />}</td>
                  <td className="num">{c.creditLimitPaise > 0 ? <Money paise={c.creditLimitPaise} /> : <span className="text-text-3">No credit</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
      </div>
      {list.data && <p className="mt-2 text-xs text-text-2">{list.data.length} {list.data.length === 1 ? 'customer' : 'customers'}{list.data.length >= 200 && ' shown — search to narrow down'}</p>}

      {search.id !== undefined && <CustomerDetailSheet id={search.id} onClose={() => openDetail(undefined)} onEdit={(c) => setEditing(c)} />}
      {editing !== null && <CustomerForm customer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(c) => { setEditing(null); openDetail(c.id); }} />}
    </div>
  );
}

function CustomerDetailSheet({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (c: Customer) => void }) {
  const nav = useNavigate();
  const { can, store } = useAuth();
  const [payOpen, setPayOpen] = useState(false);
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerDetail>(`/customers/${id}`) });
  const c = q.data;
  const waHref = c && c.balancePaise > 0 ? `https://wa.me/91${c.phone}?text=${encodeURIComponent(`Namaste ${c.name}, this is a gentle reminder from ${store?.name ?? 'your pharmacy'}. An amount of ${rupees(c.balancePaise)} is pending on your account. Please pay at your convenience. Thank you!`)}` : null;
  const overLimit = !!c && c.creditLimitPaise > 0 && c.balancePaise > c.creditLimitPaise;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={c?.name ?? 'Customer'} width="lg" description={c ? `${c.phone}${c.city ? ` · ${c.city}` : ''}` : undefined}
      footer={c && <>
        <Button variant="ghost" icon={<ShoppingCart className="h-4 w-4" />} onClick={() => nav({ to: '/billing' })}>New bill for this customer</Button>
        {waHref && <Button variant="ghost" icon={<MessageCircle className="h-4 w-4" />} onClick={() => window.open(waHref, '_blank', 'noopener,noreferrer')}>WhatsApp reminder</Button>}
        {can('party.write') && <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(c)}>Edit</Button>}
        {can('payment.write') && <Button variant="primary" icon={<Wallet className="h-4 w-4" />} onClick={() => setPayOpen(true)}>Receive payment</Button>}
      </>}>
      {q.isLoading ? <Spinner /> : q.isError ? <Callout tone="danger" title="Could not load this customer">{(q.error as Error).message}</Callout> : c && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-2">Dues</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums"><Money paise={c.balancePaise} className={c.balancePaise > 0 ? 'text-warning' : ''} /></p>
              <p className="text-xs text-text-2">{c.balancePaise > 0 ? 'Amount the customer still owes.' : c.balancePaise < 0 ? 'Customer has paid in advance.' : 'Nothing outstanding.'}</p>
            </div>
            <div className="text-right text-sm text-text-2">Credit limit: <span className="font-medium text-text">{c.creditLimitPaise > 0 ? rupees(c.creditLimitPaise) : 'none'}</span>{overLimit && <div><Badge tone="danger">Over limit</Badge></div>}</div>
          </div>
          {overLimit && <Callout tone="warning" title="Dues exceed the credit limit">New credit bills for this customer will be blocked until a payment is received or the limit is raised.</Callout>}
          <p className="text-xs text-text-2">On the billing screen, enter the phone number {c.phone} to pick this customer.</p>

          <dl className="card divide-y divide-border px-4 py-1">
            <DetailRow label="Phone">{c.phone}{c.altPhone && <span className="text-text-2"> · alt {c.altPhone}</span>}</DetailRow>
            <DetailRow label="Address">{[c.address, c.city].filter(Boolean).join(', ') || null}</DetailRow>
            <DetailRow label="GSTIN">{c.gstin && <span className="font-mono text-xs">{c.gstin}</span>}</DetailRow>
            <DetailRow label="Date of birth">{c.dob ? formatDateIN(c.dob) : null}</DetailRow>
            {c.isMinor && <DetailRow label="Minor">Yes — guardian {c.guardianName ?? 'not recorded'}</DetailRow>}
            <DetailRow label="Marketing messages">{c.consentMarketing ? 'Consented' : 'No consent — send only bill and dues messages'}</DetailRow>
            <DetailRow label="Notes">{c.notes}</DetailRow>
            <DetailRow label="Customer since">{formatDateIN(c.createdAt.slice(0, 10))}</DetailRow>
          </dl>

          <Tabs defaultValue="bills">
            <TabsList><TabsTrigger value="bills" count={c.sales.length}>Bills</TabsTrigger><TabsTrigger value="ledger" count={c.ledger.length}>Ledger</TabsTrigger><TabsTrigger value="payments" count={c.payments.length}>Payments</TabsTrigger></TabsList>
            <TabsContent value="bills" className="pt-3">
              {!c.sales.length ? <EmptyState title="No bills yet" action={<Button size="sm" onClick={() => nav({ to: '/billing' })}>Make a bill</Button>} /> : (
                <div className="table-wrap"><table className="tbl dense">
                  <thead><tr><th scope="col">Bill no</th><th scope="col">Date</th><th scope="col" className="num">Total</th><th scope="col" className="num">On credit</th><th scope="col">Status</th></tr></thead>
                  <tbody>{c.sales.map((s) => (
                    <tr key={s.id} data-tone={s.status === 'cancelled' ? 'danger' : undefined}>
                      <td><Link to="/sales/$id" params={{ id: String(s.id) }} className="font-medium text-accent hover:underline">{s.invoiceNo}</Link></td>
                      <td>{formatDateIN(s.date)}</td>
                      <td className="num"><Money paise={s.totalPaise} /></td>
                      <td className="num">{s.creditPaise > 0 ? <Money paise={s.creditPaise} className="text-warning" /> : <span className="text-text-3">—</span>}</td>
                      <td>{s.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Posted</Badge>}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </TabsContent>
            <TabsContent value="ledger" className="pt-3"><LedgerTable party="customer" rows={c.ledger} /></TabsContent>
            <TabsContent value="payments" className="pt-3"><PaymentsTable rows={c.payments} /></TabsContent>
          </Tabs>
        </div>
      )}
      {c && <PaymentDialog open={payOpen} onOpenChange={setPayOpen} party="customer" partyId={c.id} partyName={c.name} balancePaise={c.balancePaise} />}
    </Sheet>
  );
}

type FormValues = CustomerInput;
const LABELS: Record<string, string> = { name: 'Name', phone: 'Phone', altPhone: 'Alternate phone', address: 'Address', city: 'City', gstin: 'GSTIN', dob: 'Date of birth', isMinor: 'Minor', guardianName: 'Guardian name', consentMarketing: 'Marketing consent', creditLimitPaise: 'Credit limit', notes: 'Notes', active: 'Active' };

function CustomerForm({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: (c: Customer) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const idFor = fieldIds('cus');
  const [headline, setHeadline] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: customer?.name ?? '', phone: customer?.phone ?? '', altPhone: customer?.altPhone ?? '', address: customer?.address ?? '', city: customer?.city ?? '', gstin: customer?.gstin ?? '', dob: customer?.dob ?? null, isMinor: customer?.isMinor ?? false, guardianName: customer?.guardianName ?? '', consentMarketing: customer?.consentMarketing ?? false, creditLimitPaise: customer?.creditLimitPaise ?? 0, active: customer?.active ?? true, notes: customer?.notes ?? '' },
  });
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, watch, setValue } = form;
  const isMinor = watch('isMinor');
  const consent = watch('consentMarketing');
  const active = watch('active');
  const creditLimit = watch('creditLimitPaise');
  useEffect(() => { if (Object.keys(errors).length) setHeadline((h) => h ?? 'Please correct the highlighted fields'); }, [errors]);

  const save = useMutation({
    mutationFn: (v: FormValues) => (customer ? api.put<Customer>(`/customers/${customer.id}`, v) : api.post<Customer>('/customers', v)),
    onSuccess: (c) => { toast.success(customer ? 'Customer updated' : 'Customer added', c.name); qc.invalidateQueries({ queryKey: ['customers'] }); qc.invalidateQueries({ queryKey: ['customer', c.id] }); onSaved(c); },
    onError: (e: unknown) => setHeadline(applyApiErrors(e, setError)),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={customer ? `Edit ${customer.name}` : 'Add customer'} width="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" form="customer-form" type="submit" loading={save.isPending || isSubmitting}>{customer ? 'Save changes' : 'Add customer'}</Button></>}>
      <form id="customer-form" noValidate onSubmit={handleSubmit((v) => { setHeadline(null); save.mutate(v); }, () => setHeadline('Please correct the highlighted fields'))} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormErrorSummary message={headline} errors={errors} idFor={idFor} labels={LABELS} /></div>
        <Field label="Name" required htmlFor={idFor('name')} error={errors.name?.message} className="sm:col-span-2">{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.name} autoFocus {...register('name')} />}</Field>
        <Field label="Mobile number" required htmlFor={idFor('phone')} hint="10 digits; used to find the customer at billing" error={errors.phone?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={10} invalid={!!errors.phone} {...register('phone')} />}</Field>
        <Field label="Alternate phone" htmlFor={idFor('altPhone')} error={errors.altPhone?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={10} invalid={!!errors.altPhone} {...register('altPhone')} />}</Field>
        <Field label="Address" htmlFor={idFor('address')} hint="Needed on the Schedule H1 register for prescription sales" error={errors.address?.message} className="sm:col-span-2">{(id, d) => <Textarea id={id} aria-describedby={d} className="min-h-16" invalid={!!errors.address} {...register('address')} />}</Field>
        <Field label="City" htmlFor={idFor('city')} error={errors.city?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.city} {...register('city')} />}</Field>
        <Field label="GSTIN" htmlFor={idFor('gstin')} hint="Only for business customers who need a tax invoice" error={errors.gstin?.message}>{(id, d) => <Input id={id} aria-describedby={d} className="uppercase" maxLength={15} invalid={!!errors.gstin} {...register('gstin')} />}</Field>
        <Field label="Date of birth" htmlFor={idFor('dob')} error={errors.dob?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="date" invalid={!!errors.dob} {...register('dob', { setValueAs: (v: string) => (v ? v : null) })} />}</Field>
        <Field label="Credit limit (₹)" htmlFor={idFor('creditLimitPaise')} hint="0 means no credit; bills on credit above this are blocked" error={errors.creditLimitPaise?.message}>{(id, d) => <MoneyInput id={id} aria-describedby={d} invalid={!!errors.creditLimitPaise} valuePaise={Number(creditLimit) || 0} onChangePaise={(p) => setValue('creditLimitPaise', p, { shouldDirty: true })} />}</Field>

        <fieldset className="sm:col-span-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">Minor and consent</legend>
          <p className="mb-3 text-xs text-text-2">Under the DPDP Act, a guardian's consent is needed to store a minor's data for anything beyond the legal sale record.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer is a minor (under 18)" htmlFor={idFor('isMinor')}>{(id) => <Switch id={id} checked={!!isMinor} onCheckedChange={(v) => setValue('isMinor', v, { shouldDirty: true })} label="Customer is a minor" />}</Field>
            {isMinor && <Field label="Guardian name" htmlFor={idFor('guardianName')} hint="Parent or guardian who gave consent" error={errors.guardianName?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.guardianName} {...register('guardianName')} />}</Field>}
            <Field label="Marketing messages" htmlFor={idFor('consentMarketing')} hint="Offers and reminders beyond bills and dues. Off unless the customer agreed." className="sm:col-span-2">{(id) => <Switch id={id} checked={!!consent} onCheckedChange={(v) => setValue('consentMarketing', v, { shouldDirty: true })} label="Customer consents to marketing messages" />}</Field>
          </div>
        </fieldset>

        <Field label="Notes" htmlFor={idFor('notes')} error={errors.notes?.message} className="sm:col-span-2">{(id, d) => <Textarea id={id} aria-describedby={d} className="min-h-16" invalid={!!errors.notes} {...register('notes')} />}</Field>
        {customer && <Field label="Active" htmlFor={idFor('active')} hint="Inactive customers are hidden from search; bills and ledger stay.">{(id) => <Switch id={id} checked={!!active} onCheckedChange={(v) => setValue('active', v, { shouldDirty: true })} label="Active customer" />}</Field>}
      </form>
    </Sheet>
  );
}
