import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { cancelDocSchema, idParam, isoDate, poListQuery, poMarkSentSchema, purchaseOrderSchema, reorderQuery } from '@pharma/shared';
import { cancelPurchaseOrder, createPurchaseOrder, getPurchaseOrder, listPurchaseOrders, markPurchaseOrderSent, printPurchaseOrder, reorderSuggestions, updatePurchaseOrder } from '../services/purchase-orders.js';

const listQ = poListQuery.extend({ from: isoDate.optional(), to: isoDate.optional() });

/** Phase 2 – reorder suggestions and purchase orders. */
export const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/reorder', { schema: { querystring: reorderQuery }, preHandler: app.requireAuth }, async (req) => reorderSuggestions(app.db, req.query));

  app.get('/purchase-orders', { schema: { querystring: listQ }, preHandler: app.requireAuth }, async (req) => listPurchaseOrders(app.db, req.query));
  app.post('/purchase-orders', { schema: { body: purchaseOrderSchema }, preHandler: app.requirePermission('purchase.create') }, async (req, reply) => { reply.status(201); return createPurchaseOrder(app.db, req.ctx!, req.body); });
  app.get('/purchase-orders/:id', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => getPurchaseOrder(app.db, req.params.id));
  app.put('/purchase-orders/:id', { schema: { params: idParam, body: purchaseOrderSchema }, preHandler: app.requirePermission('purchase.create') }, async (req) => updatePurchaseOrder(app.db, req.ctx!, req.params.id, req.body));
  app.post('/purchase-orders/:id/send', { schema: { params: idParam, body: poMarkSentSchema }, preHandler: app.requirePermission('purchase.create') }, async (req) => markPurchaseOrderSent(app.db, req.ctx!, req.params.id, req.body.via));
  app.post('/purchase-orders/:id/cancel', { schema: { params: idParam, body: cancelDocSchema }, preHandler: app.requirePermission('purchase.create') }, async (req) => cancelPurchaseOrder(app.db, req.ctx!, req.params.id, req.body.reason));
  app.get('/purchase-orders/:id/print', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => printPurchaseOrder(app.db, req.params.id));
};
