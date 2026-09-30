# 0013. The króna, stage 1: portfolio balance prices the flow of krónur; the reserve target is set in foreign currency

Status: accepted (September 2026), **not releasable**. Phase 3 of the long-run anchors proposal (section C, stage 1), with the owner's decision 10. **Phase 3 is incomplete: its release blocker, the item-4 fix, is not delivered.** A credit boom with the policy rules acting still weakens the real króna (+0.135% over months 12–36, against the criterion ≤ 0), and no principled change inside stage 1 meets the criterion (see "Item 4" below). This branch must not go to main until either the policy-side timing lands (item 14, phase 5) or the owner records a decision to release stage 1 with item 4 open. Stage 1 supersedes the portfolio-balance part of [decision 0007](0007-monetary-fx.md). It closes lever-vetting open item 18, closes the bound part of item 5, and improves item 17 without solving it.

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

> smoothBound(gap, pbBound), where gap = pbStock × (holdings − wanted) + pbFlow × inflow

- *Holdings* and *wanted* are as in decision 0007: non-residents' deposits and government bonds less their króna loans, in real terms, against their normal holdings plus the bonds the carry trade wants when Icelandic rates are high.
- *Inflow* is `kronaInflowW`, the net flow of krónur to non-residents, a quarter's average (`lamFlowFX` 4 a year) of last month's current-account deficit, less the reserve income the central bank keeps abroad (counted in the current account, paid in foreign currency), plus pension funds' foreign purchases, all at baseline prices. It is what non-residents' holdings are about to grow by.
- *smoothBound* is one for one while non-residents hold more than they want, and `pbBound` × tanh(gap ÷ `pbBound`) on the short side, so however short they are, portfolio balance makes the króna at most 0.2 log points stronger, approached smoothly.

The flow part is **extrapolative expectations of flows**, not the forward-looking pricing of Blanchard, Giavazzi and Sa (2005) that motivates it: the market takes the last quarter's flow as the flow still to come and prices about `pbFlow` ÷ `pbStock` ≈ 0.66 years (eight months) of it. The explain texts say so. The carry trade's bond purchases are not part of that flow: non-residents pay for them out of their own króna deposits, so they change what non-residents hold, not how much. A test checks it kernel step by kernel step: with the key rate 2 points above neutral the carry trade buys bonds, and non-residents' holdings still change by exactly the flow the flow term reads.

**The gap before the bound is a variable of its own, and the bound has a regime label (item 5).** A gate on the bounded term passes by construction, so `portfolioGap` is a BEHAVIOUR variable with its own rule and terms (holdings, flow), and the króna's rule names the regime "Portfolio balance near its limit: non-residents short of krónur" whenever more than 80% of the limit is used (`boundUsed` > `PB_NEAR_LIMIT`), so the lever report shows it (model rule 2). Under income tax +10 the gap before the bound is −0.44 log points at month 240 with both policy levers locked (−0.37 with the rules acting), the limit 97% used, and the regime shows from month 141 (153). With both policy levers locked the króna now stays within 0.2 log points of parity for 20 years under income tax ±10 (at most 0.126), so the TAX-1 remainder is closed, and its tripwire test is now a test of the review's ask. (The limit is on the strong side only: with the rules acting, income tax −10 leaves the króna 0.22 log points weaker than consumer-price parity at month 240, where non-residents hold more krónur than they want.)

**The reserve target is set in foreign currency (E2).** Reserve adequacy is a foreign-currency idea. The target is `fxr`% of real GDP over the past twelve months (`outputTrailing12`: each month at baseline prices, then averaged), valued at the world prices the króna has adjusted to (`worldPriceAnchor`, the slow anchor, so that a jump in world prices does not move the target before the króna has absorbed it) and turned into krónur at last month's exchange rate (`reserveTarget` in `central-bank.ts`). A move in the króna revalues the reserves and the target alike, so it triggers no sales. After a 25% fall in sentiment with both policy levers locked the bank now buys a little, 0.12% of GDP net over months 1–36, because the target is a share of real GDP and the weaker króna brings a boom (output 5.7% higher at month 12); six months on the reserves are 1.4% below their target, where a target in krónur would put them 32% above it. With the target in krónur the bank sold 0.86% of GDP into the fall: on a held policy, intervention by the back door, now gone. The rule remains an operating rule (CONTRACT), the same locked or not; a foreign-exchange intervention rule would be POLICY, declared as a stabiliser, and is not built.

The first version of this decision divided the past year's GDP in krónur by last month's domestic prices. During a depreciation that ratio understates real GDP (97.1 against an average of 104.1 over the past year at month 12 after the shock, with both levers locked), so the target fell and the bank still sold 0.27% of GDP into the fall; the review of this decision caught it.

**Parameters and provenance.** `betaH` and `fxDepth` are removed (the log form is gone). New:

| Parameter | Value | Basis |
|---|---|---|
| `pbStock` | 0.0121 log points per % of GDP | calibrated: the prototype's deeper market, 0.45 ÷ (krona0 + 30% of GDP of other holders), linearised; decision 0007's log form had 1.7% at baseline |
| `pbFlow` | 0.008 log points per % of GDP a year | calibrated, identified from the 2020 depreciation: tourism −60 should weaken the króna within a year at least as much as the temporary 2020 slump did (nearly 10% trade-weighted, 14.9% against the euro) and somewhat more, not the 20% of a learned equilibrium rate; the band 0.004–0.012 fits, and 0.008 is its middle. The horizon it implies (about eight months) is assumed. Not tuned to the fiscal check |
| `pbBound` | 0.2 log points | assumed: lever review TAX-1 |
| `lamFlowFX` | 4 a year | assumed: a quarter's average |

`betaI` is unchanged at 0.5; its provenance note now says that the króna's first-quarter rise per point of rate gap is 0.61% against QMM's 0.67% (0.69% before this decision) and that decision 0007's joint search is to be rerun in phase 5.

**Fish prices +30 are tested by three real tests (owner's decision 10).** For a quota-bound windfall, GDP volume is ambiguous in theory (Corden and Neary 1982): the spending effect lifts non-tradables, the stronger króna crowds out other exports, and with no resources to move the net sign depends on how much of the spending goes on imports. Year-1 output is now −0.05 to −0.06% in every lock configuration (+0.04 before, −0.02 at the vetting), so "output rises in year 1" is replaced, with the reason recorded next to it in `expectations.ts`, by:

- the spending effect: real household consumption up over months 1–36 (+1.6% with the rules acting, +1.4% with both levers locked);
- Dutch disease: tourism and other exports down over months 12–60 (−4.0% and −4.2%), a new headline, `otherExports`;
- the terms-of-trade accounting effect: real gross domestic income (GDP in krónur ÷ consumer prices) up over months 1–12 (+2.8%), a new headline, `realGDI`. It holds by construction and is labelled so.

Year-1 output stays reported as a documented ambiguous case: a model test (`tests/models/iceland-real-economy.test.ts`) keeps it within ±0.15% and checks the two behavioural effects beside it, and the lever report shows it in every run.

**Tourism −60 is back in the gate.** "Inflation up over months 6–24", in every lock configuration, as a sign only: 2020's rise from 1.7% to 3.6% is an upper bound for tourism alone. It is +0.31 pp with both levers locked and +0.50 with the rules acting (−0.10 and +0.15 before).

## Item 4: the release blocker, not fixed

The proposal's criterion: with the policy rules acting, lending appetite +3 must leave the real exchange rate (e × world prices ÷ domestic prices) no weaker on average over months 12–36. Measured here (+ weaker):

| Lending appetite +3, policy rules acting, months 12–36 | Real exchange rate | Key rate |
|---|---:|---:|
| Main (one step a month, fixed capacity) | +0.021% | +0.27 pp |
| Two steps a month, fixed capacity | ≈ +0.03% (smoothed index +0.004%) | +0.27 pp |
| Labour-market gap (decision 0012), before stage 1 | +0.111% | +0.14 pp |
| **Stage 1 (adopted)** | **+0.135%** | +0.14 pp |
| Stage 1 netting the change in the carry trade's wanted holdings (rejected, below) | +0.123% | +0.14 pp |
| Stage 1 with a rule that sees the boom as the fixed-capacity rule did (scratch run) | +0.054% | +0.28 pp |

**The cause.** In the model a credit boom's current-account deficit (0.12% of GDP a year on average over months 12–36) is paid in krónur to non-residents, and nothing else can hold it: there is no foreign-currency borrowing by banks, firms or the Treasury (stage 3). Non-residents then hold more krónur than they want, and portfolio balance weakens the króna until the current account closes; stage 1's flow term prices the flow of those krónur too (the portfolio gap averages +0.0022 log points, 0.22% on the króna, of which the flow is about 0.09%). Only a higher rate offsets it, through the carry term and the carry trade's wanted holdings, and the rule raises the rate little: the labour-market gap reads a credit boom late, because output rises before unemployment falls (firms hoard labour, migrants fill jobs), so the key rate rises 0.14 points where the fixed-capacity rule raised it 0.28. Even with a rule that sees the boom as that one did, the real króna is +0.054% weaker. So the criterion needs more than stage 1 can give: a rule that sees booms in time (item 14, phase 5, which the proposal already found conflicts with the wage checks) and, most likely, a second way to finance a boom's deficit (stage 3) or a stronger carry response found openly in decision 0007's joint search (phase 5).

**What the first version of this decision did, and why it is gone.** It netted from the flow term the krónur "the carry trade takes up a year for the rate gap", `lamBW` × `bondW` × `psiB` × the rate gap, and reported item 4 at +0.100%. The review of this decision showed that this is not a flow. It is a lasting carry term, the same as raising `betaI` from 0.5 to 0.83: removing it and setting `betaI` to 0.8266 reproduces every number to four decimals. And the carry trade's extra purchases, which fall to nothing within a year of a rate step, never take krónur from non-residents, because they pay out of their own deposits. The texts that said the carry trade "keeps buying krónur for the rate gap" were wrong. It made the króna 44% more sensitive to the rate (rate-krona 0.88 against 0.61 without it; QMM 0.67) and put rate-output-trough at −0.576 (limit −0.583, against −0.6) for 0.034 off item 4. It is removed: a stronger carry response, if wanted, belongs in the joint search, openly, against QMM's 0.67.

**The flow counterpart that is a flow** is the one the proposal wrote: price only the growth of holdings beyond the growth of what non-residents want, pbFlow × (inflow − d(wanted)/dt), with d(wanted)/dt a quarter's average of the change in the carry trade's wanted holdings. It was built and measured, and rejected. In a gradual boom the rate gap rises about 0.1 points a year, so it nets almost nothing (+0.135 → +0.123%). On a rate step the derivative is a spike that the flow term prices as eight months of flow, and when the rule takes over from a held rate the spike runs the other way: rate-inflation-timing moved to quarter 4, outside its range of quarters 5–9, and rate-krona to 0.96.

**How it is held.** In `tests/models/iceland-krona.test.ts`:

- The release criterion is a test marked `test.failing`: the credit boom's real króna averages ≤ 0 over months 12–36, and a credit or tax-cut boom leaves it no more than 5e-4 weaker in months 1–18 (decision 0012's bound). It fails now, as expected. Bun reports it as soon as it passes; then `.failing` comes off, and so does "not releasable" here and in architecture row 19. Neither bound is loosened.
- A tripwire keeps the measure from growing: 0 < x < 0.14 (now 0.135).
- The FX-4 test keeps its mechanism check (with the rules acting, the real króna is never weaker than in the same boom with the key rate held, to 1e-6). Its known-gap bound was 5e-4 in decision 0012; stage 1's flow term takes the regression to 0.053% after lending +3 and 0.103% after the tax cut (0.042% and 0.049% with the retune that is removed above), so the test now only stops it growing (1.1e-3, exports 7e-4), and the 5e-4 bound lives on in the failing release test.

For reference, the CPI-based real exchange rate, which the CBI publishes, is +0.009% over months 12–36 (a housing boom raises consumer prices more than domestic producers' prices), and the smoothed index trade sees, `realExchangeRate`, +0.089%. The criterion stays on domestic prices, as the proposal wrote it.

**What the owner needs to decide.** Either release stage 1 only after phase 5 has made the criterion pass, or accept stage 1 with item 4 open as a stated known gap (lending appetite's definition already says so), and record that decision here.

## What moved

**Calibration** (Iceland, all 32 checks in range; before → after this decision, at two steps a month; everything not listed moves less than 0.005):

| Check | Before | After | Range | Note |
|---|---:|---:|---|---|
| rate-krona | 0.685 | 0.607 | 0.3–1.5 | QMM 0.67; the deeper market moves the króna less per krónur wanted |
| rate-output-trough | −0.531 | −0.512 | −0.6 to −0.25 | known gap against QMM's −0.41, now about 25% deeper |
| rate-inflation-trough | −0.231 | −0.215 | −0.35 to −0.1 | QMM −0.24 |
| tourism-slump | −4.275 | −5.266 | −10 to −2 | now converges at first order and is gated in full |
| world-prices-krona-year1 | 0.611 | 0.688 | 0–5 | |
| foreign-rate-krona-2y | −1.218 | −1.187 | −1.5 to −0.3 | |
| fiscal-output-year1 | 0.576 | 0.598 | 0.3–0.6 | **edge**: 0.002 below the top, 0.003 as the step goes to zero (below) |
| wage-back-consumption | −0.006 | −0.027 | ±0.25 | |
| wage-back-output | 0.150 | 0.160 | ±0.25 | |
| wage-price-level-6y | 3.103 | 3.099 | 3–5 | limit 3.036 (3.043 before) |
| world-prices-cpi-year1 | 1.952 | 2.029 | 1.5–2.3 | |
| locked-tax-output | −0.337 | −0.345 | −0.8 to −0.15 | |

wage-key-rate-peak is 1.478 (1.474 before), 0.022 below the top of its range; wage-key-rate-month12 0.676 (0.678).

**The fiscal multiplier's edge.** The proposal warned that the labour-market gap and the flow term both raise the year-1 multiplier (public investment raises imports, the flow term weakens the króna, net exports rise; the rule tightens less when unemployment moves less than output). It is 0.598, as the proposal's package measured. It is not tuned: if a later change pushes it out, trace the multiplier's own path, not the króna's horizon. Its range (0.3–0.6) is itself an inference from a cross-country median and Iceland's openness.

**Half-step test.** The worst share is 0.45; no limit is outside its range. In `bun run harness --full`, two orders are outside 0.5–2 and declared `limitIndicative`, with the measured values in their reasons: wage-inflation-peak (its peak moves from month 13 to 14 between two and four steps a month, as before decision 0012) and fiscal-output-year1 (the step moves it by about 2e-4, shrinking only slowly). tourism-slump now converges at first order (order about 1.2) and is gated; so are wage-key-rate-peak (about 0.8) and wage-back-consumption (about 1.3).

**Tripwires restated, each with its reason next to it:**

- FX-1, foreign rate +5 held with the rules acting: broad money peaks at +11.2% in month 174 (+9.3% in month 148 before), since the surplus is larger and lasts longer; it falls back as before, only later: below 0.8 of its peak by month 360 (0.63; 0.77 at month 300) instead of month 240 (0.91 now). The bound on the peak moves 10 → 12.
- Pension funds ±20: the ±20 responses are no longer within a ratio of 1.5 (1.84 locked): the smooth limit binds on the strong side by design. Symmetry is now tested at ±5, where it holds within 1.1.
- Income tax +10 held: the known gap is closed; the test now asks for 0.2 log points of parity for 20 years at ±10, and checks the gap before the limit and the regime label month by month.
- MON-1, key rate +1 held with both levers locked: output back above baseline from month 138 (136); the bound moves 136 → 140. The first month's budget balance keeps its bound (−0.113% of GDP; −0.108 before).
- M6, pension funds −20 and tourism +30: non-residents' króna loans keep rising (3.2% of GDP by month 36, 6.0% by month 240, the growth slowing every two years) where they peaked at 2.5% and fell. The linear portfolio term is flatter than the log form was once non-residents are short (1.2% per 1% of GDP against about 4%), so the króna strengthens less and the surplus lasts. Non-residents borrowing krónur for decades is what stage 2 is for; it is a known gap with a tripwire.
- The funds' overdraft in the collapse scenario (decision 0002 §6) now starts in month 379 (292), 370 with only income tax held (281); the model test and the interface test run 35 and 400 months.
- The pension funds' foreign-allocation pace at +20: 8.9 points at month 12 with both levers locked, 8.7 with the rules acting (7.8 before): the market prices the funds' purchases as they flow, so the króna falls faster (16% by month 15, 13% before) and revalues what they hold abroad. The module test's range moves 7–8.5 → 8–9.5, and the lever's definition says so.
- The escape-clause test now asks for the rule below its band through the whole month before (at two steps a month the first step of a month reads the rule mid-month); the escape clause after tourism −60 with the key rate locked now starts in month 25 (13), so the shadow test looks at month 36.
- MON-11 is unchanged (investment troughs in month 20, a month after consumption), with a new check that investment spending troughs after its plans (month 15).

**A new display threshold.** After pension funds −20 with the key rate locked, the carry trade's regime switched between "Purchases limited by cash in hand" and "Selling bonds to keep enough króna cash" six times in five years, while its deposits sat at their floor and the cash term hovered within 0.003% of GDP a year of zero: a new Flicker flag. Sales are now named only above 0.01% of GDP a year (`W_SALES_MATERIAL`, assumed, a display threshold like firms' `SPARE_MATERIAL` in decision 0011); a test checks the label and the flicker.

**Other measures:**

| | Locked, before → after | Rules acting, before → after |
|---|---|---|
| kronaShock −25: price level at months 12 / 60 / 120 / 240 | 5.4 / 2.2 / 1.9 / 0.0 → 5.4 / 7.5 / 6.0 / 1.4% | 5.1 / 0.8 / 1.1 / 0.2 → 5.2 / 4.4 / 3.1 / 0.7% |
| kronaShock −25: foreign currency dearer at months 12 / 36 / 240 | 23.8 / −1.0 / −1.4 → 24.3 / 16.1 / −2.1% | → 22.0 / 12.3 / −2.2% |
| kronaShock −25: price level at month 480 | −3.0 → −5.4% | −0.3 → −0.5% |
| kronaShock −25: real half-life from month 3 | 13 → 17 months | 12 → 13 months |
| Tourism −60: output at month 240 | | −2.1 → −1.2% |
| Income tax +10: output at month 240 | −18.9 → −14.7% | |

The price level after a one-off shock now keeps a lasting part for a decade, and it is domestic: wages after a longer export boom, as the proposal's decomposition found. Base drift beyond 240 months on a held policy is larger (−5.4% at month 480), because nothing anchors the price level there (issue D): judge base drift with the rules acting, to month 480.

**Lever report** (Iceland, flags other than Regimes, before stage 1 → after; 339 runs, none broken, 213/213 expectations; the reference report does not change):

- **Explosive 28 → 30.** Gone: the CPI after aluminium −40 locked; income tax after tourism −60 with the key rate locked. New: working-age real disposable income after the key rate held at 15% while income tax is unlocked (−34% at month 240, still moving: the debt rule's tax rises in a run the definition already calls a runaway); tourism and other exports after health +3 with the rules acting (−1.2% at month 240, a new headline: the stronger real króna crowding out other exports as the rule holds the rate higher; education +3 shows the same beside its existing flags); real pension-fund assets after other services −3 with the key rate locked (−1.0%, in a run where prices fall with the key rate held: issue D). The CPI flag after fish −30 locked is now on broad money.
- **Extreme 44 → 42.** Gone: government debt after pension funds −20, locked and with the key rate locked (+28.7 and +27.1 points of GDP before).
- **Lock sign 32 → 28.** Gone: tourism −60 on inflation (it now rises in every configuration), pension funds −20 on the current account, the króna after benefits ±10, exports after health ±0.8 and ±3. New, all small: consumption after health ±3 (±0.35%) and other services ±0.8 (±0.04%), investment after education ±0.8 (±0.16%); some of the króna flags after education, world prices and immigration now name a different variable.
- **Unsettled 276 → 276; Regimes 210 → 216** (the new regime label under income tax +10, and the carry trade's and non-residents' borrowing labels in more runs). **Flicker 0 → 0** after the display threshold above.
- The **definitions** of keyRate, lendingAppetite, foreignDemand, tourism, kronaShock, foreignRate, importPrices, fishPrices, wageSettlement, incomeTax, pfForeign and the shared paragraphs on held policy and public spending carry the new figures.

**Goldens and fixture.** `bun run harness --update-golden` changed all 35 Iceland goldens (the króna moves in every scenario, locked or not); the reference goldens do not change. The six Iceland scenarios of the version-1 fixture were recomputed on the pre-padlock engine at two steps a month with decisions 0012 and 0013 applied, so a migrated old link still gives what the old engine gives, bit for bit; the reference scenarios are unchanged.

## Known gaps, stated

- **Item 4**, above: +0.135% against ≤ 0; the release blocker.
- **The real half-life** after kronaShock −25 is 17 months with both policy levers locked and 13 with the rules acting, from month 3 (e × world prices ÷ domestic prices), against QMM's 24–40. The fast reversion comes from the portfolio closure overriding the premium, not from sentiment fading (proposal H5). A tripwire test keeps it below 24; stage 2 is to bring it there.
- **Item 17** is improved, not solved: net foreign assets still have no home, the late real overshoot is larger (lowest real rate over months 61–240 −4.4% locked, −3.9% with the rules acting, against −1.8 and −1.6), and non-residents can end up borrowing krónur for decades (M6).
- **Item 5's other part** stays open: public investment +0.8 with both levers locked still lowers real consumption (−0.17% at month 36, −0.14% at month 240).
- **rate-krona** is 0.61 against QMM's 0.67, inside its band: phase 5's rerun of decision 0007's joint search, which is also where a stronger carry response belongs if item 4 needs one.

## Alternatives considered

- **Netting a lasting carry flow,** `lamBW` × `bondW` × `psiB` × the rate gap (this decision's first version): a hidden retune of `betaI` (above). Removed.
- **Netting the change in the carry trade's wanted holdings,** the proposal's literal candidate: +0.123% on item 4, and rate-inflation-timing out of range (above). Rejected.
- **Wanted holdings that grow with real activity,** as the carry trade's bond rule grows with nominal GDP: the reviewer's probe gave about −0.016 on item 4. It would add a channel from every output shock to the króna, which needs its own calibration; not stage 1's to add.
- **The market prices the rule's path,** the carry term reading where the rule is heading while the key rate is unlocked: −0.03 on the boom at most, with a new expectations channel on a shadow variable. Not built.
- **A smaller `pbFlow` or `pbStock`,** or no flow term: both leave the 2020 evidence that identifies them. Rejected: a króna parameter is not tuned to one lever.
- **A stronger rule** (`aY` 2, 3): owner's decision 7 fixes the strength until the joint refit.
- **Banks' foreign funding of a credit boom** (E4), the channel that financed Iceland's deficits in 2004–07: stage 3.

## Next steps

**Before stage 1 is released:** phase 5 (item 14's timing, and decision 0007's joint search of `betaI`, `psiB` and the consumption habit against QMM's 0.67) is run with the failing release test as one of its targets, or the owner records a decision to release with item 4 open.

**Stage 2 (item 17, phase 8), re-specified from the proposal's D5b:**

1. run the four remaining experiments first: H1 (E7 to 600 months), H2 (a resident foreign-currency home), H3 (the EBA-style current-account gap), H4 (the persistence refit against the real half-life);
2. give net foreign assets a home that is not pinned: residents holding foreign-currency assets in a Godley–Lavoie wealth-share portfolio, instead of non-residents borrowing krónur for decades;
3. one slow closure on Iceland's total net foreign assets, a debt-elastic premium with a Lane and Milesi-Ferretti-sized slope, replacing the norm on non-residents' krónur alone;
4. an equilibrium real exchange rate that moves with an underlying current-account gap measured at the baseline real rate and at potential, learned by the market (IMF EBA; Clark and MacDonald's BEER), not keyed to levers;
5. acceptance: the real half-life after kronaShock −25 in or near QMM's 24–40 months in both configurations; the CPI split into import-price and domestic parts at months 60 and 120; with the rules acting, the price level above baseline at month 480 (sign only until a QMM run of a lasting premium shock is obtained); with both levers locked, no change of sign before month 240; lasting export shocks with the rules acting within ±0.3 pp of target over months 180–240; the lowest real rate after month 60 within the Lane and Milesi-Ferretti effect of the change in net foreign assets. Its decision record is 0014.

**Stage 3 (item 1):** foreign-currency liabilities as a data project: banks' foreign funding matched by foreign-currency loans and liquid foreign-currency assets, Treasury eurobonds, built on CBI and IMF balance-sheet data, with a closure that keeps pension funds' bank bonds at their data level. Acceptance: the current account in month 1 per point of the foreign rate below 0.1% of GDP, and the "foreign rate does not move inflation" expectation back in the gate. It is also the second way to finance a boom's deficit that item 4 may need.
