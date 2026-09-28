/**
 * Performance: a model with about 200 variables must step in well under 1 ms.
 */
import { expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { referenceModel } from '../../src/models/reference/index.ts';
import { syntheticModel } from './fixtures.ts';

// Shared CI runners are slower and noisier; keep the local budget tight.
const PERF_SLACK = process.env.CI ? 10 : 1;

function timeSteps(e: ReturnType<typeof createEngine>, n: number): number {
  e.step(50); // warm up the JIT
  const t0 = performance.now();
  e.step(n);
  return ((performance.now() - t0) * 1000) / n; // µs per step
}

test('a ~200-variable model steps in well under 1 ms', () => {
  const m = compile(syntheticModel(25));
  expect(m.NV).toBeGreaterThanOrEqual(200);
  const e = createEngine(m);
  e.setLever('thrift', 2); // keep the big simultaneous block working every step
  const us = timeSteps(e, 1000);
  console.log(`synthetic model: ${m.NV} variables, ${m.clegs.length} legs, largest block ${Math.max(...m.schedule.map((b) => b.rules.length))} rules: ${us.toFixed(1)} µs per step`);
  expect(us).toBeLessThan(500 * PERF_SLACK);
  // every step, not only the last
  expect(e.checks().failures).toEqual([]);
  expect(Math.max(...e.maxResiduals().map((r) => r.residual))).toBeLessThan(1e-9);
});

test('the reference model steps in microseconds', () => {
  const e = createEngine(referenceModel);
  e.fire('wageSettlement', 10);
  const us = timeSteps(e, 2000);
  console.log(`reference model: ${e.model.NV} variables: ${us.toFixed(1)} µs per step`);
  expect(us).toBeLessThan(200 * PERF_SLACK);
});
