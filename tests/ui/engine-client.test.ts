/**
 * EngineClient: the clock, levers, seek and frames. Timers are not needed: step() and the
 * public methods drive the clock directly, and play() is checked with a short real interval.
 */
import { describe, expect, test } from 'bun:test';
import { models } from '../../src/models/index.ts';
import { createEngine } from '../../src/core/engine.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { stabiliserMarks } from '../../src/ui/model/levers.ts';

const reference = models.find((m) => m.id === 'reference')!;
const base = createEngine(reference);
const fresh = (opts = {}) => createEngineClient(createEngine(base.model, { baseline: base.baselineData }), opts);
const c0 = fresh();

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
    const c = fresh({ maxMonths: 12 });
    c.step(20);
    expect(c.getFrame().ended).toBe(true);
    c.load({ modelId: 'reference', events: [{ t: 0, lever: 'missing', value: 1 }], months: 10 });
    const f = c.getFrame();
    expect(f.error).toContain('missing');
    expect(f.t).toBe(0);
    // Back at month 0 the clock can run again: Play and Step are not left disabled.
    expect(f.ended).toBe(false);
    c.play();
    expect(c.getFrame().playing).toBe(true);
    c.dispose();
  });

  test('a lever changed before a later mode switch is reset at that switch, as in a straight run (decision 0004)', () => {
    const mode = c0.info.stabiliserMode!;
    const other = (v: number) => (v === mode.manual ? mode.automatic : mode.manual);
    // The Manual key rate is shown on Manual and hidden on Automatic.
    const run = (edit: (c: ReturnType<typeof fresh>) => void) => {
      const c = fresh();
      edit(c);
      c.pause();
      return c;
    };
    const def = c0.info.leverById.get('keyRateFixed')!.default;
    const travelled = run((c) => {
      if (c.getFrame().levers[c.info.leverById.get(mode.lever)!.index] !== mode.manual) c.setLever(mode.lever, mode.manual);
      c.pause();
      c.step(40);
      c.setLever(mode.lever, mode.automatic); // the panel adds no reset: the Manual rate is at its default
      c.pause();
      c.step(30);
      c.seek(30);
      c.setLever('keyRateFixed', 5); // back in time, on Manual
      c.pause();
      c.seek(60);
    });
    const straight = run((c) => {
      if (c.getFrame().levers[c.info.leverById.get(mode.lever)!.index] !== mode.manual) c.setLever(mode.lever, mode.manual);
      c.pause();
      c.step(30);
      c.setLever('keyRateFixed', 5);
      c.pause();
      c.step(10);
      c.setLever('keyRateFixed', def); // what the panel does when switching mode
      c.setLever(mode.lever, mode.automatic);
      c.pause();
      c.step(20);
    });
    const at = (c: typeof travelled, id: string) => c.getFrame().levers[c.info.leverById.get(id)!.index];
    expect(travelled.getFrame().t).toBe(60);
    expect(at(travelled, 'keyRateFixed')).toBe(def);
    expect(at(travelled, mode.lever)).toBe(mode.automatic);
    const key = (c: typeof travelled) => c.scenario().events.map((e) => `${e.t}:${e.lever}=${e.value}`).sort();
    expect(key(travelled)).toEqual(key(straight));
    expect(travelled.value('keyRate')).toBe(straight.value('keyRate'));
    expect(travelled.value('output')).toBe(straight.value('output'));
    // Switching back to Manual later does not bring the old rate back.
    travelled.setLever(mode.lever, other(mode.automatic));
    expect(at(travelled, 'keyRateFixed')).toBe(def);
    travelled.dispose();
    straight.dispose();
  });

  test('a mode switch made back in time keeps a later setting of the lever it hides, reset at once (decisions 0001, 0004)', () => {
    const mode = c0.info.stabiliserMode!;
    const def = c0.info.leverById.get('keyRateFixed')!.default;
    const manual = (c: ReturnType<typeof fresh>) => {
      if (c.getFrame().levers[c.info.leverById.get(mode.lever)!.index] !== mode.manual) c.setLever(mode.lever, mode.manual);
      c.pause();
    };
    const travelled = fresh();
    manual(travelled);
    travelled.step(50);
    travelled.setLever('keyRateFixed', 5); // a straight Manual run
    travelled.pause();
    travelled.step(20);
    travelled.seek(30);
    travelled.setLever(mode.lever, mode.automatic); // the panel adds no reset: the Manual rate is at its default at 30
    travelled.pause();
    travelled.seek(60);
    const straight = fresh();
    manual(straight);
    straight.step(30);
    straight.setLever(mode.lever, mode.automatic);
    straight.pause();
    straight.step(30);
    const at = (c: typeof travelled, id: string) => c.getFrame().levers[c.info.leverById.get(id)!.index];
    expect(travelled.getFrame().t).toBe(60);
    expect(at(travelled, mode.lever)).toBe(mode.automatic);
    expect(at(travelled, 'keyRateFixed')).toBe(def);
    // The user's month-50 setting stays in the script (decision 0001), followed by a reset in the
    // same month, so the numbers are those of the straight run.
    const set50 = { t: 50, lever: 'keyRateFixed', value: 5 };
    const events = travelled.scenario().events;
    expect(events.filter((e) => e.t === 50)).toEqual([set50, { t: 50, lever: 'keyRateFixed', value: def }]);
    expect(events.filter((e) => e.t !== 50)).toEqual(straight.scenario().events);
    expect(travelled.value('keyRate')).toBe(straight.value('keyRate'));
    expect(travelled.value('output')).toBe(straight.value('output'));
    // Switching back to Manual does not bring 5 back from nowhere.
    travelled.setLever(mode.lever, mode.manual);
    expect(at(travelled, 'keyRateFixed')).toBe(def);
    travelled.dispose();
    straight.dispose();
  });

  test('a loaded scenario that sets a hidden lever with no mode event leaves it at its default', () => {
    const mode = c0.info.stabiliserMode!;
    const modeLever = c0.info.leverById.get(mode.lever)!;
    const hidden = modeLever.default === mode.automatic ? 'keyRateFixed' : 'keyRateAddon';
    const h = c0.info.leverById.get(hidden)!;
    const c = fresh();
    c.load({ modelId: 'reference', events: [{ t: 0, lever: hidden, value: h.default + 2 * (h.step ?? 0.25) }], months: 6 });
    const f = c.getFrame();
    expect(f.error).toBeNull();
    expect(f.levers[h.index]).toBe(h.default);
    // The link's setting is kept, with a reset right after it.
    expect(f.events).toEqual([
      { t: 0, lever: hidden, value: h.default + 2 * (h.step ?? 0.25) },
      { t: 0, lever: hidden, value: h.default },
    ]);
    c.dispose();
  });

  test('a loaded scenario gets the resets it is missing at its mode switches', () => {
    const mode = c0.info.stabiliserMode!;
    const c = fresh();
    c.load({ modelId: 'reference', events: [{ t: 0, lever: mode.lever, value: mode.manual }, { t: 2, lever: 'keyRateFixed', value: 6 }, { t: 5, lever: mode.lever, value: mode.automatic }], months: 8 });
    const f = c.getFrame();
    expect(f.error).toBeNull();
    expect(f.levers[c.info.leverById.get('keyRateFixed')!.index]).toBe(3);
    // The reset goes right before the switch, as the panel records it, so the switch leads the month.
    expect(f.events.filter((e) => e.t === 5)).toEqual([
      { t: 5, lever: 'keyRateFixed', value: 3 },
      { t: 5, lever: mode.lever, value: mode.automatic },
    ]);
    c.dispose();
  });

  test('regimes of rules that have one are reported each frame', () => {
    const c = fresh();
    const withRegime = c.info.rules.filter((r) => r.hasRegime).map((r) => r.id);
    expect(Object.keys(c.getFrame().regimes).sort()).toEqual(withRegime.sort());
    c.dispose();
  });
});

describe('engine client: stabilisers (decision 0004)', () => {
  const iceland = models.find((m) => m.id === 'iceland')!;
  const ibase = createEngine(iceland);

  test('frames carry every stabiliser; on Manual the key-rate rule calls and Apply answers it', () => {
    const c = createEngineClient(createEngine(ibase.model, { baseline: ibase.baselineData }));
    expect(c.info.stabiliserMode).toEqual({ lever: 'stabilisers', manual: 0, automatic: 1 });
    expect(c.getFrame().stabilisers.map((s) => [s.id, s.calling, s.automatic])).toEqual([
      ['keyRateRule', false, false],
      ['debtRule', false, false],
    ]);
    const quiet = c.getFrame().stabilisers;
    c.setSpeed(3); // a frame without a step keeps the same array
    expect(c.getFrame().stabilisers).toBe(quiet);
    c.setLever('incomeTax', 1);
    c.pause();
    c.step(12);
    const rule = c.getFrame().stabilisers.find((s) => s.id === 'keyRateRule')!;
    expect(rule.calling).toBe(true);
    expect(c.value('keyRate')).toBe(0.03);
    const mark = stabiliserMarks(c.getFrame().stabilisers, c.info.leverById).get('keyRateFixed');
    expect(mark?.kind).toBe('calling');
    if (mark?.kind !== 'calling') return;
    c.setLever('keyRateFixed', mark.apply); // the Apply button
    c.pause();
    const after = c.getFrame().stabilisers.find((s) => s.id === 'keyRateRule')!;
    expect(after.current).toBe(mark.apply);
    expect(after.calling).toBe(false);
    c.step(1);
    expect(c.value('keyRate')).toBe(mark.apply / 100);
    c.dispose();
  });

  test('on Automatic the rules act and nothing calls', () => {
    const c = createEngineClient(createEngine(ibase.model, { baseline: ibase.baselineData }));
    c.setLever('stabilisers', 1);
    c.setLever('incomeTaxOffset', 1); // on Automatic the income-tax lever is the offset to the debt rule
    c.pause();
    c.step(24);
    const f = c.getFrame();
    expect(f.stabilisers.every((s) => s.automatic && !s.calling)).toBe(true);
    expect(c.value('keyRate')).toBeLessThan(0.03);
    c.dispose();
  });
});
