/**
 * Reference economy: the bank, credit and interest.
 *
 * Firms finance part of their investment with bank loans. A new loan creates a deposit (new
 * money); a repayment destroys one. Interest flows from borrowers to the bank and from the bank
 * to depositors, and profits are paid out to households as dividends.
 */
import type { ModuleDef, ParamDef } from '../../core/types.ts';

const assumed = { basis: 'assumed' as const, note: 'Teaching value, chosen to give readable dynamics.' };

const params: ParamDef[] = [
  { id: 'loanFinancedShare', value: 0.4, unit: 'fraction', category: 'BEHAVIOUR', description: 'Share of investment that firms pay for with new bank loans.', provenance: assumed },
  { id: 'loanTerm', value: 8, unit: 'years', category: 'CONTRACT', description: 'Loans are repaid in equal parts over this many years.', provenance: assumed },
  { id: 'creditAppetite', value: 0, unit: '% of GDP/yr', category: 'BEHAVIOUR', description: 'Extra lending the bank pushes beyond what investment needs (set by the lending-appetite lever).', provenance: { basis: 'assumed', note: 'Zero at baseline; moved by a lever.' } },
  { id: 'depositSpread', value: 0.01, unit: 'fraction/yr', category: 'BEHAVIOUR', description: 'How far the deposit rate sits below the key rate.', provenance: assumed },
  { id: 'loanSpread', value: 0.025, unit: 'fraction/yr', category: 'BEHAVIOUR', description: 'How far the loan rate sits above the key rate.', provenance: assumed },
  { id: 'firmCashTarget', value: 0.12, unit: 'fraction of GDP', category: 'BEHAVIOUR', description: 'Deposits firms like to keep, as a share of a year’s GDP.', provenance: assumed },
  { id: 'firmPayoutSpeed', value: 2, unit: 'per year', category: 'BEHAVIOUR', description: 'How fast firms pay out cash above their target.', provenance: assumed },
  { id: 'bankCapitalTarget', value: 0.12, unit: 'fraction of loans', category: 'BEHAVIOUR', description: 'Equity the bank keeps, as a share of its loans.', provenance: assumed },
  { id: 'bankPayoutSpeed', value: 1, unit: 'per year', category: 'BEHAVIOUR', description: 'How fast the bank pays out equity above its target.', provenance: assumed },
];

export const banking: ModuleDef = {
  id: 'banking-and-credit',
  label: 'Bank, credit and interest',
  description: 'Loans create deposits and repayments destroy them; interest and dividends distribute income.',
  requires: ['structure', 'central-bank'],
  params,
  vars: [
    { id: 'depositRate', label: 'Deposit rate', unit: 'fraction/yr', kind: 'rate', scale: 'none' },
    { id: 'loanRate', label: 'Loan rate', unit: 'fraction/yr', kind: 'rate', scale: 'none' },
    { id: 'newLoans', label: 'New loans', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'loanRepayments', label: 'Loan repayments', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'netLending', label: 'Net new lending', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
    { id: 'creditImpulse', label: 'Credit impulse', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'loanInterest', label: 'Interest on loans', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'depositInterestHH', label: 'Interest on household deposits', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'depositInterestF', label: 'Interest on firm deposits', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'firmProfit', label: 'Firms’ cash profit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 16 },
    { id: 'firmDividends', label: 'Dividends from firms', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'bankProfit', label: 'Bank profit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'bankEquity', label: 'Bank equity', unit: '% of GDP', kind: 'state', scale: 'nominal' },
    { id: 'bankDividends', label: 'Dividends from the bank', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ],
  rules: [
    {
      id: 'depositRate',
      target: 'depositRate',
      category: 'BEHAVIOUR',
      inputs: ['keyRate'],
      params: ['depositSpread'],
      terms: [
        { id: 'keyRate', label: 'Key rate', concept: 'taylor-rule', compute: (c) => c.v('keyRate') },
        { id: 'spread', label: 'Bank margin', compute: (c) => -c.p('depositSpread') },
      ],
      // Not additive at the bottom: banks do not charge ordinary savers for holding deposits.
      combine: (t) => Math.max(0, t.keyRate + t.spread),
      regime: (_c, _v, t) => (t.keyRate + t.spread < 0 ? 'Deposit rate at its floor: bank margin squeezed' : null),
      explain: {
        what: 'Interest the bank pays on deposits, per year.',
        rule: 'Deposit rate = key rate − {depositSpread pp}, never below 0%: when the key rate is below the margin, the bank pays nothing on deposits and its margin is squeezed instead.',
      },
    },
    {
      id: 'loanRate',
      target: 'loanRate',
      category: 'BEHAVIOUR',
      inputs: ['keyRate'],
      params: ['loanSpread'],
      terms: [
        { id: 'keyRate', label: 'Key rate', concept: 'taylor-rule', compute: (c) => c.v('keyRate') },
        { id: 'spread', label: 'Bank margin', compute: (c) => c.p('loanSpread') },
      ],
      explain: { what: 'Interest the bank charges on loans, per year.', rule: 'Loan rate = key rate + {loanSpread pp}.' },
    },
    {
      id: 'newLoans',
      target: 'newLoans',
      category: 'BEHAVIOUR',
      inputs: ['investment'],
      params: ['loanFinancedShare', 'creditAppetite'],
      terms: [
        { id: 'investmentFinance', label: 'Loans for investment', concept: 'endogenous-money', compute: (c) => c.p('loanFinancedShare') * c.v('investment') },
        { id: 'appetite', label: 'Bank lending appetite', concept: 'credit-impulse', compute: (c) => c.p('creditAppetite') },
      ],
      concepts: ['endogenous-money'],
      explain: {
        what: 'New loans the bank makes to firms, % of GDP a year. Each loan creates a new deposit.',
        rule: 'New loans = {loanFinancedShare} × investment + any extra lending the bank is keen to push.',
      },
    },
    {
      id: 'loanRepayments',
      target: 'loanRepayments',
      category: 'CONTRACT',
      stocks: [['loans', 'F']],
      params: ['loanTerm'],
      compute: (c) => c.stock('loans', 'F') / c.p('loanTerm'),
      concepts: ['money-destruction'],
      explain: { what: 'Principal firms repay, % of GDP a year. Repaying a bank destroys the deposit used.', rule: 'Repayments = loans outstanding ÷ {loanTerm} years.' },
    },
    {
      id: 'netLending',
      target: 'netLending',
      category: 'IDENTITY',
      inputs: ['newLoans', 'loanRepayments'],
      compute: (c) => c.v('newLoans') - c.v('loanRepayments'),
      concepts: ['endogenous-money'],
      explain: { what: 'How fast bank credit, and with it money, is growing.', rule: 'Net new lending = new loans − repayments.' },
    },
    {
      id: 'creditImpulse',
      target: 'creditImpulse',
      category: 'IDENTITY',
      inputs: ['netLending'],
      lagInputs: ['netLending'],
      compute: (c) => c.v('netLending') - c.lag('netLending', Math.round(1 / c.dt)),
      concepts: ['credit-impulse'],
      explain: {
        what: 'The change in the flow of new credit compared with a year earlier. Positive means credit is accelerating, which adds to spending.',
        rule: 'Credit impulse = net new lending now − net new lending 12 months ago.',
      },
    },
    {
      id: 'loanInterest',
      target: 'loanInterest',
      category: 'CONTRACT',
      inputs: ['loanRate'],
      stocks: [['loans', 'F']],
      compute: (c) => c.v('loanRate') * c.stock('loans', 'F'),
      concepts: ['interest-distribution'],
      explain: { what: 'Interest firms pay the bank.', rule: 'Interest = loan rate × loans outstanding.' },
    },
    {
      id: 'depositInterestHH',
      target: 'depositInterestHH',
      category: 'CONTRACT',
      inputs: ['depositRate'],
      stocks: [['deposits', 'HH']],
      compute: (c) => c.v('depositRate') * c.stock('deposits', 'HH'),
      concepts: ['interest-distribution'],
      explain: { what: 'Interest the bank pays households on their deposits.', rule: 'Interest = deposit rate × household deposits.' },
    },
    {
      id: 'depositInterestF',
      target: 'depositInterestF',
      category: 'CONTRACT',
      inputs: ['depositRate'],
      stocks: [['deposits', 'F']],
      compute: (c) => c.v('depositRate') * c.stock('deposits', 'F'),
      concepts: ['interest-distribution'],
      explain: { what: 'Interest the bank pays firms on their deposits.', rule: 'Interest = deposit rate × firm deposits.' },
    },
    {
      id: 'firmProfit',
      target: 'firmProfit',
      category: 'IDENTITY',
      inputs: ['consumption', 'govSpending', 'wages', 'loanInterest', 'depositInterestF'],
      terms: [
        { id: 'sales', label: 'Sales to households and government', concept: 'sectoral-balances', compute: (c) => c.v('consumption') + c.v('govSpending') },
        { id: 'wageCosts', label: 'Wages paid', compute: (c) => -c.v('wages') },
        { id: 'netInterest', label: 'Net interest', concept: 'interest-distribution', compute: (c) => c.v('depositInterestF') - c.v('loanInterest') },
      ],
      explain: {
        what: 'Firms’ cash profit: money in minus money out on current account.',
        rule: 'Cash profit = sales to households and government − wages − interest paid + interest received. Machines bought from other firms cancel out within the sector.',
      },
    },
    {
      id: 'firmDividends',
      target: 'firmDividends',
      category: 'BEHAVIOUR',
      lagInputs: ['firmProfit', 'gdp'],
      stocks: [['deposits', 'F']],
      params: ['firmPayoutSpeed', 'firmCashTarget'],
      terms: [
        { id: 'profit', label: 'Last month’s profit', compute: (c) => c.lag('firmProfit') },
        { id: 'surplusCash', label: 'Cash above target', compute: (c) => c.p('firmPayoutSpeed') * (c.stock('deposits', 'F') - c.p('firmCashTarget') * c.lag('gdp')) },
      ],
      explain: {
        what: 'Profits firms pay out to their owners, the households.',
        rule: 'Firms pay out last month’s cash profit, plus {firmPayoutSpeed} × a year of any deposits above {firmCashTarget} of GDP (minus if below).',
      },
    },
    {
      id: 'bankProfit',
      target: 'bankProfit',
      category: 'IDENTITY',
      inputs: ['loanInterest', 'bondInterestBank', 'reserveInterest', 'depositInterestHH', 'depositInterestF'],
      terms: [
        { id: 'loans', label: 'Interest from loans', concept: 'interest-distribution', compute: (c) => c.v('loanInterest') },
        { id: 'bonds', label: 'Interest from bonds', compute: (c) => c.v('bondInterestBank') },
        { id: 'reserves', label: 'Interest on reserves', concept: 'reserves-and-payments', compute: (c) => c.v('reserveInterest') },
        { id: 'deposits', label: 'Interest paid to depositors', concept: 'interest-distribution', compute: (c) => -c.v('depositInterestHH') - c.v('depositInterestF') },
      ],
      explain: { what: 'The bank’s profit: interest earned minus interest paid.', rule: 'Bank profit = interest on loans, bonds and reserves − interest on deposits.' },
    },
    {
      id: 'bankEquity',
      target: 'bankEquity',
      category: 'IDENTITY',
      stocks: [
        ['loans', 'B'],
        ['bonds', 'B'],
        ['reserves', 'B'],
        ['deposits', 'B'],
      ],
      compute: (c) => c.stock('loans', 'B') + c.stock('bonds', 'B') + c.stock('reserves', 'B') - c.stock('deposits', 'B'),
      concepts: ['net-worth', 'double-entry'],
      explain: { what: 'The bank’s own capital: what it owns minus what it owes.', rule: 'Equity = loans + bonds + reserves − deposits (at the end of last month).' },
    },
    {
      id: 'bankDividends',
      target: 'bankDividends',
      category: 'BEHAVIOUR',
      inputs: ['bankProfit', 'bankEquity'],
      stocks: [['loans', 'B']],
      params: ['bankPayoutSpeed', 'bankCapitalTarget'],
      terms: [
        { id: 'profit', label: 'Profit', compute: (c) => c.v('bankProfit') },
        { id: 'capitalSurplus', label: 'Capital above target', concept: 'net-worth', compute: (c) => c.p('bankPayoutSpeed') * (c.v('bankEquity') - c.p('bankCapitalTarget') * c.stock('loans', 'B')) },
      ],
      explain: {
        what: 'Profits the bank pays out to households.',
        rule: 'The bank pays out its profit, plus {bankPayoutSpeed} × a year of any equity above {bankCapitalTarget} of its loans (minus if below).',
      },
    },
  ],
  flows: [
    {
      id: 'newLoans',
      label: 'New loans',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'issue', instrument: 'loans' },
      legs: [{ from: 'B', to: 'F', amount: 'newLoans' }],
      concepts: ['endogenous-money'],
      explain: { what: 'The bank lends to firms by crediting their deposit accounts: new money is created.' },
    },
    {
      id: 'loanRepayments',
      label: 'Loan repayments',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'redeem', instrument: 'loans' },
      legs: [{ from: 'F', to: 'B', amount: 'loanRepayments' }],
      concepts: ['money-destruction'],
      explain: { what: 'Firms repay loans from their deposits: the loan and the deposit both disappear, so money is destroyed.' },
    },
    {
      id: 'loanInterest',
      label: 'Interest on loans',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'F', to: 'B', amount: 'loanInterest' }],
      concepts: ['interest-distribution'],
      explain: { what: 'Firms pay interest to the bank. Paying the bank destroys deposits, just as a repayment does.' },
    },
    {
      id: 'depositInterest',
      label: 'Interest on deposits',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [
        { from: 'B', to: 'HH', amount: 'depositInterestHH' },
        { from: 'B', to: 'F', amount: 'depositInterestF' },
      ],
      concepts: ['interest-distribution'],
      explain: { what: 'The bank pays interest by crediting deposits, which creates money.' },
    },
    {
      id: 'dividends',
      label: 'Dividends',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [
        { from: 'F', to: 'HH', amount: 'firmDividends' },
        { from: 'B', to: 'HH', amount: 'bankDividends' },
      ],
      explain: { what: 'Firms and the bank pay their profits to their owners, the households.' },
    },
  ],
  levers: [
    {
      id: 'lendingAppetite',
      label: 'Bank lending appetite',
      group: 'Economy',
      section: 'Banks',
      kind: 'setting',
      unit: '% of GDP/yr',
      default: 0,
      min: -2,
      max: 2,
      step: 0.25,
      binds: { param: 'creditAppetite', mode: 'add' },
      description: 'Extra (or less) lending the bank is willing to push to firms each year, which firms invest.',
      definition:
        'Level shift in the flow of new loans, % of baseline GDP a year, persistent while set. Firms spend the extra credit on investment. Setting it back to 0 ends the extra lending; the loans already made are repaid over the loan term.',
      concepts: ['endogenous-money', 'credit-impulse'],
    },
  ],
  tests: [
    {
      id: 'repayment-arithmetic',
      label: 'Repayments = loans outstanding ÷ loan term',
      run: (e) => {
        const term = e.influences('loanRepayments').params.find((p) => p.id === 'loanTerm')!.value;
        const loans = e.balanceSheet('F').liabilities.find((l) => l.instrument === 'loans')!.value;
        const want = loans / term;
        const got = e.value('loanRepayments');
        return { pass: Math.abs(got - want) < 1e-9, detail: `repayments ${got.toFixed(6)} vs ${want.toFixed(6)}` };
      },
    },
    {
      id: 'deposit-rate-floor',
      label: 'With the key rate held at 0%, the bank pays 0% on deposits, not −1%: no deposit interest is negative',
      run: (e) => {
        e.setLever('stabilisers', 0);
        e.setLever('keyRateFixed', 0);
        e.step(3);
        const rate = e.value('depositRate');
        const lowest = Math.min(e.value('depositInterestHH'), e.value('depositInterestF'));
        const regime = e.influences('depositRate').regime ?? '';
        return { pass: rate === 0 && lowest >= 0 && regime.startsWith('Deposit rate at its floor'), detail: `deposit rate ${rate}, lowest deposit interest ${lowest.toFixed(4)}; regime “${regime}”` };
      },
    },
    {
      id: 'loans-create-deposits',
      label: 'More bank lending creates deposits: broad money rises with the loan book',
      run: (e) => {
        e.setLever('lendingAppetite', 1);
        e.step(24);
        const loans = e.balanceSheet('B').assets.find((a) => a.instrument === 'loans')!;
        const dep = e.balanceSheet('B').liabilities.find((l) => l.instrument === 'deposits')!;
        const dL = loans.value - loans.baseline,
          dD = dep.value - dep.baseline;
        return { pass: dL > 0 && dD > 0, detail: `after 24 months: loans +${dL.toFixed(2)}, deposits +${dD.toFixed(2)} (% of GDP)` };
      },
    },
  ],
};
