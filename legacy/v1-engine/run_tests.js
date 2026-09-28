'use strict';
// Iceland Inc. engine v1 test suite. Runs against the BUILT browser bundle (build/iceland-inc-engine.js),
// loaded with new Function exactly as a browser would. Usage: node build.js && node run_tests.js
// Output is printed and saved to test_output.txt.
const fs = require('fs');
const path = require('path');
const BUNDLE = path.join(__dirname, 'build', 'iceland-inc-engine.js');
const src = fs.readFileSync(BUNDLE, 'utf8');
const I = new Function(src + '\nreturn IcelandInc;')();
const C = require('./tools/calibration_checks.js');

const lines = [];
const log = (...a) => { const s = a.join(' '); lines.push(s); console.log(s); };
const hr = (t) => log('\n' + '='.repeat(104) + '\n' + t + '\n' + '='.repeat(104));
const f = (v, d = 2, w = 8) => { const x = Math.abs(v) < 0.5 * 10 ** -d ? 0 : v; return ((x >= 0 ? '+' : '') + x.toFixed(d)).padStart(w); };
const e2 = (v) => v.toExponential(2);
const ALL = [];   // every model run, for the accounting summary
let failures = 0;
const verdict = (ok) => { if (!ok) failures++; return ok ? 'PASS' : 'FAIL'; };
function sim(opts, sched, months, name) {
  const m = I.createModel(opts);
  for (let t = 0; t < months; t++) { if (sched[t]) sched[t](m); m.step(1); }
  ALL.push([name, m]);
  return m;
}
const S = (m, id) => m.series(id).map((p) => p.v);

// ------------------------------------------------------------------------------- 0. bundle ----
hr('0. Browser bundle');
{
  const top = src.trim();
  const ok = top.startsWith('var IcelandInc = (function () {') && top.endsWith('})();') && !/\brequire\s*\(|module\.exports|process\.(env|argv)/.test(src);
  log(`file ${path.relative(__dirname, BUNDLE)}: ${(src.length / 1024).toFixed(1)} KB; single top-level statement "var IcelandInc = (function(){...})();": ${verdict(ok)}`);
  const newest = Math.max(...fs.readdirSync(path.join(__dirname, 'src')).map((x) => fs.statSync(path.join(__dirname, 'src', x)).mtimeMs));
  log(`bundle is newer than every src/ module: ${verdict(fs.statSync(BUNDLE).mtimeMs >= newest)}`);
  // browser-like realm: a fresh vm context has only standard JS globals (no require, process, module, Buffer)
  const vmOut = require('vm').runInNewContext("var M = new Function(SRC + '\\nreturn IcelandInc;')().createModel(); M.fire('wageSettlement', 10); M.step(24); " +
    "[typeof require, typeof process, M.value('inflation')]", { SRC: src });
  log(`loads with new Function in a bare JS realm (no Node globals: require ${vmOut[0]}, process ${vmOut[1]}); 24 months run, inflation dev ${vmOut[2].toFixed(3)} pp: ${verdict(vmOut[0] === 'undefined' && isFinite(vmOut[2]))}`);
  const m = I.createModel(); const t0 = process.hrtime.bigint(); m.step(600); const us = Number(process.hrtime.bigint() - t0) / 1e3 / 600;
  log(`speed: ${us.toFixed(1)} microseconds per month in Node (budget 3,000 per month in a browser): ${verdict(us < 3000)}`);
}

// ------------------------------------------------------------------------------- 1. steady state
hr('1. Computed steady state (zero inflation, zero real growth; baseline annual GDP = 100)');
{
  const m = I.createModel(), ss = m.steadyState(), fl = ss.flows;
  log('solved balancing parameters (calibrated to target):');
  const sv = Object.entries(ss.solved).filter(([k]) => ['tau0', 'tauF', 'vat0', 'cEe', 'rr', 'wsOther', 'muD', 'muXD', 'divFXW', 'rhoFD0', 'rhoFX0', 'c0Y', 'c0W', 'c0O', 'payout', 'ageing', 'nuY', 'nuW', 'mRY', 'mRW'].includes(k));
  for (let j = 0; j < sv.length; j += 5) log('  ' + sv.slice(j, j + 5).map(([k, v]) => `${k}=${v.toFixed(4)}`).join('  '));
  log(`baseline flows (% of GDP): consumption ${fl.C.toFixed(2)} (young ${fl.Cg[0].toFixed(2)}, working ${fl.Cg[1].toFixed(2)}, old ${fl.Cg[2].toFixed(2)}); public services ${fl.gServ.toFixed(2)}; investment ${fl.investment.toFixed(2)}; exports ${fl.exports.toFixed(2)}; imports ${fl.IM.toFixed(2)}`);
  log(`  exporters' domestic inputs ${fl.xd.toFixed(2)}; profits FD ${fl.PiFD.toFixed(2)}, FX ${fl.PiFX.toFixed(2)}; distributed profit FD ${fl.divFD.toFixed(2)}, FX ${fl.divFX.toFixed(2)} (to foreign owners ${fl.divForeign.toFixed(2)})`);
  log(`  taxes: income ${fl.incomeTax.toFixed(2)}, VAT ${fl.VAT.toFixed(2)}, corporate ${fl.corpTax.toFixed(2)}, payroll ${fl.payTax.toFixed(2)}; govt interest ${fl.govInterest.toFixed(2)}`);
  log(`  pensions: contributions ${fl.CON.toFixed(2)}, fund income ${fl.incPF.toFixed(2)}, payouts ${fl.PAY.toFixed(2)} (stationary: payouts = contributions + income)`);
  log(`  bank profit ${fl.profB.toFixed(2)}, central bank profit ${fl.profCB.toFixed(3)}`);
  log(`GDP identity C + G + I + X - IM - 100 (NOT imposed, must come out 0): ${e2(ss.gdpCheck)}  ${verdict(Math.abs(ss.gdpCheck) < 1e-9)}`);
  log(`steady-state warnings: ${ss.warnings.length ? ss.warnings.join('; ') : 'none'}`);
  const lv = ss.levels;
  log(`baseline levels: unemployment ${lv.unemployment.toFixed(2)}% (young ${lv.unemploymentY.toFixed(2)}, working ${lv.unemploymentW.toFixed(2)}, old ${lv.unemploymentO.toFixed(2)}); key rate ${lv.keyRate.toFixed(2)}%; ` +
    `broad money ${lv.broadMoney.toFixed(1)}% of GDP; mortgage debt ${lv.mortgageDebt.toFixed(1)}%; government debt ${lv.govDebt.toFixed(1)}%; pension assets ${lv.pfAssets.toFixed(1)}%; bank capital ${lv.bankCapital.toFixed(1)}%`);
  const nPh = m.params.filter((x) => /^placeholder/.test(x.basis)).length, nData = m.params.filter((x) => /^data/.test(x.basis)).length;
  log(`parameters: ${m.params.length} total, ${nData} from data, ${nPh} flagged placeholder, ${m.params.filter((x) => /^calibrated/.test(x.basis)).length} calibrated to target, rest assumed`);
}

// ------------------------------------------------------------------------------- 2. drift ------
hr('2. No-shock run, 240 months: maximum absolute deviation from the steady state (every series, balance sheet)');
{
  const m = sim({}, {}, 240, 'baseline-240');
  let worst = 0, wid = '';
  for (const x of m.seriesMeta) { const d = Math.max(...S(m, x.id).map(Math.abs)); if (d > worst) { worst = d; wid = x.id; } }
  const st = m._state(), ss = I.createModel()._state();
  let bsd = 0; for (let j = 0; j < st.bs.length; j++) bsd = Math.max(bsd, Math.abs(st.bs[j] - ss.bs[j]));
  const show = ['output', 'inflation', 'keyRate', 'unemployment', 'broadMoney', 'mortgageDebt', 'govDebt', 'krona', 'realHousePrice', 'pfAssets'];
  for (const id of show) log(`  ${id.padEnd(16)} max |deviation| = ${e2(Math.max(...S(m, id).map(Math.abs)))}`);
  log(`all ${m.seriesMeta.length} series: max |deviation| = ${e2(worst)} (${wid}); balance-sheet entries: max |change| = ${e2(bsd)}   ${verdict(worst < 1e-9 && bsd < 1e-9)}`);
}

// ------------------------------------------------------------------------------- 3. calibration
hr('3. Calibration checks (published-style whole-model responses; CHECKS, never equations)');
const SC = C.scenarios(I, {});
for (const k of Object.keys(SC)) ALL.push(['calib-' + k, SC[k]]);
{
  const ck = C.checks(SC);
  log('scenario'.padEnd(36) + 'target'.padEnd(66) + 'result'.padEnd(34) + 'verdict');
  for (const x of ck) log(x.scenario.padEnd(36) + x.target.padEnd(66) + x.result.padEnd(34) + verdict(x.pass));
  log(`${ck.filter((x) => x.pass).length} of ${ck.length} checks pass; smallest margin inside a band: ${Math.min(...ck.map((x) => x.margin)).toFixed(2)} of the band width`);
}

// ------------------------------------------------------------------------------- 4. scenario tables
const MONTHS = [3, 6, 12, 18, 24, 36, 48, 72];
function table(m, ids, months = MONTHS) {
  log('series'.padEnd(40) + 'unit'.padEnd(26) + months.map((t) => ('m' + t).padStart(8)).join(''));
  for (const id of ids) {
    const meta = m.seriesMeta.find((x) => x.id === id), a = S(m, id);
    log(meta.label.slice(0, 39).padEnd(40) + meta.unit.slice(0, 25).padEnd(26) + months.map((t) => f(a[t])).join(''));
  }
}
const CORE = ['output', 'unemployment', 'unemploymentY', 'inflation', 'priceLevel', 'expInflation', 'keyRate', 'krona', 'realWage', 'consumption', 'investment',
  'exports', 'broadMoney', 'netMortgage', 'creditImpulse', 'realHousePrice', 'govBalance', 'govDebt', 'rdiY', 'rdiW', 'rdiO', 'profitsFD', 'profitsFX', 'pfAssets'];
hr('4a. Key rate: rule + 1 pp add-on for 8 quarters (deviations from the steady-state baseline)');
table(SC.rate, CORE);
hr('4b. Wages +10% one-off, key rate on its rule');
table(SC.wage, CORE);
hr('4c. Government purchases (other public services) +1% of GDP, permanent: who buys the bonds decides the money');
{
  const g3 = sim({}, { 0: (m) => { m.setLever('bondBuyers', 2); m.setLever('otherServices', 1); } }, 72, 'g-cb');
  const g4 = sim({}, { 0: (m) => { m.setLever('bondBuyers', 4); m.setLever('otherServices', 1); } }, 72, 'g-ho');
  log('month'.padEnd(8) + ['M3 banks', 'M3 CB', 'M3 PF', 'M3 old hh', 'y banks', 'y PF', 'debt/GDP', 'tax rate'].map((x) => x.padStart(11)).join(''));
  for (const t of [6, 12, 24, 36, 48, 72]) log(String(t).padEnd(8) + [S(SC.gBank, 'broadMoney')[t], S(g3, 'broadMoney')[t], S(SC.gPF, 'broadMoney')[t], S(g4, 'broadMoney')[t],
    S(SC.gBank, 'output')[t], S(SC.gPF, 'output')[t], S(SC.gBank, 'govDebt')[t], S(SC.gBank, 'incomeTaxRate')[t]].map((v) => f(v, 3, 11)).join(''));
  log('(broad money = deposits of households, firms and pension funds, % vs baseline. Banks and the central bank pay with new money; pension funds and');
  log(' households pay with existing deposits, so money only grows as they later rebalance by selling bonds to banks.)');
}
hr('4d. Krona sentiment shock -10% (fades at about 10% a year): pass-through');
table(SC.krona, ['krona', 'priceLevel', 'inflation', 'keyRate', 'exports', 'imports', 'currentAccount', 'profitsFX', 'realWage', 'pfAssets'], [1, 3, 6, 12, 24, 36, 48, 72]);
hr('4e. Bank lending appetite +1% of GDP per year: 12 months vs held (credit impulse = change in the yearly credit flow)');
{
  log('month'.padEnd(8) + ['net lend 12m', 'CI 12m', 'CI tot 12m', 'money 12m', 'house pr 12m', 'net lend held', 'CI held', 'debt/GDP held'].map((x) => x.padStart(14)).join(''));
  for (const t of [1, 3, 6, 9, 12, 13, 15, 18, 24, 30, 36, 48, 60, 72]) log(String(t).padEnd(8) + [S(SC.lend12, 'netMortgage')[t], S(SC.lend12, 'creditImpulse')[t], S(SC.lend12, 'creditImpulseTotal')[t],
    S(SC.lend12, 'broadMoney')[t], S(SC.lend12, 'realHousePrice')[t], S(SC.lendHeld, 'netMortgage')[t], S(SC.lendHeld, 'creditImpulse')[t], S(SC.lendHeld, 'mortgageDebt')[t]].map((v) => f(v, 3, 14)).join(''));
  const tight = sim({}, { 0: (m) => { m.setLever('dstiCap', -12); m.setLever('lendingAppetite', 1); } }, 24, 'lend-dsti');
  const ltv = sim({}, { 0: (m) => { m.setLever('ltvCap', 60); m.setLever('lendingAppetite', 1); } }, 24, 'lend-ltv');
  log(`binding constraint per group after 24 months: DSTI cap -12 pp -> ${JSON.stringify(tight.credit().map((c) => c.sector + ':' + c.binding))}; LTV cap 60% -> ${JSON.stringify(ltv.credit().map((c) => c.sector + ':' + c.binding))}`);
}

// ------------------------------------------------------------------------------- 5. combined policy
hr('5. Combined policy (the core teaching interaction): wages +10%, then at month 3 the key-rate add-on +1 pp for 24 months');
let comb, wOnly;
{
  wOnly = SC.wage;
  comb = sim({}, { 0: (m) => m.fire('wageSettlement', 10), 3: (m) => m.setLever('keyRateAddon', 1), 27: (m) => m.setLever('keyRateAddon', 0) }, 72, 'combined');
  const ids = ['output', 'unemployment', 'unemploymentY', 'inflation', 'priceLevel', 'keyRate', 'krona', 'realWage', 'realHousePrice', 'rdiY', 'rdiW', 'rdiO', 'govDebt'];
  log('series'.padEnd(34) + 'case'.padEnd(10) + MONTHS.map((t) => ('m' + t).padStart(8)).join(''));
  for (const id of ids) {
    const lab = comb.seriesMeta.find((x) => x.id === id).label.slice(0, 33);
    log(lab.padEnd(34) + 'wages'.padEnd(10) + MONTHS.map((t) => f(S(wOnly, id)[t])).join(''));
    log(''.padEnd(34) + '+ rate'.padEnd(10) + MONTHS.map((t) => f(S(comb, id)[t])).join(''));
  }
  const pk = (a, sgn = 1) => { let j = 1; for (let k = 1; k < a.length; k++) if (sgn * a[k] > sgn * a[j]) j = k; return [a[j], j]; };
  const rows = [['inflation peak, pp', 'inflation', 1], ['unemployment peak, pp', 'unemployment', 1], ['young unemployment peak, pp', 'unemploymentY', 1], ['output trough, %', 'output', -1], ['key-rate peak, pp', 'keyRate', 1]];
  log('\nkey numbers'.padEnd(35) + 'wages only'.padStart(22) + 'wages + rate'.padStart(22));
  for (const [lab, id, sg] of rows) { const [a, ja] = pk(S(wOnly, id), sg), [b, jb] = pk(S(comb, id), sg); log(lab.padEnd(34) + (f(a) + ' @m' + ja).padStart(22) + (f(b) + ' @m' + jb).padStart(22)); }
  log('price level after 2 / 6 years, %'.padEnd(34) + (f(S(wOnly, 'priceLevel')[24]) + ' /' + f(S(wOnly, 'priceLevel')[72])).padStart(22) + (f(S(comb, 'priceLevel')[24]) + ' /' + f(S(comb, 'priceLevel')[72])).padStart(22));
  const cum = (m, id) => S(m, id).slice(1, 73).reduce((a, b) => a + b, 0) / 12;
  log('cumulative output, %-years (6 yrs)'.padEnd(34) + f(cum(wOnly, 'output')).padStart(22) + f(cum(comb, 'output')).padStart(22));
  log('cumulative inflation, pp-years'.padEnd(34) + f(cum(wOnly, 'inflation')).padStart(22) + f(cum(comb, 'inflation')).padStart(22));
}
hr('6. Wages +10% plus health and education spending cut by 0.5% of GDP each (permanent, from month 0)');
{
  const cut = sim({}, { 0: (m) => { m.fire('wageSettlement', 10); m.setLever('health', -0.5); m.setLever('education', -0.5); } }, 72, 'wage+cuts');
  const ids = ['output', 'unemployment', 'unemploymentY', 'inflation', 'priceLevel', 'keyRate', 'govBalance', 'govDebt', 'incomeTaxRate', 'rdiY', 'rdiW', 'rdiO'];
  log('series'.padEnd(34) + 'case'.padEnd(10) + MONTHS.map((t) => ('m' + t).padStart(8)).join(''));
  for (const id of ids) {
    const lab = cut.seriesMeta.find((x) => x.id === id).label.slice(0, 33);
    log(lab.padEnd(34) + 'wages'.padEnd(10) + MONTHS.map((t) => f(S(wOnly, id)[t])).join(''));
    log(''.padEnd(34) + '+ cuts'.padEnd(10) + MONTHS.map((t) => f(S(cut, id)[t])).join(''));
  }
}

// ------------------------------------------------------------------------------- 7. distribution
hr('7. Distribution: real disposable income by age group, % vs baseline (cash basis: after tax and mortgage interest)');
for (const [nm, m] of [['wages +10% (rule)', SC.wage], ['key rate +1 pp for 8 quarters', SC.rate], ['combined: wages +10%, rate +1 pp from month 3', comb]]) {
  log(`\n${nm}`);
  log('group'.padEnd(34) + MONTHS.map((t) => ('m' + t).padStart(8)).join(''));
  for (const [lab, id] of [['young 18-34', 'rdiY'], ['working age 35-66', 'rdiW'], ['old 67+', 'rdiO'], ['memo: unemployment young, pp', 'unemploymentY'], ['memo: real wage', 'realWage']])
    log(lab.padEnd(34) + MONTHS.map((t) => f(S(m, id)[t])).join(''));
}

// ------------------------------------------------------------------------------- 8. numerics
hr('8. Numerical sensitivity: max |difference| in the shocked-minus-baseline response, months 1-72');
{
  const lev = { wage: { 0: (m) => m.fire('wageSettlement', 10) }, rate: { 0: (m) => m.setLever('keyRateAddon', 1), 24: (m) => m.setLever('keyRateAddon', 0) } };
  const ids = ['output', 'inflation', 'keyRate', 'unemployment', 'mortgageDebt', 'krona'];
  log('scenario  series'.padEnd(26) + ['tol 1e-10 vs 1e-13', '1 vs 2 steps/month', '2 vs 4 steps/month', 'peak |response|'].map((x) => x.padStart(20)).join(''));
  for (const nm of ['wage', 'rate']) {
    const ref = sim({}, lev[nm], 72, nm + '-ref'), tight = sim({ tol: 1e-13 }, lev[nm], 72, nm + '-tol'), h2 = sim({ substeps: 2 }, lev[nm], 72, nm + '-2'), h4 = sim({ substeps: 4 }, lev[nm], 72, nm + '-4');
    const d = (a, b, id) => Math.max(...S(a, id).map((v, j) => Math.abs(v - S(b, id)[j])));
    for (const id of ids) log(`${nm.padEnd(10)}${id.padEnd(16)}` + [e2(d(ref, tight, id)), d(ref, h2, id).toFixed(4), d(h2, h4, id).toFixed(4), Math.max(...S(ref, id).map(Math.abs)).toFixed(3)].map((x) => x.padStart(20)).join(''));
  }
  log('(one-step lags make results depend on the step length at O(dt): halving the step roughly halves the difference.)');
}

// ------------------------------------------------------------------------------- 9. API contract
hr('9. API contract checks (flows, pair flows, balance sheets, levers, events)');
{
  const m = comb;
  const fl = m.flows();
  const rowRes = Math.max(...fl.map((r) => Math.abs(Object.values(r.entries).reduce((a, b) => a + b, 0))));
  const baseRes = Math.max(...fl.map((r) => Math.abs(Object.values(r.baselineEntries).reduce((a, b) => a + b, 0))));
  log(`flows(): ${fl.length} rows (kinds ${[...new Set(fl.map((r) => r.kind))].join('/')}), max |row sum| now ${e2(rowRes)}, baseline ${e2(baseRes)}   ${verdict(rowRes < 1e-9 && baseRes < 1e-9)}`);
  const pf = m.pairFlows(), net = {};
  for (const p of pf) { net[p.from] = (net[p.from] || 0) - p.value; net[p.to] = (net[p.to] || 0) + p.value; }
  let pr = 0;
  for (const s of m.sectors) { const rs = fl.reduce((a, r) => a + (r.entries[s.id] || 0), 0); pr = Math.max(pr, Math.abs((net[s.id] || 0) - rs)); }
  log(`pairFlows(): ${pf.length} payer->payee pipes; per sector, pipes in - pipes out = sum of its row entries: max gap ${e2(pr)}   ${verdict(pr < 1e-9)}`);
  let bsr = 0;
  for (const s of m.sectors) { const b = m.balanceSheet(s.id); bsr = Math.max(bsr, Math.abs(b.assets.reduce((a, x) => a + x.value, 0) - b.liabilities.reduce((a, x) => a + x.value, 0) - b.netWorth)); }
  const nwSum = m.sectors.reduce((a, s) => a + m.balanceSheet(s.id).netWorth, 0);
  log(`balanceSheet(): assets - liabilities = net worth, max gap ${e2(bsr)}; net worths sum to ${e2(nwSum)} (financial claims net out)   ${verdict(bsr < 1e-9 && Math.abs(nwSum) < 1e-8)}`);
  const ex = [...fl.map((r) => r.row), ...m.seriesMeta.map((x) => x.id)].map((id) => m.explain(id));
  const okEx = ex.every((e) => e && e.title && e.what && e.rule && e.category && Array.isArray(e.params) && e.params.every((p) => p.value !== undefined && p.basis));
  log(`explain(): texts for ${ex.length} rows and series, every parameter with value and basis   ${verdict(okEx)}`);
  const need = ['output', 'unemployment', 'unemploymentY', 'unemploymentW', 'unemploymentO', 'inflation', 'expInflation', 'keyRate', 'broadMoney', 'creditImpulse', 'netMortgage', 'mortgageDebt',
    'realHousePrice', 'krona', 'currentAccount', 'exports', 'imports', 'govBalance', 'govDebt', 'realWage', 'rdiY', 'rdiW', 'rdiO', 'profitsFD', 'profitsFX', 'pfAssets'];
  const have = new Set(m.seriesMeta.map((x) => x.id));
  log(`seriesMeta: ${m.seriesMeta.length} series; all ${need.length} required series present   ${verdict(need.every((x) => have.has(x)))}`);
  log(`levers: ${m.levers.length} (${['Policy', 'Economy', 'World'].map((g) => g + ' ' + m.levers.filter((l) => l.group === g).length).join(', ')}); events logged: ${m.events.map((e) => 'm' + e.t + ' ' + e.label).join('; ')}`);
  log(`sectors: ${m.sectors.map((s) => s.id + ' ' + s.color).join(', ')}`);
  const r = I.createModel(); r.setLever('vat', 2); r.step(5); r.reset();
  log(`reset(): t=${r.t}, events=${r.events.length}, vat lever=${r.levers.find((l) => l.id === 'vat').value}, series length=${r.series('output').length}   ${verdict(r.t === 0 && r.events.length === 0 && r.series('output').length === 1)}`);
  log(`history cap: after 700 months series length = ${(() => { const z = I.createModel(); z.step(700); return z.series('output').length; })()} (601 = 600 months + the latest point)`);
}

// ------------------------------------------------------------------------------- 10. accounting
hr('10. Accounting checks, asserted every step (limit 1e-9) in every run above; maximum residuals');
{
  const tot = { row: 0, col: 0, instr: 0, fof: 0, recon: 0 }; let months = 0;
  for (const [, m] of ALL) { months += m.t; const c = m.checks().max; for (const k in tot) tot[k] = Math.max(tot[k], c[k]); }
  log(`runs: ${ALL.length}, months checked: ${months}`);
  log(`transaction rows sum to zero                        max |residual| = ${e2(tot.row)}`);
  log(`sector d(net worth) = saving + revaluations         max |residual| = ${e2(tot.col)}`);
  log(`each instrument sums to zero across holders          max |residual| = ${e2(tot.instr)}`);
  log(`instrument flows sum to zero                         max |residual| = ${e2(tot.fof)}`);
  log(`d(stock) = cash + accrual + revaluation + write-off  max |residual| = ${e2(tot.recon)}`);
  log(`all residuals < 1e-9: ${verdict(Math.max(...Object.values(tot)) < 1e-9)}`);
}
log(`\nSUMMARY: ${failures === 0 ? 'all tests pass' : failures + ' FAIL(s)'}`);
fs.writeFileSync(path.join(__dirname, 'test_output.txt'), lines.join('\n') + '\n');
process.exitCode = failures ? 1 : 0;
