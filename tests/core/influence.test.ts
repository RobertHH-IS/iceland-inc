/**
 * Influences and ideas at play (src/core/influence.ts): explain texts filled and tagged, term
 * input lists in both stabiliser modes, how terms are weighted, what counts as at play on
 * Manual and Automatic, and how a scope picks the variables and legs it starts from.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { compile, CompileError, type KModel } from '../../src/core/compile.ts';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { templateIds } from '../../src/core/format.ts';
import { termEffects, type InfluenceSource } from '../../src/core/influence.ts';
import type { LeverDef, ModelDef, ModuleDef, StabiliserDef } from '../../src/core/types.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { referenceModel } from '../../src/models/reference/index.ts';
import { selectionScope } from '../../src/ui/model/navigation.ts';
import { param, rule, tinyModel, variable } from './fixtures.ts';

const MANUAL = 0,
  AUTOMATIC = 1;
let iceland: KModel, reference: KModel, iceBase: KernelEngine, refBase: KernelEngine;
beforeAll(() => {
  iceland = compile(icelandModel);
  reference = compile(referenceModel);
  iceBase = createEngine(iceland, { dev: false });
  refBase = createEngine(reference, { dev: false });
});
const ice = () => createEngine(iceland, { dev: false, baseline: iceBase.baselineData });
const ref = () => createEngine(reference, { dev: false, baseline: refBase.baselineData });
const concepts = (e: KernelEngine, scope?: string) => e.ideasAtPlay(scope).map((x) => x.concept);
const weightOf = (e: KernelEngine, concept: string, scope?: string) => e.ideasAtPlay(scope).find((x) => x.concept === concept)?.weight ?? 0;

describe('explain texts', () => {
  test('placeholders are filled in explain.what as well as explain.rule ({tau0%} in the income-tax rate)', () => {
    const inf = ice().influences('taxRate');
    expect(inf.rule!.what).not.toContain('{');
    expect(inf.rule!.what).toMatch(/At \d+(\.\d+)?% it also stands in/);
  });

  test('every placeholder is filled, and names a parameter listed in Influence.params ({kapT}, {muX})', () => {
    for (const [m, e] of [
      [iceland, ice()],
      [reference, ref()],
    ] as const) {
      for (const r of m.rules) {
        const inf = e.influences(`var:${r.target}`);
        expect(`${inf.rule!.what} ${inf.rule!.rule}`).not.toMatch(/\{\w+( pp|%)?\}/);
        const listed = new Set(inf.params.map((p) => p.id));
        for (const id of templateIds(`${r.explain.what} ${r.explain.rule}`)) expect([r.id, id, listed.has(id)]).toEqual([r.id, id, true]);
      }
      for (const f of m.flows) expect(e.influences(`flow:${f.id}`).rule!.what).not.toMatch(/\{\w+( pp|%)?\}/);
    }
    const e = ice();
    expect(e.influences('capitalRatio').params.map((p) => p.id)).toContain('kapT');
    expect(e.influences('importsExporters').params.map((p) => p.id)).toContain('muX');
  });

  test('posting descriptions name instruments by label, not id', () => {
    const e = ice();
    const f = iceland.flows.find((x) => x.posting.type === 'issue' && x.posting.instrument === 'mortgagesN')!;
    const text = e.influences(`flow:${f.id}`).rule!.rule;
    expect(text).toContain('mortgages, non-indexed');
    expect(text).not.toContain('mortgagesN');
  });

  test('the explanation says where it comes from: a rule, a flow, an indicator or outside the model', () => {
    const e = ref();
    expect(e.influences('var:consumption').rule).toMatchObject({ source: 'rule' });
    expect(e.influences('flow:consumption').rule).toMatchObject({ source: 'flow' });
    expect(e.influences('indicator:output').rule).toMatchObject({ source: 'indicator' });
    const m = compile(policyModel());
    const inf = createEngine(m).influences('pressure');
    expect(inf.rule).toMatchObject({ source: 'exogenous', levers: ['pressure'] });
  });
});

describe('term input lists (compile-time dry run over lever options)', () => {
  test('a term that reads a variable in only one stabiliser mode lists it in both', () => {
    const reads = (m: KModel, key: string) => m.cterms[m.termKeyIndex.get(key)!].reads;
    expect(reads(iceland, 'keyRate.rule')).toEqual(['ruleRate']);
    expect(reads(iceland, 'taxRate.debtRule')).toEqual(['taxRuleAdjustment']);
    expect(reads(iceland, 'keyRate.set')).toEqual([]);
    expect(reads(iceland, 'keyRate.addOn')).toEqual([]);
    expect(reads(iceland, 'taxRate.normal')).toEqual([]);
    expect(reads(reference, 'keyRate.rule')).toEqual(['ruleRate']);
    for (const mode of [MANUAL, AUTOMATIC]) {
      const e = ice();
      e.setLever('stabilisers', mode);
      e.step(1);
      expect(e.influences('keyRate').terms.find((t) => t.id === 'rule')!.inputs).toEqual(['ruleRate']);
    }
  });
});

describe('weights', () => {
  const productModule: ModuleDef = {
    id: 'product',
    label: 'Product',
    description: 'A product of two factors, a capped demand and a sum.',
    vars: [variable('prod', 4), variable('capped', 2), variable('sum', 5)],
    params: [param('a', 4), param('b', 1)],
    rules: [
      rule({
        id: 'prod',
        target: 'prod',
        params: ['a', 'b'],
        terms: [
          { id: 'level', label: 'Level', concept: 'c-level', compute: (c) => c.p('a') },
          { id: 'factor', label: 'Factor', concept: 'c-factor', compute: (c) => c.p('b') },
        ],
        combine: (t) => t.level * t.factor,
      }),
      rule({
        id: 'capped',
        target: 'capped',
        params: ['b'],
        terms: [
          { id: 'demand', label: 'Demand', concept: 'c-demand', compute: (c) => 2 * c.p('b') },
          { id: 'cap', label: 'Cap', concept: 'c-cap', compute: (c) => 5 * c.p('b') },
        ],
        combine: (t) => Math.min(t.demand, t.cap),
      }),
      rule({
        id: 'sum',
        target: 'sum',
        params: ['a', 'b'],
        terms: [
          { id: 'x', label: 'x', concept: 'c-x', compute: (c) => c.p('a') },
          { id: 'y', label: 'y', concept: 'c-y', compute: (c) => c.p('b') },
        ],
      }),
    ],
    levers: [{ id: 'bUp', label: 'b', group: 'World', kind: 'setting', unit: '', default: 0, description: 'b', definition: 'Level, persistent while set.', binds: { param: 'b', mode: 'add' } }],
  };

  test('a factor of a product weighs its effect on the product; additive terms weigh their change', () => {
    const e = createEngine(tinyModel([productModule]));
    e.setLever('bUp', 0.1);
    e.step(1);
    expect(e.value('prod')).toBeCloseTo(4.4, 12);
    expect(weightOf(e, 'c-factor')).toBeCloseTo(4 * 0.1, 12); // level × Δfactor, in % of GDP
    expect(weightOf(e, 'c-level')).toBe(0);
    expect(weightOf(e, 'c-y')).toBeCloseTo(0.1, 12);
    expect(weightOf(e, 'c-x')).toBe(0);
  });

  test('a cap that does not bind weighs nothing', () => {
    const e = createEngine(tinyModel([productModule]));
    e.setLever('bUp', 0.1);
    e.step(1);
    expect(weightOf(e, 'c-demand')).toBeCloseTo(0.2, 12);
    expect(weightOf(e, 'c-cap')).toBe(0);
  });

  test('Iceland: the tourism lever weighs as the change in tourism exports, not as the factor', () => {
    const e = ice();
    e.setLever('tourism', -30);
    e.step(1);
    const inf = e.influences('exportVolumeTourism');
    const term = (id: string) => inf.terms.find((t) => t.id === id)!;
    const src = (e as unknown as { src: InfluenceSource }).src;
    const effects = termEffects(src, iceland.ruleOfVar[iceland.varIndex.get('exportVolumeTourism')!]);
    const demand = inf.terms.findIndex((t) => t.id === 'demand');
    // a fall in visitors reaches bookings within about a month (external.ts, tourismFelt): 98% of it in month 1
    const felt = e.value('tourismFelt');
    expect(felt).toBeLessThan(-0.29);
    expect(term('demand').change).toBeCloseTo(felt, 12); // the factor moves by about 0.3 …
    expect(effects[demand]).toBeCloseTo(felt * term('normal').baseline * term('competitiveness').baseline, 9); // … exports by about 3.9 pp of GDP
    expect(Math.abs(effects[demand])).toBeGreaterThan(3.5);
  });
});

describe('what is at play on Manual and Automatic', () => {
  const SHADOW = /^(ruleRate|keyRateSuggestion|taxRuleAdjustment|taxRuleSuggestion)\b/;

  test('Manual: the stabilisers’ shadow chains are not at play; Automatic: they are, but not their suggestions', () => {
    for (const mode of [MANUAL, AUTOMATIC]) {
      const e = ice();
      e.setLever('stabilisers', mode);
      e.fire('wageSettlement', 10);
      e.step(12);
      const via = e.ideasAtPlay().flatMap((x) => x.via);
      if (mode === MANUAL) {
        expect(e.value('keyRate')).toBe(e.baseline('keyRate'));
        expect(via.filter((v) => SHADOW.test(v))).toEqual([]);
        expect(concepts(e)).not.toContain('taylor-rule');
        // a scoped view does not walk through the shadow into the whole economy
        expect(concepts(e, 'var:keyRate')).not.toContain('taylor-rule');
      } else {
        expect(via.some((v) => v.startsWith('ruleRate'))).toBe(true);
        expect(via.some((v) => v.startsWith('taxRuleAdjustment'))).toBe(true);
        expect(concepts(e, 'var:keyRate')).toContain('taylor-rule');
        expect(concepts(e, 'indicator:keyRate')).toContain('taylor-rule');
      }
      expect(via.filter((v) => /^(keyRateSuggestion|taxRuleSuggestion)\b/.test(v))).toEqual([]);
    }
  });

  test('Manual: an indicator whose drivers include a shadow does not walk through it', () => {
    const e = ice();
    e.setLever('incomeTax', 3);
    e.step(24);
    for (const [scope, concept, shadow] of [
      ['indicator:keyRate', 'taylor-rule', /^(ruleRate|keyRateSuggestion)\b/],
      ['indicator:incomeTaxRate', 'fiscal-rule', /^(taxRuleAdjustment|taxRuleSuggestion)\b/],
    ] as const) {
      const ideas = e.ideasAtPlay(scope);
      expect(ideas.map((x) => x.concept)).not.toContain(concept);
      expect(ideas.flatMap((x) => x.via).filter((v) => shadow.test(v))).toEqual([]);
    }
    // the variable picked by itself is still explained
    expect(concepts(e, 'var:ruleRate')).toContain('taylor-rule');
    expect(concepts(e, 'var:taxRuleAdjustment')).toContain('fiscal-rule');
  });

  test('selecting the shadow itself still shows what drives it', () => {
    const e = ice();
    e.fire('wageSettlement', 10);
    e.step(12);
    expect(concepts(e, 'var:ruleRate')).toContain('taylor-rule');
  });

  test('Manual with an income-tax rise: no inert stabiliser near the top of ideas at play', () => {
    const e = ice();
    e.setLever('incomeTax', 3);
    e.step(24);
    const top = e.ideasAtPlay().slice(0, 10);
    expect(top.map((x) => x.concept)).not.toContain('taylor-rule');
    expect(top.flatMap((x) => x.via).filter((v) => SHADOW.test(v))).toEqual([]);
  });

  test('switching to Automatic with no shock shows nothing at play, and a held term stays at its baseline', () => {
    for (const e of [ice(), ref()]) {
      const b = e.baselineData;
      const def = e.model.stabiliserMode!.manual === e.leverValue(e.model.stabiliserMode!.lever) ? 0 : 1;
      expect([...b.byMode![def].terms]).toEqual([...b.terms]); // the default mode's baseline is the published one
      const automatic = e.model.stabiliserMode!.automatic;
      e.setLever(e.model.stabiliserMode!.lever, automatic);
      e.step(3);
      expect(e.ideasAtPlay()).toEqual([]);
      expect(e.influences('keyRate').terms.map((t) => Math.abs(t.change) < 1e-12)).toEqual(e.influences('keyRate').terms.map(() => true));
      const held = e.fork({ disableTerms: ['keyRate.rule'] });
      held.step(3);
      expect(held.value('keyRate')).toBeCloseTo(e.baseline('keyRate'), 12);
    }
  });

  // The values on show were computed under the old mode until the next step, so they are
  // compared with that mode's baseline, not with the one the lever now points to.
  const quiet = (e: KernelEngine) => {
    expect(e.ideasAtPlay()).toEqual([]);
    expect(e.influences('keyRate').terms.map((t) => Math.abs(t.change) < 1e-12)).toEqual(e.influences('keyRate').terms.map(() => true));
  };
  test('in the month the mode switches, before the next step, nothing is at play', () => {
    for (const make of [ice, ref]) {
      for (const months of [0, 6]) {
        const e = make();
        const mode = e.model.stabiliserMode!;
        e.step(months);
        e.setLever(mode.lever, mode.automatic);
        quiet(e);
      }
    }
  });
  test('seeking back to the month of the switch shows nothing at play', () => {
    for (const make of [ice, ref]) {
      const e = make();
      const mode = e.model.stabiliserMode!;
      e.step(6);
      e.setLever(mode.lever, mode.automatic);
      e.step(6);
      quiet(e);
      e.seek(6);
      quiet(e);
      e.seek(12); // a snapshot month, restored without a step
      quiet(e);
      e.seek(0);
      e.setLever(mode.lever, mode.automatic);
      e.seek(12);
      quiet(e);
      e.seek(0);
      quiet(e);
    }
  });
});

describe('stabiliser shadows: declared and checked', () => {
  const errorsOf = (def: ModelDef): string[] => {
    try {
      compile(def);
      return [];
    } catch (err) {
      if (err instanceof CompileError) return err.errors;
      throw err;
    }
  };
  const withShadow = (shadow: string[], extra: Partial<ModuleDef> = {}) => {
    const def = policyModel();
    const mod = def.modules.find((x) => x.id === 'policy')!;
    Object.assign(mod, { stabilisers: [{ ...mod.stabilisers![0], shadow }], ...extra, rules: [...mod.rules!, ...(extra.rules ?? [])], vars: [...mod.vars!, ...(extra.vars ?? [])] });
    return def;
  };
  test('a valid shadow compiles; the Iceland and reference shadows are sound', () => {
    expect(errorsOf(withShadow(['raw']))).toEqual([]);
    expect(iceland.cstabilisers.flatMap((s) => s.shadow.map((k) => iceland.vars[k].id))).toEqual(['ruleRate', 'taxRuleAdjustment']);
    expect(reference.cstabilisers.flatMap((s) => s.shadow.map((k) => reference.vars[k].id))).toEqual(['ruleRate', 'debtRuleRate']);
  });
  test('unknown ids, the suggestion itself, and a variable something reads on Manual are errors', () => {
    expect(errorsOf(withShadow(['nope'])).join()).toContain("declares unknown shadow variable 'nope'");
    expect(errorsOf(withShadow(['ruleSays'])).join()).toContain('lists its suggestion');
    const echo = { vars: [variable('echo', 3)], rules: [rule({ id: 'echo', target: 'echo', inputs: ['raw'], compute: (c) => c.v('raw') })] };
    expect(errorsOf(withShadow(['raw'], echo)).join()).toContain("declares 'raw' a shadow, but rule 'echo' reads it on Manual");
  });
});

describe('scopes', () => {
  test('selectionScope prefixes ids with their kind, and the engine accepts every prefix', () => {
    expect(selectionScope({ kind: 'flow', id: 'wages' })).toBe('flow:wages');
    expect(selectionScope({ kind: 'indicator', id: 'exports' })).toBe('indicator:exports');
    expect(selectionScope({ kind: 'var', id: 'keyRate' })).toBe('var:keyRate');
    expect(selectionScope({ kind: 'player', id: 'HY' })).toBe('player:HY');
    expect(selectionScope({ kind: 'group', id: 'firms' })).toBe('group:firms');
    const e = ice();
    e.fire('wageSettlement', 10);
    e.step(6);
    for (const s of [selectionScope({ kind: 'player', id: 'HY' }), 'group:' + iceland.groups[0].id, 'flow:wages', 'indicator:exports', 'var:keyRate']) expect(() => e.ideasAtPlay(s)).not.toThrow();
    expect(() => e.ideasAtPlay('flow:nope')).toThrow(/'nope' is not a flow/);
    expect(() => e.ideasAtPlay('player:firms')).toThrow(/is not a player/);
  });

  test('a flow that shares its id with its leg variable keeps its own concepts', () => {
    const e = ice();
    e.fire('wageSettlement', 10);
    e.step(24);
    expect(concepts(e, selectionScope({ kind: 'flow', id: 'pensionPayouts' }))).toContain('pension-entitlements');
    expect(concepts(e, 'pensionPayouts')).toContain('pension-entitlements'); // unprefixed: the flow is a superset
    const r = ref();
    r.fire('wageSettlement', 10);
    r.step(12);
    expect(r.ideasAtPlay('flow:investment').find((x) => x.concept === 'investment-accelerator')!.via).toContain('investment');
  });

  test('an indicator scope starts from its drivers, not from the flow or variable of the same id', () => {
    const e = ice();
    e.setLever('tourism', -30);
    e.step(6);
    const viaInd = e.ideasAtPlay('indicator:exports').flatMap((x) => x.via);
    const viaFlow = e.ideasAtPlay('flow:exports').flatMap((x) => x.via);
    expect(viaInd).toContain('exportVolumeTourism.demand');
    expect(viaInd).not.toEqual(viaFlow);
  });

  test('a flow-level concept weighs only the legs of the flow inside the scope', () => {
    const e = ice();
    e.fire('wageSettlement', 10);
    e.step(12);
    const scope = 'XF->HY:cash';
    const legs = e.legs();
    const change = (flow: string) => legs.filter((l) => l.flow === flow && l.from === 'XF' && l.to === 'HY').reduce((s, l) => s + l.value - l.baseline, 0);
    const expected = iceland.flows.filter((f) => f.concepts?.includes('double-entry')).reduce((s, f) => s + Math.abs(change(f.id)), 0);
    expect(expected).toBeGreaterThan(0);
    expect(weightOf(e, 'double-entry', scope)).toBeCloseTo(expected, 12);
    // the whole wage flow moves by much more than this one leg
    const all = legs.filter((l) => l.flow === 'wages').reduce((s, l) => s + l.value - l.baseline, 0);
    expect(Math.abs(all)).toBeGreaterThan(2 * expected);
  });
});

/** A policy rate set by the user (Manual) or by a rule plus an offset (Automatic); the rule's
 *  raw rate is a shadow that only its suggestion reads on Manual. */
function policyModel(): ModelDef {
  const setting = (l: Partial<LeverDef> & Pick<LeverDef, 'id'>): LeverDef => ({ label: l.id, group: 'Policy', kind: 'setting', unit: '%', default: 0, description: l.id, definition: 'Level, persistent while set.', ...l });
  const RULE: StabiliserDef = { id: 'theRule', label: 'The rule', lever: 'rate', offset: 'offset', suggestion: 'ruleSays', threshold: 0.125, description: 'A rule.' };
  const mod: ModuleDef = {
    id: 'policy',
    label: 'Policy',
    description: 'A rate and the rule that would set it.',
    vars: [
      { id: 'pressure', label: 'Pressure', unit: 'pp', kind: 'exogenous', initial: 0 },
      { id: 'raw', label: 'Raw rule rate', unit: '%', kind: 'rate', initial: 3 },
      { id: 'ruleSays', label: 'What the rule says', unit: '%', kind: 'rate', initial: 3 },
      { id: 'policyRate', label: 'Policy rate', unit: '%', kind: 'rate', initial: 3 },
    ],
    rules: [
      rule({ id: 'raw', target: 'raw', category: 'POLICY', inputs: ['pressure'], compute: (c) => 3 + c.v('pressure') }),
      rule({ id: 'ruleSays', target: 'ruleSays', category: 'POLICY', inputs: ['raw'], compute: (c) => c.v('raw') }),
      rule({ id: 'policyRate', target: 'policyRate', category: 'POLICY', inputs: ['raw'], levers: ['mode', 'rate', 'offset'], compute: (c) => (Math.round(c.lever('mode')) >= 1 ? c.v('raw') + c.lever('offset') : c.lever('rate')) }),
    ],
    levers: [
      setting({ id: 'mode', kind: 'choice', unit: 'mode', options: [{ value: 0, label: 'Manual' }, { value: 1, label: 'Automatic' }] }),
      setting({ id: 'rate', default: 3 }),
      setting({ id: 'offset', unit: 'pp' }),
      setting({ id: 'pressure', unit: 'pp', group: 'World', binds: { variable: 'pressure', mode: 'replace' } }),
    ],
    stabilisers: [RULE],
  };
  return { ...tinyModel([mod]), stabiliserMode: { lever: 'mode', manual: 0, automatic: 1 } };
}
