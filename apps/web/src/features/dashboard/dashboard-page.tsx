import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowRight, BadgeIndianRupee, Boxes, CalendarClock, HandCoins, ShieldAlert, ShoppingCart, Truck, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTimeIN, rupees } from '@/lib/utils';
import { Badge, Button, Callout, Money, PageHeader, Spinner, Stat } from '@/components/ui';

interface Dash {
  today: string; sales: { n: number; total: number; credit: number; returned: number }; byMode: { mode: string; total: number }[]; cashIn: number; lowStock: number; outOfStock: number;
  nearExpiry: { n: number; valueCost: number; valueMrp: number }; nearExpiryDays: number; expired: { n: number; valueCost: number }; customerDues: number; supplierDues: number;
  licenceDue: { id: number; type: string; number: string; retentionFeeDue: string | null; validTill: string | null }[]; duty: { name: string }[];
  recentSales: { id: number; invoiceNo: string; customerName: string | null; totalPaise: number; createdAt: string; status: string }[]; lastBackup: { at: string } | null;
  last7: { date: string; total: number; n: number }[]; topToday: { itemName: string; qtyUnits: number; net: number }[]; setupComplete: boolean;
}

export function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dash>('/dashboard'), refetchInterval: 60_000 });
  const { user, can } = useAuth();
  const nav = useNavigate();
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Callout tone="danger" title="Could not load the dashboard">{q.error?.message}</Callout>;
  const d = q.data;
  const max = Math.max(1, ...d.last7.map((x) => x.total));
  return (
    <div className="space-y-5">
      <PageHeader title={`Good ${greeting()}, ${user?.name.split(' ')[0]}`} description={`Today, ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        actions={<><Button variant="primary" icon={<ShoppingCart className="h-4 w-4" />} kbd="Alt+N" onClick={() => nav({ to: '/billing' })}>New bill</Button>{can('purchase.create') && <Button icon={<Truck className="h-4 w-4" />} onClick={() => nav({ to: '/purchases/new' })}>Receive stock</Button>}</>} />

      {!d.setupComplete && can('settings.write') && <Callout tone="warning" title="Finish setting up the store" actions={<Button size="sm" onClick={() => nav({ to: '/settings' })}>Open settings</Button>}>Add the store address, GSTIN, drug licence numbers and the registered pharmacist so bills and registers print correctly.</Callout>}
      {d.duty.length === 0 && <Callout tone="warning" title="No pharmacist on duty">Schedule H, H1 and X medicines cannot be billed until a registered pharmacist marks themselves on duty (top right).</Callout>}
      {d.expired.n > 0 && <Callout tone="danger" title={`${d.expired.n} expired ${d.expired.n === 1 ? 'batch is' : 'batches are'} still in stock`} actions={<Button size="sm" variant="danger" onClick={() => nav({ to: '/inventory', search: { view: 'expired' } })}>Segregate now</Button>}>Expired stock cannot be sold (Rule 65(17)). Move it to quarantine and return it to the supplier. Value at cost: {rupees(d.expired.valueCost)}.</Callout>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Today's sales" value={rupees(d.sales.total)} sub={`${d.sales.n} bills · ${rupees(d.sales.credit)} on credit`} icon={BadgeIndianRupee} onClick={() => nav({ to: '/sales' })} />
        <Stat label="Cash in drawer (approx.)" value={rupees(d.cashIn)} sub={d.byMode.filter((m) => m.mode !== 'cash').map((m) => `${m.mode.toUpperCase()} ${rupees(m.total)}`).join(' · ') || 'No card/UPI yet'} icon={Wallet} />
        <Stat label={`Expiring in ${d.nearExpiryDays} days`} value={d.nearExpiry.n} sub={`${rupees(d.nearExpiry.valueCost)} at cost`} tone={d.nearExpiry.n ? 'warning' : 'neutral'} icon={CalendarClock} onClick={() => nav({ to: '/inventory', search: { view: 'expiring' } })} />
        <Stat label="Low or out of stock" value={d.lowStock + d.outOfStock} sub={`${d.lowStock} below minimum · ${d.outOfStock} out`} tone={d.lowStock + d.outOfStock ? 'warning' : 'neutral'} icon={Boxes} onClick={() => nav({ to: '/reports', search: { report: 'stock' } })} />
        <Stat label="Customer dues" value={rupees(d.customerDues)} icon={HandCoins} onClick={() => nav({ to: '/customers', search: { status: 'dues' } })} />
        <Stat label="Payable to suppliers" value={rupees(d.supplierDues)} icon={Truck} onClick={() => nav({ to: '/suppliers' })} />
        <Stat label="Licences due in 90 days" value={d.licenceDue.length} sub={d.licenceDue.map((l) => l.type.replace('_', ' ')).join(', ') || 'All current'} tone={d.licenceDue.length ? 'warning' : 'success'} icon={ShieldAlert} onClick={() => nav({ to: '/settings', search: { tab: 'licences' } })} />
        <Stat label="Last backup" value={d.lastBackup ? formatDateTimeIN(d.lastBackup.at).split(',')[0] : 'Never'} sub={d.lastBackup ? formatDateTimeIN(d.lastBackup.at) : 'Runs nightly at 02:00'} tone={d.lastBackup ? 'neutral' : 'warning'} icon={AlertTriangle} onClick={can('backup.run') ? () => nav({ to: '/settings', search: { tab: 'backup' } }) : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2" aria-labelledby="h-week">
          <h2 id="h-week" className="text-base">Last 7 days</h2>
          <div className="mt-3 flex h-40 items-end gap-2" role="img" aria-label={`Daily sales: ${d.last7.map((x) => `${x.date} ${rupees(x.total)}`).join(', ')}`}>
            {Array.from({ length: 7 }).map((_, i) => {
              const date = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
              const x = d.last7.find((r) => r.date === date);
              const h = x ? Math.max(4, (x.total / max) * 100) : 2;
              return <div key={date} className="flex h-full flex-1 flex-col items-center"><span className="text-[11px] text-text-2">{x ? rupees(x.total).replace('.00', '') : ''}</span><div className="flex w-full flex-1 items-end"><div className="w-full rounded-t bg-accent/80" style={{ height: `${h}%` }} title={`${date}: ${rupees(x?.total ?? 0)}`} /></div><span className="mt-1 text-[11px] text-text-2">{new Date(date).toLocaleDateString('en-IN', { weekday: 'short' })}</span></div>;
            })}
          </div>
        </section>
        <section className="card p-4" aria-labelledby="h-top">
          <h2 id="h-top" className="text-base">Top sellers today</h2>
          {d.topToday.length === 0 ? <p className="mt-3 text-sm text-text-2">No sales yet today.</p> : (
            <ol className="mt-3 space-y-2 text-sm">{d.topToday.map((t) => <li key={t.itemName} className="flex items-center justify-between gap-2"><span className="truncate">{t.itemName}</span><span className="flex shrink-0 items-center gap-3 text-text-2"><span>{t.qtyUnits} units</span><Money paise={t.net} /></span></li>)}</ol>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="h-recent">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 id="h-recent" className="text-base">Recent bills</h2><Link to="/sales" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">All bills <ArrowRight className="h-4 w-4" /></Link></div>
        <table className="tbl">
          <thead><tr><th>Bill</th><th>Customer</th><th>Time</th><th className="num">Amount</th><th>Status</th></tr></thead>
          <tbody>{d.recentSales.map((s) => <tr key={s.id}><td><Link to="/sales/$id" params={{ id: String(s.id) }} className="font-medium text-accent hover:underline">{s.invoiceNo}</Link></td><td>{s.customerName ?? <span className="text-text-3">Walk-in</span>}</td><td className="text-text-2">{formatDateTimeIN(s.createdAt)}</td><td className="num"><Money paise={s.totalPaise} /></td><td>{s.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Posted</Badge>}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}

function greeting() { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
