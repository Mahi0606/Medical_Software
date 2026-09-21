import { and, desc, eq, gt, gte, isNull, lt, lte, sql } from 'drizzle-orm';
import { addDays, todayIST } from '@pharma/shared';
import { schema, type DB } from '../db/index.js';

export function dashboard(db: DB) {
  const today = todayIST();
  const store = db.select().from(schema.store).where(eq(schema.store.id, 1)).get()!;
  const near = addDays(today, store.nearExpiryDays);
  const posted = eq(schema.sale.status, 'posted');
  const sales = db.select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${schema.sale.totalPaise}),0)`, credit: sql<number>`coalesce(sum(${schema.sale.creditPaise}),0)`, returned: sql<number>`coalesce(sum(${schema.sale.returnedPaise}),0)` }).from(schema.sale).where(and(posted, eq(schema.sale.date, today))).get()!;
  const byMode = db.select({ mode: schema.salePayment.mode, total: sql<number>`coalesce(sum(${schema.salePayment.amountPaise}),0)` }).from(schema.salePayment).innerJoin(schema.sale, eq(schema.sale.id, schema.salePayment.saleId)).where(and(posted, eq(schema.sale.date, today))).groupBy(schema.salePayment.mode).all();
  const receipts = db.select({ total: sql<number>`coalesce(sum(${schema.partyPayment.amountPaise}),0)` }).from(schema.partyPayment).where(and(eq(schema.partyPayment.partyType, 'customer'), eq(schema.partyPayment.date, today), eq(schema.partyPayment.mode, 'cash'))).get()!.total;
  const lowStock = db.select({ n: sql<number>`count(*)` }).from(schema.item).where(and(eq(schema.item.active, true), gt(schema.item.minStockUnits, 0), sql`(select coalesce(sum(b.qty_units),0) from batch b where b.item_id = "item"."id" and b.status='active' and b.expiry_date >= ${today}) <= ${schema.item.minStockUnits}`)).get()!.n;
  const outOfStock = db.select({ n: sql<number>`count(*)` }).from(schema.item).where(and(eq(schema.item.active, true), sql`(select coalesce(sum(b.qty_units),0) from batch b where b.item_id = "item"."id" and b.status='active' and b.expiry_date >= ${today}) = 0`, sql`exists (select 1 from sale_line sl where sl.item_id = "item"."id")`)).get()!.n;
  const nearExpiry = db.select({ n: sql<number>`count(*)`, valueCost: sql<number>`coalesce(sum(${schema.batch.qtyUnits} * ${schema.batch.purchaseRatePaise} / ${schema.item.unitsPerPack}),0)`, valueMrp: sql<number>`coalesce(sum(${schema.batch.qtyUnits} * ${schema.batch.mrpPaise} / ${schema.item.unitsPerPack}),0)` })
    .from(schema.batch).innerJoin(schema.item, eq(schema.item.id, schema.batch.itemId)).where(and(eq(schema.batch.status, 'active'), gt(schema.batch.qtyUnits, 0), gte(schema.batch.expiryDate, today), lte(schema.batch.expiryDate, near))).get()!;
  const expired = db.select({ n: sql<number>`count(*)`, valueCost: sql<number>`coalesce(sum(${schema.batch.qtyUnits} * ${schema.batch.purchaseRatePaise} / ${schema.item.unitsPerPack}),0)` })
    .from(schema.batch).innerJoin(schema.item, eq(schema.item.id, schema.batch.itemId)).where(and(sql`${schema.batch.status} in ('active','quarantined')`, gt(schema.batch.qtyUnits, 0), lt(schema.batch.expiryDate, today))).get()!;
  const customerDues = db.select({ total: sql<number>`coalesce(sum(debit_paise) - sum(credit_paise),0)` }).from(schema.partyLedger).where(eq(schema.partyLedger.partyType, 'customer')).get()!.total;
  const supplierDues = db.select({ total: sql<number>`coalesce(sum(credit_paise) - sum(debit_paise),0)` }).from(schema.partyLedger).where(eq(schema.partyLedger.partyType, 'supplier')).get()!.total;
  const licenceDue = db.select().from(schema.licence).where(sql`coalesce(${schema.licence.retentionFeeDue}, ${schema.licence.validTill}) <= ${addDays(today, 90)}`).all();
  const duty = db.select({ name: schema.user.name, regNo: schema.user.pharmacistRegNo, onAt: schema.dutyLog.onAt }).from(schema.dutyLog).innerJoin(schema.user, eq(schema.user.id, schema.dutyLog.userId)).where(isNull(schema.dutyLog.offAt)).all();
  const recentSales = db.select({ id: schema.sale.id, invoiceNo: schema.sale.invoiceNo, customerName: schema.sale.customerName, totalPaise: schema.sale.totalPaise, createdAt: schema.sale.createdAt, status: schema.sale.status }).from(schema.sale).orderBy(desc(schema.sale.id)).limit(8).all();
  const lastBackup = db.select().from(schema.backupRun).where(eq(schema.backupRun.ok, true)).orderBy(desc(schema.backupRun.id)).limit(1).get() ?? null;
  const last7 = db.select({ date: schema.sale.date, total: sql<number>`coalesce(sum(${schema.sale.totalPaise}),0)`, n: sql<number>`count(*)` }).from(schema.sale).where(and(posted, gte(schema.sale.date, addDays(today, -6)))).groupBy(schema.sale.date).orderBy(schema.sale.date).all();
  const topToday = db.select({ itemName: schema.saleLine.itemName, qtyUnits: sql<number>`sum(${schema.saleLine.qtyUnits})`, net: sql<number>`sum(${schema.saleLine.netPaise})` }).from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(posted, eq(schema.sale.date, today))).groupBy(schema.saleLine.itemId).orderBy(desc(sql`sum(${schema.saleLine.netPaise})`)).limit(5).all();
  const cashIn = (byMode.find((m) => m.mode === 'cash')?.total ?? 0) + receipts;
  return { today, sales, byMode, cashIn, lowStock, outOfStock, nearExpiry, nearExpiryDays: store.nearExpiryDays, expired, customerDues, supplierDues, licenceDue, duty, recentSales, lastBackup, last7, topToday, setupComplete: store.setupComplete };
}
