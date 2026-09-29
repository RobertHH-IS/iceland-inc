/**
 * What the lever-response report (lever-report.ts) follows in each model: the headline
 * variables every run is summarised by, and the policy instruments that must hold still on
 * Manual unless the user moves their own lever.
 *
 * A headline is an indicator (its display transform decides the unit), or a level computed from
 * variables with a display transform of its own. `gradual` marks a variable that should adjust
 * over months, not jump (output, jobs, spending, stocks): the report flags a month-1 jump for
 * those only. `policy` marks a policy instrument, which the Manual-versus-Automatic sign test
 * leaves out because the stabilisers move it on Automatic by design.
 *
 * Units must say what they measure (UNIT_MEANINGS in lever-report.ts defines each one the report
 * may show): a ratio to nominal GDP is 'pp of GDP'; a nominal amount in % of baseline GDP is
 * 'pp of baseline GDP'.
 */
import type { Id, IndicatorDef } from '../core/types.ts';

export type HeadlineSpec =
  | { indicator: Id; label?: string; gradual?: boolean; policy?: boolean }
  | {
      id: Id;
      label: string;
      /** Variables the level reads, so a missing id fails loudly. */
      vars: Id[];
      level: (v: (id: Id) => number) => number;
      display: Exclude<IndicatorDef['display'], 'level'>;
      /** Unit of the effect for display 'deviation' (for example 'pp of GDP' for a ratio to GDP). */
      unit?: string;
      gradual?: boolean;
      policy?: boolean;
    };

/** A policy instrument (a variable in model units) and the levers that may move it on Manual. */
export interface PolicyInstrument {
  variable: Id;
  label: string;
  levers: Id[];
}

/** A shock a lever needs before it can act (a migration buffer needs job changes to buffer): the
 *  lever is also run with it, and measured against the run with the companion alone. */
export interface Companion {
  lever: Id;
  value: number;
  why: string;
}

export interface LeverReportSpec {
  headlines: HeadlineSpec[];
  policy: PolicyInstrument[];
  /** Headline topics the model does not have, named in the report so their absence is visible. */
  missing?: string[];
  /** Companion shocks, by lever id. */
  companions?: Record<Id, Companion>;
}

const real = (nominal: Id[], price: Id) => (v: (id: Id) => number) => nominal.reduce((a, id) => a + v(id), 0) / v(price);

export const leverReportSpecs: Record<Id, LeverReportSpec> = {
  reference: {
    headlines: [
      { indicator: 'output', gradual: true },
      { indicator: 'inflation' },
      { id: 'priceLevel', label: 'Price level', vars: ['price'], level: (v) => v('price'), display: 'deviation-pct' },
      { indicator: 'unemployment', gradual: true },
      { indicator: 'keyRate', policy: true },
      { id: 'realWage', label: 'Real wage', vars: ['wage', 'price'], level: (v) => v('wage') / v('price'), display: 'deviation-pct' },
      { id: 'realConsumption', label: 'Consumption (real)', vars: ['consumption', 'price'], level: real(['consumption'], 'price'), display: 'deviation-pct', gradual: true },
      { id: 'investment', label: 'Investment (real)', vars: ['investmentReal'], level: (v) => v('investmentReal'), display: 'deviation-pct', gradual: true },
      { indicator: 'privateDebt', gradual: true },
      { indicator: 'broadMoney', gradual: true },
      // Ratios to this month's nominal GDP, like the debt indicators: a nominal level in % of
      // baseline GDP would grow with the price level.
      { id: 'deficit', label: 'Government deficit (to GDP)', vars: ['deficit', 'gdp'], level: (v) => (100 * v('deficit')) / v('gdp'), display: 'deviation', unit: 'pp of GDP' },
      { indicator: 'govDebt', gradual: true },
      { id: 'bankEquity', label: 'Bank equity (to GDP)', vars: ['bankEquity', 'gdp'], level: (v) => (100 * v('bankEquity')) / v('gdp'), display: 'deviation', unit: 'pp of GDP', gradual: true },
      { id: 'realDisposableIncome', label: 'Disposable income (real)', vars: ['disposableIncome', 'price'], level: real(['disposableIncome'], 'price'), display: 'deviation-pct' },
      { id: 'realProfit', label: 'Firms’ cash profit (real)', vars: ['firmProfit', 'price'], level: real(['firmProfit'], 'price'), display: 'deviation-pct' },
      // The rate taxes are actually charged at: the debt rule's rate plus the lever's shift, which
      // the taxRate variable leaves out (the taxes rule adds it), so it is taxes ÷ taxed income.
      {
        id: 'taxRate',
        label: 'Income-tax rate (charged)',
        vars: ['taxes', 'wages', 'depositInterestHH', 'firmDividends', 'bankDividends'],
        level: (v) => v('taxes') / (v('wages') + v('depositInterestHH') + v('firmDividends') + v('bankDividends')),
        display: 'deviation-pp',
        policy: true,
      },
    ],
    policy: [
      { variable: 'keyRate', label: 'key rate', levers: ['keyRateFixed', 'keyRateAddon'] },
      { variable: 'taxRate', label: 'debt rule’s income-tax rate', levers: [] },
    ],
    missing: ['the króna', 'exports', 'imports', 'the current account', 'house prices (a closed economy without housing)'],
  },
  iceland: {
    headlines: [
      { indicator: 'output', gradual: true },
      { indicator: 'inflation' },
      { indicator: 'priceLevel' },
      { indicator: 'unemployment', gradual: true },
      { indicator: 'keyRate', policy: true },
      { indicator: 'krona' },
      { indicator: 'realWage' },
      { indicator: 'consumption', gradual: true },
      { indicator: 'investment', gradual: true },
      { indicator: 'exports', gradual: true },
      { indicator: 'imports', gradual: true },
      { indicator: 'currentAccount' },
      { indicator: 'realHousePrice' },
      { indicator: 'mortgageDebt', gradual: true },
      { indicator: 'broadMoney', gradual: true },
      { indicator: 'govBalance' },
      { indicator: 'govDebt', gradual: true },
      { indicator: 'bankCapital', gradual: true },
      {
        id: 'realDisposableIncome',
        label: 'Disposable income, all households (real)',
        vars: ['disposableIncomeY', 'disposableIncomeW', 'disposableIncomeO', 'cpi'],
        level: real(['disposableIncomeY', 'disposableIncomeW', 'disposableIncomeO'], 'cpi'),
        display: 'deviation-pct',
      },
      { indicator: 'profitsFD' },
      { indicator: 'profitsFX' },
      { indicator: 'incomeTaxRate', policy: true },
      { id: 'vatRate', label: 'VAT rate (effective)', vars: ['vatRate'], level: (v) => v('vatRate'), display: 'deviation-pp', policy: true },
    ],
    policy: [
      { variable: 'keyRate', label: 'key rate', levers: ['keyRateFixed', 'keyRateAddon'] },
      { variable: 'taxRate', label: 'income-tax rate', levers: ['incomeTax', 'incomeTaxOffset'] },
      { variable: 'vatRate', label: 'VAT rate', levers: ['vat'] },
    ],
    companions: {
      migration: { lever: 'foreignDemand', value: -20, why: 'the buffer acts only on changes in jobs from the baseline, and there are none without a shock' },
      bondBuyers: { lever: 'publicInvestment', value: 2, why: 'the choice acts only on new bonds, and the baseline budget balances, so none are sold without a deficit' },
    },
  },
};
