import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { School } from '../src/core/types.ts';
import { concepts, conceptThemes } from '../src/concepts/library.ts';
import { INDEX_PATH, renderConceptIndex } from '../scripts/concepts-index.ts';

const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** Ids that models and the interface rely on. Renaming one is a breaking change. */
const REQUIRED_IDS = [
  // Accounting
  'double-entry', 'stock-flow-consistency', 'net-worth', 'sectoral-balances', 'accrual-vs-cash', 'revaluation',
  'haig-simons-income',
  // Money
  'endogenous-money', 'money-destruction', 'reserves-and-payments', 'deficits-and-money', 'broad-money',
  // Credit
  'credit-impulse', 'debt-service-constraint', 'loan-to-value', 'amortisation', 'indexation', 'interest-distribution',
  'bank-capital', 'minsky-instability',
  // Prices and wages
  'markup-pricing', 'cost-pass-through', 'exchange-rate-pass-through', 'wage-bargaining', 'wage-phillips-curve',
  'adaptive-expectations', 'anchored-expectations', 'profit-squeeze', 'real-wages',
  // Demand and output
  'consumption-function', 'paradox-of-thrift', 'multiplier', 'investment-accelerator', 'import-leakage',
  'capacity-utilisation', 'okun-law', 'habit-persistence',
  // Policy
  'taylor-rule', 'interest-rate-channel', 'policy-lags', 'automatic-stabilisers', 'fiscal-rule', 'debt-feedback', 'macroprudential-policy', 'bond-buyers',
  // External
  'floating-exchange-rate', 'carry-trade', 'current-account', 'real-exchange-rate', 'purchasing-power-parity',
  'export-sectors', 'terms-of-trade', 'dutch-disease', 'resource-rent',
  // Housing
  'credit-and-house-prices', 'housing-wealth-effect',
  // Pensions
  'funded-pensions', 'pension-entitlements',
  // Distribution
  'borrowers-and-savers', 'intergenerational-flows',
  // Modelling
  'steady-state-baseline', 'counterfactual', 'model-limits',
];

const SCHOOLS: School[] = [
  'accounting', 'post-keynesian', 'keynesian', 'new-keynesian', 'monetarist', 'institutional', 'empirical',
];

/** Collect every failure so one run reports all of them. */
function failures(check: (c: (typeof concepts)[number]) => string | null): string[] {
  return concepts.map((c) => check(c)).filter((f): f is string => f !== null);
}

describe('concept library', () => {
  test('is not empty', () => {
    expect(concepts.length).toBeGreaterThanOrEqual(REQUIRED_IDS.length);
  });

  test('ids are unique', () => {
    const seen = new Set<string>();
    const dupes = concepts.map((c) => c.id).filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(dupes).toEqual([]);
  });

  test('ids are lower-case kebab-case', () => {
    expect(failures((c) => (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id) ? null : c.id))).toEqual([]);
  });

  test('every required id is present', () => {
    const ids = new Set(concepts.map((c) => c.id));
    expect(REQUIRED_IDS.filter((id) => !ids.has(id))).toEqual([]);
  });

  test('every related id resolves, is not the concept itself and is not repeated', () => {
    const ids = new Set(concepts.map((c) => c.id));
    const bad = concepts.flatMap((c) =>
      (c.related ?? []).flatMap((r, i, all) => {
        if (!ids.has(r)) return [`${c.id} → unknown "${r}"`];
        if (r === c.id) return [`${c.id} → itself`];
        if (all.indexOf(r) !== i) return [`${c.id} → "${r}" twice`];
        return [];
      }),
    );
    expect(bad).toEqual([]);
  });

  test('Nominal anchor, which only a lever is tagged with, is linked from the Taylor rule’s and anchored expectations’ cards, so the inspector reaches it', () => {
    for (const id of ['taylor-rule', 'anchored-expectations']) expect(concepts.find((c) => c.id === id)!.related).toContain('nominal-anchor');
  });

  test('every title is non-empty', () => {
    expect(failures((c) => (c.title.trim() ? null : c.id))).toEqual([]);
  });

  test('every oneLiner is non-empty and at most 25 words', () => {
    expect(
      failures((c) => {
        const n = words(c.oneLiner);
        return n > 0 && n <= 25 ? null : `${c.id}: ${n} words`;
      }),
    ).toEqual([]);
  });

  test('no body is empty', () => {
    expect(failures((c) => (c.body.trim() ? null : c.id))).toEqual([]);
  });

  test('every body is 80–220 words', () => {
    expect(
      failures((c) => {
        const n = words(c.body);
        return n >= 80 && n <= 220 ? null : `${c.id}: ${n} words`;
      }),
    ).toEqual([]);
  });

  test('every school is one of the defined schools', () => {
    expect(failures((c) => (SCHOOLS.includes(c.school) ? null : `${c.id}: ${c.school}`))).toEqual([]);
  });

  test('every concept has 1–3 references with titles and well-formed URLs', () => {
    expect(
      failures((c) => {
        const refs = c.references ?? [];
        if (refs.length < 1 || refs.length > 3) return `${c.id}: ${refs.length} references`;
        for (const r of refs) {
          if (!r.title.trim()) return `${c.id}: reference without a title`;
          if (r.url !== undefined && !/^https?:\/\/\S+$/.test(r.url)) return `${c.id}: bad URL ${r.url}`;
        }
        return null;
      }),
    ).toEqual([]);
  });

  test('every concept belongs to exactly one theme, and themes list only known ids', () => {
    const ids = new Set(concepts.map((c) => c.id));
    const listed = conceptThemes.flatMap((t) => t.ids);
    expect(listed.filter((id) => !ids.has(id))).toEqual([]);
    expect(listed.filter((id, i) => listed.indexOf(id) !== i)).toEqual([]);
    expect(concepts.map((c) => c.id).filter((id) => !listed.includes(id))).toEqual([]);
  });

  test('docs/concepts.md is up to date (run: bun run scripts/concepts-index.ts)', () => {
    expect(readFileSync(INDEX_PATH, 'utf8')).toBe(renderConceptIndex());
  });
});
