/**
 * Dated openings (src/core/opening.ts; docs/design/today-opening.md §6, §8): the kernel side of
 * T1–T4, T8 and T9 on the fixture (tests/fixtures/opening.ts), the start solve's rank checks,
 * parameter ranges and provenance, a past on a trend (ModelDef.restTrend) on a small model and on
 * the growing Iceland variant, the start-gap helper, the lever report's start and the engine's
 * calendar and money unit.
 */
import { describe, expect, test } from 'bun:test';
import { compile, type KModel } from '../../src/core/compile.ts';
import { calendarMonth, createEngine, type KernelEngine } from '../../src/core/engine.ts';
import { halfLifeText, lagReach, openingBaseline, openingFailures, withStartGaps, type Opening } from '../../src/core/opening.ts';
import { solveBaseline, type Baseline } from '../../src/core/steady.ts';
import { lockAll, makeScenario, parseScenario, runScenario, stringifyScenario } from '../../src/core/scenario.ts';
import { Anderson, symmetricEigenvalues } from '../../src/core/numerics.ts';
import type { Machine } from '../../src/core/machine.ts';
import type { ModelDef, ModuleDef, OpeningDef, OpeningState } from '../../src/core/types.ts';
import { param, rule, tinyModel, variable } from './fixtures.ts';
import { leverBaseEngine } from '../../src/harness/lever-report.ts';
import { createRegisteredEngine } from '../../src/models/index.ts';
import { referenceModel } from '../../src/models/reference/index.ts';
import { growingFinancialModel } from '../../src/models/iceland/growing-financial.ts';
import { initialBaselineForGrowingModel } from '../../src/models/iceland/growth.ts';
import { runOpeningLayer } from '../../src/harness/opening.ts';
import { createFixtureModel, FIXTURE_DATA as d, FIXTURE_MONEY, FIXTURE_OPENING_ID, FIXTURE_SOLUTION, fixtureModel, fixtureOpening } from '../fixtures/opening.ts';

const m: KModel = compile(fixtureModel);
const anchor: Baseline = solveBaseline(m);
const opening: Opening = openingBaseline(m, fixtureModel.opening!, anchor);
const engine = (): KernelEngine => createEngine(m, { baseline: opening });

/** An opening whose builder is changed by `edit`. */
const edited = (edit: (s: OpeningState) => void): OpeningDef => {
  const def = fixtureOpening();
  return { ...def, build: (a) => {
    const s = def.build(a);
    edit(s);
    return s;
  } };
};
const build = (def: OpeningDef, mode?: 'check' | 'solve') => openingBaseline(m, def, anchor, { mode });

describe('T1: the opening balances', () => {
  test('every financial instrument balances at month 0, and every position has the right sign', () => {
    m.instruments.forEach((ins, i) => {
      if (ins.kind !== 'financial') return;
      let s = 0;
      for (let p = 0; p < m.NP; p++) s += opening.positions[i * m.NP + p];
      expect(Math.abs(s)).toBeLessThanOrEqual(1e-9);
    });
    for (const p of opening.report.positions) expect(p.value).toBeGreaterThanOrEqual(0);
    expect(engine().checks().signViolations).toEqual([]);
  });

  test('every position is reported with a basis of data, residual, mirror or allocated, and its money', () => {
    const r = opening.report;
    expect(r.positions.length).toBe(13);
    for (const p of r.positions) {
      expect(['data', 'residual', 'mirror', 'allocated']).toContain(p.source.basis);
      expect(p.money).toBeCloseTo(p.value * FIXTURE_MONEY.perUnit, 9);
    }
    const at = (ins: string, pl: string) => r.positions.find((p) => p.instrument === ins && p.player === pl)!;
    // the fills balance their instruments; the residual closes the central bank's balance sheet
    expect(at('deposits', 'B')).toMatchObject({ value: d.depositsHH + d.depositsF, source: { basis: 'mirror' } });
    expect(at('bonds', 'B').value).toBeCloseTo(d.govDebt - d.cbBonds, 12);
    expect(at('reserves', 'B')).toMatchObject({ source: { basis: 'residual' } });
    expect(at('reserves', 'B').value).toBeCloseTo(d.cbBonds - d.treasuryAccount - d.cbEquity, 12);
    expect(at('capital', 'F').source).toMatchObject({ basis: 'allocated', note: expect.stringContaining('Key') });
  });

  const throwsWith = (edit: (s: OpeningState) => void, text: RegExp) => expect(() => build(edited(edit))).toThrow(text);
  test('a position that is neither listed nor filled is an error, not a silent fill', () => {
    throwsWith((s) => (s.stocks = s.stocks.filter((x) => x.at[0] !== 'loans')), /position \('loans', 'F'\) is not listed/);
    throwsWith((s) => delete s.fills.bonds, /instrument 'bonds' has no fill/);
  });
  test('a position listed and filled, listed twice, or of an unknown instrument is an error', () => {
    throwsWith((s) => (s.fills.deposits = 'HH'), /\('deposits', 'HH'\) is both listed and the fill/);
    throwsWith((s) => s.stocks.push({ ...s.stocks[0] }), /listed twice/);
    throwsWith((s) => s.stocks.push({ at: ['gold', 'HH'], value: 1, source: { basis: 'data' } }), /unknown instrument or player/);
    throwsWith((s) => s.stocks.push({ at: ['loans', 'HH'], value: 1, source: { basis: 'data' } }), /'HH' neither holds nor issues 'loans'/);
  });
  test('a position must be data, a residual or allocated with its key; the mirror is the kernel’s', () => {
    throwsWith((s) => (s.stocks[0].source = { basis: 'assumed' }), /has basis 'assumed'/);
    throwsWith((s) => (s.stocks.find((x) => x.at[0] === 'capital')!.source = { basis: 'allocated' }), /allocated without naming its key/);
    throwsWith((s) => (s.stocks[0].source = { basis: 'mirror' }), /'mirror' is the kernel's fill/);
  });
  test('a negative residual stops the build with the numbers', () => {
    // central-bank equity above its bonds would leave the bank negative reserves
    throwsWith((s) => (s.stocks.find((x) => x.at[0] === 'reserves')!.value = -3), /\('reserves', 'B'\) is -3\.00000, below zero for an asset \(residual/);
    // more central-bank bonds than the government owes leaves the bank a negative holding
    throwsWith((s) => (s.stocks.find((x) => x.at[0] === 'bonds' && x.at[1] === 'CB')!.value = 70), /\('bonds', 'B'\) is -12\.0000.*mirror/);
  });
});

describe('T2: month 0 holds together', () => {
  test('every gated check passes, every rule reproduces the held values, no regime beyond the anchor’s', () => {
    expect(openingFailures(opening.report)).toEqual([]);
    expect(opening.report.checks.map((c) => c.id)).toEqual(['inflation12', 'debt', 'gdp']);
    expect(opening.report.warnings).toEqual([]);
  });

  test('the engine opens on today’s values, with the 12-month history behind them', () => {
    const e = engine();
    expect(e.value('price')).toBe(d.price);
    expect(e.value('keyRate')).toBe(d.keyRate);
    expect(e.value('inflation12')).toBeCloseTo(d.cpiYoY, 12);
    // the history: a year ago prices were 5.9% lower
    expect(opening.history.get(m.varIndex.get('price')!)![11]).toBeCloseTo(d.price / (1 + d.cpiYoY), 12);
  });

  test('a rule that does not reproduce a value the opening holds is a gated failure, named', () => {
    const o = build(edited((s) => {
      s.vars.gdp = { value: 120, source: { basis: 'data' } };
      delete s.solve;
    }));
    const row = o.report.checks.find((c) => c.id === 'rule:gdp')!;
    expect(row).toMatchObject({ gate: true, pass: false, expected: 120 });
    expect(openingFailures(o.report).join()).toContain("rule 'gdp' gives");
  });

  test('a gated check that fails is reported, and a cross-check only warns', () => {
    const o = build(edited((s) => {
      s.checks[0] = { ...s.checks[0], value: 0.07 };
      s.checks[2] = { ...s.checks[2], value: 90 };
    }));
    expect(openingFailures(o.report)).toEqual([expect.stringContaining("check 'inflation12'")]);
    expect(o.report.warnings.some((w) => w.startsWith("Cross-check 'gdp'"))).toBe(true);
  });

  test('a variable read further back than its history reaches stops the build', () => {
    expect(() => build(edited((s) => (s.vars.price.history = s.vars.price.history!.slice(0, 6))))).toThrow(/'price' is read 12 months back at month 0, but its history reaches 6 months/);
    expect(lagReach(m, opening).get('price')).toBe(12);
    expect(lagReach(m, opening).get('wage')).toBe(1);
    expect(lagReach(m, opening).has('gdp')).toBe(true);
    expect(lagReach(m, opening).has('taxes')).toBe(false);
  });

  test('derive: the Taylor rule starts at rest, its neutral rate set in closed form', () => {
    const e = engine();
    expect(Math.abs(e.value('ruleTarget') - d.keyRate)).toBeLessThan(1e-12);
    const p = opening.report.params.find((x) => x.id === 'neutralRate')!;
    expect(p.anchor).toBe(0.03);
    expect(p.value).not.toBe(0.03);
    expect(() => build(edited((s) => (s.derive = () => ({ params: { markup: 0.4 } }))))).toThrow(/derive sets parameter 'markup', which OpeningState.params does not list/);
  });

  test('the anchor override: base() reads today’s debt ratio, the start reads month 0, the rest the anchor', () => {
    const e = engine();
    const k = m.varIndex.get('debtRatio')!;
    expect(opening.anchors[k]).toBe(opening.vars[k]);
    expect(opening.report.anchors).toEqual([{ id: 'debtRatio', value: opening.vars[k], structural: anchor.vars[k] }]);
    expect(opening.anchors[m.varIndex.get('price')!]).toBe(anchor.vars[m.varIndex.get('price')!]);
    expect(e.baseline('price')).toBe(d.price);
    // the debt rule's term against base('debtRatio') is zero at month 0, so the rule starts at rest
    const debt = e.influences('taxRuleTarget').terms.find((t) => t.id === 'debtRule')!;
    expect(debt.value).toBe(0);
    // without the override it would read the anchor's 55% and start leaning on today's lower debt
    const plain = build(edited((s) => {
      delete s.anchors;
      delete s.solve;
    }));
    expect(createEngine(m, { baseline: plain }).influences('taxRuleTarget').terms.find((t) => t.id === 'debtRule')!.value).toBeLessThan(0);
  });

  test('variables with a past that the opening does not hold start at rest', () => {
    const e = engine();
    // the fixture declares no trend (ModelDef.restTrend), so the past is flat: a smoother sits at
    // its target, and a flow read a month back reads its own month-0 value
    const r = m.ruleOfVar[m.varIndex.get('employment')!];
    expect(Math.abs(e.value('employment') - opening.desired[r])).toBeLessThan(1e-11);
    expect(e.value('normalProfit')).toBeCloseTo(e.value('firmProfit'), 10);
  });

  test('the report lists every record used, sorted', () => {
    const r = opening.report.recordsUsed;
    expect(r).toEqual([...r].sort());
    for (const id of ['fix.depositsHH', 'fix.cpiYoY', 'fix.inflationTarget', 'fix.wageYoY', 'fix.gdp', 'fix.cbEquity']) expect(r).toContain(id);
  });
});

describe('parameters the opening sets: range and provenance', () => {
  /** Fixtureland with ranges on two parameters (the reference economy declares none). */
  const ranged = (max: number): KModel =>
    compile({
      ...fixtureModel,
      modules: fixtureModel.modules.map((mod) => ({
        ...mod,
        params: mod.params?.map((p) => (p.id === 'inflationTarget' ? { ...p, min: 0, max: 0.1 } : p.id === 'neutralRate' ? { ...p, min: -0.05, max } : p)),
      })),
    });
  const neutral = opening.report.params.find((x) => x.id === 'neutralRate')!.value;
  test('inside its range the opening loads; a parameter set outside it stops the build, named with its range', () => {
    const km = ranged(0.15);
    expect(openingFailures(openingBaseline(km, fixtureOpening(), solveBaseline(km)).report)).toEqual([]);
    expect(() => openingBaseline(km, edited((s) => (s.params.inflationTarget.value = 0.5)), solveBaseline(km))).toThrow(/parameter 'inflationTarget' = 0\.500000, outside its range \[0, 0\.1\]/);
  });
  test('a value derive gives is checked too, and the message says derive moved it', () => {
    const km = ranged(neutral - 0.001);
    expect(() => openingBaseline(km, fixtureOpening(), solveBaseline(km))).toThrow(/'neutralRate' = .*outside its range \[-0\.05, .*derive or the start solve moved it/);
  });
  test('a parameter from data needs a source and a vintage; every parameter needs a basis', () => {
    const p = (prov: object) => edited((s) => (s.params.inflationTarget.provenance = prov as never));
    expect(() => build(p({ basis: 'data' }))).toThrow(/parameter 'inflationTarget' is data, so its provenance needs a source and a vintage/);
    expect(() => build(p({ basis: 'data', source: 'fix.inflationTarget' }))).toThrow(/needs a source and a vintage/);
    expect(() => build(p({}))).toThrow(/parameter 'inflationTarget' has no provenance/);
    expect(() => build(p({ basis: 'assumed', note: 'a bridge' }))).not.toThrow();
  });
  test('a start gap’s fade is fixed with its label: an opening may not set or solve it', () => {
    expect(() => build(edited((s) => (s.params['startGapFade.wage'] = { value: 2, provenance: { basis: 'assumed' } })))).toThrow(/'startGapFade.wage' is how fast a start gap fades/);
    expect(() => build(edited((s) => s.solve!.unknowns.splice(0, 1, { param: 'startGapFade.wage' })))).toThrow(/a start gap's fade is set in withStartGaps, not solved/);
  });
});

/** A small model with one smoother that carries a known trend, as the growing Iceland variant's do:
 *  it closes part of its gap to a target growing at g a year each step, plus (1 − k)/k × its last
 *  value × (e^(g·dt) − 1), which keeps it on the target's path once it is there. */
function trendModel(opts: { substeps?: number; restTrend?: boolean; exponential?: boolean } = {}): ModelDef {
  const g = 0.03;
  const trend: ModuleDef = {
    id: 'trend',
    label: 'Trend',
    description: 'A smoother carrying a known trend.',
    vars: [variable('trendIndex', 1, 'index'), variable('seen', 10, 'state')],
    params: [param('trendRate', g), { ...param('seenSpeed', 3), unit: 'per year' }],
    rules: [
      rule({ id: 'trendIndex', target: 'trendIndex', params: ['trendRate'], compute: (c) => Math.exp(c.p('trendRate') * (c.t + c.dt)) }),
      rule({
        id: 'seen',
        target: 'seen',
        inputs: ['trendIndex'],
        lagInputs: ['seen'],
        params: ['level', 'trendRate', 'seenSpeed'],
        adjust: { speed: 'seenSpeed', form: opts.exponential ? 'exponential' : 'linear' },
        terms: [
          { id: 'target', label: 'The growing target', compute: (c) => c.p('level') * c.v('trendIndex') },
          {
            id: 'trendCarry',
            label: 'Carry the known trend',
            compute: (c) => {
              const k = opts.exponential ? 1 - Math.exp(-c.p('seenSpeed') * c.dt) : c.p('seenSpeed') * c.dt;
              return ((1 - k) / k) * c.lag('seen') * Math.expm1(c.p('trendRate') * c.dt);
            },
          },
        ],
      }),
    ],
  };
  const base = tinyModel([trend]);
  return { ...base, substeps: opts.substeps, ...(opts.restTrend === false ? {} : { restTrend: (id, p) => (id === 'seen' ? p('trendRate') : 0) }) };
}
const trendOpening: OpeningDef = {
  id: 'trend-today',
  label: 'Trend',
  asOf: '2026-09-30',
  description: 'test',
  build: () => ({
    stocks: [
      { at: ['deposits', 'HH'], value: 50, source: { basis: 'data' } },
      { at: ['reserves', 'B'], value: 5, source: { basis: 'data' } },
      { at: ['tsy', 'G'], value: 5, source: { basis: 'data' } },
    ],
    fills: { deposits: 'B', reserves: 'CB', tsy: 'CB' },
    vars: {},
    params: {},
    checks: [],
  }),
};

describe('a past on a trend (ModelDef.restTrend)', () => {
  const level = 10,
    g = 0.03;
  for (const substeps of [1, 2])
    for (const exponential of [false, true])
      test(`a smoother at rest sits at its target and stays on the target's path (${substeps} step${substeps > 1 ? 's' : ''} a month, ${exponential ? 'exponential' : 'linear'})`, () => {
        const km = compile(trendModel({ substeps, exponential }));
        const o = openingBaseline(km, trendOpening, solveBaseline(km));
        const k = km.varIndex.get('seen')!;
        expect(o.trend![k]).toBe(g);
        expect(Math.abs(o.vars[k] / level - 1)).toBeLessThan(1e-12);
        expect(openingFailures(o.report)).toEqual([]);
        const e = createEngine(km, { baseline: o });
        e.step(24);
        for (let t = 0; t <= 24; t++) expect(Math.abs(e.valueAt('seen', t) / (level * Math.exp((g * t) / 12)) - 1)).toBeLessThan(1e-12);
      });

  test('without the trend the past is flat, and the carry leaves the smoother above its target', () => {
    const km = compile(trendModel({ restTrend: false }));
    const o = openingBaseline(km, trendOpening, solveBaseline(km));
    expect(o.trend).toBeUndefined();
    const k = 3 / 12;
    // at rest on a flat past: x = target + (1 − k)/k × x × (e^(g·dt) − 1)
    const flat = level / (1 - ((1 - k) / k) * Math.expm1(g / 12));
    expect(o.vars[km.varIndex.get('seen')!]).toBeCloseTo(flat, 12);
    expect(flat / level - 1).toBeGreaterThan(0.007);
  });

  test('the engine reads the same past: a lag of a month at month 0 reads the trend, not month 0', () => {
    const km = compile(trendModel({ substeps: 2 }));
    const e = createEngine(km, { baseline: openingBaseline(km, trendOpening, solveBaseline(km)) });
    const M = (e as unknown as { M: Machine }).M;
    const seen = km.varIndex.get('seen')!;
    // the head holds month 0; one and two sub-steps back lie on the trend, and so does every slot
    expect(M.lagValue(seen, 1)).toBe(e.value('seen'));
    expect(M.lagValue(seen, 2)).toBeCloseTo(e.value('seen') * Math.exp(-g / 24), 14);
    expect(M.lagValue(seen, 3)).toBeCloseTo(e.value('seen') * Math.exp(-g / 12), 14);
    expect(M.lagValue(seen, M.K)).toBeCloseTo(e.value('seen') * Math.exp((-g * (M.K - 1)) / 24), 14);
    // a variable without a trend keeps a flat past
    expect(M.lagValue(km.varIndex.get('trendIndex')!, 3)).toBe(e.value('trendIndex'));
  });
});

describe('the growing Iceland variant opened on its own anchor', () => {
  // As B builds iceland-today: the anchor's positions, the accumulators held (rules that read
  // their own past and do not adjust) and the variables read more than a month back held with a
  // flat history; every other lagged variable starts at rest.
  const def = growingFinancialModel;
  const growing = initialBaselineForGrowingModel(def);
  const copyOf = (km: KModel, hold: (k: number) => boolean): { def: OpeningDef; vars: OpeningState['vars'] } => {
    const reach = lagReach(km, growing);
    const signed = (j: number) => (km.role[j] === 2 ? -growing.positions[j] : growing.positions[j]);
    const fills: Record<string, string> = {};
    const stocks: OpeningState['stocks'] = [];
    km.instruments.forEach((ins, i) => {
      const fill = ins.kind === 'financial' ? km.playerIndex.get(ins.issuers.length === 1 ? ins.issuers[0] : ins.holders.length === 1 ? ins.holders[0] : ins.issuers[0])! : -1;
      if (fill >= 0) fills[ins.id] = km.players[fill].id;
      km.players.forEach((p, q) => {
        const j = i * km.NP + q;
        if (km.role[j] && q !== fill) stocks.push({ at: [ins.id, p.id], value: signed(j), source: { basis: 'data' } });
      });
    });
    const vars: OpeningState['vars'] = {};
    km.vars.forEach((v, k) => {
      if (km.ruleOfVar[k] < 0 || !hold(k)) return;
      const deep = reach.get(v.id) ?? 0;
      vars[v.id] = { value: growing.vars[k], history: deep > 1 ? Array(deep).fill(growing.vars[k]) : undefined, source: { basis: 'data' } };
    });
    return { def: { id: 'growing-copy', label: 'copy', asOf: '2026-09-30', description: 'test', build: () => ({ stocks, fills, vars, params: {}, checks: [] }) }, vars };
  };
  const accumulators = (km: KModel) => (k: number) => {
    const cr = km.crules[km.ruleOfVar[k]];
    return (cr.lagInputs.includes(k) && !cr.hasAdjust) || (lagReach(km, growing).get(km.vars[k].id) ?? 0) > 1;
  };
  /** Every smoother with a trendCarry term that the opening leaves at rest: its value at month 0
   *  against its target (its desired value less the carry). */
  const carried = (km: KModel, o: Opening, held: OpeningState['vars']) =>
    km.crules.flatMap((cr) => {
      const j = km.termKeyIndex.get(`${cr.def.target}.trendCarry`);
      if (j === undefined || held[cr.def.target]) return [];
      return [{ id: cr.def.target, gap: o.vars[km.varIndex.get(cr.def.target)!] / (o.desired[cr.idx] - o.terms[j]) - 1 }];
    });

  test('every trend-carrying smoother at rest sits at its target; with a flat past it would not', () => {
    const km = compile(def);
    const od = copyOf(km, accumulators(km));
    const o = openingBaseline(km, od.def, growing);
    const rows = carried(km, o, od.vars);
    expect(rows.length).toBe(31);
    for (const r of rows) expect({ id: r.id, gap: Math.abs(r.gap) < 1e-9 }).toEqual({ id: r.id, gap: true });
    // the same opening on a flat past: consumption 6.8% and housing costs 5.1% above their targets
    const flat = compile({ ...def, restTrend: undefined });
    const fd = copyOf(flat, accumulators(flat));
    const worst = Math.max(...carried(flat, openingBaseline(flat, fd.def, growing), fd.vars).map((r) => Math.abs(r.gap)));
    expect(worst).toBeGreaterThan(0.05);
  });

  test('holding every value, the opening runs as the growing engine: bit for bit on a flat past', () => {
    const flat = compile({ ...def, restTrend: undefined });
    const o = openingBaseline(flat, copyOf(flat, () => true).def, growing);
    for (const locked of [false, true]) {
      const a = createEngine(flat, { baseline: o }),
        b = createEngine(flat, { baseline: growing });
      if (locked) {
        lockAll(a);
        lockAll(b);
      }
      a.step(24);
      b.step(24);
      for (let t = 0; t <= 24; t++) for (const v of flat.vars) if (!Object.is(a.valueAt(v.id, t), b.valueAt(v.id, t))) throw new Error(`${v.id} at month ${t}${locked ? ' (locked)' : ''}`);
    }
  });
});

describe('T3: accounting from month 1', () => {
  for (const locked of [false, true])
    test(`240 months ${locked ? 'with every padlock closed' : 'with every padlock open'}: no residual, no wrong sign`, () => {
      const e = engine();
      if (locked) lockAll(e);
      e.step(240);
      expect(Math.max(...e.maxResiduals().map((r) => r.residual))).toBeLessThanOrEqual(1e-9);
      expect(e.checks().failures).toEqual([]);
      expect(e.checks().signViolations).toEqual([]);
    });
});

describe('T4: month 1 carries on from today (the start solve)', () => {
  test('the solved rows hold exactly in the engine’s month 1', () => {
    const e = engine();
    e.step(1);
    expect(Math.abs(e.value('wageGrowth') - d.wageYoY)).toBeLessThan(1e-9);
    expect(Math.abs(12 * Math.log(e.value('price') / d.price) - d.cpiAnnualised)).toBeLessThan(1e-9);
    expect(Math.abs(12 * Math.log(e.value('output') / e.valueAt('output', 0)) - Math.log1p(d.realGrowth))).toBeLessThan(1e-9);
    expect(opening.report.month1.every((r) => r.pass)).toBe(true);
    expect(opening.report.month1.map((r) => r.id)).toEqual(['keyRate', 'inflation', 'output']);
  });

  test('check mode: the committed solution holds, and a fresh solve agrees with it to 1e-9', () => {
    expect(opening.report.solve).toMatchObject({ mode: 'check', unknowns: 3, iterations: 0 });
    expect(opening.report.solve.residual).toBeLessThan(1e-9);
    const fresh = build(fixtureOpening(), 'solve');
    expect(fresh.report.solve.mode).toBe('solve');
    expect(fresh.report.solve.condition).toBeLessThan(1e3);
    for (const [id, x] of Object.entries(FIXTURE_SOLUTION)) expect(Math.abs(fresh.report.solve.solution[id] - x) / Math.max(1e-12, Math.abs(x))).toBeLessThan(1e-9);
  });

  test('a stale committed solution stops the build with the residuals', () => {
    expect(() => build(edited((s) => (s.solve!.solution = { ...FIXTURE_SOLUTION, 'startGap.wage': 0.02 })))).toThrow(/the committed solution no longer holds .*wage-growth/);
    expect(() => build(edited((s) => (s.solve!.solution = { 'startGap.wage': 0 })))).toThrow(/does not match the unknowns; missing startGap.spending, startGap.margins/);
  });

  test('the start gaps are in the report with their size, share and half-life', () => {
    expect(opening.report.gaps.map((g) => [g.group, g.scale, g.halfLifeMonths])).toEqual([
      ['wage', 'absolute', 8],
      ['spending', 'relative', 17],
      ['margins', 'relative', 17],
    ]);
    const spending = opening.report.gaps[1];
    expect(spending.value).toBe(FIXTURE_SOLUTION['startGap.spending']);
    expect(spending.shareOfRule).toBeCloseTo(Math.abs(spending.value), 12);
  });

  test('loading costs one month-0 evaluation and one month, within the budget', () => {
    const t0 = performance.now();
    openingBaseline(m, fixtureModel.opening!, anchor);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('the start solve is checked before it runs', () => {
  const solveOf = (variant: 'inert' | 'unreachable' | 'collinear') => {
    const def = createFixtureModel(variant);
    const km = compile(def);
    return () => openingBaseline(km, def.opening!, solveBaseline(km), { mode: 'solve' });
  };
  test('an unknown no target depends on is named', () => {
    expect(solveOf('inert')).toThrow(/not well posed: no target depends on 'inertKnob'/);
  });
  test('a target no unknown moves is named', () => {
    expect(solveOf('unreachable')).toThrow(/not well posed: no unknown moves 'key-rate-today'/);
  });
  test('two unknowns that move the targets alike are named', () => {
    expect(solveOf('collinear')).toThrow(/ill-conditioned .*'startGap.wage' and 'expectedInflation' move the targets almost alike/);
  });
  test('check mode needs a committed solution, and unknowns pair with targets', () => {
    expect(() => build(edited((s) => delete s.solve!.solution), 'check')).toThrow(/check mode needs a committed solution/);
    expect(() => build(edited((s) => s.solve!.targets.pop()))).toThrow(/3 unknowns and 2 targets/);
    expect(() => build(edited((s) => s.solve!.unknowns.push({ var: 'gdp' })))).toThrow(/not a variable the opening holds/);
  });
});

describe('T8: the no-change path from an opening', () => {
  test('a run with no events is the no-change run bit for bit; seek, load and fork reproduce it', () => {
    const a = engine(),
      b = engine();
    a.step(36);
    b.step(36);
    const same = (x: KernelEngine, y: KernelEngine, t: number) => m.vars.every((v) => Object.is(x.valueAt(v.id, t), y.valueAt(v.id, t))) && x.positionsAt(t).every((p, j) => Object.is(p, y.positionsAt(t)[j]));
    for (let t = 0; t <= 36; t++) expect(same(a, b, t)).toBe(true);
    const f = a.fork();
    expect(same(f, a, 36)).toBe(true);
    b.seek(7);
    b.seek(36);
    for (let t = 0; t <= 36; t++) expect(same(a, b, t)).toBe(true);
    const r = runScenario(a, [], 36);
    expect(same(r.engine, a, 36)).toBe(true);
    // the opening's own month-1 run is the engine's
    expect(r.engine.valueAt('wageGrowth', 1)).toBe(a.valueAt('wageGrowth', 1));
  });

  test('createRegisteredEngine opens on the committed solution, with calendar, money unit and report', () => {
    const e = createRegisteredEngine(fixtureModel);
    expect(e.opening?.id).toBe(FIXTURE_OPENING_ID);
    expect(e.moneyUnit).toEqual(FIXTURE_MONEY);
    expect(e.calendar(0)).toEqual({ year: 2026, month: 9 });
    expect(e.calendar(4)).toEqual({ year: 2027, month: 1 });
    expect(e.baselineData.vars).toEqual(opening.vars);
    expect(e.value('keyRate')).toBe(0.08);
    // the key-rate padlock freezes the rate in force, and its lever's start value is today's
    expect(e.leverValue('keyRate')).toBe(8);
    expect(runOpeningLayer(fixtureModel, { months: 60 }).pass).toBe(true);
  });
});

describe('T9: models without an opening are unchanged', () => {
  const sameRun = (x: KernelEngine, y: KernelEngine, months: number) => {
    x.step(months);
    y.step(months);
    for (let t = 0; t <= months; t++) for (const v of x.model.vars) if (!Object.is(x.valueAt(v.id, t), y.valueAt(v.id, t))) return `${v.id} at month ${t}`;
    return '';
  };
  test('the reference economy runs bit for bit through createRegisteredEngine, with no history and no anchors', () => {
    const e = createRegisteredEngine(referenceModel);
    expect(e.baselineData.history).toBeUndefined();
    expect(e.baselineData.anchors).toBeUndefined();
    expect(e.opening).toBeNull();
    expect(e.moneyUnit).toBeNull();
    expect(e.calendar(3)).toBeNull();
    expect(sameRun(e, createEngine(referenceModel), 24)).toBe('');
  });
  test('the growing variant opens as before', () => {
    const def = growingFinancialModel;
    const e = createRegisteredEngine(def);
    expect(e.opening).toBeNull();
    expect(sameRun(e, createEngine(def, { baseline: initialBaselineForGrowingModel(def) }), 12)).toBe('');
  });
  test('start gaps without an opening are zero: the model runs as its source (to the solver’s tolerance)', () => {
    // The replacement rules sit in their own module, so the schedule may visit a simultaneous
    // block's rules in another order; the values agree to the block solver's tolerance.
    const gapped = withStartGaps(referenceModel, { wage: { targets: ['wageGrowth'], fade: 1, scale: 'absolute' }, spending: { targets: ['consumption', 'investmentPlan'], fade: 0.5, scale: 'relative' } });
    const a = createEngine(gapped),
      b = createEngine(referenceModel);
    a.setLever('govSpending', 2);
    b.setLever('govSpending', 2);
    a.step(36);
    b.step(36);
    for (let t = 0; t <= 36; t += 6) for (const v of b.model.vars) expect(Math.abs(a.valueAt(v.id, t) - b.valueAt(v.id, t))).toBeLessThan(1e-9 * Math.max(1, Math.abs(b.valueAt(v.id, t))));
    for (const id of ['wageGrowth', 'consumption', 'investmentPlan']) expect(a.influences(id).terms.find((x) => x.id === 'startGap')!.value).toBe(0);
  });
});

describe('the lever report starts from the opening', () => {
  test('a model with an opening: its runs start from the opening, not the steady state', () => {
    const e = leverBaseEngine(fixtureModel);
    expect(e.opening?.id).toBe(FIXTURE_OPENING_ID);
    expect(e.value('keyRate')).toBe(d.keyRate);
    expect(e.value('price')).toBe(d.price);
    expect(e.baselineData.vars).toEqual(opening.vars);
    // a model without one starts from its steady state, as before
    const plain = leverBaseEngine(referenceModel);
    expect(plain.opening).toBeNull();
    expect(plain.baselineData.vars).toEqual(createEngine(referenceModel).baselineData.vars);
  });
});

describe('withStartGaps', () => {
  const gapped = withStartGaps(referenceModel, { wage: { targets: ['wageGrowth'], fade: 1, scale: 'absolute' }, spending: { targets: ['consumption', 'investmentPlan'], fade: 0.5, scale: 'relative' } });
  const km = compile(gapped);

  test('adds one labelled, fading term per target rule, through replaces, with its parameters', () => {
    const r = km.ruleFor('consumption')!;
    expect(r.id).toBe('startGap.consumption');
    expect(r.replaces).toBe('consumption');
    const term = r.terms!.find((t) => t.id === 'startGap')!;
    expect(term).toMatchObject({ label: "Today's gap from this rule, fading (half gone in 17 months)", concept: 'start-gap' });
    expect(km.ruleFor('wageGrowth')!.terms!.find((t) => t.id === 'startGap')!.label).toBe("Today's gap from this rule, fading (half gone in 8 months)");
    for (const id of ['startGap.wage', 'startGapFade.wage', 'startGap.spending', 'startGapFade.spending', 'startGapBase.consumption', 'startGapBase.investmentPlan']) expect(km.paramIndex.has(id)).toBe(true);
    expect(km.paramIndex.has('startGapBase.wageGrowth')).toBe(false);
    expect(gapped.startGaps?.spending.targets).toEqual(['consumption', 'investmentPlan']);
    expect(r.explain.rule).toContain('start gap');
  });

  test('the term is size × base × exp(−fade × years from month 0)', () => {
    const e = createEngine(gapped, { forkParams: { 'startGap.spending': 0.1, 'startGapBase.consumption': 50 } });
    e.step(12);
    const inf = e.influences('consumption');
    const t = inf.terms.find((x) => x.id === 'startGap')!;
    expect(t.value).toBeCloseTo(0.1 * 50 * Math.exp(-0.5 * 12 / 12), 10);
    // the wage rule has a combine (a floor): the gap is added after it
    const w = createEngine(gapped, { forkParams: { 'startGap.wage': 0.01 } });
    expect(w.influences('wageGrowth').terms.find((x) => x.id === 'startGap')!.baseline).toBe(0);
    w.step(1);
    expect(w.value('wageGrowth')).toBeCloseTo(0.01 * Math.exp(-1 / 12), 12);
  });

  test('the rule’s own regimes see its value without the gap', () => {
    // a rule that names a regime whenever its value leaves its own terms' sum, and a smoother
    // that names one whenever its value is not the step its own target alone would give
    const probe = (adjust: boolean): ModuleDef => ({
      id: 'probe',
      label: 'Probe',
      description: 'test',
      vars: [variable('probe', 1, 'state')],
      params: [param('probeLevel', 1), { ...param('probeSpeed', 2), unit: 'per year' }],
      rules: [
        rule({
          id: 'probe',
          target: 'probe',
          params: ['probeLevel', 'probeSpeed'],
          lagInputs: ['probe'],
          ...(adjust ? { adjust: { speed: 'probeSpeed' } } : {}),
          terms: [{ id: 'own', label: 'Own', compute: (c) => c.p('probeLevel') }],
          regime: (c, value, t) => {
            const want = adjust ? c.lag('probe') + c.p('probeSpeed') * c.dt * (t.own - c.lag('probe')) : t.own;
            return Math.abs(value - want) > 1e-12 ? 'Off its own rule' : null;
          },
        }),
      ],
    });
    for (const adjust of [false, true]) {
      const e = createEngine(withStartGaps(tinyModel([probe(adjust)]), { p: { targets: ['probe'], fade: 1, scale: 'absolute' } }), { forkParams: { 'startGap.p': 0.5 } });
      e.step(3);
      expect(e.influences('probe').terms.find((x) => x.id === 'startGap')!.value).not.toBe(0);
      expect(e.value('probe')).not.toBeCloseTo(1, 3);
      const r = e.model.crules.findIndex((cr) => cr.def.target === 'probe');
      for (let t = 1; t <= 3; t++) expect(e.regimesAt(t)[r]).toBeNull();
    }
  });

  test('a start gap goes on BEHAVIOUR rules only, never on a stock, and once per rule', () => {
    expect(() => withStartGaps(referenceModel, { x: { targets: ['gdp'], fade: 1, scale: 'relative' } })).toThrow(/'gdp' is set by the IDENTITY rule 'gdp'; start gaps go on BEHAVIOUR rules only/);
    expect(() => withStartGaps(referenceModel, { x: { targets: ['keyRate'], fade: 1, scale: 'absolute' } })).toThrow(/POLICY rule/);
    expect(() => withStartGaps(referenceModel, { x: { targets: ['deposits'], fade: 1, scale: 'absolute' } })).toThrow(/'deposits' is a stock; stocks change only through postings/);
    expect(() => withStartGaps(referenceModel, { a: { targets: ['price'], fade: 1, scale: 'relative' }, b: { targets: ['price'], fade: 1, scale: 'relative' } })).toThrow(/'price' is in start-gap groups 'a' and 'b'/);
    expect(() => withStartGaps(referenceModel, { a: { targets: ['price'], fade: 0, scale: 'relative' } })).toThrow(/the fade must be a positive number/);
    expect(() => withStartGaps(gapped, { a: { targets: ['price'], fade: 1, scale: 'relative' } })).toThrow(/already has start gaps/);
    expect(() => withStartGaps(referenceModel, { a: { targets: ['nothing'], fade: 1, scale: 'relative' } })).toThrow(/no rule sets 'nothing'/);
  });

  test('halfLifeText: months up to two years, then years to the half year', () => {
    expect(halfLifeText(1)).toBe('half gone in 8 months');
    expect(halfLifeText(0.5)).toBe('half gone in 17 months');
    expect(halfLifeText(12 * Math.LN2)).toBe('half gone in 1 month');
    expect(halfLifeText(0.2)).toBe('half gone in about 3½ years');
    expect(halfLifeText(0.25)).toBe('half gone in about 3 years');
    expect(halfLifeText(0.35)).toBe('half gone in 24 months');
    expect(() => halfLifeText(0)).toThrow();
  });
});

describe('calendar, scenarios and numerics', () => {
  test('calendar months', () => {
    expect(calendarMonth({ year: 2026, month: 9 }, 0)).toEqual({ year: 2026, month: 9 });
    expect(calendarMonth({ year: 2026, month: 9 }, 3)).toEqual({ year: 2026, month: 12 });
    expect(calendarMonth({ year: 2026, month: 9 }, 16)).toEqual({ year: 2028, month: 1 });
    expect(calendarMonth({ year: 2026, month: 9 }, -9)).toEqual({ year: 2025, month: 12 });
  });

  test('a scenario records the opening it was made from, and a file keeps it', () => {
    const s = makeScenario('fixtureland', [{ t: 0, lever: 'keyRate', value: 7.5 }], 24, FIXTURE_OPENING_ID);
    expect(s.opening).toBe(FIXTURE_OPENING_ID);
    const back = parseScenario(stringifyScenario(s));
    expect(back.opening).toBe(FIXTURE_OPENING_ID);
    expect(parseScenario(stringifyScenario(makeScenario('reference', [], 12))).opening).toBeUndefined();
    const e = createRegisteredEngine(fixtureModel, { baseline: opening });
    e.load(back);
    expect(e.t).toBe(24);
    expect(e.value('keyRate')).toBe(0.075);
  });

  test('Anderson acceleration closes a slow linear mode in a few steps', () => {
    // x = A x + c with a mode that plain iteration closes 2% a step
    const G = (x: Float64Array) => Float64Array.from([0.98 * x[0] + 0.01 * x[1] + 1, 0.5 * x[1] - 0.2 * x[0] + 2]);
    const fixed = (() => {
      // solve (I − A) x = c directly
      const a = 1 - 0.98, b = -0.01, c = 0.2, e = 1 - 0.5;
      const det = a * e - b * c;
      return [(1 * e - b * 2) / det, (a * 2 - c * 1) / det];
    })();
    const mixer = new Anderson(2, 5);
    let x: Float64Array = new Float64Array(2);
    let steps = 0;
    for (; steps < 100 && Math.max(...G(x).map((v, i) => Math.abs(v - x[i]))) > 1e-12; steps++) x = mixer.next(x, G(x));
    expect(steps).toBeLessThan(10);
    expect(x[0]).toBeCloseTo(fixed[0], 9);
    expect(x[1]).toBeCloseTo(fixed[1], 9);
  });

  test('symmetric eigenvalues', () => {
    const ev = symmetricEigenvalues(new Float64Array([4, 1, 0, 1, 3, 1, 0, 1, 2]), 3);
    // the characteristic polynomial's roots: 3 and 3 ± √3
    expect(ev[0]).toBeCloseTo(3 - Math.sqrt(3), 12);
    expect(ev[1]).toBeCloseTo(3, 12);
    expect(ev[2]).toBeCloseTo(3 + Math.sqrt(3), 12);
  });
});

/** Typed so the fixture stays a ModelDef that the interface can load. */
const _typed: ModelDef = fixtureModel;
void _typed;
