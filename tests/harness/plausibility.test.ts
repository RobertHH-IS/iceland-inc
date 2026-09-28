/**
 * Plausibility checks of the robustness layer (audit M22 and H1): which variables get a bound,
 * and which breaches a run reports, on a small hand-made run and on real engines (where the
 * signs come from the kernel's diagnostic and honour declared exemptions).
 */
import { describe, expect, test } from 'bun:test';
import { compile, ROLE_HOLDER, ROLE_ISSUER, ROLE_NONE, type KModel } from '../../src/core/compile.ts';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { measureSigns } from '../../src/core/checks.ts';
import type { SignViolation } from '../../src/core/types.ts';
import { models } from '../../src/models/index.ts';
import { firstNonFinite, MAX_UNEMPLOYMENT, plausibilityBounds, plausibilityBreaches } from '../../src/harness/plausibility.ts';

const SIGN_TOL = 1e-6;

/** Three variables, one instrument held by A and issued by B, and a path of a few months. */
function fakeRun(unemployment: number[], price: number[], held: number[], issued: number[]) {
  const m = {
    vars: [
      { id: 'unemployment', kind: 'ratio', unit: 'fraction' },
      { id: 'price', kind: 'price', unit: 'index' },
      { id: 'unemploymentBenefits', kind: 'flow', unit: '% of GDP/yr' },
    ],
    NI: 1,
    NP: 3,
    role: new Uint8Array([ROLE_HOLDER, ROLE_ISSUER, ROLE_NONE]),
    instruments: [{ id: 'loans' }],
    players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
  } as unknown as KModel;
  const vals: Record<string, number[]> = { unemployment, price, unemploymentBenefits: unemployment.map(() => -1) };
  const positionsAt = (t: number) => new Float64Array([held[t], issued[t], 0]);
  // What the kernel's diagnostic records: each position's first month beyond the tolerance.
  const signViolations: SignViolation[] = [];
  const seen = new Set<number>();
  for (let t = 0; t < unemployment.length; t++) {
    const out: number[] = [];
    const pos = positionsAt(t);
    measureSigns(pos, { role: m.role, exempt: new Uint8Array(3) }, SIGN_TOL, out);
    for (const j of out.filter((x) => !seen.has(x))) {
      seen.add(j);
      const holder = m.role[j] === ROLE_HOLDER;
      signViolations.push({ instrument: 'loans', player: m.players[j].id, role: holder ? 'holder' : 'issuer', t, value: holder ? pos[j] : -pos[j] });
    }
  }
  const e = {
    t: unemployment.length - 1,
    valueAt: (id: string, t: number) => vals[id][t],
    positionsAt,
    checks: () => ({ signViolations, signTolerance: SIGN_TOL }),
  } as unknown as KernelEngine;
  return { m, e };
}

describe('plausibilityBounds', () => {
  test('bounds unemployment rates in their own unit, and not flows that share the name', () => {
    const { m } = fakeRun([0], [1], [0], [0]);
    expect(plausibilityBounds(m).map((x) => `${x.id} ${x.rule}`)).toEqual([`unemployment in [0, ${MAX_UNEMPLOYMENT}]`, 'price > 0']);
  });

  test('Iceland: every unemployment rate, unemployed pool, price index and the key rate', () => {
    const m = compile(models.find((d) => d.id === 'iceland')!);
    const ids = plausibilityBounds(m).map((b) => b.id);
    for (const id of ['unemployment', 'unemploymentY', 'unemploymentW', 'unemploymentO', 'unemployedY', 'unemployedW', 'unemployedO', 'cpi', 'wage', 'exchangeRate', 'keyRate']) expect(ids).toContain(id);
    expect(ids).not.toContain('unemploymentBenefitsO');
  });
});

describe('plausibilityBreaches', () => {
  test('a plausible run has none', () => {
    const { m, e } = fakeRun([0.03, 0.04, 0.05], [1, 1.1, 1.2], [5, 4, 3], [-5, -4, -3]);
    expect(plausibilityBreaches(m, e)).toEqual([]);
    expect(firstNonFinite(m, e)).toBe('');
  });

  test('reports each breach once, with its first month and furthest value', () => {
    const { m, e } = fakeRun([0.01, -0.002, -0.005], [1, 1, 0], [1, -0.5, -2], [-1, 0.5, 2]);
    expect(plausibilityBreaches(m, e)).toEqual([
      { kind: 'bound', what: 'unemployment', rule: `in [0, ${MAX_UNEMPLOYMENT}]`, first: 1, worst: -0.005 },
      { kind: 'sign', what: 'loans / A', rule: 'holder’s asset ≥ 0', first: 1, worst: -2 },
      { kind: 'sign', what: 'loans / B', rule: 'issuer’s liability ≥ 0', first: 1, worst: -2 },
      { kind: 'bound', what: 'price', rule: '> 0', first: 2, worst: 0 },
    ]);
  });

  test('float noise at a bound, and wrong-signed positions within SIGN_TOL, are not breaches', () => {
    const { m, e } = fakeRun([0, -1e-12, MAX_UNEMPLOYMENT], [1, 1, 1], [0, -0.5 * SIGN_TOL, 0], [0, 0.5 * SIGN_TOL, 0]);
    expect(plausibilityBreaches(m, e)).toEqual([]);
  });

  test('unemployment above half the labour force is a breach', () => {
    const { m, e } = fakeRun([0.05, 0.6, 0.55], [1, 1, 1], [0, 0, 0], [0, 0, 0]);
    expect(plausibilityBreaches(m, e)).toEqual([{ kind: 'bound', what: 'unemployment', rule: `in [0, ${MAX_UNEMPLOYMENT}]`, first: 1, worst: 0.6 }]);
  });

  test('firstNonFinite names the first variable or stock that is not finite', () => {
    const a = fakeRun([0, NaN, 0], [1, 1, 1], [0, 0, 0], [0, 0, 0]);
    expect(firstNonFinite(a.m, a.e)).toBe('unemployment is not finite at month 1');
    const b = fakeRun([0, 0, 0], [1, 1, 1], [0, 0, Infinity], [0, 0, 0]);
    expect(firstNonFinite(b.m, b.e)).toBe('a stock is not finite at month 2');
  });
});
