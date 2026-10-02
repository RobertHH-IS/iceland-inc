import { describe, expect, test } from 'bun:test';
import { createEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { createGrowingIcelandEngine, createGrowingIcelandModel, initialBaselineForGrowingModel, GROWTH_DEFAULTS } from '../../src/models/iceland/growth.ts';
import { FIRMS } from '../../src/models/iceland/util.ts';

const zero = { realGrowth: 0, populationGrowth: 0, worldGrowth: 0, inflation: 0 };
const snapshot = (e: ReturnType<typeof createEngine>) => ({
  vars: e.model.vars.map((v) => e.value(v.id)),
  stocks: e.model.instruments.flatMap((i) => e.model.players.map((p) => e.stock(i.id, p.id))),
});

describe('Iceland growing teaching reference', () => {
  test('opening preserves the solved stationary portfolio and explicitly seeds physical quantities', () => {
    const old = createEngine(icelandModel);
    const e = createGrowingIcelandEngine();
    expect(e.model.def.id).toBe('iceland-growth-reference');
    expect(createGrowingIcelandModel({ id: 'custom-growth-reference' }).id).toBe('custom-growth-reference');
    for (const v of old.model.vars) expect(e.value(v.id)).toBe(old.value(v.id));
    for (const i of old.model.instruments) for (const p of old.model.players) expect(e.stock(i.id, p.id)).toBe(old.stock(i.id, p.id));
    for (const j of FIRMS) expect(e.value(`productiveCapitalReal${j}`)).toBe(old.stock('capital', j));
    expect(e.value('productiveCapitalReal')).toBe(FIRMS.reduce((sum, j) => sum + old.stock('capital', j), 0));
    expect(e.value('productiveCapacity')).toBe(old.value('output'));
    expect(e.value('growthRealIndex')).toBe(1);
    expect(e.value('keyRate')).toBe(0.03);
    expect(e.model.params.find((p) => p.id === 'i0')!.value).toBe(0.03);
    expect(e.model.params.find((p) => p.id === 'piT')!.value).toBe(0.025);
    expect(e.baselineData.targets).toEqual([]); // no claim that a growing path is a fixed point
    expect(e.model.def.calibration).toEqual([]);
    expect(e.warnings.some((w) => w.includes('transition'))).toBe(true);
  });

  test('zero trends retain the original equations, histories and scenario values', () => {
    for (const shocked of [false, true]) {
      const old = createEngine(icelandModel), e = createGrowingIcelandEngine(zero);
      if (shocked) for (const run of [old, e]) {
        run.fire('wageSettlement', 4);
        run.setLever('foreignDemand', -5);
        run.setLever('health', 0.5);
      }
      for (let month = 0; month <= 240; month++) {
        for (const v of old.model.vars) expect(Math.abs(e.value(v.id) - old.value(v.id))).toBeLessThan(1e-10);
        for (const i of old.model.instruments) for (const p of old.model.players) expect(Math.abs(e.stock(i.id, p.id) - old.stock(i.id, p.id))).toBeLessThan(1e-10);
        if (month < 240) { old.step(1); e.step(1); }
      }
      expect(e.checks().failures).toEqual([]);
      expect(e.checks().signViolations).toEqual([]);
    }
  }, 20_000);

  test('default reference changes actual flows, quantities and posted stocks, with 1200-month domain and accounting checks', () => {
    const e = createGrowingIcelandEngine({}, { onCheckFailure: 'throw' });
    const initialInvestment = e.value('investmentReal'), initialCapital = e.stock('capital', 'FC');
    for (let month = 1; month <= 1200; month++) {
      e.step(1);
      for (const v of e.model.vars) expect(Number.isFinite(e.value(v.id))).toBe(true);
      for (const i of e.model.instruments) for (const p of e.model.players) expect(Number.isFinite(e.stock(i.id, p.id))).toBe(true);
      for (const price of ['cpi', 'domesticPrice', 'wage', 'exchangeRate', 'worldPrice', 'housePrice']) expect(e.value(price)).toBeGreaterThan(0);
      for (const g of ['Y', 'W', 'O']) {
        expect(e.value(`unemployed${g}`)).toBeGreaterThanOrEqual(0);
        expect(e.value(`unemployment${g}`)).toBeGreaterThanOrEqual(0);
        expect(e.value(`unemployment${g}`)).toBeLessThan(0.5);
      }
      expect(e.value('keyRate')).toBeGreaterThanOrEqual(0);
      expect(e.value('keyRate')).toBeLessThan(0.25);
      expect(Math.abs(e.value('inflation12'))).toBeLessThan(0.2);
      expect(e.value('debtRatio')).toBeLessThan(3);
      expect(e.value('productiveCapitalReal')).toBeGreaterThan(0);
      expect(e.checks().maxResidual).toBeLessThan(1e-9);
    }
    expect(e.checks().failures).toEqual([]);
    expect(e.checks().signViolations).toEqual([]);
    expect(e.value('output')).toBeGreaterThan(300);
    expect(e.value('investmentReal')).toBeGreaterThan(initialInvestment);
    expect(e.stock('capital', 'FC')).toBeGreaterThan(initialCapital);
    expect(e.value('productiveCapacity')).toBeGreaterThan(300);
    expect(e.value('growthRealIndex')).toBeCloseTo((1 + GROWTH_DEFAULTS.realGrowth) ** 100, 11);
    expect(e.value('growthPopulationIndex')).toBeCloseTo((1 + GROWTH_DEFAULTS.populationGrowth) ** 100, 11);
    expect(e.value('growthWorldDemandIndex')).toBeCloseTo((1 + GROWTH_DEFAULTS.worldGrowth) ** 100, 11);
    expect(e.value('growthPriceIndex')).toBeCloseTo((1 + GROWTH_DEFAULTS.inflation) ** 100, 11);
    expect(e.value('growthProductivityIndex')).toBeCloseTo(e.value('growthRealIndex') / e.value('growthPopulationIndex'), 12);
  }, 30_000);

  test('physical capital follows actual real investment; ledger capital follows nominal purchase and writeoff postings', () => {
    let previous: Record<string, { physical: number; nominal: number; investment: number }> = {};
    let e: ReturnType<typeof createEngine>;
    let delta = 0;
    const dt = 1 / 24;
    e = createGrowingIcelandEngine({}, { testHooks: { afterSubstep: (_month, _substep, read) => {
      for (const j of FIRMS) {
        const old = previous[j];
        expect(read.value(`productiveCapitalReal${j}`)).toBeCloseTo(old.physical + dt * (old.investment - delta * old.physical), 10);
        expect(read.stock('capital', j)).toBeCloseTo(old.nominal + dt * (read.value(`investmentPurchase${j}`) - delta * old.nominal), 10);
        previous[j] = { physical: read.value(`productiveCapitalReal${j}`), nominal: read.stock('capital', j), investment: read.value(`investment${j}`) };
      }
    } } });
    delta = e.model.params.find((p) => p.id === 'depreciationRate')!.value;
    previous = Object.fromEntries(FIRMS.map((j) => [j, { physical: e.value(`productiveCapitalReal${j}`), nominal: e.stock('capital', j), investment: e.value(`investment${j}`) }]));
    e.step(120);
    expect(Math.abs(e.value('productiveCapitalRealFC') - e.stock('capital', 'FC') / e.value('domesticPrice'))).toBeGreaterThan(0.1);
    expect(e.checks().failures).toEqual([]);
  });

  test('less investment for expansion reduces actual physical capital and productive capacity', () => {
    const normal = createGrowingIcelandEngine(), reduced = createGrowingIcelandEngine({}, { params: { growthCapitalExpansion: 0 } });
    normal.step(120); reduced.step(120);
    expect(reduced.value('productiveCapitalReal')).toBeLessThan(normal.value('productiveCapitalReal'));
    expect(reduced.value('productiveCapacity')).toBeLessThan(normal.value('productiveCapacity'));
    expect(reduced.checks().failures).toEqual([]);
    expect(reduced.checks().signViolations).toEqual([]);
  });

  test('growth charts report actual or reference quantities in the same units across price bases', () => {
    const e = createGrowingIcelandEngine(); e.step(120);
    for (const [id, driver] of [
      ['referenceWorldDemand', 'growthWorldDemandIndex'], ['referencePopulation', 'growthPopulationIndex'],
      ['actualProductiveCapacity', 'productiveCapacity'], ['fundedPhysicalCapital', 'productiveCapitalReal'],
    ]) {
      expect(e.indicatorAt(id, 0)).toBe(100);
      const expected = 100 * e.value(driver) / e.baseline(driver);
      expect(e.indicatorAt(id, 120)).toBeCloseTo(expected, 12);
      expect(e.levelAt(id, 120, 'nominal')).toBeCloseTo(expected, 12);
      expect(e.levelAt(id, 120, 'real')).toBeCloseTo(expected, 12);
    }
  });

  test('same-variant no-change, fork, reset and replay are deterministic', () => {
    const e = createGrowingIcelandEngine(), reference = createGrowingIcelandEngine();
    e.step(120); reference.step(120);
    expect(snapshot(e)).toEqual(snapshot(reference));
    expect(snapshot(e.fork())).toEqual(snapshot(e));
    e.setLever('foreignDemand', -8); e.step(120);
    const end = snapshot(e);
    e.seek(48); e.seek(240);
    expect(snapshot(e)).toEqual(end);
    const model = createGrowingIcelandModel();
    const mapped = createEngine(model, { baseline: initialBaselineForGrowingModel(model) });
    mapped.step(120);
    expect(snapshot(mapped)).toEqual(snapshot(reference));
    mapped.reset();
    expect(mapped.value('growthRealIndex')).toBe(1);
    expect(mapped.value('productiveCapacity')).toBeCloseTo(100, 12);
    mapped.step(120);
    expect(snapshot(mapped)).toEqual(snapshot(reference));
  }, 20_000);

  test('annual trend quantities are independent of the kernel step, and invalid teaching assumptions are rejected', () => {
    for (const substeps of [1, 2, 4]) {
      const e = createGrowingIcelandEngine({ substeps }); e.step(12);
      expect(e.value('growthRealIndex')).toBeCloseTo(1.014, 13);
      expect(e.value('growthPriceIndex')).toBeCloseTo(1.025, 13);
      expect(e.checks().failures).toEqual([]);
    }
    expect(() => createGrowingIcelandModel({ realGrowth: NaN })).toThrow();
    expect(() => createGrowingIcelandModel({ inflation: 2.5 })).toThrow();
    expect(() => createGrowingIcelandModel({ substeps: 0 })).toThrow();
    expect(() => createGrowingIcelandModel({ capitalElasticity: 2 })).toThrow();
  });
});
