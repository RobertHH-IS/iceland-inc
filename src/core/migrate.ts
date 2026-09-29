/**
 * Scenario format versions and the migration between them (decision 0010).
 *
 * Format 1 had one global stabiliser setting (Manual or Automatic, decision 0004): on Manual every
 * stabiliser's policy was held at a level lever of its own, on Automatic the rules acted and offset
 * levers tilted them. Format 2 has a padlock on each lever with a rule. A format-1 event list is
 * rewritten, in month order, as the model's `legacyStabiliserMode` describes:
 *
 *   - the model's old default mode, if Manual: every padlock closed at month 0;
 *   - the setting switched to Manual: every padlock closed at that month, then each held lever set
 *     to the level the old Manual mode would have read (so the run is the old one, number for
 *     number, rather than one frozen at the rule's value);
 *   - the setting switched to Automatic: every padlock opened at that month;
 *   - a held level set on Manual: the same event, under the lever's new id (keyRateFixed → keyRate);
 *     set on Automatic, where it did nothing, it is dropped (and remembered for a later switch);
 *   - an offset (keyRateAddon, incomeTaxOffset): dropped. If one was away from 0 while its rule
 *     acted, the run changes, and a notice says that the rule can no longer be tilted.
 *
 * Kept apart from scenario.ts so that the engine can migrate a scenario it is asked to load.
 */
import type { CompiledModel, Id, Scenario, ScenarioEvent } from './types.ts';

/** The scenario format this kernel writes. */
export const SCENARIO_VERSION = 2;

export interface MigrationResult {
  scenario: Scenario;
  /** Plain-English notes on anything the migration could not carry over exactly. */
  notices: string[];
}

/** A scenario's format version: 1 when it does not say (every scenario before padlocks). */
export const scenarioVersion = (s: Pick<Scenario, 'version'>): number => s.version ?? 1;

/**
 * Bring a scenario to the current format for a model. A current scenario comes back unchanged
 * (a copy); a format-1 scenario of a model without `legacyStabiliserMode` only gets its version.
 */
export function migrateScenario(model: CompiledModel, s: Scenario): MigrationResult {
  const version = scenarioVersion(s);
  const copy = (events: ScenarioEvent[]): Scenario => ({ ...s, events: events.map((e) => ({ ...e })), version: SCENARIO_VERSION });
  if (version >= SCENARIO_VERSION) return { scenario: copy(s.events), notices: [] };
  if (version !== 1) throw new Error(`unknown scenario version ${version}`);
  const legacy = model.def.legacyStabiliserMode;
  if (!legacy) return { scenario: copy(s.events), notices: [] };

  const locks = model.levers.filter((l) => l.kind === 'lock').map((l) => l.id);
  const isManual = (v: number) => Math.abs(v - legacy.manual) < Math.abs(v - legacy.automatic);
  const leverDefault = (id: Id) => model.levers.find((l) => l.id === id)?.default ?? 0;
  // the value each old lever has now, starting from the defaults of the levers that replace them
  const value = new Map<Id, number>();
  for (const [from, to] of Object.entries(legacy.held)) value.set(from, leverDefault(to));
  for (const id of legacy.offsets) if (!value.has(id)) value.set(id, 0);

  const out: ScenarioEvent[] = [];
  const notices: string[] = [];
  const tilted = new Set<Id>();
  let manual = isManual(legacy.default);
  const noteTilts = (t: number) => {
    if (manual) return;
    for (const id of legacy.offsets) {
      const v = value.get(id) ?? 0;
      if (v === 0 || tilted.has(id)) continue;
      tilted.add(id);
      notices.push(
        `From month ${t} this scenario tilted a policy rule with '${id}' = ${v}. Rules can no longer be tilted, so that setting was dropped and the rule acts as it is. To hold a policy away from its rule, lock its lever and set it.`,
      );
    }
  };
  if (manual) for (const id of locks) out.push({ t: 0, lever: id, value: 1 });

  const events = [...s.events].sort((a, b) => a.t - b.t);
  for (const e of events) {
    if (e.fire) {
      out.push({ ...e });
      continue;
    }
    if (e.lever === legacy.lever) {
      const next = isManual(e.value);
      if (next && !manual) {
        for (const id of locks) out.push({ t: e.t, lever: id, value: 1 });
        for (const [from, to] of Object.entries(legacy.held)) out.push({ t: e.t, lever: to, value: value.get(from)! });
      } else if (!next && manual) for (const id of locks) out.push({ t: e.t, lever: id, value: 0 });
      manual = next;
      noteTilts(e.t);
      continue;
    }
    const heldAs = legacy.held[e.lever];
    const isOffset = legacy.offsets.includes(e.lever);
    if (heldAs !== undefined || isOffset) {
      value.set(e.lever, e.value);
      if (heldAs !== undefined && manual) out.push({ t: e.t, lever: heldAs, value: e.value });
      noteTilts(e.t);
      continue;
    }
    out.push({ ...e });
  }
  return { scenario: copy(out), notices };
}
