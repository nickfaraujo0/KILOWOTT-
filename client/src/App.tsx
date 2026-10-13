import { useEffect, useState } from 'react';
import { BarChart3, History, LayoutDashboard, Package, Plug, Sparkles } from 'lucide-react';
import { Logo, LogoMark } from './components/Logo';
import { api, type Status } from './services/api';
import Analytics from './pages/Analytics';
import AiEnrich from './pages/AiEnrich';
import Overview from './pages/Overview';
import Toaster from './components/Toaster';
import Catalog from './pages/Catalog';
import ProductDetail from './pages/ProductDetail';
import Integrations from './pages/Integrations';
import NewProduct from './pages/NewProduct';
import SyncLog from './pages/SyncLog';

type View = { page: 'overview' } | { page: 'analytics' } | { page: 'enrich' } | { page: 'catalog' } | { page: 'new' } | { page: 'synclog' } | { page: 'product'; id: number } | { page: 'integrations' };
const parse = (): View => {
  const h = location.hash.replace('#', '');
  if (h.startsWith('/product/')) return { page: 'product', id: Number(h.split('/')[2]) };
  if (h === '/new') return { page: 'new' };
  if (h === '/sync-log') return { page: 'synclog' };
  if (h === '/catalog') return { page: 'catalog' };
  if (h === '/ai-enrich') return { page: 'enrich' };
  if (h === '/analytics') return { page: 'analytics' };
  return h === '/integrations' ? { page: 'integrations' } : { page: 'overview' };
};

export default function App() {
  const [view, setView] = useState<View>(parse());
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => { api.status().then(setStatus).catch(() => setStatus(null)); }, [view.page]);
  useEffect(() => { const f = () => setView(parse()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const item = (on: boolean) => `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${on ? 'bg-emerald-50 text-emerald-800 md:before:absolute md:before:-left-5 md:before:top-2 md:before:bottom-2 md:before:w-1 md:before:rounded-r md:before:bg-emerald-600' : 'text-slate-600 hover:bg-stone-100 hover:text-slate-900'}`;
  const nav = (
    <nav className="space-y-1">
      <a href="#/" className={item(view.page === 'overview')}><LayoutDashboard size={18} />Overview</a>
      <a href="#/catalog" className={item(['catalog', 'product', 'new'].includes(view.page))}><Package size={18} />Product catalog</a>
      <a href="#/analytics" className={item(view.page === 'analytics')}><BarChart3 size={18} />Analytics</a>
      <a href="#/ai-enrich" className={item(view.page === 'enrich')}><Sparkles size={18} />AI Enrich</a>
      <a href="#/sync-log" className={item(view.page === 'synclog')}><History size={18} />Sync log</a>
      <a href="#/integrations" className={item(view.page === 'integrations')}><Plug size={18} />Integrations</a>
    </nav>
  );
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-stone-200 bg-white p-5 md:flex">
        <a href="#/" className="mb-9 block px-1"><Logo /></a>
        <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Workspace</div>
        {nav}
        <div className="mt-auto rounded-xl border border-stone-200 bg-stone-50 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <span className={`h-2 w-2 rounded-full ${status?.woocommerce.ok ? 'bg-emerald-500' : status ? 'bg-red-500' : 'bg-slate-400'}`} />
            {status?.woocommerce.ok ? (status.woocommerce.mock ? 'Mock store connected' : 'Live store connected') : status ? 'Store not connected' : 'Checking…'}
          </div>
          <div className="mt-1 truncate text-[11px] text-slate-500">{status?.woocommerce.url?.replace(/^https?:\/\//, '') ?? 'WooCommerce REST API'}</div>
          <div className="mt-2 border-t border-stone-200 pt-2 text-[10.5px] leading-snug text-slate-400">AI suggestions are drafts. Every change is reviewed before it reaches your store.</div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-stone-200 bg-white px-4 py-3 md:hidden">
          <div className="mb-2 flex items-center gap-2 text-slate-900"><LogoMark size={26} /><span className="font-medium">Paw<b className="text-emerald-600">PIM</b></span></div>
          <div className="-mx-1 flex gap-1 overflow-x-auto pb-1 [&_nav]:flex [&_nav]:space-y-0 [&_nav]:gap-1 [&_a]:whitespace-nowrap [&_a]:px-3 [&_a]:py-2">{nav}</div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8 md:px-8">
          {view.page === 'overview' && <Overview />}
          {view.page === 'catalog' && <Catalog />}
          {view.page === 'enrich' && <AiEnrich />}
          {view.page === 'analytics' && <Analytics />}
          {view.page === 'product' && <ProductDetail key={view.id} id={view.id} />}
          {view.page === 'integrations' && <Integrations />}
          {view.page === 'new' && <NewProduct />}
          {view.page === 'synclog' && <SyncLog />}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
