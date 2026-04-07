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
var SYNC_INTERVAL_SEC = 30;
var SYNC_SCAN_SEC     = 3;
var _syncRequestSeq   = 0;
var _syncInFlight     = false;
var _syncAppliedHash  = null;
var _syncHashOrder    = [];
var _pendingSyncCsv   = null;
var _pendingSyncHash  = null;

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
    _syncRequestSeq = 0;
    _syncInFlight = false;
    _syncAppliedHash = String(csvText);
    _syncHashOrder = [_syncAppliedHash];
    _pendingSyncCsv = null;
    _pendingSyncHash = null;

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
  function fetchTextWithTimeout(url, options, timeoutMs) {
    return Promise.race([
      fetch(url, options),
      new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error('timeout')); }, timeoutMs);
      })
    ]);
  }

  // Append a unique timestamp so every request bypasses all caches
  var bust = '_cb=' + Date.now();
  var bustUrl = pubUrl + (pubUrl.indexOf('?') !== -1 ? '&' : '?') + bust;

  var errors = [];
  var firstSuccess = null; // { source, text, key }
  var keyCounts = {};      // key -> { count, sampleText, sources:{} }
  var publishRequiredSeen = false;

  function recordError(source, err) {
    var msg = err && err.message ? err.message : String(err);
    if (msg === 'PUBLISH_REQUIRED') publishRequiredSeen = true;
    errors.push(source + ': ' + msg);
  }

  function makeLayer(source, runner) {
    return runner()
      .then(function(text) {
        if (!text) throw new Error('EMPTY_RESPONSE');
        if (isHtmlPage(text)) throw new Error('PUBLISH_REQUIRED');
        var key = String(text).trim();
        var entry = { source: source, text: text, key: key };
        if (!firstSuccess) firstSuccess = entry;
        if (!keyCounts[key]) keyCounts[key] = { count: 0, sampleText: text, sources: {} };
        if (!keyCounts[key].sources[source]) {
          keyCounts[key].sources[source] = true;
          keyCounts[key].count += 1;
        }
        return entry;
      })
      .catch(function(err) {
        recordError(source, err);
      });
  }

  var aoUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(bustUrl);
  var cpUrl = 'https://corsproxy.io/?' + encodeURIComponent(bustUrl);

  var layers = [
    makeLayer('direct', function() {
      return fetchTextWithTimeout(
        bustUrl,
        { method: 'GET', cache: 'no-store', redirect: 'follow' },
        3000
      ).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
    }),
    makeLayer('allorigins', function() {
      return fetchTextWithTimeout(aoUrl, { cache: 'no-store' }, 4500)
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function(j) { return j.contents || ''; });
    }),
    makeLayer('corsproxy', function() {
      return fetchTextWithTimeout(cpUrl, { cache: 'no-store' }, 4500)
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        });
    })
  ];

  // Early-consensus: resolve immediately on 2-of-N match; otherwise resolve fast with first success.
  var EARLY_DEADLINE_MS = 1800;
  var totalLayers = layers.length;
  var settled = 0;

  var result = await new Promise(function(resolve, reject) {
    var done = false;
    var deadlineTimer = setTimeout(function() {
      if (done) return;
      if (firstSuccess) {
        done = true;
        resolve(firstSuccess.text);
      }
      // If no success yet, keep waiting for either consensus or any success.
    }, EARLY_DEADLINE_MS);

    function tryResolveConsensus() {
      for (var k in keyCounts) {
        if (Object.prototype.hasOwnProperty.call(keyCounts, k) && keyCounts[k].count >= 2) {
          if (!done) {
            done = true;
            clearTimeout(deadlineTimer);
            resolve(keyCounts[k].sampleText);
          }
          return true;
        }
      }
      return false;
    }

    layers.forEach(function(p) {
      Promise.resolve(p).then(function(entry) {
        // entry is the success object for that layer (or undefined if it errored)
        if (done) return;
        if (entry && tryResolveConsensus()) return;
        // If we have at least one success after the deadline already fired,
        // allow immediate resolve with firstSuccess to avoid waiting longer.
        // (Deadline handler will resolve if it can; this is just a safety net.)
      }).finally(function() {
        settled += 1;
        if (done) return;
        // If everything settled and we still didn't resolve:
        if (settled === totalLayers) {
          clearTimeout(deadlineTimer);
          if (firstSuccess) return resolve(firstSuccess.text);
          if (publishRequiredSeen) return reject(new Error('PUBLISH_REQUIRED'));
          return reject(new Error('NETWORK_FAILED:' + errors.join(' | ')));
        }
      });
    });
  }).catch(function(e) { throw e; });

  return result;
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
    return 'Could not fetch the sheet after checking multiple sync layers. Check your internet connection and sheet publish settings. Details: ' + msg.replace('NETWORK_FAILED:', '');
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
      // Apply only the newest pending snapshot when timer completes.
      _applyPendingSync();
      _syncSecsLeft = SYNC_INTERVAL_SEC;
      _updateCountdown();
    }
  }, 1000);

  // Keep scanning in background continuously; timer only controls apply timing.
  _syncInterval = setInterval(function() { _scanForSyncUpdate(); }, SYNC_SCAN_SEC * 1000);
  _scanForSyncUpdate();
}

function stopSyncLoop() {
  if (_syncInterval)  { clearInterval(_syncInterval);  _syncInterval  = null; }
  if (_syncCountdown) { clearInterval(_syncCountdown); _syncCountdown = null; }
}

function _updateCountdown() {
  var el = document.getElementById('syncCountdown');
  if (el) el.textContent = _syncSecsLeft + 's';
}

async function _scanForSyncUpdate() {
  if (!_syncPubUrl || _syncInFlight) return;
  _syncInFlight = true;
  var reqSeq = ++_syncRequestSeq;
  var dot = document.getElementById('syncDot');
  if (dot) dot.className = 'sync-dot syncing';
  try {
    var csvText = await fetchWithFallbacks(_syncPubUrl);
    // Ignore if a newer request already started while this one was pending.
    if (reqSeq !== _syncRequestSeq) return;
    if (!csvText || isHtmlPage(csvText)) throw new Error('Bad response');
    var csvHash = String(csvText);
    // Prevent rollbacks: once a newer snapshot is applied, never apply older seen hashes.
    var seenIdx = _syncHashOrder.indexOf(csvHash);
    if (seenIdx !== -1 && _syncAppliedHash !== null) {
      var currentIdx = _syncHashOrder.indexOf(_syncAppliedHash);
      if (currentIdx !== -1 && seenIdx < currentIdx) {
        if (dot) dot.className = 'sync-dot';
        return;
      }
    }
    // Skip if no new snapshot.
    if (csvHash === _syncAppliedHash) {
      if (dot) dot.className = 'sync-dot';
      return;
    }

    // Keep only the newest pending snapshot; it is applied on timer boundary.
    _pendingSyncCsv = csvText;
    _pendingSyncHash = csvHash;
    if (dot) dot.className = 'sync-dot';
  } catch (e) {
    console.warn('PowerSteel sync error:', e.message);
    if (dot) dot.className = 'sync-dot error';
  } finally {
    _syncInFlight = false;
  }
}

function _applyPendingSync() {
  if (!_pendingSyncCsv || !_pendingSyncHash) return;
  var dot = document.getElementById('syncDot');
  try {
    var rows = Papa.parse(_pendingSyncCsv, { skipEmptyLines: false }).data;
    if (!rows || rows.length < 4) throw new Error('Too few rows');
    buildDashboard(rows, _syncLabel, null, true, true); // silent=true preserves scroll & tab
    if (_syncHashOrder.indexOf(_pendingSyncHash) === -1) _syncHashOrder.push(_pendingSyncHash);
    _syncAppliedHash = _pendingSyncHash;
    _pendingSyncCsv = null;
    _pendingSyncHash = null;
    if (dot) dot.className = 'sync-dot';
  } catch (e) {
    console.warn('PowerSteel apply error:', e.message);
    if (dot) dot.className = 'sync-dot error';
  }
}

async function manualSync() {
  if (!_syncPubUrl) return;
  await _scanForSyncUpdate();
  _applyPendingSync();
  _syncSecsLeft = SYNC_INTERVAL_SEC;
  _updateCountdown();
}

// ─── DISCONNECT ───────────────────────────────────────────────
// Stops polling + clears live state, but does NOT navigate away.
function disconnectSyncSoft() {
  stopSyncLoop();
  _syncSheetId = null;
  _syncLabel   = null;
  _syncPubUrl  = null;
  _syncRequestSeq = 0;
  _syncInFlight = false;
  _syncAppliedHash = null;
  _syncHashOrder = [];
  _pendingSyncCsv = null;
  _pendingSyncHash = null;

  var indicator = document.getElementById('syncIndicator');
  if (indicator) indicator.classList.remove('active');
  var dot = document.getElementById('syncDot');
  if (dot) dot.className = 'sync-dot';
  _syncSecsLeft = 0;
  _updateCountdown();
}

function disconnectSync() {
  stopSyncLoop();
  _syncSheetId = null;
  _syncLabel   = null;
  _syncPubUrl  = null;
  _syncRequestSeq = 0;
  _syncInFlight = false;
  _syncAppliedHash = null;
  _syncHashOrder = [];
  _pendingSyncCsv = null;
  _pendingSyncHash = null;
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
  _syncRequestSeq = 0;
  _syncInFlight = false;
  _syncAppliedHash = null;
  _syncHashOrder = [];
  _pendingSyncCsv = null;
  _pendingSyncHash = null;
  resetConnectBtn();
  var urlInput = document.getElementById('gsheetUrlInput');
  if (urlInput) urlInput.value = '';
  _origBackToLanding();
};
