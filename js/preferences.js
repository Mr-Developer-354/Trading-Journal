// ======================================================================
// preferences.js — Settings page logic + the user preferences it controls.
// Theme / density / palette keep their own keys (see layout.js); everything
// else lives in one object saved under PREFS_KEY.
// ======================================================================
const PREFS_KEY = 'tb_prefs_v1';
const PREF_DEFAULTS = {
  dateFmt: 'dmy-mon',        // dmy-mon | dmy-slash | mdy-slash | iso
  numFmt: 'in',              // in (1,23,456) | intl (123,456)
  rows: 50,                  // rows per page in Trade Log + Ledger
  startPage: 'dashboard',    // view opened at start-up
  width: 'boxed',            // boxed (1400px) | full
  sidebarCollapsed: false,   // start with the sidebar hidden (desktop)
  privacy: false,            // blur amounts
  reduceMotion: false,
  pageDensity: {}            // per-page override: { trades: 'normal', dashboard: 'xslim', … }; missing = follow global
};
let PREFS = clonePrefDefaults();
function clonePrefDefaults() { return { ...PREF_DEFAULTS, pageDensity: {} }; }

const PAGE_DENSITY_VIEWS = [
  ['dashboard', 'Dashboard'], ['trades', 'Trade Log'], ['ledger', 'Ledger'], ['calendar', 'Calendar'],
  ['charges', 'Charges'], ['settings', 'Settings']
];
const DENSITY_LABEL = { normal: 'Normal', slim: 'Compact', xslim: 'X-compact', global: 'Global' };

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    PREFS = { ...clonePrefDefaults(), ...raw };
  } catch (e) { PREFS = clonePrefDefaults(); }
  PREFS.rows = Number(PREFS.rows) || 50;
  if (!PREFS.pageDensity || typeof PREFS.pageDensity !== 'object') PREFS.pageDensity = {};
  Object.keys(PREFS.pageDensity).forEach(k => { if (!DENSITIES.includes(PREFS.pageDensity[k])) delete PREFS.pageDensity[k]; });
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(PREFS)); } catch (e) {}
}

// Used by utils.js for every number / date the app prints
function numLocale() { return PREFS.numFmt === 'intl' ? 'en-US' : 'en-IN'; }

/* ---------------- apply ---------------- */
function applyPrefs() {
  const root = document.documentElement;
  root.setAttribute('data-width', PREFS.width);
  root.toggleAttribute('data-privacy', !!PREFS.privacy);
  root.toggleAttribute('data-reduce-motion', !!PREFS.reduceMotion);
  PAGE_SIZE = PREFS.rows;
  LEDGER_PAGE_SIZE = PREFS.rows;
  if (typeof Chart !== 'undefined' && Chart.defaults) {
    if (!applyPrefs.chartAnim) applyPrefs.chartAnim = Chart.defaults.animation;
    Chart.defaults.animation = PREFS.reduceMotion ? false : applyPrefs.chartAnim;
  }
  syncPrefsUI();
  window.dispatchEvent(new Event('resize'));
}

function rerenderAll() {
  [renderDashboard, renderTrades, renderLedger, renderCalendar, renderBrokers]
    .forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}

function setPref(key, value) {
  if (key === 'rows') value = Number(value) || 50;
  if (key === 'privacy' || key === 'reduceMotion' || key === 'sidebarCollapsed') value = !!value;
  PREFS[key] = value;
  savePrefs();
  if (key === 'rows') { page = 1; ledgerPage = 1; }
  if (key === 'sidebarCollapsed' && isDesktop()) setSidebarCollapsed(value);
  applyPrefs();
  if (['dateFmt', 'numFmt', 'rows'].includes(key)) rerenderAll();
}

/* ---------------- per-page density ---------------- */
function buildPageDensityUI() {
  const grid = document.getElementById('pageDensityGrid');
  if (!grid) return;
  const btn = (v, val, label) => `<button type="button" data-pd-view="${v}" data-pd-val="${val}" title="${val === 'global' ? 'Follow the global Density setting' : ''}">${label}</button>`;
  grid.innerHTML = PAGE_DENSITY_VIEWS.map(([v, name]) =>
    `<div class="st-pd" data-view="${v}" data-s="density compact normal page ${name.toLowerCase()}">
       <span class="st-pd-name">${escapeHtml(name)}<small></small></span>
       <div class="mode-switch">${btn(v, 'global', 'Global')}${btn(v, 'normal', 'Normal')}${btn(v, 'slim', 'Compact')}${btn(v, 'xslim', 'X-compact')}</div>
     </div>`).join('');
}
function setPageDensity(view, val) {
  if (val === 'global') delete PREFS.pageDensity[view]; else PREFS.pageDensity[view] = val;
  savePrefs();
  applyEffectiveDensity();
  syncPrefsUI();
}
function setAllPageDensity(val) {
  PAGE_DENSITY_VIEWS.forEach(([v]) => { if (val === 'global') delete PREFS.pageDensity[v]; else PREFS.pageDensity[v] = val; });
  savePrefs();
  applyEffectiveDensity();
  syncPrefsUI();
  showToast(val === 'global' ? 'All pages follow the global density' : 'All pages set to ' + DENSITY_LABEL[val]);
}

/* ---------------- settings page UI ---------------- */
function syncPrefsUI() {
  const view = document.getElementById('view-settings');
  if (!view) return;
  view.querySelectorAll('button[data-pref]').forEach(b =>
    b.classList.toggle('active', String(PREFS[b.dataset.pref]) === b.dataset.val));
  view.querySelectorAll('select[data-pref]').forEach(sel => { sel.value = String(PREFS[sel.dataset.pref]); });
  view.querySelectorAll('input[type=checkbox][data-pref]').forEach(cb => { cb.checked = !!PREFS[cb.dataset.pref]; });
  view.querySelectorAll('.st-pd').forEach(row => {
    const v = row.dataset.view, own = PREFS.pageDensity[v] || 'global';
    row.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.pdVal === own));
    row.querySelector('small').textContent = own === 'global' ? '→ ' + DENSITY_LABEL[currentDensity] : '';
  });
  const all = Object.values(PREFS.pageDensity);
  view.querySelectorAll('#pageDensityAll button').forEach(b => b.classList.toggle('active',
    b.dataset.all === 'global' ? all.length === 0 : (all.length === PAGE_DENSITY_VIEWS.length && all.every(x => x === b.dataset.all))));
  const prev = document.getElementById('stPreview');
  if (prev) prev.innerHTML =
    `<span>Preview</span><b>${formatDateDisplay('2026-10-05')}</b><b class="pos">${fmtMoney(1234567)}</b><b class="neg">${fmtMoneyPrecise(-98765.4)}</b>`;
}

// called whenever the Settings page is opened
function renderSettingsPage() {
  syncPrefsUI();
}

function exportLedgerCsv() {
  if (!ledgers.length) { showToast('Ledger is empty'); return; }
  const keys = rawColumnKeys(ledgers);
  const esc = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [keys.join(','), ...ledgers.map(r => keys.map(k => esc(r[k])).join(','))].join('\n');
  downloadFile('ledger.csv', csv, 'text/csv');
}

function resetPrefs() {
  if (!confirm('Reset every preference on this page (mode, density, palette, formats, workspace) to its default? Your trades and ledger are not touched.')) return;
  PREFS = clonePrefDefaults();
  savePrefs();
  applyTheme('dark'); applyDensity('slim'); applyPalette('ocean'); applyEffectiveDensity();
  if (isDesktop()) setSidebarCollapsed(false);
  applyPrefs();
  rerenderAll();
  showToast('Preferences reset');
}

function bindSettingsPage() {
  const view = document.getElementById('view-settings');
  if (!view) return;
  view.addEventListener('click', e => {
    const b = e.target.closest('button[data-pref]');
    if (b) setPref(b.dataset.pref, b.dataset.val);
    const pd = e.target.closest('button[data-pd-view]');
    if (pd) setPageDensity(pd.dataset.pdView, pd.dataset.pdVal);
    const all = e.target.closest('#pageDensityAll button[data-all]');
    if (all) setAllPageDensity(all.dataset.all);
  });
  view.addEventListener('change', e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.pref) return;
    if (el.type === 'checkbox') setPref(el.dataset.pref, el.checked);
    else if (el.tagName === 'SELECT') setPref(el.dataset.pref, el.value);
  });
  document.getElementById('stResetPrefs').addEventListener('click', resetPrefs);
  document.getElementById('exportLedgerCsv').addEventListener('click', exportLedgerCsv);
  document.getElementById('exportPrefs').addEventListener('click', () =>
    downloadFile('trading-journal-preferences.json', JSON.stringify({
      ...PREFS, theme: currentTheme, density: currentDensity, palette: currentPalette
    }, null, 2), 'application/json'));
}

loadPrefs();
buildPageDensityUI();
bindSettingsPage();
