/**
 * The scenarios the harness builds from the levers: the all-levers goldens (audit M19), the
 * lever-extremes sweep (M22, H1) and the shock the step timing runs under (L31).
 */
import { describe, expect, test } from 'bun:test';
import { compile, type KModel } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { runScenario } from '../../src/core/scenario.ts';
import type { LeverDef, ScenarioEvent } from '../../src/core/types.ts';
import { models } from '../../src/models/index.ts';
import { ALL_LEVERS_TAIL, allLeversScenarios, extremeValues, leverExtremeRuns, lockConfigs, timingShock } from '../../src/harness/scenarios.ts';

const compiled = models.map((def) => compile(def));

describe.each(compiled.map((m) => [m.def.id, m] as const))('%s', (_, m) => {
  const locks = m.levers.filter((l) => l.kind === 'lock').map((l) => l.id);
  const others = m.levers.filter((l) => l.kind !== 'lock');
  const closeAll = locks.map((lever) => ({ t: 0, lever, value: 1 }));

  test('lock configurations: unlocked (the default, no events) and locked (every padlock closed at month 0)', () => {
    expect(locks.length).toBe(2);
    expect(lockConfigs(m)).toEqual([
      { label: 'unlocked', events: [] },
      { label: 'locked', events: closeAll },
    ]);
    expect(lockConfigs(m, [{ label: 'key rate locked', locks: ['keyRateLock'] }])[2]).toEqual({ label: 'key rate locked', events: [{ t: 0, lever: 'keyRateLock', value: 1 }] });
    expect(() => lockConfigs(m, [{ label: 'x', locks: ['nope'] }])).toThrow(/not a padlock/);
  });

  test('all-levers: one scenario per lock configuration, the padlocks closed at month 0 in the locked one', () => {
    const s = allLeversScenarios(m);
    expect(s.map((x) => x.name)).toEqual(['all-levers-unlocked', 'all-levers-locked']);
    expect(s[0].events.some((e) => locks.includes(e.lever))).toBe(false);
    expect(s[1].events.slice(0, locks.length)).toEqual(closeAll);
  });

  test('all-levers: every lever but the padlocks moves in both, and every event reaches the recorded history with room to act', () => {
    for (const s of allLeversScenarios(m)) {
      const moved = s.events.filter((e) => !locks.includes(e.lever));
      expect(moved.map((e) => e.lever)).toEqual(others.map((l) => l.id));
      for (const e of moved) expect(e.t).toBeLessThanOrEqual(s.months - ALL_LEVERS_TAIL);
    }
  });

  test('all-levers: a choice lever takes a real option other than its default', () => {
    for (const s of allLeversScenarios(m))
      for (const e of s.events) {
        const l = m.levers.find((x) => x.id === e.lever)!;
        if (l.kind !== 'choice') continue;
        expect(l.options!.map((o) => o.value)).toContain(e.value);
        expect(e.value).not.toBe(l.default);
      }
  });

  test('extremes: every lever but the padlocks at its min and max, alone, from month 0, locked and unlocked', () => {
    const runs = leverExtremeRuns(m);
    for (const label of ['unlocked', 'locked'])
      for (const l of others) {
        const values = runs.filter((r) => r.mode === label && r.lever === l.id).map((r) => r.value);
        const expected = l.kind === 'choice' ? l.options!.map((o) => o.value).filter((v) => v !== l.default) : [l.min!, l.max!].filter((v) => l.kind === 'oneoff' || v !== l.default);
        expect(values).toEqual(expected);
      }
    expect(runs.some((r) => locks.includes(r.lever))).toBe(false);
    for (const r of runs) {
      expect(r.events.every((e) => e.t === 0)).toBe(true);
      expect(r.events).toEqual(r.mode === 'locked' ? [...closeAll, r.events.at(-1)!] : [r.events[0]]);
    }
  });

  test('timing: a real shock, never a padlock', () => {
    const s = timingShock(m)!;
    expect(s).not.toBeNull();
    for (const id of locks) expect(s.describe).not.toContain(id);
    const e = createEngine(m);
    s.apply(e);
    e.step(12);
    expect(e.stats().maxIterations).toBeGreaterThan(1);
  });
});

describe('extremeValues', () => {
  const lever = (x: Partial<LeverDef>): LeverDef => ({ id: 'x', label: 'x', group: 'Policy', kind: 'setting', unit: '', default: 0, description: '', definition: '', ...x });
  test('a setting whose default is one of its ends is swept to the other end only', () => {
    expect(extremeValues(lever({ min: 0, max: 100 }))).toEqual([100]);
    expect(extremeValues(lever({ min: -3, max: 3 }))).toEqual([-3, 3]);
  });
  test('a one-off fires at both ends, except at zero, which is no shock', () => {
    expect(extremeValues(lever({ kind: 'oneoff', default: 10, min: -5, max: 20 }))).toEqual([-5, 20]);
    expect(extremeValues(lever({ kind: 'oneoff', default: 10, min: 0, max: 20 }))).toEqual([20]);
  });
});

describe('timingShock without a one-off lever', () => {
  test('picks the first setting that can move, never a choice or a padlock', () => {
    const fake = {
      def: {},
      levers: [
        { id: 'rateLock', kind: 'lock', default: 0, min: 0, max: 1 },
        { id: 'pick', kind: 'choice', default: 0, min: 0, max: 4 },
        { id: 'stuck', kind: 'setting', default: 3, max: 3 },
        { id: 'tax', kind: 'setting', default: 0, max: 5 },
      ],
    } as unknown as KModel;
    expect(timingShock(fake)!.describe).toBe('tax set to 5');
  });
});

/**
 * Audit M19: a mutation that broke five levers passed the whole harness, because their events
 * never reached the golden. Now every lever must change the stored all-levers path in at least
 * one lock configuration: dropping its event must move some indicator.
 */
/** Levers that may still be inert at their all-levers setting, each for a known model reason. */
const KNOWN_INERT: Record<string, string> = {};

test('Iceland: every lever changes an all-levers golden path', () => {
  const m = compiled.find((x) => x.def.id === 'iceland')!;
  const engine = createEngine(m);
  const scen = allLeversScenarios(m);
  const series = (events: ScenarioEvent[], months: number) => {
    const r = runScenario(engine, events, months);
    return m.indicators.map((i) => r.series(i.id));
  };
  const full = scen.map((s) => series(s.events, s.months));
  const inert: string[] = [];
  for (const l of m.levers) {
    if (l.kind === 'lock') continue;
    const moves = scen.some((s, k) => {
      const without = series(s.events.filter((e) => e.lever !== l.id), s.months);
      return without.some((path, i) => path.some((x, t) => Math.abs(x - full[k][i][t]) > 1e-9));
    });
    if (!moves) inert.push(l.id);
  }
  expect(inert.filter((id) => !(id in KNOWN_INERT))).toEqual([]);
});
