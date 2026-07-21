import { useState } from 'react';
import { colorForReps, uid } from '../derive';
import { fmtDateFull, todayStr } from '../dates';
import type { SetRow, Settings } from '../types';

interface Props {
  exId: string;
  sets: SetRow[];
  settings: Settings;
  onAdd: (set: SetRow) => void;
  onDelete: (id: string) => void;
}

export function HistoricPRCard({ exId, sets, settings, onAdd, onDelete }: Props) {
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState(1);

  const mine = sets
    .filter((s) => s.exId === exId && s.hist)
    .sort((a, b) => a.date.localeCompare(b.date));

  const save = () => {
    const w = parseFloat(weight);
    if (!(w > 0) || !date) return;
    onAdd({ id: uid(), exId, date, weight: w, reps, rpe: null, hist: true });
    setWeight('');
    setAdding(false);
  };

  return (
    <>
      <div className="sect">Historic PRs</div>
      <div className="card">
        {mine.length === 0 && !adding && (
          <div className="empty tight">
            Backdate your all-time bests here — 1RMs and rep PRs from before you started logging.
          </div>
        )}

        {mine.map((s) => (
          <div key={s.id} className="goalrow">
            <div className="goalrow-top">
              <span className="goal-name">
                <span
                  className="repdot"
                  style={{ background: s.miss ? '#565C62' : colorForReps(s.reps) }}
                />
                {s.weight}
                {settings.units} × {s.reps}
                {s.miss ? <span className="missx"> ✗</span> : null}
                {s.meet ? <span className="goal-label"> — meet</span> : null}
              </span>
              <span className="goal-status">{fmtDateFull(s.date)}</span>
              <button className="del" onClick={() => onDelete(s.id)} aria-label="Delete historic PR">
                ✕
              </button>
            </div>
          </div>
        ))}

        {adding ? (
          <div className="goalform">
            <div className="goalform-row2">
              <input
                className="txt date" type="date" value={date} max={todayStr()}
                onChange={(e) => setDate(e.target.value)}
              />
              <input
                className="txt num" inputMode="decimal" placeholder={`Weight ${settings.units}`}
                value={weight} onChange={(e) => setWeight(e.target.value.replace(',', '.'))}
              />
            </div>
            <div className="fieldrow">
              <label className="lbl">Reps</label>
              <div className="stepper">
                <button className="step-btn sm" onClick={() => setReps((r) => Math.max(1, r - 1))}>−</button>
                <div className="step-val ro sm">{reps}</div>
                <button className="step-btn sm" onClick={() => setReps((r) => r + 1)}>+</button>
              </div>
            </div>
            <div className="actions">
              <button
                className="btn primary"
                disabled={!(parseFloat(weight) > 0) || !date}
                onClick={save}
              >
                Save PR
              </button>
              <button className="btn ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn ghost fullw" onClick={() => setAdding(true)}>
            + Add historic PR
          </button>
        )}

        {(mine.length > 0 || adding) && (
          <div className="foot">
            Historic entries are real sets in the log: they feed the PR matrix, e1RM history,
            intensity denominators, and appear on their date in the lift chart.
          </div>
        )}
      </div>
    </>
  );
}
