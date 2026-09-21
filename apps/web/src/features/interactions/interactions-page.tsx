import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Badge, Button, Callout, ConfirmDialog, EmptyState, Field, Input, NativeSelect, PageHeader, Pagination, Sheet, Spinner, Switch, Textarea } from '@/components/ui';

interface Rule { id: number; saltA: string; saltB: string; severity: 'major' | 'moderate' | 'minor'; message: string; advice: string | null; source: string | null; active: boolean }
const SEV: Record<Rule['severity'], { tone: 'danger' | 'warning' | 'neutral'; label: string; help: string }> = {
  major: { tone: 'danger', label: 'Major – stops the bill', help: 'The bill cannot be saved until the pharmacist records a reason.' },
  moderate: { tone: 'warning', label: 'Moderate – warns', help: 'Shown on the bill as a warning; counselling advised.' },
  minor: { tone: 'neutral', label: 'Minor – note', help: 'Shown quietly as a note.' },
};

export function InteractionsPage() {
  const search = useSearch({ from: '/app/interactions' });
  const nav = useNavigate();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState(search.q ?? '');
  const [severity, setSeverity] = useState('');
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [del, setDel] = useState<Rule | null>(null);
  const page = search.page ?? 1;
  const rules = useQuery({ queryKey: ['interaction-rules', search.q, severity, inactive, page], queryFn: () => api.get<{ rows: Rule[]; total: number }>('/interactions/rules', { q: search.q, severity: severity || undefined, includeInactive: inactive || undefined, page, pageSize: 50 }), placeholderData: (p) => p });
  const save = useMutation({
    mutationFn: (r: Partial<Rule>) => (r.id ? api.put(`/interactions/rules/${r.id}`, r) : api.post('/interactions/rules', r)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['interaction-rules'] }); setEditing(null); toast.success('Rule saved'); },
    onError: (e: Error) => toast.error('Could not save', e.message),
  });
  return (
    <div>
      <PageHeader title="Drug interactions" description="Pairs of salts the billing screen checks on every bill, including against the customer's purchases in the last 30 days. Duplicate salts and look-alike names are checked automatically."
        actions={can('settings.write') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ severity: 'moderate', active: true })}>Add rule</Button>} />
      <Callout tone="warning" className="mb-4" title="Starter set, not a complete reference">These rules cover commonly cited pairs and are meant to catch the obvious. They do not replace the pharmacist's judgement or a full interaction checker. Edit, add or switch off rules as your practice requires; every change is logged.</Callout>
      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); nav({ to: '/interactions', search: (s) => ({ ...s, q, page: 1 }) }); }}>
        <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Salt or message" aria-label="Search rules" addonStart={<Search className="h-4 w-4" />} className="w-64" />
        <NativeSelect dense value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity" className="w-40"><option value="">All severities</option><option value="major">Major</option><option value="moderate">Moderate</option><option value="minor">Minor</option></NativeSelect>
        <label className="flex items-center gap-2 text-sm"><Switch checked={inactive} onCheckedChange={setInactive} label="Show switched-off rules" />Show switched-off</label>
        <Button type="submit" size="sm">Search</Button>
      </form>
      <div className="table-wrap">
        {rules.isLoading ? <div className="p-6"><Spinner /></div> : !rules.data?.rows.length ? <EmptyState title="No rules match" /> : (
          <table className="tbl dense"><thead><tr><th>Salt A</th><th>Salt B</th><th>Severity</th><th>What the counter sees</th><th>Advice</th><th /></tr></thead>
            <tbody>{rules.data.rows.map((r) => <tr key={r.id} className={r.active ? '' : 'opacity-60'}><td className="font-medium capitalize">{r.saltA}</td><td className="font-medium capitalize">{r.saltB}</td><td><Badge tone={SEV[r.severity].tone}>{r.severity}</Badge>{!r.active && <Badge className="ml-1">Off</Badge>}</td><td className="max-w-md">{r.message}</td><td className="max-w-md text-text-2">{r.advice}</td><td className="text-right">{can('settings.write') && <div className="flex justify-end gap-1"><Button size="sm" onClick={() => setEditing(r)}>Edit</Button><Button size="sm" variant="ghost" aria-label="Delete rule" onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></Button></div>}</td></tr>)}</tbody></table>
        )}
      </div>
      {rules.data && <div className="mt-3 flex justify-end"><Pagination page={page} pageSize={50} total={rules.data.total} onPage={(p) => nav({ to: '/interactions', search: (s) => ({ ...s, page: p }) })} /></div>}
      {editing && (
        <Sheet open onOpenChange={(o) => !o && setEditing(null)} title={editing.id ? 'Edit rule' : 'New interaction rule'} width="sm"
          footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!editing.saltA || !editing.saltB || !editing.message} onClick={() => save.mutate(editing)}>Save rule</Button></>}>
          <div className="space-y-3">
            <Field label="Salt A" required hint="Generic name as in the item master, e.g. warfarin">{(id) => <Input id={id} value={editing.saltA ?? ''} onChange={(e) => setEditing({ ...editing, saltA: e.target.value })} />}</Field>
            <Field label="Salt B" required>{(id) => <Input id={id} value={editing.saltB ?? ''} onChange={(e) => setEditing({ ...editing, saltB: e.target.value })} />}</Field>
            <Field label="Severity" required hint={SEV[editing.severity ?? 'moderate'].help}>{(id) => <NativeSelect id={id} value={editing.severity ?? 'moderate'} onChange={(e) => setEditing({ ...editing, severity: e.target.value as Rule['severity'] })}>{(Object.keys(SEV) as Rule['severity'][]).map((s) => <option key={s} value={s}>{SEV[s].label}</option>)}</NativeSelect>}</Field>
            <Field label="Message shown at the counter" required hint="Affirmative and short, e.g. 'Warfarin with an NSAID raises bleeding risk.'">{(id) => <Textarea id={id} value={editing.message ?? ''} onChange={(e) => setEditing({ ...editing, message: e.target.value })} />}</Field>
            <Field label="Advice">{(id) => <Textarea id={id} value={editing.advice ?? ''} onChange={(e) => setEditing({ ...editing, advice: e.target.value })} placeholder="What to do: check with the prescriber, separate doses…" />}</Field>
            <Field label="Source">{(id) => <Input id={id} value={editing.source ?? ''} onChange={(e) => setEditing({ ...editing, source: e.target.value })} placeholder="e.g. BNF 2025" />}</Field>
            <div className="flex items-center gap-3"><Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} id="rule-active" /><label htmlFor="rule-active" className="text-sm">Rule is active</label></div>
          </div>
        </Sheet>
      )}
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete this rule?" confirmLabel="Delete" onConfirm={async () => { await api.del(`/interactions/rules/${del!.id}`); setDel(null); qc.invalidateQueries({ queryKey: ['interaction-rules'] }); }}>
        <p>Prefer switching a rule off (Edit → Rule is active) so it can be brought back. Deleting is logged.</p>
      </ConfirmDialog>
    </div>
  );
}
