import { describe, expect, test } from 'bun:test';
import { models } from '../../src/models/index.ts';
import { createEngine } from '../../src/core/engine.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { decodeScenarioHash, encodeScenarioHash, hasScenario } from '../../src/ui/model/scenario-url.ts';

describe('scenario URL hash', () => {
  test('round-trips events, months and model exactly', () => {
    const s = {
      modelId: 'reference',
      months: 36,
      events: [
        { t: 12, lever: 'wageSettlement', value: 10, fire: true },
        { t: 0, lever: 'keyRateAddon', value: 0.1 + 0.2 },
        { t: 24, lever: 'keyRateAddon', value: -1.75 },
      ],
    };
    const hash = encodeScenarioHash(s);
    expect(hash).toBe('m=reference&t=36&e=0:keyRateAddon:0.30000000000000004,12:!wageSettlement:10,24:keyRateAddon:-1.75');
    const d = decodeScenarioHash('#' + hash);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.state.modelId).toBe('reference');
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
    for (const bad of ['#t=-3', '#t=1.5', '#e=0:x', '#e=a:x:1', '#e=0:x:abc', '#e=0::1', '#e=0:x:'])
      expect(decodeScenarioHash(bad).ok).toBe(false);
  });

  test('unknown keys are ignored (room for view state later)', () => {
    const d = decodeScenarioHash('#m=reference&t=2&view=ledger');
    expect(d.ok && d.state.months).toBe(2);
  });

  test('a shared link replays the same numbers', () => {
    const def = models.find((m) => m.id === 'reference')!;
    const a = createEngineClient(createEngine(def));
    a.setLever('keyRateAddon', 1);
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

  test('share links carry the stabiliser setting, which is a lever event like any other', () => {
    const def = models.find((m) => m.id === 'iceland')!;
    const a = createEngineClient(createEngine(def));
    a.setLever('incomeTax', 1);
    a.pause();
    a.step(6);
    a.setLever('stabilisers', 1);
    a.pause();
    a.step(6);
    const hash = encodeScenarioHash(a.scenario());
    expect(hash).toContain('6:stabilisers:1');
    const d = decodeScenarioHash(hash);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    const b = createEngineClient(createEngine(def));
    b.load({ modelId: d.state.modelId!, events: d.state.events, months: d.state.months });
    expect(b.getFrame().levers[b.info.leverById.get('stabilisers')!.index]).toBe(1);
    expect(b.series('keyRate')).toEqual(a.series('keyRate'));
    expect(b.getFrame().stabilisers).toEqual(a.getFrame().stabilisers);
    a.dispose();
    b.dispose();
  });
});
