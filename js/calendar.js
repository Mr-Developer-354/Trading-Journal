// ======================================================================
// calendar.js — Calendar view: FY / year / month / day P&L heatmap.
// ======================================================================
/* ---------------- calendar ---------------- */
let calCursor = new Date();
let calSelectedDate = new Date().toISOString().slice(0,10);
let calView = 'month';
let calBrokerType = 'all';
function calFilteredTrades() {
  return trades.filter(t => matchesBrokerFilter(t, calBrokerType));
}
function populateCalendarBrokerFilter() {
  calBrokerType = fillBrokerFilter(document.getElementById('calBrokerFilter'), trades);
}

function calDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function calParseDate(s) {
  const [y,m,d] = String(s).split('-').map(Number);
  return new Date(y, (m||1)-1, d||1);
}
function calDayMap() {
  const map = {};
  calFilteredTrades().forEach(t => {
    if (!t.date) return;
    if (!map[t.date]) map[t.date] = { pnl:0, count:0, trades:[] };
    map[t.date].pnl += pnlOf(t);
    map[t.date].count += 1;
    map[t.date].trades.push(t);
  });
  return map;
}
function calYearStats(year, map) {
  const rows = Object.entries(map).filter(([d]) => d.startsWith(`${year}-`));
  const pnl = rows.reduce((a,[,v]) => a+v.pnl,0);
  const count = rows.reduce((a,[,v]) => a+v.count,0);
  const wins = rows.filter(([,v]) => v.pnl > 0).length;
  const losses = rows.filter(([,v]) => v.pnl < 0).length;
  return { pnl, count, days:rows.length, wins, losses };
}
// Indian-style financial year: 1 April through 31 March.
function calFYStartYear(date) {
  const d = date instanceof Date ? date : calParseDate(date);
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}
function calFYStats(startYear, map) {
  const endYear = startYear + 1;
  const rows = Object.entries(map).filter(([d]) => {
    const dt = calParseDate(d);
    return dt >= new Date(startYear,3,1) && dt < new Date(endYear,3,1);
  });
  const pnl = rows.reduce((a,[,v]) => a+v.pnl,0);
  const count = rows.reduce((a,[,v]) => a+v.count,0);
  const wins = rows.filter(([,v]) => v.pnl > 0).length;
  const losses = rows.filter(([,v]) => v.pnl < 0).length;
  return { pnl, count, days:rows.length, wins, losses };
}
function calSetSelected(dateStr, openDay=false) {
  calSelectedDate = dateStr;
  calCursor = calParseDate(dateStr);
  if (openDay) calSetView('day');
  else renderCalendar();
}
function calSetView(view) {
  calView = view;
  document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.toggle('active', b.dataset.calView === view));
  const panels = {
    year: document.getElementById('calYearView'),
    month: document.getElementById('calMonthView'),
    day: document.getElementById('calDayView')
  };
  const panelView = view === 'fy' ? 'year' : view;
  Object.entries(panels).forEach(([key, el]) => {
    if (!el) return;
    const active = key === panelView;
    el.classList.toggle('active', active);
    // Explicit display state prevents preview panels from leaking into
    // another calendar mode when theme/legacy CSS overrides are present.
    el.style.display = active ? 'block' : 'none';
  });
  renderCalendar();
}
function renderCalendar() {
  // Keep exactly one calendar surface visible. This is especially important
  // in Month view: the 12 mini-month previews belong exclusively to Year view.
  const panelMap = {
    year: document.getElementById('calYearView'),
    month: document.getElementById('calMonthView'),
    day: document.getElementById('calDayView')
  };
  const panelView = calView === 'fy' ? 'year' : calView;
  Object.entries(panelMap).forEach(([key, el]) => {
    if (!el) return;
    const active = key === panelView;
    el.classList.toggle('active', active);
    el.style.display = active ? 'block' : 'none';
  });
  const map = calDayMap();
  const currentYear = calCursor.getFullYear();
  const currentMonth = calCursor.getMonth();
  const selected = calParseDate(calSelectedDate);
  const fyStartYear = calFYStartYear(calCursor);
  const periodStats = calView === 'fy'
    ? calFYStats(fyStartYear,map)
    : calView === 'year'
      ? calYearStats(currentYear,map)
      : calView === 'month'
        ? (() => {
            const rows=Object.entries(map).filter(([d])=>d.startsWith(`${currentYear}-${String(currentMonth+1).padStart(2,'0')}-`));
            return { pnl:rows.reduce((a,[,v])=>a+v.pnl,0), count:rows.reduce((a,[,v])=>a+v.count,0), days:rows.length, wins:rows.filter(([,v])=>v.pnl>0).length, losses:rows.filter(([,v])=>v.pnl<0).length };
          })()
        : (map[calSelectedDate] || {pnl:0,count:0,days:0,wins:0,losses:0});
  const filteredTrades = calFilteredTrades();
  const periodTrades = calView === 'day'
    ? filteredTrades.filter(t => String(t.date || '').slice(0,10) === calSelectedDate)
    : filteredTrades.filter(t => {
        const d = String(t.date || '').slice(0,10);
        if (calView === 'fy') {
          const dt = calParseDate(d);
          return dt >= new Date(fyStartYear,3,1) && dt < new Date(fyStartYear+1,3,1);
        }
        return calView === 'year' ? d.startsWith(`${currentYear}-`) : d.startsWith(`${currentYear}-${String(currentMonth+1).padStart(2,'0')}-`);
      });
  const positiveTrades = periodTrades.filter(t => pnlOf(t) > 0).length;
  const negativeTrades = periodTrades.filter(t => pnlOf(t) < 0).length;
  const s = periodStats;
  const label = calView === 'fy'
    ? `FY ${fyStartYear}-${String(fyStartYear+1).slice(-2)}`
    : calView === 'year'
      ? String(currentYear)
      : calView === 'month'
        ? calCursor.toLocaleString(numLocale(),{month:'long',year:'numeric'})
        : selected.toLocaleString(numLocale(),{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  document.getElementById('calMonthLabel').textContent = label;
  document.getElementById('calJumpDay').style.display = calView === 'day' ? 'none' : '';

  const pnlClass = s.pnl > 0 ? 'pos' : s.pnl < 0 ? 'neg' : '';
  const periodUnit = calView === 'day' ? '/Day' : calView === 'month' ? '/Month' : calView === 'fy' ? '/FY' : '/Year';
  // Gross P/L, Trading day and Trades sit inline in the period header, just before the broker filter
  const inline = document.getElementById('calInlineKpis');
  if (inline) inline.innerHTML = `
    <div class="cal-kpi cal-kpi-inline ${pnlClass}"><div class="value">${fmtMoneyPrecise(s.pnl)} <span class="cal-kpi-unit">${periodUnit}</span></div><div class="label">Gross P/L</div></div>
    <div class="cal-kpi cal-kpi-inline"><div class="value">${calView==='day' ? '—' : `${s.days} <span class="cal-kpi-sub">(<span class="cal-count-positive">${s.wins}</span> / <span class="cal-count-negative">${s.losses}</span>)</span>`}</div><div class="label">Trading day</div></div>
    <div class="cal-kpi cal-kpi-inline"><div class="value">${s.count} <span class="cal-kpi-sub">(<span class="cal-count-positive">${positiveTrades}</span> / <span class="cal-count-negative">${negativeTrades}</span>)</span></div><div class="label">Trades</div></div>`;

  if (calView === 'fy') renderCalFY(map,fyStartYear);
  if (calView === 'year') renderCalYear(map,currentYear);
  if (calView === 'month') renderCalMonth(map,currentYear,currentMonth);
  if (calView === 'day') renderCalDay(map,calSelectedDate);
}
function renderCalFY(map, startYear) {
  const el=document.getElementById('calYearView');
  const months=Array.from({length:12},(_,i)=>({year:startYear+(i+3>=12?1:0),month:(i+3)%12}));
  el.innerHTML=`<div class="cal-year cal-fy-year">${months.map(({year,month})=>{
    const name=new Date(year,month,1).toLocaleString(numLocale(),{month:'short'});
    const first=new Date(year,month,1), offset=first.getDay(), days=new Date(year,month+1,0).getDate();
    const rows=Object.entries(map).filter(([d])=>d.startsWith(`${year}-${String(month+1).padStart(2,'0')}-`));
    const pnl=rows.reduce((a,[,v])=>a+v.pnl,0), count=rows.reduce((a,[,v])=>a+v.count,0);
    let daysHtml='';
    for(let i=0;i<offset;i++) daysHtml+='<span></span>';
    const monthMax=Math.max(1,...rows.map(([,v])=>Math.abs(v.pnl)));
    for(let d=1;d<=days;d++){
      const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, info=map[ds];
      const today=ds===calDateStr(new Date());
      const cls=info ? (info.pnl>0?'pos':info.pnl<0?'neg':'trade') : 'flat';
      const intensity=info ? Math.min(4, Math.max(1, Math.ceil(Math.abs(info.pnl)/monthMax*4))) : 0;
      const heat=info && info.pnl>0 ? `g${intensity}` : info && info.pnl<0 ? `l${intensity}` : 'flat';
      daysHtml+=`<button class="cal-mini-day ${info?'trade':''} ${cls} ${heat} ${today?'today':''}" data-date="${ds}">${d}</button>`;
    }
    const isCurrent=month===calCursor.getMonth() && year===calCursor.getFullYear();
    return `<div class="cal-mini ${isCurrent?'current':''}" data-month="${month}" data-year="${year}">
      <div class="cal-mini-head">
        <strong>${name}</strong>
        <b class="cal-mini-net ${pnl>0?'pos':pnl<0?'neg':''}">${fmtMoneyPrecise(pnl)}</b>
        <span class="cal-mini-meta"><b>${rows.length}</b><small>d</small><i>·</i><b>${count}</b><small>t</small></span>
      </div>
      <div class="cal-mini-dows">${['S','M','T','W','T','F','S'].map(x=>`<span>${x}</span>`).join('')}</div>
      <div class="cal-mini-grid">${daysHtml}</div>
    </div>`;
  }).join('')}</div>`;
  el.querySelectorAll('.cal-mini').forEach(card=>card.addEventListener('click',e=>{
    const ds=e.target.dataset.date;
    if(ds){ calSetSelected(ds,true); return; }
    calCursor=new Date(Number(card.dataset.year),Number(card.dataset.month),1); calSetView('month');
  }));
}
function renderCalYear(map, year) {
  const el=document.getElementById('calYearView');
  const monthNames=Array.from({length:12},(_,i)=>new Date(year,i,1).toLocaleString(numLocale(),{month:'short'}));
  el.innerHTML=`<div class="cal-year">${monthNames.map((name,m)=>{
    const first=new Date(year,m,1), offset=first.getDay(), days=new Date(year,m+1,0).getDate();
    const rows=Object.entries(map).filter(([d])=>d.startsWith(`${year}-${String(m+1).padStart(2,'0')}-`));
    const pnl=rows.reduce((a,[,v])=>a+v.pnl,0), count=rows.reduce((a,[,v])=>a+v.count,0);
    let daysHtml='';
    for(let i=0;i<offset;i++) daysHtml+='<span></span>';
    for(let d=1;d<=days;d++){
      const ds=`${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, info=map[ds];
      const today=ds===calDateStr(new Date());
      const cls=info ? (info.pnl>0?'pos':info.pnl<0?'neg':'trade') : 'flat';
      const monthMax=Math.max(1,...rows.map(([,v])=>Math.abs(v.pnl)));
      const intensity=info ? Math.min(4, Math.max(1, Math.ceil(Math.abs(info.pnl)/monthMax*4))) : 0;
      const heat=info && info.pnl>0 ? `g${intensity}` : info && info.pnl<0 ? `l${intensity}` : 'flat';
      daysHtml+=`<button class="cal-mini-day ${info?'trade':''} ${cls} ${heat} ${today?'today':''}" data-date="${ds}">${d}</button>`;
    }
    return `<div class="cal-mini ${m===calCursor.getMonth()?'current':''}" data-month="${m}">
      <div class="cal-mini-head">
        <strong>${name}</strong>
        <b class="cal-mini-net ${pnl>0?'pos':pnl<0?'neg':''}">${fmtMoneyPrecise(pnl)}</b>
        <span class="cal-mini-meta"><b>${rows.length}</b><small>d</small><i>·</i><b>${count}</b><small>t</small></span>
      </div>
      <div class="cal-mini-dows">${['S','M','T','W','T','F','S'].map(x=>`<span>${x}</span>`).join('')}</div>
      <div class="cal-mini-grid">${daysHtml}</div>
    </div>`;
  }).join('')}</div>`;
  el.querySelectorAll('.cal-mini').forEach(card=>card.addEventListener('click',e=>{
    const ds=e.target.dataset.date;
    if(ds){ calSetSelected(ds,true); return; }
    calCursor.setMonth(Number(card.dataset.month)); calSetView('month');
  }));
}
function renderCalMonth(map,year,month) {
  const dow=document.getElementById('calDow');
  dow.innerHTML=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-dow">${d}</div>`).join('');
  const grid=document.getElementById('calGrid');
  const first=new Date(year,month,1), offset=first.getDay(), days=new Date(year,month+1,0).getDate();
  // Heat intensity is calculated from the visible month only. This keeps
  // the color scale meaningful and prevents a large result from another
  // month/year from washing out the current month's colors.
  const monthPrefix=`${year}-${String(month+1).padStart(2,'0')}-`;
  const monthRows=Object.entries(map)
    .filter(([d])=>d.startsWith(monthPrefix))
    .map(([,v])=>v);
  const maxAbs=Math.max(1,...monthRows.map(v=>Math.abs(v.pnl)));
  let cells='';
  for(let i=0;i<offset;i++) cells+='<div class="cal-cell pad"></div>';
  for(let day=1;day<=days;day++){
    const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`, info=map[ds];
    const today=ds===calDateStr(new Date()), selected=ds===calSelectedDate;
    const ratio=info ? Math.min(1,Math.abs(info.pnl)/maxAbs) : 0;
    const notesCount=info ? (info.trades||[]).filter(t=>String(tradeNotesOf(t)??'').trim()!=='').length : 0;
    const intensity=info ? Math.min(4, Math.max(1, Math.ceil(ratio*4))) : 0;
    const heat=info && info.pnl>0 ? `g${intensity}` : info && info.pnl<0 ? `l${intensity}` : 'flat';
    cells+=`<button class="cal-cell ${info?'has-trades':''} ${heat} ${selected?'selected':''} ${today?'today':''}" data-date="${ds}">
      <span class="cal-cell-top"><span class="d">${day}</span>${today?'<span class="cal-day-tag">Today</span>':''}</span>
      ${info ? `<span class="p ${info.pnl>0?'pos':info.pnl<0?'neg':''}">${fmtMoneyPrecise(info.pnl)}</span>
        <span class="cal-bar"><span class="${info.pnl>=0?'pos':'neg'}" style="width:${Math.max(8,ratio*100)}%"></span></span>
        <span class="cal-cell-foot"><span class="cal-metric" title="${info.count} trade${info.count===1?'':'s'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h6v6"/></svg>${info.count}</span><span class="cal-metric${notesCount?'':' none'}" title="${notesCount} note${notesCount===1?'':'s'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/></svg>${notesCount}</span></span>`
        : `<span class="cal-cell-foot"><span>No trades</span></span>`}
    </button>`;
  }
  grid.innerHTML=cells;
  grid.querySelectorAll('.has-trades').forEach(cell=>cell.addEventListener('click',()=>calSetSelected(cell.dataset.date,true)));
}
function renderCalDay(map,dateStr) {
  const el=document.getElementById('calDayView'), info=map[dateStr], d=calParseDate(dateStr);
  const list=info ? info.trades.slice().sort((a,b)=>(String(a.time||a.entryTime||'')).localeCompare(String(b.time||b.entryTime||''))) : [];
  const pnl=info ? info.pnl : 0, cls=pnl>0?'pos':pnl<0?'neg':'';
  const wins=list.filter(t=>pnlOf(t)>0).length, losses=list.filter(t=>pnlOf(t)<0).length;
  const avg=list.length ? pnl/list.length : 0;
  const symbolCount=new Set(list.map(t=>t.symbol).filter(Boolean)).size;
  el.innerHTML=`<div class="cal-day-layout">
    <div class="cal-day-main">
      <div class="cal-day-quick">
        <button class="btn small" id="calDayPrev" aria-label="Previous day" title="Previous day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
        <button class="btn small" id="calDayToday" aria-label="Today" title="Today"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>
        <button class="btn small" id="calDayNext" aria-label="Next day" title="Next day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <div class="cal-day-title">
        <div><h2>${d.toLocaleString(numLocale(),{weekday:'long',day:'numeric',month:'long'})}</h2><p>${d.getFullYear()} · ${list.length} recorded trades</p></div>
        <div class="cal-day-result ${cls}">${fmtMoneyPrecise(pnl)}</div>
      </div>
      ${list.length ? `<div class="cal-trade-list">${list.map(t=>{
        const tp=pnlOf(t), tc=tp>0?'pos':tp<0?'neg':'', side=(Number(t.qty)||0)>=0?'LONG':'SHORT';
        return `<div class="cal-trade-row">
          <div class="cal-trade-time">${t.time||t.entryTime||'Session'}</div>
          <div><div class="cal-trade-symbol">${t.symbol||'Trade'}</div><div class="cal-trade-meta">${side} · ${t.broker||'—'} · Qty ${t.qty??'—'}</div></div>
          <div class="cal-trade-pnl ${tc}">${fmtMoneyPrecise(tp)}</div>
          <div class="cal-trade-rr">RR ${rrrOf(t)==null?'—':rrrOf(t).toFixed(2)}</div>
        </div>`;
      }).join('')}</div>` : `<div class="cal-empty"><strong>No trades recorded</strong><span>Use this day as a clean slate or jump to another session.</span></div>`}
    </div>
    <aside class="cal-day-side">
      <div class="cal-side-title">Session summary</div>
      <div class="cal-side-stat"><span>Gross P/L</span><b class="${cls}">${fmtMoneyPrecise(pnl)}</b></div>
      <div class="cal-side-stat"><span>Trades</span><b>${list.length}</b></div>
      <div class="cal-side-stat"><span>Winners / losers</span><b>${wins} / ${losses}</b></div>
      <div class="cal-side-stat"><span>Average trade</span><b>${list.length?fmtMoneyPrecise(avg):'—'}</b></div>
      <div class="cal-side-stat"><span>Symbols</span><b>${symbolCount}</b></div>
      <div class="cal-side-note">${list.length ? 'Clicking a calendar day keeps this session selected. Use the Trade Log filters when you want the full record.' : 'No trade data is attached to this date yet.'}</div>
    </aside>
  </div>`;
  const shiftDay=delta=>{ const nd=calParseDate(dateStr); nd.setDate(nd.getDate()+delta); calSelectedDate=calDateStr(nd); calCursor=nd; renderCalendar(); };
  document.getElementById('calDayPrev').onclick=()=>shiftDay(-1);
  document.getElementById('calDayNext').onclick=()=>shiftDay(1);
  document.getElementById('calDayToday').onclick=()=>{const nd=new Date();calSelectedDate=calDateStr(nd);calCursor=nd;renderCalendar();};
}
document.getElementById('calBrokerFilter')?.addEventListener('change', e=>{
  calBrokerType = e.target.value || 'all';
  renderCalendar();
});
document.querySelectorAll('.cal-view-btn').forEach(btn=>btn.addEventListener('click',()=>calSetView(btn.dataset.calView)));
document.getElementById('calPrev').addEventListener('click',()=>{
  if(calView==='fy') calCursor.setFullYear(calCursor.getFullYear()-1);
  else if(calView==='year') calCursor.setFullYear(calCursor.getFullYear()-1);
  else if(calView==='month') calCursor.setMonth(calCursor.getMonth()-1);
  else { const d=calParseDate(calSelectedDate); d.setDate(d.getDate()-1); calSelectedDate=calDateStr(d); calCursor=d; }
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click',()=>{
  if(calView==='fy') calCursor.setFullYear(calCursor.getFullYear()+1);
  else if(calView==='year') calCursor.setFullYear(calCursor.getFullYear()+1);
  else if(calView==='month') calCursor.setMonth(calCursor.getMonth()+1);
  else { const d=calParseDate(calSelectedDate); d.setDate(d.getDate()+1); calSelectedDate=calDateStr(d); calCursor=d; }
  renderCalendar();
});
document.getElementById('calToday').addEventListener('click',()=>{
  const d=new Date(); calCursor=d; calSelectedDate=calDateStr(d); renderCalendar();
});
document.getElementById('calJumpDay').addEventListener('click',()=>calSetView('day'));
