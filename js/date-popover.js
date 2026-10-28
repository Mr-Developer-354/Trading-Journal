// ======================================================================
// date-popover.js — on phones (up to 1024px, phones and tablets) the date fields open a small calendar popover
// instead of the browser's own picker. Its footer has Today, a box to type a date
// (dd-mm-yyyy), and Clear. Desktop and tablet keep the browser's picker.
// The chosen date is written to the date input as yyyy-mm-dd, with input and change events,
// so the filters work as before.
// ======================================================================
(function () {
  const phoneQ = window.matchMedia('(max-width: 1024px)');
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let pop = null, cur = null, view = { y: 0, m: 0 };

  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseIso = s => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const dmyOf = s => { const d = parseIso(s); return d ? pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() : ''; };
  const parseDmy = t => {
    const m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec((t || '').trim());
    if (!m) return null;
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 ? d : null;
  };

  function setValue(v) {
    if (!cur) return;
    cur.value = v;
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    cur.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function render() {
    pop.querySelector('.dp-title').textContent = MONTHS[view.m] + ' ' + view.y;
    const grid = pop.querySelector('.dp-grid');
    const first = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const selected = cur ? cur.value : '';
    const todayIso = isoOf(new Date());
    let html = '';
    for (let i = 0; i < first; i++) html += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const key = view.y + '-' + pad(view.m + 1) + '-' + pad(d);
      const cls = ['dp-day', key === selected ? 'dp-sel' : '', key === todayIso ? 'dp-now' : ''].join(' ');
      html += `<button type="button" class="${cls}" data-iso="${key}">${d}</button>`;
    }
    grid.innerHTML = html;
  }

  function close() {
    if (pop) pop.hidden = true;
    cur = null;
  }

  function open(input) {
    cur = input;
    const d = parseIso(input.value) || new Date();
    view = { y: d.getFullYear(), m: d.getMonth() };
    pop.querySelector('.dp-type').value = dmyOf(input.value);
    render();
    pop.hidden = false;
    const r = input.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 16);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
  }

  function build() {
    pop = document.createElement('div');
    pop.className = 'dp-pop';
    pop.hidden = true;
    pop.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-step="-1" aria-label="Previous month">&lsaquo;</button>
        <span class="dp-title"></span>
        <button type="button" class="dp-nav" data-step="1" aria-label="Next month">&rsaquo;</button>
      </div>
      <div class="dp-week"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
      <div class="dp-grid"></div>
      <div class="dp-foot">
        <button type="button" class="dp-today">Today</button>
        <input type="text" class="dp-type" placeholder="dd-mm-yyyy" inputmode="numeric" aria-label="Type a date">
        <button type="button" class="dp-clear">Clear</button>
      </div>`;
    document.body.appendChild(pop);

    pop.addEventListener('click', e => {
      const nav = e.target.closest('.dp-nav');
      if (nav) {
        const step = +nav.dataset.step;
        const d = new Date(view.y, view.m + step, 1);
        view = { y: d.getFullYear(), m: d.getMonth() };
        render();
        return;
      }
      const day = e.target.closest('.dp-day');
      if (day) { setValue(day.dataset.iso); close(); return; }
      if (e.target.closest('.dp-today')) { setValue(isoOf(new Date())); close(); return; }
      if (e.target.closest('.dp-clear')) { setValue(''); close(); }
    });

    const typed = pop.querySelector('.dp-type');
    typed.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const d = parseDmy(typed.value);
        if (d) { setValue(isoOf(d)); close(); }
        else typed.classList.add('dp-bad');
      } else if (e.key === 'Escape') close();
      else typed.classList.remove('dp-bad');
    });
    typed.addEventListener('input', () => {
      // as soon as a full, valid date is typed, the calendar jumps to it
      const d = parseDmy(typed.value);
      if (d) {
        view = { y: d.getFullYear(), m: d.getMonth() };
        render();
        typed.classList.remove('dp-bad');
      }
    });

    // tap outside closes it
    document.addEventListener('pointerdown', e => {
      if (!pop.hidden && !pop.contains(e.target) && !(cur && cur.contains(e.target))) close();
    });
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
  }

  // open the popover instead of the browser picker (phones only)
  const takeOver = e => {
    const input = e.target.closest && e.target.closest('input[type="date"]');
    if (!input || !phoneQ.matches) return;
    e.preventDefault();
    if (e.type === 'click') open(input);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
  document.addEventListener('mousedown', takeOver, true);
  document.addEventListener('click', takeOver, true);
  document.addEventListener('touchend', e => {
    const input = e.target.closest && e.target.closest('input[type="date"]');
    if (input && phoneQ.matches) { e.preventDefault(); open(input); }
  }, { passive: false, capture: true });
})();
