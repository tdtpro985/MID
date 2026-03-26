/* ═══════════════════════════════════════════════════════════
   POWERSTEEL – dashboard.js
   Core logic: dark/light mode, parallax, floating bars,
   drag-and-drop upload, CSV parsing, multi-month support,
   buildDashboard, source cards, rep table, navigation
   ═══════════════════════════════════════════════════════════ */

// ─── DARK / LIGHT MODE TOGGLE ─────────────────────────────────
let isLight = false;

function toggleMode() {
  isLight = !isLight;
  document.body.classList.toggle('light-mode', isLight);
  const icon  = isLight ? '☀️' : '🌙';
  const label = isLight ? 'Dark' : 'Light';
  document.getElementById('toggleIcon').textContent        = icon;
  document.getElementById('toggleLabel').textContent       = label;
  document.getElementById('toggleIconInline').textContent  = icon;
  document.getElementById('toggleLabelInline').textContent = label;
  const textColor = isLight ? '#1a1917' : '#fafafa';
  const gridColor = isLight ? 'rgba(90,88,86,0.15)' : 'rgba(113,112,116,0.15)';
  const tickColor = isLight ? '#5a5856' : '#a6a6a8';
  refreshChartColors(charts, tickColor, gridColor);
  if (window._pvData && window._pvData.sources && window._pvData.sources.length) {
    buildDonutChart(window._pvData.sources);
  }
}

function setDashboardMode(active) {
  document.getElementById('modeToggle').style.display = active ? 'none' : 'flex';
}

// ─── PARALLAX ─────────────────────────────────────────────────
let _parallaxMouse = { x: 0, y: 0 };
let _parallaxScroll = 0;

function _applyParallax() {
  const el = document.getElementById('parallaxBg');
  if (!el) return;
  el.style.transform = `translate(${_parallaxMouse.x}px, ${_parallaxMouse.y + _parallaxScroll}px)`;
}

document.addEventListener('mousemove', e => {
  _parallaxMouse.x = (e.clientX / window.innerWidth  - 0.5) * 30;
  _parallaxMouse.y = (e.clientY / window.innerHeight - 0.5) * 20;
  _applyParallax();
});

window.addEventListener('scroll', () => {
  _parallaxScroll = window.scrollY * 0.4;
  _applyParallax();
});

// ─── FLOATING BARS ────────────────────────────────────────────
const container = document.getElementById('floatingBars');
for (let i = 0; i < 14; i++) {
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.style.cssText = `
    width: ${2 + Math.random() * 4}px;
    height: ${40 + Math.random() * 100}px;
    left: ${Math.random() * 100}%;
    animation-duration: ${8 + Math.random() * 12}s;
    animation-delay: ${-Math.random() * 15}s;
  `;
  container.appendChild(bar);
}

// ─── ERROR TOAST ──────────────────────────────────────────────
let errorTimer = null;

function showError(title, msg) {
  const toast = document.getElementById('errorToast');
  document.getElementById('errorToastTitle').textContent = title;
  document.getElementById('errorToastMsg').textContent   = msg;
  toast.classList.add('show');
  const zone = document.getElementById('uploadZone');
  if (zone) { zone.classList.add('error'); setTimeout(() => zone.classList.remove('error'), 500); }
  clearTimeout(errorTimer);
  errorTimer = setTimeout(hideError, 5000);
}

function hideError() {
  document.getElementById('errorToast').classList.remove('show');
  clearTimeout(errorTimer);
}

// ─── FILE VALIDATION ──────────────────────────────────────────
const MAX_FILE_SIZE_MB = 10;

function validateFile(file) {
  if (!file) { showError('No File Selected', 'Please select a file to upload.'); return false; }
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'csv') { showError('Wrong File Type', `"${file.name}" is not a CSV file.`); return false; }
  const allowedMime = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'];
  if (file.type && !allowedMime.includes(file.type)) { showError('Invalid File Type', `Detected type "${file.type}" is not accepted.`); return false; }
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) { showError('File Too Large', `"${file.name}" is ${sizeMB.toFixed(1)} MB. Max is ${MAX_FILE_SIZE_MB} MB.`); return false; }
  if (file.size === 0) { showError('Empty File', `"${file.name}" is empty.`); return false; }
  return true;
}

// ─── DRAG & DROP UPLOAD ───────────────────────────────────────
const zone = document.getElementById('uploadZone');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
zone.addEventListener('drop', e => {
  e.preventDefault();
  zone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (validateFile(file)) processFile(file);
});

document.getElementById('fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) {
    if (validateFile(file)) { processFile(file); }
    else { e.target.value = ''; }
  }
});

// ─── UPLOAD HISTORY ───────────────────────────────────────────
const HISTORY_KEY = 'powersteel_upload_history';
const MAX_HISTORY = 8;

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveHistory(history) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
  catch (e) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, Math.max(1, history.length - 1)))); }
    catch (e2) { console.warn('PowerSteel: localStorage quota exceeded.'); }
  }
}

function addToHistory(fileName, parsedData) {
  const history = getHistory();
  const filtered = history.filter(h => h.fileName !== fileName);
  filtered.unshift({ fileName, timestamp: Date.now(), data: parsedData });
  saveHistory(filtered.slice(0, MAX_HISTORY));
  renderHistory();
}

function clearAllHistory() { localStorage.removeItem(HISTORY_KEY); renderHistory(); }

function clearHistoryItem(fileName) {
  saveHistory(getHistory().filter(h => h.fileName !== fileName));
  renderHistory();
}

function loadHistoryItem(fileName) {
  const item = getHistory().find(h => h.fileName === fileName);
  if (!item) return;
  if (drawerOpen) {
    drawerOpen = false;
    document.getElementById('historyDrawerBody')?.classList.remove('open');
    document.getElementById('historyDrawerChevron')?.classList.remove('flipped');
    document.getElementById('historyDrawer')?.classList.remove('drawer-open');
  }
  document.getElementById('loadingOverlay').classList.add('show');
  setTimeout(() => { buildDashboard(item.data, item.fileName); }, 200);
}

function formatTimestamp(ts) {
  const d = new Date(ts), now = new Date();
  const diffMins = Math.floor((now - d) / 60000);
  const diffHrs  = Math.floor((now - d) / 3600000);
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffMins < 1)  return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs  < 24) return `${diffHrs}h ago`;
  if (diffDays < 7)  return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderHistory() {
  const history = getHistory();
  const triggerBtn   = document.getElementById('historyTriggerBtn');
  const triggerCount = document.getElementById('historyTriggerCount');
  const landingList  = document.getElementById('uploadHistoryListLanding');
  const drawerCount  = document.getElementById('historyDrawerCount');
  const drawerList   = document.getElementById('uploadHistoryListDash');
  const drawerEmpty  = document.getElementById('uploadHistoryDashEmpty');
  const drawerEl     = document.getElementById('historyDrawer');

  const makeItems = (context) => history.map(item => `
    <div class="upload-history-item" onclick="${context === 'modal' ? 'loadHistoryItemFromModal' : 'loadHistoryItem'}('${item.fileName.replace(/'/g, "\\'")}')">
      <div class="upload-history-icon">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
      </div>
      <div class="upload-history-info">
        <div class="upload-history-name" title="${item.fileName}">${item.fileName}</div>
        <div class="upload-history-time">${formatTimestamp(item.timestamp)}</div>
      </div>
      <button class="upload-history-del" title="Remove" onclick="event.stopPropagation();clearHistoryItem('${item.fileName.replace(/'/g, "\\'")}')">
        <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </div>
  `).join('');

  if (triggerBtn) {
    triggerBtn.style.display = history.length ? 'flex' : 'none';
    if (triggerCount) triggerCount.textContent = history.length;
  }
  if (landingList) landingList.innerHTML = history.length ? makeItems('modal') : '<div class="upload-history-empty">No previous uploads yet.</div>';
  if (drawerEl) drawerEl.style.display = 'flex';
  if (drawerCount) drawerCount.textContent = history.length;
  if (drawerList)  drawerList.innerHTML = history.length ? makeItems('drawer') : '';
  if (drawerEmpty) drawerEmpty.style.display = history.length ? 'none' : 'block';
}

function openHistoryModal() {
  document.getElementById('historyModal').classList.add('open');
  document.getElementById('historyModalBackdrop').classList.add('open');
}
function closeHistoryModal() {
  document.getElementById('historyModal').classList.remove('open');
  document.getElementById('historyModalBackdrop').classList.remove('open');
}
function loadHistoryItemFromModal(fileName) { closeHistoryModal(); loadHistoryItem(fileName); }

let drawerOpen = false;
function toggleHistoryDrawer() {
  drawerOpen = !drawerOpen;
  document.getElementById('historyDrawerBody').classList.toggle('open', drawerOpen);
  document.getElementById('historyDrawerChevron').classList.toggle('flipped', drawerOpen);
  document.getElementById('historyDrawer').classList.toggle('drawer-open', drawerOpen);
}

// ─── CSV PROCESSING ───────────────────────────────────────────
let charts = {};

function processFile(file) {
  document.getElementById('loadingOverlay').classList.add('show');
  const lt = document.getElementById('loadingText');
  if (lt) lt.textContent = 'Processing Data…';
  setTimeout(() => {
    Papa.parse(file, {
      complete: results => {
        try {
          const rows = results.data;
          if (!rows || rows.length < 4) {
            document.getElementById('loadingOverlay').classList.remove('show');
            showError('Empty or Invalid CSV', 'The file has too few rows.');
            return;
          }
          const nonEmpty = rows.filter(r => r.some(c => c && c.toString().trim() !== ''));
          if (nonEmpty.length < 4) {
            document.getElementById('loadingOverlay').classList.remove('show');
            showError('Empty CSV', 'The CSV file appears to have no usable data.');
            return;
          }
          buildDashboard(rows, file.name, results.data);
        } catch (err) {
          document.getElementById('loadingOverlay').classList.remove('show');
          showError('Parse Error', 'Could not read the CSV. Make sure it\'s not corrupted.');
          console.error('CSV parse error:', err);
        }
      },
      error: (err) => {
        document.getElementById('loadingOverlay').classList.remove('show');
        showError('Read Error', 'Failed to read the file. Please try again.');
      },
      skipEmptyLines: false
    });
  }, 100);
}

// ─── MARKETING LEADS VALIDATION ───────────────────────────────
function isMarketingLeadsCSV(rows) {
  if (!rows || rows.length < 4) return false;
  const headerFlat = rows.slice(0, 6).map(r => r.join(' ').toUpperCase()).join(' ');
  const hasMarketingTerms = (
    (headerFlat.includes('SALES REP') || headerFlat.includes('SALES REPRESENTATIVE')) &&
    (headerFlat.includes('SOURCE') || headerFlat.includes('LEAD SOURCE')) &&
    (headerFlat.includes('CONVERTED') || headerFlat.includes('GROSS SALES') || headerFlat.includes('TARGET'))
  );
  const allFlat = rows.slice(0, 10).map(r => r.join(' ').toUpperCase()).join(' ');
  const isForeignFormat = (
    allFlat.includes('PRESENT ON SITE') || allFlat.includes('ABSENT') ||
    allFlat.includes('INVOICE') || allFlat.includes('PURCHASE ORDER') ||
    allFlat.includes('PAYROLL') || allFlat.includes('EMPLOYEE ID') ||
    allFlat.includes('SKU') || allFlat.includes('PRODUCT CODE')
  );
  let numericCountRows = 0;
  for (let i = 3; i < Math.min(rows.length, 15); i++) {
    const r = rows[i];
    const name  = r[1] ? r[1].trim() : '';
    const count = r[2] ? r[2].trim() : '';
    if (name && name !== 'Grand Total' && /^\d+$/.test(count)) numericCountRows++;
  }
  return hasMarketingTerms && !isForeignFormat && numericCountRows >= 1;
}

// ─── MULTI-MONTH PARSER ────────────────────────────────────────

const MONTH_NAMES = ['january','february','march','april','may','june',
                     'july','august','september','october','november','december'];
const MONTH_ABBR  = ['jan','feb','mar','apr','may','jun',
                     'jul','aug','sep','oct','nov','dec'];

/**
 * Tries to parse a cell value as a month-block header in ANY of these formats:
 *
 *   Text + year  : "January 2026"  "Jan 2026"  "jan-2026"
 *   M/YYYY       : "1/2026"  "01/2026"
 *   M-YYYY       : "1-2026"  "01-2026"
 *   M/YY         : "1/26"   "01/26"
 *   M-YY         : "1-26"   "01-26"
 *   Full dates (auto-detect M/D vs D/M):
 *     M/D/YYYY or D/M/YYYY  e.g. "1/15/2026" vs "15/1/2026"
 *     M-D-YYYY or D-M-YYYY  e.g. "1-15-2026" vs "15-1-2026"
 *     YYYY-M-D or YYYY-D-M  (ISO-ish)
 *     DD.MM.YYYY or MM.DD.YYYY
 *
 * Ambiguous two-number dates (e.g. "1/5/2026") are resolved by:
 *   - if one part > 12  → that part must be the day
 *   - if both ≤ 12      → prefer M/D/YYYY (month-first) as default,
 *                         but also accepts D/M/YYYY when a prior block
 *                         already established a day-first pattern
 *
 * Returns { monthName, monthIndex (0-based), year (4-digit string), label }
 * or null if the cell is not a month header.
 */
function parseMonthHeader(raw, _hintDayFirst) {
  const s = (raw || '').trim();
  if (!s) return null;

  // ── 1. Named month: "January 2026" / "Jan 2026" / "jan-2026" ──
  const namedFull  = s.match(/^([A-Za-z]{3,9})[\s\-\/,]+(\d{2,4})$/);
  if (namedFull) {
    const mRaw = namedFull[1].toLowerCase();
    let   yr   = namedFull[2];
    const idx  = MONTH_NAMES.findIndex(m => m.startsWith(mRaw)) !== -1
                   ? MONTH_NAMES.findIndex(m => m.startsWith(mRaw))
                   : MONTH_ABBR.indexOf(mRaw.slice(0, 3));
    if (idx === -1) return null;
    if (yr.length === 2) yr = (parseInt(yr) >= 50 ? '19' : '20') + yr;
    if (yr.length !== 4) return null;
    const label = MONTH_NAMES[idx].charAt(0).toUpperCase() + MONTH_NAMES[idx].slice(1) + ' ' + yr;
    return { monthName: MONTH_NAMES[idx], monthIndex: idx, year: yr, label };
  }

  // ── 2. YYYY-MM or YYYY/MM (ISO partial) ───────────────────────
  const isoPartial = s.match(/^(\d{4})[\-\/](\d{1,2})$/);
  if (isoPartial) {
    const yr = isoPartial[1];
    const m  = parseInt(isoPartial[2], 10);
    if (m < 1 || m > 12) return null;
    const idx = m - 1;
    const label = MONTH_NAMES[idx].charAt(0).toUpperCase() + MONTH_NAMES[idx].slice(1) + ' ' + yr;
    return { monthName: MONTH_NAMES[idx], monthIndex: idx, year: yr, label };
  }

  // ── 3. M/YYYY or M-YYYY or M/YY or M-YY ──────────────────────
  const mYear = s.match(/^(\d{1,2})[\-\/](\d{2,4})$/);
  if (mYear) {
    const a = parseInt(mYear[1], 10);
    let   yr = mYear[2];
    if (yr.length === 2) yr = (parseInt(yr) >= 50 ? '19' : '20') + yr;
    // Only treat as month-only if first part is 1-12
    if (a >= 1 && a <= 12 && yr.length === 4) {
      const idx = a - 1;
      const label = MONTH_NAMES[idx].charAt(0).toUpperCase() + MONTH_NAMES[idx].slice(1) + ' ' + yr;
      return { monthName: MONTH_NAMES[idx], monthIndex: idx, year: yr, label };
    }
  }

  // ── 4. Full date: two separators → extract month + year ───────
  // Matches: M/D/YYYY  D/M/YYYY  YYYY/M/D  DD.MM.YYYY  etc.
  const sep = s.match(/^(\d{1,4})([\-\/\.])(\d{1,2})\2(\d{2,4})$/) ||
              s.match(/^(\d{1,4})([\-\/\.])(\d{1,4})\2(\d{1,2})$/);
  if (sep) {
    let [, a,, b,, c] = [...s.match(/^(\d{1,4})([\-\/\.])(\d{1,4})\2(\d{1,4})$/) || []];
    if (!a) return null;
    a = parseInt(a, 10); b = parseInt(b, 10); c = parseInt(c, 10);

    let month, year;

    // ISO-ish: YYYY-MM-DD  (first part ≥ 100 → it's the year)
    if (a >= 100) {
      year  = String(a).length === 4 ? String(a) : null;
      month = (b >= 1 && b <= 12) ? b : null;
    }
    // Last part is 4-digit year
    else if (c >= 100) {
      year = String(c).length === 2 ? (c >= 50 ? '19' + c : '20' + c) : String(c);
      // Disambiguate a vs b as month/day
      if (a > 12 && b <= 12)       month = b;  // a is day → b is month
      else if (b > 12 && a <= 12)  month = a;  // b is day → a is month
      else if (_hintDayFirst)       month = b;  // established day-first pattern
      else                          month = a;  // default: month-first
    }
    // Two-digit year at end (rare): e.g. 1/15/26
    else {
      year  = (c >= 50 ? '19' : '20') + String(c).padStart(2, '0');
      if (a > 12 && b <= 12)       month = b;
      else if (b > 12 && a <= 12)  month = a;
      else if (_hintDayFirst)       month = b;
      else                          month = a;
    }

    if (!month || !year || month < 1 || month > 12 || year.length !== 4) return null;
    const idx = month - 1;
    const label = MONTH_NAMES[idx].charAt(0).toUpperCase() + MONTH_NAMES[idx].slice(1) + ' ' + year;
    return { monthName: MONTH_NAMES[idx], monthIndex: idx, year, label };
  }

  return null;
}

/**
 * Heuristically detects whether a CSV uses day-first dates (DD/MM/…)
 * by scanning for unambiguous dates where the first part > 12.
 * Returns true if day-first evidence is found, false otherwise.
 */
function detectDayFirstFormat(rows) {
  for (const row of rows) {
    const s = (row[0] || '').trim();
    const m = s.match(/^(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})$/);
    if (m) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (a > 12) return true;   // unambiguous: day is first
      if (b > 12) return false;  // unambiguous: month is first
    }
  }
  return false; // default to month-first
}

/**
 * Splits a flat CSV rows array into an array of month-blocks.
 * Each block = { label, month, year, rows[] }.
 *
 * Detection: any row whose col[0] can be parsed as a month/year
 * in ANY common format (named, numeric M/YYYY, full date M/D/YYYY
 * or D/M/YYYY, ISO, dot-separated, etc.) starts a new block.
 */
function parseMonthBlocks(rows) {
  const dayFirst = detectDayFirstFormat(rows);
  const blocks   = [];
  let currentBlock = null;

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const col0   = (row[0] || '').trim();
    const parsed = parseMonthHeader(col0, dayFirst);

    if (parsed) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        label: parsed.label,
        month: parsed.monthName,
        year:  parsed.year,
        rows:  [row]
      };
      continue;
    }

    if (currentBlock) currentBlock.rows.push(row);
  }

  if (currentBlock) blocks.push(currentBlock);
  return blocks;
}

/**
 * Extracts structured data from a single month block's rows.
 * Returns { label, month, year, reps[], sources[], cvtSources[],
 *           actualLeads, targetLeads, pct, totalConverted, totalGS, totalGK, totalFT }
 */
function extractMonthData(block) {
  const rows = block.rows;

  // ── Reps (col 1 = name, col 2 = count) ─────────────────────
  const repMap = new Map();
  for (let i = 0; i < rows.length; i++) {
    const name  = (rows[i][1] || '').trim();
    const count = parseInt((rows[i][2] || '').replace(/,/g, ''));
    if (name && name !== 'Grand Total' && !isNaN(count) && count > 0) {
      repMap.set(name, (repMap.get(name) || 0) + count);
    }
  }
  const reps = Array.from(repMap, ([name, count]) => ({ name, count }));

  // ── Lead Sources (col 3 = source name, col 4 = count) ───────
  const sources = [];
  for (let i = 0; i < rows.length; i++) {
    const src = (rows[i][3] || '').trim();
    const cnt = parseInt((rows[i][4] || '').replace(/,/g, ''));
    if (src && src !== 'Grand Total' && src !== 'Source' &&
        !MONTH_NAMES.includes(src.toLowerCase()) &&
        src !== 'COUNTA of Source' &&
        !isNaN(cnt) && cnt > 0) {
      sources.push({ name: src, count: cnt });
    }
  }

  // ── Converted Sources (col 8=src, col 11=GK, col 12=GS) ─────
  const cvtSources = [];
  for (let i = 0; i < rows.length; i++) {
    const src  = (rows[i][8]  || '').trim();
    const gk   = parseFloat((rows[i][11] || '0').replace(/[₱,]/g, '')) || 0;
    const gs   = parseFloat((rows[i][12] || '0').replace(/[₱,]/g, '')) || 0;
    if (src && src !== 'Grand Total' && src !== 'Source' && gk + gs > 0) {
      cvtSources.push({ name: src, gk, gs });
    }
  }

  // ── Summary row = first row of the block (row[0]) ───────────
  // Col indices: [5]=Actual, [6]=Target, [7]=Pct, [10]=TotalCvtd,
  //              [13]=TotalFT, [14]=TotalGK, [15]=TotalGS, [16]=OverallGS
  const sr = rows[0];
  const actualLeads    = parseInt((sr[5]  || '0').replace(/,/g, '')) || sources.reduce((s,r)=>s+r.count,0);
  const targetLeads    = parseInt((sr[6]  || '0').replace(/,/g, '')) || 0;
  const pctRaw         = parseFloat((sr[7]  || '0').replace('%','')) || 0;
  const pct            = isNaN(pctRaw) ? 0 : pctRaw;
  const totalConverted = parseInt((sr[10] || '0').replace(/,/g, '')) || 0;
  const totalFT        = parseInt((sr[13] || '0').replace(/,/g, '')) || 0;
  const totalGK        = parseFloat((sr[14] || '0').replace(/[₱,]/g, '')) || 0;
  const totalGS        = parseFloat((sr[15] || '0').replace(/[₱,]/g, '')) || 0;

  return {
    label: block.label,
    month: block.month,
    year:  block.year,
    reps, sources, cvtSources,
    actualLeads, targetLeads, pct,
    totalConverted, totalFT, totalGK, totalGS
  };
}

/**
 * Combines an array of monthData objects into a single aggregated object
 * for the "All Months" combined view.
 */
function combineMonthData(monthDataArr) {
  const repMap = new Map();
  const srcMap = new Map();
  const cvtMap = new Map();

  let actualLeads = 0, targetLeads = 0, totalConverted = 0;
  let totalGK = 0, totalGS = 0, totalFT = 0;

  for (const md of monthDataArr) {
    actualLeads    += md.actualLeads;
    targetLeads    += md.targetLeads;
    totalConverted += md.totalConverted;
    totalFT        += md.totalFT;
    totalGK        += md.totalGK;
    totalGS        += md.totalGS;

    for (const r of md.reps) {
      repMap.set(r.name, (repMap.get(r.name) || 0) + r.count);
    }
    for (const s of md.sources) {
      srcMap.set(s.name, (srcMap.get(s.name) || 0) + s.count);
    }
    for (const c of md.cvtSources) {
      const existing = cvtMap.get(c.name) || { name: c.name, gk: 0, gs: 0 };
      cvtMap.set(c.name, { name: c.name, gk: existing.gk + c.gk, gs: existing.gs + c.gs });
    }
  }

  const pct = targetLeads > 0 ? (actualLeads / targetLeads) * 100 : 0;
  const labels = monthDataArr.map(m => m.label);
  const label  = labels.length > 1
    ? `${monthDataArr[0].label} – ${monthDataArr[monthDataArr.length-1].label}`
    : (labels[0] || 'All Months');

  return {
    label,
    month: 'combined',
    year:  monthDataArr[0]?.year || '',
    reps:        Array.from(repMap, ([name, count]) => ({ name, count })),
    sources:     Array.from(srcMap, ([name, count]) => ({ name, count })),
    cvtSources:  Array.from(cvtMap.values()),
    actualLeads, targetLeads, pct,
    totalConverted, totalFT, totalGK, totalGS
  };
}

// ─── SMART CURRENCY FORMAT ────────────────────────────────────
function fmtPeso(val) {
  if (val === 0) return '—';
  if (Math.abs(val) >= 1000000) return '₱' + (val / 1000000).toFixed(2) + 'M';
  if (Math.abs(val) >= 1000)    return '₱' + (val / 1000).toFixed(1) + 'K';
  return '₱' + val.toLocaleString();
}

// ─── MONTH SELECTOR STATE ─────────────────────────────────────
// Holds all parsed month data for the currently loaded file
window._allMonthData  = [];   // array of monthData objects
window._activeMonthIdx = -1;  // -1 = combined view

// ─── MONTH SELECTOR UI ────────────────────────────────────────
function renderMonthSelector(monthDataArr, activeIdx) {
  let sel = document.getElementById('monthSelectorWrap');
  if (!sel) {
    sel = document.createElement('div');
    sel.id = 'monthSelectorWrap';
    sel.style.cssText = 'display:flex;align-items:center;gap:0.5rem;flex-shrink:0;';
    const headerControls = document.querySelector('.dash-header > div:last-child');
    if (headerControls) headerControls.insertBefore(sel, headerControls.firstChild);
  }

  if (monthDataArr.length <= 1) {
    sel.style.display = 'none';
    return;
  }

  sel.style.display = 'flex';
  sel.innerHTML = `
    <label class="month-selector-label" style="font-family:'Montserrat',sans-serif;font-size:0.62rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-muted);white-space:nowrap;">
      Period
    </label>
    <select id="monthSelector" class="month-selector-select" onchange="onMonthSelect(this.value)"
      style="background:var(--bg-card);border:1px solid var(--border-orange);
             color:var(--text-primary);font-family:'Montserrat',sans-serif;
             font-size:0.7rem;font-weight:600;letter-spacing:0.05em;
             padding:0.4rem 0.7rem;border-radius:8px;cursor:pointer;
             outline:none;transition:border-color 0.2s;
             appearance:none;-webkit-appearance:none;
             background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23e67026' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\");
             background-repeat:no-repeat;background-position:right 0.6rem center;
             padding-right:1.8rem;max-width:180px;">
      <option value="-1" ${activeIdx === -1 ? 'selected' : ''}>All Months (Combined)</option>
      ${monthDataArr.map((md, i) => `
        <option value="${i}" ${activeIdx === i ? 'selected' : ''}>${md.label}</option>
      `).join('')}
    </select>
  `;
}

function onMonthSelect(value) {
  const idx = parseInt(value);
  window._activeMonthIdx = idx;
  const md = idx === -1
    ? combineMonthData(window._allMonthData)
    : window._allMonthData[idx];
  renderDashboardForData(md, window._activeFileName, window._allMonthData);
}

// ─── BUILD DASHBOARD (entry point) ────────────────────────────
function buildDashboard(rows, fileName, rawRows, isLiveSync, silent) {
  if (!isMarketingLeadsCSV(rows)) {
    document.getElementById('loadingOverlay').classList.remove('show');
    showError(
      'Incompatible File',
      isLiveSync
        ? 'The connected Google Sheet does not appear to be a Marketing Leads report.'
        : 'This file does not appear to be a Marketing Leads report.'
    );
    return;
  }

  // Parse all month blocks from the CSV
  const blocks = parseMonthBlocks(rows);

  if (blocks.length === 0) {
    document.getElementById('loadingOverlay').classList.remove('show');
    showError('No Month Data Found', 'Could not detect any month blocks in this file.');
    return;
  }

  const monthDataArr = blocks.map(extractMonthData);

  // Store globally for selector switching
  window._allMonthData   = monthDataArr;
  window._activeFileName = fileName;

  // On live sync refresh, preserve the currently selected month tab.
  // Only reset to combined (-1) on the very first load (not a sync).
  if (!isLiveSync || window._activeMonthIdx === undefined) {
    window._activeMonthIdx = monthDataArr.length > 1 ? -1 : 0;
  } else {
    // Clamp in case the number of months changed
    if (window._activeMonthIdx >= monthDataArr.length) {
      window._activeMonthIdx = monthDataArr.length > 1 ? -1 : 0;
    }
  }

  // Pick view data based on preserved/initial selection
  const initialData = window._activeMonthIdx === -1
    ? combineMonthData(monthDataArr)
    : monthDataArr[window._activeMonthIdx];

  renderDashboardForData(initialData, fileName, monthDataArr, isLiveSync, silent);

  // Save to history
  if (rawRows && !isLiveSync) addToHistory(fileName, rawRows);
  renderHistory();
}

// ─── RENDER DASHBOARD FOR A SPECIFIC monthData ────────────────
function renderDashboardForData(md, fileName, allMonthData, isLiveSync, silent) {
  const periodLabel = md.label;
  const periodShort = md.label.length > 15 ? md.label.slice(0, 12) + '…' : md.label;

  // ── Stats Strip ───────────────────────────────────────────────
  const statsData = [
    { val: md.reps.reduce((s,r)=>s+r.count,0).toLocaleString(), lbl: 'Total Rep Entries' },
    { val: md.actualLeads.toLocaleString(), lbl: 'Leads Gathered' },
    { val: md.totalConverted.toLocaleString(), lbl: 'Converted' },
    { val: md.pct.toFixed(2) + '%', lbl: 'Target Rate' },
    { val: fmtPeso(md.totalGS), lbl: 'Gross Sales' },
    { val: md.reps.length.toString(), lbl: 'Active Reps' },
  ];
  const track = document.getElementById('statsTrack');
  const allItems = [...statsData, ...statsData];
  track.innerHTML = allItems.map(s =>
    `<div class="stat-item"><span class="val">${s.val}</span><span class="lbl">${s.lbl}</span></div>`
  ).join('');
  document.getElementById('statsStrip').style.display = 'block';

  // ── File / Period Info ────────────────────────────────────────
  const liveTag = isLiveSync ? ' 🟢' : '';
  document.getElementById('fileName').textContent    = fileName + liveTag;
  document.getElementById('fileDetails').textContent =
    `${md.reps.length} sales reps · ${md.sources.length} lead sources · ${periodLabel}`;
  document.getElementById('dashMeta').textContent    = `Marketing Leads Report · ${periodLabel}`;
  const tagPeriod = document.getElementById('tagPeriod');
  if (tagPeriod) tagPeriod.textContent = periodShort;

  // ── Month Selector ────────────────────────────────────────────
  renderMonthSelector(allMonthData || window._allMonthData, window._activeMonthIdx);

  // ── KPI Cards ─────────────────────────────────────────────────
  const kpis = [
    { label: 'Leads Gathered',     value: md.actualLeads.toLocaleString(),    sub: `Target: ${md.targetLeads.toLocaleString()}`,  orange: true },
    { label: 'Target Achievement', value: md.pct.toFixed(2) + '%',            sub: 'Actual / Target',                             orange: true },
    { label: 'Leads Converted',    value: md.totalConverted.toLocaleString(), sub: 'Successful conversions' },
    { label: 'Total Gross Sales',  value: fmtPeso(md.totalGS),                sub: periodLabel },
    { label: 'GK Value',           value: fmtPeso(md.totalGK),                sub: 'Gross Kumpirmasyon' },
    { label: 'Active Reps',        value: md.reps.length.toString(),          sub: 'Sales representatives' },
  ];

  const kpiGrid = document.getElementById('kpiGrid');
  kpiGrid.innerHTML = '';
  kpis.forEach((k, i) => {
    const card = document.createElement('div');
    card.className = 'kpi-card';
    card.style.animationDelay = (i * 0.1) + 's';
    card.innerHTML = `
      <div class="accent-bar"></div>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value ${k.orange ? 'orange' : ''}">${k.value}</div>
      <div class="kpi-sub">${k.sub}</div>
    `;
    kpiGrid.appendChild(card);
  });

  // ── Store for Present View ────────────────────────────────────
  window._pvData = {
    kpis,
    sources:      md.sources,
    donutSources: md.sources.slice(),
    cvtSources:   md.cvtSources,
    reps:         md.reps,
    fileName,
    fileDetails:  `${md.reps.length} sales reps · ${md.sources.length} sources`
  };

  const gridColor = 'rgba(113,112,116,0.15)';
  const tickColor = isLight ? '#5a5856' : '#a6a6a8';
  const hasCharts = charts.sourceBar && charts.salesBar && charts.repBar;

  // ── Charts: update in-place on live sync, full rebuild otherwise ──
  if (isLiveSync && hasCharts) {
    // Update sourceBar in-place
    const shortLabels = md.sources.map(s =>
      s.name.replace('FACEBOOK PAGE','FB Page').replace('FACEBOOK GROUP','FB Group')
             .replace('GOOGLE/INTERNET','Google').replace('WEBSITE/LIVECHAT','Website')
    );
    charts.sourceBar.data.labels = shortLabels;
    charts.sourceBar.data.datasets[0].data = md.sources.map(s => s.count);
    charts.sourceBar.data.datasets[0].backgroundColor = md.sources.map((_, i) =>
      i === 0 ? '#e67026' : `rgba(230,112,38,${Math.max(0.3, 0.9 - i * 0.04)})`
    );
    charts.sourceBar.update('none');

    // Update salesBar in-place
    const validCvt = md.cvtSources.filter(s => s.gs > 0).sort((a,b) => b.gs - a.gs);
    charts.salesBar.data.labels = validCvt.map(s => s.name);
    charts.salesBar.data.datasets[0].data = validCvt.map(s => s.gs);
    charts.salesBar.data.datasets[1].data = validCvt.map(s => s.gk);
    charts.salesBar.update('none');

    // Update repBar in-place
    const sortedRepsChart = [...md.reps].sort((a,b) => b.count - a.count);
    charts.repBar.data.labels = sortedRepsChart.map(r => r.name);
    charts.repBar.data.datasets[0].data = sortedRepsChart.map(r => r.count);
    charts.repBar.data.datasets[0].backgroundColor = sortedRepsChart.map((_, i) =>
      i < Math.max(1, Math.ceil(sortedRepsChart.length * 0.2)) ? '#e67026' : 'rgba(113,112,116,0.5)'
    );
    charts.repBar.update('none');

    // Rebuild donut (SVG-based, fast)
    buildDonutChart(md.sources);
  } else {
    // Full rebuild on first load or manual tab switch
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
    Chart.defaults.color = tickColor;
    Chart.defaults.font  = { family: 'Montserrat', size: 11 };
    charts.sourceBar = buildSourceBar(md.sources, gridColor, tickColor);
    buildDonutChart(md.sources);
    charts.salesBar  = buildSalesBar(md.cvtSources, gridColor, tickColor);
    charts.repBar    = buildRepBar(md.reps, gridColor, tickColor);
  }

  // ── Source Cards ──────────────────────────────────────────────
  const maxCount = Math.max(...md.sources.map(s => s.count), 1);
  const srcGrid  = document.getElementById('sourceGrid');
  srcGrid.innerHTML = '';
  [...md.sources].sort((a,b) => b.count - a.count).forEach((s, i) => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.style.animationDelay = isLiveSync ? '0s' : (i * 0.05) + 's';
    const pctW = Math.round((s.count / maxCount) * 100);
    card.innerHTML = `
      <div class="src-name">${s.name}</div>
      <div class="src-val">${s.count}</div>
      <div class="src-bar"><div class="src-bar-fill" style="width:0%" data-width="${pctW}%"></div></div>
    `;
    srcGrid.appendChild(card);
  });
  requestAnimationFrame(() => {
    document.querySelectorAll('.src-bar-fill').forEach(el => { el.style.width = el.dataset.width; });
  });

  // ── Rep Table ─────────────────────────────────────────────────
  const tbody      = document.getElementById('repTableBody');
  const totalReps  = md.reps.reduce((s,r) => s + r.count, 0);
  const sortedReps = [...md.reps].sort((a,b) => b.count - a.count);
  tbody.innerHTML  = '';
  sortedReps.forEach((r, i) => {
    const contrib = ((r.count / totalReps) * 100).toFixed(1);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="rep">${r.name}</td>
      <td class="num">${r.count.toLocaleString()}</td>
      <td>
        <div style="display:flex;align-items:center;gap:0.6rem;">
          <div style="flex:1;height:4px;background:rgba(113,112,116,0.2);border-radius:2px;min-width:80px;">
            <div style="height:100%;width:${contrib}%;background:var(--orange);border-radius:2px;transition:width 1s ease;"></div>
          </div>
          <span style="color:var(--text-secondary);min-width:36px;">${contrib}%</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('tableCount').textContent = `${sortedReps.length} representatives`;
  const repTitle = document.getElementById('repTableTitle');
  if (repTitle) repTitle.textContent = `Sales Representatives — ${periodLabel}`;

  // ── Show dashboard ────────────────────────────────────────────
  document.getElementById('loadingOverlay').classList.remove('show');
  document.getElementById('landing').style.display = 'none';
  document.getElementById('statsStrip').style.display = 'block';
  document.getElementById('dashboard').classList.add('visible');
  setDashboardMode(true);
  if (!silent) window.scrollTo(0, 0);
}

// ─── BACK TO LANDING ──────────────────────────────────────────
function backToLanding() {
  document.getElementById('dashboard').classList.remove('visible');
  document.getElementById('landing').style.display = 'flex';
  document.getElementById('statsStrip').style.display = 'none';
  document.getElementById('statsTrack').innerHTML = '';
  document.getElementById('fileInput').value = '';
  // Remove month selector
  const sel = document.getElementById('monthSelectorWrap');
  if (sel) sel.remove();
  // Reset state
  window._allMonthData   = [];
  window._activeMonthIdx = -1;
  window._activeFileName = '';
  setDashboardMode(false);
  drawerOpen = false;
  document.getElementById('historyDrawerBody')?.classList.remove('open');
  document.getElementById('historyDrawerChevron')?.classList.remove('flipped');
  document.getElementById('historyDrawer')?.classList.remove('drawer-open');
  window.scrollTo(0, 0);
}

// ─── AUTO-CLOSE DRAWER ON SCROLL UP ──────────────────────────
let lastScrollY = 0;
window.addEventListener('scroll', () => {
  const currentY = window.scrollY;
  if (currentY < lastScrollY && drawerOpen) {
    drawerOpen = false;
    document.getElementById('historyDrawerBody')?.classList.remove('open');
    document.getElementById('historyDrawerChevron')?.classList.remove('flipped');
    document.getElementById('historyDrawer')?.classList.remove('drawer-open');
  }
  lastScrollY = currentY;
}, { passive: true });

// ─── INIT ─────────────────────────────────────────────────────
renderHistory();
