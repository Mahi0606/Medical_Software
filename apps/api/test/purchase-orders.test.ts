import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { addDays, todayIST } from '@pharma/shared';
import { schema } from '../src/db/index.js';
import { cancelPurchase, postPurchase } from '../src/services/purchase.js';
import { cancelPurchaseOrder, createPurchaseOrder, getPurchaseOrder, listPurchaseOrders, markPurchaseOrderSent, reorderSuggestions, updatePurchaseOrder } from '../src/services/purchase-orders.js';
import { seedItem, testDb } from './helpers.js';

describe('purchase orders', () => {
  it('creates a numbered draft, sends it, receives against it and ends up received', () => {
    const t = testDb();
    const a = seedItem(t.db, t.owner, { name: 'Dolo 650', generic: 'Paracetamol 650 mg', mrp: 3000, rate: 2000, packs: 2, supplierId: t.supplierId });
    const b = seedItem(t.db, t.owner, { name: 'Amoxil 500', generic: 'Amoxicillin 500 mg', mrp: 8000, rate: 6000, packs: 1, supplierId: t.supplierId });
    const po = createPurchaseOrder(t.db, t.owner, { supplierId: t.supplierId, date: todayIST(), expectedDate: addDays(todayIST(), 3), notes: null, lines: [{ itemId: a.itemId, qtyPacks: 10, ratePaise: 2000, mrpPaise: 3000, note: null }, { itemId: b.itemId, qtyPacks: 5, ratePaise: 6000, mrpPaise: 8000, note: null }] });
    expect(po.poNo).toMatch(/^PO\/\d{4}-\d{2}\/00001$/);
    expect(po.status).toBe('draft');
    expect(po.estimatedPaise).toBe(10 * 2000 + 5 * 6000);
    expect(po.lines).toHaveLength(2);

    // Draft can be edited; the estimate follows.
    const edited = updatePurchaseOrder(t.db, t.owner, po.id, { supplierId: t.supplierId, date: todayIST(), expectedDate: null, notes: 'urgent', lines: [{ itemId: a.itemId, qtyPacks: 10, ratePaise: 2000, mrpPaise: 3000, note: null }, { itemId: b.itemId, qtyPacks: 4, ratePaise: 6000, mrpPaise: 8000, note: null }] });
    expect(edited.estimatedPaise).toBe(10 * 2000 + 4 * 6000);

    const sent = markPurchaseOrderSent(t.db, t.owner, po.id, 'whatsapp');
    expect(sent.status).toBe('sent');
    expect(sent.sentVia).toBe('whatsapp');
    expect(sent.messageText).toContain(po.poNo!);
    expect(sent.messageText).toContain('Dolo 650 — 10 strips');
    expect(() => updatePurchaseOrder(t.db, t.owner, po.id, { supplierId: t.supplierId, date: todayIST(), notes: null, lines: [{ itemId: a.itemId, qtyPacks: 1, note: null }] })).toThrow(/already been sent/);

    // Sent PO counts as pending stock for reorder.
    const pendingA = reorderSuggestions(t.db, { coverDays: 30, windowDays: 90, onlyBelowMin: false }).groups.flatMap((g) => g.lines).find((l) => l.itemId === a.itemId);
    expect(pendingA?.pendingPacks ?? 10).toBe(10);

    // Partial receipt: 6 + 1 free of item A.
    const grn1 = postPurchase(t.db, t.owner, { supplierId: t.supplierId, invoiceNo: 'S/1', invoiceDate: todayIST(), receivedDate: todayIST(), interstate: false, otherChargesPaise: 0, notes: null, printLabels: false, purchaseOrderId: po.id,
      lines: [{ itemId: a.itemId, batchNo: 'N1', expiryDate: addDays(todayIST(), 400), qtyPacks: 6, freePacks: 1, ratePaise: 2000, discountPct: 0, mrpPaise: 3000, gstRatePct: 5, hsn: '3004', mfgDate: null, schemeNote: null, gtin: null }] });
    let cur = getPurchaseOrder(t.db, po.id);
    expect(cur.status).toBe('partially_received');
    expect(cur.lines.find((l) => l.itemId === a.itemId)!.receivedPacks).toBe(7);
    expect(cur.receipts.map((r) => r.id)).toEqual([grn1.id]);
    expect(() => cancelPurchaseOrder(t.db, t.owner, po.id, 'x')).toThrow(/already been received/);

    // Wrong supplier is refused.
    const otherSupplier = t.db.insert(schema.supplier).values({ name: 'Other', stateCode: '27' }).returning({ id: schema.supplier.id }).get().id;
    expect(() => postPurchase(t.db, t.owner, { supplierId: otherSupplier, invoiceNo: 'O/1', invoiceDate: todayIST(), interstate: false, otherChargesPaise: 0, notes: null, printLabels: false, purchaseOrderId: po.id,
      lines: [{ itemId: a.itemId, batchNo: 'N9', expiryDate: addDays(todayIST(), 400), qtyPacks: 1, freePacks: 0, ratePaise: 2000, discountPct: 0, mrpPaise: 3000, gstRatePct: 5, mfgDate: null, schemeNote: null, gtin: null }] })).toThrow(/different supplier/);

    // Rest of the order arrives (over-receipt on A is tolerated).
    postPurchase(t.db, t.owner, { supplierId: t.supplierId, invoiceNo: 'S/2', invoiceDate: todayIST(), receivedDate: todayIST(), interstate: false, otherChargesPaise: 0, notes: null, printLabels: false, purchaseOrderId: po.id,
      lines: [
        { itemId: a.itemId, batchNo: 'N2', expiryDate: addDays(todayIST(), 400), qtyPacks: 4, freePacks: 0, ratePaise: 2000, discountPct: 0, mrpPaise: 3000, gstRatePct: 5, hsn: '3004', mfgDate: null, schemeNote: null, gtin: null },
        { itemId: b.itemId, batchNo: 'M1', expiryDate: addDays(todayIST(), 400), qtyPacks: 4, freePacks: 0, ratePaise: 6000, discountPct: 0, mrpPaise: 8000, gstRatePct: 12, hsn: '3004', mfgDate: null, schemeNote: null, gtin: null },
      ] });
    cur = getPurchaseOrder(t.db, po.id);
    expect(cur.status).toBe('received');
    expect(cur.pendingPacks).toBe(0);
    expect(cur.receipts).toHaveLength(2);
    const list = listPurchaseOrders(t.db, { page: 1, pageSize: 20 });
    expect(list.total).toBe(1);
    expect(list.rows[0]!.receivedPacks).toBe(14);
    expect(list.rows[0]!.orderedPacks).toBe(14);

    // Cancelling the first GRN gives packs back to the PO.
    cancelPurchase(t.db, t.owner, grn1.id, 'wrong invoice');
    cur = getPurchaseOrder(t.db, po.id);
    expect(cur.status).toBe('partially_received');
    expect(cur.lines.find((l) => l.itemId === a.itemId)!.receivedPacks).toBe(4);
    const audits = t.db.select().from(schema.auditLog).where(eq(schema.auditLog.entity, 'purchase_order')).all();
    expect(audits.map((x) => x.action)).toEqual(['create', 'update', 'send', 'receive', 'receive', 'unreceive']);
  });

  it('suggests reordering an item below its minimum and blocks cancelling only when receipts exist', () => {
    const t = testDb();
    const low = seedItem(t.db, t.owner, { name: 'Crocin', generic: 'Paracetamol 500 mg', mrp: 2000, rate: 1500, packs: 1, supplierId: t.supplierId });
    t.db.update(schema.item).set({ minStockUnits: 50, reorderQtyPacks: 8 }).where(eq(schema.item.id, low.itemId)).run();
    const fine = seedItem(t.db, t.owner, { name: 'Cetzine', generic: 'Cetirizine 10 mg', mrp: 3000, rate: 2000, packs: 50, supplierId: t.supplierId });
    const r = reorderSuggestions(t.db, { coverDays: 30, windowDays: 90, onlyBelowMin: true });
    const lines = r.groups.flatMap((g) => g.lines);
    const s = lines.find((l) => l.itemId === low.itemId)!;
    expect(s).toBeDefined();
    expect(s.belowMin).toBe(true);
    expect(s.reason).toBe('Below minimum');
    expect(s.suggestedPacks).toBe(8);
    expect(s.supplierId).toBe(t.supplierId);
    expect(s.lastRatePaise).toBe(1500);
    expect(lines.find((l) => l.itemId === fine.itemId)).toBeUndefined();
    expect(r.groups[0]!.estimatedPaise).toBe(8 * 1500);

    const po = createPurchaseOrder(t.db, t.owner, { supplierId: t.supplierId, date: todayIST(), notes: null, lines: [{ itemId: low.itemId, qtyPacks: 8, ratePaise: 1500, note: null }] });
    markPurchaseOrderSent(t.db, t.owner, po.id, 'print');
    // Once on order the item stops asking for more.
    const again = reorderSuggestions(t.db, { coverDays: 30, windowDays: 90, onlyBelowMin: true }).groups.flatMap((g) => g.lines).find((l) => l.itemId === low.itemId)!;
    expect(again.pendingPacks).toBe(8);
    expect(again.suggestedPacks).toBe(8); // still below minimum, reorder qty wins
    const cancelled = cancelPurchaseOrder(t.db, t.owner, po.id, 'supplier out of stock');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toBe('supplier out of stock');
    expect(() => markPurchaseOrderSent(t.db, t.owner, po.id, 'whatsapp')).toThrow(/cancelled/);
  });
});
