import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { MessageCircle, Send, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { formatDateIN, formatDateTimeIN } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, Money, Spinner } from '@/components/ui';
import { openWa, type DuesRow, type MessagingStatus } from './shared';

const RECENT_DAYS = 7;
const isRecent = (r: DuesRow) => !!r.lastReminderAt && new Date(r.lastReminderAt).getTime() >= Date.now() - RECENT_DAYS * 86_400_000;

export function DuesTab({ status }: { status: MessagingStatus | undefined }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const list = useQuery({ queryKey: ['messages-dues'], queryFn: () => api.get<DuesRow[]>('/messages/dues') });
  const manualMode = status?.provider !== 'meta_cloud';
  const eligible = useMemo(() => (list.data ?? []).filter((r) => !isRecent(r)), [list.data]);
  const total = useMemo(() => (list.data ?? []).reduce((a, r) => a + r.balancePaise, 0), [list.data]);
  const run = useMutation({
    mutationFn: (customerIds?: number[]) => api.post<{ queued: number; skippedRecent: number }>('/messages/dues-run', { customerIds }),
    onSuccess: (r) => { toast.success(`${r.queued} ${r.queued === 1 ? 'reminder' : 'reminders'} ${manualMode ? 'added to the outbox' : 'queued'}`, r.skippedRecent ? `${r.skippedRecent} skipped — reminded in the last ${RECENT_DAYS} days` : manualMode ? 'Open the Outbox tab to send them on WhatsApp.' : undefined); setSelected(new Set()); qc.invalidateQueries({ queryKey: ['messages-dues'] }); qc.invalidateQueries({ queryKey: ['messages'] }); qc.invalidateQueries({ queryKey: ['messages-status'] }); },
    onError: (e: Error) => toast.error('Could not queue reminders', e.message),
  });
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = eligible.length > 0 && eligible.every((r) => selected.has(r.id));

  return (
    <div className="space-y-3">
      <Callout tone="accent" title="Dues reminders are about the customer's own account">
        A polite payment reminder with the pending amount{' '}and your UPI ID (if set under Store settings). These are transactional, so consent for marketing is not needed. A customer is not reminded more than once in {RECENT_DAYS} days.
      </Callout>
      <div className="flex flex-wrap items-center gap-2">
        {list.data && <span className="text-sm text-text-2">{list.data.length} {list.data.length === 1 ? 'customer' : 'customers'} · total dues <Money paise={total} className="font-medium text-warning" /></span>}
        {can('party.write') && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" icon={<Send className="h-4 w-4" />} disabled={selected.size === 0} loading={run.isPending && run.variables !== undefined} onClick={() => run.mutate(Array.from(selected))}>Send to selected{selected.size ? ` (${selected.size})` : ''}</Button>
            <Button size="sm" variant="primary" icon={<Send className="h-4 w-4" />} disabled={eligible.length === 0} loading={run.isPending && run.variables === undefined} onClick={() => run.mutate(undefined)}>Send to all due ({eligible.length})</Button>
          </div>
        )}
      </div>
      <div className="table-wrap">
        {list.isLoading ? <div className="p-6"><Spinner /></div>
          : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load dues">{(list.error as Error).message}</Callout></div>
          : !list.data?.length ? <EmptyState icon={Wallet} title="No customers with dues">Everyone is settled up.</EmptyState>
          : (
            <table className="tbl dense">
              <thead><tr>
                <th scope="col" className="w-10">{can('party.write') && <input type="checkbox" aria-label="Select all customers not reminded recently" className="h-4 w-4" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(eligible.map((r) => r.id)))} />}</th>
                <th scope="col">Customer</th><th scope="col" className="num">Dues</th><th scope="col">Last activity</th><th scope="col">Last reminder</th><th scope="col"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>{list.data.map((r) => {
                const recent = isRecent(r);
                return (
                  <tr key={r.id} data-state={selected.has(r.id) ? 'selected' : undefined}>
                    <td>{can('party.write') && <input type="checkbox" aria-label={`Select ${r.name}`} className="h-4 w-4" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />}</td>
                    <td><Link to="/customers" search={{ id: r.id }} className="font-medium text-accent hover:underline">{r.name}</Link><div className="text-xs tabular-nums text-text-2">{r.phone}</div></td>
                    <td className="num"><Money paise={r.balancePaise} className="font-medium text-warning" /></td>
                    <td className="whitespace-nowrap text-text-2">{r.lastDate ? formatDateIN(r.lastDate) : '—'}</td>
                    <td className="whitespace-nowrap">{r.lastReminderAt ? <><span className="tabular-nums text-text-2">{formatDateTimeIN(r.lastReminderAt)}</span>{recent && <Badge tone="neutral" className="ml-1">Recent</Badge>}</> : <span className="text-text-3">Never</span>}</td>
                    <td className="text-right"><Button size="sm" variant="ghost" icon={<MessageCircle className="h-4 w-4" />} onClick={() => openWa(r.waLink)} aria-label={`Open WhatsApp chat with ${r.name}`}>WhatsApp</Button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
      </div>
    </div>
  );
}
