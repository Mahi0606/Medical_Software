import { describe, expect, it } from 'vitest';
import { computeSaleLine, invoiceKind, splitInclusive, summariseByRate } from '../src/gst.js';
import { roundToRupee, toPaise } from '../src/money.js';

describe('GST back-calculation from tax-inclusive MRP', () => {
  it('splits 5% from ₹105.00', () => {
    const s = splitInclusive(10500, 5);
    expect(s.taxablePaise).toBe(10000);
    expect(s.cgstPaise + s.sgstPaise).toBe(500);
    expect(s.totalPaise).toBe(10500);
  });
  it('splits 12% from ₹56.00 with paise rounding preserved', () => {
    const s = splitInclusive(5600, 12);
    expect(s.taxablePaise + s.cgstPaise + s.sgstPaise).toBe(5600);
    expect(s.taxablePaise).toBe(5000);
  });
  it('handles nil-rated', () => {
    const s = splitInclusive(9900, 0);
    expect(s.taxablePaise).toBe(9900);
    expect(s.cgstPaise).toBe(0);
  });
  it('IGST when interstate', () => {
    const s = splitInclusive(11800, 18, true);
    expect(s.igstPaise).toBe(1800);
    expect(s.cgstPaise).toBe(0);
  });
});

describe('sale line', () => {
  it('applies percentage discount before tax split', () => {
    const l = computeSaleLine({ unitPricePaise: 10000, qty: 2, discountPct: 10, gstRatePct: 12, scheme: 'regular' });
    expect(l.grossPaise).toBe(20000);
    expect(l.discountPaise).toBe(2000);
    expect(l.netPaise).toBe(18000);
    expect(l.taxablePaise + l.cgstPaise + l.sgstPaise).toBe(18000);
  });
  it('composition scheme shows no tax', () => {
    const l = computeSaleLine({ unitPricePaise: 10000, qty: 1, gstRatePct: 12, scheme: 'composition' });
    expect(l.cgstPaise).toBe(0);
    expect(l.taxablePaise).toBe(10000);
  });
  it('caps discount at gross', () => {
    const l = computeSaleLine({ unitPricePaise: 100, qty: 1, discountPaise: 500, gstRatePct: 5, scheme: 'regular' });
    expect(l.netPaise).toBe(0);
  });
});

describe('invoice kind', () => {
  it('tax invoice for taxable only', () => expect(invoiceKind('regular', [{ ratePct: 5 }])).toBe('TAX_INVOICE'));
  it('invoice-cum-bill of supply when mixed', () => expect(invoiceKind('regular', [{ ratePct: 5 }, { ratePct: 0 }])).toBe('INVOICE_CUM_BILL_OF_SUPPLY'));
  it('bill of supply for composition', () => expect(invoiceKind('composition', [{ ratePct: 5 }])).toBe('BILL_OF_SUPPLY'));
});

describe('rounding and summaries', () => {
  it('rounds invoice to nearest rupee', () => {
    expect(roundToRupee(12349)).toEqual({ roundedPaise: 12300, roundOffPaise: -49 });
    expect(roundToRupee(12350)).toEqual({ roundedPaise: 12400, roundOffPaise: 50 });
  });
  it('sums by rate', () => {
    const s = summariseByRate([splitInclusive(10500, 5), splitInclusive(21000, 5), splitInclusive(11200, 12)]);
    expect(s.map((r) => r.ratePct)).toEqual([5, 12]);
    expect(s[0]!.taxablePaise).toBe(30000);
  });
  it('parses rupee strings', () => {
    expect(toPaise('₹1,234.50')).toBe(123450);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });
});
