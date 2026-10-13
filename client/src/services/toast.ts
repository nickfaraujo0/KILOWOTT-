// Tiny toast bus: notify() from anywhere, <Toaster /> renders them.
export type Toast = { id: number; text: string; ok: boolean };
let n = 0;
export const notify = (text: string, ok = true) => window.dispatchEvent(new CustomEvent<Toast>('toast', { detail: { id: ++n, text, ok } }));
