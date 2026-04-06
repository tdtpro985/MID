/* ═══════════════════════════════════════════════════════════
   POWERSTEEL – charts.js
   Chart builders: source bar, SVG donut, sales bar, rep bar
   Depends on: Chart.js (global), dashboard data vars
   ═══════════════════════════════════════════════════════════ */

// ── SHARED PALETTE ────────────────────────────────────────────
const DONUT_PALETTE = [
  '#e67026','#f0983a','#e15716','#f5b96e','#c04a10',
  '#8c8c8e','#a6a6a8','#6a6a6c','#b8b0a0','#5a5a5c',
  '#c8bfb0','#4a3f38','#d4a070','#7a6058','#e8d0b8',
  '#3a3a3c','#9a8878','#cc7040','#686460','#b09880'
];

// ── SOURCE BAR CHART ──────────────────────────────────────────
function buildSourceBar(sources, gridColor, tickColor) {
  const allSources = sources.slice();
  const chart = new Chart(document.getElementById('sourceBar'), {
    type: 'bar',
    data: {
      labels: allSources.map(s =>
        s.name
          .replace('FACEBOOK PAGE', 'FB Page')
          .replace('FACEBOOK GROUP', 'FB Group')
          .replace('GOOGLE/INTERNET', 'Google')
          .replace('WEBSITE/LIVECHAT', 'Website')
      ),
      datasets: [{
        data: allSources.map(s => s.count),
        backgroundColor: allSources.map((_, i) =>
          i === 0 ? '#e67026' : `rgba(230,112,38,${Math.max(0.3, 0.9 - i * 0.04)})`
        ),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: tickColor, font: { size: 8 }, maxRotation: 45, minRotation: 30 },
          grid: { color: gridColor }
        },
        y: { ticks: { color: tickColor }, grid: { color: gridColor } }
      },
      animation: { duration: 1200, easing: 'easeOutQuart' },
      onClick(evt) {
        const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
        if (!points.length) return;
        const idx = points[0].index;
        const src = allSources[idx];
        if (src && window._dpOpenPreview && window._dpBuildSourceContext) {
          window._dpOpenPreview(window._dpBuildSourceContext(src.name, src.count));
        }
      }
    }
  });
  document.getElementById('sourceBar').style.cursor = 'pointer';
  return chart;
}

// ── SVG DONUT CHART ───────────────────────────────────────────
function buildDonutChart(sources) {
  const donutSources = sources.slice();
  const total = donutSources.reduce((s, r) => s + r.count, 0);

  const CX = 110, CY = 110, R = 78, SW = 26;
  const GAP_DEG = 1.5;

  const segG       = document.getElementById('donutSegments');
  const legendEl   = document.getElementById('donutLegend');
  const centerVal  = document.getElementById('donutCenterVal');
  const centerLabel= document.getElementById('donutCenterLabel');
  const centerSub  = document.getElementById('donutCenterSub');

  // Clear previous render before rebuilding
  segG.innerHTML     = '';
  legendEl.innerHTML = '';

  centerVal.textContent   = total;
  centerLabel.textContent = 'TOTAL';
  centerSub.textContent   = 'LEADS';

  function polar(angleDeg, radius) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
  }

  function arcPath(startDeg, endDeg, r, sw) {
    const inner = r - sw / 2;
    const outer = r + sw / 2;
    const s1 = polar(startDeg, outer), e1 = polar(endDeg, outer);
    const s2 = polar(endDeg, inner),   e2 = polar(startDeg, inner);
    const span = endDeg - startDeg;
    const lg = span > 180 ? 1 : 0;
    return [
      `M ${s1.x} ${s1.y}`,
      `A ${outer} ${outer} 0 ${lg} 1 ${e1.x} ${e1.y}`,
      `L ${s2.x} ${s2.y}`,
      `A ${inner} ${inner} 0 ${lg} 0 ${e2.x} ${e2.y}`,
      'Z'
    ].join(' ');
  }

  let cumDeg = 0;
  const segments = donutSources.map((src, i) => {
    const fraction = src.count / total;
    const spanDeg  = fraction * 360;
    const startDeg = cumDeg + GAP_DEG / 2;
    const endDeg   = cumDeg + spanDeg - GAP_DEG / 2;
    cumDeg += spanDeg;
    return { src, fraction, startDeg, endDeg, color: DONUT_PALETTE[i % DONUT_PALETTE.length] };
  });

  let activeIndex = -1;
  const segPaths   = [];
  const legendItems = [];

  segments.forEach(({ src, fraction, startDeg, endDeg, color }, i) => {
    const pct = (fraction * 100).toFixed(1);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', arcPath(startDeg, endDeg, R, SW));
    path.setAttribute('fill', color);
    path.setAttribute('stroke', 'none');
    path.style.transformOrigin = `${CX}px ${CY}px`;
    path.style.opacity = '0';
    path.style.transform = 'scale(0.75)';
    path.style.cursor = 'pointer';

    path.addEventListener('mouseenter', () => activateSegment(i));
    path.addEventListener('mouseleave', () => deactivateSegment());
    path.addEventListener('click', (e) => { e.stopPropagation(); toggleSegment(i); });

    segG.appendChild(path);
    segPaths.push({ path, color, startDeg, endDeg });

    setTimeout(() => {
      path.style.transition = `opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.4,0.64,1)`;
      requestAnimationFrame(() => {
        path.style.opacity   = '1';
        path.style.transform = 'scale(1)';
      });
    }, i * 55);

    // Legend row
    const item = document.createElement('div');
    item.className = 'donut-legend-item';
    item.style.setProperty('--legend-delay', `${300 + i * 50}ms`);
    item.innerHTML = `
      <span class="legend-swatch" style="background:${color};--swatch-color:${color}"></span>
      <span class="legend-name" title="${src.name}">${src.name}</span>
      <span class="legend-pct">${pct}%</span>
      <span class="legend-count">${src.count}</span>
    `;
    item.addEventListener('mouseenter', () => activateSegment(i));
    item.addEventListener('mouseleave', () => deactivateSegment());
    item.addEventListener('click', (e) => { e.stopPropagation(); toggleSegment(i); });
    legendEl.appendChild(item);
    legendItems.push(item);
  });

  function activateSegment(idx) {
    if (activeIndex !== -1) return;
    highlightSegment(idx);
  }
  function deactivateSegment() {
    if (activeIndex !== -1) return;
    clearHighlight();
  }
  function toggleSegment(idx) {
    if (activeIndex === idx) { activeIndex = -1; clearHighlight(); }
    else { activeIndex = idx; highlightSegment(idx); }
    openDonutSegmentPopup(idx);
  }

  function openDonutSegmentPopup(idx) {
    const { src, fraction, color } = segments[idx];
    if (!window._dpOpenPreview) return;

    const md = window._pvData;
    const allSources = md ? [...md.sources].sort((a, b) => b.count - a.count) : [];
    const total = allSources.reduce((s, r) => s + r.count, 0);
    const pct = (fraction * 100).toFixed(1);
    const rank = allSources.findIndex(s => s.name === src.name) + 1;
    const max = allSources.length ? allSources[0].count : 1;

    // Find CVT data for this source
    const cvt = (md && md.cvtSources) ? md.cvtSources.find(c => c.name === src.name) : null;
    const cvtHTML = cvt && (cvt.gs || cvt.gk) ? `
      <div class="dp-two-col" style="margin-bottom:1.2rem;">
        <div class="dp-stat-box">
          <div class="dp-stat-box-val" style="font-size:1.1rem;">₱${((cvt.gs||0)/1000000).toFixed(2)}M</div>
          <div class="dp-stat-box-lbl">Gross Sales</div>
        </div>
        <div class="dp-stat-box">
          <div class="dp-stat-box-val" style="font-size:1.1rem;">₱${((cvt.gk||0)/1000000).toFixed(2)}M</div>
          <div class="dp-stat-box-lbl">GK Value</div>
        </div>
      </div>
    ` : '';

    // Mini SVG arc showing only this segment's portion (animated)
    const arcRadius = 44, arcSW = 14, arcCX = 60, arcCY = 60;
    const arcCircumference = 2 * Math.PI * arcRadius;
    const arcDash = (fraction * arcCircumference).toFixed(2);
    const arcGap  = (arcCircumference - fraction * arcCircumference).toFixed(2);

    const miniArcSVG = `
      <svg width="120" height="120" viewBox="0 0 120 120" style="flex-shrink:0;overflow:visible;">
        <defs>
          <filter id="dpGlow${idx}">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <!-- Background ring -->
        <circle cx="${arcCX}" cy="${arcCY}" r="${arcRadius}"
          fill="none" stroke="rgba(113,112,116,0.15)" stroke-width="${arcSW}"/>
        <!-- Progress arc (starts at top = -90deg) -->
        <circle cx="${arcCX}" cy="${arcCY}" r="${arcRadius}"
          fill="none" stroke="${color}" stroke-width="${arcSW}"
          stroke-linecap="round"
          stroke-dasharray="0 ${arcCircumference}"
          style="transform:rotate(-90deg);transform-origin:${arcCX}px ${arcCY}px;
                 transition:stroke-dasharray 1s cubic-bezier(0.16,1,0.3,1);
                 filter:url(#dpGlow${idx});"
          id="dpArcCircle${idx}"/>
        <!-- Center percent -->
        <text x="${arcCX}" y="${arcCY - 6}" text-anchor="middle"
          font-family="Bebas Neue,sans-serif" font-size="22" fill="${color}"
          letter-spacing="0.02em">${pct}%</text>
        <text x="${arcCX}" y="${arcCY + 11}" text-anchor="middle"
          font-family="Montserrat,sans-serif" font-size="7.5" fill="var(--text-secondary)"
          font-weight="700" letter-spacing="0.15em">SHARE</text>
      </svg>
    `;

    // Rank badge
    const rankBadge = rank === 1 ? '🥇 #1 Source' : rank === 2 ? '🥈 #2 Source' : rank === 3 ? '🥉 #3 Source' : `Rank #${rank}`;

    // Comparison bar list (all sources)
    const barsHTML = allSources.length ? `
      <div class="dp-section-label">vs All Sources</div>
      <div class="dp-bar-list">
        ${allSources.map(s => `
          <div class="dp-bar-row${s.name === src.name ? ' dp-bar-row-active' : ''}">
            <div class="dp-bar-name">
              <span class="legend-swatch" style="background:${segments.find(sg=>sg.src.name===s.name)?.color||'var(--orange)'};width:8px;height:8px;border-radius:2px;display:inline-block;flex-shrink:0;margin-right:4px;"></span>
              ${s.name}
            </div>
            <div class="dp-bar-track">
              <div class="dp-bar-fill${s.name === src.name ? ' dp-bar-fill-accent' : ''}"
                   data-w="${Math.round(s.count/max*100)}%" style="width:0%"></div>
            </div>
            <div class="dp-bar-num dp-count-up" data-val="${s.count}">0</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    window._dpOpenPreview({
      eyebrow: 'DONUT BREAKDOWN',
      title: src.name,
      subtitle: `${rankBadge} · ${pct}% of total leads`,
      bodyHTML: `
        <!-- Hero row: arc + stats -->
        <div style="display:flex;align-items:center;gap:1.2rem;background:linear-gradient(135deg,rgba(${_hexToRgb(color)},0.10),transparent 60%);border:1px solid rgba(${_hexToRgb(color)},0.2);border-radius:14px;padding:1.2rem 1.4rem;margin-bottom:1.2rem;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-30px;right:-30px;width:100px;height:100px;border-radius:50%;background:radial-gradient(circle,rgba(${_hexToRgb(color)},0.18),transparent 70%);pointer-events:none;"></div>
          ${miniArcSVG}
          <div style="flex:1;min-width:0;">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:3.2rem;line-height:1;color:${color};letter-spacing:0.02em;margin-bottom:0.15rem;" class="dp-count-up" data-val="${src.count}">0</div>
            <div style="font-family:'Montserrat',sans-serif;font-size:0.7rem;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.4rem;">Leads from this source</div>
            <div style="font-family:'Montserrat',sans-serif;font-size:0.72rem;color:var(--text-muted);">
              out of <strong style="color:var(--text-primary);">${total.toLocaleString()}</strong> total leads
            </div>
          </div>
        </div>
        ${cvtHTML}
        ${barsHTML}
      `
    });

    // Animate the arc after modal opens
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const arcEl = document.getElementById(`dpArcCircle${idx}`);
        if (arcEl) {
          arcEl.style.strokeDasharray = `${arcDash} ${arcGap}`;
        }
      });
    });
  }

  function highlightSegment(idx) {
    const { src, fraction } = segments[idx];
    const pct = (fraction * 100).toFixed(1);
    centerVal.textContent   = src.count;
    centerLabel.textContent = src.name.length > 13 ? src.name.slice(0,13)+'…' : src.name;
    centerSub.textContent   = pct + '%';

    segPaths.forEach(({ path, color }, i) => {
      path.style.transition = 'opacity 0.25s ease, transform 0.25s ease, filter 0.25s ease';
      if (i === idx) {
        path.style.opacity   = '1';
        path.style.transform = 'scale(1.07)';
        path.style.filter    = `brightness(1.25) drop-shadow(0 0 7px ${color}99)`;
      } else {
        path.style.opacity   = '0.18';
        path.style.transform = 'scale(1)';
        path.style.filter    = 'none';
      }
    });
    legendItems.forEach((item, i) => {
      item.classList.toggle('active',      i === idx);
      item.classList.toggle('dimmed-item', i !== idx);
    });
  }

  function clearHighlight() {
    centerVal.textContent   = total;
    centerLabel.textContent = 'TOTAL';
    centerSub.textContent   = 'LEADS';
    segPaths.forEach(({ path }) => {
      path.style.transition = 'opacity 0.25s ease, transform 0.25s ease, filter 0.25s ease';
      path.style.opacity   = '1';
      path.style.transform = 'scale(1)';
      path.style.filter    = 'none';
    });
    legendItems.forEach(item => item.classList.remove('active','dimmed-item'));
  }
}

// ── HEX → RGB helper (used by donut popup gradient) ──────────
function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

// ── SALES BAR CHART ───────────────────────────────────────────
function buildSalesBar(cvtSources, gridColor, tickColor) {
  const validCvt = cvtSources.filter(s => s.gs > 0).sort((a,b) => b.gs - a.gs);

  const canvas = document.getElementById('salesBar');
  const cardEl = canvas ? canvas.closest('.chart-card') : null;

  // ── Custom HTML legend (replaces built-in so clicks stay separate) ──
  const oldLegend = cardEl && cardEl.querySelector('.sales-custom-legend');
  if (oldLegend) oldLegend.remove();

  if (cardEl) {
    const legendWrap = document.createElement('div');
    legendWrap.className = 'sales-custom-legend';
    legendWrap.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:center',
      'gap:1.2rem', 'margin-bottom:0.6rem', 'position:relative', 'z-index:10'
    ].join(';');

    const datasets = [
      { label: 'Gross Sales (₱)', color: 'rgba(230,112,38,0.85)', idx: 0 },
      { label: 'GK Value (₱)',    color: 'rgba(113,112,116,0.6)',  idx: 1 },
    ];

    datasets.forEach(({ label, color, idx }) => {
      const btn = document.createElement('button');
      btn.dataset.dsIdx = idx;
      btn.style.cssText = [
        'display:flex', 'align-items:center', 'gap:0.45rem',
        'background:transparent', 'border:1px solid rgba(113,112,116,0.25)',
        'border-radius:6px', 'padding:0.3rem 0.75rem', 'cursor:pointer',
        'transition:border-color 0.2s,opacity 0.2s',
        'font-family:Montserrat,sans-serif', 'font-size:0.68rem',
        'font-weight:600', `color:${tickColor}`,
        'letter-spacing:0.05em', 'white-space:nowrap',
      ].join(';');

      const swatch = document.createElement('span');
      swatch.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:3px;background:${color};flex-shrink:0;`;
      btn.appendChild(swatch);
      btn.appendChild(document.createTextNode(label));
      legendWrap.appendChild(btn);

      btn.addEventListener('click', function(e) {
        e.stopPropagation(); // never reaches the card click handler
        const ch = btn._salesChart;
        if (!ch) return;
        if (ch.isDatasetVisible(idx)) {
          ch.hide(idx);
          btn.style.opacity = '0.4';
          btn.style.borderColor = 'rgba(113,112,116,0.15)';
        } else {
          ch.show(idx);
          btn.style.opacity = '1';
          btn.style.borderColor = 'rgba(113,112,116,0.25)';
        }
      });
    });

    cardEl.insertBefore(legendWrap, canvas);
  }

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: validCvt.map(s => s.name),
      datasets: [
        {
          label: 'Gross Sales (₱)',
          data: validCvt.map(s => s.gs),
          backgroundColor: 'rgba(230,112,38,0.85)',
          borderRadius: 5,
        },
        {
          label: 'GK Value (₱)',
          data: validCvt.map(s => s.gk),
          backgroundColor: 'rgba(113,112,116,0.6)',
          borderRadius: 5,
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } }, // built-in legend disabled
      scales: {
        x: { ticks: { color: tickColor, font: { size: 9 } }, grid: { color: gridColor } },
        y: {
          ticks: { color: tickColor, callback: v => '₱' + (v/1000000).toFixed(1) + 'M' },
          grid: { color: gridColor }
        }
      },
      animation: { duration: 1400, easing: 'easeOutQuart' },
      onClick(evt) {
        const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
        if (!points.length) return;
        const src = validCvt[points[0].index];
        if (src && window._dpOpenPreview && window._dpBuildSalesContext) {
          window._dpOpenPreview(window._dpBuildSalesContext(src));
        }
      }
    }
  });

  // Wire chart reference into each legend button
  if (cardEl) {
    cardEl.querySelectorAll('.sales-custom-legend button').forEach(btn => {
      btn._salesChart = chart;
    });
  }

  canvas.style.cursor = 'pointer';
  return chart;
}

// ── REP BAR CHART ─────────────────────────────────────────────
function buildRepBar(reps, gridColor, tickColor) {
  const sortedReps = [...reps].sort((a,b) => b.count - a.count);

  // Dynamically compute left padding so all names are fully visible.
  // Measure longest name at the label font size (10px Montserrat ≈ 6px/char).
  const longestName = sortedReps.reduce((max, r) => Math.max(max, r.name.length), 0);
  const yPadLeft = Math.max(60, longestName * 7 + 16); // px

  // Also set canvas height proportional to number of reps so bars never crush
  const canvas = document.getElementById('repBar');
  const isMobile = window.innerWidth <= 768;
  const minBarHeight = isMobile ? 36 : 28; // px per bar
  const desiredH = Math.max(220, sortedReps.length * minBarHeight + 40);
  if (isMobile) {
    canvas.style.height = desiredH + 'px';
    canvas.style.maxHeight = 'none';
  } else {
    canvas.style.maxHeight = desiredH + 'px';
  }

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sortedReps.map(r => r.name),
      datasets: [{
        data: sortedReps.map(r => r.count),
        backgroundColor: sortedReps.map((_, i) =>
          i < Math.max(1, Math.ceil(sortedReps.length * 0.2))
            ? '#e67026'
            : 'rgba(113,112,116,0.5)'
        ),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      layout: { padding: { left: 0 } },
      scales: {
        x: {
          ticks: { color: tickColor },
          grid: { color: gridColor }
        },
        y: {
          ticks: {
            color: tickColor,
            font: { size: 11, family: 'Montserrat' },
            autoSkip: !isMobile,
            maxTicksLimit: isMobile ? sortedReps.length : undefined,
            // Never truncate — always show the full name
            callback: function(value, index) {
              return sortedReps[index] ? sortedReps[index].name : value;
            }
          },
          grid: { color: gridColor },
          afterFit(scale) {
            // Force the y-axis to be wide enough for the longest label
            scale.width = yPadLeft;
          }
        }
      },
      animation: { duration: 1200, easing: 'easeOutQuart' },
      onClick(evt) {
        const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
        if (!points.length) return;
        const idx  = points[0].index;
        const rep  = sortedReps[idx];
        if (rep && window._dpOpenPreview && window._dpBuildRepContext) {
          window._dpOpenPreview(window._dpBuildRepContext(rep.name, rep.count, idx + 1));
        }
      }
    }
  });
  canvas.style.cursor = 'pointer';
  return chart;
}

// ── REFRESH CHART COLORS (for dark/light toggle) ──────────────
function refreshChartColors(chartsObj, tickColor, gridColor) {
  Chart.defaults.color = tickColor;
  Object.values(chartsObj).forEach(chart => {
    if (chart.options.scales) {
      Object.values(chart.options.scales).forEach(scale => {
        if (scale.ticks) scale.ticks.color = tickColor;
        if (scale.grid) scale.grid.color = gridColor;
      });
    }
    if (chart.options.plugins && chart.options.plugins.legend &&
        chart.options.plugins.legend.display !== false) {
      chart.options.plugins.legend.labels = { color: tickColor };
    }
    chart.update();
  });
  // Update custom HTML legend button text color on theme toggle
  document.querySelectorAll('.sales-custom-legend button').forEach(btn => {
    btn.style.color = tickColor;
  });
}
