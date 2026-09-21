import type { LabelFieldKey } from '../schemas/label.js';
import { asciiSafe, rsText } from './text.js';

/** Structural subset of the web app's Template (LabelTemplateInput). */
export interface PrintLabelTemplate {
  kind: 'product' | 'loose' | 'shelf'; widthMm: number; heightMm: number; columns: number; gapMm: number; marginMm: number; fontScale: number;
  symbology: 'code128' | 'ean13' | 'datamatrix' | 'qrcode'; fields: readonly LabelFieldKey[];
}
/** Structural subset of the web app's LabelDatum. */
export interface PrintLabelDatum {
  copies: number; storeName: string; itemName: string; generic: string; batchNo: string; expiry: string; expiryIso: string; mfg: string | null;
  mrpPaise: number; pack: string; rack: string | null; schedule: string; packedOn: string; barcodeValue: string; barcodeText: string; gs1Value: string | null; gtin: string | null;
  loose?: { qtyText: string | null; patientName: string | null; directions: string | null } | undefined;
}

export interface Font<F> { spec: F; charW: number; charH: number }
/** Chooses the printer font closest to (not above) `targetH` dots. */
export type PickFont<F> = (targetH: number, bold: boolean) => Font<F>;

export interface TextOp<F> { kind: 'text'; x: number; y: number; font: Font<F>; text: string; align: 'left' | 'center' | 'right'; boxX: number; boxW: number }
export interface BarcodeOp { kind: 'barcode'; symbology: 'code128' | 'ean13'; x: number; y: number; h: number; narrow: number; value: string }
export interface MatrixOp { kind: 'matrix'; symbology: 'datamatrix' | 'qrcode'; x: number; y: number; side: number; module: number; value: string }
export type LabelOp<F> = TextOp<F> | BarcodeOp | MatrixOp;

export function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm * dpi) / 25.4);
}

/** Same rules as label-card.tsx: GS1 element string for 2D codes when a GTIN exists, EAN-13 only when the GTIN is valid length, else Code 128. */
export function barcodeSpec(t: Pick<PrintLabelTemplate, 'symbology'>, d: PrintLabelDatum): { symbology: PrintLabelTemplate['symbology']; value: string } {
  if (t.symbology === 'datamatrix' || t.symbology === 'qrcode') {
    if (d.gtin && d.gs1Value) return { symbology: t.symbology, value: d.gs1Value };
    return { symbology: t.symbology, value: d.barcodeValue };
  }
  if (t.symbology === 'ean13') {
    const digits = (d.gtin ?? '').replace(/^0+/, '');
    if (digits.length === 13 || digits.length === 12) return { symbology: 'ean13', value: digits.slice(0, 12) };
  }
  return { symbology: 'code128', value: d.barcodeValue };
}

/** Approximate Code 128 module count (auto code set: C for even all-numeric, else B). */
export function code128Modules(value: string): number {
  const n = /^\d+$/.test(value) && value.length % 2 === 0 ? value.length / 2 : value.length;
  return (n + 3) * 11 + 2;
}

/** Expands copies and groups into rows of `columns`; identical consecutive rows collapse into one row with a print count. */
export function expandRows<D extends { copies: number }>(t: Pick<PrintLabelTemplate, 'columns'>, labels: D[]): { row: D[]; count: number }[] {
  const expanded = labels.flatMap((l) => Array.from({ length: Math.max(1, l.copies) }, () => l));
  const cols = Math.max(1, t.columns);
  const rows: { row: D[]; count: number }[] = [];
  for (let i = 0; i < expanded.length; i += cols) {
    const row = expanded.slice(i, i + cols);
    const prev = rows[rows.length - 1];
    if (prev && prev.row.length === row.length && prev.row.every((d, j) => d === row[j])) prev.count += 1;
    else rows.push({ row, count: 1 });
  }
  return rows;
}

interface Part { text: string; hMm: number; bold: boolean }
interface PlacedPart<F> extends Part { font: Font<F> }

/** Lays one label out in dots, mirroring LabelCard in label-card.tsx (store name, item name, composition, batch/expiry, MRP, barcode at the bottom). */
export function layoutLabel<F>(t: PrintLabelTemplate, d: PrintLabelDatum, dpi: number, pick: PickFont<F>): LabelOp<F>[] {
  const mm = (v: number) => mmToDots(v, dpi);
  const has = (k: LabelFieldKey) => t.fields.includes(k);
  const fs = 2.4 * t.fontScale;
  const W = mm(t.widthMm), H = mm(t.heightMm), pad = mm(t.marginMm);
  const x0 = pad, innerW = Math.max(8, W - 2 * pad), yEnd = H - pad;
  const gapDots = mm(1);
  const ops: LabelOp<F>[] = [];
  let y = pad;

  const lineH = (f: Font<F>) => Math.max(f.charH + 1, Math.round(f.charH * 1.15));
  const fit = (s: string, f: Font<F>, w: number) => { const n = Math.max(0, Math.floor(w / f.charW)); return s.length > n ? s.slice(0, n) : s; };
  const push = (text: string, x: number, yy: number, font: Font<F>, align: TextOp<F>['align'] = 'left') => { if (text) ops.push({ kind: 'text', x, y: yy, font, text, align, boxX: x0, boxW: innerW }); };

  /** Single line, truncated; `maxLines` > 1 word-wraps. */
  const line = (raw: string, hMm: number, o: { bold?: boolean; align?: TextOp<F>['align']; maxLines?: number } = {}) => {
    const text = asciiSafe(raw);
    if (!text) return;
    const font = pick(mm(hMm), o.bold ?? false);
    const maxChars = Math.max(1, Math.floor(innerW / font.charW));
    const lines: string[] = [];
    if ((o.maxLines ?? 1) <= 1 || text.length <= maxChars) lines.push(fit(text, font, innerW).trimEnd());
    else {
      let cur = '';
      for (const word of text.split(' ')) {
        if (!cur) cur = word;
        else if (cur.length + 1 + word.length <= maxChars) cur += ` ${word}`;
        else { lines.push(cur); cur = word; if (lines.length === (o.maxLines ?? 1)) break; }
      }
      if (lines.length < (o.maxLines ?? 1) && cur) lines.push(cur);
      for (let i = 0; i < lines.length; i++) lines[i] = fit(lines[i]!, font, innerW).trimEnd();
    }
    for (const l of lines) {
      const w = l.length * font.charW;
      const x = o.align === 'center' ? x0 + Math.floor((innerW - w) / 2) : o.align === 'right' ? x0 + innerW - w : x0;
      push(l, x, y, font, o.align ?? 'left');
      y += lineH(font);
    }
  };

  /** One row of up to three segments: left, (centre), right, like `flex justify-between`. Each segment is a run of parts with their own sizes. */
  const row = (segments: Part[][]) => {
    let segs: PlacedPart<F>[][] = segments.map((parts) => parts.map((p) => ({ ...p, text: asciiSafe(p.text) })).filter((p) => p.text)).filter((s) => s.length > 0).map((parts) => parts.map((p) => ({ ...p, font: pick(mm(p.hMm), p.bold) })));
    if (segs.length === 0) return;
    const width = (s: PlacedPart<F>[]) => s.reduce((a, p) => a + p.text.length * p.font.charW, 0);
    const total = () => segs.reduce((a, s) => a + width(s), 0) + gapDots * (segs.length - 1);
    if (total() > innerW && segs.length > 1) {
      // Squeeze the last segment (pack size / rack) first, then drop small secondary parts (" incl. all taxes"), then truncate the first segment.
      const last = segs[segs.length - 1]!;
      const lastPart = last[last.length - 1]!;
      const avail = innerW - (total() - width(last)) - (width(last) - lastPart.text.length * lastPart.font.charW);
      const chars = Math.floor(avail / lastPart.font.charW);
      if (chars >= 4) lastPart.text = lastPart.text.slice(0, chars);
      else {
        segs = segs.map((s, i) => (i === 0 ? s.slice(0, 1) : s));
        if (total() > innerW) {
          const lp = segs[segs.length - 1]![segs[segs.length - 1]!.length - 1]!;
          const a2 = innerW - (total() - lp.text.length * lp.font.charW);
          const c2 = Math.floor(a2 / lp.font.charW);
          if (c2 >= 4) lp.text = lp.text.slice(0, c2);
          else if (segs.length > 1) segs = segs.slice(0, -1);
        }
      }
    }
    if (segs.length === 1 && total() > innerW) { const p = segs[0]![0]!; segs = [[{ ...p, text: fit(p.text, p.font, innerW) }]]; }
    const rowH = Math.max(...segs.flatMap((s) => s.map((p) => lineH(p.font))));
    const tallest = Math.max(...segs.flatMap((s) => s.map((p) => p.font.charH)));
    const place = (s: PlacedPart<F>[], startX: number, align: TextOp<F>['align']) => {
      let x = startX;
      for (const p of s) { push(p.text, x, y + (tallest - p.font.charH), p.font, align); x += p.text.length * p.font.charW; }
    };
    const first = segs[0]!;
    place(first, x0, 'left');
    if (segs.length === 2) place(segs[1]!, x0 + innerW - width(segs[1]!), 'right');
    if (segs.length === 3) {
      const midW = width(segs[1]!);
      place(segs[1]!, Math.max(x0 + width(first) + gapDots, x0 + Math.floor((innerW - midW) / 2)), 'center');
      place(segs[2]!, x0 + innerW - width(segs[2]!), 'right');
    }
    y += rowH;
  };

  // Top block
  if (has('storeName')) line(d.storeName, fs * 0.75, { align: 'center' });
  if (has('itemName')) line(`${d.itemName}${has('schedule') && d.schedule !== 'NONE' ? ` [${d.schedule}]` : ''}`, fs * 1.2, { bold: true, maxLines: t.kind === 'loose' ? 1 : 2 });
  if (has('generic') && d.generic) line(d.generic, fs * 0.8);
  if (t.kind === 'loose') {
    row([[{ text: d.loose?.qtyText || d.pack, hMm: fs * 0.9, bold: true }], [{ text: `B. ${d.batchNo} - Exp ${d.expiry}`, hMm: fs * 0.9, bold: false }]]);
    if (d.loose?.patientName) line(`For: ${d.loose.patientName}`, fs * 0.9);
    if (d.loose?.directions) line(d.loose.directions, fs * 0.9);
    line(`${d.storeName} - ${d.packedOn}`, fs * 0.72);
  } else {
    const r1: Part[][] = [];
    if (has('batch')) r1.push([{ text: `B.No ${d.batchNo}`, hMm: fs * 0.95, bold: false }]);
    if (has('mfg') && d.mfg) r1.push([{ text: `Mfg ${d.mfg}`, hMm: fs * 0.95, bold: false }]);
    if (has('expiry')) r1.push([{ text: `Exp ${d.expiry}`, hMm: fs * 0.95, bold: false }]);
    row(r1);
    const r2: Part[][] = [];
    if (has('mrp')) r2.push([{ text: `MRP ${rsText(d.mrpPaise)}`, hMm: fs * 1.1, bold: true }, { text: ' incl. all taxes', hMm: fs * 0.6, bold: false }]);
    if (has('pack')) r2.push([{ text: d.pack, hMm: fs * 0.95, bold: false }]);
    if (has('rack') && d.rack) r2.push([{ text: `Rack ${d.rack}`, hMm: fs * 0.95, bold: false }]);
    row(r2);
  }

  // Bottom block, anchored to the label's lower edge like `mt-auto`.
  const showCode = has('barcode') || has('qrGs1');
  const spec = showCode ? barcodeSpec(has('qrGs1') && !has('barcode') ? { symbology: 'datamatrix' } : t, d) : null;
  const tall = t.heightMm >= 35;
  const codeMm = Math.max(5, Math.min(tall ? 12 : 7, t.heightMm * 0.28));
  const is2d = spec?.symbology === 'datamatrix' || spec?.symbology === 'qrcode';
  const textFont = has('barcodeText') && has('barcode') && spec ? pick(mm(fs * 0.72), false) : null;
  const pkdFont = has('packedOn') && t.kind !== 'loose' ? pick(mm(fs * 0.6), false) : null;
  const textH = textFont ? lineH(textFont) : 0;
  const pkdH = pkdFont ? lineH(pkdFont) : 0;
  let codeH = spec ? mm(codeMm) : 0;
  const bottomH = (spec ? codeH + mm(0.5) : 0) + textH + pkdH;
  let yy = Math.max(y, yEnd - bottomH);
  if (spec && yy + bottomH > yEnd) codeH = Math.max(mm(3), yEnd - yy - textH - pkdH - mm(0.5));
  if (spec) {
    const value = asciiSafeCode(spec.value);
    if (is2d) {
      const side = Math.min(codeH, innerW);
      const modules = spec.symbology === 'qrcode' ? 33 : 26;
      ops.push({ kind: 'matrix', symbology: spec.symbology as 'datamatrix' | 'qrcode', x: x0, y: yy, side, module: Math.max(2, Math.floor(side / modules)), value });
    } else {
      const modules = spec.symbology === 'ean13' ? 95 : code128Modules(value);
      const narrow = Math.max(1, Math.min(4, Math.floor(innerW / modules)));
      const x = x0 + Math.max(0, Math.floor((innerW - modules * narrow) / 2));
      ops.push({ kind: 'barcode', symbology: spec.symbology as 'code128' | 'ean13', x, y: yy, h: codeH, narrow, value });
    }
    yy += codeH + mm(0.5);
  }
  if (textFont) {
    const text = fit(asciiSafe(d.barcodeText), textFont, innerW);
    push(text, x0 + Math.floor((innerW - text.length * textFont.charW) / 2), yy, textFont, 'center');
    yy += textH;
  }
  if (pkdFont) {
    const text = fit(`Pkd ${d.packedOn}`, pkdFont, innerW);
    push(text, x0 + innerW - text.length * pkdFont.charW, yy, pkdFont, 'right');
  }
  return ops;
}

/** Barcode payloads keep the GS separator (0x1D) that GS1 element strings need. */
function asciiSafeCode(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[^\x1d\x20-\x7e]/g, '');
}
