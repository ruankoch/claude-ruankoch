/* Read side of the two-way Google Sheets sync.

   Apps Script Web App responses can't be read cross-origin with fetch (no CORS
   headers, opaque redirect), so we pull via JSONP: a <script> tag hits
   ?callback=fn and the script's doGet returns fn([...rows]). The sheet is an
   append-only event log of atomic sets keyed by id; a row with source
   'delete' is a tombstone that removes that id. Merging is just: add sets whose
   id we don't have, drop sets whose id has a tombstone. */

export interface ParsedSetRow {
  id: string | null;
  name: string;
  date: string;
  weight: number;
  reps: number;
  rpe: number | null;
  miss: boolean;
  source: 'meet' | 'historic' | '';
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const cell = (c: unknown): string => (c == null ? '' : String(c).trim());

/** Fetch the sheet as an array of row arrays via JSONP. */
export function jsonpGet(url: string, timeoutMs = 20000): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const cb = '__wl_jsonp_' + Math.random().toString(36).slice(2);
    const sep = url.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      done = true;
      delete (window as unknown as Record<string, unknown>)[cb];
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      if (!done) {
        cleanup();
        reject(new Error('Pull timed out'));
      }
    }, timeoutMs);
    (window as unknown as Record<string, unknown>)[cb] = (data: unknown) => {
      if (!done) {
        cleanup();
        resolve(Array.isArray(data) ? (data as unknown[][]) : []);
      }
    };
    script.onerror = () => {
      if (!done) {
        cleanup();
        reject(new Error('Pull failed — check the sync URL and that access is "Anyone"'));
      }
    };
    script.src = url + sep + 'callback=' + cb;
    document.head.appendChild(script);
  });
}

/** Split a sheet matrix (row arrays, header optional) into sets + tombstone ids.
    Columns are positional: date, exercise, weight, reps, rpe, miss, source, id. */
export function parseSheetMatrix(matrix: unknown[][]): {
  sets: ParsedSetRow[];
  tombstones: Set<string>;
} {
  const sets: ParsedSetRow[] = [];
  const tombstones = new Set<string>();
  if (!Array.isArray(matrix) || !matrix.length) return { sets, tombstones };

  const first = (matrix[0] || []).map((c) => cell(c).toLowerCase());
  const start =
    first.includes('date') && (first.includes('exercise') || first.some((s) => s.startsWith('weight')))
      ? 1
      : 0;

  for (let i = start; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const source = cell(r[6]).toLowerCase();
    const id = cell(r[7]);
    if (source === 'delete') {
      if (id) tombstones.add(id);
      continue;
    }
    const date = cell(r[0]);
    const name = cell(r[1]);
    const weight = parseFloat(cell(r[2]));
    const reps = parseInt(cell(r[3]), 10);
    if (!ISO.test(date) || !name || !(weight > 0) || !(reps >= 1)) continue;

    const rpeRaw = cell(r[4]);
    const rpeNum = rpeRaw === '' ? NaN : parseFloat(rpeRaw);
    const missRaw = cell(r[5]).toLowerCase();
    sets.push({
      id: id || null,
      name,
      date,
      weight,
      reps,
      rpe: Number.isFinite(rpeNum) ? rpeNum : null,
      miss: ['1', 'true', 'miss', 'x', 'yes', 'y'].includes(missRaw),
      source: source === 'meet' ? 'meet' : source === 'historic' || source === 'hist' ? 'historic' : '',
    });
  }
  return { sets, tombstones };
}
