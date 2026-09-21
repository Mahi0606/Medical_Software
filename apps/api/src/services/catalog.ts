import { and, asc, desc, eq, gt, inArray, ne, or, sql } from 'drizzle-orm';
import { parse } from 'csv-parse/sync';
import { SCHEDULES, displayGenericName, todayIST, type ItemInput, type ItemSearchQuery, type Schedule } from '@pharma/shared';
import { schema, type DB, type Tx } from '../db/index.js';
import { audit } from '../lib/audit.js';
import type { Ctx } from '../lib/ctx.js';
import { badRequest, notFound } from '../lib/errors.js';
import { norm } from '../lib/text.js';

export type ItemRow = typeof schema.item.$inferSelect & { manufacturer: string | null; salts: (typeof schema.itemSalt.$inferSelect)[] };

function saltSignature(salts: ItemInput['salts']): string {
  return salts
    .map((s) => `${norm(s.salt)}|${s.strength ?? ''}|${norm(s.unit)}`)
    .sort()
    .join(';');
}

export function ensureManufacturer(tx: Tx | DB, name: string | null | undefined): number | null {
  const n = name?.trim();
  if (!n) return null;
  const existing = tx.select({ id: schema.manufacturer.id }).from(schema.manufacturer).where(eq(sql`lower(${schema.manufacturer.name})`, n.toLowerCase())).get();
  if (existing) return existing.id;
  return tx.insert(schema.manufacturer).values({ name: n }).returning({ id: schema.manufacturer.id }).get().id;
}

export function createItem(db: DB, ctx: Ctx, input: ItemInput): ItemRow {
  return db.transaction((tx) => {
    const id = insertItem(tx, input);
    audit(tx, ctx, { entity: 'item', entityId: id, action: 'create', after: input });
    return getItem(tx as unknown as DB, id)!;
  });
}

export function insertItem(tx: Tx | DB, input: ItemInput): number {
  const manufacturerId = ensureManufacturer(tx, input.manufacturer);
  const genericText = displayGenericName(input.salts);
  const { salts, manufacturer: _m, scheduleEffectiveFrom, ...rest } = input;
  const row = tx.insert(schema.item).values({
    ...rest,
    manufacturerId,
    nameNorm: norm(input.name),
    genericText,
    genericNorm: saltSignature(salts),
    ean: input.ean ? input.ean.replace(/\D/g, '') || null : null,
  }).returning({ id: schema.item.id }).get();
  salts.forEach((s, i) => tx.insert(schema.itemSalt).values({ itemId: row.id, salt: s.salt.trim(), saltNorm: norm(s.salt), strength: s.strength === null || s.strength === undefined ? null : String(s.strength), unit: s.unit, position: i }).run());
  tx.insert(schema.itemScheduleHistory).values({ itemId: row.id, schedule: input.schedule, effectiveFrom: scheduleEffectiveFrom ?? todayIST() }).run();
  return row.id;
}

export function updateItem(db: DB, ctx: Ctx, id: number, input: ItemInput): ItemRow {
  return db.transaction((tx) => {
    const before = getItem(tx as unknown as DB, id);
    if (!before) throw notFound('Item not found');
    const manufacturerId = ensureManufacturer(tx, input.manufacturer);
    const { salts, manufacturer: _m, scheduleEffectiveFrom, ...rest } = input;
    tx.update(schema.item).set({
      ...rest,
      manufacturerId,
      nameNorm: norm(input.name),
      genericText: displayGenericName(salts),
      genericNorm: saltSignature(salts),
      ean: input.ean ? input.ean.replace(/\D/g, '') || null : null,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.item.id, id)).run();
    tx.delete(schema.itemSalt).where(eq(schema.itemSalt.itemId, id)).run();
    salts.forEach((s, i) => tx.insert(schema.itemSalt).values({ itemId: id, salt: s.salt.trim(), saltNorm: norm(s.salt), strength: s.strength === null || s.strength === undefined ? null : String(s.strength), unit: s.unit, position: i }).run());
    if (before.schedule !== input.schedule) {
      tx.insert(schema.itemScheduleHistory).values({ itemId: id, schedule: input.schedule, effectiveFrom: scheduleEffectiveFrom ?? todayIST() }).run();
    }
    audit(tx, ctx, { entity: 'item', entityId: id, action: 'update', before, after: input });
    return getItem(tx as unknown as DB, id)!;
  });
}

export function getItem(db: DB, id: number): ItemRow | null {
  const row = db.select({ item: schema.item, manufacturer: schema.manufacturer.name }).from(schema.item)
    .leftJoin(schema.manufacturer, eq(schema.manufacturer.id, schema.item.manufacturerId)).where(eq(schema.item.id, id)).get();
  if (!row) return null;
  const salts = db.select().from(schema.itemSalt).where(eq(schema.itemSalt.itemId, id)).orderBy(schema.itemSalt.position).all();
  return { ...row.item, manufacturer: row.manufacturer, salts };
}

export interface ItemSearchRow {
  id: number; name: string; form: string; manufacturer: string | null; genericText: string; hsn: string; gstRatePct: number; schedule: Schedule;
  baseUnit: string; unitsPerPack: number; packName: string; packsPerBox: number | null; allowLoose: boolean; rack: string | null; ean: string | null;
  notForSale: boolean; coldChain: boolean; active: boolean; minStockUnits: number; maxStockUnits: number;
  stockUnits: number; nearestExpiry: string | null; mrpPaise: number | null; batchCount: number;
}

const stockSub = (today: string) => sql<number>`(select coalesce(sum(b.qty_units),0) from batch b where b.item_id = "item"."id" and b.status = 'active' and b.expiry_date >= ${today})`;
const nearestExpirySub = (today: string) => sql<string | null>`(select min(b.expiry_date) from batch b where b.item_id = "item"."id" and b.status = 'active' and b.qty_units > 0 and b.expiry_date >= ${today})`;
const mrpSub = (today: string) => sql<number | null>`(select b.mrp_paise from batch b where b.item_id = "item"."id" and b.status = 'active' and b.qty_units > 0 and b.expiry_date >= ${today} order by b.expiry_date asc limit 1)`;
const batchCountSub = sql<number>`(select count(*) from batch b where b.item_id = "item"."id" and b.status = 'active' and b.qty_units > 0)`;

export function searchItems(db: DB, q: ItemSearchQuery): { rows: ItemSearchRow[]; total: number; page: number; pageSize: number } {
  const today = todayIST();
  const term = norm(q.q);
  const conds = [];
  if (q.active !== undefined) conds.push(eq(schema.item.active, q.active));
  else if (!term) conds.push(eq(schema.item.active, true));
  if (q.schedule) conds.push(eq(schema.item.schedule, q.schedule));
  let rank = sql`0`;
  if (term) {
    const prefix = `${term}%`;
    const tokenPrefix = `% ${term}%`;
    const saltMatch = sql`exists (select 1 from item_salt s where s.item_id = "item"."id" and (s.salt_norm like ${prefix} or s.salt_norm like ${tokenPrefix}))`;
    const digits = term.replace(/\D/g, '');
    const codeMatch = digits.length >= 6 ? sql`(${schema.item.ean} = ${digits} or ${schema.item.id} = ${Number(digits)})` : sql`0`;
    switch (q.mode) {
      case 'name': conds.push(or(sql`${schema.item.nameNorm} like ${prefix}`, sql`${schema.item.nameNorm} like ${tokenPrefix}`)!); break;
      case 'salt': conds.push(saltMatch); break;
      case 'rack': conds.push(sql`lower(${schema.item.rack}) like ${prefix}`); break;
      case 'code': conds.push(codeMatch); break;
      default: conds.push(or(sql`${schema.item.nameNorm} like ${prefix}`, sql`${schema.item.nameNorm} like ${tokenPrefix}`, saltMatch, sql`lower(${schema.item.rack}) = ${term}`, codeMatch)!);
    }
    rank = sql`case when ${schema.item.nameNorm} like ${prefix} then 0 when ${schema.item.nameNorm} like ${tokenPrefix} then 1 else 2 end`;
  }
  if (q.inStockOnly) conds.push(gt(stockSub(today), 0));
  const where = conds.length ? and(...conds) : undefined;
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.item).where(where).get()!.n;
  const rows = db.select({
    id: schema.item.id, name: schema.item.name, form: schema.item.form, manufacturer: schema.manufacturer.name, genericText: schema.item.genericText,
    hsn: schema.item.hsn, gstRatePct: schema.item.gstRatePct, schedule: schema.item.schedule, baseUnit: schema.item.baseUnit, unitsPerPack: schema.item.unitsPerPack,
    packName: schema.item.packName, packsPerBox: schema.item.packsPerBox, allowLoose: schema.item.allowLoose, rack: schema.item.rack, ean: schema.item.ean,
    notForSale: schema.item.notForSale, coldChain: schema.item.coldChain, active: schema.item.active, minStockUnits: schema.item.minStockUnits, maxStockUnits: schema.item.maxStockUnits,
    stockUnits: stockSub(today), nearestExpiry: nearestExpirySub(today), mrpPaise: mrpSub(today), batchCount: batchCountSub, rank,
  }).from(schema.item).leftJoin(schema.manufacturer, eq(schema.manufacturer.id, schema.item.manufacturerId))
    .where(where)
    .orderBy(...(term ? [rank] : []), q.sort === 'stock' ? (q.dir === 'desc' ? desc(stockSub(today)) : asc(stockSub(today))) : asc(schema.item.nameNorm))
    .limit(q.pageSize).offset((q.page - 1) * q.pageSize).all();
  return { rows: rows.map(({ rank: _r, ...r }) => r as ItemSearchRow), total, page: q.page, pageSize: q.pageSize };
}

/** Same salts + strengths, in stock, not the item itself. */
export function substitutes(db: DB, itemId: number): ItemSearchRow[] {
  const it = db.select({ genericNorm: schema.item.genericNorm }).from(schema.item).where(eq(schema.item.id, itemId)).get();
  if (!it || !it.genericNorm) return [];
  const today = todayIST();
  return db.select({
    id: schema.item.id, name: schema.item.name, form: schema.item.form, manufacturer: schema.manufacturer.name, genericText: schema.item.genericText,
    hsn: schema.item.hsn, gstRatePct: schema.item.gstRatePct, schedule: schema.item.schedule, baseUnit: schema.item.baseUnit, unitsPerPack: schema.item.unitsPerPack,
    packName: schema.item.packName, packsPerBox: schema.item.packsPerBox, allowLoose: schema.item.allowLoose, rack: schema.item.rack, ean: schema.item.ean,
    notForSale: schema.item.notForSale, coldChain: schema.item.coldChain, active: schema.item.active, minStockUnits: schema.item.minStockUnits, maxStockUnits: schema.item.maxStockUnits,
    stockUnits: stockSub(today), nearestExpiry: nearestExpirySub(today), mrpPaise: mrpSub(today), batchCount: batchCountSub,
  }).from(schema.item).leftJoin(schema.manufacturer, eq(schema.manufacturer.id, schema.item.manufacturerId))
    .where(and(eq(schema.item.genericNorm, it.genericNorm), ne(schema.item.id, itemId), eq(schema.item.active, true), gt(stockSub(today), 0)))
    .orderBy(asc(mrpSub(today))).all() as ItemSearchRow[];
}

export function listManufacturers(db: DB) {
  return db.select().from(schema.manufacturer).orderBy(schema.manufacturer.name).all();
}

export function listSalts(db: DB, q: string | undefined) {
  const term = norm(q);
  return db.select({ salt: schema.itemSalt.salt, n: sql<number>`count(*)` }).from(schema.itemSalt)
    .where(term ? sql`${schema.itemSalt.saltNorm} like ${term + '%'}` : undefined)
    .groupBy(schema.itemSalt.saltNorm).orderBy(desc(sql`count(*)`)).limit(20).all();
}

export function findItemByEan(db: DB, gtin: string) {
  const digits = gtin.replace(/\D/g, '');
  const candidates = [...new Set([digits, digits.replace(/^0+/, ''), digits.padStart(14, '0')])];
  return db.select({ id: schema.item.id }).from(schema.item).where(inArray(schema.item.ean, candidates)).get() ?? null;
}

// ---------- CSV import ----------
const STRENGTH_RE = /^(.*?)[\s]*(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|ml|iu|%|units?|mmol|meq|lakh\s*iu|million\s*iu)?\s*$/i;

export function parseGenericString(s: string): ItemInput['salts'] {
  if (!s?.trim()) return [];
  return s.split(/\s*\+\s*|\s*&\s*|\s*,\s*/).filter(Boolean).map((part) => {
    const m = part.trim().match(STRENGTH_RE);
    if (m && m[2]) return { salt: m[1]!.trim().replace(/[\(\)]/g, ''), strength: Number(m[2]), unit: m[3] ? m[3].toLowerCase().replace('µg', 'mcg').replace('ug', 'mcg') : null };
    return { salt: part.trim(), strength: null, unit: null };
  });
}

export interface ImportResult { created: number; updated: number; skipped: number; errors: { row: number; message: string }[] }

export function importItemsCsv(db: DB, ctx: Ctx, csv: string): ImportResult {
  let records: Record<string, string>[];
  try {
    records = parse(csv, { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')), skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  } catch (e) {
    throw badRequest(`Could not read the CSV file: ${(e as Error).message}`);
  }
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  db.transaction((tx) => {
    records.forEach((r, i) => {
      const rowNo = i + 2;
      try {
        const name = r.name ?? r.item_name ?? r.brand ?? r.product;
        if (!name) { result.skipped++; return; }
        const schedule = (r.schedule ?? 'NONE').toUpperCase().replace(/^SCH(EDULE)?\s*/, '') as Schedule;
        const input: ItemInput = {
          name, form: (r.form ?? r.type ?? 'tablet').toLowerCase() as ItemInput['form'], manufacturer: r.manufacturer ?? r.company ?? r.mfr ?? null,
          salts: parseGenericString(r.generic ?? r.composition ?? r.salt ?? r.salts ?? ''),
          hsn: (r.hsn ?? '3004').replace(/\D/g, '') || '3004', gstRatePct: Number(r.gst ?? r.gst_rate ?? r.gst_ ?? 5),
          schedule: (SCHEDULES as readonly string[]).includes(schedule) ? schedule : 'NONE', scheduleEffectiveFrom: null,
          baseUnit: r.base_unit ?? r.unit ?? 'tablet', unitsPerPack: Number(r.units_per_pack ?? r.pack_size ?? r.pack ?? 10) || 10, packName: r.pack_name ?? 'strip',
          packsPerBox: r.packs_per_box ? Number(r.packs_per_box) : null, allowLoose: !/^(n|no|false|0)$/i.test(r.allow_loose ?? 'yes'),
          rack: r.rack ?? r.location ?? null, minStockUnits: Number(r.min_stock ?? r.min_stock_units ?? 0) || 0, maxStockUnits: Number(r.max_stock ?? 0) || 0, reorderQtyPacks: Number(r.reorder_qty ?? 0) || 0,
          ean: r.ean ?? r.barcode ?? r.gtin ?? null, coldChain: /^(y|yes|true|1)$/i.test(r.cold_chain ?? ''), notForSale: false, narcotic: /^(y|yes|true|1)$/i.test(r.narcotic ?? ''), active: true, notes: null,
        };
        if (!['tablet','capsule','syrup','suspension','injection','drops','cream','ointment','gel','inhaler','powder','sachet','lotion','spray','solution','device','other'].includes(input.form)) input.form = 'other';
        if (![0, 5, 12, 18, 28].includes(input.gstRatePct)) input.gstRatePct = 5;
        const existing = tx.select({ id: schema.item.id }).from(schema.item).where(eq(schema.item.nameNorm, norm(name))).get();
        if (existing) {
          const before = getItem(tx as unknown as DB, existing.id)!;
          const merged: ItemInput = { ...input, rack: input.rack ?? before.rack, ean: input.ean ?? before.ean, salts: input.salts.length ? input.salts : before.salts.map((s) => ({ salt: s.salt, strength: s.strength ? Number(s.strength) : null, unit: s.unit })) };
          const manufacturerId = ensureManufacturer(tx, merged.manufacturer ?? before.manufacturer);
          const { salts, manufacturer: _m, scheduleEffectiveFrom: _e, ...rest } = merged;
          tx.update(schema.item).set({ ...rest, manufacturerId, nameNorm: norm(merged.name), genericText: displayGenericName(salts), genericNorm: saltSignature(salts), updatedAt: new Date().toISOString() }).where(eq(schema.item.id, existing.id)).run();
          tx.delete(schema.itemSalt).where(eq(schema.itemSalt.itemId, existing.id)).run();
          salts.forEach((s, p) => tx.insert(schema.itemSalt).values({ itemId: existing.id, salt: s.salt, saltNorm: norm(s.salt), strength: s.strength === null ? null : String(s.strength), unit: s.unit, position: p }).run());
          result.updated++;
        } else {
          insertItem(tx, input);
          result.created++;
        }
      } catch (e) {
        result.errors.push({ row: rowNo, message: (e as Error).message });
      }
    });
    audit(tx, ctx, { entity: 'item', entityId: null, action: 'import', after: { created: result.created, updated: result.updated, skipped: result.skipped, errors: result.errors.length } });
  });
  return result;
}
