import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { classifyScan, type ScanResult } from '@pharma/shared';
import { schema, type DB } from '../db/index.js';
import { findItemByEan, getItem, searchItems } from './catalog.js';
import { batchesForItem, getBatch, type BatchRow } from './inventory.js';

export interface ScanResolution {
  scan: ScanResult;
  item: ReturnType<typeof getItem> | null;
  batch: BatchRow | null;
  batches: BatchRow[];
  suggestedBatchNo: string | null;
  suggestedExpiry: string | null;
  gtin: string | null;
  message: string;
}

export function resolveScan(db: DB, raw: string): ScanResolution {
  const scan = classifyScan(raw);
  const empty: ScanResolution = { scan, item: null, batch: null, batches: [], suggestedBatchNo: null, suggestedExpiry: null, gtin: null, message: '' };
  switch (scan.kind) {
    case 'internal_batch': {
      const batch = getBatch(db, scan.batchId);
      if (!batch) return { ...empty, message: 'Label code not found. The batch may have been removed.' };
      return { ...empty, item: getItem(db, batch.itemId), batch, batches: batchesForItem(db, batch.itemId), message: `${batch.itemName} batch ${batch.batchNo}` };
    }
    case 'internal_item': {
      const item = getItem(db, scan.itemId);
      if (!item) return { ...empty, message: 'Item code not found' };
      return { ...empty, item, batches: batchesForItem(db, item.id), message: item.name };
    }
    case 'gtin':
    case 'gs1': {
      const gtin = scan.gtin ?? null;
      let itemId: number | null = null;
      if (gtin) {
        const b = db.select({ itemId: schema.batch.itemId }).from(schema.batch).where(inArray(schema.batch.gtin, [gtin, gtin.replace(/^0+/, '')])).get();
        itemId = b?.itemId ?? findItemByEan(db, gtin)?.id ?? null;
      }
      if (!itemId) return { ...empty, gtin, suggestedBatchNo: scan.kind === 'gs1' ? scan.batch ?? null : null, suggestedExpiry: scan.kind === 'gs1' ? scan.expiry ?? null : null, message: gtin ? `Barcode ${gtin} is not linked to any item yet. Pick the item once and it will be remembered.` : 'Barcode not recognised' };
      const item = getItem(db, itemId);
      const batches = batchesForItem(db, itemId);
      let batch: BatchRow | null = null;
      if (scan.kind === 'gs1' && scan.batch) batch = batches.find((b) => b.batchNo.toLowerCase() === scan.batch!.toLowerCase()) ?? null;
      return { ...empty, item, batch, batches, gtin, suggestedBatchNo: scan.kind === 'gs1' ? scan.batch ?? null : null, suggestedExpiry: scan.kind === 'gs1' ? scan.expiry ?? null : null, message: batch ? `${item!.name} batch ${batch.batchNo}` : item!.name };
    }
    case 'text': {
      let item: ReturnType<typeof getItem> | null = null;
      if (scan.brand) {
        const r = searchItems(db, { q: scan.brand, mode: 'name', page: 1, pageSize: 1 });
        if (r.rows[0]) item = getItem(db, r.rows[0].id);
      }
      const batches = item ? batchesForItem(db, item.id) : [];
      const batch = item && scan.batch ? batches.find((b) => b.batchNo.toLowerCase() === scan.batch!.toLowerCase()) ?? null : null;
      return { ...empty, item, batch, batches, gtin: scan.gtin ?? null, suggestedBatchNo: scan.batch ?? null, suggestedExpiry: scan.expiry ?? null, message: item ? item.name : 'QR text read. Choose the item to continue.' };
    }
    default:
      return { ...empty, message: 'Code not recognised. Try searching by name.' };
  }
}

/** Remember a manufacturer barcode against an item (first-scan mapping). */
export function linkGtin(db: DB, itemId: number, gtin: string) {
  db.update(schema.item).set({ ean: gtin.replace(/\D/g, '') }).where(eq(schema.item.id, itemId)).run();
  return getItem(db, itemId);
}

export function activeBatchCount(db: DB, itemId: number) {
  return db.select({ n: sql<number>`count(*)` }).from(schema.batch).where(and(eq(schema.batch.itemId, itemId), gt(schema.batch.qtyUnits, 0))).get()!.n;
}
