import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Plus, RotateCcw, Search, X, Check, Inbox } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { debounce, formatDateTimeIN } from '@/lib/utils';
import { Button, Callout, Combobox, Dialog, EmptyState, Field, Input, NativeSelect, Pagination, Spinner, Textarea, Tooltip } from '@/components/ui';
import { StatusBadge, TemplateBadge, TEMPLATE_LABELS, openWa, type MessagingStatus, type OutboxPage, type OutboxRow, type TemplateKey } from './shared';

interface Filters { status?: string; template?: string; q?: string; page?: number }
interface Customer { id: number; name: string; phone: string; consentMarketing: boolean }

export function OutboxTab({ filters, onFilter, status }: { filters: Filters; onFilter: (f: Filters) => void; status: MessagingStatus | undefined }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [q, setQ] = useState(filters.q ?? '');
  const [composeOpen, setComposeOpen] = useState(false);
  const page = filters.page ?? 1;
  const list = useQuery({
    queryKey: ['messages', filters.status, filters.template, filters.q, page],
    queryFn: () => api.get<OutboxPage>('/messages', { status: filters.status, templateKey: filters.template, q: filters.q, page, pageSize: 50 }),
    placeholderData: (p) => p, refetchInterval: 30_000,
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['messages'] }); qc.invalidateQueries({ queryKey: ['messages-status'] }); };
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'retry' | 'mark-sent' | 'cancel' }) => api.post<OutboxRow>(`/messages/${id}/${action}`),
    onSuccess: (_r, v) => { toast.success(v.action === 'retry' ? 'Message queued again' : v.action === 'mark-sent' ? 'Marked as sent' : 'Message cancelled'); refresh(); },
    onError: (e: Error) => toast.error('Could not update the message', e.message),
  });
  const manualMode = status?.provider !== 'meta_cloud';

  return (
    <div className="space-y-3">
      {manualMode && (
        <Callout tone="accent" title="Manual mode: messages open in WhatsApp for you to send">
          Each message below has an <strong>Open WhatsApp</strong> button that opens the chat with the text ready. After you press send in WhatsApp, come back and press <strong>Mark as sent</strong>. To send automatically, connect the Meta WhatsApp Cloud API under Settings.
        </Callout>
      )}
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); onFilter({ q: q || undefined, page: 1 }); }}>
        <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Phone, customer or text" aria-label="Search messages" addonStart={<Search className="h-4 w-4" />} className="w-64" />
        <Button type="submit" size="sm">Search</Button>
        <NativeSelect dense aria-label="Filter by status" className="w-40" value={filters.status ?? ''} onChange={(e) => onFilter({ status: e.target.value || undefined, page: 1 })}>
          <option value="">All statuses</option><option value="manual">To send</option><option value="queued">Queued</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="skipped">Cancelled</option>
        </NativeSelect>
        <NativeSelect dense aria-label="Filter by message type" className="w-44" value={filters.template ?? ''} onChange={(e) => onFilter({ template: e.target.value || undefined, page: 1 })}>
          <option value="">All types</option>{Object.entries(TEMPLATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        {(filters.status || filters.template || filters.q) && <Button variant="ghost" size="sm" onClick={() => { setQ(''); onFilter({ status: undefined, template: undefined, q: undefined, page: 1 }); }}>Clear filters</Button>}
        {can('party.write') && <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} className="ml-auto" onClick={() => setComposeOpen(true)}>New message</Button>}
      </form>

      <div className="table-wrap">
        {list.isLoading ? <div className="p-6"><Spinner /></div>
          : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load messages">{(list.error as Error).message}</Callout></div>
          : !list.data?.rows.length ? <EmptyState icon={Inbox} title={filters.status || filters.template || filters.q ? 'No messages match' : 'No messages yet'} action={can('party.write') ? <Button variant="primary" onClick={() => setComposeOpen(true)}>Write a message</Button> : undefined}>{filters.status || filters.template || filters.q ? 'Try clearing the filters.' : 'Bill copies, dues and refill reminders you queue will appear here.'}</EmptyState>
          : (
            <table className="tbl dense">
              <thead><tr><th scope="col">Time</th><th scope="col">To</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Message</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{list.data.rows.map((m) => (
                <tr key={m.id} data-tone={m.status === 'failed' ? 'danger' : undefined}>
                  <td className="whitespace-nowrap tabular-nums text-text-2">{formatDateTimeIN(m.sentAt ?? m.createdAt)}</td>
                  <td><div className="font-medium">{m.customerName ?? <span className="text-text-2">Unknown</span>}</div><div className="text-xs tabular-nums text-text-2">{m.toPhone}</div></td>
                  <td><TemplateBadge templateKey={m.templateKey} /></td>
                  <td>
                    <StatusBadge status={m.status} />
                    {m.status === 'failed' && m.error && <div className="mt-0.5 max-w-[16rem] truncate text-xs text-danger" title={m.error}>{m.error}</div>}
                    {m.status === 'queued' && m.attempts > 0 && <div className="mt-0.5 text-xs text-text-2">Retry {m.attempts} of 3</div>}
                  </td>
                  <td className="max-w-md"><Tooltip content={<span className="whitespace-pre-wrap">{m.body}</span>}><span className="block truncate text-text-2">{m.body.slice(0, 80)}{m.body.length > 80 ? '…' : ''}</span></Tooltip></td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1">
                      {(m.status === 'manual' || m.status === 'failed') && <Button size="sm" variant="outline" icon={<MessageCircle className="h-4 w-4" />} onClick={() => openWa(m.waLink)} aria-label={`Open WhatsApp chat with ${m.customerName ?? m.toPhone}`}>Open WhatsApp</Button>}
                      {(m.status === 'manual' || m.status === 'failed') && <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => act.mutate({ id: m.id, action: 'mark-sent' })} loading={act.isPending && act.variables?.id === m.id && act.variables.action === 'mark-sent'} aria-label={`Mark message to ${m.toPhone} as sent`}>Mark as sent</Button>}
                      {(m.status === 'failed' || m.status === 'skipped') && !manualMode && <Button size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => act.mutate({ id: m.id, action: 'retry' })} loading={act.isPending && act.variables?.id === m.id && act.variables.action === 'retry'} aria-label={`Retry message to ${m.toPhone}`}>Retry</Button>}
                      {(m.status === 'queued' || m.status === 'manual') && <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => act.mutate({ id: m.id, action: 'cancel' })} loading={act.isPending && act.variables?.id === m.id && act.variables.action === 'cancel'} aria-label={`Cancel message to ${m.toPhone}`}>Cancel</Button>}
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
      </div>
      {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => onFilter({ page: p })} />}
      {composeOpen && <ComposeDialog manualMode={manualMode} onClose={() => setComposeOpen(false)} onQueued={() => { setComposeOpen(false); refresh(); }} />}
    </div>
  );
}

function ComposeDialog({ manualMode, onClose, onQueued }: { manualMode: boolean; onClose: () => void; onQueued: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [phone, setPhone] = useState('');
  const [templateKey, setTemplateKey] = useState<TemplateKey>('custom');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; body?: string; headline?: string }>({});
  const customers = useQuery({ queryKey: ['customers', 'pick', search], queryFn: () => api.get<Customer[]>('/customers', { q: search || undefined }), placeholderData: (p) => p });
  const setSearchDebounced = debounce(setSearch, 250);
  const options = (customers.data ?? []).map((c) => ({ value: c.id, label: c.name, description: c.phone, keywords: c.phone }));
  const selected = customers.data?.find((c) => c.id === customerId);
  const send = useMutation({
    mutationFn: () => api.post<OutboxRow>('/messages', { toPhone: phone.trim(), templateKey, body: body.trim(), customerId, relatedType: null, relatedId: null, scheduledFor: null }),
    onSuccess: (m) => { toast.success(manualMode ? 'Message ready to send' : 'Message queued', manualMode ? 'Open WhatsApp from the outbox to send it.' : undefined); if (manualMode) openWa(m.waLink); onQueued(); },
    onError: (e: Error) => setErrors({ headline: e.message }),
  });
  const submit = () => {
    const next: typeof errors = {};
    if (!/^\d{10,15}$/.test(phone.trim())) next.phone = 'Enter a 10-digit mobile number';
    if (!body.trim()) next.body = 'Type the message';
    setErrors(next);
    if (!Object.keys(next).length) send.mutate();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="New WhatsApp message" description="Pick a customer or type a number. Bill and reminder texts are written for you elsewhere; this is for a free-text message." size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} loading={send.isPending}>{manualMode ? 'Open in WhatsApp' : 'Queue message'}</Button></>}>
      <div className="space-y-3">
        {errors.headline && <Callout tone="danger" title="Could not queue the message">{errors.headline}</Callout>}
        <Field label="Customer" hint="Search by name or phone; the number fills in automatically">{(id) => (
          <Combobox id={id} options={options} value={customerId} loading={customers.isFetching} allowClear placeholder="Search customers…" onSearch={setSearchDebounced} ariaLabel="Customer"
            onChange={(v) => { setCustomerId(v); const c = customers.data?.find((x) => x.id === v); if (c) setPhone(c.phone); }} />
        )}</Field>
        {selected && !selected.consentMarketing && templateKey === 'refill' && <Callout tone="warning" title="No marketing consent">This customer has not agreed to marketing messages. Only bill copies and dues reminders should be sent (DPDP Act).</Callout>}
        <Field label="Mobile number" required error={errors.phone}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={15} value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!errors.phone} />}</Field>
        <Field label="Message type" hint="Used for filtering in the outbox">{(id) => (
          <NativeSelect id={id} value={templateKey} onChange={(e) => setTemplateKey(e.target.value as TemplateKey)}>
            {(['custom', 'bill', 'dues', 'refill', 'po'] as TemplateKey[]).map((k) => <option key={k} value={k}>{TEMPLATE_LABELS[k]}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label="Message" required hint={`${body.length} / 2000 characters`} error={errors.body}>{(id, d) => <Textarea id={id} aria-describedby={d} maxLength={2000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} invalid={!!errors.body} placeholder="Namaste, your order is ready for pickup…" />}</Field>
      </div>
    </Dialog>
  );
}
