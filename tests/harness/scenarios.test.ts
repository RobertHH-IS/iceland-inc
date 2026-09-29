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
import { ALL_LEVERS_TAIL, allLeversScenarios, extremeValues, leverExtremeRuns, shownWith, timingShock } from '../../src/harness/scenarios.ts';

const compiled = models.map((def) => compile(def));

describe.each(compiled.map((m) => [m.def.id, m] as const))('%s', (_, m) => {
  const mode = m.def.stabiliserMode!;
  const others = m.levers.filter((l) => l.id !== mode.lever);
  const modeValue: Record<string, number> = { Manual: mode.manual, Automatic: mode.automatic };
  /** The levers the panel shows in a mode (decision 0004): the ones a scenario may move there. */
  const shownIn = (label: string) => others.filter((l) => shownWith(m, l, [{ t: 0, lever: mode.lever, value: modeValue[label] }]));

  test('all-levers: one scenario per stabiliser mode, the mode set at month 0', () => {
    const s = allLeversScenarios(m);
    expect(s.map((x) => x.name)).toEqual(['all-levers-manual', 'all-levers-automatic']);
    expect(s[0].events[0]).toEqual({ t: 0, lever: mode.lever, value: mode.manual });
    expect(s[1].events[0]).toEqual({ t: 0, lever: mode.lever, value: mode.automatic });
  });

  test('all-levers: every lever shown in the mode moves, and every event reaches the recorded history with room to act', () => {
    const scen = allLeversScenarios(m);
    scen.forEach((s, i) => {
      const moved = s.events.slice(1);
      expect(moved.map((e) => e.lever)).toEqual(shownIn(['Manual', 'Automatic'][i]).map((l) => l.id));
      for (const e of moved) expect(e.t).toBeLessThanOrEqual(s.months - ALL_LEVERS_TAIL);
    });
    // every lever moves in at least one mode
    const moved = new Set(scen.flatMap((s) => s.events.slice(1).map((e) => e.lever)));
    expect(others.filter((l) => !moved.has(l.id))).toEqual([]);
  });

  test('a lever hidden in a mode is never moved in it (showWhen, decision 0004)', () => {
    const hidden = others.filter((l) => l.showWhen);
    expect(hidden.length).toBeGreaterThan(0);
    for (const label of ['Manual', 'Automatic']) {
      const inMode = new Set(shownIn(label).map((l) => l.id));
      const off = hidden.filter((l) => !inMode.has(l.id)).map((l) => l.id);
      expect(off.length).toBeGreaterThan(0);
      const s = allLeversScenarios(m).find((x) => x.name === `all-levers-${label.toLowerCase()}`)!;
      for (const id of off) {
        expect(s.events.some((e) => e.lever === id)).toBe(false);
        expect(leverExtremeRuns(m).some((r) => r.mode === label && r.lever === id)).toBe(false);
      }
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

  test('extremes: every lever other than the mode at its min and max, alone, from month 0, in each mode that shows it', () => {
    const runs = leverExtremeRuns(m);
    for (const modeLabel of ['Manual', 'Automatic'])
      for (const l of shownIn(modeLabel)) {
        const values = runs.filter((r) => r.mode === modeLabel && r.lever === l.id).map((r) => r.value);
        const expected = l.kind === 'choice' ? l.options!.map((o) => o.value).filter((v) => v !== l.default) : [l.min!, l.max!].filter((v) => l.kind === 'oneoff' || v !== l.default);
        expect(values).toEqual(expected);
      }
    for (const r of runs) {
      expect(r.events.every((e) => e.t === 0)).toBe(true);
      expect(r.events[0].lever).toBe(mode.lever);
      expect(r.events).toHaveLength(2);
    }
  });

  test('timing: a real shock, never the stabiliser setting', () => {
    const s = timingShock(m)!;
    expect(s).not.toBeNull();
    expect(s.describe).not.toContain(mode.lever);
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
  test('picks the first setting that can move, never a choice', () => {
    const fake = {
      def: { stabiliserMode: { lever: 'mode', manual: 0, automatic: 1 } },
      levers: [
        { id: 'mode', kind: 'choice', default: 0, min: 0, max: 1 },
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
 * one stabiliser mode: dropping its event must move some indicator.
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
    if (l.id === m.def.stabiliserMode!.lever) continue;
    const moves = scen.some((s, k) => {
      const without = series(s.events.filter((e) => e.lever !== l.id), s.months);
      return without.some((path, i) => path.some((x, t) => Math.abs(x - full[k][i][t]) > 1e-9));
    });
    if (!moves) inert.push(l.id);
  }
  expect(inert.filter((id) => !(id in KNOWN_INERT))).toEqual([]);
});
