import express, { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { scoreProduct, type Product, type Suggestion } from '../../../shared/quality.ts';
import { loadProducts, getProduct, saveProduct, saveProducts, deleteProduct, replaceProducts } from '../services/store.ts';
import { getWooProduct, getWooProducts, pushToWoo, createInWoo, storeMode, mockStoreUrl, wooConfigured, getWooCategories, getWooOrders, type PushFields } from '../services/woocommerce.ts';
import { addLog, clearLog, readLog, markReverted } from '../services/synclog.ts';
import { toCsv, parseCsv, textToAttrs, unsafe } from '../services/csv.ts';
import { productSvg } from '../../../shared/productImage.ts';
import { aiConfigured, cliMode, suggest, reviewStore } from '../services/claude.ts';
import { demoSuggestions } from '../services/demo.ts';
import { computeAnalytics } from '../services/analytics.ts';

export const api = Router();
const withScore = (p: Product) => ({ ...p, quality: scoreProduct(p) });
const wrap = (fn: (req: any, res: any) => Promise<void>) => (req: any, res: any) =>
  fn(req, res).catch((e) => res.status(502).json({ error: e.message }));

api.get('/health', (_q, r) => r.json({ ok: true }));

api.get('/integrations/status', wrap(async (_q, res) => {
  const out: any = { woocommerce: { configured: wooConfigured(), ok: false }, anthropic: { configured: aiConfigured(), provider: cliMode() ? 'claude-cli' : 'api' } };
  if (out.woocommerce.configured) {
    try {
      await getWooCategories(); out.woocommerce.ok = true;
      const root = await fetch(`${process.env.WOOCOMMERCE_STORE_URL!.replace(/\/$/, '')}/wp-json`).then((r) => r.json()).catch(() => ({}));
      out.woocommerce.mock = (root as any).mock === true;
      out.woocommerce.url = process.env.WOOCOMMERCE_STORE_URL!.replace(/\/$/, '');
    } catch (e: any) { out.woocommerce.error = e.message; }
  }
  res.json(out);
}));

// Import merges instead of wiping: products with unsynced local edits (and brand-new local products) are kept.
api.post('/products/import', wrap(async (_q, res) => {
  const live = await getWooProducts();
  const local = loadProducts();
  const keep = local.filter((p) => p.syncStatus === 'modified' || p.syncStatus === 'error' || p.id < 0 && p.id > -2_000_000_000 || p.id >= 9000);
  const keptIds = new Set(keep.filter((p) => p.id > 0 && p.id < 9000).map((p) => p.id));
  const merged = [...live.filter((p) => !keptIds.has(p.id)), ...keep.filter((p) => p.id < 9000)];
  const had = new Map(local.map((p) => [p.id, p]));
  const summary = {
    added: live.filter((p) => !had.has(p.id)).length,
    updated: live.filter((p) => had.has(p.id) && !keptIds.has(p.id)).length,
    keptLocalEdits: keptIds.size,
    keptNew: keep.filter((p) => p.id < 0).length,
    removed: local.filter((p) => p.id > 0 && p.id < 9000 && !live.some((l) => l.id === p.id) && !keptIds.has(p.id)).length,
  };
  replaceProducts(merged);
  res.json({ products: merged.map(withScore), summary });
}));

// Compares every synced product with the live store.
api.get('/sync-check', wrap(async (_q, res) => {
  const live = await getWooProducts();
  const liveById = new Map(live.map((p) => [p.id, p]));
  const norm = (p: Product) => JSON.stringify([p.name, p.sku, p.price, p.category, p.description, p.shortDescription, [...p.attributes].map((a) => `${a.name.toLowerCase()}=${a.value}`).sort(), p.stock ?? null]);
  const items = loadProducts().filter((p) => p.id < 9000).map((p) => {
    const l = liveById.get(p.id);
    let state: 'in-sync' | 'local-changes' | 'store-changed' | 'not-in-store' | 'new-local' = 'in-sync';
    if (p.id < 0) state = 'new-local';
    else if (!l) state = 'not-in-store';
    else if (norm(p) !== norm(l)) state = p.syncStatus === 'modified' || p.syncStatus === 'error' ? 'local-changes' : 'store-changed';
    return { id: p.id, name: p.name, sku: p.sku, state };
  });
  const knownIds = new Set(loadProducts().map((p) => p.id));
  const newInStore = live.filter((p) => !knownIds.has(p.id)).map((p) => ({ id: p.id, name: p.name, sku: p.sku, state: 'new-in-store' as const }));
  res.json({ checkedAt: new Date().toISOString(), items: [...items, ...newInStore] });
}));

api.get('/analytics', wrap(async (req, res) => {
  const days = [7, 30, 60].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  if (!wooConfigured()) { res.status(400).json({ error: 'WooCommerce is not configured, so there are no orders to analyse.' }); return; }
  const after = new Date(); after.setDate(after.getDate() - days * 2 - 1);
  const orders = await getWooOrders(after.toISOString());
  res.json({ ...computeAnalytics(orders, loadProducts().filter((p) => p.id > 0 && p.id < 9000), days), mock: (await storeMode()) === 'mock' });
}));

// Delete a product that only exists locally (never created in the store).
api.delete('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id >= 0 && id < 9000) { res.status(400).json({ error: 'Only products that have not been created in the store can be deleted here.' }); return; }
  if (!getProduct(id)) { res.status(404).json({ error: 'Not found' }); return; }
  deleteProduct(id);
  res.json({ ok: true });
});

const CATALOG = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../shared/catalog.json'), 'utf8')) as { products: any[] };
const DEMO: Product[] = [0, 1, 2, 13].map((i, n) => {
  const c = CATALOG.products[i];
  return { id: 9001 + n, name: c.name, sku: c.sku, price: c.price, category: c.category, description: c.description, shortDescription: c.shortDescription,
    attributes: Object.entries(c.attributes).map(([name, value]) => ({ name, value: String(value) })), imageUrl: `/api/img/${c.kind}.jpg`, stock: c.stock ?? null, syncStatus: 'never' as const };
});
// Demo products are local-only sample data (ids >= 9000); they are never sent to WooCommerce.
api.post('/products/demo', (_q, res) => { replaceProducts(DEMO); res.json(DEMO.map(withScore)); });

api.get('/products/export.csv', (_q, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pawpim-catalog-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(loadProducts().filter((p) => p.id < 9000)));
});

// CSV import. Matches rows to products by SKU (then id). Blank cells leave the product's value unchanged.
// ?dryRun=1 returns the preview without saving.
api.post('/products/import-csv', express.text({ type: '*/*', limit: '5mb' }), (req, res) => {
  let table: string[][];
  try { table = parseCsv(typeof req.body === 'string' ? req.body : ''); } catch (e: any) { res.status(400).json({ error: e.message }); return; }
  if (table.length < 2) { res.status(400).json({ error: 'The CSV needs a header row and at least one product row.' }); return; }
  if (table.length > 2001) { res.status(400).json({ error: 'Import up to 2000 products at a time.' }); return; }
  const head = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const col = (n: string) => head.indexOf(n);
  if (col('sku') < 0 && col('id') < 0) { res.status(400).json({ error: 'The CSV needs a "sku" column (or "id") so rows can be matched to products.' }); return; }
  const known = ['sku', 'name', 'price', 'category', 'stock', 'description', 'short_description', 'image_url', 'attributes', 'id'];
  const ignored = head.filter((h) => h && !known.includes(h));

  const all = loadProducts();
  const bySku = new Map(all.filter((p) => p.sku).map((p) => [p.sku.toLowerCase(), p]));
  const byId = new Map(all.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: { row: number; action: 'update' | 'create' | 'unchanged' | 'error'; sku: string; name: string; changes: string[]; error?: string }[] = [];
  const next = [...all]; const fresh: Product[] = []; const touched = new Set<number>();

  table.slice(1).forEach((cells, n) => {
    const row = n + 2;
    const get = (name: string) => { const i = col(name); return i < 0 ? undefined : unsafe((cells[i] ?? '').trim()); };
    const sku = get('sku') ?? ''; const idText = get('id') ?? '';
    const fail = (error: string) => out.push({ row, action: 'error', sku, name: get('name') ?? '', changes: [], error });
    const key = sku.toLowerCase();
    if (key) { if (seen.has(key)) return fail(`SKU ${sku} appears twice in the file.`); seen.add(key); }
    const price = get('price'); const stock = get('stock');
    if (price) { if (!/^\d+(\.\d+)?$/.test(price)) return fail(`Price "${price}" is not a number (use digits only, e.g. 499 or 499.50).`); if (Number(price) > 100_000_000) return fail('Price is too large.'); }
    if (stock) { if (!/^\d+$/.test(stock) || Number(stock) > 1_000_000) return fail(`Stock "${stock}" must be a whole number, 0 or more.`); }
    const patch: Record<string, unknown> = {};
    for (const [csvName, field] of [['name', 'name'], ['price', 'price'], ['category', 'category'], ['description', 'description'], ['short_description', 'shortDescription'], ['image_url', 'imageUrl']] as const) {
      const v = get(csvName); if (v) patch[field] = csvName === 'description' || csvName === 'short_description' ? v.slice(0, 20000) : v;
    }
    if (stock) patch.stock = Number(stock);
    const at = get('attributes'); if (at) patch.attributes = textToAttrs(at);

    const cur = (key && bySku.get(key)) || (idText && byId.get(Number(idText))) || undefined;
    if (cur) {
      const merged = clean({ ...patch }, cur);
      if (patch.attributes) { // CSV attributes are merged into existing ones by name
        const m = new Map(cur.attributes.map((a) => [a.name.toLowerCase(), a]));
        for (const a of patch.attributes as { name: string; value: string }[]) m.set(a.name.toLowerCase(), a);
        merged.attributes = [...m.values()];
      }
      const changes = (Object.keys(patch) as (keyof typeof merged)[]).filter((k) => k === 'price' ? Number(merged.price) !== Number(cur.price) : JSON.stringify(merged[k]) !== JSON.stringify((cur as any)[k] ?? (k === 'stock' ? null : '')));
      if (!changes.length) { out.push({ row, action: 'unchanged', sku: cur.sku, name: cur.name, changes: [] }); return; }
      const i = next.findIndex((x) => x.id === cur.id);
      next[i] = { ...cur, ...merged, syncStatus: 'modified' }; touched.add(cur.id);
      out.push({ row, action: 'update', sku: cur.sku, name: cur.name, changes: changes as string[] });
    } else {
      const name = (patch.name as string) ?? '';
      if (name.length < 3) return fail('New products need a name of at least 3 characters.');
      const f = clean(patch);
      fresh.push({ id: -Math.floor(1 + Math.random() * 1e9), ...f, sku, syncStatus: 'never' });
      out.push({ row, action: 'create', sku, name, changes: Object.keys(patch) });
    }
  });
  const dry = req.query.dryRun === '1';
  if (!dry && out.some((r) => r.action === 'update' || r.action === 'create')) saveProducts([...fresh.reverse(), ...next.filter((p) => touched.has(p.id))]);
  res.json({ dryRun: dry, ignoredColumns: ignored, rows: out, counts: { update: out.filter((r) => r.action === 'update').length, create: out.filter((r) => r.action === 'create').length, unchanged: out.filter((r) => r.action === 'unchanged').length, error: out.filter((r) => r.action === 'error').length } });
});

// Bulk edit: set a category, change the price by a percentage, or set stock for many products at once.
api.post('/products/bulk', (req, res) => {
  const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  const { category, pricePct, stock } = req.body ?? {};
  if (!ids.length) { res.status(400).json({ error: 'Select at least one product.' }); return; }
  const hasPct = pricePct !== undefined && pricePct !== null && pricePct !== '';
  if (category === undefined && !hasPct && (stock === undefined || stock === null || stock === '')) { res.status(400).json({ error: 'Choose a change to apply.' }); return; }
  if (hasPct && !(Number.isFinite(Number(pricePct)) && Number(pricePct) >= -90 && Number(pricePct) <= 500)) { res.status(400).json({ error: 'Price change must be between -90% and +500%.' }); return; }
  if (stock !== undefined && stock !== null && stock !== '' && !(Number.isInteger(Number(stock)) && Number(stock) >= 0 && Number(stock) <= 1_000_000)) { res.status(400).json({ error: 'Stock must be a whole number, 0 or more.' }); return; }
  const all = loadProducts().filter((p) => ids.includes(p.id)); let n = 0;
  for (const p of all) {
    if (typeof category === 'string') p.category = category.trim().slice(0, 200);
    if (hasPct && Number(p.price) > 0) { const v = Number(p.price) * (1 + Number(pricePct) / 100); p.price = String(Number.isInteger(Number(p.price)) ? Math.round(v) : Math.round(v * 100) / 100); }
    if (stock !== undefined && stock !== null && stock !== '') p.stock = Number(stock);
    p.syncStatus = 'modified'; n++;
  }
  saveProducts(all);
  res.json({ updated: n, products: loadProducts().map(withScore) });
});

// Push the changed fields of many products to the store, one by one; failures do not stop the rest.
api.post('/products/push-bulk', wrap(async (req, res) => {
  const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  if (!ids.length) { res.status(400).json({ error: 'Select at least one product.' }); return; }
  if (!wooConfigured()) { res.status(400).json({ error: 'WooCommerce is not configured.' }); return; }
  const results: { id: number; name: string; ok: boolean; fields?: string[]; error?: string }[] = [];
  for (const id of ids) {
    const p = getProduct(id);
    if (!p) continue;
    if (p.id >= 9000) { results.push({ id, name: p.name, ok: false, error: 'Demo product (local only).' }); continue; }
    try {
      let fields: PushFields = {};
      if (p.id > 0) {
        const live = await getWooProduct(p.id);
        const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
        const attrs = (x: Product) => [...x.attributes].map((a) => `${a.name.toLowerCase()}=${a.value}`).sort();
        const f: PushFields = {};
        if (p.name !== live.name) f.name = p.name;
        if (p.sku !== live.sku) f.sku = p.sku;
        if (p.price !== live.price) f.price = p.price;
        if (p.category !== live.category && p.category) f.category = p.category;
        if (p.description !== live.description) f.description = p.description;
        if (p.shortDescription !== live.shortDescription) f.shortDescription = p.shortDescription;
        if (!same(attrs(p), attrs(live))) f.attributes = p.attributes;
        if ((p.stock ?? null) !== (live.stock ?? null)) f.stock = p.stock ?? null;
        if (p.imageUrl && p.imageUrl !== live.imageUrl) f.imageUrl = p.imageUrl;
        fields = f;
        if (!Object.keys(fields).length) { saveProduct({ ...p, syncStatus: 'synced' }); results.push({ id, name: p.name, ok: true, fields: [] }); continue; }
      }
      await pushProduct(p, fields);
      results.push({ id, name: p.name, ok: true, fields: p.id < 0 ? ['created'] : Object.keys(fields) });
    } catch (e: any) { results.push({ id, name: p.name, ok: false, error: e.message }); }
  }
  res.json({ results, products: loadProducts().map(withScore) });
}));

api.get('/products', (_q, r) => r.json(loadProducts().map(withScore)));

api.get('/products/:id', (req, res) => {
  const p = getProduct(Number(req.params.id));
  p ? res.json(withScore(p)) : res.status(404).json({ error: 'Not found' });
});

api.put('/products/:id', (req, res) => {
  const cur = getProduct(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const f = clean(req.body ?? {}, cur);
  const bs = req.body?.stock;
  if (bs !== undefined && bs !== null && bs !== '' && !(Number.isInteger(Number(bs)) && Number(bs) >= 0)) return res.status(400).json({ error: 'Stock must be a whole number, 0 or more.' });
  const saved: Product = { ...cur, ...f, syncStatus: 'modified' };
  saveProduct(saved);
  res.json(withScore(saved));
});

api.post('/ai/suggest', wrap(async (req, res) => {
  const p = getProduct(Number(req.body.id));
  if (!p) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(await suggest(p));
}));

api.post('/ai/demo-suggest', (req, res) => {
  const p = getProduct(Number(req.body.id));
  if (!p) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(demoSuggestions(p));
});

// Store-wide review: one batched pass over every product that has quality issues.
api.post('/ai/review', wrap(async (req, res) => {
  const demo = req.body?.demo === true;
  if (!demo && !aiConfigured()) { res.status(400).json({ error: 'AI unavailable: set ANTHROPIC_API_KEY and ANTHROPIC_MODEL, or AI_PROVIDER=claude-cli, in server/.env' }); return; }
  const todo = loadProducts().filter((p) => scoreProduct(p).issues.length > 0);
  const items = demo
    ? todo.map((p) => ({ productId: p.id, suggestions: demoSuggestions(p) }))
    : await reviewStore(todo, [...new Set(loadProducts().map((p) => p.category).filter(Boolean))]);
  res.json({ mode: demo ? 'demo' : 'claude', items });
}));

api.get('/products/:id/diff', wrap(async (req, res) => {
  const local = getProduct(Number(req.params.id));
  if (!local) { res.status(404).json({ error: 'Not found' }); return; }
  if (local.id < 0) { res.json({ live: null, local }); return; } // new product, not in the store yet
  const live = await getWooProduct(local.id);
  res.json({ live, local });
}));

// Pushes `fields` for one product, remembering the store's previous values so the push can be reverted.
async function pushProduct(p: Product, fields: PushFields) {
  if (p.id >= 9000 || !wooConfigured()) throw new Error('Demo products or an unconfigured store cannot be synced. Import from WooCommerce first.');
  const t0 = Date.now(); const mode = await storeMode(); const isNew = p.id < 0;
  const entry = { productId: p.id, sku: p.sku, name: p.name, mode, action: (isNew ? 'create' : 'update') as 'create' | 'update' };
  let before: Record<string, unknown> | undefined;
  try {
    if (!isNew) {
      const live = await getWooProduct(p.id) as any;
      before = {}; for (const k of Object.keys(fields)) if (live[k] !== undefined) before[k] = live[k];
    }
    const r = isNew ? await createInWoo(p) : await pushToWoo(p.id, fields);
    const saved: Product = { ...r.product, syncStatus: 'synced' };
    if (isNew) deleteProduct(p.id); // the store gave it a real id
    saveProduct(saved);
    addLog({ ...entry, productId: saved.id, ok: true, latencyMs: Date.now() - t0, payload: r.payload, before });
    return saved;
  } catch (e: any) {
    const cur = getProduct(p.id); if (cur) saveProduct({ ...cur, syncStatus: 'error' });
    addLog({ ...entry, ok: false, latencyMs: Date.now() - t0, payload: isNew ? p : fields, error: e.message });
    throw e;
  }
}

api.post('/products/:id/push', wrap(async (req, res) => {
  const p = getProduct(Number(req.params.id));
  if (!p) { res.status(404).json({ error: 'Not found' }); return; }
  try { res.json(withScore(await pushProduct(p, (req.body.fields ?? {}) as PushFields))); }
  catch (e: any) { if (/^Demo products/.test(e.message)) { res.status(400).json({ error: e.message }); return; } throw e; }
}));

// Put the store back to what it was before a logged push.
api.post('/sync-log/:id/revert', wrap(async (req, res) => {
  const e = readLog().find((x) => x.id === req.params.id);
  if (!e) { res.status(404).json({ error: 'Log entry not found' }); return; }
  if (e.action !== 'update' || !e.ok || !e.before || !Object.keys(e.before).length) { res.status(400).json({ error: 'This entry cannot be reverted (only successful updates that recorded the previous values).' }); return; }
  if (e.reverted) { res.status(400).json({ error: 'This push was already reverted.' }); return; }
  const t0 = Date.now(); const mode = await storeMode();
  const entry = { productId: e.productId, sku: e.sku, name: e.name, mode, action: 'revert' as const, revertOf: e.id };
  try {
    const r = await pushToWoo(e.productId, e.before as PushFields);
    saveProduct({ ...r.product, syncStatus: 'synced' });
    markReverted(e.id);
    addLog({ ...entry, ok: true, latencyMs: Date.now() - t0, payload: r.payload });
    res.json({ ok: true, product: withScore(r.product) });
  } catch (err: any) {
    addLog({ ...entry, ok: false, latencyMs: Date.now() - t0, payload: e.before, error: err.message });
    throw err;
  }
}));

api.get('/sync-log', (_q, res) => res.json(readLog()));

api.use('/img', express.static(path.resolve(import.meta.dirname, '../../mock/images'), { maxAge: '1h' }));
api.get('/img/:name.svg', (req, res) => { res.type('image/svg+xml').send(productSvg(req.params.name)); });

// stock: a non-negative whole number, or null when stock is not tracked.
const parseStock = (v: unknown, d: number | null): number | null => {
  if (v === undefined) return d;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : d;
};
const clean = (b: any, cur?: Product) => {
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v.slice(0, 20000) : d);
  const attrs = Array.isArray(b.attributes)
    ? b.attributes.filter((a: any) => a && typeof a.name === 'string' && typeof a.value === 'string').slice(0, 50).map((a: any) => ({ name: a.name.trim(), value: a.value.trim() })).filter((a: any) => a.name)
    : cur?.attributes ?? [];
  return {
    name: str(b.name, cur?.name ?? '').trim(), sku: str(b.sku, cur?.sku ?? '').trim(), price: str(b.price, cur?.price ?? '').trim(), category: str(b.category, cur?.category ?? '').trim(),
    description: str(b.description, cur?.description ?? ''), shortDescription: str(b.shortDescription, cur?.shortDescription ?? ''), imageUrl: str(b.imageUrl, cur?.imageUrl ?? '').trim(), attributes: attrs,
    stock: parseStock(b.stock, cur?.stock ?? null),
  };
};

// New products live locally with a negative id until they are created in the store.
api.post('/products', (req, res) => {
  const f = clean(req.body ?? {});
  if (f.name.length < 3) { res.status(400).json({ error: 'Name must be at least 3 characters.' }); return; }
  if (req.body?.stock !== undefined && req.body.stock !== null && req.body.stock !== '' && f.stock === null) { res.status(400).json({ error: 'Stock must be a whole number, 0 or more.' }); return; }
  if (f.price && !(Number(f.price) >= 0)) { res.status(400).json({ error: 'Price must be a number.' }); return; }
  const all = loadProducts();
  if (f.sku && all.some((x) => x.sku === f.sku)) { res.status(400).json({ error: `SKU ${f.sku} already exists.` }); return; }
  const p: Product = { id: -Math.floor(1 + Math.random() * 1e9), ...f, syncStatus: 'never' };
  saveProduct(p);
  res.status(201).json(withScore(p));
});

api.post('/reset', wrap(async (_q, res) => {
  if (!wooConfigured()) { replaceProducts(DEMO); clearLog(); res.json(DEMO.map(withScore)); return; }
  if ((await storeMode()) !== 'mock') { res.status(400).json({ error: 'Reset only works with the built-in mock store. A real WooCommerce store is never modified by a reset.' }); return; }
  await fetch(`${mockStoreUrl()}/__reset`, { method: 'POST' });
  const imported = await getWooProducts();
  replaceProducts(imported); clearLog();
  res.json(imported.map(withScore));
}));
