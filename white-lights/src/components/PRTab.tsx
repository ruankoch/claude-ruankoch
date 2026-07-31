import { useMemo } from 'react';
import { ExercisePicker } from './ExercisePicker';
import { HistoricPRCard } from './HistoricPRCard';
import { GoalsCard } from './GoalsCard';
import { colorForReps, e1rm, resolveExId, round1, wLabel } from '../derive';
import { fmtDate, fmtDateFull } from '../dates';
import type { Exercise, Goal, SetRow, Settings } from '../types';

interface Props {
  exercises: Exercise[];
  sets: SetRow[];
  settings: Settings;
  goals: Goal[];
  selectedExId: string;
  onSelectEx: (id: string) => void;
  onAddGoal: (g: Goal) => void;
  onDeleteGoal: (id: string) => void;
  onAddHistoric: (set: SetRow) => void;
  onDeleteSet: (id: string) => void;
}

export function PRTab({
  exercises, sets, settings, goals, selectedExId, onSelectEx,
  onAddGoal, onDeleteGoal, onAddHistoric, onDeleteSet,
}: Props) {
  const exId = resolveExId(selectedExId, exercises);

  const mine = sets.filter((s) => s.exId === exId && !s.miss && !s.warmup);

  const matrix = useMemo(() => {
    if (!mine.length) return [];
    const maxReps = Math.max(...mine.map((s) => s.reps));
    const rows: {
      n: number;
      actual: number | null;
      date: string | null;
      effective: number;
      standing: boolean;
      e1: number | null;
    }[] = [];
    for (let n = 1; n <= Math.min(12, maxReps); n++) {
      const atN = mine.filter((s) => s.reps === n);
      const geN = mine.filter((s) => s.reps >= n);
      if (!geN.length) continue;
      let actual: SetRow | null = null;
      atN.forEach((s) => {
        if (!actual || s.weight > actual.weight) actual = s;
      });
      const a = actual as SetRow | null;
      const effective = Math.max(...geN.map((s) => s.weight));
      rows.push({
        n,
        actual: a ? a.weight : null,
        date: a ? a.date : null,
        effective,
        standing: a ? a.weight >= effective : false,
        e1: a ? round1(e1rm(a.weight, n, null, { ...settings, rpeAdjust: false })) : null,
      });
    }
    return rows;
  }, [mine, settings]);

  const bestE = mine.length
    ? mine.reduce(
        (acc, s) => {
          const v = e1rm(s.weight, s.reps, s.rpe, settings);
          return v > acc.v ? { v, s } : acc;
        },
        { v: 0, s: null as SetRow | null },
      )
    : null;

  return (
    <div>
      <ExercisePicker exercises={exercises} exId={exId} onSelect={onSelectEx} />

      {!mine.length && (
        <div className="empty">
          Nothing logged for this lift yet. Log a set, or load sample data under More.
        </div>
      )}

      {bestE && bestE.s && (
        <div className="card bigstat">
          <div className="bigstat-label">
            Best e1RM {settings.rpeAdjust ? '(RPE-adjusted)' : ''}
          </div>
          <div className="bigstat-num">
            {round1(bestE.v)}
            <span className="unit"> {settings.units}</span>
          </div>
          <div className="bigstat-sub">
            from {wLabel(bestE.s.weight, settings.units)}×{bestE.s.reps}
            {bestE.s.rpe != null ? ` @${bestE.s.rpe}` : ''} on {fmtDateFull(bestE.s.date)}
          </div>
        </div>
      )}

      {matrix.length > 0 && (
        <div className="card table-card">
          <table className="prtable">
            <thead>
              <tr>
                <th>Reps</th>
                <th>Best</th>
                <th>Date</th>
                <th>Effective</th>
                <th>e1RM</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((r) => (
                <tr key={r.n}>
                  <td>
                    <span className="repdot" style={{ background: colorForReps(r.n) }} />
                    {r.n}
                  </td>
                  <td className={r.standing ? 'strong' : ''}>{r.actual != null ? r.actual : '—'}</td>
                  <td className="mut">{r.date ? fmtDate(r.date) : '—'}</td>
                  <td className={!r.standing ? 'strong' : 'mut'}>{r.effective}</td>
                  <td className="mut">{r.e1 != null ? r.e1 : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="foot">
            Best = heaviest set at exactly N reps. Effective = heaviest at N reps or more (a 200×5
            counts as a 200×3). Bold marks which one stands.
          </div>
        </div>
      )}

      <HistoricPRCard exId={exId} sets={sets} settings={settings} onAdd={onAddHistoric} onDelete={onDeleteSet} />

      <GoalsCard
        exId={exId} goals={goals} exSets={mine} settings={settings}
        onAddGoal={onAddGoal} onDeleteGoal={onDeleteGoal}
      />
    </div>
  );
}
