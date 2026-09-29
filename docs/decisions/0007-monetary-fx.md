# 0007. The key rate smooths from the rate in force; imports are paid at border prices; portfolio balance is bounded

Status: accepted (September 2026). The monetary and exchange-rate findings of the lever review of 29 September 2026 (the lever-response report, `reports/levers/iceland.md`, vetted against theory).

## The problems

**The rule jumped when it took over (MON-2).** `ruleRate` closed its gap with `adjust`, which the kernel always anchors on the variable's own last value. On Manual that value is a shadow path that follows the economy the held rate creates but never the held rate itself. At the switch to Automatic the key rate simply adopted it: after 4% held for a year it fell from 4% to 2.47% in one month; after 6% for two years, from 6% to 0.21%. The rate checks were in their bands partly because of that drop (the former known gaps `rate-output-timing` and `rate-inflation-trough`).

**The rule was fast and its principle mislabelled (MON-6, MON-9).** `lamPol` 3 a year left 47% of a gap after a quarter, where estimated rules leave 70–85%. The `taylor-principle` test added the two inflation weights (1.6) although, with expectations half anchored (`chi` 0.5), lasting actual inflation moved the key rate only 1.3 × 0.5 + 0.3 = 0.95 points per point.

**The rule reacted to VAT (TAX-8).** Its actual-inflation term used headline CPI, so a VAT rise tightened policy for a year and then left a base-effect cliff.

**Imports were paid for at a lagged price (FX-2).** The import bill used `importPrice`, which follows world prices × the exchange rate at `lamPm` (2 a year), while fish and aluminium revenue repriced at once. That amounts to invoicing imports in krónur: a weaker króna improved the current account on impact (+0.36 pp of GDP at month 1 for a −10% shock), and a world-price rise did too.

**Portfolio balance was unbounded and counted the carry trade against the króna (TAX-1, FX-4).** The term was betaH × log(non-residents' real króna holdings ÷ normal), on a stock of 7% of GDP: about 4% on the real exchange rate per 1% of GDP of holdings, falling toward log(0.05) as holdings ran out. Pension funds bringing 20 points of assets home made the króna 104% stronger in a year; income tax +10 held on Manual ended 2.3 times beyond purchasing-power parity. Bonds the carry trade bought because Icelandic rates were high also counted as holdings, so a demand boom with a higher key rate weakened the real króna.

**Reserve income was paid in krónur by non-residents (FX-1).** Every extra point of foreign yield on the central bank's reserves (18% of GDP) was a króna purchase from non-residents' deposits, which the portfolio term turned into a lasting appreciation and deflation (+1.25 pp held on Automatic: the króna 6.4% stronger and prices 3.9% lower after 20 years, inflation still 0.3 pp below).

**Transmission was credited to the Taylor rule (MON-7).** Pass-through of the key rate to bank, bond and mortgage rates was tagged `taylor-rule`, so on Manual, with a hand-set rate, the rule ranked among the ideas at play although it did nothing.

## The decisions

**The rule smooths from the rate in force.** `central-bank.ts` now has three variables:

- `ruleTarget`: where the rule is heading, the old four terms with no smoothing. Its actual-inflation term reads 12-month inflation at constant VAT (`inflation12ExTax`, from `cpiExTax` in `prices.ts`, the CPI with its VAT factor at 1), as the Central Bank of Iceland looks through first-round tax effects (Svensson 1997); the expected-inflation term still sees VAT.
- `ruleAnchor`: the rate the rule was in charge of this month: its own `ruleRate` on Automatic, the held `keyRate` on Manual.
- `ruleRate` = (1 − k) × last step's `ruleAnchor` + k × `ruleTarget`, with k = 1 − e^(−lamPol × dt): the kernel's `adjust` with the anchor made explicit.

On Automatic from the start nothing changes: the anchor is the rule's own rate, before the offset and the zero floor. So the zero-bound shadow and the offset lever behave as before (anchoring on the key rate minus the offset, as first proposed, would have changed every run at the floor). After a Manual hold the rule starts from the held rate: 4% held for a year now eases to 3.79% in month 13 (−0.21 pp, not −1.53), and the króna moves from +0.68% to +0.60% (it went from +0.37% to −0.16%); 6% held for two years eases to 5.27%, not 0.21%.

**The suggestion is where the rule is heading** (`keyRateSuggestion` = max(0, 100 × `ruleTarget`)). A one-step suggestion would make "Apply" reproduce the rule's path, but with k ≈ 0.11 it would call only when the rule's target was more than 0.125 ÷ 0.11 ≈ 1.1 points away: income tax +1 pp would never call. "Apply" therefore still moves the lever to where the rule is heading at once; a user who wants the rule's gradual path switches to Automatic, which now starts from the rate held. The key rate's rule-level concept is `interest-rate-channel`; `taylor-rule` stays on the rule's own terms and the offset.

**`lamPol` 1.4 a year**: 30% of a gap closes each quarter, e^(−0.35) = 0.70 of it remains (Clarida, Galí and Gertler 2000). **`aPiA` 0.5**: lasting actual inflation moves the key rate 1.3 × 0.5 + 0.5 = 1.15 points per point (Taylor principle), 2.3 per point of expected inflation; the `taylor-principle` test now checks those coefficients.

**Imports are paid at border prices.** `borderImportPrice` = exchange rate × world prices, an identity. Every import rule and the import volume use it (and builders' value added deflates their imports by it). `importPrice`, still smoothed at `lamPm`, is now the wholesale price importers charge at home; it feeds `deliveredImportPrice`, unit cost and the CPI as before. The difference lands in the margins of whoever imports (retail, builders, exporters). A −10% sentiment shock now worsens the current account by 1.8 pp of GDP in month 1 and improves it by 0.8 pp at month 12 (a J-curve); world prices +10 worsen it by 2.6 pp in month 1.

**Portfolio balance nets out the carry trade and is bounded.** The term is

> betaH × log((max(net holdings, −fxDepth ÷ 2) + fxDepth) ÷ (wanted + fxDepth))

- *Net holdings* are non-residents' deposits and government bonds less their króna loans (`kronaLoansW`), in real terms.
- *Wanted* is normal holdings (`krona0`) plus the bonds the carry trade wants when Icelandic rates are high (`bondW` × `psiB` × the rate gap, the same demand as `bondPurchasesW`).
- *fxDepth* (9% of GDP) stands for the rest of the króna market (residents' foreign-currency deposits, banks' currency positions, exporters' conversions).

Its slope at baseline is betaH ÷ (krona0 + fxDepth) ≈ 1.7% per 1% of GDP (v1: 4.2%), falling for larger swings, and it can make the króna at most about 40% stronger (v1: about 145%). A short position counts only down to half the depth. The regime label "Non-residents are short of krónur: portfolio balance at its bound" names the months it binds.

**Reserve income is paid in foreign currency.** `fxReserveIncome` accrues to `fxReserves` (no krónur move), and the central bank sells reserves worth the normal yield, `iFXR` × reserves, to non-residents for krónur (`fxReserveSales`, a redemption). At the normal foreign rate both are equal, so the baseline and its cash flows are unchanged. When rates abroad rise, the extra income stays in the reserves (`reserveIncomeKept`), which counts in the current account but not in non-residents' króna deposits (`wDepositsBeforeTrade`, and the funds' `kronurAbroad` limit in `pensions.ts`). The central bank still remits its whole profit to the government in krónur.

**The interest-rate channel is a concept.** `interest-rate-channel` (Mishkin 1995; Bernanke and Gertler 1995) tags the pass-through of the key rate to deposit, loan, mortgage and bond rates, the real rate in consumption and the cost of borrowing in investment, in both models. `gradual-adjustment` tags the rule's smoothing.

## Recalibration

Border prices and the new portfolio term change how the króna answers the current account, and the smooth takeover lengthens the rate experiment's tight policy. Seven parameters were re-set together so that every check stays in range (the search is described in the parameters' provenance notes):

| Parameter | Before | After | What it is |
|---|---|---|---|
| `lamPol` | 3 | 1.4 | rule smoothing, a year |
| `aPiA` | 0.3 | 0.5 | rule weight on actual inflation |
| `betaI` | 0.55 | 0.35 | króna per unit of rate gap (carry) |
| `betaH` | 0.3 | 0.27 | portfolio balance |
| `fxDepth` | none | 9 | depth of the króna market, % of GDP |
| `eta` | 0.5 | 0.07 | capacity pressure on the markup |
| `lamRer` | 1 | 1.5 | speed of trade volumes, a year |
| `epsM` | 0.6 | 0.75 | import volumes versus the real exchange rate |

`eta` moved most. With the takeover smooth, v1's 0.5 took the rate experiment's inflation trough to about −0.47 pp against QMM's −0.24 pp for an output fall of the same size; 0.07 leaves slack to reach prices mainly through wages and the króna.

Calibration checks that moved (before → after): `rate-output-trough` −0.44 → −0.58; `rate-output-timing` quarter 4 → 5 (QMM's; no longer a known gap); `rate-inflation-trough` −0.333 → −0.338 (in band without the drop; no longer a known gap); `rate-krona` 0.41 → 0.56 (still a known gap against QMM's 0.67); `wage-key-rate-peak` 1.28 → 1.46; `wage-unemployment-peak` 0.51 → 0.52; `wage-price-level-6y` 3.42 → 4.18; `wage-back-consumption` 0.20 → 0.15; `fiscal-output-year1` 0.49 → 0.54; `krona-pass-through-year1` 0.218 → 0.204; `tourism-slump` −7.5% → −4.9% (the 2020 evidence scaled to a 30% fall is about 4%); `world-prices-krona-year1` 1.53 → 0.89; `foreign-rate-krona-2y` −0.93 → −1.16.

## Known gaps

- **The funds' foreign income and the net position (FX-1).** The pension funds' extra foreign income is still paid home in krónur (`pensions.ts`), and no foreign-currency debt pays the foreign rate (banks' foreign funding, Treasury FX bonds). So Iceland's income from abroad rises by about 0.3% of GDP a year per point of foreign rate, where its roughly matched foreign-currency position would give 0.05–0.1. Per point held for 20 years the króna ends about 0.6% stronger on Automatic and 3.5% on Manual (it was 5–6% and 9–11.5%).
- **Lasting current-account changes still drift in nominal terms.** A permanent export loss or gain (tourism, foreign demand, fish prices, the foreign allocation) keeps adding to or draining non-residents' krónur, and the króna and prices keep moving for twenty years (tourism −60 on Automatic: inflation still 2.7 pp above baseline at month 240). The rule was tried with a slow integral term on inflation: it cut that to about 1.8 pp but pushed the wage checks out of range (`wage-key-rate-peak` 1.65, `wage-back-*` 0.32–0.58). A capacity-based output gap and a learning neutral rate belong with the nominal-drift decision (decision 0002 §6), which also owns a current account that closes.
- **Demand booms still depreciate the real króna after about two years.** Lending appetite +3 on Automatic leaves the real exchange rate at or below baseline for 24 months (before, it was already weaker within two years) but still about 0.8% weaker at five years, as the current-account deficit adds to non-residents' holdings; on Manual it weakens from the start. A slow-moving normal level of holdings would delay it further but also weakens the tourism and króna-shock responses the checks pin.
- **The króna recovers slowly from a sentiment shock.** With the weaker portfolio slope a −10% shock is still 7.5% (Automatic) to 8.5% (Manual) weaker after a year; half has gone after two years on Automatic and three on Manual (before: a year).
- **The debt rule's switch still jumps** (decision 0004, known gaps).
- **Engine v1** (`legacy/v1-engine`) keeps `lamPol` 3 and its own rule.
