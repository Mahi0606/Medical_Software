import { and, asc, desc, eq, gt, gte, lt, lte, sql } from 'drizzle-orm';
import { addDays, todayIST, type BatchInput, type StockAdjustmentInput } from '@pharma/shared';
import { schema, type DB, type Tx } from '../db/index.js';
import { audit } from '../lib/audit.js';
import type { Ctx } from '../lib/ctx.js';
import { blocked, notFound } from '../lib/errors.js';
import { moveStock } from './stock.js';

export const batchSelect = {
  id: schema.batch.id, itemId: schema.batch.itemId, batchNo: schema.batch.batchNo, mfgDate: schema.batch.mfgDate, expiryDate: schema.batch.expiryDate,
  mrpPaise: schema.batch.mrpPaise, purchaseRatePaise: schema.batch.purchaseRatePaise, supplierId: schema.batch.supplierId, gtin: schema.batch.gtin,
  status: schema.batch.status, qtyUnits: schema.batch.qtyUnits, createdAt: schema.batch.createdAt,
  itemName: schema.item.name, genericText: schema.item.genericText, unitsPerPack: schema.item.unitsPerPack, packName: schema.item.packName, baseUnit: schema.item.baseUnit,
  allowLoose: schema.item.allowLoose, rack: schema.item.rack, schedule: schema.item.schedule, gstRatePct: schema.item.gstRatePct, hsn: schema.item.hsn, notForSale: schema.item.notForSale,
  manufacturer: schema.manufacturer.name, supplierName: schema.supplier.name,
};

export type BatchRow = {
  [K in keyof typeof batchSelect]: (typeof batchSelect)[K] extends { _: { data: infer T } } ? T : never;
};

function baseQuery(db: DB) {
  return db.select(batchSelect).from(schema.batch)
    .innerJoin(schema.item, eq(schema.item.id, schema.batch.itemId))
    .leftJoin(schema.manufacturer, eq(schema.manufacturer.id, schema.item.manufacturerId))
    .leftJoin(schema.supplier, eq(schema.supplier.id, schema.batch.supplierId));
}

/** FEFO batch list for one item (billing picker). */
export function batchesForItem(db: DB, itemId: number, includeEmpty = false) {
  const conds = [eq(schema.batch.itemId, itemId), eq(schema.batch.status, 'active')];
  if (!includeEmpty) conds.push(gt(schema.batch.qtyUnits, 0));
  return baseQuery(db).where(and(...conds)).orderBy(asc(schema.batch.expiryDate), asc(schema.batch.id)).all() as BatchRow[];
}

export function getBatch(db: DB, id: number): BatchRow | null {
  return (baseQuery(db).where(eq(schema.batch.id, id)).get() as BatchRow | undefined) ?? null;
}

export interface BatchFilter {
  itemId?: number; status?: 'active' | 'quarantined' | 'returned' | 'disposed'; supplierId?: number;
  expiringWithinDays?: number; expired?: boolean; inStock?: boolean; q?: string; page: number; pageSize: number;
}

export function listBatches(db: DB, f: BatchFilter) {
  const today = todayIST();
  const conds = [];
  if (f.itemId) conds.push(eq(schema.batch.itemId, f.itemId));
  if (f.status) conds.push(eq(schema.batch.status, f.status));
  if (f.supplierId) conds.push(eq(schema.batch.supplierId, f.supplierId));
  if (f.expired) conds.push(lt(schema.batch.expiryDate, today));
  if (f.expiringWithinDays !== undefined) conds.push(and(gte(schema.batch.expiryDate, today), lte(schema.batch.expiryDate, addDays(today, f.expiringWithinDays))));
  if (f.inStock !== false) conds.push(gt(schema.batch.qtyUnits, 0));
  if (f.q) {
    const t = `%${f.q.toLowerCase()}%`;
    conds.push(sql`(${schema.item.nameNorm} like ${t} or lower(${schema.batch.batchNo}) like ${t})`);
  }
  const where = conds.length ? and(...conds) : undefined;
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.batch).innerJoin(schema.item, eq(schema.item.id, schema.batch.itemId)).where(where).get()!.n;
  const rows = baseQuery(db).where(where).orderBy(asc(schema.batch.expiryDate), asc(schema.item.nameNorm)).limit(f.pageSize).offset((f.page - 1) * f.pageSize).all() as BatchRow[];
  return { rows, total, page: f.page, pageSize: f.pageSize };
}

/** Find or create a batch for a receipt line. Same item + batch no + expiry + MRP → same batch. */
export function upsertBatch(tx: Tx | DB, input: BatchInput & { branchId?: number }): number {
  const existing = tx.select({ id: schema.batch.id }).from(schema.batch).where(and(
    eq(schema.batch.branchId, input.branchId ?? 1), eq(schema.batch.itemId, input.itemId), eq(schema.batch.batchNo, input.batchNo.trim()),
    eq(schema.batch.expiryDate, input.expiryDate), eq(schema.batch.mrpPaise, input.mrpPaise),
  )).get();
  if (existing) {
    tx.update(schema.batch).set({ purchaseRatePaise: input.purchaseRatePaise ?? 0, supplierId: input.supplierId ?? null, mfgDate: input.mfgDate ?? null, gtin: input.gtin ?? null, status: 'active' }).where(eq(schema.batch.id, existing.id)).run();
    return existing.id;
  }
  return tx.insert(schema.batch).values({
    branchId: input.branchId ?? 1, itemId: input.itemId, batchNo: input.batchNo.trim(), mfgDate: input.mfgDate ?? null, expiryDate: input.expiryDate,
    mrpPaise: input.mrpPaise, purchaseRatePaise: input.purchaseRatePaise ?? 0, supplierId: input.supplierId ?? null, gtin: input.gtin ?? null, status: 'active', qtyUnits: 0,
  }).returning({ id: schema.batch.id }).get().id;
}

export function adjustStock(db: DB, ctx: Ctx, input: StockAdjustmentInput) {
  return db.transaction((tx) => {
    const b = getBatch(tx as unknown as DB, input.batchId);
    if (!b) throw notFound('Batch not found');
    const { balanceAfter } = moveStock(tx, { batchId: input.batchId, qtyDelta: input.qtyDeltaUnits, reason: input.reason, docType: 'ADJ', userId: ctx.userId, note: input.note });
    audit(tx, ctx, { entity: 'batch', entityId: input.batchId, action: 'adjust', before: { qtyUnits: b.qtyUnits }, after: { qtyUnits: balanceAfter }, reason: input.note });
    return getBatch(tx as unknown as DB, input.batchId)!;
  });
}

/** Opening stock: creates the batch and books the units in one step. */
export function addOpeningStock(db: DB, ctx: Ctx, rows: (BatchInput & { qtyUnits: number })[]) {
  return db.transaction((tx) => {
    const ids: number[] = [];
    for (const r of rows) {
      const batchId = upsertBatch(tx, r);
      moveStock(tx, { batchId, qtyDelta: r.qtyUnits, reason: 'opening', docType: 'OPEN', userId: ctx.userId, note: 'Opening stock' });
      ids.push(batchId);
    }
    audit(tx, ctx, { entity: 'batch', entityId: null, action: 'opening', after: { count: rows.length } });
    return ids;
  });
}

export function setBatchStatus(db: DB, ctx: Ctx, batchId: number, status: 'active' | 'quarantined' | 'disposed', note: string | null) {
  return db.transaction((tx) => {
    const b = getBatch(tx as unknown as DB, batchId);
    if (!b) throw notFound('Batch not found');
    if (b.status === 'returned') throw blocked('This batch was returned to the supplier and cannot be changed');
    if (status === 'disposed') {
      if (b.qtyUnits > 0) moveStock(tx, { batchId, qtyDelta: -b.qtyUnits, reason: 'disposal', docType: 'DISP', userId: ctx.userId, note: note ?? 'Disposed' });
    }
    tx.update(schema.batch).set({ status, updatedAt: new Date().toISOString() }).where(eq(schema.batch.id, batchId)).run();
    audit(tx, ctx, { entity: 'batch', entityId: batchId, action: status, before: { status: b.status }, after: { status }, reason: note });
    return getBatch(tx as unknown as DB, batchId)!;
  });
}

export function updateBatchDetails(db: DB, ctx: Ctx, batchId: number, patch: { expiryDate?: string; mrpPaise?: number; batchNo?: string; mfgDate?: string | null; gtin?: string | null }, reason: string) {
  return db.transaction((tx) => {
    const b = getBatch(tx as unknown as DB, batchId);
    if (!b) throw notFound('Batch not found');
    tx.update(schema.batch).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(schema.batch.id, batchId)).run();
    audit(tx, ctx, { entity: 'batch', entityId: batchId, action: 'update', before: { expiryDate: b.expiryDate, mrpPaise: b.mrpPaise, batchNo: b.batchNo, mfgDate: b.mfgDate }, after: patch, reason });
    return getBatch(tx as unknown as DB, batchId)!;
  });
}

export function ledgerFor(db: DB, f: { batchId?: number; itemId?: number; limit?: number }) {
  const conds = [];
  if (f.batchId) conds.push(eq(schema.stockLedger.batchId, f.batchId));
  if (f.itemId) conds.push(eq(schema.stockLedger.itemId, f.itemId));
  return db.select({
    id: schema.stockLedger.id, createdAt: schema.stockLedger.createdAt, batchId: schema.stockLedger.batchId, batchNo: schema.batch.batchNo, itemName: schema.item.name,
    qtyDelta: schema.stockLedger.qtyDelta, balanceAfter: schema.stockLedger.balanceAfter, reason: schema.stockLedger.reason, docType: schema.stockLedger.docType, docId: schema.stockLedger.docId,
    note: schema.stockLedger.note, userName: schema.user.name,
  }).from(schema.stockLedger)
    .innerJoin(schema.batch, eq(schema.batch.id, schema.stockLedger.batchId))
    .innerJoin(schema.item, eq(schema.item.id, schema.stockLedger.itemId))
    .leftJoin(schema.user, eq(schema.user.id, schema.stockLedger.userId))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.stockLedger.id)).limit(f.limit ?? 200).all();
}
