// ======================================================================
// cloud.js — Access gate + cloud sync (Firebase Auth + Firestore).
// ======================================================================
// The journal only opens for a signed-in user. Signed-out visitors are sent to login.html.
// Signed-in data is stored per user in Firestore:
//   journals/{uid}/trades/{Id}   and   journals/{uid}/ledger/{Id}
// On sign-in the cloud copy is loaded. If the cloud is empty, this browser's data is uploaded.
// Every later change is uploaded automatically.

const CLOUD_DEBOUNCE_MS = 2000;
const CLOUD_BATCH_SIZE = 450;   // Firestore allows 500 writes per batch

let cloudAuth = null;
let cloudDb = null;
let cloudUser = null;
let cloudTimer = null;
let cloudBusy = false;
let cloudQueued = false;
let cloudPulling = false;
let localDataReady = false;   // set by main.js once the local database has loaded

// Keep the original local-save functions: the wrapped versions also schedule a cloud upload.
const localSaveTrades = saveData;
const localSaveLedger = saveLedgerData;

function cloudBase(uid) {
  return cloudDb.collection('journals').doc(uid);
}

// Firestore rejects undefined values; JSON round-trip removes them.
function cloudClean(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function cloudToLogin() {
  location.replace('login.html');
}

function cloudInit() {
  if (typeof firebase === 'undefined') { cloudToLogin(); return; }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    cloudAuth = firebase.auth();
    cloudDb = firebase.firestore();
    cloudAuth.onAuthStateChanged(user => {
      if (!user) { cloudToLogin(); return; }
      cloudUser = user;
      window.__authOk = true;
      document.documentElement.style.visibility = '';   // reveal the journal (hidden until now, see index.html)
      renderCloudBar();
      if (localDataReady) cloudPull();
    });
  } catch (e) {
    console.error('cloud init failed', e);
    cloudToLogin();
  }
}

// Removes this browser's copy of the journal (IndexedDB + localStorage).
// The cloud copy is untouched, and display preferences are kept.
async function cloudClearLocal() {
  try { (await dbPromise)?.close(); } catch (e) {}
  try { (await ledgerDbPromise)?.close(); } catch (e) {}
  await Promise.all([DB_NAME, LEDGER_DB_NAME].map(name => new Promise(resolve => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch (e) { resolve(); }
  })));
  [LS_KEY, TRADE_CLEAR_KEY, LEDGER_CLEAR_KEY, DELETED_TRADE_KEY, DELETED_LEDGER_KEY].forEach(k => {
    try { localStorage.removeItem(k); } catch (e) {}
  });
}

async function cloudSignOut() {
  if (!cloudAuth) return;
  await cloudClearLocal();   // a shared browser must not keep this account's journal
  try { await cloudAuth.signOut(); } catch (e) { showToast('Sign-out failed'); return; }
  cloudToLogin();
}

// Called by main.js after loadData() and loadLedgerData() finish.
function cloudMarkReady() {
  localDataReady = true;
  if (cloudUser) cloudPull();
}

// Loads the cloud copy into the app, or uploads this browser's copy if the cloud is empty.
async function cloudPull() {
  if (!cloudUser || !cloudDb || cloudPulling) return;
  cloudPulling = true;
  try {
    const base = cloudBase(cloudUser.uid);
    const [tSnap, lSnap] = await Promise.all([base.collection('trades').get(), base.collection('ledger').get()]);
    if (tSnap.empty && lSnap.empty) {
      await cloudPushNow();
      return;
    }
    const withId = d => { const data = d.data(); return { ...data, id: data.Id }; };
    trades = tSnap.docs.map(d => sanitizeTradeRecord(withId(d))).sort((a, b) => (a.id || 0) - (b.id || 0));
    ledgers = lSnap.docs.map(d => sanitizeLedgerRecord(withId(d)));
    localSaveTrades();
    localSaveLedger();
    if (typeof rerenderAll === 'function') rerenderAll();
    showToast('Journal loaded from your account');
  } catch (e) {
    console.error('cloud load failed', e);
    showToast('Could not load your cloud journal: ' + (e.message || e.code));
  } finally {
    cloudPulling = false;
  }
}

function cloudSchedule() {
  if (!cloudUser || !localDataReady || cloudPulling) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(cloudPushNow, CLOUD_DEBOUNCE_MS);
}

// Makes a collection match the given records: writes all of them and deletes the rest.
async function cloudReplace(colRef, records) {
  const existing = await colRef.get();
  const keep = new Set(records.map(r => r.id));
  const ops = [];
  records.forEach(r => ops.push({ type: 'set', ref: colRef.doc(r.id), data: r.data }));
  existing.docs.forEach(d => { if (!keep.has(d.id)) ops.push({ type: 'delete', ref: d.ref }); });
  for (let i = 0; i < ops.length; i += CLOUD_BATCH_SIZE) {
    const batch = cloudDb.batch();
    ops.slice(i, i + CLOUD_BATCH_SIZE).forEach(op => op.type === 'set' ? batch.set(op.ref, op.data) : batch.delete(op.ref));
    await batch.commit();
  }
}

async function cloudPushNow() {
  if (!cloudUser || !cloudDb) return;
  if (cloudBusy) { cloudQueued = true; return; }
  cloudBusy = true;
  try {
    const base = cloudBase(cloudUser.uid);
    const tradeRecs = trades.map(t => { const c = canonicalTradeRecord(t); return { id: String(c.Id), data: cloudClean(c) }; });
    const ledgerRecs = ledgers.map(r => { const c = canonicalLedgerRecord(r); return { id: String(c.Id), data: cloudClean(c) }; });
    await cloudReplace(base.collection('trades'), tradeRecs);
    await cloudReplace(base.collection('ledger'), ledgerRecs);
  } catch (e) {
    console.error('cloud save failed', e);
    showToast('Cloud sync failed: ' + (e.message || e.code));
  } finally {
    cloudBusy = false;
    if (cloudQueued) { cloudQueued = false; cloudPushNow(); }
  }
}

// Wrap the local save functions so every change is also scheduled for upload.
saveData = function () { localSaveTrades(); cloudSchedule(); };
saveLedgerData = function () { localSaveLedger(); cloudSchedule(); };

// Sign-out button in the sidebar, under "Log a trade". Its title shows the signed-in email.
function renderCloudBar() {
  const btn = document.getElementById('cloudSignOutBtn');
  if (!btn) return;
  if (!btn.dataset.wired) {
    btn.dataset.wired = '1';
    btn.addEventListener('click', cloudSignOut);
  }
  btn.title = cloudUser && cloudUser.email ? 'Signed in as ' + cloudUser.email + ' · synced' : 'Signed in';
}

cloudInit();
