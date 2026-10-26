// ======================================================================
// brokers.js — Brokers view + real/paper account classification.
// ======================================================================
const BROKER_TYPE_STORAGE_KEY = 'tb_broker_account_types';
const DEFAULT_REAL_BROKERS = new Set(['fyers','kotak','groww']);
// Brokers added through Charges & Calculators → Edit mode (they may have no trades yet).
const CUSTOM_BROKERS_STORAGE_KEY = 'tb_custom_brokers';
function loadCustomBrokers(){
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_BROKERS_STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list.filter(b => b && typeof b.name === 'string' && b.name.trim()) : [];
  } catch(e){ return []; }
}
function saveCustomBrokers(list){ try { localStorage.setItem(CUSTOM_BROKERS_STORAGE_KEY, JSON.stringify(list)); } catch(e) {} }
// make them selectable wherever the ledger offers its broker list
loadCustomBrokers().forEach(b => { if (!LEDGER_BROKERS.some(x => x.toLowerCase() === b.name.toLowerCase())) LEDGER_BROKERS.push(b.name); });
function loadBrokerAccountTypes(){
  try { return JSON.parse(localStorage.getItem(BROKER_TYPE_STORAGE_KEY) || '{}') || {}; } catch(e){ return {}; }
}
function saveBrokerAccountTypes(map){ try { localStorage.setItem(BROKER_TYPE_STORAGE_KEY, JSON.stringify(map)); } catch(e) {} }
function calBrokerTypeOf(t) {
  const name = String(t?.broker || '').trim();
  if (!name) return 'paper';
  const map = loadBrokerAccountTypes();
  const key = name.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key] === 'real' ? 'real' : 'paper';
  return DEFAULT_REAL_BROKERS.has(key) ? 'real' : 'paper';
}

/* ---------------- opening credit (accounts without ledger rows) ----------------
   A paper account has no ledger rows, so its starting money is entered by hand: an amount and the date it was credited.
   Balance = opening credit + net P/L (gross + estimated charges) of that account's trades dated on or after the credit date.
   Ledger brokers keep their own Credit / Debit rows, so they never use an opening credit. */
const BROKER_OPENING_CREDIT_KEY = 'tb_broker_opening_credits';
function loadBrokerOpeningCredits(){
  try {
    const map = JSON.parse(localStorage.getItem(BROKER_OPENING_CREDIT_KEY) || '{}');
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch(e){ return {}; }
}
function saveBrokerOpeningCredits(map){ try { localStorage.setItem(BROKER_OPENING_CREDIT_KEY, JSON.stringify(map)); } catch(e) {} }
function brokerHasLedgerRows(name){
  const key = ledgerBrokerKey(name);
  return key !== '' && ledgers.some(r => ledgerBrokerKey(r.broker) === key);
}
// { amount, date } for a broker that has no ledger rows, otherwise null
function brokerOpeningCreditOf(name){
  if (brokerHasLedgerRows(name)) return null;
  const rec = loadBrokerOpeningCredits()[ledgerBrokerKey(name)];
  if (!rec) return null;
  const amount = Number(rec.amount), date = String(rec.date || '');
  if (!Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { amount, date };
}
// net P/L of one trade as the reports count it for an account without ledger rows
const brokerTradeNet = t => pnlOf(t) + reportTradeCharges(t);
// running balance of one account as { date, balance } points in date order, starting at its opening credit
function brokerBalancePoints(name, tradeList){
  const oc = brokerOpeningCreditOf(name);
  if (!oc) return null;
  const key = ledgerBrokerKey(name);
  const perDay = new Map();
  tradeList.forEach(t => {
    if (ledgerBrokerKey(t.broker) !== key) return;
    const d = reportDateOf(t.date ?? t.Date);
    if (!d || d < oc.date) return;
    perDay.set(d, (perDay.get(d) || 0) + brokerTradeNet(t));
  });
  let run = oc.amount;
  const points = [{ date: oc.date, balance: run }];
  [...perDay.keys()].sort().forEach(d => { run += perDay.get(d); points.push({ date: d, balance: run }); });
  return points;
}

// the Brokers and reports views both depend on account types and opening credits
function refreshBrokerDependentViews(){
  renderCalendar();
  renderBrokers();
  renderReports();
  renderRisk();
  renderTrades();
  renderLedger();
}

// one opening-credit row (amount + date) for an account without ledger rows
function brokerOpeningRowHtml(name){
  const key = ledgerBrokerKey(name);
  const oc = brokerOpeningCreditOf(name) || { amount: '', date: '' };
  const esc = v => String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  return `<div class="broker-opening" data-broker-key="${esc(key)}">
    <label><span>Initial credit ₹</span><input type="number" class="broker-opening-amount" step="any" min="0" placeholder="0" value="${oc.amount === '' ? '' : esc(oc.amount)}"></label>
    <label><span>Credited on</span><input type="date" class="broker-opening-date" value="${esc(oc.date)}"></label>
  </div>`;
}

function renderBrokerSettings(){
  const host = document.getElementById('brokerSettingsCards');
  if (!host) return;
  const fromTrades = trades.map(t => String(t.broker || '').trim()).filter(Boolean);
  const names = new Map();
  fromTrades.concat(loadCustomBrokers().map(b => b.name.trim())).forEach(n => { if (!names.has(n.toLowerCase())) names.set(n.toLowerCase(), n); });
  const brokers = Array.from(names.values()).sort((a,b)=>a.localeCompare(b));
  const map = loadBrokerAccountTypes();
  host.innerHTML = brokers.length ? brokers.map(name => {
    const key = name.toLowerCase();
    const type = Object.prototype.hasOwnProperty.call(map,key) ? map[key] : (DEFAULT_REAL_BROKERS.has(key) ? 'real' : 'paper');
    const noLedger = !brokerHasLedgerRows(name);
    return `<div class="broker-setting-card ${type === 'real' ? 'is-real' : ''} ${noLedger ? 'has-opening' : ''}">
      <div class="broker-setting-name"><span class="broker-setting-dot"></span><span>${name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span><em class="broker-setting-count">${trades.filter(t => String(t.broker||'').trim().toLowerCase() === key).length}</em></div>
      <select class="broker-setting-type" data-broker-key="${key.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">
        <option value="real" ${type === 'real' ? 'selected' : ''}>Real Broker</option>
        <option value="paper" ${type !== 'real' ? 'selected' : ''}>Paper Trading</option>
      </select>
      ${noLedger ? brokerOpeningRowHtml(name) : ''}
    </div>`;
  }).join('') : '<div class="broker-empty"><strong>No brokers found</strong><span>Add a trade with a broker/platform name to configure it here.</span></div>';
  host.querySelectorAll('.broker-setting-type').forEach(sel => sel.addEventListener('change', e => {
    const key = e.target.dataset.brokerKey;
    const next = loadBrokerAccountTypes();
    next[key] = e.target.value === 'real' ? 'real' : 'paper';
    saveBrokerAccountTypes(next);
    e.target.closest('.broker-setting-card')?.classList.toggle('is-real', next[key] === 'real');
    refreshBrokerDependentViews();
  }));
  // initial credit + date for accounts without ledger rows: both are needed, and clearing both removes the credit
  host.querySelectorAll('.broker-opening').forEach(row => {
    const save = () => {
      const amtRaw = row.querySelector('.broker-opening-amount').value.trim();
      const date = row.querySelector('.broker-opening-date').value;
      const map = loadBrokerOpeningCredits();
      if (amtRaw === '' && !date) {
        delete map[row.dataset.brokerKey];
      } else {
        const amount = Number(amtRaw);
        if (amtRaw === '' || !Number.isFinite(amount) || amount < 0) { showToast('Enter the initial credit as an amount of 0 or more'); return; }
        if (!date) { showToast('Set the date the initial credit was made'); return; }
        map[row.dataset.brokerKey] = { amount, date };
      }
      saveBrokerOpeningCredits(map);
      refreshBrokerDependentViews();
    };
    row.querySelectorAll('input').forEach(input => input.addEventListener('change', save));
  });
}
/* ---------------- brokers ---------------- */
// render the broker/account intelligence view. Calculations continue to use
// the same journal trade fields as the rest of the application.
function renderBrokers() {
  if (!document.getElementById('view-brokers')) return;   // the Brokers page has been removed
  const brokers = Array.from(new Set(trades.map(t => t.broker).filter(Boolean))).sort();
  const grid = document.getElementById('brokerGrid');
  const summary = document.getElementById('brokerSummary');
  const total = computeStats(trades);
  const activeDays = new Set(trades.map(t => t.date).filter(Boolean)).size;
  const avgTrade = total.n ? total.net / total.n : 0;

  if (summary) {
    summary.innerHTML = `
      <div class="broker-summary-card broker-summary-featured">
        <div class="broker-summary-top"><span class="broker-summary-label">Combined Gross P/L</span><span class="broker-summary-icon">↗</span></div>
        <strong class="broker-summary-value ${total.net >= 0 ? 'is-positive' : 'is-negative'}">${fmtMoney(total.net)}</strong>
        <span class="broker-summary-note">Across ${total.n.toLocaleString(numLocale())} recorded trades</span>
      </div>
      <div class="broker-summary-card">
        <div class="broker-summary-top"><span class="broker-summary-label">Accounts</span><span class="broker-summary-icon">◈</span></div>
        <strong class="broker-summary-value">${brokers.length}</strong>
        <span class="broker-summary-note">Broker / paper accounts tracked</span>
      </div>
      <div class="broker-summary-card">
        <div class="broker-summary-top"><span class="broker-summary-label">Average / trade</span><span class="broker-summary-icon">≈</span></div>
        <strong class="broker-summary-value ${avgTrade >= 0 ? 'is-positive' : 'is-negative'}">${fmtMoney(avgTrade)}</strong>
        <span class="broker-summary-note">Gross P/L per trade</span>
      </div>
      <div class="broker-summary-card">
        <div class="broker-summary-top"><span class="broker-summary-label">Win rate</span><span class="broker-summary-icon">%</span></div>
        <strong class="broker-summary-value">${total.n ? total.winRate.toFixed(1) : '0.0'}%</strong>
        <span class="broker-summary-note">${total.wins.toLocaleString(numLocale())} winning trades</span>
      </div>
      <div class="broker-summary-card">
        <div class="broker-summary-top"><span class="broker-summary-label">Trading days</span><span class="broker-summary-icon">□</span></div>
        <strong class="broker-summary-value">${activeDays}</strong>
        <span class="broker-summary-note">Unique dates in the journal</span>
      </div>`;
  }

  const updated = document.getElementById('brokerUpdatedLabel');
  if (updated) updated.textContent = brokers.length ? `${brokers.length} accounts · ${total.n.toLocaleString(numLocale())} trades` : 'No broker data';

  grid.innerHTML = brokers.map((b, index) => {
    const list = trades.filter(t => t.broker === b);
    const s = computeStats(list);
    const share = total.n ? (s.n / total.n * 100) : 0;
    const pf = s.pf === Infinity ? '∞' : s.pf.toFixed(2);
    const tone = s.net >= 0 ? 'positive' : 'negative';
    const bestLabel = s.best ? `${fmtMoney(pnlOf(s.best))} · ${s.best.symbol || 'Trade'}` : '—';
    const worstLabel = s.worst ? `${fmtMoney(pnlOf(s.worst))} · ${s.worst.symbol || 'Trade'}` : '—';
    const initial = (b || '?').trim().charAt(0).toUpperCase();
    const oc = brokerOpeningCreditOf(b);
    const points = oc ? brokerBalancePoints(b, trades) : null;
    const balance = points ? points[points.length - 1].balance : 0;
    const ret = oc && oc.amount ? (balance - oc.amount) / oc.amount * 100 : null;
    const balanceBlock = oc ? `<div class="broker-balance">
        <div><span>Initial credit</span><b>${fmtMoney(oc.amount)}</b><small>on ${formatDateDisplay(oc.date)}</small></div>
        <div><span>Balance</span><b>${fmtMoney(balance)}</b></div>
        <div><span>Return</span><b class="${ret !== null && ret < 0 ? 'is-negative' : 'is-positive'}">${ret === null ? '—' : `${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%`}</b></div>
      </div>` : '';
    return `<article class="broker-card broker-card-${tone}">
      <div class="broker-card-head">
        <div class="broker-brand"><span class="broker-avatar">${initial}</span><div><h3>${b}</h3><span>${s.n.toLocaleString(numLocale())} trades · ${share.toFixed(1)}% of journal</span></div></div>
        <span class="broker-status ${tone}"><i></i>${tone === 'positive' ? 'Positive' : 'Negative'}</span>
      </div>
      <div class="broker-main-metric">
        <span>Gross P/L</span>
        <strong>${fmtMoney(s.net)}</strong>
        <div class="broker-share-track"><span style="width:${Math.min(100, Math.max(3, share))}%"></span></div>
      </div>
      <div class="broker-metrics">
        <div><span>Win rate</span><b>${s.winRate.toFixed(1)}%</b></div>
        <div><span>Profit factor</span><b>${pf}</b></div>
        <div><span>Avg win</span><b>${fmtMoney(s.avgWin)}</b></div>
        <div><span>Avg loss</span><b>${fmtMoney(-s.avgLoss)}</b></div>
      </div>
      <div class="broker-trade-extremes">
        <div><span>Best trade</span><b>${bestLabel}</b></div>
        <div><span>Worst trade</span><b>${worstLabel}</b></div>
      </div>
      ${balanceBlock}
      <div class="broker-card-foot"><span>${s.wins} wins · ${s.losses} losses</span><span>Avg ${fmtMoney(s.n ? s.net / s.n : 0)} / trade</span></div>
    </article>`;
  }).join('') || `<div class="broker-empty"><strong>No broker records yet</strong><span>Add a trade with a broker/account name to see its performance here.</span></div>`;
}
/* ================= CHARGES & CALCULATORS ================= */
// Rate tables built from the broker rate-sheets/calculators supplied by the user
// (FYERS_Charges_List, Groww_Charges_All_Segments, Kotak_Charges_Calculator).
