import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import {
  addDays, financialYear,
  computeSaleLine, expiryStatus, formatStock, invoiceKind, isExpired, missingRxFields, roundHalfUp, roundToRupee, scheduleRequirements, strictestSchedule,
  todayIST, unitPriceFor, type SaleInput, type SaleReturnInput, type Schedule,
} from '@pharma/shared';
import { schema, type DB, type Tx } from '../db/index.js';
import { audit } from '../lib/audit.js';
import type { Ctx } from '../lib/ctx.js';
import { blocked, conflict, notFound } from '../lib/errors.js';
import { getBatch } from './inventory.js';
import { ensureDoctor, getCustomer, postLedger } from './parties.js';
import { formatDocNo, nextSequence } from './sequence.js';
import { getMessagingSettings, queueBillMessage } from './messaging.js';
import { moveStock } from './stock.js';

export interface SaleWarning { line: number | null; level: 'warning' | 'info'; message: string }

interface PreparedLine {
  batch: NonNullable<ReturnType<typeof getBatch>>;
  input: SaleInput['lines'][number];
  qtyUnits: number;
  unitPricePaise: number;
  effectiveDiscountPct: number;
  calc: ReturnType<typeof computeSaleLine>;
  costPaise: number;
}

function prepare(db: DB, ctx: Ctx, input: SaleInput, pharmacistOnDuty: { userId: number; name: string; regNo: string | null } | null, mode: 'preview' | 'post' = 'post') {
  const offline = !!input.offline;
  const store = db.select().from(schema.store).where(eq(schema.store.id, 1)).get()!;
  const today = todayIST();
  const warnings: SaleWarning[] = [];
  const cap = ctx.role === 'owner' ? 100 : ctx.role === 'pharmacist' ? store.maxDiscountPctPharmacist : store.maxDiscountPctClerk;
  const interstate = !!input.customerGstin && input.customerGstin.slice(0, 2) !== store.stateCode;

  const lines: PreparedLine[] = input.lines.map((l, i) => {
    const b = getBatch(db, l.batchId);
    if (!b) throw notFound(`Line ${i + 1}: batch not found`);
    if (b.status !== 'active') throw blocked(`${b.itemName} batch ${b.batchNo} is ${b.status} and cannot be sold`);
    if (b.notForSale) throw blocked(`${b.itemName} is marked not for sale (physician sample / government supply)`);
    if (isExpired(b.expiryDate, offline ? input.offline!.postedAt.slice(0, 10) : today)) throw blocked(`${b.itemName} batch ${b.batchNo} expired on ${b.expiryDate.split('-').reverse().join('/')}. Expired stock cannot be sold (Rule 65(17)).`);
    const pack = { baseUnit: b.baseUnit, unitsPerPack: b.unitsPerPack, packName: b.packName, allowLoose: b.allowLoose };
    if (l.unitMode === 'unit' && !b.allowLoose && b.unitsPerPack !== 1) throw blocked(`${b.itemName} cannot be sold loose`);
    const qtyUnits = l.unitMode === 'unit' ? l.qty : l.qty * b.unitsPerPack;
    if (qtyUnits > b.qtyUnits && offline) warnings.push({ line: i + 1, level: 'warning', message: `${b.itemName} batch ${b.batchNo}: sold offline beyond recorded stock (${b.qtyUnits} left). Stock will go negative until corrected.` });
    else if (qtyUnits > b.qtyUnits) throw blocked(`${b.itemName} batch ${b.batchNo}: only ${formatStock(b.qtyUnits, pack)} available`, { batchId: b.id, available: b.qtyUnits });
    const mrpUnit = unitPriceFor(l.unitMode, b.mrpPaise, pack);
    const unitPricePaise = l.unitPricePaise ?? mrpUnit;
    if (unitPricePaise > mrpUnit) throw blocked(`${b.itemName}: selling price cannot exceed MRP (DPCO para 26)`);
    if (unitPricePaise < mrpUnit && !l.priceReason) throw blocked(`${b.itemName}: give a reason for selling below MRP`);
    const effectiveDiscountPct = l.discountPct + input.billDiscountPct - (l.discountPct * input.billDiscountPct) / 100;
    if (effectiveDiscountPct > cap + 1e-9) throw blocked(`Discount on ${b.itemName} (${effectiveDiscountPct.toFixed(1)}%) exceeds your limit of ${cap}%. Ask the owner to apply it.`);
    const calc = computeSaleLine({ unitPricePaise, qty: l.qty, discountPct: effectiveDiscountPct, gstRatePct: b.gstRatePct, interstate, scheme: store.gstScheme });
    const costPaise = roundHalfUp((b.purchaseRatePaise * qtyUnits) / b.unitsPerPack);
    if (costPaise > 0 && calc.netPaise < costPaise) warnings.push({ line: i + 1, level: 'warning', message: `${b.itemName}: selling below purchase cost` });
    const st = expiryStatus(b.expiryDate, today);
    if (st === 'critical') warnings.push({ line: i + 1, level: 'warning', message: `${b.itemName} batch ${b.batchNo} expires within 30 days` });
    return { batch: b, input: l, qtyUnits, unitPricePaise, effectiveDiscountPct, calc, costPaise };
  });

  const schedule = strictestSchedule(lines.map((l) => l.batch.schedule as Schedule));
  const rx = input.rx ?? {};
  const missing = missingRxFields(schedule, rx, !!pharmacistOnDuty);
  if (missing.length) throw blocked(`This bill contains a Schedule ${schedule} medicine. Required: ${missing.join(', ')}.`, { schedule, missing });

  const kind = invoiceKind(store.gstScheme, lines.map((l) => l.calc));
  const gross = lines.reduce((s, l) => s + l.calc.grossPaise, 0);
  const discount = lines.reduce((s, l) => s + l.calc.discountPaise, 0);
  const taxable = lines.reduce((s, l) => s + l.calc.taxablePaise, 0);
  const cgst = lines.reduce((s, l) => s + l.calc.cgstPaise, 0);
  const sgst = lines.reduce((s, l) => s + l.calc.sgstPaise, 0);
  const igst = lines.reduce((s, l) => s + l.calc.igstPaise, 0);
  const net = lines.reduce((s, l) => s + l.calc.netPaise, 0);
  const { roundedPaise: total, roundOffPaise } = roundToRupee(net);

  // Payments: tendered amounts. Cash change is returned; the balance goes to the customer's credit ledger.
  let payments = input.payments.map((p) => ({ ...p }));
  let tendered = payments.reduce((s, p) => s + p.amountPaise, 0);
  let changePaise = 0;
  if (tendered > total) {
    const cash = payments.find((p) => p.mode === 'cash');
    if (!cash || cash.amountPaise < tendered - total) throw blocked('Payment exceeds the bill total. Only cash can be tendered above the total.');
    changePaise = tendered - total;
    cash.amountPaise -= changePaise;
    tendered = total;
  }
  payments = payments.filter((p) => p.amountPaise > 0 && p.mode !== 'credit');
  const paid = payments.reduce((s, p) => s + p.amountPaise, 0);
  const credit = total - paid;
  if (credit > 0 && mode === 'post') {
    if (!input.customerId) throw blocked(`₹${(credit / 100).toFixed(2)} is unpaid. Collect the full amount or select a customer to record it as credit.`);
    const c = getCustomer(db, input.customerId);
    if (c.creditLimitPaise > 0 && c.balancePaise + credit > c.creditLimitPaise) {
      warnings.push({ line: null, level: 'warning', message: `${c.name} will exceed the credit limit of ₹${(c.creditLimitPaise / 100).toFixed(0)}` });
      if (ctx.role === 'clerk') throw blocked(`${c.name} would exceed their credit limit. A pharmacist or owner must approve this credit sale.`);
    }
  }
  // Rule 46: unregistered recipient details are mandatory at or above ₹50,000 taxable.
  if (!input.customerId && !input.customerName && taxable >= 50_000_00) throw blocked('Customer name and address are required on bills of ₹50,000 or more (CGST Rule 46).');

  return { store, today, warnings, lines, schedule, kind, gross, discount, taxable, cgst, sgst, igst, total, roundOffPaise, payments, paid, credit, changePaise, interstate, offline };
}

export function previewSale(db: DB, ctx: Ctx, input: SaleInput, duty: { userId: number; name: string; regNo: string | null } | null) {
  const p = prepare(db, ctx, input, duty, 'preview');
  return {
    kind: p.kind, schedule: p.schedule, grossPaise: p.gross, discountPaise: p.discount, taxablePaise: p.taxable, cgstPaise: p.cgst, sgstPaise: p.sgst, igstPaise: p.igst,
    roundOffPaise: p.roundOffPaise, totalPaise: p.total, paidPaise: p.paid, creditPaise: p.credit, changePaise: p.changePaise, warnings: p.warnings,
    lines: p.lines.map((l) => ({ batchId: l.batch.id, qtyUnits: l.qtyUnits, unitPricePaise: l.unitPricePaise, ...l.calc })),
  };
}

export function postSale(db: DB, ctx: Ctx, input: SaleInput, dutyNow: { userId: number; name: string; regNo: string | null } | null) {
  // Offline bills carry the pharmacist who was on duty when the bill was made on the device.
  const duty = input.offline?.pharmacistUserId ? (db.select({ userId: schema.user.id, name: schema.user.name, regNo: schema.user.pharmacistRegNo }).from(schema.user).where(eq(schema.user.id, input.offline.pharmacistUserId)).get() ?? dutyNow) : dutyNow;
  const existing = db.select({ id: schema.sale.id }).from(schema.sale).where(eq(schema.sale.clientRef, input.clientRef)).get();
  if (existing) return { ...getSale(db, existing.id), duplicate: true, warnings: [] as SaleWarning[], changePaise: 0 };
  const p = prepare(db, ctx, input, duty);
  return db.transaction((tx) => {
    // Offline bills keep the number the counter assigned in its own series (CGST Rule 46 allows multiple series).
    const saleDate = p.offline ? input.offline!.postedAt.slice(0, 10) : p.today;
    const numbering = p.offline ? { fy: financialYear(saleDate), invoiceNo: input.offline!.invoiceNo } : (() => { const { fy, seq } = nextSequence(tx, ctx.branchId, 'INV', p.today); return { fy, invoiceNo: formatDocNo(p.store.invoicePrefix || 'INV', fy, seq) }; })();
    const { fy, invoiceNo } = numbering;
    if (p.offline) {
      const clash = tx.select({ id: schema.sale.id }).from(schema.sale).where(and(eq(schema.sale.branchId, ctx.branchId), eq(schema.sale.fy, fy), eq(schema.sale.invoiceNo, invoiceNo))).get();
      if (clash) throw conflict(`Bill number ${invoiceNo} already exists on the server. Give this device a different counter code and sync again.`);
    }
    const refillDueDate = input.refillDays ? addDays(saleDate, input.refillDays) : null;
    const doctorId = input.rx?.doctorId ?? ensureDoctor(tx, input.rx?.doctorName, input.rx?.doctorRegNo);
    const customer = input.customerId ? getCustomer(tx as unknown as DB, input.customerId) : null;
    const s = tx.insert(schema.sale).values({
      branchId: ctx.branchId, counter: input.offline?.counter ?? input.counter, invoiceNo, fy, kind: p.kind, date: saleDate,
      customerId: customer?.id ?? null, customerName: customer?.name ?? input.customerName ?? null, customerPhone: customer?.phone ?? input.customerPhone ?? null, customerGstin: input.customerGstin ?? customer?.gstin ?? null,
      doctorId, doctorName: input.rx?.doctorName ?? null, doctorRegNo: input.rx?.doctorRegNo ?? null, patientName: input.rx?.patientName ?? null, patientAddress: input.rx?.patientAddress ?? null, patientAge: input.rx?.patientAge ?? null,
      prescriptionRef: input.rx?.prescriptionRef ?? null, prescriptionDate: input.rx?.prescriptionDate ?? null, prescriptionImageId: input.rx?.prescriptionImageId ?? null,
      pharmacistUserId: scheduleRequirements(p.schedule).pharmacistRequired ? duty!.userId : (duty?.userId ?? null),
      strictestSchedule: p.schedule, status: 'posted', grossPaise: p.gross, discountPaise: p.discount, billDiscountPct: Math.round(input.billDiscountPct * 100),
      taxablePaise: p.taxable, cgstPaise: p.cgst, sgstPaise: p.sgst, igstPaise: p.igst, roundOffPaise: p.roundOffPaise, totalPaise: p.total, paidPaise: p.paid, creditPaise: p.credit,
      notes: input.notes ?? null, clientRef: input.clientRef, createdBy: ctx.userId, postedAt: p.offline ? input.offline!.postedAt : new Date().toISOString(),
      offline: p.offline, clientPostedAt: input.offline?.postedAt ?? null, syncedAt: p.offline ? new Date().toISOString() : null, refillDays: input.refillDays ?? null, refillDueDate, interactionOverride: input.interactionOverride ?? null,
    }).returning({ id: schema.sale.id }).get();

    const lineIds: number[] = [];
    for (const l of p.lines) {
      const row = tx.insert(schema.saleLine).values({
        saleId: s.id, itemId: l.batch.itemId, batchId: l.batch.id, itemName: l.batch.itemName, genericText: l.batch.genericText, manufacturer: l.batch.manufacturer, batchNo: l.batch.batchNo, expiryDate: l.batch.expiryDate,
        hsn: l.batch.hsn, schedule: l.batch.schedule, unitMode: l.input.unitMode, qty: l.input.qty, qtyUnits: l.qtyUnits, unitsPerPack: l.batch.unitsPerPack, packName: l.batch.packName, baseUnit: l.batch.baseUnit,
        mrpPaise: l.batch.mrpPaise, unitPricePaise: l.unitPricePaise, discountPct: Math.round(l.effectiveDiscountPct * 100), grossPaise: l.calc.grossPaise, discountPaise: l.calc.discountPaise, netPaise: l.calc.netPaise,
        gstRatePct: l.calc.ratePct, taxablePaise: l.calc.taxablePaise, cgstPaise: l.calc.cgstPaise, sgstPaise: l.calc.sgstPaise, igstPaise: l.calc.igstPaise, costPaise: l.costPaise, priceReason: l.input.priceReason ?? null,
      }).returning({ id: schema.saleLine.id }).get();
      lineIds.push(row.id);
      const mv = moveStock(tx, { batchId: l.batch.id, qtyDelta: -l.qtyUnits, reason: 'sale', docType: 'INV', docId: s.id, userId: ctx.userId, note: invoiceNo, allowNegative: p.offline });
      if (mv.balanceAfter < 0) audit(tx, ctx, { entity: 'batch', entityId: l.batch.id, action: 'stock_negative_after_sync', after: { invoiceNo, balanceAfter: mv.balanceAfter } });
      writeRegister(tx, ctx, { saleId: s.id, saleLineId: row.id, invoiceNo, date: saleDate, line: l, input, duty, storeRegNo: p.store.pharmacistRegNo });
    }
    for (const pay of p.payments) tx.insert(schema.salePayment).values({ saleId: s.id, mode: pay.mode, amountPaise: pay.amountPaise, reference: pay.reference ?? null }).run();
    if (p.credit > 0 && customer) postLedger(tx, { partyType: 'customer', partyId: customer.id, date: saleDate, docType: 'SALE', docId: s.id, docNo: invoiceNo, debitPaise: p.credit, note: 'Credit sale' });
    if (input.interactionOverride) audit(tx, ctx, { entity: 'sale', entityId: s.id, action: 'interaction_override', reason: input.interactionOverride });
    audit(tx, ctx, { entity: 'sale', entityId: s.id, action: p.offline ? 'sync_post' : 'post', after: { invoiceNo, totalPaise: p.total, paidPaise: p.paid, creditPaise: p.credit, schedule: p.schedule, lines: p.lines.length, offline: p.offline } });
    return { ...getSale(tx as unknown as DB, s.id), duplicate: false, warnings: p.warnings, changePaise: p.changePaise };
  });
}

/** Post, then queue the WhatsApp bill copy when the store has switched that on. Messaging must never fail a sale. */
export function postSaleAndNotify(db: DB, ctx: Ctx, input: SaleInput, dutyNow: { userId: number; name: string; regNo: string | null } | null) {
  const r = postSale(db, ctx, input, dutyNow);
  if (!r.duplicate && r.customerPhone) {
    try { if (getMessagingSettings(db).autoSendBills) queueBillMessage(db, ctx, r.id); } catch { /* never block billing on messaging */ }
  }
  return r;
}

function writeRegister(tx: Tx, ctx: Ctx, a: { saleId: number; saleLineId: number; invoiceNo: string; date: string; line: PreparedLine; input: SaleInput; duty: { userId: number; name: string; regNo: string | null } | null; storeRegNo: string | null }) {
  const req = scheduleRequirements(a.line.batch.schedule as Schedule);
  if (!req.register) return;
  const { fy, seq } = nextSequence(tx, ctx.branchId, req.register, a.date);
  const pack = { baseUnit: a.line.batch.baseUnit, unitsPerPack: a.line.batch.unitsPerPack, packName: a.line.batch.packName, allowLoose: a.line.batch.allowLoose };
  tx.insert(schema.rxRegister).values({
    branchId: ctx.branchId, register: req.register, fy, serialNo: seq, date: a.date, saleId: a.saleId, saleLineId: a.saleLineId, invoiceNo: a.invoiceNo,
    doctorName: a.input.rx?.doctorName ?? null, doctorAddress: null, doctorRegNo: a.input.rx?.doctorRegNo ?? null, patientName: a.input.rx?.patientName ?? null, patientAddress: a.input.rx?.patientAddress ?? null,
    itemName: a.line.batch.itemName, genericName: a.line.batch.genericText, manufacturer: a.line.batch.manufacturer, batchNo: a.line.batch.batchNo, expiryDate: a.line.batch.expiryDate,
    qtyUnits: a.line.qtyUnits, qtyText: formatStock(a.line.qtyUnits, pack), pharmacistUserId: a.duty?.userId ?? null, pharmacistName: a.duty?.name ?? null, pharmacistRegNo: a.duty?.regNo ?? a.storeRegNo,
    prescriptionRef: a.input.rx?.prescriptionRef ?? null,
  }).run();
}

export function getSale(db: DB, id: number) {
  const s = db.select({ sale: schema.sale, createdByName: schema.user.name }).from(schema.sale).leftJoin(schema.user, eq(schema.user.id, schema.sale.createdBy)).where(eq(schema.sale.id, id)).get();
  if (!s) throw notFound('Bill not found');
  const lines = db.select().from(schema.saleLine).where(eq(schema.saleLine.saleId, id)).orderBy(schema.saleLine.id).all();
  const payments = db.select().from(schema.salePayment).where(eq(schema.salePayment.saleId, id)).all();
  const pharmacist = s.sale.pharmacistUserId ? db.select({ name: schema.user.name, regNo: schema.user.pharmacistRegNo }).from(schema.user).where(eq(schema.user.id, s.sale.pharmacistUserId)).get() : null;
  const returns = db.select().from(schema.saleReturn).where(eq(schema.saleReturn.saleId, id)).all();
  return { ...s.sale, billDiscountPct: s.sale.billDiscountPct / 100, createdByName: s.createdByName, pharmacist: pharmacist ?? null, lines: lines.map((l) => ({ ...l, discountPct: l.discountPct / 100 })), payments, returns };
}

export function listSales(db: DB, f: { from?: string; to?: string; q?: string; customerId?: number; status?: string; page: number; pageSize: number }) {
  const conds = [];
  if (f.from) conds.push(gte(schema.sale.date, f.from));
  if (f.to) conds.push(lte(schema.sale.date, f.to));
  if (f.customerId) conds.push(eq(schema.sale.customerId, f.customerId));
  if (f.status) conds.push(eq(schema.sale.status, f.status as 'posted'));
  if (f.q) {
    const t = `%${f.q.toLowerCase()}%`;
    conds.push(or(sql`lower(${schema.sale.invoiceNo}) like ${t}`, sql`lower(${schema.sale.customerName}) like ${t}`, sql`${schema.sale.customerPhone} like ${t}`, sql`lower(${schema.sale.patientName}) like ${t}`)!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.sale).where(where).get()!.n;
  const rows = db.select({
    id: schema.sale.id, invoiceNo: schema.sale.invoiceNo, date: schema.sale.date, kind: schema.sale.kind, status: schema.sale.status, customerName: schema.sale.customerName, customerPhone: schema.sale.customerPhone,
    patientName: schema.sale.patientName, totalPaise: schema.sale.totalPaise, paidPaise: schema.sale.paidPaise, creditPaise: schema.sale.creditPaise, returnedPaise: schema.sale.returnedPaise, strictestSchedule: schema.sale.strictestSchedule,
    createdAt: schema.sale.createdAt, createdByName: schema.user.name, lineCount: sql<number>`(select count(*) from sale_line sl where sl.sale_id = "sale"."id")`,
  }).from(schema.sale).leftJoin(schema.user, eq(schema.user.id, schema.sale.createdBy)).where(where).orderBy(desc(schema.sale.id)).limit(f.pageSize).offset((f.page - 1) * f.pageSize).all();
  return { rows, total, page: f.page, pageSize: f.pageSize };
}

export function cancelSale(db: DB, ctx: Ctx, id: number, reason: string) {
  return db.transaction((tx) => {
    const s = getSale(tx as unknown as DB, id);
    if (s.status !== 'posted') throw blocked('Only posted bills can be cancelled');
    if (s.returns.length) throw blocked('This bill has returns against it and cannot be cancelled');
    for (const l of s.lines) moveStock(tx, { batchId: l.batchId, qtyDelta: l.qtyUnits, reason: 'cancel', docType: 'INV', docId: id, userId: ctx.userId, note: `Cancelled ${s.invoiceNo}: ${reason}` });
    if (s.creditPaise > 0 && s.customerId) postLedger(tx, { partyType: 'customer', partyId: s.customerId, date: todayIST(), docType: 'SALE_CANCEL', docId: id, docNo: s.invoiceNo, creditPaise: s.creditPaise, note: 'Bill cancelled' });
    tx.update(schema.sale).set({ status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: reason }).where(eq(schema.sale.id, id)).run();
    audit(tx, ctx, { entity: 'sale', entityId: id, action: 'cancel', before: { status: 'posted', totalPaise: s.totalPaise }, after: { status: 'cancelled' }, reason });
    return getSale(tx as unknown as DB, id);
  });
}

export function postSaleReturn(db: DB, ctx: Ctx, input: SaleReturnInput) {
  return db.transaction((tx) => {
    const s = getSale(tx as unknown as DB, input.saleId);
    if (s.status !== 'posted') throw blocked('Returns are only possible against a posted bill');
    const date = input.date ?? todayIST();
    const { fy, seq } = nextSequence(tx, ctx.branchId, 'CN', date);
    const creditNoteNo = formatDocNo('CN', fy, seq);
    let taxable = 0, cgst = 0, sgst = 0, igst = 0, net = 0;
    const computed = input.lines.map((rl) => {
      const line = s.lines.find((l) => l.id === rl.saleLineId);
      if (!line) throw notFound('Bill line not found');
      const remaining = line.qtyUnits - line.returnedUnits;
      if (rl.qtyUnits > remaining) throw blocked(`${line.itemName}: only ${remaining} units can still be returned`);
      const f = rl.qtyUnits / line.qtyUnits;
      const part = { netPaise: roundHalfUp(line.netPaise * f), taxablePaise: roundHalfUp(line.taxablePaise * f), cgstPaise: roundHalfUp(line.cgstPaise * f), sgstPaise: roundHalfUp(line.sgstPaise * f), igstPaise: roundHalfUp(line.igstPaise * f) };
      taxable += part.taxablePaise; cgst += part.cgstPaise; sgst += part.sgstPaise; igst += part.igstPaise; net += part.netPaise;
      return { line, rl, part };
    });
    const { roundedPaise: total } = roundToRupee(net);
    const sr = tx.insert(schema.saleReturn).values({ branchId: ctx.branchId, saleId: s.id, creditNoteNo, fy, date, reason: input.reason, refundMode: input.refundMode, taxablePaise: taxable, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst, totalPaise: total, createdBy: ctx.userId }).returning({ id: schema.saleReturn.id }).get();
    for (const c of computed) {
      tx.insert(schema.saleReturnLine).values({ saleReturnId: sr.id, saleLineId: c.line.id, itemId: c.line.itemId, batchId: c.line.batchId, qtyUnits: c.rl.qtyUnits, ...c.part }).run();
      tx.update(schema.saleLine).set({ returnedUnits: c.line.returnedUnits + c.rl.qtyUnits }).where(eq(schema.saleLine.id, c.line.id)).run();
      moveStock(tx, { batchId: c.line.batchId, qtyDelta: c.rl.qtyUnits, reason: 'sale_return', docType: 'CN', docId: sr.id, userId: ctx.userId, note: `${creditNoteNo} against ${s.invoiceNo}` });
    }
    tx.update(schema.sale).set({ returnedPaise: s.returnedPaise + total }).where(eq(schema.sale.id, s.id)).run();
    if (input.refundMode === 'credit') {
      if (!s.customerId) throw blocked('Select a customer bill to refund as credit');
      postLedger(tx, { partyType: 'customer', partyId: s.customerId, date, docType: 'SALE_RETURN', docId: sr.id, docNo: creditNoteNo, creditPaise: total, note: `Return against ${s.invoiceNo}` });
    }
    audit(tx, ctx, { entity: 'sale_return', entityId: sr.id, action: 'post', after: { creditNoteNo, saleId: s.id, totalPaise: total, refundMode: input.refundMode }, reason: input.reason });
    return getSaleReturn(tx as unknown as DB, sr.id);
  });
}

export function getSaleReturn(db: DB, id: number) {
  const r = db.select().from(schema.saleReturn).where(eq(schema.saleReturn.id, id)).get();
  if (!r) throw notFound('Credit note not found');
  const lines = db.select({ l: schema.saleReturnLine, itemName: schema.saleLine.itemName, batchNo: schema.saleLine.batchNo, hsn: schema.saleLine.hsn, gstRatePct: schema.saleLine.gstRatePct, unitsPerPack: schema.saleLine.unitsPerPack, packName: schema.saleLine.packName, baseUnit: schema.saleLine.baseUnit })
    .from(schema.saleReturnLine).innerJoin(schema.saleLine, eq(schema.saleLine.id, schema.saleReturnLine.saleLineId)).where(eq(schema.saleReturnLine.saleReturnId, id)).all();
  const sale = getSale(db, r.saleId);
  return { ...r, lines: lines.map((x) => ({ ...x.l, itemName: x.itemName, batchNo: x.batchNo, hsn: x.hsn, gstRatePct: x.gstRatePct, unitsPerPack: x.unitsPerPack, packName: x.packName, baseUnit: x.baseUnit })), sale: { id: sale.id, invoiceNo: sale.invoiceNo, date: sale.date, customerName: sale.customerName, customerPhone: sale.customerPhone } };
}

// ---------- Holds ----------
export function listHolds(db: DB) {
  return db.select({ id: schema.saleHold.id, clientRef: schema.saleHold.clientRef, label: schema.saleHold.label, createdAt: schema.saleHold.createdAt, userName: schema.user.name, payloadJson: schema.saleHold.payloadJson })
    .from(schema.saleHold).leftJoin(schema.user, eq(schema.user.id, schema.saleHold.userId)).orderBy(desc(schema.saleHold.id)).all()
    .map((h) => ({ ...h, payload: JSON.parse(h.payloadJson) as unknown, payloadJson: undefined }));
}
export function saveHold(db: DB, ctx: Ctx, clientRef: string, label: string | null, payload: unknown) {
  db.insert(schema.saleHold).values({ clientRef, label, payloadJson: JSON.stringify(payload), userId: ctx.userId })
    .onConflictDoUpdate({ target: schema.saleHold.clientRef, set: { label, payloadJson: JSON.stringify(payload), userId: ctx.userId } }).run();
  return listHolds(db);
}
export function deleteHold(db: DB, clientRef: string) {
  db.delete(schema.saleHold).where(eq(schema.saleHold.clientRef, clientRef)).run();
}
