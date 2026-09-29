/**
 * EngineClient: the clock, levers, seek and frames. Timers are not needed: step() and the
 * public methods drive the clock directly, and play() is checked with a short real interval.
 */
import { describe, expect, test } from 'bun:test';
import { models } from '../../src/models/index.ts';
import { createEngine } from '../../src/core/engine.ts';
import { createEngineClient, type FeedItem } from '../../src/ui/engine-client.ts';
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
    c.setLever('keyRate', 4);
    expect(c.getFrame().playing).toBe(true);
    expect(c.getFrame().levers[c.info.leverById.get('keyRate')!.index]).toBe(4);
    c.pause();
    expect(c.getFrame().playing).toBe(false);
    c.fire('wageSettlement', 5);
    expect(c.getFrame().playing).toBe(true);
    expect(c.getFrame().events.filter((e) => e.fire)).toHaveLength(1);
    c.dispose();
  });

  test('playing advances one month per tick, and speed shortens the tick', async () => {
    const slow = fresh({ tickMs: 60 });
    slow.play();
    await new Promise((r) => setTimeout(r, 150));
    slow.pause();
    const fast = fresh({ tickMs: 60 });
    fast.setSpeed(6); // 10 ms a month
    fast.play();
    await new Promise((r) => setTimeout(r, 150));
    fast.pause();
    expect(slow.getFrame().t).toBeGreaterThanOrEqual(1);
    expect(slow.getFrame().t).toBeLessThanOrEqual(3);
    expect(fast.getFrame().t).toBeGreaterThan(slow.getFrame().t * 2);
    slow.dispose();
    fast.dispose();
  });

  test('changing speed while playing reschedules the clock', async () => {
    const c = fresh({ tickMs: 1e9 });
    c.play();
    c.setSpeed(6);
    await new Promise((r) => setTimeout(r, 20));
    expect(c.getFrame().t).toBe(0);
    c.dispose();
    const d = fresh({ tickMs: 60 });
    d.play();
    d.setSpeed(6); // from 60 ms to 10 ms a month, without waiting for the old tick
    await new Promise((r) => setTimeout(r, 55));
    d.pause();
    expect(d.getFrame().t).toBeGreaterThanOrEqual(2);
    d.dispose();
  });

  test('seek back and forward reproduces the same numbers (deterministic replay)', () => {
    const c = fresh();
    c.setLever('keyRate', 4);
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
    c.setLever('keyRate', 3.5);
    c.pause();
    const f1 = c.getFrame();
    c.step(1);
    const f2 = c.getFrame();
    expect(f2).not.toBe(f1);
    expect(f2.levers).toBe(f1.levers);
    expect(f2.events).toBe(f1.events);
    c.setLever('keyRate', 4);
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
    c.setLever('keyRate', 4);
    c.step(10);
    c.reset();
    const f = c.getFrame();
    expect([f.t, f.horizon, f.events.length, f.playing]).toEqual([0, 0, 0, false]);
    expect(f.levers[c.info.leverById.get('keyRate')!.index]).toBe(3);
    expect(f.stabilisers.every((s) => !s.locked)).toBe(true); // the padlocks open again
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

  test('a lock made back in time is an ordinary event: the numbers are those of a straight run (decisions 0001, 0010)', () => {
    const travelled = fresh();
    travelled.setLever('govSpending', 1);
    travelled.pause();
    travelled.step(40);
    travelled.seek(20);
    travelled.setLever('keyRateLock', 1); // back in time: the later months are replayed with it
    travelled.pause();
    travelled.seek(40);
    const straight = fresh();
    straight.setLever('govSpending', 1);
    straight.pause();
    straight.step(20);
    straight.setLever('keyRateLock', 1);
    straight.pause();
    straight.step(20);
    expect(travelled.getFrame().t).toBe(40);
    expect(travelled.scenario().events).toEqual(straight.scenario().events);
    expect(travelled.value('keyRate')).toBe(straight.value('keyRate'));
    expect(travelled.value('output')).toBe(straight.value('output'));
    // locked at month 20, at the rate in force then
    expect(travelled.varSeries('keyRate', 20, 40).every((x) => x === travelled.varSeries('keyRate', 20, 20)[0])).toBe(true);
    travelled.dispose();
    straight.dispose();
  });

  test('stepping an unlocked lever locks it at the new value, with one event (the drag of decision 0010)', () => {
    const c = fresh();
    c.setLever('govSpending', 1);
    c.pause();
    c.step(12);
    const live = c.getFrame().stabilisers.find((s) => s.id === 'taylorRule')!;
    expect(live.locked).toBe(false);
    expect(live.current).toBeCloseTo(100 * c.value('keyRate'), 12);
    c.setLever('keyRate', 4.5);
    c.pause();
    const now = c.getFrame().stabilisers.find((s) => s.id === 'taylorRule')!;
    expect(now).toMatchObject({ locked: true, current: 4.5 });
    expect(c.scenario().events.filter((e) => e.t === 12)).toEqual([{ t: 12, lever: 'keyRate', value: 4.5 }]);
    c.step(1);
    expect(c.value('keyRate')).toBe(0.045);
    c.dispose();
  });

  test('unlocking hands the key rate back to its rule, which carries on from the rate held', () => {
    const c = fresh();
    c.setLever('keyRate', 6);
    c.pause();
    c.step(24);
    c.setLever('keyRateLock', 0);
    c.pause();
    expect(c.getFrame().stabilisers.find((s) => s.id === 'taylorRule')!.locked).toBe(false);
    c.step(1);
    const k = c.value('keyRate');
    expect(k).toBeLessThan(0.06);
    expect(k).toBeGreaterThan(0.05); // one smoothed step, not a jump to the rule's own path
    c.dispose();
  });

  test('a loaded scenario from before padlocks is migrated, with a notice for a dropped offset', () => {
    const c = fresh();
    const notices = c.load({ modelId: 'reference', events: [{ t: 0, lever: 'keyRateAddon', value: 1 }, { t: 5, lever: 'stabilisers', value: 0 }], months: 8, version: 1 });
    expect(notices).toHaveLength(1);
    const f = c.getFrame();
    expect(f.error).toBeNull();
    expect(f.events.filter((e) => e.t === 5)).toEqual([
      { t: 5, lever: 'keyRateLock', value: 1 },
      { t: 5, lever: 'taxRateLock', value: 1 },
      { t: 5, lever: 'keyRate', value: 3 },
      { t: 5, lever: 'taxRate', value: 0 },
    ]);
    expect(c.load({ modelId: 'reference', events: [{ t: 0, lever: 'keyRate', value: 4 }], months: 3 })).toEqual([]);
    c.dispose();
  });

  test('regimes of rules that have one are reported each frame', () => {
    const c = fresh();
    const withRegime = c.info.rules.filter((r) => r.hasRegime).map((r) => r.id);
    expect(Object.keys(c.getFrame().regimes).sort()).toEqual(withRegime.sort());
    c.dispose();
  });
});

describe('engine client: stabilisers and padlocks (decisions 0004 and 0010)', () => {
  const iceland = models.find((m) => m.id === 'iceland')!;
  const ibase = createEngine(iceland);

  test('frames carry every stabiliser; locked, the key-rate rule calls and Apply answers it', () => {
    const c = createEngineClient(createEngine(ibase.model, { baseline: ibase.baselineData }));
    expect(c.getFrame().stabilisers.map((s) => [s.id, s.lock, s.locked, s.calling])).toEqual([
      ['keyRateRule', 'keyRateLock', false, false],
      ['debtRule', 'incomeTaxLock', false, false],
    ]);
    // plain data: the stabilisers' current() stays in the engine
    expect(c.info.stabilisers.every((s) => !('current' in s))).toBe(true);
    const quiet = c.getFrame().stabilisers;
    c.setSpeed(3); // a frame without a step keeps the same array
    expect(c.getFrame().stabilisers).toBe(quiet);
    c.setLever('keyRateLock', 1);
    c.setLever('incomeTax', 1); // locks income tax too
    c.pause();
    c.step(12);
    const rule = c.getFrame().stabilisers.find((s) => s.id === 'keyRateRule')!;
    expect(rule.calling).toBe(true);
    expect(c.value('keyRate')).toBe(0.03);
    const mark = stabiliserMarks(c.getFrame().stabilisers, c.info.leverById).get('keyRate');
    expect(mark?.kind).toBe('calling');
    if (mark?.kind !== 'calling') return;
    c.setLever('keyRate', mark.apply); // the Apply button
    c.pause();
    const after = c.getFrame().stabilisers.find((s) => s.id === 'keyRateRule')!;
    expect(after.current).toBe(mark.apply);
    expect(after.locked).toBe(true);
    expect(after.calling).toBe(false);
    c.step(1);
    expect(c.value('keyRate')).toBe(mark.apply / 100);
    c.dispose();
  });

  test('a stabiliser’s feed item carries the fields a translation needs: its direction, value and change (K1)', () => {
    const c = createEngineClient(createEngine(ibase.model, { baseline: ibase.baselineData }));
    c.setLever('keyRateLock', 1);
    c.pause();
    c.step(1);
    c.setLever('incomeTax', 1);
    c.pause();
    c.step(12);
    const item: FeedItem | undefined = c.getFrame().feed.find((f) => f.stabiliser === 'keyRateRule');
    expect(item).toBeDefined();
    const rule = c.getFrame().stabilisers.find((s) => s.id === 'keyRateRule')!;
    // The rule wants a lower rate after a tax rise; value and change are what the message shows.
    expect(item!.dir).toBe(-1);
    expect(item!.value).toBeCloseTo(rule.suggested, 0);
    expect(typeof item!.change).toBe('number');
    expect(item!.message).toContain(String(item!.value));
    // a threshold message names its rule
    expect(c.getFrame().feed.filter((f) => !f.stabiliser).every((f) => typeof f.rule === 'string')).toBe(true);
    c.dispose();
  });

  test('unlocked, the rules act and nothing calls', () => {
    const c = createEngineClient(createEngine(ibase.model, { baseline: ibase.baselineData }));
    c.setLever('otherServices', -2); // spending cut: the key-rate rule eases, the debt rule cuts tax
    c.pause();
    c.step(24);
    const f = c.getFrame();
    expect(f.stabilisers.every((s) => !s.locked && !s.calling)).toBe(true);
    expect(c.value('keyRate')).toBeLessThan(0.03);
    c.dispose();
  });
});
