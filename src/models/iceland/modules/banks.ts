/**
 * Iceland Inc.: the banks (v1 equations E4, E5 and E25).
 *
 * Loan and deposit rates follow the key rate. When bank capital falls below its target, a premium
 * is added to loan and mortgage rates. Banks pay interest by crediting deposits (new money) and
 * are paid interest from deposits (money destroyed). They pay out smoothed profit as dividends,
 * less what they need to rebuild capital.
 */
import type { Id, ModuleDef, RuleDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { pickParams, terms, lastMonth } from '../util.ts';

const DEPOSITORS = ['HY', 'HW', 'HO', 'FD', 'FX', 'PF', 'W'] as const;
const DEP_LABEL: Record<(typeof DEPOSITORS)[number], string> = {
  HY: 'young households',
  HW: 'working-age households',
  HO: 'older households',
  FD: 'domestic firms',
  FX: 'exporters',
  PF: 'pension funds',
  W: 'non-residents',
};
const DIV_TO = [
  ['G', 'divBshG', 'the government (which owns Landsbankinn)'],
  ['PF', 'divBshPF', 'pension funds'],
  ['HW', 'divBshW', 'working-age households'],
  ['HO', '', 'older households'],
] as const;

const depositInterest: RuleDef[] = DEPOSITORS.map((pl) => ({
  id: `depositInterest${pl}`,
  target: `depositInterest${pl}`,
  category: 'CONTRACT',
  inputs: ['depositRate'],
  stocks: [['deposits', pl]],
  compute: (c) => c.v('depositRate') * c.stock('deposits', pl),
  concepts: ['interest-distribution'],
  explain: { what: `Interest the banks pay ${DEP_LABEL[pl]} on their deposits, by crediting them: new money.`, rule: 'Interest = deposit rate × deposits at the start of the month.' },
}));

const bankDividendLegs: RuleDef[] = DIV_TO.map(([pl, share, who]) => ({
  id: `bankDividends${pl}`,
  target: `bankDividends${pl}`,
  category: 'BEHAVIOUR',
  inputs: ['bankDividends'],
  params: share ? [share] : ['divBshG', 'divBshPF', 'divBshW'],
  compute: (c) => (share ? c.p(share) : 1 - c.p('divBshG') - c.p('divBshPF') - c.p('divBshW')) * c.v('bankDividends'),
  explain: {
    what: `Bank dividends paid to ${who}.`,
    rule: share ? `Their share {${share}%} of the banks’ dividends.` : 'What is left after the government ({divBshG%}), pension funds ({divBshPF%}) and working-age households ({divBshW%}).',
  },
}));

const sumOf = (ids: Id[]) => (c: { v(id: Id): number }) => ids.reduce((s, id) => s + c.v(id), 0);
const MORT_B: Id[] = ['mortgageInterest_HY_B', 'mortgageInterest_HW_B'];
const IDX_B: Id[] = ['indexation_HY_B', 'indexation_HW_B'];
const DEP_ALL: Id[] = DEPOSITORS.map((p) => `depositInterest${p}`);

export const banks: ModuleDef = {
  id: 'banks',
  label: 'Banks',
  description: 'Deposit, loan and mortgage rates; the capital premium; interest paid and received; profit, dividends and the lending-appetite lever.',
  requires: ['structure', 'central-bank', 'government', 'households'],
  params: pickParams(ALL_PARAMS, ['kapT', 'kapMin', 'rwM', 'rwL', 'sCap', 'lamEq', 'lamDivB', 'divBshG', 'divBshPF', 'divBshW', 'mD', 'sL', 'sMN', 'rMI0', 'psiIdx', 'sBB', 'lendingAppetite', 'm3']),
  vars: [
    { id: 'bankEquity', label: 'Bank equity', unit: '% of GDP', kind: 'state', scale: 'nominal', initial: base('bankEquity') },
    { id: 'riskWeightedAssets', label: 'Risk-weighted assets', unit: '% of GDP', kind: 'state', scale: 'nominal', initial: base('riskWeightedAssets') },
    { id: 'capitalRatio', label: 'Bank capital ratio', unit: 'fraction', kind: 'ratio', scale: 'none', initial: base('capitalRatio') },
    { id: 'loanPremium', label: 'Capital premium on loans', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0 },
    { id: 'depositRate', label: 'Deposit rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('depositRate') },
    { id: 'loanRate', label: 'Business-loan rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('loanRate') },
    { id: 'mortgageRateN', label: 'Non-indexed mortgage rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('mortgageRateN') },
    { id: 'mortgageRateI', label: 'Indexed mortgage rate (real)', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('mortgageRateI') },
    { id: 'bankBondRate', label: 'Bank-bond rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('bankBondRate') },
    ...DEPOSITORS.map((pl) => ({ id: `depositInterest${pl}`, label: `Deposit interest to ${DEP_LABEL[pl]}`, unit: '% of GDP/yr', kind: 'flow' as const, scale: 'nominal' as const })),
    { id: 'loanInterestFD', label: 'Loan interest from domestic firms', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'loanInterestFX', label: 'Loan interest from exporters', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'bankBondInterest', label: 'Interest on bank bonds', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'bankProfit', label: 'Bank profit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('bankProfit') },
    { id: 'bankProfitSmoothed', label: 'Bank profit (smoothed)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('bankProfitSmoothed') },
    { id: 'bankDividends', label: 'Bank dividends', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('bankDividends') },
    ...DIV_TO.map(([pl, , who]) => ({ id: `bankDividends${pl}`, label: `Bank dividends to ${who}`, unit: '% of GDP/yr', kind: 'flow' as const, scale: 'nominal' as const })),
  ],
  rules: [
    {
      id: 'bankEquity',
      target: 'bankEquity',
      category: 'IDENTITY',
      stocks: [
        ['mortgagesN', 'B'],
        ['mortgagesI', 'B'],
        ['businessLoans', 'B'],
        ['govBonds', 'B'],
        ['reserves', 'B'],
        ['deposits', 'B'],
        ['bankBonds', 'B'],
      ],
      terms: terms(
        ['mortgages', 'Mortgages', undefined, (c) => c.stock('mortgagesN', 'B') + c.stock('mortgagesI', 'B')],
        ['loans', 'Business loans', undefined, (c) => c.stock('businessLoans', 'B')],
        ['bonds', 'Government bonds', undefined, (c) => c.stock('govBonds', 'B')],
        ['reserves', 'Reserves', 'reserves-and-payments', (c) => c.stock('reserves', 'B')],
        ['deposits', 'Deposits owed', 'endogenous-money', (c) => -c.stock('deposits', 'B')],
        ['bankBonds', 'Bank bonds owed', undefined, (c) => -c.stock('bankBonds', 'B')],
      ),
      concepts: ['net-worth', 'bank-capital'],
      explain: { what: 'The banks’ own capital: what they own minus what they owe, at the start of the month.', rule: 'Equity = mortgages + business loans + government bonds + reserves − deposits − bank bonds.' },
    },
    {
      id: 'riskWeightedAssets',
      target: 'riskWeightedAssets',
      category: 'CONTRACT',
      params: ['rwM', 'rwL'],
      stocks: [
        ['mortgagesN', 'B'],
        ['mortgagesI', 'B'],
        ['businessLoans', 'B'],
      ],
      terms: terms(
        ['mortgages', 'Mortgages × risk weight', undefined, (c) => c.p('rwM') * (c.stock('mortgagesN', 'B') + c.stock('mortgagesI', 'B'))],
        ['loans', 'Business loans × risk weight', undefined, (c) => c.p('rwL') * c.stock('businessLoans', 'B')],
      ),
      concepts: ['bank-capital'],
      explain: { what: 'Banks’ loans weighted by how risky the rules count them; capital requirements are a share of this.', rule: 'Risk-weighted assets = {rwM} × mortgages + {rwL} × business loans.' },
    },
    {
      id: 'capitalRatio',
      target: 'capitalRatio',
      category: 'IDENTITY',
      inputs: ['bankEquity', 'riskWeightedAssets'],
      compute: (c) => c.v('bankEquity') / c.v('riskWeightedAssets'),
      concepts: ['bank-capital'],
      explain: { what: 'Bank equity as a share of risk-weighted assets.', rule: 'Capital ratio = equity ÷ risk-weighted assets. The target is {kapT%}.' },
    },
    {
      id: 'loanPremium',
      target: 'loanPremium',
      category: 'BEHAVIOUR',
      inputs: ['capitalRatio'],
      params: ['sCap', 'kapT', 'kapMin'],
      compute: (c) => (c.p('sCap') * Math.max(0, c.p('kapT') - c.v('capitalRatio'))) / (c.p('kapT') - c.p('kapMin')),
      regime: (c) => (c.v('capitalRatio') < c.p('kapT') - 1e-12 ? 'Capital below target: loans cost more' : null),
      concepts: ['bank-capital'],
      explain: {
        what: 'Extra interest banks charge on loans and mortgages when their capital is below target, to rebuild it.',
        rule: 'Premium = {sCap pp} × (target {kapT%} − capital ratio) ÷ ({kapT%} − {kapMin%}), and zero when capital is at or above target.',
      },
    },
    {
      id: 'depositRate',
      target: 'depositRate',
      category: 'BEHAVIOUR',
      inputs: ['keyRate'],
      params: ['mD'],
      terms: terms(['keyRate', 'Key rate', 'taylor-rule', (c) => c.v('keyRate')], ['margin', 'Bank margin', undefined, (c) => -c.p('mD')]),
      explain: { what: 'Interest banks pay on deposits.', rule: 'Deposit rate = key rate − {mD pp}.' },
    },
    {
      id: 'loanRate',
      target: 'loanRate',
      category: 'BEHAVIOUR',
      inputs: ['keyRate', 'loanPremium'],
      params: ['sL'],
      terms: terms(
        ['keyRate', 'Key rate', 'taylor-rule', (c) => c.v('keyRate')],
        ['spread', 'Business-loan spread', undefined, (c) => c.p('sL')],
        ['capitalPremium', 'Capital premium', 'bank-capital', (c) => c.v('loanPremium')],
      ),
      explain: { what: 'Interest firms pay on bank loans.', rule: 'Loan rate = key rate + {sL pp} + the capital premium.' },
    },
    {
      id: 'mortgageRateN',
      target: 'mortgageRateN',
      category: 'BEHAVIOUR',
      inputs: ['keyRate', 'loanPremium'],
      params: ['sMN'],
      terms: terms(
        ['keyRate', 'Key rate', 'taylor-rule', (c) => c.v('keyRate')],
        ['spread', 'Mortgage spread', undefined, (c) => c.p('sMN')],
        ['capitalPremium', 'Capital premium', 'bank-capital', (c) => c.v('loanPremium')],
      ),
      explain: { what: 'Interest on non-indexed mortgages, new and old (they float with the key rate).', rule: 'Rate = key rate + {sMN pp} + the capital premium.' },
    },
    {
      id: 'mortgageRateI',
      target: 'mortgageRateI',
      category: 'BEHAVIOUR',
      inputs: ['keyRate', 'loanPremium'],
      params: ['rMI0', 'psiIdx', 'i0'],
      terms: terms(
        ['normal', 'Normal real rate', undefined, (c) => c.p('rMI0')],
        ['keyRate', 'Key rate above neutral (partly passed on)', 'taylor-rule', (c) => c.p('psiIdx') * (c.v('keyRate') - c.p('i0'))],
        ['capitalPremium', 'Capital premium', 'bank-capital', (c) => c.v('loanPremium')],
      ),
      concepts: ['indexation'],
      explain: {
        what: 'The real interest rate paid in cash on CPI-indexed mortgages. Inflation is added to the loan instead of being paid.',
        rule: 'Real rate = {rMI0%} + {psiIdx} × (key rate − neutral rate {i0%}) + the capital premium.',
      },
    },
    {
      id: 'bankBondRate',
      target: 'bankBondRate',
      category: 'CONTRACT',
      inputs: ['keyRate'],
      params: ['sBB'],
      terms: terms(['keyRate', 'Key rate', 'taylor-rule', (c) => c.v('keyRate')], ['spread', 'Bank-bond spread', undefined, (c) => c.p('sBB')]),
      explain: { what: 'Interest banks pay on the covered bonds pension funds hold.', rule: 'Rate = key rate + {sBB pp}.' },
    },
    ...depositInterest,
    {
      id: 'loanInterestFD',
      target: 'loanInterestFD',
      category: 'CONTRACT',
      inputs: ['loanRate'],
      stocks: [['businessLoans', 'FD']],
      compute: (c) => c.v('loanRate') * c.stock('businessLoans', 'FD'),
      concepts: ['interest-distribution'],
      explain: { what: 'Interest domestic firms pay the banks.', rule: 'Interest = loan rate × their loans.' },
    },
    {
      id: 'loanInterestFX',
      target: 'loanInterestFX',
      category: 'CONTRACT',
      inputs: ['loanRate'],
      stocks: [['businessLoans', 'FX']],
      compute: (c) => c.v('loanRate') * c.stock('businessLoans', 'FX'),
      concepts: ['interest-distribution'],
      explain: { what: 'Interest exporters pay the banks.', rule: 'Interest = loan rate × their loans.' },
    },
    {
      id: 'bankBondInterest',
      target: 'bankBondInterest',
      category: 'CONTRACT',
      inputs: ['bankBondRate'],
      stocks: [['bankBonds', 'PF']],
      compute: (c) => c.v('bankBondRate') * c.stock('bankBonds', 'PF'),
      concepts: ['interest-distribution'],
      explain: { what: 'Interest banks pay pension funds on bank bonds, by crediting the funds’ deposits.', rule: 'Interest = bank-bond rate × bank bonds.' },
    },
    {
      id: 'bankProfit',
      target: 'bankProfit',
      category: 'IDENTITY',
      inputs: [...MORT_B, ...IDX_B, 'loanInterestFD', 'loanInterestFX', 'bondInterestB', 'reserveInterest', ...DEP_ALL, 'bankBondInterest'],
      terms: terms(
        ['mortgages', 'Mortgage interest', 'interest-distribution', sumOf(MORT_B)],
        ['indexation', 'Indexation of indexed mortgages', 'indexation', sumOf(IDX_B)],
        ['loans', 'Business-loan interest', 'interest-distribution', sumOf(['loanInterestFD', 'loanInterestFX'])],
        ['bonds', 'Government-bond interest', undefined, (c) => c.v('bondInterestB')],
        ['reserves', 'Interest on reserves', 'reserves-and-payments', (c) => c.v('reserveInterest')],
        ['deposits', 'Interest paid on deposits', 'interest-distribution', (c) => -sumOf(DEP_ALL)(c)],
        ['bankBonds', 'Interest paid on bank bonds', undefined, (c) => -c.v('bankBondInterest')],
      ),
      concepts: ['bank-capital'],
      explain: {
        what: 'The banks’ profit: interest earned (including indexation added to indexed mortgages) minus interest paid. Banks have no other costs in the model.',
        rule: 'Profit = mortgage interest and indexation + business-loan interest + bond interest + interest on reserves − deposit interest − bank-bond interest.',
      },
    },
    {
      id: 'bankProfitSmoothed',
      target: 'bankProfitSmoothed',
      category: 'BEHAVIOUR',
      inputs: ['bankProfit'],
      adjust: { speed: 'lamDivB', form: 'exponential' },
      terms: terms(['profit', 'Profit this month', undefined, (c) => c.v('bankProfit')]),
      concepts: ['gradual-adjustment'],
      explain: { what: 'Bank profit smoothed over the recent past; dividends follow it rather than every monthly swing.', rule: 'Moves toward this month’s profit at speed {lamDivB} a year.' },
    },
    {
      id: 'bankDividends',
      target: 'bankDividends',
      category: 'BEHAVIOUR',
      lagInputs: ['bankProfitSmoothed'],
      inputs: ['bankEquity', 'riskWeightedAssets'],
      params: ['lamEq', 'kapT'],
      terms: terms(
        ['profit', 'Smoothed profit', undefined, (c) => lastMonth(c, 'bankProfitSmoothed')],
        ['capitalRebuild', 'Rebuilding capital', 'bank-capital', (c) => -c.p('lamEq') * (c.p('kapT') * c.v('riskWeightedAssets') - c.v('bankEquity'))],
      ),
      explain: {
        what: 'Profits the banks pay out to their owners.',
        rule: 'Dividends = last month’s smoothed profit − {lamEq} × (capital needed at {kapT%} of risk-weighted assets − equity). Banks short of capital pay out less, and more when they have too much.',
      },
    },
    ...bankDividendLegs,
  ],
  flows: [
    {
      id: 'depositInterest',
      label: 'Interest on deposits',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: DEPOSITORS.map((pl) => ({ from: 'B', to: pl, amount: `depositInterest${pl}` })),
      concepts: ['interest-distribution', 'endogenous-money'],
      explain: { what: 'Banks pay interest by crediting deposits: the interest is new money.' },
    },
    {
      id: 'loanInterest',
      label: 'Interest on business loans',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [
        { from: 'FD', to: 'B', amount: 'loanInterestFD' },
        { from: 'FX', to: 'B', amount: 'loanInterestFX' },
      ],
      concepts: ['interest-distribution', 'money-destruction'],
      explain: { what: 'Firms pay interest to the banks from their deposits, which cancels those deposits.' },
    },
    {
      id: 'bankBondInterest',
      label: 'Interest on bank bonds',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'B', to: 'PF', amount: 'bankBondInterest' }],
      concepts: ['interest-distribution'],
      explain: { what: 'Banks pay interest on the covered bonds pension funds hold.' },
    },
    {
      id: 'bankDividendPayments',
      label: 'Bank dividends',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: DIV_TO.map(([pl]) => ({ from: 'B', to: pl, amount: `bankDividends${pl}` })),
      concepts: ['bank-capital'],
      explain: { what: 'Banks pay dividends to their owners: the government, pension funds and households.' },
    },
  ],
  levers: [
    {
      id: 'lendingAppetite',
      label: 'Bank lending appetite',
      group: 'Economy',
      section: 'Banks',
      kind: 'setting',
      unit: '% of GDP per yr',
      default: 0,
      min: -3,
      max: 3,
      step: 0.25,
      binds: { param: 'lendingAppetite', mode: 'add' },
      description: 'Extra (or less) mortgage lending banks are willing to push each year.',
      definition:
        'Level shift in households’ desired new mortgage borrowing, % of baseline GDP a year, split between the young and working age by their share of mortgage debt; persistent while set and still subject to the debt-service and loan-to-value caps. Setting it back to 0 ends the push; loans already made are repaid over their term.',
      concepts: ['endogenous-money', 'credit-impulse'],
    },
  ],
  tests: [
    {
      id: 'capital-at-target',
      label: 'At baseline bank capital is at its target, so there is no loan premium and dividends equal profit',
      run: (e) => {
        const k = e.baseline('capitalRatio');
        const gap = e.baseline('bankDividends') - e.baseline('bankProfit');
        return { pass: Math.abs(k - 0.22) < 1e-9 && Math.abs(e.baseline('loanPremium')) < 1e-12 && Math.abs(gap) < 1e-9, detail: `capital ratio ${k.toFixed(6)}, dividends − profit ${gap.toExponential(2)}` };
      },
    },
  ],
};
