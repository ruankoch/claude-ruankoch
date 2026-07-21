/* Dates are ISO local-date STRINGS everywhere. No Date objects in stored data,
   no UTC conversions — that's how training logs end up off-by-one-day.
   These helpers port verbatim from the artifact. */

const iso = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate(),
  ).padStart(2, '0')}`;

export const todayStr = (): string => iso(new Date());

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const fmtDate = (isoStr: string): string => {
  const [, m, d] = isoStr.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

export const fmtDateFull = (isoStr: string): string => {
  const [y] = isoStr.split('-');
  return `${fmtDate(isoStr)} '${String(y).slice(2)}`;
};

/** Monday-anchored ISO week start for a given local date string. */
export function weekStart(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // Monday = 0
  dt.setDate(dt.getDate() - dow);
  return iso(dt);
}

/** Shift an ISO local-date string by a number of days. */
export function isoShift(isoStr: string, days: number): string {
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return iso(dt);
}

/** ISO date `weeks` before today, or null for "all time". */
export function rangeCutoff(weeks: number): string | null {
  if (!weeks) return null;
  const dt = new Date();
  dt.setDate(dt.getDate() - weeks * 7);
  return iso(dt);
}

export const fmtClock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
