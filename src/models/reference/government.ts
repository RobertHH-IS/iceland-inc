/**
 * Reference economy: the government.
 *
 * The government buys goods and services, taxes household income and borrows its deficit by
 * selling bonds to the bank. Because the bank pays for the bonds and the government spends the
 * proceeds, deficits add to the money households and firms hold. A debt rule sets the tax rate
 * when stabilisers are Automatic (the default here), and only suggests on Manual (decision 0004).
 */
import type { Ctx, ModuleDef, ParamDef } from '../../core/types.ts';
import { automatic } from './stabilisers.ts';

/** The largest buyback this month (a negative issue): the bank's bonds, less what it sells the
 *  central bank this month, over one month. */
const buybackLimit = (c: Ctx) => c.v('openMarket') - c.stock('bonds', 'B') / c.dt;
/** A tax rate × households' income: wages, and deposit interest and dividends. The tax rule's terms
 *  are differences of these, so they add up to the unsplit tax to the last digit (review TAX-4). */
const onIncome = (c: Ctx, rate: number) => rate * c.v('wages') + rate * (c.v('depositInterestHH') + c.v('firmDividends') + c.v('bankDividends'));

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
  {
    id: 'fiscalResponse',
    value: 0.3,
    unit: 'fraction',
    category: 'POLICY',
    description: 'Tax-rate points added per point of debt-to-GDP above baseline, divided by 100 (0.3: +3 points of tax for 10 points of debt).',
    provenance: {
      basis: 'assumed',
      note: 'Deliberately strong, for teaching: with a tax base of about 87% of GDP, 0.3 moves revenue about 0.26% of GDP per point of debt. Estimated fiscal reaction functions give about 0.02–0.1% of GDP (Bohn 1998, 2008; Mauro et al. 2015), so this rule settles debt several times faster than real governments do.',
    },
  },
  {
    id: 'fiscalSpeed',
    value: 0.5,
    unit: 'per year',
    category: 'POLICY',
    description: 'How fast the tax rate moves toward what the debt rule says (budgets change slowly).',
    provenance: { basis: 'assumed', note: 'Teaching value: the rule closes about two-fifths of the gap to its target rate in a year, about one budget round.' },
  },
  { id: 'taxShift', value: 0, unit: 'fraction', category: 'POLICY', description: 'Your change in the tax rate (set by the tax lever); on Automatic it is added to the debt rule’s rate.', provenance: { basis: 'assumed', note: 'Zero at baseline; moved by a lever.' } },
  { id: 'treasuryTarget', value: 2, unit: '% of GDP', category: 'POLICY', description: 'Money the government keeps in its account at the central bank.', provenance: { basis: 'assumed' } },
  { id: 'treasuryTopUp', value: 6, unit: 'per year', category: 'POLICY', description: 'How fast bond sales restore the account to its target.', provenance: { basis: 'assumed' } },
];

export const government: ModuleDef = {
  id: 'government',
  label: 'Government',
  description: 'Spending, taxes, the deficit and the bonds that finance it.',
  requires: ['stabilisers', 'structure', 'labour-and-prices', 'central-bank', 'banking-and-credit'],
  params,
  vars: [
    { id: 'govSpending', label: 'Government spending', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'debtRatio', label: 'Government debt ratio', unit: '% of GDP', kind: 'ratio', scale: 'none', initial: 55 },
    { id: 'debtRuleRate', label: 'Tax rate the debt rule calls for', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0.23, description: 'The debt rule’s tax rate, computed in both stabiliser modes.' },
    { id: 'taxRuleSuggestion', label: 'Tax shift the debt rule suggests', unit: 'pp', kind: 'rate', scale: 'none', description: 'The debt rule’s rate minus the normal rate, in percentage points: comparable with the tax lever.' },
    { id: 'taxRate', label: 'Income-tax rate', unit: 'fraction', kind: 'rate', scale: 'none' },
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
      id: 'debtRuleRate',
      target: 'debtRuleRate',
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
          concept: 'debt-feedback',
          compute: (c) => (c.p('fiscalResponse') * (c.lag('debtRatio') - c.base('debtRatio'))) / 100,
        },
      ],
      concepts: ['debt-feedback', 'policy-lags'],
      explain: {
        what: 'The income-tax rate the government’s debt rule calls for. With stabilisers on Automatic it is the tax rate (before your lever); on Manual it is only a suggestion.',
        rule: 'The rate moves toward {normalTaxRate%} + {fiscalResponse} × (debt ratio − its starting level) ÷ 100, at speed {fiscalSpeed} a year, in both modes: 10 more points of debt mean about 3 more points of tax. Without such a rule, interest on a growing debt could feed on itself. Because the rule keeps leaning until debt is back where the tax rate balances the budget, it undoes any lasting change to the tax lever in the end; its strength sets how fast, and how far debt moves meanwhile (the tax change ÷ {fiscalResponse}, in points of GDP). At {fiscalResponse} it is several times stronger than real governments’ estimated reactions, so debt settles within a decade.',
      },
    },
    {
      id: 'taxRuleSuggestion',
      target: 'taxRuleSuggestion',
      category: 'POLICY',
      inputs: ['debtRuleRate'],
      params: ['normalTaxRate'],
      compute: (c) => 100 * (c.v('debtRuleRate') - c.p('normalTaxRate')),
      explain: {
        what: 'The tax shift the debt rule would set now, in percentage points: what “Apply” sets the tax lever to on Manual.',
        rule: 'Suggestion = (the debt rule’s rate − {normalTaxRate%}) × 100. It is the whole shift the rule wants given today’s debt, so a lever already set there satisfies it.',
      },
    },
    {
      id: 'taxRate',
      target: 'taxRate',
      category: 'POLICY',
      label: 'Tax rate: the debt rule’s, or the normal rate',
      inputs: ['debtRuleRate'],
      params: ['normalTaxRate'],
      levers: ['stabilisers'],
      terms: [
        { id: 'rule', label: 'The debt rule (Automatic)', concept: 'debt-feedback', compute: (c) => (automatic(c) ? c.v('debtRuleRate') : 0) },
        { id: 'normal', label: 'The normal rate (Manual)', compute: (c) => (automatic(c) ? 0 : c.p('normalTaxRate')) },
      ],
      concepts: ['policy-lags'],
      explain: {
        what: 'The income-tax rate before your tax lever.',
        rule: 'Automatic (the default here): the debt rule’s rate. Manual: the normal rate {normalTaxRate%}, held; the debt rule only suggests. Your tax lever is added in both.',
      },
    },
    {
      id: 'taxes',
      target: 'taxes',
      category: 'POLICY',
      inputs: ['wages', 'depositInterestHH', 'firmDividends', 'bankDividends', 'taxRate'],
      params: ['taxShift', 'normalTaxRate'],
      // Split by what sets the rate, so ideas at play tell the automatic stabiliser (tax at the
      // normal rate on income that moves with the cycle) from a decision to change the rate, yours
      // or the debt rule's (review TAX-4). The three terms add up to (tax rate + your change) × income.
      terms: [
        { id: 'normalRate', label: 'Normal rate × income', concept: 'automatic-stabilisers', compute: (c) => onIncome(c, c.p('normalTaxRate')) },
        { id: 'debtRule', label: 'The debt rule’s change to the rate × income (Automatic)', concept: 'debt-feedback', compute: (c) => onIncome(c, c.v('taxRate')) - onIncome(c, c.p('normalTaxRate')) },
        { id: 'taxShift', label: 'Your change to the rate × income', concept: 'multiplier', compute: (c) => onIncome(c, c.v('taxRate') + c.p('taxShift')) - onIncome(c, c.v('taxRate')) },
      ],
      concepts: ['automatic-stabilisers', 'multiplier'],
      explain: {
        what: 'Income tax households pay. It rises and falls with income, which steadies the economy.',
        rule: 'Tax = (the income-tax rate before your lever, which is the debt rule’s rate on Automatic and the normal rate {normalTaxRate%} on Manual, + your tax lever, now {taxShift pp}) × (wages + interest + dividends).',
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
      inputs: ['deficit', 'openMarket'],
      stocks: [
        ['treasuryAccount', 'G'],
        ['bonds', 'B'],
      ],
      params: ['treasuryTarget', 'treasuryTopUp'],
      terms: [
        { id: 'deficit', label: 'Deficit to finance', concept: 'deficits-and-money', compute: (c) => c.v('deficit') },
        { id: 'topUp', label: 'Refill the treasury account', compute: (c) => c.p('treasuryTopUp') * (c.p('treasuryTarget') - c.stock('treasuryAccount', 'G')) },
      ],
      // Not additive when negative: a buyback takes at most the bonds the bank has left after
      // this month's sales to the central bank; the rest of a surplus stays in the treasury account.
      combine: (t, c) => Math.max(buybackLimit(c), t.deficit + t.topUp),
      regime: (c, _v, t) => (t.deficit + t.topUp < buybackLimit(c) ? 'Buyback limited by the bank’s bonds' : null),
      concepts: ['deficits-and-money'],
      explain: {
        what: 'Bonds the government sells to the bank to pay its way (negative: buys back from it).',
        rule: 'Bonds sold = the deficit + {treasuryTopUp} × a year of any shortfall of the treasury account below {treasuryTarget}% of GDP. A surplus buys bonds back, but never more than the bank still holds: the rest of the surplus stays in the treasury account.',
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
        'Level shift in real government purchases, % of baseline GDP a year, persistent while set. Nominal spending also rises with the price level. A large lasting cut can push the key rate to zero on Automatic, where the Taylor rule and deposit rates can fall no further (a liquidity trap): at −3 the key rate stays at or just above zero for about 15 years, output is still about 4% lower after ten and 1.4% lower after twenty, and it recovers only as the debt rule cuts taxes. Setting it back to 0 returns spending to its baseline level; the debt built up meanwhile remains.',
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
      description: 'Raises (or cuts) the tax rate on household income by this many points: on top of the debt rule on Automatic, the whole change on Manual.',
      definition:
        'Level shift in the income-tax rate, in percentage points, persistent while set. On Automatic the debt rule then gradually offsets it as debt moves away from target; on Manual nothing offsets it and the debt rule only suggests. A large rise can push the key rate to zero on Automatic: at +3 it stays at or just above zero for about four years, from the fourth year, and output is about 3% lower after five. Setting it back to 0 removes the shift; on Automatic the debt rule unwinds what it did.',
      concepts: ['multiplier', 'debt-feedback'],
    },
  ],
  stabilisers: [
    {
      id: 'debtRule',
      label: 'Debt rule',
      lever: 'taxRate',
      suggestion: 'taxRuleSuggestion',
      shadow: ['debtRuleRate'],
      threshold: 0.25, // half the lever's half-point step: calls when Apply would move the lever
      description:
        'The government’s debt rule: about 3 points more income tax for 10 points more debt, reached gradually. On Automatic it sets the tax rate and your lever adds to it; on Manual it suggests a shift for the tax lever, which turns red when applying it would move the lever.',
      concepts: ['debt-feedback', 'policy-lags'],
      feed: { raise: 'The debt rule would raise income tax by {change} pp', lower: 'The debt rule would cut income tax by {change} pp', indicator: 'govDebt' },
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
