import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Button, Callout, Field, Input, Textarea } from '@/components/ui';
import { PRINT_FORMATS, storeBody, type Store } from './settings-shared';

export function PrintingTab({ store }: { store: Store }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const [printFormat, setPrintFormat] = useState<Store['printFormat']>(store.printFormat);
  const [invoicePrefix, setPrefix] = useState(store.invoicePrefix);
  const [footerNote, setFooter] = useState(store.footerNote ?? '');
  const [upiId, setUpi] = useState(store.upiId ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [headline, setHeadline] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.put<Store>('/store', storeBody(store, { printFormat, invoicePrefix, footerNote: footerNote || null, upiId: upiId || null })),
    onSuccess: async (s) => { toast.success('Printing settings saved'); qc.setQueryData(['store'], s); setErrors({}); setHeadline(null); await refresh(); },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        const fe: Record<string, string> = {}; for (const f of e.fieldErrors) fe[f.path] = f.message; setErrors(fe);
        const other = e.fieldErrors.filter((f) => !['printFormat', 'invoicePrefix', 'footerNote', 'upiId'].includes(f.path));
        setHeadline(other.length ? `${e.message}. Some store details are incomplete (${other.map((f) => f.path).join(', ')}) — fill them in on the Store tab first.` : e.message);
      } else setHeadline(e instanceof Error ? e.message : 'Could not save');
    },
  });

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
      {headline && <Callout tone="danger" title={headline} />}
      <div className="card p-4">
        <h2 className="text-base font-semibold">Bill printing</h2>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">Paper format</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {PRINT_FORMATS.map((f) => (
              <label key={f.value} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${printFormat === f.value ? 'border-accent bg-accent-bg' : 'border-border'}`}>
                <input type="radio" name="printFormat" value={f.value} checked={printFormat === f.value} onChange={() => setPrintFormat(f.value)} className="mt-1 h-4 w-4 accent-accent" />
                <span><span className="block text-sm font-medium">{f.label}</span><span className="block text-xs text-text-2">{f.hint}</span></span>
              </label>
            ))}
          </div>
          {errors.printFormat && <p role="alert" className="mt-1 text-sm font-medium text-danger">{errors.printFormat}</p>}
        </fieldset>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Bill number prefix" hint="Up to 8 characters, e.g. INV or SP. Bills are numbered PREFIX/FY/serial." error={errors.invoicePrefix}>{(id, d) => <Input id={id} aria-describedby={d} value={invoicePrefix} maxLength={8} className="w-40 uppercase" invalid={!!errors.invoicePrefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} />}</Field>
          <Field label="UPI ID for QR code" hint="e.g. shopname@okaxis. A pay-by-scan QR is printed on bills when set." error={errors.upiId}>{(id, d) => <Input id={id} aria-describedby={d} value={upiId} invalid={!!errors.upiId} onChange={(e) => setUpi(e.target.value)} />}</Field>
          <Field label="Footer note" hint="Printed at the bottom of every bill, e.g. return policy or 'Get well soon'." error={errors.footerNote} className="sm:col-span-2">{(id, d) => <Textarea id={id} aria-describedby={d} value={footerNote} className="min-h-16" invalid={!!errors.footerNote} onChange={(e) => setFooter(e.target.value)} />}</Field>
        </div>
      </div>

      <Callout tone="accent" title="Printer setup tip">
        In the browser's print dialog choose the bill printer, set the paper size to match the format above ({PRINT_FORMATS.find((f) => f.value === printFormat)?.label}), margins to none and scale to 100%, then save these as the printer's defaults. Label sizes and barcode templates are on the <Link to="/labels" className="font-medium text-accent underline">Labels page</Link>.
      </Callout>

      <div className="flex justify-end"><Button type="submit" variant="primary" loading={save.isPending}>Save printing settings</Button></div>
    </form>
  );
}
