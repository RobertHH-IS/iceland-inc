/**
 * The baseline solver: initial stocks, closed-form solve, Newton polishing, free parameters
 * and targets.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { buildPositions, solveBaseline } from '../../src/core/steady.ts';
import { createEngine } from '../../src/core/engine.ts';
import type { ModelDef, ModuleDef } from '../../src/core/types.ts';
import { param, rule, tinyModel, variable } from './fixtures.ts';

/** Households earn a wage from the government and interest from the bank, and spend out of
 *  income and wealth; the government subsidises the bank's interest bill. The steady state
 *  pins household deposits: (1 − mpc) × income = wealthMpc × deposits. */
function savingsModel(withSolve: boolean): ModelDef {
  const m: ModuleDef = {
    id: 'savings',
    label: 'x',
    description: 'x',
    vars: [variable('wagePaid', 10), variable('interest', 1), variable('spend', 10), variable('income', 10), variable('subsidy', 1)],
    params: [param('rate', 0.02), param('mpc', 0.9), param('wealthMpc', 0.05), param('wage', 10)],
    rules: [
      rule({ id: 'wagePaid', target: 'wagePaid', params: ['wage'], compute: (c) => c.p('wage') }),
      rule({ id: 'interest', target: 'interest', stocks: [['deposits', 'HH']], params: ['rate'], compute: (c) => c.p('rate') * c.stock('deposits', 'HH') }),
      rule({ id: 'income', target: 'income', inputs: ['wagePaid', 'interest'], compute: (c) => c.v('wagePaid') + c.v('interest') }),
      rule({
        id: 'spend',
        target: 'spend',
        inputs: ['income'],
        stocks: [['deposits', 'HH']],
        params: ['mpc', 'wealthMpc'],
        adjust: { speed: 3 },
        compute: (c) => c.p('mpc') * c.v('income') + c.p('wealthMpc') * c.stock('deposits', 'HH'),
      }),
      rule({ id: 'subsidy', target: 'subsidy', inputs: ['interest'], compute: (c) => c.v('interest') }),
    ],
    flows: [
      { id: 'wage', label: 'wage', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: [{ from: 'G', to: 'HH', amount: 'wagePaid' }], explain: { what: 'x' } },
      { id: 'interest', label: 'interest', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: [{ from: 'B', to: 'HH', amount: 'interest' }], explain: { what: 'x' } },
      { id: 'spend', label: 'spend', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: [{ from: 'HH', to: 'G', amount: 'spend' }], explain: { what: 'x' } },
      { id: 'subsidy', label: 'subsidy', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: [{ from: 'G', to: 'B', amount: 'subsidy' }], explain: { what: 'x' } },
    ],
  };
  const def = tinyModel([m]);
  def.modules[1] = { id: 'core', label: 'core', description: 'none' }; // drop the tiny model's own flows
  def.steadyState = {
    free: ['wage'],
    targets: [{ id: 'spend-is-20', describe: 'spending is 20', residual: (c) => c.v('spend') - 20 }],
    initialStocks: [
      ['deposits', 'HH', 30],
      ['reserves', 'B', 5],
      ['tsy', 'G', 5],
    ],
    initialVars: { spend: 18, income: 18 },
    solve: withSolve
      ? (p) => {
          // closed form: spend = income = 20; deposits D with (1 − mpc)·20 = wealthMpc·D
          const D = ((1 - p.mpc) * 20) / p.wealthMpc;
          return { stocks: [['deposits', 'HH', D]], vars: { spend: 20, income: 20, interest: p.rate * D }, params: { wage: 20 - p.rate * D } };
        }
      : undefined,
  };
  return def;
}

describe('baseline solver', () => {
  test('Newton solves the free parameter and the stocks from a rough guess', () => {
    const m = compile(savingsModel(false));
    const b = solveBaseline(m);
    expect(b.method).toBe('newton');
    expect(b.residual).toBeLessThan(1e-11);
    expect(b.solved.wage).toBeCloseTo(20 - 0.02 * 40, 9);
    expect(b.positions[m.instrumentIndex.get('deposits')! * m.NP + m.playerIndex.get('HH')!]).toBeCloseTo(40, 9);
  });

  test('a closed-form solve is used first, then polished', () => {
    const m = compile(savingsModel(true));
    const b = solveBaseline(m);
    expect(b.method).toBe('closed-form + newton');
    expect(b.iterations).toBe(0); // the closed form was already exact
    expect(b.solved.wage).toBeCloseTo(19.2, 12);
  });

  test('the solved baseline does not drift', () => {
    const e = createEngine(savingsModel(false));
    e.step(240);
    expect(Math.abs(e.value('spend') - 20)).toBeLessThan(1e-9);
    expect(Math.abs(e.stock('deposits', 'HH') - 40)).toBeLessThan(1e-9);
  });

  test('parameter overrides before solving make a variant with its own baseline', () => {
    const e = createEngine(savingsModel(false), { params: { wealthMpc: 0.1 } });
    expect(e.stock('deposits', 'HH')).toBeCloseTo(20, 9);
  });

  test('initial stocks: a single issuer is filled in so the instrument balances', () => {
    const m = compile(tinyModel());
    const pos = buildPositions(m, [['deposits', 'HH', 50]]);
    const dep = m.instrumentIndex.get('deposits')!;
    expect(pos[dep * m.NP + m.playerIndex.get('B')!]).toBe(-50);
    expect(() => buildPositions(m, [['deposits', 'HH', 50], ['deposits', 'B', 40]])).toThrow(/do not balance/);
  });
});
