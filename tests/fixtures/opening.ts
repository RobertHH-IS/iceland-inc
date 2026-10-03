/**
 * A dated opening on a small model, for the kernel's opening tests (docs/design/today-opening.md
 * §9.2, step 7) and for building the interface before Iceland today exists.
 *
 * Fixtureland is the reference economy (households, firms, a bank, a central bank, a government)
 * opened on made-up data for 30 September 2026: prices 5.9% up on a year ago, wages 5.7%, a key
 * rate of 8%, government debt at 58% of GDP. It has:
 *   - a 12-month history for prices and wages (12-month inflation reads a year back);
 *   - a closed form (`derive`): the neutral rate at which the Taylor rule's target is the key rate
 *     in force, so the rule starts at rest;
 *   - one anchor override: the debt rule measures debt against today's ratio, not the anchor's;
 *   - a tied relative start-gap group of two targets (spending: consumption and investment plans),
 *     a relative one of one target (margins: prices) and an absolute one (wage: wage growth),
 *     solved so that month 1 carries on at 5.7% wage growth, 5.7% inflation and 1.4% real growth
 *     a year, with the solution committed;
 *   - a money unit (ISK 50 bn per unit) and a calendar (month 0 is September 2026).
 * Three variants break the start solve on purpose: an unknown nothing depends on, a target no
 * unknown moves, and two unknowns that move the targets alike.
 */
import type { Id, IndicatorCtx, ModelDef, ModuleDef, OpeningDef, OpeningState, OpeningTarget, OpeningUnknown } from '../../src/core/types.ts';
import { withStartGaps } from '../../src/core/opening.ts';
import { referenceModel } from '../../src/models/reference/index.ts';
import { concepts } from '../../src/concepts/library.ts';

export const FIXTURE_ID = 'fixtureland';
export const FIXTURE_OPENING_ID = 'fixtureland-2026-09-30';
export const FIXTURE_MONEY = { label: 'ISK bn', perUnit: 50, basis: 'Fixture: one model unit is ISK 50 bn, 1% of a made-up GDP.' };

/** Today's made-up data, in model units (stocks % of baseline GDP, rates as fractions). */
export const FIXTURE_DATA = {
  cpiYoY: 0.059,
  price: 1.06768,
  wageYoY: 0.057,
  wage: 1.06391,
  keyRate: 0.08,
  expectedInflation: 0.043,
  inflationTarget: 0.025,
  realGrowth: 0.014,
  cpiAnnualised: 0.057,
  depositsHH: 80,
  depositsF: 12.6,
  treasuryAccount: 2.1,
  govDebt: 58,
  cbBonds: 18,
  cbEquity: 7.2,
  loans: 50.4,
  consumption: 72,
  investmentPlan: 15.5,
};

/** The solution of the start solve, committed (re-solved and compared in tests/core/opening.test.ts). */
export const FIXTURE_SOLUTION: Record<Id, number> = {
  'startGap.wage': 0.01650752082061876,
  'startGap.spending': 0.019320997972380228,
  'startGap.margins': 0.03845766409367854,
};

const d = FIXTURE_DATA;
const data = (...records: Id[]) => ({ basis: 'data' as const, records, period: '2026-09-30' });

/** A path back from today at a steady rate a year: [month −1, month −2, …]. */
export const pathBack = (now: number, yearly: number, months = 12): number[] => Array.from({ length: months }, (_, q) => now / Math.pow(1 + yearly, (q + 1) / 12));

const wageTarget: OpeningTarget = {
  id: 'wage-growth',
  describe: 'Wages keep growing 5.7% a year in month 1',
  records: ['fix.wageYoY'],
  scale: 0.01,
  residual: (_0, one) => one.v('wageGrowth') - d.wageYoY,
};
const inflationTarget: OpeningTarget = {
  id: 'inflation',
  describe: 'Prices keep rising 5.7% a year (annualised) in month 1',
  records: ['fix.cpiAnnualised'],
  scale: 0.01,
  residual: (zero, one) => 12 * Math.log(one.v('price') / zero.v('price')) - d.cpiAnnualised,
};
const outputTarget: OpeningTarget = {
  id: 'output-growth',
  describe: 'Real output grows 1.4% a year in month 1',
  records: ['fix.realGrowth'],
  scale: 0.01,
  residual: (zero, one) => 12 * Math.log(one.v('output') / zero.v('output')) - Math.log1p(d.realGrowth),
};

export type FixtureVariant = 'good' | 'inert' | 'unreachable' | 'collinear';

function solveFor(variant: FixtureVariant): OpeningState['solve'] {
  const gaps: OpeningUnknown[] = [{ param: 'startGap.wage' }, { param: 'startGap.spending' }, { param: 'startGap.margins' }];
  const solved = [wageTarget, outputTarget, inflationTarget];
  switch (variant) {
    case 'good':
      return { unknowns: gaps, targets: solved, solution: FIXTURE_SOLUTION };
    case 'inert':
      return {
        unknowns: [...gaps, { param: 'inertKnob' }],
        targets: [...solved, { ...wageTarget, id: 'wage-growth-again', residual: (z: IndicatorCtx, o: IndicatorCtx) => 2 * wageTarget.residual(z, o) }],
      };
    case 'unreachable':
      return {
        unknowns: [...gaps, { var: 'expectedInflation' }],
        targets: [...solved, { id: 'key-rate-today', describe: 'The key rate is 8% today', records: ['fix.keyRate'], scale: 0.01, residual: (zero) => zero.v('keyRate') - d.keyRate }],
      };
    case 'collinear':
      return {
        unknowns: [{ param: 'startGap.wage' }, { var: 'expectedInflation' }],
        targets: [wageTarget, { ...wageTarget, id: 'wage-growth-again', residual: (z: IndicatorCtx, o: IndicatorCtx) => 2 * wageTarget.residual(z, o) }],
      };
  }
}

export function fixtureOpening(variant: FixtureVariant = 'good'): OpeningDef {
  return {
    id: FIXTURE_OPENING_ID,
    label: 'Fixtureland on 30 September 2026',
    asOf: '2026-09-30',
    description: 'Fixtureland as made-up data have it on 30 September 2026. Without your changes it follows its own rules: a test model, not a forecast.',
    build: (a): OpeningState => ({
      stocks: [
        { at: ['deposits', 'HH'], value: d.depositsHH, source: data('fix.depositsHH') },
        { at: ['deposits', 'F'], value: d.depositsF, source: data('fix.depositsF') },
        { at: ['treasuryAccount', 'G'], value: d.treasuryAccount, source: data('fix.treasuryAccount') },
        { at: ['bonds', 'G'], value: d.govDebt, source: data('fix.govDebt') },
        { at: ['bonds', 'CB'], value: d.cbBonds, source: data('fix.cbBonds') },
        // the central bank's balance sheet closes on the bank's reserves
        { at: ['reserves', 'B'], value: d.cbBonds - d.treasuryAccount - d.cbEquity, source: { basis: 'residual', records: ['fix.cbBonds', 'fix.treasuryAccount', 'fix.cbEquity'], note: 'Central-bank bonds − the treasury account − central-bank equity' } },
        { at: ['loans', 'F'], value: d.loans, source: data('fix.loans') },
        { at: ['capital', 'F'], value: a.stock('capital', 'F'), source: { basis: 'allocated', note: 'Key: the steady state’s capital, kept' } },
      ],
      fills: { deposits: 'B', reserves: 'CB', treasuryAccount: 'CB', loans: 'B', bonds: 'B' },
      vars: {
        price: { value: d.price, history: pathBack(d.price, d.cpiYoY), source: data('fix.cpi', 'fix.cpiYoY') },
        wage: { value: d.wage, history: pathBack(d.wage, d.wageYoY), source: data('fix.wage', 'fix.wageYoY') },
        keyRate: { value: d.keyRate, source: data('fix.keyRate') },
        ruleAnchor: { value: d.keyRate, source: data('fix.keyRate') },
        expectedInflation: { value: d.expectedInflation, source: data('fix.expectedInflation') },
        consumption: { value: d.consumption, source: data('fix.consumption') },
        investmentPlan: { value: d.investmentPlan, source: data('fix.investment') },
      },
      params: {
        inflationTarget: { value: d.inflationTarget, provenance: { basis: 'data', source: 'fix.inflationTarget', vintage: '2026' }, records: ['fix.inflationTarget'] },
        neutralRate: { value: a.param('neutralRate'), provenance: { basis: 'derived', note: 'Closed form: the neutral rate at which the Taylor rule’s target is the key rate in force at month 0.' } },
      },
      anchors: { debtRatio: 'month0' },
      // the Taylor rule's target is the neutral rate plus its inflation and output terms
      derive: (c) => ({ params: { neutralRate: c.p('neutralRate') + c.v('keyRate') - c.v('ruleTarget') } }),
      solve: solveFor(variant),
      checks: [
        { id: 'inflation12', label: '12-month inflation', records: ['fix.cpiYoY'], measure: (c) => c.v('inflation12'), value: d.cpiYoY, tolerance: 0.0005, gate: true },
        { id: 'debt', label: 'Government debt, ISK bn', records: ['fix.govDebt'], measure: (c) => c.stock('bonds', 'G') * FIXTURE_MONEY.perUnit, value: d.govDebt * FIXTURE_MONEY.perUnit, tolerance: 0.1, gate: true },
        { id: 'gdp', label: 'Nominal GDP (cross-check)', records: ['fix.gdp'], measure: (c) => c.v('gdp'), value: 106, tolerance: 1, gate: false },
      ],
      continuity: [
        { id: 'keyRate', label: 'Key rate', measure: (c) => c.v('keyRate'), bound: 0.001 },
        { id: 'inflation', label: 'Inflation this month, annualised', measure: (c) => c.v('inflation'), bound: 0.02 },
        { id: 'output', label: 'Real output (log)', measure: (c) => Math.log(c.v('output')), bound: 0.005, trend: Math.log1p(d.realGrowth) / 12 },
      ],
    }),
  };
}

/** The inert variant's module: a parameter that nothing the targets read depends on. */
const inertModule: ModuleDef = {
  id: 'fixture-inert',
  label: 'Inert knob',
  description: 'Test-only: a parameter and a variable nothing else reads.',
  vars: [{ id: 'inertProbe', label: 'Inert probe', unit: 'fraction', kind: 'ratio' }],
  params: [{ id: 'inertKnob', value: 0, unit: 'fraction', category: 'BEHAVIOUR', description: 'A knob nothing the targets read depends on.', provenance: { basis: 'assumed' } }],
  rules: [{ id: 'inertProbe', target: 'inertProbe', category: 'BEHAVIOUR', params: ['inertKnob'], compute: (c) => c.p('inertKnob'), explain: { what: 'Nothing.', rule: 'The knob.' } }],
};

/** Fixtureland: the reference economy with today's lever settings, the start gaps and the opening. */
export function createFixtureModel(variant: FixtureVariant = 'good'): ModelDef {
  const modules = referenceModel.modules.map((mod) =>
    mod.levers?.some((l) => l.id === 'keyRate') ? { ...mod, levers: mod.levers.map((l) => (l.id === 'keyRate' ? { ...l, default: d.keyRate * 100 } : l)) } : mod,
  );
  const gapped = withStartGaps(
    { ...referenceModel, modules: variant === 'inert' ? [...modules, inertModule] : modules },
    {
      wage: { targets: ['wageGrowth'], fade: 1, scale: 'absolute', bound: 0.05 },
      spending: { targets: ['consumption', 'investmentPlan'], fade: 0.5, scale: 'relative' },
      margins: { targets: ['price'], fade: 0.5, scale: 'relative' },
    },
  );
  return {
    ...gapped,
    id: FIXTURE_ID,
    label: 'Fixtureland · today',
    description: 'The reference economy opened on made-up data for 30 September 2026: a test model for openings.',
    modules: [...gapped.modules, { id: 'concepts', label: 'Concept library', description: 'Economic ideas.', concepts }],
    calibration: [],
    calendar: { month0: { year: 2026, month: 9 } },
    moneyUnit: FIXTURE_MONEY,
    opening: fixtureOpening(variant),
  };
}

export const fixtureModel: ModelDef = createFixtureModel();
