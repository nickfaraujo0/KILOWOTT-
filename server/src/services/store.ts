import type { Product } from '../../../shared/quality.ts';
import fs from 'node:fs';
import path from 'node:path';
import { db, tx, dataDir, dbFile } from './db.ts';

type Row = Record<string, any>;
const toProduct = (r: Row): Product => ({
  id: r.id, name: r.name, sku: r.sku, description: r.description, shortDescription: r.short_description, price: r.price, category: r.category,
  attributes: JSON.parse(r.attributes), imageUrl: r.image_url ?? undefined, stock: r.stock ?? null, syncStatus: r.sync_status,
  ...(r.last_synced_at ? { lastSyncedAt: r.last_synced_at } : {}),
});

const UPSERT = `INSERT INTO products (id, pos, sku, name, price, category, description, short_description, image_url, stock, attributes, sync_status, last_synced_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(id) DO UPDATE SET sku=excluded.sku, name=excluded.name, price=excluded.price, category=excluded.category, description=excluded.description,
    short_description=excluded.short_description, image_url=excluded.image_url, stock=excluded.stock, attributes=excluded.attributes,
    sync_status=excluded.sync_status, last_synced_at=excluded.last_synced_at, updated_at=excluded.updated_at`;

export function insertProductRow(p: Product, pos: number) {
  db.prepare(UPSERT).run(p.id, pos, p.sku ?? '', p.name ?? '', String(p.price ?? ''), p.category ?? '', p.description ?? '', p.shortDescription ?? '', p.imageUrl ?? null,
    p.stock == null ? null : Number(p.stock), JSON.stringify(p.attributes ?? []), p.syncStatus ?? 'never', p.lastSyncedAt ?? null);
}

export const loadProducts = (): Product[] => (db.prepare('SELECT * FROM products ORDER BY pos, id').all() as Row[]).map(toProduct);
export const getProduct = (id: number): Product | undefined => { const r = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Row | undefined; return r && toProduct(r); };

// Saves one product, keeping its position. New products go to the top of the list.
export function saveProduct(p: Product) {
  const cur = db.prepare('SELECT pos FROM products WHERE id = ?').get(p.id) as Row | undefined;
  const top = (db.prepare('SELECT MIN(pos) AS m FROM products').get() as Row).m;
  insertProductRow(p, cur ? cur.pos : (top ?? 0) - 1);
}
export const saveProducts = (list: Product[]) => tx(() => list.forEach(saveProduct));
export const deleteProduct = (id: number) => { db.prepare('DELETE FROM products WHERE id = ?').run(id); };
// Replaces the whole catalog (import, demo data, reset), keeping the given order.
export function replaceProducts(list: Product[]) {
  tx(() => { db.exec('DELETE FROM products'); list.forEach((p, i) => insertProductRow(p, i)); });
}

// ---- sync log ----
export type SyncEntry = {
  id: string; ts: string; productId: number; sku: string; name: string;
  action: 'create' | 'update' | 'revert' | 'simulated'; mode: 'mock' | 'live' | 'none';
  ok: boolean; latencyMs: number; payload: unknown; error?: string;
  before?: Record<string, unknown>; // store values of the pushed fields, so the push can be reverted
  reverted?: boolean; revertOf?: string;
};
const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));
export const toEntry = (r: Row): SyncEntry => ({
  id: r.id, ts: r.ts, productId: r.product_id, sku: r.sku, name: r.name, action: r.action, mode: r.mode, ok: !!r.ok, latencyMs: r.latency_ms,
  payload: r.payload ? JSON.parse(r.payload) : null, ...(r.error ? { error: r.error } : {}), ...(r.before ? { before: JSON.parse(r.before) } : {}),
  ...(r.reverted ? { reverted: true } : {}), ...(r.revert_of ? { revertOf: r.revert_of } : {}),
});
export function insertLogRow(e: Partial<SyncEntry> & Omit<SyncEntry, 'id' | 'ts'>, seq: number) {
  db.prepare('INSERT OR REPLACE INTO sync_log (id, seq, ts, product_id, sku, name, action, mode, ok, latency_ms, payload, error, before, reverted, revert_of) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(e.id ?? Math.random().toString(36).slice(2, 10), seq, e.ts ?? new Date().toISOString(), e.productId, e.sku ?? '', e.name ?? '', e.action, e.mode ?? 'none', e.ok ? 1 : 0, e.latencyMs ?? 0,
      json(e.payload), e.error ?? null, json(e.before), e.reverted ? 1 : 0, e.revertOf ?? null);
}

// One-time import of the old JSON files, the first time the database is created.
if ((db.prepare('PRAGMA user_version').get() as Row).user_version < 1) {
  const readJson = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')); } catch { return null; } };
  const oldProducts = readJson('products.json'); const oldLog = readJson('sync-log.json');
  tx(() => {
    if (Array.isArray(oldProducts)) oldProducts.forEach((p: any, i: number) => insertProductRow(p, i));
    if (Array.isArray(oldLog)) [...oldLog].reverse().forEach((e: any, i: number) => insertLogRow(e, i + 1));
    db.exec('PRAGMA user_version = 1');
  });
  if (oldProducts || oldLog) console.log(`PawPIM: imported ${oldProducts?.length ?? 0} products and ${oldLog?.length ?? 0} log entries from JSON into ${path.basename(dbFile)}`);
}
