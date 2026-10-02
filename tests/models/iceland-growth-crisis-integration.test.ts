/** Independent checks of the public growing + financing composition, not the stationary control. */
import { describe, expect, test } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { createEngine, type KernelEngine, type EngineOptions } from '../../src/core/engine.ts';
import { measureChecks, measureSigns } from '../../src/core/checks.ts';
import { WRITEOFF, type Ledger } from '../../src/core/ledger.ts';
import { createGrowingFinancialEngine } from '../../src/models/iceland/growing-financial.ts';
import { createGrowingIcelandEngine, type GrowingIcelandOptions } from '../../src/models/iceland/growth.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { FIRMS } from '../../src/models/iceland/util.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { leverExtremeRuns } from '../../src/harness/scenarios.ts';
import { firstNonFinite, plausibilityBounds, plausibilityBreaches } from '../../src/harness/plausibility.ts';

const zero = { realGrowth: 0, populationGrowth: 0, worldGrowth: 0, inflation: 0 };
const normaliseZero = (x: number) => x === 0 ? 0 : x;
const fingerprint = (e: KernelEngine) => ({
  t: e.t,
  vars: e.model.vars.map((v) => [v.id, normaliseZero(e.value(v.id))]),
  positions: Array.from(e.positionsAt(e.t), normaliseZero),
  legs: e.legs().map((l) => [l.flow, l.from, l.to, l.amount, normaliseZero(l.value)]),
  events: e.events.map((x) => ({ ...x })),
  regimes: [...e.regimesAt(e.t)], stabilisers: e.stabilisers(), feed: e.feed(),
});

/** Audit raw ledger arrays and every declared variable after each kernel step. */
function audited(options: GrowingIcelandOptions = {}, engineOptions: EngineOptions = {}) {
  let e!: KernelEngine;
  let substeps = 0;
  let maxResidual = 0;
  let worstSign = 0;
  let loss = 0;
  let arrears = 0;
  let denied = 0;
  let postponed = 0;
  const faults: string[] = [];
  let bounds: ReturnType<typeof plausibilityBounds> = [];
  const fail = (message: string) => { if (faults.length < 10) faults.push(message); };
  let previous: Record<string, { K: number; investment: number }> = {};
  const hooks: NonNullable<EngineOptions['testHooks']> = {
    afterPost: (L: Ledger, month, step) => {
      const m = e.model;
      const spec = {
        financial: new Uint8Array(m.instruments.map((i) => i.kind === 'financial' ? 1 : 0)),
        exemptFlows: new Uint8Array(m.flows.map((_, f) => m.clegs.some((l) => l.flow === f && l.oneSided) ? 1 : 0)),
      };
      for (const values of [L.pos, L.open, L.byKind, L.income, L.other, L.rows])
        if (values.some((x) => !Number.isFinite(x))) fail(`non-finite ledger at ${month}/${step}`);
      const residual = Math.max(...measureChecks(L, spec, new Float64Array(4)));
      maxResidual = Math.max(maxResidual, residual);
      if (!(residual <= 1e-9)) fail(`accounting ${residual} at ${month}/${step}`);
      const sign = measureSigns(L.pos, { role: m.role, exempt: m.signExempt }, 1e-6);
      worstSign = Math.max(worstSign, sign);
      if (sign > 1e-6) fail(`position sign ${sign} at ${month}/${step}`);
      const ins = m.instrumentIndex.get('businessArrears')!;
      const b = m.playerIndex.get('B')!;
      const stepLoss = FIRMS.reduce((s, j) => s + e.value(`loanWriteoff${j}`), 0) * m.def.dt / (m.def.substeps ?? 1);
      const bankWriteoff = L.byKind[(ins * m.NP + b) * 4 + WRITEOFF];
      if (Math.abs(bankWriteoff + stepLoss) > 1e-10) fail(`bank loss mismatch at ${month}/${step}`);
      for (const j of FIRMS) {
        const p = m.playerIndex.get(j)!;
        const debtRelief = L.byKind[(ins * m.NP + p) * 4 + WRITEOFF];
        const expected = e.value(`loanWriteoff${j}`) * m.def.dt / (m.def.substeps ?? 1);
        if (Math.abs(debtRelief - expected) > 1e-10) fail(`borrower loss counterpart ${j} at ${month}/${step}`);
        const dt = m.def.dt / (m.def.substeps ?? 1);
        const loans = m.instrumentIndex.get('businessLoans')! * m.NP + p;
        const overdue = ins * m.NP + p;
        const loanChange = dt * (-e.value(`creditApproved${j}`) + e.value(`principalPaid${j}`) + e.value(`principalOverdue${j}`));
        const arrearsChange = dt * (-e.value(`principalOverdue${j}`) - e.value(`interestUnpaid${j}`) + e.value(`arrearsRecovery${j}`) + e.value(`loanWriteoff${j}`));
        if (Math.abs(L.pos[loans] - L.open[loans] - loanChange) > 1e-9) fail(`performing loan transition ${j} at ${month}/${step}`);
        if (Math.abs(L.pos[overdue] - L.open[overdue] - arrearsChange) > 1e-9) fail(`arrears transition ${j} at ${month}/${step}`);
        const cashChange = m.clegs.reduce((sum, leg) => {
          if (m.flows[leg.flow].kind !== 'cash') return sum;
          return sum + ((leg.to === p ? 1 : 0) - (leg.from === p ? 1 : 0)) * e.value(m.vars[leg.amount].id) * dt;
        }, 0);
        const dep = m.instrumentIndex.get('deposits')! * m.NP + p;
        if (Math.abs(L.pos[dep] - L.open[dep] - cashChange) > 1e-9) fail(`actual cash postings ${j} at ${month}/${step}`);
      }
      // A loan write-off itself touches claims and net worth, never the cash instruments.
      for (const cash of ['deposits', 'reserves', 'treasuryAccount']) {
        const i = m.instrumentIndex.get(cash)!;
        for (let p = 0; p < m.NP; p++) if (L.byKind[(i * m.NP + p) * 4 + WRITEOFF] !== 0) fail(`write-off moved ${cash}`);
      }
      loss += stepLoss;
    },
    afterSubstep: (month, step, read) => {
      substeps++;
      for (const v of e.model.vars) if (!Number.isFinite(read.value(v.id))) fail(`non-finite ${v.id} at ${month}/${step}`);
      for (const bound of bounds) if (!bound.ok(read.value(bound.id))) fail(`domain ${bound.id} ${bound.rule} at ${month}/${step}`);
      const dt = e.model.def.dt / (e.model.def.substeps ?? 1);
      const depreciation = e.baselineData.pBase[e.model.paramIndex.get('depreciationRate')!];
      for (const j of FIRMS) {
        const v = (prefix: string) => read.value(`${prefix}${j}`);
        if (Math.abs(v('interestDue') - v('loanInterest') - v('interestUnpaid')) > 1e-9) fail(`interest not partitioned ${j}`);
        if (Math.abs(v('principalOverdue') - Math.max(0, v('principalMaturity') - v('principalPaid'))) > 1e-9) fail(`principal counted twice ${j}`);
        const payer = e.model.playerIndex.get(j)!;
        // FC's self-produced capital has book value but no cash settlement; its materials and
        // wages are operating payments. Count real cross-player purchases from declared legs.
        const assetCash = e.model.clegs.reduce((sum, leg) => {
          const flow = e.model.flows[leg.flow];
          return flow.kind === 'cash' && flow.posting.type === 'purchase' && leg.from === payer && leg.to !== payer
            ? sum + read.value(e.model.vars[leg.amount].id) : sum;
        }, 0);
        const spending = v('loanInterest') + v('principalPaid') + v('arrearsRecovery') + assetCash + Math.max(0, v('dividends'));
        if (spending > v('cashForService') + 1e-8) fail(`cash waterfall overspent ${j} at ${month}/${step}`);
        for (const prefix of ['interestDue', 'loanInterest', 'interestUnpaid', 'principalPaid', 'principalOverdue', 'creditApproved', 'loanWriteoff', 'arrearsRecovery', 'investment'])
          if (v(prefix) < -1e-9) fail(`negative gross ${prefix}${j}`);
        if (v('creditApproved') > v('creditRequested') + 1e-8) fail(`credit beyond request ${j}`);
        if (v('investment') > v('investmentDesired') + 1e-8) fail(`investment beyond request ${j}`);
        const prev = previous[j];
        const K = read.value(`productiveCapitalReal${j}`);
        const expectedK = prev.K + dt * (prev.investment - depreciation * prev.K);
        if (Math.abs(K - expectedK) > 1e-8) fail(`physical capital not from funded investment ${j} at ${month}/${step}`);
        previous[j] = { K, investment: v('investment') };
        denied += Math.max(0, v('creditRequested') - v('creditApproved')) * dt;
        postponed += Math.max(0, v('investmentDesired') - v('investment')) * dt;
      }
      const shares = ['hedgeDebtShare', 'speculativeDebtShare', 'ponziDebtShare'].map((id) => read.value(id));
      if (Math.abs(shares.reduce((s, x) => s + x, 0) - 1) > 1e-8 || shares.some((x) => x < -1e-9 || x > 1 + 1e-9)) fail('debt classifications do not partition debt');
      if (Math.abs(read.value('lenderConfidence')) > 1 + 1e-9) fail('confidence outside bounds');
      arrears = Math.max(arrears, read.stock('businessArrears', 'B'));
    },
  };
  e = createGrowingFinancialEngine(options, { ...engineOptions, testHooks: hooks });
  bounds = plausibilityBounds(e.model);
  previous = Object.fromEntries(FIRMS.map((j) => [j, { K: e.value(`productiveCapitalReal${j}`), investment: e.value(`investment${j}`) }]));
  return { e, metrics: () => ({ substeps, maxResidual, worstSign, loss, arrears, denied, postponed, faults }), assert: () => {
    expect(faults).toEqual([]);
    expect(e.checks().failures).toEqual([]);
    expect(e.checks().signViolations).toEqual([]);
  } };
}

function checkHistory(e: KernelEngine) {
  for (const ind of e.model.indicators) for (let t = 0; t <= e.t; t++) {
    if (!Number.isFinite(e.indicatorAt(ind.id, t)) || !Number.isFinite(e.levelAt(ind.id, t, 'nominal')) || !Number.isFinite(e.levelAt(ind.id, t, 'real')))
      throw new Error(`non-finite indicator ${ind.id} at ${t}`);
  }
}

describe('canonical growing and financial profile: independent integration', () => {
  test('standalone growth and the financed profile have distinct portable scenario identities', () => {
    const growth = createGrowingIcelandEngine();
    const financed = createGrowingFinancialEngine();
    expect(growth.model.def.id).not.toBe(financed.model.def.id);
    financed.step(36);
    const before = fingerprint(financed);
    expect(() => financed.load({ modelId: growth.model.def.id, events: [], months: 12 })).toThrow(/scenario is for model/);
    expect(fingerprint(financed)).toEqual(before);
  });

  test('maps the original opening variables and portfolios by named dimensions', () => {
    const old = createEngine(icelandModel);
    const e = createGrowingFinancialEngine();
    for (const v of old.model.vars) expect(e.value(v.id)).toBe(old.value(v.id));
    for (const i of old.model.instruments) for (const p of old.model.players) expect(e.stock(i.id, p.id)).toBe(old.stock(i.id, p.id));
    expect(e.baseline('productiveCapitalReal')).toBeGreaterThan(0);
    expect(e.stock('businessArrears', 'B')).toBe(0);
    expect(e.model.flows.some((f) => f.id === 'businessBorrowing')).toBe(false);
    expect(e.model.flows.filter((f) => f.id === 'businessGrossLending')).toHaveLength(1);
    expect(e.model.def.id).not.toBe(old.model.def.id);
  });

  test('zero trends with financing quiet preserve the stationary control for 240 months', () => {
    const old = createEngine(icelandModel);
    const a = audited(zero);
    for (let t = 1; t <= 240; t++) {
      old.step(); a.e.step();
      for (const id of ['nominalGDP', 'output', 'cpi', 'wage', 'keyRate', 'bankEquity', 'mortgageLendingY', 'mortgageLendingW']) expect(a.e.value(id)).toBeCloseTo(old.value(id), 9);
      for (const j of FIRMS) expect(a.e.stock('businessLoans', j)).toBeCloseTo(old.stock('businessLoans', j), 9);
    }
    a.assert();
    expect(a.metrics().loss).toBe(0);
    expect(a.metrics().arrears).toBeLessThan(1e-9);
  }, 60_000);

  test('the 1200-month no-change growing path stays finite, available and reconciled', () => {
    const a = audited();
    a.e.step(1200);
    a.assert(); checkHistory(a.e);
    expect(a.metrics().substeps).toBe(1200 * (a.e.model.def.substeps ?? 1));
    expect(a.e.value('output')).toBeGreaterThan(a.e.baseline('output'));
    expect(a.e.value('nominalGDP')).toBeGreaterThan(a.e.baseline('nominalGDP'));
    expect(a.e.value('cpi')).toBeGreaterThan(a.e.baseline('cpi'));
    for (const [id, rate] of [['growthRealIndex', 0.014], ['growthPopulationIndex', 0.005], ['growthWorldDemandIndex', 0.03], ['growthPriceIndex', 0.025]] as const)
      expect(a.e.value(id)).toBeCloseTo(Math.pow(1 + rate, 100), 9);
  }, 60_000);

  test('moderate and sharp rates, tourism and combined shocks keep the funding ledger honest', () => {
    for (const settings of [{ keyRate: 6.5 }, { keyRate: 12 }, { tourism: -60 }, { keyRate: 12, tourism: -60 }]) {
      const a = audited();
      a.e.step(12);
      for (const [lever, value] of Object.entries(settings)) a.e.setLever(lever, value);
      for (let t = 13; t <= 240; t++) {
        a.e.step();
        if ('keyRate' in settings) expect(a.e.value('keyRate')).toBeCloseTo(settings.keyRate! / 100, 13);
      }
      a.assert(); checkHistory(a.e);
    }
  }, 60_000);

  test('a severe credit and income shock actually denies loans, cuts investment and recognises matched losses', () => {
    const a = audited({}, { params: { fragilityCollateralAdvance: 0.1, fragilityDefaultDelay: 1 / 12 } });
    a.e.setLever('keyRate', 15); a.e.setLever('tourism', -60);
    a.e.step(240);
    a.assert();
    expect(a.metrics().denied).toBeGreaterThan(0.01);
    expect(a.metrics().postponed).toBeGreaterThan(0.01);
    expect(a.metrics().arrears).toBeGreaterThan(0.001);
    expect(a.metrics().loss).toBeGreaterThan(0.001);
  }, 60_000);

  test('the same-month no-change comparison removes growth and reads cannot change either engine', () => {
    const e = createGrowingFinancialEngine();
    const ref = createEngine(e.model, { ...e.options, baseline: e.baselineData, testHooks: undefined });
    e.step(120); ref.step(120);
    const before = fingerprint(e), beforeRef = fingerprint(ref);
    for (const ind of e.model.indicators) {
      expect(e.indicatorAt(ind.id, 120, ref)).toBe(0);
      e.levelAt(ind.id, 120, 'nominal'); e.levelAt(ind.id, 120, 'real'); e.series(ind.id);
    }
    e.influences('output', ref); e.ideasAtPlay(undefined, ref); e.legs(); e.balanceSheet('B');
    expect(fingerprint(e)).toEqual(before); expect(fingerprint(ref)).toEqual(beforeRef);
  }, 60_000);

  test('seek, load, fork and client reporting replay the same loss and physical-capital path', () => {
    const e = createGrowingFinancialEngine();
    const events = [{ t: 12, lever: 'keyRate', value: 12 }, { t: 12, lever: 'tourism', value: -60 }, { t: 96, lever: 'tourism', value: 0 }, { t: 120, lever: 'keyRateLock', value: 0 }];
    const scenario = { modelId: e.model.def.id, events, months: 240 };
    e.load(scenario);
    const end = fingerprint(e);
    e.seek(47); e.seek(240); expect(fingerprint(e)).toEqual(end);
    expect(fingerprint(e.fork())).toEqual(end);
    e.reset(); e.load(JSON.parse(JSON.stringify(scenario))); expect(fingerprint(e)).toEqual(end);
    const clientEngine = createGrowingFinancialEngine();
    const client = createEngineClient(clientEngine, { comparison: 'no-change' });
    client.load(scenario); client.pause();
    const clientEnd = fingerprint(clientEngine);
    for (const ind of clientEngine.model.indicators) for (const basis of ['nominal', 'real', 'deviation'] as const) client.reportSeries(ind.id, basis);
    expect(fingerprint(clientEngine)).toEqual(clientEnd);
    client.seek(47); client.seek(240); expect(fingerprint(clientEngine)).toEqual(clientEnd);
    expect(client.getFrame().error).toBeNull();
    client.dispose();
  }, 60_000);

  test('substeps keep the annual assumptions and matched postings rather than applying losses twice', () => {
    for (const substeps of [1, 2, 4]) {
      const a = audited({ substeps });
      a.e.setLever('keyRate', 12); a.e.setLever('tourism', -60); a.e.step(120);
      a.assert();
      expect(a.e.value('growthRealIndex')).toBeCloseTo(Math.pow(1.014, 10), 11);
      expect(a.metrics().substeps).toBe(120 * substeps);
    }
  }, 60_000);

  test('every declared lever endpoint remains finite, plausible and funded in both lock configurations', () => {
    const model = createGrowingFinancialEngine().model;
    const runs = leverExtremeRuns(model);
    const rows: { lever: string; value: number; mode: string; events: unknown[]; status: string; months: number; error: string | null; nonFinite: string; breaches: unknown[]; metrics: ReturnType<ReturnType<typeof audited>['metrics']> }[] = [];
    for (const run of runs) {
      const a = audited();
      let error: string | null = null;
      try { a.e.load({ modelId: a.e.model.def.id, events: run.events, months: 240 }); checkHistory(a.e); }
      catch (caught) { error = String(caught); }
      const nonFinite = firstNonFinite(a.e.model, a.e);
      const breaches = plausibilityBreaches(a.e.model, a.e);
      const metrics = a.metrics();
      const status = error || nonFinite || breaches.length || metrics.faults.length || (a.e.checks().failures?.length ?? 0) ? 'failed' : 'passed';
      rows.push({ ...run, events: run.events.map((x) => ({ ...x })), status, months: a.e.t, error, nonFinite, breaches, metrics });
    }
    const result = { format: 'iceland-inc/growing-financial-endpoints@1', generatedAt: new Date().toISOString(), modelId: model.def.id, horizonMonths: 240,
      dimensions: { players: model.players.length, instruments: model.instruments.length, variables: model.vars.length, indicators: model.indicators.length },
      runCount: rows.length, passed: rows.filter((r) => r.status === 'passed').length, failed: rows.filter((r) => r.status === 'failed').length,
      gate: 'Finite values, unchanged plausibility invariants, accounting <=1e-9, declared position signs, cash availability, exact loan/arrears/loss/physical-capital transitions. No stationary calibration-response thresholds are used.', rows };
    const artifact = process.env.ICELAND_ENDPOINT_ARTIFACT;
    if (artifact) {
      if (existsSync(artifact)) throw new Error(`Refusing to overwrite endpoint evidence: ${artifact}`);
      writeFileSync(artifact, JSON.stringify(result, null, 2) + '\n');
    }
    const failed = rows.filter((r) => r.status === 'failed');
    expect(runs).toHaveLength(104);
    expect(failed.map((r) => ({ lever: r.lever, value: r.value, mode: r.mode, error: r.error, nonFinite: r.nonFinite, breaches: r.breaches, faults: r.metrics.faults }))).toEqual([]);
  }, 180_000);
});
