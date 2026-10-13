import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Loader2, Minus, RefreshCw } from 'lucide-react';
import { api, type Analytics as A } from '../services/api';
import { AreaChart, BarList, Donut } from '../components/Charts';
import { Thumb } from '../components/ScoreBar';
import { money } from '../services/money';

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const short = (n: number) => '₹' + compact.format(n);
const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const STATUS_COLORS: Record<string, string> = { completed: '#047857', processing: '#0ea5e9', cancelled: '#ef4444', refunded: '#f59e0b', 'on-hold': '#64748b', failed: '#a855f7' };

function Delta({ v }: { v: number | null }) {
  if (v === null) return <span className="flex items-center gap-0.5 text-xs text-slate-400"><Minus size={12} />no prior data</span>;
  const up = v >= 0;
  return <span className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(v)}%</span>;
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<A | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const load = (d = days) => { setLoading(true); setErr(''); api.analytics(d).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false)); };
  useEffect(() => { load(days); }, [days]);

  const card = 'card p-5';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-slate-600">Orders and sales from your WooCommerce store{data ? `, ${shortDate(data.from)} to ${shortDate(data.to)}` : ''}.{data?.mock && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">MOCK STORE DATA</span>}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-stone-300 bg-white p-0.5 text-sm" role="group" aria-label="Period">
            {[7, 30, 60].map((d) => <button key={d} onClick={() => setDays(d)} className={`rounded-full px-3.5 py-1.5 font-medium ${days === d ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:bg-stone-100'}`}>{d} days</button>)}
          </div>
          <button onClick={() => load()} disabled={loading} className="rounded-full border border-stone-300 bg-white p-2 text-slate-600 hover:bg-stone-100 disabled:opacity-50" aria-label="Refresh"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      {err && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{err}</p>}
      {!data && !err && <p className="flex items-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" />Loading orders…</p>}

      {data && (data.orderCount === 0 ? <div className={card + ' text-center text-slate-600'}>No orders in this period.</div> : <>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { label: 'Revenue', value: money(data.totals.revenue), d: data.deltas.revenue },
            { label: 'Orders', value: data.totals.orders, d: data.deltas.orders },
            { label: 'Avg order value', value: money(data.totals.aov), d: data.deltas.aov },
            { label: 'Units sold', value: data.totals.units, d: data.deltas.units },
          ].map((k) => (
            <div key={k.label} className={card}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</div>
              <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{k.value}</div>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Delta v={k.d} />vs previous {data.days} days</div>
            </div>))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={card + ' lg:col-span-2'}>
            <div className="mb-2 flex items-baseline justify-between"><h2 className="font-semibold">Revenue</h2><span className="text-xs text-slate-500">Completed and processing orders</span></div>
            <AreaChart data={data.series.map((r) => ({ label: shortDate(r.date), value: r.revenue }))} format={short} />
          </section>
          <section className={card}>
            <h2 className="mb-3 font-semibold">Order status</h2>
            <Donut items={data.statuses.map((s) => ({ label: s.status, value: s.count }))} colors={STATUS_COLORS} />
            <p className="mt-3 rounded-lg bg-stone-50 p-2.5 text-xs text-slate-600"><b>{data.totals.lostOrders}</b> cancelled or refunded orders, worth <b>{money(data.totals.lostValue)}</b>, are not counted in revenue.</p>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={card + ' lg:col-span-2'}>
            <h2 className="mb-3 font-semibold">Top products by revenue</h2>
            <ul className="divide-y divide-stone-100">
              {data.topProducts.map((p, i) => (
                <li key={p.id} onClick={() => (location.hash = `/product/${p.id}`)} className="flex cursor-pointer items-center gap-3 py-2.5 hover:bg-stone-50">
                  <span className="w-5 text-center text-sm font-semibold text-slate-400">{i + 1}</span><Thumb src={p.imageUrl} name={p.name} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-xs text-slate-500">{p.units} units sold</div></div>
                  <div className="text-sm font-semibold tabular-nums">{money(p.revenue)}</div>
                </li>))}
            </ul>
          </section>
          <div className="space-y-4">
            <section className={card}><h2 className="mb-3 font-semibold">Revenue by category</h2><BarList items={data.categories.map((c) => ({ label: c.name, value: c.revenue }))} format={short} /></section>
            <section className={card}><h2 className="mb-3 font-semibold">Top cities</h2><BarList color="bg-amber-500" items={data.cities.map((c) => ({ label: c.name, value: c.revenue }))} format={short} /></section>
          </div>
        </div>

        <section className={card}>
          <div className="mb-3 flex items-baseline justify-between"><h2 className="font-semibold">Restock soon</h2><span className="text-xs text-slate-500">Stock left at this period's sales pace</span></div>
          {!data.restock.length ? <p className="text-sm text-emerald-800">Nothing is about to run out.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Product</th><th>In stock</th><th>Sold ({data.days}d)</th><th>Per day</th><th>Days left</th></tr></thead>
              <tbody>{data.restock.map((r) => (
                <tr key={r.id} onClick={() => (location.hash = `/product/${r.id}`)} className="cursor-pointer border-t border-stone-100 hover:bg-stone-50">
                  <td className="py-2"><div className="flex items-center gap-3"><Thumb src={r.imageUrl} name={r.name} /><div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.sku}</div></div></div></td>
                  <td className="tabular-nums">{r.stock}</td><td className="tabular-nums">{r.unitsSold}</td><td className="tabular-nums">{r.perDay}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.stock === 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{r.stock === 0 ? 'Sold out' : `${r.daysLeft} days`}</span></td>
                </tr>))}</tbody>
            </table></div>)}
        </section>
      </>)}
    </div>
  );
}
