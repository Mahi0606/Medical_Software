import { parseExpiry } from './dates.js';

/**
 * Barcode payload classification for the billing / GRN scan input.
 * Sources seen in Indian pharmacies:
 *  - EAN-13 / EAN-8 / UPC-A on cartons and OTC packs (GTIN only)
 *  - GS1 DataMatrix / QR with Application Identifiers (01 GTIN, 10 batch, 17 expiry, 11 mfg, 21 serial)
 *  - GS1 Digital Link URLs (https://.../01/<gtin>/10/<lot>?17=<yymmdd>)
 *  - Free-text QR under Schedule H2 (GSR 823(E)) — "Batch No: X, Exp: MM/YYYY" style
 *  - Our own Code 128 labels: PB<batchId> (batch) and PI<itemId> (item)
 */
export type ScanResult =
  | { kind: 'internal_batch'; batchId: number; raw: string }
  | { kind: 'internal_item'; itemId: number; raw: string }
  | { kind: 'gtin'; gtin: string; raw: string }
  | { kind: 'gs1'; gtin?: string; batch?: string; expiry?: string; mfg?: string; serial?: string; raw: string }
  | { kind: 'text'; gtin?: string; batch?: string; expiry?: string; brand?: string; raw: string }
  | { kind: 'unknown'; raw: string };

/** Group Separator (FNC1 rendering in scanned GS1 data). */
export const GS = String.fromCharCode(29);
const INTERNAL_BATCH = /^PB(\d{1,12})$/i;
const INTERNAL_ITEM = /^PI(\d{1,12})$/i;

/** Fixed-length AIs (data length after the AI). Everything else is variable, GS-terminated. */
const FIXED_AI: Record<string, number> = {
  '00': 18, '01': 14, '02': 14, '03': 14, '04': 16,
  '11': 6, '12': 6, '13': 6, '14': 6, '15': 6, '16': 6, '17': 6, '18': 6, '19': 6,
  '20': 2, '31': 6, '32': 6, '33': 6, '34': 6, '35': 6, '36': 6, '41': 13,
};

export function classifyScan(rawInput: string): ScanResult {
  const raw = rawInput.replace(/[\r\n]+$/g, '');
  let s = raw.trim();
  if (!s) return { kind: 'unknown', raw };

  let m: RegExpMatchArray | null;
  if ((m = s.match(INTERNAL_BATCH))) return { kind: 'internal_batch', batchId: Number(m[1]), raw };
  if ((m = s.match(INTERNAL_ITEM))) return { kind: 'internal_item', itemId: Number(m[1]), raw };

  // Symbology identifiers from scanners: ]d2 (GS1 DataMatrix), ]Q3 (GS1 QR), ]C1 (GS1-128), ]e0 (DataBar)
  const aim = s.match(/^\](d2|Q3|C1|e0)/);
  if (aim) s = s.slice(3);

  if (/^\d{8}$|^\d{12,14}$/.test(s) && validGtinCheck(s)) {
    return { kind: 'gtin', gtin: s.padStart(14, '0'), raw };
  }

  const digitalLink = parseDigitalLink(s);
  if (digitalLink) return digitalLink;

  if (aim || s.includes(GS) || /^01\d{14}/.test(s)) {
    const parsed = parseGs1Elements(s);
    if (parsed.gtin || parsed.batch || parsed.expiry) return { kind: 'gs1', ...parsed, raw };
  }

  const text = parseFreeText(s);
  if (text.batch || text.expiry || text.gtin) return { kind: 'text', ...text, raw };

  return { kind: 'unknown', raw };
}

export interface Gs1Elements {
  gtin?: string;
  batch?: string;
  expiry?: string;
  mfg?: string;
  serial?: string;
}

/** Parses a GS1 element string (FNC1 rendered as GS or absent). */
export function parseGs1Elements(input: string): Gs1Elements {
  const out: Gs1Elements = {};
  let i = 0;
  const s = input.replace(/^\](d2|Q3|C1|e0)/, '');
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    const ai2 = s.slice(i, i + 2);
    let ai = ai2;
    const len = FIXED_AI[ai2];
    if (len === undefined) {
      if (/^(10|21|22|30|37|90|91|92|93|94|95|96|97|98|99)$/.test(ai2)) ai = ai2;
      else if (/^(24|25|40|70|71|72|80|81|82)\d$/.test(s.slice(i, i + 3))) ai = s.slice(i, i + 3);
      else if (/^(70|71|72|80|81|82)\d\d$/.test(s.slice(i, i + 4))) ai = s.slice(i, i + 4);
      else break; // unknown AI; stop parsing
      i += ai.length;
      const end = s.indexOf(GS, i);
      const value = end === -1 ? s.slice(i) : s.slice(i, end);
      i = end === -1 ? s.length : end + 1;
      assign(out, ai, value);
      continue;
    }
    i += 2;
    const value = s.slice(i, i + len);
    i += len;
    assign(out, ai, value);
  }
  return out;
}

function assign(out: Gs1Elements, ai: string, value: string) {
  switch (ai) {
    case '01': case '02': out.gtin = value; break;
    case '10': out.batch = value; break;
    case '17': out.expiry = parseExpiry(value) ?? undefined; break;
    case '11': out.mfg = parseExpiry(value) ?? undefined; break;
    case '21': out.serial = value; break;
  }
}

function parseDigitalLink(s: string): ScanResult | null {
  if (!/^https?:\/\//i.test(s)) return null;
  const gt = s.match(/\/01\/(\d{8,14})/);
  if (!gt) return null;
  const batch = s.match(/\/10\/([^\/?#]+)/)?.[1] ?? s.match(/[?&]10=([^&]+)/)?.[1];
  const exp = s.match(/[?&]17=(\d{6})/)?.[1] ?? s.match(/\/17\/(\d{6})/)?.[1];
  const serial = s.match(/\/21\/([^\/?#]+)/)?.[1];
  return {
    kind: 'gs1',
    gtin: gt[1]!.padStart(14, '0'),
    batch: batch ? decodeURIComponent(batch) : undefined,
    expiry: exp ? parseExpiry(exp) ?? undefined : undefined,
    serial: serial ? decodeURIComponent(serial) : undefined,
    raw: s,
  };
}

/** Best-effort extraction from Schedule H2 free-text QR payloads. */
export function parseFreeText(s: string): { gtin?: string; batch?: string; expiry?: string; brand?: string } {
  const out: { gtin?: string; batch?: string; expiry?: string; brand?: string } = {};
  const batch = s.match(/(?:batch\s*(?:no\.?|number)?|b\.?\s*no\.?|lot(?:\s*no\.?)?)\s*[:=#\-]?\s*([A-Z0-9][A-Z0-9\-\/.]{1,24})/i);
  if (batch) out.batch = batch[1]!;
  const exp = s.match(/(?:exp(?:iry)?(?:\s*date)?|use\s*before|best\s*before)\s*[:=\-]?\s*(\d{4}-\d{2}(?:-\d{2})?|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\/\-.]\d{2,4}|[A-Za-z]{3}[\s\-\/]?\d{2,4})/i);
  if (exp) out.expiry = parseExpiry(monthWordToNumber(exp[1]!)) ?? undefined;
  const gtin = s.match(/(?:gtin|ean|upc)\s*[:=\-]?\s*(\d{8}|\d{12,14})/i);
  if (gtin && validGtinCheck(gtin[1]!)) out.gtin = gtin[1]!.padStart(14, '0');
  const brand = s.match(/(?:brand(?:\s*name)?|product(?:\s*name)?)\s*[:=\-]\s*([^\n;|,]{2,60})/i);
  if (brand) out.brand = brand[1]!.trim();
  return out;
}

function monthWordToNumber(v: string): string {
  const m = v.match(/^([A-Za-z]{3})[\s\-\/]?(\d{2,4})$/);
  if (!m) return v;
  const idx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1]!.toLowerCase());
  if (idx < 0) return v;
  return `${String(idx + 1).padStart(2, '0')}/${m[2]}`;
}

/** GS1 mod-10 check digit validation for GTIN-8/12/13/14. */
export function validGtinCheck(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  const arr = digits.split('').map(Number);
  const check = arr.pop()!;
  let sum = 0;
  let weight = 3;
  for (let i = arr.length - 1; i >= 0; i--) {
    sum += arr[i]! * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** Our internal codes printed on in-store labels (Code 128). */
export function internalBatchCode(batchId: number): string {
  return `PB${String(batchId).padStart(6, '0')}`;
}
export function internalItemCode(itemId: number): string {
  return `PI${String(itemId).padStart(6, '0')}`;
}

/** Builds a GS1 element string (with GS separators) for a DataMatrix label. */
export function buildGs1ElementString(parts: { gtin: string; batch?: string; expiryIso?: string }): string {
  let s = `01${parts.gtin.padStart(14, '0')}`;
  if (parts.expiryIso) s += `17${parts.expiryIso.slice(2, 4)}${parts.expiryIso.slice(5, 7)}${parts.expiryIso.slice(8, 10)}`;
  if (parts.batch) s += `10${parts.batch}`;
  return s;
}
