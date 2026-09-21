import { clsx, type ClassValue } from 'clsx';
export { formatINR, formatINRCompact, formatIntIN, formatDateIN, formatDateTimeIN, formatExpiry, todayIST, daysBetween, expiryStatus, expiryLabel, formatStock, tallMan } from '@pharma/shared';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function rupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);
}

export function toPaiseInput(v: string | number): number {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromPaiseInput(paise: number | null | undefined): string {
  return paise === null || paise === undefined ? '' : (paise / 100).toFixed(2);
}

export function newClientRef(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  return `${Date.now().toString(36)}-${Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function debounce<T extends (...a: never[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
