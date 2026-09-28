/**
 * Iceland Inc.: the 20 calibration checks of engine v1 (legacy/v1-engine/tools/calibration_checks.js),
 * with the same scenarios and target ranges, three checks on the firm sectors (decision 0003),
 * one on the world-prices lever (audit H5) and five on the stabiliser setting (decision 0004).
 *
 * Every published response these checks compare with comes from an economy whose policy reacts:
 * the central bank follows its rule and the debt rule leans on income tax. So each of these 24
 * scenarios first sets stabilisers to Automatic at month 0 (AUTO), which keeps the results of the
 * 23 that predate it exactly as they were before Manual became the default. The Manual checks run with the
 * default setting.
 * They are CHECKS on whole-model responses, never equations. Each range's source is in `source`
 * (v1 SPEC §7.3, the research report docs/research/icelandic-economy-flow-simulation.md, and
 * data/iceland/calibration.json for the sector checks).
 *
 * Series are indexed by month (0 = baseline), in display units, as in v1.
 */
import type { CalibrationCheck, ModelDef, RunResult, ScenarioEvent } from '../../core/types.ts';
import { createEngine, type KernelEngine } from '../../core/engine.ts';
import { runScenario } from '../../core/scenario.ts';
import { centralBank } from './modules/central-bank.ts';
import { indicators } from './modules/indicators.ts';

const quarter = (month: number) => Math.ceil(month / 3);
function argBest(a: number[], better: (x: number, y: number) => boolean, from: number, to: number): number {
  let j = from;
  for (let k = from; k <= Math.min(to, a.length - 1); k++) if (better(a[k], a[j])) j = k;
  return j;
}
const argmin = (a: number[], from: number, to: number) => argBest(a, (x, y) => x < y, from, to);
const argmax = (a: number[], from: number, to: number) => argBest(a, (x, y) => x > y, from, to);

/* ----------------------------------------------------------------- scenarios */
/** Policy reacts: the central bank's rule and the debt rule act (stabilisers on Automatic). */
const AUTO: ScenarioEvent = { t: 0, lever: 'stabilisers', value: 1 };
const RATE: ScenarioEvent[] = [
  AUTO,
  { t: 0, lever: 'keyRateAddon', value: 1 },
  { t: 24, lever: 'keyRateAddon', value: 0 },
];
const WAGE: ScenarioEvent[] = [AUTO, { t: 0, lever: 'wageSettlement', value: 10, fire: true }];
const G_BANKS: ScenarioEvent[] = [
  AUTO,
  { t: 0, lever: 'bondBuyers', value: 1 },
  { t: 0, lever: 'otherServices', value: 1 },
];
const G_FUNDS: ScenarioEvent[] = [
  AUTO,
  { t: 0, lever: 'bondBuyers', value: 3 },
  { t: 0, lever: 'otherServices', value: 1 },
];
const KRONA: ScenarioEvent[] = [AUTO, { t: 0, lever: 'kronaShock', value: -10, fire: true }];
const LEND_12: ScenarioEvent[] = [
  AUTO,
  { t: 0, lever: 'lendingAppetite', value: 1 },
  { t: 12, lever: 'lendingAppetite', value: 0 },
];
const LEND_HELD: ScenarioEvent[] = [AUTO, { t: 0, lever: 'lendingAppetite', value: 1 }];
const TOURISM: ScenarioEvent[] = [AUTO, { t: 0, lever: 'tourism', value: -30 }];
const ALUMINIUM: ScenarioEvent[] = [AUTO, { t: 0, lever: 'aluminiumPrice', value: 20 }];
const WORLD: ScenarioEvent[] = [AUTO, { t: 0, lever: 'importPrices', value: 10 }];
/** Stabilisers on Manual (the default): policy levers stay where they are set. */
const M_TAX: ScenarioEvent[] = [{ t: 0, lever: 'incomeTax', value: 1 }];
const M_WAGE: ScenarioEvent[] = [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }];
const FIRMS = ['FC', 'FR', 'XF', 'XA', 'XT', 'XO'] as const;

/* ------------------------------------------------------------------ sources */
const SRC = {
  rate: 'CBI QMM (Monetary Bulletin, QMM v2.1): 1 pp for four quarters lowers output about 0.4% and inflation about 0.24 pp at a trough near quarter 5, króna +0.7–1% (docs/research report, "The CBI raises the key rate"; v1 SPEC §7.3). https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf',
  wage: 'Research report, "Wages +10%": CPI about +2% in year 1 rising toward +4% as pass-through completes (CBI MB 2026/2 Box 2), policy rate +1 to +1.5 pp at the peak (DYNIMO scaled), unemployment +0.5–1 pp (v1 SPEC §7.3). https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageBack: 'Research report, "Wages +10%", settles in years 3–6: real variables return to baseline because the wage share is anchored in the long run (CBI QMM v4.0 long-run homogeneity; v1 SPEC §7.3). https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf',
  fiscal: 'Research report, fiscal expansion: output +0.3–0.6% for deficit-financed spending, inferred from the ~0.7 cross-country median multiplier and Iceland’s openness (IMF WP 2026/043); v1 SPEC §7.3. https://www.elibrary.imf.org/view/journals/001/2026/043/article-A001-en.xml',
  money: 'Accounting mechanism: deficits add deposits when banks buy the bonds and move existing deposits when pension funds do (Bank of England 2014, "Money creation in the modern economy"; research report §1); v1 SPEC §7.3 requires a gap of at least 0.5 pp.',
  krona: 'CBI WP85 exchange-rate pass-through: a 10% depreciation raises the CPI about 1.5 pp within a year and 2.3 pp in the long run (research report, "A 10% króna depreciation"; v1 SPEC §7.3). https://ideas.repec.org/p/ice/wpaper/wp85.html',
  credit: 'Credit-impulse definition (Biggs, Mayer & Pick 2010; Keen 2011): positive while new credit accelerates, negative when a temporary boost ends, near zero when a higher flow is merely held (research report, "Banks’ lending appetite rises"; v1 SPEC §7.3). https://www.bde.es/f/webpi/SES/seminars/2015/files/sie1515.pdf',
  tourism:
    'Reasoned from 2020: foreign visitor numbers fell by about three-quarters and the króna lost nearly 10% in trade-weighted terms over the year (euro 14.9% dearer), cushioned by pension funds pausing FX purchases and by central-bank FX sales (Íslandsbanki, Economic review 2020; Landsbankinn, 8 January 2021; CBI Monetary Bulletin 2020/4). Scaled to a 30% fall, about 4%; the model has no FX intervention, so up to 10%. Tourism is 13% of GDP of exports and the exporter most sensitive to the exchange rate, so its output must fall most (calibration.json: firm_sectors.tourism). https://www.landsbankinn.is/en/news/2021/01/08/the-icelandic-krona-depreciated-in-2020',
  aluminium:
    'Reasoned from ownership and tax: the three smelters are wholly foreign-owned (Rio Tinto, Alcoa, Century), so every króna of profit they do not reinvest is paid abroad; corporate tax takes about 9% of profit (effective rate from Hagstofa THJ05132); inward-FDI equity income was 78% dividends and 22% reinvested earnings in 2024 (Eurostat bop_c6_a). So 60–95% of a windfall should leave within two years (calibration.json: firm_sectors.aluminium).',
  world:
    'Purchasing-power parity is a slow anchor: Sarno and Taylor (2002) report half-lives of three to five years for deviations from PPP, so parity alone absorbs 13–21% of a lasting rise in world prices within a year, about 2% of a 10% rise. With policy reacting, the higher key rate adds a carry appreciation (0.3–1.5% per point, the rate-krona range above; the rule raises the rate by up to about 2 points). So after a year the króna should have strengthened by well under half the shock: 0–5%. Fish revenue in krónur must still be up by at least half the shock after 6 months (audit H5, 29 September 2026). https://doi.org/10.1017/CBO9780511754920',
  manualHeld: 'Design of the stabiliser setting (decision 0004): on Manual no policy lever moves unless the user moves it, so the key rate is the level of its lever, exactly, whatever else happens.',
  manualTax:
    'Reasoned: +1 pp on a tax base of about 65% of GDP raises revenue by about 0.65% of GDP. Tax multipliers are at or below spending multipliers (cross-country median spending multiplier about 0.7, IMF WP 2026/043, smaller in open economies), and with the key rate held there is no monetary offset: a year-2 multiplier of 0.25–1.2 gives output −0.15% to −0.8%. https://www.elibrary.imf.org/view/journals/001/2026/043/article-A001-en.xml',
  manualWage:
    'As the Automatic check (research report, "Wages +10%": CPI about +2% in year 1 rising toward +4% as pass-through completes, CBI MB 2026/2 Box 2), without the rate rise that damps it, so up to the 4% of full pass-through. The central bank’s rule must be calling for a higher rate at the peak: its suggestion is more than its threshold above the held key rate. Every chart must stay finite for 20 years.',
  drift: 'Architecture §4.5: the baseline is a steady state in both stabiliser modes; with no shock nothing may move by more than the harness’s drift limit of 1e-9 over 20 years.',
  squeeze:
    'First-round arithmetic on Hagstofa THJ08420 (2025): a 10% wage rise cuts profit by 10% × labour cost ÷ profit. Labour cost is 72% of tourism’s value added (labour ÷ profit about 3) and about 45% of retail and services’ once VAT and housing services are counted (about 0.85): a ratio near 3.5 on impact, less as prices catch up (calibration.json: firm_sectors).',
};

/** Percent change of a raw variable from month 0. */
const pctOf = (run: RunResult, id: string, m: number) => 100 * (run.value(id, m) / run.value(id, 0) - 1);

/** Largest absolute value any chart shows over the run (charts are deviations from baseline). */
const CHARTS = (indicators.indicators ?? []).map((i) => i.id);
function largestChartMove(run: RunResult): number {
  let worst = 0;
  for (const id of CHARTS) for (const x of run.series(id)) worst = Number.isFinite(x) ? Math.max(worst, Math.abs(x)) : Infinity;
  return worst;
}

/** The key-rate stabiliser, its threshold and the key-rate lever's default (Manual level). */
const RATE_RULE = centralBank.stabilisers!.find((s) => s.id === 'keyRateRule')!;
const HELD_RATE = centralBank.levers!.find((l) => l.id === RATE_RULE.lever)!.default;

/* ------------------------------------- the bank- versus fund-financed money gap */

let modelForComparisons: ModelDef | null = null;
let fallbackFundsRun: RunResult | null = null;
/** index.ts registers the model so a comparison run can be made without an engine at hand. */
export function bindCalibrationModel(def: ModelDef): void {
  modelForComparisons = def;
  fallbackFundsRun = null;
}

/**
 * The g.money check compares two scenarios. A CalibrationCheck has one, so the measure runs the
 * pension-fund-financed counterpart itself: on the same compiled model, baseline and step length
 * when the run carries its engine (the harness and `bun test` pass runScenario results), else on
 * a fresh engine of the registered model at the standard step.
 */
function fundsFinancedRun(run: RunResult, months: number): RunResult {
  const engine = (run as RunResult & { engine?: KernelEngine }).engine;
  if (engine) return runScenario(engine, G_FUNDS, months);
  if (!modelForComparisons) throw new Error('calibration: the Iceland model is not registered for comparison runs');
  fallbackFundsRun ??= runScenario(createEngine(modelForComparisons), G_FUNDS, 72);
  return fallbackFundsRun;
}

/* -------------------------------------------------------------------- checks */

const wageBack = (id: string, label: string): CalibrationCheck => ({
  id: `wage-back-${id}`,
  label: `Wages +10%: ${label} at year 6 ÷ peak deviation`,
  scenario: WAGE,
  months: 72,
  measure: (run) => {
    const a = run.series(id);
    const j = argmax(a.map(Math.abs), 1, 72);
    return Math.abs(a[72] / a[j]);
  },
  range: [0, 0.25],
  source: SRC.wageBack,
});

export const calibration: CalibrationCheck[] = [
  {
    id: 'rate-output-trough',
    label: 'Key rate +1 pp for 8 quarters: output trough, % vs baseline',
    scenario: RATE,
    months: 72,
    measure: (run) => {
      const a = run.series('output');
      return a[argmin(a, 1, 48)];
    },
    range: [-0.6, -0.25],
    source: SRC.rate,
  },
  {
    id: 'rate-output-timing',
    label: 'Key rate +1 pp for 8 quarters: quarter of the output trough',
    scenario: RATE,
    months: 72,
    measure: (run) => quarter(argmin(run.series('output'), 1, 48)),
    range: [4, 7],
    source: SRC.rate,
  },
  {
    id: 'rate-inflation-trough',
    label: 'Key rate +1 pp for 8 quarters: 12-month inflation trough, pp vs baseline',
    scenario: RATE,
    months: 72,
    measure: (run) => {
      const a = run.series('inflation');
      return a[argmin(a, 1, 48)];
    },
    range: [-0.35, -0.1],
    source: SRC.rate,
  },
  {
    id: 'rate-inflation-timing',
    label: 'Key rate +1 pp for 8 quarters: quarter of the inflation trough',
    scenario: RATE,
    months: 72,
    measure: (run) => quarter(argmin(run.series('inflation'), 1, 48)),
    range: [5, 9],
    source: SRC.rate,
  },
  {
    id: 'rate-krona',
    label: 'Key rate +1 pp for 8 quarters: króna appreciation, peak in the first 8 quarters, %',
    scenario: RATE,
    months: 72,
    measure: (run) => {
      const a = run.series('krona');
      return a[argmax(a, 1, 24)];
    },
    range: [0.3, 1.5],
    source: SRC.rate,
  },
  {
    id: 'wage-inflation-peak',
    label: 'Wages +10% one-off: 12-month inflation peak, pp vs baseline',
    scenario: WAGE,
    months: 72,
    measure: (run) => {
      const a = run.series('inflation');
      return a[argmax(a, 1, 72)];
    },
    range: [1.5, 3.5],
    source: SRC.wage,
  },
  {
    id: 'wage-inflation-timing',
    label: 'Wages +10% one-off: quarter of the inflation peak',
    scenario: WAGE,
    months: 72,
    measure: (run) => quarter(argmax(run.series('inflation'), 1, 72)),
    range: [4, 8],
    source: SRC.wage,
  },
  {
    id: 'wage-key-rate-peak',
    label: 'Wages +10% one-off: key-rate peak, pp vs baseline',
    scenario: WAGE,
    months: 72,
    measure: (run) => {
      const a = run.series('keyRate');
      return a[argmax(a, 1, 72)];
    },
    range: [0.8, 2],
    source: SRC.wage,
  },
  {
    id: 'wage-unemployment-peak',
    label: 'Wages +10% one-off: unemployment peak, pp vs baseline',
    scenario: WAGE,
    months: 72,
    measure: (run) => {
      const a = run.series('unemployment');
      return a[argmax(a, 1, 72)];
    },
    range: [0.3, 1.2],
    source: SRC.wage,
  },
  {
    id: 'wage-price-level-6y',
    label: 'Wages +10% one-off: price level after 6 years, % vs baseline',
    scenario: WAGE,
    months: 72,
    measure: (run) => run.series('priceLevel')[72],
    range: [3, 8],
    source: SRC.wage,
  },
  wageBack('output', 'output'),
  wageBack('unemployment', 'unemployment'),
  wageBack('realWage', 'real wage'),
  wageBack('consumption', 'consumption'),
  {
    id: 'fiscal-output-year1',
    label: 'Government purchases +1% of GDP (bank-financed): output, year-1 average, % vs baseline',
    scenario: G_BANKS,
    months: 72,
    measure: (run) => {
      const a = run.series('output');
      return a.slice(1, 13).reduce((s, x) => s + x, 0) / 12;
    },
    range: [0.3, 0.8],
    source: SRC.fiscal,
  },
  {
    id: 'fiscal-money-banks-vs-funds',
    label: 'Government purchases +1% of GDP: broad money when banks buy the bonds minus when pension funds do, pp (smaller of months 12 and 24)',
    scenario: G_BANKS,
    months: 72,
    measure: (run) => {
      const banks = run.series('broadMoney');
      const funds = fundsFinancedRun(run, 72).series('broadMoney');
      return Math.min(banks[12] - funds[12], banks[24] - funds[24]);
    },
    range: [0.5, Infinity],
    source: SRC.money,
  },
  {
    id: 'krona-price-level-8q',
    label: 'Króna sentiment −10%: price level after 8 quarters, % vs baseline',
    scenario: KRONA,
    months: 72,
    measure: (run) => run.series('priceLevel')[24],
    range: [1.5, 3],
    source: SRC.krona,
  },
  {
    id: 'lending-impulse-positive',
    label: 'Lending +1% of GDP for 12 months: credit impulse in months 1–12 (smallest), pp of GDP',
    scenario: LEND_12,
    months: 72,
    measure: (run) => Math.min(...run.series('creditImpulse').slice(1, 13)),
    range: [0.2, Infinity],
    source: SRC.credit,
  },
  {
    id: 'lending-impulse-negative',
    label: 'Lending +1% of GDP for 12 months: credit impulse in months 13–24 (largest), pp of GDP',
    scenario: LEND_12,
    months: 72,
    measure: (run) => Math.max(...run.series('creditImpulse').slice(13, 25)),
    range: [-Infinity, -0.2],
    source: SRC.credit,
  },
  {
    id: 'lending-impulse-held',
    label: 'Lending +1% of GDP held: largest absolute credit impulse in months 18–48, pp of GDP',
    scenario: LEND_HELD,
    months: 72,
    measure: (run) => Math.max(...run.series('creditImpulse').slice(18, 49).map(Math.abs)),
    range: [0, 0.3],
    source: SRC.credit,
  },
  // Firm sectors (decision 0003)
  {
    id: 'tourism-slump',
    label: 'Tourism −30% held: króna value at month 12, % vs baseline (+ stronger); tourism’s output must fall more than any other sector’s (otherwise not a number)',
    scenario: TOURISM,
    months: 72,
    measure: (run) => {
      const falls = FIRMS.map((j) => pctOf(run, `valueAdded${j}`, 12));
      const xt = falls[FIRMS.indexOf('XT')];
      const hardest = falls.every((x, k) => FIRMS[k] === 'XT' || x > xt);
      return hardest ? run.series('krona')[12] : NaN;
    },
    range: [-10, -2],
    source: SRC.tourism,
  },
  {
    id: 'aluminium-windfall-abroad',
    label: 'Aluminium price +20% held: extra dividends paid abroad ÷ the smelters’ extra profit, months 1–24; aluminium export revenue must rise (otherwise not a number)',
    scenario: ALUMINIUM,
    months: 72,
    measure: (run) => {
      if (!(run.series('exportsXA')[12] > 5)) return NaN;
      let abroad = 0,
        profit = 0;
      for (let m = 1; m <= 24; m++) {
        abroad += run.value('dividendsAbroad', m) - run.value('dividendsAbroad', 0);
        profit += run.value('profitsXA', m) - run.value('profitsXA', 0);
      }
      return abroad / profit;
    },
    range: [0.6, 0.95],
    source: SRC.aluminium,
  },
  {
    id: 'world-prices-krona-year1',
    label: 'World prices +10% held: króna value at month 12, % vs baseline (+ stronger); fish revenue in krónur must be up at least 5% at month 6 (otherwise not a number)',
    scenario: WORLD,
    months: 72,
    measure: (run) => (pctOf(run, 'exportsFish', 6) >= 5 ? run.series('krona')[12] : NaN),
    range: [0, 5],
    source: SRC.world,
  },
  {
    id: 'wage-squeeze-labour-intensive',
    label: 'Wages +10% one-off: fall in real profit in the first quarter, tourism ÷ retail and services',
    scenario: WAGE,
    months: 72,
    measure: (run) => {
      const q = (id: string) => (run.series(id)[1] + run.series(id)[2] + run.series(id)[3]) / 3;
      return q('profitsXT') / q('profitsFR');
    },
    range: [2, 6],
    source: SRC.squeeze,
  },
  // Stabilisers on Manual, the default (decision 0004): policy levers stay where they are set
  {
    id: 'manual-tax-key-rate-held',
    label: 'Manual: income tax +1 pp held: largest change in the key rate over 20 years, pp',
    scenario: M_TAX,
    months: 240,
    measure: (run) => Math.max(...run.series('keyRate').map(Math.abs)),
    range: [0, 0],
    source: SRC.manualHeld,
  },
  {
    id: 'manual-tax-output',
    label: 'Manual: income tax +1 pp held: output, year-2 average, % vs baseline',
    scenario: M_TAX,
    months: 72,
    measure: (run) => run.series('output').slice(13, 25).reduce((s, x) => s + x, 0) / 12,
    range: [-0.8, -0.15],
    source: SRC.manualTax,
  },
  {
    id: 'manual-wage-inflation-peak',
    label: 'Manual: wages +10% one-off: 12-month inflation peak, pp vs baseline; the central bank’s rule must be calling for a higher key rate at the peak and every chart must stay finite for 20 years (otherwise not a number)',
    scenario: M_WAGE,
    months: 240,
    measure: (run) => {
      const a = run.series('inflation');
      const j = argmax(a, 1, 72);
      const calling = run.value(RATE_RULE.suggestion, j) - HELD_RATE > RATE_RULE.threshold;
      return calling && Number.isFinite(largestChartMove(run)) ? a[j] : NaN;
    },
    range: [1.5, 4],
    source: SRC.manualWage,
  },
  {
    id: 'manual-no-shock-drift',
    label: 'Manual: no shock: largest move of any chart over 20 years',
    scenario: [],
    months: 240,
    measure: largestChartMove,
    range: [0, 1e-9],
    source: SRC.drift,
  },
  {
    id: 'automatic-no-shock-drift',
    label: 'Automatic: no shock: largest move of any chart over 20 years',
    scenario: [AUTO],
    months: 240,
    measure: largestChartMove,
    range: [0, 1e-9],
    source: SRC.drift,
  },
];
