import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGrowingFinancialEngine } from '../../src/models/iceland/growing-financial.ts';
import { createEngine } from '../../src/core/engine.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { areaPath, chartWindow, linePath } from '../../src/ui/model/charts.ts';
import { modelContext } from '../../src/ui/model/economic-context.ts';
import { startingDataComparison } from '../../src/ui/model/current-data.ts';
import { resolveCardMetrics } from '../../src/ui/model/player-cards.ts';
import { financialHealth } from '../../src/ui/model/financial-health.ts';
import { FinancialDetail } from '../../src/ui/views/FinancialDetail.tsx';
import { Charts } from '../../src/ui/views/Charts.tsx';

const fresh = () => createEngineClient(createGrowingFinancialEngine(), { comparison: 'no-change', tickMs: 1e9 });

describe('evolving no-change reporting', () => {
  test('a growing untouched economy shows actual rising levels and zero experiment effects everywhere', () => {
    const c = fresh();
    c.step(120);
    expect(c.getFrame().error).toBeNull();
    expect(c.reportSeries('output', 'nominal')[120]).toBeGreaterThan(c.reportSeries('output', 'nominal')[0]);
    for (const ind of c.info.indicators) {
      expect(c.series(ind.id).every((v) => Math.abs(v) < 1e-10)).toBe(true);
      expect(c.reportSeries(ind.id, 'nominal')).toEqual(c.referenceReportSeries!(ind.id, 'nominal'));
    }
    for (const p of c.pipes('player')) {
      expect(p.value).toBe(p.baseline);
      for (const l of p.legs) expect(l.value).toBe(l.baseline);
    }
    expect(c.getFrame().legs).toEqual(c.getFrame().legBaselines!);
    for (const id of ['growthRealIndex', 'nominalGDP', 'investmentXT', 'creditApprovedXT']) {
      expect(c.varSeries(id, 0, 120)).toEqual(c.referenceVarSeries!(id, 0, 120));
    }
    for (const p of c.info.players) {
      const bs = c.balanceSheet(p.id);
      expect(bs.netWorth).toBe(bs.netWorthBaseline);
      for (const a of [...bs.assets, ...bs.liabilities]) expect(a.value).toBe(a.baseline);
    }
    expect(c.ideasAtPlay()).toEqual([]);
    expect(c.getFrame().feed.filter((f) => !f.stabiliser)).toEqual([]);
    const metric = resolveCardMetrics(c.info, 'XT')[0];
    expect('id' in metric ? metric.id : undefined).toBe('exportsXT');
    c.dispose();
  });

  test('a policy shock is measured against the same variant and immutable opening assumptions survive seek/reset/load', () => {
    const e = createGrowingFinancialEngine({ worldGrowth: 0.02 });
    const ref = createEngine(e.model, { ...e.options, baseline: e.baselineData });
    const c = createEngineClient(e, { comparison: 'no-change', tickMs: 1e9 });
    const start = modelContext(c);
    c.step(24); ref.step(24);
    c.setLever('keyRate', 8); c.pause();
    c.step(48); ref.step(48);
    expect(c.getFrame().error).toBeNull();
    expect(c.series('output')[72]).toBeCloseTo(e.indicatorAt('output', 72, ref), 10);
    expect(c.baseline('nominalGDP')).toBe(ref.value('nominalGDP'));
    expect(c.opening!('nominalGDP')).toBe(e.baseline('nominalGDP'));
    expect(modelContext(c)).toEqual(start);
    const saved = c.scenario(), levels = [...c.reportSeries('output', 'nominal')], effects = [...c.series('output')];
    const reference = [...c.referenceReportSeries!('output', 'nominal')];
    c.seek(12); c.seek(72);
    expect(c.reportSeries('output', 'nominal')).toEqual(levels);
    expect(c.series('output')).toEqual(effects);
    expect(c.referenceReportSeries!('output', 'nominal')).toEqual(reference);
    c.reset(); c.load(saved);
    expect(c.series('output')).toEqual(effects);
    expect(modelContext(c)).toEqual(start);
    c.reset(); c.step(72);
    expect(c.series('output').every((v) => Math.abs(v) < 1e-10)).toBe(true);
    c.dispose();
  }, 30_000);

  test('chart curves include the matching reference history and reporting queries leave the model untouched', () => {
    const c = fresh(); c.step(36);
    const frame = c.getFrame(), scenario = c.scenario();
    for (const ind of c.info.indicators) {
      for (const basis of ['nominal', 'real', 'deviation'] as const) {
        c.reportSeries(ind.id, basis); c.referenceReportSeries!(ind.id, basis);
      }
      c.influences(`indicator:${ind.id}`);
    }
    c.balanceSheet('B'); c.pipes('group'); c.ideasAtPlay();
    expect(c.getFrame()).toBe(frame); expect(c.scenario()).toEqual(scenario);
    const html = renderToStaticMarkup(<Charts info={c.info} client={c} t={frame.t} events={frame.events} tab="Overview" onTab={() => {}} selected={null} onSelect={() => {}} />);
    expect(html).toContain('reference-line');
    expect(html).toContain('<title>No-change path at the same month</title>');
    const effectsHtml = renderToStaticMarkup(<Charts info={c.info} client={c} t={frame.t} events={frame.events} tab="Overview" onTab={() => {}} selected={null} onSelect={() => {}} basis="deviation" onBasis={() => {}} />);
    expect(effectsHtml).toContain('% vs no change');
    const starting = startingDataComparison(c);
    expect(starting.find((r) => r.id === 'keyRate')?.qualification).toContain('calibrated 3% opening rate');
    expect(starting.find((r) => r.id === 'inflation')?.qualification).toContain('assumed price trend');
    const w = chartWindow([100, 105, 110], 2, 2, 100, 1, [100, 110, 120]);
    expect(w.ref).toBe(120); expect(w.referenceValues).toEqual([100, 110, 120]);
    expect(w.hi).toBeGreaterThan(120);
    expect(linePath({ ...w, values: w.referenceValues! }, 100, 50)).not.toBe(linePath(w, 100, 50));
    expect(areaPath(w, 100, 50)).toEndWith('Z');
    c.dispose();
  });

  test('actual missed obligations have a critical marker, and the inspector shows the funding refused and the responses in force', () => {
    const c = fresh();
    c.setLever('tourism', -80); c.pause();
    c.step(48);
    expect(c.getFrame().error).toBeNull();
    const health = financialHealth(c, ['XT']);
    expect(health?.severity).toBe('critical');
    const html = renderToStaticMarkup(<FinancialDetail client={c} members={['XT']} onSelect={() => {}} />);
    expect(html).toContain('Unpaid business obligations');
    for (const text of ['Operating cash / debt service', 'Gross credit refused', 'Principal refinancing refused', 'Owner cash support', 'Funded investment', 'Funded jobs', 'vs no change']) expect(html).toContain(text);
    // amounts that are zero now are left out (tests/ui/application-model.test.tsx)
    for (const text of ['Unpaid interest', 'Claims written off']) expect(html).not.toContain(text);
    c.dispose();
  });

  test('capacity and financing regimes identify the sector bearing the constraint', () => {
    const c = fresh();
    const ownersOf = (target: string) => c.info.regimeOwners.get(c.info.ruleByTarget.get(target)!.id);
    expect(ownersOf('productiveCapacity')).toEqual([]);
    for (const [target, player] of [['exportVolumeFish', 'XF'], ['exportVolumeAluminium', 'XA'], ['exportVolumeTourism', 'XT'], ['exportVolumeOther', 'XO']]) {
      expect(ownersOf(target)).toEqual([player]);
    }
    expect(ownersOf('creditApprovedXT')).toEqual(['B', 'XT']);
    expect(c.info.ruleByTarget.get('principalOverdueXT')?.owners).toEqual(['XT']);
    c.dispose();
  });
});
