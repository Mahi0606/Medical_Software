import { and, asc, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { addDays, formatDateIN, todayIST, type PurchaseOrderInput } from '@pharma/shared';
import { schema, type DB, type Tx } from '../db/index.js';
import { audit } from '../lib/audit.js';
import type { Ctx } from '../lib/ctx.js';
import { blocked, notFound } from '../lib/errors.js';
import { formatDocNo, nextSequence } from './sequence.js';
import { getStore } from './store.js';

export type PoStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';

// ---------- Reorder suggestions ----------
export interface ReorderLine {
  itemId: number; itemName: string; genericText: string; packName: string; baseUnit: string; unitsPerPack: number; rack: string | null;
  stockUnits: number; minStockUnits: number; maxStockUnits: number; reorderQtyPacks: number;
  soldUnits: number; velocityPerDay: number; daysOfCover: number | null; pendingPacks: number; suggestedPacks: number;
  lastRatePaise: number | null; mrpPaise: number | null; supplierId: number | null; supplierName: string | null;
  belowMin: boolean; reason: string; estimatedPaise: number;
}
export interface ReorderGroup { supplierId: number | null; supplierName: string; supplierPhone: string | null; lines: ReorderLine[]; estimatedPaise: number }

export function reorderSuggestions(db: DB, q: { coverDays: number; windowDays: number; supplierId?: number; onlyBelowMin: boolean }) {
  const today = todayIST();
  const since = addDays(today, -q.windowDays);
  const rows = db.select({
    id: schema.item.id, name: schema.item.name, genericText: schema.item.genericText, packName: schema.item.packName, baseUnit: schema.item.baseUnit, unitsPerPack: schema.item.unitsPerPack, rack: schema.item.rack,
    minStockUnits: schema.item.minStockUnits, maxStockUnits: schema.item.maxStockUnits, reorderQtyPacks: schema.item.reorderQtyPacks,
    stockUnits: sql<number>`(select coalesce(sum(b.qty_units),0) from batch b where b.item_id = "item"."id" and b.status = 'active' and b.expiry_date >= ${today})`,
    soldUnits: sql<number>`(select coalesce(sum(sl.qty_units - sl.returned_units),0) from sale_line sl join sale s on s.id = sl.sale_id where sl.item_id = "item"."id" and s.status = 'posted' and s.date >= ${since})`,
    pendingPacks: sql<number>`(select coalesce(sum(max(pol.qty_packs - pol.received_packs, 0)),0) from purchase_order_line pol join purchase_order po on po.id = pol.purchase_order_id where pol.item_id = "item"."id" and po.status in ('sent','partially_received'))`,
    lastBatchId: sql<number | null>`(select b.id from batch b where b.item_id = "item"."id" order by b.id desc limit 1)`,
  }).from(schema.item).where(and(eq(schema.item.active, true), eq(schema.item.notForSale, false))).orderBy(asc(schema.item.nameNorm)).all();

  // Last batch → last supplier, last purchase rate and MRP (one query for all items).
  const batchIds = rows.map((r) => r.lastBatchId).filter((x): x is number => x !== null);
  const lastBatches = new Map<number, { supplierId: number | null; supplierName: string | null; supplierPhone: string | null; rate: number; mrp: number }>();
  if (batchIds.length) {
    const bs = db.select({ id: schema.batch.id, supplierId: schema.batch.supplierId, supplierName: schema.supplier.name, supplierPhone: schema.supplier.phone, rate: schema.batch.purchaseRatePaise, mrp: schema.batch.mrpPaise })
      .from(schema.batch).leftJoin(schema.supplier, eq(schema.supplier.id, schema.batch.supplierId)).where(sql`${schema.batch.id} in (${sql.join(batchIds.map((i) => sql`${i}`), sql`, `)})`).all();
    for (const b of bs) lastBatches.set(b.id, { supplierId: b.supplierId, supplierName: b.supplierName, supplierPhone: b.supplierPhone, rate: b.rate, mrp: b.mrp });
  }

  const groups = new Map<number | null, ReorderGroup>();
  for (const r of rows) {
    const upp = Math.max(1, r.unitsPerPack);
    const last = r.lastBatchId !== null ? lastBatches.get(r.lastBatchId) : undefined;
    if (q.supplierId && last?.supplierId !== q.supplierId) continue;
    const velocity = r.soldUnits / q.windowDays;
    const daysOfCover = velocity > 0 ? Math.round((r.stockUnits / velocity) * 10) / 10 : null;
    const pendingUnits = r.pendingPacks * upp;
    const needUnits = velocity * q.coverDays - r.stockUnits - pendingUnits;
    let suggestedPacks = Math.ceil(Math.max(0, needUnits) / upp);
    const outOfStock = r.stockUnits <= 0;
    const belowMin = outOfStock || (r.minStockUnits > 0 && r.stockUnits <= r.minStockUnits);
    if (belowMin && suggestedPacks < r.reorderQtyPacks) suggestedPacks = r.reorderQtyPacks;
    if (!(belowMin || (!q.onlyBelowMin && suggestedPacks > 0))) continue;
    const reason = suggestedPacks === 0 && r.pendingPacks > 0 ? `${r.pendingPacks} ${r.pendingPacks === 1 ? 'pack' : 'packs'} already on order` : outOfStock ? 'Out of stock' : belowMin ? 'Below minimum' : velocity === 0 ? 'No sales in window' : daysOfCover !== null && daysOfCover < q.coverDays ? `Runs out in ${Math.floor(daysOfCover)} ${Math.floor(daysOfCover) === 1 ? 'day' : 'days'}` : `Enough for ${Math.floor(daysOfCover ?? 0)} days`;
    const lastRatePaise = last?.rate ?? null;
    const line: ReorderLine = {
      itemId: r.id, itemName: r.name, genericText: r.genericText, packName: r.packName, baseUnit: r.baseUnit, unitsPerPack: upp, rack: r.rack,
      stockUnits: r.stockUnits, minStockUnits: r.minStockUnits, maxStockUnits: r.maxStockUnits, reorderQtyPacks: r.reorderQtyPacks,
      soldUnits: r.soldUnits, velocityPerDay: Math.round(velocity * 100) / 100, daysOfCover, pendingPacks: r.pendingPacks, suggestedPacks,
      lastRatePaise, mrpPaise: last?.mrp ?? null, supplierId: last?.supplierId ?? null, supplierName: last?.supplierName ?? null,
      belowMin, reason, estimatedPaise: suggestedPacks * (lastRatePaise ?? 0),
    };
    const key = last?.supplierId ?? null;
    let g = groups.get(key);
    if (!g) { g = { supplierId: key, supplierName: last?.supplierName ?? 'No supplier on record', supplierPhone: last?.supplierPhone ?? null, lines: [], estimatedPaise: 0 }; groups.set(key, g); }
    g.lines.push(line);
    g.estimatedPaise += line.estimatedPaise;
  }
  const rank = (l: ReorderLine) => (l.stockUnits <= 0 ? 0 : l.belowMin ? 1 : 2);
  const list = [...groups.values()].map((g) => ({ ...g, lines: g.lines.sort((a, b) => rank(a) - rank(b) || a.itemName.localeCompare(b.itemName)) }))
    .sort((a, b) => (a.supplierId === null ? 1 : 0) - (b.supplierId === null ? 1 : 0) || a.supplierName.localeCompare(b.supplierName));
  return { generatedAt: new Date().toISOString(), coverDays: q.coverDays, windowDays: q.windowDays, groups: list };
}

// ---------- Purchase orders ----------
const supplierCols = { id: schema.supplier.id, name: schema.supplier.name, phone: schema.supplier.phone, email: schema.supplier.email, gstin: schema.supplier.gstin, drugLicenceNo: schema.supplier.drugLicenceNo, address: schema.supplier.address, city: schema.supplier.city, stateCode: schema.supplier.stateCode };

export function getPurchaseOrder(db: DB, id: number) {
  const row = db.select({ po: schema.purchaseOrder, supplier: supplierCols, createdByName: schema.user.name }).from(schema.purchaseOrder)
    .innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchaseOrder.supplierId)).leftJoin(schema.user, eq(schema.user.id, schema.purchaseOrder.createdBy)).where(eq(schema.purchaseOrder.id, id)).get();
  if (!row) throw notFound('Purchase order not found');
  const today = todayIST();
  const lines = db.select({
    line: schema.purchaseOrderLine, itemName: schema.item.name, genericText: schema.item.genericText, packName: schema.item.packName, baseUnit: schema.item.baseUnit, unitsPerPack: schema.item.unitsPerPack,
    stockUnits: sql<number>`(select coalesce(sum(b.qty_units),0) from batch b where b.item_id = "item"."id" and b.status = 'active' and b.expiry_date >= ${today})`,
  }).from(schema.purchaseOrderLine).innerJoin(schema.item, eq(schema.item.id, schema.purchaseOrderLine.itemId)).where(eq(schema.purchaseOrderLine.purchaseOrderId, id)).orderBy(asc(schema.purchaseOrderLine.id)).all();
  const receipts = db.select({ id: schema.purchase.id, grnNo: schema.purchase.grnNo, invoiceNo: schema.purchase.invoiceNo, invoiceDate: schema.purchase.invoiceDate, receivedDate: schema.purchase.receivedDate, status: schema.purchase.status, totalPaise: schema.purchase.totalPaise })
    .from(schema.purchase).where(eq(schema.purchase.purchaseOrderId, id)).orderBy(desc(schema.purchase.id)).all();
  const mapped = lines.map((l) => ({
    ...l.line, itemName: l.itemName, genericText: l.genericText, packName: l.packName, baseUnit: l.baseUnit, unitsPerPack: l.unitsPerPack, stockUnits: l.stockUnits,
    pendingPacks: Math.max(0, l.line.qtyPacks - l.line.receivedPacks), amountPaise: l.line.qtyPacks * (l.line.ratePaise ?? 0),
  }));
  const orderedPacks = mapped.reduce((s, l) => s + l.qtyPacks, 0);
  const receivedPacks = mapped.reduce((s, l) => s + Math.min(l.qtyPacks, l.receivedPacks), 0);
  return { ...row.po, supplier: row.supplier, supplierName: row.supplier.name, createdByName: row.createdByName, lines: mapped, receipts, orderedPacks, receivedPacks, pendingPacks: orderedPacks - receivedPacks };
}
export type PurchaseOrderDetail = ReturnType<typeof getPurchaseOrder>;

export function listPurchaseOrders(db: DB, f: { q?: string; status?: PoStatus; supplierId?: number; from?: string; to?: string; page: number; pageSize: number }) {
  const conds = [];
  if (f.status) conds.push(eq(schema.purchaseOrder.status, f.status));
  if (f.supplierId) conds.push(eq(schema.purchaseOrder.supplierId, f.supplierId));
  if (f.from) conds.push(gte(schema.purchaseOrder.date, f.from));
  if (f.to) conds.push(lte(schema.purchaseOrder.date, f.to));
  if (f.q) {
    const t = `%${f.q.toLowerCase()}%`;
    conds.push(or(sql`lower(${schema.purchaseOrder.poNo}) like ${t}`, sql`lower(${schema.supplier.name}) like ${t}`)!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.purchaseOrder).innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchaseOrder.supplierId)).where(where).get()!.n;
  const rows = db.select({
    id: schema.purchaseOrder.id, poNo: schema.purchaseOrder.poNo, date: schema.purchaseOrder.date, expectedDate: schema.purchaseOrder.expectedDate, status: schema.purchaseOrder.status,
    supplierId: schema.purchaseOrder.supplierId, supplierName: schema.supplier.name, estimatedPaise: schema.purchaseOrder.estimatedPaise, sentAt: schema.purchaseOrder.sentAt, sentVia: schema.purchaseOrder.sentVia,
    lineCount: sql<number>`(select count(*) from purchase_order_line l where l.purchase_order_id = "purchase_order"."id")`,
    orderedPacks: sql<number>`(select coalesce(sum(l.qty_packs),0) from purchase_order_line l where l.purchase_order_id = "purchase_order"."id")`,
    receivedPacks: sql<number>`(select coalesce(sum(min(l.qty_packs, l.received_packs)),0) from purchase_order_line l where l.purchase_order_id = "purchase_order"."id")`,
    receiptCount: sql<number>`(select count(*) from purchase p where p.purchase_order_id = "purchase_order"."id" and p.status <> 'cancelled')`,
  }).from(schema.purchaseOrder).innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchaseOrder.supplierId)).where(where)
    .orderBy(desc(schema.purchaseOrder.date), desc(schema.purchaseOrder.id)).limit(f.pageSize).offset((f.page - 1) * f.pageSize).all();
  return { rows, total, page: f.page, pageSize: f.pageSize };
}

function prepareLines(db: DB | Tx, input: PurchaseOrderInput) {
  const supplier = db.select({ id: schema.supplier.id, name: schema.supplier.name }).from(schema.supplier).where(eq(schema.supplier.id, input.supplierId)).get();
  if (!supplier) throw notFound('Supplier not found');
  const lines = input.lines.map((l, i) => {
    const item = db.select({ id: schema.item.id, name: schema.item.name }).from(schema.item).where(eq(schema.item.id, l.itemId)).get();
    if (!item) throw notFound(`Line ${i + 1}: item not found`);
    return { itemId: l.itemId, qtyPacks: l.qtyPacks, ratePaise: l.ratePaise ?? null, mrpPaise: l.mrpPaise ?? null, note: l.note ?? null };
  });
  const estimatedPaise = lines.reduce((s, l) => s + l.qtyPacks * (l.ratePaise ?? 0), 0);
  return { supplier, lines, estimatedPaise };
}

export function createPurchaseOrder(db: DB, ctx: Ctx, input: PurchaseOrderInput) {
  return db.transaction((tx) => {
    const { supplier, lines, estimatedPaise } = prepareLines(tx, input);
    const { fy, seq } = nextSequence(tx, ctx.branchId, 'PO', input.date);
    const poNo = formatDocNo('PO', fy, seq);
    const po = tx.insert(schema.purchaseOrder).values({
      branchId: ctx.branchId, poNo, supplierId: input.supplierId, status: 'draft', date: input.date, expectedDate: input.expectedDate ?? null, notes: input.notes ?? null, estimatedPaise, createdBy: ctx.userId,
    }).returning({ id: schema.purchaseOrder.id }).get();
    for (const l of lines) tx.insert(schema.purchaseOrderLine).values({ purchaseOrderId: po.id, ...l }).run();
    audit(tx, ctx, { entity: 'purchase_order', entityId: po.id, action: 'create', after: { poNo, supplier: supplier.name, lines: lines.length, estimatedPaise } });
    return getPurchaseOrder(tx as unknown as DB, po.id);
  });
}

export function updatePurchaseOrder(db: DB, ctx: Ctx, id: number, input: PurchaseOrderInput) {
  return db.transaction((tx) => {
    const before = getPurchaseOrder(tx as unknown as DB, id);
    if (before.status !== 'draft') throw blocked(`${before.poNo} has already been sent; cancel it and raise a new order instead`);
    const { supplier, lines, estimatedPaise } = prepareLines(tx, input);
    tx.update(schema.purchaseOrder).set({ supplierId: input.supplierId, date: input.date, expectedDate: input.expectedDate ?? null, notes: input.notes ?? null, estimatedPaise, updatedAt: new Date().toISOString() }).where(eq(schema.purchaseOrder.id, id)).run();
    tx.delete(schema.purchaseOrderLine).where(eq(schema.purchaseOrderLine.purchaseOrderId, id)).run();
    for (const l of lines) tx.insert(schema.purchaseOrderLine).values({ purchaseOrderId: id, ...l }).run();
    audit(tx, ctx, { entity: 'purchase_order', entityId: id, action: 'update', before: { supplier: before.supplierName, lines: before.lines.length, estimatedPaise: before.estimatedPaise }, after: { supplier: supplier.name, lines: lines.length, estimatedPaise } });
    return getPurchaseOrder(tx as unknown as DB, id);
  });
}

/** Plain-text order for WhatsApp / SMS / e-mail. */
export function purchaseOrderMessage(po: PurchaseOrderDetail, store: ReturnType<typeof getStore>): string {
  const head = [`Purchase order ${po.poNo ?? `#${po.id}`}`, `From: ${store.name}${store.city ? `, ${store.city}` : ''}`, `Date: ${formatDateIN(po.date)}`, `To: ${po.supplier.name}`, ''];
  const items = po.lines.map((l, i) => `${i + 1}. ${l.itemName} — ${l.qtyPacks} ${l.packName}${l.qtyPacks === 1 ? '' : 's'}${l.note ? ` (${l.note})` : ''}`);
  const tail = ['', po.expectedDate ? `Expected by: ${formatDateIN(po.expectedDate)}` : null, po.notes ? `Notes: ${po.notes}` : null, `Please confirm availability and rates. Contact: ${store.phone || '-'}`].filter((x): x is string => x !== null);
  return [...head, ...items, ...tail].join('\n');
}

export function markPurchaseOrderSent(db: DB, ctx: Ctx, id: number, via: string) {
  return db.transaction((tx) => {
    const before = getPurchaseOrder(tx as unknown as DB, id);
    if (before.status !== 'draft' && before.status !== 'sent') throw blocked(`${before.poNo} is ${statusLabel(before.status)}; it cannot be sent again`);
    const sentAt = new Date().toISOString();
    tx.update(schema.purchaseOrder).set({ status: 'sent', sentAt, sentVia: via, updatedAt: sentAt }).where(eq(schema.purchaseOrder.id, id)).run();
    audit(tx, ctx, { entity: 'purchase_order', entityId: id, action: 'send', before: { status: before.status }, after: { status: 'sent', via } });
    const po = getPurchaseOrder(tx as unknown as DB, id);
    return { ...po, messageText: purchaseOrderMessage(po, getStore(tx as unknown as DB)) };
  });
}

export function cancelPurchaseOrder(db: DB, ctx: Ctx, id: number, reason: string) {
  return db.transaction((tx) => {
    const before = getPurchaseOrder(tx as unknown as DB, id);
    if (before.status === 'cancelled') throw blocked('This order is already cancelled');
    if (before.status === 'received') throw blocked('This order has been fully received and cannot be cancelled');
    if (before.receipts.some((r) => r.status !== 'cancelled')) throw blocked(`Stock has already been received against ${before.poNo}; cancel those receipts first`);
    tx.update(schema.purchaseOrder).set({ status: 'cancelled', cancelReason: reason, updatedAt: new Date().toISOString() }).where(eq(schema.purchaseOrder.id, id)).run();
    audit(tx, ctx, { entity: 'purchase_order', entityId: id, action: 'cancel', before: { status: before.status }, after: { status: 'cancelled' }, reason });
    return getPurchaseOrder(tx as unknown as DB, id);
  });
}

export function printPurchaseOrder(db: DB, id: number) {
  const po = getPurchaseOrder(db, id);
  return { po, store: getStore(db), supplier: po.supplier };
}

export function statusLabel(s: PoStatus) {
  return { draft: 'a draft', sent: 'sent', partially_received: 'partly received', received: 'fully received', cancelled: 'cancelled' }[s];
}

/**
 * Called from postPurchase / cancelPurchase inside their transaction: move `packs` per item onto (or off) the PO lines
 * and set the PO status from the received totals. Items on the invoice that are not on the PO are ignored.
 */
export function applyReceiptToPurchaseOrder(tx: Tx, ctx: Ctx, poId: number, supplierId: number, deltas: { itemId: number; packs: number }[], direction: 'receive' | 'unreceive', docNo: string | null) {
  const po = tx.select().from(schema.purchaseOrder).where(eq(schema.purchaseOrder.id, poId)).get();
  if (!po) throw notFound('Purchase order not found');
  if (po.status === 'cancelled') throw blocked(`${po.poNo} is cancelled; remove the order link or raise a new order`);
  if (po.supplierId !== supplierId) throw blocked(`${po.poNo} was raised on a different supplier`);
  const lines = tx.select().from(schema.purchaseOrderLine).where(eq(schema.purchaseOrderLine.purchaseOrderId, poId)).orderBy(asc(schema.purchaseOrderLine.id)).all();
  const byItem = new Map<number, number>();
  for (const d of deltas) byItem.set(d.itemId, (byItem.get(d.itemId) ?? 0) + d.packs);
  const sign = direction === 'receive' ? 1 : -1;
  for (const [itemId, packs] of byItem) {
    const mine = lines.filter((l) => l.itemId === itemId);
    if (!mine.length) continue;
    let left = packs;
    mine.forEach((l, i) => {
      if (left <= 0) return;
      const last = i === mine.length - 1;
      const room = sign > 0 ? Math.max(0, l.qtyPacks - l.receivedPacks) : l.receivedPacks;
      const take = last ? (sign > 0 ? left : Math.min(left, room)) : Math.min(left, room);
      l.receivedPacks += sign * take;
      left -= take;
      tx.update(schema.purchaseOrderLine).set({ receivedPacks: l.receivedPacks }).where(eq(schema.purchaseOrderLine.id, l.id)).run();
    });
  }
  const allDone = lines.every((l) => l.receivedPacks >= l.qtyPacks);
  const anyDone = lines.some((l) => l.receivedPacks > 0);
  const status: PoStatus = allDone ? 'received' : anyDone ? 'partially_received' : po.sentAt ? 'sent' : 'draft';
  if (status !== po.status) tx.update(schema.purchaseOrder).set({ status, updatedAt: new Date().toISOString() }).where(eq(schema.purchaseOrder.id, poId)).run();
  audit(tx, ctx, { entity: 'purchase_order', entityId: poId, action: direction, before: { status: po.status }, after: { status, docNo, packs: [...byItem.entries()].map(([itemId, packs]) => ({ itemId, packs })) } });
  return status;
}
