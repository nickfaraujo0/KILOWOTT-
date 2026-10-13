import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Download, FlaskConical, Loader2, FileSpreadsheet, MoreHorizontal, Plus, Upload, UploadCloud, X, RotateCcw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { api, isDemo, type Scored, type SyncCheckItem } from '../services/api';
import { ScoreBar, Thumb } from '../components/ScoreBar';
import { money } from '../services/money';
import { StockBadge } from '../components/StockBadge';
import { stockState } from '../../../shared/stock';
import { notify } from '../services/toast';
import { CsvImport } from '../components/CsvImport';

export const bandCls = (b: string) => b === 'Good' ? 'bg-emerald-100 text-emerald-800' : b === 'Needs work' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';
export const syncCls = (s: string) => s === 'synced' ? 'text-emerald-700' : s === 'error' ? 'text-red-700' : s === 'modified' ? 'text-amber-700' : 'text-slate-500';

const SORTS: Record<string, [string, (a: Scored, b: Scored) => number]> = {
  quality: ['Lowest quality first', (a, b) => a.quality.score - b.quality.score],
  name: ['Name A to Z', (a, b) => a.name.localeCompare(b.name)],
  priceAsc: ['Price: low to high', (a, b) => Number(a.price || 0) - Number(b.price || 0)],
  priceDesc: ['Price: high to low', (a, b) => Number(b.price || 0) - Number(a.price || 0)],
  stock: ['Lowest stock first', (a, b) => (a.stock ?? Infinity) - (b.stock ?? Infinity)],
  category: ['Category', (a, b) => (a.category || 'zzz').localeCompare(b.category || 'zzz') || a.name.localeCompare(b.name)],
};
const STATE_LABEL: Record<SyncCheckItem['state'], [string, string]> = {
  'in-sync': ['In sync', 'bg-emerald-100 text-emerald-800'],
  'local-changes': ['Local changes not pushed', 'bg-amber-100 text-amber-800'],
  'store-changed': ['Changed in the store', 'bg-sky-100 text-sky-800'],
  'not-in-store': ['Missing from the store', 'bg-red-100 text-red-800'],
  'new-local': ['New, not created in the store', 'bg-slate-200 text-slate-700'],
  'new-in-store': ['New in the store, not imported', 'bg-sky-100 text-sky-800'],
};

export default function Catalog() {
  const [rows, setRows] = useState<Scored[]>([]);
  const [q, setQ] = useState(''); const [band, setBand] = useState(''); const [sync, setSync] = useState(''); const [cat, setCat] = useState(''); const [stk, setStk] = useState(''); const [sort, setSort] = useState('quality');
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [check, setCheck] = useState<{ at: string; items: SyncCheckItem[] } | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState<'category' | 'pricePct' | 'stock'>('category'); const [bulkVal, setBulkVal] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null); const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api.list().then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const run = async (label: string, fn: () => Promise<Scored[]>) => { setBusy(label); setErr(''); try { setRows(await fn()); setCheck(null); } catch (e: any) { setErr(e.message); } setBusy(''); };

  const doImport = async () => {
    setBusy('import'); setErr('');
    try {
      const { products, summary: s } = await api.import(); setRows(products); setCheck(null);
      const parts = [`${s.added} new`, `${s.updated} refreshed`];
      if (s.removed) parts.push(`${s.removed} removed (no longer in the store)`);
      if (s.keptLocalEdits) parts.push(`${s.keptLocalEdits} kept with your unsynced edits`);
      if (s.keptNew) parts.push(`${s.keptNew} new local product${s.keptNew === 1 ? '' : 's'} kept`);
      notify(`Imported from WooCommerce: ${parts.join(', ')}.`);
    } catch (e: any) { setErr(e.message); }
    setBusy('');
  };
  const doCheck = async () => {
    setBusy('check'); setErr('');
    try { const r = await api.syncCheck(); setCheck({ at: new Date(r.checkedAt).toLocaleTimeString(), items: r.items }); const bad = r.items.filter((i) => i.state !== 'in-sync').length; notify(bad ? `${bad} product${bad === 1 ? '' : 's'} out of sync with the store.` : 'Everything is in sync with the store.', !bad); }
    catch (e: any) { setErr(e.message); }
    setBusy('');
  };

  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = [...picked].filter((id) => rows.some((r) => r.id === id));
  const applyBulk = async () => {
    const v = bulkVal.trim();
    if (bulkMode !== 'category' && !/^-?\d+(\.\d+)?$/.test(v)) { setErr(bulkMode === 'pricePct' ? 'Enter a percentage, e.g. 10 or -15.' : 'Enter a whole number for stock.'); return; }
    if (bulkMode === 'category' && !v) { setErr('Enter a category name.'); return; }
    if (bulkMode === 'category' && !cats.some((c) => c.toLowerCase() === v.toLowerCase()) && !confirm(`"${v}" is not an existing category. It will be created in WooCommerce when you push. Continue?`)) return;
    setBusy('bulk'); setErr('');
    try {
      const r = await api.bulk(ids, bulkMode === 'category' ? { category: v } : bulkMode === 'pricePct' ? { pricePct: Number(v) } : { stock: Number(v) });
      setRows(r.products); setCheck(null); setBulkVal('');
      notify(`Updated ${r.updated} product${r.updated === 1 ? '' : 's'} locally. Push them to WooCommerce when you are ready.`);
    } catch (e: any) { setErr(e.message); }
    setBusy('');
  };
  const pushSelected = async () => {
    setBusy('pushbulk'); setErr('');
    try {
      const r = await api.pushBulk(ids); setRows(r.products); setCheck(null);
      const ok = r.results.filter((x) => x.ok).length; const bad = r.results.filter((x) => !x.ok);
      notify(bad.length ? `Pushed ${ok}, ${bad.length} failed: ${bad[0].name}: ${bad[0].error}` : `Pushed ${ok} product${ok === 1 ? '' : 's'} to WooCommerce. Undo any of them from the Sync log.`, !bad.length);
      if (!bad.length) setPicked(new Set());
    } catch (e: any) { setErr(e.message); }
    setBusy('');
  };

  const cats = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(), [rows]);
  const shown = rows.filter((r) =>
    (!q || (r.name + r.sku + r.category).toLowerCase().includes(q.toLowerCase())) && (!band || r.quality.band === band) &&
    (!sync || r.syncStatus === sync) && (!cat || r.category === cat) && (!stk || stockState(r.stock) === stk)).sort(SORTS[sort][1]);
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const avg = rows.length ? Math.round(rows.reduce((n, r) => n + r.quality.score, 0) / rows.length) : 0;
  const stats = [['Total products', rows.length], ['Need attention', rows.filter((r) => r.quality.band !== 'Good').length], ['Avg completeness', avg + '%'], ['Pending sync', rows.filter((r) => r.syncStatus === 'modified' || r.syncStatus === 'never' && r.id < 0).length]];
  const sel = 'rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-sm';
  const hero = rows.find((r) => r.sku === 'DOG-104');
  const drift = check?.items.filter((i) => i.state !== 'in-sync') ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Product catalog</h1><p className="text-sm text-slate-600">Manage products, attributes and stock, and keep them in sync with WooCommerce.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="#/new" className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-stone-50"><Plus size={15} />Add product</a>
          <button disabled={!!busy} onClick={doCheck} className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50">{busy === 'check' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}Check sync</button>
          <button disabled={!!busy} onClick={doImport} className="flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50">{busy === 'import' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}{busy === 'import' ? 'Importing…' : 'Import from WooCommerce'}</button>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-stone-50"><FileSpreadsheet size={15} />CSV</summary>
            <div className="absolute right-0 z-20 mt-1 w-60 card p-1 shadow-lg">
              <a href="/api/products/export.csv" download className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-50"><Upload size={14} />Export catalog (CSV)</a>
              <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; fileRef.current?.click(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-50"><Download size={14} />Import from CSV…</button>
            </div>
          </details>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCsvFile(f); }} />
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center rounded-lg border border-stone-300 bg-white p-2 text-slate-600 hover:bg-stone-50" aria-label="More actions"><MoreHorizontal size={18} /></summary>
            <div className="absolute right-0 z-20 mt-1 w-56 card p-1 shadow-lg">
              <button disabled={!!busy} onClick={() => confirm('Reset the demo? Unsynced local edits and the sync log are discarded and the mock store returns to its starting data.') && run('reset', api.reset)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-50"><RotateCcw size={14} />Reset demo (mock store)</button>
              <button disabled={!!busy} onClick={() => run('demo', async () => api.demo())} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-50"><FlaskConical size={14} />Load offline demo data</button>
            </div>
          </details>
        </div>
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map(([l, v]) => <div key={l as string} className="card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l}</div><div className="mt-1 text-2xl font-bold tabular-nums">{v}</div></div>)}
      </div>

      {check && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Sync check <span className="text-xs font-normal text-slate-500">at {check.at}</span></h2><button className="text-xs text-slate-500 hover:underline" onClick={() => setCheck(null)}>Dismiss</button></div>
          {!drift.length ? <p className="text-sm text-emerald-800">All {check.items.length} products match the live store.</p> : (
            <>
              <p className="mb-2 text-sm text-slate-600">{drift.length} of {check.items.length} products differ from the live store. Push local changes from the product page. Use <b>Import from WooCommerce</b> to pull store changes (your unsynced edits are kept).</p>
              <ul className="divide-y divide-stone-100">
                {drift.map((i) => (
                  <li key={i.id} onClick={() => i.state !== 'new-in-store' && (location.hash = `/product/${i.id}`)} className={`flex items-center gap-3 py-2 text-sm ${i.state !== 'new-in-store' ? 'cursor-pointer hover:bg-stone-50' : ''}`}>
                    <span className="min-w-0 flex-1 truncate font-medium">{i.name}<span className="ml-2 text-xs font-normal text-slate-500">{i.sku}</span></span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_LABEL[i.state][1]}`}>{STATE_LABEL[i.state][0]}</span>
                  </li>))}
              </ul>
            </>)}
        </section>)}

      {hero && (
        <a href={`#/product/${hero.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-900 p-5 text-white shadow-sm">
          <div className="flex items-center gap-4"><img src={hero.imageUrl} alt="" className="hidden h-16 w-16 rounded-xl border-2 border-white/30 object-cover sm:block" /><div><div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Recommended demo flow</div><div className="mt-0.5 text-lg font-bold">{hero.name} (DOG-104)</div><div className="text-sm text-emerald-100">Inspect issues, generate AI suggestions, review the diff, push to WooCommerce.</div></div></div>
          <span className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3.5 py-2 text-sm font-semibold text-emerald-950">Start <ArrowRight size={15} /></span>
        </a>)}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU or category" className={sel + ' w-64 pl-8'} aria-label="Search" /></div>
        <select className={sel} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        <select className={sel} value={band} onChange={(e) => setBand(e.target.value)} aria-label="Quality"><option value="">All quality</option><option>Good</option><option>Needs work</option><option>Poor</option></select>
        <select className={sel} value={stk} onChange={(e) => setStk(e.target.value)} aria-label="Stock"><option value="">All stock</option><option value="out">Out of stock</option><option value="low">Low stock</option><option value="ok">In stock</option><option value="untracked">Not tracked</option></select>
        <select className={sel} value={sync} onChange={(e) => setSync(e.target.value)} aria-label="Sync status"><option value="">All sync status</option><option>synced</option><option>modified</option><option>never</option><option>error</option></select>
        <select className={sel + ' ml-auto'} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <p className="text-xs text-slate-500">Showing {shown.length} of {rows.length} products</p>

      {!!ids.length && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
          <span className="text-sm font-semibold text-emerald-900">{ids.length} selected</span>
          <select className={sel} value={bulkMode} onChange={(e) => { setBulkMode(e.target.value as typeof bulkMode); setBulkVal(''); }} aria-label="Bulk action"><option value="category">Set category</option><option value="pricePct">Change price by %</option><option value="stock">Set stock</option></select>
          <input list="bulk-cats" value={bulkVal} onChange={(e) => setBulkVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyBulk()} placeholder={bulkMode === 'category' ? 'Category name' : bulkMode === 'pricePct' ? 'e.g. 10 or -15' : 'e.g. 25'} className={sel + ' w-40'} aria-label="Bulk value" />
          <datalist id="bulk-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          <button disabled={!!busy} onClick={applyBulk} className="rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50">{busy === 'bulk' ? 'Applying…' : 'Apply'}</button>
          <span className="mx-1 hidden h-6 w-px bg-emerald-200 sm:block" />
          <button disabled={!!busy} onClick={pushSelected} className="flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50">{busy === 'pushbulk' ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}Push to WooCommerce</button>
          <button onClick={() => setPicked(new Set())} className="ml-auto flex items-center gap-1 text-sm text-slate-600 hover:underline"><X size={14} />Clear</button>
        </div>)}

      <div className="overflow-x-auto card">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-10 py-3 pl-4"><input type="checkbox" checked={allShown} onChange={() => setPicked((s) => { const n = new Set(s); allShown ? shown.forEach((r) => n.delete(r.id)) : shown.forEach((r) => n.add(r.id)); return n; })} aria-label="Select all shown products" className="h-4 w-4 accent-emerald-700" /></th>{['Product', 'SKU', 'Category', 'Price', 'Stock', 'Completeness', 'Sync', ''].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={`cursor-pointer border-t border-stone-100 hover:bg-stone-50 ${picked.has(r.id) ? 'bg-emerald-50/60' : ''}`} onClick={() => (location.hash = `/product/${r.id}`)}>
                <td className="w-10 py-3 pl-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} className="h-4 w-4 accent-emerald-700" /></td>
                <td className="px-4 py-3"><div className="flex items-center gap-3"><Thumb src={r.imageUrl} name={r.name} /><div><div className="font-medium">{r.name}{isDemo(r) && <span className="ml-2 rounded bg-stone-200 px-1.5 text-[10px] text-slate-600">DEMO</span>}{r.id < 0 && <span className="ml-2 rounded bg-sky-100 px-1.5 text-[10px] font-semibold text-sky-800">NEW</span>}{r.sku === 'DOG-104' && <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">DEMO TARGET</span>}</div><div className="text-xs text-slate-500">{r.quality.issues.length} quality issue{r.quality.issues.length === 1 ? '' : 's'}</div></div></div></td>
                <td className="px-4 py-3 text-slate-600">{r.sku || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{r.category || '—'}</td>
                <td className="px-4 py-3 tabular-nums">{money(r.price)}</td>
                <td className="px-4 py-3"><StockBadge stock={r.stock} /></td>
                <td className="px-4 py-3"><ScoreBar q={r.quality} /></td>
                <td className={`px-4 py-3 ${syncCls(r.syncStatus)}`}>{r.syncStatus}</td>
                <td className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"><Sparkles size={12} />Enrich</span></td>
              </tr>))}
            {!shown.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">{rows.length ? 'No products match these filters.' : 'No products yet. Import from WooCommerce, or load offline demo data from the ⋯ menu.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {csvFile && <CsvImport file={csvFile} onClose={() => setCsvFile(null)} onDone={(c) => { setCsvFile(null); load(); setCheck(null); notify(`CSV applied: ${c.update} updated, ${c.create} created${c.error ? `, ${c.error} skipped` : ''}. Push them to WooCommerce when you are ready.`); }} />}
    </div>
  );
}
