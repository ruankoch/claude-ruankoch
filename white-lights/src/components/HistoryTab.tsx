import { useMemo, useState } from 'react';
import { colorForReps, e1rm, round1 } from '../derive';
import { fmtDateFull, rangeCutoff } from '../dates';
import type { Exercise, SetRow, Settings } from '../types';

const ALL = '__all__';

interface Props {
  exercises: Exercise[];
  sets: SetRow[];
  settings: Settings;
  notes: Record<string, string>;
  onDeleteSet: (id: string) => void;
}

export function HistoryTab({ exercises, sets, settings, notes, onDeleteSet }: Props) {
  const [exId, setExId] = useState<string>(ALL);
  const [rangeWks, setRangeWks] = useState(0); // 0 = all time
  const [madeOnly, setMadeOnly] = useState(false);
  const [reps, setReps] = useState<number | null>(null);

  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name || '?';
  const cutoff = rangeCutoff(rangeWks);

  const filtered = useMemo(
    () =>
      sets.filter((s) => {
        if (exId !== ALL && s.exId !== exId) return false;
        if (cutoff && s.date < cutoff) return false;
        if (madeOnly && s.miss) return false;
        if (reps != null && s.reps !== reps) return false;
        return true;
      }),
    [sets, exId, cutoff, madeOnly, reps],
  );

  const repCounts = useMemo(() => {
    const present = new Set(
      sets.filter((s) => (exId === ALL || s.exId === exId) && !s.miss).map((s) => s.reps),
    );
    return [...present].sort((a, b) => a - b);
  }, [sets, exId]);

  const sessions = useMemo(() => {
    const byDate: Record<string, SetRow[]> = {};
    filtered.forEach((s) => {
      (byDate[s.date] ||= []).push(s);
    });
    return Object.keys(byDate)
      .sort((a, b) => b.localeCompare(a)) // newest first
      .map((date) => {
        const daySets = byDate[date].slice().sort((a, b) => b.weight - a.weight);
        const made = daySets.filter((s) => !s.miss);
        const topE = made.length ? Math.max(...made.map((s) => e1rm(s.weight, s.reps, s.rpe, settings))) : 0;
        return { date, sets: daySets, topE, count: daySets.length };
      });
  }, [filtered, settings]);

  // heaviest made weight per rep count for the selected lift → ★ on standing bests
  const bestAtRep = useMemo(() => {
    const m: Record<number, number> = {};
    if (exId === ALL) return m;
    sets
      .filter((s) => s.exId === exId && !s.miss)
      .forEach((s) => {
        if (!m[s.reps] || s.weight > m[s.reps]) m[s.reps] = s.weight;
      });
    return m;
  }, [sets, exId]);

  const totalSets = filtered.length;

  return (
    <div>
      <div className="picker">
        <div className="pickrow">
          <div className="selwrap">
            <select
              className="exsel"
              value={exId}
              onChange={(e) => {
                setExId(e.target.value);
                setReps(null);
              }}
            >
              <option value={ALL}>All exercises</option>
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <span className="selarrow">▾</span>
          </div>
        </div>
      </div>

      <div className="ctrlrow">
        <div className="seg">
          {([[4, '4 wks'], [8, '8 wks'], [0, 'All']] as [number, string][]).map(([v, l]) => (
            <button key={v} className={'seg-btn' + (rangeWks === v ? ' on' : '')} onClick={() => setRangeWks(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="seg">
          <button className={'seg-btn' + (!madeOnly ? ' on' : '')} onClick={() => setMadeOnly(false)}>
            All
          </button>
          <button className={'seg-btn' + (madeOnly ? ' on' : '')} onClick={() => setMadeOnly(true)}>
            Made only
          </button>
        </div>
      </div>

      {repCounts.length > 0 && (
        <div className="legendrow">
          <button
            className={'legend-rep' + (reps == null ? ' on' : '')}
            style={reps == null ? { borderColor: '#EDEDE8', color: '#EDEDE8' } : {}}
            onClick={() => setReps(null)}
          >
            all reps
          </button>
          {repCounts.map((n) => (
            <button
              key={n}
              className={'legend-rep' + (reps === n ? ' on' : '')}
              style={reps === n ? { borderColor: colorForReps(n), color: colorForReps(n) } : {}}
              onClick={() => setReps(reps === n ? null : n)}
            >
              {n}RM
            </button>
          ))}
        </div>
      )}

      {sessions.length === 0 && (
        <div className="empty">No sessions match these filters. Widen the range, or log a set.</div>
      )}

      {sessions.length > 0 && (
        <div className="foot" style={{ padding: '0 2px 8px' }}>
          {sessions.length} session{sessions.length > 1 ? 's' : ''} · {totalSets} set
          {totalSets > 1 ? 's' : ''}
        </div>
      )}

      {sessions.map((sess) => (
        <div key={sess.date} className="card histcard">
          <div className="hist-head">
            <span className="hist-date">{fmtDateFull(sess.date)}</span>
            <span className="hist-sum">
              {sess.count} set{sess.count > 1 ? 's' : ''}
              {sess.topE ? ` · e1RM ${round1(sess.topE)}` : ''}
            </span>
          </div>
          {notes[sess.date] && <div className="hist-note">{notes[sess.date]}</div>}
          {sess.sets.map((s) => (
            <div key={s.id} className={'hist-row' + (s.miss ? ' missed' : '')}>
              <span
                className="repdot"
                style={{ background: s.miss ? '#565C62' : colorForReps(s.reps) }}
              />
              <span className="hist-main">
                {exId === ALL && <span className="hist-ex">{nameOf(s.exId)} </span>}
                <span className="hist-num">
                  {s.miss && <span className="missx">✗ </span>}
                  {s.weight}
                  {settings.units} × {s.reps}
                  {s.rpe != null ? ` @${s.rpe}` : ''}
                </span>
                {!s.miss && exId !== ALL && bestAtRep[s.reps] === s.weight && (
                  <span className="hist-pr"> ★</span>
                )}
                {s.meet ? (
                  <span className="hist-tag"> · meet</span>
                ) : s.hist ? (
                  <span className="hist-tag"> · pr entry</span>
                ) : null}
              </span>
              <span className="hist-e1">
                {!s.miss ? round1(e1rm(s.weight, s.reps, s.rpe, settings)) : ''}
              </span>
              <button className="del" onClick={() => onDeleteSet(s.id)} aria-label="Delete set">
                ✕
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
