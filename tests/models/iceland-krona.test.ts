/**
 * The króna's responses that lever texts describe in numbers (review of the fix pass, 29 September
 * 2026): the foreign interest rate weakens it first (E3), and the texts that quote a path stay true.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { lockAll } from '../../src/core/scenario.ts';
import { createEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { withConcepts } from '../../src/models/index.ts';
import { boundUsed, PB_NEAR_LIMIT, smoothBound } from '../../src/models/iceland/modules/external.ts';

const model = compile(withConcepts(icelandModel));
const base = createEngine(model);

/** A run from the baseline with one lever moved at month 0: settings are set, one-offs fired.
 *  `automatic`: both policy levers unlocked (the default); otherwise both locked at month 0. */
function run(lever: string, value: number, automatic: boolean, months: number) {
  const e = createEngine(model, { baseline: base.baselineData, dev: false });
  lockAll(e, !automatic);
  if (model.levers.find((l) => l.id === lever)!.kind === 'oneoff') e.fire(lever, value);
  else e.setLever(lever, value);
  e.step(months);
  return e;
}
const series = (e: ReturnType<typeof run>, id: string) => e.series(id).map((p) => p.v);

describe('Iceland model: the foreign interest rate (review E3)', () => {
  test('a higher foreign rate weakens the króna for the first three years, locked or unlocked', () => {
    // Uncovered interest parity: carry traders and pension funds move money out of krónur. Before
    // the fix the funds' extra foreign income, converted into krónur, strengthened it from month 3.
    for (const automatic of [false, true]) {
      const krona = series(run('foreignRate', 1, automatic, 36), 'krona');
      expect(Math.max(...krona.slice(1, 37))).toBeLessThan(0);
      expect(krona.slice(1, 25).reduce((s, x) => s + x, 0) / 24).toBeLessThan(-0.5);
    }
  });

  test('+5 pp held with the policy rules acting is no deflation trap: the key rate never reaches its floor in 20 years', () => {
    // Before: the króna 13% stronger after a year, inflation down to 3.9 pp below baseline and the
    // key rate at zero from month 20. Now it rises at first, and inflation stays within 1.5 pp.
    const e = run('foreignRate', 5, true, 240);
    expect(series(e, 'krona')[12]).toBeLessThan(-3);
    expect(Math.min(...Array.from({ length: 241 }, (_, m) => e.valueAt('keyRate', m)))).toBeGreaterThan(0.01);
    expect(Math.min(...series(e, 'inflation'))).toBeGreaterThan(-1.5);
  });

  test('the central bank keeps its extra reserve income abroad at first, then sells reserves above target: the reserves settle (lever review FX-1)', () => {
    // Reserve income is paid in foreign currency into the reserves, and the bank sells the normal
    // yield for krónur plus lamRes a year of anything above its target of fxr% of GDP. The reserves
    // therefore settle where the target sales cover the extra income, about fxr × Δi ÷ (lamRes − Δi)
    // above target, instead of compounding at the foreign rate (18% of GDP to 45.6% after 20 years
    // at +5 pp, with the whole accrued profit handed to the government in krónur and broad money
    // still rising). A small reserve gap never moves the baseline: the target term is zero there.
    const q = (id: string) => model.params.find((x) => x.id === id)!.value;
    const reserves = (e: ReturnType<typeof run>) => (100 * e.balanceSheet('CB').assets.find((a) => a.instrument === 'fxReserves')!.value) / e.value('gdpTrailing12');
    expect(reserves(base)).toBeCloseTo(q('fxr'), 9);
    for (const automatic of [true, false]) {
      // +1 pp: within a point of the target after 20 years
      const one = run('foreignRate', 1, automatic, 240);
      expect(Math.abs(reserves(one) - q('fxr'))).toBeLessThan(1);
      // +5 pp: below where the target sales cover the extra income, and nearly still
      const five = run('foreignRate', 5, automatic, 228);
      const r228 = reserves(five);
      five.step(12);
      const settle = q('fxr') * (1 + 0.05 / (q('lamRes') - 0.05));
      expect(reserves(five)).toBeLessThan(settle);
      expect(reserves(five) - r228).toBeLessThan(0.2);
    }
    // with the policy rules acting broad money and the current account settle: 20 years at +5 pp. Broad money peaks
    // about 8% above baseline after 12 years and falls back (it was +27% and rising). On the
    // monetary-fx branch alone it ended within 1% of baseline, but prices were then 9% lower; with
    // wages measured against the value-added price (trade-nominal-drift) they end about 1% lower,
    // so in real terms broad money ends a little nearer baseline than it did there.
    const e = run('foreignRate', 5, true, 360);
    const [bm, ca] = [series(e, 'broadMoney'), series(e, 'currentAccount')];
    const [bm0, ca0] = [series(base, 'broadMoney')[0], series(base, 'currentAccount')[0]];
    // Restated with decision 0013 (was below 10, and below 0.8 of the peak at month 240): the
    // market now prices the krónur the carry trade sells a year while the rate gap lasts, and the
    // flow of krónur itself, so at +5 pp the króna stays weaker for longer (7.5% at month 12, was
    // 6.5%) and the surplus is larger and lasts longer (1.7% of GDP at month 120, was 1.4%). Broad
    // money, which the surplus builds up at home, peaks higher and later: +12.7% in month 183 (+9.3%
    // in month 144 before; mostly real, prices end 0.1% higher). It then falls back as before, only
    // later: 0.94 of its peak at month 240 and 0.72 at month 360. The fall is tested as before, ten
    // years further on: still falling, slowly, and below 0.8 of the peak by month 360.
    const peak = Math.max(...bm) - bm0;
    expect(peak).toBeLessThan(13);
    expect(bm[360] - bm0).toBeLessThan(0.8 * peak);
    expect(bm[240]).toBeLessThan(bm[228]);
    expect(Math.abs(bm[240] - bm[228])).toBeLessThan(1);
    expect(ca[240] - ca0).toBeLessThan(0.25 * (Math.max(...ca) - ca0)); // was +2.81 and rising
    // selling the extra income for krónur again drains non-residents' krónur, so part of v1's drift
    // returns (known gap below). Per point held 20 years, v1: unlocked 5–6% stronger, prices about
    // 3% lower, inflation 0.24 pp below; locked about 9% stronger, prices about 6.5% lower.
    for (const automatic of [true, false]) {
      const x = run('foreignRate', 1, automatic, 240);
      const [k, p, pi] = [series(x, 'krona'), series(x, 'priceLevel'), series(x, 'inflation')];
      if (automatic) {
        expect(Math.abs(k[240])).toBeLessThan(4);
        expect(Math.abs(p[240])).toBeLessThan(2);
        expect(Math.abs(pi[240])).toBeLessThan(0.25);
      } else {
        expect(k[240]).toBeLessThan(8);
        expect(p[240]).toBeGreaterThan(-5);
      }
    }
    // the reserves take the extra income first: after a year of +1 pp they have grown by about a point of it
    const y = run('foreignRate', 1, false, 12);
    expect(y.value('reserveIncomeKept')).toBeGreaterThan(0.1);
    expect(y.baseline('reserveIncomeKept')).toBe(0);
  });

  test('known gap: the funds’ extra foreign income is still paid home in krónur, and no foreign-currency debt pays the foreign rate', () => {
    // decision 0002 §6: what remains of the drift. Iceland's income from abroad rises by about 0.3%
    // of GDP a year per point, where its roughly matched foreign-currency position would give far
    // less; with both policy levers locked the króna still ends a few percent stronger after 20 years.
    const e = run('foreignRate', 1, false, 240);
    const ca = (m: number) => e.valueAt('currentAccount', m) - e.baselineData.vars[model.varIndex.get('currentAccount')!];
    expect(ca(12)).toBeGreaterThan(0.25);
    expect(series(e, 'krona')[240]).toBeGreaterThan(series(e, 'krona')[180]);
    expect(model.levers.find((l) => l.id === 'foreignRate')!.definition).toMatch(/known gap/);
  });

  test('only the bond part of the funds’ foreign assets earns more when rates abroad rise', () => {
    const e = run('foreignRate', 1, false, 1);
    const inf = e.influences('foreignAssetIncome');
    const pass = inf.params.find((p) => p.id === 'pfForeignRatePass')!.value;
    const fa = e.balanceSheet('PF').assets.find((a) => a.instrument === 'foreignAssets')!.value;
    const extra = inf.terms.find((t) => t.id === 'foreignRate')!.value;
    // the income is computed on last month's holdings, which one month of trading barely moves
    expect(extra / (0.01 * fa)).toBeCloseTo(pass, 2);
    expect(pass).toBeLessThan(0.5);
  });
});

describe('Iceland model: the króna-shock lever does what its definition says (review M21, lever review FX-2 and FX-5)', () => {
  test('−10: about 9% weaker by month 3, a sixth to a third of that gone after a year, half after two to three years', () => {
    for (const automatic of [false, true]) {
      const krona = series(run('kronaShock', -10, automatic, 36), 'krona');
      expect(krona[3]).toBeGreaterThan(-10);
      expect(krona[3]).toBeLessThan(-8.5);
      // unlocked about 0.69 since the króna is as sensitive to the key rate as QMM's (betaI 0.5, MON-5); locked about 0.84
      expect(krona[12] / krona[3]).toBeGreaterThan(0.65);
      expect(krona[12] / krona[3]).toBeLessThan(0.95);
      expect(krona[automatic ? 24 : 36] / krona[3]).toBeLessThan(0.55); // about half gone
    }
  });

  test('a J-curve: imports are invoiced in foreign currency, so the current account worsens at once and turns within a year', () => {
    for (const automatic of [false, true]) {
      const e = run('kronaShock', -10, automatic, 24);
      const ca = (m: number) => e.valueAt('currentAccount', m);
      for (const m of [1, 2, 3]) expect(ca(m)).toBeLessThan(-1);
      expect(ca(12)).toBeGreaterThan(0.5);
      expect(ca(24)).toBeGreaterThan(0.5);
      // what Iceland pays abroad moves with the króna at once; what importers charge at home follows
      expect(e.valueAt('borderImportPrice', 1)).toBeCloseTo(e.valueAt('exchangeRate', 1), 12);
      expect(e.valueAt('importPrice', 1) - 1).toBeLessThan(0.3 * (e.valueAt('borderImportPrice', 1) - 1));
    }
    // a world-price rise is a terms-of-trade loss at first: the import bill is about three times fish and aluminium
    expect(run('importPrices', 10, true, 1).value('currentAccount')).toBeLessThan(-1);
  });

  test('the recovery is portfolio balance: pension funds sell foreign assets now worth more in krónur, and the key rate does not move with both policy levers locked', () => {
    const e = run('kronaShock', -10, false, 12);
    for (const m of [1, 3, 6]) expect(e.valueAt('foreignAssetPurchases', m)).toBeLessThan(-1);
    expect(Math.abs(e.influences('logExchangeRate').terms.find((t) => t.id === 'carry')!.change)).toBeLessThan(1e-12);
    const def = model.levers.find((l) => l.id === 'kronaShock')!.definition;
    expect(def).toMatch(/portfolio balance/);
    expect(def).not.toMatch(/the rate gap and non-residents’ holdings pull it back/);
    expect(def).toMatch(/foreign-currency/);
  });
});

describe('Iceland model: portfolio balance is bounded and nets out the carry trade (lever review TAX-1 and FX-4)', () => {
  test('pension funds moving 20 points of assets home or abroad move the króna by tens of percent, not twice its value; symmetrically for moderate moves, and bounded on the strong side', () => {
    for (const automatic of [false, true]) {
      const home = series(run('pfForeign', -20, automatic, 15), 'krona')[15];
      const abroad = series(run('pfForeign', 20, automatic, 15), 'krona')[15];
      expect(home).toBeGreaterThan(0);
      expect(home).toBeLessThan(30); // v1: +107%
      expect(abroad).toBeLessThan(0);
      expect(abroad).toBeGreaterThan(-30);
      // Restated with decision 0013 (was: the ±20 responses within a ratio of 1.5 in logs; now
      // 1.83 locked, 1.91 unlocked, +10.2% home against −16.3% abroad locked). The portfolio term
      // is now linear up to a smooth limit of pbBound (0.2 log points) on the side where
      // non-residents are short of krónur, as the owner approved (lever review TAX-1: portfolio
      // balance within 0.2 log points of parity), where decision 0007's log form was nearly
      // symmetric and bounded at 0.34. Bringing 20 points home uses much of that limit, so the
      // strong side is smaller by design. Symmetry is tested where the limit does not bind: ±5
      // (+6.2% and −6.1% locked) within a ratio of 1.1 in logs, tighter than before.
      const [up, down] = [series(run('pfForeign', -5, automatic, 15), 'krona')[15], series(run('pfForeign', 5, automatic, 15), 'krona')[15]];
      const logs = [Math.log(1 + up / 100), -Math.log(1 + down / 100)];
      expect(Math.min(...logs)).toBeGreaterThan(0);
      expect(Math.max(...logs) / Math.min(...logs)).toBeLessThan(1.1);
      expect(Math.log(1 + home / 100)).toBeLessThan(-Math.log(1 + abroad / 100)); // the limit binds on the strong side only
    }
  });

  test('income tax ±10 held with both policy levers locked: the króna stays within 0.2 log points of purchasing-power parity for 20 years, and the portfolio term’s limit is visible before it binds (lever review TAX-1, items 5)', () => {
    // v1: non-residents' krónur ran out and the unbounded premium made the króna 1462% stronger
    // while prices fell 86%, 2.3 times beyond parity. The deflation itself (the key rate held) remains.
    // Until decision 0013 this was a known gap: from about month 190 the log-form premium sat at its
    // bound of about −0.34 and the króna ended 0.27 log points beyond parity. The smooth limit of
    // pbBound (0.2) closes it: at most 0.125 beyond parity (month 240) at +10, 0.09 at −10.
    const pb = model.params.find((x) => x.id === 'pbBound')!.value;
    for (const v of [10, -10]) {
      const e = run('incomeTax', v, false, 240);
      const k = series(e, 'krona');
      const p = series(e, 'priceLevel');
      const beyondParity = (m: number) => Math.abs(Math.log((1 + k[m] / 100) * (1 + p[m] / 100)));
      for (let m = 12; m <= 240; m += 12) expect(beyondParity(m)).toBeLessThan(0.2);
    }
    // Item 5: a gate on the bounded term passes by construction, so the gap before the limit is a
    // variable of its own (portfolioGap), and the rule names the regime once more than 80% of the
    // limit is used. At +10 the gap is −0.43 log points at month 240, the limit 97% used; the
    // regime shows in exactly the months it is more than 80% used (96 of them), and the bounded
    // term never passes pbBound.
    const e = run('incomeTax', 10, false, 0);
    let labelled = 0;
    for (let m = 1; m <= 240; m++) {
      e.step(1);
      const g = e.value('portfolioGap');
      const used = boundUsed(g, pb);
      const regime = e.influences('logExchangeRate').regime;
      expect(regime == null ? used <= PB_NEAR_LIMIT : used > PB_NEAR_LIMIT && /near its limit/.test(regime)).toBe(true);
      if (regime) labelled++;
      expect(e.influences('logExchangeRate').terms.find((t) => t.id === 'portfolio')!.value).toBeCloseTo(smoothBound(g, pb), 12);
      expect(smoothBound(g, pb)).toBeGreaterThan(-pb);
    }
    expect(labelled).toBeGreaterThan(60);
    expect(e.value('portfolioGap')).toBeLessThan(-0.35);
    expect(boundUsed(e.value('portfolioGap'), pb)).toBeGreaterThan(0.95);
  });

  test('krónur bought for the rate gap do not weaken the króna: a credit or tax-cut boom with higher rates leaves the real króna stronger than with the key rate held, for a year and a half (the key-rate rule acting)', () => {
    const effect = (lever: string, value: number, months: number, keyRateHeld = false) => {
      const go = (id: string, v: number) => {
        const e = run(id, v, true, 0);
        if (keyRateHeld) e.setLever('keyRateLock', 1);
        e.step(months);
        return e;
      };
      const [b, e] = [go('foreignDemand', 0), go(lever, value)];
      return Array.from({ length: months }, (_, m) => [e.valueAt('realExchangeRate', m + 1) / b.valueAt('realExchangeRate', m + 1) - 1, e.valueAt('exportVolume', m + 1) / b.valueAt('exportVolume', m + 1) - 1]);
    };
    for (const [lever, value, months] of [
      ['lendingAppetite', 3, 18],
      ['incomeTax', -2.5, 18], // until padlocks the income-tax offset; now income tax held 2.5 points lower
    ] as const) {
      // The carry trade's krónur strengthen, never weaken: every month the real króna is no weaker,
      // and exports no higher, than in the same boom with the key rate held at neutral.
      const [acting, held] = [effect(lever, value, months), effect(lever, value, months, true)];
      acting.forEach(([r, x], m) => {
        expect(r - held[m][0]).toBeLessThanOrEqual(1e-6);
        expect(x - held[m][1]).toBeLessThanOrEqual(1e-6);
      });
      // Known gap (lever-vetting open item 4, decisions 0012 and 0013): until the labour-market gap
      // the rule raised its rate early enough that the real króna was also stronger than without
      // the boom (at most 1e-6 weaker in months 1–18). It now reads slack from unemployment, which
      // moves after output, so it raises the rate later (0.04 pp by month 6, was 0.10 after the tax
      // cut) and the króna is up to 0.03% weaker in real terms by month 18 (exports 0.02% higher).
      // Króna stage 1's flow term took it to 0.052% (lending +3) until the carry trade's flow was
      // netted from it; now 0.042% and 0.049% (the tax cut). Tripwire: it must not grow. It comes
      // back under 1e-6 only once the rule sees a boom in time (item 14); see the item-4 test below.
      for (const [r, x] of acting) {
        expect(r).toBeLessThanOrEqual(5e-4);
        expect(x).toBeLessThanOrEqual(5e-4);
      }
    }
    // a higher key rate alone (until padlocks an offset of 1 to the rule; now held 1 point above neutral): the real króna stronger for five years
    for (const [r] of effect('keyRate', 4, 60)) expect(r).toBeLessThan(0);
  });
});

describe('Iceland model: króna stage 1, the flow-priced portfolio term and the reserve target in foreign currency (decision 0013)', () => {
  /** The real exchange rate as the long-run-anchors proposal measures it, e × world prices ÷
   *  domestic prices, unsmoothed: the % change against the no-change run, month by month. */
  const q = (e: ReturnType<typeof run>, m: number) => e.valueAt('exchangeRate', m) * e.valueAt('worldPrice', m) / e.valueAt('domesticPrice', m);
  const meanQ = (s: ReturnType<typeof run>, b: ReturnType<typeof run>, from: number, to: number) => {
    let x = 0;
    for (let m = from; m <= to; m++) x += 100 * (q(s, m) / q(b, m) - 1);
    return x / (to - from + 1);
  };

  test('the flow term prices only the krónur the carry trade does not take up: its netting is the carry term of the carry trade’s own rule', () => {
    const e = run('keyRate', 5, true, 3);
    const inf = e.influences('portfolioGap');
    const p = (id: string) => inf.params.find((x) => x.id === id)!.value;
    const gap = e.value('keyRate') - (p('i0') + p('piT')) - (e.value('foreignRate') - p('iF0'));
    expect(gap).toBeGreaterThan(0.01);
    expect(inf.terms.find((t) => t.id === 'carryFlow')!.value).toBeCloseTo(-p('pbFlow') * p('lamBW') * p('bondW') * p('psiB') * gap, 12);
    expect(inf.terms.find((t) => t.id === 'flow')!.value).toBeCloseTo(p('pbFlow') * e.value('kronaInflowW'), 12);
    // at the baseline every part is zero
    for (const t of base.influences('portfolioGap').terms) expect(Math.abs(t.value)).toBeLessThan(1e-12);
  });

  test('item 4, a credit boom with the policy rules acting: stage 1 no longer weakens the real króna; the rest waits for the rule to see a boom in time (known gap, release blocker)', () => {
    // Lending appetite +3, the policy rules acting: the mean change in the real exchange rate over
    // months 12–36, %, + weaker. The proposal's release criterion is ≤ 0 (the textbook sign with an
    // inflation-targeting rule that tightens, and Iceland's 2004–07). Before stage 1 it was +0.111
    // (+0.021 on main with the fixed-capacity gap). The flow term read the boom's import bill as a
    // flow still to come, while the carry trade's demand for krónur at the higher rate was priced
    // only as a stock: +0.134. Netting the carry trade's flow brings it to +0.100, below where it
    // was before stage 1. What is left is the labour-market gap reading the boom late (the key rate
    // +0.14 on average against +0.27 with the fixed capacity): with a rule that saw the boom as the
    // fixed-capacity rule did, the same króna gives −0.005 (a scratch run; +0.053 without the
    // netting). That is item 14's timing (phase 5), so the criterion is not met yet
    // and stage 1 is not releasable until it is (decision 0013).
    const b = run('lendingAppetite', 0, true, 36);
    const s = run('lendingAppetite', 3, true, 36);
    const unnetted = base.fork({ disableTerms: ['portfolioGap.carryFlow'] });
    const bu = base.fork({ disableTerms: ['portfolioGap.carryFlow'] });
    unnetted.setLever('lendingAppetite', 3);
    unnetted.step(36);
    bu.step(36);
    const [now, before] = [meanQ(s, b, 12, 36), meanQ(unnetted, bu, 12, 36)];
    expect(now).toBeLessThan(before - 0.02); // the netting takes off about a quarter (0.134 → 0.100)
    expect(now).toBeLessThan(0.111); // no weaker than before stage 1
    // Tripwire: must not grow. When it passes ≤ 0, turn this into the release criterion.
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThan(0.105);
  });

  test('tourism −60 with the policy rules acting weakens the króna by at least 8% within a year (lever-vetting item 18)', () => {
    // 12.0% dearer foreign currency at month 12 (8.7% before stage 1); 2020: nearly 10% trade-weighted, 14.9% against the euro
    const [b, s] = [run('tourism', 0, true, 12), run('tourism', -60, true, 12)];
    expect(s.value('exchangeRate') / b.value('exchangeRate') - 1).toBeGreaterThan(0.08);
  });

  test('the reserve target is set in foreign currency: after a 25% fall in sentiment the central bank sells almost no reserves into the depreciation, with both policy levers locked (E2)', () => {
    // Reserves sold in months 1–36 beyond the no-change run, % of GDP: 0.27 (0.86 with the target
    // in krónur, a de facto intervention on a held policy). What is left is the normal yield on
    // reserves now worth more krónur, and real activity moving the target.
    const [b, s] = [run('kronaShock', 0, false, 36), run('kronaShock', -25, false, 36)];
    let sold = 0;
    for (let m = 1; m <= 36; m++) sold += (s.valueAt('fxReserveSales', m) - b.valueAt('fxReserveSales', m)) / 12;
    expect(sold).toBeGreaterThan(0);
    expect(sold).toBeLessThan(0.3);
  });

  test('known gap until króna stage 2: after a 25% fall in sentiment the real króna halves its deviation within about a year and a half, against QMM’s 24–40 months', () => {
    // From month 3, e × world prices ÷ domestic prices: 17 months with both policy levers locked
    // (13 before stage 1), 12 with the rules acting (12). The portfolio closure, not the fading of
    // sentiment, sets it (proposal H5). Tripwire: if it reaches 24, stage 2's target is met.
    for (const [automatic, lo] of [[false, 14], [true, 10]] as const) {
      const [b, s] = [run('kronaShock', 0, automatic, 120), run('kronaShock', -25, automatic, 120)];
      const d = (m: number) => Math.log(q(s, m) / q(b, m));
      const half = Array.from({ length: 117 }, (_, i) => i + 4).find((m) => d(m) < d(3) / 2)! - 3;
      expect(half).toBeGreaterThanOrEqual(lo);
      expect(half).toBeLessThan(24);
    }
  });
});

describe('Iceland model: fish and aluminium volumes follow their own price (review L12)', () => {
  test('the fish-price and aluminium-price levers move volume the way their explanation says', () => {
    // Volume ∝ (world price of the line in krónur ÷ domestic prices)^elasticity, smoothed at lamRer.
    for (const [lever, line, elas] of [
      ['fishPrices', 'Fish', 'eFish'],
      ['aluminiumPrice', 'Aluminium', 'eAlu'],
    ] as const) {
      const e = run(lever, 20, false, 36);
      const up = e.valueAt(`exportVolume${line}`, 36) / e.valueAt(`exportVolume${line}`, 0) - 1;
      const k = e.influences(`exportVolume${line}`).params.find((p) => p.id === elas)!.value;
      const profit = e.value(`profitability${line}`);
      expect(profit).toBeGreaterThan(1.1);
      expect(up).toBeCloseTo(Math.pow(profit, k) - 1, 6);
    }
  });

  test('at a common world price the lines’ profitability equals the real exchange rate', () => {
    const e = run('importPrices', 10, true, 24);
    expect(e.value('profitabilityFish')).toBeCloseTo(e.value('realExchangeRate'), 12);
    expect(e.value('profitabilityAluminium')).toBeCloseTo(e.value('realExchangeRate'), 12);
  });
});

describe('Iceland model: a high key rate held for years (review E7)', () => {
  // Until padlocks (decision 0010) this was a +5-point offset to the rule; it is now the key rate
  // held 5 points above neutral while the debt rule acts (income tax unlocked).
  test('with the debt rule acting, a key rate held 5 points above neutral keeps output below baseline for 20 years', () => {
    const output = series(run('keyRate', 8, true, 240), 'output');
    expect(Math.max(...output.slice(1))).toBeLessThan(0);
  });

  test('both policy levers locked, 15% held: output below baseline for eight years, then the interest-income channel lifts it', () => {
    // Taxes and spending are held too, so the government's interest bill feeds households' and
    // pension funds' income (decision 0002 §6, Godley and Lavoie's model PC). Back above baseline
    // from month 107; month 88 while the bonds repriced with the key rate at once (review MON-1).
    const e = run('keyRate', 15, false, 120);
    const output = series(e, 'output');
    expect(Math.max(...output.slice(1, 97))).toBeLessThan(0);
    expect(output[120]).toBeGreaterThan(0);
    const income = (m: number) => ['Y', 'W', 'O'].reduce((s, g) => s + e.valueAt(`propertyIncome${g}`, m), 0);
    expect(income(120) / income(0)).toBeGreaterThan(1.5);
  });

  test('with both policy levers locked, any lasting move reverses, not only a high rate: +1 pp cools output for about eleven years, then lifts it (review MON-1)', () => {
    const e = run('keyRate', 4, false, 240);
    const output = series(e, 'output');
    const trough = Math.min(...output.slice(1, 60));
    expect(trough).toBeLessThan(-0.6); // about −0.83%, in month 37
    expect(output.indexOf(trough)).toBeGreaterThan(24); // in the third or fourth year
    const back = output.findIndex((y, m) => m >= 24 && y > 0);
    // Month 140 since decision 0013 (136 before, 130 at one step a month, 106 while bonds repriced
    // at once): the carry trade's flow, now priced, makes the króna about a quarter stronger while the
    // rate is held higher, so exports stay lower and the interest-income lift takes a few months longer.
    expect(back).toBeGreaterThanOrEqual(124);
    expect(back).toBeLessThanOrEqual(142);
    expect(output[240]).toBeGreaterThan(0.6); // about +0.72% after 20 years
    expect(output[240]).toBeLessThan(0.85);
    // A cut mirrors it: about −0.49% after 20 years.
    const cut = series(run('keyRate', 2, false, 240), 'output');
    expect(cut[240]).toBeLessThan(-0.35);
    expect(cut[240]).toBeGreaterThan(-0.65);
    // Bonds keep their coupons until they mature (about five years on average), so the interest bill
    // rises gradually. The first month's −0.097 of GDP is mostly the central bank's higher interest
    // on reserves, which cuts the profit it pays the Treasury by 0.12; other items make up the
    // rest. It was −0.49 while the whole bond stock repriced with the key rate at once. (Restated
    // with decision 0013: −0.108 before, with the bound at −0.1; the change comes with the stronger
    // króna on impact, 0.68% against 0.53%.)
    const balance = e.valueAt('govBalance', 1) - e.baseline('govBalance');
    expect(balance).toBeLessThan(-0.09);
    expect(balance).toBeGreaterThan(-0.17);
  });
});
