/**
 * The position-sign diagnostic (decision 0005): a holder's asset or an issuer's liability that
 * goes below zero is reported beside the accounting checks, never as a failure, and a model
 * can declare the positions it knowingly lets take either sign.
 */
import { describe, expect, test } from 'bun:test';
import { compile, CompileError } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { measureSigns, signBreach } from '../../src/core/checks.ts';
import type { InstrumentDef, ModelDef, ModuleDef } from '../../src/core/types.ts';
import { referenceModel } from '../../src/models/reference/index.ts';
import { param, rule, tinyModel, variable } from './fixtures.ts';

/** Households pay a fine to the government, set by a lever: at 120 a year it overdraws their
 *  50 of deposits in the sixth month. The bank has reserves enough to pay it all year. */
function overdraftModel(mayGoNegative?: InstrumentDef['mayGoNegative']): ModelDef {
  const fine: ModuleDef = {
    id: 'fine',
    label: 'Fine',
    description: 'A fine households pay to the government.',
    vars: [variable('fine', 0)],
    params: [param('fineLevel', 0)],
    rules: [rule({ id: 'fine', target: 'fine', category: 'POLICY', params: ['fineLevel'], compute: (c) => c.p('fineLevel') })],
    flows: [{ id: 'fine', label: 'Fine', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: [{ from: 'HH', to: 'G', amount: 'fine' }], explain: { what: 'a fine' } }],
    levers: [{ id: 'fine', label: 'Fine', group: 'Policy', kind: 'setting', unit: '% of GDP', default: 0, min: 0, max: 200, binds: { param: 'fineLevel', mode: 'replace' }, description: 'fine', definition: 'Level, persistent while set.' }],
  };
  const def = tinyModel([fine]);
  if (mayGoNegative) {
    const pay = def.modules[0];
    pay.instruments = pay.instruments!.map((i) => (i.id === 'deposits' ? { ...i, mayGoNegative } : i));
  }
  def.steadyState.initialStocks = def.steadyState.initialStocks.map(([i, p, v]) => [i, p, i === 'reserves' ? 200 : v]);
  return def;
}

const errorsOf = (def: ModelDef): string[] => {
  try {
    compile(def);
    return [];
  } catch (e) {
    if (e instanceof CompileError) return e.errors;
    throw e;
  }
};

describe('measureSigns', () => {
  test('holders must not go below zero, issuers not above; exempt and unrelated positions are skipped', () => {
    expect(signBreach(1, -2)).toBe(2);
    expect(signBreach(1, 3)).toBe(0);
    expect(signBreach(2, 2)).toBe(2); // a liability (signed −) that turned into a claim
    expect(signBreach(2, -3)).toBe(0);
    expect(signBreach(0, -5)).toBe(0);
    const spec = { role: new Uint8Array([1, 2, 1, 0, 1]), exempt: new Uint8Array([0, 0, 0, 0, 1]) };
    const out: number[] = [];
    const worst = measureSigns(new Float64Array([-1e-7, 0.5, -2, -9, -9]), spec, 1e-6, out);
    expect(out).toEqual([1, 2]);
    expect(worst).toBe(2);
    expect(measureSigns(new Float64Array([1, -1, 1, 0, 0]), spec, 1e-6)).toBe(0);
  });
});

describe('the engine reports the first wrong-sign month of each position', () => {
  const model = compile(overdraftModel());

  test('an overdrawn deposit is reported once, with its month and value, and is not a failure', () => {
    const e = createEngine(model, { onCheckFailure: 'throw' });
    expect(e.checks().signViolations).toEqual([]);
    expect(e.checks().signTolerance).toBe(1e-6);
    e.setLever('fine', 120); // 10 a month out of 50
    e.step(12); // does not throw
    const rep = e.checks();
    expect(rep.failures).toEqual([]);
    expect(rep.maxResidual).toBeLessThan(1e-9);
    const v = rep.signViolations!;
    expect(v.map((x) => [x.instrument, x.player, x.role, x.t])).toEqual([
      ['deposits', 'HH', 'holder', 6],
      ['deposits', 'B', 'issuer', 6], // the bank now owes its depositors less than nothing
    ]);
    expect(v[0].value).toBeCloseTo(-10, 9);
    expect(v[1].value).toBeCloseTo(-10, 9);
    expect(e.stock('deposits', 'HH')).toBeCloseTo(-70, 9); // still one entry per position
  });

  test('seek, forks and load reproduce the violations exactly', () => {
    const e = createEngine(model);
    e.setLever('fine', 120);
    e.step(12);
    const all = e.checks().signViolations;
    e.seek(5);
    expect(e.checks().signViolations).toEqual([]);
    e.seek(12);
    expect(e.checks().signViolations).toEqual(all);
    expect(e.fork().checks().signViolations).toEqual(all);
    const l = createEngine(model);
    l.load({ modelId: 'tiny', events: e.events, months: 12 });
    expect(l.checks().signViolations).toEqual(all);
    e.reset();
    expect(e.checks().signViolations).toEqual([]);
  });

  test('the tolerance is the diagnostic’s own', () => {
    const e = createEngine(model, { signTolerance: 20 });
    e.setLever('fine', 120);
    e.step(7); // −20 at month 7 is not beyond a tolerance of 20
    expect(e.checks().signViolations).toEqual([]);
    expect(e.checks().signTolerance).toBe(20);
  });

  test('mayGoNegative exempts the positions it names, or every position of the instrument', () => {
    const run = (free: InstrumentDef['mayGoNegative']) => {
      const e = createEngine(overdraftModel(free));
      e.setLever('fine', 120);
      e.step(12);
      return e.checks().signViolations!.map((x) => `${x.instrument}/${x.player}`);
    };
    const reason = 'a test overdraft';
    expect(run({ reason })).toEqual([]);
    expect(run({ reason, players: ['HH'] })).toEqual(['deposits/B']);
  });

  test('mayGoNegative needs a reason and players that hold or issue the instrument', () => {
    const errs = (free: InstrumentDef['mayGoNegative']) => errorsOf(overdraftModel(free)).join('\n');
    expect(errs({ reason: ' ' })).toContain("instrument 'deposits' (module 'payments') mayGoNegative needs a reason");
    expect(errs({ reason: 'x', players: ['nobody'] })).toContain("lists unknown player 'nobody'");
    expect(errs({ reason: 'x', players: ['G'] })).toContain("lists 'G', which neither holds nor issues it");
    expect(errs({ reason: 'x', players: [] })).toContain('lists no players');
    expect(errs({ reason: 'x', players: ['HH', 'B'] })).toBe('');
  });
});

test('the reference economy has no wrong-sign position at rest or after a shock', () => {
  const e = createEngine(referenceModel);
  e.fire('wageSettlement', 10);
  e.step(120);
  expect(e.checks().signViolations).toEqual([]);
});
