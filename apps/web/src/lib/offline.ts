/**
 * Offline billing support.
 *  - A snapshot of items, batches, customers, doctors, interaction rules and the store is kept in IndexedDB.
 *  - Billing reads through `data.*` which prefers the server and falls back to the snapshot when the network is down.
 *  - Bills posted while offline go to an outbox with a device-specific invoice series (INV-<counter>/<FY>/<seq>) and are
 *    replayed through POST /sales when the connection returns.
 */
import Dexie, { type EntityTable } from 'dexie';
import { useSyncExternalStore } from 'react';
import { financialYear, sortFefo, todayIST, type InteractionRuleLike, type Schedule } from '@pharma/shared';
import { api, ApiError } from './api';

export interface SnapItem { id: number; name: string; nameNorm: string; form: string; manufacturer: string | null; genericText: string; genericNorm: string; hsn: string; gstRatePct: number; schedule: Schedule; baseUnit: string; unitsPerPack: number; packName: string; packsPerBox: number | null; allowLoose: boolean; rack: string | null; ean: string | null; notForSale: boolean; coldChain: boolean; active: boolean; minStockUnits: number; maxStockUnits: number; salts: string[] }
export interface SnapBatch { id: number; itemId: number; batchNo: string; expiryDate: string; mrpPaise: number; purchaseRatePaise: number; qtyUnits: number; status: string; gtin: string | null; supplierName: string | null }
export interface SnapCustomer { id: number; name: string; phone: string; address: string | null; gstin: string | null; creditLimitPaise: number; balancePaise: number }
export interface SnapDoctor { id: number; name: string; regNo: string | null; address: string | null }
export interface Snapshot { generatedAt: string; today: string; store: Record<string, unknown> & { name: string; gstScheme: 'regular' | 'composition' }; duty: { userId: number; name: string; regNo: string | null }[]; items: SnapItem[]; batches: SnapBatch[]; customers: SnapCustomer[]; doctors: SnapDoctor[]; rules: InteractionRuleLike[] }

export interface OutboxSale { clientRef: string; invoiceNo: string; counter: string; postedAt: string; payload: Record<string, unknown>; printable: unknown; totalPaise: number; customerPhone: string | null; status: 'pending' | 'failed'; error: string | null; attempts: number; createdAt: number; syncedInvoiceNo?: string; serverId?: number }
interface Meta { key: string; value: unknown }

class OfflineDb extends Dexie {
  items!: EntityTable<SnapItem, 'id'>;
  batches!: EntityTable<SnapBatch, 'id'>;
  customers!: EntityTable<SnapCustomer, 'id'>;
  doctors!: EntityTable<SnapDoctor, 'id'>;
  outbox!: EntityTable<OutboxSale, 'clientRef'>;
  synced!: EntityTable<OutboxSale, 'clientRef'>;
  meta!: EntityTable<Meta, 'key'>;
  constructor() {
    super('pharmacy-offline');
    this.version(1).stores({ items: 'id, nameNorm, ean', batches: 'id, itemId, expiryDate, gtin', customers: 'id, phone', doctors: 'id', outbox: 'clientRef, createdAt, status', synced: 'clientRef, createdAt', meta: 'key' });
  }
}
export const odb = new OfflineDb();

// ---------- status store ----------
export interface SyncStatus { online: boolean; mode: 'online' | 'offline'; pending: number; failed: number; syncing: boolean; lastSnapshotAt: string | null; lastSyncAt: string | null; lastError: string | null; counter: string }
const COUNTER_KEY = 'pms-counter-code';
export function getCounterCode(): string { try { return localStorage.getItem(COUNTER_KEY) || 'C1'; } catch { return 'C1'; } }
export function setCounterCode(c: string) { try { localStorage.setItem(COUNTER_KEY, c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'C1'); } catch { /* ignore */ } emit(); }

let status: SyncStatus = { online: typeof navigator !== 'undefined' ? navigator.onLine : true, mode: 'online', pending: 0, failed: 0, syncing: false, lastSnapshotAt: null, lastSyncAt: null, lastError: null, counter: getCounterCode() };
const listeners = new Set<() => void>();
function emit() { status = { ...status, counter: getCounterCode() }; listeners.forEach((l) => l()); }
export function useSyncStatus(): SyncStatus { return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status, () => status); }
export function getSyncStatus() { return status; }

/** A request failed because the network is down (not because the server said no). */
export function isNetworkError(e: unknown): boolean { return !(e instanceof ApiError) && e instanceof Error && (e.name === 'TypeError' || /fetch|network|Failed to fetch|load failed/i.test(e.message)); }

function setMode(mode: 'online' | 'offline') { if (status.mode !== mode) { status = { ...status, mode }; emit(); } }
async function refreshCounts() { const pending = await odb.outbox.where('status').equals('pending').count(); const failed = await odb.outbox.where('status').equals('failed').count(); status = { ...status, pending, failed }; emit(); }

// ---------- snapshot ----------
export async function refreshSnapshot(force = false): Promise<boolean> {
  const last = (await odb.meta.get('snapshotAt'))?.value as string | undefined;
  if (!force && last && Date.now() - new Date(last).getTime() < 10 * 60_000) return false;
  const snap = await api.get<Snapshot>('/sync/snapshot');
  await odb.transaction('rw', [odb.items, odb.batches, odb.customers, odb.doctors, odb.meta], async () => {
    await odb.items.clear(); await odb.batches.clear(); await odb.customers.clear(); await odb.doctors.clear();
    await odb.items.bulkPut(snap.items); await odb.batches.bulkPut(snap.batches); await odb.customers.bulkPut(snap.customers); await odb.doctors.bulkPut(snap.doctors);
    await odb.meta.bulkPut([{ key: 'snapshotAt', value: snap.generatedAt }, { key: 'store', value: snap.store }, { key: 'duty', value: snap.duty }, { key: 'rules', value: snap.rules }]);
  });
  status = { ...status, lastSnapshotAt: snap.generatedAt }; emit();
  try { await alignSeriesWithServer(); } catch { /* offline again; fine */ }
  return true;
}
export async function getRules(): Promise<InteractionRuleLike[]> { return ((await odb.meta.get('rules'))?.value as InteractionRuleLike[] | undefined) ?? []; }
export async function getSnapStore() { return (await odb.meta.get('store'))?.value as Snapshot['store'] | undefined; }
export async function getSnapDuty() { return ((await odb.meta.get('duty'))?.value as Snapshot['duty'] | undefined) ?? []; }
export async function snapshotAge(): Promise<string | null> { return ((await odb.meta.get('snapshotAt'))?.value as string | undefined) ?? null; }

// ---------- local reads (mirror the server shapes used by billing) ----------
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+.%\s]/g, ' ').replace(/\s+/g, ' ').trim();

export interface LocalBatchRow { id: number; itemId: number; batchNo: string; expiryDate: string; mrpPaise: number; purchaseRatePaise: number; qtyUnits: number; status: string; itemName: string; genericText: string; unitsPerPack: number; packName: string; baseUnit: string; allowLoose: boolean; rack: string | null; schedule: Schedule; gstRatePct: number; hsn: string; notForSale: boolean; manufacturer: string | null; supplierName: string | null }
function toBatchRow(b: SnapBatch, i: SnapItem): LocalBatchRow {
  return { id: b.id, itemId: b.itemId, batchNo: b.batchNo, expiryDate: b.expiryDate, mrpPaise: b.mrpPaise, purchaseRatePaise: b.purchaseRatePaise, qtyUnits: b.qtyUnits, status: b.status, itemName: i.name, genericText: i.genericText, unitsPerPack: i.unitsPerPack, packName: i.packName, baseUnit: i.baseUnit, allowLoose: i.allowLoose, rack: i.rack, schedule: i.schedule, gstRatePct: i.gstRatePct, hsn: i.hsn, notForSale: i.notForSale, manufacturer: i.manufacturer, supplierName: b.supplierName };
}

export async function localSearchItems(q: string, mode: string, inStockOnly: boolean, pageSize = 25) {
  const term = norm(q);
  const today = todayIST();
  const all = await odb.items.toArray();
  const batches = await odb.batches.toArray();
  const byItem = new Map<number, SnapBatch[]>();
  for (const b of batches) { if (b.expiryDate >= today && b.qtyUnits > 0) { const l = byItem.get(b.itemId) ?? []; l.push(b); byItem.set(b.itemId, l); } }
  const digits = term.replace(/\D/g, '');
  const scored = all.map((i) => {
    let rank = 3;
    if (!term) rank = 2;
    else {
      const nameHit = i.nameNorm.startsWith(term) ? 0 : i.nameNorm.includes(` ${term}`) ? 1 : -1;
      const saltHit = i.salts.some((s) => norm(s).startsWith(term) || norm(s).includes(` ${term}`));
      const rackHit = (i.rack ?? '').toLowerCase() === term;
      const codeHit = digits.length >= 6 && (i.ean === digits || i.id === Number(digits));
      if (mode === 'name') rank = nameHit >= 0 ? nameHit : -1;
      else if (mode === 'salt') rank = saltHit ? 2 : -1;
      else if (mode === 'rack') rank = rackHit ? 0 : -1;
      else rank = nameHit >= 0 ? nameHit : saltHit || rackHit || codeHit ? 2 : -1;
    }
    return { i, rank };
  }).filter((x) => x.rank >= 0);
  const rows = scored.map(({ i, rank }) => {
    const bs = sortFefo((byItem.get(i.id) ?? []).map((b) => ({ ...b })), today);
    const stockUnits = bs.reduce((a, b) => a + b.qtyUnits, 0);
    return { rank, id: i.id, name: i.name, form: i.form, manufacturer: i.manufacturer, genericText: i.genericText, hsn: i.hsn, gstRatePct: i.gstRatePct, schedule: i.schedule, baseUnit: i.baseUnit, unitsPerPack: i.unitsPerPack, packName: i.packName, packsPerBox: i.packsPerBox, allowLoose: i.allowLoose, rack: i.rack, ean: i.ean, notForSale: i.notForSale, coldChain: i.coldChain, active: i.active, minStockUnits: i.minStockUnits, maxStockUnits: i.maxStockUnits, stockUnits, nearestExpiry: bs[0]?.expiryDate ?? null, mrpPaise: bs[0]?.mrpPaise ?? null, batchCount: bs.length };
  }).filter((r) => !inStockOnly || r.stockUnits > 0).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return { rows: rows.slice(0, pageSize).map(({ rank: _r, ...r }) => r), total: rows.length };
}

export async function localItemBatches(itemId: number): Promise<LocalBatchRow[]> {
  const i = await odb.items.get(itemId); if (!i) return [];
  const today = todayIST();
  const bs = await odb.batches.where('itemId').equals(itemId).toArray();
  return sortFefo(bs.filter((b) => b.qtyUnits > 0), today).map((b) => toBatchRow(b, i));
}
export async function localSubstitutes(itemId: number) {
  const i = await odb.items.get(itemId); if (!i || !i.genericNorm) return [];
  const all = await odb.items.filter((x) => x.genericNorm === i.genericNorm && x.id !== itemId).toArray();
  const out = [];
  for (const x of all) { const bs = await localItemBatches(x.id); if (bs.length) out.push({ id: x.id, name: x.name, manufacturer: x.manufacturer, genericText: x.genericText, mrpPaise: bs[0]!.mrpPaise, stockUnits: bs.reduce((a, b) => a + b.qtyUnits, 0), schedule: x.schedule, unitsPerPack: x.unitsPerPack, packName: x.packName, baseUnit: x.baseUnit, allowLoose: x.allowLoose, rack: x.rack, notForSale: x.notForSale, form: x.form, hsn: x.hsn, gstRatePct: x.gstRatePct, ean: x.ean, coldChain: x.coldChain, active: x.active, minStockUnits: x.minStockUnits, maxStockUnits: x.maxStockUnits, nearestExpiry: bs[0]!.expiryDate, batchCount: bs.length }); }
  return out;
}
export async function localResolveScan(raw: string) {
  const { classifyScan } = await import('@pharma/shared');
  const scan = classifyScan(raw);
  const empty = { scan, item: null as SnapItem | null, batch: null as LocalBatchRow | null, batches: [] as LocalBatchRow[], suggestedBatchNo: null as string | null, suggestedExpiry: null as string | null, gtin: null as string | null, message: '' };
  if (scan.kind === 'internal_batch') { const b = await odb.batches.get(scan.batchId); const i = b && (await odb.items.get(b.itemId)); if (!b || !i) return { ...empty, message: 'Label code not found in the offline copy' }; return { ...empty, item: i, batch: toBatchRow(b, i), batches: await localItemBatches(i.id), message: `${i.name} batch ${b.batchNo}` }; }
  if (scan.kind === 'internal_item') { const i = await odb.items.get(scan.itemId); if (!i) return { ...empty, message: 'Item code not found' }; return { ...empty, item: i, batches: await localItemBatches(i.id), message: i.name }; }
  if (scan.kind === 'gtin' || scan.kind === 'gs1') {
    const gtin = scan.gtin ?? null; let item: SnapItem | undefined;
    if (gtin) { const b = await odb.batches.where('gtin').anyOf([gtin, gtin.replace(/^0+/, '')]).first(); item = b ? await odb.items.get(b.itemId) : await odb.items.filter((x) => !!x.ean && [gtin, gtin.replace(/^0+/, ''), gtin.padStart(14, '0')].includes(x.ean)).first(); }
    if (!item) return { ...empty, gtin, message: 'Barcode not linked to an item yet' };
    const batches = await localItemBatches(item.id);
    const batch = scan.kind === 'gs1' && scan.batch ? batches.find((b) => b.batchNo.toLowerCase() === scan.batch!.toLowerCase()) ?? null : null;
    return { ...empty, item, batch, batches, gtin, message: item.name };
  }
  return { ...empty, message: 'Code not recognised offline. Search by name.' };
}
export async function localCustomerByPhone(phone: string) { return (await odb.customers.where('phone').equals(phone).first()) ?? null; }
export async function localDoctors(q: string) { const t = q.toLowerCase(); return (await odb.doctors.toArray()).filter((d) => !t || d.name.toLowerCase().includes(t) || (d.regNo ?? '').toLowerCase().includes(t)).slice(0, 20); }

// ---------- data facade: server first, snapshot when the network is down ----------
async function viaServer<T>(online: () => Promise<T>, local: () => Promise<T>): Promise<T> {
  if (!navigator.onLine) { setMode('offline'); return local(); }
  try { const r = await online(); setMode('online'); return r; } catch (e) { if (isNetworkError(e)) { setMode('offline'); return local(); } throw e; }
}
export const data = {
  searchItems: (p: { q: string; mode: string; inStockOnly: boolean; pageSize?: number }) => viaServer(() => api.get<{ rows: Awaited<ReturnType<typeof localSearchItems>>['rows']; total: number }>('/items', { q: p.q, mode: p.mode, inStockOnly: p.inStockOnly || undefined, pageSize: p.pageSize ?? 25 }), () => localSearchItems(p.q, p.mode, p.inStockOnly, p.pageSize)),
  itemBatches: (itemId: number) => viaServer(() => api.get<LocalBatchRow[]>(`/items/${itemId}/batches`), () => localItemBatches(itemId)),
  substitutes: (itemId: number) => viaServer(() => api.get<Awaited<ReturnType<typeof localSubstitutes>>>(`/items/${itemId}/substitutes`), () => localSubstitutes(itemId)),
  resolveScan: (raw: string) => viaServer(() => api.post<Awaited<ReturnType<typeof localResolveScan>>>('/scan', { raw }), () => localResolveScan(raw)),
  customerByPhone: (phone: string) => viaServer(() => api.get<SnapCustomer | null>(`/customers/by-phone/${phone}`), () => localCustomerByPhone(phone)),
  doctors: (q: string) => viaServer(() => api.get<SnapDoctor[]>('/doctors', { q }), () => localDoctors(q)),
};

// ---------- offline posting ----------
export interface LocalPostResult { offline: true; id: number; invoiceNo: string; totalPaise: number; creditPaise: number; changePaise: number; customerPhone: string | null; duplicate: false; warnings: { message: string }[]; clientRef: string }
/** Align this device's series with what the server already holds (covers a cleared browser or a new device reusing a counter code). */
export async function alignSeriesWithServer(counter = getCounterCode(), dateIso = todayIST()): Promise<void> {
  const fy = financialYear(dateIso);
  const key = `seq:${counter}:${fy}`;
  const r = await api.get<{ lastSeq: number }>('/sync/series', { counter, fy });
  const local = ((await odb.meta.get(key))?.value as number | undefined) ?? 0;
  if (r.lastSeq > local) await odb.meta.put({ key, value: r.lastSeq });
}
export async function nextOfflineInvoiceNo(dateIso: string): Promise<{ invoiceNo: string; counter: string }> {
  const counter = getCounterCode();
  const fy = financialYear(dateIso);
  const key = `seq:${counter}:${fy}`;
  const last = ((await odb.meta.get(key))?.value as number | undefined) ?? 0;
  const seq = last + 1;
  await odb.meta.put({ key, value: seq });
  return { invoiceNo: `INV-${counter}/${fy}/${String(seq).padStart(5, '0')}`, counter };
}
/** Queue a bill locally; decrements the cached batch quantities so this device does not oversell. */
export async function enqueueOfflineSale(payload: Record<string, unknown>, printable: unknown, totals: { totalPaise: number; creditPaise: number; changePaise: number }, customerPhone: string | null, lines: { batchId: number; qtyUnits: number }[]): Promise<LocalPostResult> {
  const postedAt = new Date().toISOString();
  const { invoiceNo, counter } = await nextOfflineInvoiceNo(todayIST());
  const duty = await getSnapDuty();
  const clientRef = payload.clientRef as string;
  const full = { ...payload, offline: { invoiceNo, postedAt, counter, pharmacistUserId: duty[0]?.userId ?? null } };
  await odb.transaction('rw', [odb.outbox, odb.batches], async () => {
    await odb.outbox.put({ clientRef, invoiceNo, counter, postedAt, payload: full, printable, totalPaise: totals.totalPaise, customerPhone, status: 'pending', error: null, attempts: 0, createdAt: Date.now() });
    for (const l of lines) { const b = await odb.batches.get(l.batchId); if (b) await odb.batches.put({ ...b, qtyUnits: b.qtyUnits - l.qtyUnits }); }
  });
  await refreshCounts();
  void syncNow();
  return { offline: true, id: -Date.now(), invoiceNo, totalPaise: totals.totalPaise, creditPaise: totals.creditPaise, changePaise: totals.changePaise, customerPhone, duplicate: false, warnings: [{ message: 'Saved on this device. It will be sent to the server when the connection returns.' }], clientRef };
}

// ---------- sync engine ----------
let syncing = false;
export async function syncNow(pass = 0): Promise<{ sent: number; failed: number }> {
  if (syncing || !navigator.onLine) return { sent: 0, failed: 0 };
  syncing = true; status = { ...status, syncing: true }; emit();
  let sent = 0, failed = 0;
  try {
    const pending = await odb.outbox.where('status').equals('pending').sortBy('createdAt');
    for (const o of pending) {
      try {
        const r = await api.post<{ id: number; invoiceNo: string; duplicate?: boolean }>('/sales', o.payload);
        await odb.transaction('rw', [odb.outbox, odb.synced], async () => { await odb.outbox.delete(o.clientRef); await odb.synced.put({ ...o, status: 'pending', syncedInvoiceNo: r.invoiceNo, serverId: r.id }); });
        const extra = await odb.synced.orderBy('createdAt').reverse().offset(50).primaryKeys();
        if (extra.length) await odb.synced.bulkDelete(extra);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) { setMode('offline'); break; }
        const msg = e instanceof ApiError ? e.message : (e as Error).message;
        if (e instanceof ApiError && e.status === 409 && /already exists/i.test(msg) && o.attempts < 3) {
          // Number clash: continue the series after the server's last number and try again on the next pass.
          try {
            await alignSeriesWithServer(o.counter, o.postedAt.slice(0, 10));
            const next = await nextOfflineInvoiceNo(o.postedAt.slice(0, 10));
            const payload = { ...o.payload, offline: { ...(o.payload.offline as Record<string, unknown>), invoiceNo: next.invoiceNo } };
            await odb.outbox.update(o.clientRef, { invoiceNo: next.invoiceNo, payload, attempts: o.attempts + 1, error: `Renumbered from ${o.invoiceNo} after a clash` });
            continue;
          } catch { /* fall through to failed */ }
        }
        await odb.outbox.update(o.clientRef, { status: 'failed', error: msg, attempts: o.attempts + 1 });
        failed++;
      }
    }
    const renumbered = await odb.outbox.where('status').equals('pending').filter((x) => /Renumbered/.test(x.error ?? '')).count();
    if (renumbered && !pass) { syncing = false; const again = await syncNow(1); sent += again.sent; failed += again.failed; syncing = true; }
    if (sent) { status = { ...status, lastSyncAt: new Date().toISOString(), lastError: null }; try { await refreshSnapshot(true); } catch { /* ignore */ } }
    setMode(navigator.onLine ? 'online' : 'offline');
  } finally {
    syncing = false; status = { ...status, syncing: false }; emit(); await refreshCounts();
  }
  return { sent, failed };
}
export async function retryFailed(clientRef?: string) {
  const list = clientRef ? [await odb.outbox.get(clientRef)].filter(Boolean) as OutboxSale[] : await odb.outbox.where('status').equals('failed').toArray();
  for (const o of list) await odb.outbox.update(o.clientRef, { status: 'pending', error: null });
  return syncNow();
}
export async function discardOutbox(clientRef: string, reason: string) {
  const o = await odb.outbox.get(clientRef); if (!o) return;
  try { await api.post('/sync/discarded', { clientRef, invoiceNo: o.invoiceNo, reason, payload: o.payload, error: o.error ?? undefined }); } catch { /* keep going; local trail below */ }
  await odb.transaction('rw', [odb.outbox, odb.batches, odb.synced], async () => {
    for (const l of (o.payload.lines as { batchId: number; qty: number; unitMode: string }[]) ?? []) { const b = await odb.batches.get(l.batchId); const item = b && (await odb.items.get(b.itemId)); if (b && item) await odb.batches.put({ ...b, qtyUnits: b.qtyUnits + (l.unitMode === 'unit' ? l.qty : l.qty * item.unitsPerPack) }); }
    await odb.outbox.delete(clientRef);
    await odb.synced.put({ ...o, status: 'failed', error: `Discarded: ${reason}` });
  });
  await refreshCounts();
}

let started = false;
export function startOfflineEngine() {
  if (started || typeof window === 'undefined') return; started = true;
  const goOnline = () => { status = { ...status, online: true }; setMode('online'); void syncNow(); void refreshSnapshot().catch(() => undefined); };
  const goOffline = () => { status = { ...status, online: false }; setMode('offline'); };
  window.addEventListener('online', goOnline); window.addEventListener('offline', goOffline);
  void refreshCounts();
  void snapshotAge().then((a) => { status = { ...status, lastSnapshotAt: a }; emit(); });
  setTimeout(() => { void refreshSnapshot().catch(() => undefined); void syncNow(); }, 3000);
  setInterval(() => { void refreshSnapshot().catch(() => undefined); void syncNow(); }, 5 * 60_000);
}
