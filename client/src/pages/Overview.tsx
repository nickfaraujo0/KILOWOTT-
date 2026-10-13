import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Boxes, ExternalLink, PackageX, Star, Wallet, PackageSearch } from 'lucide-react';
import { api, type Analytics, type Scored, type Status, type SyncEntry } from '../services/api';
import { Sparkline } from '../components/Charts';
import { money } from '../services/money';
import { ScoreBar, Thumb } from '../components/ScoreBar';
import { StockBadge } from '../components/StockBadge';
import { stockState } from '../../../shared/stock';

export default function Overview() {
  const [rows, setRows] = useState<Scored[] | null>(null);
  const [log, setLog] = useState<SyncEntry[]>([]);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [sales, setSales] = useState<Analytics | null>(null);
  useEffect(() => { api.status().then(setStatus).catch(() => {}); api.analytics(30).then(setSales).catch(() => {}); api.list().then(setRows).catch((e) => setErr(e.message)); api.syncLog().then(setLog).catch(() => {}); }, []);
  if (err) return <p className="text-red-700">{err}</p>;
  if (!rows) return <p className="text-slate-500">Loading…</p>;

  const out = rows.filter((r) => stockState(r.stock) === 'out');
  const low = rows.filter((r) => stockState(r.stock) === 'low');
  const attention = rows.filter((r) => r.quality.band !== 'Good').sort((a, b) => a.quality.score - b.quality.score);
  const avg = rows.length ? Math.round(rows.reduce((n, r) => n + r.quality.score, 0) / rows.length) : 0;
  const value = rows.reduce((n, r) => n + (Number(r.price) > 0 && r.stock ? Number(r.price) * r.stock : 0), 0);
  const alerts = [...out, ...low].sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  const go = (id: number) => (location.hash = `/product/${id}`);

  const kpis = [
    { label: 'Products', value: rows.length, icon: Boxes, tone: '' },
    { label: 'Avg data quality', value: `${avg}%`, icon: Star, tone: avg >= 85 ? 'text-emerald-700' : avg >= 50 ? 'text-amber-700' : 'text-red-700' },
    { label: 'Need attention', value: attention.length, icon: AlertTriangle, tone: attention.length ? 'text-amber-700' : '' },
    { label: 'Low stock', value: low.length, icon: PackageSearch, tone: low.length ? 'text-amber-700' : '' },
    { label: 'Out of stock', value: out.length, icon: PackageX, tone: out.length ? 'text-red-700' : '' },
    { label: 'Stock value', value: money(value), icon: Wallet, tone: '' },
  ];
  const panel = 'card p-4';

  if (!rows.length) return <div className={panel + ' text-center text-slate-600'}>No products yet. <a className="font-medium text-emerald-800 underline" href="#/catalog">Open the catalog</a> to import or load demo data.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800/70">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}</h1>
          <p className="text-sm text-slate-600">Here is how your catalog and store are doing.</p>
        </div>
        {status?.woocommerce.url ? (
          <a href={status.woocommerce.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white"><ExternalLink size={15} />{status.woocommerce.mock ? 'View mock store' : 'View live store'}</a>
        ) : <span className="rounded-lg border border-dashed border-stone-300 px-3 py-2 text-xs text-slate-500" title="Connect a WooCommerce store in server/.env">No store connected</span>}
      </div>

      {sales && sales.orderCount > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {[{ label: 'Revenue, last 30 days', value: money(sales.totals.revenue), d: sales.deltas.revenue, vals: sales.series.map((r) => r.revenue), color: '#10b981' },
            { label: 'Orders, last 30 days', value: String(sales.totals.orders), d: sales.deltas.orders, vals: sales.series.map((r) => r.orders), color: '#f59e0b' }].map((c) => (
            <a key={c.label} href="#/analytics" className="card group relative block overflow-hidden p-5 transition hover:-translate-y-0.5">
              <div className="flex items-start justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</div><div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{c.value}</div></div>
                {c.d !== null && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.d >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{c.d >= 0 ? '▲' : '▼'} {Math.abs(c.d)}%</span>}</div>
              <div className="mt-3 -mb-2 -mx-1"><Sparkline values={c.vals} color={c.color} /></div>
            </a>))}
        </div>)}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="card p-4">
            <div className="flex items-center justify-between text-slate-400"><span className="text-[11px] font-semibold uppercase tracking-wide">{k.label}</span><k.icon size={15} /></div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${k.tone}`}>{k.value}</div>
          </div>))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={panel}>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Stock alerts</h2><a href="#/catalog" className="flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline">All stock <ArrowRight size={12} /></a></div>
          {!alerts.length ? <p className="text-sm text-emerald-800">Every tracked product is above the low-stock level.</p> : (
            <ul className="divide-y divide-stone-100">
              {alerts.map((r) => (
                <li key={r.id} onClick={() => go(r.id)} className="flex cursor-pointer items-center gap-3 py-2 hover:bg-stone-50">
                  <Thumb src={r.imageUrl} name={r.name} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.sku || 'no SKU'} · {r.category || 'no category'}</div></div>
                  <StockBadge stock={r.stock} />
                </li>))}
            </ul>)}
          <p className="mt-2 text-[11px] text-slate-400">Low stock means 5 units or fewer. Update the count on the product page, then push it to the store.</p>
        </section>

        <section className={panel}>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Needs attention</h2><a href="#/catalog" className="flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline">Catalog <ArrowRight size={12} /></a></div>
          {!attention.length ? <p className="text-sm text-emerald-800">All products have good data quality.</p> : (
            <ul className="divide-y divide-stone-100">
              {attention.slice(0, 6).map((r) => (
                <li key={r.id} onClick={() => go(r.id)} className="flex cursor-pointer items-center gap-3 py-2 hover:bg-stone-50">
                  <Thumb src={r.imageUrl} name={r.name} />
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium leading-tight">{r.name}</div><div className="text-xs text-slate-500">{r.quality.issues.length} issue{r.quality.issues.length === 1 ? '' : 's'}: {r.quality.issues.map((i) => i.check).join(', ')}</div></div>
                  <ScoreBar q={r.quality} />
                </li>))}
            </ul>)}
        </section>
      </div>

      <section className={panel}>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Recent syncs</h2><a href="#/sync-log" className="flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline">Sync log <ArrowRight size={12} /></a></div>
        {!log.length ? <p className="text-sm text-slate-500">No syncs yet. Pending changes: {rows.filter((r) => r.syncStatus === 'modified').length}.</p> : (
          <ul className="divide-y divide-stone-100 text-sm">
            {log.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-1.5">
                <span className={e.ok ? 'text-emerald-700' : 'text-red-700'}>{e.ok ? '✓' : '✕'}</span>
                <span className="font-medium">{e.action}</span><span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className={`rounded px-1.5 text-[11px] font-semibold ${e.mode === 'mock' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{e.mode === 'mock' ? 'MOCK' : 'LIVE'}</span>
                <span className="text-xs text-slate-500">{new Date(e.ts).toLocaleTimeString()}</span>
              </li>))}
          </ul>)}
      </section>
    </div>
  );
}
