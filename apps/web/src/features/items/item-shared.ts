import { useEffect, useState } from 'react';
import type { Schedule } from '@pharma/shared';
import { ApiError } from '@/lib/api';

/** Row shape of GET /items (ItemSearchRow on the API). */
export interface ItemSearchRow {
  id: number; name: string; form: string; manufacturer: string | null; genericText: string; hsn: string; gstRatePct: number; schedule: Schedule;
  baseUnit: string; unitsPerPack: number; packName: string; packsPerBox: number | null; allowLoose: boolean; rack: string | null; ean: string | null;
  notForSale: boolean; coldChain: boolean; active: boolean; minStockUnits: number; maxStockUnits: number;
  stockUnits: number; nearestExpiry: string | null; mrpPaise: number | null; batchCount: number;
}

/** Shape of GET /items/:id (item row + manufacturer name + salts). */
export interface ItemFull {
  id: number; name: string; form: string; manufacturerId: number | null; manufacturer: string | null; genericText: string; hsn: string; gstRatePct: number; schedule: Schedule;
  baseUnit: string; unitsPerPack: number; packName: string; packsPerBox: number | null; allowLoose: boolean; rack: string | null; minStockUnits: number; maxStockUnits: number; reorderQtyPacks: number;
  ean: string | null; coldChain: boolean; notForSale: boolean; narcotic: boolean; active: boolean; notes: string | null; createdAt: string; updatedAt: string;
  salts: { id: number; salt: string; strength: string | null; unit: string | null; position: number }[];
}

/** Row shape of GET /batches, /batches/:id and /items/:id/batches (BatchRow on the API). */
export interface BatchRow {
  id: number; itemId: number; batchNo: string; mfgDate: string | null; expiryDate: string; mrpPaise: number; purchaseRatePaise: number; supplierId: number | null; gtin: string | null;
  status: 'active' | 'quarantined' | 'returned' | 'disposed'; qtyUnits: number; createdAt: string;
  itemName: string; genericText: string; unitsPerPack: number; packName: string; baseUnit: string; allowLoose: boolean; rack: string | null; schedule: Schedule; gstRatePct: number; hsn: string; notForSale: boolean;
  manufacturer: string | null; supplierName: string | null;
}

export interface LedgerRow { id: number; createdAt: string; batchId: number; batchNo: string; itemName: string; qtyDelta: number; balanceAfter: number; reason: string; docType: string | null; docId: number | null; note: string | null; userName: string | null }

export interface DescribedError { title: string; detail?: string; fields: { path: string; message: string }[] }

/** Turn any thrown error into a title, optional detail and field-level messages. */
export function describeError(e: unknown): DescribedError {
  if (e instanceof ApiError) {
    const detail = !Array.isArray(e.details) && e.details && typeof e.details === 'object' && 'missing' in e.details ? (e.details as { missing?: string[] }).missing?.join(', ') : undefined;
    return { title: e.message, detail, fields: e.fieldErrors };
  }
  return { title: e instanceof Error ? e.message : 'Something went wrong', fields: [] };
}

export function packOf(r: { baseUnit: string; unitsPerPack: number; packName: string; allowLoose: boolean }) {
  return { baseUnit: r.baseUnit, unitsPerPack: r.unitsPerPack, packName: r.packName, allowLoose: r.allowLoose };
}

/** Whole packs in a unit count (used for label copies and opening-stock previews). */
export function packsIn(units: number, unitsPerPack: number) {
  return Math.max(0, Math.floor(units / Math.max(1, unitsPerPack)));
}

export function useDebounced<T>(value: T, ms = 160): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Rupee string ("12.50") → paise, tolerant of blanks and ₹ signs. */
export function rupeeToPaise(s: string | number): number {
  const n = typeof s === 'number' ? s : Number(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function paiseToRupee(p: number | null | undefined): string {
  return p === null || p === undefined || p === 0 ? '' : (p / 100).toFixed(2);
}

export const BATCH_STATUS_LABEL: Record<BatchRow['status'], string> = { active: 'Active', quarantined: 'In quarantine', returned: 'Returned to supplier', disposed: 'Disposed' };

export const STOCK_REASON_LABEL: Record<string, string> = {
  purchase: 'Received', sale: 'Sold', sale_return: 'Customer return', purchase_return: 'Returned to supplier', adjustment: 'Adjusted', opening: 'Opening stock',
  quarantine: 'Quarantined', unquarantine: 'Released from quarantine', disposal: 'Disposed', transfer: 'Transferred', cancel: 'Receipt cancelled',
};
