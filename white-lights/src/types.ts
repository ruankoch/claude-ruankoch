/* Shared data shapes. Sets are atomic; everything else is derived. */

export type Units = 'kg' | 'lb';
export type Formula = 'epley' | 'brzycki';

export interface SetRow {
  id: string; // uid, primary key
  exId: string;
  date: string; // 'YYYY-MM-DD', local calendar date — never Date objects
  weight: number;
  reps: number;
  rpe: number | null;
  miss?: true;
  warmup?: true; // logged but not counted as a working set
  hist?: true; // backdated PR entry
  meet?: true; // competition attempt
  createdAt?: number; // Date.now(), for sync ordering
}

export interface Exercise {
  id: string;
  name: string;
}

/** Editable fields of a set (used by the edit modal / updateSet). */
export interface SetPatch {
  exId?: string;
  date?: string;
  weight?: number;
  reps?: number;
  rpe?: number | null;
  miss?: boolean;
  warmup?: boolean;
}

export interface Goal {
  id: string;
  exId: string;
  reps: number | null; // null => e1RM target; otherwise an NRM target
  weight: number;
  label: string | null;
}

export interface Note {
  date: string; // primary key
  text: string;
}

export interface Settings {
  formula: Formula;
  rpeAdjust: boolean;
  units: Units;
  restSec: number;
  plates: boolean;
  collars: boolean;
}

/* Training maxes for the live program engine. */
export interface TrainingMaxes {
  squat: number;
  bench: number;
  dead: number;
}

export interface SyncState {
  queued: number;
  lastSync: number | null; // Date.now()
  lastError: string | null;
}

/* The artifact's single data blob, reassembled from Dexie tables so the
   ported components keep working against the same shape. */
export interface AppData {
  exercises: Exercise[];
  sets: SetRow[];
  goals: Goal[];
  notes: Record<string, string>;
  plan: string | null;
  settings: Settings;
  tms: TrainingMaxes;
}

/* The artifact's export/import backup format. */
export interface BackupBlob {
  exercises?: Exercise[];
  sets?: SetRow[];
  goals?: Goal[];
  notes?: Record<string, string>;
  plan?: string | null;
  settings?: Partial<Settings>;
  tms?: Partial<TrainingMaxes>;
}
