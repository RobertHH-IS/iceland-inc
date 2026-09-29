import { describe, expect, test } from 'bun:test';
import { models } from '../../src/models/index.ts';
import { createEngine } from '../../src/core/engine.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { decodeScenarioHash, encodeScenarioHash, hasScenario } from '../../src/ui/model/scenario-url.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('scenario URL hash', () => {
  test('round-trips events, months and model exactly', () => {
    const s = {
      modelId: 'reference',
      months: 36,
      events: [
        { t: 12, lever: 'wageSettlement', value: 10, fire: true },
        { t: 0, lever: 'keyRate', value: 0.1 + 0.2 },
        { t: 24, lever: 'keyRateLock', value: 0 },
      ],
    };
    const hash = encodeScenarioHash(s);
    expect(hash).toBe('m=reference&v=2&t=36&e=0:keyRate:0.30000000000000004,12:!wageSettlement:10,24:keyRateLock:0');
    const d = decodeScenarioHash('#' + hash);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.state.modelId).toBe('reference');
    expect(d.state.version).toBe(2);
    expect(d.state.months).toBe(36);
    expect(d.state.events).toEqual([...s.events].sort((a, b) => a.t - b.t));
    expect(d.state.events[0].value).toBe(0.1 + 0.2); // bit for bit
  });

  test('lever ids with odd characters are encoded', () => {
    const s = { modelId: 'my model', months: 1, events: [{ t: 0, lever: 'a:b,c', value: 1 }] };
    const d = decodeScenarioHash(encodeScenarioHash(s));
    expect(d.ok && d.state).toMatchObject({ modelId: 'my model', events: [{ t: 0, lever: 'a:b,c', value: 1 }] });
  });

  test('an empty hash, or a model alone, is not a scenario', () => {
    const e = decodeScenarioHash('');
    expect(e.ok && hasScenario(e.state)).toBe(false);
    const m = decodeScenarioHash('#m=iceland');
    expect(m.ok && m.state.modelId).toBe('iceland');
    expect(m.ok && hasScenario(m.state)).toBe(false);
  });

  test('malformed hashes are rejected with a reason', () => {
    for (const bad of ['#t=-3', '#t=1.5', '#e=0:x', '#e=a:x:1', '#e=0:x:abc', '#e=0::1', '#e=0:x:', '#v=3', '#v=0', '#v=x'])
      expect(decodeScenarioHash(bad).ok).toBe(false);
  });

  test('unknown keys are ignored (room for view state later)', () => {
    const d = decodeScenarioHash('#m=reference&t=2&view=ledger');
    expect(d.ok && d.state.months).toBe(2);
  });

  test('a shared link replays the same numbers', () => {
    const def = models.find((m) => m.id === 'reference')!;
    const a = createEngineClient(createEngine(def));
    a.setLever('keyRate', 4);
    a.pause();
    a.step(10);
    a.fire('wageSettlement', 5);
    a.pause();
    a.step(15);
    const hash = encodeScenarioHash(a.scenario());
    const d = decodeScenarioHash(hash);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const b = createEngineClient(createEngine(def));
    b.load({ modelId: d.state.modelId!, events: d.state.events, months: d.state.months });
    expect(b.getFrame().t).toBe(25);
    for (const ind of a.info.indicators) expect(b.series(ind.id)).toEqual(a.series(ind.id));
    expect(Array.from(b.getFrame().legs)).toEqual(Array.from(a.getFrame().legs));
    a.dispose();
    b.dispose();
  });

  test('share links carry the padlocks, which are lever events like any other', () => {
    const def = models.find((m) => m.id === 'iceland')!;
    const a = createEngineClient(createEngine(def));
    a.setLever('incomeTax', 1); // moving it locks it
    a.pause();
    a.step(6);
    a.setLever('keyRateLock', 1);
    a.pause();
    a.step(6);
    a.setLever('incomeTaxLock', 0);
    a.pause();
    a.step(6);
    const hash = encodeScenarioHash(a.scenario());
    expect(hash).toContain('e=0:incomeTax:1,6:keyRateLock:1,12:incomeTaxLock:0');
    const d = decodeScenarioHash(hash);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const b = createEngineClient(createEngine(def));
    expect(b.load({ modelId: d.state.modelId!, events: d.state.events, months: d.state.months, version: d.state.version })).toEqual([]);
    expect(b.getFrame().levers[b.info.leverById.get('keyRateLock')!.index]).toBe(1);
    expect(b.getFrame().stabilisers.map((s) => s.locked)).toEqual([true, false]);
    expect(b.series('keyRate')).toEqual(a.series('keyRate'));
    expect(b.series('incomeTaxRate')).toEqual(a.series('incomeTaxRate'));
    expect(b.getFrame().stabilisers).toEqual(a.getFrame().stabilisers);
    a.dispose();
    b.dispose();
  });

  test('a link written before padlocks (no v) is migrated as it loads: the old Manual default locks both levers, and a dropped offset comes with a notice', () => {
    const d = decodeScenarioHash('#m=iceland&t=24&e=0:keyRateFixed:4,12:stabilisers:1,12:keyRateAddon:1');
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.state.version).toBe(1);
    const def = models.find((m) => m.id === 'iceland')!;
    const b = createEngineClient(createEngine(def));
    const notices = b.load({ modelId: 'iceland', events: d.state.events, months: d.state.months, version: d.state.version });
    expect(notices.length).toBe(1);
    expect(notices[0]).toContain("'keyRateAddon' = 1");
    expect(b.scenario().events).toEqual([
      { t: 0, lever: 'keyRateLock', value: 1 },
      { t: 0, lever: 'incomeTaxLock', value: 1 },
      { t: 0, lever: 'keyRate', value: 4 },
      { t: 12, lever: 'keyRateLock', value: 0 },
      { t: 12, lever: 'incomeTaxLock', value: 0 },
    ]);
    expect(b.getFrame().stabilisers.every((s) => !s.locked)).toBe(true);
    // re-shared, the link is a current one
    expect(encodeScenarioHash(b.scenario())).toContain('v=2');
    b.dispose();
  });

  test('an old link replays the numbers it gave before padlocks (tests/fixtures/scenarios-v1.json)', () => {
    const fixtures = JSON.parse(readFileSync(join(import.meta.dir, '../fixtures/scenarios-v1.json'), 'utf8'));
    const f = fixtures['I3-takeover'];
    const hash = `m=iceland&t=${f.months}&e=${f.events.map((e: { t: number; lever: string; value: number }) => `${e.t}:${e.lever}:${e.value}`).join(',')}`;
    const d = decodeScenarioHash(hash);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const b = createEngineClient(createEngine(models.find((m) => m.id === 'iceland')!));
    b.load({ modelId: 'iceland', events: d.state.events, months: d.state.months, version: d.state.version });
    for (const [id, byMonth] of Object.entries(f.expected as Record<string, Record<string, number>>)) {
      // the fixture holds the engine's series(): an indicator where one has the id, else the variable
      const s = b.info.indicators.some((i) => i.id === id) ? b.series(id) : b.varSeries(id, 0, f.months);
      for (const [m, v] of Object.entries(byMonth)) expect(s[Number(m)]).toBe(v);
    }
    b.dispose();
  });
});
