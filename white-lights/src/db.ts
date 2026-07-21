import Dexie, { type Table } from 'dexie';
import type { Exercise, Goal, Note, SetRow } from './types';

export interface KV {
  key: string;
  value: unknown;
}

export interface OutboxRow {
  seq?: number;
  row: (string | number)[]; // the sheet row: date, exercise, weight, reps, rpe, miss, source, id
}

export class WLDB extends Dexie {
  sets!: Table<SetRow, string>;
  exercises!: Table<Exercise, string>;
  goals!: Table<Goal, string>;
  notes!: Table<Note, string>;
  kv!: Table<KV, string>;
  outbox!: Table<OutboxRow, number>;

  constructor() {
    super('white-lights');
    this.version(1).stores({
      sets: 'id, exId, date, [exId+date]',
      exercises: 'id, name',
      goals: 'id, exId',
      notes: 'date',
      kv: 'key',
      outbox: '++seq',
    });
  }
}

export const db = new WLDB();

/* --- kv helpers --- */

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}
