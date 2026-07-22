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

One-directional, append-only (app → sheet). Setup, in the target Sheet:

1. **Extensions → Apps Script**, paste this (the `sheet_()` helper auto-creates
   the `Log` tab so a missing tab can't silently break sync — see the gotcha
   below):

   ```js
   function sheet_() {
     const ss = SpreadsheetApp.getActiveSpreadsheet();
     let sh = ss.getSheetByName('Log');
     if (!sh) {
       sh = ss.insertSheet('Log');
       sh.appendRow(['date', 'exercise', 'weight', 'reps', 'rpe', 'miss', 'source', 'id']);
     }
     return sh;
   }

   function doPost(e) {
     const rows = JSON.parse(e.postData.contents); // array of row arrays
     const sh = sheet_();
     rows.forEach(r => sh.appendRow(r));
     return ContentService.createTextOutput('ok');
   }
   ```

2. **Deploy → New deployment → Web app**, execute as **Me**, access
   **Anyone**. Copy the **Web app URL** (ends in `/exec`).
3. Paste that `/exec` URL under **More → Google Sheets sync** in the app.

Each logged set queues a row (`date, exercise, weight, reps, rpe, miss,
source, id`) and flushes on app start, when connectivity returns, and after
each write. Deletes and edits do not sync — the sheet is a ledger, not a
mirror; the trailing `id` makes it self-deduplicating. The `/exec` URL is the
only secret — rotate by redeploying.

**The sheet only records sets logged _after_ you connect it** (append-only, no
backfill). To seed it with your existing log once, use **More → Export CSV**
and paste those rows into the `Log` tab.

### Sync gotchas (learned the hard way)

- **No tab named exactly `Log` → silent failure.** The app posts with
  `mode: 'no-cors'`, so it can never read the response: if `doPost` throws
  server-side (e.g. `getSheetByName('Log')` returns `null`), the app still
  thinks it synced and the sheet stays empty. The `sheet_()` helper above
  removes this trap; if you use the bare one-liner instead, the tab must be
  named `Log` (capital L, no spaces).
- **Paste the `/exec` URL, not the spreadsheet URL.** The app posts to the
  Apps Script Web App deployment (`…/macros/s/…/exec`), never to the
  `docs.google.com/spreadsheets/…` link.
- **Access must be "Anyone."** If the deployment is restricted, posts hit a
  Google sign-in page instead of running `doPost`, and nothing appends.
- **Editing the script? Redeploy.** A versioned Web App keeps running the code
  from its last deployment. After changing the script:
  **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**
  (the `/exec` URL stays the same). Running `testAppend` from the editor uses
  the latest code, but the live endpoint does not until you redeploy.
- **Test the endpoint directly** (bypasses the app's opaque `no-cors`):
  ```bash
  curl -L -X POST "<your /exec URL>" \
    -H "Content-Type: text/plain;charset=utf-8" \
    --data '[["2025-07-22","TEST",120,3,8,"","","test-1"]]'
  ```
  Expect `ok` and a new row. An HTML sign-in page means access isn't "Anyone."

## Deploy

Deploys to GitHub Pages via `.github/workflows/deploy-pages.yml` on every push
to the app branch: it runs the tests, builds, and publishes. The base path is
derived from the repo name (`VITE_BASE: /${{ github.event.repository.name }}/`),
so it stays correct across renames. Live at
`https://<user>.github.io/<repo>/`.

Any static host over HTTPS works too (HTTPS is required for a PWA). For a manual
subpath build:

```bash
VITE_BASE=/white-lights/ npm run build   # omit VITE_BASE for a root-domain host
```

### Deploy gotchas (learned the hard way)

- **First deploy is blocked by the `github-pages` environment.** By default the
  environment only allows the **default branch** to deploy. Either merge to the
  default branch, or **Settings → Environments → github-pages → Deployment
  branches** → allow the app branch. Also set **Settings → Pages → Source** to
  **GitHub Actions** once.
- **Renaming the repo doesn't redeploy — the site goes blank.** A rename changes
  the Pages path (`/old/` → `/new/`) but the last published build still points
  its assets at `/old/…`, which 404 at the new URL. Push any commit (or re-run
  the workflow) to rebuild with the new base path. The workflow deliberately has
  **no `paths:` filter** so any push redeploys.
- **Blank page after a redeploy is usually a stale service worker.** Hard-refresh
  (or use a private window) to pull the new SW; on iOS, remove and re-add the
  Home Screen icon if you'd added it while the page was broken.

## iOS notes

- **Install via Safari only:** open the URL, wait for it to load, **Share → Add
  to Home Screen**, then launch from that icon (standalone, offline-capable).
- **Install on the _working_ page.** If you added the icon while a deploy was
  broken/blank, delete that icon and re-add it once the page loads — otherwise
  it can keep a broken cached shell.
- **The installed app and Safari can use _separate_ storage on iOS.** Data typed
  in Safari may not appear in the installed app; treat each as its own device
  and move data between them via **More → Export JSON / Import from backup**.
- `navigator.storage.persist()` is requested on first run; the Sheets ledger
  and the export-backup flow are the belts against iOS storage eviction. Export
  a JSON backup occasionally — everything lives on-device.
- The rest timer is clock-based (`endsAt`) so it self-corrects after
  backgrounding. Three-beep + vibrate + a page `Notification` fire while the
  app is open; locked-phone Web Push is out of scope for v1.
- `navigator.wakeLock` keeps the screen awake while a timer runs.
