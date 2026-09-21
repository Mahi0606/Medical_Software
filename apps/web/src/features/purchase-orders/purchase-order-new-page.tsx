import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Button, Callout, PageHeader } from '@/components/ui';
import { describeError, type DescribedError } from '../items/item-shared';
import { useSupplier } from '../purchases/supplier-picker';
import { blankEditor, editorPayload, PoEditor, validateEditor, type EditorValue } from './po-editor';
import type { PurchaseOrder } from './po-shared';

export function PurchaseOrderNewPage() {
  const search = useSearch({ from: '/app/purchase-orders/new' });
  const nav = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState<EditorValue>(() => blankEditor());
  const [error, setError] = useState<DescribedError | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const prefill = useSupplier(search.supplierId);
  useEffect(() => { if (prefill.data && !v.supplier) setV((s) => ({ ...s, supplier: prefill.data! })); }, [prefill.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api.post<PurchaseOrder>('/purchase-orders', editorPayload(v)),
    onSuccess: (po) => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['reorder'] }); toast.success(`${po.poNo} saved as draft`, 'Mark it as sent once the supplier has it.'); nav({ to: '/purchase-orders/$id', params: { id: String(po.id) } }); },
    onError: (e) => showError(describeError(e)),
  });
  const showError = (e: DescribedError | null) => { setError(e); if (e) setTimeout(() => errorRef.current?.focus(), 0); };
  const onSave = () => { const err = validateEditor(v); if (err) { showError(err); return; } save.mutate(); };

  if (!can('purchase.create')) return <Callout tone="warning" title="You cannot raise purchase orders with this login">Ask the owner or pharmacist to place the order.</Callout>;
  return (
    <div>
      <PageHeader title="New purchase order" description="List what to order from one supplier. It is saved as a draft; nothing goes to the supplier until you mark it as sent."
        actions={<>
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => nav({ to: '/purchase-orders', search: { tab: 'orders' } })}>All orders</Button>
          <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={onSave}>Save draft</Button>
        </>} />
      {search.fromReorder && <Callout tone="accent" className="mb-4">Tip: the “Reorder suggestions” tab can build this list for you from sales and stock levels.</Callout>}
      <PoEditor value={v} onChange={(fn) => { setV(fn); if (error) setError(null); }} error={error} errorRef={errorRef} />
      <div className="mt-4 flex justify-end"><Button size="lg" variant="primary" icon={<Save className="h-5 w-5" />} loading={save.isPending} onClick={onSave}>Save draft</Button></div>
    </div>
  );
}
