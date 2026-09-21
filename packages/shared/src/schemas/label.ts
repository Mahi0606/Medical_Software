import { z } from 'zod';
import { id, nonEmpty, optionalText } from './common.js';

export const labelFieldKeys = ['storeName', 'itemName', 'generic', 'batch', 'expiry', 'mfg', 'mrp', 'pack', 'rack', 'packedOn', 'barcode', 'barcodeText', 'qrGs1', 'schedule'] as const;
export type LabelFieldKey = (typeof labelFieldKeys)[number];

export const labelTemplateSchema = z.object({
  name: nonEmpty.max(60),
  kind: z.enum(['product', 'loose', 'shelf']),
  widthMm: z.coerce.number().min(20).max(150),
  heightMm: z.coerce.number().min(10).max(150),
  columns: z.coerce.number().int().min(1).max(4).default(1),
  gapMm: z.coerce.number().min(0).max(20).default(3),
  marginMm: z.coerce.number().min(0).max(10).default(1.5),
  fontScale: z.coerce.number().min(0.7).max(1.6).default(1),
  symbology: z.enum(['code128', 'ean13', 'datamatrix', 'qrcode']).default('code128'),
  barcodeContent: z.enum(['batch', 'item', 'gtin']).default('batch'),
  fields: z.array(z.enum(labelFieldKeys)).default(['itemName', 'batch', 'expiry', 'mrp', 'barcode', 'barcodeText']),
  isDefault: z.boolean().default(false),
});
export type LabelTemplateInput = z.infer<typeof labelTemplateSchema>;

export const labelJobSchema = z.object({
  templateId: id,
  items: z.array(z.object({ batchId: id, copies: z.coerce.number().int().min(1).max(999) })).min(1),
  /** For loose-dispense labels. */
  loose: z.object({ qtyText: optionalText, patientName: optionalText, directions: optionalText }).optional(),
});
export type LabelJobInput = z.infer<typeof labelJobSchema>;
