// ======================================================================
// dashboard.js — Dashboard view: period filter, monthly goal, net results after
// estimated charges, KPIs, drawdown & risk, R-multiples, distributions, broker profile,
// time analysis, breakdowns, review tags and a customizable widget layout.
// Charts are drawn by viz.js (SVG, no CDN).
// ======================================================================

/* ---------------- shared helpers ---------------- */
// the dashboard's broker filter ('all' = no filter); its date range and day / week / month / year filters are the shared ones used by Reports and Risk
let dashBroker = 'all';
const DB_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DB_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DB_R_BINS = [
  { label: '≤−2R',   test: r => r <= -2 },
  { label: '−2…−1R', test: r => r > -2 && r <= -1 },
  { label: '−1…−.5R', test: r => r > -1 && r <= -0.5 },
  { label: '−.5…0R', test: r => r > -0.5 && r < 0 },
  { label: '0….5R',  test: r => r >= 0 && r < 0.5 },
  { label: '.5…1R',  test: r => r >= 0.5 && r < 1 },
  { label: '1…2R',   test: r => r >= 1 && r < 2 },
  { label: '≥2R',    test: r => r >= 2 }
];
// categorical colours for pies and multi-series charts (readable on both themes)
const DB_PALETTE = ['#5b8def', '#2fb170', '#e5534b', '#f0a030', '#a277ff', '#20b2aa', '#ff7eb6', '#8d99ae'];
// local calendar date as YYYY-MM-DD (toISOString would use UTC and shift the day in India)
const dbIso = d => `${ d.getFullYear() }-${ String(d.getMonth() + 1).padStart(2, '0') }-${ String(d.getDate()).padStart(2, '0') }`;
const dbWeekdayIndex = iso => (new Date(iso + 'T00:00:00').getDay() + 6) % 7;     // Mon = 0 … Sun = 6
const dbCompact = v => {
  const a = Math.abs(v), sg = v < 0 ? '-' : '';
  if (a >= 1e7) return sg + '₹' + (a / 1e7).toFixed(1) + 'Cr';
  if (a >= 1e5) return sg + '₹' + (a / 1e5).toFixed(1) + 'L';
  if (a >= 1e3) return sg + '₹' + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
  return sg + '₹' + Math.round(a);
};
const dbPct = v => (v === null || !isFinite(v)) ? '—' : v.toFixed(1) + '%';
const dbR = v => (v === null || !isFinite(v)) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + 'R';
const dbRatio = v => (v === null || v === undefined) ? '—' : (isFinite(v) ? v.toFixed(2) : '∞');
const dbNum = v => Number(v).toLocaleString(numLocale());
const dbCls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const dbEsc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// trades in the selected date range and date filters (shared with Reports and Risk) and broker, dated only
function dbRangeList() {
  return trades.filter(t => t.date
    && riskDatePass(reportDateOf(t.date))
    && matchesBrokerFilter(t, dashBroker));
}
// trades in date order (ties broken by id)
function dbSorted(list) {
  return list.filter(t => t.date).slice().sort((a, b) =>
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || String(a.id ?? '').localeCompare(String(b.id ?? ''), undefined, { numeric: true }));
}
// group rows by a key; returns Map(key -> rows)
function dbGroup(rows, keyFn) {
  const m = new Map();
  rows.forEach(x => { const k = keyFn(x) || 'Unspecified'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return m;
}
function dbTable(headers, rows, attrs) {
  return `<table class="db-table"><thead><tr>${ headers.map(h => `<th class="${ h.num ? 'num' : '' }">${ h.label }</th>`).join('') }</tr></thead><tbody>${
    rows.map((cells, i) => `<tr${ attrs && attrs[i] ? ' ' + attrs[i] : '' }>${ cells.map(c => `<td class="${ c.cls || '' }">${ c.html }</td>`).join('') }</tr>`).join('')
  }</tbody></table>`;
}
function dbEmpty(host) { host.innerHTML = `<div class="db-faint db-empty">No data in this period.</div>`; }

/* Real charges per trade. A broker's ledger row for a day gives its Net P/L after real charges (ledgerPLCharges).
   The day's charges (that net minus the day's gross P/L from the Trade Log) are shared over the day's trades in
   proportion to their estimated charges, or equally when none is estimated. A broker/day with no ledger row keeps
   the estimate stored on each trade. */
function dbChargeMap() {
  const groups = new Map();
  trades.forEach(t => {
    const key = ledgerBrokerKey(t.broker) + '|' + reportDateOf(t.date ?? t.Date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  const ledgerNet = new Map();
  ledgers.forEach(r => {
    const d = reportDateOf(canonicalLedgerRecord(r).Date);
    if (!d) return;
    const key = ledgerBrokerKey(r.broker) + '|' + d;
    ledgerNet.set(key, (ledgerNet.get(key) || 0) + (ledgerPLCharges(r) || 0));
  });
  const map = new Map();
  groups.forEach((list, key) => {
    const net = ledgerNet.get(key);
    if (net === undefined) { list.forEach(t => map.set(t, reportTradeCharges(t))); return; }
    const gross = list.reduce((s, t) => s + pnlOf(t), 0);
    const real = net - gross;
    const est = list.reduce((s, t) => s + reportTradeCharges(t), 0);
    list.forEach(t => map.set(t, real * (est !== 0 ? reportTradeCharges(t) / est : 1 / list.length)));
  });
  return map;
}
function dbChargeOf(t, map) { return map.has(t) ? map.get(t) : reportTradeCharges(t); }

/* ---------------- statistics for one period ----------------
   Every figure is "after charges": net = Gross P/L (pnlOf, Trade Log) + charges (ledger where a day has a ledger row, else estimated). */
// The charge map is the same for every figure in one dashboard draw, so renderDashboard builds it once
// (dbChargeCache) instead of once per dbStats call.
let dbChargeCache = null;
function dbStats(list) {
  const chargeMap = dbChargeCache || dbChargeMap();
  const rows = dbSorted(list).map(t => {
    const gross = pnlOf(t), chg = dbChargeOf(t, chargeMap);
    return { t, gross, chg, net: gross + chg, r: reportRrrOf(t) };
  });
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const avg = (arr, f) => arr.length ? sum(arr, f) / arr.length : null;
  const n = rows.length;
  const wins = rows.filter(x => x.net > 0), losses = rows.filter(x => x.net < 0);
  const grossWin = sum(wins, x => x.net), grossLoss = Math.abs(sum(losses, x => x.net));
  const net = sum(rows, x => x.net), gross = sum(rows, x => x.gross), charges = sum(rows, x => x.chg);

  // equity curve and drawdown (trade order)
  let cum = 0, peak = 0, maxDD = 0;
  const equity = [], under = [];
  rows.forEach(x => {
    cum += x.net; peak = Math.max(peak, cum);
    const dd = peak - cum; maxDD = Math.max(maxDD, dd);
    equity.push(cum); under.push(-dd);
  });
  const currentDD = n ? peak - cum : 0;

  // win / loss runs
  let curType = null, curStreak = 0, bestWin = 0, worstLoss = 0;
  rows.forEach(x => {
    const type = x.net > 0 ? 'win' : x.net < 0 ? 'loss' : null;
    if (!type) { curType = null; curStreak = 0; return; }
    curStreak = type === curType ? curStreak + 1 : 1;
    curType = type;
    if (type === 'win') bestWin = Math.max(bestWin, curStreak); else worstLoss = Math.max(worstLoss, curStreak);
  });

  // R-multiples (trades where the stop-loss gives a risk)
  const rr = rows.filter(x => x.r !== null);
  const rw = rr.filter(x => x.net > 0), rl = rr.filter(x => x.net < 0);

  // days
  const dayMap = {};
  rows.forEach(x => { dayMap[x.t.date] = (dayMap[x.t.date] || 0) + x.net; });
  const days = Object.keys(dayMap).sort();
  let bestDay = null, worstDay = null;
  days.forEach(d => {
    if (bestDay === null || dayMap[d] > dayMap[bestDay]) bestDay = d;
    if (worstDay === null || dayMap[d] < dayMap[worstDay]) worstDay = d;
  });

  const avgWin = avg(wins, x => x.net), avgLoss = avg(losses, x => Math.abs(x.net));
  return {
    rows, n, net, gross, charges, wins: wins.length, losses: losses.length,
    winRate: n ? wins.length / n * 100 : 0,
    pf: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    expectancy: n ? net / n : null,
    avgWin, avgLoss,
    payoff: avgWin && avgLoss ? avgWin / avgLoss : null,
    best: n ? rows.reduce((a, b) => (b.net > a.net ? b : a)) : null,
    worst: n ? rows.reduce((a, b) => (b.net < a.net ? b : a)) : null,
    equity, under, maxDD, currentDD,
    recovery: maxDD > 0 ? net / maxDD : null,
    curType, curStreak, bestWin, worstLoss,
    rCount: rr.length, avgR: avg(rr, x => x.r), avgWinR: avg(rw, x => x.r), avgLossR: avg(rl, x => x.r),
    days, dayMap, bestDay, worstDay,
    greenDays: days.filter(d => dayMap[d] > 0).length
  };
}
// average daily net over the 30 calendar days ending on each trading day
function dbRolling30(days, dayMap) {
  return days.map(d => {
    const end = new Date(d + 'T00:00:00'), start = new Date(end);
    start.setDate(start.getDate() - 29);
    const from = dbIso(start);
    const win = days.filter(x => x >= from && x <= d);
    return win.reduce((s, x) => s + dayMap[x], 0) / win.length;
  });
}
function dbMonthMap(rows) {
  const m = {};
  rows.forEach(x => { const k = x.t.date.slice(0, 7); m[k] = (m[k] || 0) + x.net; });
  return m;
}

/* ---------------- goal tracker (daily, weekly, monthly, yearly; after charges) ---------------- */
// each period has its own target: the key names the period it belongs to
// (monthly keeps the original key format, so an earlier monthly target still shows)
let goalPeriod = 'monthly';
const GOAL_LABELS = { daily: "Today's goal", weekly: "This week's goal", monthly: "This month's goal", yearly: "This year's goal" };
function goalRange(period) {
  const now = new Date();
  const today = dbIso(now);
  if (period === 'daily') return { key: 'tb_goal_d_' + today, test: d => d === today, label: 'today' };
  if (period === 'weekly') {
    const dow = (now.getDay() + 6) % 7;                       // weeks start on Monday
    const monday = dbIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow));
    return { key: 'tb_goal_w_' + monday, test: d => d >= monday && d <= today, label: 'this week' };
  }
  if (period === 'yearly') {
    const y = String(now.getFullYear());
    return { key: 'tb_goal_y_' + y, test: d => d.slice(0, 4) === y, label: 'this year' };
  }
  const m = dbIso(now).slice(0, 7);
  return { key: 'tb_goal_' + m, test: d => d.slice(0, 7) === m, label: 'this month' };
}
function loadGoal(period) {
  try { return parseFloat(localStorage.getItem(goalRange(period || goalPeriod).key)) || 0; } catch (e) { return 0; }
}
function saveGoal(v, period) {
  try { localStorage.setItem(goalRange(period || goalPeriod).key, String(v)); } catch (e) {}
}
// progress toward the chosen period's goal (net after estimated charges)
function renderGoal() {
  const range = goalRange(goalPeriod);
  const target = loadGoal(goalPeriod);
  document.getElementById('goalInput').value = target || '';
  document.getElementById('goalEyebrow').textContent = GOAL_LABELS[goalPeriod];
  document.querySelectorAll('.db-goal-tab').forEach(b => {
    const on = b.dataset.goalPeriod === goalPeriod;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const net = dbStats(trades.filter(t => t.date && range.test(t.date.slice(0, 10)))).net;
  const ring = document.getElementById('goalRing');
  const pctEl = document.getElementById('goalPct');
  const status = document.getElementById('goalStatus');
  const C = 2 * Math.PI * 50;
  ring.setAttribute('stroke-dasharray', C.toFixed(2));
  if (!target) {
    status.innerHTML = `${ fmtMoney(net) } ${ range.label }<br><span class="db-faint">no target set</span>`;
    ring.style.strokeDashoffset = C;
    ring.setAttribute('class', 'db-ring-fg');
    pctEl.textContent = '—';
    return;
  }
  const raw = net / target * 100;
  const pct = Math.max(0, Math.min(100, raw));
  ring.style.strokeDashoffset = C * (1 - pct / 100);
  ring.setAttribute('class', 'db-ring-fg' + (net >= target ? ' over' : ''));
  pctEl.textContent = Math.round(Math.max(0, raw)) + '%';
  const left = target - net;
  status.innerHTML = `${ fmtMoney(net) } of ${ fmtMoney(target) }<br><span class="${ left > 0 ? 'db-faint' : 'pos' }">${ left > 0 ? fmtMoney(left) + ' to go' : 'goal reached' }</span>`;
}
document.querySelectorAll('.db-goal-tab').forEach(b => b.addEventListener('click', () => {
  goalPeriod = b.dataset.goalPeriod;
  renderGoal();
}));
document.getElementById('goalSave').addEventListener('click', () => {
  const v = parseFloat(document.getElementById('goalInput').value) || 0;
  saveGoal(v, goalPeriod);
  renderGoal();
  showToast('Goal saved');
});

/* ---------------- section renderers ---------------- */
// a count followed by winners / losers in brackets, e.g. 15 (6 / 9): green winners, red losers
function dbCountSplit(total, wins, losses) {
  return `${ dbNum(total) } <span class="cal-kpi-sub">(<span class="cal-count-positive">${ dbNum(wins) }</span> / <span class="cal-count-negative">${ dbNum(losses) }</span>)</span>`;
}
function dbTile(label, value, cls, note) {
  return `<div class="db-tile ${ cls || '' }"><span>${ label }</span><b>${ value }</b>${ note ? `<small>${ note }</small>` : '' }</div>`;
}

function dbRenderHero(S) {
  const heroEl = document.getElementById('heroNet');
  heroEl.textContent = fmtMoney(S.net);
  heroEl.className = 'db-big ' + (S.net >= 0 ? 'pos' : 'neg');
  document.getElementById('heroFoot').textContent = S.n
    ? `Gross P/L ${ fmtMoney(S.gross) } · charges ${ fmtMoney(S.charges) } · ${ S.wins } wins / ${ S.losses } losses`
    : 'no trades in this period';

  const monthMap = dbMonthMap(S.rows);
  const months = Object.keys(monthMap).sort();
  const last = months[months.length - 1];
  document.getElementById('heroChips').innerHTML = months.length
    ? `<span class="db-chip ${ monthMap[last] >= 0 ? 'pos' : 'neg' }">${ monthMap[last] >= 0 ? '▲' : '▼' } ${ last } ${ fmtMoney(monthMap[last]) }</span>
       <span class="db-chip">${ months.filter(m => monthMap[m] > 0).length }/${ months.length } green months</span>`
    : '';

  VIZ.line({
    host: document.getElementById('equityChart'), height: 240, fmt: dbCompact,
    labels: S.rows.map(x => formatDateDisplay(x.t.date)),
    series: [{ name: 'Net P/L', data: S.equity, color: S.n && S.net < 0 ? '#e5534b' : '#5b8def', area: true, width: 2.2 }]
  });

  document.getElementById('equityFoot').innerHTML = `
    <div><span>Trades</span><b>${ dbCountSplit(S.n, S.wins, S.losses) }</b></div>
    <div><span>Trading days</span><b>${ dbCountSplit(S.days.length, Object.values(S.dayMap).filter(v => v > 0).length, Object.values(S.dayMap).filter(v => v < 0).length) }</b></div>
    <div><span>Best day</span><b class="pos">${ S.bestDay ? fmtMoney(S.dayMap[S.bestDay]) : '—' }</b></div>
    <div><span>Worst day</span><b class="neg">${ S.worstDay ? fmtMoney(S.dayMap[S.worstDay]) : '—' }</b></div>
    <div><span>Max drawdown</span><b class="neg">${ S.n ? fmtMoney(-S.maxDD) : '—' }</b></div>`;

  // last 24 trades as win / loss pips, plus run summary
  const pips = S.rows.slice(-24).map(x => `<i class="${ x.net > 0 ? 'w' : x.net < 0 ? 'l' : '' }" title="${ x.t.symbol || '' } · ${ formatDateDisplay(x.t.date) } · ${ fmtMoney(x.net) }"></i>`);
  while (pips.length < 24) pips.unshift('<i></i>');
  document.getElementById('streakPips').innerHTML = pips.join('');
  const one = S.curStreak === 1;
  const curWord = S.curType === 'win' ? (one ? 'win' : 'wins') : (one ? 'loss' : 'losses');
  const curLabel = S.curType ? `${ S.curStreak } ${ curWord }` : '—';
  document.getElementById('streakChips').innerHTML = `
    <span class="db-chip ${ S.curType === 'win' ? 'pos' : S.curType === 'loss' ? 'neg' : '' }">Current ${ curLabel }</span>
    <span class="db-chip pos">Best win run ${ S.bestWin }</span>
    <span class="db-chip neg">Worst loss run ${ S.worstLoss }</span>`;
}

function dbRenderKpis(S) {
  const cls = v => (v === null ? '' : dbCls(v));
  document.getElementById('kpiGrid').innerHTML = [
    dbTile('Net P/L', fmtMoney(S.net), cls(S.net), 'after ledger charges'),
    dbTile('Gross P/L', fmtMoney(S.gross), cls(S.gross), 'before charges'),
    dbTile('Charges', fmtMoney(S.charges), 'neg', 'from ledger, estimate if none'),
    dbTile('Trades', dbCountSplit(S.n, S.wins, S.losses), '', ''),
    dbTile('Win rate', S.n ? dbPct(S.winRate) : '—', S.winRate >= 50 ? 'pos' : S.n ? 'neg' : '', 'winners ÷ trades'),
    dbTile('Profit factor', S.n ? dbRatio(S.pf) : '—', S.pf !== null && S.pf >= 1 ? 'pos' : S.n ? 'neg' : '', 'gross win ÷ gross loss'),
    dbTile('Expectancy', S.n ? fmtMoney(S.expectancy) : '—', cls(S.expectancy), 'net per trade'),
    dbTile('Payoff ratio', S.payoff !== null ? dbRatio(S.payoff) : '—', '', 'avg winner ÷ avg loser'),
    dbTile('Avg winner', S.avgWin !== null ? fmtMoney(S.avgWin) : '—', 'pos', 'net'),
    dbTile('Avg loser', S.avgLoss !== null ? fmtMoney(-S.avgLoss) : '—', 'neg', 'net'),
    dbTile('Best trade', S.best ? fmtMoney(S.best.net) : '—', 'pos', S.best ? `${ S.best.t.symbol || '' } · ${ formatDateDisplay(S.best.t.date) }` : ''),
    dbTile('Worst trade', S.worst ? fmtMoney(S.worst.net) : '—', 'neg', S.worst ? `${ S.worst.t.symbol || '' } · ${ formatDateDisplay(S.worst.t.date) }` : '')
  ].join('');
}

function dbRenderRisk(S) {
  document.getElementById('ddSub').textContent = S.n ? 'peak-to-trough, net' : '';
  VIZ.line({
    host: document.getElementById('drawdownChart'), height: 220, fmt: dbCompact,
    labels: S.rows.map(x => formatDateDisplay(x.t.date)),
    series: [{ name: 'Drawdown', data: S.under, color: '#e5534b', area: true, width: 1.8 }]
  });
  document.getElementById('riskTiles').innerHTML = [
    dbTile('Max drawdown', S.n ? fmtMoney(-S.maxDD) : '—', 'neg', 'largest fall from a peak'),
    dbTile('Current drawdown', S.n ? fmtMoney(-S.currentDD) : '—', S.currentDD > 0 ? 'neg' : 'pos', S.currentDD > 0 ? 'below the last peak' : 'at a peak'),
    dbTile('Recovery factor', dbRatio(S.recovery), S.recovery !== null && S.recovery >= 1 ? 'pos' : '', 'net ÷ max drawdown'),
    dbTile('Green days', S.days.length ? dbPct(S.greenDays / S.days.length * 100) : '—', '', `${ S.greenDays } of ${ S.days.length } trading days`),
    dbTile('Longest win run', dbNum(S.bestWin), 'pos', 'trades in a row'),
    dbTile('Longest loss run', dbNum(S.worstLoss), 'neg', 'trades in a row')
  ].join('');
}


function dbRenderDistribution(S) {
  VIZ.histogram({
    host: document.getElementById('pnlHistogram'), values: S.rows.map(x => x.net), bins: 24, height: 220, fmt: dbCompact
  });
  VIZ.scatter({
    host: document.getElementById('rScatter'), height: 220, xLabel: 'R', xFmt: v => v.toFixed(1) + 'R', yFmt: dbCompact,
    points: S.rows.filter(x => x.r !== null).map(x => {
      const r = Math.max(-5, Math.min(5, x.r));
      return { x: r, y: x.net, color: x.net >= 0 ? '#2fb170' : '#e5534b', label: `${ x.t.symbol || '' } · ${ formatDateDisplay(x.t.date) }\nR ${ dbR(x.r) } · net ${ fmtMoney(x.net) }` };
    })
  });
  const byOpt = [...dbGroup(S.rows, x => x.t.optType).entries()].sort((a, b) => b[1].length - a[1].length);
  VIZ.boxplot({
    host: document.getElementById('optionBox'), height: 220, fmt: dbCompact,
    groups: byOpt.map(([name, rows], i) => ({ label: name, values: rows.map(x => x.net), color: DB_PALETTE[i % DB_PALETTE.length] }))
  });
}

function dbRenderCharts(S) {
  const monthMap = dbMonthMap(S.rows);
  const months = Object.keys(monthMap).sort();
  const greenMonths = months.filter(m => monthMap[m] > 0).length;
  document.getElementById('monthlySub').textContent = months.length ? `${ months.length } months · ${ greenMonths } profitable` : '';
  VIZ.bars({
    host: document.getElementById('monthlyChart'), height: 220, fmt: dbCompact,
    labels: months, values: months.map(m => monthMap[m]), name: 'Net P/L',
    colors: months.map(m => monthMap[m] >= 0 ? '#2fb170' : '#e5534b'), maxBar: 24
  });

  // winners vs losers per month (stacked: winners up, losers down)
  const winMap = {}, lossMap = {};
  S.rows.forEach(x => {
    const k = x.t.date.slice(0, 7);
    if (x.net > 0) winMap[k] = (winMap[k] || 0) + x.net;
    else if (x.net < 0) lossMap[k] = (lossMap[k] || 0) + x.net;
  });
  VIZ.bars({
    host: document.getElementById('monthlyStack'), height: 220, fmt: dbCompact, stacked: true,
    labels: months,
    series: [
      { name: 'Winners', data: months.map(m => winMap[m] || 0), color: '#2fb170' },
      { name: 'Losers', data: months.map(m => lossMap[m] || 0), color: '#e5534b' }
    ],
    maxBar: 24
  });

  VIZ.donut({
    host: document.getElementById('winLossChart'), height: 200, hole: 0.66,
    items: [
      { label: 'Winners', value: S.wins, color: '#2fb170' },
      { label: 'Losers', value: S.losses, color: '#e5534b' },
      { label: 'Breakeven', value: S.n - S.wins - S.losses, color: '#8d99ae' }
    ].filter(i => i.value > 0),
    centerText: S.n ? S.winRate.toFixed(0) + '%' : '—', centerSub: 'win rate',
    fmt: v => dbNum(v) + ' trades'
  });

  const byBroker = [...dbGroup(S.rows, x => x.t.broker).entries()].map(([name, rows]) => ({ name, n: rows.length })).sort((a, b) => b.n - a.n);
  const top = byBroker.slice(0, 6), rest = byBroker.slice(6).reduce((s, b) => s + b.n, 0);
  const pieItems = top.map((b, i) => ({ label: b.name, value: b.n, color: DB_PALETTE[i] }));
  if (rest) pieItems.push({ label: 'Other', value: rest, color: '#8d99ae' });
  VIZ.donut({ host: document.getElementById('brokerPie'), height: 200, hole: 0, items: pieItems, fmt: v => dbNum(v) + ' trades' });
}

function dbRenderProfile(S) {
  // broker radar: the four busiest brokers, each axis scaled 0..1
  const byBroker = [...dbGroup(S.rows, x => x.t.broker).entries()]
    .map(([name, rows]) => ({ name, s: dbStats(rows.map(x => x.t)) }))
    .sort((a, b) => b.s.n - a.s.n).slice(0, 4);
  const nets = byBroker.map(b => b.s.net);
  const nMin = Math.min(0, ...nets), nMax = Math.max(0, ...nets);
  const axes = ['Win rate', 'Profit factor', 'Avg R', 'Net P/L', 'Trade share'];
  VIZ.radar({
    host: document.getElementById('brokerRadar'), height: 260,
    axes,
    series: byBroker.map((b, i) => ({
      name: b.name,
      color: DB_PALETTE[i % DB_PALETTE.length],
      values: [
        b.s.winRate / 100,
        Math.min(2, isFinite(b.s.pf) ? (b.s.pf || 0) : 2) / 2,
        b.s.avgR === null ? 0.5 : (Math.max(-1, Math.min(1, b.s.avgR)) + 1) / 2,
        nMax === nMin ? 0.5 : (b.s.net - nMin) / (nMax - nMin),
        S.n ? b.s.n / S.n : 0
      ],
      raw: [dbPct(b.s.winRate), dbRatio(b.s.pf), dbR(b.s.avgR), fmtMoney(b.s.net), dbPct(S.n ? b.s.n / S.n * 100 : 0)]
    }))
  });

  // weekday (Mon–Fri) × month of year: net per cell, summed over the years in the period
  const cells = Array.from({ length: 5 }, () => Array(12).fill(null));
  S.days.forEach(d => {
    const w = dbWeekdayIndex(d);
    if (w > 4) return;
    const m = Number(d.slice(5, 7)) - 1;
    cells[w][m] = (cells[w][m] || 0) + S.dayMap[d];
  });
  VIZ.heatmap({
    host: document.getElementById('weekMonthHeat'), height: 220, fmt: dbCompact,
    rowLabels: DB_WEEKDAYS.slice(0, 5), colLabels: DB_MONTHS, matrix: cells
  });

  VIZ.gauge({ host: document.getElementById('winGauge'), value: S.winRate, max: 100, label: 'win rate', color: '#5b8def', fmt: v => v.toFixed(0) + '%', height: 130 });
  const greenPct = S.days.length ? S.greenDays / S.days.length * 100 : 0;
  VIZ.gauge({ host: document.getElementById('greenGauge'), value: greenPct, max: 100, label: 'green days', color: '#2fb170', fmt: v => v.toFixed(0) + '%', height: 130 });
}

function dbRenderTime(S) {
  // weekday: net per weekday (trading days), Mon–Fri plus any weekend trading
  const wd = DB_WEEKDAYS.map(() => ({ net: 0, days: 0, trades: 0 }));
  S.days.forEach(d => { const i = dbWeekdayIndex(d); wd[i].net += S.dayMap[d]; wd[i].days++; });
  S.rows.forEach(x => { wd[dbWeekdayIndex(x.t.date)].trades++; });
  const wdShown = wd.map((v, i) => ({ label: DB_WEEKDAYS[i], ...v })).filter((v, i) => i < 5 || v.trades > 0);
  document.getElementById('weekdaySub').textContent = S.n ? 'average day by weekday' : '';
  VIZ.bars({
    host: document.getElementById('weekdayChart'), height: 220, fmt: dbCompact,
    labels: wdShown.map(v => v.label), values: wdShown.map(v => v.net), name: 'Net P/L',
    colors: wdShown.map(v => v.net >= 0 ? '#2fb170' : '#e5534b'), maxBar: 40
  });

  // month of year: net per calendar month, summed over all years in the period
  const my = DB_MONTHS.map(() => 0);
  S.days.forEach(d => { my[Number(d.slice(5, 7)) - 1] += S.dayMap[d]; });
  document.getElementById('monthOfYearSub').textContent = S.n ? 'summed across years' : '';
  VIZ.bars({
    host: document.getElementById('monthOfYearChart'), height: 220, fmt: dbCompact,
    labels: DB_MONTHS, values: my, name: 'Net P/L', colors: my.map(v => v >= 0 ? '#2fb170' : '#e5534b'), maxBar: 24
  });

  // rolling 30-day average of daily net
  const roll = dbRolling30(S.days, S.dayMap);
  document.getElementById('rollingSub').textContent = S.days.length ? 'average daily net, last 30 days' : '';
  VIZ.line({
    host: document.getElementById('rollingChart'), height: 220, fmt: dbCompact,
    labels: S.days.map(d => formatDateDisplay(d)),
    series: [{ name: 'Avg / day', data: roll, color: '#f0a030', width: 2 }]
  });
}

function dbHeatmap() {
  const dm = {};
  // net after charges (ledger where available), the same basis as the rest of the dashboard
  const chargeMap = dbChargeMap();
  trades.filter(t => t.date).forEach(t => { dm[t.date] = (dm[t.date] || 0) + pnlOf(t) + dbChargeOf(t, chargeMap); });
  const keys = Object.keys(dm).sort();
  const grid = document.getElementById('heatGrid');
  const monthsEl = document.getElementById('heatMonths');
  if (!keys.length) { grid.innerHTML = ''; monthsEl.innerHTML = ''; document.getElementById('heatSub').textContent = ''; return; }
  const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  let end = parse(keys[keys.length - 1]);
  const today = new Date();
  if (end > today) end = today;
  const endSunday = new Date(end); endSunday.setDate(end.getDate() + ((7 - ((end.getDay() + 6) % 7) - 1) % 7));
  const WEEKS = 26;
  const startMon = new Date(endSunday); startMon.setDate(endSunday.getDate() - WEEKS * 7 + 1);
  const vals = Object.values(dm).map(Math.abs).sort((a, b) => a - b);
  const q = p => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 1;
  const t1 = q(0.4), t2 = q(0.7), t3 = q(0.9);
  let html = '', monthHtml = '', lastMonth = -1, sum = 0, dayCount = 0;
  for (let w = 0; w < WEEKS; w++) {
    const wkStart = new Date(startMon); wkStart.setDate(startMon.getDate() + w * 7);
    const mo = wkStart.getMonth();
    monthHtml += `<span>${ mo !== lastMonth ? wkStart.toLocaleString('en-US', { month: 'short' }) : '' }</span>`;
    lastMonth = mo;
    for (let d = 0; d < 7; d++) {
      const dt = new Date(startMon); dt.setDate(startMon.getDate() + w * 7 + d);
      if (dt > end) { html += '<i class="blank"></i>'; continue; }
      const k = dbIso(dt);
      if (dm[k] === undefined) { html += '<i></i>'; continue; }
      const v = dm[k]; sum += v; dayCount++;
      const a = Math.abs(v);
      const lvl = a >= t3 ? 4 : a >= t2 ? 3 : a >= t1 ? 2 : 1;
      const cls = v === 0 ? '' : (v > 0 ? 'g' : 'l') + lvl;
      html += `<i class="has ${ cls }" title="${ formatDateDisplay(k) } · ${ fmtMoney(v) }"></i>`;
    }
  }
  grid.innerHTML = html;
  monthsEl.innerHTML = monthHtml;
  const hs = grid.closest('.heat-scroll'); if (hs) hs.scrollLeft = hs.scrollWidth;
  document.getElementById('heatSub').textContent = `${ dayCount } trading days · ${ fmtMoney(sum) } net (all time)`;
}

function dbRenderRhythm(S) {
  dbHeatmap();
  const ranked = S.days.map(d => [d, S.dayMap[d]]);
  const best = ranked.slice().sort((a, b) => b[1] - a[1]).slice(0, 5);
  const worst = ranked.slice().sort((a, b) => a[1] - b[1]).slice(0, 5);
  const row = ([d, v]) => `<div class="db-list-row"><span>${ formatDateDisplay(d) }</span><b class="${ dbCls(v) }">${ fmtMoney(v) }</b></div>`;
  document.getElementById('bestDays').innerHTML = best.map(row).join('') || `<div class="db-faint">No trading days in this period.</div>`;
  document.getElementById('worstDays').innerHTML = worst.map(row).join('') || `<div class="db-faint">No trading days in this period.</div>`;
}

function dbRenderBreakdown(S) {
  const stat = rows => dbStats(rows.map(x => x.t));
  // by broker / account
  const byBroker = [...dbGroup(S.rows, x => x.t.broker).entries()]
    .map(([name, rows]) => ({ name, s: stat(rows) }))
    .sort((a, b) => b.s.net - a.s.net);
  // waterfall: each broker's net, then the total
  VIZ.waterfall({
    host: document.getElementById('brokerWaterfall'), height: 240, fmt: dbCompact,
    labels: byBroker.map(b => b.name), deltas: byBroker.map(b => b.s.net)
  });
  const brokerRows = byBroker.map(b => {
    const type = calBrokerTypeOf({ broker: b.name });
    return [
      { html: `${ dbEsc(b.name) } <span class="db-badge ${ type }">${ type === 'real' ? 'Real' : 'Paper' }</span>` },
      { html: dbNum(b.s.n), cls: 'num' },
      { html: dbNum(b.s.days.length), cls: 'num' },
      { html: dbPct(b.s.winRate), cls: 'num' },
      { html: fmtMoney(b.s.gross), cls: 'num ' + dbCls(b.s.gross) },
      { html: fmtMoney(b.s.net), cls: 'num ' + dbCls(b.s.net) },
      { html: fmtMoney(b.s.charges), cls: 'num neg' },
      { html: dbRatio(b.s.pf), cls: 'num' },
      { html: dbR(b.s.avgR), cls: 'num ' + dbCls(b.s.avgR) }
    ];
  });
  // total row: trades, gross, net, charges and the overall ratios for the whole period.
  // Days is the number of distinct trading days across all brokers (a day traded with two brokers counts once).
  if (byBroker.length) {
    brokerRows.push([
      { html: 'Total' },
      { html: dbNum(S.n), cls: 'num' },
      { html: dbNum(S.days.length), cls: 'num' },
      { html: dbPct(S.winRate), cls: 'num' },
      { html: fmtMoney(S.gross), cls: 'num ' + dbCls(S.gross) },
      { html: fmtMoney(S.net), cls: 'num ' + dbCls(S.net) },
      { html: fmtMoney(S.charges), cls: 'num neg' },
      { html: dbRatio(S.pf), cls: 'num' },
      { html: dbR(S.avgR), cls: 'num ' + dbCls(S.avgR) }
    ]);
  }
  const brokerAttrs = byBroker.map(b => `class="clickable" data-broker="${ dbEsc(b.name) }" title="Show these trades in the Trade log"`);
  if (byBroker.length) brokerAttrs.push('class="db-total"');
  document.getElementById('brokerTable').innerHTML = byBroker.length
    ? dbTable([{ label: 'Broker' }, { label: 'Trades', num: 1 }, { label: 'Days', num: 1 }, { label: 'Win rate', num: 1 }, { label: 'Gross P/L', num: 1 }, { label: 'Net P/L', num: 1 }, { label: 'Charges', num: 1 }, { label: 'PF', num: 1 }, { label: 'Avg R', num: 1 }], brokerRows, brokerAttrs)
    : `<div class="db-faint db-empty">No data in this period.</div>`;

  // most traded symbols: top 10 by count
  const bySym = [...dbGroup(S.rows, x => x.t.symbol).entries()]
    .map(([name, rows]) => ({ name, s: stat(rows) }))
    .sort((a, b) => b.s.n - a.s.n).slice(0, 10);
  VIZ.bars({
    host: document.getElementById('symbolBars'), height: Math.max(180, bySym.length * 26 + 20), horizontal: true, fmt: dbCompact,
    labels: bySym.map(b => b.name), values: bySym.map(b => b.s.net), name: 'Net P/L',
    colors: bySym.map(b => b.s.net >= 0 ? '#2fb170' : '#e5534b')
  });
  const symRows = bySym.map(b => [
    { html: dbEsc(b.name) },
    { html: dbNum(b.s.n), cls: 'num' },
    { html: dbPct(b.s.winRate), cls: 'num' },
    { html: fmtMoney(b.s.net), cls: 'num ' + dbCls(b.s.net) }
  ]);
  const symAttrs = bySym.map(b => `class="clickable" data-symbol="${ dbEsc(b.name) }" title="Show these trades in the Trade log"`);
  document.getElementById('symbolTable').innerHTML = bySym.length
    ? dbTable([{ label: 'Symbol' }, { label: 'Trades', num: 1 }, { label: 'Win rate', num: 1 }, { label: 'Net P/L', num: 1 }], symRows, symAttrs)
    : `<div class="db-faint db-empty">No data in this period.</div>`;

  // option type (EQ / CE / PE)
  const byOpt = [...dbGroup(S.rows, x => x.t.optType).entries()]
    .map(([name, rows]) => ({ name, s: stat(rows) }))
    .sort((a, b) => b.s.n - a.s.n);
  document.getElementById('optionTable').innerHTML = byOpt.length
    ? dbTable([{ label: 'Type' }, { label: 'Trades', num: 1 }, { label: 'Win rate', num: 1 }, { label: 'Net P/L', num: 1 }],
        byOpt.map(o => [{ html: dbEsc(o.name) }, { html: dbNum(o.s.n), cls: 'num' }, { html: dbPct(o.s.winRate), cls: 'num' }, { html: fmtMoney(o.s.net), cls: 'num ' + dbCls(o.s.net) }]))
    : `<div class="db-faint db-empty">No data in this period.</div>`;
}

function dbRenderReview(S) {
  // the "disciplined" field holds the review tag written for each trade (e.g. "Right trade", "Wrong timing")
  const byTag = [...dbGroup(S.rows, x => (x.t.disciplined || '').trim() || 'Untagged').entries()]
    .map(([name, rows]) => ({ name, s: dbStats(rows.map(x => x.t)) }))
    .sort((a, b) => b.s.n - a.s.n);
  const top8 = byTag.slice(0, 8);
  VIZ.bars({
    host: document.getElementById('reviewBars'), height: Math.max(180, top8.length * 26 + 20), horizontal: true, fmt: dbCompact,
    labels: top8.map(g => g.name), values: top8.map(g => g.s.net), name: 'Net P/L',
    colors: top8.map(g => g.s.net >= 0 ? '#2fb170' : '#e5534b')
  });
  const table = byTag.slice(0, 12);
  document.getElementById('reviewTable').innerHTML = table.length
    ? dbTable([{ label: 'Review tag' }, { label: 'Trades', num: 1 }, { label: 'Share', num: 1 }, { label: 'Win rate', num: 1 }, { label: 'Net P/L', num: 1 }, { label: 'Avg per trade', num: 1 }],
        table.map(g => [
          { html: dbEsc(g.name) },
          { html: dbNum(g.s.n), cls: 'num' },
          { html: S.n ? dbPct(g.s.n / S.n * 100) : '—', cls: 'num' },
          { html: dbPct(g.s.winRate), cls: 'num' },
          { html: fmtMoney(g.s.net), cls: 'num ' + dbCls(g.s.net) },
          { html: fmtMoney(g.s.expectancy), cls: 'num ' + dbCls(g.s.expectancy) }
        ]))
    : `<div class="db-faint db-empty">No data in this period.</div>`;
}

/* ---------------- main render ---------------- */
// broker, range buttons and day / week / month / year dropdowns: the same controls and logic as Reports and Risk
function renderDashControls() {
  dashBroker = fillBrokerFilter(document.getElementById('dashBrokerFilter'), trades);
  renderDateRange('dash');
  renderDateFilters('dash', trades.filter(t => matchesBrokerFilter(t, dashBroker)));
}

function renderDashboard() {
  dbChargeCache = dbChargeMap();
  try { renderDashboardBody(); } finally { dbChargeCache = null; }
}
function renderDashboardBody() {
  renderDashControls();
  const S = dbStats(dbRangeList());


  renderGoal();
  dbRenderHero(S);
  dbRenderKpis(S);
  dbRenderRisk(S);
  dbRenderDistribution(S);
  dbRenderCharts(S);
  dbRenderProfile(S);
  dbRenderTime(S);
  dbRenderRhythm(S);
  dbRenderBreakdown(S);
  dbRenderReview(S);
  document.getElementById('sidebarStat').textContent = `${ trades.length.toLocaleString(numLocale()) } trades on record`;
}
// the range buttons and date dropdowns are wired in reports.js (they re-render the Dashboard too)
document.getElementById('dashBrokerFilter').addEventListener('change', e => {
  dashBroker = e.target.value;
  renderDashboard();
});
// click a broker or symbol row to open that filter in the Trade log
document.getElementById('brokerTable').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-broker]');
  if (!tr) return;
  populateBrokerFilter();
  document.getElementById('fBroker').value = 'broker:' + tr.dataset.broker;
  page = 1;
  switchView('trades');
});
document.getElementById('symbolTable').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-symbol]');
  if (!tr) return;
  document.getElementById('fSearch').value = tr.dataset.symbol;
  page = 1;
  switchView('trades');
});

/* ---------------- dashboard layout: show/hide and reorder the widgets ----------------
   The layout is a per-browser convenience, saved in localStorage (a bad or missing value falls back to the default). */
const DASH_LAYOUT_KEY = 'tb_dash_layout';
const DASH_WIDGETS = [
  { id: 'hero',        label: 'Net P/L, equity, goal & runs' },
  { id: 'kpis',        label: 'Key metrics' },
  { id: 'risk',        label: 'Drawdown & risk' },
  { id: 'distribution', label: 'Distribution, scatter & spread' },
  { id: 'charts',      label: 'Monthly results, win / loss & brokers' },
  { id: 'profile',     label: 'Broker profile, heatmap & gauges' },
  { id: 'time',        label: 'Time analysis' },
  { id: 'rhythm',      label: 'Daily rhythm & best / worst days' },
  { id: 'breakdown',   label: 'Broker, symbol & option breakdown' },
  { id: 'review',      label: 'Trade review tags' }
];
function defaultDashLayout() { return DASH_WIDGETS.map(w => ({ id: w.id, visible: true })); }
function loadDashLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(DASH_LAYOUT_KEY) || 'null');
    if (!Array.isArray(saved)) return defaultDashLayout();
    const known = new Set(DASH_WIDGETS.map(w => w.id));
    const seen = new Set();
    const layout = saved
      .filter(s => s && known.has(s.id) && !seen.has(s.id) && seen.add(s.id))
      .map(s => ({ id: s.id, visible: s.visible !== false }));
    DASH_WIDGETS.forEach(w => { if (!seen.has(w.id)) layout.push({ id: w.id, visible: true }); });   // widgets added later appear at the end
    return layout;
  } catch (e) { return defaultDashLayout(); }
}
function saveDashLayout(layout) { try { localStorage.setItem(DASH_LAYOUT_KEY, JSON.stringify(layout)); } catch (e) {} }
function applyDashLayout() {
  const host = document.getElementById('view-dashboard');
  if (!host) return;
  loadDashLayout().forEach(item => {
    const el = host.querySelector(`[data-widget="${ item.id }"]`);
    if (!el) return;
    host.appendChild(el);                         // moving to the end, in saved order, puts every widget in its place
    el.style.display = item.visible ? '' : 'none';
  });
}
function renderDashCustomPanel() {
  const panel = document.getElementById('dashCustomPanel');
  if (!panel) return;
  const labels = Object.fromEntries(DASH_WIDGETS.map(w => [w.id, w.label]));
  panel.innerHTML = `
    <div class="dash-custom-head">
      <div><b>Customize dashboard</b><span>Show or hide sections, and move them up or down. Saved in this browser.</span></div>
      <button type="button" class="btn small" data-dash-reset>Reset</button>
    </div>
    ${ loadDashLayout().map((item, i, all) => `
      <div class="dash-custom-row">
        <label><input type="checkbox" data-dash-toggle="${ item.id }" ${ item.visible ? 'checked' : '' }> ${ labels[item.id] }</label>
        <span class="dash-custom-move">
          <button type="button" class="btn small" data-dash-move="${ item.id }" data-dir="-1" aria-label="Move ${ labels[item.id] } up" ${ i === 0 ? 'disabled' : '' }>↑</button>
          <button type="button" class="btn small" data-dash-move="${ item.id }" data-dir="1" aria-label="Move ${ labels[item.id] } down" ${ i === all.length - 1 ? 'disabled' : '' }>↓</button>
        </span>
      </div>`).join('') }`;
}
(function setupDashCustomize() {
  const btn = document.getElementById('dashCustomizeBtn');
  const panel = document.getElementById('dashCustomPanel');
  if (!btn || !panel) return;
  applyDashLayout();
  btn.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) renderDashCustomPanel();
  });
  panel.addEventListener('change', e => {
    const box = e.target.closest('[data-dash-toggle]');
    if (!box) return;
    const layout = loadDashLayout();
    layout.find(i => i.id === box.dataset.dashToggle).visible = box.checked;
    saveDashLayout(layout); applyDashLayout();
  });
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-dash-reset]')) {
      saveDashLayout(defaultDashLayout()); applyDashLayout(); renderDashCustomPanel(); return;
    }
    const mv = e.target.closest('[data-dash-move]');
    if (!mv) return;
    const layout = loadDashLayout();
    const i = layout.findIndex(x => x.id === mv.dataset.dashMove);
    const j = i + Number(mv.dataset.dir);
    if (i < 0 || j < 0 || j >= layout.length) return;
    [layout[i], layout[j]] = [layout[j], layout[i]];
    saveDashLayout(layout); applyDashLayout(); renderDashCustomPanel();
  });
})();
