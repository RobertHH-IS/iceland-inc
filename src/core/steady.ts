/**
 * The baseline (architecture §4.5): a steady state that is SOLVED, not assumed.
 *
 *   1. start from the spec's initial stocks and variable guesses;
 *   2. apply the module's closed-form `solve` if there is one;
 *   3. polish with damped Newton (Levenberg–Marquardt when the Jacobian is singular) on
 *        state after one step − state before = 0   for every position and every state variable
 *        target residuals = 0                      for the spec's targets
 *      solving for the free parameters, the positions and the state variables. The Jacobian
 *      is a finite-difference one: each column is one extra model step.
 *
 * A financial instrument's positions always sum to zero: one position per instrument (its
 * single issuer, else its single holder, else its first issuer) is derived from the others.
 *
 * The result is published by `baselineReport` (all variables, stocks and legs).
 */
import type { Id, IndicatorCtx, LegSnapshot } from './types.ts';
import { ROLE_HOLDER, ROLE_ISSUER, type KModel } from './compile.ts';
import { Machine } from './machine.ts';
import { lmStep, maxAbs, solveLinear, sumSq } from './numerics.ts';

export interface BaselineOptions {
  /** Parameter overrides applied before solving (a model variant). */
  params?: Record<Id, number>;
  /** Convergence tolerance on the largest residual (default 1e-11). */
  tol?: number;
  maxIter?: number;
  dev?: boolean;
}

export interface Baseline {
  /** Parameter values, including the solved free parameters. */
  pBase: Float64Array;
  exoBase: Float64Array;
  positions: Float64Array;
  vars: Float64Array;
  terms: Float64Array;
  desired: Float64Array;
  regimes: (string | null)[];
  solved: Record<Id, number>;
  method: 'newton' | 'closed-form + newton' | 'none';
  iterations: number;
  /** Largest residual of the fixed-point and target equations at the solution. */
  residual: number;
  unknowns: number;
  targets: { id: Id; describe: string; residual: number }[];
  warnings: string[];
}

const key = (ins: Id, pl: Id) => ins + '\u0000' + pl;

/** Turn [instrument, player, value] triples (Ctx sign convention) into signed positions,
 *  filling a missing single issuer (or single holder) so each financial instrument balances. */
export function buildPositions(m: KModel, stocks: [Id, Id, number][]): Float64Array {
  const { NP, NI } = m;
  const pos = new Float64Array(NI * NP);
  const given = new Set<string>();
  const map = new Map<string, number>();
  for (const [ins, pl, v] of stocks) map.set(key(ins, pl), v);
  for (const [k, v] of map) {
    const [ins, pl] = k.split('\u0000');
    const i = m.instrumentIndex.get(ins),
      p = m.playerIndex.get(pl);
    if (i === undefined || p === undefined) throw new Error(`initial stock ['${ins}', '${pl}'] refers to an unknown instrument or player`);
    const j = i * NP + p;
    const r = m.role[j];
    if (r !== ROLE_HOLDER && r !== ROLE_ISSUER) throw new Error(`initial stock ['${ins}', '${pl}']: '${pl}' neither holds nor issues '${ins}'`);
    pos[j] = r === ROLE_ISSUER ? -v : v;
    given.add(k);
  }
  m.instruments.forEach((ins, i) => {
    if (ins.kind !== 'financial') return;
    let fill = -1;
    if (ins.issuers.length === 1 && !given.has(key(ins.id, ins.issuers[0]))) fill = m.playerIndex.get(ins.issuers[0])!;
    else if (ins.holders.length === 1 && !given.has(key(ins.id, ins.holders[0]))) fill = m.playerIndex.get(ins.holders[0])!;
    if (fill < 0) return;
    let s = 0;
    for (let p = 0; p < NP; p++) if (p !== fill) s += pos[i * NP + p];
    pos[i * NP + fill] = -s;
  });
  m.instruments.forEach((ins, i) => {
    if (ins.kind !== 'financial') return;
    let s = 0;
    for (let p = 0; p < NP; p++) s += pos[i * NP + p];
    if (Math.abs(s) > 1e-9) throw new Error(`initial stocks of '${ins.id}' do not balance: holders' assets − issuers' liabilities = ${s}`);
  });
  return pos;
}

/** The position of each financial instrument that is derived from the others. */
function derivedPlayer(m: KModel, i: number): number {
  const ins = m.instruments[i];
  if (ins.issuers.length === 1) return m.playerIndex.get(ins.issuers[0])!;
  if (ins.holders.length === 1) return m.playerIndex.get(ins.holders[0])!;
  return m.playerIndex.get(ins.issuers[0])!;
}

export function solveBaseline(m: KModel, opts: BaselineOptions = {}): Baseline {
  const { NP, NI, NV } = m;
  const spec = m.def.steadyState;
  const tol = opts.tol ?? 1e-11;
  const maxIter = opts.maxIter ?? 60;
  const warnings: string[] = [];
  const M = new Machine(m, { dev: opts.dev ?? true, tol: 1e-13, maxIter: 500 });

  // parameters (with variant overrides)
  for (const [id, v] of Object.entries(opts.params ?? {})) {
    const k = m.paramIndex.get(id);
    if (k === undefined) throw new Error(`parameter override '${id}' is not a parameter of model '${m.def.id}'`);
    M.pBase[k] = v;
  }
  // guesses
  const guess = new Float64Array(NV);
  m.vars.forEach((v, j) => (guess[j] = v.initial ?? spec.initialVars?.[v.id] ?? 0));
  let stocks: [Id, Id, number][] = [...spec.initialStocks];
  let method: Baseline['method'] = 'newton';
  if (spec.solve) {
    const pRec: Record<Id, number> = {};
    m.params.forEach((p, j) => (pRec[p.id] = M.pBase[j]));
    const r = spec.solve(pRec);
    for (const [id, v] of Object.entries(r.params ?? {})) {
      const k = m.paramIndex.get(id);
      if (k === undefined) throw new Error(`steadyState.solve returned unknown parameter '${id}'`);
      M.pBase[k] = v;
    }
    for (const [id, v] of Object.entries(r.vars ?? {})) {
      const k = m.varIndex.get(id);
      if (k === undefined) throw new Error(`steadyState.solve returned unknown variable '${id}'`);
      guess[k] = v;
    }
    const merged = new Map<string, [Id, Id, number]>();
    for (const s of stocks) merged.set(key(s[0], s[1]), s);
    for (const s of r.stocks ?? []) merged.set(key(s[0], s[1]), s);
    stocks = [...merged.values()];
    method = 'closed-form + newton';
  }
  const pos0 = buildPositions(m, stocks);
  m.vars.forEach((_, j) => {
    if (m.exogenous[j]) M.exoBase[j] = guess[j];
  });

  // unknowns: free parameters, independent positions, state variables
  const free = spec.free.map((id) => m.paramIndex.get(id)!);
  const posIdx: number[] = [];
  const derived: { j: number; others: number[] }[] = [];
  for (let i = 0; i < NI; i++) {
    const parts: number[] = [];
    for (let p = 0; p < NP; p++) if (m.role[i * NP + p]) parts.push(i * NP + p);
    if (m.instruments[i].kind === 'financial') {
      const d = i * NP + derivedPlayer(m, i);
      const others = parts.filter((j) => j !== d);
      posIdx.push(...others);
      derived.push({ j: d, others });
    } else posIdx.push(...parts);
  }
  const state: number[] = [];
  for (let v = 0; v < NV; v++) if (m.lagged[v] && !m.exogenous[v]) state.push(v);
  const nF = free.length,
    nP = posIdx.length,
    nS = state.length;
  const n = nF + nP + nS;
  const nT = spec.targets.length;
  const nEq = nP + nS + nT;

  const z = new Float64Array(n);
  free.forEach((k, i) => (z[i] = M.pBase[k]));
  posIdx.forEach((j, i) => (z[nF + i] = pos0[j]));
  state.forEach((v, i) => (z[nF + nP + i] = guess[v]));

  const pos = M.ledger.pos;
  const after = new Float64Array(NV);
  const ictx: IndicatorCtx = {
    v: (id) => M.cur[m.varIndex.get(id)!],
    base: (id) => M.cur[m.varIndex.get(id)!],
    stock: (ins, pl) => {
      const j = m.instrumentIndex.get(ins)! * NP + m.playerIndex.get(pl)!;
      return m.role[j] === ROLE_ISSUER ? -pos[j] : pos[j];
    },
    baseStock: (ins, pl) => ictx.stock(ins, pl),
  };

  /** Load z into the machine (the state before the step). */
  const load = (zz: Float64Array) => {
    for (let i = 0; i < nF; i++) M.pBase[free[i]] = zz[i];
    M.cur.set(guess);
    M.initLevers();
    pos.fill(0);
    for (let i = 0; i < nP; i++) pos[posIdx[i]] = zz[nF + i];
    for (const d of derived) {
      let s = 0;
      for (const j of d.others) s += pos[j];
      pos[d.j] = -s;
    }
    for (let i = 0; i < nS; i++) M.cur[state[i]] = zz[nF + nP + i];
    M.fillRing(M.cur);
    M.baseVars = new Float64Array(M.cur);
    M.t = 0;
  };
  /** One step from z; residuals into out. Returns false if the step failed. */
  const evalF = (zz: Float64Array, out: Float64Array): boolean => {
    load(zz);
    try {
      M.evaluate();
      M.post();
    } catch {
      out.fill(Infinity);
      return false;
    }
    for (let i = 0; i < nP; i++) out[i] = (pos[posIdx[i]] - zz[nF + i]) / M.dt;
    for (let i = 0; i < nS; i++) out[nP + i] = M.cur[state[i]] - zz[nF + nP + i];
    for (let i = 0; i < nT; i++) {
      let r: number;
      try {
        r = spec.targets[i].residual(ictx);
      } catch {
        r = Infinity;
      }
      out[nP + nS + i] = r;
    }
    after.set(M.cur);
    return true;
  };

  const F = new Float64Array(nEq);
  const Fn = new Float64Array(nEq);
  const Fk = new Float64Array(nEq);
  if (!evalF(z, F)) throw new Error(`model '${m.def.id}': the first step from the initial guess failed; check initialStocks and initialVars`);
  guess.set(after);
  let iterations = 0;
  let norm = maxAbs(F);
  if (n > 0) {
    let mu = 1e-3;
    for (; iterations < maxIter && norm > tol; iterations++) {
      const J = new Float64Array(nEq * n);
      for (let k = 0; k < n; k++) {
        const h = 1e-6 * Math.max(1, Math.abs(z[k]));
        const keep = z[k];
        z[k] = keep + h;
        evalF(z, Fk);
        z[k] = keep;
        for (let r = 0; r < nEq; r++) J[r * n + k] = (Fk[r] - F[r]) / h;
      }
      const ss0 = sumSq(F);
      const zn = new Float64Array(n);
      let accepted = false;
      const tryStep = (delta: Float64Array | null, lambda: number) => {
        if (!delta) return false;
        for (let i = 0; i < n; i++) zn[i] = z[i] + lambda * delta[i];
        if (!evalF(zn, Fn) || !(sumSq(Fn) < ss0)) return false;
        z.set(zn);
        F.set(Fn);
        guess.set(after);
        return true;
      };
      if (nEq === n) {
        const rhs = new Float64Array(n);
        for (let i = 0; i < n; i++) rhs[i] = -F[i];
        let delta = solveLinear(J, rhs, n);
        // A nearly singular Jacobian (a stock the equations do not pin down) can give a huge
        // step along the free direction; leave those to Levenberg–Marquardt instead.
        if (delta && maxAbs(delta) > 10 * (1 + maxAbs(z))) delta = null;
        for (let lambda = 1; delta && lambda > 1e-3 && !accepted; lambda /= 2) accepted = tryStep(delta, lambda);
      }
      for (let tries = 0; !accepted && tries < 12; tries++) {
        accepted = tryStep(lmStep(J, F, nEq, n, mu), 1);
        mu = accepted ? Math.max(mu / 10, 1e-12) : mu * 10;
      }
      if (!accepted) break;
      norm = maxAbs(F);
    }
  }
  // final state at the solution
  evalF(z, F);
  norm = maxAbs(F);
  if (!(norm <= 1e-9)) warnings.push(`baseline solver stopped with residual ${norm.toExponential(2)} after ${iterations} iterations`);
  const positions = new Float64Array(NI * NP);
  load(z);
  positions.set(pos);
  M.evaluate();
  const vars = new Float64Array(M.cur);
  const solved: Record<Id, number> = {};
  free.forEach((k, i) => (solved[m.params[k].id] = z[i]));
  const targets = spec.targets.map((t, i) => ({ id: t.id, describe: t.describe, residual: F[nP + nS + i] }));
  return {
    pBase: new Float64Array(M.pBase),
    exoBase: new Float64Array(M.exoBase),
    positions,
    vars,
    terms: new Float64Array(M.termVal),
    desired: new Float64Array(M.desired),
    regimes: [...M.regimes],
    solved,
    method: n === 0 ? 'none' : method,
    iterations,
    residual: norm,
    unknowns: n,
    targets,
    warnings,
  };
}

export interface BaselineReport {
  modelId: Id;
  method: string;
  iterations: number;
  residual: number;
  unknowns: number;
  solved: Record<Id, number>;
  targets: { id: Id; describe: string; residual: number }[];
  params: Record<Id, number>;
  vars: Record<Id, number>;
  stocks: { instrument: Id; player: Id; value: number }[];
  legs: LegSnapshot[];
  warnings: string[];
}

/** Publish the baseline: every parameter, variable, stock and leg. */
export function baselineReport(m: KModel, b: Baseline): BaselineReport {
  const params: Record<Id, number> = {};
  m.params.forEach((p, j) => (params[p.id] = b.pBase[j]));
  const vars: Record<Id, number> = {};
  m.vars.forEach((v, j) => (vars[v.id] = b.vars[j]));
  const stocks: BaselineReport['stocks'] = [];
  m.instruments.forEach((ins, i) =>
    m.players.forEach((pl, p) => {
      const j = i * m.NP + p;
      if (m.role[j]) stocks.push({ instrument: ins.id, player: pl.id, value: m.role[j] === ROLE_ISSUER ? -b.positions[j] : b.positions[j] });
    }),
  );
  const legs = m.clegs.map((l) => ({
    flow: m.flows[l.flow].id,
    from: m.players[l.from].id,
    to: m.players[l.to].id,
    kind: m.flows[l.flow].kind,
    value: b.vars[l.amount],
    baseline: b.vars[l.amount],
  }));
  return {
    modelId: m.def.id,
    method: b.method,
    iterations: b.iterations,
    residual: b.residual,
    unknowns: b.unknowns,
    solved: b.solved,
    targets: b.targets,
    params,
    vars,
    stocks,
    legs,
    warnings: b.warnings,
  };
}
