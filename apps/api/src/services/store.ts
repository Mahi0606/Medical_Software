import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { LicenceInput, StoreInput, UserCreateInput } from '@pharma/shared';
import { schema, type DB } from '../db/index.js';
import { audit } from '../lib/audit.js';
import type { Ctx } from '../lib/ctx.js';
import { badRequest, blocked, conflict, notFound } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';

export function getStore(db: DB) {
  const s = db.select().from(schema.store).where(eq(schema.store.id, 1)).get()!;
  const licences = db.select().from(schema.licence).orderBy(schema.licence.type).all();
  return { ...s, licences };
}

export function updateStore(db: DB, ctx: Ctx, input: StoreInput) {
  const before = db.select().from(schema.store).where(eq(schema.store.id, 1)).get();
  db.transaction((tx) => {
    tx.update(schema.store).set({ ...input, setupComplete: true, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` }).where(eq(schema.store.id, 1)).run();
    audit(tx, ctx, { entity: 'store', entityId: 1, action: 'update', before, after: input });
  });
  return getStore(db);
}

export function listLicences(db: DB) {
  return db.select().from(schema.licence).orderBy(schema.licence.type).all();
}

export function upsertLicence(db: DB, ctx: Ctx, input: LicenceInput, id?: number) {
  return db.transaction((tx) => {
    if (id) {
      const before = tx.select().from(schema.licence).where(eq(schema.licence.id, id)).get();
      if (!before) throw notFound('Licence not found');
      tx.update(schema.licence).set(input).where(eq(schema.licence.id, id)).run();
      audit(tx, ctx, { entity: 'licence', entityId: id, action: 'update', before, after: input });
      return tx.select().from(schema.licence).where(eq(schema.licence.id, id)).get()!;
    }
    const row = tx.insert(schema.licence).values({ ...input, branchId: ctx.branchId }).returning().get();
    audit(tx, ctx, { entity: 'licence', entityId: row.id, action: 'create', after: input });
    return row;
  });
}

export function deleteLicence(db: DB, ctx: Ctx, id: number) {
  db.transaction((tx) => {
    const before = tx.select().from(schema.licence).where(eq(schema.licence.id, id)).get();
    if (!before) throw notFound('Licence not found');
    tx.delete(schema.licence).where(eq(schema.licence.id, id)).run();
    audit(tx, ctx, { entity: 'licence', entityId: id, action: 'delete', before });
  });
}

// ---------- Users ----------
const publicUser = {
  id: schema.user.id, name: schema.user.name, username: schema.user.username, role: schema.user.role,
  pharmacistRegNo: schema.user.pharmacistRegNo, phone: schema.user.phone, active: schema.user.active, createdAt: schema.user.createdAt,
};

export function listUsers(db: DB) {
  return db.select(publicUser).from(schema.user).orderBy(schema.user.name).all();
}

export function createUser(db: DB, ctx: Ctx, input: UserCreateInput) {
  if (input.role === 'pharmacist' && !input.pharmacistRegNo) throw badRequest('Pharmacist registration number is required for the pharmacist role');
  return db.transaction((tx) => {
    const exists = tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.username, input.username)).get();
    if (exists) throw conflict('That username is already taken');
    const { password, ...rest } = input;
    const row = tx.insert(schema.user).values({ ...rest, passwordHash: hashPassword(password) }).returning(publicUser).get();
    audit(tx, ctx, { entity: 'user', entityId: row.id, action: 'create', after: rest });
    return row;
  });
}

export function updateUser(db: DB, ctx: Ctx, id: number, input: Partial<UserCreateInput>) {
  return db.transaction((tx) => {
    const before = tx.select(publicUser).from(schema.user).where(eq(schema.user.id, id)).get();
    if (!before) throw notFound('User not found');
    const { password, ...rest } = input;
    const patch: Record<string, unknown> = { ...rest, updatedAt: new Date().toISOString() };
    if (password) patch.passwordHash = hashPassword(password);
    if (before.role === 'owner' && rest.role && rest.role !== 'owner') {
      const owners = tx.select({ n: sql<number>`count(*)` }).from(schema.user).where(and(eq(schema.user.role, 'owner'), eq(schema.user.active, true))).get()!.n;
      if (owners <= 1) throw blocked('At least one active owner account is required');
    }
    if (before.active && rest.active === false && before.role === 'owner') {
      const owners = tx.select({ n: sql<number>`count(*)` }).from(schema.user).where(and(eq(schema.user.role, 'owner'), eq(schema.user.active, true))).get()!.n;
      if (owners <= 1) throw blocked('At least one active owner account is required');
    }
    tx.update(schema.user).set(patch).where(eq(schema.user.id, id)).run();
    if (rest.active === false) tx.delete(schema.session).where(eq(schema.session.userId, id)).run();
    audit(tx, ctx, { entity: 'user', entityId: id, action: 'update', before, after: rest });
    return tx.select(publicUser).from(schema.user).where(eq(schema.user.id, id)).get()!;
  });
}

// ---------- Pharmacist duty ----------
export function currentDuty(db: DB, branchId = 1) {
  return db.select({ id: schema.dutyLog.id, userId: schema.dutyLog.userId, name: schema.user.name, regNo: schema.user.pharmacistRegNo, onAt: schema.dutyLog.onAt })
    .from(schema.dutyLog).innerJoin(schema.user, eq(schema.user.id, schema.dutyLog.userId))
    .where(and(eq(schema.dutyLog.branchId, branchId), isNull(schema.dutyLog.offAt))).orderBy(desc(schema.dutyLog.id)).all();
}

export function setDuty(db: DB, ctx: Ctx, on: boolean, userId?: number) {
  const target = userId ?? ctx.userId;
  return db.transaction((tx) => {
    const u = tx.select().from(schema.user).where(eq(schema.user.id, target)).get();
    if (!u) throw notFound('User not found');
    if (on) {
      if (!(u.role === 'pharmacist' || (u.role === 'owner' && u.pharmacistRegNo))) throw blocked('Only a registered pharmacist can be marked on duty');
      const open = tx.select().from(schema.dutyLog).where(and(eq(schema.dutyLog.userId, target), isNull(schema.dutyLog.offAt))).get();
      if (!open) {
        tx.insert(schema.dutyLog).values({ branchId: ctx.branchId, userId: target }).run();
        audit(tx, ctx, { entity: 'duty', entityId: target, action: 'duty_on', after: { name: u.name, regNo: u.pharmacistRegNo } });
      }
    } else {
      tx.update(schema.dutyLog).set({ offAt: new Date().toISOString() }).where(and(eq(schema.dutyLog.userId, target), isNull(schema.dutyLog.offAt))).run();
      audit(tx, ctx, { entity: 'duty', entityId: target, action: 'duty_off' });
    }
    return currentDuty(tx as unknown as DB, ctx.branchId);
  });
}
