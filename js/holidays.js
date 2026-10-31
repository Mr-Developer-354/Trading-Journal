// ======================================================================
// holidays.js — the Market holidays page.
// data/nse-holidays.json is refreshed every week from NSE by a GitHub Action (scripts/fetch-nse-holidays.mjs).
// "Sync holidays" copies that list into the signed-in user's database: journals/{uid}/holidays/{yyyy-mm-dd}.
// The page reads the database; when it is empty it says so, and the Sync button fills it.
// ======================================================================
const HOL_FILE = 'data/nse-holidays.json';
const HOL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function holDbRef() {
  if (!cloudUser || !cloudDb) return null;
  return cloudDb.collection('journals').doc(cloudUser.uid).collection('holidays');
}

async function holLoadFile() {
  const res = await fetch(HOL_FILE + '?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('holiday file not found');
  return res.json();
}

function holFmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function holRowsHtml(list) {
  return list.map(h => {
    const d = new Date(h.date + 'T00:00:00');
    const day = h.day || (isNaN(d) ? '' : HOL_DAYS[d.getDay()]);
    return `<tr><td>${ escapeHtml(holFmtDate(h.date)) }</td><td>${ escapeHtml(day) }</td><td>${ escapeHtml(h.name || '') }</td><td>${ escapeHtml((h.segments || []).join(', ')) }</td></tr>`;
  }).join('');
}

async function renderHolidays() {
  const status = document.getElementById('holStatus');
  const rows = document.getElementById('holRows');
  const empty = document.getElementById('holEmpty');
  const ref = holDbRef();
  if (!ref) {
    status.textContent = 'Sign in to keep holidays in your database';
    rows.innerHTML = '';
    empty.hidden = false;
    return;
  }
  try {
    const snap = await ref.get();
    const list = snap.docs.map(d => d.data()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    rows.innerHTML = holRowsHtml(list);
    empty.hidden = list.length > 0;
    const synced = list.map(h => h.syncedAt).filter(Boolean).sort().pop();
    status.textContent = list.length
      ? `${ list.length } holidays${ synced ? ' · synced ' + new Date(synced).toLocaleDateString('en-GB') : '' }`
      : 'Not synced yet';
  } catch (e) {
    console.error('holidays load failed', e);
    status.textContent = 'Could not load holidays';
  }
}

async function syncHolidays() {
  const btn = document.getElementById('holSyncBtn');
  const ref = holDbRef();
  if (!ref) { showToast('Sign in to sync holidays'); return; }
  btn.disabled = true;
  try {
    const file = await holLoadFile();
    const list = Array.isArray(file.holidays) ? file.holidays : [];
    if (!list.length) { showToast('The holiday file is empty; it has not been fetched from NSE yet'); return; }
    const records = list.map(h => ({
      id: h.date,
      data: { date: h.date, day: h.day || '', name: h.name || '', segments: h.segments || [], syncedAt: file.fetchedAt || new Date().toISOString() }
    }));
    await cloudReplace(ref, records);
    showToast(`Synced ${ records.length } holidays`);
    await renderHolidays();
  } catch (e) {
    console.error('holiday sync failed', e);
    showToast('Holiday sync failed: ' + (e.message || 'unknown error'));
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('holSyncBtn').addEventListener('click', syncHolidays);
document.querySelector('.nav button[data-view="holidays"]').addEventListener('click', () => renderHolidays());
