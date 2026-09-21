import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export type DB = BetterSQLite3Database<typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(process.env.PHARMA_DATA_DIR ?? resolve(here, '../../../../data'));
export const DB_PATH = process.env.PHARMA_DB_PATH ?? resolve(DATA_DIR, 'pharmacy.db');
const MIGRATIONS_DIR = resolve(process.env.PHARMA_MIGRATIONS_DIR ?? resolve(here, '../../drizzle'));

const APPEND_ONLY_TABLES = ['audit_log', 'stock_ledger', 'rx_register'];

export function openDatabase(path: string = DB_PATH): { db: DB; sqlite: Database.Database } {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  installGuards(sqlite);
  return { db, sqlite };
}

/** Append-only guarantees (CGST Rule 56(8); Drugs Rules registers). */
function installGuards(sqlite: Database.Database) {
  for (const t of APPEND_ONLY_TABLES) {
    sqlite.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;`);
    sqlite.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;`);
  }
  // Posted documents may not be deleted; they are cancelled with a reversal instead.
  for (const t of ['sale', 'purchase', 'purchase_return', 'sale_return']) {
    sqlite.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_no_delete_posted BEFORE DELETE ON ${t} WHEN OLD.status <> 'draft' BEGIN SELECT RAISE(ABORT, 'posted ${t} cannot be deleted'); END;`);
  }
  sqlite.exec(`INSERT OR IGNORE INTO branch (id, code, name) VALUES (1, 'MAIN', 'Main store');`);
  sqlite.exec(`INSERT OR IGNORE INTO store (id, name) VALUES (1, 'My Pharmacy');`);
}

export { schema };
