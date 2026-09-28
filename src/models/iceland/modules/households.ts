/**
 * Iceland Inc.: household income and spending by age group (v1 equations E34–E38).
 *
 * Each age group's gross income is wages (after the employee pension contribution), benefits and,
 * for older households, pensions. After income tax and cash mortgage interest it becomes
 * "net labour income"; interest and dividends are "property income". Spending moves gradually
 * (a habit) toward a target: most of net labour income, a small share of real property income,
 * less when the real interest rate is high, plus a share of savings above normal, of new
 * borrowing and of housing-wealth gains. Older households keep a share of their savings in
 * government bonds.
 */
import type { Ctx, Id, ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { AGE_LABEL, AGES, FIRM_NAME, gapRate, HH, pickParams, terms, type Age, lastMonth } from '../util.ts';
import { dividendsTo } from './firms.ts';
import { bondsBanksCanSell, cashToSpend } from './banks.ts';

/** Wages of the group (private and public), transfers and pensions: the taxable income. */
function grossIncomeRule(g: Age): RuleDef {
  // ids built once, not on every evaluation (these rules sit in the income–spending block)
  const [emp, ub, oa, fam] = [`employment${g}`, `unemploymentBenefits${g}`, `oldAgeTransfers${g}`, `familyBenefits${g}`];
  return {
    id: `grossIncome${g}`,
    target: `grossIncome${g}`,
    category: 'IDENTITY',
    inputs: ['wage', `employment${g}`, `unemploymentBenefits${g}`, `oldAgeTransfers${g}`, ...(g !== 'O' ? [`familyBenefits${g}`] : ['pensionPayouts'])],
    params: ['cEe'],
    terms: terms(
      ['wages', 'Wages after the employee pension contribution', 'real-wages', (c) => (1 - c.p('cEe')) * c.v('wage') * c.v(emp)],
      ['unemploymentBenefits', 'Unemployment benefits', 'automatic-stabilisers', (c) => c.v(ub)],
      ['oldAge', 'Old-age and disability transfers', undefined, (c) => c.v(oa)],
      ...(g !== 'O'
        ? ([['family', 'Family and housing benefits', undefined, (c: Ctx) => c.v(fam)]] as [string, string, undefined, (c: Ctx) => number][])
        : ([['pensions', 'Pension-fund pensions', 'funded-pensions', (c: Ctx) => c.v('pensionPayouts')]] as [string, string, string, (c: Ctx) => number][])),
    ),
    explain: {
      what: `Taxable income of the ${AGE_LABEL[g]}: wages, benefits${g === 'O' ? ' and pensions' : ''}.`,
      rule: `Gross income = wage rate × their jobs × (1 − {cEe%}) + unemployment benefits + old-age and disability transfers${g === 'O' ? ' + pension-fund pensions' : ' + family and housing benefits'}.`,
    },
  };
}

const sumTerms = (t: Record<Id, number>) => Object.values(t).reduce((a, b) => a + b, 0);
const mortgageInterest = (g: Age): Id[] => (g === 'O' ? [] : [`mortgageInterest_${HH[g]}_B`, `mortgageInterest_${HH[g]}_PF`]);

function propertyIncomeIds(g: Age): Id[] {
  const pl = HH[g];
  if (g === 'Y') return [`depositInterest${pl}`, ...dividendsTo('HY')];
  if (g === 'W') return [`depositInterest${pl}`, ...dividendsTo('HW'), 'bankDividendsHW'];
  return [`depositInterest${pl}`, 'bondInterestHO', ...dividendsTo('HO'), 'bankDividendsHO'];
}

/** Liquid savings at the start of the month: deposits, plus bonds for older households. */
const liquid = (c: Ctx, g: Age) => (g === 'O' ? c.stock('deposits', 'HO') + c.stock('govBonds', 'HO') : c.stock('deposits', g === 'Y' ? 'HY' : 'HW'));
const liquidStocks = (g: Age): [Id, Id][] => (g === 'O' ? [['deposits', 'HO'], ['govBonds', 'HO']] : [['deposits', HH[g]]]);

/** Home purchases (−) or sales (+) this month. */
const homeTrade = (c: Ctx, g: Age) => (g === 'Y' ? -c.v('homePurchasesY') : g === 'W' ? -c.v('homePurchasesW') : c.v('homePurchasesY') + c.v('homePurchasesW'));
const homeInputs = (g: Age): Id[] => (g === 'Y' ? ['homePurchasesY'] : g === 'W' ? ['homePurchasesW'] : ['homePurchasesY', 'homePurchasesW']);

/**
 * The most a group can spend this month: its cash income after home purchases (or plus home sales)
 * and new mortgage borrowing, plus what it can draw from its deposits (banks.ts, `cashToSpend`;
 * older households keep the other half of that for their bond purchases). Nobody spends deposits
 * they do not have.
 */
const cashLimit = (c: Ctx, g: Age, nli: Id, pi: Id, nml: Id) =>
  c.v(nli) + c.v(pi) + homeTrade(c, g) + (g !== 'O' ? c.v(nml) : 0) + (g === 'O' ? 0.5 : 1) * cashToSpend(c, HH[g]);

function consumptionRule(g: Age): RuleDef {
  const aL = `aL${g}`,
    aW = `aW${g}`,
    aH = `aH${g}`,
    c0 = `c0${g}`,
    lw0 = `LW0${g}`,
    h0 = `H0${g}`,
    nli = `netLabourIncome${g}`,
    pi = `propertyIncome${g}`,
    nml = `netMortgageLending${g}`;
  const labour = (c: Ctx) => c.p(aL) * (c.v(nli) + homeTrade(c, g));
  const property = (c: Ctx) => c.p('aK') * (c.v(pi) - lastMonth(c, 'expectedInflation') * liquid(c, g));
  const realGap = (c: Ctx) => c.v('keyRate') - lastMonth(c, 'expectedInflation') - c.p('i0');
  const self = `consumption${g}`;
  const spendingCap = (c: Ctx) => {
    const k = 1 - Math.exp(-c.p('lamC') * c.dt);
    return c.lag(self) + (cashLimit(c, g, nli, pi, nml) - c.lag(self)) / k;
  };
  return {
    id: `consumption${g}`,
    target: `consumption${g}`,
    category: 'BEHAVIOUR',
    label: 'Consumption function with habit',
    inputs: [`netLabourIncome${g}`, `propertyIncome${g}`, 'keyRate', 'cpi', 'realHousePrice', ...homeInputs(g), ...(g !== 'O' ? [`netMortgageLending${g}`] : [])],
    lagInputs: ['expectedInflation', `consumption${g}`],
    params: [aL, 'aK', 'betaC', 'i0', c0, aW, `LW0${g}`, aH, `H0${g}`, ...(g !== 'O' ? ['aNL'] : []), 'lamC', 'liquiditySpeed'],
    stocks: liquidStocks(g),
    adjust: { speed: 'lamC', form: 'exponential' },
    terms: terms(
      ['labourIncome', 'Spending out of income after tax and mortgage interest', 'consumption-function', labour],
      ['propertyIncome', 'Spending out of real interest and dividends', 'interest-distribution', property],
      ['realRate', 'Reward for saving (real key rate above neutral)', 'paradox-of-thrift', (c) => -c.p('betaC') * realGap(c) * (labour(c) + property(c))],
      ['autonomous', 'Spending not tied to this month’s income', undefined, (c) => c.p(c0) * c.v('cpi')],
      ['wealth', 'Savings above normal', 'stock-flow-consistency', (c) => c.p(aW) * (liquid(c, g) - c.v('cpi') * c.p(lw0))],
      ...(g !== 'O' ? ([['borrowing', 'New mortgage borrowing', 'credit-impulse', (c: Ctx) => c.p('aNL') * c.v(nml)]] as [string, string, string, (c: Ctx) => number][]) : []),
      ['housing', 'Housing wealth', 'housing-wealth-effect', (c) => c.p(aH) * c.p(h0) * (c.v('realHousePrice') - 1) * c.v('cpi')],
    ),
    // Liquidity constraint: spending moves toward the target by the habit (the kernel's
    // exponential `adjust`, which closes k = 1 − e^(−lamC × dt) of the gap), but never above the
    // cash limit. Capping the target at last month + (limit − last month) ÷ k caps the spending.
    combine: (t, c) => Math.min(sumTerms(t), spendingCap(c)),
    regime: (c, _v, t) => (sumTerms(t) > spendingCap(c) ? 'Spending limited by cash in hand' : null),
    concepts: ['consumption-function', 'habit-persistence', 'borrowers-and-savers'],
    explain: {
      what: `What the ${AGE_LABEL[g]} spend on goods and services, including VAT (% of baseline GDP a year).`,
      rule: `Target = [{${aL}} × (net labour income ${g === 'O' ? '+ home sales' : '− home purchases'}) + {aK} × (interest and dividends − expected inflation × savings)] × (1 − {betaC} × (real key rate − neutral)) + {${c0}} × CPI + {${aW}} × savings above normal${g !== 'O' ? ' + {aNL} × net new mortgage borrowing' : ''} + {${aH}} × housing wealth × (real house price − 1). Spending moves toward the target at speed {lamC} a year (a habit), but never beyond their cash: income after tax, mortgage interest${g !== 'O' ? ', home purchases and new borrowing' : ' and home sales'} plus ${g === 'O' ? 'half of ' : ''}1 − e^(−{liquiditySpeed} × one month) of their deposits${g === 'O' ? ' (the other half is for their bond purchases)' : ''}, so their deposits never go negative.`,
    },
  };
}

/** Older households' bond budget this month: half their cash in hand, less new bonds bought from the government. */
const hoCash = (c: Ctx) => Math.max(0, 0.5 * cashToSpend(c, 'HO') - Math.max(0, c.v('bondIssueHO')));
/** Bonds banks can still sell them, after the buyback and pension funds' purchases. */
const hoFromBanks = (c: Ctx) => Math.max(0, bondsBanksCanSell(c) - Math.max(0, c.v('bondPurchasesPF')));
/** Bonds they can still sell, after the government's buyback of theirs. */
const hoBondsToSell = (c: Ctx) => Math.max(0, c.stock('govBonds', 'HO') / c.dt + Math.min(0, c.v('bondIssueHO')));

const perGroup: RuleDef[] = AGES.flatMap((g): RuleDef[] => {
  const [gross, tax] = [`grossIncome${g}`, `incomeTax${g}`];
  const [mB, mPF] = g === 'O' ? ['', ''] : mortgageInterest(g);
  return [
    grossIncomeRule(g),
    {
      id: `netLabourIncome${g}`,
      target: `netLabourIncome${g}`,
      category: 'IDENTITY',
      inputs: [gross, tax, ...mortgageInterest(g)],
      terms: terms(
        ['gross', 'Gross income', undefined, (c) => c.v(gross)],
        ['tax', 'Income tax', 'automatic-stabilisers', (c) => -c.v(tax)],
        ...(g !== 'O' ? ([['mortgage', 'Mortgage interest paid in cash', 'interest-distribution', (c: Ctx) => -(c.v(mB) + c.v(mPF))]] as [string, string, string, (c: Ctx) => number][]) : []),
      ),
      explain: {
        what: `Income of the ${AGE_LABEL[g]} from work, benefits${g === 'O' ? ' and pensions' : ''} after income tax${g !== 'O' ? ' and the cash interest on their mortgages' : ''}.`,
        rule: `Net labour income = gross income − income tax${g !== 'O' ? ' − mortgage interest (the indexation on indexed loans is added to the loan, not paid)' : ''}.`,
      },
    },
    {
      id: `propertyIncome${g}`,
      target: `propertyIncome${g}`,
      category: 'IDENTITY',
      inputs: propertyIncomeIds(g),
      terms: propertyIncomeIds(g).map((id) => ({
        id,
        label: id.startsWith('deposit') ? 'Interest on deposits' : id.startsWith('bondInterest') ? 'Interest on government bonds' : id.startsWith('bank') ? 'Bank dividends' : `Dividends and owners’ income from ${FIRM_NAME[id.slice(9, 11) as keyof typeof FIRM_NAME]}`,
        concept: id.includes('nterest') ? 'interest-distribution' : undefined,
        compute: (c: Ctx) => c.v(id),
      })),
      explain: { what: `Interest and dividends received by the ${AGE_LABEL[g]}.`, rule: 'Property income = interest on deposits and bonds + dividends from firms and banks.' },
    },
    {
      id: `disposableIncome${g}`,
      target: `disposableIncome${g}`,
      category: 'IDENTITY',
      inputs: [`netLabourIncome${g}`, `propertyIncome${g}`],
      terms: terms(['labour', 'Net labour income', undefined, (c) => c.v(`netLabourIncome${g}`)], ['property', 'Property income', 'interest-distribution', (c) => c.v(`propertyIncome${g}`)]),
      concepts: ['borrowers-and-savers'],
      explain: { what: `Cash income of the ${AGE_LABEL[g]} after tax and mortgage interest.`, rule: 'Disposable income = net labour income + property income.' },
    },
    consumptionRule(g),
  ];
});

const vars: VarDef[] = [
  ...AGES.flatMap((g): VarDef[] => [
    { id: `grossIncome${g}`, label: `Gross income, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`grossIncome${g}`) },
    { id: `netLabourIncome${g}`, label: `Net labour income, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`netLabourIncome${g}`) },
    { id: `propertyIncome${g}`, label: `Property income, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`propertyIncome${g}`) },
    { id: `disposableIncome${g}`, label: `Disposable income, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`disposableIncome${g}`) },
    { id: `consumption${g}`, label: `Consumption, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`consumption${g}`) },
  ]),
  { id: 'consumption', label: 'Household consumption', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('consumption') },
  { id: 'realConsumption', label: 'Household consumption (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('realConsumption') },
  { id: 'realDisposableIncome', label: 'Households’ real disposable income', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('realDisposableIncome') },
  { id: 'bondPurchasesHO', label: 'Older households’ bond purchases', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ...AGES.flatMap((g): VarDef[] => [
    { id: `consumption${g}_FR`, label: `Spending with retail and service firms, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: `consumption${g}_FC`, label: `Home repairs by builders, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ]),
];

export const households: ModuleDef = {
  id: 'households',
  label: 'Households',
  description: 'Income, taxes and spending of young, working-age and older households; their property income; older savers’ bond holdings.',
  requires: ['structure', 'labour-and-wages', 'government', 'banks', 'firms', 'pensions', 'mortgages', 'housing'],
  params: pickParams(ALL_PARAMS, [
    'aLY', 'aLW', 'aLO', 'aK', 'betaC', 'aWY', 'aWW', 'aWO', 'aNL', 'aHY', 'aHW', 'aHO', 'lamC', 'c0Y', 'c0W', 'c0O', 'boSh0', 'hhDep', 'depShY', 'depShW', 'depShO', 'eqHY', 'eqHW', 'eqHO', 'bondO',
    ...AGES.flatMap((g) => [`LW0${g}`, `H0${g}`]),
  ]),
  vars,
  rules: [
    ...perGroup,
    {
      id: 'consumption',
      target: 'consumption',
      category: 'IDENTITY',
      inputs: AGES.map((g) => `consumption${g}`),
      terms: AGES.map((g) => ({ id: g, label: AGE_LABEL[g], concept: 'consumption-function', compute: (c: Ctx) => c.v(`consumption${g}`) })),
      explain: { what: 'All household spending on goods and services, including VAT.', rule: 'Sum over the three age groups.' },
    },
    {
      id: 'realConsumption',
      target: 'realConsumption',
      category: 'IDENTITY',
      inputs: ['consumption', 'cpi'],
      compute: (c) => c.v('consumption') / c.v('cpi'),
      explain: { what: 'Household spending at baseline prices.', rule: 'Real consumption = consumption ÷ CPI.' },
    },
    {
      id: 'realDisposableIncome',
      target: 'realDisposableIncome',
      category: 'IDENTITY',
      inputs: [...AGES.map((g) => `disposableIncome${g}`), 'cpi'],
      compute: (c) => AGES.reduce((s, g) => s + c.v(`disposableIncome${g}`), 0) / c.v('cpi'),
      explain: { what: 'All households’ disposable income at baseline prices; it drives house prices.', rule: 'Sum of the three groups’ disposable income ÷ CPI.' },
    },
    ...AGES.flatMap((g): RuleDef[] => [
      {
        id: `consumption${g}_FR`,
        target: `consumption${g}_FR`,
        category: 'BEHAVIOUR',
        inputs: [`consumption${g}`],
        params: ['maintShare'],
        compute: (c) => (1 - c.p('maintShare')) * c.v(`consumption${g}`),
        concepts: ['consumption-function'],
        explain: { what: `What the ${AGE_LABEL[g]} spend in shops, restaurants and on services, including VAT.`, rule: 'All their spending except home repairs: (1 − {maintShare%}) × consumption.' },
      },
      {
        id: `consumption${g}_FC`,
        target: `consumption${g}_FC`,
        category: 'BEHAVIOUR',
        inputs: [`consumption${g}`],
        params: ['maintShare'],
        compute: (c) => c.p('maintShare') * c.v(`consumption${g}`),
        explain: { what: `What the ${AGE_LABEL[g]} pay builders for maintenance and repair of their homes, including VAT.`, rule: '{maintShare%} of their spending (the CPI weight of dwelling maintenance and repair).' },
      },
    ]),
    {
      id: 'bondPurchasesHO',
      target: 'bondPurchasesHO',
      category: 'BEHAVIOUR',
      inputs: ['bondIssueHO', 'bondIssueB', 'bondPurchasesPF'],
      params: ['boSh0', 'lamReb', 'liquiditySpeed'],
      stocks: [
        ['deposits', 'HO'],
        ['govBonds', 'HO'],
        ['govBonds', 'B'],
      ],
      terms: terms(['mix', 'Toward their usual mix of deposits and bonds', 'bond-buyers', (c) => gapRate(c.p('lamReb'), c.dt) * (c.p('boSh0') * (c.stock('deposits', 'HO') + c.stock('govBonds', 'HO')) - c.stock('govBonds', 'HO'))]),
      // Buy only with their half of cash in hand, left after new bonds, and only bonds banks still
      // hold after pension funds' purchases; sell only bonds they hold after this month's buyback.
      combine: (t, c) => (t.mix > 0 ? Math.min(t.mix, hoCash(c), hoFromBanks(c)) : Math.max(t.mix, -hoBondsToSell(c))),
      regime: (c, _v, t) => {
        if (t.mix > hoFromBanks(c)) return 'Limited by the bonds banks hold';
        if (t.mix > hoCash(c)) return 'Purchases limited by cash in hand';
        return t.mix < -hoBondsToSell(c) ? 'Sales limited by holdings' : null;
      },
      concepts: ['bond-buyers'],
      explain: {
        what: 'Government bonds older households buy from banks (negative: sell) to keep their usual mix of deposits and bonds.',
        rule: 'They aim to hold {boSh0} of their savings in bonds and close the gap at speed {lamReb} a year. They buy with at most half of 1 − e^(−{liquiditySpeed} × one month) of their deposits, less any new bonds they buy from the government, and only bonds banks hold; they sell only bonds they hold.',
      },
    },
  ],
  flows: [
    {
      id: 'householdConsumption',
      label: 'Household consumption',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: AGES.flatMap((g) => [
        { from: HH[g], to: 'FR', amount: `consumption${g}_FR` },
        { from: HH[g], to: 'FC', amount: `consumption${g}_FC` },
      ]),
      concepts: ['consumption-function'],
      explain: { what: 'Households buy goods and services, including VAT, from retail and service firms, and pay builders to repair their homes; imported goods reach them through those firms.' },
    },
    {
      id: 'bondPurchasesHO',
      label: 'Older households’ bond trades',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'trade', instrument: 'govBonds' },
      legs: [{ from: 'HO', to: 'B', amount: 'bondPurchasesHO' }],
      concepts: ['bond-buyers'],
      explain: { what: 'Older savers buy bonds from banks with their deposits (or sell them back), keeping their usual mix.' },
    },
  ],
  tests: [
    {
      id: 'zero-saving-at-baseline',
      label: 'At baseline each age group spends exactly its cash income, so its deposits are steady',
      run: (e) => {
        const gaps = AGES.map((g) => {
          const buySell = g === 'Y' ? -e.baseline('homePurchasesY') : g === 'W' ? -e.baseline('homePurchasesW') : e.baseline('homePurchasesY') + e.baseline('homePurchasesW');
          return e.baseline(`disposableIncome${g}`) + buySell - e.baseline(`consumption${g}`);
        });
        return { pass: gaps.every((x) => Math.abs(x) < 1e-9), detail: gaps.map((x) => x.toExponential(2)).join(', ') };
      },
    },
    {
      id: 'rate-hike-moves-income-to-savers',
      label: 'A higher key rate cuts the real disposable income of borrowers and raises that of older savers',
      run: (e) => {
        e.setLever('keyRateFixed', 4); // 1 pp above the neutral 3%, held (stabilisers on Manual)
        e.step(6);
        const d = (g: Age) => (e.value(`disposableIncome${g}`) / e.value('cpi') / e.baseline(`disposableIncome${g}`) - 1) * 100;
        const [y, w, o] = [d('Y'), d('W'), d('O')];
        return { pass: y < 0 && w < 0 && o > 0, detail: `after 6 months: young ${y.toFixed(2)}%, working age ${w.toFixed(2)}%, older +${o.toFixed(2)}%` };
      },
    },
  ],
};
