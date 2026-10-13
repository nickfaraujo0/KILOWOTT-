import type { Product } from '../../../shared/quality.ts';

const strip = (h: string) => h.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export function wooConfigured() {
  const { WOOCOMMERCE_STORE_URL, WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET } = process.env;
  return !!(WOOCOMMERCE_STORE_URL && WOOCOMMERCE_CONSUMER_KEY && WOOCOMMERCE_CONSUMER_SECRET);
}

async function woo(pathname: string, init: RequestInit = {}) {
  if (!wooConfigured()) throw new Error('WooCommerce is not configured. Set the WOOCOMMERCE_* variables in server/.env');
  const base = process.env.WOOCOMMERCE_STORE_URL!.replace(/\/$/, '');
  const url = new URL(`${base}/wp-json/wc/v3${pathname}`);
  const key = process.env.WOOCOMMERCE_CONSUMER_KEY!;
  const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET!;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (url.protocol === 'https:') {
    headers.Authorization = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
  } else {
    // local HTTP store: keys in query params (dev only)
    url.searchParams.set('consumer_key', key);
    url.searchParams.set('consumer_secret', secret);
  }
  const res = await fetch(url, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WooCommerce ${res.status}: ${(body as any).message ?? res.statusText}`);
  return body as any;
}

export function fromWoo(w: any): Product {
  return {
    id: w.id,
    name: w.name ?? '',
    sku: w.sku ?? '',
    description: strip(w.description ?? ''),
    shortDescription: strip(w.short_description ?? ''),
    price: w.regular_price || w.price || '',
    category: w.categories?.[0]?.name ?? '',
    attributes: (w.attributes ?? []).map((a: any) => ({ name: a.name, value: (a.options ?? []).join(', ') })),
    imageUrl: w.images?.[0]?.src,
    stock: w.manage_stock ? Number(w.stock_quantity ?? 0) : null,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
  };
}

export const getWooProducts = async () => (await woo('/products?per_page=50')).map(fromWoo) as Product[];
export const getWooProduct = async (id: number) => fromWoo(await woo(`/products/${id}`));
export const getWooCategories = async () => (await woo('/products/categories?per_page=100')) as { id: number; name: string }[];

export type PushFields = Partial<Pick<Product, 'description' | 'shortDescription' | 'category' | 'attributes' | 'sku' | 'price' | 'imageUrl' | 'name' | 'stock'>>;

async function categoryId(name: string, create: boolean) {
  const cats = await getWooCategories();
  const c = cats.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (c) return c.id;
  if (!create) throw new Error(`Category "${name}" does not exist in WooCommerce`);
  return (await woo('/products/categories', { method: 'POST', body: JSON.stringify({ name }) })).id as number;
}

// WordPress decides the image type from the URL, so the link must end in a real image extension.
export const imageUrlOk = (u: string) => /^https?:\/\/.+\.(jpe?g|png|gif|webp)(\?[^#]*)?$/i.test(u.trim());

function toBody(f: PushFields) {
  if (f.imageUrl && !imageUrlOk(f.imageUrl)) throw new Error('Image URL must be a public link ending in .jpg, .jpeg, .png, .gif or .webp. WooCommerce cannot import images without a file extension.');
  const body: any = {};
  if (f.name !== undefined) body.name = f.name;
  if (f.description !== undefined) body.description = f.description;
  if (f.shortDescription !== undefined) body.short_description = f.shortDescription;
  if (f.sku !== undefined) body.sku = f.sku;
  if (f.price !== undefined) body.regular_price = f.price;
  if (f.imageUrl) body.images = [{ src: f.imageUrl }];
  if (f.stock !== undefined) { if (f.stock === null) body.manage_stock = false; else { body.manage_stock = true; body.stock_quantity = f.stock; } }
  if (f.attributes !== undefined) body.attributes = f.attributes.filter((a) => a.value).map((a) => ({ name: a.name, visible: true, options: [a.value] }));
  return body;
}

export type PushResult = { product: Product; payload: unknown; action: 'create' | 'update' };

export async function pushToWoo(id: number, f: PushFields): Promise<PushResult> {
  const body = toBody(f);
  // A category that does not exist yet is created in the store; an empty one leaves the category alone.
  if (f.category?.trim()) body.categories = [{ id: await categoryId(f.category.trim(), true) }];
  const product = fromWoo(await woo(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) }));
  return { product, payload: body, action: 'update' };
}

export async function createInWoo(p: Product): Promise<PushResult> {
  const body = toBody({ name: p.name, sku: p.sku, price: p.price, description: p.description, shortDescription: p.shortDescription, attributes: p.attributes, imageUrl: p.imageUrl, stock: p.stock ?? null });
  body.status = 'publish';
  if (p.category.trim()) body.categories = [{ id: await categoryId(p.category, true) }];
  const product = fromWoo(await woo('/products', { method: 'POST', body: JSON.stringify(body) }));
  return { product, payload: body, action: 'create' };
}

// "mock" when the store is the built-in mock server, otherwise "live".
export async function storeMode(): Promise<'mock' | 'live'> {
  try {
    const root = await fetch(`${process.env.WOOCOMMERCE_STORE_URL!.replace(/\/$/, '')}/wp-json`).then((r) => r.json());
    return (root as any).mock === true ? 'mock' : 'live';
  } catch { return 'live'; }
}

export function mockStoreUrl() { return process.env.WOOCOMMERCE_STORE_URL!.replace(/\/$/, ''); }

export type WooOrder = {
  id: number; status: string; date_created: string; total: string; currency?: string;
  billing?: { city?: string }; line_items: { product_id: number; name: string; quantity: number; total: string }[];
};
// All orders created after the given date (ISO), newest first, up to 1000.
export async function getWooOrders(afterIso: string): Promise<WooOrder[]> {
  const out: WooOrder[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = (await woo(`/orders?per_page=100&page=${page}&after=${encodeURIComponent(afterIso)}&orderby=date&order=desc`)) as WooOrder[];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}
