/**
 * Iceland Inc.: jobs and wages (v1 equations E6, E28–E30).
 *
 * Employment in each kind of firm follows its output (Okun's law) and falls when wages outpace
 * prices. Jobs gained or lost fall most on the young, and part of any change is met by migration,
 * which moves the labour force too. Wages grow with expected inflation and a tight labour market
 * (a wage Phillips curve), and slow while they are high relative to domestic prices (the Nordic
 * main-course error correction). A wage settlement lifts the wage rate at once.
 *
 * Employment is measured as a wage bill at the baseline wage rate (% of GDP), so the wages a
 * group earns are simply wage rate × employment.
 */
import type { ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { AGE_LABEL, AGES, HH, pickParams, terms, lastMonth } from '../util.ts';

const EMPLOYERS = [
  ['FD', 'domestic firms'],
  ['FX', 'exporters'],
] as const;

const byAge: RuleDef[] = AGES.flatMap((g): RuleDef[] => [
  {
    id: `employment${g}`,
    target: `employment${g}`,
    category: 'BEHAVIOUR',
    inputs: ['employmentTotal'],
    params: [`Ng0${g}`, `cycSh${g}`, 'Ntot0'],
    terms: terms(
      ['normal', 'Baseline employment', undefined, (c) => c.p(`Ng0${g}`)],
      ['swing', 'Share of jobs gained or lost', 'okun-law', (c) => c.p(`cycSh${g}`) * (c.v('employmentTotal') - c.p('Ntot0'))],
    ),
    explain: {
      what: `Jobs held by the ${AGE_LABEL[g]}, measured as their wage bill at the baseline wage rate (% of GDP).`,
      rule: `Baseline jobs + a share {cycSh${g}} of any change in total employment. The young take the largest share of job gains and losses.`,
    },
  },
  {
    id: `unemployed${g}`,
    target: `unemployed${g}`,
    category: 'BEHAVIOUR',
    inputs: [`employment${g}`],
    params: [`U0${g}`, `emp0${g}`, `wb${g}`, 'mig'],
    terms: terms(
      ['normal', 'Unemployed at baseline', undefined, (c) => c.p(`U0${g}`)],
      ['jobs', 'Jobs gained or lost', 'okun-law', (c) => -(c.v(`employment${g}`) / c.p(`wb${g}`) - c.p(`emp0${g}`))],
      ['migration', 'Workers arriving or leaving', 'migration-buffer', (c) => c.p('mig') * (c.v(`employment${g}`) / c.p(`wb${g}`) - c.p(`emp0${g}`))],
    ),
    explain: {
      what: `People aged ${g === 'Y' ? '18–34' : g === 'W' ? '35–66' : '67+'} who want a job but have none, in thousands.`,
      rule: `Unemployed = baseline unemployed − (workers − baseline workers) × (1 − {mig}). Workers = jobs ÷ the wage per worker; a share {mig} of any change in jobs is met by people arriving or leaving, so it does not change unemployment.`,
    },
  },
  {
    id: `unemployment${g}`,
    target: `unemployment${g}`,
    category: 'IDENTITY',
    inputs: [`unemployed${g}`, `employment${g}`],
    params: [`wb${g}`],
    compute: (c) => {
      const u = c.v(`unemployed${g}`);
      return u / (u + c.v(`employment${g}`) / c.p(`wb${g}`));
    },
    concepts: ['okun-law'],
    explain: { what: `Unemployment rate of the ${AGE_LABEL[g]}.`, rule: 'Unemployed ÷ (unemployed + workers).' },
  },
]);

const wageLegs: RuleDef[] = EMPLOYERS.flatMap(([j, who]) =>
  AGES.map(
    (g): RuleDef => ({
      id: `wages${j}_${HH[g]}`,
      target: `wages${j}_${HH[g]}`,
      category: 'IDENTITY',
      inputs: ['wage', `employment${j}`, `employment${g}`, 'employmentTotal'],
      params: ['cEe'],
      compute: (c) => ((1 - c.p('cEe')) * c.v('wage') * c.v(`employment${j}`) * c.v(`employment${g}`)) / c.v('employmentTotal'),
      explain: {
        what: `Wages ${who} pay the ${AGE_LABEL[g]}, after the employee pension contribution (which goes straight to the pension funds).`,
        rule: `(1 − {cEe%}) × wage rate × ${who}’ employment × the ${AGE_LABEL[g]}’s share of all jobs.`,
      },
    }),
  ),
);

const vars: VarDef[] = [
  { id: 'wageGrowth', label: 'Wage growth', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0 },
  { id: 'wage', label: 'Wage rate', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'Gross nominal wage rate, 1 at baseline.' },
  { id: 'settlementJump', label: 'Wage settlement this month', unit: 'log points', kind: 'ratio', scale: 'none', initial: 0, description: 'The one-off jump of a collective agreement, in log points; zero in every month without one.' },
  { id: 'employmentFX', label: 'Employment, exporters', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('employmentFX'), description: 'Exporters’ jobs as a gross wage bill at baseline wages.' },
  { id: 'valueAddedFD', label: 'Value added, domestic firms (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('valueAddedFD') },
  { id: 'employmentFD', label: 'Employment, domestic firms', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('employmentFD'), description: 'Domestic firms’ jobs as a gross wage bill at baseline wages.' },
  { id: 'employmentTotal', label: 'Employment, all sectors', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('employmentTotal'), description: 'All jobs, public and private, as a gross wage bill at baseline wages.' },
  ...AGES.flatMap((g): VarDef[] => [
    { id: `employment${g}`, label: `Employment, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base(`employment${g}`) },
    { id: `unemployed${g}`, label: `Unemployed, ${AGE_LABEL[g]}`, unit: 'thousand persons', kind: 'quantity', scale: 'none', initial: base(`unemployed${g}`) },
    { id: `unemployment${g}`, label: `Unemployment rate, ${AGE_LABEL[g]}`, unit: 'fraction', kind: 'ratio', scale: 'none', initial: base(`unemployment${g}`) },
  ]),
  { id: 'unemployment', label: 'Unemployment rate', unit: 'fraction', kind: 'ratio', scale: 'none', initial: base('unemployment') },
  ...EMPLOYERS.flatMap(([j, who]) => AGES.map((g): VarDef => ({ id: `wages${j}_${HH[g]}`, label: `Wages, ${who} → ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' }))),
];

export const labourAndWages: ModuleDef = {
  id: 'labour-and-wages',
  label: 'Jobs and wages',
  description: 'Employment by sector and age group, unemployment with a migration buffer, and a wage Phillips curve with error correction.',
  requires: ['structure', 'prices', 'external', 'government', 'households'],
  params: pickParams(ALL_PARAMS, [
    'phiU', 'phiW', 'lamN', 'okun', 'sigW', 'mig', 'cEe', 'compTotal', 'fxEmpShare',
    ...AGES.flatMap((g) => [`pop${g}`, `er${g}`, `u0${g}`, `wsh${g}`, `cyc${g}`]), 'uBase', 'Ntot0', 'NFD0', 'NFX0', 'vaFD0', 'vaFX0',
    ...AGES.flatMap((g) => [`Ng0${g}`, `cycSh${g}`, `U0${g}`, `emp0${g}`, `wb${g}`]),
  ]),
  vars,
  rules: [
    {
      id: 'wageGrowth',
      target: 'wageGrowth',
      category: 'BEHAVIOUR',
      label: 'Wage Phillips curve with error correction',
      lagInputs: ['expectedInflation', 'unemployment', 'wage', 'domesticPrice'],
      params: ['phiU', 'phiW', 'uBase'],
      terms: terms(
        ['expectedInflation', 'Expected inflation', 'adaptive-expectations', (c) => lastMonth(c, 'expectedInflation')],
        ['tightLabourMarket', 'Tight labour market', 'wage-phillips-curve', (c) => c.p('phiU') * (c.p('uBase') - lastMonth(c, 'unemployment'))],
        ['errorCorrection', 'Wages high relative to prices', 'real-wages', (c) => -c.p('phiW') * Math.log(lastMonth(c, 'wage') / lastMonth(c, 'domesticPrice'))],
      ),
      concepts: ['wage-bargaining', 'wage-phillips-curve'],
      explain: {
        what: 'How fast wage rates rise, per year, between settlements.',
        rule: 'Wage growth = expected inflation + {phiU} × (normal unemployment {uBase%} − last month’s unemployment) − {phiW} × the log of wages relative to domestic prices. Scarce workers push pay up; wages that have run ahead of prices slow down until the wage share is back to normal (the main-course model).',
      },
    },
    {
      id: 'wage',
      target: 'wage',
      category: 'IDENTITY',
      inputs: ['wageGrowth'],
      lagInputs: ['wage', 'settlementJump'],
      terms: terms(
        ['previous', 'Last month’s wage rate', undefined, (c) => c.lag('wage')],
        ['growth', 'Growth this month', 'wage-phillips-curve', (c) => c.lag('wage') * (Math.exp(c.v('wageGrowth') * c.dt) - 1)],
        ['settlement', 'Wage settlement', 'wage-bargaining', (c) => c.lag('wage') * Math.exp(c.v('wageGrowth') * c.dt) * (Math.exp(c.lag('settlementJump')) - 1)],
      ),
      concepts: ['wage-bargaining'],
      explain: {
        what: 'The gross wage rate, as an index (1 at baseline).',
        rule: 'This month’s wage rate = last month’s × e^(wage growth × one month) × e^(any settlement signed this month). A settlement lifts pay in one go, on top of the month’s normal growth.',
      },
    },
    {
      id: 'settlementJump',
      target: 'settlementJump',
      category: 'IDENTITY',
      compute: () => 0,
      concepts: ['wage-bargaining'],
      explain: {
        what: 'A collective agreement signed this month, in log points (0.095 for +10%).',
        rule: 'Zero in every month without a settlement; the wage-settlement lever sets it for the month it is fired, and the wage rate carries it from then on.',
      },
    },
    {
      id: 'employmentFX',
      target: 'employmentFX',
      category: 'BEHAVIOUR',
      label: 'Exporters’ hiring',
      inputs: ['valueAddedFX', 'wage', 'domesticPrice'],
      params: ['NFX0', 'vaFX0', 'okun', 'sigW'],
      adjust: { speed: 'lamN', form: 'exponential' },
      terms: terms(
        ['normal', 'Baseline jobs', undefined, (c) => c.p('NFX0')],
        ['output', 'Output relative to baseline', 'okun-law', (c) => Math.pow(Math.max(1e-6, c.v('valueAddedFX') / c.p('vaFX0')), c.p('okun'))],
        ['realWage', 'Real product wage', 'real-wages', (c) => Math.pow(c.v('wage') / c.v('domesticPrice'), -c.p('sigW'))],
      ),
      combine: (t) => t.normal * t.output * t.realWage,
      concepts: ['okun-law', 'profit-squeeze'],
      explain: {
        what: 'Exporters’ jobs, measured as their wage bill at baseline wages.',
        rule: 'Exporters aim for baseline jobs × (value added ÷ baseline)^{okun} × (wage ÷ domestic price)^−{sigW}, and move toward it at speed {lamN} a year. Firms hoard some labour, and economise on staff when pay outpaces prices.',
      },
    },
    {
      id: 'valueAddedFD',
      target: 'valueAddedFD',
      category: 'IDENTITY',
      inputs: ['output', 'valueAddedFX', 'publicValueAdded'],
      terms: terms(
        ['output', 'Output', 'multiplier', (c) => c.v('output')],
        ['exporters', 'Exporters’ value added', 'export-sectors', (c) => -c.v('valueAddedFX')],
        ['public', 'Public services’ value added', undefined, (c) => -c.v('publicValueAdded')],
      ),
      explain: { what: 'What domestic-market firms add to output, at baseline prices.', rule: 'Their value added = real output − exporters’ value added − public staff.' },
    },
    {
      id: 'employmentFD',
      target: 'employmentFD',
      category: 'BEHAVIOUR',
      label: 'Domestic firms’ hiring',
      inputs: ['valueAddedFD', 'wage', 'domesticPrice'],
      params: ['NFD0', 'vaFD0', 'okun', 'sigW'],
      adjust: { speed: 'lamN', form: 'exponential' },
      terms: terms(
        ['normal', 'Baseline jobs', undefined, (c) => c.p('NFD0')],
        ['output', 'Output relative to baseline', 'okun-law', (c) => Math.pow(Math.max(1e-6, c.v('valueAddedFD') / c.p('vaFD0')), c.p('okun'))],
        ['realWage', 'Real product wage', 'real-wages', (c) => Math.pow(c.v('wage') / c.v('domesticPrice'), -c.p('sigW'))],
      ),
      combine: (t) => t.normal * t.output * t.realWage,
      concepts: ['okun-law', 'profit-squeeze'],
      explain: {
        what: 'Domestic firms’ jobs, measured as their wage bill at baseline wages.',
        rule: 'Firms aim for baseline jobs × (value added ÷ baseline)^{okun} × (wage ÷ domestic price)^−{sigW}, and move toward it at speed {lamN} a year.',
      },
    },
    {
      id: 'employmentTotal',
      target: 'employmentTotal',
      category: 'IDENTITY',
      inputs: ['employmentFD', 'employmentFX', 'publicEmployment'],
      terms: terms(
        ['domestic', 'Domestic firms', undefined, (c) => c.v('employmentFD')],
        ['exporters', 'Exporters', 'export-sectors', (c) => c.v('employmentFX')],
        ['public', 'Public services', undefined, (c) => c.v('publicEmployment')],
      ),
      explain: { what: 'All jobs, measured as a wage bill at baseline wages.', rule: 'Total = domestic firms + exporters + public services.' },
    },
    ...byAge,
    {
      id: 'unemployment',
      target: 'unemployment',
      category: 'IDENTITY',
      inputs: [...AGES.map((g) => `unemployed${g}`), ...AGES.map((g) => `employment${g}`)],
      params: AGES.map((g) => `wb${g}`),
      compute: (c) => {
        let u = 0,
          lf = 0;
        for (const g of AGES) {
          const ug = c.v(`unemployed${g}`);
          u += ug;
          lf += ug + c.v(`employment${g}`) / c.p(`wb${g}`);
        }
        return u / lf;
      },
      concepts: ['okun-law'],
      explain: { what: 'Share of the labour force without a job.', rule: 'All unemployed ÷ the whole labour force, summed over the three age groups.' },
    },
    ...wageLegs,
  ],
  flows: [
    {
      id: 'wages',
      label: 'Wages (private sector)',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: EMPLOYERS.flatMap(([j]) => AGES.map((g) => ({ from: j, to: HH[g], amount: `wages${j}_${HH[g]}` }))),
      concepts: ['double-entry'],
      explain: { what: 'Firms pay wages into households’ deposit accounts, net of the employee pension contribution, which goes straight to the pension funds.' },
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
      max: 20,
      step: 0.5,
      description: 'A one-off jump in nominal wage rates, as after a collective agreement.',
      definition:
        'One-off level shift: the wage rate, private and public, jumps by this percentage in the month the lever is fired. It is not reversed; afterwards wages follow the Phillips curve, whose error correction slowly pulls the real wage back toward normal.',
      concepts: ['wage-bargaining', 'cost-pass-through', 'profit-squeeze'],
      fire: (s, size) => s.setLagged('settlementJump', s.get('settlementJump') + Math.log(1 + size / 100)),
    },
    {
      id: 'migration',
      label: 'Migration buffer',
      group: 'Economy',
      section: 'Labour market',
      kind: 'setting',
      unit: '%',
      default: 30,
      min: 0,
      max: 80,
      step: 5,
      binds: { param: 'mig', mode: 'replace', scale: 0.01 },
      description: 'Share of job gains or losses met by workers arriving or leaving.',
      definition:
        'Level of the migration share, in percent of any change in jobs, persistent while set. It applies to changes in jobs relative to baseline, so a new setting re-sizes the labour force at once. Setting it back to 30 restores the baseline behaviour.',
      concepts: ['migration-buffer'],
    },
  ],
  tests: [
    {
      id: 'baseline-unemployment-from-data',
      label: 'At baseline each age group’s unemployment rate equals the data (5.8%, 3.5%, 1.2%)',
      run: (e) => {
        const got = AGES.map((g) => e.baseline(`unemployment${g}`));
        const want = [0.058, 0.035, 0.012];
        const ok = got.every((x, j) => Math.abs(x - want[j]) < 1e-9);
        return { pass: ok, detail: got.map((x) => (100 * x).toFixed(3) + '%').join(', ') };
      },
    },
    {
      id: 'young-jobs-swing-most',
      label: 'A wage settlement raises unemployment, most among the young',
      run: (e) => {
        e.fire('wageSettlement', 10);
        e.step(24);
        const d = AGES.map((g) => e.value(`unemployment${g}`) - e.baseline(`unemployment${g}`));
        return { pass: d[0] > d[1] && d[1] > 0 && d[0] > 0, detail: `after 24 months: young +${(100 * d[0]).toFixed(2)} pp, working age +${(100 * d[1]).toFixed(2)} pp, older +${(100 * d[2]).toFixed(2)} pp` };
      },
    },
  ],
};
