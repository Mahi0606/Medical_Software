import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { cancelDocSchema, idParam, paginationQuery, purchaseReturnSchema, purchaseSchema } from '@pharma/shared';
import { cancelPurchase, getPurchase, getPurchaseReturn, listPurchaseReturns, listPurchases, parsePurchaseCsv, postPurchase, postPurchaseReturn, previewPurchase } from '../services/purchase.js';
import { notFound } from '../lib/errors.js';

const listQ = paginationQuery.extend({ from: z.string().optional(), to: z.string().optional(), supplierId: z.coerce.number().int().optional() });

export const purchaseRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/purchases', { schema: { querystring: listQ }, preHandler: app.requireAuth }, async (req) => listPurchases(app.db, req.query));
  app.post('/purchases/preview', { schema: { body: purchaseSchema }, preHandler: app.requirePermission('purchase.create') }, async (req) => previewPurchase(app.db, req.body));
  app.post('/purchases', { schema: { body: purchaseSchema }, preHandler: app.requirePermission('purchase.create') }, async (req, reply) => { reply.status(201); return postPurchase(app.db, req.ctx!, req.body); });
  app.post('/purchases/import', { preHandler: app.requirePermission('purchase.create') }, async (req) => {
    const file = await req.file();
    if (!file) throw notFound('Attach a CSV file');
    return parsePurchaseCsv(app.db, (await file.toBuffer()).toString('utf8'));
  });
  app.get('/purchases/:id', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => getPurchase(app.db, req.params.id));
  app.post('/purchases/:id/cancel', { schema: { params: idParam, body: cancelDocSchema }, preHandler: app.requirePermission('purchase.create') }, async (req) => cancelPurchase(app.db, req.ctx!, req.params.id, req.body.reason));

  app.get('/purchase-returns', { schema: { querystring: listQ }, preHandler: app.requireAuth }, async (req) => listPurchaseReturns(app.db, req.query));
  app.post('/purchase-returns', { schema: { body: purchaseReturnSchema }, preHandler: app.requirePermission('purchase.return') }, async (req, reply) => { reply.status(201); return postPurchaseReturn(app.db, req.ctx!, req.body); });
  app.get('/purchase-returns/:id', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => getPurchaseReturn(app.db, req.params.id));
};
