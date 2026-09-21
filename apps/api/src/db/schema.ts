import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const now = () => sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
const ts = (name: string) => text(name).notNull().default(now());

// ---------- Store, branches, licences, users ----------
export const store = sqliteTable('store', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  addressLine1: text('address_line1').notNull().default(''),
  addressLine2: text('address_line2'),
  city: text('city').notNull().default(''),
  state: text('state').notNull().default(''),
  stateCode: text('state_code').notNull().default('27'),
  pincode: text('pincode').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email'),
  gstin: text('gstin'),
  gstScheme: text('gst_scheme', { enum: ['regular', 'composition'] }).notNull().default('regular'),
  invoicePrefix: text('invoice_prefix').notNull().default('INV'),
  pharmacistName: text('pharmacist_name'),
  pharmacistRegNo: text('pharmacist_reg_no'),
  pharmacistCouncil: text('pharmacist_council'),
  footerNote: text('footer_note'),
  upiId: text('upi_id'),
  printFormat: text('print_format').notNull().default('thermal80'),
  nearExpiryDays: integer('near_expiry_days').notNull().default(90),
  maxDiscountPctClerk: integer('max_discount_pct_clerk').notNull().default(10),
  maxDiscountPctPharmacist: integer('max_discount_pct_pharmacist').notNull().default(20),
  setupComplete: integer('setup_complete', { mode: 'boolean' }).notNull().default(false),
  updatedAt: ts('updated_at'),
});

export const branch = sqliteTable('branch', {
  id: integer('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const licence = sqliteTable('licence', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().default(1),
  type: text('type').notNull(),
  number: text('number').notNull(),
  issuedBy: text('issued_by'),
  issuedOn: text('issued_on'),
  validTill: text('valid_till'),
  retentionFeeDue: text('retention_fee_due'),
  notes: text('notes'),
  createdAt: ts('created_at'),
});

export const user = sqliteTable('user', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['owner', 'pharmacist', 'clerk'] }).notNull(),
  pharmacistRegNo: text('pharmacist_reg_no'),
  phone: text('phone'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => user.id),
  createdAt: ts('created_at'),
  expiresAt: text('expires_at').notNull(),
  userAgent: text('user_agent'),
  lastSeenAt: ts('last_seen_at'),
});

export const dutyLog = sqliteTable('duty_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().default(1),
  userId: integer('user_id').notNull().references(() => user.id),
  onAt: ts('on_at'),
  offAt: text('off_at'),
}, (t) => [index('duty_open_idx').on(t.branchId, t.offAt)]);

// ---------- Catalogue ----------
export const manufacturer = sqliteTable('manufacturer', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const item = sqliteTable('item', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  nameNorm: text('name_norm').notNull(),
  form: text('form').notNull().default('tablet'),
  manufacturerId: integer('manufacturer_id').references(() => manufacturer.id),
  genericText: text('generic_text').notNull().default(''),
  genericNorm: text('generic_norm').notNull().default(''),
  hsn: text('hsn').notNull().default('3004'),
  gstRatePct: integer('gst_rate_pct').notNull().default(5),
  schedule: text('schedule', { enum: ['NONE', 'G', 'H', 'H1', 'X'] }).notNull().default('NONE'),
  baseUnit: text('base_unit').notNull().default('tablet'),
  unitsPerPack: integer('units_per_pack').notNull().default(10),
  packName: text('pack_name').notNull().default('strip'),
  packsPerBox: integer('packs_per_box'),
  allowLoose: integer('allow_loose', { mode: 'boolean' }).notNull().default(true),
  rack: text('rack'),
  minStockUnits: integer('min_stock_units').notNull().default(0),
  maxStockUnits: integer('max_stock_units').notNull().default(0),
  reorderQtyPacks: integer('reorder_qty_packs').notNull().default(0),
  ean: text('ean'),
  coldChain: integer('cold_chain', { mode: 'boolean' }).notNull().default(false),
  notForSale: integer('not_for_sale', { mode: 'boolean' }).notNull().default(false),
  narcotic: integer('narcotic', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes'),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
}, (t) => [index('item_name_norm_idx').on(t.nameNorm), index('item_generic_norm_idx').on(t.genericNorm), index('item_ean_idx').on(t.ean), index('item_rack_idx').on(t.rack)]);

export const itemSalt = sqliteTable('item_salt', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => item.id, { onDelete: 'cascade' }),
  salt: text('salt').notNull(),
  saltNorm: text('salt_norm').notNull(),
  strength: text('strength'),
  unit: text('unit'),
  position: integer('position').notNull().default(0),
}, (t) => [index('item_salt_item_idx').on(t.itemId), index('item_salt_norm_idx').on(t.saltNorm)]);

export const itemScheduleHistory = sqliteTable('item_schedule_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => item.id, { onDelete: 'cascade' }),
  schedule: text('schedule').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  createdAt: ts('created_at'),
});

// ---------- Parties ----------
export const supplier = sqliteTable('supplier', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  gstin: text('gstin'),
  drugLicenceNo: text('drug_licence_no'),
  address: text('address'),
  city: text('city'),
  stateCode: text('state_code'),
  creditDays: integer('credit_days').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes'),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
});

export const customer = sqliteTable('customer', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  altPhone: text('alt_phone'),
  address: text('address'),
  city: text('city'),
  gstin: text('gstin'),
  dob: text('dob'),
  isMinor: integer('is_minor', { mode: 'boolean' }).notNull().default(false),
  guardianName: text('guardian_name'),
  consentMarketing: integer('consent_marketing', { mode: 'boolean' }).notNull().default(false),
  creditLimitPaise: integer('credit_limit_paise').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes'),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
}, (t) => [index('customer_phone_idx').on(t.phone)]);

export const doctor = sqliteTable('doctor', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  regNo: text('reg_no'),
  council: text('council'),
  qualification: text('qualification'),
  phone: text('phone'),
  address: text('address'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: ts('created_at'),
});

// ---------- Stock ----------
export const batch = sqliteTable('batch', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().default(1),
  itemId: integer('item_id').notNull().references(() => item.id),
  batchNo: text('batch_no').notNull(),
  mfgDate: text('mfg_date'),
  expiryDate: text('expiry_date').notNull(),
  mrpPaise: integer('mrp_paise').notNull(),
  purchaseRatePaise: integer('purchase_rate_paise').notNull().default(0),
  supplierId: integer('supplier_id').references(() => supplier.id),
  gtin: text('gtin'),
  status: text('status', { enum: ['active', 'quarantined', 'returned', 'disposed'] }).notNull().default('active'),
  qtyUnits: integer('qty_units').notNull().default(0),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
}, (t) => [index('batch_item_idx').on(t.itemId, t.expiryDate), index('batch_expiry_idx').on(t.expiryDate), uniqueIndex('batch_unique_idx').on(t.branchId, t.itemId, t.batchNo, t.expiryDate, t.mrpPaise)]);

export const stockLedger = sqliteTable('stock_ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().default(1),
  itemId: integer('item_id').notNull(),
  batchId: integer('batch_id').notNull(),
  qtyDelta: integer('qty_delta').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  reason: text('reason').notNull(),
  docType: text('doc_type'),
  docId: integer('doc_id'),
  userId: integer('user_id'),
  note: text('note'),
  createdAt: ts('created_at'),
}, (t) => [index('ledger_batch_idx').on(t.batchId), index('ledger_item_idx').on(t.itemId, t.createdAt), index('ledger_doc_idx').on(t.docType, t.docId)]);

export const docSequence = sqliteTable('doc_sequence', {
  branchId: integer('branch_id').notNull(),
  docType: text('doc_type').notNull(),
  fy: text('fy').notNull(),
  last: integer('last').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.branchId, t.docType, t.fy] })]);

// ---------- Purchases ----------
export const purchase = sqliteTable('purchase', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().default(1),
  grnNo: text('grn_no'),
  supplierId: integer('supplier_id').notNull().references(() => supplier.id),
  invoiceNo: text('invoice_no').notNull(),
  invoiceDate: text('invoice_date').notNull(),
  receivedDate: text('received_date').notNull(),
  status: text('status', { enum: ['draft', 'posted', 'cancelled'] }).notNull().default('draft'),
  interstate: integer('interstate', { mode: 'boolean' }).notNull().default(false),
  taxablePaise: integer('taxable_paise').notNull().default(0),
  cgstPaise: integer('cgst_paise').notNull().default(0),
  sgstPaise: integer('sgst_paise').notNull().default(0),
  igstPaise: integer('igst_paise').notNull().default(0),
  otherChargesPaise: integer('other_charges_paise').notNull().default(0),
  roundOffPaise: integer('round_off_paise').notNull().default(0),
  totalPaise: integer('total_paise').notNull().default(0),
  notes: text('notes'),
  purchaseOrderId: integer('purchase_order_id'),
  createdBy: integer('created_by').notNull(),
  createdAt: ts('created_at'),
  postedAt: text('posted_at'),
  cancelledAt: text('cancelled_at'),
  cancelReason: text('cancel_reason'),
}, (t) => [index('purchase_supplier_idx').on(t.supplierId, t.invoiceDate), uniqueIndex('purchase_inv_unique').on(t.supplierId, t.invoiceNo)]);

export const purchaseLine = sqliteTable('purchase_line', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  purchaseId: integer('purchase_id').notNull().references(() => purchase.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull(),
  batchId: integer('batch_id'),
  batchNo: text('batch_no').notNull(),
  mfgDate: text('mfg_date'),
  expiryDate: text('expiry_date').notNull(),
  qtyPacks: integer('qty_packs').notNull(),
  freePacks: integer('free_packs').notNull().default(0),
  unitsPerPack: integer('units_per_pack').notNull(),
  ratePaise: integer('rate_paise').notNull(),
  discountPct: integer('discount_pct_x100').notNull().default(0),
  mrpPaise: integer('mrp_paise').notNull(),
  gstRatePct: integer('gst_rate_pct').notNull(),
  hsn: text('hsn').notNull(),
  taxablePaise: integer('taxable_paise').notNull(),
  cgstPaise: integer('cgst_paise').notNull(),
  sgstPaise: integer('sgst_paise').notNull(),
  igstPaise: integer('igst_paise').notNull(),
  totalPaise: integer('total_paise').notNull(),
  schemeNote: text('scheme_note'),
  gtin: text('gtin'),
}, (t) => [index('purchase_line_purchase_idx').on(t.purchaseId), index('purchase_line_item_idx').on(t.itemId)]);

export const purchaseReturn = sqliteTable('purchase_return', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().default(1),
  docNo: text('doc_no'),
  supplierId: integer('supplier_id').notNull().references(() => supplier.id),
  date: text('date').notNull(),
  route: text('route', { enum: ['supply_invoice', 'credit_note'] }).notNull(),
  supplierRef: text('supplier_ref'),
  status: text('status', { enum: ['draft', 'posted', 'cancelled'] }).notNull().default('posted'),
  taxablePaise: integer('taxable_paise').notNull().default(0),
  cgstPaise: integer('cgst_paise').notNull().default(0),
  sgstPaise: integer('sgst_paise').notNull().default(0),
  igstPaise: integer('igst_paise').notNull().default(0),
  totalPaise: integer('total_paise').notNull().default(0),
  itcReversalPaise: integer('itc_reversal_paise').notNull().default(0),
  notes: text('notes'),
  createdBy: integer('created_by').notNull(),
  createdAt: ts('created_at'),
  cancelledAt: text('cancelled_at'),
  cancelReason: text('cancel_reason'),
});

export const purchaseReturnLine = sqliteTable('purchase_return_line', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  purchaseReturnId: integer('purchase_return_id').notNull().references(() => purchaseReturn.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull(),
  batchId: integer('batch_id').notNull(),
  qtyUnits: integer('qty_units').notNull(),
  ratePaise: integer('rate_paise').notNull(),
  gstRatePct: integer('gst_rate_pct').notNull(),
  taxablePaise: integer('taxable_paise').notNull(),
  taxPaise: integer('tax_paise').notNull(),
  totalPaise: integer('total_paise').notNull(),
  reason: text('reason').notNull(),
});

// ---------- Sales ----------
export const sale = sqliteTable('sale', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().default(1),
  counter: text('counter').notNull().default('C1'),
  invoiceNo: text('invoice_no'),
  fy: text('fy').notNull(),
  kind: text('kind').notNull().default('TAX_INVOICE'),
  date: text('date').notNull(),
  customerId: integer('customer_id').references(() => customer.id),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  customerGstin: text('customer_gstin'),
  doctorId: integer('doctor_id').references(() => doctor.id),
  doctorName: text('doctor_name'),
  doctorRegNo: text('doctor_reg_no'),
  patientName: text('patient_name'),
  patientAddress: text('patient_address'),
  patientAge: integer('patient_age'),
  prescriptionRef: text('prescription_ref'),
  prescriptionDate: text('prescription_date'),
  prescriptionImageId: integer('prescription_image_id'),
  pharmacistUserId: integer('pharmacist_user_id'),
  strictestSchedule: text('strictest_schedule').notNull().default('NONE'),
  status: text('status', { enum: ['draft', 'posted', 'cancelled'] }).notNull().default('posted'),
  grossPaise: integer('gross_paise').notNull().default(0),
  discountPaise: integer('discount_paise').notNull().default(0),
  billDiscountPct: integer('bill_discount_pct_x100').notNull().default(0),
  taxablePaise: integer('taxable_paise').notNull().default(0),
  cgstPaise: integer('cgst_paise').notNull().default(0),
  sgstPaise: integer('sgst_paise').notNull().default(0),
  igstPaise: integer('igst_paise').notNull().default(0),
  roundOffPaise: integer('round_off_paise').notNull().default(0),
  totalPaise: integer('total_paise').notNull().default(0),
  paidPaise: integer('paid_paise').notNull().default(0),
  creditPaise: integer('credit_paise').notNull().default(0),
  returnedPaise: integer('returned_paise').notNull().default(0),
  notes: text('notes'),
  clientRef: text('client_ref').notNull().unique(),
  createdBy: integer('created_by').notNull(),
  createdAt: ts('created_at'),
  postedAt: text('posted_at'),
  cancelledAt: text('cancelled_at'),
  cancelReason: text('cancel_reason'),
  offline: integer('offline', { mode: 'boolean' }).notNull().default(false),
  clientPostedAt: text('client_posted_at'),
  syncedAt: text('synced_at'),
  refillDays: integer('refill_days'),
  refillDueDate: text('refill_due_date'),
  interactionOverride: text('interaction_override'),
}, (t) => [index('sale_date_idx').on(t.date), index('sale_customer_idx').on(t.customerId), uniqueIndex('sale_invoice_unique').on(t.branchId, t.fy, t.invoiceNo)]);

export const saleLine = sqliteTable('sale_line', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  saleId: integer('sale_id').notNull().references(() => sale.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull(),
  batchId: integer('batch_id').notNull(),
  itemName: text('item_name').notNull(),
  genericText: text('generic_text'),
  manufacturer: text('manufacturer'),
  batchNo: text('batch_no').notNull(),
  expiryDate: text('expiry_date').notNull(),
  hsn: text('hsn').notNull(),
  schedule: text('schedule').notNull(),
  unitMode: text('unit_mode').notNull(),
  qty: integer('qty').notNull(),
  qtyUnits: integer('qty_units').notNull(),
  unitsPerPack: integer('units_per_pack').notNull(),
  packName: text('pack_name').notNull(),
  baseUnit: text('base_unit').notNull(),
  mrpPaise: integer('mrp_paise').notNull(),
  unitPricePaise: integer('unit_price_paise').notNull(),
  discountPct: integer('discount_pct_x100').notNull().default(0),
  grossPaise: integer('gross_paise').notNull(),
  discountPaise: integer('discount_paise').notNull(),
  netPaise: integer('net_paise').notNull(),
  gstRatePct: integer('gst_rate_pct').notNull(),
  taxablePaise: integer('taxable_paise').notNull(),
  cgstPaise: integer('cgst_paise').notNull(),
  sgstPaise: integer('sgst_paise').notNull(),
  igstPaise: integer('igst_paise').notNull(),
  costPaise: integer('cost_paise').notNull().default(0),
  returnedUnits: integer('returned_units').notNull().default(0),
  priceReason: text('price_reason'),
}, (t) => [index('sale_line_sale_idx').on(t.saleId), index('sale_line_item_idx').on(t.itemId), index('sale_line_batch_idx').on(t.batchId)]);

export const salePayment = sqliteTable('sale_payment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  saleId: integer('sale_id').notNull().references(() => sale.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  reference: text('reference'),
  createdAt: ts('created_at'),
});

export const saleHold = sqliteTable('sale_hold', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientRef: text('client_ref').notNull().unique(),
  label: text('label'),
  payloadJson: text('payload_json').notNull(),
  userId: integer('user_id').notNull(),
  createdAt: ts('created_at'),
});

export const saleReturn = sqliteTable('sale_return', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().default(1),
  saleId: integer('sale_id').notNull().references(() => sale.id),
  creditNoteNo: text('credit_note_no'),
  fy: text('fy').notNull(),
  date: text('date').notNull(),
  reason: text('reason').notNull(),
  refundMode: text('refund_mode').notNull(),
  taxablePaise: integer('taxable_paise').notNull(),
  cgstPaise: integer('cgst_paise').notNull(),
  sgstPaise: integer('sgst_paise').notNull(),
  igstPaise: integer('igst_paise').notNull(),
  totalPaise: integer('total_paise').notNull(),
  createdBy: integer('created_by').notNull(),
  createdAt: ts('created_at'),
});

export const saleReturnLine = sqliteTable('sale_return_line', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  saleReturnId: integer('sale_return_id').notNull().references(() => saleReturn.id, { onDelete: 'cascade' }),
  saleLineId: integer('sale_line_id').notNull(),
  itemId: integer('item_id').notNull(),
  batchId: integer('batch_id').notNull(),
  qtyUnits: integer('qty_units').notNull(),
  netPaise: integer('net_paise').notNull(),
  taxablePaise: integer('taxable_paise').notNull(),
  cgstPaise: integer('cgst_paise').notNull(),
  sgstPaise: integer('sgst_paise').notNull(),
  igstPaise: integer('igst_paise').notNull(),
});

export const prescriptionFile = sqliteTable('prescription_file', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  path: text('path').notNull(),
  uploadedBy: integer('uploaded_by').notNull(),
  createdAt: ts('created_at'),
});

// ---------- Statutory registers (append-only) ----------
export const rxRegister = sqliteTable('rx_register', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().default(1),
  register: text('register', { enum: ['RX', 'H1', 'X'] }).notNull(),
  fy: text('fy').notNull(),
  serialNo: integer('serial_no').notNull(),
  date: text('date').notNull(),
  saleId: integer('sale_id').notNull(),
  saleLineId: integer('sale_line_id').notNull(),
  invoiceNo: text('invoice_no'),
  doctorName: text('doctor_name'),
  doctorAddress: text('doctor_address'),
  doctorRegNo: text('doctor_reg_no'),
  patientName: text('patient_name'),
  patientAddress: text('patient_address'),
  itemName: text('item_name').notNull(),
  genericName: text('generic_name'),
  manufacturer: text('manufacturer'),
  batchNo: text('batch_no').notNull(),
  expiryDate: text('expiry_date').notNull(),
  qtyUnits: integer('qty_units').notNull(),
  qtyText: text('qty_text').notNull(),
  pharmacistUserId: integer('pharmacist_user_id'),
  pharmacistName: text('pharmacist_name'),
  pharmacistRegNo: text('pharmacist_reg_no'),
  prescriptionRef: text('prescription_ref'),
  createdAt: ts('created_at'),
}, (t) => [index('rx_register_idx').on(t.register, t.fy, t.serialNo), index('rx_register_date_idx').on(t.date)]);

// ---------- Party ledgers ----------
export const partyLedger = sqliteTable('party_ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  partyType: text('party_type', { enum: ['supplier', 'customer'] }).notNull(),
  partyId: integer('party_id').notNull(),
  date: text('date').notNull(),
  docType: text('doc_type').notNull(),
  docId: integer('doc_id'),
  docNo: text('doc_no'),
  debitPaise: integer('debit_paise').notNull().default(0),
  creditPaise: integer('credit_paise').notNull().default(0),
  note: text('note'),
  createdAt: ts('created_at'),
}, (t) => [index('party_ledger_idx').on(t.partyType, t.partyId, t.date)]);

export const partyPayment = sqliteTable('party_payment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  partyType: text('party_type', { enum: ['supplier', 'customer'] }).notNull(),
  partyId: integer('party_id').notNull(),
  date: text('date').notNull(),
  mode: text('mode').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  reference: text('reference'),
  note: text('note'),
  createdBy: integer('created_by').notNull(),
  createdAt: ts('created_at'),
});

// ---------- Labels ----------
export const labelTemplate = sqliteTable('label_template', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['product', 'loose', 'shelf'] }).notNull(),
  widthMm: integer('width_mm_x10').notNull(),
  heightMm: integer('height_mm_x10').notNull(),
  columns: integer('columns').notNull().default(1),
  gapMm: integer('gap_mm_x10').notNull().default(30),
  marginMm: integer('margin_mm_x10').notNull().default(15),
  fontScale: integer('font_scale_x100').notNull().default(100),
  symbology: text('symbology').notNull().default('code128'),
  barcodeContent: text('barcode_content').notNull().default('batch'),
  fieldsJson: text('fields_json').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
});

export const labelJob = sqliteTable('label_job', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  templateId: integer('template_id').notNull(),
  userId: integer('user_id').notNull(),
  payloadJson: text('payload_json').notNull(),
  labelCount: integer('label_count').notNull(),
  createdAt: ts('created_at'),
});

// ---------- Audit, backups, settings ----------
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: ts('at'),
  userId: integer('user_id'),
  username: text('username'),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  action: text('action').notNull(),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  reason: text('reason'),
  ip: text('ip'),
}, (t) => [index('audit_entity_idx').on(t.entity, t.entityId), index('audit_at_idx').on(t.at)]);

export const backupRun = sqliteTable('backup_run', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: ts('at'),
  path: text('path').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  ok: integer('ok', { mode: 'boolean' }).notNull(),
  note: text('note'),
  triggeredBy: text('triggered_by').notNull().default('scheduler'),
});

export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: ts('updated_at'),
});

// ---------- Phase 2: purchase orders ----------
export const purchaseOrder = sqliteTable('purchase_order', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  branchId: integer('branch_id').notNull().default(1),
  poNo: text('po_no'),
  supplierId: integer('supplier_id').notNull().references(() => supplier.id),
  status: text('status', { enum: ['draft', 'sent', 'partially_received', 'received', 'cancelled'] }).notNull().default('draft'),
  date: text('date').notNull(),
  expectedDate: text('expected_date'),
  notes: text('notes'),
  estimatedPaise: integer('estimated_paise').notNull().default(0),
  sentAt: text('sent_at'),
  sentVia: text('sent_via'),
  createdBy: integer('created_by').notNull(),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
  cancelReason: text('cancel_reason'),
}, (t) => [index('po_supplier_idx').on(t.supplierId, t.status)]);

export const purchaseOrderLine = sqliteTable('purchase_order_line', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  purchaseOrderId: integer('purchase_order_id').notNull().references(() => purchaseOrder.id, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => item.id),
  qtyPacks: integer('qty_packs').notNull(),
  ratePaise: integer('rate_paise'),
  mrpPaise: integer('mrp_paise'),
  receivedPacks: integer('received_packs').notNull().default(0),
  note: text('note'),
}, (t) => [index('po_line_po_idx').on(t.purchaseOrderId)]);

// ---------- Phase 2: messaging (WhatsApp / SMS outbox) ----------
export const messageOutbox = sqliteTable('message_outbox', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channel: text('channel', { enum: ['whatsapp', 'sms'] }).notNull().default('whatsapp'),
  toPhone: text('to_phone').notNull(),
  templateKey: text('template_key').notNull(),
  body: text('body').notNull(),
  mediaUrl: text('media_url'),
  status: text('status', { enum: ['queued', 'sent', 'failed', 'skipped', 'manual'] }).notNull().default('queued'),
  providerMessageId: text('provider_message_id'),
  error: text('error'),
  relatedType: text('related_type'),
  relatedId: integer('related_id'),
  customerId: integer('customer_id'),
  scheduledFor: text('scheduled_for'),
  attempts: integer('attempts').notNull().default(0),
  createdBy: integer('created_by'),
  createdAt: ts('created_at'),
  sentAt: text('sent_at'),
}, (t) => [index('outbox_status_idx').on(t.status, t.scheduledFor), index('outbox_related_idx').on(t.relatedType, t.relatedId)]);

// ---------- Phase 2: drug interaction rules (starter dataset, editable) ----------
export const interactionRule = sqliteTable('interaction_rule', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  saltA: text('salt_a').notNull(),
  saltB: text('salt_b').notNull(),
  severity: text('severity', { enum: ['major', 'moderate', 'minor'] }).notNull(),
  message: text('message').notNull(),
  advice: text('advice'),
  source: text('source'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at'),
}, (t) => [index('interaction_a_idx').on(t.saltA), index('interaction_b_idx').on(t.saltB)]);
