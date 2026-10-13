import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, MinusCircle, RefreshCw, ShoppingBag, Sparkles, XCircle } from 'lucide-react';
import { api, type Status, type SyncEntry } from '../services/api';

type State = 'ok' | 'bad' | 'off';
const pill: Record<State, string> = { ok: 'bg-emerald-50 text-emerald-700', bad: 'bg-red-50 text-red-700', off: 'bg-stone-100 text-slate-600' };
const Icon = ({ s }: { s: State }) => (s === 'ok' ? <CheckCircle2 size={14} /> : s === 'bad' ? <XCircle size={14} /> : <MinusCircle size={14} />);

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-t border-stone-100 py-2.5 text-sm"><span className="text-slate-500">{k}</span><span className="text-right font-medium">{v}</span></div>;
}

export default function Integrations() {
  const [s, setS] = useState<Status | null>(null);
  const [last, setLast] = useState<SyncEntry | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const test = () => {
    setBusy(true); setErr('');
    Promise.all([api.status(), api.syncLog().catch(() => []), api.list().catch(() => [])])
      .then(([st, log, list]) => { setS(st); setLast(log[0] ?? null); setCount(list.length); })
      .catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  useEffect(test, []);

  const woo = s?.woocommerce;
  const wooState: State = !woo ? 'off' : !woo.configured ? 'off' : woo.ok ? 'ok' : 'bad';
  const aiState: State = s?.anthropic.configured ? 'ok' : 'off';
  const provider = (s?.anthropic as any)?.provider;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Integrations</h1><p className="text-sm text-slate-600">Live connection status for the services PawPIM depends on.</p></div>
        <button onClick={test} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}Test connections</button>
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Server unreachable: {err}</p>}
      {!s && !err && <p className="flex items-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" />Checking connections…</p>}

      {s && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><ShoppingBag size={22} /></span><div><h2 className="font-semibold">WooCommerce</h2><p className="text-xs text-slate-500">REST API v3</p></div></div>
              <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${pill[wooState]}`}><Icon s={wooState} />{wooState === 'ok' ? (woo?.mock ? 'Connected (mock)' : 'Connected') : wooState === 'bad' ? 'Connection failed' : 'Not configured'}</span>
            </div>
            {wooState === 'off' && <p className="rounded-lg bg-stone-50 p-3 text-sm text-slate-600">Set <code>WOOCOMMERCE_STORE_URL</code>, <code>WOOCOMMERCE_CONSUMER_KEY</code> and <code>WOOCOMMERCE_CONSUMER_SECRET</code> in <code>server/.env</code>. Demo products stay local only.</p>}
            {wooState === 'bad' && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{woo?.error}</p>}
            {woo?.configured && <>
              <Row k="Store" v={<a className="inline-flex items-center gap-1 text-emerald-800 hover:underline" href={woo.url} target="_blank" rel="noopener noreferrer">{woo.url?.replace(/^https?:\/\//, '')}<ExternalLink size={12} /></a>} />
              <Row k="Mode" v={woo.mock ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">MOCK STORE (simulated)</span> : <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">LIVE STORE</span>} />
              <Row k="Products in PawPIM" v={count ?? '—'} />
              <Row k="Last sync" v={last ? <span className={last.ok ? 'text-emerald-700' : 'text-red-700'}>{last.action} · {last.name} · {new Date(last.ts).toLocaleString()}</span> : 'No syncs yet'} />
            </>}
            <div className="mt-3 border-t border-stone-100 pt-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What PawPIM uses</div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-slate-700">{['Read products and categories', 'Update fields you approve', 'Create new products', 'Stock levels, both ways', 'Orders for analytics', 'Drift check against the store'].map((c) => <li key={c} className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-600" />{c}</li>)}</ul></div>
          </section>

          <section className="card p-5">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Sparkles size={22} /></span><div><h2 className="font-semibold">Claude</h2><p className="text-xs text-slate-500">AI enrichment</p></div></div>
              <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${pill[aiState]}`}><Icon s={aiState} />{aiState === 'ok' ? 'Configured' : 'Not configured'}</span>
            </div>
            {aiState === 'off' && <p className="rounded-lg bg-stone-50 p-3 text-sm text-slate-600">Set <code>ANTHROPIC_API_KEY</code> and <code>ANTHROPIC_MODEL</code>, or <code>AI_PROVIDER=claude-cli</code> to use your Claude Code login, in <code>server/.env</code>. Without it, the app offers rule-based demo suggestions, clearly labelled.</p>}
            {aiState === 'ok' && <>
              <Row k="Provider" v={provider === 'claude-cli' ? 'Claude Code login (local CLI)' : 'Anthropic API'} />
              <Row k="Verification" v="Checked on the first suggestion request" />
            </>}
            <div className="mt-3 border-t border-stone-100 pt-3"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Guardrails</div>
              <ul className="space-y-1.5 text-sm text-slate-700">{['Uses only facts already on the product', 'Unknown values become questions, never guesses', 'Nothing is applied until you approve it', 'Every push is logged with its payload'].map((c) => <li key={c} className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-600" />{c}</li>)}</ul></div>
          </section>
        </div>)}
    </div>
  );
}
