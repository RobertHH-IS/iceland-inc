/**
 * Iceland Inc.: the rest of the world (v1 equations E7–E9, E12, E14, E22, E39 and E44).
 *
 * The króna moves toward a level set by relative prices (purchasing-power parity), the
 * interest-rate gap with abroad (carry), how many krónur non-residents already hold (portfolio
 * balance) and sentiment. Parity is a slow anchor: the target follows domestic prices at once, but
 * world prices only as a slowly moving anchor absorbs them, over years. Each exporter sells one export line (decision 0003): fish
 * and aluminium are priced in foreign currency at their own world prices, tourism and other
 * exports in krónur. Volumes react to relative prices, tourism most and aluminium least: for
 * tourism and other exports to the real exchange rate, because a weaker króna makes them cheaper
 * abroad; for fish and aluminium, which sell at world prices, to their own world price in krónur
 * against domestic costs, because that is what makes them more profitable.
 * Imports are split by what they are for and who pays for them, and each exporter buys domestic
 * inputs from retail and service firms. Foreign assets are revalued when the króna moves, and
 * non-resident carry traders buy or sell government bonds as the rate gap changes.
 */
import type { Ctx, Id, ModuleDef, RuleDef, TermDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { EXPORTERS, FIRM_NAME, gapRate, pickParams, sum, terms, lastMonth, type Exporter } from '../util.ts';
import { bondsBanksCanSell } from './banks.ts';

/** Export lines: [key, seller, baseline volume, elasticity, what, price in foreign currency (null: krónur)]. */
const EXPORTS = [
  ['Fish', 'XF', 'xFish', 'eFish', 'marine products', 'fishPrice'],
  ['Aluminium', 'XA', 'xAlu', 'eAlu', 'aluminium', 'aluminiumPrice'],
  ['Tourism', 'XT', 'xTour', 'eTour', 'tourism', null],
  ['Other', 'XO', 'xOther', 'eOther', 'other goods and services', null],
] as const;

/** What moves each line's volume besides the real exchange rate. */
const DEMAND: Record<string, { params: Id[]; f: (c: Ctx) => number; label: string; rule: string; why: string }> = {
  Fish: { params: ['foreignDemandShift', 'fdWeightFish'], f: (c) => 1 + c.p('fdWeightFish') * c.p('foreignDemandShift'), label: 'Foreign demand (lightly: catches are capped by quotas)', rule: ' × (1 + {fdWeightFish} × the foreign-demand lever)', why: 'catches are set by quotas, so volumes barely react' },
  Aluminium: { params: [], f: () => 1, label: 'Capacity (the smelters run flat out)', rule: '', why: 'the smelters run at capacity and sell at a dollar price, so volumes hardly react' },
  Tourism: { params: ['tourismShift'], f: (c) => 1 + c.p('tourismShift'), label: 'Foreign visitors (the tourism lever)', rule: ' × (1 + the tourism lever)', why: 'visitors react more than any other buyer' },
  Other: { params: ['foreignDemandShift'], f: (c) => 1 + c.p('foreignDemandShift'), label: 'Foreign demand', rule: ' × (1 + the foreign-demand lever)', why: 'buyers in competitive markets react strongly' },
};

/** What a line priced abroad earns in krónur against domestic costs, smoothed like the real
 *  exchange rate (1 at baseline): the world price of fish or aluminium × the exchange rate ÷
 *  domestic prices. */
const profitabilityOf = (k: string) => `profitability${k}`;

const exportRules: RuleDef[] = EXPORTS.flatMap(([k, seller, base0, elas, what, price]): RuleDef[] => [
  ...(price
    ? [
        {
          id: profitabilityOf(k),
          target: profitabilityOf(k),
          category: 'BEHAVIOUR',
          inputs: ['exchangeRate', price, 'domesticPrice'],
          adjust: { speed: 'lamRer', form: 'exponential' },
          terms: terms([
            'relativePrice',
            `World ${k === 'Fish' ? 'fish' : 'aluminium'} price in krónur ÷ domestic prices`,
            'real-exchange-rate',
            (c) => (c.v('exchangeRate') * c.v(price)) / c.v('domesticPrice'),
          ]),
          concepts: ['real-exchange-rate', 'export-sectors'],
          explain: {
            what: `How well exporting ${what} pays: what the ${FIRM_NAME[seller]}’ sales earn in krónur against their costs at home (1 at baseline).`,
            rule: `Moves toward the world ${k === 'Fish' ? 'fish' : 'aluminium'} price × the exchange rate ÷ domestic prices at speed {lamRer} a year, as the real exchange rate does: producers take time to respond.`,
          },
        } satisfies RuleDef,
      ]
    : []),
  {
    id: `exportVolume${k}`,
    target: `exportVolume${k}`,
    category: 'BEHAVIOUR',
    inputs: [price ? profitabilityOf(k) : 'realExchangeRate'],
    params: [base0, elas, ...DEMAND[k].params],
    terms: terms(
      ['normal', 'Baseline volume', undefined, (c) => c.p(base0)],
      ['demand', DEMAND[k].label, 'export-sectors', DEMAND[k].f],
      [
        'competitiveness',
        price ? `Profitability: the world ${k === 'Fish' ? 'fish' : 'aluminium'} price in krónur ÷ domestic prices` : 'Real exchange rate',
        'real-exchange-rate',
        (c) => Math.pow(Math.max(1e-6, c.v(price ? profitabilityOf(k) : 'realExchangeRate')), c.p(elas)),
      ],
    ),
    combine: (t) => t.normal * Math.max(0, t.demand) * t.competitiveness,
    concepts: ['export-sectors', 'real-exchange-rate'],
    explain: {
      what: `Volume of ${what} exports, sold by ${FIRM_NAME[seller]}, at baseline prices.`,
      rule: price
        ? `Volume = baseline {${base0}}${DEMAND[k].rule} × (profitability)^{${elas}}, where profitability is the world ${k === 'Fish' ? 'fish' : 'aluminium'} price in krónur ÷ domestic prices. ${FIRM_NAME[seller][0].toUpperCase() + FIRM_NAME[seller].slice(1)} sell at world prices in foreign currency, so a weaker króna does not make their ${what} cheaper abroad; it raises what they earn in krónur compared with their costs at home, as a higher world ${k === 'Fish' ? 'fish' : 'aluminium'} price does, which lifts volume a little. ${DEMAND[k].why[0].toUpperCase() + DEMAND[k].why.slice(1)}.`
        : `Volume = baseline {${base0}}${DEMAND[k].rule} × (real exchange rate)^{${elas}}. A weaker real króna makes Icelandic ${what} cheaper abroad; ${DEMAND[k].why}.`,
    },
  },
  {
    id: `exports${k}`,
    target: `exports${k}`,
    category: 'IDENTITY',
    inputs: [`exportVolume${k}`, ...(price ? ['exchangeRate', price] : ['domesticPrice'])],
    compute: (c) => c.v(`exportVolume${k}`) * (price ? c.v('exchangeRate') * c.v(price) : c.v('domesticPrice')),
    concepts: price ? ['exchange-rate-pass-through', 'export-sectors'] : ['export-sectors'],
    explain: {
      what: `What foreigners pay ${FIRM_NAME[seller]} for ${what}, in krónur.`,
      rule: price
        ? `Value = volume × the world ${k === 'Fish' ? 'fish' : 'aluminium'} price × the exchange rate: priced in foreign currency, so a weaker króna raises the króna value at once.`
        : 'Value = volume × domestic prices: priced in krónur.',
    },
  },
]);

/** Imports by what they are for (the aggregates; the legs below say who pays). */
const IMPORTS = [
  ['Consumer', 'consumer goods'],
  ['Inputs', 'inputs to domestic production'],
  ['Equipment', 'machinery and equipment'],
  ['Public', 'goods bought for public services'],
  ['Exporters', 'exporters’ inputs (alumina, anodes, fuel)'],
] as const;
const X_IMPORTS: Record<Exporter, string> = { XF: 'fuel, fishing gear and packaging', XA: 'alumina, carbon anodes and coke', XT: 'jet fuel, imported food and aircraft services', XO: 'materials, components and services' };
const X_INPUTS: Record<Exporter, string> = { XF: 'port services, transport, repairs and packaging', XA: 'electricity, maintenance and services', XT: 'food, transport and services', XO: 'energy, transport and business services' };
const mOf = (j: Exporter) => (j === 'XO' ? 'mXO' : `m${j}`);
const volOf = (j: Exporter) => `exportVolume${EXPORTS.find((e) => e[1] === j)![0]}`;

/** Non-residents' króna deposits at the end of this month before any bond trade: what Iceland's
 *  current account and pension funds' foreign purchases add to (or take from) them. */
const wDepositsBeforeTrade = (c: Ctx) => c.stock('deposits', 'W') + c.dt * (c.v('foreignAssetPurchases') - c.v('currentAccount'));
/** The least they keep in deposits: the share wDepositFloorShare of their baseline deposit share
 *  of króna holdings. */
const wDepositFloor = (c: Ctx) => ((c.p('wDepositFloorShare') * c.p('depW')) / (c.p('depW') + c.p('bondW'))) * (wDepositsBeforeTrade(c) + c.stock('govBonds', 'W'));
/** The carry trade: toward normal holdings, and more when Icelandic rates are high relative to abroad
 *  (the key rate against its normal nominal level i0 + piT, the foreign rate against iF0). */
const wNormal = (c: Ctx) => gapRate(c.p('lamBW'), c.dt) * (c.p('bW0') * c.v('nominalGDP') - c.stock('govBonds', 'W'));
const wCarry = (c: Ctx) => gapRate(c.p('lamBW'), c.dt) * c.p('bW0') * c.v('nominalGDP') * c.p('psiB') * (c.v('keyRate') - (c.p('i0') + c.p('piT')) - (c.v('foreignRate') - c.p('iF0')));
/** Króna cash they can put into bonds this month (a yearly rate): the share 1 − e^(−liquiditySpeed ×
 *  dt) of their deposits above the floor, after this month's payments. Below the floor it is
 *  negative: the bonds they sell to rebuild their deposits, closing the same share of the shortfall,
 *  and always at least enough to keep the deposits from going below zero. One smooth limit for
 *  buying and selling, so they do not switch between the two from month to month (review E1). */
const wCash = (c: Ctx) => Math.min(gapRate(c.p('liquiditySpeed'), c.dt) * (wDepositsBeforeTrade(c) - wDepositFloor(c)), wDepositsBeforeTrade(c) / c.dt);
/** Government bonds banks can still sell non-residents this month, after the buyback and the
 *  purchases of pension funds and older households. */
const wFromBanks = (c: Ctx) => Math.max(0, bondsBanksCanSell(c) - Math.max(0, c.v('bondPurchasesPF')) - Math.max(0, c.v('bondPurchasesHO')));

/** Non-residents' deposits after this month's payments and bond trade. */
const wDepositsAfterTrade = (c: Ctx) => wDepositsBeforeTrade(c) - c.dt * c.v('bondPurchasesW');

/** Relative price factor for home-market import volumes: (real exchange rate)^−epsM. */
const rq = (c: { v(id: string): number; p(id: string): number }) => Math.pow(Math.max(1e-6, c.v('realExchangeRate')), -c.p('epsM'));

const vars: VarDef[] = [
  { id: 'worldPrice', label: 'World prices', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'Foreign-currency prices of imports, fish and aluminium (1 at baseline).' },
  { id: 'fishPrice', label: 'World fish prices', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'Foreign-currency prices of Icelandic marine products (1 at baseline).' },
  { id: 'aluminiumPrice', label: 'World aluminium price', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'The aluminium price in foreign currency (1 at baseline).' },
  { id: 'foreignRate', label: 'Foreign interest rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('foreignRate') },
  { id: 'kronaSentiment', label: 'Króna sentiment', unit: 'log points', kind: 'ratio', scale: 'none', initial: 0, description: 'A shift in what investors think the króna is worth; positive means a weaker króna.' },
  { id: 'sentimentShock', label: 'Króna sentiment shock this month', unit: 'log points', kind: 'ratio', scale: 'none', initial: 0, description: 'A one-off change in sentiment; zero in every month without one.' },
  { id: 'worldPriceAnchor', label: 'World prices the króna has adjusted to (log)', unit: 'log points', kind: 'state', scale: 'none', initial: 0, description: 'The level of world prices that purchasing-power parity has so far built into the króna’s target, in logs (0 at baseline). It catches up with world prices over years.' },
  { id: 'logExchangeRate', label: 'Exchange rate (log)', unit: 'log points', kind: 'ratio', scale: 'none', initial: 0 },
  { id: 'exchangeRate', label: 'Exchange rate', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'Krónur per unit of foreign currency (1 at baseline); up means a weaker króna.' },
  { id: 'realExchangeRate', label: 'Real exchange rate (as trade sees it)', unit: 'index', kind: 'price', scale: 'none', initial: 1, description: 'Foreign prices in krónur ÷ domestic prices, smoothed; up means Iceland is cheaper.' },
  ...EXPORTS.flatMap(([k, , , , what, price]): VarDef[] =>
    price ? [{ id: profitabilityOf(k), label: `Profitability of ${what} exports`, unit: 'index', kind: 'price', scale: 'none', initial: 1, description: `The world price of ${what} in krónur ÷ domestic prices, smoothed; up means exporting ${what} pays better.` }] : [],
  ),
  ...EXPORTS.flatMap(([k, , , , what]): VarDef[] => [
    { id: `exportVolume${k}`, label: `Exports of ${what} (real)`, unit: '% of GDP/yr', kind: 'quantity', scale: 'real' },
    { id: `exports${k}`, label: `Exports of ${what}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ]),
  { id: 'exportVolume', label: 'Exports (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('exportVolume') },
  { id: 'exportValue', label: 'Exports', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('exportValue') },
  { id: 'exporterInputs', label: 'Exporters’ domestic inputs', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ...EXPORTERS.flatMap((j): VarDef[] => [
    { id: `exporterInputs${j}`, label: `Domestic inputs, ${FIRM_NAME[j]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: `imports${j}`, label: `Imported inputs, ${FIRM_NAME[j]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ]),
  { id: 'importsInputsFR', label: 'Imported inputs, retail and service firms', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'importsInputsFC', label: 'Imported inputs, builders', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ...IMPORTS.map(([k, what]): VarDef => ({ id: `imports${k}`, label: `Imports of ${what}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`imports${k}`) })),
  { id: 'importVolume', label: 'Imports (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('importVolume') },
  { id: 'revaluationFXReserves', label: 'Revaluation of FX reserves', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'revaluationForeignAssets', label: 'Revaluation of pension funds’ foreign assets', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'bondPurchasesW', label: 'Non-residents’ bond purchases', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'kronaBorrowingW', label: 'Non-residents’ króna borrowing', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  { id: 'kronaLoanInterestW', label: 'Interest on non-residents’ króna loans', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  { id: 'currentAccount', label: 'Current account', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
];

export const external: ModuleDef = {
  id: 'external',
  label: 'Rest of the world',
  description: 'The króna (PPP anchor, carry, portfolio balance, sentiment), exports by type, imports by component, foreign revaluations, carry-trade bond flows and the current account.',
  requires: ['structure', 'prices', 'central-bank', 'firms', 'government', 'households', 'pensions'],
  params: pickParams(ALL_PARAMS, [
    'xFish', 'xAlu', 'xTour', 'xOther', 'eFish', 'eAlu', 'eTour', 'eOther', 'lamRer', 'muX', 'muC', 'muD', 'muI', 'muG', 'epsM',
    'betaI', 'betaH', 'lamFX', 'lamPPP', 'lamSent', 'psiB', 'lamBW', 'iF0', 'iFnow', 'krona0', 'bW0', 'worldPrice0', 'fishPrice0', 'aluminiumPrice0',
    'foreignDemandShift', 'tourismShift', 'foreignRateShift', 'worldPriceShift', 'fishPriceShift', 'aluminiumPriceShift', 'fdWeightFish', 'bondW', 'depW', 'eqW', 'wDepositFloorShare',
    'gvaXF', 'gvaXA', 'gvaXT', 'gvaXO', 'mXF', 'mXA', 'mXT', 'mXO', 'dXF', 'dXA', 'dXT', 'dXO',
  ]),
  vars,
  rules: [
    {
      id: 'worldPrice',
      target: 'worldPrice',
      category: 'BEHAVIOUR',
      params: ['worldPrice0', 'worldPriceShift'],
      terms: terms(['normal', 'Level at the start', undefined, (c) => c.p('worldPrice0')], ['shift', 'World-prices lever', 'purchasing-power-parity', (c) => c.p('worldPrice0') * c.p('worldPriceShift')]),
      explain: { what: 'Foreign-currency prices of what Iceland imports and of fish and aluminium.', rule: 'World prices = their level at the start {worldPrice0} × (1 + the world-prices lever).' },
    },
    {
      id: 'fishPrice',
      target: 'fishPrice',
      category: 'BEHAVIOUR',
      inputs: ['worldPrice'],
      params: ['fishPrice0', 'worldPrice0', 'fishPriceShift'],
      terms: terms(
        ['world', 'World prices', 'purchasing-power-parity', (c) => (c.p('fishPrice0') * c.v('worldPrice')) / c.p('worldPrice0')],
        ['fishMarket', 'Fish-price lever', 'terms-of-trade', (c) => ((c.p('fishPrice0') * c.v('worldPrice')) / c.p('worldPrice0')) * c.p('fishPriceShift')],
      ),
      explain: { what: 'What foreign buyers pay for Icelandic fish, in foreign currency (1 at baseline).', rule: 'Fish prices = their level at the start {fishPrice0} × (world prices ÷ their level at the start) × (1 + the fish-price lever).' },
    },
    {
      id: 'aluminiumPrice',
      target: 'aluminiumPrice',
      category: 'BEHAVIOUR',
      inputs: ['worldPrice'],
      params: ['aluminiumPrice0', 'worldPrice0', 'aluminiumPriceShift'],
      terms: terms(
        ['world', 'World prices', 'purchasing-power-parity', (c) => (c.p('aluminiumPrice0') * c.v('worldPrice')) / c.p('worldPrice0')],
        ['metalMarket', 'Aluminium-price lever', 'terms-of-trade', (c) => ((c.p('aluminiumPrice0') * c.v('worldPrice')) / c.p('worldPrice0')) * c.p('aluminiumPriceShift')],
      ),
      explain: {
        what: 'The world aluminium price in foreign currency (1 at baseline), set on the London Metal Exchange.',
        rule: 'Aluminium price = its level at the start {aluminiumPrice0} × (world prices ÷ their level at the start) × (1 + the aluminium-price lever).',
      },
    },
    {
      id: 'foreignRate',
      target: 'foreignRate',
      category: 'POLICY',
      params: ['iFnow', 'foreignRateShift'],
      terms: terms(['normal', 'Foreign rate at the start', undefined, (c) => c.p('iFnow')], ['shift', 'Foreign-rate lever', 'carry-trade', (c) => c.p('foreignRateShift')]),
      explain: { what: 'Interest rates abroad, set by foreign central banks. Carry traders compare it with the key rate, and it sets the yield on the central bank’s reserves and on pension funds’ foreign bonds.', rule: 'Foreign rate = the rate at the start {iFnow%} + the foreign-rate lever.' },
    },
    {
      id: 'kronaSentiment',
      target: 'kronaSentiment',
      category: 'BEHAVIOUR',
      lagInputs: ['kronaSentiment', 'sentimentShock'],
      params: ['lamSent'],
      terms: terms(
        ['fading', 'Earlier sentiment, fading', 'floating-exchange-rate', (c) => c.lag('kronaSentiment') * Math.exp(-c.p('lamSent') * c.dt)],
        ['shock', 'New shock', 'floating-exchange-rate', (c) => c.lag('sentimentShock')],
      ),
      concepts: ['floating-exchange-rate'],
      explain: {
        what: 'A shift in what investors think the króna is worth, with no change in fundamentals. Positive means they want fewer krónur.',
        rule: 'Sentiment = last month’s sentiment, less a small share of it ({lamSent} a year: about 0.8% a month, 10% a year), + any new shock. A shock fades slowly: after five years about 60% of it is left.',
      },
    },
    {
      id: 'sentimentShock',
      target: 'sentimentShock',
      category: 'IDENTITY',
      compute: () => 0,
      explain: { what: 'A one-off change in króna sentiment, in log points.', rule: 'Zero in every month without a shock; the króna-shock lever sets it for the month it is fired.' },
    },
    {
      id: 'worldPriceAnchor',
      target: 'worldPriceAnchor',
      category: 'BEHAVIOUR',
      label: 'Purchasing-power parity, a slow anchor',
      inputs: ['worldPrice'],
      adjust: { speed: 'lamPPP', form: 'exponential' },
      terms: terms(['worldPrice', 'World prices (log)', 'purchasing-power-parity', (c) => Math.log(c.v('worldPrice'))]),
      concepts: ['purchasing-power-parity'],
      explain: {
        what: 'The level of world prices the króna’s target has adjusted to, in logs (0 at baseline).',
        rule: 'Moves toward the log of world prices at speed {lamPPP} a year, so half of any change is absorbed in about three and a half years. Purchasing-power parity pulls the króna, but slowly: the evidence puts the half-life of deviations at three to five years.',
      },
    },
    {
      id: 'logExchangeRate',
      target: 'logExchangeRate',
      category: 'BEHAVIOUR',
      label: 'The króna',
      inputs: ['kronaSentiment', 'keyRate', 'foreignRate', 'worldPriceAnchor'],
      lagInputs: ['domesticPrice'],
      params: ['betaI', 'betaH', 'i0', 'piT', 'iF0', 'krona0'],
      stocks: [
        ['deposits', 'W'],
        ['govBonds', 'W'],
      ],
      adjust: { speed: 'lamFX', form: 'exponential' },
      terms: terms(
        ['ppp', 'Relative prices (purchasing-power parity)', 'purchasing-power-parity', (c) => Math.log(lastMonth(c, 'domesticPrice')) - c.v('worldPriceAnchor')],
        ['sentiment', 'Sentiment', 'floating-exchange-rate', (c) => c.v('kronaSentiment')],
        ['carry', 'Interest-rate gap with abroad', 'carry-trade', (c) => -c.p('betaI') * (c.v('keyRate') - (c.p('i0') + c.p('piT')) - (c.v('foreignRate') - c.p('iF0')))],
        [
          'portfolio',
          'Non-residents’ króna holdings',
          'floating-exchange-rate',
          (c) => c.p('betaH') * Math.log(Math.max(0.05, (c.stock('deposits', 'W') + c.stock('govBonds', 'W')) / (Math.max(1e-6, lastMonth(c, 'domesticPrice')) * c.p('krona0')))),
        ],
      ),
      concepts: ['floating-exchange-rate', 'purchasing-power-parity'],
      explain: {
        what: 'The exchange rate in logs: krónur per unit of foreign currency. Up means a weaker króna.',
        rule: 'Moves toward a target at speed {lamFX} a year, about 63% of the way each month. Target = log of domestic prices − the world prices the króna has adjusted to + sentiment − {betaI} × the rate gap with abroad + {betaH} × log of non-residents’ real króna holdings relative to normal. The first two are purchasing-power parity: in the long run the króna keeps Icelandic goods as dear as before, so it follows domestic prices at once, but absorbs a change in world prices only over years, at {lamPPP} a year. The rate gap term is the carry trade: when Icelandic rates are high compared with rates abroad, investors buy krónur, so the króna is stronger. The holdings term is portfolio balance: the more krónur non-residents already hold, the cheaper the króna must be before they will hold more. The rate gap is the key rate above its normal level (the neutral real rate {i0%} + the inflation target {piT%}) minus the foreign interest rate above its normal level {iF0%}.',
      },
    },
    {
      id: 'exchangeRate',
      target: 'exchangeRate',
      category: 'IDENTITY',
      inputs: ['logExchangeRate'],
      compute: (c) => Math.exp(c.v('logExchangeRate')),
      concepts: ['floating-exchange-rate'],
      explain: { what: 'Krónur per unit of foreign currency (1 at baseline). Up means a weaker króna.', rule: 'Exchange rate = e^(log exchange rate).' },
    },
    {
      id: 'realExchangeRate',
      target: 'realExchangeRate',
      category: 'BEHAVIOUR',
      inputs: ['exchangeRate', 'worldPrice', 'domesticPrice'],
      adjust: { speed: 'lamRer', form: 'exponential' },
      terms: terms(['relativePrice', 'Foreign prices in krónur ÷ domestic prices', 'real-exchange-rate', (c) => (c.v('exchangeRate') * c.v('worldPrice')) / c.v('domesticPrice')]),
      concepts: ['real-exchange-rate'],
      explain: {
        what: 'How cheap Iceland is for foreigners, as trade responds to it. Up means Icelandic goods are cheaper.',
        rule: 'Moves toward exchange rate × world prices ÷ domestic prices at speed {lamRer} a year: buyers take time to switch.',
      },
    },
    ...exportRules,
    {
      id: 'exportVolume',
      target: 'exportVolume',
      category: 'IDENTITY',
      inputs: EXPORTS.map(([k]) => `exportVolume${k}`),
      terms: EXPORTS.map(([k, , , , what]): TermDef => ({ id: k.toLowerCase(), label: what, concept: 'export-sectors', compute: (c: Ctx) => c.v(`exportVolume${k}`) })),
      explain: { what: 'All exports at baseline prices.', rule: 'Sum of marine, aluminium, tourism and other export volumes.' },
    },
    {
      id: 'exportValue',
      target: 'exportValue',
      category: 'IDENTITY',
      inputs: EXPORTS.map(([k]) => `exports${k}`),
      terms: EXPORTS.map(([k, , , , what]): TermDef => ({ id: k.toLowerCase(), label: what, concept: 'export-sectors', compute: (c: Ctx) => c.v(`exports${k}`) })),
      explain: { what: 'What exporters earn from abroad, in krónur.', rule: 'Sum of the four kinds of exports.' },
    },
    ...EXPORTERS.flatMap((j): RuleDef[] => [
      {
        id: `exporterInputs${j}`,
        target: `exporterInputs${j}`,
        category: 'BEHAVIOUR',
        inputs: [volOf(j), 'domesticPrice'],
        params: [`d${j}`],
        compute: (c) => c.p(`d${j}`) * c.v(volOf(j)) * c.v('domesticPrice'),
        concepts: ['export-sectors'],
        explain: { what: `What ${FIRM_NAME[j]} buy from retail and service firms: ${X_INPUTS[j]}.`, rule: `Inputs = {d${j}} per unit of exports × domestic prices (set so their value added matches the data).` },
      },
      {
        id: `imports${j}`,
        target: `imports${j}`,
        category: 'BEHAVIOUR',
        inputs: [volOf(j), 'importPrice'],
        params: [mOf(j)],
        compute: (c) => c.v('importPrice') * c.p(mOf(j)) * c.v(volOf(j)),
        concepts: ['import-leakage'],
        explain: { what: `Imported inputs of ${FIRM_NAME[j]}: ${X_IMPORTS[j]}.`, rule: `Imports = import prices × {${mOf(j)}} per unit of exports.` },
      },
    ]),
    {
      id: 'exporterInputs',
      target: 'exporterInputs',
      category: 'IDENTITY',
      inputs: EXPORTERS.map((j) => `exporterInputs${j}`),
      terms: EXPORTERS.map((j): TermDef => ({ id: j, label: FIRM_NAME[j], concept: 'export-sectors', compute: (c: Ctx) => c.v(`exporterInputs${j}`) })),
      explain: { what: 'Everything exporters buy from retail and service firms.', rule: 'Sum over the four exporters.' },
    },
    {
      id: 'importsConsumer',
      target: 'importsConsumer',
      category: 'BEHAVIOUR',
      inputs: ['realConsumption', 'realExchangeRate', 'importPrice'],
      params: ['muC', 'epsM'],
      compute: (c) => c.v('importPrice') * c.p('muC') * c.v('realConsumption') * rq(c),
      concepts: ['import-leakage'],
      explain: { what: 'Consumer goods shops import.', rule: 'Imports = import prices × {muC} × real consumer spending × (real exchange rate)^−{epsM}.' },
    },
    {
      id: 'importsInputsFR',
      target: 'importsInputsFR',
      category: 'BEHAVIOUR',
      inputs: ['realConsumption', 'realExchangeRate', 'importPrice', ...EXPORTERS.map(volOf)],
      params: ['muD', 'maintShare', 'epsM', ...EXPORTERS.map((j) => `d${j}`)],
      compute: (c) => c.v('importPrice') * c.p('muD') * ((1 - c.p('maintShare')) * c.v('realConsumption') + c.p('dXF') * c.v('exportVolumeFish') + c.p('dXA') * c.v('exportVolumeAluminium') + c.p('dXT') * c.v('exportVolumeTourism') + c.p('dXO') * c.v('exportVolumeOther')) * rq(c),
      concepts: ['import-leakage'],
      explain: {
        what: 'Imported inputs retail and service firms use to make what they sell to households and exporters.',
        rule: 'Imports = import prices × {muD} × (their real sales to households + their real sales to exporters) × (real exchange rate)^−{epsM}.',
      },
    },
    {
      id: 'importsInputsFC',
      target: 'importsInputsFC',
      category: 'BEHAVIOUR',
      inputs: ['realConsumption', 'investmentReal', 'realExchangeRate', 'importPrice'],
      params: ['muD', 'maintShare', 'epsM'],
      compute: (c) => c.v('importPrice') * c.p('muD') * (c.v('investmentReal') + c.p('maintShare') * c.v('realConsumption')) * rq(c),
      concepts: ['import-leakage'],
      explain: { what: 'Imported inputs builders use.', rule: 'Imports = import prices × {muD} × (real investment + home repairs) × (real exchange rate)^−{epsM}.' },
    },
    {
      id: 'importsInputs',
      target: 'importsInputs',
      category: 'IDENTITY',
      inputs: ['importsInputsFR', 'importsInputsFC'],
      terms: terms(['retail', 'Retail and service firms', 'import-leakage', (c) => c.v('importsInputsFR')], ['builders', 'Builders', 'import-leakage', (c) => c.v('importsInputsFC')]),
      explain: { what: 'Imported inputs domestic firms use to make what they sell.', rule: 'Retail and service firms’ imported inputs + builders’.' },
    },
    {
      id: 'importsEquipment',
      target: 'importsEquipment',
      category: 'BEHAVIOUR',
      inputs: ['investmentReal', 'realExchangeRate', 'importPrice'],
      params: ['muI', 'epsM'],
      compute: (c) => c.v('importPrice') * c.p('muI') * c.v('investmentReal') * rq(c),
      concepts: ['import-leakage'],
      explain: { what: 'Imported machinery and equipment for investment.', rule: 'Imports = import prices × {muI} × real investment × (real exchange rate)^−{epsM}.' },
    },
    {
      id: 'importsPublic',
      target: 'importsPublic',
      category: 'BEHAVIOUR',
      inputs: ['publicPurchasesReal', 'realExchangeRate', 'importPrice'],
      params: ['muG', 'epsM'],
      compute: (c) => c.v('importPrice') * c.p('muG') * c.v('publicPurchasesReal') * rq(c),
      concepts: ['import-leakage'],
      explain: { what: 'Imported goods (medicines, equipment) behind public services.', rule: 'Imports = import prices × {muG} × real public purchases × (real exchange rate)^−{epsM}.' },
    },
    {
      id: 'importsExporters',
      target: 'importsExporters',
      category: 'IDENTITY',
      inputs: EXPORTERS.map((j) => `imports${j}`),
      terms: EXPORTERS.map((j): TermDef => ({ id: j, label: FIRM_NAME[j], concept: 'import-leakage', compute: (c: Ctx) => c.v(`imports${j}`) })),
      explain: { what: 'Alumina, anodes, fuel and other inputs exporters import.', rule: 'Sum over the four exporters. At baseline it is the TiVA share {muX} of all exports.' },
    },
    {
      id: 'importVolume',
      target: 'importVolume',
      category: 'IDENTITY',
      inputs: [...IMPORTS.map(([k]) => `imports${k}`), 'importPrice'],
      terms: IMPORTS.map(([k, what]): TermDef => {
        const im = `imports${k}`; // built once: this rule sits in the income–spending block
        return { id: k.toLowerCase(), label: what, concept: 'import-leakage', compute: (c: Ctx) => c.v(im) / c.v('importPrice') };
      }),
      explain: { what: 'All imports at baseline prices.', rule: 'Sum of the five kinds of imports, each divided by import prices.' },
    },
    {
      id: 'revaluationFXReserves',
      target: 'revaluationFXReserves',
      category: 'IDENTITY',
      inputs: ['exchangeRate'],
      lagInputs: ['exchangeRate'],
      stocks: [['fxReserves', 'CB']],
      compute: (c) => (c.stock('fxReserves', 'CB') * (c.v('exchangeRate') / c.lag('exchangeRate') - 1)) / c.dt,
      concepts: ['revaluation'],
      explain: { what: 'The change in the króna value of the central bank’s foreign reserves when the króna moves (a yearly rate).', rule: 'Revaluation = reserves × the percentage change in the exchange rate this month ÷ one month.' },
    },
    {
      id: 'revaluationForeignAssets',
      target: 'revaluationForeignAssets',
      category: 'IDENTITY',
      inputs: ['exchangeRate'],
      lagInputs: ['exchangeRate'],
      stocks: [['foreignAssets', 'PF']],
      compute: (c) => (c.stock('foreignAssets', 'PF') * (c.v('exchangeRate') / c.lag('exchangeRate') - 1)) / c.dt,
      concepts: ['revaluation'],
      explain: { what: 'The change in the króna value of pension funds’ foreign assets when the króna moves (a yearly rate).', rule: 'Revaluation = foreign assets × the percentage change in the exchange rate this month ÷ one month.' },
    },
    {
      id: 'bondPurchasesW',
      target: 'bondPurchasesW',
      category: 'BEHAVIOUR',
      label: 'Carry trade',
      inputs: ['nominalGDP', 'keyRate', 'foreignRate', 'currentAccount', 'foreignAssetPurchases', 'bondIssueB', 'bondPurchasesPF', 'bondPurchasesHO'],
      params: ['bW0', 'psiB', 'lamBW', 'i0', 'piT', 'iF0', 'depW', 'bondW', 'wDepositFloorShare', 'liquiditySpeed'],
      stocks: [
        ['govBonds', 'W'],
        ['deposits', 'W'],
        ['govBonds', 'B'],
      ],
      terms: terms(
        ['normal', 'Toward normal holdings', undefined, wNormal],
        ['carry', 'Interest-rate gap with abroad', 'carry-trade', wCarry],
        ['cash', 'Króna cash above the deposits they keep (negative: cash to raise)', 'floating-exchange-rate', wCash],
      ),
      // Buy only with króna cash above the deposits they keep, and only bonds banks still hold after
      // pension funds' and older households' purchases; sell toward that floor when below it; sell
      // only bonds they hold.
      combine: (t, c) => {
        const want = Math.min(t.normal + t.carry, t.cash);
        return Math.max(want > 0 ? Math.min(want, wFromBanks(c)) : want, -c.stock('govBonds', 'W') / c.dt);
      },
      regime: (c, _v, t) => {
        const want = Math.min(t.normal + t.carry, t.cash);
        if (want < -c.stock('govBonds', 'W') / c.dt) return 'Sales limited by holdings';
        if (want > wFromBanks(c)) return 'Limited by the bonds banks hold';
        if (t.cash < t.normal + t.carry) return t.cash < 0 ? 'Selling bonds to keep enough króna cash' : 'Purchases limited by cash in hand';
        return null;
      },
      concepts: ['carry-trade'],
      explain: {
        what: 'Government bonds non-residents buy from banks (negative: sell), paying with their króna deposits.',
        rule: 'They want bonds worth {bW0} of GDP × (1 + {psiB} × the rate gap with abroad), and close the gap to their holdings at speed {lamBW} a year. The rate gap is the key rate above its normal nominal level ({i0%} + the inflation target {piT%}) minus the foreign rate above its normal {iF0%}. They also keep at least {wDepositFloorShare%} of their usual share of króna holdings in deposits ({wDepositFloorShare%} of {depW} ÷ ({depW} + {bondW})). They buy only with deposits above that, at most about 63% of them in a month (the liquidity speed, {liquiditySpeed} a year), and only bonds banks hold. When this month’s payments for exports, income and pension funds’ foreign sales take their deposits below it, they sell bonds to banks instead, raising about 63% of the shortfall in a month, and always enough to keep their deposits above zero. They sell only bonds they hold.',
      },
    },
    {
      id: 'kronaBorrowingW',
      target: 'kronaBorrowingW',
      category: 'BEHAVIOUR',
      label: 'Non-residents’ króna borrowing',
      inputs: ['nominalGDP', 'foreignAssetPurchases', 'currentAccount', 'bondPurchasesW'],
      params: ['depW', 'bondW', 'wDepositFloorShare', 'liquiditySpeed'],
      stocks: [
        ['deposits', 'W'],
        ['govBonds', 'W'],
        ['kronaLoansW', 'W'],
      ],
      terms: terms(
        ['shortfall', 'What this month’s payments and bond trade would overdraw (negative: deposits left)', 'endogenous-money', (c) => -wDepositsAfterTrade(c) / c.dt],
        ['repayable', 'About 63% of deposits above what they keep (negative: below it)', 'money-destruction', (c) => gapRate(c.p('liquiditySpeed'), c.dt) * (wDepositsAfterTrade(c) - wDepositFloor(c))],
        ['owed', 'What they owe', 'endogenous-money', (c) => c.stock('kronaLoansW', 'W') / c.dt],
      ),
      // Borrow exactly what would be overdrawn; otherwise repay from deposits above what they keep,
      // never more than they owe. (An overdraft leaves nothing above the floor, so the two never meet.)
      combine: (t) => Math.max(0, t.shortfall) - Math.min(t.owed, Math.max(0, t.repayable)),
      regime: (_c, v) => (v > 0 ? 'Borrowing krónur to cover an overdraft' : v < 0 ? 'Repaying króna loans' : null),
      concepts: ['current-account', 'endogenous-money'],
      explain: {
        what: 'Krónur non-residents borrow from Icelandic banks (negative: repay). It happens only when they have no government bonds left to sell and a month’s payments, for Iceland’s exports and the income it earns abroad, would overdraw their deposits.',
        rule: 'Borrowing = whatever this month’s payments and bond trade would take their deposits below zero, so they never go negative. Repayment = at most about 63% a month (the liquidity speed, {liquiditySpeed} a year) of their deposits above the share they keep ({wDepositFloorShare%} of their usual deposit share), and never more than they owe. The loan creates a deposit, as any bank loan does, and repaying destroys one. They pay the key rate on it.',
      },
    },
    {
      id: 'kronaLoanInterestW',
      target: 'kronaLoanInterestW',
      category: 'CONTRACT',
      inputs: ['keyRate'],
      stocks: [['kronaLoansW', 'W']],
      compute: (c) => c.v('keyRate') * c.stock('kronaLoansW', 'W'),
      concepts: ['interest-distribution'],
      explain: { what: 'Interest non-residents pay Icelandic banks on króna loans.', rule: 'Interest = key rate × what they owe.' },
    },
    {
      id: 'currentAccount',
      target: 'currentAccount',
      category: 'IDENTITY',
      inputs: [
        'exportValue', ...IMPORTS.map(([k]) => `imports${k}`), 'fxReserveIncome', 'foreignAssetIncome', 'kronaLoanInterestW', 'depositInterestW', 'bondInterestW', 'dividendsAbroad',
      ],
      terms: terms(
        ['exports', 'Exports', 'export-sectors', (c) => c.v('exportValue')],
        ['imports', 'Imports', 'import-leakage', (c) => -IMPORTS.reduce((s, [k]) => s + c.v(`imports${k}`), 0)],
        ['incomeIn', 'Income on foreign assets', 'current-account', (c) => c.v('fxReserveIncome') + c.v('foreignAssetIncome') + c.v('kronaLoanInterestW')],
        ['incomeOut', 'Interest and dividends paid abroad', 'current-account', (c) => -(c.v('depositInterestW') + c.v('bondInterestW') + c.v('dividendsAbroad'))],
      ),
      concepts: ['current-account', 'sectoral-balances'],
      explain: {
        what: 'Iceland’s income from the rest of the world minus its payments to it. Positive means Iceland lends to the world.',
        rule: 'Current account = exports − imports + income on foreign reserves and pension funds’ foreign assets + interest on non-residents’ króna loans − interest and dividends paid to non-residents.',
      },
    },
  ],
  flows: [
    {
      id: 'exports',
      label: 'Exports',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: EXPORTS.map(([k, seller]) => ({ from: 'W', to: seller, amount: `exports${k}` })),
      concepts: ['export-sectors'],
      explain: { what: 'Foreigners pay fisheries, smelters, tourism firms and other exporters, out of their króna deposits.' },
    },
    {
      id: 'exporterPurchases',
      label: 'Exporters’ domestic inputs',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: EXPORTERS.map((j) => ({ from: j, to: 'FR', amount: `exporterInputs${j}` })),
      concepts: ['export-sectors'],
      explain: { what: 'Exporters buy energy, transport, food and services from retail and service firms (smelters buy power, hotels buy food).' },
    },
    {
      id: 'imports',
      label: 'Imports',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [
        { from: 'FR', to: 'W', amount: 'importsConsumer' },
        { from: 'FR', to: 'W', amount: 'importsInputsFR' },
        { from: 'FR', to: 'W', amount: 'importsPublic' },
        { from: 'FC', to: 'W', amount: 'importsEquipment' },
        { from: 'FC', to: 'W', amount: 'importsInputsFC' },
        ...EXPORTERS.map((j) => ({ from: j, to: 'W', amount: `imports${j}` })),
      ],
      concepts: ['import-leakage'],
      explain: { what: 'Firms pay foreigners for imported consumer goods, inputs, machinery, supplies for public services and exporters’ alumina, anodes and fuel. The krónur end up in non-residents’ deposits.' },
    },
    {
      id: 'revaluationFXReserves',
      label: 'Revaluation of FX reserves',
      kind: 'revaluation',
      account: 'other',
      posting: { type: 'revalue', instrument: 'fxReserves' },
      legs: [{ from: 'W', to: 'CB', amount: 'revaluationFXReserves' }],
      concepts: ['revaluation'],
      explain: { what: 'When the króna weakens, the central bank’s foreign reserves are worth more krónur. A change in value, not a payment.' },
    },
    {
      id: 'revaluationForeignAssets',
      label: 'Revaluation of foreign pension assets',
      kind: 'revaluation',
      account: 'other',
      posting: { type: 'revalue', instrument: 'foreignAssets' },
      legs: [{ from: 'W', to: 'PF', amount: 'revaluationForeignAssets' }],
      concepts: ['revaluation', 'funded-pensions'],
      explain: { what: 'When the króna weakens, pension funds’ foreign assets are worth more krónur. A change in value, not a payment.' },
    },
    {
      id: 'kronaBorrowingW',
      label: 'Non-residents’ króna borrowing',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'issue', instrument: 'kronaLoansW' },
      legs: [{ from: 'B', to: 'W', amount: 'kronaBorrowingW' }],
      concepts: ['endogenous-money', 'current-account'],
      explain: { what: 'Icelandic banks lend non-residents krónur when they have none left to pay for Iceland’s exports: the loan creates their deposit. Repaying cancels it.' },
    },
    {
      id: 'kronaLoanInterestW',
      label: 'Interest on non-residents’ króna loans',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'W', to: 'B', amount: 'kronaLoanInterestW' }],
      concepts: ['interest-distribution'],
      explain: { what: 'Non-residents pay Icelandic banks interest on their króna loans, out of their króna deposits.' },
    },
    {
      id: 'bondPurchasesW',
      label: 'Carry trade in government bonds',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'trade', instrument: 'govBonds' },
      legs: [{ from: 'W', to: 'B', amount: 'bondPurchasesW' }],
      concepts: ['carry-trade'],
      explain: { what: 'Foreign investors buy government bonds from banks with their króna deposits; the deposits are cancelled, so broad money held abroad shrinks.' },
    },
  ],
  levers: [
    {
      id: 'foreignDemand',
      label: 'Foreign demand',
      group: 'World',
      section: 'World economy',
      kind: 'setting',
      unit: '%',
      default: 0,
      min: -20,
      max: 20,
      step: 1,
      binds: { param: 'foreignDemandShift', mode: 'add', scale: 0.01 },
      description: 'Demand abroad for Icelandic goods and services other than tourism and aluminium: it moves other exporters one for one and fisheries lightly.',
      definition:
        'Level shift in foreign demand, in percent of baseline, applied at once and persistent while set: other exporters’ volume moves by the full percentage and marine volume by 0.3 of it (catches are capped by quotas). Tourism has its own lever and the smelters run at capacity. Setting it back to 0 returns demand to baseline.',
      concepts: ['export-sectors'],
    },
    {
      id: 'tourism',
      label: 'Tourism',
      group: 'World',
      section: 'World economy',
      kind: 'setting',
      unit: '%',
      default: 0,
      min: -60,
      max: 30,
      step: 5,
      binds: { param: 'tourismShift', mode: 'add', scale: 0.01 },
      description: 'Foreign visitors’ spending: it drives the tourism sector.',
      definition: 'Level shift in tourism export volume (what foreign visitors buy), in percent of baseline, applied at once and persistent while set. Tourism firms’ revenue, jobs and imports follow. Setting it back to 0 ends it.',
      concepts: ['export-sectors'],
    },
    {
      id: 'kronaShock',
      label: 'Króna sentiment shock',
      group: 'World',
      section: 'World economy',
      kind: 'oneoff',
      unit: '%',
      default: -10,
      min: -25,
      max: 25,
      step: 1,
      description: 'A one-off shift in what investors think the króna is worth. Negative means a weaker króna.',
      definition:
        'One-off shift in the króna’s target value by this percentage (−10: a target 10% weaker), fired once. The króna falls by most of it within a quarter (−10: about 8% by month 3). Then the rate gap and non-residents’ holdings pull it back, so about half the fall is gone after a year (about 4% weaker at month 12) and most of it after two. The shift in the target itself fades at about 10% of its size a year. Prices, rates and trade respond.',
      concepts: ['floating-exchange-rate', 'exchange-rate-pass-through'],
      fire: (s, size) => s.setLagged('sentimentShock', s.get('sentimentShock') - Math.log(1 + size / 100)),
    },
    {
      id: 'foreignRate',
      label: 'Foreign interest rate',
      group: 'World',
      section: 'World economy',
      kind: 'setting',
      unit: 'pp',
      default: 0,
      min: -3,
      max: 5,
      step: 0.25,
      binds: { param: 'foreignRateShift', mode: 'add', scale: 0.01 },
      description: 'Interest rates abroad; a higher rate pulls carry money and pension savings out of krónur, so the króna weakens.',
      definition:
        'Level shift in the foreign interest rate, in percentage points, applied at once and persistent while set. The rate gap with abroad narrows, so carry traders sell króna bonds and pension funds raise their foreign target by 1 point of assets per point: the króna weakens for the first three years (about 0.9% on average over the first two per point on Automatic). It also raises the yield on the central bank’s reserves and on the funds’ foreign bonds (not their shares), and so the profit the central bank hands to the government. That extra income, spent at home, strengthens the króna slowly: after about three and a half years it is stronger than at the start, and the drift does not level off. Per point held, the króna is about 2–2.5% stronger after ten years and 5–6% after twenty on Automatic (3–3.5% and 9–11.5% on Manual), and the price level about 3% lower after twenty years (6–6.5% on Manual), with inflation still below baseline. This is a known gap (decision 0002 §6): the model has no steady state with a lasting surplus of foreign income. Setting it back to 0 ends it.',
      concepts: ['carry-trade'],
    },
    {
      id: 'importPrices',
      label: 'World prices',
      group: 'World',
      section: 'World economy',
      kind: 'setting',
      unit: '%',
      default: 0,
      min: -20,
      max: 40,
      step: 1,
      binds: { param: 'worldPriceShift', mode: 'add', scale: 0.01 },
      description: 'Foreign-currency prices of imports and of fish and aluminium.',
      definition:
        'Level shift in world prices in foreign currency, in percent, applied at once and persistent while set. Fish and aluminium revenue in krónur jumps at once and import prices in krónur follow within a year or two. What buyers pay for imported goods rises by less, since part of it is the Icelandic cost of getting the goods to them: +10 raises consumer prices about 2% within a year and 2.8% within two on Automatic. The króna strengthens only slowly, over several years, as purchasing-power parity absorbs the new world prices, which takes back part of the rise in krónur. Setting it back to 0 ends it.',
      concepts: ['exchange-rate-pass-through', 'purchasing-power-parity'],
    },
    {
      id: 'fishPrices',
      label: 'World fish prices',
      group: 'World',
      section: 'World economy',
      kind: 'setting',
      unit: '%',
      default: 0,
      min: -30,
      max: 30,
      step: 1,
      binds: { param: 'fishPriceShift', mode: 'add', scale: 0.01 },
      description: 'What foreign buyers pay for Icelandic fish, in foreign currency.',
      definition:
        'Level shift in the world price of marine products, in percent, on top of the world-prices lever; applied at once and persistent while set. Catches are fixed by quotas, so the change goes straight into fisheries’ revenue and profit. Setting it back to 0 ends it.',
      concepts: ['terms-of-trade', 'export-sectors', 'resource-rent', 'dutch-disease'],
    },
    {
      id: 'aluminiumPrice',
      label: 'World aluminium price',
      group: 'World',
      section: 'World economy',
      kind: 'setting',
      unit: '%',
      default: 0,
      min: -40,
      max: 40,
      step: 1,
      binds: { param: 'aluminiumPriceShift', mode: 'add', scale: 0.01 },
      description: 'The aluminium price on world markets, in dollars.',
      definition:
        'Level shift in the world aluminium price, in percent, on top of the world-prices lever; applied at once and persistent while set. The smelters produce at capacity, so revenue moves one for one while their alumina bill does not, and their foreign owners take almost all of the extra profit. Setting it back to 0 ends it.',
      concepts: ['terms-of-trade', 'export-sectors', 'resource-rent', 'current-account'],
    },
  ],
  tests: [
    {
      id: 'current-account-balanced',
      label: 'At baseline the current account is balanced, so non-residents’ króna holdings are steady',
      run: (e) => {
        const ca = e.baseline('currentAccount');
        return { pass: Math.abs(ca) < 1e-9, detail: `current account ${ca.toExponential(2)}` };
      },
    },
    {
      id: 'depreciation-revalues-foreign-assets',
      label: 'A weaker króna revalues pension funds’ foreign assets without any payment',
      run: (e) => {
        const fa0 = e.balanceSheet('PF').assets.find((a) => a.instrument === 'foreignAssets')!.value;
        e.fire('kronaShock', -10);
        e.step(1);
        const fa1 = e.balanceSheet('PF').assets.find((a) => a.instrument === 'foreignAssets')!.value;
        const rev = e.value('revaluationForeignAssets') / 12;
        const buy = e.value('foreignAssetPurchases') / 12;
        const gap = fa1 - fa0 - rev - buy;
        return { pass: rev > 0 && Math.abs(gap) < 1e-9, detail: `revaluation +${rev.toFixed(3)}, purchases ${buy.toFixed(3)}, unexplained ${gap.toExponential(2)} (% of GDP)` };
      },
    },
    {
      id: 'sector-exports-sum',
      label: 'The four exporters’ revenue adds up to total exports, at baseline and after shocks to the króna, world prices and tourism',
      run: (e) => {
        const gaps: number[] = [];
        const check = () => {
          const legs = e.legs().filter((l) => l.flow === 'exports');
          const bySeller = EXPORTERS.map((j) => legs.filter((l) => l.to === j).reduce((s, l) => s + l.value, 0));
          gaps.push(Math.abs(sum(bySeller) - e.value('exportValue')), Math.abs(sum(EXPORTS.map(([k]) => e.value(`exportVolume${k}`))) - e.value('exportVolume')));
        };
        check();
        e.fire('kronaShock', -10);
        e.setLever('fishPrices', 10);
        e.setLever('aluminiumPrice', -15);
        e.setLever('tourism', -20);
        e.step(18);
        check();
        const worst = Math.max(...gaps);
        const sellers = new Set(e.legs().filter((l) => l.flow === 'exports').map((l) => l.to));
        return { pass: worst < 1e-12 && sellers.size === 4, detail: `largest gap between the sectors’ sum and the total ${worst.toExponential(2)}; exports now ${e.value('exportValue').toFixed(3)}% of GDP, sold by ${[...sellers].join(', ')}` };
      },
    },
    {
      id: 'tourism-lever-hits-tourism',
      label: 'The tourism lever moves tourism far more than the other exporters',
      run: (e) => {
        e.setLever('tourism', -30);
        e.step(12);
        const pct = (j: Exporter) => 100 * (e.value(`valueAdded${j}`) / e.baseline(`valueAdded${j}`) - 1);
        const xt = pct('XT');
        const others = (['XF', 'XA', 'XO'] as const).map(pct);
        const worstOther = Math.max(...others.map(Math.abs));
        return { pass: xt < -20 && Math.abs(xt) > 5 * worstOther, detail: `real value added after 12 months: tourism ${xt.toFixed(1)}%, fisheries ${others[0].toFixed(2)}%, aluminium ${others[1].toFixed(2)}%, other exporters ${others[2].toFixed(2)}%` };
      },
    },
  ],
};
