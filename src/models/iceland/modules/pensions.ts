/**
 * Iceland Inc.: the funded pension system (v1 equations E27, E43 and part of E44).
 *
 * Employers pay contributions (employer and employee parts) to the pension funds, which gives
 * working-age members new pension rights. Funds pay pensions to older members, which uses up
 * their rights. Each month the funds credit their smoothed investment income to members' rights,
 * plus a slow share of any surplus. As members retire, their rights move from the working-age
 * group to the older group: a reclassification, not a payment. The funds keep a portfolio of
 * deposits, government and bank bonds, mortgages, shares and foreign assets, moving it toward
 * target shares through new flows.
 */
import type { Ctx, Id, ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { FIRMS, FIRM_NAME, gapRate, pickParams, terms, lastMonth } from '../util.ts';
import { dividendsTo } from './firms.ts';
import { bondsBanksCanSell } from './banks.ts';

const PF_ASSETS: [Id, string][] = [
  ['deposits', 'Deposits'],
  ['govBonds', 'Government bonds'],
  ['indexedBonds', 'Indexed government bonds'],
  ['bankBonds', 'Bank bonds'],
  ['mortgagesN', 'Non-indexed mortgages'],
  ['mortgagesI', 'Indexed mortgages'],
  ['shares', 'Domestic shares'],
  ['foreignAssets', 'Foreign assets'],
];
const INCOME: [Id, string, Id | undefined][] = [
  ['depositInterestPF', 'Interest on deposits', 'interest-distribution'],
  ['bondInterestPF', 'Interest on government bonds', 'interest-distribution'],
  ['indexedBondCoupon', 'Real coupon on indexed bonds', 'indexation'],
  ['bondIndexation', 'Indexation of indexed bonds', 'indexation'],
  ['bankBondInterest', 'Interest on bank bonds', 'interest-distribution'],
  ['mortgageInterest_HY_PF', 'Mortgage interest from the young', 'interest-distribution'],
  ['mortgageInterest_HW_PF', 'Mortgage interest from working age', 'interest-distribution'],
  ['indexation_HY_PF', 'Indexation of the young’s mortgages', 'indexation'],
  ['indexation_HW_PF', 'Indexation of working-age mortgages', 'indexation'],
  ['foreignAssetIncome', 'Income on foreign assets', undefined],
  ...dividendsTo('PF').map((id): [Id, string, Id | undefined] => [id, `Dividends from ${FIRM_NAME[id.slice(9, 11) as keyof typeof FIRM_NAME]}`, undefined]),
  ['bankDividendsPF', 'Dividends from banks', undefined],
];

/**
 * The funds keep a cash buffer: deposits of at least pfLiquidityFloorShare of their usual share of
 * assets. What they can put into assets this month (`pfCash`, a yearly rate) is the share
 * 1 − e^(−liquiditySpeed × dt) of their deposits above that floor, less what they have already
 * spent this month; below the floor it turns negative, and is then the cash they must raise. Their
 * purchases draw on it in turn: new government bonds first (government.ts), then foreign assets,
 * then bank bonds, then government bonds bought from banks. Each takes at most what the ones before
 * it left. When it is negative, foreign assets are sold toward it, and bank bonds run off for what
 * foreign sales cannot raise. One
 * smooth limit for buying and selling means the funds neither buy their deposits down to nothing
 * nor switch between buying and selling from month to month (review E1). Each reader declares the
 * inputs, params and stocks below.
 */
const pos = (x: number) => Math.max(0, x);
/** Cash as the regimes read it: what earlier purchases leave can come out a rounding error below
 *  zero when they spent it all, which is not cash to raise. */
const cashLeft = (x: number) => (Math.abs(x) < 1e-9 ? 0 : x);
/** The shift of the funds' target foreign share: the lever's, plus psiPF per point the foreign
 *  interest rate is above normal (higher yields abroad draw more of their savings abroad). Declare
 *  SHIFT_INPUTS and SHIFT_PARAMS. */
const SHIFT_INPUTS: Id[] = ['foreignRate'];
const SHIFT_PARAMS: Id[] = ['pfForeignShift', 'psiPF', 'iF0', 'pfForeignTarget'];
const returnsShift = (c: Ctx) => c.p('psiPF') * (c.v('foreignRate') - c.p('iF0'));
const foreignShift = (c: Ctx) => c.p('pfForeignShift') + returnsShift(c);
/** Relative change in the funds' domestic targets (bank bonds, deposits) when the foreign target
 *  shifts by s: −s ÷ (1 − the normal foreign share). The funds make room for more foreign assets by
 *  holding proportionally less of the rest. */
const domesticShift = (c: Ctx) => -foreignShift(c) / (1 - c.p('pfForeignTarget'));
const CASH_INPUTS: Id[] = ['pensionFundAssets', ...SHIFT_INPUTS];
const CASH_PARAMS: Id[] = ['liquiditySpeed', 'pfLiquidityFloorShare', 'dPF0', ...SHIFT_PARAMS];
const CASH_STOCKS: [Id, Id][] = [['deposits', 'PF']];
/** The least the funds keep in deposits. Declare CASH_INPUTS. */
const pfFloor = (c: Ctx) => c.p('pfLiquidityFloorShare') * c.p('dPF0') * (1 + domesticShift(c)) * c.v('pensionFundAssets');
/** Cash the funds can still put into assets this month after the purchases `spent` (a yearly rate;
 *  negative: cash they must raise). A sale among `spent` adds its proceeds. */
const pfCash = (c: Ctx, spent: Id[]) => gapRate(c.p('liquiditySpeed'), c.dt) * (c.stock('deposits', 'PF') - pfFloor(c)) - spent.reduce((s, id) => s + c.v(id), 0);
/** What the funds can pay for new government bonds this month (government.ts, bondIssuePF): the
 *  limit before any purchase, and nothing when their deposits are below the buffer. A reader
 *  declares PF_CASH (inputs, params and stocks). */
export const pfCashForNewBonds = (c: Ctx) => pos(pfCash(c, []));
export const PF_CASH = { inputs: CASH_INPUTS, params: CASH_PARAMS, stocks: CASH_STOCKS };

/** Foreign purchases toward the target share of assets, both valued at this month's exchange rate
 *  (funds see market values), and the lever's shift of that target. */
const foreignToTarget = (c: Ctx) => {
  const reval = c.v('revaluationForeignAssets') * c.dt; // this month's revaluation
  return gapRate(c.p('lamFA'), c.dt) * (c.p('pfForeignTarget') * (c.v('pensionFundAssets') + reval) - c.stock('foreignAssets', 'PF') - reval);
};
const foreignLever = (c: Ctx) => gapRate(c.p('lamFA'), c.dt) * c.p('pfForeignShift') * (c.v('pensionFundAssets') + c.v('revaluationForeignAssets') * c.dt);
const foreignReturns = (c: Ctx) => gapRate(c.p('lamFA'), c.dt) * returnsShift(c) * (c.v('pensionFundAssets') + c.v('revaluationForeignAssets') * c.dt);
/** Foreign assets the funds hold at this month's exchange rate. Declare the stock and the
 *  revaluation input. */
const foreignHeld = (c: Ctx) => pos(c.stock('foreignAssets', 'PF') + c.v('revaluationForeignAssets') * c.dt);
/** What non-residents can pay for foreign assets the funds sell them this month (a yearly rate):
 *  the share 1 − e^(−liquiditySpeed × dt) of their króna deposits and bonds, after this month's
 *  current account. They raise it by selling bonds to banks (external.ts, bondPurchasesW). */
const kronurAbroad = (c: Ctx) => gapRate(c.p('liquiditySpeed'), c.dt) * pos(c.stock('deposits', 'W') + c.stock('govBonds', 'W') - c.dt * (c.v('currentAccount') - c.v('reserveIncomeKept')));
/** Bank-bond purchases toward their usual share, and the lever's shift of that share. */
const bankBondTarget = (c: Ctx) => gapRate(c.p('lamReb'), c.dt) * (c.p('bbSh0') * c.v('pensionFundAssets') - c.stock('bankBonds', 'PF'));
const bankBondShift = (c: Ctx) => gapRate(c.p('lamReb'), c.dt) * c.p('bbSh0') * domesticShift(c) * c.v('pensionFundAssets');
/** Government bonds the funds can still sell this month, after the government's buyback of theirs. */
const pfBondsToSell = (c: Ctx) => pos(c.stock('govBonds', 'PF') / c.dt + Math.min(0, c.v('bondIssuePF')));

const rightsShare = (c: Ctx, who: 'HW' | 'HO') => c.stock('pensionRights', who) / (c.stock('pensionRights', 'HW') + c.stock('pensionRights', 'HO'));

const vars: VarDef[] = [
  ...FIRMS.map((j): VarDef => ({ id: `pensionContrib${j}`, label: `Pension contributions, ${FIRM_NAME[j]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' })),
  { id: 'pensionContributions', label: 'Pension contributions, all employers', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('pensionContributions') },
  { id: 'pensionPayouts', label: 'Pension payouts', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('pensionPayouts') },
  { id: 'pensionFundAssets', label: 'Pension-fund assets', unit: '% of GDP', kind: 'state', scale: 'nominal', description: 'Everything the funds own, at the start of the month.' },
  { id: 'pensionFundNetWorth', label: 'Pension-fund surplus', unit: '% of GDP', kind: 'state', scale: 'nominal', description: 'Assets minus the rights the funds owe members.' },
  { id: 'pfIncome', label: 'Pension-fund income', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('pfIncome') },
  { id: 'pfIncomeSmoothed', label: 'Pension-fund income (smoothed)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('pfIncomeSmoothed') },
  { id: 'returnsCredited', label: 'Returns credited to members', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'returnsCreditedHW', label: 'Returns credited, working-age members', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'returnsCreditedHO', label: 'Returns credited, pensioners', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'rightsRetiring', label: 'Rights moving to pensioners', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'foreignAssetIncome', label: 'Income on pension funds’ foreign assets', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'foreignAssetPurchases', label: 'Pension funds’ foreign purchases', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'bankBondPurchases', label: 'Pension funds’ bank-bond purchases', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'bondPurchasesPF', label: 'Pension funds’ government-bond purchases', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
];

const rules: RuleDef[] = [
  ...FIRMS.map(
    (j): RuleDef => ({
      id: `pensionContrib${j}`,
      target: `pensionContrib${j}`,
      category: 'CONTRACT',
      inputs: ['wage', `employment${j}`],
      params: ['cEr', 'cEe'],
      compute: (c) => (c.p('cEr') + c.p('cEe')) * c.v('wage') * c.v(`employment${j}`),
      concepts: ['funded-pensions'],
      explain: {
        what: `Pension contributions ${FIRM_NAME[j]} pay for their staff.`,
        rule: '(employer {cEr%} + employee {cEe%}) × gross wages. The employee part is deducted from pay, so wages are counted once.',
      },
    }),
  ),
  {
    id: 'pensionContributions',
    target: 'pensionContributions',
    category: 'CONTRACT',
    inputs: ['wage', 'employmentTotal'],
    params: ['cEr', 'cEe'],
    compute: (c) => (c.p('cEr') + c.p('cEe')) * c.v('wage') * c.v('employmentTotal'),
    concepts: ['funded-pensions', 'pension-entitlements'],
    explain: { what: 'All pension contributions, private and public: they become working-age members’ new pension rights.', rule: '(employer {cEr%} + employee {cEe%}) × the whole gross wage bill.' },
  },
  {
    id: 'pensionPayouts',
    target: 'pensionPayouts',
    category: 'CONTRACT',
    params: ['payout'],
    stocks: [['pensionRights', 'HO']],
    compute: (c) => c.p('payout') * c.stock('pensionRights', 'HO'),
    concepts: ['funded-pensions'],
    explain: {
      what: 'Pensions the funds pay to older households. Each payment uses up the same amount of their rights.',
      rule: 'Payouts = {payout} × pensioners’ rights a year. In the zero-growth baseline this is about 14% of GDP, more than today’s 6%: a stationary funded system pays out contributions plus returns (fixed in v2 with growth).',
    },
  },
  {
    id: 'pensionFundAssets',
    target: 'pensionFundAssets',
    category: 'IDENTITY',
    stocks: PF_ASSETS.map(([ins]) => [ins, 'PF'] as [Id, Id]),
    terms: PF_ASSETS.map(([ins, label]) => ({ id: ins, label, compute: (c: Ctx) => c.stock(ins, 'PF') })),
    concepts: ['funded-pensions'],
    explain: { what: 'Everything the pension funds own, at the start of the month.', rule: 'Deposits + government, indexed and bank bonds + mortgages + domestic shares + foreign assets.' },
  },
  {
    id: 'pensionFundNetWorth',
    target: 'pensionFundNetWorth',
    category: 'IDENTITY',
    inputs: ['pensionFundAssets'],
    stocks: [['pensionRights', 'PF']],
    compute: (c) => c.v('pensionFundAssets') - c.stock('pensionRights', 'PF'),
    concepts: ['net-worth'],
    explain: { what: 'The funds’ surplus: assets minus the rights they owe members.', rule: 'Surplus = assets − pension rights.' },
  },
  {
    id: 'pfIncome',
    target: 'pfIncome',
    category: 'IDENTITY',
    inputs: INCOME.map(([id]) => id),
    terms: INCOME.map(([id, label, concept]) => ({ id, label, concept, compute: (c: Ctx) => c.v(id) })),
    explain: {
      what: 'The funds’ investment income this month (a yearly rate), including indexation added to their indexed loans and bonds.',
      rule: 'Income = interest + indexation + income on foreign assets + dividends from firms and banks.',
    },
  },
  {
    id: 'pfIncomeSmoothed',
    target: 'pfIncomeSmoothed',
    category: 'BEHAVIOUR',
    inputs: ['pfIncome'],
    adjust: { speed: 'lamPFinc', form: 'exponential' },
    terms: terms(['income', 'Income this month', undefined, (c) => c.v('pfIncome')]),
    concepts: ['gradual-adjustment'],
    explain: { what: 'Fund income smoothed over recent months: what the funds credit to members.', rule: 'Moves toward this month’s income at speed {lamPFinc} a year.' },
  },
  {
    id: 'returnsCredited',
    target: 'returnsCredited',
    category: 'BEHAVIOUR',
    lagInputs: ['pfIncomeSmoothed'],
    inputs: ['pensionFundNetWorth', 'pensionFundAssets'],
    params: ['lamPFnw', 'nwPF0'],
    terms: terms(
      ['income', 'Smoothed fund income', 'funded-pensions', (c) => lastMonth(c, 'pfIncomeSmoothed')],
      ['surplus', 'Surplus above target', 'net-worth', (c) => c.p('lamPFnw') * (c.v('pensionFundNetWorth') - c.p('nwPF0') * c.v('pensionFundAssets'))],
    ),
    concepts: ['pension-entitlements'],
    explain: {
      what: 'Returns the funds add to members’ rights (a yearly rate). No money moves: the rights simply grow.',
      rule: 'Credited = last month’s smoothed income + {lamPFnw} × (surplus − target surplus {nwPF0%} of assets): gains and losses reach members slowly.',
    },
  },
  ...(['HW', 'HO'] as const).map(
    (who): RuleDef => ({
      id: `returnsCredited${who}`,
      target: `returnsCredited${who}`,
      category: 'CONTRACT',
      inputs: ['returnsCredited'],
      stocks: [
        ['pensionRights', 'HW'],
        ['pensionRights', 'HO'],
      ],
      compute: (c) => c.v('returnsCredited') * rightsShare(c, who),
      concepts: ['pension-entitlements'],
      explain: { what: `Returns credited to ${who === 'HW' ? 'working-age members' : 'pensioners'}.`, rule: 'Their share of all rights × the returns credited.' },
    }),
  ),
  {
    id: 'rightsRetiring',
    target: 'rightsRetiring',
    category: 'IDENTITY',
    params: ['ageing'],
    stocks: [['pensionRights', 'HW']],
    compute: (c) => c.p('ageing') * c.stock('pensionRights', 'HW'),
    concepts: ['intergenerational-flows', 'pension-entitlements'],
    explain: { what: 'Pension rights that move from working-age members to pensioners as they retire (a yearly rate).', rule: 'Moved = {ageing} × working-age rights a year.' },
  },
  {
    id: 'foreignAssetIncome',
    target: 'foreignAssetIncome',
    category: 'BEHAVIOUR',
    inputs: ['foreignRate'],
    params: ['iF0', 'pfForeignRatePass'],
    stocks: [['foreignAssets', 'PF']],
    terms: terms(
      ['normal', 'Normal yield', 'funded-pensions', (c) => c.p('iF0') * c.stock('foreignAssets', 'PF')],
      ['foreignRate', 'Change in rates abroad (their bonds and deposits)', 'carry-trade', (c) => c.p('pfForeignRatePass') * (c.v('foreignRate') - c.p('iF0')) * c.stock('foreignAssets', 'PF')],
    ),
    explain: {
      what: 'Interest and dividends on pension funds’ foreign assets, paid in krónur.',
      rule: 'Income = (the normal yield {iF0%} + {pfForeignRatePass} × (the foreign interest rate − its normal level {iF0%})) × the assets’ króna value. Only their foreign bonds and deposits, about {pfForeignRatePass%} of the portfolio, earn more when rates abroad rise; the rest is shares, whose dividends do not follow interest rates.',
    },
  },
  {
    id: 'foreignAssetPurchases',
    target: 'foreignAssetPurchases',
    category: 'BEHAVIOUR',
    label: 'Foreign allocation',
    inputs: [...CASH_INPUTS, 'revaluationForeignAssets', 'bondIssuePF', 'currentAccount', 'reserveIncomeKept'],
    params: ['lamFA', ...CASH_PARAMS],
    stocks: [['foreignAssets', 'PF'], ['deposits', 'W'], ['govBonds', 'W'], ...CASH_STOCKS],
    terms: terms(
      ['target', 'Toward the target foreign share', 'funded-pensions', foreignToTarget],
      ['lever', 'Foreign-allocation lever', 'floating-exchange-rate', foreignLever],
      ['returns', 'Higher (or lower) interest rates abroad', 'carry-trade', foreignReturns],
      ['cash', 'Cash to spend above their buffer (negative: cash to raise)', 'funded-pensions', (c) => pfCash(c, ['bondIssuePF'])],
    ),
    // Buy only with cash above the buffer, and sell when below it; sell no more than they hold,
    // nor more than non-residents have krónur to pay for.
    combine: (t, c) => Math.max(Math.min(t.target + t.lever + t.returns, t.cash), -foreignHeld(c) / c.dt, -kronurAbroad(c)),
    regime: (c, _v, t) => {
      const cash = cashLeft(t.cash);
      const want = Math.min(t.target + t.lever + t.returns, cash);
      const [held, kronur] = [foreignHeld(c) / c.dt, kronurAbroad(c)];
      if (want < -Math.min(held, kronur)) return held <= kronur ? 'Sales limited by holdings' : 'Sales limited by the krónur non-residents hold';
      if (cash < t.target + t.lever + t.returns) return cash < 0 ? 'Selling foreign assets to raise cash' : 'Purchases limited by cash in hand';
      return null;
    },
    explain: {
      what: 'Foreign assets the funds buy (negative: sell) with krónur, a yearly rate. Buying means selling krónur to foreigners.',
      rule: 'They close the gap between the target ({pfForeignTarget%} of assets, plus the lever, plus {psiPF} points for each point the foreign interest rate is above its normal {iF0%}) and their foreign holdings, both valued at this month’s exchange rate, at speed {lamFA} a year. A weaker króna makes the foreign share too high, so they sell some foreign assets back. They keep a cash buffer: deposits of at least {pfLiquidityFloorShare%} of their usual share of assets ({dPF0%}, less when the foreign target is raised). They buy only with cash above that buffer, at most about 63% of it in a month (the liquidity speed, {liquiditySpeed} a year), after paying for new government bonds. When their deposits are below the buffer they sell foreign assets instead, raising about 63% of the shortfall in a month, so their deposits climb back smoothly. They sell no more than they hold, nor more than non-residents can pay for with about 63% of their krónur; bank bonds cover the rest.',
    },
  },
  {
    id: 'bankBondPurchases',
    target: 'bankBondPurchases',
    category: 'BEHAVIOUR',
    inputs: [...CASH_INPUTS, 'bondIssuePF', 'foreignAssetPurchases'],
    params: ['bbSh0', 'lamReb', ...CASH_PARAMS],
    stocks: [['bankBonds', 'PF'], ...CASH_STOCKS],
    terms: terms(
      ['target', 'Toward their usual share of bank bonds', 'broad-money', bankBondTarget],
      ['foreignShift', 'Making room for more (or fewer) foreign assets', 'funded-pensions', bankBondShift],
      ['cash', 'Cash left above their buffer (negative: cash still to raise)', 'funded-pensions', (c) => pfCash(c, ['bondIssuePF', 'foreignAssetPurchases'])],
    ),
    // Buy only with cash left above the buffer; let run off what foreign sales could not raise, but
    // no more than they hold.
    combine: (t, c) => Math.max(Math.min(t.target + t.foreignShift, t.cash), -c.stock('bankBonds', 'PF') / c.dt),
    regime: (c, _v, t) => {
      const cash = cashLeft(t.cash);
      if (Math.min(t.target + t.foreignShift, cash) < -c.stock('bankBonds', 'PF') / c.dt) return 'Run-off limited by holdings';
      if (cash < t.target + t.foreignShift) return cash < 0 ? 'Letting bank bonds run off to raise cash' : 'Purchases limited by cash in hand';
      return null;
    },
    concepts: ['broad-money'],
    explain: {
      what: 'Bank bonds the funds buy from banks (negative: let run off). Paying cancels the funds’ deposits, so broad money shrinks.',
      rule: 'They close the gap to {bbSh0%} of assets at speed {lamReb} a year. When the foreign-allocation lever or higher rates abroad raise the foreign target, the bank-bond target shrinks in proportion to the rest of the portfolio, so bank bonds run off to pay for foreign assets. They buy only with the cash above their buffer that new government bonds and foreign assets left. When their deposits are below the buffer and selling foreign assets does not raise enough (they have none left, or non-residents lack the krónur to pay), they let bank bonds run off to cover the rest.',
    },
  },
  {
    id: 'bondPurchasesPF',
    target: 'bondPurchasesPF',
    category: 'BEHAVIOUR',
    inputs: [...CASH_INPUTS, 'bondIssuePF', 'foreignAssetPurchases', 'bankBondPurchases', 'bondIssueB'],
    params: ['lamReb', ...CASH_PARAMS],
    stocks: [['govBonds', 'PF'], ['govBonds', 'B'], ...CASH_STOCKS],
    terms: terms(
      ['deposits', 'Deposits above their usual share', 'bond-buyers', (c) => gapRate(c.p('lamReb'), c.dt) * (c.stock('deposits', 'PF') - c.p('dPF0') * c.v('pensionFundAssets'))],
      ['foreignShift', 'Smaller (or larger) cash buffer as foreign assets take more (or less) room', 'funded-pensions', (c) => -gapRate(c.p('lamReb'), c.dt) * c.p('dPF0') * domesticShift(c) * c.v('pensionFundAssets')],
      ['cash', 'Cash left above their buffer', 'funded-pensions', (c) => pfCash(c, ['bondIssuePF', 'foreignAssetPurchases', 'bankBondPurchases'])],
    ),
    // Buy only with cash left above the buffer and only bonds banks still hold; sell only bonds
    // they hold after this month's buyback.
    combine: (t, c) => {
      const want = t.deposits + t.foreignShift;
      if (want > 0) return Math.min(want, pos(t.cash), bondsBanksCanSell(c));
      return Math.max(want, -pfBondsToSell(c));
    },
    regime: (c, _v, t) => {
      const want = t.deposits + t.foreignShift;
      const [cash, fromBanks] = [pos(t.cash), bondsBanksCanSell(c)];
      if (want > Math.min(cash, fromBanks)) return fromBanks <= cash ? 'Limited by the bonds banks hold' : 'Purchases limited by cash in hand';
      return want < -pfBondsToSell(c) ? 'Sales limited by holdings' : null;
    },
    concepts: ['bond-buyers'],
    explain: {
      what: 'Government bonds the funds buy from banks when they have more deposits than they like (negative: sell bonds to raise cash).',
      rule: 'They close the gap between their deposits and {dPF0%} of assets (less in proportion when the lever or higher rates abroad raise the foreign target) at speed {lamReb} a year, by trading bonds with banks. They buy only with the cash above their buffer that their other purchases left, and only bonds banks hold. They sell only bonds they hold.',
    },
  },
];

export const pensions: ModuleDef = {
  id: 'pensions',
  label: 'Pension funds',
  description: 'Contributions, pension rights, payouts, credited returns and retirement; the funds’ portfolio, foreign assets and the foreign-allocation lever.',
  requires: ['structure', 'labour-and-wages', 'banks', 'government', 'firms', 'mortgages', 'external'],
  params: pickParams(ALL_PARAMS, ['payout', 'ageing', 'lamPFnw', 'lamPFinc', 'lamFA', 'lamReb', 'nwPF0', 'pfForeignTarget', 'pfForeignShift', 'pfForeignRatePass', 'psiPF', 'bbSh0', 'dPF0', 'pfLiquidityFloorShare', 'conTarget', 'pfAssets', 'pfForeignShare', 'pfDepShare', 'pfNWshare', 'eShareW', 'pfGovShare']),
  vars,
  rules,
  flows: [
    {
      id: 'privateContributions',
      label: 'Pension contributions (private employers)',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: FIRMS.map((j) => ({ from: j, to: 'PF', amount: `pensionContrib${j}` })),
      concepts: ['funded-pensions'],
      explain: { what: 'Firms pay the employer and employee pension contributions to the pension funds. Public employers pay theirs inside the spending channels.' },
    },
    {
      id: 'rightsEarned',
      label: 'Pension rights earned',
      kind: 'accrual',
      account: 'current',
      posting: { type: 'accrue', instrument: 'pensionRights' },
      legs: [{ from: 'PF', to: 'HW', amount: 'pensionContributions' }],
      concepts: ['pension-entitlements', 'accrual-vs-cash'],
      explain: { what: 'Contributions give working-age members new pension rights: the funds owe them more. No money moves in this flow.' },
    },
    {
      id: 'pensionPayouts',
      label: 'Pension payouts',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'redeem', instrument: 'pensionRights' },
      legs: [{ from: 'PF', to: 'HO', amount: 'pensionPayouts' }],
      concepts: ['funded-pensions', 'pension-entitlements'],
      explain: { what: 'Pension funds pay pensions into older households’ deposits; the pensioners’ rights shrink by the same amount.' },
    },
    {
      id: 'returnsToRights',
      label: 'Returns credited to pension rights',
      kind: 'accrual',
      account: 'current',
      posting: { type: 'accrue', instrument: 'pensionRights' },
      legs: [
        { from: 'PF', to: 'HW', amount: 'returnsCreditedHW' },
        { from: 'PF', to: 'HO', amount: 'returnsCreditedHO' },
      ],
      concepts: ['pension-entitlements', 'accrual-vs-cash'],
      explain: { what: 'Pension funds credit their investment income, and slowly their gains and losses, to members’ rights. No money moves.' },
    },
    {
      id: 'retirement',
      label: 'Retirement: rights move to pensioners',
      kind: 'revaluation',
      account: 'other',
      posting: { type: 'revalue', instrument: 'pensionRights' },
      legs: [{ from: 'HW', to: 'HO', amount: 'rightsRetiring' }],
      concepts: ['intergenerational-flows'],
      explain: { what: 'As members retire, their pension rights move from the working-age group to the older group: a reclassification between households, not a payment.' },
    },
    {
      id: 'foreignAssetIncome',
      label: 'Income on pension funds’ foreign assets',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'W', to: 'PF', amount: 'foreignAssetIncome' }],
      explain: { what: 'Dividends and interest from the funds’ foreign portfolio, arriving in krónur.' },
    },
    {
      id: 'foreignAssetPurchases',
      label: 'Pension funds’ foreign investment',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'issue', instrument: 'foreignAssets' },
      legs: [{ from: 'PF', to: 'W', amount: 'foreignAssetPurchases' }],
      concepts: ['funded-pensions', 'floating-exchange-rate'],
      explain: { what: 'Pension funds sell krónur to buy foreign assets: their deposits pass to non-residents, who then hold more krónur, which pushes the króna down.' },
    },
    {
      id: 'bankBondPurchases',
      label: 'Bank-bond purchases',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'issue', instrument: 'bankBonds' },
      legs: [{ from: 'PF', to: 'B', amount: 'bankBondPurchases' }],
      concepts: ['broad-money'],
      explain: { what: 'Pension funds buy covered bonds from banks. Their deposits turn into bank bonds, so broad money shrinks.' },
    },
    {
      id: 'bondPurchasesPF',
      label: 'Pension funds’ bond trades',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'trade', instrument: 'govBonds' },
      legs: [{ from: 'PF', to: 'B', amount: 'bondPurchasesPF' }],
      concepts: ['bond-buyers'],
      explain: { what: 'Pension funds buy government bonds from banks with surplus deposits, or sell them to raise cash.' },
    },
  ],
  levers: [
    {
      id: 'pfForeign',
      label: 'Pension funds’ foreign allocation',
      group: 'Economy',
      section: 'Pension funds',
      kind: 'setting',
      unit: 'pp of assets',
      default: 0,
      min: -20,
      max: 20,
      step: 1,
      binds: { param: 'pfForeignShift', mode: 'add', scale: 0.01 },
      description: 'Shifts the target foreign share of pension assets; funds move toward it through new flows, selling krónur.',
      definition:
        'Level shift in the target foreign share, in percentage points of assets, persistent while set. Funds close the gap at 0.5 a year, so most of the buying happens over two to three years. Setting it back to 0 makes them sell foreign assets back toward the old share.',
      concepts: ['funded-pensions', 'floating-exchange-rate'],
    },
  ],
  tests: [
    {
      id: 'rights-stationary',
      label: 'At baseline payouts = contributions + fund income, so pension rights are constant',
      run: (e) => {
        const gap = e.baseline('pensionPayouts') - e.baseline('pensionContributions') - e.baseline('pfIncome');
        return { pass: Math.abs(gap) < 1e-9, detail: `payouts − contributions − income = ${gap.toExponential(2)}` };
      },
    },
    {
      id: 'retirement-moves-rights',
      label: 'Retirement moves rights from working-age members to pensioners without changing what the funds owe',
      run: (e) => {
        const ke = e as unknown as { stock(i: string, p: string): number };
        const owed0 = ke.stock('pensionRights', 'PF');
        e.step(12);
        const owed1 = ke.stock('pensionRights', 'PF');
        const moved = e.value('rightsRetiring');
        return { pass: moved > 1 && Math.abs(owed1 - owed0) < 1e-9, detail: `rights moved ${moved.toFixed(3)}% of GDP a year; funds owe ${owed0.toFixed(6)} → ${owed1.toFixed(6)}` };
      },
    },
  ],
};
