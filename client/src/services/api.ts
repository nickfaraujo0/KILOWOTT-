import type { Product, QualityResult, Suggestion } from '../../../shared/quality';
export type { Product, Suggestion, QualityResult };
export type Scored = Product & { quality: QualityResult };
export type PushFields = Partial<Pick<Product, 'description' | 'shortDescription' | 'category' | 'attributes' | 'sku' | 'price' | 'imageUrl' | 'stock'>>;
export type SyncEntry = { id: string; ts: string; productId: number; sku: string; name: string; action: string; mode: 'mock' | 'live' | 'none'; ok: boolean; latencyMs: number; payload: unknown; error?: string; before?: Record<string, unknown>; reverted?: boolean; revertOf?: string };
export type CsvPreview = { dryRun: boolean; ignoredColumns: string[]; rows: { row: number; action: 'update' | 'create' | 'unchanged' | 'error'; sku: string; name: string; changes: string[]; error?: string }[]; counts: { update: number; create: number; unchanged: number; error: number } };
export type BulkChange = { category?: string; pricePct?: number; stock?: number };
export type PushBulkResult = { id: number; name: string; ok: boolean; fields?: string[]; error?: string };
export type NewProduct = Pick<Product, 'name' | 'sku' | 'price' | 'category' | 'description' | 'shortDescription' | 'imageUrl' | 'attributes' | 'stock'>;
export type ImportSummary = { added: number; updated: number; keptLocalEdits: number; keptNew: number; removed: number };
export type SyncCheckItem = { id: number; name: string; sku: string; state: 'in-sync' | 'local-changes' | 'store-changed' | 'not-in-store' | 'new-local' | 'new-in-store' };
export type Analytics = {
  days: number; from: string; to: string; currency: string; mock: boolean;
  totals: { revenue: number; orders: number; units: number; aov: number; lostOrders: number; lostValue: number };
  previous: { revenue: number; orders: number; units: number; aov: number };
  deltas: { revenue: number | null; orders: number | null; aov: number | null; units: number | null };
  series: { date: string; revenue: number; orders: number }[];
  topProducts: { id: number; name: string; units: number; revenue: number; imageUrl: string }[];
  categories: { name: string; revenue: number }[]; cities: { name: string; revenue: number }[]; statuses: { status: string; count: number }[];
  restock: { id: number; name: string; sku: string; stock: number; unitsSold: number; perDay: number; daysLeft: number | null; imageUrl?: string }[];
  orderCount: number;
};
export type Status = { woocommerce: { configured: boolean; ok: boolean; error?: string; mock?: boolean; url?: string }; anthropic: { configured: boolean } };

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (res.status === 502 || res.status === 504 ? 'The PawPIM server is not reachable (it may be restarting). Wait a few seconds and try again.' : `Request failed (${res.status})`));
  return data as T;
}
async function csvCall(text: string, dryRun: boolean): Promise<CsvPreview> {
  const res = await fetch('/api/products/import-csv' + (dryRun ? '?dryRun=1' : ''), { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
export const api = {
  importCsv: csvCall,
  bulk: (ids: number[], change: BulkChange) => call<{ updated: number; products: Scored[] }>('POST', '/products/bulk', { ids, ...change }),
  pushBulk: (ids: number[]) => call<{ results: PushBulkResult[]; products: Scored[] }>('POST', '/products/push-bulk', { ids }),
  revert: (id: string) => call<{ ok: true; product: Scored }>('POST', `/sync-log/${id}/revert`),
  list: () => call<Scored[]>('GET', '/products'),
  get: (id: number) => call<Scored>('GET', `/products/${id}`),
  save: (id: number, p: Partial<Product>) => call<Scored>('PUT', `/products/${id}`, p),
  import: () => call<{ products: Scored[]; summary: ImportSummary }>('POST', '/products/import'),
  syncCheck: () => call<{ checkedAt: string; items: SyncCheckItem[] }>('GET', '/sync-check'),
  analytics: (days: number) => call<Analytics>('GET', `/analytics?days=${days}`),
  remove: (id: number) => call<{ ok: true }>('DELETE', `/products/${id}`),
  demo: () => call<Scored[]>('POST', '/products/demo'),
  suggest: (id: number) => call<Suggestion[]>('POST', '/ai/suggest', { id }),
  demoSuggest: (id: number) => call<Suggestion[]>('POST', '/ai/demo-suggest', { id }),
  create: (p: NewProduct) => call<Scored>('POST', '/products', p),
  review: (demo = false) => call<{ mode: 'claude' | 'demo'; items: { productId: number; suggestions: Suggestion[] }[] }>('POST', '/ai/review', { demo }),
  syncLog: () => call<SyncEntry[]>('GET', '/sync-log'),
  reset: () => call<Scored[]>('POST', '/reset'),
  diff: (id: number) => call<{ live: Product | null; local: Product }>('GET', `/products/${id}/diff`),
  push: (id: number, fields: PushFields) => call<Scored>('POST', `/products/${id}/push`, { fields }),
  status: () => call<Status>('GET', '/integrations/status'),
};
export const isDemo = (p: { id: number }) => p.id >= 9000;
export const isNewProduct = (p: { id: number }) => p.id < 0;
