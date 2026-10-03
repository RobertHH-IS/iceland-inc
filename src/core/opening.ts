/**
 * A dated opening (architecture §4.5; docs/design/today-opening.md): the economy at month 0 as the
 * data have it, instead of the solved steady state, and the fading start gaps that let the rules
 * carry on from there without a jump.
 *
 * openingBaseline(m, def, anchor) builds a Baseline the engine starts from:
 *   1. the model's builder (OpeningDef.build) reads the anchor state (the solved steady state, or a
 *      growing model's mapped state) and returns positions, variables with their past, parameters,
 *      anchor overrides, closed forms (`derive`), the start solve and checks;
 *   2. positions: every position is listed, except exactly one per financial instrument, which
 *      the kernel fills so the instrument balances. No position may have the wrong sign;
 *   3. month 0 is evaluated: every variable the opening holds keeps its value while its rule is
 *      evaluated beside it (an identity, or a rule that does not adjust gradually, must give the
 *      same value); every other variable is evaluated, and one with a past starts at rest on its
 *      trend (ModelDef.restTrend; flat without one, where a smoother sits at its desired value; on
 *      a growing model's trend a trend-carrying smoother sits at its target). `derive` and the
 *      anchor overrides are repeated with it until nothing moves, and every parameter the opening
 *      sets, derives or solves must lie in its range;
 *   4. the start solve: the unknowns (the start gaps' sizes, mostly) are solved so that the
 *      targets, read from months 0 and 1, hold. A committed solution is only checked (the default
 *      when one is given), so page load costs one month-0 evaluation and one month;
 *   5. the report: every position, variable and parameter with its source, the checks, the start
 *      gaps, the regimes at month 0, the continuity of months 1 and 2, the records used.
 *
 * withStartGaps(model, groups) adds a fading term to named BEHAVIOUR rules, through `replaces`:
 * "Today's gap from this rule, fading (half gone in 8 months)".
 */
import type {
  CalendarMonth,
  Ctx,
  Id,
  IndicatorCtx,
  ModelDef,
  ModuleDef,
  OpeningAnchors,
  OpeningDef,
  OpeningSource,
  OpeningState,
  ParamDef,
  Provenance,
  RuleDef,
  StartGapGroup,
  TermDef,
} from './types.ts';
import { ROLE_HOLDER, ROLE_ISSUER, type KModel } from './compile.ts';
import { Machine, substepsOf } from './machine.ts';
import { Anderson, lmStep, maxAbs, solveLinear, sumSq, symmetricEigenvalues } from './numerics.ts';
import type { Baseline } from './steady.ts';

/* ------------------------------------------------------------------ contract */

/** The Baseline an engine starts from when it opens on data, with its report. */
export interface Opening extends Baseline {
  history: Map<number, Float64Array>;
  anchors: Float64Array;
  report: OpeningReport;
}

export interface OpeningReport {
  id: Id;
  label: string;
  asOf: string;
  month0: CalendarMonth | null;
  /** Every position (Ctx.stock sign convention, model units), with its value in the money unit. */
  positions: { instrument: Id; player: Id; value: number; money: number | null; source: OpeningSource }[];
  vars: { id: Id; value: number; source: OpeningSource }[];
  /** Every parameter the opening set or solved, beside its value on the anchor. */
  params: { id: Id; value: number; anchor: number; provenance: Provenance }[];
  /** The anchor overrides (OpeningState.anchors). */
  anchors: { id: Id; value: number; structural: number }[];
  gaps: { group: Id; targets: Id[]; value: number; scale: 'relative' | 'absolute'; shareOfRule: number; fade: number; halfLifeMonths: number }[];
  /** The opening's checks, then any rule that does not reproduce a value the opening holds
   *  (id 'rule:<rule id>', gated). */
  checks: { id: Id; value: number; expected: number; tolerance: number; pass: boolean; gate: boolean }[];
  /** The continuity table (OpeningState.continuity): months 0, 1 and 2. */
  month1: { id: Id; month0: number; month1: number; month2: number; bound: number; pass: boolean }[];
  /** Regimes active at month 0, by padlock configuration (`mask`: bit j set, stabiliser j locked),
   *  and whether the same regime is active on the anchor. */
  regimes: { rule: Id; regime: string; onAnchor: boolean; mask: number }[];
  /** `condition` is NaN in check mode, which does not take the Jacobian. `solution` holds the
   *  unknowns' values: commit them as OpeningState.solve.solution. */
  solve: { mode: 'check' | 'solve'; unknowns: number; iterations: number; residual: number; condition: number; solution: Record<Id, number> };
  /** Every record used: the union over positions, vars, params, checks and targets. */
  recordsUsed: Id[];
  /** Differences the report lists without failing (bridges, placeholders, guards, cross-checks). */
  warnings: string[];
}

export interface OpeningOptions {
  /** 'check' applies the committed solution and checks it (the default when there is one);
   *  'solve' solves from the builder's values. */
  mode?: 'check' | 'solve';
  /** The solve stops when its largest residual is at most this (default 1e-12). */
  tol?: number;
  maxIter?: number;
  /** Steps lag() can reach back (EngineOptions.lagWindow). */
  lagWindow?: number;
  dev?: boolean;
}

/* ---------------------------------------------------------------- tolerances */

/** Position bases a position may have (T1). */
export const POSITION_BASES: readonly OpeningSource['basis'][] = ['data', 'residual', 'mirror', 'allocated'];
/** A rule must reproduce a value the opening holds to this, relative (absolute below 1). */
export const IDENTITY_TOL = 1e-9;
/** The closed forms and anchor overrides have settled when nothing moves by more than this
 *  (relative, absolute below 1), within DERIVE_ROUNDS rounds. */
export const DERIVE_TOL = 1e-12;
export const DERIVE_ROUNDS = 20;
/** Variables with a past that the opening does not hold settle at rest to this. */
export const REST_TOL = 1e-12;
export const REST_ROUNDS = 1000;
/** The start solve, and check mode, fail above this residual. */
export const OPENING_RESIDUAL_TOL = 1e-9;
/** Rank: an unknown must move some target, and a target depend on some unknown, by more than
 *  this share of the target's scale for a finite-difference step. */
export const RANK_TOL = 1e-10;
export const CONDITION_MAX = 1e10;
/** A relative start gap above this share of its rule's value is a warning (StartGapGroup.bound). */
export const RELATIVE_GAP_GUARD = 0.25;
/** A position below this (Ctx.stock convention) has the wrong sign. */
const SIGN_TOL = 1e-9;

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));
const fmt = (x: number) => (Number.isFinite(x) ? (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e6 ? x.toPrecision(6) : x.toExponential(3)) : String(x));

/** "half gone in 8 months" / "half gone in about 3½ years", from a fade per year. */
export function halfLifeText(fade: number): string {
  if (!(fade > 0) || !Number.isFinite(fade)) throw new Error(`halfLifeText: the fade must be a positive number a year, got ${fade}`);
  const months = Math.round((12 * Math.LN2) / fade);
  if (months <= 24) return `half gone in ${months} month${months === 1 ? '' : 's'}`;
  const years = Math.round((2 * Math.LN2) / fade) / 2;
  const whole = Math.floor(years);
  return `half gone in about ${whole}${years > whole ? '½' : ''} years`;
}

/** The half-life of a fade per year, in whole months. */
export const halfLifeMonths = (fade: number): number => Math.round((12 * Math.LN2) / fade);

/* ------------------------------------------------------------------ lagReach */

/** A machine that records how far back each variable is read. */
class ProbeMachine extends Machine {
  reach: Int32Array;
  constructor(m: KModel, opts: { lagWindow?: number; dev?: boolean }) {
    super(m, opts);
    this.reach = new Int32Array(m.NV);
  }
  override lagValue(v: number, k: number): number {
    if (k > this.reach[v]) this.reach[v] = k;
    return super.lagValue(v, k);
  }
}

/** How many months back each variable is read at month 0, found by evaluating month 0 under every
 *  padlock configuration with a recording lag(). Every variable read with lag() or adjusted
 *  gradually is listed, at least 1. */
export function lagReach(m: KModel, base: Baseline, opts: { lagWindow?: number } = {}): Map<Id, number> {
  const M = new ProbeMachine(m, { dev: false, lagWindow: opts.lagWindow });
  const N = substepsOf(m.def);
  for (let mask = 0; mask < 1 << m.cstabilisers.length; mask++) {
    M.pBase.set(base.pBase);
    M.exoBase.set(base.exoBase);
    M.initLevers();
    m.cstabilisers.forEach((cs, j) => (M.leverVal[cs.lock] = mask & (1 << j) ? 1 : 0));
    M.applyLevers();
    M.cur.set(base.vars);
    M.ledger.pos.set(base.positions);
    M.initHistory(base.vars, base.history, 1, base.trend);
    M.baseVars = base.anchors ?? base.vars;
    M.t = -1;
    M.evaluate(new Uint8Array(m.NV).fill(1), new Float64Array(m.NV));
  }
  const out = new Map<Id, number>();
  m.vars.forEach((v, k) => {
    if (m.lagged[k] || M.reach[k]) out.set(v.id, Math.max(1, Math.ceil(M.reach[k] / N)));
  });
  return out;
}

/* ------------------------------------------------------------ withStartGaps */

/** The rules in force: every rule that no other rule replaces. */
function effectiveRules(model: ModelDef): RuleDef[] {
  const rules = model.modules.flatMap((x) => x.rules ?? []);
  const replaced = new Set(rules.flatMap((r) => (r.replaces ? [r.replaces] : [])));
  return rules.filter((r) => !replaced.has(r.id));
}

export const startGapId = (group: Id): Id => `startGap.${group}`;
export const startGapFadeId = (group: Id): Id => `startGapFade.${group}`;
export const startGapBaseId = (target: Id): Id => `startGapBase.${target}`;
/** The term a start gap adds to each target rule. */
export const START_GAP_TERM = 'startGap';

/**
 * Add a fading start-gap term, per group, to the named BEHAVIOUR rules, through `replaces` (so the
 * replacement chain of a growing model is respected). Creates `startGap.<group>` (0 until an
 * opening solves it) and `startGapFade.<group>` (the fade, per year); a relative group also
 * creates `startGapBase.<target>` per target, that rule's month-0 value, which the opening sets.
 * The term on each target is startGap × (relative ? startGapBase : 1) × exp(−fade × t), with t in
 * years from month 0; on a rule with `combine` it is added after combining, and on a rule that
 * adjusts gradually it is part of the desired value. The rule's own regimes see its value without
 * the gap and its own terms. The term's label states the half-life of the group's fade here, so an
 * opening may not re-set `startGapFade.<group>` (openingBaseline rejects it). Without an opening
 * every gap is 0.
 */
export function withStartGaps(model: ModelDef, groups: Record<Id, StartGapGroup>): ModelDef {
  const errors: string[] = [];
  if (model.modules.some((x) => x.id === 'start-gaps')) errors.push(`model '${model.id}' already has start gaps; give withStartGaps every group at once`);
  const rules = effectiveRules(model);
  const ruleOf = new Map(rules.map((r) => [r.target, r]));
  const vars = new Map(model.modules.flatMap((x) => x.vars ?? []).map((v) => [v.id, v]));
  const instruments = new Set(model.modules.flatMap((x) => x.instruments ?? []).map((i) => i.id));
  const params: ParamDef[] = [];
  const replacements: RuleDef[] = [];
  const seen = new Map<Id, Id>();
  for (const [group, g] of Object.entries(groups)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(group)) errors.push(`start-gap group '${group}': use letters and digits only`);
    if (!(g.fade > 0 && Number.isFinite(g.fade))) errors.push(`start-gap group '${group}': the fade must be a positive number a year, got ${g.fade}`);
    if (g.scale !== 'relative' && g.scale !== 'absolute') errors.push(`start-gap group '${group}': scale must be 'relative' or 'absolute'`);
    if (!g.targets.length) errors.push(`start-gap group '${group}' has no targets`);
    if (errors.length) continue;
    const relative = g.scale === 'relative';
    const half = halfLifeText(g.fade);
    let unit = 'fraction';
    for (const target of g.targets) {
      if (seen.has(target)) {
        errors.push(`'${target}' is in start-gap groups '${seen.get(target)}' and '${group}'; a rule takes one start gap`);
        continue;
      }
      seen.set(target, group);
      if (instruments.has(target)) {
        errors.push(`start-gap group '${group}': '${target}' is a stock; stocks change only through postings, so a gap goes on the behaviour that sets a flow`);
        continue;
      }
      const v = vars.get(target);
      const r = ruleOf.get(target);
      if (!v || !r) {
        errors.push(`start-gap group '${group}': no rule sets '${target}'`);
        continue;
      }
      if (r.category !== 'BEHAVIOUR')
        errors.push(`start-gap group '${group}': '${target}' is set by the ${r.category} rule '${r.id}'; start gaps go on BEHAVIOUR rules only`);
      if (r.terms?.some((t) => t.id === START_GAP_TERM)) errors.push(`rule '${r.id}' already has a term '${START_GAP_TERM}'`);
      if (!relative) unit = v.unit;
      const gap = startGapId(group),
        fadeId = startGapFadeId(group),
        baseId = startGapBaseId(target);
      if (relative)
        params.push({
          id: baseId,
          value: 0,
          unit: v.unit,
          category: 'BEHAVIOUR',
          description: `The value of ${v.label.toLowerCase()} at month 0, which the start gap ${group} is a share of. An opening sets it; 0 without one.`,
          provenance: { basis: 'derived', note: 'Set by the opening: the rule’s value at month 0.' },
        });
      const term: TermDef = {
        id: START_GAP_TERM,
        label: `Today's gap from this rule, fading (${half})`,
        concept: 'start-gap',
        compute: relative
          ? (c) => c.p(gap) * c.p(baseId) * Math.exp(-c.p(fadeId) * (c.t + c.dt))
          : (c) => c.p(gap) * Math.exp(-c.p(fadeId) * (c.t + c.dt)),
      };
      const own: TermDef[] = r.terms ?? [{ id: 'rule', label: r.label ?? r.explain.what, compute: r.compute! }];
      const strip = (t: Record<Id, number>): Record<Id, number> => {
        const out: Record<Id, number> = {};
        for (const k in t) if (k !== START_GAP_TERM) out[k] = t[k];
        return out;
      };
      const combine = r.combine;
      const regime = r.regime;
      // The share of the desired value a step moves the rule's value by: 1, or k for a rule that
      // adjusts gradually (value = previous + k × (desired − previous)).
      const speed = r.adjust?.speed;
      const exponential = r.adjust?.form === 'exponential';
      const moved = (c: Ctx) => {
        if (speed === undefined) return 1;
        const v = typeof speed === 'string' ? c.p(speed) : speed;
        return exponential ? 1 - Math.exp(-v * c.dt) : v * c.dt;
      };
      replacements.push({
        ...r,
        id: `startGap.${r.id}`,
        replaces: r.id,
        params: [...new Set([...(r.params ?? []), gap, fadeId, ...(relative ? [baseId] : []), ...(typeof speed === 'string' ? [speed] : [])])],
        terms: [...own, term],
        compute: undefined,
        combine: combine ? (t, c) => combine(strip(t), c) + t[START_GAP_TERM] : undefined,
        // the rule's own regimes see the value it would have without the gap, beside its own terms
        regime: regime ? (c, value, t) => regime(c, value - moved(c) * t[START_GAP_TERM], strip(t)) : undefined,
        concepts: [...new Set([...(r.concepts ?? []), 'start-gap'])],
        explain: {
          what: r.explain.what,
          rule: `${r.explain.rule} The economy opens on today's data, which this rule does not fully explain: the difference is a start gap, a term that fades away (${half}).`,
        },
      });
    }
    params.push(
      {
        id: startGapId(group),
        value: 0,
        unit: relative ? 'fraction' : unit,
        category: 'BEHAVIOUR',
        description: relative
          ? `Today's gap from ${g.targets.join(', ')}, as a share of each rule's value at month 0. The opening solves it; 0 without one.`
          : `Today's gap from ${g.targets.join(', ')}, in the rule's own unit. The opening solves it; 0 without one.`,
        provenance: { basis: 'calibrated', note: 'Solved by the opening so that month 1 carries on from today’s data; 0 without an opening.' },
      },
      {
        id: startGapFadeId(group),
        value: g.fade,
        unit: 'per year',
        category: 'BEHAVIOUR',
        description: `How fast the start gap ${group} fades: ${half}.`,
        provenance: { basis: 'assumed', note: 'How long today’s unexplained difference lasts; a teaching assumption.' },
      },
    );
  }
  if (errors.length) throw new Error(`withStartGaps:\n  - ${errors.join('\n  - ')}`);
  const module: ModuleDef = {
    id: 'start-gaps',
    label: 'Start gaps',
    description: 'Fading terms that carry today’s data into the rules: the part of each opening level the rule does not explain, fading away.',
    params,
    rules: replacements,
  };
  return { ...model, modules: [...model.modules, module], startGaps: { ...(model.startGaps ?? {}), ...groups } };
}

/* ------------------------------------------------------------ openingBaseline */

/**
 * Build, validate (T1, T2), evaluate month 0 under every padlock configuration, run `derive`,
 * then check the committed solution (mode 'check', the default when one is given) or solve (mode
 * 'solve'). Throws with the numbers on a hard failure: an unknown id, a missing, duplicated or
 * wrong-signed position, a history shorter than the rules read, closed forms or rests that do not
 * settle, a parameter outside its range or without its provenance, a rank or conditioning failure,
 * a residual above 1e-9. Values a rule does not reproduce and gated checks that fail are reported
 * (openingFailures) rather than thrown, so a harness can list them all.
 */
export function openingBaseline(m: KModel, def: OpeningDef, anchor: Baseline, opts: OpeningOptions = {}): Opening {
  const { NP, NV } = m;
  const N = substepsOf(m.def);
  const where = `opening '${def.id}' of model '${m.def.id}'`;
  const vIdx = (id: Id) => {
    const k = m.varIndex.get(id);
    if (k === undefined) throw new Error(`${where}: unknown variable '${id}'`);
    return k;
  };
  const pIdx = (id: Id) => {
    const k = m.paramIndex.get(id);
    if (k === undefined) throw new Error(`${where}: unknown parameter '${id}'`);
    return k;
  };
  const posIdx = (ins: Id, pl: Id) => {
    const i = m.instrumentIndex.get(ins),
      p = m.playerIndex.get(pl);
    if (i === undefined || p === undefined) throw new Error(`${where}: unknown stock ('${ins}', '${pl}')`);
    return i * NP + p;
  };
  const signedAt = (pos: Float64Array, j: number) => (m.role[j] === ROLE_ISSUER ? -pos[j] : pos[j]);
  const structural = anchor.anchors ?? anchor.vars;
  const view: OpeningAnchors = {
    param: (id) => anchor.pBase[pIdx(id)],
    value: (id) => anchor.vars[vIdx(id)],
    stock: (ins, pl) => signedAt(anchor.positions, posIdx(ins, pl)),
  };
  const state: OpeningState = def.build(view);

  /* positions (T1) */
  const { positions, sources } = openingPositions(m, state, where);

  /* variables, parameters, anchors */
  const errors: string[] = [];
  const held = new Uint8Array(NV);
  const V = new Float64Array(anchor.vars);
  const exoBase = new Float64Array(anchor.exoBase);
  const history = new Map<number, Float64Array>();
  for (const [id, x] of Object.entries(state.vars)) {
    const k = m.varIndex.get(id);
    if (k === undefined) {
      errors.push(`variable '${id}' is not in the model`);
      continue;
    }
    if (!Number.isFinite(x.value)) errors.push(`variable '${id}' is ${x.value}`);
    held[k] = 1;
    V[k] = x.value;
    if (m.exogenous[k]) exoBase[k] = x.value;
    if (x.history?.length) {
      if (x.history.some((h) => !Number.isFinite(h))) errors.push(`variable '${id}' has a history value that is not a finite number`);
      history.set(k, Float64Array.from(x.history));
    }
  }
  const pBase = new Float64Array(anchor.pBase);
  const paramRecords = new Map<Id, Id[]>();
  /** A parameter's value outside its ParamDef range, described; null inside it. */
  const outOfRange = (id: Id, x: number): string | null => {
    const def = m.params[pIdx(id)];
    if (Number.isFinite(x) && !(def.min !== undefined && x < def.min) && !(def.max !== undefined && x > def.max)) return null;
    return `'${id}' = ${fmt(x)}, outside its range [${def.min ?? '−∞'}, ${def.max ?? '∞'}]`;
  };
  for (const [id, x] of Object.entries(state.params)) {
    const k = m.paramIndex.get(id);
    if (k === undefined) {
      errors.push(`parameter '${id}' is not in the model`);
      continue;
    }
    if (id.startsWith('startGapFade.')) errors.push(`parameter '${id}' is how fast a start gap fades, which its term's label states; set the fade in withStartGaps, not in an opening`);
    errors.push(...provenanceErrors(id, x.provenance));
    const range = outOfRange(id, x.value);
    if (range) errors.push(`parameter ${range}`);
    pBase[k] = x.value;
    if (x.records) paramRecords.set(id, x.records);
  }
  const anchors = new Float64Array(structural);
  const month0Anchors: number[] = [];
  for (const [id, x] of Object.entries(state.anchors ?? {})) {
    const k = m.varIndex.get(id);
    if (k === undefined) {
      errors.push(`anchor override '${id}' is not a variable of the model`);
      continue;
    }
    if (x === 'month0') month0Anchors.push(k);
    else if (Number.isFinite(x)) anchors[k] = x;
    else errors.push(`anchor override '${id}' is ${x}`);
  }
  const unknowns = state.solve?.unknowns ?? [];
  const targets = state.solve?.targets ?? [];
  const unknownIds = unknowns.map((u) => ('var' in u ? u.var : u.param));
  unknowns.forEach((u) => {
    if ('var' in u) {
      const k = m.varIndex.get(u.var);
      if (k === undefined || !held[k]) errors.push(`unknown { var: '${u.var}' } is not a variable the opening holds (list it in vars)`);
    } else if (!m.paramIndex.has(u.param)) errors.push(`unknown { param: '${u.param}' } is not a parameter of the model`);
    else if (u.param.startsWith('startGapFade.')) errors.push(`unknown { param: '${u.param}' }: a start gap's fade is set in withStartGaps, not solved`);
  });
  if (new Set(unknownIds).size !== unknownIds.length) errors.push('an unknown is listed twice');
  if (unknowns.length !== targets.length) errors.push(`the start solve has ${unknowns.length} unknowns and ${targets.length} targets; each target pairs with an unknown that moves it`);
  for (const t of targets) if (!(t.scale > 0 && Number.isFinite(t.scale))) errors.push(`target '${t.id}' needs a positive scale`);
  if (errors.length) throw new Error(`${where}:\n  - ${errors.join('\n  - ')}`);

  /* the start gaps' bases the opening leaves to the kernel: each rule's month-0 value */
  const autoBases: { k: number; v: number }[] = [];
  for (const g of Object.values(m.def.startGaps ?? {}))
    if (g.scale === 'relative')
      for (const t of g.targets) {
        const id = startGapBaseId(t);
        if (!(id in state.params) && m.paramIndex.has(id)) autoBases.push({ k: pIdx(id), v: vIdx(t) });
      }

  /** The trend each lagged variable without a history is at rest on (ModelDef.restTrend), or null
   *  when the model declares none (then every such past is flat). */
  const restTrend = m.def.restTrend;
  const trendOf = (pb: Float64Array): Float64Array | null => {
    if (!restTrend) return null;
    const out = new Float64Array(NV);
    const p = (id: Id) => pb[pIdx(id)];
    let any = false;
    for (let k = 0; k < NV; k++) {
      if (!m.lagged[k] || history.has(k)) continue;
      const g = restTrend(m.vars[k].id, p);
      if (!Number.isFinite(g)) throw new Error(`${where}: restTrend gives '${m.vars[k].id}' a trend of ${g}`);
      out[k] = g;
      any ||= g !== 0;
    }
    return any ? out : null;
  };

  /* history against how far back the rules read */
  const reach = lagReach(m, { ...anchor, pBase, exoBase, positions, vars: V, history, anchors, trend: trendOf(pBase) ?? undefined }, { lagWindow: opts.lagWindow });
  for (const [id, x] of Object.entries(state.vars)) {
    const r = reach.get(id) ?? 0;
    const have = x.history?.length ?? 0;
    if (r > 1 && have < r) errors.push(`'${id}' is read ${r} months back at month 0, but its history reaches ${have} month${have === 1 ? '' : 's'}`);
  }
  if (errors.length) throw new Error(`${where}:\n  - ${errors.join('\n  - ')}`);

  /* the month-0 machine */
  const M = new Machine(m, { dev: opts.dev ?? true, lagWindow: opts.lagWindow });
  const NS = m.cstabilisers.length;
  const heldOut = new Float64Array(NV);
  const allHeld = new Uint8Array(NV).fill(1);
  // variables with a past that the opening does not hold: at rest on their trend
  const rest: number[] = [];
  for (let k = 0; k < NV; k++) if (m.lagged[k] && !held[k] && !m.exogenous[k]) rest.push(k);
  const zeroTerms = new Float64Array(m.cterms.length);
  // as the engine's reset() does: values first, then the levers (which set exogenous variables)
  const setUp = (pb: Float64Array, exo: Float64Array, vals: Float64Array, mask: number) => {
    M.pBase.set(pb);
    M.exoBase.set(exo);
    M.cur.set(vals);
    M.initLevers();
    m.cstabilisers.forEach((cs, j) => (M.leverVal[cs.lock] = mask & (1 << j) ? 1 : 0));
    M.applyLevers();
    M.ledger.pos.set(positions);
  };

  /** One evaluation of month 0 under a padlock configuration: the lags month 0 itself was
   *  computed from (the past at rest for `rest`), held variables kept. */
  const evaluateAt = (s: Month0, mask: number, h: Uint8Array) => {
    setUp(s.pBase, s.exo, s.vals, mask);
    M.initHistory(s.past, history, 1, s.trend ?? undefined);
    M.baseVars = s.anchors;
    M.baseTerms = zeroTerms;
    M.baseTermsByMask = null;
    M.t = -1;
    M.evaluate(h, heldOut);
  };

  interface Month0 {
    pBase: Float64Array;
    exo: Float64Array;
    vals: Float64Array;
    /** Month 0 of the past each lagged variable without a history extends back from: on its
     *  trend (`trend`), or flat. */
    past: Float64Array;
    anchors: Float64Array;
    trend: Float64Array | null;
  }
  /** Month 0 with the given parameters and held values: the rests, the anchor overrides, the
   *  start gaps' bases and `derive`, repeated until nothing moves. */
  const settle = (pb0: Float64Array, vals0: Float64Array): Month0 => {
    const st: Month0 = { pBase: new Float64Array(pb0), exo: new Float64Array(exoBase), vals: new Float64Array(vals0), past: new Float64Array(vals0), anchors: new Float64Array(anchors), trend: trendOf(pb0) };
    const { pBase: pb, exo, vals, past, anchors: anc } = st;
    /** Where month 0 of a variable at rest goes next: a smoother's resting value (its desired
     *  value on a flat past; on a trend g, the x with x = (1 − k)·x·e^(−g·dt) + k·desired, which
     *  for a growing model's trend-carrying smoother is its target), any other variable's value. */
    const restNext = (k: number): number => {
      const rule = m.ruleOfVar[k];
      if (rule < 0 || !m.crules[rule].hasAdjust) return M.cur[k];
      const g = st.trend?.[k] ?? 0;
      if (g === 0) return M.desired[rule];
      const cr = m.crules[rule];
      const speed = cr.adjustParam >= 0 ? M.pEff[cr.adjustParam] : cr.adjustNum;
      const a = cr.adjustExp ? 1 - Math.exp(-speed * M.dt) : speed * M.dt;
      return (a * M.desired[rule]) / (1 - (1 - a) * Math.exp(-g * M.dt));
    };
    // The rests and the month-0 anchors are a fixed point: x = G(x), with x month 0 of the past
    // of every variable at rest (flat, or on its trend) and the anchors read as month 0, and G(x)
    // what month 0 evaluated from them gives (restNext). Anderson acceleration closes the slow
    // modes plain iteration would take hundreds of rounds over; if it has not settled halfway
    // through the rounds (a regime switching back and forth), plain iteration takes over.
    const nx = rest.length + month0Anchors.length;
    const x = new Float64Array(nx),
      g = new Float64Array(nx);
    const read = () => {
      rest.forEach((k, i) => (x[i] = past[k]));
      month0Anchors.forEach((k, i) => (x[rest.length + i] = anc[k]));
    };
    for (let round = 1; ; round++) {
      read();
      const mixer = new Anderson(nx, 5, x.map((v) => 1 / Math.max(1, Math.abs(v))));
      let moved = Infinity;
      let r = 0;
      for (; r < REST_ROUNDS && moved > REST_TOL; r++) {
        evaluateAt(st, 0, held);
        moved = 0;
        rest.forEach((k, i) => (g[i] = restNext(k)));
        month0Anchors.forEach((k, i) => (g[rest.length + i] = M.cur[k]));
        for (let i = 0; i < nx; i++) moved = Math.max(moved, rel(g[i], x[i]));
        if (!Number.isFinite(moved)) break;
        vals.set(M.cur);
        if (moved <= REST_TOL) break;
        x.set(r < REST_ROUNDS / 2 ? mixer.next(x, g) : g);
        rest.forEach((k, i) => (past[k] = x[i]));
        month0Anchors.forEach((k, i) => (anc[k] = x[rest.length + i]));
      }
      if (!(moved <= REST_TOL)) {
        const worst = rest
          .map((k) => {
            const x = restNext(k);
            return { id: m.vars[k].id, d: Number.isFinite(x) ? rel(x, past[k]) : Infinity };
          })
          .sort((a, b) => b.d - a.d)
          .slice(0, 5)
          .map((w) => `'${w.id}'`);
        throw new Error(`${where}: month 0 does not settle (still moving by ${fmt(moved)} after ${r} rounds). A variable with a past that the opening does not hold starts at rest, and these do not come to rest: ${worst.join(', ')}. Hold them in OpeningState.vars, with a history if the rules read it further back than a month`);
      }
      // the closed forms
      let changed = 0;
      for (const b of autoBases) {
        changed = Math.max(changed, rel(vals[b.v], pb[b.k]));
        pb[b.k] = vals[b.v];
      }
      if (state.derive) {
        const out = state.derive({ ...month0Ctx(vals, anc), p: (id) => pb[pIdx(id)] });
        for (const [id, x] of Object.entries(out.params ?? {})) {
          if (!(id in state.params)) throw new Error(`${where}: derive sets parameter '${id}', which OpeningState.params does not list (it needs provenance)`);
          if (!Number.isFinite(x)) throw new Error(`${where}: derive gives parameter '${id}' = ${x}`);
          const k = pIdx(id);
          changed = Math.max(changed, rel(x, pb[k]));
          pb[k] = x;
        }
        for (const [id, x] of Object.entries(out.vars ?? {})) {
          if (!(id in state.vars)) throw new Error(`${where}: derive sets variable '${id}', which OpeningState.vars does not list (it needs a source)`);
          if (!Number.isFinite(x)) throw new Error(`${where}: derive gives variable '${id}' = ${x}`);
          const k = vIdx(id);
          changed = Math.max(changed, rel(x, vals[k]));
          vals[k] = x;
          past[k] = x;
          if (m.exogenous[k]) exo[k] = x;
        }
      }
      if (changed <= DERIVE_TOL) return st;
      st.trend = trendOf(pb);
      if (round >= DERIVE_ROUNDS) throw new Error(`${where}: the closed forms (derive) and start-gap bases still move by ${fmt(changed)} after ${DERIVE_ROUNDS} rounds`);
    }
  };

  const ctxOf = (vals: Float64Array, pos: Float64Array, anc: Float64Array): IndicatorCtx => ({
    v: (id) => vals[vIdx(id)],
    base: (id) => anc[vIdx(id)],
    stock: (ins, pl) => signedAt(pos, posIdx(ins, pl)),
    baseStock: (ins, pl) => signedAt(positions, posIdx(ins, pl)),
  });
  function month0Ctx(vals: Float64Array, anc: Float64Array): IndicatorCtx {
    return ctxOf(new Float64Array(vals), positions, new Float64Array(anc));
  }

  /** Months 1 … n from month 0, as the engine runs them (every padlock open, no events). */
  const run = (s: Month0, months: number): IndicatorCtx[] => {
    setUp(s.pBase, s.exo, s.vals, 0);
    M.initHistory(M.cur, history, 0, s.trend ?? undefined);
    M.baseVars = s.anchors;
    M.baseTerms = zeroTerms;
    M.baseTermsByMask = null;
    M.t = 0;
    M.ledger.begin();
    const out: IndicatorCtx[] = [];
    for (let k = 0; k < months; k++) {
      for (let j = 0; j < N; j++) M.step();
      out.push(ctxOf(new Float64Array(M.cur), new Float64Array(M.ledger.pos), s.anchors));
    }
    return out;
  };

  /** Apply the unknowns, settle month 0 and take a month: the targets' residuals. */
  const apply = (z: ArrayLike<number>): { pb: Float64Array; vals: Float64Array } => {
    const pb = new Float64Array(pBase);
    const vals = new Float64Array(V);
    unknowns.forEach((u, i) => {
      if ('var' in u) vals[vIdx(u.var)] = z[i];
      else pb[pIdx(u.param)] = z[i];
    });
    return { pb, vals };
  };
  let last: Month0 | null = null;
  let lastError = '';
  const residuals = (z: ArrayLike<number>, out: Float64Array): boolean => {
    try {
      const { pb, vals } = apply(z);
      const s = settle(pb, vals);
      last = s;
      if (!targets.length) return true;
      const [one] = run(s, 1);
      const zero = month0Ctx(s.vals, s.anchors);
      targets.forEach((t, i) => (out[i] = t.residual(zero, one)));
      for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) return false;
      return true;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith(where)) throw e;
      lastError = e instanceof Error ? e.message : String(e);
      out.fill(Infinity);
      return false;
    }
  };

  /* the start solve */
  const n = unknowns.length;
  const solution = state.solve?.solution;
  const mode = opts.mode ?? (solution ? 'check' : 'solve');
  const z = new Float64Array(n);
  unknowns.forEach((u, i) => (z[i] = 'var' in u ? V[vIdx(u.var)] : pBase[pIdx(u.param)]));
  const F = new Float64Array(n);
  let iterations = 0;
  let condition = Number.NaN;
  if (mode === 'check' && n) {
    if (!solution) throw new Error(`${where}: check mode needs a committed solution (OpeningState.solve.solution)`);
    const extra = Object.keys(solution).filter((id) => !unknownIds.includes(id));
    const missing = unknownIds.filter((id) => !(id in solution));
    if (extra.length || missing.length)
      throw new Error(`${where}: the committed solution does not match the unknowns${missing.length ? `; missing ${missing.join(', ')}` : ''}${extra.length ? `; not unknowns: ${extra.join(', ')}` : ''}`);
    unknownIds.forEach((id, i) => (z[i] = solution[id]));
    if (!residuals(z, F)) throw new Error(`${where}: the month-1 step from the committed solution failed: ${lastError}`);
    const worst = maxAbs(F);
    if (!(worst <= OPENING_RESIDUAL_TOL))
      throw new Error(`${where}: the committed solution no longer holds (largest residual ${fmt(worst)} > ${OPENING_RESIDUAL_TOL}): ${targets.map((t, i) => `${t.id} ${fmt(F[i])}`).join(', ')}. Re-solve with mode 'solve' and commit report.solve.solution`);
  } else if (n) {
    const tol = opts.tol ?? 1e-12;
    const maxIter = opts.maxIter ?? 50;
    if (!residuals(z, F)) throw new Error(`${where}: the month-1 step from the builder's values failed: ${lastError}`);
    const scale = targets.map((t) => t.scale);
    const jacobian = (zz: Float64Array, F0: Float64Array): { J: Float64Array; moved: Float64Array } => {
      const J = new Float64Array(n * n);
      const moved = new Float64Array(n * n);
      const Fk = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        const h = 1e-6 * Math.max(1, Math.abs(zz[k]));
        const keep = zz[k];
        zz[k] = keep + h;
        const ok = residuals(zz, Fk);
        zz[k] = keep;
        if (!ok) throw new Error(`${where}: the month-1 step failed when '${unknownIds[k]}' moved by ${fmt(h)}: ${lastError}`);
        for (let i = 0; i < n; i++) {
          J[i * n + k] = (Fk[i] - F0[i]) / h;
          moved[i * n + k] = (Fk[i] - F0[i]) / scale[i];
        }
      }
      return { J, moved };
    };
    // structural rank and conditioning at the start point
    const { J: J0, moved } = jacobian(z, F);
    const inert = unknownIds.filter((_, k) => !targets.some((_, i) => Math.abs(moved[i * n + k]) > RANK_TOL));
    const unreachable = targets.filter((_, i) => !unknownIds.some((_, k) => Math.abs(moved[i * n + k]) > RANK_TOL)).map((t) => t.id);
    if (inert.length || unreachable.length)
      throw new Error(
        `${where}: the start solve is not well posed:${inert.length ? ` no target depends on ${inert.map((x) => `'${x}'`).join(', ')}` : ''}${inert.length && unreachable.length ? ';' : ''}${unreachable.length ? ` no unknown moves ${unreachable.map((x) => `'${x}'`).join(', ')}` : ''}`,
      );
    const Js = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) Js[i * n + k] = (J0[i * n + k] * Math.max(1, Math.abs(z[k]))) / scale[i];
    condition = conditionNumber(Js, n);
    if (!(condition <= CONDITION_MAX)) {
      const [a, b] = mostCollinear(Js, n);
      throw new Error(`${where}: the start solve is ill-conditioned (condition number ${fmt(condition)} > ${CONDITION_MAX}): '${unknownIds[a]}' and '${unknownIds[b]}' move the targets almost alike`);
    }
    // Newton, with Levenberg–Marquardt on the scaled residuals when a step does not help
    let J = J0;
    let mu = 1e-3;
    const scaled = (f: Float64Array) => f.map((x, i) => x / scale[i]);
    for (; iterations < maxIter && maxAbs(F) > tol; iterations++) {
      if (iterations > 0) J = jacobian(z, F).J;
      const ss0 = sumSq(scaled(F));
      const zn = new Float64Array(n);
      const Fn = new Float64Array(n);
      const tryStep = (delta: Float64Array | null, lambda: number) => {
        if (!delta) return false;
        for (let i = 0; i < n; i++) zn[i] = z[i] + lambda * delta[i];
        if (!residuals(zn, Fn) || !(sumSq(scaled(Fn)) < ss0)) return false;
        z.set(zn);
        F.set(Fn);
        return true;
      };
      let accepted = false;
      const delta = solveLinear(J, F.map((x) => -x), n);
      for (let lambda = 1; delta && lambda > 1e-3 && !accepted; lambda /= 2) accepted = tryStep(delta, lambda);
      if (!accepted) {
        const Jsc = new Float64Array(n * n);
        for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) Jsc[i * n + k] = J[i * n + k] / scale[i];
        for (let tries = 0; !accepted && tries < 12; tries++) {
          accepted = tryStep(lmStep(Jsc, scaled(F), n, n, mu), 1);
          mu = accepted ? Math.max(mu / 10, 1e-12) : mu * 10;
        }
      }
      if (!accepted) break;
    }
    // the final state, from the solution alone (so check mode reproduces it exactly)
    residuals(z, F);
    const worst = maxAbs(F);
    if (!(worst <= OPENING_RESIDUAL_TOL))
      throw new Error(`${where}: the start solve stopped with largest residual ${fmt(worst)} > ${OPENING_RESIDUAL_TOL} after ${iterations} iterations: ${targets.map((t, i) => `${t.id} ${fmt(F[i])}`).join(', ')}`);
  } else if (!residuals(z, F)) throw new Error(`${where}: month 0 failed to evaluate: ${lastError}`);
  const s: Month0 = last!;
  const solved: Record<Id, number> = {};
  unknownIds.forEach((id, i) => (solved[id] = z[i]));

  /* every parameter the opening sets, derives or solves, inside its range */
  const moved: string[] = [];
  for (const id of new Set([...Object.keys(state.params), ...unknowns.flatMap((u) => ('param' in u ? [u.param] : []))])) {
    const range = outOfRange(id, s.pBase[pIdx(id)]);
    if (range) moved.push(`${range} (${state.params[id] ? `the opening gave ${fmt(state.params[id].value)}; ` : ''}derive or the start solve moved it)`);
  }
  if (moved.length) throw new Error(`${where}: parameters out of range:\n  - ${moved.join('\n  - ')}`);

  /* month 0 under every padlock configuration */
  const warnings: string[] = [];
  const ruleRows: OpeningReport['checks'] = [];
  const regimeRows: OpeningReport['regimes'] = [];
  const anchorRegimes = regimesOnAnchor(m, anchor, opts);
  const byMask: { terms: Float64Array; desired: Float64Array }[] = [];
  let terms = new Float64Array(0),
    desired = new Float64Array(0);
  let regimes: (string | null)[] = [];
  for (let mask = 0; mask < 1 << NS; mask++) {
    evaluateAt(s, mask, mask === 0 ? held : allHeld);
    if (mask === 0) {
      terms = new Float64Array(M.termVal);
      desired = new Float64Array(M.desired);
      regimes = [...M.regimes];
    }
    byMask.push({ terms: new Float64Array(M.termVal), desired: new Float64Array(M.desired) });
    M.regimes.forEach((r, j) => {
      if (r !== null) regimeRows.push({ rule: m.crules[j].def.id, regime: r, onAnchor: anchorRegimes[mask][j] === r, mask });
    });
    // a rule that sets its value from this month's inputs must give the value the opening holds
    const list = mask === 0 ? Object.keys(state.vars).map(vIdx) : [...Array(NV).keys()];
    const differ: string[] = [];
    for (const k of list) {
      const r = m.ruleOfVar[k];
      if (r < 0) continue;
      const cr = m.crules[r];
      if (cr.hasAdjust || cr.lagInputs.includes(k)) continue;
      if (mask && m.cstabilisers.some((cs) => cs.suggestion === k || cs.shadow.includes(k))) continue;
      if (rel(heldOut[k], s.vals[k]) <= IDENTITY_TOL) continue;
      if (mask === 0) ruleRows.push({ id: `rule:${cr.def.id}`, value: heldOut[k], expected: s.vals[k], tolerance: IDENTITY_TOL * Math.max(1, Math.abs(s.vals[k])), pass: false, gate: true });
      else differ.push(`'${m.vars[k].id}' (${fmt(heldOut[k])} against ${fmt(s.vals[k])})`);
    }
    if (differ.length) warnings.push(`With padlocks ${mask} closed, month 0 differs: ${differ.join(', ')}`);
  }
  if (ruleRows.length) warnings.unshift(`${ruleRows.length} rule${ruleRows.length === 1 ? ' does' : 's do'} not reproduce the value the opening holds: ${ruleRows.map((c) => c.id.slice(5)).join(', ')}`);
  const checkRows: OpeningReport['checks'] = [];
  for (const r of regimeRows) if (!r.onAnchor) warnings.push(`At month 0 '${r.rule}' is in regime “${r.regime}”${r.mask ? ` (padlocks ${r.mask})` : ''}, which it is not on the anchor`);

  /* the checks */
  const ctx0 = month0Ctx(s.vals, s.anchors);
  for (const c of state.checks) {
    let value: number;
    try {
      value = c.measure(ctx0);
    } catch (e) {
      throw new Error(`${where}: check '${c.id}' failed to measure: ${(e as Error).message}`);
    }
    const pass = Math.abs(value - c.value) <= c.tolerance;
    checkRows.push({ id: c.id, value, expected: c.value, tolerance: c.tolerance, pass, gate: c.gate });
    if (!pass) warnings.push(`${c.gate ? 'Check' : 'Cross-check'} '${c.id}' (${c.label}): ${fmt(value)} against ${fmt(c.value)} ± ${fmt(c.tolerance)}`);
  }

  /* months 1 and 2 */
  const month1: OpeningReport['month1'] = [];
  if (state.continuity?.length) {
    const [one, two] = run(s, 2);
    for (const c of state.continuity) {
      const a = c.measure(ctx0),
        b = c.measure(one),
        d = c.measure(two);
      const trend = c.trend ?? 0;
      const pass = Math.abs(b - a - trend) <= c.bound && Math.abs(d - b - trend) <= c.bound;
      month1.push({ id: c.id, month0: a, month1: b, month2: d, bound: c.bound, pass });
      if (!pass) warnings.push(`'${c.id}' (${c.label}) moves ${fmt(b - a)} in month 1 and ${fmt(d - b)} in month 2, beyond ${fmt(c.bound)}`);
    }
  }

  /* the start gaps */
  const gaps: OpeningReport['gaps'] = [];
  for (const [group, g] of Object.entries(m.def.startGaps ?? {})) {
    const value = s.pBase[pIdx(startGapId(group))];
    const fade = s.pBase[pIdx(startGapFadeId(group))];
    let share = 0;
    for (const t of g.targets) {
      const j = m.termKeyIndex.get(`${t}.${START_GAP_TERM}`);
      if (j === undefined) continue;
      share = Math.max(share, Math.abs(terms[j]) / Math.max(Math.abs(s.vals[vIdx(t)]), 1e-12));
    }
    gaps.push({ group, targets: [...g.targets], value, scale: g.scale, shareOfRule: share, fade, halfLifeMonths: halfLifeMonths(fade) });
    if (g.scale === 'relative' && Math.abs(value) > (g.bound ?? RELATIVE_GAP_GUARD)) warnings.push(`Start gap '${group}' is ${fmt(value)} of its rules' values, beyond its guard ${g.bound ?? RELATIVE_GAP_GUARD}`);
    if (g.scale === 'absolute' && g.bound !== undefined && Math.abs(value) > g.bound) warnings.push(`Start gap '${group}' is ${fmt(value)}, beyond its guard ${g.bound}`);
  }

  /* what the report lists */
  const money = m.def.moneyUnit?.perUnit;
  const positionsReport: OpeningReport['positions'] = [];
  m.instruments.forEach((ins, i) =>
    m.players.forEach((pl, p) => {
      const j = i * NP + p;
      if (!m.role[j]) return;
      const value = signedAt(positions, j);
      positionsReport.push({ instrument: ins.id, player: pl.id, value, money: money === undefined ? null : value * money, source: sources[j]! });
    }),
  );
  const varsReport = Object.entries(state.vars).map(([id, x]) => ({ id, value: s.vals[vIdx(id)], source: x.source }));
  const paramIds = [...new Set([...Object.keys(state.params), ...unknowns.flatMap((u) => ('param' in u ? [u.param] : [])), ...autoBases.map((b) => m.params[b.k].id)])];
  const paramsReport = paramIds.map((id) => {
    const k = pIdx(id);
    const provenance: Provenance =
      state.params[id]?.provenance ??
      (unknownIds.includes(id) ? { basis: 'calibrated', note: 'Solved by the opening (start solve).' } : { basis: 'derived', note: 'The rule’s value at month 0 (start-gap base).' });
    return { id, value: s.pBase[k], anchor: anchor.pBase[k], provenance };
  });
  const anchorsReport = Object.keys(state.anchors ?? {}).map((id) => ({ id, value: s.anchors[vIdx(id)], structural: structural[vIdx(id)] }));
  const records = new Set<Id>();
  for (const st of state.stocks) for (const r of st.source.records ?? []) records.add(r);
  for (const x of Object.values(state.vars)) for (const r of x.source.records ?? []) records.add(r);
  for (const ids of paramRecords.values()) for (const r of ids) records.add(r);
  for (const c of state.checks) for (const r of c.records) records.add(r);
  for (const t of targets) for (const r of t.records) records.add(r);
  for (const x of [...state.stocks.map((st) => ({ what: `${st.at[0]} / ${st.at[1]}`, b: st.source.basis })), ...Object.entries(state.vars).map(([id, x]) => ({ what: id, b: x.source.basis }))])
    if (x.b === 'assumed' || x.b === 'placeholder') warnings.push(`'${x.what}' is ${x.b === 'assumed' ? 'a bridge (assumed)' : 'a placeholder'}`);
  for (const [id, x] of Object.entries(state.params)) if (x.provenance.basis === 'assumed' || x.provenance.basis === 'placeholder') warnings.push(`Parameter '${id}' is ${x.provenance.basis === 'assumed' ? 'a bridge (assumed)' : 'a placeholder'}`);

  const report: OpeningReport = {
    id: def.id,
    label: def.label,
    asOf: def.asOf,
    month0: m.def.calendar?.month0 ?? null,
    positions: positionsReport,
    vars: varsReport,
    params: paramsReport,
    anchors: anchorsReport,
    gaps,
    checks: [...checkRows, ...ruleRows],
    month1,
    regimes: regimeRows,
    solve: { mode: n ? mode : 'check', unknowns: n, iterations, residual: n ? maxAbs(F) : 0, condition, solution: solved },
    recordsUsed: [...records].sort(),
    warnings,
  };
  return {
    pBase: s.pBase,
    exoBase: s.exo,
    positions,
    vars: s.vals,
    terms,
    desired,
    byMask: NS ? byMask : undefined,
    regimes,
    history,
    ...(s.trend ? { trend: s.trend } : {}),
    anchors: s.anchors,
    solved,
    method: 'opening',
    iterations,
    residual: n ? maxAbs(F) : 0,
    unknowns: n,
    targets: targets.map((t, i) => ({ id: t.id, describe: t.describe, residual: F[i] })),
    warnings,
    report,
  };
}

/** What fails an opening (T2): a gated check or a rule that does not reproduce the value the
 *  opening holds, or a regime at month 0 that the anchor does not have. Empty when it passes. */
export function openingFailures(r: OpeningReport): string[] {
  return [
    ...r.checks.filter((c) => c.gate && !c.pass).map((c) => (c.id.startsWith('rule:') ? `rule '${c.id.slice(5)}' gives ${fmt(c.value)} at month 0, against ${fmt(c.expected)}` : `check '${c.id}': ${fmt(c.value)} against ${fmt(c.expected)} ± ${fmt(c.tolerance)}`)),
    ...r.regimes.filter((x) => !x.onAnchor).map((x) => `'${x.rule}' is in regime “${x.regime}” at month 0${x.mask ? ` (padlocks ${x.mask})` : ''}, and not on the anchor`),
  ];
}

/** Model rule 5 for an opening's parameter: a provenance with a basis, and a source and a vintage
 *  for data. */
function provenanceErrors(id: Id, p: Provenance | undefined): string[] {
  if (!p || !p.basis) return [`parameter '${id}' has no provenance`];
  if (p.basis === 'data' && !(p.source?.trim() && p.vintage?.trim())) return [`parameter '${id}' is data, so its provenance needs a source and a vintage`];
  return [];
}

/* --------------------------------------------------------------- positions */

/** The opening's positions (signed, asset +), with each one's source: every position listed
 *  except one per financial instrument, which the kernel fills (T1). */
function openingPositions(m: KModel, state: OpeningState, where: string): { positions: Float64Array; sources: (OpeningSource | null)[] } {
  const { NP, NI } = m;
  const pos = new Float64Array(NI * NP);
  const sources: (OpeningSource | null)[] = new Array(NI * NP).fill(null);
  const errors: string[] = [];
  for (const st of state.stocks) {
    const [ins, pl] = st.at;
    const i = m.instrumentIndex.get(ins),
      p = m.playerIndex.get(pl);
    if (i === undefined || p === undefined) {
      errors.push(`position ('${ins}', '${pl}') names an unknown instrument or player`);
      continue;
    }
    const j = i * NP + p;
    if (!m.role[j]) {
      errors.push(`position ('${ins}', '${pl}'): '${pl}' neither holds nor issues '${ins}'`);
      continue;
    }
    if (sources[j]) errors.push(`position ('${ins}', '${pl}') is listed twice`);
    if (!Number.isFinite(st.value)) errors.push(`position ('${ins}', '${pl}') is ${st.value}`);
    const b = st.source?.basis;
    if (b === 'mirror') errors.push(`position ('${ins}', '${pl}'): 'mirror' is the kernel's fill; name it in fills instead`);
    else if (!POSITION_BASES.includes(b)) errors.push(`position ('${ins}', '${pl}') has basis '${b}'; a position is data, a residual, a mirror or allocated`);
    if (b === 'allocated' && !st.source.note?.trim()) errors.push(`position ('${ins}', '${pl}') is allocated without naming its key (source.note)`);
    pos[j] = m.role[j] === ROLE_ISSUER ? -st.value : st.value;
    sources[j] = st.source;
  }
  const fills = state.fills ?? {};
  for (const [ins, pl] of Object.entries(fills)) {
    const i = m.instrumentIndex.get(ins);
    if (i === undefined) errors.push(`fill '${ins}' is not an instrument`);
    else if (m.instruments[i].kind !== 'financial') errors.push(`fill '${ins}' is a real asset; real assets have holders only and are listed in full`);
  }
  m.instruments.forEach((ins, i) => {
    if (ins.kind === 'financial') {
      const pl = fills[ins.id];
      if (pl === undefined) {
        errors.push(`instrument '${ins.id}' has no fill: name the one position the kernel fills so it balances`);
        return;
      }
      const p = m.playerIndex.get(pl);
      if (p === undefined || !m.role[i * NP + p]) {
        errors.push(`instrument '${ins.id}' is filled at '${pl}', which neither holds nor issues it`);
        return;
      }
      const j = i * NP + p;
      if (sources[j]) {
        errors.push(`position ('${ins.id}', '${pl}') is both listed and the fill`);
        return;
      }
      let s = 0;
      for (let q = 0; q < NP; q++) if (q !== p) s += pos[i * NP + q];
      pos[j] = -s;
      sources[j] = { basis: 'mirror', note: `The kernel's fill: ${ins.id} balances` };
    }
    for (let q = 0; q < NP; q++) {
      const j = i * NP + q;
      if (m.role[j] && !sources[j]) errors.push(`position ('${ins.id}', '${m.players[q].id}') is not listed`);
    }
  });
  if (!errors.length)
    m.instruments.forEach((ins, i) => {
      for (let q = 0; q < NP; q++) {
        const j = i * NP + q;
        if (!m.role[j] || m.signExempt[j]) continue;
        const v = m.role[j] === ROLE_ISSUER ? -pos[j] : pos[j];
        if (v < -SIGN_TOL)
          errors.push(`position ('${ins.id}', '${m.players[q].id}') is ${fmt(v)}, below zero for ${m.role[j] === ROLE_HOLDER ? 'an asset' : 'a liability'} (${sources[j]!.basis}${sources[j]!.note ? `: ${sources[j]!.note}` : ''})`);
      }
    });
  if (errors.length) throw new Error(`${where}: the opening's positions do not hold together:\n  - ${errors.join('\n  - ')}`);
  return { positions: pos, sources };
}

/* ------------------------------------------------------------------ helpers */

/** Each rule's regime on the anchor state, under every padlock configuration. */
function regimesOnAnchor(m: KModel, anchor: Baseline, opts: OpeningOptions): (string | null)[][] {
  const M = new Machine(m, { dev: false, lagWindow: opts.lagWindow });
  const out: (string | null)[][] = [];
  const all = new Uint8Array(m.NV).fill(1);
  for (let mask = 0; mask < 1 << m.cstabilisers.length; mask++) {
    M.pBase.set(anchor.pBase);
    M.exoBase.set(anchor.exoBase);
    M.initLevers();
    m.cstabilisers.forEach((cs, j) => (M.leverVal[cs.lock] = mask & (1 << j) ? 1 : 0));
    M.applyLevers();
    M.ledger.pos.set(anchor.positions);
    M.cur.set(anchor.vars);
    M.initHistory(anchor.vars, anchor.history, 1);
    M.baseVars = anchor.anchors ?? anchor.vars;
    M.t = -1;
    M.evaluate(all, new Float64Array(m.NV));
    out.push([...M.regimes]);
  }
  return out;
}

/** The 2-norm condition number of a square matrix: √(λmax ÷ λmin) of AᵀA. */
function conditionNumber(A: Float64Array, n: number): number {
  const AtA = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) for (let r = 0; r < n; r++) AtA[i * n + k] += A[r * n + i] * A[r * n + k];
  const ev = symmetricEigenvalues(AtA, n);
  const lo = ev[0],
    hi = ev[n - 1];
  return lo > 0 ? Math.sqrt(hi / lo) : Infinity;
}

/** The pair of columns of A that point most nearly the same way. */
function mostCollinear(A: Float64Array, n: number): [number, number] {
  let best: [number, number] = [0, Math.min(1, n - 1)];
  let cos = -1;
  const norm = (k: number) => Math.sqrt(Array.from({ length: n }, (_, i) => A[i * n + k] ** 2).reduce((s, x) => s + x, 0));
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      let dot = 0;
      for (let i = 0; i < n; i++) dot += A[i * n + a] * A[i * n + b];
      const c = Math.abs(dot) / Math.max(norm(a) * norm(b), 1e-300);
      if (c > cos) {
        cos = c;
        best = [a, b];
      }
    }
  return best;
}

/** The anchor view an opening builds on, for a solved baseline (tests and tools). */
export function anchorsOf(m: KModel, b: Baseline): OpeningAnchors {
  return {
    param: (id) => b.pBase[m.paramIndex.get(id)!],
    value: (id) => b.vars[m.varIndex.get(id)!],
    stock: (ins, pl) => {
      const j = m.instrumentIndex.get(ins)! * m.NP + m.playerIndex.get(pl)!;
      return m.role[j] === ROLE_ISSUER ? -b.positions[j] : b.positions[j];
    },
  };
}
