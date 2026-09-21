/**
 * WebUSB transport for raw printer languages (TSPL / ZPL / ESC-POS).
 * Chrome and Edge on a secure page only; everything else should fall back to `downloadRaw`.
 */
import { useCallback, useEffect, useState } from 'react';

// lib.dom has no WebUSB typings; this is the subset we use.
interface USBEndpoint { endpointNumber: number; direction: 'in' | 'out'; type: 'bulk' | 'interrupt' | 'isochronous' }
interface USBAlternateInterface { alternateSetting: number; interfaceClass: number; endpoints: USBEndpoint[] }
interface USBInterface { interfaceNumber: number; alternate: USBAlternateInterface; alternates: USBAlternateInterface[]; claimed: boolean }
interface USBConfiguration { configurationValue: number; interfaces: USBInterface[] }
export interface USBDevice {
  vendorId: number; productId: number; productName?: string | null; manufacturerName?: string | null; serialNumber?: string | null; opened: boolean;
  configuration: USBConfiguration | null; configurations: USBConfiguration[];
  open(): Promise<void>; close(): Promise<void>; selectConfiguration(v: number): Promise<void>; claimInterface(n: number): Promise<void>; releaseInterface(n: number): Promise<void>;
  selectAlternateInterface(n: number, alt: number): Promise<void>; transferOut(endpoint: number, data: Uint8Array): Promise<{ status: 'ok' | 'stall' | 'babble'; bytesWritten: number }>;
}
interface USBDeviceFilter { vendorId?: number; productId?: number; classCode?: number }
interface USB {
  getDevices(): Promise<USBDevice[]>; requestDevice(o: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
  addEventListener(type: 'connect' | 'disconnect', l: (e: { device: USBDevice }) => void): void; removeEventListener(type: 'connect' | 'disconnect', l: (e: { device: USBDevice }) => void): void;
}
const usb = (): USB | undefined => (navigator as Navigator & { usb?: USB }).usb;

/** Vendor ids of printers common on Indian pharmacy counters, plus the USB printer class (7) which catches most others. */
export const PRINTER_FILTERS: USBDeviceFilter[] = [
  { classCode: 7 },
  { vendorId: 0x1203 }, // TSC
  { vendorId: 0x0fe6 }, // TVS Electronics LP46 family (ICS Advent controller)
  { vendorId: 0x0a5f }, // Zebra
  { vendorId: 0x04b8 }, // Epson
  { vendorId: 0x1504 }, // Bixolon
  { vendorId: 0x0483 }, { vendorId: 0x0416 }, { vendorId: 0x1fc9 }, { vendorId: 0x28e9 }, // Xprinter and other generic POS printers (STM32 / Nuvoton / NXP / GigaDevice controllers)
  { vendorId: 0x0519 }, // Star
  { vendorId: 0x1d90 }, // Citizen
  { vendorId: 0x195f }, // Godex
];

export type UsbErrorCode = 'unsupported' | 'insecure' | 'cancelled' | 'no-device' | 'no-endpoint' | 'access' | 'transfer' | 'disconnected';
export class UsbPrintError extends Error {
  constructor(public code: UsbErrorCode, message: string, public hint: string) { super(message); this.name = 'UsbPrintError'; }
}

const platform = (): 'windows' | 'mac' | 'linux' | 'other' => {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac';
  if (/Linux|CrOS/i.test(ua)) return 'linux';
  return 'other';
};

/** What to try when the browser cannot claim the printer, by operating system. */
export function accessHint(): string {
  switch (platform()) {
    case 'windows': return 'Windows is holding the printer with its own driver. Install the WinUSB driver for this printer using Zadig (zadig.akeo.ie), unplug and re-plug it, then connect again. Note: the printer will stop working through the normal Windows print dialog until you switch the driver back.';
    case 'mac': return 'Another program or the system print queue is using the printer. Close other printer apps, remove the printer from System Settings > Printers & Scanners if it is listed, unplug and re-plug it, then try again.';
    case 'linux': return 'The browser is not allowed to open this device. Add a udev rule for the printer\'s vendor id (or run Chrome as a user with access to /dev/bus/usb), re-plug the printer and try again.';
    default: return 'The browser could not take control of the printer. Re-plug it, close other apps that use it, and try again.';
  }
}

export function usbSupport(): { ok: true } | { ok: false; code: 'unsupported' | 'insecure'; reason: string } {
  if (typeof navigator === 'undefined' || !('usb' in navigator)) return { ok: false, code: 'unsupported', reason: 'This browser cannot talk to USB printers directly. Use Chrome or Edge on a desktop, or download the file and send it with the printer\'s own tool.' };
  if (!window.isSecureContext) return { ok: false, code: 'insecure', reason: 'Direct USB printing only works on a secure page (https:// or localhost).' };
  return { ok: true };
}

const REMEMBER_KEY = 'pms-usb-printer';
const deviceKey = (d: USBDevice) => `${d.vendorId}:${d.productId}:${d.serialNumber ?? ''}`;
export function deviceLabel(d: USBDevice): string {
  const name = [d.manufacturerName, d.productName].filter(Boolean).join(' ').trim();
  return name || `USB device ${d.vendorId.toString(16).padStart(4, '0')}:${d.productId.toString(16).padStart(4, '0')}`;
}

function wrapError(e: unknown, fallback: UsbErrorCode = 'access'): UsbPrintError {
  if (e instanceof UsbPrintError) return e;
  const err = e as { name?: string; message?: string };
  if (err?.name === 'NotFoundError') return new UsbPrintError('cancelled', 'No printer was chosen.', 'Pick the printer from the list the browser shows. If it is not listed, try "Show all USB devices".');
  if (err?.name === 'SecurityError' || err?.name === 'NetworkError' || err?.name === 'InvalidStateError' || fallback === 'access') return new UsbPrintError('access', err?.message || 'Could not open the printer.', accessHint());
  return new UsbPrintError(fallback, err?.message || 'USB error', 'Check the printer is switched on and connected, then try again.');
}

/** Asks the user to pick a printer (browser chooser) and remembers it for next time. */
export async function requestPrinter(anyDevice = false): Promise<UsbPrinter> {
  const s = usbSupport();
  if (!s.ok) throw new UsbPrintError(s.code, s.reason, s.reason);
  let device: USBDevice;
  try { device = await usb()!.requestDevice({ filters: anyDevice ? [] : PRINTER_FILTERS }); }
  catch (e) { throw wrapError(e, 'cancelled'); }
  try { localStorage.setItem(REMEMBER_KEY, deviceKey(device)); } catch { /* ignore */ }
  return new UsbPrinter(device);
}

/** Returns the printer chosen earlier (permission persists across reloads), or null. */
export async function rememberedPrinter(): Promise<UsbPrinter | null> {
  if (!usbSupport().ok) return null;
  let devices: USBDevice[] = [];
  try { devices = await usb()!.getDevices(); } catch { return null; }
  if (devices.length === 0) return null;
  let key: string | null = null;
  try { key = localStorage.getItem(REMEMBER_KEY); } catch { /* ignore */ }
  const d = devices.find((x) => deviceKey(x) === key) ?? (devices.length === 1 ? devices[0] : undefined);
  return d ? new UsbPrinter(d) : null;
}

export function forgetPrinter() {
  try { localStorage.removeItem(REMEMBER_KEY); } catch { /* ignore */ }
}

const CHUNK = 16 * 1024;

/** One claimed USB printer: finds the bulk OUT endpoint and streams bytes to it in 16 KB chunks. */
export class UsbPrinter {
  private endpoint: number | null = null;
  private iface: number | null = null;
  constructor(public readonly device: USBDevice) {}
  get name() { return deviceLabel(this.device); }
  get isOpen() { return this.device.opened && this.endpoint !== null; }

  async open(): Promise<void> {
    if (this.isOpen) return;
    const d = this.device;
    try { if (!d.opened) await d.open(); } catch (e) { throw wrapError(e, 'access'); }
    const configs = d.configurations.length ? d.configurations : d.configuration ? [d.configuration] : [];
    if (configs.length === 0) throw new UsbPrintError('no-endpoint', 'The device reports no USB configuration.', 'This does not look like a raw USB printer. Re-plug it or choose a different device.');
    let lastErr: unknown = null;
    let sawEndpoint = false;
    for (const cfg of configs) {
      try { if (!d.configuration || d.configuration.configurationValue !== cfg.configurationValue) await d.selectConfiguration(cfg.configurationValue); } catch (e) { lastErr = e; continue; }
      for (const intf of cfg.interfaces) {
        for (const alt of intf.alternates) {
          const ep = alt.endpoints.find((x) => x.direction === 'out' && x.type === 'bulk');
          if (!ep) continue;
          sawEndpoint = true;
          try {
            await d.claimInterface(intf.interfaceNumber);
            if (alt.alternateSetting !== intf.alternate.alternateSetting) await d.selectAlternateInterface(intf.interfaceNumber, alt.alternateSetting);
            this.iface = intf.interfaceNumber; this.endpoint = ep.endpointNumber;
            return;
          } catch (e) { lastErr = e; }
        }
      }
    }
    await this.close().catch(() => undefined);
    if (!sawEndpoint) throw new UsbPrintError('no-endpoint', 'No bulk output endpoint found on this device.', 'This does not look like a raw USB printer. Choose the printer itself, not a hub or adapter.');
    throw wrapError(lastErr, 'access');
  }

  async send(data: Uint8Array | string): Promise<number> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    await this.open();
    let written = 0;
    try {
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
        const r = await this.device.transferOut(this.endpoint!, chunk);
        if (r.status !== 'ok') throw new UsbPrintError('transfer', `Printer replied "${r.status}" after ${written} bytes.`, 'The printer stopped accepting data. Check paper and that the cover is closed, then try again.');
        written += r.bytesWritten;
      }
    } catch (e) {
      if (e instanceof UsbPrintError) throw e;
      const err = e as { name?: string; message?: string };
      if (err?.name === 'NotFoundError' || /disconnected/i.test(err?.message ?? '')) { this.endpoint = null; throw new UsbPrintError('disconnected', 'The printer was disconnected.', 'Re-plug the printer and connect again.'); }
      throw new UsbPrintError('transfer', err?.message || 'Transfer failed.', 'Check the printer is switched on and not out of paper, then try again.');
    }
    return written;
  }

  async close(): Promise<void> {
    const d = this.device;
    try { if (this.iface !== null && d.opened) await d.releaseInterface(this.iface); } catch { /* ignore */ }
    try { if (d.opened) await d.close(); } catch { /* ignore */ }
    this.iface = null; this.endpoint = null;
  }
}

/** Saves raw printer bytes as a file (fallback for browsers without WebUSB). */
export function downloadRaw(filename: string, data: Uint8Array | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** React glue: remembered printer on mount, connect/forget, busy state and a typed error. */
export function useUsbPrinter() {
  const support = usbSupport();
  const [printer, setPrinter] = useState<UsbPrinter | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UsbPrintError | null>(null);
  useEffect(() => {
    let alive = true;
    rememberedPrinter().then((p) => { if (alive && p) setPrinter(p); }).catch(() => undefined);
    const u = usb();
    const onDisconnect = (e: { device: USBDevice }) => setPrinter((p) => (p && p.device === e.device ? null : p));
    u?.addEventListener('disconnect', onDisconnect);
    return () => { alive = false; u?.removeEventListener('disconnect', onDisconnect); };
  }, []);
  const connect = useCallback(async (anyDevice = false) => {
    setError(null);
    try { const p = await requestPrinter(anyDevice); setPrinter((old) => { void old?.close(); return p; }); return p; }
    catch (e) { const err = e instanceof UsbPrintError ? e : wrapError(e); setError(err); throw err; }
  }, []);
  const send = useCallback(async (data: Uint8Array | string) => {
    if (!printer) throw new UsbPrintError('no-device', 'No printer connected.', 'Click "Connect printer" and pick it from the list.');
    setBusy(true); setError(null);
    try { return await printer.send(data); }
    catch (e) { const err = e instanceof UsbPrintError ? e : wrapError(e); setError(err); if (err.code === 'disconnected') setPrinter(null); throw err; }
    finally { setBusy(false); }
  }, [printer]);
  const forget = useCallback(() => { void printer?.close(); forgetPrinter(); setPrinter(null); }, [printer]);
  return { support, printer, busy, error, connect, send, forget };
}
