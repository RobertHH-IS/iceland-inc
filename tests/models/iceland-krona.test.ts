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

  test('the central bank keeps its extra reserve income abroad: the long drift is a third of what it was (lever review FX-1)', () => {
    // Reserve income is paid in foreign currency into the reserves, and the bank sells only the
    // normal yield for krónur, so a higher foreign rate no longer drains non-residents' krónur
    // through the reserves. Before, per point held for 20 years: Automatic 5–6% stronger, prices
    // about 3% lower and inflation still falling; Manual 9–11.5% stronger, prices 6–6.5% lower.
    for (const automatic of [true, false]) {
      const e = run('foreignRate', 1, automatic, 240);
      const [k, p, pi] = [series(e, 'krona'), series(e, 'priceLevel'), series(e, 'inflation')];
      if (automatic) {
        expect(Math.abs(k[240])).toBeLessThan(1.5);
        expect(Math.abs(p[240])).toBeLessThan(1);
        expect(Math.abs(pi[240])).toBeLessThan(0.1);
      } else {
        expect(k[240]).toBeLessThan(5);
        expect(p[240]).toBeGreaterThan(-3);
      }
    }
    // the reserves take the extra income: after a year of +1 pp they have grown by about a point of it
    const e = run('foreignRate', 1, false, 12);
    expect(e.value('reserveIncomeKept')).toBeGreaterThan(0.15);
    expect(e.baseline('reserveIncomeKept')).toBe(0);
  });

  test('known gap: the funds’ extra foreign income is still paid home in krónur, and no foreign-currency debt pays the foreign rate', () => {
    // decision 0002 §6: what remains of the drift. Iceland's income from abroad rises by about 0.3%
    // of GDP a year per point, where its roughly matched foreign-currency position would give far
    // less; on Manual the króna still ends a few percent stronger after 20 years.
    const e = run('foreignRate', 1, false, 240);
    const ca = (m: number) => e.valueAt('currentAccount', m) - e.baselineData.vars[model.varIndex.get('currentAccount')!];
    expect(ca(12)).toBeGreaterThan(0.25);
    expect(series(e, 'krona')[240]).toBeGreaterThan(series(e, 'krona')[180]);
    expect(model.levers.find((l) => l.id === 'foreignRate')!.definition).toMatch(/known gap/);
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

describe('Iceland model: the króna-shock lever does what its definition says (review M21, lever review FX-2 and FX-5)', () => {
  test('−10: about 9% weaker by month 3, about a fifth of that gone after a year, half after two to three years', () => {
    for (const automatic of [false, true]) {
      const krona = series(run('kronaShock', -10, automatic, 36), 'krona');
      expect(krona[3]).toBeGreaterThan(-10);
      expect(krona[3]).toBeLessThan(-8.5);
      expect(krona[12] / krona[3]).toBeGreaterThan(0.7);
      expect(krona[12] / krona[3]).toBeLessThan(0.95);
      expect(krona[automatic ? 24 : 36] / krona[3]).toBeLessThan(0.55); // about half gone
    }
  });

  test('a J-curve: imports are invoiced in foreign currency, so the current account worsens at once and turns within a year', () => {
    for (const automatic of [false, true]) {
      const e = run('kronaShock', -10, automatic, 24);
      const ca = (m: number) => e.valueAt('currentAccount', m);
      for (const m of [1, 2, 3]) expect(ca(m)).toBeLessThan(-1);
      expect(ca(12)).toBeGreaterThan(0.5);
      expect(ca(24)).toBeGreaterThan(0.5);
      // what Iceland pays abroad moves with the króna at once; what importers charge at home follows
      expect(e.valueAt('borderImportPrice', 1)).toBeCloseTo(e.valueAt('exchangeRate', 1), 12);
      expect(e.valueAt('importPrice', 1) - 1).toBeLessThan(0.3 * (e.valueAt('borderImportPrice', 1) - 1));
    }
    // a world-price rise is a terms-of-trade loss at first: the import bill is about three times fish and aluminium
    expect(run('importPrices', 10, true, 1).value('currentAccount')).toBeLessThan(-1);
  });

  test('the recovery is portfolio balance: pension funds sell foreign assets now worth more in krónur, and the key rate does not move on Manual', () => {
    const e = run('kronaShock', -10, false, 12);
    for (const m of [1, 3, 6]) expect(e.valueAt('foreignAssetPurchases', m)).toBeLessThan(-1);
    expect(Math.abs(e.influences('logExchangeRate').terms.find((t) => t.id === 'carry')!.change)).toBeLessThan(1e-12);
    const def = model.levers.find((l) => l.id === 'kronaShock')!.definition;
    expect(def).toMatch(/portfolio balance/);
    expect(def).not.toMatch(/the rate gap and non-residents’ holdings pull it back/);
    expect(def).toMatch(/foreign-currency/);
  });
});

describe('Iceland model: portfolio balance is bounded and nets out the carry trade (lever review TAX-1 and FX-4)', () => {
  test('pension funds moving 20 points of assets home or abroad move the króna by tens of percent, not twice its value, and about symmetrically', () => {
    for (const automatic of [false, true]) {
      const home = series(run('pfForeign', -20, automatic, 15), 'krona')[15];
      const abroad = series(run('pfForeign', 20, automatic, 15), 'krona')[15];
      expect(home).toBeGreaterThan(0);
      expect(home).toBeLessThan(30); // v1: +107%
      expect(abroad).toBeLessThan(0);
      expect(abroad).toBeGreaterThan(-30);
      const logs = [Math.log(1 + home / 100), -Math.log(1 + abroad / 100)];
      expect(Math.max(...logs) / Math.min(...logs)).toBeLessThan(1.5);
    }
  });

  test('income tax +10 held on Manual: the króna stays within about a third of purchasing-power parity for 20 years', () => {
    // v1: non-residents' krónur ran out and the unbounded premium made the króna 1462% stronger
    // while prices fell 86%, 2.3 times beyond parity. The deflation itself (the key rate held) remains.
    const e = run('incomeTax', 10, false, 240);
    const k = series(e, 'krona');
    const p = series(e, 'priceLevel');
    for (const m of [60, 120, 180]) expect(Math.abs(Math.log((1 + k[m] / 100) * (1 + p[m] / 100)))).toBeLessThan(Math.log(1.2));
    expect(Math.abs(Math.log((1 + k[240] / 100) * (1 + p[240] / 100)))).toBeLessThan(Math.log(1.35));
    // the premium never passes its bound, however few krónur non-residents hold
    const ps = e.influences('logExchangeRate').params;
    const q = (id: string) => ps.find((x) => x.id === id)!.value;
    const bound = q('betaH') * Math.log(q('fxDepth') / 2 / (q('krona0') + q('fxDepth')));
    for (let m = 0; m <= 240; m += 12) expect(e.valueAt('logExchangeRate', m)).toBeGreaterThan(-Infinity);
    expect(e.influences('logExchangeRate').terms.find((t) => t.id === 'portfolio')!.value).toBeGreaterThanOrEqual(bound - 1e-12);
    expect(bound).toBeGreaterThan(-0.36);
  });

  test('krónur bought for the rate gap do not weaken the króna: a credit or tax-cut boom with higher rates leaves the real króna stronger for two years (Automatic)', () => {
    const rer = (lever: string, value: number, months: number) => {
      const b = run('foreignDemand', 0, true, months);
      const e = run(lever, value, true, months);
      return Array.from({ length: months }, (_, m) => [e.valueAt('realExchangeRate', m + 1) / b.valueAt('realExchangeRate', m + 1) - 1, e.valueAt('exportVolume', m + 1) / b.valueAt('exportVolume', m + 1) - 1]);
    };
    for (const [lever, value, months] of [
      ['lendingAppetite', 3, 24],
      ['incomeTaxOffset', -2.5, 18],
    ] as const)
      for (const [r, x] of rer(lever, value, months)) {
        expect(r).toBeLessThanOrEqual(1e-6);
        expect(x).toBeLessThanOrEqual(1e-6);
      }
    // a higher key rate alone: the real króna stronger for five years
    for (const [r] of rer('keyRateAddon', 1, 60)) expect(r).toBeLessThan(0);
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
