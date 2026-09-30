/**
 * The reference economy after the lever review (reports/levers/reference.md): what its texts claim
 * about the debt rule and the tax actually charged, checked against the numbers.
 */
import { describe, expect, test } from 'bun:test';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { lockAll, lockAllEvents, runScenario } from '../../src/core/scenario.ts';
import { referenceModel } from '../../src/models/reference/index.ts';

/** Both policy levers locked (the old Manual) or unlocked (the default, the old Automatic). */
const LOCKED = true,
  UNLOCKED = false;
const base = createEngine(referenceModel, { dev: false });

/** Run `events` with the policy levers locked or not for `months`, and the no-change run alike. */
function pair(locked: boolean, events: { t: number; lever: string; value: number; fire?: boolean }[], months: number): [KernelEngine, KernelEngine] {
  const m = lockAllEvents(base.model, 0, locked);
  return [runScenario(base, [...m, ...events], months).engine, runScenario(base, m, months).engine];
}

describe('the income tax charged', () => {
  test('the tax explanation says who sets the rate, and a locked tax lever charges the normal rate plus the lever', () => {
    const e = createEngine(base.model, { dev: false, baseline: base.baselineData });
    lockAll(e);
    e.setLever('taxRate', 2);
    e.step(24);
    const inf = e.influences('taxes');
    expect(inf.rule!.rule).toMatch(/debt rule’s while the tax lever is unlocked, and the normal rate \d+(\.\d+)?% plus the shift on your lever/);
    const normal = inf.params.find((p) => p.id === 'normalTaxRate')!.value;
    const base_ = e.value('wages') + e.value('depositInterestHH') + e.value('firmDividends') + e.value('bankDividends');
    expect(Math.abs(e.value('taxes') - (normal + 0.02) * base_)).toBeLessThan(1e-9);
    // locked, the debt rule's own rate has moved, and the tax charged ignores it
    expect(Math.abs(e.value('debtRuleRate') - normal)).toBeGreaterThan(1e-4);
  });
});

describe('the debt rule', () => {
  // Until padlocks (decision 0010) the tax lever was an offset the rule leaned against, and this
  // test checked that the rule undid a lasting offset with debt settling 3 ÷ 0.3 = 10 points lower.
  // A tax lever that is moved is now locked and the rule does not act on it; once unlocked, the rule
  // takes over from the rate held and gives the rise back as the lower debt calls for.
  test('unlocked after a held tax rise, it takes over from the rate held and gives the rise back as debt falls', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'taxRate', value: 3 }, { t: 60, lever: 'taxRateLock', value: 0 }], 240);
    const charged = (x: KernelEngine, t: number) => x.valueAt('taxes', t) / (x.valueAt('wages', t) + x.valueAt('depositInterestHH', t) + x.valueAt('firmDividends', t) + x.valueAt('bankDividends', t));
    const d = (t: number) => charged(e, t) - charged(r, t);
    // held at +3 points, then no jump in the month the rule takes over
    expect(Math.abs(d(60) - 0.03)).toBeLessThan(1e-9);
    expect(Math.abs(d(61) - d(60))).toBeLessThan(0.003);
    // the rule gives most of it back: debt is below its no-change level, so the rule wants less tax
    expect(e.valueAt('debtRatio', 60)).toBeLessThan(r.valueAt('debtRatio', 60));
    expect(d(240)).toBeLessThan(0.3 * 0.03);
  });
});

describe('wages and expectations (decision 0008)', () => {
  test('wages pass on all of expected inflation, so at the natural rate of unemployment real wages hold steady', () => {
    const e = createEngine(base.model, { dev: false, baseline: base.baselineData });
    expect(e.influences('wageGrowth').params.find((p) => p.id === 'wageIndexation')!.value).toBe(1);
  });

  test('expected inflation is partly anchored: a year after a 10% wage settlement it is well under half of actual inflation', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }], 12);
    const anchor = e.influences('expectedInflation').params.find((p) => p.id === 'expectationsAnchor')!.value;
    const dExp = e.valueAt('expectedInflation', 12) - r.valueAt('expectedInflation', 12);
    const highest = Math.max(...Array.from({ length: 12 }, (_, i) => e.valueAt('inflation', i + 1) - r.valueAt('inflation', i + 1)));
    expect(dExp).toBeGreaterThan(0);
    expect(dExp).toBeLessThan((1 - anchor) * highest);
  });

  test('a 10% wage settlement raises the price level by 10–15% for good, not by a spiral (second-round effects are moderate)', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }], 240);
    const rise = (x: number) => 100 * (e.valueAt('price', x) / r.valueAt('price', x) - 1);
    expect(rise(240)).toBeGreaterThan(10);
    expect(rise(240)).toBeLessThan(15);
    // it has settled: less than a tenth of a percent in the last year
    expect(Math.abs(rise(240) - rise(228))).toBeLessThan(0.1);
  });

  test('a lasting boom raises inflation by a steady amount, not ever faster (anchored expectations), and no lever sends the unlocked economy into a deflationary spiral', () => {
    // Until padlocks (decision 0010) the key-rate offset (−2 here, +3 below) and the tax offset (+3
    // below) were in these lists: offsets the rules leaned against. Moving those levers now locks
    // them, so their rule no longer acts; the tax lever held by hand is pinned in the zero-lower-bound
    // tests below, and a key rate held by hand in the known limitations.
    for (const [lever, value] of [
      ['govSpending', 3],
      ['lendingAppetite', 2],
    ] as const) {
      const [e, r] = pair(UNLOCKED, [{ t: 0, lever, value }], 240);
      const d = (t: number) => e.valueAt('inflation12', t) - r.valueAt('inflation12', t);
      expect(d(240)).toBeGreaterThan(0);
      expect(Math.abs(d(240) - d(180))).toBeLessThan(0.002);
    }
    for (const [lever, value] of [
      ['govSpending', -3],
      ['lendingAppetite', -2],
    ] as const) {
      const [e, r] = pair(UNLOCKED, [{ t: 0, lever, value }], 240);
      const gap = 100 * (e.valueAt('output', 240) / r.valueAt('output', 240) - 1);
      const earlier = 100 * (e.valueAt('output', 180) / r.valueAt('output', 180) - 1);
      expect(gap).toBeGreaterThan(-2.5);
      expect(gap).toBeGreaterThan(earlier - 0.1); // recovering or settled, not sinking
    }
  });
});

// The key-rate offset, and its test that the rule leaned against it, went with padlocks (decision
// 0010): rules can no longer be tilted. What replaces it is the takeover when a held key rate is
// unlocked.
describe('the key rate unlocked after a hold (decision 0010)', () => {
  test('the Taylor rule takes over from the rate held: the first month moves one smoothed step, not onto its own path', () => {
    const [e] = pair(UNLOCKED, [{ t: 0, lever: 'keyRate', value: 6 }, { t: 24, lever: 'keyRateLock', value: 0 }], 25);
    const speed = e.influences('ruleRate').params.find((p) => p.id === 'policySpeed')!.value;
    expect(e.valueAt('keyRate', 24)).toBe(0.06);
    const step = e.valueAt('keyRate', 25) - 0.06;
    expect(Math.abs(step - (speed / 12) * (e.valueAt('ruleTarget', 25) - 0.06))).toBeLessThan(1e-15);
    // the rule's own shadow path while locked was far below: jumping there would have moved it more
    expect(Math.abs(step)).toBeLessThan(0.2 * Math.abs(e.valueAt('ruleTarget', 25) - 0.06) + 1e-12);
  });
});

describe('the bank’s lending appetite (review REF-credit-appetite-mechanism)', () => {
  test('new loans follow the spending they pay for: no burst of idle deposits in the first month', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'lendingAppetite', value: 2 }], 12);
    const dLoans = e.valueAt('newLoans', 1) - r.valueAt('newLoans', 1);
    const dInvestment = e.valueAt('investment', 1) - r.valueAt('investment', 1);
    expect(dLoans).toBeGreaterThan(0);
    expect(dLoans).toBeLessThan(1.2 * dInvestment);
    // the extra loans = what firms spend of the new credit + what rolls over the extra debt
    for (const t of [1, 6, 12]) {
      const dPlans = 0.4 * (e.valueAt('investmentPlan', t) * e.valueAt('price', t) - r.valueAt('investmentPlan', t) * r.valueAt('price', t));
      const extra = e.valueAt('creditInvestment', t) + e.valueAt('appetiteLoans', t - 1) / 8;
      expect(Math.abs(e.valueAt('newLoans', t) - r.valueAt('newLoans', t) - dPlans - extra)).toBeLessThan(1e-9);
    }
  });

  test('the boost follows net credit: it fades as repayments catch up, and the credit impulse turns negative after about two years', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'lendingAppetite', value: 2 }], 120);
    const inv = (t: number) => e.valueAt('investmentReal', t) - r.valueAt('investmentReal', t);
    const peak = Math.max(...Array.from({ length: 36 }, (_, i) => inv(i + 1)));
    expect(peak).toBeGreaterThan(1);
    expect(inv(120)).toBeLessThan(0.25 * peak);
    expect(e.valueAt('creditImpulse', 24) - r.valueAt('creditImpulse', 24)).toBeLessThan(0);
    // the extra debt stays: about the loan term's worth of the extra lending
    expect(e.valueAt('appetiteLoans', 120)).toBeGreaterThan(10);
  });

  test('output fades from its peak but stays about 1% higher for good: the extra loans leave extra household deposits', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'lendingAppetite', value: 2 }], 240);
    const gap = (t: number) => 100 * (e.valueAt('output', t) / r.valueAt('output', t) - 1);
    const peak = Math.max(...Array.from({ length: 36 }, (_, i) => gap(i + 1)));
    const later = Array.from({ length: 61 }, (_, i) => gap(60 + i));
    expect(Math.max(...later)).toBeLessThan(0.7 * peak);
    expect(gap(240)).toBeGreaterThan(0.7);
    expect(gap(240)).toBeLessThan(1.6);
    const realDeposits = (x: KernelEngine) => x.stock('deposits', 'HH') / x.valueAt('price', 240);
    expect(realDeposits(e) - realDeposits(r)).toBeGreaterThan(5);
  });

  test('payback: when the appetite goes, firms repay the extra debt and invest less than they otherwise would', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'lendingAppetite', value: 2 }, { t: 60, lever: 'lendingAppetite', value: 0 }], 120);
    const inv = (t: number) => e.valueAt('investmentReal', t) - r.valueAt('investmentReal', t);
    const later = Array.from({ length: 36 }, (_, i) => inv(61 + i));
    expect(later.reduce((s, x) => s + x, 0) / later.length).toBeLessThan(-0.5);
    expect(e.valueAt('appetiteLoans', 120)).toBeLessThan(0.6 * e.valueAt('appetiteLoans', 60));
  });
});

describe('inflation and household saving (review REF-realbalance-too-strong)', () => {
  test('households save to make up only part of what expected inflation takes off their deposits', () => {
    const [e] = pair(UNLOCKED, [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }], 12);
    const inf = e.influences('consumption');
    const term = inf.terms.find((t) => t.id === 'inflationLoss')!;
    const k = inf.params.find((p) => p.id === 'inflationAwareness')!.value;
    const mpc = inf.params.find((p) => p.id === 'propensityFromIncome')!.value;
    expect(k).toBeLessThan(mpc);
    expect(term.concept).toBe('haig-simons-income');
    // deposits at the end of last month, which the rule reads, are within a fraction of a percent of today's
    expect(Math.abs(term.value / (e.valueAt('expectedInflation', 12) * e.stock('deposits', 'HH')) + k)).toBeLessThan(0.01 * k);
  });

  test('a 10% wage settlement, the rules acting, costs 3–5% of output at the trough (it cost 7.5%, then 6.5%)', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }], 60);
    const trough = Math.min(...Array.from({ length: 60 }, (_, i) => 100 * (e.valueAt('output', i + 1) / r.valueAt('output', i + 1) - 1)));
    expect(trough).toBeLessThan(-3);
    expect(trough).toBeGreaterThan(-5);
    // real consumption falls further than real disposable income only by the inflation loss and the
    // lower real value of deposits: well under twice as far (it was 1.69×)
    const real = (x: KernelEngine, id: string, t: number) => x.valueAt(id, t) / x.valueAt('price', t);
    const fall = (id: string) => Math.min(...Array.from({ length: 60 }, (_, i) => real(e, id, i + 1) / real(r, id, i + 1) - 1));
    expect(fall('consumption') / fall('disposableIncome')).toBeLessThan(1.6);
  });

  test('the Taylor rule looks partly through the jump: it reads a blend of 12-month and expected inflation, and still obeys the Taylor principle', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }], 12);
    const inf = e.influences('ruleTarget');
    const p = (id: string) => inf.params.find((x) => x.id === id)!.value;
    const w = p('taylorLookThrough');
    expect(w).toBeGreaterThan(0);
    const term = inf.terms.find((t) => t.id === 'inflation')!.value;
    expect(term).toBeCloseTo(p('taylorInflation') * ((1 - w) * e.valueAt('inflation12', 12) + w * e.valueAt('expectedInflation', 12)), 12);
    expect(term).toBeLessThan(0.75 * p('taylorInflation') * e.valueAt('inflation12', 12));
    // the key rate rises by much less than 1.5 × the 8.5-point jump in 12-month inflation
    expect(100 * (e.valueAt('keyRate', 12) - r.valueAt('keyRate', 12))).toBeLessThan(3);
    // per point of lasting inflation the blend moves by 1 − w × anchor, so the key rate still rises by more than a point
    const anchor = e.influences('expectedInflation').params.find((x) => x.id === 'expectationsAnchor')!.value;
    expect(p('taylorInflation') * (1 - w * anchor)).toBeGreaterThan(1);
  });
});

describe('the zero lower bound (review of the deposit-rate floor)', () => {
  const zeroMonths = (e: KernelEngine) => Array.from({ length: 240 }, (_, i) => e.valueAt('keyRate', i + 1)).filter((k) => k < 0.001).length;
  test('a lasting spending cut of 3% of GDP holds the key rate at zero for about 15 years, as the texts say, and output recovers only slowly', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'govSpending', value: -3 }], 240);
    const n = zeroMonths(e);
    expect(n).toBeGreaterThan(150);
    expect(n).toBeLessThan(200);
    const gap = (t: number) => 100 * (e.valueAt('output', t) / r.valueAt('output', t) - 1);
    expect(gap(120)).toBeGreaterThan(-4.5);
    expect(gap(120)).toBeLessThan(-3);
    expect(gap(240)).toBeGreaterThan(gap(228)); // still recovering
    expect(e.valueAt('depositRate', 120)).toBe(0);
    expect(e.valueAt('taxRate', 240)).toBeLessThan(r.valueAt('taxRate', 240) - 0.03); // the debt rule's tax cuts bring demand back
  });

  // Until padlocks (decision 0010) the tax lever was an offset the debt rule gave back, and +3
  // reached the zero bound for about four years. Moved, it is now held (locked) and nothing gives it
  // back, so a lasting rise keeps draining demand while the Taylor rule can cut no further: a
  // liquidity trap for most of twenty years at +3, as the lever's definition says.
  test('a 3-point tax rise held by hand, the Taylor rule acting, holds the key rate at zero for most of twenty years; one point for about four and a half; a small spending cut not at all', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'taxRate', value: 3 }], 240);
    const n = zeroMonths(e);
    expect(n).toBeGreaterThan(150);
    expect(n).toBeLessThan(220);
    expect(e.valueAt('output', 240)).toBeLessThan(r.valueAt('output', 240));
    const one = zeroMonths(pair(UNLOCKED, [{ t: 0, lever: 'taxRate', value: 1 }], 240)[0]);
    expect(one).toBeGreaterThan(30);
    expect(one).toBeLessThan(80);
    expect(zeroMonths(pair(UNLOCKED, [{ t: 0, lever: 'govSpending', value: -1 }], 240)[0])).toBe(0);
  });
});

// Behaviour that rests on this model's limitations rather than on theory: pinned here, not in the
// lever expectations (docs/audit/lever-vetting.md open item 10; decision 0008). If one of these
// fails, the limitation has changed: update the lever texts and the vetting record.
describe('known limitations, pinned (lever review REF-LA-INTENDED-LONGRUN and REF-KRF-LONGRUN-REVERSAL)', () => {
  const gap = (e: KernelEngine, r: KernelEngine, id: string, t: number) => 100 * (e.valueAt(id, t) / r.valueAt(id, t) - 1);
  const mean = (f: (t: number) => number, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => f(a + i)).reduce((s, x) => s + x, 0) / (b - a + 1);

  test('with expectations anchored to the target, a lasting boom leaves output above capacity and inflation above target for good (unlocked)', () => {
    const [e, r] = pair(UNLOCKED, [{ t: 0, lever: 'govSpending', value: 3 }], 240);
    expect(mean((t) => gap(e, r, 'output', t), 229, 240)).toBeGreaterThan(0);
    const infl = (x: KernelEngine, t: number) => Math.log(x.valueAt('price', t) / x.valueAt('price', t - 12));
    expect(mean((t) => infl(e, t) - infl(r, t), 229, 240)).toBeGreaterThan(0);
  });

  test('the lending appetite’s lasting gain is a result of the rules acting (unlocked); locked, the boost reverses after about twelve years', () => {
    const [a, ra] = pair(UNLOCKED, [{ t: 0, lever: 'lendingAppetite', value: 2 }], 240);
    expect(mean((t) => gap(a, ra, 'output', t), 229, 240)).toBeGreaterThan(0.7);
    const [m, rm] = pair(LOCKED, [{ t: 0, lever: 'lendingAppetite', value: 2 }], 240);
    expect(mean((t) => gap(m, rm, 'output', t), 25, 48)).toBeGreaterThan(2);
    expect(mean((t) => gap(m, rm, 'output', t), 229, 240)).toBeLessThan(0);
  });

  test('a key rate held above neutral, the debt rule held too, cools output for several years, then lifts it: the reversal the definition describes', () => {
    const [e, r] = pair(LOCKED, [{ t: 0, lever: 'keyRate', value: 4.75 }], 240);
    expect(mean((t) => gap(e, r, 'output', t), 24, 48)).toBeLessThan(-1);
    // about +3% over months 180–240 (the interest paid out is spent); a held cut mirrors it
    expect(mean((t) => gap(e, r, 'output', t), 180, 240)).toBeGreaterThan(1);
    const [c, rc] = pair(LOCKED, [{ t: 0, lever: 'keyRate', value: 0 }], 240);
    expect(mean((t) => gap(c, rc, 'output', t), 180, 240)).toBeLessThan(-1);
    const def = base.model.levers.find((l) => l.id === 'keyRate')!.definition;
    expect(def).toMatch(/reverses, after about eight years/);
  });
});

describe('the debt rule while only the key rate is locked (REF-KEYRATE-ALONE, decision 0016)', () => {
  /** The key rate held at `rate` with the debt rule acting, and the no-change run with the key rate locked. */
  const held = (rate: number, months: number): [KernelEngine, KernelEngine] => [
    runScenario(base, [{ t: 0, lever: 'keyRate', value: rate }], months).engine,
    runScenario(base, [{ t: 0, lever: 'keyRateLock', value: 1 }], months).engine,
  ];
  const gap = (e: KernelEngine, m: number) => e.valueAt('output', m) / e.baseline('output') - 1;
  /** The largest month-on-month move of the tax rate against the cycle, in points: up in months
   *  whose output is more than `band` below capacity, down in months more than `band` above. */
  const worstAgainstCycle = (e: KernelEngine, band: number, months: number) => {
    let worst = 0;
    for (let m = 2; m <= months; m++) {
      const d = 100 * (e.valueAt('taxRate', m) - e.valueAt('taxRate', m - 1));
      if (gap(e, m - 1) < -band) worst = Math.max(worst, d);
      if (gap(e, m - 1) > band) worst = Math.max(worst, -d);
    }
    return worst;
  };

  test('a held key rate does not run away: 0%, 2.25% and 4.75% settle within about 2% of output and 6% of the price level after 20 years', () => {
    // Before decision 0016 the debt rule leaned on debt alone: 2.25% held raised the price level
    // 19% and still accelerating, 4.75% cut output 13%, and 0% raised the price level 59%. The first
    // round of 0016 (a counter-cyclical term and a half-strength debt term) brought them to +4.8%,
    // −1.6% and +13.9% (price level, output, price level); keeping debt from moving the tax against
    // the cycle brings them to +1.8%, −0.4% and +3.7%.
    for (const rate of [0, 2.25, 4.75]) {
      const [e, r] = held(rate, 240);
      const out = (m: number) => 100 * (e.valueAt('output', m) / r.valueAt('output', m) - 1);
      const price = (m: number) => 100 * (e.valueAt('price', m) / r.valueAt('price', m) - 1);
      expect(Math.abs(out(240))).toBeLessThan(2);
      expect(Math.abs(price(240))).toBeLessThan(6);
      // and the price level's last year moves less than 1.2 times its move five years earlier
      expect(Math.abs(price(240) - price(228))).toBeLessThan(1.2 * Math.abs(price(180) - price(168)) + 0.05);
    }
  });

  test('debt never moves the tax rate against the cycle: no rise while output is more than 1% below capacity, no cut while it is more than a quarter point above', () => {
    // The review of decision 0016: at 4.75% held the rule raised the tax rate 1.7 points by month
    // 240 with output 1.6% below capacity, and at 0% cut it 1.6 points with output 2% above it.
    for (const rate of [0, 4.75, 10]) {
      const [e] = held(rate, 240);
      expect(worstAgainstCycle(e, 0.01, 240)).toBeLessThan(1e-9);
    }
    const [boom, r] = held(0, 240);
    expect(worstAgainstCycle(boom, 0.0025, 240)).toBeLessThan(1e-9);
    expect(100 * (boom.valueAt('taxRate', 60) - r.valueAt('taxRate', 60))).toBeGreaterThan(0.5); // +0.71: the rule leans against the boom
  });
});
