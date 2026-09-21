import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDateTimeIN } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, Spinner } from '@/components/ui';

interface Backup { id: number; at: string; path: string; sizeBytes: number | null; ok: boolean; note: string | null; triggeredBy: string | null; exists: boolean }

function mb(bytes: number | null) { return bytes === null ? '—' : `${(bytes / (1024 * 1024)).toFixed(2)} MB`; }

export function BackupTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['backups'], queryFn: () => api.get<Backup[]>('/backups') });
  const run = useMutation({
    mutationFn: () => api.post<{ ok: boolean; path?: string; sizeBytes?: number | null; note?: string | null }>('/backups'),
    onSuccess: (b) => { qc.invalidateQueries({ queryKey: ['backups'] }); if (b?.ok === false) toast.error('Backup failed', b.note ?? 'See the note in the list'); else toast.success('Backup complete', b?.sizeBytes ? `${mb(b.sizeBytes)} written` : undefined); },
    onError: (e: Error) => toast.error('Backup failed', e.message),
  });
  const last = list.data?.find((b) => b.ok);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Callout tone="accent" className="max-w-3xl flex-1" title="How backups work">
          Nightly at about 02:00 the database is copied to the backups folder; the last 30 copies are kept. Download a copy weekly to a USB drive or cloud folder. Restore: stop the app, replace data/pharmacy.db with the downloaded file, start again.
        </Callout>
        <Button variant="primary" icon={<DatabaseBackup className="h-4 w-4" />} onClick={() => run.mutate()} loading={run.isPending}>Back up now</Button>
      </div>
      {last && <p className="text-sm text-text-2">Last good backup: <span className="font-medium text-text">{formatDateTimeIN(last.at)}</span> ({mb(last.sizeBytes)}).</p>}
      <div className="table-wrap">
        {list.isLoading ? <div className="p-6"><Spinner /></div>
          : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load backups">{(list.error as Error).message}</Callout></div>
          : !list.data?.length ? <EmptyState icon={DatabaseBackup} title="No backups yet" action={<Button variant="primary" onClick={() => run.mutate()} loading={run.isPending}>Run the first backup</Button>}>The first nightly copy runs automatically; you can make one now.</EmptyState>
          : (
            <table className="tbl dense">
              <thead><tr><th scope="col">Time</th><th scope="col" className="num">Size</th><th scope="col">Result</th><th scope="col">Triggered by</th><th scope="col">Note</th><th scope="col"><span className="sr-only">Download</span></th></tr></thead>
              <tbody>{list.data.map((b) => (
                <tr key={b.id} data-tone={!b.ok ? 'danger' : undefined}>
                  <td className="whitespace-nowrap tabular-nums">{formatDateTimeIN(b.at)}</td>
                  <td className="num">{mb(b.sizeBytes)}</td>
                  <td>{b.ok ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Failed</Badge>}{b.ok && !b.exists && <Badge tone="warning" className="ml-1">File missing</Badge>}</td>
                  <td>{b.triggeredBy ?? 'Schedule'}</td>
                  <td className="max-w-xs truncate text-text-2" title={b.note ?? undefined}>{b.note ?? <span className="text-text-3">—</span>}</td>
                  <td className="text-right">{b.ok && b.exists ? <a href={api.downloadUrl(`/backups/${b.id}/download`)} download className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-accent hover:bg-accent-bg"><Download className="h-4 w-4" aria-hidden />Download</a> : <span className="text-xs text-text-3">Not available</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
      </div>
    </div>
  );
}
