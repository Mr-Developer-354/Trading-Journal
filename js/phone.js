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
})();

// ---- the three screen views: mobile (up to 600px), tablet (601–1024px), computer (1025px and up) ----
// The view is written to <html data-screen>; css/43-screens.css and css/42-phone.css read it.
// Tablet uses the desktop layout with the sidebar collapsed to icons (it can still be opened as an overlay).
(function () {
  const mobileQ = window.matchMedia('(max-width: 600px)');
  const tabletQ = window.matchMedia('(min-width: 601px) and (max-width: 1024px)');
  const screenNow = () => mobileQ.matches ? 'mobile' : tabletQ.matches ? 'tablet' : 'computer';
  const applyScreen = () => {
    const screen = screenNow();
    document.documentElement.dataset.screen = screen;
    if (screen === 'tablet' && typeof setSidebarCollapsed === 'function') setSidebarCollapsed(true);
  };
  mobileQ.addEventListener('change', applyScreen);
  tabletQ.addEventListener('change', applyScreen);
  applyScreen();
})();
