import { PROGRAM, computeLoad, resolveProgramExercise, type ProgramApi, type ProgramItem } from '../program';
import { ProgramPicker } from './ProgramPicker';
import type { Exercise, SetRow, Settings, TrainingMaxes } from '../types';

interface Props {
  plan: string | null;
  onSetPlan: (key: string | null) => void;
  exercises: Exercise[];
  sets: SetRow[];
  date: string;
  settings: Settings;
  tms: TrainingMaxes;
  programApi: ProgramApi;
  onPrefill: (item: ProgramItem, load: number | null) => void;
}

export function ProgramCard({
  plan, onSetPlan, exercises, sets, date, settings, tms, programApi, onPrefill,
}: Props) {
  const active = programApi.programs.find((p) => p.id === programApi.activeId) || programApi.programs[0];
  const days = active?.days ?? PROGRAM.days;
  const day = days.find((d) => d.key === plan) || null;

  const doneFor = (item: ProgramItem): number => {
    const found = resolveProgramExercise(item, exercises);
    if (!found) return 0;
    const todays = sets.filter((s) => s.exId === found.id && s.date === date && !s.miss);
    const load = computeLoad(item, tms);
    if (load != null) {
      const tol = Math.max(2.5, load * 0.03);
      return todays.filter((s) => Math.abs(s.weight - load) <= tol).length;
    }
    return todays.length;
  };

  return (
    <div className="card progcard">
      <ProgramPicker
        programs={programApi.programs}
        activeId={programApi.activeId}
        onSelect={programApi.onSelect}
        onRename={programApi.onRename}
        onDelete={programApi.onDelete}
        onAddCopy={() => programApi.onAdd(`${active?.name || 'Programme'} copy`, days)}
      />
      <div className="prog-head">
        <div className="selwrap">
          <select
            className="exsel prog"
            value={plan || ''}
            onChange={(e) => onSetPlan(e.target.value)}
          >
            <option value="">Pick a day…</option>
            {days.map((d) => (
              <option key={d.key} value={d.key}>
                Week {d.week} · {d.dow} — {d.focus}
              </option>
            ))}
          </select>
          <span className="selarrow">▾</span>
        </div>
        {plan && (
          <button className="addbtn" onClick={() => onSetPlan(null)} aria-label="Clear programme day">
            ✕
          </button>
        )}
      </div>

      {day && (
        <div className="prog-items">
          {day.items.map((item, i) => {
            const done = doneFor(item);
            const total = item.sets || 0;
            const complete = total > 0 && done >= total;
            const load = computeLoad(item, tms);
            return (
              <button
                key={i}
                className={'prog-item' + (complete ? ' done' : '')}
                onClick={() => onPrefill(item, load)}
              >
                <span className="prog-ex">
                  {item.ex}
                  {item.note ? <span className="prog-note"> · {item.note}</span> : null}
                </span>
                <span className="prog-rx">
                  {item.rx}
                  {load != null ? ` @ ${load}${settings.units}` : ''}
                </span>
                <span className="prog-count">
                  {total > 0 ? (complete ? '✓' : `${done}/${total}`) : '—'}
                </span>
              </button>
            );
          })}
          <div className="foot">
            Tap a line to prefill the logger. Loads compute from your training maxes (Settings) —
            adjust to actual RPE.
          </div>
        </div>
      )}
    </div>
  );
}
