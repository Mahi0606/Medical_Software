import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { FileUp, Plus, Printer, Search, Truck, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { formatDateIN, formatExpiry, rupees } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, Input, Money, NativeSelect, PageHeader, Pagination, Sheet, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { describeError } from '../items/item-shared';
import { RETURN_REASON_LABEL, printReturnNote, routeLabel, routeSentence, type PurchaseReturnDetail, type StoreInfo } from './return-note';
import type { Supplier } from './supplier-picker';

interface GrnRow { id: number; grnNo: string | null; invoiceNo: string; invoiceDate: string; receivedDate: string; status: string; supplierId: number; supplierName: string; totalPaise: number; taxablePaise: number; lineCount: number }
interface ReturnRow { id: number; docNo: string | null; date: string; route: 'supply_invoice' | 'credit_note'; supplierName: string; totalPaise: number; itcReversalPaise: number; status: string; supplierRef: string | null }
const PAGE = 50;

export function PurchasesPage() {
  const search = useSearch({ from: '/app/purchases' });
  const nav = useNavigate();
  const { can } = useAuth();
  const tab = search.tab === 'returns' ? 'returns' : 'receipts';
  const [q, setQ] = useState(search.q ?? '');
  useEffect(() => { setQ(search.q ?? ''); }, [search.q]);
  const page = search.page ?? 1;
  const from = search.from ?? '';
  const to = search.to ?? '';
  const supplierId = search.status ? Number(search.status) || undefined : undefined;
  const suppliers = useQuery({ queryKey: ['suppliers', 'all-active'], queryFn: () => api.get<Supplier[]>('/suppliers') });
  const set = (patch: Partial<typeof search>) => nav({ to: '/purchases', search: (s) => ({ ...s, page: 1, ...patch }) });

  const receipts = useQuery({ queryKey: ['purchases', search.q, from, to, supplierId, page], queryFn: () => api.get<{ rows: GrnRow[]; total: number }>('/purchases', { q: search.q, from: from || undefined, to: to || undefined, supplierId, page, pageSize: PAGE }), enabled: tab === 'receipts', placeholderData: (p) => p });
  const returns = useQuery({ queryKey: ['purchase-returns', from, to, supplierId, page], queryFn: () => api.get<{ rows: ReturnRow[]; total: number }>('/purchase-returns', { from: from || undefined, to: to || undefined, supplierId, page, pageSize: PAGE }), enabled: tab === 'returns', placeholderData: (p) => p });
  const [openReturn, setOpenReturn] = useState<number | null>(null);

  return (
    <div>
      <PageHeader title="Purchases" description="Stock received from suppliers (GRN) and stock sent back to them."
        actions={<>
          {can('purchase.create') && <Button icon={<FileUp className="h-4 w-4" />} onClick={() => nav({ to: '/purchases/new' })}>Import distributor CSV</Button>}
          {can('purchase.return') && tab === 'returns' && <Button icon={<Undo2 className="h-4 w-4" />} onClick={() => nav({ to: '/purchases/returns', search: {} })}>New return</Button>}
          {can('purchase.create') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => nav({ to: '/purchases/new' })}>New receipt</Button>}
        </>} />
      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'returns' ? 'returns' : undefined, q: undefined })}>
        <TabsList><TabsTrigger value="receipts" count={tab === 'receipts' ? receipts.data?.total : undefined}>Receipts (GRN)</TabsTrigger><TabsTrigger value="returns" count={tab === 'returns' ? returns.data?.total : undefined}>Returns to supplier</TabsTrigger></TabsList>

        <form className="my-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || undefined }); }}>
          {tab === 'receipts' && <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="GRN no, invoice no or supplier" aria-label="Search receipts" addonStart={<Search className="h-4 w-4" />} className="w-72" />}
          <label className="text-xs text-text-2">From<Input dense type="date" value={from} onChange={(e) => set({ from: e.target.value || undefined })} aria-label="From date" /></label>
          <label className="text-xs text-text-2">To<Input dense type="date" value={to} onChange={(e) => set({ to: e.target.value || undefined })} aria-label="To date" /></label>
          <NativeSelect dense value={supplierId ?? ''} onChange={(e) => set({ status: e.target.value || undefined })} aria-label="Supplier" className="w-56"><option value="">All suppliers</option>{suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
          {tab === 'receipts' && <Button type="submit" size="sm">Search</Button>}
        </form>

        <TabsContent value="receipts">
          <div className="table-wrap">
            {receipts.isLoading ? <div className="p-6"><Spinner /></div> : receipts.isError ? <div className="p-4"><Callout tone="danger" title="Could not load receipts">{describeError(receipts.error).title}</Callout></div> : !receipts.data?.rows.length ? (
              <EmptyState icon={Truck} title={search.q || from || to || supplierId ? 'No receipts match these filters' : 'No stock received yet'} action={can('purchase.create') ? <Button variant="primary" onClick={() => nav({ to: '/purchases/new' })}>Receive stock</Button> : undefined}>{search.q || from || to || supplierId ? 'Widen the date range or clear the search.' : 'Enter a supplier invoice to put stock on the shelf, or import the distributor CSV.'}</EmptyState>
            ) : (
              <table className="tbl dense">
                <thead><tr><th>GRN no</th><th>Supplier invoice</th><th>Received</th><th>Supplier</th><th className="num">Lines</th><th className="num">Taxable</th><th className="num">Total</th><th>Status</th></tr></thead>
                <tbody>{receipts.data.rows.map((r) => (
                  <tr key={r.id} data-tone={r.status === 'cancelled' ? 'danger' : undefined}>
                    <td><Link to="/purchases/$id" params={{ id: String(r.id) }} className="font-medium text-accent hover:underline">{r.grnNo ?? `#${r.id}`}</Link></td>
                    <td>{r.invoiceNo}<div className="text-[11px] text-text-2">{formatDateIN(r.invoiceDate)}</div></td>
                    <td>{formatDateIN(r.receivedDate)}</td>
                    <td><Link to="/suppliers" search={{ id: r.supplierId }} className="hover:underline">{r.supplierName}</Link></td>
                    <td className="num">{r.lineCount}</td>
                    <td className="num"><Money paise={r.taxablePaise} /></td>
                    <td className="num font-medium"><Money paise={r.totalPaise} /></td>
                    <td>{r.status === 'cancelled' ? <Badge tone="danger">Cancelled</Badge> : r.status === 'posted' ? <Badge tone="success">Posted</Badge> : <Badge tone="neutral">Draft</Badge>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          {receipts.data && <div className="mt-3 flex justify-end"><Pagination page={page} pageSize={PAGE} total={receipts.data.total} onPage={(p) => nav({ to: '/purchases', search: (s) => ({ ...s, page: p }) })} /></div>}
        </TabsContent>

        <TabsContent value="returns">
          <div className="table-wrap">
            {returns.isLoading ? <div className="p-6"><Spinner /></div> : returns.isError ? <div className="p-4"><Callout tone="danger" title="Could not load returns">{describeError(returns.error).title}</Callout></div> : !returns.data?.rows.length ? (
              <EmptyState icon={Undo2} title="No returns to suppliers yet" action={can('purchase.return') ? <Button variant="primary" onClick={() => nav({ to: '/purchases/returns', search: {} })}>Return stock to a supplier</Button> : undefined}>Expired, damaged or excess stock goes back to the supplier from here; the return creates the GST paperwork.</EmptyState>
            ) : (
              <table className="tbl dense">
                <thead><tr><th>Doc no</th><th>Date</th><th>Supplier</th><th>Route</th><th className="num">Total</th><th className="num">ITC reversal</th><th>Supplier ref</th></tr></thead>
                <tbody>{returns.data.rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer" tabIndex={0} onClick={() => setOpenReturn(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenReturn(r.id); }} aria-label={`Open return ${r.docNo ?? r.id}`} data-tone={r.status === 'cancelled' ? 'danger' : undefined}>
                    <td className="font-medium text-accent">{r.docNo ?? `#${r.id}`}</td>
                    <td>{formatDateIN(r.date)}</td>
                    <td>{r.supplierName}</td>
                    <td><Badge tone={r.route === 'credit_note' ? 'warning' : 'accent'}>{routeLabel(r.route)}</Badge></td>
                    <td className="num font-medium"><Money paise={r.totalPaise} /></td>
                    <td className="num">{r.itcReversalPaise > 0 ? <Money paise={r.itcReversalPaise} /> : <span className="text-text-3">—</span>}</td>
                    <td className="text-text-2">{r.supplierRef ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          {returns.data && <div className="mt-3 flex justify-end"><Pagination page={page} pageSize={PAGE} total={returns.data.total} onPage={(p) => nav({ to: '/purchases', search: (s) => ({ ...s, page: p }) })} /></div>}
        </TabsContent>
      </Tabs>
      {openReturn !== null && <ReturnDetailSheet id={openReturn} onClose={() => setOpenReturn(null)} />}
    </div>
  );
}

/** Side panel with one purchase return and a Print button (used from the list). */
export function ReturnDetailSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ['purchase-return', id], queryFn: () => api.get<PurchaseReturnDetail>(`/purchase-returns/${id}`) });
  const store = useQuery({ queryKey: ['store'], queryFn: () => api.get<StoreInfo>('/store') });
  const r = q.data;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={r?.docNo ?? 'Return to supplier'} width="lg" description={r ? `${formatDateIN(r.date)} · ${r.supplierName}` : undefined}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" icon={<Printer className="h-4 w-4" />} disabled={!r || !store.data} onClick={() => { if (r && store.data) printReturnNote(r, store.data); else toast.warn('Store details are still loading'); }}>Print return note</Button></>}>
      {q.isLoading ? <Spinner /> : !r ? <Callout tone="danger" title="Could not load this return">{q.error ? describeError(q.error).title : ''}</Callout> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={r.route === 'credit_note' ? 'warning' : 'accent'}>{routeLabel(r.route)}</Badge>{r.status === 'cancelled' && <Badge tone="danger">Cancelled</Badge>}{r.supplierRef && <span className="text-text-2">Supplier ref: {r.supplierRef}</span>}{r.supplierGstin && <span className="text-text-2">GSTIN {r.supplierGstin}</span>}</div>
          <Callout tone="accent">{routeSentence(r)}</Callout>
          <div className="table-wrap">
            <table className="tbl dense">
              <thead><tr><th>Item</th><th>Batch / Exp</th><th>Reason</th><th className="num">Qty (units)</th><th className="num">Rate / pack</th><th className="num">Taxable</th><th className="num">GST</th><th className="num">Total</th></tr></thead>
              <tbody>{r.lines.map((l) => <tr key={l.id}><td className="font-medium">{l.itemName}<div className="text-[11px] font-normal text-text-2">HSN {l.hsn}</div></td><td>{l.batchNo}<div className="text-[11px] text-text-2">Exp {formatExpiry(l.expiryDate)}</div></td><td>{RETURN_REASON_LABEL[l.reason] ?? l.reason}</td><td className="num">{l.qtyUnits}</td><td className="num"><Money paise={l.ratePaise} /></td><td className="num"><Money paise={l.taxablePaise} /></td><td className="num"><Money paise={l.taxPaise} /><div className="text-[11px] text-text-2">{l.gstRatePct}%</div></td><td className="num"><Money paise={l.totalPaise} /></td></tr>)}</tbody>
            </table>
          </div>
          <div className="card grid grid-cols-2 gap-y-1 p-4"><span className="text-text-2">Taxable</span><Money paise={r.taxablePaise} />{r.igstPaise > 0 ? <><span className="text-text-2">IGST</span><Money paise={r.igstPaise} /></> : <><span className="text-text-2">CGST</span><Money paise={r.cgstPaise} /><span className="text-text-2">SGST</span><Money paise={r.sgstPaise} /></>}<span className="font-semibold">Total</span><span className="num text-lg font-semibold">{rupees(r.totalPaise)}</span>{r.route === 'credit_note' && <><span className="text-text-2">ITC to reverse</span><Money paise={r.itcReversalPaise} /></>}</div>
          {r.notes && <p className="text-text-2">Notes: {r.notes}</p>}
        </div>
      )}
    </Sheet>
  );
}
