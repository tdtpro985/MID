/* ═══════════════════════════════════════════════════════════
   POWERSTEEL – present-mode.js  (v2 — live-reactive)
   Present View: open/close, HTML builder, PV chart builders,
   auto-scroll engine, live data patching via _pvData watch
   ═══════════════════════════════════════════════════════════ */

let pvCharts = {};

// ─── PALETTE ──────────────────────────────────────────────────
const PV_PALETTE = [
  '#e67026','#c45820','#f08c50','#a04010','#f5a070',
  '#7a9e9f','#4e7f80','#b08040','#8060a0','#60a060',
  '#5080c0','#c06080','#80b040','#c09040','#4090b0'
];

// ─── LIVE-REFRESH WATCHER ──────────────────────────────────────
// Called by buildDashboard at the end of every live-sync cycle.
// Patches the present view in-place so numbers never go stale.
let _pvLastHash = null;

function notifyPresentViewUpdate() {
  const panel = document.getElementById('presentView');
  if (!panel || !panel.classList.contains('visible')) return;
  const data = window._pvData;
  if (!data) return;

  const hash = JSON.stringify(data.kpis.map(k => k.value));
  if (hash === _pvLastHash) return;
  _pvLastHash = hash;

  patchPresentViewLive(data);
}

// ─── OPEN PRESENT VIEW ────────────────────────────────────────
function openPresentView() {
  if (!window._pvData) return;
  openLeadsPresentView();
}

// ═══════════════════════════════════════════════════════════
//  BUILD (first open)
// ═══════════════════════════════════════════════════════════
function openLeadsPresentView() {
  const data = window._pvData;
  const { kpis, sources, donutSources, cvtSources, reps, fileName } = data;
  const total = donutSources.reduce((s, d) => s + d.count, 0);

  let panel = document.getElementById('presentView');
  if (panel) panel.remove();
  destroyPvCharts();

  const isLight   = document.body.classList.contains('light-mode');
  const tickColor = isLight ? '#5a5856' : '#a6a6a8';
  const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';

  const kpiHTML         = buildKpiStripHTML(kpis);
  const sortedSrc       = [...sources].sort((a, b) => b.count - a.count).slice(0, 14);
  const srcListHTML     = buildSrcListHTML(sortedSrc);
  const sortedReps      = [...reps].sort((a, b) => b.count - a.count);
  const repTotal        = reps.reduce((s, r) => s + r.count, 0);
  const repRowsHTML     = buildRepRowsHTML(sortedReps, repTotal);
  const donutLegendHTML = buildDonutLegendHTML(donutSources, total);

  panel = document.createElement('div');
  panel.id = 'presentView';
  panel.innerHTML = `
    <div class="pv-header">
      <div class="pv-logo-img">
        <img src="assets/logo.png" alt="POWERSTEEL"
             style="height:2.2rem;width:auto;object-fit:contain;display:block;"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="pv-logo" style="display:none;"><span class="p">POWER</span><span class="s">STEEL</span></div>
      </div>

      <div class="pv-title">Live Dashboard &middot; Present View</div>

      <div style="display:flex;align-items:center;gap:0.6rem;">
        <div id="pvLivePill" class="pv-live-pill" style="display:none;">
          <span class="pv-live-dot"></span>
          <span class="pv-live-label">LIVE</span>
          <span id="pvSyncCountdown" class="pv-live-countdown"></span>
        </div>
        <span class="pv-header-filename"
              style="font-family:Montserrat;font-size:0.6rem;color:var(--text-muted);letter-spacing:0.1em;">
          ${fileName || ''}
        </span>
        <button class="pv-exit-btn" onclick="closePresentView()">
          <span class="pv-exit-text">Exit Present</span>
          <span class="pv-exit-x" aria-hidden="true">&#x2715;</span>
        </button>
      </div>
    </div>

    <div id="pvKpiStrip" class="pv-kpi-strip">${kpiHTML}</div>

    <div id="pvUpdateBar" class="pv-update-bar" style="display:none;">
      <span class="pv-update-dot"></span>
      <span id="pvUpdateMsg" class="pv-update-msg">Data refreshed</span>
    </div>

    <div class="pv-body">

      <div class="pv-card">
        <div class="pv-card-title">Leads by Source</div>
        <canvas id="pvSourceBar"></canvas>
      </div>

      <div class="pv-card pv-source-share-card">
        <div class="pv-card-title">Source Share</div>
        <div class="pv-donut-wrap">
          <div class="pv-donut-svg-area">
            <svg id="pvDonutSvg" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="pvDonutGlow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              <g id="pvDonutSegments"></g>
              <g>
                <circle cx="110" cy="110" r="44" fill="var(--bg-card)"/>
                <text id="pvCenterVal" x="110" y="104" text-anchor="middle"
                      font-family="'Bebas Neue',sans-serif" font-size="26"
                      fill="var(--orange)">${total}</text>
                <text x="110" y="120" text-anchor="middle"
                      font-family="'Montserrat',sans-serif" font-size="7"
                      font-weight="700" letter-spacing="1.5"
                      fill="var(--text-muted)">TOTAL</text>
                <text x="110" y="132" text-anchor="middle"
                      font-family="'Montserrat',sans-serif" font-size="6"
                      fill="var(--text-muted)">LEADS</text>
              </g>
            </svg>
          </div>
          <div id="pvDonutLegend" class="pv-donut-legend">${donutLegendHTML}</div>
        </div>
      </div>

      <div class="pv-card">
        <div class="pv-card-title">Source Breakdown</div>
        <div id="pvSourceList" class="pv-source-list">${srcListHTML}</div>
      </div>

      <div class="pv-card pv-span-2">
        <div class="pv-card-title">Converted Sales Value by Source (&#8369;)</div>
        <canvas id="pvSalesBar"></canvas>
      </div>

      <div class="pv-card">
        <div class="pv-card-title">Sales Representatives</div>
        <table class="pv-table pv-table-head-fixed">
          <thead><tr><th>#</th><th>Rep</th><th>Leads</th><th>Share</th></tr></thead>
        </table>
        <div id="pvRepTableScroll" class="pv-table-scroll pv-scroll-fade">
          <table class="pv-table">
            <tbody id="pvRepTbody">${repRowsHTML}</tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('visible'));

  mirrorSyncPill();
  initPresentViewScrollers();
  buildPvDonut(donutSources, total, PV_PALETTE);

  setTimeout(() => {
    buildPvSourceBar(sources, tickColor, gridColor);
    buildPvSalesBar(cvtSources, tickColor, gridColor);
  }, 80);

  _pvLastHash = JSON.stringify(kpis.map(k => k.value));
}

// ═══════════════════════════════════════════════════════════
//  LIVE PATCH (no rebuild — surgically updates each element)
// ═══════════════════════════════════════════════════════════
function patchPresentViewLive(data) {
  const { kpis, sources, donutSources, cvtSources, reps } = data;
  const total = donutSources.reduce((s, d) => s + d.count, 0);

  const isLight   = document.body.classList.contains('light-mode');
  const tickColor = isLight ? '#5a5856' : '#a6a6a8';
  const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';

  // KPI strip
  const strip = document.getElementById('pvKpiStrip');
  if (strip) {
    const items = strip.querySelectorAll('.pv-kpi-item');
    kpis.forEach((k, i) => {
      if (!items[i]) return;
      const valEl = items[i].querySelector('.pv-kpi-val');
      const lblEl = items[i].querySelector('.pv-kpi-lbl');
      if (valEl) pvAnimateText(valEl, k.value);
      if (lblEl) lblEl.textContent = k.label;
    });
  }

  // Donut center
  const centerEl = document.getElementById('pvCenterVal');
  if (centerEl) pvAnimateText(centerEl, String(total));

  // Donut segments
  const segG = document.getElementById('pvDonutSegments');
  if (segG) {
    segG.innerHTML = '';
    buildPvDonut(donutSources, total, PV_PALETTE);
  }

  // Donut legend
  const legendEl = document.getElementById('pvDonutLegend');
  if (legendEl) {
    stopLegendScroller();
    legendEl.innerHTML = buildDonutLegendHTML(donutSources, total);
    startLegendAutoScroll(legendEl, 8);
  }

  // Source list
  const srcListEl = document.getElementById('pvSourceList');
  if (srcListEl) {
    const sortedSrc = [...sources].sort((a, b) => b.count - a.count).slice(0, 14);
    srcListEl.innerHTML = buildSrcListHTML(sortedSrc);
  }

  // Rep table
  const tbody = document.getElementById('pvRepTbody');
  if (tbody) {
    stopTableScroller();
    const sortedReps = [...reps].sort((a, b) => b.count - a.count);
    const repTotal   = reps.reduce((s, r) => s + r.count, 0);
    tbody.innerHTML  = buildRepRowsHTML(sortedReps, repTotal);
    const tableScroll = document.getElementById('pvRepTableScroll');
    if (tableScroll) startTableAutoScroll(tableScroll, 10);
  }

  // Charts
  if (pvCharts.srcBar) {
    const srcSorted = [...sources].sort((a, b) => b.count - a.count);
    pvCharts.srcBar.data.labels = srcSorted.map(s => s.name);
    pvCharts.srcBar.data.datasets[0].data = srcSorted.map(s => s.count);
    pvCharts.srcBar.data.datasets[0].backgroundColor = srcSorted.map((_, i) =>
      i === 0 ? '#e67026' : `rgba(230,112,38,${Math.max(0.3, 0.9 - i * 0.04)})`
    );
    pvCharts.srcBar.update();
  } else {
    buildPvSourceBar(sources, tickColor, gridColor);
  }

  if (pvCharts.salesBar) {
    const validCvt = cvtSources.filter(s => s.gs > 0).sort((a, b) => b.gs - a.gs);
    pvCharts.salesBar.data.labels = validCvt.map(s => s.name);
    pvCharts.salesBar.data.datasets[0].data = validCvt.map(s => s.gs);
    pvCharts.salesBar.data.datasets[1].data = validCvt.map(s => s.gk);
    pvCharts.salesBar.update();
  } else {
    buildPvSalesBar(cvtSources, tickColor, gridColor);
  }

  flashUpdateBar();
  mirrorSyncPill();
}

// ─── FLASH UPDATE BAR ─────────────────────────────────────────
function flashUpdateBar() {
  const bar = document.getElementById('pvUpdateBar');
  if (!bar) return;
  const msg = document.getElementById('pvUpdateMsg');
  if (msg) {
    const now = new Date();
    msg.textContent = 'Data refreshed \u00b7 ' +
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  bar.style.display = 'flex';
  bar.classList.remove('pv-update-flash');
  void bar.offsetWidth;
  bar.classList.add('pv-update-flash');
}

// ─── SYNC PILL MIRROR ─────────────────────────────────────────
function mirrorSyncPill() {
  const pill = document.getElementById('pvLivePill');
  if (!pill) return;
  const mainIndicator = document.getElementById('syncIndicator');
  const isLive = mainIndicator && mainIndicator.classList.contains('active');
  pill.style.display = isLive ? 'flex' : 'none';
  if (isLive) {
    const main = document.getElementById('syncCountdown');
    const pv   = document.getElementById('pvSyncCountdown');
    if (main && pv) pv.textContent = main.textContent;
  }
}

// ─── TEXT BUMP ANIMATION ──────────────────────────────────────
function pvAnimateText(el, newVal) {
  if (!el || el.textContent === newVal) return;
  el.classList.remove('pv-val-bump');
  void el.offsetWidth;
  el.textContent = newVal;
  el.classList.add('pv-val-bump');
}

// ─── HTML BUILDERS ────────────────────────────────────────────
function buildKpiStripHTML(kpis) {
  return kpis.map(k => `
    <div class="pv-kpi-item">
      <div class="pv-kpi-val">${k.value}</div>
      <div class="pv-kpi-lbl">${k.label}</div>
    </div>
  `).join('');
}

function buildSrcListHTML(sortedSrc) {
  return sortedSrc.map(s => `
    <div class="pv-src-item">
      <span class="pv-src-name" title="${s.name}">${s.name}</span>
      <span class="pv-src-val">${s.count}</span>
    </div>
  `).join('');
}

function buildRepRowsHTML(sortedReps, repTotal) {
  return sortedReps.map((r, i) => {
    const pct = ((r.count / repTotal) * 100).toFixed(1);
    return `<tr>
      <td>${i + 1}</td>
      <td style="font-weight:700">${r.name}</td>
      <td class="num">${r.count.toLocaleString()}</td>
      <td style="color:var(--text-secondary)">${pct}%</td>
    </tr>`;
  }).join('');
}

function buildDonutLegendHTML(donutSources, total) {
  return donutSources.map((src, i) => {
    const pct   = ((src.count / total) * 100).toFixed(1);
    const color = PV_PALETTE[i % PV_PALETTE.length];
    return `<div class="pv-legend-item">
      <span class="pv-legend-swatch" style="background:${color}"></span>
      <span class="pv-legend-name" title="${src.name}">${src.name}</span>
      <span class="pv-legend-pct">${pct}%</span>
      <span class="pv-legend-count">${src.count}</span>
    </div>`;
  }).join('');
}

// ─── CHART BUILDERS ───────────────────────────────────────────
function buildPvSourceBar(sources, tickColor, gridColor) {
  const el = document.getElementById('pvSourceBar');
  if (!el) return;
  const srcSorted = [...sources].sort((a, b) => b.count - a.count);
  pvCharts.srcBar = new Chart(el, {
    type: 'bar',
    data: {
      labels: srcSorted.map(s => s.name),
      datasets: [{
        data: srcSorted.map(s => s.count),
        backgroundColor: srcSorted.map((_, i) =>
          i === 0 ? '#e67026' : `rgba(230,112,38,${Math.max(0.3, 0.9 - i * 0.04)})`
        ),
        borderRadius: 4
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tickColor, font: { size: 7 }, maxRotation: 45 }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor, font: { size: 7 } }, grid: { color: gridColor } }
      },
      animation: { duration: 800 },
      maintainAspectRatio: false
    }
  });
}

function buildPvSalesBar(cvtSources, tickColor, gridColor) {
  const el = document.getElementById('pvSalesBar');
  if (!el) return;
  const validCvt = cvtSources.filter(s => s.gs > 0).sort((a, b) => b.gs - a.gs);
  pvCharts.salesBar = new Chart(el, {
    type: 'bar',
    data: {
      labels: validCvt.map(s => s.name),
      datasets: [
        { label: 'Gross Sales (\u20b1)', data: validCvt.map(s => s.gs), backgroundColor: 'rgba(230,112,38,0.85)', borderRadius: 4 },
        { label: 'GK Value (\u20b1)',    data: validCvt.map(s => s.gk), backgroundColor: 'rgba(113,112,116,0.5)',  borderRadius: 4 }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: tickColor, font: { size: 8 }, boxWidth: 10, padding: 8 } } },
      scales: {
        x: { ticks: { color: tickColor, font: { size: 7 }, maxRotation: 40 }, grid: { color: gridColor } },
        y: {
          ticks: { color: tickColor, font: { size: 7 }, callback: v => '\u20b1' + (v / 1000000).toFixed(1) + 'M' },
          grid: { color: gridColor }
        }
      },
      animation: { duration: 900 },
      maintainAspectRatio: false
    }
  });
}

// ─── BUILD PV DONUT ───────────────────────────────────────────
function buildPvDonut(donutSources, total, palette) {
  const CX = 110, CY = 110, R = 80, SW = 28, GAP_DEG = 3;
  function toRad(d) { return d * Math.PI / 180; }
  function arcPath(startDeg, endDeg, r, sw) {
    const ro = r, ri = r - sw;
    const s  = { x: CX + ro * Math.cos(toRad(startDeg - 90)), y: CY + ro * Math.sin(toRad(startDeg - 90)) };
    const e  = { x: CX + ro * Math.cos(toRad(endDeg   - 90)), y: CY + ro * Math.sin(toRad(endDeg   - 90)) };
    const si = { x: CX + ri * Math.cos(toRad(startDeg - 90)), y: CY + ri * Math.sin(toRad(startDeg - 90)) };
    const ei = { x: CX + ri * Math.cos(toRad(endDeg   - 90)), y: CY + ri * Math.sin(toRad(endDeg   - 90)) };
    const lg = (endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${ro} ${ro} 0 ${lg} 1 ${e.x} ${e.y} L ${ei.x} ${ei.y} A ${ri} ${ri} 0 ${lg} 0 ${si.x} ${si.y} Z`;
  }
  const segG = document.getElementById('pvDonutSegments');
  if (!segG) return;
  segG.innerHTML = '';
  let cumDeg = 0;
  donutSources.forEach((src, i) => {
    const fraction = src.count / total;
    const spanDeg  = fraction * 360;
    const startDeg = cumDeg + GAP_DEG / 2;
    const endDeg   = cumDeg + spanDeg - GAP_DEG / 2;
    cumDeg += spanDeg;
    const color = palette[i % palette.length];
    const path  = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', arcPath(startDeg, endDeg, R, SW));
    path.setAttribute('fill', color);
    path.setAttribute('stroke', 'none');
    path.style.transformOrigin = `${CX}px ${CY}px`;
    path.style.opacity   = '0';
    path.style.transform = 'scale(0.8)';
    segG.appendChild(path);
    setTimeout(() => {
      path.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.4,0.64,1)';
      requestAnimationFrame(() => { path.style.opacity = '1'; path.style.transform = 'scale(1)'; });
    }, i * 40);
  });
}

// ─── DESTROY CHARTS ───────────────────────────────────────────
function destroyPvCharts() {
  Object.values(pvCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  pvCharts = {};
}

// ─── CLOSE PRESENT VIEW ───────────────────────────────────────
function closePresentView() {
  _stopAllScrollers();
  const panel = document.getElementById('presentView');
  if (panel) {
    panel.classList.remove('visible');
    setTimeout(() => { panel.remove(); }, 300);
  }
  destroyPvCharts();
  _pvLastHash = null;
}

// ═══════════════════════════════════════════════════════════
//  AUTO-SCROLL ENGINE
// ═══════════════════════════════════════════════════════════
let pvScrollers         = [];
let pvScrollerIntervals = [];
let _legendScrollHandle = null;
let _tableScrollHandle  = null;

function stopLegendScroller() {
  if (_legendScrollHandle) {
    if (_legendScrollHandle.styleEl) _legendScrollHandle.styleEl.remove();
    _legendScrollHandle = null;
  }
}

function stopTableScroller() {
  if (_tableScrollHandle) {
    if (_tableScrollHandle.styleEl) _tableScrollHandle.styleEl.remove();
    _tableScrollHandle  = null;
  }
}

function _stopAllScrollers() {
  pvScrollers.forEach(h => {
    if (h.id)      cancelAnimationFrame(h.id);
    if (h.styleEl) h.styleEl.remove();
  });
  pvScrollers = [];
  pvScrollerIntervals.forEach(id => clearInterval(id));
  pvScrollerIntervals  = [];
  _legendScrollHandle  = null;
  _tableScrollHandle   = null;
}

function startLegendAutoScroll(el, pxPerSec) {
  pxPerSec = pxPerSec || 22;
  if (!el || el.children.length === 0) return;

  const items = Array.from(el.children);
  const track = document.createElement('div');
  track.className = 'pv-legend-track';
  track.style.cssText = 'display:flex;flex-direction:column;will-change:transform;';

  items.forEach(item => { el.removeChild(item); track.appendChild(item); });
  el.appendChild(track);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const allOriginal = Array.from(track.children);
    const first = allOriginal[0].getBoundingClientRect();
    const last  = allOriginal[allOriginal.length - 1].getBoundingClientRect();
    const oneSetH = last.bottom - first.top;
    if (oneSetH <= 0) return;

    const gapPx = allOriginal.length > 1
      ? allOriginal[1].getBoundingClientRect().top - allOriginal[0].getBoundingClientRect().bottom
      : 3;

    items.forEach((item, i) => {
      const clone = item.cloneNode(true);
      if (i === 0) clone.style.marginTop = gapPx + 'px';
      track.appendChild(clone);
    });

    const loopH = oneSetH + gapPx;
    const dur   = loopH / pxPerSec;
    const animName = 'pvLegendScroll_' + Date.now();
    const styleEl  = document.createElement('style');
    styleEl.textContent =
      '@keyframes ' + animName + ' { 0% { transform:translateY(0px); } 100% { transform:translateY(-' + loopH + 'px); } }';
    document.head.appendChild(styleEl);

    const handle = { styleEl: styleEl };
    pvScrollers.push(handle);
    _legendScrollHandle = handle;

    track.style.animation = animName + ' ' + dur + 's linear infinite';
    el.addEventListener('mouseenter', () => { track.style.animationPlayState = 'paused'; });
    el.addEventListener('mouseleave', () => { track.style.animationPlayState = 'running'; });
  }));
}

function startTableAutoScroll(el, pxPerSec) {
  pxPerSec = pxPerSec || 10;
  if (!el) return;
  const tbody = el.querySelector('tbody');
  if (!tbody) return;

  const originalRows = Array.from(tbody.querySelectorAll('tr'));
  if (originalRows.length === 0) return;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const firstRect = originalRows[0].getBoundingClientRect();
    const lastRect  = originalRows[originalRows.length - 1].getBoundingClientRect();
    const oneSetH   = lastRect.bottom - firstRect.top;
    if (oneSetH <= 0) return;

    const rowGap = originalRows.length > 1
      ? originalRows[1].getBoundingClientRect().top - originalRows[0].getBoundingClientRect().bottom
      : 0;

    originalRows.forEach((row, i) => {
      const clone = row.cloneNode(true);
      if (i === 0) clone.style.marginTop = rowGap + 'px';
      tbody.appendChild(clone);
    });

    const loopH = oneSetH + rowGap;
    const dur   = loopH / pxPerSec;
    const animName = 'pvTableScroll_' + Date.now();
    const styleEl  = document.createElement('style');
    styleEl.textContent =
      '@keyframes ' + animName + ' { 0% { transform:translateY(0px); } 100% { transform:translateY(-' + loopH + 'px); } }';
    document.head.appendChild(styleEl);

    const handle = { styleEl: styleEl };
    pvScrollers.push(handle);
    _tableScrollHandle = handle;

    tbody.style.willChange = 'transform';
    tbody.style.animation  = animName + ' ' + dur + 's linear infinite';
    el.addEventListener('mouseenter', () => { tbody.style.animationPlayState = 'paused'; });
    el.addEventListener('mouseleave', () => { tbody.style.animationPlayState = 'running'; });
  }));
}

function initPresentViewScrollers() {
  setTimeout(() => {
    const legend = document.querySelector('#presentView .pv-donut-legend');
    const table  = document.getElementById('pvRepTableScroll');
    if (legend) startLegendAutoScroll(legend, 8);
    if (table)  startTableAutoScroll(table, 10);
  }, 700);
}

// Mirror sync pill every second while present view is open
setInterval(() => {
  const panel = document.getElementById('presentView');
  if (panel && panel.classList.contains('visible')) mirrorSyncPill();
}, 1000);
// ─── END PRESENT VIEW ─────────────────────────────────────────
