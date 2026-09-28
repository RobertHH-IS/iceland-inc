/**
 * Levers for the lever panel: accordion sections, stepping, the bar and "changed" state.
 * Pure functions over LeverInfo (a LeverDef without its `fire` function).
 */
import type { Id, ScenarioEvent } from '../../core/types.ts';
import type { LeverInfo } from './info.ts';

export interface LeverSection {
  /** Section title: LeverDef.section, falling back to LeverDef.group. */
  id: string;
  title: string;
  group: string;
  levers: LeverInfo[];
}

/** Groups in this order first; any other group follows in order of first appearance. */
export const GROUP_ORDER = ['Policy', 'Economy', 'World'];

/** Group levers into accordion sections by `section` (fallback `group`), ordered by group then first appearance. */
export function leverSections(levers: LeverInfo[]): LeverSection[] {
  const sections = new Map<string, LeverSection>();
  const firstSeen = new Map<string, number>();
  levers.forEach((l, i) => {
    const title = (l.section ?? '').trim() || l.group;
    let s = sections.get(title);
    if (!s) {
      s = { id: title, title, group: l.group, levers: [] };
      sections.set(title, s);
      firstSeen.set(title, i);
    }
    s.levers.push(l);
  });
  const groupSeen = new Map<string, number>();
  levers.forEach((l, i) => {
    if (!groupSeen.has(l.group)) groupSeen.set(l.group, i);
  });
  const groupRank = (g: string) => {
    const k = GROUP_ORDER.indexOf(g);
    return k >= 0 ? k : GROUP_ORDER.length + groupSeen.get(g)!;
  };
  return [...sections.values()].sort((a, b) => groupRank(a.group) - groupRank(b.group) || firstSeen.get(a.id)! - firstSeen.get(b.id)!);
}

/** The step a stepper moves by: the lever's own, else a twentieth of its range, else 1. */
export function leverStep(l: Pick<LeverInfo, 'step' | 'min' | 'max'>): number {
  if (l.step && l.step > 0) return l.step;
  if (l.min !== undefined && l.max !== undefined && l.max > l.min) return niceStep((l.max - l.min) / 20);
  return 1;
}

/** Round a raw step to 1, 2 or 5 × a power of ten. */
export function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** Decimal places of a step (0.25 → 2), to keep stepped values free of floating-point dust. */
export function stepDecimals(step: number): number {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export function clampLever(l: Pick<LeverInfo, 'min' | 'max'>, v: number): number {
  let x = v;
  if (l.min !== undefined) x = Math.max(l.min, x);
  if (l.max !== undefined) x = Math.min(l.max, x);
  return x;
}

/** One click of the − or + stepper, snapped to the step grid (anchored at the default) and clamped. */
export function stepLever(l: Pick<LeverInfo, 'step' | 'min' | 'max' | 'default'>, value: number, dir: 1 | -1): number {
  const step = leverStep(l);
  const x = (value - l.default) / step;
  // The next grid point strictly above (or below) the value, so off-grid values snap back on.
  const k = dir > 0 ? Math.floor(x + 1e-9) + 1 : Math.ceil(x - 1e-9) - 1;
  const next = l.default + k * step;
  const d = Math.max(stepDecimals(step), stepDecimals(l.default));
  return clampLever(l, Number(next.toFixed(Math.min(12, d))));
}

export interface LeverBar {
  min: number;
  max: number;
  /** Positions along the bar, 0..1. */
  base: number;
  value: number;
  /** The filled span between the baseline marker and the value. */
  fillFrom: number;
  fillTo: number;
}

/** Bar geometry: range min..max (derived when the lever has none), the baseline marker and the value. */
export function leverBar(l: Pick<LeverInfo, 'step' | 'min' | 'max' | 'default'>, value: number): LeverBar {
  const step = leverStep(l);
  let min = l.min ?? l.default - 10 * step;
  let max = l.max ?? l.default + 10 * step;
  min = Math.min(min, value, l.default);
  max = Math.max(max, value, l.default);
  const span = max - min || 1;
  const pos = (v: number) => (v - min) / span;
  const base = pos(l.default),
    val = pos(value);
  return { min, max, base, value: val, fillFrom: Math.min(base, val), fillTo: Math.max(base, val) };
}

/** Times each one-off lever has been fired in the scenario. */
export function firedCounts(events: readonly ScenarioEvent[]): Map<Id, number> {
  const out = new Map<Id, number>();
  for (const e of events) if (e.fire) out.set(e.lever, (out.get(e.lever) ?? 0) + 1);
  return out;
}

/** A setting or choice is changed when it is off its default; a one-off when it has been fired. */
export function isChanged(l: Pick<LeverInfo, 'kind' | 'default' | 'id'>, value: number, fired: Map<Id, number>): boolean {
  if (l.kind === 'oneoff') return (fired.get(l.id) ?? 0) > 0;
  return Math.abs(value - l.default) > 1e-12;
}

/** How many levers of a section are changed. `values` is by lever index (LeverInfo.index). */
export function changedCount(section: LeverSection, values: readonly number[], fired: Map<Id, number>): number {
  let n = 0;
  for (const l of section.levers) if (isChanged(l, values[l.index] ?? l.default, fired)) n++;
  return n;
}

/** A lever value with its unit, compactly: "+0.25 pp", "10%", "Floating". */
export function leverValueLabel(l: Pick<LeverInfo, 'unit' | 'kind' | 'options' | 'default'>, v: number): string {
  if (l.kind === 'choice') {
    const o = l.options?.find((x) => Math.abs(x.value - v) < 1e-12);
    if (o) return o.label;
  }
  const d = Math.abs(v) < 1e-12 ? 0 : v;
  const s = Number(d.toFixed(6)).toString().replace('-', '−');
  const signed = l.default === 0 && d > 0 && l.kind !== 'oneoff' ? '+' + s : s;
  const u = l.unit.trim();
  if (!u) return signed;
  return u.startsWith('%') ? `${signed}${u}` : `${signed} ${u}`;
}

/* ------------------------------------------------ showWhen and stabilisers */

type ShowWhenLever = Pick<LeverInfo, 'id' | 'default' | 'index' | 'showWhen'>;

/** Values `showWhen` accepts, as a list. */
const showValues = (sw: NonNullable<LeverInfo['showWhen']>): number[] => (Array.isArray(sw.equals) ? sw.equals : [sw.equals]);

/**
 * Is a lever shown? Only while the lever its `showWhen` names has one of the listed values (by
 * lever index in `values`; a lever missing from `byId` counts as absent, so the lever shows).
 */
export function isShown(l: Pick<LeverInfo, 'showWhen'>, values: readonly number[], byId: ReadonlyMap<Id, ShowWhenLever>): boolean {
  const sw = l.showWhen;
  if (!sw) return true;
  const other = byId.get(sw.lever);
  if (!other) return true;
  const v = values[other.index] ?? other.default;
  return showValues(sw).some((x) => Math.abs(x - v) < 1e-9);
}

/** How many shown levers of a section are changed: a hidden lever never counts. */
export function shownChangedCount(section: LeverSection, values: readonly number[], fired: Map<Id, number>, byId: ReadonlyMap<Id, ShowWhenLever>): number {
  let n = 0;
  for (const l of section.levers) if (isShown(l, values, byId) && isChanged(l, values[l.index] ?? l.default, fired)) n++;
  return n;
}

/**
 * Setting a lever that others' `showWhen` depends on (the stabiliser setting) hides some of them.
 * Each lever that the new value hides and that is off its default goes back to its default, so a
 * hidden lever never carries a setting the user cannot see: switching to Automatic resets the
 * Manual key rate, switching to Manual resets the offset to the rule.
 */
export function resetsWhenSetting(levers: readonly ShowWhenLever[], values: readonly number[], lever: Id, value: number): { id: Id; value: number }[] {
  const out: { id: Id; value: number }[] = [];
  for (const l of levers) {
    const sw = l.showWhen;
    if (!sw || sw.lever !== lever) continue;
    const shownAfter = showValues(sw).some((x) => Math.abs(x - value) < 1e-9);
    const v = values[l.index] ?? l.default;
    if (!shownAfter && Math.abs(v - l.default) > 1e-12) out.push({ id: l.id, value: l.default });
  }
  return out;
}

/**
 * Resets a scenario is missing: the ones resetsWhenSetting would have added at each month that
 * sets a lever others' `showWhen` depends on, for the values in force at that month. The panel
 * adds resets when the user switches mode, from the values at that moment; but after time
 * travel, a lever changed before a later mode switch would otherwise keep its value through the
 * switch, hidden (decision 0004: a hidden lever never carries a setting the user cannot see).
 * Lever values depend only on the events, so the walk needs no simulation. Events for unknown
 * levers are ignored; the result is empty when nothing is missing.
 */
export function missingModeResets(levers: readonly ShowWhenLever[], events: readonly ScenarioEvent[]): ScenarioEvent[] {
  const byId = new Map(levers.map((l) => [l.id, l]));
  const controls = new Set(levers.flatMap((l) => (l.showWhen ? [l.showWhen.lever] : [])));
  const values: number[] = [];
  for (const l of levers) values[l.index] = l.default;
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const out: ScenarioEvent[] = [];
  for (let i = 0; i < sorted.length; ) {
    const t = sorted[i].t;
    const set = new Set<Id>();
    for (; i < sorted.length && sorted[i].t === t; i++) {
      const e = sorted[i],
        l = byId.get(e.lever);
      if (!l || e.fire) continue;
      values[l.index] = e.value;
      if (controls.has(e.lever)) set.add(e.lever);
    }
    for (const c of set)
      for (const r of resetsWhenSetting(levers, values, c, values[byId.get(c)!.index])) {
        out.push({ t, lever: r.id, value: r.value });
        values[byId.get(r.id)!.index] = r.value;
      }
  }
  return out;
}

/** The value the "Apply" button sets: the nearest point of the lever's step grid (anchored at
 *  its default), clamped to its range and free of floating-point dust. */
export function snapToStep(l: Pick<LeverInfo, 'step' | 'min' | 'max' | 'default'>, v: number): number {
  const step = leverStep(l);
  const k = Math.round((v - l.default) / step);
  const d = Math.max(stepDecimals(step), stepDecimals(l.default));
  return clampLever(l, Number((l.default + k * step).toFixed(Math.min(12, d))));
}

export type StabiliserMark =
  /** Manual: the stabiliser would move this lever. `text` is "<label>: <suggestion>". */
  | { kind: 'calling'; stabiliser: Id; label: string; text: string; suggested: number; apply: number }
  /** Manual: the stabiliser calls, but "Apply" could not move the lever: the suggestion is beyond
   *  the lever's range (or within half a step of where it is). A note, not a call: no Apply. */
  | { kind: 'beyond'; stabiliser: Id; label: string; text: string; suggested: number }
  /** Automatic: the stabiliser acts on the policy this lever offsets. `text` is "Set by <label>: <value>". */
  | { kind: 'acting'; stabiliser: Id; label: string; text: string };

/**
 * What the lever panel shows for each stabiliser, by the lever it belongs to:
 *   Manual, calling: a red mark on the stabiliser's lever, with its suggestion and "Apply";
 *   Manual, calling but Apply would not move the lever: the suggestion as a note, without Apply;
 *   Automatic: a note on the lever that offsets the rule (the lever itself unless declared).
 * Values are in the stabiliser lever's units, to two decimals. The engine's `calling` is left
 * as it is (the feed still says the rule calls); only the panel's call depends on Apply.
 */
export function stabiliserMarks(
  states: readonly { id: Id; label: string; lever: Id; offset: Id; suggested: number; current: number; calling: boolean; automatic: boolean }[],
  byId: ReadonlyMap<Id, LeverInfo>,
): Map<Id, StabiliserMark> {
  const out = new Map<Id, StabiliserMark>();
  for (const s of states) {
    const l = byId.get(s.lever);
    if (!l || !Number.isFinite(s.suggested)) continue;
    const shown = leverValueLabel(l, Number(s.suggested.toFixed(2)));
    if (s.automatic) out.set(s.offset, { kind: 'acting', stabiliser: s.id, label: s.label, text: `Set by ${s.label}: ${shown}` });
    else if (s.calling) {
      const apply = snapToStep(l, s.suggested);
      if (Math.abs(apply - s.current) >= 1e-12) out.set(s.lever, { kind: 'calling', stabiliser: s.id, label: s.label, text: `${s.label}: ${shown}`, suggested: s.suggested, apply });
      else {
        const outside = (l.min !== undefined && s.suggested < l.min) || (l.max !== undefined && s.suggested > l.max);
        out.set(s.lever, { kind: 'beyond', stabiliser: s.id, label: s.label, text: `${s.label}: ${shown} (${outside ? 'beyond the lever’s range' : 'the nearest step is where the lever is'})`, suggested: s.suggested });
      }
    }
  }
  return out;
}

/** Does any shown lever of a section have a stabiliser calling that Apply would answer (the red dot on its header)? */
export function sectionCalling(section: LeverSection, marks: ReadonlyMap<Id, StabiliserMark>, values: readonly number[], byId: ReadonlyMap<Id, ShowWhenLever>): boolean {
  return section.levers.some((l) => marks.get(l.id)?.kind === 'calling' && isShown(l, values, byId));
}
