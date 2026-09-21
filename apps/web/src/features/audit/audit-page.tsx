import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Download, ScrollText, Search } from 'lucide-react';
import { Fragment, useState } from 'react';
import { api, downloadCsv } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTimeIN, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, Input, NativeSelect, PageHeader, Pagination, Spinner, type Tone } from '@/components/ui';

interface AuditRow { id: number; at: string; userId: number | null; username: string | null; entity: string; entityId: string | null; action: string; beforeJson: string | null; afterJson: string | null; reason: string | null; ip: string | null }
interface AuditResp { rows: AuditRow[]; total: number; page: number; pageSize: number; entities: string[] }

const PAGE_SIZE = 50;
const MAX_JSON = 4000;

function actionTone(action: string): Tone {
  const a = action.toLowerCase();
  if (/delete|cancel|dispos|purge/.test(a)) return 'danger';
  if (/update|adjust|edit|quarantine|duty_off|password/.test(a)) return 'warning';
  if (/create|post|add|receive|duty_on|login/.test(a)) return 'accent';
  return 'neutral';
}
function humanise(s: string) { return s.replace(/[_.]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()); }
function pretty(json: string | null): string | null {
  if (!json) return null;
  let text: string;
  try { text = JSON.stringify(JSON.parse(json), null, 2); } catch { text = json; }
  return text.length > MAX_JSON ? `${text.slice(0, MAX_JSON)}\n… (${text.length - MAX_JSON} more characters not shown)` : text;
}

export function AuditPage() {
  const search = useSearch({ from: '/app/audit' });
  const nav = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState(search.q ?? '');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const page = search.page ?? 1;
  const entity = search.entity ?? '';
  const from = search.from ?? '';
  const to = search.to ?? '';
  const set = (patch: Partial<typeof search>) => nav({ to: '/audit', search: (s) => ({ ...s, page: 1, ...patch }) });
  const query = useQuery({ queryKey: ['audit', search], queryFn: () => api.get<AuditResp>('/audit', { entity: entity || undefined, from: from || undefined, to: to || undefined, q: search.q, page, pageSize: PAGE_SIZE }), placeholderData: (p) => p, enabled: can('audit.view') });

  if (!can('audit.view')) return <Callout tone="warning" title="The audit log is available to the owner only">Ask the owner if you need to check who changed a record.</Callout>;

  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const entities = query.data?.entities ?? [];

  return (
    <div>
      <PageHeader title="Audit log" description="Who changed what, and when. Open a row to compare the record before and after the change."
        actions={<Button variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => query.data && downloadCsv(`audit-${from || 'all'}-${to || todayIST()}`, query.data.rows.map((r) => ({ at: r.at, user: r.username, entity: r.entity, entityId: r.entityId, action: r.action, reason: r.reason, ip: r.ip, before: r.beforeJson, after: r.afterJson })))}>Export this page</Button>} />

      <Callout tone="accent" className="mb-3">Append-only log of every change (CGST Rule 56(8)). Entries cannot be edited or deleted.</Callout>

      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: q || undefined }); }}>
        <NativeSelect dense value={entity} onChange={(e) => set({ entity: e.target.value || undefined })} aria-label="Record type" className="w-48"><option value="">All record types</option>{entities.map((en) => <option key={en} value={en}>{humanise(en)}</option>)}</NativeSelect>
        <label className="text-xs text-text-2">From<Input dense type="date" value={from} onChange={(e) => set({ from: e.target.value || undefined })} aria-label="From date" /></label>
        <label className="text-xs text-text-2">To<Input dense type="date" value={to} onChange={(e) => set({ to: e.target.value || undefined })} aria-label="To date" /></label>
        <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Record id, action, reason or any value" aria-label="Search audit log" addonStart={<Search className="h-4 w-4" />} className="w-72" />
        <Button type="submit" size="sm">Search</Button>
        {(entity || from || to || search.q) && <Button type="button" size="sm" variant="ghost" onClick={() => { setQ(''); set({ entity: undefined, from: undefined, to: undefined, q: undefined }); }}>Clear filters</Button>}
      </form>

      <div className="table-wrap">
        {query.isLoading ? <div className="p-6"><Spinner /></div>
          : query.isError ? <div className="p-4"><Callout tone="danger" title="Could not load the audit log">{(query.error as Error).message}</Callout></div>
          : !query.data?.rows.length ? <EmptyState icon={ScrollText} title="No entries match">Widen the date range or clear the filters. Every create, update, cancel and login is logged.</EmptyState>
          : (
            <table className="tbl dense">
              <thead><tr><th scope="col"><span className="sr-only">Details</span></th><th scope="col">Time</th><th scope="col">User</th><th scope="col">Record</th><th scope="col">Action</th><th scope="col">Reason</th></tr></thead>
              <tbody>{query.data.rows.map((r) => {
                const isOpen = open.has(r.id);
                const before = pretty(r.beforeJson);
                const after = pretty(r.afterJson);
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="w-10"><button type="button" onClick={() => toggle(r.id)} aria-expanded={isOpen} aria-controls={`audit-${r.id}`} aria-label={`${isOpen ? 'Hide' : 'Show'} details for entry ${r.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-surface-2">{isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</button></td>
                      <td className="whitespace-nowrap tabular-nums">{formatDateTimeIN(r.at)}</td>
                      <td>{r.username ?? <span className="text-text-3">system</span>}</td>
                      <td><span className="font-medium">{humanise(r.entity)}</span>{r.entityId && <span className="ml-1 font-mono text-xs text-text-2">#{r.entityId}</span>}</td>
                      <td><Badge tone={actionTone(r.action)}>{humanise(r.action)}</Badge></td>
                      <td className="max-w-md text-text-2">{r.reason ?? <span className="text-text-3">—</span>}</td>
                    </tr>
                    {isOpen && (
                      <tr id={`audit-${r.id}`}>
                        <td colSpan={6} className="bg-surface-2/60">
                          <div className="grid gap-3 py-1 md:grid-cols-2">
                            <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-2">Before</p>{before ? <pre className="max-h-96 overflow-auto rounded border border-border bg-surface p-2 text-xs leading-5">{before}</pre> : <p className="text-xs text-text-3">Nothing — new record</p>}</div>
                            <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-2">After</p>{after ? <pre className="max-h-96 overflow-auto rounded border border-border bg-surface p-2 text-xs leading-5">{after}</pre> : <p className="text-xs text-text-3">Nothing — record removed or no data captured</p>}</div>
                          </div>
                          <p className="pb-1 text-[11px] text-text-2">Entry #{r.id}{r.ip ? ` · from ${r.ip}` : ''}{r.userId ? ` · user id ${r.userId}` : ''}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}</tbody>
            </table>
          )}
      </div>
      {query.data && <div className="mt-3 flex justify-end"><Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPage={(p) => nav({ to: '/audit', search: (s) => ({ ...s, page: p }) })} /></div>}
    </div>
  );
}
