/** Borrower cash, gross funding and loss-recognition regression tests for the optional layer. */
import { describe, expect, test } from 'bun:test';
import { createEngine, type EngineOptions, type KernelEngine } from '../../src/core/engine.ts';
import { ACCRUAL, CASH, WRITEOFF } from '../../src/core/ledger.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { withConcepts } from '../../src/models/index.ts';
import { withFinancialFragility } from '../../src/models/iceland/modules/financial-fragility.ts';
import { createGrowingIcelandEngine } from '../../src/models/iceland/growth.ts';
import { FIRMS } from '../../src/models/iceland/util.ts';

const stationary = (opts: EngineOptions = {}) => createEngine(withConcepts(withFinancialFragility(icelandModel)), opts);
const growing = (opts: EngineOptions = {}) => createGrowingIcelandEngine({ modelTransform: withFinancialFragility }, opts);
const tiny = (a: number, b: number, tolerance = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tolerance);
const state = (e: KernelEngine) => JSON.stringify({ t: e.t, vars: e.model.vars.map((v) => e.value(v.id)), stocks: [...e.positionsAt(e.t)], legs: e.legs(), events: e.events, feed: e.feed(), locks: e.stabilisers() });

describe('optional business financing and financial instability', () => {
  test('the helper is immutable/idempotent and explicit gross rollovers leave the quiet original portfolio unchanged', () => {
    const originals = [...icelandModel.modules];
    const transformed = withFinancialFragility(icelandModel);
    expect(withFinancialFragility(transformed)).toBe(transformed);
    expect(icelandModel.modules).toEqual(originals);
    expect(icelandModel.modules.find((m) => m.id === 'firms')!.flows!.some((f) => f.id === 'businessBorrowing')).toBe(true);
    const old = createEngine(withConcepts(icelandModel));
    const e = stationary();
    expect(e.warnings).toEqual(old.warnings);
    expect(e.value('businessCreditApproved')).toBeGreaterThan(1);
    tiny(e.value('businessCreditApproved'), e.value('businessPrincipalMaturity'));
    for (let t = 0; t <= 240; t++) {
      if (t) { old.step(); e.step(); }
      for (const v of old.model.vars) tiny(e.value(v.id), old.value(v.id), 1e-8);
      for (const ins of old.model.instruments) for (const player of old.model.players) tiny(e.stock(ins.id, player.id), old.stock(ins.id, player.id), 1e-8);
      tiny(e.stock('businessArrears', 'B'), 0);
      tiny(e.value('lenderConfidence'), 0);
    }
    expect(e.checks().failures).toEqual([]);
    expect(e.checks().signViolations).toEqual([]);
  });

  test('a tourism crisis posts paid and accrued interest, zero-income principal reclassification, matched losses and later cash recovery', () => {
    let e!: KernelEngine;
    let lost = 0, unpaid = 0, shifted = 0, recovered = 0, peak = 0, depositsMin = Infinity;
    let capSeen = Infinity;
    const faults: string[] = [];
    const same = (a: number, b: number, message: string) => { if (Math.abs(a - b) > 1e-9) faults.push(message); };
    e = growing({ testHooks: {
      afterPost: (L) => {
        const m = e.model, dt = m.def.dt / (m.def.substeps ?? 1);
        const bank = m.playerIndex.get('B')!, loan = m.instrumentIndex.get('businessLoans')!, arrears = m.instrumentIndex.get('businessArrears')!, dep = m.instrumentIndex.get('deposits')!;
        let loss = 0;
        for (const j of FIRMS) {
          const player = m.playerIndex.get(j)!;
          const q = (prefix: string) => e.value(`${prefix}${j}`);
          const beforeLoan = -L.open[loan * m.NP + player], beforeArrears = -L.open[arrears * m.NP + player];
          same(q('interestDue'), q('loanInterest') + q('interestUnpaid'), `interest partition ${j}`);
          same(-L.pos[loan * m.NP + player], beforeLoan + dt * (q('creditApproved') - q('principalPaid') - q('principalOverdue')), `performing recurrence ${j}`);
          same(-L.pos[arrears * m.NP + player], beforeArrears + dt * (q('principalOverdue') + q('interestUnpaid') - q('arrearsRecovery') - q('loanWriteoff')), `arrears recurrence ${j}`);
          same(L.byKind[(arrears * m.NP + player) * 4 + WRITEOFF], dt * q('loanWriteoff'), `borrower debt relief ${j}`);
          same(L.byKind[(arrears * m.NP + player) * 4 + CASH], dt * q('arrearsRecovery'), `recovery cash ${j}`);
          same(L.byKind[(loan * m.NP + player) * 4 + ACCRUAL], dt * q('principalOverdue'), `principal out ${j}`);
          same(L.byKind[(arrears * m.NP + player) * 4 + ACCRUAL], -dt * (q('principalOverdue') + q('interestUnpaid')), `principal plus interest in ${j}`);
          same(L.income[player], dt * (q('profits') - q('corporateTax') - q('dividends')), `firm recognised profit includes unpaid interest ${j}`);
          const out = q('loanInterest') + q('principalPaid') + q('arrearsRecovery') + Math.max(0, q('dividends')) + (j === 'FC' ? 0 : q('investmentPurchase'));
          if (out > q('cashForService') + 1e-9) faults.push(`unfunded cash outflow ${j}`);
          // Reconcile the cash account itself independently of book profit and arrears accruals.
          same(L.pos[dep * m.NP + player] - L.open[dep * m.NP + player], dt * (q('operatingCash') + q('creditApproved') - q('loanInterest') - q('principalPaid') - q('arrearsRecovery') - q('dividends') - (j === 'FC' ? 0 : q('investmentPurchase'))), `deposit cash recurrence ${j}`);
          const a = m.flows.findIndex((f) => f.id === 'businessPerformingReclassification');
          const b = m.flows.findIndex((f) => f.id === 'businessPrincipalArrears');
          same(L.rows[a * m.NP + player] + L.rows[b * m.NP + player], 0, `reclassification zero income ${j}`);
          loss += q('loanWriteoff') * dt;
          lost += q('loanWriteoff') * dt; unpaid += q('interestUnpaid') * dt; shifted += q('principalOverdue') * dt; recovered += q('arrearsRecovery') * dt;
          depositsMin = Math.min(depositsMin, L.pos[dep * m.NP + player]);
        }
        same(L.byKind[(arrears * m.NP + bank) * 4 + WRITEOFF], -loss, 'bank asset loss matches borrower relief once');
        same(L.income[bank], dt * (e.value('bankProfit') - e.value('bankDividends')), 'bank recognised interest includes cash and accrual, excludes recovery');
        const openingEquity = m.instruments.reduce((s, _, i) => s + L.open[i * m.NP + bank], 0);
        same(e.value('bankEquity'), openingEquity, 'bank equity includes overdue claims before write-off');
        same(L.other[bank], -loss, 'bank net-worth loss once, outside current interest income');
        same(L.byKind[(dep * m.NP + bank) * 4 + WRITEOFF], 0, 'write-off does not move cash');
        peak = Math.max(peak, L.pos[arrears * m.NP + bank]);
        capSeen = Math.min(capSeen, e.value('creditCapitalCapacity'));
      },
    } });
    e.setLever('tourism', -60);
    e.step(24);
    const oldArrears = e.stock('businessArrears', 'B');
    e.setLever('tourism', 0);
    e.step(24);
    expect(faults).toEqual([]);
    expect(shifted).toBeGreaterThan(0.01);
    expect(unpaid).toBeGreaterThan(0.01);
    expect(lost).toBeGreaterThan(0.01);
    expect(recovered).toBeGreaterThan(0.01);
    expect(peak).toBeGreaterThan(0.05);
    expect(e.stock('businessArrears', 'B')).toBeLessThan(oldArrears);
    expect(depositsMin).toBeGreaterThan(-1e-9);
    expect(capSeen).toBeGreaterThanOrEqual(0);
    expect(e.checks().failures).toEqual([]);
    expect(e.checks().signViolations).toEqual([]);
  });

  test('capital and collateral constrain actual credit and purchases; losses reduce subsequent capacity rather than invoking an unlimited owner recapitalisation', () => {
    const normal = stationary(), constrained = normal.fork({ params: { fragilityCapitalCushion: 0.08 } }) as KernelEngine;
    for (const e of [normal, constrained]) { e.fire('wageSettlement', 10); e.step(12); }
    expect(constrained.value('creditCapitalCapacity')).toBe(0);
    expect(constrained.value('creditCapitalShortfall')).toBeGreaterThan(0);
    expect(constrained.value('businessCreditDenied')).toBeGreaterThan(normal.value('businessCreditDenied'));
    expect(constrained.value('businessCreditApproved')).toBeLessThan(normal.value('businessCreditApproved'));
    expect(constrained.value('bankDividends')).toBeGreaterThanOrEqual(0);
    const base = growing();
    const withLoss = base.fork({ params: { fragilityCollateralAdvance: 0.1, fragilityDefaultDelay: 1 / 12, fragilityArrearsWeight: 1 } }) as KernelEngine;
    const withoutLoss = base.fork({ params: { fragilityCollateralAdvance: 0.1, fragilityDefaultDelay: 1 / 12, fragilityWriteoffSpeed: 0, fragilityArrearsWeight: 1 } }) as KernelEngine;
    for (const e of [withLoss, withoutLoss]) { e.setLever('tourism', -60); e.setLever('keyRate', 12); e.step(24); }
    expect(withLoss.value('investmentXT')).toBeLessThan(withLoss.value('investmentDesiredXT'));
    expect(withLoss.value('bankEquity')).toBeLessThan(withoutLoss.value('bankEquity'));
    expect(withLoss.value('creditCapitalCapacity')).toBeLessThan(withoutLoss.value('creditCapitalCapacity'));
    expect(withLoss.value('bankDividends')).toBeGreaterThanOrEqual(0);
    expect(withLoss.checks().signViolations).toEqual([]);
  });

  test('financing classes use actual cash earnings and partition opening debt; good times change lender standards without moving the lending-appetite lever', () => {
    const e = stationary();
    e.setLever('tourism', 30);
    const userAppetite = e.leverValue('lendingAppetite');
    e.step(24);
    expect(e.value('lenderConfidence')).toBeGreaterThan(0.01);
    expect(e.leverValue('lendingAppetite')).toBe(userAppetite);
    tiny(e.value('hedgeDebtShare') + e.value('speculativeDebtShare') + e.value('ponziDebtShare'), 1);
    for (const j of FIRMS) {
      const c = e.value(`operatingCash${j}`) / Math.max(1e-9, e.value(`interestDue${j}`) + e.value(`principalMaturity${j}`) + e.value(`arrearsScheduled${j}`));
      tiny(e.value(`cashServiceCoverage${j}`), c);
    }
    const riskOff = e.fork({ params: { fragilityRiskSpeed: 0, fragilityRiskCapitalRelief: 0, fragilityRiskCollateralLift: 0 } }) as KernelEngine;
    expect(e.value('creditCapitalCapacity')).toBeGreaterThan(riskOff.value('creditCapitalCapacity'));
    expect(e.checks().signViolations).toEqual([]);
  });

  test('a sustained rate/tourism crisis curtails unfunded material production, preserves deflators and keeps every cash position available', () => {
    const e = growing();
    e.step(12); e.setLever('keyRate', 12); e.setLever('tourism', -60); e.step(228);
    expect(e.influences('exportVolumeOther').regime).toContain('production curtailed');
    expect(e.value('employmentXO')).toBe(0);
    expect(e.stock('deposits', 'XO')).toBeGreaterThan(-1e-9);
    const p = (id: string) => e.baselineData.pBase[e.model.paramIndex.get(id)!];
    tiny(e.value('exportsOther'), e.value('exportVolumeOther') * e.value('domesticPrice'));
    tiny(e.value('importsXO'), e.value('exportVolumeOther') * p('mXO') * e.value('borderImportPrice'));
    tiny(e.value('exporterInputsXO'), e.value('exportVolumeOther') * p('dXO') * e.value('domesticPrice'));
    expect(e.checks().failures).toEqual([]);
    expect(e.checks().signViolations).toEqual([]);
  });

  test('seeking/resetting/forking a loss scenario reproduces all variables, portfolios, funding legs and new reports without getter mutations', () => {
    const e = growing();
    e.setLever('tourism', -60); e.step(24); e.setLever('tourism', 0); e.step(24);
    const result = state(e);
    e.seek(13); e.seek(48);
    expect(state(e)).toBe(result);
    expect(state(e.fork() as KernelEngine)).toBe(result);
    const fresh = growing(); fresh.load({ version: 2, modelId: e.model.def.id, months: 48, events: e.events }); fresh.seek(48);
    expect(state(fresh)).toBe(result);
    for (const id of ['businessArrearsAmount', 'businessLoanLosses', 'businessCreditApproved', 'ponziDebtShare']) {
      const a = e.levels(id, 'nominal'); a[0] = 123456;
      e.levels(id, 'real'); e.series(id);
    }
    expect(state(e)).toBe(result);
    e.reset();
    expect(e.stock('businessArrears', 'B')).toBe(0);
    expect(e.value('lenderConfidence')).toBe(0);
    expect(e.value('businessCreditApproved')).toBeGreaterThan(0);
    expect(e.events).toEqual([]);
  });
});
