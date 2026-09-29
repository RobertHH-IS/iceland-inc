/**
 * Iceland Inc.: mortgages (v1 equations E13 and E15–E20, and the credit impulse of E46).
 *
 * Young and working-age households want mortgage debt in proportion to their income, less when
 * real mortgage rates are high and more when real house prices are high. New lending replaces
 * what is repaid and closes part of the gap to that wish, plus any extra banks push. It is
 * capped by the Central Bank's debt-service rule (payments at stressed rates may take at most
 * 35% of income after tax, 40% for first-time buyers) and, when switched on, by a loan-to-value cap on the
 * homes bought this year (80%, 90% for first-time buyers, under Rules 1131/2025).
 * 65% of loans are CPI-indexed: their borrowers pay a low real rate in cash, and inflation is
 * added to the loan instead (an accrual, so no money moves). Banks and pension funds lend in
 * their historical proportions: a bank loan creates a deposit, a pension-fund loan moves one.
 */
import type { Ctx, Id, ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { AGE_LABEL, annuity, BORROWERS, FIRMS, HH, pickParams, stepsIn, terms, lastMonth } from '../util.ts';

type B = (typeof BORROWERS)[number];
const LENDERS = [
  ['B', 'banks'],
  ['PF', 'pension funds'],
] as const;
type L = (typeof LENDERS)[number][0];

/** Debt of a borrower in one kind of mortgage, and a lender's share of that kind. */
const debt = (c: Ctx, ins: 'mortgagesN' | 'mortgagesI', g: B) => c.stock(ins, HH[g]);
const lenderShare = (c: Ctx, ins: 'mortgagesN' | 'mortgagesI', l: L) => c.stock(ins, l) / (c.stock(ins, 'B') + c.stock(ins, 'PF'));
const allMortgageStocks: [Id, Id][] = (['mortgagesN', 'mortgagesI'] as const).flatMap((ins) => [[ins, 'HY'], [ins, 'HW'], [ins, 'B'], [ins, 'PF']] as [Id, Id][]);

function groupRules(g: B): RuleDef[] {
  const pl = HH[g];
  const who = AGE_LABEL[g];
  const dsti = g === 'Y' ? 'dstiY' : 'dstiW';
  return [
    {
      id: `mortgageTarget${g}`,
      target: `mortgageTarget${g}`,
      category: 'BEHAVIOUR',
      label: 'Desired mortgage debt',
      inputs: ['realMortgageRate', 'realHousePrice'],
      lagInputs: [`grossIncome${g}`],
      params: [`mR${g}`, 'betaM', 'rmR0', 'betaMH'],
      terms: terms(
        ['income', 'Debt in proportion to income', 'debt-service-constraint', (c) => c.p(`mR${g}`) * lastMonth(c, `grossIncome${g}`)],
        ['rate', 'Real mortgage rate', 'interest-distribution', (c) => 1 - c.p('betaM') * (c.v('realMortgageRate') - c.p('rmR0'))],
        ['housePrice', 'Real house prices', 'credit-and-house-prices', (c) => Math.pow(Math.max(1e-6, c.v('realHousePrice')), c.p('betaMH'))],
      ),
      combine: (t) => t.income * t.rate * t.housePrice,
      explain: {
        what: `The mortgage debt the ${who} would like to have.`,
        rule: `Desired debt = {mR${g}} × last month’s gross income × (1 − {betaM} × (real mortgage rate − baseline)) × (real house price)^{betaMH}.`,
      },
    },
    {
      id: `mortgageRepayment${g}`,
      target: `mortgageRepayment${g}`,
      category: 'CONTRACT',
      params: ['Tm'],
      stocks: [
        ['mortgagesN', pl],
        ['mortgagesI', pl],
      ],
      compute: (c) => (debt(c, 'mortgagesN', g) + debt(c, 'mortgagesI', g)) / c.p('Tm'),
      concepts: ['amortisation', 'money-destruction'],
      explain: { what: `Principal the ${who} repay (a yearly rate).`, rule: 'Repayment = mortgage debt ÷ {Tm} years: the average loan has {Tm} years left to run.' },
    },
    {
      id: `mortgageDemand${g}`,
      target: `mortgageDemand${g}`,
      category: 'BEHAVIOUR',
      inputs: [`mortgageRepayment${g}`, `mortgageTarget${g}`],
      params: ['lamM', 'lendingAppetite', `lendSh${g}`],
      stocks: [
        ['mortgagesN', pl],
        ['mortgagesI', pl],
      ],
      terms: terms(
        ['replace', 'Replacing what is repaid', 'amortisation', (c) => c.v(`mortgageRepayment${g}`)],
        ['towardTarget', 'Moving toward desired debt', 'credit-impulse', (c) => c.p('lamM') * (c.v(`mortgageTarget${g}`) - debt(c, 'mortgagesN', g) - debt(c, 'mortgagesI', g))],
        ['appetite', 'Banks’ lending appetite (lever)', 'endogenous-money', (c) => c.p('lendingAppetite') * c.p(`lendSh${g}`)],
      ),
      explain: {
        what: `New mortgage lending the ${who} want this year, before the caps.`,
        rule: `Demand = repayments + {lamM} × (desired debt − debt) + their share {lendSh${g}} of any extra lending banks push.`,
      },
    },
    {
      id: `dstiCap${g}`,
      target: `dstiCap${g}`,
      category: 'POLICY',
      label: 'Debt-service cap',
      inputs: ['stressTestPayment'],
      lagInputs: [`grossIncome${g}`, `incomeTax${g}`],
      params: [`nu${g}`, dsti, 'dstiShift'],
      compute: (c) => (c.p(`nu${g}`) * (lastMonth(c, `grossIncome${g}`) - lastMonth(c, `incomeTax${g}`)) * (c.p(dsti) + c.p('dstiShift'))) / c.v('stressTestPayment'),
      concepts: ['debt-service-constraint', 'macroprudential-policy'],
      explain: {
        what: `The most new lending the debt-service rule allows the ${who} this year.`,
        rule: `Cap = the income of new borrowers ({nu${g}} of the group’s income after income tax, last month) × the payment cap {${dsti}%} (plus the lever) ÷ the stressed yearly payment per króna of loan. New borrowers may spend at most that share of their disposable income, as Rules 1300/2025 define it, on payments tested at stressed rates, so a tax rise tightens the cap.`,
      },
    },
    {
      id: `ltvCap${g}`,
      target: `ltvCap${g}`,
      category: 'POLICY',
      label: 'Loan-to-value cap',
      inputs: [`mortgageRepayment${g}`, `mortgageDemand${g}`, `homePurchases${g}`],
      params: ['ltvLimit', ...(g === 'Y' ? ['ltvYExtra'] : [])],
      compute: (c) => {
        if (!(c.p('ltvLimit') > 0)) return c.v(`mortgageDemand${g}`); // off: never binds
        const limit = c.p('ltvLimit') + (g === 'Y' ? c.p('ltvYExtra') : 0);
        return c.v(`mortgageRepayment${g}`) + limit * c.v(`homePurchases${g}`);
      },
      regime: (c) => (c.p('ltvLimit') > 0 ? null : 'Cap switched off'),
      concepts: ['loan-to-value', 'macroprudential-policy'],
      explain: {
        what: `The most new lending a loan-to-value cap allows the ${who} this year.`,
        rule: `When the lever sets a cap: cap = repayments + {ltvLimit%}${g === 'Y' ? ' (plus {ltvYExtra%} for first-time buyers)' : ''} of the value of the homes they buy this year. Loans that replace what is repaid are always allowed; new debt on top of that may pay for at most that share of the homes bought, and loans already made are never tested. How many homes each group buys a year is a placeholder, so the point where the cap starts to bite is approximate. When the cap is off, it equals demand and never binds.`,
      },
    },
    {
      id: `mortgageLending${g}`,
      target: `mortgageLending${g}`,
      category: 'IDENTITY',
      label: 'New mortgages: demand or the tightest cap',
      inputs: [`mortgageDemand${g}`, `dstiCap${g}`, `ltvCap${g}`],
      terms: terms(
        ['demand', 'What households want', 'consumption-function', (c) => c.v(`mortgageDemand${g}`)],
        ['dstiCap', 'Debt-service cap', 'debt-service-constraint', (c) => c.v(`dstiCap${g}`)],
        ['ltvCap', 'Loan-to-value cap', 'loan-to-value', (c) => c.v(`ltvCap${g}`)],
      ),
      combine: (t) => Math.max(0, Math.min(t.demand, t.dstiCap, t.ltvCap)),
      regime: (_c, v, t) => {
        if (v <= 0 && t.demand > 0) return 'No new lending';
        if (v >= t.demand - 1e-12) return null;
        return t.dstiCap <= t.ltvCap ? 'Debt-service cap binds' : 'Loan-to-value cap binds';
      },
      concepts: ['macroprudential-policy', 'endogenous-money'],
      explain: {
        what: `New mortgages to the ${who} this year.`,
        rule: 'Lending = the smallest of what households want, the debt-service cap and the loan-to-value cap, and never below zero.',
      },
    },
    {
      id: `netMortgageLending${g}`,
      target: `netMortgageLending${g}`,
      category: 'IDENTITY',
      inputs: [`mortgageLending${g}`, `mortgageRepayment${g}`],
      terms: terms(['lending', 'New mortgages', 'endogenous-money', (c) => c.v(`mortgageLending${g}`)], ['repayment', 'Repayments', 'money-destruction', (c) => -c.v(`mortgageRepayment${g}`)]),
      explain: { what: `Net new mortgage borrowing by the ${who}.`, rule: 'Net lending = new mortgages − repayments.' },
    },
  ];
}

/* ----------------------------------------------------------- legs */

function legRules(): RuleDef[] {
  const out: RuleDef[] = [];
  for (const g of BORROWERS) {
    const pl = HH[g];
    for (const [l, lender] of LENDERS) {
      for (const [ins, kind, shareN, thetaW] of [
        ['mortgagesN', 'non-indexed', 'pfShN', (c: Ctx) => 1 - c.p('theta')],
        ['mortgagesI', 'indexed', 'pfShI', (c: Ctx) => c.p('theta')],
      ] as const) {
        const suffix = ins === 'mortgagesN' ? 'N' : 'I';
        out.push({
          id: `newMortgages${suffix}_${l}_${pl}`,
          target: `newMortgages${suffix}_${l}_${pl}`,
          category: 'CONTRACT',
          inputs: [`mortgageLending${g}`],
          params: ['theta', shareN],
          compute: (c) => thetaW(c) * c.v(`mortgageLending${g}`) * (l === 'PF' ? c.p(shareN) : 1 - c.p(shareN)),
          concepts: [l === 'B' ? 'endogenous-money' : 'funded-pensions'],
          explain: {
            what: `New ${kind} mortgages ${lender} lend to the ${AGE_LABEL[g]}. ${l === 'B' ? 'A bank loan creates a new deposit.' : 'A pension-fund loan moves the fund’s existing deposits to the borrower.'}`,
            rule: `${kind === 'indexed' ? '{theta%}' : '(1 − {theta%})'} of new lending, × ${l === 'PF' ? `pension funds’ share {${shareN}%}` : `banks’ share (1 − {${shareN}%})`}.`,
          },
        });
        out.push({
          id: `repayments${suffix}_${pl}_${l}`,
          target: `repayments${suffix}_${pl}_${l}`,
          category: 'CONTRACT',
          params: ['Tm'],
          stocks: allMortgageStocks,
          compute: (c) => (debt(c, ins, g) / c.p('Tm')) * lenderShare(c, ins, l),
          concepts: [l === 'B' ? 'money-destruction' : 'amortisation'],
          explain: {
            what: `Principal the ${AGE_LABEL[g]} repay to ${lender} on ${kind} mortgages. ${l === 'B' ? 'Repaying a bank destroys the deposit used.' : 'Repaying a pension fund moves the deposit back to the fund.'}`,
            rule: `Repayment = ${kind} debt ÷ {Tm} years × ${lender}’ share of ${kind} mortgages.`,
          },
        });
      }
      out.push({
        id: `mortgageInterest_${pl}_${l}`,
        target: `mortgageInterest_${pl}_${l}`,
        category: 'CONTRACT',
        inputs: ['mortgageRateN', 'mortgageRateI'],
        stocks: allMortgageStocks,
        terms: terms(
          ['nonIndexed', 'Non-indexed interest', 'interest-distribution', (c) => c.v('mortgageRateN') * debt(c, 'mortgagesN', g) * lenderShare(c, 'mortgagesN', l)],
          ['indexedReal', 'Real interest on indexed loans', 'indexation', (c) => c.v('mortgageRateI') * debt(c, 'mortgagesI', g) * lenderShare(c, 'mortgagesI', l)],
        ),
        explain: {
          what: `Mortgage interest the ${AGE_LABEL[g]} pay ${lender} in cash.`,
          rule: `Interest = non-indexed rate × non-indexed debt + real rate × indexed debt, each × ${lender}’ share of that kind of loan. The inflation part of indexed loans is added to the loan (see indexation), not paid.`,
        },
      });
      out.push({
        id: `indexation_${pl}_${l}`,
        target: `indexation_${pl}_${l}`,
        category: 'CONTRACT',
        inputs: ['cpi'],
        lagInputs: ['cpi'],
        stocks: allMortgageStocks,
        compute: (c) => (debt(c, 'mortgagesI', g) * lenderShare(c, 'mortgagesI', l) * (c.v('cpi') / c.lag('cpi') - 1)) / c.dt,
        concepts: ['indexation', 'accrual-vs-cash'],
        explain: {
          what: `Inflation added to the ${AGE_LABEL[g]}’s indexed mortgages held by ${lender} (a yearly rate). No money moves: the debt and the lender’s claim both grow.`,
          rule: 'Indexation = indexed debt × lender’s share × this month’s CPI change ÷ one month.',
        },
      });
    }
  }
  return out;
}

const legVars: VarDef[] = BORROWERS.flatMap((g) =>
  LENDERS.flatMap(([l, lender]): VarDef[] => [
    ...(['N', 'I'] as const).flatMap((s): VarDef[] => [
      { id: `newMortgages${s}_${l}_${HH[g]}`, label: `New ${s === 'N' ? 'non-indexed' : 'indexed'} mortgages, ${lender} → ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
      { id: `repayments${s}_${HH[g]}_${l}`, label: `${s === 'N' ? 'Non-indexed' : 'Indexed'} mortgage repayments, ${AGE_LABEL[g]} → ${lender}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    ]),
    { id: `mortgageInterest_${HH[g]}_${l}`, label: `Mortgage interest, ${AGE_LABEL[g]} → ${lender}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: `indexation_${HH[g]}_${l}`, label: `Mortgage indexation, ${AGE_LABEL[g]} → ${lender}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ]),
);

const vars: VarDef[] = [
  { id: 'realMortgageRate', label: 'Real mortgage rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('realMortgageRate'), description: 'The average real rate on new mortgages: indexed and non-indexed in their usual mix.' },
  { id: 'stressTestPayment', label: 'Stressed payment per króna of loan', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('stressTestPayment'), description: 'Yearly payment per króna borrowed, at the stress-test rates and terms of the debt-service rule.' },
  ...BORROWERS.flatMap((g): VarDef[] => [
    { id: `mortgageTarget${g}`, label: `Desired mortgage debt, ${AGE_LABEL[g]}`, unit: '% of GDP', kind: 'state', scale: 'nominal', initial: base(`mortgageTarget${g}`) },
    { id: `mortgageRepayment${g}`, label: `Mortgage repayments, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`mortgageRepayment${g}`) },
    { id: `mortgageDemand${g}`, label: `Mortgage demand, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`mortgageDemand${g}`) },
    { id: `dstiCap${g}`, label: `Debt-service cap on new lending, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`dstiCap${g}`) },
    { id: `ltvCap${g}`, label: `Loan-to-value cap on new lending, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: `mortgageLending${g}`, label: `New mortgages, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`mortgageLending${g}`) },
    { id: `netMortgageLending${g}`, label: `Net mortgage lending, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  ]),
  { id: 'netMortgageLending', label: 'Net new mortgage lending', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  { id: 'creditImpulse', label: 'Credit impulse (mortgages)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  { id: 'netCreditTotal', label: 'Net new credit (households and firms)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  { id: 'creditImpulseTotal', label: 'Credit impulse (households and firms)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  ...legVars,
];

const legId = (s: 'N' | 'I', kind: 'new' | 'rep', g: B, l: L) => (kind === 'new' ? `newMortgages${s}_${l}_${HH[g]}` : `repayments${s}_${HH[g]}_${l}`);

export const mortgages: ModuleDef = {
  id: 'mortgages',
  label: 'Mortgages',
  description: 'Desired mortgage debt, the debt-service and loan-to-value caps, amortisation, interest, CPI indexation and the credit impulse.',
  requires: ['structure', 'banks', 'households', 'housing', 'prices', 'firms'],
  params: pickParams(ALL_PARAMS, [
    'theta', 'Tm', 'dstiY', 'dstiW', 'floorN', 'termN', 'floorI', 'termI', 'dstiShift', 'ltvLimit', 'ltvYExtra', 'betaM', 'lamM', 'betaMH',
    'mRY', 'mRW', 'nuY', 'nuW', 'rmR0', 'lendShY', 'lendShW', 'pfShN', 'pfShI', 'mortTot', 'mortShY', 'pfMortI', 'pfMortN', 'capUse0',
  ]),
  vars,
  rules: [
    {
      id: 'realMortgageRate',
      target: 'realMortgageRate',
      category: 'IDENTITY',
      inputs: ['mortgageRateI', 'mortgageRateN'],
      lagInputs: ['expectedInflation'],
      params: ['theta'],
      terms: terms(
        ['indexed', 'Indexed loans (real rate)', 'indexation', (c) => c.p('theta') * c.v('mortgageRateI')],
        ['nonIndexed', 'Non-indexed loans (rate − expected inflation)', 'interest-distribution', (c) => (1 - c.p('theta')) * (c.v('mortgageRateN') - lastMonth(c, 'expectedInflation'))],
      ),
      explain: { what: 'The average real interest rate on mortgages.', rule: 'Real rate = {theta} × the indexed real rate + (1 − {theta}) × (non-indexed rate − expected inflation).' },
    },
    {
      id: 'stressTestPayment',
      target: 'stressTestPayment',
      category: 'POLICY',
      label: 'Debt-service stress test',
      inputs: ['mortgageRateI', 'mortgageRateN'],
      params: ['theta', 'floorI', 'termI', 'floorN', 'termN'],
      terms: terms(
        ['indexed', 'Indexed loans at the stress-test real rate and term', 'debt-service-constraint', (c) => c.p('theta') * annuity(Math.max(c.v('mortgageRateI'), c.p('floorI')), c.p('termI'))],
        ['nonIndexed', 'Non-indexed loans at the stress-test rate and term', 'debt-service-constraint', (c) => (1 - c.p('theta')) * annuity(Math.max(c.v('mortgageRateN'), c.p('floorN')), c.p('termN'))],
      ),
      regime: (c) => {
        const fi = c.v('mortgageRateI') < c.p('floorI'),
          fn = c.v('mortgageRateN') < c.p('floorN');
        return fi && fn ? 'Both stress-test floors apply' : fi ? 'Indexed floor applies' : fn ? 'Non-indexed floor applies' : null;
      },
      concepts: ['debt-service-constraint'],
      explain: {
        what: 'What one króna of new mortgage costs a year in the Central Bank’s affordability test.',
        rule: 'Payment = {theta} × annuity(max(indexed real rate, {floorI%}), {termI} years) + (1 − {theta}) × annuity(max(non-indexed rate, {floorN%}), {termN} years), as in Rules 1300/2025.',
      },
    },
    ...groupRules('Y'),
    ...groupRules('W'),
    {
      id: 'netMortgageLending',
      target: 'netMortgageLending',
      category: 'IDENTITY',
      inputs: ['netMortgageLendingY', 'netMortgageLendingW'],
      terms: terms(['young', 'Young', 'endogenous-money', (c) => c.v('netMortgageLendingY')], ['working', 'Working age', 'endogenous-money', (c) => c.v('netMortgageLendingW')]),
      explain: { what: 'All net new mortgage lending.', rule: 'Young + working age.' },
    },
    {
      id: 'creditImpulse',
      target: 'creditImpulse',
      category: 'IDENTITY',
      inputs: ['netMortgageLending'],
      lagInputs: ['netMortgageLending'],
      terms: terms(['now', 'Net lending now', 'credit-impulse', (c) => c.v('netMortgageLending')], ['yearAgo', 'Net lending a year ago', 'credit-impulse', (c) => -c.lag('netMortgageLending', stepsIn(c, 1))]),
      concepts: ['credit-impulse'],
      explain: {
        what: 'The change in the yearly flow of net new mortgage credit compared with a year earlier. Positive means credit is accelerating.',
        rule: 'Credit impulse = net mortgage lending now − net mortgage lending 12 months ago.',
      },
    },
    {
      id: 'netCreditTotal',
      target: 'netCreditTotal',
      category: 'IDENTITY',
      inputs: ['netMortgageLending', ...FIRMS.map((j) => `borrowing${j}`)],
      terms: terms(
        ['mortgages', 'Net mortgage lending', 'endogenous-money', (c) => c.v('netMortgageLending')],
        ['firms', 'Firms’ net borrowing', 'endogenous-money', (c) => FIRMS.reduce((s, j) => s + c.v(`borrowing${j}`), 0)],
      ),
      explain: { what: 'All net new credit to households and firms.', rule: 'Net mortgage lending + firms’ net borrowing.' },
    },
    {
      id: 'creditImpulseTotal',
      target: 'creditImpulseTotal',
      category: 'IDENTITY',
      inputs: ['netCreditTotal'],
      lagInputs: ['netCreditTotal'],
      terms: terms(['now', 'Net credit now', 'credit-impulse', (c) => c.v('netCreditTotal')], ['yearAgo', 'Net credit a year ago', 'credit-impulse', (c) => -c.lag('netCreditTotal', stepsIn(c, 1))]),
      concepts: ['credit-impulse'],
      explain: { what: 'The credit impulse including firms’ borrowing, which is noisier.', rule: 'Net new credit now − net new credit 12 months ago.' },
    },
    ...legRules(),
  ],
  flows: [
    ...(['N', 'I'] as const).flatMap((s) => [
      {
        id: `newMortgages${s}`,
        label: `New mortgages, ${s === 'N' ? 'non-indexed' : 'CPI-indexed'}`,
        kind: 'cash' as const,
        account: 'financial' as const,
        posting: { type: 'issue' as const, instrument: s === 'N' ? 'mortgagesN' : 'mortgagesI' },
        legs: BORROWERS.flatMap((g) => LENDERS.map(([l]) => ({ from: l, to: HH[g], amount: legId(s, 'new', g, l) }))),
        concepts: ['endogenous-money'],
        explain: { what: 'Banks and pension funds lend to home buyers. A bank loan creates a new deposit (new money); a pension-fund loan moves the fund’s existing deposits.' },
      },
      {
        id: `mortgageRepayments${s}`,
        label: `Mortgage repayments, ${s === 'N' ? 'non-indexed' : 'CPI-indexed'}`,
        kind: 'cash' as const,
        account: 'financial' as const,
        posting: { type: 'redeem' as const, instrument: s === 'N' ? 'mortgagesN' : 'mortgagesI' },
        legs: BORROWERS.flatMap((g) => LENDERS.map(([l]) => ({ from: HH[g], to: l, amount: legId(s, 'rep', g, l) }))),
        concepts: ['amortisation', 'money-destruction'],
        explain: { what: 'Borrowers pay down principal. Repaying a bank loan destroys the deposit used; repaying a pension fund moves it back to the fund.' },
      },
    ]),
    {
      id: 'mortgageInterest',
      label: 'Mortgage interest (cash)',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: BORROWERS.flatMap((g) => LENDERS.map(([l]) => ({ from: HH[g], to: l, amount: `mortgageInterest_${HH[g]}_${l}` }))),
      concepts: ['interest-distribution', 'borrowers-and-savers'],
      explain: { what: 'Borrowers pay interest to banks and pension funds from their deposits.' },
    },
    {
      id: 'mortgageIndexation',
      label: 'Mortgage indexation (accrued)',
      kind: 'accrual',
      account: 'current',
      posting: { type: 'accrue', instrument: 'mortgagesI' },
      legs: BORROWERS.flatMap((g) => LENDERS.map(([l]) => ({ from: HH[g], to: l, amount: `indexation_${HH[g]}_${l}` }))),
      concepts: ['indexation', 'accrual-vs-cash'],
      explain: { what: 'On CPI-indexed loans, inflation is added to the loan balance instead of being paid: the borrower owes more and the lender earns it, but no money moves.' },
    },
  ],
  levers: [
    {
      id: 'dstiCap',
      label: 'Debt-service cap',
      group: 'Policy',
      section: 'Financial stability',
      kind: 'setting',
      unit: 'pp',
      default: 0,
      min: -15,
      max: 15,
      step: 1,
      binds: { param: 'dstiShift', mode: 'add', scale: 0.01 },
      description: 'Shifts the payment-to-income caps on new mortgages (40% for first-time buyers, 35% for others).',
      definition: 'Level shift in both debt-service caps, in percentage points of income, applied to new lending at once and persistent while set. Existing loans are unaffected. Setting it back to 0 restores the Rules 1300/2025 caps.',
      concepts: ['debt-service-constraint', 'macroprudential-policy'],
    },
    {
      id: 'ltvCap',
      label: 'Loan-to-value cap',
      group: 'Policy',
      section: 'Financial stability',
      kind: 'setting',
      unit: '%',
      default: 0,
      min: 0,
      max: 100,
      step: 5,
      binds: { param: 'ltvLimit', mode: 'replace', scale: 0.01 },
      description: `0 = off. Otherwise new mortgages may pay for at most this share of the value of the homes bought this year (first-time buyers ${Math.round(100 * ALL_PARAMS.ltvYExtra.value)} points more).`,
      definition:
        'Level of the loan-to-value cap in percent, applied to new lending at once and persistent while set; 0 switches it off. It is the largest ratio of new mortgage debt to the market value of the homes a group buys this year, over and above loans that replace repayments. The existing stock of loans is never tested, so loans already made are unaffected.',
      concepts: ['loan-to-value', 'macroprudential-policy'],
    },
  ],
  tests: [
    {
      id: 'debt-service-arithmetic',
      label: 'Debt-service test: stressed payment uses the rate floors (5.5% non-indexed, 3% indexed) and the term caps (40 and 25 years)',
      run: (e) => {
        const ps = Object.fromEntries(e.influences('stressTestPayment').params.map((p) => [p.id, p.value]));
        const ann = (r: number, T: number) => r / (1 - Math.pow(1 + r, -T));
        const rN = e.value('mortgageRateN'),
          rI = e.value('mortgageRateI');
        const want = ps.theta * ann(Math.max(rI, 0.03), 25) + (1 - ps.theta) * ann(Math.max(rN, 0.055), 40);
        const got = e.value('stressTestPayment');
        // at baseline the non-indexed rate (4%) is below its 5.5% floor and the indexed (2.5%) below 3%: both floors bind
        const floorsBind = rN < 0.055 && rI < 0.03;
        const cap = e.value('dstiCapY');
        const inc = e.baseline('grossIncomeY') - e.baseline('incomeTaxY'); // income after income tax
        const nu = e.influences('dstiCapY').params.find((p) => p.id === 'nuY')!.value;
        const capWant = (nu * inc * 0.4) / want;
        const ok = Math.abs(got - want) < 1e-12 && floorsBind && ps.termN === 40 && ps.termI === 25 && Math.abs(cap - capWant) < 1e-9;
        return { pass: ok, detail: `stressed payment ${(100 * got).toFixed(4)}% of the loan a year vs ${(100 * want).toFixed(4)}%; young cap ${cap.toFixed(4)} vs ${capWant.toFixed(4)}; regime: ${e.influences('stressTestPayment').regime}` };
      },
    },
    {
      id: 'dsti-cap-binds-when-tightened',
      label: 'With the debt-service cap 12 points tighter and banks pushing 1% of GDP more, the cap binds for both groups and lending falls to it',
      run: (e) => {
        e.setLever('dstiCap', -12);
        e.setLever('lendingAppetite', 1);
        e.step(1);
        const out = (['Y', 'W'] as const).map((g) => ({ g, regime: e.influences(`mortgageLending${g}`).regime, lending: e.value(`mortgageLending${g}`), cap: e.value(`dstiCap${g}`), demand: e.value(`mortgageDemand${g}`) }));
        const ok = out.every((x) => x.regime === 'Debt-service cap binds' && Math.abs(x.lending - x.cap) < 1e-12 && x.demand > x.cap);
        return { pass: ok, detail: out.map((x) => `${x.g}: ${x.regime}, lending ${x.lending.toFixed(4)} = cap ${x.cap.toFixed(4)} < demand ${x.demand.toFixed(4)}`).join('; ') };
      },
    },
    {
      id: 'ltv-cap-binds-on-purchases',
      label: 'An 80% loan-to-value cap on the homes bought this year binds for working-age households when banks push 2% of GDP more; 75% lends less; at baseline it is slack',
      run: (e) => {
        const at = (limit: number, appetite: number) => {
          const f = e.fork();
          f.setLever('ltvCap', limit);
          f.setLever('lendingAppetite', appetite);
          f.step(1);
          return { regime: f.influences('mortgageLendingW').regime, lending: f.value('mortgageLendingW'), cap: f.value('ltvCapW'), demand: f.value('mortgageDemandW'), want: f.value('mortgageRepaymentW') + (limit / 100) * f.value('homePurchasesW') };
        };
        const calm = at(80, 0),
          push = at(80, 2),
          tighter = at(75, 2);
        const ok =
          calm.regime === null &&
          Math.abs(push.cap - push.want) < 1e-12 &&
          push.regime === 'Loan-to-value cap binds' &&
          Math.abs(push.lending - push.cap) < 1e-12 &&
          push.demand > push.cap &&
          tighter.lending < push.lending;
        return { pass: ok, detail: `80%, no push: ${calm.regime ?? 'demand'}; 80% with +2: ${push.regime}, lending ${push.lending.toFixed(3)} = cap ${push.cap.toFixed(3)} < demand ${push.demand.toFixed(3)}; 75%: lending ${tighter.lending.toFixed(3)}` };
      },
    },
    {
      id: 'amortisation',
      label: 'Amortisation: repayments = debt ÷ remaining term, split by who holds the loans',
      run: (e) => {
        const bs = e.balanceSheet('HY');
        const debtY = bs.liabilities.filter((l) => l.instrument.startsWith('mortgages')).reduce((s, l) => s + l.value, 0);
        const Tm = e.influences('mortgageRepaymentY').params.find((p) => p.id === 'Tm')!.value;
        const legs = ['N', 'I'].flatMap((s) => ['B', 'PF'].map((l) => e.value(`repayments${s}_HY_${l}`)));
        const sumLegs = legs.reduce((a, b) => a + b, 0);
        const ok = Math.abs(e.value('mortgageRepaymentY') - debtY / Tm) < 1e-12 && Math.abs(sumLegs - debtY / Tm) < 1e-12;
        return { pass: ok, detail: `debt ${debtY.toFixed(4)} ÷ ${Tm} years = ${(debtY / Tm).toFixed(6)}; repayment ${e.value('mortgageRepaymentY').toFixed(6)}; legs sum ${sumLegs.toFixed(6)}` };
      },
    },
    {
      id: 'indexation-moves-no-deposits',
      label: 'Indexation moves no deposits: after a CPI jump, young households’ deposits change only by their cash flows while their indexed debt grows by the indexation',
      run: (e) => {
        const ke = e as unknown as { stock(i: string, p: string): number };
        e.setLever('vat', 5); // prices rise within the month
        const dep0 = ke.stock('deposits', 'HY'),
          mi0 = ke.stock('mortgagesI', 'HY');
        e.step(1);
        const dt = 1 / 12;
        // every cash leg of the young settles in their deposits; the accrued indexation is not a cash leg
        const cash = e.legs().filter((l) => l.kind === 'cash' && (l.to === 'HY' || l.from === 'HY') && l.from !== l.to);
        const depositFlow = cash.reduce((s, l) => s + (l.to === 'HY' ? l.value : -l.value), 0) * dt;
        const idx = (e.value('indexation_HY_B') + e.value('indexation_HY_PF')) * dt;
        const newI = (e.value('newMortgagesI_B_HY') + e.value('newMortgagesI_PF_HY')) * dt;
        const repI = (e.value('repaymentsI_HY_B') + e.value('repaymentsI_HY_PF')) * dt;
        const dDep = ke.stock('deposits', 'HY') - dep0;
        const dMI = ke.stock('mortgagesI', 'HY') - mi0;
        const ok = idx > 0 && Math.abs(dDep - depositFlow) < 1e-12 && Math.abs(dMI - (newI - repI + idx)) < 1e-12;
        return { pass: ok, detail: `indexation ${idx.toFixed(5)}; deposits changed ${dDep.toFixed(6)} = cash flows ${depositFlow.toFixed(6)}; indexed debt +${dMI.toFixed(6)} = new − repaid + indexation ${(newI - repI + idx).toFixed(6)}` };
      },
    },
    {
      id: 'bank-loan-creates-pension-loan-moves',
      label: 'A bank mortgage creates deposits; a pension-fund mortgage only moves them',
      run: (e) => {
        const money = (f: ReturnType<typeof e.fork>) => ['HY', 'HW', 'HO', ...FIRMS, 'PF'].reduce((s, pl) => s + f.balanceSheet(pl).assets.find((a) => a.instrument === 'deposits')!.value, 0);
        const lending = (f: ReturnType<typeof e.fork>) => (f.value('mortgageLendingY') + f.value('mortgageLendingW')) / 12;
        const effect = (pfShare: number) => {
          const params = { pfShN: pfShare, pfShI: pfShare };
          const calm = e.fork({ params });
          calm.step(1);
          const push = e.fork({ params });
          push.setLever('lendingAppetite', 2);
          push.step(1);
          return { money: money(push) - money(calm), extra: lending(push) - lending(calm) };
        };
        const banks = effect(0),
          funds = effect(1);
        // the same extra lending in both; the difference in money isolates who lends (firms' cash needs, which
        // grow with GDP, add a little money in both cases)
        const ok = Math.abs(banks.extra - funds.extra) < 1e-12 && Math.abs(banks.money - funds.money - banks.extra) < 1e-9 && Math.abs(funds.money) < 0.1 * funds.extra;
        return {
          pass: ok,
          detail: `extra mortgage lending in the first month ${banks.extra.toFixed(4)} (% of GDP): broad money ${banks.money >= 0 ? '+' : ''}${banks.money.toFixed(4)} when banks lend, ${funds.money >= 0 ? '+' : ''}${funds.money.toFixed(4)} when pension funds lend`,
        };
      },
    },
  ],
};
