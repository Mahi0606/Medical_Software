import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParam, labelJobSchema, labelTemplateSchema, paginationQuery, todayIST, boolQuery } from '@pharma/shared';
import { toCsv } from '../lib/csv.js';
import { dashboard } from '../services/dashboard.js';
import { buildLabelJob, deleteTemplate, listTemplates, recentJobs, saveTemplate } from '../services/labels.js';
import { listRegister, registerFullForPrint, registerFys } from '../services/registers.js';
import { auditList, dayBook, deadStock, expiryReport, gstr1, gstr3b, outstanding, profit, purchaseRegister, salesRegister, scheduleSales, stockSummary } from '../services/reports.js';
import { getStore } from '../services/store.js';

const range = z.object({ from: z.string().optional(), to: z.string().optional() });
const withRange = (q: { from?: string; to?: string }) => { const to = q.to ?? todayIST(); const from = q.from ?? to.slice(0, 8) + '01'; return { from, to }; };

export const miscRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/dashboard', { preHandler: app.requireAuth }, async () => dashboard(app.db));

  // Labels
  app.get('/labels/templates', { preHandler: app.requireAuth }, async () => listTemplates(app.db));
  app.post('/labels/templates', { schema: { body: labelTemplateSchema }, preHandler: app.requirePermission('settings.write') }, async (req) => saveTemplate(app.db, req.ctx!, req.body));
  app.put('/labels/templates/:id', { schema: { params: idParam, body: labelTemplateSchema }, preHandler: app.requirePermission('settings.write') }, async (req) => saveTemplate(app.db, req.ctx!, req.body, req.params.id));
  app.delete('/labels/templates/:id', { schema: { params: idParam }, preHandler: app.requirePermission('settings.write') }, async (req) => { deleteTemplate(app.db, req.ctx!, req.params.id); return { ok: true }; });
  app.post('/labels/jobs', { schema: { body: labelJobSchema }, preHandler: app.requirePermission('label.print') }, async (req) => buildLabelJob(app.db, req.ctx!, req.body));
  app.get('/labels/jobs', { preHandler: app.requireAuth }, async () => recentJobs(app.db));

  // Registers
  const regQ = paginationQuery.extend({ register: z.enum(['RX', 'H1', 'X']), fy: z.string().optional(), from: z.string().optional(), to: z.string().optional() });
  app.get('/registers', { schema: { querystring: regQ }, preHandler: app.requirePermission('register.view') }, async (req) => ({ ...listRegister(app.db, req.query), fys: registerFys(app.db) }));
  app.get('/registers/print', { schema: { querystring: z.object({ register: z.enum(['RX', 'H1', 'X']), fy: z.string() }) }, preHandler: app.requirePermission('register.view') }, async (req) => ({ rows: registerFullForPrint(app.db, req.query.register, req.query.fy), store: getStore(app.db) }));
  app.get('/registers/export', { schema: { querystring: z.object({ register: z.enum(['RX', 'H1', 'X']), fy: z.string() }) }, preHandler: app.requirePermission('register.view') }, async (req, reply) => {
    const rows = registerFullForPrint(app.db, req.query.register, req.query.fy);
    reply.type('text/csv').header('Content-Disposition', `attachment; filename="register-${req.query.register}-${req.query.fy}.csv"`);
    return toCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'serialNo', label: 'S.No' }, { key: 'date', label: 'Date' }, { key: 'invoiceNo', label: 'Bill No' }, { key: 'doctorName', label: 'Prescriber' }, { key: 'doctorRegNo', label: 'Prescriber Reg No' },
      { key: 'patientName', label: 'Patient' }, { key: 'patientAddress', label: 'Patient Address' }, { key: 'itemName', label: 'Drug' }, { key: 'genericName', label: 'Composition' }, { key: 'manufacturer', label: 'Manufacturer' },
      { key: 'batchNo', label: 'Batch' }, { key: 'expiryDate', label: 'Expiry' }, { key: 'qtyText', label: 'Quantity' }, { key: 'pharmacistName', label: 'Pharmacist' }, { key: 'pharmacistRegNo', label: 'Pharmacist Reg No' }, { key: 'saleStatus', label: 'Bill status' },
    ]);
  });

  // Reports
  app.get('/reports/day-book', { schema: { querystring: z.object({ date: z.string().optional() }) }, preHandler: app.requirePermission('report.view') }, async (req) => dayBook(app.db, req.query.date ?? todayIST()));
  app.get('/reports/sales-register', { schema: { querystring: range }, preHandler: app.requirePermission('report.view') }, async (req) => { const r = withRange(req.query); return salesRegister(app.db, r.from, r.to); });
  app.get('/reports/purchase-register', { schema: { querystring: range }, preHandler: app.requirePermission('report.view') }, async (req) => { const r = withRange(req.query); return purchaseRegister(app.db, r.from, r.to); });
  app.get('/reports/gstr1', { schema: { querystring: range }, preHandler: app.requirePermission('report.finance') }, async (req) => { const r = withRange(req.query); return gstr1(app.db, r.from, r.to); });
  app.get('/reports/gstr3b', { schema: { querystring: range }, preHandler: app.requirePermission('report.finance') }, async (req) => { const r = withRange(req.query); return gstr3b(app.db, r.from, r.to); });
  app.get('/reports/stock', { schema: { querystring: z.object({ lowOnly: boolQuery, zeroOnly: boolQuery, q: z.string().optional() }) }, preHandler: app.requirePermission('report.view') }, async (req) => stockSummary(app.db, req.query));
  app.get('/reports/expiry', { schema: { querystring: z.object({ days: z.coerce.number().int().min(0).max(730).default(90), includeExpired: boolQuery.default(true) }) }, preHandler: app.requireAuth }, async (req) => expiryReport(app.db, req.query.days, req.query.includeExpired));
  app.get('/reports/dead-stock', { schema: { querystring: z.object({ days: z.coerce.number().int().min(7).max(730).default(90) }) }, preHandler: app.requirePermission('report.view') }, async (req) => deadStock(app.db, req.query.days));
  app.get('/reports/profit', { schema: { querystring: range.extend({ group: z.enum(['item', 'salt', 'supplier', 'customer', 'day', 'user', 'doctor']).default('item') }) }, preHandler: app.requirePermission('report.finance') }, async (req) => { const r = withRange(req.query); return profit(app.db, r.from, r.to, req.query.group); });
  app.get('/reports/outstanding', { preHandler: app.requirePermission('report.view') }, async () => outstanding(app.db));
  app.get('/reports/schedule-sales', { schema: { querystring: range }, preHandler: app.requirePermission('report.view') }, async (req) => { const r = withRange(req.query); return scheduleSales(app.db, r.from, r.to); });
  app.post('/reports/export', { schema: { body: z.object({ filename: z.string().min(1), rows: z.array(z.record(z.unknown())), columns: z.array(z.object({ key: z.string(), label: z.string(), paise: z.boolean().optional() })).optional() }) }, preHandler: app.requireAuth }, async (req, reply) => {
    reply.type('text/csv').header('Content-Disposition', `attachment; filename="${req.body.filename.replace(/[^a-z0-9._-]/gi, '_')}.csv"`);
    return toCsv(req.body.rows, req.body.columns);
  });

  // Audit
  app.get('/audit', { schema: { querystring: paginationQuery.extend({ entity: z.string().optional(), userId: z.coerce.number().int().optional(), from: z.string().optional(), to: z.string().optional() }) }, preHandler: app.requirePermission('audit.view') }, async (req) => auditList(app.db, req.query));
};
