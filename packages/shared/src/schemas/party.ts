import { z } from 'zod';
import { id, isoDate, nonEmpty, optionalGstin, optionalPhone, optionalText, paise, phone } from './common.js';
import { PAYMENT_MODES } from '../constants.js';

export const supplierSchema = z.object({
  name: nonEmpty.max(120),
  phone: optionalPhone,
  email: z.union([z.string().email(), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
  gstin: optionalGstin,
  drugLicenceNo: optionalText,
  address: optionalText,
  city: optionalText,
  stateCode: z.union([z.string().regex(/^\d{2}$/), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
  creditDays: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
  notes: optionalText,
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const customerSchema = z.object({
  name: nonEmpty.max(120),
  phone: phone,
  altPhone: optionalPhone,
  address: optionalText,
  city: optionalText,
  gstin: optionalGstin,
  dob: isoDate.nullable().optional(),
  isMinor: z.boolean().default(false),
  guardianName: optionalText,
  consentMarketing: z.boolean().default(false),
  creditLimitPaise: paise.default(0),
  active: z.boolean().default(true),
  notes: optionalText,
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const doctorSchema = z.object({
  name: nonEmpty.max(120),
  regNo: optionalText,
  council: optionalText,
  qualification: optionalText,
  phone: optionalPhone,
  address: optionalText,
  active: z.boolean().default(true),
});
export type DoctorInput = z.infer<typeof doctorSchema>;

export const partyPaymentSchema = z.object({
  amountPaise: paise.refine((v) => v > 0, 'Amount must be positive'),
  mode: z.enum(PAYMENT_MODES),
  reference: optionalText,
  date: isoDate,
  note: optionalText,
});
export type PartyPaymentInput = z.infer<typeof partyPaymentSchema>;

export const idParam = z.object({ id });
