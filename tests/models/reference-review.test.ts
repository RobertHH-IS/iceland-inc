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
