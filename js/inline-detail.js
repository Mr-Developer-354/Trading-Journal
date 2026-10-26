// ======================================================================
// inline-detail.js — Clicking a Trade Log / Ledger row opens a compact details panel
// directly under that row (full table width) instead of the side drawer.
// trades.js / ledger.js call openTradeDetail / openLedgerDetail on row click.
// Editing and adding entries use the same kind of panel (forms live in trade-drawer.js / ledger.js).
// ======================================================================
const INLINE_DETAIL_CLOSE_ICON = '×';

function closeInlineDetail(tbody) {
  const scope = tbody ? [tbody] : [document.getElementById('tradeRows'), document.getElementById('ledgerRows')];
  scope.forEach(tb => {
    if (!tb) return;
    tb.querySelectorAll('tr.detail-row-tr').forEach(tr => tr.remove());
    tb.querySelectorAll('tr.row-open').forEach(tr => tr.classList.remove('row-open'));
  });
}
// swap the details panel for the edit form, in the same panel; Cancel / Save go back to the details
function startInlineEdit(tr, openForm, reopen) {
  const box = tr.querySelector('.inline-detail');
  box.classList.add('inline-edit');
  box.innerHTML = '';
  openForm({ el: box, onCancel: reopen, onSaved: reopen });
  sizeInlineDetail(tr);
  tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
// 'Log a trade': a blank (or pre-filled, for Duplicate) form panel at the top of the table
function openNewEntryPanel(kind, prefill) {
  // trades only: ledger rows are created from the Trade Log (see syncLedgerRowsFromTrades in ledger.js)
  const view = document.getElementById('view-trades');
  if (!view.classList.contains('active')) switchView('trades');
  const tbody = document.getElementById('tradeRows');
  closeInlineDetail(tbody);
  const tr = document.createElement('tr');
  tr.className = 'detail-row-tr new-entry-tr';
  const td = document.createElement('td');
  td.colSpan = Math.max(1, tbody.closest('table').tHead.rows[0].cells.length);
  td.className = 'inline-detail-cell';
  td.innerHTML = '<div class="inline-detail inline-edit"></div>';
  tr.appendChild(td);
  tbody.prepend(tr);
  sizeInlineDetail(tr);
  const opts = { el: tr.querySelector('.inline-detail'), onCancel: () => tr.remove(), onSaved: () => {} };
  openAddTrade(prefill, opts);
  tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const first = tr.querySelector('input:not([type=hidden]), select');
  if (first) first.focus({ preventScroll: true });
}
// tile helpers
function idKv(label, value, opts = {}) {
  const esc = escapeHtml;
  const empty = value === undefined || value === null || value === '';
  const text = empty ? '—' : String(value);
  const cls = opts.cls || '';
  return `<div class="idt-item${opts.full ? ' full' : ''}"><span class="k">${esc(label)}</span><span class="v ${cls}${opts.text ? ' text' : ''}"${opts.title ? ` title="${esc(opts.title)}"` : ''}>${esc(text)}</span></div>`;
}
function idGroup(title, items) {
  return items.length ? `<section class="idt-group"><div class="idt-title">${escapeHtml(title)}</div><div class="idt-grid">${items.join('')}</div></section>` : '';
}
const signCls = n => Number(n) > 0 ? 'pos' : Number(n) < 0 ? 'neg' : '';

// put the panel row under `row`; returns the panel element, or null when the same row was toggled closed
function mountInlineDetail(row, html, headCount) {
  const tbody = row.parentElement;
  const wasOpen = row.classList.contains('row-open');
  closeInlineDetail(tbody);
  if (wasOpen) return null;
  const tr = document.createElement('tr');
  tr.className = 'detail-row-tr';
  const td = document.createElement('td');
  td.colSpan = Math.max(1, headCount);
  td.className = 'inline-detail-cell';
  td.innerHTML = `<div class="inline-detail">${html}</div>`;
  tr.appendChild(td);
  row.after(tr);
  row.classList.add('row-open');
  sizeInlineDetail(tr);
  tr.querySelector('.idt-close').addEventListener('click', () => closeInlineDetail(tbody));
  tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return tr;
}
// keep the panel as wide as the visible table box even when the table scrolls sideways
function sizeInlineDetail(tr) {
  const wrap = tr.closest('.table-wrap');
  const box = tr.querySelector('.inline-detail');
  if (wrap && box) box.style.width = wrap.clientWidth + 'px';
}
// The wrapper's width also changes when the left sidebar is collapsed / expanded (no window resize
// fires then), so watch the wrappers themselves and re-fit any open panel.
const inlineDetailObserver = new ResizeObserver(() => document.querySelectorAll('tr.detail-row-tr').forEach(sizeInlineDetail));
['#view-trades', '#view-ledger'].forEach(sel => {
  const wrap = document.querySelector(sel + ' .table-wrap');
  if (wrap) inlineDetailObserver.observe(wrap);
});
window.addEventListener('resize', () => document.querySelectorAll('tr.detail-row-tr').forEach(sizeInlineDetail));

/* ---------------- Trade Log ---------------- */
function openTradeDetail(id) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  const row = document.querySelector(`#tradeRows tr[data-id="${id}"]`);
  if (!row) return;
  const esc = escapeHtml;
  const money = v => (v === undefined || v === null || v === '') ? '—' : fmtMoneyPrecise(v);
  const moneyKv = (label, v) => idKv(label, money(v), { cls: signCls(v) });
  const priceKv = (label, v) => idKv(label, fmtPrice(v), { title: exactValue(v) });
  const pnl = pnlOf(t), pct = pnlPctOf(t), rrr = rrrOf(t);
  const execution = [
    idKv('Date', formatDateDisplay(t.date)), idKv('Broker', t.broker, { text: true }),
    t.exchange ? idKv('Exchange', t.exchange, { text: true }) : '',
    idKv('Segment', t.segment || 'Capital', { text: true, title: segmentTooltip(t.segment || 'Capital') }),
    t.product ? idKv('Product', t.product, { text: true }) : '',
    idKv('Qty', t.qty), priceKv('EntryPrice', t.entry), priceKv('Stoploss', t.sl), priceKv('ExitPrice', t.exit),
    idKv('EntryTime', t.entryTime), idKv('ExitTime', t.exitTime), idKv('Duration', durationOf(t))
  ].filter(Boolean);
  const contract = [];
  if (t.expiry) contract.push(idKv('Expiry', t.expiry));
  if (t.strike) contract.push(idKv('Strike', t.strike));
  if (t.optType) contract.push(idKv('Type', t.optType));
  const journal = [idKv('RiskMgmt', riskTagOf(t) ?? '—', { text: true }), idKv('Strategy', t.strategy, { text: true }), idKv('Disciplined', t.disciplined, { text: true })];
  const performance = [
    moneyKv('GrossPL', pnl), idKv('PerPL', pct !== null ? (pct * 100).toFixed(2) + '%' : '—', { cls: signCls(pct) }),
    idKv('RRR', rrr !== null ? rrr.toFixed(2) : '—'), moneyKv('Losses', lossesOf(t)),
    moneyKv('ExpChgs', t.expCha)
  ];
  // free-text notes shown under the tiles (Notes is the only journal text field that is still stored)
  const noteBlock = (label, text) => text ? `<div class="idt-note"><b>${esc(label)}</b>${esc(text)}</div>` : '';
  const notes = noteBlock('Notes', t.notes);
  const head = row.closest('table').tHead.rows[0].cells.length;
  const tr = mountInlineDetail(row, `
    <div class="idt-top">
      <div class="idt-heading"><b>${esc(t.symbol || 'Trade')}</b><span>${esc(formatDateDisplay(t.date))} · ${esc(t.broker || '—')} · <span title="${esc(segmentTooltip(t.segment || 'Capital'))}">${esc(t.segment || 'Capital')}</span>${t.product ? ' · ' + esc(t.product) : ''}</span></div>
      <div class="idt-pnl ${signCls(pnl)}"><small>GrossPL</small><b>${esc(Number.isFinite(pnl) ? money(pnl) : '—')}</b></div>
      <div class="idt-actions">
        <button type="button" class="btn small" data-act="edit">Edit</button>
        <button type="button" class="btn small" data-act="dup">Duplicate</button>
        <button type="button" class="btn small danger" data-act="del">Delete</button>
        <button type="button" class="idt-close" aria-label="Close details" title="Close">${INLINE_DETAIL_CLOSE_ICON}</button>
      </div>
    </div>
    <div class="idt-groups">${idGroup('Execution', execution)}${idGroup('Contract', contract)}${idGroup('Journal', journal)}${idGroup('Performance & charges', performance)}</div>
    ${notes ? `<div class="idt-notes">${notes}</div>` : ''}`, head);
  if (!tr) return;
  const tbody = row.parentElement;
  const reopenTrade = () => { closeInlineDetail(tbody); openTradeDetail(t.id); };
  tr.querySelector('[data-act="edit"]').addEventListener('click', () => startInlineEdit(tr, opts => openAddTrade(t, opts), reopenTrade));
  tr.querySelector('[data-act="dup"]').addEventListener('click', () => { const copy = Object.assign({}, t); delete copy.id; copy.date = new Date().toISOString().slice(0, 10); openNewEntryPanel('trade', copy); });
  tr.querySelector('[data-act="del"]').addEventListener('click', () => {
    if (!confirm('Delete this trade permanently?')) return;
    if (typeof rememberDeletedRecord === 'function') rememberDeletedRecord(DELETED_TRADE_KEY, tradeDeletedKeys(t));
    trades = trades.filter(x => x.id !== id); saveData(); showToast('Trade deleted'); renderTrades(); renderDashboard();
  });
}

/* ---------------- Ledger ---------------- */
function openLedgerDetail(id) {
  const r = ledgers.find(x => String(x.id) === String(id));
  if (!r) return;
  const row = Array.from(document.querySelectorAll('#ledgerRows tr[data-ledger-id]')).find(tr => String(tr.dataset.ledgerId) === String(id));
  if (!row) return;
  const esc = escapeHtml;
  const display = v => ledgerDisplay(v);
  const entries = Object.entries({ ...r, 'Pay in/out': ledgerPayInOut(r), 'Net P/L/Ch': ledgerPLCharges(r), 'Balance': ledgerBalance(r) }).filter(([k, v]) => v !== undefined && v !== null && v !== '');
  const chargeKeys = ['Brokerage', 'Exchange', 'IPFT', 'Sebi', 'IGST', 'STT', 'Stamp', 'DP-Chr.', 'Square'];
  const primary = ['DATE', 'broker', 'Pay in/out', 'Net P/L/Ch', 'Real Chr.', 'Balance', 'Daily Balance'];
  const tile = ([k, v]) => idKv(dbHeaderOf(k), display(v), { cls: typeof v === 'number' ? signCls(v) : '' });
  const account = [...entries.filter(([k]) => primary.includes(k) && k !== 'Real Chr.'), ['Real Chr.', ledgerRealChr(r)]].map(tile);
  const charges = entries.filter(([k]) => chargeKeys.includes(k)).map(tile);
  const other = entries.filter(([k]) => !primary.includes(k) && !chargeKeys.includes(k) && k !== 'id').map(tile);
  const net = ledgerPLCharges(r);
  const head = row.closest('table').tHead.rows[0].cells.length;
  const tr = mountInlineDetail(row, `
    <div class="idt-top">
      <div class="idt-heading"><b>${esc(r.broker || 'Ledger')}</b><span>${esc(formatDateDisplay(r.DATE))}${r.DATE ? ' · ' + esc(formatDayDisplay(r.DATE)) : ''}</span></div>
      <div class="idt-pnl ${signCls(net)}"><small>NetPL</small><b>${esc(display(net))}</b></div>
      <div class="idt-actions">
        <button type="button" class="btn small" data-act="edit">Edit</button>
        <button type="button" class="btn small danger" data-act="del" title="Empty the stored values; the row stays because its date comes from the Trade Log">Clear data</button>
        <button type="button" class="idt-close" aria-label="Close details" title="Close">${INLINE_DETAIL_CLOSE_ICON}</button>
      </div>
    </div>
    <div class="idt-groups">${idGroup('Account & result', account)}${idGroup('Charges & taxes', charges)}${idGroup('Other details', other)}</div>`, head);
  if (!tr) return;
  const tbody = row.parentElement;
  const reopenLedger = () => { closeInlineDetail(tbody); openLedgerDetail(r.id); };
  tr.querySelector('[data-act="edit"]').addEventListener('click', () => startInlineEdit(tr, opts => openLedgerForm(r, opts), reopenLedger));
  tr.querySelector('[data-act="del"]').addEventListener('click', () => {
    if (!confirm('Clear the stored values of this ledger entry? The row stays, because its date comes from the Trade Log.')) return;
    Object.keys(r).forEach(k => { if (!['id', 'broker', 'DATE'].includes(k)) delete r[k]; });
    saveLedgerData(); ledgerPayInOutCalcCache = null; showToast('Ledger entry cleared'); renderLedger();
  });
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.inline-detail.inline-edit')) return;   // never discard an edit by accident
  closeInlineDetail();
});

document.getElementById('addTradeBtn').addEventListener('click', () => openNewEntryPanel('trade'));
document.getElementById('addTradeFilterBtn').addEventListener('click', () => openNewEntryPanel('trade'));
