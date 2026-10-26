// ======================================================================
// trades.js — Trade Log view: filters, sorting, table, pagination.
// ======================================================================
/* ---------------- trades table ---------------- */
// populate the broker filter dropdown with known brokers
function populateBrokerFilter() {
  fillBrokerFilter(document.getElementById('fBroker'), trades);
}
// get trades filtered and sorted per the current trade-log filters
function getFiltered() {
  const q = document.getElementById('fSearch').value.trim().toUpperCase();
  const broker = document.getElementById('fBroker').value;
  const from = document.getElementById('fFrom').value;
  const to = document.getElementById('fTo').value;
  return trades.filter(t => {
    if (q && !(t.symbol || '').toUpperCase().includes(q))
      return false;
    if (!matchesBrokerFilter(t, broker))
      return false;
    if (from && t.date < from)
      return false;
    if (to && t.date > to)
      return false;
    return true;
  });
}
// ---- Normal Trade Log: every stored field and every calculated column ----
// The Columns menu (columns.js) chooses which ones show. Raw view uses the database names instead.
// k = header key (data-k), label = header text, cls = alignment, cell(t, c) = the <td> for one trade;
// c holds this row's calculated values (GrossPL, PerPL, RRR, Losses, Time, RiskMgmt).
const tdCell = (cls, inner, attrs = '') => `<td${ cls ? ` class="${ cls }"` : '' }${ attrs }>${ inner }</td>`;
const txtOf = v => escapeHtml(v === undefined || v === null ? '' : String(v));
const TRADE_NORMAL_COLS = [
  { k: 'date', label: 'Date', cls: '', cell: t => tdCell('', blankDash(formatDateDisplay(t.date))) },
  { k: 'symbol', label: 'Symbol', cls: '', cell: t => tdCell('sym', t.symbol || '') },
  { k: 'broker', label: 'Broker', cls: '', cell: t => tdCell('', t.broker || '') },
  { k: 'exchange', label: 'Exchange', cls: '', cell: t => tdCell('', txtOf(t.exchange)) },
  { k: 'segment', label: 'Segment', cls: '', cell: t => tdCell('', txtOf(t.segment), segmentTitleAttr(t.segment)) },
  { k: 'product', label: 'Product', cls: '', cell: t => tdCell('', txtOf(t.product)) },
  { k: 'optType', label: 'Type', cls: 'ctr', cell: t => tdCell('ctr', txtOf(t.optType)) },
  { k: 'expiry', label: 'Expiry', cls: '', cell: t => tdCell('', txtOf(t.expiry)) },
  { k: 'strike', label: 'Strike', cls: 'num', cell: t => tdCell('num', txtOf(t.strike)) },
  { k: 'qty', label: 'Qty', cls: 'ctr', cell: t => tdCell('ctr', t.qty !== undefined && t.qty !== null ? `<span class="qty-value ${ Number(t.qty) < 0 ? 'short' : 'long' }">${ t.qty }</span>` : '') },
  { k: 'entry', label: 'EntryPrice', cls: 'num', cell: t => tdCell('num', blankDash(fmtPrice(t.entry)), ` title="${ exactValue(t.entry) }"`) },
  { k: 'sl', label: 'Stoploss', cls: 'num', cell: t => tdCell('num', blankDash(fmtPrice(t.sl)), ` title="${ exactValue(t.sl) }"`) },
  { k: 'exit', label: 'ExitPrice', cls: 'num', cell: t => tdCell('num', t.exit !== undefined && t.exit !== null && t.exit !== '' ? fmtPrice(t.exit) : '', ` title="${ exactValue(t.exit) }"`) },
  { k: 'expCha', label: 'ExpChgs', cls: 'num', cell: t => tdCell('num', t.expCha === undefined || t.expCha === null || t.expCha === '' ? '' : fmtMoneyPrecise(t.expCha), ` title="${ exactValue(t.expCha) }"`) },
  { k: 'entryTime', label: 'EntryTime', cls: 'ctr', cell: t => tdCell('ctr', txtOf(t.entryTime)) },
  { k: 'exitTime', label: 'ExitTime', cls: 'ctr', cell: t => tdCell('ctr', txtOf(t.exitTime)) },
  { k: 'pnl', label: 'GrossPL', cls: 'num', cell: (t, c) => tdCell(`num pnl ${ c.pnl >= 0 ? 'pos' : 'neg' }`, blankDash(fmtMoneyPrecise(c.pnl))) },
  { k: 'pnlPct', label: 'PerPL', cls: 'num', cell: (t, c) => tdCell(`num pnl ${ c.pnl >= 0 ? 'pos' : 'neg' }`, c.pnlPct !== null ? (c.pnlPct * 100).toFixed(2) + '%' : '') },
  { k: 'rrr', label: 'RRR', cls: 'ctr', cell: (t, c) => tdCell(`ctr rrr ${ c.rrr !== null && c.rrr < 0 ? 'neg' : '' }`, c.rrr !== null ? c.rrr.toFixed(2) : '') },
  { k: 'losses', label: 'Losses', cls: 'num', cell: (t, c) => tdCell(`num pnl ${ c.losses !== null && c.losses < 0 ? 'neg' : c.losses !== null && c.losses > 0 ? 'pos' : '' }`, c.losses !== null ? fmtMoneyPrecise(c.losses) : '') },
  { k: 'period', label: 'Time', cls: 'ctr', cell: (t, c) => tdCell('ctr', c.period || '', ` title="${ escapeHtml(t.entry !== undefined && t.exit !== undefined ? 'Intraday: duration from EntryTime to ExitTime' : t.exit !== undefined ? 'Matched to earlier entry row(s): holding period' : 'Waiting for a later exit row') }"`) },
  { k: 'riskMgmt', label: 'RiskMgmt', cls: 'num', cell: (t, c) => tdCell('num', c.riskTag ? `<span class="tag risk-tag ${ riskTagClass(c.riskTag) }">${ c.riskTag }</span>` : '') },
  { k: 'strategy', label: 'Strategy', cls: '', cell: t => tdCell('', txtOf(t.strategy)) },
  { k: 'disciplined', label: 'Disciplined', cls: '', cell: t => tdCell('', txtOf(t.disciplined)) },
  { k: 'notes', label: 'Notes', cls: '', cell: t => tdCell('notes-cell', txtOf(t.notes), ` title="${ txtOf(t.notes) }" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"`) },
  { k: 'id', label: 'Id', cls: 'ctr', cell: t => tdCell('ctr', txtOf(t.id)) }
];
// Columns hidden the first time (and after Start fresh): everything outside the original normal view.
// The Columns menu can show any of them; "Show all" shows every column.
const TRADE_NORMAL_HIDDEN_BY_DEFAULT = ['segment', 'product', 'optType', 'expiry', 'strike', 'expCha', 'entryTime', 'exitTime', 'strategy', 'disciplined', 'notes', 'id'];
// Header row of the normal view (also what the Raw toggle returns to)
function tradeNormalHeadHtml() {
  return TRADE_NORMAL_COLS.map(col => `<th class="${ col.cls }" data-k="${ col.k }">${ col.label }</th>`).join('');
}
function tradeNormalRowHtml(t) {
  const c = {
    pnl: pnlOf(t), pnlPct: pnlPctOf(t), rrr: rrrOf(t), losses: lossesOf(t),
    period: durationPeriodOf(t), riskTag: riskTagOf(t)
  };
  // data-label names each cell for the phone card layout (css/42-phone.css)
  return `<tr data-id="${ t.id }">${ TRADE_NORMAL_COLS.map(col => col.cell(t, c).replace('<td', `<td data-label="${ col.label }"`)).join('') }</tr>`;
}

// render the paginated, sorted trade log (orders) table
// Map a risk-tag label to its CSS colour class
const RISK_TAG_CLASSES = {
  'small loss': 'risk-small-loss',
  'big loss': 'risk-big-loss',
  'very big loss': 'risk-very-big-loss',
  'small profit': 'risk-small-profit',
  'big profit +1%': 'risk-big-profit-1',
  'big profit +2%': 'risk-big-profit-2',
  'big profit +3%': 'risk-big-profit-3',
  'safe < 0.2%': 'risk-safe'
};
function riskTagClass(value) {
  return RISK_TAG_CLASSES[String(value || '').trim().toLowerCase()] || 'risk-neutral';
}

function renderTrades() {
  syncFilterBars();
  populateBrokerFilter();
  let list = getFiltered();
  // Raw mode: headers use database field names (Date, EntryPrice, ...), so sort on the canonical record
  const rawSortKeys = showRawTrades ? rawColumnKeys(trades) : [];
  const rawSort = showRawTrades && rawSortKeys.includes(sortKey);
  const rawCache = rawSort ? new Map(list.map(t => [t, canonicalTradeRecord(t)])) : null;
  list.sort((a, b) => {
    const sortVal = (t) => rawSort ? rawCache.get(t)[sortKey]
      : sortKey === 'pnl' ? pnlOf(t)
      : sortKey === 'pnlPct' || sortKey === 'riskMgmt' ? pnlPctOf(t)   // tag order follows Gross P/L %
      : sortKey === 'rrr' ? rrrOf(t)
      : sortKey === 'losses' ? lossesOf(t)
      : sortKey === 'duration' || sortKey === 'period' ? durationPeriodSortValue(t)
      : t[sortKey];
    let av = sortVal(a), bv = sortVal(b);
    const isDateKey = sortKey === 'date' || (rawSort && sortKey === 'Date');
    if (isDateKey) {
      av = new Date(av || 0);
      bv = new Date(bv || 0);
    }
    if (av === undefined || av === null)
      av = isDateKey ? new Date(0) : typeof bv === 'number' ? -Infinity : '';
    if (bv === undefined || bv === null)
      bv = isDateKey ? new Date(0) : typeof av === 'number' ? -Infinity : '';
    if (av < bv)
      return -1 * sortDir;
    if (av > bv)
      return 1 * sortDir;
    return 0;
  });
  // summary cards: always reflect the currently filtered trades
  {
    const s = computeStats(list);
    const charges = list.reduce((sum, t) => sum + (Number(t.expCha) || 0), 0);
    const setStat = (id, text, value) => {
      const el = document.getElementById(id);
      if (!el)
        return;
      el.textContent = text;
      el.className = 'val' + (value > 0 ? ' pos' : value < 0 ? ' neg' : '');
    };
    // Trades card: "118 of 2,795" while filters narrow the list, plain total otherwise
    const countEl = document.getElementById('tradeStatCount');
    if (countEl) {
      countEl.className = 'val';
      countEl.textContent = s.n.toLocaleString(numLocale());
      if (s.n !== trades.length) {
        const of = document.createElement('span');
        of.className = 'val-of';
        of.textContent = ` of ${ trades.length.toLocaleString(numLocale()) }`;
        countEl.appendChild(of);
      }
    }
    setStat('tradeStatNet', fmtMoneyPrecise(s.net), s.net);
    setStat('tradeStatWinRate', s.n ? s.winRate.toFixed(1) + '%' : '—', s.n ? s.winRate - 50 : 0);
    setStat('tradeStatPF', !s.n ? '—' : s.pf === Infinity ? '∞' : s.pf.toFixed(2), s.n ? (s.pf >= 1 ? 1 : -1) : 0);
    setStat('tradeStatCharges', fmtMoneyPrecise(charges), charges);
    // Avg Win / Avg Loss: average gross P/L of the winning and losing trades (Loss shown negative, like the Losses column)
    setStat('tradeStatAvgWin', s.wins ? fmtMoneyPrecise(s.avgWin) : '—', s.avgWin);
    setStat('tradeStatAvgLoss', s.losses ? fmtMoneyPrecise(-s.avgLoss) : '—', s.losses ? -s.avgLoss : 0);
  }
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (page > totalPages)
    page = totalPages;
  const pageList = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const tbody = document.getElementById('tradeRows');
  // Raw mode: one column per field stored in the database
  const rawKeys = showRawTrades ? rawColumnKeys(trades) : [];
  const rawRows = showRawTrades ? pageList.map(canonicalTradeRecord) : [];
  const tradeTable = document.querySelector('#view-trades table');
  tradeTable.classList.toggle('raw-mode', showRawTrades);
  tradeTable.querySelector('thead tr').innerHTML = showRawTrades
    ? rawKeys.map(k => `<th class="${ tradeAlignClass(k, true) }" data-k="${ escapeHtml(k) }">${ escapeHtml(TRADE_EXCEL_HEADER_LABELS[k] || k) }</th>`).join('')
    : tradeNormalHeadHtml();
  // hover a header to see its formula (text lives in TRADE_HEADER_TIPS, config.js)
  tradeTable.querySelectorAll('thead th[data-k]').forEach(th => {
    const tip = TRADE_HEADER_TIPS[TRADE_KEY_TO_FIELD[th.dataset.k] || th.dataset.k];
    if (tip) th.title = tip;
  });
  const rawBtn = document.getElementById('rawTradesBtn');
  rawBtn.classList.toggle('is-active', showRawTrades);
  rawBtn.setAttribute('aria-pressed', String(showRawTrades));
  const rawLabel = rawBtn.querySelector('.raw-label'); if (rawLabel) rawLabel.textContent = showRawTrades ? 'Raw' : 'Nml';
  rawBtn.title = showRawTrades ? 'Back to the normal columns' : 'Show all raw database columns';
  if (!pageList.length) {
    tbody.innerHTML = `<tr><td colspan="${ showRawTrades ? rawKeys.length || 1 : TRADE_NORMAL_COLS.length }" style="font-family:var(--sans); color:var(--ink-faint); text-align:center; padding:40px;">No trades match these filters.</td></tr>`;
  } else {
    tbody.innerHTML = showRawTrades ? rawRows.map(t =>
      `<tr data-id="${ t.Id }">${ rawKeys.map(k => `<td class="${ tradeAlignClass(k, true) }"${ k === 'Segment' ? segmentTitleAttr(t[k]) : '' }>${ escapeHtml(rawCell(t[k])) }</td>`).join('') }</tr>`
    ).join('') : pageList.map(tradeNormalRowHtml).join('');
  }
  document.querySelectorAll('#view-trades thead th[data-k]').forEach(th => {
    const active = th.dataset.k === sortKey;
    th.classList.toggle('sort-active', active);
    th.setAttribute('aria-sort', active ? (sortDir === 1 ? 'ascending' : 'descending') : 'none');
  });
  document.getElementById('pagerTotal').textContent = totalPages;
  const pagerRange = document.getElementById('pagerRange');   // same "· a–b of N" label as the Ledger footer
  if (pagerRange) {
    const start = (page - 1) * PAGE_SIZE;
    pagerRange.textContent = list.length ? `· ${start + 1}–${Math.min(start + PAGE_SIZE, list.length)} of ${list.length}` : '· 0 entries';
  }
  const pageJumpInput = document.getElementById('pageJump');
  pageJumpInput.style.setProperty('--digits', String(totalPages).length);
  pageJumpInput.max = totalPages;
  pageJumpInput.placeholder = String(page);
  if (document.activeElement !== pageJumpInput)
    pageJumpInput.value = page;
  document.getElementById('firstPage').disabled = page <= 1;
  document.getElementById('prevPage').disabled = page <= 1;
  document.getElementById('nextPage').disabled = page >= totalPages;
  document.getElementById('lastPage').disabled = page >= totalPages;
  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => openTradeDetail(parseInt(row.dataset.id, 10)));
  });
}
['fSearch', 'fBroker', 'fFrom', 'fTo'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    page = 1;
    renderTrades();
  });
});
document.getElementById('clearFilters').addEventListener('click', () => {
  document.getElementById('fSearch').value = '';
  document.getElementById('fBroker').value = 'all';
  document.getElementById('fFrom').value = '';
  document.getElementById('fTo').value = '';
  page = 1;
  renderTrades();
});
document.querySelector('#view-trades thead').addEventListener('click', e => {
  const th = e.target.closest('th[data-k]');
  if (!th) return;
  const k = th.dataset.k;
  if (sortKey === k)
    sortDir *= -1;
  else {
    sortKey = k;
    sortDir = -1;
  }
  renderTrades();
});
document.getElementById('rawTradesBtn').addEventListener('click', () => {
  showRawTrades = !showRawTrades;
  // keep the same sorted column when switching between normal and raw column names
  if (showRawTrades) {
    sortKey = dbHeaderOf(sortKey);
  } else {
    const legacy = Object.keys(DB_HEADER_OF_KEY).find(k => DB_HEADER_OF_KEY[k] === sortKey && /^[a-z]/.test(k));
    sortKey = legacy || (sortKey === 'Date' ? 'date' : sortKey);
  }
  renderTrades();
});
document.getElementById('firstPage').addEventListener('click', () => {
  if (page > 1) {
    page = 1;
    renderTrades();
  }
});
document.getElementById('prevPage').addEventListener('click', () => {
  if (page > 1) {
    page--;
    renderTrades();
  }
});
document.getElementById('nextPage').addEventListener('click', () => {
  page++;
  renderTrades();
});
document.getElementById('lastPage').addEventListener('click', () => {
  page = Math.max(1, Math.ceil(getFiltered().length / PAGE_SIZE));
  renderTrades();
});
// jump straight to a typed page number, clamped to the valid range
function jumpToPage() {
  const input = document.getElementById('pageJump');
  const totalPages = Math.max(1, Math.ceil(getFiltered().length / PAGE_SIZE));
  let target = parseInt(input.value, 10);
  if (!target || target < 1)
    target = 1;
  if (target > totalPages)
    target = totalPages;
  page = target;
  renderTrades();
}
document.getElementById('pageJump').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    jumpToPage();
    e.target.blur();
  }
});
document.getElementById('pageJump').addEventListener('blur', e => {
  if (e.target.value)
    jumpToPage();
});
