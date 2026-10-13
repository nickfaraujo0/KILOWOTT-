import { useState } from 'react';

const nice = (max: number) => { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)); const n = max / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

export function AreaChart({ data, format, color = '#047857' }: { data: { label: string; value: number }[]; format: (n: number) => string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 220, L = 8, R = 8, T = 12, B = 26;
  const max = nice(Math.max(...data.map((d) => d.value), 1));
  const x = (i: number) => L + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - B} L${x(0).toFixed(1)},${H - B} Z`;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const step = Math.max(1, Math.ceil(data.length / 6));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Trend chart"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width * W - L) / ((W - L - R) / Math.max(1, data.length - 1))); setHover(Math.min(data.length - 1, Math.max(0, i))); }}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e7e0d6" strokeDasharray="3 4" /><text x={L} y={y(t) - 3} fontSize="10" fill="#94a3b8">{t === 0 ? '' : format(t)}</text></g>)}
        <path d={area} fill={color} fillOpacity=".1" /><path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {data.map((d, i) => (i % step === 0 || i === data.length - 1) && <text key={i} x={x(i)} y={H - 8} fontSize="10" fill="#94a3b8" textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>{d.label}</text>)}
        {hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke={color} strokeOpacity=".35" /><circle cx={x(hover)} cy={y(data[hover].value)} r="4.5" fill="#fff" stroke={color} strokeWidth="2.5" /></g>}
      </svg>
      {hover !== null && <div className="pointer-events-none absolute top-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 50px), calc(100% - 110px))` }}><div className="text-slate-300">{data[hover].label}</div><b>{format(data[hover].value)}</b></div>}
    </div>
  );
}

export function BarList({ items, format, color = 'bg-emerald-600' }: { items: { label: string; value: number; sub?: string }[]; format: (n: number) => string; color?: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (!items.length) return <p className="text-sm text-slate-500">No data for this period.</p>;
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate font-medium">{i.label}{i.sub && <span className="ml-2 text-xs font-normal text-slate-500">{i.sub}</span>}</span><span className="tabular-nums text-slate-600">{format(i.value)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${(i.value / max) * 100}%` }} /></div>
        </li>))}
    </ul>
  );
}

const PALETTE = ['#047857', '#f59e0b', '#ef4444', '#64748b', '#0ea5e9', '#a855f7'];
export function Donut({ items, colors }: { items: { label: string; value: number }[]; colors?: Record<string, string> }) {
  const total = items.reduce((n, i) => n + i.value, 0);
  if (!total) return <p className="text-sm text-slate-500">No data for this period.</p>;
  const R = 52, C = 2 * Math.PI * R; let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label="Breakdown chart">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#f1ece4" strokeWidth="18" />
        {items.map((i, k) => { const len = (i.value / total) * C; const el = <circle key={i.label} cx="70" cy="70" r={R} fill="none" stroke={colors?.[i.label] ?? PALETTE[k % PALETTE.length]} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />; offset += len; return el; })}
        <text x="70" y="70" transform="rotate(90 70 70)" textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 text-[22px] font-bold">{total}</text>
      </svg>
      <ul className="space-y-1.5 text-sm">{items.map((i, k) => <li key={i.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors?.[i.label] ?? PALETTE[k % PALETTE.length] }} /><span className="capitalize">{i.label}</span><span className="tabular-nums text-slate-500">{i.value}</span></li>)}</ul>
    </div>
  );
}

export function Sparkline({ values, color = '#10b981', height = 44 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const W = 160, max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, height - 4 - ((v - min) / (max - min || 1)) * (height - 10)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" preserveAspectRatio="none" aria-hidden="true" style={{ height }}>
      <path d={`${line} L${W},${height} L0,${height} Z`} fill={color} fillOpacity=".1" /><path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
