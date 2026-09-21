import { useMutation } from '@tanstack/react-query';
import { Download, Usb } from 'lucide-react';
import { useState } from 'react';
import { escposOpenDrawer, escposReceipt, escposTestPage } from '@pharma/shared';
import { useToast } from '@/lib/toast';
import { UsbPrintError, downloadRaw, useUsbPrinter } from '@/lib/webusb';
import { Badge, Button, Callout, Dialog, Field, Input, NativeSelect, Switch } from '@/components/ui';
import type { PrintSale, PrintStore } from './invoice-print';

interface Settings { openDrawer: boolean; cut: boolean; copies: number }
const KEY = 'pms-receipt-print';
const DEFAULTS: Settings = { openDrawer: false, cut: true, copies: 1 };
function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }; } catch { return DEFAULTS; }
}
function saveSettings(s: Settings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

/** "Print via USB" button + dialog: sends ESC/POS straight to a receipt printer (with cash drawer), with a .prn download fallback. */
export function DirectReceiptPrintButton({ sale, store, className }: { sale: PrintSale; store: PrintStore; className?: string }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings>(loadSettings);
  const [width, setWidth] = useState<58 | 80>(store.printFormat === 'thermal58' ? 58 : 80);
  const toast = useToast();
  const usb = useUsbPrinter();
  const update = (patch: Partial<Settings>) => setS((old) => { const next = { ...old, ...patch }; saveSettings(next); return next; });
  const bytes = () => escposReceipt({ sale, store, width, openDrawer: s.openDrawer, cut: s.cut, copies: s.copies });
  const fail = (title: string, e: unknown) => {
    if (e instanceof UsbPrintError) toast.error(title, `${e.message} ${e.hint}`);
    else toast.error(title, (e as Error).message);
  };

  const print = useMutation({
    mutationFn: () => usb.send(bytes()),
    onSuccess: () => { toast.success(`Receipt sent to ${usb.printer?.name ?? 'the printer'}`, s.openDrawer ? 'Cash drawer opened.' : undefined); setOpen(false); },
    onError: (e) => fail('Could not print the receipt', e),
  });
  const drawer = useMutation({ mutationFn: () => usb.send(escposOpenDrawer()), onSuccess: () => toast.success('Drawer pulse sent'), onError: (e) => fail('Could not open the drawer', e) });
  const test = useMutation({ mutationFn: () => usb.send(escposTestPage(width, s.cut)), onSuccess: () => toast.success('Test page sent'), onError: (e) => fail('Could not print the test page', e) });
  const connect = async (any = false) => { try { const p = await usb.connect(any); toast.success(`Connected to ${p.name}`); } catch (e) { if (!(e instanceof UsbPrintError && e.code === 'cancelled')) fail('Could not connect the printer', e); } };
  const download = () => { const name = `${(sale.invoiceNo ?? `bill-${sale.id}`).replace(/[^\w.-]+/g, '-')}.prn`; downloadRaw(name, bytes()); toast.success(`Saved ${name}`, 'Send it to the printer with the printer\'s own tool.'); };

  const busy = print.isPending || drawer.isPending || test.isPending || usb.busy;
  const noUsb = !usb.support.ok;
  return (
    <>
      <Button className={className} icon={<Usb className="h-4 w-4" aria-hidden />} onClick={() => setOpen(true)}>Print via USB</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Connect the receipt printer" size="lg" description="Prints the bill on a thermal receipt printer without the print dialog, and can open the cash drawer. Works in Chrome and Edge."
        footer={<>
          <Button variant="ghost" icon={<Download className="h-4 w-4" aria-hidden />} disabled={busy} onClick={download}>Download .prn</Button>
          <Button loading={test.isPending} disabled={busy || noUsb || !usb.printer} onClick={() => test.mutate()}>Print test page</Button>
          <Button variant="primary" loading={print.isPending} disabled={busy || noUsb || !usb.printer} onClick={() => print.mutate()}>Print {s.copies > 1 ? `${s.copies} copies` : 'receipt'}</Button>
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
            <Field label="Paper width" hint="Taken from the store's print format; change here for this printer only.">{(id) => <NativeSelect id={id} value={width} onChange={(e) => setWidth(Number(e.target.value) as 58 | 80)}><option value={80}>80 mm (42 columns)</option><option value={58}>58 mm (32 columns)</option></NativeSelect>}</Field>
            <Field label="Copies">{(id) => <Input id={id} type="number" min={1} max={5} value={s.copies} onChange={(e) => update({ copies: Math.max(1, Math.min(5, Math.floor(Number(e.target.value) || 1))) })} />}</Field>
            <div className="flex items-center gap-3"><Switch id="rp-drawer" checked={s.openDrawer} onCheckedChange={(v) => update({ openDrawer: v })} /><label htmlFor="rp-drawer">Open the cash drawer when printing</label></div>
            <div className="flex items-center gap-3"><Switch id="rp-cut" checked={s.cut} onCheckedChange={(v) => update({ cut: v })} /><label htmlFor="rp-cut">Cut the paper after each copy</label></div>
          </div>
          {!noUsb && usb.printer && <Button size="sm" variant="outline" loading={drawer.isPending} disabled={busy} onClick={() => drawer.mutate()}>Open drawer only</Button>}
          <Callout tone="accent" title="If nothing prints">Make sure the printer is set to ESC/POS mode (most receipt printers are) and that the drawer cable is in the printer's DK port. On Windows the printer may need the WinUSB driver; on macOS close other apps using the printer.</Callout>
        </div>
      </Dialog>
    </>
  );
}
