import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarClock, Send } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { formatDateIN } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, Field, NativeSelect, Spinner, Switch } from '@/components/ui';
import type { MessagingStatus, RefillRow } from './shared';

function DaysLeft({ days }: { days: number }) {
  if (days < 0) return <Badge tone="danger">Overdue by {Math.abs(days)} {Math.abs(days) === 1 ? 'day' : 'days'}</Badge>;
  if (days === 0) return <Badge tone="warning">Due today</Badge>;
  if (days <= 2) return <Badge tone="warning">{days} {days === 1 ? 'day' : 'days'} left</Badge>;
  return <Badge tone="neutral">{days} days left</Badge>;
}

export function RefillsTab({ status, leadDays }: { status: MessagingStatus | undefined; leadDays: number }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [withinDays, setWithinDays] = useState(7);
  const [includeOverdue, setIncludeOverdue] = useState(true);
  const list = useQuery({ queryKey: ['refills-due', withinDays, includeOverdue], queryFn: () => api.get<RefillRow[]>('/messages/refills-due', { withinDays, includeOverdue }), placeholderData: (p) => p });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['refills-due'] }); qc.invalidateQueries({ queryKey: ['messages'] }); qc.invalidateQueries({ queryKey: ['messages-status'] }); };
  const manualMode = status?.provider !== 'meta_cloud';
  const one = useMutation({
    mutationFn: (saleId: number) => api.post(`/messages/refill/${saleId}`),
    onSuccess: () => { toast.success(manualMode ? 'Reminder added to the outbox' : 'Reminder queued', manualMode ? 'Open the Outbox tab to send it on WhatsApp.' : undefined); refresh(); },
    onError: (e: Error) => toast.error('Could not queue the reminder', e.message),
  });
  const all = useMutation({
    mutationFn: () => api.post<{ queued: number; skippedNoConsent: number; skippedAlready: number; skippedNoPhone: number }>('/messages/refill-run'),
    onSuccess: (r) => { toast.success(`${r.queued} ${r.queued === 1 ? 'reminder' : 'reminders'} queued`, [r.skippedNoConsent ? `${r.skippedNoConsent} skipped (no consent)` : '', r.skippedAlready ? `${r.skippedAlready} already reminded` : '', r.skippedNoPhone ? `${r.skippedNoPhone} without a phone` : ''].filter(Boolean).join(' · ') || undefined); refresh(); },
    onError: (e: Error) => toast.error('Refill run failed', e.message),
  });
  const pending = (list.data ?? []).filter((r) => !r.reminderQueued && !r.reminderSent && r.consentMarketing && r.customerPhone && r.daysLeft <= leadDays).length;

  return (
    <div className="space-y-3">
      <Callout tone="accent" title="How refill reminders work">
        On the billing screen, enter the number of days the medicines will last (refill days). The due date is worked out from the bill date and shows here. Reminders go out {leadDays} {leadDays === 1 ? 'day' : 'days'} before the due date (change this under Settings) and only to customers who agreed to marketing messages; one reminder per bill.
      </Callout>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Due within" htmlFor="refill-within" className="w-40">{(id) => (
          <NativeSelect id={id} dense value={withinDays} onChange={(e) => setWithinDays(Number(e.target.value))}>
            <option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={60}>60 days</option>
          </NativeSelect>
        )}</Field>
        <Field label="Include overdue" htmlFor="refill-overdue" inline className="pb-1">{(id) => <Switch id={id} checked={includeOverdue} onCheckedChange={setIncludeOverdue} label="Include overdue refills" />}</Field>
        {can('party.write') && <Button variant="primary" className="ml-auto" icon={<Send className="h-4 w-4" />} onClick={() => all.mutate()} loading={all.isPending} disabled={pending === 0}>Queue all due{pending > 0 ? ` (${pending})` : ''}</Button>}
      </div>
      <div className="table-wrap">
        {list.isLoading ? <div className="p-6"><Spinner /></div>
          : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load refills">{(list.error as Error).message}</Callout></div>
          : !list.data?.length ? <EmptyState icon={CalendarClock} title="No refills due in this window">Bills with refill days set will show here as their due date approaches. Try a longer window.</EmptyState>
          : (
            <table className="tbl dense">
              <thead><tr><th scope="col">Due</th><th scope="col">Customer</th><th scope="col">Bill</th><th scope="col">Medicines</th><th scope="col">Reminder</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{list.data.map((r) => {
                const blocked = !r.consentMarketing ? 'No marketing consent' : !r.customerPhone ? 'No phone number' : null;
                return (
                  <tr key={r.saleId} data-tone={r.daysLeft < 0 ? 'danger' : r.daysLeft <= 2 ? 'warning' : undefined}>
                    <td className="whitespace-nowrap"><div className="tabular-nums">{formatDateIN(r.refillDueDate)}</div><DaysLeft days={r.daysLeft} /></td>
                    <td><div className="font-medium">{r.customerName ?? <span className="text-text-2">Walk-in</span>}</div><div className="text-xs text-text-2 tabular-nums">{r.customerPhone ?? 'No phone'}{r.patientName && r.patientName !== r.customerName ? ` · for ${r.patientName}` : ''}</div></td>
                    <td className="whitespace-nowrap"><Link to="/sales/$id" params={{ id: String(r.saleId) }} className="font-medium text-accent hover:underline">{r.invoiceNo ?? `#${r.saleId}`}</Link><div className="text-xs text-text-2">{formatDateIN(r.date)}{r.refillDays ? ` · ${r.refillDays} days` : ''}</div></td>
                    <td className="max-w-xs truncate text-text-2" title={r.items ?? undefined}>{r.items ?? '—'}</td>
                    <td>{r.reminderSent ? <Badge tone="success">Sent</Badge> : r.reminderQueued ? <Badge tone="accent">In outbox</Badge> : blocked ? <Badge tone="neutral">{blocked}</Badge> : <Badge tone="neutral">Not sent</Badge>}</td>
                    <td className="text-right">{can('party.write') && !r.reminderSent && !r.reminderQueued && <Button size="sm" onClick={() => one.mutate(r.saleId)} loading={one.isPending && one.variables === r.saleId} disabled={!!blocked} title={blocked ?? undefined} aria-label={`Send refill reminder for bill ${r.invoiceNo ?? r.saleId}`}>Send reminder</Button>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
      </div>
      {list.data && <p className="text-xs text-text-2">{list.data.length} {list.data.length === 1 ? 'bill' : 'bills'} due. Customers without marketing consent are listed but not messaged; record consent on the customer to enable reminders.</p>}
    </div>
  );
}
