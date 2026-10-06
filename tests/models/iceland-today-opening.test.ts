/**
 * Iceland today, the opening (docs/design/today-opening.md §8): T1 the balances and residuals, T2
 * month 0, T4 the month-1 continuity, T10 the committed solution against a fresh solve, T11 the
 * report's warnings, and the extract file against the snapshot.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { compile } from '../../src/core/compile.ts';
import { anchorsOf, openingBaseline, openingFailures } from '../../src/core/opening.ts';
import { lockAll } from '../../src/core/scenario.ts';
import { createRegisteredEngine, withConcepts } from '../../src/models/index.ts';
import { initialBaselineForGrowingModel } from '../../src/models/iceland/growth.ts';
import { GDP_BN } from '../../src/models/iceland/util.ts';
import { COMMITTED_SOLUTION, EXTRACT, record } from '../../src/models/iceland/today/data.ts';
import { RECORD_IDS } from '../../src/models/iceland/today/records.ts';
import { CONDITIONAL_GAPS_ON, createIcelandTodayModel, ICELAND_OPENING_ID, icelandTodayModel } from '../../src/models/iceland/today/index.ts';

const U = GDP_BN / 100;
const model = withConcepts(icelandTodayModel);
const engine = createRegisteredEngine(model);
const report = engine.opening!;
const m = engine.model;
const stock = (ins: string, pl: string, t = 0) => {
  const j = m.instrumentIndex.get(ins)! * m.NP + m.playerIndex.get(pl)!;
  const x = engine.positionsAt(t)[j];
  return m.role[j] === 2 ? -x : x;
};
const bn = (ins: string, pl: string) => stock(ins, pl) * U;
const v = (id: string) => record(id).value;

describe('the extract file', () => {
  test('carries every record the opening reads, copied verbatim from the snapshot', () => {
    const snapshot = JSON.parse(readFileSync(new URL('../../data/iceland/observations-2026-09-30.json', import.meta.url), 'utf8')) as { records: Record<string, unknown>[] };
    const byId = new Map(snapshot.records.map((r) => [r.id as string, r]));
    expect(EXTRACT.records.map((r) => r.id)).toEqual([...RECORD_IDS].sort());
    for (const r of EXTRACT.records) {
      const s = byId.get(r.id)!;
      expect(s).toBeDefined();
      for (const f of Object.keys(r)) expect({ id: r.id, [f]: (r as unknown as Record<string, unknown>)[f] }).toEqual({ id: r.id, [f]: s[f] });
    }
    expect(() => record('financial.depositOutstandingWeightedRate')).toThrow(/has no value/);
    expect(() => record('no.such.record')).toThrow(/no record/);
    expect(report.recordsUsed.every((id) => RECORD_IDS.includes(id))).toBe(true);
    expect(report.recordsUsed.length).toBeGreaterThan(100);
  });
});

describe('T1: the opening balances', () => {
  test('every financial instrument balances, every position has the right sign and a basis of data, residual, mirror or allocated', () => {
    const pos = engine.positionsAt(0);
    m.instruments.forEach((ins, i) => {
      if (ins.kind !== 'financial') return;
      let s = 0;
      for (let p = 0; p < m.NP; p++) s += pos[i * m.NP + p];
      expect(Math.abs(s)).toBeLessThanOrEqual(1e-9);
    });
    expect(engine.checks().signViolations).toEqual([]);
    for (const p of report.positions) {
      expect(['data', 'residual', 'mirror', 'allocated']).toContain(p.source.basis);
      if (p.source.basis === 'allocated') expect(p.source.note).toMatch(/Key:/);
      expect(p.money).toBeCloseTo(p.value * U, 9);
    }
    // 15 fills: one per financial instrument
    expect(report.positions.filter((p) => p.source.basis === 'mirror').length).toBe(m.instruments.filter((i) => i.kind === 'financial').length);
  });

  test('the residuals, in ISK bn, with the banks holding the Treasury’s foreign-currency debt (decision 0018)', () => {
    const near = (x: number, want: number, tol = 0.5) => expect(Math.abs(x - want)).toBeLessThanOrEqual(tol);
    near(bn('deposits', 'B'), v('financial.depositsTotal') - v('financial.depositsGovernment')); // 3,671.9
    near(bn('reserves', 'B'), 507.2);
    near(bn('govBonds', 'B'), 1010.6 + v('financial.centralTreasuryForeignDebt')); // 1,413.6
    near(bn('bankBonds', 'B'), 1332.1 + v('financial.centralTreasuryForeignDebt')); // 1,735.1
    near(bn('shares', 'PF'), 2088.4 - v('financial.centralTreasuryForeignDebt')); // 1,685.4
    near(bn('businessLoans', 'FR'), 1038.2);
    near(bn('mortgagesN', 'HW'), 812.6);
    near(bn('mortgagesI', 'HW'), 1463.9);
    near(bn('pensionRights', 'HO'), 4221.7);
    for (const r of ['reserves', 'bankBonds', 'shares', 'businessLoans', 'mortgagesN', 'mortgagesI', 'pensionRights', 'govBonds', 'deposits']) for (const p of report.positions.filter((x) => x.instrument === r)) expect(p.value).toBeGreaterThanOrEqual(-1e-9);
  });

  test('with the plan’s first mapping (non-residents hold the foreign debt as króna bonds) the residuals are the plan’s', () => {
    const alt = withConcepts(createIcelandTodayModel({ foreignDebtHolder: 'W', solution: {} }));
    const e = createRegisteredEngine(alt);
    const am = e.model;
    const at = (ins: string, pl: string) => {
      const j = am.instrumentIndex.get(ins)! * am.NP + am.playerIndex.get(pl)!;
      const x = e.positionsAt(0)[j];
      return (am.role[j] === 2 ? -x : x) * U;
    };
    expect(Math.abs(at('govBonds', 'B') - 1010.6)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(at('govBonds', 'W') - 516.1)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(at('bankBonds', 'B') - 1332.1)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(at('shares', 'PF') - 2088.4)).toBeLessThanOrEqual(0.5);
    expect(openingFailures(e.opening!)).toEqual([]);
  });
});

describe('T2: month 0', () => {
  test('every gated check passes, every rule reproduces the values the opening holds, and no regime is active beyond the anchor’s', () => {
    expect(openingFailures(report)).toEqual([]);
    expect(report.checks.filter((c) => c.gate).length).toBeGreaterThanOrEqual(28);
    expect(report.regimes.every((r) => r.onAnchor)).toBe(true);
    expect(report.solve).toMatchObject({ mode: 'check', unknowns: 6 + CONDITIONAL_GAPS_ON.length, iterations: 0 });
    expect(report.solve.residual).toBeLessThan(1e-9);
  });

  test('the headline values: 8.00%, 5.9%, 4.3%, 5.8%, the króna, house prices, debt, mortgages, pension assets, deposits, GDP', () => {
    const near = (id: string, want: number, tol: number) => expect(Math.abs(engine.valueAt(id, 0) - want)).toBeLessThanOrEqual(tol);
    near('keyRate', 0.08, 1e-12);
    near('inflation12', 0.059, 5e-4);
    near('expectedInflation', 0.043, 5e-4);
    near('unemployment', 0.058, 1e-3);
    near('exchangeRate', v('external.fx.tradeWeightedIndex.relative2025'), 1e-9);
    near('housePrice', v('macro.housePriceRebased2025Average'), 1e-9);
    near('bondRate', 0.0749, 5e-4);
    near('foreignRate', 0.03375, 1e-12);
    near('nominalGDP', (v('macro.gdpNominalRolling4Q') * 1.04078) / U, 0.002);
    expect(Math.abs(bn('govBonds', 'G') + bn('indexedBonds', 'G') - 2800.694)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(bn('mortgagesN', 'HY') + bn('mortgagesN', 'HW') + bn('mortgagesI', 'HY') + bn('mortgagesI', 'HW') - 2936.33)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(bn('deposits', 'HY') + bn('deposits', 'HW') + bn('deposits', 'HO') - 2112.96)).toBeLessThanOrEqual(0.1);
    // the ISK conversion of the level reports is the fixed unit
    expect(Math.abs(engine.levels('govDebtAmount')[0] - 2800.7)).toBeLessThanOrEqual(0.1);
    // the four growth indices open at 100
    for (const id of ['referenceWorldDemand', 'referencePopulation', 'actualProductiveCapacity', 'fundedPhysicalCapital']) expect(engine.levels(id)[0]).toBeCloseTo(100, 9);
    // the debt chart's ratio and the published one, side by side
    expect(engine.valueAt('debtRatio', 0)).toBeCloseTo(2800.694 / 5205.97, 3);
  });

  test('every re-set parameter with a growth anchor equals its anchor', () => {
    const byId = new Map(report.params.map((p) => [p.id, p.value]));
    for (const [id, x] of byId) if (byId.has(`growthAnchor.${id}`)) expect({ id, anchor: byId.get(`growthAnchor.${id}`) }).toEqual({ id, anchor: x });
    expect([...byId.keys()].filter((id) => id.startsWith('growthAnchor.')).length).toBeGreaterThanOrEqual(13);
  });

  test('the histories: the GDP window reproduces the rolling four quarters, wages grew 5.7% and the CPI 5.9% over the year', () => {
    const km = compile(model);
    const state = model.opening!.build(anchorsOf(km, initialBaselineForGrowingModel(model)));
    const gdp = state.vars.nominalGDP;
    // the window is months −14 to −3: the history holds 12 months, log-linear, and the two oldest
    // lie on the same path
    const rate = Math.pow(gdp.value / gdp.history![0], 12) - 1;
    const average = Array.from({ length: 12 }, (_, k) => gdp.value / Math.pow(1 + rate, (3 + k) / 12)).reduce((s, x) => s + x, 0) / 12;
    for (let q = 0; q < 12; q++) expect(gdp.history![q] / (gdp.value / Math.pow(1 + rate, (q + 1) / 12))).toBeCloseTo(1, 9);
    expect(Math.abs((average * U) / v('macro.gdpNominalRolling4Q') - 1)).toBeLessThan(1e-9);
    expect(state.vars.wage.value / state.vars.wage.history![11] - 1).toBeCloseTo(0.057, 9);
    expect(state.vars.cpi.value / state.vars.cpi.history![11] - 1).toBeCloseTo(0.059, 9);
    expect(gdp.history!.length).toBe(12);
    expect(model.opening!.id).toBe(ICELAND_OPENING_ID);
    expect(model.calendar).toEqual({ month0: { year: 2026, month: 9 } });
    expect(model.moneyUnit!.perUnit).toBeCloseTo(49.41211, 9);
  });
});

describe('T4: month 1 carries on from today', () => {
  test('the solved rows hold to 1e-9 in the engine’s month 1', () => {
    const e = createRegisteredEngine(model);
    e.step(1);
    expect(Math.abs(e.value('wageGrowth') - 0.057)).toBeLessThan(1e-9);
    expect(Math.abs(12 * Math.log(e.value('cpi') / e.valueAt('cpi', 0)) - 0.057)).toBeLessThan(1e-9);
    expect(Math.abs(12 * (e.value('logExchangeRate') - e.valueAt('logExchangeRate', 0)) - Math.log1p(v('financial.tradeWeightedIndexNarrowYoY') / 100))).toBeLessThan(1e-9);
    expect(Math.abs(e.value('logRealHousePrice') - e.valueAt('logRealHousePrice', 0))).toBeLessThan(1e-9);
    for (const g of ['Y', 'W', 'O']) expect(Math.abs(e.valueAt(`unemployment${g}`, 0) - e.valueAt('unemployment', 0) * (({ Y: 0.058, W: 0.035, O: 0.012 }[g] as number) / 0.058) * (0.058 / 0.04244502866102443))).toBeLessThan(2e-3);
  });

  test('the continuity table: every row within its bound, except retail firms’ borrowing, which opens at its growth-path flow and steps up once more (recorded, decision 0018)', () => {
    const failing = report.month1.filter((r) => !r.pass).map((r) => r.id);
    expect(failing).toEqual(['borrowingFR']);
    const fr = report.month1.find((r) => r.id === 'borrowingFR')!;
    expect(Math.abs(fr.month1 - fr.month0)).toBeLessThan(0.6);
    expect(Math.abs(fr.month2 - fr.month1)).toBeLessThan(0.3);
    for (const id of ['keyRate', 'inflation', 'wageGrowth', 'logExchangeRate', 'realConsumption', 'businessInvestment', 'employment', 'logRealHousePrice', 'housingCost', 'lenderConfidence', 'creditApprovalRatio']) expect(report.month1.find((r) => r.id === id)?.pass).toBe(true);
    // the conditional families: only house prices on
    expect(CONDITIONAL_GAPS_ON).toEqual(['housePrices']);
    expect(report.gaps.map((g) => g.group)).toEqual(['wage', 'labourSupplyY', 'labourSupplyW', 'labourSupplyO', 'markup', 'krona', 'housePrices']);
  });

  test('with every padlock closed the opening is the same month 0 and the rates hold', () => {
    const e = createRegisteredEngine(model);
    lockAll(e);
    e.step(2);
    expect(Math.abs(e.value('keyRate') - 0.08)).toBeLessThan(1e-12);
    for (const vd of m.vars) expect(Object.is(e.valueAt(vd.id, 0), engine.valueAt(vd.id, 0))).toBe(true);
  });
});

describe('T10: the committed solution', () => {
  test('check mode at load, and a fresh solve agrees with the committed values to 1e-9 relative', () => {
    const fresh = withConcepts(createIcelandTodayModel({ solution: {} }));
    const km = compile(fresh);
    const o = openingBaseline(km, fresh.opening!, initialBaselineForGrowingModel(fresh), { mode: 'solve' });
    expect(o.report.solve.mode).toBe('solve');
    expect(o.report.solve.condition).toBeLessThan(1e4);
    expect(Object.keys(o.report.solve.solution).sort()).toEqual(Object.keys(COMMITTED_SOLUTION).sort());
    for (const [id, x] of Object.entries(COMMITTED_SOLUTION)) expect({ id, agree: Math.abs(o.report.solve.solution[id] - x) / Math.max(1e-12, Math.abs(x)) < 1e-9 }).toEqual({ id, agree: true });
  });

  test('the same opening and scenario give identical numbers', () => {
    const a = createRegisteredEngine(model),
      b = createRegisteredEngine(model);
    a.setLever('keyRate', 7);
    b.setLever('keyRate', 7);
    a.step(12);
    b.step(12);
    for (const vd of m.vars) expect(Object.is(a.value(vd.id), b.value(vd.id))).toBe(true);
  });
});

describe('T11: the report’s warnings', () => {
  const has = (re: RegExp) => report.warnings.some((w) => re.test(w));
  test('the guards, bridges, placeholders and cross-checks are listed, and nothing fails', () => {
    for (const g of ['labourSupplyY', 'labourSupplyW', 'labourSupplyO']) expect(has(new RegExp(`Start gap '${g}' is 0\\.[23]\\d* of its rules' values, beyond its guard 0\\.25`))).toBe(true);
    expect(has(/Start gap 'wage'/)).toBe(false); // −3.3 points, within 5
    expect(has(/Start gap 'krona'/)).toBe(false); // −0.093 log points, within 0.15
    for (const bridge of ['housingCost', 'importPrice', 'wage']) expect(has(new RegExp(`'${bridge}' is a bridge`))).toBe(true);
    for (const p of ['worldPrice0', 'fishPrice0', 'aluminiumPrice0', 'iFnow']) expect(has(new RegExp(`Parameter '${p}' is a bridge`))).toBe(true);
    for (const x of ['reservesCrossCheck', 'bankBondsCrossCheck', 'pfSharesCrossCheck', 'homesCrossCheck', 'niipCrossCheck', 'capitalRatioCrossCheck', 'mortgageInterestCrossCheck', 'governmentInterestCrossCheck', 'pensionPayoutsCrossCheck', 'depositRate', 'currentAccount', 'netMortgageLending', 'netCreditTotal', 'foreignAssetPurchases'])
      expect(has(new RegExp(`Cross-check '${x}'`))).toBe(true);
    const check = (id: string) => report.checks.find((c) => c.id === id)!;
    // with the banks holding the Treasury's foreign debt their assets are 0.95 of the record: inside ±10%
    expect(check('bankAssetsCrossCheck').pass).toBe(true);
    expect(check('kappa').pass).toBe(true); // κ 0.979, inside [0.9, 1.1]
    expect(check('pensionPayoutsCrossCheck').value).toBeCloseTo(2.11, 1);
    expect(check('reservesCrossCheck').value).toBeCloseTo(1.26, 1);
    expect(check('governmentInterestCrossCheck').value).toBeCloseTo(0.74, 1);
    expect(check('output').pass).toBe(true); // 98.15 against 100.3 ± 3
  });
});

describe('the path beside published figures is reported, never gated', () => {
  test('the opening declares the rows the report shows, each with a plain-English reference and no pass condition', () => {
    const path = model.opening!.path!;
    expect(path.months).toEqual([6, 12, 18, 24, 60, 120, 240]);
    expect(path.rows.map((r) => r.id)).toEqual(['keyRate', 'inflation12', 'unemployment', 'output', 'exchangeRate', 'wageGrowth', 'lenderConfidence', 'creditRefused', 'pfAssets', 'pfNetWorth', 'foreignPurchases', 'debtRatio']);
    for (const r of path.rows) expect(r.reference!.length).toBeGreaterThan(10);
    expect(path.note).toMatch(/not a forecast/);
    // a row is a measure and a reference: it has no bound, tolerance or target to pass
    for (const r of path.rows) expect(Object.keys(r).sort().filter((k) => !['id', 'label', 'measure', 'reference', 'digits'].includes(k))).toEqual([]);
  });
});
