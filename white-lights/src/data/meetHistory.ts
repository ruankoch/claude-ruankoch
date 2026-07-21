/* Meet history from the comp scoresheet. Every attempt: [weight, made].
   Misses import as miss-flagged singles. WC Provincials 2024 DL-2 was
   ambiguous on the sheet — omitted; add via Historic PRs if needed. */

export interface Meet {
  date: string;
  name: string;
  bw: number;
  total: number;
  gl: number;
  squat: [number, number][];
  bench: [number, number][];
  dead: [number, number][];
}

export const MEET_HISTORY: Meet[] = [
  {
    date: '2023-10-07', name: 'G-Team', bw: 89.3, total: 590, gl: 78.74,
    squat: [[180, 1], [190, 1], [200, 1]],
    bench: [[130, 1], [140, 1], [150, 0]],
    dead: [[225, 1], [240, 1], [250, 1]],
  },
  {
    date: '2023-12-03', name: 'WC Provincials 2024', bw: 89.4, total: 590, gl: 78.7,
    squat: [[185, 1], [195, 1], [205, 0]],
    bench: [[130, 1], [140, 1], [145, 0]],
    dead: [[220, 1], [255, 1]],
  },
  {
    date: '2024-12-08', name: 'WC Provincials 2025', bw: 91.85, total: 600, gl: 78.97,
    squat: [[180, 1], [200, 1], [205, 1]],
    bench: [[130, 1], [140, 1], [145, 1]],
    dead: [[220, 1], [240, 1], [250, 1]],
  },
  {
    date: '2025-03-29', name: 'SA Champs 2025', bw: 92.75, total: 675, gl: 88.42,
    squat: [[230, 1], [240, 1], [245, 0]],
    bench: [[140, 1], [150, 1], [155, 1]],
    dead: [[260, 1], [280, 1], [292.5, 0]],
  },
];
