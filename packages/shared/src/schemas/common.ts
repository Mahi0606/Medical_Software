import { z } from 'zod';

export const id = z.coerce.number().int().positive();
export const paise = z.coerce.number().int().min(0);
export const signedPaise = z.coerce.number().int();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const optionalIsoDate = isoDate.nullable().optional();
export const phone = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number');
export const optionalPhone = z.union([phone, z.literal(''), z.null()]).optional().transform((v) => (v ? v : null));
export const gstin = z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN');
export const optionalGstin = z.union([gstin, z.literal(''), z.null()]).optional().transform((v) => (v ? v : null));
export const nonEmpty = z.string().trim().min(1, 'Required');
export const optionalText = z.union([z.string().trim(), z.null()]).optional().transform((v) => (v ? v : null));

/** Query-string boolean: 'true'/'1' → true, 'false'/'0' → false (z.coerce.boolean would make 'false' true). */
export const boolQuery = z.preprocess((v) => (v === true || v === 'true' || v === '1' ? true : v === false || v === 'false' || v === '0' ? false : undefined), z.boolean().optional());

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  q: z.string().trim().optional(),
  sort: z.string().optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const dateRangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
