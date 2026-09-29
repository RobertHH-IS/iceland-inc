/**
 * Balance sheets stay possible (audit H1, H2, H6, H7, M6, M9, M10, M11): under the lever settings
 * that used to break them, no holder's asset goes below zero and no issuer's liability turns into
 * an asset for 20 years, in either stabiliser mode. Real capital counts as a holder's asset.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { withConcepts } from '../../src/models/index.ts';
import type { Ctx, RuleDef } from '../../src/core/types.ts';

const model = compile(withConcepts(icelandModel));
const base = createEngine(model);
const TOL = 1e-6;
const HOLDER = 1;

type Setting = [lever: string, value: number];

/** Every position with the wrong sign over `months`, as 'instrument/player'. Positions the model
 *  declares free to take either sign (decision 0005: banks' reserves) are left out, as the kernel's
 *  diagnostic and the harness leave them out, unless `exempt` asks for only those. A lever hidden
 *  in the chosen mode has no effect there, so setting one is an error: the case would test nothing. */
function wrongSigns(settings: Setting[], automatic: boolean, months = 240, exempt = false): string[] {
  const e = createEngine(model, { baseline: base.baselineData, dev: false });
  if (automatic) e.setLever('stabilisers', 1);
  for (const [id, v] of settings) {
    const lever = model.levers.find((l) => l.id === id)!;
    const shown = !lever.showWhen || [lever.showWhen.equals].flat().includes(automatic ? 1 : 0);
    if (!shown) throw new Error(`lever '${id}' does nothing on ${automatic ? 'Automatic' : 'Manual'}`);
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

/** Months (Manual) in which pension funds' deposits are overdrawn while they still hold bank bonds. */
function pfOverdraftWithBankBonds(settings: Setting[], months = 240): number {
  const e = createEngine(model, { baseline: base.baselineData, dev: false });
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
  ['income-tax offset +10 on Automatic: bonds bought back from banks that had none', [['incomeTaxOffset', 10]], true],
  ['foreign allocation +20: funds overdrew deposits, then shorted bonds', [['pfForeign', 20]], false],
  ['foreign allocation +20 on Automatic', [['pfForeign', 20]], true],
  ['foreign allocation −20: banks shorted bonds, non-residents overdrew', [['pfForeign', -20]], true],
  ['key rate held at 15%: funds overdrew deposits buying new bonds', [['keyRateFixed', 15]], false],
  ['key rate held at 0%: bonds bought back from banks that had none', [['keyRateFixed', 0]], false],
  ['aluminium −40%: smelters scrapped capital into negative', [['aluminiumPrice', -40]], false],
  ['VAT +10: working-age households overdrew deposits', [['vat', 10]], false],
  ['tourism −60 on Automatic: working-age households overdrew deposits', [['tourism', -60]], true],
  ['króna −25%: non-residents overdrew deposits', [['kronaShock', -25]], true],
  ['foreign allocation −20 with króna −25%: non-residents ran out of krónur', [['pfForeign', -20], ['kronaShock', -25]], false],
  ['pension funds as sole buyers of a large deficit', [['bondBuyers', 3], ['health', 3], ['education', 3]], false],
  ['older households as sole buyers of a large deficit', [['bondBuyers', 4], ['health', 3], ['education', 3]], true],
  ['pension funds as sole buyers with the key rate at 15%', [['bondBuyers', 3], ['keyRateFixed', 15]], false],
  ['central bank as buyer, surplus on Automatic (income-tax offset +10): reserves overdrawn', [['bondBuyers', 2], ['incomeTaxOffset', 10]], true],
  // Random two- and three-lever combinations (review of the floors): pension payouts outran
  // contributions and income, and the funds overdrew deposits while still holding bank bonds.
  ['health −3, education −3, fish prices +30: funds overdrew deposits holding bank bonds', [['health', -3], ['education', -3], ['fishPrices', 30]], false],
];

describe('Iceland model: balance sheets stay possible', () => {
  for (const [label, settings, automatic] of WORST)
    test(`${label} (${automatic ? 'Automatic' : 'Manual'}): no position with the wrong sign in 20 years`, () => {
      expect(wrongSigns(settings, automatic)).toEqual([]);
    });

  test('every lever alone at its min and at its max (every option of a choice), 20 years, in each mode where it acts: none, and banks borrow reserves only in the two documented cases', () => {
    const found: string[] = [];
    const borrowed: string[] = [];
    for (const l of model.levers) {
      if (l.id === 'stabilisers') continue;
      const values = l.kind === 'choice' ? (l.options ?? []).map((o) => o.value).filter((v) => v !== l.default) : [l.min!, l.max!];
      const modes = [false, true].filter((automatic) => !l.showWhen || [l.showWhen.equals].flat().includes(automatic ? 1 : 0));
      for (const v of values)
        for (const automatic of modes) {
          const setting = `${l.id}=${v} ${automatic ? 'Automatic' : 'Manual'}`;
          for (const pos of wrongSigns([[l.id, v]], automatic)) found.push(`${setting}: ${pos}`);
          if (wrongSigns([[l.id, v]], automatic, 240, true).length) borrowed.push(setting);
        }
    }
    expect(found).toEqual([]);
    expect(borrowed).toEqual(['incomeTax=10 Manual', 'publicInvestment=-3 Manual']);
  }, 60_000);

  test('the one declared exemption: banks’ reserves, which go below zero when they borrow from the central bank', () => {
    const exempt = model.instruments.filter((i) => i.mayGoNegative).map((i) => `${i.id}: ${i.mayGoNegative!.players?.join(', ')}`);
    expect(exempt).toEqual(['reserves: B, CB']);
  });

  test('a surplus held on Manual after every bond is repaid makes banks borrow reserves from the central bank, and nothing else goes wrong', () => {
    // decision 0002 §6 and 0005: the treasury account keeps the surplus, which drains reserves
    // one for one; below zero the banks borrow them and pay the key rate.
    expect(wrongSigns([['incomeTax', 10]], false)).toEqual([]);
    expect(wrongSigns([['incomeTax', 10]], false, 240, true)).toEqual(['reserves/B', 'reserves/CB']);
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    e.setLever('incomeTax', 10);
    e.step(240);
    expect(e.stock('reserves', 'B')).toBeLessThan(-1);
    // The banks pay the central bank interest on what they borrow (reserve interest turns negative).
    expect(e.value('reserveInterest')).toBeLessThan(0);
    // Only a sliver of bonds is left (non-residents'), and the treasury account holds the surplus.
    expect(e.stock('govBonds', 'G')).toBeLessThan(0.1);
    expect(e.stock('treasuryAccount', 'G')).toBeGreaterThan(20);
  });

  test('once the surplus has bought back every bond it can, the debt ratio nets off treasury cash above its target', () => {
    // incomeTax +10 on Manual: the treasury account rises above its target after about 13 years
    // (above), and the debt rule must see that cash, or it would keep calling for tax cuts on a
    // debt that is no longer there.
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
    e.setLever('incomeTax', 10);
    e.step(239);
    const tga = e.influences('debtRatio').params.find((p) => p.id === 'tga')!.value;
    const bonds = e.stock('govBonds', 'G') + e.stock('indexedBonds', 'G');
    const cash = e.stock('treasuryAccount', 'G');
    const gdp = e.value('gdpTrailing12');
    expect(cash - tga).toBeGreaterThan(10);
    e.step(1);
    // stocks at the start of the month, and GDP over the 12 months to last month
    expect(e.value('debtRatio')).toBeCloseTo((bonds - (cash - tga)) / gdp, 12);
    expect(e.value('debtRatio')).toBeLessThan(0); // a net asset: more cash than debt
    // at the baseline the treasury account is at its target, so nothing is netted
    expect(base.baseline('debtRatio')).toBeCloseTo((base.stock('govBonds', 'G') + base.stock('indexedBonds', 'G')) / base.baseline('gdpTrailing12'), 12);
  });

  test('pension funds let bank bonds run off once foreign sales cannot raise the cash: no overdraft', () => {
    // Each of these used to overdraw the funds' deposits by 0.9–4.2% of GDP with bank bonds left.
    expect(wrongSigns([['incomeTax', 10], ['aluminiumPrice', -40], ['pfForeign', 20]], false)).toEqual([]);
    expect(wrongSigns([['foreignRate', 5], ['pfForeign', 20], ['education', -3]], false)).toEqual([]);
    // With the consumption deflator and the recalibrated rule (audit H4), VAT +10 with income tax
    // +10 now also reaches the collapse gap below in month 238, after the bank bonds are gone.
    expect(wrongSigns([['vat', 10], ['incomeTax', 10]], false)).toEqual(['deposits/PF']);
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
  });

  test('known gap: a current-account surplus after non-residents have sold every bond overdraws their króna deposits', () => {
    // decision 0002 §6: nothing supplies them krónur once their bonds are gone (no króna borrowing).
    // Since world prices anchor the króna only slowly (audit H5) this case is clean on Manual and
    // shows on Automatic.
    expect(wrongSigns([['pfForeign', -20], ['tourism', 30]], true)).toEqual(['deposits/W']);
  });

  test('known gap: when the economy collapses, the funds run through every asset they can sell and overdraw deposits', () => {
    // decision 0002 §6: shares and mortgages are never sold, and pensions are paid in full.
    expect(wrongSigns([['publicInvestment', -3], ['foreignDemand', 20], ['incomeTax', 10]], false)).toEqual(['deposits/PF', 'deposits/W']);
  });

  test('the floors do not bind at the baseline, in either mode', () => {
    for (const automatic of [false, true]) {
      const e = createEngine(model, { baseline: base.baselineData });
      if (automatic) e.setLever('stabilisers', 1);
      e.step(12);
      const rules = ['investmentXA', 'borrowingXA', 'bondIssue', 'bondIssuePF', 'bondIssueHO', 'foreignAssetPurchases', 'bankBondPurchases', 'bondPurchasesPF', 'bondPurchasesHO', 'bondPurchasesW', 'consumptionW', 'consumptionO', 'depositRate'];
      for (const id of rules) expect(`${id}: ${e.influences(id).regime ?? 'none'}`).toBe(`${id}: none`);
    }
  });

  test('a purchase capped by both cash and banks’ holdings is labelled by the cap that binds', () => {
    // Non-residents want 5 a year, banks can sell them 0.2 ÷ one month = 2.4, and their cash allows
    // far less: the cash limit binds, whichever cap the rule checks first.
    const rule = icelandModel.modules.flatMap((m) => m.rules ?? []).find((r) => r.id === 'bondPurchasesW') as RuleDef;
    const stocks: Record<string, number> = { 'deposits/W': 0.01, 'govBonds/W': 1, 'govBonds/B': 0.2 };
    const values: Record<string, number> = { nominalGDP: 100, foreignAssetPurchases: 0, currentAccount: 0, bondIssueB: 0, bondPurchasesPF: 0, bondPurchasesHO: 0 };
    const params = Object.fromEntries(icelandModel.modules.flatMap((m) => m.params ?? []).map((p) => [p.id, p.value]));
    const c = { v: (id: string) => values[id], p: (id: string) => params[id], stock: (i: string, p: string) => stocks[`${i}/${p}`], dt: 1 / 12, t: 0 } as unknown as Ctx;
    const t = { normal: 5, carry: 0, liquidity: 0 };
    const v = rule.combine!(t, c);
    expect(v).toBeLessThan(0.1);
    expect(rule.regime!(c, v, t)).toBe('Purchases limited by cash in hand');
    stocks['deposits/W'] = 10; // now banks' holdings bind
    expect(rule.combine!(t, c)).toBeCloseTo(2.4, 9);
    expect(rule.regime!(c, 2.4, t)).toBe('Limited by the bonds banks hold');
  });

  test('households spend no more cash than they have: working-age deposits run down toward zero, never below, under income tax +10 held on Manual', () => {
    const e = createEngine(model, { baseline: base.baselineData, dev: false });
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
