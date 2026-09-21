import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exportRangeQuery } from '@pharma/shared';
import { analytics } from '../services/analytics.js';
import { einvoiceCheck, einvoiceJson, getTallySettings, gstr1Json, saveTallySettings, tallySettingsSchema, tallyXml } from '../services/exports.js';

const attach = (filename: string) => `attachment; filename="${filename.replace(/[^a-z0-9._-]/gi, '_')}"`;

/** GST & Tally exports plus the owner analytics feed. */
export const routes: FastifyPluginAsyncZod = async (app) => {
  app.get('/exports/tally', { schema: { querystring: exportRangeQuery.extend({ kind: z.enum(['sales', 'purchases', 'both']).default('both') }) }, preHandler: app.requirePermission('report.finance') }, async (req, reply) => {
    const { from, to, kind } = req.query;
    const { xml, counts } = tallyXml(app.db, from, to, kind);
    reply.type('application/xml; charset=utf-8').header('Content-Disposition', attach(`tally-${kind}-${from}-${to}.xml`)).header('X-Voucher-Counts', JSON.stringify(counts));
    return xml;
  });
  app.get('/exports/tally-settings', { preHandler: app.requirePermission('report.finance') }, async () => getTallySettings(app.db));
  app.put('/exports/tally-settings', { schema: { body: tallySettingsSchema }, preHandler: app.requirePermission('settings.write') }, async (req) => saveTallySettings(app.db, req.ctx!, req.body));

  app.get('/exports/einvoice', { schema: { querystring: exportRangeQuery }, preHandler: app.requirePermission('report.finance') }, async (req, reply) => {
    const { from, to } = req.query;
    reply.type('application/json; charset=utf-8').header('Content-Disposition', attach(`einvoice-${from}-${to}.json`));
    return JSON.stringify(einvoiceJson(app.db, from, to), null, 2);
  });
  app.get('/exports/einvoice-check', { schema: { querystring: exportRangeQuery }, preHandler: app.requirePermission('report.finance') }, async (req) => einvoiceCheck(app.db, req.query.from, req.query.to));

  app.get('/exports/gstr1-json', { schema: { querystring: exportRangeQuery }, preHandler: app.requirePermission('report.finance') }, async (req, reply) => {
    const { from, to } = req.query;
    reply.type('application/json; charset=utf-8').header('Content-Disposition', attach(`gstr1-${from}-${to}.json`));
    return JSON.stringify(gstr1Json(app.db, from, to), null, 2);
  });

  app.get('/reports/analytics', { schema: { querystring: z.object({ months: z.coerce.number().int().min(3).max(36).default(12) }) }, preHandler: app.requirePermission('report.finance') }, async (req) => analytics(app.db, req.query.months));
};
