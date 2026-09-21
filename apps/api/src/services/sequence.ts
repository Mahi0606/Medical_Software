import { and, eq, sql } from 'drizzle-orm';
import { financialYear } from '@pharma/shared';
import { schema, type Tx } from '../db/index.js';

export type DocType = 'INV' | 'GRN' | 'CN' | 'PR' | 'ADJ' | 'RX' | 'H1' | 'X' | 'PO';

/**
 * Gapless, financial-year scoped numbering per branch and document type
 * (CGST Rule 46: consecutive serial number unique for a financial year).
 * Must be called inside the posting transaction.
 */
export function nextSequence(tx: Tx, branchId: number, docType: DocType, dateIso: string): { fy: string; seq: number } {
  const fy = financialYear(dateIso);
  tx.insert(schema.docSequence).values({ branchId, docType, fy, last: 0 }).onConflictDoNothing().run();
  tx.update(schema.docSequence)
    .set({ last: sql`${schema.docSequence.last} + 1` })
    .where(and(eq(schema.docSequence.branchId, branchId), eq(schema.docSequence.docType, docType), eq(schema.docSequence.fy, fy)))
    .run();
  const row = tx.select({ last: schema.docSequence.last }).from(schema.docSequence)
    .where(and(eq(schema.docSequence.branchId, branchId), eq(schema.docSequence.docType, docType), eq(schema.docSequence.fy, fy))).get();
  return { fy, seq: row!.last };
}

export function formatDocNo(prefix: string, fy: string, seq: number, width = 5): string {
  return `${prefix}/${fy}/${String(seq).padStart(width, '0')}`;
}
