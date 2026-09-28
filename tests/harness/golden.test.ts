/**
 * Golden comparison (audit L32): the reported point is the one that breaks its tolerance, the
 * structural messages survive, and a stored value that is not a finite number never passes.
 */
import { describe, expect, test } from 'bun:test';
import { compareGolden, GOLDEN_ABS, GOLDEN_REL, nonFiniteValues, writeGolden, type GoldenFile } from '../../src/harness/golden.ts';

const golden = (indicators: Record<string, number[]>, months = 2): GoldenFile => ({
  format: 'iceland-inc/golden@1',
  modelId: 'test',
  scenario: 'test',
  months,
  events: [],
  indicators,
});

describe('compareGolden', () => {
  test('passes identical paths', () => {
    const g = golden({ a: [0, 1, 2] });
    const c = compareGolden(g, golden({ a: [0, 1, 2] }));
    expect(c.pass).toBe(true);
    expect(c.ratio).toBe(0);
    expect(c.where).toBe('');
  });

  test('reports the point that breaks its tolerance, not the largest absolute difference', () => {
    // a[1] differs by 5e-9 on a value of 0: 5 × its tolerance of about 1e-9.
    // b[2] differs by 1e-4 on a value of 1e4: within its tolerance of about 1e-3.
    const stored = golden({ a: [0, 0, 0], b: [0, 0, 1e4] });
    const c = compareGolden(stored, golden({ a: [0, 5e-9, 0], b: [0, 0, 1e4 + 1e-4] }));
    expect(c.pass).toBe(false);
    expect(c.where).toBe('a at month 1');
    expect(c.diff).toBeCloseTo(5e-9, 15);
    expect(c.ratio).toBeCloseTo(5e-9 / GOLDEN_ABS, 6);
  });

  test('a difference just inside the tolerance passes', () => {
    const tol = GOLDEN_ABS + GOLDEN_REL * 100;
    const c = compareGolden(golden({ a: [0, 100, 0] }), golden({ a: [0, 100 + 0.9 * tol, 0] }));
    expect(c.pass).toBe(true);
    expect(c.where).toBe('a at month 1');
  });

  test('keeps the scenario-change message when an indicator also differs', () => {
    const stored = golden({ a: [0, 1, 2] });
    const fresh = { ...golden({ a: [0, 1, 3] }), events: [{ t: 0, lever: 'x', value: 1 }] };
    const c = compareGolden(stored, fresh);
    expect(c.pass).toBe(false);
    expect(c.where).toBe('scenario definition changed; a at month 2');
  });

  test('keeps missing- and extra-indicator messages when a later indicator differs', () => {
    const c = compareGolden(golden({ gone: [0, 0, 0], a: [0, 0], z: [0, 0, 0] }), golden({ a: [0, 0, 0], z: [0, 0, 1] }));
    expect(c.pass).toBe(false);
    expect(c.where).toBe("indicator 'a' missing or of different length; indicator 'gone' no longer exists; z at month 2");
  });

  test('a stored null (NaN or Infinity written as JSON) fails, even against 0', () => {
    const stored = JSON.parse(JSON.stringify(golden({ a: [0, NaN, 0] }))) as GoldenFile;
    expect(stored.indicators.a[1]).toBeNull();
    const c = compareGolden(stored, golden({ a: [0, 0, 0] }));
    expect(c.pass).toBe(false);
    expect(c.ratio).toBe(Infinity);
    expect(c.where).toContain('a at month 1 is not a finite number');
  });

  test('a new value that is not finite fails', () => {
    const c = compareGolden(golden({ a: [0, 1, 2] }), golden({ a: [0, Infinity, 2] }));
    expect(c.pass).toBe(false);
    expect(c.where).toContain('a at month 1 is not a finite number');
  });
});

describe('writing goldens', () => {
  test('nonFiniteValues names every value that is not a finite number', () => {
    expect(nonFiniteValues(golden({ a: [0, 1, 2] }))).toEqual([]);
    expect(nonFiniteValues(golden({ a: [0, NaN, 2], b: [Infinity, 0, 0] }))).toEqual(['a at month 1', 'b at month 0']);
  });

  test('writeGolden refuses a path with a non-finite value, before touching the disk', () => {
    expect(() => writeGolden('/nonexistent-golden-dir', golden({ a: [0, NaN, 0] }))).toThrow(/non-finite.*a at month 1/);
  });
});
