// ======================================================================
// charts.js — Chart.js helpers and the clickable bar lists used on several views.
// ======================================================================
// get chart colors matching the active theme
function chartColors() {
  const dark = currentTheme !== 'light';
  const cs = getComputedStyle(document.documentElement);
  const v = (n, f) => cs.getPropertyValue(n).trim() || f;
  return {
    grid: dark ? 'rgba(148,163,184,0.10)' : 'rgba(15,23,34,0.08)',
    text: v('--ink-faint', '#718096'),
    green: v('--green', '#2fb170'),
    red: v('--red', '#e5534b'),
    gold: v('--gold', '#5b8def'),
    ink: v('--ink', '#e8edf4')
  };
}
// sum Gross P/L for trades grouped by a given field
function groupSum(list, key) {
  const map = {};
  list.forEach(t => {
    const k = t[key] || 'Unspecified';
    map[k] = (map[k] || 0) + pnlOf(t);
  });
  return map;
}
// placeholder markup shown when a bar list has no data
function emptyRow() {
  return `<div style="color:var(--ink-faint); font-size:13px;">No data in this range.</div>`;
}
// render a horizontal bar list (e.g. by broker) with optional click-to-filter
function renderBarList(elId, map, isMoney, filterKey) {
  const entries = Object.entries(map).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 10);
  const max = Math.max(1, ...entries.map(e => Math.abs(e[1])));
  const el = document.getElementById(elId);
  const dash = !!el.closest('#view-dashboard');
  el.innerHTML = entries.map(([name, val], i) => `
  <div class="bar-row${ filterKey ? ' clickable' : '' }"${ filterKey ? ` data-filter-${ filterKey }="${ name }"` : '' }>
    ${ dash ? `<div class="rank">${ String(i + 1).padStart(2, '0') }</div>` : '' }
    <div class="name">${ name }</div>
    <div class="bar-track"><div class="bar-fill ${ val >= 0 ? 'pos' : 'neg' }" style="width:${ (Math.abs(val) / max * 100).toFixed(0) }%;"></div></div>
    <div class="num${ dash ? (val >= 0 ? ' pos' : ' neg') : '' }">${ isMoney ? fmtMoney(val) : val }</div>
  </div>`).join('') || emptyRow();
  if (filterKey) {
    el.querySelectorAll('[data-filter-' + filterKey + ']').forEach(row => {
      row.addEventListener('click', () => {
        const val = row.getAttribute('data-filter-' + filterKey);
        if (filterKey === 'broker')
          { populateBrokerFilter(); document.getElementById('fBroker').value = 'broker:' + val; }
        page = 1;
        switchView('trades');
      });
    });
  }
}
// create or refresh a Chart.js chart on a canvas
function drawChart(canvasId, type, data, options) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined')
    return;
  if (charts[canvasId])
    charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, {
    type,
    data,
    options: Object.assign({
      responsive: true,
      maintainAspectRatio: false
    }, options)
  });
}
// re-render charts on the active view after a theme change
function refreshChartsTheme() {
  const active = document.querySelector('.nav button.active');
  if (!active)
    return;
  if (active.dataset.view === 'dashboard')
    renderDashboard();
}
