// ======================================================================
// import-excel.js — Import an Excel workbook (one sheet per broker)
// into the Ledger or the Trade Log. Needs SheetJS (loaded in index.html).
// ======================================================================
const XLSX_SKIP_SHEETS = /^(instructions?|readme|legend|notes?)$/i;
const XLSX_DATE_FIELDS = ['DATE','Date','date','EntryDate']; // EntryDate kept for backward-compatible imports; ExitDate is no longer supported
const XLSX_TIME_FIELDS = ['EntryTime','ExitTime','entryTime','exitTime'];
const LEDGER_NUM_FIELDS = ['Brokerage','Exchange','IPFT','SEBI','Sebi','IGST','STT','Stamp','SqrOff','Square','DPChgs','DP-Chr.','Taxable','Credit','Fyers Cr.','Debit','Fyers Dr.','Balance','Fyers Balance','DailyTA','Daily Balance'];
const TRADE_NUM_FIELDS = ['Qty','qty','EntryPrice','entry','Stoploss','sl','ExitPrice','exit','Strike','strike','ExpChgs','expCha'];
const REMOVED_TRADE_IMPORT_KEYS = ['EstCharges','NetPLAfterCharges','estCharges','netPLAfterCharges','Est. Charges','Net P/L','Net P/L '];

const TRADE_CHARGE_FIELDS = []; // legacy charge-component columns are no longer stored

function xlsxPad(n) { return String(n).padStart(2, '0'); }
function xlsxIsoDate(v) {
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) return `${v.getFullYear()}-${xlsxPad(v.getMonth() + 1)}-${xlsxPad(v.getDate())}`;
  if (typeof v === 'number') {                       // Excel serial date
    const p = XLSX.SSF.parse_date_code(v);
    return p ? `${p.y}-${xlsxPad(p.m)}-${xlsxPad(p.d)}` : '';
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${xlsxPad(m[2])}-${xlsxPad(m[3])}`;
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);   // dd-mm-yyyy (Indian order)
  if (m) return `${m[3]}-${xlsxPad(m[2])}-${xlsxPad(m[1])}`;
  const d = new Date(s);
  return isNaN(d) ? '' : xlsxIsoDate(d);
}
function xlsxTime(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'number') {
    const secs = Math.round((v % 1) * 86400);
    return `${xlsxPad(Math.floor(secs / 3600) % 24)}:${xlsxPad(Math.floor(secs / 60) % 60)}:${xlsxPad(secs % 60)}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${xlsxPad(m[1])}:${m[2]}:${m[3] || '00'}` : s;
}
function xlsxNum(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[,₹\s]/g, ''));
  return isNaN(n) ? undefined : n;
}
function xlsxBrokerName(sheetName) {
  const name = sheetName.trim();
  const known = [...LEDGER_BROKERS, ...brokerNamesIn(trades), ...brokerNamesIn(ledgers)];
  return known.find(b => b.toLowerCase() === name.toLowerCase()) || name;
}
// Read every broker sheet: returns [{ broker, rows:[{header: value}] }]
const xlsxBlankRow = row => Object.values(row).every(v => v === '' || v === null || v === undefined);
function readBrokerSheets(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  return wb.SheetNames.filter(n => !XLSX_SKIP_SHEETS.test(n.trim())).map(n => {
    // Blank rows in the middle are kept (the Ledger matches rows by position); trailing blank rows are dropped.
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true, blankrows: true });
    while (rows.length && xlsxBlankRow(rows[rows.length - 1])) rows.pop();
    return { broker: xlsxBrokerName(n), rows };
  }).filter(s => s.rows.length);
}
function cleanRow(row, numFields) {
  const rec = {};
  Object.keys(row).forEach(k => {
    const key = k.trim();
    if (key === 'ExitDate' || key === 'exitDate') return;
    // Est. Charges / Net P/L columns are no longer part of the Trade database: ignore them in old files
    if (REMOVED_TRADE_IMPORT_KEYS.includes(key)) return;
    let v = row[k];
    if (v === '' || v === null || v === undefined) return;
    if (XLSX_DATE_FIELDS.includes(key)) v = xlsxIsoDate(v);
    else if (XLSX_TIME_FIELDS.includes(key)) v = xlsxTime(v);
    else if (numFields.includes(key)) v = xlsxNum(v);
    else if ((key === 'expiry' || key === 'Expiry') && (typeof v === 'number' || v instanceof Date)) {
      const iso = xlsxIsoDate(v);
      const d = iso ? iso.split('-') : null;
      v = d ? `${d[2]}-${MONTH_NAMES[Number(d[1]) - 1]}-${d[0]}` : String(v);
    } else if (typeof v !== 'number') v = String(v).trim();
    if (v === undefined || v === '') return;
    rec[key] = v;
  });
  return rec;
}
function r2(n) { return Math.round(n * 1e6) / 1e6; }

/* ---------------- Deleted-record import protection ---------------- */
function readDeletedKeys(storageKey) {
  try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch (_) { return new Set(); }
}
function writeDeletedKeys(storageKey, keys) {
  try { localStorage.setItem(storageKey, JSON.stringify([...keys])); } catch (_) {}
}
function rememberDeletedRecord(storageKey, keys) {
  const set = readDeletedKeys(storageKey);
  keys.filter(Boolean).forEach(k => set.add(k));
  writeDeletedKeys(storageKey, set);
}
function forgetDeletedRecord(storageKey, keys) {
  const set = readDeletedKeys(storageKey);
  keys.filter(Boolean).forEach(k => set.delete(k));
  writeDeletedKeys(storageKey, set);
}
function tradeDeletedKeys(t) {
  return [
    tradeIdentity(t),
    `DAY|${[t.broker, t.date, t.symbol].map(v => v ?? '').join('|')}`,
    t.id !== undefined && t.id !== null && t.id !== '' ? `ID|${t.id}` : ''
  ];
}
function ledgerDeletedKeys(r) {
  return [`SLOT|${[r.broker, r.DATE].map(v => v ?? '').join('|')}`];
}

/* ---------------- Review helpers ---------------- */
// Two kinds of rows are never written silently. The person is asked instead:
//  1. changed date: matches an existing row in everything EXCEPT the date
//     -> change the date of the existing row / add as new / skip
//  2. same slot (Ledger only: same broker + same date as an existing row) but different data
//     -> no extra row is added; choose whose data is right: keep the app's or use the file's
const SLOT_SKIP_FIELDS = ['id', 'broker'];
function sameValue(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  return String(a ?? '') === String(b ?? '');
}
// Fields the file provides that differ from what is stored (blank cells in the file are not differences)
function diffFields(cur, rec) {
  return Object.keys(rec).filter(k => !SLOT_SKIP_FIELDS.includes(k) && !sameValue(cur[k], rec[k]))
    .map(k => ({ field: k, app: cur[k], file: rec[k] }));
}
function findDateChanges(incoming, existing, exactKey, looseKey, dateOf, loose_ok, slotKey, fallbackKey, fillBlanks) {
  // Matching is deliberately based on record identity, not on all data values.
  // Once a row matches an existing row, every supplied field is compared. Any
  // modification is sent to the review dialog instead of silently creating a duplicate.
  const exactMap = new Map();
  existing.forEach(r => {
    const k = exactKey(r);
    if (!exactMap.has(k)) exactMap.set(k, []);
    exactMap.get(k).push(r);
  });
  const incomingKeys = new Set(incoming.map(i => exactKey(i.rec)));
  const pool = {};
  existing.forEach(r => {
    if (incomingKeys.has(exactKey(r))) return;
    if (!loose_ok(r)) return;
    (pool[looseKey(r)] = pool[looseKey(r)] || []).push(r);
  });
  const slots = {};
  if (slotKey) existing.forEach(r => { const k = slotKey(r); if (!(k in slots)) slots[k] = r; });
  const seen = new Set();
  const plan = { fresh: [], changes: [], conflicts: [], deleted: [], fills: [], dup: 0 };
  const isBlank = v => v === undefined || v === null || v === '';
  // Matched row: blank app fields take the file's value; differing filled fields go to the review dialog.
  const settle = (target, item, diffs, reason) => {
    const fills = fillBlanks ? diffs.filter(d => isBlank(d.app)) : [];
    const conflicts = diffs.filter(d => !fills.includes(d));
    if (fills.length) plan.fills.push({ cur: target, item, diffs: fills });
    if (conflicts.length) plan.conflicts.push({ cur: target, item, diffs: conflicts, reason });
    else if (!fills.length) plan.dup++;
  };

  incoming.forEach(item => {
    const k = exactKey(item.rec);
    const matches = exactMap.get(k) || [];
    const cur = matches.find(r => !seen.has(r)) || null;

    // A row that the user deliberately deleted is not a normal "new" row.
    // If the same row comes back in a later import, require an explicit restore decision.
    const deletedSet = item.deletedSet;
    const deletedKeys = item.deletedKeys || [];
    if (!cur && deletedSet && deletedKeys.some(dk => deletedSet.has(dk))) {
      plan.deleted.push({ item, keys: deletedKeys });
      return;
    }

    if (cur) {
      seen.add(cur);
      settle(cur, item, diffFields(cur, item.rec), 'matched');
      return;
    }

    // Ledger uses one row per broker/date. This catches changes even when the
    // incoming values themselves are different from the stored values.
    if (slotKey) {
      const slot = slots[slotKey(item.rec)];
      if (slot && !seen.has(slot)) {
        seen.add(slot);
        const diffs = diffFields(slot, item.rec);
        if (diffs.length) plan.conflicts.push({ cur: slot, item, diffs, reason: 'slot' });
        else plan.dup++;
        return;
      }
    }

    // If the import changed one of the secondary identity fields (for example
    // exit time), use a unique same-day candidate before considering it a new row.
    if (fallbackKey) {
      const candidates = existing.filter(r => !seen.has(r) && fallbackKey(r) === fallbackKey(item.rec));
      if (candidates.length === 1) {
        const targetRow = candidates[0];
        seen.add(targetRow);
        settle(targetRow, item, diffFields(targetRow, item.rec), 'fallback');
        return;
      }
    }

    // Same identity except for the date: ask whether the existing row should
    // be moved, duplicated, or skipped.
    const list = loose_ok(item.rec) ? (pool[looseKey(item.rec)] || []).filter(r => !seen.has(r)) : [];
    if (list.length) {
      const target = new Date(dateOf(item.rec)).getTime();
      list.sort((x, y) => Math.abs(new Date(dateOf(x)) - target) - Math.abs(new Date(dateOf(y)) - target));
      const targetRow = list.shift();
      seen.add(targetRow);
      const diffs = diffFields(targetRow, item.rec).filter(d => d.field !== 'DATE' && d.field !== 'date');
      const fills = fillBlanks ? diffs.filter(d => isBlank(d.app)) : [];
      const conflicts = diffs.filter(d => !fills.includes(d));
      if (fills.length) plan.fills.push({ cur: targetRow, item, diffs: fills });
      if (conflicts.length) plan.conflicts.push({ cur: targetRow, item, diffs: conflicts, reason: 'date-and-data' });
      else plan.changes.push({ existing: targetRow, item });
      return;
    }

    plan.fresh.push(item);
    if (slotKey) slots[slotKey(item.rec)] = item.rec;
  });
  return plan;
}
function daysBetween(a, b) {
  const d = Math.round((new Date(b) - new Date(a)) / 86400000);
  return isNaN(d) ? '' : (d > 0 ? `+${d}d` : `${d}d`);
}
function fmtCell(v) {
  if (v === undefined || v === null || v === '') return '(blank)';
  return typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
}
// Shows the review dialog. Resolves to { changes: [...], conflicts: [...] } (one choice per row) or null if cancelled.
function reviewImport({ label, plan, columns, cellsOf, dateOf }) {
  return new Promise(resolve => {
    const nC = plan.changes.length, nX = plan.conflicts.length, nD = plan.deleted.length;
    const changeRows = plan.changes.map((c, i) => `<tr>
      <td>${escapeHtml(c.item.broker)}</td>
      ${cellsOf(c.existing).map(v => `<td>${escapeHtml(v)}</td>`).join('')}
      <td class="imp-date"><span class="imp-old">${escapeHtml(dateOf(c.existing))}</span> → <span class="imp-new">${escapeHtml(dateOf(c.item.rec))}</span> <em>${daysBetween(dateOf(c.existing), dateOf(c.item.rec))}</em></td>
      <td><select class="imp-choice" data-sec="changes" data-i="${i}">
        <option value="update">Change date of existing</option>
        <option value="new">Add as new ${label}</option>
        <option value="skip">Skip</option>
      </select></td></tr>`).join('');
    const deletedRows = plan.deleted.map((c, i) => `<tr>
      <td>${escapeHtml(c.item.broker)}</td>
      <td>${escapeHtml(dateOf(c.item.rec))}</td>
      <td>${cellsOf(c.item.rec).map(v => escapeHtml(v)).join(' · ')}</td>
      <td><select class="imp-choice" data-sec="deleted" data-i="${i}">
        <option value="skip">Keep deleted</option>
        <option value="restore">Restore from file</option>
      </select></td></tr>`).join('');
    const conflictRows = plan.conflicts.map((c, i) => `<tr>
      <td>${escapeHtml(c.item.broker)}</td>
      <td>${escapeHtml(dateOf(c.item.rec))}</td>
      <td class="imp-diffs">${c.diffs.map(d => `<div><b>${escapeHtml(dbHeaderOf(d.field))}</b> <span class="imp-old">${escapeHtml(fmtCell(d.app))}</span> <small>app</small> · <span class="imp-new">${escapeHtml(fmtCell(d.file))}</span> <small>file</small></div>`).join('')}</td>
      <td><select class="imp-choice" data-sec="conflicts" data-i="${i}">
        <option value="keep">Keep app's data</option>
        <option value="file">Use file's data</option>
      </select></td></tr>`).join('');
    const bulk = (sec, opts) => `<span class="imp-bulk">Set all:
      ${opts.map(([v, t]) => `<button type="button" class="btn small ghost" data-sec="${sec}" data-all="${v}">${t}</button>`).join('')}</span>`;
    const section = (title, note, head, rows, sec, opts) => `<div class="imp-section">
      <div class="imp-sec-head"><div><h4>${title}</h4><p>${note}</p></div>${bulk(sec, opts)}</div>
      <table class="imp-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    const plural = n => n === 1 ? '' : 's';
    const titleParts = [];
    if (nX) titleParts.push(`${nX} ${label} row${plural(nX)} conflict${nX === 1 ? 's' : ''} with existing data`);
    if (nD) titleParts.push(`${nD} ${label} row${plural(nD)} were previously deleted`);
    if (nC) titleParts.push(`${nC} ${label} row${plural(nC)} exist${nC === 1 ? 's' : ''} with a different date`);
    const el = document.createElement('div');
    el.className = 'imp-backdrop';
    el.innerHTML = `<div class="imp-dialog panel" role="dialog" aria-modal="true" aria-labelledby="impTitle">
      <div class="imp-head">
        <h3 id="impTitle">${titleParts.join(' · ')}</h3>
        <p>Nothing is changed until you apply. ${label === 'ledger' ? `Ledger dates come from the Trade Log: <b>${plan.fresh.length}</b> new row${plural(plan.fresh.length)} (only dates that have a trade for that broker are added), <b>${plan.dup}</b> already there (skipped).` : `Also in this file: <b>${plan.fresh.length}</b> new row${plural(plan.fresh.length)} to add, <b>${plan.dup}</b> already there (skipped).`}</p>
      </div>
      <div class="imp-body">
        ${nD ? section('Previously deleted rows',
            'These entries were deleted in the app. They will not be restored automatically. Choose whether to restore each one from this file.',
            '<th>Broker</th><th>Date</th><th>Row</th><th>Action</th>', deletedRows, 'deleted',
            [['skip', 'Keep deleted'], ['restore', 'Restore']]) : ''}
        ${nX ? section('Same broker and date, different data',
            'Only one row is kept per broker per day, so no extra row is added. Pick which data is right (only the fields that differ are shown; the file\'s values are laid over the existing row).',
            '<th>Broker</th><th>Date</th><th>What differs</th><th>Keep</th>', conflictRows, 'conflicts',
            [['keep', 'Keep app\'s'], ['file', 'Use file\'s']]) : ''}
        ${nC ? section('Same data, different date',
            'These match an existing entry in everything except the date.',
            `<th>Broker</th>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}<th>Date (app → file)</th><th>Action</th>`, changeRows, 'changes',
            [['update', 'Change dates'], ['new', 'Add as new'], ['skip', 'Skip']]) : ''}
      </div>
      <div class="imp-foot">
        <span class="imp-spacer"></span>
        <button type="button" class="btn ghost" id="impCancel">Cancel import</button>
        <button type="button" class="btn primary" id="impApply">Apply &amp; import</button>
      </div></div>`;
    document.body.appendChild(el);
    const done = v => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    el.querySelectorAll('[data-all]').forEach(b => b.addEventListener('click', () =>
      el.querySelectorAll(`.imp-choice[data-sec="${b.dataset.sec}"]`).forEach(sel => { sel.value = b.dataset.all; })));
    el.querySelector('#impCancel').addEventListener('click', () => done(null));
    el.querySelector('#impApply').addEventListener('click', () => {
      const pick = sec => [...el.querySelectorAll(`.imp-choice[data-sec="${sec}"]`)].map(sel => sel.value);
      done({ changes: pick('changes'), conflicts: pick('conflicts'), deleted: pick('deleted') });
    });
  });
}

/* ---------------- Shared: same formulas + same refresh as a manually added row ---------------- */
// Manual "Log trade" recalculates expected charges from the current Brokerage & Charges settings (and upper-cases
// the symbol). Imported trades keep the ExpChgs written in the file: the workbook is the record, and the table must
// show exactly what the file says. The settings only fill in ExpChgs when the file leaves that cell blank.
function applyTradeFormulas(rec) {
  rec.symbol = String(rec.symbol || '').toUpperCase().trim();
  if (rec.expCha === undefined && typeof expectedChargesForTrade === 'function') {
    const calculated = expectedChargesForTrade(rec);
    if (calculated !== null) rec.expCha = calculated;
  }
  return rec;
}
// Trade Log and Ledger are linked (Ledger Pay In/Out and Net P/L come from the Trade Log, charges and balances
// come from the Ledger), so after ANY import every view is rebuilt the same way, whichever file was imported.
function refreshAfterImport() {
  ledgerPayInOutCalcCache = null;
  populateBrokerFilter(); populateLedgerFilters();
  if (typeof populateCalendarBrokerFilter === 'function') populateCalendarBrokerFilter();
  renderTrades(); renderLedger(); renderDashboard(); renderReports(); renderRisk(); renderBrokers();
  if (typeof renderCalendar === 'function') renderCalendar();
}

/* ---------------- Ledger ---------------- */
const ledgerExactKey = r => [r.broker, r.DATE].map(v => v ?? '').join('|');
// "Same data, different date" must mean the SAME DATA: the loose key is the broker plus every stored value
// except the date and the derived fields. (It used to be the broker alone, so every new day for a broker that
// already had rows was paired with its nearest existing day as a conflict, and was skipped by default.)
const LEDGER_LOOSE_SKIP = ['id', 'broker', 'DATE', ...LEDGER_REMOVED_KEYS];
const ledgerDataKeys = r => Object.keys(r).filter(k => !LEDGER_LOOSE_SKIP.includes(k) && r[k] !== undefined && r[k] !== '').sort();
const ledgerLooseKey = r => [r.broker ?? '', ...ledgerDataKeys(r).map(k => `${k}=${r[k]}`)].join('|');
// a row with no amounts has nothing to recognise it by, so it is never treated as a "changed date" match
const ledgerLooseOk = r => !!r.broker && ledgerDataKeys(r).length > 0;

function planLedgerImport(sheets) {
  let bad = 0;
  const incoming = [];
  sheets.forEach(sh => {
    // Rows are matched to the Trade Log by their Date. A row with no Date falls back to its position: the n-th row of the
    // sheet is the n-th unique Trade Log date of this broker (ledgerDateIndex, built in js/ledger.js).
    const dates = ledgerDateIndex.get(ledgerBrokerKey(sh.broker)) || [];
    sh.rows.forEach((row, i) => {
      const cleaned = cleanRow(row, LEDGER_NUM_FIELDS);
      const hasDateCol = ['Date', 'DATE', 'date'].some(k => cleaned[k]);
      if (!hasDateCol) {
        if (!Object.keys(cleaned).length) return;        // an empty row leaves that day untouched
        if (!dates[i]) { bad++; return; }                 // more rows than this broker has trade dates
        cleaned.Date = dates[i];
      }
      const rec = legacyLedgerRecord(cleaned);
      if (!rec.DATE) { bad++; return; }
      delete rec.id; delete rec.broker;
      LEDGER_REMOVED_KEYS.forEach(k => delete rec[k]);   // Day / PayInOut / RealChgs / NetPL in a file are ignored: the app calculates them
      rec.broker = sh.broker;
      incoming.push({ rec, broker: sh.broker, deletedSet: readDeletedKeys(DELETED_LEDGER_KEY), deletedKeys: ledgerDeletedKeys(rec) });
    });
  });
  const plan = findDateChanges(incoming, ledgers, ledgerExactKey, ledgerLooseKey, r => r.DATE, ledgerLooseOk,
    r => `${r.broker}|${r.DATE}`);
  plan.bad = bad;
  return plan;
}
function applyLedgerImport(plan, decisions) {
  // Ledger dates are calculated from the Trade Log, so a row is only added for a date that has a trade for that broker
  // (this is also how the ledger is refilled after a reset). Anything else, and "change the date" requests, is skipped.
  decisions = decisions || { changes: [], conflicts: [], deleted: [] };
  const tradeDates = ledgerTradeDates();
  const inTradeLog = rec => !!(tradeDates.get(ledgerBrokerKey(rec.broker)) || new Set()).has(rec.DATE);
  const nextNo = {};
  ledgers.forEach(r => {
    const m = String(r.id || '').match(/^L-(.+)-(\d+)$/);
    if (m) nextNo[m[1]] = Math.max(nextNo[m[1]] || 0, Number(m[2]));
  });
  const toAdd = plan.fresh.slice();
  plan.deleted.forEach((c, i) => {
    if (decisions.deleted[i] === 'restore') { toAdd.push(c.item); forgetDeletedRecord(DELETED_LEDGER_KEY, c.keys); }
  });
  let skipped = plan.changes.length + plan.deleted.filter((c, i) => decisions.deleted[i] !== 'restore').length;
  let replaced = 0;
  plan.conflicts.forEach((c, i) => {
    if (decisions.conflicts[i] === 'file' && c.reason !== 'date-and-data') {   // lay the file's values over the one row for that day
      Object.keys(c.item.rec).forEach(k => { if (!SLOT_SKIP_FIELDS.includes(k) && k !== 'DATE') c.cur[k] = c.item.rec[k]; });
      replaced++;
    } else skipped++;
  });
  let added = 0;
  const perBroker = {};
  toAdd.forEach(({ rec, broker }) => {
    if (!inTradeLog(rec)) { skipped++; return; }
    nextNo[broker] = (nextNo[broker] || 0) + 1;
    ledgers.push(Object.assign({ id: `L-${broker}-${nextNo[broker]}` }, rec));
    perBroker[broker] = (perBroker[broker] || 0) + 1;
    added++;
  });
  if (added || replaced) { saveLedgerData(); ledgerPage = 1; refreshAfterImport(); }
  return { added, updated: 0, replaced, dup: plan.dup, bad: plan.bad, skipped, deleted: 0, perBroker };
}
async function importLedgerSheets(sheets) {
  const plan = planLedgerImport(sheets);
  let decisions = null;
  if (plan.changes.length || plan.conflicts.length || plan.deleted.length) {
    decisions = await reviewImport({
      label: 'ledger', plan,
      columns: ['DailyTA'],
      cellsOf: r => [r['Daily Balance']].map(v => v === undefined ? '' : (typeof v === 'number' ? v.toFixed(2) : v)),
      dateOf: r => r.DATE
    });
    if (!decisions) return null;
  }
  return applyLedgerImport(plan, decisions);
}

/* ---------------- Trade log ---------------- */
function buildTradeFromRow(row, broker) {
  const rec = legacyTradeRecord(cleanRow(row, TRADE_NUM_FIELDS));
  if (!rec.date || !rec.symbol) return null;
  delete rec.id; delete rec.side;
  rec.symbol = String(rec.symbol).toUpperCase();
  rec.broker = broker;
  TRADE_CHARGE_FIELDS.concat('expCha').forEach(k => { if (typeof rec[k] === 'number') rec[k] = -Math.abs(rec[k]); });
  rec.optType = normaliseTradeType(rec.optType);
  const hasOpt = ['CE', 'PE', 'FUT'].includes(rec.optType) || rec.strike !== undefined || rec.expiry;
  rec.segment = normaliseSegment(rec.segment) || (hasOpt ? 'Equity' : 'Capital');
  if (rec.product) rec.product = normaliseProduct(rec.product) || rec.product;
  rec.exchange = normaliseExchange(rec.exchange);
  // Imported trades are new entries too: calculate expCha from the shared
  // Brokerage & Charges engine when the spreadsheet did not already provide it.
  if (rec.expCha === undefined && typeof expectedChargesForTrade === 'function') {
    const calculated = expectedChargesForTrade(rec);
    if (calculated !== null) rec.expCha = r2(calculated);
  }
  return rec;
}
const tradeIdentity = t => [t.broker, t.symbol, t.entryTime, t.exitTime, t.segment, t.expiry, t.strike, t.optType].map(v => v ?? '').join('|');
// Match on the trade's identity and date. Stored Ids are not used here: an imported row has no Id, so keying on the Id
// meant that seeded trades never matched their own workbook row.
const tradeExactKey = t => [tradeIdentity(t), t.date].join('|');
const tradeLooseKey = t => tradeIdentity(t);
const tradeLooseOk = t => !!t.symbol;

function planTradeImport(sheets) {
  let bad = 0;
  const incoming = [];
  sheets.forEach(sh => sh.rows.forEach(row => {
    if (xlsxBlankRow(row)) return;                  // blank rows are only kept for the Ledger's positional matching
    const rec = buildTradeFromRow(row, sh.broker);
    if (!rec) { bad++; return; }
    incoming.push({ rec, broker: sh.broker, deletedSet: readDeletedKeys(DELETED_TRADE_KEY), deletedKeys: tradeDeletedKeys(rec) });
  }));
  const plan = findDateChanges(incoming, trades, tradeExactKey, tradeLooseKey, t => t.date, tradeLooseOk, null, t => [t.broker, t.date, t.symbol].map(v => v ?? '').join('|'), true);
  plan.bad = bad;
  return plan;
}
function planTradeRecords(records) {
  const deletedSet = readDeletedKeys(DELETED_TRADE_KEY);
  const incoming = records.filter(r => r && r.date && r.symbol).map(rec => ({ rec, broker: rec.broker || 'Imported', deletedSet, deletedKeys: tradeDeletedKeys(rec) }));
  const plan = findDateChanges(incoming, trades, tradeExactKey, tradeLooseKey, t => t.date, tradeLooseOk, null, t => [t.broker, t.date, t.symbol].map(v => v ?? '').join('|'), true);
  plan.bad = records.length - incoming.length;
  return plan;
}
function applyTradeImport(plan, decisions) {
  decisions = decisions || { changes: [], conflicts: [], deleted: [] };
  const toAdd = plan.fresh.slice();
  plan.deleted.forEach((c, i) => {
    if (decisions.deleted[i] === 'restore') { toAdd.push(c.item); forgetDeletedRecord(DELETED_TRADE_KEY, c.keys); }
  });
  let updated = 0, skipped = 0;
  let filled = 0, overwritten = 0;
  (plan.fills || []).forEach(f => {                       // blank app fields: take the file's value
    f.diffs.forEach(d => { f.cur[d.field] = d.file; });
    filled++;
  });
  (plan.conflicts || []).forEach((c, i) => {              // filled app fields that differ: only when "Use file's data" is chosen
    if (decisions.conflicts && decisions.conflicts[i] === 'file') {
      c.diffs.forEach(d => { c.cur[d.field] = d.file; });
      overwritten++;
    }
  });
  plan.changes.forEach((c, i) => {
    const d = decisions.changes[i];
    if (d === 'update') { c.existing.date = c.item.rec.date; updated++; }
    else if (d === 'new') toAdd.push(c.item);
    else skipped++;
  });
  let added = 0;
  const perBroker = {};
  toAdd.forEach(({ rec, broker }) => {
    rec.id = nextId();
    applyTradeFormulas(rec);
    trades.push(sanitizeTradeRecord(rec));
    perBroker[broker] = (perBroker[broker] || 0) + 1;
    added++;
  });
  if (added || updated || filled || overwritten) {
    saveData();
    refreshAfterImport();
  }
  const deleted = plan.deleted.filter((c, i) => decisions.deleted[i] !== 'restore').length;
  skipped += deleted;
  return { added, updated, filled, overwritten, dup: plan.dup, bad: plan.bad, skipped, deleted, perBroker };
}
async function importTradeSheets(sheets) {
  const plan = planTradeImport(sheets);
  let decisions = null;
  if (plan.changes.length || plan.conflicts.length || plan.deleted.length) {
    decisions = await reviewImport({
      label: 'trade', plan,
      columns: ['Symbol', 'Qty', 'EntryPrice', 'ExitPrice', 'EntryTime'],
      cellsOf: t => [t.symbol, t.qty, t.entry, t.exit, t.entryTime],
      dateOf: t => t.date
    });
    if (!decisions) return null;
  }
  return applyTradeImport(plan, decisions);
}

/* ---------------- Buttons ---------------- */
function summarise(label, res) {
  if (!res) return showToast('Import cancelled. Nothing was changed');
  if (!res.added && !res.updated && !res.replaced && !res.dup && !res.skipped) return showToast(`No valid ${label} rows found in that file`);
  const parts = Object.entries(res.perBroker).map(([b, n]) => `${b} ${n}`).join(', ');
  const extra = [res.updated ? `${res.updated} date${res.updated === 1 ? '' : 's'} changed` : '',
                 res.filled ? `${res.filled} row${res.filled === 1 ? '' : 's'} filled in` : '',
                 res.overwritten ? `${res.overwritten} row${res.overwritten === 1 ? '' : 's'} updated from file` : '',
                 res.replaced ? `${res.replaced} updated from file` : '',
                 res.dup ? `${res.dup} already there` : '',
                 res.skipped ? `${res.skipped} left as is` : '',
                 res.deleted ? `${res.deleted} kept deleted` : '',
                 res.bad ? `${res.bad} skipped` : ''].filter(Boolean).join(', ');
  showToast(`Imported ${res.added} ${label} row${res.added === 1 ? '' : 's'}${parts ? ` (${parts})` : ''}${extra ? ` · ${extra}` : ''}`);
}
function wireExcelImport(buttonId, inputId, handler, label) {
  const btn = document.getElementById(buttonId), input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { showToast('Excel reader could not load. Check your internet connection.'); return; }
    input.click();
  });
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const sheets = readBrokerSheets(reader.result);
        summarise(label, await handler(sheets));
      } catch (err) {
        console.error(err);
        showToast('Could not read that Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
wireExcelImport('importLedgerXlsx', 'importLedgerXlsxFile', importLedgerSheets, 'ledger');
wireExcelImport('importTradesXlsx', 'importTradesXlsxFile', importTradeSheets, 'trade');
