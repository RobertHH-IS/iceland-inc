/**
 * Reference economy: jobs, wages and prices.
 *
 * Firms hire in line with output (Okun's law); wages grow with expected inflation and with how
 * much work firms want compared with normal (a wage Phillips curve), and prices are a markup over
 * the normal labour cost of each unit of output (markup pricing). Expectations adapt to recent
 * inflation. In a boom the unemployment rate approaches the people between jobs but never goes
 * below them: the extra work comes from people joining the labour force and from longer hours,
 * and the wage pressure keeps growing with the work firms want, so excess demand still raises
 * wages and prices.
 */
import type { Ctx, ModuleDef, ParamDef } from '../../core/types.ts';

const assumed = { basis: 'assumed' as const, note: 'Teaching value, chosen to give readable dynamics.' };

/** Unemployment if every extra job were filled from the unemployed: 1 − the baseline employment
 *  rate × the jobs index. It goes below zero in a big enough boom. */
const unemploymentFromJobs = (c: Ctx) => 1 - (1 - c.p('naturalUnemployment')) * c.v('employment');

/** The unemployment rate with its floor: equal to `x` down to `start`, then approaching `floor`
 *  exponentially, never reaching it (continuous, with a continuous slope at `start`). */
export function flooredRate(x: number, floor: number, start: number): number {
  if (x >= start || start <= floor) return Math.max(x, floor);
  return floor + (start - floor) * Math.exp((x - start) / (start - floor));
}

const params: ParamDef[] = [
  { id: 'potentialOutput', value: 100, unit: '% of GDP/yr', category: 'BEHAVIOUR', description: 'What the economy can produce at normal capacity. The baseline runs at capacity, so baseline GDP = 100.', provenance: { basis: 'assumed', note: 'The unit of the model: baseline annual GDP = 100.' } },
  { id: 'naturalUnemployment', value: 0.05, unit: 'fraction', category: 'BEHAVIOUR', description: 'Unemployment at which wages grow only with expected inflation.', provenance: assumed },
  {
    id: 'minUnemployment',
    value: 0.02,
    unit: 'fraction',
    category: 'BEHAVIOUR',
    description: 'Unemployment in the tightest labour market: people between jobs, whom firms cannot hire however much they need workers. The rate approaches it in a boom but never reaches it.',
    provenance: { basis: 'assumed', note: 'Teaching value for frictional unemployment; the lowest rates seen in Nordic and US data are about 1–3%.' },
  },
  {
    id: 'unemploymentFloorStart',
    value: 0.03,
    unit: 'fraction',
    category: 'BEHAVIOUR',
    description: 'Unemployment rate below which extra jobs are filled less and less from the unemployed and more and more by people joining the labour force and by longer hours.',
    provenance: { basis: 'assumed', note: 'Teaching value between the floor and the natural rate, so the baseline and moderate shocks are unchanged (review of the hiring cap, E2).' },
  },
  { id: 'okunCoefficient', value: 0.5, unit: 'fraction', category: 'BEHAVIOUR', description: 'Percent more jobs for each percent of output above capacity.', provenance: assumed },
  { id: 'hiringSpeed', value: 4, unit: 'per year', category: 'BEHAVIOUR', description: 'How fast firms close the gap between the jobs they have and the jobs they need.', provenance: assumed },
  { id: 'markup', value: 0.5, unit: 'fraction', category: 'BEHAVIOUR', description: 'Price over normal labour cost: 0.5 means prices are 50% above what the labour in a product costs.', provenance: assumed },
  { id: 'priceSpeed', value: 1.5, unit: 'per year', category: 'BEHAVIOUR', description: 'How fast prices catch up with their target.', provenance: assumed },
  { id: 'phillipsSlope', value: 0.5, unit: 'per year', category: 'BEHAVIOUR', description: 'Extra wage growth per point of unemployment below its natural rate.', provenance: assumed },
  { id: 'wageIndexation', value: 0.7, unit: 'fraction', category: 'BEHAVIOUR', description: 'Share of expected inflation that wage demands pass on.', provenance: assumed },
  { id: 'wageFloor', value: -0.02, unit: 'fraction/yr', category: 'BEHAVIOUR', description: 'Wages are sticky downwards: they fall by at most this much a year, however slack the labour market.', provenance: assumed },
  { id: 'expectationsSpeed', value: 1, unit: 'per year', category: 'BEHAVIOUR', description: 'How fast expected inflation adapts to actual inflation.', provenance: assumed },
];

export const labourPrices: ModuleDef = {
  id: 'labour-and-prices',
  label: 'Jobs, wages and prices',
  description: 'Employment follows output; wages follow expected inflation and labour-market tightness; prices are a markup on labour cost.',
  requires: ['structure'],
  params,
  vars: [
    { id: 'employment', label: 'Jobs', unit: 'index', kind: 'index', scale: 'real', initial: 1, description: 'Number of jobs relative to the baseline (1 = baseline).' },
    { id: 'unemployment', label: 'Unemployment rate', unit: 'fraction', kind: 'ratio', scale: 'none', initial: 0.05 },
    { id: 'wages', label: 'Wage bill', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 66.67 },
    { id: 'wageGrowth', label: 'Wage growth', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0 },
    { id: 'wage', label: 'Wage rate', unit: 'index', kind: 'price', scale: 'nominal', initial: 1 },
    { id: 'price', label: 'Price level', unit: 'index', kind: 'price', scale: 'nominal', initial: 1 },
    { id: 'inflation', label: 'Inflation (this month, annualised)', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0 },
    { id: 'inflation12', label: 'Inflation (12 months)', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0 },
    { id: 'expectedInflation', label: 'Expected inflation', unit: 'fraction/yr', kind: 'expectation', scale: 'none', initial: 0 },
  ],
  rules: [
    {
      id: 'employment',
      target: 'employment',
      category: 'BEHAVIOUR',
      label: 'Hiring',
      inputs: ['output'],
      params: ['okunCoefficient', 'potentialOutput'],
      adjust: { speed: 'hiringSpeed' },
      terms: [
        { id: 'normal', label: 'Normal number of jobs', compute: () => 1 },
        { id: 'outputGap', label: 'Output above capacity', concept: 'okun-law', compute: (c) => c.p('okunCoefficient') * (c.v('output') / c.p('potentialOutput') - 1) },
      ],
      concepts: ['okun-law', 'capacity-utilisation'],
      explain: {
        what: 'How much work firms employ, as an index where 1 is the baseline: jobs, counted in normal full-time hours.',
        rule: 'Firms move toward the work they need at speed {hiringSpeed} a year. They need {okunCoefficient}% more for each 1% of output above capacity (Okun’s law). In a strong boom the extra work comes more and more from people joining the labour force and from longer hours rather than from the unemployed (see the unemployment rate).',
      },
    },
    {
      id: 'unemployment',
      target: 'unemployment',
      category: 'BEHAVIOUR',
      label: 'Unemployment',
      inputs: ['employment'],
      params: ['naturalUnemployment', 'minUnemployment', 'unemploymentFloorStart'],
      terms: [
        { id: 'normal', label: 'Normal unemployment', compute: (c) => c.p('naturalUnemployment') },
        { id: 'jobs', label: 'Jobs above normal', concept: 'okun-law', compute: (c) => unemploymentFromJobs(c) - c.p('naturalUnemployment') },
      ],
      // Not additive at the bottom: the people between jobs cannot be hired.
      combine: (t, c) => flooredRate(t.normal + t.jobs, c.p('minUnemployment'), c.p('unemploymentFloorStart')),
      regime: (c, _v, t) => (t.normal + t.jobs < c.p('unemploymentFloorStart') ? 'Few unemployed left: extra work comes from people joining the labour force and longer hours' : null),
      concepts: ['okun-law'],
      explain: {
        what: 'Share of the labour force without a job.',
        rule: 'Unemployment = 1 − baseline employment rate × jobs index. The baseline rate is {naturalUnemployment%}. Below {unemploymentFloorStart%}, fewer and fewer of the extra jobs go to the unemployed: people join the labour force and work longer hours instead, so the rate approaches {minUnemployment%} (people between jobs) but never reaches it.',
      },
    },
    {
      id: 'wages',
      target: 'wages',
      category: 'IDENTITY',
      inputs: ['wage', 'employment'],
      params: ['potentialOutput', 'markup'],
      compute: (c) => (c.v('wage') * c.v('employment') * c.p('potentialOutput')) / (1 + c.p('markup')),
      explain: {
        what: 'Wages firms pay households, in % of baseline GDP a year.',
        rule: 'Wage bill = wage rate × jobs × baseline wage bill. At baseline, wages are the labour share of GDP, 100 / (1 + {markup}).',
      },
    },
    {
      id: 'wageGrowth',
      target: 'wageGrowth',
      category: 'BEHAVIOUR',
      label: 'Wage Phillips curve',
      lagInputs: ['expectedInflation', 'employment'],
      params: ['wageIndexation', 'phillipsSlope', 'naturalUnemployment', 'wageFloor'],
      terms: [
        { id: 'expectedInflation', label: 'Expected inflation', concept: 'adaptive-expectations', compute: (c) => c.p('wageIndexation') * c.lag('expectedInflation') },
        // Read from the work firms employ, not the floored unemployment rate: when the unemployed
        // run out, the extra hours and newcomers still have to be paid for.
        { id: 'tightLabourMarket', label: 'Tight labour market', concept: 'wage-phillips-curve', compute: (c) => c.p('phillipsSlope') * (1 - c.p('naturalUnemployment')) * (c.lag('employment') - 1) },
      ],
      // Not additive: the sum of the terms, but never below the floor.
      combine: (t, c) => Math.max(c.p('wageFloor'), t.expectedInflation + t.tightLabourMarket),
      regime: (c, _v, t) => (t.expectedInflation + t.tightLabourMarket < c.p('wageFloor') ? 'Wages sticky downwards' : null),
      concepts: ['wage-phillips-curve'],
      explain: {
        what: 'How fast wage rates rise, per year.',
        rule: 'Wage growth = {wageIndexation} × expected inflation + {phillipsSlope} × the work firms employed last month above normal, as a share of the labour force (the fall in unemployment it would bring, if every extra job went to someone unemployed), but wages fall by no more than {wageFloor%} a year. Scarce workers push pay up faster, and once the unemployed run out, the extra hours and the people drawn into work push it up further still.',
      },
    },
    {
      id: 'wage',
      target: 'wage',
      category: 'IDENTITY',
      inputs: ['wageGrowth'],
      lagInputs: ['wage'],
      compute: (c) => c.lag('wage') * (1 + c.v('wageGrowth') * c.dt),
      concepts: ['wage-phillips-curve'],
      explain: {
        what: 'The wage rate, as an index (1 = baseline).',
        rule: 'This month’s wage rate = last month’s × (1 + wage growth × one month). A wage settlement lifts it in one go.',
      },
    },
    {
      id: 'price',
      target: 'price',
      category: 'BEHAVIOUR',
      label: 'Markup pricing',
      inputs: ['wage'],
      params: ['markup'],
      adjust: { speed: 'priceSpeed' },
      terms: [
        { id: 'labourCost', label: 'Labour cost per unit', concept: 'cost-pass-through', compute: (c) => c.v('wage') / (1 + c.p('markup')) },
        { id: 'markup', label: 'Markup', concept: 'markup-pricing', compute: (c) => (c.p('markup') * c.v('wage')) / (1 + c.p('markup')) },
      ],
      concepts: ['markup-pricing', 'cost-pass-through'],
      explain: {
        what: 'The price level of goods and services, as an index (1 = baseline).',
        rule: 'Firms aim for a price {markup%} above the normal labour cost of each unit they sell, and move toward it at speed {priceSpeed} a year. Higher wages pass through to prices.',
      },
    },
    {
      id: 'inflation',
      target: 'inflation',
      category: 'IDENTITY',
      inputs: ['price'],
      lagInputs: ['price'],
      compute: (c) => Math.log(c.v('price') / c.lag('price')) / c.dt,
      explain: { what: 'How fast prices rose this month, at an annual rate.', rule: 'Inflation = change in the log price level this month ÷ one month.' },
    },
    {
      id: 'inflation12',
      target: 'inflation12',
      category: 'IDENTITY',
      inputs: ['price'],
      lagInputs: ['price'],
      compute: (c) => c.v('price') / c.lag('price', Math.round(1 / c.dt)) - 1,
      explain: { what: 'How much prices rose over the past 12 months.', rule: 'Inflation (12 months) = price level ÷ price level a year ago − 1.' },
    },
    {
      id: 'expectedInflation',
      target: 'expectedInflation',
      category: 'BEHAVIOUR',
      inputs: ['inflation'],
      adjust: { speed: 'expectationsSpeed' },
      terms: [{ id: 'recentInflation', label: 'Recent inflation', concept: 'adaptive-expectations', compute: (c) => c.v('inflation') }],
      concepts: ['adaptive-expectations'],
      explain: {
        what: 'The inflation people expect, which feeds into wage demands.',
        rule: 'Expected inflation moves toward actual inflation at speed {expectationsSpeed} a year: people learn from what they see.',
      },
    },
  ],
  flows: [
    {
      id: 'wages',
      label: 'Wages',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'F', to: 'HH', amount: 'wages' }],
      concepts: ['double-entry'],
      explain: { what: 'Firms pay wages to households: minus for firms, plus for households, and deposits move between them.' },
    },
  ],
  levers: [
    {
      id: 'wageSettlement',
      label: 'Wage settlement',
      group: 'Economy',
      section: 'Labour market',
      kind: 'oneoff',
      unit: '%',
      default: 10,
      min: -5,
      max: 15,
      step: 0.5,
      description: 'A one-off jump in wage rates, as after a collective agreement.',
      definition:
        'One-off level shift: the wage rate jumps by this percentage in the month the lever is fired. It is not reversed; afterwards wages grow by the Phillips curve again, and prices, jobs and the key rate respond.',
      concepts: ['wage-phillips-curve', 'cost-pass-through'],
      fire: (s, size) => s.setLagged('wage', s.get('wage') * (1 + size / 100)),
    },
  ],
  tests: [
    {
      id: 'price-is-markup-over-labour-cost',
      label: 'At baseline the price level equals (1 + markup) × labour cost per unit',
      run: (e) => {
        const markup = e.influences('price').params.find((p) => p.id === 'markup')!.value;
        const want = ((1 + markup) * e.baseline('wage')) / (1 + markup);
        const got = e.baseline('price');
        return { pass: Math.abs(got - want) < 1e-9, detail: `price ${got.toFixed(12)} vs markup rule ${want.toFixed(12)}` };
      },
    },
    {
      id: 'wage-settlement-lifts-prices',
      label: 'A 10% wage settlement raises the price level, but by less than 10% within a year',
      run: (e) => {
        e.fire('wageSettlement', 10);
        e.step(12);
        const rise = (e.value('price') / e.baseline('price') - 1) * 100;
        return { pass: rise > 1 && rise < 10, detail: `price level after 12 months: +${rise.toFixed(2)}%` };
      },
    },
  ],
};
