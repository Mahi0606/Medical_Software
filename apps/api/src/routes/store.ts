import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParam, licenceSchema, storeSchema, userCreateSchema, userUpdateSchema } from '@pharma/shared';
import { createUser, deleteLicence, getStore, listLicences, listUsers, updateStore, updateUser, upsertLicence } from '../services/store.js';

export const storeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/store', { preHandler: app.requireAuth }, async () => getStore(app.db));
  app.put('/store', { schema: { body: storeSchema }, preHandler: app.requirePermission('settings.write') }, async (req) => updateStore(app.db, req.ctx!, req.body));

  app.get('/licences', { preHandler: app.requireAuth }, async () => listLicences(app.db));
  app.post('/licences', { schema: { body: licenceSchema }, preHandler: app.requirePermission('settings.write') }, async (req) => upsertLicence(app.db, req.ctx!, req.body));
  app.put('/licences/:id', { schema: { params: idParam, body: licenceSchema }, preHandler: app.requirePermission('settings.write') }, async (req) => upsertLicence(app.db, req.ctx!, req.body, req.params.id));
  app.delete('/licences/:id', { schema: { params: idParam }, preHandler: app.requirePermission('settings.write') }, async (req) => { deleteLicence(app.db, req.ctx!, req.params.id); return { ok: true }; });

  app.get('/users', { preHandler: app.requirePermission('user.write') }, async () => listUsers(app.db));
  app.post('/users', { schema: { body: userCreateSchema }, preHandler: app.requirePermission('user.write') }, async (req) => createUser(app.db, req.ctx!, req.body));
  app.put('/users/:id', { schema: { params: idParam, body: userUpdateSchema }, preHandler: app.requirePermission('user.write') }, async (req) => updateUser(app.db, req.ctx!, req.params.id, req.body));
  app.get('/users/pharmacists', { preHandler: app.requireAuth }, async () => listUsers(app.db).filter((u) => u.active && (u.role === 'pharmacist' || (u.role === 'owner' && u.pharmacistRegNo))));
  app.get('/health', async () => ({ ok: true, time: new Date().toISOString(), version: z.string().parse('0.1.0') }));
};
