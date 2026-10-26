// ======================================================================
// trade-drawer.js — Side drawer to add / edit / view a single trade.
// ======================================================================
/* ---------------- add / edit trade form (rendered inside a table row panel) ---------------- */
// Renders the trade form into `inlineOpts.el` (a table row panel). `inlineOpts` = { el, onCancel, onSaved }.
// `existing` with an id = edit; `existing` without an id (duplicate) or nothing = new trade.
function openAddTrade(existing, inlineOpts) {
  const inline = inlineOpts;
  const root = inline.el;
  const isEdit = !!existing && existing.id !== undefined && existing.id !== null;
  const v = existing || {};
  // every broker the app knows (rate-card brokers) plus any broker name already stored in the Trade Log
  const brokers = Array.from(new Set([...Object.values(CHARGES_BROKERS).map(b => b.label), ...trades.map(t => t.broker).filter(Boolean)])).sort();
  const brokerField = ['broker', 'Broker', 'select', '', true, ['', ...brokers]];
  // older records may still hold the previous names: normaliseSegment maps them to Capital / Equity
  const inferred = normaliseSegment(v.segment) || ((['CE','PE','FUT'].includes(normaliseTradeType(v.optType)) || v.strike || v.expiry) ? 'Equity' : 'Capital');

  const productOptions = TRADE_PRODUCTS_BY_SEGMENT;
  // default product when a record has none stored yet
  const defaultProduct = (segment) => {
    const opts = productOptions[segment];
    const stored = normaliseProduct(v.product);
    if (stored && opts.includes(stored) && segment === inferred) return stored;
    return segment === 'Capital' ? 'INTRADAY' : 'MARGIN';
  };
  // Type (trade type) sits in the top row right after Exchange, on every segment tab.
  const typeFieldSpec = ['optType','Type','select','',false,['',...TRADE_TYPES]];
  const segmentFields = {
    'Capital': [
      ['date','Date','date','',true], ['symbol','Symbol','text','e.g. RELIANCE',true],
      ['qty','Qty','number','',true],
      ['entry','EntryPrice','number','',true], ['sl','Stoploss','number','optional',false], ['exit','ExitPrice','number','',true],
      ['entryTime','EntryTime','time','',false], ['exitTime','ExitTime','time','',false], ['expCha','ExpChgs','readonly','',false]
    ],
    'Equity': [
      ['date','Date','date','',true], ['symbol','Symbol','text','e.g. NIFTY',true],
      ['qty','Qty','number','',true],
['entry','EntryPrice','number','',true], ['sl','Stoploss','number','optional',false], ['exit','ExitPrice','number','',true],
      ['expiry','Expiry','text','e.g. 27-Nov-2026',false], ['strike','Strike','number','optional',false],
      ['entryTime','EntryTime','time','',false], ['exitTime','ExitTime','time','',false], ['expCha','ExpChgs','readonly','',false]
    ],
    'Currency': [
      ['date','Date','date','',true], ['symbol','Symbol','text','e.g. USDINR',true],
      ['qty','Qty','number','',true],
['entry','EntryPrice','number','',true], ['sl','Stoploss','number','optional',false], ['exit','ExitPrice','number','',true],
      ['expiry','Expiry','text','optional',false], ['entryTime','EntryTime','time','',false], ['exitTime','ExitTime','time','',false], ['expCha','ExpChgs','readonly','',false]
    ],
    'Commodity': [
      ['date','Date','date','',true], ['symbol','Symbol','text','e.g. GOLD',true],
      ['qty','Qty','number','',true],
['entry','EntryPrice','number','',true], ['sl','Stoploss','number','optional',false], ['exit','ExitPrice','number','',true],
      ['expiry','Expiry','text','optional',false], ['entryTime','EntryTime','time','',false], ['exitTime','ExitTime','time','',false]
    ]
  };
  const journalFields = [
    ['strategy','Strategy','text','e.g. Breakout, Pullback…',false],
    ['disciplined','Disciplined','checkbox','',false],
    ['notes','Notes','textarea','',false]
  ];
  // Expected charges (expCha) come from the shared Brokerage & Charges calculator and are shown
  // read-only right after ExitTime in each segment's fields.
  const esc = escapeHtml;
  const val = key => v[key] === undefined || v[key] === null ? '' : String(v[key]);
  const fieldHtml = (f) => {
    const [key,label,type,placeholder,required,options] = f;
    const value = val(key);
    if (type === 'select') return `<div class="field"><label>${esc(label)}${required?' *':''}</label><select name="${key}" ${required?'required':''}>${options.map(o=>`<option value="${esc(o)}" ${value===o?'selected':''}>${esc(o||'—')}</option>`).join('')}</select></div>`;
    if (type === 'readonly') return `<div class="field"><label>${esc(label)}</label><input type="number" step="any" name="${key}" value="${esc(value)}" readonly aria-readonly="true"></div>`;
    if (type === 'checkbox') return `<label class="drawer-check"><input type="checkbox" name="${key}" ${value && value !== 'No' ? 'checked':''}><span>${esc(label)}</span></label>`;
    if (type === 'textarea') return `<div class="field field-full"><label>${esc(label)}</label><textarea name="${key}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></div>`;
    return `<div class="field"><label>${esc(label)}${required?' *':''}</label><input type="${type}" name="${key}" ${required?'required':''} ${placeholder?'placeholder="'+esc(placeholder)+'"':''} ${type==='number'?'step="any"':''} ${type==='time'?'step="1"':''} value="${esc(value)}"></div>`;
  };
  const renderPills = (segment) => {
    const product = defaultProduct(segment);
    const pills = `<div class="product-select-row" role="radiogroup" aria-label="${esc(segment)} type">${productOptions[segment].map(o=>`<button type="button" class="product-pill ${o===product?'active':''}" data-product="${o}" role="radio" aria-checked="${o===product}">${o}</button>`).join('')}</div><input type="hidden" name="product" value="${product}">`;
    return pills;
  };
  const renderTypeSlot = () => `<div class="field-grid segment-field">${fieldHtml(typeFieldSpec)}</div>`;
  const renderSegment = (segment) => {
    const fields = segmentFields[segment];
    return `<div class="field-grid">${fields.map(fieldHtml).join('')}</div>`;
  };

  root.innerHTML = `
    <div class="trade-drawer-head">
      <div class="trade-drawer-title">
        <h2>${isEdit ? 'Edit trade' : 'Log a trade'}</h2>
        <p>${isEdit ? 'Update the trade; stored expected charges are preserved unless you approve recalculation.' : 'Select a segment and enter the trade details to save in the Trade Log database.'}</p>
      </div>
      <div class="segment-tabs" role="tablist" aria-label="Trade segment">
        ${['Capital','Equity','Currency','Commodity'].map(seg=>`<button type="button" class="segment-tab ${inferred===seg?'active':''}" data-segment="${seg}" title="${SEGMENT_TOOLTIPS[seg]}" role="tab" aria-selected="${inferred===seg}">${seg}</button>`).join('')}
      </div>
      <div class="head-actions"><button type="button" class="btn ghost" id="cancelAdd">Cancel</button><button type="submit" class="btn primary" form="tradeForm">${isEdit ? 'Save changes' : 'Save trade'}</button></div>
    </div>
    <form id="tradeForm" class="trade-form">
      <div class="trade-drawer-body">
        <input type="hidden" name="segment" value="${esc(inferred)}">
        <section class="drawer-section segment-section"><div class="drawer-section-title"><span>01</span><div><b id="segmentTitle" title="${SEGMENT_TOOLTIPS[inferred]}">${inferred}</b><small>Execution details for this segment</small></div></div><div class="segment-top-row"><div class="field-grid segment-field">${fieldHtml(brokerField)}</div><div class="field-grid segment-field">${fieldHtml(['exchange','Exchange','select','',false,['',...TRADE_EXCHANGES]])}</div><div id="segmentType" style="display:contents">${renderTypeSlot()}</div><div id="segmentPills">${renderPills(inferred)}</div></div><div id="segmentFields">${renderSegment(inferred)}</div></section>
        <section class="drawer-section"><div class="drawer-section-title"><span>02</span><div><b>Trade journal</b><small>Process and learning</small></div></div><div class="field-grid">${journalFields.map(fieldHtml).join('')}</div></section>
        <section class="drawer-section"><div class="calc-preview" id="calcPreview">Gross P/L preview will appear here</div></section>
      </div>
    </form>`;

  root.querySelector('#cancelAdd').addEventListener('click', inline.onCancel);
  const form = root.querySelector('#tradeForm');
  const preview = root.querySelector('#calcPreview');
  const segmentInput = form.elements.segment;
  const renderActiveSegment = (segment) => {
    segmentInput.value = segment;
    root.querySelector('#segmentTitle').textContent = segment;
    root.querySelector('#segmentTitle').title = SEGMENT_TOOLTIPS[segment];
    root.querySelector('#segmentPills').innerHTML = renderPills(segment);
    root.querySelector('#segmentFields').innerHTML = renderSegment(segment);
    const typeNow = form.elements.optType ? form.elements.optType.value : '';   // keep a typed Type when switching tabs
    root.querySelector('#segmentType').innerHTML = renderTypeSlot();
    if (form.elements.optType) form.elements.optType.value = typeNow;
    root.querySelectorAll('.segment-tab').forEach(btn=>{ const active=btn.dataset.segment===segment; btn.classList.toggle('active',active); btn.setAttribute('aria-selected',String(active)); });
    form.querySelectorAll('[name="date"],[name="symbol"],[name="broker"],[name="qty"],[name="entry"],[name="exit"]').forEach(el=>el.addEventListener('input', updatePreview));
    updatePreview();   // refill the read-only ExpChgs for the new segment's freshly rendered fields
  };
  root.querySelectorAll('.segment-tab').forEach(btn=>btn.addEventListener('click',()=>renderActiveSegment(btn.dataset.segment)));
  root.querySelector('.segment-top-row').addEventListener('click', e => {
    const pill = e.target.closest('.product-pill');
    if (!pill) return;
    form.elements.product.value = pill.dataset.product;
    root.querySelectorAll('.product-pill').forEach(b => { const on = b === pill; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); });
    updatePreview();
  });
  function updatePreview() {
    const qty = parseFloat(form.elements.qty?.value), entry = parseFloat(form.elements.entry?.value), exit = parseFloat(form.elements.exit?.value);
    const candidate = expectedChargesForTrade({
      broker: form.elements.broker?.value,
      segment: form.elements.segment?.value,
      product: form.elements.product?.value,
      qty, entry, exit
    });
    const parts = [];
    if (!Number.isNaN(qty) && !Number.isNaN(entry) && !Number.isNaN(exit)) {
      const pnl = (exit-entry)*qty;
      const pct = (entry*qty) ? pnl/Math.abs(entry*qty) : null;
      parts.push(`<span>Gross P/L</span><b class="${pnl>=0?'positive':'negative'}">${fmtMoneyPrecise(pnl)}</b>`);
      if (pct !== null) parts.push(`<span>Gross P/L %</span><b class="${pnl>=0?'positive':'negative'}">${(pct*100).toFixed(2)}%</b>`);
    }
    if (candidate !== null) {
      parts.push(`<span>ExpChgs</span><b class="negative">${fmtMoneyPrecise(candidate)}</b>`);
      if (!isEdit && form.elements.expCha) form.elements.expCha.value = candidate;
    }
    preview.innerHTML = parts.length ? parts.join('') : 'Gross P/L / expected charges preview will appear here';
  }
  form.addEventListener('input', updatePreview); updatePreview();
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const rec = isEdit ? { ...existing } : { ...(existing || {}), id: nextId() };
    const numeric = new Set(['qty','sl','entry','exit','strike','expCha']);
    const activeFields = [...segmentFields[segmentInput.value], typeFieldSpec];
    rec.segment = segmentInput.value;
    rec.product = form.elements.product ? form.elements.product.value : null;
    rec.exchange = normaliseExchange(form.elements.exchange?.value);
    rec.broker = form.elements.broker?.value || null;   // broker lives in the top row, outside the segment fields
    [...activeFields, ...journalFields].forEach(([key]) => {
      if (key === 'disciplined') rec[key] = form.elements[key].checked ? 'Yes' : null;
      else if (numeric.has(key)) { const raw=fd.get(key); rec[key]=raw===''?null:Number(raw); }
      else rec[key] = fd.get(key) || null;
    });
    // `expCha` is the only stored financial value. It is recalculated
    // automatically for both new and edited trades from the current
    // Brokerage & Charges settings.
    const calculatedExpCha = expectedChargesForTrade(rec);
    if (calculatedExpCha !== null) rec.expCha = r2(calculatedExpCha);   // same rounding as imported charges
    else delete rec.expCha;
    // Fields from other segments remain intact in the database on edit; switching tabs does not erase them.
    rec.symbol = (rec.symbol || '').toUpperCase().trim();
    if (!rec.date) rec.date = new Date().toISOString().slice(0,10);
    const idx = trades.findIndex(x => String(x.id) === String(rec.id));
    if (isEdit && idx > -1) trades[idx] = rec; else trades.push(rec);
    DERIVED_TRADE_FIELDS.forEach(k => delete rec[k]); // P/L, P/L %, RRR, risk tag and losses are calculated, never stored
    saveData(); showToast(isEdit ? 'Trade updated' : 'Trade logged');
    if (!isEdit) page = 1;   // new trades: show the first page
    populateBrokerFilter(); renderTrades(); renderDashboard();
    inline.onSaved(rec);
  });
}
