import { Fragment, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Undo2, XCircle } from 'lucide-react';
import { api, type SyncEntry } from '../services/api';
import { notify } from '../services/toast';

export default function SyncLog() {
  const [rows, setRows] = useState<SyncEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const load = () => api.syncLog().then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const revert = async (r: SyncEntry) => {
    setBusy(r.id); setErr('');
    try { await api.revert(r.id); notify(`Reverted ${r.name} to its previous values in the store.`); setAsking(null); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(null);
  };
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold tracking-tight">Sync log</h1><p className="text-sm text-slate-600">Every push to WooCommerce, with the exact payload that was sent. Any update can be undone.</p></div>
      {err && <p className="text-red-700">{err}</p>}
      {rows && !rows.length && <p className="card p-6 text-center text-slate-500">No syncs yet. Push a product to WooCommerce and it will appear here.</p>}
      {!!rows?.length && (
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 text-left text-xs uppercase text-slate-500"><tr>{['Time', 'Action', 'Store', 'Product', 'Result', 'Latency', ''].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-t border-stone-200">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{new Date(r.ts).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 font-medium">{r.action}{r.revertOf && <div className="text-xs font-normal text-slate-500">undo of an earlier push</div>}</td>
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.mode === 'mock' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{r.mode === 'mock' ? 'MOCK STORE' : 'LIVE STORE'}</span></td>
                    <td className="px-3 py-2">{r.name}<div className="text-xs text-slate-500">{r.sku || 'no SKU'}</div></td>
                    <td className="px-3 py-2">{r.ok ? <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14} />OK</span> : <span className="flex items-center gap-1 text-red-700"><XCircle size={14} />Failed</span>}{r.reverted && <div className="mt-0.5 text-xs font-medium text-slate-500">Reverted</div>}{r.error && <div className="max-w-xs text-xs text-red-700">{r.error}</div>}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">{r.latencyMs} ms</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {r.action === 'update' && r.ok && !r.reverted && r.before && Object.keys(r.before).length > 0 && (asking === r.id
                        ? <span className="mr-3 inline-flex items-center gap-2 text-xs"><span className="text-slate-600">Restore the previous values?</span><button disabled={busy === r.id} className="rounded-md bg-emerald-800 px-2 py-1 font-medium text-white hover:bg-emerald-900 disabled:opacity-50" onClick={() => revert(r)}>{busy === r.id ? <Loader2 size={12} className="animate-spin" /> : 'Yes, revert'}</button><button className="text-slate-500 hover:underline" onClick={() => setAsking(null)}>No</button></span>
                        : <button className="mr-3 inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-emerald-800" onClick={() => setAsking(r.id)}><Undo2 size={13} />Revert</button>)}
                      <button className="text-xs font-medium text-emerald-800 hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide payload' : 'View payload'}</button></td>
                  </tr>
                  {open === r.id && <tr className="bg-stone-50"><td colSpan={7} className="px-3 py-2">{r.before && <><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Store values before this push</div><pre className="mb-2 max-h-48 overflow-auto rounded-md bg-slate-800 p-3 text-xs text-amber-100">{JSON.stringify(r.before, null, 2)}</pre><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Payload sent</div></>}<pre className="max-h-72 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-emerald-100">{JSON.stringify(r.payload, null, 2)}</pre></td></tr>}
                </Fragment>))}
            </tbody>
          </table>
        </div>)}
    </div>
  );
}
