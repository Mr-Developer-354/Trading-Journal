// ======================================================================
// reports.js — Reports view (Status, Daily, Weekly, Monthly, Yearly (FY), Symbol) and the
// Risk management page (sidebar). The two pages are separate; both are built here.
// The formulas follow the report sheets of "Paper Trade + Old Records.xlsm"
// (those sheets covered Fyers only). Here the Broker filter decides which
// trades and ledger rows count, so one broker, the Real / Paper groups or
// all brokers can be reported with the same layout.
// ======================================================================
/* ---------------- reports: settings ---------------- */
const REPORT_TABS = [
  { key: 'analysis', label: 'Analysis' },
  { key: 'status',  label: 'Status' },
  { key: 'daily',   label: 'Daily' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly',  label: 'Yearly (FY)' },
  { key: 'symbol',  label: 'Symbol' }
];
// Target multiples of the Daily TA (the workbook's Target1 … Target5 inputs)
const REPORT_TARGETS = {
  daily:   [0.025, 0.05, 0.08, 0.11, 0.14],
  weekly:  [0.02, 0.05, 0.10, 0.15, 0.20],
  monthly: [0.10, 0.20, 0.30, 0.40, 0.50],
  yearly:  [0.30, 0.60, 1.00, 1.50, 2.00]
};
// Risk bins on each trade's Gross P/L % (the workbook's Risk_Management columns C…P).
// Lower edge excluded, upper edge included: lo < P/L ≤ hi. The first seven bins are losses, the last seven profits.
const REPORT_RISK_BINS = [
  { label: '≤ −4.5%',        lo: -Infinity, hi: -4.5 },
  { label: '≤ −3.5%',        lo: -4.5, hi: -3.5 },
  { label: '≤ −2.4%',        lo: -3.5, hi: -2.4 },
  { label: '≤ −1.5%',        lo: -2.4, hi: -1.5 },
  { label: '≤ −0.8%',        lo: -1.5, hi: -0.8 },
  { label: '≤ −0.4%',        lo: -0.8, hi: -0.4 },
  { label: '≤ 0.11%',        lo: -0.4, hi: 0.11 },
  { label: '> 0.11%',        lo: 0.11, hi: 0.5 },
  { label: '≥ 0.5%',         lo: 0.5,  hi: 1 },
  { label: '≥ 1%',           lo: 1,    hi: 2 },
  { label: '≥ 2%',           lo: 2,    hi: 3 },
  { label: '≥ 3%',           lo: 3,    hi: 4 },
  { label: '≥ 4%',           lo: 4,    hi: 5 },
  { label: '≥ 5%',           lo: 5,    hi: Infinity }
];
const REPORT_LOSS_BINS = 7;   // bins 0–6 are losses (workbook SUM(C:I)), bins 7–13 are profits (SUM(J:P))
// [key, label, ledger field (canonical name)] — the charge columns of the ledger
const REPORT_CHARGE_KEYS = [
  ['brokerage', 'Brokerage',          'Brokerage'],
  ['exchange',  'NSE transaction ch.', 'Exchange'],
  ['ipft',      'NSE IPFT',           'IPFT'],
  ['sebi',      'SEBI turnover',      'SEBI'],
  ['igst',      'IGST',               'IGST'],
  ['stt',       'Securities tx. tax', 'STT'],
  ['stamp',     'Stamp duty',         'Stamp'],
  ['sqroff',    'Auto square-off',    'SqrOff'],
  ['dp',        'DP charges',         'DPChgs']
];
// Hover text that shows the formula behind each heading, KPI card and row label.
// Keys are the visible labels. Explicit tips passed by the builders win over these.
const REPORT_FORMULA_TIPS = {
  'Trades': 'Number of trades in the period',
  'Wins': 'Trades with Gross P/L > 0',
  'Loss': 'Trades with Gross P/L ≤ 0',
  'Win %': 'Wins ÷ Trades',
  'Days': 'Trading days in the period',
  '+ Gross days': 'Days with Gross P/L > 0',
  '− Gross days': 'Days with Gross P/L ≤ 0',
  '+ Gross days %': '+ Gross days ÷ Days',
  '+ Net days': 'Days with Net P/L > 0',
  '− Net days': 'Days with Net P/L ≤ 0',
  '+ Net days %': '+ Net days ÷ Days',
  'RRR': 'Average of each trade’s RRR, where RRR = (Exit − Entry) ÷ (Entry − Stop loss), rounded to 2 dp',
  'Gross P/L': 'Σ (Exit − Entry) × Qty',
  'Net P/L': 'Σ Net P/L of the ledger rows (Pay In/Out + Real charges). A broker without a ledger row: Gross P/L + estimated charges',
  'Per P/L': 'Gross P/L ÷ average Daily TA',
  'Net per P/L': 'Net P/L ÷ average Daily TA',
  'Exp. charges': 'Σ charges estimated on the trades (Trade Log)',
  'Real charges': 'Σ charges from the ledger (Brokerage + Exchange + IPFT + SEBI + IGST + STT + Stamp + Sq. off + DP). Estimate where no ledger row',
  'Credit': 'Σ ledger Credit',
  'Debit': 'Σ ledger Debit',
  'Balance': 'Running balance per broker at the end of the period: previous balance + Pay In/Out + charges',
  'Daily TA': 'Average of the ledger Daily TA over the period',
  'Taxable': 'Σ ledger Taxable',
  'Avg Per P/L': 'Average of each trade’s % P/L',
  'Week': 'Monday to Friday of the week',
  'Loss T.': 'Trades in the seven loss bins',
  'Profit T.': 'Trades in the seven profit bins',
  'Total T.': 'Loss T. + Profit T.',
  '% Profit': 'Profit T. ÷ Total T.',
  'Net P/L (incl. charges)': 'Σ Net P/L of the period (PLIC)',
  'Closing balance': 'Net used balance (UB) + Net P/L (CB)',
  'Win rate': 'Wins ÷ Trades',
  'Average RRR': 'Average of each trade’s RRR (2 dp)',
  'Total charges': 'Σ of all charge columns (shown as a cost)',
  'Trading days': 'Days with at least one trade or ledger activity',
  'Total credit': 'Σ ledger Credit',
  'Total debit': 'Σ ledger Debit',
  'Net used balance (UB)': 'Credit + debit',
  'Net P/L incl. charges (PLIC)': 'Σ Net P/L (ledger, or Gross + estimated charges where there is no ledger row)',
  'Closing balance (CB)': 'UB + PLIC',
  'Gross P/L (before charges)': 'Σ (Exit − Entry) × Qty',
  'Charges ÷ UB': 'Total charges ÷ UB',
  'Net P/L excl. charges ÷ UB': '(PLIC + Total charges) ÷ UB',
  'Net P/L incl. charges ÷ UB': 'PLIC ÷ UB',
  'Closing balance ÷ UB': 'CB ÷ UB',
  'Charges ÷ |Net P/L|': 'Total charges ÷ |PLIC|',
  'Net P/L excl. charges ÷ |Net P/L|': '(PLIC + Total charges) ÷ |PLIC|',
  'Winning trades': 'Trades with Gross P/L > 0',
  'Losing trades': 'Trades with Gross P/L ≤ 0',
  'Win / loss ratio': 'Winning trades ÷ Losing trades',
  'RRR average': 'Average of each trade’s RRR (2 dp)',
  'Average % profit': 'Average of the % P/L of the winning trades (Gross P/L ÷ |Entry × Qty|)',
  'Average % loss': 'Average of the % P/L of the losing trades (Gross P/L ÷ |Entry × Qty|)',
  'Winning days (gross)': 'Days with Gross P/L > 0',
  'Losing days (gross)': 'Days with Gross P/L ≤ 0',
  'Winning days % (gross)': 'Winning days ÷ Trading days',
  'Winning days (after charges)': 'Days with Net P/L > 0',
  'Losing days (after charges)': 'Days with Net P/L ≤ 0',
  'Winning days % (after charges)': 'Winning days ÷ Trading days'
};
// title attribute for a heading or label: the explicit tip, else the formula from the map
function repTipOf(label, explicit) {
  const t = explicit || REPORT_FORMULA_TIPS[label] || '';
  return t ? ` title="${ escapeHtml(t) }"` : '';
}

let reportTab = 'analysis';

/* ---------------- reports: dates ---------------- */
const reportDateOf = v => {
  const s = isBlank(v) ? '' : String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};
const reportUtc = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const reportIsoOf = dt => dt.toISOString().slice(0, 10);
const reportAddDays = (iso, n) => { const dt = reportUtc(iso); dt.setUTCDate(dt.getUTCDate() + n); return reportIsoOf(dt); };
const reportMondayOf = iso => reportAddDays(iso, -((reportUtc(iso).getUTCDay() + 6) % 7));
const reportMonthEnd = iso => { const dt = reportUtc(iso); return reportIsoOf(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0))); };
const reportFyStart = iso => { const dt = reportUtc(iso), m = dt.getUTCMonth() + 1; return m >= 4 ? dt.getUTCFullYear() : dt.getUTCFullYear() - 1; };   // FY runs 1 Apr – 31 Mar

/* ---------------- reports: per-trade values ---------------- */
// RRR rounded to 2 dp, as the workbook's RRR column is
function reportRrrOf(t) {
  const r = rrrOf(t);
  if (r === null || !Number.isFinite(r)) return null;
  return Math.sign(r) * Math.round(Math.abs(r) * 100) / 100;
}
const reportTradeCharges = t => tradeNum(t.expCha ?? t.ExpChgs) ?? 0;   // estimated charges stored on the trade (negative)

/* ---------------- reports: model ----------------
   One record per trading day for the selected brokers:
   gross (trades), net (ledger NetPL, or Gross + estimated charges when the broker has no ledger row that day),
   charges (ledger columns, positive), credit / debit / daily TA / taxable from the ledger, balance chain per broker. */
function buildReportModel(filter) {
  const tr = trades.filter(t => reportDateOf(t?.date ?? t?.Date) && matchesBrokerFilter(t, filter));
  const lr = ledgers.filter(r => reportDateOf(canonicalLedgerRecord(r).Date) && matchesBrokerFilter(r, filter));
  const days = new Map();
  const dayAt = d => {
    if (!days.has(d)) {
      const charges = { other: 0 };
      REPORT_CHARGE_KEYS.forEach(([k]) => { charges[k] = 0; });
      days.set(d, { date: d, trades: [], gross: 0, exp: 0, net: 0, real: 0, credit: 0, debit: 0, taxable: 0,
        dailyTA: null, charges, hasLedger: false, active: false, opening: 0 });
    }
    return days.get(d);
  };
  const ledgerKeys = new Set();
  const balances = new Map();          // broker key -> [{ date, balance }] in date order
  lr.forEach(r => {
    const c = canonicalLedgerRecord(r);
    const d = reportDateOf(c.Date), bk = ledgerBrokerKey(r.broker);
    ledgerKeys.add(bk + '|' + d);
    const day = dayAt(d);
    day.hasLedger = true;
    day.net += ledgerPLCharges(r) || 0;
    day.real += ledgerRealChr(r) || 0;
    REPORT_CHARGE_KEYS.forEach(([k, , field]) => { day.charges[k] += ledgerNum(c[field]) || 0; });
    day.credit += ledgerNum(c.Credit) || 0;
    day.debit += ledgerNum(c.Debit) || 0;
    day.taxable += ledgerNum(c.Taxable) || 0;
    const ta = ledgerNum(c.DailyTA);
    if (ta !== null) day.dailyTA = (day.dailyTA ?? 0) + ta;
    if (ledgerRowHasData(r)) day.active = true;
    if (!balances.has(bk)) balances.set(bk, []);
    balances.get(bk).push({ date: d, balance: ledgerBalance(r) });
  });
  tr.forEach(t => {
    const d = reportDateOf(t.date ?? t.Date), day = dayAt(d);
    const g = pnlOf(t), ex = reportTradeCharges(t);
    day.trades.push(t);
    day.active = true;
    day.gross += g;
    day.exp += ex;
    if (!ledgerKeys.has(ledgerBrokerKey(t.broker) + '|' + d)) {
      // no ledger row for this broker on this day (paper brokers): Net = Gross + estimated charges
      day.net += g + ex;
      day.real += ex;
      day.charges.other -= ex;
    }
  });
  // accounts without ledger rows (paper) run their own balance chain, starting at their opening credit
  const accountKeys = new Set(tr.map(t => ledgerBrokerKey(t.broker)));
  Object.keys(loadBrokerOpeningCredits()).forEach(k => accountKeys.add(k));
  accountKeys.forEach(bk => {
    if (!bk || balances.has(bk) || !matchesBrokerFilter({ broker: bk }, filter)) return;
    const points = brokerBalancePoints(bk, tr);
    if (points) balances.set(bk, points);
    const oc = brokerOpeningCreditOf(bk);
    if (oc) {
      const day = dayAt(oc.date);
      day.credit += oc.amount;
      day.opening += oc.amount;
      day.active = true;
    }
  });
  balances.forEach(list => list.sort((a, b) => a.date.localeCompare(b.date)));
  const dayList = [...days.values()].filter(d => d.active).sort((a, b) => a.date.localeCompare(b.date));
  return { filter, tr, days: dayList, balances };
}

// running balance (sum over brokers) as of an ISO date; null when no balance point exists yet
function reportBalanceAt(model, iso) {
  if (!iso || !model.balances.size) return null;
  let total = null;
  model.balances.forEach(list => {
    let last = null;
    for (const p of list) { if (p.date <= iso) last = p; else break; }
    if (last) total = (total ?? 0) + last.balance;
  });
  return total;
}

// one summary line for a group of trading days (a day, a week, a month, a FY, or everything)
function reportSummarize(model, list, start, end) {
  const s = { start, end, days: list.length, tradingDays: 0, trades: 0, wins: 0, losses: 0, rrrSum: 0, rrrN: 0,
    gDaysWin: 0, gDaysLoss: 0, nDaysWin: 0, nDaysLoss: 0, ledgerDays: 0, opening: 0,
    gross: 0, net: 0, exp: 0, real: 0, credit: 0, debit: 0, taxable: 0, taSum: 0, taN: 0 };
  list.forEach(day => {
    const tradingDay = day.trades.length > 0 || day.hasLedger;
    day.trades.forEach(t => {
      if (pnlOf(t) > 0) s.wins++; else s.losses++;
      const rr = reportRrrOf(t);
      if (rr !== null) { s.rrrSum += rr; s.rrrN++; }
    });
    s.trades += day.trades.length;
    if (tradingDay) { s.tradingDays++; if (day.gross > 0) s.gDaysWin++; else s.gDaysLoss++; if (day.net > 0) s.nDaysWin++; else s.nDaysLoss++; }
    if (day.hasLedger) s.ledgerDays++;
    s.opening += day.opening;
    s.gross += day.gross; s.net += day.net; s.exp += day.exp; s.real += day.real;
    s.credit += day.credit; s.debit += day.debit; s.taxable += day.taxable;
    if (day.dailyTA !== null) { s.taSum += day.dailyTA; s.taN++; }
  });
  const hasLedger = s.ledgerDays > 0;
  const avgTA = s.taN ? s.taSum / s.taN : null;
  s.winRate = s.trades ? s.wins / s.trades : null;
  s.gDaysPct = s.tradingDays ? s.gDaysWin / s.tradingDays : null;
  s.nDaysPct = s.tradingDays ? s.nDaysWin / s.tradingDays : null;
  s.hasCredit = hasLedger || s.opening !== 0;   // a ledger, or an opening credit, is a credit source
  s.rrr = s.rrrN ? s.rrrSum / s.rrrN : null;
  s.ta = avgTA;
  s.perPL = avgTA ? s.gross / avgTA : null;          // Gross P/L ÷ Daily TA
  s.netPerPL = avgTA ? s.net / avgTA : null;         // Net P/L ÷ Daily TA
  s.credit = s.hasCredit ? s.credit : null;
  s.debit = hasLedger ? s.debit : null;
  s.taxable = hasLedger ? s.taxable : null;
  // running balance: ledger brokers and accounts with an opening credit (no ledger rows) both have a chain
  s.balance = hasLedger || model.balances.size ? reportBalanceAt(model, end) : null;
  return s;
}

// groups the day records into the periods of one report
function reportGroups(model, kind) {
  const map = new Map();
  model.days.forEach(day => {
    let key, start, end;
    if (kind === 'daily') { key = day.date; start = day.date; end = day.date; }
    else if (kind === 'weekly') { start = reportMondayOf(day.date); key = start; end = reportAddDays(start, 4); }   // Mon – Fri
    else if (kind === 'monthly') { key = day.date.slice(0, 7); start = key + '-01'; end = reportMonthEnd(day.date); }
    else { const fy = reportFyStart(day.date); key = String(fy); start = `${ fy }-04-01`; end = `${ fy + 1 }-03-31`; }
    if (!map.has(key)) map.set(key, { start, end, days: [] });
    const g = map.get(key);
    g.days.push(day);
    if (day.date > g.end) g.end = day.date;   // a weekend or late trade extends the range shown
  });
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
}

// Status: average % of the winning and losing trades (workbook: AVERAGEIF on the % column)
function reportPctAverages(trs) {
  let pSum = 0, pN = 0, lSum = 0, lN = 0;
  trs.forEach(t => {
    const p = pnlPctOf(t);
    if (p === null) return;
    if (p > 0) { pSum += p; pN++; } else { lSum += p; lN++; }
  });
  return { avgWin: pN ? pSum / pN : null, avgLoss: lN ? lSum / lN : null };
}

/* ---------------- reports: formatting ---------------- */
const repNa = '<span class="rep-na">—</span>';
function repFmt(v, fmt) {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return repNa;
  if (fmt === 'money') return fmtMoneyPrecise(v);
  if (fmt === 'pct') return (v * 100).toFixed(2) + '%';
  if (fmt === 'num2') return Number(v).toFixed(2);
  return Number(v).toLocaleString(numLocale());
}
const repPctLabel = m => `${ Math.round(m * 1000) / 10 }%`;   // 0.025 → "2.5%", 0.1 → "10%"
const repSignClass = v =>(typeof v === 'number' && v > 0 ? 'pos' : typeof v === 'number' && v < 0 ? 'neg' : '');
function repEmpty(text) {
  return `<div class="rep-empty"><strong>${ text || 'No trades for this selection yet' }</strong><span>Add trades (or import a Trade Log) to see this report. Brokers without ledger rows are reported from the Trade Log only.</span></div>`;
}
function repKpi(label, value, cls, sub) {
  return `<article class="rep-kpi"${ repTipOf(label) }><span>${ label }</span><strong class="${ cls || '' }">${ value }</strong>${ sub ? `<em>${ sub }</em>` : '' }</article>`;
}
function repPanel(title, rows) {
  return `<section class="rep-panel"><h3>${ title }</h3><dl class="rep-kv">${ rows.map(([label, value, cls, tip]) =>
    `<div class="rep-kv-row"${ repTipOf(label, tip) }><dt>${ label }</dt><dd class="${ cls || '' }">${ value }</dd></div>`).join('') }</dl></section>`;
}

/* ---------------- reports: Status ---------------- */
function repStatusHtml(model) {
  const days = model.days;
  if (!model.tr.length && !days.length) return repEmpty();
  const first = days[0].date, last = days[days.length - 1].date;
  const s = reportSummarize(model, days, first, last);
  const credit = s.credit ?? 0, debit = s.debit ?? 0;
  const ub = credit + debit;                       // Net used balance (UB)
  const plic = s.net;                              // Net P/L incl. charges
  const cb = ub + plic;                            // Closing balance (CB)
  const charges = s.real;                          // Total charges (negative)
  const netExCh = plic - charges;                  // Net P/L without charges
  const absPlic = Math.abs(plic);
  const ratio = (a, b) => (b ? a / b : null);
  const pct = v => repFmt(v, 'pct');
  const pa = reportPctAverages(model.tr);
  const tagCounts = new Map();
  model.tr.forEach(t => { const tag = riskTagOf(t); if (tag) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1); });
  const chTotals = { other: 0 };                  // charge columns (positive) summed over the days
  REPORT_CHARGE_KEYS.forEach(([k]) => { chTotals[k] = 0; });
  days.forEach(d => {
    REPORT_CHARGE_KEYS.forEach(([k]) => { chTotals[k] += d.charges[k]; });
    chTotals.other += d.charges.other;
  });
  const wins = s.wins, losses = s.losses;

  const accounting = repPanel('Accounting', [
    ['Opening credit (no ledger)', s.opening ? repFmt(s.opening, 'money') : repNa, '', 'Initial credit of paper accounts, on its credit date'],
    ['Total credit', repFmt(s.credit, 'money')],
    ['Total debit', repFmt(s.debit, 'money')],
    ['Net used balance (UB)', repFmt(s.hasCredit ? ub : null, 'money'), repSignClass(ub), 'Credit + debit'],
    ['Net P/L incl. charges (PLIC)', repFmt(plic, 'money'), repSignClass(plic), 'Sum of Net P/L (ledger, or gross + estimated charges)'],
    ['Closing balance (CB)', s.hasCredit ? repFmt(cb, 'money') : repNa, repSignClass(cb), 'UB + PLIC'],
    ['Gross P/L (before charges)', repFmt(s.gross, 'money'), repSignClass(s.gross), 'Sum of (exit − entry) × qty']
  ]);
  const charge = repPanel('Charges', [
    ...REPORT_CHARGE_KEYS.map(([k, label]) => [label, repFmt(-chTotals[k], 'money'), '', 'Σ ledger column, shown as a cost']),
    ['Total charges', repFmt(charges, 'money'), 'neg'],
    ['Charges without ledger (estimated)', repFmt(-chTotals.other, 'money'), '', 'Trade Log charges for brokers that have no ledger row that day']
  ]);
  const ratios = repPanel('Ratios', [
    ['Charges ÷ UB', pct(ratio(charges, ub))],
    ['Net P/L excl. charges ÷ UB', pct(ratio(netExCh, ub))],
    ['Net P/L incl. charges ÷ UB', pct(ratio(plic, ub))],
    ['Closing balance ÷ UB', pct(ratio(cb, ub))],
    ['Charges ÷ |Net P/L|', pct(ratio(charges, absPlic))],
    ['Net P/L excl. charges ÷ |Net P/L|', pct(ratio(netExCh, absPlic))]
  ]);
  const trading = repPanel('Trading', [
    ['Trades', s.trades.toLocaleString(numLocale())],
    ['Winning trades', wins.toLocaleString(numLocale())],
    ['Losing trades', losses.toLocaleString(numLocale()), '', 'Gross P/L ≤ 0'],
    ['Win %', repFmt(s.winRate, 'pct')],
    ['Win / loss ratio', losses ? (wins / losses).toFixed(2) : repNa],
    ['RRR average', repFmt(s.rrr, 'num2')],
    ['Average % profit', repFmt(pa.avgWin, 'pct'), 'pos'],
    ['Average % loss', repFmt(pa.avgLoss, 'pct'), 'neg']
  ]);
  const dayPanel = repPanel('Trading days', [
    ['Trading days', s.days.toLocaleString(numLocale())],
    ['Winning days (gross)', s.gDaysWin.toLocaleString(numLocale()), 'pos'],
    ['Losing days (gross)', s.gDaysLoss.toLocaleString(numLocale()), 'neg'],
    ['Winning days % (gross)', repFmt(s.gDaysPct, 'pct')],
    ['Winning days (after charges)', s.nDaysWin.toLocaleString(numLocale()), 'pos'],
    ['Losing days (after charges)', s.nDaysLoss.toLocaleString(numLocale()), 'neg'],
    ['Winning days % (after charges)', repFmt(s.nDaysPct, 'pct')]
  ]);
  const tagRows = RISK_TAG_BANDS.map(([tag]) => {
    const n = tagCounts.get(tag) || 0;
    const share = model.tr.length ? n / model.tr.length : null;
    return [tag, `${ n.toLocaleString(numLocale()) } · ${ repFmt(share, 'pct') }`, tag.startsWith('Big Profit') || tag.startsWith('Small Profit') || tag.startsWith('Safe') ? 'pos' : 'neg', 'Trades in this tag ÷ all trades (count · share)'];
  });
  const risk = repPanel('Gross P/L % per trade', tagRows);

  return `<div class="rep-panels">${ accounting }${ charge }${ ratios }${ trading }${ dayPanel }${ risk }</div>`;
}

/* ---------------- reports: period tables (Daily / Weekly / Monthly / Yearly) ---------------- */
function repPeriodTable(kind, model) {
  const daily = kind === 'daily';
  const groups = reportGroups(model, kind);
  const targets = REPORT_TARGETS[kind];
  const rows = groups.map(g => ({ start: g.start, end: g.end, s: reportSummarize(model, g.days, g.start, g.end) })).reverse();
  const allDays = model.days;
  const totalS = allDays.length ? reportSummarize(model, allDays, allDays[0].date, allDays[allDays.length - 1].date) : null;
  const total = totalS ? { total: true, start: totalS.start, end: totalS.end, s: totalS } : null;

  const cols = [];
  const add = (h, f, v, cls, tip) => cols.push({ h, f, v, cls: cls || '', tip });
  if (daily) {
    cols.push({ h: 'Date', f: 'text', v: r => formatDateDisplay(r.start), first: true });
    cols.push({ h: 'Day', f: 'text', v: r => DAY_NAMES[reportUtc(r.start).getUTCDay()] });
  } else {
    cols.push({ h: 'Start', f: 'text', v: r => formatDateDisplay(r.start), first: true });
    cols.push({ h: 'End', f: 'text', v: r => formatDateDisplay(r.end) });
  }
  add('Trades', 'int', r => r.s.trades);
  add('Wins', 'int', r => r.s.wins);
  add('Loss', 'int', r => r.s.losses);
  add('Win %', 'pct', r => r.s.winRate);
  if (!daily) {
    add('Days', 'int', r => r.s.days);
    add('+ GD', 'int', r => r.s.gDaysWin, 'pos', 'Gross days in profit (Gross P/L > 0)');
    add('− GD', 'int', r => r.s.gDaysLoss, 'neg', 'Gross days not in profit');
    add('+ GD %', 'pct', r => r.s.gDaysPct, '', 'Gross days in profit, % of trading days');
    add('+ ND', 'int', r => r.s.nDaysWin, 'pos', 'Net days in profit (Net P/L > 0)');
    add('− ND', 'int', r => r.s.nDaysLoss, 'neg', 'Net days not in profit');
    add('+ ND %', 'pct', r => r.s.nDaysPct, '', 'Net days in profit, % of trading days');
  }
  add('RRR', 'num2', r => r.s.rrr);
  add('Gross P/L', 'money', r => r.s.gross, 'signed');
  add('Net P/L', 'money', r => r.s.net, 'signed');
  add('Per P/L', 'pct', r => r.s.perPL, 'signed', 'Gross P/L ÷ Daily TA');
  add('Net per P/L', 'pct', r => r.s.netPerPL, 'signed', 'Net P/L ÷ Daily TA');
  add('Exp. charges', 'money', r => r.s.exp, '', 'Charges estimated on the trades');
  add('Real charges', 'money', r => r.s.real, '', 'Charges after the ledger (or the estimate where there is no ledger)');
  add('Credit', 'money', r => r.s.credit);
  add('Debit', 'money', r => r.s.debit);
  add('Balance', 'money', r => r.s.balance, '', 'Running balance at the end of the period');
  add('Daily TA', 'money', r => r.s.ta, '', 'Average Daily TA of the period');
  targets.forEach((m, i) => {
    const targetOf = r => (r.s.ta === null ? null : r.s.ta * m);
    add(`Target ${ i + 1 }`, 'money', targetOf, '', `Daily TA × ${ repPctLabel(m) }`);
    cols[cols.length - 1].heat = r => repTargetHeat(r, targetOf(r));
  });
  add('Taxable', 'money', r => r.s.taxable);
  const head = cols.map(c => `<th class="${ c.f !== 'text' ? 'num' : '' }"${ repTipOf(c.h, c.tip) }>${ c.h }</th>`).join('');
  const cell = (c, r) => {
    if (c.first) return `<td class="rep-first">${ r.total ? 'Total' : c.v(r) }</td>`;
    if (c.f === 'text') return `<td>${ c.v(r) }</td>`;
    const v = c.v(r);
    const sign = c.cls === 'signed' ? repSignClass(v) : '';
    const heat = c.heat ? c.heat(r) : '';
    return `<td class="num ${ sign } ${ heat }">${ repFmt(v, c.f) }</td>`;
  };
  const body = [total, ...rows].filter(Boolean).map(r => `<tr class="${ r.total ? 'rep-total' : '' }">${ cols.map(c => cell(c, r)).join('') }</tr>`).join('');
  return `<div class="rep-scroll table-wrap rep-framed"><table class="rep-table"><thead><tr>${ head }</tr></thead><tbody>${ body }</tbody></table></div>`;
}
// heat of a target cell: Net P/L at or above the target gets dark purple;
// otherwise Gross P/L at or above the target gets dark green. Net wins when both apply.
function repTargetHeat(r, target) {
  if (target === null || target === undefined) return '';
  if (r.s.net >= target) return 'tgt-net';
  if (r.s.gross >= target) return 'tgt-gross';
  return '';
}
// the explanation of a period report, shown as the tab's tooltip (hover), not as text on the page
function repPeriodNote(kind) {
  const caption = kind === 'daily'
    ? 'Newest first. Each row is one trading day.'
    : kind === 'weekly' ? 'Newest first. Weeks run Monday to Friday; the row shows the first and last day traded.'
    : kind === 'monthly' ? 'Newest first. Calendar months.'
    : 'Newest first. Financial years run 1 April to 31 March.';
  return `${ caption } Per P/L = Gross P/L ÷ average Daily TA of the period. Targets = Daily TA × the workbook’s multiple (${ REPORT_TARGETS[kind].map(repPctLabel).join(', ') }). A target cell is dark purple when Net P/L reaches it, dark green when only Gross P/L does.`;
}

/* ---------------- reports: Analysis ----------------
   Charts and observations for the closed trades in the selection (the date filters above the tables apply). */
const ANA_W = 640;                           // chart viewBox width (scales with the panel)

// closed trades (with an exit) in date order
function repAnalysisTrades(model) {
  return model.tr
    .map(t => ({ t, d: reportDateOf(t?.date ?? t?.Date) || '', pnl: pnlOf(t), p: pnlPctOf(t), tag: riskTagOf(t),
      sym: String(t?.symbol ?? t?.Symbol ?? '').trim().toUpperCase() || '—' }))
    .filter(x => x.d && x.p !== null)
    .sort((a, b) => a.d.localeCompare(b.d));
}

/* ---- chart helpers (SVG, all colours from the theme tokens) ---- */
// area under a series; fill null draws the line only
function repAreaSvg(vals, fill, stroke, h = 190) {
  const W = ANA_W, pad = 8, n = vals.length;
  const vmax = Math.max(0, ...vals), vmin = Math.min(0, ...vals), range = vmax - vmin || 1;
  const X = i => n === 1 ? W / 2 : (i / (n - 1)) * W;
  const Y = v => pad + (vmax - v) / range * (h - 2 * pad);
  const pts = vals.map((v, i) => `${ X(i).toFixed(1) },${ Y(v).toFixed(1) }`);
  const y0 = Y(0).toFixed(1);
  const area = fill ? `<path d="M${ X(0) },${ y0 } L${ pts.join(' L') } L${ X(n - 1) },${ y0 } Z" fill="${ fill }" opacity=".22"/>` : '';
  return `<svg viewBox="0 0 ${ W } ${ h }" role="img">`
    + `<line x1="0" x2="${ W }" y1="${ y0 }" y2="${ y0 }" stroke="var(--border-strong)" stroke-dasharray="3 3"/>`
    + area + `<path d="M${ pts.join(' L') }" fill="none" stroke="${ stroke }" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
// a line with fixed or data bounds and an optional reference line
function repLineSvg(vals, { h = 170, stroke = 'var(--gold)', lo = null, hi = null, ref = null } = {}) {
  const W = ANA_W, pad = 10, n = vals.length;
  const vmin = lo ?? Math.min(...vals), vmax = hi ?? Math.max(...vals), range = vmax - vmin || 1;
  const X = i => n === 1 ? W / 2 : (i / (n - 1)) * W;
  const Y = v => pad + (vmax - v) / range * (h - 2 * pad);
  const pts = vals.map((v, i) => `${ X(i).toFixed(1) },${ Y(v).toFixed(1) }`);
  const refLine = ref === null ? '' : `<line x1="0" x2="${ W }" y1="${ Y(ref).toFixed(1) }" y2="${ Y(ref).toFixed(1) }" stroke="var(--border-strong)" stroke-dasharray="3 3"/>`;
  return `<svg viewBox="0 0 ${ W } ${ h }" role="img">${ refLine }<path d="M${ pts.join(' L') }" fill="none" stroke="${ stroke }" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
// signed vertical bars: items [{ label, value, title, cls? }], optional overlay line on the same scale
function repBarsSvg(items, h = 200, overlay = null) {
  const W = ANA_W, top = 10, bottom = 24, n = items.length;
  const all = items.map(i => i.value).concat(overlay || []);
  const vmax = Math.max(0, ...all), vmin = Math.min(0, ...all), range = vmax - vmin || 1, plot = h - top - bottom;
  const Y = v => top + (vmax - v) / range * plot;
  const y0 = Y(0), slot = W / n, bw = Math.max(1.5, slot * 0.72);
  const every = Math.max(1, Math.ceil(n / 12));
  const bars = items.map((it, i) => {
    const x = i * slot + (slot - bw) / 2, yv = Y(it.value);
    const y = Math.min(yv, y0), hh = Math.max(1, Math.abs(yv - y0));
    const cls = it.cls || (it.value >= 0 ? 'ana-pos' : 'ana-neg');
    return `<rect x="${ x.toFixed(1) }" y="${ y.toFixed(1) }" width="${ bw.toFixed(1) }" height="${ hh.toFixed(1) }" rx="2" class="${ cls }"><title>${ escapeHtml(it.title || '') }</title></rect>`;
  }).join('');
  const line = overlay && overlay.length
    ? `<path d="M${ overlay.map((v, i) => `${ (i * slot + slot / 2).toFixed(1) },${ Y(v).toFixed(1) }`).join(' L') }" fill="none" stroke="var(--gold)" stroke-width="2" vector-effect="non-scaling-stroke"/>`
    : '';
  const labels = items.map((it, i) => i % every === 0
    ? `<text x="${ (i * slot + slot / 2).toFixed(1) }" y="${ h - 6 }" text-anchor="middle">${ escapeHtml(it.label) }</text>` : '').join('');
  return `<svg viewBox="0 0 ${ W } ${ h }" role="img"><line x1="0" x2="${ W }" y1="${ y0 }" y2="${ y0 }" stroke="var(--border-strong)"/>${ bars }${ line }${ labels }</svg>`;
}
// wins in a row (up) and losses in a row (down), by run length
function repDivergeSvg(rows, h = 200) {
  const W = ANA_W, top = 10, bottom = 24, n = rows.length;
  const plot = h - top - bottom, mid = top + plot / 2;
  const vmax = Math.max(1, ...rows.map(r => Math.max(r.up, r.down)));
  const scale = (plot / 2) / vmax, slot = W / n, bw = Math.max(1.5, slot * 0.6);
  const bars = rows.map((r, i) => {
    const x = i * slot + (slot - bw) / 2;
    return `<rect x="${ x.toFixed(1) }" y="${ (mid - r.up * scale).toFixed(1) }" width="${ bw.toFixed(1) }" height="${ (r.up * scale).toFixed(1) }" rx="2" class="ana-pos"><title>${ escapeHtml(r.label) }: ${ r.up } win run${ r.up === 1 ? '' : 's' }</title></rect>`
      + `<rect x="${ x.toFixed(1) }" y="${ mid.toFixed(1) }" width="${ bw.toFixed(1) }" height="${ (r.down * scale).toFixed(1) }" rx="2" class="ana-neg"><title>${ escapeHtml(r.label) }: ${ r.down } loss run${ r.down === 1 ? '' : 's' }</title></rect>`;
  }).join('');
  const every = Math.max(1, Math.ceil(n / 12));
  const labels = rows.map((r, i) => i % every === 0 ? `<text x="${ (i * slot + slot / 2).toFixed(1) }" y="${ h - 6 }" text-anchor="middle">${ escapeHtml(r.label) }</text>` : '').join('');
  return `<svg viewBox="0 0 ${ W } ${ h }" role="img"><line x1="0" x2="${ W }" y1="${ mid }" y2="${ mid }" stroke="var(--border-strong)"/>${ bars }${ labels }</svg>`;
}
// one dot per trade: x = trade order, y = Gross P/L %
function repScatterSvg(points, n, ymin, ymax, h = 200) {
  const W = ANA_W, pad = 10;
  const X = i => n <= 1 ? W / 2 : pad + (i / (n - 1)) * (W - 2 * pad);
  const range = ymax - ymin || 1;
  const Y = v => pad + (ymax - v) / range * (h - 2 * pad);
  const y0 = Y(0).toFixed(1);
  const dots = points.map(q => `<circle cx="${ X(q.x).toFixed(1) }" cy="${ Y(q.y).toFixed(1) }" r="3.2" class="${ q.cls }" opacity=".75"><title>${ escapeHtml(q.title) }</title></circle>`).join('');
  return `<svg viewBox="0 0 ${ W } ${ h }" role="img"><line x1="0" x2="${ W }" y1="${ y0 }" y2="${ y0 }" stroke="var(--border-strong)" stroke-dasharray="3 3"/>${ dots }</svg>`;
}

// the export: a CSV file built in the browser
function repAnalysisHtml(model) {
  const xs = repAnalysisTrades(model);
  const nf = numLocale();
  if (!xs.length) return repEmpty('No closed trades in the selection');

  // headline numbers
  const net = xs.reduce((a, x) => a + x.pnl, 0);
  const wins = xs.filter(x => x.pnl > 0), losses = xs.filter(x => !(x.pnl > 0));
  const gw = wins.reduce((a, x) => a + x.pnl, 0), gl = Math.abs(losses.reduce((a, x) => a + x.pnl, 0));
  const pf = gl ? gw / gl : (gw ? Infinity : null);
  const winRate = wins.length / xs.length;
  const expectancy = xs.reduce((a, x) => a + x.p, 0) / xs.length;
  const avgWin = wins.length ? wins.reduce((a, x) => a + x.p, 0) / wins.length : null;
  const avgLoss = losses.length ? losses.reduce((a, x) => a + x.p, 0) / losses.length : null;

  // equity and drawdown, starting from zero
  const cum = [0];
  xs.forEach(x => cum.push(cum[cum.length - 1] + x.pnl));
  const dd = []; let peak = 0;
  cum.forEach(c => { peak = Math.max(peak, c); dd.push(c - peak); });
  const maxDD = Math.min(...dd);
  const peakVal = Math.max(...cum);

  // aggregates: per day, month, symbol and weekday
  const byDay = new Map(), byMonth = new Map(), bySym = new Map(), byWd = new Map();
  const bump = (map, key, x) => {
    const v = map.get(key) || { n: 0, w: 0, net: 0 };
    v.n++; v.w += x.pnl > 0 ? 1 : 0; v.net += x.pnl; map.set(key, v);
  };
  xs.forEach(x => {
    bump(byDay, x.d, x);
    bump(byMonth, x.d.slice(0, 7), x);
    bump(bySym, x.sym, x);
    bump(byWd, reportUtc(x.d).getUTCDay(), x);
  });
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const syms = [...bySym.entries()].sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net));
  const wdOrder = [1, 2, 3, 4, 5, 6, 0].filter(d => byWd.has(d));
  const bestWd = wdOrder.reduce((best, d) => byWd.get(d).net > byWd.get(best).net ? d : best, wdOrder[0]);
  const bestDay = days.reduce((a, b) => b[1].net > a[1].net ? b : a), worstDay = days.reduce((a, b) => b[1].net < a[1].net ? b : a);
  const monthLabel = k => { const [y, m] = k.split('-'); return `${ new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short' }) } ${ y.slice(2) }`; };

  // rolling 5-day average of daily P/L (expanding at the start), and rolling 20-trade win rate
  const dailyNet = days.map(([, v]) => v.net);
  const roll5 = dailyNet.map((_, i) => { const sl = dailyNet.slice(Math.max(0, i - 4), i + 1); return sl.reduce((a, b) => a + b, 0) / sl.length; });
  const win = Math.min(20, xs.length);
  const rollWr = [];
  for (let i = win - 1; i < xs.length; i++) {
    const sl = xs.slice(i - win + 1, i + 1);
    rollWr.push(sl.filter(x => x.pnl > 0).length / win);
  }

  // streaks
  const winRuns = new Map(), lossRuns = new Map();
  let curWin = null, run = 0;
  const flush = () => { if (run) { const m = curWin ? winRuns : lossRuns; m.set(run, (m.get(run) || 0) + 1); } };
  xs.forEach(x => {
    const w = x.pnl > 0;
    if (w === curWin) run++; else { flush(); curWin = w; run = 1; }
  });
  flush();
  const maxRun = Math.max(1, ...winRuns.keys(), ...lossRuns.keys());
  const streakRows = Array.from({ length: maxRun }, (_, i) => ({ label: String(i + 1), up: winRuns.get(i + 1) || 0, down: lossRuns.get(i + 1) || 0 }));
  const longestWin = winRuns.size ? Math.max(...winRuns.keys()) : 0;
  const longestLoss = lossRuns.size ? Math.max(...lossRuns.keys()) : 0;

  // return distribution: Gross P/L % in fine bins
  const pv = xs.map(x => x.p * 100);
  const minP = Math.min(...pv), maxP = Math.max(...pv);
  const step = Math.max(0.5, Math.ceil((maxP - minP) / 40 * 2) / 2);
  const start = Math.floor(minP / step) * step;
  const nb = Math.max(1, Math.ceil((maxP - start) / step) + 1);
  const distBins = Array.from({ length: nb }, (_, i) => {
    const lo = start + i * step, hi = lo + step;
    const count = pv.filter(v => v >= lo && v < hi).length + (i === nb - 1 ? pv.filter(v => v === hi).length : 0);
    return { label: `${ lo.toFixed(1) }`, value: count, cls: lo + step / 2 < 0 ? 'ana-neg' : 'ana-pos',
      title: `${ lo.toFixed(1) }% to ${ hi.toFixed(1) }%: ${ count } trade${ count === 1 ? '' : 's' }` };
  });

  // concentration: how much of the gross profit the top three symbols make
  const symProfit = syms.map(([, v]) => v.net).filter(v => v > 0).sort((a, b) => b - a);
  const grossProfitSyms = symProfit.reduce((a, b) => a + b, 0);
  const top3Share = grossProfitSyms ? symProfit.slice(0, 3).reduce((a, b) => a + b, 0) / grossProfitSyms : null;

  // observations, written from the numbers above
  const insights = [
    `Net gross P/L is ${ repFmt(net, 'money') } over ${ xs.length.toLocaleString(nf) } closed trades, with a ${ repFmt(winRate, 'pct') } win rate.`,
    pf === null ? null : `Profit factor ${ pf === Infinity ? '∞' : pf.toFixed(2) }: each unit lost is matched by ${ pf === Infinity ? 'no losses at all' : `${ pf.toFixed(2) } units` } of gross profit.`,
    `Expectancy is ${ repFmt(expectancy, 'pct') } per trade. Average win ${ repFmt(avgWin, 'pct') }, average loss ${ repFmt(avgLoss, 'pct') }.`,
    `Max drawdown ${ repFmt(maxDD, 'money') }${ peakVal > 0 ? `, ${ (maxDD / peakVal * 100).toFixed(0) }% of the peak equity` : '' }.`,
    wdOrder.length ? `${ DAY_NAMES[bestWd] } is the strongest weekday (${ repFmt(byWd.get(bestWd).net, 'money') }, ${ (byWd.get(bestWd).w / byWd.get(bestWd).n * 100).toFixed(0) }% wins).` : null,
    top3Share === null ? null : `The top three symbols make ${ (top3Share * 100).toFixed(0) }% of the gross profit.`,
    `Longest run: ${ longestWin } win${ longestWin === 1 ? '' : 's' } in a row, ${ longestLoss } loss${ longestLoss === 1 ? '' : 'es' } in a row.`,
    rollWr.length ? `Win rate over the last ${ win } trades is ${ repFmt(rollWr[rollWr.length - 1], 'pct') }, against ${ repFmt(winRate, 'pct') } overall.` : null
  ].filter(Boolean);

  // tiles
  const tile = (label, value, cls, sub) =>
    `<article class="rsk-tile ${ cls || '' }"><span>${ label }</span><strong>${ value }</strong><em>${ sub }</em></article>`;
  const strip = `<div class="ana-strip">`
    + tile('Net gross P/L', repFmt(net, 'money'), repSignClass(net), `${ xs.length.toLocaleString(nf) } trades`)
    + tile('Win rate', repFmt(winRate, 'pct'), winRate >= 0.5 ? 'pos' : 'neg', `${ wins.length } wins · ${ losses.length } losses`)
    + tile('Profit factor', pf === null ? repNa : pf === Infinity ? '∞' : pf.toFixed(2), pf !== null && pf >= 1 ? 'pos' : 'neg', 'Gross profit ÷ gross loss')
    + tile('Expectancy', repFmt(expectancy, 'pct'), repSignClass(expectancy), 'Average Gross P/L % per trade')
    + tile('Average win', repFmt(avgWin, 'pct'), 'pos', `${ wins.length } winning trades`)
    + tile('Average loss', repFmt(avgLoss, 'pct'), 'neg', `${ losses.length } losing trades`)
    + tile('Max drawdown', repFmt(maxDD, 'money'), maxDD < 0 ? 'neg' : '', 'Largest fall from a peak')
    + tile('Best / worst day', repFmt(bestDay[1].net, 'money'), 'pos', `${ bestDay[0] } · worst ${ repFmt(worstDay[1].net, 'money') }`)
    + `</div>`;

  // panels
  const panel = (title, figure, body, cls = '') =>
    `<section class="rep-panel ana-card ${ cls }"><header class="ana-ph"><h3>${ title }</h3>${ figure ? `<span class="ana-fig">${ figure }</span>` : '' }</header>${ body }</section>`;
  const obs = `<section class="rep-panel ana-card ana-wide"><header class="ana-ph"><h3>Observations</h3><span class="ana-fig">generated from this selection</span></header>`
    + `<ul class="ana-ins">${ insights.map(t => `<li>${ escapeHtml(t) }</li>`).join('') }</ul></section>`;

  const symHtml = syms.slice(0, 14).map(([k, v]) => `<div class="rsk-tag"><span class="rsk-tag-name">${ escapeHtml(k) }</span>`
    + `<div class="rsk-tag-track"><div class="rsk-tag-fill ${ v.net >= 0 ? 'pos' : 'neg' }" style="width:${ (Math.abs(v.net) / Math.max(1, ...syms.map(([, q]) => Math.abs(q.net))) * 100).toFixed(1) }%"></div></div>`
    + `<span class="rsk-tag-n">${ repFmt(v.net, 'money') }<i>${ v.n } · ${ (v.w / v.n * 100).toFixed(0) }%</i></span></div>`).join('')
    + (syms.length > 14 ? `<p class="ana-more">+ ${ syms.length - 14 } more symbols in the Trades CSV</p>` : '');

  const wdItems = wdOrder.map(d => { const v = byWd.get(d); return { label: DAY_NAMES[d], value: v.net, title: `${ DAY_NAMES[d] }: ${ v.n } trades · ${ (v.w / v.n * 100).toFixed(0) }% wins · ${ repFmt(v.net, 'money') }` }; });

  const charts = `<div class="ana-grid">${ obs }`
    + panel('Equity curve', `peak ${ repFmt(peakVal, 'money') } · end ${ repFmt(net, 'money') }`, repAreaSvg(cum, 'var(--green)', 'var(--green)', 220), 'ana-wide')
    + panel('Drawdown', `worst ${ repFmt(maxDD, 'money') }`, repAreaSvg(dd, 'var(--red)', 'var(--red)', 110), 'ana-wide')
    + panel('Daily gross P/L', `bars = day · line = 5-day average`,
        repBarsSvg(days.map(([d, v]) => ({ label: d.slice(5), value: v.net, title: `${ formatDateDisplay(d) }: ${ v.n } trades, ${ repFmt(v.net, 'money') }` })), 210, roll5), 'ana-wide')
    + panel('Monthly gross P/L', `${ months.length } months`,
        repBarsSvg(months.map(([k, v]) => ({ label: monthLabel(k), value: v.net, title: `${ monthLabel(k) }: ${ v.n } trades, ${ (v.w / v.n * 100).toFixed(0) }% wins, ${ repFmt(v.net, 'money') }` })), 190))
    + panel('Weekdays · net by day', wdOrder.length ? `best ${ DAY_NAMES[bestWd] }` : '',
        (wdItems.length ? repBarsSvg(wdItems, 190) : repEmpty())
        + `<p class="ana-foot">${ wdOrder.map(d => `${ DAY_NAMES[d] } ${ (byWd.get(d).w / byWd.get(d).n * 100).toFixed(0) }% wins`).join(' · ') }</p>`)
    + panel('Each trade · Gross P/L %', `${ xs.length } trades`,
        repScatterSvg(xs.map((x, i) => ({ x: i, y: x.p * 100, cls: x.pnl > 0 ? 'ana-pos' : 'ana-neg', title: `${ x.d } ${ x.sym }: ${ (x.p * 100).toFixed(2) }%` })),
          xs.length, Math.min(0, ...pv), Math.max(0, ...pv), 200))
    + panel('Return distribution', `bins of ${ step }%`, repBarsSvg(distBins, 200))
    + panel('Win rate · last 20 trades', rollWr.length ? `now ${ repFmt(rollWr[rollWr.length - 1], 'pct') }` : '',
        rollWr.length ? repLineSvg(rollWr, { lo: 0, hi: 1, ref: 0.5, h: 180 }) + `<p class="ana-foot">Dashed line = 50%. Each point is the win rate of the 20 trades ending there.</p>` : repEmpty('Needs at least one trade'))
    + panel('Win / loss streaks', `longest win ${ longestWin } · loss ${ longestLoss }`,
        repDivergeSvg(streakRows, 190) + `<p class="ana-foot">Up = runs of wins, down = runs of losses, by length in trades. Zero or less counts as a loss.</p>`)
    + panel('Symbols · net gross P/L', top3Share === null ? `${ syms.length } symbols` : `top 3 = ${ (top3Share * 100).toFixed(0) }% of profit`,
        `<div class="rsk-tags">${ symHtml }</div>`, 'ana-wide')
    + `</div>`;

  return strip + charts;
}

/* ---------------- reports: Symbol ---------------- */
function repSymbolHtml(model) {
  if (!model.tr.length) return repEmpty();
  const map = new Map();
  model.tr.forEach(t => {
    const sym = String(t.symbol ?? t.Symbol ?? '').trim().toUpperCase();
    if (!sym) return;
    if (!map.has(sym)) map.set(sym, { symbol: sym, trades: 0, wins: 0, losses: 0, gross: 0, exp: 0, rrrSum: 0, rrrN: 0, pctSum: 0, pctN: 0 });
    const r = map.get(sym), p = pnlOf(t);
    r.trades++;
    if (p > 0) r.wins++; else r.losses++;
    r.gross += p;
    r.exp += reportTradeCharges(t);
    const rr = reportRrrOf(t);
    if (rr !== null) { r.rrrSum += rr; r.rrrN++; }
    const pct = pnlPctOf(t);
    if (pct !== null) { r.pctSum += pct; r.pctN++; }
  });
  const rows = [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const all = { symbol: 'Total', trades: 0, wins: 0, losses: 0, gross: 0, exp: 0, rrrSum: 0, rrrN: 0, pctSum: 0, pctN: 0 };
  rows.forEach(r => ['trades', 'wins', 'losses', 'gross', 'exp', 'rrrSum', 'rrrN', 'pctSum', 'pctN'].forEach(k => { all[k] += r[k]; }));
  const line = (r, total) => {
    const winRate = r.trades ? r.wins / r.trades : null;
    const rrr = r.rrrN ? r.rrrSum / r.rrrN : null;
    const avgPct = r.pctN ? r.pctSum / r.pctN : null;
    return `<tr class="${ total ? 'rep-total' : '' }"><td class="rep-first">${ escapeHtml(r.symbol) }</td>
      <td class="num">${ r.trades }</td><td class="num">${ r.wins }</td><td class="num">${ r.losses }</td>
      <td class="num">${ repFmt(winRate, 'pct') }</td><td class="num">${ repFmt(rrr, 'num2') }</td>
      <td class="num ${ repSignClass(r.gross) }">${ repFmt(r.gross, 'money') }</td>
      <td class="num ${ repSignClass(avgPct) }">${ repFmt(avgPct, 'pct') }</td>
      <td class="num">${ repFmt(r.exp, 'money') }</td></tr>`;
  };
  const head = ['Symbol', 'Trades', 'Wins', 'Loss', 'Win %', 'RRR', 'Gross P/L', 'Avg Per P/L', 'Exp. charges']
    .map((h, i) => `<th class="${ i ? 'num' : '' }"${ repTipOf(h) }>${ h }</th>`).join('');
  return `<div class="rep-scroll table-wrap rep-framed"><table class="rep-table"><thead><tr>${ head }</tr></thead><tbody>${ line(all, true) }${ rows.map(r => line(r, false)).join('') }</tbody></table></div>`;
}

/* ---------------- reports: Risk management ----------------
   Each trade with an exit goes into one bin by its Gross P/L % (before charges). The bins are
   columns on the period reports, a row on Status, and the whole Risk management page (sidebar). */
function repRiskCounts(trs) {
  const counts = Array(REPORT_RISK_BINS.length).fill(0);
  trs.forEach(t => {
    const pct = pnlPctOf(t);
    if (pct === null) return;                       // open trades (no exit) are not binned
    const p = Math.round(pct * 100 * 1e9) / 1e9;    // 9 dp: removes float noise at the bin edges
    const bi = REPORT_RISK_BINS.findIndex(b => p > b.lo && p <= b.hi);
    if (bi >= 0) counts[bi]++;
  });
  return counts;
}
// Loss T. / Profit T. / Total T. / % Profit of one set of bin counts
function repRiskSums(counts) {
  const loss = counts.slice(0, REPORT_LOSS_BINS).reduce((a, b) => a + b, 0);
  const profit = counts.slice(REPORT_LOSS_BINS).reduce((a, b) => a + b, 0);
  const total = loss + profit;
  return { loss, profit, total, pct: total ? profit / total : null };
}
// Risk map: four quadrants from the risk bands. Losses / profits across; big / small down.
// Big loss = Big Loss (≤ −0.8%) · Small loss = Small Loss · Small profit = Safe + Small Profit · Big profit = Big Profit +1/+2/+3
const RISK_MAP_GROUPS = [
  { key: 'bigLoss', name: 'Big loss', bands: [0], cls: 'loss-big', col: 0, row: 0 },
  { key: 'bigProfit', name: 'Big profit', bands: [4, 5, 6], cls: 'profit-big', col: 1, row: 0 },
  { key: 'smallLoss', name: 'Small loss', bands: [1], cls: 'loss-small', col: 0, row: 1 },
  { key: 'smallProfit', name: 'Small profit', bands: [2, 3], cls: 'profit-small', col: 1, row: 1 }
];
// colour of each quadrant in charts: [colour, opacity]
const RISK_MAP_COL = { bigLoss: ['var(--red)', 1], smallLoss: ['var(--red)', 0.45], smallProfit: ['var(--green)', 0.45], bigProfit: ['var(--green)', 1] };
// what each quadrant means, the rule it sets and the suggestion for it
const RISK_MAP_TEXT = {
  bigLoss: {
    what: 'Trades that lost 0.8% of their value or more. These are the drawdowns.',
    rule: 'After a big loss, the next trade is half size.',
    suggest: 'Check the stop that let the loss pass −0.8%. Most big losses come from a stop that was moved or not set.'
  },
  smallLoss: {
    what: 'Trades between −0.8% and +0.11%. Each one is small, but they add up.',
    rule: 'Take only setups that meet the checklist.',
    suggest: 'Look for a repeated entry type in this group and cut it if it does not pay.'
  },
  smallProfit: {
    what: 'Gains between +0.11% and +1%. Safe, but too small to cover a big loss on their own.',
    rule: 'Hold for the big-profit band when the setup allows it.',
    suggest: 'Check whether partial exits are cutting winners short.'
  },
  bigProfit: {
    what: 'Gains of +1% or more. This is where the edge pays.',
    rule: 'Repeat the setup that produced it. Do not add size without a reason.',
    suggest: 'Confirm the setup repeats across months, not in one good week.'
  }
};
function riskMapHtml(model) {
  const nf = numLocale();
  const pct = v => repFmt(v, 'pct'), money = v => repFmt(v, 'money');
  const seq = model.tr
    .map(t => ({ d: reportDateOf(t?.date ?? t?.Date) || '', p: pnlPctOf(t), pnl: pnlOf(t), tag: riskTagOf(t) }))
    .filter(x => x.p !== null && x.tag)
    .sort((a, b) => a.d.localeCompare(b.d));
  const total = seq.length;
  if (!total) return repEmpty('No closed trades to map yet');
  const keyOf = tag => (RISK_MAP_GROUPS.find(g => g.bands.some(i => RISK_TAG_BANDS[i][0] === tag)) || {}).key;
  seq.forEach(x => { x.q = keyOf(x.tag); });
  const G = {};
  RISK_MAP_GROUPS.forEach(g => {
    const items = seq.filter(x => x.q === g.key);
    G[g.key] = { ...g, n: items.length, share: items.length / total,
      avgP: items.length ? items.reduce((a, x) => a + x.p, 0) / items.length : null,
      net: items.reduce((a, x) => a + x.pnl, 0) };
  });
  const bl = G.bigLoss, bp = G.bigProfit, sl = G.smallLoss, sp = G.smallProfit;
  const netAll = seq.reduce((a, x) => a + x.pnl, 0);
  const LIMIT = 0.10, SMALL_LOSS_LIMIT = 0.40;

  // streaks and the worst day for big losses (dates are in order)
  let streak = 0, bestStreak = 0;
  const bigPerDay = new Map();
  seq.forEach(x => {
    if (x.q === 'bigLoss') {
      streak++; bestStreak = Math.max(bestStreak, streak);
      bigPerDay.set(x.d, (bigPerDay.get(x.d) || 0) + 1);
    } else streak = 0;
  });
  const worstDayBL = bigPerDay.size ? Math.max(...bigPerDay.values()) : 0;

  // rules, written from this selection
  const rule = (ok, text) => ({ lvl: ok ? 'ok' : 'warn', text });
  const rules = [
    rule(bl.share <= LIMIT, bl.share > LIMIT
      ? `Big losses are ${ pct(bl.share) } of trades, above the ${ pct(LIMIT) } limit. Rule: size down so no single trade can lose more than 0.8% of its value.`
      : `Big losses are ${ pct(bl.share) } of trades, inside the ${ pct(LIMIT) } limit. Keep the same size rule.`),
    rule(bestStreak < 2, bestStreak >= 2
      ? `Two or more big losses in a row happened (longest run: ${ bestStreak }). Rule: stop for the day after two big losses.`
      : 'No run of big losses longer than one trade.'),
    rule(worstDayBL < 2, worstDayBL >= 2
      ? `The worst day had ${ worstDayBL } big losses. Rule: a daily cap of one big loss, then stop.`
      : 'No day had more than one big loss.'),
    rule(bp.n > 0 && sp.n <= 2 * bp.n, bp.n === 0
      ? 'No big profits in this selection. Rule: check that targets are reachable.'
      : sp.n > 2 * bp.n
        ? `Small wins (${ sp.n }) outnumber big wins (${ bp.n }) by more than two to one. Rule: let winners run into the big-profit band before exiting.`
        : 'Big wins keep pace with small wins.'),
    rule(sl.share <= SMALL_LOSS_LIMIT, sl.share > SMALL_LOSS_LIMIT
      ? `Routine losses are ${ pct(sl.share) } of trades. Rule: skip any setup that does not meet the checklist.`
      : `Routine losses are ${ pct(sl.share) } of trades, under ${ pct(SMALL_LOSS_LIMIT) }.`),
    rule(netAll >= 0, netAll < 0
      ? `Net gross P/L is ${ money(netAll) }. Rule: cut size until the equity curve turns up.`
      : `Net gross P/L is ${ money(netAll) }, positive.`)
  ];

  // planning for the next session
  const plan = [
    'Stop each trade before it passes −0.8%, the edge of the big-loss band.',
    `Daily cap: one big loss, then stop. The worst day in this selection had ${ worstDayBL }.`,
    `Weekly target: big losses under ${ pct(LIMIT) } of trades. Now ${ pct(bl.share) }.`,
    bp.n ? `Keep aiming for big profits. They are ${ pct(bp.share) } of trades and average ${ pct(bp.avgP) }.`
      : 'No big profits yet. Set a target that lets trades reach +1%.',
    'Review the map after every 20 trades, not after a single trade.'
  ];

  const important = [
    'Only trades with an exit are placed on the map. Open trades are left out.',
    'Bands use Gross P/L % before charges, so a trade can sit in a different band from its net result.',
    'Zero Gross P/L counts as a loss in the win and loss figures.',
    'Change the broker filter to compare brokers on the same map.'
  ];

  // charts
  const donutParts = ['bigProfit', 'smallProfit', 'smallLoss', 'bigLoss']
    .map(k => ({ key: k, value: G[k].n, label: G[k].name }));
  const C = 2 * Math.PI * 40;
  let off = 0;
  const donut = `<svg viewBox="0 0 120 120" role="img" aria-label="Trades by quadrant">`
    + donutParts.filter(d => d.value > 0).map(d => {
      const len = d.value / total * C;
      const seg = `<circle cx="60" cy="60" r="40" fill="none" stroke="${ RISK_MAP_COL[d.key][0] }" stroke-opacity="${ RISK_MAP_COL[d.key][1] }" stroke-width="16" stroke-dasharray="${ len.toFixed(2) } ${ (C - len).toFixed(2) }" stroke-dashoffset="${ (-off).toFixed(2) }" transform="rotate(-90 60 60)"><title>${ d.label }: ${ d.value } trades</title></circle>`;
      off += len;
      return seg;
    }).join('')
    + `<text x="60" y="58" text-anchor="middle" class="rm-donut-val">${ total }</text><text x="60" y="74" text-anchor="middle" class="rm-donut-cap">trades</text></svg>`;

  const gaugeV = Math.min(100, bl.share / 0.30 * 100);
  const gauge = `<svg viewBox="0 0 120 74" role="img" aria-label="Big-loss share ${ pct(bl.share) }">`
    + `<path d="M10,62 A50,50 0 0 1 110,62" fill="none" stroke="var(--bg-raised)" stroke-width="12" pathLength="100"/>`
    + `<path d="M10,62 A50,50 0 0 1 110,62" fill="none" stroke="${ bl.share > LIMIT ? 'var(--red)' : 'var(--green)' }" stroke-width="12" pathLength="100" stroke-dasharray="${ gaugeV.toFixed(2) } 100"/>`
    + `<text x="60" y="56" text-anchor="middle" class="rm-donut-val">${ pct(bl.share) }</text>`
    + `<text x="60" y="70" text-anchor="middle" class="rm-donut-cap">big-loss share · limit ${ pct(LIMIT) }</text></svg>`;

  const netOrder = ['bigProfit', 'smallProfit', 'smallLoss', 'bigLoss'];
  const netMax = Math.max(1, ...netOrder.map(k => Math.abs(G[k].net)));
  const netBars = netOrder.map(k => `<div class="rsk-tag"><span class="rsk-tag-name">${ G[k].name }</span>`
    + `<div class="rsk-tag-track"><div class="rsk-tag-fill ${ G[k].net >= 0 ? 'pos' : 'neg' }" style="width:${ (Math.abs(G[k].net) / netMax * 100).toFixed(1) }%"></div></div>`
    + `<span class="rsk-tag-n">${ money(G[k].net) }</span></div>`).join('');

  const avgItems = ['bigProfit', 'smallProfit', 'smallLoss', 'bigLoss'].filter(k => G[k].avgP !== null)
    .map(k => ({ label: G[k].name, value: G[k].avgP, title: `${ G[k].name }: average ${ pct(G[k].avgP) }`, cls: G[k].avgP >= 0 ? 'ana-pos' : 'ana-neg' }));
  const avgChart = avgItems.length ? repBarsSvg(avgItems, 170) : repEmpty('No trades in any quadrant');

  // monthly stack: how many trades fell in each quadrant, per month
  const byMonth = new Map();
  seq.forEach(x => {
    const mk = x.d.slice(0, 7) || '—';
    if (!byMonth.has(mk)) byMonth.set(mk, { bigLoss: 0, smallLoss: 0, smallProfit: 0, bigProfit: 0 });
    byMonth.get(mk)[x.q]++;
  });
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const stackOrder = ['bigLoss', 'smallLoss', 'smallProfit', 'bigProfit'];
  const stackMax = Math.max(1, ...months.map(([, c]) => stackOrder.reduce((a, k) => a + c[k], 0)));
  const SW = ANA_W, SH = 190, top = 10, bottom = 24, plot = SH - top - bottom;
  const slot = SW / Math.max(1, months.length), bw = Math.max(6, slot * 0.6);
  const stackSvg = months.length ? `<svg viewBox="0 0 ${ SW } ${ SH }" role="img" aria-label="Trades per quadrant by month">`
    + months.map(([mk, c], i) => {
      let y = top + plot;
      const x = i * slot + (slot - bw) / 2;
      const segs = stackOrder.map(k => {
        const h = c[k] / stackMax * plot;
        y -= h;
        return h > 0 ? `<rect x="${ x.toFixed(1) }" y="${ y.toFixed(1) }" width="${ bw.toFixed(1) }" height="${ h.toFixed(1) }" fill="${ RISK_MAP_COL[k][0] }" fill-opacity="${ RISK_MAP_COL[k][1] }"><title>${ mk } · ${ G[k].name }: ${ c[k] }</title></rect>` : '';
      }).join('');
      const lbl = `<text x="${ (i * slot + slot / 2).toFixed(1) }" y="${ SH - 6 }" text-anchor="middle">${ mk.slice(2) }</text>`;
      return segs + lbl;
    }).join('') + `</svg>`
    : repEmpty('No months to show');
  const stackLegend = stackOrder.map(k => `<span class="rm-key"><i style="background:${ RISK_MAP_COL[k][0] };opacity:${ RISK_MAP_COL[k][1] }"></i>${ G[k].name }</span>`).join('');

  // quadrant cards: description, rule and the figures for each one
  const cards = RISK_MAP_GROUPS.map(g => {
    const q = G[g.key], t = RISK_MAP_TEXT[g.key];
    return `<article class="rm-q ${ g.cls }" style="grid-column:${ g.col + 2 };grid-row:${ g.row + 2 }">`
      + `<div class="rm-q-top"><span class="rm-q-name">${ g.name }</span><span class="rm-q-share">${ pct(q.share) }</span></div>`
      + `<strong class="rm-q-count">${ q.n.toLocaleString(nf) }</strong>`
      + `<div class="rm-q-meta">Avg ${ pct(q.avgP) } · net ${ money(q.n ? q.net : null) }</div>`
      + `<p class="rm-q-what">${ t.what }</p>`
      + `<p class="rm-q-rule"><b>Rule</b> ${ t.rule }</p></article>`;
  }).join('');

  const hero = `<section class="rm-hero">`
    + `<h2>Risk map</h2>`
    + `<p class="rm-lede">Big losses are ${ pct(bl.share) } of trades and net ${ money(bl.net) }. Big profits are ${ pct(bp.share) } and net ${ money(bp.net) }. `
    + `${ bl.share > LIMIT ? 'Big losses are above the limit, so size and stops come first.' : 'Big losses are inside the limit; keep the rules that hold them there.' }</p>`
    + `<div class="rm-hero-tiles">`
    + `<div><span>Big-loss share</span><strong class="${ bl.share > LIMIT ? 'neg' : 'pos' }">${ pct(bl.share) }</strong><em>limit ${ pct(LIMIT) }</em></div>`
    + `<div><span>Big-profit share</span><strong class="pos">${ pct(bp.share) }</strong><em>${ bp.n } trades</em></div>`
    + `<div><span>Net from big losses</span><strong class="neg">${ money(bl.net) }</strong><em>${ bl.n } trades</em></div>`
    + `<div><span>Net from big profits</span><strong class="pos">${ money(bp.net) }</strong><em>${ bp.n } trades</em></div>`
    + `</div></section>`;

  const explanation = `<section class="rep-panel rm-card"><h3>Explanation</h3>`
    + `<p>Each closed trade is placed in one of four boxes by its Gross P/L % (before charges). Across: losses on the left, profits on the right. Down: big moves on top, small moves below.</p>`
    + `<ul class="rm-list"><li><b>Big</b> means −0.8% or worse for a loss, +1% or more for a profit.</li>`
    + `<li><b>Small</b> means everything between −0.8% and +1%.</li>`
    + `<li>The map shows how the trades are spread, not whether a single trade was good.</li></ul></section>`;

  const descriptions = `<section class="rep-panel rm-card rm-wide"><h3>Descriptions</h3>`
    + `<div class="rm-qmap"><span></span><span class="rm-qcol">Losses</span><span class="rm-qcol">Profits</span>`
    + `<span class="rm-qrow" style="grid-column:1;grid-row:2">Big</span><span class="rm-qrow" style="grid-column:1;grid-row:3">Small</span>`
    + cards + `</div></section>`;

  const charts = `<div class="rm-charts">`
    + `<section class="rep-panel rm-card"><h3>Share of trades</h3><div class="rm-donut">${ donut }</div>`
    + `<div class="rm-legend">${ donutParts.map(d => `<span class="rm-key"><i style="background:${ RISK_MAP_COL[d.key][0] };opacity:${ RISK_MAP_COL[d.key][1] }"></i>${ d.label } <b>${ d.value }</b></span>`).join('') }</div></section>`
    + `<section class="rep-panel rm-card"><h3>Big-loss gauge</h3><div class="rm-gauge">${ gauge }</div><p class="rm-foot">The gauge fills to 30% of trades. The line for the limit is ${ pct(LIMIT) }.</p></section>`
    + `<section class="rep-panel rm-card"><h3>Net gross P/L by quadrant</h3><div class="rsk-tags">${ netBars }</div></section>`
    + `<section class="rep-panel rm-card rm-wide"><h3>Trades per quadrant by month</h3>${ stackSvg }<div class="rm-legend">${ stackLegend }</div></section>`
    + `<section class="rep-panel rm-card rm-wide"><h3>Average Gross P/L % by quadrant</h3>${ avgChart }</section>`
    + `</div>`;

  const ruleList = `<section class="rep-panel rm-card"><h3>Rules</h3><ul class="rm-rules">`
    + rules.map(r => `<li class="${ r.lvl }"><span>${ r.lvl === 'ok' ? 'OK' : 'Act' }</span>${ escapeHtml(r.text) }</li>`).join('')
    + `</ul></section>`;

  const suggestions = `<section class="rep-panel rm-card"><h3>Suggestions</h3><ul class="rm-list">`
    + RISK_MAP_GROUPS.map(g => `<li><b>${ g.name }.</b> ${ RISK_MAP_TEXT[g.key].suggest }</li>`).join('')
    + `</ul></section>`;

  const planning = `<section class="rep-panel rm-card"><h3>Planning</h3><ol class="rm-plan">`
    + plan.map(t => `<li>${ escapeHtml(t) }</li>`).join('')
    + `</ol></section>`;

  const importantList = `<section class="rep-panel rm-card rm-important"><h3>Important</h3><ul class="rm-list">`
    + important.map(t => `<li>${ escapeHtml(t) }</li>`).join('')
    + `</ul></section>`;

  return `<div class="rm-page">${ hero }`
    + `<div class="rm-two">${ explanation }${ importantList }</div>`
    + descriptions
    + charts
    + `<div class="rm-two">${ ruleList }${ suggestions }</div>`
    + planning
    + `</div>`;
}

// Risk management · Status: histogram scale, "count" or "% of trades" (set by its switch)
let riskStatusMode = 'count';
// Risk management · Status, top to bottom: the risk map, four headline numbers, the band histogram beside
// the profit / loss donut, then the risk-tag mix beside the win / loss profile. Counts match the table:
// open trades are not binned.
function repRiskStatusHtml(model) {
  const counts = repRiskCounts(model.tr);
  const s = repRiskSums(counts);
  if (!s.total) return repEmpty();
  const nf = numLocale();
  const seq = model.tr
    .map(t => ({ t, p: pnlPctOf(t), pnl: pnlOf(t), d: reportDateOf(t?.date ?? t?.Date) || '' }))
    .filter(x => x.p !== null)
    .sort((a, b) => a.d.localeCompare(b.d));
  const wins = seq.filter(x => x.pnl > 0);
  const losses = seq.filter(x => !(x.pnl > 0));                 // zero P/L counts as a loss
  const avg = a => a.length ? a.reduce((n, x) => n + x.p, 0) / a.length : null;
  const grossWin = wins.reduce((n, x) => n + x.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((n, x) => n + x.pnl, 0));
  const winRate = seq.length ? wins.length / seq.length : null;
  const expectancy = avg(seq);
  const profitFactor = grossLoss ? grossWin / grossLoss : (grossWin ? Infinity : null);
  let bestWin = 0, bestLoss = 0, run = 0, runWin = null;
  seq.forEach(x => {
    const w = x.pnl > 0;
    run = w === runWin ? run + 1 : 1;
    runWin = w;
    if (w) bestWin = Math.max(bestWin, run); else bestLoss = Math.max(bestLoss, run);
  });
  const current = runWin === null ? '—' : `${ run } ${ runWin ? (run === 1 ? 'win' : 'wins') : (run === 1 ? 'loss' : 'losses') }`;
  const topBin = counts.indexOf(Math.max(...counts));
  const maxWin = wins.length ? Math.max(...wins.map(x => x.p)) : null;
  const maxLoss = losses.length ? Math.min(...losses.map(x => x.p)) : null;
  const pf = profitFactor === null ? repNa : profitFactor === Infinity ? '∞' : profitFactor.toFixed(2);
  const open = model.tr.length - s.total;

  // 2 · headline numbers
  const tile = (label, value, cls, sub) =>
    `<article class="rsk-tile ${ cls || '' }"><span>${ label }</span><strong>${ value }</strong><em>${ sub }</em></article>`;
  const strip = `<div class="rsk-strip">`
    + tile('Trades with an exit', s.total.toLocaleString(nf), '', `${ open.toLocaleString(nf) } open, not binned`)
    + tile('Win rate', repFmt(winRate, 'pct'), winRate === null ? '' : winRate >= 0.5 ? 'pos' : 'neg', `${ wins.length.toLocaleString(nf) } wins · ${ losses.length.toLocaleString(nf) } losses`)
    + tile('Profit factor', pf, profitFactor === null ? '' : profitFactor >= 1 ? 'pos' : 'neg', 'Gross profit ÷ gross loss')
    + tile('Expectancy per trade', repFmt(expectancy, 'pct'), repSignClass(expectancy), 'Average Gross P/L % per trade')
    + `</div>`;

  // 3 · band histogram, with the profit / loss donut beside it
  const mode = riskStatusMode === 'pct' ? 'pct' : 'count';
  const max = Math.max(...counts, 1);
  const cols = counts.map((n, i) => {
    const bin = REPORT_RISK_BINS[i];
    const h = n ? Math.max(2, (n / max) * 100) : 0;
    const share = (n / s.total * 100).toFixed(1);
    const shown = !n ? '' : mode === 'pct' ? `${ share }%` : n;
    return `<div class="rsk-col" title="${ escapeHtml(bin.label) }: ${ n } trade${ n === 1 ? '' : 's' } (${ share }%)">`
      + `<span class="rsk-n">${ shown }</span>`
      + `<div class="rsk-bar ${ i < REPORT_LOSS_BINS ? 'neg' : 'pos' }" style="height:${ h }%"></div></div>`;
  }).join('');
  const labels = REPORT_RISK_BINS.map(b => `<span class="rsk-lbl">${ b.label }</span>`).join('');
  const seg = [['count', 'Count'], ['pct', '% of trades']]
    .map(([k, l]) => `<button type="button" class="${ k === mode ? 'active' : '' }" data-rsk-mode="${ k }" aria-pressed="${ k === mode }">${ l }</button>`).join('');
  const hist = `<section class="rep-panel rsk-hist"><div class="rsk-head"><h3>Trades by Gross P/L % band</h3><div class="rsk-seg">${ seg }</div></div>`
    + `<div class="rsk-split"><span class="neg">◂ Losses · first 7 bands</span><span class="pos">Profits · last 7 bands ▸</span></div>`
    + `<div class="rsk-scroll"><div class="rsk-plot">${ cols }</div><div class="rsk-axis">${ labels }</div></div></section>`;

  const C = 2 * Math.PI * 42;
  const pct = s.pct || 0;
  const donut = `<section class="rep-panel rsk-donut-panel"><h3>Profit vs loss</h3>`
    + `<div class="rsk-donut"><svg viewBox="0 0 120 120" role="img" aria-label="${ repFmt(s.pct, 'pct') } profit trades">`
    + `<circle cx="60" cy="60" r="42" fill="none" stroke="var(--red)" stroke-width="13"/>`
    + `<circle cx="60" cy="60" r="42" fill="none" stroke="var(--green)" stroke-width="13" stroke-dasharray="${ pct * C } ${ C }" transform="rotate(-90 60 60)"/>`
    + `<text x="60" y="60" text-anchor="middle" class="rsk-donut-val">${ repFmt(s.pct, 'pct') }</text>`
    + `<text x="60" y="76" text-anchor="middle" class="rsk-donut-cap">profit</text></svg>`
    + `<div class="rsk-legend"><div><i class="rsk-dot pos"></i>Profit<b>${ s.profit.toLocaleString(nf) }</b></div>`
    + `<div><i class="rsk-dot neg"></i>Loss<b>${ s.loss.toLocaleString(nf) }</b></div></div></div></section>`;

  // 4 · risk-tag mix and the win / loss profile
  const tagRows = RISK_TAG_BANDS.map(([tag]) => ({ tag, n: seq.filter(x => riskTagOf(x.t) === tag).length }));
  const tagMax = Math.max(...tagRows.map(r => r.n), 1);
  const tagHtml = tagRows.map(r => {
    const cls = r.tag.includes('Loss') ? 'neg' : r.tag.startsWith('Safe') ? 'flat' : 'pos';
    const share = seq.length ? `${ (r.n / seq.length * 100).toFixed(1) }%` : '';
    return `<div class="rsk-tag"><span class="rsk-tag-name">${ r.tag }</span>`
      + `<div class="rsk-tag-track"><div class="rsk-tag-fill ${ cls }" style="width:${ r.n / tagMax * 100 }%"></div></div>`
      + `<span class="rsk-tag-n">${ r.n.toLocaleString(nf) }<i>${ share }</i></span></div>`;
  }).join('');
  const tags = `<section class="rep-panel"><h3>Risk tags</h3><div class="rsk-tags">${ tagHtml }</div></section>`;
  const profile = repPanel('Win / loss profile', [
    ['Average win', repFmt(avg(wins), 'pct'), 'pos', 'Average Gross P/L % of the winning trades'],
    ['Average loss', repFmt(avg(losses), 'pct'), 'neg', 'Average Gross P/L % of the losing trades'],
    ['Largest win', repFmt(maxWin, 'pct'), 'pos'],
    ['Largest loss', repFmt(maxLoss, 'pct'), 'neg'],
    ['Longest win streak', String(bestWin), 'pos', 'Trades in a row with Gross P/L above zero'],
    ['Longest loss streak', String(bestLoss), 'neg', 'Trades in a row with Gross P/L of zero or less'],
    ['Most common band', REPORT_RISK_BINS[topBin].label, '', 'The band with the most trades'],
    ['Current streak', current, '', 'Wins or losses in a row, ending with the latest trade']
  ]);

  return `<div class="rsk-page">${ strip }`
    + `<div class="rsk-row">${ hist }${ donut }</div>`
    + `<div class="rsk-row rsk-row-2">${ tags }${ profile }</div></div>`;
}

// one framed table: a label column, the bins, then the totals. rows = [{ label, counts, total? }]
function repRiskTableHtml(leadHeads, rows) {
  const head = leadHeads.map(h => `<th${ repTipOf(h) }>${ h }</th>`).join('')
    + REPORT_RISK_BINS.map((b, i) => `<th class="num ${ i < REPORT_LOSS_BINS ? 'neg-soft' : 'pos-soft' }"${ repTipOf(b.label, `Trades with Gross P/L % in ${ b.label } (upper edge included)`) }>${ b.label }</th>`).join('')
    + ['Loss T.', 'Profit T.', 'Total T.', '% Profit'].map(h => `<th class="num"${ repTipOf(h) }>${ h }</th>`).join('');
  const body = rows.map(r => {
    const s = repRiskSums(r.counts);
    const lead = r.lead.map((v, i) => `<td class="${ i === 0 ? 'rep-first' : '' }">${ v }</td>`).join('');
    const bins = r.counts.map((n, i) => `<td class="num ${ i < REPORT_LOSS_BINS ? 'neg-soft' : 'pos-soft' }">${ n || '' }</td>`).join('');
    return `<tr class="${ r.total ? 'rep-total' : '' }">${ lead }${ bins }<td class="num neg">${ s.loss }</td><td class="num pos">${ s.profit }</td><td class="num">${ s.total }</td><td class="num">${ repFmt(s.pct, 'pct') }</td></tr>`;
  }).join('');
  return `<div class="rep-scroll table-wrap rep-framed"><table class="rep-table rep-risk"><thead><tr>${ head }</tr></thead><tbody>${ body }</tbody></table></div>`;
}
// the Risk management page has one tab per period: status, daily, weekly, monthly, yearly (FY)
const RISK_TABS = [{ key: 'map', label: 'Risk map' }, ...REPORT_TABS.filter(t => ['status', 'daily', 'weekly', 'monthly', 'yearly'].includes(t.key))];
let riskTab = 'status';
// the explanation of each risk-bin tab; shown as the tab's tooltip (hover), not as text on the page
const RISK_TAB_NOTES = {
  analysis: 'Charts of the closed trades in the selection: equity curve, drawdown, daily and monthly P/L, weekdays, symbols and win / loss streaks. The date filters above apply.',
  map: 'Each trade sits in one of four quadrants by its Gross P/L % band: big loss, small loss, small profit or big profit. Each quadrant shows its count, share, average and net gross P/L.',
  status: 'Every trade with an exit, by its Gross P/L % (before charges). One row for the whole selection. Each trade is placed by its Gross P/L % (before charges). Losses are the first seven bins, profits the last seven. Newest first.',
  daily: 'Each trading day, by Gross P/L % band. Each trade is placed by its Gross P/L % (before charges). Losses are the first seven bins, profits the last seven. Newest first.',
  weekly: 'Each week (Monday to Friday), by Gross P/L % band. Each trade is placed by its Gross P/L % (before charges). Losses are the first seven bins, profits the last seven. Newest first.',
  monthly: 'Each calendar month, by Gross P/L % band. Each trade is placed by its Gross P/L % (before charges). Losses are the first seven bins, profits the last seven. Newest first.',
  yearly: 'Each financial year (1 April to 31 March), by Gross P/L % band. Each trade is placed by its Gross P/L % (before charges). Losses are the first seven bins, profits the last seven. Newest first.'
};
function renderRiskTabs() {
  const host = document.getElementById('riskTabs');
  if (!host) return;
  host.innerHTML = RISK_TABS.map(t => `<button type="button" class="rep-tab${ t.key === riskTab ? ' active' : '' }" data-rep-tab="${ t.key }" aria-selected="${ t.key === riskTab }" title="${ escapeHtml(RISK_TAB_NOTES[t.key]) }">${ t.label }</button>`).join('');
}
// the risk bins of one period type: a total row first, then one row per period, newest first
function repRiskBlockHtml(model, kind) {
  if (kind === 'map') return riskMapHtml(model);
  if (kind === 'status') return repRiskStatusHtml(model);
  const isDaily = kind === 'daily';
  const leadHeads = isDaily ? ['Date', 'Day'] : ['Start', 'End'];
  const periods = reportGroups(model, kind)
    .map(g => ({
      lead: isDaily
        ? [formatDateDisplay(g.start), DAY_NAMES[reportUtc(g.start).getUTCDay()]]
        : [formatDateDisplay(g.start), formatDateDisplay(g.end)],
      start: g.start,
      counts: repRiskCounts(g.days.flatMap(d => d.trades))
    }))
    .filter(p => repRiskSums(p.counts).total > 0)
    .sort((x, y) => y.start.localeCompare(x.start));                 // newest first
  const rows = [{ lead: ['Total', ''], counts: repRiskCounts(model.tr), total: true }, ...periods];
  return repRiskTableHtml(leadHeads, rows);
}

/* ---------------- reports: render ---------------- */
function renderReportTabs() {
  const host = document.getElementById('reportTabs');
  if (!host) return;
  const tipOf = key => {
    if (key === 'symbol') return 'One row per symbol, A to Z. Win / loss use Gross P/L (a trade with zero P/L counts as a loss, as in the workbook).';
    if (key === 'status') return 'Net P/L uses each broker’s ledger row for the day. Brokers without a ledger row use Gross P/L plus the estimated charges on the trade. Credit, debit and balance exist only where a ledger is kept.';
    if (REPORT_TARGETS[key]) return repPeriodNote(key);       // daily, weekly, monthly, yearly
    return RISK_TAB_NOTES[key] || '';                          // status
  };
  host.innerHTML = REPORT_TABS.map(t => {
    const tip = tipOf(t.key);
    return `<button type="button" class="rep-tab${ t.key === reportTab ? ' active' : '' }" data-rep-tab="${ t.key }" aria-selected="${ t.key === reportTab }"${ tip ? ` title="${ escapeHtml(tip) }"` : '' }>${ t.label }</button>`;
  }).join('');
}

function renderReports() {
  const sel = document.getElementById('reportBrokerFilter');
  const body = document.getElementById('reportBody');
  if (!sel || !body) return;
  fillBrokerFilter(sel, trades.concat(ledgers));
  renderReportTabs();
  renderDateRange('report');
  const model = buildReportModel(sel.value);
  renderDateFilters('report', model.tr);
  const filtered = applyDateFilters(model);
  let content;
  if (!filtered.tr.length && !filtered.days.length) content = repEmpty();
  else if (reportTab === 'status') content = repStatusHtml(filtered);
  else if (reportTab === 'symbol') content = repSymbolHtml(filtered);
  else if (reportTab === 'analysis') content = repAnalysisHtml(filtered);
  else content = repPeriodTable(reportTab, filtered);
  body.innerHTML = content;
  mountReportFrame(body);
}

/* Risk management date filters: Year, Month, Week (of the month: days 1–7, 8–14, …) and Day (of the week).
   Each one is All by default; together they narrow the trades and days the risk tables are built from. */
// The Risk management and Reports pages share these filters (one state, two sets of controls).
const DATE_FILTER_KEYS = ['year', 'month', 'week', 'day'];
const dateFilterId = (prefix, key) => prefix + key[0].toUpperCase() + key.slice(1) + 'Filter';
const RISK_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const riskDateFilter = { year: 'all', month: 'all', week: 'all', day: 'all' };
/* Risk date range, measured back from today (same reference as the analysis ranges). Default: All. */
const RISK_RANGES = [['1d', '1D'], ['1w', '1W'], ['30', '30D'], ['90', '90D'], ['1y', '1Y'], ['all', 'All']];
let riskRange = 'all';
// first date (YYYY-MM-DD) of a range key, or null for All; the Dashboard reuses it with its own range
function riskRangeFrom(range = riskRange) {
  if (range === 'all') return null;
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const iso = dt => `${ dt.getFullYear() }-${ pad(dt.getMonth() + 1) }-${ pad(dt.getDate()) }`;
  if (range === '1d') return iso(now);
  if (range === '1w') return reportAddDays(iso(now), -6);
  if (range === '30') return reportAddDays(iso(now), -29);
  if (range === '90') return reportAddDays(iso(now), -89);
  const yearAgo = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1);
  return iso(yearAgo);
}
function renderDateRange(prefix) {
  const seg = document.getElementById(`${ prefix }RangeSeg`);
  if (!seg) return;
  // on phones the buttons are replaced by this dropdown (css/42-phone.css); both show the same range
  seg.innerHTML = RISK_RANGES.map(([k, l]) => `<button type="button" class="${ k === riskRange ? 'active' : '' }" data-date-range="${ k }" aria-pressed="${ k === riskRange }">${ l }</button>`).join('')
    + `<select class="rng-select" data-range-select aria-label="Date range">${ [...RISK_RANGES].reverse().map(([k, l]) => `<option value="${ k }" ${ k === riskRange ? 'selected' : '' }>${ l }</option>`).join('') }</select>`;
}
function riskDateParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: String(y), month: String(m), week: String(Math.ceil(d / 7)), day: String(reportUtc(iso).getUTCDay()) };
}
// Monday of the week an ISO date falls in (the key of a Mon–Fri week group)
function riskWeekKeyOf(iso) {
  const dow = reportUtc(iso).getUTCDay();
  return reportAddDays(iso, dow === 0 ? -6 : 1 - dow);
}
// "1 Oct" for an ISO date
const riskDayMonth = iso => `${ Number(iso.slice(8, 10)) } ${ RISK_MONTH_LABELS[Number(iso.slice(5, 7)) - 1] }`;
function riskDatePass(iso) {
  const from = riskRangeFrom();
  if (from && iso < from) return false;
  const parts = riskDateParts(iso);
  // once a month is chosen the view is workdays only (Mon–Fri)
  if (riskDateFilter.month !== 'all' && (parts.day === '0' || parts.day === '6')) return false;
  if (riskDateFilter.year !== 'all' && parts.year !== riskDateFilter.year) return false;
  if (riskDateFilter.month !== 'all' && parts.month !== riskDateFilter.month) return false;
  if (riskDateFilter.week !== 'all' && riskWeekKeyOf(iso) !== riskDateFilter.week) return false;
  if (riskDateFilter.day !== 'all' && iso !== riskDateFilter.day) return false;
  return true;
}
// Progressive reveal: Year and Broker first. A year shows Month. A month shows the Dates and Weeks dropdowns
// for that month: Dates lists the workdays with trades, Weeks lists Mon–Fri groups (e.g. "1 to 2 Oct", "5 to 9 Oct").
// Weekends are excluded once a month is chosen. A hidden filter is reset to All.
function renderDateFilters(prefix, list) {
  const years = [...new Set(list.map(t => reportDateOf(t.date ?? t.Date).slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const showMonth = riskDateFilter.year !== 'all';
  const showScope = showMonth && riskDateFilter.month !== 'all';
  if (!showMonth) riskDateFilter.month = 'all';
  if (!showScope) { riskDateFilter.day = 'all'; riskDateFilter.week = 'all'; }
  // the month's workdays that have trades, for the Dates and Weeks lists
  let dates = [];
  if (showScope) {
    const prefix = `${ riskDateFilter.year }-${ String(Number(riskDateFilter.month)).padStart(2, '0') }-`;
    const from = riskRangeFrom();
    dates = [...new Set(list.map(t => reportDateOf(t.date ?? t.Date)))]
      .filter(d => d.startsWith(prefix) && (!from || d >= from) && reportUtc(d).getUTCDay() % 6 !== 0).sort();
  }
  const dateOpts = dates.map(d => [d, `${ DAY_NAMES[reportUtc(d).getUTCDay()] } ${ riskDayMonth(d) }`]);
  const weekKeys = [...new Set(dates.map(riskWeekKeyOf))].sort();
  const weekOpts = weekKeys.map(key => {
    const monthStart = dates[0].slice(0, 8) + '01';
    const monthEnd = reportMonthEnd(dates[0]);
    const start = key > monthStart ? key : monthStart;                     // clipped to the month
    const friday = reportAddDays(key, 4);
    const end = friday < monthEnd ? friday : monthEnd;
    const label = start === end ? riskDayMonth(start)
      : `${ Number(start.slice(8, 10)) } to ${ riskDayMonth(end) }`;
    return [key, label];
  });
  const config = {
    year:  { all: 'All years',  opts: years.map(y => [y, y]) },
    month: { all: 'All months', opts: RISK_MONTH_LABELS.map((n, i) => [String(i + 1), n]) },
    day:   { all: 'All dates',  opts: dateOpts },
    week:  { all: 'All weeks',  opts: weekOpts }
  };
  const visible = { year: true, month: showMonth, day: showScope, week: showScope };
  DATE_FILTER_KEYS.forEach(key => {
    const sel = document.getElementById(dateFilterId(prefix, key));
    if (!sel) return;
    const label = sel.closest('label');
    if (label) label.style.display = visible[key] ? '' : 'none';
    if (!visible[key]) { sel.value = 'all'; return; }
    const opts = [['all', config[key].all], ...config[key].opts];
    if (!opts.some(([v]) => v === riskDateFilter[key])) riskDateFilter[key] = 'all';
    sel.innerHTML = opts.map(([v, l]) => `<option value="${ v }">${ l }</option>`).join('');
    sel.value = riskDateFilter[key];
  });
}

// the model narrowed to the shared date range and dropdowns
function applyDateFilters(model) {
  return {
    ...model,
    tr: model.tr.filter(t => riskDatePass(reportDateOf(t.date ?? t.Date))),
    days: model.days.filter(d => riskDatePass(d.date))
  };
}

// the Risk management page (sidebar): its own broker filter, the shared date controls and the risk tables
function renderRisk() {
  const sel = document.getElementById('riskBrokerFilter');
  const body = document.getElementById('riskBody');
  if (!sel || !body) return;
  fillBrokerFilter(sel, trades.concat(ledgers));
  renderRiskTabs();
  renderDateRange('risk');
  const model = buildReportModel(sel.value);
  renderDateFilters('risk', model.tr);
  const filtered = applyDateFilters(model);
  body.innerHTML = filtered.tr.length ? repRiskBlockHtml(filtered, riskTab) : repEmpty();
  mountReportFrame(body);
}

// the footer of a framed table (same as the Trade Log: pinned to the bottom, carries the sideways scrollbar)
function mountReportFrame(body) {
  const frame = body.querySelector('.rep-framed');
  if (!frame) return;
  const rows = frame.querySelectorAll('tbody tr').length;
  body.insertAdjacentHTML('beforeend',
    `<div class="rep-foot"><div class="rep-track" role="scrollbar" aria-orientation="horizontal" aria-label="Scroll table sideways"><div class="rep-thumb"></div></div><span class="rep-count">${ rows.toLocaleString(numLocale()) } rows</span></div>`);
  reportScrollX = 0;
  buildFrozenColumns(frame);
  attachReportFrame();
  syncReportFrame();
}

// The first two columns are repeated in a fixed overlay at the left of the frame. The table under it moves
// sideways with one transform; the overlay stays put, so a scroll step never restyles the individual cells.
function buildFrozenColumns(frame) {
  frame.querySelectorAll(':scope > .rep-frozen').forEach(n => n.remove());
  const main = frame.querySelector(':scope > table');
  if (!main || !main.tHead || !main.tBodies[0]) return;
  const sample = main.tBodies[0].querySelector('tr:not(.rep-total)') || main.tBodies[0].rows[0];
  if (!sample || sample.cells.length < 2) return;
  // a column is as wide as its widest cell (header or body)
  const headRow = main.tHead.rows[0];
  const widths = [0, 1].map(i => Math.ceil(Math.max(
    headRow.cells[i]?.getBoundingClientRect().width || 0,
    sample.cells[i].getBoundingClientRect().width)));
  const table = document.createElement('table');
  table.className = main.className + ' rep-frozen-table';
  table.innerHTML = `<colgroup><col style="width:${ widths[0] }px"><col style="width:${ widths[1] }px"></colgroup>`;
  const copyRows = (src, dst) => {
    [...src.rows].forEach(tr => {
      const row = document.createElement('tr');
      row.className = tr.className;
      [tr.cells[0], tr.cells[1]].forEach(c => { if (c) row.appendChild(c.cloneNode(true)); });
      dst.appendChild(row);
    });
  };
  const thead = document.createElement('thead');
  copyRows(main.tHead, thead);
  const tbody = document.createElement('tbody');
  copyRows(main.tBodies[0], tbody);
  table.appendChild(thead);
  table.appendChild(tbody);
  const overlay = document.createElement('div');
  overlay.className = 'rep-frozen';
  overlay.appendChild(table);
  frame.appendChild(overlay);
}

// wheel and drag events can arrive faster than the screen refreshes: apply at most one move per frame
let reportPendingX = null;
function queueReportScrollX(x) {
  if (reportPendingX === null) requestAnimationFrame(() => {
    const v = reportPendingX;
    reportPendingX = null;
    setReportScrollX(v);
  });
  reportPendingX = x;
}

/* ---------------- reports: sideways scroll without an inner scrollbar ----------------
   The page scrolls vertically, as on the Trade Log, so the header pins to the screen. The table
   is clipped sideways (no scroll box) and moved with a transform. The footer track, the thumb,
   a click on the track or a sideways wheel/trackpad gesture all change the same offset. */
let reportScrollX = 0;
// the body whose frame is on screen: the Risk management page when it is open, otherwise the Reports body
function reportFrameBody() {
  const risk = document.getElementById('riskBody');
  if (risk && risk.closest('.view')?.classList.contains('active')) return risk;
  return document.getElementById('reportBody');
}
function reportFrameEls() {
  const body = reportFrameBody();
  return {
    wrap: body?.querySelector('.rep-framed') || null,
    table: body?.querySelector('.rep-framed table') || null,
    track: body?.querySelector('.rep-track') || null,
    thumb: body?.querySelector('.rep-thumb') || null
  };
}
// sizes of the table on screen, measured once per render and on resize, so a scroll step only writes styles
let reportGeom = { max: 0, wrapW: 0, tableW: 0, trackW: 0 };
function measureReportFrame() {
  const { wrap, table, track } = reportFrameEls();
  reportGeom = wrap && table
    ? { max: Math.max(0, table.scrollWidth - wrap.clientWidth), wrapW: wrap.clientWidth, tableW: table.scrollWidth, trackW: track ? track.clientWidth : 0 }
    : { max: 0, wrapW: 0, tableW: 0, trackW: 0 };
}
function reportMaxX() { return reportGeom.max; }
// sets the offset (clamped), moves the table and the footer thumb. The first two columns do not move:
// they are the fixed overlay built by buildFrozenColumns.
function setReportScrollX(x) {
  const { table, track, thumb } = reportFrameEls();
  const max = reportMaxX();
  reportScrollX = Math.min(max, Math.max(0, Math.round(x)));
  if (table) table.style.transform = `translateX(${ -reportScrollX }px)`;
  if (!track || !thumb) return;
  const { trackW, wrapW, tableW } = reportGeom;
  const ratio = tableW ? wrapW / tableW : 1;
  const thumbW = max > 0 ? Math.max(40, Math.round(trackW * ratio)) : trackW;
  thumb.style.width = thumbW + 'px';
  thumb.style.transform = `translateX(${ max > 0 ? Math.round(reportScrollX / max * (trackW - thumbW)) : 0 }px)`;
  track.classList.toggle('is-idle', max <= 0);
}
function syncReportFrame() {
  // the Total row sticks just under the header, so its offset is the measured header height
  const body = reportFrameBody();
  const head = body?.querySelector('.rep-table thead tr');
  if (body && head) body.style.setProperty('--rep-head-h', head.getBoundingClientRect().height + 'px');
  measureReportFrame();
  setReportScrollX(reportScrollX);
}
function attachReportFrame() {
  const { wrap, track, thumb } = reportFrameEls();
  if (!wrap || !track || !thumb) return;
  const room = () => Math.max(1, track.clientWidth - thumb.offsetWidth);
  thumb.addEventListener('pointerdown', e => {
    e.preventDefault();
    const startX = e.clientX, startPos = reportScrollX;
    thumb.setPointerCapture(e.pointerId);
    thumb.classList.add('dragging');
    const move = ev => queueReportScrollX(startPos + (ev.clientX - startX) / room() * reportMaxX());
    const up = () => {
      thumb.classList.remove('dragging');
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', up);
      thumb.removeEventListener('pointercancel', up);
    };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', up);
    thumb.addEventListener('pointercancel', up);
  });
  track.addEventListener('pointerdown', e => {
    if (e.target !== track) return;
    const r = track.getBoundingClientRect();
    const x = e.clientX - r.left - thumb.offsetWidth / 2;
    setReportScrollX(Math.min(1, Math.max(0, x / room())) * reportMaxX());
  });
  // sideways wheel / trackpad gesture moves the table; vertical gestures still scroll the page
  wrap.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || reportMaxX() <= 0) return;
    e.preventDefault();
    queueReportScrollX((reportPendingX ?? reportScrollX) + e.deltaX);
  }, { passive: false });
}

function initReports() {
  const tabs = document.getElementById('reportTabs');
  const sel = document.getElementById('reportBrokerFilter');
  if (tabs) tabs.addEventListener('click', e => {
    const btn = e.target.closest('[data-rep-tab]');
    if (!btn) return;
    reportTab = btn.dataset.repTab;
    renderReports();
  });
  if (sel) sel.addEventListener('change', renderReports);
  const riskSel = document.getElementById('riskBrokerFilter');
  if (riskSel) riskSel.addEventListener('change', renderRisk);
  // the range buttons and the dropdowns, on the Dashboard, Reports and Risk pages; all of them re-render so they stay in step
  ['risk', 'report', 'dash'].forEach(prefix => {
    const rangeEl = document.getElementById(`${ prefix }RangeSeg`);
    const applyRange = key => {
      // a range replaces the calendar dropdowns: they go back to All so both show the same filter
      riskRange = key;
      Object.keys(riskDateFilter).forEach(k => { riskDateFilter[k] = 'all'; });
      renderRisk();
      renderReports();
      renderDashboard();
    };
    if (rangeEl) rangeEl.addEventListener('click', e => {
      const b = e.target.closest('[data-date-range]');
      if (b) applyRange(b.dataset.dateRange);
    });
    if (rangeEl) rangeEl.addEventListener('change', e => {
      if (e.target.matches('[data-range-select]')) applyRange(e.target.value);
    });
    DATE_FILTER_KEYS.forEach(key => {
      const el = document.getElementById(dateFilterId(prefix, key));
      if (el) el.addEventListener('change', e => {
        // a dropdown choice replaces the range: the range buttons go back to All
        riskDateFilter[key] = e.target.value;
        // a date and a week are alternatives: choosing one resets the other to All
        if (key === 'day') riskDateFilter.week = 'all';
        if (key === 'week') riskDateFilter.day = 'all';
        riskRange = 'all';
        renderRisk();
        renderReports();
        renderDashboard();
      });
    });
  });
  const riskTabEls = document.getElementById('riskTabs');
  if (riskTabEls) riskTabEls.addEventListener('click', e => {
    const btn = e.target.closest('[data-rep-tab]');
    if (!btn) return;
    riskTab = btn.dataset.repTab;
    renderRisk();
  });
  const riskBodyEl = document.getElementById('riskBody');
  if (riskBodyEl) riskBodyEl.addEventListener('click', e => {
    const b = e.target.closest('[data-rsk-mode]');
    if (!b) return;
    riskStatusMode = b.dataset.rskMode;
    renderRisk();
  });
  const reportBodyEl = document.getElementById('reportBody');
  if (reportBodyEl) {
    reportBodyEl.addEventListener('click', e => {
    });
  }
  window.addEventListener('resize', syncReportFrame, { passive: true });
}
