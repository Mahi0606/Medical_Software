import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface DialogProps { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; role?: 'dialog' | 'alertdialog'; className?: string }
const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/** Centered modal. Use only for hard stops and irreversible confirmations; prefer Sheet for editing. */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', role = 'dialog', className }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[80] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <D.Content role={role} className={cn('card fixed left-1/2 top-1/2 z-[81] flex max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col shadow-lg outline-none', sizes[size], className)}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div><D.Title className="text-lg font-semibold">{title}</D.Title>{description && <D.Description className="mt-0.5 text-sm text-text-2">{description}</D.Description>}</div>
            <D.Close asChild><Button variant="ghost" size="icon" aria-label="Close" className="-mr-2 -mt-1 h-9 w-9"><X className="h-4 w-4" /></Button></D.Close>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Side panel for editing and details, so the underlying page stays visible. */
export function Sheet({ open, onOpenChange, title, description, children, footer, width = 'md', className }: Omit<DialogProps, 'size' | 'role'> & { width?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' }[width];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[80] bg-black/30" />
        <D.Content className={cn('fixed inset-y-0 right-0 z-[81] flex w-full flex-col border-l border-border bg-surface shadow-lg outline-none', w, className)}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div><D.Title className="text-lg font-semibold">{title}</D.Title>{description && <D.Description className="mt-0.5 text-sm text-text-2">{description}</D.Description>}</div>
            <D.Close asChild><Button variant="ghost" size="icon" aria-label="Close" className="-mr-2 -mt-1 h-9 w-9"><X className="h-4 w-4" /></Button></D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, children, confirmLabel = 'Confirm', tone = 'danger', onConfirm, loading, requireReason, reason, onReason }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children?: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary'; onConfirm: () => void; loading?: boolean; requireReason?: boolean; reason?: string; onReason?: (r: string) => void }) {
  const disabled = requireReason && !(reason ?? '').trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} role="alertdialog" size="sm"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant={tone} onClick={onConfirm} loading={loading} disabled={disabled}>{confirmLabel}</Button></>}>
      <div className="space-y-3 text-sm text-text-2">
        {children}
        {requireReason && (
          <label className="block text-sm font-medium text-text">Reason (recorded in the audit log)
            <textarea className="mt-1 min-h-[72px] w-full rounded-md border border-border-strong/80 bg-surface px-3 py-2 text-base text-text" value={reason ?? ''} onChange={(e) => onReason?.(e.target.value)} autoFocus />
          </label>
        )}
      </div>
    </Dialog>
  );
}
