import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { messagingSettingsSchema, type MessagingSettings } from '@pharma/shared';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Button, Callout, Field, Input, Switch, Textarea } from '@/components/ui';
import { applyApiErrors, fieldIds, FormErrorSummary } from './form-utils';
import type { PublicSettings } from './shared';

const LABELS: Record<string, string> = { provider: 'Sending method', phoneNumberId: 'Phone number ID', accessToken: 'Access token', businessName: 'Business name', autoSendBills: 'Send bill copies automatically', refillLeadDays: 'Refill reminder lead days', billTemplate: 'Bill message', duesReminderTemplate: 'Dues reminder', refillTemplate: 'Refill reminder' };
const PLACEHOLDER_HELP: Record<string, string> = { store: 'store or business name', customer: 'customer name', bill: 'bill number', amount: 'bill total or dues', due: 'refill due date', items: 'medicines on the bill', date: 'bill date', phone: 'store phone', upi: 'UPI line (if a UPI ID is set)' };

function toForm(s: PublicSettings): MessagingSettings {
  return { provider: s.provider, phoneNumberId: s.phoneNumberId ?? '', accessToken: s.accessToken ?? '', businessName: s.businessName ?? '', autoSendBills: s.autoSendBills, refillLeadDays: s.refillLeadDays, billTemplate: s.billTemplate ?? '', duesReminderTemplate: s.duesReminderTemplate ?? '', refillTemplate: s.refillTemplate ?? '' } as unknown as MessagingSettings;
}

export function SettingsTab({ settings }: { settings: PublicSettings }) {
  const toast = useToast();
  const qc = useQueryClient();
  const idFor = fieldIds('msg');
  const [headline, setHeadline] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty }, setError, setValue, watch, reset } = useForm<MessagingSettings>({ resolver: zodResolver(messagingSettingsSchema), defaultValues: toForm(settings) });
  const provider = watch('provider');
  const autoSend = watch('autoSendBills');
  useEffect(() => { if (Object.keys(errors).length) setHeadline((h) => h ?? 'Please correct the highlighted fields'); }, [errors]);

  const save = useMutation({
    mutationFn: (v: MessagingSettings) => api.put<PublicSettings>('/messages/settings', v),
    onSuccess: (s) => { toast.success('Messaging settings saved'); qc.setQueryData(['messages-settings'], s); qc.invalidateQueries({ queryKey: ['messages-status'] }); reset(toForm(s)); },
    onError: (e: unknown) => setHeadline(applyApiErrors(e, setError)),
  });
  const test = useMutation({
    mutationFn: () => api.post<{ status: string; waLink: string }>('/messages/test', { toPhone: testPhone.trim() }),
    onSuccess: (m) => { toast.success(m.status === 'manual' ? 'Test message added to the outbox' : 'Test message queued', m.status === 'manual' ? 'Open it from the Outbox tab to send on WhatsApp.' : 'It will be sent within 30 seconds; check the Outbox tab.'); qc.invalidateQueries({ queryKey: ['messages'] }); qc.invalidateQueries({ queryKey: ['messages-status'] }); },
    onError: (e: Error) => toast.error('Could not queue the test message', e.message),
  });
  const placeholderHint = <span>Placeholders: {settings.placeholders.map((p) => <code key={p} className="kbd mr-1" title={PLACEHOLDER_HELP[p]}>{`{{${p}}}`}</code>)}</span>;

  return (
    <form noValidate onSubmit={handleSubmit((v) => { setHeadline(null); save.mutate(v); }, () => setHeadline('Please correct the highlighted fields'))} className="space-y-4">
      <FormErrorSummary message={headline} errors={errors} idFor={idFor} labels={LABELS} />
      <Callout tone="warning" title="Privacy (DPDP Act)">
        Bill copies and dues reminders are about the customer's own purchase or account and may be sent to anyone with a phone number on the bill. Refill reminders are promotional: they are sent only to customers whose <strong>Marketing messages</strong> switch is on in their customer record. Do not send offers or other marketing without that consent.
      </Callout>

      <fieldset className="card p-4">
        <legend className="sr-only">Sending method</legend>
        <h2 className="text-base font-semibold">Sending method</h2>
        <p className="mb-3 mt-0.5 text-sm text-text-2">Start with manual links; connect the Cloud API when you have a Meta business account.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {([['none', 'Manual via WhatsApp links', 'Each message opens WhatsApp Web or the app with the text ready; you press send. Free, no setup.'], ['meta_cloud', 'Meta WhatsApp Cloud API', 'Messages are sent automatically from your WhatsApp Business number. Needs a Meta developer app, a phone number ID and a permanent access token.']] as const).map(([v, label, hint]) => (
            <label key={v} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${provider === v ? 'border-accent bg-accent-bg' : 'border-border hover:bg-surface-2'}`}>
              <input type="radio" value={v} className="mt-1 h-4 w-4" {...register('provider')} />
              <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-text-2">{hint}</span></span>
            </label>
          ))}
        </div>
        {provider === 'meta_cloud' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Phone number ID" required htmlFor={idFor('phoneNumberId')} hint="From Meta for Developers → WhatsApp → API setup" error={errors.phoneNumberId?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" invalid={!!errors.phoneNumberId} {...register('phoneNumberId')} />}</Field>
            <Field label="Access token" required htmlFor={idFor('accessToken')} hint={settings.accessToken ? `Saved token ends in ${settings.accessToken.slice(-4)}. Leave as is to keep it.` : 'A permanent System User token with whatsapp_business_messaging permission'} error={errors.accessToken?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="off" invalid={!!errors.accessToken} {...register('accessToken')} />}</Field>
            <Field label="Business name" htmlFor={idFor('businessName')} hint="Shown as {{store}} in messages; defaults to the store name" error={errors.businessName?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.businessName} {...register('businessName')} />}</Field>
            <Field label="Send bill copies automatically" htmlFor={idFor('autoSendBills')} hint="Queue a bill message after every bill that has a customer phone number">{(id) => <Switch id={id} checked={!!autoSend} onCheckedChange={(v) => setValue('autoSendBills', v, { shouldDirty: true })} label="Send bill copies automatically" />}</Field>
            {!settings.configured && <Callout tone="accent" className="sm:col-span-2">Meta requires an approved message template for the first message to a customer in 24 hours. Plain-text sends work inside an open conversation window; check the Outbox for delivery errors.</Callout>}
          </div>
        )}
        {provider === 'none' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Business name" htmlFor={idFor('businessName')} hint="Shown as {{store}} in messages; defaults to the store name" error={errors.businessName?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.businessName} {...register('businessName')} />}</Field>
          </div>
        )}
      </fieldset>

      <fieldset className="card p-4">
        <legend className="sr-only">Reminders</legend>
        <h2 className="text-base font-semibold">Reminders</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Refill reminder lead days" required htmlFor={idFor('refillLeadDays')} hint="How many days before the refill due date to remind (0–14)" error={errors.refillLeadDays?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="number" min={0} max={14} className="w-32" invalid={!!errors.refillLeadDays} {...register('refillLeadDays', { valueAsNumber: true })} />}</Field>
        </div>
      </fieldset>

      <fieldset className="card p-4">
        <legend className="sr-only">Message templates</legend>
        <h2 className="text-base font-semibold">Message templates</h2>
        <p className="mb-3 mt-0.5 text-sm text-text-2">Leave a box empty to use the standard wording shown as the placeholder. Messages are trimmed to 900 characters. {placeholderHint}</p>
        <div className="grid gap-3">
          <Field label="Bill message" htmlFor={idFor('billTemplate')} error={errors.billTemplate?.message}>{(id, d) => <Textarea id={id} aria-describedby={d} rows={3} placeholder={settings.defaults.bill} invalid={!!errors.billTemplate} {...register('billTemplate')} />}</Field>
          <Field label="Dues reminder" htmlFor={idFor('duesReminderTemplate')} error={errors.duesReminderTemplate?.message}>{(id, d) => <Textarea id={id} aria-describedby={d} rows={3} placeholder={settings.defaults.dues} invalid={!!errors.duesReminderTemplate} {...register('duesReminderTemplate')} />}</Field>
          <Field label="Refill reminder" htmlFor={idFor('refillTemplate')} error={errors.refillTemplate?.message}>{(id, d) => <Textarea id={id} aria-describedby={d} rows={3} placeholder={settings.defaults.refill} invalid={!!errors.refillTemplate} {...register('refillTemplate')} />}</Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={save.isPending || isSubmitting}>Save settings</Button>
        {isDirty && <span className="text-sm text-text-2">Unsaved changes</span>}
      </div>

      <div className="card p-4">
        <h2 className="text-base font-semibold">Send a test message</h2>
        <p className="mb-3 mt-0.5 text-sm text-text-2">Uses the saved settings. In manual mode it appears in the Outbox with a WhatsApp link; with the Cloud API it is sent within 30 seconds.</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Mobile number" htmlFor="msg-test-phone" className="w-56">{(id) => <Input id={id} inputMode="numeric" maxLength={15} value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Your own number" />}</Field>
          <Button icon={<Send className="h-4 w-4" />} onClick={() => test.mutate()} loading={test.isPending} disabled={!/^\d{10,15}$/.test(testPhone.trim())}>Send test message</Button>
        </div>
      </div>
    </form>
  );
}
