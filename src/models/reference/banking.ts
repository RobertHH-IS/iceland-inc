/**
 * Reference economy: the bank, credit and interest.
 *
 * Firms finance part of their investment with bank loans. A new loan creates a deposit (new
 * money); a repayment destroys one. Interest flows from borrowers to the bank and from the bank
 * to depositors, and profits are paid out to households as dividends. When the bank is keen to
 * lend more (the lending-appetite lever), firms spend the net new credit it gives them: the extra
 * lending minus what they repay on the extra debt. So the boost to demand follows the flow of net
 * credit and fades as repayments catch up (the credit impulse), and reverses when the appetite
 * goes.
 */
import type { ModuleDef, ParamDef } from '../../core/types.ts';

const assumed = { basis: 'assumed' as const, note: 'Teaching value, chosen to give readable dynamics.' };

const params: ParamDef[] = [
  { id: 'loanFinancedShare', value: 0.4, unit: 'fraction', category: 'BEHAVIOUR', description: 'Share of investment that firms pay for with new bank loans.', provenance: assumed },
  { id: 'loanTerm', value: 8, unit: 'years', category: 'CONTRACT', description: 'Loans are repaid in equal parts over this many years.', provenance: assumed },
  { id: 'creditAppetite', value: 0, unit: '% of GDP/yr', category: 'BEHAVIOUR', description: 'Extra lending a year the bank is willing to give firms beyond what their own investment plans need (set by the lending-appetite lever).', provenance: { basis: 'assumed', note: 'Zero at baseline; moved by a lever.' } },
  { id: 'depositSpread', value: 0.01, unit: 'fraction/yr', category: 'BEHAVIOUR', description: 'How far the deposit rate sits below the key rate.', provenance: assumed },
  { id: 'loanSpread', value: 0.025, unit: 'fraction/yr', category: 'BEHAVIOUR', description: 'How far the loan rate sits above the key rate.', provenance: assumed },
  { id: 'firmCashTarget', value: 0.12, unit: 'fraction of GDP', category: 'BEHAVIOUR', description: 'Deposits firms like to keep, as a share of a year’s GDP.', provenance: assumed },
  { id: 'firmPayMarginal', value: 0.5, unit: 'fraction', category: 'BEHAVIOUR', description: 'Share of a change in profit that firms pay out at once; the rest follows as their view of normal profit catches up.', provenance: { basis: 'assumed', note: 'Lintner (1956, American Economic Review 46(2)): firms smooth dividends toward a target share of earnings. The reference firms pay out all their profit in the long run, so half of a change at once and the rest within about a year is a mild smoothing; 0.3, as in the Iceland model (payMarginal), deepened the output trough after a 10% wage settlement with the policy rules acting beyond 5% (tests/models/reference-review). Before 29 September 2026 firms paid out all of last month’s profit, so that settlement raised real disposable income 6.4% in month 1 and cut it 3.3% by month 3; now −0.9% (lever review REF-WAGE-DIVIDEND-SPIKE).' } },
  { id: 'firmProfitSmoothing', value: 1, unit: 'per year', category: 'BEHAVIOUR', description: 'How fast firms’ view of normal profit, which sets their dividends, follows their actual profit.', provenance: { basis: 'assumed', note: 'Teaching value: a mean lag of a year, in the spirit of Lintner’s (1956) partial adjustment of dividends; cash firms keep meanwhile is paid out too (firmPayoutSpeed).' } },
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
    { id: 'creditInvestment', label: 'Investment paid for by the bank’s extra credit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0, description: 'The net new credit the bank’s lending appetite gives firms, which they spend on investment.' },
    { id: 'appetiteLoans', label: 'Loans from the bank’s extra appetite', unit: '% of GDP', kind: 'state', scale: 'nominal', initial: 0, description: 'The part of firms’ loans that the bank’s extra lending appetite has added: a memo line, not a separate instrument.' },
    { id: 'newLoans', label: 'New loans', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'loanRepayments', label: 'Loan repayments', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'netLending', label: 'Net new lending', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
    { id: 'creditImpulse', label: 'Credit impulse', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'loanInterest', label: 'Interest on loans', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'depositInterestHH', label: 'Interest on household deposits', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'depositInterestF', label: 'Interest on firm deposits', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'firmProfit', label: 'Firms’ cash profit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 16 },
    { id: 'normalProfit', label: 'Firms’ normal profit, as they see it', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 16, description: 'The profit firms treat as normal when they set dividends: their cash profit, smoothed.' },
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
        { id: 'keyRate', label: 'Key rate', concept: 'interest-rate-channel', compute: (c) => c.v('keyRate') },
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
        { id: 'keyRate', label: 'Key rate', concept: 'interest-rate-channel', compute: (c) => c.v('keyRate') },
        { id: 'spread', label: 'Bank margin', compute: (c) => c.p('loanSpread') },
      ],
      explain: { what: 'Interest the bank charges on loans, per year.', rule: 'Loan rate = key rate + {loanSpread pp}.' },
    },
    {
      id: 'creditInvestment',
      target: 'creditInvestment',
      category: 'BEHAVIOUR',
      label: 'Spending the bank’s extra credit',
      lagInputs: ['appetiteLoans'],
      params: ['creditAppetite', 'loanTerm'],
      adjust: { speed: 'investmentSpeed' },
      terms: [
        { id: 'appetite', label: 'Extra lending the bank offers', concept: 'endogenous-money', compute: (c) => c.p('creditAppetite') },
        { id: 'repayments', label: 'Repaying the extra debt', concept: 'money-destruction', compute: (c) => -c.lag('appetiteLoans') / c.p('loanTerm') },
      ],
      concepts: ['credit-impulse'],
      explain: {
        what: 'Investment firms pay for with the net new credit the bank’s extra lending appetite gives them, % of GDP a year: the extra lending minus what they repay on the extra debt.',
        rule: 'Moves toward the extra lending the bank offers ({creditAppetite}% of GDP a year) minus the repayments on the extra loans already made (those loans ÷ {loanTerm} years), at the speed firms turn plans into spending ({investmentSpeed} a year). As the extra debt builds up, repayments take more and more of the new credit, so the extra spending fades; when the appetite goes, repayments exceed it and investment falls below normal until the extra debt is repaid.',
      },
    },
    {
      id: 'appetiteLoans',
      target: 'appetiteLoans',
      category: 'IDENTITY',
      inputs: ['creditInvestment'],
      lagInputs: ['appetiteLoans'],
      compute: (c) => c.lag('appetiteLoans') + c.dt * c.v('creditInvestment'),
      concepts: ['credit-impulse'],
      explain: {
        what: 'The part of firms’ loans the bank’s extra lending appetite has added, % of GDP: a memo line within the loan book.',
        rule: 'Last month’s + one month of the net new credit it gave (new extra loans − repayments on them), which firms spent on investment.',
      },
    },
    {
      id: 'newLoans',
      target: 'newLoans',
      category: 'BEHAVIOUR',
      inputs: ['investmentPlan', 'price', 'creditInvestment'],
      lagInputs: ['appetiteLoans'],
      params: ['loanFinancedShare', 'loanTerm'],
      terms: [
        { id: 'investmentFinance', label: 'Loans for investment', concept: 'endogenous-money', compute: (c) => c.p('loanFinancedShare') * c.v('investmentPlan') * c.v('price') },
        { id: 'appetite', label: 'Extra lending the bank is keen to make', concept: 'endogenous-money', compute: (c) => c.v('creditInvestment') + c.lag('appetiteLoans') / c.p('loanTerm') },
      ],
      concepts: ['endogenous-money'],
      explain: {
        what: 'New loans the bank makes to firms, % of GDP a year. Each loan creates a new deposit.',
        rule: 'New loans = {loanFinancedShare} × firms’ own investment plans (in money) + the extra lending the bank is keen to make: what firms spend of it, plus what rolls over the extra debt as it falls due.',
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
      id: 'normalProfit',
      target: 'normalProfit',
      category: 'BEHAVIOUR',
      lagInputs: ['firmProfit'],
      adjust: { speed: 'firmProfitSmoothing', form: 'exponential' },
      terms: [{ id: 'profit', label: 'Last month’s profit', compute: (c) => c.lag('firmProfit') }],
      concepts: ['gradual-adjustment'],
      explain: {
        what: 'The profit firms treat as normal when they set dividends.',
        rule: 'Moves toward last month’s cash profit at speed {firmProfitSmoothing} a year, so a jump in profit is judged lasting only once it has lasted.',
      },
    },
    {
      id: 'firmDividends',
      target: 'firmDividends',
      category: 'BEHAVIOUR',
      inputs: ['normalProfit'],
      lagInputs: ['firmProfit', 'gdp'],
      stocks: [['deposits', 'F']],
      params: ['firmPayMarginal', 'firmPayoutSpeed', 'firmCashTarget'],
      terms: [
        { id: 'normal', label: 'Normal profit', concept: 'gradual-adjustment', compute: (c) => c.v('normalProfit') },
        { id: 'profit', label: 'Last month’s profit above or below normal', compute: (c) => c.p('firmPayMarginal') * (c.lag('firmProfit') - c.v('normalProfit')) },
        { id: 'surplusCash', label: 'Cash above target', compute: (c) => c.p('firmPayoutSpeed') * (c.stock('deposits', 'F') - c.p('firmCashTarget') * c.lag('gdp')) },
      ],
      explain: {
        what: 'Profits firms pay out to their owners, the households.',
        rule: 'Firms pay out the profit they treat as normal + {firmPayMarginal} of last month’s profit above or below it (they smooth dividends, as Lintner found), plus {firmPayoutSpeed} × a year of any deposits above {firmCashTarget} of GDP (minus if below). Profit they do not pay out at once stays in their deposits and is paid out as normal profit catches up, so a squeeze on profit reaches households over months, not all in the next one.',
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
      description: 'Extra (or less) lending the bank is willing to give firms each year, which firms invest. The boost is biggest while credit is accelerating and fades as firms repay the extra debt. With the policy rules acting output stays about 1% higher for good, because expectations are anchored; with both policy levers locked the boost reverses after about twelve years.',
      definition:
        'Level shift in the bank’s willingness to lend, % of baseline GDP a year of extra new loans, persistent while set. Firms take up the extra credit as fast as they turn plans into spending and spend the net new credit (the extra lending minus repayments on the extra debt) on investment, so new loans and the spending they pay for move together. As the extra debt builds up toward the loan term’s worth of the extra lending, repayments absorb more and more of it: the credit impulse turns negative after about two years and the extra investment fades, leaving firms with more debt and higher interest costs. With the policy rules acting output does not fall all the way back: at +2 it peaks about 2.1% higher after a year and a half and settles about 1.2% higher, with inflation about 0.5 points above target. The loans that paid for the extra investment stay in the economy as household deposits (about 10% of GDP more at +2), and the interest firms pay on the extra debt, through the bank, and on a key rate about 1.7 points higher reaches households as income, so they keep spending more. That lasting gain rests on expectations anchored to the target (decision 0008): the Taylor rule then tolerates a steady inflation gap, so it leaves some output above capacity; with expectations free to drift, output would fall back to capacity while inflation kept rising (lever-vetting open item 10). With both policy levers locked, with the key rate held and no rule to anchor prices, the boost is larger and then reverses after about twelve years: at +2 output is about 4.4% higher after three years but about 1.2% lower after twenty, with the price level about 11% higher; −2 mirrors it (about 1.7% higher after twenty years). Setting it back to 0 ends the extra lending; firms then repay the extra loans over the loan term, and investment falls below normal until they have (payback).',
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
        e.setLever('keyRate', 0); // moving the lever locks it
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
