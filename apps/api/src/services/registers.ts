import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { financialYear, todayIST } from '@pharma/shared';
import { schema, type DB } from '../db/index.js';

export type RegisterKind = 'RX' | 'H1' | 'X';

export function listRegister(db: DB, f: { register: RegisterKind; fy?: string; from?: string; to?: string; q?: string; page: number; pageSize: number }) {
  const conds = [eq(schema.rxRegister.register, f.register)];
  if (f.fy) conds.push(eq(schema.rxRegister.fy, f.fy));
  if (f.from) conds.push(gte(schema.rxRegister.date, f.from));
  if (f.to) conds.push(lte(schema.rxRegister.date, f.to));
  if (f.q) {
    const t = `%${f.q.toLowerCase()}%`;
    conds.push(sql`(lower(${schema.rxRegister.itemName}) like ${t} or lower(${schema.rxRegister.patientName}) like ${t} or lower(${schema.rxRegister.doctorName}) like ${t} or lower(${schema.rxRegister.batchNo}) like ${t} or lower(${schema.rxRegister.invoiceNo}) like ${t})`);
  }
  const where = and(...conds);
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.rxRegister).where(where).get()!.n;
  const rows = db.select({ r: schema.rxRegister, saleStatus: schema.sale.status }).from(schema.rxRegister).leftJoin(schema.sale, eq(schema.sale.id, schema.rxRegister.saleId)).where(where)
    .orderBy(desc(schema.rxRegister.fy), desc(schema.rxRegister.serialNo)).limit(f.pageSize).offset((f.page - 1) * f.pageSize).all();
  return { rows: rows.map((x) => ({ ...x.r, saleStatus: x.saleStatus })), total, page: f.page, pageSize: f.pageSize, fy: f.fy ?? financialYear(todayIST()) };
}

export function registerFullForPrint(db: DB, register: RegisterKind, fy: string) {
  return db.select({ r: schema.rxRegister, saleStatus: schema.sale.status }).from(schema.rxRegister).leftJoin(schema.sale, eq(schema.sale.id, schema.rxRegister.saleId))
    .where(and(eq(schema.rxRegister.register, register), eq(schema.rxRegister.fy, fy))).orderBy(asc(schema.rxRegister.serialNo)).all().map((x) => ({ ...x.r, saleStatus: x.saleStatus }));
}

export function registerFys(db: DB) {
  return db.selectDistinct({ fy: schema.rxRegister.fy }).from(schema.rxRegister).orderBy(desc(schema.rxRegister.fy)).all().map((r) => r.fy);
}
