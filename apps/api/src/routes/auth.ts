import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { changePasswordSchema, loginSchema } from '@pharma/shared';
import { schema } from '../db/index.js';
import type { Ctx } from '../lib/ctx.js';
import { audit } from '../lib/audit.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { hashPassword, randomToken, verifyPassword } from '../lib/password.js';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../plugins/auth.js';
import { currentDuty, setDuty } from '../services/store.js';

const cookieOpts = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: process.env.COOKIE_SECURE === 'true' };

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/login', { schema: { body: loginSchema } }, async (req, reply) => {
    const u = app.db.select().from(schema.user).where(eq(schema.user.username, req.body.username)).get();
    if (!u || !u.active || !verifyPassword(req.body.password, u.passwordHash)) {
      throw unauthorized('Username or password is incorrect');
    }
    const sid = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    app.db.insert(schema.session).values({ id: sid, userId: u.id, expiresAt, userAgent: req.headers['user-agent'] ?? null }).run();
    app.db.delete(schema.session).where(lt(schema.session.expiresAt, new Date().toISOString())).run();
    const ctx = { userId: u.id, username: u.username, name: u.name, role: u.role, pharmacistRegNo: u.pharmacistRegNo, branchId: 1, ip: req.ip };
    audit(app.db, ctx, { entity: 'session', entityId: u.id, action: 'login' });
    reply.setCookie(SESSION_COOKIE, sid, { ...cookieOpts, expires: new Date(expiresAt) });
    return me(app, ctx);
  });

  app.post('/logout', async (req, reply) => {
    if (req.sessionId) {
      app.db.delete(schema.session).where(eq(schema.session.id, req.sessionId)).run();
      if (req.ctx) audit(app.db, req.ctx, { entity: 'session', entityId: req.ctx.userId, action: 'logout' });
    }
    reply.clearCookie(SESSION_COOKIE, cookieOpts);
    return { ok: true };
  });

  app.get('/me', async (req) => {
    if (!req.ctx) return { user: null, duty: [], store: publicStore(app) };
    return me(app, req.ctx);
  });

  app.post('/change-password', { schema: { body: changePasswordSchema }, preHandler: app.requireAuth }, async (req) => {
    const u = app.db.select().from(schema.user).where(eq(schema.user.id, req.ctx!.userId)).get()!;
    if (!verifyPassword(req.body.currentPassword, u.passwordHash)) throw badRequest('Current password is incorrect');
    app.db.update(schema.user).set({ passwordHash: hashPassword(req.body.newPassword) }).where(eq(schema.user.id, u.id)).run();
    audit(app.db, req.ctx!, { entity: 'user', entityId: u.id, action: 'update', after: { password: 'changed' } });
    return { ok: true };
  });

  app.post('/duty', { schema: { body: z.object({ on: z.boolean(), userId: z.number().int().optional() }) }, preHandler: app.requirePermission('duty.toggle') }, async (req) => {
    return { duty: setDuty(app.db, req.ctx!, req.body.on, req.body.userId) };
  });
};

function publicStore(app: Parameters<FastifyPluginAsyncZod>[0]) {
  const s = app.db.select({ name: schema.store.name, setupComplete: schema.store.setupComplete, gstScheme: schema.store.gstScheme, printFormat: schema.store.printFormat, nearExpiryDays: schema.store.nearExpiryDays, maxDiscountPctClerk: schema.store.maxDiscountPctClerk, maxDiscountPctPharmacist: schema.store.maxDiscountPctPharmacist, city: schema.store.city, stateCode: schema.store.stateCode }).from(schema.store).where(eq(schema.store.id, 1)).get()!;
  return s;
}

function me(app: Parameters<FastifyPluginAsyncZod>[0], ctx: Ctx) {
  return {
    user: { id: ctx.userId, username: ctx.username, name: ctx.name, role: ctx.role, pharmacistRegNo: ctx.pharmacistRegNo },
    duty: currentDuty(app.db, ctx.branchId),
    store: publicStore(app),
  };
}
