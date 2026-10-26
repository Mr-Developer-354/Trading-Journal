// ======================================================================
// utils.js — Small helpers used everywhere: formatting, escaping, toast.
// ======================================================================

const isBlank = v => v === null || v === undefined || v === '';

// ---- Text ----
function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Money (Indian number grouping) ----
// ₹1,235 style, no decimals
function fmtMoney(n) {
  if (isBlank(n) || isNaN(n)) return '—';
  return (n < 0 ? '-' : '') + '₹' + Math.abs(n).toLocaleString(numLocale(), { maximumFractionDigits: 0 });
}

// ₹1,234.56 style, always 2 decimals
function fmtMoneyPrecise(n) {
  if (isBlank(n) || isNaN(n)) return '—';
  return (n < 0 ? '-' : '') + '₹' + Math.abs(n).toLocaleString(numLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ₹ price for display: rounded to 2 decimals, e.g. 346.2 → ₹346.20, 83.2575 → ₹83.26.
// Display only — the stored value (and every calculation) keeps the full number.
// Prices follow the workbook's price format (#,##0.00##): at least 2 and at most 4 decimals, so a price such as
// 227.195 reads the same in the table as in Excel. The exact stored value is still shown in the tooltip.
function fmtPrice(n) {
  if (isBlank(n) || isNaN(n)) return '—';
  return (n < 0 ? '-' : '') + '₹' + Math.abs(n).toLocaleString(numLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });
}
// Exact stored value as text, used for hover tooltips on rounded prices
function exactValue(n) {
  return isBlank(n) || isNaN(n) ? '' : String(Number(n));
}

// ---- Dates (stored as ISO "YYYY-MM-DD", shown as "04-Dec-2023") ----
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseIsoDate(value) {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateDisplay(value) {
  if (isBlank(value)) return '—';
  const d = parseIsoDate(value);
  if (!d) return String(value);
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  switch (PREFS.dateFmt) {            // Settings → Display & formats → Date format
    case 'dmy-slash': return `${dd}/${mm}/${d.getFullYear()}`;
    case 'mdy-slash': return `${mm}/${dd}/${d.getFullYear()}`;
    case 'iso':       return `${d.getFullYear()}-${mm}-${dd}`;
    default:          return `${dd}-${MONTH_NAMES[d.getMonth()]}-${d.getFullYear()}`;
  }
}

function formatDayDisplay(value) {
  const d = parseIsoDate(value);
  return d ? DAY_NAMES[d.getDay()] : '—';
}

// ---- Ledger value helpers ----
function ledgerNum(v) {
  return isBlank(v) || isNaN(Number(v)) ? null : Number(v);
}

function ledgerDisplay(v) {
  if (isBlank(v)) return '—';
  if (typeof v === 'number') return v.toLocaleString(numLocale(), { maximumFractionDigits: 4 });
  return String(v);
}

function formatLedgerCurrency(v) {
  const sign = v < 0 ? '-₹' : '₹';
  return sign + Math.abs(Number(v) || 0).toLocaleString(numLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatLedgerCurrencyOrDash(v) {
  return isBlank(v) ? '—' : formatLedgerCurrency(Number(v));
}

// Table cells: show nothing (not a dash) when a value is empty
const blankDash = s => (s === '—' ? '' : s);

// CSS class for coloured numbers: ' pos', ' neg' or ''
function ledgerValueClass(v) {
  const n = ledgerNum(v);
  if (n === null || n === 0) return '';
  return n > 0 ? ' pos' : ' neg';
}

// ---- Trades ----
// Gross P/L and Gross P/L % are never stored: they are calculated from qty, entry and exit.
// qty is signed (negative = short), so Gross P/L = (exit - entry) * qty.
function tradeNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
// A trade's Gross P/L follows the workbook formula exactly:
// IF(EntryPrice<>"", (ExitPrice-EntryPrice)*Qty, -Qty*ExitPrice).
// Excel treats a blank price as zero, so an open position contributes
// -Qty*EntryPrice when EntryPrice exists, and -Qty*ExitPrice when it does not.
function pnlOf(t) {
  const qty = tradeNum(t?.Qty ?? t?.qty);
  const entry = tradeNum(t?.EntryPrice ?? t?.entry);
  const exit = tradeNum(t?.ExitPrice ?? t?.exit);
  if (qty === null) return 0;
  if (entry !== null) return ((exit ?? 0) - entry) * qty;
  if (exit !== null) return -qty * exit;
  return 0;
}
// Gross P/L as a fraction of the capital used (0.01 = 1%); null when it can't be calculated
// Stoploss risk/loss amount: -(Entry - Stoploss) * Qty.
// Returns null when quantity, entry, or stoploss is missing/invalid.
function lossesOf(t) {
  const qty = tradeNum(t.qty), entry = tradeNum(t.entry), sl = tradeNum(t.sl);
  if (qty === null || entry === null || sl === null) return null;
  return -(entry - sl) * qty;
}
// Trade duration is derived directly from entryTime and exitTime; it is never stored.
// Supports HH:MM and HH:MM:SS. If exit time is earlier than entry time, it is
// treated as crossing midnight.
function durationSecondsOf(t) {
  const parseTime = value => {
    const m = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]), sec = Number(m[3] || 0);
    if (h > 23 || min > 59 || sec > 59) return null;
    return h * 3600 + min * 60 + sec;
  };
  const start = parseTime(t.entryTime), end = parseTime(t.exitTime);
  if (start === null || end === null) return null;
  let diff = end - start;
  if (diff < 0) diff += 24 * 3600;
  return diff;
}
// ---------------------------------------------------------------------
// Delivery / overnight matching
//
// Intraday trades have EntryPrice + ExitPrice on the same row, so their
// holding period is 0 calendar days (EntryTime/ExitTime remains the
// intraday duration). Delivery/overnight trades are represented as two
// rows: an entry-only row followed later by an exit-only row.
//
// Exit rows are matched ONLY against entry rows from the same broker and
// the same instrument identity, with opposite signed quantity. Product is
// deliberately excluded because imported exit rows may be labelled
// Intraday even when they close a Delivery/overnight position. FIFO is
// used and partial quantities are supported.
// ---------------------------------------------------------------------
function tradeInstrumentKey(t) {
  const norm = v => String(v ?? '').trim().toUpperCase();
  return [
    norm(t?.broker), norm(t?.segment), norm(t?.symbol),
    norm(t?.expiry), norm(t?.strike), norm(t?.optType), norm(t?.type)
  ].join('\u001f');
}
function tradeDateMs(t) {
  const d = parseIsoDate(t?.date);
  return d ? d.getTime() : Number.POSITIVE_INFINITY;
}
function deliveryTradeMatches(list = trades) {
  const entries = new Map();
  const matches = new Map();
  const addQueue = (key, t) => {
    const qty = Number(t.qty) || 0;
    const sideKey = `${key}\u001f${Math.sign(qty)}`;
    if (!entries.has(sideKey)) entries.set(sideKey, []);
    entries.get(sideKey).push({ trade: t, remaining: Math.abs(qty) });
  };

  const ordered = [...(Array.isArray(list) ? list : [])]
    .filter(t => tradeNum(t?.qty) !== null && Math.abs(Number(t.qty)) > 0 && parseIsoDate(t?.date))
    .sort((a,b) => tradeDateMs(a) - tradeDateMs(b) || Number(a.id || a.Id || 0) - Number(b.id || b.Id || 0));

  for (const t of ordered) {
    const entry = tradeNum(t?.entry), exit = tradeNum(t?.exit), qty = tradeNum(t?.qty);
    // Same-row entry + exit is a complete intraday trade; it does not
    // participate in delivery/overnight matching.
    if (entry !== null && exit !== null) continue;
    if (entry !== null && exit === null) {
      addQueue(tradeInstrumentKey(t), t);
      continue;
    }
    if (exit === null || qty === null) continue;

    const key = `${tradeInstrumentKey(t)}\u001f${-Math.sign(qty)}`;
    const queue = entries.get(key) || [];
    let remaining = Math.abs(qty);
    const legs = [];
    while (remaining > 0 && queue.length) {
      const lot = queue[0];
      const used = Math.min(remaining, lot.remaining);
      const entryDate = parseIsoDate(lot.trade?.date);
      const exitDate = parseIsoDate(t?.date);
      const days = entryDate && exitDate
        ? Math.max(0, Math.round((exitDate.getTime() - entryDate.getTime()) / 86400000))
        : null;
      legs.push({ entry: lot.trade, qty: used, days });
      lot.remaining -= used;
      remaining -= used;
      if (lot.remaining <= 0) queue.shift();
    }
    if (legs.length) matches.set(String(t.id ?? t.Id), { legs, unmatchedQty: remaining });
  }
  return matches;
}
function deliveryMatchOf(t) {
  const id = String(t?.id ?? t?.Id ?? '');
  if (!id) return null;
  return deliveryTradeMatches(trades).get(id) || null;
}
function periodDaysOf(t) {
  const entry = tradeNum(t?.entry), exit = tradeNum(t?.exit);
  // Same-row intraday trade: period is the same calendar day.
  if (entry !== null && exit !== null) return 0;

  // Exit-only delivery/overnight row: use the matched entry lot(s).
  if (entry === null && exit !== null) {
    const match = deliveryMatchOf(t);
    if (!match || !match.legs.length) return null;
    const weighted = match.legs.reduce((sum, leg) => sum + (leg.days ?? 0) * leg.qty, 0);
    const qty = match.legs.reduce((sum, leg) => sum + leg.qty, 0);
    return qty ? weighted / qty : null;
  }

  // Entry-only delivery/overnight row remains open until a later exit-only
  // row is matched. It must never be calculated as Date -> today.
  return null;
}
function periodLabelForExit(t) {
  const entry = tradeNum(t?.entry), exit = tradeNum(t?.exit);
  // Intraday rows intentionally show a blank Period cell.
  if (entry !== null && exit !== null) return '';
  if (entry === null && exit !== null) {
    const match = deliveryMatchOf(t);
    if (!match || !match.legs.length) return 'Unmatched';
    // One number per matched entry lot (FIFO order), e.g. "5,4" - instead of a weighted average such as 5.5.
    const perLeg = [];
    match.legs.forEach(leg => { if (leg.days !== null && leg.days !== undefined && !perLeg.includes(leg.days)) perLeg.push(leg.days); });
    if (perLeg.length) return perLeg.join(',');
    const days = periodDaysOf(t);
    if (days === null) return 'Unmatched';
    return Number.isInteger(days) ? String(days) : days.toFixed(1);
  }
  return 'Open';
}
function periodOf(t) {
  const entry = tradeNum(t?.entry), exit = tradeNum(t?.exit);
  // Intraday: no period value.
  if (entry !== null && exit !== null) return '';
  if (entry === null && exit !== null) return periodLabelForExit(t);
  const days = periodDaysOf(t);
  return days === null ? (entry !== null && exit === null ? 'Open' : '') : `${Number.isInteger(days) ? days : days.toFixed(1)}`;
}
function durationOf(t) {
  const seconds = durationSecondsOf(t);
  if (seconds === null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
// Unified Trade Log display: intraday trades show elapsed duration;
// delivery/overnight trades show their holding period.
function durationPeriodOf(t) {
  const entry = tradeNum(t?.entry), exit = tradeNum(t?.exit);
  if (entry !== null && exit !== null) return durationOf(t);
  return periodOf(t);
}

function durationPeriodSortValue(t) {
  const entry = tradeNum(t?.entry), exit = tradeNum(t?.exit);
  if (entry !== null && exit !== null) {
    const seconds = durationSecondsOf(t);
    return seconds === null ? null : seconds;
  }
  return periodDaysOf(t);
}
function pnlPctOf(t) {
  const qty = tradeNum(t.qty), entry = tradeNum(t.entry);
  if (qty === null || entry === null || qty * entry === 0) return null;
  if (tradeNum(t.exit) === null) return null;
  return pnlOf(t) / Math.abs(entry * qty);
}
// RRR (risk : reward) = (exit - entry) / (entry - stoploss)
// A blank stoploss counts as 0 (e.g. an option bought with no stop risks the whole premium).
// qty cancels out, so it only depends on the three prices. null when it can't be calculated.
function rrrOf(t) {
  const entry = tradeNum(t.entry), exit = tradeNum(t.exit);
  const sl = tradeNum(t.sl) ?? 0;
  if (entry === null || exit === null || tradeNum(t.qty) === null) return null;
  const risk = entry - sl;
  return risk === 0 ? null : (exit - entry) / risk;
}
// Risk tag: the trade's Gross P/L % (before charges) placed into a fixed band.
// Bands are in percent of the capital used: p = Gross P/L % x 100
const RISK_TAG_BANDS = [
  ['Big Loss',       p => p <= -0.8],
  ['Small Loss',     p => p < 0.11],
  ['Safe < 0.2%',    p => p < 0.5],
  ['Small Profit',   p => p < 1],
  ['Big Profit +1%', p => p < 2],
  ['Big Profit +2%', p => p < 3],
  ['Big Profit +3%', () => true]
];
function riskTagOf(t) {
  const pct = pnlPctOf(t);
  if (pct === null) return null;
  const p = Math.round(pct * 100 * 1e9) / 1e9;   // 9 dp: removes floating-point noise at band edges
  return RISK_TAG_BANDS.find(([, test]) => test(p))[0];
}
// Strip fields that must never be persisted (derived values + legacy fields)
const DERIVED_TRADE_FIELDS = ['pnl', 'pnlPct', 'rrr', 'riskMgmt', 'losses', 'duration', 'period', 'payInOut', 'netPL', 'GrossPL', 'PerPL', 'RiskMgmt', 'RRR', 'Losses', 'Duration', 'Period'];  // payInOut / netPL were removed from the Trade Log database; old records are cleaned on load/save
// Charge-component / amount fields are no longer stored in Trade Log.
// `expCha` is intentionally NOT listed here: existing expected charges must survive migrations.
const REMOVED_TRADE_FINANCIAL_FIELDS = [
  'payInOut', 'netPL', 'PayInOut', 'NetPL',
  'entryAmt', 'exitAmt', 'ipft', 'sebi',
  'brokerage', 'igst', 'stamp', 'stt',
  'EntryAmount', 'ExitAmount', 'IPFT', 'SEBI', 'Brokerage', 'IGST', 'Stamp', 'STT',   // 'Exchange' is the trade exchange (NSE / MCX / BSE), not a charge amount
  // Est. Charges and Net P/L (after charges) were removed from the Trade Log database
  'EstCharges', 'NetPLAfterCharges', 'estCharges', 'netPLAfterCharges', 'Est. Charges', 'Net P/L', 'Net P/L '
];

function expectedChargesForTrade(t) {
  try {
    if (typeof computeCharges !== 'function') return null;

    const brokerKey = String(t?.broker || '').trim().toLowerCase();
    if (!brokerKey || !CHARGES_BROKERS?.[brokerKey]) return null;

    const segment = String(t?.segment || 'Capital');
    const product = normaliseProduct(t?.product) || '';
    // MARGIN covers futures and options alike: a trade with an option Type (or strike) is an option.
    const type = normaliseTradeType(t?.optType);
    const isOption = type ? TRADE_OPTION_TYPES.includes(type) : (t?.strike !== undefined && t?.strike !== null && t?.strike !== '');
    let segKey;
    if (segment === 'Capital') {
      segKey = product === 'INTRADAY' ? 'equityIntraday' : 'equityDelivery';   // CNC and MTF use the delivery rates
    } else if (segment === 'Equity') {
      segKey = isOption ? 'options' : 'futures';
    } else if (segment === 'Currency') {
      segKey = isOption ? 'currencyOptions' : 'currencyFutures';
    } else if (segment === 'Commodity') {
      segKey = isOption ? 'commodityOptions' : 'commodityFutures';
    } else {
      return null;
    }

    const qty = Math.abs(Number(t?.qty) || 0);
    const entry = Math.abs(Number(t?.entry) || 0);
    const exit = Math.abs(Number(t?.exit) || 0);
    if (!(qty > 0) || !(entry >= 0) || !(exit >= 0) || (entry === 0 && exit === 0)) return null;

    const result = computeCharges(
      brokerKey,
      segKey,
      entry * qty,
      exit * qty,
      {}
    );
    if (!result || !Number.isFinite(result.total)) return null;

    // Trade Log stores expenses as negative amounts, matching the existing expCha convention.
    return -Math.abs(Number(result.total));
  } catch (e) {
    return null;
  }
}

function tradeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function canonicalTradeRecord(t) {
  const c = {};
  const src = t || {};
  const put = (k,v) => { if (v !== undefined && v !== null && v !== '') c[k] = v; };
  put('Date', src.Date ?? src.EntryDate ?? src.date);
  put('Symbol', src.Symbol ?? src.symbol);
  put('Qty', src.Qty ?? src.qty);
  put('EntryPrice', src.EntryPrice ?? src.entry);
  put('Stoploss', src.Stoploss ?? src.sl);
  put('ExitPrice', src.ExitPrice ?? src.exit);
  // GrossPL, PerPL, RiskMgmt, RRR, Losses, Duration and Period are calculated fields.
  // They are intentionally NOT persisted in the database/raw schema.
  for (const [canon, legacy] of [
    ['ExpChgs','expCha'],['Expiry','expiry'],['Strike','strike'],['Type','optType'],
    ['EntryTime','entryTime'],['ExitTime','exitTime'],
    ['Disciplined','disciplined'],['Notes','notes'],['Strategy','strategy']
  ]) put(canon, src[canon] ?? src[legacy] ?? (canon === 'Notes' ? (src.Remarks ?? src.remarks) : undefined));   // 'Remarks' was renamed to 'Notes'; old stored data / files still load
  put('Exchange', src.Exchange ?? src.exchange);
  put('Segment', src.Segment ?? src.segment);
  put('Product', src.Product ?? src.product);
  put('Broker', src.Broker ?? src.broker);
  put('Id', src.Id ?? src.id);
  return c;
}
// 'Remarks' was renamed to 'Notes': read the new name first, then the old one, so stored data and old files keep their text
const tradeNotesOf = o => o.notes ?? o.Notes ?? o.remarks ?? o.Remarks;
function legacyTradeRecord(t) {
  if (!t || (!Object.prototype.hasOwnProperty.call(t, 'Date') && !Object.prototype.hasOwnProperty.call(t, 'EntryDate'))) {
    const copy = { ...t }, n = tradeNotesOf(copy);
    ['Notes', 'remarks', 'Remarks'].forEach(k => delete copy[k]);
    if (n !== undefined) copy.notes = n;
    return copy;
  }
  const c = t, out = {};
  const map = [
    ['Date','date'],['EntryDate','date'],['Symbol','symbol'],['Qty','qty'],['EntryPrice','entry'],['Stoploss','sl'],['ExitPrice','exit'],
    ['Expiry','expiry'],['Strike','strike'],['Type','optType'],
    ['EntryTime','entryTime'],['ExitTime','exitTime'],['Disciplined','disciplined'],['Notes','notes'],
    ['Strategy','strategy'],['ExpChgs','expCha'],
    ['Broker','broker'],['Exchange','exchange'],['Segment','segment'],['Product','product'],['Id','id']
  ];
  map.forEach(([a,b]) => { if (c[a] !== undefined) out[b] = c[a]; });
  const n = tradeNotesOf(c);
  if (n !== undefined) out.notes = n;
  return out;
}
// In-memory records keep some legacy key names; everything the user SEES uses the database header text.
const DB_HEADER_OF_KEY = {
  // trade
  date:'Date', symbol:'Symbol', qty:'Qty', entry:'EntryPrice', sl:'Stoploss', exit:'ExitPrice', expiry:'Expiry', strike:'Strike',
  optType:'Type', entryTime:'EntryTime', exitTime:'ExitTime', disciplined:'Disciplined', notes:'Notes',
  strategy:'Strategy', expCha:'ExpChgs', broker:'Broker', exchange:'Exchange', segment:'Segment', product:'Product', id:'Id',
  // ledger
  DATE:'Date', Sebi:'SEBI', Square:'SqrOff', 'DP-Chr.':'DPChgs', 'Fyers Cr.':'Credit', 'Fyers Dr.':'Debit', 'Daily Balance':'DailyTA',
  'Pay in/out':'PayInOut', 'Real Chr.':'RealChgs', 'Net P/L/Ch':'NetPL'
};
const dbHeaderOf = k => DB_HEADER_OF_KEY[k] || k;
function canonicalLedgerRecord(r) {
  const src = r || {}, c = {};
  const put=(k,v)=>{if(v!==undefined&&v!==null&&v!=='')c[k]=v;};
  const get=(canon, ...legacy)=> {
    if (src[canon] !== undefined) return src[canon];
    for (const k of legacy) if (src[k] !== undefined) return src[k];
    return undefined;
  };
  for (const k of LEDGER_EXCEL_FIELDS) put(k, get(k, ...(k==='Notes'?['Remarks']:[]),
    k==='Date'?'DATE':k==='SqrOff'?'Square':
    k==='DPChgs'?'DP-Chr.':
    k==='SEBI'?'Sebi':k==='Credit'?'Fyers Cr.':k==='Debit'?'Fyers Dr.':
    k==='DailyTA'?'Daily Balance':null
  ));
  put('Broker', get('Broker','broker'));
  put('Id', get('Id','id'));
  return c;
}
function legacyLedgerRecord(r) {
  // canonical records (stored form, seed, import rows) carry Broker / Id / Date; in-memory records already use the legacy keys
  const has = k => !!r && Object.prototype.hasOwnProperty.call(r, k);
  const oldNotes = o => o.Notes ?? o.Remarks;   // 'Remarks' was renamed to 'Notes'
  if (!has('Date') && !has('Broker') && !has('Id')) {
    const copy = { ...r }, n = oldNotes(copy);
    delete copy.Remarks;
    if (n !== undefined) copy.Notes = n;
    return copy;
  }
  const c=r,out={};
  const map=[
    ['Date','DATE'],['Brokerage','Brokerage'],['Exchange','Exchange'],
    ['IPFT','IPFT'],['SEBI','Sebi'],['IGST','IGST'],['STT','STT'],['Stamp','Stamp'],['SqrOff','Square'],
    ['DPChgs','DP-Chr.'],['Taxable','Taxable'],
    ['Credit','Fyers Cr.'],['Debit','Fyers Dr.'],['DailyTA','Daily Balance'],
    ['Notes','Notes'],['Broker','broker'],['Id','id']
  ];
  map.forEach(([a,b])=>{if(c[a]!==undefined)out[b]=c[a];});
  if (out.Notes === undefined && c.Remarks !== undefined) out.Notes = c.Remarks;
  return out;
}
// Keep the application's established in-memory field names. The IndexedDB
// boundary is canonicalized to the Excel schema.
function sanitizeTradeRecord(t) {
  const copy = legacyTradeRecord(t);
  delete copy.side;
  if (copy.segment !== undefined && copy.segment !== null)   // old "F&O" name -> Equity
    copy.segment = normaliseSegment(copy.segment) ?? copy.segment;
  delete copy.lots; delete copy.Lots;
  if (copy.exchange !== undefined) copy.exchange = normaliseExchange(copy.exchange);   // NSE / MCX / BSE, or blank
  if (copy.optType !== undefined) copy.optType = normaliseTradeType(copy.optType);     // CE / PE / FUT / EQ / BE, or blank
  if (copy.product !== undefined && copy.product !== null)   // Delivery / Intraday / Futures / Options -> CNC / INTRADAY / MARGIN
    copy.product = normaliseProduct(copy.product) ?? copy.product;
  DERIVED_TRADE_FIELDS.forEach(k => delete copy[k]);
  REMOVED_TRADE_FINANCIAL_FIELDS.forEach(k => delete copy[k]);
  delete copy.exitDate;
  delete copy.ExitDate;
  return copy;
}
function sanitizeLedgerRecord(r) {
  const out = legacyLedgerRecord(r);
  LEDGER_REMOVED_KEYS.forEach(k => delete out[k]);   // Day / PayInOut / RealChgs / NetPL are calculated, never stored
  return out;
}

// ---- Broker filter (one shared definition: Calendar, Trade Log and Ledger all use it) ----
// Values: 'all' | 'real' | 'paper' | 'broker:<name>'
function brokerNamesIn(list) {
  return Array.from(new Set(list.map(r => String(r?.broker || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
// Fill a <select> with the shared broker options and keep the current choice if it still exists.
// Returns the value that ends up selected.
function fillBrokerFilter(sel, list) {
  if (!sel) return 'all';
  const previous = sel.value || 'all';
  const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  sel.innerHTML = [
    '<option value="all">All broker</option>',
    '<option value="real">Real Broker</option>',
    '<option value="paper">Paper Trading</option>',
    ...brokerNamesIn(list).map(b => `<option value="broker:${ esc(b) }">${ esc(b) }</option>`)
  ].join('');
  sel.value = [...sel.options].some(o => o.value === previous) ? previous : 'all';
  return sel.value;
}
// Does a trade / ledger record pass the broker filter value?
function matchesBrokerFilter(rec, value) {
  if (!value || value === 'all') return true;
  if (value === 'real' || value === 'paper') return calBrokerTypeOf(rec) === value;
  if (value.startsWith('broker:'))
    return String(rec?.broker || '').trim().toLowerCase() === value.slice(7).trim().toLowerCase();
  return true;
}

// ---- Toast ----
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---- Raw database columns (used by the "Raw" toggle in Trade Log + Ledger) ----
// All field names found in a list of records, in first-seen order
function rawColumnKeys(list) {
  // every stored field of the database schema, whether or not any row has a value for it
  return TRADE_EXCEL_FIELDS.concat(TRADE_DB_META_FIELDS);
}


// Show a stored value exactly as it is (no rounding, no currency formatting)
function rawCell(v) {
  if (v === null || v === undefined || v === '') return '';   // empty cells stay empty
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
