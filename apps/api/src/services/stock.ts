import { eq, sql } from 'drizzle-orm';
import type { StockReason } from '@pharma/shared';
import { schema, type Tx } from '../db/index.js';
import { blocked, notFound } from '../lib/errors.js';

export interface StockMove {
  batchId: number;
  qtyDelta: number;
  reason: StockReason;
  docType?: string | null;
  docId?: number | null;
  userId: number;
  note?: string | null;
  allowNegative?: boolean;
}

/** Applies a stock movement: updates the cached batch balance and appends a ledger row. */
export function moveStock(tx: Tx, m: StockMove): { balanceAfter: number } {
  const b = tx.select({ id: schema.batch.id, itemId: schema.batch.itemId, branchId: schema.batch.branchId, qty: schema.batch.qtyUnits, status: schema.batch.status })
    .from(schema.batch).where(eq(schema.batch.id, m.batchId)).get();
  if (!b) throw notFound('Batch not found');
  const balanceAfter = b.qty + m.qtyDelta;
  if (balanceAfter < 0 && !m.allowNegative) {
    throw blocked(`Only ${b.qty} units available in this batch`, { batchId: m.batchId, available: b.qty, requested: -m.qtyDelta });
  }
  tx.update(schema.batch).set({ qtyUnits: balanceAfter, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` }).where(eq(schema.batch.id, m.batchId)).run();
  tx.insert(schema.stockLedger).values({
    branchId: b.branchId,
    itemId: b.itemId,
    batchId: m.batchId,
    qtyDelta: m.qtyDelta,
    balanceAfter,
    reason: m.reason,
    docType: m.docType ?? null,
    docId: m.docId ?? null,
    userId: m.userId,
    note: m.note ?? null,
  }).run();
  return { balanceAfter };
}
