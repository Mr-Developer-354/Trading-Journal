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

async function cloudSignOut() {
  if (!cloudAuth) return;
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

// Small account bar, bottom-left corner: who is signed in, and sign out.
function renderCloudBar() {
  let bar = document.getElementById('cloud-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cloud-bar';
    bar.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:900;display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:var(--surface,#1b1f27);color:var(--text,#e6e9ef);border:1px solid rgba(255,255,255,.12);font:500 12px/1.2 Inter,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)';
    document.body.appendChild(bar);
  }
  bar.textContent = '';
  const label = document.createElement('span');
  label.textContent = (cloudUser && cloudUser.email ? cloudUser.email : 'Signed in') + ' · synced';
  const btn = document.createElement('button');
  btn.textContent = 'Sign out';
  btn.style.cssText = 'border:0;border-radius:999px;padding:5px 10px;cursor:pointer;font:inherit;background:#4f7cff;color:#fff';
  btn.addEventListener('click', cloudSignOut);
  bar.append(label, btn);
}

cloudInit();
