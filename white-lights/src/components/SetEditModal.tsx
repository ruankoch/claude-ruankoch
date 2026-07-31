import { useState } from 'react';
import type { Exercise, SetPatch, SetRow, Settings } from '../types';

const RPE_OPTS: (number | null)[] = [null, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

interface Props {
  set: SetRow;
  exercises: Exercise[];
  settings: Settings;
  onSave: (patch: SetPatch) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function SetEditModal({ set, exercises, settings, onSave, onDelete, onClose }: Props) {
  const [exId, setExId] = useState(set.exId);
  const [date, setDate] = useState(set.date);
  const [weight, setWeight] = useState(String(set.weight));
  const [reps, setReps] = useState(set.reps);
  const [rpe, setRpe] = useState<number | null>(set.rpe);
  const [miss, setMiss] = useState(!!set.miss);
  const [warmup, setWarmup] = useState(!!set.warmup);

  const step = settings.units === 'lb' ? 5 : 2.5;
  const bump = (delta: number) => {
    const w = parseFloat(weight);
    const cur = isNaN(w) ? 0 : w;
    setWeight(String(Math.max(0, Math.round((cur + delta) / step) * step)));
  };
  const wv = weight.trim() === '' ? 0 : parseFloat(weight); // empty = bodyweight
  const canSave = Number.isFinite(wv) && wv >= 0 && reps >= 1;
  const save = () => {
    if (!canSave) return;
    onSave({ exId, date, weight: wv, reps, rpe, miss, warmup });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-grip" />
        <div className="sect" style={{ margin: '0 2px 10px' }}>Edit set</div>

        <div className="picker">
          <div className="pickrow">
            <div className="selwrap">
              <select className="exsel" value={exId} onChange={(e) => setExId(e.target.value)}>
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

        <div className="card" style={{ marginBottom: 10 }}>
          <div className="fieldrow">
            <label className="lbl">Date</label>
            <input className="txt date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="fieldrow">
            <label className="lbl">
              Weight <span className="unit">{settings.units}</span>
            </label>
            <div className="stepper">
              <button className="step-btn" onClick={() => bump(-step)}>−</button>
              <input
                className="step-val" inputMode="decimal" value={weight}
                onChange={(e) => setWeight(e.target.value.replace(',', '.'))}
              />
              <button className="step-btn" onClick={() => bump(step)}>+</button>
            </div>
          </div>
          <div className="fieldrow">
            <label className="lbl">Reps</label>
            <div className="stepper">
              <button className="step-btn" onClick={() => setReps((r) => Math.max(1, r - 1))}>−</button>
              <div className="step-val ro">{reps}</div>
              <button className="step-btn" onClick={() => setReps((r) => r + 1)}>+</button>
            </div>
          </div>
          <div className="fieldrow">
            <label className="lbl">RPE</label>
            <div className="rpe-row">
              {RPE_OPTS.map((v) => (
                <button key={String(v)} className={'rpe' + (rpe === v ? ' on' : '')} onClick={() => setRpe(v)}>
                  {v === null ? '—' : v}
                </button>
              ))}
            </div>
          </div>
          <div className="fieldrow">
            <label className="lbl">Set type</label>
            <div className="seg">
              <button className={'seg-btn' + (!warmup ? ' on' : '')} onClick={() => setWarmup(false)}>
                Working
              </button>
              <button className={'seg-btn' + (warmup ? ' on' : '')} onClick={() => setWarmup(true)}>
                Warm-up
              </button>
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="btn primary" disabled={!canSave} onClick={save}>
            Save
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
        <button className={'misslink' + (miss ? ' on' : '')} onClick={() => setMiss((m) => !m)}>
          {miss ? 'marked as a miss — tap to unmark' : 'mark as a miss'}
        </button>
        <button className="modal-del" onClick={onDelete}>
          Delete this set
        </button>
      </div>
    </div>
  );
}
