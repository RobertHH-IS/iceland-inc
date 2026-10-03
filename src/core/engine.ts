/**
 * The engine: createEngine(model) compiles the model, solves its baseline and returns an
 * Engine (types.ts) that steps month by month.
 *
 * One month (architecture §4.2):
 *   1. apply the lever events scheduled for this month (settings change parameters or
 *      exogenous variables; one-offs call fire() through the restricted ShockApi);
 *   2. N kernel sub-steps (ModelDef.substeps, 1 by default), each a complete step of dt / N:
 *      evaluate the schedule (simultaneous blocks by Gauss–Seidel, Newton as a fallback), post
 *      every leg (amount × dt / N) through the payment system, run the four accounting checks
 *      and the position-sign diagnostic;
 *   3. record the month (decision 0011's display contract): variables and positions at the
 *      month's end, each leg as the month's total ÷ dt, each term as TermDef.month says, each
 *      regime if it held in any sub-step (flagged when it switched), the worst residual of the
 *      sub-steps; and take a full snapshot every 12 months for fast seek().
 *
 * Events at month t are applied on arrival at t, after that month's snapshot, so replaying
 * from any snapshot reproduces a straight run bit for bit.
 *
 * Padlocks (decision 0010). Each stabiliser's lever has a padlock, a 'lock' lever. Closing it
 * freezes the lever at the value in force (StabiliserDef.current); setting a lever while its
 * padlock is open closes it at the new value. Both happen inside applyEvent, so the interface,
 * scenarios, replays and forks agree. Opening it hands the lever back to its rule, which steps
 * from the value in force. A lever is in force once a month has run with it: one set and unlocked
 * in the same month never was, and the rule carries on from where it stood (the interface runs the
 * month first, EngineClient.setLever).
 */
import type {
  BalanceSheet,
  CalendarMonth,
  CheckReport,
  ConceptDef,
  Engine,
  FeedEntry,
  Id,
  Influence,
  IndicatorCtx,
  IndicatorBasis,
  LegSnapshot,
  ModelDef,
  MoneyUnit,
  Pipe,
  PipeView,
  RunResult,
  Scenario,
  ScenarioEvent,
  ShockApi,
  SignViolation,
  StabiliserState,
} from './types.ts';
import { compile, isCompiled, isLocked, ROLE_ISSUER, TERM_FIRST, TERM_SUM, type CLever, type KModel } from './compile.ts';
import { Machine, substepsOf, type MachineState } from './machine.ts';
import type { Ledger } from './ledger.ts';
import { baselineReport, solveBaseline, type Baseline, type BaselineReport } from './steady.ts';
import { CHECKS, DEFAULT_SIGN_TOLERANCE, DEFAULT_TOLERANCE, measureChecks, measureSigns, type CheckSpec, type SignSpec } from './checks.ts';
import { ideasAtPlay, influenceOf, type InfluenceSource } from './influence.ts';
import { toDisplay } from './format.ts';
import { nodeFor } from './hierarchy.ts';
import { migrateScenario, scenarioVersion, SCENARIO_VERSION } from './migrate.ts';
import type { OpeningReport } from './opening.ts';

export interface EngineOptions {
  /** Throw when a rule reads something it did not declare (default true). */
  dev?: boolean;
  /** What to do when an accounting check fails: record it (default) or throw. A throw comes
   *  after the month is fully recorded and its lever events applied, so the engine is in the
   *  state a replay would reach. Position-sign violations never throw. */
  onCheckFailure?: 'record' | 'throw';
  /** Accounting tolerance (default 1e-9). */
  tolerance?: number;
  /** Tolerance of the position-sign diagnostic (default 1e-6). */
  signTolerance?: number;
  /** Gauss–Seidel tolerance for simultaneous blocks (default 1e-12). */
  solverTol?: number;
  /** Gauss–Seidel iteration guard before Newton (default 200). */
  maxIter?: number;
  /** Steps lag() can reach back (default two years of steps). */
  lagWindow?: number;
  /** Steps between snapshots (default 12). */
  snapshotEvery?: number;
  /** Parameter overrides applied BEFORE the baseline is solved: a model variant. */
  params?: Record<Id, number>;
  /** Concepts defined outside the model, passed to the compiler. */
  extraConcepts?: ConceptDef[];
  /** Reuse an already solved baseline (forks do this). */
  baseline?: Baseline;
  /** Terms held at their baseline value ('ruleId.termId' or 'varId.termId'). */
  disableTerms?: Id[];
  /** Parameter overrides applied AFTER the baseline is solved (fork counterfactuals). */
  forkParams?: Record<Id, number>;
  /** Testing only: called after each kernel step's postings and before its checks, with the
   *  month being stepped to and the sub-step within it (0 to N − 1), so kernel tests can break a
   *  posting on purpose and see the checks catch it. */
  testHooks?: {
    afterPost?: (ledger: Ledger, month: number, substep: number) => void;
    /** After each kernel step has posted and its values have become the lags: its variables and
     *  positions (Ctx.stock convention), so tests can check a rule's arithmetic sub-step by
     *  sub-step, where the month records only its end. */
    afterSubstep?: (month: number, substep: number, read: { value(id: Id): number; stock(instrument: Id, player: Id): number }) => void;
  };
}

/** The Engine interface plus kernel extras used by the harness, tests and interface. */
export interface KernelEngine extends Engine {
  readonly model: KModel;
  readonly baselineData: Baseline;
  readonly options: Readonly<EngineOptions>;
  /** Warnings from the compiler and the baseline solver. */
  readonly warnings: string[];
  /** Publish the baseline: every parameter, variable, stock and leg. */
  baselineReport(): BaselineReport;
  /** Current position (asset positive for holders, liability positive for issuers). */
  stock(instrument: Id, player: Id): number;
  baseStock(instrument: Id, player: Id): number;
  /** A variable's value at a past month of the current history. */
  valueAt(varId: Id, month: number): number;
  /** An indicator at a recorded month, optionally compared with the same month's no-change run.
   *  This is read-only; neither engine is advanced by a reporting query. */
  indicatorAt(indicatorId: Id, month: number, reference?: KernelEngine): number;
  influences(id: Id, reference?: KernelEngine): Influence;
  ideasAtPlay(scope?: Id, reference?: KernelEngine): { concept: Id; weight: number; via: Id[] }[];
  /** Signed positions at a past month ([instrument * NP + player], asset +). */
  positionsAt(month: number): Float64Array;
  /** Every rule's regime label at a past month of the current history, in rule order
   *  (`model.rules`), null where the rule names none: with sub-steps, the label of the last
   *  sub-step that named one (a regime binds for the month if it binds in any sub-step). Read-only. */
  regimesAt(month: number): readonly (string | null)[];
  /** The rules (indices in `model.rules`) whose regime changed between the sub-steps of a past
   *  month; always empty at one step a month. */
  regimeSwitchesAt(month: number): readonly number[];
  /** The history so far as a RunResult (for calibration measures). */
  runResult(): RunResult;
  /** A fork is a kernel engine too. `testHooks` replace the parent's in the fork (tests only). */
  fork(opts?: { disableTerms?: Id[]; params?: Record<Id, number>; testHooks?: EngineOptions['testHooks'] }): KernelEngine;
  /** Largest residual of each accounting check over the current history. */
  maxResiduals(): { id: Id; residual: number }[];
  /** Timing and solver statistics since creation: `steps` and `microsPerStep` count months,
   *  each of `substeps` kernel steps. */
  stats(): { steps: number; microsPerStep: number; substeps: number; newtonFallbacks: number; maxIterations: number };
  /** The opening report when the engine starts from a dated opening (opening.ts), else null. */
  readonly opening: OpeningReport | null;
  /** How model money is shown in a currency (ModelDef.moneyUnit), or null. */
  readonly moneyUnit: MoneyUnit | null;
  /** The calendar month of a model month, or null for a model without a calendar. */
  calendar(month: number): CalendarMonth | null;
}

/** The calendar month `month` months after `month0`. */
export function calendarMonth(month0: CalendarMonth, month: number): CalendarMonth {
  const k = month0.year * 12 + (month0.month - 1) + Math.round(month);
  return { year: Math.floor(k / 12), month: (((k % 12) + 12) % 12) + 1 };
}

/** What the stabiliser narration remembers from one month to the next (per stabiliser). */
interface StabiliserFeedState {
  /** Calling at the last update. */
  prev: Uint8Array;
  /** The stabiliser's lever and its padlock at the last update: a change means the user moved
   *  them, and a call that the change itself causes is not narrated. */
  lever: Float64Array;
  lock: Float64Array;
  /** Month and direction (+1 raise, −1 lower) of the last message, to keep the feed sparse. */
  lastT: Float64Array;
  lastDir: Int8Array;
}

interface Snapshot {
  machine: MachineState;
  feedPrev: Uint8Array;
  stabFeed: StabiliserFeedState;
}

const cloneStabFeed = (s: StabiliserFeedState): StabiliserFeedState => ({
  prev: new Uint8Array(s.prev),
  lever: new Float64Array(s.lever),
  lock: new Float64Array(s.lock),
  lastT: new Float64Array(s.lastT),
  lastDir: new Int8Array(s.lastDir),
});

/** A number in a stabiliser's feed message: rounded to two decimals ... */
const feedRound = (x: number) => Number(x.toFixed(2));
/** ... and written with no trailing zeros and a true minus sign. */
const feedNumber = (x: number) => String(x).replace('-', '−');

/** Closing a padlock keeps the lever's own value when the value in force is this close to it (in
 *  lever units), so locking an untouched lever at the baseline holds its default exactly rather
 *  than a rounding of it (100 × 0.03 is not 3 in floating point). */
export const LOCK_SNAP = 1e-9;

class KEngine implements KernelEngine {
  readonly model: KModel;
  readonly baselineData: Baseline;
  readonly options: Readonly<EngineOptions>;
  readonly warnings: string[];
  private readonly M: Machine;
  private readonly tol: number;
  private readonly signTol: number;
  private readonly signSpec: SignSpec;
  private readonly every: number;
  private readonly checkSpec: CheckSpec;
  private readonly baseInd: Float64Array;
  private readonly ictx: IndicatorCtx;
  private readonly baseCtx: IndicatorCtx;
  private readonly src: InfluenceSource;
  private readonly shock: ShockApi;
  private readonly checkBuf = new Float64Array(4);
  private readonly subBuf = new Float64Array(4);
  /** Kernel steps a month (ModelDef.substeps): the machine advances by dt / N. */
  private readonly N: number;
  /** Terms a month shows as a sum over its sub-steps, as its first sub-step's value, and as its
   *  last sub-step's value (TermDef.month). */
  private readonly sumTerms: Int32Array;
  private readonly firstTerms: Int32Array;
  private readonly lastTerms: Int32Array;
  /** Rules with a regime label. */
  private readonly regimeRules: Int32Array;
  /** Baseline term values as a month shows them ('sum' terms × N), per lock
   *  configuration (indexed by lock mask) when the model has stabilisers. */
  private readonly baseShown: Float64Array;
  private readonly baseShownByMask: Float64Array[] | null;
  /** The month being stepped: term values as the month shows them, leg sums, regimes. */
  private readonly termMonth: Float64Array;
  private readonly legMonth: Float64Array;
  private readonly regimeMonth: (string | null)[];
  private readonly switchMonth: Uint8Array;
  private script: ScenarioEvent[] = [];
  private snaps = new Map<number, Snapshot>();
  private hVars: Float64Array[] = [];
  private hTerms: Float64Array[] = [];
  private hDesired: Float64Array[] = [];
  private hRegimes: (string | null)[][] = [];
  /** Rules whose regime switched between the sub-steps of each recorded month. */
  private hSwitches: number[][] = [];
  /** Each recorded month's legs: the month's total ÷ dt (the average of its sub-steps). */
  private hLegs: Float64Array[] = [];
  /** Padlocks (lock mask) each recorded month's term values were computed under. */
  private hLocks: number[] = [];
  private hInd: Float64Array[] = [];
  private hPos: Float64Array[] = [];
  private hChecks: Float64Array[] = [];
  private feedLog: FeedEntry[] = [];
  private feedPrev: Uint8Array;
  private stabFeed: StabiliserFeedState;
  private failures: { t: number; id: Id; residual: number }[] = [];
  /** First wrong-sign month of each position (signSeen marks the positions already reported). */
  private signViolations: SignViolation[] = [];
  private signSeen: Uint8Array;
  private readonly signBuf: number[] = [];
  private stepCount = 0;
  private stepMillis = 0;
  private maxIters = 0;

  constructor(model: KModel, opts: EngineOptions) {
    this.model = model;
    this.options = opts;
    const m = model;
    this.tol = opts.tolerance ?? DEFAULT_TOLERANCE;
    this.signTol = opts.signTolerance ?? DEFAULT_SIGN_TOLERANCE;
    this.every = Math.max(1, Math.round(opts.snapshotEvery ?? 12));
    this.N = substepsOf(m.def);
    const base = opts.baseline ?? solveBaseline(m, { params: opts.params, dev: opts.dev, lagWindow: opts.lagWindow });
    this.baselineData = base;
    this.warnings = [...m.warnings, ...base.warnings];
    const M = new Machine(m, { dev: opts.dev, tol: opts.solverTol, maxIter: opts.maxIter, lagWindow: opts.lagWindow });
    this.M = M;
    M.pBase.set(base.pBase);
    for (const [id, v] of Object.entries(opts.forkParams ?? {})) {
      const k = m.paramIndex.get(id);
      if (k === undefined) throw new Error(`fork: '${id}' is not a parameter of model '${m.def.id}'`);
      M.pBase[k] = v;
    }
    M.exoBase.set(base.exoBase);
    // base() reads the structural anchor; it is the start itself unless an opening says otherwise
    const anchors = base.anchors ?? base.vars;
    M.baseVars = anchors;
    M.baseTerms = base.terms;
    if (base.byMask) M.baseTermsByMask = base.byMask.map((x) => x.terms);
    const shown = (terms: Float64Array) => {
      const out = new Float64Array(terms);
      for (const j of this.sumTerms) out[j] *= this.N;
      return out;
    };
    this.sumTerms = new Int32Array(m.cterms.flatMap((t, j) => (t.month === TERM_SUM ? [j] : [])));
    this.firstTerms = new Int32Array(m.cterms.flatMap((t, j) => (t.month === TERM_FIRST ? [j] : [])));
    this.lastTerms = new Int32Array(m.cterms.flatMap((t, j) => (t.month === TERM_SUM || t.month === TERM_FIRST ? [] : [j])));
    this.regimeRules = new Int32Array(m.crules.flatMap((cr) => (cr.def.regime ? [cr.idx] : [])));
    this.baseShown = shown(base.terms);
    this.baseShownByMask = base.byMask ? base.byMask.map((x) => shown(x.terms)) : null;
    this.termMonth = new Float64Array(m.cterms.length);
    this.legMonth = new Float64Array(m.clegs.length);
    this.regimeMonth = m.crules.map(() => null);
    this.switchMonth = new Uint8Array(m.crules.length);
    for (const key of opts.disableTerms ?? []) {
      const j = m.termKeyIndex.get(key);
      if (j === undefined) throw new Error(`fork: unknown term '${key}' (use 'ruleId.termId' or 'varId.termId')`);
      M.termDisabled[j] = 1;
    }
    this.checkSpec = {
      financial: new Uint8Array(m.instruments.map((i) => (i.kind === 'financial' ? 1 : 0))),
      exemptFlows: new Uint8Array(m.flows.map((_, f) => (m.clegs.some((l) => l.flow === f && l.oneSided) ? 1 : 0))),
    };
    this.signSpec = { role: m.role, exempt: m.signExempt };
    this.signSeen = new Uint8Array(m.NI * m.NP);
    const NP = m.NP;
    const signed = (pos: Float64Array, ins: Id, pl: Id) => {
      const i = m.instrumentIndex.get(ins),
        p = m.playerIndex.get(pl);
      if (i === undefined || p === undefined) throw new Error(`unknown stock ('${ins}', '${pl}')`);
      const j = i * NP + p;
      return m.role[j] === ROLE_ISSUER ? -pos[j] : pos[j];
    };
    const vIdx = (id: Id) => {
      const k = m.varIndex.get(id);
      if (k === undefined) throw new Error(`unknown variable '${id}'`);
      return k;
    };
    this.ictx = {
      v: (id) => M.cur[vIdx(id)],
      base: (id) => anchors[vIdx(id)],
      stock: (ins, pl) => signed(M.ledger.pos, ins, pl),
      baseStock: (ins, pl) => signed(base.positions, ins, pl),
    };
    this.baseCtx = {
      v: (id) => base.vars[vIdx(id)],
      base: (id) => anchors[vIdx(id)],
      stock: (ins, pl) => signed(base.positions, ins, pl),
      baseStock: (ins, pl) => signed(base.positions, ins, pl),
    };
    this.baseInd = new Float64Array(m.indicators.map((ind) => ind.compute(this.baseCtx)));
    m.indicators.forEach((ind, i) => {
      if (ind.display === 'deviation-pct' && Math.abs(this.baseInd[i]) < 1e-12) this.warnings.push(`indicator '${ind.id}' shows % deviation but its baseline is 0; it falls back to the difference × 100`);
    });
    const self = this;
    // baseline terms and desired values under the padlocks that the current term values were
    // computed under (not the padlocks as they are now: a lock or unlock shows at the next step).
    // The month on show (decision 0011): its recorded terms, desired values, regimes and legs, so
    // what the inspector says of "this month" does not depend on the sub-steps.
    const locks = () => self.hLocks[self.month];
    const baseNow = () => (base.byMask ? base.byMask[locks()] : base);
    this.src = {
      m,
      get cur() {
        return M.cur;
      },
      baseVars: base.vars,
      get termVal() {
        return self.hTerms[self.month];
      },
      get baseTerms() {
        return self.baseShownByMask ? self.baseShownByMask[locks()] : self.baseShown;
      },
      get desired() {
        return self.hDesired[self.month];
      },
      get baseDesired() {
        return baseNow().desired;
      },
      get regimes() {
        return self.hRegimes[self.month];
      },
      get regimeSwitches() {
        return self.hSwitches[self.month];
      },
      get legs() {
        return self.hLegs[self.month];
      },
      get pEff() {
        return M.pEff;
      },
      get locks() {
        return locks();
      },
      ctxOf: (r) => M.ctxOf(r),
      indicatorLevel: (i) => self.levelNow(i),
      indicatorBase: (i) => self.baseInd[i],
    };
    this.shock = {
      get: (id) => M.lag1(this.shockVar(id, 'get')),
      setLagged: (id, value) => {
        const k = this.shockVar(id, 'setLagged');
        if (!m.lagged[k]) throw new Error(`ShockApi.setLagged('${id}'): no rule reads '${id}' with lag() or adjusts it gradually, so its previous value has no effect`);
        if (!Number.isFinite(value)) throw new Error(`ShockApi.setLagged('${id}'): value must be finite`);
        M.setLag1(k, value);
      },
    };
    this.feedPrev = new Uint8Array(m.feed.length);
    const ns = m.stabilisers.length;
    this.stabFeed = { prev: new Uint8Array(ns), lever: new Float64Array(ns), lock: new Float64Array(ns), lastT: new Float64Array(ns).fill(-Infinity), lastDir: new Int8Array(ns) };
    this.reset();
  }

  private shockVar(id: Id, fn: string): number {
    const m = this.model;
    const k = m.varIndex.get(id);
    if (k !== undefined) return k;
    const [ins] = id.split(/[:./]/);
    if (m.instrumentIndex.has(id) || m.instrumentIndex.has(ins))
      throw new Error(`ShockApi.${fn}('${id}') rejected: '${ins}' is an instrument. Stocks change only through flow postings; a one-off shock may only touch non-stock state`);
    throw new Error(`ShockApi.${fn}('${id}'): unknown variable`);
  }

  /* ---------------------------------------------------------------- state */

  get t(): number {
    return this.month;
  }

  /** Recorded steps (months) so far: the machine's sub-steps ÷ N (whole at every month end). */
  private get month(): number {
    return this.M.t / this.N;
  }

  get events(): ScenarioEvent[] {
    return this.script.map((e) => ({ ...e }));
  }

  reset(): void {
    const { M, baselineData: b } = this;
    M.t = 0;
    M.head = 0;
    M.ledger.pos.set(b.positions);
    M.ledger.begin();
    M.cur.set(b.vars);
    M.initLevers();
    M.initHistory(M.cur, b.history);
    M.termVal.set(b.terms);
    M.desired.set(b.desired);
    M.evalLocks = M.lockMask();
    b.regimes.forEach((r, j) => (M.regimes[j] = r));
    // month 0 shows the baseline: its terms as a month shows them, its legs, its regimes
    this.termMonth.set(this.baseShownByMask ? this.baseShownByMask[M.evalLocks] : this.baseShown);
    this.model.clegs.forEach((l, i) => (this.legMonth[i] = M.cur[l.amount]));
    b.regimes.forEach((r, j) => (this.regimeMonth[j] = r));
    this.switchMonth.fill(0);
    this.script = [];
    this.snaps = new Map();
    this.hVars = [];
    this.hTerms = [];
    this.hDesired = [];
    this.hRegimes = [];
    this.hSwitches = [];
    this.hLegs = [];
    this.hLocks = [];
    this.hInd = [];
    this.hPos = [];
    this.hChecks = [];
    this.feedLog = [];
    this.failures = [];
    this.signViolations = [];
    this.signSeen.fill(0);
    this.checkBuf.fill(0);
    this.feedPrev.fill(0);
    this.stabFeed.prev.fill(0);
    this.stabFeed.lastT.fill(-Infinity);
    this.stabFeed.lastDir.fill(0);
    this.record();
    this.checkSigns();
    this.updateFeed(false);
    this.snaps.set(0, this.snap());
  }

  /** The position-sign diagnostic for the current month: record each position's first breach. */
  private checkSigns(month = this.month): void {
    const { M, model: m } = this;
    const out = this.signBuf;
    out.length = 0;
    const pos = M.ledger.pos;
    measureSigns(pos, this.signSpec, this.signTol, out);
    for (const j of out) {
      if (this.signSeen[j]) continue;
      this.signSeen[j] = 1;
      const issuer = m.role[j] === ROLE_ISSUER;
      this.signViolations.push({
        instrument: m.instruments[Math.floor(j / m.NP)].id,
        player: m.players[j % m.NP].id,
        role: issuer ? 'issuer' : 'holder',
        t: month,
        value: issuer ? -pos[j] : pos[j],
      });
    }
  }

  private snap(): Snapshot {
    return { machine: this.M.snapshot(), feedPrev: new Uint8Array(this.feedPrev), stabFeed: cloneStabFeed(this.stabFeed) };
  }

  private levelNow(i: number): number {
    return this.model.indicators[i].compute(this.ictx);
  }

  /** Record the month: variables and positions at its end, terms, legs and regimes as the month
   *  shows them (termMonth, legMonth, regimeMonth and switchMonth, filled by the sub-steps). */
  private record(): void {
    const { M, model: m } = this;
    this.hVars.push(new Float64Array(M.cur));
    this.hTerms.push(new Float64Array(this.termMonth));
    this.hDesired.push(new Float64Array(M.desired));
    this.hRegimes.push([...this.regimeMonth]);
    const sw: number[] = [];
    for (let r = 0; r < this.switchMonth.length; r++) if (this.switchMonth[r]) sw.push(r);
    this.hSwitches.push(sw);
    this.hLegs.push(new Float64Array(this.legMonth));
    this.hLocks.push(M.evalLocks);
    const ind = new Float64Array(m.indicators.length);
    for (let i = 0; i < ind.length; i++) ind[i] = m.indicators[i].compute(this.ictx);
    this.hInd.push(ind);
    this.hPos.push(new Float64Array(M.ledger.pos));
    this.hChecks.push(new Float64Array(this.checkBuf));
  }

  private updateFeed(log: boolean): void {
    const m = this.model;
    const t = this.month;
    const ind = this.hInd[t];
    m.feed.forEach((f, j) => {
      const i = m.indicatorIndex.get(f.indicator)!;
      const v = toDisplay(m.indicators[i].display, ind[i], this.baseInd[i]);
      const on = (f.above !== undefined && v > f.above) || (f.below !== undefined && v < f.below) ? 1 : 0;
      if (log && on && !this.feedPrev[j]) this.feedLog.push({ t, message: f.message, indicator: f.indicator, concept: f.concept, rule: f.id });
      this.feedPrev[j] = on;
    });
    if (m.stabilisers.length) this.updateStabiliserFeed(log);
  }

  /**
   * Narrate a locked stabiliser that starts calling for action ("The central bank's rule would
   * raise the key rate to 4.25%"). Kept sparse: nothing when the user has just moved the
   * stabiliser's lever or its padlock (the lever panel shows that call at once), and no repeat in
   * the same direction within a year of the last message.
   */
  private updateStabiliserFeed(log: boolean): void {
    const m = this.model;
    const t = this.month;
    const sf = this.stabFeed;
    const year = Math.max(1, Math.round(1 / m.def.dt));
    this.stabilisers().forEach((s, j) => {
      const def = m.stabilisers[j];
      const lv = this.M.leverVal[m.cstabilisers[j].lever];
      const lk = this.M.leverVal[m.cstabilisers[j].lock];
      const touched = !Object.is(lv, sf.lever[j]) || !Object.is(lk, sf.lock[j]);
      const dir = s.gap > 0 ? 1 : -1;
      if (log && def.feed && s.calling && !sf.prev[j] && !touched && !(sf.lastDir[j] === dir && t - sf.lastT[j] < year)) {
        const value = feedRound(s.suggested),
          change = feedRound(Math.abs(s.gap));
        const message = (dir > 0 ? def.feed.raise : def.feed.lower).replace(/\{value\}/g, feedNumber(value)).replace(/\{change\}/g, feedNumber(change));
        this.feedLog.push({ t, message, indicator: def.feed.indicator, concept: def.concepts?.[0], stabiliser: def.id, dir, value, change });
        sf.lastT[j] = t;
        sf.lastDir[j] = dir;
      }
      sf.prev[j] = s.calling ? 1 : 0;
      sf.lever[j] = lv;
      sf.lock[j] = lk;
    });
  }

  /** After sub-step s's evaluation: add its legs and 'sum' terms to the month, keep its 'first'
   *  terms, and fold its regimes into the month's (the last label named; switched if they differ). */
  private gather(s: number): void {
    const { M, model: m, legMonth, termMonth, regimeMonth, switchMonth } = this;
    const cur = M.cur,
      tv = M.termVal;
    const cl = m.clegs;
    for (let i = 0; i < cl.length; i++) legMonth[i] += cur[cl[i].amount];
    for (const j of this.sumTerms) termMonth[j] = s === 0 ? tv[j] : termMonth[j] + tv[j];
    if (s === 0) for (const j of this.firstTerms) termMonth[j] = tv[j];
    for (const r of this.regimeRules) {
      const now = M.regimes[r];
      if (s === 0) regimeMonth[r] = now;
      else if (now !== regimeMonth[r]) {
        // a switch is a change from any earlier sub-step's label; the month names the last label held
        switchMonth[r] = 1;
        if (now !== null) regimeMonth[r] = now;
      }
    }
  }

  /** Advance one month: N kernel sub-steps (evaluate, post, check each), then arrive at the new
   *  month. Accounting is checked at every sub-step and the month records the worst residual;
   *  the month's legs, terms and regimes are gathered as the display contract says (record()). */
  private stepOnce(): void {
    const { M, model: m, N } = this;
    const t0 = performance.now();
    const month = this.month + 1;
    const worst = this.checkBuf;
    worst.fill(0);
    const { legMonth, termMonth, switchMonth } = this;
    legMonth.fill(0);
    switchMonth.fill(0);
    for (let s = 0; s < N; s++) {
      M.evaluate();
      this.gather(s);
      M.post();
      this.options.testHooks?.afterPost?.(M.ledger, month, s);
      const r = measureChecks(M.ledger, this.checkSpec, this.subBuf);
      for (let k = 0; k < 4; k++) worst[k] = Number.isNaN(r[k]) ? Infinity : Math.max(worst[k], r[k]);
      M.t++;
      M.pushRing();
      if (M.lastIterations > this.maxIters) this.maxIters = M.lastIterations;
      this.options.testHooks?.afterSubstep?.(month, s, { value: this.ictx.v, stock: this.ictx.stock });
      if (s < N - 1) this.checkSigns(month);
    }
    for (let i = 0; i < legMonth.length; i++) legMonth[i] /= N;
    for (const j of this.lastTerms) termMonth[j] = M.termVal[j];
    const r = worst;
    this.stepMillis += performance.now() - t0;
    this.stepCount++;
    let failed: string | null = null;
    for (let k = 0; k < 4; k++)
      if (!(r[k] <= this.tol)) {
        this.failures.push({ t: month, id: CHECKS[k].id, residual: r[k] });
        failed ??= `${CHECKS[k].id} residual ${r[k]} > ${this.tol}`;
      }
    this.record();
    this.checkSigns();
    this.updateFeed(true);
    if (month % this.every === 0) this.snaps.set(month, this.snap());
    // Arrive fully at month t (its events applied) before any throw, so a caller that catches
    // the error and steps on stays on the path seek(), fork() and load() replay. The
    // accounting error takes precedence over an error from an event.
    try {
      this.applyEventsAt(month);
    } finally {
      if (failed && this.options.onCheckFailure === 'throw') throw new Error(`accounting check failed at month ${month} in model '${m.def.id}': ${failed}`);
    }
  }

  step(n = 1): void {
    for (let j = 0; j < n; j++) this.stepOnce();
  }

  /* --------------------------------------------------------------- levers */

  private leverIx(id: Id): number {
    const l = this.model.leverIndex.get(id);
    if (l === undefined) throw new Error(`unknown lever '${id}'`);
    return l;
  }

  /** A lever value the engine accepts: within min and max, and for a choice lever or a padlock
   *  the nearest option (a tie goes to the higher value, as Math.round and isLocked do). */
  private clamp(l: CLever, v: number): number {
    if (!Number.isFinite(v)) throw new Error(`lever '${l.def.id}': value must be a finite number`);
    if (l.def.min !== undefined && v < l.def.min) v = l.def.min;
    if (l.def.max !== undefined && v > l.def.max) v = l.def.max;
    const opts = l.def.kind === 'choice' || l.def.kind === 'lock' ? l.def.options : undefined;
    if (!opts?.length) return v;
    let best = opts[0].value;
    for (const o of opts) {
      const d = Math.abs(o.value - v),
        db = Math.abs(best - v);
      if (d < db || (d === db && o.value > best)) best = o.value;
    }
    return best;
  }

  /** The policy value in force for stabiliser j, in its lever's units (StabiliserDef.current),
   *  read from the latest month. */
  private inForce(j: number): number {
    return this.model.stabilisers[j].current(this.ictx);
  }

  private applyEvent(e: ScenarioEvent): void {
    const j = this.leverIx(e.lever);
    const l = this.model.clevers[j];
    const m = this.model;
    if (e.fire) {
      if (l.def.kind !== 'oneoff') throw new Error(`event fires '${e.lever}', which is a setting`);
      l.def.fire!(this.shock, e.value);
      return;
    }
    if (l.def.kind === 'oneoff') throw new Error(`event sets '${e.lever}', which is a one-off lever (fire it instead)`);
    const lv = this.M.leverVal;
    if (l.def.kind === 'lock') {
      // closing an open padlock freezes the lever at the value in force; opening hands it back
      const sj = m.cstabilisers.findIndex((cs) => cs.lock === j);
      const closing = isLocked(e.value) && !isLocked(lv[j]);
      if (closing && sj >= 0) {
        const k = m.cstabilisers[sj].lever;
        const now = this.inForce(sj);
        if (!Number.isFinite(now)) throw new Error(`stabiliser '${m.stabilisers[sj].id}': the value in force is not a finite number`);
        if (!(Math.abs(now - lv[k]) <= LOCK_SNAP)) lv[k] = now;
      }
      lv[j] = isLocked(e.value) ? 1 : 0;
    } else {
      // setting a lever whose padlock is open takes control of it: the padlock closes
      const sj = m.stabiliserOfLever[j];
      if (sj >= 0) lv[m.cstabilisers[sj].lock] = 1;
      lv[j] = e.value;
    }
    this.M.applyLevers();
  }

  private applyEventsAt(t: number): void {
    for (const e of this.script) if (e.t === t) this.applyEvent(e);
  }

  private insertEvent(e: ScenarioEvent): void {
    let at = this.script.length;
    while (at > 0 && this.script[at - 1].t > e.t) at--;
    this.script.splice(at, 0, e);
    for (const t of [...this.snaps.keys()]) if (t > e.t) this.snaps.delete(t);
  }

  setLever(id: Id, value: number): void {
    const l = this.model.clevers[this.leverIx(id)];
    if (l.def.kind === 'oneoff') throw new Error(`lever '${id}' is a one-off; use fire('${id}', size)`);
    const e: ScenarioEvent = { t: this.month, lever: id, value: this.clamp(l, value) };
    this.insertEvent(e);
    this.applyEvent(e);
  }

  fire(id: Id, size?: number): void {
    const l = this.model.clevers[this.leverIx(id)];
    if (l.def.kind !== 'oneoff') throw new Error(`lever '${id}' is a setting; use setLever('${id}', value)`);
    const e: ScenarioEvent = { t: this.month, lever: id, value: this.clamp(l, size ?? l.def.default), fire: true };
    this.insertEvent(e);
    this.applyEvent(e);
  }

  leverValue(id: Id): number {
    const j = this.leverIx(id);
    const l = this.model.clevers[j];
    return l.def.kind === 'oneoff' ? l.def.default : this.M.leverVal[j];
  }

  /* ----------------------------------------------------- scenarios, time */

  load(s: Scenario): void {
    if (s.modelId && s.modelId !== this.model.def.id) throw new Error(`scenario is for model '${s.modelId}', not '${this.model.def.id}'`);
    // a scenario written before padlocks is migrated first (decision 0010)
    if (scenarioVersion(s) < SCENARIO_VERSION) s = migrateScenario(this.model, s).scenario;
    this.reset();
    const evs = [...s.events].map((e) => ({ ...e })).sort((a, b) => a.t - b.t);
    for (const e of evs) {
      const l = this.model.clevers[this.leverIx(e.lever)];
      if (!(Number.isInteger(e.t) && e.t >= 0)) throw new Error(`scenario event for '${e.lever}' has invalid month ${e.t}`);
      if (!!e.fire !== (l.def.kind === 'oneoff')) throw new Error(`scenario event for '${e.lever}' must ${l.def.kind === 'oneoff' ? '' : 'not '}be fired`);
      e.value = this.clamp(l, e.value);
    }
    this.script = evs;
    this.applyEventsAt(0);
    this.step(Math.max(0, Math.round(s.months)));
  }

  seek(month: number): void {
    const target = Math.max(0, Math.round(month));
    if (target === this.month) return;
    if (target > this.month) {
      this.step(target - this.month);
      return;
    }
    let best = 0;
    for (const t of this.snaps.keys()) if (t <= target && t > best) best = t;
    const s = this.snaps.get(best)!;
    this.M.restore(s.machine);
    this.feedPrev.set(s.feedPrev);
    this.stabFeed = cloneStabFeed(s.stabFeed);
    const keep = best + 1;
    this.hVars.length = keep;
    this.hTerms.length = keep;
    this.hDesired.length = keep;
    this.hRegimes.length = keep;
    this.hSwitches.length = keep;
    this.hLegs.length = keep;
    this.hLocks.length = keep;
    this.hInd.length = keep;
    this.hPos.length = keep;
    this.hChecks.length = keep;
    // the machine's own terms, desired values and regimes are rewritten by the next evaluation;
    // what the month shows is read from the history (the influence source)
    this.M.desired.set(this.hDesired[best]);
    this.M.evalLocks = this.hLocks[best];
    this.checkBuf.set(this.hChecks[best]);
    this.feedLog = this.feedLog.filter((f) => f.t <= best);
    this.failures = this.failures.filter((f) => f.t <= best);
    this.signViolations = this.signViolations.filter((v) => v.t <= best);
    this.signSeen.fill(0);
    const m = this.model;
    for (const v of this.signViolations) this.signSeen[m.instrumentIndex.get(v.instrument)! * m.NP + m.playerIndex.get(v.player)!] = 1;
    for (const t of [...this.snaps.keys()]) if (t > best) this.snaps.delete(t);
    this.applyEventsAt(best);
    this.step(target - best);
  }

  fork(opts: { disableTerms?: Id[]; params?: Record<Id, number>; testHooks?: EngineOptions['testHooks'] } = {}): KernelEngine {
    const o = this.options;
    const f = new KEngine(this.model, {
      ...o,
      ...(opts.testHooks ? { testHooks: opts.testHooks } : {}),
      baseline: this.baselineData,
      disableTerms: [...(o.disableTerms ?? []), ...(opts.disableTerms ?? [])],
      forkParams: { ...(o.forkParams ?? {}), ...(opts.params ?? {}) },
    });
    f.script = this.script.map((e) => ({ ...e }));
    f.applyEventsAt(0);
    f.step(this.month);
    return f;
  }

  /* --------------------------------------------------------------- values */

  private vIndex(id: Id): number {
    const k = this.model.varIndex.get(id);
    if (k === undefined) throw new Error(`unknown variable '${id}'`);
    return k;
  }

  value(varId: Id): number {
    return this.M.cur[this.vIndex(varId)];
  }

  baseline(varId: Id): number {
    return this.baselineData.vars[this.vIndex(varId)];
  }

  valueAt(varId: Id, month: number): number {
    const h = this.hVars[month];
    if (!h) throw new Error(`no history at month ${month} (now at ${this.month})`);
    return h[this.vIndex(varId)];
  }

  positionsAt(month: number): Float64Array {
    const h = this.hPos[month];
    if (!h) throw new Error(`no history at month ${month} (now at ${this.month})`);
    return h;
  }

  regimesAt(month: number): readonly (string | null)[] {
    const h = this.hRegimes[month];
    if (!h) throw new Error(`no history at month ${month} (now at ${this.month})`);
    return h;
  }

  regimeSwitchesAt(month: number): readonly number[] {
    const h = this.hSwitches[month];
    if (!h) throw new Error(`no history at month ${month} (now at ${this.month})`);
    return h;
  }

  stock(instrument: Id, player: Id): number {
    return this.ictx.stock(instrument, player);
  }

  baseStock(instrument: Id, player: Id): number {
    return this.ictx.baseStock(instrument, player);
  }

  private indIndex(id: Id): number {
    const i = this.model.indicatorIndex.get(id);
    if (i === undefined) throw new Error(`unknown indicator '${id}'`);
    return i;
  }

  indicator(id: Id): number {
    const i = this.indIndex(id);
    return toDisplay(this.model.indicators[i].display, this.hInd[this.month][i], this.baseInd[i]);
  }

  /** An actual level from the recorded month. Reporting cannot advance or mutate the model. */
  levelAt(id: Id, month: number, basis: IndicatorBasis = 'nominal'): number {
    const i = this.indIndex(id);
    const ind = this.model.indicators[i];
    const vars = this.hVars[month], pos = this.hPos[month];
    if (!vars || !pos) throw new Error(`no history at month ${month} (now at ${this.month})`);
    if (!ind.level) return toDisplay(ind.display, this.hInd[month][i], this.baseInd[i]);
    const m = this.model;
    const ctx: IndicatorCtx = {
      v: (v) => vars[this.vIndex(v)],
      base: this.baseCtx.base,
      stock: (instrument, player) => {
        const ins = m.instrumentIndex.get(instrument), p = m.playerIndex.get(player);
        if (ins === undefined || p === undefined) throw new Error(`unknown stock ('${instrument}', '${player}')`);
        const k = ins * m.NP + p;
        return m.role[k] === ROLE_ISSUER ? -pos[k] : pos[k];
      },
      baseStock: this.baseCtx.baseStock,
    };
    const compute = ind.level[basis] ?? ind.compute;
    const raw = compute(ctx);
    if (ind.level.rebase) {
      const start = compute(this.baseCtx);
      return Math.abs(start) > 1e-12 ? raw / start * 100 : raw;
    }
    return raw * (ind.level.scale ?? 1);
  }

  /** Detached actual-level history. Indicators without level metadata keep their display. */
  levels(id: Id, basis: IndicatorBasis = 'nominal'): number[] {
    return this.hInd.map((_, month) => this.levelAt(id, month, basis));
  }

  series(id: Id): { t: number; v: number }[] {
    const i = this.model.indicatorIndex.get(id);
    if (i !== undefined) {
      const d = this.model.indicators[i].display;
      return this.hInd.map((h, t) => ({ t, v: toDisplay(d, h[i], this.baseInd[i]) }));
    }
    const k = this.model.varIndex.get(id);
    if (k !== undefined) return this.hVars.map((h, t) => ({ t, v: h[k] }));
    throw new Error(`series: '${id}' is not an indicator or variable`);
  }

  runResult(): RunResult {
    const months = this.month;
    return {
      months,
      series: (id) => this.series(id).map((p) => p.v),
      value: (varId, month) => this.valueAt(varId, month),
    };
  }

  /* ---------------------------------------------------------- flows, sheets */

  /** The month's legs: its total ÷ dt, the average of its sub-steps (decision 0011). */
  legs(): LegSnapshot[] {
    const m = this.model;
    const now = this.hLegs[this.month];
    return m.clegs.map((l, i) => ({
      flow: m.flows[l.flow].id,
      from: m.players[l.from].id,
      to: m.players[l.to].id,
      kind: m.flows[l.flow].kind,
      amount: m.vars[l.amount].id,
      value: now[i],
      baseline: this.baselineData.vars[l.amount],
    }));
  }

  /**
   * Pipes at a level of the player hierarchy: 'player', 'group' (top-level groups) or a mixed
   * view in which each player is drawn as its outermost collapsed group. Legs are summed by
   * (from node, to node, kind); the two directions stay separate, and legs inside one visible
   * node make a pipe from the node to itself.
   */
  pipes(level: 'player' | 'group' | PipeView): Pipe[] {
    const m = this.model;
    const expanded = level === 'player' ? null : new Set<Id>(level === 'group' ? [] : (level.expanded ?? []));
    const node = m.players.map((p, j) => (expanded ? nodeFor(m.groupChains[j], expanded, p.id) : p.id));
    const map = new Map<string, Pipe>();
    const legs = this.legs();
    m.clegs.forEach((l, i) => {
      const leg = legs[i];
      const from = node[l.from],
        to = node[l.to];
      const key = `${from}\u0000${to}\u0000${leg.kind}`;
      let p = map.get(key);
      if (!p) {
        p = { from, to, kind: leg.kind, value: 0, baseline: 0, legs: [] };
        map.set(key, p);
      }
      p.value += leg.value;
      p.baseline += leg.baseline;
      p.legs.push(leg);
    });
    return [...map.values()];
  }

  /** Players (by index) that an id stands for: a player itself, or every player of a group. */
  private membersOf(id: Id): number[] | undefined {
    const m = this.model;
    const p = m.playerIndex.get(id);
    if (p !== undefined) return [p];
    const g = m.groupIndex.get(id);
    return g === undefined ? undefined : m.groups[g].allPlayers.map((x) => m.playerIndex.get(x)!);
  }

  /** A player's balance sheet, or a group's: its players' positions summed instrument by
   *  instrument, assets and liabilities apart (claims between members are not netted). */
  balanceSheet(id: Id): BalanceSheet {
    const m = this.model;
    const members = this.membersOf(id);
    if (members === undefined) throw new Error(`unknown player or group '${id}'`);
    const pos = this.M.ledger.pos,
      b = this.baselineData.positions;
    const out: BalanceSheet = { player: id, assets: [], liabilities: [], netWorth: 0, netWorthBaseline: 0 };
    m.instruments.forEach((ins, i) => {
      let a = 0,
        ab = 0,
        l = 0,
        lb = 0,
        held = false,
        owed = false;
      for (const q of members) {
        const j = i * m.NP + q;
        const r = m.role[j];
        if (!r) continue;
        out.netWorth += pos[j];
        out.netWorthBaseline += b[j];
        if (r === ROLE_ISSUER) {
          owed = true;
          l += -pos[j];
          lb += -b[j];
        } else {
          held = true;
          a += pos[j];
          ab += b[j];
        }
      }
      if (held) out.assets.push({ instrument: ins.id, label: ins.label, value: a, baseline: ab });
      if (owed) out.liabilities.push({ instrument: ins.id, label: ins.label, value: l, baseline: lb });
    });
    return out;
  }

  /* -------------------------------------------------------- explanations */

  private comparisonSource(reference?: KernelEngine): InfluenceSource {
    if (!reference) return this.src;
    if (!(reference instanceof KEngine) || reference.model !== this.model || reference.t !== this.t)
      throw new Error('An explanation needs the same compiled model at the same comparison month');
    return {
      ...this.src,
      baseVars: reference.M.cur,
      baseTerms: reference.hTerms[reference.t],
      baseDesired: reference.hDesired[reference.t],
      baseLegs: reference.hLegs[reference.t],
      indicatorBase: (i) => reference.hInd[reference.t][i],
    };
  }

  indicatorAt(id: Id, month: number, reference?: KernelEngine): number {
    const i = this.model.indicatorIndex.get(id);
    if (i === undefined) throw new Error(`unknown indicator '${id}'`);
    if (!Number.isInteger(month) || month < 0 || month > this.t) throw new Error(`unrecorded month '${month}'`);
    if (reference && (!(reference instanceof KEngine) || reference.model !== this.model || month > reference.t))
      throw new Error('An indicator needs the same compiled model and a recorded comparison month');
    const base = reference ? (reference as KEngine).hInd[month][i] : this.baseInd[i];
    const display = this.model.indicators[i].display;
    return reference && display === 'level' ? this.hInd[month][i] - base : toDisplay(display, this.hInd[month][i], base);
  }

  influences(id: Id, reference?: KernelEngine): Influence {
    return influenceOf(this.comparisonSource(reference), id);
  }

  ideasAtPlay(scope?: Id, reference?: KernelEngine): { concept: Id; weight: number; via: Id[] }[] {
    return ideasAtPlay(this.comparisonSource(reference), scope);
  }

  checks(): CheckReport {
    const r = this.checkBuf;
    let max = 0;
    for (let k = 0; k < 4; k++) max = Number.isNaN(r[k]) ? Infinity : Math.max(max, r[k]);
    return {
      t: this.month,
      maxResidual: max,
      items: CHECKS.map((c, k) => ({ id: c.id, label: c.label, residual: r[k] })),
      tolerance: this.tol,
      failures: this.failures.map((f) => ({ ...f })),
      signViolations: this.signViolations.map((v) => ({ ...v })),
      signTolerance: this.signTol,
    };
  }

  maxResiduals(): { id: Id; residual: number }[] {
    return CHECKS.map((c, k) => {
      let m = 0;
      for (const h of this.hChecks) m = Number.isNaN(h[k]) ? Infinity : Math.max(m, h[k]);
      return { id: c.id, residual: m };
    });
  }

  feed(): FeedEntry[] {
    return this.feedLog.map((f) => ({ ...f }));
  }

  stabilisers(): StabiliserState[] {
    const m = this.model;
    return m.stabilisers.map((s, j) => {
      const cs = m.cstabilisers[j];
      const locked = isLocked(this.M.leverVal[cs.lock]);
      const suggested = this.M.cur[cs.suggestion];
      const current = locked ? this.M.leverVal[cs.lever] : this.inForce(j);
      const gap = suggested - current;
      return { id: s.id, label: s.label, lever: s.lever, lock: m.levers[cs.lock].id, locked, suggested, current, gap, calling: locked && Math.abs(gap) > s.threshold, description: s.description };
    });
  }

  baselineReport(): BaselineReport {
    return baselineReport(this.model, this.baselineData);
  }

  get opening(): OpeningReport | null {
    const b = this.baselineData as Baseline & { report?: OpeningReport };
    return b.report ?? null;
  }

  get moneyUnit(): MoneyUnit | null {
    return this.model.def.moneyUnit ?? null;
  }

  calendar(month: number): CalendarMonth | null {
    const c = this.model.def.calendar;
    return c ? calendarMonth(c.month0, month) : null;
  }

  stats() {
    return {
      steps: this.stepCount,
      microsPerStep: this.stepCount ? (this.stepMillis * 1000) / this.stepCount : 0,
      substeps: this.N,
      newtonFallbacks: this.M.newtonFallbacks,
      maxIterations: this.maxIters,
    };
  }
}

/** Compile (if needed), solve the baseline and return a running engine at month 0. */
export function createEngine(model: ModelDef | KModel, opts: EngineOptions = {}): KernelEngine {
  const m = isCompiled(model) ? model : compile(model, { extraConcepts: opts.extraConcepts });
  return new KEngine(m, opts);
}
