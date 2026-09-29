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

describe('Iceland model: the króna-shock lever does what its definition says (review M21)', () => {
  test('−10: about 8% weaker by month 3, about half of that gone after a year, in either mode', () => {
    for (const automatic of [false, true]) {
      const krona = series(run('kronaShock', -10, automatic, 24), 'krona');
      expect(krona[3]).toBeGreaterThan(-9);
      expect(krona[3]).toBeLessThan(-7.5);
      expect(Math.min(...krona.slice(1, 13))).toBeGreaterThan(-9);
      expect(krona[12] / krona[3]).toBeGreaterThan(0.4);
      expect(krona[12] / krona[3]).toBeLessThan(0.6);
      expect(krona[24] / krona[3]).toBeLessThan(0.25); // most of it gone after two years
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
