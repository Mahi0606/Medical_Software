import { describe, expect, it } from 'vitest';
import { addDays, todayIST } from '@pharma/shared';
import { getBatch } from '../src/services/inventory.js';
import { getSupplier } from '../src/services/parties.js';
import { cancelPurchase, postPurchase, postPurchaseReturn, previewPurchase } from '../src/services/purchase.js';
import { insertItem, parseGenericString } from '../src/services/catalog.js';
import { testDb } from './helpers.js';

describe('purchases', () => {
  it('computes scheme-weighted cost, GST and warnings, then posts stock and supplier ledger', () => {
    const t = testDb();
    const itemId = insertItem(t.db, { name: 'Dolo 650', form: 'tablet', manufacturer: 'Micro', salts: parseGenericString('Paracetamol 650 mg'), hsn: '3004', gstRatePct: 5, schedule: 'NONE', scheduleEffectiveFrom: null, baseUnit: 'tablet', unitsPerPack: 15, packName: 'strip', packsPerBox: null, allowLoose: true, rack: null, minStockUnits: 0, maxStockUnits: 0, reorderQtyPacks: 0, ean: null, coldChain: false, notForSale: false, narcotic: false, active: true, notes: null });
    const input = { supplierId: t.supplierId, invoiceNo: 'D/1', invoiceDate: todayIST(), receivedDate: todayIST(), interstate: false, otherChargesPaise: 0, notes: null, printLabels: false,
      lines: [{ itemId, batchNo: 'X1', expiryDate: addDays(todayIST(), 40), qtyPacks: 10, freePacks: 1, ratePaise: 2400, discountPct: 10, mrpPaise: 3360, gstRatePct: 5, hsn: '3004', mfgDate: null, schemeNote: '10+1', gtin: null }] };
    const p = previewPurchase(t.db, input);
    const l = p.lines[0]!;
    expect(l.grossPaise).toBe(24000);
    expect(l.discountPaise).toBe(2400);
    expect(l.taxablePaise).toBe(21600);
    expect(l.cgstPaise + l.sgstPaise).toBe(1080);
    expect(l.unitsReceived).toBe(165);
    expect(l.effectiveCostPerPackPaise).toBe(Math.round(21600 / 11));
    expect(p.totalPaise).toBe(22700); // 22680 rounded to rupee
    expect(p.roundOffPaise).toBe(20);
    expect(p.warnings.some((w) => /expires in 40 days/.test(w.message))).toBe(true);
    const r = postPurchase(t.db, t.owner, input);
    expect(r.grnNo).toMatch(/^GRN\//);
    const b = getBatch(t.db, r.batches[0]!.batchId)!;
    expect(b.qtyUnits).toBe(165);
    expect(b.purchaseRatePaise).toBe(1964);
    expect(getSupplier(t.db, t.supplierId).balancePaise).toBe(22700);
    expect(() => postPurchase(t.db, t.owner, input)).toThrow(/already entered/);
  });

  it('returns expired stock to the supplier with ITC reversal and blocks cancel when stock is gone', () => {
    const t = testDb();
    const itemId = insertItem(t.db, { name: 'Amox', form: 'capsule', manufacturer: 'M', salts: parseGenericString('Amoxicillin 500 mg'), hsn: '3004', gstRatePct: 12, schedule: 'H', scheduleEffectiveFrom: null, baseUnit: 'capsule', unitsPerPack: 10, packName: 'strip', packsPerBox: null, allowLoose: true, rack: null, minStockUnits: 0, maxStockUnits: 0, reorderQtyPacks: 0, ean: null, coldChain: false, notForSale: false, narcotic: false, active: true, notes: null });
    const r = postPurchase(t.db, t.owner, { supplierId: t.supplierId, invoiceNo: 'D/2', invoiceDate: todayIST(), receivedDate: todayIST(), interstate: false, otherChargesPaise: 0, notes: null, printLabels: false, lines: [{ itemId, batchNo: 'A1', expiryDate: addDays(todayIST(), 10), qtyPacks: 5, freePacks: 0, ratePaise: 5000, discountPct: 0, mrpPaise: 7000, gstRatePct: 12, hsn: '3004', mfgDate: null, schemeNote: null, gtin: null }] });
    const batchId = r.batches[0]!.batchId;
    const pr = postPurchaseReturn(t.db, t.owner, { supplierId: t.supplierId, date: todayIST(), route: 'credit_note', supplierRef: null, notes: null, lines: [{ batchId, qtyUnits: 20, reason: 'near_expiry' }] });
    expect(pr.taxablePaise).toBe(10000);
    expect(pr.itcReversalPaise).toBe(1200);
    expect(pr.totalPaise).toBe(11200);
    expect(getBatch(t.db, batchId)!.qtyUnits).toBe(30);
    expect(getSupplier(t.db, t.supplierId).balancePaise).toBe(28000 - 11200);
    expect(() => cancelPurchase(t.db, t.owner, r.id, 'oops')).toThrow(/remain/);
    const pr2 = postPurchaseReturn(t.db, t.owner, { supplierId: t.supplierId, date: todayIST(), route: 'supply_invoice', supplierRef: null, notes: null, lines: [{ batchId, qtyUnits: 30, reason: 'excess' }] });
    expect(pr2.itcReversalPaise).toBe(0);
    expect(pr2.cgstPaise + pr2.sgstPaise).toBe(1800);
  });
});
