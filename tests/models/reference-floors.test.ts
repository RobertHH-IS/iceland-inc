/**
 * The reference economy's floors (audit H1, M22; decision 0005): firms cannot hire more people
 * than there are, and nobody sells government bonds it does not hold. Each is a `combine` with a
 * named regime on the existing rule, idle at the baseline.
 */
import { describe, expect, test } from 'bun:test';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import type { Ctx } from '../../src/core/types.ts';
import { referenceModel } from '../../src/models/reference/index.ts';

const base = createEngine(referenceModel);

/** A Manual run from the baseline with one lever set at month 0, stepped month by month. */
function manual(lever: string, value: number, months: number, each: (e: KernelEngine) => void): void {
  const e = createEngine(base.model, { baseline: base.baselineData });
  e.setLever('stabilisers', 0);
  e.setLever(lever, value);
  for (let m = 0; m < months; m++) {
    e.step(1);
    each(e);
  }
}

describe('reference economy: floors', () => {
  test('a boom never takes unemployment below the people between jobs (2%)', () => {
    let lowest = Infinity;
    let capped = 0;
    manual('govSpending', 3, 240, (e) => {
      lowest = Math.min(lowest, e.value('unemployment'));
      if (e.influences('employment').regime === 'No one left to hire') capped++;
    });
    expect(capped).toBeGreaterThan(0);
    expect(lowest).toBeGreaterThanOrEqual(0.02 - 1e-9);
  });

  test('a key rate held at zero: the surplus buys back only the bonds the bank holds, and the rest stays in the treasury account', () => {
    let limited = 0;
    let lowestBonds = Infinity;
    let highestTreasury = 0;
    manual('keyRateFixed', 0, 240, (e) => {
      lowestBonds = Math.min(lowestBonds, e.stock('bonds', 'B'), e.stock('bonds', 'CB'));
      highestTreasury = Math.max(highestTreasury, e.stock('treasuryAccount', 'G'));
      if (e.influences('bondIssue').regime === 'Buyback limited by the bank’s bonds') limited++;
    });
    expect(limited).toBeGreaterThan(0);
    expect(lowestBonds).toBeGreaterThan(-1e-9);
    expect(highestTreasury).toBeGreaterThan(3);
  });

  test('the central bank sells at most the bonds it holds: the sale floor and its regime', () => {
    // No lever reaches this branch: the central bank holds about 18% of GDP in bonds and the bank
    // about 9% in reserves, so draining excess reserves at the calibrated speed empties the
    // reserves long before the central bank's bonds. So the rule is checked directly, with the
    // central bank down to 1% of GDP in bonds and reserves 60% of GDP above target.
    const rule = referenceModel.modules.flatMap((m) => m.rules ?? []).find((r) => r.id === 'openMarket')!;
    const holdings: Record<string, number> = { 'bonds/B': 30, 'bonds/CB': 1 };
    const c = { dt: 1 / 12, stock: (ins: string, pl: string) => holdings[`${ins}/${pl}`] ?? 0 } as unknown as Ctx;
    const sell = { reserveGap: -6 * 60 };
    expect(rule.combine!(sell, c)).toBeCloseTo(-12, 12); // 1% of GDP in one month, as a yearly flow
    expect(rule.regime!(c, rule.combine!(sell, c), sell)).toBe('Limited by the central bank’s bonds');
    // a sale within its holdings is not limited, and a purchase beyond the bank's bonds is
    expect(rule.combine!({ reserveGap: -6 }, c)).toBe(-6);
    expect(rule.regime!(c, -6, { reserveGap: -6 })).toBeNull();
    expect(rule.regime!(c, 360, { reserveGap: 400 })).toBe('Limited by the bank’s bonds');
  });

  test('no floor binds at the baseline, in either mode', () => {
    for (const mode of [0, 1]) {
      const e = createEngine(base.model, { baseline: base.baselineData });
      e.setLever('stabilisers', mode);
      e.step(24);
      for (const id of ['employment', 'bondIssue', 'openMarket']) expect(`${id}: ${e.influences(id).regime ?? 'none'}`).toBe(`${id}: none`);
      expect(Math.abs(e.value('unemployment') - e.baseline('unemployment'))).toBeLessThan(1e-9);
    }
  });
});
