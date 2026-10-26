// ======================================================================
// config.js — App-wide constants and shared state.
// Loaded first (after data/seed-*.js). Every other file reads these.
// ======================================================================

// ---- Storage names (keep unchanged so existing browser data still loads) ----
const LS_KEY          = 'tb_trades_v1';
const TRADE_CLEAR_KEY = 'tb_trades_cleared';
const LEDGER_CLEAR_KEY = 'tb_ledger_cleared';                 // localStorage backup of trades
const DELETED_TRADE_KEY = 'tb_deleted_trade_keys_v1';
// Largest Id in the previous trade seed. Trades with a higher Id were added by the user and survive a dataset rebuild.
const SEED_TRADE_MAX_ID_V1 = 3324;
const DELETED_LEDGER_KEY = 'tb_deleted_ledger_keys_v1';
const DATASET_VERSION = '2026-10-10-trade-workbook-rebuild';      // keep legacy localStorage data across schema-only migrations
const DB_NAME         = 'TradingJournalDB';             // IndexedDB: trades
const DB_VERSION      = 11;
const DB_STORE        = 'trades';
const LEDGER_DB_NAME    = 'TradingJournalLedgerDB';     // IndexedDB: ledger
const LEDGER_DB_VERSION = 8;
const LEDGER_DB_STORE   = 'ledger';


// Canonical database/export schema rebuilt from the tuned Excel workbook.
// The three numeric cells in Excel Fyers-style trade headers (0.004, 2, 0.01)
// are parameters, not column names, so they are deliberately excluded.
const TRADE_EXCEL_FIELDS = [
  'Date','Symbol','Qty','EntryPrice','Stoploss','ExitPrice',
  'ExpChgs',
  'Expiry','Strike','Type','EntryTime','ExitTime','Disciplined','Notes','Strategy'
];
const TRADE_DB_META_FIELDS = ['Exchange','Segment','Product','Broker','Id'];   // Excel header order, then app-only fields
// STORED ledger fields (database, Raw view, CSV export, Excel template, add/edit form).
// Date IS stored, but it is calculated from the Trade Log: one row per unique trade date per broker, never merged across
// brokers (see alignLedgerDates in js/ledger.js). The stored Date is what re-matches the data to the Trade Log after a reset.
// Day, PayInOut, RealChgs, NetPL and Balance are NOT stored: they are calculated internally
// (see LEDGER_COMPUTED_FIELDS below and js/ledger.js) and only shown in the normal Ledger table.
const LEDGER_EXCEL_FIELDS = [
  'Date','Brokerage','Exchange','IPFT','SEBI','IGST','STT','Stamp','SqrOff','DPChgs',
  'Taxable','Credit','Debit','DailyTA','Notes'
];
const LEDGER_COMPUTED_FIELDS = ['Day','PayInOut','RealChgs','NetPL','Balance'];
// Column order of the normal (non-Raw) Ledger table: stored + calculated columns, in the original sheet order.
const LEDGER_DISPLAY_FIELDS = [
  'Date','Day','PayInOut','Brokerage','Exchange','IPFT','SEBI','IGST','STT','Stamp','SqrOff','DPChgs','RealChgs',
  'NetPL','Taxable','Credit','Debit','Balance','DailyTA','Notes'
];
// Old/legacy keys that must be stripped from any ledger record on load/save/import.
const LEDGER_REMOVED_KEYS = ['Day','PayInOut','RealChgs','NetPL','Balance','DAY','Pay in/out','Real Chr.','Net P/L/Ch','Fyers Balance','Investments','NetPL2','NET P/L'];
const LEDGER_DB_META_FIELDS = ['Broker','Id'];

// ---- Column alignment (one place; used by trades.js + ledger.js, styled in css/24-table-look.css) ----
// Rule: numbers/quantities are right-aligned, short fixed codes (Day) are centred, everything else is left.
// The header cell always gets the same class as the body cells of its column.
// ---- Trade segments (short names) ----
// Capital = cash equity (Capital Market); Equity = equity derivatives (F&O); Currency; Commodity.
// Records from before the rename used "Equity" for cash shares and "F&O" for derivatives. Those were converted on
// the first load after the rename, so "Equity" now always means the derivative segment. Running this twice is safe.
function normaliseSegment(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'capital' || s === 'capital market') return 'Capital';
  if (s === 'equity' || ['f&o', 'fno', 'equity derivatives', 'equity derivative'].includes(s)) return 'Equity';
  if (s === 'currency' || s === 'currency derivatives' || s === 'currency derivative') return 'Currency';
  if (s === 'commodity' || s === 'commodity derivative' || s === 'commodity derivatives') return 'Commodity';
  return null;
}
// Full names shown as the tooltip (title) on every segment label in the app.
const SEGMENT_TOOLTIPS = { Capital: 'Capital Market', Equity: 'Equity Derivatives', Currency: 'Currency Derivatives', Commodity: 'Commodity Derivatives' };
// Tooltip for a raw or normalised segment value; '' when the value is not a known segment.
function segmentTooltip(value) {
  const seg = normaliseSegment(value);
  return seg ? SEGMENT_TOOLTIPS[seg] : '';
}
// ' title="…"' attribute for a segment cell, or '' (the tooltip text is a constant, so no escaping is needed).
function segmentTitleAttr(value) {
  const tip = segmentTooltip(value);
  return tip ? ` title="${tip}"` : '';
}
// ---- Trade types (the Type column) ----
// CE / PE = options. FUT = futures. EQ = equity (cash). BE = trade-to-trade (BE series). Blank is allowed.
const TRADE_TYPES = ['CE', 'PE', 'FUT', 'EQ', 'BE'];
const TRADE_OPTION_TYPES = ['CE', 'PE'];
function normaliseTradeType(value) {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return null;
  return TRADE_TYPES.includes(s) ? s : null;
}
// ---- Trade exchanges ----
// The exchange the trade was executed on. Blank is allowed (older records have none).
const TRADE_EXCHANGES = ['NSE', 'MCX', 'BSE'];
function normaliseExchange(value) {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return null;
  return TRADE_EXCHANGES.includes(s) ? s : null;
}
// ---- Trade products (the broker's Product Types) ----
// CNC = equity delivery (Capital only). INTRADAY = all segments. MARGIN = derivatives only (Futures and Options both).
// MTF = margin trading facility (Capital only). Older names (Delivery, Intraday, Futures, Options) map to these.
const TRADE_PRODUCTS = ['CNC', 'INTRADAY', 'MARGIN', 'MTF'];
const TRADE_PRODUCTS_BY_SEGMENT = {
  Capital: ['CNC', 'INTRADAY', 'MTF'],
  Equity: ['MARGIN', 'INTRADAY'],
  Currency: ['MARGIN', 'INTRADAY'],
  Commodity: ['MARGIN', 'INTRADAY']
};
function normaliseProduct(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'cnc' || s === 'delivery') return 'CNC';
  if (s === 'intraday' || s === 'mis') return 'INTRADAY';
  if (s === 'mtf') return 'MTF';
  if (['margin', 'futures', 'future', 'fut', 'options', 'option', 'opt'].includes(s)) return 'MARGIN';
  return null;
}
const TRADE_NUM_KEYS = new Set(['period','qty','entry','sl','exit','pnl','pnlPct','rrr','duration','losses']);   // Trade Log (normal view), by data-k
const TRADE_RAW_NUM_FIELDS = new Set(['Qty','EntryPrice','Stoploss','ExitPrice','ExpChgs','Strike']);
const LEDGER_ALIGN_NUM = new Set(['PayInOut','Brokerage','Exchange','IPFT','SEBI','IGST','STT','Stamp','SqrOff','DPChgs','RealChgs','NetPL','Taxable','Credit','Debit','Balance','DailyTA']);
const LEDGER_CTR_FIELDS = new Set(['Day']);
// ---- Header tooltips (hover a column header to see how the column is calculated) ----
// Keyed by the database field name; the same text is used in the normal and the Raw view of each table.
const TRADE_HEADER_TIPS = {
  Date: 'Date: trade date (stored).',
  Period: 'Period (calculated): intraday row (EntryPrice and ExitPrice on the same row) = blank · exit-only delivery row = days from the matched entry date(s) to this Date, matched FIFO lot by lot (e.g. 5,4) · entry-only row = Open · no matching entry = Unmatched.',
  Symbol: 'Symbol: instrument traded (stored).',
  Broker: 'Broker: broker/account of the trade (stored).',
  Qty: 'Qty: signed quantity, + long / − short (stored). Used in GrossPL, PerPL and Losses.',
  EntryPrice: 'EntryPrice: price the position was entered at (stored).',
  Stoploss: 'Stoploss: stop-loss price (stored). Used in RRR and Losses.',
  ExitPrice: 'ExitPrice: price the position was exited at (stored).',
  GrossPL: 'GrossPL = (ExitPrice − EntryPrice) × Qty (Qty is signed, − = short). If EntryPrice is blank: −Qty × ExitPrice. A blank ExitPrice counts as 0.',
  PerPL: 'PerPL = GrossPL ÷ |EntryPrice × Qty|. Blank when EntryPrice, Qty or ExitPrice is missing.',
  RRR: 'RRR = (ExitPrice − EntryPrice) ÷ (EntryPrice − Stoploss). A blank Stoploss counts as 0. Blank when EntryPrice, ExitPrice or Qty is missing, or EntryPrice = Stoploss.',
  Duration: 'Duration = ExitTime − EntryTime (hh:mm:ss). If ExitTime is earlier than EntryTime it is treated as past midnight.',
  Losses: 'Losses = −(EntryPrice − Stoploss) × Qty. Blank when Qty, EntryPrice or Stoploss is missing.',
  RiskMgmt: 'RiskMgmt = band of PerPL (as %): ≤ −0.8 Big Loss · < 0.11 Small Loss · < 0.5 Safe · < 1 Small Profit · < 2 Big Profit +1% · < 3 Big Profit +2% · ≥ 3 Big Profit +3%.',
  ExpChgs: 'ExpChgs: expected charges of the trade (stored).',
  Expiry: 'Expiry: contract expiry date (stored).',
  Strike: 'Strike: option strike price (stored).',
  Type: 'Type: CE, PE, FUT, EQ or BE (stored). CE and PE are options.',
  EntryTime: 'EntryTime: time of entry (stored). Used in Duration.',
  ExitTime: 'ExitTime: time of exit (stored). Used in Duration.',
  Disciplined: 'Disciplined: whether the trade followed your rules (stored).',
  Notes: 'Notes: free-text notes (stored).',
  Strategy: 'Strategy: strategy tag (stored).',
  Exchange: 'Exchange: NSE, MCX or BSE (stored). Blank when not recorded.',
  Segment: 'Segment: Capital, Equity, Currency or Commodity (stored).',
  Product: 'Product: CNC / INTRADAY / MARGIN / MTF (stored). MARGIN covers both futures and options; the Type column tells them apart.',
  Id: 'Id: internal database record identifier.'
};
// Normal Trade Log headers use short in-memory keys (data-k); map them to the database names above.
const TRADE_KEY_TO_FIELD = { date:'Date', period:'Period', symbol:'Symbol', broker:'Broker', qty:'Qty', entry:'EntryPrice', sl:'Stoploss', exit:'ExitPrice',
  pnl:'GrossPL', pnlPct:'PerPL', rrr:'RRR', duration:'Duration', losses:'Losses', riskMgmt:'RiskMgmt',
  segment:'Segment', product:'Product', optType:'Type', expiry:'Expiry', strike:'Strike', expCha:'ExpChgs',
  entryTime:'EntryTime', exitTime:'ExitTime', strategy:'Strategy', disciplined:'Disciplined', notes:'Notes', id:'Id' };
const LEDGER_HEADER_TIPS = {
  Date: 'Date: one row per unique Trade Log date for each broker (calculated from the Trade Log, stored with the record).',
  Day: 'Day = weekday of Date.',
  PayInOut: 'PayInOut = sum of GrossPL of all trades of that broker on that Date. Kotak: sum of GrossPL − Brokerage.',
  Brokerage: 'Brokerage: brokerage charge from the broker ledger (stored).',
  Exchange: 'Exchange: exchange transaction charge from the broker ledger (stored).',
  IPFT: 'IPFT: IPFT charge from the broker ledger (stored).',
  SEBI: 'SEBI: SEBI charge from the broker ledger (stored).',
  IGST: 'IGST: IGST charge from the broker ledger (stored).',
  STT: 'STT: securities transaction tax from the broker ledger (stored).',
  Stamp: 'Stamp: stamp duty from the broker ledger (stored).',
  SqrOff: 'SqrOff: square-off charge from the broker ledger (stored).',
  DPChgs: 'DPChgs: DP charge from the broker ledger (stored).',
  RealChgs: 'RealChgs = −(Brokerage + Exchange + IPFT + SEBI + IGST + STT + Stamp + SqrOff + DPChgs).',
  NetPL: 'NetPL = PayInOut + RealChgs. Kotak: PayInOut + Brokerage + RealChgs.',
  Taxable: 'Taxable: taxable amount of the ledger record (stored).',
  Credit: 'Credit: money credited to the account (stored). Added to Balance.',
  Debit: 'Debit: money debited from the account (stored). Added to Balance.',
  Balance: "Balance = previous entry's Balance (same broker, by Date) + NetPL + Credit + Debit. A broker's first entry = NetPL + Credit + Debit.",
  DailyTA: 'DailyTA: daily balance as reported by the broker (stored).',
  Notes: 'Notes: free-text notes (stored).',
  Broker: 'Broker: broker/account of the ledger record (stored).',
  Id: 'Id: internal database record identifier.'
};

const tradeAlignClass  = (k, raw) => (raw ? TRADE_RAW_NUM_FIELDS : TRADE_NUM_KEYS).has(k) ? 'num' : '';
const ledgerAlignClass = k => LEDGER_ALIGN_NUM.has(k) ? 'num' : LEDGER_CTR_FIELDS.has(k) ? 'ctr' : '';
const TRADE_EXCEL_HEADER_LABELS = Object.fromEntries(TRADE_EXCEL_FIELDS.map(k => [k, k]));
const LEDGER_EXCEL_HEADER_LABELS = Object.fromEntries(LEDGER_EXCEL_FIELDS.map(k => [k, k]));

// ---- Data held in memory ----
let trades  = [];      // every trade record
let ledgers = [];      // every ledger record
let dbPromise = null;        // cached IndexedDB connections
let ledgerDbPromise = null;

// ---- Trade Log view state ----
let PAGE_SIZE = 50;       // rows per page (Settings → Display & formats)
let page = 1;
let sortKey = 'date', sortDir = -1;    // sortDir: -1 = newest first
let showRawTrades = false;             // true = show every stored column

// ---- Ledger view state ----
let LEDGER_PAGE_SIZE = 50;
let ledgerPage = 1;
let ledgerSortKey = 'DATE', ledgerSortDir = -1;
let showRawLedger = false;             // true = show every stored column
const LEDGER_BROKERS = ['Groww', 'Kotak', 'Fyers'];
const LEDGER_FIELDS = [...LEDGER_EXCEL_FIELDS];

// ---- Look & feel ----
let currentTheme = 'dark';   // 'dark' | 'light'
let charts = {};             // live Chart.js instances, keyed by canvas id
