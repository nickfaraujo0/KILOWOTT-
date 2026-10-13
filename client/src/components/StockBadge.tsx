import { stockState } from '../../../shared/stock';

const cls = { out: 'bg-red-100 text-red-800', low: 'bg-amber-100 text-amber-800', ok: 'bg-emerald-100 text-emerald-800', untracked: 'bg-stone-200 text-slate-600' } as const;
export function StockBadge({ stock }: { stock?: number | null }) {
  const s = stockState(stock);
  const label = s === 'untracked' ? 'Not tracked' : s === 'out' ? 'Out of stock' : s === 'low' ? `Low: ${stock}` : `${stock} in stock`;
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls[s]}`}>{label}</span>;
}
