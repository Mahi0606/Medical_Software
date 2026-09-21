import { and, asc, desc, eq, getTableColumns, or, sql } from 'drizzle-orm';
import type { CustomerInput, DoctorInput, PartyPaymentInput, SupplierInput } from '@pharma/shared';
import { schema, type DB, type Tx } from '../db/index.js';
import { audit } from '../lib/audit.js';
import type { Ctx } from '../lib/ctx.js';
import { notFound } from '../lib/errors.js';

type PartyType = 'supplier' | 'customer';

export function postLedger(tx: Tx | DB, e: { partyType: PartyType; partyId: number; date: string; docType: string; docId?: number | null; docNo?: string | null; debitPaise?: number; creditPaise?: number; note?: string | null }) {
  tx.insert(schema.partyLedger).values({ partyType: e.partyType, partyId: e.partyId, date: e.date, docType: e.docType, docId: e.docId ?? null, docNo: e.docNo ?? null, debitPaise: e.debitPaise ?? 0, creditPaise: e.creditPaise ?? 0, note: e.note ?? null }).run();
}

/** Positive = the party owes us (customer) or we owe them (supplier), depending on partyType convention below. */
// Drizzle omits the table qualifier in single-table selects, so the correlated column must be spelled out.
/** Positive balance = amount outstanding: what the customer owes us, or what we owe the supplier. */
const balanceSub = (type: PartyType, _idCol: typeof schema.supplier.id | typeof schema.customer.id) =>
  type === 'customer'
    ? sql<number>`(select coalesce(sum(l.debit_paise) - sum(l.credit_paise), 0) from party_ledger l where l.party_type = 'customer' and l.party_id = "customer"."id")`
    : sql<number>`(select coalesce(sum(l.credit_paise) - sum(l.debit_paise), 0) from party_ledger l where l.party_type = 'supplier' and l.party_id = "supplier"."id")`;

export function listSuppliers(db: DB, q?: string, activeOnly = true) {
  const conds = [];
  if (activeOnly) conds.push(eq(schema.supplier.active, true));
  if (q) conds.push(sql`lower(${schema.supplier.name}) like ${'%' + q.toLowerCase() + '%'}`);
  return db.select({ ...getTableColumns(schema.supplier), balancePaise: balanceSub('supplier', schema.supplier.id) }).from(schema.supplier)
    .where(conds.length ? and(...conds) : undefined).orderBy(asc(schema.supplier.name)).all();
}
export function getSupplier(db: DB, id: number) {
  const s = db.select({ ...getTableColumns(schema.supplier), balancePaise: balanceSub('supplier', schema.supplier.id) }).from(schema.supplier).where(eq(schema.supplier.id, id)).get();
  if (!s) throw notFound('Supplier not found');
  return s;
}
export function saveSupplier(db: DB, ctx: Ctx, input: SupplierInput, id?: number) {
  return db.transaction((tx) => {
    if (id) {
      const before = tx.select().from(schema.supplier).where(eq(schema.supplier.id, id)).get();
      if (!before) throw notFound('Supplier not found');
      tx.update(schema.supplier).set({ ...input, updatedAt: new Date().toISOString() }).where(eq(schema.supplier.id, id)).run();
      audit(tx, ctx, { entity: 'supplier', entityId: id, action: 'update', before, after: input });
      return getSupplier(tx as unknown as DB, id);
    }
    const row = tx.insert(schema.supplier).values(input).returning({ id: schema.supplier.id }).get();
    audit(tx, ctx, { entity: 'supplier', entityId: row.id, action: 'create', after: input });
    return getSupplier(tx as unknown as DB, row.id);
  });
}

export function listCustomers(db: DB, q?: string, withDuesOnly = false) {
  const conds = [eq(schema.customer.active, true)];
  if (q) {
    const t = `%${q.toLowerCase()}%`;
    conds.push(or(sql`lower(${schema.customer.name}) like ${t}`, sql`${schema.customer.phone} like ${t}`)!);
  }
  if (withDuesOnly) conds.push(sql`${balanceSub('customer', schema.customer.id)} > 0`);
  return db.select({ ...getTableColumns(schema.customer), balancePaise: balanceSub('customer', schema.customer.id) }).from(schema.customer)
    .where(and(...conds)).orderBy(asc(schema.customer.name)).limit(200).all();
}
export function getCustomer(db: DB, id: number) {
  const c = db.select({ ...getTableColumns(schema.customer), balancePaise: balanceSub('customer', schema.customer.id) }).from(schema.customer).where(eq(schema.customer.id, id)).get();
  if (!c) throw notFound('Customer not found');
  return c;
}
export function findCustomerByPhone(db: DB, phone: string) {
  return db.select({ ...getTableColumns(schema.customer), balancePaise: balanceSub('customer', schema.customer.id) }).from(schema.customer).where(and(eq(schema.customer.phone, phone), eq(schema.customer.active, true))).get() ?? null;
}
export function saveCustomer(db: DB, ctx: Ctx, input: CustomerInput, id?: number) {
  return db.transaction((tx) => {
    if (id) {
      const before = tx.select().from(schema.customer).where(eq(schema.customer.id, id)).get();
      if (!before) throw notFound('Customer not found');
      tx.update(schema.customer).set({ ...input, updatedAt: new Date().toISOString() }).where(eq(schema.customer.id, id)).run();
      audit(tx, ctx, { entity: 'customer', entityId: id, action: 'update', before, after: input });
      return getCustomer(tx as unknown as DB, id);
    }
    const row = tx.insert(schema.customer).values(input).returning({ id: schema.customer.id }).get();
    audit(tx, ctx, { entity: 'customer', entityId: row.id, action: 'create', after: input });
    return getCustomer(tx as unknown as DB, row.id);
  });
}

export function listDoctors(db: DB, q?: string) {
  const conds = [eq(schema.doctor.active, true)];
  if (q) {
    const t = `%${q.toLowerCase()}%`;
    conds.push(or(sql`lower(${schema.doctor.name}) like ${t}`, sql`lower(${schema.doctor.regNo}) like ${t}`)!);
  }
  return db.select().from(schema.doctor).where(and(...conds)).orderBy(asc(schema.doctor.name)).limit(100).all();
}
export function saveDoctor(db: DB, ctx: Ctx, input: DoctorInput, id?: number) {
  return db.transaction((tx) => {
    if (id) {
      const before = tx.select().from(schema.doctor).where(eq(schema.doctor.id, id)).get();
      if (!before) throw notFound('Doctor not found');
      tx.update(schema.doctor).set(input).where(eq(schema.doctor.id, id)).run();
      audit(tx, ctx, { entity: 'doctor', entityId: id, action: 'update', before, after: input });
      return tx.select().from(schema.doctor).where(eq(schema.doctor.id, id)).get()!;
    }
    const row = tx.insert(schema.doctor).values(input).returning().get();
    audit(tx, ctx, { entity: 'doctor', entityId: row.id, action: 'create', after: input });
    return row;
  });
}
/** Find or create a doctor by name + reg no during billing. */
export function ensureDoctor(tx: Tx | DB, name: string | null | undefined, regNo: string | null | undefined): number | null {
  const n = name?.trim();
  if (!n) return null;
  const conds = [sql`lower(${schema.doctor.name}) = ${n.toLowerCase()}`];
  if (regNo?.trim()) conds.push(eq(schema.doctor.regNo, regNo.trim()));
  const existing = tx.select({ id: schema.doctor.id, regNo: schema.doctor.regNo }).from(schema.doctor).where(and(...conds)).get();
  if (existing) {
    if (!existing.regNo && regNo?.trim()) tx.update(schema.doctor).set({ regNo: regNo.trim() }).where(eq(schema.doctor.id, existing.id)).run();
    return existing.id;
  }
  return tx.insert(schema.doctor).values({ name: n, regNo: regNo?.trim() || null }).returning({ id: schema.doctor.id }).get().id;
}

export function partyLedgerRows(db: DB, type: PartyType, id: number) {
  const rows = db.select().from(schema.partyLedger).where(and(eq(schema.partyLedger.partyType, type), eq(schema.partyLedger.partyId, id))).orderBy(asc(schema.partyLedger.date), asc(schema.partyLedger.id)).all();
  let running = 0;
  return rows.map((r) => { running += type === 'customer' ? r.debitPaise - r.creditPaise : r.creditPaise - r.debitPaise; return { ...r, balancePaise: running }; });
}

export function recordPartyPayment(db: DB, ctx: Ctx, type: PartyType, id: number, input: PartyPaymentInput) {
  return db.transaction((tx) => {
    if (type === 'supplier') getSupplier(tx as unknown as DB, id); else getCustomer(tx as unknown as DB, id);
    const pay = tx.insert(schema.partyPayment).values({ partyType: type, partyId: id, date: input.date, mode: input.mode, amountPaise: input.amountPaise, reference: input.reference ?? null, note: input.note ?? null, createdBy: ctx.userId }).returning().get();
    // Supplier: we owe (credit) on purchase, payment debits. Customer: they owe (debit) on credit sale, receipt credits.
    if (type === 'supplier') postLedger(tx, { partyType: type, partyId: id, date: input.date, docType: 'PAYMENT', docId: pay.id, debitPaise: input.amountPaise, note: input.note ?? `Paid by ${input.mode}` });
    else postLedger(tx, { partyType: type, partyId: id, date: input.date, docType: 'RECEIPT', docId: pay.id, creditPaise: input.amountPaise, note: input.note ?? `Received by ${input.mode}` });
    audit(tx, ctx, { entity: `${type}_payment`, entityId: pay.id, action: 'create', after: { partyId: id, ...input } });
    return pay;
  });
}

export function listPayments(db: DB, type: PartyType, id: number) {
  return db.select().from(schema.partyPayment).where(and(eq(schema.partyPayment.partyType, type), eq(schema.partyPayment.partyId, id))).orderBy(desc(schema.partyPayment.id)).all();
}
