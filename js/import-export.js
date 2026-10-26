// ======================================================================
// import-export.js — CSV/JSON export, CSV/JSON import, reset data.
// ======================================================================
/* ---------------- export ---------------- */
// Convert every stored field from every trade to CSV. This deliberately
// derives columns from the database records instead of the visible table,
// so future fields are automatically preserved in backups/exports.
function csvEscape(v) {
  if (v === undefined || v === null) return '';
  v = String(v).replace(/"/g, '""');
  return (v.includes(',') || v.includes('"') || v.includes('\n')) ? `"${v}"` : v;
}
// Exports always use the tuned Excel schema/order, not the visible table order.
function toCsv(list) {
  if (!list.length) return '';
  const rows = list.map(canonicalTradeRecord);
  const cols = TRADE_EXCEL_FIELDS.concat(TRADE_DB_META_FIELDS).filter(k => rows.some(r => Object.prototype.hasOwnProperty.call(r,k)));
  const lines = [[...cols.map(k => TRADE_EXCEL_HEADER_LABELS[k] || k)].map(csvEscape).join(',')];
  rows.forEach(r => lines.push(cols.map(k => csvEscape(r[k])).join(',')));
  return lines.join('\n');
}
function toLedgerCsv(list) {
  if (!list.length) return '';
  const rows = list.map(canonicalLedgerRecord);
  const cols = LEDGER_EXCEL_FIELDS.concat(LEDGER_DB_META_FIELDS).filter(k => rows.some(r => Object.prototype.hasOwnProperty.call(r,k)));
  const lines = [cols.map(k => csvEscape(LEDGER_EXCEL_HEADER_LABELS[k] || k)).join(',')];
  rows.forEach(r => lines.push(cols.map(k => csvEscape(r[k])).join(',')));
  return lines.join('\n');
}

// trigger a browser download of the given content
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.getElementById('exportCsv').addEventListener('click', () => downloadFile('trades.csv', toCsv(getFiltered()), 'text/csv'));
document.getElementById('exportCsv2').addEventListener('click', () => downloadFile('trades.csv', toCsv(trades), 'text/csv'));
/* ---------------- full backup (trades + ledger + preferences in one file) ---------------- */
const BACKUP_FORMAT  = 'trading-journal-backup';
const BACKUP_VERSION = 2;
function buildFullBackup() {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    trades: trades.map(canonicalTradeRecord),
    ledger: ledgers.map(canonicalLedgerRecord),
    preferences: PREFS
  };
}
document.getElementById('exportJson').addEventListener('click', () => {
  const day = new Date().toISOString().slice(0, 10);
  downloadFile(`trading-journal-backup-${day}.json`, JSON.stringify(buildFullBackup(), null, 2), 'application/json');
});

// Restore a full backup. Only the parts present in the file are replaced:
// a file without "ledger" leaves the Ledger alone, and so on.
async function restoreFromBackup(backup) {
  const isBackup = backup && typeof backup === 'object' && !Array.isArray(backup) && backup.format === BACKUP_FORMAT;
  if (!isBackup) {
    showToast('That file is not a full journal backup');
    return;
  }
  const hasTrades = Array.isArray(backup.trades);
  const hasLedger = Array.isArray(backup.ledger);
  const hasPrefs  = backup.preferences && typeof backup.preferences === 'object' && !Array.isArray(backup.preferences);
  if (!hasTrades && !hasLedger && !hasPrefs) {
    showToast('The backup file has no journal data in it');
    return;
  }
  const what = [hasTrades && 'Trade Log', hasLedger && 'Ledger', hasPrefs && 'settings'].filter(Boolean);
  const counts = [hasTrades && `${backup.trades.length} trades`, hasLedger && `${backup.ledger.length} ledger rows`].filter(Boolean);
  const when = backup.exportedAt ? ` exported ${new Date(backup.exportedAt).toLocaleString()}` : '';
  if (!confirm(`Restore this backup${when}? It contains ${[...counts, hasPrefs && 'settings'].filter(Boolean).join(', ')}. The current ${what.join(', ')} will be replaced in this browser. Continue?`))
    return;
  try {
    if (hasTrades) {
      const list = backup.trades.map(sanitizeTradeRecord);
      await writeTradesToDB(list);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(list.map(canonicalTradeRecord)));
        if (list.length) localStorage.removeItem(TRADE_CLEAR_KEY);
        else localStorage.setItem(TRADE_CLEAR_KEY, '1');
        localStorage.removeItem(DELETED_TRADE_KEY);   // the restored file defines what is deleted
      } catch (e) {}
    }
    if (hasLedger) {
      const list = backup.ledger.map(sanitizeLedgerRecord);
      await writeLedgerToDB(list);
      try {
        if (list.length) localStorage.removeItem(LEDGER_CLEAR_KEY);
        else localStorage.setItem(LEDGER_CLEAR_KEY, '1');
        localStorage.removeItem(DELETED_LEDGER_KEY);
      } catch (e) {}
    }
    if (hasPrefs) {
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(backup.preferences)); } catch (e) {}
    }
  } catch (e) {
    console.error('restore failed', e);
    showToast('Restore failed: the database could not be written');
    return;
  }
  showToast('Backup restored');
  setTimeout(() => location.reload(), 600);   // every module rebuilds its state from storage
}

// The "Restore full backup" button: only accepts full backup files.
function handleRestoreFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); }
    catch (e) { showToast('That file is not valid JSON'); return; }
    restoreFromBackup(parsed);
  };
  reader.readAsText(file);
}
document.getElementById('restoreBackup').addEventListener('click', () => document.getElementById('restoreFile').click());
document.getElementById('restoreFile').addEventListener('change', e => {
  if (e.target.files[0]) handleRestoreFile(e.target.files[0]);
  e.target.value = '';
});
// "Start fresh": every stored record and every saved setting goes back to the shipped defaults.
// Data: the Trade Log and Ledger are rewritten from the bundled seeds, and the "deleted rows" memory is cleared,
// so the workbook can be imported again with nothing held back.
// Settings: column layout, preferences, scratch views, custom brokers, broker account types, opening credits and saved charge
// rates are removed, so they fall back to the built-in defaults. Appearance (theme, palette, density) is kept.
// The app then reloads, so every module rebuilds its state from these defaults and nothing stale is left in memory.
const factoryResetSettingKeys = () => [
  TRADE_CLEAR_KEY, LEDGER_CLEAR_KEY, DELETED_TRADE_KEY, DELETED_LEDGER_KEY,
  COLS_KEY, PREFS_KEY, SC_VIEW_ITEMS_KEY,
  CUSTOM_BROKERS_STORAGE_KEY, BROKER_TYPE_STORAGE_KEY, BROKER_OPENING_CREDIT_KEY,
  CHARGE_RATE_STORAGE_KEY, CHARGE_DEFAULTS_VERSION_KEY
];
async function factoryReset() {
  const seedTrades = SEED_TRADES.map(sanitizeTradeRecord);
  const seedLedger = SEED_LEDGER.map(sanitizeLedgerRecord);
  try {
    await writeTradesToDB(seedTrades);
    await writeLedgerToDB(seedLedger);
  } catch (e) {
    console.error('factory reset: database write failed', e);
    showToast('Reset failed: the database could not be written');
    return;
  }
  factoryResetSettingKeys().forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(seedTrades.map(canonicalTradeRecord)));
    localStorage.setItem('tb_dataset_version', DATASET_VERSION);
  } catch (e) {}
  location.reload();
}
document.getElementById('resetData').addEventListener('click', async () => {
  if (!confirm('Start fresh? The Trade Log and Ledger go back to the original records, and every trade or ledger row you added or deleted is discarded. Saved settings (column layout, preferences, custom brokers, broker types and charge rates) also return to their defaults. Appearance is kept. Continue?'))
    return;
  await factoryReset();
});

async function clearTradeDatabase() {
  if (!confirm('Clear the ENTIRE Trade Log database? All trade records will be permanently removed from this browser. This cannot be undone.')) return;
  try {
    trades = [];
    localStorage.setItem(TRADE_CLEAR_KEY, '1');
    localStorage.removeItem(LS_KEY);
    await writeTradesToDB([]);
    page = 1;
    populateBrokerFilter();
    renderTrades();
    renderDashboard();
    renderReports();
    renderRisk();
    renderBrokers();
    showToast('Trade Log database cleared');
  } catch (e) {
    console.error('trade database clear failed', e);
    showToast('Could not clear the Trade Log database');
  }
}

async function clearLedgerDatabase() {
  if (!confirm('Clear the ENTIRE Ledger database? All ledger records will be permanently removed from this browser. This cannot be undone.')) return;
  try {
    ledgers = [];
    localStorage.setItem(LEDGER_CLEAR_KEY, '1');
    await writeLedgerToDB([]);
    ledgerPage = 1;
    populateLedgerFilters();
    renderLedger();
    showToast('Ledger database cleared');
  } catch (e) {
    console.error('ledger database clear failed', e);
    showToast('Could not clear the Ledger database');
  }
}

document.getElementById('clearTradeDatabase').addEventListener('click', clearTradeDatabase);
document.getElementById('clearLedgerDatabase').addEventListener('click', clearLedgerDatabase);
/* ---------------- import ---------------- */
// parse CSV text into an array of row objects
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length)
    return [];
  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (!cells.length)
      continue;
    const rec = {};
    headers.forEach((h, idx) => {
      if (cells[idx] !== undefined && cells[idx] !== '')
        rec[h] = cells[idx];
    });
    out.push(rec);
  }
  return out;
}
// split a single CSV line into cells, respecting quoted commas
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"')
        inQ = false;
      else
        cur += c;
    } else {
      if (c === '"')
        inQ = true;
      else if (c === ',') {
        out.push(cur);
        cur = '';
      } else
        cur += c;
    }
  }
  out.push(cur);
  return out;
}
// normalize an imported CSV record into the app's trade shape
function normalizeImportedRecord(rec) {
  const signedQty = rec.qty !== undefined && rec.qty !== '' ? parseFloat(rec.qty) : undefined;
  const entry = rec.entry !== undefined && rec.entry !== '' ? parseFloat(rec.entry) : undefined;
  const exit = rec.exit !== undefined && rec.exit !== '' ? parseFloat(rec.exit) : undefined;
  // Gross P/L and Gross P/L % are calculated from qty/entry/exit, so they are never imported
  const out = Object.assign({}, rec, {
    id: rec.id !== undefined && rec.id !== '' ? rec.id : undefined,
    qty: signedQty,
    entry,
    exit,
    date: rec.date,
    symbol: (rec.symbol || '').toUpperCase().trim(),
    broker: rec.broker || 'Imported'
  });
  return sanitizeTradeRecord(out);
}
// read and import trades from a dropped/selected CSV or JSON file
function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      let imported = [];
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(reader.result);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // a full backup file dropped here is restored, not merged as trades
          await restoreFromBackup(parsed);
          return;
        }
        imported = Array.isArray(parsed) ? parsed.map(r => sanitizeTradeRecord(Object.assign({}, r))) : [];
      } else {
        const rows = parseCsv(reader.result);
        imported = rows.filter(r => r.date && r.symbol).map(normalizeImportedRecord);
      }
      if (!imported.length) {
        showToast('No valid trades found in that file');
        return;
      }
      // Use the same reconciliation rules as Excel imports. A matching row is
      // compared field-by-field; modifications are shown for approval instead
      // of silently creating another trade.
      const plan = planTradeRecords(imported);
      let decisions = null;
      if (plan.changes.length || plan.conflicts.length) {
        decisions = await reviewImport({
          label: 'trade', plan,
          columns: ['Symbol', 'Qty', 'EntryPrice', 'ExitPrice', 'EntryTime'],
          cellsOf: t => [t.symbol, t.qty, t.entry, t.exit, t.entryTime],
          dateOf: t => t.date
        });
        if (!decisions) return;
      }
      const res = applyTradeImport(plan, decisions);
      summarise('trade', res);
    } catch (err) {
      console.error(err);
      showToast('Could not read that file');
    }
  };
  reader.readAsText(file);
}
const importInput = document.getElementById('importFile');
const dropzone = document.getElementById('dropzone');
importInput.addEventListener('change', e => {
  if (e.target.files[0])
    handleImportFile(e.target.files[0]);
  e.target.value = '';
});
['dragover', 'dragenter'].forEach(ev => dropzone.addEventListener(ev, e => {
  e.preventDefault();
  dropzone.classList.add('drag');
}));
['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, e => {
  e.preventDefault();
  dropzone.classList.remove('drag');
}));
dropzone.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if (file)
    handleImportFile(file);
});
