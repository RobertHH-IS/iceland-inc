/**
 * Iceland Inc.: the 20 calibration checks of engine v1 (legacy/v1-engine/tools/calibration_checks.js),
 * three checks on the firm sectors (decision 0003), two on the world-prices lever (audit H5, review
 * E6), one on the foreign-rate lever (review E3), five on the stabilisers' padlocks (decisions
 * 0004 and 0010) and one on the key rate a year after a wage settlement (decision 0012).
 * After the audit of 29 September 2026 (docs/audit/2026-09-29-audit.md: M12/M20, M13, M14/M21, L26)
 * each check's scenario is the experiment its source describes, and its range is the source's where
 * the source gives one. Where the model lies outside a cited estimate, or inside its band only
 * because of an artefact of the scenario, the check keeps v1's band (v1 SPEC §7.3), says so in its
 * label and source, and is listed in KNOWN_GAPS for a calibration decision.
 *
 * Every published response these checks compare with comes from an economy whose policy reacts:
 * the central bank follows its rule and the debt rule leans on income tax. So each of these 27
 * scenarios runs with both policy levers unlocked, the default, or unlocks them at month 12 in the
 * rate experiment, which first holds the key rate as its source does. The locked checks close both
 * padlocks at month 0 (the old Manual setting).
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
/** The key-rate stabiliser, its threshold and the key-rate lever's default (the level it holds locked). */
const RATE_RULE = centralBank.stabilisers!.find((s) => s.id === 'keyRateRule')!;
const HELD_RATE = centralBank.levers!.find((l) => l.id === RATE_RULE.lever)!.default;

/** Both policy levers locked (the old Manual setting): nothing moves them unless the user does. */
const LOCKED: ScenarioEvent[] = [
  { t: 0, lever: 'keyRateLock', value: 1 },
  { t: 0, lever: 'incomeTaxLock', value: 1 },
];
/**
 * CBI QMM's experiment: the key rate is held 1 pp above baseline for four quarters, then the rule
 * takes over. The hold locks the key rate at baseline + 1 pp (relative to the lever's default, so it
 * stays a rise if the start rate changes), and income tax is locked too, which keeps the slow debt
 * rule off for that year; both are unlocked at month 12.
 */
const RATE: ScenarioEvent[] = [
  { t: 0, lever: 'incomeTaxLock', value: 1 },
  { t: 0, lever: 'keyRate', value: HELD_RATE + 1 },
  { t: 12, lever: 'keyRateLock', value: 0 },
  { t: 12, lever: 'incomeTaxLock', value: 0 },
];
const WAGE: ScenarioEvent[] = [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }];
const G_BANKS: ScenarioEvent[] = [
  { t: 0, lever: 'bondBuyers', value: 1 },
  { t: 0, lever: 'otherServices', value: 1 },
];
/** The research report's fiscal experiment: the government buys 1% of GDP more from firms, bank-financed. */
const G_PURCHASES: ScenarioEvent[] = [
  { t: 0, lever: 'bondBuyers', value: 1 },
  { t: 0, lever: 'publicInvestment', value: 1 },
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
const TOURISM: ScenarioEvent[] = [{ t: 0, lever: 'tourism', value: -30 }];
const ALUMINIUM: ScenarioEvent[] = [{ t: 0, lever: 'aluminiumPrice', value: 20 }];
const WORLD: ScenarioEvent[] = [{ t: 0, lever: 'importPrices', value: 10 }];
const FOREIGN_RATE: ScenarioEvent[] = [{ t: 0, lever: 'foreignRate', value: 1 }];
/** Both policy levers locked: they stay where they are set. */
const L_TAX: ScenarioEvent[] = [...LOCKED, { t: 0, lever: 'incomeTax', value: 1 }];
const L_WAGE: ScenarioEvent[] = [...LOCKED, { t: 0, lever: 'wageSettlement', value: 10, fire: true }];
const FIRMS = ['FC', 'FR', 'XF', 'XA', 'XT', 'XO'] as const;

/* ------------------------------------------------------------------ sources */
const QMM_URL = 'https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf';
/** The experiment all five rate checks run, and what happens when the rule takes over. */
const QMM_RATE =
  'CBI QMM v2.1 (Monetary Bulletin): the key rate raised 1 pp for four quarters, after which the rule takes over, lowers output about 0.41% and inflation about 0.24 pp at a trough in quarter 5 (research report, "Policy rate +1 pp"). The scenario is that experiment: the key rate is locked 1 pp above baseline for 12 months, with income tax locked too, which keeps the slow debt rule off, and both are then unlocked, so the rule takes over. The rule eases from the rate held, about a tenth of the gap to where it is heading each month (central-bank.ts, ruleRate: interest-rate smoothing from the rate in force), so the key rate comes down gradually: about 0.2 pp in month 13 and back near baseline by month 19. (v1 instead added a 1 pp offset to the rule for 8 quarters, a key rate only about 0.7 pp higher on average; until the review of 29 September 2026 the rule eased from its own shadow path and the key rate dropped about 1.5 pp in month 13.)';
const SRC = {
  rate: `${QMM_RATE} The ranges are v1’s bands around the QMM figures (v1 SPEC §7.3). ${QMM_URL}`,
  rateTiming: `${QMM_RATE} The range is v1’s band around QMM’s quarter 5 (v1 SPEC §7.3). The model’s output trough is month 13 or 14, the first months after the hold, in quarter 5 as QMM’s: the rule takes over from the rate held, so the tight policy fades over several months rather than ending at once. ${QMM_URL}`,
  rateOutput: `${QMM_RATE} The range is v1’s band around QMM’s −0.41% (v1 SPEC §7.3). KNOWN GAP: the model’s trough, about −0.58% in month 15 (quarter 5), is about 40% deeper than QMM’s (KNOWN_GAPS; −0.53% before the market priced the carry trade’s flow of krónur, decision 0013, and −0.52% before the rule read its gap from the labour market, decision 0012). It is near the bottom of the range, −0.583 as the step goes to zero against −0.6: the thinnest margin of the rate checks. Until the review of 29 September 2026 it was about −0.44%, but only because the key rate dropped about 1.5 pp when the rule took over; with the gradual takeover the tight policy lasted longer and the trough was about −0.57%, 40% deeper. A slower consumption habit (lamC 0.6) brought it to about −0.49%, and a króna as sensitive to the rate as QMM’s (betaI 0.5, rate-krona) to −0.52%. Holding the króna’s response to the rate at baseline (the carry and portfolio terms) gives about −0.38%: the extra fall comes through a stronger króna and lower net exports. ${QMM_URL}`,
  rateInflation: `${QMM_RATE} The range is v1’s band around QMM’s −0.24 pp (v1 SPEC §7.3). The model’s trough is about −0.27 pp in month 13, a little deeper than QMM’s (−0.23 pp before decision 0013, when the market came to price the carry trade’s flow of krónur and the króna rose more). Holding the króna’s response to the rate at baseline gives about −0.12 pp, holding the housing part of the CPI about −0.14 pp, and the capacity term (eta) adds about 0.02 pp: the króna, market rents and slack each carry part of it. The housing part of the CPI is a market-rent index that follows house prices only partly and slowly (housing.ts, lever review MON-4). While it followed house prices one for one, the trough was about −0.33 pp, about 40% deeper than QMM’s, and a known gap; how far capacity pressure lifts prices (eta, prices.ts) was cut from v1’s 0.5 to 0.07 then to keep it in the band once the rule took over smoothly (lever review MON-2). With 0.5 the trough is now about −0.34 pp. ${QMM_URL}`,
  rateKrona: `CBI QMM v2.1 (Monetary Bulletin): the króna rises 0.67% on impact per 1 pp of interest-rate differential, with its real peak in quarter 4 (research report, "Policy rate +1 pp" and the dial table; the "+0.7–1%" once quoted here belongs to the wage experiment). QMM is quarterly, so its impact is the first quarter; the check measures the model’s first-quarter average. The range is v1’s band of 0.3–1.5 (v1 SPEC §7.3), which no source gives. The model’s first-quarter rise is about 0.88%, about 0.68% in month 1 and 1.02% by month 3, above QMM’s. It comes from the carry term (betaI), from the carry trade wanting to hold more krónur when Icelandic rates are high (the portfolio term, psiB), and, since decision 0013, from the market pricing the krónur the carry trade keeps buying a year while the gap lasts (the portfolio term’s flow part). It was 0.69% before that, and 0.61% with the flow part but without the carry trade’s flow netted from it; decision 0007’s joint search of betaI, psiB and the consumption habit should be rerun against QMM’s 0.67% (the long-run-anchors proposal’s phase 5). Until the review of 29 September 2026 it was 0.41%, then 0.56% (a known gap); raising betaI to close it deepened the output trough below its band until the consumption habit was slowed (lamC, lever review MON-5). ${QMM_URL}`,
  wage: 'Research report, "Wages +10%": CPI about +2% in year 1 rising toward about +4% as pass-through completes (CBI MB 2026/2 Box 2); the ranges are v1’s bands around those figures (v1 SPEC §7.3). https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageLevel:
    'Research report, "Wages +10%": the CPI ends about 4% higher once pass-through is complete, a 6% rise in domestic prices on the two-thirds of the basket that is not imported (import share: CBI MB 2026/2 Box 2). The range is 25% either side of that 4%: v1’s lower bound of 3, and an upper bound of 5 in place of v1’s 8, which no source gives (v1 SPEC §7.3). Wages give back most of a settlement even in CBI’s experiment: with labour 55% of unit cost (aLab) domestic prices rise only about 0.65 of wages at a given exchange rate, so the long-run nominal level is set by the króna. In the model the real-wage gain now erodes mainly through prices in the first year (CPI about +2.6% with both policy levers locked while wages give back about 2.0 points of the 10; before 29 September 2026, 2.2 and 2.7), because firms price in a pay rise faster than dearer imports (lamUCw) and bargainers see the wage gap with a lag (lamWG, labour-LAB-2). On a baseline with zero inflation, wages below their +10% level mean slower growth than trend, here small nominal cuts. KNOWN GAP: the model’s price level is about 3.1% higher after six years, below CBI’s about 4, because nominal wages give back about 2 points of the settlement within a year through the error correction (+8.0% at month 12 with both policy levers locked, +3.4% after twenty years; KNOWN_GAPS, lever review labour-LAB-2). The answer as the time step goes to zero is lower still, about 3.04%: at one step a month it was 3.49, and the step’s own error hid part of the gap (decision 0011); it was 3.42 at two steps (3.3 in the limit) until the central bank read its gap from the labour market, which cools the economy harder in the second year after a settlement (decision 0012). It sits near the bottom of the range, the thinnest margin of the wage checks. It is recorded, not tuned; the joint refit of the wage checks takes it up. https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageRate: 'Research report, "Wages +10%": policy rate +1 to +1.5 pp at the peak, in quarters 2–4 (CBI DYNIMO, +0.3 pp per 1 pp of wages above baseline for two years, scaled; CBI MB 2026/2). v1’s band was 0.8–2 (v1 SPEC §7.3); the range is now the cited one. https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageRate12:
    'Research report, "Wages +10%": policy rate +1 to +1.5 pp at the peak, in quarters 2–4 (CBI DYNIMO, scaled; CBI MB 2026/2); the Central Bank of Iceland raised its rate early and firmly after the 2022–24 wage round. Month 12 is the end of quarter 4, inside that window, so a year on the key rate should still be well up. The lower end is half the lower end of the peak: the model’s rule reads slack from the labour market (decision 0012), and after a settlement jobs fall before output (lever-vetting open item 14), so its rate peaks earlier and eases sooner than DYNIMO’s. The upper end is the peak’s. A tripwire for the strength of the rule’s response to slack (aY × okunGap, decision 0012): at 1.6 points per point of unemployment (aY 1) the key rate at month 12 was about 0.2 pp, and about 0.1 as the step goes to zero; at 0.8 it is about 0.67, and about 0.59 in the limit. https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageJobs:
    'Research report, "Wages +10%": unemployment +0.5–1 pp at the peak (CBI DYNIMO: −0.7 pp of hours per +1 pp of wages, CBI MB 2026/2; the size of the cap on a 10% shock is the report’s assumption). The range is the cited one. The model’s peak is about 0.97 (0.96 at one step a month, 0.98 at two before the labour-market gap of decision 0012; about 1.0 as the step goes to zero, at the top of the range, decision 0011). It was about 0.47, below the range, and judged against v1’s band of 0.3–1.2 (v1 SPEC §7.3) as a known gap, until imported goods carried a domestic distribution margin (distM, review E6), and about 0.51 until firms measured wages against the value-added price and wage bargainers saw the wage gap with a lag of about a year (lamWG): the real-wage gain of a settlement now lasts longer, so firms economise on staff more (trade-nominal-drift and labour-LAB-2, 29 September 2026). https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  wageBack:
    'Research report, "Wages +10%", settles in years 3–6: real variables return to baseline because the wage share is anchored in the long run (CBI QMM v4.0 long-run homogeneity; v1 SPEC §7.3). The peak is the largest deviation in years 1–2, the response to the settlement before that settling period. (Until review MON-1 it was the largest in years 1–6. Once government bonds kept their coupons as the key rate fell, consumption rose again in years 3–4 on the higher interest, above its year-1 peak; measured against that later peak the ratio was smaller, so easier to pass, and depended on the time step: 0.137, and 0.157 at half the step.) The ratio is signed, with the range ±0.25, since decision 0011: an overshoot past baseline is as unsettled as the same share still to go, and a signed ratio lets the half-step test and its continuous-time limit follow a ratio that crosses zero. https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf',
  fiscal:
    'Research report, "Government spending +1% of GDP": the government buys 1% of GDP more from firms; output +0.3–0.6% in year 1 when deficit-financed, an inference from the ~0.7 cross-country median multiplier and Iceland’s openness (IMF WP 2026/043). Public investment is the lever that is only a purchase from firms, so the check uses it, with the cited range. (v1 used the other-services lever, about a third of which is public pay with no import leakage; that mixed multiplier is about 0.72, and v1 SPEC §7.3 widened the range to 0.8 for it.) https://www.elibrary.imf.org/view/journals/001/2026/043/article-A001-en.xml',
  money: 'Accounting mechanism: deficits add deposits when banks buy the bonds and move existing deposits when pension funds do (Bank of England 2014, "Money creation in the modern economy"; research report §1); v1 SPEC §7.3 requires a gap of at least 0.5 pp.',
  krona:
    'CBI WP85 finds exchange-rate pass-through to the CPI of 0.15 within the quarter and 0.23 in the long run per 1% of sustained depreciation, so within a year it lies between the two (research report, "A 10% króna depreciation"). The scenario is a −10% sentiment shock that fades at 10% a year: the realised króna falls about 9% by month 3 and recovers about a quarter of that within a year and about half within two, as portfolio balance and the higher key rate pull it back. So the check divides the price level at month 12 by how much dearer foreign currency was on average over months 1–12: the pass-through per point of the depreciation actually seen. A króna held about 10% weaker for a year gives nearly the same ratio (tests/models, iceland-credit-and-checks). What buyers in Iceland pay for imported goods includes a domestic distribution margin (distM), so only part of a depreciation reaches it. Beyond the first year the model passes through a little more as wages catch up, to about 0.31 after two years, 0.36 after three and 0.38 after four when the króna is held weaker, levelling off below the IMF’s 0.4 at 36 months, past WP85’s long-run 0.23. (Before the central bank read its output gap from the labour market it was 0.30 and 0.33 after two and three years: the rule now leans less on the export boom a weaker króna brings, because unemployment moves less than output at first; decision 0012.) (It reached 0.43 after three years and kept rising while wages were measured against domestic prices: a lasting depreciation then set off a wage–price spiral that never ended; trade-nominal-drift, 29 September 2026.) Within the quarter it is slower than WP85, about 0.07 against 0.15, because shops reprice imports gradually (lamPm). (This check replaces v1’s krona-price-level-8q, the price level at month 24 against 1.5–3, which asked for about twice WP85’s pass-through per point of realised depreciation; review E6, 29 September 2026.) https://ideas.repec.org/p/ice/wpaper/wp85.html',
  credit: 'Credit-impulse definition (Biggs, Mayer & Pick 2010; Keen 2011): positive while new credit accelerates, negative when a temporary boost ends, near zero when a higher flow is merely held (research report, "Banks’ lending appetite rises"; v1 SPEC §7.3). https://www.bde.es/f/webpi/SES/seminars/2015/files/sie1515.pdf',
  tourism:
    'Reasoned from 2020: foreign visitor numbers fell by about three-quarters and the króna lost nearly 10% in trade-weighted terms over the year (euro 14.9% dearer), cushioned by pension funds pausing FX purchases and by central-bank FX sales (Íslandsbanki, Economic review 2020; Landsbankinn, 8 January 2021; CBI Monetary Bulletin 2020/4). Scaled to a 30% fall, about 4%; the model’s central bank only brings its reserves slowly back toward target (lamRes) and does not lean against the króna, so up to 10%. Tourism is 13% of GDP of exports and the exporter most sensitive to the exchange rate, so its output must fall most (calibration.json: firm_sectors.tourism). https://www.landsbankinn.is/en/news/2021/01/08/the-icelandic-krona-depreciated-in-2020',
  aluminium:
    'Reasoned from ownership and tax: the three smelters are wholly foreign-owned (Rio Tinto, Alcoa, Century), so every króna of profit they do not reinvest is paid abroad; corporate tax takes about 9% of profit (effective rate from Hagstofa THJ05132); inward-FDI equity income was 78% dividends and 22% reinvested earnings in 2024 (Eurostat bop_c6_a). So 60–95% of a windfall should leave within two years (calibration.json: firm_sectors.aluminium).',
  world:
    'Purchasing-power parity is a slow anchor: Sarno and Taylor (2002) report half-lives of three to five years for deviations from PPP, so parity alone absorbs 13–21% of a lasting rise in world prices within a year, about 2% of a 10% rise. With policy reacting, the higher key rate adds a carry appreciation (0.3–1.5% per point, the rate-krona range above; the rule raises the rate by up to about 2 points). So after a year the króna should have strengthened by well under half the shock: 0–5%. Imports are paid at world prices in krónur at once (border prices, review of 29 September 2026), so a world-price rise is also a terms-of-trade loss (imports are about three times fish and aluminium exports), which weakens the króna in the first months; the check still asks for the net effect at month 12. Fish revenue in krónur must still be up by at least half the shock after 6 months (audit H5, 29 September 2026). https://doi.org/10.1017/CBO9780511754920',
  worldCpi:
    'CBI WP85: exchange-rate pass-through to the CPI of 0.15 within the quarter and 0.23 in the long run per 1% of sustained depreciation. A lasting 10% rise in world prices raises import prices in krónur as a 10% depreciation would (and, as it does, lifts fish and aluminium revenue), so after a year the CPI should be about 1.5–2.3% higher; the range is that one. The króna strengthens a little meanwhile (world-prices-krona-year1), which the check does not net out. After two years the CPI is about 2.5% higher, above WP85’s long-run 2.3% and below 3%, the upper edge of v1’s 8-quarter band for the same size of shock (tests/models, iceland-credit-and-checks); it was 2.4% while the central bank measured slack against a fixed capacity, and 2.7% once it leant less on the export boom the higher fish and aluminium prices bring (decision 0012), until the market priced the flow of krónur (decision 0013). What buyers in Iceland pay for imported goods and inputs includes a domestic distribution margin (distM); before it was added they paid world prices in krónur one for one, and the CPI rose 2.7% in a year and 3.7% in two (review E6, 29 September 2026). https://ideas.repec.org/p/ice/wpaper/wp85.html',
  foreignRate:
    'Uncovered interest parity: a higher foreign rate narrows the rate gap with abroad, so carry traders and domestic savers move money out of krónur and the króna weakens (CBI QMM v2.1: the króna moves 0.67% on impact per 1 pp of interest-rate differential). The range mirrors the rate-krona band (0.3–1.5% per point, v1 SPEC §7.3), sign reversed, for the average over the first two years. Later the higher income from abroad strengthens it: the central bank sells the part of its reserves above target back into krónur, and the pension funds’ higher foreign income is paid home in krónur. Per point held, with both policy rules acting, the króna is weaker for about six and a half years and about 1.5% stronger after twenty, still drifting slowly (a known gap: the model has no foreign-currency debt that pays the foreign rate, so Iceland’s income from abroad rises too much; decision 0007 and decision 0002 §6), so the check covers only quarters 1–8 (review E3; lever review FX-1, 29 September 2026). https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf',
  lockedHeld: 'Design of the padlocks (decisions 0004 and 0010): a locked policy lever never moves unless the user moves it, so the key rate is the level of its lever, exactly, whatever else happens.',
  lockedTax:
    'Reasoned: +1 pp on a tax base of about 65% of GDP raises revenue by about 0.65% of GDP. Tax multipliers are at or below spending multipliers (cross-country median spending multiplier about 0.7, IMF WP 2026/043, smaller in open economies), and with the key rate held there is no monetary offset: a year-2 multiplier of 0.25–1.2 gives output −0.15% to −0.8%. https://www.elibrary.imf.org/view/journals/001/2026/043/article-A001-en.xml',
  lockedWage:
    'As the unlocked check (research report, "Wages +10%": CPI about +2% in year 1 rising toward +4% as pass-through completes, CBI MB 2026/2 Box 2), without the rate rise that damps it, so up to the 4% of full pass-through. The central bank’s rule must be calling for a higher rate at the peak: its suggestion is more than its threshold above the held key rate. Every chart must stay finite for 20 years.',
  drift: 'Architecture §4.5: the baseline is a steady state with the policy levers locked or unlocked; with no shock nothing may move by more than the harness’s drift limit of 1e-9 over 20 years.',
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
 * and the harness's half-step runs, which run more sub-steps a month), it runs on that engine's
 * compiled model, baseline and options, so a half-step run is compared with a half-step run.
 * Without an engine (the interface), it runs on a fresh engine of the registered model.
 */
function fundsFinancedRun(run: RunResult, months: number): RunResult {
  const engine = (run as RunResult & { engine?: KernelEngine }).engine;
  if (engine) return runScenario(engine, G_FUNDS, months);
  if (!modelForComparisons) throw new Error('calibration: the Iceland model is not registered for comparison runs');
  fallbackFundsRun ??= runScenario(createEngine(modelForComparisons), G_FUNDS, 72);
  return fallbackFundsRun;
}

/* -------------------------------------------------------------------- checks */

const wageBack = (id: string, label: string, limitIndicative?: string): CalibrationCheck => ({
  id: `wage-back-${id}`,
  label: `Wages +10%: ${label} at year 6 ÷ peak deviation in years 1–2 (below zero: past baseline, on the other side)`,
  scenario: WAGE,
  months: 72,
  // Signed (decision 0011): a ratio that crosses zero keeps its sign, so the step comparison and
  // the continuous-time limit see an overshoot for what it is, where abs() would fold it back.
  // The range is symmetric: an overshoot of a quarter of the peak is as far from settled as a
  // quarter still to go.
  measure: (run) => {
    const a = run.series(id);
    const j = argmax(a.map(Math.abs), 1, 24);
    return a[72] / a[j];
  },
  range: [-0.25, 0.25],
  source: SRC.wageBack,
  ...(limitIndicative ? { limitIndicative } : {}),
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
    label: 'Key rate held +1 pp for 4 quarters, then the rule: 12-month inflation trough, pp vs baseline',
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
    label: 'Key rate held +1 pp for 4 quarters, then the rule: króna appreciation on impact (first-quarter average), % (v1’s band around QMM’s 0.67%)',
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
    limitIndicative:
      'the peak moves from month 13 to month 14 between four and eight steps a month, so the second difference is a jump between months, not the step’s error, and the order the full run finds (about 2.1) means nothing (2.6933, 2.6823, 2.6798 and 2.6798 pp at 2, 4, 8 and 16 steps); the answer, about 2.68, is far inside its range (decision 0013)',
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
    // Gated in full from decision 0012 (an order of about 1.5: 1.4736, 1.4679, 1.4659 and 1.4648
    // pp at 2, 4, 8 and 16 steps a month) until decision 0013; before 0012 the peak converged
    // non-monotonically (1.2622 at 2 and 4 steps, 1.2619 at 8) and was declared indicative.
    limitIndicative:
      'the peak moves from month 21 to month 22 between four and eight steps a month, where the two months are within 0.001 pp of each other, so the order the full run finds (about 2.8) is a jump between months, not the step’s error (1.4445, 1.4391, 1.4383 and 1.4379 pp at 2, 4, 8 and 16 steps); the answer, about 1.438, is inside its range, 0.06 below the top (decision 0013)',
  },
  {
    id: 'wage-key-rate-month12',
    label: 'Wages +10% one-off: key rate at month 12, pp vs baseline (the rule still leaning against the settlement a year on)',
    scenario: WAGE,
    months: 72,
    measure: (run) => run.series('keyRate')[12],
    range: [0.5, 1.5],
    source: SRC.wageRate12,
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
    label: 'Wages +10% one-off: price level after 6 years, % vs baseline (known gap: below CBI’s about 4%, as wages give back part of the settlement in the first year)',
    scenario: WAGE,
    months: 72,
    measure: (run) => run.series('priceLevel')[72],
    range: [3, 5],
    source: SRC.wageLevel,
  },
  wageBack('output', 'output'),
  wageBack('unemployment', 'unemployment'),
  wageBack('realWage', 'real wage'),
  wageBack(
    'consumption',
    'consumption',
    'the peak in years 1–2 moves from month 22 to month 21 between two and four steps a month, so the first difference of the ratio is a jump between months, not the step’s error, and the order the full run finds (about 2.3) means nothing (0.04756, 0.04705, 0.04694 and 0.04692 at 2, 4, 8 and 16 steps; the month-72 value alone converges at first order); the answer, about 0.047, is far inside its range (decision 0013)',
  ),
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
    limitIndicative:
      'the step barely moves it and not in one direction (0.595787, 0.595781, 0.595683 and 0.595609 at 2, 4, 8 and 16 steps a month: changes of 1e-4 at most, first down by 6e-6 then by 1e-4), so the order the full run finds (about −4) is noise; every value, and the answer, is below the top of the range, 0.6, by 0.004: the edge recorded in decision 0013',
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
    // Gated in full since decision 0013: it converges at first order (−5.4444, −5.4968, −5.5194
    // and −5.5296% at 2, 4, 8 and 16 steps a month, an order of about 1.2). Before, the error fell
    // faster than first order (−4.2748, −4.2954, −4.3001, −4.3009; order about 2.1) and was declared
    // indicative.
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
  // Both policy levers locked (decisions 0004 and 0010): they stay where they are set
  {
    id: 'locked-tax-key-rate-held',
    label: 'Locked: income tax +1 pp held: largest change in the key rate over 20 years, pp',
    scenario: L_TAX,
    months: 240,
    measure: (run) => Math.max(...run.series('keyRate').map(Math.abs)),
    range: [0, 0],
    source: SRC.lockedHeld,
  },
  {
    id: 'locked-tax-output',
    label: 'Locked: income tax +1 pp held: output, year-2 average, % vs baseline',
    scenario: L_TAX,
    months: 72,
    measure: (run) => run.series('output').slice(13, 25).reduce((s, x) => s + x, 0) / 12,
    range: [-0.8, -0.15],
    source: SRC.lockedTax,
  },
  {
    id: 'locked-wage-inflation-peak',
    label: 'Locked: wages +10% one-off: 12-month inflation peak, pp vs baseline; the central bank’s rule must be calling for a higher key rate at the peak and every chart must stay finite for 20 years (otherwise not a number)',
    scenario: L_WAGE,
    months: 240,
    measure: (run) => {
      const a = run.series('inflation');
      const j = argmax(a, 1, 72);
      const calling = run.value(RATE_RULE.suggestion, j) - HELD_RATE > RATE_RULE.threshold;
      return calling && Number.isFinite(largestChartMove(run)) ? a[j] : NaN;
    },
    range: [1.5, 4],
    source: SRC.lockedWage,
  },
  {
    id: 'locked-no-shock-drift',
    label: 'Locked: no shock: largest move of any chart over 20 years',
    scenario: LOCKED,
    months: 240,
    measure: largestChartMove,
    range: [0, 1e-9],
    source: SRC.drift,
  },
  {
    id: 'unlocked-no-shock-drift',
    label: 'Unlocked: no shock: largest move of any chart over 20 years',
    scenario: [],
    months: 240,
    measure: largestChartMove,
    range: [0, 1e-9],
    source: SRC.drift,
    limitIndicative: 'the measure is rounding error, about 1e-11 at every step, so its order (3.1 in the full run) is noise; the value itself is gated',
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
  'wage-price-level-6y': {
    cited: [4, 4],
    why: 'The price level ends about 3.1% higher after six years against CBI’s about 4% (3.04% as the time step goes to zero; 3.49 at one step a month, decision 0011; 3.42 at two steps before the labour-market gap, decision 0012). Nominal wages give back about 2 points of a 10% settlement within the first year (+8.0% at month 12 with both policy levers locked) and end +3.4% after twenty: the error correction works the gap off faster than wage contracts of a year or more would allow. A contract-length lag (wages fixed for the life of an agreement) would keep more of the settlement in the first year; it is not built (lever review labour-LAB-2).',
  },
  'rate-output-trough': {
    cited: [-0.41, -0.41],
    why: 'Output falls about 0.58% at the trough against QMM’s 0.41% (0.53% before the market priced the carry trade’s flow of krónur, decision 0013; 0.52% before the central bank read its gap from the labour market, decision 0012; 0.57% before the consumption habit was slowed and the króna made as sensitive to the rate as QMM’s, lever review MON-5). Holding the króna’s response to the rate at baseline (logExchangeRate carry and portfolio terms) gives about −0.38%, so the extra fall is a stronger króna cutting net exports. Until the review of 29 September 2026 it was −0.44% only because the key rate dropped about 1.5 pp when the rule took over.',
  },
};
