import { useEffect, useRef } from 'react';
import bwipjs from 'bwip-js/browser';
import type { LabelFieldKey, LabelTemplateInput } from '@pharma/shared';
import { cn } from '@/lib/utils';

export interface LabelDatum {
  batchId: number; itemId: number; copies: number; storeName: string; itemName: string; generic: string; manufacturer: string | null; batchNo: string; expiry: string; expiryIso: string; mfg: string | null;
  mrpPaise: number; pack: string; rack: string | null; schedule: string; packedOn: string; barcodeValue: string; barcodeText: string; gs1Value: string | null; gtin: string | null;
  loose?: { qtyText: string | null; patientName: string | null; directions: string | null };
}
export type Template = LabelTemplateInput & { id?: number };

export const SAMPLE_DATUM: LabelDatum = { batchId: 0, itemId: 0, copies: 1, storeName: 'Om Medical Stores', itemName: 'Augmentin 625 Duo Tablet', generic: 'Amoxicillin 500 mg + Clavulanic acid 125 mg', manufacturer: 'GSK', batchNo: 'AUG2451', expiry: '08/27', expiryIso: '2027-08-31', mfg: '09/25', mrpPaise: 22300, pack: '10 tablets / strip', rack: 'B1', schedule: 'H', packedOn: '19/09/2026', barcodeValue: 'PB000123', barcodeText: 'PB000123', gs1Value: '0108901234567890172708311AUG2451', gtin: '08901234567890', loose: { qtyText: '5 tablets', patientName: 'S. Iyer', directions: '1 tablet twice daily after food' } };

/** Encodes for bwip-js: GS1 DataMatrix uses parenthesised AIs. */
function barcodeSpec(t: Template, d: LabelDatum): { bcid: string; text: string } | null {
  if (t.symbology === 'datamatrix' || t.symbology === 'qrcode') {
    if (d.gtin) return { bcid: t.symbology === 'datamatrix' ? 'gs1datamatrix' : 'gs1qrcode', text: `(01)${d.gtin.padStart(14, '0')}(17)${d.expiryIso.slice(2, 4)}${d.expiryIso.slice(5, 7)}${d.expiryIso.slice(8, 10)}(10)${d.batchNo}` };
    return { bcid: t.symbology === 'datamatrix' ? 'datamatrix' : 'qrcode', text: d.barcodeValue };
  }
  if (t.symbology === 'ean13') {
    const digits = (d.gtin ?? '').replace(/^0+/, '');
    if (digits.length === 13 || digits.length === 12) return { bcid: 'ean13', text: digits.slice(0, 12) };
    return { bcid: 'code128', text: d.barcodeValue };
  }
  return { bcid: 'code128', text: d.barcodeValue };
}

export function Barcode({ template, datum, heightMm, className }: { template: Template; datum: LabelDatum; heightMm: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const spec = barcodeSpec(template, datum);
  useEffect(() => {
    if (!ref.current || !spec) return;
    try {
      const square = spec.bcid.includes('matrix') || spec.bcid.includes('qr');
      bwipjs.toCanvas(ref.current, { bcid: spec.bcid, text: spec.text, scale: 3, height: square ? undefined : Math.max(5, heightMm), includetext: false, paddingwidth: 0, paddingheight: 0 } as Parameters<typeof bwipjs.toCanvas>[1]);
    } catch (e) {
      const ctx = ref.current.getContext('2d');
      if (ctx) { ref.current.width = 200; ref.current.height = 30; ctx.font = '12px sans-serif'; ctx.fillText(`Barcode error: ${(e as Error).message}`.slice(0, 40), 2, 18); }
    }
  }, [spec?.bcid, spec?.text, heightMm]);
  if (!spec) return null;
  const square = spec.bcid.includes('matrix') || spec.bcid.includes('qr');
  return <canvas ref={ref} role="img" aria-label={`Barcode ${spec.text}`} className={cn('block', className)} style={square ? { height: `${heightMm}mm`, width: `${heightMm}mm` } : { height: `${heightMm}mm`, width: '100%', imageRendering: 'pixelated' }} />;
}

/** One label at true size (mm). Used for preview and print. */
export function LabelCard({ template: t, datum: d, className }: { template: Template; datum: LabelDatum; className?: string }) {
  const has = (k: LabelFieldKey) => t.fields.includes(k);
  const fs = 2.4 * t.fontScale; // mm
  const tall = t.heightMm >= 35;
  const barcodeH = Math.max(5, Math.min(tall ? 12 : 7, t.heightMm * 0.28));
  const mrp = `₹${(d.mrpPaise / 100).toFixed(2)}`;
  return (
    <div className={cn('label-card relative overflow-hidden bg-white text-black', className)} style={{ width: `${t.widthMm}mm`, height: `${t.heightMm}mm`, padding: `${t.marginMm}mm`, fontSize: `${fs}mm`, lineHeight: 1.15, fontFamily: 'Inter, Arial, Helvetica, sans-serif' }}>
      <div className="flex h-full flex-col">
        {has('storeName') && <div className="truncate text-center" style={{ fontSize: `${fs * 0.75}mm` }}>{d.storeName}</div>}
        {has('itemName') && <div className="font-bold leading-tight" style={{ fontSize: `${fs * 1.2}mm`, display: '-webkit-box', WebkitLineClamp: t.kind === 'loose' ? 1 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.itemName}{has('schedule') && d.schedule !== 'NONE' ? ` [${d.schedule}]` : ''}</div>}
        {has('generic') && d.generic && <div className="truncate" style={{ fontSize: `${fs * 0.8}mm` }}>{d.generic}</div>}
        {t.kind === 'loose' ? (
          <div style={{ fontSize: `${fs * 0.9}mm` }}>
            <div className="flex justify-between gap-1"><span className="font-semibold">{d.loose?.qtyText || d.pack}</span><span>B. {d.batchNo} · Exp {d.expiry}</span></div>
            {d.loose?.patientName && <div className="truncate">For: {d.loose.patientName}</div>}
            {d.loose?.directions && <div className="truncate">{d.loose.directions}</div>}
            <div className="truncate" style={{ fontSize: `${fs * 0.72}mm` }}>{d.storeName} · {d.packedOn}</div>
          </div>
        ) : (
          <>
            <div className="flex justify-between gap-1" style={{ fontSize: `${fs * 0.95}mm` }}>
              {has('batch') && <span>B.No <span className="font-semibold">{d.batchNo}</span></span>}
              {has('mfg') && d.mfg && <span>Mfg {d.mfg}</span>}
              {has('expiry') && <span>Exp <span className="font-semibold">{d.expiry}</span></span>}
            </div>
            <div className="flex justify-between gap-1" style={{ fontSize: `${fs * 0.95}mm` }}>
              {has('mrp') && <span className="font-bold" style={{ fontSize: `${fs * 1.1}mm` }}>MRP {mrp}<span className="font-normal" style={{ fontSize: `${fs * 0.6}mm` }}> incl. all taxes</span></span>}
              {has('pack') && <span className="truncate">{d.pack}</span>}
              {has('rack') && d.rack && <span>Rack {d.rack}</span>}
            </div>
          </>
        )}
        <div className="mt-auto flex items-end gap-1">
          {(has('barcode') || has('qrGs1')) && <div className="min-w-0 flex-1"><Barcode template={has('qrGs1') && !has('barcode') ? { ...t, symbology: 'datamatrix' } : t} datum={d} heightMm={barcodeH} /></div>}
        </div>
        {has('barcodeText') && has('barcode') && <div className="text-center" style={{ fontSize: `${fs * 0.72}mm`, letterSpacing: '0.05em' }}>{d.barcodeText}</div>}
        {has('packedOn') && t.kind !== 'loose' && <div className="text-right" style={{ fontSize: `${fs * 0.6}mm` }}>Pkd {d.packedOn}</div>}
      </div>
    </div>
  );
}

/** Lays labels out in rows of `columns` and emits print CSS: one row per roll page. */
export function LabelSheet({ template: t, labels, printRef }: { template: Template; labels: LabelDatum[]; printRef?: React.RefObject<HTMLDivElement | null> }) {
  const expanded = labels.flatMap((l) => Array.from({ length: l.copies }, () => l));
  const rows: LabelDatum[][] = [];
  for (let i = 0; i < expanded.length; i += t.columns) rows.push(expanded.slice(i, i + t.columns));
  const pageW = t.widthMm * t.columns + t.gapMm * (t.columns - 1);
  return (
    <div ref={printRef} className="label-sheet">
      <style>{`
        @media print { @page { size: ${pageW}mm ${t.heightMm}mm; margin: 0; } body { margin: 0; } .label-sheet { display: block !important; } }
        .label-sheet .row { display: flex; gap: ${t.gapMm}mm; width: ${pageW}mm; height: ${t.heightMm}mm; page-break-after: always; break-after: page; }
        .label-sheet .row:last-child { page-break-after: auto; break-after: auto; }
        .label-card { border: 0; }
        @media screen { .label-sheet .row { margin-bottom: 4mm; } .label-sheet .label-card { outline: 1px dashed #b9c2cb; } }
      `}</style>
      {rows.map((r, i) => <div className="row" key={i}>{r.map((d, j) => <LabelCard key={`${d.batchId}-${j}`} template={t} datum={d} />)}</div>)}
    </div>
  );
}
