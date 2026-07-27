import { useEffect, useMemo, useState } from 'react';
import { ExercisePicker } from './ExercisePicker';
import { ProgramCard } from './ProgramCard';
import { PlateStrip } from './PlateStrip';
import { resolveProgramExercise, type ProgramApi, type ProgramItem } from '../program';
import {
  goalBest, goalName, isDumbbell, loadOffset, perSideText, round1, uid, warmupRamp,
} from '../derive';
import { fmtDateFull, todayStr } from '../dates';
import type { Exercise, Goal, SetRow, Settings, TrainingMaxes } from '../types';

interface Props {
  exercises: Exercise[];
  sets: SetRow[];
  settings: Settings;
  tms: TrainingMaxes;
  goals: Goal[];
  notes: Record<string, string>;
  plan: string | null;
  programApi: ProgramApi;
  onAddSet: (set: SetRow) => void;
  onDeleteSet: (id: string) => void;
  onEditSet: (set: SetRow) => void;
  onAddExercise: (name: string) => string;
  onSetNote: (date: string, text: string) => void;
  onSetPlan: (key: string | null) => void;
}

const RPE_OPTS: (number | null)[] = [null, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

export function LogTab({
  exercises, sets, settings, tms, goals, notes, plan, programApi,
  onAddSet, onDeleteSet, onEditSet, onAddExercise, onSetNote, onSetPlan,
}: Props) {
  const [exId, setExId] = useState(exercises[0]?.id || '');
  const [date, setDate] = useState(todayStr());
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState(5);
  const [rpe, setRpe] = useState<number | null>(null);
  const [miss, setMiss] = useState(false);
  const [warmup, setWarmup] = useState(false);
  const [showWarm, setShowWarm] = useState(false);

  useEffect(() => {
    if (!exId && exercises.length) setExId(exercises[0].id);
  }, [exercises, exId]);

  const step = settings.units === 'lb' ? 5 : 2.5;

  const lastForEx = useMemo(() => {
    const mine = sets.filter((s) => s.exId === exId);
    if (!mine.length) return null;
    // the most recently logged set, not an arbitrary DB-order row
    return mine.reduce((a, b) => ((b.createdAt ?? 0) > (a.createdAt ?? 0) ? b : a));
  }, [sets, exId]);

  const bump = (delta: number) => {
    const w = parseFloat(weight);
    const cur = isNaN(w) ? 0 : w;
    const next = Math.max(0, Math.round((cur + delta) / step) * step);
    setWeight(String(next));
  };

  const canLog = !!exId && parseFloat(weight) > 0 && reps >= 1;

  const log = () => {
    if (!canLog) return;
    onAddSet({
      id: uid(), exId, date, weight: parseFloat(weight), reps, rpe,
      miss: miss || undefined,
      warmup: warmup || undefined,
    });
    setMiss(false);
    // warm-up toggle stays put — flick it back to Working when you start work sets
  };

  const prefillFromProgram = (item: ProgramItem, load: number | null) => {
    const found = resolveProgramExercise(item, exercises);
    const id = found ? found.id : onAddExercise(item.ex);
    setExId(id);
    if (load != null) setWeight(String(load));
    if (item.reps != null) setReps(item.reps);
    setRpe(item.rpe != null ? item.rpe : null);
  };

  const repeatLast = () => {
    if (!lastForEx) return;
    setWeight(String(lastForEx.weight));
    setReps(lastForEx.reps);
    setRpe(lastForEx.rpe ?? null);
  };

  const todays = sets.filter((s) => s.date === date);
  const exName = (id: string) => exercises.find((e) => e.id === id)?.name || '?';
  const wNum = parseFloat(weight);
  const offset = loadOffset(settings.units, settings.collars);
  const isDb = isDumbbell(exName(exId));

  return (
    <div>
      <ProgramCard
        plan={plan} onSetPlan={onSetPlan} exercises={exercises} sets={sets}
        date={date} settings={settings} tms={tms} programApi={programApi}
        onPrefill={prefillFromProgram}
      />

      <ExercisePicker
        exercises={exercises} exId={exId} onSelect={setExId} onAddExercise={onAddExercise}
      />

      {goals
        .filter((g) => g.exId === exId)
        .map((g) => {
          const best = goalBest(g, sets.filter((s) => s.exId === exId && !s.miss), settings);
          const done = best >= g.weight;
          return (
            <div key={g.id} className={'goalpill' + (done ? ' done' : '')}>
              <span>
                {goalName(g)} goal {g.weight}
                {settings.units}
                {g.label ? <span className="goal-label"> · {g.label}</span> : null}
              </span>
              <span className="goalpill-val">
                {done ? '✓ hit' : `best ${round1(best)} · ${Math.round((best / g.weight) * 100)}%`}
              </span>
            </div>
          );
        })}

      <div className="card">
        <div className="fieldrow">
          <label className="lbl">Date</label>
          <input
            className="txt date" type="date" value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="fieldrow">
          <label className="lbl">
            Weight <span className="unit">{settings.units}</span>
          </label>
          <div className="stepper">
            <button className="step-btn" onClick={() => bump(-step)}>−</button>
            <input
              className="step-val" inputMode="decimal" value={weight} placeholder="0"
              onChange={(e) => setWeight(e.target.value.replace(',', '.'))}
            />
            <button className="step-btn" onClick={() => bump(step)}>+</button>
          </div>
        </div>

        {settings.plates !== false && !isDb && wNum > offset && (
          <PlateStrip total={wNum} units={settings.units} collars={settings.collars} />
        )}

        {isDb && wNum > 0 && (
          <div className="platestrip">
            <span className="plates-label">
              dumbbell · {wNum}
              {settings.units} total
            </span>
            <div className="plates">
              <span className="platechip dbchip">
                {round1(wNum / 2)}
                {settings.units} /hand
              </span>
            </div>
          </div>
        )}

        {!isDb && wNum > offset && (
          <div className="warmwrap">
            <button className="warmlink" onClick={() => setShowWarm((v) => !v)}>
              {showWarm ? '▾ Warm-up ramp' : '▸ Warm-up ramp'}
            </button>
            {showWarm && (
              <div className="warmlist">
                {warmupRamp(wNum, settings.units, settings.collars).map((r, i) => (
                  <div key={i} className="warmrow">
                    <span className="warm-w">
                      {r.w}
                      {settings.units} × {r.reps}
                    </span>
                    <span className="warm-side">
                      {perSideText(r.w, settings.units, settings.collars)}
                    </span>
                  </div>
                ))}
                <div className="warmrow work">
                  <span className="warm-w">
                    {wNum}
                    {settings.units}
                  </span>
                  <span className="warm-side">work sets</span>
                </div>
              </div>
            )}
          </div>
        )}

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
              <button
                key={String(v)}
                className={'rpe' + (rpe === v ? ' on' : '')}
                onClick={() => setRpe(v)}
              >
                {v === null ? '—' : v}
              </button>
            ))}
          </div>
        </div>

        <div className="fieldrow">
          <label className="lbl">Set type</label>
          <div className="seg">
            <button
              className={'seg-btn' + (!warmup ? ' on' : '')}
              onClick={() => setWarmup(false)}
            >
              Working
            </button>
            <button
              className={'seg-btn' + (warmup ? ' on' : '')}
              onClick={() => setWarmup(true)}
            >
              Warm-up
            </button>
          </div>
        </div>

        <div className="actions">
          <button
            className={'btn primary' + (miss ? ' missarmed' : '')}
            disabled={!canLog}
            onClick={log}
          >
            {miss ? 'Log miss ✗' : warmup ? 'Log warm-up' : 'Log set'}
          </button>
          <button className="btn ghost" disabled={!lastForEx} onClick={repeatLast}>
            {lastForEx ? `Repeat ${lastForEx.weight}×${lastForEx.reps}` : 'Repeat last'}
          </button>
        </div>
        <button className={'misslink' + (miss ? ' on' : '')} onClick={() => setMiss((m) => !m)}>
          {miss ? 'logging as a miss — tap to cancel' : 'missed this attempt?'}
        </button>
      </div>

      <div className="sect">{date === todayStr() ? 'Today' : fmtDateFull(date)}</div>
      <textarea
        className="notes"
        placeholder="Session notes — bar speed, belt hole, sleep, cues…"
        value={notes[date] || ''}
        rows={2}
        onChange={(e) => onSetNote(date, e.target.value)}
      />
      {todays.length === 0 && <div className="empty">No sets on this date yet. Chalk up.</div>}
      {[...todays]
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id))
        .map((s) => (
        <div key={s.id} className={'setrow' + (s.miss ? ' missed' : '')}>
          <button className="setrow-main asbtn" onClick={() => onEditSet(s)}>
            <span className="set-ex">
              {exName(s.exId)}
              {s.miss ? ' · miss' : ''}
              {s.warmup ? ' · warm-up' : ''}
              {s.meet ? ' · meet' : s.hist ? ' · pr entry' : ''}
            </span>
            <span className="set-num">
              {s.miss && <span className="missx">✗ </span>}
              {s.weight}
              {settings.units} × {s.reps}
              {s.rpe != null ? ` @${s.rpe}` : ''}
            </span>
          </button>
          <button className="del" onClick={() => onDeleteSet(s.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
