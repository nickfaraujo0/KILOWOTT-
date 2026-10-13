import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Sparkles, UploadCloud, X } from 'lucide-react';
import { api, isDemo, isNewProduct, type Product, type PushFields, type Scored, type Suggestion } from '../services/api';
import { bandCls } from './Catalog';
import { Thumb } from '../components/ScoreBar';
import { CURRENCY_LABEL } from '../services/money';
import { StockBadge } from '../components/StockBadge';
import { notify } from '../services/toast';

const FIELD_LABEL: Record<string, string> = { description: 'Description', shortDescription: 'Short description', category: 'Category', attributes: 'Attributes', sku: 'SKU', price: 'Price', imageUrl: 'Image URL', stock: 'Stock' };
const attrStr = (a: Product['attributes']) => a.filter((x) => x.value).map((x) => `${x.name}: ${x.value}`).join('\n');
const fieldVal = (p: Product, f: string) => (f === 'attributes' ? attrStr(p.attributes) : f === 'stock' ? (p.stock == null ? 'not tracked' : String(p.stock)) : ((p as any)[f] as string));
const srcCls: Record<string, string> = { existing_data: 'bg-emerald-100 text-emerald-800', inferred: 'bg-amber-100 text-amber-800', unknown: 'bg-slate-200 text-slate-700' };
const srcLabel: Record<string, string> = { existing_data: 'From existing data', inferred: 'AI-inferred', unknown: 'Unknown — needs your input' };

export default function ProductDetail({ id }: { id: number }) {
  const [p, setP] = useState<Scored | null>(null);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [diff, setDiff] = useState<{ live: Product; local: Product } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [demoAi, setDemoAi] = useState(false);
  const [aiDown, setAiDown] = useState(false);

  const cur = useRef<Scored | null>(null); // always the latest product, so rapid edits never overwrite each other
  const pending = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve()); // saves run strictly in order
  useEffect(() => { if (msg) notify(msg.text, msg.ok); }, [msg]);
  useEffect(() => { api.get(id).then((r) => { cur.current = r; setP(r); }).catch((e) => setMsg({ ok: false, text: e.message })); }, [id]);
  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    setBusy('');
  };
  if (!p) return <p className="text-slate-500">{msg?.text ?? 'Loading…'}</p>;

  const apply = (c: Partial<Product>) => { const next = { ...cur.current!, ...c } as Scored; cur.current = next; setP(next); return next; };
  const patch = (c: Partial<Product>) => { apply(c); setDirty(true); setMsg((m) => (m?.ok ? null : m)); };
  const save = (c: Partial<Product> = {}) => {
    const next = apply(c); const { quality, ...rest } = next;
    setBusy('save'); setMsg(null); pending.current++;
    queue.current = queue.current.then(async () => {
      try {
        const saved = await api.save(id, rest);
        if (cur.current === next) { cur.current = saved; setP(saved); } // adopt server score only if nothing newer is pending
        setDiff(null);
        if (pending.current === 1) { setDirty(false); setSavedAt(new Date().toLocaleTimeString()); setMsg({ ok: true, text: 'Changes saved. Use "Review changes vs live store" to sync them.' }); }
      } catch (e: any) { setMsg({ ok: false, text: e.message }); }
      if (--pending.current === 0) setBusy((b) => (b === 'save' ? '' : b));
    });
  };
  const setAttr = (name: string, value: string) => {
    const attrs = cur.current!.attributes;
    return attrs.some((a) => a.name.toLowerCase() === name.toLowerCase())
      ? attrs.map((a) => (a.name.toLowerCase() === name.toLowerCase() ? { ...a, value } : a))
      : [...attrs, { name: name.charAt(0).toUpperCase() + name.slice(1), value }];
  };

  const accept = (i: number) => {
    const s = sugs[i]; const v = (vals[i] ?? s.value ?? '').trim();
    if (!v) return setMsg({ ok: false, text: 'Enter a value before accepting.' });
    const c: Partial<Product> = s.field === 'attribute' ? { attributes: setAttr(s.attributeName || 'Attribute', v) } : { [s.field]: v };
    save(c); setSugs((prev) => prev.map((x, j) => (j === i ? { ...x, status: 'accepted' } : x)));
  };
  const reject = (i: number) => setSugs((prev) => prev.map((x, j) => (j === i ? { ...x, status: 'rejected' } : x)));

  const openDiff = () => guard('diff', async () => {
    const d = await api.diff(id);
    const live = d.live;
    if (!live) return;
    setDiff({ live, local: d.local });
    setPicked(Object.keys(FIELD_LABEL).filter((f) => fieldVal(live, f) !== fieldVal(d.local, f)));
  });
  const createInStore = () => guard('push', async () => {
    if (dirty) throw new Error('Save your changes first.');
    const created = await api.push(id, {});
    setMsg({ ok: true, text: `Created in WooCommerce as #${created.id}. See the Sync log for the payload.` });
    location.hash = `/product/${created.id}`;
  });
  const push = () => guard('push', async () => {
    const fields: PushFields = {};
    for (const f of picked) (fields as any)[f] = (cur.current as any)[f];
    const pushed = await api.push(id, fields); cur.current = pushed; setP(pushed); setDiff(null);
    setMsg({ ok: true, text: `Pushed to WooCommerce: ${picked.map((f) => FIELD_LABEL[f]).join(', ')}. Refresh the storefront to see it.` });
  });

  const inp = 'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm';
  const lbl = 'mb-1 block text-xs font-medium text-slate-600';
  const changed = diff ? Object.keys(FIELD_LABEL).filter((f) => fieldVal(diff.live, f) !== fieldVal(diff.local, f)) : [];

  return (
    <div className="space-y-4">
      <a href="#/catalog" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft size={14} />Catalog</a>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${bandCls(p.quality.band)}`}>{p.quality.score}% · {p.quality.band}</span>
        <span className="text-xs text-slate-500">sync: {p.syncStatus}</span>
        <StockBadge stock={p.stock} />
        {isDemo(p) && <span className="rounded bg-stone-200 px-1.5 text-[10px] text-slate-600">DEMO — local only, not in WooCommerce</span>}
      </div>
      {msg && <p className={`rounded-md p-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-stone-300 bg-white p-4">
          <h2 className="font-semibold">Product data</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={lbl}>Name</label><input className={inp} value={p.name} onChange={(e) => patch({ name: e.target.value })} /></div>
            <div><label className={lbl}>SKU</label><input className={inp} value={p.sku} onChange={(e) => patch({ sku: e.target.value })} /></div>
            <div><label className={lbl}>Price ({CURRENCY_LABEL})</label><input className={inp} value={p.price} onChange={(e) => patch({ price: e.target.value })} /></div>
            <div><label className={lbl}>Category</label><input className={inp} value={p.category} onChange={(e) => patch({ category: e.target.value })} /></div>
            <div><label className={lbl}>Stock (units, empty = not tracked)</label><input type="number" min="0" step="1" className={inp} value={p.stock ?? ''} onChange={(e) => patch({ stock: e.target.value === '' ? null : Number(e.target.value) })} /></div>
            <div className="col-span-2"><label className={lbl}>Short description</label><input className={inp} value={p.shortDescription} onChange={(e) => patch({ shortDescription: e.target.value })} /></div>
            <div className="col-span-2"><label className={lbl}>Description ({p.description.length} chars)</label><textarea rows={4} className={inp} value={p.description} onChange={(e) => patch({ description: e.target.value })} /></div>
            <div className="col-span-2"><label className={lbl}>Image URL</label><div className="flex items-center gap-3"><Thumb src={p.imageUrl} name={p.name} /><input className={inp} value={p.imageUrl ?? ''} onChange={(e) => patch({ imageUrl: e.target.value })} /></div>
            {p.imageUrl && !/\.(jpe?g|png|gif|webp)(\?[^#]*)?$/i.test(p.imageUrl) && <p className="mt-1 text-xs text-amber-700">WooCommerce needs the link to end in .jpg, .png, .gif or .webp.</p>}</div>
            <div className="col-span-2">
              <label className={lbl}>Attributes</label>
              {p.attributes.map((a, i) => (
                <div key={i} className="mb-1.5 flex gap-2">
                  <input className={inp + ' w-1/3'} value={a.name} onChange={(e) => patch({ attributes: p.attributes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <input className={inp} value={a.value} onChange={(e) => patch({ attributes: p.attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                  <button type="button" aria-label={`Remove attribute ${a.name}`} title="Remove attribute" onClick={() => patch({ attributes: p.attributes.filter((_, j) => j !== i) })} className="rounded-md px-2 text-slate-400 hover:bg-red-50 hover:text-red-600">×</button>
                </div>))}
              <button className="text-xs text-emerald-800 hover:underline" onClick={() => patch({ attributes: [...p.attributes, { name: '', value: '' }] })}>+ Add attribute</button>
            </div>
          </div>
          {isNewProduct(p) && <button type="button" onClick={async () => { if (!confirm('Delete this product from PawPIM? It has not been created in the store.')) return; try { await api.remove(p.id); notify('Product deleted.'); location.hash = '/catalog'; } catch (e: any) { notify(e.message, false); } }} className="mr-2 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">Delete product</button>}
          <button disabled={!!busy} onClick={() => save()} className="rounded-md bg-emerald-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
          {dirty && !busy && <span className="ml-3 text-xs font-medium text-amber-700">Unsaved changes</span>}
          {!dirty && !busy && savedAt && <span className="ml-3 text-xs font-medium text-emerald-700">✓ Saved at {savedAt}</span>}
        </section>

        <div className="space-y-4">
          <section className="rounded-lg border border-stone-300 bg-white p-4">
            <h2 className="mb-2 font-semibold">Quality issues</h2>
            {p.quality.issues.length ? <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-800">{p.quality.issues.map((i) => <li key={i.check}>{i.message}</li>)}</ul> : <p className="text-sm text-emerald-800">All checks pass.</p>}
          </section>

          <section className="space-y-3 rounded-lg border border-stone-300 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">AI suggestions</h2>
              <button disabled={!!busy} onClick={() => guard('ai', async () => { try { setSugs(await api.suggest(id)); setDemoAi(false); setAiDown(false); } catch (e: any) { setAiDown(/unavailable|not configured|CLI not found|CLI failed|timed out/i.test(e.message)); throw e; } setVals({}); })} className="flex items-center gap-1.5 rounded-md border border-emerald-800 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"><Sparkles size={15} />{busy === 'ai' ? 'Asking Claude…' : 'Generate suggestions'}</button>
            </div>
            {aiDown && <button onClick={() => guard('ai', async () => { setSugs(await api.demoSuggest(id)); setVals({}); setDemoAi(true); })} className="rounded-md border border-dashed border-slate-400 px-3 py-1.5 text-xs text-slate-700 hover:bg-stone-50">Claude isn't available. Use demo suggestions instead (rule-based, not from Claude)</button>}
            {demoAi && sugs.length > 0 && <p className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">DEMO MODE: these suggestions come from simple rules, not from Claude.</p>}
            {!sugs.length && <p className="text-sm text-slate-500">Claude only uses facts already on this product and asks you when something is missing. Nothing is applied until you accept it.</p>}
            {sugs.map((s, i) => (
              <div key={i} className={`rounded-md border p-3 text-sm ${s.status === 'pending' ? 'border-stone-300' : 'border-stone-200 bg-stone-50 opacity-70'}`}>
                <div className="mb-1.5 flex items-center gap-2">
                  <b>{s.field === 'attribute' ? `Attribute: ${s.attributeName}` : FIELD_LABEL[s.field]}</b>
                  <span className={`rounded px-1.5 text-[11px] ${srcCls[s.source]}`}>{srcLabel[s.source]}</span>
                  <span className="text-[11px] text-slate-500">{s.confidence} confidence</span>
                </div>
                {s.question && <p className="mb-1.5 text-slate-700">{s.question}</p>}
                {s.status === 'pending' ? <>
                  <textarea rows={s.field === 'description' ? 3 : 1} className={inp} placeholder={s.source === 'unknown' ? 'Your answer…' : ''} value={vals[i] ?? s.value ?? ''} onChange={(e) => setVals({ ...vals, [i]: e.target.value })} />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => accept(i)} className="flex items-center gap-1 rounded bg-emerald-800 px-2.5 py-1 text-xs font-medium text-white"><Check size={13} />Accept</button>
                    <button onClick={() => reject(i)} className="flex items-center gap-1 rounded border border-stone-300 px-2.5 py-1 text-xs"><X size={13} />Reject</button>
                  </div></> : <p className="text-xs">{s.status === 'accepted' ? 'Accepted and saved locally.' : 'Rejected.'}</p>}
              </div>))}
          </section>

          <section className="space-y-3 rounded-lg border border-stone-300 bg-white p-4">
            <h2 className="font-semibold">Sync to WooCommerce</h2>
            {isNewProduct(p) ? (
              <div className="space-y-2"><p className="text-sm text-slate-600">This product only exists in PawPIM. Creating it adds it to the store (its category is created if missing).</p>
                <button disabled={!!busy} onClick={createInStore} className="flex items-center gap-1.5 rounded-md bg-emerald-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"><UploadCloud size={15} />{busy === 'push' ? 'Creating…' : 'Create in WooCommerce'}</button></div>
            ) : isDemo(p) ? <p className="text-sm text-slate-600">Demo products are local sample data and can't be pushed. Import real products from WooCommerce to sync.</p> : !diff ? (
              <button disabled={!!busy} onClick={openDiff} className="flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"><UploadCloud size={15} />{busy === 'diff' ? 'Comparing…' : 'Review changes vs live store'}</button>
            ) : !changed.length ? <p className="text-sm text-slate-600">No differences from the live store.</p> : (
              <div className="space-y-2">
                {changed.map((f) => (
                  <label key={f} className="block rounded-md border border-stone-300 p-2.5 text-xs">
                    <span className="mb-1 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={picked.includes(f)} onChange={(e) => setPicked(e.target.checked ? [...picked, f] : picked.filter((x) => x !== f))} />{FIELD_LABEL[f]}</span>
                    <div className="whitespace-pre-wrap rounded bg-red-50 p-1.5 text-red-900">− {fieldVal(diff.live, f) || '(empty)'}</div>
                    <div className="mt-1 whitespace-pre-wrap rounded bg-emerald-50 p-1.5 text-emerald-900">+ {fieldVal(diff.local, f) || '(empty)'}</div>
                  </label>))}
                <button disabled={!!busy || !picked.length} onClick={push} className="rounded-md bg-emerald-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50">{busy === 'push' ? 'Pushing…' : `Push ${picked.length} approved field(s)`}</button>
              </div>)}
          </section>
        </div>
      </div>
    </div>
  );
}
