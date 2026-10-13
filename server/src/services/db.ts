import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const dataDir = path.resolve(import.meta.dirname, '../../data');
export const dbFile = process.env.SMARTPIM_DB ?? path.join(dataDir, 'smartpim.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  pos REAL NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  stock INTEGER,
  attributes TEXT NOT NULL DEFAULT '[]',
  sync_status TEXT NOT NULL DEFAULT 'never' CHECK (sync_status IN ('synced','modified','error','never')),
  last_synced_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS products_sku ON products (sku);
CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  ts TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  mode TEXT NOT NULL,
  ok INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  payload TEXT,
  error TEXT,
  before TEXT,
  reverted INTEGER NOT NULL DEFAULT 0,
  revert_of TEXT
);
CREATE INDEX IF NOT EXISTS sync_log_seq ON sync_log (seq DESC);
`);

// Runs fn inside one transaction: everything is saved, or nothing is.
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
