/* ═══════════════════════════════════════════════════════════
   POWERSTEEL – data-preview.js
   Clickable data cards → modal preview → save as image
   Depends on: html2canvas (loaded on demand), dashboard data
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── html2canvas loader ────────────────────────────────── */
  function loadHtml2Canvas(cb) {
    if (window.html2canvas) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  /* ── Modal DOM (created once) ───────────────────────────── */
  let _modalEl = null;
  let _currentCtx = null;  // { type, data, title, subtitle }

  function ensureModal() {
    if (_modalEl) return;

    _modalEl = document.createElement('div');
    _modalEl.id = 'dpModal';
    _modalEl.className = 'dp-modal-overlay';
    _modalEl.innerHTML = `
      <div class="dp-modal" id="dpModalBox">
        <div class="dp-modal-header">
          <div class="dp-modal-title-group">
            <div class="dp-modal-eyebrow" id="dpEyebrow">DETAIL VIEW</div>
            <div class="dp-modal-title" id="dpTitle">—</div>
            <div class="dp-modal-subtitle" id="dpSubtitle">—</div>
          </div>
          <div class="dp-modal-actions">
            <button class="dp-btn dp-btn-share" id="dpShareBtn" title="Save as Image">
              <svg viewBox="0 0 24 24"><path d="M17 12l-5-5-5 5h3v4h4v-4h3zM5 19h14v2H5z"/></svg>
              <span>Save Image</span>
            </button>
            <button class="dp-btn dp-btn-close" id="dpCloseBtn" title="Close">
              <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>
        <div class="dp-modal-body" id="dpBody"></div>
        <div class="dp-modal-footer" id="dpFooter">
          <span class="dp-footer-brand">TDT POWERSTEEL · Marketing Intelligence</span>
          <span class="dp-footer-date" id="dpFooterDate"></span>
        </div>
      </div>
    `;

    document.body.appendChild(_modalEl);

    /* Close on overlay click */
    _modalEl.addEventListener('click', e => {
      if (e.target === _modalEl) closePreviewModal();
    });

    document.getElementById('dpCloseBtn').addEventListener('click', closePreviewModal);
    document.getElementById('dpShareBtn').addEventListener('click', saveAsImage);

    /* Keyboard ESC */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _modalEl.classList.contains('dp-open')) closePreviewModal();
    });
  }

  /* ── Open / Close ───────────────────────────────────────── */
  function openPreviewModal(ctx) {
    ensureModal();
    _currentCtx = ctx;

    document.getElementById('dpEyebrow').textContent   = ctx.eyebrow  || 'DETAIL VIEW';
    document.getElementById('dpTitle').textContent     = ctx.title    || '—';
    document.getElementById('dpSubtitle').textContent  = ctx.subtitle || '';
    document.getElementById('dpBody').innerHTML        = ctx.bodyHTML;
    document.getElementById('dpFooterDate').textContent =
      new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

    _modalEl.classList.add('dp-open');
    document.body.style.overflow = 'hidden';

    /* Animate bars / fills inside the modal after paint */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.querySelectorAll('.dp-bar-fill[data-w]').forEach(el => {
          el.style.width = el.dataset.w;
        });
        document.querySelectorAll('.dp-count-up[data-val]').forEach(el => {
          animateCount(el, parseInt(el.dataset.val));
        });
      });
    });
  }

  function closePreviewModal() {
    if (!_modalEl) return;
    _modalEl.classList.remove('dp-open');
    document.body.style.overflow = '';
  }

  /* ── Count-up animation ─────────────────────────────────── */
  function animateCount(el, target) {
    const dur = 900, start = performance.now();
    const from = 0;
    function step(now) {
      const p = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (target - from) * ease).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── Save as image ──────────────────────────────────────── */
  function saveAsImage() {
    const box = document.getElementById('dpModalBox');
    const btn = document.getElementById('dpShareBtn');

    btn.classList.add('dp-btn-loading');
    btn.querySelector('span').textContent = 'Capturing…';

    loadHtml2Canvas(() => {
      const isLight = document.body.classList.contains('light-mode');
      html2canvas(box, {
        scale: 2,
        useCORS: true,
        backgroundColor: isLight ? '#f2f1ef' : '#1a1917',
        logging: false,
        allowTaint: true,
      }).then(canvas => {
        const link = document.createElement('a');
        const slug = (_currentCtx.title || 'powersteel-data')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        link.download = `powersteel-${slug}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        btn.classList.remove('dp-btn-loading');
        btn.querySelector('span').textContent = '✓ Saved!';
        setTimeout(() => { btn.querySelector('span').textContent = 'Save Image'; }, 2000);
      }).catch(err => {
        console.error('html2canvas error', err);
        btn.classList.remove('dp-btn-loading');
        btn.querySelector('span').textContent = 'Save Image';
      });
    });
  }

  /* ═══════════════════════════════════════════════════════
     CONTEXT BUILDERS — one per card / row type
     ═══════════════════════════════════════════════════════ */

  /* ── KPI Card ───────────────────────────────────────────── */
  function buildKpiContext(label, value, sub) {
    const md = window._pvData;
    const total = md ? md.sources.reduce((s, r) => s + r.count, 0) : 0;

    // Build a small sparkline-like bar comparing this KPI in context
    const relatedRows = (md && md.sources)
      ? [...md.sources].sort((a, b) => b.count - a.count).slice(0, 8)
      : [];
    const max = relatedRows.length ? Math.max(...relatedRows.map(s => s.count)) : 1;

    const barsHTML = relatedRows.length ? `
      <div class="dp-section-label">Lead Source Breakdown</div>
      <div class="dp-bar-list">
        ${relatedRows.map(s => `
          <div class="dp-bar-row">
            <div class="dp-bar-name">${s.name}</div>
            <div class="dp-bar-track">
              <div class="dp-bar-fill" data-w="${Math.round(s.count/max*100)}%" style="width:0%"></div>
            </div>
            <div class="dp-bar-num dp-count-up" data-val="${s.count}">0</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    return {
      eyebrow: 'KPI METRIC',
      title: label,
      subtitle: sub,
      bodyHTML: `
        <div class="dp-hero-stat">
          <div class="dp-hero-val">${value}</div>
          <div class="dp-hero-label">${label}</div>
          ${total ? `<div class="dp-hero-context">Total leads in period: <strong>${total.toLocaleString()}</strong></div>` : ''}
        </div>
        ${barsHTML}
      `
    };
  }

  /* ── Source Card ────────────────────────────────────────── */
  function buildSourceContext(srcName, srcCount) {
    const md = window._pvData;
    const allSources = md ? [...md.sources].sort((a, b) => b.count - a.count) : [];
    const total      = allSources.reduce((s, r) => s + r.count, 0);
    const rank       = allSources.findIndex(s => s.name === srcName) + 1;
    const pct        = total ? ((srcCount / total) * 100).toFixed(1) : '0.0';
    const max        = allSources.length ? allSources[0].count : 1;

    // Find CVT data for this source
    const cvt = (md && md.cvtSources)
      ? md.cvtSources.find(c => c.name === srcName)
      : null;

    const cvtHTML = cvt ? `
      <div class="dp-two-col">
        <div class="dp-stat-box">
          <div class="dp-stat-box-val">₱${(cvt.gs/1000000).toFixed(2)}M</div>
          <div class="dp-stat-box-lbl">Gross Sales</div>
        </div>
        <div class="dp-stat-box">
          <div class="dp-stat-box-val">₱${(cvt.gk/1000000).toFixed(2)}M</div>
          <div class="dp-stat-box-lbl">GK Value</div>
        </div>
      </div>
    ` : '';

    return {
      eyebrow: 'LEAD SOURCE',
      title: srcName,
      subtitle: `Rank #${rank} of ${allSources.length} sources`,
      bodyHTML: `
        <div class="dp-hero-stat">
          <div class="dp-hero-val dp-count-up" data-val="${srcCount}">0</div>
          <div class="dp-hero-label">Leads from this source</div>
          <div class="dp-hero-context">
            <strong>${pct}%</strong> of all ${total.toLocaleString()} leads
          </div>
        </div>
        ${cvtHTML}
        <div class="dp-section-label">vs All Sources</div>
        <div class="dp-bar-list">
          ${allSources.map(s => `
            <div class="dp-bar-row${s.name === srcName ? ' dp-bar-row-active' : ''}">
              <div class="dp-bar-name">${s.name}</div>
              <div class="dp-bar-track">
                <div class="dp-bar-fill${s.name === srcName ? ' dp-bar-fill-accent' : ''}"
                     data-w="${Math.round(s.count/max*100)}%" style="width:0%"></div>
              </div>
              <div class="dp-bar-num dp-count-up" data-val="${s.count}">0</div>
            </div>
          `).join('')}
        </div>
      `
    };
  }

  /* ── Rep Table Row ──────────────────────────────────────── */
  function buildRepContext(repName, repCount, rank) {
    const md  = window._pvData;
    const reps = md ? [...md.reps].sort((a, b) => b.count - a.count) : [];
    const total = reps.reduce((s, r) => s + r.count, 0);
    const pct  = total ? ((repCount / total) * 100).toFixed(1) : '0.0';
    const max  = reps.length ? reps[0].count : 1;
    const isTop = rank <= Math.max(1, Math.ceil(reps.length * 0.2));

    const medalHTML = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

    return {
      eyebrow: 'SALES REPRESENTATIVE',
      title: repName,
      subtitle: isTop ? '⭐ Top Performer' : `Rank ${medalHTML} of ${reps.length} reps`,
      bodyHTML: `
        <div class="dp-hero-stat">
          <div class="dp-hero-val dp-count-up" data-val="${repCount}">0</div>
          <div class="dp-hero-label">Leads handled</div>
          <div class="dp-hero-context">
            <strong>${pct}%</strong> of all ${total.toLocaleString()} rep entries · Rank <strong>${medalHTML}</strong>
          </div>
        </div>
        <div class="dp-section-label">Team Leaderboard</div>
        <div class="dp-bar-list">
          ${reps.map((r, i) => `
            <div class="dp-bar-row${r.name === repName ? ' dp-bar-row-active' : ''}">
              <div class="dp-bar-name">
                <span class="dp-rank-badge">${i+1}</span>${r.name}
              </div>
              <div class="dp-bar-track">
                <div class="dp-bar-fill${r.name === repName ? ' dp-bar-fill-accent' : ''}"
                     data-w="${Math.round(r.count/max*100)}%" style="width:0%"></div>
              </div>
              <div class="dp-bar-num dp-count-up" data-val="${r.count}">0</div>
            </div>
          `).join('')}
        </div>
      `
    };
  }

  /* ── Sales / CVT Source ─────────────────────────────────── */
  function buildSalesContext(cvtSrc) {
    const md = window._pvData;
    const allCvt = md ? [...md.cvtSources].filter(c => c.gs > 0).sort((a,b) => b.gs - a.gs) : [];
    const rank   = allCvt.findIndex(c => c.name === cvtSrc.name) + 1;
    const totalGS = allCvt.reduce((s, c) => s + c.gs, 0);
    const pct     = totalGS ? ((cvtSrc.gs / totalGS) * 100).toFixed(1) : '0.0';
    const maxGS   = allCvt.length ? allCvt[0].gs : 1;

    function fmtP(v) {
      if (!v) return '—';
      if (v >= 1e6) return '₱' + (v/1e6).toFixed(2) + 'M';
      if (v >= 1e3) return '₱' + (v/1e3).toFixed(1) + 'K';
      return '₱' + v.toLocaleString();
    }

    return {
      eyebrow: 'CONVERTED SALES SOURCE',
      title: cvtSrc.name,
      subtitle: `Rank #${rank} of ${allCvt.length} converted sources`,
      bodyHTML: `
        <div class="dp-hero-stat">
          <div class="dp-hero-val">${fmtP(cvtSrc.gs)}</div>
          <div class="dp-hero-label">Gross Sales</div>
          <div class="dp-hero-context">
            <strong>${pct}%</strong> of total ₱${(totalGS/1e6).toFixed(2)}M converted sales
          </div>
        </div>
        <div class="dp-two-col">
          <div class="dp-stat-box">
            <div class="dp-stat-box-val">${fmtP(cvtSrc.gs)}</div>
            <div class="dp-stat-box-lbl">Gross Sales</div>
          </div>
          <div class="dp-stat-box">
            <div class="dp-stat-box-val">${fmtP(cvtSrc.gk)}</div>
            <div class="dp-stat-box-lbl">GK Value</div>
          </div>
        </div>
        <div class="dp-section-label">vs All Converted Sources</div>
        <div class="dp-bar-list">
          ${allCvt.map(c => `
            <div class="dp-bar-row${c.name === cvtSrc.name ? ' dp-bar-row-active' : ''}">
              <div class="dp-bar-name">${c.name}</div>
              <div class="dp-bar-track">
                <div class="dp-bar-fill${c.name === cvtSrc.name ? ' dp-bar-fill-accent' : ''}"
                     data-w="${Math.round(c.gs/maxGS*100)}%" style="width:0%"></div>
              </div>
              <div class="dp-bar-num">${fmtP(c.gs)}</div>
            </div>
          `).join('')}
        </div>
      `
    };
  }

  /* ═══════════════════════════════════════════════════════
     CLICK BINDING — called after dashboard renders
     ═══════════════════════════════════════════════════════ */

  function bindClickableCards() {

    /* Tag Chart.js canvases' parent cards */
    ['sourceBar', 'salesBar', 'repBar'].forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        const card = canvas.closest('.chart-card');
        if (card) card.classList.add('dp-clickable-chart');
      }
    });

    /* KPI cards */
    document.querySelectorAll('.kpi-card').forEach(card => {
      if (card.dataset.dpBound) return;
      card.dataset.dpBound = '1';
      card.style.cursor = 'pointer';

      /* Add a subtle "tap to preview" hint */
      const hint = document.createElement('div');
      hint.className = 'dp-card-hint';
      hint.textContent = 'Click for details';
      card.appendChild(hint);

      card.addEventListener('click', () => {
        const label = card.querySelector('.kpi-label')?.textContent?.trim() || '';
        const value = card.querySelector('.kpi-value')?.textContent?.trim() || '';
        const sub   = card.querySelector('.kpi-sub')?.textContent?.trim() || '';
        openPreviewModal(buildKpiContext(label, value, sub));
      });
    });

    /* Source cards */
    document.querySelectorAll('.source-card').forEach(card => {
      if (card.dataset.dpBound) return;
      card.dataset.dpBound = '1';
      card.style.cursor = 'pointer';

      const hint = document.createElement('div');
      hint.className = 'dp-card-hint';
      hint.textContent = 'Click for details';
      card.appendChild(hint);

      card.addEventListener('click', () => {
        const name  = card.querySelector('.src-name')?.textContent?.trim() || '';
        const count = parseInt(card.querySelector('.src-val')?.textContent || '0');
        openPreviewModal(buildSourceContext(name, count));
      });
    });

    /* Rep table rows */
    document.querySelectorAll('#repTableBody tr').forEach((tr, idx) => {
      if (tr.dataset.dpBound) return;
      tr.dataset.dpBound = '1';
      tr.style.cursor = 'pointer';

      const hint = document.createElement('td');
      hint.className = 'dp-table-hint-cell';
      hint.innerHTML = '<span class="dp-table-hint">View →</span>';
      tr.appendChild(hint);

      tr.addEventListener('click', () => {
        const cells  = tr.querySelectorAll('td');
        const rank   = parseInt(cells[0]?.textContent) || idx + 1;
        const name   = cells[1]?.textContent?.trim() || '';
        const count  = parseInt((cells[2]?.textContent || '').replace(/,/g, '')) || 0;
        openPreviewModal(buildRepContext(name, count, rank));
      });
    });
  }

  /* ── Patch rep table header to show 5th column ─────────── */
  function patchRepTableHeader() {
    const thead = document.querySelector('#dashboard table thead tr');
    if (!thead || thead.dataset.dpPatched) return;
    thead.dataset.dpPatched = '1';
    const th = document.createElement('th');
    th.textContent = '';
    th.style.width = '60px';
    thead.appendChild(th);
  }

  /* ── Observe dashboard for new renders ──────────────────── */
  const _observer = new MutationObserver(() => {
    const dash = document.getElementById('dashboard');
    if (dash && dash.classList.contains('visible')) {
      patchRepTableHeader();
      bindClickableCards();
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });

  /* Initial bind in case dashboard is already visible */
  document.addEventListener('DOMContentLoaded', () => {
    bindClickableCards();
  });

  /* Expose for external use */
  window._dpOpenPreview        = openPreviewModal;
  window._dpClose              = closePreviewModal;
  window._dpBuildRepContext    = buildRepContext;
  window._dpBuildSourceContext = buildSourceContext;
  window._dpBuildSalesContext  = buildSalesContext;

})();
