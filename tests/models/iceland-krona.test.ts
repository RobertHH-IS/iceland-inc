/**
 * The króna's responses that lever texts describe in numbers (review of the fix pass, 29 September
 * 2026): the foreign interest rate weakens it first (E3), and the texts that quote a path stay true.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { withConcepts } from '../../src/models/index.ts';

const model = compile(withConcepts(icelandModel));
const base = createEngine(model);

/** A run from the baseline with one lever moved at month 0: settings are set, one-offs fired. */
function run(lever: string, value: number, automatic: boolean, months: number) {
  const e = createEngine(model, { baseline: base.baselineData, dev: false });
  e.setLever('stabilisers', automatic ? 1 : 0);
  if (model.levers.find((l) => l.id === lever)!.kind === 'oneoff') e.fire(lever, value);
  else e.setLever(lever, value);
  e.step(months);
  return e;
}
const series = (e: ReturnType<typeof run>, id: string) => e.series(id).map((p) => p.v);

describe('Iceland model: the foreign interest rate (review E3)', () => {
  test('a higher foreign rate weakens the króna for the first three years, in either mode', () => {
    // Uncovered interest parity: carry traders and pension funds move money out of krónur. Before
    // the fix the funds' extra foreign income, converted into krónur, strengthened it from month 3.
    for (const automatic of [false, true]) {
      const krona = series(run('foreignRate', 1, automatic, 36), 'krona');
      expect(Math.max(...krona.slice(1, 37))).toBeLessThan(0);
      expect(krona.slice(1, 25).reduce((s, x) => s + x, 0) / 24).toBeLessThan(-0.5);
    }
  });

  test('+5 pp held on Automatic is no deflation trap: the key rate never reaches its floor in 20 years', () => {
    // Before: the króna 13% stronger after a year, inflation down to 3.9 pp below baseline and the
    // key rate at zero from month 20. Now it rises at first, and inflation stays within 1.5 pp.
    const e = run('foreignRate', 5, true, 240);
    expect(series(e, 'krona')[12]).toBeLessThan(-3);
    expect(Math.min(...Array.from({ length: 241 }, (_, m) => e.valueAt('keyRate', m)))).toBeGreaterThan(0.01);
    expect(Math.min(...series(e, 'inflation'))).toBeGreaterThan(-1.5);
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
