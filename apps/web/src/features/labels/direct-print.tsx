import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Usb } from 'lucide-react';
import { useState } from 'react';
import { tsplLabels, tsplTestLabel, zplLabels, zplTestLabel } from '@pharma/shared';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { UsbPrintError, downloadRaw, useUsbPrinter } from '@/lib/webusb';
import { Badge, Button, Callout, Dialog, Field, Input, NativeSelect } from '@/components/ui';
import type { LabelDatum, Template } from './label-card';

type Lang = 'tspl' | 'zpl';
interface Settings { lang: Lang; dpi: 203 | 300; darkness: number; speed: number }
const KEY = 'pms-label-print';
const DEFAULTS: Settings = { lang: 'tspl', dpi: 203, darkness: 8, speed: 4 };
function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }; } catch { return DEFAULTS; }
}
function saveSettings(s: Settings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

export interface DirectLabelPrintButtonProps {
  template: Template | null;
  /** Already-rendered labels (from a previous job). When absent, `items` are posted to /labels/jobs like the normal print button. */
  labels?: LabelDatum[] | null;
  items?: { batchId: number; copies: number }[];
  loose?: { qtyText: string | null; patientName: string | null; directions: string | null };
  disabled?: boolean;
  className?: string;
}

/** "Print via USB" button + dialog: sends TSPL or ZPL straight to a label printer, with a .prn download fallback. */
export function DirectLabelPrintButton({ template, labels, items = [], loose, disabled, className }: DirectLabelPrintButtonProps) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings>(loadSettings);
  const toast = useToast();
  const qc = useQueryClient();
  const usb = useUsbPrinter();
  const update = (patch: Partial<Settings>) => setS((old) => { const next = { ...old, ...patch }; saveSettings(next); return next; });
  const total = labels?.length ? labels.reduce((a, l) => a + l.copies, 0) : items.reduce((a, q) => a + q.copies, 0);

  const generate = (t: Template, data: LabelDatum[]) => (s.lang === 'zpl' ? zplLabels({ template: t, labels: data, dpi: s.dpi }) : tsplLabels({ template: t, labels: data, dpi: s.dpi, darkness: s.darkness, speed: s.speed }));
  const testJob = (t: Template) => (s.lang === 'zpl' ? zplTestLabel(t, s.dpi) : tsplTestLabel(t, s.dpi, s.darkness, s.speed));
  const ext = s.lang === 'zpl' ? 'zpl' : 'prn';

  /** Resolves label data: reuse rendered labels or create a job (recorded like a normal print). */
  const resolve = async (): Promise<{ template: Template; labels: LabelDatum[] }> => {
    if (!template) throw new Error('Choose a template first');
    if (labels?.length) return { template, labels };
    if (items.length === 0) throw new Error('Queue at least one batch');
    const r = await api.post<{ template: Template; labels: LabelDatum[]; jobId: number }>('/labels/jobs', { templateId: template.id, items, loose: template.kind === 'loose' ? loose : undefined });
    qc.invalidateQueries({ queryKey: ['label-jobs'] });
    return { template: r.template, labels: r.labels };
  };

  const fail = (title: string, e: unknown) => {
    if (e instanceof UsbPrintError) toast.error(title, `${e.message} ${e.hint}`);
    else toast.error(title, (e as Error).message);
  };

  const print = useMutation({
    mutationFn: async () => { const r = await resolve(); await usb.send(generate(r.template, r.labels)); return r; },
    onSuccess: (r) => { toast.success(`Sent ${r.labels.reduce((a, l) => a + l.copies, 0)} labels to ${usb.printer?.name ?? 'the printer'}`); setOpen(false); },
    onError: (e) => fail('Could not print labels', e),
  });
  const test = useMutation({
    mutationFn: async () => { if (!template) throw new Error('Choose a template first'); await usb.send(testJob(template)); },
    onSuccess: () => toast.success('Test label sent', 'If nothing printed, change the printer language or check the label size on the printer.'),
    onError: (e) => fail('Could not print the test label', e),
  });
  const download = useMutation({
    mutationFn: async () => { const r = await resolve(); const name = `labels-${r.template.widthMm}x${r.template.heightMm}-${new Date().toISOString().slice(0, 10)}.${ext}`; downloadRaw(name, generate(r.template, r.labels)); return name; },
    onSuccess: (name) => toast.success(`Saved ${name}`, 'Send it to the printer with the printer\'s own tool (e.g. copy to the printer\'s USB/LPT port or use the vendor utility).'),
    onError: (e) => fail('Could not prepare the file', e),
  });
  const connect = async (any = false) => { try { const p = await usb.connect(any); toast.success(`Connected to ${p.name}`); } catch (e) { if (!(e instanceof UsbPrintError && e.code === 'cancelled')) fail('Could not connect the printer', e); } };

  const busy = print.isPending || test.isPending || download.isPending || usb.busy;
  const noUsb = !usb.support.ok;
  return (
    <>
      <Button className={className} icon={<Usb className="h-4 w-4" aria-hidden />} disabled={disabled || !template} onClick={() => setOpen(true)}>Print via USB</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Connect the label printer" size="lg" description="Sends the labels straight to a USB label printer, without the print dialog. Works in Chrome and Edge."
        footer={<>
          <Button variant="ghost" icon={<Download className="h-4 w-4" aria-hidden />} loading={download.isPending} disabled={busy || total === 0} onClick={() => download.mutate()}>Download .{ext}</Button>
          <Button loading={test.isPending} disabled={busy || noUsb || !usb.printer} onClick={() => test.mutate()}>Print test label</Button>
          <Button variant="primary" loading={print.isPending} disabled={busy || noUsb || !usb.printer || total === 0} onClick={() => print.mutate()}>Print {total} {total === 1 ? 'label' : 'labels'}</Button>
        </>}>
        <div className="space-y-4 text-sm">
          {noUsb ? (
            <Callout tone="warning" title="Direct printing is not available here">{!usb.support.ok && usb.support.reason} You can still download the file below.</Callout>
          ) : (
            <div className="card flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="font-medium">Printer</p>
                {usb.printer ? <Badge tone="success">{usb.printer.name}</Badge> : <p className="text-text-2">No printer connected yet.</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={usb.printer ? 'secondary' : 'primary'} disabled={busy} onClick={() => void connect(false)}>{usb.printer ? 'Change printer' : 'Connect printer'}</Button>
                <Button size="sm" variant="link" disabled={busy} onClick={() => void connect(true)}>Show all USB devices</Button>
                {usb.printer && <Button size="sm" variant="ghost" disabled={busy} onClick={usb.forget}>Forget</Button>}
              </div>
            </div>
          )}
          {usb.error && usb.error.code !== 'cancelled' && <Callout tone="danger" title={usb.error.message}>{usb.error.hint}</Callout>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Printer language" hint="TVS, TSC and most counter printers use TSPL. Zebra printers use ZPL.">{(id) => <NativeSelect id={id} value={s.lang} onChange={(e) => update({ lang: e.target.value as Lang })}><option value="tspl">TSPL (TVS LP46, TSC)</option><option value="zpl">ZPL (Zebra)</option></NativeSelect>}</Field>
            <Field label="Print head resolution" hint="Printed on the printer's label or self-test page.">{(id) => <NativeSelect id={id} value={s.dpi} onChange={(e) => update({ dpi: Number(e.target.value) as 203 | 300 })}><option value={203}>203 dpi (most printers)</option><option value={300}>300 dpi</option></NativeSelect>}</Field>
            {s.lang === 'tspl' && <>
              <Field label="Darkness" hint="0 to 15. Raise it if the print is faint.">{(id) => <Input id={id} type="number" min={0} max={15} value={s.darkness} onChange={(e) => update({ darkness: Math.max(0, Math.min(15, Math.floor(Number(e.target.value) || 0))) })} />}</Field>
              <Field label="Speed" hint="Inches per second, usually 2 to 6. Slower prints darker.">{(id) => <Input id={id} type="number" min={1} max={14} value={s.speed} onChange={(e) => update({ speed: Math.max(1, Math.min(14, Math.floor(Number(e.target.value) || 1))) })} />}</Field>
            </>}
          </div>
          {template && <p className="text-xs text-text-2">Label {template.widthMm} × {template.heightMm} mm{template.columns > 1 ? `, ${template.columns} across` : ''}, gap {template.gapMm} mm. Load the same roll in the printer and run the printer's gap calibration once.</p>}
          <Callout tone="accent" title="If nothing prints">Check the printer language setting on the printer's self-test page (hold the feed button while switching the printer on). The label size and gap must match the roll loaded. On Windows the printer may need the WinUSB driver; on macOS close other apps using the printer.</Callout>
        </div>
      </Dialog>
    </>
  );
}
