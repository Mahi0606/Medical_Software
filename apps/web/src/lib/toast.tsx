import * as Toast from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from './utils';

type Tone = 'success' | 'info' | 'warning' | 'danger';
interface ToastItem { id: number; title: string; description?: string; tone: Tone; sticky?: boolean }
interface ToastCtx { toast: (t: Omit<ToastItem, 'id'>) => void; success: (title: string, description?: string) => void; error: (title: string, description?: string) => void; warn: (title: string, description?: string) => void; info: (title: string, description?: string) => void }

const Ctx = createContext<ToastCtx | null>(null);
const icons: Record<Tone, ReactNode> = { success: <CheckCircle2 className="h-5 w-5" aria-hidden />, info: <Info className="h-5 w-5" aria-hidden />, warning: <AlertTriangle className="h-5 w-5" aria-hidden />, danger: <XCircle className="h-5 w-5" aria-hidden /> };
const toneCls: Record<Tone, string> = { success: 'border-success-border bg-success-bg text-success', info: 'border-accent-border bg-accent-bg text-accent', warning: 'border-warning-border bg-warning-bg text-warning', danger: 'border-danger-border bg-danger-bg text-danger' };
const label: Record<Tone, string> = { success: 'Done', info: 'Note', warning: 'Warning', danger: 'Error' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((t: Omit<ToastItem, 'id'>) => setItems((l) => [...l.slice(-4), { ...t, id: Date.now() + Math.random() }]), []);
  const value = useMemo<ToastCtx>(() => ({
    toast,
    success: (title, description) => toast({ title, description, tone: 'success' }),
    error: (title, description) => toast({ title, description, tone: 'danger', sticky: true }),
    warn: (title, description) => toast({ title, description, tone: 'warning', sticky: true }),
    info: (title, description) => toast({ title, description, tone: 'info' }),
  }), [toast]);
  return (
    <Ctx.Provider value={value}>
      <Toast.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((t) => (
          <Toast.Root key={t.id} duration={t.sticky ? Infinity : 5000} onOpenChange={(o) => { if (!o) setItems((l) => l.filter((x) => x.id !== t.id)); }}
            className={cn('card flex items-start gap-3 border p-3 pr-2 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out', toneCls[t.tone])}>
            <span className="mt-0.5 shrink-0">{icons[t.tone]}</span>
            <div className="min-w-0 flex-1 text-text" role={t.tone === 'danger' || t.tone === 'warning' ? 'alert' : 'status'}>
              <Toast.Title className="text-sm font-semibold"><span className="sr-only">{label[t.tone]}: </span>{t.title}</Toast.Title>
              {t.description && <Toast.Description className="mt-0.5 text-sm text-text-2">{t.description}</Toast.Description>}
            </div>
            <Toast.Close aria-label="Dismiss" className="rounded p-1 text-text-2 hover:bg-surface-2"><X className="h-4 w-4" /></Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed bottom-4 right-4 z-[100] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </Toast.Provider>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside ToastProvider');
  return c;
}
