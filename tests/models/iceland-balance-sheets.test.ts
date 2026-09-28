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

/** Every position with the wrong sign over `months`, as 'instrument/player'. A lever hidden in the
 *  chosen mode has no effect there, so setting one is an error: the case would test nothing. */
function wrongSigns(settings: Setting[], automatic: boolean, months = 240): string[] {
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
      if (!role) continue;
      const breach = role === HOLDER ? -pos[k] : pos[k];
      if (!(breach <= TOL)) bad.add(`${model.instruments[Math.floor(k / model.NP)].id}/${model.players[k % model.NP].id}`);
    }
  }
  return [...bad].sort();
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
];

describe('Iceland model: balance sheets stay possible', () => {
  for (const [label, settings, automatic] of WORST)
    test(`${label} (${automatic ? 'Automatic' : 'Manual'}): no position with the wrong sign in 20 years`, () => {
      expect(wrongSigns(settings, automatic)).toEqual([]);
    });

  test('every lever alone at its min and at its max (every option of a choice), 20 years, in each mode where it acts: only the known gap below', () => {
    const found: string[] = [];
    for (const l of model.levers) {
      if (l.id === 'stabilisers') continue;
      const values = l.kind === 'choice' ? (l.options ?? []).map((o) => o.value).filter((v) => v !== l.default) : [l.min!, l.max!];
      const modes = [false, true].filter((automatic) => !l.showWhen || [l.showWhen.equals].flat().includes(automatic ? 1 : 0));
      for (const v of values) for (const automatic of modes) for (const pos of wrongSigns([[l.id, v]], automatic)) found.push(`${l.id}=${v} ${automatic ? 'Automatic' : 'Manual'}: ${pos}`);
    }
    expect(found).toEqual(['incomeTax=10 Manual: reserves/B', 'incomeTax=10 Manual: reserves/CB', 'publicInvestment=-3 Manual: reserves/B', 'publicInvestment=-3 Manual: reserves/CB']);
  }, 30_000);

  test('known gap: a surplus held on Manual after every bond is repaid overdraws banks’ reserves at the central bank, and nothing else', () => {
    // decision 0002 §6: the treasury account keeps the surplus, which drains reserves one for one.
    expect(wrongSigns([['incomeTax', 10]], false)).toEqual(['reserves/B', 'reserves/CB']);
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
