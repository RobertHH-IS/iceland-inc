/**
 * The double-entry ledger.
 *
 * Positions are held by [instrument][player] in one Float64Array, signed: an asset is
 * positive, a liability negative, so a player's net worth is the sum of its positions and a
 * financial instrument's positions sum to zero. Every change goes through `move`, which also
 * books the change under its event kind (cash, accrual, revaluation, write-off) so the stock
 * reconciliation check can prove that nothing was written directly.
 *
 * `postLeg` implements each posting type exactly once. Cash legs settle through the payment
 * system (payments.ts), which is where money is created and destroyed.
 */
import { KIND_CODE, POSTING_CODE, type CLeg } from './compile.ts';
import { settle, type Payments } from './payments.ts';

export const CASH = KIND_CODE.cash;
export const ACCRUAL = KIND_CODE.accrual;
export const REVALUATION = KIND_CODE.revaluation;
export const WRITEOFF = KIND_CODE.writeoff;
export const KIND_COUNT = 4;

export class Ledger {
  /** Current positions, [instrument * NP + player], asset + / liability −. */
  readonly pos: Float64Array;
  /** Positions at the start of the current step. */
  readonly open: Float64Array;
  /** Change of each position this step, by event kind: [(ins * NP + player) * 4 + kind]. */
  readonly byKind: Float64Array;
  /** Income minus spending on current and capital account this step (saving), per player. */
  readonly income: Float64Array;
  /** Revaluations and write-offs this step (other changes in net worth), per player. */
  readonly other: Float64Array;
  /** Transaction-matrix rows this step: [flow * NP + player], + receives, − pays. */
  readonly rows: Float64Array;

  constructor(
    readonly NI: number,
    readonly NP: number,
    readonly NF: number,
  ) {
    this.pos = new Float64Array(NI * NP);
    this.open = new Float64Array(NI * NP);
    this.byKind = new Float64Array(NI * NP * KIND_COUNT);
    this.income = new Float64Array(NP);
    this.other = new Float64Array(NP);
    this.rows = new Float64Array(NF * NP);
  }

  /** Start a step: remember the opening positions and clear the step's bookkeeping. */
  begin(): void {
    this.open.set(this.pos);
    this.byKind.fill(0);
    this.income.fill(0);
    this.other.fill(0);
    this.rows.fill(0);
  }

  /** The only way a position changes. */
  move(ins: number, player: number, amount: number, kind: number): void {
    const j = ins * this.NP + player;
    this.pos[j] += amount;
    this.byKind[j * KIND_COUNT + kind] += amount;
  }

  row(flow: number, player: number, amount: number): void {
    this.rows[flow * this.NP + player] += amount;
  }

  netWorth(player: number): number {
    let s = 0;
    for (let i = 0; i < this.NI; i++) s += this.pos[i * this.NP + player];
    return s;
  }
}

/**
 * Post one leg of `amount` (already multiplied by dt; may be negative, which reverses it).
 * Direction conventions are those documented on LegDef in types.ts.
 */
export function postLeg(L: Ledger, P: Payments, leg: CLeg, a: number): void {
  const { from, to, instrument: ins, flow } = leg;
  switch (leg.posting) {
    case POSTING_CODE.transfer:
      // cash for income or spending: saving falls for the payer and rises for the payee
      settle(L, P, from, to, a);
      L.income[from] -= a;
      L.income[to] += a;
      break;
    case POSTING_CODE.purchase:
      // cash buys a real asset at cost: the buyer swaps money for the asset (no change in
      // net worth); the seller earns the sale as income. A negative amount un-produces the
      // asset (see LegDef): exact accounting, but not a resale
      settle(L, P, from, to, a);
      L.move(ins, from, a, CASH);
      L.income[to] += a;
      break;
    case POSTING_CODE.issue:
      // from = lender gains the claim and pays; to = borrower owes the claim and receives
      L.move(ins, from, a, CASH);
      L.move(ins, to, -a, CASH);
      settle(L, P, from, to, a);
      break;
    case POSTING_CODE.redeem:
      // from = borrower pays and owes less; to = lender is paid and holds less
      L.move(ins, from, a, CASH);
      L.move(ins, to, -a, CASH);
      settle(L, P, from, to, a);
      break;
    case POSTING_CODE.trade:
      // from = buyer pays and gains the asset; to = seller is paid and gives it up
      L.move(ins, from, a, CASH);
      L.move(ins, to, -a, CASH);
      settle(L, P, from, to, a);
      break;
    case POSTING_CODE.accrue:
      // income capitalised into the claim: no cash moves; the debtor owes more
      L.move(ins, from, -a, ACCRUAL);
      L.move(ins, to, a, ACCRUAL);
      L.income[from] -= a;
      L.income[to] += a;
      break;
    case POSTING_CODE.revalue:
      if (leg.oneSided) {
        L.move(ins, to, a, REVALUATION);
        L.other[to] += a;
        L.row(flow, to, a);
        return;
      }
      L.move(ins, from, -a, REVALUATION);
      L.move(ins, to, a, REVALUATION);
      L.other[from] -= a;
      L.other[to] += a;
      break;
    case POSTING_CODE.writeoff:
      if (leg.oneSided) {
        L.move(ins, from, -a, WRITEOFF);
        L.other[from] -= a;
        L.row(flow, from, -a);
        return;
      }
      L.move(ins, from, -a, WRITEOFF);
      L.move(ins, to, a, WRITEOFF);
      L.other[from] -= a;
      L.other[to] += a;
      break;
    default:
      throw new Error(`unknown posting code ${leg.posting}`);
  }
  L.row(flow, from, -a);
  L.row(flow, to, a);
}
