/**
 * Reference economy: spending and output.
 *
 * Households spend out of disposable income and savings, adjusting gradually (a partial-
 * adjustment consumption function). Firms invest when their capacity is busy and borrowing is
 * cheap. Output is whatever is demanded: GDP = consumption + investment + government spending.
 */
import type { ModuleDef, ParamDef } from '../../core/types.ts';

const assumed = { basis: 'assumed' as const, note: 'Teaching value, chosen to give readable dynamics.' };

const params: ParamDef[] = [
  { id: 'propensityFromIncome', value: 0.9, unit: 'fraction', category: 'BEHAVIOUR', description: 'Share of each extra krona of disposable income that households spend.', provenance: assumed },
  { id: 'propensityFromWealth', value: 0.09, unit: 'per year', category: 'BEHAVIOUR', description: 'Share of their deposits households spend each year.', provenance: assumed },
  { id: 'savingIncentive', value: 1, unit: '% of GDP per pp', category: 'BEHAVIOUR', description: 'Spending households put off (% of GDP) per point of real deposit rate above normal.', provenance: assumed },
  { id: 'consumptionSpeed', value: 4, unit: 'per year', category: 'BEHAVIOUR', description: 'How fast spending catches up with its target.', provenance: assumed },
  { id: 'normalInvestment', value: 15, unit: '% of GDP/yr', category: 'BEHAVIOUR', description: 'Real investment when capacity is normally used and rates are normal.', provenance: assumed },
  { id: 'accelerator', value: 0.3, unit: 'fraction', category: 'BEHAVIOUR', description: 'Extra investment (% of GDP) per 1% of GDP of output above capacity.', provenance: assumed },
  { id: 'rateSensitivity', value: 0.6, unit: '% of GDP per pp', category: 'BEHAVIOUR', description: 'Investment lost (% of GDP) per point of real loan rate above normal.', provenance: assumed },
  { id: 'investmentSpeed', value: 2, unit: 'per year', category: 'BEHAVIOUR', description: 'How fast investment plans respond.', provenance: assumed },
  { id: 'depreciationRate', value: 0.06, unit: 'per year', category: 'CONTRACT', description: 'Share of machines and buildings that wears out each year.', provenance: assumed },
];

export const demand: ModuleDef = {
  id: 'demand',
  label: 'Spending and output',
  description: 'Consumption, investment and GDP: output follows demand.',
  requires: ['structure', 'labour-and-prices', 'banking-and-credit', 'central-bank', 'government'],
  params,
  vars: [
    { id: 'disposableIncome', label: 'Disposable income', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 75 },
    { id: 'consumption', label: 'Consumption', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 69 },
    { id: 'investmentReal', label: 'Investment (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: 15 },
    { id: 'investment', label: 'Investment', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 15 },
    { id: 'gdp', label: 'GDP (nominal)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 100 },
    { id: 'output', label: 'Output (real GDP)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: 100 },
    { id: 'depreciation', label: 'Depreciation', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 15 },
  ],
  rules: [
    {
      id: 'disposableIncome',
      target: 'disposableIncome',
      category: 'IDENTITY',
      inputs: ['wages', 'depositInterestHH', 'firmDividends', 'bankDividends', 'taxes'],
      terms: [
        { id: 'wages', label: 'Wages', compute: (c) => c.v('wages') },
        { id: 'interest', label: 'Interest on deposits', concept: 'interest-distribution', compute: (c) => c.v('depositInterestHH') },
        { id: 'dividends', label: 'Dividends', compute: (c) => c.v('firmDividends') + c.v('bankDividends') },
        // Untagged: the tax rule (government.ts) splits income tax into the automatic stabiliser and
        // the decisions that change the rate (review TAX-4).
        { id: 'taxes', label: 'Income tax', compute: (c) => -c.v('taxes') },
      ],
      explain: {
        what: 'What households have to spend or save after tax.',
        rule: 'Disposable income = wages + interest on deposits + dividends from firms and the bank − income tax.',
      },
    },
    {
      id: 'consumption',
      target: 'consumption',
      category: 'BEHAVIOUR',
      label: 'Consumption function',
      inputs: ['disposableIncome', 'depositRate', 'expectedInflation'],
      stocks: [['deposits', 'HH']],
      params: ['propensityFromIncome', 'propensityFromWealth', 'savingIncentive', 'neutralRate', 'depositSpread'],
      adjust: { speed: 'consumptionSpeed' },
      terms: [
        { id: 'income', label: 'Spending out of income', concept: 'consumption-function', compute: (c) => c.p('propensityFromIncome') * c.v('disposableIncome') },
        {
          id: 'inflationLoss',
          label: 'Inflation eats savings',
          concept: 'accrual-vs-cash',
          compute: (c) => -c.p('propensityFromIncome') * c.v('expectedInflation') * c.stock('deposits', 'HH'),
        },
        { id: 'wealth', label: 'Spending out of savings', concept: 'stock-flow-consistency', compute: (c) => c.p('propensityFromWealth') * c.stock('deposits', 'HH') },
        {
          id: 'realRate',
          label: 'Reward for saving',
          concept: 'interest-rate-channel',
          compute: (c) => -c.p('savingIncentive') * 100 * (c.v('depositRate') - c.v('expectedInflation') - (c.p('neutralRate') - c.p('depositSpread'))),
        },
      ],
      concepts: ['consumption-function', 'paradox-of-thrift', 'multiplier'],
      explain: {
        what: 'What households spend on goods and services, % of baseline GDP a year.',
        rule: 'Households aim to spend {propensityFromIncome} of their income after inflation (disposable income minus what expected inflation takes off the value of their deposits), plus {propensityFromWealth} of their deposits a year, and put off {savingIncentive}% of GDP of spending per point the real deposit rate is above normal. Spending moves toward that aim at speed {consumptionSpeed} a year. When income and spending are equal, savings stop growing: that pins the baseline.',
      },
    },
    {
      id: 'investmentReal',
      target: 'investmentReal',
      category: 'BEHAVIOUR',
      label: 'Investment plans',
      inputs: ['loanRate', 'expectedInflation'],
      lagInputs: ['output'],
      params: ['normalInvestment', 'accelerator', 'potentialOutput', 'rateSensitivity', 'neutralRate', 'loanSpread', 'creditAppetite'],
      adjust: { speed: 'investmentSpeed' },
      terms: [
        { id: 'normal', label: 'Normal investment', compute: (c) => c.p('normalInvestment') },
        { id: 'capacity', label: 'Busy capacity', concept: 'investment-accelerator', compute: (c) => c.p('accelerator') * (c.lag('output') - c.p('potentialOutput')) },
        {
          id: 'realRate',
          label: 'Cost of borrowing',
          concept: 'interest-rate-channel',
          compute: (c) => -c.p('rateSensitivity') * 100 * (c.v('loanRate') - c.v('expectedInflation') - (c.p('neutralRate') + c.p('loanSpread'))),
        },
        { id: 'credit', label: 'Easier credit', concept: 'credit-impulse', compute: (c) => c.p('creditAppetite') },
      ],
      concepts: ['investment-accelerator', 'capacity-utilisation', 'policy-lags'],
      explain: {
        what: 'Firms’ spending on new machines and buildings, at baseline prices.',
        rule: 'Firms plan {normalInvestment}% of GDP, plus {accelerator} × output above capacity last month, minus {rateSensitivity} per point of real loan rate above normal, plus any extra the bank is keen to lend. Plans turn into spending at speed {investmentSpeed} a year.',
      },
    },
    {
      id: 'investment',
      target: 'investment',
      category: 'IDENTITY',
      inputs: ['investmentReal', 'price'],
      compute: (c) => c.v('investmentReal') * c.v('price'),
      explain: { what: 'Investment spending in money terms.', rule: 'Investment = real investment × price level.' },
    },
    {
      id: 'gdp',
      target: 'gdp',
      category: 'IDENTITY',
      inputs: ['consumption', 'investment', 'govSpending'],
      terms: [
        { id: 'consumption', label: 'Consumption', concept: 'multiplier', compute: (c) => c.v('consumption') },
        { id: 'investment', label: 'Investment', concept: 'investment-accelerator', compute: (c) => c.v('investment') },
        { id: 'government', label: 'Government spending', concept: 'multiplier', compute: (c) => c.v('govSpending') },
      ],
      concepts: ['multiplier', 'sectoral-balances'],
      explain: {
        what: 'Everything bought in a year, in money terms (nominal GDP). Baseline = 100.',
        rule: 'GDP = consumption + investment + government spending. In a closed economy each krona spent is a krona of someone’s income.',
      },
    },
    {
      id: 'output',
      target: 'output',
      category: 'IDENTITY',
      inputs: ['gdp', 'price'],
      compute: (c) => c.v('gdp') / c.v('price'),
      concepts: ['capacity-utilisation'],
      explain: { what: 'Everything produced in a year, at baseline prices (real GDP).', rule: 'Output = nominal GDP ÷ price level. Output follows demand; pressure on capacity shows up in jobs and then wages and prices.' },
    },
    {
      id: 'depreciation',
      target: 'depreciation',
      category: 'CONTRACT',
      stocks: [['capital', 'F']],
      params: ['depreciationRate'],
      compute: (c) => c.p('depreciationRate') * c.stock('capital', 'F'),
      concepts: ['accrual-vs-cash'],
      explain: {
        what: 'Wear and tear on machines and buildings.',
        rule: 'Depreciation = {depreciationRate%} of the capital stock a year. No money moves; the machines are simply worth less.',
      },
    },
  ],
  flows: [
    {
      id: 'consumption',
      label: 'Consumption',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'HH', to: 'F', amount: 'consumption' }],
      concepts: ['consumption-function'],
      explain: { what: 'Households buy goods and services from firms; their deposits become the firms’ deposits.' },
    },
    {
      id: 'investment',
      label: 'Investment',
      kind: 'cash',
      account: 'capital',
      posting: { type: 'purchase', realAsset: 'capital' },
      legs: [{ from: 'F', to: 'F', amount: 'investment' }],
      concepts: ['investment-accelerator'],
      explain: { what: 'Firms buy machines and buildings from other firms. The payment stays inside the firm sector, and the capital stock grows.' },
    },
    {
      id: 'depreciation',
      label: 'Depreciation',
      kind: 'writeoff',
      account: 'other',
      posting: { type: 'writeoff', instrument: 'capital' },
      legs: [{ from: 'F', to: 'F', amount: 'depreciation' }],
      concepts: ['accrual-vs-cash', 'net-worth'],
      explain: { what: 'Machines and buildings wear out. Firms’ capital, and so their net worth, falls; no money moves.' },
    },
  ],
  tests: [
    {
      id: 'households-spend-their-income',
      label: 'At baseline households spend exactly their disposable income, so their savings are steady',
      run: (e) => {
        const gap = e.baseline('consumption') - e.baseline('disposableIncome');
        return { pass: Math.abs(gap) < 1e-9, detail: `consumption − disposable income = ${gap.toExponential(2)}` };
      },
    },
    {
      id: 'gdp-is-the-sum-of-spending',
      label: 'GDP = consumption + investment + government spending, and baseline GDP is 100',
      run: (e) => {
        const sum = e.value('consumption') + e.value('investment') + e.value('govSpending');
        const ok = Math.abs(sum - e.value('gdp')) < 1e-9 && Math.abs(e.baseline('gdp') - 100) < 1e-9;
        return { pass: ok, detail: `C + I + G = ${sum.toFixed(9)}, GDP = ${e.value('gdp').toFixed(9)}` };
      },
    },
  ],
};
