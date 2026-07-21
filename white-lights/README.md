# White Lights

A local-first, installable powerlifting training log. Sets are atomic;
PRs, e1RM, intensity bands, volume and goal progress are all derived views
over the raw sets — nothing derived is ever stored. Works fully offline in a
basement gym; an optional append-only Google Sheets ledger keeps every set
off-device.

Ported to a PWA from the validated Claude artifact prototype per
`whitelightspwamigrationplan.md`.

## Stack

- **Vite + React 18 + TypeScript**
- **Dexie 4** (IndexedDB) — source of truth, versioned schema, live queries
- **Recharts** — lift / volume / intensity charts
- **vite-plugin-pwa** (Workbox) — manifest, service worker, offline precache

## Develop

```bash
cd white-lights
npm install
npm run icons     # generate the PWA icon set (three white lights)
npm run dev       # http://localhost:5173
npm test          # derive.ts unit tests (e1RM, bands, plates, warm-ups, rolling denom)
npm run build     # type-check + production bundle in dist/
npm run preview   # serve the built bundle (PWA active here, not in dev)
```

## Data model

| Table       | Notes |
|-------------|-------|
| `sets`      | atomic records; `[exId+date]` compound index for hot queries |
| `exercises` | variations, recent-first ordered in the UI |
| `goals`     | per-variation e1RM or NRM targets |
| `notes`     | one per calendar date (primary key) |
| `kv`        | settings, plan, training maxes, sync URL/state |
| `outbox`    | queued sheet rows awaiting flush |

Dates are ISO **local-date strings** everywhere — no `Date` objects or UTC
conversion in stored data, which is how logs avoid off-by-one-day drift.

## Live program engine

The embedded 8-week block stores reference loads at the authoring training
maxes (Squat 220 / Bench 145 / Deadlift 270). Competition-lift loads recompute
live from the training maxes you set under **More → Training maxes**:
`round(refLoad / refTM × yourTM, 2.5)`. Bump your squat TM and every remaining
squat prescription updates — the spreadsheet's linked-cell behaviour, natively.

Re-author from a spreadsheet with `python scripts/parse_program.py sheet.xlsx`
(writes `public/program.json`; adjust the column mapping to your tab).

## Google Sheets sync (optional)

One-directional, append-only (app → sheet). In the target Sheet:
**Extensions → Apps Script**, paste:

```js
function doPost(e) {
  const rows = JSON.parse(e.postData.contents); // array of row arrays
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log');
  rows.forEach(r => sh.appendRow(r));
  return ContentService.createTextOutput('ok');
}
```

Deploy → Web App → execute as **me**, access **anyone with the link**. Paste
the deployment URL under **More → Google Sheets sync**. Each logged set queues
a row (`date, exercise, weight, reps, rpe, miss, source, id`) and flushes on
app start, when connectivity returns, and after each write. Deletes and edits
do not sync — the sheet is a ledger, not a mirror; the trailing `id` makes it
self-deduplicating. The URL is the only secret — rotate by redeploying.

## Deploy

Any static host over HTTPS (required for PWA). For a GitHub Pages / Cloudflare
Pages subpath, build with the base set:

```bash
VITE_BASE=/white-lights/ npm run build
```

## iOS notes

- Installs to the home screen and launches standalone, fully offline.
- `navigator.storage.persist()` is requested on first run; the Sheets ledger
  and the export-backup flow are the belts against iOS storage eviction.
- The rest timer is clock-based (`endsAt`) so it self-corrects after
  backgrounding. Three-beep + vibrate + a page `Notification` fire while the
  app is open; locked-phone Web Push is out of scope for v1.
- `navigator.wakeLock` keeps the screen awake while a timer runs.
