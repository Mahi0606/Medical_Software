import type { MessagingSettings } from '@pharma/shared';
import { Badge, type Tone } from '@/components/ui';

export type OutboxStatus = 'queued' | 'sent' | 'failed' | 'skipped' | 'manual';
export type TemplateKey = 'bill' | 'dues' | 'refill' | 'po' | 'custom';

export interface OutboxRow {
  id: number; channel: string; toPhone: string; templateKey: string; body: string; status: OutboxStatus; providerMessageId: string | null; error: string | null;
  relatedType: string | null; relatedId: number | null; customerId: number | null; scheduledFor: string | null; attempts: number; createdAt: string; sentAt: string | null; customerName: string | null; waLink: string;
}
export interface OutboxPage { rows: OutboxRow[]; total: number; page: number; pageSize: number }
export interface MessagingStatus { provider: 'none' | 'meta_cloud'; configured: boolean; queued: number; failed: number; manual: number; lastSentAt: string | null }
export interface RefillRow {
  saleId: number; invoiceNo: string | null; date: string; refillDays: number | null; refillDueDate: string; customerId: number | null; customerName: string | null; customerPhone: string | null;
  consentMarketing: boolean; patientName: string | null; items: string | null; daysLeft: number; reminderQueued: boolean; reminderSent: boolean;
}
export interface DuesRow { id: number; name: string; phone: string; consentMarketing: boolean; balancePaise: number; lastReminderAt: string | null; lastDate: string | null; waLink: string }
export type PublicSettings = MessagingSettings & { configured: boolean; defaults: { bill: string; dues: string; refill: string }; placeholders: readonly string[] };

export const TEMPLATE_LABELS: Record<string, string> = { bill: 'Bill copy', dues: 'Dues reminder', refill: 'Refill reminder', po: 'Purchase order', custom: 'Custom' };
const templateTone: Record<string, Tone> = { bill: 'accent', dues: 'warning', refill: 'success', po: 'neutral', custom: 'neutral' };
export function TemplateBadge({ templateKey }: { templateKey: string }) {
  return <Badge tone={templateTone[templateKey] ?? 'neutral'}>{TEMPLATE_LABELS[templateKey] ?? templateKey}</Badge>;
}

const statusMeta: Record<OutboxStatus, { tone: Tone; label: string }> = {
  queued: { tone: 'accent', label: 'Queued' }, sent: { tone: 'success', label: 'Sent' }, failed: { tone: 'danger', label: 'Failed' }, skipped: { tone: 'neutral', label: 'Cancelled' }, manual: { tone: 'warning', label: 'To send' },
};
export function StatusBadge({ status }: { status: OutboxStatus }) {
  const m = statusMeta[status] ?? { tone: 'neutral' as Tone, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function waLinkFor(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}?text=${encodeURIComponent(text)}`;
}

export function openWa(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer');
}
