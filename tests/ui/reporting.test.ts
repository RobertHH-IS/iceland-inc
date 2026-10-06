import { describe, expect, test } from 'bun:test';
import { compile, CompileError } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import type { ModelDef, ScenarioEvent } from '../../src/core/types.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { GDP_BN, FIRMS, EXPORT_OF, EXPORTERS } from '../../src/models/iceland/util.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { chartTabs, chartWindow, fmtReport, reportDescription, reportLabel, reportMinRange, reportRef, reportUnit, type ReportBasis } from '../../src/ui/model/charts.ts';

const bases: ReportBasis[] = ['nominal', 'real', 'deviation'];
const last = (xs: readonly number[]) => xs[xs.length - 1];
const events: ScenarioEvent[] = [
  { t: 0, lever: 'wageSettlement', value: 10, fire: true },
  { t: 6, lever: 'fishPrices', value: 20 },
  { t: 12, lever: 'keyRate', value: 5 },
  { t: 24, lever: 'keyRateLock', value: 0 },
];

describe('actual chart levels', () => {
  test('GDP, debt, rates and indices have actual start values with explicit units', () => {
    const client = createEngineClient(icelandModel);
    expect(last(client.reportSeries('output'))).toBeCloseTo(GDP_BN, 8);
    expect(last(client.reportSeries('keyRate'))).toBeCloseTo(3, 12);
    expect(last(client.reportSeries('keyRate', 'deviation'))).toBe(0);
    expect(last(client.reportSeries('govDebt'))).toBeCloseTo(56.7, 9);
    expect(last(client.reportSeries('govDebtAmount'))).toBeCloseTo(GDP_BN * 0.567, 8);
    expect(last(client.reportSeries('priceLevel'))).toBe(100);
    expect(last(client.reportSeries('realWage'))).toBe(100);
    const gdp = client.info.indicatorById.get('output')!;
    expect(reportLabel(gdp, 'nominal')).toBe('GDP (nominal)');
    expect(reportLabel(gdp, 'real')).toBe('GDP (real)');
    expect(reportLabel(gdp, 'deviation')).toBe('Output (real GDP)');
    expect(reportUnit(gdp, 'nominal')).toBe('ISK bn a year');
    expect(reportUnit(gdp, 'real')).toContain('baseline prices');
    expect(reportDescription(gdp, 'nominal')).toContain('not a GDP deflator');
    expect(fmtReport(3, client.info.indicatorById.get('keyRate')!, 'nominal')).toBe('3.00%');
    expect(fmtReport(4941.211, gdp, 'nominal')).toBe('ISK 4,941 bn a year');
    expect(fmtReport(4941.211, gdp, 'nominal', 'bare')).toBe('4,941');
    expect(fmtReport(4941.211, gdp, 'nominal', 'card')).toBe('4,941 bn');
    expect(fmtReport(-147.5, gdp, 'nominal')).toBe('−ISK 148 bn a year');
    expect(fmtReport(14.8, gdp, 'nominal')).toBe('ISK 14.8 bn a year');
    // with a money unit, prices and indices are named by its year
    const unit = { label: 'ISK bn', perUnit: 49.41211, basis: 'Hagstofa THJ01102: 2025 GDP at current prices' };
    expect(reportUnit(gdp, 'real', 'opening', unit)).toBe('ISK bn a year at 2025 prices');
    expect(reportUnit(client.info.indicatorById.get('priceLevel')!, 'nominal', 'opening', unit)).toBe('index, 2025 = 100');
    expect(() => structuredClone(client.info)).not.toThrow();
    client.dispose();
  });

  test('nominal GDP and trade use their actual prices, not real values times CPI', () => {
    const e = createEngine(icelandModel);
    e.load({ modelId: 'iceland', version: 2, months: 36, events: [
      { t: 0, lever: 'fishPrices', value: 30 },
      { t: 0, lever: 'aluminiumPrice', value: -20 },
      { t: 0, lever: 'wageSettlement', value: 10, fire: true },
    ] });
    const k = GDP_BN / e.baseline('nominalGDP');
    expect(e.levelAt('output', 36)).toBeCloseTo(e.value('nominalGDP') * k, 9);
    expect(e.levelAt('output', 36, 'real')).toBeCloseTo(e.value('output') * k, 9);
    expect(Math.abs(e.levelAt('output', 36) - e.value('output') * e.value('cpi') * k)).toBeGreaterThan(1);
    expect(e.levelAt('exports', 36)).toBeCloseTo(e.value('exportValue') * k, 9);
    expect(e.levelAt('exports', 36, 'real')).toBeCloseTo(e.value('exportVolume') * k, 9);
    const imports = ['Consumer', 'Inputs', 'Equipment', 'Public', 'Exporters'].reduce((s, part) => s + e.value(`imports${part}`), 0);
    expect(e.levelAt('imports', 36)).toBeCloseTo(imports * k, 9);
    expect(e.levelAt('imports', 36, 'real')).toBeCloseTo(e.value('importVolume') * k, 9);
    expect(Math.abs(e.levelAt('imports', 36) - e.value('importVolume') * e.value('cpi') * k)).toBeGreaterThan(1);
    for (const firm of EXPORTERS) {
      const part = EXPORT_OF[firm];
      expect(e.levelAt(`exports${firm}`, 36)).toBeCloseTo(e.value(`exports${part}`) * k, 9);
      expect(e.levelAt(`exports${firm}`, 36, 'real')).toBeCloseTo(e.value(`exportVolume${part}`) * k, 9);
    }
    expect(e.levelAt('consumption', 36)).toBeCloseTo(e.value('consumption') * k, 9);
    expect(e.levelAt('consumption', 36, 'real')).toBeCloseTo(e.value('realConsumption') * k, 9);
    const investment = FIRMS.reduce((s, j) => s + e.value(`investmentPurchase${j}`), e.value('publicInvestment'));
    expect(e.levelAt('investment', 36)).toBeCloseTo(investment * k, 9);
    expect(e.levelAt('investment', 36, 'real')).toBeCloseTo(e.value('investmentReal') * k, 9);
  });

  test('stock ratios retain trailing-year GDP and flow ratios the current annual rate, in every basis and substep count', () => {
    for (const substeps of [1, 2, 4]) {
      const e = createEngine({ ...icelandModel, substeps });
      e.load({ modelId: 'iceland', version: 2, events, months: 36 });
      const k = GDP_BN / e.baseline('nominalGDP');
      const debt = e.stock('govBonds', 'G') + e.stock('indexedBonds', 'G');
      const mortgage = ['HY', 'HW'].reduce((s, p) => s + e.stock('mortgagesN', p) + e.stock('mortgagesI', p), 0);
      expect(e.levelAt('govDebtAmount', 36)).toBeCloseTo(debt * k, 9);
      expect(e.levelAt('govDebtAmount', 36, 'real')).toBeCloseTo(debt / e.value('cpi') * k, 9);
      expect(e.levelAt('mortgageDebtAmount', 36)).toBeCloseTo(mortgage * k, 9);
      expect(e.levelAt('govDebt', 36)).toBeCloseTo(100 * debt / e.value('gdpTrailing12'), 10);
      expect(e.levelAt('mortgageDebt', 36)).toBeCloseTo(100 * mortgage / e.value('gdpTrailing12'), 10);
      expect(e.levelAt('govBalance', 36)).toBeCloseTo(100 * e.value('govBalance') / e.value('nominalGDP'), 10);
      expect(e.levelAt('currentAccount', 36)).toBeCloseTo(100 * e.value('currentAccount') / e.value('nominalGDP'), 10);
      for (const ind of e.model.indicators.filter((x) => x.level?.kind === 'rate' || x.level?.kind === 'ratio')) {
        expect(e.levels(ind.id, 'real')).toEqual(e.levels(ind.id, 'nominal'));
        const raw = ind.compute({ v: (id) => e.value(id), base: (id) => e.baseline(id), stock: (ins, p) => e.stock(ins, p), baseStock: (ins, p) => e.baseStock(ins, p) });
        expect(e.levelAt(ind.id, 36)).toBeCloseTo(raw * (ind.display === 'deviation-pp' ? 100 : 1), 10);
      }
    }
  });

  test('amount scaling uses the solved variant’s GDP, including Y0 overrides; flows stay annual rates', () => {
    const e = createEngine(icelandModel, { params: { Y0: 110 } });
    e.step(12);
    const k = GDP_BN / e.baseline('nominalGDP');
    // Newton polishes the variant: the solved GDP need not equal the proposed Y0 parameter.
    expect(e.baseline('nominalGDP')).toBeGreaterThan(100);
    expect(e.levelAt('output', 0)).toBeCloseTo(GDP_BN, 8);
    expect(e.levelAt('output', 12)).toBeCloseTo(e.value('nominalGDP') * k, 8);
    expect(e.levelAt('exports', 12)).toBeCloseTo(e.value('exportValue') * k, 8);
    expect(e.levelAt('exports', 12)).not.toBeCloseTo(e.value('exportValue') * GDP_BN / 100, 3);
    expect(e.levelAt('exports', 12)).not.toBeCloseTo(e.value('exportValue') * k / 12, 3);
  }, 30_000);

  test('reporting reads preserve every legacy economic history and old display path', () => {
    const oldIds = new Set(['govDebtAmount', 'mortgageDebtAmount']);
    const legacy: ModelDef = { ...icelandModel, modules: icelandModel.modules.map((module) => ({ ...module,
      ...(module.indicators ? { indicators: module.indicators.filter((ind) => !oldIds.has(ind.id)).map(({ level: _level, ...ind }) => ind) } : {}),
    })) };
    const scenarios: ScenarioEvent[][] = [[], [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }],
      [{ t: 0, lever: 'keyRate', value: 5 }, { t: 0, lever: 'incomeTaxLock', value: 1 }],
      [{ t: 0, lever: 'fishPrices', value: 20 }, { t: 0, lever: 'tourism', value: -30 }]];
    for (const script of scenarios) {
      const current = createEngine(icelandModel), before = createEngine(legacy);
      current.load({ modelId: 'iceland', events: script, months: 0, version: 2 });
      before.load({ modelId: 'iceland', events: script, months: 0, version: 2 });
      for (let month = 0; month <= 72; month++) {
        if (month) { current.step(); before.step(); }
        for (const ind of current.model.indicators) {
          current.levelAt(ind.id, month, 'nominal');
          current.levelAt(ind.id, month, 'real');
        }
        expect(current.model.vars.map((v) => current.value(v.id))).toEqual(before.model.vars.map((v) => before.value(v.id)));
        expect(current.positionsAt(month)).toEqual(before.positionsAt(month));
        expect(current.legs()).toEqual(before.legs());
        expect(current.stabilisers()).toEqual(before.stabilisers());
        expect(current.checks()).toEqual(before.checks());
      }
      for (const ind of before.model.indicators) expect(current.series(ind.id)).toEqual(before.series(ind.id));
    }
  });

  test('all mode histories follow seek, replay, reset and a mid-run client; mode switches add no events', () => {
    const e = createEngine(icelandModel);
    e.load({ modelId: 'iceland', version: 2, events, months: 72 });
    const client = createEngineClient(e);
    const histories = new Map<string, number[]>();
    for (const ind of client.info.indicators) for (const basis of bases) histories.set(`${ind.id}/${basis}`, [...client.reportSeries(ind.id, basis)]);
    const scenario = client.scenario(), frame = client.getFrame();
    for (const ind of client.info.indicators) for (const basis of bases) {
      const values = client.reportSeries(ind.id, basis);
      expect(values).toHaveLength(73);
      expect(values.every(Number.isFinite)).toBe(true);
    }
    expect(client.scenario()).toEqual(scenario);
    expect(client.getFrame()).toBe(frame);
    client.seek(24);
    for (const ind of client.info.indicators) for (const basis of bases) expect(client.reportSeries(ind.id, basis)).toEqual(histories.get(`${ind.id}/${basis}`)!.slice(0, 25));
    client.seek(72);
    for (const ind of client.info.indicators) for (const basis of bases) expect(client.reportSeries(ind.id, basis)).toEqual(histories.get(`${ind.id}/${basis}`)!);
    client.reset();
    expect(client.scenario().events).toHaveLength(0);
    for (const ind of client.info.indicators) for (const basis of bases) expect(client.reportSeries(ind.id, basis)).toEqual(histories.get(`${ind.id}/${basis}`)!.slice(0, 1));
    client.load(scenario);
    for (const ind of client.info.indicators) for (const basis of bases) expect(client.reportSeries(ind.id, basis)).toEqual(histories.get(`${ind.id}/${basis}`)!);
    const detached = e.levels('output');
    detached[0] = -999;
    expect(e.levelAt('output', 0)).toBeCloseTo(GDP_BN, 8);
    client.dispose();
  });

  test('Overview has 22 distinct useful headlines; level references and ranges match their units', () => {
    const client = createEngineClient(icelandModel);
    const overview = chartTabs(client.info.indicators).find((tab) => tab.id === 'Overview')!;
    expect(overview.indicators).toHaveLength(22);
    expect(new Set(overview.indicators.map((ind) => ind.id)).size).toBe(22);
    expect(overview.indicators.slice(0, 10).map((ind) => ind.id)).toEqual(['output', 'keyRate', 'inflation', 'govDebtAmount', 'govDebt', 'unemployment', 'consumption', 'investment', 'broadMoney', 'mortgageDebt']);
    expect(chartTabs(client.info.indicators).find((tab) => tab.id === 'Money and credit')!.indicators.map((ind) => ind.id)).toEqual(client.info.indicators.filter((ind) => ind.group === 'Money and credit').map((ind) => ind.id));
    for (const id of ['output', 'keyRate', 'inflation', 'unemployment', 'govDebtAmount', 'govDebt', 'mortgageDebt', 'broadMoney', 'exports', 'imports', 'currentAccount', 'pfAssets']) expect(overview.indicators.some((x) => x.id === id)).toBe(true);
    for (const basis of bases) for (const ind of overview.indicators) {
      const series = client.reportSeries(ind.id, basis);
      const ref = reportRef(ind, series, basis);
      expect(ref).toBe(basis === 'deviation' ? 0 : series[0]);
      const range = reportMinRange(ind, series, basis);
      expect(chartWindow(series, 0, 72, ref, range).hi - chartWindow(series, 0, 72, ref, range).lo).toBeGreaterThanOrEqual(range);
    }
    client.dispose();
  });

  test('unknown references in level reporting are rejected by the compiler', () => {
    const def: ModelDef = { ...icelandModel, modules: icelandModel.modules.map((m) => m.indicators ? { ...m, indicators: m.indicators.map((ind) => ind.id === 'output' ? { ...ind, level: { ...ind.level!, nominal: (c) => c.v('missingReportingVariable') } } : ind) } : m) };
    expect(() => compile(def)).toThrow(CompileError);
  });
});
