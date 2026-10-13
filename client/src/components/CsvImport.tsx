import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api, type CsvPreview } from '../services/api';

const pill: Record<string, string> = { update: 'bg-amber-100 text-amber-800', create: 'bg-sky-100 text-sky-800', unchanged: 'bg-stone-100 text-slate-600', error: 'bg-red-100 text-red-800' };

// Two-step CSV import: a preview of what will change, then an explicit Apply.
export function CsvImport({ file, onClose, onDone }: { file: File; onClose: () => void; onDone: (counts: CsvPreview['counts']) => void }) {
  const [text, setText] = useState(''); const [prev, setPrev] = useState<CsvPreview | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    file.text().then((t) => { setText(t); return api.importCsv(t, true); }).then(setPrev).catch((e) => setErr(e.message));
  }, [file]);
  const ok = prev ? prev.counts.update + prev.counts.create : 0;
  const apply = async () => {
    setBusy(true); setErr('');
    try { const r = await api.importCsv(text, false); onDone(r.counts); } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Import CSV">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div><h2 className="font-semibold">Import CSV</h2><p className="text-xs text-slate-500">{file.name}. Rows are matched by SKU. Blank cells keep the current value. Nothing is sent to the store until you push.</p></div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-stone-100"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {!prev && !err && <p className="flex items-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" />Reading file…</p>}
          {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</p>}
          {prev && <>
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              {(['update', 'create', 'unchanged', 'error'] as const).map((k) => <span key={k} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pill[k]}`}>{prev.counts[k]} {k === 'update' ? 'to update' : k === 'create' ? 'to create' : k}</span>)}
            </div>
            {!!prev.ignoredColumns.length && <p className="mb-3 text-xs text-slate-500">Ignored columns: {prev.ignoredColumns.join(', ')}</p>}
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1.5 pr-3">Row</th><th className="pr-3">Product</th><th className="pr-3">Result</th><th>Details</th></tr></thead>
              <tbody>
                {prev.rows.slice(0, 200).map((r) => (
                  <tr key={r.row} className="border-t border-stone-100 align-top">
                    <td className="py-2 pr-3 text-slate-500">{r.row}</td>
                    <td className="py-2 pr-3">{r.name || '—'}<div className="text-xs text-slate-500">{r.sku || 'no SKU'}</div></td>
                    <td className="py-2 pr-3"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${pill[r.action]}`}>{r.action}</span></td>
                    <td className="py-2 text-xs text-slate-600">{r.error ? <span className="text-red-700">{r.error}</span> : r.changes.join(', ')}</td>
                  </tr>))}
              </tbody>
            </table>
            {prev.rows.length > 200 && <p className="mt-2 text-xs text-slate-500">Showing the first 200 of {prev.rows.length} rows.</p>}
          </>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-5 py-3">
          {prev?.counts.error ? <span className="mr-auto text-xs text-slate-500">Rows with errors are skipped; the rest are applied.</span> : null}
          <button onClick={onClose} className="rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-stone-50">Cancel</button>
          <button disabled={!ok || busy} onClick={apply} className="flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50">{busy && <Loader2 size={15} className="animate-spin" />}Apply {ok || ''} change{ok === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}
