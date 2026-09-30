/**
 * Stabilisers and their padlocks (decisions 0004 and 0010): the contract's validation in the
 * compiler; the padlock rules in the engine (locking freezes the lever at the value in force,
 * setting an unlocked lever locks it, unlocking hands it back to the rule), Engine.stabilisers()
 * and the narration, on a tiny model with one rule; then the Iceland model's promise that a locked
 * policy lever stays where it is set.
 */
import { describe, expect, test } from 'bun:test';
import { compile, CompileError } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { lockAll } from '../../src/core/scenario.ts';
import type { LeverDef, ModelDef, ModuleDef, StabiliserDef } from '../../src/core/types.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { stepByStep, stepsAMonth } from '../../src/models/iceland/testing.ts';
import { rule, tinyModel } from './fixtures.ts';

const setting = (l: Partial<LeverDef> & Pick<LeverDef, 'id'>): LeverDef => ({
  label: l.id,
  group: 'Policy',
  kind: 'setting',
  unit: '%',
  default: 0,
  description: l.id,
  definition: 'Level, persistent while set; setting it back removes it.',
  ...l,
});

const RULE: StabiliserDef = {
  id: 'theRule',
  label: 'The rule',
  lever: 'rate',
  suggestion: 'ruleSays',
  current: (c) => c.v('policyRate'),
  threshold: 0.125,
  description: 'A rule that says 3% plus the pressure.',
  feed: { raise: 'The rule would raise the rate to {value}%', lower: 'The rule would cut the rate to {value}% ({change} pp)', indicator: 'rateNow' },
};

/** A policy rate set by a rule (unlocked, the default) or held by the user (locked). */
function policyModule(over: Partial<ModuleDef> = {}): ModuleDef {
  return {
    id: 'policy',
    label: 'Policy',
    description: 'A rate and the rule that would set it.',
    vars: [
      { id: 'pressure', label: 'Pressure', unit: 'pp', kind: 'exogenous', initial: 0 },
      { id: 'ruleSays', label: 'What the rule says', unit: '%', kind: 'rate', initial: 3 },
      { id: 'policyRate', label: 'Policy rate', unit: '%', kind: 'rate', initial: 3 },
    ],
    rules: [
      rule({ id: 'ruleSays', target: 'ruleSays', category: 'POLICY', inputs: ['pressure'], compute: (c) => 3 + c.v('pressure') }),
      rule({
        id: 'policyRate',
        target: 'policyRate',
        category: 'POLICY',
        inputs: ['ruleSays'],
        levers: ['rate'],
        locks: ['theRule'],
        compute: (c) => (c.locked('theRule') ? c.lever('rate') : c.v('ruleSays')),
      }),
    ],
    levers: [
      setting({ id: 'rate', default: 3, min: 0, max: 15, step: 0.25 }),
      setting({ id: 'pressure', unit: 'pp', group: 'World', binds: { variable: 'pressure', mode: 'replace' }, default: 0 }),
      { id: 'kick', label: 'Kick', group: 'World', kind: 'oneoff', unit: 'pp', default: 1, description: 'kick', definition: 'One-off: nothing, for tests.', fire: () => {} },
      setting({ id: 'mode', kind: 'choice', unit: 'mode', min: 0, max: 1, step: 1, options: [{ value: 0, label: 'A' }, { value: 1, label: 'B' }] }),
    ],
    indicators: [{ id: 'rateNow', label: 'Rate', group: 'Overview', unit: 'pp vs baseline', display: 'deviation', compute: (c) => c.v('policyRate'), description: 'the rate' }],
    stabilisers: [RULE],
    ...over,
  };
}

const stabModel = (over: Partial<ModuleDef> = {}): ModelDef => tinyModel([policyModule(over)]);

const errorsOf = (def: ModelDef): string[] => {
  try {
    compile(def);
    return [];
  } catch (e) {
    if (e instanceof CompileError) return e.errors;
    throw e;
  }
};

describe('compiler: stabilisers and their padlocks', () => {
  test('a valid model compiles, publishes its stabilisers and adds a padlock for each one’s lever', () => {
    const m = compile(stabModel());
    expect(m.stabilisers.map((s) => s.id)).toEqual(['theRule']);
    const lock = m.levers.find((l) => l.kind === 'lock')!;
    expect(lock).toMatchObject({ id: 'rateLock', default: 0, min: 0, max: 1, locks: { lever: 'rate', stabiliser: 'theRule' }, group: 'Policy' });
    expect(lock.options).toEqual([
      { value: 0, label: 'Unlocked' },
      { value: 1, label: 'Locked' },
    ]);
    expect(lock.description).toContain('The rule');
    expect(lock.definition).toContain('Unlocking hands the lever back to the rule');
    expect(m.levers.map((l) => l.id).at(-1)).toBe('rateLock'); // after the declared levers
    expect(m.cstabilisers[0].lock).toBe(m.leverIndex.get('rateLock')!);
    expect(m.warnings.filter((w) => w.includes('ruleSays') || w.includes('rateLock'))).toEqual([]); // a suggestion counts as read
  });

  test('every reference must resolve: a setting to lock, a variable for the suggestion, a value in force', () => {
    const bad = (s: Partial<StabiliserDef>) => errorsOf(stabModel({ stabilisers: [{ ...RULE, ...s }] })).join('\n');
    expect(bad({ lever: 'nope' })).toContain("acts on unknown lever 'nope'");
    expect(bad({ lever: 'kick' })).toContain("acts on one-off lever 'kick'");
    expect(bad({ lever: 'mode' })).toContain("acts on 'mode', which is a choice; a stabiliser moves a setting");
    expect(bad({ suggestion: 'nope' })).toContain("suggests unknown variable 'nope'");
    expect(bad({ threshold: 0 })).toContain('needs a positive threshold');
    expect(bad({ current: undefined })).toContain('needs current()');
    expect(bad({ current: (c) => c.v('nope') })).toContain("current() reads unknown variable 'nope'");
    expect(bad({ feed: { raise: 'x', lower: 'y', indicator: 'nope' } })).toContain("feed opens unknown indicator 'nope'");
    expect(bad({ description: '' })).toContain('needs a description');
  });

  test('a lever has one padlock: two stabilisers cannot move one lever, and a model cannot declare a padlock itself', () => {
    expect(errorsOf(stabModel({ stabilisers: [RULE, { ...RULE, id: 'another' }] })).join()).toContain("which stabiliser 'theRule' already moves; a lever has one padlock");
    const mod = policyModule();
    mod.levers = [...mod.levers!, setting({ id: 'myLock', kind: 'lock' })];
    expect(errorsOf(tinyModel([mod])).join()).toContain("lever 'myLock' (module 'policy') has kind 'lock'; padlocks are added by the compiler");
  });

  test('levers kept off the panel (shown: false, decision 0017): never a lever with a padlock, never a whole section, and shown is true or false', () => {
    const hide = (ids: string[], shown: unknown = false) => {
      const mod = policyModule();
      mod.levers = mod.levers!.map((l) => (ids.includes(l.id) ? { ...l, shown: shown as boolean } : l));
      return tinyModel([mod]);
    };
    // 'pressure' and 'kick' share the section World (their group); hiding one leaves the other
    const m = compile(hide(['pressure']));
    expect(m.levers.find((l) => l.id === 'pressure')!.shown).toBe(false);
    expect(m.levers.find((l) => l.id === 'kick')!.shown).toBeUndefined();
    expect(m.levers.find((l) => l.id === 'rateLock')!.shown).toBeUndefined(); // padlocks are drawn beside their levers
    expect(errorsOf(hide(['rate'])).join()).toContain("stabiliser 'theRule' (module 'policy') acts on 'rate', which is not shown; a lever with a padlock stays in the lever panel");
    expect(errorsOf(hide(['pressure', 'kick'])).join()).toContain("every lever of section 'World' has shown: false; a section keeps at least one lever in the lever panel");
    expect(errorsOf(hide(['pressure'], 'no')).join()).toContain(`lever 'pressure' (module 'policy') has shown = "no"; it must be true or false`);
    expect(errorsOf(hide(['pressure'], true))).toEqual([]);
  });

  test('a rule reads a padlock with locked(), declared in locks, never as a lever', () => {
    const withRule = (r: Parameters<typeof rule>[0]) => {
      const mod = policyModule();
      mod.rules = [mod.rules![0], rule(r)];
      return errorsOf(tinyModel([mod])).join('\n');
    };
    const base = { id: 'policyRate', target: 'policyRate', category: 'POLICY' as const, inputs: ['ruleSays'], levers: ['rate'] };
    expect(withRule({ ...base, compute: (c) => (c.locked('theRule') ? c.lever('rate') : c.v('ruleSays')) })).toContain("reads locked('theRule') without declaring it in locks");
    expect(withRule({ ...base, locks: ['nope'], compute: (c) => c.v('ruleSays') })).toContain("declares the padlock of unknown stabiliser 'nope' in locks");
    expect(withRule({ ...base, levers: ['rate', 'rateLock'], compute: (c) => c.lever('rateLock') })).toContain("reads padlock 'rateLock' as a lever; read it with locked()");
    // a model whose rules read no padlock compiles, with a warning that locking changes nothing
    const mod = policyModule();
    mod.rules = [mod.rules![0], rule({ ...base, compute: (c) => c.lever('rate') })];
    expect(compile(tinyModel([mod])).warnings.join()).toContain('no rule reads a padlock');
  });

  test('a shadow may drive nothing while its stabiliser is locked', () => {
    const shadowed = (reader: boolean) => {
      const mod = policyModule({ stabilisers: [{ ...RULE, shadow: ['echo'] }] });
      mod.vars = [...mod.vars!, { id: 'echo', label: 'echo', unit: '%', kind: 'rate', initial: 3 }, { id: 'user', label: 'user', unit: '%', kind: 'rate', initial: 3 }];
      mod.rules = [
        ...mod.rules!,
        rule({ id: 'echo', target: 'echo', category: 'POLICY', inputs: ['ruleSays'], compute: (c) => c.v('ruleSays') }),
        rule({ id: 'user', target: 'user', inputs: ['echo'], locks: ['theRule'], compute: (c) => (reader || !c.locked('theRule') ? c.v('echo') : 3) }),
      ];
      return errorsOf(tinyModel([mod])).join('\n');
    };
    expect(shadowed(false)).toBe('');
    expect(shadowed(true)).toContain("declares 'echo' a shadow, but rule 'user' reads it while the stabiliser is locked");
  });
});

describe('engine: padlocks', () => {
  const model = compile(stabModel());

  test('unlocked, the default: the rule sets the policy, and the lever reports the live value', () => {
    const e = createEngine(model);
    expect(e.stabilisers()).toEqual([{ id: 'theRule', label: 'The rule', lever: 'rate', lock: 'rateLock', locked: false, suggested: 3, current: 3, gap: 0, calling: false, description: RULE.description }]);
    e.setLever('pressure', 0.6);
    e.step(1);
    expect(e.value('policyRate')).toBeCloseTo(3.6, 12);
    expect(e.stabilisers()[0]).toMatchObject({ locked: false, current: e.value('policyRate'), calling: false });
    expect(e.leverValue('rate')).toBe(3); // the stored level waits until the lever is locked
  });

  test('locking freezes the lever at the value in force: no jump, and the rule only suggests', () => {
    const e = createEngine(model);
    e.setLever('pressure', 0.6);
    e.step(1);
    const inForce = e.value('policyRate');
    e.setLever('rateLock', 1);
    expect(e.leverValue('rate')).toBe(inForce);
    expect(e.events.map((x) => x.lever)).toEqual(['pressure', 'rateLock']); // a lock is an ordinary event
    e.setLever('pressure', 1.5);
    e.step(1);
    expect(e.value('policyRate')).toBe(inForce);
    expect(e.stabilisers()[0]).toMatchObject({ locked: true, current: inForce, suggested: 4.5, calling: true });
    expect(e.stabilisers()[0].gap).toBeCloseTo(4.5 - inForce, 12);
  });

  test('locking an untouched lever at the baseline keeps its default exactly (the value in force is within LOCK_SNAP)', () => {
    const mod = policyModule({ stabilisers: [{ ...RULE, current: (c) => c.v('policyRate') * (1 + 1e-15) }] });
    const e = createEngine(tinyModel([mod]));
    e.setLever('rateLock', 1);
    expect(e.leverValue('rate')).toBe(3);
  });

  test('setting an unlocked lever takes control: the padlock closes at the new value, in replays too', () => {
    const e = createEngine(model);
    e.setLever('pressure', 1);
    e.setLever('rate', 5);
    expect(e.stabilisers()[0].locked).toBe(true);
    expect(e.events.map((x) => x.lever)).toEqual(['pressure', 'rate']); // no separate lock event
    e.step(2);
    expect(e.value('policyRate')).toBe(5);
    const replay = createEngine(model);
    replay.load({ modelId: model.def.id, events: e.events, months: 2 });
    expect(replay.value('policyRate')).toBe(5);
    expect(replay.stabilisers()[0].locked).toBe(true);
  });

  test('Apply sets the lever to the suggestion and keeps it locked; the call stops', () => {
    const e = createEngine(model);
    lockAll(e);
    e.setLever('pressure', 0.6);
    e.step(1);
    expect(e.stabilisers()[0].calling).toBe(true);
    e.setLever('rate', 3.5); // Apply, rounded to a quarter point: within the threshold
    expect(e.stabilisers()[0]).toMatchObject({ locked: true, calling: false });
    e.step(1);
    expect(e.value('policyRate')).toBe(3.5);
  });

  test('unlocking hands the lever back to its rule, and nothing calls while unlocked', () => {
    const e = createEngine(model);
    e.setLever('rate', 5);
    e.setLever('pressure', 3);
    e.step(1);
    expect(e.stabilisers()[0].calling).toBe(true);
    e.setLever('rateLock', 0);
    expect(e.stabilisers()[0]).toMatchObject({ locked: false, calling: false });
    e.step(1);
    expect(e.value('policyRate')).toBe(6); // the rule's value: 3 + 3
    expect(e.leverValue('rate')).toBe(5); // the lever keeps its stored level, which no longer counts
    e.setLever('pressure', 0);
    e.step(1);
    expect(e.value('policyRate')).toBe(3);
  });

  test('locks replay, rewind and fork like any lever event', () => {
    const e = createEngine(model);
    e.setLever('pressure', 1);
    e.step(12);
    e.setLever('rateLock', 1);
    e.step(12);
    e.setLever('pressure', -1);
    e.step(6);
    e.setLever('rateLock', 0);
    e.step(6);
    const path = e.series('policyRate').map((p) => p.v);
    expect(path[20]).toBe(4); // held at the rule's value in month 12
    expect(path[36]).toBe(2);
    e.seek(18);
    expect(e.stabilisers()[0].locked).toBe(true);
    expect(e.value('policyRate')).toBe(4);
    e.seek(36);
    expect(e.series('policyRate').map((p) => p.v)).toEqual(path);
    expect(e.fork().series('policyRate').map((p) => p.v)).toEqual(path);
    const replay = createEngine(model);
    replay.load({ modelId: model.def.id, events: e.events, months: 36 });
    expect(replay.series('policyRate').map((p) => p.v)).toEqual(path);
  });

  test('narration: a locked stabiliser that starts calling says so, with the numbers', () => {
    const e = createEngine(model);
    lockAll(e);
    e.setLever('pressure', 0.1);
    e.step(1);
    expect(e.stabilisers()[0]).toMatchObject({ suggested: 3.1, calling: false });
    e.setLever('pressure', 0.5);
    e.step(1);
    expect(e.value('policyRate')).toBe(3);
    expect(e.stabilisers()[0].calling).toBe(true);
    // the message, and the parts an interface needs to write it in another language
    expect(e.feed().filter((f) => f.stabiliser)).toEqual([{ t: 2, message: 'The rule would raise the rate to 3.5%', indicator: 'rateNow', stabiliser: 'theRule', dir: 1, value: 3.5, change: 0.5 }]);
  });

  test('the narration is sparse: not when the user moved the lever, never a repeat within a year', () => {
    const e = createEngine(model);
    e.setLever('rate', 5); // the user's own move puts the lever far from the rule: calling, not narrated
    e.step(3);
    expect(e.stabilisers()[0].calling).toBe(true);
    expect(e.feed().filter((f) => f.stabiliser)).toEqual([]);
    e.setLever('rate', 3);
    e.step(1);
    for (let k = 0; k < 3; k++) {
      e.setLever('pressure', -1); // the rule moves away: one message …
      e.step(1);
      e.setLever('pressure', 0); // … back, and away again within the year: no repeat
      e.step(1);
    }
    const msgs = e.feed().filter((f) => f.stabiliser);
    expect(msgs.map((f) => f.message)).toEqual(['The rule would cut the rate to 2% (1 pp)']);
    expect(msgs[0]).toMatchObject({ dir: -1, value: 2, change: 1 });
    expect(msgs[0].rule).toBeUndefined();
    e.step(12);
    e.setLever('pressure', -1);
    e.step(1);
    expect(e.feed().filter((f) => f.stabiliser).length).toBe(2);
  });

  test('closing a padlock is not narrated as a call in the month it closes', () => {
    const e = createEngine(model);
    e.setLever('pressure', 1);
    e.step(1);
    e.setLever('rateLock', 1);
    e.step(1);
    e.setLever('pressure', 2); // the rule moves a point away from the frozen rate
    e.step(1);
    expect(e.feed().filter((f) => f.stabiliser).map((f) => f.t)).toEqual([3]);
  });

  test('seek and forks replay the narration exactly', () => {
    const e = createEngine(model);
    lockAll(e);
    e.step(1);
    e.setLever('pressure', 1);
    e.step(19);
    e.setLever('pressure', -1);
    e.step(20);
    const feed = e.feed();
    expect(feed.length).toBeGreaterThan(0);
    e.seek(15);
    e.seek(40);
    expect(e.feed()).toEqual(feed);
    expect(e.fork().feed()).toEqual(feed);
  });
});

describe('Iceland: a locked policy lever is held', () => {
  const e = createEngine(icelandModel);
  lockAll(e);

  test('income tax +1 pp with both levers locked leaves the key rate at exactly 3.000% for 20 years; the rule calls within 12 months', () => {
    e.setLever('incomeTax', 1);
    let firstCall = -1;
    for (let m = 1; m <= 240; m++) {
      e.step(1);
      expect(e.value('keyRate')).toBe(0.03);
      const rate = e.stabilisers().find((s) => s.id === 'keyRateRule')!;
      if (firstCall < 0 && rate.calling) firstCall = m;
    }
    expect(firstCall).toBeGreaterThan(0);
    expect(firstCall).toBeLessThanOrEqual(12);
    expect(e.feed().some((f) => f.stabiliser === 'keyRateRule' && f.t === firstCall && /cut the key rate/.test(f.message))).toBe(true);
  });

  test('the debt rule is a shadow while income tax is locked: computed, never applied', () => {
    const f = e.fork();
    const taxRate = f.value('taxRate');
    const tau0 = f.influences('taxRate').params.find((p) => p.id === 'tau0')!.value;
    expect(taxRate).toBe(tau0 + 0.01);
    expect(Math.abs(f.value('taxRuleAdjustment'))).toBeGreaterThan(1e-3);
  });

  test('both rules take over smoothly when unlocked: the first month moves each rate one month’s smoothed step from the rate held, a share of the gap at each kernel step', () => {
    // every kernel step of the month (decision 0011: two a month) closes its share of the gap
    const { engine: f, steps } = stepByStep(createEngine(icelandModel, { baseline: e.baselineData, dev: false }), (x) => ({
      key: x.value('keyRate'),
      keyTarget: x.value('ruleTarget'),
      tax: x.value('taxRate'),
      taxTarget: x.value('taxRuleTarget'),
    }));
    f.setLever('keyRate', 6); // locks the key rate
    f.setLever('incomeTax', -3); // and income tax
    f.step(36);
    const [key, tax] = [f.value('keyRate'), f.value('taxRate')];
    const N = stepsAMonth(f);
    const kKey = 1 - Math.exp(-f.influences('ruleRate').params.find((p) => p.id === 'lamPol')!.value / 12 / N);
    const kTax = 1 - Math.exp(-f.influences('taxRuleAdjustment').params.find((p) => p.id === 'lamTau')!.value / 12 / N);
    lockAll(f, false);
    steps.length = 0;
    f.step(1);
    expect(steps.length).toBe(N);
    let [k, x] = [key, -0.03]; // the rate and the tax shift in force before each step
    for (const s of steps) {
      expect(Math.abs(s.key - k - kKey * (s.keyTarget - k))).toBeLessThan(1e-12);
      const shift = x + kTax * (s.taxTarget - x);
      expect(Math.abs(s.tax - tax - (shift + 0.03))).toBeLessThan(1e-12);
      [k, x] = [s.key, shift];
    }
    expect(Math.abs(f.value('keyRate') - key)).toBeLessThan(0.005);
    expect(Math.abs(f.value('taxRate') - tax)).toBeLessThan(0.005);
  });

  test('locking the key rate alone leaves the debt rule acting, and the key-rate rule’s target still feeds its escape clause', () => {
    const m = e.model;
    const j = m.stabilisers.findIndex((s) => s.id === 'keyRateRule');
    const inert = [...m.inertByMask[1 << j]].map((v) => m.vars[v].id);
    expect(inert).toContain('ruleRate');
    expect(inert).not.toContain('ruleTarget'); // the debt rule's escape clause reads it
    expect(inert).not.toContain('taxRuleAdjustment');
    const all = [...m.inertByMask[(1 << m.stabilisers.length) - 1]].map((v) => m.vars[v].id);
    expect(all).toEqual(expect.arrayContaining(['ruleRate', 'ruleTarget', 'neutralRate', 'taxRuleAdjustment', 'taxRuleTarget']));
  });
});
