import { CheckCircle2, Clock, FileText, Send, XCircle, type LucideIcon } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui';
import { formatDateIN, rupees } from '@/lib/utils';
import type { StoreInfo } from '../purchases/return-note';

export type PoStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';
export type SendVia = 'whatsapp' | 'email' | 'print' | 'phone' | 'other';

export interface PoSupplier { id: number; name: string; phone: string | null; email: string | null; gstin: string | null; drugLicenceNo: string | null; address: string | null; city: string | null; stateCode: string | null }
export interface PoLine { id: number; purchaseOrderId: number; itemId: number; qtyPacks: number; ratePaise: number | null; mrpPaise: number | null; receivedPacks: number; note: string | null; itemName: string; genericText: string; packName: string; baseUnit: string; unitsPerPack: number; stockUnits: number; pendingPacks: number; amountPaise: number }
export interface PoReceipt { id: number; grnNo: string | null; invoiceNo: string; invoiceDate: string; receivedDate: string; status: 'draft' | 'posted' | 'cancelled'; totalPaise: number }
export interface PurchaseOrder {
  id: number; poNo: string | null; supplierId: number; status: PoStatus; date: string; expectedDate: string | null; notes: string | null; estimatedPaise: number; sentAt: string | null; sentVia: SendVia | null;
  createdBy: number; createdAt: string; updatedAt: string; cancelReason: string | null; createdByName: string | null; supplier: PoSupplier; supplierName: string; lines: PoLine[]; receipts: PoReceipt[]; orderedPacks: number; receivedPacks: number; pendingPacks: number;
}
export interface PoRow { id: number; poNo: string | null; date: string; expectedDate: string | null; status: PoStatus; supplierId: number; supplierName: string; estimatedPaise: number; sentAt: string | null; sentVia: SendVia | null; lineCount: number; orderedPacks: number; receivedPacks: number; receiptCount: number }
export interface PoPrintPayload { po: PurchaseOrder; store: StoreInfo; supplier: PoSupplier }

export interface ReorderLine {
  itemId: number; itemName: string; genericText: string; packName: string; baseUnit: string; unitsPerPack: number; rack: string | null;
  stockUnits: number; minStockUnits: number; maxStockUnits: number; reorderQtyPacks: number; soldUnits: number; velocityPerDay: number; daysOfCover: number | null; pendingPacks: number; suggestedPacks: number;
  lastRatePaise: number | null; mrpPaise: number | null; supplierId: number | null; supplierName: string | null; belowMin: boolean; reason: string; estimatedPaise: number;
}
export interface ReorderGroup { supplierId: number | null; supplierName: string; supplierPhone: string | null; lines: ReorderLine[]; estimatedPaise: number }
export interface ReorderResponse { generatedAt: string; coverDays: number; windowDays: number; groups: ReorderGroup[] }

export const PO_STATUS: Record<PoStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  draft: { label: 'Draft', tone: 'neutral', icon: FileText },
  sent: { label: 'Sent', tone: 'accent', icon: Send },
  partially_received: { label: 'Partly received', tone: 'warning', icon: Clock },
  received: { label: 'Received', tone: 'success', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', tone: 'danger', icon: XCircle },
};
export const SEND_VIA_LABEL: Record<SendVia, string> = { whatsapp: 'WhatsApp', email: 'E-mail', print: 'Printed copy', phone: 'Phone call', other: 'Other' };

export function PoStatusBadge({ status }: { status: PoStatus }) {
  const s = PO_STATUS[status];
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

/** Whole packs written the way the counter says them: "12 strips". */
export function packs(n: number, packName: string) {
  return `${n} ${packName}${n === 1 ? '' : 's'}`;
}

export function whatsappUrl(phone: string, text: string) {
  const p = phone.replace(/\D/g, '');
  return `https://wa.me/${p.length === 10 ? '91' + p : p}?text=${encodeURIComponent(text)}`;
}

const LIC: Record<string, string> = { FORM_20: 'DL 20', FORM_21: 'DL 21', FORM_20F: 'DL 20F', FORM_20A: 'DL 20A', FORM_21A: 'DL 21A', FORM_20B: 'DL 20B', FORM_21B: 'DL 21B', FSSAI: 'FSSAI' };

/** A4 purchase order: store header with GSTIN and drug-licence numbers, supplier block, lines, signature. */
export function PurchaseOrderPrint({ po, store, supplier }: PoPrintPayload) {
  const total = po.lines.reduce((s, l) => s + l.amountPaise, 0);
  const priced = po.lines.some((l) => l.ratePaise !== null && l.ratePaise > 0);
  return (
    <div className="po" style={{ width: '190mm' }}>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        .po { font-family: Inter, Arial, sans-serif; color: #000; background: #fff; font-size: 12px; line-height: 1.35; margin: 0 auto; }
        .po * { box-sizing: border-box; }
        .po h1 { font-size: 18px; font-weight: 700; margin: 0; }
        .po h2 { font-size: 15px; font-weight: 700; margin: 10px 0 4px; text-align: center; letter-spacing: 0.04em; }
        .po .c { text-align: center; } .po .r { text-align: right; } .po .b { font-weight: 700; } .po .s { font-size: 11px; } .po .xs { font-size: 10px; color: #333; }
        .po table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        .po th, .po td { border-bottom: 1px solid #999; padding: 4px; vertical-align: top; }
        .po th { background: #eee; text-align: left; font-size: 11px; }
        .po .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
        .po .box { border: 1px solid #000; padding: 6px 8px; }
        .po .tot td { border: 0; padding: 2px 4px; }
        .po .sig { display: grid; grid-template-columns: 1fr 1fr; margin-top: 40px; }
      `}</style>
      <div className="c">
        <h1>{store.name}</h1>
        {store.legalName && store.legalName !== store.name && <div className="s">{store.legalName}</div>}
        <div className="s">{store.addressLine1}{store.addressLine2 ? `, ${store.addressLine2}` : ''}, {store.city}, {store.state} {store.pincode}</div>
        <div className="s">Ph: {store.phone}{store.email ? ` · ${store.email}` : ''}</div>
        <div className="xs">{store.licences.filter((l) => LIC[l.type]).map((l) => `${LIC[l.type]}: ${l.number}`).join(' · ')}</div>
        {store.gstin && <div className="xs">GSTIN: {store.gstin}</div>}
      </div>
      <h2>PURCHASE ORDER</h2>
      <div className="grid">
        <div className="box">
          <div className="b">To (supplier)</div>
          <div>{supplier.name}</div>
          {(supplier.address || supplier.city) && <div className="s">{[supplier.address, supplier.city].filter(Boolean).join(', ')}</div>}
          {supplier.phone && <div className="s">Ph: {supplier.phone}</div>}
          {supplier.gstin && <div className="s">GSTIN: {supplier.gstin}</div>}
          {supplier.drugLicenceNo && <div className="s">Drug licence: {supplier.drugLicenceNo}</div>}
        </div>
        <div className="box">
          <div><span className="b">PO no:</span> {po.poNo ?? `#${po.id}`}</div>
          <div><span className="b">Date:</span> {formatDateIN(po.date)}</div>
          <div><span className="b">Deliver by:</span> {po.expectedDate ? formatDateIN(po.expectedDate) : 'At the earliest'}</div>
          <div><span className="b">Status:</span> {PO_STATUS[po.status].label}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Item</th><th>Composition</th><th>Pack</th><th className="r">Qty (packs)</th>{priced && <><th className="r">Rate / pack</th><th className="r">MRP</th><th className="r">Amount</th></>}<th>Note</th></tr></thead>
        <tbody>{po.lines.map((l, i) => (
          <tr key={l.id}><td>{i + 1}</td><td>{l.itemName}</td><td className="s">{l.genericText}</td><td className="s">{l.unitsPerPack} {l.baseUnit}/{l.packName}</td><td className="r">{l.qtyPacks}</td>
            {priced && <><td className="r">{l.ratePaise ? (l.ratePaise / 100).toFixed(2) : '—'}</td><td className="r">{l.mrpPaise ? (l.mrpPaise / 100).toFixed(2) : '—'}</td><td className="r">{l.ratePaise ? (l.amountPaise / 100).toFixed(2) : '—'}</td></>}<td className="s">{l.note ?? ''}</td></tr>
        ))}</tbody>
      </table>
      <div className="grid">
        <div className="s">{po.notes && <><span className="b">Notes:</span> {po.notes}</>}<div className="xs" style={{ marginTop: 6 }}>Please quote this PO number on the invoice. Supply only batches with at least 6 months to expiry unless agreed.</div></div>
        <table className="tot"><tbody>
          <tr><td>Lines / packs</td><td className="r">{po.lines.length} / {po.orderedPacks}</td></tr>
          {priced && <tr className="b"><td>Estimated value (before GST)</td><td className="r">{rupees(total)}</td></tr>}
        </tbody></table>
      </div>
      <div className="sig"><div>Prepared by: {po.createdByName ?? '____________________'}</div><div className="r">For {store.name}<br /><br /><br />Authorised signatory</div></div>
    </div>
  );
}
