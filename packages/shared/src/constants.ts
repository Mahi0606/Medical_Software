export const ROLES = ['owner', 'pharmacist', 'clerk'] as const;
export type Role = (typeof ROLES)[number];

export const PAYMENT_MODES = ['cash', 'card', 'upi', 'credit', 'other'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const DOSAGE_FORMS = ['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'drops', 'cream', 'ointment', 'gel', 'inhaler', 'powder', 'sachet', 'lotion', 'spray', 'solution', 'device', 'other'] as const;
export type DosageForm = (typeof DOSAGE_FORMS)[number];

export const DOC_STATUS = ['draft', 'posted', 'cancelled'] as const;
export type DocStatus = (typeof DOC_STATUS)[number];

export const STOCK_REASONS = ['purchase', 'sale', 'sale_return', 'purchase_return', 'adjustment', 'opening', 'quarantine', 'unquarantine', 'disposal', 'transfer', 'cancel'] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

export const BATCH_STATUS = ['active', 'quarantined', 'returned', 'disposed'] as const;
export type BatchStatus = (typeof BATCH_STATUS)[number];

export const LICENCE_TYPES = ['FORM_20', 'FORM_21', 'FORM_20F', 'FORM_20A', 'FORM_21A', 'FORM_20B', 'FORM_21B', 'GSTIN', 'FSSAI', 'SHOP_ACT', 'OTHER'] as const;
export type LicenceType = (typeof LICENCE_TYPES)[number];

export const LICENCE_LABELS: Record<LicenceType, string> = {
  FORM_20: 'Form 20 – Retail (non-Schedule C)',
  FORM_21: 'Form 21 – Retail (Schedule C & C1)',
  FORM_20F: 'Form 20F – Schedule X retail',
  FORM_20A: 'Form 20A – Restricted retail',
  FORM_21A: 'Form 21A – Restricted retail (Sch. C)',
  FORM_20B: 'Form 20B – Wholesale',
  FORM_21B: 'Form 21B – Wholesale (Sch. C)',
  GSTIN: 'GST registration',
  FSSAI: 'FSSAI licence / registration',
  SHOP_ACT: 'Shops & Establishments',
  OTHER: 'Other',
};

export const PURCHASE_RETURN_ROUTES = ['supply_invoice', 'credit_note'] as const;
export type PurchaseReturnRoute = (typeof PURCHASE_RETURN_ROUTES)[number];

export const DEFAULT_HSN_MEDICINE = '3004';

/** Default label sizes in mm. */
export const LABEL_PRESETS = [
  { id: '50x25', name: '50 × 25 mm (single)', widthMm: 50, heightMm: 25, columns: 1, gapMm: 3 },
  { id: '38x25x2', name: '38 × 25 mm (two-up)', widthMm: 38, heightMm: 25, columns: 2, gapMm: 3 },
  { id: '50x38', name: '50 × 38 mm (single)', widthMm: 50, heightMm: 38, columns: 1, gapMm: 3 },
  { id: '75x50', name: '75 × 50 mm (single)', widthMm: 75, heightMm: 50, columns: 1, gapMm: 3 },
] as const;

/** Statutory retention (days) — nothing inside these windows may be purged. */
export const RETENTION_DAYS = {
  h1Register: 3 * 365,
  xRegister: 2 * 365,
  rxRegister: 5 * 365, // PCI PPR 2015 reg 6.2
  gstRecords: 6 * 365 + 275, // 72 months after annual return due date (approx.)
  auditLog: 8 * 365,
} as const;

/** Permission matrix. Owner has everything. */
export const PERMISSIONS = {
  'sale.create': ['owner', 'pharmacist', 'clerk'],
  'sale.cancel': ['owner', 'pharmacist'],
  'sale.return': ['owner', 'pharmacist'],
  'purchase.create': ['owner', 'pharmacist'],
  'purchase.return': ['owner', 'pharmacist'],
  'item.write': ['owner', 'pharmacist'],
  'stock.adjust': ['owner', 'pharmacist'],
  'party.write': ['owner', 'pharmacist', 'clerk'],
  'payment.write': ['owner', 'pharmacist', 'clerk'],
  'report.view': ['owner', 'pharmacist'],
  'report.finance': ['owner'],
  'register.view': ['owner', 'pharmacist'],
  'settings.write': ['owner'],
  'user.write': ['owner'],
  'audit.view': ['owner'],
  'backup.run': ['owner'],
  'label.print': ['owner', 'pharmacist', 'clerk'],
  'duty.toggle': ['owner', 'pharmacist'],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly Role[]).includes(role);
}
