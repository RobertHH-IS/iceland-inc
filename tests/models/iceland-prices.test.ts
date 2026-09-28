/**
 * The Iceland model's prices, the króna, labour and neutral rates: the fixes from the
 * 29 September 2026 audit (docs/audit/2026-09-29-audit.md) and stage 0 of the start from today
 * (docs/design/start-from-today.md §4.6 and appendix A1).
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { withConcepts } from '../../src/models/index.ts';

const model = compile(withConcepts(icelandModel));
const term = (e: KernelEngine, id: string, t: string) => e.influences(id).terms.find((x) => x.id === t)!.value;

describe('Stage 0: i0 is the real neutral rate; nominal comparisons use i0 + piT', () => {
  test('with a 2.5% target and the key rate at 5.5%, every nominal rate gap is zero and the rule’s neutral term is 5.5%', () => {
    const e = createEngine(model).fork({ params: { piT: 0.025 } });
    e.setLever('keyRateFixed', 5.5);
    e.step(1);
    expect(term(e, 'ruleRate', 'neutral')).toBeCloseTo(0.055, 15);
    expect(Math.abs(term(e, 'logExchangeRate', 'carry'))).toBeLessThan(1e-15);
    expect(Math.abs(term(e, 'bondPurchasesW', 'carry'))).toBeLessThan(1e-15);
    expect(Math.abs(term(e, 'mortgageRateI', 'keyRate'))).toBeLessThan(1e-15);
    // Consumption compares the real key rate with the real neutral rate, so it still sees the 2.5 points
    const realGap = e.value('keyRate') - e.baseline('expectedInflation') - 0.03;
    expect(realGap).toBeCloseTo(0.025, 12);
  });

  test('today’s world prices and foreign rate are parameters that are exactly the old constants on the steady start', () => {
    const e = createEngine(model);
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
    const e = createEngine(model);
    const reserves = e.stock('fxReserves', 'CB');
    const inc0 = e.baseline('fxReserveIncome');
    e.setLever('foreignRate', 1);
    e.step(1);
    // income accrues on the reserves held at the start of the month
    const normal = e.influences('fxReserveIncome').params.find((p) => p.id === 'iFXR')!.value;
    expect(e.value('fxReserveIncome')).toBeCloseTo((normal + 0.01) * reserves, 12);
    expect(inc0).toBeCloseTo(normal * reserves, 12);
    expect(e.value('cbProfit') - e.baseline('cbProfit')).toBeGreaterThan(0.009 * reserves);
  });
});
