// ======================================================================
// charges-rates.js — Default brokerage/tax rate tables for each broker and segment.
// ======================================================================
// All *.pct fields are fractions (0.001 = 0.1%), applied per-leg (buy/sell) or on turnover as noted.
const CHARGES_BROKERS = {
  fyers: {
    label: 'FYERS',
    segments: {
      equityDelivery:   { label: 'Capital Delivery',      brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.003 },  stt: { buy: 0.001, sell: 0.001 }, stamp: { buy: 0.00015 },  exch: { pct: 0.000030699 }, sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },    clearing: { pct: 0 },        gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
      equityIntraday:   { label: 'Capital Intraday',      brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.0003 }, stt: { sell: 0.00025 },           stamp: { buy: 0.00003 },  exch: { pct: 0.000030699 }, sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },    clearing: { pct: 0 },        gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
      futures:          { label: 'Futures',              brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.0003 }, stt: { sell: 0.0005 },            stamp: { buy: 0.00002 },  exch: { pct: 0.000018299 }, sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },    clearing: { pct: 0.000005 }, gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
      options:          { label: 'Options',              brokerage: { mode: 'flat', flat: 20 },                    stt: { sell: 0.0015 },            stamp: { buy: 0.00003 },  exch: { pct: 0.000355299 }, sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },    clearing: { pct: 0.00009 }, onPremium: true, gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
      currencyFutures:  { label: 'Currency Futures',     brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.0003 }, stt: {},                           stamp: { buy: 0.000001 }, exch: { pct: 0.0000035 },   sebi: { pct: 0.000001 }, ipft: { pct: 0.0000005 }, clearing: { pct: 0.000005 }, gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
      currencyOptions:  { label: 'Currency Options',     brokerage: { mode: 'flat', flat: 20 },                    stt: {},                           stamp: { buy: 0.000001 }, exch: { pct: 0.000311 },    sebi: { pct: 0.000001 }, ipft: { pct: 0.00002 },  clearing: { pct: 0.00009 }, onPremium: true, gstOn: ['brokerage','exch','sebi','ipft','clearing'] },
      commodityFutures: { label: 'Commodity Futures',    brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.0003 }, stt: { sell: 0.0001 },             stamp: { buy: 0.00002 },  exch: { pct: 0.000021 },    sebi: { pct: 0.000001 }, ipft: { pct: 0 },        clearing: { pct: 0.000018 }, gstOn: ['brokerage','exch','sebi','clearing'] },
      commodityOptions: { label: 'Commodity Options',    brokerage: { mode: 'flat', flat: 20 },                    stt: { sell: 0.0005 },             stamp: { buy: 0.00003 },  exch: { pct: 0.000418 },    sebi: { pct: 0.000001 }, ipft: { pct: 0 },        clearing: { pct: 0.0005 }, onPremium: true, gstOn: ['brokerage','exch','sebi','clearing'] }
    },
    mtf: {
      brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.003 },
      slabs: [ { max: 1000, rate: 0 }, { max: 100000, rate: 0.1649 }, { max: 1000000, rate: 0.1549 }, { max: 2500000, rate: 0.1449 }, { max: Infinity, rate: 0.1249 } ]
    },
    oneTime: [
      { title: 'Account & Demat', items: [
        ['Account opening', '₹0'], ['Demat AMC', '₹0'],
        ['Debit charges (sell)', '₹12.5 + GST per scrip'], ['Credit charges (buy)', '₹0'],
        ['Dematerialization', '₹0'], ['Rematerialization', '₹10/100 securities or ₹10/certificate, whichever higher (max ₹5,00,000)'],
        ['DDPI (online)', '₹0'], ['DDPI (offline)', '₹150 incl. GST']
      ]},
      { title: 'Pledge & MTF', items: [
        ['Margin pledge request', '₹5 + GST'], ['Margin unpledge', '₹0'],
        ['Margin pledge invocation', '₹5 + GST'], ['Margin re-pledge', '₹1 + GST'],
        ['MTF pledge request', '₹12 + GST'], ['MTF unpledge request', '₹12 + GST']
      ]},
      { title: 'Other & penalty charges', items: [
        ['Call & trade', '₹50 + GST per order'], ['Admin square-off', '₹50 + GST per order'],
        ['Physical contract note', '₹20 + courier'], ['Cheque bounce', '₹0'],
        ['Interest on ledger debit', '0.041% per day'], ['Physical statement', '₹50 + courier'],
        ['CML modification', '₹50 + GST'], ['KRA modification', '₹50 + GST'],
        ['Transfer to other demat', '₹12.5 + GST per scrip'], ['Transfer from other demat', '₹0'],
        ['Mutual funds & IPO brokerage', '₹0']
      ]}
    ]
  },
  groww: {
    label: 'Groww',
    segments: {
      equityDelivery:   { label: 'Capital Delivery',   brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.001, floor: 5 }, stt: { buy: 0.001, sell: 0.001 }, stamp: { buy: 0.00015 }, exch: { pct: 0.0000297 },  sebi: { pct: 0.000001 }, ipft: { pct: 0.000001 }, dp: { male: 20, female: 19.75 }, gstOn: ['brokerage','exch','sebi','ipft','dp'] },
      equityIntraday:   { label: 'Capital Intraday',   brokerage: { mode: 'minFlatPct', flat: 20, pct: 0.001, floor: 5 }, stt: { sell: 0.00025 },           stamp: { buy: 0.00003 }, exch: { pct: 0.0000297 },  sebi: { pct: 0.000001 }, ipft: { pct: 0.000001 }, gstOn: ['brokerage','exch','sebi','ipft'] },
      futures:          { label: 'Futures',           brokerage: { mode: 'flat', flat: 20 },                             stt: { sell: 0.0005 },            stamp: { buy: 0.00002 }, exch: { pct: 0.0000173 }, sebi: { pct: 0.000001 }, ipft: { pct: 0.000001 }, gstOn: ['brokerage','exch','sebi','ipft'] },
      options:          { label: 'Options',           brokerage: { mode: 'flat', flat: 20 },                             stt: { sell: 0.0015 },            stamp: { buy: 0.00003 }, exch: { pct: 0.0003503 }, sebi: { pct: 0.000001 }, ipft: { pct: 0.000005 }, onPremium: true, gstOn: ['brokerage','exch','sebi','ipft'] },
      commodityFutures: { label: 'Commodity Futures',  brokerage: { mode: 'flat', flat: 20 },                             stt: { sell: 0.0001 },            stamp: { buy: 0.00002 }, exch: { pct: 0.000021 },  sebi: { pct: 0.000001 }, ipft: { pct: 0 },       gstOn: ['brokerage','exch','sebi'] },
      commodityOptions: { label: 'Commodity Options',  brokerage: { mode: 'flat', flat: 20 },                             stt: { sell: 0.0005 },            stamp: { buy: 0.00003 }, exch: { pct: 0.000418 },  sebi: { pct: 0.000001 }, ipft: { pct: 0 },       onPremium: true, gstOn: ['brokerage','exch','sebi'] }
    },
    mtf: { brokerage: { mode: 'pctOfOrder', pct: 0.001 }, slabs: [ { max: Infinity, rate: 0.1495 } ] },
    oneTime: [
      { title: 'Account & Demat', items: [
        ['Account opening', '₹0'], ['Account maintenance (AMC)', '₹0'],
        ['DP charge (delivery sell)', '~₹20/scrip (₹3.5 depository + ₹16.5 Groww; ₹0 if sell value < ₹100)'],
        ['Demat / Remat', '₹150 + courier'], ['Failed demat transaction', '₹50 per ISIN']
      ]},
      { title: 'Pledge & MTF', items: [
        ['Pledge / Unpledge', '₹20 + 18% GST per ISIN/order'], ['Pledge invocation', '₹20'],
        ['MTF brokerage', '0.1% of order value'], ['MTF interest', '14.95% p.a.'],
        ['Intraday → MTF conversion', '0.1% per order']
      ]},
      { title: 'Other & penalty charges', items: [
        ['Auto square-off', '₹50 per position'], ['Delayed payment charges', '0.05% per day (incl. GST)'],
        ['Cash shortfall (commodity)', '0.045% per day'], ['API access', '₹499 per month'],
        ['KYC modification', '₹50'], ['Physical statement', '₹10 per page'], ['DDPI', '₹100 + GST'],
        ['Buyback / OFS brokerage', '₹20 per transaction'], ['Direct mutual fund commission', '₹0']
      ]}
    ]
  },
  kotak: {
    label: 'Kotak Neo',
    segments: {
      equityDelivery:  { label: 'Capital Delivery',  brokerage: { mode: 'cappedFlat', flat: 20, cap: 0.025 }, stt: { buy: 0.001, sell: 0.001 }, stamp: { buy: 0.00015 }, exch: { pct: 0.0000297 },  sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },     gstOn: ['brokerage','exch','sebi'] },
      equityIntraday:  { label: 'Capital Intraday',  brokerage: { mode: 'cappedFlat', flat: 20, cap: 0.025 }, stt: { sell: 0.00025 },           stamp: { buy: 0.00003 }, exch: { pct: 0.0000297 },  sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },     gstOn: ['brokerage','exch','sebi'] },
      futures:         { label: 'Futures',          brokerage: { mode: 'cappedFlat', flat: 20, cap: 0.025 }, stt: { sell: 0.0005 },            stamp: { buy: 0.00002 }, exch: { pct: 0.0000173 },  sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },     gstOn: ['brokerage','exch','sebi'] },
      options:         { label: 'Options',          brokerage: { mode: 'cappedFlat', flat: 20, cap: 0.025 }, stt: { sell: 0.0015 },            stamp: { buy: 0.00003 }, exch: { pct: 0.00035 },    sebi: { pct: 0.000001 }, ipft: { pct: 1e-9 },     onPremium: true, gstOn: ['brokerage','exch','sebi'] },
      currencyFutures: { label: 'Currency Futures', brokerage: { mode: 'cappedFlat', flat: 20, cap: 0.025 }, stt: {},                           stamp: { buy: 0.000001 }, exch: { pct: 0.000009 },  sebi: { pct: 0.000001 }, ipft: { pct: 0.0000005 }, gstOn: ['brokerage','exch','sebi'] },
      currencyOptions: { label: 'Currency Options', brokerage: { mode: 'cappedFlat', flat: 20, cap: 0.025 }, stt: {},                           stamp: { buy: 0.000001 }, exch: { pct: 0.00035 },   sebi: { pct: 0.000001 }, ipft: { pct: 0.00002 },  onPremium: true, gstOn: ['brokerage','exch','sebi'] },
      commodityFutures:{ label: 'Commodity Futures',brokerage: { mode: 'cappedFlat', flat: 20, cap: 0.025 }, stt: { sell: 0.0001 },             stamp: { buy: 0.00002 }, exch: { pct: 0.000026 },  sebi: { pct: 0.000001 }, ipft: { pct: 0 },        gstOn: ['brokerage','exch','sebi'] }
    },
    mtf: null,
    oneTime: [
      { title: 'What we have on file', items: [
        ['Brokerage cap', 'SEBI-mandated 2.5% of transaction value, on top of the flat ₹20/order'],
        ['GST', '18% on brokerage + SEBI charges + exchange transaction charges only (not on STT or stamp duty)']
      ]},
    ],
    missingOneTime: true
  }
};
// ----------------------------------------------------------------------
// Supplementary data taken from the three rate sheets (FYERS_Charges_List.xlsx,
// Groww_Charges_All_Segments.xlsx, Kotak_Charges_Calculator.xlsx):
//   * exch.name / exchAlt  — the exchange the main rate is for, plus the other exchanges' rates
//   * extra one-time / penalty / notes rows
//   * source              — where the figures came from
// ----------------------------------------------------------------------
CHARGES_BROKERS.fyers.source  = { file: 'FYERS_Charges_List.xlsx' };
CHARGES_BROKERS.groww.source  = { file: 'Groww_Charges_All_Segments.xlsx', asOf: '27 Sep 2026' };
CHARGES_BROKERS.kotak.source  = { file: 'Kotak_Charges_Calculator.xlsx', asOf: 'Sep 2026' };

// the main exchange rate in every built-in table is NSE, except commodity (MCX)
Object.keys(CHARGES_BROKERS).forEach(b => Object.keys(CHARGES_BROKERS[b].segments).forEach(sk => {
  CHARGES_BROKERS[b].segments[sk].exch.name = /^commodity/.test(sk) ? 'MCX' : 'NSE';
}));
// alternate exchange rates (fractions: 0.00375% = 0.0000375)
const _EXCH_ALT = {
  fyers: {
    equityDelivery:   [{ name: 'BSE', pct: 0.0000375 }],
    equityIntraday:   [{ name: 'BSE', pct: 0.0000375 }],
    currencyFutures:  [{ name: 'BSE', pct: 0.0000045 }],
    currencyOptions:  [{ name: 'BSE', pct: 0.00001 }],
    commodityFutures: [{ name: 'NSE', pct: 0.000001 }],
    commodityOptions: [{ name: 'NSE', pct: 0.00001 }]
  },
  groww: {
    equityDelivery:   [{ name: 'BSE – groups A, B, E, F, FC, G, GC, W, T', pct: 0.0000375 }, { name: 'BSE – all other groups', pct: 0.0000345 }, { name: 'BSE – groups X, XT, Z', pct: 0.001 }, { name: 'BSE – groups R, SS, ST, ZP', pct: 0.01 }],
    equityIntraday:   [{ name: 'BSE – groups A, B, E, F, FC, G, GC, W, T', pct: 0.0000375 }, { name: 'BSE – all other groups', pct: 0.0000345 }, { name: 'BSE – groups X, XT, Z', pct: 0.001 }, { name: 'BSE – groups R, SS, ST, ZP', pct: 0.01 }],
    futures:          [{ name: 'BSE', pct: 0 }],
    options:          [{ name: 'BSE', pct: 0.000325 }],
    commodityFutures: [{ name: 'NSE', pct: 0.000001 }],
    commodityOptions: [{ name: 'NSE', pct: 0.00001 }]
  }
};
Object.keys(_EXCH_ALT).forEach(b => Object.keys(_EXCH_ALT[b]).forEach(sk => {
  CHARGES_BROKERS[b].segments[sk].exchAlt = _EXCH_ALT[b][sk];
}));

// Extra one-time / penalty / note rows. Rows are [label, value]; a row whose label already exists in the
// group is left alone (the user's edits win), so this list is safe to re-apply (see topUpSavedChargeDefaults).
const _EXTRA_ONETIME = {
  fyers: [
    { title: 'Account & Demat', items: [
      ['Conversion of MF units / destatementisation', '₹0'], ['Reconversion / redemption / restatementisation (per SOA)', '₹0'],
      ['Failed / rejected transactions', '₹0'], ['Periodic statement – email', '₹0'], ['Adhoc / non-periodic statement requests', '₹0'],
      ['Delivery instruction book (10 leaves)', '₹150 + GST + courier at actuals']
    ]},
    { title: 'Pledge & MTF', items: [
      ['Auto pledge in favour of CUSPA', '₹5 + GST per request'], ['Release of pledge in favour of CUSPA', '₹5 + GST per request'],
      ['Confiscation / invocation of pledge by pledgee', '₹5 + GST per request'],
      ['Stamp duty', 'Applicable on confiscation / invocation — payable by the pledgee BO']
    ]},
    { title: 'Other & penalty charges', items: [
      ['Physical delivery', 'Lower of ₹20 or 0.3% per executed order'], ['OFS / buyback', 'Lower of ₹20 or 0.3% per executed order'],
      ['Expired / exercised / assigned F&O contracts', '₹0'], ['Payment gateway charges', '₹0'],
      ['Interest on cash-to-collateral violation', '0.041% per day'], ['Interest on outstanding bill', '18% per annum'],
      ['Erroneous transfer reversal', '₹100 + GST per transaction']
    ]},
    { title: 'Notes from the sheet', items: [
      ['Debit charges (sell) split', '₹3.5 CDSL + ₹9 FYERS + GST, per scrip'],
      ['BSE F&O exchange charges', 'Sheet lists, under Futures: Sensex 0.0325%; Bankex 0.0325%; Sensex 50 0.005%; Stock 0.005% (column placement looks odd — confirm on your contract note)'],
      ['Clearing charges – currency options', 'NSE 0.009%; BSE 0.0005% (the calculator uses the NSE rate)'],
      ['Commodity SEBI fee', '₹10/crore + GST (non-agri)'],
      ['Commodity STT/CTT', 'Sheet lists 0.01% (futures, non-agri) and 0.05% (options) on the sell side'],
      ['Exercised options', 'The options STT row in the sheet also mentions "on option exercised" — check your contract note for how it is applied']
    ]}
  ],
  groww: [
    { title: 'Account & Demat', items: [
      ['Depository charge (women)', '₹3.25 (concessional) + Groww ₹16.5'], ['Inter-settlement charges', 'Depository ₹3.5 + Groww ₹16.5 + GST'],
      ['Restat – SOA / redemption', '₹20 + GST'], ['Physical CMR (client master report)', '₹20 + courier'],
      ['Courier charges', 'Higher of ₹100 or actual'], ['Periodic / adhoc statement – email', 'Free'],
      ['Delivery instruction slip (DIS) – first 10 leaves', 'Free'], ['Delivery instruction slip (DIS) – additional 10 leaves', '₹100 + courier'],
      ['KRA upload / download', '₹50']
    ]},
    { title: 'Other & penalty charges', items: [
      ['Auction (unable to deliver)', 'Actual exchange penalty'], ['Buyback DP charge', '₹20 per company (₹0 if debit value < ₹100)'],
      ['Physical delivery of derivatives', '₹20 per executed transaction'],
      ['NRI equity brokerage', '0.10% per order (min ₹100) — delivery & intraday'], ['NRI F&O brokerage', '₹50 per order'],
      ['UPI mandate balance brokerage', '1% of order value (no cap) on trades funded via UPI mandate balance'],
      ['GST coverage', '18% on brokerage, DP, exchange, IPFT, SEBI, DPC, DDPI, KYC modification, API and auto square-off charges']
    ]},
    { title: 'Mutual funds', items: [
      ['Direct plans commission', '₹0'], ['Account / platform charges', '₹0'],
      ['Groww Prime (regular plans, opt-in, 2026)', 'Embedded trail commission, up to ~1.5% p.a. — built into NAV, not billed separately'],
      ['Exit load', 'Set by each scheme (charged by the AMC, not Groww)'],
      ['STT on equity MF units (sale)', '0.001%'], ['Stamp duty on MF purchase', '0.005%'],
      ['Expense ratio', 'Charged by the AMC, typically 0.1%–2.5% p.a., inside NAV']
    ]},
    { title: 'US stocks (discontinued — historical only)', items: [
      ['Status', 'New investing stopped Feb 2024; withdrawals closed mid-2024'],
      ['Last-known account opening / AMC / brokerage', '₹0 / ₹0 / ₹0 (may have changed before discontinuation)'],
      ['US exchange fee (sell)', '~$0.02 per sell order (user-reported, unverified)'],
      ['INR → USD remittance', 'Bank-dependent LRS charges + GST (charged by your bank)']
    ]}
  ],
  kotak: [
    { title: 'Notes from the sheet (Sep 2026)', items: [
      ['Brokerage', 'Flat ₹20/order on most plans; SEBI caps brokerage at 2.5% of transaction value'],
      ['GST', '18% on brokerage + SEBI charges + exchange transaction charges only (not STT, stamp duty or IPFT)'],
      ['STT revision (Budget 2026, from 1 Apr 2026)', 'Futures 0.02% → 0.05% of sell value; options 0.1% → 0.15% of sell premium'],
      ['Exercised options', 'STT is 0.15% of intrinsic value on the buyer — not modelled in the calculators'],
      ['Exchange charges', 'NSE rates (post Oct 2024 revision); BSE can differ by scrip group'],
      ['IPFT', '₹0.01/crore equity & equity F&O · ₹0.05/lakh currency futures · ₹2/lakh currency options · commodity not included (varies by exchange)'],
      ['Currency options exchange charge & stamp duty', 'Indicative approximations — confirm on your contract note'],
      ['Commodity futures', 'Exchange charge ~0.0026% is an indicative MCX rate and varies by commodity; CTT applies to non-agri only'],
      ['Commodity options', 'Not covered by the Kotak sheet']
    ]}
  ]
};
// add rows to a broker's oneTime list without overwriting anything already there
function mergeOneTimeGroups(target, groups) {
  groups.forEach(g => {
    let tg = target.find(x => x.title === g.title);
    if (!tg) { tg = { title: g.title, items: [] }; target.push(tg); }
    g.items.forEach(it => {
      if (!tg.items.some(x => String(x[0]).toLowerCase() === String(it[0]).toLowerCase())) tg.items.push([it[0], it[1]]);
    });
  });
}
Object.keys(_EXTRA_ONETIME).forEach(b => mergeOneTimeGroups(CHARGES_BROKERS[b].oneTime, _EXTRA_ONETIME[b]));
// FYERS debit-charge row now shows the CDSL/FYERS split
CHARGES_BROKERS.fyers.oneTime[0].items.forEach(it => { if (it[0] === 'Debit charges (sell)') it[1] = '₹12.5 + GST per scrip (₹3.5 CDSL + ₹9 FYERS)'; });
// Kotak: its sheet is calculator-focused, so account/DP/penalty charges are still not on file
CHARGES_BROKERS.kotak.oneTime = CHARGES_BROKERS.kotak.oneTime.filter(g => g.title !== 'What we have on file');
Object.keys(CHARGES_BROKERS).forEach(k => {
  if (CHARGES_BROKERS[k].gstRate === undefined) CHARGES_BROKERS[k].gstRate = 0.18;
});
