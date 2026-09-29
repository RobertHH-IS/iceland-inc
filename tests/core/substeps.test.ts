/**
 * Sub-steps (ModelDef.substeps, decision 0011): N kernel steps a month, with the accounting exact
 * at every one of them, and what a month shows independent of N (the display contract).
 */
import { describe, expect, test } from 'bun:test';
import { compile, CompileError } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { Machine } from '../../src/core/machine.ts';
import type { ModelDef, ModuleDef } from '../../src/core/types.ts';
import { param, rule, tinyModel, variable } from './fixtures.ts';

/**
 * The tiny model plus a wage index that grows at `growth` a year (a 'first' term carried in and a
 * 'sum' term per step), spending that rises through the month (so its sub-steps differ), and a
 * rule whose regime holds only at every other kernel step.
 */
function stepped(N?: number): ModelDef {
  const extra: ModuleDef = {
    id: 'stepped',
    label: 'Stepped',
    description: 'terms, legs and regimes across sub-steps',
    vars: [variable('wage', 1, 'price'), variable('parity', 0, 'ratio')],
    params: [param('growth', 0)],
    rules: [
      rule({
        id: 'wage',
        target: 'wage',
        category: 'IDENTITY',
        lagInputs: ['wage'],
        params: ['growth'],
        terms: [
          { id: 'previous', label: 'Last month’s wage', month: 'first', compute: (c) => c.lag('wage') },
          { id: 'growth', label: 'Growth this month', month: 'sum', compute: (c) => c.lag('wage') * (Math.exp(c.p('growth') * c.dt) - 1) },
          { id: 'level', label: 'A level', compute: (c) => 0 * c.lag('wage') },
        ],
      }),
      rule({
        id: 'parity',
        target: 'parity',
        category: 'IDENTITY',
        terms: [{ id: 'step', label: 'The kernel step', compute: (c) => Math.round(c.t / c.dt) % 2 }],
        combine: (t) => t.step,
        regime: (_c, _v, t) => (t.step === 0 ? 'Even step binds' : null),
      }),
    ],
    levers: [
      { id: 'growth', label: 'Growth', group: 'G', kind: 'setting', unit: '%', default: 0, min: -20, max: 20, binds: { param: 'growth', mode: 'replace', scale: 0.01 }, description: 'wage growth', definition: 'Wage growth a year, persistent while set.' },
      { id: 'ramp', label: 'Ramp', group: 'G', kind: 'setting', unit: 'pp', default: 0, min: 0, max: 10, binds: { param: 'ramp', mode: 'add', scale: 1 }, description: 'spending ramp', definition: 'Spending rises by this much a year from the start, persistent while set.' },
    ],
  };
  const def = tinyModel([extra], {
    params: [param('level', 10), param('ramp', 0)],
    rules: [
      // spending rises through time once the ramp is set, so a month's kernel steps differ
      rule({ id: 'spend', target: 'spend', category: 'POLICY', params: ['level', 'ramp'], compute: (c) => c.p('level') + c.p('ramp') * c.t }),
      rule({ id: 'tax', target: 'tax', category: 'POLICY', inputs: ['spend'], compute: (c) => 0.5 * c.v('spend') + 5 }),
    ],
  });
  return N === undefined ? def : { ...def, substeps: N };
}

describe('ModelDef.substeps', () => {
  test('must be a whole number of at least 1', () => {
    for (const bad of [0, 1.5, -2]) expect(() => compile(stepped(bad))).toThrow(CompileError);
    expect(() => compile(stepped(3))).not.toThrow();
  });

  test('rules see dt ÷ N; the engine counts months; one step a month is the default, bit for bit', () => {
    const seen: number[] = [];
    const def = stepped(2);
    const m = def.modules.find((x) => x.id === 'stepped')!;
    m.rules![0] = { ...m.rules![0], terms: [...m.rules![0].terms!, { id: 'dt', label: 'dt', compute: (c) => (seen.push(c.dt), 0) }] };
    const e = createEngine(def);
    e.step(3);
    expect(e.t).toBe(3);
    expect(seen.at(-1)).toBeCloseTo(1 / 24, 15);
    expect(e.stats().substeps).toBe(2);
    expect(e.stats().steps).toBe(3);
    // an explicit 1 is the default
    const a = createEngine(stepped()),
      b = createEngine(stepped(1));
    for (const x of [a, b]) {
      x.setLever('growth', 5);
      x.setLever('ramp', 3);
      x.step(24);
    }
    for (const id of ['wage', 'spend', 'tax']) expect(b.value(id)).toBe(a.value(id));
    expect(b.stock('deposits', 'HH')).toBe(a.stock('deposits', 'HH'));
  });
});

describe('the accounting is exact at every sub-step', () => {
  test('each kernel step balances; the month keeps the worst residual', () => {
    const e = createEngine(stepped(4));
    e.setLever('ramp', 6);
    e.step(36);
    expect(e.checks().failures).toEqual([]);
    expect(Math.max(...e.maxResiduals().map((r) => r.residual))).toBeLessThan(1e-12);
  });

  test('a posting broken in the first sub-step of a month is caught, though the month ends balanced', () => {
    // break a position in sub-step 0 of month 2 and mend it in sub-step 1: the month's end balances
    const hooks = {
      afterPost: (L: { pos: Float64Array }, month: number, s: number) => {
        if (month === 2 && s === 0) L.pos[0] += 1e-6;
        if (month === 2 && s === 1) L.pos[0] -= 1e-6;
      },
    };
    const e = createEngine(stepped(2), { testHooks: hooks });
    e.step(3);
    const f = e.checks().failures!;
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.t === 2)).toBe(true);
  });
});

describe('the display contract', () => {
  test('a leg is the month’s total ÷ dt: the mean of its sub-steps, and stocks move by exactly that', () => {
    const N = 4;
    const amounts: number[] = [];
    const e = createEngine(stepped(N), { testHooks: { afterSubstep: (_m, _s, r) => void amounts.push(r.value('spend')) } });
    e.setLever('ramp', 12);
    e.step(5);
    amounts.length = 0;
    const hh0 = e.stock('deposits', 'HH');
    e.step(1);
    expect(amounts.length).toBe(N);
    expect(amounts[N - 1]).toBeGreaterThan(amounts[0]); // the sub-steps differ
    const spend = e.legs().find((l) => l.flow === 'spend')!;
    const tax = e.legs().find((l) => l.flow === 'tax')!;
    expect(spend.amount).toBe('spend');
    expect(spend.value).toBeCloseTo(amounts.reduce((a, b) => a + b, 0) / N, 12);
    expect(spend.value).not.toBeCloseTo(e.value('spend'), 6); // not the month-end rate
    // the household's deposits change by the month's total of its legs
    expect(e.stock('deposits', 'HH') - hh0).toBeCloseTo(((spend.value - tax.value) * 1) / 12, 12);
    // pipes and flow influences show the same month total
    const pipe = e.pipes('player').find((p) => p.from === 'G' && p.to === 'HH')!;
    expect(pipe.value).toBe(spend.value);
    expect(e.influences('flow:spend').value).toBe(spend.value);
    // month 0 shows the baseline
    e.seek(0);
    expect(e.legs().find((l) => l.flow === 'spend')!.value).toBe(10);
  });

  test('a ‘sum’ term shows the month’s total and a ‘first’ term where it started, so they add up to the month’s end', () => {
    const N = 2;
    const growth: number[] = [];
    const e = createEngine(stepped(N), { testHooks: { afterSubstep: (_m, _s, r) => void growth.push(r.value('wage')) } });
    e.setLever('growth', 12);
    e.step(3);
    const start = e.valueAt('wage', 2);
    const inf = e.influences('wage');
    const term = (id: string) => inf.terms.find((t) => t.id === id)!;
    expect(term('previous').value).toBe(start);
    expect(term('growth').value).toBeCloseTo(e.value('wage') - start, 15);
    expect(term('previous').value + term('growth').value + term('level').value).toBeCloseTo(e.value('wage'), 15);
    // a 'sum' term's baseline is N × its baseline per step (0 here); the month-end value is the last step's
    expect(e.value('wage')).toBe(growth.at(-1)!);
  });

  test('a per-step term shows the same month at 1, 2 and 4 sub-steps, to within the first-order error', () => {
    const shown = [1, 2, 4].map((N) => {
      const e = createEngine(stepped(N));
      e.setLever('growth', 12);
      e.step(6);
      return e.influences('wage').terms.find((t) => t.id === 'growth')!.value;
    });
    // the growth term is 1% of the wage a month; shown per kernel step it would halve with each
    // doubling of N. Summed over the month it does not move at all here, since growth compounded
    // over the sub-steps is exactly the month's growth.
    expect(shown[0]).toBeGreaterThan(0.009);
    for (const v of shown) expect(v / shown[0]).toBeCloseTo(1, 12);
  });

  test('a regime binds for the month if it binds in any sub-step, and a switch within the month is flagged', () => {
    const r = compile(stepped(2)).ruleIndex.get('parity')!;
    const e = createEngine(stepped(2));
    e.step(4);
    for (let t = 1; t <= 4; t++) {
      expect(e.regimesAt(t)[r]).toBe('Even step binds');
      expect(e.regimeSwitchesAt(t)).toEqual([r]);
    }
    const inf = e.influences('parity');
    expect(inf.regime).toBe('Even step binds');
    expect(inf.regimeSwitched).toBe(true);
    // at one step a month nothing switches within a month
    const one = createEngine(stepped(1));
    one.step(4);
    for (let t = 1; t <= 4; t++) expect(one.regimeSwitchesAt(t)).toEqual([]);
    expect(one.influences('parity').regimeSwitched).toBeUndefined();
  });
});

describe('time travel with sub-steps', () => {
  test('seek and fork replay the months bit for bit: values, legs, terms and regimes', () => {
    const e = createEngine(stepped(3));
    e.setLever('growth', 7);
    e.setLever('ramp', 4);
    e.step(30);
    const at = (x: typeof e) => [x.value('wage'), x.value('spend'), x.stock('deposits', 'HH'), ...x.legs().map((l) => l.value), ...x.influences('wage').terms.map((t) => t.value)];
    const end = at(e);
    const f = e.fork();
    expect(at(f)).toEqual(end);
    e.seek(17);
    const mid = at(e);
    e.seek(30);
    expect(at(e)).toEqual(end);
    e.seek(17);
    expect(at(e)).toEqual(mid);
    expect(e.regimesAt(17)).toEqual(f.regimesAt(17));
  });
});

describe('the lag history before month 0', () => {
  test('with N sub-steps a month, each month fills N slots, read along the line between months', () => {
    const def = { ...tinyModel(), substeps: 2 };
    const m = compile(def);
    const M = new Machine(m);
    const now = new Float64Array(m.NV).fill(10);
    const k = m.varIndex.get('spend')!;
    M.initHistory(now, new Map([[k, [8, 6]]]));
    // lag 1 is month 0; lag 2 half a month back; lag 3 month −1; lag 4 halfway to month −2; lag 5 month −2
    expect([1, 2, 3, 4, 5, 6].map((j) => M.lagValue(k, j))).toEqual([10, 9, 8, 7, 6, 6]);
  });
});

describe('errors name the month', () => {
  test('a block that cannot be solved names its month and the sub-step within it', () => {
    // x = k y + 1, y = x: solved at k = 0 (x = y = 1); at k = 1 there is no solution
    const loop: ModuleDef = {
      id: 'loop',
      label: 'x',
      description: 'x',
      vars: [variable('x', 1), variable('y', 1)],
      params: [param('k', 0)],
      rules: [
        rule({ id: 'x', target: 'x', inputs: ['y'], params: ['k'], compute: (c) => c.p('k') * c.v('y') + 1 }),
        rule({ id: 'y', target: 'y', inputs: ['x'], compute: (c) => c.v('x') }),
      ],
      indicators: [{ id: 'xy', label: 'xy', group: 'x', unit: 'x', display: 'level', compute: (c) => c.v('x') + c.v('y'), description: 'x' }],
      levers: [{ id: 'k', label: 'k', group: 'Economy', kind: 'setting', unit: 'x', default: 0, binds: { param: 'k', mode: 'add' }, description: 'x', definition: 'x' }],
    };
    for (const [N, where] of [
      [1, /did not converge in month 3 \(/],
      [2, /did not converge in month 3, sub-step 1 of 2 \(/],
    ] as const) {
      const e = createEngine({ ...tinyModel([loop]), substeps: N });
      e.step(2);
      e.setLever('k', 1);
      expect(() => e.step()).toThrow(where);
    }
  });
});
