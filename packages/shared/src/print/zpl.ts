import { expandRows, layoutLabel, mmToDots, type PickFont, type PrintLabelDatum, type PrintLabelTemplate } from './layout.js';

export interface ZplFont { h: number; w: number }
export interface ZplOptions { template: PrintLabelTemplate; labels: PrintLabelDatum[]; dpi: 203 | 300 }

/** Scalable font 0 (CG Triumvirate Bold Condensed); average glyph advance is roughly 0.55 × height. */
export const pickZplFont: PickFont<ZplFont> = (targetH) => {
  const h = Math.max(10, Math.round(targetH));
  return { spec: { h, w: h }, charW: Math.ceil(h * 0.55), charH: h };
};

/** Field data with ^FH active: hex-escape the ZPL control characters and GS (0x1D → _1D). */
export function zplField(s: string): string {
  return s.replace(/[_^~\x1d]/g, (c) => `_${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

/** Whole print job for Zebra (ZPL II) printers. One ^XA…^XZ format per row of labels, ^PQ for repeats. */
export function zplLabels({ template: t, labels, dpi }: ZplOptions): string {
  const cols = Math.max(1, t.columns);
  const pageW = mmToDots(t.widthMm * cols + t.gapMm * (cols - 1), dpi);
  const H = mmToDots(t.heightMm, dpi);
  const colStep = mmToDots(t.widthMm + t.gapMm, dpi);
  const out: string[] = [];
  for (const { row, count } of expandRows(t, labels)) {
    const f: string[] = [`^XA^CI28^PW${pageW}^LL${H}^LH0,0`];
    row.forEach((d, col) => {
      const dx = col * colStep;
      for (const op of layoutLabel(t, d, dpi, pickZplFont)) {
        if (op.kind === 'text') {
          if (op.align === 'left') f.push(`^FO${op.x + dx},${op.y}^A0N,${op.font.spec.h},${op.font.spec.w}^FH^FD${zplField(op.text)}^FS`);
          else f.push(`^FO${op.boxX + dx},${op.y}^A0N,${op.font.spec.h},${op.font.spec.w}^FB${op.boxW},1,0,${op.align === 'center' ? 'C' : 'R'},0^FH^FD${zplField(op.text)}^FS`);
        } else if (op.kind === 'barcode') {
          f.push(`^FO${op.x + dx},${op.y}^BY${op.narrow},2,${op.h}${op.symbology === 'ean13' ? `^BEN,${op.h},N,N` : `^BCN,${op.h},N,N,N`}^FD${zplField(op.value)}^FS`);
        } else if (op.symbology === 'datamatrix') {
          f.push(`^FO${op.x + dx},${op.y}^BXN,${op.module},200^FH^FD${zplField(op.value)}^FS`);
        } else {
          f.push(`^FO${op.x + dx},${op.y}^BQN,2,${Math.max(1, Math.min(10, op.module))}^FH^FDMA,${zplField(op.value)}^FS`);
        }
      }
    });
    f.push(`^PQ${count}^XZ`);
    out.push(f.join('\n'));
  }
  return out.join('\n') + '\n';
}

/** Short self-test on the template's label size. */
export function zplTestLabel(t: Pick<PrintLabelTemplate, 'widthMm' | 'heightMm'>, dpi: 203 | 300): string {
  const W = mmToDots(t.widthMm, dpi), H = mmToDots(t.heightMm, dpi), m = mmToDots(1.5, dpi);
  return [
    `^XA^CI28^PW${W}^LL${H}^LH0,0`,
    `^FO${m},${m}^GB${W - 2 * m},${H - 2 * m},2^FS`,
    `^FO${m * 2},${m * 2}^A0N,24,24^FDZPL test ${t.widthMm}x${t.heightMm} mm^FS`,
    `^FO${m * 2},${m * 2 + 30}^A0N,18,18^FD${dpi} dpi^FS`,
    `^FO${m * 2},${m * 2 + 56}^BY2,2,${Math.max(24, H - m * 4 - 56)}^BCN,${Math.max(24, H - m * 4 - 56)},Y,N,N^FDPB000123^FS`,
    '^PQ1^XZ', '',
  ].join('\n');
}
