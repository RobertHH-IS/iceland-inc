/**
 * The ideas a shock credits, and texts that make a claim about the numbers: the terms of trade
 * for world fish and aluminium prices, primary income (not the carry trade) for income on
 * foreign reserves, the debt-tied tax rule (not the spending cap) for the income-tax rule, and
 * central-bank financing that saves only the spread over the key rate.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { compile, type KModel } from '../../src/core/compile.ts';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { runScenario } from '../../src/core/scenario.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';

const MANUAL = 0,
  AUTOMATIC = 1;
let iceland: KModel, base: KernelEngine;
beforeAll(() => {
  iceland = compile(icelandModel);
  base = createEngine(iceland, { dev: false });
});
const ice = () => createEngine(iceland, { dev: false, baseline: base.baselineData });
const ideas = (e: KernelEngine, scope?: string) => e.ideasAtPlay(scope);
const rank = (e: KernelEngine, concept: string, scope?: string) => ideas(e, scope).findIndex((x) => x.concept === concept);

describe('world prices: the terms of trade', () => {
  for (const [lever, value, term] of [
    ['fishPrices', 20, 'fishPrice.fishMarket'],
    ['aluminiumPrice', 30, 'aluminiumPrice.metalMarket'],
  ] as const) {
    test(`${lever} +${value}: the terms of trade are among the top three ideas, through the price lever's own term`, () => {
      const e = ice();
      e.setLever(lever, value);
      e.step(12);
      const r = rank(e, 'terms-of-trade');
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(3);
      expect(ideas(e)[r]!.via).toContain(term);
    });
  }

  test('the world-prices lever is foreign inflation, not exchange-rate pass-through, in the world-price rules', () => {
    const e = ice();
    e.setLever('importPrices', 10);
    e.step(1);
    for (const v of ['worldPrice', 'fishPrice', 'aluminiumPrice']) {
      const found = ideas(e, `var:${v}`).map((x) => x.concept);
      expect(found).toContain('purchasing-power-parity');
      expect(found).not.toContain('exchange-rate-pass-through');
      expect(found).not.toContain('terms-of-trade');
    }
  });
});

describe('income from abroad is primary income', () => {
  test('a higher foreign rate credits the current account, not the carry trade, for reserve and pension-fund income', () => {
    const e = ice();
    e.setLever('foreignRate', 3);
    e.step(12);
    const all = ideas(e);
    const via = (concept: string) => all.find((x) => x.concept === concept)?.via ?? [];
    expect(via('current-account')).toContain('fxReserveIncome.foreignRate');
    expect(via('current-account')).toContain('foreignAssetIncome.foreignRate');
    expect(via('carry-trade').filter((v) => /^(fxReserveIncome|foreignAssetIncome)\b/.test(v))).toEqual([]);
  });

  test('interest and dividends paid abroad are tagged as the current account, not the export sectors', () => {
    const inf = ice().influences('currentAccount');
    const term = (id: string) => inf.terms.find((t) => t.id === id)!;
    expect(term('incomeOut').concept).toBe('current-account');
    expect(term('incomeIn').concept).toBe('current-account');
  });
});

describe('the income-tax rule is a debt-tied tax rule', () => {
  test('on Automatic an income-tax offset credits the debt-tied tax rule through the rule, not the spending cap', () => {
    const e = ice();
    e.setLever('stabilisers', AUTOMATIC);
    e.setLever('incomeTaxOffset', 2.5);
    e.step(36);
    const found = ideas(e, 'indicator:incomeTaxRate');
    const debt = found.find((x) => x.concept === 'debt-feedback');
    expect(debt?.via.some((v) => v.startsWith('taxRuleAdjustment'))).toBe(true);
    expect(found.map((x) => x.concept)).not.toContain('fiscal-rule');
  });
});

describe('central-bank financing', () => {
  test('saves the government only the spread over the key rate: extra central-bank profit is a small part of the extra bond interest it earns', () => {
    const ev = (buyer: number) => [
      { t: 0, lever: 'stabilisers', value: MANUAL },
      { t: 0, lever: 'publicInvestment', value: 2 },
      { t: 0, lever: 'bondBuyers', value: buyer },
    ];
    const mix = runScenario(base, ev(0), 240).engine,
      cb = runScenario(base, ev(2), 240).engine;
    const d = (id: string) => cb.valueAt(id, 240) - mix.valueAt(id, 240);
    expect(d('bondInterestCB')).toBeGreaterThan(1);
    expect(d('reserveInterest')).toBeGreaterThan(0.7 * d('bondInterestCB'));
    expect(d('cbProfit')).toBeGreaterThan(0);
    expect(d('cbProfit')).toBeLessThan(0.3 * d('bondInterestCB'));
    // the text's numbers: balance about 0.1% of GDP better, debt about 0.7 points lower
    const series = (e: KernelEngine, id: string) => e.runResult().series(id);
    const last = (id: string) => series(cb, id).at(-1)! - series(mix, id).at(-1)!;
    expect(last('govBalance')).toBeGreaterThan(0.05);
    expect(last('govBalance')).toBeLessThan(0.2);
    expect(last('govDebt')).toBeLessThan(-0.4);
    expect(last('govDebt')).toBeGreaterThan(-1);
  });
});
