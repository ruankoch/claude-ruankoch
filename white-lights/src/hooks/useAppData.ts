import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, kvGet, kvSet } from '../db';
import { uid } from '../derive';
import { DEFAULT_EXERCISES, DEFAULT_SETTINGS, DEFAULT_TMS } from '../data/exercises';
import { MEET_HISTORY } from '../data/meetHistory';
import { sampleSets } from '../data/sample';
import {
  buildTombstoneRow,
  enqueue,
  enqueueSets,
  flush,
  LAST_SYNC_KEY,
  SYNC_URL_KEY,
} from '../sync/outbox';
import { jsonpGet, parseSheetMatrix } from '../sync/sheetSync';
import type {
  AppData,
  BackupBlob,
  Goal,
  SetRow,
  Settings,
  TrainingMaxes,
} from '../types';

const SETTINGS_KEY = 'settings';
const PLAN_KEY = 'plan';
const TMS_KEY = 'tms';

async function currentUnits(): Promise<Settings['units']> {
  const s = await kvGet<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  return s.units;
}

export interface AppApi {
  data: AppData;
  loaded: boolean;
  sync: { queued: number; lastSync: number | null; url: string };
  addExercise: (name: string) => string;
  addSet: (set: SetRow) => Promise<void>;
  addHistoric: (set: SetRow) => Promise<void>;
  deleteSet: (id: string) => Promise<void>;
  addGoal: (goal: Goal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  setNote: (date: string, text: string) => Promise<void>;
  setPlan: (key: string | null) => Promise<void>;
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  setTMs: (patch: Partial<TrainingMaxes>) => Promise<void>;
  importMeets: () => Promise<number>;
  loadSample: () => Promise<void>;
  clearAll: () => Promise<void>;
  importBackup: (blob: BackupBlob) => Promise<{ sets: number; exercises: number }>;
  setSyncUrl: (url: string) => Promise<void>;
  pullSync: () => Promise<{ added: number; removed: number }>;
  syncNow: () => Promise<{ remaining: number; added: number; removed: number }>;
}

export function useAppData(): AppApi {
  const [seeded, setSeeded] = useState(false);

  const exercises = useLiveQuery(() => db.exercises.toArray());
  const sets = useLiveQuery(() => db.sets.toArray());
  const goals = useLiveQuery(() => db.goals.toArray());
  const noteRows = useLiveQuery(() => db.notes.toArray());
  const settings = useLiveQuery(() => kvGet<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS));
  const plan = useLiveQuery(() => kvGet<string | null>(PLAN_KEY, null), [], null);
  const tms = useLiveQuery(() => kvGet<TrainingMaxes>(TMS_KEY, DEFAULT_TMS));
  const queued = useLiveQuery(() => db.outbox.count(), [], 0);
  const lastSync = useLiveQuery(() => kvGet<number | null>(LAST_SYNC_KEY, null), [], null);
  const syncUrl = useLiveQuery(() => kvGet<string>(SYNC_URL_KEY, ''), [], '');

  /* one-time seed + storage persistence + initial flush */
  useEffect(() => {
    (async () => {
      if ((await db.exercises.count()) === 0) {
        await db.exercises.bulkAdd(DEFAULT_EXERCISES);
      }
      if (!(await db.kv.get(SETTINGS_KEY))) await kvSet(SETTINGS_KEY, DEFAULT_SETTINGS);
      if (!(await db.kv.get(TMS_KEY))) await kvSet(TMS_KEY, DEFAULT_TMS);
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* not supported */
      }
      setSeeded(true);
      void flush();
    })();
  }, []);

  /* flush the outbox and pull the sheet when connectivity returns */
  useEffect(() => {
    const on = () => {
      void flush();
      void pullOnce();
    };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, []);

  /* pull + merge once on app start (after seed), so a fresh device/browser
     converges to the shared sheet without a manual tap */
  useEffect(() => {
    if (!seeded) return;
    void pullOnce();
  }, [seeded]);

  /* pull whenever the app returns to the foreground (tab refocus, iOS resume),
     so switching back after logging elsewhere quietly refreshes — no tap */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void flush();
        void pullOnce();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const loaded =
    seeded &&
    exercises !== undefined &&
    sets !== undefined &&
    goals !== undefined &&
    noteRows !== undefined &&
    settings !== undefined &&
    tms !== undefined;

  const notes: Record<string, string> = {};
  (noteRows || []).forEach((n) => {
    notes[n.date] = n.text;
  });

  const data: AppData = {
    exercises: exercises || [],
    sets: sets || [],
    goals: goals || [],
    notes,
    plan: plan ?? null,
    settings: settings || DEFAULT_SETTINGS,
    tms: tms || DEFAULT_TMS,
  };

  /* ---------- mutations ---------- */

  const addExercise = useCallback((name: string): string => {
    const ex = { id: uid(), name: name.trim() };
    void db.exercises.add(ex);
    return ex.id;
  }, []);

  const persistAndSync = useCallback(async (rows: SetRow[]) => {
    const stamped = rows.map((r) => ({ ...r, createdAt: r.createdAt ?? Date.now() }));
    await db.sets.bulkAdd(stamped);
    const exs = await db.exercises.toArray();
    await enqueueSets(stamped, exs, await currentUnits());
    void flush();
  }, []);

  const addSet = useCallback((set: SetRow) => persistAndSync([set]), [persistAndSync]);
  const addHistoric = useCallback((set: SetRow) => persistAndSync([set]), [persistAndSync]);

  const deleteSet = useCallback(async (id: string) => {
    const s = await db.sets.get(id);
    await db.sets.delete(id);
    if (s) {
      // append a delete tombstone so other devices drop this id on pull
      const exs = await db.exercises.toArray();
      const name = exs.find((e) => e.id === s.exId)?.name || '';
      await enqueue([buildTombstoneRow(s, name)]);
      void flush();
    }
  }, []);

  const addGoal = useCallback(async (goal: Goal) => {
    await db.goals.add(goal);
  }, []);

  const deleteGoal = useCallback(async (id: string) => {
    await db.goals.delete(id);
  }, []);

  const setNote = useCallback(async (date: string, text: string) => {
    if (text) await db.notes.put({ date, text });
    else await db.notes.delete(date);
  }, []);

  const setPlan = useCallback(async (key: string | null) => {
    await kvSet(PLAN_KEY, key || null);
  }, []);

  const setSettings = useCallback(async (patch: Partial<Settings>) => {
    const cur = await kvGet<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
    await kvSet(SETTINGS_KEY, { ...cur, ...patch });
  }, []);

  const setTMs = useCallback(async (patch: Partial<TrainingMaxes>) => {
    const cur = await kvGet<TrainingMaxes>(TMS_KEY, DEFAULT_TMS);
    await kvSet(TMS_KEY, { ...cur, ...patch });
  }, []);

  const importMeets = useCallback(async (): Promise<number> => {
    const existing = await db.sets.toArray();
    if (existing.some((s) => s.meet)) return 0;
    let exs = await db.exercises.toArray();
    const newExs: typeof exs = [];
    const get = (re: RegExp, name: string): string => {
      const f = exs.find((e) => re.test(e.name));
      if (f) return f.id;
      const c = { id: uid(), name };
      exs = [...exs, c];
      newExs.push(c);
      return c.id;
    };
    const sq = get(/low bar squat/i, 'Low Bar Squat');
    const bp = get(/^bench press$/i, 'Bench Press');
    const dl = get(/^deadlift$/i, 'Deadlift');

    const newSets: SetRow[] = [];
    const noteUpdates: { date: string; text: string }[] = [];
    MEET_HISTORY.forEach((m) => {
      const push = (exId: string, arr: [number, number][]) =>
        arr.forEach(([w, made]) => {
          newSets.push({
            id: uid(), exId, date: m.date, weight: w, reps: 1, rpe: null,
            hist: true, meet: true, miss: made ? undefined : true,
            createdAt: Date.now(),
          });
        });
      push(sq, m.squat);
      push(bp, m.bench);
      push(dl, m.dead);
      const line = `${m.name} — ${m.total} total @ ${m.bw}bw, IPF GL ${m.gl}`;
      noteUpdates.push({ date: m.date, text: line });
    });

    await db.transaction('rw', db.exercises, db.sets, db.notes, async () => {
      if (newExs.length) await db.exercises.bulkAdd(newExs);
      await db.sets.bulkAdd(newSets);
      for (const nu of noteUpdates) {
        const cur = await db.notes.get(nu.date);
        const text = cur?.text ? `${nu.text}\n${cur.text}` : nu.text;
        await db.notes.put({ date: nu.date, text });
      }
    });

    await enqueueSets(newSets, exs, await currentUnits());
    void flush();
    return newSets.length;
  }, []);

  const loadSample = useCallback(async () => {
    await db.sets.bulkAdd(sampleSets()); // sample data stays local, not synced
  }, []);

  const clearAll = useCallback(async () => {
    await db.transaction(
      'rw',
      [db.sets, db.exercises, db.goals, db.notes, db.kv, db.outbox],
      async () => {
        await Promise.all([
          db.sets.clear(),
          db.goals.clear(),
          db.notes.clear(),
          db.outbox.clear(),
        ]);
        await db.exercises.clear();
        await db.exercises.bulkAdd(DEFAULT_EXERCISES);
        await kvSet(SETTINGS_KEY, DEFAULT_SETTINGS);
        await kvSet(TMS_KEY, DEFAULT_TMS);
        await db.kv.delete(PLAN_KEY);
      },
    );
  }, []);

  const importBackup = useCallback(
    async (blob: BackupBlob): Promise<{ sets: number; exercises: number }> => {
      let addedSets = 0;
      let addedExs = 0;
      await db.transaction(
        'rw',
        [db.sets, db.exercises, db.goals, db.notes, db.kv],
        async () => {
          for (const ex of blob.exercises || []) {
            if (!(await db.exercises.get(ex.id))) {
              await db.exercises.add(ex);
              addedExs++;
            }
          }
          for (const s of blob.sets || []) {
            if (!(await db.sets.get(s.id))) {
              await db.sets.add({ ...s, createdAt: s.createdAt ?? Date.now() });
              addedSets++;
            }
          }
          for (const g of blob.goals || []) {
            if (!(await db.goals.get(g.id))) await db.goals.add(g);
          }
          for (const [date, text] of Object.entries(blob.notes || {})) {
            if (text) await db.notes.put({ date, text: text as string });
          }
          if (blob.settings) {
            const cur = await kvGet<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
            await kvSet(SETTINGS_KEY, { ...cur, ...blob.settings });
          }
          if (blob.tms) {
            const cur = await kvGet<TrainingMaxes>(TMS_KEY, DEFAULT_TMS);
            await kvSet(TMS_KEY, { ...cur, ...blob.tms });
          }
          if (blob.plan !== undefined) await kvSet(PLAN_KEY, blob.plan);
        },
      );
      return { sets: addedSets, exercises: addedExs };
    },
    [],
  );

  const setSyncUrl = useCallback(async (url: string) => {
    await kvSet(SYNC_URL_KEY, url.trim());
    void flush();
  }, []);

  /* Pull the sheet and merge: add sets whose id we lack (matching exercises by
     name, creating missing), drop sets whose id has a delete tombstone. */
  const pullSync = useCallback(async (): Promise<{ added: number; removed: number }> => {
    const url = await kvGet<string>(SYNC_URL_KEY, '');
    if (!url) return { added: 0, removed: 0 };
    const matrix = await jsonpGet(url);
    const { sets: rows, tombstones } = parseSheetMatrix(matrix);
    let added = 0;
    let removed = 0;
    await db.transaction('rw', [db.exercises, db.sets], async () => {
      const existing = await db.exercises.toArray();
      const byName = new Map<string, string>();
      existing.forEach((e) => byName.set(e.name.trim().toLowerCase(), e.id));

      for (const row of rows) {
        const id = row.id;
        if (!id || tombstones.has(id)) continue; // id-less rows can't dedupe; skip
        if (await db.sets.get(id)) continue; // already have it
        const key = row.name.trim().toLowerCase();
        let exId = byName.get(key);
        if (!exId) {
          exId = uid();
          byName.set(key, exId);
          await db.exercises.add({ id: exId, name: row.name.trim() });
        }
        await db.sets.add({
          id,
          exId,
          date: row.date,
          weight: row.weight,
          reps: row.reps,
          rpe: row.rpe,
          createdAt: Date.now(),
          ...(row.miss ? { miss: true as const } : {}),
          ...(row.source === 'meet'
            ? { hist: true as const, meet: true as const }
            : row.source === 'historic'
              ? { hist: true as const }
              : {}),
        });
        added++;
      }

      for (const tid of tombstones) {
        if (await db.sets.get(tid)) {
          await db.sets.delete(tid);
          removed++;
        }
      }
    });
    await db.kv.put({ key: LAST_SYNC_KEY, value: Date.now() });
    return { added, removed };
  }, []);

  const pullOnce = useCallback(async () => {
    try {
      await pullSync();
    } catch {
      /* offline or misconfigured — retry on next trigger */
    }
  }, [pullSync]);

  /* Sync now: push queued rows, then pull + merge. */
  const syncNow = useCallback(async () => {
    const remaining = await flush();
    let pulled = { added: 0, removed: 0 };
    try {
      pulled = await pullSync();
    } catch {
      /* leave remaining; pull can retry next time */
    }
    return { remaining, ...pulled };
  }, [pullSync]);

  return {
    data,
    loaded,
    sync: { queued: queued ?? 0, lastSync: lastSync ?? null, url: syncUrl ?? '' },
    addExercise,
    addSet,
    addHistoric,
    deleteSet,
    addGoal,
    deleteGoal,
    setNote,
    setPlan,
    setSettings,
    setTMs,
    importMeets,
    loadSample,
    clearAll,
    importBackup,
    setSyncUrl,
    pullSync,
    syncNow,
  };
}
