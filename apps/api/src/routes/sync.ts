import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { and, desc, eq, gt, gte, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { todayIST } from '@pharma/shared';
import { schema } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { activeRules } from '../services/interactions.js';
import { getStore } from '../services/store.js';

/**
 * Offline support. The counter downloads a snapshot of everything billing needs, works
 * from IndexedDB while the network is down, and replays posted bills through POST /sales
 * with an `offline` block. This file only serves the snapshot and status.
 */
export const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/sync/snapshot', { preHandler: app.requireAuth }, async () => {
    const today = todayIST();
    const items = app.db.select({
      id: schema.item.id, name: schema.item.name, nameNorm: schema.item.nameNorm, form: schema.item.form, manufacturer: schema.manufacturer.name, genericText: schema.item.genericText, hsn: schema.item.hsn, gstRatePct: schema.item.gstRatePct,
      schedule: schema.item.schedule, baseUnit: schema.item.baseUnit, unitsPerPack: schema.item.unitsPerPack, packName: schema.item.packName, packsPerBox: schema.item.packsPerBox, allowLoose: schema.item.allowLoose, rack: schema.item.rack, ean: schema.item.ean,
      notForSale: schema.item.notForSale, coldChain: schema.item.coldChain, active: schema.item.active, minStockUnits: schema.item.minStockUnits, maxStockUnits: schema.item.maxStockUnits, genericNorm: schema.item.genericNorm,
    }).from(schema.item).leftJoin(schema.manufacturer, eq(schema.manufacturer.id, schema.item.manufacturerId)).where(eq(schema.item.active, true)).all();
    const salts = app.db.select({ itemId: schema.itemSalt.itemId, salt: schema.itemSalt.salt, saltNorm: schema.itemSalt.saltNorm }).from(schema.itemSalt).all();
    const batches = app.db.select({
      id: schema.batch.id, itemId: schema.batch.itemId, batchNo: schema.batch.batchNo, expiryDate: schema.batch.expiryDate, mrpPaise: schema.batch.mrpPaise, purchaseRatePaise: schema.batch.purchaseRatePaise, qtyUnits: schema.batch.qtyUnits, status: schema.batch.status, gtin: schema.batch.gtin, supplierName: schema.supplier.name,
    }).from(schema.batch).leftJoin(schema.supplier, eq(schema.supplier.id, schema.batch.supplierId)).where(and(eq(schema.batch.status, 'active'), gt(schema.batch.qtyUnits, 0), gte(schema.batch.expiryDate, today))).all();
    const customers = app.db.select({ id: schema.customer.id, name: schema.customer.name, phone: schema.customer.phone, address: schema.customer.address, gstin: schema.customer.gstin, creditLimitPaise: schema.customer.creditLimitPaise, balancePaise: sql<number>`(select coalesce(sum(l.debit_paise) - sum(l.credit_paise), 0) from party_ledger l where l.party_type = 'customer' and l.party_id = "customer"."id")` }).from(schema.customer).where(eq(schema.customer.active, true)).all();
    const doctors = app.db.select({ id: schema.doctor.id, name: schema.doctor.name, regNo: schema.doctor.regNo, address: schema.doctor.address }).from(schema.doctor).where(eq(schema.doctor.active, true)).all();
    const duty = app.db.select({ userId: schema.dutyLog.userId, name: schema.user.name, regNo: schema.user.pharmacistRegNo }).from(schema.dutyLog).innerJoin(schema.user, eq(schema.user.id, schema.dutyLog.userId)).where(isNull(schema.dutyLog.offAt)).all();
    return { generatedAt: new Date().toISOString(), today, store: getStore(app.db), duty, items: items.map((i) => ({ ...i, salts: salts.filter((s) => s.itemId === i.id).map((s) => s.salt) })), batches, customers, doctors, rules: activeRules(app.db) };
  });

  app.get('/sync/status', { preHandler: app.requireAuth }, async () => {
    const offline = app.db.select({ n: sql<number>`count(*)`, last: sql<string | null>`max(${schema.sale.syncedAt})` }).from(schema.sale).where(eq(schema.sale.offline, true)).get()!;
    const negative = app.db.select({ n: sql<number>`count(*)` }).from(schema.batch).where(sql`${schema.batch.qtyUnits} < 0`).get()!.n;
    const recent = app.db.select({ id: schema.sale.id, invoiceNo: schema.sale.invoiceNo, totalPaise: schema.sale.totalPaise, clientPostedAt: schema.sale.clientPostedAt, syncedAt: schema.sale.syncedAt, counter: schema.sale.counter }).from(schema.sale).where(eq(schema.sale.offline, true)).orderBy(desc(schema.sale.id)).limit(20).all();
    return { offlineBills: offline.n, lastSyncedAt: offline.last, negativeStockBatches: negative, recent };
  });

  /** Last offline sequence the server holds for a counter in a financial year, so a reset device can continue the series. */
  app.get('/sync/series', { schema: { querystring: z.object({ counter: z.string().min(1).max(10), fy: z.string().regex(/^\d{4}-\d{2}$/) }) }, preHandler: app.requireAuth }, async (req) => {
    const prefix = `INV-${req.query.counter.toUpperCase()}/${req.query.fy}/`;
    const row = app.db.select({ last: sql<string | null>`max(${schema.sale.invoiceNo})` }).from(schema.sale).where(and(eq(schema.sale.branchId, 1), sql`${schema.sale.invoiceNo} like ${prefix + '%'}`)).get();
    const seq = row?.last ? Number(row.last.slice(prefix.length)) || 0 : 0;
    return { counter: req.query.counter.toUpperCase(), fy: req.query.fy, lastSeq: seq };
  });

  /** A device gave up on an offline bill; keep the trail on the server. */
  app.post('/sync/discarded', { schema: { body: z.object({ clientRef: z.string(), invoiceNo: z.string().optional(), reason: z.string().min(3), payload: z.unknown().optional(), error: z.string().optional() }) }, preHandler: app.requireAuth }, async (req) => {
    audit(app.db, req.ctx!, { entity: 'offline_sale', entityId: req.body.clientRef, action: 'discard', after: { invoiceNo: req.body.invoiceNo, error: req.body.error, payload: req.body.payload }, reason: req.body.reason });
    return { ok: true };
  });
};
