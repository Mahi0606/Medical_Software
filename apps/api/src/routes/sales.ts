import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { cancelDocSchema, idParam, paginationQuery, saleHoldSchema, saleReturnSchema, saleSchema } from '@pharma/shared';
import { DATA_DIR, schema } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { randomToken } from '../lib/password.js';
import { cancelSale, deleteHold, getSale, getSaleReturn, listHolds, listSales, postSaleAndNotify, postSaleReturn, previewSale, saveHold } from '../services/sales.js';
import { getStore } from '../services/store.js';

const listQ = paginationQuery.extend({ from: z.string().optional(), to: z.string().optional(), customerId: z.coerce.number().int().optional(), status: z.string().optional() });
const UPLOAD_DIR = join(DATA_DIR, 'uploads');

export const salesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/sales', { schema: { querystring: listQ }, preHandler: app.requireAuth }, async (req) => listSales(app.db, req.query));
  app.post('/sales/preview', { schema: { body: saleSchema }, preHandler: app.requirePermission('sale.create') }, async (req) => previewSale(app.db, req.ctx!, req.body, app.pharmacistOnDuty()));
  app.post('/sales', { schema: { body: saleSchema }, preHandler: app.requirePermission('sale.create') }, async (req, reply) => {
    const result = postSaleAndNotify(app.db, req.ctx!, req.body, app.pharmacistOnDuty());
    reply.status(result.duplicate ? 200 : 201);
    return result;
  });
  app.get('/sales/:id', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => getSale(app.db, req.params.id));
  app.get('/sales/:id/print', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => ({ sale: getSale(app.db, req.params.id), store: getStore(app.db) }));
  app.post('/sales/:id/cancel', { schema: { params: idParam, body: cancelDocSchema }, preHandler: app.requirePermission('sale.cancel') }, async (req) => cancelSale(app.db, req.ctx!, req.params.id, req.body.reason));

  app.post('/sale-returns', { schema: { body: saleReturnSchema }, preHandler: app.requirePermission('sale.return') }, async (req, reply) => { reply.status(201); return postSaleReturn(app.db, req.ctx!, req.body); });
  app.get('/sale-returns/:id', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req) => ({ ...getSaleReturn(app.db, req.params.id), store: getStore(app.db) }));

  app.get('/holds', { preHandler: app.requireAuth }, async () => listHolds(app.db));
  app.put('/holds', { schema: { body: saleHoldSchema }, preHandler: app.requirePermission('sale.create') }, async (req) => saveHold(app.db, req.ctx!, req.body.clientRef, req.body.label ?? null, req.body.payload));
  app.delete('/holds/:clientRef', { schema: { params: z.object({ clientRef: z.string() }) }, preHandler: app.requirePermission('sale.create') }, async (req) => { deleteHold(app.db, req.params.clientRef); return { ok: true }; });

  app.post('/uploads/prescription', { preHandler: app.requirePermission('sale.create') }, async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('Attach an image or PDF');
    if (!/^(image\/(jpeg|png|webp|heic)|application\/pdf)$/.test(file.mimetype)) throw badRequest('Only JPG, PNG, WEBP or PDF files are accepted');
    const ym = new Date().toISOString().slice(0, 7);
    const dir = join(UPLOAD_DIR, ym);
    mkdirSync(dir, { recursive: true });
    const name = `${randomToken(12)}${extname(file.filename || '') || (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg')}`;
    const path = join(dir, name);
    await pipeline(file.file, createWriteStream(path));
    const size = (await import('node:fs/promises')).stat(path).then((s) => s.size);
    const row = app.db.insert(schema.prescriptionFile).values({ filename: file.filename || name, mime: file.mimetype, sizeBytes: await size, path, uploadedBy: req.ctx!.userId }).returning().get();
    return { id: row.id, filename: row.filename, mime: row.mime, sizeBytes: row.sizeBytes };
  });
  app.get('/uploads/prescription/:id', { schema: { params: idParam }, preHandler: app.requireAuth }, async (req, reply) => {
    const row = app.db.select().from(schema.prescriptionFile).where(eq(schema.prescriptionFile.id, req.params.id)).get();
    if (!row || !existsSync(row.path)) throw notFound('File not found');
    const { createReadStream } = await import('node:fs');
    reply.type(row.mime).header('Cache-Control', 'private, max-age=3600');
    return reply.send(createReadStream(row.path));
  });
};
