import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api, type NewProduct as NewP } from '../services/api';
import { Thumb } from '../components/ScoreBar';
import { CURRENCY_LABEL } from '../services/money';

const empty: NewP = { name: '', sku: '', price: '', category: '', description: '', shortDescription: '', imageUrl: '', stock: null, attributes: [{ name: 'Material', value: '' }, { name: 'Color', value: '' }] };

export default function NewProduct() {
  const [f, setF] = useState<NewP>(empty);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (c: Partial<NewP>) => setF({ ...f, ...c });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const p = await api.create(f); location.hash = `/product/${p.id}`; } catch (x: any) { setErr(x.message); }
    setBusy(false);
  };
  const inp = 'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm';
  const lbl = 'mb-1 block text-xs font-medium text-slate-600';
  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      <a href="#/catalog" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft size={14} />Catalog</a>
      <h1 className="text-2xl font-bold tracking-tight">Add product</h1>
      <p className="text-sm text-slate-600">The product is saved locally first. Use "Create in WooCommerce" on its page when you are ready to publish it. Fields you leave empty will show up as quality issues.</p>
      {err && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <div className="grid grid-cols-2 gap-3 card p-4">
        <div className="col-span-2"><label className={lbl}>Name *</label><input required minLength={3} className={inp} value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div><label className={lbl}>SKU</label><input className={inp} value={f.sku} onChange={(e) => set({ sku: e.target.value })} /></div>
        <div><label className={lbl}>Price ({CURRENCY_LABEL})</label><input type="number" min="0" step="0.01" className={inp} value={f.price} onChange={(e) => set({ price: e.target.value })} /></div>
        <div><label className={lbl}>Stock (units)</label><input type="number" min="0" step="1" className={inp} value={f.stock ?? ''} onChange={(e) => set({ stock: e.target.value === '' ? null : Number(e.target.value) })} /></div>
        <div><label className={lbl}>Category</label><input className={inp} value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. Bags (created in the store if it does not exist)" /></div>
        <div className="col-span-2"><label className={lbl}>Short description</label><input className={inp} value={f.shortDescription} onChange={(e) => set({ shortDescription: e.target.value })} /></div>
        <div className="col-span-2"><label className={lbl}>Description ({f.description.length} chars, 80+ recommended)</label><textarea rows={4} className={inp} value={f.description} onChange={(e) => set({ description: e.target.value })} /></div>
        <div className="col-span-2"><label className={lbl}>Image URL</label>
          <div className="flex items-center gap-3"><Thumb src={f.imageUrl} name={f.name || '?'} /><input className={inp} value={f.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://.../photo.jpg" /></div>
          {f.imageUrl && !/\.(jpe?g|png|gif|webp)(\?[^#]*)?$/i.test(f.imageUrl) && <p className="mt-1 text-xs text-amber-700">WooCommerce needs the link to end in .jpg, .png, .gif or .webp.</p>}</div>
        <div className="col-span-2">
          <label className={lbl}>Attributes</label>
          {f.attributes.map((a, i) => (
            <div key={i} className="mb-1.5 flex gap-2">
              <input className={inp + ' w-1/3'} placeholder="Name" value={a.name} onChange={(e) => set({ attributes: f.attributes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input className={inp} placeholder="Value" value={a.value} onChange={(e) => set({ attributes: f.attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
              <button type="button" aria-label={`Remove attribute ${a.name}`} title="Remove attribute" onClick={() => set({ attributes: f.attributes.filter((_, j) => j !== i) })} className="rounded-md px-2 text-slate-400 hover:bg-red-50 hover:text-red-600">×</button>
            </div>))}
          <button type="button" className="text-xs text-emerald-800 hover:underline" onClick={() => set({ attributes: [...f.attributes, { name: '', value: '' }] })}>+ Add attribute</button>
        </div>
      </div>
      <button disabled={busy} className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50">{busy ? 'Saving…' : 'Save product'}</button>
    </form>
  );
}
