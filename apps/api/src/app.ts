import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { openDatabase, type DB } from './db/index.js';
import authPlugin from './plugins/auth.js';
import { AppError } from './lib/errors.js';
import { registerRoutes } from './routes/index.js';

export interface BuildOptions {
  dbPath?: string;
  logger?: boolean;
  webDist?: string;
}

export function buildApp(opts: BuildOptions = {}) {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info', transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } },
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const { db, sqlite } = openDatabase(opts.dbPath);
  app.decorate('db', db as DB);
  app.decorate('sqlite', sqlite);
  app.addHook('onClose', async () => { sqlite.close(); });

  app.register(cookie, { secret: process.env.COOKIE_SECRET ?? 'dev-cookie-secret-change-me' });
  app.register(cors, { origin: (origin, cb) => cb(null, true), credentials: true });
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  app.register(authPlugin);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: err.code, message: err.message, details: err.details ?? null });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const fields = err.validation.map((v) => ({ path: v.instancePath.replace(/^\//, '').replace(/\//g, '.') || (v.params as { issue?: { path?: (string | number)[] } })?.issue?.path?.join('.') || '', message: v.message ?? 'Invalid value' }));
      return reply.status(400).send({ error: 'validation', message: 'Please correct the highlighted fields', details: fields });
    }
    if (err instanceof ZodError) {
      const fields = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return reply.status(400).send({ error: 'validation', message: 'Please correct the highlighted fields', details: fields });
    }
    if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return reply.status(409).send({ error: 'conflict', message: 'A record with the same key already exists', details: (err as Error).message });
    }
    if ((err as { code?: string }).code?.startsWith?.('SQLITE_CONSTRAINT')) {
      return reply.status(409).send({ error: 'conflict', message: (err as Error).message, details: null });
    }
    if ((err as { statusCode?: number }).statusCode && (err as { statusCode: number }).statusCode < 500) {
      return reply.status((err as { statusCode: number }).statusCode).send({ error: 'request', message: (err as Error).message, details: null });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Something went wrong on the server. The error has been logged.', details: null });
  });

  app.register(registerRoutes, { prefix: '/api' });

  const webDist = opts.webDist ?? resolve(process.cwd(), '../web/dist');
  if (existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'not_found', message: 'Route not found', details: null });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
