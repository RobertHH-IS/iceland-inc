/**
 * Posting rules: every posting type, with the direction conventions of LegDef, checked for
 * position changes, event kinds, income and other changes, and the four accounting checks.
 */
import { describe, expect, test } from 'bun:test';
import { ACCRUAL, CASH, Ledger, postLeg, REVALUATION, WRITEOFF } from '../../src/core/ledger.ts';
import type { Payments } from '../../src/core/payments.ts';
import { KIND_CODE, POSTING_CODE, SETTLEMENT_CODE, type CLeg } from '../../src/core/compile.ts';
import { measureChecks, type CheckSpec } from '../../src/core/checks.ts';

// players
const HH = 0,
  F = 1,
  PF = 2, // a non-bank lender (a pension fund) that pays with deposits
  B = 3,
  CB = 4,
  G = 5;
const NP = 6;
// instruments
const DEP = 0,
  RES = 1,
  TSY = 2,
  LOANS = 3, // issued by HH and F, held by B and PF
  BONDS = 4, // issued by G, held by B, CB and PF
  HOMES = 5; // real, held by HH and F
const NI = 6;

function setup() {
  const L = new Ledger(NI, NP, 1);
  const P: Payments = {
    bank: B,
    centralBank: CB,
    treasury: G,
    deposits: DEP,
    reserves: RES,
    treasuryAccount: TSY,
    settlement: new Uint8Array([0, 0, 0, SETTLEMENT_CODE.bank, SETTLEMENT_CODE['central-bank'], SETTLEMENT_CODE.treasury]),
  };
  const spec: CheckSpec = { financial: new Uint8Array([1, 1, 1, 1, 1, 0]), exemptFlows: new Uint8Array([0]) };
  L.begin();
  return { L, P, spec };
}
const at = (L: Ledger, ins: number, p: number) => L.pos[ins * NP + p];
const kindOf = (L: Ledger, ins: number, p: number, k: number) => L.byKind[(ins * NP + p) * 4 + k];
const money = (L: Ledger) => at(L, DEP, HH) + at(L, DEP, F) + at(L, DEP, PF);
function leg(posting: keyof typeof POSTING_CODE, from: number, to: number, instrument = -1, oneSided = false): CLeg {
  const kind = posting === 'accrue' ? KIND_CODE.accrual : posting === 'revalue' ? KIND_CODE.revaluation : posting === 'writeoff' ? KIND_CODE.writeoff : KIND_CODE.cash;
  return { flow: 0, from, to, amount: 0, posting: POSTING_CODE[posting], instrument, kind, oneSided };
}
function checksPass(L: Ledger, spec: CheckSpec) {
  const r = measureChecks(L, spec, new Float64Array(4));
  for (const x of r) expect(x).toBeLessThan(1e-12);
}

describe('postLeg: every posting type', () => {
  test('transfer: cash for income or spending; saving falls for the payer', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('transfer', F, HH), 5);
    expect(at(L, DEP, HH)).toBe(5);
    expect(at(L, DEP, F)).toBe(-5);
    expect(L.income[HH]).toBe(5);
    expect(L.income[F]).toBe(-5);
    checksPass(L, spec);
  });

  test('purchase: the buyer swaps money for a real asset; only the seller earns income', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('purchase', HH, F, HOMES), 30);
    expect(at(L, HOMES, HH)).toBe(30);
    expect(at(L, DEP, HH)).toBe(-30);
    expect(L.netWorth(HH)).toBe(0);
    expect(L.income[HH]).toBe(0);
    expect(L.income[F]).toBe(30);
    expect(L.netWorth(F)).toBe(30);
    checksPass(L, spec);
  });

  test('purchase inside one sector (firms buying machines from firms): no cash moves, the asset grows', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('purchase', F, F, HOMES), 4);
    expect(at(L, HOMES, F)).toBe(4);
    expect(at(L, DEP, F)).toBe(0);
    expect(L.income[F]).toBe(4);
    checksPass(L, spec);
  });

  test('issue by the bank: the loan creates a new deposit (money is created)', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('issue', B, HH, LOANS), 20);
    expect(at(L, LOANS, B)).toBe(20); // the bank's asset
    expect(at(L, LOANS, HH)).toBe(-20); // the borrower's liability
    expect(at(L, DEP, HH)).toBe(20); // new deposit
    expect(at(L, DEP, B)).toBe(-20); // the bank owes it
    expect(money(L)).toBe(20);
    expect(L.netWorth(HH)).toBe(0);
    expect(L.netWorth(B)).toBe(0);
    checksPass(L, spec);
  });

  test('issue by a non-bank lender: existing deposits move, no money is created', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('issue', PF, HH, LOANS), 20);
    expect(at(L, LOANS, PF)).toBe(20);
    expect(at(L, LOANS, HH)).toBe(-20);
    expect(at(L, DEP, PF)).toBe(-20);
    expect(at(L, DEP, HH)).toBe(20);
    expect(money(L)).toBe(0);
    expect(at(L, DEP, B)).toBe(0);
    checksPass(L, spec);
  });

  test('issue of government bonds to the bank: paid in reserves, no deposit yet', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('issue', B, G, BONDS), 8);
    expect(at(L, BONDS, B)).toBe(8);
    expect(at(L, BONDS, G)).toBe(-8);
    expect(at(L, RES, B)).toBe(-8);
    expect(at(L, TSY, G)).toBe(8);
    expect(money(L)).toBe(0);
    checksPass(L, spec);
  });

  test('redeem to the bank: the repayment destroys the deposit used', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('redeem', HH, B, LOANS), 6);
    expect(at(L, LOANS, HH)).toBe(6); // liability falls (from −x toward 0)
    expect(at(L, LOANS, B)).toBe(-6); // asset falls
    expect(at(L, DEP, HH)).toBe(-6);
    expect(at(L, DEP, B)).toBe(6);
    expect(money(L)).toBe(-6);
    checksPass(L, spec);
  });

  test('redeem to a non-bank lender: deposits move to the lender', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('redeem', HH, PF, LOANS), 6);
    expect(at(L, DEP, PF)).toBe(6);
    expect(money(L)).toBe(0);
    checksPass(L, spec);
  });

  test('trade: an existing bond changes hands for cash', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('trade', PF, B, BONDS), 3); // pension fund buys from the bank
    expect(at(L, BONDS, PF)).toBe(3);
    expect(at(L, BONDS, B)).toBe(-3);
    expect(at(L, DEP, PF)).toBe(-3);
    expect(money(L)).toBe(-3); // paying the bank with deposits destroys them
    expect(L.netWorth(PF)).toBe(0);
    expect(L.netWorth(B)).toBe(0);
    checksPass(L, spec);
  });

  test('trade with the central bank (open-market purchase): paid in new reserves', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('trade', CB, B, BONDS), 2);
    expect(at(L, BONDS, CB)).toBe(2);
    expect(at(L, RES, B)).toBe(2);
    expect(at(L, RES, CB)).toBe(-2);
    checksPass(L, spec);
  });

  test('accrue: interest is added to the claim and no deposits move', () => {
    const { L, P, spec } = setup();
    const dep = L.pos.slice(DEP * NP, (DEP + 1) * NP);
    postLeg(L, P, leg('accrue', HH, PF, LOANS), 1.5);
    expect(at(L, LOANS, HH)).toBe(-1.5);
    expect(at(L, LOANS, PF)).toBe(1.5);
    expect(L.pos.slice(DEP * NP, (DEP + 1) * NP)).toEqual(dep);
    expect(at(L, RES, B)).toBe(0);
    expect(kindOf(L, LOANS, HH, ACCRUAL)).toBe(-1.5);
    expect(kindOf(L, LOANS, HH, CASH)).toBe(0);
    expect(L.income[HH]).toBe(-1.5);
    expect(L.income[PF]).toBe(1.5);
    checksPass(L, spec);
  });

  test('revalue (financial): value moves between holder and issuer, not income', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('revalue', G, PF, BONDS), 2); // the issuer loses, the holder gains
    expect(at(L, BONDS, PF)).toBe(2);
    expect(at(L, BONDS, G)).toBe(-2);
    expect(L.other[PF]).toBe(2);
    expect(L.income[PF]).toBe(0);
    expect(kindOf(L, BONDS, PF, REVALUATION)).toBe(2);
    checksPass(L, spec);
  });

  test('revalue (real asset): one-sided; the holder gains, the row need not sum to zero', () => {
    const { L, P } = setup();
    const spec: CheckSpec = { financial: new Uint8Array([1, 1, 1, 1, 1, 0]), exemptFlows: new Uint8Array([1]) };
    postLeg(L, P, leg('revalue', HH, HH, HOMES, true), 7);
    expect(at(L, HOMES, HH)).toBe(7);
    expect(L.other[HH]).toBe(7);
    checksPass(L, spec);
  });

  test('writeoff (financial): the lender loses, the borrower owes less', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('writeoff', B, F, LOANS), 4);
    expect(at(L, LOANS, B)).toBe(-4);
    expect(at(L, LOANS, F)).toBe(4);
    expect(L.other[B]).toBe(-4);
    expect(L.other[F]).toBe(4);
    expect(kindOf(L, LOANS, B, WRITEOFF)).toBe(-4);
    expect(money(L)).toBe(0);
    checksPass(L, spec);
  });

  test('writeoff (real asset, depreciation): one-sided loss, no money moves', () => {
    const { L, P } = setup();
    const spec: CheckSpec = { financial: new Uint8Array([1, 1, 1, 1, 1, 0]), exemptFlows: new Uint8Array([1]) };
    postLeg(L, P, leg('writeoff', F, F, HOMES, true), 3);
    expect(at(L, HOMES, F)).toBe(-3);
    expect(L.other[F]).toBe(-3);
    expect(at(L, DEP, F)).toBe(0);
    checksPass(L, spec);
  });

  test('a negative issue is a repayment', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('issue', B, HH, LOANS), -5);
    expect(at(L, LOANS, B)).toBe(-5);
    expect(money(L)).toBe(-5);
    checksPass(L, spec);
  });
});

describe('the checks catch deliberately broken postings', () => {
  test('a position written directly (not through move) breaks reconciliation, balance and net worth', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('issue', B, HH, LOANS), 20);
    L.pos[DEP * NP + HH] += 1; // bypasses the ledger
    const r = measureChecks(L, spec, new Float64Array(4));
    expect(r[1]).toBeCloseTo(1, 12); // instrument balance
    expect(r[2]).toBeCloseTo(1, 12); // net worth
    expect(r[3]).toBeCloseTo(1, 12); // stock reconciliation
  });

  test('a one-sided move is booked but unbalanced', () => {
    const { L, spec } = setup();
    L.move(LOANS, B, 3, CASH); // lender gains a claim nobody owes
    const r = measureChecks(L, spec, new Float64Array(4));
    expect(r[1]).toBeCloseTo(3, 12);
    expect(r[2]).toBeCloseTo(3, 12);
    expect(r[3]).toBe(0);
  });

  test('a transfer that forgets the saving bookkeeping breaks the net-worth check', () => {
    const { L, spec } = setup();
    L.move(DEP, F, -2, CASH); // cash moves between depositors ...
    L.move(DEP, HH, 2, CASH); // ... but no income or claim is booked
    const r = measureChecks(L, spec, new Float64Array(4));
    expect(r[2]).toBeCloseTo(2, 12);
    expect(r[1]).toBe(0);
  });

  test('a one-sided transaction row breaks flow balance', () => {
    const { L, spec } = setup();
    L.row(0, HH, 5);
    const r = measureChecks(L, spec, new Float64Array(4));
    expect(r[0]).toBe(5);
  });

  test('NaN counts as a failure', () => {
    const { L, P, spec } = setup();
    postLeg(L, P, leg('transfer', F, HH), NaN);
    const r = measureChecks(L, spec, new Float64Array(4));
    expect(r.some((x) => !(x <= 1e-9))).toBe(true);
  });
});
