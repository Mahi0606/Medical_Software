import { and, asc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { schema, type DB } from '../db/index.js';
import { audit } from '../lib/audit.js';
import type { Ctx } from '../lib/ctx.js';
import { gstr1 } from './reports.js';

// ---------- Tally ledger settings (setting key 'tally') ----------
export const tallySettingsSchema = z.object({
  companyName: z.string().trim().max(120).default(''),
  cashLedger: z.string().trim().min(1).max(80).default('Cash Sales'),
  salesLedgerPattern: z.string().trim().min(1).max(80).default('Sales @ {rate}%'),
  purchaseLedgerPattern: z.string().trim().min(1).max(80).default('Purchase @ {rate}%'),
  cgstOut: z.string().trim().min(1).max(80).default('Output CGST @ {rate}%'),
  sgstOut: z.string().trim().min(1).max(80).default('Output SGST @ {rate}%'),
  igstOut: z.string().trim().min(1).max(80).default('Output IGST @ {rate}%'),
  cgstIn: z.string().trim().min(1).max(80).default('Input CGST @ {rate}%'),
  sgstIn: z.string().trim().min(1).max(80).default('Input SGST @ {rate}%'),
  igstIn: z.string().trim().min(1).max(80).default('Input IGST @ {rate}%'),
  roundOff: z.string().trim().min(1).max(80).default('Round Off'),
  otherCharges: z.string().trim().min(1).max(80).default('Other Charges'),
});
export type TallySettings = z.infer<typeof tallySettingsSchema>;
export const TALLY_DEFAULTS: TallySettings = tallySettingsSchema.parse({});

export function getTallySettings(db: DB): TallySettings {
  const row = db.select().from(schema.setting).where(eq(schema.setting.key, 'tally')).get();
  if (!row) return { ...TALLY_DEFAULTS };
  try { return tallySettingsSchema.parse(JSON.parse(row.value)); } catch { return { ...TALLY_DEFAULTS }; }
}

export function saveTallySettings(db: DB, ctx: Ctx, input: TallySettings): TallySettings {
  const before = getTallySettings(db);
  db.transaction((tx) => {
    tx.insert(schema.setting).values({ key: 'tally', value: JSON.stringify(input) }).onConflictDoUpdate({ target: schema.setting.key, set: { value: JSON.stringify(input), updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` } }).run();
    audit(tx, ctx, { entity: 'setting', entityId: 'tally', action: 'update', before, after: input });
  });
  return input;
}

// ---------- helpers ----------
export const xmlEscape = (v: unknown) => String(v ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
const rupees = (paise: number) => (paise / 100).toFixed(2);
const r2 = (paise: number) => Math.round(paise) / 100;
const ymd = (iso: string) => iso.replace(/-/g, '');
const dmy = (iso: string, sep = '/') => iso.split('-').reverse().join(sep);
/** Format a GST rate for a ledger name: 5 → "5", 2.5 → "2.5". */
const rateText = (n: number) => String(Math.round(n * 100) / 100);
const ledger = (pattern: string, rate: number) => pattern.replace(/\{rate\}/g, rateText(rate));
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const between = (col: AnySQLiteColumn, from: string, to: string) => and(gte(col, from), lte(col, to));

interface TaxBucket { rate: number; taxable: number; cgst: number; sgst: number; igst: number }
function bucketByRate<T extends { gstRatePct: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }>(lines: T[]): TaxBucket[] {
  const m = new Map<number, TaxBucket>();
  for (const l of lines) {
    const b = m.get(l.gstRatePct) ?? { rate: l.gstRatePct, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    b.taxable += l.taxablePaise; b.cgst += l.cgstPaise; b.sgst += l.sgstPaise; b.igst += l.igstPaise;
    m.set(l.gstRatePct, b);
  }
  return [...m.values()].sort((a, b) => a.rate - b.rate);
}

// ---------- Tally XML ----------
interface Entry { ledger: string; amountPaise: number }
/** Tally convention: negative AMOUNT = debit (ISDEEMEDPOSITIVE Yes), positive = credit. Entries in a voucher sum to zero. */
function entryXml(e: Entry) {
  if (e.amountPaise === 0) return '';
  const deemed = e.amountPaise < 0 ? 'Yes' : 'No';
  return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${deemed}</ISDEEMEDPOSITIVE><AMOUNT>${rupees(e.amountPaise)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
}
function voucherXml(v: { type: string; date: string; number: string; party: string; partyGstin?: string | null; reference?: string | null; referenceDate?: string | null; narration: string; entries: Entry[] }) {
  const entries = v.entries.map(entryXml).join('');
  const ref = v.reference ? `<REFERENCE>${xmlEscape(v.reference)}</REFERENCE>${v.referenceDate ? `<REFERENCEDATE>${ymd(v.referenceDate)}</REFERENCEDATE>` : ''}` : '';
  const gstin = v.partyGstin ? `<PARTYGSTIN>${xmlEscape(v.partyGstin)}</PARTYGSTIN>` : '';
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${xmlEscape(v.type)}" ACTION="Create" OBJVIEW="Invoice Voucher View"><DATE>${ymd(v.date)}</DATE><EFFECTIVEDATE>${ymd(v.date)}</EFFECTIVEDATE><VOUCHERTYPENAME>${xmlEscape(v.type)}</VOUCHERTYPENAME><VOUCHERNUMBER>${xmlEscape(v.number)}</VOUCHERNUMBER>${ref}<PARTYLEDGERNAME>${xmlEscape(v.party)}</PARTYLEDGERNAME><PARTYNAME>${xmlEscape(v.party)}</PARTYNAME><BASICBUYERNAME>${xmlEscape(v.party)}</BASICBUYERNAME>${gstin}<NARRATION>${xmlEscape(v.narration)}</NARRATION><ISINVOICE>Yes</ISINVOICE><PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>${entries}</VOUCHER></TALLYMESSAGE>`;
}

export type TallyKind = 'sales' | 'purchases' | 'both';
/** TallyPrime "Import Data → Vouchers" XML for posted documents in the range. Cancelled documents are skipped. */
export function tallyXml(db: DB, from: string, to: string, kind: TallyKind): { xml: string; counts: { sales: number; creditNotes: number; purchases: number; debitNotes: number } } {
  const s = getTallySettings(db);
  const store = db.select().from(schema.store).where(eq(schema.store.id, 1)).get()!;
  const company = s.companyName || store.legalName || store.name;
  const vouchers: string[] = [];
  const counts = { sales: 0, creditNotes: 0, purchases: 0, debitNotes: 0 };

  if (kind !== 'purchases') {
    const sales = db.select().from(schema.sale).where(and(eq(schema.sale.status, 'posted'), between(schema.sale.date, from, to))).orderBy(asc(schema.sale.date), asc(schema.sale.id)).all();
    const lines = sales.length ? db.select({ saleId: schema.saleLine.saleId, gstRatePct: schema.saleLine.gstRatePct, taxablePaise: schema.saleLine.taxablePaise, cgstPaise: schema.saleLine.cgstPaise, sgstPaise: schema.saleLine.sgstPaise, igstPaise: schema.saleLine.igstPaise }).from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(eq(schema.sale.status, 'posted'), between(schema.sale.date, from, to))).all() : [];
    const bySale = new Map<number, typeof lines>();
    for (const l of lines) (bySale.get(l.saleId) ?? bySale.set(l.saleId, []).get(l.saleId)!).push(l);
    for (const sale of sales) {
      const party = sale.customerGstin && sale.customerName ? sale.customerName : sale.customerName && sale.creditPaise > 0 ? sale.customerName : s.cashLedger;
      const entries: Entry[] = [{ ledger: party, amountPaise: -sale.totalPaise }];
      for (const b of bucketByRate(bySale.get(sale.id) ?? [])) {
        entries.push({ ledger: ledger(s.salesLedgerPattern, b.rate), amountPaise: b.taxable });
        if (b.igst) entries.push({ ledger: ledger(s.igstOut, b.rate), amountPaise: b.igst });
        else { entries.push({ ledger: ledger(s.cgstOut, b.rate / 2), amountPaise: b.cgst }); entries.push({ ledger: ledger(s.sgstOut, b.rate / 2), amountPaise: b.sgst }); }
      }
      entries.push({ ledger: s.roundOff, amountPaise: sale.roundOffPaise });
      vouchers.push(voucherXml({ type: 'Sales', date: sale.date, number: sale.invoiceNo ?? String(sale.id), party, partyGstin: sale.customerGstin, narration: `Bill ${sale.invoiceNo ?? sale.id}${sale.customerName ? ` · ${sale.customerName}` : ' · Walk-in'}`, entries }));
      counts.sales++;
    }
    const returns = db.select({ id: schema.saleReturn.id, creditNoteNo: schema.saleReturn.creditNoteNo, date: schema.saleReturn.date, taxablePaise: schema.saleReturn.taxablePaise, cgstPaise: schema.saleReturn.cgstPaise, sgstPaise: schema.saleReturn.sgstPaise, igstPaise: schema.saleReturn.igstPaise, totalPaise: schema.saleReturn.totalPaise, reason: schema.saleReturn.reason, invoiceNo: schema.sale.invoiceNo, customerName: schema.sale.customerName, customerGstin: schema.sale.customerGstin, creditPaise: schema.sale.creditPaise })
      .from(schema.saleReturn).innerJoin(schema.sale, eq(schema.sale.id, schema.saleReturn.saleId)).where(between(schema.saleReturn.date, from, to)).orderBy(asc(schema.saleReturn.date), asc(schema.saleReturn.id)).all();
    const rlines = returns.length ? db.select({ returnId: schema.saleReturnLine.saleReturnId, gstRatePct: schema.saleLine.gstRatePct, taxablePaise: schema.saleReturnLine.taxablePaise, cgstPaise: schema.saleReturnLine.cgstPaise, sgstPaise: schema.saleReturnLine.sgstPaise, igstPaise: schema.saleReturnLine.igstPaise }).from(schema.saleReturnLine).innerJoin(schema.saleLine, eq(schema.saleLine.id, schema.saleReturnLine.saleLineId)).innerJoin(schema.saleReturn, eq(schema.saleReturn.id, schema.saleReturnLine.saleReturnId)).where(between(schema.saleReturn.date, from, to)).all() : [];
    const byReturn = new Map<number, typeof rlines>();
    for (const l of rlines) (byReturn.get(l.returnId) ?? byReturn.set(l.returnId, []).get(l.returnId)!).push(l);
    for (const cn of returns) {
      const party = cn.customerGstin && cn.customerName ? cn.customerName : cn.customerName && cn.creditPaise > 0 ? cn.customerName : s.cashLedger;
      const entries: Entry[] = [{ ledger: party, amountPaise: cn.totalPaise }];
      let accounted = 0;
      for (const b of bucketByRate(byReturn.get(cn.id) ?? [])) {
        entries.push({ ledger: ledger(s.salesLedgerPattern, b.rate), amountPaise: -b.taxable });
        if (b.igst) entries.push({ ledger: ledger(s.igstOut, b.rate), amountPaise: -b.igst });
        else { entries.push({ ledger: ledger(s.cgstOut, b.rate / 2), amountPaise: -b.cgst }); entries.push({ ledger: ledger(s.sgstOut, b.rate / 2), amountPaise: -b.sgst }); }
        accounted += b.taxable + b.cgst + b.sgst + b.igst;
      }
      entries.push({ ledger: s.roundOff, amountPaise: -(cn.totalPaise - accounted) });
      vouchers.push(voucherXml({ type: 'Credit Note', date: cn.date, number: cn.creditNoteNo ?? `CN-${cn.id}`, party, partyGstin: cn.customerGstin, reference: cn.invoiceNo, narration: `Credit note against bill ${cn.invoiceNo ?? ''} · ${cn.reason}`, entries }));
      counts.creditNotes++;
    }
  }

  if (kind !== 'sales') {
    const purchases = db.select({ p: schema.purchase, supplierName: schema.supplier.name, supplierGstin: schema.supplier.gstin }).from(schema.purchase).innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchase.supplierId)).where(and(eq(schema.purchase.status, 'posted'), between(schema.purchase.invoiceDate, from, to))).orderBy(asc(schema.purchase.invoiceDate), asc(schema.purchase.id)).all();
    const plines = purchases.length ? db.select({ purchaseId: schema.purchaseLine.purchaseId, gstRatePct: schema.purchaseLine.gstRatePct, taxablePaise: schema.purchaseLine.taxablePaise, cgstPaise: schema.purchaseLine.cgstPaise, sgstPaise: schema.purchaseLine.sgstPaise, igstPaise: schema.purchaseLine.igstPaise }).from(schema.purchaseLine).innerJoin(schema.purchase, eq(schema.purchase.id, schema.purchaseLine.purchaseId)).where(and(eq(schema.purchase.status, 'posted'), between(schema.purchase.invoiceDate, from, to))).all() : [];
    const byPurchase = new Map<number, typeof plines>();
    for (const l of plines) (byPurchase.get(l.purchaseId) ?? byPurchase.set(l.purchaseId, []).get(l.purchaseId)!).push(l);
    for (const { p, supplierName, supplierGstin } of purchases) {
      const entries: Entry[] = [{ ledger: supplierName, amountPaise: p.totalPaise }];
      for (const b of bucketByRate(byPurchase.get(p.id) ?? [])) {
        entries.push({ ledger: ledger(s.purchaseLedgerPattern, b.rate), amountPaise: -b.taxable });
        if (b.igst) entries.push({ ledger: ledger(s.igstIn, b.rate), amountPaise: -b.igst });
        else { entries.push({ ledger: ledger(s.cgstIn, b.rate / 2), amountPaise: -b.cgst }); entries.push({ ledger: ledger(s.sgstIn, b.rate / 2), amountPaise: -b.sgst }); }
      }
      entries.push({ ledger: s.otherCharges, amountPaise: -p.otherChargesPaise });
      entries.push({ ledger: s.roundOff, amountPaise: -p.roundOffPaise });
      vouchers.push(voucherXml({ type: 'Purchase', date: p.invoiceDate, number: p.grnNo ?? String(p.id), party: supplierName, partyGstin: supplierGstin, reference: p.invoiceNo, referenceDate: p.invoiceDate, narration: `Supplier invoice ${p.invoiceNo} dated ${dmy(p.invoiceDate)} · GRN ${p.grnNo ?? ''}`, entries }));
      counts.purchases++;
    }
    const prs = db.select({ pr: schema.purchaseReturn, supplierName: schema.supplier.name, supplierGstin: schema.supplier.gstin }).from(schema.purchaseReturn).innerJoin(schema.supplier, eq(schema.supplier.id, schema.purchaseReturn.supplierId)).where(and(eq(schema.purchaseReturn.status, 'posted'), between(schema.purchaseReturn.date, from, to))).orderBy(asc(schema.purchaseReturn.date), asc(schema.purchaseReturn.id)).all();
    const prlines = prs.length ? db.select({ returnId: schema.purchaseReturnLine.purchaseReturnId, gstRatePct: schema.purchaseReturnLine.gstRatePct, taxablePaise: schema.purchaseReturnLine.taxablePaise, taxPaise: schema.purchaseReturnLine.taxPaise }).from(schema.purchaseReturnLine).innerJoin(schema.purchaseReturn, eq(schema.purchaseReturn.id, schema.purchaseReturnLine.purchaseReturnId)).where(and(eq(schema.purchaseReturn.status, 'posted'), between(schema.purchaseReturn.date, from, to))).all() : [];
    const byPr = new Map<number, typeof prlines>();
    for (const l of prlines) (byPr.get(l.returnId) ?? byPr.set(l.returnId, []).get(l.returnId)!).push(l);
    for (const { pr, supplierName, supplierGstin } of prs) {
      const inter = pr.igstPaise > 0;
      const lines = (byPr.get(pr.id) ?? []).map((l) => { const c = inter ? 0 : Math.round(l.taxPaise / 2); return { gstRatePct: l.gstRatePct, taxablePaise: l.taxablePaise, cgstPaise: c, sgstPaise: inter ? 0 : l.taxPaise - c, igstPaise: inter ? l.taxPaise : 0 }; });
      const entries: Entry[] = [{ ledger: supplierName, amountPaise: -pr.totalPaise }];
      let accounted = 0;
      for (const b of bucketByRate(lines)) {
        entries.push({ ledger: ledger(s.purchaseLedgerPattern, b.rate), amountPaise: b.taxable });
        if (b.igst) entries.push({ ledger: ledger(s.igstIn, b.rate), amountPaise: b.igst });
        else { entries.push({ ledger: ledger(s.cgstIn, b.rate / 2), amountPaise: b.cgst }); entries.push({ ledger: ledger(s.sgstIn, b.rate / 2), amountPaise: b.sgst }); }
        accounted += b.taxable + b.cgst + b.sgst + b.igst;
      }
      entries.push({ ledger: s.roundOff, amountPaise: pr.totalPaise - accounted });
      vouchers.push(voucherXml({ type: 'Debit Note', date: pr.date, number: pr.docNo ?? `PR-${pr.id}`, party: supplierName, partyGstin: supplierGstin, reference: pr.supplierRef, narration: `Return to supplier${pr.route === 'supply_invoice' ? ' (our tax invoice)' : ' (supplier credit note)'} · ${pr.docNo ?? ''}`, entries }));
      counts.debitNotes++;
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>\n${vouchers.join('\n')}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
  return { xml, counts };
}

// ---------- e-Invoice (GST INV-01 schema v1.1) ----------
function pinFrom(text: string | null | undefined): number {
  const m = (text ?? '').match(/\b[1-9]\d{5}\b/);
  return m ? Number(m[0]) : 0;
}

function b2bSales(db: DB, from: string, to: string) {
  return db.select({ s: schema.sale, address: schema.customer.address, city: schema.customer.city }).from(schema.sale).leftJoin(schema.customer, eq(schema.customer.id, schema.sale.customerId))
    .where(and(eq(schema.sale.status, 'posted'), between(schema.sale.date, from, to), isNotNull(schema.sale.customerGstin))).orderBy(asc(schema.sale.date), asc(schema.sale.id)).all();
}

/** Master-data problems that would make the IRP reject the JSON. Fix these first. */
export function einvoiceCheck(db: DB, from: string, to: string) {
  const store = db.select().from(schema.store).where(eq(schema.store.id, 1)).get()!;
  const seller: string[] = [];
  if (!store.gstin) seller.push('Store GSTIN is missing');
  else if (!GSTIN_RE.test(store.gstin)) seller.push('Store GSTIN is not a valid 15-character GSTIN');
  else if (store.gstin.slice(0, 2) !== store.stateCode) seller.push(`Store GSTIN starts with state ${store.gstin.slice(0, 2)} but the store state code is ${store.stateCode}`);
  if (!/^[1-9]\d{5}$/.test(store.pincode)) seller.push('Store PIN code must be 6 digits');
  if (!store.addressLine1) seller.push('Store address line 1 is empty');
  if (!store.city) seller.push('Store city is empty');
  if (store.gstScheme === 'composition') seller.push('Composition dealers cannot issue e-invoices (bills of supply are outside e-invoicing)');
  const rows = b2bSales(db, from, to);
  const lines = rows.length ? db.select({ saleId: schema.saleLine.saleId, hsn: schema.saleLine.hsn }).from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(eq(schema.sale.status, 'posted'), between(schema.sale.date, from, to), isNotNull(schema.sale.customerGstin))).all() : [];
  const badHsn = new Set(lines.filter((l) => !/^\d{4,8}$/.test(l.hsn)).map((l) => l.saleId));
  const bills = rows.map(({ s, address }) => {
    const problems: string[] = [];
    const g = s.customerGstin!;
    if (!GSTIN_RE.test(g)) problems.push('Buyer GSTIN is not a valid 15-character GSTIN');
    if (!s.customerName) problems.push('Buyer name is missing');
    if (!address) problems.push('Buyer address is missing on the customer record');
    else if (!pinFrom(address)) problems.push('Buyer PIN code not found in the address (add the 6-digit PIN)');
    if ((s.invoiceNo ?? '').length > 16) problems.push(`Invoice number has ${s.invoiceNo!.length} characters; the IRP allows 16 (shorten the invoice prefix under Settings → Store for future bills)`);
    if (badHsn.has(s.id)) problems.push('An item on this bill has an HSN shorter than 4 digits');
    return { saleId: s.id, invoiceNo: s.invoiceNo, date: s.date, customerId: s.customerId, customerName: s.customerName, gstin: g, totalPaise: s.totalPaise, problems };
  });
  return { seller, bills, total: bills.length, withProblems: bills.filter((b) => b.problems.length).length };
}

export function einvoiceJson(db: DB, from: string, to: string) {
  const store = db.select().from(schema.store).where(eq(schema.store.id, 1)).get()!;
  const sellerDtls = { Gstin: store.gstin ?? '', LglNm: store.legalName || store.name, TrdNm: store.name, Addr1: store.addressLine1 || '-', ...(store.addressLine2 ? { Addr2: store.addressLine2 } : {}), Loc: store.city || '-', Pin: Number(store.pincode) || 0, Stcd: store.stateCode, ...(store.phone ? { Ph: store.phone } : {}), ...(store.email ? { Em: store.email } : {}) };
  const rows = b2bSales(db, from, to);
  const lines = rows.length ? db.select().from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(eq(schema.sale.status, 'posted'), between(schema.sale.date, from, to), isNotNull(schema.sale.customerGstin))).orderBy(asc(schema.saleLine.id)).all().map((r) => r.sale_line) : [];
  const bySale = new Map<number, typeof lines>();
  for (const l of lines) (bySale.get(l.saleId) ?? bySale.set(l.saleId, []).get(l.saleId)!).push(l);
  const buyer = (s: typeof rows[number]['s'], address: string | null, city: string | null) => ({ Gstin: s.customerGstin!, LglNm: s.customerName ?? '-', Pos: s.customerGstin!.slice(0, 2), Addr1: address ?? '-', Loc: city ?? store.city ?? '-', Pin: pinFrom(address), Stcd: s.customerGstin!.slice(0, 2) });

  const invoices = rows.map(({ s, address, city }) => {
    const items = (bySale.get(s.id) ?? []).map((l, i) => {
      const preTaxGross = l.grossPaise / (1 + l.gstRatePct / 100); // MRP is tax-inclusive; the IRP wants pre-tax price × qty − discount = assessable
      const totAmt = Math.round(preTaxGross);
      const discount = totAmt - l.taxablePaise;
      return { SlNo: String(i + 1), PrdDesc: l.itemName, IsServc: 'N', HsnCd: l.hsn, BchDtls: { Nm: l.batchNo, ExpDt: dmy(l.expiryDate) }, Qty: l.qty, Unit: 'NOS', UnitPrice: Math.round((preTaxGross / l.qty) / 100 * 1000) / 1000, TotAmt: r2(totAmt), Discount: r2(discount), AssAmt: r2(l.taxablePaise), GstRt: l.gstRatePct, CgstAmt: r2(l.cgstPaise), SgstAmt: r2(l.sgstPaise), IgstAmt: r2(l.igstPaise), TotItemVal: r2(l.taxablePaise + l.cgstPaise + l.sgstPaise + l.igstPaise) };
    });
    return {
      Version: '1.1', TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' }, DocDtls: { Typ: 'INV', No: s.invoiceNo ?? String(s.id), Dt: dmy(s.date) },
      SellerDtls: sellerDtls, BuyerDtls: buyer(s, address, city), ItemList: items,
      ValDtls: { AssVal: r2(s.taxablePaise), CgstVal: r2(s.cgstPaise), SgstVal: r2(s.sgstPaise), IgstVal: r2(s.igstPaise), RndOffAmt: r2(s.roundOffPaise), TotInvVal: r2(s.totalPaise) },
    };
  });

  // Credit notes against B2B bills in the range (Typ CRN) — reported through the same IRP flow.
  const cns = db.select({ cn: schema.saleReturn, s: schema.sale, address: schema.customer.address, city: schema.customer.city }).from(schema.saleReturn).innerJoin(schema.sale, eq(schema.sale.id, schema.saleReturn.saleId)).leftJoin(schema.customer, eq(schema.customer.id, schema.sale.customerId))
    .where(and(between(schema.saleReturn.date, from, to), isNotNull(schema.sale.customerGstin))).orderBy(asc(schema.saleReturn.date)).all();
  const cnLines = cns.length ? db.select({ rl: schema.saleReturnLine, l: schema.saleLine }).from(schema.saleReturnLine).innerJoin(schema.saleLine, eq(schema.saleLine.id, schema.saleReturnLine.saleLineId)).innerJoin(schema.saleReturn, eq(schema.saleReturn.id, schema.saleReturnLine.saleReturnId)).innerJoin(schema.sale, eq(schema.sale.id, schema.saleReturn.saleId)).where(and(between(schema.saleReturn.date, from, to), isNotNull(schema.sale.customerGstin))).all() : [];
  const byCn = new Map<number, typeof cnLines>();
  for (const x of cnLines) (byCn.get(x.rl.saleReturnId) ?? byCn.set(x.rl.saleReturnId, []).get(x.rl.saleReturnId)!).push(x);
  const creditNotes = cns.map(({ cn, s, address, city }) => {
    const items = (byCn.get(cn.id) ?? []).map(({ rl, l }, i) => ({ SlNo: String(i + 1), PrdDesc: l.itemName, IsServc: 'N', HsnCd: l.hsn, BchDtls: { Nm: l.batchNo, ExpDt: dmy(l.expiryDate) }, Qty: rl.qtyUnits, Unit: 'NOS', UnitPrice: Math.round((rl.taxablePaise / rl.qtyUnits) / 100 * 1000) / 1000, TotAmt: r2(rl.taxablePaise), Discount: 0, AssAmt: r2(rl.taxablePaise), GstRt: l.gstRatePct, CgstAmt: r2(rl.cgstPaise), SgstAmt: r2(rl.sgstPaise), IgstAmt: r2(rl.igstPaise), TotItemVal: r2(rl.taxablePaise + rl.cgstPaise + rl.sgstPaise + rl.igstPaise) }));
    const tax = cn.taxablePaise + cn.cgstPaise + cn.sgstPaise + cn.igstPaise;
    return {
      Version: '1.1', TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' }, DocDtls: { Typ: 'CRN', No: cn.creditNoteNo ?? `CN-${cn.id}`, Dt: dmy(cn.date) },
      SellerDtls: sellerDtls, BuyerDtls: buyer(s, address, city), ItemList: items, RefDtls: { PrecDocDtls: [{ InvNo: s.invoiceNo ?? String(s.id), InvDt: dmy(s.date) }] },
      ValDtls: { AssVal: r2(cn.taxablePaise), CgstVal: r2(cn.cgstPaise), SgstVal: r2(cn.sgstPaise), IgstVal: r2(cn.igstPaise), RndOffAmt: r2(cn.totalPaise - tax), TotInvVal: r2(cn.totalPaise) },
    };
  });
  return [...invoices, ...creditNotes];
}

// ---------- GSTR-1 offline-tool JSON ----------
const HSN_DESC: Record<string, string> = { '3003': 'Medicaments (bulk)', '3004': 'Medicaments in retail packs', '3005': 'Wadding, gauze, bandages', '3006': 'Pharmaceutical goods', '3822': 'Diagnostic kits', '9018': 'Medical instruments', '9027': 'Diagnostic instruments', '3304': 'Cosmetics', '3401': 'Soap', '3808': 'Disinfectants', '2106': 'Food supplements', '1905': 'Baby food / biscuits', '4818': 'Sanitary articles', '6307': 'Face masks', '9619': 'Sanitary napkins, diapers' };

export function gstr1Json(db: DB, from: string, to: string) {
  const store = db.select().from(schema.store).where(eq(schema.store.id, 1)).get()!;
  const rep = gstr1(db, from, to);
  const fp = `${to.slice(5, 7)}${to.slice(0, 4)}`;
  const pos = store.stateCode;
  const itm = (r: { ratePct: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }, num: number) => ({ num, itm_det: { txval: r2(r.taxablePaise), rt: r.ratePct, camt: r2(r.cgstPaise), samt: r2(r.sgstPaise), iamt: r2(r.igstPaise), csamt: 0 } });

  // B2B invoices with per-rate items
  const b2bLines = db.select({ saleId: schema.sale.id, invoiceNo: schema.sale.invoiceNo, date: schema.sale.date, gstin: schema.sale.customerGstin, totalPaise: schema.sale.totalPaise, ratePct: schema.saleLine.gstRatePct, taxablePaise: sql<number>`sum(${schema.saleLine.taxablePaise})`, cgstPaise: sql<number>`sum(${schema.saleLine.cgstPaise})`, sgstPaise: sql<number>`sum(${schema.saleLine.sgstPaise})`, igstPaise: sql<number>`sum(${schema.saleLine.igstPaise})` })
    .from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId)).where(and(eq(schema.sale.status, 'posted'), between(schema.sale.date, from, to), isNotNull(schema.sale.customerGstin))).groupBy(schema.sale.id, schema.saleLine.gstRatePct).orderBy(asc(schema.sale.date), asc(schema.sale.id), asc(schema.saleLine.gstRatePct)).all();
  const b2bMap = new Map<string, Map<number, { inum: string; idt: string; val: number; pos: string; rchrg: 'N'; inv_typ: 'R'; itms: ReturnType<typeof itm>[] }>>();
  for (const l of b2bLines) {
    const ctin = l.gstin!;
    const invs = b2bMap.get(ctin) ?? b2bMap.set(ctin, new Map()).get(ctin)!;
    const inv = invs.get(l.saleId) ?? invs.set(l.saleId, { inum: l.invoiceNo ?? String(l.saleId), idt: dmy(l.date, '-'), val: r2(l.totalPaise), pos: ctin.slice(0, 2), rchrg: 'N', inv_typ: 'R', itms: [] }).get(l.saleId)!;
    inv.itms.push(itm(l, inv.itms.length + 1));
  }
  const b2b = [...b2bMap.entries()].map(([ctin, invs]) => ({ ctin, inv: [...invs.values()] }));

  const b2cs = rep.b2cByRate.map((r) => ({ sply_ty: 'INTRA', rt: r.ratePct, typ: 'OE', pos, txval: r2(r.taxablePaise), camt: r2(r.cgstPaise), samt: r2(r.sgstPaise), iamt: r2(r.igstPaise), csamt: 0 }));

  const hsnAgg = new Map<string, { hsn_sc: string; desc: string; uqc: 'NOS'; qty: number; txval: number; camt: number; samt: number; iamt: number; csamt: 0; rt: number }>();
  for (const h of [...rep.hsnB2B, ...rep.hsnB2C]) {
    const key = `${h.hsn}|${h.ratePct}`;
    const a = hsnAgg.get(key) ?? hsnAgg.set(key, { hsn_sc: h.hsn, desc: HSN_DESC[h.hsn.slice(0, 4)] ?? `Goods (HSN ${h.hsn})`, uqc: 'NOS', qty: 0, txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0, rt: h.ratePct }).get(key)!;
    a.qty += h.qtyUnits; a.txval += h.taxablePaise; a.camt += h.cgstPaise; a.samt += h.sgstPaise; a.iamt += h.igstPaise;
  }
  const hsn = { data: [...hsnAgg.values()].map((a, i) => ({ num: i + 1, hsn_sc: a.hsn_sc, desc: a.desc, uqc: a.uqc, qty: a.qty, rt: a.rt, txval: r2(a.txval), camt: r2(a.camt), samt: r2(a.samt), iamt: r2(a.iamt), csamt: 0 })) };

  // Credit notes: registered (cdnr) grouped by GSTIN, unregistered (cdnur)
  const cnLines = db.select({ id: schema.saleReturn.id, creditNoteNo: schema.saleReturn.creditNoteNo, date: schema.saleReturn.date, totalPaise: schema.saleReturn.totalPaise, gstin: schema.sale.customerGstin, invoiceNo: schema.sale.invoiceNo, ratePct: schema.saleLine.gstRatePct, taxablePaise: sql<number>`sum(${schema.saleReturnLine.taxablePaise})`, cgstPaise: sql<number>`sum(${schema.saleReturnLine.cgstPaise})`, sgstPaise: sql<number>`sum(${schema.saleReturnLine.sgstPaise})`, igstPaise: sql<number>`sum(${schema.saleReturnLine.igstPaise})` })
    .from(schema.saleReturnLine).innerJoin(schema.saleReturn, eq(schema.saleReturn.id, schema.saleReturnLine.saleReturnId)).innerJoin(schema.sale, eq(schema.sale.id, schema.saleReturn.saleId)).innerJoin(schema.saleLine, eq(schema.saleLine.id, schema.saleReturnLine.saleLineId))
    .where(between(schema.saleReturn.date, from, to)).groupBy(schema.saleReturn.id, schema.saleLine.gstRatePct).orderBy(asc(schema.saleReturn.date), asc(schema.saleReturn.id)).all();
  const cdnrMap = new Map<string, Map<number, Record<string, unknown> & { itms: ReturnType<typeof itm>[] }>>();
  const cdnurMap = new Map<number, Record<string, unknown> & { itms: ReturnType<typeof itm>[] }>();
  for (const l of cnLines) {
    const base = { ntty: 'C', nt_num: l.creditNoteNo ?? `CN-${l.id}`, nt_dt: dmy(l.date, '-'), val: r2(l.totalPaise), pos, rchrg: 'N', inv_typ: 'R', itms: [] as ReturnType<typeof itm>[] };
    if (l.gstin) {
      const m = cdnrMap.get(l.gstin) ?? cdnrMap.set(l.gstin, new Map()).get(l.gstin)!;
      const nt = m.get(l.id) ?? m.set(l.id, { ...base, pos: l.gstin.slice(0, 2) }).get(l.id)!;
      nt.itms.push(itm(l, nt.itms.length + 1));
    } else {
      const nt = cdnurMap.get(l.id) ?? cdnurMap.set(l.id, { ...base, typ: 'B2CL' }).get(l.id)!;
      nt.itms.push(itm(l, nt.itms.length + 1));
    }
  }
  const cdnr = [...cdnrMap.entries()].map(([ctin, m]) => ({ ctin, nt: [...m.values()] }));
  const cdnur = [...cdnurMap.values()];

  const d = rep.documents;
  const cnDocs = db.select({ first: sql<string>`min(${schema.saleReturn.creditNoteNo})`, last: sql<string>`max(${schema.saleReturn.creditNoteNo})`, total: sql<number>`count(*)` }).from(schema.saleReturn).where(between(schema.saleReturn.date, from, to)).get()!;
  const doc_det = [{ doc_num: 1, docs: [{ num: 1, from: d.first ?? '', to: d.last ?? '', totnum: d.total, cancel: d.cancelled ?? 0, net_issue: d.total - (d.cancelled ?? 0) }] }];
  if (cnDocs.total > 0) doc_det.push({ doc_num: 5, docs: [{ num: 1, from: cnDocs.first ?? '', to: cnDocs.last ?? '', totnum: cnDocs.total, cancel: 0, net_issue: cnDocs.total }] });

  const nil = { inv: [{ sply_ty: 'INTRB2C', expt_amt: 0, nil_amt: r2(rep.nilExempt.taxablePaise), ngsup_amt: 0 }] };
  return { gstin: store.gstin ?? '', fp, version: 'GST3.2.2', hash: 'hash', b2b, b2cs, cdnr, cdnur, nil, hsn, doc_issue: { doc_det } };
}
