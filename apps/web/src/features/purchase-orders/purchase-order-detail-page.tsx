import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Ban, Copy, MessageCircle, PackageCheck, Pencil, Printer, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { formatDateIN, formatDateTimeIN, rupees } from '@/lib/utils';
import { Badge, Button, Callout, ConfirmDialog, Dialog, Field, Money, NativeSelect, PageHeader, Sheet, Spinner } from '@/components/ui';
import { describeError, type DescribedError } from '../items/item-shared';
import { editorFromPo, editorPayload, PoEditor, validateEditor, type EditorValue } from './po-editor';
import { PoStatusBadge, PurchaseOrderPrint, SEND_VIA_LABEL, packs, whatsappUrl, type PoPrintPayload, type PurchaseOrder, type SendVia } from './po-shared';

export function PurchaseOrderDetailPage() {
  const { id } = useParams({ from: '/app/purchase-orders/$id' });
  const search = useSearch({ from: '/app/purchase-orders/$id' });
  const nav = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const q = useQuery({ queryKey: ['purchase-order', id], queryFn: () => api.get<PoPrintPayload>(`/purchase-orders/${id}/print`) });
  useEffect(() => { if (search.print && q.data) { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); } }, [search.print, q.data]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['purchase-order', id] }); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['reorder'] }); };
  const cancel = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${id}/cancel`, { reason }),
    onSuccess: () => { refresh(); setCancelOpen(false); toast.success('Order cancelled', 'It no longer counts as stock on order.'); },
    onError: (e) => toast.error('Could not cancel', describeError(e).title),
  });

  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Callout tone="danger" title="Purchase order not found">{q.error ? describeError(q.error).title : ''} <Link to="/purchase-orders" search={{ tab: 'orders' }} className="text-accent underline">Back to purchase orders</Link></Callout>;
  const { po, store, supplier } = q.data;
  if (search.print) return <div className="print-root"><style>{'body{background:#fff} .no-print{display:none}'}</style><PurchaseOrderPrint po={po} store={store} supplier={supplier} /></div>;
  const openReceipts = po.receipts.filter((r) => r.status !== 'cancelled');
  const canWrite = can('purchase.create');
  const receivable = po.status === 'sent' || po.status === 'partially_received' || po.status === 'draft';
  const title = po.poNo ?? `Order #${po.id}`;
  const pctDone = po.orderedPacks > 0 ? Math.round((po.receivedPacks / po.orderedPacks) * 100) : 0;

  return (
    <div>
      <div className="no-print">
        <PageHeader title={title} description={<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Supplier <Link to="/suppliers" search={{ id: po.supplierId }} className="font-medium text-accent hover:underline">{supplier.name}</Link>{supplier.phone && <span className="text-text-2"> · {supplier.phone}</span>}</span>
          <span>· Ordered {formatDateIN(po.date)}</span>{po.expectedDate && <span>· Due {formatDateIN(po.expectedDate)}</span>}<span>· by {po.createdByName ?? '—'}</span>
          <PoStatusBadge status={po.status} />{po.sentAt && po.sentVia && <Badge tone="neutral">via {SEND_VIA_LABEL[po.sentVia]} · {formatDateTimeIN(po.sentAt)}</Badge>}
        </span>}
          actions={<>
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav({ to: '/purchase-orders', search: { tab: 'orders' } })}>All orders</Button>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
            {canWrite && po.status === 'draft' && <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>Edit</Button>}
            {canWrite && (po.status === 'draft' || po.status === 'sent') && <Button variant={po.status === 'draft' ? 'primary' : 'secondary'} icon={<Send className="h-4 w-4" />} onClick={() => setSendOpen(true)}>{po.status === 'draft' ? 'Mark as sent' : 'Send again'}</Button>}
            {canWrite && receivable && <Button variant={po.status === 'draft' ? 'secondary' : 'primary'} icon={<PackageCheck className="h-4 w-4" />} onClick={() => nav({ to: '/purchases/new', search: { poId: po.id } })}>Receive stock</Button>}
            {canWrite && po.status !== 'cancelled' && po.status !== 'received' && <Button variant="danger" icon={<Ban className="h-4 w-4" />} disabled={openReceipts.length > 0} title={openReceipts.length > 0 ? 'Stock has been received against this order' : undefined} onClick={() => setCancelOpen(true)}>Cancel order</Button>}
          </>} />

        {po.status === 'cancelled' && <Callout tone="danger" className="mb-3" title="This order was cancelled">{po.cancelReason}</Callout>}
        {po.status === 'draft' && <Callout tone="accent" className="mb-3" title="Draft — the supplier has not been told yet">Send it on WhatsApp or print it, then “Mark as sent”. Sent orders count as stock on order in the reorder suggestions.</Callout>}
        {po.status === 'partially_received' && <Callout tone="warning" className="mb-3" title={`${po.pendingPacks} ${po.pendingPacks === 1 ? 'pack is' : 'packs are'} still to come`}>Receive the balance from the supplier's next invoice with “Receive stock”; the order closes by itself when every line is in.</Callout>}
        {po.status === 'received' && <Callout tone="success" className="mb-3" title="Everything on this order has been received">{openReceipts.length} {openReceipts.length === 1 ? 'receipt' : 'receipts'} linked below.</Callout>}

        <div className="grid gap-4 lg:grid-cols-4">
          <div className="space-y-4 lg:col-span-3">
            <div className="table-wrap">
              <table className="tbl dense">
                <thead><tr><th>Item</th><th className="num">In stock</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Pending</th><th className="num">Rate</th><th className="num">MRP</th><th className="num">Amount</th><th>Note</th></tr></thead>
                <tbody>{po.lines.map((l) => {
                  const done = l.receivedPacks >= l.qtyPacks;
                  return (
                    <tr key={l.id}>
                      <td><Link to="/items/$id" params={{ id: String(l.itemId) }} className="font-medium text-accent hover:underline">{l.itemName}</Link><div className="text-[11px] text-text-2">{l.genericText} · {l.unitsPerPack} {l.baseUnit}/{l.packName}</div></td>
                      <td className="num text-text-2">{l.stockUnits} u</td>
                      <td className="num">{packs(l.qtyPacks, l.packName)}</td>
                      <td className="num">{l.receivedPacks > 0 ? <span className={done ? 'text-success' : undefined}>{l.receivedPacks}{l.receivedPacks > l.qtyPacks && <span className="text-text-2"> (+{l.receivedPacks - l.qtyPacks} extra)</span>}</span> : <span className="text-text-2">—</span>}</td>
                      <td className="num">{po.status === 'cancelled' ? <span className="text-text-2">—</span> : done ? <Badge tone="success">Complete</Badge> : <span className={l.receivedPacks > 0 ? 'font-medium text-warning' : undefined}>{l.pendingPacks}</span>}</td>
                      <td className="num">{l.ratePaise ? <Money paise={l.ratePaise} /> : <span className="text-text-2">—</span>}</td>
                      <td className="num">{l.mrpPaise ? <Money paise={l.mrpPaise} /> : <span className="text-text-2">—</span>}</td>
                      <td className="num font-medium">{l.ratePaise ? <Money paise={l.amountPaise} /> : <span className="text-text-2">—</span>}</td>
                      <td className="text-text-2">{l.note ?? ''}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>

            <section className="card p-4" aria-labelledby="h-receipts">
              <h2 id="h-receipts" className="text-base font-semibold">Linked receipts (GRN)</h2>
              {po.receipts.length === 0 ? <p className="mt-1 text-sm text-text-2">Nothing received against this order yet.{receivable && canWrite && ' Use “Receive stock” when the supplier invoice arrives; the lines are prefilled from this order.'}</p> : (
                <ul className="mt-2 divide-y divide-border text-sm">{po.receipts.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <Link to="/purchases/$id" params={{ id: String(r.id) }} className="font-medium text-accent hover:underline">{r.grnNo ?? `GRN #${r.id}`}</Link>
                    <span className="text-text-2">Invoice {r.invoiceNo} · {formatDateIN(r.invoiceDate)} · received {formatDateIN(r.receivedDate)}</span>
                    <span className="ml-auto num font-medium"><Money paise={r.totalPaise} /></span>
                    {r.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Posted</Badge>}
                  </li>
                ))}</ul>
              )}
            </section>
          </div>

          <div className="space-y-3">
            <div className="card p-4 text-sm">
              <div className="grid grid-cols-2 gap-y-1">
                <span className="text-text-2">Lines</span><span className="num">{po.lines.length}</span>
                <span className="text-text-2">Packs ordered</span><span className="num">{po.orderedPacks}</span>
                <span className="text-text-2">Packs received</span><span className="num">{po.receivedPacks} · {pctDone}%</span>
                <span className="text-text-2">Pending</span><span className="num">{po.status === 'cancelled' ? '—' : po.pendingPacks}</span>
                <span className="font-semibold">Estimated</span><span className="num text-lg font-semibold">{po.estimatedPaise > 0 ? rupees(po.estimatedPaise) : '—'}</span>
              </div>
              <p className="mt-2 border-t border-border pt-2 text-xs text-text-2">Estimate = Σ qty × expected rate, before GST. Actual cost comes from the supplier invoice.</p>
            </div>
            {po.notes && <div className="card p-4 text-sm"><p className="font-medium">Notes to supplier</p><p className="text-text-2">{po.notes}</p></div>}
            <div className="card p-4 text-sm">
              <p className="font-medium">{supplier.name}</p>
              <p className="text-text-2">{[supplier.address, supplier.city].filter(Boolean).join(', ') || 'No address on file'}</p>
              {supplier.phone && <p className="text-text-2">Ph {supplier.phone}</p>}{supplier.gstin && <p className="text-text-2">GSTIN {supplier.gstin}</p>}{supplier.drugLicenceNo && <p className="text-text-2">DL {supplier.drugLicenceNo}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="print-only"><PurchaseOrderPrint po={po} store={store} supplier={supplier} /></div>

      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel ${title}?`} confirmLabel="Cancel order" onConfirm={() => cancel.mutate()} loading={cancel.isPending} requireReason reason={reason} onReason={setReason}>
        <p>The order stops counting as stock on order. Tell the supplier separately if it has already been sent. The PO number stays in the series as cancelled.</p>
      </ConfirmDialog>
      {sendOpen && <SendDialog po={po} supplierPhone={supplier.phone} onClose={() => setSendOpen(false)} onSent={refresh} />}
      {editOpen && <EditSheet po={po} onClose={() => setEditOpen(false)} onSaved={() => { refresh(); setEditOpen(false); }} />}
    </div>
  );
}

function SendDialog({ po, supplierPhone, onClose, onSent }: { po: PurchaseOrder; supplierPhone: string | null; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [via, setVia] = useState<SendVia>(supplierPhone ? 'whatsapp' : 'print');
  const [text, setText] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => api.post<PurchaseOrder & { messageText: string }>(`/purchase-orders/${po.id}/send`, { via }),
    onSuccess: (r) => {
      onSent();
      setText(r.messageText);
      if (via === 'whatsapp') {
        if (supplierPhone) window.open(whatsappUrl(supplierPhone, r.messageText), '_blank', 'noopener');
        else toast.warn('Supplier has no phone number', 'Copy the text below and send it yourself.');
      } else if (via === 'print') {
        setTimeout(() => window.print(), 300);
      }
      toast.success(`${po.poNo} marked as sent`, `via ${SEND_VIA_LABEL[via]}`);
    },
    onError: (e) => toast.error('Could not mark as sent', describeError(e).title),
  });
  const copy = async () => { if (!text) return; try { await navigator.clipboard.writeText(text); toast.success('Order text copied'); } catch { toast.warn('Could not copy', 'Select the text and copy it manually.'); } };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={text ? `${po.poNo} sent` : `Send ${po.poNo}`} size="md"
      description={text ? 'The order is now counted as stock on order.' : 'Choose how the supplier gets it. WhatsApp opens a ready-made message in a new tab.'}
      footer={text ? <><Button variant="ghost" onClick={copy} icon={<Copy className="h-4 w-4" />}>Copy text</Button>{supplierPhone && <Button icon={<MessageCircle className="h-4 w-4" />} onClick={() => window.open(whatsappUrl(supplierPhone, text), '_blank', 'noopener')}>Open WhatsApp</Button>}<Button variant="primary" onClick={onClose}>Done</Button></>
        : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={send.isPending} icon={via === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : via === 'print' ? <Printer className="h-4 w-4" /> : <Send className="h-4 w-4" />} onClick={() => send.mutate()}>{via === 'whatsapp' ? 'Open WhatsApp & mark sent' : via === 'print' ? 'Print & mark sent' : 'Mark as sent'}</Button></>}>
      {text ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 text-sm" tabIndex={0} aria-label="Order text">{text}</pre>
      ) : (
        <div className="space-y-3">
          <Field label="Send via" hint={via === 'whatsapp' && !supplierPhone ? 'This supplier has no phone number; add one under Suppliers or choose another way.' : undefined}>{(id, d) => <NativeSelect id={id} aria-describedby={d} value={via} onChange={(e) => setVia(e.target.value as SendVia)}>{(Object.keys(SEND_VIA_LABEL) as SendVia[]).map((k) => <option key={k} value={k}>{SEND_VIA_LABEL[k]}</option>)}</NativeSelect>}</Field>
          <p className="text-sm text-text-2">{po.lines.length} {po.lines.length === 1 ? 'line' : 'lines'} · {po.orderedPacks} packs{supplierPhone && ` · to ${supplierPhone}`}</p>
        </div>
      )}
    </Dialog>
  );
}

function EditSheet({ po, onClose, onSaved }: { po: PurchaseOrder; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<EditorValue>(() => editorFromPo(po));
  const [error, setError] = useState<DescribedError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const save = useMutation({
    mutationFn: () => api.put<PurchaseOrder>(`/purchase-orders/${po.id}`, editorPayload(v)),
    onSuccess: () => { toast.success(`${po.poNo} updated`); onSaved(); },
    onError: (e) => { setError(describeError(e)); setTimeout(() => errorRef.current?.focus(), 0); },
  });
  const onSave = () => { const err = validateEditor(v); if (err) { setError(err); setTimeout(() => errorRef.current?.focus(), 0); return; } save.mutate(); };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={`Edit ${po.poNo}`} width="xl" description="Only drafts can be edited. Lines are replaced with what you save here."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={onSave}>Save changes</Button></>}>
      <PoEditor value={v} onChange={(fn) => { setV(fn); if (error) setError(null); }} error={error} errorRef={errorRef} idPrefix={`po${po.id}`} supplierLocked />
    </Sheet>
  );
}
