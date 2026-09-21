import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { checkInteractions, saltsFromGenericText, type CartItemLike, type CheckResult, type Finding, type InteractionRuleLike } from '@pharma/shared';
import { api } from '@/lib/api';
import { getRules, getSyncStatus, isNetworkError } from '@/lib/offline';
import { Badge, Button, Callout, Dialog, Textarea } from '@/components/ui';
import type { CartLine } from './billing-state';

/** Local check (works offline) merged with the server check (adds the customer's recent purchases). */
export function useInteractionCheck(lines: CartLine[], customerId: number | null): CheckResult & { historyCount: number; loading: boolean } {
  const [rules, setRules] = useState<InteractionRuleLike[]>([]);
  useEffect(() => { void getRules().then((r) => { if (r.length) setRules(r); else api.get<InteractionRuleLike[]>('/interactions/rules/active').then(setRules).catch(() => undefined); }); }, []);
  const items = useMemo<CartItemLike[]>(() => { const seen = new Set<number>(); return lines.filter((l) => (seen.has(l.itemId) ? false : (seen.add(l.itemId), true))).map((l) => ({ itemId: l.itemId, name: l.itemName, salts: saltsFromGenericText(l.genericText), source: 'cart' as const })); }, [lines]);
  const local = useMemo(() => checkInteractions(items, rules), [items, rules]);
  const ids = items.map((i) => i.itemId).sort().join(',');
  const server = useQuery({
    queryKey: ['interaction-check', ids, customerId],
    queryFn: async () => { try { return await api.post<CheckResult & { historyCount: number }>('/interactions/check', { itemIds: items.map((i) => i.itemId), customerId, historyDays: 30 }); } catch (e) { if (isNetworkError(e)) return null; throw e; } },
    enabled: items.length > 0 && getSyncStatus().mode === 'online', staleTime: 30_000, retry: false,
  });
  if (server.data) return { ...server.data, loading: false };
  return { ...local, historyCount: 0, loading: server.isFetching };
}

function who(f: Finding): string {
  if (f.kind === 'duplicate') return f.items.map((i) => i.name).join(' and ');
  const b = f.b.source === 'history' ? `${f.b.name} (bought ${f.b.historyDate?.split('-').reverse().join('/')})` : f.b.name;
  return `${f.a.name} + ${b}`;
}

export function InteractionCallouts({ result, overrideReason, onOverride }: { result: CheckResult & { historyCount: number }; overrideReason: string | null; onOverride: (reason: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(overrideReason ?? '');
  const inter = result.findings.filter((f) => f.kind === 'interaction');
  const majors = inter.filter((f) => f.severity === 'major');
  const others = inter.filter((f) => f.severity !== 'major');
  const dups = result.findings.filter((f) => f.kind === 'duplicate');
  const lasa = result.findings.filter((f) => f.kind === 'lasa');
  if (!result.findings.length) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      {majors.length > 0 && (
        <Callout tone="danger" title={`${majors.length === 1 ? 'Major interaction' : `${majors.length} major interactions`} on this bill`}
          actions={overrideReason ? <><Badge tone="warning">Pharmacist reason recorded</Badge><Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Edit reason</Button></> : <Button size="sm" variant="danger" onClick={() => setOpen(true)}>Pharmacist: record reason and continue</Button>}>
          <ul className="list-disc space-y-1 pl-5">{majors.map((f, i) => f.kind === 'interaction' && <li key={i}><span className="font-medium text-text">{who(f)}:</span> {f.message}{f.advice && <span className="block text-xs">{f.advice}</span>}</li>)}</ul>
          <p className="mt-1 text-xs">The bill cannot be saved until a reason is recorded. The reason is stored with the bill and in the audit log.</p>
        </Callout>
      )}
      {others.length > 0 && <Callout tone="warning" title="Check before handing over"><ul className="list-disc space-y-1 pl-5">{others.map((f, i) => f.kind === 'interaction' && <li key={i}><span className="font-medium text-text">{who(f)}</span> <Badge tone={f.severity === 'moderate' ? 'warning' : 'neutral'} className="ml-1">{f.severity}</Badge>: {f.message}{f.advice && <span className="block text-xs">{f.advice}</span>}</li>)}</ul></Callout>}
      {dups.length > 0 && <Callout tone="warning" title="Same salt twice">{dups.map((f, i) => f.kind === 'duplicate' && <div key={i}><span className="font-medium text-text">{f.salt}</span> is in {who(f)}. Confirm the prescriber wants both.</div>)}</Callout>}
      {lasa.length > 0 && <Callout tone="accent" title="Look-alike names on one bill">{lasa.map((f, i) => f.kind === 'lasa' && <div key={i}>{f.saltA} ({f.a.name}) and {f.saltB} ({f.b.name}). Read the strip names aloud when handing over.</div>)}</Callout>}
      {result.historyCount > 0 && <p className="text-xs text-text-2">Checked against {result.historyCount} item{result.historyCount === 1 ? '' : 's'} this customer bought in the last 30 days.</p>}
      <Dialog open={open} onOpenChange={setOpen} title="Record the pharmacist's reason" role="alertdialog" size="sm" description="Why is it acceptable to dispense these together? For example: prescriber confirmed, doses spaced, patient already stable on both."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={reason.trim().length < 5} onClick={() => { onOverride(reason.trim()); setOpen(false); }}>Save reason</Button></>}>
        <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" placeholder="Dr Deshmukh confirmed on phone; INR check booked" />
      </Dialog>
    </div>
  );
}
