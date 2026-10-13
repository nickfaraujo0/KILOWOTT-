export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="shrink-0">
      <rect width="48" height="48" rx="14" fill="#059669" />
      <path d="M24 12.5 38.5 20 24 27.5 9.5 20Z" fill="#fff" />
      <path d="M9.5 26.5 24 34l14.5-7.5" stroke="#fff" strokeOpacity=".8" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 33 24 40.5 38.5 33" stroke="#fff" strokeOpacity=".5" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38 4.5c.5 3.2 1.8 4.5 5 5-3.2.5-4.5 1.8-5 5-.5-3.2-1.8-4.5-5-5 3.2-.5 4.5-1.8 5-5Z" fill="#fcd34d" />
    </svg>
  );
}

export function Logo({ tagline = true }: { tagline?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={40} />
      <div className="leading-none">
        <div className="text-[19px] tracking-tight text-slate-900"><span className="font-medium">Paw</span><span className="font-extrabold text-emerald-600">PIM</span></div>
        {tagline && <div className="mt-1 whitespace-nowrap text-[9.5px] font-medium uppercase tracking-[0.12em] text-slate-400">Catalog intelligence</div>}
      </div>
    </div>
  );
}
