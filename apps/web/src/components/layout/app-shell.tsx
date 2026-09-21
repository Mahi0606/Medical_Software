import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, BookOpenCheck, Boxes, ClipboardList, ClipboardPlus, CloudUpload, Contact, FileOutput, FileText, LayoutDashboard, LogOut, Menu, MessageSquare, Moon, Package, PanelLeftClose, PanelLeftOpen, Pill, Printer, ReceiptText, Settings, ShieldAlert, ShieldCheck, ShoppingCart, Sun, Truck, UserRound, Users, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Permission } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { applyTheme, getTheme, type Theme } from '@/lib/theme';
import { startOfflineEngine, useSyncStatus } from '@/lib/offline';
import { cn } from '@/lib/utils';
import { Badge, Button, Dialog, NativeSelect, Tooltip } from '@/components/ui';

interface NavItem { to: string; label: string; icon: typeof Pill; perm?: Permission; kbd?: string }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Counter', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/billing', label: 'Billing', icon: ShoppingCart, kbd: 'Alt+N' },
    { to: '/sales', label: 'Bills & returns', icon: ReceiptText },
    { to: '/customers', label: 'Customers', icon: Users },
    { to: '/messages', label: 'Messages & reminders', icon: MessageSquare, perm: 'party.write' },
  ] },
  { group: 'Stock', items: [
    { to: '/items', label: 'Items', icon: Pill },
    { to: '/inventory', label: 'Batches & expiry', icon: Boxes },
    { to: '/purchases', label: 'Purchases', icon: Package, perm: 'purchase.create' },
    { to: '/purchase-orders', label: 'Reorder & POs', icon: ClipboardPlus, perm: 'purchase.create' },
    { to: '/suppliers', label: 'Suppliers', icon: Truck },
    { to: '/labels', label: 'Labels', icon: Printer, perm: 'label.print' },
  ] },
  { group: 'Compliance', items: [
    { to: '/registers', label: 'Schedule registers', icon: BookOpenCheck, perm: 'register.view' },
    { to: '/doctors', label: 'Prescribers', icon: Contact },
    { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'report.view' },
    { to: '/interactions', label: 'Drug interactions', icon: ShieldAlert, perm: 'register.view' },
    { to: '/exports', label: 'GST & Tally exports', icon: FileOutput, perm: 'report.finance' },
    { to: '/audit', label: 'Audit log', icon: ShieldCheck, perm: 'audit.view' },
  ] },
  { group: 'Setup', items: [{ to: '/sync', label: 'Offline & sync', icon: CloudUpload }, { to: '/settings', label: 'Settings', icon: Settings }] },
];

const NAV_KEY = 'pms-nav-collapsed';

export function AppShell() {
  const { user, store, duty, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [navPref, setNavPref] = useState<boolean | null>(() => { try { const v = localStorage.getItem(NAV_KEY); return v === null ? null : v === '1'; } catch { return null; } });
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [online, setOnline] = useState(navigator.onLine);
  const sync = useSyncStatus();
  useEffect(() => { startOfflineEngine(); }, []);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => { setOpen(false); }, [path]);
  // Collapsed by default on Billing so the counter gets the whole screen; the user's own choice wins once made.
  const collapsed = navPref ?? path.startsWith('/billing');
  const toggleNav = () => { const next = !collapsed; setNavPref(next); try { localStorage.setItem(NAV_KEY, next ? '1' : '0'); } catch { /* ignore */ } };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleNav(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const renderNav = (compact: boolean) => (
    <nav aria-label="Main" className={cn('flex flex-1 flex-col overflow-y-auto py-3', compact ? 'gap-2 px-2' : 'gap-4 px-3')}>
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.perm || can(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            {compact ? <div className="mx-2 mb-1 border-t border-border first:hidden" aria-hidden /> : <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-3">{g.group}</p>}
            <ul className="space-y-0.5">
              {items.map((i) => {
                const active = i.to === '/' ? path === '/' : path.startsWith(i.to);
                const link = (
                  <Link to={i.to} aria-current={active ? 'page' : undefined} aria-label={compact ? i.label : undefined} className={cn('flex h-11 items-center gap-2.5 rounded-md text-sm font-medium text-text-2 hover:bg-surface-2 hover:text-text', compact ? 'w-11 justify-center px-0' : 'px-2', active && 'bg-accent-bg text-accent hover:bg-accent-bg hover:text-accent')}>
                    <i.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />{!compact && <><span className="flex-1 truncate">{i.label}</span>{i.kbd && <span className="kbd" aria-hidden>{i.kbd}</span>}</>}
                  </Link>
                );
                return <li key={i.to}>{compact ? <Tooltip content={i.kbd ? `${i.label} (${i.kbd})` : i.label} side="right">{link}</Tooltip> : link}</li>;
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
  const nav = renderNav(false);

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-white">Skip to main content</a>
      <aside id="main-sidebar" aria-label="Sidebar" className={cn('no-print hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150 lg:flex', collapsed ? 'w-[60px]' : 'w-60')}>
        <div className={cn('flex h-14 items-center gap-2 border-b border-border', collapsed ? 'justify-center px-0' : 'px-4')}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white"><Pill className="h-4 w-4" aria-hidden /></span>{!collapsed && <span className="truncate font-semibold">{store?.name || 'DawaDesk'}</span>}</div>
        {renderNav(collapsed)}
        {!collapsed && <div className="border-t border-border p-3 text-xs text-text-2">DawaDesk v0.1</div>}
      </aside>
      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-lg">
            <div className="flex h-14 items-center justify-between border-b border-border px-4"><span className="font-semibold">{store?.name}</span><Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button></div>
            {nav}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-[60] flex h-14 items-center gap-2 border-b border-border bg-surface px-3 md:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></Button>
          <Tooltip content={collapsed ? 'Show menu labels (Ctrl+B)' : 'Collapse menu (Ctrl+B)'} side="bottom">
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed} aria-controls="main-sidebar" onClick={toggleNav}>{collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}</Button>
          </Tooltip>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1.5">
            {(!online || sync.mode === 'offline') && <Badge tone="warning" icon={WifiOff}>Offline – bills saved on this device</Badge>}
            {sync.pending + sync.failed > 0 && <Link to="/sync" className="inline-flex"><Badge tone={sync.failed ? 'danger' : 'accent'} icon={CloudUpload}>{sync.failed ? `${sync.failed} bill${sync.failed === 1 ? '' : 's'} need attention` : `${sync.pending} to sync`}</Badge></Link>}
            <DutyIndicator duty={duty} />
            <Tooltip content={theme === 'light' ? 'Switch to dark mode (night shift)' : 'Switch to light mode'}>
              <Button variant="ghost" size="icon" aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</Button>
            </Tooltip>
            <div className="hidden items-center gap-2 pl-2 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-bg text-accent"><UserRound className="h-4 w-4" aria-hidden /></span>
              <div className="leading-tight"><p className="text-sm font-medium">{user?.name}</p><p className="text-xs capitalize text-text-2">{user?.role}</p></div>
            </div>
            <Tooltip content="Sign out"><Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void logout()}><LogOut className="h-5 w-5" /></Button></Tooltip>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 p-3 md:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function DutyIndicator({ duty }: { duty: { userId: number; name: string; regNo: string | null }[] }) {
  const { can, user, refresh } = useAuth();
  const toast = useToast();
  const [openDlg, setOpenDlg] = useState(false);
  const [pick, setPick] = useState<number | ''>('');
  const pharmacists = useQuery({ queryKey: ['pharmacists'], queryFn: () => api.get<{ id: number; name: string; pharmacistRegNo: string | null }[]>('/users/pharmacists'), enabled: openDlg });
  const mut = useMutation({
    mutationFn: (v: { on: boolean; userId?: number }) => api.post('/auth/duty', v),
    onSuccess: () => { void refresh(); setOpenDlg(false); },
    onError: (e: Error) => toast.error('Could not update duty', e.message),
  });
  const on = duty.length > 0;
  const label = on ? `Pharmacist on duty: ${duty.map((d) => d.name).join(', ')}` : 'No pharmacist on duty. Schedule H, H1 and X sales are blocked.';
  return (
    <>
      <button type="button" onClick={() => can('duty.toggle') && setOpenDlg(true)} aria-label={label} title={label}
        className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium', on ? 'border-success-border bg-success-bg text-success' : 'border-warning-border bg-warning-bg text-warning')}>
        <Activity className="h-4 w-4" aria-hidden /><span className="hidden md:inline">{on ? `RPh: ${duty[0]!.name.split(' ')[0]}${duty.length > 1 ? ` +${duty.length - 1}` : ''}` : 'No pharmacist on duty'}</span>
      </button>
      <Dialog open={openDlg} onOpenChange={setOpenDlg} title="Pharmacist on duty" size="sm" description="Prescription-only medicines (Schedule H, H1, X) can only be sold under the supervision of a registered pharmacist (Drugs Rules, Rule 65(2)). Each Rx bill records who was on duty.">
        <div className="space-y-4">
          {duty.length > 0 ? (
            <ul className="space-y-2">{duty.map((d) => (
              <li key={d.userId} className="flex items-center justify-between rounded border border-border p-2 text-sm"><span><span className="font-medium">{d.name}</span> <span className="text-text-2">{d.regNo}</span></span><Button size="sm" variant="secondary" onClick={() => mut.mutate({ on: false, userId: d.userId })} loading={mut.isPending}>Go off duty</Button></li>
            ))}</ul>
          ) : <p className="text-sm text-text-2">Nobody is on duty right now.</p>}
          {(user?.role === 'pharmacist' || user?.pharmacistRegNo) && !duty.some((d) => d.userId === user.id) && (
            <Button variant="primary" className="w-full" onClick={() => mut.mutate({ on: true })} loading={mut.isPending}>I am on duty ({user.name})</Button>
          )}
          {user?.role === 'owner' && (
            <div className="flex items-end gap-2">
              <label className="flex-1 text-sm font-medium">Mark another pharmacist on duty
                <NativeSelect className="mt-1" value={pick} onChange={(e) => setPick(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Choose…</option>
                  {pharmacists.data?.filter((p) => !duty.some((d) => d.userId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.pharmacistRegNo}</option>)}
                </NativeSelect>
              </label>
              <Button variant="primary" disabled={!pick} onClick={() => pick && mut.mutate({ on: true, userId: pick })} loading={mut.isPending}>Mark on duty</Button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

function GlobalSearch() {
  return (
    <Link to="/items" search={{ q: '' }} className="hidden h-9 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm text-text-2 hover:border-border-strong md:flex md:w-72">
      <ClipboardList className="h-4 w-4" aria-hidden /><span>Find an item, batch or bill</span><span className="kbd ml-auto">/</span>
    </Link>
  );
}

export { FileText };
