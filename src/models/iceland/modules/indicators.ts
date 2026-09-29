/**
 * Iceland Inc.: the 34 charts of engine v1 (legacy/v1-engine/src/60_series.js), with the same ids,
 * grouped into four chart tabs, plus a fifth tab of charts by firm sector (decision 0003). Every
 * chart shows a deviation from the steady-state baseline. The v1 charts of domestic firms' and
 * exporters' profits keep their ids and are now sums over the sectors in each group.
 *
 * Charts in "% of GDP" divide by nominal GDP, so they share one scale when prices move: flows by
 * this month's GDP (at an annual rate), debt stocks by GDP over the past 12 months (gdpTrailing12),
 * as official statistics do.
 */
import type { IndicatorCtx, IndicatorDef, ModuleDef } from '../../../core/types.ts';
import { AGE_LABEL, AGES, DOMESTIC, EXPORT_OF, EXPORTERS, FIRMS, FIRM_NAME, type Firm } from '../util.ts';

const MONEY_HOLDERS = ['HY', 'HW', 'HO', ...FIRMS, 'PF'];
/** Real after-tax profit of a set of sectors. */
const realProfit = (c: IndicatorCtx, js: readonly Firm[]) => js.reduce((s, j) => s + c.v(`profits${j}`) - c.v(`corporateTax${j}`), 0) / c.v('cpi');
const Cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const SECTOR_NOTE: Record<Firm, string> = {
  FC: 'They sell all business and public investment, so they ride the investment cycle.',
  FR: 'The biggest sector: shops, services, utilities and property, selling to households, public services, builders and exporters.',
  XF: 'Catches are mostly quota-bound, so profit moves with world fish prices and the króna; volume responds only a little.',
  XA: 'Foreign-owned smelters with a small wage bill: profit moves with the aluminium price and the króna, and most of it goes abroad.',
  XT: 'The most labour-intensive exporter and the most sensitive to the real exchange rate.',
  XO: 'Pharma, data centres, software, freight and business services, sold in competitive markets.',
};
const PF_ASSETS = ['deposits', 'govBonds', 'indexedBonds', 'bankBonds', 'mortgagesN', 'mortgagesI', 'shares', 'foreignAssets'];
const pfAssets = (c: IndicatorCtx) => PF_ASSETS.reduce((s, ins) => s + c.stock(ins, 'PF'), 0);
const pct = '% vs baseline';
const pp = 'pp vs baseline';
const ppGDP = 'pp of GDP';

const I = (x: Omit<IndicatorDef, 'unit'> & { unit?: string }): IndicatorDef => ({ unit: x.display === 'deviation-pct' ? pct : x.display === 'deviation-pp' ? pp : ppGDP, ...x });

export const indicators: ModuleDef = {
  id: 'indicators',
  label: 'Charts',
  description: 'The 34 headline charts of engine v1, grouped into Overview, People, Money and credit, and Government and world, and 17 charts by firm sector: exports, profits and jobs, and profits paid abroad.',
  requires: ['structure', 'labour-and-wages', 'prices', 'households', 'mortgages', 'firms', 'banks', 'central-bank', 'government', 'pensions', 'external', 'housing'],
  indicators: [
    /* ------------------------------------------------------------ Overview */
    I({ id: 'output', label: 'Output (real GDP)', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('output'), description: 'Everything produced in Iceland in a year, at baseline prices. Output follows demand; capacity pressure shows up in prices.', drivers: ['output', 'realConsumption', 'investmentReal', 'exportVolume', 'importVolume'], concepts: ['multiplier', 'steady-state-baseline'] }),
    I({ id: 'inflation', label: 'Inflation (12-month CPI)', group: 'Overview', display: 'deviation-pp', compute: (c) => c.v('inflation12'), description: 'How much consumer prices rose over the past 12 months. The baseline has zero inflation.', drivers: ['inflation12', 'cpi', 'domesticPrice', 'importPrice', 'housingCost'], concepts: ['markup-pricing', 'cost-pass-through', 'exchange-rate-pass-through'] }),
    I({ id: 'keyRate', label: 'Key interest rate', group: 'Overview', display: 'deviation-pp', compute: (c) => c.v('keyRate'), description: 'The central bank’s policy rate: where you set it (stabilisers on Manual), or the rule’s rate plus your offset (Automatic).', drivers: ['keyRate', 'ruleRate'], concepts: ['taylor-rule'] }),
    I({ id: 'unemployment', label: 'Unemployment rate', group: 'Overview', display: 'deviation-pp', compute: (c) => c.v('unemployment'), description: 'Share of the labour force without a job. Part of any change in jobs is met by migration.', drivers: ['unemployment', 'employmentTotal'], concepts: ['okun-law', 'migration-buffer'] }),
    I({ id: 'priceLevel', label: 'Consumer price level', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('cpi'), description: 'The consumer price index.', drivers: ['cpi'], concepts: ['markup-pricing'] }),
    I({ id: 'expInflation', label: 'Expected inflation', group: 'Overview', display: 'deviation-pp', compute: (c) => c.v('expectedInflation'), description: 'The inflation people expect: it feeds into wage demands and real interest rates.', drivers: ['expectedInflation', 'adaptiveInflation'], concepts: ['adaptive-expectations', 'anchored-expectations'] }),
    I({ id: 'consumption', label: 'Household consumption (real)', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('realConsumption'), description: 'What households spend on goods and services, adjusted for prices.', drivers: ['consumptionY', 'consumptionW', 'consumptionO', 'consumptionDeflator'], concepts: ['consumption-function', 'habit-persistence'] }),
    I({ id: 'investment', label: 'Investment (real)', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('investmentReal'), description: 'Spending by firms and the government on buildings, machines and infrastructure.', drivers: FIRMS.map((j) => `investment${j}`), concepts: ['investment-accelerator', 'policy-lags'] }),
    I({ id: 'realWage', label: 'Real wages', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('wage') / c.v('cpi'), description: 'Wage rates divided by consumer prices: what a wage buys.', drivers: ['wage', 'cpi', 'wageGrowth'], concepts: ['real-wages', 'wage-phillips-curve'] }),
    I({ id: 'profitsFD', label: 'Profits, domestic firms (real)', group: 'Overview', display: 'deviation-pct', compute: (c) => realProfit(c, DOMESTIC), description: 'After-tax profits of builders and of retail and service firms together, adjusted for prices.', drivers: DOMESTIC.flatMap((j) => [`profits${j}`, `corporateTax${j}`]), concepts: ['profit-squeeze'] }),
    I({ id: 'profitsFX', label: 'Profits, exporters (real)', group: 'Overview', display: 'deviation-pct', compute: (c) => realProfit(c, EXPORTERS), description: 'After-tax profits of fisheries, aluminium smelters, tourism and other exporters together, adjusted for prices. A weaker króna lifts fish and aluminium revenue at once.', drivers: EXPORTERS.flatMap((j) => [`profits${j}`, `corporateTax${j}`]), concepts: ['profit-squeeze', 'export-sectors'] }),
    /* -------------------------------------------------------------- People */
    I({ id: 'employment', label: 'Jobs, all sectors', group: 'People', display: 'deviation-pct', compute: (c) => c.v('employmentTotal'), description: 'All jobs, in firms and public services, measured at baseline wages. Unemployment can rise while jobs do too, when more people join the labour force.', drivers: ['employmentTotal', ...FIRMS.map((j) => `employment${j}`), 'publicEmployment'], concepts: ['okun-law', 'migration-buffer'] }),
    ...AGES.map((g) =>
      I({
        id: `unemployment${g}`,
        label: `Unemployment, ${AGE_LABEL[g]}`,
        group: 'People',
        display: 'deviation-pp',
        compute: (c) => c.v(`unemployment${g}`),
        description: g === 'Y' ? 'Unemployment among 18–34 year olds, who take the largest share of job gains and losses.' : g === 'W' ? 'Unemployment among 35–66 year olds.' : 'Unemployment among over-67s who still work.',
        drivers: [`unemployment${g}`, `employment${g}`, `unemployed${g}`],
        concepts: ['okun-law'],
      }),
    ),
    ...AGES.map((g) =>
      I({
        id: `rdi${g}`,
        label: `Real disposable income, ${AGE_LABEL[g]}`,
        group: 'People',
        display: 'deviation-pct',
        compute: (c) => c.v(`disposableIncome${g}`) / c.v('cpi'),
        description:
          g === 'O'
            ? 'Cash income of over-67s after tax, including pensions, interest and dividends, adjusted for prices.'
            : `Cash income of the ${AGE_LABEL[g]} after tax and mortgage interest (the cash part), adjusted for prices.`,
        drivers: [`netLabourIncome${g}`, `propertyIncome${g}`, 'cpi'],
        concepts: ['borrowers-and-savers', 'intergenerational-flows'],
      }),
    ),
    I({ id: 'realHousePrice', label: 'Real house prices', group: 'People', display: 'deviation-pct', compute: (c) => c.v('realHousePrice'), description: 'House prices relative to consumer prices. They follow household income, the flow of mortgage credit, real mortgage rates and the number of people who have moved to Iceland.', drivers: ['logRealHousePrice', 'settledMigrants'], concepts: ['credit-and-house-prices'] }),
    /* ---------------------------------------------------- Money and credit */
    I({ id: 'mortgageRate', label: 'Non-indexed mortgage rate', group: 'Money and credit', display: 'deviation-pp', compute: (c) => c.v('mortgageRateN'), description: 'Interest rate on non-indexed mortgages: the key rate plus a spread and a premium when bank capital runs short.', drivers: ['mortgageRateN', 'keyRate', 'loanPremium'], concepts: ['interest-distribution', 'bank-capital'] }),
    I({
      id: 'broadMoney',
      label: 'Broad money (bank deposits)',
      group: 'Money and credit',
      display: 'deviation-pct',
      compute: (c) => MONEY_HOLDERS.reduce((s, pl) => s + c.stock('deposits', pl), 0),
      description: 'All bank deposits of households, firms and pension funds. No formula sets it: it is whatever lending, repayments, bond purchases, taxes and spending leave in deposit accounts.',
      drivers: ['mortgageLendingY', 'mortgageLendingW', ...FIRMS.map((j) => `borrowing${j}`), 'bondIssueB', 'bondIssueCB', 'bankBondPurchases'],
      concepts: ['broad-money', 'endogenous-money', 'money-destruction'],
    }),
    I({ id: 'creditImpulse', label: 'Credit impulse (mortgages)', group: 'Money and credit', display: 'deviation', compute: (c) => (c.v('creditImpulse') / c.v('nominalGDP')) * 100, description: 'Change in the yearly flow of net new mortgage credit compared with a year earlier, % of GDP. Positive means credit is accelerating.', drivers: ['creditImpulse', 'netMortgageLending', 'nominalGDP'], concepts: ['credit-impulse'] }),
    I({ id: 'creditImpulseTotal', label: 'Credit impulse (households + firms)', group: 'Money and credit', display: 'deviation', compute: (c) => (c.v('creditImpulseTotal') / c.v('nominalGDP')) * 100, description: 'The credit impulse including firms’ borrowing, which is noisier, % of GDP.', drivers: ['creditImpulseTotal', 'netCreditTotal', 'nominalGDP'], concepts: ['credit-impulse'] }),
    I({ id: 'netMortgage', label: 'Net new mortgage lending', group: 'Money and credit', display: 'deviation', compute: (c) => (c.v('netMortgageLending') / c.v('nominalGDP')) * 100, description: 'New mortgages minus repayments, at an annual rate, % of GDP.', drivers: ['netMortgageLendingY', 'netMortgageLendingW', 'nominalGDP'], concepts: ['endogenous-money', 'debt-service-constraint'] }),
    I({
      id: 'mortgageDebt',
      label: 'Mortgage debt / GDP',
      group: 'Money and credit',
      display: 'deviation',
      compute: (c) => ((c.stock('mortgagesN', 'B') + c.stock('mortgagesI', 'B') + c.stock('mortgagesN', 'PF') + c.stock('mortgagesI', 'PF')) / c.v('gdpTrailing12')) * 100,
      description: 'Household mortgage debt relative to GDP over the past 12 months, as official statistics measure it. It rises with net lending and with CPI indexation of indexed loans.',
      drivers: ['netMortgageLending', 'indexation_HY_B', 'indexation_HW_B', 'gdpTrailing12'],
      concepts: ['indexation', 'endogenous-money'],
    }),
    I({ id: 'bankCapital', label: 'Bank capital ratio', group: 'Money and credit', display: 'deviation-pp', compute: (c) => c.v('capitalRatio'), description: 'Bank equity divided by risk-weighted loans. Retained profit rebuilds it; dividends are cut when it is short.', drivers: ['capitalRatio', 'bankEquity', 'bankDividends'], concepts: ['bank-capital'] }),
    I({ id: 'pfAssets', label: 'Pension-fund assets (real)', group: 'Money and credit', display: 'deviation-pct', compute: (c) => pfAssets(c) / c.v('cpi'), description: 'Total assets of the pension funds, adjusted for prices. Foreign assets gain when the króna weakens.', drivers: ['pensionContributions', 'pensionPayouts', 'revaluationForeignAssets'], concepts: ['funded-pensions'] }),
    I({ id: 'pfForeignShare', label: 'Pension funds’ foreign share', group: 'Money and credit', display: 'deviation-pp', compute: (c) => c.stock('foreignAssets', 'PF') / pfAssets(c), description: 'Share of pension assets invested abroad. It moves toward its target through new flows; revaluations shift it too.', drivers: ['foreignAssetPurchases', 'revaluationForeignAssets'], concepts: ['funded-pensions', 'floating-exchange-rate'] }),
    /* --------------------------------------------------- Government and world */
    I({ id: 'govBalance', label: 'Government balance', group: 'Government and world', display: 'deviation', compute: (c) => (c.v('govBalance') / c.v('nominalGDP')) * 100, description: 'Revenue minus spending, % of GDP, on an accrual basis: indexation of indexed debt counts as spending.', drivers: ['deficit', 'bondIndexation'], concepts: ['sectoral-balances', 'automatic-stabilisers'] }),
    I({ id: 'govDebt', label: 'Government debt / GDP', group: 'Government and world', display: 'deviation', compute: (c) => ((c.stock('govBonds', 'G') + c.stock('indexedBonds', 'G')) / c.v('gdpTrailing12')) * 100, description: 'Government bonds outstanding relative to GDP over the past 12 months, as official statistics measure it. Rises with deficits and with indexation of indexed bonds.', drivers: ['bondIssue', 'deficit', 'bondIndexation', 'gdpTrailing12'], concepts: ['deficits-and-money', 'debt-feedback'] }),
    I({ id: 'incomeTaxRate', label: 'Income-tax rate', group: 'Government and world', display: 'deviation-pp', compute: (c) => c.v('taxRate'), description: 'Average personal income-tax rate. On Manual: the baseline rate + the income-tax lever. On Automatic: the baseline rate + the slow debt rule’s adjustment + your offset lever.', drivers: ['taxRate', 'taxRuleAdjustment'], concepts: ['debt-feedback'] }),
    I({ id: 'krona', label: 'Króna value', group: 'Government and world', display: 'deviation-pct', unit: '% vs baseline (+ stronger)', compute: (c) => 1 / c.v('exchangeRate'), description: 'What a króna buys in foreign currency. It moves toward a level set by prices, the interest gap with abroad, foreigners’ króna holdings and sentiment.', drivers: ['logExchangeRate'], concepts: ['floating-exchange-rate', 'carry-trade', 'purchasing-power-parity'] }),
    I({ id: 'currentAccount', label: 'Current account', group: 'Government and world', display: 'deviation', compute: (c) => (c.v('currentAccount') / c.v('nominalGDP')) * 100, description: 'Exports minus imports plus net income from abroad, % of GDP. Positive means Iceland lends to the world.', drivers: ['currentAccount', 'exportValue', 'importVolume'], concepts: ['current-account'] }),
    I({ id: 'exports', label: 'Exports (real)', group: 'Government and world', display: 'deviation-pct', compute: (c) => c.v('exportVolume'), description: 'Volume of goods and services sold abroad. Fish is mostly quota-bound and aluminium capacity-bound, so their volumes respond only a little to profitability; tourism and other exports react to the real exchange rate.', drivers: ['exportVolumeFish', 'exportVolumeAluminium', 'exportVolumeTourism', 'exportVolumeOther'], concepts: ['export-sectors', 'real-exchange-rate'] }),
    I({ id: 'imports', label: 'Imports (real)', group: 'Government and world', display: 'deviation-pct', compute: (c) => c.v('importVolume'), description: 'Volume of goods and services bought from abroad; cheaper when the króna is strong.', drivers: ['importVolume', 'importsConsumer', 'importsInputs', 'importsEquipment'], concepts: ['import-leakage'] }),
    /* ------------------------------------------------------- Firms by sector */
    I({ id: 'dividendsAbroad', label: 'Profits paid to foreign owners', group: 'Firms by sector', display: 'deviation', compute: (c) => (c.v('dividendsAbroad') / c.v('nominalGDP')) * 100, description: 'Dividends exporters pay their foreign owners, % of GDP: mostly the aluminium smelters’ parents. A windfall for the smelters leaves the country here.', drivers: ['dividendsXA_W', 'dividendsXT_W', 'dividendsXO_W'], concepts: ['current-account', 'export-sectors', 'resource-rent'] }),
    ...EXPORTERS.map((j) =>
      I({
        id: `exports${j}`,
        label: `Export revenue, ${FIRM_NAME[j]}`,
        group: 'Firms by sector',
        display: 'deviation-pct',
        compute: (c) => c.v(`exports${EXPORT_OF[j]}`),
        description: `What foreigners pay ${FIRM_NAME[j]}, in krónur. ${j === 'XF' || j === 'XA' ? 'Priced in foreign currency, so it jumps when the króna weakens or world prices rise.' : 'Priced in krónur, so it moves with volumes and domestic prices.'}`,
        drivers: [`exports${EXPORT_OF[j]}`, `exportVolume${EXPORT_OF[j]}`],
        concepts: ['export-sectors', j === 'XF' || j === 'XA' ? 'exchange-rate-pass-through' : 'real-exchange-rate'],
      }),
    ),
    ...FIRMS.map((j) =>
      I({
        id: `profits${j}`,
        label: `Profits, ${FIRM_NAME[j]} (real)`,
        group: 'Firms by sector',
        display: 'deviation-pct',
        compute: (c) => realProfit(c, [j]),
        description: `After-tax profit of ${FIRM_NAME[j]}, adjusted for prices. ${SECTOR_NOTE[j]}`,
        drivers: [`profits${j}`, `corporateTax${j}`],
        concepts: ['profit-squeeze'],
      }),
    ),
    ...FIRMS.map((j) =>
      I({
        id: `jobs${j}`,
        label: `Jobs, ${FIRM_NAME[j]}`,
        group: 'Firms by sector',
        display: 'deviation-pct',
        compute: (c) => c.v(`employment${j}`),
        description: `${Cap(FIRM_NAME[j])}’ employment (their wage bill at baseline wages). It follows their own output, with a lag.`,
        drivers: [`employment${j}`, `valueAdded${j}`],
        concepts: ['okun-law'],
      }),
    ),
  ],
};
