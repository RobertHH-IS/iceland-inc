/**
 * Scenarios: a list of lever events plus a length. Plain data, so they can be shared as a
 * file or URL, replayed exactly and compared (architecture §4.6).
 */
import type { CompiledModel, Engine, Id, ModelDef, RunResult, Scenario, ScenarioEvent } from './types.ts';
import { createEngine, type EngineOptions, type KernelEngine } from './engine.ts';
import type { KModel } from './compile.ts';
import { SCENARIO_VERSION } from './migrate.ts';

/** The format tag of scenario files this kernel writes; '@1' files (before padlocks) still load
 *  and are migrated (migrate.ts, decision 0010). */
export const SCENARIO_FORMAT = `iceland-inc/scenario@${SCENARIO_VERSION}`;
const FORMAT_RE = /^iceland-inc\/scenario@(\d+)$/;

/** Events that close (or open) every padlock at month t: every policy lever with a rule locked,
 *  as the old Manual setting held them, or unlocked (decision 0010). */
export function lockAllEvents(m: Pick<CompiledModel, 'levers'>, t = 0, locked = true): ScenarioEvent[] {
  return m.levers.filter((l) => l.kind === 'lock').map((l) => ({ t, lever: l.id, value: locked ? 1 : 0 }));
}

/** Close (or open) every padlock of an engine now (see lockAllEvents). */
export function lockAll(e: Pick<Engine, 'model' | 'setLever'>, locked = true): void {
  for (const x of lockAllEvents(e.model, 0, locked)) e.setLever(x.lever, x.value);
}

export function makeScenario(modelId: Id, events: ScenarioEvent[], months: number): Scenario {
  return { modelId, events: events.map((e) => ({ ...e })), months };
}

/** Serialise with a format tag (the scenario's own version, the current one unless it says
 *  otherwise), events sorted by month (stable). */
export function stringifyScenario(s: Scenario): string {
  const events = [...s.events].sort((a, b) => a.t - b.t).map((e) => (e.fire ? { t: e.t, lever: e.lever, value: e.value, fire: true } : { t: e.t, lever: e.lever, value: e.value }));
  const format = `iceland-inc/scenario@${s.version ?? SCENARIO_VERSION}`;
  return JSON.stringify({ format, modelId: s.modelId, months: s.months, events }, null, 2);
}

/** Parse and validate the shape of a scenario file (lever ids are checked by the engine). The
 *  result carries the file's format version: a file without a format tag is version 1. Load it
 *  with engine.load, which migrates an old version, or migrate it first (migrateScenario) to
 *  show the user what changed. */
export function parseScenario(text: string): Scenario {
  const x = JSON.parse(text) as Record<string, unknown>;
  let version = 1;
  if (x.format !== undefined) {
    const mt = typeof x.format === 'string' ? FORMAT_RE.exec(x.format) : null;
    version = mt ? Number(mt[1]) : NaN;
    if (!(version >= 1 && version <= SCENARIO_VERSION)) throw new Error(`unknown scenario format '${String(x.format)}'`);
  }
  if (typeof x.modelId !== 'string') throw new Error('scenario needs a modelId');
  if (!(typeof x.months === 'number' && x.months >= 0)) throw new Error('scenario needs a non-negative number of months');
  if (!Array.isArray(x.events)) throw new Error('scenario needs an events list');
  const events = x.events.map((e: Record<string, unknown>, j: number) => {
    if (typeof e.t !== 'number' || typeof e.lever !== 'string' || typeof e.value !== 'number') throw new Error(`scenario event ${j + 1} needs t, lever and value`);
    return e.fire ? { t: e.t, lever: e.lever, value: e.value, fire: true } : { t: e.t, lever: e.lever, value: e.value };
  });
  return { modelId: x.modelId, months: x.months, events, version };
}

/**
 * Run a scenario from the baseline and return its RunResult (with the engine that ran it).
 * Given an engine, the run reuses its compiled model and solved baseline.
 */
export function runScenario(
  target: ModelDef | KModel | KernelEngine,
  events: ScenarioEvent[],
  months: number,
  opts: EngineOptions = {},
): RunResult & { engine: KernelEngine } {
  let engine: KernelEngine;
  if ('baselineData' in target) engine = createEngine(target.model, { ...target.options, ...opts, baseline: target.baselineData });
  else engine = createEngine(target, opts);
  engine.load({ modelId: engine.model.def.id, events, months });
  const r = engine.runResult();
  return { months: r.months, series: r.series, value: r.value, engine };
}
