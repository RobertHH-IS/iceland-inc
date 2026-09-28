/**
 * Iceland Inc.: the 34 charts of engine v1 (legacy/v1-engine/src/60_series.js), with the same ids,
 * grouped into four chart tabs. Every chart shows a deviation from the steady-state baseline.
 */
import type { IndicatorCtx, IndicatorDef, ModuleDef } from '../../../core/types.ts';
import { AGE_LABEL, AGES } from '../util.ts';

const MONEY_HOLDERS = ['HY', 'HW', 'HO', 'FD', 'FX', 'PF'];
const PF_ASSETS = ['deposits', 'govBonds', 'indexedBonds', 'bankBonds', 'mortgagesN', 'mortgagesI', 'shares', 'foreignAssets'];
const pfAssets = (c: IndicatorCtx) => PF_ASSETS.reduce((s, ins) => s + c.stock(ins, 'PF'), 0);
const pct = '% vs baseline';
const pp = 'pp vs baseline';
const ppGDP = 'pp of GDP';

const I = (x: Omit<IndicatorDef, 'unit'> & { unit?: string }): IndicatorDef => ({ unit: x.display === 'deviation-pct' ? pct : x.display === 'deviation-pp' ? pp : ppGDP, ...x });

export const indicators: ModuleDef = {
  id: 'indicators',
  label: 'Charts',
  description: 'The 34 headline charts of engine v1, grouped into Overview, People, Money and credit, and Government and world.',
  requires: ['structure', 'labour-and-wages', 'prices', 'households', 'mortgages', 'firms', 'banks', 'central-bank', 'government', 'pensions', 'external', 'housing'],
  indicators: [
    /* ------------------------------------------------------------ Overview */
    I({ id: 'output', label: 'Output (real GDP)', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('output'), description: 'Everything produced in Iceland in a year, at baseline prices. Output follows demand; capacity pressure shows up in prices.', drivers: ['output', 'realConsumption', 'investmentReal', 'exportVolume', 'importVolume'], concepts: ['multiplier', 'steady-state-baseline'] }),
    I({ id: 'inflation', label: 'Inflation (12-month CPI)', group: 'Overview', display: 'deviation-pp', compute: (c) => c.v('inflation12'), description: 'How much consumer prices rose over the past 12 months. The baseline has zero inflation.', drivers: ['inflation12', 'cpi', 'domesticPrice', 'importPrice', 'housingCost'], concepts: ['markup-pricing', 'cost-pass-through', 'exchange-rate-pass-through'] }),
    I({ id: 'keyRate', label: 'Key interest rate', group: 'Overview', display: 'deviation-pp', compute: (c) => c.v('keyRate'), description: 'The central bank’s policy rate.', drivers: ['keyRate', 'ruleRate'], concepts: ['taylor-rule'] }),
    I({ id: 'unemployment', label: 'Unemployment rate', group: 'Overview', display: 'deviation-pp', compute: (c) => c.v('unemployment'), description: 'Share of the labour force without a job. Part of any change in jobs is met by migration.', drivers: ['unemployment', 'employmentTotal'], concepts: ['okun-law', 'migration-buffer'] }),
    I({ id: 'priceLevel', label: 'Consumer price level', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('cpi'), description: 'The consumer price index.', drivers: ['cpi'], concepts: ['markup-pricing'] }),
    I({ id: 'expInflation', label: 'Expected inflation', group: 'Overview', display: 'deviation-pp', compute: (c) => c.v('expectedInflation'), description: 'The inflation people expect: it feeds into wage demands and real interest rates.', drivers: ['expectedInflation', 'adaptiveInflation'], concepts: ['adaptive-expectations', 'anchored-expectations'] }),
    I({ id: 'consumption', label: 'Household consumption (real)', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('realConsumption'), description: 'What households spend on goods and services, adjusted for prices.', drivers: ['consumptionY', 'consumptionW', 'consumptionO', 'cpi'], concepts: ['consumption-function', 'habit-persistence'] }),
    I({ id: 'investment', label: 'Investment (real)', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('investmentReal'), description: 'Spending by firms and the government on buildings, machines and infrastructure.', drivers: ['investmentFD', 'investmentFX'], concepts: ['investment-accelerator', 'policy-lags'] }),
    I({ id: 'realWage', label: 'Real wages', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('wage') / c.v('cpi'), description: 'Wage rates divided by consumer prices: what a wage buys.', drivers: ['wage', 'cpi', 'wageGrowth'], concepts: ['real-wages', 'wage-phillips-curve'] }),
    I({ id: 'profitsFD', label: 'Profits, domestic-market firms (real)', group: 'Overview', display: 'deviation-pct', compute: (c) => (c.v('profitsFD') - c.v('corporateTaxFD')) / c.v('cpi'), description: 'After-tax profits of retail, services and construction firms, adjusted for prices.', drivers: ['profitsFD', 'corporateTaxFD'], concepts: ['profit-squeeze'] }),
    I({ id: 'profitsFX', label: 'Profits, exporters (real)', group: 'Overview', display: 'deviation-pct', compute: (c) => (c.v('profitsFX') - c.v('corporateTaxFX')) / c.v('cpi'), description: 'After-tax profits of fish, aluminium and tourism firms, adjusted for prices. A weaker króna lifts fish and aluminium revenue at once.', drivers: ['profitsFX', 'corporateTaxFX'], concepts: ['profit-squeeze', 'export-sectors'] }),
    /* -------------------------------------------------------------- People */
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
    I({ id: 'realHousePrice', label: 'Real house prices', group: 'People', display: 'deviation-pct', compute: (c) => c.v('realHousePrice'), description: 'House prices relative to consumer prices. They follow household income, the flow of mortgage credit and real mortgage rates.', drivers: ['logRealHousePrice'], concepts: ['credit-and-house-prices'] }),
    /* ---------------------------------------------------- Money and credit */
    I({ id: 'mortgageRate', label: 'Non-indexed mortgage rate', group: 'Money and credit', display: 'deviation-pp', compute: (c) => c.v('mortgageRateN'), description: 'Interest rate on non-indexed mortgages: the key rate plus a spread and a premium when bank capital runs short.', drivers: ['mortgageRateN', 'keyRate', 'loanPremium'], concepts: ['interest-distribution', 'bank-capital'] }),
    I({
      id: 'broadMoney',
      label: 'Broad money (bank deposits)',
      group: 'Money and credit',
      display: 'deviation-pct',
      compute: (c) => MONEY_HOLDERS.reduce((s, pl) => s + c.stock('deposits', pl), 0),
      description: 'All bank deposits of households, firms and pension funds. No formula sets it: it is whatever lending, repayments, bond purchases, taxes and spending leave in deposit accounts.',
      drivers: ['mortgageLendingY', 'mortgageLendingW', 'borrowingFD', 'borrowingFX', 'bondIssueB', 'bondIssueCB', 'bankBondPurchases'],
      concepts: ['broad-money', 'endogenous-money', 'money-destruction'],
    }),
    I({ id: 'creditImpulse', label: 'Credit impulse (mortgages)', group: 'Money and credit', display: 'deviation', compute: (c) => c.v('creditImpulse'), description: 'Change in the yearly flow of net new mortgage credit compared with a year earlier. Positive means credit is accelerating.', drivers: ['creditImpulse', 'netMortgageLending'], concepts: ['credit-impulse'] }),
    I({ id: 'creditImpulseTotal', label: 'Credit impulse (households + firms)', group: 'Money and credit', display: 'deviation', compute: (c) => c.v('creditImpulseTotal'), description: 'The credit impulse including firms’ borrowing, which is noisier.', drivers: ['creditImpulseTotal', 'netCreditTotal'], concepts: ['credit-impulse'] }),
    I({ id: 'netMortgage', label: 'Net new mortgage lending', group: 'Money and credit', display: 'deviation', unit: '% of GDP', compute: (c) => c.v('netMortgageLending'), description: 'New mortgages minus repayments, at an annual rate.', drivers: ['netMortgageLendingY', 'netMortgageLendingW'], concepts: ['endogenous-money', 'debt-service-constraint'] }),
    I({
      id: 'mortgageDebt',
      label: 'Mortgage debt / GDP',
      group: 'Money and credit',
      display: 'deviation',
      compute: (c) => ((c.stock('mortgagesN', 'B') + c.stock('mortgagesI', 'B') + c.stock('mortgagesN', 'PF') + c.stock('mortgagesI', 'PF')) / c.v('nominalGDP')) * 100,
      description: 'Household mortgage debt relative to a year’s GDP. It rises with net lending and with CPI indexation of indexed loans.',
      drivers: ['netMortgageLending', 'indexation_HY_B', 'indexation_HW_B', 'nominalGDP'],
      concepts: ['indexation', 'endogenous-money'],
    }),
    I({ id: 'bankCapital', label: 'Bank capital ratio', group: 'Money and credit', display: 'deviation-pp', compute: (c) => c.v('capitalRatio'), description: 'Bank equity divided by risk-weighted loans. Retained profit rebuilds it; dividends are cut when it is short.', drivers: ['capitalRatio', 'bankEquity', 'bankDividends'], concepts: ['bank-capital'] }),
    I({ id: 'pfAssets', label: 'Pension-fund assets (real)', group: 'Money and credit', display: 'deviation-pct', compute: (c) => pfAssets(c) / c.v('cpi'), description: 'Total assets of the pension funds, adjusted for prices. Foreign assets gain when the króna weakens.', drivers: ['pensionContributions', 'pensionPayouts', 'revaluationForeignAssets'], concepts: ['funded-pensions'] }),
    I({ id: 'pfForeignShare', label: 'Pension funds’ foreign share', group: 'Money and credit', display: 'deviation-pp', compute: (c) => c.stock('foreignAssets', 'PF') / pfAssets(c), description: 'Share of pension assets invested abroad. It moves toward its target through new flows; revaluations shift it too.', drivers: ['foreignAssetPurchases', 'revaluationForeignAssets'], concepts: ['funded-pensions', 'floating-exchange-rate'] }),
    /* --------------------------------------------------- Government and world */
    I({ id: 'govBalance', label: 'Government balance', group: 'Government and world', display: 'deviation', compute: (c) => (c.v('govBalance') / c.v('nominalGDP')) * 100, description: 'Revenue minus spending, % of GDP, on an accrual basis: indexation of indexed debt counts as spending.', drivers: ['deficit', 'bondIndexation'], concepts: ['sectoral-balances', 'automatic-stabilisers'] }),
    I({ id: 'govDebt', label: 'Government debt / GDP', group: 'Government and world', display: 'deviation', compute: (c) => ((c.stock('govBonds', 'G') + c.stock('indexedBonds', 'G')) / c.v('nominalGDP')) * 100, description: 'Government bonds outstanding relative to a year’s GDP. Rises with deficits and with indexation of indexed bonds.', drivers: ['bondIssue', 'deficit', 'bondIndexation', 'nominalGDP'], concepts: ['deficits-and-money', 'fiscal-rule'] }),
    I({ id: 'incomeTaxRate', label: 'Income-tax rate', group: 'Government and world', display: 'deviation-pp', compute: (c) => c.v('taxRate'), description: 'Average personal income-tax rate: baseline + lever + the slow debt-tied rule.', drivers: ['taxRate', 'taxRuleAdjustment'], concepts: ['fiscal-rule'] }),
    I({ id: 'krona', label: 'Króna value', group: 'Government and world', display: 'deviation-pct', unit: '% vs baseline (+ stronger)', compute: (c) => 1 / c.v('exchangeRate'), description: 'What a króna buys in foreign currency. It moves toward a level set by prices, the interest gap with abroad, foreigners’ króna holdings and sentiment.', drivers: ['logExchangeRate'], concepts: ['floating-exchange-rate', 'carry-trade', 'purchasing-power-parity'] }),
    I({ id: 'currentAccount', label: 'Current account', group: 'Government and world', display: 'deviation', compute: (c) => (c.v('currentAccount') / c.v('nominalGDP')) * 100, description: 'Exports minus imports plus net income from abroad, % of GDP. Positive means Iceland lends to the world.', drivers: ['currentAccount', 'exportValue', 'importVolume'], concepts: ['current-account'] }),
    I({ id: 'exports', label: 'Exports (real)', group: 'Government and world', display: 'deviation-pct', compute: (c) => c.v('exportVolume'), description: 'Volume of goods and services sold abroad. Fish and aluminium are capacity-bound; tourism and other exports react to the real exchange rate.', drivers: ['exportVolumeFish', 'exportVolumeAluminium', 'exportVolumeTourism', 'exportVolumeOther'], concepts: ['export-sectors', 'real-exchange-rate'] }),
    I({ id: 'imports', label: 'Imports (real)', group: 'Government and world', display: 'deviation-pct', compute: (c) => c.v('importVolume'), description: 'Volume of goods and services bought from abroad; cheaper when the króna is strong.', drivers: ['importVolume', 'importsConsumer', 'importsInputs', 'importsEquipment'], concepts: ['import-leakage'] }),
  ],
};
