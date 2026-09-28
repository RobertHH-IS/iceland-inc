/* ---------------------------------------------------------------- 70_api.js
 * Browser API. createModel(opts?) -> model (see docs/SPEC.md section 9).
 * opts: {substeps: steps per month (default 1), params: {id: value} overrides, tol: solver tolerance}.
 * Flows are reported in % of baseline annual GDP at annual rates; stocks in % of baseline GDP.
 */
var BOND_SPLITS = [[0.4, 0, 0.6, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];   // B, CB, PF, HO
function LV(id, group, label, unit, min, max, stp, value, kind, description, options) {
  var o = { id: id, group: group, label: label, unit: unit, min: min, max: max, step: stp, value: value, baseline: kind === 'oneoff' ? 0 : value, kind: kind || 'setting', description: description };
  if (options) o.options = options;
  return o;
}
function leverList(p) {
  var pol = 'Policy', eco = 'Economy', wor = 'World', gdp = '% of GDP';
  return [
    LV('keyRateMode', pol, 'Key-rate setting', 'mode', 0, 1, 1, 0, 'setting', 'Follow the central bank\'s rule (plus any add-on), or hold the key rate fixed.',
      [{ value: 0, label: 'Rule (+ add-on)' }, { value: 1, label: 'Fixed' }]),
    LV('keyRateAddon', pol, 'Key rate: add-on to the rule', 'pp', -3, 5, 0.25, 0, 'setting', 'Sets the key rate this many points above (or below) what the rule says.'),
    LV('keyRateFixed', pol, 'Key rate: fixed level', '%', 0, 15, 0.25, round(p.i0 * 100, 2), 'setting', 'Used only when the key-rate setting is Fixed.'),
    LV('incomeTax', pol, 'Income-tax rate', 'pp', -10, 10, 0.5, 0, 'setting', 'Changes the average personal income-tax rate.'),
    LV('vat', pol, 'VAT rate', 'pp', -10, 10, 0.5, 0, 'setting', 'Changes the effective VAT rate on consumer spending; prices move at once.'),
    LV('health', pol, 'Health spending', gdp, -3, 3, 0.1, 0, 'setting', 'Real change in public health spending (staff wages and purchases).'),
    LV('education', pol, 'Education spending', gdp, -3, 3, 0.1, 0, 'setting', 'Real change in public education spending.'),
    LV('otherServices', pol, 'Other public services', gdp, -3, 3, 0.1, 0, 'setting', 'Real change in other public services (administration, police, culture, roads).'),
    LV('publicInvestment', pol, 'Public investment', gdp, -3, 3, 0.1, 0, 'setting', 'Real change in public investment bought from domestic firms.'),
    LV('oldAgeTransfers', pol, 'Old-age and disability transfers', gdp, -2, 2, 0.1, 0, 'setting', 'Real change in public pensions and disability benefits (mostly to the old).'),
    LV('familyBenefits', pol, 'Family and housing benefits', gdp, -2, 2, 0.1, 0, 'setting', 'Real change in child, parental-leave and housing benefits (young and working age).'),
    LV('unemploymentBenefits', pol, 'Unemployment benefit rate', 'pp of wage', -30, 30, 5, 0, 'setting', 'Changes the replacement rate paid automatically to the unemployed.'),
    LV('fiscalRule', pol, 'Debt-tied tax rule', 'switch', 0, 1, 1, 1, 'setting', 'When on, income tax slowly rises when government debt/GDP is above baseline (and falls when below).',
      [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }]),
    LV('bondBuyers', pol, 'Who buys new government bonds', 'choice', 0, 4, 1, 0, 'setting', 'Banks and the central bank pay with newly created money; pension funds and households pay with existing deposits.',
      [{ value: 0, label: 'Mix: 40% banks, 60% pension funds' }, { value: 1, label: 'Banks' }, { value: 2, label: 'Central bank' }, { value: 3, label: 'Pension funds' }, { value: 4, label: 'Older households' }]),
    LV('dstiCap', pol, 'Debt-service cap', 'pp', -15, 15, 1, 0, 'setting', 'Shifts the payment-to-income caps (40% first-time buyers, 35% others).'),
    LV('ltvCap', pol, 'Loan-to-value cap', '%', 0, 100, 5, 0, 'setting', '0 = off. Otherwise caps each group\'s mortgage debt at this share of its housing (young +5 pp).'),
    LV('wageSettlement', eco, 'Wage settlement', '%', -5, 20, 0.5, 10, 'oneoff', 'One-off jump in nominal wage rates, as after a collective agreement.'),
    LV('lendingAppetite', eco, 'Bank lending appetite', gdp + ' per yr', -3, 3, 0.25, 0, 'setting', 'Extra (or less) mortgage lending banks are willing to push, per year.'),
    LV('pfForeign', eco, 'Pension funds\' foreign allocation', 'pp of assets', -20, 20, 1, 0, 'setting', 'Shifts the target foreign share; funds move toward it through new flows, selling kronur.'),
    LV('migration', eco, 'Migration buffer', '%', 0, 80, 5, round(p.mig * 100, 0), 'setting', 'Share of job gains or losses met by workers arriving or leaving.'),
    LV('foreignDemand', wor, 'Foreign demand', '%', -20, 20, 1, 0, 'setting', 'Demand for Icelandic exports.'),
    LV('tourism', wor, 'Tourism', '%', -60, 30, 5, 0, 'setting', 'Foreign visitors\' spending.'),
    LV('kronaShock', wor, 'Krona sentiment shock', '%', -25, 25, 1, -10, 'oneoff', 'One-off shift in what investors think the krona is worth; fades slowly (about 10% of it a year).'),
    LV('foreignRate', wor, 'Foreign interest rate', 'pp', -3, 5, 0.25, 0, 'setting', 'Interest abroad; a higher rate pulls carry money out of kronur.'),
    LV('importPrices', wor, 'World prices', '%', -20, 40, 1, 0, 'setting', 'Foreign-currency prices of imports and of fish and aluminium.')
  ];
}
function leversToModel(lv, pend) {
  var v = {}; lv.forEach(function (x) { v[x.id] = x.value; });
  return {
    rateMode: v.keyRateMode, rateAddon: v.keyRateAddon / 100, rateFixed: v.keyRateFixed / 100,
    dTau: v.incomeTax / 100, dVat: v.vat / 100, gH: v.health, gE: v.education, gO: v.otherServices, gI: v.publicInvestment,
    dOA: v.oldAgeTransfers, dFam: v.familyBenefits, dRR: v.unemploymentBenefits / 100, fiscalRule: v.fiscalRule,
    split: BOND_SPLITS[Math.round(v.bondBuyers)] || BOND_SPLITS[0], dDsti: v.dstiCap / 100, ltv: v.ltvCap / 100,
    lend: v.lendingAppetite, pfForeign: v.pfForeign / 100, mig: v.migration / 100,
    fdem: 1 + v.foreignDemand / 100, tour: 1 + v.tourism / 100, dIF: v.foreignRate / 100, pf: 1 + v.importPrices / 100,
    wageJump: pend.wage ? Math.log(1 + pend.wage / 100) : 0, sentJump: pend.krona ? -Math.log(1 + pend.krona / 100) : 0
  };
}

function createModel(opts) {
  opts = opts || {};
  var sub = Math.max(1, Math.round(opts.substeps || 1)), HIST = 600;
  var built = buildParams(Object.assign({ tol: opts.tol || 1e-10, maxIter: 200 }, opts.params || {}));
  var ss = steadyState(built.p), p = ss.p;
  p.dt = 1 / (12 * sub);
  built.list.forEach(function (x) { if (x.value === null) x.value = p[x.id]; });
  var nY = 12 * sub, s, levers, pend, events, hist, ciHist, ciTHist, monthRows, monthRec, acc, base;

  function fresh() {
    var st = JSON.parse(JSON.stringify(ss.st));
    st.p = p; st.b = ss.b; st.bs = new Float64Array(ss.bs); st.open = new Float64Array(NS * NI); st.L = new Ledger();
    st.maxRes = { row: 0, col: 0, instr: 0, fof: 0, recon: 0 }; st.lastRes = { row: 0, col: 0, instr: 0, fof: 0, recon: 0 };
    st.hP = []; for (var j = 0; j < nY; j++) st.hP.push(1);
    return st;
  }
  // one month = `sub` steps; rows and pair records are accumulated over the month
  function month(st, lev) {
    monthRows.fill(0); monthRec.length = 0; acc.nl = 0; acc.dLF = 0;
    for (var j = 0; j < sub; j++) {
      var L = step(st, lev);
      for (var q = 0; q < monthRows.length; q++) monthRows[q] += L.rows[q];
      for (q = 0; q < L.rec.length; q++) monthRec.push(L.rec[q]);
      acc.nl += (st.X.nl[0] + st.X.nl[1]) / sub; acc.dLF += st.X.dLF;
      lev.wageJump = 0; lev.sentJump = 0;
    }
    acc.dLF *= 12;   // firm net borrowing over the month, annual rate
  }
  function measure(st) {
    var nlm = acc.nl, nlt = acc.nl + acc.dLF;
    ciHist.push(nlm); ciTHist.push(nlt); if (ciHist.length > 13) { ciHist.shift(); ciTHist.shift(); }
    var m = { s: st, p: p, L: { rows: monthRows }, dt: 1 / 12, nlm: nlm, ci: nlm - ciHist[0], ciT: nlt - ciTHist[0] };
    var out = {}; SERIES.forEach(function (x) { out[x.id] = x.fn(m); });
    return out;
  }
  function devOf(x, v) { var bv = base.levels[x.id]; return x.dev === 'pct' ? (v / bv - 1) * 100 : v - bv; }
  function record() {
    var lv = measure(s);
    hist.t.push(Math.round(s.t * 12));
    SERIES.forEach(function (x) { hist.v[x.id].push(devOf(x, lv[x.id])); });
    if (hist.t.length > HIST + 1) { hist.t.shift(); SERIES.forEach(function (x) { hist.v[x.id].shift(); }); }
  }
  function snapshotFlows() {
    return { rows: new Float64Array(monthRows), rec: monthRec.slice(), bs: new Float64Array(s.bs) };
  }
  function init() {
    monthRows = new Float64Array(ROWS.length * NS); monthRec = []; acc = { nl: 0, dLF: 0 };
    levers = leverList(p); pend = {}; events = [];
    ciHist = []; ciTHist = []; for (var j = 0; j < 13; j++) { ciHist.push(0); ciTHist.push(0); }
    // baseline: one quiet month from the steady state (identical to the steady state: no drift)
    if (!base) {
      var st0 = fresh(); month(st0, leversToModel(levers, {}));
      s = st0; base = { levels: measure(st0), flows: snapshotFlows() };
      ciHist = []; ciTHist = []; for (j = 0; j < 13; j++) { ciHist.push(0); ciTHist.push(0); }
    }
    s = fresh(); hist = { t: [0], v: {} };
    SERIES.forEach(function (x) { hist.v[x.id] = [0]; });
    monthRows.set(base.flows.rows); monthRec = base.flows.rec.slice();
  }
  init();

  function lever(id) { for (var j = 0; j < levers.length; j++) if (levers[j].id === id) return levers[j]; throw new Error('unknown lever ' + id); }
  function fmt(x) { var o = x.options && x.options.filter(function (z) { return z.value === x.value; })[0]; return o ? o.label : (x.value > 0 && x.unit !== '%' ? '+' : '') + x.value + ' ' + x.unit; }
  function tpl(txt) {   // fill {id}, {id%}, {id pp} with live parameter values
    return txt.replace(/\{(\w+)( pp|%)?\}/g, function (m0, k, u) {
      var v = p[k]; if (typeof v !== 'number') return m0;
      if (u === '%') return +(v * 100).toPrecision(3) + '%';
      if (u === ' pp') return +(v * 100).toPrecision(3) + ' pp';
      return String(+v.toPrecision(3));
    });
  }

  var model = {
    sectors: SECTORS.map(function (x) { return Object.assign({}, x); }),
    instruments: INSTRUMENTS.map(function (x) { return Object.assign({}, x); }),
    seriesMeta: SERIES.map(function (x) { return { id: x.id, label: x.label, unit: x.unit, group: x.group, description: x.what }; }),
    feedRules: FEED_RULES.slice(),
    params: built.list,
    get t() { return Math.round(s.t * 12); },
    get levers() { return levers; },
    get events() { return events; },
    reset: function () { init(); return model; },
    step: function (n) {
      n = n === undefined ? 1 : n;
      for (var j = 0; j < n; j++) {
        var lev = leversToModel(levers, pend); pend = {};
        month(s, lev); record();
      }
      return model;
    },
    setLever: function (id, value) {
      var x = lever(id);
      if (x.kind === 'oneoff') { x.value = clamp(+value, x.min, x.max); return model; }   // sets the size; fire() applies it
      x.value = clamp(+value, x.min, x.max);
      events.push({ t: model.t, id: id, label: x.label + ': ' + fmt(x) });
      return model;
    },
    fire: function (id, size) {
      var x = lever(id);
      if (x.kind !== 'oneoff') throw new Error(id + ' is a setting; use setLever');
      var v = size === undefined ? x.value : clamp(+size, x.min, x.max);
      if (id === 'wageSettlement') pend.wage = (pend.wage || 0) + v; else pend.krona = (pend.krona || 0) + v;
      events.push({ t: model.t, id: id, label: x.label + ': ' + (v > 0 ? '+' : '') + v + '%' });
      return model;
    },
    series: function (id) {
      var v = hist.v[id]; if (!v) throw new Error('unknown series ' + id);
      return v.map(function (z, j) { return { t: hist.t[j], v: z }; });
    },
    value: function (id) { var v = hist.v[id]; if (!v) throw new Error('unknown series ' + id); return v[v.length - 1]; },
    flows: function () {
      var out = [], k = 12;   // month total -> annual rate
      ROWS.forEach(function (r, q) {
        var e = {}, be = {}, any = false;
        for (var j = 0; j < NS; j++) {
          var a = monthRows[q * NS + j] * k, c = base.flows.rows[q * NS + j] * k;
          if (Math.abs(a) > 1e-12 || Math.abs(c) > 1e-12) { e[SECTORS[j].id] = a; be[SECTORS[j].id] = c; any = true; }
        }
        if (any) { var o = { row: r.id, rowLabel: r.label, kind: r.kind, type: r.type, entries: e, baselineEntries: be }; if (r.channel) o.channel = r.channel; out.push(o); }
      });
      return out;
    },
    pairFlows: function () {
      var map = {}, list = [];
      function add(rec, field) {
        for (var j = 0; j < rec.length; j += 5) {
          var r = ROWS[rec[j]], key = rec[j + 1] + '|' + rec[j + 2] + '|' + r.kind, o = map[key];
          if (!o) { o = map[key] = { from: SECTORS[rec[j + 1]].id, to: SECTORS[rec[j + 2]].id, kind: r.kind, value: 0, baseline: 0, rows: [] }; list.push(o); }
          o[field] += rec[j + 4] * 12;
          if (o.rows.indexOf(r.id) < 0) o.rows.push(r.id);
        }
      }
      add(monthRec, 'value'); add(base.flows.rec, 'baseline');
      return list;
    },
    balanceSheet: function (id) {
      var sec = SECTORS.findIndex(function (x) { return x.id === id; });
      if (sec < 0) throw new Error('unknown sector ' + id);
      var A = [], Lb = [], nw = 0, nw0 = 0;
      for (var k = 0; k < NI; k++) {
        var v = s.bs[sec * NI + k], v0 = base.flows.bs[sec * NI + k];
        if (Math.abs(v) < 1e-12 && Math.abs(v0) < 1e-12) continue;
        var asset = v0 > 0 || (v0 === 0 && v > 0), o = { instrument: INSTRUMENTS[k].id, label: INSTRUMENTS[k].label, value: asset ? v : -v, baseline: asset ? v0 : -v0 };
        (asset ? A : Lb).push(o); nw += v; nw0 += v0;
      }
      var out = { assets: A, liabilities: Lb, netWorth: nw, netWorthBaseline: nw0 };
      if (sec <= HO) out.memo = [{ instrument: 'housing', label: 'Homes (non-financial, memo)', value: s.b.H[sec] * s.qh * s.P, baseline: s.b.H[sec] }];
      return out;
    },
    explain: function (id) {
      var r = ROWS[ROW_IX[id]], x = SERIES[SERIES_IX[id]], o = r || x;
      if (!o) return null;
      return { title: r ? r.label : x.label, what: o.what, rule: tpl(o.rule), category: o.category,
        params: o.params.map(function (pid) { var mt = built.list.filter(function (z) { return z.id === pid; })[0]; return mt ? { id: pid, value: mt.value, unit: mt.unit, basis: mt.basis } : { id: pid }; }),
        source: r ? 'Transaction row "' + r.id + '" (' + r.type + ', ' + r.kind + '); equations in docs/SPEC.md; parameters in engine/src/10_params.js.'
          : 'Series "' + x.id + '", shown as ' + (x.dev === 'pct' ? '% deviation' : 'difference') + ' from the steady-state baseline; docs/SPEC.md.' };
    },
    checks: function () { return { last: Object.assign({}, s.lastRes), max: Object.assign({}, s.maxRes), solverIterations: s.iter || 1, gdpCheck: ss.b.gdpCheck }; },
    credit: function () {
      var c = s.cred || [];
      return ['HY', 'HW'].map(function (id, j) { var z = c[j] || {}; return { sector: id, desired: z.desired, lending: z.lending, dstiCap: z.dstiCap, ltvCap: z.ltvCap, binding: z.binding || 'none' }; });
    },
    steadyState: function () {
      var solved = {}; built.list.forEach(function (x) { if (/^calibrated/.test(x.basis)) solved[x.id] = p[x.id]; });
      return { solved: solved, flows: ss.b.flows, gdpCheck: ss.b.gdpCheck, warnings: ss.b.warnings, levels: Object.assign({}, base.levels) };
    },
    _state: function () { return s; }
  };
  return model;
}
