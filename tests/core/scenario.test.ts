/**
 * Scenarios as data, run results, and the display helpers.
 */
import { describe, expect, test } from 'bun:test';
import { makeScenario, parseScenario, runScenario, stringifyScenario } from '../../src/core/scenario.ts';
import { fillTemplate, formatNumber, formatValue, toDisplay, unitScale } from '../../src/core/format.ts';
import { createEngine } from '../../src/core/engine.ts';
import { referenceModel } from '../../src/models/reference/index.ts';

describe('scenarios', () => {
  test('round-trip through JSON', () => {
    const s = makeScenario('reference', [{ t: 3, lever: 'wageSettlement', value: 10, fire: true }, { t: 0, lever: 'govSpending', value: 1 }], 36);
    const back = parseScenario(stringifyScenario(s));
    expect(back.modelId).toBe('reference');
    expect(back.events[0]).toEqual({ t: 0, lever: 'govSpending', value: 1 });
    expect(back.events[1]).toEqual({ t: 3, lever: 'wageSettlement', value: 10, fire: true });
    expect(() => parseScenario('{"modelId":"x","months":3}')).toThrow(/events/);
  });

  test('runScenario returns months + 1 points per series and reuses an engine’s baseline', () => {
    const e = createEngine(referenceModel);
    const r = runScenario(e, [{ t: 0, lever: 'govSpending', value: 1 }], 24);
    expect(r.months).toBe(24);
    expect(r.series('output').length).toBe(25);
    expect(r.series('output')[0]).toBe(0);
    expect(r.value('gdp', 0)).toBeCloseTo(100, 9);
    expect(r.engine.baselineData).toBe(e.baselineData);
    expect(() => e.load({ modelId: 'other', events: [], months: 1 })).toThrow(/scenario is for model/);
  });
});

describe('format', () => {
  test('display transforms', () => {
    expect(toDisplay('deviation-pct', 101, 100)).toBeCloseTo(1, 12);
    expect(toDisplay('deviation-pp', 0.04, 0.03)).toBeCloseTo(1, 12);
    expect(toDisplay('deviation', 57, 55)).toBe(2);
    expect(toDisplay('level', 7, 3)).toBe(7);
    expect(toDisplay('deviation-pct', 0.5, 0)).toBe(50);
  });

  test('numbers, units and templates', () => {
    expect(formatNumber(-0.0001)).toBe('0.00');
    expect(formatNumber(1.234, 1, true)).toBe('+1.2');
    expect(formatValue(0.035, 'fraction/yr')).toBe('3.50%');
    expect(formatValue(12.5, '% of GDP/yr')).toBe('12.50% of GDP/yr');
    const p: Record<string, number> = { rate: 0.03, k: 1.5 };
    expect(fillTemplate('{rate%} and {rate pp} and {k} and {missing}', (id) => p[id])).toBe('3% and 3 pp and 1.5 and {missing}');
    expect(unitScale({ kind: 'rate', unit: 'fraction/yr' }, 0.03)).toBe(0.01);
    expect(unitScale({ kind: 'flow', unit: '% of GDP/yr' }, 60)).toBe(1);
    expect(unitScale({ kind: 'price', unit: 'index' }, 2)).toBeCloseTo(0.02, 15);
  });
});
