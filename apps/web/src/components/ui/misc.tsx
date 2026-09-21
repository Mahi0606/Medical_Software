import * as TooltipP from '@radix-ui/react-tooltip';
import * as SwitchP from '@radix-ui/react-switch';
import * as TabsP from '@radix-ui/react-tabs';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, XCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
const badgeTone: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-text-2 border-border', accent: 'bg-accent-bg text-accent border-accent-border', success: 'bg-success-bg text-success border-success-border', warning: 'bg-warning-bg text-warning border-warning-border', danger: 'bg-danger-bg text-danger border-danger-border',
};
export function Badge({ tone = 'neutral', children, className, icon: Icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: LucideIcon }) {
  return <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium leading-4', badgeTone[tone], className)}>{Icon && <Icon className="h-3 w-3" aria-hidden />}{children}</span>;
}

const calloutIcon: Record<Exclude<Tone, 'neutral'>, LucideIcon> = { accent: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
export function Callout({ tone = 'accent', title, children, className, actions }: { tone?: Exclude<Tone, 'neutral'>; title?: ReactNode; children?: ReactNode; className?: string; actions?: ReactNode }) {
  const Icon = calloutIcon[tone];
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-md border p-3 text-sm', badgeTone[tone], className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-text">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-text-2')}>{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-text-2', className)}><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{label}</span>;
}

export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon && <Icon className="h-8 w-8 text-text-3" aria-hidden />}
      <p className="font-medium text-text">{title}</p>
      {children && <p className="max-w-md text-sm text-text-2">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) { return <kbd className="kbd">{children}</kbd>; }

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipP.Root delayDuration={300}>
      <TooltipP.Trigger asChild>{children}</TooltipP.Trigger>
      <TooltipP.Portal><TooltipP.Content side={side} sideOffset={6} className="z-[90] max-w-xs rounded bg-text px-2 py-1 text-xs text-white shadow-lg">{content}<TooltipP.Arrow className="fill-text" /></TooltipP.Content></TooltipP.Portal>
    </TooltipP.Root>
  );
}
export const TooltipProvider = TooltipP.Provider;

export function Switch({ checked, onCheckedChange, id, disabled, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; disabled?: boolean; label?: string }) {
  return (
    <SwitchP.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label}
      className="relative h-7 w-12 shrink-0 rounded-full border border-border-strong/60 bg-surface-2 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-50">
      <SwitchP.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchP.Root>
  );
}

export const Tabs = TabsP.Root;
export function TabsList({ children, className }: { children: ReactNode; className?: string }) { return <TabsP.List className={cn('flex flex-wrap gap-1 border-b border-border', className)}>{children}</TabsP.List>; }
export function TabsTrigger({ value, children, count }: { value: string; children: ReactNode; count?: number }) {
  return <TabsP.Trigger value={value} className="-mb-px inline-flex h-11 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-text-2 hover:text-text data-[state=active]:border-accent data-[state=active]:text-accent">{children}{count !== undefined && <span className="rounded bg-surface-2 px-1.5 text-xs text-text-2">{count}</span>}</TabsP.Trigger>;
}
export const TabsContent = TabsP.Content;

export function Stat({ label, value, sub, tone = 'neutral', icon: Icon, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: LucideIcon; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('card flex min-h-[96px] flex-col justify-between p-4 text-left', onClick && 'hover:border-accent-border focus-visible:outline-2')}>
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-text-2">{label}</span>{Icon && <Icon className={cn('h-4 w-4', tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-text-3')} aria-hidden />}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning', tone === 'success' && 'text-success')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-text-2">{sub}</div>}
    </Comp>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="text-xs text-text-2">{total} {total === 1 ? 'record' : 'records'}</p>;
  return (
    <nav aria-label="Pagination" className="flex items-center gap-2 text-sm">
      <span className="text-text-2">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
      <button className="inline-flex h-9 w-9 items-center justify-center rounded border border-border bg-surface hover:bg-surface-2 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
      <span aria-current="page" className="tabular-nums">Page {page} / {pages}</span>
      <button className="inline-flex h-9 w-9 items-center justify-center rounded border border-border bg-surface hover:bg-surface-2 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
    </nav>
  );
}

export function PageHeader({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div><h1>{title}</h1>{description && <p className="mt-0.5 text-sm text-text-2">{description}</p>}{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Money({ paise, className, signed }: { paise: number | null | undefined; className?: string; signed?: boolean }) {
  if (paise === null || paise === undefined) return <span className={cn('num', className)}>—</span>;
  const s = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Math.abs(paise) / 100);
  return <span className={cn('num tabular-nums', paise < 0 && 'text-danger', className)}>{paise < 0 ? '−' : signed && paise > 0 ? '+' : ''}{s}</span>;
}

export function ExpiryBadge({ expiryDate, today }: { expiryDate: string; today: string }) {
  const d = Math.round((Date.UTC(+expiryDate.slice(0, 4), +expiryDate.slice(5, 7) - 1, +expiryDate.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86400000);
  const mmYY = `${expiryDate.slice(5, 7)}/${expiryDate.slice(2, 4)}`;
  if (d < 0) return <Badge tone="danger" icon={XCircle}>Expired {mmYY}</Badge>;
  if (d <= 30) return <Badge tone="danger" icon={AlertTriangle}>Exp {mmYY} · {d} d</Badge>;
  if (d <= 90) return <Badge tone="warning" icon={AlertTriangle}>Exp {mmYY} · {d} d</Badge>;
  return <Badge tone="neutral">Exp {mmYY}</Badge>;
}

export function ScheduleBadge({ schedule }: { schedule: string }) {
  if (!schedule || schedule === 'NONE') return null;
  const tone: Tone = schedule === 'X' ? 'danger' : schedule === 'H1' ? 'warning' : 'accent';
  return <Badge tone={tone} className="font-semibold">Sch {schedule}</Badge>;
}
