/**
 * The compiler: merging, replaces, validation errors, the dry run for undeclared reads, SCC
 * detection and scheduling, and warnings.
 */
import { describe, expect, test } from 'bun:test';
import { compile, CompileError, tarjan } from '../../src/core/compile.ts';
import type { ModelDef, ModuleDef } from '../../src/core/types.ts';
import { param, rule, tinyModel, variable } from './fixtures.ts';
import { referenceModel } from '../../src/models/reference/index.ts';

function errorsOf(def: ModelDef): string[] {
  try {
    compile(def);
  } catch (e) {
    if (e instanceof CompileError) return e.errors;
    throw e;
  }
  return [];
}

describe('compile: valid models', () => {
  test('the tiny model compiles and schedules spend before tax', () => {
    const m = compile(tinyModel());
    expect(m.schedule.map((b) => b.rules)).toEqual([['spend'], ['tax']]);
    expect(m.ruleFor('tax')!.id).toBe('tax');
    expect(m.groups.map((g) => g.id)).toContain('Private');
  });

  test('the reference model compiles with one simultaneous block (income ↔ spending)', () => {
    const m = compile(referenceModel);
    const sim = m.schedule.filter((b) => b.simultaneous);
    expect(sim.length).toBe(1);
    expect(sim[0].rules).toContain('consumption');
    expect(sim[0].rules).toContain('gdp');
  });
});

describe('compile: errors', () => {
  test('duplicate rule for one variable', () => {
    const extra: ModuleDef = { id: 'x', label: 'x', description: 'x', rules: [rule({ id: 'tax2', target: 'tax', compute: () => 1 })] };
    const errs = errorsOf(tinyModel([extra]));
    expect(errs.some((e) => e.includes('duplicate rule') && e.includes("'tax'"))).toBe(true);
  });

  test('missing rule for an endogenous variable', () => {
    const extra: ModuleDef = { id: 'x', label: 'x', description: 'x', vars: [variable('orphan')] };
    const errs = errorsOf(tinyModel([extra]));
    expect(errs.some((e) => e.startsWith('missing rule') && e.includes("'orphan'"))).toBe(true);
  });

  test('unknown references: an input, a leg amount, a lever binding', () => {
    const extra: ModuleDef = {
      id: 'x',
      label: 'x',
      description: 'x',
      vars: [variable('y')],
      rules: [rule({ id: 'y', target: 'y', inputs: ['nope'], compute: () => 1 })],
      flows: [{ id: 'f', label: 'f', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: [{ from: 'HH', to: 'G', amount: 'missingVar' }], explain: { what: 'f' } }],
      levers: [{ id: 'l', label: 'l', group: 'Policy', kind: 'setting', unit: 'x', default: 0, binds: { param: 'ghost', mode: 'add' }, description: 'l', definition: 'l' }],
    };
    const errs = errorsOf(tinyModel([extra]));
    expect(errs.some((e) => e.includes("unknown input 'nope'"))).toBe(true);
    expect(errs.some((e) => e.includes("unknown amount variable 'missingVar'"))).toBe(true);
    expect(errs.some((e) => e.includes("unknown parameter 'ghost'"))).toBe(true);
  });

  test('an undeclared input read inside a rule is caught by the dry run', () => {
    const extra: ModuleDef = {
      id: 'x',
      label: 'x',
      description: 'x',
      vars: [variable('y')],
      params: [param('k', 2)],
      rules: [rule({ id: 'y', target: 'y', inputs: [], compute: (c) => c.v('spend') * c.p('k') + c.lag('tax') })],
    };
    const errs = errorsOf(tinyModel([extra]));
    expect(errs.some((e) => e.includes("reads v('spend') without declaring it in inputs"))).toBe(true);
    expect(errs.some((e) => e.includes("reads p('k') without declaring it in params"))).toBe(true);
    expect(errs.some((e) => e.includes("reads lag('tax') without declaring it in lagInputs"))).toBe(true);
  });

  test('an undeclared read inside a term, and an undeclared stock, are caught too', () => {
    const extra: ModuleDef = {
      id: 'x',
      label: 'x',
      description: 'x',
      vars: [variable('y')],
      rules: [
        rule({
          id: 'y',
          target: 'y',
          terms: [
            { id: 'a', label: 'a', compute: (c) => c.v('tax') },
            { id: 'b', label: 'b', compute: (c) => c.stock('deposits', 'HH') },
          ],
        }),
      ],
    };
    const errs = errorsOf(tinyModel([extra]));
    expect(errs.some((e) => e.includes("reads v('tax')"))).toBe(true);
    expect(errs.some((e) => e.includes("reads stock('deposits', 'HH') without declaring it"))).toBe(true);
  });

  test('a posting whose roles do not match the instrument', () => {
    const extra: ModuleDef = {
      id: 'x',
      label: 'x',
      description: 'x',
      vars: [variable('loan')],
      rules: [rule({ id: 'loan', target: 'loan', compute: () => 1 })],
      flows: [{ id: 'f', label: 'f', kind: 'cash', account: 'financial', posting: { type: 'issue', instrument: 'deposits' }, legs: [{ from: 'HH', to: 'G', amount: 'loan' }], explain: { what: 'f' } }],
    };
    const errs = errorsOf(tinyModel([extra]));
    expect(errs.some((e) => e.includes("the borrower 'G' must be an issuer of 'deposits'"))).toBe(true);
  });

  test('a flow kind that does not match its posting', () => {
    const def = tinyModel();
    def.modules[1].flows![0].kind = 'accrual';
    expect(errorsOf(def).some((e) => e.includes("a 'transfer' posting must have kind 'cash'"))).toBe(true);
  });

  test('free parameters and targets must match in number', () => {
    const def = tinyModel();
    def.steadyState.free = ['level'];
    expect(errorsOf(def).some((e) => e.includes('1 free parameters but 0 targets'))).toBe(true);
  });
});

describe('compile: replaces', () => {
  test('a module replaces a rule for the same variable', () => {
    const extra: ModuleDef = {
      id: 'better-tax',
      label: 'x',
      description: 'x',
      rules: [rule({ id: 'tax-v2', target: 'tax', replaces: 'tax', category: 'POLICY', inputs: ['spend'], compute: (c) => 0.5 * c.v('spend') })],
    };
    const m = compile(tinyModel([extra]));
    expect(m.ruleFor('tax')!.id).toBe('tax-v2');
    expect(m.rules.some((r) => r.id === 'tax')).toBe(false);
  });

  test('a replacement must target the same variable and the replaced rule must exist', () => {
    const wrong: ModuleDef = { id: 'w', label: 'w', description: 'w', rules: [rule({ id: 'r2', target: 'spend', replaces: 'tax', compute: () => 1 })] };
    expect(errorsOf(tinyModel([wrong])).some((e) => e.includes('a replacement must set the same variable'))).toBe(true);
    const ghost: ModuleDef = { id: 'g', label: 'g', description: 'g', rules: [rule({ id: 'r3', target: 'tax', replaces: 'nothing', compute: () => 1 })] };
    expect(errorsOf(tinyModel([ghost])).some((e) => e.includes("replaces rule 'nothing', which does not exist"))).toBe(true);
  });
});

describe('strongly connected components', () => {
  test('tarjan finds cycles and emits dependencies first', () => {
    // 0 → 1 → 2 → 0 is a cycle; 3 depends on 0; 4 depends on itself
    const adj = [[1], [2], [0], [0], [4]];
    const comps = tarjan(5, adj).map((c) => [...c].sort());
    expect(comps).toContainEqual([0, 1, 2]);
    expect(comps).toContainEqual([3]);
    expect(comps).toContainEqual([4]);
    const order = comps.map((c) => c[0]);
    expect(order.indexOf(0)).toBeLessThan(order.indexOf(3));
  });

  test('a same-step loop becomes one simultaneous block; a self-loop is simultaneous too', () => {
    const extra: ModuleDef = {
      id: 'loop',
      label: 'loop',
      description: 'loop',
      vars: [variable('a'), variable('b'), variable('c'), variable('d'), variable('s')],
      rules: [
        rule({ id: 'a', target: 'a', inputs: ['b'], compute: (x) => 0.5 * x.v('b') + 1 }),
        rule({ id: 'b', target: 'b', inputs: ['a'], compute: (x) => 0.5 * x.v('a') }),
        rule({ id: 'c', target: 'c', inputs: ['a'], compute: (x) => x.v('a') }),
        rule({ id: 'd', target: 'd', lagInputs: ['c'], inputs: ['spend'], compute: (x) => x.lag('c') + x.v('spend') }),
        rule({ id: 's', target: 's', inputs: ['s'], compute: (x) => 0.5 * x.v('s') + 1 }),
      ],
    };
    const m = compile(tinyModel([extra]));
    const block = m.schedule.find((b) => b.rules.includes('a'))!;
    expect(block.simultaneous).toBe(true);
    expect([...block.rules].sort()).toEqual(['a', 'b']);
    expect(m.schedule.find((b) => b.rules.includes('c'))!.simultaneous).toBe(false);
    expect(m.schedule.find((b) => b.rules.includes('d'))!.simultaneous).toBe(false); // lags never loop
    expect(m.schedule.find((b) => b.rules.includes('s'))!.simultaneous).toBe(true);
    const at = (id: string) => m.schedule.findIndex((b) => b.rules.includes(id));
    expect(at('a')).toBeLessThan(at('c'));
  });
});

describe('compile: warnings', () => {
  test('an undefined concept warns but does not fail; extra concepts resolve it', () => {
    const def = tinyModel();
    def.modules[1].rules![0].concepts = ['no-such-idea'];
    const m = compile(def);
    expect(m.warnings.some((w) => w.includes("concept 'no-such-idea'"))).toBe(true);
    const m2 = compile(def, { extraConcepts: [{ id: 'no-such-idea', title: 'An idea', oneLiner: 'x', body: 'x', school: 'accounting' }] });
    expect(m2.warnings.some((w) => w.includes("concept 'no-such-idea'"))).toBe(false);
    expect(m2.concepts.map((c) => c.id)).toContain('no-such-idea');
  });

  test('unused parameters, unused variables and levers bound to nothing are reported', () => {
    const extra: ModuleDef = {
      id: 'x',
      label: 'x',
      description: 'x',
      vars: [variable('lonely')],
      params: [param('unused', 1)],
      rules: [rule({ id: 'lonely', target: 'lonely', compute: () => 1 })],
      levers: [{ id: 'idle', label: 'idle', group: 'Policy', kind: 'setting', unit: 'x', default: 0, description: 'x', definition: 'x' }],
    };
    const w = compile(tinyModel([extra])).warnings;
    expect(w.some((x) => x.includes("parameter 'unused' is not used"))).toBe(true);
    expect(w.some((x) => x.includes("variable 'lonely' is not read"))).toBe(true);
    expect(w.some((x) => x.includes("lever 'idle' is bound to nothing"))).toBe(true);
  });
});
