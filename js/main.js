// ======================================================================
// main.js — Keyboard shortcuts and app start-up. Loaded last.
// ======================================================================
/* ---------------- keyboard shortcuts ---------------- */
document.addEventListener('keydown', e => {
  const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  if (typing)
    return;
  if (e.key === 'n') {
    e.preventDefault();
    openNewEntryPanel('trade');
  }
  if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    setPref('privacy', !PREFS.privacy);
    showToast(PREFS.privacy ? 'Privacy blur on' : 'Privacy blur off');
  }
  if (e.key === '/') {
    e.preventDefault();
    switchView('trades');
    setTimeout(() => document.getElementById('fSearch').focus(), 50);
  }
});
/* ---------------- init ---------------- */
initReports();   // Reports view: tab and broker controls (rendered once the data has loaded)
try {
  const savedTheme = localStorage.getItem('tb_theme');
  if (savedTheme)
    currentTheme = savedTheme;
} catch (e) {
}
buildAppearanceUI();
try {
  applyDensity(localStorage.getItem('tb_density') || 'slim');
} catch (e) {
}
try {
  applyPalette(localStorage.getItem('tb_palette') || 'ocean');
} catch (e) {
}
applyTheme(currentTheme);
applyPrefs();
applyEffectiveDensity();
if (PREFS.sidebarCollapsed && isDesktop())
  setSidebarCollapsed(true);
// Wait for the database before rendering any Trade Log data.
Promise.all([loadData(), loadLedgerData()]).then(() => {
  resolveLedgerDates();   // Ledger dates are calculated from the Trade Log (not stored)
  syncLedgerWithTrades(); // every trade date of every broker gets a ledger row (blank rows are added, existing rows keep their data)
  populateBrokerFilter();
  populateCalendarBrokerFilter();
  renderDashboard();
  renderTrades();
  renderCalendar();
  renderReports();
  renderRisk();
  renderBrokers();
  if (PREFS.startPage && PREFS.startPage !== 'dashboard' && PREFS.startPage !== 'insights' && document.getElementById('view-' + PREFS.startPage))
    switchView(PREFS.startPage);
});
