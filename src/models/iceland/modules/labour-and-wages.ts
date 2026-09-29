/**
 * Iceland Inc.: jobs and wages (v1 equations E6, E28–E30).
 *
 * Employment in each of the six firm sectors follows its own output (Okun's law) and falls when
 * wages outpace prices. Jobs gained or lost fall most on the young, tourism's more so, and part of
 * any change is met by migration, which moves the labour force too. When a group runs short of
 * unemployed people, extra jobs are filled more and more by people arriving from abroad, so
 * unemployment approaches a frictional floor but never goes below it. More generous unemployment
 * benefits make people search longer, and a net-immigration lever adds people to the labour force
 * for good.
 * Wages grow with expected inflation and a tight labour market (a wage Phillips curve), and slow
 * while they are high relative to the value-added price, domestic prices less the imported inputs
 * in them (the Nordic main-course error correction, as bargainers see it, with a lag). A wage
 * settlement lifts the wage rate at once.
 *
 * Employment is measured as a wage bill at the baseline wage rate (% of GDP), so the wages a
 * group earns are simply wage rate × employment.
 */
import type { Ctx, ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { AGE_LABEL, AGES, FIRMS, FIRM_NAME, HH, pickParams, terms, lastMonth, VA0, type Age, type Firm } from '../util.ts';

/** Tourism employs more young people than other firms (youthTiltXT); retail and services employ
 *  correspondingly fewer, so every age group's total pay is unchanged. The extra pay moved from
 *  working-age to young workers in tourism, and back in retail and services. */
const youthSwap = (c: Ctx) => c.p('youthTiltXT') * (1 - c.p('cEe')) * c.v('wage') * c.v('employmentXT') * (c.v('employmentY') / c.v('employmentTotal'));
/** Unemployed after the frictional floor: x itself down to start × U0, then a smooth approach to
 *  floor × U0 (the value and slope match at the join, so the income–spending block stays smooth).
 *  At baseline x = U0 is above the join, so the baseline is exactly as before. */
export function flooredUnemployed(x: number, u0: number, floor: number, start: number): number {
  return smoothFloor(x, floor * u0, start * u0);
}
/** x itself down to `join`, then a smooth approach to `lo` from above (value and slope match at the
 *  join). */
function smoothFloor(x: number, lo: number, join: number): number {
  if (x >= join || join <= lo) return Math.max(x, lo);
  return lo + (join - lo) * Math.exp((x - join) / (join - lo));
}
/** Last month's unemployment rate without the extra people searching longer because benefits are
 *  more generous than normal: unemployed × (1 + s) out of a labour force grown by the same people,
 *  so the rate without them is u ÷ (1 + s × (1 − u)). They do not hold wages back. */
export const restrainingUnemployment = (c: Ctx) => {
  const u = lastMonth(c, 'unemployment'),
    s = lastMonth(c, 'benefitSearch');
  return u / (1 + s * (1 - u));
};
/** Newcomers of the net-immigration lever as a share of the baseline labour force (0 at baseline). */
export const newcomerShare = (c: Ctx): number => {
  let lf = 0;
  for (const g of AGES) lf += c.p(`U0${g}`) + c.p(`emp0${g}`);
  return c.lag('labourInflow') / lf;
};
/** The value-added price never falls below this share of domestic prices, and bends smoothly toward
 *  that floor from twice it (only when imported inputs cost about 60% more than domestic goods). */
const VA_PRICE_FLOOR = 0.25;

const swapSign = (j: Firm, g: Age): number => (g === 'O' ? 0 : j === 'XT' ? (g === 'Y' ? 1 : -1) : j === 'FR' ? (g === 'Y' ? -1 : 1) : 0);

const byAge: RuleDef[] = AGES.flatMap((g): RuleDef[] => {
  // ids built once, not on every evaluation (these rules sit in the income–spending block)
  const [ng0, cyc, u0, emp0, wb, emp, un, inflow] = [`Ng0${g}`, `cycSh${g}`, `U0${g}`, `emp0${g}`, `wb${g}`, `employment${g}`, `unemployed${g}`, `inflowSh${g}`];
  return [
    {
      id: `employment${g}`,
      target: `employment${g}`,
      category: 'BEHAVIOUR',
      inputs: ['employmentTotal', ...(g === 'O' ? [] : ['employmentXT'])],
      params: [`Ng0${g}`, `cycSh${g}`, 'Ntot0', ...(g === 'O' ? [] : ['youthTiltXT', 'Ng0Y', 'NXT0'])],
      terms: terms(
        ['normal', 'Baseline employment', undefined, (c) => c.p(ng0)],
        ['swing', 'Share of jobs gained or lost', 'okun-law', (c) => c.p(cyc) * (c.v('employmentTotal') - c.p('Ntot0'))],
        ...(g === 'O'
          ? []
          : ([['tourism', 'Tourism jobs are young people’s jobs', 'export-sectors', (c: Ctx) => (g === 'Y' ? 1 : -1) * c.p('youthTiltXT') * (c.p('Ng0Y') / c.p('Ntot0')) * (c.v('employmentXT') - c.p('NXT0'))]] as [string, string, string, (c: Ctx) => number][])),
      ),
      explain: {
        what: `Jobs held by the ${AGE_LABEL[g]}, measured as their wage bill at the baseline wage rate (% of GDP).`,
        rule:
          g === 'O'
            ? 'Baseline jobs + a share {cycShO} of any change in total employment.'
            : `Baseline jobs + a share {cycSh${g}} of any change in total employment ${g === 'Y' ? '+' : '−'} {youthTiltXT} × the young’s share of jobs × the change in tourism jobs. The young take the largest share of job gains and losses, and tourism, which employs many of them, moves ${g === 'Y' ? 'their jobs more' : 'working-age jobs less'}.`,
      },
    },
    {
      id: `unemployed${g}`,
      target: `unemployed${g}`,
      category: 'BEHAVIOUR',
      inputs: [`employment${g}`, 'benefitSearch', 'labourInflow'],
      params: [`U0${g}`, `emp0${g}`, `wb${g}`, 'mig', 'uFloor', 'uFloorStart', inflow],
      terms: terms(
        ['normal', 'Unemployed at baseline', undefined, (c) => c.p(u0)],
        ['jobs', 'Jobs gained or lost', 'okun-law', (c) => -(c.v(emp) / c.p(wb) - c.p(emp0))],
        ['migration', 'Workers arriving or leaving', 'migration-buffer', (c) => c.p('mig') * (c.v(emp) / c.p(wb) - c.p(emp0))],
        ['search', 'Higher benefits: people search longer', 'reservation-wage', (c) => c.v('benefitSearch') * (c.p(u0) + (c.p('mig') - 1) * (c.v(emp) / c.p(wb) - c.p(emp0) - c.p(inflow) * c.v('labourInflow')))],
        ['arrivals', 'Newcomers from abroad not yet in work (the net-immigration lever)', 'migration-buffer', (c) => (1 - c.p('mig')) * c.p(inflow) * c.v('labourInflow')],
      ),
      combine: (t, c) => flooredUnemployed(t.normal + t.jobs + t.migration + t.search + t.arrivals, c.p(u0), c.p('uFloor'), c.p('uFloorStart')),
      regime: (c, _v, t) => (t.normal + t.jobs + t.migration + t.search + t.arrivals < c.p('uFloorStart') * c.p(u0) ? 'Few unemployed left: extra jobs go to people arriving from abroad' : null),
      concepts: ['migration-buffer', 'reservation-wage'],
      explain: {
        what: `People aged ${g === 'Y' ? '18–34' : g === 'W' ? '35–66' : '67+'} who want a job but have none, in thousands.`,
        rule: `Unemployed = [baseline unemployed − (workers − baseline workers) × (1 − {mig})] × (1 + the benefit search effect) + (1 − {mig}) × a share {inflowSh${g}} of the newcomers from abroad (the net-immigration lever). Newcomers join the labour force for good and take the first new jobs, so the buffer counts jobs against a labour force that includes them: while there are too few jobs for them, a share {mig} of the shortfall moves on and the rest are unemployed. Workers = jobs ÷ the wage per worker; a share {mig} of any change in jobs is met by people arriving or leaving, so it does not change unemployment. When benefits are more generous than normal, people out of work take longer to find a job they will accept, so more of them are unemployed at any time; they join the labour force rather than leave a job. When that would take the group below {uFloorStart} of its normal number of unemployed, the migration share rises: more and more of the extra jobs are filled by people arriving from abroad, so unemployment approaches {uFloor} of normal (people between jobs) but never goes below it, and never below zero. The newcomers join the labour force.`,
      },
    },
    {
      id: `unemployment${g}`,
      target: `unemployment${g}`,
      category: 'IDENTITY',
      inputs: [`unemployed${g}`, `employment${g}`],
      params: [`wb${g}`],
      compute: (c) => {
        const u = c.v(un);
        return u / (u + c.v(emp) / c.p(wb));
      },
      concepts: ['okun-law'],
      explain: { what: `Unemployment rate of the ${AGE_LABEL[g]}.`, rule: 'Unemployed ÷ (unemployed + workers).' },
    },
  ];
});

const wageLegs: RuleDef[] = FIRMS.flatMap((j) =>
  AGES.map((g): RuleDef => {
    const sw = swapSign(j, g);
    const who = FIRM_NAME[j];
    return {
      id: `wages${j}_${HH[g]}`,
      target: `wages${j}_${HH[g]}`,
      category: 'IDENTITY',
      inputs: ['wage', `employment${j}`, `employment${g}`, 'employmentTotal', ...(sw ? ['employmentXT', 'employmentY'] : [])],
      params: ['cEe', ...(sw ? ['youthTiltXT'] : [])],
      ...(sw
        ? {
            terms: terms(
              ['share', 'Their share of all jobs', 'real-wages', (c) => ((1 - c.p('cEe')) * c.v('wage') * c.v(`employment${j}`) * c.v(`employment${g}`)) / c.v('employmentTotal')],
              ['youth', 'Tourism hires more young people', 'export-sectors', (c) => sw * youthSwap(c)],
            ),
          }
        : { compute: (c: Ctx) => ((1 - c.p('cEe')) * c.v('wage') * c.v(`employment${j}`) * c.v(`employment${g}`)) / c.v('employmentTotal') }),
      explain: {
        what: `Wages ${who} pay the ${AGE_LABEL[g]}, after the employee pension contribution (which goes straight to the pension funds).`,
        rule: sw
          ? `(1 − {cEe%}) × wage rate × their employment × the ${AGE_LABEL[g]}’s share of all jobs, ${sw > 0 ? 'plus' : 'minus'} {youthTiltXT} × the young’s share of tourism pay: tourism employs more young people, and retail and services correspondingly fewer, so each age group’s total pay is unchanged.`
          : `(1 − {cEe%}) × wage rate × their employment × the ${AGE_LABEL[g]}’s share of all jobs.`,
      },
    };
  }),
);

function employmentRule(j: Firm): RuleDef {
  const va0 = VA0[j];
  const [va, n0] = [`valueAdded${j}`, `N${j}0`];
  return {
    id: `employment${j}`,
    target: `employment${j}`,
    category: 'BEHAVIOUR',
    label: 'Hiring follows output',
    inputs: [`valueAdded${j}`, 'wage', 'valueAddedPrice'],
    params: [`N${j}0`, va0, 'okun', 'sigW'],
    adjust: { speed: 'lamN', form: 'exponential' },
    terms: terms(
      ['normal', 'Baseline jobs', undefined, (c) => c.p(n0)],
      ['output', 'Their output relative to baseline', 'okun-law', (c) => Math.pow(Math.max(1e-6, c.v(va) / c.p(va0)), c.p('okun'))],
      ['realWage', 'Wages relative to what firms earn per unit of value added', 'real-wages', (c) => Math.pow(c.v('wage') / c.v('valueAddedPrice'), -c.p('sigW'))],
    ),
    combine: (t) => t.normal * t.output * t.realWage,
    // The output term is floored at a millionth of baseline (a guard on the power); it never binds.
    regime: (c) => (c.v(va) / c.p(va0) < 1e-6 ? 'Output at its floor' : null),
    concepts: ['okun-law', 'profit-squeeze'],
    explain: {
      what: `Jobs in ${FIRM_NAME[j]}, measured as their wage bill at baseline wages.`,
      rule: `They aim for baseline jobs {N${j}0} × (their value added ÷ baseline)^{okun} × (wage ÷ value-added price)^−{sigW}, and move toward it at speed {lamN} a year. Firms hoard some labour, and economise on staff when pay outpaces what they earn per unit of value added: domestic prices without the imported inputs in them. A dearer or cheaper króna changes what inputs cost, not what is left to pay staff, so it does not change hiring for good.`,
    },
  };
}

const vars: VarDef[] = [
  { id: 'wageGrowth', label: 'Wage growth', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0 },
  { id: 'wage', label: 'Wage rate', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'Gross nominal wage rate, 1 at baseline.' },
  {
    id: 'valueAddedPrice',
    label: 'Value-added price',
    unit: 'index',
    kind: 'price',
    scale: 'nominal',
    initial: 1,
    description: 'What firms earn per unit of their own value added: domestic prices less the imported inputs in each unit (1 at baseline). Wages are measured against it.',
  },
  { id: 'labourInflow', label: 'Newcomers in the labour force', unit: 'thousand persons', kind: 'quantity', scale: 'none', initial: 0, description: 'People who have arrived from abroad through the net-immigration lever and joined the labour force for good.' },
  { id: 'benefitSearch', label: 'Longer job search from benefits', unit: 'fraction', kind: 'ratio', scale: 'none', initial: 0, description: 'Extra unemployed because benefits are more generous than normal, as a share of the unemployed.' },
  { id: 'wageGapSeen', label: 'Wage gap at the bargaining table', unit: 'log points', kind: 'ratio', scale: 'none', initial: 0, description: 'How far wages are above what firms earn per unit of value added, as wage bargainers see it.' },
  { id: 'settlementJump', label: 'Wage settlement this month', unit: 'log points', kind: 'ratio', scale: 'none', initial: 0, description: 'The one-off jump of a collective agreement, in log points; zero in every month without one.' },
  ...FIRMS.map((j): VarDef => ({ id: `employment${j}`, label: `Employment, ${FIRM_NAME[j]}`, unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base(`employment${j}`), description: `Jobs in ${FIRM_NAME[j]} as a gross wage bill at baseline wages.` })),
  { id: 'employmentTotal', label: 'Employment, all sectors', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('employmentTotal'), description: 'All jobs, public and private, as a gross wage bill at baseline wages.' },
  ...AGES.flatMap((g): VarDef[] => [
    { id: `employment${g}`, label: `Employment, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base(`employment${g}`) },
    { id: `unemployed${g}`, label: `Unemployed, ${AGE_LABEL[g]}`, unit: 'thousand persons', kind: 'quantity', scale: 'none', initial: base(`unemployed${g}`) },
    { id: `unemployment${g}`, label: `Unemployment rate, ${AGE_LABEL[g]}`, unit: 'fraction', kind: 'ratio', scale: 'none', initial: base(`unemployment${g}`) },
  ]),
  { id: 'unemployment', label: 'Unemployment rate', unit: 'fraction', kind: 'ratio', scale: 'none', initial: base('unemployment') },
  ...FIRMS.flatMap((j) => AGES.map((g): VarDef => ({ id: `wages${j}_${HH[g]}`, label: `Wages, ${FIRM_NAME[j]} → ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' }))),
];

export const labourAndWages: ModuleDef = {
  id: 'labour-and-wages',
  label: 'Jobs and wages',
  description: 'Employment in the six firm sectors and by age group, unemployment with a migration buffer, and a wage Phillips curve with error correction.',
  requires: ['structure', 'prices', 'external', 'government', 'households'],
  params: pickParams(ALL_PARAMS, [
    'phiU', 'phiW', 'lamWG', 'epsSearch', 'lamSearch', 'uBenefit', 'inflowShY', 'inflowShW', 'inflowShO', 'lamN', 'okun', 'sigW', 'mig', 'uFloor', 'uFloorStart', 'cEe', 'compTotal', 'compFC', 'compXF', 'compXA', 'compXT', 'compXO', 'youthTiltXT',
    ...AGES.flatMap((g) => [`pop${g}`, `er${g}`, `u0${g}`, `wsh${g}`, `cyc${g}`]), 'uBase', 'Ntot0', ...FIRMS.map((j) => `N${j}0`),
    ...AGES.flatMap((g) => [`Ng0${g}`, `cycSh${g}`, `U0${g}`, `emp0${g}`, `wb${g}`]),
  ]),
  vars,
  rules: [
    {
      id: 'wageGrowth',
      target: 'wageGrowth',
      category: 'BEHAVIOUR',
      label: 'Wage Phillips curve with error correction',
      lagInputs: ['expectedInflation', 'unemployment', 'wageGapSeen', 'benefitSearch'],
      params: ['phiU', 'phiW', 'uBase', 'rrShift', 'uBenefit'],
      terms: terms(
        ['expectedInflation', 'Expected inflation', 'adaptive-expectations', (c) => lastMonth(c, 'expectedInflation')],
        ['tightLabourMarket', 'Tight labour market', 'wage-phillips-curve', (c) => c.p('phiU') * (c.p('uBase') - restrainingUnemployment(c))],
        ['benefits', 'Higher benefits raise the pay workers hold out for', 'reservation-wage', (c) => c.p('phiU') * c.p('uBenefit') * c.p('rrShift')],
        ['errorCorrection', 'Wages high relative to what firms earn', 'real-wages', (c) => -c.p('phiW') * lastMonth(c, 'wageGapSeen')],
      ),
      concepts: ['wage-bargaining', 'wage-phillips-curve'],
      explain: {
        what: 'How fast wage rates rise, per year, between settlements.',
        rule: 'Wage growth = expected inflation + {phiU} × (normal unemployment {uBase%} + {uBenefit} × the change in the benefit rate − last month’s unemployment) − {phiW} × the gap between wages and the value-added price (domestic prices less the imported inputs in them). Scarce workers push pay up; wages that have run ahead of what firms earn per unit of value added slow down until the wage share is back to normal (the Nordic main-course model). Because the imported inputs are taken out, a lasting change in the króna or in world prices changes what firms pay for inputs, not the wage share, so it moves the price level once rather than setting off a wage–price spiral that never ends. The gap is the one wage bargainers see, which follows the actual gap over about a year (agreements run for a year or more). More generous unemployment benefits raise normal unemployment: workers hold out for more pay, and the extra people searching longer because of the benefits do not hold wages back.',
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
      id: 'labourInflow',
      target: 'labourInflow',
      category: 'IDENTITY',
      label: 'Newcomers in the labour force',
      lagInputs: ['labourInflow'],
      terms: terms(['previous', 'Newcomers who have arrived so far', 'migration-buffer', (c) => c.lag('labourInflow')]),
      concepts: ['migration-buffer'],
      explain: {
        what: 'People who have arrived from abroad through the net-immigration lever (or left, below zero), in thousands. They stay: they join the labour force for good.',
        rule: 'The lever adds arrivals at once, and they stay. They arrive looking for work, so at first they add to the unemployed; they find jobs as the jobs appear, when their spending, their housing demand and slower wage growth raise demand for labour. The central bank counts them in the economy’s capacity (the key-rate rule’s output gap).',
      },
    },
    {
      id: 'benefitSearch',
      target: 'benefitSearch',
      category: 'BEHAVIOUR',
      label: 'Job search and benefits',
      params: ['epsSearch', 'rr', 'rrShift'],
      adjust: { speed: 'lamSearch', form: 'exponential' },
      terms: terms(['benefits', 'Benefits above or below normal', 'reservation-wage', (c) => (c.p('epsSearch') * c.p('rrShift')) / c.p('rr')]),
      concepts: ['reservation-wage'],
      explain: {
        what: 'How many more people are unemployed at any time because unemployment benefits are more (or less) generous than normal, as a share of the unemployed (0 at baseline).',
        rule: 'Moves toward {epsSearch} × (the change in the benefit rate ÷ the normal rate {rr%}) at speed {lamSearch} a year. People already looking for work react first as their claims are renewed, so the effect builds up over about a year.',
      },
    },
    {
      id: 'wageGapSeen',
      target: 'wageGapSeen',
      category: 'BEHAVIOUR',
      label: 'Wage gap at the bargaining table',
      lagInputs: ['wage', 'valueAddedPrice'],
      adjust: { speed: 'lamWG', form: 'exponential' },
      terms: terms(['gap', 'Wages relative to what firms earn', 'wage-bargaining', (c) => Math.log(lastMonth(c, 'wage') / lastMonth(c, 'valueAddedPrice'))]),
      concepts: ['wage-bargaining'],
      explain: {
        what: 'How far wages are above what firms earn per unit of value added, as the parties to wage agreements see it (a fraction: 0.01 means wages about 1% higher; 0 at baseline).',
        rule: 'Moves toward how far last month’s wage rate is above the value-added price, at speed {lamWG} a year. Agreements run for a year or more, so a gap opened by a settlement is bargained away over the following rounds, not in the next month.',
      },
    },
    {
      id: 'valueAddedPrice',
      target: 'valueAddedPrice',
      category: 'IDENTITY',
      label: 'Value-added price',
      inputs: ['domesticPrice', 'deliveredImportPrice'],
      params: ['aLab'],
      terms: terms(
        ['domestic', 'Domestic prices', 'markup-pricing', (c) => c.v('domesticPrice') / c.p('aLab')],
        ['imported', 'Imported inputs in them', 'exchange-rate-pass-through', (c) => (-(1 - c.p('aLab')) * c.v('deliveredImportPrice')) / c.p('aLab')],
      ),
      // A króna collapse can raise import costs faster than prices follow; the value-added price then
      // bends toward a floor instead of reaching zero, so wage ratios stay finite.
      combine: (t, c) => smoothFloor(t.domestic + t.imported, VA_PRICE_FLOOR * c.v('domesticPrice'), 2 * VA_PRICE_FLOOR * c.v('domesticPrice')),
      regime: (c, _v, t) => (t.domestic + t.imported < 2 * VA_PRICE_FLOOR * c.v('domesticPrice') ? 'Imported inputs eat most of the price' : null),
      concepts: ['markup-pricing', 'wage-bargaining'],
      explain: {
        what: 'What firms earn per unit of their own value added: domestic prices less the imported inputs in each unit, 1 at baseline.',
        rule: 'Value-added price = (domestic prices − (1 − {aLab}) × imported inputs as delivered) ÷ {aLab}: the part of the price that is left to pay staff and owners, per unit of labour’s share of cost. When imports cost so much that this falls below a quarter of domestic prices, it bends toward that floor rather than reaching zero.',
      },
    },
    {
      id: 'settlementJump',
      target: 'settlementJump',
      category: 'IDENTITY',
      compute: () => 0,
      concepts: ['wage-bargaining'],
      explain: {
        what: 'A collective agreement signed this month, as a fraction (about 0.095 for +10%; strictly the natural log of 1.10).',
        rule: 'Zero in every month without a settlement; the wage-settlement lever sets it for the month it is fired, and the wage rate carries it from then on.',
      },
    },
    ...FIRMS.map(employmentRule),
    {
      id: 'employmentTotal',
      target: 'employmentTotal',
      category: 'IDENTITY',
      inputs: [...FIRMS.map((j) => `employment${j}`), 'publicEmployment'],
      terms: [
        ...FIRMS.map((j) => {
          const emp = `employment${j}`;
          return { id: j, label: FIRM_NAME[j][0].toUpperCase() + FIRM_NAME[j].slice(1), concept: j[0] === 'X' ? 'export-sectors' : undefined, compute: (c: Ctx) => c.v(emp) };
        }),
        { id: 'public', label: 'Public services', compute: (c: Ctx) => c.v('publicEmployment') },
      ],
      explain: { what: 'All jobs, measured as a wage bill at baseline wages.', rule: 'Total = the six firm sectors + public services.' },
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
      legs: FIRMS.flatMap((j) => AGES.map((g) => ({ from: j, to: HH[g], amount: `wages${j}_${HH[g]}` }))),
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
        'One-off level shift: the wage rate, private and public, jumps by this percentage in the month the lever is fired. It is not reversed; afterwards wages follow the Phillips curve. Firms price the pay rise in within a few months, so at first the real-wage gain erodes mainly through prices (+10% on Manual: consumer prices about 2.7% higher after a year, wages about 2 points below their new level). Wage bargainers then work the rest off over the following rounds (the error correction, with a lag of about a year), until wages are back in line with what firms earn per unit of value added. With labour about half of unit cost, domestic prices rise by only about two-thirds of the wage rise at a given exchange rate, so in the end wages give back most of the settlement: on Automatic the price level is about 3.5% higher after six years and about 3.1% after twenty, with wages a little above it.',
      concepts: ['wage-bargaining', 'cost-pass-through', 'profit-squeeze'],
      fire: (s, size) => s.setLagged('settlementJump', s.get('settlementJump') + Math.log(1 + size / 100)),
    },
    {
      id: 'netImmigration',
      label: 'Net immigration',
      group: 'Economy',
      section: 'Labour market',
      kind: 'oneoff',
      unit: 'thousand people',
      default: 5,
      min: -5,
      max: 10,
      step: 0.5,
      description: 'A wave of workers arriving from abroad (or leaving), looking for work.',
      definition:
        'One-off shift in the labour force, in thousands of people of working age, in the month the lever is fired (5 thousand is about 2% of the labour force). They stay. They arrive looking for work, so unemployment rises at once, mostly among the young and working age; wage growth slows through the Phillips curve, their benefits add to spending and they need homes. They take the first new jobs as demand grows with them, and while jobs are short a part of the shortfall moves on again (the migration buffer). At 5 thousand, unemployment is about 1.4 points higher at first. On Automatic, where the central bank counts them in the economy’s capacity and eases, unemployment is 0.3 point higher after 20 years, with jobs 1.5%, output 2.8% and real house prices 4.8% higher; on Manual unemployment stays about 0.8 point higher, and jobs end 0.9%, output 1.2% and house prices 1.2% higher. A negative value is emigration, with the reverse effects. To size the share of job changes met by migration, use the migration buffer.',
      concepts: ['migration-buffer', 'wage-phillips-curve'],
      fire: (s, size) => s.setLagged('labourInflow', s.get('labourInflow') + size),
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
        'Level of the migration share, in percent of any change in jobs, persistent while set. It acts only on changes in jobs relative to baseline, so on its own it changes nothing: it matters once another lever moves jobs, and then a new setting re-sizes the labour force at once. Setting it back to 30 restores the baseline behaviour. For a wave of workers arriving into a steady economy, use net immigration.',
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
      id: 'unemployment-stays-positive-in-a-boom',
      label: 'Public spending +3% of GDP on both health and education, on Manual and on Automatic: every group keeps some unemployed people, so benefits stay positive',
      run: (e) => {
        let worst = Infinity,
          worstBenefit = Infinity;
        for (const mode of [0, 1]) {
          const f = e.fork();
          f.setLever('stabilisers', mode);
          f.setLever('health', 3);
          f.setLever('education', 3);
          for (let m = 0; m < 120; m++) {
            f.step(1);
            for (const g of AGES) {
              worst = Math.min(worst, f.value(`unemployed${g}`) / f.baseline(`unemployed${g}`));
              worstBenefit = Math.min(worstBenefit, f.value(`unemploymentBenefits${g}`));
            }
          }
        }
        return { pass: worst > 0.25 && worstBenefit > 0, detail: `fewest unemployed in any group ${(100 * worst).toFixed(1)}% of normal; smallest benefit leg ${worstBenefit.toFixed(4)}% of GDP` };
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
    {
      id: 'tourism-employs-the-young',
      label: 'Tourism pays a larger share of its wages to the young than other firms, and each age group’s pay still adds up',
      run: (e) => {
        const share = (j: string) => e.baseline(`wages${j}_HY`) / AGES.reduce((s, g) => s + e.baseline(`wages${j}_${HH[g]}`), 0);
        const legs = e.legs().filter((l) => l.to === 'HY' && (l.flow === 'wages' || l.flow.endsWith('Spending')));
        const paid = legs.reduce((s, l) => s + l.baseline, 0);
        const due = (1 - e.influences('wagesFC_HY').params.find((p) => p.id === 'cEe')!.value) * e.baseline('wage') * e.baseline('employmentY');
        return { pass: share('XT') > 1.25 * share('FC') && Math.abs(paid - due) < 1e-9, detail: `young share of pay: tourism ${(100 * share('XT')).toFixed(1)}%, construction ${(100 * share('FC')).toFixed(1)}%, retail and services ${(100 * share('FR')).toFixed(1)}%; young people's pay ${paid.toFixed(6)} vs ${due.toFixed(6)}` };
      },
    },
  ],
};
