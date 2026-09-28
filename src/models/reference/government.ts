/**
 * Reference economy: the government.
 *
 * The government buys goods and services, taxes household income and borrows its deficit by
 * selling bonds to the bank. Because the bank pays for the bonds and the government spends the
 * proceeds, deficits add to the money households and firms hold.
 */
import type { ModuleDef, ParamDef } from '../../core/types.ts';

const params: ParamDef[] = [
  {
    id: 'govSpendingReal',
    value: 16,
    unit: '% of GDP/yr',
    category: 'POLICY',
    description: 'Government purchases at baseline prices.',
    provenance: { basis: 'calibrated', note: 'Solved by the baseline so that the economy starts at capacity (GDP = 100).' },
  },
  {
    id: 'normalTaxRate',
    value: 0.2,
    unit: 'fraction',
    category: 'POLICY',
    description: 'Income-tax rate when government debt is at its baseline level.',
    provenance: { basis: 'calibrated', note: 'Solved by the baseline so that debt is 55% of GDP with a balanced budget.' },
  },
  { id: 'fiscalResponse', value: 0.3, unit: 'fraction', category: 'POLICY', description: 'Tax-rate points added per point of debt-to-GDP above baseline, divided by 100 (0.3: +3 points of tax for 10 points of debt).', provenance: { basis: 'assumed' } },
  { id: 'fiscalSpeed', value: 0.5, unit: 'per year', category: 'POLICY', description: 'How fast the tax rate moves toward what the debt rule says (budgets change slowly).', provenance: { basis: 'assumed' } },
  { id: 'taxShift', value: 0, unit: 'fraction', category: 'POLICY', description: 'Change in the tax rate decided on top of the debt rule (set by the tax lever).', provenance: { basis: 'assumed', note: 'Zero at baseline; moved by a lever.' } },
  { id: 'treasuryTarget', value: 2, unit: '% of GDP', category: 'POLICY', description: 'Money the government keeps in its account at the central bank.', provenance: { basis: 'assumed' } },
  { id: 'treasuryTopUp', value: 6, unit: 'per year', category: 'POLICY', description: 'How fast bond sales restore the account to its target.', provenance: { basis: 'assumed' } },
];

export const government: ModuleDef = {
  id: 'government',
  label: 'Government',
  description: 'Spending, taxes, the deficit and the bonds that finance it.',
  requires: ['structure', 'labour-and-prices', 'central-bank', 'banking-and-credit'],
  params,
  vars: [
    { id: 'govSpending', label: 'Government spending', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'debtRatio', label: 'Government debt ratio', unit: '% of GDP', kind: 'ratio', scale: 'none', initial: 55 },
    { id: 'taxRate', label: 'Income-tax rate', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0.23 },
    { id: 'taxes', label: 'Income tax', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'bondInterestBank', label: 'Bond interest to the bank', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'bondInterestCB', label: 'Bond interest to the central bank', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'deficit', label: 'Government deficit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'bondIssue', label: 'New government bonds', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ],
  rules: [
    {
      id: 'govSpending',
      target: 'govSpending',
      category: 'POLICY',
      inputs: ['price'],
      params: ['govSpendingReal'],
      compute: (c) => c.p('govSpendingReal') * c.v('price'),
      concepts: ['multiplier'],
      explain: { what: 'What the government pays firms for goods and services.', rule: 'Spending = {govSpendingReal}% of GDP at baseline prices × price level.' },
    },
    {
      id: 'debtRatio',
      target: 'debtRatio',
      category: 'IDENTITY',
      inputs: ['price'],
      stocks: [['bonds', 'G']],
      params: ['potentialOutput'],
      compute: (c) => (100 * c.stock('bonds', 'G')) / (c.v('price') * c.p('potentialOutput')),
      concepts: ['deficits-and-money', 'automatic-stabilisers'],
      explain: {
        what: 'Government debt as a share of what the economy produces at capacity, at today’s prices. A recession alone does not raise it, so the debt rule does not tighten in a slump.',
        rule: 'Debt ratio = 100 × bonds outstanding ÷ (price level × capacity output).',
      },
    },
    {
      id: 'taxRate',
      target: 'taxRate',
      category: 'POLICY',
      label: 'Debt rule',
      lagInputs: ['debtRatio'],
      params: ['normalTaxRate', 'fiscalResponse'],
      adjust: { speed: 'fiscalSpeed' },
      terms: [
        { id: 'normal', label: 'Normal tax rate', compute: (c) => c.p('normalTaxRate') },
        {
          id: 'debtRule',
          label: 'Debt above its starting level',
          concept: 'deficits-and-money',
          compute: (c) => (c.p('fiscalResponse') * (c.lag('debtRatio') - c.base('debtRatio'))) / 100,
        },
      ],
      concepts: ['policy-lags', 'automatic-stabilisers'],
      explain: {
        what: 'The income-tax rate set by the government’s debt rule.',
        rule: 'The rate moves toward {normalTaxRate%} + {fiscalResponse} × (debt ratio − its starting level) ÷ 100, at speed {fiscalSpeed} a year: 10 more points of debt mean about 3 more points of tax. Without such a rule, interest on a growing debt could feed on itself.',
      },
    },
    {
      id: 'taxes',
      target: 'taxes',
      category: 'POLICY',
      inputs: ['wages', 'depositInterestHH', 'firmDividends', 'bankDividends', 'taxRate'],
      params: ['taxShift'],
      terms: [
        { id: 'onWages', label: 'Tax on wages', concept: 'automatic-stabilisers', compute: (c) => (c.v('taxRate') + c.p('taxShift')) * c.v('wages') },
        {
          id: 'onCapitalIncome',
          label: 'Tax on interest and dividends',
          concept: 'automatic-stabilisers',
          compute: (c) => (c.v('taxRate') + c.p('taxShift')) * (c.v('depositInterestHH') + c.v('firmDividends') + c.v('bankDividends')),
        },
      ],
      concepts: ['automatic-stabilisers'],
      explain: {
        what: 'Income tax households pay. It rises and falls with income, which steadies the economy.',
        rule: 'Tax = (the debt rule’s rate + any change set by the tax lever, now {taxShift pp}) × (wages + interest + dividends).',
      },
    },
    {
      id: 'bondInterestBank',
      target: 'bondInterestBank',
      category: 'CONTRACT',
      inputs: ['bondRate'],
      stocks: [['bonds', 'B']],
      compute: (c) => c.v('bondRate') * c.stock('bonds', 'B'),
      concepts: ['interest-distribution'],
      explain: { what: 'Interest the government pays the bank on its bonds.', rule: 'Interest = bond rate × bonds held by the bank.' },
    },
    {
      id: 'bondInterestCB',
      target: 'bondInterestCB',
      category: 'CONTRACT',
      inputs: ['bondRate'],
      stocks: [['bonds', 'CB']],
      compute: (c) => c.v('bondRate') * c.stock('bonds', 'CB'),
      explain: { what: 'Interest the government pays the central bank on its bonds (it comes back as central-bank profit).', rule: 'Interest = bond rate × bonds held by the central bank.' },
    },
    {
      id: 'deficit',
      target: 'deficit',
      category: 'IDENTITY',
      inputs: ['govSpending', 'bondInterestBank', 'bondInterestCB', 'taxes', 'cbProfit'],
      terms: [
        { id: 'spending', label: 'Spending', compute: (c) => c.v('govSpending') },
        { id: 'interest', label: 'Interest on debt', concept: 'interest-distribution', compute: (c) => c.v('bondInterestBank') + c.v('bondInterestCB') },
        { id: 'taxes', label: 'Taxes', concept: 'automatic-stabilisers', compute: (c) => -c.v('taxes') },
        { id: 'cbProfit', label: 'Central-bank profit', compute: (c) => -c.v('cbProfit') },
      ],
      concepts: ['sectoral-balances', 'deficits-and-money'],
      explain: {
        what: 'Government spending and interest minus its income. The government’s deficit is the private sector’s surplus.',
        rule: 'Deficit = spending + interest on bonds − taxes − central-bank profit.',
      },
    },
    {
      id: 'bondIssue',
      target: 'bondIssue',
      category: 'POLICY',
      inputs: ['deficit'],
      stocks: [['treasuryAccount', 'G']],
      params: ['treasuryTarget', 'treasuryTopUp'],
      terms: [
        { id: 'deficit', label: 'Deficit to finance', concept: 'deficits-and-money', compute: (c) => c.v('deficit') },
        { id: 'topUp', label: 'Refill the treasury account', compute: (c) => c.p('treasuryTopUp') * (c.p('treasuryTarget') - c.stock('treasuryAccount', 'G')) },
      ],
      concepts: ['deficits-and-money'],
      explain: {
        what: 'Bonds the government sells to the bank to pay its way.',
        rule: 'Bonds sold = the deficit + {treasuryTopUp} × a year of any shortfall of the treasury account below {treasuryTarget}% of GDP.',
      },
    },
  ],
  flows: [
    {
      id: 'govSpending',
      label: 'Government spending',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'G', to: 'F', amount: 'govSpending' }],
      concepts: ['multiplier', 'deficits-and-money'],
      explain: { what: 'The government pays firms from its central-bank account: the bank gains reserves and credits the firms’ deposits.' },
    },
    {
      id: 'taxes',
      label: 'Income tax',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'HH', to: 'G', amount: 'taxes' }],
      concepts: ['automatic-stabilisers'],
      explain: { what: 'Households pay tax from their deposits; the bank pays the government in reserves, so deposits shrink.' },
    },
    {
      id: 'bondInterest',
      label: 'Interest on government bonds',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [
        { from: 'G', to: 'B', amount: 'bondInterestBank' },
        { from: 'G', to: 'CB', amount: 'bondInterestCB' },
      ],
      concepts: ['interest-distribution'],
      explain: { what: 'The government pays interest to its bondholders.' },
    },
    {
      id: 'bondIssue',
      label: 'New government bonds',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'issue', instrument: 'bonds' },
      legs: [{ from: 'B', to: 'G', amount: 'bondIssue' }],
      concepts: ['deficits-and-money'],
      explain: { what: 'The bank buys new bonds, paying in reserves. When the government spends the money, deposits are created: deficits financed by banks add to money.' },
    },
  ],
  levers: [
    {
      id: 'govSpending',
      label: 'Government spending',
      group: 'Policy',
      section: 'Government',
      kind: 'setting',
      unit: '% of GDP/yr',
      default: 0,
      min: -3,
      max: 3,
      step: 0.5,
      binds: { param: 'govSpendingReal', mode: 'add' },
      description: 'More (or less) government purchases, at baseline prices.',
      definition:
        'Level shift in real government purchases, % of baseline GDP a year, persistent while set. Nominal spending also rises with the price level. Setting it back to 0 returns spending to its baseline level; the debt built up meanwhile remains.',
      concepts: ['multiplier', 'deficits-and-money'],
    },
    {
      id: 'taxRate',
      label: 'Income-tax rate',
      group: 'Policy',
      section: 'Government',
      kind: 'setting',
      unit: 'pp',
      default: 0,
      min: -3,
      max: 3,
      step: 0.5,
      binds: { param: 'taxShift', mode: 'add', scale: 0.01 },
      description: 'Raises (or cuts) the tax rate on household income by this many points, on top of the debt rule.',
      definition:
        'Level shift in the income-tax rate, in percentage points, persistent while set. The debt rule then gradually offsets it as debt moves away from target. Setting it back to 0 removes the shift; the debt rule unwinds what it did.',
      concepts: ['automatic-stabilisers'],
    },
  ],
  tests: [
    {
      id: 'balanced-budget-at-baseline',
      label: 'At baseline the budget balances and the treasury account is at its target',
      run: (e) => {
        const d = e.baseline('deficit');
        const tga = e.balanceSheet('G').assets.find((a) => a.instrument === 'treasuryAccount')!.baseline;
        return { pass: Math.abs(d) < 1e-9 && Math.abs(tga - 2) < 1e-9, detail: `deficit ${d.toExponential(2)}, treasury account ${tga.toFixed(9)}` };
      },
    },
    {
      id: 'tax-arithmetic',
      label: 'Tax = rate × (wages + interest + dividends)',
      run: (e) => {
        const rate = e.value('taxRate') + e.influences('taxes').params.find((p) => p.id === 'taxShift')!.value;
        const base = e.value('wages') + e.value('depositInterestHH') + e.value('firmDividends') + e.value('bankDividends');
        const gap = e.value('taxes') - rate * base;
        return { pass: Math.abs(gap) < 1e-9, detail: `tax − rate × base = ${gap.toExponential(2)}` };
      },
    },
  ],
};
