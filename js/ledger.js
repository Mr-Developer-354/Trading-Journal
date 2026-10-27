// ======================================================================
// ledger.js — Ledger view: table, filters, add/edit drawer.
// ======================================================================
/* ---------------- ledger ---------------- */
const LEDGER_CHARGE_FIELDS = ['Brokerage','Exchange','IPFT','Sebi','IGST','STT','Stamp','Square'];

// ---- Ledger dates are calculated from the Trade Log AND stored in the Ledger database ----
// Each ledger broker gets one ledger row per UNIQUE date found in the Trade Log for THAT broker. Brokers are never merged:
// the same calendar day traded with two brokers is two ledger rows (one per broker).
// The Date is stored with the row, so after a reset (re-seed or re-import) every stored row is matched to the Trade Log
// by (broker, date) instead of by position.
// Ledger brokers = LEDGER_BROKERS, any broker that already has ledger rows, and every paper trading platform that has trades.
const ledgerBrokerKey = b => String(b || '').trim().toLowerCase();
let ledgerDateIndex = new Map();   // brokerKey -> that broker's sorted unique Trade Log dates (also used to date undated import rows)
function ledgerClearedByUser() { try { return localStorage.getItem(LEDGER_CLEAR_KEY) === '1'; } catch (e) { return false; } }
function ledgerTradeDates() {
  const out = new Map();           // brokerKey -> Set of ISO dates
  (Array.isArray(trades) ? trades : []).forEach(t => {
    const k = ledgerBrokerKey(t?.broker), d = String(t?.date ?? '').trim();
    if (!k || !d) return;
    if (!out.has(k)) out.set(k, new Set());
    out.get(k).add(d);
  });
  return out;
}
const ledgerRowHasData = r => Object.keys(r).some(k => !['id', 'broker', 'DATE'].includes(k) && r[k] !== undefined && r[k] !== null && r[k] !== '');
// Match every ledger row to the Trade Log. Returns true when rows were added, dated or dropped (→ the caller saves).
//  1. a stored row whose Date is a trade date of its broker keeps that date
//  2. a trade date with no stored row gets a new blank row carrying that Date
//  3. a row with no Date (older data) takes the earliest trade date that still has no row
//  4. a stored row whose date is no longer in the Trade Log keeps its data (it is never deleted silently);
//     only an empty one is dropped
function alignLedgerDates() {
  const tradeDates = ledgerTradeDates();
  const names = new Map();
  LEDGER_BROKERS.forEach(n => names.set(ledgerBrokerKey(n), n));
  ledgers.forEach(r => { const k = ledgerBrokerKey(r.broker); if (k && !names.has(k)) names.set(k, String(r.broker).trim()); });
  // every paper trading platform that has trades also gets ledger rows (one per trade date), like the real brokers
  (Array.isArray(trades) ? trades : []).forEach(t => {
    const n = String(t?.broker ?? '').trim(), k = ledgerBrokerKey(n);
    if (k && !names.has(k) && calBrokerTypeOf({ broker: n }) === 'paper') names.set(k, n);
  });
  const rowsBy = new Map();
  const stray = [];
  ledgers.forEach(r => {
    const k = ledgerBrokerKey(r.broker);
    if (!k) { stray.push(r); return; }
    if (!rowsBy.has(k)) rowsBy.set(k, []);
    rowsBy.get(k).push(r);
  });
  const nextNo = {};
  ledgers.forEach(r => {
    const m = String(r.id || '').match(/^L-(.+)-(\d+)$/);
    if (m) nextNo[m[1]] = Math.max(nextNo[m[1]] || 0, Number(m[2]));
  });
  const blank = (name, date) => { nextNo[name] = (nextNo[name] || 0) + 1; return { broker: name, id: `L-${name}-${nextNo[name]}`, DATE: date }; };
  const result = [];
  let changed = false;
  names.forEach((name, k) => {
    const dates = [...(tradeDates.get(k) || [])].sort();
    const have = new Set();
    const dated = [], undated = [];
    (rowsBy.get(k) || []).forEach(r => {
      const d = String(r.DATE ?? '').trim();
      if (!d) { undated.push(r); return; }
      r.DATE = d;
      dated.push(r);
      have.add(d);
    });
    const free = dates.filter(d => !have.has(d));
    undated.forEach(r => {
      const d = free.shift();
      if (d) { r.DATE = d; have.add(d); dated.push(r); changed = true; }
      else if (ledgerRowHasData(r)) { r.DATE = ''; dated.push(r); }      // nothing to attach it to: keep the data, leave it undated
      else changed = true;                                              // empty and undated: drop
    });
    free.forEach(d => { dated.push(blank(name, d)); changed = true; });
    const known = new Set(dates);
    const kept = dated.filter(r => !r.DATE || known.has(r.DATE) || ledgerRowHasData(r) || (changed = true, false));
    kept.sort((a, b) => String(a.DATE || '9999').localeCompare(String(b.DATE || '9999')));   // stable: date order per broker
    ledgerDateIndex.set(k, dates);
    result.push(...kept);
  });
  ledgers = result.concat(stray);
  ledgerPayInOutCalcCache = null;
  return changed;
}
// first load (called once both databases are read)
function resolveLedgerDates() {
  if (ledgerClearedByUser()) return;
  if (alignLedgerDates()) saveLedgerData();
}
// called by saveData() whenever the Trade Log changes: a new date gets a blank ledger row, an empty row of a vanished date goes
function syncLedgerWithTrades() {
  if (ledgerClearedByUser() || !Array.isArray(trades) || !trades.length) return;
  if (alignLedgerDates()) saveLedgerData();
  if (typeof renderLedger === 'function' && document.getElementById('view-ledger')?.classList.contains('active')) renderLedger();
}

// Pay In/Out is derived directly from the Trade Log and is never stored.
// Every broker (Groww, Fyers and any broker added through an import): sum Gross P/L for all trades on that date.
// Kotak only: sum Gross P/L minus that ledger day's Brokerage.
let ledgerPayInOutCalcCache = null;
function buildLedgerPayInOutCalc() {
  const result = new Map();
  const byBrokerDate = new Map();
  for (const t of (Array.isArray(trades) ? trades : [])) {
    const broker = String(t?.broker || '').trim();
    const date = String(t?.date ?? '').trim();
    if (!broker || !date) continue;
    const key = `${broker.toLowerCase()}|${date}`;
    let gross = 0;
    if (typeof pnlOf === 'function') {
      gross = Number(pnlOf(t)) || 0;
    } else {
      const qty = Number(t?.Qty ?? t?.qty);
      const entry = Number(t?.EntryPrice ?? t?.entry);
      const exit = Number(t?.ExitPrice ?? t?.exit);
      gross = Number.isFinite(qty) && Number.isFinite(entry) && Number.isFinite(exit) ? (exit - entry) * qty : 0;
    }
    byBrokerDate.set(key, (byBrokerDate.get(key) || 0) + gross);
  }
  for (const r of (Array.isArray(ledgers) ? ledgers : [])) {
    const broker = String(r?.broker || '').trim();
    const date = String(r?.DATE ?? r?.Date ?? '').trim();
    if (!broker || !date) continue;
    const b = broker.toLowerCase();
    const key = `${b}|${date}`;
    let value = byBrokerDate.get(key) || 0;
    if (b === 'kotak') value -= (ledgerNum(r?.Brokerage) || 0);
    result.set(String(r.id), value);
  }
  return result;
}
function ledgerPayInOut(r) {
  if (!ledgerPayInOutCalcCache) ledgerPayInOutCalcCache = buildLedgerPayInOutCalc();
  return ledgerPayInOutCalcCache.get(String(r?.id)) ?? 0;
}
function ledgerRealChr(r) {
  // Charges are stored as positive amounts in the ledger; Real Chr. is the
  // corresponding expense, so it is displayed as their negative total.
  const total = LEDGER_CHARGE_FIELDS.reduce((sum, key) => sum + (ledgerNum(r?.[key]) || 0), 0)
    + (ledgerNum(r?.['DP-Chr.']) ?? ledgerNum(r?.['DP-Chgs.']) ?? 0);
  return -total;
}
function ledgerPLCharges(r) {
  // P/L / Charges is derived and is never stored in the database.
  // Every broker except Kotak: Pay In/Out + Real Chr.
  // Kotak: Pay In/Out + Brokerage + Real Chr.
  const broker = String(r?.broker || '').trim().toLowerCase();
  const pay = ledgerPayInOut(r);
  const realChr = ledgerRealChr(r);
  const brokerage = ledgerNum(r?.Brokerage) || 0;
  return pay + (broker === 'kotak' ? brokerage : 0) + realChr;
}
// Balance is derived and is never stored in the database.
// Per broker, in date order: Balance = (previous entry's Balance) + NetPL + Credit + Debit.
// The first entry of a broker has no previous balance, so it is just NetPL + Credit + Debit.
let ledgerBalanceCache = null, ledgerBalanceCacheSrc = null;
function buildLedgerBalanceCalc() {
  const result = new Map();
  const byBroker = new Map();
  (Array.isArray(ledgers) ? ledgers : []).forEach((r, i) => {
    const b = String(r?.broker || '').trim().toLowerCase();
    if (!byBroker.has(b)) byBroker.set(b, []);
    byBroker.get(b).push({ r, i });
  });
  byBroker.forEach(list => {
    list.sort((a, b) => String(a.r?.DATE ?? a.r?.Date ?? '').localeCompare(String(b.r?.DATE ?? b.r?.Date ?? '')) || a.i - b.i);
    let prev = 0;                                   // no earlier entry → starts from 0
    list.forEach(({ r }) => {
      const bal = prev + (ledgerNum(ledgerPLCharges(r)) || 0) + (ledgerNum(r?.Credit ?? r?.['Fyers Cr.']) || 0) + (ledgerNum(r?.Debit ?? r?.['Fyers Dr.']) || 0);
      result.set(String(r.id), bal);
      prev = bal;
    });
  });
  return result;
}
function ledgerBalance(r) {
  if (!ledgerPayInOutCalcCache) ledgerPayInOutCalcCache = buildLedgerPayInOutCalc();
  // the Balance cache is rebuilt whenever the Pay In/Out cache is (they are reset together on every data change)
  if (!ledgerBalanceCache || ledgerBalanceCacheSrc !== ledgerPayInOutCalcCache) {
    ledgerBalanceCacheSrc = ledgerPayInOutCalcCache;
    ledgerBalanceCache = buildLedgerBalanceCalc();
  }
  return ledgerBalanceCache.get(String(r?.id)) ?? 0;
}
function ledgerFiltered() {
  ledgerPayInOutCalcCache = buildLedgerPayInOutCalc();
  const q = (document.getElementById('ledgerSearch')?.value || '').trim().toUpperCase();
  const broker = document.getElementById('ledgerBrokerFilter')?.value || 'all';
  const from = document.getElementById('ledgerFrom')?.value || '';
  const to = document.getElementById('ledgerTo')?.value || '';
  return ledgers.map(r => ({ ...r, 'Pay in/out': ledgerPayInOut(r), 'Net P/L/Ch': ledgerPLCharges(r), 'Balance': ledgerBalance(r) })).filter(r => {
    const date = r.DATE || '';
    const searchable = Object.values(r).concat(formatDayDisplay(r.DATE), ledgerRealChr(r));
    if (q && !searchable.some(v => String(v ?? '').toUpperCase().includes(q))) return false;
    if (!matchesBrokerFilter(r, broker)) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  }).sort((a,b) => {
    const key = ledgerSortKey;
    let av = key === 'Real Chr.' ? ledgerRealChr(a) : key === 'Net P/L/Ch' ? ledgerPLCharges(a) : a[key], bv = key === 'Real Chr.' ? ledgerRealChr(b) : key === 'Net P/L/Ch' ? ledgerPLCharges(b) : b[key];
    if (key === 'DATE') {
      av = av ? new Date(av).getTime() : -Infinity;
      bv = bv ? new Date(bv).getTime() : -Infinity;
    } else if (key === 'DAY') {   // Day is calculated from Date (not stored)
      av = a.DATE ? new Date(a.DATE).getDay() : -1;
      bv = b.DATE ? new Date(b.DATE).getDay() : -1;
    } else if (['Pay in/out','Real Chr.','Net P/L/Ch','Balance','Daily Balance'].includes(key)) {
      av = ledgerNum(av); bv = ledgerNum(bv);
      if (av === null) av = -Infinity;
      if (bv === null) bv = -Infinity;
    } else if (typeof av === 'number' || typeof bv === 'number') {
      av = ledgerNum(av) ?? -Infinity;
      bv = ledgerNum(bv) ?? -Infinity;
    } else {
      av = String(av ?? '').toUpperCase();
      bv = String(bv ?? '').toUpperCase();
    }
    if (av < bv) return -1 * ledgerSortDir;
    if (av > bv) return 1 * ledgerSortDir;
    return 0;
  });
}
function populateLedgerFilters() {
  fillBrokerFilter(document.getElementById('ledgerBrokerFilter'), ledgers);
}
// The normal (curated) header row, saved so the Raw toggle can switch back to it
const LEDGER_HEAD_DEFAULT = document.querySelector('#view-ledger thead tr').innerHTML;
// Hover text for the Ledger headers (formulas live in LEDGER_HEADER_TIPS in config.js; same text in normal and Raw view)
function applyLedgerHeaderTooltips() {
  document.querySelectorAll('#view-ledger thead th[data-ledger-k]').forEach(th => {
    const tip = LEDGER_HEADER_TIPS[th.dataset.ledgerK];
    if (tip) th.title = tip;
  });
}

// Values the Ledger table shows for one row, calculated columns included (used by the total row).
function ledgerDisplayCells(r) {
  const c = canonicalLedgerRecord(r);
  c.Date = r.DATE || undefined;
  c.Day = r.DATE ? blankDash(formatDayDisplay(r.DATE)) : undefined;
  c.PayInOut = r['Pay in/out'];
  c.RealChgs = ledgerRealChr(r);
  c.NetPL = r['Net P/L/Ch'];
  c.Balance = r['Balance'];
  return c;
}
// Total row, like the Risk management table: sums every filtered row, not only the page shown.
// Balance and Daily TA are running balances, so they show the latest entry's value, the same as the summary cards.
const LEDGER_TOTAL_SKIP = new Set(['Balance', 'DailyTA']);
function ledgerTotalRowHtml(list) {
  const sums = {};
  list.forEach(r => {
    const c = ledgerDisplayCells(r);
    LEDGER_DISPLAY_FIELDS.forEach(k => {
      if (LEDGER_ALIGN_NUM.has(k) && !LEDGER_TOTAL_SKIP.has(k)) sums[k] = (sums[k] || 0) + (ledgerNum(c[k]) || 0);
    });
  });
  const latest = list.filter(r => r.DATE).slice().sort((a, b) => String(a.DATE).localeCompare(String(b.DATE))).at(-1);
  const latestValue = {
    Balance: latest ? (ledgerNum(latest['Balance']) || 0) : 0,
    DailyTA: latest ? (ledgerNum(canonicalLedgerRecord(latest).DailyTA) || 0) : 0
  };
  const n = list.length;
  // hover tooltip: the total's formula, then the row formula from the column header tips
  const tipFor = k => {
    if (k === 'Balance') return `Latest entry's Balance among the ${n} filtered rows, the same formula as the Balance card. Row rule: ${LEDGER_HEADER_TIPS.Balance}`;
    if (k === 'DailyTA') return `Latest entry's DailyTA among the ${n} filtered rows, the same formula as the Daily TA card. Row rule: ${LEDGER_HEADER_TIPS.DailyTA}`;
    return `Sum of ${LEDGER_EXCEL_HEADER_LABELS[k] || k} over the ${n} filtered rows (all pages). Row rule: ${LEDGER_HEADER_TIPS[k] || k}`;
  };
  const cells = LEDGER_DISPLAY_FIELDS.map((k, i) => {
    if (i === 0) return `<td class="rep-first" title="${escapeHtml(`Total row: each figure below is calculated over the ${n} filtered rows (all pages). Balance and DailyTA show the latest entry.`)}">Total</td>`;
    if (LEDGER_ALIGN_NUM.has(k)) {
      const value = LEDGER_TOTAL_SKIP.has(k) ? latestValue[k] : sums[k];
      const cls = [ledgerAlignClass(k), 'ledger-value', ['PayInOut', 'NetPL'].includes(k) ? ledgerValueClass(value) : ''].filter(Boolean).join(' ');
      return `<td class="${cls}" title="${escapeHtml(tipFor(k))}">${escapeHtml(formatLedgerCurrencyOrDash(value))}</td>`;
    }
    return '<td></td>';
  }).join('');
  return `<tr class="ledger-total">${cells}</tr>`;
}

function renderLedger() {
  syncFilterBars();
  populateLedgerFilters();
  const list=ledgerFiltered();
  const ledgerNet = list.reduce((sum, r) => sum + (ledgerNum(ledgerPLCharges(r)) || 0), 0);
  const ledgerPayInOut = list.reduce((sum, r) => sum + (ledgerNum(r['Pay in/out']) || 0), 0);
  const ledgerRealChrTotal = list.reduce((sum, r) => sum + ledgerRealChr(r), 0);
  const latestLedger = list.filter(r => r.DATE).slice().sort((a,b) => String(a.DATE).localeCompare(String(b.DATE))).at(-1);
  const ledgerLatestBalance = latestLedger ? (ledgerNum(latestLedger['Balance']) || 0) : 0;
  const statTradingDay = document.getElementById('ledgerStatTradingDay');
  // Trading day: distinct dates among the rows (one ledger row per broker per date, so a date can repeat)
  const tradingDaysOf = rows => new Set(rows.map(r => r.DATE).filter(Boolean)).size;
  const statPayInOut = document.getElementById('ledgerStatPayInOut');
  const statRealChr = document.getElementById('ledgerStatRealChr');
  const statNet = document.getElementById('ledgerStatNet');
  const statBalance = document.getElementById('ledgerStatBalance');
  const setLedgerStat = (el, value) => { if (el) { el.textContent = formatLedgerCurrency(value); el.className = `val${value > 0 ? ' pos' : value < 0 ? ' neg' : ''}`; } };
  // Trading day card: "12 of 107" while filters narrow the list, plain total otherwise
  if (statTradingDay) {
    const shownDays = tradingDaysOf(list), allDays = tradingDaysOf(ledgers);
    statTradingDay.textContent = shownDays.toLocaleString(numLocale());
    if (shownDays !== allDays) {
      const of = document.createElement('span');
      of.className = 'val-of';
      of.textContent = ` of ${allDays.toLocaleString(numLocale()) }`;
      statTradingDay.appendChild(of);
    }
  }
  setLedgerStat(statPayInOut, ledgerPayInOut);
  setLedgerStat(statRealChr, ledgerRealChrTotal);
  setLedgerStat(statNet, ledgerNet);
  setLedgerStat(statBalance, ledgerLatestBalance);
  // DailyTA: the broker's daily balance, so like Balance it shows the latest entry's value
  // (canonicalLedgerRecord maps legacy keys such as 'Daily Balance' to DailyTA, the same as the table)
  const ledgerLatestDailyTA = latestLedger ? (ledgerNum(canonicalLedgerRecord(latestLedger).DailyTA) || 0) : 0;
  setLedgerStat(document.getElementById('ledgerStatDailyTA'), ledgerLatestDailyTA);
  // Credit/Debit Net: Credit total + Debit total for the rows shown (Debit is stored negative, so this is the net)
  const ledgerCreditDebitNet = list.reduce((sum, r) => {
    const c = canonicalLedgerRecord(r);
    return sum + (ledgerNum(c.Credit) || 0) + (ledgerNum(c.Debit) || 0);
  }, 0);
  setLedgerStat(document.getElementById('ledgerStatCreditDebitNet'), ledgerCreditDebitNet);
  const totalPages=Math.max(1,Math.ceil(list.length/LEDGER_PAGE_SIZE)); ledgerPage=Math.min(Math.max(1,ledgerPage),totalPages);
  const start=(ledgerPage-1)*LEDGER_PAGE_SIZE, pageRows=list.slice(start,start+LEDGER_PAGE_SIZE);
  const tbody=document.getElementById('ledgerRows'); if(!tbody)return;
  // Raw mode: one column per field stored in the database
  // Raw = the whole database schema: every stored field is a column, even when no row has a value for it yet
  const rawKeys = showRawLedger ? LEDGER_EXCEL_FIELDS.concat(LEDGER_DB_META_FIELDS) : [];
  const rawRows = showRawLedger ? pageRows.map(canonicalLedgerRecord) : [];
  const ledgerTable = document.querySelector('#view-ledger table');
  ledgerTable.classList.toggle('raw-mode', showRawLedger);
  ledgerTable.querySelector('thead tr').innerHTML = showRawLedger
    ? rawKeys.map(k => `<th class="${ledgerAlignClass(k)}" data-ledger-k="${escapeHtml(k)}" data-raw="1" title="${escapeHtml(LEDGER_HEADER_TIPS[k] || 'Stored database field.') }">${escapeHtml(LEDGER_EXCEL_HEADER_LABELS[k] || k)}</th>`).join('')
    : LEDGER_DISPLAY_FIELDS.map(k => `<th class="${ledgerAlignClass(k)}" data-ledger-k="${escapeHtml(k)}" title="${escapeHtml(LEDGER_HEADER_TIPS[k] || 'Stored database field.') }">${escapeHtml(LEDGER_EXCEL_HEADER_LABELS[k] || k)}</th>`).join('');
  applyLedgerHeaderTooltips();
  const rawBtn = document.getElementById('rawLedgerBtn');
  rawBtn.classList.toggle('is-active', showRawLedger);
  rawBtn.setAttribute('aria-pressed', String(showRawLedger));
  const rawLabel = rawBtn.querySelector('.raw-label'); if (rawLabel) rawLabel.textContent = showRawLedger ? 'Raw' : 'Nml';
  rawBtn.title = showRawLedger ? 'Back to the normal columns' : 'Show all raw database columns';
  if (showRawLedger) {
    tbody.innerHTML = rawRows.map(r => `<tr class="clickable" data-ledger-id="${escapeHtml(r.Id)}">${rawKeys.map(k => `<td class="${ledgerAlignClass(k)}">${escapeHtml(rawCell(r[k]))}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${rawKeys.length || 1}" style="text-align:center;color:var(--ink-faint);padding:30px;">No ledger records match these filters.</td></tr>`;
  } else {
  const ledgerBodyHtml=pageRows.map(r=>{
    const c=canonicalLedgerRecord(r);
    // Calculated columns (never stored): Day from Date, Pay In/Out + Net P/L from the Trade Log, Real Chr. from the charge columns
    c.Date = r.DATE || undefined;
    c.Day = r.DATE ? blankDash(formatDayDisplay(r.DATE)) : undefined;
    c.PayInOut = r['Pay in/out'];
    c.RealChgs = ledgerRealChr(r);
    c.NetPL = r['Net P/L/Ch'];
    c.Balance = r['Balance'];
    return `<tr class="clickable" data-ledger-id="${escapeHtml(r.id)}">${LEDGER_DISPLAY_FIELDS.map(k=>{
      const v=c[k];
      const numeric=LEDGER_ALIGN_NUM.has(k);
      const shown=k==='Date' ? blankDash(formatDateDisplay(v)) : numeric ? blankDash(formatLedgerCurrencyOrDash(v)) : (v ?? '');
      const cls=[ledgerAlignClass(k), numeric ? `ledger-value${['PayInOut','NetPL'].includes(k) ? ledgerValueClass(v) : ''}` : ''].filter(Boolean).join(' ');
      return `<td class="${cls}">${escapeHtml(shown)}</td>`;
    }).join('')}</tr>`;
  }).join('');
  tbody.innerHTML = ledgerBodyHtml
    ? ledgerTotalRowHtml(list) + ledgerBodyHtml
    : `<tr><td colspan="${LEDGER_DISPLAY_FIELDS.length}" style="text-align:center;color:var(--ink-faint);padding:30px;">No ledger records match these filters.</td></tr>`;
  }
  tbody.querySelectorAll('[data-ledger-id]').forEach(row=>row.addEventListener('click',()=>openLedgerDetail(row.dataset.ledgerId)));
  const pagerTotal=document.getElementById('ledgerPagerTotal'); if(pagerTotal) pagerTotal.textContent=totalPages;
  const pagerRange=document.getElementById('ledgerPagerRange'); if(pagerRange) pagerRange.textContent=list.length?`· ${start+1}–${Math.min(start+LEDGER_PAGE_SIZE,list.length)} of ${list.length}`:'· 0 entries';
  const jump=document.getElementById('ledgerPageJump'); if(jump){ jump.max=totalPages; jump.style.setProperty('--digits', String(totalPages).length); if(document.activeElement!==jump) jump.value=ledgerPage; }
  document.querySelectorAll('#view-ledger thead th[data-ledger-k]').forEach(th => {
    const headKey = LEDGER_KEY_MAP[th.dataset.ledgerK] || th.dataset.ledgerK;
    const active = headKey === ledgerSortKey;
    th.classList.toggle('sort-active', active);
    th.setAttribute('aria-sort', active ? (ledgerSortDir === 1 ? 'ascending' : 'descending') : 'none');
  });
  document.getElementById('ledgerFirstPage').disabled=ledgerPage<=1; document.getElementById('ledgerPrevPage').disabled=ledgerPage<=1; document.getElementById('ledgerNextPage').disabled=ledgerPage>=totalPages; document.getElementById('ledgerLastPage').disabled=ledgerPage>=totalPages;
}
// header data attribute -> stored field name (used for sorting AND for the active-column highlight)
const LEDGER_KEY_MAP = { Broker:'broker', Id:'id', Date:'DATE', Day:'DAY', PayInOut:'Pay in/out', Brokerage:'Brokerage', Exchange:'Exchange', IPFT:'IPFT', SEBI:'Sebi', IGST:'IGST', STT:'STT', Stamp:'Stamp', SqrOff:'Square', DPChgs:'DP-Chr.', RealChgs:'Real Chr.', NetPL:'Net P/L/Ch', Taxable:'Taxable', Credit:'Fyers Cr.', Debit:'Fyers Dr.', Balance:'Balance', DailyTA:'Daily Balance', Notes:'Notes' };
document.querySelector('#view-ledger thead').addEventListener('click', e => {
  const th = e.target.closest('th[data-ledger-k]');
  if (!th) return;
  const k = th.dataset.ledgerK;
  const key = LEDGER_KEY_MAP[k] || k;   // raw headers use the canonical database name: map it to the in-memory key too
  if (ledgerSortKey === key) ledgerSortDir *= -1;
  else { ledgerSortKey = key; ledgerSortDir = -1; }
  ledgerPage = 1;
  renderLedger();
});
document.getElementById('rawLedgerBtn').addEventListener('click', () => {
  showRawLedger = !showRawLedger;
  renderLedger();
});

// Renders the ledger form into `inlineOpts.el` (a table row panel). `inlineOpts` = { el, onCancel, onSaved }.
function openLedgerForm(existing, inlineOpts) {
  const inline=inlineOpts;
  const root=inline.el;
  const broker=existing.broker || 'Groww';
  const fields=LEDGER_FIELDS;
  // in-memory records use the legacy key names (DATE, Square, Fyers Cr. …); the form shows the canonical labels
  const fk = f => LEDGER_KEY_MAP[f] || f;
  const ledgerFieldHtml = (f, i) => {
    const key=fk(f);
    const v=existing[key];
    const num=ledgers.some(r=>typeof r[key]==='number');
    const type=key==='DATE'?'date':(num?'number':'text');
    const lock=key==='DATE'?'readonly title="Calculated from the Trade Log"':'';
    return `<div class="field"><label>${escapeHtml(f)}</label><input type="${type}" name="f_${i}" value="${escapeHtml(v===undefined||v===null?'':v)}" ${num?'step="any"':''} ${lock}></div>`;
  };
  root.innerHTML=`
    <div class="trade-drawer-head ledger-drawer-head">
      <div class="trade-drawer-title">
        <h2>Edit ledger entry</h2>
        <p>Update the stored ledger record. Its date is calculated from the Trade Log.</p>
      </div>
      <div class="head-actions"><button type="button" class="btn ghost" id="cancelLedger">Cancel</button><button type="submit" class="btn primary" form="ledgerForm">Save changes</button></div>
    </div>
    <form id="ledgerForm" class="trade-form ledger-form">
      <div class="trade-drawer-body ledger-drawer-body">
        <section class="drawer-section">
          <div class="drawer-section-title">
            <span>01</span>
            <div><b>Ledger entry</b><small>Broker and account activity (date comes from the Trade Log)</small></div>
          </div>
          <div class="field-grid">
            <div class="field">
              <label>Broker</label>
              <select name="__broker" disabled>${LEDGER_BROKERS.concat(!LEDGER_BROKERS.includes(broker)?[broker]:[]).map(b=>`<option ${broker===b?'selected':''}>${escapeHtml(b)}</option>`).join('')}</select>
            </div>
            ${fields.map(ledgerFieldHtml).join('')}
          </div>
        </section>
      </div>
    </form>`;
  root.querySelector('#cancelLedger').addEventListener('click',inline.onCancel);
  root.querySelector('#ledgerForm').addEventListener('submit',e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const rec={...existing};
    rec.broker=existing.broker;
    delete rec.brokerType;
    delete rec.ledgerSheet;
    fields.forEach((f,i)=>{
      const raw=fd.get(`f_${i}`);
      const key=fk(f);
      const wasNum=ledgers.some(r=>typeof r[key]==='number');
      if(key==='DATE')return;                         // the date comes from the Trade Log and is never edited here
      rec[key]=raw===''?null:(wasNum?(ledgerNum(raw) ?? raw):raw);
    });
    const idx=ledgers.findIndex(r=>String(r.id)===String(existing.id));
    if(idx>-1)ledgers[idx]=rec;
    saveLedgerData();
    ledgerPayInOutCalcCache = null;
    showToast('Ledger entry updated');
    renderLedger();
    inline.onSaved(rec);
  });
}
['ledgerSearch','ledgerBrokerFilter','ledgerFrom','ledgerTo'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{ledgerPage=1;renderLedger();}));
document.getElementById('clearLedgerFilters').addEventListener('click',()=>{['ledgerSearch','ledgerFrom','ledgerTo'].forEach(id=>document.getElementById(id).value='');document.getElementById('ledgerBrokerFilter').value='all';ledgerPage=1;renderLedger();});
document.getElementById('ledgerFirstPage').addEventListener('click',()=>{ledgerPage=1;renderLedger();}); document.getElementById('ledgerPrevPage').addEventListener('click',()=>{ledgerPage--;renderLedger();}); document.getElementById('ledgerNextPage').addEventListener('click',()=>{ledgerPage++;renderLedger();}); document.getElementById('ledgerLastPage').addEventListener('click',()=>{ledgerPage=Math.ceil(ledgerFiltered().length/LEDGER_PAGE_SIZE)||1;renderLedger();}); document.getElementById('ledgerPageJump').addEventListener('change',e=>{ledgerPage=Math.max(1,parseInt(e.target.value)||1);renderLedger();});
document.getElementById('exportLedgerCsv').addEventListener('click',()=>downloadFile('ledger.csv',toLedgerCsv(ledgerFiltered()),'text/csv'));

// Manual "Sync ledger rows from Trade Log" (Ledger filter bar). Same matching as the automatic sync in saveData(), but it
// also works after "Clear ledger database" (which switches the automatic sync off) and tells the user what changed.
function syncLedgerRowsFromTrades() {
  if (!Array.isArray(trades) || !trades.length) { showToast('The Trade Log is empty, so there are no dates to sync'); return; }
  const before = new Map(ledgers.map(r => [String(r.id), String(r.DATE ?? '').trim()]));
  const wasCleared = ledgerClearedByUser();
  try { if (wasCleared) localStorage.removeItem(LEDGER_CLEAR_KEY); } catch (e) {}
  const changed = alignLedgerDates();
  if (changed || wasCleared) saveLedgerData();
  let added = 0, dated = 0;
  ledgers.forEach(r => {
    const id = String(r.id);
    if (!before.has(id)) added++;
    else if (!before.get(id) && String(r.DATE ?? '').trim()) dated++;
  });
  const now = new Set(ledgers.map(r => String(r.id)));
  const removed = [...before.keys()].filter(id => !now.has(id)).length;
  const dates = ledgerTradeDates();
  const orphans = ledgers.filter(r => { const d = String(r.DATE ?? '').trim(); return d && !(dates.get(ledgerBrokerKey(r.broker))?.has(d)); }).length;
  const parts = [];
  if (added) parts.push(`${added} row${added === 1 ? '' : 's'} added`);
  if (dated) parts.push(`${dated} dated`);
  if (removed) parts.push(`${removed} empty row${removed === 1 ? '' : 's'} removed`);
  let msg = parts.length ? `Ledger synced: ${parts.join(', ')}` : 'Ledger already matches the Trade Log';
  if (orphans) msg += ` (${orphans} row${orphans === 1 ? '' : 's'} with data kept although the date is not in the Trade Log)`;
  ledgerPage = 1;
  populateLedgerFilters();
  renderLedger();
  showToast(msg);
}
document.getElementById('syncLedgerBtn').addEventListener('click', syncLedgerRowsFromTrades);
