import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ExercisePicker } from './ExercisePicker';
import { AXIS_TICK, TT_LABEL, TT_STYLE } from './chartStyle';
import {
  colorForReps, e1rm, fmtTon, goalName, INTENSITY_BANDS, PATTERN_COLORS, PATTERNS,
  patternOf, resolveExId, rollingDenominator, round1, type Pattern,
} from '../derive';
import { fmtDate, fmtDateFull, rangeCutoff, todayStr, weekStart } from '../dates';
import type { Exercise, Goal, SetRow, Settings } from '../types';

type Mode = 'lift' | 'volume' | 'intensity';

interface TabProps {
  exercises: Exercise[];
  sets: SetRow[];
  settings: Settings;
  goals: Goal[];
  selectedExId: string;
  onSelectEx: (id: string) => void;
}

export function ChartTab({ exercises, sets, settings, goals, selectedExId, onSelectEx }: TabProps) {
  const [mode, setMode] = useState<Mode>('lift');
  const [rangeWks, setRangeWks] = useState(8);
  const sel = { selectedExId, onSelectEx };

  return (
    <div>
      <div className="seg wide">
        {([['lift', 'Lift'], ['volume', 'Volume'], ['intensity', 'Intensity']] as [Mode, string][]).map(
          ([v, l]) => (
            <button key={v} className={'seg-btn' + (mode === v ? ' on' : '')} onClick={() => setMode(v)}>
              {l}
            </button>
          ),
        )}
      </div>

      {mode !== 'lift' && (
        <div className="rangerow">
          {([[4, '4 wks'], [8, '8 wks'], [0, 'All']] as [number, string][]).map(([v, l]) => (
            <button
              key={v}
              className={'legend-rep' + (rangeWks === v ? ' on' : '')}
              style={rangeWks === v ? { borderColor: '#EDEDE8', color: '#EDEDE8' } : {}}
              onClick={() => setRangeWks(v)}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {mode === 'lift' && (
        <LiftChart exercises={exercises} sets={sets} settings={settings} goals={goals} {...sel} />
      )}
      {mode === 'volume' && (
        <VolumeView exercises={exercises} sets={sets} settings={settings} rangeWks={rangeWks} {...sel} />
      )}
      {mode === 'intensity' && (
        <IntensityView exercises={exercises} sets={sets} settings={settings} rangeWks={rangeWks} {...sel} />
      )}
    </div>
  );
}

function LiftChart({ exercises, sets, settings, goals, selectedExId, onSelectEx }: TabProps) {
  const [selReps, setSelReps] = useState<number[] | null>(null);
  const exId = resolveExId(selectedExId, exercises);

  const mine = sets.filter((s) => s.exId === exId && !s.miss);
  const exGoals = goals.filter((g) => g.exId === exId);

  const repCounts = useMemo(() => {
    const set = new Set(mine.map((s) => s.reps));
    return [...set].sort((a, b) => a - b);
  }, [mine]);

  const active = useMemo(() => {
    if (selReps) return selReps.filter((r) => repCounts.includes(r));
    return [1, 3, 5].filter((r) => repCounts.includes(r));
  }, [selReps, repCounts]);

  const toggleRep = (n: number) => {
    const next = active.includes(n)
      ? active.filter((x) => x !== n)
      : [...active, n].sort((a, b) => a - b);
    setSelReps(next);
  };

  const series = useMemo(() => {
    const byDate: Record<string, SetRow[]> = {};
    mine.forEach((s) => {
      (byDate[s.date] ||= []).push(s);
    });
    return Object.keys(byDate)
      .sort()
      .map((d) => {
        const ss = byDate[d];
        const row: Record<string, number | string> = {
          date: d,
          e1rm: round1(Math.max(...ss.map((x) => e1rm(x.weight, x.reps, x.rpe, settings)))),
        };
        ss.forEach((x) => {
          const k = 'r' + x.reps;
          row[k] = Math.max((row[k] as number) || 0, x.weight);
        });
        return row;
      });
  }, [mine, settings]);

  return (
    <div>
      <ExercisePicker
        exercises={exercises} exId={exId}
        onSelect={(id) => {
          onSelectEx(id);
          setSelReps(null);
        }}
      />

      {!mine.length && (
        <div className="empty">
          Nothing logged for this lift yet. Log a set, or load sample data under More.
        </div>
      )}

      {mine.length > 0 && (
        <>
          <div className="legendrow">
            <span className="legend-e1">
              <i />
              e1RM{settings.rpeAdjust ? ' (RPE-adj)' : ''}
            </span>
            {repCounts.map((n) => (
              <button
                key={n}
                className={'legend-rep' + (active.includes(n) ? ' on' : '')}
                style={active.includes(n) ? { borderColor: colorForReps(n), color: colorForReps(n) } : {}}
                onClick={() => toggleRep(n)}
              >
                {n}RM
              </button>
            ))}
          </div>

          <div className="card chart-card">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={series} margin={{ top: 12, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="#24282D" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date" tickFormatter={fmtDate} tick={AXIS_TICK}
                  axisLine={{ stroke: '#2A2E33' }} tickLine={false} minTickGap={28}
                />
                <YAxis domain={['auto', 'auto']} tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  labelFormatter={fmtDateFull}
                  formatter={(v, name) => [
                    `${v} ${settings.units}`,
                    name === 'e1rm' ? 'e1RM' : String(name).replace('r', '') + 'RM',
                  ]}
                  contentStyle={TT_STYLE}
                  labelStyle={TT_LABEL}
                />
                {exGoals.map((g) => (
                  <ReferenceLine
                    key={g.id} y={g.weight} ifOverflow="extendDomain"
                    stroke={g.reps == null ? '#EDEDE8' : colorForReps(g.reps)}
                    strokeDasharray="6 5" strokeOpacity={0.55}
                    label={{
                      value: `${goalName(g)} goal ${g.weight}`,
                      position: 'insideTopRight',
                      fill: g.reps == null ? '#B9BEC4' : colorForReps(g.reps),
                      fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  />
                ))}
                <Line
                  type="monotone" dataKey="e1rm" stroke="#EDEDE8" strokeWidth={2.2}
                  dot={false} activeDot={{ r: 4 }} connectNulls
                />
                {active.map((n) => (
                  <Line
                    key={n} type="monotone" dataKey={'r' + n}
                    stroke={colorForReps(n)} strokeWidth={1.6} strokeDasharray="1 0"
                    dot={{ r: 3, fill: colorForReps(n), strokeWidth: 0 }} connectNulls
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="foot pad">
            White line: estimated 1RM per session. Coloured lines: heaviest actual set at that rep
            count. Dashed lines: goals. Tap a rep chip to toggle.
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- volume & intensity ---------- */

type Scope = 'pattern' | 'lift';

function ScopeControls({
  scope, setScope, metric, setMetric, showMetric,
}: {
  scope: Scope;
  setScope: (s: Scope) => void;
  metric?: string;
  setMetric?: (m: string) => void;
  showMetric: boolean;
}) {
  return (
    <div className="ctrlrow">
      <div className="seg">
        {([['pattern', 'By pattern'], ['lift', 'By lift']] as [Scope, string][]).map(([v, l]) => (
          <button key={v} className={'seg-btn' + (scope === v ? ' on' : '')} onClick={() => setScope(v)}>
            {l}
          </button>
        ))}
      </div>
      {showMetric && metric && setMetric && (
        <div className="seg">
          {[['ton', 'Tonnage'], ['sets', 'Sets'], ['reps', 'Reps']].map(([v, l]) => (
            <button key={v} className={'seg-btn' + (metric === v ? ' on' : '')} onClick={() => setMetric(v)}>
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PatternLegend({ patterns }: { patterns: Pattern[] }) {
  return (
    <div className="legendrow">
      {patterns.map((p) => (
        <span key={p} className="patkey">
          <i style={{ background: PATTERN_COLORS[p] }} />
          {p}
        </span>
      ))}
    </div>
  );
}

interface RangeProps extends TabProps {
  rangeWks: number;
}

function VolumeView({ exercises, sets, settings, rangeWks, selectedExId, onSelectEx }: Omit<RangeProps, 'goals'>) {
  const [metric, setMetric] = useState('ton');
  const [scope, setScope] = useState<Scope>('pattern');
  const exId = resolveExId(selectedExId, exercises);

  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name || '';
  const cutoff = rangeCutoff(rangeWks);

  const rows = useMemo(() => {
    const byWeek: Record<string, Record<string, number | string>> = {};
    sets.forEach((s) => {
      if (s.miss) return;
      if (cutoff && s.date < cutoff) return;
      if (scope === 'lift' && s.exId !== exId) return;
      const wk = weekStart(s.date);
      const key = scope === 'pattern' ? patternOf(nameOf(s.exId)) : 'v';
      const row = (byWeek[wk] ||= { week: wk });
      const val = metric === 'ton' ? s.weight * s.reps : metric === 'sets' ? 1 : s.reps;
      row[key] = ((row[key] as number) || 0) + val;
    });
    return Object.values(byWeek).sort((a, b) => String(a.week).localeCompare(String(b.week)));
  }, [sets, cutoff, scope, exId, metric, exercises]);

  const patternsPresent = PATTERNS.filter((p) => rows.some((r) => r[p]));

  const thisWk = weekStart(todayStr());
  const tw = useMemo(() => {
    const m: Record<string, { sets: number; reps: number; ton: number }> = {};
    sets.forEach((s) => {
      if (s.miss || weekStart(s.date) !== thisWk) return;
      const t = (m[patternOf(nameOf(s.exId))] ||= { sets: 0, reps: 0, ton: 0 });
      t.sets += 1;
      t.reps += s.reps;
      t.ton += s.weight * s.reps;
    });
    return m;
  }, [sets, exercises]);
  const twPatterns = PATTERNS.filter((p) => tw[p]);

  const yTick = (v: number) =>
    metric === 'ton' && settings.units === 'kg' ? `${round1(v / 1000)}t` : String(v);
  const ttFmt = (v: number, name: string): [string, string] => [
    metric === 'ton' ? fmtTon(v, settings.units) : `${v} ${metric}`,
    scope === 'pattern' ? name : nameOf(exId),
  ];

  return (
    <div>
      <ScopeControls scope={scope} setScope={setScope} metric={metric} setMetric={setMetric} showMetric />
      {scope === 'lift' && <ExercisePicker exercises={exercises} exId={exId} onSelect={onSelectEx} />}

      {twPatterns.length > 0 && (
        <div className="card table-card">
          <table className="prtable">
            <thead>
              <tr>
                <th>This week</th>
                <th>Sets</th>
                <th>Reps</th>
                <th>Tonnage</th>
              </tr>
            </thead>
            <tbody>
              {twPatterns.map((p) => (
                <tr key={p}>
                  <td>
                    <span className="repdot" style={{ background: PATTERN_COLORS[p] }} />
                    {p}
                  </td>
                  <td className="mut">{tw[p].sets}</td>
                  <td className="mut">{tw[p].reps}</td>
                  <td className="strong">{fmtTon(tw[p].ton, settings.units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 0 && (
        <div className="empty">No made lifts in this window. Log some sets, or widen the range.</div>
      )}

      {rows.length > 0 && (
        <>
          {scope === 'pattern' && <PatternLegend patterns={patternsPresent} />}
          <div className="card chart-card">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="#24282D" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="week" tickFormatter={fmtDate} tick={AXIS_TICK}
                  axisLine={{ stroke: '#2A2E33' }} tickLine={false} minTickGap={24}
                />
                <YAxis tick={AXIS_TICK} tickFormatter={yTick} axisLine={false} tickLine={false} width={50} />
                <Tooltip
                  labelFormatter={(w) => `wk of ${fmtDateFull(String(w))}`}
                  formatter={ttFmt as never}
                  contentStyle={TT_STYLE} labelStyle={TT_LABEL}
                  cursor={{ fill: 'rgba(237,237,232,0.05)' }}
                />
                {scope === 'pattern' ? (
                  patternsPresent.map((p) => <Bar key={p} dataKey={p} stackId="wk" fill={PATTERN_COLORS[p]} />)
                ) : (
                  <Bar dataKey="v" fill={PATTERN_COLORS[patternOf(nameOf(exId))]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="foot pad">
            Weekly {metric === 'ton' ? 'tonnage (weight × reps)' : metric} from made lifts only —
            misses and warm-ups you didn't log are excluded. Weeks start Monday.
          </div>
        </>
      )}
    </div>
  );
}

function IntensityView({ exercises, sets, settings, rangeWks, selectedExId, onSelectEx }: Omit<RangeProps, 'goals'>) {
  const [scope, setScope] = useState<Scope>('pattern');
  const exId = resolveExId(selectedExId, exercises);
  const [denom, setDenom] = useState<'all' | 'roll'>('all');

  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name || '';
  const cutoff = rangeCutoff(rangeWks);

  const bestE = useMemo(() => {
    const m: Record<string, number> = {};
    sets.forEach((s) => {
      if (s.miss) return;
      const v = e1rm(s.weight, s.reps, s.rpe, settings);
      if (!m[s.exId] || v > m[s.exId]) m[s.exId] = v;
    });
    return m;
  }, [sets, settings]);

  const byEx = useMemo(() => {
    const m: Record<string, SetRow[]> = {};
    sets.forEach((s) => {
      if (!s.miss) (m[s.exId] ||= []).push(s);
    });
    return m;
  }, [sets]);

  const rows = useMemo(() => {
    const base: Record<string, number | string>[] = INTENSITY_BANDS.map((b) => ({ band: b.k }));
    const denomFor = (s: SetRow): number | null => {
      if (denom === 'all') return bestE[s.exId] || null;
      return rollingDenominator(s, byEx[s.exId] || [], settings);
    };
    sets.forEach((s) => {
      if (s.miss) return;
      if (cutoff && s.date < cutoff) return;
      if (scope === 'lift' && s.exId !== exId) return;
      const best = denomFor(s);
      if (!best) return;
      const pct = (s.weight / best) * 100;
      const bi = INTENSITY_BANDS.findIndex((b) => pct >= b.lo && pct < b.hi);
      if (bi < 0) return;
      const key = scope === 'pattern' ? patternOf(nameOf(s.exId)) : 'v';
      base[bi][key] = ((base[bi][key] as number) || 0) + 1;
    });
    return base;
  }, [sets, bestE, byEx, denom, cutoff, scope, exId, exercises, settings]);

  const patternsPresent = PATTERNS.filter((p) => rows.some((r) => r[p]));
  const anyData = rows.some((r) => PATTERNS.some((p) => r[p]) || r.v);

  return (
    <div>
      <ScopeControls scope={scope} setScope={setScope} showMetric={false} />
      <div className="ctrlrow">
        <div className="seg">
          {([['all', 'vs all-time'], ['roll', 'vs 12-wk']] as ['all' | 'roll', string][]).map(([v, l]) => (
            <button key={v} className={'seg-btn' + (denom === v ? ' on' : '')} onClick={() => setDenom(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {scope === 'lift' && <ExercisePicker exercises={exercises} exId={exId} onSelect={onSelectEx} />}

      {!anyData && (
        <div className="empty">No made lifts in this window. Log some sets, or widen the range.</div>
      )}

      {anyData && (
        <>
          {scope === 'pattern' && <PatternLegend patterns={patternsPresent} />}
          <div className="card chart-card">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: -22 }}>
                <CartesianGrid stroke="#24282D" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="band" tick={AXIS_TICK} axisLine={{ stroke: '#2A2E33' }} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(b) => `${b} % of e1RM`}
                  formatter={(v, name) => [`${v} sets`, scope === 'pattern' ? String(name) : nameOf(exId)]}
                  contentStyle={TT_STYLE} labelStyle={TT_LABEL}
                  cursor={{ fill: 'rgba(237,237,232,0.05)' }}
                />
                {scope === 'pattern' ? (
                  patternsPresent.map((p) => <Bar key={p} dataKey={p} stackId="b" fill={PATTERN_COLORS[p]} />)
                ) : (
                  <Bar dataKey="v" fill={PATTERN_COLORS[patternOf(nameOf(exId))]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="foot pad">
            Each made set banded by its weight as a % of{' '}
            {denom === 'all'
              ? "that lift's all-time best e1RM"
              : "the lift's best e1RM in the trailing 12 weeks before that set (falls back to all-time when fewer than 3 sessions in window)"}{' '}
            ({settings.rpeAdjust ? 'RPE-adjusted' : 'raw'}). Programmed top singles @8 should land in
            90–95 vs current strength; 95+ is max-attempt territory and should be rare outside
            peaking. After a layoff, prefer vs 12-wk — the all-time denominator goes stale.
          </div>
        </>
      )}
    </div>
  );
}
