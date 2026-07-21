import type { Exercise, Settings, TrainingMaxes } from '../types';

export const DEFAULT_EXERCISES: Exercise[] = [
  { id: 'lbsq', name: 'Low Bar Squat' },
  { id: 'hbsq', name: 'High Bar Squat' },
  { id: 'bp', name: 'Bench Press' },
  { id: 'pbp', name: 'Paused Bench' },
  { id: 'dl', name: 'Deadlift' },
  { id: 'sdl', name: 'Sumo Deadlift' },
  { id: 'ohp', name: 'Overhead Press' },
];

export const DEFAULT_SETTINGS: Settings = {
  formula: 'epley',
  rpeAdjust: true,
  units: 'kg',
  restSec: 180,
  plates: true,
  collars: false,
};

/* Training maxes the program was authored against (Squat 220 / Bench 145 /
   Deadlift 270). These are the live inputs — edit in Settings and every
   remaining prescription recomputes. */
export const DEFAULT_TMS: TrainingMaxes = { squat: 220, bench: 145, dead: 270 };
