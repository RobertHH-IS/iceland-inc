/**
 * Iceland Inc.: the 20 calibration checks of engine v1 (legacy/v1-engine/tools/calibration_checks.js),
 * with the same scenarios and target ranges. They are CHECKS on whole-model responses, never
 * equations. Each range's source is in `source` (v1 SPEC §7.3 and the research report,
 * docs/research/icelandic-economy-flow-simulation.md).
 *
 * Series are indexed by month (0 = baseline), in display units, as in v1.
 */
import type { CalibrationCheck, ModelDef, RunResult, ScenarioEvent } from '../../core/types.ts';
import { createEngine, type KernelEngine } from '../../core/engine.ts';
import { runScenario } from '../../core/scenario.ts';

const quarter = (month: number) => Math.ceil(month / 3);
function argBest(a: number[], better: (x: number, y: number) => boolean, from: number, to: number): number {
  let j = from;
  for (let k = from; k <= Math.min(to, a.length - 1); k++) if (better(a[k], a[j])) j = k;
  return j;
}
const argmin = (a: number[], from: number, to: number) => argBest(a, (x, y) => x < y, from, to);
const argmax = (a: number[], from: number, to: number) => argBest(a, (x, y) => x > y, from, to);

/* ----------------------------------------------------------------- scenarios */
const RATE: ScenarioEvent[] = [
  { t: 0, lever: 'keyRateAddon', value: 1 },
  { t: 24, lever: 'keyRateAddon', value: 0 },
];
const WAGE: ScenarioEvent[] = [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }];
const G_BANKS: ScenarioEvent[] = [
  { t: 0, lever: 'bondBuyers', value: 1 },
  { t: 0, lever: 'otherServices', value: 1 },
];
const G_FUNDS: ScenarioEvent[] = [
  { t: 0, lever: 'bondBuyers', value: 3 },
  { t: 0, lever: 'otherServices', value: 1 },
];
const KRONA: ScenarioEvent[] = [{ t: 0, lever: 'kronaShock', value: -10, fire: true }];
const LEND_12: ScenarioEvent[] = [
  { t: 0, lever: 'lendingAppetite', value: 1 },
  { t: 12, lever: 'lendingAppetite', value: 0 },
];
const LEND_HELD: ScenarioEvent[] = [{ t: 0, lever: 'lendingAppetite', value: 1 }];

/* ------------------------------------------------------------------ sources */
const SRC = {
  rate: 'CBI QMM (Monetary Bulletin, QMM v2.1): 1 pp for four quarters lowers output about 0.4% and inflation about 0.24 pp at a trough near quarter 5, króna +0.7–1% (docs/research report, "The CBI raises the key rate"; v1 SPEC §7.3). https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf',
  wage: 'Research report, "Wages +10%": CPI about +2% in year 1 rising toward +4% as pass-through completes (CBI MB 2026/2 Box 2), policy rate +1 to +1.5 pp at the peak (DYNIMO scaled), unemployment +0.5–1 pp (v1 SPEC §7.3). https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageBack: 'Research report, "Wages +10%", settles in years 3–6: real variables return to baseline because the wage share is anchored in the long run (CBI QMM v4.0 long-run homogeneity; v1 SPEC §7.3). https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf',
  fiscal: 'Research report, fiscal expansion: output +0.3–0.6% for deficit-financed spending, inferred from the ~0.7 cross-country median multiplier and Iceland’s openness (IMF WP 2026/043); v1 SPEC §7.3. https://www.elibrary.imf.org/view/journals/001/2026/043/article-A001-en.xml',
  money: 'Accounting mechanism: deficits add deposits when banks buy the bonds and move existing deposits when pension funds do (Bank of England 2014, "Money creation in the modern economy"; research report §1); v1 SPEC §7.3 requires a gap of at least 0.5 pp.',
  krona: 'CBI WP85 exchange-rate pass-through: a 10% depreciation raises the CPI about 1.5 pp within a year and 2.3 pp in the long run (research report, "A 10% króna depreciation"; v1 SPEC §7.3). https://ideas.repec.org/p/ice/wpaper/wp85.html',
  credit: 'Credit-impulse definition (Biggs, Mayer & Pick 2010; Keen 2011): positive while new credit accelerates, negative when a temporary boost ends, near zero when a higher flow is merely held (research report, "Banks’ lending appetite rises"; v1 SPEC §7.3). https://www.bde.es/f/webpi/SES/seminars/2015/files/sie1515.pdf',
};

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
];
