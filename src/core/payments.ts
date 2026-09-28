/**
 * The payment system (architecture §4.3). Every cash leg settles here, once, according to
 * how each side pays (its `settlement`):
 *
 *   deposits → deposits      deposits move between holders; the bank's total is unchanged
 *   deposits → bank          the payer's deposit and the bank's liability shrink: money is destroyed
 *   bank → deposits          the bank credits a deposit: money is created
 *   anything ↔ treasury/CB   reserves and the treasury account move at the central bank, and
 *                            the bank passes the payment on to (or from) its depositors
 *
 * Think of funds sitting on one of two "sides": the bank side (deposits, and the bank's own
 * books) or the central-bank side (reserves and the treasury account). A payment starts on
 * the payer's side and must end on the payee's; crossing between sides moves reserves.
 * Money creation is therefore never computed by a formula: it emerges from who pays whom.
 */
import { KIND_CODE, SETTLEMENT_CODE } from './compile.ts';
import type { Ledger } from './ledger.ts';

export interface Payments {
  bank: number;
  centralBank: number;
  treasury: number;
  deposits: number;
  reserves: number;
  treasuryAccount: number;
  /** Settlement code per player (see SETTLEMENT_CODE). */
  settlement: Uint8Array;
}

const CASH = KIND_CODE.cash;
const DEPOSITS = SETTLEMENT_CODE.deposits;
const BANK = SETTLEMENT_CODE.bank;
const TREASURY = SETTLEMENT_CODE.treasury;
const BANK_SIDE = 0;
const CB_SIDE = 1;

/** Move `a` of means of payment from `from` to `to` (a < 0 pays the other way). */
export function settle(L: Ledger, P: Payments, from: number, to: number, a: number): void {
  if (from === to || a === 0) return;
  const sf = P.settlement[from];
  const st = P.settlement[to];
  // 1. the payer gives up means of payment
  let side: number;
  if (sf === DEPOSITS) {
    L.move(P.deposits, from, -a, CASH); // the payer's deposit falls ...
    L.move(P.deposits, P.bank, a, CASH); // ... and so does the bank's deposit liability
    side = BANK_SIDE;
  } else if (sf === TREASURY) {
    L.move(P.treasuryAccount, from, -a, CASH);
    L.move(P.treasuryAccount, P.centralBank, a, CASH);
    side = CB_SIDE;
  } else side = sf === BANK ? BANK_SIDE : CB_SIDE; // the bank and the central bank pay with their own liabilities
  // 2. cross between the bank side and the central-bank side with reserves
  const need = st === DEPOSITS || st === BANK ? BANK_SIDE : CB_SIDE;
  if (side !== need) {
    const s = side === BANK_SIDE ? -a : a; // the bank loses reserves when paying out to the state
    L.move(P.reserves, P.bank, s, CASH);
    L.move(P.reserves, P.centralBank, -s, CASH);
  }
  // 3. the payee receives means of payment (a bank or central-bank payee is already paid:
  //    its liabilities fell or its reserve claim rose)
  if (st === DEPOSITS) {
    L.move(P.deposits, to, a, CASH);
    L.move(P.deposits, P.bank, -a, CASH);
  } else if (st === TREASURY) {
    L.move(P.treasuryAccount, to, a, CASH);
    L.move(P.treasuryAccount, P.centralBank, -a, CASH);
  }
}
