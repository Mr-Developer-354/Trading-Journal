// ======================================================================
// storage.js — Saving and loading trades + ledger (IndexedDB, with localStorage backup).
// ======================================================================
// The object stores use keyPath 'id', but canonical records carry the key as 'Id'.
// Add the lowercase key on write so put() works (reads ignore it: canonical/legacy mapping uses Id).
const withDbKey = c => ({ ...c, id: c.Id });

function openTradeDB() {
  if (!('indexedDB' in window))
    return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = event => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE))
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      if (event.oldVersion < 6) {
        const store = event.target.transaction.objectStore(DB_STORE);
        store.clear();
        SEED_TRADES.forEach(t => store.put(withDbKey(canonicalTradeRecord(t))));
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(err => {
    console.error('database open failed', err);
    return null;
  });
  return dbPromise;
}

async function readTradesFromDB() {
  const db = await openTradeDB();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => resolve(null);
  });
}

async function writeTradesToDB(list) {
  const db = await openTradeDB();
  if (!db) return;
  await new Promise(resolve => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.clear();
    list.forEach(t => store.put(withDbKey(canonicalTradeRecord(t))));
    tx.oncomplete = resolve;
    tx.onerror = resolve;
    tx.onabort = resolve;
  });
}

function openLedgerDB() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (ledgerDbPromise) return ledgerDbPromise;
  ledgerDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(LEDGER_DB_NAME, LEDGER_DB_VERSION);
    req.onupgradeneeded = event => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEDGER_DB_STORE))
        db.createObjectStore(LEDGER_DB_STORE, { keyPath: 'id' });
      if (event.oldVersion < 8) {   // v8: ledger Date is stored again (calculated from the Trade Log) → replace with the dated seed
        const store = event.target.transaction.objectStore(LEDGER_DB_STORE);
        store.clear();
        SEED_LEDGER.forEach(r => store.put(withDbKey(canonicalLedgerRecord(r))));
      }
      // v3: existing rows are sanitized after the database opens.
      // Do not mutate records with a cursor during onupgradeneeded; keeping
      // the upgrade transaction limited to schema/seed work avoids browser
      // transaction timing issues.
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(err => { console.error('ledger database open failed', err); return null; });
  return ledgerDbPromise;
}
async function readLedgerFromDB() {
  const db = await openLedgerDB();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(LEDGER_DB_STORE, 'readonly');
    const req = tx.objectStore(LEDGER_DB_STORE).getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => resolve(null);
  });
}
async function writeLedgerToDB(list) {
  const db = await openLedgerDB();
  if (!db) return;
  await new Promise(resolve => {
    const tx = db.transaction(LEDGER_DB_STORE, 'readwrite');
    const store = tx.objectStore(LEDGER_DB_STORE);
    store.clear();
    list.forEach(r => store.put(withDbKey(canonicalLedgerRecord(r))));
    tx.oncomplete = resolve; tx.onerror = resolve; tx.onabort = resolve;
  });
}
async function loadLedgerData() {
  try {
    if (localStorage.getItem(LEDGER_CLEAR_KEY) === '1') {
      ledgers = [];
      await writeLedgerToDB([]);
      return;
    }
  } catch (e) {
    console.error('ledger clear-state read failed', e);
  }
  try {
    const stored = await readLedgerFromDB();
    if (stored && stored.length) {
      ledgers = stored.map(sanitizeLedgerRecord);
      await writeLedgerToDB(ledgers);
      return;
    }
  } catch (e) { console.error('ledger database load failed', e); }
  ledgers = SEED_LEDGER.map(sanitizeLedgerRecord);
  await writeLedgerToDB(ledgers);
}
function saveLedgerData() {
  const snapshot = ledgers.map(sanitizeLedgerRecord);
  try {
    if (snapshot.length) localStorage.removeItem(LEDGER_CLEAR_KEY);
  } catch (e) {}
  writeLedgerToDB(snapshot).catch(e => { console.error('ledger database save failed', e); showToast('Could not save ledger data to the database'); });
}
function sanitizeLedgerRecord(r) {
  const out = legacyLedgerRecord(r);
  LEDGER_REMOVED_KEYS.forEach(k => delete out[k]);   // Day / PayInOut / RealChgs / NetPL are calculated, never stored
  return out;
}

// Load from the real browser database first. On first run, migrate the
// previous localStorage data (or bundled seed data) into IndexedDB.
async function loadData() {
  try {
    if (localStorage.getItem(TRADE_CLEAR_KEY) === '1') {
      trades = [];
      await writeTradesToDB([]);
      return;
    }
  } catch (e) {
    console.error('trade clear-state read failed', e);
  }
  try {
    const stored = await readTradesFromDB();
    if (stored && stored.length) {
      trades = localStorage.getItem('tb_dataset_version') === DATASET_VERSION
        ? stored.map(sanitizeTradeRecord)
        : rebuildTradesForDataset(stored);
      await writeTradesToDB(trades); // drops any old pnl / pnlPct from the database
      try { localStorage.setItem(LS_KEY, JSON.stringify(trades)); localStorage.setItem('tb_dataset_version', DATASET_VERSION); } catch (e) {}
      return;
    }
  } catch (e) {
    console.error('database load failed', e);
  }

  try {
    const version = localStorage.getItem('tb_dataset_version');
    const raw = localStorage.getItem(LS_KEY);
    if (version === DATASET_VERSION && raw) {
      trades = JSON.parse(raw).map(sanitizeTradeRecord);
    } else if (raw) {
      trades = rebuildTradesForDataset(JSON.parse(raw));
    } else {
      trades = SEED_TRADES.map(sanitizeTradeRecord);
    }
  } catch (e) {
    console.error('legacy load failed', e);
    trades = SEED_TRADES.map(sanitizeTradeRecord);
  }

  await writeTradesToDB(trades);
  try { localStorage.setItem(LS_KEY, JSON.stringify(trades)); localStorage.setItem('tb_dataset_version', DATASET_VERSION); } catch (e) {}
}

// Persist the complete trade objects to both IndexedDB and legacy localStorage.
// No UI field list is used here: arbitrary future fields are retained.
function saveData() {
  if (typeof syncLedgerWithTrades === 'function') syncLedgerWithTrades();   // ledger dates follow the Trade Log
  const snapshot = trades.map(sanitizeTradeRecord);
  try {
    if (snapshot.length) localStorage.removeItem(TRADE_CLEAR_KEY);
    localStorage.setItem(LS_KEY, JSON.stringify(trades.map(canonicalTradeRecord)));
  } catch (e) {
    console.error('legacy save failed', e);
  }
  writeTradesToDB(snapshot).catch(e => {
    console.error('database save failed', e);
    showToast('Could not save trade data to the database');
  });
}
// generate the next unique trade id
// Stored trades from before the workbook rebuild are replaced by the new seed.
// Trades the user added (Id above the old seed) are kept and renumbered after the new seed.
// Deleted-row memory is cleared, so every workbook row is available again.
function rebuildTradesForDataset(stored) {
  const seed = SEED_TRADES.map(sanitizeTradeRecord);
  const seedKeys = new Set(seed.map(tradeExactKey));
  // A fresh browser's database already holds the new seed (written by the upgrade), so rows that match it are not user-added.
  const userAdded = (stored || []).map(sanitizeTradeRecord)
    .filter(t => (t.id || 0) > SEED_TRADE_MAX_ID_V1 && !seedKeys.has(tradeExactKey(t)));
  userAdded.forEach((t, i) => { t.id = seed.length + i + 1; });
  try { localStorage.removeItem(DELETED_TRADE_KEY); } catch (e) {}
  return seed.concat(userAdded);
}
function nextId() {
  return trades.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1;
}
