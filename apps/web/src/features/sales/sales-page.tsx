import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Download, Search, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { api, downloadCsv } from '@/lib/api';
import { formatDateIN, formatDateTimeIN, todayIST } from '@/lib/utils';
import { Badge, Button, EmptyState, Input, Money, NativeSelect, PageHeader, Pagination, ScheduleBadge, Spinner } from '@/components/ui';

interface Row { id: number; invoiceNo: string; date: string; kind: string; status: string; customerName: string | null; customerPhone: string | null; patientName: string | null; totalPaise: number; paidPaise: number; creditPaise: number; returnedPaise: number; strictestSchedule: string; createdAt: string; createdByName: string | null; lineCount: number }

export function SalesPage() {
  const search = useSearch({ from: '/app/sales' });
  const nav = useNavigate();
  const [q, setQ] = useState(search.q ?? '');
  const page = search.page ?? 1;
  const from = search.from ?? '';
  const to = search.to ?? '';
  const status = search.status ?? '';
  const query = useQuery({ queryKey: ['sales', search], queryFn: () => api.get<{ rows: Row[]; total: number }>('/sales', { q: search.q, page, pageSize: 50, from: from || undefined, to: to || undefined, status: status || undefined }), placeholderData: (p) => p });
  const set = (patch: Partial<typeof search>) => nav({ to: '/sales', search: (s) => ({ ...s, page: 1, ...patch }) });
  return (
    <div>
      <PageHeader title="Bills & returns" description="Every bill posted at the counter. Open a bill to reprint, return items or cancel it."
        actions={<><Button variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => query.data && downloadCsv(`bills-${from || 'all'}-${to || todayIST()}`, query.data.rows as unknown as Record<string, unknown>[])}>Export CSV</Button><Button variant="primary" icon={<ShoppingCart className="h-4 w-4" />} onClick={() => nav({ to: '/billing' })}>New bill</Button></>} />
      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); set({ q }); }}>
        <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill no, customer, phone or patient" aria-label="Search bills" addonStart={<Search className="h-4 w-4" />} className="w-72" />
        <label className="text-xs text-text-2">From<Input dense type="date" value={from} onChange={(e) => set({ from: e.target.value || undefined })} aria-label="From date" /></label>
        <label className="text-xs text-text-2">To<Input dense type="date" value={to} onChange={(e) => set({ to: e.target.value || undefined })} aria-label="To date" /></label>
        <NativeSelect dense value={status} onChange={(e) => set({ status: e.target.value || undefined })} aria-label="Status" className="w-40"><option value="">All statuses</option><option value="posted">Posted</option><option value="cancelled">Cancelled</option></NativeSelect>
        <Button type="submit" size="sm">Search</Button>
      </form>
      <div className="table-wrap">
        {query.isLoading ? <div className="p-6"><Spinner /></div> : !query.data?.rows.length ? <EmptyState title="No bills found">Try widening the date range or clearing the search.</EmptyState> : (
          <table className="tbl dense">
            <thead><tr><th>Bill no</th><th>Date</th><th>Customer / patient</th><th>Items</th><th className="num">Total</th><th className="num">Credit</th><th>Status</th><th>By</th></tr></thead>
            <tbody>{query.data.rows.map((r) => (
              <tr key={r.id} data-tone={r.status === 'cancelled' ? 'danger' : undefined}>
                <td><Link to="/sales/$id" params={{ id: String(r.id) }} className="font-medium text-accent hover:underline">{r.invoiceNo}</Link><div className="text-[11px] text-text-2">{r.kind.replace(/_/g, ' ').toLowerCase()}</div></td>
                <td><div>{formatDateIN(r.date)}</div><div className="text-[11px] text-text-2">{formatDateTimeIN(r.createdAt).split(', ')[1]}</div></td>
                <td><div>{r.customerName ?? <span className="text-text-3">Walk-in</span>}{r.customerPhone && <span className="ml-1 text-xs text-text-2">{r.customerPhone}</span>}</div>{r.patientName && <div className="text-xs text-text-2">Patient: {r.patientName}</div>}</td>
                <td>{r.lineCount} <ScheduleBadge schedule={r.strictestSchedule} /></td>
                <td className="num"><Money paise={r.totalPaise} />{r.returnedPaise > 0 && <div className="text-[11px] text-warning">Returned {(r.returnedPaise / 100).toFixed(2)}</div>}</td>
                <td className="num">{r.creditPaise > 0 ? <Money paise={r.creditPaise} className="text-warning" /> : <span className="text-text-3">—</span>}</td>
                <td>{r.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Posted</Badge>}</td>
                <td className="text-text-2">{r.createdByName}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {query.data && <div className="mt-3 flex justify-end"><Pagination page={page} pageSize={50} total={query.data.total} onPage={(p) => nav({ to: '/sales', search: (s) => ({ ...s, page: p }) })} /></div>}
    </div>
  );
}
