// ======================================================================
// charges.js — Charges & Calculators view: rate editor, charge, MTF, SIP, lumpsum calcs.
// ======================================================================
/* ---------------- editable broker rate settings ---------------- */
const CHARGE_RATE_STORAGE_KEY = 'tb_charge_rates_v1';
function cloneRateData(obj) {
  return JSON.parse(JSON.stringify(obj, (key, value) => value === Infinity ? '__INFINITY__' : value));
}
function reviveRateData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  Object.keys(obj).forEach(k => {
    if (obj[k] === '__INFINITY__') obj[k] = Infinity;
    else if (obj[k] && typeof obj[k] === 'object') reviveRateData(obj[k]);
  });
  return obj;
}
function mergeRateData(target, source) {
  if (!source || typeof source !== 'object') return;
  Object.keys(source).forEach(k => {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) target[k] = {};
      mergeRateData(target[k], source[k]);
    } else {
      target[k] = source[k];
    }
  });
}
function loadSavedChargeRates() {
  try {
    const saved = localStorage.getItem(CHARGE_RATE_STORAGE_KEY);
    if (saved) mergeRateData(CHARGES_BROKERS, reviveRateData(JSON.parse(saved)));
  } catch (e) { /* keep built-in rates if saved settings are unavailable */ }
}
function saveChargeRates() {
  localStorage.setItem(CHARGE_RATE_STORAGE_KEY, JSON.stringify(cloneRateData(CHARGES_BROKERS)));
}
function pctDisplay(fraction) {
  const n = Number(fraction || 0) * 100;
  return `${n.toLocaleString(numLocale(), { maximumFractionDigits: 6 })}%`;
}
function brokerageRateText(br) {
  if (!br) return '—';
  if (br.mode === 'flat') return `₹${br.flat}/order`;
  if (br.mode === 'pctOfOrder') return pctDisplay(br.pct) + ' of order value';
  if (br.mode === 'cappedFlat') return `min(₹${br.flat}, ${pctDisplay(br.cap)} of leg)`;
  if (br.mode === 'minFlatPct') {
    let text = `min(₹${br.flat}, ${pctDisplay(br.pct)} of leg)`;
    if (br.floor) text += `; floor ₹${br.floor}`;
    return text;
  }
  return 'Configured rate';
}
function chargeRateRows(seg) {
  const rows = [];
  if (seg && seg.brokerage) rows.push(['Brokerage', brokerageRateText(seg.brokerage)]);
  if (seg && seg.stt && seg.stt.buy) rows.push(['STT / CTT (buy)', pctDisplay(seg.stt.buy)]);
  if (seg && seg.stt && seg.stt.sell) rows.push(['STT / CTT (sell)', pctDisplay(seg.stt.sell)]);
  if (seg && seg.stamp && seg.stamp.buy) rows.push(['Stamp duty (buy)', pctDisplay(seg.stamp.buy)]);
  if (seg && seg.exch) rows.push(['Exchange transaction charges', pctDisplay(seg.exch.pct)]);
  if (seg && seg.sebi) rows.push(['SEBI turnover charges', pctDisplay(seg.sebi.pct)]);
  if (seg && seg.ipft) rows.push(['IPFT', pctDisplay(seg.ipft.pct)]);
  if (seg && seg.clearing) rows.push(['Clearing charges', pctDisplay(seg.clearing.pct)]);
  if (seg && seg.dp) rows.push(['DP charge', `₹${seg.dp.male} male / ₹${seg.dp.female} female`]);
  rows.push(['GST', `${pctDisplay(CHARGES_BROKERS[chargesState.broker].gstRate ?? 0.18)} of configured applicable components`]);
  return rows;
}
function setRatePath(root, path, rawValue, isPercent) {
  const parts = path.split('.');
  let obj = root;
  for (let i=0;i<parts.length-1;i++) {
    const key = parts[i];
    if (obj[key] === undefined || obj[key] === null) obj[key] = {};
    obj = obj[key];
  }
  const last = parts[parts.length-1];
  if (isPercent) obj[last] = Number(rawValue || 0) / 100;
  else if (rawValue === '' && path.endsWith('.max')) obj[last] = Infinity;
  else if (rawValue === '') delete obj[last];
  else if (!isNaN(Number(rawValue))) obj[last] = Number(rawValue);
  else obj[last] = rawValue;
}
// Rates are edited in this page's Edit mode (js/settings-charges.js); the old pop-up editor is gone.
function openRateEditor(initialTab) {
  if (typeof openRatesInSettings === 'function') openRatesInSettings(typeof initialTab === 'string' ? initialTab : undefined);
}
const DEFAULT_CHARGE_BROKERS = cloneRateData(CHARGES_BROKERS);
loadSavedChargeRates();
// When the built-in rate tables gain new data (exchange variants, extra one-time rows, sources), copy only the
// NEW pieces into rates the user already saved — never overwrite their edits. Runs once per version.
const CHARGE_DEFAULTS_VERSION = '2026-10-03-sheets-complete';
const CHARGE_DEFAULTS_VERSION_KEY = 'tb_charge_defaults_ver';
function topUpSavedChargeDefaults() {
  try {
    if (localStorage.getItem(CHARGE_DEFAULTS_VERSION_KEY) === CHARGE_DEFAULTS_VERSION) return;
    if (localStorage.getItem(CHARGE_RATE_STORAGE_KEY)) {
      const defaults = reviveRateData(cloneRateData(DEFAULT_CHARGE_BROKERS));
      Object.keys(defaults).forEach(k => {
        const cur = CHARGES_BROKERS[k], def = defaults[k];
        if (!cur) return;
        if (!cur.source && def.source) cur.source = def.source;
        Object.keys(def.segments || {}).forEach(sk => {
          const cs = cur.segments && cur.segments[sk], ds = def.segments[sk];
          if (!cs) return;
          if (cs.exch && ds.exch && !cs.exch.name && ds.exch.name) cs.exch.name = ds.exch.name;
          if (!cs.exchAlt && ds.exchAlt) cs.exchAlt = ds.exchAlt;
        });
        if (Array.isArray(cur.oneTime) && Array.isArray(def.oneTime)) mergeOneTimeGroups(cur.oneTime, def.oneTime);
      });
      saveChargeRates();
    }
    localStorage.setItem(CHARGE_DEFAULTS_VERSION_KEY, CHARGE_DEFAULTS_VERSION);
  } catch (e) { /* storage unavailable — built-in data still shows */ }
}
topUpSavedChargeDefaults();
const CHARGES_SEGMENT_GROUPS = {
  brokerage: ['equityDelivery', 'equityIntraday'],
  fno: ['futures', 'options'],
  currency: ['currencyFutures', 'currencyOptions'],
  commodity: ['commodityFutures', 'commodityOptions']
};
const chargesState = { mode: 'calc', broker: 'fyers', sub: 'brokerage', brokerageSeg: 'equityDelivery', fnoSeg: 'futures', currencySeg: 'currencyFutures', commoditySeg: 'commodityFutures', gender: 'male', exchange: '' };
// core charge engine, shared by the brokerage and F&O calculators
function computeCharges(brokerKey, segKey, buyVal, sellVal, opts) {
  const b = CHARGES_BROKERS[brokerKey];
  const seg = b && b.segments[segKey];
  if (!seg)
    return null;
  const turnover = buyVal + sellVal;
  let brokerage = 0;
  const br = seg.brokerage;
  if (br.mode === 'minFlatPct') {
    let buyLeg = Math.min(br.flat, br.pct * buyVal);
    let sellLeg = Math.min(br.flat, br.pct * sellVal);
    if (br.floor) {
      if (buyVal > 0)
        buyLeg = Math.max(br.floor, buyLeg);
      if (sellVal > 0)
        sellLeg = Math.max(br.floor, sellLeg);
    }
    brokerage = (buyVal > 0 ? buyLeg : 0) + (sellVal > 0 ? sellLeg : 0);
  } else if (br.mode === 'cappedFlat') {
    const buyLeg = buyVal > 0 ? Math.min(br.flat, br.cap * buyVal) : 0;
    const sellLeg = sellVal > 0 ? Math.min(br.flat, br.cap * sellVal) : 0;
    brokerage = buyLeg + sellLeg;
  } else if (br.mode === 'pctOfOrder') {
    brokerage = br.pct * turnover;
  } else {
    brokerage = br.flat * ((buyVal > 0 ? 1 : 0) + (sellVal > 0 ? 1 : 0));
  }
  const stt = (seg.stt.buy || 0) * buyVal + (seg.stt.sell || 0) * sellVal;
  const stamp = (seg.stamp.buy || 0) * buyVal;
  let exchPct = seg.exch.pct || 0;
  if (opts && opts.exchange && Array.isArray(seg.exchAlt)) {
    const alt = seg.exchAlt.find(x => x.name === opts.exchange);
    if (alt) exchPct = alt.pct || 0;
  }
  const exch = exchPct * turnover;
  const sebi = (seg.sebi.pct || 0) * turnover;
  const ipft = ((seg.ipft && seg.ipft.pct) || 0) * turnover;
  const clearing = ((seg.clearing && seg.clearing.pct) || 0) * turnover;
  let dp = 0;
  if (seg.dp && sellVal >= 100)
    dp = (opts && opts.gender === 'female') ? seg.dp.female : seg.dp.male;
  const compMap = { brokerage, exch, sebi, ipft, clearing, dp };
  let gstBase = 0;
  (seg.gstOn || []).forEach(k => gstBase += (compMap[k] || 0));
  const gst = gstBase * (b.gstRate ?? 0.18);
  const total = brokerage + stt + stamp + exch + sebi + ipft + clearing + dp + gst;
  return { exchPct, brokerage, stt, stamp, exch, sebi, ipft, clearing, dp, gst, total, turnover, onPremium: !!seg.onPremium };
}
function fmt2(n) {
  return '₹' + n.toLocaleString(numLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// top-level entry point: renders broker pills, sub-tabs, and the active panel
function renderCharges() {
  const brokerTabs = document.getElementById('chargesBrokerTabs');
  const subTabs = document.getElementById('chargesSubTabs');
  const content = document.getElementById('chargesContent');
  const scHost = document.getElementById('chargesScHost');
  if (!['view', 'calc', 'edit'].includes(chargesState.mode)) chargesState.mode = 'calc';
  renderChargesModeBar();
  const calcMode = chargesState.mode === 'calc';
  brokerTabs.style.display = subTabs.style.display = content.style.display = calcMode ? '' : 'none';
  scHost.style.display = calcMode ? 'none' : '';
  if (!calcMode) {
    if (chargesState.sub === 'onetime') chargesState.sub = 'brokerage';
    if (typeof renderSettingsCharges === 'function') renderSettingsCharges();
    return;
  }
  if (chargesState.sub === 'onetime') chargesState.sub = 'brokerage';
  const isBrokerAgnostic = chargesState.sub === 'sip' || chargesState.sub === 'lumpsum';
  brokerTabs.style.display = isBrokerAgnostic ? 'none' : '';
  brokerTabs.innerHTML = Object.keys(CHARGES_BROKERS).map(k =>
    `<button class="broker-pill${ chargesState.broker === k ? ' active' : '' }" data-broker="${ k }">${ CHARGES_BROKERS[k].label }</button>`
  ).join('');
  brokerTabs.querySelectorAll('.broker-pill[data-broker]').forEach(btn => {
    btn.addEventListener('click', () => { chargesState.broker = btn.dataset.broker; renderCharges(); });
  });
  const subs = [
    ['brokerage', 'Capital'],
    ['fno', 'Equity'], ['currency', 'Currency'], ['commodity', 'Commodity'],
    ['mtf', 'MTF'], ['account', 'Account fees'], ['sip', 'SIP'], ['lumpsum', 'Lumpsum']
  ];
  subTabs.innerHTML = subs.map(([k, label]) =>
    `<button class="subtab-btn${ chargesState.sub === k ? ' active' : '' }" data-sub="${ k }">${ label }</button>`
  ).join('');
  subTabs.querySelectorAll('.subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => { chargesState.sub = btn.dataset.sub; renderCharges(); });
  });
  if (chargesState.sub === 'brokerage')
    content.innerHTML = renderCalcShellHTML('brokerage');
  else if (chargesState.sub === 'fno')
    content.innerHTML = renderCalcShellHTML('fno');
  else if (chargesState.sub === 'currency')
    content.innerHTML = renderCalcShellHTML('currency');
  else if (chargesState.sub === 'commodity')
    content.innerHTML = renderCalcShellHTML('commodity');
  else if (chargesState.sub === 'mtf')
    content.innerHTML = renderMtfShellHTML();
  else if (chargesState.sub === 'account')
    content.innerHTML = renderAccountShellHTML();
  else if (chargesState.sub === 'sip')
    content.innerHTML = renderSipShellHTML();
  else if (chargesState.sub === 'lumpsum')
    content.innerHTML = renderLumpsumShellHTML();
  // wire up whichever panel just got rendered
  if (['brokerage', 'fno', 'currency', 'commodity'].includes(chargesState.sub))
    wireCalc(chargesState.sub);
  else if (chargesState.sub === 'mtf')
    wireMtf();
  else if (chargesState.sub === 'account')
    wireAccount();
  else if (chargesState.sub === 'sip')
    wireSip();
  else if (chargesState.sub === 'lumpsum')
    wireLumpsum();
}
function renderChargesModeBar() {
  const bar = document.getElementById('chargesModeBar');
  if (!bar) return;
  const modes = [['view', 'View'], ['calc', 'Calculator'], ['edit', 'Edit']];
  bar.innerHTML = modes.map(([k, l]) => `<button type="button" class="charges-mode-btn${chargesState.mode === k ? ' active' : ''}" data-charges-mode="${k}">${l}</button>`).join('');
  bar.querySelectorAll('[data-charges-mode]').forEach(btn => btn.addEventListener('click', () => {
    const m = btn.dataset.chargesMode;
    if (m === chargesState.mode) return;
    if (chargesState.mode === 'edit' && typeof scState !== 'undefined' && scState.dirty) {
      if (!confirm('Leave Edit mode? Unsaved changes will be discarded.')) return;
      scSelect(scState.broker);   // drops the draft
    }
    if (typeof scState !== 'undefined') { scState.adding = false; scState.pickView = false; }
    chargesState.mode = m;
    renderCharges();
  }));
}
function renderOneTimeHTML() {
  const b = CHARGES_BROKERS[chargesState.broker];
  let html = `<div class="panel charges-info-panel">`;
  if (b.missingOneTime)
    html += `<p class="onetime-note">No account, DP or penalty charges are on file for ${ b.label }. Add them in <b>Edit mode → One-time</b>.</p>`;
  html += b.oneTime.map(group => `
    <div class="onetime-group">
      <h3>${ group.title }</h3>
      ${ group.items.map(([label, value]) => `<div class="detail-row"><span>${ label }</span><span>${ value }</span></div>`).join('') }
    </div>`).join('');
  if (b.source && (b.source.file || b.source.asOf))
    html += `<p class="onetime-source">Source: ${ escapeHtml([b.source.file, b.source.asOf ? 'as of ' + b.source.asOf : ''].filter(Boolean).join(' · ')) }. Verify against the broker's live pricing page before relying on it.</p>`;
  html += `</div>`;
  return html;
}
function segPickerHTML(kind) {
  const keys = CHARGES_SEGMENT_GROUPS[kind].filter(k => CHARGES_BROKERS[chargesState.broker].segments[k]);
  const stateKey = kind === 'brokerage' ? 'brokerageSeg' : kind === 'fno' ? 'fnoSeg' : kind === 'currency' ? 'currencySeg' : 'commoditySeg';
  if (!keys.includes(chargesState[stateKey]))
    chargesState[stateKey] = keys[0];
  return `<div class="segment-select-row" id="calcSegRow">${ keys.map(k =>
    `<button class="seg-pill${ chargesState[stateKey] === k ? ' active' : '' }" data-seg="${ k }">${ CHARGES_BROKERS[chargesState.broker].segments[k].label }</button>`
  ).join('') }</div>`;
}
// one result row: label | formula hint | value  (cls: total / net, valCls: pos / neg)
function calcRow(label, hint, value, cls, valCls) {
  return `<tr${ cls ? ` class="${ cls }"` : '' }><td class="c-label">${ label }</td><td class="c-hint">${ hint || '' }</td><td class="c-val${ valCls ? ' ' + valCls : '' }">${ value }</td></tr>`;
}
function calcPanelHead(title, sub, editBtnHTML) {
  return `<div class="calc-panel-head"><h3>${ title }</h3><span>${ sub }</span>${ editBtnHTML || '' }</div>`;
}
// Broker-profile fees (Edit mode → Profile) that apply per trade: call & trade, auto square-off
function extraFeeFieldsHTML() {
  const pf = CHARGES_BROKERS[chargesState.broker].profile || {};
  let html = '';
  if (pf.callTrade > 0)
    html += `<div class="field"><label for="calcCtOrders">Orders placed via call &amp; trade (₹${ pf.callTrade } + GST each)</label><input type="number" id="calcCtOrders" min="0" step="1" value="${ chargesState.ctOrders || 0 }"></div>`;
  if (pf.autoSquare > 0)
    html += `<div class="field"><label class="calc-check"><input type="checkbox" id="calcAutoSq"${ chargesState.autoSq ? ' checked' : '' }> Position auto squared-off by broker (₹${ pf.autoSquare } + GST)</label></div>`;
  return html;
}
function renderCalcShellHTML(kind) {
  const stateKey = kind === 'brokerage' ? 'brokerageSeg' : kind === 'fno' ? 'fnoSeg' : kind === 'currency' ? 'currencySeg' : 'commoditySeg';
  const available = CHARGES_SEGMENT_GROUPS[kind].filter(k => CHARGES_BROKERS[chargesState.broker].segments[k]);
  if (!available.length) return `<div class="panel"><p class="onetime-note">No ${kind} rates are configured for ${CHARGES_BROKERS[chargesState.broker].label}.</p></div>`;
  if (!available.includes(chargesState[stateKey])) chargesState[stateKey] = available[0];
  const seg = CHARGES_BROKERS[chargesState.broker].segments[chargesState[stateKey]];
  const priceLabel = seg && seg.onPremium ? 'Premium' : 'Price';
  const showGender = !!(seg && seg.dp);
  const alts = (seg && Array.isArray(seg.exchAlt)) ? seg.exchAlt : [];
  if (!alts.some(a => a.name === chargesState.exchange)) chargesState.exchange = '';
  const exchField = alts.length ? `<div class="field"><label for="calcExchange">Exchange</label><select id="calcExchange"><option value="">${ escapeHtml((seg.exch && seg.exch.name) || 'Default') } (default)</option>${ alts.map(a => `<option value="${ escapeHtml(a.name) }"${ chargesState.exchange === a.name ? ' selected' : '' }>${ escapeHtml(a.name) }</option>`).join('') }</select></div>` : '';
  const kindLabel = kind === 'brokerage' ? 'Capital' : kind === 'fno' ? 'Equity' : kind.charAt(0).toUpperCase() + kind.slice(1);
  return `
  <div class="calc-layout">
    <div class="panel calc-input-panel">
      ${ calcPanelHead('Inputs', 'Trade values') }
      ${ segPickerHTML(kind) }
      <div class="field"><label for="calcQty">Quantity</label><input type="number" id="calcQty" value="${ kind === 'fno' ? 500 : 100 }" min="1"></div>
      <div class="field-row">
        <div class="field"><label for="calcBuy">Buy ${ priceLabel } (₹)</label><input type="number" id="calcBuy" step="any" value="100"></div>
        <div class="field"><label for="calcSell">Sell ${ priceLabel } (₹)</label><input type="number" id="calcSell" step="any" value="105"></div>
      </div>
      ${ exchField }
      ${ extraFeeFieldsHTML() }
      ${ showGender ? `<div class="field"><label for="calcGender">Gender (affects DP charge)</label><select id="calcGender"><option value="male"${ chargesState.gender === 'male' ? ' selected' : '' }>Male</option><option value="female"${ chargesState.gender === 'female' ? ' selected' : '' }>Female</option></select></div>` : '' }
      <p class="calc-note">Uses the ${ CHARGES_BROKERS[chargesState.broker].label } rates currently saved. Change them in <b>Edit mode</b> (or tap <b>Edit rates</b>) whenever the broker updates its tariff.</p>
    </div>
    <div class="panel calc-result-panel">
      ${ calcPanelHead('Charges breakdown', 'From current rates', `<button type="button" class="btn ghost small" id="editCurrentRates">Edit ${ kindLabel } rates</button>`) }
      <table class="calc-result-table" id="calcResultTable"></table>
    </div>
  </div>`;
}
function calcResultRowsHTML(r, seg, x) {
  if (!r) return '';
  const sttRate = `Buy ${pctDisplay(seg.stt?.buy)} / Sell ${pctDisplay(seg.stt?.sell)}`;
  let html = calcRow('Brokerage', brokerageRateText(seg.brokerage), fmt2(r.brokerage))
    + calcRow('STT / CTT', sttRate, fmt2(r.stt))
    + calcRow('Stamp duty', `${pctDisplay(seg.stamp?.buy)} on buy value`, fmt2(r.stamp))
    + calcRow('Exchange transaction charges', `${pctDisplay(r.exchPct)} on turnover${ chargesState.exchange ? ' · ' + escapeHtml(chargesState.exchange) : (seg.exch?.name ? ' · ' + escapeHtml(seg.exch.name) : '') }`, fmt2(r.exch))
    + calcRow('SEBI turnover charges', `${pctDisplay(seg.sebi?.pct)} on turnover`, fmt2(r.sebi));
  if (r.ipft) html += calcRow('IPFT', `${pctDisplay(seg.ipft?.pct)} on turnover`, fmt2(r.ipft));
  if (r.clearing) html += calcRow('Clearing charges', `${pctDisplay(seg.clearing?.pct)} on turnover`, fmt2(r.clearing));
  if (r.dp) html += calcRow('DP charges', seg.dp ? `₹${seg.dp.male} male / ₹${seg.dp.female} female` : 'Fixed', fmt2(r.dp));
  html += calcRow('GST', `${pctDisplay(CHARGES_BROKERS[chargesState.broker].gstRate ?? 0.18)} on applicable components`, fmt2(r.gst));
  x = x || { ct: 0, asq: 0, gst: 0 };
  if (x.ct) html += calcRow('Call & trade fee', `₹${ (CHARGES_BROKERS[chargesState.broker].profile || {}).callTrade } × ${ x.orders } order(s)`, fmt2(x.ct));
  if (x.asq) html += calcRow('Auto square-off fee', 'Per position squared-off', fmt2(x.asq));
  if (x.gst) html += calcRow('GST on call & trade / square-off', `${pctDisplay(CHARGES_BROKERS[chargesState.broker].gstRate ?? 0.18)} on these fees`, fmt2(x.gst));
  return html + calcRow('Total charges', '', fmt2(r.total + x.ct + x.asq + x.gst), 'total');
}
function runCalc(kind) {
  const stateKey = kind === 'brokerage' ? 'brokerageSeg' : kind === 'fno' ? 'fnoSeg' : kind === 'currency' ? 'currencySeg' : 'commoditySeg';
  const segKey = chargesState[stateKey];
  if (!document.getElementById('calcQty')) return;   // broker has no rates for this segment (shows a note instead)
  const qty = parseFloat(document.getElementById('calcQty').value) || 0;
  const buyPrice = parseFloat(document.getElementById('calcBuy').value) || 0;
  const sellPrice = parseFloat(document.getElementById('calcSell').value) || 0;
  const genderEl = document.getElementById('calcGender');
  const buyVal = qty * buyPrice, sellVal = qty * sellPrice;
  const exchEl = document.getElementById('calcExchange');
  chargesState.exchange = exchEl ? exchEl.value : '';
  const r = computeCharges(chargesState.broker, segKey, buyVal, sellVal, { gender: genderEl ? genderEl.value : chargesState.gender, exchange: chargesState.exchange });
  const table = document.getElementById('calcResultTable');
  if (!table) return;
  const bk = CHARGES_BROKERS[chargesState.broker], pf = bk.profile || {};
  const ctEl = document.getElementById('calcCtOrders'), asEl = document.getElementById('calcAutoSq');
  chargesState.ctOrders = ctEl ? Math.max(0, parseInt(ctEl.value, 10) || 0) : 0;
  chargesState.autoSq = !!(asEl && asEl.checked);
  const ct = chargesState.ctOrders * (pf.callTrade || 0), asq = chargesState.autoSq ? (pf.autoSquare || 0) : 0;
  const x = { ct, asq, orders: chargesState.ctOrders, gst: (ct + asq) * (bk.gstRate ?? 0.18) };
  const extras = r ? ct + asq + x.gst : 0;
  const grossPL = sellVal - buyVal;
  const netPL = r ? grossPL - r.total - extras : grossPL;
  table.innerHTML = calcResultRowsHTML(r, bk.segments[segKey], x) +
    calcRow('Gross P/L', 'Sell value − buy value', fmt2(grossPL), 'total') +
    calcRow('P/L after charges', '', fmt2(netPL), 'net', netPL >= 0 ? 'pos' : 'neg');
}
function wireCalc(kind) {
  const stateKey = kind === 'brokerage' ? 'brokerageSeg' : kind === 'fno' ? 'fnoSeg' : kind === 'currency' ? 'currencySeg' : 'commoditySeg';
  document.querySelectorAll('#calcSegRow .seg-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      chargesState[stateKey] = btn.dataset.seg;
      chargesState.exchange = '';
      document.getElementById('chargesContent').innerHTML = renderCalcShellHTML(kind);
      wireCalc(kind);
    });
  });
  ['calcQty', 'calcBuy', 'calcSell', 'calcGender', 'calcExchange', 'calcCtOrders', 'calcAutoSq'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => runCalc(kind));
  });
  runCalc(kind);
  const editBtn = document.getElementById('editCurrentRates');
  if (editBtn) {
    const initialTab = kind === 'brokerage' ? 'equity' : kind;
    editBtn.addEventListener('click', () => openRateEditor(initialTab));
  }
}
// Account fees: opening, AMC, platform and pledge fees from the broker profile (Edit mode → Profile)
const ACCOUNT_FEE_KEYS = ['openingFee', 'amc', 'platformFee', 'pledgeFee'];
function renderAccountShellHTML() {
  const b = CHARGES_BROKERS[chargesState.broker], pf = b.profile || {};
  if (!ACCOUNT_FEE_KEYS.some(k => pf[k] > 0))
    return `<div class="panel"><p class="onetime-note">No account fees are on file for ${ b.label }. Add the opening fee, AMC, platform fee or pledge fee in <b>Edit mode → Profile</b>.</p></div>`;
  return `
  <div class="calc-layout">
    <div class="panel calc-input-panel">
      ${ calcPanelHead('Inputs', 'How long you keep the account') }
      <div class="field-row">
        <div class="field"><label for="acctYears">Years</label><input type="number" id="acctYears" value="1" min="0" step="any"></div>
        <div class="field"><label for="acctPledges">Pledge / unpledge requests</label><input type="number" id="acctPledges" value="0" min="0" step="1"></div>
      </div>
      <div class="field"><label class="calc-check"><input type="checkbox" id="acctGst" checked> Add GST to these fees</label></div>
      <p class="calc-note">Uses the fees entered under ${ b.label } → Profile. Trading charges are not included — see the other calculators.</p>
    </div>
    <div class="panel calc-result-panel">
      ${ calcPanelHead('Account cost', 'Fees from broker profile', '<button type="button" class="btn ghost small" id="editAcctFees">Edit fees</button>') }
      <table class="calc-result-table" id="acctResultTable"></table>
    </div>
  </div>`;
}
function runAccount() {
  const table = document.getElementById('acctResultTable');
  if (!table) return;
  const b = CHARGES_BROKERS[chargesState.broker], pf = b.profile || {};
  const years = Math.max(0, parseFloat(document.getElementById('acctYears').value) || 0);
  const pledges = Math.max(0, parseInt(document.getElementById('acctPledges').value, 10) || 0);
  const withGst = document.getElementById('acctGst').checked;
  const rows = [
    ['Account opening', 'One-time', pf.openingFee || 0],
    ['AMC', `₹${ pf.amc || 0 } × ${ years } yr`, (pf.amc || 0) * years],
    ['Platform / data fee', `₹${ pf.platformFee || 0 } × ${ years * 12 } months`, (pf.platformFee || 0) * years * 12],
    ['Pledge / unpledge', `₹${ pf.pledgeFee || 0 } × ${ pledges }`, (pf.pledgeFee || 0) * pledges]
  ].filter(r => r[2] > 0);
  const sub = rows.reduce((a, r) => a + r[2], 0);
  const gst = withGst ? sub * (b.gstRate ?? 0.18) : 0;
  const total = sub + gst;
  table.innerHTML = rows.map(r => calcRow(r[0], r[1], fmt2(r[2]))).join('') +
    calcRow('Fees before GST', '', fmt2(sub), 'total') +
    (withGst ? calcRow('GST', `${ pctDisplay(b.gstRate ?? 0.18) } on the fees above`, fmt2(gst)) : '') +
    calcRow(`Total over ${ years } year(s)`, '', fmt2(total), 'net') +
    calcRow('Average per month', 'Total ÷ months', fmt2(years > 0 ? total / (years * 12) : 0));
}
function wireAccount() {
  ['acctYears', 'acctPledges', 'acctGst'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', runAccount); });
  const eb = document.getElementById('editAcctFees');
  if (eb) eb.addEventListener('click', () => { if (typeof openRatesInSettings === 'function') { openRatesInSettings(); scState.tab = 'Profile'; renderCharges(); } });
  runAccount();
}
// MTF calculator: funded amount, slab/flat interest rate, brokerage on entry+exit
function renderMtfShellHTML() {
  const b = CHARGES_BROKERS[chargesState.broker];
  if (!b.mtf)
    return `<div class="panel"><p class="onetime-note">${ b.label } has no MTF rates set up. Add them in <b>Edit mode → MTF</b> if the broker offers MTF.</p></div>`;
  return `
  <div class="calc-layout">
    <div class="panel calc-input-panel">
      ${ calcPanelHead('Inputs', 'Position & holding') }
      <div class="field"><label for="mtfValue">Position value (₹)</label><input type="number" id="mtfValue" value="100000" min="0"></div>
      <div class="field-row">
        <div class="field"><label for="mtfMargin">Your margin (%)</label><input type="number" id="mtfMargin" value="20" min="1" max="100"></div>
        <div class="field"><label for="mtfDays">Holding (days)</label><input type="number" id="mtfDays" value="10" min="1"></div>
      </div>
      <p class="calc-note">Funded amount = position value − your margin. Interest is charged on the funded amount for the days held; brokerage applies to the buy and sell legs at ${ b.label }'s MTF rate.</p>
    </div>
    <div class="panel calc-result-panel">
      ${ calcPanelHead('Cost breakdown', 'Funding + interest + brokerage', '<button type="button" class="btn ghost small" id="editMtfRates">Edit MTF rates</button>') }
      <table class="calc-result-table" id="mtfResultTable"></table>
    </div>
  </div>`;
}
function runMtf() {
  const b = CHARGES_BROKERS[chargesState.broker];
  if (!b.mtf) return;
  const value = parseFloat(document.getElementById('mtfValue').value) || 0;
  const marginPct = parseFloat(document.getElementById('mtfMargin').value) || 0;
  const days = parseFloat(document.getElementById('mtfDays').value) || 0;
  const funded = value * (1 - marginPct / 100);
  const slab = b.mtf.slabs.find(s => funded <= s.max) || b.mtf.slabs[b.mtf.slabs.length - 1];
  const interest = funded * slab.rate * (days / 365);   // slab.rate is a fraction (0.1649 = 16.49% p.a.), same as the Edit rates popup
  let brokerage = 0;
  const br = b.mtf.brokerage;
  if (br.mode === 'minFlatPct')
    brokerage = Math.min(br.flat, br.pct * value) * 2;
  else if (br.mode === 'pctOfOrder')
    brokerage = br.pct * value * 2;
  else if (br.mode === 'flat')
    brokerage = (br.flat || 0) * 2;
  const total = interest + brokerage;
  const table = document.getElementById('mtfResultTable');
  if (!table) return;
  table.innerHTML =
    calcRow('Your margin', `${marginPct}% of position`, fmt2(value - funded)) +
    calcRow('Funded amount', `${100 - marginPct}% of position`, fmt2(funded)) +
    calcRow('Interest rate', `Slab: up to ${Number.isFinite(slab.max) ? fmt2(slab.max) : 'no limit'} funded`, `${ pctDisplay(slab.rate) } p.a.`) +
    calcRow(`Interest for ${ days } day(s)`, `${pctDisplay(slab.rate)} × ${days}/365`, fmt2(interest)) +
    calcRow('Brokerage (entry + exit)', `${brokerageRateText(br)} × 2 legs`, fmt2(brokerage)) +
    calcRow('Total MTF cost', 'Interest + brokerage', fmt2(total), 'net');
}
function wireMtf() {
  ['mtfValue', 'mtfMargin', 'mtfDays'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', runMtf);
  });
  runMtf();
  const editBtn = document.getElementById('editMtfRates');
  if (editBtn) editBtn.addEventListener('click', () => openRateEditor('mtf'));
}
// SIP / Lumpsum: broker-agnostic compounding calculators (direct mutual fund investing
// is zero-commission with FYERS and Groww per their rate sheets; Kotak's MF charges weren't shared)
function renderSipShellHTML() {
  return `
  <div class="calc-layout">
    <div class="panel calc-input-panel">
      ${ calcPanelHead('Inputs', 'Monthly SIP') }
      <div class="field"><label for="sipAmt">Monthly investment (₹)</label><input type="number" id="sipAmt" value="10000" min="0"></div>
      <div class="field-row">
        <div class="field"><label for="sipRate">Annual return (%)</label><input type="number" id="sipRate" value="12" step="any"></div>
        <div class="field"><label for="sipYears">Duration (years)</label><input type="number" id="sipYears" value="10" min="1"></div>
      </div>
      <p class="calc-note">Direct mutual fund SIPs are zero-commission with FYERS and Groww. This is a pure return projection — the fund's expense ratio and exit load aren't included.</p>
    </div>
    <div class="panel calc-result-panel">
      ${ calcPanelHead('Projection', 'Monthly compounding') }
      <table class="calc-result-table" id="sipResultTable"></table>
    </div>
  </div>`;
}
function runSip() {
  const amt = parseFloat(document.getElementById('sipAmt').value) || 0;
  const rate = parseFloat(document.getElementById('sipRate').value) || 0;
  const years = parseFloat(document.getElementById('sipYears').value) || 0;
  const n = years * 12, r = rate / 100 / 12;
  const fv = r > 0 ? amt * ((Math.pow(1 + r, n) - 1) / r) * (1 + r) : amt * n;
  const invested = amt * n;
  const table = document.getElementById('sipResultTable');
  if (!table) return;
  table.innerHTML =
    calcRow('Monthly investment', `${fmt2(amt)} per month`, fmt2(amt)) +
    calcRow('Expected annual return', `${rate}% p.a. / ${(rate/12).toFixed(4)}% monthly`, `${ rate.toFixed(2) }%`) +
    calcRow('Investment duration', `${n} monthly instalments`, `${ years } years`) +
    calcRow('Total invested', `${n} × monthly investment`, fmt2(invested)) +
    calcRow('Estimated gains', `Projection at ${rate}% p.a.`, fmt2(fv - invested), '', 'pos') +
    calcRow('Maturity value', 'Monthly compounding', fmt2(fv), 'net');
}
function wireSip() {
  ['sipAmt', 'sipRate', 'sipYears'].forEach(id => document.getElementById(id).addEventListener('input', runSip));
  runSip();
}
function renderLumpsumShellHTML() {
  return `
  <div class="calc-layout">
    <div class="panel calc-input-panel">
      ${ calcPanelHead('Inputs', 'One-time investment') }
      <div class="field"><label for="lumpAmt">Investment amount (₹)</label><input type="number" id="lumpAmt" value="100000" min="0"></div>
      <div class="field-row">
        <div class="field"><label for="lumpRate">Annual return (%)</label><input type="number" id="lumpRate" value="12" step="any"></div>
        <div class="field"><label for="lumpYears">Duration (years)</label><input type="number" id="lumpYears" value="10" min="1"></div>
      </div>
      <p class="calc-note">Direct mutual fund lump-sum investing is zero-commission with FYERS and Groww. Assumes annual compounding; expense ratio and exit load aren't included.</p>
    </div>
    <div class="panel calc-result-panel">
      ${ calcPanelHead('Projection', 'Annual compounding') }
      <table class="calc-result-table" id="lumpResultTable"></table>
    </div>
  </div>`;
}
function runLumpsum() {
  const amt = parseFloat(document.getElementById('lumpAmt').value) || 0;
  const rate = parseFloat(document.getElementById('lumpRate').value) || 0;
  const years = parseFloat(document.getElementById('lumpYears').value) || 0;
  const fv = amt * Math.pow(1 + rate / 100, years);
  const table = document.getElementById('lumpResultTable');
  if (!table) return;
  table.innerHTML =
    calcRow('Invested amount', 'Initial principal', fmt2(amt)) +
    calcRow('Expected annual return', `${rate}% p.a.`, `${ rate.toFixed(2) }%`) +
    calcRow('Duration', 'Annual compounding', `${ years } years`) +
    calcRow('Estimated gains', `Projection at ${rate}% p.a.`, fmt2(fv - amt), '', 'pos') +
    calcRow('Maturity value', `Principal × (1 + ${rate}/100)^${years}`, fmt2(fv), 'net');
}
function wireLumpsum() {
  ['lumpAmt', 'lumpRate', 'lumpYears'].forEach(id => document.getElementById(id).addEventListener('input', runLumpsum));
  runLumpsum();
}
