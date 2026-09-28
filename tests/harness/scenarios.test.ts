/**
 * The scenarios the harness builds from the levers: the all-levers goldens (audit M19).
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { runScenario } from '../../src/core/scenario.ts';
import type { ScenarioEvent } from '../../src/core/types.ts';
import { models } from '../../src/models/index.ts';
import { ALL_LEVERS_TAIL, allLeversScenarios } from '../../src/harness/scenarios.ts';

const compiled = models.map((def) => compile(def));

describe.each(compiled.map((m) => [m.def.id, m] as const))('%s', (_, m) => {
  const mode = m.def.stabiliserMode!;
  const others = m.levers.filter((l) => l.id !== mode.lever);

  test('all-levers: one scenario per stabiliser mode, the mode set at month 0', () => {
    const s = allLeversScenarios(m);
    expect(s.map((x) => x.name)).toEqual(['all-levers-manual', 'all-levers-automatic']);
    expect(s[0].events[0]).toEqual({ t: 0, lever: mode.lever, value: mode.manual });
    expect(s[1].events[0]).toEqual({ t: 0, lever: mode.lever, value: mode.automatic });
  });

  test('all-levers: every lever moves, and every event reaches the recorded history with room to act', () => {
    for (const s of allLeversScenarios(m)) {
      const moved = s.events.slice(1);
      expect(moved.map((e) => e.lever)).toEqual(others.map((l) => l.id));
      for (const e of moved) expect(e.t).toBeLessThanOrEqual(s.months - ALL_LEVERS_TAIL);
    }
  });

  test('all-levers: a choice lever takes a real option other than its default', () => {
    for (const s of allLeversScenarios(m))
      for (const e of s.events.slice(1)) {
        const l = m.levers.find((x) => x.id === e.lever)!;
        if (l.kind !== 'choice') continue;
        expect(l.options!.map((o) => o.value)).toContain(e.value);
        expect(e.value).not.toBe(l.default);
      }
  });
});

/**
 * Audit M19: a mutation that broke five levers passed the whole harness, because their events
 * never reached the golden. Now every lever must change the stored all-levers path in at least
 * one stabiliser mode: dropping its event must move some indicator.
 */
/** Levers that may still be inert at their all-levers setting, each for a known model reason. */
const KNOWN_INERT: Record<string, string> = {
  // Audit M3: the loan-to-value cap tests each group's whole stock (loan-to-value about 38%),
  // so 50% never binds. Remove once the cap applies to new lending.
  ltvCap: 'M3',
};

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
    if (l.id === m.def.stabiliserMode!.lever) continue;
    const moves = scen.some((s, k) => {
      const without = series(s.events.filter((e) => e.lever !== l.id), s.months);
      return without.some((path, i) => path.some((x, t) => Math.abs(x - full[k][i][t]) > 1e-9));
    });
    if (!moves) inert.push(l.id);
  }
  expect(inert.filter((id) => !(id in KNOWN_INERT))).toEqual([]);
});
