/**
 * The engine: createEngine(model) compiles the model, solves its baseline and returns an
 * Engine (types.ts) that steps month by month.
 *
 * One step (architecture §4.2):
 *   1. apply the lever events scheduled for this month (settings change parameters or
 *      exogenous variables; one-offs call fire() through the restricted ShockApi);
 *   2. evaluate the schedule; simultaneous blocks by Gauss–Seidel (Newton as a fallback);
 *      record every term, desired value and regime;
 *   3. post every leg (amount × dt) through the payment system;
 *   4. run the four accounting checks;
 *   5. record history, and take a full snapshot every 12 months for fast seek().
 *
 * Events at month t are applied on arrival at t, after that month's snapshot, so replaying
 * from any snapshot reproduces a straight run bit for bit.
 */
import type {
  BalanceSheet,
  CheckReport,
  ConceptDef,
  Engine,
  Id,
  Influence,
  IndicatorCtx,
  LegSnapshot,
  ModelDef,
  Pipe,
  RunResult,
  Scenario,
  ScenarioEvent,
  ShockApi,
} from './types.ts';
import { compile, isCompiled, ROLE_ISSUER, type CLever, type KModel } from './compile.ts';
import { Machine, type MachineState } from './machine.ts';
import type { Ledger } from './ledger.ts';
import { baselineReport, solveBaseline, type Baseline, type BaselineReport } from './steady.ts';
import { CHECKS, DEFAULT_TOLERANCE, measureChecks, type CheckSpec } from './checks.ts';
import { ideasAtPlay, influenceOf, type InfluenceSource } from './influence.ts';
import { toDisplay } from './format.ts';

export interface EngineOptions {
  /** Throw when a rule reads something it did not declare (default true). */
  dev?: boolean;
  /** What to do when an accounting check fails: record it (default) or throw. */
  onCheckFailure?: 'record' | 'throw';
  /** Accounting tolerance (default 1e-9). */
  tolerance?: number;
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
  /** Testing only: called after each step's postings and before its checks, so kernel tests
   *  can break a posting on purpose and see the checks catch it. */
  testHooks?: { afterPost?: (ledger: Ledger, step: number) => void };
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
  /** Signed positions at a past month ([instrument * NP + player], asset +). */
  positionsAt(month: number): Float64Array;
  /** The history so far as a RunResult (for calibration measures). */
  runResult(): RunResult;
  /** A fork is a kernel engine too. */
  fork(opts?: { disableTerms?: Id[]; params?: Record<Id, number> }): KernelEngine;
  /** Largest residual of each accounting check over the current history. */
  maxResiduals(): { id: Id; residual: number }[];
  /** Timing and solver statistics since creation. */
  stats(): { steps: number; microsPerStep: number; newtonFallbacks: number; maxIterations: number };
}

interface Snapshot {
  machine: MachineState;
  feedPrev: Uint8Array;
}

class KEngine implements KernelEngine {
  readonly model: KModel;
  readonly baselineData: Baseline;
  readonly options: Readonly<EngineOptions>;
  readonly warnings: string[];
  private readonly M: Machine;
  private readonly tol: number;
  private readonly every: number;
  private readonly checkSpec: CheckSpec;
  private readonly baseInd: Float64Array;
  private readonly ictx: IndicatorCtx;
  private readonly baseCtx: IndicatorCtx;
  private readonly src: InfluenceSource;
  private readonly shock: ShockApi;
  private readonly checkBuf = new Float64Array(4);
  private script: ScenarioEvent[] = [];
  private snaps = new Map<number, Snapshot>();
  private hVars: Float64Array[] = [];
  private hTerms: Float64Array[] = [];
  private hDesired: Float64Array[] = [];
  private hRegimes: (string | null)[][] = [];
  private hInd: Float64Array[] = [];
  private hPos: Float64Array[] = [];
  private hChecks: Float64Array[] = [];
  private feedLog: { t: number; message: string; indicator: Id; concept?: Id }[] = [];
  private feedPrev: Uint8Array;
  private failures: { t: number; id: Id; residual: number }[] = [];
  private stepCount = 0;
  private stepMillis = 0;
  private maxIters = 0;

  constructor(model: KModel, opts: EngineOptions) {
    this.model = model;
    this.options = opts;
    const m = model;
    this.tol = opts.tolerance ?? DEFAULT_TOLERANCE;
    this.every = Math.max(1, Math.round(opts.snapshotEvery ?? 12));
    const base = opts.baseline ?? solveBaseline(m, { params: opts.params, dev: opts.dev });
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
    M.baseVars = base.vars;
    M.baseTerms = base.terms;
    for (const key of opts.disableTerms ?? []) {
      const j = m.termKeyIndex.get(key);
      if (j === undefined) throw new Error(`fork: unknown term '${key}' (use 'ruleId.termId' or 'varId.termId')`);
      M.termDisabled[j] = 1;
    }
    this.checkSpec = {
      financial: new Uint8Array(m.instruments.map((i) => (i.kind === 'financial' ? 1 : 0))),
      exemptFlows: new Uint8Array(m.flows.map((_, f) => (m.clegs.some((l) => l.flow === f && l.oneSided) ? 1 : 0))),
    };
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
      base: (id) => base.vars[vIdx(id)],
      stock: (ins, pl) => signed(M.ledger.pos, ins, pl),
      baseStock: (ins, pl) => signed(base.positions, ins, pl),
    };
    this.baseCtx = {
      v: (id) => base.vars[vIdx(id)],
      base: (id) => base.vars[vIdx(id)],
      stock: (ins, pl) => signed(base.positions, ins, pl),
      baseStock: (ins, pl) => signed(base.positions, ins, pl),
    };
    this.baseInd = new Float64Array(m.indicators.map((ind) => ind.compute(this.baseCtx)));
    m.indicators.forEach((ind, i) => {
      if (ind.display === 'deviation-pct' && Math.abs(this.baseInd[i]) < 1e-12) this.warnings.push(`indicator '${ind.id}' shows % deviation but its baseline is 0; it falls back to the difference × 100`);
    });
    const self = this;
    this.src = {
      m,
      get cur() {
        return M.cur;
      },
      baseVars: base.vars,
      get termVal() {
        return M.termVal;
      },
      baseTerms: base.terms,
      get desired() {
        return M.desired;
      },
      baseDesired: base.desired,
      get regimes() {
        return M.regimes;
      },
      get pEff() {
        return M.pEff;
      },
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
    return this.M.t;
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
    M.fillRing(M.cur);
    M.termVal.set(b.terms);
    M.desired.set(b.desired);
    b.regimes.forEach((r, j) => (M.regimes[j] = r));
    this.script = [];
    this.snaps = new Map();
    this.hVars = [];
    this.hTerms = [];
    this.hDesired = [];
    this.hRegimes = [];
    this.hInd = [];
    this.hPos = [];
    this.hChecks = [];
    this.feedLog = [];
    this.failures = [];
    this.checkBuf.fill(0);
    this.feedPrev.fill(0);
    this.record();
    this.updateFeed(false);
    this.snaps.set(0, this.snap());
  }

  private snap(): Snapshot {
    return { machine: this.M.snapshot(), feedPrev: new Uint8Array(this.feedPrev) };
  }

  private levelNow(i: number): number {
    return this.model.indicators[i].compute(this.ictx);
  }

  private record(): void {
    const { M, model: m } = this;
    this.hVars.push(new Float64Array(M.cur));
    this.hTerms.push(new Float64Array(M.termVal));
    this.hDesired.push(new Float64Array(M.desired));
    this.hRegimes.push([...M.regimes]);
    const ind = new Float64Array(m.indicators.length);
    for (let i = 0; i < ind.length; i++) ind[i] = m.indicators[i].compute(this.ictx);
    this.hInd.push(ind);
    this.hPos.push(new Float64Array(M.ledger.pos));
    this.hChecks.push(new Float64Array(this.checkBuf));
  }

  private updateFeed(log: boolean): void {
    const m = this.model;
    const t = this.M.t;
    const ind = this.hInd[t];
    m.feed.forEach((f, j) => {
      const i = m.indicatorIndex.get(f.indicator)!;
      const v = toDisplay(m.indicators[i].display, ind[i], this.baseInd[i]);
      const on = (f.above !== undefined && v > f.above) || (f.below !== undefined && v < f.below) ? 1 : 0;
      if (log && on && !this.feedPrev[j]) this.feedLog.push({ t, message: f.message, indicator: f.indicator, concept: f.concept });
      this.feedPrev[j] = on;
    });
  }

  /** Advance one step (evaluate, post, check), then arrive at the new month. */
  private stepOnce(): void {
    const { M, model: m } = this;
    const t0 = performance.now();
    M.evaluate();
    M.post();
    this.options.testHooks?.afterPost?.(M.ledger, M.t + 1);
    const r = measureChecks(M.ledger, this.checkSpec, this.checkBuf);
    M.t++;
    M.pushRing();
    this.stepMillis += performance.now() - t0;
    this.stepCount++;
    if (M.lastIterations > this.maxIters) this.maxIters = M.lastIterations;
    let failed: string | null = null;
    for (let k = 0; k < 4; k++)
      if (!(r[k] <= this.tol)) {
        this.failures.push({ t: M.t, id: CHECKS[k].id, residual: r[k] });
        failed ??= `${CHECKS[k].id} residual ${r[k]} > ${this.tol}`;
      }
    this.record();
    this.updateFeed(true);
    if (M.t % this.every === 0) this.snaps.set(M.t, this.snap());
    if (failed && this.options.onCheckFailure === 'throw') throw new Error(`accounting check failed at month ${M.t} in model '${m.def.id}': ${failed}`);
    this.applyEventsAt(M.t);
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

  private clamp(l: CLever, v: number): number {
    if (!Number.isFinite(v)) throw new Error(`lever '${l.def.id}': value must be a finite number`);
    if (l.def.min !== undefined && v < l.def.min) return l.def.min;
    if (l.def.max !== undefined && v > l.def.max) return l.def.max;
    return v;
  }

  private applyEvent(e: ScenarioEvent): void {
    const j = this.leverIx(e.lever);
    const l = this.model.clevers[j];
    if (e.fire) {
      if (l.def.kind !== 'oneoff') throw new Error(`event fires '${e.lever}', which is a setting`);
      l.def.fire!(this.shock, e.value);
    } else {
      if (l.def.kind === 'oneoff') throw new Error(`event sets '${e.lever}', which is a one-off lever (fire it instead)`);
      this.M.leverVal[j] = e.value;
      this.M.applyLevers();
    }
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
    const e: ScenarioEvent = { t: this.M.t, lever: id, value: this.clamp(l, value) };
    this.insertEvent(e);
    this.applyEvent(e);
  }

  fire(id: Id, size?: number): void {
    const l = this.model.clevers[this.leverIx(id)];
    if (l.def.kind !== 'oneoff') throw new Error(`lever '${id}' is a setting; use setLever('${id}', value)`);
    const e: ScenarioEvent = { t: this.M.t, lever: id, value: this.clamp(l, size ?? l.def.default), fire: true };
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
    if (target === this.M.t) return;
    if (target > this.M.t) {
      this.step(target - this.M.t);
      return;
    }
    let best = 0;
    for (const t of this.snaps.keys()) if (t <= target && t > best) best = t;
    const s = this.snaps.get(best)!;
    this.M.restore(s.machine);
    this.feedPrev.set(s.feedPrev);
    const keep = best + 1;
    this.hVars.length = keep;
    this.hTerms.length = keep;
    this.hDesired.length = keep;
    this.hRegimes.length = keep;
    this.hInd.length = keep;
    this.hPos.length = keep;
    this.hChecks.length = keep;
    this.M.termVal.set(this.hTerms[best]);
    this.M.desired.set(this.hDesired[best]);
    this.hRegimes[best].forEach((r, j) => (this.M.regimes[j] = r));
    this.checkBuf.set(this.hChecks[best]);
    this.feedLog = this.feedLog.filter((f) => f.t <= best);
    this.failures = this.failures.filter((f) => f.t <= best);
    for (const t of [...this.snaps.keys()]) if (t > best) this.snaps.delete(t);
    this.applyEventsAt(best);
    this.step(target - best);
  }

  fork(opts: { disableTerms?: Id[]; params?: Record<Id, number> } = {}): KernelEngine {
    const o = this.options;
    const f = new KEngine(this.model, {
      ...o,
      baseline: this.baselineData,
      disableTerms: [...(o.disableTerms ?? []), ...(opts.disableTerms ?? [])],
      forkParams: { ...(o.forkParams ?? {}), ...(opts.params ?? {}) },
    });
    f.script = this.script.map((e) => ({ ...e }));
    f.applyEventsAt(0);
    f.step(this.M.t);
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
    if (!h) throw new Error(`no history at month ${month} (now at ${this.M.t})`);
    return h[this.vIndex(varId)];
  }

  positionsAt(month: number): Float64Array {
    const h = this.hPos[month];
    if (!h) throw new Error(`no history at month ${month} (now at ${this.M.t})`);
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
    return toDisplay(this.model.indicators[i].display, this.hInd[this.M.t][i], this.baseInd[i]);
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
    const months = this.M.t;
    return {
      months,
      series: (id) => this.series(id).map((p) => p.v),
      value: (varId, month) => this.valueAt(varId, month),
    };
  }

  /* ---------------------------------------------------------- flows, sheets */

  legs(): LegSnapshot[] {
    const m = this.model;
    return m.clegs.map((l) => ({
      flow: m.flows[l.flow].id,
      from: m.players[l.from].id,
      to: m.players[l.to].id,
      kind: m.flows[l.flow].kind,
      value: this.M.cur[l.amount],
      baseline: this.baselineData.vars[l.amount],
    }));
  }

  pipes(level: 'player' | 'group'): Pipe[] {
    const m = this.model;
    const node = (pid: Id) => (level === 'player' ? pid : m.players[m.playerIndex.get(pid)!].group || pid);
    const map = new Map<string, Pipe>();
    for (const leg of this.legs()) {
      const from = node(leg.from),
        to = node(leg.to);
      const key = `${from}\u0000${to}\u0000${leg.kind}`;
      let p = map.get(key);
      if (!p) {
        p = { from, to, kind: leg.kind, value: 0, baseline: 0, legs: [] };
        map.set(key, p);
      }
      p.value += leg.value;
      p.baseline += leg.baseline;
      p.legs.push(leg);
    }
    return [...map.values()];
  }

  balanceSheet(player: Id): BalanceSheet {
    const m = this.model;
    const p = m.playerIndex.get(player);
    if (p === undefined) throw new Error(`unknown player '${player}'`);
    const pos = this.M.ledger.pos,
      b = this.baselineData.positions;
    const out: BalanceSheet = { player, assets: [], liabilities: [], netWorth: 0, netWorthBaseline: 0 };
    m.instruments.forEach((ins, i) => {
      const j = i * m.NP + p;
      const r = m.role[j];
      if (!r) return;
      out.netWorth += pos[j];
      out.netWorthBaseline += b[j];
      if (r === ROLE_ISSUER) out.liabilities.push({ instrument: ins.id, label: ins.label, value: -pos[j], baseline: -b[j] });
      else out.assets.push({ instrument: ins.id, label: ins.label, value: pos[j], baseline: b[j] });
    });
    return out;
  }

  /* -------------------------------------------------------- explanations */

  influences(id: Id): Influence {
    return influenceOf(this.src, id);
  }

  ideasAtPlay(scope?: Id): { concept: Id; weight: number; via: Id[] }[] {
    return ideasAtPlay(this.src, scope);
  }

  checks(): CheckReport {
    const r = this.checkBuf;
    let max = 0;
    for (let k = 0; k < 4; k++) max = Number.isNaN(r[k]) ? Infinity : Math.max(max, r[k]);
    return {
      t: this.M.t,
      maxResidual: max,
      items: CHECKS.map((c, k) => ({ id: c.id, label: c.label, residual: r[k] })),
      tolerance: this.tol,
      failures: this.failures.map((f) => ({ ...f })),
    };
  }

  maxResiduals(): { id: Id; residual: number }[] {
    return CHECKS.map((c, k) => {
      let m = 0;
      for (const h of this.hChecks) m = Number.isNaN(h[k]) ? Infinity : Math.max(m, h[k]);
      return { id: c.id, residual: m };
    });
  }

  feed(): { t: number; message: string; indicator: Id; concept?: Id }[] {
    return this.feedLog.map((f) => ({ ...f }));
  }

  baselineReport(): BaselineReport {
    return baselineReport(this.model, this.baselineData);
  }

  stats() {
    return {
      steps: this.stepCount,
      microsPerStep: this.stepCount ? (this.stepMillis * 1000) / this.stepCount : 0,
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
