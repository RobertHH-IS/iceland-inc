/**
 * Dated reference context, never an input to the economic equations.
 * Refresh deliberately from the linked primary sources; these are not live feeds.
 */
import type { EngineClient } from '../engine-client.ts';

export const CONTEXT_VERIFIED_ON = '2026-09-30';

export type ContextStatus = 'observed' | 'derived' | 'forecast' | 'estimate' | 'model-assumption';
export interface ContextSource {
  label: string;
  url: string;
  publishedOn: string;
}
export interface ContextRow {
  id: string;
  label: string;
  value: string;
  status: ContextStatus;
  period: string;
  detail: string;
  sources?: readonly ContextSource[];
}

const source = (label: string, url: string, publishedOn: string): ContextSource => ({ label, url, publishedOn });
export const CONTEXT_SOURCES = {
  policy: source('CBI decision', 'https://cb.is/news-and-publications/article/statement-of-the-monetary-policy-committee-august-19th-2026', '2026-08-19'),
  cbiForecast: source('CBI Monetary Bulletin 2026/3', 'https://indicators.cb.is/news-and-publications/article/monetary-bulletin-2026-3', '2026-08-19'),
  cbiTables: source('CBI forecast tables', 'https://indicators.cb.is/library/?itemid=427c0b99-87a6-42c3-bce7-2d8ae742d943', '2026-08-19'),
  gdp: source('Statistics Iceland GDP release', 'https://statice.is/publications/news-archive/national-accounts/national-accounts-2nd-quarter-2026/', '2026-08-31'),
  annualGDP: source('Statistics Iceland THJ01103', 'https://px.hagstofa.is/pxen/api/v1/en/Efnahagur/thjodhagsreikningar/landsframl/1_landsframleidsla/THJ01103.px', '2026-08-31'),
  cpi: source('Statistics Iceland CPI release', 'https://statice.is/publications/news-archive/prices/consumer-price-index-in-september-2026/', '2026-09-29'),
  government: source('Statistics Iceland government finances', 'https://statice.is/publications/news-archive/public-finance/general-government-finances-2025/', '2026-09-15'),
  governmentTable: source('Statistics Iceland THJ05181', 'https://px.hagstofa.is/pxen/api/v1/en/Efnahagur/fjaropinber/fjarmal_opinber/fjarmal_opinber/THJ05181.px', '2026-09-15'),
  population: source('Statistics Iceland population release', 'https://statice.is/publications/news-archive/inhabitants/population-in-the-2nd-quarter-2026/', '2026-07-31'),
  world: source('IMF July 2026 WEO update', 'https://www.imf.org/en/publications/weo/issues/2026/07/08/world-economic-outlook-update-july-2026', '2026-07-08'),
  worldTable: source('IMF forecast table 1', 'https://www.imf.org/-/media/files/publications/weo/2026/update/july/english/text.pdf', '2026-07-08'),
  ecb: source('ECB decision', 'https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html', '2026-09-10'),
} as const;

export const ICELAND_CONTEXT: readonly ContextRow[] = [
  { id: 'policy', label: 'Central bank key rate', value: '8.00%', status: 'observed', period: 'Decision 19 August 2026; verified 30 September', detail: 'Rate on seven-day term deposits. This current policy setting is separate from the model’s starting rate.', sources: [CONTEXT_SOURCES.policy] },
  { id: 'gdp-actual-annual', label: 'Real GDP growth, latest full year', value: '+1.1%', status: 'observed', period: '2025 versus 2024; revised August 2026', detail: 'Revised national accounts: +1.0857%, rounded. Earlier releases and the August CBI forecast used +1.3%.', sources: [CONTEXT_SOURCES.annualGDP, CONTEXT_SOURCES.gdp] },
  { id: 'gdp-actual-quarter', label: 'Real GDP growth, latest quarter', value: '−1.1%', status: 'observed', period: 'Q2 2026 versus Q2 2025', detail: 'First estimate, not seasonally adjusted. First-half growth was +1.3%; seasonally adjusted Q2 growth was −3.0% versus Q1. These are different periods and measures.', sources: [CONTEXT_SOURCES.gdp] },
  { id: 'gdp-forecast', label: 'Real GDP growth forecast', value: '+1.4%', status: 'forecast', period: 'Full year 2026 versus 2025', detail: 'CBI August forecast; 2027: +1.9%. A forecast for a full year is not the latest quarter’s measured growth.', sources: [CONTEXT_SOURCES.cbiForecast] },
  { id: 'inflation', label: 'CPI inflation, latest observation', value: '5.9%', status: 'observed', period: 'September 2026 versus September 2025', detail: 'Twelve-month consumer price change; September’s monthly change was +0.39%.', sources: [CONTEXT_SOURCES.cpi] },
  { id: 'inflation-forecast', label: 'CPI inflation forecast', value: '5.4%', status: 'forecast', period: '2026 annual average versus 2025 average', detail: 'CBI August forecast; 2027: 3.6%. An annual average is different from September’s twelve-month change.', sources: [CONTEXT_SOURCES.cbiTables] },
  { id: 'government-borrowing', label: 'Government securities and loans / GDP', value: '56.7%', status: 'derived', period: 'End-2025 stocks / 2025 annual GDP', detail: 'Sum of separately rounded general-government securities 37.4% plus loans 19.3%. The exact amounts imply 56.6803%. The model maps this narrower borrowing measure to bonds. This is not a verified Maastricht debt figure.', sources: [CONTEXT_SOURCES.governmentTable] },
  { id: 'government-liabilities', label: 'Total government liabilities / GDP', value: '88.3%', status: 'observed', period: 'End-2025 stocks / 2025 annual GDP', detail: 'Broader general-government balance sheet, including pension insurance liabilities and other payables. It is not the model’s bond debt.', sources: [CONTEXT_SOURCES.government] },
  { id: 'population', label: 'Resident population', value: '396,500', status: 'observed', period: 'End of Q2 2026', detail: 'Quarterly population estimate, up 1,450 in Q2. This is a population level, not an assumed annual growth rate.', sources: [CONTEXT_SOURCES.population] },
];

export const WORLD_CONTEXT: readonly ContextRow[] = [
  { id: 'world-actual', label: 'World real GDP growth, latest full year', value: '+3.5%', status: 'estimate', period: '2025 versus 2024; IMF July 2026 estimate', detail: 'IMF estimate, subject to revision. Country output is weighted by purchasing power parity (PPP).', sources: [CONTEXT_SOURCES.worldTable] },
  { id: 'world-forecast', label: 'World real GDP growth forecast', value: '+3.0%', status: 'forecast', period: 'Full year 2026 versus 2025', detail: 'IMF July forecast, PPP weighted; 2027: +3.4%. It does not automatically raise the model’s foreign demand.', sources: [CONTEXT_SOURCES.world] },
  { id: 'partner-forecast', label: 'Iceland’s main trading partners’ growth', value: '+1.5%', status: 'forecast', period: 'Full year 2026 versus 2025', detail: 'CBI August forecast for trading partners. This aggregate is different from IMF world growth.', sources: [CONTEXT_SOURCES.cbiTables] },
  { id: 'ecb-rate', label: 'ECB deposit facility rate', value: '2.50%', status: 'observed', period: 'Effective 16 September 2026', detail: 'One named foreign policy-rate reference. It is not a world interest rate, portfolio yield or asset-price return.', sources: [CONTEXT_SOURCES.ecb] },
];

const rate = (value: number) => `${(Math.abs(value) < 1e-10 ? 0 : value * 100).toFixed(2)}%`;

/** Read the solved start, so moving levers never rewrites the assumptions displayed here. */
export function modelContext(client: EngineClient): ContextRow[] {
  const info = client.info;
  const param = (id: string) => info.paramById.get(id)?.value;
  const opening = (id: string) => client.opening?.(id) ?? client.baseline(id);
  const growing = info.paramById.has('growthReal');
  const inflationVar = info.varById.has('inflation12') ? 'inflation12' : 'inflation';
  const inflation = info.varById.has(inflationVar) ? opening(inflationVar) : undefined;
  const rows: ContextRow[] = [
    { id: 'model-growth', label: 'Background real GDP growth', value: '0% per year', status: 'model-assumption', period: 'Solved stationary start, unchanged levers', detail: 'The no-change run remains at its starting levels. Cash flows continue, while saving, investment and revaluations balance at the solved start.' },
    { id: 'model-inflation', label: 'Starting CPI inflation', value: inflation === undefined ? 'Not declared' : rate(inflation), status: 'model-assumption', period: 'Solved stationary start; annual rate', detail: 'Prices have no background trend. The model inflation target is zero; this is a teaching baseline, separate from Iceland’s actual inflation.' },
  ];
  if (growing) {
    rows[0] = { id: 'model-growth', label: 'Normal domestic real growth', value: `${rate(param('growthReal')!)} per year`, status: 'model-assumption', period: 'Persistent teaching trend', detail: 'The default uses the August 2026 CBI one-year forecast as an assumed recurring normal-demand path. Actual GDP follows spending, trade and funded investment; it can differ from this trend.', sources: [CONTEXT_SOURCES.cbiForecast] };
    rows[1].detail = 'The inherited calibrated start has zero twelve-month inflation. Prices then follow a growing target while the existing wage, cost and exchange-rate equations react. This is a transition, not observed Iceland today.';
    rows.push(
      { id: 'model-price-trend', label: 'Price trend and inflation target', value: `${rate(param('growthInflation')!)} per year`, status: 'model-assumption', period: 'Persistent teaching trend', detail: 'Default 2.5% is inspired by the CBI target. Domestic and foreign normal price paths share this assumption; actual CPI remains endogenous.' },
      { id: 'model-world-growth', label: 'Foreign-demand growth proxy', value: `${rate(param('growthWorld')!)} per year`, status: 'model-assumption', period: 'Persistent teaching trend; unit elasticity', detail: 'The default repeats the July 2026 IMF one-year world forecast as an assumed demand proxy for tourism and other exporters. It is not a measured Iceland export-growth rate.', sources: [CONTEXT_SOURCES.world] },
      { id: 'model-population-growth', label: 'Population and normal labour-force growth', value: `${rate(param('growthPopulation')!)} per year`, status: 'model-assumption', period: 'Persistent teaching trend; fixed age shares', detail: 'Default 0.5% is an assumption. It scales normal age-group populations and labour supply; births, deaths and cohort transitions are not separately modelled.' },
      { id: 'model-productivity-growth', label: 'Normal productivity growth', value: `${rate((1 + param('growthReal')!) / (1 + param('growthPopulation')!) - 1)} per year`, status: 'model-assumption', period: 'Derived from the declared real and population trends', detail: 'Real growth factor divided by population growth factor. Actual capacity also depends on accumulated funded real investment after physical depreciation.' },
      { id: 'model-equity-trend', label: 'Automatic foreign equity-price appreciation', value: 'None', status: 'model-assumption', period: 'Outside this growth extension', detail: 'Pension and household wealth move through saving, funded investment, interest and exchange-rate revaluation. Foreign equities still lack a separate market-price return process.' },
    );
  }
  if (info.varById.has('keyRate')) rows.push({ id: 'model-rate', label: 'Starting nominal key rate', value: rate(opening('keyRate')), status: 'model-assumption', period: 'Calibrated opening; annual rate', detail: 'Read from the inherited calibrated opening. The neutral real rate remains an assumption, and unlocked policy rules can react. Today’s observed policy rate is separate.' });
  if (info.id === 'iceland' || growing) {
    const debt = param('govDebt');
    const foreignRate = param('iFnow');
    if (debt !== undefined) rows.push({ id: 'model-debt', label: 'Government borrowing mapped to bonds', value: `${debt.toFixed(1)}% of GDP`, status: 'model-assumption', period: '2025 calibration / baseline annual GDP', detail: 'General-government securities and loans are represented by nominal and indexed bonds. Pension liabilities and other payables are outside this debt measure.' });
    if (foreignRate !== undefined) rows.push({ id: 'model-foreign-rate', label: 'Starting foreign interest rate', value: rate(foreignRate), status: 'model-assumption', period: 'Steady start; annual rate', detail: 'An assumed rate used in interest and portfolio decisions. It is not foreign equity appreciation or the total return on pension assets.' });
    rows.push({ id: 'model-money', label: 'Calibration money scale', value: 'GDP = 100 = ISK 4,941.211 bn', status: 'model-assumption', period: '2025 nominal GDP scale', detail: 'One money unit is ISK 49.41211 bn. Stocks use baseline annual GDP; money flows use the same scale per year. This scale is not an estimate of today’s GDP.' });
  }
  return rows;
}

export const CONTEXT_GAPS = 'There is no automatic background path for world demand, population growth, productivity or foreign equity prices. Modelled migration and other responses can still change the economy after a lever moves. A growing start and a run from today’s state require a separate, specified reference path; these figures do not create one.';

export function contextDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
