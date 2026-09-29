/**
 * The step machine: the mutable state of one model run and the code that advances it by
 * one step (architecture §4.2, parts 2 and 3). The engine (engine.ts) wraps it with levers,
 * history, checks and time travel; the steady-state solver (steady.ts) drives it directly.
 *
 * State: parameters, lever settings, the current value of every variable, a ring buffer of
 * past values (for lag()), and the ledger's positions.
 */
import { isLocked, type CRule, type KModel } from './compile.ts';
import type { Ctx, Id } from './types.ts';
import { Ledger, postLeg } from './ledger.ts';
import type { Payments } from './payments.ts';
import { solveLinear } from './numerics.ts';

export interface MachineOptions {
  /** Throw when a rule reads something it did not declare (default true). */
  dev?: boolean;
  /** Gauss–Seidel tolerance for simultaneous blocks (relative, default 1e-12). */
  tol?: number;
  /** Gauss–Seidel iteration guard before falling back to Newton (default 200). */
  maxIter?: number;
  /** Number of past kernel steps (sub-steps) lag() can reach (default: two years of them, at least 25). */
  lagWindow?: number;
}

export interface MachineState {
  t: number;
  cur: Float64Array;
  ring: Float64Array;
  head: number;
  leverVal: Float64Array;
  pEff: Float64Array;
  pos: Float64Array;
}

/** Kernel steps per recorded step (ModelDef.substeps, a whole number, default 1). */
export function substepsOf(def: { substeps?: number }): number {
  const n = def.substeps ?? 1;
  if (!(Number.isInteger(n) && n >= 1)) throw new Error(`model substeps must be a whole number of at least 1, got ${n}`);
  return n;
}

export class Machine {
  readonly m: KModel;
  /** Kernel steps a month (ModelDef.substeps). */
  readonly N: number;
  /** Years per kernel step: the model's dt ÷ N. */
  readonly dt: number;
  readonly NV: number;
  readonly K: number;
  readonly dev: boolean;
  tol: number;
  maxIter: number;
  /** Parameter values before levers (the variant's parameters). */
  readonly pBase: Float64Array;
  /** Parameter values after levers: what rules read. */
  readonly pEff: Float64Array;
  readonly leverVal: Float64Array;
  /** Values of exogenous variables before levers. */
  readonly exoBase: Float64Array;
  readonly cur: Float64Array;
  readonly ring: Float64Array;
  head = 0;
  /** Term values, desired values and regimes of the last evaluation. */
  readonly termVal: Float64Array;
  readonly desired: Float64Array;
  readonly regimes: (string | null)[];
  /** Baseline values: base() in rules, and the value a disabled term is held at. */
  baseVars: Float64Array;
  baseTerms: Float64Array;
  /** Baseline term values in each lock configuration (indexed by lock mask, lockMask()), when the
   *  model has stabilisers: `baseTerms` then follows the padlocks at every evaluation. */
  baseTermsByMask: Float64Array[] | null = null;
  /** The padlocks in the last evaluate() (a lock mask: bit j set when stabiliser j was locked).
   *  termVal and desired were computed under it, so influences compare them with its baseline. */
  evalLocks = 0;
  readonly termDisabled: Uint8Array;
  readonly ledger: Ledger;
  readonly pay: Payments;
  t = 0;
  /** Solver statistics for the last step. */
  lastIterations = 0;
  newtonFallbacks = 0;

  private readonly ctxs: Ctx[];
  private readonly termRecs: Record<Id, number>[];

  constructor(m: KModel, opts: MachineOptions = {}) {
    this.m = m;
    // The machine steps at dt / substeps: every rule sees that step in c.dt (ModelDef.substeps).
    this.N = substepsOf(m.def);
    this.dt = m.def.dt / this.N;
    this.NV = m.NV;
    this.dev = opts.dev ?? true;
    this.tol = opts.tol ?? 1e-12;
    this.maxIter = opts.maxIter ?? 200;
    this.K = Math.max(opts.lagWindow ?? 0, Math.ceil(2 / this.dt) + 1, 25);
    this.pBase = new Float64Array(m.params.map((p) => p.value));
    this.pEff = new Float64Array(this.pBase);
    this.leverVal = new Float64Array(m.levers.map((l) => l.default));
    this.exoBase = new Float64Array(m.NV);
    this.cur = new Float64Array(m.NV);
    this.ring = new Float64Array(this.K * m.NV);
    this.termVal = new Float64Array(m.cterms.length);
    this.baseTerms = new Float64Array(m.cterms.length);
    this.baseVars = new Float64Array(m.NV);
    this.desired = new Float64Array(m.crules.length);
    this.regimes = m.crules.map(() => null);
    this.termDisabled = new Uint8Array(m.cterms.length);
    this.ledger = new Ledger(m.NI, m.NP, m.flows.length);
    this.pay = { ...m.pay, settlement: m.settlement };
    this.ctxs = m.crules.map((cr) => this.makeCtx(cr));
    this.termRecs = m.crules.map(() => ({}));
  }

  /* ------------------------------------------------------------ levers */

  /** Initialise lever settings: replace-bound levers start at their target's value. */
  initLevers(): void {
    this.m.clevers.forEach((l, j) => {
      if (l.mode === 'replace') this.leverVal[j] = (l.bindParam >= 0 ? this.pBase[l.bindParam] : this.exoBase[l.bindVar]) / l.scale;
      else this.leverVal[j] = l.def.default;
    });
    this.applyLevers();
  }

  /** Recompute effective parameters and exogenous variables from the lever settings. */
  applyLevers(): void {
    this.pEff.set(this.pBase);
    const { m, cur } = this;
    for (let v = 0; v < m.NV; v++) if (m.exogenous[v]) cur[v] = this.exoBase[v];
    m.clevers.forEach((l, j) => {
      if (!l.mode) return;
      const x = l.scale * this.leverVal[j];
      if (l.bindParam >= 0) this.pEff[l.bindParam] = l.mode === 'replace' ? x : this.pBase[l.bindParam] + x;
      else if (l.bindVar >= 0) cur[l.bindVar] = l.mode === 'replace' ? x : this.exoBase[l.bindVar] + x;
    });
  }

  /* -------------------------------------------------------------- lags */

  lagValue(v: number, k: number): number {
    if (!(k >= 1 && k <= this.K && Number.isInteger(k))) throw new Error(`lag(${this.m.vars[v].id}, ${k}): k must be a whole number from 1 to ${this.K}`);
    const slot = (this.head - (k - 1) + this.K * 2) % this.K;
    return this.ring[slot * this.NV + v];
  }

  /** Values from the previous step (what lag(id, 1) returns). */
  lag1(v: number): number {
    return this.ring[this.head * this.NV + v];
  }

  setLag1(v: number, value: number): void {
    this.ring[this.head * this.NV + v] = value;
  }

  /** After a step: the current values become lag 1. */
  pushRing(): void {
    this.head = (this.head + 1) % this.K;
    this.ring.set(this.cur, this.head * this.NV);
  }

  /**
   * Set the lag history before the first step. `now` holds every variable's month-0 value, which
   * the first step reads as lag 1. `history` optionally gives earlier months for some variables,
   * by variable index: [month −1, month −2, …]. With one step a month they are read as lag 2,
   * lag 3, …; with N sub-steps a month (ModelDef.substeps) a lag of j sub-steps reaches back j/N
   * of a month, and reads the straight line between the two months either side of it, so each
   * month fills N slots. Slots older than the history given keep its oldest value. Without a
   * history every slot holds `now`, which is exactly right for a steady state (it has no past to
   * speak of) and what a start from data extends (docs/design/start-from-today.md §2.5).
   */
  initHistory(now: Float64Array, history?: ReadonlyMap<number, ArrayLike<number>>): void {
    const { K, NV, N, ring } = this;
    this.head = 0;
    for (let s = 0; s < K; s++) ring.set(now, s * NV);
    if (!history) return;
    for (const [v, past] of history) {
      const id = this.m.vars[v]?.id;
      if (id === undefined) throw new Error(`initHistory: unknown variable index ${v}`);
      if (past.length * N > K - 1) throw new Error(`initHistory: '${id}' has ${past.length} months of history, but lag() reaches back only ${Math.floor((K - 1) / N)} months before month 0`);
      for (let k = 0; k < past.length; k++) if (!Number.isFinite(past[k])) throw new Error(`initHistory: '${id}' at month ${-(k + 1)} is not a finite number`);
      if (!past.length) continue;
      // month −q's value (q = 0 is `now`), held at the oldest month given
      const month = (q: number) => (q === 0 ? now[v] : past[Math.min(q, past.length) - 1]);
      // slot of sub-step −j is head − j (mod K); the head (month 0) holds `now`
      for (let j = 1; j < K; j++) {
        const q = Math.floor(j / N),
          w = (j % N) / N;
        ring[((K - j) % K) * NV + v] = w === 0 ? month(q) : (1 - w) * month(q) + w * month(q + 1);
      }
    }
  }

  /* ------------------------------------------------------------ context */

  private undeclared(cr: CRule, fn: string, id: Id, field: string): never {
    throw new Error(`rule '${cr.def.id}' reads ${fn}('${id}') without declaring it in '${field}'`);
  }

  private makeCtx(cr: CRule): Ctx {
    const M = this;
    const m = this.m;
    const dev = this.dev;
    const global = (index: Map<Id, number>, id: Id, what: string) => {
      const k = index.get(id);
      if (k === undefined) throw new Error(`rule '${cr.def.id}' reads unknown ${what} '${id}'`);
      return k;
    };
    // Plain lookup tables for the hot reads: faster than Map.get on the step's inner loop, and the
    // stock table is keyed by instrument then player, so a read builds no string.
    const table = (map: Map<Id, number>): Record<Id, number> => Object.assign(Object.create(null), Object.fromEntries(map));
    const inputs = table(cr.inputMap),
      lags = table(cr.lagMap),
      params = table(cr.paramMap);
    const stocks: Record<Id, Record<Id, number>> = Object.create(null);
    for (const [key, code] of cr.stockMap) {
      const [ins, pl] = key.split('\u0000');
      (stocks[ins] ??= Object.create(null))[pl] = code;
    }
    return {
      v(id: Id) {
        const k = inputs[id];
        if (k !== undefined) return M.cur[k];
        if (dev) M.undeclared(cr, 'v', id, 'inputs');
        return M.cur[global(m.varIndex, id, 'variable')];
      },
      lag(id: Id, kk = 1) {
        const k = lags[id];
        if (k !== undefined) return kk === 1 ? M.ring[M.head * M.NV + k] : M.lagValue(k, kk);
        if (dev) M.undeclared(cr, 'lag', id, 'lagInputs');
        return M.lagValue(global(m.varIndex, id, 'variable'), kk);
      },
      p(id: Id) {
        const k = params[id];
        if (k !== undefined) return M.pEff[k];
        if (dev) M.undeclared(cr, 'p', id, 'params');
        return M.pEff[global(m.paramIndex, id, 'parameter')];
      },
      stock(ins: Id, pl: Id) {
        const code = stocks[ins]?.[pl];
        if (code !== undefined) {
          const s = M.ledger.pos[code >> 1];
          return code & 1 ? -s : s;
        }
        if (dev) M.undeclared(cr, 'stock', `${ins}', '${pl}`, 'stocks');
        const j = global(m.instrumentIndex, ins, 'instrument') * m.NP + global(m.playerIndex, pl, 'player');
        return m.role[j] === 2 ? -M.ledger.pos[j] : M.ledger.pos[j];
      },
      lever(id: Id) {
        const k = cr.leverMap.get(id);
        if (k !== undefined) return M.leverVal[k];
        if (dev) M.undeclared(cr, 'lever', id, 'levers');
        return M.leverVal[global(m.leverIndex, id, 'lever')];
      },
      locked(id: Id) {
        const k = cr.lockMap.get(id);
        if (k !== undefined) return isLocked(M.leverVal[k]);
        if (dev) M.undeclared(cr, 'locked', id, 'locks');
        const j = m.stabilisers.findIndex((s) => s.id === id);
        if (j < 0) throw new Error(`rule '${cr.def.id}' reads the padlock of unknown stabiliser '${id}'`);
        return isLocked(M.leverVal[m.cstabilisers[j].lock]);
      },
      base(id: Id) {
        return M.baseVars[global(m.varIndex, id, 'variable')];
      },
      get t() {
        return M.t * M.dt;
      },
      dt: M.dt,
    };
  }

  /** A read-only context for one rule (used by influence and regime reporting). */
  ctxOf(rule: number): Ctx {
    return this.ctxs[rule];
  }

  /* --------------------------------------------------------- evaluation */

  /** Evaluate one rule: terms (recorded), desired value, then gradual adjustment. */
  evalRule(cr: CRule): number {
    const ctx = this.ctxs[cr.idx];
    let d: number;
    if (cr.termCount > 0) {
      const terms = this.m.cterms;
      const end = cr.termStart + cr.termCount;
      let s = 0;
      for (let j = cr.termStart; j < end; j++) {
        const v = this.termDisabled[j] ? this.baseTerms[j] : terms[j].def.compute(ctx);
        this.termVal[j] = v;
        s += v;
      }
      if (cr.def.combine) {
        const rec = this.termRecs[cr.idx];
        for (let j = cr.termStart; j < end; j++) rec[terms[j].def.id] = this.termVal[j];
        d = cr.def.combine(rec, ctx);
      } else d = s;
    } else d = cr.def.compute!(ctx);
    this.desired[cr.idx] = d;
    if (!cr.hasAdjust) return d;
    const prev = this.ring[this.head * this.NV + cr.target];
    const speed = cr.adjustParam >= 0 ? this.pEff[cr.adjustParam] : cr.adjustNum;
    const k = cr.adjustExp ? 1 - Math.exp(-speed * this.dt) : speed * this.dt;
    return prev + k * (d - prev);
  }

  /** The padlocks at the current lever values, as a mask: bit j set when stabiliser j is locked. */
  lockMask(): number {
    let mask = 0;
    this.m.cstabilisers.forEach((cs, j) => {
      if (isLocked(this.leverVal[cs.lock])) mask |= 1 << j;
    });
    return mask;
  }

  /** Evaluate the whole schedule for this step. */
  evaluate(): void {
    const { m, cur } = this;
    this.evalLocks = this.lockMask();
    if (this.baseTermsByMask) this.baseTerms = this.baseTermsByMask[this.evalLocks];
    let iters = 1;
    for (const b of m.blocks) {
      if (!b.simultaneous) {
        const cr = m.crules[b.rules[0]];
        cur[cr.target] = this.evalRule(cr);
      } else iters = Math.max(iters, this.solveBlock(b.rules));
    }
    this.lastIterations = iters;
    for (const cr of m.crules) if (cr.def.regime) this.regimes[cr.idx] = this.regimeOf(cr);
  }

  regimeOf(cr: CRule): string | null {
    const rec = this.termRecs[cr.idx];
    for (let j = cr.termStart; j < cr.termStart + cr.termCount; j++) rec[this.m.cterms[j].def.id] = this.termVal[j];
    return cr.def.regime!(this.ctxs[cr.idx], this.cur[cr.target], rec);
  }

  /** Gauss–Seidel to tolerance; damped Newton if it fails. Returns the iterations used. */
  private solveBlock(rules: number[]): number {
    const { m, cur } = this;
    const n = rules.length;
    const x0 = new Float64Array(n);
    for (let i = 0; i < n; i++) x0[i] = cur[m.crules[rules[i]].target];
    for (let it = 1; it <= this.maxIter; it++) {
      let diff = 0;
      for (let i = 0; i < n; i++) {
        const cr = m.crules[rules[i]];
        const v = this.evalRule(cr);
        const d = Math.abs(v - cur[cr.target]) / Math.max(1, Math.abs(v));
        diff = Number.isNaN(d) ? Infinity : d > diff ? d : diff;
        cur[cr.target] = v;
      }
      if (diff <= this.tol) return it;
      if (!Number.isFinite(diff)) break;
    }
    this.newtonFallbacks++;
    for (let i = 0; i < n; i++) cur[m.crules[rules[i]].target] = x0[i];
    return this.maxIter + this.newtonBlock(rules);
  }

  /** Damped Newton with a finite-difference Jacobian on x = G(x) for one block. */
  private newtonBlock(rules: number[]): number {
    const { m, cur } = this;
    const n = rules.length;
    const targets = rules.map((j) => m.crules[j].target);
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = cur[targets[i]];
    const g = new Float64Array(n);
    const F = (xx: Float64Array, out: Float64Array) => {
      for (let i = 0; i < n; i++) cur[targets[i]] = xx[i];
      for (let i = 0; i < n; i++) g[i] = this.evalRule(m.crules[rules[i]]);
      let nn = 0;
      for (let i = 0; i < n; i++) {
        out[i] = g[i] - xx[i];
        const a = Math.abs(out[i]) / Math.max(1, Math.abs(xx[i]));
        nn = Number.isNaN(a) ? Infinity : Math.max(nn, a);
      }
      return nn;
    };
    const f = new Float64Array(n);
    const fk = new Float64Array(n);
    const xn = new Float64Array(n);
    let norm = F(x, f);
    let iter = 0;
    for (; iter < 100 && norm > this.tol; iter++) {
      const J = new Float64Array(n * n);
      for (let k = 0; k < n; k++) {
        const h = 1e-7 * Math.max(1, Math.abs(x[k]));
        const keep = x[k];
        x[k] = keep + h;
        F(x, fk);
        x[k] = keep;
        for (let i = 0; i < n; i++) J[i * n + k] = (fk[i] - f[i]) / h;
      }
      const rhs = new Float64Array(n);
      for (let i = 0; i < n; i++) rhs[i] = -f[i];
      const delta = solveLinear(J, rhs, n);
      if (!delta) break;
      let lambda = 1;
      let accepted = false;
      while (lambda > 1e-6) {
        for (let i = 0; i < n; i++) xn[i] = x[i] + lambda * delta[i];
        const nn = F(xn, fk);
        if (nn < norm) {
          x.set(xn);
          f.set(fk);
          norm = nn;
          accepted = true;
          break;
        }
        lambda /= 2;
      }
      if (!accepted) break;
    }
    if (!(norm <= Math.max(this.tol, 1e-10))) {
      const ids = rules.map((j) => m.crules[j].def.id).join(', ');
      throw new Error(`simultaneous block [${ids}] did not converge at step ${this.t + 1} (Gauss–Seidel and Newton both failed; residual ${norm})`);
    }
    // record terms and desired values at the solution (one Jacobi pass, then write)
    for (let i = 0; i < n; i++) cur[targets[i]] = x[i];
    for (let i = 0; i < n; i++) g[i] = this.evalRule(m.crules[rules[i]]);
    for (let i = 0; i < n; i++) cur[targets[i]] = g[i];
    return iter + 1;
  }

  /** Post every leg (amount × dt) through the payment system and posting rules. */
  post(): void {
    const { ledger, cur, dt, pay } = this;
    ledger.begin();
    for (const leg of this.m.clegs) {
      const a = cur[leg.amount] * dt;
      if (a !== 0) postLeg(ledger, pay, leg, a);
    }
  }

  /** One full step without history or checks: evaluate, post, advance time and lags. */
  step(): void {
    this.evaluate();
    this.post();
    this.t++;
    this.pushRing();
  }

  /* ---------------------------------------------------------- snapshots */

  snapshot(): MachineState {
    return {
      t: this.t,
      cur: new Float64Array(this.cur),
      ring: new Float64Array(this.ring),
      head: this.head,
      leverVal: new Float64Array(this.leverVal),
      pEff: new Float64Array(this.pEff),
      pos: new Float64Array(this.ledger.pos),
    };
  }

  restore(s: MachineState): void {
    this.t = s.t;
    this.cur.set(s.cur);
    this.ring.set(s.ring);
    this.head = s.head;
    this.leverVal.set(s.leverVal);
    this.pEff.set(s.pEff);
    this.ledger.pos.set(s.pos);
  }
}
