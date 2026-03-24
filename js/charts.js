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
  return new Chart(document.getElementById('sourceBar'), {
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
      animation: { duration: 1200, easing: 'easeOutQuart' }
    }
  });
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
    path.addEventListener('click',      () => toggleSegment(i));

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
    item.addEventListener('click',      () => toggleSegment(i));
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

// ── SALES BAR CHART ───────────────────────────────────────────
function buildSalesBar(cvtSources, gridColor, tickColor) {
  const validCvt = cvtSources.filter(s => s.gs > 0).sort((a,b) => b.gs - a.gs);
  return new Chart(document.getElementById('salesBar'), {
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
      plugins: { legend: { labels: { color: '#a6a6a8' } } },
      scales: {
        x: { ticks: { color: tickColor, font: { size: 9 } }, grid: { color: gridColor } },
        y: {
          ticks: {
            color: tickColor,
            callback: v => '₱' + (v/1000000).toFixed(1) + 'M'
          },
          grid: { color: gridColor }
        }
      },
      animation: { duration: 1400, easing: 'easeOutQuart' }
    }
  });
}

// ── REP BAR CHART ─────────────────────────────────────────────
function buildRepBar(reps, gridColor, tickColor) {
  const sortedReps = [...reps].sort((a,b) => b.count - a.count);
  return new Chart(document.getElementById('repBar'), {
    type: 'bar',
    data: {
      labels: sortedReps.map(r => r.name),
      datasets: [{
        data: sortedReps.map(r => r.count),
        backgroundColor: sortedReps.map((_, i) => i < Math.max(1, Math.ceil(sortedReps.length * 0.2)) ? '#e67026' : 'rgba(113,112,116,0.5)'),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tickColor }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } }
      },
      animation: { duration: 1200, easing: 'easeOutQuart' }
    }
  });
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
    if (chart.options.plugins && chart.options.plugins.legend) {
      chart.options.plugins.legend.labels = { color: tickColor };
    }
    chart.update();
  });
}
