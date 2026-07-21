import { useState } from 'react';
import { colorForReps, goalBest, goalName, round1, uid } from '../derive';
import type { Goal, SetRow, Settings } from '../types';

interface Props {
  exId: string;
  goals: Goal[];
  exSets: SetRow[];
  settings: Settings;
  onAddGoal: (g: Goal) => void;
  onDeleteGoal: (id: string) => void;
}

const REP_CHOICES: (number | 'e1')[] = [1, 2, 3, 4, 5, 6, 8, 10, 'e1'];

export function GoalsCard({ exId, goals, exSets, settings, onAddGoal, onDeleteGoal }: Props) {
  const [adding, setAdding] = useState(false);
  const [reps, setReps] = useState<number | 'e1'>(1);
  const [weight, setWeight] = useState('');
  const [label, setLabel] = useState('');

  const mine = goals.filter((g) => g.exId === exId);

  const save = () => {
    const w = parseFloat(weight);
    if (!(w > 0)) return;
    onAddGoal({
      id: uid(), exId,
      reps: reps === 'e1' ? null : reps,
      weight: w,
      label: label.trim() || null,
    });
    setWeight('');
    setLabel('');
    setAdding(false);
  };

  return (
    <>
      <div className="sect">Goals &amp; programming</div>
      <div className="card">
        {mine.length === 0 && !adding && (
          <div className="empty tight">
            No goals set for this lift — that's fine, goals are per-variation and optional.
          </div>
        )}

        {mine.map((g) => {
          const best = goalBest(g, exSets, settings);
          const pct = Math.max(0, Math.min(100, Math.round((best / g.weight) * 100)));
          const done = best >= g.weight;
          const color = g.reps == null ? '#EDEDE8' : colorForReps(g.reps);
          return (
            <div key={g.id} className="goalrow">
              <div className="goalrow-top">
                <span className="goal-name">
                  <span className="repdot" style={{ background: color }} />
                  {goalName(g)} · {g.weight}
                  {settings.units}
                  {g.label ? <span className="goal-label"> — {g.label}</span> : null}
                </span>
                <span className="goal-status">
                  {done ? '✓ hit' : `${round1(best)} / ${g.weight}`}
                </span>
                <button className="del" onClick={() => onDeleteGoal(g.id)} aria-label="Delete goal">
                  ✕
                </button>
              </div>
              <div className="goalbar">
                <div
                  className="goalbar-fill"
                  style={{ width: pct + '%', background: done ? '#3B8A5B' : color }}
                />
              </div>
            </div>
          );
        })}

        {adding ? (
          <div className="goalform">
            <div className="goalform-row">
              {REP_CHOICES.map((r) => (
                <button
                  key={String(r)}
                  className={'rpe' + (reps === r ? ' on' : '')}
                  onClick={() => setReps(r)}
                >
                  {r === 'e1' ? 'e1RM' : `${r}RM`}
                </button>
              ))}
            </div>
            <div className="goalform-row2">
              <input
                className="txt num" inputMode="decimal" placeholder={`Target ${settings.units}`}
                value={weight} onChange={(e) => setWeight(e.target.value.replace(',', '.'))}
              />
              <input
                className="txt" placeholder="Label, e.g. Comp opener" value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="actions">
              <button className="btn primary" disabled={!(parseFloat(weight) > 0)} onClick={save}>
                Save goal
              </button>
              <button className="btn ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn ghost fullw" onClick={() => setAdding(true)}>
            + Add goal
          </button>
        )}
      </div>
    </>
  );
}
