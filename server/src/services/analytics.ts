import type { Product } from '../../../shared/quality.ts';
import type { WooOrder } from './woocommerce.ts';

const SOLD = new Set(['completed', 'processing']); // statuses that count as sales
const LOST = new Set(['cancelled', 'refunded', 'failed']);
const pad = (n: number) => String(n).padStart(2, '0');
// Local calendar date. Orders are bucketed by the date string the store gives them, so time zones never shift an order to another day.
const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const orderDay = (o: WooOrder) => o.date_created.slice(0, 10);

export type Analytics = ReturnType<typeof computeAnalytics>;

export function computeAnalytics(orders: WooOrder[], products: Product[], days: number, now = new Date()) {
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(end); start.setDate(start.getDate() - days + 1); start.setHours(0, 0, 0, 0);
  const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - days);
  const startKey = day(start), endKey = day(end), prevStartKey = day(prevStart);
  const cur = orders.filter((o) => orderDay(o) >= startKey && orderDay(o) <= endKey);
  const prev = orders.filter((o) => orderDay(o) >= prevStartKey && orderDay(o) < startKey);

  const totals = (list: WooOrder[]) => {
    const sold = list.filter((o) => SOLD.has(o.status));
    const revenue = sold.reduce((n, o) => n + Number(o.total), 0);
    const units = sold.reduce((n, o) => n + o.line_items.reduce((m, l) => m + l.quantity, 0), 0);
    const lost = list.filter((o) => LOST.has(o.status));
    return { revenue, orders: sold.length, units, aov: sold.length ? revenue / sold.length : 0, lostOrders: lost.length, lostValue: lost.reduce((n, o) => n + Number(o.total), 0) };
  };
  const t = totals(cur), pt = totals(prev);
  const delta = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);

  // daily series (zero-filled)
  const series: { date: string; revenue: number; orders: number }[] = [];
  for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(d.getDate() + i); series.push({ date: day(d), revenue: 0, orders: 0 }); }
  const byDate = new Map(series.map((r) => [r.date, r]));
  for (const o of cur.filter((o) => SOLD.has(o.status))) { const r = byDate.get(orderDay(o)); if (r) { r.revenue += Number(o.total); r.orders++; } }

  // products, categories, cities, statuses
  const catOf = new Map(products.map((p) => [p.id, p.category || 'Uncategorized']));
  const prodAgg = new Map<number, { id: number; name: string; units: number; revenue: number }>();
  const catAgg = new Map<string, number>();
  const cityAgg = new Map<string, number>();
  for (const o of cur.filter((o) => SOLD.has(o.status))) {
    for (const l of o.line_items) {
      const a = prodAgg.get(l.product_id) ?? { id: l.product_id, name: l.name, units: 0, revenue: 0 };
      a.units += l.quantity; a.revenue += Number(l.total); prodAgg.set(l.product_id, a);
      const c = catOf.get(l.product_id) ?? 'Other'; catAgg.set(c, (catAgg.get(c) ?? 0) + Number(l.total));
    }
    const city = o.billing?.city; if (city) cityAgg.set(city, (cityAgg.get(city) ?? 0) + Number(o.total));
  }
  const statusAgg = new Map<string, number>();
  for (const o of cur) statusAgg.set(o.status, (statusAgg.get(o.status) ?? 0) + 1);
  const img = new Map(products.map((p) => [p.id, p.imageUrl]));
  const top = [...prodAgg.values()].sort((a, b) => b.revenue - a.revenue);

  // stock cover: how long current stock lasts at the period's sales pace
  const restock = products
    .filter((p) => p.stock != null)
    .map((p) => { const sold = prodAgg.get(p.id)?.units ?? 0; const velocity = sold / days; return { id: p.id, name: p.name, sku: p.sku, stock: p.stock as number, unitsSold: sold, perDay: Math.round(velocity * 100) / 100, daysLeft: velocity > 0 ? Math.round(((p.stock as number) / velocity) * 10) / 10 : null, imageUrl: p.imageUrl }; })
    .filter((r) => r.unitsSold > 0 && (r.stock === 0 || (r.daysLeft !== null && r.daysLeft <= 14)))
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)).slice(0, 8);

  return {
    days, from: day(start), to: day(end), currency: 'INR',
    totals: t, previous: pt,
    deltas: { revenue: delta(t.revenue, pt.revenue), orders: delta(t.orders, pt.orders), aov: delta(t.aov, pt.aov), units: delta(t.units, pt.units) },
    series,
    topProducts: top.slice(0, 8).map((p) => ({ ...p, imageUrl: img.get(p.id) ?? '' })),
    categories: [...catAgg.entries()].map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue),
    cities: [...cityAgg.entries()].map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 6),
    statuses: [...statusAgg.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    restock,
    orderCount: cur.length,
  };
}
