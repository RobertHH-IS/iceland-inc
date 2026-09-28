/**
 * Scenarios: a list of lever events plus a length. Plain data, so they can be shared as a
 * file or URL, replayed exactly and compared (architecture §4.6).
 */
import type { Id, ModelDef, RunResult, Scenario, ScenarioEvent } from './types.ts';
import { createEngine, type EngineOptions, type KernelEngine } from './engine.ts';
import type { KModel } from './compile.ts';

export const SCENARIO_FORMAT = 'iceland-inc/scenario@1';

export function makeScenario(modelId: Id, events: ScenarioEvent[], months: number): Scenario {
  return { modelId, events: events.map((e) => ({ ...e })), months };
}

/** Serialise with a format tag, events sorted by month (stable). */
export function stringifyScenario(s: Scenario): string {
  const events = [...s.events].sort((a, b) => a.t - b.t).map((e) => (e.fire ? { t: e.t, lever: e.lever, value: e.value, fire: true } : { t: e.t, lever: e.lever, value: e.value }));
  return JSON.stringify({ format: SCENARIO_FORMAT, modelId: s.modelId, months: s.months, events }, null, 2);
}

/** Parse and validate the shape of a scenario file (lever ids are checked by the engine). */
export function parseScenario(text: string): Scenario {
  const x = JSON.parse(text) as Record<string, unknown>;
  if (x.format !== undefined && x.format !== SCENARIO_FORMAT) throw new Error(`unknown scenario format '${String(x.format)}'`);
  if (typeof x.modelId !== 'string') throw new Error('scenario needs a modelId');
  if (!(typeof x.months === 'number' && x.months >= 0)) throw new Error('scenario needs a non-negative number of months');
  if (!Array.isArray(x.events)) throw new Error('scenario needs an events list');
  const events = x.events.map((e: Record<string, unknown>, j: number) => {
    if (typeof e.t !== 'number' || typeof e.lever !== 'string' || typeof e.value !== 'number') throw new Error(`scenario event ${j + 1} needs t, lever and value`);
    return e.fire ? { t: e.t, lever: e.lever, value: e.value, fire: true } : { t: e.t, lever: e.lever, value: e.value };
  });
  return { modelId: x.modelId, months: x.months, events };
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
