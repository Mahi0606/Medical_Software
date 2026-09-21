import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { addDays, saleSchema, todayIST } from '@pharma/shared';
import { schema } from '../src/db/index.js';
import { analytics } from '../src/services/analytics.js';
import { einvoiceCheck, einvoiceJson, getTallySettings, gstr1Json, saveTallySettings, tallyXml, xmlEscape } from '../src/services/exports.js';
import { postPurchase, postPurchaseReturn } from '../src/services/purchase.js';
import { gstr1 } from '../src/services/reports.js';
import { cancelSale, postSale, postSaleReturn } from '../src/services/sales.js';
import { seedItem, testDb } from './helpers.js';

const sale = (o: Record<string, unknown>) => saleSchema.parse({ clientRef: `ref-${Math.random()}`, ...o });
const today = todayIST();
const from = `${today.slice(0, 8)}01`;

/** Store with GST identity, a registered buyer, a supplier with '&' in the name, then a mix of documents. */
function scenario() {
  const t = testDb();
  t.db.update(schema.store).set({ gstin: '27ABCDE1234F1Z5', legalName: 'Test Pharmacy LLP', addressLine1: '1 MG Road', city: 'Pune', pincode: '411001', stateCode: '27' }).where(eq(schema.store.id, 1)).run();
  t.db.update(schema.supplier).set({ name: 'Mehta & Sons <Pharma>', gstin: '27AAACM1234A1Z1' }).where(eq(schema.supplier.id, t.supplierId)).run();
  const b2bCustomerId = t.db.insert(schema.customer).values({ name: 'Ruby Clinic Pvt Ltd', phone: '9888888888', gstin: '27AABCR1234B1Z9', address: '5 FC Road, Pune 411004', city: 'Pune' }).returning({ id: schema.customer.id }).get().id;
  const a = seedItem(t.db, t.owner, { name: 'Dolo 650', generic: 'Paracetamol 650 mg', mrp: 3000, rate: 2000, packs: 20, unitsPerPack: 15, supplierId: t.supplierId });
  const b = seedItem(t.db, t.owner, { name: 'Dettol 125ml', generic: 'Chloroxylenol 4.8 %', gst: 18, mrp: 9500, rate: 7000, packs: 10, unitsPerPack: 1, supplierId: t.supplierId, batchNo: 'D1' });
  // B2B bill with two rates and a 5% line discount
  const b2b = postSale(t.db, t.owner, sale({ customerId: b2bCustomerId, lines: [{ batchId: a.batchId, unitMode: 'pack', qty: 3, discountPct: 5 }, { batchId: b.batchId, unitMode: 'pack', qty: 2 }], payments: [{ mode: 'cash', amountPaise: 100000 }] }), null);
  // Walk-in cash bill
  const walkIn = postSale(t.db, t.owner, sale({ lines: [{ batchId: a.batchId, unitMode: 'pack', qty: 2 }], payments: [{ mode: 'cash', amountPaise: 6000 }] }), null);
  // A cancelled bill that must never appear
  const cancelled = postSale(t.db, t.owner, sale({ lines: [{ batchId: b.batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 9500 }] }), null);
  cancelSale(t.db, t.owner, cancelled.id, 'test');
  // Credit note on the walk-in bill
  const cn = postSaleReturn(t.db, t.owner, { saleId: walkIn.id, reason: 'unopened', refundMode: 'cash', date: today, lines: [{ saleLineId: walkIn.lines[0]!.id, qtyUnits: 15 }] });
  // Purchase and a return to the supplier
  const itemId = a.itemId;
  const p = postPurchase(t.db, t.owner, { supplierId: t.supplierId, invoiceNo: 'M&S/1', invoiceDate: today, receivedDate: today, interstate: false, otherChargesPaise: 0, notes: null, printLabels: false, lines: [{ itemId, batchNo: 'P1', expiryDate: addDays(today, 400), qtyPacks: 10, freePacks: 0, ratePaise: 2400, discountPct: 0, mrpPaise: 3000, gstRatePct: 5, hsn: '3004', mfgDate: null, schemeNote: null, gtin: null }] });
  const pr = postPurchaseReturn(t.db, t.owner, { supplierId: t.supplierId, date: today, route: 'credit_note', supplierRef: 'CN-77', notes: null, lines: [{ batchId: p.batches[0]!.batchId, qtyUnits: 15, reason: 'excess' }] });
  return { ...t, b2b, walkIn, cancelled, cn, p, pr, b2bCustomerId };
}

describe('exports', () => {
  it('escapes XML', () => {
    expect(xmlEscape('Mehta & Sons <"P">\'s')).toBe('Mehta &amp; Sons &lt;&quot;P&quot;&gt;&apos;s');
  });

  it('builds well-formed Tally vouchers for sales, credit notes, purchases and debit notes, skipping cancelled bills', () => {
    const s = scenario();
    const { xml, counts } = tallyXml(s.db, from, today, 'both');
    expect(counts).toEqual({ sales: 2, creditNotes: 1, purchases: 1, debitNotes: 1 });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xml).toContain('<SVCURRENTCOMPANY>Test Pharmacy LLP</SVCURRENTCOMPANY>');
    // balanced tags
    const opens = (xml.match(/<VOUCHER /g) ?? []).length;
    const closes = (xml.match(/<\/VOUCHER>/g) ?? []).length;
    expect(opens).toBe(5);
    expect(closes).toBe(opens);
    expect((xml.match(/<ALLLEDGERENTRIES.LIST>/g) ?? []).length).toBe((xml.match(/<\/ALLLEDGERENTRIES.LIST>/g) ?? []).length);
    expect((xml.match(/<TALLYMESSAGE /g) ?? []).length).toBe((xml.match(/<\/TALLYMESSAGE>/g) ?? []).length);
    // no raw ampersands or angle brackets in text nodes
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/);
    expect(xml).toContain('Mehta &amp; Sons &lt;Pharma&gt;');
    expect(xml).not.toContain('<Pharma>');
    expect(xml).toContain('VCHTYPE="Sales"');
    expect(xml).toContain('VCHTYPE="Credit Note"');
    expect(xml).toContain('VCHTYPE="Purchase"');
    expect(xml).toContain('VCHTYPE="Debit Note"');
    expect(xml).not.toContain(s.cancelled.invoiceNo!);
    // ledger names
    expect(xml).toContain('<LEDGERNAME>Sales @ 5%</LEDGERNAME>');
    expect(xml).toContain('<LEDGERNAME>Sales @ 18%</LEDGERNAME>');
    expect(xml).toContain('<LEDGERNAME>Output CGST @ 2.5%</LEDGERNAME>');
    expect(xml).toContain('<LEDGERNAME>Output SGST @ 9%</LEDGERNAME>');
    expect(xml).toContain('<LEDGERNAME>Input CGST @ 2.5%</LEDGERNAME>');
    expect(xml).toContain('<PARTYLEDGERNAME>Cash Sales</PARTYLEDGERNAME>');
    expect(xml).toContain('<PARTYLEDGERNAME>Ruby Clinic Pvt Ltd</PARTYLEDGERNAME>');
    expect(xml).toContain(`<DATE>${today.replace(/-/g, '')}</DATE>`);
    // every voucher balances to zero
    for (const v of xml.split('</VOUCHER>').slice(0, -1)) {
      const amounts = [...v.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => Math.round(Number(m[1]) * 100));
      expect(amounts.length).toBeGreaterThan(1);
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(0);
    }
    // sales-only and purchases-only filters
    expect(tallyXml(s.db, from, today, 'sales').counts).toEqual({ sales: 2, creditNotes: 1, purchases: 0, debitNotes: 0 });
    expect(tallyXml(s.db, from, today, 'purchases').counts).toEqual({ sales: 0, creditNotes: 0, purchases: 1, debitNotes: 1 });
  });

  it('applies configurable Tally ledger names', () => {
    const s = scenario();
    expect(getTallySettings(s.db).cashLedger).toBe('Cash Sales');
    saveTallySettings(s.db, s.owner, { ...getTallySettings(s.db), companyName: 'Books Co', cashLedger: 'Counter Cash', salesLedgerPattern: 'GST Sales {rate}', cgstOut: 'CGST Payable {rate}' });
    const { xml } = tallyXml(s.db, from, today, 'sales');
    expect(xml).toContain('<SVCURRENTCOMPANY>Books Co</SVCURRENTCOMPANY>');
    expect(xml).toContain('<PARTYLEDGERNAME>Counter Cash</PARTYLEDGERNAME>');
    expect(xml).toContain('<LEDGERNAME>GST Sales 5</LEDGERNAME>');
    expect(xml).toContain('<LEDGERNAME>CGST Payable 2.5</LEDGERNAME>');
    expect(s.db.select().from(schema.auditLog).where(eq(schema.auditLog.entity, 'setting')).all().length).toBe(1);
  });

  it('produces e-invoice JSON whose values equal the bill totals', () => {
    const s = scenario();
    const docs = einvoiceJson(s.db, from, today);
    const invs = docs.filter((d) => d.DocDtls.Typ === 'INV');
    expect(invs.length).toBe(1);
    const d = invs[0]!;
    expect(d.Version).toBe('1.1');
    expect(d.TranDtls).toMatchObject({ TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N' });
    expect(d.DocDtls.No).toBe(s.b2b.invoiceNo);
    expect(d.DocDtls.Dt).toBe(today.split('-').reverse().join('/'));
    expect(d.SellerDtls).toMatchObject({ Gstin: '27ABCDE1234F1Z5', LglNm: 'Test Pharmacy LLP', Pin: 411001, Stcd: '27', Loc: 'Pune' });
    expect(d.BuyerDtls).toMatchObject({ Gstin: '27AABCR1234B1Z9', LglNm: 'Ruby Clinic Pvt Ltd', Pos: '27', Stcd: '27', Pin: 411004 });
    const paise = (n: number) => Math.round(n * 100);
    expect(paise(d.ValDtls.TotInvVal)).toBe(s.b2b.totalPaise);
    expect(paise(d.ValDtls.AssVal)).toBe(s.b2b.taxablePaise);
    expect(paise(d.ValDtls.CgstVal)).toBe(s.b2b.cgstPaise);
    expect(paise(d.ValDtls.SgstVal)).toBe(s.b2b.sgstPaise);
    expect(paise(d.ValDtls.RndOffAmt)).toBe(s.b2b.roundOffPaise);
    expect(d.ItemList.length).toBe(2);
    expect(d.ItemList.reduce((a, i) => a + paise(i.AssAmt), 0)).toBe(s.b2b.taxablePaise);
    expect(d.ItemList.reduce((a, i) => a + paise(i.CgstAmt) + paise(i.SgstAmt), 0)).toBe(s.b2b.cgstPaise + s.b2b.sgstPaise);
    for (const i of d.ItemList) {
      expect(i.IsServc).toBe('N');
      expect(i.Unit).toBe('NOS');
      expect(i.HsnCd).toBe('3004');
      expect(paise(i.TotAmt) - paise(i.Discount)).toBe(paise(i.AssAmt));
      expect(paise(i.TotItemVal)).toBe(paise(i.AssAmt) + paise(i.CgstAmt) + paise(i.SgstAmt) + paise(i.IgstAmt));
      expect(i.BchDtls.Nm).toBeTruthy();
      expect(i.BchDtls.ExpDt).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    }
    // sum of item values reconciles to the invoice total up to round-off
    const itemsTotal = d.ItemList.reduce((a, i) => a + paise(i.TotItemVal), 0);
    expect(itemsTotal + s.b2b.roundOffPaise).toBe(s.b2b.totalPaise);
  });

  it('pre-check flags missing master data', () => {
    const s = scenario();
    // Default numbering INV/2026-27/00001 is 17 characters, one over the IRP limit — the check must say so and nothing else.
    const clean = einvoiceCheck(s.db, from, today);
    expect(clean).toMatchObject({ seller: [], total: 1, withProblems: 1 });
    expect(clean.bills[0]!.problems).toHaveLength(1);
    expect(clean.bills[0]!.problems[0]).toMatch(/16/);
    s.db.update(schema.store).set({ pincode: '' }).where(eq(schema.store.id, 1)).run();
    s.db.update(schema.customer).set({ address: null }).where(eq(schema.customer.id, s.b2bCustomerId)).run();
    const c = einvoiceCheck(s.db, from, today);
    expect(c.seller.some((m) => /PIN/.test(m))).toBe(true);
    expect(c.bills[0]!.problems.some((m) => /address/.test(m))).toBe(true);
    // Bill written with a mistyped GSTIN
    s.db.update(schema.sale).set({ customerGstin: '27ABC' }).where(eq(schema.sale.id, s.b2b.id)).run();
    expect(einvoiceCheck(s.db, from, today).bills[0]!.problems.some((m) => /GSTIN/.test(m))).toBe(true);
  });

  it('GSTR-1 JSON matches the GSTR-1 report', () => {
    const s = scenario();
    const j = gstr1Json(s.db, from, today);
    const rep = gstr1(s.db, from, today);
    expect(j.gstin).toBe('27ABCDE1234F1Z5');
    expect(j.fp).toBe(`${today.slice(5, 7)}${today.slice(0, 4)}`);
    const sum = (k: 'txval' | 'camt' | 'samt' | 'iamt') => j.b2cs.reduce((a, r) => a + Math.round(r[k] * 100), 0);
    expect(sum('txval')).toBe(rep.b2cByRate.reduce((a, r) => a + r.taxablePaise, 0));
    expect(sum('camt')).toBe(rep.b2cByRate.reduce((a, r) => a + r.cgstPaise, 0));
    expect(sum('samt')).toBe(rep.b2cByRate.reduce((a, r) => a + r.sgstPaise, 0));
    expect(j.b2cs.every((r) => r.sply_ty === 'INTRA' && r.typ === 'OE' && r.pos === '27' && r.csamt === 0)).toBe(true);
    expect(j.b2b).toHaveLength(1);
    expect(j.b2b[0]!.ctin).toBe('27AABCR1234B1Z9');
    const inv = j.b2b[0]!.inv[0]!;
    expect(inv).toMatchObject({ inum: s.b2b.invoiceNo, pos: '27', rchrg: 'N', inv_typ: 'R' });
    expect(Math.round(inv.val * 100)).toBe(s.b2b.totalPaise);
    expect(inv.itms.map((i) => i.itm_det.rt)).toEqual([5, 18]);
    expect(inv.itms.reduce((a, i) => a + Math.round(i.itm_det.txval * 100), 0)).toBe(s.b2b.taxablePaise);
    expect(j.hsn.data.length).toBeGreaterThan(0);
    expect(j.hsn.data.reduce((a, h) => a + Math.round(h.txval * 100), 0)).toBe([...rep.hsnB2B, ...rep.hsnB2C].reduce((a, h) => a + h.taxablePaise, 0));
    expect(j.cdnur).toHaveLength(1);
    expect(Math.round(j.cdnur[0]!.val as number * 100)).toBe(s.cn.totalPaise);
    expect(j.cdnr).toHaveLength(0);
    const docs = j.doc_issue.doc_det[0]!.docs[0]!;
    expect(docs).toMatchObject({ totnum: 3, cancel: 1, net_issue: 2 });
  });

  it('analytics returns a full month series and movers', () => {
    const s = scenario();
    const a = analytics(s.db, 12);
    expect(a.monthly).toHaveLength(12);
    expect(a.monthly[11]!.month).toBe(today.slice(0, 7));
    const cur = a.monthly[11]!;
    expect(cur.bills).toBe(2);
    expect(cur.salesPaise).toBe(s.b2b.totalPaise + s.walkIn.totalPaise);
    expect(cur.marginPaise).toBeGreaterThan(0);
    expect(cur.avgBillPaise).toBe(Math.round(cur.salesPaise / 2));
    expect(a.monthly.slice(0, 11).every((m) => m.bills === 0 && m.salesPaise === 0)).toBe(true);
    expect(a.topMovers.map((m) => m.name).sort()).toEqual(['Dettol 125ml', 'Dolo 650']);
    expect(a.topMovers[0]!.revenuePaise).toBeGreaterThanOrEqual(a.topMovers[1]!.revenuePaise);
    expect(a.topMovers.every((m) => m.changePct === 100 && m.units30Prev === 0)).toBe(true);
    expect(a.topMovers.find((m) => m.name === 'Dolo 650')!.units30).toBe(45 + 30 - 15);
    expect(a.suppliers[0]).toMatchObject({ name: 'Mehta & Sons <Pharma>', receipts: 1 });
    expect(a.suppliers[0]!.returnSharePct).toBeGreaterThan(0);
    expect(a.paymentMix.map((p) => p.mode)).toEqual(['cash']);
    expect(a.paymentMix[0]!.amountPaise).toBe(s.b2b.totalPaise + s.walkIn.totalPaise);
    expect(a.hourOfDay).toHaveLength(24);
    expect(a.hourOfDay.reduce((n, h) => n + h.bills, 0)).toBe(2);
    expect(analytics(s.db, 6).monthly).toHaveLength(6);
  });
});
