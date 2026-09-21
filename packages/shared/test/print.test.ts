import { describe, expect, it } from 'vitest';
import { ESCPOS, asciiSafe, escposOpenDrawer, escposReceipt, escposTestPage, expandRows, tsplLabels, tsplTestLabel, wrap, zplLabels, zplTestLabel, type PrintLabelDatum, type PrintLabelTemplate, type ReceiptSale, type ReceiptStore } from '../src/index.js';

const template: PrintLabelTemplate = { kind: 'product', widthMm: 50, heightMm: 25, columns: 1, gapMm: 3, marginMm: 1.5, fontScale: 1, symbology: 'code128', fields: ['itemName', 'batch', 'expiry', 'mrp', 'pack', 'barcode', 'barcodeText'] };
const datum: PrintLabelDatum = { copies: 3, storeName: 'Om Medical Stores', itemName: 'Augmentin 625 Duo Tablet', generic: 'Amoxicillin 500 mg + Clavulanic acid 125 mg', batchNo: 'AUG2451', expiry: '08/27', expiryIso: '2027-08-31', mfg: '09/25', mrpPaise: 22300, pack: '10 tablets / strip', rack: 'B1', schedule: 'H', packedOn: '19/09/2026', barcodeValue: 'PB000123', barcodeText: 'PB000123', gs1Value: '0108901234567890172708311AUG2451', gtin: '08901234567890' };

describe('TSPL', () => {
  const out = tsplLabels({ template, labels: [datum], dpi: 203, darkness: 10, speed: 3 });
  it('sets up a 50 x 25 mm label with gap, density and speed', () => {
    expect(out.startsWith('SIZE 50 mm,25 mm\r\nGAP 3 mm,0 mm\r\nDIRECTION 1\r\n')).toBe(true);
    expect(out).toContain('DENSITY 10');
    expect(out).toContain('SPEED 3');
  });
  it('prints the three copies in one PRINT block with the batch barcode', () => {
    expect(out).toContain('CLS');
    expect(out).toMatch(/BARCODE \d+,\d+,"128",\d+,0,0,3,6,"PB000123"/);
    expect(out).toContain('PRINT 3,1');
    expect((out.match(/PRINT /g) ?? []).length).toBe(1);
  });
  it('places text inside the label and uses Rs. for the MRP', () => {
    expect(out).toContain('"MRP Rs.223.00"');
    expect(out).toContain('Augmentin 625 Duo Tablet');
    expect(out).toContain('"Exp 08/27"');
    for (const m of out.matchAll(/TEXT (\d+),(\d+),/g)) { expect(Number(m[1])).toBeLessThan(400); expect(Number(m[2])).toBeLessThan(200); }
  });
  it('fills two-up rows and expands copies like the label sheet', () => {
    const rows = expandRows({ columns: 2 }, [{ copies: 3, id: 'a' }, { copies: 1, id: 'b' }]);
    expect(rows.map((r) => ({ ids: r.row.map((d) => d.id), count: r.count }))).toEqual([{ ids: ['a', 'a'], count: 1 }, { ids: ['a', 'b'], count: 1 }]);
    const two = tsplLabels({ template: { ...template, widthMm: 38, columns: 2 }, labels: [{ ...datum, copies: 2 }], dpi: 203 });
    expect(two).toContain('SIZE 79 mm,25 mm');
    expect(two).toContain('PRINT 1,1');
    expect((two.match(/BARCODE /g) ?? []).length).toBe(2);
  });
  it('uses EAN13, DMATRIX and QRCODE by symbology', () => {
    expect(tsplLabels({ template: { ...template, symbology: 'ean13' }, labels: [datum], dpi: 203 })).toMatch(/"EAN13",\d+,0,0,\d,\d+,"890123456789"/);
    expect(tsplLabels({ template: { ...template, symbology: 'datamatrix' }, labels: [datum], dpi: 203 })).toMatch(/DMATRIX \d+,\d+,\d+,\d+,x\d+,"0108901234567890172708311AUG2451"/);
    expect(tsplLabels({ template: { ...template, symbology: 'qrcode' }, labels: [{ ...datum, gtin: null, gs1Value: null }], dpi: 203 })).toMatch(/QRCODE \d+,\d+,M,\d+,A,0,"PB000123"/);
  });
  it('escapes quotes and scales coordinates at 300 dpi', () => {
    expect(tsplLabels({ template, labels: [{ ...datum, itemName: 'Say "hi" 5\\6' }], dpi: 203 })).toContain(`"Say 'hi' 5/6"`);
    const hi = tsplLabels({ template, labels: [datum], dpi: 300 });
    const ys = [...hi.matchAll(/BARCODE \d+,(\d+),/g)].map((m) => Number(m[1]));
    expect(ys[0]).toBeGreaterThan(150);
    expect(tsplTestLabel(template, 203)).toContain('PRINT 1,1');
  });
});

describe('ZPL', () => {
  const out = zplLabels({ template, labels: [datum], dpi: 203 });
  it('wraps each row in ^XA…^XZ with width, length and quantity', () => {
    expect(out.startsWith('^XA')).toBe(true);
    expect(out.trimEnd().endsWith('^XZ')).toBe(true);
    expect(out).toContain('^PW400^LL200');
    expect(out).toContain('^PQ3^XZ');
    expect(out).toMatch(/\^BY3,2,\d+\^BCN,\d+,N,N,N\^FDPB000123\^FS/);
    expect(out).toContain('^FDMRP Rs.223.00^FS');
  });
  it('encodes EAN-13, DataMatrix and QR', () => {
    expect(zplLabels({ template: { ...template, symbology: 'ean13' }, labels: [datum], dpi: 203 })).toMatch(/\^BEN,\d+,N,N\^FD890123456789\^FS/);
    expect(zplLabels({ template: { ...template, symbology: 'datamatrix' }, labels: [{ ...datum, gs1Value: `0108901234567890\x1d10AUG2451` }], dpi: 203 })).toContain('^BXN,');
    expect(zplLabels({ template: { ...template, symbology: 'datamatrix' }, labels: [{ ...datum, gs1Value: `0108901234567890\x1d10AUG2451` }], dpi: 203 })).toContain('^FH^FD0108901234567890_1D10AUG2451^FS');
    expect(zplLabels({ template: { ...template, symbology: 'qrcode' }, labels: [datum], dpi: 203 })).toMatch(/\^BQN,2,\d+\^FH\^FDMA,0108901234567890172708311AUG2451\^FS/);
    expect(zplTestLabel(template, 203)).toContain('^XZ');
  });
  it('hex-escapes ZPL control characters in field data', () => {
    expect(zplLabels({ template, labels: [{ ...datum, itemName: 'A^B~C_D' }], dpi: 203 })).toContain('A_5EB_7EC_5FD');
  });
});

const store: ReceiptStore = { name: 'Om Medical Stores', addressLine1: '12 MG Road', addressLine2: null, city: 'Pune', pincode: '411001', phone: '9876543210', email: null, gstin: '27ABCDE1234F1Z5', gstScheme: 'regular', pharmacistName: 'R. Kulkarni', pharmacistRegNo: 'MH-12345', footerNote: null, upiId: 'om@upi', licences: [{ type: 'FORM_20', number: 'MH-PZ-123' }, { type: 'FORM_21', number: 'MH-PZ-124' }] };
const sale: ReceiptSale = {
  invoiceNo: 'INV/26-27/00042', kind: 'TAX_INVOICE', date: '2026-09-19', createdAt: '2026-09-19T05:30:00.000Z', status: 'posted', customerName: 'S. Iyer', customerPhone: '9999999999', customerGstin: null, doctorName: 'Dr. Rao', doctorRegNo: 'MMC-1', patientName: 'S. Iyer', patientAddress: null, patientAge: 42, strictestSchedule: 'H',
  grossPaise: 22300, discountPaise: 1115, taxablePaise: 18915, cgstPaise: 1135, sgstPaise: 1135, igstPaise: 0, roundOffPaise: 0, totalPaise: 21185, creditPaise: 0, createdByName: 'Mahi', pharmacist: null,
  lines: [{ itemName: 'Augmentin 625 Duo Tablet', genericText: 'Amoxicillin 500 mg + Clavulanic acid 125 mg', batchNo: 'AUG2451', expiryDate: '2027-08-31', schedule: 'H', unitMode: 'pack', qty: 1, packName: 'strip', baseUnit: 'tablet', mrpPaise: 22300, unitPricePaise: 22300, discountPct: 5, netPaise: 21185, gstRatePct: 12, taxablePaise: 18915, cgstPaise: 1135, sgstPaise: 1135, igstPaise: 0 }],
  payments: [{ mode: 'upi', amountPaise: 21185, reference: 'UPI123' }],
};

describe('ESC/POS', () => {
  const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join(' ');
  const text = (u: Uint8Array) => String.fromCharCode(...u);
  it('starts with ESC @ and ends with the cut command', () => {
    const out = escposReceipt({ sale, store, width: 80 });
    expect(hex(out.slice(0, 2))).toBe('1b 40');
    expect(hex(out.slice(-4))).toBe('1d 56 42 00');
    expect(hex(escposTestPage(58).slice(-4))).toBe('1d 56 42 00');
  });
  it('sends the drawer pulse only when asked', () => {
    expect(hex(escposReceipt({ sale, store, width: 80, openDrawer: true }))).toContain('1b 70 00 19 fa');
    expect(hex(escposReceipt({ sale, store, width: 80 }))).not.toContain('1b 70 00 19 fa');
    expect(hex(escposOpenDrawer())).toBe('1b 40 1b 70 00 19 fa');
  });
  it('replaces the rupee sign and keeps the content order', () => {
    const t = text(escposReceipt({ sale, store, width: 80 }));
    expect(t).not.toContain('₹');
    expect(t).toContain('Rs.211.85');
    const order = ['Om Medical Stores', 'DL 20: MH-PZ-123', 'Tax Invoice', 'Bill No: INV/26-27/00042', 'Rx Prescriber: Dr. Rao', 'Augmentin 625 Duo Tablet [Sch H]', 'B: AUG2451 Exp 08/27', 'CGST 6% + SGST 6%', 'TOTAL', 'Rupees', 'Paid: UPI 211.85 (UPI123)', 'GST%', 'Thank you', 'Registered Pharmacist'];
    let pos = -1;
    for (const s of order) { const i = t.indexOf(s); expect(i, s).toBeGreaterThan(pos); pos = i; }
    expect(t).not.toContain('Taxable value\n');
  });
  it('keeps every text line within the column width', () => {
    for (const width of [58, 80] as const) {
      const lines = text(escposReceipt({ sale, store, width })).replace(/\x1b[@atEd].|\x1d[!V]../g, '').split('\n');
      const w = width === 58 ? 32 : 42;
      for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(w);
    }
  });
  it('emits every copy with its own cut, escaping only ASCII', () => {
    const one = escposReceipt({ sale, store, width: 58 });
    const two = escposReceipt({ sale, store, width: 58, copies: 2 });
    expect((hex(two).match(/1d 56 42 00/g) ?? []).length).toBe(2);
    expect(two.length).toBeGreaterThan(one.length * 1.9);
    for (const b of two) expect(b).toBeLessThan(0x80);
  });
});

describe('text helpers', () => {
  it('asciiSafe and wrap', () => {
    expect(asciiSafe('MRP ₹125.00 · Exp 08/27 — café')).toBe('MRP Rs.125.00 - Exp 08/27 - cafe');
    expect(wrap('Amoxicillin 500 mg + Clavulanic acid 125 mg', 20, 3)).toEqual(['Amoxicillin 500 mg +', '   Clavulanic acid', '   125 mg']);
    expect(wrap('Supercalifragilisticexpialidocious', 10)).toEqual(['Supercalif', 'ragilistic', 'expialidoc', 'ious']);
  });
});

describe('constants', () => {
  it('exposes the raw command bytes', () => {
    expect([...ESCPOS.cut]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });
});
