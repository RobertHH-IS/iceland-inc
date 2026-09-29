/**
 * The liquidity floors respond smoothly (review E1). The balance-sheet floors used to switch fully
 * on and off from one month to the next: pension funds bought foreign assets with most of their
 * deposits, fell below their cash buffer, sold the next month and bought again, and non-residents
 * did the same with government bonds. Several levers inside their ranges gave sawtooth paths:
 * foreign allocation +20 with the policy rules acting reversed pension funds' foreign purchases 97 times in ten
 * years, a króna shock of −25% reversed non-residents' bond trades 96 times. One smooth limit for
 * buying and selling (cash above the buffer, negative below it) replaced the switch; this test
 * keeps it that way for every lever alone at its min and at its max, locked and unlocked where it acts.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { lockAll } from '../../src/core/scenario.ts';
import { createEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { withConcepts } from '../../src/models/index.ts';

const model = compile(withConcepts(icelandModel));
const base = createEngine(model);
const MONTHS = 240;
/** Flows the liquidity floors act on, besides every chart. */
const FLOWS = ['foreignAssetPurchases', 'bankBondPurchases', 'bondPurchasesPF', 'bondPurchasesW', 'bondIssuePF', 'consumptionY', 'consumptionW', 'consumptionO'];
/** Most direction reversals allowed in 20 years. Damped cycles reverse a few times (the credit
 *  impulse, a change in a flow over a year, up to 8 times, as before the floors); a sawtooth
 *  reverses every month or two. */
const MAX_REVERSALS = 10;

/** Direction reversals in a path, counting only swings of more than `frac` of its whole range:
 *  a reversal is a move back of more than that from the last peak or trough. */
function reversals(xs: number[], frac = 0.1): number {
  const range = Math.max(...xs) - Math.min(...xs);
  if (!(range > 1e-6)) return 0;
  const band = frac * range;
  let n = 0,
    dir = 0,
    ext = xs[0];
  for (const x of xs) {
    if (dir === 0) {
      if (x - ext > band) [dir, ext] = [1, x];
      else if (ext - x > band) [dir, ext] = [-1, x];
    } else if (dir > 0) {
      if (x > ext) ext = x;
      else if (ext - x > band) [n, dir, ext] = [n + 1, -1, x];
    } else if (x < ext) ext = x;
    else if (x - ext > band) [n, dir, ext] = [n + 1, 1, x];
  }
  return n;
}

describe('Iceland model: the liquidity floors respond smoothly', () => {
  test('the reversal count sees a sawtooth and ignores a damped cycle', () => {
    expect(reversals(Array.from({ length: 120 }, (_, m) => (m % 2 ? 1 : -1)))).toBe(118);
    expect(reversals(Array.from({ length: 240 }, (_, m) => Math.exp(-m / 30) * Math.cos(m / 6)))).toBeLessThan(MAX_REVERSALS);
    expect(reversals(Array.from({ length: 240 }, (_, m) => 1 - Math.exp(-m / 20)))).toBe(0);
  });

  for (const l of model.levers) {
    if (l.kind === 'lock' || l.kind === 'choice') continue;
    for (const automatic of [false, true]) {
      test(`${l.id} at ${l.min} and ${l.max} (${automatic ? 'unlocked' : 'locked'}): no path reverses more than ${MAX_REVERSALS} times in 20 years`, () => {
        const bad: string[] = [];
        for (const v of [l.min!, l.max!]) {
          const e = createEngine(model, { baseline: base.baselineData, dev: false });
          lockAll(e, !automatic);
          if (l.kind === 'oneoff') e.fire(l.id, v);
          else e.setLever(l.id, v);
          e.step(MONTHS);
          const paths: [string, number[]][] = [
            ...FLOWS.map((id): [string, number[]] => [id, Array.from({ length: MONTHS + 1 }, (_, m) => e.valueAt(id, m))]),
            ...model.indicators.map((i): [string, number[]] => [`chart ${i.id}`, e.series(i.id).map((p) => p.v)]),
          ];
          for (const [id, xs] of paths) {
            const n = reversals(xs);
            if (n > MAX_REVERSALS) bad.push(`${l.id}=${v}: ${id} reverses ${n} times`);
          }
        }
        expect(bad).toEqual([]);
      });
    }
  }
});
