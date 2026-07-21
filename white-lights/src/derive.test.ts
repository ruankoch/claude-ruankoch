import { describe, expect, it } from 'vitest';
import {
  e1rm, goalBest, goalMetBySet, goalName, loadOffset, perSideText, plateBreakdown,
  rollingDenominator, round2_5, warmupRamp,
} from './derive';
import type { Goal, SetRow, Settings } from './types';

const EPLEY: Pick<Settings, 'formula' | 'rpeAdjust'> = { formula: 'epley', rpeAdjust: false };
const BRZYCKI: Pick<Settings, 'formula' | 'rpeAdjust'> = { formula: 'brzycki', rpeAdjust: false };
const S = (over: Partial<Settings> = {}): Settings => ({
  formula: 'epley', rpeAdjust: true, units: 'kg', restSec: 180, plates: true, collars: false, ...over,
});

const set = (o: Partial<SetRow>): SetRow => ({
  id: Math.random().toString(36).slice(2), exId: 'x', date: '2025-01-01',
  weight: 100, reps: 5, rpe: null, ...o,
});

describe('e1rm', () => {
  it('returns the weight for a single', () => {
    expect(e1rm(200, 1, null, EPLEY)).toBe(200);
  });
  it('Epley: w * (1 + reps/30)', () => {
    expect(e1rm(100, 5, null, EPLEY)).toBeCloseTo(116.6667, 3);
    expect(e1rm(180, 3, null, EPLEY)).toBeCloseTo(198, 6);
  });
  it('Brzycki: w * 36 / (37 - reps)', () => {
    expect(e1rm(100, 5, null, BRZYCKI)).toBeCloseTo(112.5, 6);
  });
  it('RPE adjustment treats 3 @8 as 5 effective reps', () => {
    const adj = { formula: 'epley' as const, rpeAdjust: true };
    expect(e1rm(100, 3, 8, adj)).toBeCloseTo(e1rm(100, 5, null, EPLEY), 6);
  });
  it('caps Brzycki effective reps at 30', () => {
    expect(Number.isFinite(e1rm(60, 40, null, BRZYCKI))).toBe(true);
  });
});

describe('goals', () => {
  const eGoal: Goal = { id: 'g', exId: 'x', reps: null, weight: 150, label: null };
  const rGoal: Goal = { id: 'g2', exId: 'x', reps: 3, weight: 180, label: null };

  it('e1RM goal met when estimated 1RM clears target', () => {
    expect(goalMetBySet(eGoal, set({ weight: 140, reps: 3 }), S())).toBe(true); // 140*1.1=154
    expect(goalMetBySet(eGoal, set({ weight: 120, reps: 1 }), S())).toBe(false);
  });
  it('NRM goal needs both reps and weight', () => {
    expect(goalMetBySet(rGoal, set({ weight: 180, reps: 3 }), S())).toBe(true);
    expect(goalMetBySet(rGoal, set({ weight: 180, reps: 2 }), S())).toBe(false);
    expect(goalMetBySet(rGoal, set({ weight: 175, reps: 5 }), S())).toBe(false);
  });
  it('goalBest for NRM uses heaviest set at >= reps', () => {
    const sets = [set({ weight: 170, reps: 5 }), set({ weight: 185, reps: 3 }), set({ weight: 200, reps: 1 })];
    expect(goalBest(rGoal, sets, S())).toBe(185);
  });
  it('goalName', () => {
    expect(goalName(eGoal)).toBe('e1RM');
    expect(goalName(rGoal)).toBe('3RM');
  });
});

describe('plate math (kg)', () => {
  it('empty 20kg bar has no plates', () => {
    const bd = plateBreakdown(20, 'kg', false)!;
    expect(bd.plates).toHaveLength(0);
    expect(bd.remainder).toBe(0);
  });
  it('100kg = 40 per side = 25+15 (nearest big plates greedily)', () => {
    const bd = plateBreakdown(100, 'kg', false)!;
    expect(bd.plates.map((p) => p.w)).toEqual([25, 15]);
  });
  it('collars add 5kg to the base offset', () => {
    expect(loadOffset('kg', false)).toBe(20);
    expect(loadOffset('kg', true)).toBe(25);
    // 105 with collars: side = (105-25)/2 = 40 -> 25+15
    expect(plateBreakdown(105, 'kg', true)!.plates.map((p) => p.w)).toEqual([25, 15]);
  });
  it('per-side text', () => {
    expect(perSideText(100, 'kg', false)).toBe('25+15 /side');
    expect(perSideText(20, 'kg', false)).toBe('empty bar');
    expect(perSideText(25, 'kg', true)).toBe('bar + collars');
  });
  it('sub-bar weight returns null', () => {
    expect(plateBreakdown(10, 'kg', false)).toBeNull();
  });
});

describe('warm-up rounding', () => {
  it('rounds to 5kg-per-side increments below the work weight', () => {
    const rows = warmupRamp(200, 'kg', false);
    // every warm-up is on a big-plate rounding and strictly below work
    rows.forEach((r) => {
      expect(r.w).toBeLessThan(200);
      expect((r.w - 20) % 10).toBe(0); // 5kg/side => 10kg total increments
    });
    // first row is the empty bar
    expect(rows[0].w).toBe(20);
  });
  it('accounts for collars in the base', () => {
    const rows = warmupRamp(200, 'kg', true);
    expect(rows[0].w).toBe(25); // bar + collars
    rows.forEach((r) => expect((r.w - 25) % 10).toBe(0));
  });
});

describe('round2_5 (program engine rounding)', () => {
  it('snaps to the nearest 2.5', () => {
    expect(round2_5(166.6)).toBe(167.5);
    expect(round2_5(165.0)).toBe(165);
    expect(round2_5(163.7)).toBe(162.5);
  });
});

describe('rolling denominator', () => {
  const settings = S({ rpeAdjust: false });
  it('uses the trailing-12-week window when >= 3 sessions', () => {
    const exSets = [
      set({ date: '2025-01-01', weight: 100, reps: 1 }),
      set({ date: '2025-01-08', weight: 110, reps: 1 }),
      set({ date: '2025-01-15', weight: 120, reps: 1 }),
      set({ date: '2025-02-01', weight: 130, reps: 1 }),
    ];
    const target = exSets[3];
    // all four are within 12 weeks -> best e1RM = 130
    expect(rollingDenominator(target, exSets, settings)).toBe(130);
  });
  it('falls back to all-time-up-to-date when fewer than 3 sessions in window', () => {
    const exSets = [
      set({ date: '2024-01-01', weight: 200, reps: 1 }), // old but should count in fallback
      set({ date: '2025-06-01', weight: 150, reps: 1 }),
    ];
    const target = exSets[1];
    expect(rollingDenominator(target, exSets, settings)).toBe(200);
  });
});
