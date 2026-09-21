import { z } from 'zod';
import { PURCHASE_RETURN_ROUTES } from '../constants.js';
import { GST_RATES_LIST } from './enums.js';
import { id, isoDate, nonEmpty, optionalText, paise } from './common.js';

export const purchaseLineSchema = z.object({
  itemId: id,
  batchNo: nonEmpty.max(40),
  mfgDate: isoDate.nullable().optional(),
  expiryDate: isoDate,
  /** Packs invoiced and paid for. */
  qtyPacks: z.coerce.number().int().min(0),
  /** Free / scheme packs on the same batch line (10+1 → freePacks = 1). */
  freePacks: z.coerce.number().int().min(0).default(0),
  /** Purchase rate per pack before GST (PTR), paise. */
  ratePaise: paise,
  discountPct: z.coerce.number().min(0).max(100).default(0),
  mrpPaise: paise,
  gstRatePct: z.coerce.number().refine((v) => GST_RATES_LIST.includes(v)),
  hsn: z.string().trim().regex(/^\d{4,8}$/).optional(),
  schemeNote: optionalText,
  gtin: optionalText,
}).refine((l) => l.qtyPacks + l.freePacks > 0, { message: 'Enter a quantity', path: ['qtyPacks'] });
export type PurchaseLineInput = z.infer<typeof purchaseLineSchema>;

export const purchaseSchema = z.object({
  supplierId: id,
  invoiceNo: nonEmpty.max(40),
  invoiceDate: isoDate,
  receivedDate: isoDate.optional(),
  interstate: z.boolean().default(false),
  /** Additional charges / round-off from the supplier invoice, paise, may be negative. */
  otherChargesPaise: z.coerce.number().int().default(0),
  notes: optionalText,
  lines: z.array(purchaseLineSchema).min(1, 'Add at least one line'),
  /** Print labels for received batches after posting. */
  printLabels: z.boolean().default(false),
  /** Phase 2: receipt raised against a purchase order (updates the PO's received packs). */
  purchaseOrderId: id.nullable().optional(),
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;

export const purchaseReturnLineSchema = z.object({
  batchId: id,
  qtyUnits: z.coerce.number().int().min(1),
  /** Value per pack claimed, paise (defaults to purchase rate). */
  ratePaise: paise.optional(),
  reason: z.enum(['expired', 'near_expiry', 'damaged', 'excess', 'recall', 'other']),
});

export const purchaseReturnSchema = z.object({
  supplierId: id,
  date: isoDate,
  route: z.enum(PURCHASE_RETURN_ROUTES),
  supplierRef: optionalText,
  notes: optionalText,
  lines: z.array(purchaseReturnLineSchema).min(1),
});
export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>;

export const purchaseImportRow = z.object({
  itemName: nonEmpty,
  itemId: id.optional(),
  batchNo: nonEmpty,
  expiry: nonEmpty,
  qtyPacks: z.coerce.number().int().min(0),
  freePacks: z.coerce.number().int().min(0).default(0),
  rate: z.coerce.number().min(0),
  mrp: z.coerce.number().min(0),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  gstRatePct: z.coerce.number().default(5),
  hsn: z.string().optional(),
});
