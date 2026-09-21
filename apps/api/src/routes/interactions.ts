import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { boolQuery, idParam, interactionCheckSchema, interactionRuleSchema, paginationQuery } from '@pharma/shared';
import { activeRules, checkForBill, deleteRule, listRules, saveRule } from '../services/interactions.js';

export const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/interactions/rules', { schema: { querystring: paginationQuery.extend({ severity: z.enum(['major', 'moderate', 'minor']).optional(), includeInactive: boolQuery }) }, preHandler: app.requireAuth }, async (req) => listRules(app.db, req.query));
  app.get('/interactions/rules/active', { preHandler: app.requireAuth }, async () => activeRules(app.db));
  app.post('/interactions/rules', { schema: { body: interactionRuleSchema }, preHandler: app.requirePermission('settings.write') }, async (req) => saveRule(app.db, req.ctx!, req.body));
  app.put('/interactions/rules/:id', { schema: { params: idParam, body: interactionRuleSchema }, preHandler: app.requirePermission('settings.write') }, async (req) => saveRule(app.db, req.ctx!, req.body, req.params.id));
  app.delete('/interactions/rules/:id', { schema: { params: idParam }, preHandler: app.requirePermission('settings.write') }, async (req) => { deleteRule(app.db, req.ctx!, req.params.id); return { ok: true }; });
  app.post('/interactions/check', { schema: { body: interactionCheckSchema }, preHandler: app.requireAuth }, async (req) => checkForBill(app.db, req.body.itemIds, req.body.customerId, req.body.historyDays));
};
