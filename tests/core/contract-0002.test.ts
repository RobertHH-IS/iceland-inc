/**
 * Kernel behaviours added with the Iceland port (docs/decisions/0002-iceland-port.md):
 *   1. adjust form 'exponential';
 *   2. revalue between two holders of an instrument (a reclassification);
 *   3. parameters read only by the closed-form steady state count as used.
 */
import { describe, expect, test } from 'bun:test';
import type { ModuleDef } from '../../src/core/types.ts';
import { compile, CompileError } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { param, rule, tinyModel, variable } from './fixtures.ts';

describe('adjust form exponential', () => {
  const smooth: ModuleDef = {
    id: 'smooth',
    label: 'smooth',
    description: 'a smoothed copy of spending',
    vars: [variable('smoothed', 10)],
    params: [param('fast', 30)],
    rules: [rule({ id: 'smoothed', target: 'smoothed', inputs: ['spend'], adjust: { speed: 'fast', form: 'exponential' }, terms: [{ id: 'spend', label: 'spend', compute: (c) => c.v('spend') }] })],
  };

  test('value = previous + (1 − e^(−speed·dt)) · (desired − previous), and it never overshoots', () => {
    const e = createEngine(tinyModel([smooth]));
    expect(e.warnings.some((w) => w.includes('overshoots'))).toBe(false); // speed × dt = 2.5 would overshoot in linear form
    const k = 1 - Math.exp(-30 / 12);
    const forked = e.fork({ params: { level: 20 } }); // spending jumps from 10 to 20
    e.step(1);
    expect(e.value('smoothed')).toBe(10); // unchanged spending: the smoothed value stays put
    const prev = forked.value('smoothed');
    forked.step(1);
    const want = prev + k * (20 - prev);
    expect(Math.abs(forked.value('smoothed') - want)).toBeLessThan(1e-12);
    expect(forked.value('smoothed')).toBeLessThan(20);
  });

  test('an unknown form is a compile error', () => {
    const bad: ModuleDef = { ...smooth, rules: [{ ...smooth.rules![0], adjust: { speed: 'fast', form: 'cubic' as 'linear' } }] };
    expect(() => compile(tinyModel([bad]))).toThrow(CompileError);
  });
});

describe('revalue between two holders (reclassification)', () => {
  const reclass: ModuleDef = {
    id: 'reclass',
    label: 'reclass',
    description: 'rights and homes move from one holder to another',
    players: [
      { id: 'H2', label: 'H2', group: 'Private', description: 'second household', settlement: 'deposits', layout: { x: 0.2, y: 0.5 } },
      { id: 'PF', label: 'PF', group: 'Private', description: 'fund', settlement: 'deposits', layout: { x: 0.3, y: 0.5 } },
    ],
    instruments: [
      { id: 'rights', label: 'Rights', kind: 'financial', issuers: ['PF'], holders: ['HH', 'H2'], valuation: 'nominal', description: 'rights' },
      { id: 'homes', label: 'Homes', kind: 'real', issuers: [], holders: ['HH', 'H2'], valuation: 'price-index', description: 'homes' },
    ],
    vars: [variable('moveRights', 2), variable('moveHomes', 3)],
    rules: [
      rule({ id: 'moveRights', target: 'moveRights', compute: () => 2 }),
      rule({ id: 'moveHomes', target: 'moveHomes', compute: () => 3 }),
    ],
    flows: [
      { id: 'retire', label: 'retire', kind: 'revaluation', account: 'other', posting: { type: 'revalue', instrument: 'rights' }, legs: [{ from: 'HH', to: 'H2', amount: 'moveRights' }], explain: { what: 'rights move' } },
      { id: 'age', label: 'age', kind: 'revaluation', account: 'other', posting: { type: 'revalue', instrument: 'homes' }, legs: [{ from: 'HH', to: 'H2', amount: 'moveHomes' }], explain: { what: 'homes move' } },
    ],
  };

  test('value moves from one holder to the other; no cash, no income; the accounting checks pass', () => {
    const def = tinyModel([reclass]);
    // the deposit instrument must list the new deposit holders
    def.modules[0] = { ...def.modules[0], instruments: def.modules[0].instruments!.map((i) => (i.id === 'deposits' ? { ...i, holders: ['HH', 'H2', 'PF'] } : i)) };
    def.steadyState = { ...def.steadyState, initialStocks: [...def.steadyState.initialStocks, ['rights', 'HH', 100], ['rights', 'H2', 50], ['homes', 'HH', 100], ['homes', 'H2', 50], ['deposits', 'H2', 1], ['deposits', 'PF', 1]] };
    const m = compile(def);
    const e = createEngine(m);
    const before = { r: e.stock('rights', 'HH'), r2: e.stock('rights', 'H2'), owed: e.stock('rights', 'PF'), h: e.stock('homes', 'HH'), h2: e.stock('homes', 'H2'), d: e.stock('deposits', 'HH') };
    e.step(12);
    expect(e.stock('rights', 'HH')).toBeCloseTo(before.r - 2, 12);
    expect(e.stock('rights', 'H2')).toBeCloseTo(before.r2 + 2, 12);
    expect(e.stock('rights', 'PF')).toBeCloseTo(before.owed, 12); // what the issuer owes is unchanged
    expect(e.stock('homes', 'HH')).toBeCloseTo(before.h - 3, 12);
    expect(e.stock('homes', 'H2')).toBeCloseTo(before.h2 + 3, 12);
    expect(e.checks().failures).toEqual([]);
  });

  test('a write-off between two holders is still an error', () => {
    const bad: ModuleDef = { ...reclass, flows: [{ ...reclass.flows![0], kind: 'writeoff', posting: { type: 'writeoff', instrument: 'rights' } }] };
    expect(() => compile(tinyModel([bad]))).toThrow(CompileError);
  });
});

describe('parameters used by the closed-form steady state', () => {
  test('a parameter only the closed-form solve reads is not reported as unused', () => {
    const extra: ModuleDef = { id: 'x', label: 'x', description: 'x', params: [param('dataOnly', 7), param('reallyUnused', 1)] };
    const def = tinyModel([extra]);
    def.steadyState = { ...def.steadyState, solve: (p) => ({ stocks: [], vars: { spend: p.dataOnly > 0 ? 10 : 0 } }) };
    const m = compile(def);
    expect(m.warnings.some((w) => w.includes("'dataOnly'"))).toBe(false);
    expect(m.warnings.some((w) => w.includes("'reallyUnused'"))).toBe(true);
  });
});
