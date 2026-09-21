import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { batchSchema, batchStatusSchema, idParam, itemSchema, itemSearchQuery, openingStockRow, paginationQuery, stockAdjustmentSchema, boolQuery } from '@pharma/shared';
import { createItem, getItem, importItemsCsv, listManufacturers, listSalts, parseGenericString, searchItems, substitutes, updateItem } from '../services/catalog.js';
import { addOpeningStock, adjustStock, batchesForItem, getBatch, ledgerFor, listBatches, setBatchStatus, updateBatchDetails } from '../services/inventory.js';
import { linkGtin, resolveScan } from '../services/scan.js';
import { notFound } from '../lib/errors.js';

export const catalogRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/items', { schema: { querystring: itemSearchQuery }, preHandler: app.requireAuth }, async (req) => searchItems(app.db, req.query));
  app.post('/items', { schema: { body: itemSchema }, preHandler: app.requirePermission('item.write') }, async (req) => createItem(app.db, req.ctx!, req.body));
  app.get('/items/:id', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => { const it = getItem(app.db, req.params.id); if (!it) throw notFound('Item not found'); return it; });
  app.put('/items/:id', { schema: { params: idParam, body: itemSchema }, preHandler: app.requirePermission('item.write') }, async (req) => updateItem(app.db, req.ctx!, req.params.id, req.body));
  app.get('/items/:id/batches', { schema: { params: idParam, querystring: z.object({ includeEmpty: boolQuery }) }, preHandler: app.requireAuth }, async (req) => batchesForItem(app.db, req.params.id, req.query.includeEmpty));
  app.get('/items/:id/substitutes', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => substitutes(app.db, req.params.id));
  app.get('/items/:id/ledger', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => ledgerFor(app.db, { itemId: req.params.id }));
  app.post('/items/:id/link-gtin', { schema: { params: idParam, body: z.object({ gtin: z.string().min(8) }) }, preHandler: app.requirePermission('item.write') }, async (req) => linkGtin(app.db, req.params.id, req.body.gtin));
  app.post('/items/import', { preHandler: app.requirePermission('item.write') }, async (req) => {
    const file = await req.file();
    if (!file) throw notFound('Attach a CSV file');
    const csv = (await file.toBuffer()).toString('utf8');
    return importItemsCsv(app.db, req.ctx!, csv);
  });
  app.post('/items/parse-generic', { schema: { body: z.object({ text: z.string() }) }, preHandler: app.requireAuth }, async (req) => parseGenericString(req.body.text));
  app.get('/manufacturers', { preHandler: app.requireAuth }, async () => listManufacturers(app.db));
  app.get('/salts', { schema: { querystring: z.object({ q: z.string().optional() }) }, preHandler: app.requireAuth }, async (req) => listSalts(app.db, req.query.q));

  const batchQuery = paginationQuery.extend({ itemId: z.coerce.number().int().optional(), status: z.enum(['active', 'quarantined', 'returned', 'disposed']).optional(), supplierId: z.coerce.number().int().optional(), expiringWithinDays: z.coerce.number().int().optional(), expired: boolQuery, inStock: boolQuery });
  app.get('/batches', { schema: { querystring: batchQuery }, preHandler: app.requireAuth }, async (req) => listBatches(app.db, req.query));
  app.get('/batches/:id', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => { const b = getBatch(app.db, req.params.id); if (!b) throw notFound('Batch not found'); return b; });
  app.get('/batches/:id/ledger', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => ledgerFor(app.db, { batchId: req.params.id }));
  app.post('/batches/adjust', { schema: { body: stockAdjustmentSchema }, preHandler: app.requirePermission('stock.adjust') }, async (req) => adjustStock(app.db, req.ctx!, req.body));
  app.post('/batches/opening', { schema: { body: z.object({ rows: z.array(openingStockRow).min(1) }) }, preHandler: app.requirePermission('stock.adjust') }, async (req) => ({ batchIds: addOpeningStock(app.db, req.ctx!, req.body.rows.map((r) => ({ ...r, gtin: null, mfgDate: null, supplierId: null }))) }));
  app.post('/batches/:id/status', { schema: { params: idParam, body: batchStatusSchema }, preHandler: app.requirePermission('stock.adjust') }, async (req) => setBatchStatus(app.db, req.ctx!, req.params.id, req.body.status, req.body.note ?? null));
  app.put('/batches/:id', { schema: { params: idParam, body: batchSchema.pick({ expiryDate: true, mrpPaise: true, batchNo: true, mfgDate: true, gtin: true }).partial().extend({ reason: z.string().min(3) }) }, preHandler: app.requirePermission('stock.adjust') }, async (req) => { const { reason, ...patch } = req.body; return updateBatchDetails(app.db, req.ctx!, req.params.id, patch, reason); });

  app.post('/scan', { schema: { body: z.object({ raw: z.string().min(1) }) }, preHandler: app.requireAuth }, async (req) => resolveScan(app.db, req.body.raw));
};
