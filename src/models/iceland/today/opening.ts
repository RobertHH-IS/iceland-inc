/**
 * Iceland on 30 September 2026: the dated opening of the application's default model
 * (docs/design/today-opening.md; decision 0018).
 *
 * Month 0 is the end of September 2026. Every position, price, rate, expectation and lag history
 * is set from the dated snapshot through a declared conversion (§1), each financial instrument has
 * exactly one residual, the closed forms of §1.4 and §1.5 are computed from the evaluated month 0
 * (`derive`), and the start gaps of §3.3 are solved so that month 1 carries on today's wage
 * growth, inflation, unemployment and króna drift. Money is in model units: one unit is 1% of 2025
 * nominal GDP, ISK 49.41211 bn (§2). Flows are at annual rates at September 2026 prices.
 *
 * What is not yet data is a declared bridge (§1.6), marked `assumed` or `placeholder` so the
 * opening report lists it; when the snapshot gains the record, the bridge goes.
 */
import type {
  Id,
  IndicatorCtx,
  MoneyUnit,
  OpeningAnchors,
  OpeningCheck,
  OpeningContinuity,
  OpeningCtx,
  OpeningDef,
  OpeningSource,
  OpeningState,
  OpeningStock,
  OpeningTarget,
  OpeningUnknown,
  OpeningVar,
  Provenance,
  StartGapGroup,
} from '../../../core/types.ts';
import { startGapBaseId, startGapId } from '../../../core/opening.ts';
import { AGES, DOMESTIC, EXPORTERS, EXPORT_OF, FIRMS, FIRM_NAME, GDP_BN, HH, sum, type Age, type Exporter, type Firm } from '../util.ts';
import { COMMITTED_SOLUTION, record, value } from './data.ts';

export const ICELAND_OPENING_ID = 'iceland-2026-09-30';
export const AS_OF = '2026-09-30';

/** One model unit is 1% of 2025 nominal GDP (§2). */
export const MONEY_UNIT: MoneyUnit = {
  label: 'ISK bn',
  perUnit: GDP_BN / 100,
  basis: 'Hagstofa THJ01102: 2025 GDP at current prices, ISK 4,941.211 bn (September 2026 vintage); one model unit is 1% of it',
};
const U = MONEY_UNIT.perUnit;
/** ISK bn → model units. */
const bn = (x: number) => x / U;
/** A percentage record as a fraction. */
const pct = (id: Id) => value(id) / 100;

/* ------------------------------------------------------------ start gaps (§3.3) */

/** The four families that are always on: a level or rate the data set and the rule cannot reproduce. */
export const ALWAYS_ON_GAPS: Record<Id, StartGapGroup> = {
  wage: { targets: ['wageGrowth'], fade: 1, scale: 'absolute', bound: 0.05, label: 'Contracted raises the wage curve does not explain' },
  labourSupplyY: { targets: ['unemployedY'], fade: 0.5, scale: 'relative', label: 'Labour supply outrunning jobs, young' },
  labourSupplyW: { targets: ['unemployedW'], fade: 0.5, scale: 'relative', label: 'Labour supply outrunning jobs, working age' },
  labourSupplyO: { targets: ['unemployedO'], fade: 0.5, scale: 'relative', label: 'Labour supply outrunning jobs, older' },
  markup: { targets: ['domesticPrice'], fade: 0.5, scale: 'relative', label: 'Domestic prices above their usual markup on costs' },
  // the fade is lamPPP, 0.2 a year: the half-life of deviations from purchasing-power parity
  krona: { targets: ['logExchangeRate'], fade: 0.2, scale: 'absolute', bound: 0.15, label: 'Today’s real appreciation the króna rule does not explain' },
};

/** Declared families switched on only when their own month-1 row fails without them (§3.3). */
export const CONDITIONAL_GAPS: Record<Id, StartGapGroup> = {
  spending: { targets: AGES.map((g) => `consumption${g}`), fade: 1, scale: 'relative', label: 'Household spending above or below what the consumption function says' },
  investment: { targets: FIRMS.map((j) => `investmentPlan${j}`), fade: 1, scale: 'relative', label: 'Investment plans above or below the accelerator' },
  hiring: { targets: FIRMS.map((j) => `employmentDesired${j}`), fade: 1, scale: 'relative', label: 'Jobs above or below what output justifies' },
  housePrices: { targets: ['logRealHousePrice'], fade: 1, scale: 'absolute', label: 'Real house prices above or below their rule' },
  rents: { targets: ['housingCost'], fade: 1, scale: 'relative', label: 'Housing costs above or below their rule' },
  mortgageDemand: { targets: ['mortgageDemandY', 'mortgageDemandW'], fade: 1, scale: 'relative', label: 'Mortgage demand above or below desired debt' },
};

/** The conditional families switched on (decision 0018): only house prices, whose own month-1 row
 *  failed without it (real house prices rose 0.6% in month 1 against a bound of 0.5%); spending,
 *  investment, hiring, rents and mortgage demand stayed within their rows with the families off. */
export const CONDITIONAL_GAPS_ON: readonly Id[] = ['housePrices'];

export interface IcelandOpeningOptions {
  /** The parameter ids of the compiled model, so setNormal can pair a parameter with its growth anchor. */
  paramIds: ReadonlySet<Id>;
  /** The conditional gap families that are on (default CONDITIONAL_GAPS_ON). */
  conditionalGaps?: readonly Id[];
  /** Who holds the Treasury's foreign-currency debt in the model (§9.3 step 7): the banks ('B',
   *  the default: decision 0018 measured the smaller króna response, and non-residents' króna
   *  holdings stay as the data have them), or the rest of the world as króna bonds ('W', the
   *  plan's first mapping). */
  foreignDebtHolder?: 'W' | 'B';
  /** The committed solution to check (default: the extract file's). An empty one means solve. */
  solution?: Record<Id, number>;
}

/* -------------------------------------------------------------- the numbers (§1) */

const cpi0 = value('macro.cpiIndex') / value('macro.cpiAnnualAverage');
const inflation12 = pct('macro.cpiInflationYoY');
const exHousingInflation = pct('macro.cpiExHousingInflationYoY');
const wageGrowth12 = pct('macro.wageGrowthYoY');
const keyRate0 = pct('financial.policyRate');
const expectedInflation0 = (value('macro.expectedInflationBusinesses1Y') + value('macro.expectedInflationMarketAgents1Y')) / 200;
const unemployment0 = pct('macro.unemploymentLFSTrend');
const exchangeRate0 = value('external.fx.tradeWeightedIndex.relative2025');
/** The króna's drift over the past year as a log rate: the index fell 2.1%, so the króna strengthened. */
const kronaDrift = Math.log1p(pct('financial.tradeWeightedIndexNarrowYoY'));
const housePrice0 = value('macro.housePriceRebased2025Average');
const worldPrice0 = Math.pow(1 + pct('world.partnersInflation2026'), 15 / 12);
const foreignRate0 = (value('world.rate.ECB.deposit') + value('world.rate.BoE.bankRate') + (value('world.rate.Fed.targetLower') + value('world.rate.Fed.targetUpper')) / 2) / 300;
const mortgageRateN0 = pct('financial.mortgageNAdvertised');
const mortgageRateI0 = (value('financial.mortgageIAdvertisedLandsbankinn') + value('financial.mortgageIAdvertisedIslandsbanki') + value('financial.mortgageIAdvertisedArion')) / 300;
const bondRate0 = pct('financial.bondParNominal5Year');
const indexedBondRate0 = pct('financial.bondParIndexed5Year');
const loanRate0 = pct('financial.businessPreferredLandsbankinn');
const depositRate3M = (value('financial.depositFixed3Landsbankinn') + value('financial.depositFixed3Islandsbanki') + value('financial.depositFixed3Arion')) / 300;
const realGrowthYoY = pct('macro.gdpRealGrowthQuarterYoYSA');

/** The CPI at month m ≤ 0 (1 at the 2025 average, month −15): log-linear at the 12-month rate from
 *  month −12 to 0, and from 1 at month −15 to month −12 (§1.4). */
function cpiAt(m: number): number {
  if (m >= -12) return cpi0 * Math.pow(1 + inflation12, m / 12);
  const yearAgo = cpi0 / (1 + inflation12);
  return Math.exp((Math.log(yearAgo) * (m + 15)) / 3);
}
/** A path back from today at a steady rate a year: [month −1, month −2, …]. */
export const pathBack = (now: number, yearly: number, months = 12): number[] => Array.from({ length: months }, (_, q) => now / Math.pow(1 + yearly, (q + 1) / 12));
const CPI_HISTORY = Array.from({ length: 12 }, (_, q) => cpiAt(-(q + 1)));
/** F: the price factor that moves the rolling four quarters (months −14 to −3) to September 2026 prices (§1.1). */
export const F = cpi0 / (sum(Array.from({ length: 12 }, (_, k) => cpiAt(-14 + k))) / 12);

/* the national accounts, at month-0 prices, in model units (§1.7) */
const GDP0 = bn(value('macro.gdpNominalRolling4Q') * F);
const ratio = (rolling: Id, annual: Id) => value(rolling) / value(annual);
const CONSUMPTION_RATIO = ratio('macro.consumptionNominalRolling4Q', 'macro.consumptionNominalAnnual');
const SERVICES_RATIO = ratio('macro.governmentConsumptionNominalRolling4Q', 'macro.governmentConsumptionNominalAnnual');
const BUSINESS_INVESTMENT_RATIO = ratio('macro.businessInvestmentNominalRolling4Q', 'macro.businessInvestmentNominalAnnual');
const PUBLIC_INVESTMENT_RATIO = ratio('macro.governmentInvestmentNominalRolling4Q', 'macro.governmentInvestmentNominalAnnual');
const IMPORTS_RATIO = ratio('macro.importsNominalRolling4Q', 'macro.importsNominalAnnual');
const EXPORT_RECEIPTS: Record<Exporter, Id> = { XF: 'external.exports.marine.rolling4q', XA: 'external.exports.aluminium.rolling4q', XT: 'external.exports.tourism.rolling4q', XO: 'external.exports.other.rolling4q' };

/* balance sheets, ISK bn (§1.3) */
const D = {
  households: value('financial.depositsHH') + value('financial.depositsNPISH'),
  firms: value('financial.depositsTotal') - value('financial.depositsGovernment') - value('financial.depositsHH') - value('financial.depositsNPISH') - value('financial.depositsPF') - value('financial.depositsNonresident'),
  pf: value('financial.depositsPF'),
  w: value('financial.depositsNonresident'),
};
const DEPOSIT_SHARE: Record<Age, number> = (() => {
  const s = Object.fromEntries(AGES.map((g) => [g, value(`financial.householdTaxDepositsShare${g}`)])) as Record<Age, number>;
  const t = sum(AGES.map((g) => s[g]));
  return Object.fromEntries(AGES.map((g) => [g, s[g] / t])) as Record<Age, number>;
})();
const HOMES_SHARE: Record<Age, number> = (() => {
  const s = Object.fromEntries(AGES.map((g) => [g, value(`financial.householdTaxRealEstateShare${g}`)])) as Record<Age, number>;
  const t = sum(AGES.map((g) => s[g]));
  return Object.fromEntries(AGES.map((g) => [g, s[g] / t])) as Record<Age, number>;
})();
const TREASURY_ACCOUNT = value('financial.centralBankTreasuryISKAccount') + value('financial.centralBankTreasuryFXDeposit');
const CB = { reserves: value('financial.centralBankForeignReserves'), bonds: value('financial.centralBankGovernmentBonds'), equity: value('financial.centralBankNetEquity') };
const MORTGAGES = {
  bankN: value('financial.mortgagesBanksNonindexed') + value('financial.mortgagesBanksFX'),
  bankI: value('financial.mortgagesBanksIndexed'),
  pfN: value('financial.mortgagesPFNonindexed'),
  pfI: value('financial.mortgagesPFIndexed'),
};
const MORTGAGE_TOTAL = MORTGAGES.bankN + MORTGAGES.bankI + MORTGAGES.pfN + MORTGAGES.pfI;
const YOUNG_MORTGAGE_SHARE = pct('financial.householdTaxMortgageDebtShareY');
const BUSINESS_LOANS = value('financial.bankBusinessLoans');
/** Construction loans, ISK bn: the note on corpLoansBanksISKbn in data/iceland/current-financial.json
 *  (CBI databank, deposit institutions' loans to non-financial companies, end-August 2026). */
const CONSTRUCTION_LOANS = 456.6;
const GOV_DEBT = value('financial.governmentBorrowingDebt');
const INDEXED_DEBT = value('financial.centralTreasuryIndexedDebt');
const FOREIGN_DEBT = value('financial.centralTreasuryForeignDebt');
/** Non-residents' share of Treasury bonds: Lánamál ríkisins, holders of Treasury securities at 31 December 2025 (calibration.json). */
const NONRESIDENT_TREASURY_SHARE = 0.072;
const BANK_EQUITY = value('financial.bankBookEquity');
const PF = {
  assets: value('financial.pensionAssets'),
  foreign: value('financial.pensionForeignAssets'),
  treasuryBonds: value('financial.pensionTreasuryBondsNominalValue'),
  netWorthShare: value('financial.pensionNetFinancialAssets2024') / value('financial.pensionFinancialAssets2024'),
};
const HOUSEHOLD_BONDS = value('financial.householdFinancialBonds');
const HOUSEHOLD_EQUITY = value('financial.householdFinancialEquitiesUnits');
const HOMES_VALUE = value('financial.residentialAssessment2027');

/* the labour market (§1.4, §1.5) */
const EMPLOYMENT_RATIO: Partial<Record<Firm, number>> = {
  FC: value('macro.employmentRegisterRollingIndustry13') / value('macro.employmentRegisterAnnual2025Industry13'),
  XF: value('macro.employmentRegisterRollingIndustry32') / value('macro.employmentRegisterAnnual2025Industry32'),
  XA: value('macro.employmentRegisterRollingIndustry9') / value('macro.employmentRegisterAnnual2025Industry9'),
  XT: value('macro.employmentRegisterRollingIndustry31') / value('macro.employmentRegisterAnnual2025Industry31'),
};
const EMPLOYMENT_RATIO_TOTAL = value('macro.employmentRegisterRolling12M') / value('macro.employmentRegisterAnnual2025');

/* the fiscal accounts, at month-0 prices, in model units */
const REVENUE0 = bn(value('fiscal.revenue.rolling4q') * F);
const EXPENDITURE0 = bn(value('fiscal.expenditure.rolling4q') * F);

/* ------------------------------------------------------------------ sources */

const period = (id: Id) => record(id).period;
const data = (ids: Id[], note?: string): OpeningSource => ({ basis: 'data', records: ids, period: period(ids[0]), ...(note ? { note } : {}) });
const residual = (ids: Id[], note: string): OpeningSource => ({ basis: 'residual', records: ids, period: period(ids[0]), note });
const allocated = (ids: Id[], note: string): OpeningSource => ({ basis: 'allocated', records: ids, ...(ids.length ? { period: period(ids[0]) } : {}), note });
const bridge = (ids: Id[], note: string): OpeningSource => ({ basis: 'assumed', records: ids, ...(ids.length ? { period: period(ids[0]) } : {}), note });
const closed = (note: string, ids: Id[] = []): OpeningSource => ({ basis: 'closed', records: ids, note });
const evaluated = (note: string, ids: Id[] = []): OpeningSource => ({ basis: 'evaluated', records: ids, note });

const dataProv = (ids: Id[], note?: string): Provenance => ({
  basis: 'data',
  source: ids.map((id) => `${record(id).label} (${id}; ${record(id).source})`).join('; '),
  vintage: ids.map(period).join('; '),
  ...(note ? { note } : {}),
});
const derivedProv = (note: string): Provenance => ({ basis: 'derived', note });
const assumedProv = (note: string): Provenance => ({ basis: 'assumed', note });

/* ------------------------------------------------------------------ helpers */

/** Set a parameter the opening re-sets, and its growth anchor `growthAnchor.<id>` when the model
 *  has one, so that a normal level re-set today compounds from today (§1.5). */
export function setNormal(state: OpeningState, id: Id, x: number, provenance: Provenance, records?: Id[], paramIds?: ReadonlySet<Id>): void {
  state.params[id] = { value: x, provenance, ...(records ? { records } : {}) };
  const anchor = `growthAnchor.${id}`;
  if (paramIds?.has(anchor)) state.params[anchor] = { value: x, provenance: derivedProv(`Growth anchor of ${id}: the normal level set by the opening, kept separately so additive lever shifts are not compounded.`) };
}

/** The derive pass re-sets a parameter with a growth anchor: both move together. */
const withAnchor = (paramIds: ReadonlySet<Id>, out: Record<Id, number>, id: Id, x: number) => {
  out[id] = x;
  if (paramIds.has(`growthAnchor.${id}`)) out[`growthAnchor.${id}`] = x;
};

const stock = (c: IndicatorCtx, ins: Id, players: readonly Id[]) => sum(players.map((p) => c.stock(ins, p)));
const pfAssets = (c: IndicatorCtx) => stock(c, 'deposits', ['PF']) + stock(c, 'govBonds', ['PF']) + c.stock('indexedBonds', 'PF') + c.stock('bankBonds', 'PF') + c.stock('mortgagesN', 'PF') + c.stock('mortgagesI', 'PF') + c.stock('shares', 'PF') + c.stock('foreignAssets', 'PF');
const govDebt = (c: IndicatorCtx) => c.stock('govBonds', 'G') + c.stock('indexedBonds', 'G');
const mortgageDebt = (c: IndicatorCtx) => sum(['HY', 'HW'].map((h) => c.stock('mortgagesN', h) + c.stock('mortgagesI', h)));
const importBill = (c: IndicatorCtx) => sum(['Consumer', 'Inputs', 'Equipment', 'Public', 'Exporters'].map((k) => c.v(`imports${k}`)));
const revenue = (c: IndicatorCtx) => sum(AGES.map((g) => c.v(`incomeTax${g}`))) + c.v('vat') + sum(FIRMS.map((j) => c.v(`payrollTax${j}`) + c.v(`corporateTax${j}`))) + c.v('fishingFee') + c.v('cbProfit') + c.v('bankDividendsG');
const services = (c: IndicatorCtx) => c.v('spendingHealth') + c.v('spendingEducation') + c.v('spendingOtherServices');
const transfers = (c: IndicatorCtx) => sum(AGES.map((g) => c.v(`oldAgeTransfers${g}`))) + c.v('familyBenefitsY') + c.v('familyBenefitsW');
const interest = (c: IndicatorCtx) => sum(['B', 'CB', 'PF', 'HO', 'W'].map((h) => c.v(`bondInterest${h}`))) + c.v('indexedBondCoupon');
const expenditure = (c: IndicatorCtx) => services(c) + c.v('publicInvestment') + transfers(c) + sum(AGES.map((g) => c.v(`unemploymentBenefits${g}`))) + interest(c);
const netWorth = (c: IndicatorCtx, player: Id, assets: Id[], liabilities: Id[]) => sum(assets.map((i) => c.stock(i, player))) - sum(liabilities.map((i) => c.stock(i, player)));

/* ------------------------------------------------------------------ the opening */

export function createIcelandOpening(options: IcelandOpeningOptions): OpeningDef {
  const { paramIds } = options;
  const conditional = options.conditionalGaps ?? CONDITIONAL_GAPS_ON;
  const foreignDebtHolder = options.foreignDebtHolder ?? 'B';
  const committed = options.solution ?? COMMITTED_SOLUTION;
  return {
    id: ICELAND_OPENING_ID,
    label: 'Iceland on 30 September 2026',
    asOf: AS_OF,
    description: 'The economy as the published data have it on 30 September 2026: a key rate of 8%, inflation of 5.9%, unemployment of 5.8%, wage growth of 5.7%, and the balance sheets of households, firms, banks, pension funds, the government and the rest of the world. From here it follows its own rules: a teaching model, not a forecast.',
    build: (a) => build(a, { paramIds, conditional, foreignDebtHolder, committed }),
    path: PATH,
  };
}

/** The path with no lever moved, beside published figures (the owner's decision of 6 October 2026:
 *  shown for comparison in the opening report, never a pass condition and never a tuning target). */
const PATH: NonNullable<OpeningDef['path']> = {
  months: [6, 12, 18, 24, 60, 120, 240],
  note: 'What the model does from 30 September 2026 when no lever is moved. It is the outcome of the model’s own rules, not a forecast, and nothing in the model was chosen to bring it close to the published figures in the last column. They are shown so the two can be compared.',
  rows: [
    { id: 'keyRate', label: 'Key rate, %', measure: (c) => 100 * c.v('keyRate'), reference: `${value('financial.policyRate').toFixed(2)}% today. Market participants (Central Bank survey, 10–12 August 2026) expect 8% in 2026Q3 and 6.25% in two years` },
    { id: 'inflation12', label: 'CPI inflation over 12 months, %', measure: (c) => 100 * c.v('inflation12'), reference: `${value('macro.cpiInflationYoY')}% today. The Central Bank forecasts ${value('macro.cpiInflationForecastAnnualAverage2027')}% on average in 2027 (Monetary Bulletin 2026/3)` },
    { id: 'unemployment', label: 'Unemployment, % of the labour force', measure: (c) => 100 * c.v('unemployment'), reference: `${value('macro.unemploymentLFSTrend')}% today (trend). The Central Bank forecasts ${value('macro.unemploymentForecast2026')}% on average in 2026 and ${value('macro.unemploymentForecast2027')}% in 2027` },
    { id: 'output', label: 'Real GDP, % above today', measure: (c) => 100 * (c.v('output') / c.base('output') - 1), reference: `The Central Bank forecasts growth of ${value('macro.gdpRealGrowthForecast2026')}% in 2026 and ${value('macro.gdpRealGrowthForecast2027')}% in 2027` },
    { id: 'exchangeRate', label: 'Króna: price of foreign currency (2025 average = 1; up is a weaker króna)', measure: (c) => c.v('exchangeRate'), digits: 4, reference: `${exchangeRate0.toFixed(4)} today, ${(-100 * pct('financial.tradeWeightedIndexNarrowYoY')).toFixed(1)}% stronger than a year earlier. No forecast in the snapshot` },
    { id: 'wageGrowth', label: 'Wage growth, % a year', measure: (c) => 100 * c.v('wageGrowth'), reference: `${value('macro.wageGrowthYoY')}% over the 12 months to August 2026` },
    { id: 'lenderConfidence', label: 'Lender confidence (−1 cautious, 0 neutral, +1 confident)', measure: (c) => c.v('lenderConfidence'), digits: 3, reference: 'Neutral at the start, by construction' },
    { id: 'creditRefused', label: 'Business credit refused, ISK bn a year', measure: (c) => c.v('businessCreditDenied') * U, digits: 1, reference: 'None refused means banks ration no credit' },
    { id: 'pfAssets', label: 'Pension-fund assets, % of the past 12 months’ GDP', measure: (c) => (100 * pfAssets(c)) / c.v('gdpTrailing12'), digits: 1, reference: `ISK ${Math.round(value('financial.pensionAssets')).toLocaleString('en-US')} bn at end-July 2026` },
    { id: 'pfNetWorth', label: 'Pension funds’ net worth, % of their assets', measure: (c) => (100 * (pfAssets(c) - c.stock('pensionRights', 'PF'))) / pfAssets(c), digits: 1, reference: `${(100 * PF.netWorthShare).toFixed(1)}% in the 2024 financial accounts` },
    { id: 'foreignPurchases', label: 'Pension funds’ net foreign purchases, % of GDP a year', measure: (c) => (100 * c.v('foreignAssetPurchases')) / c.v('nominalGDP'), reference: 'About 2.1% of GDP a year in January–August 2026 (ISK 72 bn in eight months)' },
    { id: 'debtRatio', label: 'Government debt, % of the past 12 months’ GDP', measure: (c) => 100 * c.v('debtRatio'), digits: 1, reference: `${value('financial.governmentBorrowingDebtRatioExact').toFixed(1)}% of 2025 GDP at end-2025` },
  ],
};

function build(a: OpeningAnchors, o: { paramIds: ReadonlySet<Id>; conditional: readonly Id[]; foreignDebtHolder: 'W' | 'B'; committed: Record<Id, number> }): OpeningState {
  const { paramIds } = o;
  const p = (id: Id) => a.param(id);
  const dt = 1 / 12 / 2; // the kernel's step: two a month (ModelDef.substeps)

  /* ---------------------------------------------------------------- prices (§1.4) */
  const omD = p('omD'),
    omM = p('omM'),
    omH = p('omH'),
    distM = p('distM'),
    aLab = p('aLab');
  const importPrice0 = exchangeRate0 * worldPrice0; // at the border price: the pass-through rule at rest
  // the housing-free part of the CPI rose at its own 12-month rate (bridge: the components' 2025 averages are not published)
  const deflator0 = cpiAt(-12) * (1 + exHousingInflation);
  const housingCost0 = (cpi0 - (omD + omM) * deflator0) / omH;
  // domestic prices from the CPI identity, with last month's at the housing-free rate
  const dpBack = Math.pow(1 + exHousingInflation, -1 / 12);
  const domesticPrice0 = ((omD + omM) * deflator0 - omM * (1 - distM) * importPrice0) / (omD + omM * distM * dpBack);
  const domesticPrice1 = domesticPrice0 * dpBack;
  const deliveredImportPrice0 = (1 - distM) * importPrice0 + distM * domesticPrice1;
  const wage0 = cpiAt(-1) * (1 + pct('macro.realWageGrowthYoY'));
  // labour cost as firms see it: the value whose first step keeps pace with wages per unit of trend
  // productivity (the growth wrap measures the wage that way), with the carried price trend
  const productivityTrend = Math.log1p(p('growthReal')) - Math.log1p(p('growthPopulation'));
  const k = 1 - Math.exp(-p('lamUCw') * dt);
  const gW = Math.log1p(wageGrowth12) - productivityTrend;
  const cT = Math.log1p(p('growthInflation'));
  const labourCostSeen0 = (k * wage0 * Math.exp(gW * dt)) / (Math.exp(gW * dt) - (1 - k) * Math.exp(cT * dt));
  const adaptiveInflation0 = (expectedInflation0 - p('chi') * p('piT')) / (1 - p('chi'));
  const exchangeRate1 = exchangeRate0 * Math.exp(-kronaDrift / 12);
  // house prices: the rule reads the CPI one kernel step back, which the monthly history interpolates
  const cpiHalfMonthBack = (cpi0 + CPI_HISTORY[0]) / 2;
  const logRealHousePrice0 = Math.log(housePrice0 / cpiHalfMonthBack);

  /* ------------------------------------------------- the national accounts (§1.7) */
  const C0 = a.value('consumption') * CONSUMPTION_RATIO * F;
  const G0 = sum(['gHealth', 'gEdu', 'gOther'].map(p)) * SERVICES_RATIO * F; // nominal public services
  const I0 = sum(FIRMS.map((j) => a.value(`investment${j}`))) * BUSINESS_INVESTMENT_RATIO * F; // nominal business investment
  const IG0 = p('gInv') * PUBLIC_INVESTMENT_RATIO * F; // nominal public investment
  const exports0: Record<Exporter, number> = Object.fromEntries(EXPORTERS.map((j) => [j, bn(value(EXPORT_RECEIPTS[j]) * F)])) as Record<Exporter, number>;
  const X0 = sum(EXPORTERS.map((j) => exports0[j]));
  const M0 = C0 + G0 + I0 + IG0 + X0 - GDP0; // imports: the one residual (GDP = C + G + I + X − M)
  const importsMapped = a.value('importVolume') * IMPORTS_RATIO * F;
  const exportsMapped = bn(value('macro.exportsNominalRolling4Q') * F);
  // the public-service scale: nominal services = wage × staff pay + domestic prices × purchases
  const channels = [
    ['gHealth', 'wsHealth'],
    ['gEdu', 'wsEdu'],
    ['gOther', 'wsOther'],
  ] as const;
  const servicesScale = G0 / sum(channels.map(([g, ws]) => wage0 * p(ws) * p(g) + domesticPrice0 * (1 - p(ws)) * p(g)));
  const publicEmployment0 = (servicesScale * sum(channels.map(([g, ws]) => p(ws) * p(g)))) / (1 + p('cEr') + p('css'));
  const gInv0 = IG0 / domesticPrice0;
  const investmentReal0 = I0 / domesticPrice0;
  const volume: Record<Exporter, number> = { XF: exports0.XF / importPrice0, XA: exports0.XA / importPrice0, XT: exports0.XT / domesticPrice0, XO: exports0.XO / domesticPrice0 };
  const exportVolume0 = sum(EXPORTERS.map((j) => volume[j]));
  const importVolume0 = M0 / importPrice0;
  const realConsumption0 = C0 / deflator0;
  const output0 = realConsumption0 + servicesScale * sum(['gHealth', 'gEdu', 'gOther'].map(p)) + investmentReal0 + gInv0 + exportVolume0 - importVolume0;
  const outputFromGrowth = a.value('output') * (1 + realGrowthYoY);

  /* ------------------------------------------------------------ the GDP history */
  // nominal GDP back from today at the rate r at which its average over months −14 to −3 is the
  // rolling four quarters (bisection on r)
  const window = bn(value('macro.gdpNominalRolling4Q'));
  const windowAverage = (r: number) => sum(Array.from({ length: 12 }, (_, k) => GDP0 * Math.pow(1 + r, -(3 + k) / 12))) / 12;
  let lo = -0.5,
    hi = 0.5;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (windowAverage(mid) > window) lo = mid;
    else hi = mid;
  }
  const gdpGrowthBack = (lo + hi) / 2;
  const gdpHistory = pathBack(GDP0, gdpGrowthBack);
  // GDP over the past 12 months as the kernel reads it: 24 half-month steps, each month's value
  // held at the step and the half-month between two months read as their mean
  const gdpAtMonth = (q: number) => (q === 0 ? GDP0 : gdpHistory[q - 1]);
  const gdpTrailing12At0 = sum(Array.from({ length: 24 }, (_, s) => (s % 2 === 0 ? gdpAtMonth(s / 2) : (gdpAtMonth((s - 1) / 2) + gdpAtMonth((s + 1) / 2)) / 2))) / 24;

  /* -------------------------------------------------------------- employment */
  const employment: Record<Firm, number> = {} as Record<Firm, number>;
  for (const j of ['FC', 'XF', 'XA', 'XT'] as const) employment[j] = a.value(`employment${j}`) * EMPLOYMENT_RATIO[j]!;
  const rest = a.value('employmentTotal') * EMPLOYMENT_RATIO_TOTAL - publicEmployment0 - sum((['FC', 'XF', 'XA', 'XT'] as const).map((j) => employment[j]));
  const restAnchor = a.value('employmentFR') + a.value('employmentXO');
  employment.FR = (rest * a.value('employmentFR')) / restAnchor;
  employment.XO = (rest * a.value('employmentXO')) / restAnchor;
  // each group's unemployment rate: its 2025 rate × one common factor (the age bands are a gap), the
  // factor set so that the whole labour force's rate is 5.8% with today's jobs by age (the jobs
  // rule by age: baseline jobs + the group's share of the change in all jobs, and tourism's tilt)
  const totalJobs = a.value('employmentTotal') * EMPLOYMENT_RATIO_TOTAL;
  const jobsByAge: Record<Age, number> = Object.fromEntries(
    AGES.map((g) => [g, p(`Ng0${g}`) + p(`cycSh${g}`) * (totalJobs - p('Ntot0')) + (g === 'O' ? 0 : (g === 'Y' ? 1 : -1) * p('youthTiltXT') * (p('Ng0Y') / p('Ntot0')) * (employment.XT - p('NXT0')))]),
  ) as Record<Age, number>;
  const totalRate = (s: number) => {
    let u = 0,
      lf = 0;
    for (const g of AGES) {
      const workers = jobsByAge[g] / p(`wb${g}`);
      const rate = s * p(`u0${g}`);
      const unemployed = (rate / (1 - rate)) * workers;
      u += unemployed;
      lf += unemployed + workers;
    }
    return u / lf;
  };
  let sLo = 0,
    sHi = 1 / Math.max(...AGES.map((g) => p(`u0${g}`))) - 1e-9;
  for (let i = 0; i < 200; i++) {
    const mid = (sLo + sHi) / 2;
    if (totalRate(mid) < unemployment0) sLo = mid;
    else sHi = mid;
  }
  const groupScale = (sLo + sHi) / 2;
  const groupRate: Record<Age, number> = Object.fromEntries(AGES.map((g) => [g, groupScale * p(`u0${g}`)])) as Record<Age, number>;

  /* -------------------------------------------------------------- positions (§1.3) */
  const stocks: OpeningStock[] = [];
  const put = (at: [Id, Id], x: number, source: OpeningSource) => stocks.push({ at, value: x, source });
  // deposits
  for (const g of AGES) put(['deposits', HH[g]], bn(D.households * DEPOSIT_SHARE[g]), data(['financial.depositsHH', 'financial.depositsNPISH', `financial.householdTaxDepositsShare${g}`], `Households and NPISH, ${(100 * DEPOSIT_SHARE[g]).toFixed(2)}% by the 2025 tax returns`));
  const firmDepositAnchor = sum(FIRMS.map((j) => a.stock('deposits', j)));
  for (const j of FIRMS)
    put(['deposits', j], (bn(D.firms) * a.stock('deposits', j)) / firmDepositAnchor, allocated(['financial.depositsTotal', 'financial.depositsGovernment', 'financial.depositsHH', 'financial.depositsNPISH', 'financial.depositsPF', 'financial.depositsNonresident', 'financial.depositsNFC'], `Key: the 2025 opening shares of the six firms. Non-financial corporations’ deposits plus those of other financial corporations than pension funds (${D.firms.toFixed(1)} bn), money the model must hold somewhere`));
  put(['deposits', 'PF'], bn(D.pf), data(['financial.depositsPF']));
  put(['deposits', 'W'], bn(D.w), data(['financial.depositsNonresident']));
  // the treasury account and the central bank
  put(['treasuryAccount', 'G'], bn(TREASURY_ACCOUNT), data(['financial.centralBankTreasuryISKAccount', 'financial.centralBankTreasuryFXDeposit'], 'The Treasury’s ISK account plus its foreign-currency deposit, held as krónur in the model'));
  const reserves = CB.reserves + CB.bonds - TREASURY_ACCOUNT - CB.equity;
  put(['reserves', 'B'], bn(reserves), residual(['financial.centralBankForeignReserves', 'financial.centralBankGovernmentBonds', 'financial.centralBankTreasuryISKAccount', 'financial.centralBankTreasuryFXDeposit', 'financial.centralBankNetEquity'], 'Closes the central bank’s balance sheet: foreign reserves + government bonds − the treasury account − central-bank equity'));
  // mortgages: the lenders and the young from records, the working-age group fills each instrument
  const youngN = YOUNG_MORTGAGE_SHARE * (MORTGAGES.bankN + MORTGAGES.pfN),
    youngI = YOUNG_MORTGAGE_SHARE * (MORTGAGES.bankI + MORTGAGES.pfI);
  put(['mortgagesN', 'B'], bn(MORTGAGES.bankN), data(['financial.mortgagesBanksNonindexed', 'financial.mortgagesBanksFX'], 'Non-indexed plus the small foreign-currency book'));
  put(['mortgagesN', 'PF'], bn(MORTGAGES.pfN), data(['financial.mortgagesPFNonindexed']));
  put(['mortgagesN', 'HY'], bn(youngN), data(['financial.householdTaxMortgageDebtShareY'], `${(100 * YOUNG_MORTGAGE_SHARE).toFixed(2)}% of the stock, the young’s share by the 2025 tax returns; the older group’s 9.1% is folded into the working-age group`));
  put(['mortgagesI', 'B'], bn(MORTGAGES.bankI), data(['financial.mortgagesBanksIndexed']));
  put(['mortgagesI', 'PF'], bn(MORTGAGES.pfI), data(['financial.mortgagesPFIndexed']));
  put(['mortgagesI', 'HY'], bn(youngI), data(['financial.householdTaxMortgageDebtShareY'], `${(100 * YOUNG_MORTGAGE_SHARE).toFixed(2)}% of the stock, the young’s share by the 2025 tax returns`));
  // business loans: banks and construction from records, the exporters by placeholder shares, retail and services fill
  put(['businessLoans', 'B'], bn(BUSINESS_LOANS), data(['financial.bankBusinessLoans']));
  put(['businessLoans', 'FC'], bn(CONSTRUCTION_LOANS), data(['financial.bankBusinessLoans'], 'Construction loans, 456.6 bn: the note on corpLoansBanksISKbn in current-financial.json (CBI databank, end-August 2026)'));
  for (const j of EXPORTERS) put(['businessLoans', j], bn(BUSINESS_LOANS) * p(`loanShare${j}`), allocated(['financial.bankBusinessLoans'], `Key: the placeholder share loanShare${j} (${p(`loanShare${j}`)}) of banks’ business loans, kept from 2025`));
  // government bonds
  const nominalDebt = GOV_DEBT - INDEXED_DEBT;
  const wBonds = NONRESIDENT_TREASURY_SHARE * value('financial.treasuryBondsNominalValue') + (o.foreignDebtHolder === 'W' ? FOREIGN_DEBT : 0);
  const pfNominalBonds = Math.max(0, PF.treasuryBonds - INDEXED_DEBT);
  put(['govBonds', 'G'], bn(nominalDebt), data(['financial.governmentBorrowingDebt', 'financial.centralTreasuryIndexedDebt'], 'General-government debt at end-2025 less the indexed part'));
  put(['govBonds', 'CB'], bn(CB.bonds), data(['financial.centralBankGovernmentBonds']));
  put(['govBonds', 'HO'], bn(HOUSEHOLD_BONDS), data(['financial.householdFinancialBonds'], 'All debt securities households held at end-2024, with the older group'));
  put(
    ['govBonds', 'W'],
    bn(wBonds),
    data(
      ['financial.treasuryBondsNominalValue', 'financial.centralTreasuryForeignDebt'],
      o.foreignDebtHolder === 'W'
        ? '7.2% of Treasury bonds (non-residents’ share, Lánamál ríkisins at end-2025) plus the Treasury’s foreign-currency debt, held as króna bonds in the model (a mapping simplification)'
        : '7.2% of Treasury bonds (non-residents’ share, Lánamál ríkisins at end-2025); the Treasury’s foreign-currency debt (403.0 bn) is held by the banks in this mapping, so non-residents’ króna holdings are as the data have them (decision 0018)',
    ),
  );
  put(['govBonds', 'PF'], bn(pfNominalBonds), data(['financial.pensionTreasuryBondsNominalValue', 'financial.centralTreasuryIndexedDebt'], 'Pension funds’ Treasury holdings less the indexed debt they hold, floored at zero'));
  put(['indexedBonds', 'G'], bn(INDEXED_DEBT), data(['financial.centralTreasuryIndexedDebt']));
  // bank bonds close the banks' balance sheet
  const bankGovBonds = nominalDebt - CB.bonds - HOUSEHOLD_BONDS - wBonds - pfNominalBonds;
  const bankAssets = reserves + MORTGAGES.bankN + MORTGAGES.bankI + BUSINESS_LOANS + bankGovBonds;
  const bankBonds = bankAssets - (D.households + D.firms + D.pf + D.w) - BANK_EQUITY;
  put(['bankBonds', 'B'], bn(bankBonds), residual(['financial.bankBookEquity'], 'Closes the banks’ balance sheet: assets (reserves, mortgages, business loans, government bonds) − deposits − book equity'));
  // shares: households and non-residents hold given amounts, pension funds the rest of their assets, six issuers by net assets
  const householdShares: Record<Age, number> = { Y: p('eqHY'), W: p('eqHW'), O: p('eqHO') };
  const hhEqTotal = sum(AGES.map((g) => householdShares[g]));
  for (const g of AGES) put(['shares', HH[g]], (bn(HOUSEHOLD_EQUITY) * householdShares[g]) / hhEqTotal, allocated(['financial.householdFinancialEquitiesUnits'], `Key: the placeholder age split eqHY : eqHW : eqHO (${p('eqHY')} : ${p('eqHW')} : ${p('eqHO')})`));
  put(['shares', 'W'], p('eqW'), allocated([], 'Key: the placeholder eqW, kept from 2025 (foreign direct investment equity is a gap)'));
  const pfShares = PF.assets - (D.pf + pfNominalBonds * 1 + INDEXED_DEBT + bankBonds + MORTGAGES.pfN + MORTGAGES.pfI + PF.foreign);
  const equityDomestic = bn(pfShares) + bn(HOUSEHOLD_EQUITY);
  const sF = p('pfEqFDshare');
  const netAssets = (j: Firm) => (j === 'FC' ? bn(CONSTRUCTION_LOANS) : j === 'FR' ? 0 : bn(BUSINESS_LOANS) * p(`loanShare${j}`));
  const loansOf: Record<Firm, number> = Object.fromEntries(FIRMS.map((j) => [j, netAssets(j)])) as Record<Firm, number>;
  loansOf.FR = bn(BUSINESS_LOANS) - sum(FIRMS.filter((j) => j !== 'FR').map((j) => loansOf[j]));
  const depositsOf = (j: Firm) => (bn(D.firms) * a.stock('deposits', j)) / firmDepositAnchor;
  const net = (j: Firm) => depositsOf(j) + a.stock('capital', j) - loansOf[j];
  const naD = sum(DOMESTIC.map(net)),
    naX = sum(EXPORTERS.map(net));
  for (const j of DOMESTIC) put(['shares', j], (sF * equityDomestic * net(j)) / naD, allocated(['financial.pensionAssets', 'financial.householdFinancialEquitiesUnits'], `Key: as the 2025 calibration, domestic equity × pfEqFDshare, split between the two domestic sectors by net assets (deposits + capital − bank loans); ${FIRM_NAME[j]}`));
  for (const j of EXPORTERS) put(['shares', j], (((1 - sF) * equityDomestic + p('eqW')) * net(j)) / naX, allocated(['financial.pensionAssets', 'financial.householdFinancialEquitiesUnits'], `Key: as the 2025 calibration, the rest of domestic equity plus foreign equity, split among the exporters by net assets; ${FIRM_NAME[j]}`));
  // foreign assets and reserves
  put(['fxReserves', 'CB'], bn(CB.reserves), data(['financial.centralBankForeignReserves']));
  put(['foreignAssets', 'PF'], bn(PF.foreign), data(['financial.pensionForeignAssets']));
  // pension rights
  const rights = PF.assets * (1 - PF.netWorthShare);
  put(['pensionRights', 'PF'], bn(rights), data(['financial.pensionAssets', 'financial.pensionNetFinancialAssets2024', 'financial.pensionFinancialAssets2024'], `Assets × (1 − the funds’ net-worth share of assets, ${(100 * PF.netWorthShare).toFixed(2)}% from the 2024 financial accounts)`));
  put(['pensionRights', 'HW'], bn(rights) * p('eShareW'), allocated(['financial.pensionAssets'], `Key: the placeholder eShareW (${p('eShareW')}), the working-age share of rights`));
  // instruments that start empty
  put(['kronaLoansW', 'B'], 0, allocated([], 'Key: the 2025 opening; no record, so non-residents have borrowed no krónur'));
  for (const j of FIRMS) put(['businessArrears', j], 0, allocated([], 'Key: every sector pays as usual at month 0'));
  // real assets
  const homes = bn(HOMES_VALUE) / housePrice0;
  for (const g of AGES) put(['homes', HH[g]], homes * HOMES_SHARE[g], allocated(['financial.residentialAssessment2027', `financial.householdTaxRealEstateShare${g}`, 'macro.housePriceRebased2025Average'], `Key: the assessed value ÷ the house-price index, split ${(100 * HOMES_SHARE[g]).toFixed(2)}% by the 2025 tax returns`));
  for (const j of FIRMS) put(['capital', j], a.stock('capital', j), allocated([], `Key: the 2025 calibration’s capital quantity, kept (no capital-stock record); ${FIRM_NAME[j]}`));
  const fills: Record<Id, Id> = { deposits: 'B', treasuryAccount: 'CB', reserves: 'CB', mortgagesN: 'HW', mortgagesI: 'HW', businessLoans: 'FR', govBonds: 'B', indexedBonds: 'PF', bankBonds: 'PF', shares: 'PF', fxReserves: 'W', foreignAssets: 'W', pensionRights: 'HO', kronaLoansW: 'W', businessArrears: 'B' };

  /* -------------------------------------------------------------- variables (§1.4) */
  const vars: Record<Id, OpeningVar> = {};
  const hold = (id: Id, x: number, source: OpeningSource, history?: number[]) => (vars[id] = { value: x, source, ...(history ? { history } : {}) });
  // the central bank
  hold('keyRate', keyRate0, data(['financial.policyRate']));
  hold('ruleRate', keyRate0, data(['financial.policyRate'], 'The rule’s own rate: the key rate in force'));
  hold('ruleAnchor', keyRate0, data(['financial.policyRate'], 'The rate the rule steps from: the key rate in force'));
  hold('neutralRate', p('i0'), closed('The neutral-rate estimate at which the rule’s target equals the key rate in force, so the rule starts at rest'));
  // prices
  hold('cpi', cpi0, data(['macro.cpiIndex', 'macro.cpiAnnualAverage', 'macro.cpiInflationYoY'], 'September 2026 ÷ the 2025 average; the past 12 months log-linear at the 12-month rate'), CPI_HISTORY);
  hold('cpiExTax', cpi0, data(['macro.cpiIndex', 'macro.cpiAnnualAverage', 'macro.cpiInflationYoY'], 'VAT unchanged, so the same as the CPI'), CPI_HISTORY);
  hold('housingCost', housingCost0, bridge(['macro.cpiExHousingInflationYoY'], 'From the CPI identity with the housing-free part at its own 12-month rate (the components’ 2025 averages are not published)'));
  hold('importPrice', importPrice0, bridge(['external.fx.tradeWeightedIndex.relative2025', 'world.partnersInflation2026'], 'At the border price (world prices × the exchange rate), so the pass-through rule is at rest; the imported-goods CPI sub-index is a gap'));
  hold('domesticPrice', domesticPrice0, evaluated('From the CPI identity: the value that, with the delivered import price, makes the housing-free part of the CPI equal its own level; last month one month lower at the housing-free rate', ['macro.cpiIndex', 'macro.cpiExHousingInflationYoY']), [domesticPrice1]);
  hold('labourCostSeen', labourCostSeen0, closed('The value whose first step keeps pace with wages per unit of trend productivity, so firms’ view of labour cost tracks the 5.7% wage growth'));
  hold('expectedInflation', expectedInflation0, data(['macro.expectedInflationBusinesses1Y', 'macro.expectedInflationMarketAgents1Y'], 'Mean of the businesses’ and market participants’ one-year expectations'));
  hold('adaptiveInflation', adaptiveInflation0, closed('(expected inflation − chi × the target) ÷ (1 − chi): the remembered inflation behind today’s expectations'));
  // housing
  hold('housePrice', housePrice0, data(['macro.housePriceRebased2025Average']));
  hold('logRealHousePrice', logRealHousePrice0, data(['macro.housePriceRebased2025Average', 'macro.cpiIndex'], 'log(house prices ÷ the CPI one kernel step back), as the house-price identity reads it'));
  // the króna
  hold('exchangeRate', exchangeRate0, data(['external.fx.tradeWeightedIndex.relative2025'], 'Krónur per unit of foreign currency against the 2025 average (up = weaker); last month one month higher at the 12-month drift'), [exchangeRate1]);
  hold('logExchangeRate', Math.log(exchangeRate0), data(['external.fx.tradeWeightedIndex.relative2025']));
  hold('kronaSentiment', 0, evaluated('The user’s króna-shock channel: empty at the start'));
  hold('tourismFelt', 0, evaluated('No tourism lever: nothing has reached bookings'));
  hold('labourInflow', 0, evaluated('No net-immigration lever: no newcomers yet'));
  // wages and jobs
  hold('wage', wage0, bridge(['macro.cpiIndex', 'macro.realWageGrowthYoY', 'macro.wageGrowthYoY'], 'The August CPI against the 2025 average × (1 + real wage growth over the year): the wage index’s 2025 average is not published; the past 12 months log-linear at 5.7%'), pathBack(wage0, wageGrowth12));
  for (const j of FIRMS)
    hold(
      `employment${j}`,
      employment[j],
      EMPLOYMENT_RATIO[j] !== undefined
        ? data(['macro.employmentRegisterRolling12M', 'macro.employmentRegisterAnnual2025', `macro.employmentRegisterRollingIndustry${{ FC: 13, XF: 32, XA: 9, XT: 31 }[j as 'FC' | 'XF' | 'XA' | 'XT']}`, `macro.employmentRegisterAnnual2025Industry${{ FC: 13, XF: 32, XA: 9, XT: 31 }[j as 'FC' | 'XF' | 'XA' | 'XT']}`], `The 2025 level × the register ratio (12 months to July 2026 over the 2025 average)`)
        : data(['macro.employmentRegisterRolling12M', 'macro.employmentRegisterAnnual2025'], 'Set with the other unmatched sector so that all jobs are the 2025 level × the register ratio of all employment'),
    );
  for (const j of FIRMS) hold(`employmentDesired${j}`, employment[j], evaluated(`Today’s jobs: the jobs ${FIRM_NAME[j]} would keep with funding, at rest at today’s level`));
  // households and firms
  const consumptionAnchor = sum(AGES.map((g) => a.value(`consumption${g}`)));
  for (const g of AGES) hold(`consumption${g}`, (C0 * a.value(`consumption${g}`)) / consumptionAnchor, data(['macro.consumptionNominalRolling4Q', 'macro.consumptionNominalAnnual'], 'The model’s 2025 consumption × the national-accounts ratio (rolling four quarters ÷ 2025) × F, split by the 2025 opening shares'));
  const investmentAnchor = sum(FIRMS.map((j) => a.value(`investment${j}`)));
  for (const j of FIRMS) {
    const x = (investmentReal0 * a.value(`investment${j}`)) / investmentAnchor;
    const src = data(['macro.businessInvestmentNominalRolling4Q', 'macro.businessInvestmentNominalAnnual'], 'The model’s 2025 business investment × the national-accounts ratio × F ÷ domestic prices, split by the 2025 opening shares');
    hold(`investment${j}`, x, src);
    hold(`investmentPlan${j}`, x, src);
    hold(`investmentDesired${j}`, x, src);
  }
  // export volumes are not held: the export normals are set so that the rules give today's volumes
  for (const j of FIRMS) hold(`productiveCapitalReal${j}`, a.stock('capital', j), allocated([], `Key: the 2025 calibration’s capital quantity, as the growing variant opens; ${FIRM_NAME[j]}`));
  hold('output', output0, evaluated('Real GDP at 2025 prices from the expenditure identity; the past 12 months back at the seasonally adjusted year-on-year growth rate', ['macro.gdpRealGrowthQuarterYoYSA']), pathBack(output0, realGrowthYoY));
  hold('nominalGDP', GDP0, data(['macro.gdpNominalRolling4Q'], `The rolling four quarters × F; the past log-linear at ${(100 * gdpGrowthBack).toFixed(2)}% a year, the rate at which the average over months −14 to −3 is the rolling four quarters`), gdpHistory);
  // the government
  hold('bondRate', bondRate0, data(['financial.bondParNominal5Year'], 'The average coupon on the stock: the five-year par yield'));
  hold('taxRuleAnchor', 0, evaluated('The debt rule starts at rest: no adjustment in force'));
  hold('taxRuleAdjustment', 0, evaluated('The debt rule starts at rest'));

  /* -------------------------------------------------------------- parameters (§1.5) */
  const state: OpeningState = { stocks, fills, vars, params: {}, checks: [] };
  const set = (id: Id, x: number, provenance: Provenance, records?: Id[]) => setNormal(state, id, x, provenance, records, paramIds);
  // policy settings and world prices
  set('piT', p('piT'), dataProv(['financial.inflationTarget']), ['financial.inflationTarget']);
  set('worldPrice0', worldPrice0, assumedProv('Bridge: trading partners’ 2026 inflation forecast over the 15 months since mid-2025, (1 + 2.7%)^(15/12); the foreign-currency price index of imports is a gap'), ['world.partnersInflation2026', 'gap.external.worldPrice0']);
  set('fishPrice0', worldPrice0, assumedProv('Bridge: fish prices relative to world prices unchanged since 2025'), ['gap.external.fishPrice0']);
  set('aluminiumPrice0', worldPrice0, assumedProv('Bridge: the aluminium price relative to world prices unchanged since 2025'), ['gap.external.aluminiumPrice0']);
  set('iFnow', foreignRate0, assumedProv('Bridge: the unweighted mean of the ECB deposit rate, the Bank of England bank rate and the midpoint of the Federal Reserve’s target range; the trade-basket weights are not in the snapshot'), ['world.rate.ECB.deposit', 'world.rate.BoE.bankRate', 'world.rate.Fed.targetLower', 'world.rate.Fed.targetUpper']);
  set('tau0', p('tau0'), derivedProv('Closed form: the effective income-tax rate at which month-0 revenue equals the latest four quarters at month-0 prices (gap.fiscal.tau0: no current effective rate is published)'), ['fiscal.revenue.rolling4q', 'gap.fiscal.tau0']);
  for (const [g] of channels) set(g, p(g) * servicesScale, derivedProv(`Closed form: the 2025 level × ${servicesScale.toFixed(4)}, one common factor on the three services, so that public services at month 0 equal government consumption in the national accounts at month-0 prices`), ['macro.governmentConsumptionNominalRolling4Q', 'macro.governmentConsumptionNominalAnnual']);
  set('gInv', gInv0, derivedProv('Closed form: 2025 public investment × the national-accounts ratio × F ÷ domestic prices'), ['macro.governmentInvestmentNominalRolling4Q', 'macro.governmentInvestmentNominalAnnual']);
  set('trOA', p('trOA'), derivedProv('Closed form: scaled with family benefits by one common factor so that total expenditure at month 0 equals the latest four quarters at month-0 prices, with the model’s interest bill'), ['fiscal.expenditure.rolling4q']);
  set('trFam', p('trFam'), derivedProv('Closed form: scaled with old-age transfers by one common factor so that total expenditure matches the latest four quarters'), ['fiscal.expenditure.rolling4q']);
  set('tga', bn(TREASURY_ACCOUNT), dataProv(['financial.centralBankTreasuryISKAccount', 'financial.centralBankTreasuryFXDeposit'], 'Today’s treasury account, so the top-up issues no bonds in month 1'), ['financial.centralBankTreasuryISKAccount', 'financial.centralBankTreasuryFXDeposit']);
  set('debtR0', p('debtR0'), derivedProv('Closed form: the model’s debt ratio at month 0 (debt ÷ the past 12 months’ GDP), so the debt rule starts at rest'), ['financial.governmentBorrowingDebt']);
  set('fxr', p('fxr'), derivedProv('Closed form: the reserve target that equals today’s reserves at month 0, valued at last month’s exchange rate, today’s world-price anchor and real output'), ['financial.centralBankForeignReserves']);
  set('kapT', p('kapT'), derivedProv('Closed form: the banks’ capital ratio at month 0, so dividends do not pay out a gap'), ['financial.bankBookEquity']);
  // contract terms on today's stocks. The pension funds' domestic funding premium is on at month 0
  // (rates abroad are above their normal level, so the funds tilt home a little): the spreads are
  // net of it, so the rates open at the advertised ones.
  const fundingPremium0 = (p('kapPFdom') * p('psiPF') * (foreignRate0 - p('iF0'))) / (1 - pct('financial.pensionForeignShare'));
  set('sMN', mortgageRateN0 - keyRate0 - p('psiPFdomN') * fundingPremium0, dataProv(['financial.mortgageNAdvertised', 'financial.policyRate'], 'The advertised non-indexed mortgage rate less the key rate and the funding premium in force; the outstanding-weighted rate is a gap'), ['financial.mortgageNAdvertised']);
  set('rMI0', mortgageRateI0 - p('psiIdx') * (keyRate0 - (p('i0') + p('piT'))) - fundingPremium0, dataProv(['financial.mortgageIAdvertisedLandsbankinn', 'financial.mortgageIAdvertisedIslandsbanki', 'financial.mortgageIAdvertisedArion'], 'The mean advertised indexed rate less the key-rate pass-through psiIdx × (key rate − its normal level) and the funding premium in force'), ['financial.mortgageIAdvertisedLandsbankinn', 'financial.mortgageIAdvertisedIslandsbanki', 'financial.mortgageIAdvertisedArion']);
  set('sL', loanRate0 - keyRate0, dataProv(['financial.businessPreferredLandsbankinn', 'financial.policyRate'], 'One bank’s preferred business rate less the key rate (flagged: one bank)'), ['financial.businessPreferredLandsbankinn']);
  set('rBI0', indexedBondRate0, dataProv(['financial.bondParIndexed5Year']), ['financial.bondParIndexed5Year']);
  set('theta', (MORTGAGES.bankI + MORTGAGES.pfI) / MORTGAGE_TOTAL, dataProv(['financial.mortgagesBanksIndexed', 'financial.mortgagesPFIndexed', 'financial.mortgagesBanksNonindexed', 'financial.mortgagesPFNonindexed'], 'The indexed share of the mortgage stock'), ['financial.mortgagesBanksIndexed', 'financial.mortgagesPFIndexed']);
  // holding preferences, at today's ratios (N-a). Firms rebuild their cash buffer toward
  // dep0 × nominal GDP at firmCashSpeed a year; on a growing path the buffer is always a small,
  // steady distance behind that target (the target's growth over the time the rule takes to close
  // the gap), so the normal ratio is set with deposits that distance behind it, at today's nominal
  // GDP growth, and the cash term opens at its growth-path flow rather than at zero (decision 0018).
  const cashLag = Math.log1p(gdpGrowthBack) / ((1 - Math.exp(-p('firmCashSpeed') * dt)) / dt);
  for (const j of FIRMS) set(`dep${j}0`, (depositsOf(j) / GDP0) * (1 + cashLag), derivedProv(`Deposits of ${FIRM_NAME[j]} ÷ nominal GDP at month 0, × (1 + ${cashLag.toFixed(5)}): the cash buffer sits that far behind its target on a path growing at today’s nominal rate`), ['financial.depositsNFC', 'macro.gdpNominalRolling4Q']);
  set('bW0', bn(wBonds) / GDP0, derivedProv('Non-residents’ government bonds ÷ nominal GDP at month 0'), ['financial.treasuryBondsNominalValue']);
  set('boSh0', HOUSEHOLD_BONDS / (D.households * DEPOSIT_SHARE.O + HOUSEHOLD_BONDS), derivedProv('Older households’ bonds ÷ (their deposits + bonds) at month 0'), ['financial.householdFinancialBonds']);
  set('bbSh0', bankBonds / PF.assets, derivedProv('Bank bonds ÷ pension-fund assets at month 0'), ['financial.pensionAssets']);
  set('dPF0', D.pf / PF.assets, derivedProv('Pension funds’ deposits ÷ their assets at month 0'), ['financial.depositsPF', 'financial.pensionAssets']);
  set('nwPF0', -PF.netWorthShare, derivedProv('Pension funds’ net worth ÷ assets at month 0 (negative: rights exceed assets by the 2024 financial accounts’ ratio)'), ['financial.pensionNetFinancialAssets2024', 'financial.pensionFinancialAssets2024']);
  set('pfForeignTarget', pct('financial.pensionForeignShare'), dataProv(['financial.pensionForeignShare']), ['financial.pensionForeignShare']);
  const rateGap0 = keyRate0 - (p('i0') + p('piT')) - (foreignRate0 - p('iF0'));
  const bondW0 = bn(wBonds) / domesticPrice1;
  const depW0 = bn(D.w) / domesticPrice1;
  set('bondW', bondW0, derivedProv('Non-residents’ real government bonds: their bonds ÷ last month’s domestic prices'), ['financial.treasuryBondsNominalValue']);
  set('depW', depW0, derivedProv('Non-residents’ real króna deposits: their deposits ÷ last month’s domestic prices (keeps the share of holdings they keep in deposits at today’s)'), ['financial.depositsNonresident']);
  set('krona0', depW0 + bondW0 - bondW0 * p('psiB') * rateGap0, derivedProv(`Non-residents’ real króna holdings less the carry trade’s extra wanted bonds (bondW × psiB × the rate gap ${(100 * rateGap0).toFixed(3)} pp), so the stock part of the portfolio gap is 0 at month 0`), ['financial.depositsNonresident', 'financial.treasuryBondsNominalValue']);
  for (const mu of ['muC', 'muD', 'muI', 'muG']) set(mu, p(mu), derivedProv('Closed form: the 2025 propensity × κ, one common factor on the four home-market import propensities, so that behavioural imports at month 0 equal the reconciled imports'), ['macro.importsNominalRolling4Q']);
  // normal levels (N-b)
  for (const g of AGES) set(`pop${g}`, value(`macro.population${{ Y: 'Young', W: 'Working', O: 'Old' }[g]}`) / 1000, dataProv([`macro.population${{ Y: 'Young', W: 'Working', O: 'Old' }[g]}`]), [`macro.population${{ Y: 'Young', W: 'Working', O: 'Old' }[g]}`]);
  set('potentialOutput', p('potentialOutput'), derivedProv('Closed form: real output at month 0 ÷ (1 + the central bank’s output gap from the labour market), so firms’ capacity reading and the key-rate rule agree'), ['macro.unemploymentLFSTrend', 'macro.gapPotentialOutput']);
  for (const j of EXPORTERS) set({ XF: 'xFish', XA: 'xAlu', XT: 'xTour', XO: 'xOther' }[j], p({ XF: 'xFish', XA: 'xAlu', XT: 'xTour', XO: 'xOther' }[j]), derivedProv(`Closed form: today’s volume of ${FIRM_NAME[j]}’ exports ÷ (foreign demand felt × competitiveness^elasticity) at month 0, so the export rule opens at today’s volume`), [EXPORT_RECEIPTS[j]]);
  // policy settings already equal to data, confirmed by the checks below
  set('ltvLimit', pct('financial.mortgageLTVGeneralCap'), dataProv(['financial.mortgageLTVGeneralCap']), ['financial.mortgageLTVGeneralCap']);
  set('ltvYExtra', pct('financial.mortgageLTVFirstTimeExtra'), dataProv(['financial.mortgageLTVFirstTimeExtra']), ['financial.mortgageLTVFirstTimeExtra']);
  set('dstiY', pct('financial.mortgageDSTIFirstTimeCap'), dataProv(['financial.mortgageDSTIFirstTimeCap']), ['financial.mortgageDSTIFirstTimeCap']);
  set('dstiW', pct('financial.mortgageDSTIGeneralCap'), dataProv(['financial.mortgageDSTIGeneralCap']), ['financial.mortgageDSTIGeneralCap']);
  set('floorN', pct('financial.mortgageStressRateFloorNonindexed'), dataProv(['financial.mortgageStressRateFloorNonindexed']), ['financial.mortgageStressRateFloorNonindexed']);
  set('termN', value('financial.mortgageStressTermNonindexed'), dataProv(['financial.mortgageStressTermNonindexed']), ['financial.mortgageStressTermNonindexed']);
  set('floorI', pct('financial.mortgageStressRateFloorIndexed'), dataProv(['financial.mortgageStressRateFloorIndexed']), ['financial.mortgageStressRateFloorIndexed']);
  set('termI', value('financial.mortgageStressTermIndexed'), dataProv(['financial.mortgageStressTermIndexed']), ['financial.mortgageStressTermIndexed']);
  set('css', pct('statutory.payroll.general'), dataProv(['statutory.payroll.general']), ['statutory.payroll.general']);
  // the start gaps' bases for unemployment: today's unemployed by group (derive sets them)
  for (const g of AGES) if (paramIds.has(startGapBaseId(`unemployed${g}`))) state.params[startGapBaseId(`unemployed${g}`)] = { value: p(`U0${g}`), provenance: derivedProv('Today’s unemployed in the group, the labour-supply gap’s base: the group’s rate × its labour force at month 0') };
  if (o.conditional.includes('mortgageDemand')) for (const g of ['Y', 'W'] as const) state.params[startGapBaseId(`mortgageDemand${g}`)] = { value: 1, provenance: derivedProv('The group’s mortgage repayment at month 0, the mortgage-demand gap’s base') };

  /* ------------------------------------------------------------- anchor overrides (§1.5) */
  state.anchors = { ...Object.fromEntries(FIRMS.map((j) => [`cashServiceCoverage${j}`, 'month0' as const])), productiveCapacity: 'month0' };

  /* --------------------------------------------------------------- closed forms (§3.4) */
  const muAnchor = Object.fromEntries(['muC', 'muD', 'muI', 'muG'].map((mu) => [mu, p(mu)]));
  const exportNormal: Record<Exporter, Id> = { XF: 'xFish', XA: 'xAlu', XT: 'xTour', XO: 'xOther' };
  state.derive = (c: OpeningCtx) => {
    const params: Record<Id, number> = {};
    const v: Record<Id, number> = {};
    // the neutral rate at which the rule's target is the key rate in force
    v.neutralRate = c.v('neutralRate') + keyRate0 - c.v('ruleTarget');
    // real GDP from the identity
    v.output = c.v('realConsumption') + c.v('publicServicesReal') + c.v('investmentReal') + c.v('exportVolume') - c.v('importVolume');
    // income tax: revenue at the latest four quarters
    const gross = sum(AGES.map((g) => c.v(`grossIncome${g}`)));
    const otherRevenue = revenue(c) - sum(AGES.map((g) => c.v(`incomeTax${g}`)));
    params.tau0 = (REVENUE0 - otherRevenue) / gross;
    // transfers: expenditure at the latest four quarters
    const otherSpending = expenditure(c) - transfers(c);
    const transferScale = (EXPENDITURE0 - otherSpending) / transfers(c);
    withAnchor(paramIds, params, 'trOA', c.p('trOA') * transferScale);
    withAnchor(paramIds, params, 'trFam', c.p('trFam') * transferScale);
    // the debt rule at rest, the reserve target at today's reserves, bank dividends at today's capital ratio
    params.debtR0 = c.v('debtRatio');
    params.fxr = (100 * c.stock('fxReserves', 'CB')) / (c.base('nominalGDP') * (c.v('outputTrailing12') / c.base('outputTrailing12')) * exchangeRate1 * Math.exp(c.v('worldPriceAnchor')));
    params.kapT = c.v('capitalRatio');
    // capacity as firms read it: output ÷ (1 + the central bank's labour-market gap)
    params.potentialOutput = c.v('output') / (1 + c.v('outputGap'));
    // export normals: the rules open at today's volumes
    for (const j of EXPORTERS) withAnchor(paramIds, params, exportNormal[j], (c.p(exportNormal[j]) * volume[j]) / c.v(`exportVolume${EXPORT_OF[j]}`));
    // import propensities: behavioural imports at the reconciled level
    const behavioural = importBill(c) - c.v('importsExporters');
    const kappa = (c.p('muC') / muAnchor.muC) * ((M0 - c.v('importsExporters')) / behavioural);
    for (const mu of ['muC', 'muD', 'muI', 'muG']) params[mu] = muAnchor[mu] * kappa;
    // the labour-supply gaps' bases: today's unemployed by group
    for (const g of AGES) {
      const id = startGapBaseId(`unemployed${g}`);
      if (id in state.params) params[id] = (groupRate[g] / (1 - groupRate[g])) * (c.v(`employment${g}`) / c.p(`wb${g}`));
    }
    if (o.conditional.includes('mortgageDemand')) for (const g of ['Y', 'W'] as const) params[startGapBaseId(`mortgageDemand${g}`)] = c.v(`mortgageRepayment${g}`);
    return { params, vars: v };
  };

  /* -------------------------------------------------------------------- checks (§1.2, §1.8) */
  const check = (id: Id, label: string, records: Id[], measure: (c: IndicatorCtx) => number, x: number, tolerance: number, gate: boolean): OpeningCheck => ({ id, label, records, measure, value: x, tolerance, gate });
  const money = (x: number) => x * U; // units → ISK bn
  const withinPct = (id: Id, label: string, records: Id[], measure: (c: IndicatorCtx) => number, x: number, share: number, gate: boolean) => check(id, label, records, measure, x, share * Math.abs(x), gate);
  const ratioCheck = (id: Id, label: string, records: Id[], model: (c: IndicatorCtx) => number, recordValue: number, note: string) => check(id, `${label}: model ÷ record (${note})`, records, (c) => model(c) / recordValue, 1, 0.1, false);
  state.checks = [
    // headline values (§1.2): gates
    check('keyRate', 'Key rate', ['financial.policyRate'], (c) => c.v('keyRate'), keyRate0, 1e-12, true),
    check('inflation12', '12-month CPI inflation', ['macro.cpiInflationYoY'], (c) => c.v('inflation12'), inflation12, 0.0005, true),
    check('expectedInflation', 'One-year inflation expectations', ['macro.expectedInflationBusinesses1Y', 'macro.expectedInflationMarketAgents1Y'], (c) => c.v('expectedInflation'), expectedInflation0, 0.0005, true),
    check('unemployment', 'Unemployment rate (LFS trend)', ['macro.unemploymentLFSTrend', 'macro.unemploymentLFSSA', 'macro.unemploymentLFSSA3M'], (c) => c.v('unemployment'), unemployment0, 0.001, true),
    check('exchangeRate', 'Króna, trade-weighted, against the 2025 average', ['external.fx.tradeWeightedIndex.relative2025'], (c) => c.v('exchangeRate'), exchangeRate0, 1e-9, true),
    check('housePrice', 'House prices against the 2025 average', ['macro.housePriceRebased2025Average'], (c) => c.v('housePrice'), housePrice0, 1e-9, true),
    check('mortgageRateN', 'Non-indexed mortgage rate', ['financial.mortgageNAdvertised'], (c) => c.v('mortgageRateN'), mortgageRateN0, 0.0005, true),
    check('mortgageRateI', 'Indexed mortgage rate (real)', ['financial.mortgageIAdvertisedLandsbankinn', 'financial.mortgageIAdvertisedIslandsbanki', 'financial.mortgageIAdvertisedArion'], (c) => c.v('mortgageRateI'), mortgageRateI0, 0.0005, true),
    check('bondRate', 'Government bond rate (average coupon on the stock)', ['financial.bondParNominal5Year'], (c) => c.v('bondRate'), bondRate0, 0.0005, true),
    check('foreignRate', 'Foreign interest rate (bridge)', ['world.rate.ECB.deposit', 'world.rate.BoE.bankRate', 'world.rate.Fed.targetLower', 'world.rate.Fed.targetUpper'], (c) => c.v('foreignRate'), foreignRate0, 1e-12, true),
    check('govDebt', 'Government debt, ISK bn', ['financial.governmentBorrowingDebt'], (c) => money(govDebt(c)), GOV_DEBT, 0.1, true),
    check('govDebtRatio2025', 'Government debt, % of 2025 GDP', ['financial.governmentBorrowingDebtRatioExact'], (c) => govDebt(c), value('financial.governmentBorrowingDebtRatioExact'), 0.05, true),
    check('mortgageDebt', 'Household mortgage debt, ISK bn', ['financial.mortgagesBanksIndexed', 'financial.mortgagesBanksNonindexed', 'financial.mortgagesBanksFX', 'financial.mortgagesPFIndexed', 'financial.mortgagesPFNonindexed'], (c) => money(mortgageDebt(c)), MORTGAGE_TOTAL, 0.1, true),
    check('pfAssets', 'Pension-fund assets, ISK bn', ['financial.pensionAssets'], (c) => money(pfAssets(c)), PF.assets, 0.1, true),
    check('pfForeignShare', 'Pension funds’ foreign share, %', ['financial.pensionForeignShare'], (c) => (100 * c.stock('foreignAssets', 'PF')) / pfAssets(c), value('financial.pensionForeignShare'), 0.05, true),
    check('householdDeposits', 'Household deposits, ISK bn', ['financial.depositsHH', 'financial.depositsNPISH'], (c) => money(stock(c, 'deposits', ['HY', 'HW', 'HO'])), D.households, 0.1, true),
    check('nonBankDeposits', 'Deposits of all non-banks (money in the model), ISK bn', ['financial.depositsTotal', 'financial.depositsGovernment'], (c) => money(c.stock('deposits', 'B')), value('financial.depositsTotal') - value('financial.depositsGovernment'), 0.1, true),
    withinPct('nominalGDP', 'Nominal GDP at an annual rate, September 2026 prices', ['macro.gdpNominalRolling4Q'], (c) => c.v('nominalGDP'), GDP0, 1e-9, true),
    withinPct('imports', 'Imports (the reconciled residual) against the mapped record', ['macro.importsNominalRolling4Q', 'macro.importsNominalAnnual'], (c) => importBill(c), importsMapped, 0.02, true),
    withinPct('exports', 'Exports against the record', ['macro.exportsNominalRolling4Q'], (c) => c.v('exportValue'), exportsMapped, 0.02, true),
    check('govBalance', 'General-government balance, share of GDP', ['fiscal.revenue.rolling4q', 'fiscal.expenditure.rolling4q', 'fiscal.balance.rolling4q.pctGDP'], (c) => (revenue(c) - expenditure(c)) / c.v('nominalGDP'), pct('fiscal.balance.rolling4q.pctGDP'), 0.0005, true),
    check('revenue', 'General-government revenue, ISK bn a year', ['fiscal.revenue.rolling4q'], (c) => money(revenue(c)), value('fiscal.revenue.rolling4q') * F, 0.1, true),
    check('expenditure', 'General-government expenditure, ISK bn a year', ['fiscal.expenditure.rolling4q'], (c) => money(expenditure(c)), value('fiscal.expenditure.rolling4q') * F, 0.1, true),
    ...EXPORTERS.map((j) => withinPct(`exports${j}`, `Exports of ${FIRM_NAME[j]}, at today’s volume`, [EXPORT_RECEIPTS[j]], (c) => c.v(`exports${EXPORT_OF[j]}`), exports0[j], 1e-6, true)),
    check('ltvLimit', 'Loan-to-value cap', ['financial.mortgageLTVGeneralCap'], (c) => c.v('ltvCapW') / c.v('grossHomePurchasesW'), pct('financial.mortgageLTVGeneralCap'), 1e-9, true),
    // warnings (§1.2, §1.8): what the data cannot settle, and how far the mapping goes
    check('depositRate', 'Deposit rate against the three-month fixed rates (the outstanding-weighted rate is a gap)', ['financial.depositOutstandingWeightedRate', 'financial.depositFixed3Landsbankinn', 'financial.depositFixed3Islandsbanki', 'financial.depositFixed3Arion'], (c) => c.v('depositRate'), depositRate3M, 0.0005, false),
    check('loanRate', 'Business-loan rate (one bank)', ['financial.businessPreferredLandsbankinn'], (c) => c.v('loanRate'), loanRate0, 0.0005, false),
    withinPct('output', 'Real GDP at 2025 prices against 2025 × (1 + seasonally adjusted year-on-year growth)', ['macro.gdpRealGrowthQuarterYoYSA'], (c) => c.v('output'), outputFromGrowth, 0.03, false),
    check('currentAccount', 'Current account, share of GDP', ['external.currentAccount.rolling4q.pctGDP'], (c) => c.v('currentAccount') / c.v('nominalGDP'), pct('external.currentAccount.rolling4q.pctGDP'), 0.01, false),
    check('gdpTrailing12', 'GDP over the past 12 months, ISK bn (from the GDP history, as the kernel averages it)', ['macro.gdpNominalRolling4Q'], (c) => money(c.v('gdpTrailing12')), money(gdpTrailing12At0), 0.01, false),
    check('kappa', 'κ: the common factor on the home-market import propensities', ['macro.importsNominalRolling4Q'], (c) => c.v('importsConsumer') / (c.v('borderImportPrice') * muAnchor.muC * c.v('realConsumption') * Math.pow(Math.max(1e-6, c.v('realExchangeRate')), -p('epsM'))), 1, 0.1, false),
    ratioCheck('reservesCrossCheck', 'Bank reserves, ISK bn', ['financial.centralBankForeignReserves'], (c) => money(c.stock('reserves', 'B')), 403.3, 'banks’ deposits including at the CBI, end-2024, 403.3 bn'),
    ratioCheck('bankBondsCrossCheck', 'Bank bonds, ISK bn', ['financial.bankDebtSecuritiesLiabilities2024'], (c) => money(c.stock('bankBonds', 'B')), value('financial.bankDebtSecuritiesLiabilities2024'), 'banks’ debt securities at end-2024'),
    ratioCheck('bankAssetsCrossCheck', 'Bank assets in the model, ISK bn', ['financial.bankAssets'], (c) => money(c.stock('reserves', 'B') + c.stock('mortgagesN', 'B') + c.stock('mortgagesI', 'B') + c.stock('businessLoans', 'B') + c.stock('govBonds', 'B')), value('financial.bankAssets'), 'total assets of the banks'),
    ratioCheck('pfSharesCrossCheck', 'Pension funds’ domestic shares, ISK bn', ['financial.pensionDomesticEquitiesUnits'], (c) => money(c.stock('shares', 'PF')), value('financial.pensionDomesticEquitiesUnits'), 'domestic equities and units'),
    ratioCheck('homesCrossCheck', 'Value of homes, ISK bn', ['financial.residentialAssessment2027'], (c) => money(stock(c, 'homes', ['HY', 'HW', 'HO']) * c.v('housePrice')), 11081.6, 'tax-return real estate 2025, 11,081.6 bn'),
    ratioCheck('niipCrossCheck', 'Iceland’s net external position, ISK bn', ['external.niip.Q2_2026'], (c) => money(-netWorth(c, 'W', ['deposits', 'govBonds', 'shares'], ['fxReserves', 'foreignAssets', 'kronaLoansW'])), value('external.niip.Q2_2026'), 'the published net international investment position'),
    ratioCheck('capitalRatioCrossCheck', 'Bank capital ratio', ['financial.bankCapitalRatio'], (c) => 100 * c.v('capitalRatio'), value('financial.bankCapitalRatio'), 'published for the systemically important banks'),
    ratioCheck('householdNetWorthCrossCheck', 'Households’ net financial worth, ISK bn', ['financial.householdFinancialNetWorth'], (c) => money(sum(['HY', 'HW', 'HO'].map((h) => netWorth(c, h, ['deposits', 'govBonds', 'shares', 'pensionRights'], ['mortgagesN', 'mortgagesI'])))), value('financial.householdFinancialNetWorth'), '2024 financial accounts'),
    ratioCheck('pensionRightsCrossCheck', 'Households’ pension rights, ISK bn', ['financial.householdFinancialPensionInsurance'], (c) => money(c.stock('pensionRights', 'PF')), value('financial.householdFinancialPensionInsurance'), 'pension entitlements, end-2024'),
    ratioCheck('governmentNetWorthCrossCheck', 'Government net financial worth, ISK bn', ['financial.governmentNetFinancialAssets'], (c) => money(netWorth(c, 'G', ['treasuryAccount'], ['govBonds', 'indexedBonds'])), value('financial.governmentNetFinancialAssets'), 'the model leaves out government equity and loans; the data include pension liabilities'),
    ratioCheck('mortgageInterestCrossCheck', 'Household mortgage interest, ISK bn a year', ['macro.familyMortgageInterestTotal'], (c) => money(sum(['HY', 'HW'].map((h) => sum(['B', 'PF'].map((l) => c.v(`mortgageInterest_${h}_${l}`)))))), value('macro.familyMortgageInterestTotal'), '2025 tax returns'),
    ratioCheck('governmentInterestCrossCheck', 'General-government interest, ISK bn a year', ['fiscal.interest.2025'], (c) => money(interest(c)), value('fiscal.interest.2025'), '2025, includes indexation and interest on other liabilities'),
    ratioCheck('pensionPayoutsCrossCheck', 'Pension payouts, ISK bn a year', ['financial.pensionDomesticBenefitsPaid2025'], (c) => money(c.v('pensionPayouts')), value('financial.pensionDomesticBenefitsPaid2025'), 'the anchor’s payout ratio is kept (decision 0018)'),
    ratioCheck('olderIncomeCrossCheck', 'Older households’ income after interest, ISK bn a year', ['macro.familyIncomeAfterInterestO'], (c) => money(c.v('disposableIncomeO')), value('macro.familyIncomeAfterInterestO'), '2025 tax returns'),
    check('propertyIncomeBound', 'Households’ property income does not exceed total capital income (upper bound), ISK bn a year', ['macro.familyCapitalIncomeTotal'], (c) => Math.max(0, money(sum(AGES.map((g) => c.v(`propertyIncome${g}`)))) - value('macro.familyCapitalIncomeTotal')), 0, 1e-9, false),
    withinPct('netMortgageLending', 'Net new mortgage lending, ISK bn a year', ['financial.netNewMortgageLendingISKbnMonth'], (c) => money(c.v('netMortgageLending')), 12 * value('financial.netNewMortgageLendingISKbnMonth'), 0.1, false),
    withinPct('netCreditTotal', 'Net new lending to households and firms, ISK bn a year', ['financial.netNewLendingHouseholdsMovingAverageISKbnMonth', 'financial.netNewLendingFirmsISKbnMonth'], (c) => money(c.v('netCreditTotal')), 12 * (value('financial.netNewLendingHouseholdsMovingAverageISKbnMonth') + value('financial.netNewLendingFirmsISKbnMonth')), 0.1, false),
    withinPct('foreignAssetPurchases', 'Pension funds’ net foreign purchases, ISK bn a year', ['financial.pensionForeignShare'], (c) => money(c.v('foreignAssetPurchases')), (72 * 12) / 8, 0.1, false),
    // the expenditure rows at face value (§1.7): the 2025 mapping shown beside each record
    ratioCheck('consumptionAtFaceValue', 'Household consumption at face value, ISK bn a year', ['macro.consumptionNominalRolling4Q'], (c) => money(c.v('consumption')), value('macro.consumptionNominalRolling4Q') * F, 'Hagstofa’s rolling four quarters at month-0 prices; the model’s 2025 consumption was 51.6% of GDP against 49.4% in the national accounts'),
    ratioCheck('servicesAtFaceValue', 'Public services at face value, ISK bn a year', ['macro.governmentConsumptionNominalRolling4Q'], (c) => money((1 + p('cEr') + p('css')) * c.v('wage') * c.v('publicEmployment') + c.v('domesticPrice') * c.v('publicPurchasesReal')), value('macro.governmentConsumptionNominalRolling4Q') * F, 'government consumption at month-0 prices'),
    ratioCheck('investmentAtFaceValue', 'Business and public investment at face value, ISK bn a year', ['macro.businessInvestmentNominalRolling4Q', 'macro.governmentInvestmentNominalRolling4Q', 'macro.housingInvestmentNominalRolling4Q'], (c) => money(c.v('domesticPrice') * c.v('investmentReal')), (value('macro.businessInvestmentNominalRolling4Q') + value('macro.governmentInvestmentNominalRolling4Q')) * F, 'the model has no line for housing investment or inventories'),
  ];

  /* ---------------------------------------------------------------- continuity (T4) */
  const log = (f: (c: IndicatorCtx) => number) => (c: IndicatorCtx) => Math.log(f(c));
  const row = (id: Id, label: string, measure: (c: IndicatorCtx) => number, bound: number, trend?: number): OpeningContinuity => ({ id, label, measure, bound, ...(trend !== undefined ? { trend } : {}) });
  const monthly = (yearly: number) => Math.log1p(yearly) / 12;
  state.continuity = [
    row('wageGrowth', 'Wage growth, a year', (c) => c.v('wageGrowth'), 0.005),
    row('inflation', 'Inflation this month, annualised', (c) => c.v('inflation'), 0.01),
    row('logExchangeRate', 'Exchange rate (log; month 1 is solved to today’s drift)', (c) => c.v('logExchangeRate'), 0.005),
    row('keyRate', 'Key rate', (c) => c.v('keyRate'), 0.001),
    ...['depositRate', 'loanRate', 'mortgageRateN', 'mortgageRateI', 'bondRate', 'bankBondRate'].map((id) => row(id, `${id} (a rate)`, (c) => c.v(id), 0.001)),
    row('importPrice', 'Wholesale import prices (log)', log((c) => c.v('importPrice')), 0.005),
    row('realConsumption', 'Real consumption (log)', log((c) => c.v('realConsumption')), 0.005, monthly(p('growthReal'))),
    row('businessInvestment', 'Real business investment (log)', log((c) => sum(FIRMS.map((j) => c.v(`investment${j}`)))), 0.005, monthly(p('growthReal'))),
    row('employment', 'Jobs in firms (log)', log((c) => sum(FIRMS.map((j) => c.v(`employment${j}`)))), 0.005, monthly(p('growthPopulation'))),
    row('logRealHousePrice', 'Real house prices (log)', (c) => c.v('logRealHousePrice'), 0.005),
    row('housingCost', 'Housing costs (log)', log((c) => c.v('housingCost')), 0.005, monthly(p('growthInflation'))),
    row('lenderConfidence', 'Lender confidence', (c) => c.v('lenderConfidence'), 0.02),
    row('creditApprovalRatio', 'Business credit approved ÷ requested', (c) => c.v('businessCreditApproved') / Math.max(1e-9, c.v('businessCreditRequested')), 0.01),
    ...['deficit', ...FIRMS.map((j) => `borrowing${j}`), 'netMortgageLending', 'bondIssue', 'currentAccount', 'bondPurchasesW', 'foreignAssetPurchases', 'fxReserveSales'].map((id) => row(id, `${id} (a net flow, model units a year)`, (c) => c.v(id), 0.3)),
  ];

  /* ------------------------------------------------------------------ the solve (§3.3) */
  const unknowns: OpeningUnknown[] = [];
  const targets: OpeningTarget[] = [];
  const solve = (group: Id, target: OpeningTarget) => {
    unknowns.push({ param: startGapId(group) });
    targets.push(target);
  };
  solve('wage', { id: 'wage-growth', describe: 'Wages keep growing 5.7% a year in month 1', records: ['macro.wageGrowthYoY'], scale: 0.01, residual: (_0, one) => one.v('wageGrowth') - wageGrowth12 });
  for (const g of AGES)
    solve(`labourSupply${g}`, {
      id: `unemployment${g}`,
      describe: `Unemployment of the ${{ Y: 'young', W: 'working-age', O: 'older' }[g]} at month 0 is the group’s 2025 rate × 5.8 ÷ the 2025 normal rate, so the total is 5.8%`,
      records: ['macro.unemploymentLFSTrend'],
      scale: 0.01,
      residual: (zero) => zero.v(`unemployment${g}`) - groupRate[g],
    });
  solve('markup', { id: 'inflation', describe: 'CPI inflation in month 1, annualised, is 5.7% (the six-month annualised rate)', records: ['macro.cpiAnnualized6M'], scale: 0.01, residual: (zero, one) => 12 * Math.log(one.v('cpi') / zero.v('cpi')) - pct('macro.cpiAnnualized6M') });
  solve('krona', { id: 'krona-drift', describe: 'The króna keeps strengthening at its 12-month rate in month 1', records: ['financial.tradeWeightedIndexNarrowYoY'], scale: 0.01, residual: (zero, one) => 12 * (one.v('logExchangeRate') - zero.v('logExchangeRate')) - kronaDrift });
  const conditionalTargets: Record<Id, OpeningTarget> = {
    spending: { id: 'consumption-trend', describe: 'Real consumption grows at the growing variant’s real trend in month 1', records: [], scale: 0.01, residual: (zero, one) => 12 * Math.log(one.v('realConsumption') / zero.v('realConsumption')) - Math.log1p(p('growthReal')) },
    investment: { id: 'investment-trend', describe: 'Real business investment grows at the real trend in month 1', records: [], scale: 0.01, residual: (zero, one) => 12 * Math.log(sum(FIRMS.map((j) => one.v(`investment${j}`))) / sum(FIRMS.map((j) => zero.v(`investment${j}`)))) - Math.log1p(p('growthReal')) },
    hiring: { id: 'employment-trend', describe: 'Jobs in firms grow at the population trend in month 1', records: [], scale: 0.01, residual: (zero, one) => 12 * Math.log(sum(FIRMS.map((j) => one.v(`employment${j}`))) / sum(FIRMS.map((j) => zero.v(`employment${j}`)))) - Math.log1p(p('growthPopulation')) },
    housePrices: { id: 'house-prices-flat', describe: 'Real house prices are unchanged in month 1', records: [], scale: 0.01, residual: (zero, one) => 12 * (one.v('logRealHousePrice') - zero.v('logRealHousePrice')) },
    rents: { id: 'rents-trend', describe: 'Housing costs grow at the price trend in month 1', records: [], scale: 0.01, residual: (zero, one) => 12 * Math.log(one.v('housingCost') / zero.v('housingCost')) - Math.log1p(p('growthInflation')) },
    mortgageDemand: { id: 'mortgage-lending-flat', describe: 'Net mortgage lending is unchanged in month 1', records: [], scale: 0.1, residual: (zero, one) => one.v('netMortgageLending') - zero.v('netMortgageLending') },
  };
  for (const group of o.conditional) {
    if (!conditionalTargets[group]) throw new Error(`Iceland today: no conditional start-gap family '${group}'`);
    solve(group, conditionalTargets[group]);
  }
  const ids = unknowns.map((u) => ('param' in u ? u.param : u.var));
  const matches = ids.every((id) => id in o.committed) && Object.keys(o.committed).every((id) => ids.includes(id));
  state.solve = { unknowns, targets, ...(matches ? { solution: { ...o.committed } } : {}) };
  return state;
}
