# Trading Journal Database Schema

## Trade database

Stored trade fields are defined by `TRADE_EXCEL_FIELDS` in `js/config.js`.

The canonical stored trade fields are:

`Date`, `Symbol`, `Qty`, `EntryPrice`, `Stoploss`, `ExitPrice`, `ExpChgs`, `Expiry`, `Strike`, `Type`, `EntryTime`, `ExitTime`, `Disciplined`, `Notes`, `Strategy`, `Exchange`, `Segment`, `Product`

The order above is the Excel import header order. `Broker` (from the sheet name) and `Id` (assigned by the app) follow it and are not in the Excel file.

`Date` is stored as ISO `YYYY-MM-DD`, the date the Ledger is calculated from and the app's shared date formatting/display preferences. `Period` is calculated from the trade structure: same-row EntryPrice + ExitPrice is an intraday trade and is `0 D`; an entry-only delivery/overnight row remains `Open`; an exit-only row is matched FIFO to earlier entry-only rows using the same Broker + instrument identity + opposite quantity, and its period is the elapsed calendar days from the matched entry date to the exit date. Product is not used for matching because broker exports can label a later exit row as Intraday.

The following are intentionally **not stored** in the Trade database, templates, imports, or Raw view because they are calculated/display values:
- GrossPL
- PayInOut
- NetPL
- PerPL
- RiskMgmt
- RRR
- Losses
- Duration
- Period
- EntryAmount
- ExitAmount
- IPFT
- SEBI
- Exchange
- Brokerage
- IGST
- Stamp
- STT
- EstCharges (Est. Charges)
- NetPLAfterCharges (Net P/L after charges)

`ExpChgs` is retained as a stored field. It is recalculated automatically when a trade is created or edited.
## Ledger database

The Ledger database is recreated from the ledger sheets in `Paper Trade + Old Records.xlsm`, preserving source row order and field text. The canonical stored field order (`LEDGER_EXCEL_FIELDS` in `js/config.js`) is:

`Date`, `Brokerage`, `Exchange`, `IPFT`, `SEBI`, `IGST`, `STT`, `Stamp`, `SqrOff`, `DPChgs`, `Taxable`, `Credit`, `Debit`, `DailyTA`, `Notes`

`Date` is **calculated from the Trade Log and also stored**: one ledger row per unique trade date per broker, brokers never merged (the same day traded with two brokers is two rows). The stored Date is what re-matches the rows to the Trade Log after a reset (`alignLedgerDates` in `js/ledger.js`): a row whose Date is a trade date of its broker keeps it, a trade date without a row gets a blank row, a row without a Date takes the earliest trade date that has no row, and a row whose date left the Trade Log keeps its data (only an empty one is dropped). Only ledger brokers (Groww, Kotak, Fyers and any broker that already has ledger rows) get ledger rows; paper brokers do not.

The following are intentionally **not stored** in the Ledger database, the Raw view or the CSV export, because they are calculated internally (`LEDGER_COMPUTED_FIELDS`):
- `Day` — weekday derived from `Date`
- `PayInOut` — Groww/Fyers: sum of Gross P/L of that day's trades; Kotak: that sum minus the day's Brokerage
- `RealChgs` — negative total of all charge columns (Brokerage … DPChgs)
- `NetPL` — Groww/Fyers: PayInOut + RealChgs; Kotak: PayInOut + Brokerage + RealChgs
- `Balance` — per broker, in date order: the previous entry's Balance + NetPL + Credit + Debit. A broker's first entry has no previous balance, so it is NetPL + Credit + Debit. (`DailyTA` is still a stored field.)

They are still shown as columns in the normal Ledger table (`LEDGER_DISPLAY_FIELDS`). Old records and imported files that still contain them are cleaned automatically (`LEDGER_REMOVED_KEYS`).

Database metadata is appended separately as `Broker` and `Id`. The seeded ledger row order is **Groww (G.Led) → Kotak (K.Led) → Fyers (F.Led)**, matching the source workbook. Raw view and the Ledger import template use the same canonical field order and text.

