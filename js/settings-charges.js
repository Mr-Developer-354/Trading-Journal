// ======================================================================
// settings-charges.js — Charges & Calculators → View / Edit modes for every REAL broker's rate card.
// ----------------------------------------------------------------------
// * Lists every broker classified as "Real Broker" (Settings → Broker accounts).
// * Each one gets its own rate card, stored in CHARGES_BROKERS (same data the
//   Charges & Calculators page and charge engine use), saved via saveChargeRates().
// * Brokers with no rate card yet can be set up from a template.
// * NEW BROKERS CAN BE ADDED HERE ("+ Add broker"): the broker is remembered (brokers.js →
//   loadCustomBrokers), marked Real, offered in the Ledger broker list, and gets its own rate card.
// * A rate card can be exported/imported as JSON, to move it between browsers or share it.
// Depends on: brokers.js (calBrokerTypeOf), charges-rates.js, charges.js, utils.js
// ======================================================================

const SC_SEGMENTS = [
  { key: 'equityDelivery',   label: 'Capital Delivery',  group: 'Equity' },
  { key: 'equityIntraday',   label: 'Capital Intraday',  group: 'Equity' },
  { key: 'futures',          label: 'Futures',           group: 'F&O' },
  { key: 'options',          label: 'Options',           group: 'F&O',       onPremium: true },
  { key: 'currencyFutures',  label: 'Currency Futures',  group: 'Currency' },
  { key: 'currencyOptions',  label: 'Currency Options',  group: 'Currency',  onPremium: true },
  { key: 'commodityFutures', label: 'Commodity Futures', group: 'Commodity' },
  { key: 'commodityOptions', label: 'Commodity Options', group: 'Commodity', onPremium: true }
];
const SC_GST_COMPONENTS = [
  ['brokerage', 'Brokerage'], ['exch', 'Exchange'], ['sebi', 'SEBI'],
  ['ipft', 'IPFT'], ['clearing', 'Clearing'], ['dp', 'DP']
];
const SC_BROKERAGE_MODES = [
  ['minFlatPct', 'Lower of flat ₹ / % of leg'],
  ['flat', 'Flat ₹ per order'],
  ['cappedFlat', 'Lower of flat ₹ / cap % of leg'],
  ['pctOfOrder', '% of order value']
];

// Statutory charges at NSE rates (same figures as the FYERS card). Brokerage is only a
// placeholder — it differs per broker, so the user must enter their own.
const SC_STANDARD_SEGMENTS = {
  equityDelivery:   { brokerage: { mode: 'flat', flat: 0 },                       stt: { buy: 0.001, sell: 0.001 }, stamp: { buy: 0.00015 },  exch: { pct: 0.0000307 },   sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },      clearing: { pct: 0 },        gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
  equityIntraday:   { brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.0003 },   stt: { sell: 0.00025 },           stamp: { buy: 0.00003 },   exch: { pct: 0.0000307 },   sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },      clearing: { pct: 0 },        gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
  futures:          { brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.0003 },   stt: { sell: 0.0005 },            stamp: { buy: 0.00002 },   exch: { pct: 0.0000183 },   sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },      clearing: { pct: 0 },        gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
  options:          { brokerage: { mode: 'flat', flat: 20 },                       stt: { sell: 0.0015 },            stamp: { buy: 0.00003 },   exch: { pct: 0.0003553 },   sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },      clearing: { pct: 0 },        onPremium: true, gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
  currencyFutures:  { brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.0003 },   stt: {},                          stamp: { buy: 0.000001 },  exch: { pct: 0.0000035 },   sebi: { pct: 0.000001 }, ipft: { pct: 0.0000005 }, clearing: { pct: 0 },        gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
  currencyOptions:  { brokerage: { mode: 'flat', flat: 20 },                       stt: {},                          stamp: { buy: 0.000001 },  exch: { pct: 0.000311 },    sebi: { pct: 0.000001 }, ipft: { pct: 0.00002 },   clearing: { pct: 0 },        onPremium: true, gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
  commodityFutures: { brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.0003 },   stt: { sell: 0.0001 },            stamp: { buy: 0.00002 },   exch: { pct: 0.000021 },    sebi: { pct: 0.000001 }, ipft: { pct: 0 },          clearing: { pct: 0 },        gstOn: ['brokerage','exch','sebi','clearing'] },
  commodityOptions: { brokerage: { mode: 'flat', flat: 20 },                       stt: { sell: 0.0005 },            stamp: { buy: 0.00003 },   exch: { pct: 0.000418 },    sebi: { pct: 0.000001 }, ipft: { pct: 0 },          clearing: { pct: 0 },        onPremium: true, gstOn: ['brokerage','exch','sebi','clearing'] }
};

const SC_VIEW_ITEMS_KEY = 'tb_sc_view_items_v1';
// Display names for the rate-card tabs (the internal tab ids stay as they are)
const SC_TAB_LABEL = { Equity: 'Capital', 'F&O': 'Equity' };
const scState = { pickView: false, adding: false, broker: null, draft: null, dirty: false, tab: 'Equity', previewSeg: null, previewBuy: 100000, previewSell: 101000 };

/* ---------------- helpers ---------------- */
function scEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function scKeyOf(name) { return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
function scClone(o) { return reviveRateData(cloneRateData(o)); }
// fraction → percent text without float noise (0.000030699 → 0.0030699)
function scPct(f) { return Number((Number(f || 0) * 100).toPrecision(10)); }
function scFrac(p) { return Number((Number(p || 0) / 100).toPrecision(12)); }
function scGet(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }

// Every broker name the app knows about: key → display name.
function scKnownBrokers() {
  const names = new Map();
  const add = n => { n = String(n || '').trim(); if (n && !names.has(scKeyOf(n))) names.set(scKeyOf(n), n); };
  (typeof trades !== 'undefined' ? trades : []).forEach(t => add(t.broker));
  (typeof ledgers !== 'undefined' ? ledgers : []).forEach(r => add(r.broker));
  (typeof LEDGER_BROKERS !== 'undefined' ? LEDGER_BROKERS : []).forEach(add);
  loadCustomBrokers().forEach(b => add(b.name));
  Object.keys(CHARGES_BROKERS).forEach(k => { if (!names.has(k)) names.set(k, CHARGES_BROKERS[k].label); });
  return names;
}
// …of which the ones classified Real (Settings → Broker accounts).
function scRealBrokers() {
  const out = [];
  scKnownBrokers().forEach((name, key) => {
    if (calBrokerTypeOf({ broker: name }) === 'real')
      out.push({ key, name: CHARGES_BROKERS[key] ? CHARGES_BROKERS[key].label : name, configured: !!CHARGES_BROKERS[key] });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
const scIsCustom = key => loadCustomBrokers().some(b => scKeyOf(b.name) === key);

function scStandardSegment(def) {
  const seg = Object.assign({ label: def.label }, scClone(SC_STANDARD_SEGMENTS[def.key]));
  seg.exch.name = def.group === 'Commodity' ? 'MCX' : 'NSE';
  return seg;
}
function scNewCard(label, template) {
  const card = { label, segments: {}, mtf: null, oneTime: [], missingOneTime: true, gstRate: 0.18 };
  if (template && CHARGES_BROKERS[template]) {
    const src = scClone(CHARGES_BROKERS[template]);
    card.segments = src.segments;
    card.mtf = src.mtf || null;
    card.gstRate = src.gstRate ?? 0.18;
  } else {
    SC_SEGMENTS.forEach(s => { card.segments[s.key] = scStandardSegment(s); });
  }
  return card;
}

// Make an imported / hand-built card safe for the charge engine (every segment needs stt, stamp, exch, sebi…).
function scNormalizeCard(raw, label) {
  if (!raw || typeof raw !== 'object' || !raw.segments || typeof raw.segments !== 'object') return null;
  const c = reviveRateData(JSON.parse(JSON.stringify(raw)));
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const out = { label, segments: {}, mtf: null, oneTime: [], gstRate: c.gstRate === undefined ? 0.18 : num(c.gstRate) };
  SC_SEGMENTS.forEach(def => {
    const s = c.segments[def.key];
    if (!s || typeof s !== 'object') return;
    const b = s.brokerage || {};
    const seg = {
      label: def.label,
      brokerage: { mode: SC_BROKERAGE_MODES.some(m => m[0] === b.mode) ? b.mode : 'flat', flat: num(b.flat), pct: num(b.pct), cap: num(b.cap), floor: num(b.floor) },
      stt: { buy: num(s.stt && s.stt.buy), sell: num(s.stt && s.stt.sell) },
      stamp: { buy: num(s.stamp && s.stamp.buy) },
      exch: { pct: num(s.exch && s.exch.pct), name: String((s.exch && s.exch.name) || '') },
      sebi: { pct: num(s.sebi && s.sebi.pct) },
      ipft: { pct: num(s.ipft && s.ipft.pct) },
      clearing: { pct: num(s.clearing && s.clearing.pct) },
      gstOn: Array.isArray(s.gstOn) ? s.gstOn.filter(k => SC_GST_COMPONENTS.some(g => g[0] === k)) : []
    };
    if (!seg.exch.name) delete seg.exch.name;
    if (def.onPremium) seg.onPremium = true;
    if (s.dp) seg.dp = { male: num(s.dp.male), female: num(s.dp.female) };
    if (Array.isArray(s.exchAlt)) seg.exchAlt = s.exchAlt.filter(a => a && a.name).map(a => ({ name: String(a.name), pct: num(a.pct) }));
    out.segments[def.key] = seg;
  });
  if (!Object.keys(out.segments).length) return null;
  if (c.mtf && c.mtf.brokerage) {
    out.mtf = {
      brokerage: { mode: c.mtf.brokerage.mode || 'flat', flat: num(c.mtf.brokerage.flat), pct: num(c.mtf.brokerage.pct) },
      slabs: (Array.isArray(c.mtf.slabs) && c.mtf.slabs.length ? c.mtf.slabs : [{ max: Infinity, rate: 0 }])
        .map(sl => ({ max: (sl.max === null || sl.max === undefined || sl.max === '') ? Infinity : num(sl.max), rate: num(sl.rate) }))
    };
  }
  if (Array.isArray(c.oneTime)) out.oneTime = c.oneTime.filter(g => g && g.title).map(g => ({
    title: String(g.title),
    items: (Array.isArray(g.items) ? g.items : []).filter(it => Array.isArray(it)).map(it => [String(it[0] ?? ''), String(it[1] ?? '')])
  }));
  if (!out.oneTime.length) out.missingOneTime = true;
  if (c.profile && typeof c.profile === 'object') {
    out.profile = {};
    SC_PROFILE_FIELDS.forEach(([k, , type]) => { const v = c.profile[k]; if (v !== undefined && v !== '' && v !== null) out.profile[k] = type === 'number' ? num(v) : String(v); });
  }
  if (c.source && typeof c.source === 'object') out.source = { file: String(c.source.file || ''), asOf: String(c.source.asOf || '') };
  return out;
}

// Register a brand-new broker: remembered, marked Real, offered in the Ledger, with its own rate card.
// Returns an error string, or null on success.
function scAddBroker(rawName, template, card) {
  const name = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (!name) return 'Enter the broker\'s name.';
  if (name.length > 40) return 'Keep the name under 40 characters.';
  const key = scKeyOf(name);
  if (!key) return 'Use at least one letter or number in the name.';
  const known = scKnownBrokers();
  if (known.has(key)) {
    const real = calBrokerTypeOf({ broker: known.get(key) }) === 'real';
    return real ? `“${known.get(key)}” is already in the list — pick it above.`
                : `“${known.get(key)}” already exists as a Paper account. Switch it to Real Broker under “Broker & account type” and it will appear here.`;
  }
  const list = loadCustomBrokers(); list.push({ key, name }); saveCustomBrokers(list);
  const types = loadBrokerAccountTypes(); types[name.toLowerCase()] = 'real'; saveBrokerAccountTypes(types);
  if (!LEDGER_BROKERS.some(b => b.toLowerCase() === name.toLowerCase())) LEDGER_BROKERS.push(name);
  CHARGES_BROKERS[key] = card || scNewCard(name, template);
  saveChargeRates();
  scState.adding = false;
  chargesState.mode = 'edit'; scState.tab = 'Profile';
  scSelect(key);
  if (typeof renderBrokerSettings === 'function') renderBrokerSettings();
  if (typeof renderCharges === 'function') renderCharges();
  return null;
}
function scRemoveBroker(key) {
  const entry = loadCustomBrokers().find(b => scKeyOf(b.name) === key);
  if (entry) {
    saveCustomBrokers(loadCustomBrokers().filter(b => scKeyOf(b.name) !== key));
    const types = loadBrokerAccountTypes(); delete types[entry.name.toLowerCase()]; saveBrokerAccountTypes(types);
    const i = LEDGER_BROKERS.findIndex(b => b.toLowerCase() === entry.name.toLowerCase());
    if (i >= 0) LEDGER_BROKERS.splice(i, 1);
  }
  delete CHARGES_BROKERS[key];
  saveChargeRates();
  if (chargesState.broker === key) chargesState.broker = Object.keys(CHARGES_BROKERS)[0];
  scState.draft = null; scState.broker = null; scState.dirty = false;
  if (typeof renderBrokerSettings === 'function') renderBrokerSettings();
  if (typeof renderCharges === 'function') renderCharges();
}
// Called from the calculators' "Edit … rates" buttons: switch the page to Edit mode on the matching tab
function openRatesInSettings(tab) {
  const tabs = { equity: 'Equity', fno: 'F&O', currency: 'Currency', commodity: 'Commodity', mtf: 'MTF', common: 'Tax', onetime: 'One-time' };
  const key = chargesState.broker;
  if (scState.dirty && scState.broker !== key && !confirm('Discard unsaved changes to ' + (scState.draft ? scState.draft.label : 'the broker being edited') + '?')) return;
  scState.tab = tabs[tab] || 'Equity';
  chargesState.mode = 'edit';
  scState.adding = false;
  if (scState.broker !== key || !scState.draft) scSelect(key);
  if (typeof renderCharges === 'function') renderCharges();
}

function scSelect(key) {
  scState.broker = key;
  if (CHARGES_BROKERS[key]) chargesState.broker = key;
  scState.draft = CHARGES_BROKERS[key] ? scClone(CHARGES_BROKERS[key]) : null;
  scState.dirty = false;
  scState.previewSeg = null;
}


/* ---------------- view mode: what to show ---------------- */
const SC_VIEW_ITEMS = [
  ['profile',   'Broker profile (plan, website, AMC, fees)'],
  ['brokerage', 'Brokerage per segment'],
  ['stt',       'STT / CTT'],
  ['stamp',     'Stamp duty'],
  ['exch',      'Exchange transaction charges'],
  ['sebi',      'SEBI charges'],
  ['ipft',      'IPFT'],
  ['clearing',  'Clearing'],
  ['dp',        'DP charges'],
  ['gst',       'GST'],
  ['mtf',       'MTF interest & brokerage'],
  ['onetime',   'One-time & other charges'],
  ['source',    'Source & last verified']
];
const SC_VIEW_DEFAULT = ['profile', 'brokerage', 'stt', 'stamp', 'exch', 'gst', 'mtf', 'source'];
function scLoadViewItems() {
  try {
    const v = JSON.parse(localStorage.getItem(SC_VIEW_ITEMS_KEY));
    if (Array.isArray(v)) return v.filter(k => SC_VIEW_ITEMS.some(i => i[0] === k));
  } catch (e) {}
  return SC_VIEW_DEFAULT.slice();
}
function scSaveViewItems(list) { try { localStorage.setItem(SC_VIEW_ITEMS_KEY, JSON.stringify(list)); } catch (e) {} }

const SC_PROFILE_FIELDS = [
  ['plan',        'Plan / account name',        'text',   'e.g. Zero Delivery plan'],
  ['website',     'Website / pricing page',     'text',   'e.g. https://broker.com/pricing'],
  ['effective',   'Rates effective from',       'text',   'e.g. 1 Oct 2026'],
  ['amc',         'Annual maintenance (AMC) ₹ / yr', 'number', ''],
  ['openingFee',  'Account opening fee ₹',      'number', ''],
  ['callTrade',   'Call & trade fee ₹ / order', 'number', ''],
  ['platformFee', 'Platform / data fee ₹ / month', 'number', ''],
  ['pledgeFee',   'Pledge / unpledge fee ₹',    'number', ''],
  ['autoSquare',  'Auto square-off fee ₹ + GST', 'number', ''],
  ['notes',       'Notes',                      'text',   'Anything else worth remembering']
];
function scPctText(f) { return scPct(f) + '%'; }
function scBrokerageText(b) {
  if (!b) return '—';
  const m = b.mode || 'flat';
  if (m === 'flat') return b.flat ? `₹${b.flat} / order` : 'Free';
  if (m === 'pctOfOrder') return `${scPctText(b.pct)} of order value`;
  if (m === 'cappedFlat') return `Lower of ₹${b.flat} / ${scPctText(b.cap)} of leg`;
  return `Lower of ₹${b.flat} / ${scPctText(b.pct)} of leg${b.floor ? ` (min ₹${b.floor})` : ''}`;
}

/* ---------------- rendering ---------------- */
function renderSettingsCharges() {
  const host = document.getElementById('chargesScHost');
  if (!host) return;
  const brokers = scRealBrokers();
  if (!scState.dirty && !scState.adding && chargesState.broker !== scState.broker && brokers.some(b => b.key === chargesState.broker)) scSelect(chargesState.broker);
  if (brokers.length && (!scState.broker || !brokers.some(b => b.key === scState.broker))) scSelect(brokers[0].key);
  else if (brokers.length && scState.draft === null && CHARGES_BROKERS[scState.broker]) scSelect(scState.broker);

  const pills = brokers.map(b =>
    `<button type="button" class="sc-pill${b.key === scState.broker && !scState.adding ? ' active' : ''}" data-sc-broker="${scEsc(b.key)}">
      <i class="sc-dot ${CHARGES_BROKERS[b.key] ? 'ok' : 'todo'}"></i>${scEsc(b.name)}</button>`).join('');
  const current = brokers.find(b => b.key === scState.broker);
  const body = (scState.adding && chargesState.mode === 'edit') ? scAddFormHTML()
    : !current ? `<div class="broker-empty"><strong>No real brokers yet</strong><span>Add one with “+ Add broker”, or mark an existing broker as “Real Broker” in the section above.</span></div>`
    : (scState.draft ? (chargesState.mode === 'view' ? scViewHTML(current) : scEditorHTML(current)) : scSetupHTML(current));

  host.innerHTML = `
    <div class="sc-pills">${pills}${chargesState.mode === 'edit' ? `<button type="button" class="sc-pill sc-pill-add${scState.adding ? ' active' : ''}" id="scAddToggle">+ Add broker</button>` : ''}</div>
    <div class="sc-legend"><span><i class="sc-dot ok"></i> Rate card set up</span><span><i class="sc-dot todo"></i> Not set up yet</span></div>
    <input type="file" id="scImportFile" accept=".json,application/json" hidden>
    <div id="scBody">${body}</div>`;
  scWire(host, current);
}

function scTemplateOptions() {
  return `<option value="">Standard template (all segments)</option>` +
    Object.keys(CHARGES_BROKERS).map(k => `<option value="${scEsc(k)}">Copy of ${scEsc(CHARGES_BROKERS[k].label)}</option>`).join('');
}
function scAddFormHTML() {
  return `<div class="sc-setup sc-add">
    <h3>Add a broker</h3>
    <p>Type the broker's name exactly as you use it in the Trade Log and Ledger (for example <i>Zerodha</i>, <i>Upstox</i>, <i>Angel One</i>). It is marked as a Real Broker, offered in the Ledger's broker list, and gets its own rate card that you can then fill in.</p>
    <div class="sc-setup-row">
      <input type="text" id="scNewName" placeholder="Broker name" maxlength="40" autocomplete="off">
      <select id="scNewTemplate">${scTemplateOptions()}</select>
      <button type="button" class="btn primary" id="scNewCreate">Add broker</button>
      <button type="button" class="btn ghost" id="scNewFromFile">Add from rate-card file…</button>
      <button type="button" class="btn ghost" id="scNewCancel">Cancel</button>
    </div>
    <div class="sc-add-err" id="scNewErr" role="alert"></div>
  </div>`;
}

function scSetupHTML(b) {
  return `<div class="sc-setup">
    <h3>${scEsc(b.name)} has no brokerage &amp; charges card yet</h3>
    <p>Pick a starting point, then enter ${scEsc(b.name)}'s own brokerage from their rate sheet. Statutory charges (STT, stamp duty, exchange, SEBI, IPFT) start at standard NSE rates — please check them against your contract notes.</p>
    <div class="sc-setup-row">
      <select id="scTemplate">${scTemplateOptions()}</select>
      <button type="button" class="btn primary" id="scCreate">Create rate card</button>
      <button type="button" class="btn ghost" id="scImportBtn">Import rate-card file…</button>
      ${scIsCustom(b.key) ? '<button type="button" class="btn ghost" id="scRemoveBroker">Remove broker</button>' : ''}
    </div>
  </div>`;
}

function scInput(path, label, value, opts = {}) {
  const attrs = `data-sc-path="${path}"${opts.pct ? ' data-sc-pct="1"' : ''}`;
  return `<label>${label}<input type="number" step="any" min="0" ${attrs} value="${value}" ${opts.ph ? `placeholder="${opts.ph}"` : ''}></label>`;
}

function scText(path, label, value, ph) {
  return `<label>${label}<input type="text" data-sc-path="${path}" value="${scEsc(value ?? '')}" ${ph ? `placeholder="${scEsc(ph)}"` : ''}></label>`;
}

function scSegmentHTML(seg) {
  const d = scState.draft;
  const s = d.segments[seg.key];
  const on = !!s;
  if (!on) {
    return `<div class="sc-seg is-off"><div class="sc-seg-head"><h4>${seg.label}</h4>
      <button type="button" class="btn ghost sc-seg-toggle" data-sc-add="${seg.key}">+ Offer this segment</button></div></div>`;
  }
  const p = `segments.${seg.key}`;
  const b = s.brokerage || { mode: 'flat', flat: 0 };
  const mode = b.mode || 'flat';
  const fields = [];
  if (mode === 'flat' || mode === 'minFlatPct' || mode === 'cappedFlat') fields.push(scInput(`${p}.brokerage.flat`, 'Flat ₹ / order', b.flat ?? 0));
  if (mode === 'minFlatPct' || mode === 'pctOfOrder') fields.push(scInput(`${p}.brokerage.pct`, 'Brokerage %', scPct(b.pct), { pct: 1 }));
  if (mode === 'cappedFlat') fields.push(scInput(`${p}.brokerage.cap`, 'Cap % of leg', scPct(b.cap), { pct: 1 }));
  if (mode === 'minFlatPct') fields.push(scInput(`${p}.brokerage.floor`, 'Min ₹ / leg', b.floor ?? 0));
  const gst = s.gstOn || [];
  const gstBoxes = SC_GST_COMPONENTS.filter(([k]) => k !== 'dp' || s.dp || seg.key === 'equityDelivery').map(([k, l]) =>
    `<label class="sc-check"><input type="checkbox" data-sc-gst="${seg.key}" value="${k}" ${gst.includes(k) ? 'checked' : ''}>${l}</label>`).join('');
  const dp = seg.key === 'equityDelivery' ? `<div class="sc-sub">DP charge (per sell scrip)</div><div class="sc-grid">
      ${scInput(`${p}.dp.male`, 'DP ₹ (male)', s.dp ? s.dp.male : 0)}${scInput(`${p}.dp.female`, 'DP ₹ (female)', s.dp ? s.dp.female : 0)}</div>` : '';
  return `<div class="sc-seg">
    <div class="sc-seg-head"><h4>${seg.label}${seg.onPremium ? '<span class="sc-chip">on premium</span>' : ''}</h4>
      <button type="button" class="btn ghost sc-seg-toggle" data-sc-remove="${seg.key}" title="Broker doesn't offer this segment">Remove</button></div>
    <div class="sc-sub">Brokerage</div>
    <div class="sc-grid">
      <label class="sc-wide">Mode<select data-sc-path="${p}.brokerage.mode">${SC_BROKERAGE_MODES.map(([v, l]) => `<option value="${v}" ${mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${fields.join('')}
    </div>
    <div class="sc-sub">Statutory &amp; exchange (%)</div>
    <div class="sc-grid">
      ${scInput(`${p}.stt.buy`, 'STT/CTT buy', scPct(s.stt && s.stt.buy), { pct: 1 })}
      ${scInput(`${p}.stt.sell`, 'STT/CTT sell', scPct(s.stt && s.stt.sell), { pct: 1 })}
      ${scInput(`${p}.stamp.buy`, 'Stamp duty buy', scPct(s.stamp && s.stamp.buy), { pct: 1 })}
      ${scInput(`${p}.exch.pct`, 'Exchange txn', scPct(s.exch && s.exch.pct), { pct: 1 })}
      ${scInput(`${p}.sebi.pct`, 'SEBI', scPct(s.sebi && s.sebi.pct), { pct: 1 })}
      ${scInput(`${p}.ipft.pct`, 'IPFT', scPct(s.ipft && s.ipft.pct), { pct: 1 })}
      ${scInput(`${p}.clearing.pct`, 'Clearing', scPct(s.clearing && s.clearing.pct), { pct: 1 })}
    </div>
    <div class="sc-sub">Exchange rates</div>
    <div class="sc-grid">${scText(`${p}.exch.name`, 'Rate above is for', s.exch && s.exch.name, 'e.g. NSE')}</div>
    ${(s.exchAlt || []).map((a, i) => `<div class="sc-alt">
      <label>Other exchange / group<input type="text" data-sc-alt="${seg.key}.${i}.name" value="${scEsc(a.name)}" placeholder="e.g. BSE"></label>
      <label>Exchange txn %<input type="number" step="any" min="0" data-sc-alt="${seg.key}.${i}.pct" value="${scPct(a.pct)}"></label>
      <button type="button" class="btn ghost" data-sc-del-alt="${seg.key}.${i}" aria-label="Remove exchange">×</button></div>`).join('')}
    <button type="button" class="btn ghost sc-add-alt" data-sc-add-alt="${seg.key}">+ Add another exchange</button>
    ${dp}
    <div class="sc-sub">GST applies to</div>
    <div class="sc-checks">${gstBoxes}</div>
  </div>`;
}

function scMtfHTML() {
  const m = scState.draft.mtf;
  if (!m) return `<div class="sc-seg is-off"><div class="sc-seg-head"><h4>MTF (margin trading facility)</h4>
    <button type="button" class="btn ghost sc-seg-toggle" id="scAddMtf">+ Offer MTF</button></div></div>`;
  const slabs = (m.slabs || []).map((sl, i) => `<div class="sc-slab">
      <label>Up to ₹ funded<input type="number" step="any" min="0" data-sc-path="mtf.slabs.${i}.max" value="${Number.isFinite(sl.max) ? sl.max : ''}" placeholder="No limit"></label>
      <label>Interest % p.a.<input type="number" step="any" min="0" data-sc-path="mtf.slabs.${i}.rate" data-sc-pct="1" value="${scPct(sl.rate)}"></label>
      <button type="button" class="btn ghost" data-sc-del-slab="${i}" aria-label="Remove slab">×</button></div>`).join('');
  const b = m.brokerage || { mode: 'flat', flat: 0 };
  return `<div class="sc-seg">
    <div class="sc-seg-head"><h4>MTF (margin trading facility)</h4><button type="button" class="btn ghost sc-seg-toggle" id="scRemoveMtf">Remove</button></div>
    <div class="sc-sub">MTF brokerage</div>
    <div class="sc-grid">
      <label class="sc-wide">Mode<select data-sc-path="mtf.brokerage.mode">${SC_BROKERAGE_MODES.filter(([v]) => v !== 'cappedFlat').map(([v, l]) => `<option value="${v}" ${b.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${(b.mode === 'flat' || b.mode === 'minFlatPct') ? scInput('mtf.brokerage.flat', 'Flat ₹ / order', b.flat ?? 0) : ''}
      ${(b.mode === 'minFlatPct' || b.mode === 'pctOfOrder') ? scInput('mtf.brokerage.pct', 'Brokerage %', scPct(b.pct), { pct: 1 }) : ''}
    </div>
    <div class="sc-sub">Interest slabs</div>
    <div class="sc-slabs">${slabs}</div>
    <button type="button" class="btn ghost" id="scAddSlab">+ Add slab</button>
  </div>`;
}

function scOneTimeHTML() {
  const groups = scState.draft.oneTime || [];
  return `<div class="sc-seg">
    <div class="sc-seg-head"><h4>One-time &amp; other charges</h4><button type="button" class="btn ghost sc-seg-toggle" id="scAddGroup">+ Add group</button></div>
    <p class="sc-hint">Account opening, DP/pledge fees, penalties and anything else from the broker's tariff sheet. Shown on Charges &amp; Calculators → One-time.</p>
    ${groups.map((g, gi) => `<div class="sc-group">
      <div class="sc-group-head"><input type="text" class="sc-group-title" data-sc-group-title="${gi}" value="${scEsc(g.title)}" placeholder="Group title">
        <button type="button" class="btn ghost" data-sc-del-group="${gi}" aria-label="Delete group">Delete group</button></div>
      ${(g.items || []).map((it, ii) => `<div class="sc-item">
        <input type="text" data-sc-item="${gi}.${ii}.0" value="${scEsc(it[0])}" placeholder="Charge name">
        <input type="text" data-sc-item="${gi}.${ii}.1" value="${scEsc(it[1])}" placeholder="Amount, e.g. ₹20 + GST">
        <button type="button" class="btn ghost" data-sc-del-item="${gi}.${ii}" aria-label="Remove row">×</button></div>`).join('')}
      <button type="button" class="btn ghost" data-sc-add-item="${gi}">+ Add charge</button>
    </div>`).join('') || '<p class="sc-hint">Nothing added yet.</p>'}
  </div>`;
}

function scPreviewHTML() {
  const d = scState.draft;
  const segs = SC_SEGMENTS.filter(s => d.segments[s.key]);
  if (!segs.length) return '';
  if (!segs.some(s => s.key === scState.previewSeg)) scState.previewSeg = segs[0].key;
  return `<div class="sc-preview">
    <div class="sc-preview-title">Try these rates</div>
    <div class="sc-preview-row">
      <label>Segment<select id="scPrevSeg">${segs.map(s => `<option value="${s.key}" ${s.key === scState.previewSeg ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
      <label>Buy value ₹<input type="number" id="scPrevBuy" min="0" value="${scState.previewBuy}"></label>
      <label>Sell value ₹<input type="number" id="scPrevSell" min="0" value="${scState.previewSell}"></label>
    </div>
    <div class="sc-preview-out" id="scPrevOut"></div>
  </div>`;
}


function scViewHTML(b) {
  const d = scState.draft;
  const sel = scLoadViewItems();
  const has = k => sel.includes(k);
  const segs = SC_SEGMENTS.filter(x => d.segments[x.key]);
  const profile = d.profile || {};
  const blocks = [];

  if (has('profile')) {
    const money = v => (v || v === 0) && v !== '' ? '₹' + v : '';
    const rows = [['Plan', profile.plan], ['Website', profile.website], ['Effective from', profile.effective],
      ['AMC / yr', money(profile.amc)], ['Account opening', money(profile.openingFee)], ['Call & trade', money(profile.callTrade)],
      ['Platform fee / mo', money(profile.platformFee)], ['Pledge fee', money(profile.pledgeFee)], ['Auto square-off', money(profile.autoSquare)],
      ['Notes', profile.notes]].filter(r => r[1] !== undefined && r[1] !== '' && r[1] !== null);
    blocks.push(`<div class="sc-vcard"><h4>Broker profile</h4>${rows.length
      ? `<dl class="sc-vlist">${rows.map(([l, v]) => `<div><dt>${l}</dt><dd>${scEsc(v)}</dd></div>`).join('')}</dl>`
      : '<p class="sc-hint">No profile details yet — add them in Edit mode.</p>'}</div>`);
  }

  // one table: rows = segments, columns = the picked charge types
  const cols = [
    ['brokerage', 'Brokerage',  s => scBrokerageText(s.brokerage)],
    ['stt',       'STT / CTT',  s => { const x = s.stt || {}; const p = []; if (x.buy) p.push('buy ' + scPctText(x.buy)); if (x.sell) p.push('sell ' + scPctText(x.sell)); return p.join(' · ') || '—'; }],
    ['stamp',     'Stamp duty', s => (s.stamp && s.stamp.buy) ? 'buy ' + scPctText(s.stamp.buy) : '—'],
    ['exch',      'Exchange',   s => { let t = scPctText(s.exch && s.exch.pct) + (s.exch && s.exch.name ? ' (' + s.exch.name + ')' : ''); (s.exchAlt || []).forEach(a => t += ` · ${a.name} ${scPctText(a.pct)}`); return t; }],
    ['sebi',      'SEBI',       s => scPctText(s.sebi && s.sebi.pct)],
    ['ipft',      'IPFT',       s => scPctText(s.ipft && s.ipft.pct)],
    ['clearing',  'Clearing',   s => scPctText(s.clearing && s.clearing.pct)],
    ['dp',        'DP / sell scrip', s => s.dp ? `₹${s.dp.male} (male) · ₹${s.dp.female} (female)` : '—']
  ].filter(c => has(c[0]));
  if (cols.length) {
    blocks.push(`<div class="sc-vcard sc-vwide"><h4>Rates by segment</h4>
      ${segs.length ? `<div class="sc-vscroll"><table class="sc-vtable"><thead><tr><th>Segment</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
      <tbody>${segs.map(x => `<tr><th>${x.label}${x.onPremium ? ' <span class="sc-chip">on premium</span>' : ''}</th>${cols.map(c => `<td>${scEsc(c[2](d.segments[x.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<p class="sc-hint">No segments offered yet — add them in Edit mode.</p>'}</div>`);
  }
  if (has('gst')) {
    const lab = Object.fromEntries(SC_GST_COMPONENTS);
    blocks.push(`<div class="sc-vcard"><h4>GST — ${scPctText(d.gstRate ?? 0.18)}</h4>
      ${segs.length ? `<dl class="sc-vlist">${segs.map(x => `<div><dt>${x.label}</dt><dd>${(d.segments[x.key].gstOn || []).map(k => lab[k]).join(', ') || 'none'}</dd></div>`).join('')}</dl>` : ''}</div>`);
  }
  if (has('mtf')) {
    const m = d.mtf;
    blocks.push(`<div class="sc-vcard"><h4>MTF</h4>${m ? `<dl class="sc-vlist">
      <div><dt>Brokerage</dt><dd>${scEsc(scBrokerageText(m.brokerage))}</dd></div>
      ${(m.slabs || []).map((sl, i, a) => `<div><dt>${i ? 'Up to ₹' + (Number.isFinite(sl.max) ? sl.max.toLocaleString(numLocale()) : 'no limit') : (Number.isFinite(sl.max) ? 'Up to ₹' + sl.max.toLocaleString(numLocale()) : 'All amounts')}</dt><dd>${scPctText(sl.rate)} p.a.</dd></div>`).join('')}</dl>`
      : '<p class="sc-hint">This broker does not offer MTF.</p>'}</div>`);
  }
  if (has('onetime')) {
    const g = d.oneTime || [];
    // same look as the original "One-time & other charges" page: one bordered card per group, balanced in columns
    blocks.push(`<div class="sc-vwide sc-onetime">
      ${d.missingOneTime && !g.length ? '<p class="onetime-note">No account, DP or penalty charges are on file for this broker. Add them in <b>Edit mode → One-time</b>.</p>' : ''}
      <div class="sc-onetime-cols">${g.map(grp => `<div class="onetime-group">
        <h3>${scEsc(grp.title)}</h3>
        ${(grp.items || []).map(it => `<div class="detail-row"><span>${scEsc(it[0])}</span><span>${scEsc(it[1])}</span></div>`).join('')}
      </div>`).join('')}</div>
      ${!g.length && !d.missingOneTime ? '<p class="sc-hint">Nothing added yet.</p>' : ''}
    </div>`);
  }
  if (has('source')) {
    const src = d.source || {};
    blocks.push(`<div class="sc-vcard"><h4>Source</h4>${(src.file || src.asOf)
      ? `<dl class="sc-vlist"><div><dt>Source</dt><dd>${scEsc(src.file || '—')}</dd></div><div><dt>Last verified</dt><dd>${scEsc(src.asOf || '—')}</dd></div></dl>`
      : '<p class="sc-hint">No source recorded.</p>'}</div>`);
  }

  const picker = scState.pickView ? `<div class="sc-picker"><div class="sc-sub">Show in view mode</div>
    <div class="sc-checks">${SC_VIEW_ITEMS.map(([k, l]) => `<label class="sc-check"><input type="checkbox" data-sc-viewitem value="${k}" ${has(k) ? 'checked' : ''}>${l}</label>`).join('')}</div>
    <div class="sc-picker-actions"><button type="button" class="btn ghost" id="scViewAll">Select all</button><button type="button" class="btn ghost" id="scViewDefault">Reset to default</button><button type="button" class="btn primary" id="scViewDone">Done</button></div></div>` : '';

  return `<div class="sc-editor sc-viewer">
    <div class="sc-editor-head">
      <div class="sc-head-row"><div><h3>${scEsc(d.label)} <span class="sc-status">View</span></h3><p>Read-only summary of the selected items.</p></div></div>
    </div>
    <div class="sc-view-tools"><button type="button" class="btn ghost" id="scPickView">${scState.pickView ? 'Hide options' : 'Choose what to show'}</button></div>
    ${picker}
    <div class="sc-vgrid">${blocks.join('') || '<p class="sc-hint" style="padding:14px">Nothing selected — use “Choose what to show”.</p>'}</div>
  </div>`;
}
function scProfileHTML() {
  const pr = (scState.draft.profile) || {};
  return `<div class="sc-seg"><div class="sc-seg-head"><h4>Broker profile</h4></div>
    <div class="sc-grid sc-grid-2">${SC_PROFILE_FIELDS.map(([k, l, type, ph]) => type === 'number'
      ? `<label>${l}<input type="number" step="any" min="0" data-sc-path="profile.${k}" value="${pr[k] ?? ''}"></label>`
      : scText('profile.' + k, l, pr[k], ph)).join('')}</div>
    <p class="sc-hint">Plan, fees and notes from the broker's tariff sheet. Shown in View mode; they do not change the charge calculations.</p></div>`;
}

function scEditorHTML(b) {
  const d = scState.draft;
  const tabs = ['Profile', 'Equity', 'F&O', 'Currency', 'Commodity', 'MTF', 'One-time', 'Tax'];
  if (!tabs.includes(scState.tab)) scState.tab = 'Equity';
  const isBuiltIn = !!DEFAULT_CHARGE_BROKERS[b.key];
  const isCustom = scIsCustom(b.key);
  let pane = '';
  if (scState.tab === 'Profile') pane = scProfileHTML();
  else if (['Equity', 'F&O', 'Currency', 'Commodity'].includes(scState.tab))
    pane = SC_SEGMENTS.filter(s => s.group === scState.tab).map(scSegmentHTML).join('');
  else if (scState.tab === 'MTF') pane = scMtfHTML();
  else if (scState.tab === 'One-time') pane = scOneTimeHTML();
  else pane = `<div class="sc-seg"><div class="sc-seg-head"><h4>Tax</h4></div>
      <div class="sc-grid">${scInput('gstRate', 'GST %', scPct(d.gstRate ?? 0.18), { pct: 1 })}</div>
      <p class="sc-hint">GST is charged on the components ticked under each segment (usually brokerage, exchange, SEBI and IPFT charges — not STT or stamp duty).</p></div>
      <div class="sc-seg"><div class="sc-seg-head"><h4>Where these rates came from</h4></div>
      <div class="sc-grid sc-grid-2">${scText('source.file', 'Source (file, URL or page)', d.source && d.source.file, 'e.g. broker pricing page')}${scText('source.asOf', 'Last verified', d.source && d.source.asOf, 'e.g. 3 Oct 2026')}</div>
      <p class="sc-hint">Shown under the broker's One-time charges so you know how fresh the rates are. Brokers change tariffs — re-check them now and then.</p></div>`;
  return `<div class="sc-editor">
    <div class="sc-editor-head">
      <div class="sc-head-row"><div><h3>${scEsc(d.label)} <span class="sc-status ${scState.dirty ? 'dirty' : ''}" id="scStatus">${scState.dirty ? 'Unsaved changes' : 'Saved'}</span></h3>
        <p>Rates are stored in this browser and used by Charges &amp; Calculators.</p></div></div>
    </div>
    <div class="sc-tabs" role="tablist">${tabs.map(t => `<button type="button" class="sc-tab${t === scState.tab ? ' active' : ''}" data-sc-tab="${t}">${SC_TAB_LABEL[t] || t}</button>`).join('')}</div>
    <div class="sc-pane">${pane}</div>
    ${scPreviewHTML()}
    <div class="sc-foot">
      <button type="button" class="btn ghost" id="scReset">${isBuiltIn ? 'Reset to built-in rates' : isCustom ? 'Remove broker' : 'Delete rate card'}</button>
      <button type="button" class="btn ghost" id="scExport" title="Download this rate card as a JSON file">Export</button>
      <button type="button" class="btn ghost" id="scImportBtn" title="Load a rate card from a JSON file (review, then Save)">Import</button>
      <span class="sc-spacer"></span>
      <button type="button" class="btn ghost" id="scDiscard">Discard changes</button>
      <button type="button" class="btn primary" id="scSave">Save rates</button>
    </div>
  </div>`;
}

/* ---------------- behaviour ---------------- */
function scMarkDirty() {
  scState.dirty = true;
  const st = document.getElementById('scStatus');
  if (st) { st.textContent = 'Unsaved changes'; st.classList.add('dirty'); }
}
function scRerender() { renderSettingsCharges(); }

function scUpdatePreview() {
  const out = document.getElementById('scPrevOut');
  if (!out || !scState.draft) return;
  // computeCharges reads CHARGES_BROKERS, so run it against a temporary swap of the draft
  const key = scState.broker, prev = CHARGES_BROKERS[key];
  CHARGES_BROKERS[key] = scState.draft;
  let r = null;
  try { r = computeCharges(key, scState.previewSeg, Number(scState.previewBuy) || 0, Number(scState.previewSell) || 0, {}); } catch (e) { r = null; }
  if (prev) CHARGES_BROKERS[key] = prev; else delete CHARGES_BROKERS[key];
  if (!r) { out.innerHTML = ''; return; }
  const rows = [['Brokerage', r.brokerage], ['STT / CTT', r.stt], ['Stamp duty', r.stamp], ['Exchange', r.exch], ['SEBI', r.sebi], ['IPFT', r.ipft], ['Clearing', r.clearing], ['DP', r.dp], ['GST', r.gst]]
    .filter(([, v]) => v > 0);
  out.innerHTML = rows.map(([l, v]) => `<div><span>${l}</span><b>${fmt2(v)}</b></div>`).join('') +
    `<div class="total"><span>Total charges</span><b>${fmt2(r.total)}</b></div>`;
}

// numeric inputs → numbers (percent inputs → fractions); text inputs → strings; never leave NaN/undefined behind
function scSetPath(root, path, el) {
  const parts = path.split('.');
  let obj = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (obj[parts[i]] === undefined || obj[parts[i]] === null) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  const last = parts[parts.length - 1], raw = el.value;
  if (el.type === 'text') { raw === '' ? delete obj[last] : (obj[last] = raw); return; }
  if (el.tagName === 'SELECT') { obj[last] = raw; return; }
  if (raw === '') { if (path.startsWith('profile.')) { delete obj[last]; return; } obj[last] = path.endsWith('.max') ? Infinity : 0; return; }
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  obj[last] = el.dataset.scPct === '1' ? scFrac(n) : n;
}

function scDownload(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// read a rate-card file; resolves { name, card } (card already normalised) or rejects with a message
function scReadCardFile(file, fallbackName) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject('Could not read that file.');
    fr.onload = () => {
      let data;
      try { data = JSON.parse(String(fr.result)); } catch (e) { return reject('That file is not valid JSON.'); }
      const src = data && data.card ? data.card : data;
      const name = fallbackName || (data && data.broker) || (src && src.label) || '';
      const card = scNormalizeCard(src, name);
      card ? resolve({ name, card }) : reject('No segment rates found — is this a rate card exported from this app?');
    };
    fr.readAsText(file);
  });
}

function scWire(host, current) {
  const on = (id, fn) => { const el = host.querySelector(id); if (el) el.addEventListener('click', fn); };
  const fileInput = host.querySelector('#scImportFile');
  let fileMode = null;   // what the file picker is for: 'draft' (into current broker) or 'new' (create a broker)

  host.querySelectorAll('[data-sc-broker]').forEach(btn => btn.addEventListener('click', () => {
    if (scState.dirty && !confirm('Discard unsaved changes to this broker?')) return;
    scState.adding = false;
    scSelect(btn.dataset.scBroker);
    scRerender();
  }));
  on('#scAddToggle', () => {
    if (!scState.adding && scState.dirty && !confirm('Discard unsaved changes to this broker?')) return;
    scState.adding = !scState.adding;
    if (scState.adding) { scState.dirty = false; scState.draft = null; }
    else if (scState.broker) scSelect(scState.broker);
    scRerender();
    if (scState.adding) { const n = document.getElementById('scNewName'); if (n) n.focus(); }
  });

  // ---- add-a-broker form ----
  const nameEl = host.querySelector('#scNewName');
  if (nameEl) {
    const err = host.querySelector('#scNewErr');
    const submit = () => {
      const msg = scAddBroker(nameEl.value, host.querySelector('#scNewTemplate').value);
      if (msg) { err.textContent = msg; return; }
      showToast(`${scState.draft.label} added — now enter its brokerage`);
      scRerender();
    };
    nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    nameEl.addEventListener('input', () => { err.textContent = ''; });
    on('#scNewCreate', submit);
    on('#scNewCancel', () => { scState.adding = false; if (scState.broker) scSelect(scState.broker); scRerender(); });
    on('#scNewFromFile', () => { fileMode = 'new'; fileInput.value = ''; fileInput.click(); });
  }
  if (fileInput) fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    if (fileMode === 'new') {
      const typed = (host.querySelector('#scNewName') || {}).value || '';
      scReadCardFile(f, typed.trim()).then(({ name, card }) => {
        const clean = name.trim().replace(/\s+/g, ' ');
        card.label = clean;
        const msg = scAddBroker(clean, '', card);
        if (msg) { host.querySelector('#scNewErr').textContent = msg; return; }
        showToast(`${clean} added from file`);
        scRerender();
      }).catch(m => { const e = host.querySelector('#scNewErr'); if (e) e.textContent = m; });
    } else {
      scReadCardFile(f, current ? current.name : '').then(({ card }) => {
        card.label = current.name;
        scState.draft = card; scState.dirty = true;
        showToast('Rate card loaded — review it, then press Save rates');
        scRerender();
      }).catch(m => showToast(m));
    }
  });
  on('#scImportBtn', () => { fileMode = 'draft'; fileInput.value = ''; fileInput.click(); });

  // ---- set-up panel for a broker without a card ----
  if (current && !scState.draft && !scState.adding) {
    on('#scCreate', () => {
      CHARGES_BROKERS[current.key] = scNewCard(current.name, host.querySelector('#scTemplate').value);
      saveChargeRates();
      scSelect(current.key);
      if (typeof renderCharges === 'function') renderCharges();
      chargesState.mode = 'edit'; scState.tab = 'Profile';
      showToast(`${current.name} rate card created — now enter its brokerage`);
      scRerender();
    });
    on('#scRemoveBroker', () => {
      if (!confirm(`Remove ${current.name}? Any trades or ledger rows already recorded for it stay in your journal.`)) return;
      scRemoveBroker(current.key);
      scRerender();
    });
    return;
  }
  if (!scState.draft || scState.adding) return;

  // ---- view mode ----
  if (chargesState.mode === 'view') {
    on('#scPickView', () => { scState.pickView = !scState.pickView; scRerender(); });
    host.querySelectorAll('[data-sc-viewitem]').forEach(cb => cb.addEventListener('change', () => {
      const list = Array.from(host.querySelectorAll('[data-sc-viewitem]:checked')).map(x => x.value);
      scSaveViewItems(list); scRerender();
    }));
    on('#scViewAll', () => { scSaveViewItems(SC_VIEW_ITEMS.map(i => i[0])); scRerender(); });
    on('#scViewDefault', () => { scSaveViewItems(SC_VIEW_DEFAULT.slice()); scRerender(); });
    on('#scViewDone', () => { scState.pickView = false; scRerender(); });
    return;
  }
  const d = scState.draft;

  // value inputs → draft
  host.querySelectorAll('[data-sc-path]').forEach(el => {
    const handler = () => {
      scSetPath(d, el.dataset.scPath, el);
      scMarkDirty();
      if (el.tagName === 'SELECT') scRerender();   // brokerage mode changes which fields exist
      else scUpdatePreview();
    };
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', handler);
  });
  host.querySelectorAll('[data-sc-gst]').forEach(cb => cb.addEventListener('change', () => {
    const seg = d.segments[cb.dataset.scGst];
    const set = new Set(seg.gstOn || []);
    cb.checked ? set.add(cb.value) : set.delete(cb.value);
    seg.gstOn = Array.from(set);
    scMarkDirty(); scUpdatePreview();
  }));
  host.querySelectorAll('[data-sc-tab]').forEach(t => t.addEventListener('click', () => { scState.tab = t.dataset.scTab; scRerender(); }));

  // segments on/off
  host.querySelectorAll('[data-sc-add]').forEach(btn => btn.addEventListener('click', () => {
    const k = btn.dataset.scAdd;
    d.segments[k] = scStandardSegment(SC_SEGMENTS.find(s => s.key === k));
    scMarkDirty(); scRerender();
  }));
  host.querySelectorAll('[data-sc-remove]').forEach(btn => btn.addEventListener('click', () => {
    delete d.segments[btn.dataset.scRemove];
    scMarkDirty(); scRerender();
  }));

  // other-exchange rates
  host.querySelectorAll('[data-sc-alt]').forEach(el => el.addEventListener('input', () => {
    const [seg, i, field] = el.dataset.scAlt.split('.');
    const alt = d.segments[seg].exchAlt[Number(i)];
    if (field === 'name') alt.name = el.value; else alt.pct = scFrac(el.value);
    scMarkDirty();
  }));
  host.querySelectorAll('[data-sc-add-alt]').forEach(btn => btn.addEventListener('click', () => {
    const seg = d.segments[btn.dataset.scAddAlt];
    seg.exchAlt = seg.exchAlt || [];
    seg.exchAlt.push({ name: 'BSE', pct: (seg.exch && seg.exch.pct) || 0 });
    scMarkDirty(); scRerender();
  }));
  host.querySelectorAll('[data-sc-del-alt]').forEach(btn => btn.addEventListener('click', () => {
    const [seg, i] = btn.dataset.scDelAlt.split('.');
    d.segments[seg].exchAlt.splice(Number(i), 1);
    if (!d.segments[seg].exchAlt.length) delete d.segments[seg].exchAlt;
    scMarkDirty(); scRerender();
  }));

  // MTF
  on('#scAddMtf', () => { d.mtf = { brokerage: { mode: 'flat', flat: 0 }, slabs: [{ max: Infinity, rate: 0.15 }] }; scMarkDirty(); scRerender(); });
  on('#scRemoveMtf', () => { d.mtf = null; scMarkDirty(); scRerender(); });
  on('#scAddSlab', () => {
    const slabs = d.mtf.slabs;
    if (slabs.length && slabs[slabs.length - 1].max === Infinity) slabs[slabs.length - 1].max = 100000;
    slabs.push({ max: Infinity, rate: slabs.length ? slabs[slabs.length - 1].rate : 0.15 });
    scMarkDirty(); scRerender();
  });
  host.querySelectorAll('[data-sc-del-slab]').forEach(btn => btn.addEventListener('click', () => {
    d.mtf.slabs.splice(Number(btn.dataset.scDelSlab), 1);
    if (!d.mtf.slabs.length) d.mtf.slabs.push({ max: Infinity, rate: 0 });
    scMarkDirty(); scRerender();
  }));

  // one-time charges
  host.querySelectorAll('[data-sc-group-title]').forEach(el => el.addEventListener('input', () => { d.oneTime[Number(el.dataset.scGroupTitle)].title = el.value; scMarkDirty(); }));
  host.querySelectorAll('[data-sc-item]').forEach(el => el.addEventListener('input', () => {
    const [g, i, c] = el.dataset.scItem.split('.').map(Number);
    d.oneTime[g].items[i][c] = el.value; scMarkDirty();
  }));
  on('#scAddGroup', () => { d.oneTime = d.oneTime || []; d.oneTime.push({ title: 'New group', items: [['', '']] }); delete d.missingOneTime; scMarkDirty(); scRerender(); });
  host.querySelectorAll('[data-sc-del-group]').forEach(btn => btn.addEventListener('click', () => { d.oneTime.splice(Number(btn.dataset.scDelGroup), 1); scMarkDirty(); scRerender(); }));
  host.querySelectorAll('[data-sc-add-item]').forEach(btn => btn.addEventListener('click', () => { d.oneTime[Number(btn.dataset.scAddItem)].items.push(['', '']); scMarkDirty(); scRerender(); }));
  host.querySelectorAll('[data-sc-del-item]').forEach(btn => btn.addEventListener('click', () => {
    const [g, i] = btn.dataset.scDelItem.split('.').map(Number);
    d.oneTime[g].items.splice(i, 1); scMarkDirty(); scRerender();
  }));

  // preview
  const ps = host.querySelector('#scPrevSeg');
  if (ps) {
    ps.addEventListener('change', () => { scState.previewSeg = ps.value; scUpdatePreview(); });
    host.querySelector('#scPrevBuy').addEventListener('input', e => { scState.previewBuy = e.target.value; scUpdatePreview(); });
    host.querySelector('#scPrevSell').addEventListener('input', e => { scState.previewSell = e.target.value; scUpdatePreview(); });
    scUpdatePreview();
  }

  // save / discard / reset / export
  on('#scSave', () => {
    (d.oneTime || []).forEach(g => { g.items = (g.items || []).filter(it => String(it[0]).trim() || String(it[1]).trim()); });
    d.oneTime = (d.oneTime || []).filter(g => g.items.length || String(g.title).trim());
    if (d.source && !d.source.file && !d.source.asOf) delete d.source;
    CHARGES_BROKERS[scState.broker] = d;
    saveChargeRates();
    scSelect(scState.broker);
    if (typeof renderCharges === 'function') renderCharges();
    showToast(`${d.label} rates saved`);
    scRerender();
  });
  on('#scDiscard', () => { scSelect(scState.broker); scRerender(); });
  on('#scExport', () => {
    scDownload(`${scState.broker}-rate-card.json`, JSON.stringify({ format: 'tb-rate-card', version: 1, broker: d.label, card: cloneRateData(d) }, null, 2));
  });
  on('#scReset', () => {
    const key = scState.broker, builtIn = !!DEFAULT_CHARGE_BROKERS[key], custom = scIsCustom(key);
    const msg = builtIn ? `Reset ${d.label} to the built-in rates? Your edits will be lost.`
      : custom ? `Remove ${d.label}? Its rate card is deleted; trades or ledger rows already recorded for it stay in your journal.`
      : `Delete the ${d.label} rate card?`;
    if (!confirm(msg)) return;
    if (builtIn) {
      CHARGES_BROKERS[key] = reviveRateData(cloneRateData(DEFAULT_CHARGE_BROKERS))[key];
      saveChargeRates();
      scState.draft = null;
      if (typeof renderCharges === 'function') renderCharges();
    } else if (custom) {
      scRemoveBroker(key);
    } else {
      delete CHARGES_BROKERS[key];
      saveChargeRates();
      if (chargesState.broker === key) chargesState.broker = Object.keys(CHARGES_BROKERS)[0];
      scState.draft = null;
      if (typeof renderCharges === 'function') renderCharges();
    }
    scRerender();
  });
}

// keep this section in step with the Real/Paper dropdowns above it
document.addEventListener('change', e => {
  if (e.target && e.target.classList && e.target.classList.contains('broker-setting-type')) setTimeout(() => { if (typeof renderCharges === 'function') renderCharges(); }, 0);
});
