// ======================================================================
// phone.js — bottom tab bar for phone width (the bar itself is styled in css/42-phone.css).
// Each tab reuses the existing sidebar controls, so the views, the Log a trade drawer and
// the sidebar drawer ("More") behave exactly as on the desktop.
// ======================================================================
(function () {
  const tabs = document.querySelectorAll('.phone-tab');
  if (!tabs.length) return;
  // highlight the tab for the view that is showing
  const syncTabs = () => {
    const active = document.querySelector('.view.active');
    const view = active ? active.id.replace('view-', '') : '';
    tabs.forEach(t => t.classList.toggle('active', t.dataset.phoneView === view));
  };
  tabs.forEach(t => t.addEventListener('click', () => {
    const v = t.dataset.phoneView;
    if (v === 'more') { document.getElementById('sidebarToggleBtn').click(); return; }
    if (v === 'add') { document.getElementById('addTradeBtn').click(); return; }
    const btn = document.querySelector(`.nav button[data-view="${ v }"]`)
      || document.querySelector(`.settings-nav-btn[data-view="${ v }"]`);
    if (btn) btn.click();
    setTimeout(syncTabs, 0);
  }));
  // a view can also change from the sidebar or from inside a page, so re-check after any click
  document.addEventListener('click', () => setTimeout(syncTabs, 0));
  syncTabs();
  // measure the tab bar so the pinned footer sits just above it (css/42-phone.css uses --tabbar-h)
  const bar = document.querySelector('.phone-tabbar');
  const setBarH = () => document.documentElement.style.setProperty('--tabbar-h', bar.offsetHeight + 'px');
  if (bar && 'ResizeObserver' in window) new ResizeObserver(setBarH).observe(bar);
  setBarH();
  // measure the pinned footer of the Trade log and Ledger, so the table stops 4px above it
  const pagers = document.querySelectorAll('#view-trades .pager, #view-ledger .pager');
  const setPagerH = () => {
    const h = Math.max(0, ...Array.from(pagers, p => p.offsetHeight));
    if (h) document.documentElement.style.setProperty('--pager-h', h + 'px');
  };
  if (pagers.length && 'ResizeObserver' in window) {
    const ro = new ResizeObserver(setPagerH);
    pagers.forEach(p => ro.observe(p));
  }
  setPagerH();
})();

// ---- the two screen views: mobile (up to 1024px, including tablets) and computer (1025px and up) ----
// The view is written to <html data-screen>; css/43-screens.css and css/42-phone.css read it.
(function () {
  const mobileQ = window.matchMedia('(max-width: 1024px)');
  const applyScreen = () => {
    document.documentElement.dataset.screen = mobileQ.matches ? 'mobile' : 'computer';
  };
  mobileQ.addEventListener('change', applyScreen);
  applyScreen();
  // phones and tablets always show the table in normal view: the Nml (raw) toggles are hidden,
  // so if raw is on (from the computer), switch it off here
  const normalTables = () => {
    if (!mobileQ.matches) return;
    ['rawTradesBtn', 'rawLedgerBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (b && b.getAttribute('aria-pressed') === 'true') b.click();
    });
  };
  mobileQ.addEventListener('change', () => setTimeout(normalTables, 0));
  setTimeout(normalTables, 0);
})();
