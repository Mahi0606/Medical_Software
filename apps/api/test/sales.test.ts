import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { saleSchema, todayIST } from '@pharma/shared';
import { schema } from '../src/db/index.js';
import { getBatch } from '../src/services/inventory.js';
import { cancelSale, postSale, postSaleReturn, previewSale } from '../src/services/sales.js';
import { listRegister } from '../src/services/registers.js';
import { getCustomer } from '../src/services/parties.js';
import { seedItem, testDb } from './helpers.js';

const sale = (o: Record<string, unknown>) => saleSchema.parse({ clientRef: `ref-${Math.random()}`, ...o });

describe('billing', () => {
  it('posts a cash bill, decrements stock, numbers the invoice and is idempotent', () => {
    const t = testDb();
    const { batchId } = seedItem(t.db, t.owner, { name: 'Dolo 650', generic: 'Paracetamol 650 mg', mrp: 3000, rate: 2000, packs: 10, unitsPerPack: 15, supplierId: t.supplierId });
    const input = sale({ lines: [{ batchId, unitMode: 'pack', qty: 2 }], payments: [{ mode: 'cash', amountPaise: 10000 }] });
    const r = postSale(t.db, t.owner, input, null);
    expect(r.invoiceNo).toBe(`INV/${r.fy}/00001`);
    expect(r.totalPaise).toBe(6000);
    expect(r.changePaise).toBe(4000);
    expect(r.paidPaise).toBe(6000);
    expect(getBatch(t.db, batchId)!.qtyUnits).toBe(150 - 30);
    const again = postSale(t.db, t.owner, input, null);
    expect(again.duplicate).toBe(true);
    expect(again.id).toBe(r.id);
    const ledger = t.db.select().from(schema.stockLedger).where(eq(schema.stockLedger.batchId, batchId)).all();
    expect(ledger.map((l) => l.qtyDelta)).toEqual([150, -30]);
  });

  it('back-calculates GST from inclusive MRP and rounds to the rupee', () => {
    const t = testDb();
    const { batchId } = seedItem(t.db, t.owner, { name: 'Pan 40', generic: 'Pantoprazole 40 mg', mrp: 16500, rate: 11800, packs: 5, unitsPerPack: 15, gst: 12, supplierId: t.supplierId });
    const p = previewSale(t.db, t.owner, sale({ lines: [{ batchId, unitMode: 'unit', qty: 7 }] }), null); // loose 7 tabs at 1100 each = 7700
    expect(p.lines[0]!.unitPricePaise).toBe(1100);
    expect(p.grossPaise).toBe(7700);
    expect(p.taxablePaise + p.cgstPaise + p.sgstPaise).toBe(7700);
    expect(p.totalPaise).toBe(7700);
    expect(p.kind).toBe('TAX_INVOICE');
  });

  it('blocks Schedule H1 without prescriber registration or pharmacist, then writes the H1 register', () => {
    const t = testDb();
    const { batchId } = seedItem(t.db, t.owner, { name: 'Azithral', generic: 'Azithromycin 500 mg', schedule: 'H1', mrp: 11900, rate: 8500, packs: 3, unitsPerPack: 5, supplierId: t.supplierId });
    const rx = { doctorName: 'Dr A', doctorRegNo: 'MMC/1', patientName: 'P', patientAddress: 'Pune' };
    expect(() => postSale(t.db, t.owner, sale({ lines: [{ batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'upi', amountPaise: 11900 }], rx }), null)).toThrow(/pharmacist/i);
    expect(() => postSale(t.db, t.owner, sale({ lines: [{ batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'upi', amountPaise: 11900 }], rx: { ...rx, doctorRegNo: null } }), t.duty)).toThrow(/registration number/i);
    const r = postSale(t.db, t.owner, sale({ lines: [{ batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'upi', amountPaise: 11900 }], rx }), t.duty);
    expect(r.pharmacistUserId).toBe(t.pharmacistId);
    const reg = listRegister(t.db, { register: 'H1', page: 1, pageSize: 10 });
    expect(reg.total).toBe(1);
    expect(reg.rows[0]).toMatchObject({ serialNo: 1, doctorRegNo: 'MMC/1', patientName: 'P', qtyText: '1 strip', pharmacistRegNo: 'RP-2', batchNo: 'B1' });
    expect(listRegister(t.db, { register: 'RX', page: 1, pageSize: 10 }).total).toBe(0);
  });

  it('refuses expired stock, sale above MRP and over-cap discounts for clerks', () => {
    const t = testDb();
    const { batchId } = seedItem(t.db, t.owner, { name: 'Old', generic: 'X 1 mg', mrp: 1000, rate: 500, packs: 2, expiryDays: -1, supplierId: t.supplierId });
    expect(() => previewSale(t.db, t.owner, sale({ lines: [{ batchId, unitMode: 'pack', qty: 1 }] }), null)).toThrow(/expired/i);
    const ok = seedItem(t.db, t.owner, { name: 'Fresh', generic: 'Y 1 mg', mrp: 1000, rate: 500, packs: 2, supplierId: t.supplierId });
    expect(() => previewSale(t.db, t.owner, sale({ lines: [{ batchId: ok.batchId, unitMode: 'pack', qty: 1, unitPricePaise: 1100, priceReason: 'x' }] }), null)).toThrow(/MRP/);
    expect(() => previewSale(t.db, t.clerk, sale({ lines: [{ batchId: ok.batchId, unitMode: 'pack', qty: 1, discountPct: 15 }] }), null)).toThrow(/limit of 10%/);
    expect(() => previewSale(t.db, t.owner, sale({ lines: [{ batchId: ok.batchId, unitMode: 'pack', qty: 3 }] }), null)).toThrow(/available/);
  });

  it('records credit to the customer ledger and reverses it on cancel', () => {
    const t = testDb();
    const { batchId } = seedItem(t.db, t.owner, { name: 'Item', generic: 'Z 1 mg', mrp: 10000, rate: 5000, packs: 5, supplierId: t.supplierId });
    expect(() => postSale(t.db, t.owner, sale({ lines: [{ batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 4000 }] }), null)).toThrow(/unpaid/i);
    const r = postSale(t.db, t.owner, sale({ customerId: t.customerId, lines: [{ batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 4000 }] }), null);
    expect(r.creditPaise).toBe(6000);
    expect(getCustomer(t.db, t.customerId).balancePaise).toBe(6000);
    cancelSale(t.db, t.owner, r.id, 'test');
    expect(getCustomer(t.db, t.customerId).balancePaise).toBe(0);
    expect(getBatch(t.db, batchId)!.qtyUnits).toBe(50);
    expect(() => t.sqlite.prepare('delete from sale where id = ?').run(r.id)).toThrow(/cannot be deleted/);
  });

  it('issues a proportional credit note on partial return', () => {
    const t = testDb();
    const { batchId } = seedItem(t.db, t.owner, { name: 'Item', generic: 'Z 1 mg', mrp: 10000, rate: 5000, packs: 5, supplierId: t.supplierId });
    const r = postSale(t.db, t.owner, sale({ lines: [{ batchId, unitMode: 'pack', qty: 2 }], payments: [{ mode: 'cash', amountPaise: 20000 }] }), null);
    const cn = postSaleReturn(t.db, t.owner, { saleId: r.id, reason: 'unopened', refundMode: 'cash', date: todayIST(), lines: [{ saleLineId: r.lines[0]!.id, qtyUnits: 10 }] });
    expect(cn.creditNoteNo).toMatch(/^CN\//);
    expect(cn.totalPaise).toBe(10000);
    expect(getBatch(t.db, batchId)!.qtyUnits).toBe(40);
    expect(() => postSaleReturn(t.db, t.owner, { saleId: r.id, reason: 'x', refundMode: 'cash', date: todayIST(), lines: [{ saleLineId: r.lines[0]!.id, qtyUnits: 11 }] })).toThrow(/can still be returned/);
  });
});
