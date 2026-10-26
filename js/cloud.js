// ======================================================================
// cloud.js — Google sign-in + cloud sync (Firebase Auth + Firestore).
// ======================================================================
// Signed-out: the app works exactly as before, with data in this browser only.
// Signed-in: trades and ledger rows are also stored per user in Firestore:
//   journals/{uid}/trades/{Id}   and   journals/{uid}/ledger/{Id}
// On sign-in the cloud copy is loaded into the app. If the cloud is empty, this
// browser's data is uploaded instead. Every later change is uploaded automatically.

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBgvGBCgtC72EZdvsQFcDal04FCXyKCskU",
  authDomain: "tradingjournal-b632c.firebaseapp.com",
  projectId: "tradingjournal-b632c",
  storageBucket: "tradingjournal-b632c.firebasestorage.app",
  messagingSenderId: "153737354575",
  appId: "1:153737354575:web:9e558e4725fe9ab1d4393a",
  measurementId: "G-MPBH4LETNF"
};

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

// Called by main.js after loadData() and loadLedgerData() finish.
function cloudMarkReady() {
  localDataReady = true;
  if (cloudUser) cloudPull();
}

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

function cloudInit() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK did not load; running without sign-in.');
    renderCloudBar();
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    cloudAuth = firebase.auth();
    cloudDb = firebase.firestore();
    cloudAuth.onAuthStateChanged(user => {
      cloudUser = user || null;
      renderCloudBar();
      if (cloudUser && localDataReady) cloudPull();
    });
  } catch (e) {
    console.error('cloud init failed', e);
    renderCloudBar();
  }
}

async function cloudSignIn() {
  if (!cloudAuth) return;
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await cloudAuth.signInWithPopup(provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      if (e.code === 'auth/popup-blocked') return cloudAuth.signInWithRedirect(provider);
      return;
    }
    console.error('sign-in failed', e);
    showToast(e.code === 'auth/operation-not-allowed'
      ? 'Google sign-in is not turned on in Firebase yet'
      : 'Sign-in failed: ' + (e.message || e.code));
  }
}

async function cloudSignOut() {
  if (!cloudAuth) return;
  try { await cloudAuth.signOut(); showToast('Signed out. Data stays in this browser.'); }
  catch (e) { showToast('Sign-out failed'); }
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

// Small sign-in control, bottom-left corner.
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
  const btn = document.createElement('button');
  btn.style.cssText = 'border:0;border-radius:999px;padding:5px 10px;cursor:pointer;font:inherit;background:#4f7cff;color:#fff';
  if (!cloudAuth) {
    label.textContent = 'Cloud sync off';
    bar.append(label);
    return;
  }
  if (cloudUser) {
    label.textContent = (cloudUser.email || 'Signed in') + ' · synced';
    btn.textContent = 'Sign out';
    btn.addEventListener('click', cloudSignOut);
  } else {
    label.textContent = 'Local only';
    btn.textContent = 'Sign in with Google';
    btn.addEventListener('click', cloudSignIn);
  }
  bar.append(label, btn);
}

cloudInit();
