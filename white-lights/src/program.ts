/* Live program engine. The embedded program stores reference loads at the
   authoring TMs; competition-lift loads rescale to the user's current
   training maxes. Bump squat TM to 230 and every remaining squat prescription
   updates — the spreadsheet's linked-cell behaviour, natively. */

import { round2_5 } from './derive';
import { DEFAULT_TMS } from './data/exercises';
import type { ProgramItem } from './data/program';
import type { Exercise, TrainingMaxes } from './types';

export { PROGRAM } from './data/program';
export type { ProgramItem, ProgramDay } from './data/program';

type TmKey = keyof TrainingMaxes;

/** Which training max drives this item's load, if any. */
export function tmKeyFor(item: ProgramItem): TmKey | null {
  const n = item.ex.toLowerCase();
  if (!n.includes('competition')) return null;
  if (n.includes('squat')) return 'squat';
  if (n.includes('bench')) return 'bench';
  if (n.includes('deadlift')) return 'dead';
  return null;
}

/** Live load for a program item given current TMs.
    Round-trips exactly to the reference load at the default TMs. */
export function computeLoad(item: ProgramItem, tms: TrainingMaxes): number | null {
  if (item.load == null) return null;
  const k = tmKeyFor(item);
  if (!k) return item.load;
  return round2_5((item.load / DEFAULT_TMS[k]) * tms[k]);
}

/** Match a program item to a logged exercise, porting the artifact's rules. */
export function resolveProgramExercise(
  item: ProgramItem,
  exercises: Exercise[],
): Exercise | null {
  const name = item.ex.toLowerCase().trim();
  const find = (re: RegExp, not?: RegExp) =>
    exercises.find((e) => re.test(e.name) && (!not || !not.test(e.name)));
  if (name.includes('bench') && /pause/i.test(item.note || ''))
    return find(/paused bench/i) || find(/bench/i) || null;
  if (name === 'competition squat')
    return find(/low bar squat/i) || find(/^squat$/i) || find(/squat/i, /belt|high bar|pin/i) || null;
  if (name === 'competition bench')
    return find(/^bench press$/i) || find(/bench/i, /paused|close|pin/i) || null;
  if (name === 'competition deadlift')
    return find(/^deadlift$/i) || find(/deadlift/i, /sumo|romanian|stiff/i) || null;
  return exercises.find((e) => e.name.toLowerCase() === name) || null;
}
