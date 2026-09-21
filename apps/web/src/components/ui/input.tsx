import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const base = 'w-full rounded-md border border-border-strong/80 bg-surface px-3 text-text placeholder:text-text-3 disabled:bg-surface-2 disabled:text-text-3 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> { invalid?: boolean; dense?: boolean; addonEnd?: ReactNode; addonStart?: ReactNode }
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, dense, addonEnd, addonStart, ...rest }, ref) {
  const el = <input ref={ref} aria-invalid={invalid || undefined} className={cn(base, dense ? 'h-9 text-sm' : 'h-11 text-base', addonStart && 'pl-8', addonEnd && 'pr-10', className)} {...rest} />;
  if (!addonEnd && !addonStart) return el;
  return (
    <div className="relative">
      {addonStart && <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-text-2">{addonStart}</span>}
      {el}
      {addonEnd && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-text-2">{addonEnd}</span>}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { invalid?: boolean }
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(base, 'min-h-[88px] py-2 text-base', className)} {...rest} />;
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { invalid?: boolean; dense?: boolean }
export const NativeSelect = forwardRef<HTMLSelectElement, SelectProps>(function NativeSelect({ className, invalid, dense, children, ...rest }, ref) {
  return <select ref={ref} aria-invalid={invalid || undefined} className={cn(base, dense ? 'h-9 text-sm' : 'h-11 text-base', 'pr-8', className)} {...rest}>{children}</select>;
});

export interface FieldProps { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactNode | ((id: string, describedBy: string | undefined) => ReactNode); className?: string; inline?: boolean }
/** Label above the control, hint below, error below hint (WCAG 3.3.1 / 3.3.2). */
export function Field({ label, htmlFor, hint, error, required, children, className, inline }: FieldProps) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1', inline && 'sm:flex-row sm:items-center sm:gap-3', className)}>
      <label htmlFor={id} className={cn('text-sm font-medium text-text', inline && 'sm:w-44 sm:shrink-0')}>
        {label}{required && <span className="ml-0.5 text-danger" aria-hidden> *</span>}
      </label>
      <div className="min-w-0 flex-1">
        {typeof children === 'function' ? children(id, describedBy) : children}
        {hint && <p id={hintId} className="mt-1 text-xs text-text-2">{hint}</p>}
        {error && <p id={errId} role="alert" className="mt-1 text-sm font-medium text-danger">{error}</p>}
      </div>
    </div>
  );
}

/** Rupee input: shows rupees, stores paise. */
export const MoneyInput = forwardRef<HTMLInputElement, Omit<InputProps, 'value' | 'onChange'> & { valuePaise: number; onChangePaise: (p: number) => void }>(function MoneyInput({ valuePaise, onChangePaise, className, ...rest }, ref) {
  return <Input ref={ref} type="number" inputMode="decimal" step="0.01" min={0} addonStart="₹" className={cn('num', className)} value={valuePaise === 0 && rest.placeholder ? '' : (valuePaise / 100).toString()} onChange={(e) => onChangePaise(Math.round(Number(e.target.value || 0) * 100))} {...rest} />;
});
