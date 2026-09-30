/**
 * Scenarios the harness builds from a model's levers: the all-levers golden scenarios, the
 * lever-extremes sweep and the shock used to time a step. Kept apart from layers.ts so that
 * tests can check which events they contain without running the harness.
 *
 * The harness runs them in two lock configurations (decision 0010): 'unlocked', the default, where
 * every stabiliser's rule sets its policy lever, and 'locked', where every padlock is closed at
 * month 0 (the old Manual setting). Padlocks are configurations, not shocks, so no scenario moves
 * one as a lever. Moving a policy lever locks it, in either configuration.
 */
import type { Id, LeverDef, ScenarioEvent } from '../core/types.ts';
import type { KModel } from '../core/compile.ts';
import type { KernelEngine } from '../core/engine.ts';

export interface HarnessScenario {
  name: string;
  events: ScenarioEvent[];
  months: number;
}

/** Months recorded after the last event of the all-levers scenarios. */
export const ALL_LEVERS_TAIL = 36;
/** Months between one lever's event and the next in the all-levers scenarios. */
export const ALL_LEVERS_SPACING = 3;

/** A lock configuration: a label and the padlock events at month 0 that set it up. */
export interface LockConfig {
  label: string;
  events: ScenarioEvent[];
}

/** Every policy lever unlocked: the rules act (the default, the old Automatic). */
export const UNLOCKED = 'unlocked';
/** Every policy lever locked: nothing moves them unless the user does (the old Manual). */
export const LOCKED = 'locked';

/** The padlock levers of a model (kind 'lock', one per stabiliser). */
export const padlocks = (m: KModel): LeverDef[] => m.levers.filter((l) => l.kind === 'lock');

/**
 * The lock configurations, 'unlocked' then 'locked', and any `extra` ones (the lever report's
 * 'key rate locked'), each closing the padlocks it names at month 0. A model without stabilisers
 * has one unnamed configuration.
 */
export function lockConfigs(m: KModel, extra: readonly { label: string; locks: Id[] }[] = []): LockConfig[] {
  const locks = padlocks(m).map((l) => l.id);
  if (!locks.length) return [{ label: '', events: [] }];
  const close = (ids: readonly Id[]) => ids.map((lever): ScenarioEvent => ({ t: 0, lever, value: 1 }));
  for (const x of extra) for (const id of x.locks) if (!locks.includes(id)) throw new Error(`lock configuration '${x.label}' closes '${id}', which is not a padlock of model '${m.def.id}'`);
  return [{ label: UNLOCKED, events: [] }, { label: LOCKED, events: close(locks) }, ...extra.map((x) => ({ label: x.label, events: close(x.locks) }))];
}

/** The levers a scenario may move on its own: every lever except the padlocks. */
const shockLevers = (m: KModel): LeverDef[] => m.levers.filter((l) => l.kind !== 'lock');

/** A lever event: one-offs fire, settings and choices are set. */
const leverEvent = (l: LeverDef, t: number, value: number): ScenarioEvent => (l.kind === 'oneoff' ? { t, lever: l.id, value, fire: true } : { t, lever: l.id, value });

/**
 * Every lever other than a padlock, in declaration order and whether or not the lever panel shows
 * it (LeverDef.shown), moved in turn, one every ALL_LEVERS_SPACING months, each held for
 * the rest of the run, which ends ALL_LEVERS_TAIL months after the last event (an event at or
 * after the last month would never reach the recorded history). One-offs fire at their default
 * size; settings move halfway from their default to their max; choices take their first option
 * other than the default. With stabilisers there is one scenario per lock configuration, set at
 * month 0.
 */
export function allLeversScenarios(m: KModel): HarnessScenario[] {
  return lockConfigs(m).map(({ label, events }) => {
    const seq: ScenarioEvent[] = [];
    for (const l of shockLevers(m)) {
      const t = ALL_LEVERS_SPACING * seq.length;
      if (l.kind === 'oneoff') seq.push(leverEvent(l, t, l.default));
      else if (l.kind === 'choice') seq.push(leverEvent(l, t, l.options?.find((o) => o.value !== l.default)?.value ?? l.max ?? l.default + 1));
      else {
        const hi = l.max ?? l.default + 1;
        seq.push(leverEvent(l, t, Math.round((l.default + (hi - l.default) / 2) * 1000) / 1000));
      }
    }
    return {
      name: label ? `all-levers-${label.toLowerCase().replace(/ /g, '-')}` : 'all-levers',
      events: [...events, ...seq],
      months: ALL_LEVERS_SPACING * seq.length + ALL_LEVERS_TAIL,
    };
  });
}

export interface ExtremeRun {
  lever: Id;
  value: number;
  /** Lock configuration label, or '' when the model has no stabilisers. */
  mode: string;
  events: ScenarioEvent[];
}

/** The values a lever is swept to: its min and max (a choice: every option). A setting or choice
 *  skips its default and a one-off skips 0, since neither is a shock. */
export function extremeValues(l: LeverDef): number[] {
  const ends = l.kind === 'choice' && l.options?.length ? l.options.map((o) => o.value) : [l.min ?? l.default - 1, l.max ?? l.default + 1];
  return [...new Set(ends)].filter((v) => (l.kind === 'oneoff' ? v !== 0 : v !== l.default));
}

/**
 * The lever-extremes sweep: every lever alone, at each extreme value, from month 0, in each
 * lock configuration. The random property runs rarely land on a lever's limits; this covers them
 * all.
 */
export function leverExtremeRuns(m: KModel): ExtremeRun[] {
  const runs: ExtremeRun[] = [];
  for (const { label, events } of lockConfigs(m))
    for (const l of shockLevers(m))
      for (const value of extremeValues(l)) {
        const ev = leverEvent(l, 0, value);
        runs.push({ lever: l.id, value, mode: label, events: [...events, ev] });
      }
  return runs;
}

/**
 * The shock the step timing runs under: the first one-off lever, fired at its default size (or
 * its max when the default is 0); without one, the first setting (not a choice or a padlock,
 * which is a configuration rather than a shock) whose max differs from its default.
 */
export function timingShock(m: KModel): { describe: string; apply(e: KernelEngine): void } | null {
  const shock = m.levers.find((l) => l.kind === 'oneoff');
  if (shock) {
    const size = shock.default || (shock.max ?? 1);
    return { describe: `${shock.id} fired at ${size}`, apply: (e) => e.fire(shock.id, size) };
  }
  const s = shockLevers(m).find((l) => l.kind === 'setting' && l.max !== undefined && l.max !== l.default);
  if (s) return { describe: `${s.id} set to ${s.max}`, apply: (e) => e.setLever(s.id, s.max!) };
  return null;
}
