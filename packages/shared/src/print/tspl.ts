import { expandRows, layoutLabel, mmToDots, type Font, type PickFont, type PrintLabelDatum, type PrintLabelTemplate } from './layout.js';

export interface TsplFont { name: string; mult: number }
export interface TsplOptions {
  template: PrintLabelTemplate; labels: PrintLabelDatum[]; dpi: 203 | 300;
  /** DENSITY 0–15 (default 8). */ darkness?: number;
  /** SPEED in inches/second, typically 2–6 (default 4). */ speed?: number;
}

/** Built-in TSPL bitmap fonts (dot sizes are the same on 203 and 300 dpi printers). */
const BITMAP_FONTS: { name: string; w: number; h: number }[] = [
  { name: '1', w: 8, h: 12 }, { name: '2', w: 12, h: 20 }, { name: '3', w: 16, h: 24 }, { name: '4', w: 24, h: 32 }, { name: '5', w: 32, h: 48 },
];

/** Largest bitmap font (with integer multiplier up to 3) that does not exceed the target height. */
export const pickTsplFont: PickFont<TsplFont> = (targetH) => {
  let best: Font<TsplFont> | null = null;
  for (const f of BITMAP_FONTS) for (let m = 1; m <= 3; m++) {
    const h = f.h * m;
    if (h > targetH) break;
    if (!best || h > best.charH || (h === best.charH && m < best.spec.mult)) best = { spec: { name: f.name, mult: m }, charW: f.w * m, charH: h };
  }
  return best ?? { spec: { name: '1', mult: 1 }, charW: 8, charH: 12 };
};

/** TSPL strings are double-quoted and have no escape for quotes; swap them for safe characters. */
export function tsplQuote(s: string): string {
  return `"${s.replace(/"/g, "'").replace(/\\/g, '/')}"`;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** Whole print job for TSPL printers (TSC, TVS LP46, and most TSPL-EZ compatibles). One CLS…PRINT block per row of labels. */
export function tsplLabels({ template: t, labels, dpi, darkness = 8, speed = 4 }: TsplOptions): string {
  const cols = Math.max(1, t.columns);
  const pageW = t.widthMm * cols + t.gapMm * (cols - 1);
  const colStep = mmToDots(t.widthMm + t.gapMm, dpi);
  const out: string[] = [
    `SIZE ${num(pageW)} mm,${num(t.heightMm)} mm`,
    `GAP ${num(t.gapMm)} mm,0 mm`,
    'DIRECTION 1',
    'REFERENCE 0,0',
    `DENSITY ${Math.max(0, Math.min(15, Math.round(darkness)))}`,
    `SPEED ${Math.max(1, Math.min(14, Math.round(speed)))}`,
  ];
  for (const { row, count } of expandRows(t, labels)) {
    out.push('CLS');
    row.forEach((d, col) => {
      const dx = col * colStep;
      for (const op of layoutLabel(t, d, dpi, pickTsplFont)) {
        if (op.kind === 'text') out.push(`TEXT ${op.x + dx},${op.y},"${op.font.spec.name}",0,${op.font.spec.mult},${op.font.spec.mult},${tsplQuote(op.text)}`);
        else if (op.kind === 'barcode') out.push(`BARCODE ${op.x + dx},${op.y},"${op.symbology === 'ean13' ? 'EAN13' : '128'}",${op.h},0,0,${op.narrow},${op.narrow * 2},${tsplQuote(op.value)}`);
        else if (op.symbology === 'datamatrix') out.push(`DMATRIX ${op.x + dx},${op.y},${op.side},${op.side},x${op.module},${tsplQuote(op.value)}`);
        else out.push(`QRCODE ${op.x + dx},${op.y},M,${op.module},A,0,${tsplQuote(op.value)}`);
      }
    });
    out.push(`PRINT ${count},1`);
  }
  return out.join('\r\n') + '\r\n';
}

/** Short self-test: a box, text in three sizes and a Code 128, on the template's label size. */
export function tsplTestLabel(t: Pick<PrintLabelTemplate, 'widthMm' | 'heightMm' | 'gapMm'>, dpi: 203 | 300, darkness = 8, speed = 4): string {
  const W = mmToDots(t.widthMm, dpi), H = mmToDots(t.heightMm, dpi), m = mmToDots(1.5, dpi);
  return [
    `SIZE ${num(t.widthMm)} mm,${num(t.heightMm)} mm`, `GAP ${num(t.gapMm)} mm,0 mm`, 'DIRECTION 1', 'REFERENCE 0,0', `DENSITY ${darkness}`, `SPEED ${speed}`, 'CLS',
    `BOX ${m},${m},${W - m},${H - m},2`,
    `TEXT ${m * 2},${m * 2},"3",0,1,1,"TSPL test ${t.widthMm}x${t.heightMm} mm"`,
    `TEXT ${m * 2},${m * 2 + 30},"2",0,1,1,"${dpi} dpi  density ${darkness}  speed ${speed}"`,
    `BARCODE ${m * 2},${m * 2 + 56},"128",${Math.max(24, H - m * 4 - 56)},1,0,2,4,"PB000123"`,
    'PRINT 1,1', '',
  ].join('\r\n');
}
