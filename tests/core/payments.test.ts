/**
 * The payment system: every pair of settlement types, checked for who gains and loses means
 * of payment, whether money (non-bank deposits) is created or destroyed, and that every
 * financial instrument stays balanced.
 */
import { describe, expect, test } from 'bun:test';
import { Ledger } from '../../src/core/ledger.ts';
import { settle, type Payments } from '../../src/core/payments.ts';
import { SETTLEMENT_CODE } from '../../src/core/compile.ts';

// players: two depositors, the bank, the central bank, the treasury
const HH = 0,
  F = 1,
  B = 2,
  CB = 3,
  G = 4;
const NAMES = ['HH', 'F', 'B', 'CB', 'G'];
const NP = 5;
// instruments: deposits, reserves, treasury account
const DEP = 0,
  RES = 1,
  TSY = 2;

function setup() {
  const L = new Ledger(3, NP, 1);
  const P: Payments = {
    bank: B,
    centralBank: CB,
    treasury: G,
    deposits: DEP,
    reserves: RES,
    treasuryAccount: TSY,
    settlement: new Uint8Array([SETTLEMENT_CODE.deposits, SETTLEMENT_CODE.deposits, SETTLEMENT_CODE.bank, SETTLEMENT_CODE['central-bank'], SETTLEMENT_CODE.treasury]),
  };
  L.begin();
  return { L, P };
}
const pos = (L: Ledger, ins: number, p: number) => L.pos[ins * NP + p];
const money = (L: Ledger) => pos(L, DEP, HH) + pos(L, DEP, F);
const isDepositor = (p: number) => p === HH || p === F;
const bankSide = (p: number) => p === HH || p === F || p === B;

describe('settle: every pair of settlement types', () => {
  const a = 10;
  for (let from = 0; from < NP; from++)
    for (let to = 0; to < NP; to++) {
      if (from === to) continue;
      test(`${NAMES[from]} pays ${NAMES[to]}`, () => {
        const { L, P } = setup();
        settle(L, P, from, to, a);
        // net worth: the payer loses a, the payee gains a, nobody else changes
        for (let p = 0; p < NP; p++) {
          const want = p === from ? -a : p === to ? a : 0;
          expect(L.netWorth(p)).toBeCloseTo(want, 12);
        }
        // every financial instrument still balances
        for (let i = 0; i < 3; i++) {
          let s = 0;
          for (let p = 0; p < NP; p++) s += pos(L, i, p);
          expect(Math.abs(s)).toBeLessThan(1e-12);
        }
        // money is created when a non-depositor pays a depositor, destroyed the other way
        const dMoney = (isDepositor(to) ? a : 0) - (isDepositor(from) ? a : 0);
        expect(money(L)).toBeCloseTo(dMoney, 12);
        // reserves move exactly when the payment crosses between the bank and the state
        const dRes = bankSide(from) === bankSide(to) ? 0 : bankSide(from) ? -a : a;
        expect(pos(L, RES, B)).toBeCloseTo(dRes, 12);
        // only the treasury holds the treasury account
        const dTsy = (to === G ? a : 0) - (from === G ? a : 0);
        expect(pos(L, TSY, G)).toBeCloseTo(dTsy, 12);
        // every change is booked as cash
        for (let j = 0; j < 3 * NP; j++) expect(L.byKind[j * 4]).toBeCloseTo(L.pos[j], 12);
      });
    }

  test('deposits to deposits: money moves, the bank’s total liability is unchanged', () => {
    const { L, P } = setup();
    settle(L, P, HH, F, a);
    expect(pos(L, DEP, HH)).toBe(-a);
    expect(pos(L, DEP, F)).toBe(a);
    expect(pos(L, DEP, B)).toBe(0);
    expect(pos(L, RES, B)).toBe(0);
  });

  test('deposits to bank: money is destroyed (a repayment or interest to the bank)', () => {
    const { L, P } = setup();
    settle(L, P, HH, B, a);
    expect(pos(L, DEP, HH)).toBe(-a);
    expect(pos(L, DEP, B)).toBe(a); // the bank's deposit liability shrinks
  });

  test('bank to deposits: money is created (a loan or interest paid)', () => {
    const { L, P } = setup();
    settle(L, P, B, HH, a);
    expect(pos(L, DEP, HH)).toBe(a);
    expect(pos(L, DEP, B)).toBe(-a);
    expect(pos(L, RES, B)).toBe(0);
  });

  test('treasury to deposits: the bank gains reserves and credits the depositor', () => {
    const { L, P } = setup();
    settle(L, P, G, HH, a);
    expect(pos(L, TSY, G)).toBe(-a);
    expect(pos(L, RES, B)).toBe(a);
    expect(pos(L, RES, CB)).toBe(-a);
    expect(pos(L, DEP, HH)).toBe(a);
  });

  test('deposits to treasury (a tax): deposits and reserves both fall', () => {
    const { L, P } = setup();
    settle(L, P, HH, G, a);
    expect(pos(L, DEP, HH)).toBe(-a);
    expect(pos(L, RES, B)).toBe(-a);
    expect(pos(L, TSY, G)).toBe(a);
  });

  test('bank to treasury (the bank buys a bond): paid in reserves, no deposits move', () => {
    const { L, P } = setup();
    settle(L, P, B, G, a);
    expect(pos(L, RES, B)).toBe(-a);
    expect(pos(L, TSY, G)).toBe(a);
    expect(pos(L, DEP, B)).toBe(0);
  });

  test('central bank to bank and treasury: it pays with its own liabilities', () => {
    const { L, P } = setup();
    settle(L, P, CB, B, a);
    settle(L, P, CB, G, a);
    expect(pos(L, RES, B)).toBe(a);
    expect(pos(L, TSY, G)).toBe(a);
    expect(L.netWorth(CB)).toBe(-2 * a);
  });

  test('a negative amount pays the other way; paying yourself does nothing', () => {
    const { L, P } = setup();
    settle(L, P, HH, B, -a);
    expect(pos(L, DEP, HH)).toBe(a);
    const before = new Float64Array(L.pos);
    settle(L, P, HH, HH, a);
    settle(L, P, B, B, a);
    expect(L.pos).toEqual(before);
  });
});
