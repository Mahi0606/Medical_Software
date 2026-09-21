import { pct, roundHalfUp, type Paise } from './money.js';

export type GstScheme = 'regular' | 'composition';

export interface GstSplit {
  ratePct: number;
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  totalPaise: Paise;
}

/**
 * Indian MRP is inclusive of all taxes (Legal Metrology Rule 2(m), DPCO para 24).
 * Retail pharmacies therefore back-calculate tax from the selling price.
 *   taxable = inclusive * 100 / (100 + rate)
 */
export function splitInclusive(inclusivePaise: Paise, ratePct: number, interstate = false): GstSplit {
  if (ratePct <= 0) {
    return { ratePct: 0, taxablePaise: inclusivePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: inclusivePaise };
  }
  const taxablePaise = roundHalfUp((inclusivePaise * 100) / (100 + ratePct));
  const tax = inclusivePaise - taxablePaise;
  return allocateTax(taxablePaise, tax, ratePct, interstate);
}

/** For tax-exclusive pricing (e.g. purchase invoices quote PTR before GST). */
export function splitExclusive(taxablePaise: Paise, ratePct: number, interstate = false): GstSplit {
  const tax = pct(taxablePaise, ratePct);
  return allocateTax(taxablePaise, tax, ratePct, interstate);
}

function allocateTax(taxablePaise: Paise, tax: Paise, ratePct: number, interstate: boolean): GstSplit {
  if (interstate) {
    return { ratePct, taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: tax, totalPaise: taxablePaise + tax };
  }
  const cgstPaise = roundHalfUp(tax / 2);
  const sgstPaise = tax - cgstPaise;
  return { ratePct, taxablePaise, cgstPaise, sgstPaise, igstPaise: 0, totalPaise: taxablePaise + tax };
}

export interface SaleLineCalcInput {
  /** Selling price per billed unit, tax inclusive (paise). */
  unitPricePaise: Paise;
  /** Number of billed units (strips, or loose units if unitMode = 'unit'). */
  qty: number;
  discountPct?: number;
  /** Absolute discount on the line in paise (applied after percentage). */
  discountPaise?: Paise;
  gstRatePct: number;
  interstate?: boolean;
  scheme: GstScheme;
}

export interface SaleLineComputed extends GstSplit {
  grossPaise: Paise;
  discountPaise: Paise;
  netPaise: Paise;
}

/** Computes one invoice line. Under the composition scheme no tax is collected or shown. */
export function computeSaleLine(input: SaleLineCalcInput): SaleLineComputed {
  const grossPaise = roundHalfUp(input.unitPricePaise * input.qty);
  let discountPaise = pct(grossPaise, input.discountPct ?? 0) + (input.discountPaise ?? 0);
  if (discountPaise > grossPaise) discountPaise = grossPaise;
  const netPaise = grossPaise - discountPaise;
  const split =
    input.scheme === 'composition'
      ? { ratePct: input.gstRatePct, taxablePaise: netPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: netPaise }
      : splitInclusive(netPaise, input.gstRatePct, input.interstate ?? false);
  return { grossPaise, discountPaise, netPaise, ...split };
}

export interface RateSummary {
  ratePct: number;
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
}

export function summariseByRate(lines: GstSplit[]): RateSummary[] {
  const map = new Map<number, RateSummary>();
  for (const l of lines) {
    const cur = map.get(l.ratePct) ?? { ratePct: l.ratePct, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
    cur.taxablePaise += l.taxablePaise;
    cur.cgstPaise += l.cgstPaise;
    cur.sgstPaise += l.sgstPaise;
    cur.igstPaise += l.igstPaise;
    map.set(l.ratePct, cur);
  }
  return [...map.values()].sort((a, b) => a.ratePct - b.ratePct);
}

/** Document title per CGST Rules 46 / 46A and the composition scheme (s.10). */
export function invoiceKind(scheme: GstScheme, lines: { ratePct: number }[]): 'TAX_INVOICE' | 'BILL_OF_SUPPLY' | 'INVOICE_CUM_BILL_OF_SUPPLY' {
  if (scheme === 'composition') return 'BILL_OF_SUPPLY';
  const hasTaxable = lines.some((l) => l.ratePct > 0);
  const hasExempt = lines.some((l) => l.ratePct === 0);
  if (hasTaxable && hasExempt) return 'INVOICE_CUM_BILL_OF_SUPPLY';
  if (hasExempt) return 'BILL_OF_SUPPLY';
  return 'TAX_INVOICE';
}

export const GST_RATES = [0, 5, 12, 18, 28] as const;
