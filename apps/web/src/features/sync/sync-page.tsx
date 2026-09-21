import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { CloudOff, CloudUpload, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { discardOutbox, getCounterCode, odb, refreshSnapshot, retryFailed, setCounterCode, syncNow, useSyncStatus } from '@/lib/offline';
import { useToast } from '@/lib/toast';
import { formatDateTimeIN, rupees } from '@/lib/utils';
import { Badge, Button, Callout, ConfirmDialog, EmptyState, Field, Input, Money, PageHeader, Stat } from '@/components/ui';

export function SyncPage() {
  const s = useSyncStatus();
  const toast = useToast();
  const outbox = useLiveQuery(() => odb.outbox.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const synced = useLiveQuery(() => odb.synced.orderBy('createdAt').reverse().limit(50).toArray(), []) ?? [];
  const counts = useLiveQuery(async () => ({ items: await odb.items.count(), batches: await odb.batches.count(), customers: await odb.customers.count() }), []);
  const server = useQuery({ queryKey: ['sync-status'], queryFn: () => api.get<{ offlineBills: number; lastSyncedAt: string | null; negativeStockBatches: number; recent: { id: number; invoiceNo: string; totalPaise: number; clientPostedAt: string | null; syncedAt: string | null; counter: string }[] }>('/sync/status'), retry: false });
  const [counter, setCounter] = useState(getCounterCode());
  const [discard, setDiscard] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); server.refetch(); } catch (e) { toast.error('Could not complete', (e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="space-y-4">
      <PageHeader title="Offline & sync" description="Billing keeps working when the internet drops. Bills made offline get a number in this counter's own series and are sent to the server when the connection returns."
        actions={<><Button icon={<RefreshCw className="h-4 w-4" />} loading={busy} onClick={() => run(() => refreshSnapshot(true), 'Offline copy refreshed')}>Refresh offline copy</Button><Button variant="primary" icon={<CloudUpload className="h-4 w-4" />} loading={s.syncing || busy} disabled={!s.online} onClick={() => run(async () => { const r = await syncNow(); if (r.failed) throw new Error(`${r.failed} bill(s) could not be sent; see below`); }, 'Sync complete')}>Sync now</Button></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Connection" value={s.mode === 'online' ? 'Online' : 'Offline'} tone={s.mode === 'online' ? 'success' : 'warning'} icon={CloudOff} sub={s.online ? 'Server reachable' : 'No network'} />
        <Stat label="Waiting to send" value={s.pending} tone={s.pending ? 'warning' : 'neutral'} sub={s.failed ? `${s.failed} need attention` : 'All sent'} />
        <Stat label="Offline copy" value={counts ? `${counts.items} items` : '—'} sub={s.lastSnapshotAt ? `Updated ${formatDateTimeIN(s.lastSnapshotAt)}` : 'Not downloaded yet'} tone={s.lastSnapshotAt ? 'neutral' : 'warning'} />
        <Stat label="Offline bills on server" value={server.data?.offlineBills ?? '—'} sub={server.data?.negativeStockBatches ? `${server.data.negativeStockBatches} batches went negative` : 'Stock consistent'} tone={server.data?.negativeStockBatches ? 'danger' : 'neutral'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-1">
          <h2 className="text-base">This counter</h2>
          <p className="mt-1 text-sm text-text-2">Each device that may bill offline needs its own counter code so bill numbers never clash. The offline series is INV-{counter}/FY/00001.</p>
          <Field label="Counter code" className="mt-3" hint="Letters and digits, e.g. C1, C2, TAB1">{(id) => <div className="flex gap-2"><Input id={id} value={counter} onChange={(e) => setCounter(e.target.value.toUpperCase())} className="max-w-[140px]" /><Button onClick={() => { setCounterCode(counter); toast.success('Counter code saved'); }}>Save</Button></div>}</Field>
          <Callout tone="accent" className="mt-3 text-xs" title="How offline billing works">Search, batches, customers and prescriber lists come from the offline copy (refreshed every 10 minutes while online). Expired stock and Schedule rules still apply. Payments and credit are recorded when the bill syncs; the printed bill is the same.</Callout>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <section className="card">
            <div className="border-b border-border px-4 py-2"><h2 className="text-base">Waiting to send ({outbox.length})</h2></div>
            {outbox.length === 0 ? <EmptyState title="Nothing waiting">Every bill from this device has reached the server.</EmptyState> : (
              <table className="tbl dense"><thead><tr><th>Offline bill no</th><th>Made at</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
                <tbody>{outbox.map((o) => <tr key={o.clientRef} data-tone={o.status === 'failed' ? 'danger' : undefined}><td className="font-medium">{o.invoiceNo}</td><td>{formatDateTimeIN(o.postedAt)}</td><td className="num"><Money paise={o.totalPaise} /></td><td>{o.status === 'failed' ? <><Badge tone="danger">Rejected</Badge><div className="mt-1 max-w-md text-xs text-danger">{o.error}</div></> : <Badge tone="warning">Waiting</Badge>}</td><td className="text-right"><div className="flex justify-end gap-1">{o.status === 'failed' && <Button size="sm" onClick={() => run(() => retryFailed(o.clientRef), 'Retried')}>Retry</Button>}<Button size="sm" variant="ghost" aria-label="Discard this offline bill" onClick={() => { setDiscard(o.clientRef); setReason(''); }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table>
            )}
          </section>
          <section className="card">
            <div className="border-b border-border px-4 py-2"><h2 className="text-base">Recently synced from this device</h2></div>
            {synced.length === 0 ? <p className="p-4 text-sm text-text-2">No offline bills yet.</p> : (
              <table className="tbl dense"><thead><tr><th>Offline no</th><th>Server bill</th><th>Made at</th><th className="num">Amount</th><th>Result</th></tr></thead>
                <tbody>{synced.map((o) => <tr key={o.clientRef}><td>{o.invoiceNo}</td><td>{o.serverId ? <a className="text-accent underline" href={`/sales/${o.serverId}`}>{o.syncedInvoiceNo}</a> : '—'}</td><td>{formatDateTimeIN(o.postedAt)}</td><td className="num">{rupees(o.totalPaise)}</td><td>{o.status === 'failed' ? <Badge tone="danger">{o.error?.slice(0, 60)}</Badge> : <Badge tone="success">Synced</Badge>}</td></tr>)}</tbody></table>
            )}
          </section>
        </div>
      </div>
      <ConfirmDialog open={!!discard} onOpenChange={(o) => !o && setDiscard(null)} title="Discard this offline bill?" confirmLabel="Discard" requireReason reason={reason} onReason={setReason} onConfirm={() => run(async () => { await discardOutbox(discard!, reason); setDiscard(null); }, 'Offline bill discarded and logged')}>
        <p>The bill will not be recorded on the server. Stock on this device is restored. The reason is written to the audit log so the missing number in the offline series can be explained.</p>
      </ConfirmDialog>
    </div>
  );
}
