/**
 * Iceland Inc.: the 34 charts of engine v1 (legacy/v1-engine/src/60_series.js), with the same ids,
 * grouped into four chart tabs, plus a fifth tab of charts by firm sector (decision 0003). Every
 * legacy display shows a deviation from the steady-state baseline; optional level metadata
 * adds actual nominal/real reporting without changing that legacy series. The v1 charts of domestic firms' and
 * exporters' profits keep their ids and are now sums over the sectors in each group.
 *
 * Charts in "% of GDP" divide by nominal GDP, so they share one scale when prices move: flows by
 * this month's GDP (at an annual rate), debt stocks by GDP over the past 12 months (gdpTrailing12),
 * as official statistics do.
 */
import type { IndicatorCtx, IndicatorDef, IndicatorLevelDef, ModuleDef } from '../../../core/types.ts';
import { AGE_LABEL, AGES, DOMESTIC, EXPORT_OF, EXPORTERS, FIRMS, FIRM_NAME, GDP_BN, type Firm, type Exporter } from '../util.ts';

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

/** Reporting conversions only: one model unit is 1% of 2025 nominal GDP, ISK 49.41211 bn, on every
 *  model (docs/design/today-opening.md §2). A fixed unit, never an anchor value: anchors can be
 *  overridden by a dated opening, and an amount in krónur must not depend on them. */
const isk = (_c: IndicatorCtx, amount: number) => (amount * GDP_BN) / 100;
const profit = (c: IndicatorCtx, firms: readonly Firm[]) => firms.reduce((s, j) => s + c.v(`profits${j}`) - c.v(`corporateTax${j}`), 0);
const importBill = (c: IndicatorCtx) => ['Consumer', 'Inputs', 'Equipment', 'Public', 'Exporters'].reduce((s, k) => s + c.v(`imports${k}`), 0);
const govDebtAmount = (c: IndicatorCtx) => c.stock('govBonds', 'G') + c.stock('indexedBonds', 'G');
const mortgageAmount = (c: IndicatorCtx) => ['HY', 'HW'].reduce((s, p) => s + c.stock('mortgagesN', p) + c.stock('mortgagesI', p), 0);

/** The legacy compute/display pair is untouched; only actual-level metadata is added. */
function withLevels(ind: IndicatorDef): IndicatorDef {
  const id = ind.id;
  let level: IndicatorLevelDef;
  const money = (label: string, nominal: (c: IndicatorCtx) => number, real: (c: IndicatorCtx) => number, flow = true): IndicatorLevelDef => ({
    kind: 'amount', unit: flow ? 'bn ISK a year' : 'bn ISK', realUnit: flow ? 'bn ISK a year at baseline prices' : 'bn ISK at baseline prices',
    nominalLabel: `${label} (nominal)`, realLabel: `${label} (real)`,
    description: `${label} at current prices, ${flow ? 'at an annual rate' : 'as an outstanding stock'}. Amounts are scaled to ISK billions using the solved baseline GDP and the 2025 GDP calibration.`,
    realDescription: `${label} at baseline prices. Amounts are scaled to ISK billions using the solved baseline GDP and the 2025 GDP calibration.`,
    nominal: (c) => isk(c, nominal(c)), real: (c) => isk(c, real(c)),
  });
  const index = (label: string, nominal: (c: IndicatorCtx) => number, real?: (c: IndicatorCtx) => number): IndicatorLevelDef => ({
    kind: 'index', unit: 'index, baseline = 100', rebase: true, nominalLabel: label,
    ...(real ? { realLabel: `${label.replace(/ \(nominal\)$/, '')} (real)`, real,
      description: `${label}, with the solved baseline set to 100.`,
      realDescription: `${label.replace(/ \(nominal\)$/, '')} after removing consumer-price inflation, with the solved baseline set to 100.`,
    } : {}), nominal,
  });
  if (id === 'output') {
    level = money('GDP', (c) => c.v('nominalGDP'), (c) => c.v('output'));
    level.description = 'Annual GDP at current prices, from the model’s expenditure identity: household consumption + public services + investment + exports − imports. Each component uses its own prices; consumer-price inflation is not a GDP deflator. Lower nominal GDP can reflect less output, lower prices, or both. This baseline has no background growth or inflation; in a growing economy, slower growth could still mean rising GDP.';
    level.realDescription = 'Annual GDP at baseline prices, read directly from the model’s real-output measure. This baseline has no background growth; a fall here means less output, rather than slower growth along a growing reference path.';
  } else if (id === 'potentialOutputSeen') {
    level = { kind: 'amount', unit: 'bn ISK a year at baseline prices', nominalLabel: 'Potential output (central bank estimate)', nominal: (c) => isk(c, ind.compute(c)), real: (c) => isk(c, ind.compute(c)) };
  } else if (id === 'consumption') level = money('Household consumption', (c) => c.v('consumption'), (c) => c.v('realConsumption'));
  else if (id === 'investment') level = money('Investment', (c) => FIRMS.reduce((s, j) => s + c.v(`investmentPurchase${j}`), c.v('publicInvestment')), (c) => c.v('investmentReal'));
  else if (id === 'exports') {
    level = money('Exports', (c) => c.v('exportValue'), (c) => c.v('exportVolume'));
    level.description = 'Export receipts in krónur at an annual rate. Fish and aluminium use their world prices and the exchange rate; tourism and other exports use domestic prices.';
    level.realDescription = 'Export volumes valued at baseline prices, before movements in world prices, domestic prices and the króna.';
  } else if (id === 'imports') {
    level = money('Imports', importBill, (c) => c.v('importVolume'));
    level.description = 'The annual import bill at border prices, summed across consumer goods, inputs, equipment, public purchases and exporters’ inputs.';
    level.realDescription = 'Import volumes at baseline prices. The nominal bill uses border prices, including the exchange rate, rather than consumer prices.';
  } else if (id === 'broadMoney') level = money('Broad money', ind.compute, (c) => ind.compute(c) / c.v('cpi'), false);
  else if (id === 'pfAssets') level = money('Pension-fund assets', pfAssets, (c) => pfAssets(c) / c.v('cpi'), false);
  else if (id === 'govDebtAmount') level = money('Government debt', govDebtAmount, (c) => govDebtAmount(c) / c.v('cpi'), false);
  else if (id === 'mortgageDebtAmount') level = money('Household mortgage debt', mortgageAmount, (c) => mortgageAmount(c) / c.v('cpi'), false);
  else if (id === 'profitsFD' || id === 'profitsFX' || FIRMS.some((j) => id === `profits${j}`)) {
    const firms = id === 'profitsFD' ? DOMESTIC : id === 'profitsFX' ? EXPORTERS : [id.slice(7) as Firm];
    level = money(ind.label.replace(/ \(real\)$/, ''), (c) => profit(c, firms), (c) => profit(c, firms) / c.v('cpi'));
  } else if (EXPORTERS.some((j) => id === `exports${j}`)) {
    const sector = EXPORT_OF[id.slice(7) as Exporter];
    level = money(ind.label.replace('Export revenue', 'Exports'), (c) => c.v(`exports${sector}`), (c) => c.v(`exportVolume${sector}`));
  } else if (AGES.some((g) => id === `rdi${g}`)) {
    const age = id.slice(3);
    level = money(`Total disposable income, ${AGE_LABEL[age as keyof typeof AGE_LABEL]}`, (c) => c.v(`disposableIncome${age}`), (c) => c.v(`disposableIncome${age}`) / c.v('cpi'));
  } else if (id === 'realWage') level = index('Wage index (nominal)', (c) => c.v('wage'), (c) => c.v('wage') / c.v('cpi'));
  else if (id === 'realHousePrice') level = index('House-price index (nominal)', (c) => c.v('housePrice'), ind.compute);
  else if (id === 'priceLevel') level = index('Consumer price index', ind.compute);
  else if (id === 'krona') level = index('Króna value (up = stronger)', ind.compute);
  else if (ind.display === 'deviation-pp') level = { kind: id === 'bankCapital' || id === 'pfForeignShare' ? 'ratio' : 'rate', unit: '%', scale: 100 };
  else if (ind.display === 'deviation') level = { kind: 'ratio', unit: '% of GDP' };
  else level = { kind: 'index', unit: 'index, baseline = 100', rebase: true,
    nominalLabel: `${ind.label} (index)`,
    description: `${ind.description} The level is an index with the baseline set to 100. Employment in the model is measured at baseline wages; this chart does not claim a headcount of people.`,
  };
  return { ...ind, level };
}

export const indicators: ModuleDef = {
  id: 'indicators',
  label: 'Charts',
  description: 'The original headline and sector charts, with actual nominal/real level views and separate government and mortgage debt amounts. Legacy effects remain available. Grouped into Overview, People, Money and credit, Government and world, and Firms by sector.',
  requires: ['structure', 'labour-and-wages', 'prices', 'households', 'mortgages', 'firms', 'banks', 'central-bank', 'government', 'pensions', 'external', 'housing'],
  indicators: [
    /* ------------------------------------------------------------ Overview */
    I({ id: 'output', label: 'Output (real GDP)', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('output'), description: 'Everything produced in Iceland in a year, at baseline prices. Output follows demand; capacity pressure shows up in prices.', drivers: ['output', 'realConsumption', 'investmentReal', 'exportVolume', 'importVolume'], concepts: ['multiplier', 'steady-state-baseline'] }),
    I({ id: 'potentialOutputSeen', label: 'Potential output (the central bank’s estimate from the labour market)', group: 'Overview', display: 'deviation-pct', compute: (c) => c.v('potentialOutputSeen'), description: 'What the central bank estimates the economy can produce at normal unemployment with the workers it has, read from the labour market: output less the output gap, which is Okun’s factor times how far unemployment is below normal. It follows the labour force: newcomers, workers who arrive or leave with the jobs, and spending that shifts toward services that need many staff. The gap between output and it is what the key-rate rule leans against. It is an estimate, not a count of what machines and workers could make, and firms’ pricing and investment still compare output with the fixed baseline capacity.', drivers: ['potentialOutputSeen', 'outputGap', 'output', 'unemployment'], concepts: ['capacity-utilisation', 'okun-law'] }),
    I({ id: 'inflation', label: 'Inflation (12-month CPI)', group: 'Overview', display: 'deviation-pp', compute: (c) => c.v('inflation12'), description: 'How much consumer prices rose over the past 12 months. The baseline has zero inflation. Lower positive inflation means prices still rise more slowly; negative inflation means prices fall. The consumer price index chart shows the price level.', drivers: ['inflation12', 'cpi', 'domesticPrice', 'importPrice', 'housingCost'], concepts: ['markup-pricing', 'cost-pass-through', 'exchange-rate-pass-through'] }),
    I({ id: 'keyRate', label: 'Key interest rate', group: 'Overview', display: 'deviation-pp', compute: (c) => c.v('keyRate'), description: 'The central bank’s policy rate: the inflation rule’s rate while the key-rate lever is unlocked (the default), or the level you hold while it is locked.', drivers: ['keyRate', 'ruleRate'], concepts: ['taylor-rule'] }),
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
    I({ id: 'govDebtAmount', label: 'Government debt amount', group: 'Government and world', display: 'deviation-pct', compute: govDebtAmount, description: 'Government bonds outstanding, including CPI-indexed bonds. This is the debt amount; the debt/GDP chart divides it by nominal GDP over the past 12 months.', drivers: ['bondIssue', 'deficit', 'bondIndexation'], concepts: ['deficits-and-money', 'indexation'] }),
    I({ id: 'mortgageDebtAmount', label: 'Household mortgage debt amount', group: 'Money and credit', display: 'deviation-pct', compute: mortgageAmount, description: 'Non-indexed and CPI-indexed mortgage principal owed by young and working-age households. The debt/GDP chart divides this stock by nominal GDP over the past 12 months.', drivers: ['netMortgageLending', 'indexation_HY_B', 'indexation_HW_B'], concepts: ['indexation', 'endogenous-money'] }),
    I({ id: 'incomeTaxRate', label: 'Income-tax rate', group: 'Government and world', display: 'deviation-pp', compute: (c) => c.v('taxRate'), description: 'Average personal income-tax rate. Unlocked (the default): the baseline rate + the slow debt rule’s adjustment. Locked: the baseline rate + the shift on the income-tax lever.', drivers: ['taxRate', 'taxRuleAdjustment'], concepts: ['debt-feedback'] }),
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
  ].map(withLevels),
};
