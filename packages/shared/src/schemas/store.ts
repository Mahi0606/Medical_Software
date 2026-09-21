import { z } from 'zod';
import { LICENCE_TYPES, ROLES } from '../constants.js';
import { isoDate, nonEmpty, optionalGstin, optionalPhone, optionalText, phone } from './common.js';

export const storeSchema = z.object({
  name: nonEmpty.max(120),
  legalName: optionalText,
  addressLine1: nonEmpty.max(200),
  addressLine2: optionalText,
  city: nonEmpty.max(80),
  state: nonEmpty.max(80),
  stateCode: z.string().regex(/^\d{2}$/, '2-digit GST state code'),
  pincode: z.string().regex(/^\d{6}$/, '6-digit PIN code'),
  phone: phone,
  email: z.union([z.string().email(), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
  gstin: optionalGstin,
  gstScheme: z.enum(['regular', 'composition']),
  invoicePrefix: z.string().trim().max(8).default('INV'),
  pharmacistName: optionalText,
  pharmacistRegNo: optionalText,
  pharmacistCouncil: optionalText,
  footerNote: optionalText,
  upiId: optionalText,
  printFormat: z.enum(['thermal80', 'thermal58', 'a5', 'a4']).default('thermal80'),
  nearExpiryDays: z.coerce.number().int().min(7).max(365).default(90),
  maxDiscountPctClerk: z.coerce.number().min(0).max(100).default(10),
  maxDiscountPctPharmacist: z.coerce.number().min(0).max(100).default(20),
});
export type StoreInput = z.infer<typeof storeSchema>;

export const licenceSchema = z.object({
  type: z.enum(LICENCE_TYPES),
  number: nonEmpty.max(60),
  issuedBy: optionalText,
  issuedOn: isoDate.nullable().optional(),
  validTill: isoDate.nullable().optional(),
  retentionFeeDue: isoDate.nullable().optional(),
  notes: optionalText,
});
export type LicenceInput = z.infer<typeof licenceSchema>;

export const userCreateSchema = z.object({
  name: nonEmpty.max(80),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, '3–32 letters, digits, dot, dash or underscore'),
  password: z.string().min(8, 'At least 8 characters').max(128),
  role: z.enum(ROLES),
  pharmacistRegNo: optionalText,
  phone: optionalPhone,
  active: z.boolean().default(true),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = userCreateSchema.partial().extend({ password: z.string().min(8).max(128).optional() });

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
