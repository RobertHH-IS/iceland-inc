/**
 * The reference economy after the lever review (reports/levers/reference.md): what its texts claim
 * about the debt rule and the tax actually charged, checked against the numbers.
 */
import { describe, expect, test } from 'bun:test';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { runScenario } from '../../src/core/scenario.ts';
import { referenceModel } from '../../src/models/reference/index.ts';

const MANUAL = 0,
  AUTOMATIC = 1;
const base = createEngine(referenceModel, { dev: false });

/** Run `events` in a stabiliser mode for `months`, and the no-change run in the same mode. */
function pair(mode: number, events: { t: number; lever: string; value: number; fire?: boolean }[], months: number): [KernelEngine, KernelEngine] {
  const m = { t: 0, lever: 'stabilisers', value: mode };
  return [runScenario(base, [m, ...events], months).engine, runScenario(base, [m], months).engine];
}

describe('the income tax charged', () => {
  test('the tax explanation names the rate before the lever in each mode, and Manual charges the normal rate plus the lever', () => {
    const e = createEngine(base.model, { dev: false, baseline: base.baselineData });
    e.setLever('stabilisers', MANUAL);
    e.setLever('taxRate', 2);
    e.step(24);
    const inf = e.influences('taxes');
    expect(inf.rule!.rule).toMatch(/debt rule’s rate on Automatic and the normal rate \d+(\.\d+)?% on Manual/);
    const normal = inf.params.find((p) => p.id === 'normalTaxRate')!.value;
    const base_ = e.value('wages') + e.value('depositInterestHH') + e.value('firmDividends') + e.value('bankDividends');
    expect(Math.abs(e.value('taxes') - (normal + 0.02) * base_)).toBeLessThan(1e-9);
    // on Manual the debt rule's own rate has moved, and the tax charged ignores it
    expect(Math.abs(e.value('debtRuleRate') - normal)).toBeGreaterThan(1e-4);
  });
});

describe('the debt rule', () => {
  test('on Automatic it undoes a lasting tax rise in the end, and debt moves by about the rise ÷ its strength', () => {
    const [e, r] = pair(AUTOMATIC, [{ t: 0, lever: 'taxRate', value: 3 }], 240);
    const response = e.influences('debtRuleRate').params.find((p) => p.id === 'fiscalResponse')!.value;
    // the rate charged (the rule's rate + the lever) has given back at least four-fifths of the rise
    const charged = (x: KernelEngine) => x.valueAt('taxRate', 240) + (x === e ? 0.03 : 0);
    expect(Math.abs(charged(e) - charged(r))).toBeLessThan(0.006);
    // debt ratio (bonds ÷ capacity output at today's prices), points of GDP: −3 ÷ 0.3 = −10
    const dDebt = e.valueAt('debtRatio', 240) - r.valueAt('debtRatio', 240);
    expect(dDebt).toBeLessThan((-3 / response) * 0.7);
    expect(dDebt).toBeGreaterThan((-3 / response) * 1.3);
  });
});

describe('wages and expectations (decision 0007)', () => {
  test('wages pass on all of expected inflation, so at the natural rate of unemployment real wages hold steady', () => {
    const e = createEngine(base.model, { dev: false, baseline: base.baselineData });
    expect(e.influences('wageGrowth').params.find((p) => p.id === 'wageIndexation')!.value).toBe(1);
  });

  test('expected inflation is partly anchored: a year after a 10% wage settlement it is well under half of actual inflation', () => {
    const [e, r] = pair(AUTOMATIC, [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }], 12);
    const anchor = e.influences('expectedInflation').params.find((p) => p.id === 'expectationsAnchor')!.value;
    const dExp = e.valueAt('expectedInflation', 12) - r.valueAt('expectedInflation', 12);
    const highest = Math.max(...Array.from({ length: 12 }, (_, i) => e.valueAt('inflation', i + 1) - r.valueAt('inflation', i + 1)));
    expect(dExp).toBeGreaterThan(0);
    expect(dExp).toBeLessThan((1 - anchor) * highest);
  });

  test('a 10% wage settlement raises the price level by 10–15% for good, not by a spiral (second-round effects are moderate)', () => {
    const [e, r] = pair(AUTOMATIC, [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }], 240);
    const rise = (x: number) => 100 * (e.valueAt('price', x) / r.valueAt('price', x) - 1);
    expect(rise(240)).toBeGreaterThan(10);
    expect(rise(240)).toBeLessThan(15);
    // it has settled: less than a tenth of a percent in the last year
    expect(Math.abs(rise(240) - rise(228))).toBeLessThan(0.1);
  });

  test('a lasting boom raises inflation by a steady amount, not ever faster (anchored expectations), and no lever sends Automatic into a deflationary spiral', () => {
    for (const [lever, value] of [
      ['govSpending', 3],
      ['lendingAppetite', 2],
      ['keyRateAddon', -2],
    ] as const) {
      const [e, r] = pair(AUTOMATIC, [{ t: 0, lever, value }], 240);
      const d = (t: number) => e.valueAt('inflation12', t) - r.valueAt('inflation12', t);
      expect(d(240)).toBeGreaterThan(0);
      expect(Math.abs(d(240) - d(180))).toBeLessThan(0.002);
    }
    for (const [lever, value] of [
      ['govSpending', -3],
      ['taxRate', 3],
      ['lendingAppetite', -2],
      ['keyRateAddon', 3],
    ] as const) {
      const [e, r] = pair(AUTOMATIC, [{ t: 0, lever, value }], 240);
      const gap = 100 * (e.valueAt('output', 240) / r.valueAt('output', 240) - 1);
      const earlier = 100 * (e.valueAt('output', 180) / r.valueAt('output', 180) - 1);
      expect(gap).toBeGreaterThan(-2.5);
      expect(gap).toBeGreaterThan(earlier - 0.1); // recovering or settled, not sinking
    }
  });
});

describe('the key-rate offset', () => {
  test('on Automatic the rule leans against it: the key rate rises by about half the offset at most, and ends close to where it started', () => {
    const [e, r] = pair(AUTOMATIC, [{ t: 0, lever: 'keyRateAddon', value: 3 }], 240);
    const d = (t: number) => 100 * (e.valueAt('keyRate', t) - r.valueAt('keyRate', t));
    const peak = Math.max(...Array.from({ length: 240 }, (_, i) => d(i + 1)));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(0.6 * 3);
    expect(Math.abs(d(240))).toBeLessThan(0.3);
    // inflation settles lower and output stays below capacity (anchored expectations)
    expect(e.valueAt('inflation12', 240) - r.valueAt('inflation12', 240)).toBeLessThan(0);
    expect(e.valueAt('output', 240)).toBeLessThan(r.valueAt('output', 240));
  });
});

describe('the bank’s lending appetite (review REF-credit-appetite-mechanism)', () => {
  test('new loans follow the spending they pay for: no burst of idle deposits in the first month', () => {
    const [e, r] = pair(AUTOMATIC, [{ t: 0, lever: 'lendingAppetite', value: 2 }], 12);
    const dLoans = e.valueAt('newLoans', 1) - r.valueAt('newLoans', 1);
    const dInvestment = e.valueAt('investment', 1) - r.valueAt('investment', 1);
    expect(dLoans).toBeGreaterThan(0);
    expect(dLoans).toBeLessThan(1.2 * dInvestment);
    // the extra loans = what firms spend of the new credit + what rolls over the extra debt
    for (const t of [1, 6, 12]) {
      const dPlans = 0.4 * (e.valueAt('investmentPlan', t) * e.valueAt('price', t) - r.valueAt('investmentPlan', t) * r.valueAt('price', t));
      const extra = e.valueAt('creditInvestment', t) + e.valueAt('appetiteLoans', t - 1) / 8;
      expect(Math.abs(e.valueAt('newLoans', t) - r.valueAt('newLoans', t) - dPlans - extra)).toBeLessThan(1e-9);
    }
  });

  test('the boost follows net credit: it fades as repayments catch up, and the credit impulse turns negative after about two years', () => {
    const [e, r] = pair(AUTOMATIC, [{ t: 0, lever: 'lendingAppetite', value: 2 }], 120);
    const inv = (t: number) => e.valueAt('investmentReal', t) - r.valueAt('investmentReal', t);
    const peak = Math.max(...Array.from({ length: 36 }, (_, i) => inv(i + 1)));
    expect(peak).toBeGreaterThan(1);
    expect(inv(120)).toBeLessThan(0.25 * peak);
    expect(e.valueAt('creditImpulse', 24) - r.valueAt('creditImpulse', 24)).toBeLessThan(0);
    // the extra debt stays: about the loan term's worth of the extra lending
    expect(e.valueAt('appetiteLoans', 120)).toBeGreaterThan(10);
  });

  test('payback: when the appetite goes, firms repay the extra debt and invest less than they otherwise would', () => {
    const [e, r] = pair(AUTOMATIC, [{ t: 0, lever: 'lendingAppetite', value: 2 }, { t: 60, lever: 'lendingAppetite', value: 0 }], 120);
    const inv = (t: number) => e.valueAt('investmentReal', t) - r.valueAt('investmentReal', t);
    const later = Array.from({ length: 36 }, (_, i) => inv(61 + i));
    expect(later.reduce((s, x) => s + x, 0) / later.length).toBeLessThan(-0.5);
    expect(e.valueAt('appetiteLoans', 120)).toBeLessThan(0.6 * e.valueAt('appetiteLoans', 60));
  });
});

describe('inflation and household saving (review REF-realbalance-too-strong)', () => {
  test('households save to make up only part of what expected inflation takes off their deposits', () => {
    const [e] = pair(AUTOMATIC, [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }], 12);
    const inf = e.influences('consumption');
    const term = inf.terms.find((t) => t.id === 'inflationLoss')!;
    const k = inf.params.find((p) => p.id === 'inflationAwareness')!.value;
    const mpc = inf.params.find((p) => p.id === 'propensityFromIncome')!.value;
    expect(k).toBeLessThan(mpc);
    expect(term.concept).toBe('haig-simons-income');
    // deposits at the end of last month, which the rule reads, are within a fraction of a percent of today's
    expect(Math.abs(term.value / (e.valueAt('expectedInflation', 12) * e.stock('deposits', 'HH')) + k)).toBeLessThan(0.01 * k);
  });

  test('a 10% wage settlement on Automatic costs less than 7% of output at the trough (it cost 7.5%)', () => {
    const [e, r] = pair(AUTOMATIC, [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }], 60);
    const trough = Math.min(...Array.from({ length: 60 }, (_, i) => 100 * (e.valueAt('output', i + 1) / r.valueAt('output', i + 1) - 1)));
    expect(trough).toBeLessThan(-2);
    expect(trough).toBeGreaterThan(-7);
  });
});
