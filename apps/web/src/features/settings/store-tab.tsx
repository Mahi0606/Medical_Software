import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { storeSchema, type StoreInput } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Button, Callout, Field, Input, NativeSelect, Textarea } from '@/components/ui';
import { applyApiErrors, fieldIds, FormErrorSummary } from './form-utils';
import { GST_STATES, storeBody, type Store } from './settings-shared';

const LABELS: Record<string, string> = {
  name: 'Store name', legalName: 'Legal name', addressLine1: 'Address line 1', addressLine2: 'Address line 2', city: 'City', state: 'State', stateCode: 'State code', pincode: 'PIN code', phone: 'Phone', email: 'Email',
  gstin: 'GSTIN', gstScheme: 'GST scheme', pharmacistName: 'Pharmacist name', pharmacistRegNo: 'Pharmacist reg no', pharmacistCouncil: 'Pharmacy council', maxDiscountPctClerk: 'Clerk discount limit', maxDiscountPctPharmacist: 'Pharmacist discount limit', nearExpiryDays: 'Near-expiry days',
  invoicePrefix: 'Bill prefix', footerNote: 'Footer note', upiId: 'UPI ID', printFormat: 'Print format',
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="card p-4">
      <legend className="sr-only">{title}</legend>
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-sm text-text-2">{hint}</p>}
      <div className={`grid gap-3 sm:grid-cols-2 ${hint ? '' : 'mt-3'}`}>{children}</div>
    </fieldset>
  );
}

export function StoreTab({ store }: { store: Store }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const idFor = fieldIds('store');
  const [headline, setHeadline] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty }, setError, setValue, watch, reset } = useForm<StoreInput>({
    resolver: zodResolver(storeSchema),
    defaultValues: storeBody(store) as unknown as StoreInput,
  });
  const stateCode = watch('stateCode');
  const gstScheme = watch('gstScheme');
  useEffect(() => { if (Object.keys(errors).length) setHeadline((h) => h ?? 'Please correct the highlighted fields'); }, [errors]);

  const save = useMutation({
    mutationFn: (v: StoreInput) => api.put<Store>('/store', v),
    onSuccess: async (s) => { toast.success('Store details saved'); qc.setQueryData(['store'], s); reset(storeBody(s) as unknown as StoreInput); await refresh(); },
    onError: (e: unknown) => setHeadline(applyApiErrors(e, setError)),
  });

  return (
    <form noValidate onSubmit={handleSubmit((v) => { setHeadline(null); save.mutate(v); }, () => setHeadline('Please correct the highlighted fields'))} className="space-y-4">
      {!store.setupComplete && <Callout tone="warning" title="Finish setting up the store">Bills print the name, address, GSTIN and licence numbers entered here. Save this page once before billing.</Callout>}
      <FormErrorSummary message={headline} errors={errors} idFor={idFor} labels={LABELS} />

      <Section title="Store identity" hint="Printed at the top of every bill and register.">
        <Field label="Store name" required htmlFor={idFor('name')} error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.name} {...register('name')} />}</Field>
        <Field label="Legal name" htmlFor={idFor('legalName')} hint="Proprietor or firm name if different from the board name" error={errors.legalName?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.legalName} {...register('legalName')} />}</Field>
        <Field label="Phone" required htmlFor={idFor('phone')} hint="10-digit mobile" error={errors.phone?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={10} invalid={!!errors.phone} {...register('phone')} />}</Field>
        <Field label="Email" htmlFor={idFor('email')} error={errors.email?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="email" invalid={!!errors.email} {...register('email')} />}</Field>
      </Section>

      <Section title="Address" hint="The state code decides whether GST is split as CGST + SGST (same state) or charged as IGST.">
        <Field label="Address line 1" required htmlFor={idFor('addressLine1')} error={errors.addressLine1?.message} className="sm:col-span-2">{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.addressLine1} {...register('addressLine1')} />}</Field>
        <Field label="Address line 2" htmlFor={idFor('addressLine2')} error={errors.addressLine2?.message} className="sm:col-span-2">{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.addressLine2} {...register('addressLine2')} />}</Field>
        <Field label="City" required htmlFor={idFor('city')} error={errors.city?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.city} {...register('city')} />}</Field>
        <Field label="PIN code" required htmlFor={idFor('pincode')} error={errors.pincode?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={6} className="w-32" invalid={!!errors.pincode} {...register('pincode')} />}</Field>
        <Field label="State (GST code)" required htmlFor={idFor('stateCode')} error={errors.stateCode?.message ?? errors.state?.message}>{(id, d) => (
          <NativeSelect id={id} aria-describedby={d} invalid={!!errors.stateCode} value={stateCode} onChange={(e) => { const st = GST_STATES.find((s) => s.code === e.target.value); setValue('stateCode', e.target.value, { shouldDirty: true }); if (st) setValue('state', st.name, { shouldDirty: true }); }}>
            <option value="">Choose state…</option>{GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label="State name" required htmlFor={idFor('state')} hint="Filled from the code; edit if the board spelling differs" error={errors.state?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.state} {...register('state')} />}</Field>
      </Section>

      <Section title="GST">
        <Field label="GSTIN" htmlFor={idFor('gstin')} hint="Leave blank if the shop is not GST-registered" error={errors.gstin?.message}>{(id, d) => <Input id={id} aria-describedby={d} className="uppercase" maxLength={15} invalid={!!errors.gstin} {...register('gstin')} />}</Field>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">GST scheme <span className="text-danger" aria-hidden>*</span></legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {([['regular', 'Regular', 'Bills are Tax Invoices showing CGST/SGST per line; you claim input credit on purchases.'], ['composition', 'Composition', 'Bills are Bills of Supply with no tax shown; you pay a flat rate on turnover and cannot claim input credit.']] as const).map(([v, label, hint]) => (
              <label key={v} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${gstScheme === v ? 'border-accent bg-accent-bg' : 'border-border'}`}>
                <input type="radio" value={v} className="mt-1 h-4 w-4 accent-accent" {...register('gstScheme')} />
                <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-text-2">{hint}</span></span>
              </label>
            ))}
          </div>
          {errors.gstScheme && <p role="alert" className="mt-1 text-sm font-medium text-danger">{errors.gstScheme.message}</p>}
        </fieldset>
      </Section>

      <Section title="Registered pharmacist" hint="Printed on bills and on the Schedule H1 register. Daily duty is marked from the header, not here.">
        <Field label="Name" htmlFor={idFor('pharmacistName')} error={errors.pharmacistName?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.pharmacistName} {...register('pharmacistName')} />}</Field>
        <Field label="Registration number" htmlFor={idFor('pharmacistRegNo')} error={errors.pharmacistRegNo?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.pharmacistRegNo} {...register('pharmacistRegNo')} />}</Field>
        <Field label="Pharmacy council" htmlFor={idFor('pharmacistCouncil')} hint="e.g. Maharashtra State Pharmacy Council" error={errors.pharmacistCouncil?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.pharmacistCouncil} {...register('pharmacistCouncil')} />}</Field>
      </Section>

      <Section title="Limits and alerts">
        <Field label="Max discount for clerks (%)" htmlFor={idFor('maxDiscountPctClerk')} hint="Above this the bill needs a pharmacist or owner" error={errors.maxDiscountPctClerk?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="number" min={0} max={100} step="0.5" className="w-32" invalid={!!errors.maxDiscountPctClerk} {...register('maxDiscountPctClerk', { valueAsNumber: true })} />}</Field>
        <Field label="Max discount for pharmacists (%)" htmlFor={idFor('maxDiscountPctPharmacist')} error={errors.maxDiscountPctPharmacist?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="number" min={0} max={100} step="0.5" className="w-32" invalid={!!errors.maxDiscountPctPharmacist} {...register('maxDiscountPctPharmacist', { valueAsNumber: true })} />}</Field>
        <Field label="Near-expiry warning (days)" htmlFor={idFor('nearExpiryDays')} hint="Batches expiring within this many days are flagged on the dashboard and at billing (7–365)" error={errors.nearExpiryDays?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="number" min={7} max={365} className="w-32" invalid={!!errors.nearExpiryDays} {...register('nearExpiryDays', { valueAsNumber: true })} />}</Field>
      </Section>

      <div className="flex items-center justify-end gap-3">
        {isDirty && <span className="text-sm text-text-2">Unsaved changes</span>}
        <Button type="submit" variant="primary" loading={save.isPending || isSubmitting}>Save store details</Button>
      </div>
    </form>
  );
}
