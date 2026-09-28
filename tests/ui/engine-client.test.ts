/**
 * EngineClient: the clock, levers, seek and frames. Timers are not needed: step() and the
 * public methods drive the clock directly, and play() is checked with a short real interval.
 */
import { describe, expect, test } from 'bun:test';
import { models } from '../../src/models/index.ts';
import { createEngine } from '../../src/core/engine.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';

const reference = models.find((m) => m.id === 'reference')!;
const base = createEngine(reference);
const fresh = (opts = {}) => createEngineClient(createEngine(base.model, { baseline: base.baselineData }), opts);

describe('engine client', () => {
  test('starts paused at month 0 with a plain-data model description', () => {
    const c = fresh();
    const f = c.getFrame();
    expect([f.t, f.horizon, f.playing, f.speed]).toEqual([0, 0, false, 1]);
    expect(f.checks.ok).toBe(true);
    expect(c.info.legs.length).toBe(f.legs.length);
    expect(() => structuredClone({ ...c.info })).not.toThrow();
    expect(() => structuredClone(f)).not.toThrow();
    c.dispose();
  });

  test('step advances month by month and records every indicator', () => {
    const c = fresh();
    c.step(5);
    const f = c.getFrame();
    expect(f.t).toBe(5);
    expect(f.horizon).toBe(5);
    for (const ind of c.info.indicators) expect(c.series(ind.id)).toHaveLength(6);
    c.dispose();
  });

  test('setLever and fire start the clock when paused; pause stops it', () => {
    const c = fresh();
    c.setLever('keyRateAddon', 1);
    expect(c.getFrame().playing).toBe(true);
    expect(c.getFrame().levers[c.info.leverById.get('keyRateAddon')!.index]).toBe(1);
    c.pause();
    expect(c.getFrame().playing).toBe(false);
    c.fire('wageSettlement', 5);
    expect(c.getFrame().playing).toBe(true);
    expect(c.getFrame().events.filter((e) => e.fire)).toHaveLength(1);
    c.dispose();
  });

  test('playing advances `speed` months per tick', async () => {
    const c = fresh({ tickMs: 5 });
    c.setSpeed(3);
    c.play();
    await new Promise((r) => setTimeout(r, 60));
    c.pause();
    const t = c.getFrame().t;
    expect(t).toBeGreaterThanOrEqual(3);
    expect(t % 3).toBe(0);
    c.dispose();
  });

  test('seek back and forward reproduces the same numbers (deterministic replay)', () => {
    const c = fresh();
    c.setLever('keyRateAddon', 1);
    c.pause();
    c.step(40);
    const at25 = c.info.indicators.map((i) => c.series(i.id)[25]);
    const legs40 = Array.from(c.getFrame().legs);
    c.seek(25);
    expect(c.getFrame().t).toBe(25);
    expect(c.getFrame().horizon).toBe(40);
    expect(c.info.indicators.map((i) => c.series(i.id).length)).toEqual(c.info.indicators.map(() => 26));
    expect(c.info.indicators.map((i) => c.series(i.id)[25])).toEqual(at25);
    c.seek(40);
    expect(Array.from(c.getFrame().legs)).toEqual(legs40);
    c.seek(1000); // clamped to the horizon
    expect(c.getFrame().t).toBe(40);
    c.dispose();
  });

  test('frames keep array identity for unchanged levers and events', () => {
    const c = fresh();
    c.setLever('keyRateAddon', 0.5);
    c.pause();
    const f1 = c.getFrame();
    c.step(1);
    const f2 = c.getFrame();
    expect(f2).not.toBe(f1);
    expect(f2.levers).toBe(f1.levers);
    expect(f2.events).toBe(f1.events);
    c.setLever('keyRateAddon', 1);
    expect(c.getFrame().levers).not.toBe(f2.levers);
    c.dispose();
  });

  test('subscribers hear every change; errors land in the frame instead of throwing', () => {
    const c = fresh();
    let n = 0;
    const off = c.subscribe(() => n++);
    c.step(1);
    c.setSpeed(6);
    expect(n).toBe(2);
    c.setLever('no-such-lever', 1);
    expect(c.getFrame().error).toContain('no-such-lever');
    c.step(1);
    expect(c.getFrame().error).toBeNull();
    off();
    c.step(1);
    expect(n).toBe(4);
    c.dispose();
  });

  test('reset returns to the baseline and clears the scenario', () => {
    const c = fresh();
    c.setLever('keyRateAddon', 1);
    c.step(10);
    c.reset();
    const f = c.getFrame();
    expect([f.t, f.horizon, f.events.length, f.playing]).toEqual([0, 0, 0, false]);
    expect(f.levers[c.info.leverById.get('keyRateAddon')!.index]).toBe(0);
    c.dispose();
  });

  test('the clock stops at maxMonths', () => {
    const c = fresh({ maxMonths: 12 });
    c.step(20);
    expect(c.getFrame().t).toBe(12);
    expect(c.getFrame().ended).toBe(true);
    c.play();
    expect(c.getFrame().playing).toBe(false);
    c.seek(3);
    expect(c.getFrame().ended).toBe(false);
    c.dispose();
  });

  test('a bad scenario leaves a clean baseline and reports why', () => {
    const c = fresh();
    c.load({ modelId: 'reference', events: [{ t: 0, lever: 'missing', value: 1 }], months: 10 });
    const f = c.getFrame();
    expect(f.error).toContain('missing');
    expect(f.t).toBe(0);
    c.dispose();
  });

  test('regimes of rules that have one are reported each frame', () => {
    const c = fresh();
    const withRegime = c.info.rules.filter((r) => r.hasRegime).map((r) => r.id);
    expect(Object.keys(c.getFrame().regimes).sort()).toEqual(withRegime.sort());
    c.dispose();
  });
});
