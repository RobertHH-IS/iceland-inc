/**
 * The engine: stepping, levers, scenarios, determinism, seek, forks, influences, shocks and
 * the runtime guards.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { compile } from '../../src/core/compile.ts';
import { Machine } from '../../src/core/machine.ts';
import type { ModuleDef, ScenarioEvent } from '../../src/core/types.ts';
import { referenceModel } from '../../src/models/reference/index.ts';
import { param, rule, tinyModel, variable } from './fixtures.ts';

const model = compile(referenceModel);
let base: KernelEngine;
beforeAll(() => {
  base = createEngine(model);
});
const fresh = () => createEngine(model, { baseline: base.baselineData });
const allVars = (e: KernelEngine, t: number) => model.vars.map((v) => e.valueAt(v.id, t));

const SCENARIO: ScenarioEvent[] = [
  { t: 0, lever: 'keyRateAddon', value: 1 },
  { t: 5, lever: 'wageSettlement', value: 8, fire: true },
  { t: 13, lever: 'govSpending', value: 1.5 },
  { t: 30, lever: 'keyRateAddon', value: 0 },
  { t: 41, lever: 'lendingAppetite', value: -1 },
];

describe('baseline', () => {
  test('the baseline is a steady state: 240 months without a shock change nothing', () => {
    const e = fresh();
    e.step(240);
    let worst = 0;
    for (const v of model.vars) worst = Math.max(worst, Math.abs(e.value(v.id) - e.baseline(v.id)));
    const pos = e.positionsAt(240),
      p0 = e.positionsAt(0);
    for (let j = 0; j < pos.length; j++) worst = Math.max(worst, Math.abs(pos[j] - p0[j]));
    expect(worst).toBeLessThan(1e-9);
    // every step, not only the last: failures are cumulative
    expect(e.checks().failures).toEqual([]);
    expect(Math.max(...e.maxResiduals().map((r) => r.residual))).toBeLessThan(1e-9);
  });

  test('the baseline report publishes every variable, stock and leg', () => {
    const r = base.baselineReport();
    expect(Object.keys(r.vars).length).toBe(model.vars.length);
    expect(r.legs.length).toBe(model.clegs.length);
    expect(r.stocks.find((s) => s.instrument === 'bonds' && s.player === 'G')!.value).toBeCloseTo(55, 9);
    expect(r.residual).toBeLessThan(1e-10);
    expect(r.targets.every((t) => Math.abs(t.residual) < 1e-9)).toBe(true);
  });
});

describe('scenarios, determinism and time travel', () => {
  test('the same scenario gives identical results, bit for bit', () => {
    const a = fresh(),
      b = createEngine(referenceModel);
    a.load({ modelId: 'reference', events: SCENARIO, months: 60 });
    b.load({ modelId: 'reference', events: SCENARIO, months: 60 });
    for (let t = 0; t <= 60; t += 7) expect(allVars(a, t)).toEqual(allVars(b, t));
    expect(a.series('output')).toEqual(b.series('output'));
  });

  test('stepping with levers by hand equals loading the scenario', () => {
    const a = fresh();
    a.load({ modelId: 'reference', events: SCENARIO, months: 60 });
    const b = fresh();
    for (let t = 0; t < 60; t++) {
      for (const e of SCENARIO) if (e.t === t) (e.fire ? b.fire(e.lever, e.value) : b.setLever(e.lever, e.value));
      b.step();
    }
    expect(allVars(b, 60)).toEqual(allVars(a, 60));
    expect(b.events).toEqual(a.events);
  });

  test('seek equals a straight run, backwards and forwards', () => {
    const straight = fresh();
    straight.load({ modelId: 'reference', events: SCENARIO, months: 72 });
    const e = fresh();
    e.load({ modelId: 'reference', events: SCENARIO, months: 72 });
    for (const m of [25, 5, 13, 0, 47, 72, 36]) {
      e.seek(m);
      expect(e.t).toBe(m);
      expect(model.vars.map((v) => e.value(v.id))).toEqual(allVars(straight, m));
      expect(Array.from(e.positionsAt(m))).toEqual(Array.from(straight.positionsAt(m)));
    }
    e.seek(72);
    expect(e.series('inflation')).toEqual(straight.series('inflation'));
    expect(e.feed()).toEqual(straight.feed());
  });

  test('a lever set after seeking back rewrites the future from that month', () => {
    const e = fresh();
    e.load({ modelId: 'reference', events: [{ t: 0, lever: 'govSpending', value: 1 }], months: 36 });
    e.seek(12);
    e.setLever('govSpending', 0);
    e.seek(36);
    const check = fresh();
    check.load({ modelId: 'reference', events: [{ t: 0, lever: 'govSpending', value: 1 }, { t: 12, lever: 'govSpending', value: 0 }], months: 36 });
    expect(allVars(e, 36)).toEqual(allVars(check, 36));
  });
});

describe('forks and counterfactuals', () => {
  test('a fork without options reproduces the parent exactly', () => {
    const e = fresh();
    e.load({ modelId: 'reference', events: SCENARIO, months: 40 });
    const f = e.fork();
    expect(f.t).toBe(40);
    expect(model.vars.map((v) => f.value(v.id))).toEqual(model.vars.map((v) => e.value(v.id)));
    f.step(10);
    e.step(10);
    expect(model.vars.map((v) => f.value(v.id))).toEqual(model.vars.map((v) => e.value(v.id)));
  });

  test('disabling a channel holds its term at baseline; shocked − unshocked is compared within the fork', () => {
    const hike: ScenarioEvent[] = [{ t: 0, lever: 'keyRateAddon', value: 1 }];
    const e = fresh();
    e.load({ modelId: 'reference', events: hike, months: 24 });
    const noSaving = e.fork({ disableTerms: ['consumption.realRate', 'investmentReal.realRate'] });
    // the disabled terms sit at their baseline values
    const inf = noSaving.influences('consumption').terms.find((t) => t.id === 'realRate')!;
    expect(inf.change).toBe(0);
    // unshocked run of the same variant
    const noSavingBase = noSaving.fork();
    noSavingBase.reset();
    noSavingBase.step(24);
    const effect = (x: KernelEngine, y: KernelEngine) => x.value('output') - y.value('output');
    const withChannel = effect(e, (() => { const b = fresh(); b.step(24); return b; })());
    const without = effect(noSaving, noSavingBase);
    expect(withChannel).toBeLessThan(0); // a rate hike lowers output
    // without the real-rate channels only the income channel is left: more interest income
    // for savers, so the same hike now raises output
    expect(without).toBeGreaterThan(0);
  });

  test('parameter overrides in a fork change the response but not the baseline it is measured from', () => {
    const e = fresh();
    const f = e.fork({ params: { taylorInflation: 3 } });
    expect(f.baseline('keyRate')).toBe(e.baseline('keyRate'));
    f.fire('wageSettlement', 10);
    e.fire('wageSettlement', 10);
    f.step(12);
    e.step(12);
    expect(f.value('keyRate')).toBeGreaterThan(e.value('keyRate'));
  });
});

describe('influences: exact within each rule', () => {
  test('for additive rules the term changes sum to the change in the desired value', () => {
    const e = fresh();
    e.load({ modelId: 'reference', events: SCENARIO, months: 30 });
    let checked = 0;
    for (const r of model.rules) {
      if (!r.terms || r.combine) continue;
      const inf = e.influences(r.target);
      expect(inf.nonAdditive).toBe(false);
      const sum = inf.terms.reduce((s, t) => s + t.change, 0);
      const target = inf.desired !== undefined ? inf.desired - inf.desiredBaseline! : inf.value - inf.baseline;
      expect(Math.abs(sum - target)).toBeLessThan(1e-9);
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
  });

  test('non-additive rules are flagged and name the active regime', () => {
    const e = fresh();
    const inf = e.influences('ruleRate'); // the Taylor rule (decision 0004 moved it off keyRate)
    expect(inf.nonAdditive).toBe(true);
    expect(inf.regime).toBeNull();
    expect(inf.category).toBe('POLICY');
    expect(inf.params.find((p) => p.id === 'taylorInflation')!.provenance.basis).toBe('assumed');
    expect(inf.rule!.rule).toContain('1.5 × 12-month inflation'); // {taylorInflation} filled in
  });

  test('flows and indicators have influences too', () => {
    const e = fresh();
    e.setLever('govSpending', 2);
    e.step(3);
    const f = e.influences('depositInterest');
    expect(f.terms.length).toBe(2);
    expect(f.value).toBeCloseTo(f.terms[0].value + f.terms[1].value, 12);
    expect(e.influences('broadMoney').upstream).toContain('newLoans');
    // 'output' is both a variable and an indicator: the prefix picks one
    expect(e.influences('output').category).toBe('IDENTITY');
    expect(e.influences('indicator:output').upstream).toContain('investmentReal');
    expect(e.influences('flow:wages').terms.length).toBe(1);
    expect(() => e.influences('nothing')).toThrow();
  });

  test('ideas at play follow the shock', () => {
    const e = fresh();
    expect(e.ideasAtPlay().length).toBe(0); // at baseline nothing moves
    e.fire('wageSettlement', 10);
    e.step(3);
    const ideas = e.ideasAtPlay().map((x) => x.concept);
    expect(ideas).toContain('markup-pricing');
    expect(ideas).toContain('cost-pass-through');
    const scoped = e.ideasAtPlay('HH').map((x) => x.concept);
    expect(scoped.length).toBeGreaterThan(0);
    expect(e.ideasAtPlay('F->HH').length).toBeGreaterThan(0);
  });
});

describe('adjust semantics', () => {
  test('value = previous value + speed · dt · (desired − previous value)', () => {
    const e = fresh();
    e.setLever('govSpending', 2);
    e.step(5);
    for (const id of ['consumption', 'price', 'ruleRate', 'employment']) {
      const inf = e.influences(id);
      const r = model.ruleFor(id)!;
      const speedParam = r.adjust!.speed as string;
      const speed = e.influences(id).params.find((p) => p.id === speedParam)!.value;
      const prev = e.valueAt(id, 4);
      expect(e.value(id)).toBe(prev + speed * model.def.dt * (inf.desired! - prev));
    }
  });
});

describe('levers and shocks', () => {
  test('a setting bound to a parameter moves it; replace and scale work', () => {
    const e = fresh();
    e.setLever('taxRate', 2);
    const inf = e.influences('taxes');
    expect(inf.params.find((p) => p.id === 'taxShift')!.value).toBeCloseTo(0.02, 15);
    expect(e.leverValue('taxRate')).toBe(2);
    e.setLever('taxRate', 99); // clamped to the lever's range
    expect(e.leverValue('taxRate')).toBe(3);
    expect(() => e.setLever('wageSettlement', 1)).toThrow(/one-off/);
    expect(() => e.fire('taxRate', 1)).toThrow(/setting/);
  });

  test('a choice lever takes the nearest option; a tie goes to the higher one', () => {
    const e = fresh();
    e.setLever('stabilisers', 0.4);
    expect(e.leverValue('stabilisers')).toBe(0);
    e.setLever('stabilisers', 0.5); // as Math.round and isAutomatic read it: Automatic
    expect(e.leverValue('stabilisers')).toBe(1);
    expect(e.stabilisers()[0].automatic).toBe(true);
    e.setLever('stabilisers', 7); // clamped to the range first
    expect(e.leverValue('stabilisers')).toBe(1);
    e.load({ modelId: 'reference', events: [{ t: 0, lever: 'stabilisers', value: 0.3 }], months: 1 });
    expect(e.events).toEqual([{ t: 0, lever: 'stabilisers', value: 0 }]);
    const withOptions: ModuleDef = {
      id: 'choice',
      label: 'x',
      description: 'x',
      levers: [
        { id: 'pick', label: 'x', group: 'Policy', kind: 'choice', unit: 'x', default: 0, min: -10, max: 10, options: [{ value: 0, label: 'a' }, { value: 2, label: 'b' }, { value: 5, label: 'c' }], description: 'x', definition: 'x' },
      ],
    };
    const t = createEngine(tinyModel([withOptions]));
    for (const [v, want] of [[0.9, 0], [1, 2], [3.4, 2], [3.5, 5], [9, 5], [-4, 0]]) {
      t.setLever('pick', v);
      expect(t.leverValue('pick')).toBe(want);
    }
  });

  test('a one-off shock changes a lagged state variable and is felt this step', () => {
    const e = fresh();
    e.fire('wageSettlement', 10);
    e.step();
    expect(e.value('wage')).toBeGreaterThan(1.099);
  });

  test('a ShockApi write to a stock is rejected', () => {
    const bad: ModuleDef = {
      id: 'bad',
      label: 'bad',
      description: 'bad',
      levers: [
        { id: 'printMoney', label: 'x', group: 'Economy', kind: 'oneoff', unit: 'x', default: 1, description: 'x', definition: 'x', fire: (s, n) => s.setLagged('deposits', n) },
        { id: 'printMoney2', label: 'x', group: 'Economy', kind: 'oneoff', unit: 'x', default: 1, description: 'x', definition: 'x', fire: (s, n) => s.setLagged('deposits:HH', n) },
        { id: 'noEffect', label: 'x', group: 'Economy', kind: 'oneoff', unit: 'x', default: 1, description: 'x', definition: 'x', fire: (s, n) => s.setLagged('spend', n) },
      ],
    };
    const e = createEngine(tinyModel([bad]));
    expect(() => e.fire('printMoney')).toThrow(/instrument.*flow postings/);
    expect(() => e.fire('printMoney2')).toThrow(/instrument/);
    expect(() => e.fire('noEffect')).toThrow(/lag\(\)/);
    expect(e.stock('deposits', 'HH')).toBe(50);
  });
});

describe('runtime guards', () => {
  test('in dev mode an undeclared read the dry run missed is caught at runtime', () => {
    const sneaky: ModuleDef = {
      id: 'sneaky',
      label: 'x',
      description: 'x',
      vars: [variable('z')],
      rules: [rule({ id: 'z', target: 'z', compute: (c) => (c.t > 0.2 ? c.v('spend') : 1) })],
      indicators: [{ id: 'z', label: 'z', group: 'x', unit: 'x', display: 'level', compute: (c) => c.v('z'), description: 'z' }],
    };
    const dev = createEngine(tinyModel([sneaky]));
    expect(() => dev.step(12)).toThrow(/reads v\('spend'\) without declaring it in 'inputs'/);
    const prod = createEngine(tinyModel([sneaky]), { dev: false });
    prod.step(12);
    expect(prod.value('z')).toBe(10);
  });

  test('a block Gauss–Seidel cannot solve falls back to Newton', () => {
    // x = 1.5 y + 1, y = 1.2 x − 3: Gauss–Seidel diverges (gain 1.8), the solution is x = 4.375, y = 2.25
    const loop: ModuleDef = {
      id: 'loop',
      label: 'x',
      description: 'x',
      vars: [variable('x', 8), variable('y', 7)],
      params: [param('k', 1.5)],
      rules: [
        rule({ id: 'x', target: 'x', inputs: ['y'], params: ['k'], compute: (c) => c.p('k') * c.v('y') + 1 }),
        rule({ id: 'y', target: 'y', inputs: ['x'], compute: (c) => 1.2 * c.v('x') - 3 }),
      ],
      indicators: [{ id: 'xy', label: 'xy', group: 'x', unit: 'x', display: 'level', compute: (c) => c.v('x') + c.v('y'), description: 'x' }],
      levers: [{ id: 'k', label: 'k', group: 'Economy', kind: 'setting', unit: 'x', default: 0, binds: { param: 'k', mode: 'add' }, description: 'x', definition: 'x' }],
    };
    const e = createEngine(tinyModel([loop]));
    expect(e.baseline('x')).toBeCloseTo(4.375, 9);
    e.step(3);
    expect(e.stats().newtonFallbacks).toBe(0); // starting at the solution, one sweep confirms it
    e.setLever('k', 0.1); // k = 1.6: x = 3.8 / 0.92, y = 1.2 x − 3
    e.step();
    expect(e.stats().newtonFallbacks).toBe(1);
    expect(e.value('x')).toBeCloseTo(3.8 / 0.92, 9);
    expect(e.value('y')).toBeCloseTo((1.2 * 3.8) / 0.92 - 3, 9);
  });

  test('a broken posting is recorded by default and throws on request', () => {
    const tamper = { afterPost: (L: { pos: Float64Array }, step: number) => void (step === 3 && (L.pos[0] += 1e-6)) };
    const e = createEngine(model, { baseline: base.baselineData, testHooks: tamper });
    e.step(5);
    const rep = e.checks();
    expect(rep.failures!.length).toBeGreaterThan(0);
    expect(rep.failures![0].t).toBe(3);
    expect(rep.failures!.map((f) => f.id)).toContain('stock-reconciliation');
    const strict = createEngine(model, { baseline: base.baselineData, testHooks: tamper, onCheckFailure: 'throw' });
    expect(() => strict.step(5)).toThrow(/accounting check failed at month 3/);
  });

  test('after a throw the month is complete, its events applied: stepping on matches a replay', () => {
    // move a little money between two depositors behind the ledger's back, once: month 3 fails
    // stock reconciliation and net worth, and every later month balances again
    const dep = model.instrumentIndex.get('deposits')! * model.NP;
    const [a, b] = ['HH', 'F'].map((p) => dep + model.playerIndex.get(p)!);
    const tamper = {
      afterPost: (L: { pos: Float64Array }, step: number) => {
        if (step !== 3) return;
        L.pos[a] += 1e-6;
        L.pos[b] -= 1e-6;
      },
    };
    const events: ScenarioEvent[] = [
      { t: 3, lever: 'govSpending', value: 1.5 },
      { t: 3, lever: 'wageSettlement', value: 5, fire: true },
    ];
    const strict = createEngine(model, { baseline: base.baselineData, testHooks: tamper, onCheckFailure: 'throw' });
    expect(() => strict.load({ modelId: 'reference', events, months: 12 })).toThrow(/accounting check failed at month 3/);
    expect(strict.t).toBe(3);
    expect(strict.leverValue('govSpending')).toBe(1.5);
    strict.step(9);
    const replay = createEngine(model, { baseline: base.baselineData, testHooks: tamper });
    replay.load({ modelId: 'reference', events, months: 12 });
    expect(allVars(strict, 12)).toEqual(allVars(replay, 12));
  });
});

describe('lag history', () => {
  const lags: ModuleDef = {
    id: 'lags',
    label: 'x',
    description: 'x',
    vars: [variable('long', 10), variable('past', 10)],
    rules: [
      rule({ id: 'long', target: 'long', lagInputs: ['spend'], compute: (c) => c.lag('spend', 40) }),
      rule({ id: 'past', target: 'past', lagInputs: ['spend'], compute: (c) => c.lag('spend', 3) }),
    ],
  };

  test('EngineOptions.lagWindow reaches the baseline solver too', () => {
    const e = createEngine(tinyModel([lags]), { lagWindow: 48 });
    expect(e.baseline('long')).toBe(10);
    e.step(40);
    expect(e.value('long')).toBe(10);
    // without it, the solver's error names the real cause
    expect(() => createEngine(tinyModel([lags]))).toThrow(/first step from the initial guess failed \(lag\(spend, 40\): k must be a whole number from 1 to 25\)/);
  });

  test('initHistory: month 0 is lag 1, the history lag 2 onwards, and older slots keep its oldest value', () => {
    const m = compile(tinyModel([lags]), {});
    const M = new Machine(m, { lagWindow: 48 });
    const spend = m.varIndex.get('spend')!;
    const now = new Float64Array(m.NV).fill(7);
    M.initHistory(now, new Map([[spend, [6, 5, 4]]]));
    expect([1, 2, 3, 4, 5, 48].map((k) => M.lagValue(spend, k))).toEqual([7, 6, 5, 4, 4, 4]);
    const tax = m.varIndex.get('tax')!;
    expect([1, 2, 48].map((k) => M.lagValue(tax, k))).toEqual([7, 7, 7]); // no history: flat
    expect(() => M.initHistory(now, new Map([[spend, new Array(48).fill(1)]]))).toThrow(/reaches back only 47 months/);
    expect(() => M.initHistory(now, new Map([[spend, [1, NaN]]]))).toThrow(/'spend' at month -2 is not a finite number/);
  });
});

describe('views', () => {
  test('pipes aggregate legs by player or group, keeping directions and kinds apart', () => {
    const e = fresh();
    const pipes = e.pipes('player');
    const fToHH = pipes.find((p) => p.from === 'F' && p.to === 'HH' && p.kind === 'cash')!;
    expect(fToHH.legs.map((l) => l.flow).sort()).toEqual(['dividends', 'wages']);
    expect(fToHH.value).toBeCloseTo(e.value('wages') + e.value('firmDividends'), 12);
    expect(pipes.find((p) => p.from === 'HH' && p.to === 'F')).toBeDefined(); // the other direction is its own pipe
    expect(pipes.find((p) => p.from === 'F' && p.to === 'F' && p.kind === 'writeoff')).toBeDefined();
    const groups = e.pipes('group');
    expect(groups.find((p) => p.from === 'Firms' && p.to === 'Households')!.value).toBeCloseTo(fToHH.value, 12);
  });

  test('balance sheets list assets and liabilities, and net worth sums them', () => {
    const e = fresh();
    const bs = e.balanceSheet('B');
    const a = bs.assets.reduce((s, x) => s + x.value, 0);
    const l = bs.liabilities.reduce((s, x) => s + x.value, 0);
    expect(bs.netWorth).toBeCloseTo(a - l, 12);
    expect(bs.netWorth).toBeCloseTo(e.value('bankEquity'), 9);
  });

  test('feed messages carry the id of the feed rule behind them', () => {
    const e = fresh();
    e.setLever('keyRateAddon', 1);
    e.step(6);
    const up = e.feed().find((f) => f.message === 'The central bank raises its key rate');
    expect(up).toMatchObject({ rule: 'rateUp', indicator: 'keyRate', concept: 'taylor-rule' });
    expect(up!.stabiliser).toBeUndefined();
  });

  test('indicators are shown as deviations from baseline', () => {
    const e = fresh();
    expect(e.indicator('output')).toBe(0);
    e.setLever('govSpending', 1);
    e.step(12);
    expect(e.indicator('output')).toBeGreaterThan(0);
    expect(e.series('output').length).toBe(13);
    expect(e.series('gdp').length).toBe(13); // variables have series too
  });
});
