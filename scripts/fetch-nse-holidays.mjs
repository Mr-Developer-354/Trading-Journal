// ======================================================================
// fetch-nse-holidays.mjs — downloads the NSE trading holiday list and saves it to data/nse-holidays.json.
// Run by .github/workflows/nse-holidays.yml (weekly, or by hand). The journal's Holidays page
// reads that file and stores it in the signed-in user's Firestore database.
// NSE blocks requests from web pages, so this runs on the server side (GitHub Actions).
// Node 20+ (uses the built-in fetch). Exits with an error, and leaves the saved file unchanged, if NSE refuses.
// ======================================================================
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../data/nse-holidays.json', import.meta.url);
const HOME = 'https://www.nseindia.com/';
const API = 'https://www.nseindia.com/api/holiday-master?type=trading';
const REFERER = 'https://www.nseindia.com/resources/exchange-communication-holidays';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
// "26-Jan-2026" -> "2026-01-26"
function isoOf(s) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s || '').trim());
  if (!m || !MONTHS[m[2]]) return null;
  return `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

// NSE expects the cookies it sets on its home page, so fetch that first and keep them
async function cookieHeader() {
  const res = await fetch(HOME, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  return cookies.map(c => c.split(';')[0]).filter(Boolean).join('; ');
}

async function main() {
  const cookie = await cookieHeader();
  const res = await fetch(API, {
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Referer: REFERER, Cookie: cookie }
  });
  if (!res.ok) throw new Error(`NSE returned HTTP ${res.status}`);
  const data = await res.json();

  // one entry per date; the segments (CM, FO, ...) that close on that date are listed together
  const byDate = new Map();
  for (const [segment, rows] of Object.entries(data || {})) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const date = isoOf(r.tradingDate || r.date);
      if (!date) continue;
      const cur = byDate.get(date) || { date, day: r.weekDay || '', name: r.description || '', segments: [] };
      if (!cur.segments.includes(segment)) cur.segments.push(segment);
      if (!cur.name && r.description) cur.name = r.description;
      byDate.set(date, cur);
    }
  }
  if (!byDate.size) throw new Error('NSE returned no holiday rows; the file was not changed');
  const holidays = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  // only rewrite the file when the holidays changed, so the weekly run does not commit noise
  let previous = null;
  try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch (e) { previous = null; }
  if (previous && JSON.stringify(previous.holidays) === JSON.stringify(holidays)) {
    console.log(`No change: ${holidays.length} holidays`);
    return;
  }
  const out = { source: API, sourcePage: REFERER, fetchedAt: new Date().toISOString(), holidays };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Saved ${holidays.length} holidays`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
