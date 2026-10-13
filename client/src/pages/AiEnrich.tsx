import { useState } from 'react';
import { ArrowRight, Check, Loader2, Sparkles, UploadCloud } from 'lucide-react';
import { api, isDemo, type PushFields, type Scored, type Suggestion } from '../services/api';
import { scoreProduct } from '../../../shared/quality';
import { ScoreBar, Thumb } from '../components/ScoreBar';
import { notify } from '../services/toast';

type Sug = { s: Suggestion; include: boolean; value: string };
type Row = { product: Scored; sugs: Sug[]; applied?: PushFields; error?: string; pushed?: 'ok' | string };
type State = { rows: Row[]; mode: 'claude' | 'demo' | null };
let cache: State = { rows: [], mode: null }; // survives navigating away and back

const LABEL: Record<string, string> = { description: 'Description', shortDescription: 'Short description', category: 'Category', sku: 'SKU', price: 'Price', imageUrl: 'Image URL' };
const srcCls: Record<string, string> = { existing_data: 'bg-emerald-100 text-emerald-800', inferred: 'bg-amber-100 text-amber-800', unknown: 'bg-slate-200 text-slate-700' };
const srcLabel: Record<string, string> = { existing_data: 'From existing data', inferred: 'AI-inferred', unknown: 'Needs your input' };
const title = (s: Suggestion) => (s.field === 'attribute' ? `Attribute: ${s.attributeName}` : LABEL[s.field]);
const ready = (x: Sug) => x.include && x.value.trim() !== '';

// What a row's approved suggestions change on the product.
function changes(r: Row): PushFields {
  const c: PushFields = {};
  let attrs = [...r.product.attributes];
  for (const { s, value, include } of r.sugs) {
    const v = value.trim();
    if (!include || !v) continue;
    if (s.field === 'attribute') {
      const n = s.attributeName || 'Attribute';
      const i = attrs.findIndex((a) => a.name.toLowerCase() === n.toLowerCase());
      if (i >= 0) attrs[i] = { ...attrs[i], value: v }; else attrs.push({ name: n.charAt(0).toUpperCase() + n.slice(1), value: v });
      c.attributes = attrs;
    } else (c as any)[s.field] = v;
  }
  return c;
}

export default function AiEnrich() {
  const [st, setSt] = useState<State>(cache);
  const [busy, setBusy] = useState<'' | 'analyze' | 'approve' | 'push'>('');
  const [err, setErr] = useState('');
  const [canDemo, setCanDemo] = useState(false);
  const update = (next: State) => { cache = next; setSt(next); };
  const setRow = (id: number, f: (r: Row) => Row) => update({ ...st, rows: st.rows.map((r) => (r.product.id === id ? f(r) : r)) });
  const setSug = (id: number, i: number, c: Partial<Sug>) => setRow(id, (r) => ({ ...r, sugs: r.sugs.map((x, j) => (j === i ? { ...x, ...c } : x)) }));

  const analyze = async (demo: boolean) => {
    setBusy('analyze'); setErr(''); setCanDemo(false);
    try {
      const [list, res] = await Promise.all([api.list(), api.review(demo)]);
      const rows: Row[] = res.items.map((it) => ({ product: list.find((p) => p.id === it.productId)!, sugs: it.suggestions.map((s) => ({ s, include: s.value != null, value: s.value ?? '' })) })).filter((r) => r.product);
      update({ rows, mode: res.mode });
      notify(`Review complete: ${rows.length} products with suggestions.`);
    } catch (e: any) { setErr(e.message); setCanDemo(/unavailable|not found|failed|timed out|unusable|not reachable/i.test(e.message)); }
    setBusy('');
  };

  const applyRows = async (rows: Row[]) => {
    setBusy('approve'); let ok = 0, bad = 0; let next = st.rows;
    for (const r of rows) {
      const c = changes(r);
      if (!Object.keys(c).length) continue;
      try {
        const saved = await api.save(r.product.id, c as any);
        next = next.map((x) => (x.product.id === r.product.id ? { ...x, product: saved, applied: { ...(x.applied ?? {}), ...c }, error: undefined, sugs: x.sugs.map((u) => (ready(u) ? { ...u, include: false } : u)) } : x));
        ok++;
      } catch (e: any) { next = next.map((x) => (x.product.id === r.product.id ? { ...x, error: e.message } : x)); bad++; }
    }
    update({ ...st, rows: next }); setBusy('');
    notify(bad ? `Approved ${ok} products, ${bad} failed (see the errors below).` : `Approved and saved changes for ${ok} products. Review them, then push to WooCommerce.`, !bad);
  };

  const pushAll = async () => {
    setBusy('push'); let ok = 0, bad = 0; let next = st.rows;
    for (const r of st.rows.filter((x) => x.applied && x.pushed !== 'ok')) {
      if (isDemo(r.product)) { next = next.map((x) => (x.product.id === r.product.id ? { ...x, pushed: 'Demo products cannot be synced.' } : x)); bad++; continue; }
      try { const saved = await api.push(r.product.id, r.applied!); next = next.map((x) => (x.product.id === r.product.id ? { ...x, product: saved, pushed: 'ok' } : x)); ok++; }
      catch (e: any) { next = next.map((x) => (x.product.id === r.product.id ? { ...x, pushed: e.message } : x)); bad++; }
    }
    update({ ...st, rows: next }); setBusy('');
    notify(bad ? `Pushed ${ok}, ${bad} failed (see the errors below).` : `Pushed ${ok} products to WooCommerce. See the Sync log.`, !bad);
  };

  const pending = st.rows.map((r) => ({ r, n: r.sugs.filter(ready).length })).filter((x) => x.n > 0);
  const totalChanges = pending.reduce((n, x) => n + x.n, 0);
  const needInput = st.rows.reduce((n, r) => n + r.sugs.filter((u) => u.include === false || u.value.trim() === '').filter((u) => u.s.value == null && !u.value.trim()).length, 0);
  const appliedCount = st.rows.filter((r) => r.applied && r.pushed !== 'ok').length;
  const btn = 'flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium disabled:opacity-50';
  const inp = 'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">AI Enrich</h1><p className="max-w-xl text-sm text-slate-600">Claude reviews every product that has data-quality issues and proposes fixes. Edit any suggestion, untick what you do not want, then approve them all at once. Nothing changes until you approve.</p></div>
        <button disabled={!!busy} onClick={() => analyze(false)} className={`${btn} bg-emerald-800 text-white hover:bg-emerald-900`}>{busy === 'analyze' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{busy === 'analyze' ? 'Reviewing the store…' : st.rows.length ? 'Re-analyze store' : 'Analyze store'}</button>
      </div>
      {busy === 'analyze' && <p className="rounded-md bg-stone-100 p-3 text-sm text-slate-700">Claude is reading your catalog. This usually takes 20 to 60 seconds.</p>}
      {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{err}{canDemo && <div className="mt-2"><button onClick={() => analyze(true)} className="rounded-md border border-dashed border-slate-400 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-stone-50">Use rule-based demo review instead (not from Claude)</button></div>}</div>}
      {st.mode === 'demo' && <p className="rounded bg-slate-100 px-3 py-2 text-sm text-slate-700">DEMO MODE: these suggestions come from simple rules, not from Claude.</p>}

      {!!st.rows.length && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 card/95 p-3 shadow-sm backdrop-blur">
          <div className="text-sm"><b>{st.rows.length}</b> products reviewed · <b>{totalChanges}</b> ready to approve{needInput > 0 && <span className="text-amber-700"> · some suggestions need your answer</span>}</div>
          <div className="flex gap-2">
            <button disabled={!!busy || !totalChanges} onClick={() => applyRows(pending.map((x) => x.r))} className={`${btn} bg-emerald-800 text-white hover:bg-emerald-900`}>{busy === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Approve all changes ({totalChanges})</button>
            <button disabled={!!busy || !appliedCount} onClick={pushAll} className={`${btn} border border-emerald-800 text-emerald-900 hover:bg-emerald-50`}><UploadCloud size={15} />Push {appliedCount || ''} to WooCommerce</button>
          </div>
        </div>)}

      {!st.rows.length && !busy && !err && (
        <div className="card overflow-hidden">
          <div className="bg-emerald-900 p-6 text-white"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><Sparkles size={16} />Store-wide review</div><div className="mt-1 max-w-xl text-xl font-bold">Let Claude read your whole catalog and suggest what to fix.</div></div>
          <ol className="grid gap-4 p-6 md:grid-cols-3">
            {[['1', 'Analyze', 'Claude checks every product with data-quality issues, using only facts already on file.'], ['2', 'Review and edit', 'Change any suggestion, untick the ones you do not want, and answer its questions.'], ['3', 'Approve and push', 'Approve everything in one click, then push the changes to WooCommerce.']].map(([n, t, d]) => (
              <li key={n} className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-800">{n}</span><div><div className="font-semibold">{t}</div><div className="text-sm text-slate-600">{d}</div></div></li>))}
          </ol>
        </div>)}

      {st.rows.map((r) => {
        const after = scoreProduct({ ...r.product, ...(changes(r) as any) });
        const n = r.sugs.filter(ready).length;
        return (
          <section key={r.product.id} className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <Thumb src={r.product.imageUrl} name={r.product.name} />
              <div className="min-w-0 flex-1"><a href={`#/product/${r.product.id}`} className="font-semibold hover:underline">{r.product.name}</a><div className="text-xs text-slate-500">{r.product.sku || 'no SKU'} · {r.product.category || 'no category'} · {r.product.quality.issues.map((i) => i.check).join(', ') || 'no issues'}</div></div>
              <div className="flex items-center gap-2"><ScoreBar q={r.product.quality} />{n > 0 && <><ArrowRight size={14} className="text-slate-400" /><ScoreBar q={after} /></>}</div>
              <button disabled={!!busy || !n} onClick={() => applyRows([r])} className="rounded-md border border-emerald-800 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-40">Approve ({n})</button>
            </div>
            {n > 0 && after.issues.length > 0 && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-900">After approving, still missing: {after.issues.map((i) => i.message.toLowerCase()).join('; ')}. Answer the questions below to fix {after.issues.length === 1 ? 'it' : 'them'}.</p>}
            {n > 0 && after.issues.length === 0 && <p className="mb-2 rounded bg-emerald-50 p-2 text-xs text-emerald-900">Approving these will bring this product to 100%.</p>}
            {r.error && <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-800">{r.error}</p>}
            {r.applied && <p className={`mb-2 rounded p-2 text-xs ${r.pushed === 'ok' ? 'bg-emerald-50 text-emerald-900' : r.pushed ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{r.pushed === 'ok' ? '✓ Pushed to WooCommerce.' : r.pushed ? `Push failed: ${r.pushed}` : '✓ Approved and saved locally. Not pushed to the store yet.'}</p>}
            <div className="space-y-2">
              {r.sugs.map((u, i) => (
                <div key={i} className={`rounded-md border p-2.5 text-sm ${u.include ? 'border-stone-300' : 'border-stone-200 bg-stone-50 opacity-70'}`}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={u.include} onChange={(e) => setSug(r.product.id, i, { include: e.target.checked })} />{title(u.s)}</label>
                    <span className={`rounded px-1.5 text-[11px] ${srcCls[u.s.source]}`}>{srcLabel[u.s.source]}</span>
                    <span className="text-[11px] text-slate-500">{u.s.confidence} confidence</span>
                  </div>
                  {u.s.question && <p className="mb-1.5 text-xs text-slate-600">{u.s.question}</p>}
                  {u.s.field === 'description' ? <textarea rows={3} className={inp} value={u.value} placeholder={u.s.source === 'unknown' ? 'Your answer…' : ''} onChange={(e) => setSug(r.product.id, i, { value: e.target.value, include: true })} />
                    : <input className={inp} value={u.value} placeholder={u.s.source === 'unknown' ? 'Your answer…' : ''} onChange={(e) => setSug(r.product.id, i, { value: e.target.value, include: true })} />}
                </div>))}
            </div>
          </section>);
      })}
    </div>
  );
}
