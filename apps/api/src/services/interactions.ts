import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { STARTER_INTERACTION_RULES, addDays, checkInteractions, normSalt, todayIST, type CartItemLike, type InteractionRuleInput } from '@pharma/shared';
import { schema, type DB } from '../db/index.js';
import { audit } from '../lib/audit.js';
import type { Ctx } from '../lib/ctx.js';
import { notFound } from '../lib/errors.js';

export function ensureStarterRules(db: DB) {
  const n = db.select({ id: schema.interactionRule.id }).from(schema.interactionRule).limit(1).get();
  if (n) return;
  for (const r of STARTER_INTERACTION_RULES) db.insert(schema.interactionRule).values({ saltA: normSalt(r.saltA), saltB: normSalt(r.saltB), severity: r.severity, message: r.message, advice: r.advice ?? null, source: (r as { source?: string }).source ?? null }).run();
}

export function listRules(db: DB, f: { q?: string; severity?: string; page: number; pageSize: number; includeInactive?: boolean }) {
  ensureStarterRules(db);
  const conds = [];
  if (!f.includeInactive) conds.push(eq(schema.interactionRule.active, true));
  if (f.severity) conds.push(eq(schema.interactionRule.severity, f.severity as 'major'));
  if (f.q) { const t = `%${f.q.toLowerCase()}%`; conds.push(or(sql`${schema.interactionRule.saltA} like ${t}`, sql`${schema.interactionRule.saltB} like ${t}`, sql`lower(${schema.interactionRule.message}) like ${t}`)!); }
  const where = conds.length ? and(...conds) : undefined;
  const total = db.select({ n: sql<number>`count(*)` }).from(schema.interactionRule).where(where).get()!.n;
  const rows = db.select().from(schema.interactionRule).where(where).orderBy(sql`case ${schema.interactionRule.severity} when 'major' then 0 when 'moderate' then 1 else 2 end`, schema.interactionRule.saltA).limit(f.pageSize).offset((f.page - 1) * f.pageSize).all();
  return { rows, total, page: f.page, pageSize: f.pageSize };
}

export function activeRules(db: DB) {
  ensureStarterRules(db);
  return db.select({ id: schema.interactionRule.id, saltA: schema.interactionRule.saltA, saltB: schema.interactionRule.saltB, severity: schema.interactionRule.severity, message: schema.interactionRule.message, advice: schema.interactionRule.advice }).from(schema.interactionRule).where(eq(schema.interactionRule.active, true)).all();
}

export function saveRule(db: DB, ctx: Ctx, input: InteractionRuleInput, id?: number) {
  const row = { ...input, saltA: normSalt(input.saltA), saltB: normSalt(input.saltB), updatedAt: new Date().toISOString() };
  return db.transaction((tx) => {
    if (id) {
      const before = tx.select().from(schema.interactionRule).where(eq(schema.interactionRule.id, id)).get();
      if (!before) throw notFound('Rule not found');
      tx.update(schema.interactionRule).set(row).where(eq(schema.interactionRule.id, id)).run();
      audit(tx, ctx, { entity: 'interaction_rule', entityId: id, action: 'update', before, after: row });
      return tx.select().from(schema.interactionRule).where(eq(schema.interactionRule.id, id)).get()!;
    }
    const created = tx.insert(schema.interactionRule).values(row).returning().get();
    audit(tx, ctx, { entity: 'interaction_rule', entityId: created.id, action: 'create', after: row });
    return created;
  });
}

export function deleteRule(db: DB, ctx: Ctx, id: number) {
  db.transaction((tx) => {
    const before = tx.select().from(schema.interactionRule).where(eq(schema.interactionRule.id, id)).get();
    if (!before) throw notFound('Rule not found');
    tx.delete(schema.interactionRule).where(eq(schema.interactionRule.id, id)).run();
    audit(tx, ctx, { entity: 'interaction_rule', entityId: id, action: 'delete', before });
  });
}

/** Cart items plus the customer's recent purchases (so a new antibiotic is checked against last week's warfarin). */
export function checkForBill(db: DB, itemIds: number[], customerId: number | null | undefined, historyDays: number) {
  const items = db.select({ id: schema.item.id, name: schema.item.name }).from(schema.item).where(inArray(schema.item.id, itemIds)).all();
  const salts = db.select({ itemId: schema.itemSalt.itemId, salt: schema.itemSalt.salt }).from(schema.itemSalt).where(inArray(schema.itemSalt.itemId, itemIds)).all();
  const cart: CartItemLike[] = items.map((i) => ({ itemId: i.id, name: i.name, salts: salts.filter((s) => s.itemId === i.id).map((s) => s.salt), source: 'cart' }));
  let history: CartItemLike[] = [];
  if (customerId && historyDays > 0) {
    const since = addDays(todayIST(), -historyDays);
    const rows = db.select({ itemId: schema.saleLine.itemId, name: schema.saleLine.itemName, date: schema.sale.date }).from(schema.saleLine).innerJoin(schema.sale, eq(schema.sale.id, schema.saleLine.saleId))
      .where(and(eq(schema.sale.customerId, customerId), eq(schema.sale.status, 'posted'), gte(schema.sale.date, since))).orderBy(desc(schema.sale.date)).all();
    const ids = [...new Set(rows.map((r) => r.itemId).filter((id) => !itemIds.includes(id)))];
    if (ids.length) {
      const hs = db.select({ itemId: schema.itemSalt.itemId, salt: schema.itemSalt.salt }).from(schema.itemSalt).where(inArray(schema.itemSalt.itemId, ids)).all();
      history = ids.map((id) => { const r = rows.find((x) => x.itemId === id)!; return { itemId: id, name: r.name, salts: hs.filter((s) => s.itemId === id).map((s) => s.salt), source: 'history' as const, historyDate: r.date }; });
    }
  }
  return { ...checkInteractions([...cart, ...history], activeRules(db)), historyCount: history.length };
}
