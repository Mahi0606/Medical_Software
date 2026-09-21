import { describe, expect, it } from 'vitest';
import { saleSchema } from '@pharma/shared';
import { getBatch } from '../src/services/inventory.js';
import { postSale } from '../src/services/sales.js';
import { checkForBill } from '../src/services/interactions.js';
import { insertItem, parseGenericString } from '../src/services/catalog.js';
import { seedItem, testDb } from './helpers.js';

describe('offline sync posting', () => {
  it('keeps the device invoice number, allows negative stock with a warning, and rejects a duplicate number', () => {
    const t = testDb();
    const { batchId } = seedItem(t.db, t.owner, { name: 'Dolo 650', generic: 'Paracetamol 650 mg', mrp: 3000, rate: 2000, packs: 1, unitsPerPack: 15, supplierId: t.supplierId });
    const offline = { invoiceNo: 'INV-C2/2026-27/00001', postedAt: '2026-09-18T10:00:00.000Z', counter: 'C2', pharmacistUserId: null };
    const r = postSale(t.db, t.owner, saleSchema.parse({ clientRef: 'offline-ref-0001', lines: [{ batchId, unitMode: 'pack', qty: 2 }], payments: [{ mode: 'cash', amountPaise: 6000 }], offline, refillDays: 10 }), null);
    expect(r.invoiceNo).toBe('INV-C2/2026-27/00001');
    expect(r.offline).toBe(true);
    expect(r.date).toBe('2026-09-18');
    expect(r.refillDueDate).toBe('2026-09-28');
    expect(getBatch(t.db, batchId)!.qtyUnits).toBe(-15);
    expect(r.warnings.some((w) => /negative/.test(w.message))).toBe(true);
    expect(() => postSale(t.db, t.owner, saleSchema.parse({ clientRef: 'offline-ref-0002', lines: [{ batchId, unitMode: 'unit', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 200 }], offline }), null)).toThrow(/already exists/);
    // Online numbering continues independently (a different item: the first batch is now negative and stays blocked online)
    const other = seedItem(t.db, t.owner, { name: 'Crocin', generic: 'Paracetamol 500 mg', mrp: 3000, rate: 2000, packs: 2, unitsPerPack: 15, supplierId: t.supplierId, batchNo: 'B2' });
    expect(() => postSale(t.db, t.owner, saleSchema.parse({ clientRef: 'online-ref-0000', lines: [{ batchId, unitMode: 'unit', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 200 }] }), null)).toThrow(/available/);
    const online = postSale(t.db, t.owner, saleSchema.parse({ clientRef: 'online-ref-0001', lines: [{ batchId: other.batchId, unitMode: 'unit', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 200 }] }), null);
    expect(online.invoiceNo).toMatch(/^INV\/\d{4}-\d{2}\/00001$/);
  });

  it('checks the cart against the customer history and records the override reason', () => {
    const t = testDb();
    const warf = seedItem(t.db, t.owner, { name: 'Warf 5', generic: 'Warfarin 5 mg', schedule: 'H', mrp: 5000, rate: 3000, packs: 5, supplierId: t.supplierId });
    const cipro = seedItem(t.db, t.owner, { name: 'Ciplox 500', generic: 'Ciprofloxacin 500 mg', schedule: 'H', mrp: 4300, rate: 3100, packs: 5, supplierId: t.supplierId });
    const rx = { doctorName: 'Dr A', patientName: 'P' };
    postSale(t.db, t.owner, saleSchema.parse({ clientRef: 'history-ref-0001', customerId: t.customerId, lines: [{ batchId: warf.batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 5000 }], rx }), t.duty);
    const check = checkForBill(t.db, [cipro.itemId], t.customerId, 30);
    expect(check.hasMajor).toBe(true);
    expect(check.historyCount).toBe(1);
    expect(check.findings[0]).toMatchObject({ kind: 'interaction', severity: 'major' });
    const r = postSale(t.db, t.owner, saleSchema.parse({ clientRef: 'history-ref-0002', customerId: t.customerId, lines: [{ batchId: cipro.batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 4300 }], rx, interactionOverride: 'Prescriber confirmed; INR check booked' }), t.duty);
    expect(r.interactionOverride).toBe('Prescriber confirmed; INR check booked');
    expect(insertItem).toBeTypeOf('function'); expect(parseGenericString('x')).toBeTruthy();
  });
});
