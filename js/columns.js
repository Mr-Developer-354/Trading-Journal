// ======================================================================
// columns.js — "Add or remove columns" menu for the Trade Log and Ledger tables.
// Hidden columns are remembered per table, and separately for the normal and Raw views.
// Hiding uses display:none, so the per-column (nth-child) alignment rules keep working.
// Loaded after trades.js / ledger.js; it wraps their render functions to re-apply the choice.
// ======================================================================
const COLS_KEY = 'tb_hidden_cols_v1';
const COLS_TABLES = {
  trades: { btn: 'colsTradesBtn', table: '#view-trades table', keyAttr: 'k',       isRaw: () => showRawTrades },
  ledger: { btn: 'colsLedgerBtn', table: '#view-ledger table', keyAttr: 'ledgerK', isRaw: () => showRawLedger }
};
let colsState = {};
try { colsState = JSON.parse(localStorage.getItem(COLS_KEY) || '{}') || {}; } catch (_) { colsState = {}; }
function saveColsState() { try { localStorage.setItem(COLS_KEY, JSON.stringify(colsState)); } catch (_) {} }
// Columns hidden before the user chose anything: only the normal Trade Log has defaults (see trades.js)
function defaultHiddenFor(name, mode) {
  return name === 'trades' && mode === 'normal' ? TRADE_NORMAL_HIDDEN_BY_DEFAULT : [];
}
function hiddenColsFor(name) {
  const mode = COLS_TABLES[name].isRaw() ? 'raw' : 'normal';
  const saved = (colsState[name] || {})[mode];
  return new Set(saved ? saved : defaultHiddenFor(name, mode));
}
function setHiddenColsFor(name, set) {
  const mode = COLS_TABLES[name].isRaw() ? 'raw' : 'normal';
  colsState[name] = colsState[name] || {};
  colsState[name][mode] = Array.from(set);
  saveColsState();
}
function colHeaders(name) {
  const cfg = COLS_TABLES[name];
  const table = document.querySelector(cfg.table);
  return Array.from(table.tHead.rows[0].cells).map(th => ({
    th, key: th.dataset[cfg.keyAttr] || th.textContent.trim(), label: th.textContent.trim()
  }));
}
// hide/show the header cells and the matching body cells
function applyColumnVisibility(name) {
  const cfg = COLS_TABLES[name];
  const table = document.querySelector(cfg.table);
  if (!table || !table.tHead) return;
  const hidden = hiddenColsFor(name);
  const heads = colHeaders(name);
  heads.forEach(h => h.th.classList.toggle('col-hidden', hidden.has(h.key)));
  Array.from(table.tBodies[0].rows).forEach(tr => {
    if (tr.cells.length !== heads.length) return;           // "no results" row spans all columns
    Array.from(tr.cells).forEach((td, i) => td.classList.toggle('col-hidden', hidden.has(heads[i].key)));
  });
  // the button is highlighted when the visible columns differ from the defaults
  const mode = cfg.isRaw() ? 'raw' : 'normal';
  const dflt = new Set(defaultHiddenFor(name, mode));
  const customised = hidden.size !== dflt.size || [...hidden].some(k => !dflt.has(k));
  document.getElementById(cfg.btn).classList.toggle('is-active', customised);
}
// keep the table in step whenever the views re-render
const _renderTradesBase = renderTrades;
renderTrades = function () { _renderTradesBase.apply(this, arguments); applyColumnVisibility('trades'); };
const _renderLedgerBase = renderLedger;
renderLedger = function () { _renderLedgerBase.apply(this, arguments); applyColumnVisibility('ledger'); };

/* ---------------- the menu ---------------- */
let colsMenu = null, colsMenuFor = null;
function closeColsMenu() {
  if (!colsMenu) return;
  colsMenu.remove();
  const btn = document.getElementById(COLS_TABLES[colsMenuFor].btn);
  btn.setAttribute('aria-expanded', 'false');
  colsMenu = null; colsMenuFor = null;
}
function fillColsMenu(name) {
  const hidden = hiddenColsFor(name);
  const heads = colHeaders(name);
  const visibleCount = heads.filter(h => !hidden.has(h.key)).length;
  colsMenu.innerHTML = `<div class="cols-menu-head"><b>Columns</b><button type="button" class="cols-reset">Show all</button></div>
    <div class="cols-menu-list">${heads.map((h, i) => {
      const on = !hidden.has(h.key);
      const lock = on && visibleCount === 1;                // always keep one column visible
      return `<label class="cols-item"><input type="checkbox" data-i="${i}" ${on ? 'checked' : ''} ${lock ? 'disabled' : ''}><span>${escapeHtml(h.label)}</span></label>`;
    }).join('')}</div>`;
  colsMenu.querySelector('.cols-reset').addEventListener('click', () => {
    setHiddenColsFor(name, new Set());
    applyColumnVisibility(name); fillColsMenu(name);
  });
  colsMenu.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    const set = hiddenColsFor(name);
    const key = heads[Number(cb.dataset.i)].key;
    if (cb.checked) set.delete(key); else set.add(key);
    setHiddenColsFor(name, set);
    applyColumnVisibility(name); fillColsMenu(name);
  }));
}
function openColsMenu(name) {
  closeColsMenu();
  const btn = document.getElementById(COLS_TABLES[name].btn);
  colsMenu = document.createElement('div');
  colsMenu.className = 'cols-menu';
  colsMenu.setAttribute('role', 'dialog');
  colsMenu.setAttribute('aria-label', 'Add or remove columns');
  colsMenuFor = name;
  fillColsMenu(name);
  document.body.appendChild(colsMenu);
  positionColsMenu();
  btn.setAttribute('aria-expanded', 'true');
}
// keep the menu under its button (the page can scroll a little when the button takes focus)
function positionColsMenu() {
  if (!colsMenu) return;
  const btn = document.getElementById(COLS_TABLES[colsMenuFor].btn);
  const r = btn.getBoundingClientRect();
  const w = colsMenu.offsetWidth;
  colsMenu.style.top = Math.round(r.bottom + 6) + 'px';
  colsMenu.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, Math.round(r.right - w))) + 'px';
}
Object.keys(COLS_TABLES).forEach(name => {
  document.getElementById(COLS_TABLES[name].btn).addEventListener('click', e => {
    e.stopPropagation();
    if (colsMenu && colsMenuFor === name) closeColsMenu(); else openColsMenu(name);
  });
});
document.addEventListener('click', e => { if (colsMenu && !colsMenu.contains(e.target)) closeColsMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeColsMenu(); });
window.addEventListener('resize', closeColsMenu);
window.addEventListener('scroll', positionColsMenu, { passive: true });
document.addEventListener('click', e => {                   // switching Raw on/off changes the column list
  if (e.target.closest('#rawTradesBtn, #rawLedgerBtn')) closeColsMenu();
});
