/* Read side of the two-way Google Sheets sync.

   Apps Script Web App responses can't be read cross-origin with fetch (no CORS
   headers, opaque redirect), so we pull via JSONP: a <script> tag hits
   ?callback=fn and the script's doGet returns fn([...rows]). The sheet is an
   append-only event log of atomic sets keyed by id; a row with source
   'delete' is a tombstone that removes that id. Merging is just: add sets whose
   id we don't have, drop sets whose id has a tombstone. */

import type { TrainingMaxes } from '../types';

export interface ParsedSetRow {
  id: string | null;
  name: string;
  date: string;
  weight: number;
  reps: number;
  rpe: number | null;
  miss: boolean;
  warmup: boolean;
  source: 'meet' | 'historic' | '';
}

export interface ParsedGoalRow {
  id: string;
  name: string;
  reps: number | null;
  weight: number;
  label: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const cell = (c: unknown): string => (c == null ? '' : String(c).trim());

/** Parse CSV/TSV text (as downloaded from Google Sheets) into a row matrix.
    Handles quoted fields with embedded commas, quotes, and newlines. */
export function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',' || c === '\t') {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else if (c === '\r') {
      /* ignore */
    } else {
      field += c;
    }
  }
  if (field.length || row.length) pushRow();
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

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

/** Split a sheet matrix (row arrays, header optional) into sets, tombstone ids,
    and the latest training-maxes row. Columns are positional:
    date, exercise, weight, reps, rpe, miss, source, id.
    Training-maxes rows use source 'tm' with squat/bench/dead in weight/reps/rpe. */
export function parseSheetMatrix(matrix: unknown[][]): {
  sets: ParsedSetRow[];
  tombstones: Set<string>;
  tms: TrainingMaxes | null;
  goals: ParsedGoalRow[];
  goalTombstones: Set<string>;
  notes: Map<string, string>;
  activeProgramId: string | null;
} {
  const sets: ParsedSetRow[] = [];
  const tombstones = new Set<string>();
  let tms: TrainingMaxes | null = null;
  const goals: ParsedGoalRow[] = [];
  const goalTombstones = new Set<string>();
  const notes = new Map<string, string>();
  let activeProgramId: string | null = null;
  const empty = { sets, tombstones, tms, goals, goalTombstones, notes, activeProgramId };
  if (!Array.isArray(matrix) || !matrix.length) return empty;

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
    if (source === 'tm') {
      const sq = parseFloat(cell(r[2]));
      const bn = parseFloat(cell(r[3]));
      const dl = parseFloat(cell(r[4]));
      if (sq > 0 && bn > 0 && dl > 0) tms = { squat: sq, bench: bn, dead: dl }; // last wins
      continue;
    }
    if (source === 'goal-delete') {
      if (id) goalTombstones.add(id);
      continue;
    }
    if (source === 'goal') {
      const name = cell(r[1]);
      const weight = parseFloat(cell(r[2]));
      const repsRaw = cell(r[3]);
      const reps = repsRaw === '' ? null : parseInt(repsRaw, 10);
      if (id && name && weight > 0) {
        goals.push({
          id,
          name,
          reps: reps != null && Number.isFinite(reps) ? reps : null,
          weight,
          label: cell(r[4]) || null,
        });
      }
      continue;
    }
    if (source === 'note') {
      const d = cell(r[0]);
      const text = r[1] == null ? '' : String(r[1]); // keep note text untrimmed
      if (ISO.test(d)) notes.set(d, text); // last row for a date wins; '' clears
      continue;
    }
    if (source === 'program') {
      const pid = cell(r[7]);
      if (pid) activeProgramId = pid; // last wins
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
      warmup: source === 'warmup' || source === 'warm-up' || source === 'warmup-set',
      source: source === 'meet' ? 'meet' : source === 'historic' || source === 'hist' ? 'historic' : '',
    });
  }
  return { sets, tombstones, tms, goals, goalTombstones, notes, activeProgramId };
}
