import { amountInWords } from '@pharma/shared';
import { formatDateIN, formatDateTimeIN, formatExpiry, rupees } from '@/lib/utils';

export interface PrintStore { name: string; legalName: string | null; addressLine1: string; addressLine2: string | null; city: string; state: string; stateCode: string; pincode: string; phone: string; email: string | null; gstin: string | null; gstScheme: 'regular' | 'composition'; pharmacistName: string | null; pharmacistRegNo: string | null; footerNote: string | null; upiId: string | null; printFormat: string; licences: { type: string; number: string }[] }
export interface PrintSale {
  id: number; invoiceNo: string | null; kind: string; date: string; createdAt: string; status: string; customerName: string | null; customerPhone: string | null; customerGstin: string | null; doctorName: string | null; doctorRegNo: string | null; patientName: string | null; patientAddress: string | null; patientAge: number | null; strictestSchedule: string;
  grossPaise: number; discountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; roundOffPaise: number; totalPaise: number; paidPaise: number; creditPaise: number; createdByName: string | null; pharmacist: { name: string; regNo: string | null } | null;
  lines: { id: number; itemName: string; genericText: string | null; manufacturer: string | null; batchNo: string; expiryDate: string; hsn: string; schedule: string; unitMode: string; qty: number; qtyUnits: number; packName: string; baseUnit: string; mrpPaise: number; unitPricePaise: number; discountPct: number; netPaise: number; gstRatePct: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; returnedUnits: number; unitsPerPack: number }[];
  payments: { mode: string; amountPaise: number; reference: string | null }[];
}

const KIND_TITLE: Record<string, string> = { TAX_INVOICE: 'Tax Invoice', BILL_OF_SUPPLY: 'Bill of Supply', INVOICE_CUM_BILL_OF_SUPPLY: 'Invoice-cum-Bill of Supply' };
const LIC: Record<string, string> = { FORM_20: 'DL 20', FORM_21: 'DL 21', FORM_20F: 'DL 20F', FORM_20A: 'DL 20A', FORM_21A: 'DL 21A', FORM_20B: 'DL 20B', FORM_21B: 'DL 21B', FSSAI: 'FSSAI' };

export function licenceLine(store: PrintStore) {
  return store.licences.filter((l) => LIC[l.type]).map((l) => `${LIC[l.type]}: ${l.number}`).join(' · ');
}

/** Thermal (80 mm / 58 mm) and A4/A5 invoice. Format is chosen by the store setting or the `format` prop. */
export function InvoicePrint({ sale, store, format }: { sale: PrintSale; store: PrintStore; format?: string }) {
  const f = format ?? store.printFormat ?? 'thermal80';
  const thermal = f.startsWith('thermal');
  const width = f === 'thermal58' ? '58mm' : f === 'thermal80' ? '80mm' : f === 'a5' ? '148mm' : '210mm';
  const rates = Object.values(sale.lines.reduce<Record<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>>((acc, l) => { const r = (acc[l.gstRatePct] ??= { rate: l.gstRatePct, taxable: 0, cgst: 0, sgst: 0, igst: 0 }); r.taxable += l.taxablePaise; r.cgst += l.cgstPaise; r.sgst += l.sgstPaise; r.igst += l.igstPaise; return acc; }, {})).sort((a, b) => a.rate - b.rate);
  const rx = sale.strictestSchedule !== 'NONE' || sale.doctorName;
  const composition = store.gstScheme === 'composition';
  const upiQr = store.upiId ? `upi://pay?pa=${encodeURIComponent(store.upiId)}&pn=${encodeURIComponent(store.name)}&am=${(sale.totalPaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(sale.invoiceNo ?? '')}` : null;
  return (
    <div className={`invoice ${thermal ? 'thermal' : 'sheet'}`} style={{ width, ['--w' as string]: width }}>
      <style>{`
        @page { size: ${thermal ? `${width} auto` : f === 'a5' ? 'A5 portrait' : 'A4 portrait'}; margin: ${thermal ? '2mm' : '10mm'}; }
        .invoice { font-family: ${thermal ? "'Courier New', ui-monospace, monospace" : 'Inter, Arial, sans-serif'}; color: #000; background: #fff; font-size: ${thermal ? (f === 'thermal58' ? '10px' : '11.5px') : '12px'}; line-height: 1.3; margin: 0 auto; padding: ${thermal ? '2mm' : '0'}; }
        .invoice * { box-sizing: border-box; }
        .invoice h1 { font-size: ${thermal ? '14px' : '18px'}; font-weight: 700; margin: 0; }
        .invoice .c { text-align: center; } .invoice .r { text-align: right; } .invoice .b { font-weight: 700; } .invoice .s { font-size: 0.9em; } .invoice .xs { font-size: 0.82em; }
        .invoice hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
        .invoice table { width: 100%; border-collapse: collapse; }
        .invoice th, .invoice td { padding: 2px 2px; vertical-align: top; }
        .invoice.sheet th, .invoice.sheet td { border-bottom: 1px solid #999; padding: 4px 4px; }
        .invoice.sheet th { background: #eee; text-align: left; font-size: 11px; }
        .invoice .tot td { padding: 1px 2px; }
        .invoice .rx { border: 1px solid #000; padding: 3px 4px; margin: 4px 0; }
        .invoice .cancel { position: absolute; left: 0; right: 0; top: 40%; text-align: center; font-size: 40px; font-weight: 800; color: rgba(180,35,24,0.35); transform: rotate(-20deg); pointer-events: none; }
        .invoice .wrap { position: relative; }
        .invoice .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      `}</style>
      <div className="wrap">
        {sale.status === 'cancelled' && <div className="cancel" aria-hidden>CANCELLED</div>}
        <div className="c">
          <h1>{store.name}</h1>
          <div className="s">{store.addressLine1}{store.addressLine2 ? `, ${store.addressLine2}` : ''}, {store.city} {store.pincode}</div>
          <div className="s">Ph: {store.phone}{store.email ? ` · ${store.email}` : ''}</div>
          <div className="xs">{licenceLine(store)}</div>
          {store.gstin && <div className="xs">GSTIN: {store.gstin}{composition ? ' · Composition taxable person, not eligible to collect tax on supplies' : ''}</div>}
        </div>
        <hr />
        <div className="c b">{KIND_TITLE[sale.kind] ?? sale.kind}{sale.status === 'cancelled' ? ' (CANCELLED)' : ''}</div>
        <div className={thermal ? '' : 'grid'}>
          <div><span className="b">Bill No:</span> {sale.invoiceNo}<br /><span className="b">Date:</span> {formatDateTimeIN(sale.createdAt)}</div>
          <div>{(sale.customerName || sale.customerPhone) && <><span className="b">Customer:</span> {sale.customerName ?? ''} {sale.customerPhone ?? ''}<br /></>}{sale.customerGstin && <><span className="b">Cust. GSTIN:</span> {sale.customerGstin}<br /></>}<span className="b">Billed by:</span> {sale.createdByName}</div>
        </div>
        {rx && (
          <div className="rx s">
            <div><span className="b">Rx</span> Prescriber: {sale.doctorName ?? '—'}{sale.doctorRegNo ? ` (Reg. ${sale.doctorRegNo})` : ''}</div>
            <div>Patient: {sale.patientName ?? '—'}{sale.patientAge ? `, ${sale.patientAge} y` : ''}{sale.patientAddress ? `, ${sale.patientAddress}` : ''}</div>
            {sale.strictestSchedule !== 'NONE' && <div>Schedule {sale.strictestSchedule} medicine dispensed under the supervision of the registered pharmacist{sale.pharmacist ? `: ${sale.pharmacist.name}${sale.pharmacist.regNo ? ` (${sale.pharmacist.regNo})` : ''}` : store.pharmacistName ? `: ${store.pharmacistName} (${store.pharmacistRegNo ?? ''})` : ''}.</div>}
          </div>
        )}
        <hr />
        <table>
          <thead>
            {thermal ? <tr className="b"><th className="r" style={{ width: '4%' }}>#</th><th style={{ textAlign: 'left' }}>Item / Batch / Exp</th><th className="r" style={{ width: '10%' }}>Qty</th><th className="r" style={{ width: '18%' }}>Rate</th><th className="r" style={{ width: '20%' }}>Amt</th></tr>
              : <tr><th>#</th><th>Item</th><th>HSN</th><th>Batch</th><th>Exp</th><th className="r">Qty</th><th className="r">MRP</th><th className="r">Rate</th><th className="r">Disc</th><th className="r">GST</th><th className="r">Amount</th></tr>}
          </thead>
          <tbody>
            {sale.lines.map((l, i) => thermal ? (
              <tr key={l.id}>
                <td className="r">{i + 1}</td>
                <td><div className="b">{l.itemName}{l.schedule !== 'NONE' ? ` [Sch ${l.schedule}]` : ''}</div><div className="xs">{l.genericText}</div><div className="xs">B: {l.batchNo} · Exp {formatExpiry(l.expiryDate)} · MRP {rupees(l.mrpPaise).replace('₹', '')}{l.discountPct > 0 ? ` · Disc ${l.discountPct}%` : ''}{!composition ? ` · GST ${l.gstRatePct}%` : ''}</div></td>
                <td className="r">{l.qty} {l.unitMode === 'unit' ? l.baseUnit.slice(0, 3) : l.packName.slice(0, 3)}</td>
                <td className="r">{(l.unitPricePaise / 100).toFixed(2)}</td>
                <td className="r">{(l.netPaise / 100).toFixed(2)}</td>
              </tr>
            ) : (
              <tr key={l.id}>
                <td>{i + 1}</td><td><div className="b">{l.itemName}{l.schedule !== 'NONE' ? ` [Sch ${l.schedule}]` : ''}</div><div className="xs">{l.genericText}{l.manufacturer ? ` · ${l.manufacturer}` : ''}</div></td><td>{l.hsn}</td><td>{l.batchNo}</td><td>{formatExpiry(l.expiryDate)}</td>
                <td className="r">{l.qty} {l.unitMode === 'unit' ? l.baseUnit : l.packName}</td><td className="r">{(l.mrpPaise / 100).toFixed(2)}</td><td className="r">{(l.unitPricePaise / 100).toFixed(2)}</td><td className="r">{l.discountPct ? `${l.discountPct}%` : '—'}</td><td className="r">{composition ? '—' : `${l.gstRatePct}%`}</td><td className="r">{(l.netPaise / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr />
        <table className="tot">
          <tbody>
            <tr><td>Gross</td><td className="r">{(sale.grossPaise / 100).toFixed(2)}</td></tr>
            {sale.discountPaise > 0 && <tr><td>Discount</td><td className="r">−{(sale.discountPaise / 100).toFixed(2)}</td></tr>}
            {!composition && <tr><td>Taxable value</td><td className="r">{(sale.taxablePaise / 100).toFixed(2)}</td></tr>}
            {!composition && rates.filter((r) => r.rate > 0).map((r) => sale.igstPaise > 0 ? <tr key={r.rate}><td>IGST {r.rate}%</td><td className="r">{(r.igst / 100).toFixed(2)}</td></tr> : (
              <tr key={r.rate}><td>CGST {r.rate / 2}% + SGST {r.rate / 2}%</td><td className="r">{(r.cgst / 100).toFixed(2)} + {(r.sgst / 100).toFixed(2)}</td></tr>
            ))}
            {sale.roundOffPaise !== 0 && <tr><td>Round off</td><td className="r">{sale.roundOffPaise > 0 ? '+' : '−'}{(Math.abs(sale.roundOffPaise) / 100).toFixed(2)}</td></tr>}
            <tr className="b" style={{ fontSize: '1.2em' }}><td>TOTAL</td><td className="r">₹{(sale.totalPaise / 100).toFixed(2)}</td></tr>
            {sale.discountPaise > 0 && <tr><td colSpan={2} className="xs">You saved ₹{(sale.discountPaise / 100).toFixed(2)}</td></tr>}
          </tbody>
        </table>
        <div className="xs">{amountInWords(sale.totalPaise)}</div>
        <div className="s">Paid: {sale.payments.map((p) => `${p.mode.toUpperCase()} ${(p.amountPaise / 100).toFixed(2)}${p.reference ? ` (${p.reference})` : ''}`).join(', ') || '—'}{sale.creditPaise > 0 ? ` · Credit ₹${(sale.creditPaise / 100).toFixed(2)}` : ''}</div>
        {!composition && !thermal && rates.length > 0 && (
          <table style={{ marginTop: 6 }} className="xs"><thead><tr><th>GST %</th><th className="r">Taxable</th><th className="r">CGST</th><th className="r">SGST</th><th className="r">IGST</th></tr></thead><tbody>{rates.map((r) => <tr key={r.rate}><td>{r.rate}%</td><td className="r">{(r.taxable / 100).toFixed(2)}</td><td className="r">{(r.cgst / 100).toFixed(2)}</td><td className="r">{(r.sgst / 100).toFixed(2)}</td><td className="r">{(r.igst / 100).toFixed(2)}</td></tr>)}</tbody></table>
        )}
        <hr />
        {upiQr && sale.creditPaise > 0 && <div className="c xs">Pay balance via UPI: {store.upiId}</div>}
        <div className="c xs">{store.footerNote ?? 'Thank you. Get well soon.'}</div>
        <div className="c xs">Keep medicines out of reach of children. Check expiry before use.</div>
        {(store.pharmacistName || sale.pharmacist) && <div className="c xs" style={{ marginTop: 8 }}>Registered Pharmacist: {sale.pharmacist?.name ?? store.pharmacistName} {sale.pharmacist?.regNo ?? store.pharmacistRegNo}</div>}
        {!thermal && <div className="r xs" style={{ marginTop: 18 }}>For {store.name}<br /><br />Authorised signatory</div>}
        <div className="c xs">Bill date {formatDateIN(sale.date)} · This is a computer-generated bill.</div>
      </div>
    </div>
  );
}
