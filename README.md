# The Book — Trading Journal

A browser-only trading journal. No build step, no server, no install.

## Run it
- Double-click `index.html`, **or**
- In VS Code: install the *Live Server* extension → right-click `index.html` → **Open with Live Server**.

(Needs internet only for Chart.js and Google Fonts.)

## Folder map
```
TradingJournal/
├── index.html            The page: sidebar + one <section> per view
├── css/                  Styles, loaded in numeric order (later files win)
│   ├── 01-base.css           colours (dark/light), reset
│   ├── 02 … 20               one file per area (sidebar, dashboard, calendar, ledger, charges, …; 20 = Settings page)
│   ├── 21-overrides.css      final tweaks
│   ├── 26-theme.css          UNIFIED THEME (loaded last): palette, fonts, radii, shadows — edit tokens here
│   ├── 28-slim.css           DENSITY modes (Normal / Compact / X-compact): global choice in Settings → Appearance, per-page override in Settings → Page density
│   ├── 27-palettes.css       the 8 colour palettes + Settings → Appearance styles
│   ├── 22-raw-columns.css    the Raw toggle button + wide raw table
│   ├── 23-sticky.css         sticky filter bar + pinned table header
│   └── 25-import-review.css  the "changed date" review dialog for Excel import
├── js/                   Behaviour, loaded in the order listed in index.html
│   ├── config.js             constants + shared state (trades, ledgers, page, sort…)
│   ├── storage.js            save/load trades + ledger (IndexedDB + localStorage)
│   ├── utils.js              formatting helpers (money, dates, toast)
│   ├── layout.js             sidebar, view switching, theme
│   ├── preferences.js        Settings page logic + saved preferences (date/number format, rows per page, width, privacy blur…)
│   ├── stats.js              win rate, profit factor, streaks, drawdown
│   ├── charts.js             Chart.js helpers, clickable bar lists
│   ├── dashboard.js  trades.js  ledger.js  calendar.js
│   ├── insights.js  brokers.js  charges.js  charges-rates.js
│   ├── reports.js            Reports view: Status, Daily, Weekly, Monthly, Yearly (FY), Symbol; Risk management page (sidebar)
│   ├── trade-drawer.js       add / edit / view a trade
│   ├── import-export.js      CSV / JSON in and out
│   └── main.js               keyboard shortcuts + start-up (loaded last)
├── data/
│   ├── seed-trades.js        3,314 bundled trades (one per line; P/L and P/L % are calculated, not stored)
│   └── seed-ledger.js        541 bundled ledger rows
└── images/icon/csv-icon.png
```

## Where do I change…?
| I want to change…                  | Open                                  |
|------------------------------------|---------------------------------------|
| A number on the dashboard          | `js/dashboard.js` (maths: `js/stats.js`) |
| A number or column on the Reports page | `js/reports.js` (`buildReportModel`, `reportSummarize`, `reportGroups`; layout in `repStatusHtml`, `repPeriodTable`, `repSymbolHtml`) + `css/34-reports.css` |
| Reports tabs / period targets | `REPORT_TABS`, `REPORT_TARGETS` at the top of `js/reports.js` |
| Risk management page (sidebar) | `repRiskBlockHtml`, `repRiskTableHtml`, `RISK_TABS`, `REPORT_RISK_BINS` in `js/reports.js` |
| Trade Log columns / filters        | `index.html` (`#view-trades`) + `js/trades.js` |
| Add-trade form fields              | `js/trade-drawer.js`                  |
| Brokerage / tax rates (defaults)   | `js/charges-rates.js`                 |
| Brokerage & charges **View / Edit modes** on the Charges & Calculators page (per real broker, add/remove brokers, import/export) | `js/settings-charges.js` + `css/30-settings-charges.css` (mode bar: `renderChargesModeBar` in `js/charges.js`) |
| Built-in rate data (FYERS / Groww / Kotak Neo) incl. exchange variants + extra one-time rows | `js/charges-rates.js` (bump `CHARGE_DEFAULTS_VERSION` in `js/charges.js` when you add new built-in data, so existing users get it merged in without losing their edits) |
| Charges & Calculators look (tabs, tables, Edit-rates popup) | `css/18-charges-redesign.css` (markup: `js/charges.js`) |
| Settings page layout / new settings | `index.html` (`#view-settings`) + `css/20-settings.css` + `js/preferences.js` (add a default to `PREF_DEFAULTS`, a row with `data-pref="key"` in the HTML, and use `PREFS.key` where it should take effect) |
| Colours / theme / fonts / radii    | `css/26-theme.css` (the tokens at the top; it overrides 01-base) |
| Calendar heat colours              | `css/21-overrides.css`                |
| Sticky bar / header behaviour      | `css/23-sticky.css` + the sticky block at the end of `js/layout.js` |
| Table column alignment / row look  | `css/24-table-look.css` (rules) + `TRADE_NUM_KEYS` / `TRADE_RAW_NUM_FIELDS` / `LEDGER_ALIGN_NUM` in `js/config.js` (which columns are numeric) |
| Raw-columns toggle                 | `js/trades.js`, `js/ledger.js`, `css/22-raw-columns.css` |
| Sticky filter bar / table header   | `css/23-sticky.css` (+ `syncStickySizes` in `js/layout.js`) |
| Bundled starting data              | `data/seed-*.js`                      |

## How it works (one paragraph)
On start, `main.js` calls `loadData()` (storage.js), which reads trades from the browser's IndexedDB
(first run: copies the bundled seed). Each view has a `renderXxx()` function that reads the global
`trades` array and writes HTML into its `<section>`. Any edit changes `trades`, calls `saveData()`,
then re-renders the views.

## Resetting to the bundled data
Settings → Data & backup → *Start fresh*, or bump `DATASET_VERSION` in `js/config.js`.
Your data lives in the browser (not in these files), so exporting a **Full backup** from Settings → Data & backup is worthwhile. It saves the Trade Log, Ledger and preferences in one JSON file; **Restore full backup** (same section, or dropping the file on the Import box) puts them back.

## Raw columns button
In **Trade Log** and **Ledger**, the **Raw** button (just left of the CSV icon) swaps the table to show every field
of the database schema (all stored columns, including ones no row has filled in yet), exactly as saved. Click it again to return to the normal columns. Sorting, filters,
paging and click-a-row-for-details all keep working in both modes.

## Sticky filter bar and header
In Trade Log and Ledger the filter bar stays at the top of the window while you scroll, and the table header stays
pinned above the rows. The table scrolls inside its own frame that fills the rest of the screen height
(the frame's size is measured in `js/layout.js`, so it also adapts on phones).

## Sticky filter bar + header
In **Trade Log** and **Ledger** the filter bar rides up and pins to the top of the window, and the table
header pins right under it. The page itself scrolls — there is no inner scroll box or extra scrollbar.
On phones (≤600px) only the header pins, because the filter bar there is about 160px tall.
When the columns are wider than the screen (Raw mode, small screens) the table scrolls sideways as
before, and `js/layout.js` shows a fixed copy of the header at the top.

## Calculated fields (never stored in the database)
| Field   | Formula |
|---------|---------|
| Gross P/L | `(exit − entry) × qty`  (qty is negative for shorts) |
| % Gross P/L | `Gross P/L ÷ |entry × qty|` |
| RRR     | `(exit − entry) ÷ (entry − stoploss)`  — blank stoploss counts as 0 |
| Tag     | % Gross P/L band: `< −0.75%` Very Big Loss · `≤ −0.5%` Big Loss · `< 0.11%` Small Loss · `< 0.5%` Safe < 0.2% · `< 1%` Small Profit · `< 2%` Big Profit +1% · `< 3%` Big Profit +2% · `≥ 3%` Big Profit +3% |

They live in `js/utils.js` (`pnlOf`, `pnlPctOf`, `rrrOf`, `riskTagOf`, `lossesOf`, `durationOf`, `periodOf`). These calculated values are display-only and are never stored in the Trade Log database, templates, or Raw view. Period is calculated from Date through today. `sanitizeTradeRecord()` strips legacy calculated fields from anything saved or imported.

## Ledger dates
Each ledger broker gets one row per unique date in the Trade Log for that broker (`js/ledger.js`: `alignLedgerDates`, `resolveLedgerDates`, `syncLedgerWithTrades`). The Date is stored with the row, so after a reset (re-seed or re-import) every row is matched back to the Trade Log by broker + date. New trade dates get a blank ledger row; a row whose date left the Trade Log keeps its data. Manual "add ledger entry" is replaced by these automatic rows (and the **Sync** button in the Ledger filter bar re-runs the same matching on demand, also after the ledger database was cleared), ledger row deletion by **Clear data**, and a ledger import only adds rows for dates that have a trade for that broker.

## Excel import (Ledger and Trade Log)
Both pages have an **Import** button (left of the CSV icon). Pick an `.xlsx` workbook where **each sheet is one broker**
(the sheet name becomes the broker). Blank templates are in `templates/`:
`Ledger_Import_Template.xlsx` and `TradeLog_Import_Template.xlsx` (see their *Instructions* sheet). Their columns are exactly the stored database fields; every column has data validation (dates, times, whole numbers, numbers, dropdowns, text length) and the sheets are protected (no password) so only the data area accepts input. The Ledger template has a required Date column; import your Trade Log first, because only dates that have a trade for that broker are added.
Rows already in the app are skipped, so importing the same file twice is safe.

**Changed dates:** if a row in the file matches an existing row in everything except the date
(Ledger: broker + Pay in/out + Net P/L/Ch + Daily Balance; Trade Log: broker + symbol + qty + entry + exit + entry time),
nothing is written straight away. A dialog lists each such row as *app date → file date* and asks, per row, to
**change the date of the existing row**, **add it as a new row**, or **skip** it (with "Set all" shortcuts).
*Cancel import* (or Esc) changes nothing at all.

**Same broker + same date (Ledger only):** the Ledger keeps one row per broker per day, so a file row for a day that
already has a row is never added as an extra row. If its values differ, the dialog shows only the fields that differ
(*app* vs *file*) and you choose **Keep app's data** or **Use file's data** (the file's values are laid over the existing
row; fields the file leaves blank are kept). The same applies to a day that appears twice in the file. Trade Log is
not affected, since several trades per broker per day are normal. Code: `js/import-excel.js`
(uses SheetJS from cdnjs, so it needs internet like Chart.js).

## Brokerage & charges (Charges & Calculators) — adding brokers
Charges & Calculators has three modes (top right): **View**, **Calculator** and **Edit**. View and Edit show one tab per *Real Broker*. Use **+ Add broker** to create a new one: it is remembered
(`tb_custom_brokers`), marked Real, offered in the Ledger's broker list, and gets its own rate card (start from the Standard
template or copy FYERS/Groww/Kotak). Each rate card covers every segment (brokerage mode, STT, stamp, exchange — with other
exchanges' rates —, SEBI, IPFT, clearing, DP, GST components), MTF slabs, one-time/penalty charges and a source/“last verified” note.
**Export / Import** moves a rate card between browsers as JSON (an import is loaded as a draft; review it, then *Save rates*).
Rate cards are stored in `localStorage` key `tb_charge_rates_v1`; Charges & Calculators reads the same data, and its
*Edit rates* buttons jump to this page. Calculators show an **Exchange** picker when a segment has other-exchange rates.

**Modes (Charges & Calculators, top right):**
- **View** — read-only summary of a broker's rate card (profile, rates by segment, GST, MTF, one-time charges, source). *Choose what to show* picks which items appear (remembered in `tb_sc_view_items_v1`).
- **Calculator** — the live calculators (Capital, Equity, Currency, Commodity, MTF, SIP, Lumpsum). Their *Edit … rates* buttons jump to Edit mode on the matching tab.
- **Edit** — every field: Profile (plan, website, AMC, account-opening, call & trade, platform, pledge, auto square-off fees, notes), per-segment brokerage / statutory / exchange / GST, MTF slabs, one-time charges, tax and source; plus **+ Add broker** and rate-card Export / Import.
Brokerage & charges no longer lives in Settings (Settings → Broker accounts still marks a broker Real or Paper).

**Profile fees in the calculators:** the Capital / Equity / Currency / Commodity calculators show *Call & trade orders* and *Auto square-off* inputs when the broker's Profile has those fees (each adds the fee + GST to total charges and P/L after charges). The **Account fees** tab totals opening fee, AMC, platform fee and pledge fees (+ optional GST) over a number of years.


## Excel schema rebuild (2026-10-05)

The bundled trade and ledger databases are rebuilt from `Paper Trade + Old Records.xlsm` using the workbook's sheet order and row order.

- Trade sheet order: TradingView → Trinkerr → FrontPage → Groww → Kotak → Fyers.
- Ledger sheet order: G.Led → K.Led → F.Led.
- Trade field names follow the Excel camel-case headers such as `Date`, `EntryPrice`, `ExpChgs`, `EntryTime`, `ExitTime`, `Disciplined`, `Notes`, `Strategy`. Calculated fields `GrossPL`, `PerPL`, `RiskMgmt`, `RRR`, `Losses`, `Duration`, and `Period` are intentionally excluded from the stored schema.
- Ledger field names follow the Excel headers: `Date`, `SEBI`, `SqrOff`, `DPChgs`, `Credit`, `Debit`, `DailyTA`, etc. `Day`, `PayInOut`, `RealChgs`, `NetPL` and `Balance` are calculated internally and not stored (see `DATABASE_SCHEMA.md`). `Date` is stored too, but it is calculated from the Trade Log (unique dates per broker, brokers never merged). The ledger IndexedDB version is bumped to 8, so an existing browser ledger is replaced by the dated seed on the next load.
- The Excel cells `0.004`, `2`, and `0.01` in trade-sheet row 1 are treated as calculation parameters, not database field names.
- `Est. Charges` and the trailing `Net P/L ` column of the old FrontPage sheet are no longer stored. They are removed from the database, templates and Raw view, and are ignored (and cleaned from old records) on import.
- The IndexedDB versions are bumped so an existing browser database is replaced by this rebuilt seed on the next load.

## Column alignment
Numbers, prices, P/L and quantities are right-aligned, the Ledger `Day` column is centred, everything else is left-aligned.
This holds in the normal **and** Raw views. A cell gets `class="num"` (or `ctr`) from `tradeAlignClass()` / `ledgerAlignClass()` in
`js/config.js`, and the header cell of the same column gets the same class, so header and values always line up and it no longer
depends on column position. To add a numeric column, add its key to the matching set in `config.js`.

## Excel import templates (`templates/`)
`TradeLog_Import_Template.xlsx` (one sheet per broker) and `Ledger_Import_Template.xlsx` (Groww / Kotak / Fyers). Headers are the exact
database field names, required headers are red, dropdowns and date/time/number checks sit on the right columns, and the
Instructions sheet lists every column. Sheets named Instructions, Readme, Legend or Notes are never imported, so keep examples there.


## Imports
Every import (Excel or JSON, Trade Log or Ledger) applies the same calculations as a manually added row: expected charges are recalculated from the Brokerage & Charges settings, symbols are upper-cased, and Day / Pay In/Out / Real Chr. / Net P/L are calculated for every broker. Afterwards the Trade Log, Ledger, Dashboard, Insights, Brokers and Calendar are all refreshed.


### Delivery/overnight period matching

Trade Log period is calculated without `ExitDate`. Intraday rows with both `EntryPrice` and `ExitPrice` are `0 D`. Delivery/overnight positions use separate entry-only and exit-only rows. An exit row is matched FIFO only to earlier entry-only rows from the same broker and instrument, with opposite signed quantity; Product is ignored for matching because broker exports may label exit rows as Intraday. Partial exits can match multiple entry rows, and the matched periods are shown directly below `ExitPrice`. Unmatched entry rows show `Open`.

## Opening credit (paper accounts without a ledger)
Paper accounts have no ledger rows, so their starting money is entered in **Settings → Broker & account type**: an
**Initial credit** and the **Credited on** date, shown under each account that has no ledger rows. Stored in
`localStorage` as `tb_broker_opening_credits` (browser-local, like the broker types).
- Balance = initial credit + net P/L (gross + estimated charges) of that account's trades dated on or after the credit date.
- Used by the Brokers view (balance and return on the account card) and by the Reports balance columns.
- Ledger brokers (Groww, Kotak, Fyers and any broker with ledger rows) ignore it: their Credit / Debit rows are the source.
- Trades dated before the credit date are not counted in the balance; they still count in the P/L totals.

## Reports view
The **Reports** page (sidebar, after Insights) carries the report sheets of `Paper Trade + Old Records.xlsm`
(Status, Daily_Reports, Weekly_Reports, Monthly_Reports, Yearly_Reports, Symbol_Reports) for **any broker**. The **Risk management** page (sidebar, after Reports) is separate: its own broker filter and Status, Daily, Weekly, Monthly and Yearly (FY) tabs, each with the trades per Gross P/L % band.
The **Broker** box at the top picks All brokers, Real Broker, Paper Trading or one broker (Fyers, Groww, Kotak, …).

- **Status**: accounting (credit, debit, used balance, net P/L, closing balance), charges by type, ratios,
  trading, trading days and the % P/L risk tags.
- **Daily / Weekly / Monthly / Yearly (FY)**: one row per period, newest first, with the workbook's columns.
  Weeks run Monday to Friday, months are calendar months, the financial year runs 1 April to 31 March.
- **Symbol**: trades, win %, RRR and P/L per ticker.
- **Risk management**: per week, how many trades fell in each % P/L bin (losses = first seven bins, profits = last seven).

Rules (same as the workbook):
- *Net P/L* is the Ledger's Net P/L for a broker and day. A broker with no ledger row that day (paper brokers) uses
  Gross P/L + the trade's estimated charges. Credit, debit, balance, taxable and Daily TA exist only where a ledger is kept.
- *Per P/L* = Gross P/L ÷ Daily TA (the period's average Daily TA for the period rows). *Net per P/L* uses Net P/L.
- *RRR* is rounded to 2 dp per trade before averaging. *Win* = Gross P/L > 0; a zero P/L trade counts as a loss.
- *Targets* = Daily TA × the workbook's multiples (Daily 2.5–14%, Weekly 2–20%, Monthly 10–50%, Yearly 30–200%).
- One known difference from the workbook: on a day where the ledger has no brokerage entered, the workbook charges the
  trades' estimated charges and the Ledger page shows none. The Reports follow the Ledger page.
