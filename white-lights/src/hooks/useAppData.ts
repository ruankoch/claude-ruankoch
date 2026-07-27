import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, kvGet, kvSet } from '../db';
import { uid } from '../derive';
import { DEFAULT_EXERCISES, DEFAULT_SETTINGS, DEFAULT_TMS } from '../data/exercises';
import { PROGRAM, type ProgramDay, type StoredProgram } from '../program';
import { MEET_HISTORY } from '../data/meetHistory';
import { sampleSets } from '../data/sample';
import {
  buildGoalRow,
  buildGoalTombstoneRow,
  buildNoteRow,
  buildRow,
  buildTmRow,
  buildTombstoneRow,
  enqueue,
  enqueueSets,
  flush,
  hasPendingTm,
  LAST_SYNC_KEY,
  pendingNoteDates,
  SYNC_URL_KEY,
} from '../sync/outbox';
import { jsonpGet, parseSheetMatrix } from '../sync/sheetSync';
import type {
  AppData,
  BackupBlob,
  Goal,
  SetPatch,
  SetRow,
  Settings,
  TrainingMaxes,
} from '../types';

const SETTINGS_KEY = 'settings';
const PLAN_KEY = 'plan';
const TMS_KEY = 'tms';
const SELECTED_EX_KEY = 'selectedExId';
const PROGRAMS_KEY = 'programs';
const ACTIVE_PROGRAM_KEY = 'activeProgramId';

async function currentUnits(): Promise<Settings['units']> {
  const s = await kvGet<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  return s.units;
}

export interface AppApi {
  data: AppData;
  loaded: boolean;
  sync: { queued: number; lastSync: number | null; url: string };
  selectedExId: string;
  setSelectedExId: (id: string) => Promise<void>;
  programs: StoredProgram[];
  activeProgramId: string;
  setActiveProgram: (id: string) => Promise<void>;
  renameProgram: (id: string, name: string) => Promise<void>;
  addProgram: (name: string, days: ProgramDay[]) => Promise<string>;
  deleteProgram: (id: string) => Promise<void>;
  addExercise: (name: string) => string;
  deleteExercise: (id: string) => Promise<number>;
  addSet: (set: SetRow) => Promise<void>;
  addHistoric: (set: SetRow) => Promise<void>;
  updateSet: (id: string, patch: SetPatch) => Promise<void>;
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
  const selectedExId = useLiveQuery(() => kvGet<string>(SELECTED_EX_KEY, ''), [], '');
  const programs = useLiveQuery(() => kvGet<StoredProgram[]>(PROGRAMS_KEY, []), [], []);
  const activeProgramId = useLiveQuery(() => kvGet<string>(ACTIVE_PROGRAM_KEY, ''), [], '');

  /* one-time seed + storage persistence + initial flush */
  useEffect(() => {
    (async () => {
      if ((await db.exercises.count()) === 0) {
        await db.exercises.bulkAdd(DEFAULT_EXERCISES);
      }
      if (!(await db.kv.get(SETTINGS_KEY))) await kvSet(SETTINGS_KEY, DEFAULT_SETTINGS);
      if (!(await db.kv.get(TMS_KEY))) await kvSet(TMS_KEY, DEFAULT_TMS);
      if (!(await db.kv.get(PROGRAMS_KEY))) {
        await kvSet(PROGRAMS_KEY, [{ id: 'default', name: PROGRAM.name, days: PROGRAM.days }]);
      }
      if (!(await db.kv.get(ACTIVE_PROGRAM_KEY))) await kvSet(ACTIVE_PROGRAM_KEY, 'default');
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

  /* Delete an exercise and everything under it: its sets (each tombstoned so
     other devices drop them) and its goals. Returns the set count removed. */
  const deleteExercise = useCallback(async (id: string): Promise<number> => {
    const exSets = await db.sets.where('exId').equals(id).toArray();
    const exGoals = await db.goals.where('exId').equals(id).toArray();
    const ex = await db.exercises.get(id);
    const name = ex?.name || '';
    await db.transaction('rw', [db.sets, db.goals, db.exercises], async () => {
      await db.sets.where('exId').equals(id).delete();
      await db.goals.where('exId').equals(id).delete();
      await db.exercises.delete(id);
    });
    const tombs = [
      ...exSets.map((s) => buildTombstoneRow(s, name)),
      ...exGoals.map((g) => buildGoalTombstoneRow(g.id)),
    ];
    if (tombs.length) {
      await enqueue(tombs);
      void flush();
    }
    if ((await kvGet<string>(SELECTED_EX_KEY, '')) === id) await kvSet(SELECTED_EX_KEY, '');
    return exSets.length;
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

  /* Edit a set. Append-only sync can't mutate a row, so an edit is a replace:
     tombstone the old id and insert a new set (new id, same createdAt so it
     keeps its logging-order position) carrying the edited values. */
  const updateSet = useCallback(
    async (id: string, patch: SetPatch) => {
      const old = await db.sets.get(id);
      if (!old) return;
      const miss = patch.miss !== undefined ? patch.miss : old.miss;
      const updated: SetRow = {
        id: uid(),
        exId: patch.exId ?? old.exId,
        date: patch.date ?? old.date,
        weight: patch.weight ?? old.weight,
        reps: patch.reps ?? old.reps,
        rpe: patch.rpe !== undefined ? patch.rpe : old.rpe,
        createdAt: old.createdAt ?? Date.now(),
        ...(miss ? { miss: true as const } : {}),
        ...(old.hist ? { hist: true as const } : {}),
        ...(old.meet ? { meet: true as const } : {}),
      };
      const exs = await db.exercises.toArray();
      const nameOf = (exId: string) => exs.find((e) => e.id === exId)?.name || '';
      await db.transaction('rw', db.sets, async () => {
        await db.sets.delete(id);
        await db.sets.add(updated);
      });
      const units = await currentUnits();
      await enqueue([buildTombstoneRow(old, nameOf(old.exId)), buildRow(updated, nameOf(updated.exId), units)]);
      void flush();
    },
    [],
  );

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
    const exs = await db.exercises.toArray();
    const name = exs.find((e) => e.id === goal.exId)?.name || '';
    await enqueue([buildGoalRow(goal, name)]);
    void flush();
  }, []);

  const deleteGoal = useCallback(async (id: string) => {
    await db.goals.delete(id);
    await enqueue([buildGoalTombstoneRow(id)]);
    void flush();
  }, []);

  const setNote = useCallback(async (date: string, text: string) => {
    if (text) await db.notes.put({ date, text });
    else await db.notes.delete(date);
    await enqueue([buildNoteRow(date, text)]); // empty text propagates a clear
    void flush();
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
    const next = { ...cur, ...patch };
    await kvSet(TMS_KEY, next);
    await enqueue([buildTmRow(next)]); // publish to the sheet for other devices
    void flush();
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

  const setSelectedExId = useCallback(async (id: string) => {
    await kvSet(SELECTED_EX_KEY, id);
  }, []);

  const setActiveProgram = useCallback(async (id: string) => {
    await kvSet(ACTIVE_PROGRAM_KEY, id);
    await kvSet(PLAN_KEY, null); // day keys differ per program; clear the picked day
  }, []);

  const renameProgram = useCallback(async (id: string, name: string) => {
    const ps = await kvGet<StoredProgram[]>(PROGRAMS_KEY, []);
    await kvSet(
      PROGRAMS_KEY,
      ps.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
    );
  }, []);

  const addProgram = useCallback(async (name: string, days: ProgramDay[]): Promise<string> => {
    const ps = await kvGet<StoredProgram[]>(PROGRAMS_KEY, []);
    const id = uid();
    await kvSet(PROGRAMS_KEY, [...ps, { id, name: name.trim() || 'New program', days }]);
    await kvSet(ACTIVE_PROGRAM_KEY, id);
    await kvSet(PLAN_KEY, null);
    return id;
  }, []);

  const deleteProgram = useCallback(async (id: string) => {
    const ps = await kvGet<StoredProgram[]>(PROGRAMS_KEY, []);
    if (ps.length <= 1) return; // keep at least one
    const next = ps.filter((p) => p.id !== id);
    await kvSet(PROGRAMS_KEY, next);
    if ((await kvGet<string>(ACTIVE_PROGRAM_KEY, '')) === id) {
      await kvSet(ACTIVE_PROGRAM_KEY, next[0].id);
      await kvSet(PLAN_KEY, null);
    }
  }, []);

  /* Pull the sheet and merge: add sets whose id we lack (matching exercises by
     name, creating missing), drop sets whose id has a delete tombstone. */
  const pullSync = useCallback(async (): Promise<{ added: number; removed: number }> => {
    const url = await kvGet<string>(SYNC_URL_KEY, '');
    if (!url) return { added: 0, removed: 0 };
    const matrix = await jsonpGet(url);
    const { sets: rows, tombstones, tms, goals: goalRows, goalTombstones, notes: noteMap } =
      parseSheetMatrix(matrix);
    const pendingNotes = await pendingNoteDates();
    let added = 0;
    let removed = 0;
    await db.transaction('rw', [db.exercises, db.sets, db.goals, db.notes], async () => {
      const existing = await db.exercises.toArray();
      const byName = new Map<string, string>();
      existing.forEach((e) => byName.set(e.name.trim().toLowerCase(), e.id));
      const resolveEx = async (name: string): Promise<string> => {
        const key = name.trim().toLowerCase();
        let exId = byName.get(key);
        if (!exId) {
          exId = uid();
          byName.set(key, exId);
          await db.exercises.add({ id: exId, name: name.trim() });
        }
        return exId;
      };

      // preserve the sheet's row order (= logging order) for pulled sets
      let pulledSeq = Date.now();
      for (const row of rows) {
        const id = row.id;
        if (!id || tombstones.has(id)) continue; // id-less rows can't dedupe; skip
        if (await db.sets.get(id)) continue; // already have it
        const exId = await resolveEx(row.name);
        await db.sets.add({
          id,
          exId,
          date: row.date,
          weight: row.weight,
          reps: row.reps,
          rpe: row.rpe,
          createdAt: pulledSeq++,
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

      // goals: add unseen (matching exercise by name), drop tombstoned ids
      for (const g of goalRows) {
        if (goalTombstones.has(g.id) || (await db.goals.get(g.id))) continue;
        const exId = await resolveEx(g.name);
        await db.goals.add({ id: g.id, exId, reps: g.reps, weight: g.weight, label: g.label });
      }
      for (const gid of goalTombstones) {
        if (await db.goals.get(gid)) await db.goals.delete(gid);
      }

      // notes: last-write-wins per date, unless a local edit is still queued
      for (const [d, text] of noteMap) {
        if (pendingNotes.has(d)) continue;
        if (text === '') {
          await db.notes.delete(d);
        } else {
          const cur = await db.notes.get(d);
          if (!cur || cur.text !== text) await db.notes.put({ date: d, text });
        }
      }
    });

    // Apply the latest training maxes (last-write-wins), unless we have an
    // unsynced local TM change that hasn't reached the sheet yet.
    if (tms && !(await hasPendingTm())) {
      const cur = await kvGet<TrainingMaxes>(TMS_KEY, DEFAULT_TMS);
      if (cur.squat !== tms.squat || cur.bench !== tms.bench || cur.dead !== tms.dead) {
        await kvSet(TMS_KEY, tms);
      }
    }

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
    selectedExId: selectedExId ?? '',
    setSelectedExId,
    programs: programs ?? [],
    activeProgramId: activeProgramId ?? '',
    setActiveProgram,
    renameProgram,
    addProgram,
    deleteProgram,
    addExercise,
    deleteExercise,
    addSet,
    addHistoric,
    updateSet,
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
