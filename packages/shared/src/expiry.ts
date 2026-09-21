import { daysBetween } from './dates.js';

export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'watch' | 'ok';

export const EXPIRY_THRESHOLDS = { critical: 30, warning: 90, watch: 180 } as const;

/** Status of a batch relative to today. A batch is sellable through its expiry date. */
export function expiryStatus(expiryIso: string, todayIso: string): ExpiryStatus {
  const d = daysBetween(todayIso, expiryIso);
  if (d < 0) return 'expired';
  if (d <= EXPIRY_THRESHOLDS.critical) return 'critical';
  if (d <= EXPIRY_THRESHOLDS.warning) return 'warning';
  if (d <= EXPIRY_THRESHOLDS.watch) return 'watch';
  return 'ok';
}

export function isExpired(expiryIso: string, todayIso: string): boolean {
  return daysBetween(todayIso, expiryIso) < 0;
}

export function expiryLabel(expiryIso: string, todayIso: string): string {
  const d = daysBetween(todayIso, expiryIso);
  if (d < 0) return 'Expired';
  if (d === 0) return 'Expires today';
  if (d <= EXPIRY_THRESHOLDS.warning) return `Exp in ${d} d`;
  return '';
}

export interface FefoBatch {
  expiryDate: string;
  qtyUnits: number;
  createdAt?: string;
}

/**
 * First-Expiry-First-Out ordering: soonest expiry first, then oldest receipt.
 * Expired and empty batches are excluded when `sellableOnly` is true.
 */
export function sortFefo<T extends FefoBatch>(batches: T[], todayIso: string, sellableOnly = true): T[] {
  return batches
    .filter((b) => !sellableOnly || (b.qtyUnits > 0 && !isExpired(b.expiryDate, todayIso)))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
}
