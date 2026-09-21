import Dexie, { type EntityTable } from 'dexie';

/** Local drafts so a dropped connection or refresh never loses a bill in progress. */
export interface DraftBill {
  clientRef: string;
  updatedAt: number;
  payload: unknown;
  label?: string;
}

export const localDb = new Dexie('pharmacy-local') as Dexie & { drafts: EntityTable<DraftBill, 'clientRef'> };
localDb.version(1).stores({ drafts: 'clientRef, updatedAt' });
