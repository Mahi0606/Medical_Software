import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { addDays, todayIST } from '@pharma/shared';
import { schema, type DB } from '../db/index.js';

const posted = eq(schema.sale.status, 'posted');
const between = (col: AnySQLiteColumn, from: string, to: string) => and(gte(col, from), lte(col, to));

export function dayBook(db: DB, date: string) {
  const sales = db.select({ n: sql<number>`count(*)`, gross: sql<number>`coalesce(sum(${schema.sale.grossPaise}),0)`, discount: sql<number>`coalesce(sum(${schema.sale.discountPaise}),0)`, taxable: sql<number>`coalesce(sum(${schema.sale.taxablePaise}),0)`, tax: sql<number>`coalesce(sum(${schema.sale.cgstPaise}+${schema.sale.sgstPaise}+${schema.sale.igstPaise}),0)`, total: sql<number>`coalesce(sum(${schema.sale.totalPaise}),0)`, credit: sql<number>`coalesce(sum(${schema.sale.creditPaise}),0)`, cancelled: sql<number>`(select count(*) from sale s2 where s2.date = ${date} and s2.status = 'cancelled')` }).from(schema.sale).where(and(posted, eq(schema.sale.date, date))).get()!;
  const byMode = db.select({ mode: schema.salePayment.mode, total: sql<number>`coalesce(sum(${schema.salePayment.amountPaise}),0)`, n: sql<number>`count(*)` }).from(schema.salePayment).innerJoin(schema.sale, eq(schema.sale.id, schema.salePayment.saleId)).where(and(posted, eq(schema.sale.date, date))).groupBy(schema.salePayment.mode).all();
  const returns = db.select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${schema.saleReturn.totalPaise}),0)`, cash: sql<number>`coalesce(sum(case when ${schema.saleReturn.refundMode} = 'cash' then ${schema.saleReturn.totalPaise} else 0 end),0)` }).from(schema.saleReturn).where(eq(schema.saleReturn.date, date)).get()!;
  const purchases = db.select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${schema.purchase.totalPaise}),0)` }).from(schema.purchase).where(and(eq(schema.purchase.status, 'posted'), eq(schema.purchase.receivedDate, date))).get()!;
  const received = db.select({ mode: schema.partyPayment.mode, total: sql<number>`coalesce(sum(${schema.partyPayment.amountPaise}),0)` }).from(schema.partyPayment).where(and(eq(schema.partyPayment.partyType, 'customer'), eq(schema.partyPayment.date, date))).groupBy(schema.partyPayment.mode).all();
  const paid = db.select({ mode: schema.partyPayment.mode, total: sql<number>`coalesce(sum(${schema.partyPayment.amountPaise}),0)` }).from(schema.partyPayment).where(and(eq(schema.partyPayment.partyType, 'supplier'), eq(schema.partyPayment.date, date))).groupBy(schema.partyPayment.mode).all();
  const cash = (m: { mode: string; total: number }[]) => m.find((x) => x.mode === 'cash')?.total ?? 0;
  const cashIn = cash(byMode) + cash(received);
  const cashOut = returns.cash + cash(paid);
  const rows = db.select({ id: schema.sale.id, invoiceNo: schema.sale.invoiceNo, createdAt: schema.sale.createdAt, customerName: schema.sale.customerName, totalPaise: schema.sale.totalPaise, paidPaise: schema.sale.paidPaise, creditPaise: schema.sale.creditPaise, status: schema.sale.status, createdByName: schema.user.name }).from(schema.sale).leftJoin(schema.user, eq(schema.user.id, schema.sale.createdBy)).where(eq(schema.sale.date, date)).orderBy(asc(schema.sale.id)).all();
  return { date, sales, byMode, returns, purchases, received, paid, cashIn, cashOut, netCash: cashIn - cashOut, rows };
}

export function salesRegister(db: DB, from: string, to: string) {
  const rows = db.select({ id: schema.sale.id, date: schema.sale.date, invoiceNo: schema.sale.invoiceNo, kind: schema.sale.kind, status: schema.sale.status, customerName: schema.sale.customerName, customerGstin: schema.sale.customerGstin, taxablePaise: schema.sale.taxablePaise, cgstPaise: schema.sale.cgstPaise, sgstPaise: schema.sale.sgstPaise, igstPaise: schema.sale.igstPaise, roundOffPaise: schema.sale.roundOffPaise, totalPaise: schema.sale.totalPaise, returnedPaise: schema.sale.returnedPaise })
    .from(schema.sale).where(between(schema.sale.date, from, to)).orderBy(asc(schema.sale.date), asc(schema.sale.id)).all();
  const totals = rows.filter((r) => r.status === 'posted').reduce((a, r) => ({ taxablePaise: a.taxablePaise + r.taxablePaise, cgstPaise: a.cgstPaise + r.cgstPaise, sgstPaise: a.sgstPaise + r.sgstPaise, igstPaise: a.igstPaise + r.igstPaise, totalPaise: a.totalPaise + r.totalPaise, n: a.n + 1 }), { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0, n: 0 });
  return { from, to, rows, totals };
}

export function purchaseRegister(db: DB, from: string, to: string) {
  const rows = db.select({ id: schema.purchase.id, invoiceDate: schema.purchase.invoiceDate, receivedDate: schema.purchase.receivedDate, grnNo: schema.purchase.grnNo, invoiceNo: schema.purchase.invoiceNo, status: schema.purchase.status, supplierName: schema.supplier.name, supplierGstin: schema.supplier.gstin, taxablePaise: schema.purchase.taxablePaise, cgstPaise: schema.purchase.cgstPaise, sgstPaise: schema.purchase.sgstPaise, igstPaise: schema.purchase.igstPaise, totalPaise: schema.purchase.totalPaise })
    .from(schema.purchase).innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchase.supplierId)).where(between(schema.purchase.invoiceDate, from, to)).orderBy(asc(schema.purchase.invoiceDate)).all();
  const totals = rows.filter((r) => r.status === 'posted').reduce((a, r) => ({ taxablePaise: a.taxablePaise + r.taxablePaise, cgstPaise: a.cgstPaise + r.cgstPaise, sgstPaise: a.sgstPaise + r.sgstPaise, igstPaise: a.igstPaise + r.igstPaise, totalPaise: a.totalPaise + r.totalPaise, n: a.n + 1 }), { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0, n: 0 });
  return { from, to, rows, totals };
}

/** GSTR-1 style summary: B2B invoice-wise, B2C rate-wise, HSN summary split B2B/B2C, credit notes, document series. */
export function gstr1(db: DB, from: string, to: string) {
  const range = and(posted, between(schema.sale.date, from, to));
  const b2b = db.select({ invoiceNo: schema.sale.invoiceNo, date: schema.sale.date, customerName: schema.sale.customerName, gstin: schema.sale.customerGstin, taxablePaise: schema.sale.taxablePaise, cgstPaise: schema.sale.cgstPaise, sgstPaise: schema.sale.sgstPaise, igstPaise: schema.sale.igstPaise, totalPaise: schema.sale.totalPaise }).from(schema.sale).where(and(range, isNotNull(schema.sale.customerGstin))).orderBy(asc(schema.sale.date)).all();
  const b2cByRate = db.select({ ratePct: schema.saleLine.gstRatePct, taxablePaise: sql<number>`sum(${schema.saleLine.taxablePaise})`, cgstPaise: sql<number>`sum(${schema.saleLine.cgstPaise})`, sgstPaise: sql<number>`sum(${schema.saleLine.sgstPaise})`, igstPaise: sql<number>`sum(${schema.saleLine.igstPaise})` })
    .from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(range, isNull(schema.sale.customerGstin))).groupBy(schema.saleLine.gstRatePct).orderBy(asc(schema.saleLine.gstRatePct)).all();
  const hsn = (b2bOnly: boolean) => db.select({ hsn: schema.saleLine.hsn, ratePct: schema.saleLine.gstRatePct, qtyUnits: sql<number>`sum(${schema.saleLine.qtyUnits})`, taxablePaise: sql<number>`sum(${schema.saleLine.taxablePaise})`, cgstPaise: sql<number>`sum(${schema.saleLine.cgstPaise})`, sgstPaise: sql<number>`sum(${schema.saleLine.sgstPaise})`, igstPaise: sql<number>`sum(${schema.saleLine.igstPaise})`, totalPaise: sql<number>`sum(${schema.saleLine.netPaise})` })
    .from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(range, b2bOnly ? isNotNull(schema.sale.customerGstin) : isNull(schema.sale.customerGstin))).groupBy(schema.saleLine.hsn, schema.saleLine.gstRatePct).orderBy(asc(schema.saleLine.hsn), asc(schema.saleLine.gstRatePct)).all();
  const creditNotes = db.select({ creditNoteNo: schema.saleReturn.creditNoteNo, date: schema.saleReturn.date, invoiceNo: schema.sale.invoiceNo, gstin: schema.sale.customerGstin, taxablePaise: schema.saleReturn.taxablePaise, cgstPaise: schema.saleReturn.cgstPaise, sgstPaise: schema.saleReturn.sgstPaise, igstPaise: schema.saleReturn.igstPaise, totalPaise: schema.saleReturn.totalPaise })
    .from(schema.saleReturn).innerJoin(schema.sale, eq(schema.sale.id, schema.saleReturn.saleId)).where(between(schema.saleReturn.date, from, to)).orderBy(asc(schema.saleReturn.date)).all();
  const docs = db.select({ first: sql<string>`min(${schema.sale.invoiceNo})`, last: sql<string>`max(${schema.sale.invoiceNo})`, total: sql<number>`count(*)`, cancelled: sql<number>`sum(case when ${schema.sale.status} = 'cancelled' then 1 else 0 end)` }).from(schema.sale).where(between(schema.sale.date, from, to)).get()!;
  const nilExempt = db.select({ taxablePaise: sql<number>`coalesce(sum(${schema.saleLine.taxablePaise}),0)` }).from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(range, eq(schema.saleLine.gstRatePct, 0))).get()!;
  return { from, to, b2b, b2cByRate, hsnB2B: hsn(true), hsnB2C: hsn(false), creditNotes, documents: docs, nilExempt };
}

export function gstr3b(db: DB, from: string, to: string) {
  const out = db.select({ taxablePaise: sql<number>`coalesce(sum(case when ${schema.saleLine.gstRatePct} > 0 then ${schema.saleLine.taxablePaise} else 0 end),0)`, exemptPaise: sql<number>`coalesce(sum(case when ${schema.saleLine.gstRatePct} = 0 then ${schema.saleLine.taxablePaise} else 0 end),0)`, cgstPaise: sql<number>`coalesce(sum(${schema.saleLine.cgstPaise}),0)`, sgstPaise: sql<number>`coalesce(sum(${schema.saleLine.sgstPaise}),0)`, igstPaise: sql<number>`coalesce(sum(${schema.saleLine.igstPaise}),0)` })
    .from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(posted, between(schema.sale.date, from, to))).get()!;
  const cn = db.select({ taxablePaise: sql<number>`coalesce(sum(${schema.saleReturn.taxablePaise}),0)`, cgstPaise: sql<number>`coalesce(sum(${schema.saleReturn.cgstPaise}),0)`, sgstPaise: sql<number>`coalesce(sum(${schema.saleReturn.sgstPaise}),0)`, igstPaise: sql<number>`coalesce(sum(${schema.saleReturn.igstPaise}),0)` }).from(schema.saleReturn).where(between(schema.saleReturn.date, from, to)).get()!;
  const itc = db.select({ taxablePaise: sql<number>`coalesce(sum(${schema.purchase.taxablePaise}),0)`, cgstPaise: sql<number>`coalesce(sum(${schema.purchase.cgstPaise}),0)`, sgstPaise: sql<number>`coalesce(sum(${schema.purchase.sgstPaise}),0)`, igstPaise: sql<number>`coalesce(sum(${schema.purchase.igstPaise}),0)` }).from(schema.purchase).where(and(eq(schema.purchase.status, 'posted'), between(schema.purchase.invoiceDate, from, to))).get()!;
  const itcReversal = db.select({ paise: sql<number>`coalesce(sum(${schema.purchaseReturn.itcReversalPaise}),0)` }).from(schema.purchaseReturn).where(and(eq(schema.purchaseReturn.status, 'posted'), between(schema.purchaseReturn.date, from, to))).get()!.paise;
  const outwardReturnsAsSupply = db.select({ taxablePaise: sql<number>`coalesce(sum(${schema.purchaseReturn.taxablePaise}),0)`, taxPaise: sql<number>`coalesce(sum(${schema.purchaseReturn.cgstPaise}+${schema.purchaseReturn.sgstPaise}+${schema.purchaseReturn.igstPaise}),0)` }).from(schema.purchaseReturn).where(and(eq(schema.purchaseReturn.status, 'posted'), eq(schema.purchaseReturn.route, 'supply_invoice'), between(schema.purchaseReturn.date, from, to))).get()!;
  return { from, to, outward: out, creditNotes: cn, itc, itcReversalPaise: itcReversal, purchaseReturnsAsSupply: outwardReturnsAsSupply };
}

export function stockSummary(db: DB, opts: { lowOnly?: boolean; zeroOnly?: boolean; q?: string }) {
  const today = todayIST();
  const stock = sql<number>`(select coalesce(sum(b.qty_units),0) from batch b where b.item_id = "item"."id" and b.status='active' and b.expiry_date >= ${today})`;
  const conds = [eq(schema.item.active, true)];
  if (opts.lowOnly) conds.push(and(sql`${schema.item.minStockUnits} > 0`, sql`${stock} <= ${schema.item.minStockUnits}`)!);
  if (opts.zeroOnly) conds.push(sql`${stock} = 0`);
  if (opts.q) conds.push(sql`${schema.item.nameNorm} like ${'%' + opts.q.toLowerCase() + '%'}`);
  return db.select({
    id: schema.item.id, name: schema.item.name, genericText: schema.item.genericText, rack: schema.item.rack, unitsPerPack: schema.item.unitsPerPack, packName: schema.item.packName, baseUnit: schema.item.baseUnit, minStockUnits: schema.item.minStockUnits, reorderQtyPacks: schema.item.reorderQtyPacks,
    stockUnits: stock,
    valueCostPaise: sql<number>`(select coalesce(sum(b.qty_units * b.purchase_rate_paise / ${schema.item.unitsPerPack}),0) from batch b where b.item_id = "item"."id" and b.status='active' and b.expiry_date >= ${today})`,
    valueMrpPaise: sql<number>`(select coalesce(sum(b.qty_units * b.mrp_paise / ${schema.item.unitsPerPack}),0) from batch b where b.item_id = "item"."id" and b.status='active' and b.expiry_date >= ${today})`,
    sold30: sql<number>`(select coalesce(sum(sl.qty_units),0) from sale_line sl join sale s on s.id = sl.sale_id where sl.item_id = "item"."id" and s.status='posted' and s.date >= ${addDays(today, -30)})`,
    lastSold: sql<string | null>`(select max(s.date) from sale_line sl join sale s on s.id = sl.sale_id where sl.item_id = "item"."id" and s.status='posted')`,
    supplierName: sql<string | null>`(select sp.name from batch b left join supplier sp on sp.id = b.supplier_id where b.item_id = "item"."id" order by b.id desc limit 1)`,
  }).from(schema.item).where(and(...conds)).orderBy(asc(schema.item.nameNorm)).all();
}

export function expiryReport(db: DB, days: number, includeExpired: boolean) {
  const today = todayIST();
  const conds = [sql`${schema.batch.status} in ('active','quarantined')`, sql`${schema.batch.qtyUnits} > 0`, lte(schema.batch.expiryDate, addDays(today, days))];
  if (!includeExpired) conds.push(gte(schema.batch.expiryDate, today));
  return db.select({
    batchId: schema.batch.id, itemId: schema.item.id, itemName: schema.item.name, batchNo: schema.batch.batchNo, expiryDate: schema.batch.expiryDate, status: schema.batch.status, qtyUnits: schema.batch.qtyUnits, unitsPerPack: schema.item.unitsPerPack, packName: schema.item.packName, baseUnit: schema.item.baseUnit,
    mrpPaise: schema.batch.mrpPaise, purchaseRatePaise: schema.batch.purchaseRatePaise, valueCostPaise: sql<number>`${schema.batch.qtyUnits} * ${schema.batch.purchaseRatePaise} / ${schema.item.unitsPerPack}`, valueMrpPaise: sql<number>`${schema.batch.qtyUnits} * ${schema.batch.mrpPaise} / ${schema.item.unitsPerPack}`,
    supplierId: schema.batch.supplierId, supplierName: schema.supplier.name, daysLeft: sql<number>`cast(julianday(${schema.batch.expiryDate}) - julianday(${today}) as integer)`,
  }).from(schema.batch).innerJoin(schema.item, eq(schema.item.id, schema.batch.itemId)).leftJoin(schema.supplier, eq(schema.supplier.id, schema.batch.supplierId)).where(and(...conds)).orderBy(asc(schema.supplier.name), asc(schema.batch.expiryDate)).all();
}

export function deadStock(db: DB, days: number) {
  const today = todayIST();
  const since = addDays(today, -days);
  return stockSummary(db, {}).filter((r) => r.stockUnits > 0 && (!r.lastSold || r.lastSold < since));
}

export type ProfitGroup = 'item' | 'salt' | 'supplier' | 'customer' | 'day' | 'user' | 'doctor';
export function profit(db: DB, from: string, to: string, group: ProfitGroup) {
  const keyExpr = {
    item: sql<string>`${schema.saleLine.itemName}`,
    salt: sql<string>`coalesce(nullif(${schema.saleLine.genericText}, ''), 'Unknown')`,
    supplier: sql<string>`coalesce((select sp.name from batch b left join supplier sp on sp.id = b.supplier_id where b.id = "sale_line"."batch_id"), 'Unknown')`,
    customer: sql<string>`coalesce(${schema.sale.customerName}, 'Walk-in')`,
    day: sql<string>`${schema.sale.date}`,
    user: sql<string>`(select u.name from user u where u.id = "sale"."created_by")`,
    doctor: sql<string>`coalesce(${schema.sale.doctorName}, 'No prescriber')`,
  }[group];
  const rows = db.select({ key: keyExpr, bills: sql<number>`count(distinct ${schema.sale.id})`, qtyUnits: sql<number>`sum(${schema.saleLine.qtyUnits} - ${schema.saleLine.returnedUnits})`, revenuePaise: sql<number>`sum(${schema.saleLine.taxablePaise} * (${schema.saleLine.qtyUnits} - ${schema.saleLine.returnedUnits}) / ${schema.saleLine.qtyUnits})`, costPaise: sql<number>`sum(${schema.saleLine.costPaise} * (${schema.saleLine.qtyUnits} - ${schema.saleLine.returnedUnits}) / ${schema.saleLine.qtyUnits})`, discountPaise: sql<number>`sum(${schema.saleLine.discountPaise})` })
    .from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(posted, between(schema.sale.date, from, to))).groupBy(keyExpr).orderBy(desc(sql`sum(${schema.saleLine.taxablePaise})`)).all();
  return rows.map((r) => ({ ...r, marginPaise: r.revenuePaise - r.costPaise, marginPct: r.revenuePaise > 0 ? Math.round(((r.revenuePaise - r.costPaise) / r.revenuePaise) * 1000) / 10 : 0 }));
}

export function outstanding(db: DB) {
  const customers = db.select({ id: schema.customer.id, name: schema.customer.name, phone: schema.customer.phone, balancePaise: sql<number>`(select coalesce(sum(debit_paise)-sum(credit_paise),0) from party_ledger l where l.party_type='customer' and l.party_id="customer"."id")`, lastDate: sql<string | null>`(select max(date) from party_ledger l where l.party_type='customer' and l.party_id="customer"."id")` }).from(schema.customer).all().filter((c) => c.balancePaise !== 0).sort((a, b) => b.balancePaise - a.balancePaise);
  const suppliers = db.select({ id: schema.supplier.id, name: schema.supplier.name, phone: schema.supplier.phone, balancePaise: sql<number>`(select coalesce(sum(credit_paise)-sum(debit_paise),0) from party_ledger l where l.party_type='supplier' and l.party_id="supplier"."id")`, lastDate: sql<string | null>`(select max(date) from party_ledger l where l.party_type='supplier' and l.party_id="supplier"."id")` }).from(schema.supplier).all().filter((s) => s.balancePaise !== 0).sort((a, b) => b.balancePaise - a.balancePaise);
  return { customers, suppliers };
}

export function scheduleSales(db: DB, from: string, to: string) {
  return db.select({ schedule: schema.saleLine.schedule, lines: sql<number>`count(*)`, qtyUnits: sql<number>`sum(${schema.saleLine.qtyUnits})`, netPaise: sql<number>`sum(${schema.saleLine.netPaise})` }).from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(posted, between(schema.sale.date, from, to))).groupBy(schema.saleLine.schedule).all();
}

export function auditList(db: DB, f: { entity?: string; userId?: number; from?: string; to?: string; q?: string; page: number; pageSize: number }) {
  const conds = [];
  if (f.entity) conds.push(eq(schema.auditLog.entity, f.entity));
  if (f.userId) conds.push(eq(schema.auditLog.userId, f.userId));
  if (f.from) conds.push(gte(schema.auditLog.at, f.from));
  if (f.to) conds.push(lt(schema.auditLog.at, addDays(f.to, 1)));
  if (f.q) {
    const t = `%${f.q.toLowerCase()}%`;
    conds.push(sql`(lower(${schema.auditLog.entityId}) like ${t} or lower(${schema.auditLog.action}) like ${t} or lower(${schema.auditLog.afterJson}) like ${t} or lower(${schema.auditLog.reason}) like ${t})`);
  }
  const where = conds.length ? and(...conds) : undefined;
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.auditLog).where(where).get()!.n;
  const rows = db.select().from(schema.auditLog).where(where).orderBy(desc(schema.auditLog.id)).limit(f.pageSize).offset((f.page - 1) * f.pageSize).all();
  const entities = db.selectDistinct({ entity: schema.auditLog.entity }).from(schema.auditLog).orderBy(schema.auditLog.entity).all().map((e) => e.entity);
  return { rows, total, page: f.page, pageSize: f.pageSize, entities };
}
