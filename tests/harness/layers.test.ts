/**
 * The harness layers on the reference model: half-step tolerances (audit L27, L28), runs on
 * forks reaching the accounting layer (L29), the golden guard for late events (M19), and the
 * plausibility gate of the property, lever-extremes and golden runs (M22, H1, decision 0005).
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngine } from '../../src/core/engine.ts';
import { runScenario } from '../../src/core/scenario.ts';
import type { CalibrationCheck, InstrumentDef, ModelDef, ModuleDef, RunResult } from '../../src/core/types.ts';
import { param, rule, tinyModel, variable } from '../core/fixtures.ts';
import { models } from '../../src/models/index.ts';
import { HALF_STEP_TOL, HALF_STEP_WIDTH, halfStepShare, limitInRange, observedOrder, orderTrusted, runHarness, stepLimit, type HarnessOptions } from '../../src/harness/layers.ts';

const reference = models.find((d) => d.id === 'reference')!;
const iceland = models.find((d) => d.id === 'iceland')!;
const opts: HarnessOptions = {
  updateGolden: false,
  goldenDir: join(import.meta.dir, '..', 'golden'),
  propertyRuns: 4,
  propertyMonths: 36,
  seed: 1,
  extremeMonths: 60,
};
const layer = (r: ReturnType<typeof runHarness>, n: number) => r.layers.find((l) => l.n === n)!;

describe('halfStepShare', () => {
  const check = (x: Partial<CalibrationCheck>): CalibrationCheck => ({ id: 'c', label: '', scenario: [], months: 12, measure: () => 0, range: [0, 10], ...x });

  test('a timing measure may move by one quarter, whatever its value', () => {
    const timing = check({ kind: 'timing', range: [4, 7] });
    expect(halfStepShare(timing, 4, 5)).toBe(1);
    expect(halfStepShare(timing, 6, 5)).toBe(1);
    expect(halfStepShare(timing, 4, 6)).toBe(2);
    expect(halfStepShare(timing, 5, 5)).toBe(0);
  });

  test('a measure with a bounded range may move by HALF_STEP_WIDTH of the width, whatever its value', () => {
    const c = check({ range: [0, 0.25] });
    expect(halfStepShare(c, 0.2, 0.2 + 0.5 * HALF_STEP_WIDTH * 0.25)).toBeCloseTo(0.5, 12);
    expect(halfStepShare(c, 0.01, 0.01 + 0.5 * HALF_STEP_WIDTH * 0.25)).toBeCloseTo(0.5, 12);
    expect(halfStepShare(check({ range: [4, 7] }), 5, 6)).toBeGreaterThan(1);
  });

  test('a measure with a half-open range may move by HALF_STEP_TOL of its value', () => {
    const c = check({ range: [0.5, Infinity] });
    expect(halfStepShare(c, 1, 1 + 0.5 * HALF_STEP_TOL)).toBeCloseTo(0.5, 12);
    expect(halfStepShare(c, 1, 1 + 1.5 * HALF_STEP_TOL)).toBeCloseTo(1.5, 12);
  });

  test('the continuous-time limit is 2 v(dt/2) − v(dt) and must lie in the range, with 1% of its width as slack', () => {
    expect(stepLimit(0.19, 0.2)).toBeCloseTo(0.21, 12);
    expect(limitInRange(check({ range: [0, 0.25] }), 0.26)).toBe(false);
    expect(limitInRange(check({ range: [0, 0.25] }), 0.2524)).toBe(true);
    expect(limitInRange(check({ range: [-0.25, 0.25] }), -0.256)).toBe(false);
    expect(limitInRange(check({ range: [0, 0.25] }), 0.24)).toBe(true);
    expect(limitInRange(check({ kind: 'timing', range: [4, 7] }), 9)).toBe(true); // a timing measure has no limit
  });

  test('at an observed order p the limit is v(h/2) + (v(h/2) − v(h)) ÷ (2^p − 1), and the full run trusts p only in 0.5–2', () => {
    // a first-order error: v(h) = L + c·h, so the differences halve and the order is 1
    const L = 3.3,
      cst = 0.16;
    const v = (h: number) => L + cst * h;
    expect(observedOrder(v(1), v(0.5), v(0.25))).toBeCloseTo(1, 12);
    expect(stepLimit(v(1), v(0.5), 1)).toBeCloseTo(L, 12);
    // a second-order error: the differences quarter, and the order-1 estimate would overshoot
    const w = (h: number) => L + cst * h * h;
    const p = observedOrder(w(1), w(0.5), w(0.25));
    expect(p).toBeCloseTo(2, 12);
    expect(stepLimit(w(1), w(0.5), p)).toBeCloseTo(L, 12);
    expect(Math.abs(stepLimit(w(1), w(0.5)) - L)).toBeGreaterThan(0.01);
    expect(orderTrusted(1)).toBe(true);
    expect(orderTrusted(0.4)).toBe(false);
    expect(orderTrusted(2.6)).toBe(false);
    // a measure that does not move with the step has no order
    expect(observedOrder(1, 1, 1)).toBeNaN();
  });

  test('a measure that is not a number fails', () => {
    expect(halfStepShare(check({}), 1, NaN) <= 1).toBe(false);
    expect(halfStepShare(check({ kind: 'timing' }), NaN, 5) <= 1).toBe(false);
  });
});

test('L28: the money-gap measure compares a half-step bank run with a half-step fund run', () => {
  const c = iceland.calibration!.find((x) => x.id === 'fiscal-money-banks-vs-funds')!;
  // the half-step engine runs twice the kernel steps a month (decision 0011), in the same months
  const half = createEngine({ ...iceland, substeps: 2 * (iceland.substeps ?? 1) });
  expect(half.model.def.substeps).toBe(4);
  const banks = runScenario(half, c.scenario, c.months);
  // the funds-financed counterpart: the same scenario with pension funds (option 3) buying the bonds
  const funds = runScenario(half, c.scenario.map((e) => (e.lever === 'bondBuyers' ? { ...e, value: 3 } : e)), c.months);
  const gap = (m: number) => banks.series('broadMoney')[m] - funds.series('broadMoney')[m];
  expect(c.measure(banks)).toBe(Math.min(gap(12), gap(24)));
  // and not the gap against a fund run at the standard step
  const standard = runScenario(iceland, c.scenario.map((e) => (e.lever === 'bondBuyers' ? { ...e, value: 3 } : e)), c.months);
  expect(Math.abs(c.measure(banks) - Math.min(...[12, 24].map((m) => banks.series('broadMoney')[m] - standard.series('broadMoney')[m])))).toBeGreaterThan(1e-9);
});

describe('runHarness on the reference model', () => {
  test('passes', () => {
    const r = runHarness(reference, opts);
    expect(r.layers.filter((l) => !l.pass).map((l) => l.title)).toEqual([]);
    expect(r.timing!.maxIterations).toBeGreaterThan(1);
  });

  test('L29: runs a module test makes on forks, and on forks of forks, reach the accounting layer', () => {
    const forking: ModelDef = {
      ...reference,
      modules: reference.modules.map((mod, i) =>
        i
          ? mod
          : {
              ...mod,
              tests: [
                ...(mod.tests ?? []),
                {
                  id: 'forks',
                  label: 'Steps a fork and a fork of that fork',
                  run: (e) => {
                    const a = e.fork();
                    const b = a.fork();
                    a.step(6);
                    b.step(12);
                    return { pass: true, detail: '' };
                  },
                },
              ],
            },
      ),
    };
    const runs = (d: ModelDef) => Number(/over (\d+) runs/.exec(layer(runHarness(d, opts), 3).summary)![1]);
    const months = (d: ModelDef) => Number(/\((\d+) months\)/.exec(layer(runHarness(d, opts), 3).summary)![1]);
    expect(runs(forking) - runs(reference)).toBe(3);
    expect(months(forking) - months(reference)).toBe(18);
  });

  test('M19: a golden scenario with an event at or after its last month fails', () => {
    const late: ModelDef = {
      ...reference,
      calibration: [...reference.calibration!, { id: 'late', label: 'late', scenario: [{ t: 60, lever: 'govSpending', value: 1 }], months: 60, measure: () => 0, range: [0, 0] }],
    };
    const l6 = layer(runHarness(late, opts), 6);
    expect(l6.pass).toBe(false);
    expect(l6.body.find((x) => x.startsWith('| calibration-late |'))).toContain('1 event(s) at or after month 60 would never apply');
  });

  test('the lever expectations gate: all hold on the model as declared; a wrong one, or a lever without any, fails', () => {
    const ok = layer(runHarness(reference, opts), 6);
    expect(ok.summary).toMatch(/expectations (\d+)\/\1(,|$)/);
    expect(ok.body).toContain('### Lever expectations');
    const wrong = layer(runHarness(reference, { ...opts, expectations: [{ lever: 'govSpending', setting: 'max', variable: 'output', fromMonth: 1, toMonth: 12, sign: -1, theory: 'Deliberately wrong.', source: 'test' }] }), 6);
    expect(wrong.pass).toBe(false);
    expect(wrong.summary).toContain('expectations 0/1');
    expect(wrong.body.find((x) => x.startsWith('- govSpending (max, any)'))).toContain('should fall');
    expect(wrong.body.find((x) => x.startsWith('Levers without expectations'))).toContain('`taxRate`');
    // a fixture model that declares none is not checked
    const none = layer(runHarness(reference, { ...opts, expectations: null }), 6);
    expect(none.pass).toBe(true);
    expect(none.body.some((x) => x.startsWith('The model declares no expectations'))).toBe(true);
  });

  test('M22: a lever setting that pushes a variable out of its plausible bounds fails the sweep', () => {
    // A key rate held at −1% (moving it locks it) breaks the bound 'keyRate ≥ 0'.
    const wild: ModelDef = {
      ...reference,
      modules: reference.modules.map((mod) => (mod.levers?.some((l) => l.id === 'keyRate') ? { ...mod, levers: mod.levers.map((l) => (l.id === 'keyRate' ? { ...l, min: -1 } : l)) } : mod)),
    };
    const l6 = layer(runHarness(wild, opts), 6);
    expect(l6.pass).toBe(false);
    expect(l6.body.find((x) => x.startsWith('- keyRate = -1, unlocked'))).toContain('keyRate (≥ 0) at month 1');
    expect(l6.body.find((x) => x.startsWith('- keyRate = -1, locked'))).toContain('keyRate (≥ 0) at month 1');
    expect(layer(runHarness(reference, opts), 6).body.some((x) => x.startsWith('- keyRate '))).toBe(false);
  });
});

/** Households pay a fine to the government, set by a lever up to 200 a year: at the top it
 *  overdraws their 50 of deposits within months. The bank has reserves enough to pay it. */
function fineModel(mayGoNegative?: InstrumentDef['mayGoNegative']): ModelDef {
  const fine: ModuleDef = {
    id: 'fine',
    label: 'Fine',
    description: 'A fine households pay to the government.',
    vars: [variable('fine', 0)],
    params: [param('fineLevel', 0)],
    rules: [rule({ id: 'fine', target: 'fine', category: 'POLICY', params: ['fineLevel'], compute: (c) => c.p('fineLevel') })],
    flows: [{ id: 'fine', label: 'Fine', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: [{ from: 'HH', to: 'G', amount: 'fine' }], explain: { what: 'a fine' } }],
    levers: [{ id: 'fine', label: 'Fine', group: 'Policy', kind: 'setting', unit: '% of GDP', default: 0, min: 0, max: 200, binds: { param: 'fineLevel', mode: 'replace' }, description: 'fine', definition: 'Level, persistent while set.' }],
  };
  const def = tinyModel([fine]);
  if (mayGoNegative) def.modules[0].instruments = def.modules[0].instruments!.map((i) => (i.id === 'deposits' ? { ...i, mayGoNegative } : i));
  def.steadyState.initialStocks = def.steadyState.initialStocks.map(([i, p, v]) => [i, p, i === 'reserves' ? 2000 : v]);
  return def;
}

describe('H1: the harness fails on wrong-signed positions that are not exempt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-signs-'));
  const run = (def: ModelDef) => layer(runHarness(def, { ...opts, goldenDir: dir, updateGolden: true }), 6);

  test('an overdraft fails the lever-extremes sweep and is not written as a golden', () => {
    const l6 = run(fineModel());
    expect(l6.pass).toBe(false);
    expect(l6.summary).toContain('extremes 0/1');
    expect(l6.body.find((x) => x.startsWith('- fine = 200'))).toContain('deposits / HH (holder’s asset ≥ 0)');
    expect(l6.body.find((x) => x.startsWith('| all-levers |'))).toContain('not written');
  });

  test('a declared exemption is honoured', () => {
    const l6 = run(fineModel({ reason: 'households may run an overdraft at the bank' }));
    expect(l6.summary).toContain('extremes 1/1 (0 breach(es))');
    expect(l6.body.find((x) => x.startsWith('| all-levers |'))).toContain('written');
    expect(l6.body.join('\n')).toContain('exempt, decision 0005: `deposits`');
    rmSync(dir, { recursive: true, force: true });
  });
});
