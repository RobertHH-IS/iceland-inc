/**
 * Balance sheets stay possible (audit H1, H2, H6, H7, M6, M9, M10, M11): under the lever settings
 * that used to break them, no holder's asset goes below zero and no issuer's liability turns into
 * an asset for 20 years, in either stabiliser mode. Real capital counts as a holder's asset.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { lockAll } from '../../src/core/scenario.ts';
import { createEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { withConcepts } from '../../src/models/index.ts';
import type { Ctx, RuleDef } from '../../src/core/types.ts';
import { stepByStep } from '../../src/models/iceland/testing.ts';

const model = compile(withConcepts(icelandModel));
const base = createEngine(model);
const TOL = 1e-6;
const HOLDER = 1;

type Setting = [lever: string, value: number];

/** Every position with the wrong sign over `months`, as 'instrument/player'. Positions the model
 *  declares free to take either sign (decision 0005: banks' reserves) are left out, as the kernel's
 *  diagnostic and the harness leave them out, unless `exempt` asks for only those. `automatic`:
 *  both policy levers unlocked (the default); otherwise both locked at month 0. */
function wrongSigns(settings: Setting[], automatic: boolean, months = 240, exempt = false): string[] {
  const e = createEngine(model, { baseline: base.baselineData, dev: false });
  lockAll(e, !automatic);
  for (const [id, v] of settings) {
    const lever = model.levers.find((l) => l.id === id)!;
    if (lever.kind === 'oneoff') e.fire(id, v);
    else e.setLever(id, v);
  }
  const bad = new Set<string>();
  for (let m = 1; m <= months; m++) {
    e.step(1);
    const pos = e.positionsAt(m);
    for (let k = 0; k < pos.length; k++) {
      const role = model.role[k];
      if (!role || Boolean(model.signExempt[k]) !== exempt) continue;
      const breach = role === HOLDER ? -pos[k] : pos[k];
      if (!(breach <= TOL)) bad.add(`${model.instruments[Math.floor(k / model.NP)].id}/${model.players[k % model.NP].id}`);
    }
  }
  return [...bad].sort();
}

/** Months (both policy levers locked) in which pension funds' deposits are overdrawn while they
 *  still hold bank bonds. */
function pfOverdraftWithBankBonds(settings: Setting[], months = 240): number {
  const e = createEngine(model, { baseline: base.baselineData, dev: false });
  lockAll(e);
  for (const [id, v] of settings) e.setLever(id, v);
  let n = 0;
  for (let m = 1; m <= months; m++) {
    e.step(1);
    if (e.stock('deposits', 'PF') < -TOL && e.stock('bankBonds', 'PF') > TOL) n++;
  }
  return n;
}

// The worst cases of the lever-range sweep before the floors (each lever alone at its min or max,
// and the bond buyers with a large deficit), with what went wrong then.
const WORST: [string, Setting[], boolean][] = [
  ['tourism −60: fisheries repaid more than they owed', [['tourism', -60]], false],
  // (until padlocks, the income-tax offset +10 on top of the debt rule; now income tax held 10 points higher, the key-rate rule acting)
  ['income tax +10 held, the key-rate rule acting: bonds bought back from banks that had none', [['incomeTax', 10]], true],
  ['foreign allocation +20: funds overdrew deposits, then shorted bonds', [['pfForeign', 20]], false],
  ['foreign allocation +20 with the policy rules acting', [['pfForeign', 20]], true],
  ['foreign allocation −20: banks shorted bonds, non-residents overdrew', [['pfForeign', -20]], true],
  ['key rate held at 15%: funds overdrew deposits buying new bonds', [['keyRate', 15]], false],
  ['key rate held at 0%: bonds bought back from banks that had none', [['keyRate', 0]], false],
  ['aluminium −40%: smelters scrapped capital into negative', [['aluminiumPrice', -40]], false],
  ['VAT +10: working-age households overdrew deposits', [['vat', 10]], false],
  ['tourism −60 with the policy rules acting: working-age households overdrew deposits', [['tourism', -60]], true],
  ['króna −25%: non-residents overdrew deposits', [['kronaShock', -25]], true],
  ['foreign allocation −20 with króna −25%: non-residents ran out of krónur', [['pfForeign', -20], ['kronaShock', -25]], false],
  ['pension funds as sole buyers of a large deficit', [['bondBuyers', 3], ['health', 3], ['education', 3]], false],
  ['older households as sole buyers of a large deficit', [['bondBuyers', 4], ['health', 3], ['education', 3]], true],
  ['pension funds as sole buyers with the key rate at 15%', [['bondBuyers', 3], ['keyRate', 15]], false],
  ['central bank as buyer, surplus with the key-rate rule acting (income tax +10 held): reserves overdrawn', [['bondBuyers', 2], ['incomeTax', 10]], true],
  // Random two- and three-lever combinations (review of the floors): pension payouts outran
  // contributions and income, and the funds overdrew deposits while still holding bank bonds.
  ['health −3, education −3, fish prices +30: funds overdrew deposits holding bank bonds', [['health', -3], ['education', -3], ['fishPrices', 30]], false],
];

describe('Iceland model: balance sheets stay possible', () => {
  for (const [label, settings, automatic] of WORST)
    test(`${label} (${automatic ? 'unlocked' : 'locked'}): no position with the wrong sign in 20 years`, () => {
      expect(wrongSigns(settings, automatic)).toEqual([]);
    });

  test('every lever alone at its min and at its max (every option of a choice), 20 years, locked and unlocked: none, and banks borrow reserves only in the documented case', () => {
    const found: string[] = [];
    const borrowed: string[] = [];
    for (const l of model.levers) {
      if (l.kind === 'lock') continue; // the padlocks set up the two configurations
      const values = l.kind === 'choice' ? (l.options ?? []).map((o) => o.value).filter((v) => v !== l.default) : [l.min!, l.max!];
      for (const v of values)
        for (const automatic of [false, true]) {
          const setting = `${l.id}=${v} ${automatic ? 'unlocked' : 'locked'}`;
          for (const pos of wrongSigns([[l.id, v]], automatic)) found.push(`${setting}: ${pos}`);
          if (wrongSigns([[l.id, v]], automatic, 240, true).length) borrowed.push(setting);
        }
    }
    expect(found).toEqual([]);
    // publicInvestment −3 with both policy levers locked also borrowed reserves until firms' debt was held near its norm
    // and households kept a cash buffer (trade-exporter-debt-spiral, tax-TAX-2): the surplus then
    // never outran the bonds left to buy back.
    // Since padlocks (decision 0010) income tax +10 also runs with the key-rate rule acting (it was
    // hidden on Automatic): moving it locks it, so the surplus is held there too and ends the same way.
    expect(borrowed).toEqual(['incomeTax=10 locked', 'incomeTax=10 unlocked']);
  }, 60_000);

  test('the one declared exemption: banks’ reserves, which go below zero when they borrow from the central bank', () => {
    const exempt = model.instruments.filter((i) => i.mayGoNegative).map((i) => `${i.id}: ${i.mayGoNegative!.players?.join(', ')}`);
    expect(exempt).toEqual(['reserves: B, CB']);
  });

  test('a surplus held with both policy levers locked after every bond is repaid makes banks borrow reserves from the central bank, and nothing else goes wrong', () => {
    // decision 0002 §6 and 0005: the treasury account keeps the surplus, which drains reserves
    // one for one; below zero the banks borrow them and pay the key rate.
    expect(wrongSigns([['incomeTax', 10]], false)).toEqual([]);
    expect(wrongSigns([['incomeTax', 10]], false, 240, true)).toEqual(['reserves/B', 'reserves/CB']);
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    e.setLever('incomeTax', 10);
    e.step(240);
    expect(e.stock('reserves', 'B')).toBeLessThan(-1);
    // The banks pay the central bank interest on what they borrow (reserve interest turns negative).
    expect(e.value('reserveInterest')).toBeLessThan(0);
    // Only a sliver of bonds is left (non-residents'), and the treasury account holds the surplus.
    expect(e.stock('govBonds', 'G')).toBeLessThan(0.1);
    expect(e.stock('treasuryAccount', 'G')).toBeGreaterThan(15);
  });

  test('once the surplus has bought back every bond it can, the debt ratio nets off treasury cash above its target', () => {
    // incomeTax +10 with both policy levers locked: the treasury account rises above its target after about 13 years
    // (above), and the debt rule must see that cash, or it would keep calling for tax cuts on a
    // debt that is no longer there.
    // every kernel step's bonds, cash and trailing GDP (decision 0011: two steps a month)
    const { engine: e, steps } = stepByStep(createEngine(model, { baseline: base.baselineData, dev: false }), (x) => ({
      bonds: x.stock('govBonds', 'G') + x.stock('indexedBonds', 'G'),
      cash: x.stock('treasuryAccount', 'G'),
      gdp: x.value('gdpTrailing12'),
    }));
    lockAll(e); // both policy levers locked
    e.setLever('incomeTax', 10);
    e.step(240);
    const tga = e.influences('debtRatio').params.find((p) => p.id === 'tga')!.value;
    const N = model.def.substeps ?? 1;
    const last = steps.length - 1;
    const { bonds, cash } = steps[last - 1];
    expect(cash - tga).toBeGreaterThan(10);
    // stocks at the start of the step (after the one before), and GDP over the 12 months to a month before
    expect(e.value('debtRatio')).toBeCloseTo((bonds - (cash - tga)) / steps[last - N].gdp, 12);
    expect(e.value('debtRatio')).toBeLessThan(0); // a net asset: more cash than debt
    // at the baseline the treasury account is at its target, so nothing is netted
    expect(base.baseline('debtRatio')).toBeCloseTo((base.stock('govBonds', 'G') + base.stock('indexedBonds', 'G')) / base.baseline('gdpTrailing12'), 12);
  });

  test('pension funds let bank bonds run off once foreign sales cannot raise the cash: no overdraft', () => {
    // Each of these used to overdraw the funds' deposits by 0.9–4.2% of GDP with bank bonds left.
    expect(wrongSigns([['incomeTax', 10], ['aluminiumPrice', -40], ['pfForeign', 20]], false)).toEqual([]);
    expect(wrongSigns([['foreignRate', 5], ['pfForeign', 20], ['education', -3]], false)).toEqual([]);
    // With the consumption deflator and the recalibrated rule (audit H4), VAT +10 with income tax
    // +10 reached the collapse gap below in month 238, after the bank bonds were gone. With the
    // households' cash buffer and firms' owners holding debt near its norm (tax-TAX-2,
    // trade-exporter-debt-spiral) the collapse is shallower and the funds are not overdrawn.
    expect(wrongSigns([['vat', 10], ['incomeTax', 10]], false)).toEqual([]);
    // What the run-off fixed still holds in every case: the funds never overdraw while bank bonds remain.
    for (const settings of [
      [['incomeTax', 10], ['aluminiumPrice', -40], ['pfForeign', 20]],
      [['foreignRate', 5], ['pfForeign', 20], ['education', -3]],
      [['vat', 10], ['incomeTax', 10]],
    ] as Setting[][])
      expect(pfOverdraftWithBankBonds(settings)).toBe(0);
  });

  test('the bank-bond run-off takes over only when foreign sales are limited (holdings gone, or non-residents short of krónur)', () => {
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    lockAll(e); // both policy levers locked
    for (const [id, v] of [['health', -3], ['education', -3], ['fishPrices', 30]] as Setting[]) e.setLever(id, v);
    let ran = 0,
      lowest = Infinity;
    for (let m = 1; m <= 240; m++) {
      e.step(1);
      lowest = Math.min(lowest, e.stock('deposits', 'PF'));
      if (e.influences('bankBondPurchases').regime === 'Letting bank bonds run off to raise cash') {
        ran++;
        expect(e.influences('foreignAssetPurchases').regime ?? '').toStartWith('Sales limited by');
      }
    }
    expect(ran).toBeGreaterThan(0);
    expect(lowest).toBeGreaterThan(-1e-9);

    // When foreign purchases spend all the cash, what is left can be a rounding error below zero;
    // that is not a run-off (it was labelled one in 5 months of this run before).
    const f = createEngine(model, { baseline: base.baselineData, dev: false });
    f.setLever('pfForeign', 20);
    for (let m = 1; m <= 240; m++) {
      f.step(1);
      expect(f.influences('bankBondPurchases').regime ?? '').not.toBe('Letting bank bonds run off to raise cash');
    }
  });

  test('a current-account surplus after non-residents have sold every bond: they borrow krónur from banks instead of overdrawing (review M6)', () => {
    // This used to overdraw their deposits by up to 0.02% of GDP (decision 0002 §6, before the
    // króna loans). Now banks lend them what the month's payments would overdraw, and they repay it.
    expect(wrongSigns([['pfForeign', -20], ['tourism', 30]], true)).toEqual([]);
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    e.setLever('pfForeign', -20);
    e.setLever('tourism', 30);
    let borrowed = 0;
    const loans: number[] = [];
    for (let m = 1; m <= 240; m++) {
      e.step(1);
      borrowed = Math.max(borrowed, e.stock('kronaLoansW', 'W'));
      loans.push(e.stock('kronaLoansW', 'W'));
      expect(e.stock('deposits', 'W')).toBeGreaterThan(-1e-9);
    }
    expect(borrowed).toBeGreaterThan(0.005);
    // The much dearer króna shrinks the reserves in krónur below their target, so the central bank
    // buys foreign currency from non-residents with krónur (lever review FX-1 follow-up): they need
    // to borrow less (about 2.2% of GDP at the peak, 4.4% before). They repay from deposits above
    // what they keep, so slowly while the surplus lasts: their loans stop growing after about two
    // years, fall every two years from month 72, and by month 240 are at most three-quarters of the
    // peak. (Two-thirds on the monetary-fx branch alone; with the fix branches merged, the króna rises
    // less and the current account turns to deficit for about ten years, which leaves them fewer
    // spare krónur to repay with.)
    for (let m = 36; m <= 240; m++) expect(loans[m - 1]).toBeLessThanOrEqual(loans[35] + 1e-9);
    for (let m = 72; m + 24 <= 240; m += 24) expect(loans[m + 24 - 1]).toBeLessThan(loans[m - 1]);
    expect(e.stock('kronaLoansW', 'W')).toBeLessThan(0.75 * borrowed);
  });

  test('non-residents borrow exactly what a month would overdraw, and repay from deposits above what they keep, never more than they owe (review M6)', () => {
    // The rule on its own, with the limits in its combine and the regime that names them.
    const rule = icelandModel.modules.flatMap((m) => m.rules ?? []).find((r) => r.id === 'kronaBorrowingW') as RuleDef;
    const params = Object.fromEntries(icelandModel.modules.flatMap((m) => m.params ?? []).map((p) => [p.id, p.value]));
    const stocks: Record<string, number> = { 'deposits/W': 0.1, 'govBonds/W': 0, 'kronaLoansW/W': 0 };
    const values: Record<string, number> = { nominalGDP: 100, foreignAssetPurchases: 0, currentAccount: 3, reserveIncomeKept: 0, bondPurchasesW: 0 };
    const c = { v: (id: string) => values[id], p: (id: string) => params[id], stock: (i: string, p: string) => stocks[`${i}/${p}`], dt: 1 / 12, t: 0 } as unknown as Ctx;
    const value = () => {
      const t = Object.fromEntries(rule.terms!.map((x) => [x.id, x.compute(c)]));
      const v = rule.combine!(t, c);
      return { v, regime: rule.regime!(c, v, t) };
    };
    // a surplus of 3 a year takes 0.25 in a month from 0.1 of deposits: they borrow the 0.15 short, 1.8 a year
    let r = value();
    expect(r.v).toBeCloseTo(0.15 * 12, 9);
    expect(r.regime).toBe('Borrowing krónur to cover an overdraft');
    // with deposits well above what they keep, they repay about 63% of the excess in a month, capped by the loan
    Object.assign(stocks, { 'deposits/W': 1, 'kronaLoansW/W': 0.05 });
    values.currentAccount = 0;
    r = value();
    expect(r.v).toBeCloseTo(-0.05 * 12, 9);
    expect(r.regime).toBe('Repaying króna loans');
    stocks['kronaLoansW/W'] = 10;
    r = value();
    const kept = (params.wDepositFloorShare * params.depW) / (params.depW + params.bondW); // share of holdings kept in deposits
    expect(r.v).toBeCloseTo(-(1 - Math.exp(-params.liquiditySpeed / 12)) * 12 * (1 - kept), 9);
    // nothing owed and nothing short: no regime
    stocks['kronaLoansW/W'] = 0;
    expect(value()).toEqual({ v: 0, regime: null });
  });

  test('non-residents borrow no krónur at the baseline or under moderate shocks', () => {
    for (const settings of [[], [['tourism', -30]], [['kronaShock', -10]], [['foreignRate', 1]], [['pfForeign', 5]]] as Setting[][]) {
      const e = createEngine(model, { baseline: base.baselineData, dev: false });
      lockAll(e); // both policy levers locked
      for (const [id, v] of settings) (model.levers.find((l) => l.id === id)!.kind === 'oneoff' ? e.fire(id, v) : e.setLever(id, v));
      e.step(120);
      let most = 0;
      for (let m = 0; m <= 120; m++) most = Math.max(most, e.valueAt('kronaBorrowingW', m));
      expect(most).toBe(0);
    }
  });

  test('known gap: when the economy collapses, the funds run through every asset they can sell and overdraw deposits', () => {
    // decision 0002 §6: shares and mortgages are never sold, and pensions are paid in full.
    // Non-residents, who also ran out of krónur here, now borrow them from banks (review M6). Since
    // firms call on the funds only for deposits above their buffer, the overdraft started in month
    // 248, not 228; with the fix branches merged (bounded portfolio balance, bonds that reprice as
    // they mature, market rents, a higher import elasticity) it starts in month 288, so the run is 25 years.
    expect(wrongSigns([['publicInvestment', -3], ['foreignDemand', 20], ['incomeTax', 10]], false, 276)).toEqual([]);
    expect(wrongSigns([['publicInvestment', -3], ['foreignDemand', 20], ['incomeTax', 10]], false, 300)).toEqual(['deposits/PF']);
  });

  test('pension funds pay for new government bonds only from cash above their buffer, so a deficit they buy does not force foreign sales (review E1 follow-up)', () => {
    // bond buyers = pension funds with a large deficit: before, new bonds took 63% of all their
    // deposits each month, the buffer ran down, and the funds sold foreign assets to rebuild it,
    // which lifted the króna up to 17.5% with the policy rules acting.
    // (until padlocks, the income-tax offset −10 on top of the debt rule; now income tax held 10 points lower)
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    e.setLever('bondBuyers', 3);
    e.setLever('incomeTax', -10);
    let lowestForeign = Infinity,
      banks = 0;
    for (let m = 1; m <= 120; m++) {
      e.step(1);
      lowestForeign = Math.min(lowestForeign, e.value('foreignAssetPurchases'));
      banks = Math.max(banks, e.value('bondIssueB'));
      expect(e.indicator('krona')).toBeLessThan(1);
      if (e.value('bondIssuePF') > 0) expect(e.influences('foreignAssetPurchases').regime ?? '').not.toBe('Selling foreign assets to raise cash');
    }
    expect(lowestForeign).toBeGreaterThan(-0.5);
    expect(banks).toBeGreaterThan(1); // banks take what the funds cannot pay for
  });

  test('the floors do not bind at the baseline, locked or unlocked', () => {
    for (const automatic of [false, true]) {
      const e = createEngine(model, { baseline: base.baselineData });
      lockAll(e); // both policy levers locked
      if (automatic) lockAll(e, false);
      e.step(12);
      const rules = ['investmentPlanXA', 'borrowingXA', 'bondIssue', 'bondIssuePF', 'bondIssueHO', 'foreignAssetPurchases', 'bankBondPurchases', 'bondPurchasesPF', 'bondPurchasesHO', 'bondPurchasesW', 'consumptionW', 'consumptionO', 'depositRate'];
      for (const id of rules) expect(`${id}: ${e.influences(id).regime ?? 'none'}`).toBe(`${id}: none`);
    }
  });

  test('a purchase capped by both cash and banks’ holdings is labelled by the cap that binds', () => {
    // Non-residents want 5 a year and banks can sell them 0.2 ÷ one month = 2.4. With 0.5 in
    // deposits and 1 in bonds they keep about 0.32 (half their usual deposit share of 1.5), and may
    // spend about 63% of the 0.18 above it in a month, about 1.4 a year: the cash limit binds,
    // whichever cap the rule checks first.
    const rule = icelandModel.modules.flatMap((m) => m.rules ?? []).find((r) => r.id === 'bondPurchasesW') as RuleDef;
    const stocks: Record<string, number> = { 'deposits/W': 0.5, 'govBonds/W': 1, 'govBonds/B': 0.2 };
    const values: Record<string, number> = { nominalGDP: 100, foreignAssetPurchases: 0, currentAccount: 0, reserveIncomeKept: 0, bondIssueB: 0, bondPurchasesPF: 0, bondPurchasesHO: 0 };
    const params = Object.fromEntries(icelandModel.modules.flatMap((m) => m.params ?? []).map((p) => [p.id, p.value]));
    const c = { v: (id: string) => values[id], p: (id: string) => params[id], stock: (i: string, p: string) => stocks[`${i}/${p}`], dt: 1 / 12, t: 0 } as unknown as Ctx;
    const cash = () => rule.terms!.find((x) => x.id === 'cash')!.compute(c);
    let t = { normal: 5, carry: 0, cash: cash() };
    expect(t.cash).toBeGreaterThan(1);
    expect(t.cash).toBeLessThan(2);
    const v = rule.combine!(t, c);
    expect(v).toBeCloseTo(t.cash, 9);
    expect(rule.regime!(c, v, t)).toBe('Purchases limited by cash in hand');
    stocks['deposits/W'] = 10; // now banks' holdings bind
    t = { normal: 5, carry: 0, cash: cash() };
    expect(rule.combine!(t, c)).toBeCloseTo(2.4, 9);
    expect(rule.regime!(c, 2.4, t)).toBe('Limited by the bonds banks hold');
    stocks['deposits/W'] = 0.01; // below the floor: they sell bonds instead of buying
    t = { normal: 5, carry: 0, cash: cash() };
    expect(rule.combine!(t, c)).toBeLessThan(0);
    expect(rule.regime!(c, rule.combine!(t, c), t)).toBe('Selling bonds to keep enough króna cash');
  });

  test('households spend no more cash than they have: without the cash buffer, working-age deposits run down toward zero, never below, under income tax +10 held with both policy levers locked', () => {
    const e = createEngine(model, { baseline: base.baselineData, dev: false }).fork({ params: { aBuf: 0 } });
    lockAll(e); // both policy levers locked
    e.setLever('incomeTax', 10);
    let lowest = Infinity,
      limited = 0;
    for (let m = 1; m <= 240; m++) {
      e.step(1);
      lowest = Math.min(lowest, e.stock('deposits', 'HW'));
      if (e.influences('consumptionW').regime === 'Spending limited by cash in hand') limited++;
    }
    expect(lowest).toBeGreaterThan(-1e-9); // the solver's tolerance, not an overdraft
    expect(limited).toBeGreaterThan(0);
  });
});
