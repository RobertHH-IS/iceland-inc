/**
 * Iceland Inc.: mortgages (v1 equations E13 and E15–E20, and the credit impulse of E46).
 *
 * Young and working-age households want mortgage debt in proportion to their lasting income, less when
 * real mortgage rates are high and more when real house prices are high. New lending replaces
 * what is repaid, including the loans sellers pay off when they sell to others in their age group,
 * and closes part of the gap to that wish, plus any extra banks push. Two borrower-based rules
 * trim it: the Central Bank's debt-service rule (payments at stressed rates may take at most 35% of
 * income after tax, 40% for first-time buyers) and the loan-to-value rule on the homes bought (80%,
 * 90% for first-time buyers, under Rules 1131/2025). Borrowers differ, so each cap trims the loans of
 * those who want most, smoothly (borrowers.ts).
 * 65% of loans are CPI-indexed: their borrowers pay a low real rate in cash, and inflation is
 * added to the loan instead (an accrual, so no money moves). Banks and pension funds lend in
 * their historical proportions, the funds less when they move savings abroad: a bank loan creates a
 * deposit, a pension-fund loan moves one.
 */
import type { Ctx, Id, ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { AGE_LABEL, annuity, BORROWERS, FIRMS, HH, pickParams, stepsIn, terms, lastMonth, lockPolicy } from '../util.ts';
import { monthTotal, stepByStep, stepsAMonth } from '../testing.ts';
import { cappedShare } from './borrowers.ts';

type B = (typeof BORROWERS)[number];
const LENDERS = [
  ['B', 'banks'],
  ['PF', 'pension funds'],
] as const;
type L = (typeof LENDERS)[number][0];

/** Debt of a borrower in one kind of mortgage, and a lender's share of that kind. */
const debt = (c: Ctx, ins: 'mortgagesN' | 'mortgagesI', g: B) => c.stock(ins, HH[g]);
const lenderShare = (c: Ctx, ins: 'mortgagesN' | 'mortgagesI', l: L) => c.stock(ins, l) / (c.stock(ins, 'B') + c.stock(ins, 'PF'));
/** How much more of the wanted lending a cap must trim than at baseline before the regime names it:
 *  5% of demand, so a small tightening that trims a few more borrowers is not labelled as binding. */
const CAP_BITES = 0.05;
/** Share of the wanted lending each borrower-based cap lets through, relative to baseline, and the
 *  share it trims now (borrowers.ts). */
function capsAllow(c: Ctx, t: Record<Id, number>, g: B) {
  const [sd, sl] = [cappedShare(t.dstiCap / t.demand, c.p('sigmaDsti')), cappedShare(t.ltvCap / t.demand, c.p('sigmaLtv'))];
  return { dsti: sd / c.p('dstiShare0'), ltv: sl / c.p(`ltvShare0${g}`), dstiTrim: 1 - sd, ltvTrim: 1 - sl };
}
const allMortgageStocks: [Id, Id][] = (['mortgagesN', 'mortgagesI'] as const).flatMap((ins) => [[ins, 'HY'], [ins, 'HW'], [ins, 'B'], [ins, 'PF']] as [Id, Id][]);

/** Last month's tax-free child and housing benefits: income for the mortgage rules, though not taxed. */
const taxFreeBenefits = (c: Ctx, g: B) => (1 - c.p('famTaxableShare')) * lastMonth(c, `familyBenefits${g}`);

function groupRules(g: B): RuleDef[] {
  const pl = HH[g];
  const who = AGE_LABEL[g];
  const dsti = g === 'Y' ? 'dstiY' : 'dstiW';
  return [
    {
      id: `permIncome${g}`,
      target: `permIncome${g}`,
      category: 'BEHAVIOUR',
      label: 'Income households borrow against',
      lagInputs: [`grossIncome${g}`, `familyBenefits${g}`, 'cpi'],
      params: ['famTaxableShare'],
      adjust: { speed: 'lamYP', form: 'exponential' },
      terms: terms(['income', 'Last month’s gross income, with the tax-free child and housing benefits, at baseline prices', 'consumption-function', (c) => (lastMonth(c, `grossIncome${g}`) + taxFreeBenefits(c, g)) / lastMonth(c, 'cpi')]),
      concepts: ['gradual-adjustment'],
      explain: {
        what: `The income the ${who} expect to keep, at baseline prices: what they judge their borrowing by.`,
        rule: 'Moves toward last month’s gross income (with the tax-free child and housing benefits, {famTaxableShare%} of family benefits being taxable) ÷ the CPI at speed {lamYP} a year, a mean lag of about a year. A pay rise, a lost job or a bonus changes it only as it lasts, so a jump in pay does not become a jump in borrowing the next month.',
      },
    },
    {
      id: `mortgageTarget${g}`,
      target: `mortgageTarget${g}`,
      category: 'BEHAVIOUR',
      label: 'Desired mortgage debt',
      inputs: ['realMortgageRate', 'realHousePrice', `permIncome${g}`],
      lagInputs: ['cpi'],
      params: [`mR${g}`, 'betaM', 'rmR0', 'betaMH'],
      terms: terms(
        ['income', 'Debt in proportion to lasting income', 'credit-and-house-prices', (c) => c.p(`mR${g}`) * c.v(`permIncome${g}`) * lastMonth(c, 'cpi')],
        ['rate', 'Real mortgage rate', 'interest-distribution', (c) => 1 - c.p('betaM') * (c.v('realMortgageRate') - c.p('rmR0'))],
        ['housePrice', 'Real house prices', 'credit-and-house-prices', (c) => Math.pow(Math.max(1e-6, c.v('realHousePrice')), c.p('betaMH'))],
      ),
      combine: (t) => t.income * t.rate * t.housePrice,
      // Real house prices are floored at a millionth (a guard on the power); it never binds.
      regime: (c) => (c.v('realHousePrice') < 1e-6 ? 'House prices at their floor' : null),
      explain: {
        what: `The mortgage debt the ${who} would like to have.`,
        rule: `Desired debt = {mR${g}} × lasting income × last month’s CPI × (1 − {betaM} × (real mortgage rate − baseline)) × (real house price)^{betaMH}. Lasting income follows gross income with a lag of about a year, so households borrow more after a pay rise only as it proves to last.`,
      },
    },
    {
      id: `mortgageRepayment${g}`,
      target: `mortgageRepayment${g}`,
      category: 'CONTRACT',
      params: ['Tm', 'turnRate', `sellerDebt${g}`],
      stocks: [
        ['mortgagesN', pl],
        ['mortgagesI', pl],
      ],
      terms: terms(
        ['amortisation', 'Scheduled repayment', 'amortisation', (c) => (debt(c, 'mortgagesN', g) + debt(c, 'mortgagesI', g)) / c.p('Tm')],
        ['sales', 'Loans paid off when homes are sold', 'money-destruction', (c) => c.p('turnRate') * c.p(`sellerDebt${g}`) * (debt(c, 'mortgagesN', g) + debt(c, 'mortgagesI', g))],
      ),
      concepts: ['amortisation', 'money-destruction'],
      explain: {
        what: `Principal the ${who} repay (a yearly rate): scheduled repayments, and the loans sellers pay off when they sell their homes.`,
        rule: `Repayment = mortgage debt ÷ {Tm} years (the average loan has {Tm} years left to run) + {turnRate%} × {sellerDebt${g}} × the debt: {turnRate%} of the group’s homes are sold each year to others in the group, and a seller pays off the loan on the home, which is {sellerDebt${g}} times the group’s average (people who sell have usually bought more recently than those who stay). The buyer’s new loan is new lending.`,
      },
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
        ['replace', 'Replacing what is repaid (new buyers of the homes sold)', 'amortisation', (c) => c.v(`mortgageRepayment${g}`)],
        ['towardTarget', 'Moving toward desired debt', 'endogenous-money', (c) => c.p('lamM') * (c.v(`mortgageTarget${g}`) - debt(c, 'mortgagesN', g) - debt(c, 'mortgagesI', g))],
        ['appetite', 'Banks’ lending appetite (lever)', 'endogenous-money', (c) => c.p('lendingAppetite') * c.p(`lendSh${g}`)],
      ),
      explain: {
        what: `New mortgage lending the ${who} want this year, with the borrower-based caps as they are at baseline.`,
        rule: `Demand = repayments + {lamM} × (desired debt − debt) + their share {lendSh${g}} of any extra lending banks push. Most of it is the loans of people buying the homes others sell: the repayments include the loans sellers pay off, so it is several times net lending.`,
      },
    },
    {
      id: `dstiCap${g}`,
      target: `dstiCap${g}`,
      category: 'POLICY',
      label: 'Debt-service cap',
      inputs: ['stressTestPayment'],
      lagInputs: [`grossIncome${g}`, `incomeTax${g}`, `familyBenefits${g}`],
      params: [`nu${g}`, dsti, 'dstiShift', 'famTaxableShare'],
      compute: (c) => (c.p(`nu${g}`) * (lastMonth(c, `grossIncome${g}`) - lastMonth(c, `incomeTax${g}`) + taxFreeBenefits(c, g)) * (c.p(dsti) + c.p('dstiShift'))) / c.v('stressTestPayment'),
      concepts: ['debt-service-constraint', 'macroprudential-policy'],
      explain: {
        what: `The new lending the debt-service rule would allow the ${who} this year if every new borrower borrowed right up to it.`,
        rule: `Cap = the income of new borrowers ({nu${g}} of the group’s income after income tax, with the tax-free child and housing benefits, last month) × the payment cap {${dsti}%} (plus the lever) ÷ the stressed yearly payment per króna of loan. New borrowers may spend at most that share of their disposable income, as Rules 1300/2025 define it, on payments tested at stressed rates, so a tax rise tightens the cap.`,
      },
    },
    {
      id: `ltvCap${g}`,
      target: `ltvCap${g}`,
      category: 'POLICY',
      label: 'Loan-to-value cap',
      inputs: [`grossHomePurchases${g}`],
      params: ['ltvLimit', ...(g === 'Y' ? ['ltvYExtra'] : [])],
      compute: (c) => (c.p('ltvLimit') + (g === 'Y' ? c.p('ltvYExtra') : 0)) * c.v(`grossHomePurchases${g}`),
      concepts: ['loan-to-value', 'macroprudential-policy'],
      explain: {
        what: `The new lending the loan-to-value rule would allow the ${who} this year if every buyer borrowed right up to it.`,
        rule: `Cap = {ltvLimit%}${g === 'Y' ? ' + {ltvYExtra%} for first-time buyers' : ''} × the value of all the homes they buy this year, from older households and from each other (Rules 1131/2025). Every new loan is tested when it is made; loans already made are never tested.`,
      },
    },
    {
      id: `mortgageLending${g}`,
      target: `mortgageLending${g}`,
      category: 'IDENTITY',
      label: 'New mortgages: demand, trimmed by the caps',
      inputs: [`mortgageDemand${g}`, `dstiCap${g}`, `ltvCap${g}`],
      params: ['sigmaDsti', 'sigmaLtv', 'dstiShare0', `ltvShare0${g}`],
      terms: terms(
        ['demand', 'What households want', 'endogenous-money', (c) => c.v(`mortgageDemand${g}`)],
        ['dstiCap', 'Debt-service cap', 'debt-service-constraint', (c) => c.v(`dstiCap${g}`)],
        ['ltvCap', 'Loan-to-value cap', 'loan-to-value', (c) => c.v(`ltvCap${g}`)],
      ),
      combine: (t, c) => {
        if (!(t.demand > 0)) return 0;
        const a = capsAllow(c, t, g);
        return t.demand * a.dsti * a.ltv;
      },
      regime: (c, v, t) => {
        if (v <= 0) return t.demand <= 0 ? 'No new lending: households want to pay debt down faster than they repay it' : 'No new lending';
        const a = capsAllow(c, t, g);
        const [d, l] = [a.dstiTrim - (1 - c.p('dstiShare0')), a.ltvTrim - (1 - c.p(`ltvShare0${g}`))];
        if (Math.max(d, l) <= CAP_BITES) return null;
        return d >= l ? 'Debt-service cap binds for many borrowers' : 'Loan-to-value cap binds for many borrowers';
      },
      concepts: ['macroprudential-policy', 'endogenous-money'],
      explain: {
        what: `New mortgages to the ${who} this year.`,
        rule: `Borrowers differ: some want to borrow a larger share of their income, or of the price of their home, than others. Each cap trims only the loans of those who want more than it allows, down to the cap. So lending = what households want × the share of it the debt-service cap allows × the share the loan-to-value cap allows, each relative to that share at baseline, when the caps already trim the borrowers who want most (about {dstiShare0%} and {ltvShare0${g}%} of wanted lending is let through). As demand grows toward a cap, or the cap is tightened, more borrowers reach it and lending falls short of demand; a looser cap lets those borrowers borrow a little more. The spread of borrowers is {sigmaDsti} (debt service) and {sigmaLtv} (loan-to-value). When households want to pay their debt down faster than it is repaid, lending stops at zero: they cannot pay back early, and only the repayments shrink the debt.`,
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
      for (const [ins, kind, thetaW] of [
        ['mortgagesN', 'non-indexed', (c: Ctx) => 1 - c.p('theta')],
        ['mortgagesI', 'indexed', (c: Ctx) => c.p('theta')],
      ] as const) {
        const suffix = ins === 'mortgagesN' ? 'N' : 'I';
        out.push({
          id: `newMortgages${suffix}_${l}_${pl}`,
          target: `newMortgages${suffix}_${l}_${pl}`,
          category: 'CONTRACT',
          inputs: [`mortgageLending${g}`, `pfMortgageShare${suffix}`],
          params: ['theta'],
          compute: (c) => thetaW(c) * c.v(`mortgageLending${g}`) * (l === 'PF' ? c.v(`pfMortgageShare${suffix}`) : 1 - c.v(`pfMortgageShare${suffix}`)),
          concepts: [l === 'B' ? 'endogenous-money' : 'funded-pensions'],
          explain: {
            what: `New ${kind} mortgages ${lender} lend to the ${AGE_LABEL[g]}. ${l === 'B' ? 'A bank loan creates a new deposit.' : 'A pension-fund loan moves the fund’s existing deposits to the borrower.'}`,
            rule: `${kind === 'indexed' ? '{theta%}' : '(1 − {theta%})'} of new lending, × ${l === 'PF' ? 'pension funds’ share of new ' + kind + ' mortgages' : 'banks’ share (1 − pension funds’ share of new ' + kind + ' mortgages)'}.`,
          },
        });
        out.push({
          id: `repayments${suffix}_${pl}_${l}`,
          target: `repayments${suffix}_${pl}_${l}`,
          category: 'CONTRACT',
          params: ['Tm', 'turnRate', `sellerDebt${g}`],
          stocks: allMortgageStocks,
          compute: (c) => debt(c, ins, g) * (1 / c.p('Tm') + c.p('turnRate') * c.p(`sellerDebt${g}`)) * lenderShare(c, ins, l),
          concepts: [l === 'B' ? 'money-destruction' : 'amortisation'],
          explain: {
            what: `Principal the ${AGE_LABEL[g]} repay to ${lender} on ${kind} mortgages. ${l === 'B' ? 'Repaying a bank destroys the deposit used.' : 'Repaying a pension fund moves the deposit back to the fund.'}`,
            rule: `Repayment = ${kind} debt × (1 ÷ {Tm} years + {turnRate%} × {sellerDebt${g}} paid off as homes are sold) × ${lender}’ share of ${kind} mortgages.`,
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
    { id: `permIncome${g}`, label: `Lasting income, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base(`permIncome${g}`), description: 'Gross income with the tax-free child and housing benefits, at baseline prices, smoothed over about a year: what households judge their borrowing by.' },
    { id: `mortgageTarget${g}`, label: `Desired mortgage debt, ${AGE_LABEL[g]}`, unit: '% of GDP', kind: 'state', scale: 'nominal', initial: base(`mortgageTarget${g}`) },
    { id: `mortgageRepayment${g}`, label: `Mortgage repayments, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`mortgageRepayment${g}`) },
    { id: `mortgageDemand${g}`, label: `Mortgage demand, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`mortgageDemand${g}`) },
    { id: `dstiCap${g}`, label: `Debt-service cap on new lending, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`dstiCap${g}`) },
    { id: `ltvCap${g}`, label: `Loan-to-value cap on new lending, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`ltvCap${g}`) },
    { id: `mortgageLending${g}`, label: `New mortgages, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`mortgageLending${g}`) },
    { id: `netMortgageLending${g}`, label: `Net mortgage lending, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  ]),
  { id: 'netMortgageLending', label: 'Net new mortgage lending', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  { id: 'creditImpulse', label: 'Credit impulse (mortgages)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  { id: 'netCreditTotal', label: 'Net new credit (households and firms)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  { id: 'creditImpulseTotal', label: 'Credit impulse (households and firms)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  ...(['N', 'I'] as const).map((s): VarDef => ({ id: `pfMortgageShare${s}`, label: `Pension funds’ share of new ${s === 'N' ? 'non-indexed' : 'indexed'} mortgages`, unit: 'fraction', kind: 'ratio', scale: 'none', initial: ALL_PARAMS[`pfSh${s}`].value })),
  ...legVars,
];

const legId = (s: 'N' | 'I', kind: 'new' | 'rep', g: B, l: L) => (kind === 'new' ? `newMortgages${s}_${l}_${HH[g]}` : `repayments${s}_${HH[g]}_${l}`);

export const mortgages: ModuleDef = {
  id: 'mortgages',
  label: 'Mortgages',
  description: 'Desired mortgage debt, the debt-service and loan-to-value caps, amortisation, interest, CPI indexation and the credit impulse.',
  requires: ['structure', 'banks', 'households', 'housing', 'prices', 'firms'],
  params: pickParams(ALL_PARAMS, [
    'theta', 'Tm', 'dstiY', 'dstiW', 'floorN', 'termN', 'floorI', 'termI', 'dstiShift', 'ltvLimit', 'ltvYExtra', 'betaM', 'lamM', 'betaMH', 'lamYP',
    'mRY', 'mRW', 'nuY', 'nuW', 'rmR0', 'lendShY', 'lendShW', 'pfShN', 'pfShI', 'mortTot', 'mortShY', 'pfMortI', 'pfMortN', 'capUse0',
    'sigmaDsti', 'sigmaLtv', 'dstiShare0', 'ltvShare0Y', 'ltvShare0W', 'ltvAvg0', 'sellerDebtY', 'sellerDebtW',
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
    ...(['N', 'I'] as const).map(
      (s): RuleDef => ({
        id: `pfMortgageShare${s}`,
        target: `pfMortgageShare${s}`,
        category: 'BEHAVIOUR',
        inputs: ['pfDomesticShift'],
        params: [`pfSh${s}`],
        terms: terms(
          ['usual', 'Their usual share', 'funded-pensions', (c) => c.p(`pfSh${s}`)],
          ['tilt', 'Pension funds tilting abroad (or home)', 'funded-pensions', (c) => c.p(`pfSh${s}`) * c.v('pfDomesticShift')],
        ),
        combine: (t) => Math.min(1, Math.max(0, t.usual + t.tilt)),
        regime: (_c, _v, t) => (t.usual + t.tilt >= 1 ? 'Pension funds lend all of them' : t.usual + t.tilt <= 0 ? 'Pension funds lend none of them' : null),
        explain: {
          what: `Pension funds’ share of new ${s === 'N' ? 'non-indexed' : 'CPI-indexed'} mortgages; banks lend the rest.`,
          rule: `Share = their usual share {pfSh${s}%} × (1 + their domestic tilt), between 0 and 1. When the funds move savings abroad they lend less to members, in proportion to the rest of their domestic assets, and banks take over the loans, which creates deposits; when they come home they lend more.`,
        },
      }),
    ),
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
      definition: 'Level shift in both debt-service caps, in percentage points of income, applied to new lending at once and persistent while set. Borrowers whose payments would take more than the cap borrow up to it, so a tightening trims the loans of those who borrow most and a loosening lets them borrow a little more. Existing loans are unaffected. The fall in borrowing and spending lasts: with the policy rules acting, where the central bank eases to offset it, a cut of 15 points still leaves output about 0.2% lower and unemployment 0.07 point higher after 20 years, because the rule learns its neutral rate only slowly; with both policy levers locked about 0.1% lower. Setting it back to 0 restores the Rules 1300/2025 caps.',
      concepts: ['debt-service-constraint', 'macroprudential-policy'],
    },
    {
      id: 'ltvCap',
      label: 'Loan-to-value cap',
      group: 'Policy',
      section: 'Financial stability',
      shown: false, // a less central lever: off the lever panel unless a scenario sets it (decision 0017)
      kind: 'setting',
      unit: '%',
      default: 80,
      min: 50,
      max: 100,
      step: 5,
      binds: { param: 'ltvLimit', mode: 'replace', scale: 0.01 },
      description: `Today 80% (first-time buyers ${Math.round(100 * ALL_PARAMS.ltvYExtra.value)} points more). New mortgages may pay for at most this share of the price of the home bought; lower tightens.`,
      definition:
        'Level of the loan-to-value cap in percent, persistent while set, applied at once to every new loan as it is made (the loans of people buying from older households and from each other); first-time buyers (the young) get 10 points more. Buyers who want to borrow more than the cap allows borrow up to it; the rest are unaffected, so a small change trims the buyers who borrow most and a large cut trims many. Loans already made are never tested. The fall in borrowing and spending lasts: at a 50% cap output is about 0.5% lower after five years and 0.4% lower after twenty with the policy rules acting, where the central bank eases to offset it but learns its neutral rate only slowly, and 0.2% lower with both policy levers locked. 80 is the rule in force (Rules 1131/2025); setting it back to 80 restores it.',
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
        const share = e.influences('dstiCapY').params.find((p) => p.id === 'famTaxableShare')!.value;
        const inc = e.baseline('grossIncomeY') - e.baseline('incomeTaxY') + (1 - share) * e.baseline('familyBenefitsY'); // income after income tax
        const nu = e.influences('dstiCapY').params.find((p) => p.id === 'nuY')!.value;
        const capWant = (nu * inc * 0.4) / want;
        const ok = Math.abs(got - want) < 1e-12 && floorsBind && ps.termN === 40 && ps.termI === 25 && Math.abs(cap - capWant) < 1e-9;
        return { pass: ok, detail: `stressed payment ${(100 * got).toFixed(4)}% of the loan a year vs ${(100 * want).toFixed(4)}%; young cap ${cap.toFixed(4)} vs ${capWant.toFixed(4)}; regime: ${e.influences('stressTestPayment').regime}` };
      },
    },
    {
      id: 'dsti-cap-trims-the-tail',
      label: 'The debt-service cap trims the borrowers who want most: 4 points tighter cuts new lending by 0.5–3% in the first month, 15 points by 10–20%, and 4 points looser raises it a little, for both groups',
      run: (e) => {
        const lend = (shift: number) => {
          const f = e.fork();
          f.setLever('dstiCap', shift);
          f.step(1);
          return (['Y', 'W'] as const).map((g) => ({ cut: f.value(`mortgageLending${g}`) / f.baseline(`mortgageLending${g}`) - 1, regime: f.influences(`mortgageLending${g}`).regime ?? null }));
        };
        const [m15, m12, m4, p4] = [lend(-15), lend(-12), lend(-4), lend(4)];
        const ok = [0, 1].every(
          (k) =>
            m15[k].cut < m12[k].cut && m12[k].cut < m4[k].cut && m4[k].cut < 0 && p4[k].cut > 0 &&
            m4[k].cut < -0.005 && m4[k].cut > -0.03 && m15[k].cut < -0.1 && m15[k].cut > -0.2 &&
            m15[k].regime === 'Debt-service cap binds for many borrowers' && m4[k].regime === null && p4[k].regime === null,
        );
        const pc = (x: { cut: number }) => `${(100 * x.cut).toFixed(1)}%`;
        return { pass: ok, detail: (['Y', 'W'] as const).map((g, k) => `${g}: −15 ${pc(m15[k])}, −12 ${pc(m12[k])}, −4 ${pc(m4[k])}, +4 ${pc(p4[k])}`).join('; ') + `; at −15: ${m15[1].regime}` };
      },
    },
    {
      id: 'ltv-cap-trims-buyers',
      label: 'The loan-to-value cap binds on its own: at 80% (the rule in force) lending is demand; 100% lends at most a few percent more; 50% cuts working-age lending by 10–30% and a 25% cap by more than half, in the first step. The first-time buyers’ 90% cap already trims some of the young’s loans, 70% (80% for them) trims more, and 50% more still',
      run: (e) => {
        // the first kernel step (decision 0011: half a month), before the cut lending feeds back
        // into incomes and demand in the month's later steps
        const lend = (limit: number) => {
          const { engine: f, steps } = stepByStep(e, (r) => (['Y', 'W'] as const).map((g) => ({ lending: r.value(`mortgageLending${g}`), demand: r.value(`mortgageDemand${g}`) })), { ltvLimit: limit / 100 });
          f.step(1);
          return (['Y', 'W'] as const).map((g, k) => ({
            cut: steps[0][k].lending / f.baseline(`mortgageLending${g}`) - 1,
            demand: steps[0][k].demand / f.baseline(`mortgageDemand${g}`) - 1,
            regime: f.influences(`mortgageLending${g}`).regime ?? null, // the month's: binding in any step
          }));
        };
        const [l25, l50, l70, l80, l100] = [lend(25), lend(50), lend(70), lend(80), lend(100)];
        const trimmedY = 1 - e.influences('mortgageLendingY').params.find((p) => p.id === 'ltvShare0Y')!.value;
        const ok =
          [0, 1].every((k) => Math.abs(l80[k].cut) < 1e-12 && l80[k].regime === null && l25[k].cut < l50[k].cut && l50[k].cut < 0 && l100[k].cut > 0 && l100[k].cut < 0.05 && Math.abs(l25[k].demand) < 1e-12) &&
          l50[1].cut < -0.1 && l50[1].cut > -0.3 && l25[1].cut < -0.5 && l25[1].regime === 'Loan-to-value cap binds for many borrowers' &&
          trimmedY > 0.002 && l70[0].cut < -0.005 && l50[0].cut < -0.05 && l50[0].cut < l70[0].cut;
        const pc = (x: { cut: number }) => `${(100 * x.cut).toFixed(1)}%`;
        return { pass: ok, detail: (['Y', 'W'] as const).map((g, k) => `${g}: 25% ${pc(l25[k])}, 50% ${pc(l50[k])}, 70% ${pc(l70[k])}, 80% ${pc(l80[k])}, 100% ${pc(l100[k])}`).join('; ') + `; at 25%: ${l25[1].regime}; the young’s 90% cap trims ${(100 * trimmedY).toFixed(1)}% of their wanted lending at baseline` };
      },
    },
    {
      id: 'lending-floor-named',
      label: 'When households want to pay their debt down faster than it is repaid, lending stops at zero and the regime says why',
      run: (e) => {
        const f = e.fork({ params: { lendingAppetite: -12 } });
        f.step(1);
        const out = (['Y', 'W'] as const).map((g) => ({ g, v: f.value(`mortgageLending${g}`), demand: f.value(`mortgageDemand${g}`), regime: f.influences(`mortgageLending${g}`).regime }));
        const ok = out.every((x) => x.v === 0 && x.demand < 0 && x.regime === 'No new lending: households want to pay debt down faster than they repay it');
        return { pass: ok, detail: out.map((x) => `${x.g}: demand ${x.demand.toFixed(3)}, lending ${x.v}, “${x.regime}”`).join('; ') };
      },
    },
    {
      id: 'wage-rise-borrowing-builds-up',
      label: 'After a 10% wage settlement households borrow more only as the higher pay lasts: net lending in month 2 is under 0.3% of GDP a year above no change, and peaks after 9 to 18 months, with the policy levers locked or unlocked',
      run: (e) => {
        const path = (locked: boolean, shock: boolean) => {
          const f = e.fork();
          lockPolicy(f, locked);
          if (shock) f.fire('wageSettlement', 10);
          const out = [0];
          for (let m = 1; m <= 36; m++) {
            f.step(1);
            out.push(f.value('netMortgageLending'));
          }
          return out;
        };
        const res = [true, false].map((locked) => {
          const [a, b] = [path(locked, true), path(locked, false)];
          const d = a.map((x, i) => x - b[i]);
          const peak = d.indexOf(Math.max(...d.slice(1)));
          return { locked, m2: d[2], peak, top: d[peak] };
        });
        const ok = res.every((r) => r.m2 < 0.3 && r.peak >= 9 && r.peak <= 18 && r.top > 2 * r.m2);
        return { pass: ok, detail: res.map((r) => `${r.locked ? 'Locked' : 'Unlocked'}: month 2 +${r.m2.toFixed(3)}, peak +${r.top.toFixed(3)} in month ${r.peak}`).join('; ') };
      },
    },
    {
      id: 'amortisation',
      label: 'Repayments = debt ÷ remaining term + the loans paid off as homes are sold, split by who holds the loans',
      run: (e) => {
        const bs = e.balanceSheet('HY');
        const debtY = bs.liabilities.filter((l) => l.instrument.startsWith('mortgages')).reduce((s, l) => s + l.value, 0);
        const ps = Object.fromEntries(e.influences('mortgageRepaymentY').params.map((p) => [p.id, p.value]));
        const want = debtY * (1 / ps.Tm + ps.turnRate * ps.sellerDebtY);
        const legs = ['N', 'I'].flatMap((s) => ['B', 'PF'].map((l) => e.value(`repayments${s}_HY_${l}`)));
        const sumLegs = legs.reduce((a, b) => a + b, 0);
        const ok = Math.abs(e.value('mortgageRepaymentY') - want) < 1e-12 && Math.abs(sumLegs - want) < 1e-12 && ps.turnRate > 0;
        return { pass: ok, detail: `debt ${debtY.toFixed(4)} × (1 ÷ ${ps.Tm} years + ${ps.turnRate} sold × ${ps.sellerDebtY.toFixed(3)}) = ${want.toFixed(6)}; repayment ${e.value('mortgageRepaymentY').toFixed(6)}; legs sum ${sumLegs.toFixed(6)}` };
      },
    },
    {
      id: 'gross-lending-is-purchase-lending',
      label: 'Gross lending is the loans of home buyers: at baseline the average new loan is ltvAvg0 of the price for both groups, sellers pay off loans larger than their group’s average, and banks’ lending appetite at its minimum cuts gross lending by about half without stopping it',
      run: (e) => {
        const ltv = (['Y', 'W'] as const).map((g) => e.baseline(`mortgageLending${g}`) / e.baseline(`grossHomePurchases${g}`));
        const f = e.fork();
        f.setLever('lendingAppetite', -3);
        let lowest = Infinity;
        for (let m = 0; m < 60; m++) {
          f.step(1);
          lowest = Math.min(lowest, ...(['Y', 'W'] as const).map((g) => f.value(`mortgageLending${g}`) / f.baseline(`mortgageLending${g}`)));
        }
        const ps = Object.fromEntries(e.influences('mortgageRepaymentY').params.map((p) => [p.id, p.value]));
        const psW = Object.fromEntries(e.influences('mortgageRepaymentW').params.map((p) => [p.id, p.value]));
        const avg = ALL_PARAMS.ltvAvg0.value;
        const ok = ltv.every((x) => Math.abs(x - avg) < 1e-9) && avg >= 0.6 && avg <= 0.7 && ps.sellerDebtY > 1 && psW.sellerDebtW > 1 && lowest > 0.3 && lowest < 0.7;
        return { pass: ok, detail: `average new loan-to-value: young ${(100 * ltv[0]).toFixed(1)}%, working age ${(100 * ltv[1]).toFixed(1)}% (ltvAvg0 ${(100 * avg).toFixed(0)}%); sellers’ loans ${ps.sellerDebtY.toFixed(2)} (young) and ${psW.sellerDebtW.toFixed(2)} (working age) times their group’s average; with appetite −3 the lowest gross lending in 5 years is ${(100 * lowest).toFixed(0)}% of baseline` };
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
        // every cash leg of the young settles in their deposits; the accrued indexation is not a cash
        // leg. Legs are the month's totals ÷ dt, summed over its kernel steps (decision 0011).
        const cash = e.legs().filter((l) => l.kind === 'cash' && (l.to === 'HY' || l.from === 'HY') && l.from !== l.to);
        const depositFlow = cash.reduce((s, l) => s + (l.to === 'HY' ? l.value : -l.value), 0) * dt;
        const total = (...ids: string[]) => ids.reduce((s, id) => s + monthTotal(e, id), 0);
        const idx = total('indexation_HY_B', 'indexation_HY_PF');
        const newI = total('newMortgagesI_B_HY', 'newMortgagesI_PF_HY');
        const repI = total('repaymentsI_HY_B', 'repaymentsI_HY_PF');
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
        // the first kernel step (decision 0011: half a month), before the new money feeds back into
        // spending and borrowing in the month's later steps: then only who lends differs
        const holders = ['HY', 'HW', 'HO', ...FIRMS, 'PF'];
        const effect = (pfShare: number) => {
          const params = { pfShN: pfShare, pfShI: pfShare };
          const first = (push: boolean) => {
            const { engine: f, steps } = stepByStep(e, (r) => ({ money: holders.reduce((s, pl) => s + r.stock('deposits', pl), 0), lending: r.value('mortgageLendingY') + r.value('mortgageLendingW') }), params);
            if (push) f.setLever('lendingAppetite', 2);
            f.step(1);
            return { money: steps[0].money, lending: (steps[0].lending * f.model.def.dt) / stepsAMonth(f) };
          };
          const [calm, push] = [first(false), first(true)];
          return { money: push.money - calm.money, extra: push.lending - calm.lending };
        };
        const banks = effect(0),
          funds = effect(1);
        // the same extra lending in both; the difference in money isolates who lends (firms' cash needs, which
        // grow with GDP, add a little money in both cases)
        const ok = Math.abs(banks.extra - funds.extra) < 1e-12 && Math.abs(banks.money - funds.money - banks.extra) < 1e-9 && Math.abs(funds.money) < 0.1 * funds.extra;
        return {
          pass: ok,
          detail: `extra mortgage lending in the first step ${banks.extra.toFixed(4)} (% of GDP): broad money ${banks.money >= 0 ? '+' : ''}${banks.money.toFixed(4)} when banks lend, ${funds.money >= 0 ? '+' : ''}${funds.money.toFixed(4)} when pension funds lend`,
        };
      },
    },
  ],
};
