import { z } from 'zod';
import { DOSAGE_FORMS, GST_RATES_LIST } from './enums.js';
import { SCHEDULES } from '../schedule.js';
import { boolQuery, id, isoDate, nonEmpty, optionalText, paginationQuery } from './common.js';

export const saltSchema = z.object({
  salt: nonEmpty.max(120),
  strength: z.union([z.coerce.number().positive(), z.null()]).optional().transform((v) => v ?? null),
  unit: optionalText,
});

export const itemSchema = z.object({
  name: nonEmpty.max(160),
  form: z.enum(DOSAGE_FORMS).default('tablet'),
  manufacturer: optionalText,
  salts: z.array(saltSchema).default([]),
  hsn: z.string().trim().regex(/^\d{4,8}$/, '4–8 digit HSN').default('3004'),
  gstRatePct: z.coerce.number().refine((v) => GST_RATES_LIST.includes(v), 'Choose a valid GST rate'),
  schedule: z.enum(SCHEDULES).default('NONE'),
  scheduleEffectiveFrom: isoDate.nullable().optional(),
  baseUnit: nonEmpty.max(20).default('tablet'),
  unitsPerPack: z.coerce.number().int().min(1).max(10000).default(10),
  packName: nonEmpty.max(20).default('strip'),
  packsPerBox: z.union([z.coerce.number().int().min(1), z.null()]).optional().transform((v) => v ?? null),
  allowLoose: z.boolean().default(true),
  rack: optionalText,
  minStockUnits: z.coerce.number().int().min(0).default(0),
  maxStockUnits: z.coerce.number().int().min(0).default(0),
  reorderQtyPacks: z.coerce.number().int().min(0).default(0),
  ean: optionalText,
  coldChain: z.boolean().default(false),
  notForSale: z.boolean().default(false),
  narcotic: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: optionalText,
});
export type ItemInput = z.infer<typeof itemSchema>;

export const itemSearchQuery = paginationQuery.extend({
  mode: z.enum(['name', 'salt', 'rack', 'code', 'any']).default('any'),
  inStockOnly: boolQuery,
  schedule: z.enum(SCHEDULES).optional(),
  active: boolQuery,
});
export type ItemSearchQuery = z.infer<typeof itemSearchQuery>;

export const batchSchema = z.object({
  itemId: id,
  batchNo: nonEmpty.max(40),
  mfgDate: isoDate.nullable().optional(),
  expiryDate: isoDate,
  mrpPaise: z.coerce.number().int().min(0),
  purchaseRatePaise: z.coerce.number().int().min(0).default(0),
  supplierId: id.nullable().optional(),
  gtin: optionalText,
});
export type BatchInput = z.infer<typeof batchSchema>;

export const stockAdjustmentSchema = z.object({
  batchId: id,
  qtyDeltaUnits: z.coerce.number().int().refine((v) => v !== 0, 'Quantity cannot be zero'),
  reason: z.enum(['adjustment', 'opening', 'disposal']),
  note: nonEmpty.max(200),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const batchStatusSchema = z.object({
  status: z.enum(['active', 'quarantined', 'disposed']),
  note: optionalText,
});

export const openingStockRow = z.object({
  itemId: id,
  batchNo: nonEmpty,
  expiryDate: isoDate,
  mrpPaise: z.coerce.number().int().min(0),
  purchaseRatePaise: z.coerce.number().int().min(0).default(0),
  qtyUnits: z.coerce.number().int().min(1),
});
