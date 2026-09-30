/**
 * Scenario format 2 and the migration of format-1 scenarios, written for the global stabiliser
 * setting, to padlocks (src/core/migrate.ts, decision 0010). The fixture holds format-1 scenarios
 * with values the engine gave before padlocks (tests/fixtures/scenarios-v1.json; Iceland's at two
 * kernel steps a month, decision 0011, and re-recorded with each deliberate change of the model
 * since, decisions 0012 and 0013 on the engine before padlocks; decision 0015's downturn clause
 * moves I2-auto's tourism slump from month 24, and I2-auto was re-recorded on this engine, which
 * gave the old engine's values bit for bit before that change and applies the same rule): migrated, they
 * must give the same numbers bit for bit, except where an offset tilted a rule or, in the reference
 * economy, from a switch to Automatic after a hold (the rules now take over smoothly; a notice says so).
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { migrateScenario, SCENARIO_VERSION, scenarioVersion } from '../../src/core/migrate.ts';
import { parseScenario, SCENARIO_FORMAT, stringifyScenario } from '../../src/core/scenario.ts';
import type { ScenarioEvent } from '../../src/core/types.ts';
import { models } from '../../src/models/index.ts';

const iceland = compile(models.find((m) => m.id === 'iceland')!);
const reference = compile(models.find((m) => m.id === 'reference')!);
const v1 = (modelId: string, events: ScenarioEvent[], months = 24) => ({ modelId, events, months, version: 1 });
const migrate = (m: typeof iceland, events: ScenarioEvent[]) => migrateScenario(m, v1(m.def.id, events));

describe('scenario format versions', () => {
  test('files are written as format 2; a format-1 file, or one without a tag, reads as version 1', () => {
    expect(SCENARIO_VERSION).toBe(2);
    expect(SCENARIO_FORMAT).toBe('iceland-inc/scenario@2');
    const now = parseScenario(stringifyScenario({ modelId: 'iceland', events: [], months: 3 }));
    expect(now.version).toBe(2);
    expect(parseScenario('{"format":"iceland-inc/scenario@1","modelId":"iceland","months":3,"events":[]}').version).toBe(1);
    expect(parseScenario('{"modelId":"iceland","months":3,"events":[]}').version).toBe(1);
    expect(() => parseScenario('{"format":"iceland-inc/scenario@3","modelId":"iceland","months":3,"events":[]}')).toThrow(/unknown scenario format/);
    expect(stringifyScenario({ modelId: 'iceland', events: [], months: 3, version: 1 })).toContain('scenario@1');
    // an object without a version is the current format, as Scenario.version says; only a file or
    // link without a tag is version 1, and the parsers set that explicitly (review m3)
    expect(scenarioVersion({})).toBe(SCENARIO_VERSION);
    expect(scenarioVersion({ version: 1 })).toBe(1);
  });

  test('migrateScenario and engine.load agree on a scenario without a version: the current format, unchanged', () => {
    const s = { modelId: 'iceland', events: [{ t: 0, lever: 'keyRate', value: 4 }], months: 12 };
    expect(migrateScenario(iceland, s)).toEqual({ scenario: { ...s, version: SCENARIO_VERSION }, notices: [] });
    const e = createEngine(iceland, { dev: false });
    e.load(s);
    expect(e.events.map((x) => x.lever)).toEqual(['keyRate']);
  });

  test('a current scenario comes back unchanged', () => {
    const s = { modelId: 'iceland', events: [{ t: 0, lever: 'keyRate', value: 4 }], months: 12, version: 2 };
    expect(migrateScenario(iceland, s)).toEqual({ scenario: s, notices: [] });
  });
});

describe('migrating the stabiliser setting to padlocks', () => {
  test('Iceland’s old default was Manual: every padlock closes at month 0, and a held level keeps its new id', () => {
    const { scenario, notices } = migrate(iceland, [
      { t: 0, lever: 'keyRateFixed', value: 4 },
      { t: 6, lever: 'incomeTax', value: 1 },
    ]);
    expect(scenario.version).toBe(2);
    expect(scenario.events).toEqual([
      { t: 0, lever: 'keyRateLock', value: 1 },
      { t: 0, lever: 'incomeTaxLock', value: 1 },
      { t: 0, lever: 'keyRate', value: 4 },
      { t: 6, lever: 'incomeTax', value: 1 },
    ]);
    expect(notices).toEqual([]);
  });

  test('stabilisers = 1 unlocks every padlock; = 0 locks them and sets each held lever to the level Manual would read', () => {
    const { scenario } = migrate(iceland, [
      { t: 0, lever: 'stabilisers', value: 1 },
      { t: 0, lever: 'wageSettlement', value: 10, fire: true },
      { t: 12, lever: 'incomeTax', value: 2 }, // on Automatic: no effect, but remembered
      { t: 24, lever: 'stabilisers', value: 0 },
      { t: 30, lever: 'stabilisers', value: 1 },
    ]);
    expect(scenario.events).toEqual([
      { t: 0, lever: 'keyRateLock', value: 1 },
      { t: 0, lever: 'incomeTaxLock', value: 1 },
      { t: 0, lever: 'keyRateLock', value: 0 },
      { t: 0, lever: 'incomeTaxLock', value: 0 },
      { t: 0, lever: 'wageSettlement', value: 10, fire: true },
      { t: 24, lever: 'keyRateLock', value: 1 },
      { t: 24, lever: 'incomeTaxLock', value: 1 },
      { t: 24, lever: 'keyRate', value: 3 },
      { t: 24, lever: 'incomeTax', value: 2 },
      { t: 30, lever: 'keyRateLock', value: 0 },
      { t: 30, lever: 'incomeTaxLock', value: 0 },
    ]);
  });

  test('offsets are dropped; a notice says so when one tilted a rule that was acting', () => {
    const quiet = migrate(iceland, [{ t: 0, lever: 'keyRateAddon', value: 1 }]); // on Manual it did nothing
    expect(quiet.scenario.events).toEqual([
      { t: 0, lever: 'keyRateLock', value: 1 },
      { t: 0, lever: 'incomeTaxLock', value: 1 },
    ]);
    expect(quiet.notices).toEqual([]);
    const tilted = migrate(iceland, [
      { t: 0, lever: 'keyRateAddon', value: 1 },
      { t: 6, lever: 'stabilisers', value: 1 }, // now it acts
      { t: 8, lever: 'incomeTaxOffset', value: -2 },
      { t: 9, lever: 'incomeTaxOffset', value: 0 },
    ]);
    expect(tilted.scenario.events.map((e) => e.lever)).toEqual(['keyRateLock', 'incomeTaxLock', 'keyRateLock', 'incomeTaxLock']);
    expect(tilted.notices.length).toBe(2);
    expect(tilted.notices[0]).toContain("From month 6 this scenario tilted a policy rule with 'keyRateAddon' = 1");
    expect(tilted.notices[0]).toContain('Rules can no longer be tilted');
    expect(tilted.notices[1]).toContain("'incomeTaxOffset' = -2");
  });

  test('the reference economy’s old default was Automatic, and its tax lever was a level on Manual and an offset on Automatic', () => {
    const { scenario, notices } = migrate(reference, [
      { t: 0, lever: 'taxRate', value: 1 }, // an offset on Automatic: dropped, with a notice
      { t: 12, lever: 'stabilisers', value: 0 }, // Manual reads it as a level from here
      { t: 12, lever: 'keyRateFixed', value: 4 },
    ]);
    expect(scenario.events).toEqual([
      { t: 12, lever: 'keyRateLock', value: 1 },
      { t: 12, lever: 'taxRateLock', value: 1 },
      { t: 12, lever: 'keyRate', value: 3 },
      { t: 12, lever: 'taxRate', value: 1 },
      { t: 12, lever: 'keyRate', value: 4 },
    ]);
    expect(notices.length).toBe(1);
    expect(notices[0]).toContain("'taxRate' = 1");
  });

  test('the reference economy’s rules now take over smoothly: a switch to Automatic after a hold gets a notice, one with nothing held before it does not', () => {
    const held = migrate(reference, [
      { t: 0, lever: 'stabilisers', value: 0 },
      { t: 0, lever: 'keyRateFixed', value: 6 },
      { t: 24, lever: 'stabilisers', value: 1 },
    ]);
    expect(held.notices.length).toBe(1);
    expect(held.notices[0]).toContain('From month 24 the policy rules take over');
    const none = migrate(reference, [
      { t: 6, lever: 'stabilisers', value: 0 },
      { t: 6, lever: 'stabilisers', value: 1 },
    ]);
    expect(none.notices).toEqual([]);
    // Iceland's rules already stepped from the held rate (decisions 0007 and 0009): no notice
    expect(migrate(iceland, [{ t: 24, lever: 'stabilisers', value: 1 }]).notices).toEqual([]);
  });

  test('a model without a legacy setting loads a format-1 scenario unchanged', () => {
    const m = compile({ ...models[0], legacyStabiliserMode: undefined });
    const events = [{ t: 0, lever: 'govSpending', value: 1 }];
    expect(migrateScenario(m, v1(m.def.id, events)).scenario.events).toEqual(events);
  });

  test('engine.load migrates a format-1 scenario itself', () => {
    const e = createEngine(iceland, { dev: false });
    e.load(v1('iceland', [{ t: 0, lever: 'stabilisers', value: 1 }, { t: 0, lever: 'wageSettlement', value: 10, fire: true }], 12));
    expect(e.events.map((x) => x.lever)).toEqual(['keyRateLock', 'incomeTaxLock', 'keyRateLock', 'incomeTaxLock', 'wageSettlement']);
    expect(e.stabilisers().every((s) => !s.locked)).toBe(true);
  });
});

describe('format-1 scenarios give the numbers they gave before padlocks', () => {
  // `notice`: the start of the one notice a scenario whose numbers change from a month on must get;
  // its values are recorded only up to that month.
  type Fixture = { modelId: string; months: number; events: ScenarioEvent[]; notice?: string; expected: Record<string, Record<string, number>> };
  const fixtures = JSON.parse(readFileSync(join(import.meta.dir, '../fixtures/scenarios-v1.json'), 'utf8')) as Record<string, Fixture>;
  const engines = { iceland: createEngine(iceland, { dev: false }), reference: createEngine(reference, { dev: false }) };
  for (const [name, f] of Object.entries(fixtures))
    test(`${name}: every recorded value, bit for bit`, () => {
      const e = engines[f.modelId as keyof typeof engines];
      const { scenario, notices } = migrateScenario(e.model, v1(f.modelId, f.events, f.months));
      if (f.notice) {
        expect(notices.length).toBe(1);
        expect(notices[0]).toStartWith(f.notice);
      } else expect(notices).toEqual([]);
      e.load(scenario);
      for (const [id, byMonth] of Object.entries(f.expected)) {
        const series = e.series(id).map((p) => p.v);
        for (const [m, v] of Object.entries(byMonth)) expect(`${id}@${m} = ${series[Number(m)]}`).toBe(`${id}@${m} = ${v}`);
      }
    });
});
