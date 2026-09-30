/**
 * The Iceland model's prices, the króna, labour and neutral rates: the fixes from the
 * 29 September 2026 audit (docs/audit/2026-09-29-audit.md) and stage 0 of the start from today
 * (docs/design/start-from-today.md §4.6 and appendix A1).
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { lockAll } from '../../src/core/scenario.ts';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { runScenario } from '../../src/core/scenario.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { calibration } from '../../src/models/iceland/calibration.ts';
import { flooredUnemployed } from '../../src/models/iceland/modules/labour-and-wages.ts';
import { withConcepts } from '../../src/models/index.ts';
import { stepByStep } from '../../src/models/iceland/testing.ts';

const model = compile(withConcepts(icelandModel));
const term = (e: KernelEngine, id: string, t: string) => e.influences(id).terms.find((x) => x.id === t)!.value;

describe('Stage 0: i0 is the real neutral rate; nominal comparisons use i0 + piT', () => {
  test('with a 2.5% target and the key rate at 5.5%, every nominal rate gap is zero and the rule’s neutral term is 5.5%', () => {
    const e = createEngine(model).fork({ params: { piT: 0.025 } });
    lockAll(e); // both policy levers locked
    e.setLever('keyRate', 5.5);
    e.step(1);
    expect(term(e, 'ruleTarget', 'neutral')).toBeCloseTo(0.055, 15);
    expect(Math.abs(term(e, 'logExchangeRate', 'carry'))).toBeLessThan(1e-15);
    expect(Math.abs(term(e, 'bondPurchasesW', 'carry'))).toBeLessThan(1e-15);
    expect(Math.abs(term(e, 'mortgageRateI', 'keyRate'))).toBeLessThan(1e-15);
    // Consumption compares the real key rate with the real neutral rate, so it still sees the 2.5 points
    const realGap = e.value('keyRate') - e.baseline('expectedInflation') - 0.03;
    expect(realGap).toBeCloseTo(0.025, 12);
  });

  test('today’s world prices and foreign rate are parameters that are exactly the old constants on the steady start', () => {
    const e = createEngine(model);
    lockAll(e); // both policy levers locked
    const p = (id: string) => e.influences(id === 'iFnow' ? 'foreignRate' : 'worldPrice').params.find((x) => x.id === id)!;
    expect(p('worldPrice0').value).toBe(1);
    expect(p('iFnow').value).toBe(e.influences('logExchangeRate').params.find((x) => x.id === 'iF0')!.value);
    for (const id of ['worldPrice0', 'iFnow']) expect(p(id).provenance.basis).toBe('derived');
    const f = e.fork({ params: { worldPrice0: 1.1, fishPrice0: 1.3, aluminiumPrice0: 0.9, iFnow: 0.04 } });
    f.step(1);
    expect(f.value('worldPrice')).toBeCloseTo(1.1, 15);
    expect(f.value('fishPrice')).toBeCloseTo(1.3, 15);
    expect(f.value('aluminiumPrice')).toBeCloseTo(0.9, 15);
    expect(f.value('foreignRate')).toBeCloseTo(0.04, 15);
    // the levers stay shifts in percent of the level at the start
    f.setLever('importPrices', 10);
    f.setLever('fishPrices', 10);
    f.step(1);
    expect(f.value('worldPrice')).toBeCloseTo(1.21, 14);
    expect(f.value('fishPrice')).toBeCloseTo(1.3 * 1.1 * 1.1, 14);
  });
});

describe('L13: the central bank’s reserves earn the foreign rate', () => {
  test('a foreign rate 1 pp higher raises reserve income by 1% of the reserves at once, as it does pension funds’ foreign yield', () => {
    // every kernel step's income and the reserves after it (decision 0011: two steps a month)
    const { engine: e, steps } = stepByStep(createEngine(model), (x) => ({ income: x.value('fxReserveIncome'), reserves: x.stock('fxReserves', 'CB') }));
    lockAll(e); // both policy levers locked
    const reserves = e.stock('fxReserves', 'CB');
    const inc0 = e.baseline('fxReserveIncome');
    e.setLever('foreignRate', 1);
    e.step(1);
    // income accrues on the reserves held at the start of each step, from the first step on
    const normal = e.influences('fxReserveIncome').params.find((p) => p.id === 'iFXR')!.value;
    expect(steps.length).toBe(model.def.substeps ?? 1);
    let start = reserves;
    for (const x of steps) {
      expect(x.income).toBeCloseTo((normal + 0.01) * start, 12);
      start = x.reserves;
    }
    expect(e.value('fxReserveIncome')).toBe(steps[steps.length - 1].income);
    expect(inc0).toBeCloseTo(normal * reserves, 12);
    expect(e.value('cbProfit') - e.baseline('cbProfit')).toBeGreaterThan(0.009 * reserves);
  });
});

describe('L12: fish and aluminium are price takers', () => {
  test('their volume rules explain a supply response, not goods becoming cheaper abroad; tourism and other exports keep the demand reading', () => {
    const rule = (id: string) => model.rules.find((r) => r.id === id)!;
    for (const k of ['Fish', 'Aluminium']) {
      expect(rule(`exportVolume${k}`).explain!.rule).toContain('does not make');
      expect(rule(`exportVolume${k}`).explain!.rule).toContain('earn in krónur');
      expect(rule(`exportVolume${k}`).terms!.find((t) => t.id === 'competitiveness')!.label).toStartWith('Profitability');
    }
    for (const k of ['Tourism', 'Other']) expect(rule(`exportVolume${k}`).explain!.rule).toContain('cheaper abroad');
  });
});

describe('H5: purchasing-power parity is a slow anchor for world prices', () => {
  const check = calibration.find((c) => c.id === 'world-prices-krona-year1')!;
  const pct = (e: KernelEngine, id: string) => 100 * (e.value(id) / e.baseline(id) - 1);

  test('world prices +10% held: the króna barely moves in a quarter, so fish revenue and import prices in krónur rise', () => {
    const e = createEngine(model);
    e.setLever('importPrices', 10);
    e.step(3);
    expect(Math.abs(pct(e, 'exchangeRate'))).toBeLessThan(2);
    e.step(3);
    expect(pct(e, 'exportsFish')).toBeGreaterThan(8);
    e.step(6);
    expect(pct(e, 'importPrice')).toBeGreaterThan(5);
    // the anchor has absorbed a fifth or less of the shock after a year
    expect(e.value('worldPriceAnchor') / Math.log(1.1)).toBeLessThan(0.2);
  });

  test('the calibration check fails the old behaviour, where parity read world prices in the fast target', () => {
    const inRange = (x: number) => x >= check.range[0] && x <= check.range[1];
    expect(inRange(check.measure(runScenario(createEngine(model), check.scenario, check.months)))).toBe(true);
    const fast = createEngine(model).fork({ params: { lamPPP: 1e4 } });
    lockAll(fast); // both policy levers locked
    expect(inRange(check.measure(runScenario(fast, check.scenario, check.months)))).toBe(false);
  });

  test('while world prices are unchanged the anchor is exactly zero, so the króna follows domestic prices as before', () => {
    const e = createEngine(model);
    lockAll(e); // both policy levers locked
    e.fire('kronaShock', -10);
    e.fire('wageSettlement', 10);
    for (let m = 0; m < 36; m++) {
      e.step(1);
      expect(e.value('worldPriceAnchor')).toBe(0);
    }
  });
});

describe('H4: consumption is deflated by prices households pay for, not by house prices', () => {
  const pct = (e: KernelEngine, id: string) => 100 * (e.value(id) / e.baseline(id) - 1);
  // rents that follow house prices one for one and fast, against rents that never move
  const lending = (lamRent: number) => {
    const e = createEngine(model).fork({ params: { lamRent, betaRentH: 1 } });
    lockAll(e); // both policy levers locked
    e.setLever('lendingAppetite', 2); // the loan-to-value cap trims part of the push
    e.step(9); // long enough for house prices to reach the CPI clearly (0.1 point after 9 months)
    return e;
  };

  test('the deflator is the CPI without its housing part, and real consumption is spending ÷ it', () => {
    const e = lending(1);
    const w = (id: string) => e.influences('cpi').params.find((p) => p.id === id)!.value;
    const exHousing = (e.value('cpi') - w('omH') * e.value('housingCost')) / (w('omD') + w('omM'));
    expect(e.value('housingCost')).not.toBeCloseTo(e.value('consumptionDeflator'), 4);
    expect(e.value('consumptionDeflator')).toBeCloseTo(exHousing, 12);
    expect(e.value('realConsumption')).toBeCloseTo(e.value('consumption') / e.value('consumptionDeflator'), 12);
  });

  test('house prices reaching the CPI do not by themselves change real consumption (they did by about as much as the CPI moved)', () => {
    // the same credit boom with and without the housing part of the CPI following house prices
    const [a, b] = [lending(1), lending(0)];
    const cpiGap = pct(a, 'cpi') - pct(b, 'cpi');
    const realGap = pct(a, 'realConsumption') - pct(b, 'realConsumption');
    expect(cpiGap).toBeGreaterThan(0.04);
    expect(Math.abs(realGap)).toBeLessThan(0.2 * cpiGap);
  });

  test('a general rise in prices moves the deflator one for one, like the CPI', () => {
    const e = createEngine(model);
    lockAll(e); // both policy levers locked
    e.fire('wageSettlement', 10);
    e.step(240);
    // prices have settled higher; the deflator and the CPI have risen by about the same
    expect(Math.abs(pct(e, 'consumptionDeflator') / pct(e, 'cpi') - 1)).toBeLessThan(0.05);
  });
});

describe('MON-4: the housing part of the CPI is a market-rent index (L10)', () => {
  const pct = (e: KernelEngine, id: string) => 100 * (e.value(id) / e.baseline(id) - 1);

  test('the rule, the speeds and the weight name rental equivalence and the rent index', () => {
    const e = createEngine(model);
    lockAll(e); // both policy levers locked
    const inf = e.influences('housingCost');
    expect(inf.rule!.what).toContain('rental equivalence');
    expect(inf.terms.map((t) => t.id)).toEqual(['prices', 'housePrice', 'income']);
    for (const id of ['lamRent', 'betaRentH', 'betaRentY']) {
      const note = inf.params.find((p) => p.id === id)?.provenance.note ?? '';
      expect(note).toContain('June 2024');
      expect(note).toContain('leiguvísitala');
    }
    expect(e.influences('cpi').params.find((p) => p.id === 'omH')!.provenance.note).toContain('rental equivalence');
  });

  test('rents keep up with a general rise in prices: with the real terms off, they end where other consumer prices do', () => {
    const e = createEngine(model).fork({ params: { betaRentH: 0, betaRentY: 0 } });
    lockAll(e, false); // prices settle with the policy rules acting
    e.fire('wageSettlement', 10);
    e.step(240);
    expect(pct(e, 'consumptionDeflator')).toBeGreaterThan(2);
    expect(Math.abs(e.value('housingCost') / e.value('consumptionDeflator') - 1)).toBeLessThan(1e-3);
  });

  test('rents follow real house prices less than one for one: a credit boom raises house prices more than rents', () => {
    const e = createEngine(model);
    lockAll(e); // both policy levers locked
    e.setLever('lendingAppetite', 1);
    e.step(60);
    const rentsReal = 100 * (e.value('housingCost') / e.value('consumptionDeflator') - 1);
    const housesReal = pct(e, 'realHousePrice');
    expect(housesReal).toBeGreaterThan(1);
    expect(rentsReal).toBeGreaterThan(0);
    expect(rentsReal).toBeLessThan(0.75 * housesReal);
  });

  test('a key rate held 1 pp higher with both policy levers locked lowers inflation mostly outside housing: housing gives under a third of the fall at month 12 and about half at month 24 (it gave 58% at month 24 when the housing part followed house prices)', () => {
    const run = (key: number) => {
      const e = createEngine(model);
      lockAll(e); // both policy levers locked
      e.setLever('keyRate', key);
      const path: { cpi: number; rent: number }[] = [];
      for (let m = 0; m <= 24; m++) {
        path.push({ cpi: e.value('cpi'), rent: e.value('housingCost') });
        e.step(1);
      }
      return path;
    };
    const [hi, lo] = [run(4), run(3)];
    const omH = createEngine(model).influences('cpi').params.find((p) => p.id === 'omH')!.value;
    for (const [m, most] of [[12, 1 / 3], [24, 0.55]] as const) {
      const infl = (x: typeof hi, k: 'cpi' | 'rent') => x[m][k] / x[m - 12][k] - 1;
      const cpi = infl(hi, 'cpi') - infl(lo, 'cpi');
      const housing = omH * (infl(hi, 'rent') - infl(lo, 'rent'));
      expect(cpi).toBeLessThan(-0.0015);
      expect(housing).toBeLessThan(0);
      expect(housing / cpi).toBeLessThan(most);
    }
  });
});

describe('M5: unemployment has a smooth frictional floor', () => {
  test('the floor is the identity above its start, smooth at the join, and never below floor × normal', () => {
    const [u0, floor, start] = [5, 0.3, 0.6];
    for (const x of [u0, 4, 3]) expect(flooredUnemployed(x, u0, floor, start)).toBe(x);
    const h = 1e-7,
      j = start * u0;
    const slope = (flooredUnemployed(j, u0, floor, start) - flooredUnemployed(j - h, u0, floor, start)) / h;
    expect(slope).toBeCloseTo(1, 5);
    for (const x of [2.9, 1, 0, -5, -1e3]) {
      const y = flooredUnemployed(x, u0, floor, start);
      expect(y).toBeGreaterThanOrEqual(floor * u0);
      expect(y).toBeLessThanOrEqual(Math.max(x, j));
    }
  });

  test('the baseline is untouched, and a large public-spending boom no longer drives unemployment or benefits negative', () => {
    const e = createEngine(model);
    lockAll(e); // both policy levers locked
    for (const g of ['Y', 'W', 'O']) expect(e.influences(`unemployed${g}`).regime ?? null).toBeNull();
    e.setLever('education', 3);
    e.setLever('health', 3);
    let lowest = Infinity;
    for (let m = 0; m < 60; m++) {
      e.step(1);
      for (const g of ['Y', 'W', 'O']) {
        lowest = Math.min(lowest, e.value(`unemployed${g}`) / e.baseline(`unemployed${g}`));
        expect(e.value(`unemploymentBenefits${g}`)).toBeGreaterThan(0);
      }
    }
    expect(lowest).toBeGreaterThan(0.3);
    expect(lowest).toBeLessThan(0.6); // the floor is doing the work: the old rule went below zero here
    expect(e.influences('unemployedO').regime).toContain('arriving from abroad');
  });
});

describe('M7: builders’ imports come out of builders’ value added', () => {
  test('value added = sales − imports − domestic inputs, and a stronger króna lowers it per unit of sales', () => {
    const e = createEngine(model);
    lockAll(e); // both policy levers locked
    const share0 = e.baseline('valueAddedFC') / e.baseline('salesFC');
    e.fire('kronaShock', 10); // a stronger króna: imports get cheaper, builders use more of them
    e.step(18);
    const v = (id: string) => e.value(id);
    const identity = v('salesFC') - (v('importsEquipment') + v('importsInputsFC')) / v('borderImportPrice') - v('constructionInputs') / v('domesticPrice');
    expect(v('valueAddedFC')).toBeCloseTo(identity, 12);
    expect(v('realExchangeRate')).toBeLessThan(1);
    expect(v('valueAddedFC') / v('salesFC')).toBeLessThan(share0);
  });
});

describe('L11: public and private gross wages are on the same basis', () => {
  test('public compensation = (1 + employer contribution + payroll tax) × gross public wages, as for firms; the public payroll tax is a wash', () => {
    const e = createEngine(model);
    lockAll(e); // both policy levers locked
    const p = (id: string) => e.influences('publicEmployment').params.find((x) => x.id === id)!.value;
    const lcr = 1 + p('cEr') + p('css');
    expect(lcr * e.baseline('publicEmployment')).toBeCloseTo(e.baseline('publicValueAdded'), 12);
    // cash spending on a channel leaves the payroll tax out, and GDP still counts the full compensation
    const cash = ['health_HY', 'health_HW', 'health_HO', 'health_PF'].reduce((s, id) => s + e.baseline(id), 0);
    const staffHealth = e.influences('publicEmployment').terms.find((t) => t.id === 'health')!.baseline;
    expect(cash).toBeCloseTo((1 + p('cEr')) * staffHealth, 12);
    expect(e.baseline('nominalGDP')).toBeCloseTo(100, 9);
    expect(Math.abs(e.baseline('deficit'))).toBeLessThan(1e-9);
  });
});

describe('Iceland model: VAT reaches prices over a few months (review E4)', () => {
  test('a 10-point VAT cut raises output gradually: under 1.5% in month 1, less than half the peak of the first two years', () => {
    // Before, shops passed the whole cut into prices in the month it took effect while nominal
    // spending followed only slowly, so real spending jumped 8.2% and output 3.05% in month 1.
    const e = createEngine(model);
    e.setLever('vat', -10);
    e.step(24);
    const output = e.series('output').map((p) => p.v);
    const peak = Math.max(...output.slice(1, 25));
    expect(output[1]).toBeGreaterThan(0);
    expect(output[1]).toBeLessThan(1.5);
    expect(output[1]).toBeLessThan(peak / 2);
    // nearly all of the cut is in prices within six months
    const passed = (e.valueAt('vatInPrices', 6) - e.valueAt('vatInPrices', 0)) / (e.value('vatRate') - e.valueAt('vatRate', 0));
    expect(passed).toBeGreaterThan(0.9);
  });
});

describe('the central bank’s response to a wage settlement: its timing (lever-vetting open item 14, phase 5)', () => {
  // A 10% one-off settlement with the policy rules acting. The CBI's evidence puts the key rate's
  // peak, +1 to +1.5 points, in quarters 2–4 (calibration wage-key-rate-peak's source). The size is
  // gated there; the timing is not, because the rule reads slack from unemployment (decision 0012)
  // and jobs fall before output after a settlement, so it peaks late. Phase 5's joint refit (item
  // 14) is to fix the timing as well as the size (review ECON-6).
  const keyRatePath = () => {
    const e = createEngine(model).fork();
    e.fire('wageSettlement', 10);
    e.step(72);
    return e.series('keyRate').map((p) => p.v); // the chart: points against baseline
  };

  test.failing('PHASE 5 CRITERION, not met: the key rate peaks within five quarters (month 15 at the latest)', () => {
    // Expected to fail until item 14 lands; bun reports it as soon as it passes, and then
    // `.failing` comes off. Now month 21 (+1.48 points); main, before decision 0012, month 17.
    const path = keyRatePath();
    const peak = path.indexOf(Math.max(...path.slice(1)));
    expect(peak).toBeLessThanOrEqual(15);
  });

  test('tripwire: the peak comes in months 18–24 and a year on the rule is still leaning against the settlement', () => {
    // Month 21 now (+1.48); +0.68 points at month 12 (+0.94 on main) and +0.03 at month 6 (+0.28).
    const path = keyRatePath();
    const peak = path.indexOf(Math.max(...path.slice(1)));
    expect(peak).toBeGreaterThanOrEqual(18);
    expect(peak).toBeLessThanOrEqual(24);
    expect(path[12]).toBeGreaterThan(0.5);
  });
});
