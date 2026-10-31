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

// Today's market status in India (NSE): closed on weekends and on a listed holiday, otherwise open
// (the trading session runs 09:15 to 15:30 IST).
async function holShowToday(dbDates) {
  const el = document.getElementById('holToday');
  if (!el) return;
  const iso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });   // YYYY-MM-DD in India
  const dow = new Date(iso + 'T12:00:00').getDay();
  let file = [];
  try { file = (await holLoadFile()).holidays || []; } catch (e) { file = []; }
  const hit = file.find(h => h.date === iso) || (dbDates || []).find(h => h.date === iso);
  let text, cls;
  if (dow === 0 || dow === 6) { text = 'Market closed today (weekend)'; cls = 'closed'; }
  else if (hit) { text = `Market closed today: ${ hit.name || 'holiday' }`; cls = 'closed'; }
  else {
    const t = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    const open = t >= '09:15' && t < '15:30';
    text = open ? 'Market open now (until 15:30 IST)' : 'Market open today (session 09:15 to 15:30 IST)';
    cls = 'open';
  }
  el.textContent = text;
  el.className = 'hol-today ' + cls;
}

function holFmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function holRowsHtml(list) {
  return list.map(h => {
    const d = new Date(h.date + 'T00:00:00');
    const day = h.day || (isNaN(d) ? '' : HOL_DAYS[d.getDay()]);
    const seg = h.source === 'manual' ? 'Added by you' : (h.segments || []).join(', ');
    const remove = h.source === 'manual' ? `<button class="btn small hol-remove" data-date="${ escapeHtml(h.date) }" type="button">Remove</button>` : '';
    return `<tr><td>${ escapeHtml(holFmtDate(h.date)) }</td><td>${ escapeHtml(day) }</td><td>${ escapeHtml(h.name || '') }</td><td>${ escapeHtml(seg) }</td><td>${ remove }</td></tr>`;
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
    holShowToday(list);
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
    const now = new Date().toISOString();
    const existing = await ref.get();
    const manual = new Set(existing.docs.filter(d => d.data().source === 'manual').map(d => d.id));
    const ops = [];
    list.forEach(h => {
      if (manual.has(h.date)) return;   // a date you added yourself is kept as it is
      ops.push({ set: true, ref: ref.doc(h.date), data: { date: h.date, day: h.day || '', name: h.name || '', segments: h.segments || [], source: 'nse', syncedAt: file.fetchedAt || now } });
    });
    const keep = new Set(list.map(h => h.date));
    existing.docs.forEach(d => {
      if (d.data().source !== 'manual' && !keep.has(d.id)) ops.push({ set: false, ref: d.ref });
    });
    for (let i = 0; i < ops.length; i += 450) {
      const batch = cloudDb.batch();
      ops.slice(i, i + 450).forEach(op => op.set ? batch.set(op.ref, op.data) : batch.delete(op.ref));
      await batch.commit();
    }
    showToast(`Synced ${ list.length } holidays`);
    await renderHolidays();
    loadHolidayCache();
  } catch (e) {
    console.error('holiday sync failed', e);
    showToast('Holiday sync failed: ' + (e.message || 'unknown error'));
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('holSyncBtn').addEventListener('click', syncHolidays);
holShowToday([]);   // the status shows even before signing in, from the holiday file

// Add date: a holiday that is not in the NSE list, saved as "added by you" (Sync never replaces or removes it)
const holForm = document.getElementById('holAddForm');
document.getElementById('holAddBtn').addEventListener('click', () => {
  if (!holDbRef()) { showToast('Sign in to add a date'); return; }
  holForm.hidden = !holForm.hidden;
  if (!holForm.hidden) document.getElementById('holAddDate').focus();
});
document.getElementById('holAddCancel').addEventListener('click', () => { holForm.hidden = true; holForm.reset(); });
holForm.addEventListener('submit', async e => {
  e.preventDefault();
  const ref = holDbRef();
  const date = document.getElementById('holAddDate').value;
  const name = document.getElementById('holAddName').value.trim();
  if (!ref || !date || !name) return;
  const d = new Date(date + 'T00:00:00');
  try {
    await ref.doc(date).set({ date, day: isNaN(d) ? '' : HOL_DAYS[d.getDay()], name, segments: [], source: 'manual', syncedAt: new Date().toISOString() });
    holForm.reset();
    holForm.hidden = true;
    showToast('Date added');
    await renderHolidays();
    loadHolidayCache();
  } catch (err) {
    console.error('add holiday failed', err);
    showToast('Could not add the date');
  }
});
// Remove: only for dates added by you
document.getElementById('holRows').addEventListener('click', async e => {
  const b = e.target.closest('.hol-remove');
  const ref = holDbRef();
  if (!b || !ref) return;
  try {
    await ref.doc(b.dataset.date).delete();
    await renderHolidays();
    loadHolidayCache();
  } catch (err) {
    console.error('remove holiday failed', err);
    showToast('Could not remove the date');
  }
});
document.querySelector('.nav button[data-view="holidays"]').addEventListener('click', () => renderHolidays());

// ---- market status on the Dashboard (open or closed, and why) ----
// Holidays come from the bundled NSE file and from the signed-in user's database (manual dates too).
const HOL_CACHE = { bundled: new Map(), db: new Map() };
async function loadHolidayCache() {
  try {
    const file = await holLoadFile();
    HOL_CACHE.bundled = new Map((file.holidays || []).map(h => [h.date, h.name || 'Holiday']));
  } catch (e) { /* no file yet: the database alone is used */ }
  const ref = holDbRef();
  if (ref) {
    try {
      const snap = await ref.get();
      HOL_CACHE.db = new Map(snap.docs.map(d => [d.data().date, d.data().name || 'Holiday']));
    } catch (e) { console.error('holiday cache failed', e); }
  }
  updateMarketStatus();
}
// the current date, weekday and minute of the day in India (NSE time)
function istNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return { wd: get('weekday'), date: `${ get('year') }-${ get('month') }-${ get('day') }`, mins: Number(get('hour')) * 60 + Number(get('minute')) };
}
// NSE cash market: Monday to Friday, 09:15 to 15:30 IST, except holidays
function marketStatus() {
  const n = istNow();
  if (n.wd === 'Sat' || n.wd === 'Sun') return { open: false, reason: 'Weekend' };
  const hol = HOL_CACHE.db.get(n.date) || HOL_CACHE.bundled.get(n.date);
  if (hol) return { open: false, reason: 'Holiday: ' + hol };
  if (n.mins < 9 * 60 + 15) return { open: false, reason: 'Opens 09:15 IST' };
  if (n.mins >= 15 * 60 + 30) return { open: false, reason: 'Closed at 15:30 IST' };
  return { open: true, reason: 'Open until 15:30 IST' };
}
// the next holiday after today (in India), from the same two lists
function nextHoliday() {
  const today = istNow().date;
  const all = new Map([...HOL_CACHE.bundled, ...HOL_CACHE.db]);
  const next = [...all.keys()].filter(d => d > today).sort()[0];
  return next ? { date: next, name: all.get(next) } : null;
}
function updateMarketStatus() {
  const s = marketStatus();
  const el = document.getElementById('marketStatus');
  if (el) {
    el.className = 'mkt-status ' + (s.open ? 'open' : 'closed');
    el.innerHTML = `<i></i>Market ${ s.open ? 'open' : 'closed' }<span>${ escapeHtml(s.reason) }</span>`;
    el.title = 'NSE trading hours: 09:15 to 15:30 IST, Monday to Friday, except holidays';
  }
  const card = document.getElementById('marketCard');
  if (card) {
    card.classList.toggle('open', s.open);
    card.classList.toggle('closed', !s.open);
    document.getElementById('mktValue').textContent = s.open ? 'Open' : 'Closed';
    document.getElementById('mktReason').textContent = s.reason;
    const nx = nextHoliday();
    document.getElementById('mktNext').textContent = nx ? `Next holiday: ${ holFmtDate(nx.date) } · ${ nx.name }` : 'No holidays listed after today';
  }
}
loadHolidayCache();
setInterval(updateMarketStatus, 30000);
