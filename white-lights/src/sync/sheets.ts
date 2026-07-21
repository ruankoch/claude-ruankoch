/* Google Apps Script Web App sink. Append-only, fire-and-forget.

   Endpoint (Sheet → Extensions → Apps Script), deploy as Web App,
   execute as *me*, access *anyone with the link*:

     function doPost(e) {
       const rows = JSON.parse(e.postData.contents); // array of row arrays
       const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log');
       rows.forEach(r => sh.appendRow(r));
       return ContentService.createTextOutput('ok');
     }

   The deployment URL is the only secret; it lives in Settings (kv). */

export type SheetRow = (string | number)[];

/**
 * POST a batch of rows. Resolves on delivery, rejects on network failure so
 * the caller keeps the rows queued. Uses a CORS-simple request (text/plain,
 * no-cors) so no preflight and no Apps Script CORS config is needed; the
 * response is opaque, which is fine — the Sheet dedupes on the trailing id.
 */
export async function postRows(url: string, rows: SheetRow[]): Promise<void> {
  if (!url) throw new Error('No sync URL configured');
  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(rows),
  });
}
