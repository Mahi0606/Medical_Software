import { z } from 'zod';
import { PAYMENT_MODES } from '../constants.js';
import { id, isoDate, nonEmpty, optionalText, paise, optionalPhone } from './common.js';

export const saleLineSchema = z.object({
  batchId: id,
  unitMode: z.enum(['pack', 'unit']),
  qty: z.coerce.number().int().min(1),
  /** Selling price per billed unit, tax-inclusive, paise. Defaults to batch MRP (pack) or loose price. */
  unitPricePaise: paise.optional(),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  /** Reason required when selling below MRP by override or below cost. */
  priceReason: optionalText,
});
export type SaleLineInput = z.infer<typeof saleLineSchema>;

export const salePaymentSchema = z.object({
  mode: z.enum(PAYMENT_MODES),
  amountPaise: paise,
  reference: optionalText,
});

export const rxDetailsSchema = z.object({
  doctorId: id.nullable().optional(),
  doctorName: optionalText,
  doctorRegNo: optionalText,
  patientName: optionalText,
  patientAddress: optionalText,
  patientAge: z.coerce.number().int().min(0).max(130).nullable().optional(),
  prescriptionDate: isoDate.nullable().optional(),
  prescriptionRef: optionalText,
  prescriptionImageId: id.nullable().optional(),
});
export type RxDetailsInput = z.infer<typeof rxDetailsSchema>;

export const saleSchema = z.object({
  customerId: id.nullable().optional(),
  /** Quick capture without creating a customer record. */
  customerName: optionalText,
  customerPhone: optionalPhone,
  customerGstin: optionalText,
  billDiscountPct: z.coerce.number().min(0).max(100).default(0),
  lines: z.array(saleLineSchema).min(1, 'Add at least one item'),
  payments: z.array(salePaymentSchema).default([]),
  rx: rxDetailsSchema.optional(),
  notes: optionalText,
  /** Client-generated id so a retried submit does not double-post. */
  clientRef: z.string().trim().min(8).max(64),
  counter: z.string().trim().max(10).default('C1'),
  /** Present when the bill was posted offline and is being synced. */
  offline: z.object({ invoiceNo: z.string().trim().regex(/^INV-[A-Z0-9]{1,10}\/\d{4}-\d{2}\/\d{5}$/, 'Offline bill number format'), postedAt: z.string(), counter: z.string().trim().min(1).max(10), pharmacistUserId: z.number().int().nullable().optional() }).optional(),
  /** Days of supply on the prescription; drives refill reminders. */
  refillDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
  /** Reason recorded when a major interaction warning was overridden. */
  interactionOverride: optionalText,
});
export type SaleInput = z.infer<typeof saleSchema>;

export const saleHoldSchema = z.object({
  clientRef: z.string().trim().min(8).max(64),
  label: optionalText,
  payload: z.unknown(),
});

export const saleReturnLineSchema = z.object({
  saleLineId: id,
  qtyUnits: z.coerce.number().int().min(1),
});

export const saleReturnSchema = z.object({
  saleId: id,
  date: isoDate.optional(),
  reason: nonEmpty.max(200),
  refundMode: z.enum(PAYMENT_MODES),
  lines: z.array(saleReturnLineSchema).min(1),
});
export type SaleReturnInput = z.infer<typeof saleReturnSchema>;

export const cancelDocSchema = z.object({ reason: nonEmpty.max(200) });
