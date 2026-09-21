import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import { listBackups, runBackup } from '../services/backup.js';
import { notFound } from '../lib/errors.js';
import { schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export const backupRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/backups', { preHandler: app.requirePermission('backup.run') }, async () => listBackups(app));
  app.post('/backups', { preHandler: app.requirePermission('backup.run') }, async (req) => runBackup(app, req.ctx!, req.ctx!.username));
  app.get('/backups/:id/download', { schema: { params: z.object({ id: z.coerce.number().int() }) }, preHandler: app.requirePermission('backup.run') }, async (req, reply) => {
    const run = app.db.select().from(schema.backupRun).where(eq(schema.backupRun.id, req.params.id)).get();
    if (!run || !existsSync(run.path)) throw notFound('Backup file not found');
    reply.header('Content-Disposition', `attachment; filename="${basename(run.path)}"`).type('application/octet-stream');
    return reply.send(createReadStream(run.path));
  });
};
