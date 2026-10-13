import type { QualityResult } from '../services/api';

const tone = { Good: ['bg-emerald-500', 'text-emerald-700', 'bg-emerald-50 border-emerald-200'], 'Needs work': ['bg-amber-500', 'text-amber-700', 'bg-amber-50 border-amber-200'], Poor: ['bg-red-500', 'text-red-700', 'bg-red-50 border-red-200'] } as const;

export function ScoreBar({ q }: { q: QualityResult }) {
  const [bar, text, box] = tone[q.band];
  return (
    <div className={`inline-flex w-28 shrink-0 items-center gap-2 rounded-md border px-2 py-1 ${box}`} title={q.band}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/80"><div className={`h-full ${bar}`} style={{ width: `${q.score}%` }} /></div>
      <span className={`text-xs font-semibold tabular-nums ${text}`}>{q.score}%</span>
    </div>
  );
}

export function Thumb({ src, name }: { src?: string; name: string }) {
  return src
    ? <img src={src} alt="" className="h-10 w-10 rounded-md border border-stone-200 object-cover" onError={(e) => ((e.currentTarget.style.visibility = 'hidden'))} />
    : <div className="flex h-10 w-10 items-center justify-center rounded-md bg-stone-200 text-sm font-bold text-slate-500">{name.slice(0, 1).toUpperCase()}</div>;
}
