/**
 * The four accounting checks of architecture §4.4, run after every step.
 *
 *   flow-balance           every flow's row in the transaction matrix sums to zero
 *   instrument-balance     for every financial instrument, assets held = liabilities owed
 *   net-worth              each player's change in net worth = saving + revaluations + write-offs
 *   stock-reconciliation   each position's change = its cash + accrual + revaluation + write-off postings
 *
 * Residuals are absolute (units of the model: % of baseline GDP). NaN counts as infinite.
 *
 * Separately, `measureSigns` is a plausibility diagnostic, not an accounting identity: it finds
 * positions with the wrong sign for their role (an overdrawn asset, a liability that became a
 * claim). The accounting can balance exactly with such positions, so they are reported beside
 * the checks and never count as failures (decision 0005).
 */
import type { Id } from './types.ts';
import { KIND_COUNT, type Ledger } from './ledger.ts';
import { ROLE_HOLDER, ROLE_ISSUER } from './compile.ts';

export const CHECKS: { id: Id; label: string }[] = [
  { id: 'flow-balance', label: 'Every flow sums to zero across players' },
  { id: 'instrument-balance', label: 'Every financial instrument: assets held = liabilities owed' },
  { id: 'net-worth', label: 'Change in net worth = saving + revaluations + write-offs' },
  { id: 'stock-reconciliation', label: 'Every position change is explained by its postings' },
];
export const DEFAULT_TOLERANCE = 1e-9;

export interface CheckSpec {
  /** 1 for financial instruments (they must balance), 0 for real assets. */
  financial: Uint8Array;
  /** 1 for flows whose rows need not sum to zero (one-sided real-asset revaluations). */
  exemptFlows: Uint8Array;
}

const worse = (m: number, x: number) => (Number.isNaN(x) ? Infinity : x > m ? x : m);

/** Measure the four residuals for the step just posted, into `out` (length 4). */
export function measureChecks(L: Ledger, spec: CheckSpec, out: Float64Array): Float64Array {
  const { NI, NP, NF, pos, open, byKind, rows, income, other } = L;
  let flow = 0;
  for (let f = 0; f < NF; f++) {
    if (spec.exemptFlows[f]) continue;
    let s = 0;
    for (let p = 0; p < NP; p++) s += rows[f * NP + p];
    flow = worse(flow, Math.abs(s));
  }
  let instr = 0;
  for (let i = 0; i < NI; i++) {
    if (!spec.financial[i]) continue;
    let s = 0;
    for (let p = 0; p < NP; p++) s += pos[i * NP + p];
    instr = worse(instr, Math.abs(s));
  }
  let nw = 0;
  let recon = 0;
  for (let p = 0; p < NP; p++) {
    let d = 0;
    for (let i = 0; i < NI; i++) {
      const j = i * NP + p;
      const change = pos[j] - open[j];
      d += change;
      let posted = 0;
      for (let k = 0; k < KIND_COUNT; k++) posted += byKind[j * KIND_COUNT + k];
      recon = worse(recon, Math.abs(change - posted));
    }
    nw = worse(nw, Math.abs(d - income[p] - other[p]));
  }
  out[0] = flow;
  out[1] = instr;
  out[2] = nw;
  out[3] = recon;
  return out;
}

/** Instrument balance of a set of positions alone (used to validate initial stocks). */
export function instrumentImbalance(pos: Float64Array, NI: number, NP: number, financial: Uint8Array): { ins: number; residual: number }[] {
  const out: { ins: number; residual: number }[] = [];
  for (let i = 0; i < NI; i++) {
    if (!financial[i]) continue;
    let s = 0;
    for (let p = 0; p < NP; p++) s += pos[i * NP + p];
    out.push({ ins: i, residual: Math.abs(s) });
  }
  return out;
}

/* ------------------------------------------------------------ position signs */

/** Default tolerance of the sign diagnostic: far above rounding, far below any real position. */
export const DEFAULT_SIGN_TOLERANCE = 1e-6;

export interface SignSpec {
  /** role[ins * NP + player]: 0 none, 1 holder, 2 issuer (KModel.role). */
  role: Uint8Array;
  /** 1 for positions declared free to take either sign (InstrumentDef.mayGoNegative). */
  exempt: Uint8Array;
}

/**
 * How far a signed position is on the wrong side of zero for its role: a holder's asset below
 * zero, or an issuer's liability below zero (a signed position above zero). Real assets have
 * holders only, so they are covered by the holder rule. 0 when the sign is right.
 */
export function signBreach(role: number, pos: number): number {
  if (role === ROLE_HOLDER) return pos < 0 ? -pos : 0;
  if (role === ROLE_ISSUER) return pos > 0 ? pos : 0;
  return 0;
}

/**
 * The position-sign diagnostic over signed positions ([ins * NP + player], asset +). Pushes the
 * index of every non-exempt position whose breach exceeds `tol` into `out` (if given) and
 * returns the largest such breach (0 when there is none). A NaN position is left to the
 * accounting checks, which already count NaN as a failure.
 */
export function measureSigns(pos: Float64Array, spec: SignSpec, tol: number, out?: number[]): number {
  const { role, exempt } = spec;
  let worst = 0;
  for (let j = 0; j < pos.length; j++) {
    if (!role[j] || exempt[j]) continue;
    const b = signBreach(role[j], pos[j]);
    if (b > tol) {
      out?.push(j);
      if (b > worst) worst = b;
    }
  }
  return worst;
}
