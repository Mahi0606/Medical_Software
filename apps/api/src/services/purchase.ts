import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { parse } from 'csv-parse/sync';
import { daysBetween, parseExpiry, pct, roundHalfUp, roundToRupee, splitExclusive, todayIST, type PurchaseInput, type PurchaseReturnInput } from '@pharma/shared';
import { schema, type DB } from '../db/index.js';
import { audit } from '../lib/audit.js';
import type { Ctx } from '../lib/ctx.js';
import { badRequest, blocked, notFound } from '../lib/errors.js';
import { norm } from '../lib/text.js';
import { getBatch, upsertBatch } from './inventory.js';
import { postLedger } from './parties.js';
import { applyReceiptToPurchaseOrder } from './purchase-orders.js';
import { formatDocNo, nextSequence } from './sequence.js';
import { moveStock } from './stock.js';

export interface PurchaseWarning { line: number; level: 'warning' | 'info'; message: string }

export interface PurchasePreview {
  lines: {
    itemId: number; itemName: string; unitsPerPack: number; qtyPacks: number; freePacks: number; unitsReceived: number;
    grossPaise: number; discountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number;
    effectiveCostPerPackPaise: number; marginPct: number; mrpPaise: number; expiryDate: string;
  }[];
  taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; otherChargesPaise: number; roundOffPaise: number; totalPaise: number;
  warnings: PurchaseWarning[];
}

export function previewPurchase(db: DB, input: PurchaseInput): PurchasePreview {
  const store = db.select().from(schema.store).where(eq(schema.store.id, 1)).get()!;
  const today = todayIST();
  const warnings: PurchaseWarning[] = [];
  const lines = input.lines.map((l, i) => {
    const item = db.select().from(schema.item).where(eq(schema.item.id, l.itemId)).get();
    if (!item) throw badRequest(`Line ${i + 1}: item not found`);
    const grossPaise = roundHalfUp(l.ratePaise * l.qtyPacks);
    const discountPaise = pct(grossPaise, l.discountPct);
    const taxableBase = grossPaise - discountPaise;
    const split = splitExclusive(taxableBase, l.gstRatePct, input.interstate);
    const packs = l.qtyPacks + l.freePacks;
    const costBase = store.gstScheme === 'composition' ? split.totalPaise : split.taxablePaise;
    const effectiveCostPerPackPaise = packs > 0 ? roundHalfUp(costBase / packs) : 0;
    const marginPct = l.mrpPaise > 0 ? Math.round(((l.mrpPaise - effectiveCostPerPackPaise) / l.mrpPaise) * 1000) / 10 : 0;
    const days = daysBetween(today, l.expiryDate);
    if (days < 0) warnings.push({ line: i + 1, level: 'warning', message: `${item.name}: batch ${l.batchNo} is already expired` });
    else if (days <= store.nearExpiryDays) warnings.push({ line: i + 1, level: 'warning', message: `${item.name}: batch ${l.batchNo} expires in ${days} days` });
    const last = db.select({ mrp: schema.batch.mrpPaise, rate: schema.batch.purchaseRatePaise }).from(schema.batch).where(eq(schema.batch.itemId, l.itemId)).orderBy(desc(schema.batch.id)).get();
    if (last) {
      if (l.mrpPaise < last.mrp) warnings.push({ line: i + 1, level: 'info', message: `${item.name}: MRP ₹${(l.mrpPaise / 100).toFixed(2)} is lower than the last batch (₹${(last.mrp / 100).toFixed(2)})` });
      if (last.rate > 0 && effectiveCostPerPackPaise > last.rate * 1.05) warnings.push({ line: i + 1, level: 'info', message: `${item.name}: cost per pack rose ${Math.round(((effectiveCostPerPackPaise - last.rate) / last.rate) * 100)}% vs last purchase` });
    }
    if (effectiveCostPerPackPaise > l.mrpPaise && l.mrpPaise > 0) warnings.push({ line: i + 1, level: 'warning', message: `${item.name}: cost per pack exceeds MRP` });
    if (item.gstRatePct !== l.gstRatePct) warnings.push({ line: i + 1, level: 'info', message: `${item.name}: GST ${l.gstRatePct}% differs from item master (${item.gstRatePct}%)` });
    return {
      itemId: item.id, itemName: item.name, unitsPerPack: item.unitsPerPack, qtyPacks: l.qtyPacks, freePacks: l.freePacks, unitsReceived: packs * item.unitsPerPack,
      grossPaise, discountPaise, taxablePaise: split.taxablePaise, cgstPaise: split.cgstPaise, sgstPaise: split.sgstPaise, igstPaise: split.igstPaise, totalPaise: split.totalPaise,
      effectiveCostPerPackPaise, marginPct, mrpPaise: l.mrpPaise, expiryDate: l.expiryDate,
    };
  });
  const taxablePaise = lines.reduce((s, l) => s + l.taxablePaise, 0);
  const cgstPaise = lines.reduce((s, l) => s + l.cgstPaise, 0);
  const sgstPaise = lines.reduce((s, l) => s + l.sgstPaise, 0);
  const igstPaise = lines.reduce((s, l) => s + l.igstPaise, 0);
  const raw = taxablePaise + cgstPaise + sgstPaise + igstPaise + input.otherChargesPaise;
  const { roundedPaise, roundOffPaise } = roundToRupee(raw);
  return { lines, taxablePaise, cgstPaise, sgstPaise, igstPaise, otherChargesPaise: input.otherChargesPaise, roundOffPaise, totalPaise: roundedPaise, warnings };
}

export function postPurchase(db: DB, ctx: Ctx, input: PurchaseInput) {
  const preview = previewPurchase(db, input);
  const supplier = db.select().from(schema.supplier).where(eq(schema.supplier.id, input.supplierId)).get();
  if (!supplier) throw notFound('Supplier not found');
  const dup = db.select({ id: schema.purchase.id }).from(schema.purchase).where(and(eq(schema.purchase.supplierId, input.supplierId), eq(schema.purchase.invoiceNo, input.invoiceNo), sql`${schema.purchase.status} <> 'cancelled'`)).get();
  if (dup) throw blocked(`Invoice ${input.invoiceNo} from ${supplier.name} is already entered (GRN #${dup.id})`);
  const receivedDate = input.receivedDate ?? todayIST();
  return db.transaction((tx) => {
    const { fy, seq } = nextSequence(tx, ctx.branchId, 'GRN', receivedDate);
    const grnNo = formatDocNo('GRN', fy, seq);
    const p = tx.insert(schema.purchase).values({
      branchId: ctx.branchId, grnNo, supplierId: input.supplierId, invoiceNo: input.invoiceNo, invoiceDate: input.invoiceDate, receivedDate, status: 'posted', interstate: input.interstate,
      taxablePaise: preview.taxablePaise, cgstPaise: preview.cgstPaise, sgstPaise: preview.sgstPaise, igstPaise: preview.igstPaise, otherChargesPaise: input.otherChargesPaise,
      roundOffPaise: preview.roundOffPaise, totalPaise: preview.totalPaise, notes: input.notes ?? null, createdBy: ctx.userId, postedAt: new Date().toISOString(),
      purchaseOrderId: input.purchaseOrderId ?? null, // Phase 2: link to the PO being received
    }).returning({ id: schema.purchase.id }).get();
    const batchIds: { batchId: number; units: number }[] = [];
    input.lines.forEach((l, i) => {
      const pl = preview.lines[i]!;
      const batchId = upsertBatch(tx, { itemId: l.itemId, batchNo: l.batchNo, mfgDate: l.mfgDate ?? null, expiryDate: l.expiryDate, mrpPaise: l.mrpPaise, purchaseRatePaise: pl.effectiveCostPerPackPaise, supplierId: input.supplierId, gtin: l.gtin ?? null, branchId: ctx.branchId });
      tx.insert(schema.purchaseLine).values({
        purchaseId: p.id, itemId: l.itemId, batchId, batchNo: l.batchNo, mfgDate: l.mfgDate ?? null, expiryDate: l.expiryDate, qtyPacks: l.qtyPacks, freePacks: l.freePacks, unitsPerPack: pl.unitsPerPack,
        ratePaise: l.ratePaise, discountPct: Math.round(l.discountPct * 100), mrpPaise: l.mrpPaise, gstRatePct: l.gstRatePct, hsn: l.hsn ?? '3004',
        taxablePaise: pl.taxablePaise, cgstPaise: pl.cgstPaise, sgstPaise: pl.sgstPaise, igstPaise: pl.igstPaise, totalPaise: pl.totalPaise, schemeNote: l.schemeNote ?? null, gtin: l.gtin ?? null,
      }).run();
      moveStock(tx, { batchId, qtyDelta: pl.unitsReceived, reason: 'purchase', docType: 'GRN', docId: p.id, userId: ctx.userId, note: `${grnNo} ${supplier.name} inv ${input.invoiceNo}` });
      batchIds.push({ batchId, units: pl.unitsReceived });
    });
    postLedger(tx, { partyType: 'supplier', partyId: input.supplierId, date: input.invoiceDate, docType: 'PURCHASE', docId: p.id, docNo: input.invoiceNo, creditPaise: preview.totalPaise, note: grnNo });
    // Phase 2: receiving against a PO moves qty + free packs onto the PO lines and sets its status (partially_received / received).
    if (input.purchaseOrderId) applyReceiptToPurchaseOrder(tx, ctx, input.purchaseOrderId, input.supplierId, input.lines.map((l) => ({ itemId: l.itemId, packs: l.qtyPacks + l.freePacks })), 'receive', grnNo);
    audit(tx, ctx, { entity: 'purchase', entityId: p.id, action: 'post', after: { grnNo, supplier: supplier.name, invoiceNo: input.invoiceNo, totalPaise: preview.totalPaise, lines: input.lines.length } });
    return { id: p.id, grnNo, totalPaise: preview.totalPaise, warnings: preview.warnings, batches: batchIds };
  });
}

export function getPurchase(db: DB, id: number) {
  const p = db.select({ purchase: schema.purchase, supplierName: schema.supplier.name, supplierGstin: schema.supplier.gstin, createdByName: schema.user.name }).from(schema.purchase)
    .innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchase.supplierId)).leftJoin(schema.user, eq(schema.user.id, schema.purchase.createdBy)).where(eq(schema.purchase.id, id)).get();
  if (!p) throw notFound('Purchase not found');
  const lines = db.select({ line: schema.purchaseLine, itemName: schema.item.name, packName: schema.item.packName, currentQty: schema.batch.qtyUnits }).from(schema.purchaseLine)
    .innerJoin(schema.item, eq(schema.item.id, schema.purchaseLine.itemId)).leftJoin(schema.batch, eq(schema.batch.id, schema.purchaseLine.batchId)).where(eq(schema.purchaseLine.purchaseId, id)).all();
  return { ...p.purchase, supplierName: p.supplierName, supplierGstin: p.supplierGstin, createdByName: p.createdByName, lines: lines.map((l) => ({ ...l.line, discountPct: l.line.discountPct / 100, itemName: l.itemName, packName: l.packName, currentQty: l.currentQty })) };
}

export function listPurchases(db: DB, f: { from?: string; to?: string; supplierId?: number; q?: string; page: number; pageSize: number }) {
  const conds = [];
  if (f.from) conds.push(gte(schema.purchase.invoiceDate, f.from));
  if (f.to) conds.push(lte(schema.purchase.invoiceDate, f.to));
  if (f.supplierId) conds.push(eq(schema.purchase.supplierId, f.supplierId));
  if (f.q) {
    const t = `%${f.q.toLowerCase()}%`;
    conds.push(or(sql`lower(${schema.purchase.invoiceNo}) like ${t}`, sql`lower(${schema.supplier.name}) like ${t}`, sql`lower(${schema.purchase.grnNo}) like ${t}`)!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.purchase).innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchase.supplierId)).where(where).get()!.n;
  const rows = db.select({
    id: schema.purchase.id, grnNo: schema.purchase.grnNo, invoiceNo: schema.purchase.invoiceNo, invoiceDate: schema.purchase.invoiceDate, receivedDate: schema.purchase.receivedDate, status: schema.purchase.status,
    supplierId: schema.purchase.supplierId, supplierName: schema.supplier.name, totalPaise: schema.purchase.totalPaise, taxablePaise: schema.purchase.taxablePaise,
    lineCount: sql<number>`(select count(*) from purchase_line pl where pl.purchase_id = "purchase"."id")`,
  }).from(schema.purchase).innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchase.supplierId)).where(where)
    .orderBy(desc(schema.purchase.receivedDate), desc(schema.purchase.id)).limit(f.pageSize).offset((f.page - 1) * f.pageSize).all();
  return { rows, total, page: f.page, pageSize: f.pageSize };
}

export function cancelPurchase(db: DB, ctx: Ctx, id: number, reason: string) {
  return db.transaction((tx) => {
    const p = getPurchase(tx as unknown as DB, id);
    if (p.status !== 'posted') throw blocked('Only posted receipts can be cancelled');
    for (const l of p.lines) {
      const units = (l.qtyPacks + l.freePacks) * l.unitsPerPack;
      const b = getBatch(tx as unknown as DB, l.batchId!);
      if (!b || b.qtyUnits < units) throw blocked(`${l.itemName} batch ${l.batchNo}: ${units} units were received but only ${b?.qtyUnits ?? 0} remain. Return or adjust stock first.`);
      moveStock(tx, { batchId: l.batchId!, qtyDelta: -units, reason: 'cancel', docType: 'GRN', docId: id, userId: ctx.userId, note: `Cancelled ${p.grnNo}: ${reason}` });
    }
    postLedger(tx, { partyType: 'supplier', partyId: p.supplierId, date: todayIST(), docType: 'PURCHASE_CANCEL', docId: id, docNo: p.invoiceNo, debitPaise: p.totalPaise, note: `Cancelled ${p.grnNo}` });
    tx.update(schema.purchase).set({ status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: reason }).where(eq(schema.purchase.id, id)).run();
    // Phase 2: give the packs back to the linked PO so it can be received again.
    if (p.purchaseOrderId) applyReceiptToPurchaseOrder(tx, ctx, p.purchaseOrderId, p.supplierId, p.lines.map((l) => ({ itemId: l.itemId, packs: l.qtyPacks + l.freePacks })), 'unreceive', p.grnNo);
    audit(tx, ctx, { entity: 'purchase', entityId: id, action: 'cancel', before: { status: 'posted' }, after: { status: 'cancelled' }, reason });
    return getPurchase(tx as unknown as DB, id);
  });
}

// ---------- Purchase returns (expiry / breakage) ----------
export function postPurchaseReturn(db: DB, ctx: Ctx, input: PurchaseReturnInput) {
  const store = db.select().from(schema.store).where(eq(schema.store.id, 1)).get()!;
  const supplier = db.select().from(schema.supplier).where(eq(schema.supplier.id, input.supplierId)).get();
  if (!supplier) throw notFound('Supplier not found');
  const interstate = !!supplier.stateCode && supplier.stateCode !== store.stateCode;
  return db.transaction((tx) => {
    const { fy, seq } = nextSequence(tx, ctx.branchId, 'PR', input.date);
    const docNo = formatDocNo('PR', fy, seq);
    let taxable = 0, cgst = 0, sgst = 0, igst = 0;
    const computed = input.lines.map((l) => {
      const b = getBatch(tx as unknown as DB, l.batchId);
      if (!b) throw notFound(`Batch ${l.batchId} not found`);
      if (b.qtyUnits < l.qtyUnits) throw blocked(`${b.itemName} batch ${b.batchNo}: only ${b.qtyUnits} units in stock`);
      const ratePerPack = l.ratePaise ?? b.purchaseRatePaise;
      const taxablePaise = roundHalfUp((ratePerPack * l.qtyUnits) / b.unitsPerPack);
      const split = splitExclusive(taxablePaise, b.gstRatePct, interstate);
      taxable += split.taxablePaise; cgst += split.cgstPaise; sgst += split.sgstPaise; igst += split.igstPaise;
      return { b, l, ratePerPack, split };
    });
    const total = taxable + cgst + sgst + igst;
    // Credit-note route: we must reverse the ITC we took (CBIC Circular 72/46/2018). Supply-invoice route: we charge output tax instead.
    const itcReversalPaise = input.route === 'credit_note' ? cgst + sgst + igst : 0;
    const pr = tx.insert(schema.purchaseReturn).values({
      branchId: ctx.branchId, docNo, supplierId: input.supplierId, date: input.date, route: input.route, supplierRef: input.supplierRef ?? null, status: 'posted',
      taxablePaise: taxable, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst, totalPaise: total, itcReversalPaise, notes: input.notes ?? null, createdBy: ctx.userId,
    }).returning({ id: schema.purchaseReturn.id }).get();
    for (const c of computed) {
      tx.insert(schema.purchaseReturnLine).values({
        purchaseReturnId: pr.id, itemId: c.b.itemId, batchId: c.b.id, qtyUnits: c.l.qtyUnits, ratePaise: c.ratePerPack, gstRatePct: c.b.gstRatePct,
        taxablePaise: c.split.taxablePaise, taxPaise: c.split.cgstPaise + c.split.sgstPaise + c.split.igstPaise, totalPaise: c.split.totalPaise, reason: c.l.reason,
      }).run();
      const { balanceAfter } = moveStock(tx, { batchId: c.b.id, qtyDelta: -c.l.qtyUnits, reason: 'purchase_return', docType: 'PR', docId: pr.id, userId: ctx.userId, note: `${docNo} to ${supplier.name} (${c.l.reason})` });
      if (balanceAfter === 0 && (c.l.reason === 'expired' || c.b.status === 'quarantined')) {
        tx.update(schema.batch).set({ status: 'returned' }).where(eq(schema.batch.id, c.b.id)).run();
      }
    }
    postLedger(tx, { partyType: 'supplier', partyId: input.supplierId, date: input.date, docType: 'PURCHASE_RETURN', docId: pr.id, docNo, debitPaise: total, note: input.route === 'credit_note' ? 'Awaiting supplier credit note' : 'Return supply invoice' });
    audit(tx, ctx, { entity: 'purchase_return', entityId: pr.id, action: 'post', after: { docNo, supplier: supplier.name, route: input.route, totalPaise: total, itcReversalPaise, lines: input.lines.length } });
    return getPurchaseReturn(tx as unknown as DB, pr.id);
  });
}

export function getPurchaseReturn(db: DB, id: number) {
  const pr = db.select({ pr: schema.purchaseReturn, supplierName: schema.supplier.name, supplierGstin: schema.supplier.gstin }).from(schema.purchaseReturn)
    .innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchaseReturn.supplierId)).where(eq(schema.purchaseReturn.id, id)).get();
  if (!pr) throw notFound('Purchase return not found');
  const lines = db.select({ line: schema.purchaseReturnLine, itemName: schema.item.name, batchNo: schema.batch.batchNo, expiryDate: schema.batch.expiryDate, unitsPerPack: schema.item.unitsPerPack, hsn: schema.item.hsn }).from(schema.purchaseReturnLine)
    .innerJoin(schema.item, eq(schema.item.id, schema.purchaseReturnLine.itemId)).innerJoin(schema.batch, eq(schema.batch.id, schema.purchaseReturnLine.batchId)).where(eq(schema.purchaseReturnLine.purchaseReturnId, id)).all();
  return { ...pr.pr, supplierName: pr.supplierName, supplierGstin: pr.supplierGstin, lines: lines.map((l) => ({ ...l.line, itemName: l.itemName, batchNo: l.batchNo, expiryDate: l.expiryDate, unitsPerPack: l.unitsPerPack, hsn: l.hsn })) };
}

export function listPurchaseReturns(db: DB, f: { from?: string; to?: string; supplierId?: number; page: number; pageSize: number }) {
  const conds = [];
  if (f.from) conds.push(gte(schema.purchaseReturn.date, f.from));
  if (f.to) conds.push(lte(schema.purchaseReturn.date, f.to));
  if (f.supplierId) conds.push(eq(schema.purchaseReturn.supplierId, f.supplierId));
  const where = conds.length ? and(...conds) : undefined;
  const rows = db.select({ id: schema.purchaseReturn.id, docNo: schema.purchaseReturn.docNo, date: schema.purchaseReturn.date, route: schema.purchaseReturn.route, supplierName: schema.supplier.name, totalPaise: schema.purchaseReturn.totalPaise, itcReversalPaise: schema.purchaseReturn.itcReversalPaise, status: schema.purchaseReturn.status, supplierRef: schema.purchaseReturn.supplierRef })
    .from(schema.purchaseReturn).innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchaseReturn.supplierId)).where(where).orderBy(desc(schema.purchaseReturn.id)).limit(f.pageSize).offset((f.page - 1) * f.pageSize).all();
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.purchaseReturn).where(where).get()!.n;
  return { rows, total, page: f.page, pageSize: f.pageSize };
}

// ---------- Distributor invoice CSV → draft lines ----------
export interface ImportedPurchaseLine {
  row: number; itemName: string; itemId: number | null; matchedName: string | null; unitsPerPack: number | null; packName: string | null; batchNo: string; expiry: string | null; expiryRaw: string;
  qtyPacks: number; freePacks: number; ratePaise: number; mrpPaise: number; discountPct: number; gstRatePct: number; hsn: string | null; problems: string[];
}

export function parsePurchaseCsv(db: DB, csv: string): { lines: ImportedPurchaseLine[]; columns: string[] } {
  let records: Record<string, string>[];
  let columns: string[] = [];
  try {
    records = parse(csv, { columns: (h: string[]) => { columns = h.map((c) => c.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')); return columns; }, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  } catch (e) {
    throw badRequest(`Could not read the CSV file: ${(e as Error).message}`);
  }
  const pick = (r: Record<string, string>, ...keys: string[]) => { for (const k of keys) if (r[k] !== undefined && r[k] !== '') return r[k]!; return ''; };
  const num = (s: string) => Number(String(s).replace(/[^0-9.\-]/g, '')) || 0;
  const lines = records.map((r, i) => {
    const itemName = pick(r, 'item', 'item_name', 'product', 'product_name', 'description', 'name', 'medicine');
    const problems: string[] = [];
    let itemId: number | null = null; let matchedName: string | null = null; let unitsPerPack: number | null = null; let packName: string | null = null;
    if (itemName) {
      const n = norm(itemName);
      const cols = { id: schema.item.id, name: schema.item.name, unitsPerPack: schema.item.unitsPerPack, packName: schema.item.packName };
      const exact = db.select(cols).from(schema.item).where(eq(schema.item.nameNorm, n)).get();
      const m = exact ?? db.select(cols).from(schema.item).where(sql`${schema.item.nameNorm} like ${n.split(' ').slice(0, 2).join(' ') + '%'}`).get();
      if (m) { itemId = m.id; matchedName = m.name; unitsPerPack = m.unitsPerPack; packName = m.packName; if (!exact) problems.push('Matched by prefix, please confirm'); } else problems.push('Item not found in master');
    } else problems.push('Item name missing');
    const expiryRaw = pick(r, 'expiry', 'exp', 'exp_date', 'expiry_date', 'exp_dt');
    const expiry = expiryRaw ? parseExpiry(expiryRaw) : null;
    if (!expiry) problems.push('Expiry not recognised');
    const batchNo = pick(r, 'batch', 'batch_no', 'batch_number', 'lot', 'b_no');
    if (!batchNo) problems.push('Batch number missing');
    const qtyPacks = num(pick(r, 'qty', 'quantity', 'qty_packs', 'billed_qty', 'pack_qty'));
    const freePacks = num(pick(r, 'free', 'free_qty', 'scheme', 'free_packs', 'fq'));
    const ratePaise = Math.round(num(pick(r, 'rate', 'ptr', 'purchase_rate', 'price', 'p_rate')) * 100);
    const mrpPaise = Math.round(num(pick(r, 'mrp', 'm_r_p')) * 100);
    if (!mrpPaise) problems.push('MRP missing');
    const discountPct = num(pick(r, 'disc', 'discount', 'disc_', 'discount_'));
    const gstRatePct = num(pick(r, 'gst', 'gst_', 'gst_rate', 'tax', 'tax_')) || (itemId ? db.select({ g: schema.item.gstRatePct }).from(schema.item).where(eq(schema.item.id, itemId)).get()!.g : 5);
    const hsn = pick(r, 'hsn', 'hsn_code') || null;
    return { row: i + 2, itemName, itemId, matchedName, unitsPerPack, packName, batchNo, expiry, expiryRaw, qtyPacks, freePacks, ratePaise, mrpPaise, discountPct, gstRatePct: [0, 5, 12, 18, 28].includes(gstRatePct) ? gstRatePct : 5, hsn, problems };
  });
  return { lines, columns };
}
