/* ═══════════════════════════════════════════════════════════
   POWERSTEEL – gsheet-sync.js  (v3 — handles all URL types)

   SUPPORTED URL FORMATS:
   1. Published CSV (long token):
      https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv
   2. Published CSV (short ID):
      https://docs.google.com/spreadsheets/d/{ID}/pub?output=csv&gid=0
   3. Share/edit link (short ID):
      https://docs.google.com/spreadsheets/d/{ID}/edit#gid=0
      → converted to /pub?output=csv automatically

   FETCH STRATEGY:
   Direct fetch first, then 3 proxy fallbacks.
   ═══════════════════════════════════════════════════════════ */

// ─── STATE ────────────────────────────────────────────────────
var _syncInterval    = null;
var _syncCountdown   = null;
var _syncSecsLeft    = 0;
var _syncSheetId     = null;
var _syncLabel       = null;
var _syncPubUrl      = null;   // The exact URL we fetch each time
var SYNC_INTERVAL_SEC = 10;

// ─── HOW-TO MODAL ─────────────────────────────────────────────
function showHowTo() {
  document.getElementById('howtoOverlay').classList.add('open');
}
function closeHowTo() {
  document.getElementById('howtoOverlay').classList.remove('open');
}

// ─── URL PARSING ──────────────────────────────────────────────
/**
 * Takes ANY Google Sheets URL and returns the best CSV fetch URL.
 * Returns { pubUrl, displayId } or null if not a Sheets URL at all.
 */
function parseGoogleSheetsUrl(raw) {
  var url = (raw || '').trim();
  if (!url) return null;
  if (url.indexOf('docs.google.com/spreadsheets') === -1) return null;

  // ── Case 1: Already a /pub URL (long token 2PACX- or short ID) ──
  // e.g. .../pub?output=csv  OR  .../pub?gid=0&single=true&output=csv
  if (url.indexOf('/pub') !== -1) {
    // Make sure output=csv is in there; add it if missing
    var pubUrl = url;
    if (pubUrl.indexOf('output=csv') === -1 && pubUrl.indexOf('format=csv') === -1) {
      pubUrl += (pubUrl.indexOf('?') !== -1 ? '&' : '?') + 'output=csv';
    }
    // Replace format=csv with output=csv for consistency
    pubUrl = pubUrl.replace('format=csv', 'output=csv');
    return { pubUrl: pubUrl, displayId: 'Google Sheet' };
  }

  // ── Case 2: Regular share / edit link with short ID ──
  // e.g. /spreadsheets/d/{ID}/edit#gid=123
  var idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return null;

  var id  = idMatch[1];
  var gidMatch = url.match(/[?&#]gid=([0-9]+)/);
  var gid = gidMatch ? gidMatch[1] : '0';

  var pubUrl = 'https://docs.google.com/spreadsheets/d/' + id + '/pub?output=csv&gid=' + gid;
  return { pubUrl: pubUrl, displayId: id };
}

// ─── CONNECT (called by button) ───────────────────────────────
async function connectGoogleSheet() {
  var input  = document.getElementById('gsheetUrlInput');
  var btn    = document.getElementById('gsheetConnectBtn');
  var rawUrl = (input.value || '').trim();

  if (!rawUrl) {
    showError('No URL Entered', 'Please paste your Google Sheets link first.');
    input.focus();
    return;
  }

  var parsed = parseGoogleSheetsUrl(rawUrl);
  if (!parsed) {
    showError(
      'Invalid URL',
      "That doesn't look like a Google Sheets link. It must contain docs.google.com/spreadsheets."
    );
    return;
  }

  // Show loading state on button
  btn.disabled = true;
  btn.innerHTML = '<span style="font-family:Montserrat;font-size:0.7rem;letter-spacing:0.05em;">Connecting\u2026</span>';

  try {
    var csvText = await fetchWithFallbacks(parsed.pubUrl);

    // Validate it looks like CSV, not an HTML error page
    if (isHtmlPage(csvText)) {
      throw new Error('PUBLISH_REQUIRED');
    }
    if (!csvText || csvText.trim() === '') {
      throw new Error('Empty response from Google Sheets.');
    }

    var rows = Papa.parse(csvText, { skipEmptyLines: false }).data;

    if (!rows || rows.length < 4) {
      throw new Error("Sheet has too few rows \u2014 make sure it's the correct leads report.");
    }
    var nonEmpty = rows.filter(function(r) {
      return r.some(function(c) { return c && String(c).trim() !== ''; });
    });
    if (nonEmpty.length < 4) {
      throw new Error('Sheet appears to have no usable data rows.');
    }

    // ✅ Store sync state
    _syncSheetId = parsed.displayId;
    _syncPubUrl  = parsed.pubUrl;
    _syncLabel   = 'Google Sheet (live)';

    // Show loading overlay and build dashboard
    var overlay = document.getElementById('loadingOverlay');
    var lt      = document.getElementById('loadingText');
    if (overlay) overlay.classList.add('show');
    if (lt)      lt.textContent = 'Loading from Google Sheet\u2026';

    setTimeout(function() {
      try {
        buildDashboard(rows, _syncLabel, null, true, false);
        startSyncLoop();
      } catch (e) {
        if (overlay) overlay.classList.remove('show');
        showError('Dashboard Error', e.message || 'Could not build dashboard from sheet data.');
        resetConnectBtn();
      }
    }, 200);

  } catch (err) {
    showError('Connection Failed', friendlyError(err.message || err));
    resetConnectBtn();
  }
}

// ─── FETCH WITH FALLBACKS ─────────────────────────────────────
/**
 * Tries the pub URL directly, then through 3 CORS proxies.
 * A unique cache-busting timestamp is appended to every URL so
 * neither the browser nor any proxy serves a stale response.
 * Returns the CSV text string, or throws.
 */
async function fetchWithFallbacks(pubUrl) {
  var errors = [];

  // Append a unique timestamp so every request bypasses all caches
  var bust = '_cb=' + Date.now();
  var bustUrl = pubUrl + (pubUrl.indexOf('?') !== -1 ? '&' : '?') + bust;

  // 1. Direct fetch — works if browser doesn't block CORS
  try {
    var r = await fetch(bustUrl, { method: 'GET', cache: 'no-store', redirect: 'follow' });
    if (r.ok) {
      var t = await r.text();
      if (t && !isHtmlPage(t)) return t;
      if (isHtmlPage(t)) errors.push('direct: HTML page (not published)');
      else errors.push('direct: empty');
    } else {
      errors.push('direct: HTTP ' + r.status);
    }
  } catch (e) { errors.push('direct: ' + e.message); }

  // 2. allorigins.win — returns JSON { contents: "..." }
  // Pass the busted URL so allorigins re-fetches from Google each time
  try {
    var aoUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(bustUrl);
    var r2 = await fetch(aoUrl, { cache: 'no-store' });
    if (r2.ok) {
      var j = await r2.json();
      var t2 = j.contents || '';
      if (t2 && !isHtmlPage(t2)) return t2;
      errors.push('allorigins: ' + (isHtmlPage(t2) ? 'HTML (not published)' : 'empty'));
    } else {
      errors.push('allorigins: HTTP ' + r2.status);
    }
  } catch (e) { errors.push('allorigins: ' + e.message); }

  // 3. corsproxy.io — plain passthrough
  try {
    var cpUrl = 'https://corsproxy.io/?' + encodeURIComponent(bustUrl);
    var r3 = await fetch(cpUrl, { cache: 'no-store' });
    if (r3.ok) {
      var t3 = await r3.text();
      if (t3 && !isHtmlPage(t3)) return t3;
      errors.push('corsproxy: ' + (isHtmlPage(t3) ? 'HTML' : 'empty'));
    } else {
      errors.push('corsproxy: HTTP ' + r3.status);
    }
  } catch (e) { errors.push('corsproxy: ' + e.message); }

  // 4. cors-anywhere fallback
  try {
    var haUrl = 'https://cors-anywhere.herokuapp.com/' + bustUrl;
    var r4 = await fetch(haUrl, { cache: 'no-store' });
    if (r4.ok) {
      var t4 = await r4.text();
      if (t4 && !isHtmlPage(t4)) return t4;
      errors.push('cors-anywhere: ' + (isHtmlPage(t4) ? 'HTML' : 'empty'));
    } else {
      errors.push('cors-anywhere: HTTP ' + r4.status);
    }
  } catch (e) { errors.push('cors-anywhere: ' + e.message); }

  // All failed
  var hasHtml = errors.some(function(e) { return e.indexOf('HTML') !== -1; });
  console.error('PowerSteel fetch errors:', errors);

  if (hasHtml) throw new Error('PUBLISH_REQUIRED');
  throw new Error('NETWORK_FAILED:' + errors.join(' | '));
}

function isHtmlPage(text) {
  if (!text) return false;
  var t = text.trim().toLowerCase();
  return t.indexOf('<!doctype') === 0 || t.indexOf('<html') === 0;
}

// ─── FRIENDLY ERROR MESSAGES ──────────────────────────────────
function friendlyError(msg) {
  msg = msg || '';
  if (msg === 'PUBLISH_REQUIRED') {
    return 'Sheet is not published correctly. In Google Sheets: File \u2192 Share \u2192 Publish to web \u2192 select your tab \u2192 CSV \u2192 click Publish \u2192 copy that link and paste it here.';
  }
  if (msg.indexOf('NETWORK_FAILED') === 0) {
    return 'Could not fetch the sheet after trying 4 methods. Check your internet connection. Details: ' + msg.replace('NETWORK_FAILED:', '');
  }
  if (msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('NetworkError') !== -1) {
    return 'Network error \u2014 could not reach Google Sheets. Check your internet connection.';
  }
  if (msg.indexOf('too few rows') !== -1 || msg.indexOf('no usable') !== -1) {
    return msg;
  }
  return msg || 'Unknown error. Please try again.';
}

function resetConnectBtn() {
  var btn = document.getElementById('gsheetConnectBtn');
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:#fff;flex-shrink:0">' +
    '<path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5z' +
    'M4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>' +
    'Connect';
}

// ─── SYNC LOOP ────────────────────────────────────────────────
function startSyncLoop() {
  stopSyncLoop();

  var indicator = document.getElementById('syncIndicator');
  var dot       = document.getElementById('syncDot');
  if (indicator) indicator.classList.add('active');
  if (dot) dot.className = 'sync-dot';

  _syncSecsLeft = SYNC_INTERVAL_SEC;
  _updateCountdown();

  _syncCountdown = setInterval(function() {
    _syncSecsLeft = Math.max(0, _syncSecsLeft - 1);
    _updateCountdown();
    if (_syncSecsLeft === 0) {
      // Reset counter immediately so display shows next cycle
      _syncSecsLeft = SYNC_INTERVAL_SEC;
    }
  }, 1000);

  _syncInterval = setInterval(function() { _doSync(); }, SYNC_INTERVAL_SEC * 1000);
}

function stopSyncLoop() {
  if (_syncInterval)  { clearInterval(_syncInterval);  _syncInterval  = null; }
  if (_syncCountdown) { clearInterval(_syncCountdown); _syncCountdown = null; }
}

function _updateCountdown() {
  var el = document.getElementById('syncCountdown');
  if (el) el.textContent = _syncSecsLeft + 's';
}

async function _doSync() {
  if (!_syncPubUrl) return;
  var dot = document.getElementById('syncDot');
  if (dot) dot.className = 'sync-dot syncing';
  try {
    var csvText = await fetchWithFallbacks(_syncPubUrl);
    if (!csvText || isHtmlPage(csvText)) throw new Error('Bad response');
    var rows = Papa.parse(csvText, { skipEmptyLines: false }).data;
    if (!rows || rows.length < 4) throw new Error('Too few rows');
    buildDashboard(rows, _syncLabel, null, true, true); // silent=true preserves scroll & tab
    if (dot) dot.className = 'sync-dot';
    _syncSecsLeft = SYNC_INTERVAL_SEC;
  } catch (e) {
    console.warn('PowerSteel sync error:', e.message);
    if (dot) dot.className = 'sync-dot error';
  }
}

async function manualSync() {
  if (!_syncPubUrl) return;
  _syncSecsLeft = SYNC_INTERVAL_SEC;
  await _doSync();
}

// ─── DISCONNECT ───────────────────────────────────────────────
function disconnectSync() {
  stopSyncLoop();
  _syncSheetId = null;
  _syncLabel   = null;
  _syncPubUrl  = null;
  var indicator = document.getElementById('syncIndicator');
  if (indicator) indicator.classList.remove('active');
  backToLanding();
}

// ─── PATCH backToLanding ──────────────────────────────────────
var _origBackToLanding = backToLanding;
backToLanding = function() {
  stopSyncLoop();
  _syncSheetId = null;
  _syncPubUrl  = null;
  _syncLabel   = null;
  resetConnectBtn();
  var urlInput = document.getElementById('gsheetUrlInput');
  if (urlInput) urlInput.value = '';
  _origBackToLanding();
};
