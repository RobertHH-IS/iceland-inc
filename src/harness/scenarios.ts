/**
 * Scenarios the harness builds from a model's levers: the all-levers golden scenarios. Kept apart
 * from layers.ts so that tests can check which events they contain without running the harness.
 */
import type { LeverDef, ScenarioEvent } from '../core/types.ts';
import type { KModel } from '../core/compile.ts';

export interface HarnessScenario {
  name: string;
  events: ScenarioEvent[];
  months: number;
}

/** Months recorded after the last event of the all-levers scenarios. */
export const ALL_LEVERS_TAIL = 36;
/** Months between one lever's event and the next in the all-levers scenarios. */
export const ALL_LEVERS_SPACING = 3;

/** The stabiliser modes as scenario events at month 0, or one unnamed mode when the model has no setting. */
export function stabiliserModes(m: KModel): { label: string; event?: ScenarioEvent }[] {
  const s = m.def.stabiliserMode;
  if (!s) return [{ label: '' }];
  return [
    { label: 'Manual', event: { t: 0, lever: s.lever, value: s.manual } },
    { label: 'Automatic', event: { t: 0, lever: s.lever, value: s.automatic } },
  ];
}

/** The levers a scenario may move on its own: every lever except the stabiliser setting itself. */
const shockLevers = (m: KModel): LeverDef[] => m.levers.filter((l) => l.id !== m.def.stabiliserMode?.lever);

/** A lever event: one-offs fire, settings and choices are set. */
const leverEvent = (l: LeverDef, t: number, value: number): ScenarioEvent => (l.kind === 'oneoff' ? { t, lever: l.id, value, fire: true } : { t, lever: l.id, value });

/**
 * Every lever moved in turn, one every ALL_LEVERS_SPACING months, each held for the rest of the
 * run, which ends ALL_LEVERS_TAIL months after the last event (an event at or after the last
 * month would never reach the recorded history). One-offs fire at their default size; settings
 * move halfway from their default to their max; choices take their first option other than the
 * default. With a stabiliser setting there is one scenario per mode, set at month 0, so that
 * every lever shown in only one mode (`showWhen`) acts in at least one of them.
 */
export function allLeversScenarios(m: KModel): HarnessScenario[] {
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
  const months = ALL_LEVERS_SPACING * seq.length + ALL_LEVERS_TAIL;
  return stabiliserModes(m).map(({ label, event }) => ({
    name: label ? `all-levers-${label.toLowerCase()}` : 'all-levers',
    events: event ? [event, ...seq] : seq,
    months,
  }));
}
