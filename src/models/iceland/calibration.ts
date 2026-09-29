/**
 * Iceland Inc.: the 20 calibration checks of engine v1 (legacy/v1-engine/tools/calibration_checks.js),
 * three checks on the firm sectors (decision 0003), two on the world-prices lever (audit H5, review
 * E6), one on the foreign-rate lever (review E3) and five on the stabiliser setting (decision 0004).
 * After the audit of 29 September 2026 (docs/audit/2026-09-29-audit.md: M12/M20, M13, M14/M21, L26)
 * each check's scenario is the experiment its source describes, and its range is the source's where
 * the source gives one. Where the model lies outside a cited estimate, or inside its band only
 * because of an artefact of the scenario, the check keeps v1's band (v1 SPEC §7.3), says so in its
 * label and source, and is listed in KNOWN_GAPS for a calibration decision.
 *
 * Every published response these checks compare with comes from an economy whose policy reacts:
 * the central bank follows its rule and the debt rule leans on income tax. So each of these 26
 * scenarios sets stabilisers to Automatic (AUTO), at month 0, or at month 12 in the rate
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
const WORLD: ScenarioEvent[] = [AUTO, { t: 0, lever: 'importPrices', value: 10 }];
const FOREIGN_RATE: ScenarioEvent[] = [AUTO, { t: 0, lever: 'foreignRate', value: 1 }];
/** Stabilisers on Manual (the default): policy levers stay where they are set. */
const M_TAX: ScenarioEvent[] = [{ t: 0, lever: 'incomeTax', value: 1 }];
const M_WAGE: ScenarioEvent[] = [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }];
const FIRMS = ['FC', 'FR', 'XF', 'XA', 'XT', 'XO'] as const;

/* ------------------------------------------------------------------ sources */
const QMM_URL = 'https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf';
/** The experiment all five rate checks run, and what happens when the rule takes over. */
const QMM_RATE =
  'CBI QMM v2.1 (Monetary Bulletin): the key rate raised 1 pp for four quarters, after which the rule takes over, lowers output about 0.41% and inflation about 0.24 pp at a trough in quarter 5 (research report, "Policy rate +1 pp"). The scenario is that experiment: the key rate is held 1 pp above baseline on Manual for 12 months, which also keeps the slow debt rule off, and the Automatic rule then takes over. The rule eases from the rate held, about a tenth of the gap to where it is heading each month (central-bank.ts, ruleRate: interest-rate smoothing from the rate in force), so the key rate comes down gradually: about 0.2 pp in month 13 and back near baseline by month 18. (v1 instead added a 1 pp offset to the Automatic rule for 8 quarters, a key rate only about 0.7 pp higher on average; until the review of 29 September 2026 the rule eased from its own shadow path and the key rate dropped about 1.5 pp in month 13.)';
const SRC = {
  rate: `${QMM_RATE} The ranges are v1’s bands around the QMM figures (v1 SPEC §7.3). ${QMM_URL}`,
  rateTiming: `${QMM_RATE} The range is v1’s band around QMM’s quarter 5 (v1 SPEC §7.3). The model’s output trough is month 13 or 14, the first months after the hold, in quarter 5 as QMM’s: the rule takes over from the rate held, so the tight policy fades over several months rather than ending at once. ${QMM_URL}`,
  rateOutput: `${QMM_RATE} The range is v1’s band around QMM’s −0.41% (v1 SPEC §7.3). KNOWN GAP: the model’s trough, about −0.58% in quarter 5, is about 40% deeper than QMM’s, near the band’s lower edge (KNOWN_GAPS). Until the review of 29 September 2026 it was about −0.44%, but only because the key rate dropped about 1.5 pp when the rule took over; with the gradual takeover the tight policy lasts longer. Holding the króna’s response to the rate at baseline (the carry and portfolio terms) gives about −0.44%: the extra fall comes through a stronger króna and lower net exports. ${QMM_URL}`,
  rateInflation: `${QMM_RATE} The range is v1’s band around QMM’s −0.24 pp (v1 SPEC §7.3). KNOWN GAP: the model’s trough, about −0.33 pp in month 14–15, is about 40% deeper than QMM’s and near the band’s lower edge (KNOWN_GAPS). Holding the króna’s response to the rate at baseline gives about −0.25 pp and holding housing costs in the CPI about −0.14 pp, while the capacity term (eta) adds only about 0.02 pp. So the extra depth comes from the króna and housing channels, not from slack. How far capacity pressure lifts prices (eta, prices.ts) was cut from v1’s 0.5 to 0.07 to keep the trough in the band once the rule took over smoothly; with 0.5 it is about −0.46 pp. ${QMM_URL}`,
  rateKrona: `CBI QMM v2.1 (Monetary Bulletin): the króna rises 0.67% on impact per 1 pp of interest-rate differential, with its real peak in quarter 4 (research report, "Policy rate +1 pp" and the dial table; the "+0.7–1%" once quoted here belongs to the wage experiment). QMM is quarterly, so its impact is the first quarter; the check measures the model’s first-quarter average. The range is v1’s band of 0.3–1.5 (v1 SPEC §7.3), which no source gives. KNOWN GAP: the model’s first-quarter rise is about 0.56%, about 0.44% in month 1 and 0.65% by month 3, so its króna is a little less sensitive to the rate gap than QMM’s (KNOWN_GAPS). It comes from the carry term (betaI) and from the carry trade wanting to hold more krónur when Icelandic rates are high (the portfolio term, psiB). ${QMM_URL}`,
  wage: 'Research report, "Wages +10%": CPI about +2% in year 1 rising toward about +4% as pass-through completes (CBI MB 2026/2 Box 2); the ranges are v1’s bands around those figures (v1 SPEC §7.3). https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageLevel:
    'Research report, "Wages +10%": the CPI ends about 4% higher once pass-through is complete, a 6% rise in domestic prices on the two-thirds of the basket that is not imported (import share: CBI MB 2026/2 Box 2). The range is 25% either side of that 4%: v1’s lower bound of 3, and an upper bound of 5 in place of v1’s 8, which no source gives (v1 SPEC §7.3). https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageRate: 'Research report, "Wages +10%": policy rate +1 to +1.5 pp at the peak, in quarters 2–4 (CBI DYNIMO, +0.3 pp per 1 pp of wages above baseline for two years, scaled; CBI MB 2026/2). v1’s band was 0.8–2 (v1 SPEC §7.3); the range is now the cited one. https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageJobs:
    'Research report, "Wages +10%": unemployment +0.5–1 pp at the peak (CBI DYNIMO: −0.7 pp of hours per +1 pp of wages, CBI MB 2026/2; the size of the cap on a 10% shock is the report’s assumption). The range is the cited one. The model’s peak is about 0.51, near its lower edge; it was about 0.47, below it, and judged against v1’s band of 0.3–1.2 (v1 SPEC §7.3) as a known gap, until imported goods carried a domestic distribution margin (distM, review E6): wages then reach prices a little more, so the key rate rises more and output and jobs fall a little more. https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageBack: 'Research report, "Wages +10%", settles in years 3–6: real variables return to baseline because the wage share is anchored in the long run (CBI QMM v4.0 long-run homogeneity; v1 SPEC §7.3). https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf',
  fiscal:
    'Research report, "Government spending +1% of GDP": the government buys 1% of GDP more from firms; output +0.3–0.6% in year 1 when deficit-financed, an inference from the ~0.7 cross-country median multiplier and Iceland’s openness (IMF WP 2026/043). Public investment is the lever that is only a purchase from firms, so the check uses it, with the cited range. (v1 used the other-services lever, about a third of which is public pay with no import leakage; that mixed multiplier is about 0.72, and v1 SPEC §7.3 widened the range to 0.8 for it.) https://www.elibrary.imf.org/view/journals/001/2026/043/article-A001-en.xml',
  money: 'Accounting mechanism: deficits add deposits when banks buy the bonds and move existing deposits when pension funds do (Bank of England 2014, "Money creation in the modern economy"; research report §1); v1 SPEC §7.3 requires a gap of at least 0.5 pp.',
  krona:
    'CBI WP85 finds exchange-rate pass-through to the CPI of 0.15 within the quarter and 0.23 in the long run per 1% of sustained depreciation, so within a year it lies between the two (research report, "A 10% króna depreciation"). The scenario is a −10% sentiment shock that fades at 10% a year: the realised króna falls about 9% by month 3 and recovers about a fifth of that within a year and half within two, as portfolio balance and the higher key rate pull it back. So the check divides the price level at month 12 by how much dearer foreign currency was on average over months 1–12: the pass-through per point of the depreciation actually seen. A króna held about 10% weaker for a year gives nearly the same ratio (tests/models, iceland-credit-and-checks). What buyers in Iceland pay for imported goods includes a domestic distribution margin (distM), so only part of a depreciation reaches it. Beyond the first year the model keeps passing through as wages catch up, to about 0.34 after two years and 0.43 after three when the króna is held weaker: nearer the IMF’s 0.4 at 36 months than WP85’s long-run 0.23. Within the quarter it is slower than WP85, about 0.07 against 0.15, because shops reprice imports gradually (lamPm). (This check replaces v1’s krona-price-level-8q, the price level at month 24 against 1.5–3, which asked for about twice WP85’s pass-through per point of realised depreciation; review E6, 29 September 2026.) https://ideas.repec.org/p/ice/wpaper/wp85.html',
  credit: 'Credit-impulse definition (Biggs, Mayer & Pick 2010; Keen 2011): positive while new credit accelerates, negative when a temporary boost ends, near zero when a higher flow is merely held (research report, "Banks’ lending appetite rises"; v1 SPEC §7.3). https://www.bde.es/f/webpi/SES/seminars/2015/files/sie1515.pdf',
  tourism:
    'Reasoned from 2020: foreign visitor numbers fell by about three-quarters and the króna lost nearly 10% in trade-weighted terms over the year (euro 14.9% dearer), cushioned by pension funds pausing FX purchases and by central-bank FX sales (Íslandsbanki, Economic review 2020; Landsbankinn, 8 January 2021; CBI Monetary Bulletin 2020/4). Scaled to a 30% fall, about 4%; the model’s central bank only brings its reserves slowly back toward target (lamRes) and does not lean against the króna, so up to 10%. Tourism is 13% of GDP of exports and the exporter most sensitive to the exchange rate, so its output must fall most (calibration.json: firm_sectors.tourism). https://www.landsbankinn.is/en/news/2021/01/08/the-icelandic-krona-depreciated-in-2020',
  aluminium:
    'Reasoned from ownership and tax: the three smelters are wholly foreign-owned (Rio Tinto, Alcoa, Century), so every króna of profit they do not reinvest is paid abroad; corporate tax takes about 9% of profit (effective rate from Hagstofa THJ05132); inward-FDI equity income was 78% dividends and 22% reinvested earnings in 2024 (Eurostat bop_c6_a). So 60–95% of a windfall should leave within two years (calibration.json: firm_sectors.aluminium).',
  world:
    'Purchasing-power parity is a slow anchor: Sarno and Taylor (2002) report half-lives of three to five years for deviations from PPP, so parity alone absorbs 13–21% of a lasting rise in world prices within a year, about 2% of a 10% rise. With policy reacting, the higher key rate adds a carry appreciation (0.3–1.5% per point, the rate-krona range above; the rule raises the rate by up to about 2 points). So after a year the króna should have strengthened by well under half the shock: 0–5%. Imports are paid at world prices in krónur at once (border prices, review of 29 September 2026), so a world-price rise is also a terms-of-trade loss (imports are about three times fish and aluminium exports), which weakens the króna in the first months; the check still asks for the net effect at month 12. Fish revenue in krónur must still be up by at least half the shock after 6 months (audit H5, 29 September 2026). https://doi.org/10.1017/CBO9780511754920',
  worldCpi:
    'CBI WP85: exchange-rate pass-through to the CPI of 0.15 within the quarter and 0.23 in the long run per 1% of sustained depreciation. A lasting 10% rise in world prices raises import prices in krónur as a 10% depreciation would (and, as it does, lifts fish and aluminium revenue), so after a year the CPI should be about 1.5–2.3% higher; the range is that one. The króna strengthens a little meanwhile (world-prices-krona-year1), which the check does not net out. After two years the CPI is about 2.8% higher, above WP85’s long-run 2.3% but below 3%, the upper edge of v1’s 8-quarter band for the same size of shock (tests/models, iceland-credit-and-checks). What buyers in Iceland pay for imported goods and inputs includes a domestic distribution margin (distM); before it was added they paid world prices in krónur one for one, and the CPI rose 2.7% in a year and 3.7% in two (review E6, 29 September 2026). https://ideas.repec.org/p/ice/wpaper/wp85.html',
  foreignRate:
    'Uncovered interest parity: a higher foreign rate narrows the rate gap with abroad, so carry traders and domestic savers move money out of krónur and the króna weakens (CBI QMM v2.1: the króna moves 0.67% on impact per 1 pp of interest-rate differential). The range mirrors the rate-krona band (0.3–1.5% per point, v1 SPEC §7.3), sign reversed, for the average over the first two years. Later the higher income from abroad strengthens it: the central bank sells the part of its reserves above target back into krónur, and the pension funds’ higher foreign income is paid home in krónur. Per point held on Automatic the króna is weaker for about seven years and about 3% stronger after twenty, still drifting slowly (a known gap: the model has no foreign-currency debt that pays the foreign rate, so Iceland’s income from abroad rises too much; decision 0007 and decision 0002 §6), so the check covers only quarters 1–8 (review E3; lever review FX-1, 29 September 2026). https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf',
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
 * pension-fund-financed counterpart itself. When the run carries its engine (runScenario results,
 * and the harness's half-step runs), it runs on that engine's compiled model, baseline and options,
 * at that engine's step: with k steps a month, events at k × their month, k × `months` steps, and
 * every k-th value kept, so a half-step run is compared with a half-step run. Without an engine
 * (the interface), it runs on a fresh engine of the registered model at the standard step.
 */
function fundsFinancedRun(run: RunResult, months: number): RunResult {
  const engine = (run as RunResult & { engine?: KernelEngine }).engine;
  if (engine) {
    const k = Math.round(1 / (12 * engine.model.def.dt));
    if (k === 1) return runScenario(engine, G_FUNDS, months);
    const r = runScenario(engine, G_FUNDS.map((e) => ({ ...e, t: e.t * k })), months * k);
    return { months, series: (id) => r.series(id).filter((_, t) => t % k === 0), value: (id, m) => r.value(id, m * k) };
  }
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
    label: 'Key rate held +1 pp for 4 quarters, then the rule: output trough, % vs baseline (known gap: about 40% deeper than QMM’s −0.41%; v1’s band)',
    scenario: RATE,
    months: 72,
    measure: (run) => {
      const a = run.series('output');
      return a[argmin(a, 1, 48)];
    },
    range: [-0.6, -0.25],
    source: SRC.rateOutput,
  },
  {
    id: 'rate-output-timing',
    kind: 'timing',
    label: 'Key rate held +1 pp for 4 quarters, then the rule: quarter of the output trough',
    scenario: RATE,
    months: 72,
    measure: (run) => quarter(argmin(run.series('output'), 1, 48)),
    range: [4, 7],
    source: SRC.rateTiming,
  },
  {
    id: 'rate-inflation-trough',
    label: 'Key rate held +1 pp for 4 quarters, then the rule: 12-month inflation trough, pp vs baseline (known gap: about 40% deeper than QMM’s −0.24 pp; v1’s band)',
    scenario: RATE,
    months: 72,
    measure: (run) => {
      const a = run.series('inflation');
      return a[argmin(a, 1, 48)];
    },
    range: [-0.35, -0.1],
    source: SRC.rateInflation,
  },
  {
    id: 'rate-inflation-timing',
    kind: 'timing',
    label: 'Key rate held +1 pp for 4 quarters, then the rule: quarter of the inflation trough',
    scenario: RATE,
    months: 72,
    measure: (run) => quarter(argmin(run.series('inflation'), 1, 48)),
    range: [5, 9],
    source: SRC.rate,
  },
  {
    id: 'rate-krona',
    label: 'Key rate held +1 pp for 4 quarters, then the rule: króna appreciation on impact (first-quarter average), % (known gap: a little below QMM’s 0.67%; v1’s band)',
    scenario: RATE,
    months: 72,
    measure: (run) => run.series('krona').slice(1, 4).reduce((s, x) => s + x, 0) / 3,
    range: [0.3, 1.5],
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
    kind: 'timing',
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
    label: 'Wages +10% one-off: unemployment peak, pp vs baseline',
    scenario: WAGE,
    months: 72,
    measure: (run) => {
      const a = run.series('unemployment');
      return a[argmax(a, 1, 72)];
    },
    range: [0.5, 1],
    source: SRC.wageJobs,
  },
  {
    id: 'wage-price-level-6y',
    label: 'Wages +10% one-off: price level after 6 years, % vs baseline',
    scenario: WAGE,
    months: 72,
    measure: (run) => run.series('priceLevel')[72],
    range: [3, 5],
    source: SRC.wageLevel,
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
    id: 'krona-pass-through-year1',
    label: 'Króna sentiment −10% (the króna itself falls about 9% by month 3 and recovers about a fifth of that within a year): price level at month 12, % vs baseline, ÷ how much dearer foreign currency was on average over months 1–12, % (pass-through per point of depreciation)',
    scenario: KRONA,
    months: 72,
    measure: (run) => {
      // krónur per unit of foreign currency, % above baseline (the chart shows the króna's value, + stronger)
      const dearer = run.series('krona').slice(1, 13).map((k) => 100 * (1 / (1 + k / 100) - 1));
      return run.series('priceLevel')[12] / (dearer.reduce((s, x) => s + x, 0) / 12);
    },
    range: [0.15, 0.23],
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
    id: 'world-prices-cpi-year1',
    label: 'World prices +10% held: price level at month 12, % vs baseline',
    scenario: WORLD,
    months: 72,
    measure: (run) => run.series('priceLevel')[12],
    range: [1.5, 2.3],
    source: SRC.worldCpi,
  },
  {
    id: 'foreign-rate-krona-2y',
    label: 'Foreign interest rate +1 pp held: króna value, average of months 1–24, % vs baseline (+ stronger)',
    scenario: FOREIGN_RATE,
    months: 72,
    measure: (run) => run.series('krona').slice(1, 25).reduce((s, x) => s + x, 0) / 24,
    range: [-1.5, -0.3],
    source: SRC.foreignRate,
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
 * Checks with a known gap to their source (docs/audit/2026-09-29-audit.md, L26): each keeps v1's band
 * so the harness passes, says 'known gap' in its label and 'KNOWN GAP' in its source, and waits for a
 * calibration decision. Where `cited` is given, the result lies outside that published range, and
 * tests/models checks that it still does: when calibration closes the gap, that test fails as a
 * reminder to narrow the check's range to the cited one and remove the entry. A point estimate is
 * cited as [x, x]. Entries without `cited` have their own tripwire test, named in `why`.
 */
export const KNOWN_GAPS: Record<string, { cited?: [number, number]; why: string }> = {
  'rate-output-trough': {
    cited: [-0.41, -0.41],
    why: 'Output falls about 0.58% at the trough against QMM’s 0.41%. Holding the króna’s response to the rate at baseline (logExchangeRate carry and portfolio terms) gives about −0.44%, so most of the extra fall is a stronger króna cutting net exports; the rest is investment (betaRI: 0.6 in place of 1.5 gives about −0.50%, but pushes wage-unemployment-peak to its lower edge). Until the review of 29 September 2026 it was −0.44% only because the key rate dropped about 1.5 pp when the rule took over.',
  },
  'rate-inflation-trough': {
    cited: [-0.24, -0.24],
    why: 'Inflation falls about 0.33 pp at the trough against QMM’s 0.24 pp. Decomposition (terms held at baseline): the króna channel adds about 0.09 pp (−0.25 without it), housing costs in the CPI about 0.19 pp (−0.14 without them), capacity pressure (eta) about 0.02 pp. eta was cut from v1’s 0.5 to 0.07 to keep the trough inside v1’s band once the rule took over from the rate held; flat price Phillips curves (Hazell, Herreño, Nakamura and Steinsson 2022; Del Negro, Lenza, Primiceri and Tambalotti 2020) make a small eta plausible but are not an estimate of it. With 0.5 the trough is about −0.46 pp.',
  },
  'rate-krona': {
    cited: [0.67, 0.67],
    why: 'The króna rises about 0.56% in the first quarter against QMM’s 0.67% on impact. Until the review of 29 September 2026 it was 0.41%: lamFX was not the cause (doubling it only raised the rise to 0.47%), the carry response was. The carry trade’s wanted holdings now count in the portfolio term (psiB), which closed most of the gap; raising betaI further deepens the rate experiment’s inflation trough (rate-inflation-trough) below its band.',
  },
};
