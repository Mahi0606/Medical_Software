import { renderToStaticMarkup } from 'react-dom/server';
import { formatDateIN, formatExpiry, rupees } from '@/lib/utils';

export interface StoreInfo { name: string; legalName: string | null; addressLine1: string; addressLine2: string | null; city: string; state: string; stateCode: string; pincode: string; phone: string; email: string | null; gstin: string | null; gstScheme: 'regular' | 'composition'; licences: { type: string; number: string }[] }

export interface PurchaseReturnDetail {
  id: number; docNo: string | null; supplierId: number; date: string; route: 'supply_invoice' | 'credit_note'; supplierRef: string | null; status: string;
  taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number; itcReversalPaise: number; notes: string | null; createdAt: string;
  supplierName: string; supplierGstin: string | null;
  lines: { id: number; itemId: number; batchId: number; qtyUnits: number; ratePaise: number; gstRatePct: number; taxablePaise: number; taxPaise: number; totalPaise: number; reason: string; itemName: string; batchNo: string; expiryDate: string; unitsPerPack: number; hsn: string }[];
}

export const RETURN_REASON_LABEL: Record<string, string> = { expired: 'Expired', near_expiry: 'Near expiry', damaged: 'Damaged', excess: 'Excess stock', recall: 'Recall', other: 'Other' };

export function routeLabel(route: PurchaseReturnDetail['route']) {
  return route === 'credit_note' ? 'Credit note from supplier' : 'Our return invoice';
}

export function routeSentence(ret: PurchaseReturnDetail) {
  return ret.route === 'credit_note'
    ? `Return of goods; supplier to issue credit note (CBIC Circular 72/46/2018-GST). ITC reversed: ${rupees(ret.itcReversalPaise)}`
    : 'Tax invoice for return of goods under CBIC Circular 72/46/2018-GST';
}

const LIC: Record<string, string> = { FORM_20: 'DL 20', FORM_21: 'DL 21', FORM_20F: 'DL 20F', FORM_20A: 'DL 20A', FORM_21A: 'DL 21A', FORM_20B: 'DL 20B', FORM_21B: 'DL 21B', FSSAI: 'FSSAI' };

/** A5/A4 return note: store header, supplier, lines, totals and the GST route sentence. */
export function ReturnNote({ ret, store }: { ret: PurchaseReturnDetail; store: StoreInfo }) {
  const packs = (l: PurchaseReturnDetail['lines'][number]) => (l.unitsPerPack > 1 ? `${(l.qtyUnits / l.unitsPerPack).toFixed(l.qtyUnits % l.unitsPerPack ? 1 : 0)} pk (${l.qtyUnits} u)` : `${l.qtyUnits}`);
  const igst = ret.igstPaise > 0;
  return (
    <div className="rn" style={{ width: '190mm' }}>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        .rn { font-family: Inter, Arial, sans-serif; color: #000; background: #fff; font-size: 12px; line-height: 1.35; margin: 0 auto; }
        .rn * { box-sizing: border-box; }
        .rn h1 { font-size: 18px; font-weight: 700; margin: 0; }
        .rn h2 { font-size: 14px; font-weight: 700; margin: 10px 0 4px; text-align: center; letter-spacing: 0.02em; }
        .rn .c { text-align: center; } .rn .r { text-align: right; } .rn .b { font-weight: 700; } .rn .s { font-size: 11px; } .rn .xs { font-size: 10px; color: #333; }
        .rn table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        .rn th, .rn td { border-bottom: 1px solid #999; padding: 4px; vertical-align: top; }
        .rn th { background: #eee; text-align: left; font-size: 11px; }
        .rn .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
        .rn .box { border: 1px solid #000; padding: 6px 8px; }
        .rn .tot td { border: 0; padding: 2px 4px; }
        .rn .note { border: 1px solid #000; padding: 6px 8px; margin-top: 10px; font-weight: 600; }
        .rn .sig { display: grid; grid-template-columns: 1fr 1fr; margin-top: 36px; }
      `}</style>
      <div className="c">
        <h1>{store.name}</h1>
        {store.legalName && store.legalName !== store.name && <div className="s">{store.legalName}</div>}
        <div className="s">{store.addressLine1}{store.addressLine2 ? `, ${store.addressLine2}` : ''}, {store.city}, {store.state} {store.pincode}</div>
        <div className="s">Ph: {store.phone}{store.email ? ` · ${store.email}` : ''}</div>
        <div className="xs">{store.licences.filter((l) => LIC[l.type]).map((l) => `${LIC[l.type]}: ${l.number}`).join(' · ')}</div>
        {store.gstin && <div className="xs">GSTIN: {store.gstin}</div>}
      </div>
      <h2>{ret.route === 'credit_note' ? 'GOODS RETURN NOTE' : 'TAX INVOICE — RETURN OF GOODS'}</h2>
      <div className="grid">
        <div className="box"><div className="b">To (supplier)</div><div>{ret.supplierName}</div>{ret.supplierGstin && <div className="s">GSTIN: {ret.supplierGstin}</div>}{ret.supplierRef && <div className="s">Your ref: {ret.supplierRef}</div>}</div>
        <div className="box"><div><span className="b">Doc no:</span> {ret.docNo}</div><div><span className="b">Date:</span> {formatDateIN(ret.date)}</div><div><span className="b">Route:</span> {routeLabel(ret.route)}</div><div><span className="b">Supply:</span> {igst ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Item</th><th>HSN</th><th>Batch</th><th>Exp</th><th>Reason</th><th className="r">Qty</th><th className="r">Rate / pk</th><th className="r">Taxable</th><th className="r">GST %</th><th className="r">Tax</th><th className="r">Total</th></tr></thead>
        <tbody>{ret.lines.map((l, i) => <tr key={l.id}><td>{i + 1}</td><td>{l.itemName}</td><td>{l.hsn}</td><td>{l.batchNo}</td><td>{formatExpiry(l.expiryDate)}</td><td>{RETURN_REASON_LABEL[l.reason] ?? l.reason}</td><td className="r">{packs(l)}</td><td className="r">{(l.ratePaise / 100).toFixed(2)}</td><td className="r">{(l.taxablePaise / 100).toFixed(2)}</td><td className="r">{l.gstRatePct}</td><td className="r">{(l.taxPaise / 100).toFixed(2)}</td><td className="r">{(l.totalPaise / 100).toFixed(2)}</td></tr>)}</tbody>
      </table>
      <div className="grid">
        <div className="s">{ret.notes && <><span className="b">Notes:</span> {ret.notes}</>}</div>
        <table className="tot">
          <tbody>
            <tr><td>Taxable value</td><td className="r">{rupees(ret.taxablePaise)}</td></tr>
            {igst ? <tr><td>IGST</td><td className="r">{rupees(ret.igstPaise)}</td></tr> : <><tr><td>CGST</td><td className="r">{rupees(ret.cgstPaise)}</td></tr><tr><td>SGST</td><td className="r">{rupees(ret.sgstPaise)}</td></tr></>}
            <tr className="b"><td>Total</td><td className="r">{rupees(ret.totalPaise)}</td></tr>
            {ret.route === 'credit_note' && <tr><td>ITC to reverse</td><td className="r">{rupees(ret.itcReversalPaise)}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="note">{routeSentence(ret)}</div>
      <div className="sig"><div>Received by (supplier / carrier): ____________________</div><div className="r">For {store.name}<br /><br />Authorised signatory</div></div>
    </div>
  );
}

/** Print the return note through a hidden iframe so open dialogs and the app shell stay out of the printout. */
export function printReturnNote(ret: PurchaseReturnDetail, store: StoreInfo) {
  const html = `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><title>${ret.docNo ?? 'Return note'}</title></head><body style="margin:0">${renderToStaticMarkup(<ReturnNote ret={ret} store={store} />)}</body></html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed'; frame.style.right = '0'; frame.style.bottom = '0'; frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) { frame.remove(); window.print(); return; }
  doc.open(); doc.write(html); doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  frame.contentWindow!.addEventListener('afterprint', cleanup);
  setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); }, 150);
}
