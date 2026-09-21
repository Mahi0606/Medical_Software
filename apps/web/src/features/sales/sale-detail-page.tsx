import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Ban, MessageCircle, Printer, RotateCcw, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { formatDateTimeIN, formatExpiry, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, ConfirmDialog, Dialog, Field, Input, Money, NativeSelect, PageHeader, ScheduleBadge, Spinner, Textarea } from '@/components/ui';
import { InvoicePrint, type PrintSale, type PrintStore } from './invoice-print';
import { DirectReceiptPrintButton } from './receipt-print';
import { whatsappUrl } from '../billing/billing-page';

type SaleFull = PrintSale & { customerId: number | null; returns: { id: number; creditNoteNo: string; date: string; totalPaise: number; refundMode: string; reason: string }[]; cancelReason: string | null };

export function SaleDetailPage() {
  const { id } = useParams({ from: '/app/sales/$id' });
  const search = useSearch({ from: '/app/sales/$id' });
  const nav = useNavigate();
  const { can, store: s0 } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sale', id], queryFn: () => api.get<{ sale: SaleFull; store: PrintStore }>(`/sales/${id}/print`) });
  const [format, setFormat] = useState<string | undefined>(undefined);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);
  useEffect(() => { if (search.print && q.data) { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); } }, [search.print, q.data]);
  const cancel = useMutation({
    mutationFn: () => api.post(`/sales/${id}/cancel`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sale', id] }); qc.invalidateQueries({ queryKey: ['sales'] }); setCancelOpen(false); toast.success('Bill cancelled', 'Stock has been restored.'); },
    onError: (e: Error) => toast.error('Could not cancel', e.message),
  });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Callout tone="danger" title="Bill not found">{q.error?.message}</Callout>;
  const { sale, store } = q.data;
  const fmt = format ?? s0?.printFormat ?? store.printFormat;
  if (search.print) return <div className="print-root"><style>{`body{background:#fff} .no-print{display:none}`}</style><InvoicePrint sale={sale} store={store} format={fmt} /></div>;
  const returnable = sale.status === 'posted' && sale.lines.some((l) => l.qtyUnits - l.returnedUnits > 0);
  return (
    <div>
      <div className="no-print">
        <PageHeader title={sale.invoiceNo ?? 'Bill'} description={<span>{formatDateTimeIN(sale.createdAt)} · {sale.kind.replace(/_/g, ' ').toLowerCase()} · billed by {sale.createdByName}{sale.status === 'cancelled' && <Badge tone="danger" className="ml-2">Cancelled</Badge>}</span>}
          actions={<>
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav({ to: '/sales' })}>All bills</Button>
            <div className="w-40"><NativeSelect dense value={fmt} onChange={(e) => setFormat(e.target.value)} aria-label="Print format"><option value="thermal80">Thermal 80 mm</option><option value="thermal58">Thermal 58 mm</option><option value="a5">A5</option><option value="a4">A4</option></NativeSelect></div>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
            <DirectReceiptPrintButton sale={sale} store={store} />
            {sale.customerPhone && <Button icon={<MessageCircle className="h-4 w-4" />} onClick={() => window.open(whatsappUrl(sale.customerPhone!, `${store.name}: your bill ${sale.invoiceNo} for ${rupees(sale.totalPaise)} dated ${formatDateTimeIN(sale.createdAt)}. Thank you!`), '_blank')}>WhatsApp</Button>}
            <Button icon={<Copy className="h-4 w-4" />} onClick={() => nav({ to: '/billing', search: { rebill: sale.id } })}>Re-bill</Button>
            {returnable && can('sale.return') && <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => setReturnOpen(true)}>Return items</Button>}
            {sale.status === 'posted' && sale.returns.length === 0 && can('sale.cancel') && <Button variant="danger" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>Cancel bill</Button>}
          </>} />
        {sale.status === 'cancelled' && <Callout tone="danger" className="mb-3" title="This bill was cancelled">{sale.cancelReason}. Stock was returned to the batches; the register entries remain on record.</Callout>}
        {sale.returns.length > 0 && <Callout tone="warning" className="mb-3" title={`${sale.returns.length} credit ${sale.returns.length === 1 ? 'note' : 'notes'} against this bill`}>{sale.returns.map((r) => <div key={r.id}>{r.creditNoteNo} · {rupees(r.totalPaise)} refunded by {r.refundMode} · {r.reason}</div>)}</Callout>}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 table-wrap">
            <table className="tbl dense">
              <thead><tr><th>Item</th><th>Batch / Exp</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Disc</th><th className="num">Amount</th></tr></thead>
              <tbody>{sale.lines.map((l) => <tr key={l.id}><td><div className="font-medium">{l.itemName} <ScheduleBadge schedule={l.schedule} /></div><div className="text-xs text-text-2">{l.genericText}</div></td><td>{l.batchNo}<div className="text-xs text-text-2">Exp {formatExpiry(l.expiryDate)}</div></td><td className="num">{l.qty} {l.unitMode === 'unit' ? l.baseUnit : l.packName}{l.returnedUnits > 0 && <div className="text-[11px] text-warning">{l.returnedUnits} units returned</div>}</td><td className="num"><Money paise={l.unitPricePaise} /></td><td className="num">{l.discountPct ? `${l.discountPct}%` : '—'}</td><td className="num"><Money paise={l.netPaise} /></td></tr>)}</tbody>
            </table>
          </div>
          <div className="space-y-3">
            <div className="card p-4 text-sm">
              <div className="grid grid-cols-2 gap-y-1"><span className="text-text-2">Gross</span><Money paise={sale.grossPaise} /><span className="text-text-2">Discount</span><Money paise={-sale.discountPaise} /><span className="text-text-2">Taxable</span><Money paise={sale.taxablePaise} /><span className="text-text-2">GST</span><Money paise={sale.cgstPaise + sale.sgstPaise + sale.igstPaise} /><span className="text-text-2">Round off</span><Money paise={sale.roundOffPaise} signed /><span className="font-semibold">Total</span><span className="num text-lg font-semibold">{rupees(sale.totalPaise)}</span></div>
              <div className="mt-2 border-t border-border pt-2 text-xs text-text-2">Paid {sale.payments.map((p) => `${p.mode.toUpperCase()} ${rupees(p.amountPaise)}`).join(', ') || '—'}{sale.creditPaise > 0 && <div className="font-medium text-warning">Credit {rupees(sale.creditPaise)}</div>}</div>
            </div>
            <div className="card p-4 text-sm">
              <p><span className="text-text-2">Customer:</span> {sale.customerName ?? 'Walk-in'} {sale.customerPhone}{sale.customerId && <Link to="/customers" search={{ id: sale.customerId }} className="ml-2 text-accent underline">Open</Link>}</p>
              {(sale.doctorName || sale.patientName) && <><p className="mt-1"><span className="text-text-2">Prescriber:</span> {sale.doctorName ?? '—'} {sale.doctorRegNo && <span className="text-text-2">({sale.doctorRegNo})</span>}</p><p><span className="text-text-2">Patient:</span> {sale.patientName ?? '—'}{sale.patientAge ? `, ${sale.patientAge} y` : ''}{sale.patientAddress ? `, ${sale.patientAddress}` : ''}</p></>}
              {sale.pharmacist && <p className="mt-1"><span className="text-text-2">Pharmacist on duty:</span> {sale.pharmacist.name} {sale.pharmacist.regNo}</p>}
            </div>
            <details className="card p-4 text-sm"><summary className="cursor-pointer font-medium">Print preview ({fmt})</summary><div className="mt-3 overflow-auto rounded border border-border bg-white p-2" tabIndex={0} role="region" aria-label="Bill print preview"><InvoicePrint sale={sale} store={store} format={fmt} /></div></details>
          </div>
        </div>
      </div>
      <div className="print-only"><InvoicePrint sale={sale} store={store} format={fmt} /></div>
      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel ${sale.invoiceNo}?`} confirmLabel="Cancel bill" onConfirm={() => cancel.mutate()} loading={cancel.isPending} requireReason reason={reason} onReason={setReason}>
        <p>All items go back into their batches and any credit is reversed. The bill number stays in the series as cancelled (it cannot be reused) and the register entries remain on record.</p>
      </ConfirmDialog>
      {returnOpen && <ReturnDialog sale={sale} onClose={() => setReturnOpen(false)} />}
    </div>
  );
}

function ReturnDialog({ sale, onClose }: { sale: SaleFull; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'cash' | 'upi' | 'card' | 'credit'>(sale.creditPaise > 0 && sale.customerId ? 'credit' : 'cash');
  const lines = sale.lines.filter((l) => l.qtyUnits - l.returnedUnits > 0);
  const est = lines.reduce((a, l) => a + Math.round((l.netPaise * (qty[l.id] ?? 0)) / l.qtyUnits), 0);
  const m = useMutation({
    mutationFn: () => api.post<{ id: number; creditNoteNo: string; totalPaise: number }>('/sale-returns', { saleId: sale.id, reason, refundMode: mode, date: todayIST(), lines: Object.entries(qty).filter(([, v]) => v > 0).map(([k, v]) => ({ saleLineId: Number(k), qtyUnits: v })) }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['sale', String(sale.id)] }); qc.invalidateQueries({ queryKey: ['sales'] }); toast.success(`Credit note ${r.creditNoteNo} for ${rupees(r.totalPaise)}`); onClose(); nav({ to: '/sales/$id', params: { id: String(sale.id) } }); },
    onError: (e: Error) => toast.error('Return failed', e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Return items from ${sale.invoiceNo}`} size="lg" description="Returned stock goes back into the same batch. A credit note is issued against this bill."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={est <= 0 || !reason.trim()} loading={m.isPending} onClick={() => m.mutate()}>Issue credit note for {rupees(est)}</Button></>}>
      <table className="tbl mb-3">
        <thead><tr><th>Item</th><th className="num">Sold (units)</th><th className="num">Already returned</th><th className="w-32">Return units</th></tr></thead>
        <tbody>{lines.map((l) => { const max = l.qtyUnits - l.returnedUnits; return <tr key={l.id}><td>{l.itemName}<div className="text-xs text-text-2">B. {l.batchNo} · {l.unitsPerPack} {l.baseUnit}s per {l.packName}</div></td><td className="num">{l.qtyUnits}</td><td className="num">{l.returnedUnits}</td><td><Input dense type="number" min={0} max={max} value={qty[l.id] ?? ''} placeholder="0" aria-label={`Units of ${l.itemName} to return`} onChange={(e) => setQty({ ...qty, [l.id]: Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0))) })} /></td></tr>; })}</tbody>
      </table>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Refund by" required>{(id) => <NativeSelect id={id} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>{sale.customerId && <option value="credit">Adjust against customer account</option>}</NativeSelect>}</Field>
        <Field label="Reason" required className="sm:col-span-2">{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Unopened strip returned within 7 days" />}</Field>
      </div>
    </Dialog>
  );
}
