/**
 * The Iceland model at two kernel steps a month (decision 0011, the acceptance tests of
 * docs/design/long-run-anchors.md §A): what a month shows does not depend on the number of steps,
 * the structural results the step must not move stay put, and the Manual principle holds at every N.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { runScenario } from '../../src/core/scenario.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { calibration } from '../../src/models/iceland/calibration.ts';
import { withConcepts } from '../../src/models/index.ts';
import { LEVER_THRESHOLDS } from '../../src/harness/lever-report.ts';

const at = new Map<number, ReturnType<typeof compile>>();
/** The Iceland model at N kernel steps a month (compiled once per N). */
const model = (N: number) => {
  if (!at.has(N)) at.set(N, compile(withConcepts({ ...icelandModel, substeps: N })));
  return at.get(N)!;
};

test('the Iceland model takes each month in two kernel steps', () => {
  expect(icelandModel.substeps).toBe(2);
});

describe('legs are the month’s totals', () => {
  test('consumption, the wage bill and bank lending: each leg is the mean of its kernel steps, and deposits move by those totals', () => {
    const amounts = new Map<string, number[]>();
    const ids = ['consumptionY_FR', 'consumptionW_FC', 'wagesFR_HY', 'wagesFC_HW', 'newMortgagesN_B_HY', 'newMortgagesI_B_HW'];
    const e = createEngine(model(2), {
      dev: false,
      testHooks: { afterSubstep: (_m, _s, r) => ids.forEach((id) => amounts.set(id, [...(amounts.get(id) ?? []), r.value(id)])) },
    });
    e.fire('wageSettlement', 10);
    e.setLever('lendingAppetite', 2);
    e.step(6);
    const legs = e.legs();
    for (const id of ids) {
      const steps = amounts.get(id)!.slice(-2);
      const leg = legs.find((l) => l.amount === id)!;
      expect(leg.value).toBeCloseTo((steps[0] + steps[1]) / 2, 12);
      expect(steps[1]).not.toBeCloseTo(steps[0], 9); // the two steps differ, so the mean is not the month's end
    }
  });

  // Every player's net worth moving by its legs' month totals is the ledger view's own test
  // (tests/ui: the net-worth row matches the balance sheets month by month, after a shock).
});

describe('what a month shows does not depend on the steps', () => {
  /** A term's change from baseline six months after income tax −5 (Manual) or its offset (Automatic). */
  const shown = (N: number, automatic: boolean) => {
    const e = createEngine(model(N), { dev: false });
    e.setLever('stabilisers', automatic ? 1 : 0);
    e.step(24);
    e.setLever(automatic ? 'incomeTaxOffset' : 'incomeTax', -5);
    e.step(6);
    const term = (v: string, id: string) => {
      const t = e.influences(v).terms.find((x) => x.id === id)!;
      return t.value - t.baseline;
    };
    return {
      wageGrowth: term('wage', 'growth'),
      neutralRevision: term('neutralRate', 'inflation'),
      ruleStep: automatic ? term('ruleRate', 'step') : term('ruleRate', 'nextStep'),
    };
  };

  for (const automatic of [false, true])
    test(`the wage growth term, the neutral-rate revision and the rule's step converge as N doubles, where a per-step display would halve (${automatic ? 'Automatic' : 'Manual'})`, () => {
      const [a, b, c] = [1, 2, 4].map((N) => shown(N, automatic));
      for (const k of ['wageGrowth', 'neutralRevision', 'ruleStep'] as const) {
        expect(Math.abs(a[k])).toBeGreaterThan(1e-5); // the term has moved
        // within the first-order error: the change from 1 to 2 steps is small, and it halves again
        expect(Math.abs(b[k] - a[k])).toBeLessThan(0.15 * Math.abs(a[k]));
        expect(Math.abs(c[k] - b[k])).toBeLessThan(0.75 * Math.abs(b[k] - a[k]) + 1e-12);
      }
    });

  test('firms’ dividends do not flicker between regimes at 1, 2 or 4 steps a month (the lever report’s flicker test)', () => {
    const runs: [string, number, boolean][] = [
      ['foreignRate', -3, true],
      ['vat', 10, true],
      ['kronaShock', -25, true],
      ['kronaShock', -25, false],
    ];
    for (const N of [1, 2, 4]) {
      const m = model(N);
      const rules = ['FC', 'FR', 'XF', 'XA', 'XT', 'XO'].map((j) => m.ruleIndex.get(`dividends${j}`)!);
      for (const [lever, value, automatic] of runs) {
        const e = createEngine(m, { dev: false });
        e.setLever('stabilisers', automatic ? 1 : 0);
        if (lever === 'kronaShock') e.fire(lever, value);
        else e.setLever(lever, value);
        e.step(120);
        for (const r of rules) {
          const labels = Array.from({ length: 120 }, (_, t) => e.regimesAt(t + 1)[r]);
          // the most label changes within any window of the lever report's length
          let densest = 0;
          for (let a = 0; a + LEVER_THRESHOLDS.sawWindow <= labels.length; a++) {
            let n = 0;
            for (let t = a + 1; t < a + LEVER_THRESHOLDS.sawWindow; t++) if (labels[t] !== labels[t - 1]) n++;
            densest = Math.max(densest, n);
          }
          expect(`${lever} ${value} N=${N} ${m.rules[r].id}: ${densest}`).toBe(`${lever} ${value} N=${N} ${m.rules[r].id}: ${Math.min(densest, LEVER_THRESHOLDS.flickerSwitches - 1)}`);
        }
      }
    }
  });
});

describe('what the step must not move', () => {
  test('a 12-month hold at 4% that returns to 3% on Manual troughs in month 12 at 1, 2, 4 and 8 steps a month (lever-vetting item 6 is economics, not numerics)', () => {
    for (const N of [1, 2, 4, 8]) {
      const events = [
        { t: 0, lever: 'keyRateFixed', value: 4 },
        { t: 12, lever: 'keyRateFixed', value: 3 },
      ];
      const s = runScenario(model(N), events, 36, { dev: false });
      const b = runScenario(s.engine, [], 36);
      const gap = Array.from({ length: 37 }, (_, t) => s.value('output', t) - b.value('output', t));
      expect(`N=${N}: trough in month ${gap.indexOf(Math.min(...gap.slice(1)))}`).toBe(`N=${N}: trough in month 12`);
    }
  });

  test('on Manual an income-tax rise leaves the key rate where it is set, at every N (manual-tax-key-rate-held)', () => {
    const check = calibration.find((c) => c.id === 'manual-tax-key-rate-held')!;
    for (const N of [1, 2, 4]) {
      const r = runScenario(model(N), check.scenario, check.months, { dev: false }) as ReturnType<typeof runScenario> & { engine: KernelEngine };
      expect(check.measure(r)).toBe(0);
    }
  });
});
