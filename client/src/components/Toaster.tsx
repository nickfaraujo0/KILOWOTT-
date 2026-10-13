import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { Toast } from '../services/toast';

export default function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setItems((x) => [...x.slice(-2), t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), t.ok ? 3500 : 7000);
    };
    addEventListener('toast', on);
    return () => removeEventListener('toast', on);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg ${t.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
          {t.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-700" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-red-700" />}
          <span>{t.text}</span>
        </div>))}
    </div>
  );
}
