import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { hasPermission, type Permission } from '@pharma/shared';
import type Database from 'better-sqlite3';
import { schema, type DB } from '../db/index.js';
import type { Ctx } from '../lib/ctx.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const SESSION_COOKIE = 'pms_sid';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // one working day

declare module 'fastify' {
  interface FastifyRequest {
    ctx: Ctx | null;
    sessionId: string | null;
  }
  interface FastifyInstance {
    db: DB;
    sqlite: Database.Database;
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (perm: Permission) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    pharmacistOnDuty: (branchId?: number) => { userId: number; name: string; regNo: string | null } | null;
  }
}

export default fp(async (app) => {
  app.decorateRequest('ctx', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (req) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    if (!sid) return;
    const row = app.db
      .select({
        sid: schema.session.id,
        expiresAt: schema.session.expiresAt,
        userId: schema.user.id,
        username: schema.user.username,
        name: schema.user.name,
        role: schema.user.role,
        pharmacistRegNo: schema.user.pharmacistRegNo,
        active: schema.user.active,
      })
      .from(schema.session)
      .innerJoin(schema.user, eq(schema.user.id, schema.session.userId))
      .where(and(eq(schema.session.id, sid), gt(schema.session.expiresAt, new Date().toISOString())))
      .get();
    if (!row || !row.active) return;
    req.sessionId = sid;
    req.ctx = { userId: row.userId, username: row.username, name: row.name, role: row.role, pharmacistRegNo: row.pharmacistRegNo, branchId: 1, ip: req.ip ?? null };
  });

  app.decorate('requireAuth', async (req: FastifyRequest) => {
    if (!req.ctx) throw unauthorized();
  });

  app.decorate('requirePermission', (perm: Permission) => async (req: FastifyRequest) => {
    if (!req.ctx) throw unauthorized();
    if (!hasPermission(req.ctx.role, perm)) throw forbidden();
  });

  app.decorate('pharmacistOnDuty', (branchId = 1) => {
    const row = app.db
      .select({ userId: schema.dutyLog.userId, name: schema.user.name, regNo: schema.user.pharmacistRegNo })
      .from(schema.dutyLog)
      .innerJoin(schema.user, eq(schema.user.id, schema.dutyLog.userId))
      .where(and(eq(schema.dutyLog.branchId, branchId), isNull(schema.dutyLog.offAt)))
      .orderBy(schema.dutyLog.id)
      .get();
    return row ?? null;
  });
});
