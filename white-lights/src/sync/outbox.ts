/* The outbox: every synced write enqueues a sheet row here; a flusher drains
   it on app start, `online`, and after each enqueue. Deletes/edits do NOT
   sync — the Sheet is a ledger of what was logged, not a mirror. */

import { db, kvGet, type OutboxRow } from '../db';
import { postRows, type SheetRow } from './sheets';
import { uid } from '../derive';
import { todayStr } from '../dates';
import type { Exercise, SetRow, TrainingMaxes, Units } from '../types';

export const SYNC_URL_KEY = 'syncUrl';
export const LAST_SYNC_KEY = 'lastSync';

/** Row format mirrors the CSV export, with a trailing id for self-dedupe:
    date, exercise, weight_<units>, reps, rpe, miss, source, id */
export function buildRow(s: SetRow, exName: string, _units: Units): SheetRow {
  return [
    s.date,
    exName,
    s.weight,
    s.reps,
    s.rpe ?? '',
    s.miss ? 1 : '',
    s.meet ? 'meet' : s.hist ? 'historic' : '',
    s.id,
  ];
}

/** A tombstone row: source 'delete' marks the id for removal on other devices.
    Original fields are echoed so the row stays human-readable in the sheet. */
export function buildTombstoneRow(s: SetRow, exName: string): SheetRow {
  return [s.date, exName, s.weight, s.reps, s.rpe ?? '', s.miss ? 1 : '', 'delete', s.id];
}

/** A training-maxes row (source 'tm'): squat/bench/dead ride the weight/reps/rpe
    columns. The latest such row in the sheet wins (append order = write order). */
export const TM_SOURCE = 'tm';
export function buildTmRow(tms: TrainingMaxes): SheetRow {
  return [todayStr(), 'Training maxes', tms.squat, tms.bench, tms.dead, '', TM_SOURCE, 'tm-' + uid()];
}

/** True if a training-maxes change is still queued (unsynced) locally. */
export async function hasPendingTm(): Promise<boolean> {
  const rows = await db.outbox.toArray();
  return rows.some((r) => r.row[6] === TM_SOURCE);
}

export async function enqueue(rows: SheetRow[]): Promise<void> {
  if (!rows.length) return;
  await db.outbox.bulkAdd(rows.map((row) => ({ row }) as OutboxRow));
}

export async function enqueueSets(sets: SetRow[], exercises: Exercise[], units: Units): Promise<void> {
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name || id;
  await enqueue(sets.map((s) => buildRow(s, nameOf(s.exId), units)));
}

let flushing = false;

/** Drain the outbox in one batch. Returns rows still queued afterwards.
    Never throws — failures leave rows in place for the next attempt. */
export async function flush(): Promise<number> {
  if (flushing) return db.outbox.count();
  flushing = true;
  try {
    const url = await kvGet<string>(SYNC_URL_KEY, '');
    const pending = await db.outbox.orderBy('seq').toArray();
    if (!url || pending.length === 0) return pending.length;

    await postRows(url, pending.map((p) => p.row));
    // Delivered — drop exactly the rows we sent (new enqueues have higher seq).
    await db.outbox.bulkDelete(pending.map((p) => p.seq!).filter((n) => n != null));
    await db.kv.put({ key: LAST_SYNC_KEY, value: Date.now() });
    return db.outbox.count();
  } catch {
    return db.outbox.count();
  } finally {
    flushing = false;
  }
}
