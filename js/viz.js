// ======================================================================
// viz.js — dependency-free SVG charts for the dashboard.
// No CDN or canvas: everything is drawn as SVG from the app's own theme colours, so it
// works offline and in every theme. Each chart re-draws itself when its box changes size.
//
//   VIZ.line / VIZ.area   VIZ.bars (vertical, horizontal, stacked)   VIZ.donut (donut or pie)
//   VIZ.histogram         VIZ.scatter                                VIZ.radar
//   VIZ.waterfall         VIZ.gauge                                  VIZ.heatmap
//   VIZ.boxplot
//
// Every chart takes { host, ... } where host is the element to draw into.
// ======================================================================
const VIZ = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const theme = () => ({
    ink: css('--ink') || '#222', faint: css('--ink-faint') || '#888', grid: css('--border') || '#ccc',
    green: css('--green') || '#2a8', red: css('--red') || '#c44', gold: css('--gold') || '#58d',
    card: css('--bg-card') || '#fff', border: css('--border-strong') || '#999'
  });

  /* ---------- small utilities ---------- */
  function node(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(x, y, str, attrs, parent) {
    const t = node('text', Object.assign({ x, y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }
  // "#rrggbb" → [r,g,b]; anything else falls back to mid-grey
  function rgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return [128, 128, 128];
    const v = parseInt(m[1], 16);
    return [v >> 16 & 255, v >> 8 & 255, v & 255];
  }
  function mix(a, b, t) {
    const A = rgb(a), B = rgb(b), k = Math.max(0, Math.min(1, t));
    return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * k)).join(',')})`;
  }
  // round axis ticks that cover [min, max]
  function niceTicks(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    const raw = (max - min) / (count || 4);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    const step = nice * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toPrecision(12));
    return { lo, hi, ticks };
  }
  const defaultFmt = v => (Math.round(v * 100) / 100).toLocaleString('en-IN');
  function quantile(sorted, p) {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }
  // draw into host at its current width; re-draw when the width changes
  function render(host, height, draw) {
    host.__draw = () => {
      const w = Math.max(120, Math.floor(host.clientWidth || 0));
      host.innerHTML = '';
      const svg = node('svg', { width: w, height, viewBox: `0 0 ${w} ${height}`, class: 'viz-svg', role: 'img' });
      host.appendChild(svg);
      hoverTips(svg);
      draw(svg, w, height, theme());
      host.__w = w;
    };
    host.__draw();
    if (!host.__observer && 'ResizeObserver' in window) {
      host.__observer = new ResizeObserver(() => {
        if (host.clientWidth && host.clientWidth !== host.__w) host.__draw();
      });
      host.__observer.observe(host);
    }
  }

  /* ---------- tooltip (one shared element) ---------- */
  let tipEl = null;
  function tipShow(e, str) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'viz-tip';
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = str;
    tipEl.style.display = 'block';
    const pad = 12;
    let x = e.clientX + pad, y = e.clientY + pad;
    const r = tipEl.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 4) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 4) y = e.clientY - r.height - pad;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }
  function tipHide() { if (tipEl) tipEl.style.display = 'none'; }
  // hover text: any element with data-tip inside the svg shows it
  function hoverTips(svg) {
    svg.addEventListener('mousemove', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t) tipShow(e, t.getAttribute('data-tip'));
      else if (!(e.target.closest && e.target.closest('[data-keep-tip]'))) tipHide();   // line charts drive their own tooltip
    });
    svg.addEventListener('mouseleave', tipHide);
  }

  // axes & frame shared by the cartesian charts
  function frame(w, h, o) {
    o = o || {};
    return { x0: o.left ?? 46, x1: w - (o.right ?? 8), y0: o.top ?? 10, y1: h - (o.bottom ?? 22) };
  }
  function yGrid(svg, T, fr, lo, hi, ticks, fmt) {
    const y = v => fr.y1 - (v - lo) / (hi - lo || 1) * (fr.y1 - fr.y0);
    ticks.forEach(v => {
      node('line', { x1: fr.x0, x2: fr.x1, y1: y(v), y2: y(v), stroke: T.grid, 'stroke-width': 1, 'stroke-dasharray': v === 0 ? '' : '2 4', opacity: v === 0 ? 0.9 : 0.6 }, svg);
      text(fr.x0 - 6, y(v) + 3.5, fmt(v), { 'text-anchor': 'end', fill: T.faint, 'font-size': 10, 'font-family': 'var(--mono)' }, svg);
    });
    return y;
  }
  function xLabels(svg, T, labels, xAt, fr, every) {
    const step = every || Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor((fr.x1 - fr.x0) / 64))));
    labels.forEach((l, i) => {
      if (i % step !== 0 && i !== labels.length - 1) return;
      text(xAt(i), fr.y1 + 15, l, { 'text-anchor': 'middle', fill: T.faint, 'font-size': 10 }, svg);
    });
  }

  /* ---------- line & area ---------- */
  // series: [{ name, data, color, area }]
  function line(o) {
    const h = o.height || 220;
    render(o.host, h, (svg, w, H, T) => {
      const fr = frame(w, H, o);
      const n = o.labels.length;
      if (!n) return text(w / 2, H / 2, 'No data in this period', { 'text-anchor': 'middle', fill: T.faint, 'font-size': 12 }, svg);
      const all = o.series.flatMap(s => s.data).concat(0);
      const t = niceTicks(Math.min(...all), Math.max(...all), 4);
      const y = yGrid(svg, T, fr, t.lo, t.hi, t.ticks, o.fmt || defaultFmt);
      const x = i => fr.x0 + (n === 1 ? (fr.x1 - fr.x0) / 2 : i / (n - 1) * (fr.x1 - fr.x0));
      o.series.forEach(s => {
        const pts = s.data.map((v, i) => `${ x(i).toFixed(1) },${ y(v).toFixed(1) }`);
        if (s.area) {
          const base = y(0).toFixed(1);
          node('path', { d: `M${ x(0).toFixed(1) },${ base } L${ pts.join(' L') } L${ x(n - 1).toFixed(1) },${ base } Z`, fill: s.color, opacity: 0.16 }, svg);
        }
        node('path', { d: 'M' + pts.join(' L'), fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      });
      // hover: guide line + dots + tooltip for the nearest point
      const guide = node('line', { y1: fr.y0, y2: fr.y1, stroke: T.border, 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' }, svg);
      const dots = o.series.map(s => node('circle', { r: 4, fill: s.color, stroke: T.card, 'stroke-width': 2, opacity: 0, 'pointer-events': 'none' }, svg));
      const hit = node('rect', { x: fr.x0, y: fr.y0, width: fr.x1 - fr.x0, height: fr.y1 - fr.y0, fill: 'transparent', 'data-keep-tip': '' }, svg);
      hit.addEventListener('mousemove', e => {
        const rect = svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((mx - fr.x0) / (fr.x1 - fr.x0) * (n - 1))));
        guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', 1);
        o.series.forEach((s, k) => { dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(s.data[i])); dots[k].setAttribute('opacity', 1); });
        const lines = [o.labels[i]].concat(o.series.map(s => `${ s.name || 'value' }: ${ (o.fmt || defaultFmt)(s.data[i]) }`));
        tipShow(e, lines.join('\n'));
      });
      hit.addEventListener('mouseleave', () => { guide.setAttribute('opacity', 0); dots.forEach(d => d.setAttribute('opacity', 0)); tipHide(); });
      xLabels(svg, T, o.labels, x, fr);
    });
  }

  /* ---------- bars: vertical, horizontal, grouped-by-stack ---------- */
  // o.series: [{ name, data, color }] or o.values + o.colors (one series, colour per bar)
  // o.stacked: stack positives up and negatives down
  function bars(o) {
    const series = o.series || [{ name: o.name || 'value', data: o.values, color: null }];
    const h = o.height || 220;
    render(o.host, h, (svg, w, H, T) => {
      const n = o.labels.length;
      if (!n) return text(w / 2, H / 2, 'No data in this period', { 'text-anchor': 'middle', fill: T.faint, 'font-size': 12 }, svg);
      const fmt = o.fmt || defaultFmt;
      // extent of the stacks
      let hi = 0, lo = 0;
      for (let i = 0; i < n; i++) {
        if (o.stacked) {
          let pos = 0, neg = 0;
          series.forEach(s => { const v = s.data[i] || 0; if (v >= 0) pos += v; else neg += v; });
          hi = Math.max(hi, pos); lo = Math.min(lo, neg);
        } else {
          series.forEach(s => { const v = s.data[i] || 0; hi = Math.max(hi, v); lo = Math.min(lo, v); });
        }
      }
      const t = niceTicks(lo, hi, 4);
      const colorFor = (s, i) => (o.colors && o.colors[i]) || s.color || (s.data[i] >= 0 ? T.green : T.red);
      if (o.horizontal) {
        const left = Math.max(60, Math.min(120, Math.max(...o.labels.map(l => String(l).length)) * 6.5));
        const fr = frame(w, H, { left, bottom: 22 });
        const x = v => fr.x0 + (v - t.lo) / (t.hi - t.lo || 1) * (fr.x1 - fr.x0);
        t.ticks.forEach(v => {
          node('line', { x1: x(v), x2: x(v), y1: fr.y0, y2: fr.y1, stroke: T.grid, 'stroke-dasharray': v === 0 ? '' : '2 4', opacity: v === 0 ? 0.9 : 0.6 }, svg);
          text(x(v), fr.y1 + 15, fmt(v), { 'text-anchor': 'middle', fill: T.faint, 'font-size': 10, 'font-family': 'var(--mono)' }, svg);
        });
        const band = (fr.y1 - fr.y0) / n;
        const bh = Math.max(4, Math.min(22, band * 0.68));
        for (let i = 0; i < n; i++) {
          const yc = fr.y0 + band * i + band / 2;
          text(fr.x0 - 6, yc + 3.5, o.labels[i], { 'text-anchor': 'end', fill: T.ink, 'font-size': 11 }, svg);
          let posAcc = 0, negAcc = 0;
          series.forEach(s => {
            const v = s.data[i] || 0;
            let a, b;
            if (o.stacked) {
              if (v >= 0) { a = posAcc; posAcc += v; } else { a = negAcc; negAcc += v; }
              b = o.stacked && v >= 0 ? posAcc : negAcc;
            } else { a = 0; b = v; }
            const x1 = x(Math.min(a, b)), x2 = x(Math.max(a, b));
            node('rect', { x: x1, y: yc - bh / 2, width: Math.max(1, x2 - x1), height: bh, rx: 3, fill: colorFor(s, i), 'data-tip': `${ o.labels[i] }\n${ series.length > 1 ? s.name + ': ' : '' }${ fmt(v) }` }, svg);
          });
        }
        return;
      }
      const fr = frame(w, H, o);
      const y = yGrid(svg, T, fr, t.lo, t.hi, t.ticks, fmt);
      const band = (fr.x1 - fr.x0) / n;
      const bw = Math.max(2, Math.min(o.maxBar || 28, band * 0.7));
      for (let i = 0; i < n; i++) {
        const xc = fr.x0 + band * i + band / 2;
        let posAcc = 0, negAcc = 0;
        series.forEach(s => {
          const v = s.data[i] || 0;
          let a, b;
          if (o.stacked) {
            if (v >= 0) { a = posAcc; posAcc += v; b = posAcc; } else { a = negAcc; negAcc += v; b = negAcc; }
          } else { a = 0; b = v; }
          const y1 = y(Math.max(a, b)), y2 = y(Math.min(a, b));
          node('rect', { x: xc - bw / 2, y: y1, width: bw, height: Math.max(1, y2 - y1), rx: 3, fill: colorFor(s, i), 'data-tip': `${ o.labels[i] }\n${ series.length > 1 ? s.name + ': ' : '' }${ fmt(v) }` }, svg);
        });
      }
      xLabels(svg, T, o.labels, i => fr.x0 + band * i + band / 2, fr);
    });
  }

  /* ---------- histogram (bins of a numeric list) ---------- */
  function histogram(o) {
    const vals = (o.values || []).filter(v => isFinite(v));
    const bins = o.bins || 24;
    const lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1;
    const width = (hi - lo) / bins || 1;
    const counts = Array(bins).fill(0);
    vals.forEach(v => { counts[Math.min(bins - 1, Math.floor((v - lo) / width))]++; });
    const edge = i => lo + i * width;
    const fmt = o.fmt || defaultFmt;
    render(o.host, o.height || 220, (svg, w, H, T) => {
      if (!vals.length) return text(w / 2, H / 2, 'No data in this period', { 'text-anchor': 'middle', fill: T.faint, 'font-size': 12 }, svg);
      const fr = frame(w, H, o);
      const t = niceTicks(0, Math.max(...counts), 4);
      const y = yGrid(svg, T, fr, t.lo, t.hi, t.ticks, v => String(Math.round(v)));
      const bw = (fr.x1 - fr.x0) / bins;
      const zero = o.signColor !== false;
      counts.forEach((c, i) => {
        const mid = edge(i) + width / 2;
        const color = zero ? (mid < 0 ? T.red : T.green) : T.gold;
        const yTop = y(c), yBase = y(0);
        node('rect', { x: fr.x0 + i * bw + 1, y: yTop, width: Math.max(1, bw - 2), height: Math.max(0, yBase - yTop), rx: 2, fill: color, 'data-tip': `${ fmt(edge(i)) } to ${ fmt(edge(i + 1)) }\n${ c } trades` }, svg);
      });
      // edge labels: start, middle, end
      [0, Math.floor(bins / 2), bins].forEach(i => text(fr.x0 + i * bw, fr.y1 + 15, fmt(edge(i)), { 'text-anchor': i === 0 ? 'start' : i === bins ? 'end' : 'middle', fill: T.faint, 'font-size': 10 }, svg));
    });
  }

  /* ---------- donut / pie ---------- */
  // o.items: [{ label, value, color }]; o.hole in 0..0.9 (0 = pie)
  function donut(o) {
    const items = (o.items || []).filter(i => i.value > 0);
    const h = o.height || 220;
    render(o.host, h, (svg, w, H, T) => {
      const total = items.reduce((s, i) => s + i.value, 0);
      if (!total) return text(w / 2, H / 2, 'No data in this period', { 'text-anchor': 'middle', fill: T.faint, 'font-size': 12 }, svg);
      const R = Math.min(w * 0.42, H / 2 - 6, 110), cx = w / 2, cy = H / 2;
      const r0 = R * (o.hole ?? 0.64);
      let a = -Math.PI / 2;
      const pt = (r, ang) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
      items.forEach(it => {
        const frac = it.value / total;
        const b = a + frac * Math.PI * 2;
        const large = b - a > Math.PI ? 1 : 0;
        const [x1, y1] = pt(R, a), [x2, y2] = pt(R, b);
        const [x3, y3] = pt(r0, b), [x4, y4] = pt(r0, a);
        const d = r0 > 0
          ? `M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 ${large} 0 ${x4},${y4} Z`
          : `M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`;
        node('path', { d, fill: it.color, stroke: T.card, 'stroke-width': 2, 'data-tip': `${ it.label }\n${ (o.fmt || defaultFmt)(it.value) } · ${ (frac * 100).toFixed(1) }%` }, svg);
        a = b;
      });
      if (o.centerText && r0 > 0) {
        text(cx, cy + 2, o.centerText, { 'text-anchor': 'middle', fill: T.ink, 'font-size': 20, 'font-weight': 600 }, svg);
        if (o.centerSub) text(cx, cy + 17, o.centerSub, { 'text-anchor': 'middle', fill: T.faint, 'font-size': 10 }, svg);
      }
    });
    if (o.legend !== false && o.host) {
      const legend = document.createElement('div');
      legend.className = 'viz-legend';
      const total = items.reduce((s, i) => s + i.value, 0) || 1;
      legend.innerHTML = items.map(i => `<div><span><i style="background:${ i.color }"></i>${ escapeHtml(i.label) }</span><b>${ ((i.value / total) * 100).toFixed(1) }%</b></div>`).join('');
      o.host.parentNode.querySelectorAll(':scope > .viz-legend').forEach(n => n.remove());
      o.host.parentNode.appendChild(legend);
    }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ---------- scatter ---------- */
  // o.points: [{ x, y, color, label }]
  function scatter(o) {
    render(o.host, o.height || 240, (svg, w, H, T) => {
      const pts = o.points || [];
      if (!pts.length) return text(w / 2, H / 2, 'No data in this period', { 'text-anchor': 'middle', fill: T.faint, 'font-size': 12 }, svg);
      const fr = frame(w, H, { left: 52, bottom: 26 });
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const tx = niceTicks(Math.min(...xs, 0), Math.max(...xs, 0), 5);
      const ty = niceTicks(Math.min(...ys, 0), Math.max(...ys, 0), 4);
      const y = yGrid(svg, T, fr, ty.lo, ty.hi, ty.ticks, o.yFmt || defaultFmt);
      const x = v => fr.x0 + (v - tx.lo) / (tx.hi - tx.lo || 1) * (fr.x1 - fr.x0);
      tx.ticks.forEach(v => {
        node('line', { x1: x(v), x2: x(v), y1: fr.y0, y2: fr.y1, stroke: T.grid, 'stroke-dasharray': v === 0 ? '' : '2 4', opacity: v === 0 ? 0.9 : 0.5 }, svg);
        text(x(v), fr.y1 + 15, (o.xFmt || defaultFmt)(v), { 'text-anchor': 'middle', fill: T.faint, 'font-size': 10 }, svg);
      });
      text(fr.x1, fr.y1 + 26, o.xLabel || '', { 'text-anchor': 'end', fill: T.faint, 'font-size': 10 }, svg);
      pts.forEach(p => {
        node('circle', { cx: x(p.x), cy: y(p.y), r: o.radius || 2.6, fill: p.color || T.gold, opacity: 0.7, 'data-tip': p.label || `${ p.x }, ${ p.y }` }, svg);
      });
    });
  }

  /* ---------- radar ---------- */
  // o.axes: [label]; o.series: [{ name, values (0..1 each), color }]
  function radar(o) {
    render(o.host, o.height || 260, (svg, w, H, T) => {
      const n = o.axes.length;
      const R = Math.min(w / 2 - 70, H / 2 - 28), cx = w / 2, cy = H / 2;
      const ang = i => -Math.PI / 2 + i / n * Math.PI * 2;
      const pt = (i, f) => [cx + Math.cos(ang(i)) * R * f, cy + Math.sin(ang(i)) * R * f];
      [0.25, 0.5, 0.75, 1].forEach(f => {
        node('polygon', { points: Array.from({ length: n }, (_, i) => pt(i, f).join(',')).join(' '), fill: 'none', stroke: T.grid, 'stroke-width': 1 }, svg);
      });
      o.axes.forEach((label, i) => {
        const [x2, y2] = pt(i, 1);
        node('line', { x1: cx, y1: cy, x2, y2, stroke: T.grid, 'stroke-width': 1 }, svg);
        const [lx, ly] = pt(i, 1.2);
        const anchor = Math.abs(lx - cx) < 4 ? 'middle' : lx > cx ? 'start' : 'end';
        text(lx, ly + 4, label, { 'text-anchor': anchor, fill: T.faint, 'font-size': 10 }, svg);
      });
      o.series.forEach(s => {
        const pts = s.values.map((v, i) => pt(i, Math.max(0, Math.min(1, v))).join(','));
        node('polygon', { points: pts.join(' '), fill: s.color, 'fill-opacity': 0.16, stroke: s.color, 'stroke-width': 2, 'data-tip': s.name }, svg);
        s.values.forEach((v, i) => node('circle', { cx: pt(i, Math.max(0, Math.min(1, v)))[0], cy: pt(i, Math.max(0, Math.min(1, v)))[1], r: 3, fill: s.color, 'data-tip': `${ s.name } · ${ o.axes[i] }: ${ s.raw ? s.raw[i] : Math.round(v * 100) + '%' }` }, svg));
      });
    });
    if (o.legend !== false && o.host) {
      const legend = document.createElement('div');
      legend.className = 'viz-legend viz-legend-row';
      legend.innerHTML = o.series.map(s => `<div><span><i style="background:${ s.color }"></i>${ escapeHtml(s.name) }</span></div>`).join('');
      o.host.parentNode.querySelectorAll(':scope > .viz-legend').forEach(n => n.remove());
      o.host.parentNode.appendChild(legend);
    }
  }

  /* ---------- waterfall: running total built from deltas ---------- */
  function waterfall(o) {
    render(o.host, o.height || 220, (svg, w, H, T) => {
      const n = o.labels.length;
      if (!n) return text(w / 2, H / 2, 'No data in this period', { 'text-anchor': 'middle', fill: T.faint, 'font-size': 12 }, svg);
      const fmt = o.fmt || defaultFmt;
      let run = 0;
      const steps = o.deltas.map(d => { const a = run; run += d; return { a, b: run, d }; });
      const all = steps.flatMap(s => [s.a, s.b]).concat(0);
      const t = niceTicks(Math.min(...all), Math.max(...all), 4);
      const fr = frame(w, H, o);
      const y = yGrid(svg, T, fr, t.lo, t.hi, t.ticks, fmt);
      const band = (fr.x1 - fr.x0) / (n + 1);
      const bw = Math.max(6, Math.min(40, band * 0.66));
      steps.forEach((s, i) => {
        const xc = fr.x0 + band * i + band / 2;
        const top = y(Math.max(s.a, s.b)), bot = y(Math.min(s.a, s.b));
        node('rect', { x: xc - bw / 2, y: top, width: bw, height: Math.max(1, bot - top), rx: 3, fill: s.d >= 0 ? T.green : T.red, 'data-tip': `${ o.labels[i] }\n${ fmt(s.d) }` }, svg);
        if (i < n - 1) node('line', { x1: xc + bw / 2, x2: xc + band - bw / 2, y1: y(s.b), y2: y(s.b), stroke: T.faint, 'stroke-dasharray': '2 3', opacity: 0.6 }, svg);
      });
      // total bar
      const xt = fr.x0 + band * n + band / 2;
      const ty1 = y(Math.max(0, run)), ty2 = y(Math.min(0, run));
      node('rect', { x: xt - bw / 2, y: ty1, width: bw, height: Math.max(1, ty2 - ty1), rx: 3, fill: T.gold, 'data-tip': `Total\n${ fmt(run) }` }, svg);
      o.labels.concat(['Total']).forEach((l, i) => {
        if (n + 1 > 10 && i % 2 === 1) return;
        text(fr.x0 + band * i + band / 2, fr.y1 + 15, l, { 'text-anchor': 'middle', fill: T.faint, 'font-size': 10 }, svg);
      });
    });
  }

  /* ---------- gauge (semicircle) ---------- */
  function gauge(o) {
    render(o.host, o.height || 150, (svg, w, H, T) => {
      const max = o.max || 100;
      const v = Math.max(0, Math.min(max, o.value || 0));
      const R = Math.min(w / 2 - 14, H - 26), cx = w / 2, cy = H - 14, r = R * 0.82, sw = Math.max(8, R * 0.16);
      const arc = (f0, f1, color, extra) => {
        const a0 = Math.PI + f0 * Math.PI, a1 = Math.PI + f1 * Math.PI;
        const [x1, y1] = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
        const [x2, y2] = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
        return node('path', Object.assign({ d: `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`, fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round' }, extra || {}), svg);
      };
      arc(0, 1, T.grid);
      if (v > 0) arc(0, v / max, o.color || T.gold, { 'data-tip': `${ o.label || '' } ${ (o.fmt || defaultFmt)(o.value) }` });
      text(cx, cy - 6, (o.fmt || defaultFmt)(o.value || 0), { 'text-anchor': 'middle', fill: T.ink, 'font-size': 20, 'font-weight': 600 }, svg);
      if (o.label) text(cx, cy + 12, o.label, { 'text-anchor': 'middle', fill: T.faint, 'font-size': 10 }, svg);
    });
  }

  /* ---------- heatmap (rows × columns, diverging colour around zero) ---------- */
  // o.matrix[row][col] = number or null
  function heatmap(o) {
    render(o.host, o.height || 220, (svg, w, H, T) => {
      const R = o.rowLabels.length, C = o.colLabels.length;
      const fr = frame(w, H, { left: 44, bottom: 22, top: 18 });
      const cw = (fr.x1 - fr.x0) / C, rh = (fr.y1 - fr.y0) / R;
      const maxAbs = Math.max(1e-9, ...o.matrix.flat().map(v => Math.abs(v || 0)));
      const fmt = o.fmt || defaultFmt;
      o.colLabels.forEach((l, c) => text(fr.x0 + cw * c + cw / 2, fr.y0 - 6, l, { 'text-anchor': 'middle', fill: T.faint, 'font-size': 10 }, svg));
      o.rowLabels.forEach((l, r) => {
        text(fr.x0 - 6, fr.y0 + rh * r + rh / 2 + 3.5, l, { 'text-anchor': 'end', fill: T.faint, 'font-size': 10 }, svg);
        for (let c = 0; c < C; c++) {
          const v = o.matrix[r][c];
          const fill = v === null || v === undefined ? T.grid
            : v >= 0 ? mix(T.card, T.green, Math.abs(v) / maxAbs) : mix(T.card, T.red, Math.abs(v) / maxAbs);
          node('rect', { x: fr.x0 + cw * c + 1, y: fr.y0 + rh * r + 1, width: Math.max(1, cw - 2), height: Math.max(1, rh - 2), rx: 3, fill, opacity: v === null || v === undefined ? 0.35 : 1,
            'data-tip': `${ l } · ${ o.colLabels[c] }\n${ v === null || v === undefined ? 'no trades' : fmt(v) }` }, svg);
        }
      });
    });
  }

  /* ---------- box plot: quartiles, whiskers at 1.5 × IQR ---------- */
  // o.groups: [{ label, values, color }]
  function boxplot(o) {
    render(o.host, o.height || 220, (svg, w, H, T) => {
      const groups = (o.groups || []).filter(g => g.values && g.values.length);
      if (!groups.length) return text(w / 2, H / 2, 'No data in this period', { 'text-anchor': 'middle', fill: T.faint, 'font-size': 12 }, svg);
      const stats = groups.map(g => {
        const s = g.values.slice().sort((a, b) => a - b);
        const q1 = quantile(s, 0.25), q2 = quantile(s, 0.5), q3 = quantile(s, 0.75), iqr = q3 - q1;
        const lo = s.find(v => v >= q1 - 1.5 * iqr) ?? s[0];
        const hi = s.slice().reverse().find(v => v <= q3 + 1.5 * iqr) ?? s[s.length - 1];
        return { q1, q2, q3, lo, hi, color: g.color, label: g.label, n: s.length };
      });
      const all = stats.flatMap(s => [s.lo, s.hi]).concat(0);
      const t = niceTicks(Math.min(...all), Math.max(...all), 4);
      const fr = frame(w, H, o);
      const y = yGrid(svg, T, fr, t.lo, t.hi, t.ticks, o.fmt || defaultFmt);
      const band = (fr.x1 - fr.x0) / stats.length, bw = Math.max(16, Math.min(60, band * 0.45));
      stats.forEach((s, i) => {
        const xc = fr.x0 + band * i + band / 2;
        const tip = `${ s.label } (${ s.n } trades)\nmedian ${ (o.fmt || defaultFmt)(s.q2) }\nIQR ${ (o.fmt || defaultFmt)(s.q1) } to ${ (o.fmt || defaultFmt)(s.q3) }`;
        node('line', { x1: xc, x2: xc, y1: y(s.hi), y2: y(s.lo), stroke: T.faint, 'stroke-width': 1.5 }, svg);
        node('line', { x1: xc - bw / 4, x2: xc + bw / 4, y1: y(s.hi), y2: y(s.hi), stroke: T.faint, 'stroke-width': 1.5 }, svg);
        node('line', { x1: xc - bw / 4, x2: xc + bw / 4, y1: y(s.lo), y2: y(s.lo), stroke: T.faint, 'stroke-width': 1.5 }, svg);
        node('rect', { x: xc - bw / 2, y: y(s.q3), width: bw, height: Math.max(2, y(s.q1) - y(s.q3)), rx: 4, fill: s.color || T.gold, 'fill-opacity': 0.35, stroke: s.color || T.gold, 'stroke-width': 1.5, 'data-tip': tip }, svg);
        node('line', { x1: xc - bw / 2, x2: xc + bw / 2, y1: y(s.q2), y2: y(s.q2), stroke: s.color || T.gold, 'stroke-width': 2.5, 'data-tip': tip }, svg);
        text(xc, fr.y1 + 15, s.label, { 'text-anchor': 'middle', fill: T.faint, 'font-size': 10 }, svg);
      });
    });
  }

  return { line, bars, histogram, donut, scatter, radar, waterfall, gauge, heatmap, boxplot, mix, quantile, niceTicks, _hoverTips: hoverTips };
})();
