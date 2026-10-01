// PoloAI shared-state backend — runs entirely inside Google Apps Script, bound to a Google
// Sheet. No API key, no credit card, no third-party service: it uses your own Google account's
// access to the spreadsheet. Deploy this as a Web App (Deploy > New deployment > Web app,
// "Execute as: Me", "Who has access: Anyone") and you get a public URL the frontend calls.
//
// Storage model: the shared app-state JSON gets split into chunks and stored one-per-row,
// because Apps Script Web Apps serve responses to the browser through a redirect
// (script.googleusercontent.com/macros/echo?...) that has an undocumented size ceiling —
// empirically, requests around 32KB succeed and 64KB reliably fail. A single JSON blob for a
// real team's data (rosters + a season of games) will exceed that, so instead:
//   Row 1: [totalChunks, updatedAt]
//   Row 2..N+1: one chunk of the JSON string per row, column A.
// Reads and writes both happen chunk-by-chunk so no single request ever crosses that ceiling.

const SHEET_NAME = 'AppState';

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// GET (no params)   -> { totalChunks, updatedAt } — cheap, used to check "did anything change."
// GET ?chunk=N      -> { chunk: "<text>" } — one chunk of the stored JSON string.
function doGet(e) {
  const sheet = getSheet_();
  const chunkParam = e.parameter && e.parameter.chunk;
  if (chunkParam !== undefined && chunkParam !== null && chunkParam !== '') {
    const idx = parseInt(chunkParam, 10);
    const val = sheet.getRange(idx + 2, 1).getValue();
    return jsonOut_({ chunk: String(val || '') });
  }
  const totalChunks = sheet.getRange('A1').getValue();
  const updatedAt = sheet.getRange('B1').getValue();
  return jsonOut_({ totalChunks: totalChunks || 0, updatedAt: updatedAt || null });
}

// POST { chunkIndex, totalChunks, chunk } — writes one chunk. The metadata row (and therefore
// what readers see as "current") only updates on the LAST chunk of a save, so a reader polling
// mid-write still sees the previous complete version rather than a half-written one.
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const raw = e.postData && e.postData.contents;
    if (!raw) return jsonOut_({ error: 'Missing request body' });
    const body = JSON.parse(raw);
    if (typeof body.chunkIndex !== 'number' || typeof body.totalChunks !== 'number' || typeof body.chunk !== 'string') {
      return jsonOut_({ error: 'Malformed chunk payload' });
    }
    const sheet = getSheet_();
    sheet.getRange(body.chunkIndex + 2, 1).setValue(body.chunk);
    if (body.chunkIndex === body.totalChunks - 1) {
      const lastRow = sheet.getLastRow();
      const newLastRow = body.totalChunks + 1;
      if (lastRow > newLastRow) {
        sheet.getRange(newLastRow + 1, 1, lastRow - newLastRow, 1).clearContent();
      }
      const updatedAt = new Date().toISOString();
      sheet.getRange('A1').setValue(body.totalChunks);
      sheet.getRange('B1').setValue(updatedAt);
      return jsonOut_({ ok: true, updatedAt, committed: true });
    }
    return jsonOut_({ ok: true, committed: false });
  } catch (err) {
    return jsonOut_({ error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}
