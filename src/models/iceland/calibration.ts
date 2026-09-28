/**
 * Iceland Inc.: the 20 calibration checks of engine v1 (legacy/v1-engine/tools/calibration_checks.js),
 * three checks on the firm sectors (decision 0003) and five on the stabiliser setting (decision 0004).
 * After the audit of 29 September 2026 (docs/audit/2026-09-29-audit.md: M12/M20, M13, M14/M21, L26)
 * each check's scenario is the experiment its source describes, and its range is the source's where
 * the source gives one. Where the model lies outside a cited range, the check keeps v1's wider band
 * (v1 SPEC §7.3), says so in its label and source, and is listed in KNOWN_GAPS for a calibration
 * decision.
 *
 * Every published response these checks compare with comes from an economy whose policy reacts:
 * the central bank follows its rule and the debt rule leans on income tax. So each of the 23
 * original scenarios sets stabilisers to Automatic (AUTO), at month 0, or at month 12 in the rate
 * experiment, which first holds the key rate as its source does. The Manual checks run with the
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
/** The key-rate stabiliser, its threshold and the key-rate lever's default (Manual level). */
const RATE_RULE = centralBank.stabilisers!.find((s) => s.id === 'keyRateRule')!;
const HELD_RATE = centralBank.levers!.find((l) => l.id === RATE_RULE.lever)!.default;

/** Policy reacts: the central bank's rule and the debt rule act (stabilisers on Automatic). */
const AUTO: ScenarioEvent = { t: 0, lever: 'stabilisers', value: 1 };
/**
 * CBI QMM's experiment: the key rate is held 1 pp above baseline for four quarters, then the rule
 * takes over. The hold is a Manual key rate of baseline + 1 pp (relative to the lever's default, so
 * it stays a rise if the start rate changes), which also keeps the slow debt rule off for that year.
 */
const RATE: ScenarioEvent[] = [
  { t: 0, lever: 'keyRateFixed', value: HELD_RATE + 1 },
  { t: 12, lever: 'stabilisers', value: 1 },
];
const WAGE: ScenarioEvent[] = [AUTO, { t: 0, lever: 'wageSettlement', value: 10, fire: true }];
const G_BANKS: ScenarioEvent[] = [
  AUTO,
  { t: 0, lever: 'bondBuyers', value: 1 },
  { t: 0, lever: 'otherServices', value: 1 },
];
/** The research report's fiscal experiment: the government buys 1% of GDP more from firms, bank-financed. */
const G_PURCHASES: ScenarioEvent[] = [
  AUTO,
  { t: 0, lever: 'bondBuyers', value: 1 },
  { t: 0, lever: 'publicInvestment', value: 1 },
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
/** Stabilisers on Manual (the default): policy levers stay where they are set. */
const M_TAX: ScenarioEvent[] = [{ t: 0, lever: 'incomeTax', value: 1 }];
const M_WAGE: ScenarioEvent[] = [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }];
const FIRMS = ['FC', 'FR', 'XF', 'XA', 'XT', 'XO'] as const;

/* ------------------------------------------------------------------ sources */
const SRC = {
  rate: 'CBI QMM v2.1 (Monetary Bulletin): the key rate raised 1 pp for four quarters, after which the rule takes over, lowers output about 0.41% and inflation about 0.24 pp at a trough in quarter 5 (research report, "Policy rate +1 pp"). The ranges are v1’s bands around those figures (v1 SPEC §7.3). The scenario is that experiment: the key rate is held 1 pp above baseline on Manual for 12 months, which also keeps the slow debt rule off, and the Automatic rule then takes over; because the rule’s own rate has kept reacting to the weaker economy, the key rate drops about 1.4 pp in month 13, to about 0.4 pp below baseline, rather than easing down. (v1 instead added a 1 pp offset to the Automatic rule for 8 quarters, a key rate only about 0.7 pp higher on average.) https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf',
  rateKrona:
    'CBI QMM v2.1 (Monetary Bulletin): the króna rises 0.67% on impact per 1 pp of interest-rate differential, with its real peak in quarter 4 (research report, "Policy rate +1 pp" and the dial table; the "+0.7–1%" once quoted here belongs to the wage experiment). The range is 0.6 to 1.5 times the QMM figure, the relative band v1 put around the output trough (0.25–0.6 around 0.41); v1’s own band was 0.3–1.5 (v1 SPEC §7.3). The model’s peak, about 0.45, is a third below the QMM figure: its króna is less sensitive to the rate gap. https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf',
  wage: 'Research report, "Wages +10%": CPI about +2% in year 1 rising toward about +4% as pass-through completes (CBI MB 2026/2 Box 2); the ranges are v1’s bands around those figures (v1 SPEC §7.3). https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageRate: 'Research report, "Wages +10%": policy rate +1 to +1.5 pp at the peak, in quarters 2–4 (CBI DYNIMO, +0.3 pp per 1 pp of wages above baseline for two years, scaled; CBI MB 2026/2). v1’s band was 0.8–2 (v1 SPEC §7.3); the range is now the cited one. https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageJobs:
    'Research report, "Wages +10%": unemployment +0.5–1 pp at the peak (CBI DYNIMO: −0.7 pp of hours per +1 pp of wages, CBI MB 2026/2; the size of the cap on a 10% shock is the report’s assumption). KNOWN GAP: the model’s peak, about 0.47, is below the cited 0.5, as v1’s was (+0.42); the range is v1’s band of 0.3–1.2 (v1 SPEC §7.3), which gives no reason for the wider bounds, kept until a calibration decision (KNOWN_GAPS). https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageBack: 'Research report, "Wages +10%", settles in years 3–6: real variables return to baseline because the wage share is anchored in the long run (CBI QMM v4.0 long-run homogeneity; v1 SPEC §7.3). https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf',
  fiscal:
    'Research report, "Government spending +1% of GDP": the government buys 1% of GDP more from firms; output +0.3–0.6% in year 1 when deficit-financed, an inference from the ~0.7 cross-country median multiplier and Iceland’s openness (IMF WP 2026/043). Public investment is the lever that is only a purchase from firms, so the check uses it, with the cited range. (v1 used the other-services lever, about a third of which is public pay with no import leakage; that mixed multiplier is about 0.72, and v1 SPEC §7.3 widened the range to 0.8 for it.) https://www.elibrary.imf.org/view/journals/001/2026/043/article-A001-en.xml',
  money: 'Accounting mechanism: deficits add deposits when banks buy the bonds and move existing deposits when pension funds do (Bank of England 2014, "Money creation in the modern economy"; research report §1); v1 SPEC §7.3 requires a gap of at least 0.5 pp.',
  krona:
    'Loose whole-model check, not like for like. CBI WP85 finds pass-through of 0.15 within the quarter and 0.23 in the long run per 1% of sustained depreciation, so a lasting 10% depreciation raises the CPI about 1.5 pp and then 2.3 pp; the IMF’s 0.4 at 36 months would give up to 4 pp (research report, "A 10% króna depreciation"). The scenario is instead a −10% sentiment shock that fades at 10% a year: the realised króna falls about 8% by month 3 and recovers about half within a year, as the carry and portfolio-balance terms pull it back. The range is v1’s band (v1 SPEC §7.3). KNOWN GAP: per point of realised depreciation the model passes through far more than WP85: holding the króna about 10% weaker raises the CPI about 3.3% in a year and 4.6% in two (tests/models, iceland-credit-and-checks), so the price block needs recalibrating before a sustained-depreciation check can use WP85’s figures. https://ideas.repec.org/p/ice/wpaper/wp85.html',
  credit: 'Credit-impulse definition (Biggs, Mayer & Pick 2010; Keen 2011): positive while new credit accelerates, negative when a temporary boost ends, near zero when a higher flow is merely held (research report, "Banks’ lending appetite rises"; v1 SPEC §7.3). https://www.bde.es/f/webpi/SES/seminars/2015/files/sie1515.pdf',
  tourism:
    'Reasoned from 2020: foreign visitor numbers fell by about three-quarters and the króna lost nearly 10% in trade-weighted terms over the year (euro 14.9% dearer), cushioned by pension funds pausing FX purchases and by central-bank FX sales (Íslandsbanki, Economic review 2020; Landsbankinn, 8 January 2021; CBI Monetary Bulletin 2020/4). Scaled to a 30% fall, about 4%; the model has no FX intervention, so up to 10%. Tourism is 13% of GDP of exports and the exporter most sensitive to the exchange rate, so its output must fall most (calibration.json: firm_sectors.tourism). https://www.landsbankinn.is/en/news/2021/01/08/the-icelandic-krona-depreciated-in-2020',
  aluminium:
    'Reasoned from ownership and tax: the three smelters are wholly foreign-owned (Rio Tinto, Alcoa, Century), so every króna of profit they do not reinvest is paid abroad; corporate tax takes about 9% of profit (effective rate from Hagstofa THJ05132); inward-FDI equity income was 78% dividends and 22% reinvested earnings in 2024 (Eurostat bop_c6_a). So 60–95% of a windfall should leave within two years (calibration.json: firm_sectors.aluminium).',
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
    label: 'Key rate held +1 pp for 4 quarters, then the rule: output trough, % vs baseline',
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
    label: 'Key rate held +1 pp for 4 quarters, then the rule: quarter of the output trough',
    scenario: RATE,
    months: 72,
    measure: (run) => quarter(argmin(run.series('output'), 1, 48)),
    range: [4, 7],
    source: SRC.rate,
  },
  {
    id: 'rate-inflation-trough',
    label: 'Key rate held +1 pp for 4 quarters, then the rule: 12-month inflation trough, pp vs baseline',
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
    label: 'Key rate held +1 pp for 4 quarters, then the rule: quarter of the inflation trough',
    scenario: RATE,
    months: 72,
    measure: (run) => quarter(argmin(run.series('inflation'), 1, 48)),
    range: [5, 9],
    source: SRC.rate,
  },
  {
    id: 'rate-krona',
    label: 'Key rate held +1 pp for 4 quarters, then the rule: króna appreciation, peak in the first 8 quarters, %',
    scenario: RATE,
    months: 72,
    measure: (run) => {
      const a = run.series('krona');
      return a[argmax(a, 1, 24)];
    },
    range: [0.4, 1],
    source: SRC.rateKrona,
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
    range: [1, 1.5],
    source: SRC.wageRate,
  },
  {
    id: 'wage-unemployment-peak',
    label: 'Wages +10% one-off: unemployment peak, pp vs baseline (known gap: below the cited +0.5–1 pp; v1’s band)',
    scenario: WAGE,
    months: 72,
    measure: (run) => {
      const a = run.series('unemployment');
      return a[argmax(a, 1, 72)];
    },
    range: [0.3, 1.2],
    source: SRC.wageJobs,
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
    label: 'Government purchases from firms +1% of GDP (public investment, bank-financed): output, year-1 average, % vs baseline',
    scenario: G_PURCHASES,
    months: 72,
    measure: (run) => {
      const a = run.series('output');
      return a.slice(1, 13).reduce((s, x) => s + x, 0) / 12;
    },
    range: [0.3, 0.6],
    source: SRC.fiscal,
  },
  {
    id: 'fiscal-money-banks-vs-funds',
    label: 'Other public services +1% of GDP (about a third staff pay): broad money when banks buy the bonds minus when pension funds do, pp (smaller of months 12 and 24)',
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
    label: 'Króna sentiment −10% (the króna itself falls about 8% by month 3 and recovers about half within a year): price level after 8 quarters, % vs baseline (known gap: pass-through per point of depreciation is above WP85’s)',
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

/**
 * Checks whose result lies outside the published estimate they cite: each keeps v1's wider band so
 * the harness passes, says so in its label and source, and waits for a calibration decision
 * (docs/audit/2026-09-29-audit.md, L26). tests/models checks that each is still outside its cited
 * range; when calibration closes a gap, that test fails as a reminder to narrow the check's range to
 * the cited one and remove the entry. The króna check's gap is in a different experiment (a held
 * depreciation), so its tripwire is its own test.
 */
export const KNOWN_GAPS: Record<string, { cited: [number, number]; why: string }> = {
  'wage-unemployment-peak': { cited: [0.5, 1], why: 'Unemployment rises less than the research report’s +0.5–1 pp: the migration buffer and labour hoarding absorb more of the job loss.' },
};
