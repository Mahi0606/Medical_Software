import { formatDateIN, formatDateTimeIN, formatExpiry } from '../dates.js';
import { amountInWords } from '../format.js';
import { asciiSafe, center, leftRight, padLeft, padRight, wrap } from './text.js';

/** Structural subsets of the web app's PrintStore / PrintSale (invoice-print.tsx). */
export interface ReceiptStore {
  name: string; addressLine1: string; addressLine2: string | null; city: string; pincode: string; phone: string; email: string | null; gstin: string | null; gstScheme: 'regular' | 'composition';
  pharmacistName: string | null; pharmacistRegNo: string | null; footerNote: string | null; upiId: string | null; licences: { type: string; number: string }[];
}
export interface ReceiptSale {
  invoiceNo: string | null; kind: string; date: string; createdAt: string; status: string; customerName: string | null; customerPhone: string | null; customerGstin: string | null;
  doctorName: string | null; doctorRegNo: string | null; patientName: string | null; patientAddress: string | null; patientAge: number | null; strictestSchedule: string;
  grossPaise: number; discountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; roundOffPaise: number; totalPaise: number; creditPaise: number; createdByName: string | null;
  pharmacist: { name: string; regNo: string | null } | null;
  lines: { itemName: string; genericText: string | null; batchNo: string; expiryDate: string; schedule: string; unitMode: string; qty: number; packName: string; baseUnit: string; mrpPaise: number; unitPricePaise: number; discountPct: number; netPaise: number; gstRatePct: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }[];
  payments: { mode: string; amountPaise: number; reference: string | null }[];
}
export interface EscposOptions { sale: ReceiptSale; store: ReceiptStore; width: 58 | 80; openDrawer?: boolean; cut?: boolean; copies?: number }

const ESC = 0x1b, GS = 0x1d;
export const ESCPOS = {
  init: [ESC, 0x40], codepage437: [ESC, 0x74, 0x00],
  alignLeft: [ESC, 0x61, 0x00], alignCenter: [ESC, 0x61, 0x01], alignRight: [ESC, 0x61, 0x02],
  boldOn: [ESC, 0x45, 0x01], boldOff: [ESC, 0x45, 0x00],
  sizeNormal: [GS, 0x21, 0x00], sizeDoubleH: [GS, 0x21, 0x01], sizeDoubleWH: [GS, 0x21, 0x11],
  /** GS V 66 0: partial cut after feeding to the cutter. */ cut: [GS, 0x56, 0x42, 0x00],
  /** ESC p 0 25 250: pulse pin 2 for 50 ms on / 500 ms off. */ drawerPulse: [ESC, 0x70, 0x00, 0x19, 0xfa],
} as const;

const KIND_TITLE: Record<string, string> = { TAX_INVOICE: 'Tax Invoice', BILL_OF_SUPPLY: 'Bill of Supply', INVOICE_CUM_BILL_OF_SUPPLY: 'Invoice-cum-Bill of Supply' };
const LIC: Record<string, string> = { FORM_20: 'DL 20', FORM_21: 'DL 21', FORM_20F: 'DL 20F', FORM_20A: 'DL 20A', FORM_21A: 'DL 21A', FORM_20B: 'DL 20B', FORM_21B: 'DL 21B', FSSAI: 'FSSAI' };

class Buf {
  private b: number[] = [];
  raw(bytes: readonly number[]) { this.b.push(...bytes); return this; }
  text(s: string) { for (const ch of asciiSafe(s)) this.b.push(ch.charCodeAt(0)); return this; }
  line(s = '') { return this.text(s).raw([0x0a]); }
  lines(l: string[]) { for (const s of l) this.line(s); return this; }
  feed(n: number) { return this.raw([ESC, 0x64, Math.max(0, Math.min(255, n))]); }
  bytes() { return Uint8Array.from(this.b); }
}

const money = (paise: number) => (paise / 100).toFixed(2);

function receiptBody(buf: Buf, sale: ReceiptSale, store: ReceiptStore, w: number) {
  const rule = '-'.repeat(w);
  const composition = store.gstScheme === 'composition';
  const rates = Object.values(sale.lines.reduce<Record<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>>((acc, l) => { const r = (acc[l.gstRatePct] ??= { rate: l.gstRatePct, taxable: 0, cgst: 0, sgst: 0, igst: 0 }); r.taxable += l.taxablePaise; r.cgst += l.cgstPaise; r.sgst += l.sgstPaise; r.igst += l.igstPaise; return acc; }, {})).sort((a, b) => a.rate - b.rate);
  const rx = sale.strictestSchedule !== 'NONE' || !!sale.doctorName;

  // Store header
  buf.raw(ESCPOS.alignCenter).raw(ESCPOS.boldOn).raw(ESCPOS.sizeDoubleH).lines(wrap(store.name, w)).raw(ESCPOS.sizeNormal).raw(ESCPOS.boldOff);
  buf.lines(wrap(`${store.addressLine1}${store.addressLine2 ? `, ${store.addressLine2}` : ''}, ${store.city} ${store.pincode}`, w));
  buf.lines(wrap(`Ph: ${store.phone}${store.email ? ` - ${store.email}` : ''}`, w));
  const lic = store.licences.filter((l) => LIC[l.type]).map((l) => `${LIC[l.type]}: ${l.number}`).join(' - ');
  if (lic) buf.lines(wrap(lic, w));
  if (store.gstin) buf.lines(wrap(`GSTIN: ${store.gstin}${composition ? ' - Composition taxable person, not eligible to collect tax on supplies' : ''}`, w));
  buf.line(rule);
  buf.raw(ESCPOS.boldOn).line(`${KIND_TITLE[sale.kind] ?? sale.kind}${sale.status === 'cancelled' ? ' (CANCELLED)' : ''}`).raw(ESCPOS.boldOff);
  buf.raw(ESCPOS.alignLeft);

  // Bill meta
  buf.line(`Bill No: ${sale.invoiceNo ?? ''}`);
  buf.line(`Date: ${formatDateTimeIN(sale.createdAt)}`);
  if (sale.customerName || sale.customerPhone) buf.lines(wrap(`Customer: ${sale.customerName ?? ''} ${sale.customerPhone ?? ''}`.trim(), w, 2));
  if (sale.customerGstin) buf.line(`Cust. GSTIN: ${sale.customerGstin}`);
  if (sale.createdByName) buf.line(`Billed by: ${sale.createdByName}`);

  // Rx block
  if (rx) {
    buf.line(rule);
    buf.lines(wrap(`Rx Prescriber: ${sale.doctorName ?? '-'}${sale.doctorRegNo ? ` (Reg. ${sale.doctorRegNo})` : ''}`, w, 3));
    buf.lines(wrap(`Patient: ${sale.patientName ?? '-'}${sale.patientAge ? `, ${sale.patientAge} y` : ''}${sale.patientAddress ? `, ${sale.patientAddress}` : ''}`, w, 3));
    if (sale.strictestSchedule !== 'NONE') {
      const ph = sale.pharmacist ? `: ${sale.pharmacist.name}${sale.pharmacist.regNo ? ` (${sale.pharmacist.regNo})` : ''}` : store.pharmacistName ? `: ${store.pharmacistName} (${store.pharmacistRegNo ?? ''})` : '';
      buf.lines(wrap(`Schedule ${sale.strictestSchedule} medicine dispensed under the supervision of the registered pharmacist${ph}.`, w));
    }
  }

  // Items
  buf.line(rule);
  buf.raw(ESCPOS.boldOn).line(leftRight('#  Item / Batch / Exp', 'Amt', w)).line(leftRight('   Qty x Rate', '', w)).raw(ESCPOS.boldOff);
  buf.line(rule);
  sale.lines.forEach((l, i) => {
    const no = padRight(`${i + 1}.`, 3);
    buf.raw(ESCPOS.boldOn).lines(wrap(`${no}${l.itemName}${l.schedule !== 'NONE' ? ` [Sch ${l.schedule}]` : ''}`, w, 3)).raw(ESCPOS.boldOff);
    if (l.genericText) buf.line(`   ${asciiSafe(l.genericText).slice(0, w - 3)}`);
    buf.lines(wrap(`B: ${l.batchNo} Exp ${formatExpiry(l.expiryDate)} MRP ${money(l.mrpPaise)}${l.discountPct > 0 ? ` Disc ${l.discountPct}%` : ''}${!composition ? ` GST ${l.gstRatePct}%` : ''}`, w - 3).map((x) => `   ${x}`));
    const unit = l.unitMode === 'unit' ? l.baseUnit.slice(0, 3) : l.packName.slice(0, 3);
    buf.line(leftRight(`   ${l.qty} ${unit} x ${money(l.unitPricePaise)}`, money(l.netPaise), w));
  });
  buf.line(rule);

  // Totals
  const tot = (label: string, value: string) => buf.line(leftRight(label, value, w));
  tot('Gross', money(sale.grossPaise));
  if (sale.discountPaise > 0) tot('Discount', `-${money(sale.discountPaise)}`);
  if (!composition) tot('Taxable value', money(sale.taxablePaise));
  if (!composition) for (const r of rates.filter((x) => x.rate > 0)) {
    if (sale.igstPaise > 0) tot(`IGST ${r.rate}%`, money(r.igst));
    else tot(`CGST ${r.rate / 2}% + SGST ${r.rate / 2}%`, `${money(r.cgst)} + ${money(r.sgst)}`);
  }
  if (sale.roundOffPaise !== 0) tot('Round off', `${sale.roundOffPaise > 0 ? '+' : '-'}${money(Math.abs(sale.roundOffPaise))}`);
  buf.raw(ESCPOS.boldOn).raw(ESCPOS.sizeDoubleH).line(leftRight('TOTAL', `Rs.${money(sale.totalPaise)}`, w)).raw(ESCPOS.sizeNormal).raw(ESCPOS.boldOff);
  if (sale.discountPaise > 0) buf.line(`You saved Rs.${money(sale.discountPaise)}`);
  buf.lines(wrap(amountInWords(sale.totalPaise), w));
  const paid = sale.payments.map((p) => `${p.mode.toUpperCase()} ${money(p.amountPaise)}${p.reference ? ` (${p.reference})` : ''}`).join(', ') || '-';
  buf.lines(wrap(`Paid: ${paid}${sale.creditPaise > 0 ? ` - Credit Rs.${money(sale.creditPaise)}` : ''}`, w, 2));

  // Tax summary
  if (!composition && rates.length > 0) {
    const c = Math.floor((w - 5) / 3);
    buf.line(rule);
    buf.line(`GST% ${padLeft('Taxable', c)}${padLeft('CGST', c)}${padLeft('SGST', c)}`);
    for (const r of rates) buf.line(`${padRight(`${r.rate}%`, 5)}${padLeft(money(r.taxable), c)}${padLeft(money(r.cgst), c)}${padLeft(money(r.sgst), c)}`);
    if (sale.igstPaise > 0) buf.line(leftRight('IGST', money(sale.igstPaise), w));
  }

  // Footer
  buf.line(rule).raw(ESCPOS.alignCenter);
  if (store.upiId && sale.creditPaise > 0) buf.lines(wrap(`Pay balance via UPI: ${store.upiId}`, w));
  buf.lines(wrap(store.footerNote ?? 'Thank you. Get well soon.', w));
  buf.lines(wrap('Keep medicines out of reach of children. Check expiry before use.', w));
  if (store.pharmacistName || sale.pharmacist) buf.lines(wrap(`Registered Pharmacist: ${sale.pharmacist?.name ?? store.pharmacistName} ${sale.pharmacist?.regNo ?? store.pharmacistRegNo ?? ''}`.trim(), w));
  buf.lines(wrap(`Bill date ${formatDateIN(sale.date)} - This is a computer-generated bill.`, w));
  buf.raw(ESCPOS.alignLeft);
}

/** Raw ESC/POS bytes for a thermal receipt. 42 columns at 80 mm, 32 at 58 mm (Font A). */
export function escposReceipt({ sale, store, width, openDrawer = false, cut = true, copies = 1 }: EscposOptions): Uint8Array {
  const w = width === 58 ? 32 : 42;
  const buf = new Buf();
  const n = Math.max(1, Math.min(5, Math.floor(copies)));
  for (let i = 0; i < n; i++) {
    buf.raw(ESCPOS.init).raw(ESCPOS.codepage437);
    receiptBody(buf, sale, store, w);
    if (n > 1 && i > 0) buf.raw(ESCPOS.alignCenter).line(`(copy ${i + 1} of ${n})`).raw(ESCPOS.alignLeft);
    buf.feed(3);
    if (openDrawer && i === 0) buf.raw(ESCPOS.drawerPulse);
    if (cut) buf.raw(ESCPOS.cut);
  }
  return buf.bytes();
}

/** Column ruler and style samples so staff can confirm the paper width and that the printer accepts ESC/POS. */
export function escposTestPage(width: 58 | 80 = 80, cut = true): Uint8Array {
  const w = width === 58 ? 32 : 42;
  const buf = new Buf().raw(ESCPOS.init).raw(ESCPOS.codepage437).raw(ESCPOS.alignCenter);
  buf.raw(ESCPOS.boldOn).raw(ESCPOS.sizeDoubleWH).line('PRINTER TEST').raw(ESCPOS.sizeNormal).raw(ESCPOS.boldOff);
  buf.line(`${width} mm paper - ${w} columns`).raw(ESCPOS.alignLeft);
  buf.line('-'.repeat(w));
  buf.line('1234567890'.repeat(5).slice(0, w));
  buf.line(center('centred text', w));
  buf.raw(ESCPOS.boldOn).line('bold text').raw(ESCPOS.boldOff);
  buf.raw(ESCPOS.sizeDoubleH).line('double height').raw(ESCPOS.sizeNormal);
  buf.line(leftRight('Rs. amount right-aligned', 'Rs.1234.50', w));
  buf.line('-'.repeat(w));
  buf.line('If all lines fit the paper, the width setting is right.');
  buf.feed(3);
  if (cut) buf.raw(ESCPOS.cut);
  return buf.bytes();
}

/** Just the drawer kick (for "open drawer" without printing). */
export function escposOpenDrawer(): Uint8Array {
  return new Buf().raw(ESCPOS.init).raw(ESCPOS.drawerPulse).bytes();
}
