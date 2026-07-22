/* Pure derivations: e1RM, goals, plate math, warm-ups, patterns, intensity,
   tonnage. Plain arrays in, plain data out — no Dexie, no React. This is the
   file the artifact's math is verified against (see derive.test.ts). */

import { isoShift } from './dates';
import type { Exercise, Goal, SetRow, Settings, Units } from './types';

export const round1 = (x: number): number => Math.round(x * 10) / 10;

/** Resolve a stored selection to a valid exercise id, falling back to the first
    (e.g. when nothing is selected yet or the selected lift was deleted). */
export function resolveExId(selected: string, exercises: Exercise[]): string {
  return selected && exercises.some((e) => e.id === selected)
    ? selected
    : exercises[0]?.id || '';
}

export const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ---------- plate palette (semantic in data viz) ---------- */

export const PLATE = {
  red: '#D23B33', // 25 kg
  blue: '#2E6DB4', // 20 kg
  yellow: '#E3B23C', // 15 kg
  green: '#3B8A5B', // 10 kg
  worn: '#B9B7AE', // 5 kg (worn white)
} as const;

const REP_COLORS = [PLATE.red, PLATE.blue, PLATE.yellow, PLATE.green, PLATE.worn];
export const colorForReps = (n: number): string =>
  REP_COLORS[(n - 1) % REP_COLORS.length];

/* ---------- e1RM ---------- */

export function e1rm(
  weight: number,
  reps: number,
  rpe: number | null,
  settings: Pick<Settings, 'formula' | 'rpeAdjust'>,
): number {
  let r = reps;
  if (settings.rpeAdjust && rpe != null && rpe < 10) r = reps + (10 - rpe);
  if (r <= 1) return weight;
  if (settings.formula === 'brzycki') {
    const rc = Math.min(r, 30);
    return (weight * 36) / (37 - rc);
  }
  return weight * (1 + r / 30);
}

/* ---------- goals ----------
   Goal.reps === null means an e1RM target; otherwise an actual NRM target. */

export const goalName = (g: Pick<Goal, 'reps'>): string =>
  g.reps == null ? 'e1RM' : `${g.reps}RM`;

export function goalMetBySet(
  goal: Goal,
  s: SetRow,
  settings: Settings,
): boolean {
  if (goal.reps == null) return e1rm(s.weight, s.reps, s.rpe, settings) >= goal.weight;
  return s.reps >= goal.reps && s.weight >= goal.weight;
}

export function goalBest(
  goal: Goal,
  exSets: SetRow[],
  settings: Settings,
): number {
  if (!exSets.length) return 0;
  if (goal.reps == null)
    return Math.max(...exSets.map((s) => e1rm(s.weight, s.reps, s.rpe, settings)));
  const ge = exSets.filter((s) => s.reps >= goal.reps!);
  return ge.length ? Math.max(...ge.map((s) => s.weight)) : 0;
}

/* ---------- plates & warm-ups ---------- */

const BAR: Record<Units, number> = { kg: 20, lb: 45 };
const COLLAR: Record<Units, number> = { kg: 2.5, lb: 5.5 }; // per collar (IPF comp)

/** Weight on the bar before any plates: bar itself + both collars if in use. */
export function loadOffset(units: Units, collars: boolean): number {
  return (BAR[units] || 20) + (collars ? 2 * (COLLAR[units] || 2.5) : 0);
}

export interface PlateDef {
  w: number;
  c: string;
  tc: string;
  h: number;
}

const KG_PLATES: PlateDef[] = [
  { w: 25, c: '#D23B33', tc: '#FFF', h: 40 },
  { w: 20, c: '#2E6DB4', tc: '#FFF', h: 36 },
  { w: 15, c: '#E3B23C', tc: '#101214', h: 32 },
  { w: 10, c: '#3B8A5B', tc: '#FFF', h: 28 },
  { w: 5, c: '#EDEDE8', tc: '#101214', h: 24 },
  { w: 2.5, c: '#7A2E28', tc: '#FFF', h: 20 },
  { w: 1.25, c: '#8C9196', tc: '#101214', h: 17 },
];
const LB_PLATES: PlateDef[] = [
  { w: 45, c: '#3A4046', tc: '#EDEDE8', h: 40 },
  { w: 35, c: '#454C53', tc: '#EDEDE8', h: 36 },
  { w: 25, c: '#515960', tc: '#EDEDE8', h: 32 },
  { w: 10, c: '#5D666E', tc: '#EDEDE8', h: 28 },
  { w: 5, c: '#69737C', tc: '#101214', h: 24 },
  { w: 2.5, c: '#75808A', tc: '#101214', h: 20 },
];

export function plateBreakdown(
  total: number,
  units: Units,
  collars: boolean,
): { plates: PlateDef[]; remainder: number } | null {
  let side = (total - loadOffset(units, collars)) / 2;
  if (side < -1e-9) return null;
  const defs = units === 'lb' ? LB_PLATES : KG_PLATES;
  const out: PlateDef[] = [];
  for (const p of defs) {
    while (side >= p.w - 1e-9) {
      out.push(p);
      side -= p.w;
    }
  }
  return { plates: out, remainder: Math.round(side * 100) / 100 };
}

/* warm-ups round to big plates only: 5s per side minimum increment */
const WARMUP_SCHEME = [
  { pct: 0, reps: 10 },
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 3 },
  { pct: 0.75, reps: 2 },
  { pct: 0.85, reps: 1 },
];

export function roundBigPlate(w: number, units: Units, collars: boolean): number {
  const base = loadOffset(units, collars);
  return base + 2 * Math.max(0, Math.round((w - base) / 2 / 5) * 5);
}

export function warmupRamp(
  work: number,
  units: Units,
  collars: boolean,
): { w: number; reps: number }[] {
  const base = loadOffset(units, collars);
  const rows: { w: number; reps: number }[] = [];
  WARMUP_SCHEME.forEach(({ pct, reps }) => {
    const w = pct === 0 ? base : Math.max(base, roundBigPlate(work * pct, units, collars));
    if (w >= work) return;
    const prev = rows[rows.length - 1];
    if (prev && prev.w === w) return;
    rows.push({ w, reps });
  });
  return rows;
}

export function perSideText(total: number, units: Units, collars: boolean): string {
  let side = (total - loadOffset(units, collars)) / 2;
  if (side <= 1e-9) return collars ? 'bar + collars' : 'empty bar';
  const denoms = units === 'lb' ? [45, 25, 10, 5] : [25, 20, 15, 10, 5];
  const parts: number[] = [];
  for (const p of denoms) {
    while (side >= p - 1e-9) {
      parts.push(p);
      side -= p;
    }
  }
  if (side > 0.01) parts.push(round1(side));
  return parts.join('+') + ' /side';
}

/* ---------- weight rounding for the live program engine ---------- */

export const round2_5 = (x: number): number => Math.round(x / 2.5) * 2.5;

/* ---------- movement patterns & intensity ---------- */

export const PATTERNS = ['Squat', 'Bench', 'Deadlift', 'Press', 'Other'] as const;
export type Pattern = (typeof PATTERNS)[number];

export const PATTERN_COLORS: Record<Pattern, string> = {
  Squat: PLATE.red,
  Bench: PLATE.blue,
  Deadlift: PLATE.yellow,
  Press: PLATE.green,
  Other: PLATE.worn,
};

export function patternOf(name: string): Pattern {
  const n = (name || '').toLowerCase();
  if (/squat/.test(n)) return 'Squat';
  if (/bench/.test(n)) return 'Bench';
  if (/deadlift|rdl|stiff.?leg/.test(n)) return 'Deadlift';
  if (/press|ohp/.test(n)) return 'Press';
  return 'Other';
}

export const INTENSITY_BANDS = [
  { k: '<60', lo: 0, hi: 60 },
  { k: '60–70', lo: 60, hi: 70 },
  { k: '70–80', lo: 70, hi: 80 },
  { k: '80–90', lo: 80, hi: 90 },
  { k: '90–95', lo: 90, hi: 95 },
  { k: '95+', lo: 95, hi: 1e9 },
];

export const fmtTon = (v: number, units: Units): string =>
  units === 'kg' ? `${round1(v / 1000)} t` : `${Math.round(v).toLocaleString()} lb`;

/** Best e1RM in the trailing 12 weeks (inclusive) before/at a set's date.
    Falls back to all-time when fewer than `minSessions` sessions in window. */
export function rollingDenominator(
  s: SetRow,
  exSets: SetRow[],
  settings: Settings,
  minSessions = 3,
): number | null {
  const from = isoShift(s.date, -84);
  const pool = exSets.filter((x) => x.date >= from && x.date <= s.date);
  const sessions = new Set(pool.map((x) => x.date)).size;
  const source = sessions >= minSessions ? pool : exSets.filter((x) => x.date <= s.date);
  return source.length
    ? Math.max(...source.map((x) => e1rm(x.weight, x.reps, x.rpe, settings)))
    : null;
}
