# 0013. The króna, stage 1: portfolio balance prices the flow of krónur; the reserve target is set in foreign currency

Status: accepted (September 2026), **not yet releasable**. Phase 3 of the long-run anchors proposal (section C, stage 1), with the owner's decision 10. It supersedes the portfolio-balance part of [decision 0007](0007-monetary-fx.md). It closes lever-vetting open item 18, closes the bound part of item 5, improves item 17 without solving it, and fixes the part of item 4 that stage 1 itself caused. The rest of item 4, the release blocker, needs the central bank's rule to see a credit boom in time (item 14, phase 5): see "Item 4" below.

## The problem

The króna had no slow pull back to parity after a shock and a one-off shock faded too completely (item 17); a collapse in tourism weakened it too little to lift inflation with the key rate held (item 18); the portfolio term sat at its bound and the bound was 0.34 log points, not the 0.2 the review asked for (item 5); and booms weakened the real króna (item 4). On the model before this decision, two steps a month and the labour-market gap:

| Before stage 1 | Both policy levers locked | Policy rules acting |
|---|---:|---:|
| Tourism −60: foreign currency dearer at month 12 | 7.4% | 8.7% |
| Tourism −60: inflation, months 6–24 | −0.10 pp | +0.15 pp |
| kronaShock −25: price level at months 12 / 60 / 120 / 240 | 5.4 / 2.2 / 1.9 / 0.0% | 5.1 / 0.8 / 1.1 / 0.2% |
| kronaShock −25: reserves sold into the fall, months 1–36 | 0.86% of GDP | 0.78% of GDP |
| Income tax +10: the króna beyond parity at month 240 | 0.27 log points | |
| Lending appetite +3: real exchange rate, mean of months 12–36 (+ weaker) | +0.20% | +0.11% |

The root cause, found by the króna prototypes behind the proposal: every holder of foreign-currency positions has a fixed target, so net foreign assets are forced back to baseline, which forces the integral of the real exchange rate back to about zero, and the price level follows. The portfolio term also reacted only to krónur that had already piled up, not to a flow the market can see coming.

## The decisions

**Portfolio balance prices the flow of krónur, with a smooth bound.** The portfolio term of the króna's target is now

> smoothBound(gap, pbBound), where gap = pbStock × (holdings − wanted) + pbFlow × (inflow − carry)

- *Holdings* and *wanted* are as in decision 0007: non-residents' deposits and government bonds less their króna loans, in real terms, against their normal holdings plus the bonds the carry trade wants when Icelandic rates are high.
- *Inflow* is `kronaInflowW`, the net flow of krónur to non-residents, a quarter's average (`lamFlowFX` 4 a year) of last month's current-account deficit, less the reserve income the central bank keeps abroad (counted in the current account, paid in foreign currency), plus pension funds' foreign purchases, all at baseline prices. It is what non-residents' holdings are about to grow by.
- *Carry* is the krónur the carry trade takes up a year for the rate gap: the carry term of its own bond rule, `lamBW` × `bondW` × `psiB` × the rate gap. This is the item-4 fix (below).
- *smoothBound* is one for one while non-residents hold more than they want, and `pbBound` × tanh(gap ÷ `pbBound`) on the short side, so however short they are, portfolio balance makes the króna at most 0.2 log points stronger, approached smoothly.

The flow part is **extrapolative expectations of flows**, not the forward-looking pricing of Blanchard, Giavazzi and Sa (2005) that motivates it: the market takes the last quarter's flow as the flow still to come and prices about `pbFlow` ÷ `pbStock` ≈ 0.66 years (eight months) of it. The explain texts say so.

**The gap before the bound is a variable of its own, and the bound has a regime label (item 5).** A gate on the bounded term passes by construction, so `portfolioGap` is a BEHAVIOUR variable with its own rule and terms (holdings, flow, carry), and the króna's rule names the regime "Portfolio balance near its limit: non-residents short of krónur" whenever more than 80% of the limit is used (`boundUsed` > `PB_NEAR_LIMIT`), so the lever report shows it (model rule 2). Under income tax +10 the gap before the bound is −0.43 log points at month 240 with both policy levers locked (−0.36 with the rules acting), the limit 97% used, and the regime shows from month 145 (157). With both policy levers locked the króna now stays within 0.2 log points of parity for 20 years under income tax ±10 (at most 0.125), so the TAX-1 remainder is closed, and its tripwire test is now a test of the review's ask. (The limit is on the strong side only: with the rules acting, income tax −10 leaves the króna 0.21 log points weaker than parity at month 240, where non-residents hold more krónur than they want.)

**The reserve target is set in foreign currency (E2).** Reserve adequacy is a foreign-currency idea. The target is `fxr`% of the past twelve months' GDP at baseline prices, valued at the world prices the króna has adjusted to (`worldPriceAnchor`, the slow anchor, so that a jump in world prices does not move the target before the króna has absorbed it) and turned into krónur at last month's exchange rate (`reserveTarget` in `central-bank.ts`). A move in the króna revalues the reserves and the target alike, so it triggers no sales: after a 25% fall in sentiment the reserves sold in months 1–36 are 0.27% of GDP with both policy levers locked (0.86 before), and six months on the reserves are 1.5% above their target where a target in krónur would put them 32% above it. On a held policy, selling reserves into a depreciation was intervention by the back door; it is gone. The rule remains an operating rule (CONTRACT), the same locked or not; a foreign-exchange intervention rule would be POLICY, declared as a stabiliser, and is not built.

**Parameters and provenance.** `betaH` and `fxDepth` are removed (the log form is gone). New:

| Parameter | Value | Basis |
|---|---|---|
| `pbStock` | 0.0121 log points per % of GDP | calibrated: the prototype's deeper market, 0.45 ÷ (krona0 + 30% of GDP of other holders), linearised; decision 0007's log form had 1.7% at baseline |
| `pbFlow` | 0.008 log points per % of GDP a year | calibrated, identified from the 2020 depreciation: tourism −60 should weaken the króna within a year at least as much as the temporary 2020 slump did (nearly 10% trade-weighted, 14.9% against the euro) and somewhat more, not the 20% of a learned equilibrium rate; the band 0.004–0.012 fits, and 0.008 is its middle. The horizon it implies (about eight months) is assumed. Not tuned to the fiscal check |
| `pbBound` | 0.2 log points | assumed: lever review TAX-1 |
| `lamFlowFX` | 4 a year | assumed: a quarter's average |

**Fish prices +30 are tested by three real tests (owner's decision 10).** For a quota-bound windfall, GDP volume is ambiguous in theory (Corden and Neary 1982): the spending effect lifts non-tradables, the stronger króna crowds out other exports, and with no resources to move the net sign depends on how much of the spending goes on imports. Year-1 output is now −0.05% in every lock configuration (+0.04 before, −0.02 at the vetting), so "output rises in year 1" is replaced, with the reason recorded next to it in `expectations.ts`, by:

- the spending effect: real household consumption up over months 1–36 (+1.5% with the rules acting, +1.4% with both levers locked);
- Dutch disease: tourism and other exports down over months 12–60 (−3.8% and −4.1%), a new headline, `otherExports`;
- the terms-of-trade accounting effect: real gross domestic income (GDP in krónur ÷ consumer prices) up over months 1–12 (+2.8%), a new headline, `realGDI`. It holds by construction and is labelled so.

Year-1 output stays reported as a documented ambiguous case: a model test (`tests/models/iceland-real-economy.test.ts`) keeps it within ±0.15% and checks the two behavioural effects beside it, and the lever report shows it in every run.

**Tourism −60 is back in the gate.** "Inflation up over months 6–24", in every lock configuration, as a sign only: 2020's rise from 1.7% to 3.6% is an upper bound for tourism alone. It is +0.31 pp with both levers locked and +0.55 with the rules acting (−0.10 and +0.15 before).

## Item 4: the release blocker

The proposal's criterion: with the policy rules acting, lending appetite +3 must leave the real exchange rate (e × world prices ÷ domestic prices) no weaker on average over months 12–36. Measured here (+ weaker):

| Lending appetite +3, policy rules acting, months 12–36 | Real exchange rate | Key rate |
|---|---:|---:|
| Main (one step a month, fixed capacity) | +0.021% | +0.27 pp |
| Two steps a month, fixed capacity | ≈ +0.03% (smoothed index +0.004%) | +0.27 pp |
| Labour-market gap (decision 0012), before stage 1 | +0.111% | +0.14 pp |
| Stage 1 as prototyped | +0.134% | +0.14 pp |
| **Stage 1 with the carry trade's flow netted (adopted)** | **+0.100%** | +0.14 pp |
| The same, with a rule that sees the boom as the fixed-capacity rule did (scratch run) | −0.005% | +0.26 pp |
| The same, without the netting (scratch run) | +0.053% | +0.28 pp |

**The cause.** In the model a credit boom's import bill is paid in krónur to non-residents; they hold more than they want, and portfolio balance weakens the króna until the current account closes. Only a rate rise offsets it, through the carry term and the carry trade's wanted holdings. Two things made the offset too small:

1. **The flow term priced one side of the flows.** It read the boom's import bill as a flow still to come (the flow is +0.05% of GDP a year at month 12, when the key rate has risen 0.03 points), while the carry trade's demand for krónur at the higher rate was priced only as a stock. Netting the carry trade's flow, the flow counterpart of netting its wanted holdings out of the stock term, removes stage 1's own contribution: +0.134 → +0.100%, below the +0.111% before stage 1. The narrower form the proposal wrote, netting only the *change* in the carry trade's wanted holdings, is tested and rejected (below).
2. **The rule reads the boom late.** In a credit boom output rises before unemployment falls (firms hoard labour, migrants fill jobs), so the labour-market gap sees about a third of it: output +0.33% and unemployment −0.08 points over months 12–36, so the key rate rises 0.14 points where the fixed-capacity rule raised it 0.27. That is item 14's timing, which the proposal assigns to the joint refit (phase 5), and owner's decision 7 fixes the rule's strength until then.

With both, the criterion holds (−0.005% in a scratch run with a rule that reads the fixed-capacity gap). With only the first, it does not: **+0.100% against ≤ 0. Stage 1 is therefore not releasable until item 14 lands, or the owner decides otherwise.** The test "item 4, a credit boom with the policy rules acting" in `tests/models/iceland-krona.test.ts` holds what is fixed (the netting takes about a quarter off, and the result is no weaker than before stage 1) and bounds the rest as a tripwire (0 < x < 0.105), to become the release criterion when it passes ≤ 0. The existing FX-4 test (the carry trade's krónur strengthen, never weaken, against the key rate held; at most 0.05% weaker than no boom in months 1–18) holds: 0.042% after lending +3 and 0.049% after the tax cut, which stage 1 without the netting took to 0.052%. For reference, the CPI-based real exchange rate, which the CBI publishes, is −0.02% over months 12–36: a housing boom raises consumer prices more than domestic producers' prices. The criterion stays on domestic prices, as the proposal wrote it.

**What the netting does besides.** It lasts as long as the rate gap does, like the carry term, so it strengthens the króna's response to any lasting rate gap by about two-fifths: rate-krona 0.61 → 0.88% per point (QMM's 0.67; it was 0.69 before stage 1), and the rate checks' troughs deepen (output −0.53 → −0.58%, near the bottom of its −0.6 range as the step goes to zero, −0.583; inflation −0.23 → −0.27 pp). Decision 0007's joint search of the carry sensitivity, the carry trade's demand and the consumption habit should be rerun in phase 5, against QMM's 0.67.

## What moved

**Calibration** (Iceland, all 32 checks in range; before → after this decision, at two steps a month; everything not listed moves less than 0.005):

| Check | Before | After | Range | Note |
|---|---:|---:|---|---|
| rate-krona | 0.685 | 0.877 | 0.3–1.5 | QMM 0.67; the carry trade's flow |
| rate-output-trough | −0.531 | −0.576 | −0.6 to −0.25 | limit −0.583, the thinnest rate margin; known gap vs QMM −0.41 |
| rate-inflation-trough | −0.231 | −0.269 | −0.35 to −0.1 | |
| tourism-slump | −4.275 | −5.444 | −10 to −2 | now converges at first order and is gated in full |
| world-prices-krona-year1 | 0.611 | 1.111 | 0–5 | |
| foreign-rate-krona-2y | −1.218 | −1.382 | −1.5 to −0.3 | |
| fiscal-output-year1 | 0.576 | 0.596 | 0.3–0.6 | **edge**: 0.004 below the top at every step (below) |
| wage-key-rate-peak | 1.474 | 1.444 | 1–1.5 | |
| wage-price-level-6y | 3.103 | 3.125 | 3–5 | limit 3.064 (3.043 before) |
| wage-inflation-peak | 2.714 | 2.693 | 1.5–3.5 | |
| wage-back-consumption | −0.006 | +0.048 | ±0.25 | |
| world-prices-cpi-year1 | 1.952 | 1.990 | 1.5–2.3 | |
| locked-wage-inflation-peak | 2.763 | 2.751 | 1.5–4 | |

**The fiscal multiplier's edge.** The proposal warned that the labour-market gap and the flow term both raise the year-1 multiplier (public investment raises imports, the flow term weakens the króna, net exports rise; the rule tightens less when unemployment moves less than output). It is 0.596, against 0.598 for stage 1 without the netting. It is not tuned: if a later change pushes it out, trace the multiplier's own path, not the króna's horizon. Its range (0.3–0.6) is itself an inference from a cross-country median and Iceland's openness.

**Half-step test.** The worst share is 0.44; no limit is outside its range. In `bun run harness --full`, three orders left 0.5–2 and are declared `limitIndicative` with the measured values in their reasons: wage-key-rate-peak (its flat peak moves from month 21 to 22 between four and eight steps a month), wage-back-consumption (the peak month in years 1–2 moves between two and four steps) and fiscal-output-year1 (the step moves it by 1e-4 at most, not in one direction). tourism-slump now converges at first order (order about 1.2) and is gated; wage-inflation-peak's reason is updated.

**Tripwires restated, each with its reason next to it:**

- FX-1, foreign rate +5 held with the rules acting: broad money peaks at +12.7% in month 183 (+9.3% in month 144 before), since the króna stays weaker for longer and the surplus lasts; it falls back as before, only later: below 0.8 of its peak by month 360 (0.72) instead of month 240 (0.94 now). The bound on the peak moves 10 → 13.
- Pension funds ±20: the ±20 responses are no longer within a ratio of 1.5 (1.83 locked): the smooth limit binds on the strong side by design. Symmetry is now tested at ±5, where it holds within 1.1 (was 1.5 at ±20).
- Income tax +10 held: the known gap is closed; the test now asks for 0.2 log points of parity for 20 years at ±10, and checks the gap before the limit and the regime label month by month.
- MON-1, key rate +1 held with both levers locked: output back above baseline from month 140 (136); the bound moves 136 → 142. The first month's budget balance is −0.097% of GDP (−0.108); its bound moves −0.1 → −0.09.
- MON-11: consumption's trough moves a month later (the stronger króna on the hold cushions real incomes), so investment's trough is now in the same month as consumption's (month 20), not a month later. Restated as "no earlier than consumption" (a known gap), with a new check that investment spending troughs after its plans (month 20 against 15).
- M6, pension funds −20 and tourism +30: non-residents' króna loans keep rising (6.0% of GDP at month 240, the growth slowing every two years) where they peaked at 2.5% and fell. The linear portfolio term is flatter than the log form was once non-residents are short (1.2% per 1% of GDP against about 4%), so the króna strengthens less and the surplus lasts. Non-residents borrowing krónur for decades is what stage 2 is for; it is a known gap with a tripwire.
- The funds' overdraft in the collapse scenario (decision 0002 §6) now starts in month 380 (292), 371 with only income tax held (281); the model test and the interface test run 35 years.
- The pension funds' foreign-allocation pace at +20: 8.8 points at month 12 with both levers locked, 8.6 with the rules acting (7.5 before): the market prices the funds' purchases as they flow, so the króna falls faster and revalues what they hold abroad. The module test's range moves 7–8.5 → 8–9.5, and the lever's definition says so.
- The escape-clause test now asks for the rule below its band through the whole month before (at two steps a month the first step of a month reads the rule mid-month); the escape clause after tourism −60 with the key rate locked now starts in month 25 (13), so the shadow test looks at month 36.

**Other measures:**

| | Locked, before → after | Rules acting, before → after |
|---|---|---|
| kronaShock −25: price level at months 12 / 60 / 120 / 240 | 5.4 / 2.2 / 1.9 / 0.0 → 5.4 / 7.4 / 5.9 / 1.4% | 5.1 / 0.8 / 1.1 / 0.2 → 5.1 / 4.2 / 3.0 / 0.7% |
| kronaShock −25: foreign currency dearer at months 12 / 36 / 240 | 23.8 / −1.0 / −1.4 → 24.0 / 15.9 / −2.0% | → 20.9 / 11.8 / −2.1% |
| kronaShock −25: price level at month 480 | −3.0 → −5.4% | −0.3 → −0.4% |
| kronaShock −25: real half-life from month 3 | 13 → 17 months | 12 → 12 months |
| Tourism −60: output at month 240 | | −2.1 → −1.3% |
| Income tax +10: output at month 240 | −18.9 → −14.7% | |

The price level after a one-off shock now keeps a lasting part for a decade, and it is domestic: wages after a longer export boom, as the proposal's decomposition found. Base drift beyond 240 months on a held policy is larger (−5.4% at month 480), because nothing anchors the price level there (issue D): judge base drift with the rules acting, to month 480.

**Lever report** (Iceland, flags other than Regimes; 339 runs, none broken, 213/213 expectations; the reference report does not change):

- **Explosive 28 → 25.** Gone: exports and the smelters' real profits after education +3 with the rules acting; the CPI after fish −30 and after tourism +30 locked; income tax after tourism −60 with the key rate locked (+2.3 points at month 240 before); real pension-fund assets after health −3 with the key rate locked. New: the CPI after aluminium +40 locked (−2.7% at month 240, still falling: a held policy has no nominal anchor, issue D; the proposal foresaw it) and real pension-fund assets after other services −3 with the key rate locked (−1.1% at month 240, in a run where prices fall 25% with the key rate held: issue D again).
- **Extreme 44 → 43.** Gone: government debt after pension funds −20, locked and with the key rate locked (+28.7 and +27.1 points of GDP before). New: government debt −25.2 points of GDP at month 240 with the key rate held at 0% and income tax held (−24.4 before; the threshold is 25): twenty years of a lower interest bill.
- **Lock sign 32 → 33.** Gone: tourism −60 on inflation (it now rises in every configuration), world prices −20 and −5 on the króna, pension funds −20 on the current account. New, all small: bank capital after world prices +10, the króna shock +10 and wage settlements +20 (±0.02 to ±0.06 points: banks' indexed loans follow the CPI, which the rule damps), consumption after other services ±0.8 (±0.04%), the current account after pension funds −5 (0.02 against −0.03), and imports after wage settlements +20 (−0.04 against +0.05%).
- **Unsettled 276 → 274; Regimes 210 → 214** (the new regime label under income tax +10).
- The **definitions** of keyRate, lendingAppetite, foreignDemand, tourism, kronaShock, foreignRate, importPrices, fishPrices, wageSettlement, incomeTax, pfForeign and the shared paragraphs on held policy and public spending carry the new figures.

**Goldens and fixture.** `bun run harness --update-golden` changed all 35 Iceland goldens (the króna moves in every scenario, locked or not); the reference goldens do not change. The six Iceland scenarios of the version-1 fixture were recomputed on the pre-padlock engine at two steps a month with decisions 0012 and 0013 applied, so a migrated old link still gives what the old engine gives, bit for bit; the reference scenarios are unchanged.

## Known gaps, stated

- **Item 4**, above: +0.100% against ≤ 0 until item 14.
- **The real half-life** after kronaShock −25 is 17 months with both policy levers locked and 12 with the rules acting, from month 3 (e × world prices ÷ domestic prices), against QMM's 24–40. The fast reversion comes from the portfolio closure overriding the premium, not from sentiment fading (proposal H5). A tripwire test keeps it below 24; stage 2 is to bring it there.
- **Item 17** is improved, not solved: net foreign assets still have no home, the late real overshoot is larger (lowest real rate over months 61–240 −4.3% locked, −3.7% with the rules acting, against −1.8 and −1.6), and non-residents can end up borrowing krónur for decades (M6).
- **Item 5's other part** stays open: public investment +0.8 with both levers locked still lowers real consumption (−0.16% at month 36, −0.13% at month 240).
- **rate-krona** is 0.88 against QMM's 0.67, and **rate-output-trough** −0.58 against −0.41, both inside their bands: phase 5's rerun of decision 0007's joint search.

## Alternatives considered

- **Netting only the change in the carry trade's wanted holdings,** pbFlow × (inflow − d(wanted)/dt), the proposal's literal candidate. In a gradual boom the rate gap rises about 0.1 points a year, so it nets almost nothing (+0.080 instead of +0.088 on the smoothed index; +0.039 with a rule that sees the boom, so it would not meet the criterion even then); and on a rate step the derivative is a spike, which the flow term then prices as eight months of flow: rate-inflation-timing left its range (month 4 against 5–9) and rate-krona went to 0.96. Rejected.
- **The market prices the rule's path,** the carry term reading where the rule is heading while the key rate is unlocked: −0.03 on the boom at most, with a new expectations channel on a shadow variable. Not needed, not built.
- **A smaller `pbFlow` or `pbStock`,** or no flow term: without the flow term the boom gives +0.041 on the smoothed index, and only halving `pbStock` as well brings it near zero; both leave the 2020 evidence that identifies them. Rejected: a króna parameter is not tuned to one lever.
- **A stronger rule** (`aY` 2, 3): +0.049 and, without the flow term, −0.024 on the smoothed index; owner's decision 7 fixes the strength until the joint refit.
- **Banks' foreign funding of a credit boom** (E4), the channel that financed Iceland's deficits in 2004–07: stage 3.

## Next steps

**Stage 2 (item 17, phase 8), re-specified from the proposal's D5b:**

1. run the four remaining experiments first: H1 (E7 to 600 months), H2 (a resident foreign-currency home), H3 (the EBA-style current-account gap), H4 (the persistence refit against the real half-life);
2. give net foreign assets a home that is not pinned: residents holding foreign-currency assets in a Godley–Lavoie wealth-share portfolio, instead of non-residents borrowing krónur for decades;
3. one slow closure on Iceland's total net foreign assets, a debt-elastic premium with a Lane and Milesi-Ferretti-sized slope, replacing the norm on non-residents' krónur alone;
4. an equilibrium real exchange rate that moves with an underlying current-account gap measured at the baseline real rate and at potential, learned by the market (IMF EBA; Clark and MacDonald's BEER), not keyed to levers;
5. acceptance: the real half-life after kronaShock −25 in or near QMM's 24–40 months in both configurations; the CPI split into import-price and domestic parts at months 60 and 120; with the rules acting, the price level above baseline at month 480 (sign only until a QMM run of a lasting premium shock is obtained); with both levers locked, no change of sign before month 240; lasting export shocks with the rules acting within ±0.3 pp of target over months 180–240; the lowest real rate after month 60 within the Lane and Milesi-Ferretti effect of the change in net foreign assets. Its decision record is 0014.

**Stage 3 (item 1):** foreign-currency liabilities as a data project: banks' foreign funding matched by foreign-currency loans and liquid foreign-currency assets, Treasury eurobonds, built on CBI and IMF balance-sheet data, with a closure that keeps pension funds' bank bonds at their data level. Acceptance: the current account in month 1 per point of the foreign rate below 0.1% of GDP, and the "foreign rate does not move inflation" expectation back in the gate.

**Before stage 1 is released:** item 14's timing (phase 5), then the item-4 test's tripwire becomes the criterion x ≤ 0, and phase 5 reruns decision 0007's joint search with rate-krona against QMM's 0.67.
