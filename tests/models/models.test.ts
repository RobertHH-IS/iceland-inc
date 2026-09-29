/**
 * Every registered model: its module tests and calibration checks, run under `bun test`.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine } from '../../src/core/engine.ts';
import { runScenario } from '../../src/core/scenario.ts';
import { compile } from '../../src/core/compile.ts';
import type { ModelDef } from '../../src/core/types.ts';
import { conceptLibrary, models } from '../../src/models/index.ts';

/** Decision 0005 lists every position a model lets take either sign, one row per exemption. */
const DECISION_0005 = readFileSync(join(import.meta.dir, '..', '..', 'docs', 'decisions', '0005-position-signs.md'), 'utf8');

const AGREED = new Set([
  'double-entry', 'stock-flow-consistency', 'net-worth', 'sectoral-balances', 'accrual-vs-cash',
  'endogenous-money', 'money-destruction', 'reserves-and-payments', 'deficits-and-money',
  'interest-distribution', 'credit-impulse',
  'markup-pricing', 'cost-pass-through', 'wage-phillips-curve', 'adaptive-expectations',
  'consumption-function', 'multiplier', 'paradox-of-thrift', 'investment-accelerator', 'capacity-utilisation', 'okun-law',
  'taylor-rule', 'interest-rate-channel', 'policy-lags', 'gradual-adjustment', 'automatic-stabilisers', 'debt-feedback', 'haig-simons-income', 'anchored-expectations',
  'steady-state-baseline',
]);

function conceptsUsed(def: ModelDef): Set<string> {
  const used = new Set<string>();
  for (const m of def.modules) {
    if (m.id === 'concepts') continue;
    for (const r of m.rules ?? []) {
      (r.concepts ?? []).forEach((c) => used.add(c));
      (r.terms ?? []).forEach((t) => t.concept && used.add(t.concept));
    }
    for (const x of [...(m.flows ?? []), ...(m.levers ?? []), ...(m.indicators ?? []), ...(m.instruments ?? [])]) (x.concepts ?? []).forEach((c) => used.add(c));
    for (const f of m.feed ?? []) if (f.concept) used.add(f.concept);
  }
  return used;
}

for (const def of models) {
  describe(`model '${def.id}'`, () => {
    const engine = createEngine(def);

    for (const mod of def.modules)
      for (const t of mod.tests ?? [])
        test(`module ${mod.id}: ${t.label}`, () => {
          const r = t.run(engine.fork()); // a fresh engine at the baseline
          if (!r.pass) console.log(r.detail);
          expect(r.pass).toBe(true);
        });

    for (const c of def.calibration ?? [])
      test(`calibration: ${c.label}`, () => {
        const run = runScenario(engine, c.scenario, c.months);
        const v = c.measure(run);
        expect(v).toBeGreaterThanOrEqual(c.range[0]);
        expect(v).toBeLessThanOrEqual(c.range[1]);
        expect(run.engine.checks().failures!.length).toBe(0);
      });

    test('every concept id the model uses is defined (when the concept library is present)', () => {
      const m = compile(def);
      const undefinedIds = m.warnings.filter((w) => w.startsWith('concept '));
      if (conceptLibrary.length) expect(undefinedIds).toEqual([]);
    });

    test('every position-sign exemption is listed, with its players, in decision 0005', () => {
      for (const mod of def.modules)
        for (const ins of mod.instruments ?? [])
          if (ins.mayGoNegative) {
            const players = ins.mayGoNegative.players ?? [...(ins.holders ?? []), ...(ins.issuers ?? [])];
            expect(DECISION_0005).toContain(`| ${def.id} | \`${ins.id}\` | ${players.map((p) => `\`${p}\``).join(', ')} |`);
          }
    });

    if (def.id === 'reference')
      test('the reference model uses only the agreed concept ids', () => {
        for (const c of conceptsUsed(def)) expect(AGREED.has(c) ? c : `not agreed: ${c}`).toBe(c);
      });
  });
}
