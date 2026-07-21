import { uid } from '../derive';
import type { SetRow } from '../types';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

/** 12 weeks of sample data across squat / bench / deadlift. */
export function sampleSets(): SetRow[] {
  const out: SetRow[] = [];
  const start = new Date();
  start.setDate(start.getDate() - 12 * 7);
  const lifts = [
    { id: 'lbsq', base: 150 },
    { id: 'bp', base: 105 },
    { id: 'dl', base: 190 },
  ];
  for (let w = 0; w < 12; w++) {
    lifts.forEach((L) => {
      // Session A: fives
      const dA = new Date(start);
      dA.setDate(dA.getDate() + w * 7 + (L.id === 'dl' ? 3 : 0));
      const dateA = iso(dA);
      const topA = L.base * (1 + w * 0.008) * (0.98 + Math.random() * 0.03);
      const wA = Math.round((topA * 0.87) / 2.5) * 2.5;
      for (let s = 0; s < 3; s++)
        out.push({ id: uid(), exId: L.id, date: dateA, weight: wA, reps: 5, rpe: 7.5 + s * 0.5, createdAt: Date.now() });
      // Session B: triples, or heavy single every 4th week
      const dB = new Date(dA);
      dB.setDate(dB.getDate() + 3);
      const dateB = iso(dB);
      if (w % 4 === 3) {
        const single = Math.round((topA * 0.985) / 2.5) * 2.5;
        out.push({ id: uid(), exId: L.id, date: dateB, weight: single, reps: 1, rpe: 9, createdAt: Date.now() });
        out.push({ id: uid(), exId: L.id, date: dateB, weight: Math.round((single * 0.9) / 2.5) * 2.5, reps: 3, rpe: 8, createdAt: Date.now() });
      } else {
        const wB = Math.round((topA * 0.93) / 2.5) * 2.5;
        for (let s = 0; s < 3; s++)
          out.push({ id: uid(), exId: L.id, date: dateB, weight: wB, reps: 3, rpe: 7.5 + s * 0.5, createdAt: Date.now() });
      }
    });
  }
  return out;
}
