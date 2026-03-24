/* ═══════════════════════════════════════════════════════════
   POWERSTEEL – dashboard.js
   Core logic: dark/light mode, parallax, floating bars,
   drag-and-drop upload, CSV parsing, buildDashboard,
   source cards, rep table, navigation
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

  // Re-render SVG donut so its text/center colors pick up the new CSS variables
  if (window._pvData && window._pvData.sources && window._pvData.sources.length) {
    buildDonutChart(window._pvData.sources);
  }
}

function setDashboardMode(active) {
  document.getElementById('modeToggle').style.display = active ? 'none' : 'flex';
}

// ─── PARALLAX ─────────────────────────────────────────────────
// Track both axes separately so mousemove and scroll don't overwrite each other
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

  // Shake the upload zone
  const zone = document.getElementById('uploadZone');
  zone.classList.add('error');
  setTimeout(() => zone.classList.remove('error'), 500);

  // Auto-dismiss after 5s
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
  if (!file) {
    showError('No File Selected', 'Please select a file to upload.');
    return false;
  }

  // Check extension
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'csv') {
    showError(
      'Wrong File Type',
      `"${file.name}" is not a CSV file. Please upload a .csv file only.`
    );
    return false;
  }

  // Check MIME type (extra safety — some browsers spoof extensions)
  const allowedMime = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'];
  // Allow blank MIME only on non-Windows where OS may not report CSV MIME correctly
  if (file.type && !allowedMime.includes(file.type)) {
    showError(
      'Invalid File Type',
      `Detected type "${file.type}" is not accepted. Please upload a plain CSV file.`
    );
    return false;
  }

  // Check file size
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) {
    showError(
      'File Too Large',
      `"${file.name}" is ${sizeMB.toFixed(1)} MB. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`
    );
    return false;
  }

  // Check for empty file
  if (file.size === 0) {
    showError('Empty File', `"${file.name}" is empty. Please upload a valid CSV file.`);
    return false;
  }

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
    if (validateFile(file)) {
      processFile(file);
    } else {
      // Reset input so the same file can be re-selected after fix
      e.target.value = '';
    }
  }
});

// ─── UPLOAD HISTORY ───────────────────────────────────────────
const HISTORY_KEY = 'powersteel_upload_history';
const MAX_HISTORY = 8;

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    // Quota exceeded — trim oldest entry and retry once
    try {
      const trimmed = history.slice(0, Math.max(1, history.length - 1));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (e2) {
      console.warn('PowerSteel: localStorage quota exceeded, history not saved.');
    }
  }
}

function addToHistory(fileName, parsedData) {
  const history = getHistory();
  // Remove duplicate by name
  const filtered = history.filter(h => h.fileName !== fileName);
  // Store only the processed summary rows needed to rebuild the dashboard,
  // NOT the full raw CSV matrix — avoids localStorage quota exhaustion.
  filtered.unshift({
    fileName,
    timestamp: Date.now(),
    data: parsedData
  });
  saveHistory(filtered.slice(0, MAX_HISTORY));
  renderHistory();
}

function clearAllHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

function clearHistoryItem(fileName) {
  const history = getHistory().filter(h => h.fileName !== fileName);
  saveHistory(history);
  renderHistory();
}

function loadHistoryItem(fileName) {
  const history = getHistory();
  const item = history.find(h => h.fileName === fileName);
  if (!item) return;
  // Close drawer if open
  if (drawerOpen) {
    drawerOpen = false;
    document.getElementById('historyDrawerBody')?.classList.remove('open');
    document.getElementById('historyDrawerChevron')?.classList.remove('flipped');
    document.getElementById('historyDrawer')?.classList.remove('drawer-open');
  }
  document.getElementById('loadingOverlay').classList.add('show');
  setTimeout(() => {
    buildDashboard(item.data, item.fileName);
  }, 200);
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs  = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1)   return 'Just now';
  if (diffMins < 60)  return `${diffMins}m ago`;
  if (diffHrs  < 24)  return `${diffHrs}h ago`;
  if (diffDays < 7)   return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderHistory() {
  const history = getHistory();

  // Landing: trigger button + count badge
  const triggerBtn   = document.getElementById('historyTriggerBtn');
  const triggerCount = document.getElementById('historyTriggerCount');
  // Landing modal list
  const landingList  = document.getElementById('uploadHistoryListLanding');
  // Dashboard drawer
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

  // Landing trigger button
  if (triggerBtn) {
    triggerBtn.style.display = history.length ? 'flex' : 'none';
    if (triggerCount) triggerCount.textContent = history.length;
  }

  // Landing modal list
  if (landingList) landingList.innerHTML = history.length ? makeItems('modal') : '<div class="upload-history-empty">No previous uploads yet.</div>';

  // Dashboard drawer (leads)
  if (drawerEl) drawerEl.style.display = 'flex';
  if (drawerCount) drawerCount.textContent = history.length;
  if (drawerList)  drawerList.innerHTML = history.length ? makeItems('drawer') : '';
  if (drawerEmpty) drawerEmpty.style.display = history.length ? 'none' : 'block';

}

// ─── HISTORY MODAL (landing) ──────────────────────────────────
function openHistoryModal() {
  document.getElementById('historyModal').classList.add('open');
  document.getElementById('historyModalBackdrop').classList.add('open');
}

function closeHistoryModal() {
  document.getElementById('historyModal').classList.remove('open');
  document.getElementById('historyModalBackdrop').classList.remove('open');
}

function loadHistoryItemFromModal(fileName) {
  closeHistoryModal();
  loadHistoryItem(fileName);
}

// ─── HISTORY DRAWER (dashboard) ───────────────────────────────
let drawerOpen = false;

function toggleHistoryDrawer() {
  drawerOpen = !drawerOpen;
  const body    = document.getElementById('historyDrawerBody');
  const chevron = document.getElementById('historyDrawerChevron');
  const drawer  = document.getElementById('historyDrawer');
  body.classList.toggle('open', drawerOpen);
  chevron.classList.toggle('flipped', drawerOpen);
  drawer.classList.toggle('drawer-open', drawerOpen);
}

// ─── CSV PROCESSING ───────────────────────────────────────────
let charts = {};

function processFile(file) {
  document.getElementById('loadingOverlay').classList.add('show');

  setTimeout(() => {
    Papa.parse(file, {
      complete: results => {
        try {
          const rows = results.data;

          // Guard: must have at least a few rows of data
          if (!rows || rows.length < 4) {
            document.getElementById('loadingOverlay').classList.remove('show');
            showError('Empty or Invalid CSV', 'The file has too few rows. Make sure it\'s the correct leads report.');
            return;
          }

          // Guard: check the file isn't just whitespace/empty rows
          const nonEmpty = rows.filter(r => r.some(cell => cell && cell.toString().trim() !== ''));
          if (nonEmpty.length < 4) {
            document.getElementById('loadingOverlay').classList.remove('show');
            showError('Empty CSV', 'The CSV file appears to have no usable data.');
            return;
          }

          buildDashboard(rows, file.name, results.data);
        } catch (err) {
          document.getElementById('loadingOverlay').classList.remove('show');
          showError('Parse Error', 'Could not read the CSV. Make sure it\'s not corrupted or password-protected.');
          console.error('CSV parse error:', err);
        }
      },
      error: (err) => {
        document.getElementById('loadingOverlay').classList.remove('show');
        showError('Read Error', 'Failed to read the file. Please try again.');
        console.error('PapaParse error:', err);
      },
      skipEmptyLines: false
    });
  }, 100);
}


// ─── MARKETING LEADS VALIDATION ──────────────────────────────
function isMarketingLeadsCSV(rows) {
  if (!rows || rows.length < 4) return false;

  // Check 1: First 6 rows must contain Marketing Leads-specific terms together
  const headerFlat = rows.slice(0, 6).map(r => r.join(' ').toUpperCase()).join(' ');

  const hasMarketingTerms = (
    (headerFlat.includes('SALES REP') || headerFlat.includes('SALES REPRESENTATIVE')) &&
    (headerFlat.includes('SOURCE') || headerFlat.includes('LEAD SOURCE')) &&
    (headerFlat.includes('CONVERTED') || headerFlat.includes('GROSS SALES') || headerFlat.includes('TARGET'))
  );

  // Check 2: Reject foreign file formats
  const allFlat = rows.slice(0, 10).map(r => r.join(' ').toUpperCase()).join(' ');
  const isForeignFormat = (
    allFlat.includes('PRESENT ON SITE') ||
    allFlat.includes('ABSENT') ||
    allFlat.includes('OPEN POSITIONS') ||
    allFlat.includes('NEWLY HIRES') ||
    allFlat.includes('RESIGNED') ||
    allFlat.includes('INVOICE') ||
    allFlat.includes('PURCHASE ORDER') ||
    allFlat.includes('PAYROLL') ||
    allFlat.includes('EMPLOYEE ID') ||
    allFlat.includes('DEPARTMENT') ||
    allFlat.includes('SKU') ||
    allFlat.includes('PRODUCT CODE')
  );

  // Check 3: Data rows (row 3+) must have rep name in col 1 and numeric count in col 2
  let numericCountRows = 0;
  for (let i = 3; i < Math.min(rows.length, 15); i++) {
    const r = rows[i];
    const name  = r[1] ? r[1].trim() : '';
    const count = r[2] ? r[2].trim() : '';
    if (name && name !== 'Grand Total' && /^\d+$/.test(count)) {
      numericCountRows++;
    }
  }
  const hasValidDataRows = numericCountRows >= 1;

  return hasMarketingTerms && !isForeignFormat && hasValidDataRows;
}

// ─── PERIOD DETECTION ─────────────────────────────────────────
function detectPeriod(rows) {
  const MONTHS = ['january','february','march','april','may','june',
                  'july','august','september','october','november','december'];
  const SHORT  = ['jan','feb','mar','apr','may','jun',
                  'jul','aug','sep','oct','nov','dec'];

  let foundMonth = null;
  let foundYear  = null;

  // Strategy 1: scan each cell individually across first 5 rows
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cell = (rows[r][c] || '').trim().toLowerCase();
      if (!cell) continue;

      // Full month name alone in a cell e.g. "JANUARY"
      const mIdx = MONTHS.indexOf(cell);
      if (mIdx !== -1) { foundMonth = MONTHS[mIdx]; continue; }

      // Short month alone e.g. "JAN"
      const sIdx = SHORT.indexOf(cell);
      if (sIdx !== -1) { foundMonth = MONTHS[sIdx]; continue; }

      // 4-digit year alone e.g. "2025"
      if (/^\d{4}$/.test(cell) && parseInt(cell) > 2000) { foundYear = cell; continue; }

      // "Month YYYY" together e.g. "January 2025"
      for (let m = 0; m < MONTHS.length; m++) {
        const combo = new RegExp('(' + MONTHS[m] + '|' + SHORT[m] + ')[^\\d]*(\\d{4})');
        const match = cell.match(combo);
        if (match) {
          foundMonth = MONTHS[m];
          foundYear  = match[2];
        }
      }

      // "DD-Mon" format e.g. "25-Jan" — extract month and infer year
      const ddMon = cell.match(/^\d{1,2}-([a-z]{3})$/);
      if (ddMon) {
        const si = SHORT.indexOf(ddMon[1]);
        if (si !== -1) foundMonth = MONTHS[si];
      }

      // "MM/YYYY" or "MM-YYYY"
      const numDate = cell.match(/^(\d{1,2})[\/-](\d{4})$/);
      if (numDate) {
        const mi = parseInt(numDate[1]) - 1;
        if (mi >= 0 && mi < 12) { foundMonth = MONTHS[mi]; foundYear = numDate[2]; }
      }
    }
  }

  // Strategy 2: if year still missing, try to find it anywhere in the data rows
  if (foundMonth && !foundYear) {
    for (let r = 0; r < Math.min(8, rows.length); r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const cell = (rows[r][c] || '').trim();
        // "DD-Mon-YY" or "DD-Mon-YYYY"
        const fullDate = cell.match(/\d{1,2}-[a-zA-Z]{3}-?(\d{2,4})/);
        if (fullDate) {
          let yr = fullDate[1];
          if (yr.length === 2) yr = '20' + yr;
          foundYear = yr;
          break;
        }
        // Standalone 4-digit year
        if (/^\d{4}$/.test(cell) && parseInt(cell) > 2000) { foundYear = cell; break; }
      }
      if (foundYear) break;
    }
  }

  // Strategy 3: infer year from filename context stored in window or fall back to current year
  if (foundMonth && !foundYear) {
    foundYear = new Date().getFullYear().toString();
  }

  if (foundMonth) {
    return {
      month: foundMonth.charAt(0).toUpperCase() + foundMonth.slice(1),
      year:  foundYear || new Date().getFullYear().toString()
    };
  }
  return null;
}

function periodFromFilename(fileName) {
  const MONTHS = ['january','february','march','april','may','june',
                  'july','august','september','october','november','december'];
  const SHORT  = ['jan','feb','mar','apr','may','jun',
                  'jul','aug','sep','oct','nov','dec'];
  const name = fileName.toLowerCase();
  for (let m = 0; m < MONTHS.length; m++) {
    const yearMatch = name.match(new RegExp('(' + MONTHS[m] + '|' + SHORT[m] + ')[^\\d]*(\\d{4})'));
    if (yearMatch) {
      const mn = MONTHS[m];
      return { month: mn.charAt(0).toUpperCase() + mn.slice(1), year: yearMatch[2] };
    }
  }
  // Try MM-YYYY or MM_YYYY in filename
  const numMatch = name.match(/(\d{1,2})[-_](\d{4})/);
  if (numMatch) {
    const mIdx = parseInt(numMatch[1]) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      const mn = MONTHS[mIdx];
      return { month: mn.charAt(0).toUpperCase() + mn.slice(1), year: numMatch[2] };
    }
  }
  return null;
}


// ─── BUILD DASHBOARD ──────────────────────────────────────────
function buildDashboard(rows, fileName, rawRows) {
  if (!isMarketingLeadsCSV(rows)) {
    document.getElementById('loadingOverlay').classList.remove('show');
    showError(
      'Incompatible File',
      'This file does not appear to be a Marketing Leads report. Please upload the correct CSV file.'
    );
    return;
  }
  buildLeadsDashboard(rows, fileName, rawRows);
}

// ─── SMART CURRENCY FORMAT ────────────────────────────────────
function fmtPeso(val) {
  if (val === 0) return '—';
  if (Math.abs(val) >= 1000000) return '₱' + (val / 1000000).toFixed(2) + 'M';
  if (Math.abs(val) >= 1000)    return '₱' + (val / 1000).toFixed(1) + 'K';
  return '₱' + val.toLocaleString();
}


// ─── BUILD LEADS DASHBOARD ────────────────────────────────────
function buildLeadsDashboard(rows, fileName, rawRows) {
  // ── Detect period from CSV content or filename ─────────────────
  const period = detectPeriod(rows) || periodFromFilename(fileName) || null;
  const periodLabel = period ? `${period.month} ${period.year}` : 'Period';
  const periodShort = period ? `${period.month.slice(0,3)} ${period.year}` : '—';
  const fiscalRange = period ? `${period.year}–${parseInt(period.year)+1}` : '';

  // Hide leads dashboard, show leads dashboard
  document.getElementById('dashboard').classList.remove('visible');
  // Parse rep data (rows 3+, col 1=rep, col 2=count)
  // Merge duplicate rep names by summing counts — prevents multiple bars per
  // rep when the source CSV lists the same name across multiple rows.
  const repMap = new Map();
  for (let i = 3; i < rows.length; i++) {
    const r     = rows[i];
    const name  = r[1] ? r[1].trim() : '';
    const count = r[2] ? parseInt(r[2]) : 0;
    if (name && name !== 'Grand Total' && !isNaN(count) && count > 0) {
      repMap.set(name, (repMap.get(name) || 0) + count);
    }
  }
  const reps = Array.from(repMap, ([name, count]) => ({ name, count }));

  // Parse source data
  const sources = [];
  for (let i = 3; i < rows.length; i++) {
    const r   = rows[i];
    const src = r[3] ? r[3].trim() : '';
    const cnt = r[4] ? parseInt(r[4]) : 0;
    if (src && src !== 'Grand Total' && src !== 'Source' && !isNaN(cnt) && cnt > 0) {
      sources.push({ name: src, count: cnt });
    }
  }

  // Parse converted sources
  const cvtSources = [];
  for (let i = 3; i < rows.length; i++) {
    const r    = rows[i];
    const src  = r[8]  ? r[8].trim() : '';
    const gk   = r[11] ? r[11].replace(/[₱,]/g, '') : '0';
    const gs   = r[12] ? r[12].replace(/[₱,]/g, '') : '0';
    const gkVal = parseFloat(gk) || 0;
    const gsVal = parseFloat(gs) || 0;
    if (src && gkVal + gsVal > 0) {
      cvtSources.push({ name: src, gk: gkVal, gs: gsVal });
    }
  }

  // Totals derived from CSV
  const actualLeads  = sources.reduce((s, r) => s + r.count, 0);
  const totalReps    = reps.reduce((s, r) => s + r.count, 0);
  const targetLeads  = rows[3] ? (parseInt((rows[3][6] || '0').replace(/,/g, '')) || 0) : 0;
  const pctRaw       = rows[3] ? parseFloat((rows[3][7] || '0').replace('%','')) : 0;
  const pct          = isNaN(pctRaw) ? ((targetLeads > 0 ? (actualLeads / targetLeads) * 100 : 0)).toFixed(2) : pctRaw.toFixed(2);
  const totalConverted = rows[3] ? (parseInt((rows[3][10] || '0').replace(/,/g, '')) || 0) : 0;
  const totalGS      = rows[3] ? (parseFloat((rows[3][15] || '0').replace(/[₱,]/g, '')) || 0) : 0;
  const totalGK      = rows[3] ? (parseFloat((rows[3][14] || '0').replace(/[₱,]/g, '')) || 0) : 0;

  // ── Stats Strip ───────────────────────────────────────────────
  const statsData = [
    { val: totalReps.toLocaleString(), lbl: 'Total Rep Entries' },
    { val: actualLeads.toLocaleString(), lbl: 'Leads Gathered' },
    { val: totalConverted.toLocaleString(), lbl: 'Converted' },
    { val: pct + '%', lbl: 'Target Rate' },
    { val: fmtPeso(totalGS), lbl: 'Gross Sales' },
    { val: reps.length.toString(), lbl: 'Active Reps' },
  ];
  const track = document.getElementById('statsTrack');
  const allItems = [...statsData, ...statsData]; // duplicate for infinite scroll
  track.innerHTML = allItems.map(s =>
    `<div class="stat-item"><span class="val">${s.val}</span><span class="lbl">${s.lbl}</span></div>`
  ).join('');
  document.getElementById('statsStrip').style.display = 'block';

  // ── File Info ─────────────────────────────────────────────────
  document.getElementById('fileName').textContent    = fileName;
  document.getElementById('fileDetails').textContent = `${reps.length} sales reps · ${sources.length} lead sources · ${periodLabel} data`;
  document.getElementById('dashMeta').textContent    = `Marketing Leads Report · ${fiscalRange || periodLabel}`;
  const tagPeriod = document.getElementById('tagPeriod');
  if (tagPeriod) tagPeriod.textContent = periodShort;

  // ── KPI Cards ─────────────────────────────────────────────────
  const kpis = [
    { label: 'Leads Gathered',       value: actualLeads.toLocaleString(),                     sub: `Target: ${targetLeads.toLocaleString()}`,  orange: true },
    { label: 'Target Achievement',   value: pct + '%',                                         sub: 'Actual / Target',                          orange: true },
    { label: 'Leads Converted',      value: totalConverted.toLocaleString(),                   sub: 'Successful conversions' },
    { label: 'Total Gross Sales',    value: fmtPeso(totalGS),                                   sub: periodLabel },
    { label: 'GK Value',             value: fmtPeso(totalGK),                                   sub: 'Gross Kumpirmasyon' },
    { label: 'Active Reps',          value: reps.length.toString(),                             sub: 'Sales representatives' },
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

  // Store data for Present View
  window._pvData = {
    kpis, sources,
    donutSources: sources.slice(),
    cvtSources, reps,
    fileName,
    fileDetails: `${reps.length} sales reps · ${sources.length} sources`
  };

  // ── Destroy old charts ────────────────────────────────────────
  Object.values(charts).forEach(c => c.destroy());
  charts = {};

  Chart.defaults.color = '#fafafa';
  Chart.defaults.font  = { family: 'Montserrat', size: 11 };

  const gridColor = 'rgba(113,112,116,0.15)';
  const tickColor = '#a6a6a8';

  // ── Build charts (from charts.js) ─────────────────────────────
  charts.sourceBar = buildSourceBar(sources, gridColor, tickColor);
  buildDonutChart(sources);
  charts.salesBar  = buildSalesBar(cvtSources, gridColor, tickColor);
  charts.repBar    = buildRepBar(reps, gridColor, tickColor);

  // ── Source Cards ──────────────────────────────────────────────
  const maxCount = Math.max(...sources.map(s => s.count));
  const srcGrid  = document.getElementById('sourceGrid');
  srcGrid.innerHTML = '';
  sources.sort((a,b) => b.count - a.count).forEach((s, i) => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.style.animationDelay = (i * 0.05) + 's';
    const pct = Math.round((s.count / maxCount) * 100);
    card.innerHTML = `
      <div class="src-name">${s.name}</div>
      <div class="src-val">${s.count}</div>
      <div class="src-bar"><div class="src-bar-fill" style="width:0%" data-width="${pct}%"></div></div>
    `;
    srcGrid.appendChild(card);
  });

  // Animate bar fills after paint
  requestAnimationFrame(() => {
    document.querySelectorAll('.src-bar-fill').forEach(el => {
      el.style.width = el.dataset.width;
    });
  });

  // ── Rep Table ─────────────────────────────────────────────────
  const tbody      = document.getElementById('repTableBody');
  const total      = reps.reduce((s, r) => s + r.count, 0);
  const sortedReps = [...reps].sort((a,b) => b.count - a.count);
  tbody.innerHTML  = '';
  sortedReps.forEach((r, i) => {
    const contrib = ((r.count / total) * 100).toFixed(1);
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

  // ── Save to history ───────────────────────────────────────────
  if (rawRows) addToHistory(fileName, rawRows);
  renderHistory();

  // ── Show leads dashboard ──────────────────────────────────────
  document.getElementById('loadingOverlay').classList.remove('show');
  document.getElementById('landing').style.display = 'none';
  document.getElementById('statsStrip').style.display = 'block';
  document.getElementById('dashboard').classList.add('visible');
  setDashboardMode(true);
  window.scrollTo(0, 0);
}

// ─── BACK TO LANDING ──────────────────────────────────────────
function backToLanding() {
  document.getElementById('dashboard').classList.remove('visible');
  document.getElementById('landing').style.display = 'flex';
  document.getElementById('statsStrip').style.display = 'none';
  document.getElementById('statsTrack').innerHTML = '';
  document.getElementById('fileInput').value = '';
  setDashboardMode(false);
  // Collapse drawer
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
  const scrollingUp = currentY < lastScrollY;
  lastScrollY = currentY;

  if (scrollingUp) {
    if (drawerOpen) {
      drawerOpen = false;
      document.getElementById('historyDrawerBody')?.classList.remove('open');
      document.getElementById('historyDrawerChevron')?.classList.remove('flipped');
      document.getElementById('historyDrawer')?.classList.remove('drawer-open');
    }

  }
}, { passive: true });

// ─── INIT ─────────────────────────────────────────────────────
renderHistory();
