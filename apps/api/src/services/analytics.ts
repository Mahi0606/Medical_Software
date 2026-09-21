import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { addDays, todayIST } from '@pharma/shared';
import { schema, type DB } from '../db/index.js';
import { deadStock } from './reports.js';

const posted = eq(schema.sale.status, 'posted');

function monthList(months: number, today: string): string[] {
  const out: string[] = [];
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  for (let i = 0; i < months; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m--; if (m === 0) { m = 12; y--; }
  }
  return out;
}

/** Owner analytics: month trend, movers, supplier performance, payment mix, busy hours. All money in paise. */
export function analytics(db: DB, months = 12) {
  const today = todayIST();
  const list = monthList(months, today);
  const fromMonth = `${list[0]}-01`;
  const d30 = addDays(today, -30);
  const d60 = addDays(today, -60);
  const d365 = addDays(today, -365);

  // ---- monthly trend ----
  const monthExpr = sql<string>`substr(${schema.sale.date}, 1, 7)`;
  const heads = db.select({ month: monthExpr, salesPaise: sql<number>`coalesce(sum(${schema.sale.totalPaise}),0)`, taxablePaise: sql<number>`coalesce(sum(${schema.sale.taxablePaise}),0)`, bills: sql<number>`count(*)` })
    .from(schema.sale).where(and(posted, gte(schema.sale.date, fromMonth))).groupBy(monthExpr).all();
  const costs = db.select({ month: monthExpr, costPaise: sql<number>`coalesce(sum(${schema.saleLine.costPaise} * (${schema.saleLine.qtyUnits} - ${schema.saleLine.returnedUnits}) / ${schema.saleLine.qtyUnits}),0)`, revenuePaise: sql<number>`coalesce(sum(${schema.saleLine.taxablePaise} * (${schema.saleLine.qtyUnits} - ${schema.saleLine.returnedUnits}) / ${schema.saleLine.qtyUnits}),0)` })
    .from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(posted, gte(schema.sale.date, fromMonth))).groupBy(monthExpr).all();
  const headMap = new Map(heads.map((h) => [h.month, h]));
  const costMap = new Map(costs.map((c) => [c.month, c]));
  const monthly = list.map((month) => {
    const h = headMap.get(month);
    const c = costMap.get(month);
    const salesPaise = h?.salesPaise ?? 0;
    const bills = h?.bills ?? 0;
    const marginPaise = (c?.revenuePaise ?? 0) - (c?.costPaise ?? 0);
    return { month, salesPaise, taxablePaise: h?.taxablePaise ?? 0, costPaise: c?.costPaise ?? 0, marginPaise, bills, avgBillPaise: bills ? Math.round(salesPaise / bills) : 0 };
  });

  // ---- top movers: last 30 days vs the 30 before ----
  const movers = db.select({
    itemId: schema.saleLine.itemId, name: sql<string>`max(${schema.saleLine.itemName})`,
    units30: sql<number>`coalesce(sum(case when ${schema.sale.date} > ${d30} then ${schema.saleLine.qtyUnits} - ${schema.saleLine.returnedUnits} else 0 end),0)`,
    units30Prev: sql<number>`coalesce(sum(case when ${schema.sale.date} <= ${d30} then ${schema.saleLine.qtyUnits} - ${schema.saleLine.returnedUnits} else 0 end),0)`,
    revenuePaise: sql<number>`coalesce(sum(case when ${schema.sale.date} > ${d30} then ${schema.saleLine.taxablePaise} else 0 end),0)`,
  }).from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(posted, sql`${schema.sale.date} > ${d60}`)).groupBy(schema.saleLine.itemId).orderBy(desc(sql`sum(case when ${schema.sale.date} > ${d30} then ${schema.saleLine.taxablePaise} else 0 end)`)).limit(15).all();
  const topMovers = movers.filter((m) => m.revenuePaise > 0).map((m) => ({ ...m, changePct: m.units30Prev > 0 ? Math.round(((m.units30 - m.units30Prev) / m.units30Prev) * 100) : m.units30 > 0 ? 100 : 0 }));

  // ---- slow movers: stock with no sale in 60 days, by value ----
  const slowMovers = deadStock(db, 60).sort((a, b) => b.valueCostPaise - a.valueCostPaise).slice(0, 10)
    .map((r) => ({ itemId: r.id, name: r.name, stockUnits: r.stockUnits, unitsPerPack: r.unitsPerPack, packName: r.packName, baseUnit: r.baseUnit, valueCostPaise: r.valueCostPaise, lastSold: r.lastSold }));

  // ---- suppliers, last 12 months ----
  const bought = db.select({ supplierId: schema.purchase.supplierId, purchasesPaise: sql<number>`coalesce(sum(${schema.purchase.totalPaise}),0)`, receipts: sql<number>`count(*)` })
    .from(schema.purchase).where(and(eq(schema.purchase.status, 'posted'), gte(schema.purchase.invoiceDate, d365))).groupBy(schema.purchase.supplierId).all();
  const returned = db.select({ supplierId: schema.purchaseReturn.supplierId, returnsPaise: sql<number>`coalesce(sum(${schema.purchaseReturn.totalPaise}),0)` })
    .from(schema.purchaseReturn).where(and(eq(schema.purchaseReturn.status, 'posted'), gte(schema.purchaseReturn.date, d365))).groupBy(schema.purchaseReturn.supplierId).all();
  const sold = db.select({ supplierId: schema.batch.supplierId, revenuePaise: sql<number>`coalesce(sum(${schema.saleLine.taxablePaise}),0)`, costPaise: sql<number>`coalesce(sum(${schema.saleLine.costPaise}),0)` })
    .from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).innerJoin(schema.batch, eq(schema.batch.id, schema.saleLine.batchId)).where(and(posted, gte(schema.sale.date, d365))).groupBy(schema.batch.supplierId).all();
  const names = new Map(db.select({ id: schema.supplier.id, name: schema.supplier.name }).from(schema.supplier).all().map((s) => [s.id, s.name]));
  const ids = new Set<number>([...bought.map((b) => b.supplierId), ...returned.map((r) => r.supplierId), ...sold.map((s) => s.supplierId).filter((x): x is number => x !== null)]);
  const suppliers = [...ids].map((supplierId) => {
    const b = bought.find((x) => x.supplierId === supplierId);
    const r = returned.find((x) => x.supplierId === supplierId);
    const s = sold.find((x) => x.supplierId === supplierId);
    const purchasesPaise = b?.purchasesPaise ?? 0;
    const returnsPaise = r?.returnsPaise ?? 0;
    return { supplierId, name: names.get(supplierId) ?? 'Unknown', purchasesPaise, receipts: b?.receipts ?? 0, returnsPaise, returnSharePct: purchasesPaise > 0 ? Math.round((returnsPaise / purchasesPaise) * 1000) / 10 : 0, soldRevenuePaise: s?.revenuePaise ?? 0, avgMarginPct: s && s.revenuePaise > 0 ? Math.round(((s.revenuePaise - s.costPaise) / s.revenuePaise) * 1000) / 10 : null };
  }).sort((a, b) => b.purchasesPaise - a.purchasesPaise);

  // ---- payment mix, last 30 days ----
  const paymentMix = db.select({ mode: schema.salePayment.mode, amountPaise: sql<number>`coalesce(sum(${schema.salePayment.amountPaise}),0)`, n: sql<number>`count(*)` })
    .from(schema.salePayment).innerJoin(schema.sale, eq(schema.sale.id, schema.salePayment.saleId)).where(and(posted, sql`${schema.sale.date} > ${d30}`)).groupBy(schema.salePayment.mode).orderBy(desc(sql`sum(${schema.salePayment.amountPaise})`)).all();
  const creditPaise = db.select({ v: sql<number>`coalesce(sum(${schema.sale.creditPaise}),0)` }).from(schema.sale).where(and(posted, sql`${schema.sale.date} > ${d30}`)).get()!.v;
  if (creditPaise > 0) paymentMix.push({ mode: 'credit', amountPaise: creditPaise, n: 0 });

  // ---- bills by hour of day (IST), last 30 days ----
  const hourExpr = sql<string>`strftime('%H', ${schema.sale.createdAt}, '+5 hours', '+30 minutes')`;
  const hours = db.select({ hour: hourExpr, bills: sql<number>`count(*)` }).from(schema.sale).where(and(posted, sql`${schema.sale.date} > ${d30}`)).groupBy(hourExpr).all();
  const hourMap = new Map(hours.map((h) => [Number(h.hour), h.bills]));
  const hourOfDay = Array.from({ length: 24 }, (_, hour) => ({ hour, bills: hourMap.get(hour) ?? 0 }));

  // ---- schedule share, last 30 days ----
  const sched = db.select({ schedule: schema.saleLine.schedule, lines: sql<number>`count(*)`, netPaise: sql<number>`coalesce(sum(${schema.saleLine.netPaise}),0)` })
    .from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(posted, sql`${schema.sale.date} > ${d30}`)).groupBy(schema.saleLine.schedule).all();
  const schedTotal = sched.reduce((a, s) => a + s.netPaise, 0);
  const scheduleShare = sched.map((s) => ({ ...s, sharePct: schedTotal ? Math.round((s.netPaise / schedTotal) * 1000) / 10 : 0 })).sort((a, b) => b.netPaise - a.netPaise);

  return { asOf: today, months, monthly, topMovers, slowMovers, suppliers, paymentMix, hourOfDay, scheduleShare };
}
