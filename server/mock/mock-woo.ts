// Mock WooCommerce REST API (v3 subset) for local development and demos. NOT a real store.
// Run: npm run mock-woo   (port 8081, keys ck_mock / cs_mock)
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { productSvg } from '../../shared/productImage.ts';

const PORT = Number(process.env.MOCK_WOO_PORT ?? 8081);
const KEY = process.env.MOCK_WOO_KEY ?? 'ck_mock';
const SECRET = process.env.MOCK_WOO_SECRET ?? 'cs_mock';
const FILE = path.resolve(import.meta.dirname, '../data/mock-woo.json');

type Cat = { id: number; name: string };
type WooProduct = { id: number; name: string; sku: string; price: string; regular_price: string; description: string; short_description: string; categories: Cat[]; attributes: { id: number; name: string; visible: boolean; options: string[] }[]; images: { id: number; src: string }[]; manage_stock: boolean; stock_quantity: number | null; stock_status: string };
type DB = { cats: Cat[]; products: WooProduct[] };

type CatalogItem = { name: string; sku: string; price: string; category: string; description: string; shortDescription: string; attributes: Record<string, string>; kind: string; stock?: number };
const CATALOG = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../shared/catalog.json'), 'utf8')) as { storeName: string; products: CatalogItem[] };
const cats: Cat[] = ['Uncategorized', ...new Set(CATALOG.products.map((p) => p.category).filter(Boolean))].map((name, i) => ({ id: 15 + i, name }));
const cat = (n: string) => cats.find((c) => c.name === n)!;
const stockFields = (n: number | null) => ({ manage_stock: n !== null, stock_quantity: n, stock_status: n === null || n > 0 ? 'instock' : 'outofstock' });
const seed = (): DB => ({
  cats,
  products: CATALOG.products.map((c, i): WooProduct => ({
    id: 10 + i, name: c.name, sku: c.sku, price: c.price, regular_price: c.price,
    description: c.description ? `<p>${c.description}</p>\n` : '', short_description: c.shortDescription ? `<p>${c.shortDescription}</p>\n` : '',
    categories: [cat(c.category || 'Uncategorized')], attributes: Object.entries(c.attributes).map(([k, v]) => ({ id: 0, name: k, visible: true, options: [v] })),
    images: [{ id: 1, src: `http://localhost:${PORT}/img/${c.kind}.jpg` }],
    ...stockFields(c.stock ?? null),
  })),
});
// Deterministic order history (last 60 days) so analytics always has data. Dates are relative to now.
const CITIES = ['Mumbai', 'Mumbai', 'Delhi', 'Delhi', 'Bengaluru', 'Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Goa', 'Kolkata'];
const WEIGHT: Record<string, number> = { dogfood: 10, catfood: 10, dogtoy: 8, mousetoy: 8, dogtreats: 8, featherwand: 7, collar: 6, leash: 6, dogbowl: 5, rope: 5, litterbox: 3, scratchpost: 3, dogbed: 3, catbed: 2, brush: 2 };
function makeOrders(products: WooProduct[]) {
  let a = 7; const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const kindOf = new Map(CATALOG.products.map((c, i) => [10 + i, c.kind]));
  const pool = products.flatMap((p) => Array(WEIGHT[kindOf.get(p.id) ?? ''] ?? 2).fill(p));
  const orders: any[] = []; let id = 1000;
  for (let d = 59; d >= 0; d--) {
    const date = new Date(); date.setDate(date.getDate() - d);
    const weekend = [0, 6].includes(date.getDay());
    const n = Math.round((weekend ? 3.4 : 2.2) * (0.7 + (60 - d) / 120) + rnd() * 2 - 0.5);
    for (let k = 0; k < Math.max(0, n); k++) {
      const when = new Date(date); when.setHours(8 + Math.floor(rnd() * 13), Math.floor(rnd() * 60), 0, 0);
      if (when > new Date()) continue;
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pool[Math.floor(rnd() * pool.length)]);
      const merged = new Map<number, { product_id: number; name: string; quantity: number; total: string }>();
      for (const p of lines) { const q = 1 + Math.floor(rnd() * (Number(p.regular_price) < 500 ? 4 : 2)); const m = merged.get(p.id); const price = Number(p.regular_price || 0); if (m) { m.quantity += q; m.total = (price * m.quantity).toFixed(2); } else merged.set(p.id, { product_id: p.id, name: p.name, quantity: q, total: (price * q).toFixed(2) }); }
      const items = [...merged.values()];
      const r = rnd(); const status = r < 0.72 ? 'completed' : r < 0.86 ? 'processing' : r < 0.95 ? 'cancelled' : 'refunded';
      orders.push({ id: id++, status, date_created: when.toISOString().slice(0, 19), currency: 'INR', total: items.reduce((n, l) => n + Number(l.total), 0).toFixed(2), billing: { city: CITIES[Math.floor(rnd() * CITIES.length)] }, line_items: items });
    }
  }
  return orders.reverse(); // newest first
}
const load = (): DB => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return seed(); } };
const save = (d: DB) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); };
let db = load();
let ORDERS = makeOrders(seed().products);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const wrapP = (t: string) => (t ? `<p>${esc(String(t))}</p>\n` : '');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Storefront page (same look as the PawNest WordPress theme) so "refresh the storefront" works in demos.
app.get('/theme.css', (_q, res) => { res.type('text/css').send(fs.readFileSync(path.resolve(import.meta.dirname, '../../store-theme/pawnest/style.css'), 'utf8')); });
app.get('/', (_q, res) => {
  const card = (p: WooProduct) => {
    const out = p.manage_stock && (p.stock_quantity ?? 0) <= 0; const low = p.manage_stock && !out && (p.stock_quantity ?? 0) <= 5;
    const price = p.regular_price ? `₹${Number(p.regular_price).toLocaleString('en-IN')}` : 'Price on request';
    return `<li class="product ${out ? 'outofstock' : ''}">${low ? `<span class="stock-badge low">Only ${p.stock_quantity} left</span>` : ''}<img src="${esc(p.images[0]?.src ?? '')}" alt=""><h2 class="woocommerce-loop-product__title">${esc(p.name)}</h2><span class="price">${price}</span><a class="button">${out ? 'Sold out' : 'Add to cart'}</a></li>`;
  };
  res.type('html').send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>PawNest (mock store)</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Fredoka:wght@500;600;700&display=swap" rel=stylesheet><link rel=stylesheet href="/theme.css">
<div class=topbar style="background:#c28a00">MOCK STORE: a simulated WooCommerce for PawPIM development. Not a real shop.</div>
<header class=site-header><div class=wrap><a class=brand>PawNest <small style="font-size:13px;color:#7b6a5f;font-weight:500">mock</small></a><nav class=main-nav><a>Shop all</a><a>Dogs</a><a>Cats</a></nav></div></header>
<section class=hero><div class=wrap><div><span class=eyebrow>New this week</span><h1>Everything your <em>cat</em> &amp; <em>dog</em> will love</h1><p>Comfy beds, tasty food and toys that survive playtime.</p></div></div></section>
<main class=wrap style="padding-top:40px"><h2 style="font-size:32px">All products</h2><ul class=products>${db.products.map(card).join('')}</ul></main><footer class=site-footer><div class=wrap><div class=fine>Mock store for PawPIM development.</div></div></footer>`);
});
app.use('/img', express.static(path.resolve(import.meta.dirname, 'images'), { maxAge: '1h' }));
app.get('/img/:name.svg', (req, res) => { res.type('image/svg+xml').send(productSvg(req.params.name)); });
app.post('/__reset', (_q, res) => { db = seed(); save(db); ORDERS = makeOrders(db.products); res.json({ ok: true }); });
app.get('/wp-json', (_q, res) => res.json({ name: 'PawPIM Mock WooCommerce (not a real store)', mock: true }));

app.use('/wp-json/wc/v3', (req, res, next) => {
  const basic = (req.headers.authorization ?? '').startsWith('Basic ') ? Buffer.from(req.headers.authorization!.slice(6), 'base64').toString() : '';
  const [bk, bs] = basic.split(':');
  const ok = (req.query.consumer_key === KEY && req.query.consumer_secret === SECRET) || (bk === KEY && bs === SECRET);
  if (!ok) { res.status(401).json({ code: 'woocommerce_rest_cannot_view', message: 'Sorry, you cannot list resources.', data: { status: 401 } }); return; }
  next();
});
const base = '/wp-json/wc/v3';
app.get(`${base}/system_status`, (_q, res) => res.json({ environment: { version: 'mock-1.0' }, settings: { currency: 'INR', currency_symbol: '₹' } }));
app.get(`${base}/orders`, (req, res) => {
  const after = req.query.after ? new Date(String(req.query.after)).getTime() : 0;
  const per = Math.min(100, Number(req.query.per_page ?? 10)); const page = Math.max(1, Number(req.query.page ?? 1));
  const list = ORDERS.filter((o) => new Date(o.date_created).getTime() >= after);
  res.json(list.slice((page - 1) * per, page * per));
});
app.get(`${base}/products/categories`, (_q, res) => res.json(db.cats));
app.post(`${base}/products/categories`, (req, res) => {
  const c = { id: Math.max(...db.cats.map((x) => x.id)) + 1, name: String(req.body.name ?? '').slice(0, 100) };
  db.cats.push(c); save(db); res.status(201).json(c);
});
app.get(`${base}/products`, (_q, res) => res.json(db.products));
app.get(`${base}/products/:id`, (req, res) => {
  const p = db.products.find((x) => x.id === Number(req.params.id));
  p ? res.json(p) : res.status(404).json({ code: 'woocommerce_rest_product_invalid_id', message: 'Invalid ID.', data: { status: 404 } });
});
app.post(`${base}/products`, (req, res) => {
  const b = req.body ?? {};
  if (typeof b.name !== 'string' || !b.name.trim()) { res.status(400).json({ code: 'product_invalid_name', message: 'Product name is required.', data: { status: 400 } }); return; }
  if (b.sku && db.products.some((x) => x.sku === b.sku)) { res.status(400).json({ code: 'product_invalid_sku', message: 'Invalid or duplicated SKU.', data: { status: 400 } }); return; }
  const p: WooProduct = { id: Math.max(...db.products.map((x) => x.id), 9) + 1, name: b.name.slice(0, 200), sku: String(b.sku ?? ''), price: String(b.regular_price ?? ''), regular_price: String(b.regular_price ?? ''), description: wrapP(b.description ?? ''), short_description: wrapP(b.short_description ?? ''), categories: [], attributes: [], images: [], ...stockFields(b.manage_stock ? Number(b.stock_quantity ?? 0) : null) };
  p.categories = (Array.isArray(b.categories) ? b.categories : []).map((c: any) => db.cats.find((x) => x.id === c.id)).filter(Boolean) as Cat[];
  if (!p.categories.length) p.categories = [cat('Uncategorized')];
  if (Array.isArray(b.attributes)) p.attributes = b.attributes.map((a: any) => ({ id: 0, name: String(a.name), visible: a.visible !== false, options: (a.options ?? []).map(String) }));
  if (Array.isArray(b.images)) p.images = b.images.filter((i: any) => typeof i.src === 'string').map((i: any, n: number) => ({ id: n + 1, src: i.src }));
  db.products.push(p); save(db); res.status(201).json(p);
});
app.put(`${base}/products/:id`, (req, res) => {
  const p = db.products.find((x) => x.id === Number(req.params.id));
  if (!p) { res.status(404).json({ code: 'woocommerce_rest_product_invalid_id', message: 'Invalid ID.', data: { status: 404 } }); return; }
  const b = req.body ?? {};
  if (typeof b.name === 'string') p.name = b.name;
  if (typeof b.sku === 'string') {
    if (b.sku && db.products.some((x) => x.id !== p.id && x.sku === b.sku)) { res.status(400).json({ code: 'product_invalid_sku', message: 'Invalid or duplicated SKU.', data: { status: 400 } }); return; }
    p.sku = b.sku;
  }
  if (typeof b.regular_price === 'string') { p.regular_price = b.regular_price; p.price = b.regular_price; }
  if (typeof b.description === 'string') p.description = wrapP(b.description);
  if (typeof b.short_description === 'string') p.short_description = wrapP(b.short_description);
  if (Array.isArray(b.categories)) p.categories = b.categories.map((c: any) => db.cats.find((x) => x.id === c.id)).filter(Boolean) as Cat[];
  if (Array.isArray(b.attributes)) p.attributes = b.attributes.map((a: any) => ({ id: 0, name: String(a.name), visible: a.visible !== false, options: (a.options ?? []).map(String) }));
  if (Array.isArray(b.images)) p.images = b.images.filter((i: any) => typeof i.src === 'string').map((i: any, n: number) => ({ id: n + 1, src: i.src }));
  if (b.manage_stock === false) Object.assign(p, stockFields(null));
  else if (b.manage_stock === true || b.stock_quantity !== undefined) Object.assign(p, stockFields(Number(b.stock_quantity ?? p.stock_quantity ?? 0)));
  save(db); res.json(p);
});

app.listen(PORT, () => console.log(`Mock WooCommerce on http://localhost:${PORT}  (keys: ${KEY} / ${SECRET})`));
