import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, Printer, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LABEL_PRESETS, labelFieldKeys, type LabelFieldKey, type LabelTemplateInput } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { formatDateTimeIN, formatExpiry, rupees } from '@/lib/utils';
import { Badge, Button, Callout, Combobox, ConfirmDialog, EmptyState, Field, Input, NativeSelect, PageHeader, Sheet, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { LabelCard, LabelSheet, SAMPLE_DATUM, type LabelDatum, type Template } from './label-card';
import { DirectLabelPrintButton } from './direct-print';

type TemplateRow = LabelTemplateInput & { id: number; createdAt: string; updatedAt: string };
interface QueueRow { batchId: number; itemName: string; batchNo: string; expiryDate: string; mrpPaise: number; qtyUnits: number; unitsPerPack: number; packName: string; copies: number }
interface BatchOpt { id: number; batchNo: string; expiryDate: string; mrpPaise: number; qtyUnits: number; itemName: string; unitsPerPack: number; packName: string }

const FIELD_LABELS: Record<LabelFieldKey, string> = { storeName: 'Store name', itemName: 'Item name', generic: 'Composition', batch: 'Batch no.', expiry: 'Expiry', mfg: 'Mfg date', mrp: 'MRP', pack: 'Pack size', rack: 'Rack', packedOn: 'Printed on', barcode: 'Barcode', barcodeText: 'Code under barcode', qrGs1: 'GS1 DataMatrix (needs GTIN)', schedule: 'Schedule mark' };

export function LabelsPage() {
  const search = useSearch({ from: '/app/labels' });
  const nav = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ['label-templates'], queryFn: () => api.get<TemplateRow[]>('/labels/templates') });
  const jobs = useQuery({ queryKey: ['label-jobs'], queryFn: () => api.get<{ id: number; templateName: string | null; labelCount: number; createdAt: string; userName: string | null; payload: { templateId: number; items: { batchId: number; copies: number }[] } }[]>('/labels/jobs') });
  const [tab, setTab] = useState(search.tab ?? 'print');
  const [templateId, setTemplateId] = useState<number | null>(search.templateId ?? null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loose, setLoose] = useState({ qtyText: '', patientName: '', directions: '' });
  const [rendered, setRendered] = useState<{ template: Template; labels: LabelDatum[] } | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const template = useMemo(() => templates.data?.find((t) => t.id === templateId) ?? templates.data?.find((t) => t.isDefault && t.kind === 'product') ?? templates.data?.[0] ?? null, [templates.data, templateId]);

  // Prefill from GRN: ?batchIds=1:22,5:10  (batchId:copies)
  useEffect(() => {
    if (!search.batchIds) return;
    const pairs = search.batchIds.split(',').map((p) => p.split(':')).map(([id, c]) => ({ id: Number(id), copies: Number(c) || 1 })).filter((p) => p.id);
    Promise.all(pairs.map(async (p) => { const b = await api.get<BatchOpt>(`/batches/${p.id}`); return { batchId: b.id, itemName: b.itemName, batchNo: b.batchNo, expiryDate: b.expiryDate, mrpPaise: b.mrpPaise, qtyUnits: b.qtyUnits, unitsPerPack: b.unitsPerPack, packName: b.packName, copies: p.copies }; }))
      .then((rows) => setQueue((q) => [...q.filter((x) => !rows.some((r) => r.batchId === x.batchId)), ...rows])).catch(() => toast.error('Could not load batches for labels'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.batchIds]);

  const build = useMutation({
    mutationFn: () => api.post<{ template: TemplateRow; labels: LabelDatum[]; jobId: number }>('/labels/jobs', { templateId: template!.id, items: queue.map((q) => ({ batchId: q.batchId, copies: q.copies })), loose: template?.kind === 'loose' ? { qtyText: loose.qtyText || null, patientName: loose.patientName || null, directions: loose.directions || null } : undefined }),
    onSuccess: (r) => { setRendered({ template: r.template, labels: r.labels }); qc.invalidateQueries({ queryKey: ['label-jobs'] }); setTimeout(() => window.print(), 500); },
    onError: (e: Error) => toast.error('Could not prepare labels', e.message),
  });
  const reprint = async (job: NonNullable<typeof jobs.data>[number]) => {
    const rows = await Promise.all(job.payload.items.map(async (p) => { const b = await api.get<BatchOpt>(`/batches/${p.batchId}`); return { batchId: b.id, itemName: b.itemName, batchNo: b.batchNo, expiryDate: b.expiryDate, mrpPaise: b.mrpPaise, qtyUnits: b.qtyUnits, unitsPerPack: b.unitsPerPack, packName: b.packName, copies: p.copies }; }));
    setQueue(rows); setTemplateId(job.payload.templateId); setTab('print');
  };
  const total = queue.reduce((a, q) => a + q.copies, 0);
  const previewData: LabelDatum[] = queue.slice(0, 2).map((q) => ({ ...SAMPLE_DATUM, batchId: q.batchId, itemName: q.itemName, batchNo: q.batchNo, expiry: formatExpiry(q.expiryDate), expiryIso: q.expiryDate, mrpPaise: q.mrpPaise, pack: `${q.unitsPerPack} / ${q.packName}`, barcodeValue: `PB${String(q.batchId).padStart(6, '0')}`, barcodeText: `PB${String(q.batchId).padStart(6, '0')}`, gtin: null, gs1Value: null, generic: '', copies: 1, loose: { qtyText: loose.qtyText, patientName: loose.patientName, directions: loose.directions } }));

  return (
    <div>
      <div className="no-print">
        <PageHeader title="Barcode labels" description="Print shelf and pack labels with batch, expiry, MRP and a scannable code. Scanning a label at billing selects the exact batch." />
        <Tabs value={tab} onValueChange={(v) => { setTab(v); nav({ to: '/labels', search: (s) => ({ ...s, tab: v }) }); }}>
          <TabsList><TabsTrigger value="print">Print labels</TabsTrigger><TabsTrigger value="templates" count={templates.data?.length}>Templates</TabsTrigger><TabsTrigger value="jobs">Recent print jobs</TabsTrigger></TabsList>
          <TabsContent value="print" className="pt-4">
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="space-y-4 lg:col-span-3">
                <div className="card p-4">
                  <h2 className="text-base">1. Choose batches</h2>
                  <BatchPicker onAdd={(b, copies) => setQueue((q) => q.some((x) => x.batchId === b.id) ? q.map((x) => (x.batchId === b.id ? { ...x, copies: x.copies + copies } : x)) : [...q, { batchId: b.id, itemName: b.itemName, batchNo: b.batchNo, expiryDate: b.expiryDate, mrpPaise: b.mrpPaise, qtyUnits: b.qtyUnits, unitsPerPack: b.unitsPerPack, packName: b.packName, copies }])} />
                  {queue.length === 0 ? <p className="mt-3 text-sm text-text-2">Nothing queued. Pick an item and batch above, or open Labels from a purchase receipt to load all received batches.</p> : (
                    <table className="tbl mt-3 dense">
                      <thead><tr><th>Item</th><th>Batch</th><th>Exp</th><th className="num">MRP</th><th className="num">In stock</th><th className="w-28">Copies</th><th className="w-9" /></tr></thead>
                      <tbody>{queue.map((q) => <tr key={q.batchId}><td className="font-medium">{q.itemName}</td><td>{q.batchNo}</td><td>{formatExpiry(q.expiryDate)}</td><td className="num">{rupees(q.mrpPaise)}</td><td className="num">{Math.floor(q.qtyUnits / q.unitsPerPack)} {q.packName}s</td><td><Input dense type="number" min={1} max={999} aria-label={`Copies for ${q.itemName} ${q.batchNo}`} value={q.copies} onChange={(e) => setQueue((l) => l.map((x) => (x.batchId === q.batchId ? { ...x, copies: Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))) } : x)))} /></td><td><Button size="icon" variant="ghost" className="h-9 w-9" aria-label="Remove" onClick={() => setQueue((l) => l.filter((x) => x.batchId !== q.batchId))}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody>
                    </table>
                  )}
                  {queue.length > 0 && <div className="mt-2 flex gap-2 text-xs"><Button size="sm" variant="link" onClick={() => setQueue((l) => l.map((x) => ({ ...x, copies: Math.max(1, Math.floor(x.qtyUnits / x.unitsPerPack)) })))}>Set copies = packs in stock</Button><Button size="sm" variant="link" onClick={() => setQueue((l) => l.map((x) => ({ ...x, copies: 1 })))}>One each</Button><Button size="sm" variant="link" onClick={() => setQueue([])}>Clear</Button></div>}
                </div>
                <div className="card p-4">
                  <h2 className="text-base">2. Template</h2>
                  <div className="mt-2 flex flex-wrap gap-2">{templates.data?.map((t) => <button key={t.id} onClick={() => setTemplateId(t.id)} aria-pressed={template?.id === t.id} className={`rounded-md border px-3 py-2 text-left text-sm ${template?.id === t.id ? 'border-accent bg-accent-bg' : 'border-border hover:bg-surface-2'}`}><div className="font-medium">{t.name}</div><div className="text-xs text-text-2">{t.kind} · {t.widthMm}×{t.heightMm} mm{t.columns > 1 ? ` · ${t.columns}-up` : ''} · {t.symbology}</div></button>)}</div>
                  {template?.kind === 'loose' && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <Field label="Quantity text" hint="e.g. 5 tablets">{(id) => <Input id={id} dense value={loose.qtyText} onChange={(e) => setLoose({ ...loose, qtyText: e.target.value })} />}</Field>
                      <Field label="Patient">{(id) => <Input id={id} dense value={loose.patientName} onChange={(e) => setLoose({ ...loose, patientName: e.target.value })} />}</Field>
                      <Field label="Directions">{(id) => <Input id={id} dense value={loose.directions} onChange={(e) => setLoose({ ...loose, directions: e.target.value })} placeholder="1 tablet twice daily after food" />}</Field>
                      <p className="text-xs text-text-2 sm:col-span-3">Rule 65(19): loose or repacked drugs must carry the drug name, quantity and the seller's name and address.</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3 lg:col-span-2">
                <div className="card p-4">
                  <h2 className="text-base">3. Preview & print</h2>
                  {template && (previewData.length ? <div className="mt-3 flex flex-wrap gap-2 overflow-auto rounded bg-surface-2 p-3">{previewData.map((d) => <LabelCard key={d.batchId} template={template} datum={d} className="shadow" />)}</div> : <div className="mt-3 rounded bg-surface-2 p-3"><LabelCard template={template} datum={SAMPLE_DATUM} className="shadow" /><p className="mt-2 text-xs text-text-2">Sample data shown until you queue a batch.</p></div>)}
                  <Callout tone="accent" className="mt-3 text-xs" title="Printer setup">In the print dialog choose your label printer, paper size {template ? `${template.widthMm * template.columns + template.gapMm * (template.columns - 1)} × ${template.heightMm} mm` : ''}, margins none, scale 100%. Save these once as the printer's default.</Callout>
                  <Button variant="primary" size="lg" className="mt-3 w-full" icon={<Printer className="h-5 w-5" />} disabled={!template || queue.length === 0 || !can('label.print')} loading={build.isPending} onClick={() => build.mutate()}>Print {total} {total === 1 ? 'label' : 'labels'}</Button>
                  <DirectLabelPrintButton className="mt-2 w-full" template={template} items={queue.map((q) => ({ batchId: q.batchId, copies: q.copies }))} loose={{ qtyText: loose.qtyText || null, patientName: loose.patientName || null, directions: loose.directions || null }} disabled={queue.length === 0 || !can('label.print')} />
                  {rendered && <Button variant="ghost" className="mt-2 w-full" onClick={() => window.print()}>Print again</Button>}
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="templates" className="pt-4">
            <div className="mb-3 flex justify-end">{can('settings.write') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ ...templates.data![0]!, id: undefined, name: 'New template', isDefault: false })}>New template</Button>}</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{templates.data?.map((t) => (
              <div key={t.id} className="card p-3">
                <div className="flex items-start justify-between gap-2"><div><p className="font-medium">{t.name} {t.isDefault && <Badge tone="accent" icon={Star}>Default</Badge>}</p><p className="text-xs text-text-2">{t.kind} · {t.widthMm}×{t.heightMm} mm{t.columns > 1 ? ` · ${t.columns}-up` : ''} · {t.symbology} · encodes {t.barcodeContent}</p></div>{can('settings.write') && <div className="flex gap-1"><Button size="sm" onClick={() => setEditing(t)}>Edit</Button><Button size="sm" variant="ghost" aria-label="Delete template" onClick={() => setDelId(t.id)}><Trash2 className="h-4 w-4" /></Button></div>}</div>
                <div className="mt-3 overflow-auto rounded bg-surface-2 p-2"><LabelCard template={t} datum={SAMPLE_DATUM} className="shadow" /></div>
              </div>
            ))}</div>
          </TabsContent>
          <TabsContent value="jobs" className="pt-4">
            {!jobs.data?.length ? <EmptyState title="No print jobs yet" /> : (
              <div className="table-wrap"><table className="tbl dense"><thead><tr><th>When</th><th>Template</th><th className="num">Labels</th><th>By</th><th /></tr></thead><tbody>{jobs.data.map((j) => <tr key={j.id}><td>{formatDateTimeIN(j.createdAt)}</td><td>{j.templateName}</td><td className="num">{j.labelCount}</td><td>{j.userName}</td><td className="text-right"><Button size="sm" onClick={() => void reprint(j)}>Load again</Button></td></tr>)}</tbody></table></div>
            )}
          </TabsContent>
        </Tabs>
      </div>
      {rendered && <div className="print-only"><LabelSheet template={rendered.template} labels={rendered.labels} printRef={printRef} /></div>}
      {editing && <TemplateEditor template={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['label-templates'] }); }} />}
      <ConfirmDialog open={delId !== null} onOpenChange={(o) => !o && setDelId(null)} title="Delete this template?" confirmLabel="Delete" onConfirm={async () => { await api.del(`/labels/templates/${delId}`); setDelId(null); qc.invalidateQueries({ queryKey: ['label-templates'] }); }} />
    </div>
  );
}

function BatchPicker({ onAdd }: { onAdd: (b: BatchOpt, copies: number) => void }) {
  const [q, setQ] = useState('');
  const [itemId, setItemId] = useState<number | null>(null);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [copies, setCopies] = useState(1);
  const items = useQuery({ queryKey: ['items-search', q, 'any', false, 'labels'], queryFn: () => api.get<{ rows: { id: number; name: string; manufacturer: string | null; genericText: string }[] }>('/items', { q, pageSize: 20 }), enabled: q.length > 0 });
  const batches = useQuery({ queryKey: ['item-batches-all', itemId], queryFn: () => api.get<BatchOpt[]>(`/items/${itemId}/batches`, { includeEmpty: true }), enabled: itemId !== null });
  const b = batches.data?.find((x) => x.id === batchId);
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_2fr_auto_auto] sm:items-end">
      <Field label="Item">{(id) => <Combobox<number> id={id} dense value={itemId} onSearch={setQ} loading={items.isFetching} placeholder="Search item" options={(items.data?.rows ?? []).map((r) => ({ value: r.id, label: r.name, description: r.genericText || r.manufacturer || undefined }))} onChange={(v) => { setItemId(v); setBatchId(null); }} />}</Field>
      <Field label="Batch">{(id) => <NativeSelect id={id} dense value={batchId ?? ''} onChange={(e) => setBatchId(Number(e.target.value) || null)} disabled={!itemId}><option value="">Choose batch…</option>{batches.data?.map((x) => <option key={x.id} value={x.id}>{x.batchNo} · Exp {formatExpiry(x.expiryDate)} · MRP {rupees(x.mrpPaise)} · {Math.floor(x.qtyUnits / x.unitsPerPack)} {x.packName}s</option>)}</NativeSelect>}</Field>
      <Field label="Copies">{(id) => <Input id={id} dense type="number" min={1} max={999} value={copies} onChange={(e) => setCopies(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="w-24" />}</Field>
      <Button variant="primary" disabled={!b} onClick={() => { if (b) { onAdd(b, copies); setBatchId(null); } }} icon={<Plus className="h-4 w-4" />}>Add</Button>
    </div>
  );
}

function TemplateEditor({ template, onClose, onSaved }: { template: Template; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState<Template>({ ...template });
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => (t.id ? api.put(`/labels/templates/${t.id}`, t) : api.post('/labels/templates', t)),
    onSuccess: () => { toast.success('Template saved'); onSaved(); },
    onError: (e: Error) => toast.error('Could not save template', e.message),
  });
  const preset = LABEL_PRESETS.find((p) => p.widthMm === t.widthMm && p.heightMm === t.heightMm && p.columns === t.columns)?.id ?? 'custom';
  const toggle = (k: LabelFieldKey) => setT({ ...t, fields: t.fields.includes(k) ? t.fields.filter((f) => f !== k) : [...t.fields, k] });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={t.id ? 'Edit label template' : 'New label template'} width="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save template</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Name" required>{(id) => <Input id={id} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />}</Field>
          <Field label="Kind">{(id) => <NativeSelect id={id} value={t.kind} onChange={(e) => setT({ ...t, kind: e.target.value as Template['kind'] })}><option value="product">Product / batch label</option><option value="loose">Loose dispense label</option><option value="shelf">Shelf label</option></NativeSelect>}</Field>
          <Field label="Label size">{(id) => <NativeSelect id={id} value={preset} onChange={(e) => { const p = LABEL_PRESETS.find((x) => x.id === e.target.value); if (p) setT({ ...t, widthMm: p.widthMm, heightMm: p.heightMm, columns: p.columns, gapMm: p.gapMm }); }}>{LABEL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="custom">Custom</option></NativeSelect>}</Field>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Width mm">{(id) => <Input id={id} dense type="number" step="0.5" value={t.widthMm} onChange={(e) => setT({ ...t, widthMm: Number(e.target.value) })} />}</Field>
            <Field label="Height mm">{(id) => <Input id={id} dense type="number" step="0.5" value={t.heightMm} onChange={(e) => setT({ ...t, heightMm: Number(e.target.value) })} />}</Field>
            <Field label="Across">{(id) => <Input id={id} dense type="number" min={1} max={4} value={t.columns} onChange={(e) => setT({ ...t, columns: Number(e.target.value) })} />}</Field>
            <Field label="Gap mm">{(id) => <Input id={id} dense type="number" step="0.5" value={t.gapMm} onChange={(e) => setT({ ...t, gapMm: Number(e.target.value) })} />}</Field>
            <Field label="Margin mm">{(id) => <Input id={id} dense type="number" step="0.5" value={t.marginMm} onChange={(e) => setT({ ...t, marginMm: Number(e.target.value) })} />}</Field>
            <Field label="Font scale">{(id) => <Input id={id} dense type="number" step="0.1" min={0.7} max={1.6} value={t.fontScale} onChange={(e) => setT({ ...t, fontScale: Number(e.target.value) })} />}</Field>
          </div>
          <Field label="Barcode type">{(id) => <NativeSelect id={id} value={t.symbology} onChange={(e) => setT({ ...t, symbology: e.target.value as Template['symbology'] })}><option value="code128">Code 128 (recommended)</option><option value="ean13">EAN-13 (manufacturer GTIN)</option><option value="datamatrix">GS1 DataMatrix</option><option value="qrcode">QR code</option></NativeSelect>}</Field>
          <Field label="Barcode encodes" hint="Batch codes let one scan pick the exact batch and expiry at billing.">{(id) => <NativeSelect id={id} value={t.barcodeContent} onChange={(e) => setT({ ...t, barcodeContent: e.target.value as Template['barcodeContent'] })}><option value="batch">Batch code (PB…)</option><option value="item">Item code (PI…)</option><option value="gtin">Manufacturer GTIN when known</option></NativeSelect>}</Field>
          <fieldset><legend className="text-sm font-medium">Fields on the label</legend><div className="mt-1 grid grid-cols-2 gap-1">{labelFieldKeys.map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={t.fields.includes(k)} onChange={() => toggle(k)} />{FIELD_LABELS[k]}</label>)}</div></fieldset>
          <div className="flex items-center gap-3"><Switch checked={t.isDefault} onCheckedChange={(v) => setT({ ...t, isDefault: v })} id="tpl-default" /><label htmlFor="tpl-default" className="text-sm">Default for this kind</label></div>
        </div>
        <div><p className="mb-2 text-sm font-medium">Live preview (actual size)</p><div className="overflow-auto rounded bg-surface-2 p-3"><LabelCard template={t} datum={SAMPLE_DATUM} className="shadow" /></div></div>
      </div>
    </Sheet>
  );
}
