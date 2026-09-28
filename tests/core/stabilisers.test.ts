/**
 * Stabilisers and showWhen (decision 0004): the contract's validation in the compiler, and
 * Engine.stabilisers() and the stabiliser narration in the engine, on a tiny model with one
 * rule; then the Iceland model's promise that, on Manual, policy stays where it is set.
 */
import { describe, expect, test } from 'bun:test';
import { compile, CompileError } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import type { LeverDef, ModelDef, ModuleDef, StabiliserDef } from '../../src/core/types.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
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
  offset: 'offset',
  suggestion: 'ruleSays',
  threshold: 0.125,
  description: 'A rule that says 3% plus the pressure.',
  feed: { raise: 'The rule would raise the rate to {value}%', lower: 'The rule would cut the rate to {value}% ({change} pp)', indicator: 'rateNow' },
};

/** A policy rate set by the user (Manual) or by a rule plus an offset (Automatic). */
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
        levers: ['mode', 'rate', 'offset'],
        compute: (c) => (Math.round(c.lever('mode')) >= 1 ? c.v('ruleSays') + c.lever('offset') : c.lever('rate')),
      }),
    ],
    levers: [
      setting({ id: 'mode', kind: 'choice', unit: 'mode', min: 0, max: 1, step: 1, options: [{ value: 0, label: 'Manual' }, { value: 1, label: 'Automatic' }] }),
      setting({ id: 'rate', default: 3, step: 0.25, showWhen: { lever: 'mode', equals: 0 } }),
      setting({ id: 'offset', unit: 'pp', step: 0.25, showWhen: { lever: 'mode', equals: [1] } }),
      setting({ id: 'pressure', unit: 'pp', group: 'World', binds: { variable: 'pressure', mode: 'replace' }, default: 0 }),
      { id: 'kick', label: 'Kick', group: 'World', kind: 'oneoff', unit: 'pp', default: 1, description: 'kick', definition: 'One-off: nothing, for tests.', fire: () => {} },
    ],
    indicators: [{ id: 'rateNow', label: 'Rate', group: 'Overview', unit: 'pp vs baseline', display: 'deviation', compute: (c) => c.v('policyRate'), description: 'the rate' }],
    stabilisers: [RULE],
    ...over,
  };
}

function stabModel(over: Partial<ModuleDef> = {}, mode: ModelDef['stabiliserMode'] | null = { lever: 'mode', manual: 0, automatic: 1 }): ModelDef {
  const m = tinyModel([policyModule(over)]);
  return mode ? { ...m, stabiliserMode: mode } : m;
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

describe('compiler: showWhen, the stabiliser setting and stabilisers', () => {
  test('a valid model compiles and publishes its stabilisers and mode', () => {
    const m = compile(stabModel());
    expect(m.stabilisers.map((s) => s.id)).toEqual(['theRule']);
    expect(m.stabiliserMode).toEqual({ lever: 'mode', manual: 0, automatic: 1 });
    expect(m.warnings.filter((w) => w.includes('ruleSays'))).toEqual([]); // a suggestion counts as read
  });

  test('every reference must resolve to a setting or choice, and a variable for the suggestion', () => {
    const bad = (s: Partial<StabiliserDef>) => errorsOf(stabModel({ stabilisers: [{ ...RULE, ...s }] })).join('\n');
    expect(bad({ lever: 'nope' })).toContain("acts on unknown lever 'nope'");
    expect(bad({ lever: 'kick' })).toContain("acts on one-off lever 'kick'");
    expect(bad({ offset: 'nope' })).toContain("offsets with unknown lever 'nope'");
    expect(bad({ suggestion: 'nope' })).toContain("suggests unknown variable 'nope'");
    expect(bad({ threshold: 0 })).toContain('needs a positive threshold');
    expect(bad({ lever: 'mode' })).toContain('acts on the stabiliser setting itself');
    expect(bad({ offset: 'mode' })).toContain('offsets with the stabiliser setting itself');
    expect(bad({ lever: 'mode', offset: undefined })).not.toContain('offsets with the stabiliser setting itself'); // reported once, as 'acts on'
    expect(bad({ feed: { raise: 'x', lower: 'y', indicator: 'nope' } })).toContain("feed opens unknown indicator 'nope'");
    expect(bad({ description: '' })).toContain('needs a description');
  });

  test('stabilisers need a stabiliser setting, and the setting must be sound', () => {
    expect(errorsOf(stabModel({}, null)).join()).toContain('no stabiliserMode');
    expect(errorsOf(stabModel({}, { lever: 'nope', manual: 0, automatic: 1 })).join()).toContain("stabiliserMode names unknown lever 'nope'");
    expect(errorsOf(stabModel({}, { lever: 'mode', manual: 1, automatic: 1 })).join()).toContain('must be different');
    expect(errorsOf(stabModel({}, { lever: 'mode', manual: 0, automatic: 2 })).join()).toContain("2 is not an option of choice lever 'mode'");
  });

  test('showWhen must name another setting or choice, with values it can take', () => {
    const withShow = (showWhen: LeverDef['showWhen']) => {
      const mod = policyModule();
      mod.levers = mod.levers!.map((l) => (l.id === 'rate' ? { ...l, showWhen } : l));
      return errorsOf({ ...tinyModel([mod]), stabiliserMode: { lever: 'mode', manual: 0, automatic: 1 } }).join('\n');
    };
    expect(withShow({ lever: 'nope', equals: 0 })).toContain("showWhen refers to unknown lever 'nope'");
    expect(withShow({ lever: 'rate', equals: 0 })).toContain('showWhen refers to itself');
    expect(withShow({ lever: 'kick', equals: 0 })).toContain("showWhen refers to one-off lever 'kick'");
    expect(withShow({ lever: 'mode', equals: [0, 3] })).toContain("3 is not an option of choice lever 'mode'");
    expect(withShow({ lever: 'mode', equals: [] })).toContain('lists no values');
    expect(withShow({ lever: 'mode', equals: [0, 1] })).toBe('');
  });
});

describe('engine: stabilisers() and their narration', () => {
  const model = compile(stabModel());

  test('Manual: the lever holds, and the stabiliser calls once the rule is more than its threshold away', () => {
    const e = createEngine(model);
    expect(e.stabilisers()).toEqual([{ id: 'theRule', label: 'The rule', lever: 'rate', offset: 'offset', suggested: 3, current: 3, gap: 0, calling: false, automatic: false, description: RULE.description }]);
    e.setLever('pressure', 0.1);
    e.step(1);
    expect(e.value('policyRate')).toBe(3);
    expect(e.stabilisers()[0]).toMatchObject({ suggested: 3.1, calling: false });
    e.setLever('pressure', 0.5);
    e.step(1);
    expect(e.value('policyRate')).toBe(3);
    const s = e.stabilisers()[0];
    expect(s.gap).toBeCloseTo(0.5, 12);
    expect(s.calling).toBe(true);
    expect(e.feed().filter((f) => f.stabiliser)).toEqual([{ t: 2, message: 'The rule would raise the rate to 3.5%', indicator: 'rateNow', stabiliser: 'theRule' }]);
  });

  test('Applying the suggestion stops the call; Automatic never calls', () => {
    const e = createEngine(model);
    e.setLever('pressure', 0.6);
    e.step(1);
    expect(e.stabilisers()[0].calling).toBe(true);
    e.setLever('rate', 3.5); // Apply, rounded to a quarter point: within the threshold
    expect(e.stabilisers()[0].calling).toBe(false);
    e.step(1);
    expect(e.value('policyRate')).toBe(3.5);
    e.setLever('mode', 1);
    e.setLever('pressure', 2);
    e.step(1);
    expect(e.stabilisers()[0]).toMatchObject({ automatic: true, calling: false, suggested: 5 });
    expect(e.value('policyRate')).toBe(5);
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
    e.step(12);
    e.setLever('pressure', -1);
    e.step(1);
    expect(e.feed().filter((f) => f.stabiliser).length).toBe(2);
  });

  test('seek and forks replay the narration exactly', () => {
    const e = createEngine(model);
    e.setLever('pressure', 1);
    e.step(20);
    e.setLever('pressure', -1);
    e.step(20);
    const feed = e.feed();
    e.seek(15);
    e.seek(40);
    expect(e.feed()).toEqual(feed);
    expect(e.fork().feed()).toEqual(feed);
  });
});

describe('Iceland: policy is held on Manual', () => {
  const e = createEngine(icelandModel);

  test('by default, income tax +1 pp leaves the key rate at exactly 3.000% for 20 years; the rule calls within 12 months', () => {
    expect(e.leverValue('stabilisers')).toBe(0);
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

  test('the debt rule is a shadow on Manual: computed, never applied', () => {
    const f = e.fork();
    const taxRate = f.value('taxRate');
    const tau0 = f.influences('taxRate').params.find((p) => p.id === 'tau0')!.value;
    expect(taxRate).toBe(tau0 + 0.01);
    expect(Math.abs(f.value('taxRuleAdjustment'))).toBeGreaterThan(1e-3);
  });
});
