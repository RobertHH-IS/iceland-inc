/**
 * Iceland Inc.: the banks (v1 equations E4, E5 and E25).
 *
 * Loan and deposit rates follow the key rate. When bank capital falls below its target, a premium
 * is added to loan and mortgage rates. Banks pay interest by crediting deposits (new money) and
 * are paid interest from deposits (money destroyed). They pay out smoothed profit as dividends,
 * less what they need to rebuild capital.
 */
import type { Ctx, Id, ModuleDef, RuleDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { FIRMS, FIRM_NAME, pickParams, terms, lastMonth, liquidRate } from '../util.ts';

/**
 * Nobody pays with money they do not have. A player that buys assets (or, for households, spends
 * beyond its income) from its deposits can use at most the share 1 − e^(−liquiditySpeed × dt) of
 * them in a month: 63% at the default, which keeps the rest for the month's other bills. This
 * is the deposits a player can spend this month beyond its income (a yearly rate). Declare
 * params ['liquiditySpeed'] and stocks [['deposits', player]].
 */
export const cashToSpend = (c: Ctx, player: Id): number => liquidRate(c) * Math.max(0, c.stock('deposits', player));
/** Government bonds banks can still sell this month, after the government has bought back its
 *  share of theirs (a yearly rate). Declare inputs ['bondIssueB'] and stocks [['govBonds', 'B']]. */
export const bondsBanksCanSell = (c: Ctx): number => Math.max(0, c.stock('govBonds', 'B') / c.dt + Math.min(0, c.v('bondIssueB')));

const DEPOSITORS = ['HY', 'HW', 'HO', ...FIRMS, 'PF', 'W'] as const;
const DEP_LABEL: Record<(typeof DEPOSITORS)[number], string> = {
  HY: 'young households',
  HW: 'working-age households',
  HO: 'older households',
  ...FIRM_NAME,
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
const LOAN_ALL: Id[] = FIRMS.map((j) => `loanInterest${j}`);

export const banks: ModuleDef = {
  id: 'banks',
  label: 'Banks',
  description: 'Deposit, loan and mortgage rates; the capital premium; interest paid and received; profit, dividends and the lending-appetite lever.',
  requires: ['structure', 'central-bank', 'government', 'households'],
  params: [...pickParams(ALL_PARAMS, ['kapT', 'kapMin', 'rwM', 'rwL', 'sCap', 'lamEq', 'lamDivB', 'divBshG', 'divBshPF', 'divBshW', 'mD', 'sL', 'sMN', 'rMI0', 'psiIdx', 'sBB', 'lendingAppetite', 'm3', 'liquiditySpeed'])],
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
    ...FIRMS.map((j) => ({ id: `loanInterest${j}`, label: `Loan interest from ${FIRM_NAME[j]}`, unit: '% of GDP/yr', kind: 'flow' as const, scale: 'nominal' as const })),
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
        ['kronaLoansW', 'B'],
      ],
      terms: terms(
        ['mortgages', 'Mortgages', undefined, (c) => c.stock('mortgagesN', 'B') + c.stock('mortgagesI', 'B')],
        ['loans', 'Business loans and non-residents’ króna loans', undefined, (c) => c.stock('businessLoans', 'B') + c.stock('kronaLoansW', 'B')],
        ['bonds', 'Government bonds', undefined, (c) => c.stock('govBonds', 'B')],
        ['reserves', 'Reserves', 'reserves-and-payments', (c) => c.stock('reserves', 'B')],
        ['deposits', 'Deposits owed', 'endogenous-money', (c) => -c.stock('deposits', 'B')],
        ['bankBonds', 'Bank bonds owed', undefined, (c) => -c.stock('bankBonds', 'B')],
      ),
      concepts: ['net-worth', 'bank-capital'],
      explain: { what: 'The banks’ own capital: what they own minus what they owe, at the start of the month.', rule: 'Equity = mortgages + business loans + non-residents’ króna loans + government bonds + reserves − deposits − bank bonds.' },
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
      terms: terms(['capitalGap', 'Capital short of (or above) target', 'bank-capital', (c) => (c.p('sCap') * (c.p('kapT') - c.v('capitalRatio'))) / (c.p('kapT') - c.p('kapMin'))]),
      // at most sCap (capital at its minimum), at least −sCap/2 (capital well above target). Equity is
      // assets minus liabilities of about 100% of GDP each, so at baseline the ratio carries rounding of
      // about 1e-15; a gap below 1e-12 is that rounding, not capital, and prices nothing.
      combine: (t, c) => Math.min(c.p('sCap'), Math.max(-c.p('sCap') / 2, Math.abs(t.capitalGap) < 1e-12 ? 0 : t.capitalGap)),
      regime: (c, _v, t) => {
        if (t.capitalGap >= c.p('sCap')) return 'Capital at its minimum: premium at its largest';
        if (t.capitalGap <= -c.p('sCap') / 2) return 'Ample capital: discount at its largest';
        // a regime marks a real shortfall, a quarter of the way to the minimum (1 pp), not rounding-size moves around target
        return c.v('capitalRatio') < c.p('kapT') - 0.25 * (c.p('kapT') - c.p('kapMin')) ? 'Capital below target: loans cost more' : null;
      },
      concepts: ['bank-capital'],
      explain: {
        what: 'Extra interest banks charge on loans and mortgages when their capital is below target, to rebuild it, and the small discount they offer when they have more capital than they need.',
        rule: 'Premium = {sCap pp} × (target {kapT%} − capital ratio) ÷ ({kapT%} − {kapMin%}): zero at target, rising to {sCap pp} when capital falls to {kapMin%}, and no higher. With capital above target the same slope gives a discount, which competing for borrowers makes banks offer, of at most half that. The premium changes smoothly as capital moves either side of target, so a small move one way costs as much as the same move the other way saves.',
      },
    },
    {
      id: 'depositRate',
      target: 'depositRate',
      category: 'BEHAVIOUR',
      inputs: ['keyRate'],
      params: ['mD'],
      terms: terms(['keyRate', 'Key rate', 'interest-rate-channel', (c) => c.v('keyRate')], ['margin', 'Bank margin', undefined, (c) => -c.p('mD')]),
      combine: (t) => Math.max(0, t.keyRate + t.margin),
      regime: (_c, _v, t) => (t.keyRate + t.margin < 0 ? 'Deposit rate at its floor: bank margin squeezed' : null),
      explain: { what: 'Interest banks pay on deposits.', rule: 'Deposit rate = key rate − {mD pp}, never below 0%: when the key rate is lower than the margin, banks pay nothing on deposits and their margin is squeezed instead.' },
    },
    {
      id: 'loanRate',
      target: 'loanRate',
      category: 'BEHAVIOUR',
      inputs: ['keyRate', 'loanPremium'],
      params: ['sL'],
      terms: terms(
        ['keyRate', 'Key rate', 'interest-rate-channel', (c) => c.v('keyRate')],
        ['spread', 'Business-loan spread', undefined, (c) => c.p('sL')],
        ['capitalPremium', 'Capital premium', 'bank-capital', (c) => c.v('loanPremium')],
      ),
      explain: { what: 'Interest firms pay on bank loans.', rule: 'Loan rate = key rate + {sL pp} + the capital premium.' },
    },
    {
      id: 'mortgageRateN',
      target: 'mortgageRateN',
      category: 'BEHAVIOUR',
      inputs: ['keyRate', 'loanPremium', 'domesticFundingPremium'],
      params: ['sMN', 'psiPFdomN'],
      terms: terms(
        ['keyRate', 'Key rate', 'interest-rate-channel', (c) => c.v('keyRate')],
        ['spread', 'Mortgage spread', undefined, (c) => c.p('sMN')],
        ['capitalPremium', 'Capital premium', 'bank-capital', (c) => c.v('loanPremium')],
        ['funding', 'Pension funds’ demand for domestic assets', 'bond-buyers', (c) => c.p('psiPFdomN') * c.v('domesticFundingPremium')],
      ),
      explain: { what: 'Interest on non-indexed mortgages, new and old (they float with the key rate).', rule: 'Rate = key rate + {sMN pp} + the capital premium + {psiPFdomN} × the domestic funding premium (banks price new loans on what their next króna of funding costs, the covered bonds the pension funds buy, though deposits fund part of these loans).' },
    },
    {
      id: 'mortgageRateI',
      target: 'mortgageRateI',
      category: 'BEHAVIOUR',
      inputs: ['keyRate', 'loanPremium', 'domesticFundingPremium'],
      params: ['rMI0', 'psiIdx', 'i0', 'piT'],
      terms: terms(
        ['normal', 'Normal real rate', undefined, (c) => c.p('rMI0')],
        ['keyRate', 'Key rate above neutral (partly passed on)', 'interest-rate-channel', (c) => c.p('psiIdx') * (c.v('keyRate') - (c.p('i0') + c.p('piT')))],
        ['capitalPremium', 'Capital premium', 'bank-capital', (c) => c.v('loanPremium')],
        ['funding', 'Pension funds’ demand for domestic assets', 'bond-buyers', (c) => c.v('domesticFundingPremium')],
      ),
      concepts: ['indexation'],
      explain: {
        what: 'The real interest rate paid in cash on CPI-indexed mortgages. Inflation is added to the loan instead of being paid.',
        rule: 'Real rate = {rMI0%} + {psiIdx} × (key rate − its neutral level, the real neutral rate {i0%} + the inflation target {piT%}) + the capital premium + the domestic funding premium: pension funds and covered-bond buyers are the marginal lenders at fixed real rates, so when the funds want fewer domestic assets the real rate rises.',
      },
    },
    {
      id: 'bankBondRate',
      target: 'bankBondRate',
      category: 'CONTRACT',
      inputs: ['keyRate', 'domesticFundingPremium'],
      params: ['sBB'],
      terms: terms(
        ['keyRate', 'Key rate', 'interest-rate-channel', (c) => c.v('keyRate')],
        ['spread', 'Bank-bond spread', undefined, (c) => c.p('sBB')],
        ['funding', 'Pension funds’ demand for domestic assets', 'bond-buyers', (c) => c.v('domesticFundingPremium')],
      ),
      explain: { what: 'Interest banks pay on the covered bonds pension funds hold.', rule: 'Rate = key rate + {sBB pp} + the domestic funding premium: when the funds, the main buyers of covered bonds, want fewer of them, banks pay more to fund themselves.' },
    },
    ...depositInterest,
    ...FIRMS.map(
      (j): RuleDef => ({
        id: `loanInterest${j}`,
        target: `loanInterest${j}`,
        category: 'CONTRACT',
        inputs: ['loanRate'],
        stocks: [['businessLoans', j]],
        compute: (c) => c.v('loanRate') * c.stock('businessLoans', j),
        concepts: ['interest-distribution'],
        explain: { what: `Interest ${FIRM_NAME[j]} pay the banks.`, rule: 'Interest = loan rate × their loans.' },
      }),
    ),
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
      inputs: [...MORT_B, ...IDX_B, ...LOAN_ALL, 'kronaLoanInterestW', 'bondInterestB', 'reserveInterest', ...DEP_ALL, 'bankBondInterest'],
      terms: terms(
        ['mortgages', 'Mortgage interest', 'interest-distribution', sumOf(MORT_B)],
        ['indexation', 'Indexation of indexed mortgages', 'indexation', sumOf(IDX_B)],
        ['loans', 'Interest on business loans and non-residents’ króna loans', 'interest-distribution', (c) => sumOf(LOAN_ALL)(c) + c.v('kronaLoanInterestW')],
        ['bonds', 'Government-bond interest', undefined, (c) => c.v('bondInterestB')],
        ['reserves', 'Interest on reserves', 'reserves-and-payments', (c) => c.v('reserveInterest')],
        ['deposits', 'Interest paid on deposits', 'interest-distribution', (c) => -sumOf(DEP_ALL)(c)],
        ['bankBonds', 'Interest paid on bank bonds', undefined, (c) => -c.v('bankBondInterest')],
      ),
      concepts: ['bank-capital'],
      explain: {
        what: 'The banks’ profit: interest earned (including indexation added to indexed mortgages) minus interest paid. Banks have no other costs in the model.',
        rule: 'Profit = mortgage interest and indexation + interest on business loans and non-residents’ króna loans + bond interest + interest on reserves − deposit interest − bank-bond interest.',
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
      legs: FIRMS.map((j) => ({ from: j, to: 'B', amount: `loanInterest${j}` })),
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
        'Level shift in households’ desired new mortgage borrowing, % of baseline GDP a year, split between the young and working age by their share of mortgage debt; persistent while set and still subject to the debt-service and loan-to-value caps. A lasting push has a lasting effect: at −3, output is about 1.1% lower after five years and still about 0.2% lower after twenty with the policy rules acting, where the central bank eases but learns its neutral rate only slowly; with both policy levers locked the fall is deeper at first (1.7% after five years) and then turns into a small rise. Setting it back to 0 ends the push; loans already made are repaid over their term.',
      concepts: ['endogenous-money', 'credit-impulse'],
    },
  ],
  tests: [
    {
      id: 'deposit-rate-floor',
      label: 'With the key rate held at 0%, banks pay 0% on deposits, not −1%: no deposit interest is negative',
      run: (e) => {
        e.setLever('keyRate', 0); // moving the lever locks it
        e.step(3);
        const rate = e.value('depositRate');
        const lowest = Math.min(...DEPOSITORS.map((pl) => e.value(`depositInterest${pl}`)));
        const regime = e.influences('depositRate').regime ?? '';
        return { pass: rate === 0 && lowest >= 0 && regime.startsWith('Deposit rate at its floor'), detail: `deposit rate ${rate}, lowest deposit interest ${lowest.toFixed(4)}; regime “${regime}”` };
      },
    },
    {
      id: 'capital-at-target',
      label: 'At baseline bank capital is at its target, so there is no loan premium and dividends equal profit',
      run: (e) => {
        const k = e.baseline('capitalRatio');
        const gap = e.baseline('bankDividends') - e.baseline('bankProfit');
        return { pass: Math.abs(k - 0.22) < 1e-9 && Math.abs(e.baseline('loanPremium')) < 1e-12 && Math.abs(gap) < 1e-9, detail: `capital ratio ${k.toFixed(6)}, dividends − profit ${gap.toExponential(2)}` };
      },
    },
    {
      id: 'capital-premium-symmetric',
      label: 'Small moves in bank capital either side of target price loans symmetrically, with no regime switching on: a króna shock of ±5% moves the premium by the same slope both ways',
      run: (e) => {
        const at = (size: number) => {
          const f = e.fork();
          f.fire('kronaShock', size);
          const regimes = new Set<string>();
          for (let m = 0; m < 60; m++) {
            f.step(1);
            const r = f.influences('loanPremium').regime;
            if (r) regimes.add(r);
          }
          return { gap: f.value('capitalRatio') - 0.22, premium: f.value('loanPremium'), regimes: [...regimes] };
        };
        const [up, down] = [at(5), at(-5)];
        const slope = 0.02 / 0.04; // sCap ÷ (kapT − kapMin)
        const ok =
          up.gap * down.gap < 0 &&
          Math.abs(up.premium + slope * up.gap) < 1e-12 &&
          Math.abs(down.premium + slope * down.gap) < 1e-12 &&
          up.premium * down.premium < 0 &&
          up.regimes.length + down.regimes.length === 0;
        return {
          pass: ok,
          detail: `+5: capital ${(100 * up.gap).toFixed(3)} pp from target, premium ${(100 * up.premium).toFixed(4)} pp; −5: ${(100 * down.gap).toFixed(3)} pp, ${(100 * down.premium).toFixed(4)} pp; regimes: ${[...up.regimes, ...down.regimes].join(', ') || 'none'}`,
        };
      },
    },
    {
      id: 'capital-premium-bounds',
      label: 'The capital premium reaches its largest, sCap, at the minimum ratio and goes no higher; far above target the discount is half of it; each bound names itself',
      run: (e) => {
        // the same banks, judged against a target far above (and far below) their capital
        const at = (kapT: number, kapMin: number) => {
          const f = e.fork({ params: { kapT, kapMin } });
          f.step(1);
          return { k: f.value('capitalRatio'), premium: f.value('loanPremium'), regime: f.influences('loanPremium').regime ?? null };
        };
        const [short, ample, near] = [at(0.3, 0.25), at(0.15, 0.11), at(0.225, 0.185)];
        const ok =
          Math.abs(short.premium - 0.02) < 1e-15 &&
          short.regime === 'Capital at its minimum: premium at its largest' &&
          Math.abs(ample.premium + 0.01) < 1e-15 &&
          ample.regime === 'Ample capital: discount at its largest' &&
          near.premium > 0 &&
          near.regime === null;
        return {
          pass: ok,
          detail: `capital ${(100 * short.k).toFixed(2)}% against a 30% target: ${(100 * short.premium).toFixed(2)} pp (${short.regime}); against 15%: ${(100 * ample.premium).toFixed(2)} pp (${ample.regime}); half a point short: ${(100 * near.premium).toFixed(3)} pp (${near.regime ?? 'no regime'})`,
        };
      },
    },
  ],
};
