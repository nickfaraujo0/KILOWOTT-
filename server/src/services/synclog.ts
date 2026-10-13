import { db, tx } from './db.ts';
import { insertLogRow, toEntry, type SyncEntry } from './store.ts';
export type { SyncEntry };

export const readLog = (): SyncEntry[] => db.prepare('SELECT * FROM sync_log ORDER BY seq DESC LIMIT 200').all().map(toEntry);
export function addLog(e: Omit<SyncEntry, 'id' | 'ts'>) {
  tx(() => {
    const seq = ((db.prepare('SELECT MAX(seq) AS m FROM sync_log').get() as any).m ?? 0) + 1;
    insertLogRow(e, seq);
    db.prepare('DELETE FROM sync_log WHERE seq <= ?').run(seq - 200); // keep the latest 200
  });
}
export function markReverted(id: string) { db.prepare('UPDATE sync_log SET reverted = 1 WHERE id = ?').run(id); }
export function clearLog() { db.exec('DELETE FROM sync_log'); }
