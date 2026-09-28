/**
 * The Iceland model's mortgages, charts, feed, parameter provenance and calibration checks, as
 * corrected after the audit of 29 September 2026 (docs/audit/2026-09-29-audit.md).
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { withConcepts } from '../../src/models/index.ts';

const model = compile(withConcepts(icelandModel));
const fresh = () => createEngine(model);

describe('Iceland feed: messages name only what their chart shows (audit L14)', () => {
  const rule = (id: string) => icelandModel.modules.flatMap((m) => m.feed ?? []).find((f) => f.id === id)!;

  test('older households’ income gain is not credited to interest when a transfer rise causes it', () => {
    const e = fresh();
    e.setLever('oldAgeTransfers', 1);
    e.step(12);
    const fired = e.feed().filter((f) => f.indicator === 'rdiO');
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0].message).toBe(rule('oldGain').message);
    expect(rule('oldGain').message).not.toMatch(/interest/i);
  });

  test('tourism’s profit fall is worded so it is true for a demand slump as well as a wage rise', () => {
    const e = fresh();
    e.setLever('tourism', -30);
    e.step(12);
    const fired = e.feed().filter((f) => f.indicator === 'profitsXT');
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0].message).toBe(rule('squeeze').message);
    expect(rule('squeeze').message).toMatch(/do not fall with sales/);
  });
});
