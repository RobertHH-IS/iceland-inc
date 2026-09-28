/**
 * The four accounting checks of architecture §4.4, run after every step.
 *
 *   flow-balance           every flow's row in the transaction matrix sums to zero
 *   instrument-balance     for every financial instrument, assets held = liabilities owed
 *   net-worth              each player's change in net worth = saving + revaluations + write-offs
 *   stock-reconciliation   each position's change = its cash + accrual + revaluation + write-off postings
 *
 * Residuals are absolute (units of the model: % of baseline GDP). NaN counts as infinite.
 */
import type { Id } from './types.ts';
import { KIND_COUNT, type Ledger } from './ledger.ts';

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
