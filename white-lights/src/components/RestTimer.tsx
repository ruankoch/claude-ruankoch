import { fmtClock } from '../dates';

export interface TimerState {
  endsAt: number; // clock-based so it self-corrects after backgrounding
  total: number;
}

interface Props {
  timer: TimerState;
  remaining: number;
  onAdjust: (deltaSec: number) => void;
  onDismiss: () => void;
}

export function RestTimerBar({ timer, remaining, onAdjust, onDismiss }: Props) {
  const cls = remaining === 0 ? ' zero' : remaining <= 15 ? ' low' : '';
  const pct = timer.total ? Math.max(0, Math.min(100, (remaining / timer.total) * 100)) : 0;
  return (
    <div className={'timerbar' + cls}>
      <div className="timerbar-fill" style={{ width: `${pct}%` }} />
      <div className="timerbar-content">
        <span className="timer-clock">{fmtClock(remaining)}</span>
        <span className="timer-label">{remaining === 0 ? 'Rest over — go lift' : 'Rest'}</span>
        <div className="timer-ctrl">
          <button className="timer-btn" onClick={() => onAdjust(-30)}>−30</button>
          <button className="timer-btn" onClick={() => onAdjust(30)}>+30</button>
          <button className="timer-btn x" onClick={onDismiss} aria-label="Dismiss timer">✕</button>
        </div>
      </div>
    </div>
  );
}
