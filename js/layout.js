// ======================================================================
// layout.js — Page chrome: filter-bar highlighting, sidebar, view switching, theme.
// ======================================================================
/* ---------------- filter bars: highlight the filters that are in use ---------------- */
// marks every control that is set to something other than its default ('' or 'all') and keeps a count on the Clear button
function syncFilterBars() {
  document.querySelectorAll('.filter-bar').forEach(bar => {
    let active = 0;
    bar.querySelectorAll(':scope > input, :scope > select').forEach(el => {
      const on = el.value !== '' && el.value !== 'all';
      el.classList.toggle('is-active', on);
      if (on)
        active++;
    });
    bar.querySelectorAll('.filter-range').forEach(group => {
      const on = Array.from(group.querySelectorAll('input')).some(i => i.value !== '');
      group.classList.toggle('is-active', on);
      if (on)
        active++;
    });
    const clearBtn = bar.querySelector('.filter-clear');
    if (clearBtn)
      clearBtn.dataset.n = String(active);
  });
}
['input', 'change'].forEach(evt => document.addEventListener(evt, e => {
  if (e.target.closest && e.target.closest('.filter-bar'))
    syncFilterBars();
}));
syncFilterBars();
/* ---------------- navigation ---------------- */
// open/close the mobile sidebar and keep its backdrop in sync
function setSidebarOpen(isOpen) {
  document.getElementById('sidebar').classList.toggle('open', isOpen);
  document.getElementById('sidebarBackdrop').classList.toggle('show', isOpen);
}
document.querySelectorAll('.nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
    setSidebarOpen(false);
    if (btn.dataset.view === 'dashboard')
      renderDashboard();
    if (btn.dataset.view === 'trades')
      renderTrades();
    if (btn.dataset.view === 'ledger')
      renderLedger();
    if (btn.dataset.view === 'calendar')
      renderCalendar();
    if (btn.dataset.view === 'reports')
      renderReports();
    if (btn.dataset.view === 'risk')
      renderRisk();
    if (btn.dataset.view === 'charges')
      renderCharges();
  });
});
// Settings lives in the sidebar footer, so wire it into the same view navigation.
const settingsNavBtn = document.querySelector('.settings-nav-btn[data-view="settings"]');
if (settingsNavBtn) {
  settingsNavBtn.addEventListener('click', () => {
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
    settingsNavBtn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const settingsView = document.getElementById('view-settings');
    if (settingsView) settingsView.classList.add('active');
    renderBrokerSettings();
    if (typeof renderSettingsPage === 'function') renderSettingsPage();
    setSidebarOpen(false);
  });
}
// tapping the dimmed backdrop closes the sidebar, like tapping outside it
document.getElementById('sidebarBackdrop').addEventListener('click', () => setSidebarOpen(false));
// desktop: collapse the sidebar to free up screen space, via the single fixed toggle button
function setSidebarCollapsed(isCollapsed) {
  const app = document.querySelector('.app');
  app.classList.toggle('sidebar-collapsed', isCollapsed);
  if (!isCollapsed)
    app.classList.remove('sidebar-peek');
}
const isDesktop = () => window.matchMedia('(min-width: 601px)').matches;   // tablet and computer use the desktop sidebar
// one fixed button on every screen size: pins/unpins the sidebar on desktop, opens/closes it on mobile
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
sidebarToggleBtn.addEventListener('click', () => {
  if (isDesktop())
    setSidebarCollapsed(!document.querySelector('.app').classList.contains('sidebar-collapsed'));
  else
    setSidebarOpen(!document.getElementById('sidebar').classList.contains('open'));
});
// small-screen edge tab: same open/close behavior as the toggle button, just a different handle
document.getElementById('sidebarEdgeTab').addEventListener('click', () => {
  setSidebarOpen(!document.getElementById('sidebar').classList.contains('open'));
});
// desktop only: while collapsed, hovering the toggle button (or the sidebar itself, so the mouse
// can travel between them) peeks the sidebar open as an overlay; leaving both hides it again shortly after
let sidebarPeekHideTimer = null;
function peekSidebarShow() {
  const app = document.querySelector('.app');
  if (!isDesktop() || !app.classList.contains('sidebar-collapsed'))
    return;
  clearTimeout(sidebarPeekHideTimer);
  app.classList.add('sidebar-peek');
}
function peekSidebarHide() {
  clearTimeout(sidebarPeekHideTimer);
  sidebarPeekHideTimer = setTimeout(() => document.querySelector('.app').classList.remove('sidebar-peek'), 200);
}
sidebarToggleBtn.addEventListener('mouseenter', peekSidebarShow);
sidebarToggleBtn.addEventListener('mouseleave', peekSidebarHide);
const sidebarEl = document.getElementById('sidebar');
sidebarEl.addEventListener('mouseenter', peekSidebarShow);
sidebarEl.addEventListener('mouseleave', peekSidebarHide);

// Desktop edge reveal: moving the pointer into the extreme left edge opens the
// collapsed sidebar. The sidebar itself then owns the hover state, and leaving
// it hides the peek again.
const sidebarEdgeHoverZone = document.getElementById('sidebarEdgeHoverZone');
if (sidebarEdgeHoverZone) {
  sidebarEdgeHoverZone.addEventListener('mouseenter', peekSidebarShow);
  sidebarEdgeHoverZone.addEventListener('mouseleave', peekSidebarHide);
}
// programmatically switch to a given nav view
function switchView(view) {
  const btn = document.querySelector('.nav button[data-view="' + view + '"]');
  if (btn)
    btn.click();
}
/* ---------------- theme ---------------- */
const PALETTES = [
  { id: 'ocean', name: 'Ocean', bg: '#0b0f14', card: '#161d28', accent: '#5b8def' },
  { id: 'midnight', name: 'Midnight', bg: '#070c1a', card: '#121b35', accent: '#38bdf8' },
  { id: 'violet', name: 'Violet', bg: '#0e0c16', card: '#1b182b', accent: '#8b7cf6' },
  { id: 'teal', name: 'Teal', bg: '#090f10', card: '#142020', accent: '#2bb5a6' },
  { id: 'amber', name: 'Amber', bg: '#100e0a', card: '#1d1a13', accent: '#e0a030' },
  { id: 'rose', name: 'Rose', bg: '#130b0f', card: '#22171d', accent: '#e5688a' },
  { id: 'terracotta', name: 'Terracotta', bg: '#0d0c0a', card: '#1c1a17', accent: '#da7756' },
  { id: 'graphite', name: 'Graphite', bg: '#0a0a0b', card: '#19191c', accent: '#cbd5e1' }
];
let currentPalette = 'ocean';
const DENSITIES = ['normal', 'slim', 'xslim'];
let currentDensity = 'slim';
// apply + persist the layout density (sets <html data-density>; rules live in css/28-slim.css)
function applyDensity(d) {
  if (!DENSITIES.includes(d)) d = 'slim';
  currentDensity = d;
  try { localStorage.setItem('tb_density', d); } catch (e) {}
  applyEffectiveDensity();
  syncAppearanceUI();
}
// Density actually used right now = the shown page's own choice (Settings → Page density), else the global one.
// <html data-density> drives all page styling; <html data-chrome-density> (global) keeps the sidebar steady.
function activeViewKey() {
  const v = document.querySelector('.view.active');
  return v ? v.id.replace(/^view-/, '') : 'dashboard';
}
function effectiveDensityFor(view) {
  const o = (typeof PREFS !== 'undefined' && PREFS.pageDensity) ? PREFS.pageDensity[view] : null;
  return DENSITIES.includes(o) ? o : currentDensity;
}
function applyEffectiveDensity() {
  const root = document.documentElement;
  const eff = effectiveDensityFor(activeViewKey());
  const changed = root.getAttribute('data-density') !== eff;
  root.setAttribute('data-chrome-density', currentDensity);
  root.setAttribute('data-density', eff);
  if (changed)   // sizes changed: let sticky bars / tables re-measure and charts redraw at their new height
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}
// re-apply whenever another page becomes the visible one (whatever code switched it)
document.querySelectorAll('.view').forEach(v =>
  new MutationObserver(() => { if (v.classList.contains('active')) applyEffectiveDensity(); })
    .observe(v, { attributes: true, attributeFilter: ['class'] }));
// apply + persist a colour palette (sets <html data-palette>)
function applyPalette(id) {
  if (!PALETTES.some(p => p.id === id)) id = 'ocean';
  currentPalette = id;
  if (id === 'ocean') document.documentElement.removeAttribute('data-palette');
  else document.documentElement.setAttribute('data-palette', id);
  try { localStorage.setItem('tb_palette', id); } catch (e) {}
  syncAppearanceUI();
  if (typeof refreshChartsTheme === 'function') refreshChartsTheme();
}
// highlight the active mode button and palette swatch in Settings → Appearance
function syncAppearanceUI() {
  document.querySelectorAll('#modeSwitch button').forEach(b => b.classList.toggle('active', b.dataset.mode === currentTheme));
  document.querySelectorAll('#densitySwitch button').forEach(b => b.classList.toggle('active', b.dataset.density === currentDensity));
  document.querySelectorAll('#paletteGrid .palette-swatch').forEach(b => b.classList.toggle('active', b.dataset.id === currentPalette));
  if (typeof syncPrefsUI === 'function') syncPrefsUI();
}
function buildAppearanceUI() {
  const grid = document.getElementById('paletteGrid');
  if (!grid) return;
  grid.innerHTML = PALETTES.map(p => `<button type="button" class="palette-swatch" data-id="${p.id}" title="${p.name}">
    <div class="palette-preview" style="background:${p.bg}"><i style="background:${p.card}"></i><i style="background:${p.accent}"></i><i style="background:#2fb170"></i><i style="background:#e5534b"></i></div>${p.name}</button>`).join('');
  grid.addEventListener('click', e => { const b = e.target.closest('.palette-swatch'); if (b) applyPalette(b.dataset.id); });
  document.getElementById('densitySwitch').addEventListener('click', e => { const b = e.target.closest('button[data-density]'); if (b) applyDensity(b.dataset.density); });
  document.getElementById('modeSwitch').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b) applyTheme(b.dataset.mode); });
  syncAppearanceUI();
}

// apply and persist the light/dark theme
function applyTheme(t) {
  currentTheme = t;
  if (t === 'light')
    document.documentElement.setAttribute('data-theme', 'light');
  else
    document.documentElement.removeAttribute('data-theme');
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  if (themeToggle) {
    const nextTheme = t === 'dark' ? 'light' : 'dark';
    themeToggle.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
    themeToggle.setAttribute('title', `Switch to ${nextTheme} mode`);
  }
  if (themeIcon) {
    themeIcon.innerHTML = t === 'dark'
      ? '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path>'
      : '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5z"></path>';
  }
  try {
    localStorage.setItem('tb_theme', t);
  } catch (e) {
  }
  syncAppearanceUI();
  refreshChartsTheme();
}
document.getElementById('themeToggle').addEventListener('click', () => {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
});

/* ---------------- sticky filter bar + table header (Trade Log, Ledger) ---------------- */
// CSS does the pinning (css/23-sticky.css). This code only supplies what CSS cannot know:
//  1. --sticky-bar-h : height of the filter bar, so the header pins right under it
//  2. .is-wide       : the table is wider than its box (Raw mode / small window / zoom), so it
//                      scrolls sideways, and CSS sticky cannot cross a sideways-scrolling box.
//                      For that case we show a "ghost" copy of the header: a position:fixed strip
//                      (fixed = the browser keeps it still, so it cannot lag or flicker).
//                      The script only switches it on/off and keeps it in step with the table.
const STICKY_VIEWS = ['trades', 'ledger'].map(name => {
  const view = document.getElementById('view-' + name);
  return {
    view,
    bar: view.querySelector('.filter-bar'),
    wrap: view.querySelector('.table-wrap'),
    table: view.querySelector('.table-wrap table'),
    ghost: null,           // the fixed header copy, created on first use
    pager: view.querySelector('.pager'),
    mirror: null,          // footer scrollbar that mirrors the table's sideways scroll
    mirrorInner: null
  };
});

// Footer scrollbar: a custom track + thumb that is ALWAYS drawn (thumb fills the track when
// nothing overflows), so it never disappears like a native scrollbar. It drives the table's scrollLeft.
STICKY_VIEWS.forEach(sv => {
  if (!sv.pager) return;
  sv.mirror = document.createElement('div');
  sv.mirror.className = 'pager-scroll';
  sv.mirror.setAttribute('role', 'scrollbar');
  sv.mirror.setAttribute('aria-orientation', 'horizontal');
  sv.mirror.setAttribute('aria-label', 'Scroll table sideways');
  sv.thumb = document.createElement('div');
  sv.thumb.className = 'pager-thumb';
  sv.mirror.appendChild(sv.thumb);
  sv.pager.prepend(sv.mirror);
  const maxScroll = () => Math.max(0, sv.wrap.scrollWidth - sv.wrap.clientWidth);
  const room = () => Math.max(1, sv.mirror.clientWidth - sv.thumb.offsetWidth);
  // drag the thumb
  sv.thumb.addEventListener('pointerdown', e => {
    e.preventDefault();
    const startX = e.clientX, startLeft = sv.wrap.scrollLeft;
    sv.thumb.setPointerCapture(e.pointerId);
    sv.thumb.classList.add('dragging');
    const move = ev => { sv.wrap.scrollLeft = startLeft + (ev.clientX - startX) / room() * maxScroll(); };
    const up = () => {
      sv.thumb.classList.remove('dragging');
      sv.thumb.removeEventListener('pointermove', move);
      sv.thumb.removeEventListener('pointerup', up);
      sv.thumb.removeEventListener('pointercancel', up);
    };
    sv.thumb.addEventListener('pointermove', move);
    sv.thumb.addEventListener('pointerup', up);
    sv.thumb.addEventListener('pointercancel', up);
  });
  // click on the empty track: jump there
  sv.mirror.addEventListener('pointerdown', e => {
    if (e.target !== sv.mirror) return;
    const r = sv.mirror.getBoundingClientRect();
    const x = e.clientX - r.left - sv.thumb.offsetWidth / 2;
    sv.wrap.scrollLeft = Math.min(1, Math.max(0, x / room())) * maxScroll();
  });
  sv.wrap.addEventListener('scroll', () => syncMirrorScrollbar(sv), { passive: true });
});

function syncMirrorScrollbar(sv) {
  if (!sv.mirror) return;
  const { wrap, mirror, thumb } = sv;
  // only show the footer scrollbar while the table really scrolls sideways
  const needed = wrap.classList.contains('is-wide') && wrap.scrollWidth - wrap.clientWidth > 1;
  sv.pager.classList.toggle('has-hscroll', needed);
  if (!needed) return;
  const trackW = mirror.clientWidth;
  const max = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
  const ratio = wrap.scrollWidth ? wrap.clientWidth / wrap.scrollWidth : 1;
  const thumbW = max > 0 ? Math.max(40, Math.round(trackW * ratio)) : trackW;
  thumb.style.width = thumbW + 'px';
  thumb.style.transform = 'translateX(' + (max > 0 ? Math.round(wrap.scrollLeft / max * (trackW - thumbW)) : 0) + 'px)';
  mirror.classList.toggle('is-idle', max <= 0);
  mirror.setAttribute('aria-valuenow', String(max > 0 ? Math.round(wrap.scrollLeft / max * 100) : 0));
}

// Height the bar takes at the top of the screen (0 when it is not pinned, e.g. on phones)
function pinnedBarHeight(bar) {
  return getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight : 0;
}

function syncStickyLayout() {
  STICKY_VIEWS.forEach(sv => {
    const { view, bar, wrap, table } = sv;
    if (!bar.offsetHeight) return;                                   // view is hidden right now
    view.style.setProperty('--sticky-bar-h', pinnedBarHeight(bar) + 'px');
    view.style.setProperty('--sticky-head-h', table.tHead.offsetHeight + 'px');   // the Ledger total row pins under the header
    wrap.classList.toggle('is-wide', table.offsetWidth > wrap.clientWidth + 1);
    // Trade Log: the Symbol column pins just right of the Date column (css/33-frozen-columns.css).
    // A hidden Date column measures 0, so Symbol then pins to the left edge.
    const dateTh = table.tHead.rows[0].cells[0];
    view.style.setProperty('--frozen-date-w', (dateTh ? dateTh.getBoundingClientRect().width : 0) + 'px');
    rebuildGhostHeader(sv);
    syncMirrorScrollbar(sv);
  });
}

// (Re)create the header copy so it matches the real header: same text, sort marker, column widths
function rebuildGhostHeader(sv) {
  const { view, wrap, table } = sv;
  if (!wrap.classList.contains('is-wide')) {
    if (sv.ghost) sv.ghost.style.display = 'none';
    return;
  }
  if (!sv.ghost) {
    sv.ghost = document.createElement('div');
    sv.ghost.className = 'table-wrap sticky-ghost';   // .table-wrap so it gets the same header styling
    sv.ghost.setAttribute('aria-hidden', 'true');
    // clicking the copy = clicking the real header cell (so sorting keeps working)
    sv.ghost.addEventListener('click', e => {
      const th = e.target.closest('th');
      if (th) table.tHead.rows[0].cells[th.cellIndex].click();
    });
    view.appendChild(sv.ghost);                       // added last, so the real table is always found first
  }
  // hidden columns (display:none) take no space, so they must not get a <col> either, or every later column shifts
  const cells = Array.from(table.tHead.rows[0].cells).filter(th => !th.classList.contains('col-hidden'));
  const widths = cells.map(th => th.getBoundingClientRect().width);
  const copy = table.cloneNode(false);                // same <table> classes (e.g. raw-mode), no rows
  copy.style.width = widths.reduce((a, b) => a + b, 0) + 'px';
  copy.style.minWidth = '0';
  copy.style.tableLayout = 'fixed';
  const cols = document.createElement('colgroup');
  widths.forEach(w => {
    const col = document.createElement('col');
    col.style.width = w + 'px';
    cols.appendChild(col);
  });
  copy.append(cols, table.tHead.cloneNode(true));
  // Ledger: the total row is pinned by the same copy, under the header (css/44-ledger-header.css)
  const totalRow = table.tBodies[0] && table.tBodies[0].querySelector('tr.ledger-total');
  if (totalRow) {
    const tb = document.createElement('tbody');
    tb.appendChild(totalRow.cloneNode(true));
    copy.appendChild(tb);
  }
  sv.ghost.replaceChildren(copy);
  positionGhostHeaders();
}

// Cheap, runs on scroll: show the copy only while the real header is scrolled out of view
function positionGhostHeaders() {
  STICKY_VIEWS.forEach(({ view, bar, wrap, table, ghost }) => {
    if (!ghost) return;
    if (!wrap.classList.contains('is-wide') || !bar.offsetHeight) {
      ghost.style.display = 'none';
      return;
    }
    const gap = parseFloat(getComputedStyle(view).getPropertyValue('--sticky-gap')) || 0;
    const pinAt = pinnedBarHeight(bar) + gap - (gap ? 1 : 0);        // 1px under the gap hides sub-pixel seams
    const box = wrap.getBoundingClientRect();
    const totalEl = table.tBodies[0] && table.tBodies[0].querySelector('tr.ledger-total');
    const headH = table.tHead.offsetHeight + (totalEl ? totalEl.offsetHeight : 0);   // header + pinned total row
    const headTop = box.top + wrap.clientTop;                        // where the real header is right now
    const tableEnd = box.bottom - wrap.clientTop;                    // bottom edge of the table box
    if (headTop >= pinAt || tableEnd <= pinAt) {                     // real header visible, or table already gone
      ghost.style.display = 'none';
      return;
    }
    ghost.style.display = 'block';
    ghost.style.left = box.left + 'px';
    ghost.style.width = box.width + 'px';
    ghost.style.top = Math.min(pinAt, tableEnd - headH) + 'px';      // slides away with the last row
    ghost.scrollLeft = wrap.scrollLeft;                              // follow sideways scrolling
  });
}

let ghostFrame = 0;
function scheduleGhostUpdate() {
  if (ghostFrame) return;
  ghostFrame = requestAnimationFrame(() => { ghostFrame = 0; positionGhostHeaders(); });
}

// Rebuild when sizes change or when the table's header/rows are re-rendered (sort, filter, page, Raw toggle)
const stickyObserver = new ResizeObserver(syncStickyLayout);
let rebuildFrame = 0;
const tableObserver = new MutationObserver(() => {
  if (rebuildFrame) return;
  rebuildFrame = requestAnimationFrame(() => { rebuildFrame = 0; syncStickyLayout(); });
});
STICKY_VIEWS.forEach(({ bar, wrap, table, pager }) => {
  [bar, wrap, table, pager].forEach(el => el && stickyObserver.observe(el));
  tableObserver.observe(table, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-sort'] });
  wrap.addEventListener('scroll', scheduleGhostUpdate, { passive: true });   // sideways scroll
});
window.addEventListener('scroll', scheduleGhostUpdate, { passive: true });
window.addEventListener('resize', syncStickyLayout);
