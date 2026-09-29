/**
 * The lever-response report: every lever of a model moved hard, one at a time, and every effect
 * measured against the no-change run in the same stabiliser mode, month by month. The output is
 * for vetting: a person or an agent reads it to judge whether each response is plausible and
 * whether the right economics drives it. It never changes the model; it only runs it.
 *
 *   settings   a setting at its min, its max and a moderate step each way from its default
 *              (a quarter of the distance to each bound, snapped to its step); a one-off at its
 *              min, its max, its default size and half of it, and those two with the opposite
 *              sign where the range allows; a choice at every option other than its default
 *   runs       each setting applied before month 1 (event t = 0, so month 1 is the first month
 *              it acts) and held, in every stabiliser mode where the lever is shown (showWhen)
 *   effects    shocked − no-change, in the variable's display unit (% of the no-change level
 *              for levels, pp for rates and shares, the indicator's unit otherwise), at fixed
 *              horizons, with the peak and the long-run value
 *   flags      each with a threshold in LEVER_THRESHOLDS, explained in the report
 *   companions a lever that can act only on top of another shock (lever-headlines.ts) is also
 *              run with that shock and measured against the run with the shock alone
 *   expectations  what theory predicts (src/models/<id>/expectations.ts), marked ✓ or ✗; an
 *              expectation on the stabiliser setting itself is checked on the switch: the
 *              no-change run of the other mode, measured against the no-change run of its own
 *
 * The harness runs the same measurement as a regression gate (layers.ts, robustness layer): with
 * `onlyExpected` it makes only the runs some expectation needs, through its own `run`, so it can
 * reuse the runs it has already made.
 *
 * `bun run levers` (lever-cli.ts) writes reports/levers/<model>.md and .json; lever-render.ts
 * renders them. The headline variables per model are declared in lever-headlines.ts.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compile, type KModel } from '../core/compile.ts';
import { createEngine, type KernelEngine } from '../core/engine.ts';
import { runScenario } from '../core/scenario.ts';
import type { Id, IndicatorDef, LeverDef, ModelDef, ScenarioEvent } from '../core/types.ts';
import { leverReportSpecs, type Companion, type LeverReportSpec, type PolicyInstrument } from './lever-headlines.ts';
import { firstNonFinite, plausibilityBounds, plausibilityBreaches } from './plausibility.ts';
import { stabiliserModes } from './scenarios.ts';

export const LEVER_REPORT_FORMAT = 'iceland-inc/levers@1';
export const DEFAULT_MONTHS = 240;
/** Months at which every effect is recorded (those beyond the run are left out). */
export const HORIZONS = [1, 3, 6, 12, 24, 36, 60, 120, 240];
/** The long-run value is the mean effect over this many final months. */
export const LONG_RUN_MONTHS = 12;

/** Every threshold a flag uses, in display units (% or pp) unless stated otherwise. */
export const LEVER_THRESHOLDS = {
  /** Largest accounting residual allowed (any of the four checks). */
  residual: 1e-9,
  /** Extreme: a headline level moves by more than extremePct % of its no-change level, or a
   *  headline rate or ratio by more than extremePp pp, in some month. */
  extremePct: 50,
  extremePp: 25,
  /** A policy instrument moved on Manual when it differs from the no-change run by more than
   *  this, in model units (a fraction for rates). */
  policyMove: 1e-9,
  /** An effect smaller than this counts as zero (display units). */
  floor: 0.01,
  /** Rows whose effect never reaches this are listed as unmoved instead of tabulated. */
  unmoved: 0.005,
  /** Month-1 jump: a gradual headline whose month-1 effect is at least this share of its peak
   *  (same sign)… */
  jumpShare: 0.75,
  /** …when the peak is at least this large. */
  jumpFloor: 0.05,
  /** Sawtooth: within the first `sawWindow` months, at least `sawRun` sign alternations in a
   *  row of month-to-month changes, each change larger than max(sawAbs, sawRel × |peak|). */
  sawWindow: 60,
  sawRun: 4,
  sawAbs: 0.001,
  sawRel: 0.01,
  /** Not settled: the effect moved by more than max(settleAbs, settleRel × |peak|) over the
   *  final 12 months. */
  settleAbs: 0.02,
  settleRel: 0.02,
  /** Explosive: not settled, the final effect at least explodeFactor times the largest effect in
   *  the first half of the run and at least explodeFloor, and still accelerating: its move over the
   *  final 12 months at least explodeAccel times its move over the 12 months five years earlier. A
   *  level that grows steadily (a price level whose inflation has settled at an offset) is only
   *  unsettled. */
  explodeFactor: 2,
  explodeFloor: 1,
  explodeAccel: 1.2,
  explodeLookback: 60,
  /** Asymmetry at month `asymMonth`: the responses per unit of lever to the moderate up and down
   *  steps differ in sign or by more than a factor asymRatio, the larger effect at least asymFloor. */
  asymMonth: 12,
  asymRatio: 3,
  asymFloor: 0.05,
  /** Manual and Automatic disagree at month `modeMonth` when their effects have opposite signs,
   *  each at least modeFloor. */
  modeMonth: 12,
  modeFloor: 0.02,
  /** A rule's regime flickers when its label changes at least this many times within
   *  sawWindow months (any window). */
  flickerSwitches: 6,
};

export type FlagKind =
  | 'nonFinite'
  | 'residual'
  | 'sign'
  | 'implausible'
  | 'extreme'
  | 'policyMoved'
  | 'jump'
  | 'sawtooth'
  | 'unsettled'
  | 'explosive'
  | 'asymmetry'
  | 'modeSign'
  | 'flicker'
  | 'inert'
  | 'regime';

/** The flags in report order, with a column title and what each means (for the report). */
export const FLAG_KINDS: { kind: FlagKind; title: string; meaning: string }[] = [
  { kind: 'nonFinite', title: 'Non-finite', meaning: 'A variable or stock became NaN or infinite.' },
  { kind: 'residual', title: 'Residual', meaning: `An accounting check's residual exceeded ${LEVER_THRESHOLDS.residual}.` },
  { kind: 'sign', title: 'Sign', meaning: 'A position took the wrong sign for its role (CheckReport.signViolations): an overdrawn asset or a liability turned into a claim.' },
  { kind: 'implausible', title: 'Implausible', meaning: 'A variable broke an economic bound of the harness (plausibility.ts): unemployment outside [0, 50%], a price index at or below zero, a negative key rate.' },
  { kind: 'extreme', title: 'Extreme', meaning: `A headline moved further than any routine policy change should move it: a level by more than ${LEVER_THRESHOLDS.extremePct}% of its no-change value, or a rate or ratio by more than ${LEVER_THRESHOLDS.extremePp} pp, in some month. Usually a runaway nominal path; check it before anything else in the run.` },
  { kind: 'policyMoved', title: 'Policy moved', meaning: `On Manual, a policy instrument whose own levers were not moved differs from the no-change run by more than ${LEVER_THRESHOLDS.policyMove} (model units).` },
  { kind: 'jump', title: 'Month-1 jump', meaning: `A headline that should adjust gradually has ${100 * LEVER_THRESHOLDS.jumpShare}% or more of its peak effect already in month 1 (peak at least ${LEVER_THRESHOLDS.jumpFloor}).` },
  { kind: 'sawtooth', title: 'Sawtooth', meaning: `In the first ${LEVER_THRESHOLDS.sawWindow} months, ${LEVER_THRESHOLDS.sawRun} or more sign alternations in a row of month-to-month changes, each above max(${LEVER_THRESHOLDS.sawAbs}, ${100 * LEVER_THRESHOLDS.sawRel}% of the peak).` },
  { kind: 'unsettled', title: 'Unsettled', meaning: `Still moving at the end: the effect changed by more than max(${LEVER_THRESHOLDS.settleAbs}, ${100 * LEVER_THRESHOLDS.settleRel}% of the peak) over the final 12 months.` },
  { kind: 'explosive', title: 'Explosive', meaning: `Unsettled, the final effect at least ${LEVER_THRESHOLDS.explodeFactor}× the largest effect in the first half of the run and at least ${LEVER_THRESHOLDS.explodeFloor}, and still accelerating: it moved at least ${LEVER_THRESHOLDS.explodeAccel}× as much in the final 12 months as in the 12 months ${LEVER_THRESHOLDS.explodeLookback / 12} years earlier. A level that grows steadily, such as a price level whose inflation has settled at an offset, is only unsettled.` },
  { kind: 'asymmetry', title: 'Asymmetry', meaning: `At month ${LEVER_THRESHOLDS.asymMonth}, the effects per unit of lever of the moderate up and down steps differ in sign or by more than ${LEVER_THRESHOLDS.asymRatio}× (larger effect at least ${LEVER_THRESHOLDS.asymFloor}). Caps and floors that bind one way are the usual cause.` },
  { kind: 'modeSign', title: 'Mode sign', meaning: `At month ${LEVER_THRESHOLDS.modeMonth}, Manual and Automatic move a non-policy headline in opposite directions (each at least ${LEVER_THRESHOLDS.modeFloor}).` },
  { kind: 'flicker', title: 'Flicker', meaning: `A rule's regime label changed ${LEVER_THRESHOLDS.flickerSwitches} or more times within ${LEVER_THRESHOLDS.sawWindow} months: a floor or cap switching on and off.` },
  { kind: 'inert', title: 'Inert', meaning: `No run of the lever moves any headline or indicator by ${LEVER_THRESHOLDS.unmoved} or more in any month. Either the lever needs another shock to act on (then the report also runs it with a declared companion shock), or it is not wired to anything.` },
  { kind: 'regime', title: 'Regimes', meaning: 'At least one rule ran in a different regime (a floor, cap or limit binding or released) from the no-change run in the same month. Informational: it shows what drives the result.' },
];

/** The flags that mean a run is broken (the first row of the table in docs/authoring.md §12). */
export const BROKEN_FLAGS: FlagKind[] = ['nonFinite', 'residual', 'sign', 'implausible'];

export interface Flag {
  kind: FlagKind;
  detail: string;
}

/** What each unit the report shows means. A tracked unit missing here fails the report, so a new
 *  unit gets defined before anyone reads it. */
export const UNIT_MEANINGS: Record<string, string> = {
  '%': 'the percent difference from the no-change run’s level in the same month',
  '% (+ stronger)': 'the percent difference from the no-change run’s level; positive is a stronger króna',
  pp: 'the difference in percentage points of a rate or a share (a rate of 4% against 3% is +1 pp)',
  'pp of GDP': 'the difference, in percentage points, of a ratio to nominal GDP: this month’s GDP at an annual rate, or GDP over the past 12 months, as the variable’s definition says. A ratio does not grow with the price level',
  'pp of baseline GDP': 'the difference in a nominal amount, in % of baseline annual GDP (baseline GDP = 100). It is not divided by current GDP, so it grows with the price level',
};

/** A series the report follows: a headline or an indicator, as a level with a display transform. */
export interface Tracked {
  id: Id;
  label: string;
  /** Unit of the effect, a key of UNIT_MEANINGS. */
  unit: string;
  display: IndicatorDef['display'];
  gradual: boolean;
  policy: boolean;
  /** Level series of a finished run, months + 1 values. */
  levels(e: KernelEngine): Float64Array;
}

/** A lever value the report runs, with the roles it plays (a value can be both 'min' and '-half'). */
export interface LeverSetting {
  value: number;
  roles: string[];
  label: string;
}

export interface SeriesSummary {
  id: Id;
  /** Effect at each of the report's horizons, in order. */
  at: number[];
  peak: number;
  peakMonth: number;
  longRun: number;
}

export interface RegimeUse {
  rule: Id;
  /** Labels the rule showed in the months it differed from the no-change run ('–' for none),
   *  and the no-change label it replaced. */
  labels: string[];
  noChange: string[];
  /** Month ranges (inclusive) in which it differed. */
  months: [number, number][];
  /** Changes of the rule's own label from one month to the next, over the run, and the most
   *  within any sawWindow months (with the first month of that window). */
  switches: number;
  densest: number;
  densestFrom: number;
}

export interface ExpectationResult {
  lever: Id;
  setting: number | string;
  mode: string;
  variable: Id;
  fromMonth: number;
  toMonth: number;
  sign: number;
  theory: string;
  source: string;
  withCompanion: boolean;
  /** Mean effect over the window per matching run, and whether its sign is the expected one. */
  checks: { value: number; mode: string; mean: number; pass: boolean }[];
  /** True when every matching run passes (false when none matched). */
  pass: boolean;
}

export interface LeverRun {
  lever: Id;
  value: number;
  label: string;
  roles: string[];
  mode: string;
  /** True for a run on top of the lever's companion shock, measured against the companion alone. */
  companion?: boolean;
  headlines: SeriesSummary[];
  indicators: SeriesSummary[];
  flags: Flag[];
  regimes: RegimeUse[];
  /** Full monthly effect paths of the headlines (only when paths are asked for). */
  paths?: Record<Id, number[]>;
}

export interface LeverSection {
  id: Id;
  label: string;
  kind: LeverDef['kind'];
  unit: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
  description: string;
  definition: string;
  settings: LeverSetting[];
  /** Modes in which the lever is hidden (LeverDef.showWhen) and therefore not run. */
  skipped: { mode: string; why: string }[];
  runs: LeverRun[];
  /** The declared companion shock, and the runs on top of it (lever-headlines.ts). */
  companion?: Companion & { label: string };
  companionRuns: LeverRun[];
  /** Flags that compare runs: asymmetry of the moderate steps, Manual against Automatic, and an
   *  inert lever. `companion` marks those among the companion runs. */
  crossFlags: CrossFlag[];
}

export type CrossFlag = Flag & { mode?: string; value?: number; companion?: boolean };

export interface LeverReport {
  format: typeof LEVER_REPORT_FORMAT;
  modelId: Id;
  label: string;
  months: number;
  horizons: number[];
  thresholds: typeof LEVER_THRESHOLDS;
  modes: string[];
  stabiliserLever?: Id;
  headlines: { id: Id; label: string; unit: string; gradual: boolean; policy: boolean }[];
  indicators: { id: Id; label: string; unit: string }[];
  policy: PolicyInstrument[];
  missing: string[];
  /** Units used in the report, with their meaning (UNIT_MEANINGS). */
  units: { unit: string; meaning: string }[];
  /** Rules with a non-additive combine (a min, a max, a cap) but no regime label: when their
   *  kinks bind, the Regimes and Flicker flags cannot see it. */
  untraced: Id[];
  /** The no-change run in each mode: its flags and largest move of a headline level from the
   *  baseline (it should stay flat). */
  noChange: { mode: string; flags: Flag[]; drift: number }[];
  levers: LeverSection[];
  expectations: ExpectationResult[] | null;
  runs: number;
}

/** An expectation another engineer can declare in src/models/<id>/expectations.ts. `setting` is a
 *  lever value or one of the roles ('min', 'max', 'up', 'down', 'default', 'half', '-default',
 *  '-half'); `mode` 'Manual', 'Automatic' or 'any' (the default); `sign` +1, −1 or 0 for the mean
 *  effect over [fromMonth, toMonth] (0: smaller than the report's floor). */
export interface LeverExpectation {
  lever: Id;
  setting: number | string;
  mode?: 'Manual' | 'Automatic' | 'any';
  variable: Id;
  fromMonth: number;
  toMonth: number;
  sign: 1 | -1 | 0;
  theory: string;
  source: string;
  /** Match the runs on top of the lever's companion shock instead of the plain runs. */
  withCompanion?: boolean;
}

export interface LeverReportOptions {
  months?: number;
  /** Keep the full monthly effect path of every headline in each run. */
  paths?: boolean;
  /** Only these levers (the default: every lever). */
  levers?: Id[];
  /** Expectations to mark; the default reads src/models/<id>/expectations.ts when it exists. */
  expectations?: LeverExpectation[] | null;
  /** Replace a model's declared spec (tests). */
  spec?: LeverReportSpec;
  /** Make only the runs an expectation needs (the harness gate): levers without expectations are
   *  left out, and so are the settings, modes and companion runs no expectation matches. */
  onlyExpected?: boolean;
  /** The engine at the baseline that every run starts from (default: a fresh one). */
  engine?: KernelEngine;
  /** How to run a scenario from the baseline engine (default: runScenario). The harness passes one
   *  that reuses the runs it has already made and tracks the accounting of the rest. */
  run?: (events: ScenarioEvent[], months: number) => KernelEngine;
}

/** An effect for a table or a flag: 0 below the unmoved threshold, else 2 decimals (1 from 10,
 *  none from 100). */
export const fmtEffect = (x: number) => {
  if (!Number.isFinite(x)) return String(x);
  if (Math.abs(x) < LEVER_THRESHOLDS.unmoved) return '0';
  const a = Math.abs(Number(x.toFixed(2)));
  return a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : x.toFixed(2);
};
const num = fmtEffect;

/* ------------------------------------------------------------------ settings */

const clean = (x: number) => Number(x.toFixed(10));
/** `from` moved by `delta`, the distance snapped to the lever's step with halves rounded away
 *  from zero, so a step up and a step down of the same distance mirror each other. */
const stepFrom = (l: LeverDef, from: number, delta: number) => clean(from + Math.sign(delta) * (l.step ? l.step * Math.round(clean(Math.abs(delta) / l.step)) : Math.abs(delta)));
const fmtValue = (x: number) => String(clean(x));

/**
 * The values a lever is run at, in ascending order. A setting: min, max and a moderate step
 * each way (a quarter of the distance from the default to the bound, snapped to the step, at
 * least one step). A one-off: min, max, its default size and half of it, and those with the
 * opposite sign where the range allows; never 0. A choice: every option but the default.
 */
export function leverSettings(l: LeverDef): LeverSetting[] {
  const out = new Map<number, LeverSetting>();
  const add = (v: number, role: string, label?: string) => {
    v = clean(v);
    if (l.min !== undefined && v < l.min - 1e-12) return;
    if (l.max !== undefined && v > l.max + 1e-12) return;
    if (l.kind === 'oneoff' ? v === 0 : v === l.default) return;
    const s = out.get(v);
    if (s) s.roles.push(role);
    else out.set(v, { value: v, roles: [role], label: label ?? '' });
  };
  if (l.kind === 'choice') {
    for (const o of l.options ?? []) add(o.value, 'option', o.label);
  } else if (l.kind === 'oneoff') {
    const lo = l.min ?? -Math.abs(l.default),
      hi = l.max ?? Math.abs(l.default);
    add(lo, 'min');
    add(hi, 'max');
    const half = stepFrom(l, 0, l.default / 2);
    add(l.default, 'default');
    add(half, 'half');
    add(-l.default, '-default');
    add(-half, '-half');
  } else {
    const lo = l.min ?? l.default - 1,
      hi = l.max ?? l.default + 1;
    add(lo, 'min');
    add(hi, 'max');
    const step = l.step ?? 0;
    if (hi > l.default) add(Math.min(hi, Math.max(stepFrom(l, l.default, (hi - l.default) / 4), l.default + step)), 'up');
    if (lo < l.default) add(Math.max(lo, Math.min(stepFrom(l, l.default, -(l.default - lo) / 4), l.default - step)), 'down');
  }
  const list = [...out.values()].sort((a, b) => a.value - b.value);
  for (const s of list) if (!s.label) s.label = `${fmtValue(s.value)} ${l.unit} (${s.roles.join(', ')})`;
  return list;
}

/** The moderate pair the asymmetry flag compares, as [down, up], with the value each is measured
 *  from (a setting's default; 0 for a one-off, which is not fired in the no-change run). */
export function moderatePair(l: LeverDef, settings: LeverSetting[]): { down: LeverSetting; up: LeverSetting; from: number } | null {
  if (l.kind === 'setting') {
    const up = settings.find((s) => s.roles.includes('up')),
      down = settings.find((s) => s.roles.includes('down'));
    return up && down ? { up, down, from: l.default } : null;
  }
  if (l.kind === 'oneoff') {
    const a = settings.find((s) => s.roles.includes('half')),
      b = settings.find((s) => s.roles.includes('-half'));
    if (!a || !b) return null;
    return a.value > b.value ? { up: a, down: b, from: 0 } : { up: b, down: a, from: 0 };
  }
  return null;
}

/** Whether a lever is hidden while the stabiliser setting has `modeValue` (LeverDef.showWhen);
 *  a condition on another lever is judged at that lever's default. */
export function hiddenIn(m: KModel, l: LeverDef, modeValue: number | undefined): boolean {
  const w = l.showWhen;
  if (!w) return false;
  const equals = Array.isArray(w.equals) ? w.equals : [w.equals];
  const other = w.lever === m.def.stabiliserMode?.lever && modeValue !== undefined ? modeValue : (m.levers.find((x) => x.id === w.lever)?.default ?? NaN);
  return !equals.includes(other);
}

/* ------------------------------------------------------------------ series */

/** A display unit without 'vs baseline': '%', 'pp', 'pp of GDP', '% (+ stronger)'. */
const effectUnit = (unit: string) => unit.replace(/\s*vs baseline\s*/, ' ').replace(/\s+/g, ' ').trim();

/** The level of an indicator from its displayed value and baseline level (inverse of toDisplay). */
function levelFromDisplay(display: IndicatorDef['display'], d: number, base: number): number {
  switch (display) {
    case 'deviation-pct':
      return Math.abs(base) > 1e-12 ? base * (1 + d / 100) : base + d / 100;
    case 'deviation-pp':
      return base + d / 100;
    case 'deviation':
      return base + d;
    default:
      return d;
  }
}

/** Effect of a shocked level against the no-change level, in display units. */
export function effectOf(display: IndicatorDef['display'], shocked: number, ref: number): number {
  switch (display) {
    case 'deviation-pct':
      return Math.abs(ref) > 1e-12 ? (shocked / ref - 1) * 100 : (shocked - ref) * 100;
    case 'deviation-pp':
      return (shocked - ref) * 100;
    default:
      return shocked - ref;
  }
}

/** The headlines and the indicators of a model as tracked series. */
export function trackedSeries(m: KModel, base: KernelEngine, spec: LeverReportSpec): { headlines: Tracked[]; indicators: Tracked[] } {
  const baseCtx = { v: (id: Id) => base.baseline(id), base: (id: Id) => base.baseline(id), stock: (i: Id, p: Id) => base.baseStock(i, p), baseStock: (i: Id, p: Id) => base.baseStock(i, p) };
  const fromIndicator = (ind: IndicatorDef, over: { label?: string; gradual?: boolean; policy?: boolean } = {}): Tracked => {
    const b = ind.compute(baseCtx);
    return {
      id: ind.id,
      label: over.label ?? ind.label,
      unit: effectUnit(ind.unit),
      display: ind.display,
      gradual: !!over.gradual,
      policy: !!over.policy,
      levels: (e) => Float64Array.from(e.series(ind.id), (p) => levelFromDisplay(ind.display, p.v, b)),
    };
  };
  const indicators = m.indicators.map((ind) => fromIndicator(ind));
  const headlines = spec.headlines.map((h): Tracked => {
    if ('indicator' in h) {
      const ind = m.indicators.find((x) => x.id === h.indicator);
      if (!ind) throw new Error(`lever report: headline indicator '${h.indicator}' is not in model '${m.def.id}'`);
      return fromIndicator(ind, h);
    }
    for (const v of h.vars) if (!m.varIndex.has(v)) throw new Error(`lever report: headline '${h.id}' reads '${v}', which is not a variable of model '${m.def.id}'`);
    const unit = h.display === 'deviation-pct' ? '%' : h.display === 'deviation-pp' ? 'pp' : (h.unit ?? m.vars[m.varIndex.get(h.vars[0])!].unit);
    return {
      id: h.id,
      label: h.label,
      unit,
      display: h.display,
      gradual: !!h.gradual,
      policy: !!h.policy,
      levels: (e) => {
        const out = new Float64Array(e.t + 1);
        for (let t = 0; t <= e.t; t++) out[t] = h.level((id) => e.valueAt(id, t));
        return out;
      },
    };
  });
  for (const t of [...headlines, ...indicators])
    if (!(t.unit in UNIT_MEANINGS)) throw new Error(`lever report: '${t.id}' of model '${m.def.id}' has the unit '${t.unit}', which UNIT_MEANINGS in src/harness/lever-report.ts does not define`);
  return { headlines, indicators };
}

/* ------------------------------------------------------------------ path tests */

/** Longest run of month-to-month changes that alternate in sign, each above `eps`, within the
 *  first `window` months: the number of alternations and the month the run starts. */
export function sawtooth(path: ArrayLike<number>, window: number, eps: number): { alternations: number; from: number } {
  let best = 0,
    bestFrom = 0,
    cur = 0,
    curFrom = 0,
    prev = 0;
  const end = Math.min(window, path.length - 1);
  for (let t = 1; t <= end; t++) {
    const d = path[t] - path[t - 1];
    const s = Math.abs(d) > eps ? Math.sign(d) : 0;
    if (s !== 0 && prev !== 0 && s === -prev) {
      if (cur === 0) curFrom = t - 1;
      cur++;
      if (cur > best) {
        best = cur;
        bestFrom = curFrom;
      }
    } else cur = 0;
    prev = s;
  }
  return { alternations: best, from: bestFrom };
}

/** Summary of an effect path: the effect at each horizon, the peak and the long-run mean. */
export function summarise(id: Id, path: ArrayLike<number>, horizons: number[]): SeriesSummary {
  const n = path.length - 1;
  let peak = 0,
    peakMonth = 0;
  for (let t = 1; t <= n; t++)
    // a later month must beat the peak by more than rounding to take it over
    if (Math.abs(path[t]) > Math.abs(peak) * (1 + 1e-9) + 1e-12 || Number.isNaN(path[t])) {
      peak = path[t];
      peakMonth = t;
      if (Number.isNaN(peak)) break;
    }
  const from = Math.max(1, n - LONG_RUN_MONTHS + 1);
  let s = 0;
  for (let t = from; t <= n; t++) s += path[t];
  return { id, at: horizons.map((h) => path[h]), peak, peakMonth, longRun: n >= 1 ? s / (n - from + 1) : 0 };
}

export type PathFlag = { kind: 'jump' | 'sawtooth' | 'unsettled' | 'explosive'; detail: string };

/** The flags one effect path raises on its own. */
export function pathFlags(tr: Pick<Tracked, 'gradual'>, path: ArrayLike<number>, sum: SeriesSummary): PathFlag[] {
  const T = LEVER_THRESHOLDS;
  const out: PathFlag[] = [];
  const n = path.length - 1;
  const peak = Math.abs(sum.peak);
  if (!Number.isFinite(peak)) return out;
  if (tr.gradual && n >= 1 && peak >= T.jumpFloor && Math.sign(path[1]) === Math.sign(sum.peak) && Math.abs(path[1]) >= T.jumpShare * peak)
    out.push({ kind: 'jump', detail: `${num(path[1])} in month 1 of a peak ${num(sum.peak)}` });
  const saw = sawtooth(path, T.sawWindow, Math.max(T.sawAbs, T.sawRel * peak));
  if (saw.alternations >= T.sawRun) out.push({ kind: 'sawtooth', detail: `${saw.alternations} alternations from month ${saw.from}` });
  if (n > 12) {
    const moved = Math.abs(path[n] - path[n - 12]);
    if (moved > Math.max(T.settleAbs, T.settleRel * peak)) {
      let early = 0;
      for (let t = 1; t <= Math.floor(n / 2); t++) early = Math.max(early, Math.abs(path[t]));
      const back = n - T.explodeLookback;
      const accelerating = back < 12 || Math.abs(path[n] - path[n - 12]) >= T.explodeAccel * Math.abs(path[back] - path[back - 12]);
      const explosive = Math.abs(path[n]) >= T.explodeFloor && Math.abs(path[n]) >= T.explodeFactor * early && accelerating;
      out.push({ kind: explosive ? 'explosive' : 'unsettled', detail: `moved ${num(path[n] - path[n - 12])} in the last 12 months, ${num(path[n])} at month ${n}` });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ runs */

/** Everything a run is compared with: the no-change run in the same mode. */
interface Reference {
  mode: string;
  modeValue?: number;
  modeEvent?: ScenarioEvent;
  /** The companion shock both runs share, if any. */
  extra?: ScenarioEvent;
  engine: KernelEngine;
  headlines: Float64Array[];
  indicators: Float64Array[];
  regimes: (string | null)[][];
  policy: Float64Array[];
}

/** Month ranges from a list of months in ascending order. */
function ranges(months: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const t of months) {
    const last = out[out.length - 1];
    if (last && last[1] === t - 1) last[1] = t;
    else out.push([t, t]);
  }
  return out;
}

/** Items joined with semicolons (each item may hold commas of its own). */
const listed = (xs: string[], max = 6) => (xs.length <= max ? xs.join('; ') : `${xs.slice(0, max).join('; ')}; and ${xs.length - max} more`);

/** Flags of the run's own health: non-finite values, residuals, signs, bounds. */
function healthFlags(m: KModel, e: KernelEngine, bounds = plausibilityBounds(m)): Flag[] {
  const flags: Flag[] = [];
  const nf = firstNonFinite(m, e);
  if (nf) flags.push({ kind: 'nonFinite', detail: nf });
  const res = e.maxResiduals().filter((r) => !(r.residual <= LEVER_THRESHOLDS.residual));
  if (res.length) flags.push({ kind: 'residual', detail: listed(res.map((r) => `${r.id} ${r.residual.toExponential(2)}`)) });
  const breaches = plausibilityBreaches(m, e, bounds);
  const signs = breaches.filter((b) => b.kind === 'sign'),
    bnd = breaches.filter((b) => b.kind === 'bound');
  if (signs.length) flags.push({ kind: 'sign', detail: listed(signs.map((b) => `${b.what} from month ${b.first} (furthest ${num(b.worst)})`), 4) });
  if (bnd.length) flags.push({ kind: 'implausible', detail: listed(bnd.map((b) => `${b.what} ${b.rule} from month ${b.first} (furthest ${num(b.worst)})`), 4) });
  return flags;
}

/** The regime rules of a model, by rule index. */
const regimeRules = (m: KModel) => m.rules.flatMap((r, j) => (r.regime ? [j] : []));
/** Rules that combine their terms non-additively but carry no regime label. */
export const untracedRules = (m: Pick<KModel, 'rules'>) => m.rules.filter((r) => r.combine && !r.regime).map((r) => r.id);

function regimeHistory(e: KernelEngine, rules: number[]): (string | null)[][] {
  const out: (string | null)[][] = [];
  for (let t = 0; t <= e.t; t++) {
    const r = e.regimesAt(t);
    out.push(rules.map((j) => r[j]));
  }
  return out;
}

/** Every regime rule whose label differs from the no-change run in some month: its labels, the
 *  months, and how often its own label changed (in all, and most within any sawWindow months). */
export function regimeUses(m: Pick<KModel, 'rules'>, rules: number[], shocked: (string | null)[][], ref: (string | null)[][]): RegimeUse[] {
  const out: RegimeUse[] = [];
  const window = LEVER_THRESHOLDS.sawWindow;
  rules.forEach((j, k) => {
    const months: number[] = [];
    const labels = new Set<string>(),
      before = new Set<string>();
    const changes: number[] = [];
    for (let t = 1; t < shocked.length; t++) {
      const s = shocked[t][k],
        r = ref[t][k];
      if (s !== shocked[t - 1][k]) changes.push(t);
      if (s === r) continue;
      months.push(t);
      labels.add(s ?? '–');
      before.add(r ?? '–');
    }
    // the most label changes within any `window` months
    let densest = 0,
      densestFrom = 0;
    for (let a = 0, b = 0; b < changes.length; b++) {
      while (changes[b] - changes[a] >= window) a++;
      if (b - a + 1 > densest) {
        densest = b - a + 1;
        densestFrom = changes[a];
      }
    }
    if (months.length) out.push({ rule: m.rules[j].id, labels: [...labels], noChange: [...before], months: ranges(months), switches: changes.length, densest, densestFrom });
  });
  return out;
}

/** Group path flags by kind into one flag each, naming the variables. */
function groupFlags(items: { label: string; flag: PathFlag }[]): Flag[] {
  const by = new Map<FlagKind, string[]>();
  for (const { label, flag } of items) {
    const l = by.get(flag.kind) ?? [];
    l.push(`${label}: ${flag.detail}`);
    by.set(flag.kind, l);
  }
  return [...by.entries()].map(([kind, ds]) => ({ kind, detail: listed(ds, 4) }));
}

/** The expectations a model declares in <modelsDir>/<id>/expectations.ts (an array exported as
 *  `expectations`), or null when it has none. */
export function readExpectations(modelId: Id, modelsDir = resolve(import.meta.dir, '..', 'models')): LeverExpectation[] | null {
  const path = join(modelsDir, modelId, 'expectations.ts');
  if (!existsSync(path)) return null;
  // Loaded synchronously through require so the report stays a plain function.
  const mod = require(path) as { expectations?: LeverExpectation[] };
  if (!Array.isArray(mod.expectations)) throw new Error(`src/models/${modelId}/expectations.ts must export an array named 'expectations'`);
  return mod.expectations;
}

/** What every run of one model is measured with. */
interface Setup {
  m: KModel;
  base: KernelEngine;
  spec: LeverReportSpec;
  headlines: Tracked[];
  indicators: Tracked[];
  rules: number[];
  bounds: ReturnType<typeof plausibilityBounds>;
  horizons: number[];
  policySeries(e: KernelEngine): Float64Array[];
  run(events: ScenarioEvent[], months: number): KernelEngine;
}

function setup(def: ModelDef | KModel, months: number, specOverride?: LeverReportSpec, given?: Pick<LeverReportOptions, 'engine' | 'run'>): Setup {
  const m = 'crules' in def ? def : compile(def);
  const spec = specOverride ?? leverReportSpecs[m.def.id];
  if (!spec) throw new Error(`lever report: no headline list for model '${m.def.id}' in src/harness/lever-headlines.ts`);
  for (const p of spec.policy) if (!m.varIndex.has(p.variable)) throw new Error(`lever report: policy instrument '${p.variable}' is not a variable of model '${m.def.id}'`);
  const base = given?.engine ?? createEngine(m);
  const { headlines, indicators } = trackedSeries(m, base, spec);
  return {
    m,
    base,
    spec,
    headlines,
    indicators,
    rules: regimeRules(m),
    bounds: plausibilityBounds(m),
    horizons: HORIZONS.filter((h) => h <= months),
    policySeries: (e) =>
      spec.policy.map((p) => {
        const out = new Float64Array(e.t + 1);
        for (let t = 0; t <= e.t; t++) out[t] = e.valueAt(p.variable, t);
        return out;
      }),
    run: given?.run ?? ((events, n) => runScenario(base, events, n).engine),
  };
}

/** The no-change run of one stabiliser mode, or the run with a companion shock alone. */
function reference(S: Setup, mode: { label: string; event?: ScenarioEvent }, months: number, extra?: ScenarioEvent): Reference {
  const e = S.run([...(mode.event ? [mode.event] : []), ...(extra ? [extra] : [])], months);
  return {
    mode: mode.label,
    modeValue: mode.event?.value,
    modeEvent: mode.event,
    extra,
    engine: e,
    headlines: S.headlines.map((h) => h.levels(e)),
    indicators: S.indicators.map((h) => h.levels(e)),
    regimes: regimeHistory(e, S.rules),
    policy: S.policySeries(e),
  };
}

/** Run the whole lever-response report for one model. Deterministic: no clock, no randomness. */
export function leverReport(def: ModelDef | KModel, opts: LeverReportOptions = {}): LeverReport {
  const months = Math.max(1, Math.round(opts.months ?? DEFAULT_MONTHS));
  const S = setup(def, months, opts.spec, opts);
  const { m, base, spec, headlines, indicators, horizons } = S;
  const expectations = opts.expectations !== undefined ? opts.expectations : readExpectations(m.def.id);
  const expResults: ExpectationResult[] | null = expectations
    ? expectations.map((x) => ({ lever: x.lever, setting: x.setting, mode: x.mode ?? 'any', variable: x.variable, fromMonth: x.fromMonth, toMonth: x.toMonth, sign: x.sign, theory: x.theory, source: x.source, withCompanion: !!x.withCompanion, checks: [], pass: false }))
    : null;

  // the no-change run of each mode
  const modes = stabiliserModes(m);
  const refs = modes.map((x) => reference(S, x, months));
  const noChange = refs.map((r) => {
    let drift = 0;
    const b = headlines.map((h) => h.levels(base));
    r.headlines.forEach((lv, i) => {
      for (let t = 0; t < lv.length; t++) drift = Math.max(drift, Math.abs(effectOf(headlines[i].display, lv[t], b[i][0])));
    });
    return { mode: r.mode, flags: healthFlags(m, r.engine, S.bounds), drift };
  });

  const modeLever = m.def.stabiliserMode?.lever;
  for (const x of expResults ?? []) if (!m.levers.some((l) => l.id === x.lever)) throw new Error(`expectation names lever '${x.lever}', which model '${m.def.id}' does not have`);
  // With onlyExpected, the expectations a run could match (by lever, companion, mode and setting).
  const wanted = (l: LeverDef, s: LeverSetting, mode: string, companion: boolean) =>
    !opts.onlyExpected || (expResults ?? []).some((x) => x.lever === l.id && x.withCompanion === companion && (x.mode === 'any' || x.mode === mode) && matchesSetting(x.setting, s));
  const levers = m.levers.filter(
    (l) => l.id !== modeLever && (!opts.levers || opts.levers.includes(l.id)) && (!opts.onlyExpected || (expResults ?? []).some((x) => x.lever === l.id)),
  );
  let runCount = 0;
  const eventOf = (l: LeverDef, value: number): ScenarioEvent => (l.kind === 'oneoff' ? { t: 0, lever: l.id, value, fire: true } : { t: 0, lever: l.id, value });
  const sections: LeverSection[] = levers.map((l) => {
    const settings = leverSettings(l);
    const skipped: { mode: string; why: string }[] = [];
    const runs: LeverRun[] = [];
    const companionRuns: LeverRun[] = [];
    const comp = spec.companions?.[l.id];
    const compLever = comp ? m.levers.find((x) => x.id === comp.lever) : undefined;
    if (comp && !compLever) throw new Error(`lever report: the companion of '${l.id}' is '${comp.lever}', which is not a lever of model '${m.def.id}'`);
    for (const ref of refs) {
      if (hiddenIn(m, l, ref.modeValue)) {
        const w = l.showWhen!;
        const shownIn = w.lever === modeLever ? refs.filter((r) => !hiddenIn(m, l, r.modeValue)).map((r) => r.mode) : [];
        skipped.push({ mode: ref.mode, why: shownIn.length ? `the lever is shown only on ${shownIn.join(' and ')} (showWhen)` : `the lever is shown only when ${w.lever} is ${[w.equals].flat().join(' or ')} (showWhen)` });
        continue;
      }
      const before = ref.modeEvent ? [ref.modeEvent] : [];
      for (const s of settings) {
        if (!wanted(l, s, ref.mode, false)) continue;
        const e = S.run([...before, eventOf(l, s.value)], months);
        runCount++;
        runs.push(measureRun(S, e, ref, { lever: l, setting: s, paths: !!opts.paths, expResults }));
      }
      if (comp && compLever && settings.some((s) => wanted(l, s, ref.mode, true))) {
        const extra = eventOf(compLever, comp.value);
        const compRef = reference(S, { label: ref.mode, event: ref.modeEvent }, months, extra);
        for (const s of settings) {
          if (!wanted(l, s, ref.mode, true)) continue;
          const e = S.run([...before, extra, eventOf(l, s.value)], months);
          runCount++;
          companionRuns.push(measureRun(S, e, compRef, { lever: l, setting: s, paths: !!opts.paths, expResults }));
        }
      }
    }
    const cross = crossFlags(l, settings, runs, headlines, horizons);
    if (comp) cross.push(...crossFlags(l, settings, companionRuns, headlines, horizons).map((f) => ({ ...f, companion: true })));
    return {
      id: l.id,
      label: l.label,
      kind: l.kind,
      unit: l.unit,
      default: l.default,
      min: l.min,
      max: l.max,
      step: l.step,
      description: l.description,
      definition: l.definition,
      settings,
      skipped,
      runs,
      ...(comp && compLever ? { companion: { ...comp, label: `${compLever.label} ${fmtValue(comp.value)} ${compLever.unit}` } } : {}),
      companionRuns,
      crossFlags: cross,
    };
  });
  // The stabiliser setting is not run as a lever: an expectation on it is checked on the switch
  // from one mode to the other with no shock, which is the other mode's no-change run.
  const modeDef = m.levers.find((l) => l.id === modeLever);
  if (expResults && modeDef && expResults.some((x) => x.lever === modeLever))
    for (const target of refs)
      for (const ref of refs) {
        if (ref === target || target.modeValue === undefined) continue;
        const setting: LeverSetting = { value: target.modeValue, roles: ['option'], label: `switch to ${target.mode}` };
        measureRun(S, target.engine, ref, { lever: modeDef, setting, paths: false, expResults });
      }
  if (expResults) for (const x of expResults) x.pass = x.checks.length > 0 && x.checks.every((c) => c.pass);

  return {
    format: LEVER_REPORT_FORMAT,
    modelId: m.def.id,
    label: m.def.label,
    months,
    horizons,
    thresholds: LEVER_THRESHOLDS,
    modes: modes.map((x) => x.label),
    stabiliserLever: modeLever,
    headlines: headlines.map((h) => ({ id: h.id, label: h.label, unit: h.unit, gradual: h.gradual, policy: h.policy })),
    indicators: indicators.map((h) => ({ id: h.id, label: h.label, unit: h.unit })),
    policy: spec.policy,
    missing: spec.missing ?? [],
    units: [...new Set([...headlines, ...indicators].map((t) => t.unit))].map((unit) => ({ unit, meaning: UNIT_MEANINGS[unit] })),
    untraced: untracedRules(m),
    noChange,
    levers: sections,
    expectations: expResults,
    runs: runCount,
  };
}

interface MeasureCtx {
  lever: LeverDef | null;
  setting: LeverSetting;
  paths: boolean;
  expResults: ExpectationResult[] | null;
}

/** Whether an expectation's setting (a value or a role) names a run's setting. */
export const matchesSetting = (x: number | string, s: LeverSetting) => (typeof x === 'number' ? Math.abs(x - s.value) < 1e-9 : s.roles.includes(x));

/** Measure one finished run against its no-change reference. */
function measureRun(S: Setup, e: KernelEngine, ref: Reference, c: MeasureCtx): LeverRun {
  const m = S.m;
  const flags = healthFlags(m, e, S.bounds);
  const pathItems: { label: string; flag: PathFlag }[] = [];
  const paths: Record<Id, number[]> = {};
  const effects = new Map<Id, Float64Array>();
  const measure = (list: Tracked[], refLevels: Float64Array[], isHeadline: boolean) =>
    list.map((tr, i) => {
      const lv = tr.levels(e),
        rl = refLevels[i];
      const path = new Float64Array(lv.length);
      for (let t = 0; t < lv.length; t++) path[t] = effectOf(tr.display, lv[t], rl[t]);
      const sum = summarise(tr.id, path, S.horizons);
      if (!effects.has(tr.id)) {
        effects.set(tr.id, path);
        for (const f of pathFlags(tr, path, sum)) pathItems.push({ label: tr.label, flag: f });
      }
      if (isHeadline && c.paths) paths[tr.id] = Array.from(path);
      return sum;
    });
  const headlines = measure(S.headlines, ref.headlines, true);
  const indicators = measure(S.indicators, ref.indicators, false);
  // headlines far outside any routine response
  const extreme: string[] = [];
  S.headlines.forEach((tr, i) => {
    const h = headlines[i];
    const limit = tr.display === 'deviation-pct' ? LEVER_THRESHOLDS.extremePct : LEVER_THRESHOLDS.extremePp;
    if (Math.abs(h.peak) > limit) extreme.push(`${tr.label} ${num(h.peak)} ${tr.unit} at month ${h.peakMonth}`);
  });
  if (extreme.length) flags.push({ kind: 'extreme', detail: listed(extreme, 5) });
  // policy instruments on Manual (or in a model without a stabiliser setting)
  if (ref.mode === 'Manual' || ref.mode === '') {
    const now = S.policySeries(e);
    const moved: string[] = [];
    S.spec.policy.forEach((p, k) => {
      if (c.lever && p.levers.includes(c.lever.id)) return;
      let worst = 0,
        at = 0;
      for (let t = 0; t < now[k].length; t++) {
        const d = now[k][t] - ref.policy[k][t];
        if (!(Math.abs(d) <= Math.abs(worst))) {
          worst = d;
          at = t;
        }
      }
      if (!(Math.abs(worst) <= LEVER_THRESHOLDS.policyMove)) {
        const unit = m.vars[m.varIndex.get(p.variable)!].unit;
        const shown = /fraction/.test(unit) ? `${num(100 * worst)} pp` : `${num(worst)} ${unit}`;
        moved.push(`${p.label} moved by up to ${shown} (month ${at})`);
      }
    });
    if (moved.length) flags.push({ kind: 'policyMoved', detail: moved.join('; ') });
  }
  flags.push(...groupFlags(pathItems));
  const regimes = regimeUses(m, S.rules, regimeHistory(e, S.rules), ref.regimes);
  const flick = regimes.filter((r) => r.densest >= LEVER_THRESHOLDS.flickerSwitches);
  if (flick.length) flags.push({ kind: 'flicker', detail: listed(flick.map((r) => `${r.rule} changed regime ${r.densest} times in months ${r.densestFrom}–${r.densestFrom + LEVER_THRESHOLDS.sawWindow - 1}`), 4) });
  if (regimes.length) flags.push({ kind: 'regime', detail: listed(regimes.map((r) => r.rule), 8) });
  flags.sort((a, b) => FLAG_KINDS.findIndex((k) => k.kind === a.kind) - FLAG_KINDS.findIndex((k) => k.kind === b.kind));

  if (c.expResults && c.lever)
    for (const x of c.expResults) {
      if (x.lever !== c.lever.id || x.withCompanion !== !!ref.extra) continue;
      if (!matchesSetting(x.setting, c.setting)) continue;
      if (x.mode !== 'any' && x.mode !== ref.mode) continue;
      const path = effects.get(x.variable);
      if (!path) throw new Error(`expectation for '${x.lever}' names '${x.variable}', which is neither a headline nor an indicator`);
      const from = Math.max(1, x.fromMonth),
        to = Math.min(path.length - 1, x.toMonth);
      let s = 0;
      for (let t = from; t <= to; t++) s += path[t];
      const mean = to >= from ? s / (to - from + 1) : NaN;
      const pass = x.sign === 0 ? Math.abs(mean) < LEVER_THRESHOLDS.floor : Math.sign(mean) === x.sign && Math.abs(mean) >= LEVER_THRESHOLDS.floor;
      x.checks.push({ value: c.setting.value, mode: ref.mode, mean, pass });
    }

  return {
    lever: c.lever?.id ?? '',
    value: c.setting.value,
    label: c.setting.label,
    roles: c.setting.roles,
    mode: ref.mode,
    ...(ref.extra ? { companion: true } : {}),
    headlines,
    indicators,
    flags,
    regimes,
    ...(c.paths ? { paths } : {}),
  };
}

/** Flags that compare runs of one lever: an inert lever, the moderate up and down steps, and the
 *  two modes. */
function crossFlags(l: LeverDef, settings: LeverSetting[], runs: LeverRun[], headlines: Tracked[], horizons: number[]): CrossFlag[] {
  const T = LEVER_THRESHOLDS;
  const out: CrossFlag[] = [];
  const still = (x: SeriesSummary) => Math.abs(x.peak) < T.unmoved;
  if (runs.length && runs.every((r) => r.headlines.every(still) && r.indicators.every(still)))
    out.push({ kind: 'inert', detail: `none of its ${runs.length} runs moves a headline or an indicator by ${T.unmoved} or more in any month` });
  const at = (run: LeverRun, i: number, month: number) => {
    const k = horizons.indexOf(month);
    return k < 0 ? NaN : run.headlines[i].at[k];
  };
  const pair = moderatePair(l, settings);
  const modes = [...new Set(runs.map((r) => r.mode))];
  if (pair && horizons.includes(T.asymMonth))
    for (const mode of modes) {
      const up = runs.find((r) => r.mode === mode && r.value === pair.up.value),
        down = runs.find((r) => r.mode === mode && r.value === pair.down.value);
      if (!up || !down) continue;
      const bad: string[] = [];
      headlines.forEach((h, i) => {
        const eu = at(up, i, T.asymMonth),
          ed = at(down, i, T.asymMonth);
        if (Math.max(Math.abs(eu), Math.abs(ed)) < T.asymFloor) return;
        const ru = eu / (pair.up.value - pair.from),
          rd = ed / (pair.down.value - pair.from);
        const opposite = Math.abs(eu) >= T.floor && Math.abs(ed) >= T.floor && Math.sign(ru) !== Math.sign(rd);
        const ratio = Math.max(Math.abs(ru), Math.abs(rd)) / Math.min(Math.abs(ru), Math.abs(rd));
        if (opposite || !(ratio <= T.asymRatio))
          bad.push(`${h.label} ${num(eu)} for ${fmtValue(pair.up.value)} vs ${num(ed)} for ${fmtValue(pair.down.value)}${opposite ? ' (same direction)' : ` (${Number.isFinite(ratio) ? ratio.toFixed(1) : '∞'}×)`}`);
      });
      if (bad.length) out.push({ kind: 'asymmetry', mode, detail: listed(bad, 5) });
    }
  if (modes.includes('Manual') && modes.includes('Automatic') && horizons.includes(T.modeMonth))
    for (const s of settings) {
      const a = runs.find((r) => r.mode === 'Manual' && r.value === s.value),
        b = runs.find((r) => r.mode === 'Automatic' && r.value === s.value);
      if (!a || !b) continue;
      const bad: string[] = [];
      headlines.forEach((h, i) => {
        if (h.policy) return;
        const x = at(a, i, T.modeMonth),
          y = at(b, i, T.modeMonth);
        if (Math.abs(x) >= T.modeFloor && Math.abs(y) >= T.modeFloor && Math.sign(x) !== Math.sign(y)) bad.push(`${h.label} ${num(x)} on Manual, ${num(y)} on Automatic`);
      });
      if (bad.length) out.push({ kind: 'modeSign', value: s.value, detail: `${s.label}: ${listed(bad, 5)}` });
    }
  return out;
}

/**
 * A run with no lever event measured exactly as a lever run is, against the no-change run of the
 * first stabiliser mode: every effect must be zero and no flag may fire. The tests use it.
 */
export function measureNoEvent(def: ModelDef | KModel, months = 60): LeverRun {
  const S = setup(def, months);
  const [mode] = stabiliserModes(S.m);
  const ref = reference(S, mode, months);
  const e = S.run(mode.event ? [mode.event] : [], months);
  return measureRun(S, e, ref, { lever: null, setting: { value: 0, roles: [], label: 'no event' }, paths: true, expResults: null });
}
