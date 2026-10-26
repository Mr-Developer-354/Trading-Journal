// ======================================================================
// stats.js — Trade statistics: win rate, profit factor, streaks, drawdown.
// ======================================================================
/* ---------------- dashboard ---------------- */
// filter trades to the last N days (or all time)
function filteredByRange(days) {
  if (days === 'all' || !days)
    return trades;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - parseInt(days, 10));
  return trades.filter(t => t.date && new Date(t.date) >= cutoff);
}
// compute win rate, profit factor and other summary stats for a trade list
function computeStats(list) {
  const n = list.length;
  const net = list.reduce((s, t) => s + pnlOf(t), 0);
  const wins = list.filter(t => pnlOf(t) > 0);
  const losses = list.filter(t => pnlOf(t) < 0);
  const grossWin = wins.reduce((s, t) => s + pnlOf(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + pnlOf(t), 0));
  const winRate = n ? wins.length / n * 100 : 0;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  let best = null, worst = null;
  list.forEach(t => {
    const p = pnlOf(t);
    if (best === null || p > pnlOf(best))
      best = t;
    if (worst === null || p < pnlOf(worst))
      worst = t;
  });
  return {
    n,
    net,
    winRate,
    avgWin,
    avgLoss,
    pf,
    best,
    worst,
    wins: wins.length,
    losses: losses.length
  };
}
// compute current/best win-loss streaks and max drawdown
function computeStreaksAndDrawdown(list) {
  const sorted = list.slice().filter(t => t.date).sort((a, b) => new Date(a.date) - new Date(b.date));
  let cur = 0, curType = null, bestWin = 0, bestLoss = 0;
  sorted.forEach(t => {
    const p = pnlOf(t);
    const type = p > 0 ? 'win' : p < 0 ? 'loss' : null;
    if (type === null) {
      return;
    }
    if (type === curType)
      cur++;
    else {
      cur = 1;
      curType = type;
    }
    if (type === 'win')
      bestWin = Math.max(bestWin, cur);
    if (type === 'loss')
      bestLoss = Math.max(bestLoss, cur);
  });
  let cum = 0, peak = 0, maxDD = 0;
  sorted.forEach(t => {
    cum += pnlOf(t);
    peak = Math.max(peak, cum);
    maxDD = Math.max(maxDD, peak - cum);
  });
  return {
    curStreak: cur,
    curType,
    bestWin,
    bestLoss,
    maxDD
  };
}
// render the streak/drawdown summary strip on the dashboard
function renderStreakStrip(list) {
  const s = computeStreaksAndDrawdown(list);
  const el = document.getElementById('streakStrip');
  const curLabel = s.curType ? `${ s.curStreak } ${ s.curType === 'win' ? 'win' : 'loss' }${ s.curStreak === 1 ? '' : 's' }` : '—';
  el.innerHTML = `
  <div class="streak-chip ${ s.curType === 'win' ? 'hot' : s.curType === 'loss' ? 'cold' : '' }">Current <b>${ curLabel }</b></div>
  <div class="streak-chip cold">Max drawdown <b>${ fmtMoney(-s.maxDD) }</b></div>
  <div class="streak-chip hot">Best win run <b>${ s.bestWin }</b></div>
  <div class="streak-chip cold">Worst loss run <b>${ s.bestLoss }</b></div>
`;
  const last = list.slice().filter(t => t.date).sort((a, b) => new Date(a.date) - new Date(b.date) || (a.id || 0) - (b.id || 0)).slice(-24);
  const pips = document.getElementById('streakPips');
  if (pips) {
    const cells = last.map(t => {
      const p = pnlOf(t);
      return `<i class="${ p > 0 ? 'w' : p < 0 ? 'l' : '' }" title="${ t.symbol || '' } · ${ formatDateDisplay(t.date) } · ${ fmtMoney(p) }"></i>`;
    });
    while (cells.length < 24) cells.unshift('<i></i>');
    pips.innerHTML = cells.join('');
  }
}
