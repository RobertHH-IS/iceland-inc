/**
 * Levers for the lever panel: accordion sections, stepping, the bar, "changed" state, the
 * padlocks on levers with a rule (decision 0010), the marks of locked stabilisers and the note
 * shown while every padlock is closed (decision 0014).
 * Pure functions over LeverInfo (a LeverDef without its `fire` function).
 */
import type { Id, ScenarioEvent, StabiliserState } from '../../core/types.ts';
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

/** Can the − (dir −1) or + (dir 1) stepper move the lever that way? Not at the edge of its range,
 *  and not from a value outside it (a padlock can freeze a lever at a value in force beyond its
 *  range, decision 0010), where the clamped step would move the other way. */
export function canStep(l: Pick<LeverInfo, 'step' | 'min' | 'max' | 'default'>, value: number, dir: 1 | -1): boolean {
  const next = stepLever(l, value, dir);
  return dir > 0 ? next > value : next < value;
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

/** A lever value with its unit, compactly: "+0.25 pp", "10%", "Floating". */
export function leverValueLabel(l: Pick<LeverInfo, 'unit' | 'kind' | 'options' | 'default'>, v: number): string {
  if (l.kind === 'choice' || l.kind === 'lock') {
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

/* ----------------------------------------------------------- padlocks */

/** What the panel needs of a stabiliser now (Engine.stabilisers(), decision 0010). */
export type PadlockState = Pick<StabiliserState, 'id' | 'label' | 'lever' | 'lock' | 'locked' | 'current'>;

/** The stabiliser behind each lever that has a rule, by lever id: those levers get a padlock. */
export function padlocksByLever<T extends PadlockState>(states: readonly T[]): Map<Id, T> {
  return new Map(states.map((s) => [s.lever, s]));
}

/** The value a lever shows: its own setting, or, while its padlock is open, the live value its
 *  rule sets (the knob moves with the rule). */
export function shownValue(value: number, pad?: PadlockState): number {
  return pad && !pad.locked && Number.isFinite(pad.current) ? pad.current : value;
}

/** Is a lever changed? A lever with a padlock is while it is locked (the user holds it; unlocked,
 *  its rule moves it, which is no change of the user's); others as isChanged. */
export function isLeverChanged(l: Pick<LeverInfo, 'kind' | 'default' | 'id'>, value: number, fired: Map<Id, number>, pad?: PadlockState): boolean {
  return pad ? pad.locked : isChanged(l, value, fired);
}

/** How many levers of a section are changed, padlocks counted as isLeverChanged does. `values` is
 *  by lever index (LeverInfo.index). */
export function changedCountWithLocks(section: LeverSection, values: readonly number[], fired: Map<Id, number>, pads: ReadonlyMap<Id, PadlockState>): number {
  let n = 0;
  for (const l of section.levers) if (isLeverChanged(l, values[l.index] ?? l.default, fired, pads.get(l.id))) n++;
  return n;
}

/** Does a lever get the "back to baseline" button? A setting or choice off its default, and for a
 *  lever with a padlock only while it is locked: the button sets the default and the lever stays
 *  locked (unlocking hands it to its rule, which is not the baseline). A one-off never does. */
export function canResetToBaseline(l: Pick<LeverInfo, 'kind' | 'default' | 'id'>, value: number, pad?: Pick<PadlockState, 'locked'>): boolean {
  if (l.kind === 'oneoff' || Math.abs(value - l.default) <= 1e-12) return false;
  return pad ? pad.locked : true;
}

/** A lever's name inside a sentence: "the key interest rate" (an acronym keeps its capitals: "the VAT rate"). */
const inSentence = (label: string) => `the ${/^[A-Z]{2}/.test(label) ? label : `${label.charAt(0).toLowerCase()}${label.slice(1)}`}`;

/** The padlock button's accessible name: what pressing it does. */
export function lockActionLabel(l: Pick<LeverInfo, 'label'>, locked: boolean): string {
  return `${locked ? 'Unlock' : 'Lock'} ${inSentence(l.label)}`;
}

/** The padlock button's title: what the padlock means now, in plain words, and what a press does.
 *  `note` (lockedAloneNotes) follows while the lever is locked alone. */
export function lockTitle(l: Pick<LeverInfo, 'label'>, pad: Pick<PadlockState, 'label' | 'locked'>, note?: string): string {
  const name = inSentence(l.label);
  return pad.locked
    ? `Locked: ${name} stays where you set it, and ${pad.label} only suggests. Unlock to hand it back to the rule, which carries on from where it is.${note ? ` ${note}` : ''}`
    : `Unlocked: ${pad.label} sets ${name}, and the lever follows it. Lock to hold it where it is; moving the lever locks it too.`;
}

/** The notes of stabilisers locked alone (StabiliserDef.lockedAloneNote), by lever: each locked
 *  stabiliser with a note, while another is unlocked. Empty while every padlock is closed (the
 *  all-locked line speaks then) or every one is open. `notes` is by stabiliser id. */
export function lockedAloneNotes(states: readonly Pick<PadlockState, 'id' | 'lever' | 'locked'>[], notes: ReadonlyMap<Id, string | undefined>): Map<Id, string> {
  const out = new Map<Id, string>();
  if (!states.some((s) => !s.locked)) return out;
  for (const s of states) {
    const note = s.locked ? notes.get(s.id) : undefined;
    if (note) out.set(s.lever, note);
  }
  return out;
}

/** The idea the locked-economy note links to (src/concepts/library.ts). */
export const NOMINAL_ANCHOR_CONCEPT: Id = 'nominal-anchor';

/** The one calm line the lever panel shows while every lever with a rule is locked (decision
 *  0014): with the key rate and income tax both held, the price level has no nominal anchor, by
 *  construction. "With the key interest rate and the income-tax rate both locked, nothing pulls
 *  prices back over the long run." Null while any padlock is open, and in a model without them. */
export function allLockedNote(states: readonly Pick<PadlockState, 'lever' | 'locked'>[], byId: ReadonlyMap<Id, Pick<LeverInfo, 'label'>>): string | null {
  if (!states.length || states.some((s) => !s.locked)) return null;
  const names = states.map((s) => inSentence(byId.get(s.lever)?.label ?? s.lever));
  const held =
    names.length === 1 ? `${names[0]} locked` : names.length === 2 ? `${names[0]} and ${names[1]} both locked` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} all locked`;
  return `With ${held}, nothing pulls prices back over the long run.`;
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
  /** Locked: the stabiliser would move this lever. `text` is "<label>: <suggestion>". */
  | { kind: 'calling'; stabiliser: Id; label: string; text: string; suggested: number; apply: number }
  /** Locked: the stabiliser calls, but "Apply" could not move the lever: the suggestion is beyond
   *  the lever's range (or within half a step of where it is). A note, not a call: no Apply. */
  | { kind: 'beyond'; stabiliser: Id; label: string; text: string; suggested: number };

/**
 * What the lever panel shows for each locked stabiliser, on its lever:
 *   calling: a red mark with its suggestion and "Apply";
 *   calling but Apply would not move the lever: the suggestion as a note, without Apply.
 * An unlocked stabiliser shows nothing here: its rule moves the lever, which shows the live value.
 * Values are in the lever's units, to two decimals. The engine's `calling` is left as it is (the
 * feed still says the rule calls); only the panel's call depends on Apply.
 */
export function stabiliserMarks(
  states: readonly { id: Id; label: string; lever: Id; suggested: number; current: number; calling: boolean; locked: boolean }[],
  byId: ReadonlyMap<Id, LeverInfo>,
): Map<Id, StabiliserMark> {
  const out = new Map<Id, StabiliserMark>();
  for (const s of states) {
    const l = byId.get(s.lever);
    if (!l || !s.locked || !s.calling || !Number.isFinite(s.suggested)) continue;
    const shown = leverValueLabel(l, Number(s.suggested.toFixed(2)));
    const apply = snapToStep(l, s.suggested);
    if (Math.abs(apply - s.current) >= 1e-12) out.set(s.lever, { kind: 'calling', stabiliser: s.id, label: s.label, text: `${s.label}: ${shown}`, suggested: s.suggested, apply });
    else {
      const outside = (l.min !== undefined && s.suggested < l.min) || (l.max !== undefined && s.suggested > l.max);
      out.set(s.lever, { kind: 'beyond', stabiliser: s.id, label: s.label, text: `${s.label}: ${shown} (${outside ? 'beyond the lever’s range' : 'the nearest step is where the lever is'})`, suggested: s.suggested });
    }
  }
  return out;
}

/** Does any lever of a section have a stabiliser calling that Apply would answer (the red dot on its header)? */
export function sectionCalling(section: LeverSection, marks: ReadonlyMap<Id, StabiliserMark>): boolean {
  return section.levers.some((l) => marks.get(l.id)?.kind === 'calling');
}
