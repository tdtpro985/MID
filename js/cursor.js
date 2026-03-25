/* ═══════════════════════════════════════════════════════════
   POWERSTEEL – cursor.js
   Minimal dot cursor with orange trailing particles
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const TRAIL_COUNT  = 10;   // number of trail particles
  const TRAIL_EASE   = 0.14; // how much each particle lags (lower = more lag)
  const OUTLINE_EASE = 0.10; // ring lags even more

  // ── Create DOM elements ───────────────────────────────────
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  document.body.appendChild(dot);

  const outline = document.createElement('div');
  outline.className = 'cursor-outline';
  document.body.appendChild(outline);

  // Trail particles: each one slightly smaller and more transparent
  const trail = [];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const t = document.createElement('div');
    t.className = 'cursor-trail';
    const progress = (i + 1) / TRAIL_COUNT;         // 0 = oldest, 1 = newest
    const size = Math.round(2 + progress * 4);       // 2px → 6px
    const opacity = progress * 0.35;                 // faint → slightly less faint
    t.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      opacity: ${opacity};
    `;
    document.body.appendChild(t);
    trail.push({ el: t, x: -100, y: -100 });
  }

  // ── State ─────────────────────────────────────────────────
  let mx = -100, my = -100;    // raw mouse
  let dx = -100, dy = -100;    // dot position (snaps immediately)
  let ox = -100, oy = -100;    // outline position (lagged)

  // ── Mouse tracking ────────────────────────────────────────
  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
  });

  document.addEventListener('mouseenter', () => {
    dot.style.opacity     = '1';
    outline.style.opacity = '1';
  });

  document.addEventListener('mouseleave', () => {
    dot.style.opacity     = '0';
    outline.style.opacity = '0';
    trail.forEach(t => { t.el.style.opacity = '0'; });
  });

  // ── Hover state ───────────────────────────────────────────
  const interactiveSelectors = 'a, button, [role="button"], input, select, textarea, label, .upload-zone, .upload-btn, .back-btn, .present-btn, .source-card, .kpi-card, .donut-legend-item, .donut-seg, .upload-history-item, .history-trigger-btn, .history-drawer-tab, .mode-toggle, .mode-toggle-inline';

  document.addEventListener('mouseover', e => {
    if (e.target.closest(interactiveSelectors)) {
      document.body.classList.add('cursor-hover');
    }
  });

  document.addEventListener('mouseout', e => {
    if (e.target.closest(interactiveSelectors)) {
      document.body.classList.remove('cursor-hover');
    }
  });

  // ── Click state ───────────────────────────────────────────
  document.addEventListener('mousedown', () => {
    document.body.classList.add('cursor-click');
  });
  document.addEventListener('mouseup', () => {
    document.body.classList.remove('cursor-click');
  });

  // ── Animation loop ────────────────────────────────────────
  function lerp(a, b, t) { return a + (b - a) * t; }

  function tick() {
    // Dot snaps immediately
    dx = mx;
    dy = my;
    dot.style.transform = `translate(calc(${dx}px - 50%), calc(${dy}px - 50%))`;

    // Outline lags behind
    ox = lerp(ox, mx, OUTLINE_EASE);
    oy = lerp(oy, my, OUTLINE_EASE);
    outline.style.transform = `translate(calc(${ox}px - 50%), calc(${oy}px - 50%))`;

    // Trail: each particle chases the one ahead of it
    // trail[0] is oldest (most lagged), trail[TRAIL_COUNT-1] is newest (closest to dot)
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const t = trail[i];
      const targetX = i === TRAIL_COUNT - 1 ? dx : trail[i + 1].x;
      const targetY = i === TRAIL_COUNT - 1 ? dy : trail[i + 1].y;
      t.x = lerp(t.x, targetX, TRAIL_EASE + (i / TRAIL_COUNT) * 0.18);
      t.y = lerp(t.y, targetY, TRAIL_EASE + (i / TRAIL_COUNT) * 0.18);
      t.el.style.transform = `translate(calc(${t.x}px - 50%), calc(${t.y}px - 50%))`;
    }

    requestAnimationFrame(tick);
  }

  tick();

})();
