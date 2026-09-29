/**
 * The Iceland model's mortgages, charts, feed, parameter provenance and calibration checks, as
 * corrected after the audit of 29 September 2026 (docs/audit/2026-09-29-audit.md).
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { lockAll } from '../../src/core/scenario.ts';
import { createEngine } from '../../src/core/engine.ts';
import { runScenario } from '../../src/core/scenario.ts';
import { calibration, KNOWN_GAPS } from '../../src/models/iceland/calibration.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { withConcepts } from '../../src/models/index.ts';
import { stepByStep } from '../../src/models/iceland/testing.ts';

const model = compile(withConcepts(icelandModel));
/** A fresh engine with both policy levers locked (the old default Manual setting these tests were
 *  written for); a test that wants the rules acting unlocks them. */
const fresh = () => {
  const e = createEngine(model);
  lockAll(e);
  return e;
};

describe('Iceland feed: messages name only what their chart shows (audit L14)', () => {
  const rule = (id: string) => icelandModel.modules.flatMap((m) => m.feed ?? []).find((f) => f.id === id)!;

  test('older households’ income gain is not credited to interest when a transfer rise causes it', () => {
    const e = fresh();
    e.setLever('oldAgeTransfers', 1);
    e.step(12);
    const fired = e.feed().filter((f) => f.indicator === 'rdiO');
    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0].message).toBe(rule('oldGain').message);
    expect(rule('oldGain').message).not.toMatch(/interest/i);
  });

  test('tourism’s profit squeeze names no cause, since its chart cannot tell a sales slump from a wage rise', () => {
    // a slump in tourism: sales fall
    const slump = fresh();
    slump.setLever('tourism', -30);
    slump.step(12);
    const bySales = slump.feed().filter((f) => f.indicator === 'profitsXT');
    expect(bySales.length).toBeGreaterThan(0);
    expect(bySales[0].message).toBe(rule('squeeze').message);
    // a wage settlement: when the message fires, wages are 10% up and tourism's sales barely moved,
    // so higher wages are the cause
    const wages = fresh();
    wages.fire('wageSettlement', 10);
    wages.step(12);
    const byWages = wages.feed().filter((f) => f.indicator === 'profitsXT');
    expect(byWages.length).toBeGreaterThan(0);
    expect(byWages[0].message).toBe(rule('squeeze').message);
    const t = byWages[0].t;
    expect(wages.valueAt('wage', t) / wages.baseline('wage')).toBeGreaterThan(1.05);
    expect(Math.abs(wages.valueAt('exportVolumeTourism', t) / wages.baseline('exportVolumeTourism') - 1)).toBeLessThan(0.001);
    // so the message is true in both
    expect(rule('squeeze').message).not.toMatch(/wage|sales|demand/i);
  });
});

describe('Iceland parameters: provenance says what the value is (audit L16)', () => {
  const param = (id: string) => model.params.find((p) => p.id === id)!;

  test('non-residents’ bonds are derived: a Treasury-bond share applied to all government debt', () => {
    const p = param('bondW');
    expect(p.provenance.basis).toBe('derived');
    expect(p.provenance.note).toMatch(/broader aggregate/);
    expect(p.value).toBeCloseTo(0.072 * 56.7, 9);
  });

  test('pension funds’ bond share is the datum, with a note on the aggregate it is applied to', () => {
    const p = param('pfGovShare');
    expect(p.provenance.basis).toBe('data');
    expect(p.value).toBeCloseTo(0.586, 9);
    expect(p.provenance.note).toMatch(/all general-government debt/);
  });

  test('profits paid abroad are equity income from the leaf’s notes, not the leaf’s value of 1.25', () => {
    const p = param('fdiTarget');
    expect(p.provenance.basis).toBe('derived');
    expect(p.provenance.source).toMatch(/dividends ISK 11\.9 bn \+ reinvested earnings 3\.4 bn/);
    expect(p.value).toBeCloseTo((11.9 + 3.4) / 4576.629 * 100, 2);
  });
});

describe('Iceland charts: one GDP base for every "% of GDP" chart (design L2/L3, audit L17)', () => {
  const unit = (id: string) => model.indicators.find((i) => i.id === id)!.unit;

  test('GDP over the past 12 months is the average of every step of this month and the 11 before, and equals GDP at baseline', () => {
    // Two kernel steps a month (decision 0011): the year is 24 steps, each read as it happens.
    const gdp: number[] = [];
    const e = createEngine(model, { testHooks: { afterSubstep: (_m, _s, r) => void gdp.push(r.value('nominalGDP')) } });
    expect(e.value('gdpTrailing12')).toBeCloseTo(e.value('nominalGDP'), 12);
    e.fire('wageSettlement', 10);
    e.step(18);
    const N = model.def.substeps ?? 1;
    expect(N).toBe(2);
    const year = gdp.slice(-12 * N);
    expect(e.value('gdpTrailing12')).toBeCloseTo(year.reduce((a, b) => a + b, 0) / year.length, 12);
    expect(e.value('gdpTrailing12')).not.toBeCloseTo(e.value('nominalGDP'), 3); // prices are rising, so it lags
  });

  test('credit-flow charts divide by nominal GDP and share the "pp of GDP" unit of their neighbours', () => {
    const e = fresh();
    e.fire('wageSettlement', 10);
    e.setLever('lendingAppetite', 1);
    e.step(14);
    const Y = e.value('nominalGDP');
    expect(Math.abs(Y - 100)).toBeGreaterThan(1); // the test means something only if GDP has moved
    // a flow chart shows the change from baseline, where each flow is zero
    expect(e.indicator('netMortgage')).toBeCloseTo((e.value('netMortgageLending') / Y) * 100, 12);
    expect(e.indicator('creditImpulse')).toBeCloseTo((e.value('creditImpulse') / Y) * 100, 12);
    expect(e.indicator('creditImpulseTotal')).toBeCloseTo((e.value('creditImpulseTotal') / Y) * 100, 12);
    for (const id of ['netMortgage', 'creditImpulse', 'creditImpulseTotal', 'govBalance', 'currentAccount', 'mortgageDebt', 'govDebt']) expect(unit(id)).toBe('pp of GDP');
  });

  test('debt charts and the debt rule divide debt by GDP over the past 12 months', () => {
    // Each kernel step's debt, treasury cash and trailing GDP, as they are after it (decision 0011:
    // two steps a month).
    const steps: { debt: number; cash: number; trailing: number }[] = [];
    const e = createEngine(model, {
      testHooks: { afterSubstep: (_m, _s, r) => void steps.push({ debt: r.stock('govBonds', 'G') + r.stock('indexedBonds', 'G'), cash: r.stock('treasuryAccount', 'G'), trailing: r.value('gdpTrailing12') }) },
    });
    e.fire('wageSettlement', 10);
    e.step(14);
    const debt = e.stock('govBonds', 'G') + e.stock('indexedBonds', 'G');
    const debt0 = e.baseStock('govBonds', 'G') + e.baseStock('indexedBonds', 'G');
    expect(e.indicator('govDebt')).toBeCloseTo((debt / e.value('gdpTrailing12')) * 100 - debt0, 9);
    const mort = ['mortgagesN', 'mortgagesI'].flatMap((i) => ['B', 'PF'].map((l) => e.stock(i, l))).reduce((a, b) => a + b, 0);
    const mort0 = ['mortgagesN', 'mortgagesI'].flatMap((i) => ['B', 'PF'].map((l) => e.baseStock(i, l))).reduce((a, b) => a + b, 0);
    expect(e.indicator('mortgageDebt')).toBeCloseTo((mort / e.value('gdpTrailing12')) * 100 - mort0, 9);
    // the debt rule reads the ratio at the start of its step (debt and treasury cash above its
    // target after the step before) over the year to a month before (trailing GDP N steps earlier)
    const N = model.def.substeps ?? 1;
    const last = steps.length - 1;
    const tga = e.influences('debtRatio').params.find((p) => p.id === 'tga')!.value;
    const start = steps[last - 1];
    expect(e.value('debtRatio')).toBeCloseTo((start.debt - (start.cash - tga)) / steps[last - N].trailing, 12);
  });
});

describe('Iceland mortgages: the loan-to-value cap applies to every home bought this year (audit M3, lever review credit-ltv-cap-exempts-replacement-lending)', () => {
  test('first-time buyers get 10 points more, from Rules 1131/2025, and the lever says so from the parameter', () => {
    const p = model.params.find((x) => x.id === 'ltvYExtra')!;
    expect(p.value).toBe(0.1);
    expect(p.provenance.basis).toBe('data');
    expect(p.provenance.source).toMatch(/1131\/2025/);
    expect(model.levers.find((l) => l.id === 'ltvCap')!.description).toMatch(/10 points more/);
  });

  test('the rule in force is the default: 80%, from Rules 1131/2025, on a lever from 50% to 100% with no “off”', () => {
    const p = model.params.find((x) => x.id === 'ltvLimit')!;
    expect(p.value).toBe(0.8);
    expect(p.provenance.basis).toBe('data');
    expect(p.provenance.source).toMatch(/1131\/2025/);
    const lever = model.levers.find((l) => l.id === 'ltvCap')!;
    expect([lever.default, lever.min, lever.max]).toEqual([80, 50, 100]);
    expect(lever.definition).not.toMatch(/replace repayments|switches it off/);
  });

  test('the cap is the limit times all homes bought this year, from older households and from each other, with no exemption for loans that replace repayments', () => {
    const e = fresh();
    e.setLever('lendingAppetite', 3);
    e.step(6);
    for (const [g, limit] of [['Y', 0.9], ['W', 0.8]] as const) {
      expect(e.value(`ltvCap${g}`)).toBeCloseTo(limit * e.value(`grossHomePurchases${g}`), 12);
      // homes bought from older households plus the group's own homes that change hands
      const t = Object.fromEntries(e.influences(`grossHomePurchases${g}`).terms.map((x) => [x.id, x.value]));
      expect(t.fromOlder).toBeCloseTo(e.value(`homePurchases${g}`), 12);
      expect(t.turnover).toBeGreaterThan(t.fromOlder);
      expect(e.value(`grossHomePurchases${g}`)).toBeCloseTo(t.fromOlder + t.turnover, 12);
      const rule = icelandModel.modules.flatMap((m) => m.rules ?? []).find((r) => r.id === `ltvCap${g}`)!;
      expect(rule.inputs).not.toContain(`mortgageRepayment${g}`);
    }
  });

  test('a tighter cap lowers lending on its own, with no push from banks: 60% cuts working-age lending, debt and house prices within a year', () => {
    const [tight, calm] = [fresh(), fresh()];
    tight.setLever('ltvCap', 60);
    tight.step(12);
    calm.step(12);
    expect(tight.value('mortgageLendingW')).toBeLessThan(0.95 * calm.value('mortgageLendingW'));
    expect(tight.indicator('mortgageDebt')).toBeLessThan(calm.indicator('mortgageDebt') - 0.1);
    expect(tight.indicator('realHousePrice')).toBeLessThan(calm.indicator('realHousePrice') - 0.1);
    expect(tight.indicator('broadMoney')).toBeLessThan(calm.indicator('broadMoney'));
  });
});

describe('Iceland mortgages: the debt-service cap is a share of income after tax (audit M4)', () => {
  test('the baseline cap is unchanged: new lending, amortisation plus the loans paid off as homes are sold, uses 60% of it', () => {
    const e = fresh();
    for (const g of ['Y', 'W']) expect(e.baseline(`mortgageLending${g}`) / e.baseline(`dstiCap${g}`)).toBeCloseTo(0.6, 12);
  });

  test('an income-tax rise of 5 pp tightens the cap as much as it cuts borrowers’ income after tax', () => {
    const e = fresh();
    e.setLever('incomeTax', 5);
    e.step(2); // the cap reads last month's income
    // Income after tax includes the tax-free child and housing benefits (review SP-4).
    const taxFree = 1 - model.params.find((p) => p.id === 'famTaxableShare')!.value;
    for (const g of ['Y', 'W']) {
      const afterTax = (m: number) => e.valueAt(`grossIncome${g}`, m) - e.valueAt(`incomeTax${g}`, m) + taxFree * e.valueAt(`familyBenefits${g}`, m);
      const capMove = e.value(`dstiCap${g}`) / e.baseline(`dstiCap${g}`) - 1;
      const paymentMove = e.baseline('stressTestPayment') / e.value('stressTestPayment') - 1;
      const incomeMove = afterTax(1) / afterTax(0) - 1;
      expect((1 + capMove) / (1 + paymentMove) - 1).toBeCloseTo(incomeMove, 12);
      expect(incomeMove).toBeLessThan(-0.07); // about −8%: most of it is the tax itself
    }
  });
});

describe('Iceland transfers: old-age and disability pensions are TR’s payments (audit L15)', () => {
  const v = (id: string) => model.params.find((p) => p.id === id)!.value;

  test('TR old-age plus disability pensions, 4.21% of GDP; older households get the old-age part', () => {
    expect(v('trOA')).toBeCloseTo(2.48 + 1.73, 9);
    expect(v('oaShareO')).toBeCloseTo(2.48 / 4.21, 9);
  });

  test('both are derived from two TR leaves, so their provenance is not a single datum’s (audit L16)', () => {
    for (const id of ['trOA', 'oaShareO']) {
      const p = model.params.find((q) => q.id === id)!.provenance;
      expect(p.basis).toBe('derived');
      expect(p.source).toMatch(/pensions\.public_old_age_pension_pct_gdp/);
      expect(p.source).toMatch(/pensions\.public_disability_pension_pct_gdp/);
      expect(p.note).toMatch(/2\.48/);
    }
  });

  test('family and other benefits are the rest of social benefits, so the cash channels still add up to item 27', () => {
    expect(v('trOA') + v('trFam') + v('ueTarget')).toBeCloseTo(7.28, 9);
    expect(model.params.find((p) => p.id === 'trFam')!.provenance.basis).toBe('derived');
  });
});

describe('Iceland calibration: each check runs the experiment its source describes (audit M12/M20, M13, M14/M21, L26)', () => {
  const check = (id: string) => calibration.find((c) => c.id === id)!;
  const run = (id: string) => runScenario(fresh(), check(id).scenario, check(id).months);

  test('the rate checks hold the key rate 1 pp above baseline for four quarters, then the rule takes over', () => {
    const r = run('rate-output-trough');
    const rate = r.series('keyRate');
    for (let m = 1; m <= 12; m++) expect(rate[m]).toBeCloseTo(1, 12);
    expect(r.value('keyRate', 13)).toBeCloseTo(r.value('ruleRate', 13), 12); // the rule's rate from month 13
    for (const id of ['rate-output-trough', 'rate-output-timing', 'rate-inflation-trough', 'rate-inflation-timing', 'rate-krona']) expect(check(id).label).toMatch(/^Key rate held \+1 pp for 4 quarters, then the rule/);
  });

  test('the fiscal multiplier is measured on purchases from firms only: public pay does not move', () => {
    const r = run('fiscal-output-year1');
    expect(r.value('publicEmployment', 12)).toBeCloseTo(r.value('publicEmployment', 0), 12);
    expect(check('fiscal-output-year1').range).toEqual([0.3, 0.6]);
    expect(check('fiscal-output-year1').source).toMatch(/0\.3–0\.6%/);
  });

  test('ranges quoted by a source are the source’s: wage key-rate peak +1 to +1.5 pp; price level after 6 years within 25% of the cited 4%', () => {
    expect(check('wage-key-rate-peak').range).toEqual([1, 1.5]);
    expect(check('wage-price-level-6y').range).toEqual([3, 5]);
    expect(check('wage-price-level-6y').source).toMatch(/about 4% higher/);
  });

  test('the króna check measures what QMM reports, the rise on impact (first quarter), not the peak', () => {
    const r = run('rate-krona');
    const k = r.series('krona');
    expect(check('rate-krona').measure(r)).toBeCloseTo((k[1] + k[2] + k[3]) / 3, 12);
    expect(check('rate-krona').source).toMatch(/0\.67% on impact/);
    expect(check('rate-krona').range).toEqual([0.3, 1.5]); // v1's band: no source gives a band around 0.67
  });

  test('known gaps are real: each check passes its v1 band but lies outside the range its source cites', () => {
    expect(Object.keys(KNOWN_GAPS).length).toBeGreaterThan(0);
    for (const [id, gap] of Object.entries(KNOWN_GAPS)) {
      const c = check(id);
      const v = c.measure(run(id));
      expect(v).toBeGreaterThanOrEqual(c.range[0]);
      expect(v).toBeLessThanOrEqual(c.range[1]);
      // if this fails, calibration has closed the gap: narrow the check's range to `cited` and remove the entry
      if (gap.cited) expect(v < gap.cited[0] || v > gap.cited[1]).toBe(true);
      else expect(gap.why).toMatch(/Tripwire: /);
      expect(c.label).toMatch(/known gap/);
      expect(c.source).toMatch(/KNOWN GAP/);
    }
    // and every check that says it has a known gap is listed
    for (const c of calibration) if (/known gap/.test(c.label)) expect(KNOWN_GAPS[c.id]).toBeDefined();
  });

  test('the rule takes over from the rate held: the key rate moves one month’s smoothed step in month 13, not to the path the rule followed while it was not in charge (lever review MON-2)', () => {
    const r = run('rate-inflation-trough');
    const lamPol = model.params.find((q) => q.id === 'lamPol')!.value;
    // two kernel steps a month (decision 0011): each closes ks of the gap, a month's share compounded
    const N = model.def.substeps ?? 1;
    const ks = 1 - Math.exp(-lamPol / 12 / N);
    const { engine, steps } = stepByStep(fresh(), (x) => ({ key: x.value('keyRate'), target: x.value('ruleTarget') }));
    engine.load({ modelId: 'iceland', events: check('rate-inflation-trough').scenario, months: 24 });
    expect(steps.length).toBe(24 * N);
    // month 13: from last month's held rate, each step + ks × (where the rule is heading − the rate before it)
    const held = r.value('keyRate', 12);
    expect(engine.valueAt('keyRate', 12)).toBe(held);
    let prev = held;
    for (const x of steps.slice(12 * N, 13 * N)) {
      expect(x.key).toBeCloseTo(prev + ks * (x.target - prev), 12);
      prev = x.key;
    }
    expect(r.value('keyRate', 13)).toBe(prev);
    expect(Math.abs(r.value('keyRate', 13) - held)).toBeLessThan(0.0025 + 1e-9); // about 0.2 pp, not 1.5
    // and it keeps easing gradually: no step moves the key rate by more than ks of the gap
    for (let j = 12 * N + 1; j < 24 * N; j++) expect(Math.abs(steps[j].key - steps[j - 1].key)).toBeLessThanOrEqual(ks * Math.abs(steps[j].target - steps[j - 1].key) + 1e-12);
    // the rate checks are inside their bands without a drop: the output trough falls in QMM's quarter 5
    expect(check('rate-output-timing').measure(r)).toBe(5);
    const v = check('rate-inflation-trough').measure(r);
    expect(v).toBeGreaterThanOrEqual(check('rate-inflation-trough').range[0]);
    expect(KNOWN_GAPS['rate-output-timing']).toBeUndefined();
    expect(check('rate-inflation-trough').source).not.toMatch(/drops about 1\.5 pp in month 13/);
    // the inflation trough is near QMM's −0.24 pp since housing costs follow market rents (MON-4);
    // the output trough is about 25% deeper than QMM's −0.41%, and says so (known gap)
    expect(KNOWN_GAPS['rate-inflation-trough']).toBeUndefined();
    expect(Math.abs(v + 0.24)).toBeLessThan(0.03);
    expect(KNOWN_GAPS['rate-output-trough']!.cited).toEqual([-0.41, -0.41]);
    expect(check('rate-output-trough').measure(r) / -0.41).toBeGreaterThan(1.2);
  });

  test('the rate troughs: the output trough’s extra depth over QMM comes through the króna (KNOWN_GAPS); the inflation trough is spread over the króna, housing and slack', () => {
    const trough = (disableTerms: string[]) => {
      const r = runScenario(fresh().fork({ disableTerms }), check('rate-inflation-trough').scenario, 72);
      return [check('rate-inflation-trough').measure(r), check('rate-output-trough').measure(r)];
    };
    const [pi, y] = trough([]);
    // the króna's response to the rate held at baseline: the output trough near QMM's −0.41%
    const [piK, yK] = trough(['logExchangeRate.carry', 'logExchangeRate.portfolio']);
    expect(Math.abs(yK + 0.41)).toBeLessThan(0.05);
    expect(y).toBeLessThan(yK - 0.1);
    // inflation: the króna and market rents each carry a part (about 0.09 and 0.08 pp), capacity pressure little
    expect(piK - pi).toBeGreaterThan(0.05);
    expect(trough(['cpi.housing'])[0] - pi).toBeGreaterThan(0.05);
    expect(Math.abs(trough(['domesticPrice.capacity'])[0] - pi)).toBeLessThan(0.05);
  });

  test('switching to unlocked after a long hold far from the rule is gradual too: 6% for two years, then the rule', () => {
    const e = fresh();
    e.setLever('keyRate', 6);
    e.step(24);
    e.setLever('keyRateLock', 0);
    e.setLever('incomeTaxLock', 0);
    e.step(1);
    // v1's shadow path took it from 6% to about 0.2% in one month
    expect(e.value('keyRate')).toBeGreaterThan(0.05);
    expect(e.value('keyRate')).toBeLessThan(0.06);
  });

  test('a króna held about 10% weaker passes through to the CPI as CBI WP85 gives within a year, and the pass-through check agrees with it (review E6)', () => {
    // hold the realised depreciation near 10% by topping up the sentiment shock every month (the rules acting, as in the check)
    const e = fresh();
    lockAll(e, false);
    const krona: number[] = [];
    const cpi: number[] = [];
    for (let m = 0; m < 36; m++) {
      const now = e.indicator('krona');
      e.fire('kronaShock', m === 0 ? -10 : 100 * (0.9 / (1 + now / 100) - 1));
      e.step(1);
      krona.push(e.indicator('krona'));
      cpi.push(e.indicator('priceLevel'));
    }
    // krónur per unit of foreign currency, % above baseline, averaged over the months so far
    const dearer = (m: number) => krona.slice(0, m).reduce((s, k) => s + 100 * (1 / (1 + k / 100) - 1), 0) / m;
    const pass = (m: number) => cpi[m - 1] / dearer(m);
    expect(dearer(24)).toBeGreaterThan(9);
    const c = check('krona-pass-through-year1');
    expect(c.range).toEqual([0.15, 0.23]); // WP85: 0.15 within the quarter, 0.23 in the long run
    expect(pass(12)).toBeGreaterThanOrEqual(0.15);
    expect(pass(12)).toBeLessThanOrEqual(0.23);
    // the check's fading shock gives nearly the same ratio as the held depreciation
    expect(Math.abs(c.measure(run('krona-pass-through-year1')) - pass(12))).toBeLessThan(0.03);
    // as its source says: slower than WP85 within the quarter, and a little past WP85's long-run 0.23 later,
    // levelling off below the IMF's 0.4 at 36 months: wages no longer chase a lasting depreciation (trade-nominal-drift)
    expect(pass(3)).toBeLessThan(0.15);
    expect(pass(24)).toBeGreaterThan(0.25);
    expect(pass(24)).toBeLessThan(0.35);
    expect(pass(36)).toBeGreaterThan(0.25);
    expect(pass(36)).toBeLessThan(0.35);
    expect(pass(36) - pass(24)).toBeLessThan(0.04);
    expect(c.source).toMatch(/0\.30 after two years and 0\.33 after three/);
    expect(KNOWN_GAPS['krona-pass-through-year1']).toBeUndefined();
  });

  test('world prices +10% held raise the CPI within WP85’s 1.5–2.3% in the first year and no more than 3% after two (review E6)', () => {
    const r = run('world-prices-cpi-year1');
    const p = r.series('priceLevel');
    expect(check('world-prices-cpi-year1').range).toEqual([1.5, 2.3]);
    expect(p[12]).toBeGreaterThanOrEqual(1.5);
    expect(p[12]).toBeLessThanOrEqual(2.3);
    expect(p[24]).toBeLessThanOrEqual(3); // the upper edge of v1's 8-quarter band for the same shock
    expect(p[24]).toBeGreaterThan(p[12]); // still rising: wages and domestic prices catch up
    expect(KNOWN_GAPS['world-prices-cpi-year1']).toBeUndefined();
    // only the part bought abroad follows world prices: what buyers pay for imported goods is
    // (1 − distM) × import prices + distM × last month's domestic prices
    const distM = model.params.find((q) => q.id === 'distM')!.value;
    for (const m of [12, 24]) expect(r.value('deliveredImportPrice', m)).toBeCloseTo((1 - distM) * r.value('importPrice', m) + distM * r.value('domesticPrice', m - 1), 12);
    expect(100 * (r.value('deliveredImportPrice', 24) - 1)).toBeLessThan(100 * (r.value('importPrice', 24) - 1));
  });
});
