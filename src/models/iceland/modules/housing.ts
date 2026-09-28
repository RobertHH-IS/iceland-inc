/**
 * Iceland Inc.: housing (v1 equation E11, and the housing parts of E12 and E35).
 *
 * Real house prices move toward a level set by households' real income, the flow of net mortgage
 * credit and the real mortgage rate. The housing component of the CPI follows house prices with
 * a lag: house prices stand in for market rents, which Statistics Iceland has used for
 * owner-occupied housing (rental equivalence, from the HMS rental register) since June 2024, so
 * the link is stronger and faster here than in the published index; a rent block is planned for
 * v3. Household spending is deflated without this component (prices.ts). Homes are a real asset: young and working-age households buy homes from older ones each
 * year, homes are revalued when prices move, and they move up an age group with their owners.
 * The housing stock itself is fixed.
 */
import type { ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS } from '../steady.ts';
import { AGE_LABEL, AGES, HH, pickParams, terms, lastMonth } from '../util.ts';

const revaluation: RuleDef[] = AGES.map((g) => ({
  id: `homesRevaluation${g}`,
  target: `homesRevaluation${g}`,
  category: 'IDENTITY',
  inputs: ['housePrice'],
  lagInputs: ['housePrice'],
  stocks: [['homes', HH[g]]],
  compute: (c) => (c.stock('homes', HH[g]) * (c.v('housePrice') / c.lag('housePrice') - 1)) / c.dt,
  concepts: ['revaluation', 'housing-wealth-effect'],
  explain: { what: `The change in the value of homes owned by the ${AGE_LABEL[g]} when house prices move (a yearly rate).`, rule: 'Revaluation = their homes × this month’s change in house prices ÷ one month. No money moves.' },
}));

const vars: VarDef[] = [
  { id: 'logRealHousePrice', label: 'Real house price (log)', unit: 'log points', kind: 'ratio', scale: 'none', initial: 0 },
  { id: 'realHousePrice', label: 'Real house prices', unit: 'index', kind: 'price', scale: 'none', initial: 1, description: 'House prices relative to consumer prices (1 at baseline).' },
  { id: 'housePrice', label: 'House prices', unit: 'index', kind: 'price', scale: 'nominal', initial: 1 },
  { id: 'housingCost', label: 'Housing costs in the CPI', unit: 'index', kind: 'price', scale: 'nominal', initial: 1 },
  { id: 'homePurchasesY', label: 'Homes bought by the young', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'homePurchasesW', label: 'Homes bought by working-age households', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ...AGES.map((g): VarDef => ({ id: `homesRevaluation${g}`, label: `Revaluation of homes, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' })),
  { id: 'homesAgeingY', label: 'Homes moving from young to working age', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'homesAgeingW', label: 'Homes moving from working age to older', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
];

export const housing: ModuleDef = {
  id: 'housing',
  label: 'Housing',
  description: 'House prices, the housing component of the CPI, home purchases between generations and the value of homes.',
  requires: ['structure', 'households', 'mortgages', 'prices'],
  params: pickParams(ALL_PARAMS, ['Y0', 'lamH', 'betaHY', 'betaHC', 'betaHR', 'lamHC', 'purY', 'purW', 'ydH0', 'homeAgeingRateY', 'homeAgeingRateW', 'house0', 'hshY', 'hshW']),
  vars,
  rules: [
    {
      id: 'logRealHousePrice',
      target: 'logRealHousePrice',
      category: 'BEHAVIOUR',
      label: 'House prices',
      lagInputs: ['realDisposableIncome', 'netMortgageLending', 'realMortgageRate'],
      params: ['betaHY', 'ydH0', 'betaHC', 'Y0', 'betaHR', 'rmR0'],
      adjust: { speed: 'lamH', form: 'exponential' },
      terms: terms(
        ['income', 'Households’ real income', 'credit-and-house-prices', (c) => c.p('betaHY') * Math.log(Math.max(1e-6, lastMonth(c, 'realDisposableIncome') / c.p('ydH0')))],
        ['credit', 'Flow of net mortgage credit', 'credit-and-house-prices', (c) => (c.p('betaHC') * lastMonth(c, 'netMortgageLending')) / c.p('Y0')],
        ['rate', 'Real mortgage rate', 'interest-distribution', (c) => -c.p('betaHR') * (lastMonth(c, 'realMortgageRate') - c.p('rmR0'))],
      ),
      concepts: ['credit-and-house-prices'],
      explain: {
        what: 'Real house prices in logs (0 at baseline).',
        rule: 'Target = {betaHY} × log(real household income ÷ baseline) + {betaHC} × net new mortgage lending ÷ GDP − {betaHR} × (real mortgage rate − baseline), all as of last month. Prices move toward it at speed {lamH} a year: more credit flowing into housing lifts prices.',
      },
    },
    {
      id: 'realHousePrice',
      target: 'realHousePrice',
      category: 'IDENTITY',
      inputs: ['logRealHousePrice'],
      compute: (c) => Math.exp(c.v('logRealHousePrice')),
      explain: { what: 'House prices relative to consumer prices (1 at baseline).', rule: 'Real house price = e^(log real house price).' },
    },
    {
      id: 'housePrice',
      target: 'housePrice',
      category: 'IDENTITY',
      inputs: ['realHousePrice'],
      lagInputs: ['cpi'],
      compute: (c) => c.v('realHousePrice') * c.lag('cpi'),
      explain: { what: 'House prices in krónur (1 at baseline).', rule: 'House price = real house price × last month’s CPI.' },
    },
    {
      id: 'housingCost',
      target: 'housingCost',
      category: 'BEHAVIOUR',
      inputs: ['housePrice'],
      adjust: { speed: 'lamHC', form: 'exponential' },
      terms: terms(['housePrice', 'House prices', 'credit-and-house-prices', (c) => c.v('housePrice')]),
      explain: {
        what: 'The housing component of the CPI: owner-occupiers’ imputed rent and actual rents.',
        rule: 'Follows house prices at speed {lamHC} a year. Since June 2024 Statistics Iceland has measured owner-occupied housing by rental equivalence, from market rents in the HMS rental register. Here house prices stand in for those rents, so the link from house prices to the CPI is stronger and faster than in the published index. A rent block is planned for v3.',
      },
    },
    {
      id: 'homePurchasesY',
      target: 'homePurchasesY',
      category: 'BEHAVIOUR',
      inputs: ['housePrice'],
      params: ['purY'],
      compute: (c) => c.p('purY') * c.v('housePrice'),
      concepts: ['intergenerational-flows'],
      explain: { what: 'Homes young households buy from older ones (a yearly rate).', rule: 'Purchases = a fixed number of homes each year ({purY}% of GDP at baseline prices) × house prices.' },
    },
    {
      id: 'homePurchasesW',
      target: 'homePurchasesW',
      category: 'BEHAVIOUR',
      inputs: ['housePrice'],
      params: ['purW'],
      compute: (c) => c.p('purW') * c.v('housePrice'),
      concepts: ['intergenerational-flows'],
      explain: { what: 'Homes working-age households buy from older ones (a yearly rate).', rule: 'Purchases = {purW}% of GDP at baseline prices × house prices.' },
    },
    ...revaluation,
    {
      id: 'homesAgeingY',
      target: 'homesAgeingY',
      category: 'IDENTITY',
      params: ['homeAgeingRateY'],
      stocks: [['homes', 'HY']],
      compute: (c) => c.p('homeAgeingRateY') * c.stock('homes', 'HY'),
      concepts: ['intergenerational-flows'],
      explain: { what: 'Homes that move from the young to the working-age group as their owners turn 35 (a yearly rate).', rule: 'Moved = {homeAgeingRateY} × the young’s homes a year.' },
    },
    {
      id: 'homesAgeingW',
      target: 'homesAgeingW',
      category: 'IDENTITY',
      params: ['homeAgeingRateW'],
      stocks: [['homes', 'HW']],
      compute: (c) => c.p('homeAgeingRateW') * c.stock('homes', 'HW'),
      concepts: ['intergenerational-flows'],
      explain: { what: 'Homes that move from working-age households to older ones as their owners turn 67 (a yearly rate).', rule: 'Moved = {homeAgeingRateW} × working-age homes a year.' },
    },
  ],
  flows: [
    {
      id: 'homePurchases',
      label: 'Purchases of existing homes',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'trade', instrument: 'homes' },
      legs: [
        { from: 'HY', to: 'HO', amount: 'homePurchasesY' },
        { from: 'HW', to: 'HO', amount: 'homePurchasesW' },
      ],
      concepts: ['intergenerational-flows'],
      explain: { what: 'Young and working-age households buy homes from older households, who downsize or settle estates. The buyer’s deposit becomes the seller’s.' },
    },
    {
      id: 'homesRevaluation',
      label: 'Revaluation of homes',
      kind: 'revaluation',
      account: 'other',
      posting: { type: 'revalue', instrument: 'homes' },
      legs: AGES.map((g) => ({ from: HH[g], to: HH[g], amount: `homesRevaluation${g}` })),
      concepts: ['revaluation', 'housing-wealth-effect'],
      explain: { what: 'When house prices rise, owners’ homes are worth more: a change in wealth, not a payment.' },
    },
    {
      id: 'homesAgeing',
      label: 'Homes move with their owners as they age',
      kind: 'revaluation',
      account: 'other',
      posting: { type: 'revalue', instrument: 'homes' },
      legs: [
        { from: 'HY', to: 'HW', amount: 'homesAgeingY' },
        { from: 'HW', to: 'HO', amount: 'homesAgeingW' },
      ],
      concepts: ['intergenerational-flows'],
      explain: { what: 'People move up an age group and take their homes with them: a reclassification between households, not a sale.' },
    },
  ],
  tests: [
    {
      id: 'housing-stationary',
      label: 'At baseline purchases and ageing balance, so each group’s homes are constant',
      run: (e) => {
        const d = [e.baseline('homePurchasesY') - e.baseline('homesAgeingY'), e.baseline('homePurchasesW') + e.baseline('homesAgeingY') - e.baseline('homesAgeingW')];
        return { pass: d.every((x) => Math.abs(x) < 1e-12), detail: `young ${d[0].toExponential(2)}, working age ${d[1].toExponential(2)}` };
      },
    },
    {
      id: 'credit-lifts-house-prices',
      label: 'More mortgage credit lifts real house prices',
      run: (e) => {
        e.setLever('lendingAppetite', 1);
        e.step(12);
        const q = (e.value('realHousePrice') - 1) * 100;
        return { pass: q > 0.5, detail: `real house prices after 12 months: +${q.toFixed(2)}%` };
      },
    },
  ],
};
