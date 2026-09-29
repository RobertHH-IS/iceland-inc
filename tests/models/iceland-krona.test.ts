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

  test('known gap: after three years the króna keeps strengthening and prices keep drifting down, as the lever definition says (20-year values per point)', () => {
    // decision 0002 §6: no steady state with a lasting surplus of foreign income, so non-residents'
    // krónur keep draining (merge note 5 of review E3: a design decision owns the fix). Per point held,
    // after 10 and 20 years: Automatic about 2–2.5% and 5–6% stronger, the price level about 3% lower
    // after 20; Manual about 3–3.5% and 9–11.5% stronger, the price level about 6–6.5% lower.
    const bands = { true: { k10: [1.8, 2.8], k20: [4.5, 6.5], p20: [-3.6, -2.5] }, false: { k10: [2.8, 4], k20: [8, 12.5], p20: [-7.2, -5.3] } };
    for (const automatic of [true, false])
      for (const size of [1, 5]) {
        const e = run('foreignRate', size, automatic, 240);
        const [k, p, pi] = [series(e, 'krona'), series(e, 'priceLevel'), series(e, 'inflation')];
        const b = bands[`${automatic}`];
        expect(k[120] / size).toBeGreaterThan(b.k10[0]);
        expect(k[120] / size).toBeLessThan(b.k10[1]);
        expect(k[240] / size).toBeGreaterThan(b.k20[0]);
        expect(k[240] / size).toBeLessThan(b.k20[1]);
        expect(p[240] / size).toBeGreaterThan(b.p20[0]);
        expect(p[240] / size).toBeLessThan(b.p20[1]);
        expect(pi[240]).toBeLessThan(0); // still drifting down: it does not level off
        expect(k[240]).toBeGreaterThan(k[180]);
      }
    expect(model.levers.find((l) => l.id === 'foreignRate')!.definition).toMatch(/does not level off/);
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

describe('Iceland model: a high key rate held for years (review E7)', () => {
  test('on Automatic, with the debt rule acting, a +5-point offset keeps output below baseline for 20 years', () => {
    const output = series(run('keyRateAddon', 5, true, 240), 'output');
    expect(Math.max(...output.slice(1))).toBeLessThan(0);
  });

  test('on Manual, 15% held: output below baseline for seven years, then the interest-income channel lifts it', () => {
    // Taxes and spending are held too, so the government's interest bill feeds households' and
    // pension funds' income (decision 0002 §6, Godley and Lavoie's model PC).
    const e = run('keyRateFixed', 15, false, 120);
    const output = series(e, 'output');
    expect(Math.max(...output.slice(1, 85))).toBeLessThan(0);
    expect(output[120]).toBeGreaterThan(0);
    const income = (m: number) => ['Y', 'W', 'O'].reduce((s, g) => s + e.valueAt(`propertyIncome${g}`, m), 0);
    expect(income(120) / income(0)).toBeGreaterThan(1.5);
  });
});
