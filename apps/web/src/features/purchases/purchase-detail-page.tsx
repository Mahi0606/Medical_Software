import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Ban, Printer, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { cn, formatDateIN, formatDateTimeIN, formatExpiry, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, ConfirmDialog, ExpiryBadge, Money, PageHeader, Spinner } from '@/components/ui';
import { describeError } from '../items/item-shared';

interface PurchaseLine { id: number; itemId: number; batchId: number | null; batchNo: string; mfgDate: string | null; expiryDate: string; qtyPacks: number; freePacks: number; unitsPerPack: number; ratePaise: number; discountPct: number; mrpPaise: number; gstRatePct: number; hsn: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number; schemeNote: string | null; itemName: string; packName: string; currentQty: number | null }
interface Purchase { id: number; grnNo: string | null; supplierId: number; supplierName: string; supplierGstin: string | null; invoiceNo: string; invoiceDate: string; receivedDate: string; status: 'draft' | 'posted' | 'cancelled'; interstate: boolean; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; otherChargesPaise: number; roundOffPaise: number; totalPaise: number; notes: string | null; createdByName: string | null; createdAt: string; postedAt: string | null; cancelledAt: string | null; cancelReason: string | null; lines: PurchaseLine[] }

export function PurchaseDetailPage() {
  const { id } = useParams({ from: '/app/purchases/$id' });
  const nav = useNavigate();
  const { can, store } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const today = todayIST();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['purchase', id], queryFn: () => api.get<Purchase>(`/purchases/${id}`) });
  const cancel = useMutation({
    mutationFn: () => api.post(`/purchases/${id}/cancel`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase', id] }); qc.invalidateQueries({ queryKey: ['purchases'] }); qc.invalidateQueries({ queryKey: ['batches'] }); qc.invalidateQueries({ queryKey: ['items'] }); setCancelOpen(false); toast.success('Receipt cancelled', 'The received units were taken back out of stock.'); },
    onError: (e) => toast.error('Could not cancel', describeError(e).title),
  });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Callout tone="danger" title="Receipt not found">{q.error ? describeError(q.error).title : ''} <Link to="/purchases" className="text-accent underline">Back to purchases</Link></Callout>;
  const p = q.data;
  const composition = store?.gstScheme === 'composition';
  const labelIds = p.lines.filter((l) => l.batchId).map((l) => `${l.batchId}:${l.qtyPacks + l.freePacks}`).join(',');
  const stockShort = p.lines.some((l) => (l.currentQty ?? 0) < (l.qtyPacks + l.freePacks) * l.unitsPerPack);
  return (
    <div>
      <PageHeader title={p.grnNo ?? `Receipt #${p.id}`} description={<span className="flex flex-wrap items-center gap-x-2">
        <span>Supplier <Link to="/suppliers" search={{ id: p.supplierId }} className="font-medium text-accent hover:underline">{p.supplierName}</Link>{p.supplierGstin && <span className="text-text-2"> · {p.supplierGstin}</span>}</span>
        <span>· Invoice <span className="font-medium text-text">{p.invoiceNo}</span> dated {formatDateIN(p.invoiceDate)}</span><span>· Received {formatDateIN(p.receivedDate)}</span><span>· by {p.createdByName ?? '—'} {formatDateTimeIN(p.createdAt)}</span>
        {p.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : p.status === 'posted' ? <Badge tone="success">Posted</Badge> : <Badge tone="neutral">Draft</Badge>}{p.interstate && <Badge tone="accent">Inter-state (IGST)</Badge>}
      </span>}
        actions={<>
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav({ to: '/purchases' })}>All receipts</Button>
          {can('label.print') && labelIds && p.status === 'posted' && <Button icon={<Printer className="h-4 w-4" />} onClick={() => nav({ to: '/labels', search: { batchIds: labelIds } })}>Print labels</Button>}
          {can('purchase.return') && p.status === 'posted' && <Button icon={<Undo2 className="h-4 w-4" />} onClick={() => nav({ to: '/purchases/returns', search: { supplierId: p.supplierId } })}>Return items to supplier</Button>}
          {can('purchase.create') && p.status === 'posted' && <Button variant="danger" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelOpen(true)}>Cancel receipt</Button>}
        </>} />
      {p.status === 'cancelled' && <Callout tone="danger" className="mb-3" title="This receipt was cancelled">{p.cancelReason}{p.cancelledAt && ` · ${formatDateTimeIN(p.cancelledAt)}`}. The units were removed from stock and the supplier ledger was reversed.</Callout>}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="table-wrap lg:col-span-3">
          <table className="tbl dense">
            <thead><tr><th>Item</th><th>Batch / Exp</th><th className="num">Qty + free</th><th className="num">Units</th><th className="num">Rate</th><th className="num">Disc</th><th className="num">MRP</th><th className="num">GST</th><th className="num">Taxable</th><th className="num">Tax</th><th className="num">Total</th><th className="num">Margin</th><th className="num">In stock now</th></tr></thead>
            <tbody>{p.lines.map((l) => {
              const packs = l.qtyPacks + l.freePacks;
              const eff = packs > 0 ? Math.round((composition ? l.totalPaise : l.taxablePaise) / packs) : 0;
              const margin = l.mrpPaise > 0 ? Math.round(((l.mrpPaise - eff) / l.mrpPaise) * 1000) / 10 : 0;
              const tax = l.cgstPaise + l.sgstPaise + l.igstPaise;
              return (
                <tr key={l.id}>
                  <td><Link to="/items/$id" params={{ id: String(l.itemId) }} className="font-medium text-accent hover:underline">{l.itemName}</Link><div className="text-[11px] text-text-2">HSN {l.hsn}{l.schemeNote && <> · {l.schemeNote}</>}</div></td>
                  <td>{l.batchNo}<div className="mt-0.5"><ExpiryBadge expiryDate={l.expiryDate} today={today} /></div></td>
                  <td className="num">{l.qtyPacks}{l.freePacks > 0 && <span className="text-success"> +{l.freePacks}</span>} <span className="text-text-2">{l.packName}</span></td>
                  <td className="num">{packs * l.unitsPerPack}</td>
                  <td className="num"><Money paise={l.ratePaise} /></td>
                  <td className="num">{l.discountPct ? `${l.discountPct}%` : '—'}</td>
                  <td className="num"><Money paise={l.mrpPaise} /></td>
                  <td className="num">{l.gstRatePct}%</td>
                  <td className="num"><Money paise={l.taxablePaise} /></td>
                  <td className="num"><Money paise={tax} /></td>
                  <td className="num font-medium"><Money paise={l.totalPaise} /></td>
                  <td className={cn('num', margin < 0 && 'text-danger', margin >= 0 && margin < 10 && 'text-warning')}>{margin}%</td>
                  <td className="num">{l.currentQty === null ? '—' : <span className={cn(l.currentQty < packs * l.unitsPerPack && 'text-text-2')}>{l.currentQty}</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div className="space-y-3">
          <div className="card p-4 text-sm">
            <div className="grid grid-cols-2 gap-y-1"><span className="text-text-2">Taxable</span><Money paise={p.taxablePaise} />{p.interstate ? <><span className="text-text-2">IGST</span><Money paise={p.igstPaise} /></> : <><span className="text-text-2">CGST</span><Money paise={p.cgstPaise} /><span className="text-text-2">SGST</span><Money paise={p.sgstPaise} /></>}<span className="text-text-2">Other charges</span><Money paise={p.otherChargesPaise} signed /><span className="text-text-2">Round off</span><Money paise={p.roundOffPaise} signed /><span className="font-semibold">Total</span><span className="num text-lg font-semibold">{rupees(p.totalPaise)}</span></div>
            <p className="mt-2 border-t border-border pt-2 text-xs text-text-2">{p.lines.length} {p.lines.length === 1 ? 'line' : 'lines'} · {p.lines.reduce((a, l) => a + (l.qtyPacks + l.freePacks) * l.unitsPerPack, 0)} units received{composition && ' · composition scheme: GST is part of cost'}</p>
          </div>
          {p.notes && <div className="card p-4 text-sm"><p className="font-medium">Notes</p><p className="text-text-2">{p.notes}</p></div>}
          <div className="card p-4 text-sm"><p className="font-medium">Manufacturing dates</p>{p.lines.some((l) => l.mfgDate) ? <ul className="mt-1 text-text-2">{p.lines.filter((l) => l.mfgDate).map((l) => <li key={l.id}>{l.itemName} {l.batchNo}: {formatExpiry(l.mfgDate!)}</li>)}</ul> : <p className="text-text-2">Not recorded.</p>}</div>
        </div>
      </div>
      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={`Cancel ${p.grnNo ?? 'this receipt'}?`} confirmLabel="Cancel receipt" onConfirm={() => cancel.mutate()} loading={cancel.isPending} requireReason reason={reason} onReason={setReason}>
        <p>Every unit received on this GRN is taken back out of its batch and the supplier's account is reversed. The GRN number stays in the series as cancelled.</p>
        <p>This only works while all received units are still in stock{stockShort ? ' — some of these batches have already been sold or moved, so the server will refuse; return or adjust those batches instead' : ''}.</p>
      </ConfirmDialog>
    </div>
  );
}
