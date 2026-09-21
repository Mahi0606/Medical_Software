import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  kbd?: string;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover border border-transparent shadow-sm',
  secondary: 'bg-surface text-text border border-border-strong/70 hover:bg-surface-2',
  outline: 'bg-transparent text-accent border border-accent hover:bg-accent-bg',
  ghost: 'bg-transparent text-text-2 hover:bg-surface-2 hover:text-text border border-transparent',
  danger: 'bg-danger text-white hover:brightness-95 border border-transparent',
  link: 'bg-transparent text-accent underline-offset-4 hover:underline border-0 px-0 h-auto min-h-0',
};
const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
  icon: 'h-11 w-11 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = 'secondary', size = 'md', loading, icon, kbd, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cn('inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55', variants[variant], sizes[size], className)} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
      {kbd && <span className="kbd ml-1 hidden md:inline-flex" aria-hidden>{kbd}</span>}
    </button>
  );
});
