import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParam, messagingSettingsSchema, outboxQuery, refillsQuery, sendMessageSchema } from '@pharma/shared';
import {
  cancelMessage, duesList, listOutbox, markMessageSent, messagingStatus, publicMessagingSettings, queueBillMessage, queueMessage, queueRefillForSale, queueTestMessage,
  refillsDue, retryMessage, runDuesReminders, runRefillReminders, saveMessagingSettings,
} from '../services/messaging.js';

const duesRunSchema = z.object({ minPaise: z.coerce.number().int().min(0).optional(), customerIds: z.array(z.coerce.number().int().positive()).optional() });
const testSchema = z.object({ toPhone: z.string().trim().regex(/^\d{10,15}$/, 'Enter a 10-digit mobile number') });

/** Messages & reminders: WhatsApp Cloud API with a manual (click-to-chat) fallback. */
export const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/messages/settings', { preHandler: app.requireAuth }, async () => publicMessagingSettings(app.db));
  app.put('/messages/settings', { schema: { body: messagingSettingsSchema }, preHandler: app.requirePermission('settings.write') }, async (req) => saveMessagingSettings(app.db, req.ctx!, req.body));
  app.get('/messages/status', { preHandler: app.requireAuth }, async () => messagingStatus(app.db));

  app.get('/messages', { schema: { querystring: outboxQuery }, preHandler: app.requireAuth }, async (req) => listOutbox(app.db, req.query));
  app.post('/messages', { schema: { body: sendMessageSchema }, preHandler: app.requirePermission('party.write') }, async (req, reply) => { reply.code(201); return queueMessage(app.db, req.ctx!, req.body); });
  app.post('/messages/test', { schema: { body: testSchema }, preHandler: app.requirePermission('settings.write') }, async (req, reply) => { reply.code(201); return queueTestMessage(app.db, req.ctx!, req.body.toPhone); });
  app.post('/messages/bill/:saleId', { schema: { params: z.object({ saleId: z.coerce.number().int().positive() }) }, preHandler: app.requireAuth }, async (req, reply) => { reply.code(201); return queueBillMessage(app.db, req.ctx!, req.params.saleId); });

  app.get('/messages/refills-due', { schema: { querystring: refillsQuery }, preHandler: app.requireAuth }, async (req) => refillsDue(app.db, req.query));
  app.post('/messages/refill-run', { preHandler: app.requirePermission('party.write') }, async (req) => runRefillReminders(app.db, req.ctx!));
  app.post('/messages/refill/:saleId', { schema: { params: z.object({ saleId: z.coerce.number().int().positive() }) }, preHandler: app.requirePermission('party.write') }, async (req, reply) => { reply.code(201); return queueRefillForSale(app.db, req.ctx!, req.params.saleId); });

  app.get('/messages/dues', { preHandler: app.requireAuth }, async () => duesList(app.db));
  app.post('/messages/dues-run', { schema: { body: duesRunSchema.optional() }, preHandler: app.requirePermission('party.write') }, async (req) => runDuesReminders(app.db, req.ctx!, req.body ?? {}));

  app.post('/messages/:id/retry', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => retryMessage(app.db, req.params.id));
  app.post('/messages/:id/mark-sent', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => markMessageSent(app.db, req.params.id));
  app.post('/messages/:id/cancel', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => cancelMessage(app.db, req.params.id));
};
