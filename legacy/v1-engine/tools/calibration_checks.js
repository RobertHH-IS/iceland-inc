'use strict';
// Calibration checks (whole-model responses). These are CHECKS against published-style responses, never
// equations in the model. Shared by run_tests.js and tools/calibrate.js. Works with any loaded IcelandInc.
const q = (m) => Math.ceil(m / 3);          // month -> quarter (months 1-3 = quarter 1)
function run(I, opts, sched, months) {
  const m = I.createModel(opts);
  for (let t = 0; t < months; t++) { if (sched[t]) sched[t](m); m.step(1); }
  return m;
}
const ser = (m, id) => m.series(id).map((p) => p.v);          // index = month (0 = start)
function arg(a, better, from, to) { let j = from; for (let k = from; k <= to; k++) if (better(a[k], a[j])) j = k; return j; }
const argmin = (a, f, t) => arg(a, (x, y) => x < y, f, t), argmax = (a, f, t) => arg(a, (x, y) => x > y, f, t);
const inr = (x, lo, hi) => x >= lo && x <= hi;

function scenarios(I, opts = {}) {
  const S = {};
  S.rate = run(I, opts, { 0: (m) => m.setLever('keyRateAddon', 1), 24: (m) => m.setLever('keyRateAddon', 0) }, 72);
  S.wage = run(I, opts, { 0: (m) => m.fire('wageSettlement', 10) }, 72);
  S.gBank = run(I, opts, { 0: (m) => { m.setLever('bondBuyers', 1); m.setLever('otherServices', 1); } }, 72);
  S.gPF = run(I, opts, { 0: (m) => { m.setLever('bondBuyers', 3); m.setLever('otherServices', 1); } }, 72);
  S.krona = run(I, opts, { 0: (m) => m.fire('kronaShock', -10) }, 72);
  S.lend12 = run(I, opts, { 0: (m) => m.setLever('lendingAppetite', 1), 12: (m) => m.setLever('lendingAppetite', 0) }, 72);
  S.lendHeld = run(I, opts, { 0: (m) => m.setLever('lendingAppetite', 1) }, 72);
  return S;
}

// Each check: {id, scenario, target text, result text, pass, score (0 = inside band, >0 distance)}
function checks(S) {
  const out = [];
  const rng = (lo, hi) => (hi >= 100 ? '>= ' + lo : lo <= -100 ? '<= ' + hi : lo + ' to ' + hi);
  const band = (id, sc, desc, x, lo, hi, fmt) => out.push({ id, scenario: sc, target: desc + ' ' + rng(lo, hi), result: fmt(x), pass: inr(x, lo, hi), value: x,
    score: inr(x, lo, hi) ? 0 : Math.min(Math.abs(x - lo), Math.abs(x - hi)) / (hi - lo),
    margin: Math.min(x - lo, hi - x) / Math.min(hi - lo, 1) });
  const f2 = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);
  // 1 key rate +1 pp add-on for 8 quarters
  const ry = ser(S.rate, 'output'), rp = ser(S.rate, 'inflation'), rk = ser(S.rate, 'krona');
  const jy = argmin(ry, 1, 48), jp = argmin(rp, 1, 48), jk = argmax(rk, 1, 24);
  band('rate.outputTrough', 'Key rate +1 pp for 8 quarters', 'output trough, %', ry[jy], -0.6, -0.25, f2);
  band('rate.outputTiming', 'Key rate +1 pp for 8 quarters', 'output trough timing, quarter', q(jy), 4, 7, (x) => 'q' + x + ' (month ' + jy + ')');
  band('rate.inflTrough', 'Key rate +1 pp for 8 quarters', 'annual inflation trough, pp', rp[jp], -0.35, -0.1, f2);
  band('rate.inflTiming', 'Key rate +1 pp for 8 quarters', 'inflation trough timing, quarter', q(jp), 5, 9, (x) => 'q' + x + ' (month ' + jp + ')');
  band('rate.krona', 'Key rate +1 pp for 8 quarters', 'krona appreciation (peak, first 8 quarters), %', rk[jk], 0.3, 1.5, f2);
  // 2 wages +10% one-off, policy rule on
  const wp = ser(S.wage, 'inflation'), wk = ser(S.wage, 'keyRate'), wu = ser(S.wage, 'unemployment'), wP = ser(S.wage, 'priceLevel');
  const jwp = argmax(wp, 1, 72);
  band('wage.inflPeak', 'Wages +10% one-off', 'inflation peak, pp', wp[jwp], 1.5, 3.5, f2);
  band('wage.inflTiming', 'Wages +10% one-off', 'inflation peak timing, quarter', q(jwp), 4, 8, (x) => 'q' + x + ' (month ' + jwp + ')');
  band('wage.keyPeak', 'Wages +10% one-off', 'key-rate peak, pp', wk[argmax(wk, 1, 72)], 0.8, 2, f2);
  band('wage.unempPeak', 'Wages +10% one-off', 'unemployment peak, pp', wu[argmax(wu, 1, 72)], 0.3, 1.2, f2);
  band('wage.priceLevel6y', 'Wages +10% one-off', 'price level after 6 years, %', wP[72], 3, 8, f2);
  for (const [id, lab] of [['output', 'output'], ['unemployment', 'unemployment'], ['realWage', 'real wage'], ['consumption', 'consumption']]) {
    const a = ser(S.wage, id), pk = a[argmax(a.map(Math.abs), 1, 72)], r = Math.abs(a[72] / pk);
    band('wage.back.' + id, 'Wages +10% one-off', lab + ' at year 6 / peak deviation', r, 0, 0.25, (x) => (100 * x).toFixed(0) + '% of peak ' + f2(pk));
  }
  // 3 government purchases +1% of GDP, permanent
  const gy = ser(S.gBank, 'output'), y1 = gy.slice(1, 13).reduce((a, b) => a + b) / 12;
  band('g.output1y', 'Govt purchases +1% of GDP', 'output, year-1 average, %', y1, 0.3, 0.8, f2);
  const mB = ser(S.gBank, 'broadMoney'), mP = ser(S.gPF, 'broadMoney'), gap = Math.min(mB[12] - mP[12], mB[24] - mP[24]);
  band('g.money', 'Govt purchases +1% of GDP', 'broad money, bank- minus PF-financed, pp (min of m12, m24)', gap, 0.5, 100, (x) => f2(x) + ' (banks ' + f2(mB[24]) + '% vs PF ' + f2(mP[24]) + '% at m24)');
  // 4 krona -10% sentiment shock
  band('krona.priceLevel8q', 'Krona -10% sentiment', 'price level at 8 quarters, %', ser(S.krona, 'priceLevel')[24], 1.5, 3, f2);
  // 5 temporary lending boost
  const c1 = ser(S.lend12, 'creditImpulse'), c2 = ser(S.lendHeld, 'creditImpulse');
  const pos = Math.min(...c1.slice(1, 13)), neg = Math.max(...c1.slice(13, 25)), held = Math.max(...c2.slice(18, 49).map(Math.abs));
  band('lend.positive', 'Lending +1% of GDP for 12 months', 'credit impulse, months 1-12 (minimum), pp', pos, 0.2, 100, f2);
  band('lend.negative', 'Lending +1% of GDP for 12 months', 'credit impulse, months 13-24 (maximum), pp', neg, -100, -0.2, f2);
  band('lend.held', 'Lending +1% held constant', 'largest absolute credit impulse, months 18-48, pp', held, 0, 0.3, f2);
  return out;
}
module.exports = { scenarios, checks, ser, run };
