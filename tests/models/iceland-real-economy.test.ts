/**
 * The real economy after the lever-response vetting of 29 September 2026 (reports/levers): the
 * wage–price block has a nominal anchor for lasting real shocks (trade-nominal-drift), a squeezed
 * exporter's debt stays in proportion (trade-exporter-debt-spiral), a fish windfall is partly paid
 * out and taxed (trade-fish-windfall-hoarded), foreign demand builds up over months
 * (trade-month1-export-jump), benefits raise normal unemployment (labour-LAB-1), a wage settlement
 * erodes mostly through prices (labour-LAB-2), a labour-supply shock is a lever (labour-LAB-6),
 * households keep a cash buffer (tax-TAX-2) and investment is planned before it is spent
 * (monetary-MON-11). Each effect is measured against the no-change run in the same mode.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { lockAll } from '../../src/core/scenario.ts';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { withConcepts } from '../../src/models/index.ts';

const model = compile(withConcepts(icelandModel));
const base = createEngine(model);
const FIRMS = ['FC', 'FR', 'XF', 'XA', 'XT', 'XO'];

type Setting = [lever: string, value: number];
/** Twin runs from the baseline, one with the settings: `at(id, m)` is the shocked run's value.
 *  `automatic`: true, every padlock open; false, every one closed; 'key rate locked', only the key
 *  rate's closed (the lever report's third configuration). */
function twins(settings: Setting[], automatic: boolean | 'key rate locked', months: number, params?: Record<string, number>) {
  const make = (shock: boolean) => {
    const e = createEngine(model, { baseline: base.baselineData, dev: false, forkParams: params });
    lockAll(e, automatic === false);
    if (automatic === 'key rate locked') e.setLever('keyRateLock', 1);
    if (shock)
      for (const [id, v] of settings) {
        if (model.levers.find((l) => l.id === id)!.kind === 'oneoff') e.fire(id, v);
        else e.setLever(id, v);
      }
    e.step(months);
    return e;
  };
  const [b, s] = [make(false), make(true)];
  return {
    s,
    b,
    /** Percent difference of a level. */
    pct: (id: string, m: number) => 100 * (s.valueAt(id, m) / b.valueAt(id, m) - 1),
    /** Difference in points (× 100) of a rate or ratio. */
    pp: (id: string, m: number) => 100 * (s.valueAt(id, m) - b.valueAt(id, m)),
  };
}
const param = (e: KernelEngine, rule: string, id: string) => e.influences(rule).params.find((p) => p.id === id)!.value;

describe('trade-nominal-drift: wages are measured against the value-added price', () => {
  test('a lasting tourism fall no longer leaves inflation off target with the policy rules acting', () => {
    // Before: +0.88 pp at month 180 and +0.82 at month 240, the price level 16% higher and rising.
    const r = twins([['tourism', -15]], true, 240);
    expect(Math.abs(r.pp('inflation12', 180))).toBeLessThan(0.1);
    expect(Math.abs(r.pp('inflation12', 240))).toBeLessThan(0.15);
    expect(Math.abs(r.pct('cpi', 240))).toBeLessThan(2);
  });

  test('with both policy levers locked the inflation gap is much smaller, and the real effects stay small', () => {
    // Before: +1.05 pp at month 240. What is left is the half-anchored expectations' slope on a
    // lasting unemployment gap, which the lever texts state.
    const r = twins([['tourism', -15]], false, 240);
    expect(r.pp('inflation12', 240)).toBeLessThan(0.75);
    expect(Math.abs(r.pp('unemployment', 240))).toBeLessThan(0.5);
    expect(Math.abs(r.pct('output', 240))).toBeLessThan(1);
  });

  const exportShocks: Setting[] = [
    ['tourism', -15],
    ['tourism', 10],
    ['tourism', 30],
    ['foreignDemand', 20],
    ['fishPrices', 30],
  ];
  test('lasting export changes with the policy rules acting: output and unemployment end near baseline after 20 years', () => {
    for (const setting of exportShocks) {
      const r = twins([setting], true, 240);
      expect(Math.abs(r.pct('output', 240))).toBeLessThan(0.5);
      expect(Math.abs(r.pp('unemployment', 240))).toBeLessThan(0.6);
    }
  });

  test('more exports raise output in the first two years locked and unlocked', () => {
    for (const setting of exportShocks.filter(([id, v]) => id !== 'fishPrices' && v > 0))
      for (const automatic of [false, true]) expect(twins([setting], automatic, 24).pct('output', 24)).toBeGreaterThan(0.25);
  });

  test('known gap (decision 0002 §6): with the key rate held, a lasting export rise ends with output below baseline, bounded, as the definitions say', () => {
    // The króna keeps strengthening in nominal terms until the current account closes (the external
    // loop, monetary-fx), so prices keep falling and, with expectations half anchored, unemployment
    // stays above normal. Before the value-added price, tourism +30 ended with output +0.8% at month
    // 240 because wages followed the deflation instead. If this starts to pass the other way, update
    // the definitions and decision 0002. (With the fix branches merged, fish +30 ends about 2.75%
    // lower, 2% on the real-economy branch alone: the króna falls less after other shocks, so the
    // price level has further to fall here.)
    for (const setting of exportShocks.filter(([, v]) => v > 0)) {
      const r = twins([setting], false, 240);
      expect(r.pct('output', 240)).toBeLessThan(0);
      expect(r.pct('output', 240)).toBeGreaterThan(-3);
      expect(r.pp('unemployment', 240)).toBeLessThan(1.2);
    }
    for (const id of ['tourism', 'foreignDemand', 'fishPrices']) expect(model.levers.find((l) => l.id === id)!.definition).toMatch(/key rate held \(both policy levers locked\)/);
  });

  test('a lasting rise in world prices leaves no lasting wage gap: the error correction closes, while wages ÷ domestic prices have moved', () => {
    const r = twins([['importPrices', 10]], true, 240);
    // measured against domestic prices, as before, the gap would still be about 0.25–0.3 log points
    // (in %) and pull wage growth down for good
    const wOverPd = (e: KernelEngine) => Math.log(e.valueAt('wage', 240) / e.valueAt('domesticPrice', 240));
    expect(Math.abs(wOverPd(r.s) - wOverPd(r.b))).toBeGreaterThan(0.002);
    // Restated with decision 0012 (was 0.0005, with −0.00044): what is left at month 240 is the
    // tail of the slow cycle of the rule's learning (unemployment 0.05 points above the no-change
    // run, inflation −0.06 pp), not a lasting gap. With the rule reading slack from unemployment it
    // is −0.00073, and −0.00078 at month 360: a tenth of the 0.0025–0.003 a gap measured against
    // domestic prices would leave.
    expect(Math.abs(r.s.valueAt('wageGapSeen', 240))).toBeLessThan(0.001);
  });

  test('the value-added price is domestic prices less the imported inputs in them, 1 at baseline', () => {
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    expect(e.value('valueAddedPrice')).toBeCloseTo(1, 12);
    e.setLever('importPrices', 20);
    e.step(12);
    const aLab = param(e, 'valueAddedPrice', 'aLab');
    expect(e.value('valueAddedPrice')).toBeCloseTo((e.value('domesticPrice') - (1 - aLab) * e.value('deliveredImportPrice')) / aLab, 12);
    for (const j of FIRMS) expect(e.influences(`employment${j}`).terms.some((t) => t.id === 'realWage')).toBe(true);
  });

  // Until padlocks (decision 0010) the key-rate offset's definition said the rule learns a lower
  // neutral rate, and the global stabiliser setting's that nothing anchors inflation while the key
  // rate is held; both are gone, and the key-rate lever now says the second.
  test('the key-rate, spending, tax and benefit levers say that a held rate leaves no nominal anchor', () => {
    const def = (id: string) => model.levers.find((l) => l.id === id)!.definition;
    for (const id of ['incomeTax', 'vat', 'health', 'education', 'otherServices', 'publicInvestment', 'oldAgeTransfers', 'familyBenefits', 'unemploymentBenefits'])
      expect(def(id)).toMatch(/long-run Phillips curve is not vertical/);
    expect(def('keyRate')).toMatch(/nothing anchors inflation/);
  });
});

describe('trade-exporter-debt-spiral: owners keep a squeezed firm’s debt in proportion', () => {
  const cases: [string, Setting][] = [
    ['fish prices −30', ['fishPrices', -30]],
    ['tourism +30', ['tourism', 30]],
    ['foreign demand +20', ['foreignDemand', 20]],
  ];
  for (const [label, setting] of cases)
    for (const automatic of [false, true])
      test(`${label} held for 50 years (${automatic ? 'unlocked' : 'locked'}): every firm’s loans stay below three times their normal share of GDP`, () => {
        // Before: fisheries' loans reached 78–349% of GDP by month 600 (6.2% at baseline).
        const e = createEngine(model, { baseline: base.baselineData, dev: false });
        lockAll(e, !automatic);
        e.setLever(setting[0], setting[1]);
        const l0 = Object.fromEntries(FIRMS.map((j) => [j, base.stock('businessLoans', j) / base.value('gdpTrailing12')]));
        let worst = 0;
        for (let m = 1; m <= 600; m++) {
          e.step(1);
          for (const j of FIRMS) worst = Math.max(worst, e.stock('businessLoans', j) / e.value('gdpTrailing12') / l0[j]);
        }
        expect(worst).toBeLessThan(3);
      });

  test('fish prices −30 with both policy levers locked: fisheries invest less while their debt is above normal, and their owners put money in', () => {
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    e.setLever('fishPrices', -30);
    let cut = 0,
      putIn = 0;
    for (let m = 1; m <= 240; m++) {
      e.step(1);
      if (e.influences('investmentPlanXF').terms.find((t) => t.id === 'debt')!.value < 0) cut++;
      if (e.influences('dividendsXF').regime?.startsWith('Owners put')) putIn++;
    }
    expect(cut).toBeGreaterThan(200);
    expect(putIn).toBeGreaterThan(100);
    expect(e.value('investmentXF')).toBeLessThan(base.value('investmentXF'));
  });

  test('owners in Iceland put in no more than they can spare: in a deflationary collapse no owner is overdrawn by a firm’s call', () => {
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    e.setLever('incomeTax', 10);
    e.setLever('vat', 10);
    let capped = 0;
    for (let m = 1; m <= 240; m++) {
      e.step(1);
      for (const j of ['FC', 'FR', 'XF', 'XT', 'XO']) if (e.influences(`dividends${j}`).regime === 'Owners put in all they can spare') capped++;
    }
    expect(capped).toBeGreaterThan(0);
    for (const p of ['HY', 'HW', 'HO', 'PF']) expect(e.stock('deposits', p)).toBeGreaterThan(-1e-6);
  });

  test('pension funds put money into firms only from deposits above their cash buffer, so 40 years of collapse do not overdraw them', () => {
    // Before this limit, public investment −3 held with both policy levers locked overdrew the funds' deposits from month
    // 456 (−1.94% of GDP by month 480) while fisheries' owners were putting money in.
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    e.setLever('publicInvestment', -3);
    const legs = ['FC', 'FR', 'XF', 'XT', 'XO'].map((j) => `dividends${j}_PF`);
    let lowest = Infinity,
      monthsBelowBuffer = 0,
      callsBelowBuffer = 0;
    for (let m = 1; m <= 480; m++) {
      const deposits = e.stock('deposits', 'PF'); // at the start of the month, as the call reads them
      e.step(1);
      const inf = e.influences('dividendsXF');
      const buffer = inf.params.find((p) => p.id === 'pfLiquidityFloorShare')!.value * inf.params.find((p) => p.id === 'dPF0')!.value * e.value('pensionFundAssets');
      lowest = Math.min(lowest, e.stock('deposits', 'PF'));
      if (deposits > buffer) continue;
      monthsBelowBuffer++;
      for (const id of legs) if (e.value(id) < -1e-12) callsBelowBuffer++;
    }
    expect(monthsBelowBuffer).toBeGreaterThan(0);
    expect(callsBelowBuffer).toBe(0);
    expect(lowest).toBeGreaterThan(0);
  });
});

describe('trade-fish-windfall-hoarded: a fish windfall is paid out and taxed, not hoarded', () => {
  test('fish prices +30 with both policy levers locked: over five years owners receive more than 2% of GDP-years and the state takes a fishing fee', () => {
    // Before: dividends 0.70 of an extra profit of 8.5% of GDP-years, 5.6 used to repay loans, no fee.
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    const b = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(b); // both policy levers locked
    e.setLever('fishPrices', 30);
    let div = 0,
      fee = 0,
      repaid = 0;
    for (let m = 1; m <= 60; m++) {
      e.step(1);
      b.step(1);
      div += (e.value('dividendsXF') - b.value('dividendsXF')) / 12;
      fee += e.value('fishingFee') / 12;
      repaid -= (e.value('borrowingXF') - b.value('borrowingXF')) / 12;
    }
    expect(div).toBeGreaterThan(2);
    expect(fee).toBeGreaterThan(0.5);
    expect(repaid).toBeLessThan(div);
    expect(Math.abs(b.value('fishingFee'))).toBeLessThan(1e-9); // only the part above normal: none at baseline
  });

  test('tourism −60: fisheries repay their loans and pay out spare cash, so their deposits stay near their usual share of GDP', () => {
    // Before: debt-free for 182 months with deposits of 41.5% of GDP (0.9 at baseline). Since the
    // monetary and exchange-rate fixes the króna falls less (about 10% after two years, 18% after
    // twenty), so the windfall repays about three-quarters of their loans in 20 years rather than
    // all of them, and the payout rule hands on the rest as it comes: their deposits never swell.
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    e.setLever('tourism', -60);
    const loans0 = e.stock('businessLoans', 'XF');
    let most = 0;
    for (let m = 1; m <= 240; m++) {
      e.step(1);
      most = Math.max(most, e.stock('deposits', 'XF') / (param(e, 'dividendsXF', 'depXF0') * e.value('nominalGDP')));
    }
    expect(e.stock('businessLoans', 'XF')).toBeLessThan(0.5 * loans0);
    expect(e.stock('businessLoans', 'XF')).toBeGreaterThanOrEqual(0);
    expect(most).toBeLessThan(1.5);
  });
});

describe('trade-month1-export-jump: foreign demand and visitors reach volumes over months', () => {
  const peak = (a: number[]) => a.reduce((j, x, k) => (Math.abs(x) > Math.abs(a[j]) ? k : j), 1);
  for (const [lever, value] of [
    ['foreignDemand', 20],
    ['tourism', 30],
  ] as const)
    for (const automatic of [false, true])
      test(`${lever} +${value} (${automatic ? 'unlocked' : 'locked'}): output peaks after month 3, not in month 1`, () => {
        // Before: output peaked in month 1 (foreign demand +20: +2.05%, tourism +30: +3.20%).
        const r = twins([[lever, value]], automatic, 36);
        const out = Array.from({ length: 37 }, (_, m) => (m ? r.pct('output', m) : 0));
        expect(peak(out)).toBeGreaterThan(3);
        expect(peak(out)).toBeLessThanOrEqual(12);
        expect(out[1]).toBeLessThan(0.4 * out[peak(out)]);
      });

  test('a fall in visitors hits at once, as in 2010 and 2020', () => {
    const r = twins([['tourism', -30]], false, 1);
    expect(r.s.value('tourismFelt')).toBeLessThan(-0.29);
    expect(r.s.influences('tourismFelt').regime).toBe('Visitors stop coming at once');
  });

  test('trade-fish-volume-vs-quotas: fish +30 moves marine volume only a little, as its definition says', () => {
    const r = twins([['fishPrices', 30]], false, 60);
    const v = r.pct('exportVolumeFish', 60);
    expect(v).toBeGreaterThan(1);
    expect(v).toBeLessThan(5);
    const def = model.levers.find((l) => l.id === 'fishPrices')!.definition;
    expect(def).toMatch(/volume moves only a little/);
    expect(def).not.toMatch(/fixed by quotas/);
  });
});

describe('labour-LAB-1: more generous benefits raise normal unemployment', () => {
  for (const automatic of [false, true])
    test(`benefits +30 points (${automatic ? 'unlocked' : 'locked'}): unemployment higher over months 60–240, without a jump, and the real wage barely moves`, () => {
      // Before: −0.15 pp with both policy levers locked and −0.05 with the policy rules acting (demand only).
      const r = twins([['unemploymentBenefits', 30]], automatic, 240);
      let mean = 0;
      for (let m = 60; m <= 240; m++) mean += r.pp('unemployment', m) / 181;
      expect(mean).toBeGreaterThan(0.4);
      expect(mean).toBeLessThan(1.2);
      expect(r.pp('unemployment', 1)).toBeLessThan(0.15);
      const realWage = (e: KernelEngine) => e.valueAt('wage', 240) / e.valueAt('cpi', 240);
      expect(Math.abs(100 * (realWage(r.s) / realWage(r.b) - 1))).toBeLessThan(1);
    });

  test('the extra people searching longer do not hold wages back', () => {
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    e.setLever('unemploymentBenefits', 30);
    e.step(60);
    const s = e.value('benefitSearch');
    expect(s).toBeGreaterThan(0.1);
    const phiU = param(e, 'wageGrowth', 'phiU'),
      uBase = param(e, 'wageGrowth', 'uBase');
    const u = e.valueAt('unemployment', 59),
      sLag = e.valueAt('benefitSearch', 59);
    expect(e.influences('wageGrowth').terms.find((t) => t.id === 'tightLabourMarket')!.value).toBeCloseTo(phiU * (uBase - u / (1 + sLag * (1 - u))), 12);
  });
});

describe('labour-LAB-2: a wage settlement erodes mostly through prices', () => {
  test('wages +10% with both policy levers locked: in the first year consumer prices rise by more than nominal wages give back', () => {
    // Before: wages gave back 2.7 points and prices rose 2.2.
    const r = twins([['wageSettlement', 10]], false, 12);
    const givenBack = 10 - r.pct('wage', 12);
    expect(r.pct('cpi', 12)).toBeGreaterThan(givenBack);
    // Restated for decision 0011 (two kernel steps a month): the give-back was 1.97 points at one
    // step a month, is 2.01 at two and about 2.05 as the step goes to zero (2.03 at four steps,
    // 2.04 at eight). The monthly step's error had been hiding part of the known gap that wages give
    // back too much in the first year (lever-vetting record, LAB-2); the bound follows the
    // converged value so that it still catches a return toward the old 2.7, and is not a target.
    expect(givenBack).toBeLessThan(2.1);
  });

  test('labour cost reaches unit cost faster than import cost', () => {
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    const lamUCw = model.def.modules.flatMap((m) => m.params ?? []).find((p) => p.id === 'lamUCw')!.value;
    const lamUC = model.def.modules.flatMap((m) => m.params ?? []).find((p) => p.id === 'lamUC')!.value;
    expect(lamUCw).toBeGreaterThan(lamUC);
    e.fire('wageSettlement', 10);
    e.setLever('importPrices', 10);
    e.step(1);
    // a month in, firms have priced in more of the pay rise than of the dearer imports
    expect((e.value('labourCostSeen') - 1) / (e.value('wage') - 1)).toBeGreaterThan((e.value('importCostSeen') - 1) / (e.value('deliveredImportPrice') - 1));
  });
});

describe('labour-LAB-6: net immigration', () => {
  test('5 thousand people arriving raise unemployment and slow wages at first; they stay, so output, jobs and house prices end higher (review NETIMM-VANISHES)', () => {
    for (const automatic of [false, true]) {
      const r = twins([['netImmigration', 5]], automatic, 240);
      expect(r.pp('unemployment', 1)).toBeGreaterThan(1);
      expect(r.pp('unemployment', 24)).toBeGreaterThan(0);
      expect(r.pct('wage', 24)).toBeLessThan(0);
      expect(r.s.value('labourInflow')).toBe(5);
      // before, the newcomers left again: employment +0.02% and output +0.04% after 20 years on
      // with the rules acting, and house prices back at baseline
      expect(r.pct('employmentTotal', 240)).toBeGreaterThan(0.5);
      expect(r.pct('output', 240)).toBeGreaterThan(1);
      expect(r.pct('realHousePrice', 240)).toBeGreaterThan(1);
    }
    // with the policy rules acting the central bank counts them in capacity and eases until most have found work
    const a = twins([['netImmigration', 5]], true, 240);
    expect(a.pp('unemployment', 240)).toBeLessThan(0.5 * a.pp('unemployment', 1));
  });

  test('the migration buffer on its own changes nothing, and its definition says so', () => {
    const r = twins([['migration', 80]], false, 24);
    expect(Math.abs(r.pp('unemployment', 24))).toBeLessThan(1e-9);
    expect(model.levers.find((l) => l.id === 'migration')!.definition).toMatch(/on its own it changes nothing/);
  });
});

describe('tax-TAX-2: households keep a cash buffer', () => {
  for (const settings of [[['incomeTax', 5]], [['incomeTax', -5]], [['vat', 10]]] as Setting[][])
    test(`${settings[0][0]} ${settings[0][1] > 0 ? '+' : ''}${settings[0][1]} held with both policy levers locked: spending never runs into the cash limit and working-age deposits keep at least a quarter of their baseline`, () => {
      // Before: income tax +5 left 0.31 of 13.8 at month 240, and VAT +10 emptied them by month 150.
      const e = createEngine(model, { baseline: base.baselineData, dev: false });
      lockAll(e); // both policy levers locked
      for (const [id, v] of settings) e.setLever(id, v);
      let limited = 0,
        lowest = Infinity;
      for (let m = 1; m <= 240; m++) {
        e.step(1);
        for (const g of ['Y', 'W']) if (e.influences(`consumption${g}`).regime === 'Spending limited by cash in hand') limited++;
        lowest = Math.min(lowest, e.stock('deposits', 'HW') / base.stock('deposits', 'HW'));
      }
      expect(limited).toBe(0);
      expect(lowest).toBeGreaterThan(0.25);
    });

  test('the buffer does not bind at baseline', () => {
    for (const g of ['Y', 'W', 'O']) expect(base.influences(`consumption${g}`).terms.find((t) => t.id === 'buffer')!.value).toBe(-0);
  });
});

describe('monetary-MON-11: investment is planned before it is spent', () => {
  test('the key rate held +1 pp for a year: investment keeps falling after the hold ends, after its plans have turned, and troughs later than consumption', () => {
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    const b = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(b); // both policy levers locked
    e.setLever('keyRate', 4);
    const plans = model.vars.map((v) => v.id).filter((id) => id.startsWith('investmentPlan'));
    const inv: number[] = [0],
      plan: number[] = [0],
      cons: number[] = [0];
    for (let m = 1; m <= 36; m++) {
      if (m === 13) lockAll(e, false), lockAll(b, false);
      e.step(1);
      b.step(1);
      inv.push(e.value('investmentReal') - b.value('investmentReal'));
      plan.push(plans.reduce((x, id) => x + e.value(id) - b.value(id), 0));
      cons.push(e.value('realConsumption') - b.value('realConsumption'));
    }
    const low = (a: number[]) => a.indexOf(Math.min(...a.slice(1)));
    expect(plans.length).toBe(6);
    expect(low(inv)).toBeGreaterThan(12);
    expect(low(inv)).toBeGreaterThan(low(plan)); // spending follows plans (month 20 against 15)
    expect(low(inv)).toBeGreaterThan(low(cons)); // month 20 against 19
  });
});

describe('the key-rate rule learns its neutral rate (lever review AUTO-FIXED-NEUTRAL, trade-taylor-fixed-potential)', () => {
  const mean = (f: (t: number) => number, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => f(a + i)).reduce((s, x) => s + x, 0) / (b - a + 1);

  test('at baseline the estimate is the normal neutral rate, and it stays within its band', () => {
    expect(base.baseline('neutralRate')).toBeCloseTo(param(base, 'neutralRate', 'i0'), 15);
    const band = param(base, 'neutralRate', 'rStarBand');
    for (const settings of [[['health', 3]], [['tourism', -60]]] as Setting[][]) {
      const r = twins(settings, true, 240);
      for (let t = 0; t <= 240; t += 12) expect(Math.abs(r.s.valueAt('neutralRate', t) - param(base, 'neutralRate', 'i0'))).toBeLessThanOrEqual(band + 1e-15);
    }
  });

  test('a one-off wage settlement hardly moves it: the inflation and labour-market terms offset', () => {
    const r = twins([['wageSettlement', 10]], true, 72);
    for (let t = 0; t <= 72; t++) expect(Math.abs(r.s.valueAt('neutralRate', t) - r.b.valueAt('neutralRate', t))).toBeLessThan(0.005);
  });

  test('lasting credit shocks with the policy rules acting leave smaller gaps after twenty years than with a fixed neutral rate', () => {
    // with the fixed neutral rate, months 180–240: output −0.58% (ltvCap 50), −0.53% (lendingAppetite −3); inflation −0.29 pp after fish +30
    const ltv = twins([['ltvCap', 50]], true, 240);
    expect(ltv.pct('output', 240)).toBeGreaterThan(-0.45);
    const la = twins([['lendingAppetite', -3]], true, 240);
    expect(Math.abs(la.pct('output', 240))).toBeLessThan(0.3);
    const fish = twins([['fishPrices', 30]], true, 240);
    expect(Math.abs(mean((t) => fish.pp('inflation12', t), 180, 240))).toBeLessThan(0.2);
  });
});

describe('the central bank reads its output gap from the labour market (decision 0012)', () => {
  const potential = (r: ReturnType<typeof twins>, m: number) => r.pct('potentialOutputSeen', m);
  test('potential output follows the labour force: newcomers raise it, workers who leave with the jobs lower it', () => {
    // net immigration +5 thousand (about 2% of the labour force): capacity grows at once, output later
    const imm = twins([['netImmigration', 5]], true, 60);
    expect(potential(imm, 12)).toBeGreaterThan(1.5);
    expect(potential(imm, 12) - imm.pct('output', 12)).toBeGreaterThan(1.5);
    expect(potential(imm, 60)).toBeGreaterThan(imm.pct('output', 60));
    // foreign demand −20: the more of the lost jobs are met by people leaving, the lower potential
    const stay = twins([['foreignDemand', -20], ['migration', 0]], true, 24);
    const leave = twins([['foreignDemand', -20], ['migration', 80]], true, 24);
    expect(potential(leave, 24)).toBeLessThan(potential(stay, 24) - 1);
  });

  test('a shift toward public services that need many staff lowers potential while output rises, so the rule sees a tight economy', () => {
    // With a fixed potential the rule read slack here (output −1.26% at month 240, unemployment
    // 1.2 points below normal over years 15–20, inflation +0.62 pp).
    const r = twins([['health', 3]], true, 60);
    expect(r.pct('output', 60)).toBeGreaterThan(0);
    expect(potential(r, 60)).toBeLessThan(-1);
    expect(r.s.valueAt('outputGap', 60)).toBeGreaterThan(0.01);
  });

  test('known gaps, as tripwires: lasting shifts in public spending and fish prices still leave inflation off target after twenty years with the policy rules acting', () => {
    // Months 180–240, pp. With a fixed potential: health +3 +0.60, education +3 +0.78, fish +30 −0.13;
    // with the labour-market gap +0.31, +0.39 and −0.09; with króna stage 1 (decision 0013) +0.30,
    // +0.39 and −0.09. What remains belongs to channels the model lacks, not to potential
    // output: adjustment through the real exchange rate, and labour supply that follows lasting
    // tightness (lever-vetting open item 2). The neutral-rate estimate is at its limit for health
    // and education; the implied neutral rates are in the lever report. Tighten these as the króna
    // work closes the channel, and restore the "does not move" expectations when they pass.
    const late = (settings: Setting[]) => {
      const r = twins(settings, true, 240);
      let s = 0;
      for (let m = 180; m <= 240; m++) s += r.pp('inflation12', m);
      return s / 61;
    };
    for (const lever of ['health', 'education']) {
      const x = late([[lever, 3]]);
      expect(x).toBeGreaterThan(0.01);
      expect(x).toBeLessThan(0.45);
    }
    const fish = late([['fishPrices', 30]]);
    expect(Math.abs(fish)).toBeGreaterThan(0.01);
    expect(Math.abs(fish)).toBeLessThan(0.1);
  });
});

describe('fish prices +30: year-1 output is a documented ambiguous case (decision 0013, owner decision 10)', () => {
  test('reported, not gated: the windfall’s spending and the stronger króna nearly cancel in year 1, and the three real tests hold', () => {
    // For a quota-bound windfall, GDP volume is ambiguous (Corden and Neary 1982): spending lifts
    // non-tradables, the stronger króna crowds out other exports, and with no resources to move the
    // net sign depends on how much of the spending goes on imports. The expectation "output rises
    // in year 1" failed once the króna priced the flow of krónur (−0.05% and −0.06%; +0.04 before,
    // −0.02 at the vetting), so the lever report's expectations test consumption, other exports and
    // real income instead. This keeps the value in view: small either way, whichever side it is on.
    for (const automatic of [true, false]) {
      const r = twins([['fishPrices', 30]], automatic, 60);
      let y = 0,
        c = 0,
        x = 0;
      for (let m = 1; m <= 12; m++) y += r.pct('output', m) / 12;
      for (let m = 1; m <= 36; m++) c += r.pct('realConsumption', m) / 36;
      const other = (e: KernelEngine, m: number) => e.valueAt('exportVolumeTourism', m) + e.valueAt('exportVolumeOther', m);
      for (let m = 12; m <= 60; m++) x += (100 * (other(r.s, m) / other(r.b, m) - 1)) / 49;
      expect(Math.abs(y)).toBeLessThan(0.15);
      expect(c).toBeGreaterThan(1); // the spending effect, about 1.4–1.6%
      expect(x).toBeLessThan(-3); // Dutch disease, about −4.0 to −4.2%
    }
  });
});

describe('the debt rule’s escape clause (lever review ZLB-DEBT-RULE, ECON-4; decision 0015)', () => {
  test('tourism −60 with the policy rules acting: in the slump and while the key rate is stuck at zero the debt rule raises no taxes, and output recovers far more', () => {
    // before the escape clause: income tax up to 3.3 points higher and output 3.85% lower after 20 years
    const r = twins([['tourism', -60]], true, 240);
    const tau0 = param(base, 'taxRate', 'tau0');
    // "Stuck" through the whole month before: at two steps a month (decision 0011) the first step
    // of month t reads the rule a month earlier, in the middle of month t − 1, so the rule must be
    // below the band at the ends of months t − 2 and t − 1. Checking only the end of month t − 1
    // caught month 41 after króna stage 1 (decision 0013), where the target crossed the band within
    // month 40 and the clause was still phasing in for the first step: 6.4e-6 of a point.
    const band = param(base, 'taxRuleTarget', 'escapeBand');
    const [gap0, gapBand] = [param(base, 'taxRuleTarget', 'downturnGap'), param(base, 'taxRuleTarget', 'downturnBand')];
    const noRise = (t: number) => expect(r.s.valueAt('taxRate', t)).toBeLessThanOrEqual(tau0 + Math.max(0, r.s.valueAt('taxRuleAnchor', t - 1)) + 1e-12);
    let deep = 0;
    for (let t = 2; t <= 240; t++) {
      if (Math.max(r.s.valueAt('ruleTarget', t - 1), r.s.valueAt('ruleTarget', t - 2)) < -band) noRise(t);
      // Fully on in a severe downturn: the output gap below −(downturnGap + downturnBand) through
      // the month (the gap reads unemployment a month back, so the ends of months t − 1 and t).
      if (Math.max(r.s.valueAt('outputGap', t - 1), r.s.valueAt('outputGap', t)) < -(gap0 + gapBand)) {
        noRise(t);
        deep++;
      }
    }
    expect(deep).toBeGreaterThan(48); // the gap is below −3% from month 3 to month 60
    expect(r.s.valueAt('keyRate', 240)).toBeLessThan(1e-12);
    // Restated with decision 0015 (ECON-4). With decision 0012 the rule reads slack from
    // unemployment, which rises more slowly than output falls, so the key rate reaches zero only in
    // the fourth or fifth year (month 49 now); until then the zero-bound clause did not apply, and
    // the debt rule raised income tax 1.25 points in the middle of the slump (tripwire < 1.5,
    // output −4.72% at month 60 and −1.19% at month 240). The downturn clause now holds income tax
    // through the slump: +0.01 to month 120, output −3.82% at month 60 and −0.57% at month 240
    // (main, before decision 0012: −3.95% and −1.06%). Late in the second decade the rule's target
    // hovers at the edge of zero, the zero-bound clause is only partly on, and income tax creeps up
    // (+1.02 at month 240), as decision 0009 found for the band.
    let most = 0;
    for (let t = 1; t <= 120; t++) most = Math.max(most, r.pp('taxRate', t));
    expect(most).toBeLessThan(0.05);
    expect(r.pct('output', 60)).toBeGreaterThan(-4.2);
    expect(r.pct('output', 240)).toBeGreaterThan(-1);
    expect(r.pp('taxRate', 240)).toBeLessThan(1.2);
    expect(r.s.influences('taxRuleTarget').regime).toBe('Escape clause: no tax rise while the central bank’s rule is heading below zero');
    r.s.seek(36);
    expect(r.s.influences('taxRuleTarget').regime).toBe('Escape clause: no tax rise in a severe downturn');
  });

  test('a mild slump still brings the debt rule’s tax rise: tourism −15 with the policy rules acting', () => {
    // The output gap stays above −1.5% (−1.2% at worst), so the downturn clause never engages and
    // nothing moves from before decision 0015: income tax +0.27 points at month 36.
    const r = twins([['tourism', -15]], true, 60);
    let worst = 0;
    for (let t = 1; t <= 60; t++) worst = Math.min(worst, r.s.valueAt('outputGap', t));
    expect(worst).toBeGreaterThan(-param(base, 'taxRuleTarget', 'downturnGap'));
    expect(r.pp('taxRate', 36)).toBeGreaterThan(0.2);
  });
});

describe('the debt rule while only the key rate is locked (decision 0016: R4 and a counter-cyclical term)', () => {
  /** The months in which the debt rule's target shows each regime label. */
  const labels = (e: KernelEngine, months: number) => {
    const out: Record<string, number[]> = {};
    for (let t = 1; t <= months; t++) {
      e.seek(t);
      const r = e.influences('taxRuleTarget').regime;
      if (r) (out[r] ??= []).push(t);
    }
    return out;
  };

  test('R4: the zero-bound clause reads the rate you hold, and only in a slump', () => {
    // Before decision 0016 it read where the unused central-bank rule was heading: falling prices
    // switched it on from about month 103 under a 6% hold, and a 15% hold kept the debt rule idle
    // for eight years (review ECON-2). Now a held rate above zero never switches it on.
    const six = twins([['keyRate', 6]], 'key rate locked', 240);
    expect(Object.keys(labels(six.s, 240))).toEqual([]);
    // Held at zero in a slump it stands the debt rule aside (tourism −60: from month 36)...
    const trap = twins([['keyRate', 0], ['tourism', -60]], 'key rate locked', 120);
    const at = labels(trap.s, 120)['Escape clause: no tax rise while the key rate you hold is at zero in a slump'] ?? [];
    expect(at.length).toBeGreaterThan(60);
    // ...but a rate held at zero in a boom does not stop the rule leaning against it: health +3
    // raises income tax (+1.5 points at month 60), where the clause alone would have held it.
    const boom = twins([['keyRate', 0], ['health', 3]], 'key rate locked', 60);
    expect(Object.keys(labels(boom.s, 60))).toEqual([]);
    expect(boom.pp('taxRate', 60)).toBeGreaterThan(1);
  });

  test('a private-demand slump brings tax cuts, not rises: tourism −60 and lending appetite −3 with the key rate held (reviews ECON-3 and ECON-4)', () => {
    // A debt-only rule is procyclical when monetary policy does not act (Kirsanova, Leith and
    // Wren-Lewis 2009). Before decision 0016: tourism −60 held income tax still through the slump
    // (the downturn clause) with output −6.27% at month 60; lending appetite −3 raised it 0.43 points
    // by month 60 and 1.14 by month 240, with output −1.28% at month 240.
    const t = twins([['tourism', -60]], 'key rate locked', 240);
    let most = -Infinity,
      least = Infinity;
    for (let m = 1; m <= 60; m++) {
      most = Math.max(most, t.pp('taxRate', m));
      least = Math.min(least, t.pp('taxRate', m));
    }
    expect(most).toBeLessThan(0.001); // no rise in the first five years (at most 7e-5 of a point, in month 1)
    expect(least).toBeLessThan(-0.8); // a cut of about a point (−0.98)
    expect(t.pct('output', 60)).toBeGreaterThan(-5.5); // −5.38 (−6.27 before)
    // Later the slow debt term pays the slump's debt back (+4.5 points of tax at month 240, debt
    // +41 points of GDP); output −1.57% at month 240 (−0.95% before, when the tax rise came in the
    // second decade too, +3.4 points).
    expect(t.pct('output', 240)).toBeGreaterThan(-2);
    const l = twins([['lendingAppetite', -3]], 'key rate locked', 240);
    expect(l.pp('taxRate', 60)).toBeLessThan(0.1); // −0.03
    expect(l.pct('output', 240)).toBeGreaterThan(-0.8); // −0.57
  });

  test('the proposal’s acceptance test: no key rate held 1 to 3 points above neutral turns output positive before month 480', () => {
    // With the debt rule leaning on debt at full strength and no counter-cyclical term the 6% hold
    // left output 1.1% lower after 20 years; at a quarter of the strength (phiTauHeld 0.25) it turned
    // positive before month 480 (decision 0016). Now at most −0.04, −0.07 and −0.11% at its highest.
    for (const k of [4, 5, 6]) {
      const r = twins([['keyRate', k]], 'key rate locked', 480);
      for (let m = 1; m <= 480; m++) expect(r.pct('output', m)).toBeLessThan(0);
    }
  }, 30_000);
});

describe('the fishing fee follows profit both ways (lever review FISHFEE-ONESIDED)', () => {
  test('a fall in fish prices lowers the fee about as much as a rise raises it, and the whole fee never goes below zero', () => {
    // before, fish −8 and −30 left the fee unchanged at every horizon
    const up = twins([['fishPrices', 8]], false, 60),
      down = twins([['fishPrices', -8]], false, 60);
    expect(down.s.valueAt('fishingFee', 36)).toBeLessThan(0);
    expect(Math.abs(down.s.valueAt('fishingFee', 36) / up.s.valueAt('fishingFee', 36) + 1)).toBeLessThan(0.1);
    const crash = twins([['fishPrices', -30]], false, 120);
    const normalFee = (param(base, 'fishingFee', 'fishFee') * param(base, 'fishingFee', 'piXF0')) / (1 - param(base, 'fishingFee', 'tauF'));
    for (let t = 0; t <= 120; t += 6) expect(crash.s.valueAt('fishingFee', t)).toBeGreaterThanOrEqual(-normalFee * crash.s.valueAt('cpi', t) - 1e-12);
  });
});
