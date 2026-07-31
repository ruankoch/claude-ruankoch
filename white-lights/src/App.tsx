import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from './hooks/useAppData';
import { beepThree, ensureAudio } from './audio';
import { e1rm, goalMetBySet, goalName, wLabel } from './derive';
import { LogTab } from './components/LogTab';
import { PRTab } from './components/PRTab';
import { HistoryTab } from './components/HistoryTab';
import { ChartTab } from './components/ChartTab';
import { MoreTab } from './components/MoreTab';
import { RestTimerBar, type TimerState } from './components/RestTimer';
import { SetEditModal } from './components/SetEditModal';
import type { SetRow } from './types';

type Tab = 'log' | 'prs' | 'history' | 'charts' | 'more';
type Toast = { pr: boolean; text: string };

export default function App() {
  const api = useAppData();
  const { data, loaded } = api;
  const { exercises, sets, settings } = data;
  const goals = data.goals;

  const [tab, setTab] = useState<Tab>('log');
  const [toast, setToast] = useState<Toast | null>(null);
  const [editing, setEditing] = useState<SetRow | null>(null);

  /* rest timer — clock-based (endsAt) so it self-corrects on return */
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(false);

  useEffect(() => {
    if (!timer) return;
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, [timer]);

  const remaining = timer ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!timer) {
      doneRef.current = false;
      return;
    }
    if (remaining === 0 && !doneRef.current) {
      doneRef.current = true;
      beepThree();
    }
    if (remaining > 0) doneRef.current = false;
  }, [remaining, timer]);

  /* keep the screen awake while a rest timer is running (best effort) */
  useEffect(() => {
    if (!timer || remaining === 0) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request?.('screen')) ?? null;
      } catch {
        /* wake lock unavailable */
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === 'visible' && !cancelled) void request();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      try {
        void lock?.release();
      } catch {
        /* ignore */
      }
    };
  }, [timer, remaining]);

  const adjustTimer = (deltaSec: number) =>
    setTimer((t) =>
      t
        ? {
            endsAt: Math.max(Date.now() + 1000, t.endsAt + deltaSec * 1000),
            total: Math.max(30, t.total + deltaSec),
          }
        : t,
    );

  const showToast = (t: Toast) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 4000);
  };

  /* alphabetical exercise ordering, app-wide */
  const orderedExercises = useMemo(
    () => [...exercises].sort((a, b) => a.name.localeCompare(b.name)),
    [exercises],
  );

  /* addSet: PR detection BEFORE insert, then persist + auto-start rest timer */
  const addSet = (set: SetRow) => {
    const prev = sets.filter((s) => s.exId === set.exId && !s.miss && !s.warmup);
    const bits: string[] = [];

    if (!set.miss && !set.warmup) {
      const prevAtReps = prev.filter((s) => s.reps === set.reps);
      const bestAtReps = prevAtReps.length ? Math.max(...prevAtReps.map((s) => s.weight)) : null;
      const prevBestE = prev.length ? Math.max(...prev.map((s) => e1rm(s.weight, s.reps, s.rpe, settings))) : null;
      const newE = e1rm(set.weight, set.reps, set.rpe, settings);

      if (bestAtReps === null || set.weight > bestAtReps) bits.push(`${set.reps}RM PR`);
      if (prevBestE !== null && newE > prevBestE) bits.push('e1RM PR');

      goals
        .filter((g) => g.exId === set.exId)
        .filter((g) => goalMetBySet(g, set, settings) && !prev.some((s) => goalMetBySet(g, s, settings)))
        .forEach((g) => bits.push(`${goalName(g)} goal hit — ${g.weight}${settings.units}`));
    }

    void api.addSet(set);

    // unlock audio on the log tap; auto-start the rest timer for working sets
    ensureAudio();
    requestNotifPermission();
    if (!set.warmup) {
      const restSec = settings.restSec || 180;
      setTimer({ endsAt: Date.now() + restSec * 1000, total: restSec });
      setNow(Date.now());
    }

    const exName = exercises.find((e) => e.id === set.exId)?.name || '';
    if (set.miss) {
      showToast({ pr: false, text: `Miss logged — ${wLabel(set.weight, settings.units)} × ${set.reps}` });
    } else if (set.warmup) {
      showToast({ pr: false, text: `Warm-up logged — ${wLabel(set.weight, settings.units)} × ${set.reps}` });
    } else if (bits.length) {
      showToast({ pr: true, text: `${exName} — ${bits.join(' · ')}` });
    } else {
      showToast({ pr: false, text: `Logged ${wLabel(set.weight, settings.units)} × ${set.reps}` });
    }
  };

  const addHistoric = (set: SetRow) => {
    void api.addHistoric(set);
    showToast({ pr: false, text: `Historic PR saved — ${wLabel(set.weight, settings.units)} × ${set.reps}` });
  };

  if (!loaded) {
    return (
      <div className="wl-root">
        <div className="loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className={'wl-root' + (timer ? ' with-timer' : '')}>
      <header className="hdr">
        <div className="hdr-title">
          WHITE LIGHTS
          <span className="hdr-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="hdr-sub">training log</div>
      </header>

      <main className="main">
        {tab === 'log' && (
          <LogTab
            exercises={orderedExercises} sets={sets} settings={settings} tms={data.tms} goals={goals}
            notes={data.notes} plan={data.plan}
            programApi={{
              programs: api.programs,
              activeId: api.activeProgramId,
              onSelect: api.setActiveProgram,
              onRename: api.renameProgram,
              onDelete: api.deleteProgram,
              onAdd: api.addProgram,
            }}
            onAddSet={addSet} onDeleteSet={api.deleteSet} onEditSet={setEditing}
            onAddExercise={api.addExercise}
            onSetNote={api.setNote} onSetPlan={api.setPlan}
          />
        )}
        {tab === 'prs' && (
          <PRTab
            exercises={orderedExercises} sets={sets} settings={settings} goals={goals}
            selectedExId={api.selectedExId} onSelectEx={api.setSelectedExId}
            onAddGoal={api.addGoal} onDeleteGoal={api.deleteGoal}
            onAddHistoric={addHistoric} onDeleteSet={api.deleteSet}
          />
        )}
        {tab === 'history' && (
          <HistoryTab
            exercises={orderedExercises}
            sets={sets}
            settings={settings}
            notes={data.notes}
            onDeleteSet={api.deleteSet}
            onEditSet={setEditing}
          />
        )}
        {tab === 'charts' && (
          <ChartTab
            exercises={orderedExercises} sets={sets} settings={settings} goals={goals}
            selectedExId={api.selectedExId} onSelectEx={api.setSelectedExId}
          />
        )}
        {tab === 'more' && <MoreTab api={api} showToast={showToast} />}
      </main>

      {toast && (
        <div className={'toast' + (toast.pr ? ' toast-pr' : '')}>
          {toast.pr && (
            <span className="lights">
              <i />
              <i />
              <i />
            </span>
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {editing && (
        <SetEditModal
          set={editing}
          exercises={orderedExercises}
          settings={settings}
          onSave={(patch) => {
            void api.updateSet(editing.id, patch);
            setEditing(null);
            showToast({ pr: false, text: 'Set updated' });
          }}
          onDelete={() => {
            void api.deleteSet(editing.id);
            setEditing(null);
            showToast({ pr: false, text: 'Set deleted' });
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {timer && (
        <RestTimerBar
          timer={timer}
          remaining={remaining}
          onAdjust={adjustTimer}
          onDismiss={() => setTimer(null)}
        />
      )}

      <nav className="nav">
        {([
          ['log', 'Log'],
          ['history', 'History'],
          ['prs', 'PRs'],
          ['charts', 'Charts'],
          ['more', 'More'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            className={'nav-btn' + (tab === id ? ' on' : '')}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function requestNotifPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    /* ignore */
  }
}
