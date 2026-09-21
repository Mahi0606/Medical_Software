import { z } from 'zod';
import { id, isoDate, nonEmpty, optionalText, paginationQuery, paise } from './common.js';

// ---------- Purchase orders / reorder ----------
export const poLineSchema = z.object({
  itemId: id,
  qtyPacks: z.coerce.number().int().min(1),
  ratePaise: paise.nullable().optional(),
  mrpPaise: paise.nullable().optional(),
  note: optionalText,
});
export const purchaseOrderSchema = z.object({
  supplierId: id,
  date: isoDate,
  expectedDate: isoDate.nullable().optional(),
  notes: optionalText,
  lines: z.array(poLineSchema).min(1, 'Add at least one line'),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export const poListQuery = paginationQuery.extend({ supplierId: z.coerce.number().int().optional(), status: z.enum(['draft', 'sent', 'partially_received', 'received', 'cancelled']).optional() });
export const poMarkSentSchema = z.object({ via: z.enum(['whatsapp', 'email', 'print', 'phone', 'other']).default('whatsapp') });
export const reorderQuery = z.object({
  /** Days of cover to order for. */
  coverDays: z.coerce.number().int().min(7).max(180).default(30),
  /** Sales history window used for velocity. */
  windowDays: z.coerce.number().int().min(14).max(365).default(90),
  supplierId: z.coerce.number().int().optional(),
  onlyBelowMin: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});

// ---------- Messaging (WhatsApp Cloud API / SMS) ----------
export const messagingSettingsSchema = z.object({
  provider: z.enum(['none', 'meta_cloud']).default('none'),
  phoneNumberId: optionalText,
  accessToken: optionalText,
  businessName: optionalText,
  /** Auto-queue a bill message after every posted sale that has a phone number. */
  autoSendBills: z.boolean().default(false),
  /** Days before refill due date to send the reminder. */
  refillLeadDays: z.coerce.number().int().min(0).max(14).default(2),
  duesReminderTemplate: optionalText,
  billTemplate: optionalText,
  refillTemplate: optionalText,
});
export type MessagingSettings = z.infer<typeof messagingSettingsSchema>;
export const sendMessageSchema = z.object({
  toPhone: z.string().trim().regex(/^\d{10,15}$/, 'Enter a 10-digit mobile number'),
  templateKey: z.enum(['bill', 'dues', 'refill', 'po', 'custom']),
  body: nonEmpty.max(2000),
  customerId: id.nullable().optional(),
  relatedType: optionalText,
  relatedId: id.nullable().optional(),
  scheduledFor: z.string().nullable().optional(),
});
export const outboxQuery = paginationQuery.extend({ status: z.enum(['queued', 'sent', 'failed', 'skipped', 'manual']).optional(), templateKey: z.string().optional() });
export const refillsQuery = z.object({ withinDays: z.coerce.number().int().min(0).max(60).default(7), includeOverdue: z.preprocess((v) => v !== 'false' && v !== false, z.boolean()).default(true) });

// ---------- Drug interactions ----------
export const interactionRuleSchema = z.object({
  saltA: nonEmpty.max(120),
  saltB: nonEmpty.max(120),
  severity: z.enum(['major', 'moderate', 'minor']),
  message: nonEmpty.max(400),
  advice: optionalText,
  source: optionalText,
  active: z.boolean().default(true),
});
export type InteractionRuleInput = z.infer<typeof interactionRuleSchema>;
export const interactionCheckSchema = z.object({
  itemIds: z.array(id).min(1),
  customerId: id.nullable().optional(),
  /** Look back this many days in the customer's purchase history. */
  historyDays: z.coerce.number().int().min(0).max(180).default(30),
});

// ---------- Offline sync ----------
export const offlineSaleMeta = z.object({
  /** Client-assigned invoice number in the counter's own series, e.g. INV-C1/2026-27/00012. */
  invoiceNo: z.string().trim().min(6).max(40),
  postedAt: z.string().datetime(),
  counter: z.string().trim().min(1).max(10),
});
export type OfflineSaleMeta = z.infer<typeof offlineSaleMeta>;

// ---------- Exports ----------
export const exportRangeQuery = z.object({ from: isoDate, to: isoDate });
