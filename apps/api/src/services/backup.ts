import { desc } from 'drizzle-orm';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { DB_PATH, schema } from '../db/index.js';
import { dirname } from 'node:path';
import { audit } from '../lib/audit.js';
import { SYSTEM_CTX, type Ctx } from '../lib/ctx.js';

/** Backups sit next to the database file unless PHARMA_BACKUP_DIR says otherwise. */
export const BACKUP_DIR = resolve(process.env.PHARMA_BACKUP_DIR ?? join(dirname(DB_PATH), 'backups'));
const KEEP_DAILY = 30;

export async function runBackup(app: FastifyInstance, ctx: Ctx = SYSTEM_CTX, triggeredBy = 'scheduler') {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(BACKUP_DIR, `pharmacy-${stamp}.db`);
  try {
    await app.sqlite.backup(path);
    const size = statSync(path).size;
    app.db.insert(schema.backupRun).values({ path, sizeBytes: size, ok: true, triggeredBy }).run();
    audit(app.db, ctx, { entity: 'backup', entityId: path, action: 'backup', after: { sizeBytes: size, triggeredBy } });
    prune();
    return { ok: true, path, sizeBytes: size };
  } catch (err) {
    app.db.insert(schema.backupRun).values({ path, sizeBytes: 0, ok: false, note: String(err), triggeredBy }).run();
    app.log.error({ err }, 'backup failed');
    return { ok: false, path, sizeBytes: 0, error: String(err) };
  }
}

function prune() {
  const files = readdirSync(BACKUP_DIR).filter((f) => f.startsWith('pharmacy-') && f.endsWith('.db')).sort();
  while (files.length > KEEP_DAILY) {
    const f = files.shift()!;
    try { unlinkSync(join(BACKUP_DIR, f)); } catch { /* ignore */ }
  }
}

export function listBackups(app: FastifyInstance) {
  const runs = app.db.select().from(schema.backupRun).orderBy(desc(schema.backupRun.id)).limit(50).all();
  return runs.map((r) => ({ ...r, exists: existsSync(r.path) }));
}

/** Nightly backup around 02:00 IST, checked every 10 minutes; also one at startup if none today. */
export function startBackupScheduler(app: FastifyInstance) {
  const tick = async () => {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
    const hour = ist.getUTCHours();
    const today = ist.toISOString().slice(0, 10);
    const last = app.db.select().from(schema.backupRun).orderBy(desc(schema.backupRun.id)).limit(1).get();
    const lastDay = last ? new Date(new Date(last.at).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : null;
    if (lastDay !== today && (hour >= 2 || !last)) await runBackup(app);
  };
  setTimeout(() => void tick(), 15_000).unref();
  setInterval(() => void tick(), 10 * 60_000).unref();
}
