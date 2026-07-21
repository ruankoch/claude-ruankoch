import { useRef, useState } from 'react';
import { fmtClock } from '../dates';
import type { AppApi } from '../hooks/useAppData';
import type { Settings, TrainingMaxes } from '../types';

function download(name: string, text: string, type: string) {
  try {
    const b = new Blob([text], { type });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1500);
  } catch (e) {
    console.error(e);
  }
}

function fmtSyncTime(ts: number | null): string {
  if (!ts) return 'never';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type Toast = { pr: boolean; text: string };

interface Props {
  api: AppApi;
  showToast: (t: Toast) => void;
}

function Seg<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={'seg-btn' + (value === v ? ' on' : '')} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const TM_LIFTS: [keyof TrainingMaxes, string][] = [
  ['squat', 'Squat'],
  ['bench', 'Bench'],
  ['dead', 'Deadlift'],
];

export function MoreTab({ api, showToast }: Props) {
  const { data, sync } = api;
  const { settings, tms } = data;
  const [confirmClear, setConfirmClear] = useState(false);
  const [urlDraft, setUrlDraft] = useState(sync.url);
  const fileRef = useRef<HTMLInputElement>(null);

  const setSettings = (patch: Partial<Settings>) => void api.setSettings(patch);
  const step = settings.units === 'lb' ? 5 : 2.5;

  const exportJSON = () => {
    download('white-lights-export.json', JSON.stringify(data, null, 2), 'application/json');
  };

  const exportCSV = () => {
    const exName = (id: string) => data.exercises.find((e) => e.id === id)?.name || id;
    const rows: (string | number)[][] = [
      ['date', 'exercise', `weight_${settings.units}`, 'reps', 'rpe', 'miss', 'source', 'id'],
    ];
    [...data.sets]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((s) => {
        rows.push([
          s.date, exName(s.exId), s.weight, s.reps, s.rpe ?? '',
          s.miss ? 1 : '', s.meet ? 'meet' : s.hist ? 'historic' : '', s.id,
        ]);
      });
    download('white-lights-export.csv', rows.map((r) => r.join(',')).join('\n'), 'text/csv');
  };

  const copyJSON = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data));
      showToast({ pr: false, text: 'Copied to clipboard' });
    } catch {
      showToast({ pr: false, text: 'Copy failed — use Export instead' });
    }
  };

  const onImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const res = await api.importBackup(parsed);
      showToast({
        pr: true,
        text: `Imported ${res.sets} sets · ${res.exercises} new exercises`,
      });
    } catch {
      showToast({ pr: false, text: 'Import failed — not a valid backup file' });
    }
  };

  const importMeets = async () => {
    const n = await api.importMeets();
    if (n === 0) showToast({ pr: false, text: 'Meet history already imported' });
    else showToast({ pr: true, text: `4 meets imported — ${n} attempts` });
  };

  const loadSample = async () => {
    await api.loadSample();
    showToast({ pr: false, text: '12 weeks of sample data loaded' });
  };

  const clearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    await api.clearAll();
    setConfirmClear(false);
    showToast({ pr: false, text: 'All data cleared' });
  };

  const saveUrl = async () => {
    await api.setSyncUrl(urlDraft);
    showToast({ pr: false, text: urlDraft ? 'Sync endpoint saved' : 'Sync endpoint cleared' });
  };

  const syncNow = async () => {
    if (!sync.url) {
      showToast({ pr: false, text: 'Set a sync endpoint first' });
      return;
    }
    const remaining = await api.syncNow();
    showToast({ pr: false, text: remaining === 0 ? 'Synced — queue empty' : `${remaining} rows still queued` });
  };

  const bumpTM = (k: keyof TrainingMaxes, delta: number) =>
    void api.setTMs({ [k]: Math.max(step, Math.round((tms[k] + delta) / step) * step) } as Partial<TrainingMaxes>);

  return (
    <div>
      <div className="sect">Settings</div>
      <div className="card">
        <div className="setrow2">
          <span className="lbl">e1RM formula</span>
          <Seg
            value={settings.formula}
            onChange={(v) => setSettings({ formula: v })}
            options={[['epley', 'Epley'], ['brzycki', 'Brzycki']]}
          />
        </div>
        <div className="setrow2">
          <span className="lbl">RPE-adjusted e1RM</span>
          <Seg
            value={settings.rpeAdjust ? 'on' : 'off'}
            onChange={(v) => setSettings({ rpeAdjust: v === 'on' })}
            options={[['on', 'On'], ['off', 'Off']]}
          />
        </div>
        <div className="setrow2">
          <span className="lbl">Units</span>
          <Seg
            value={settings.units}
            onChange={(v) => setSettings({ units: v })}
            options={[['kg', 'kg'], ['lb', 'lb']]}
          />
        </div>
        <div className="setrow2">
          <span className="lbl">Plate breakdown</span>
          <Seg
            value={settings.plates !== false ? 'on' : 'off'}
            onChange={(v) => setSettings({ plates: v === 'on' })}
            options={[['on', 'On'], ['off', 'Off']]}
          />
        </div>
        <div className="setrow2">
          <span className="lbl">Comp collars ({settings.units === 'lb' ? '5.5lb' : '2.5kg'} ea)</span>
          <Seg
            value={settings.collars ? 'on' : 'off'}
            onChange={(v) => setSettings({ collars: v === 'on' })}
            options={[['on', 'On'], ['off', 'Off']]}
          />
        </div>
        <div className="setrow2">
          <span className="lbl">Rest timer</span>
          <div className="stepper">
            <button
              className="step-btn sm"
              onClick={() => setSettings({ restSec: Math.max(30, (settings.restSec || 180) - 15) })}
            >
              −
            </button>
            <div className="step-val ro sm">{fmtClock(settings.restSec || 180)}</div>
            <button
              className="step-btn sm"
              onClick={() => setSettings({ restSec: (settings.restSec || 180) + 15 })}
            >
              +
            </button>
          </div>
        </div>
        <div className="foot">
          RPE-adjusted: a set of 3 @8 is treated as 5 reps to failure. Existing logs are re-derived
          instantly — nothing is stored except the raw sets. The rest timer starts automatically each
          time you log a set. With comp collars on, plate math and warm-ups account for 5kg on the bar
          before plates.
        </div>
      </div>

      <div className="sect">Training maxes</div>
      <div className="card">
        {TM_LIFTS.map(([k, label]) => (
          <div className="setrow2" key={k}>
            <span className="lbl">{label}</span>
            <div className="stepper">
              <button className="step-btn sm" onClick={() => bumpTM(k, -step)}>−</button>
              <div className="step-val ro sm">
                {tms[k]}
                {settings.units}
              </div>
              <button className="step-btn sm" onClick={() => bumpTM(k, step)}>+</button>
            </div>
          </div>
        ))}
        <div className="foot">
          The programme's competition-lift loads compute live from these. Bump a training max and every
          remaining prescription updates — the same behaviour as the source spreadsheet's linked cells.
        </div>
      </div>

      <div className="sect">Google Sheets sync</div>
      <div className="card">
        <div className="addrow" style={{ marginBottom: 8 }}>
          <input
            className="txt"
            placeholder="Apps Script Web App URL"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
          />
          <button className="btn-sm" onClick={saveUrl}>
            Save
          </button>
        </div>
        <div className="setrow2">
          <span className="lbl">
            {sync.queued} row{sync.queued === 1 ? '' : 's'} queued · last sync {fmtSyncTime(sync.lastSync)}
          </span>
          <button className="btn-sm" onClick={syncNow}>
            Sync now
          </button>
        </div>
        <div className="foot">
          Append-only, one-directional (app → sheet). Every logged set queues a row and flushes when
          online; deletes and edits do not sync. Set up the endpoint in the target Sheet under
          Extensions → Apps Script (execute as you, access "anyone with the link"). The URL is the
          only secret — rotate by redeploying if it ever leaks.
        </div>
      </div>

      <div className="sect">Data</div>
      <div className="card">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = '';
          }}
        />
        <div className="btncol">
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            Import from backup (JSON)
          </button>
          <button className="btn ghost" onClick={importMeets}>
            Import meet history (4 comps, 2023–25)
          </button>
          <button className="btn ghost" onClick={exportJSON}>
            Export JSON
          </button>
          <button className="btn ghost" onClick={exportCSV}>
            Export CSV
          </button>
          <button className="btn ghost" onClick={copyJSON}>
            Copy JSON to clipboard
          </button>
          <button className="btn ghost" onClick={loadSample}>
            Load 12 weeks of sample data
          </button>
          <button className={'btn danger' + (confirmClear ? ' armed' : '')} onClick={clearAll}>
            {confirmClear ? 'Tap again to erase everything' : 'Clear all data'}
          </button>
        </div>
        <div className="foot">
          {data.sets.length} sets · {data.exercises.length} exercises · {data.goals.length} goals stored
          on this device. Import ingests the artifact's export JSON verbatim, deduping on id.
        </div>
      </div>
    </div>
  );
}
