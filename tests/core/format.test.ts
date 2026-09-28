/**
 * The kernel's units and text helpers (src/core/format.ts): the unit scale that sizes changes
 * for ideas at play, explain-text templates and posting descriptions.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { describePosting, englishTemplateFormat, fillTemplate, knownRateUnit, templateIds, unitScale } from '../../src/core/format.ts';
import type { VarDef } from '../../src/core/types.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { referenceModel } from '../../src/models/reference/index.ts';
import { param, rule, tinyModel } from './fixtures.ts';

describe('unitScale', () => {
  test('fractions move 0.01 per point; units already in percent or points move 1', () => {
    expect(unitScale({ kind: 'rate', unit: 'fraction/yr' }, 0.03)).toBe(0.01);
    expect(unitScale({ kind: 'ratio', unit: 'fraction' }, 0.2)).toBe(0.01);
    expect(unitScale({ kind: 'ratio', unit: 'log points' }, 0)).toBe(0.01);
    expect(unitScale({ kind: 'expectation', unit: 'fraction/yr' }, 0.025)).toBe(0.01);
    expect(unitScale({ kind: 'rate', unit: '%/yr' }, 3)).toBe(1);
    expect(unitScale({ kind: 'rate', unit: 'pp' }, 0)).toBe(1);
    expect(unitScale({ kind: 'ratio', unit: '% of GDP' }, 55)).toBe(1);
    expect(unitScale({ kind: 'flow', unit: '% of GDP/yr' }, 60)).toBe(1);
    expect(unitScale({ kind: 'price', unit: 'index' }, 2)).toBeCloseTo(0.02, 15);
    expect(unitScale({ kind: 'quantity', unit: 'thousand persons' }, 8)).toBeCloseTo(0.08, 15);
  });

  test('a stabiliser suggestion in lever units weighs the same as the rule it restates', () => {
    for (const def of [icelandModel, referenceModel]) {
      const m = compile(def);
      const v = (id: string) => m.vars[m.varIndex.get(id)!] as VarDef;
      // a 1.6 pp move: 0.016 in the rule's rate (a fraction), 1.6 in the suggestion (in %)
      expect(1.6 / unitScale(v('keyRateSuggestion'), 3)).toBeCloseTo(0.016 / unitScale(v('ruleRate'), 0.03), 12);
      expect(unitScale(v('taxRuleSuggestion'), 0)).toBe(1);
    }
    expect(unitScale(compile(referenceModel).vars.find((x) => x.id === 'debtRatio')!, 55)).toBe(1);
  });

  test('units it does not know for a rate or ratio are flagged at compile time', () => {
    expect(['fraction', 'fraction/yr', 'ratio', 'log points', '%/yr', 'pp', '% of GDP'].every(knownRateUnit)).toBe(true);
    expect(knownRateUnit('basis points')).toBe(false);
    const m = compile(tinyModel([], { vars: [...tinyModel().modules[1].vars!, { id: 'bp', label: 'bp', unit: 'basis points', kind: 'rate', initial: 0 }], rules: [...tinyModel().modules[1].rules!, rule({ id: 'bp', target: 'bp', inputs: ['tax'], compute: (c) => c.v('tax') })] }));
    expect(m.warnings.join('\n')).toContain("variable 'bp' is a rate in 'basis points'");
    for (const def of [icelandModel, referenceModel]) expect(compile(def).warnings.filter((w) => w.includes('so ideas at play can size'))).toEqual([]);
  });
});

describe('explain templates', () => {
  const p: Record<string, number> = { rate: 0.035, k: 1.5 };
  test('English by default: percent, points and plain numbers; unknown ids stay as written', () => {
    expect(fillTemplate('{rate%} and {rate pp} and {k} and {missing}', (id) => p[id])).toBe('3.5% and 3.5 pp and 1.5 and {missing}');
    expect(englishTemplateFormat(0.2, '%')).toBe('20%');
  });

  test('a formatter writes the numbers another way (an Icelandic decimal comma)', () => {
    const is = (v: number, suffix: string) => (suffix === '' ? String(v) : `${+(v * 100).toPrecision(3)}${suffix === '%' ? ' %' : ' prósentustig'}`).replace('.', ',');
    expect(fillTemplate('{rate%}, {rate pp}, {k}', (id) => p[id], is)).toBe('3,5 %, 3,5 prósentustig, 1,5');
  });

  test('templateIds lists the ids a text names, once each', () => {
    expect(templateIds('{a%} + {b} × ({a%} − {c pp})')).toEqual(['a', 'b', 'c']);
    expect(templateIds('no placeholders')).toEqual([]);
  });

  test('a placeholder that names no parameter is flagged at compile time', () => {
    const m = compile(tinyModel([], { params: [param('level', 10)], rules: [rule({ id: 'spend', target: 'spend', params: ['level'], compute: (c) => c.p('level'), explain: { what: 'At {nope%}.', rule: 'spend = {level}' } }), tinyModel().modules[1].rules![1]] }));
    expect(m.warnings.join('\n')).toContain("rule 'spend' explain.what names '{nope}'");
    expect(m.warnings.join('\n')).not.toContain("'{level}'");
  });
});

describe('describePosting', () => {
  test('names instruments and real assets by label when given a lookup, by id otherwise', () => {
    const label = (id: string) => ({ mortgagesN: 'non-indexed mortgages', homes: 'homes' })[id];
    expect(describePosting({ type: 'issue', instrument: 'mortgagesN' })).toContain('(mortgagesN)');
    expect(describePosting({ type: 'issue', instrument: 'mortgagesN' }, label)).toContain('A new claim (non-indexed mortgages)');
    expect(describePosting({ type: 'purchase', realAsset: 'homes' }, label)).toContain('a real asset (homes)');
    expect(describePosting({ type: 'redeem', instrument: 'other' }, label)).toContain('A repayment of other');
  });
});
