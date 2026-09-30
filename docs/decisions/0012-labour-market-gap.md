# 0012. The central bank reads its output gap from the labour market

Status: accepted (September 2026). Phase 2 of the [long-run anchors proposal](../design/long-run-anchors.md) (section B), with the owner's decisions 5, 7, 8 and 10. It answers the part of open items 2 and 19 of the lever-vetting record that belongs to potential output; item 14 stays open for the joint refit of the wage checks.

## The problem

The key-rate rule measured slack as output over a fixed capacity, `potentialOutput` × (1 + the net-immigration newcomers' share of the labour force). Capacity followed the labour force only for that one lever. It ignored the migration buffer, benefits and, above all, the sector mix. Public services are valued at cost and employ many staff for each króna of output, so a lasting shift toward them tightens the labour market while measured output falls. The rule then read slack where there was none. With the policy rules acting, after 20 years:

| Fixed capacity | Output, month 240 | Unemployment, months 180–240 | Inflation, months 180–240 | Neutral-rate estimate |
|---|---:|---:|---:|---|
| Health +3% of GDP | −1.24% | −1.19 points | +0.60 pp | at its 6% limit |
| Education +3% of GDP | −1.49% | −1.46 points | +0.78 pp | at its 6% limit |
| Fish prices +30% | +0.19% | +0.24 points | −0.13 pp | 1.7% (band 0–6%) |
| Tourism −60% | −1.06% (234 months at zero) | +0.71 points | −0.20 pp | at its 0% limit |

## The decisions

**The gap is read from the labour market (owner's decision 7).** The rule's output gap is Okun's factor times how far unemployment is below normal:

> gap = okunGap × (normal unemployment − unemployment a month earlier)

Normal unemployment is the wage curve's, the rate at which wages grow only with expected inflation (`uBase` plus what more generous benefits add; `normalUnemployment` in `labour-and-wages.ts`, which the neutral-rate estimate uses too), and the unemployment rate leaves out the people searching longer because benefits are more generous, as the neutral-rate estimate does. This is potential output as a supply concept: what the economy can produce at normal unemployment with the labour force it has. The Central Bank of Iceland's QMM builds trend employment the same way (trend participation × working-age population × (1 − NAIRU), QMM v2.1 eq. 6.11), and so do the CBO and the European Commission; the gap that drives wage inflation is the unemployment gap (Galí 2011). The newcomer special case is gone: potential now follows the labour force for every shock.

- `outputGap` (POLICY) and `potentialOutputSeen` (IDENTITY, last month's output ÷ (1 + the gap)) are shadow variables of the key-rate stabiliser: with the key rate locked they only feed its suggestion, and the debt rule's escape clause (below).
- The Overview chart `potentialOutputSeen` is labelled "the central bank's estimate from the labour market", not "what the economy can produce": okunGap is a month-12 ratio that includes labour hoarding, and a shock that moves output and jobs in another ratio moves the estimate with it (foreign demand −20 with no migration: potential +0.4% at month 24 while output falls 1.2%).
- **The capacities are named apart.** The fixed baseline capacity, `potentialOutput`, is still what the markup's capacity term and the domestic investment accelerator read, and their texts say so. The indicator is `potentialOutputSeen`, after the variable it shows, not the parameter's id. The proposal's prototype of a capital-based capacity mis-measured utilisation (total GDP against business capital only), so the markup keeps the fixed capacity until a capital-based accelerator is built with a consistent measure (phase 9).

**The strength is anchored on the CBI's own rule: aY × okunGap = 0.8.** `okunGap` is 1.6, the model's own Okun ratio for a private-demand shock as measured with the fixed-capacity rule, before this decision (tourism −15 with the rules acting: output about −1.1% and unemployment +0.66 points at month 12). With the labour-market gap in the rule the same shock gives about 1.85 (output −1.31%, unemployment +0.71 points), because the rule cuts more slowly; with both policy levers locked it is 1.94, before and after (all at two steps a month). The owner's decision fixes the product at 0.8, so `okunGap` stays 1.6 whatever the model's ratio now is. No Okun coefficient for Iceland is published; Ball, Leigh and Loungani (2017) find ratios from about 1.2 to 6. QMM's rule puts 0.5 on the output gap (QMM v2.1 eq. 4.1), so `aY` is 0.5: 0.8 key-rate points per point of unemployment below normal. The calibrated quantity is the product, and both parameters' provenance says so. It is revisited only in the joint refit with item 14 (phase 5), against the CBI's wage-shock evidence, not against a single expectation. Measured at two steps a month with the policy rules acting (the limit as the step goes to zero, from four steps, in brackets):

| | Fixed capacity (aY 1) | 0.8 (aY 0.5), adopted | 1.28 (aY 0.8) | 1.6 (aY 1) |
|---|---:|---:|---:|---:|
| Wages +10%: key rate at month 12, pp | 0.90 (0.86) | 0.68 (0.59) | 0.39 (0.30) | 0.20 (0.10) |
| Wages +10%: key-rate peak, pp (range 1–1.5) | 1.26 | 1.47 | 1.22 | 1.06 |
| Wages +10%: price level after 6 years, % (range 3–5) | 3.42 | 3.10 | 3.30 | 3.41 |
| Health +3: inflation, months 180–240, pp | 0.60 | 0.31 | 0.22 | 0.17 |
| Education +3: inflation, months 180–240, pp | 0.78 | 0.39 | 0.28 | 0.21 |
| Tourism −15: inflation, months 180–240, pp | 0.007 | 0.015 | 0.009 | 0.005 |
| Tourism −60: output at month 240, % | −1.06 | −2.12 | −1.08 | −1.07 |
| Tourism −60: months with the key rate at zero | 234 | 200 | 226 | 229 |

The CBI raised its rate early and firmly after the 2022–24 wage round, and DYNIMO puts the peak at +1 to +1.5 points in quarters 2–4 after a 10% settlement. The stronger settings remove most of the rule's response in the first year, because after a settlement jobs fall before output (item 14) and the rule now reads slack from jobs. Only 0.8 keeps at least half the lower end of that peak at month 12, and it roughly halves the long-run residuals of public spending.

**A tripwire on the first-year response.** A new calibration check, `wage-key-rate-month12`, asks the key rate to be 0.5–1.5 points higher at month 12 after a 10% settlement, the half-step test asks the same of its limit: 0.678 now, about 0.59 in the limit, where 1.6 would give 0.10 and fail.

**The tourism −15 expectation tests that the cycle dies out (owner's decision 10).** It said "inflation over months 180–240 does not move", which catches the upswing of the slow cycle of the rule's learning: the gap is about −0.08 pp at month 60, crosses zero near month 180 and is +0.02 by month 240 at every strength tested. Its mean over those months is +0.015 now, above the report's 0.01 floor. Lever expectations can now say that an effect dies out (`LeverExpectation.decays`): the largest move over months 180–240 must be under 0.05 pp and under half the largest over months 36–96. It is 0.028 against 0.103 (0.018 against 0.074 with the fixed capacity). The reason is recorded beside it in `expectations.ts`.

**The implied neutral rate, a diagnostic.** For every run with every rule acting whose neutral-rate estimate ends at the edge of its band, the lever report finds the constant key rate that would have left inflation on target over the final five years. It holds the key-rate lever on top of the run's own lever, scans the lever's range (0–15%) every half point, and bisects to 0.01 points inside the bracket where inflation crosses target nearest the rule's estimate. Less the target, it is the neutral real rate the economy needs; beside the band (0–6%), it shows how much of the gap left after 20 years is the band's. Two things are part of the answer. The debt rule keeps acting against the held rate: held at the implied rate, income tax ends 13.8 points up after health +3 (11.7 with the key-rate rule acting), 14.8 after education +3 (12.0), 12.4 after other public services +3 (11.2) and 8.1 after pension funds' foreign share +20 (1.8), so the rate needed includes that fiscal tightening. And inflation need not fall as the held rate rises, because a higher rate also pays savers and bondholders more interest, which they spend; the report says which way inflation moves with the rate at the crossing, and how many crossings there are. The rises in public spending give the textbook answer, one crossing where inflation falls with the rate: health +3 needs 8.2%, education +3 8.7%, other public services +3 7.3% and pension funds' foreign share +20 9.1%. Tourism −60 reaches target at a constant 2.8%, inside the band: held at 0–1% inflation ends about 0.44 points below target, and between 1% and 3% it rises with the rate (three crossings in all). The cuts of public spending have no textbook answer: inflation is below target at 0% and falls as the rate rises to about 5%; health −3 and education −3 reach target only at about 9%, where inflation rises with the rate, and other public services −3 not at all. The income-tax runs hold income tax with their own lever, so nothing anchors them: a cut leaves inflation above target at every rate, and a rise reaches it only where inflation rises with the rate (6.7% for +2.5, 11.8% for +10). An earlier version compared only the two ends of the range and reported no rate for tourism −60 and the tax rises; the scan replaced it. It is not in the harness gate.

**No make-up at the zero bound (owner's decision 8).** The rule has no memory of the stimulus the floor withholds beyond its neutral-rate estimate, which winds down to its limit, and the CBI follows no make-up commitment. The model's floor is also closer than Iceland's: with a 0% target and a 3% neutral real rate there are 3 points between the neutral rate and zero, where Iceland has about 4.5–5 (a 2.5% target and a neutral real rate of 2¼–2.7%; the CBI's low was 0.75% in 2020–21). So the months at zero below are partly an artefact of the zero-inflation baseline. Make-up is decided, re-specified, only after the start-from-today baseline gives the floor Iceland's room (item 19).

## Public spending now costs more output and debt while unlocked (owner's decision 5)

The rule now reads the labour scarcity that public services bring, holds the key rate higher, and the higher interest bill slows the debt rule. After 20 years at +3% of GDP with the policy rules acting:

| | Output, % | Key rate, points | Government debt, points of GDP |
|---|---:|---:|---:|
| Health | −1.24 → −2.43 | +2.48 → +3.91 | +37.9 → +48.6 |
| Education | −1.49 → −3.03 | +2.44 → +4.13 | +36.0 → +49.7 |
| Other public services | −0.86 → −1.58 | +2.59 → +3.61 | +40.4 → +46.8 |
| Public investment | −0.24 → −0.49 | +2.48 → +3.05 | +40.4 → +41.9 |

That is right given the labour scarcity, but the crowding-out runs through interest rates alone: a small open economy would share it through a stronger real króna, which the model does not yet have (króna stage 2). The four spending levers' definitions say so. Inflation over months 180–240 is +0.31 pp after health +3 and +0.39 after education +3 (was +0.60 and +0.78); what remains belongs to the missing real-exchange-rate channel and to labour supply that does not follow lasting tightness, not to potential output. Tripwires in `tests/models/iceland-real-economy.test.ts` hold them below +0.45 pp and fish +30 within ±0.1 (now −0.09), as known gaps, until the króna work closes the channel.

## What moved

**Locked paths are unchanged.** With both policy levers locked the gap only feeds the suggestion: a module test checks that a different `aY` and `okunGap` change no path but the stabilisers' shadows and suggestions, every locked golden is identical but for the new chart, and the version-1 fixture's two Manual scenarios give their stored values bit for bit. Its four Automatic scenarios were recomputed on the engine before padlocks at two steps a month with the same gap, so the fixture keeps meaning "a migrated scenario gives what the old engine gives". **With only the key rate locked, paths do move,** through the debt rule's escape clause, which reads where the rule is heading (`zeroBoundWeight`, decision 0009) whether the key rate is locked or not. The key rate held at 6% with income tax unlocked now leaves output 1.2% lower after 20 years, not 0.8%, with income tax 3.2 points higher, not 3.6, because the rule's target no longer dives below zero on falling output, so the escape clause lets the debt rule raise taxes sooner. Whether the clause should read the held rate instead is the deferred design question of the third setting (R4).

**Calibration** (fixed capacity → labour-market gap, two steps a month): all 32 checks are in range, the new one included.

| Check | Before | After | Limit |
|---|---:|---:|---:|
| wage-key-rate-peak (1–1.5) | 1.262 | 1.474 | 1.465 |
| wage-price-level-6y (3–5) | 3.415 | 3.102 | 3.043 |
| wage-key-rate-month12 (0.5–1.5, new) | (0.904) | 0.678 | 0.588 |
| wage-back-consumption | −0.203 | −0.006 | −0.006 |
| wage-back-output | 0.093 | 0.150 | 0.148 |
| wage-back-unemployment | 0.057 | 0.092 | 0.086 |
| wage-inflation-peak | 2.672 | 2.714 | 2.689 |
| fiscal-output-year1 (0.3–0.6) | 0.537 | 0.576 | 0.578 |
| fiscal-money-banks-vs-funds | 0.999 | 0.961 | 0.946 |
| tourism-slump (−10 to −2) | −5.193 | −4.275 | −4.316 |
| world-prices-krona-year1 (0–5) | 1.384 | 0.611 | 0.506 |
| world-prices-cpi-year1 (1.5–2.3) | 1.849 | 1.951 | 1.932 |
| foreign-rate-krona-2y | −1.148 | −1.218 | −1.232 |
| rate-output-trough | −0.522 | −0.531 | −0.535 |

The others move by less than 0.015; the locked checks and the timing checks do not move. The edges to watch are wage-key-rate-peak (1.474 against a top of 1.5), wage-price-level-6y (3.10, limit 3.04, against a bottom of 3), fiscal-output-year1 (0.576 against 0.6) and wage-unemployment-peak (0.974, limit 0.995, against 1): any later retune can push one out, which is why phase 5 is one joint refit. The worst half-step share is 0.45 (the new check). In the full run wage-key-rate-peak now converges at an order of about 1.5 and is gated; wage-inflation-peak (its peak moves from month 13 to 14 between two and four steps) and tourism-slump (the error falls faster than first order) are declared indicative, with the reasons and the numbers at 2, 4, 8 and 16 steps in `calibration.ts`.

**Tripwires restated, each with its reason next to it.** The rule reads slack from unemployment, which moves after output, so it leans less and later on booms and slumps that start in output:
- króna pass-through when the króna is held 10% weaker: 0.31, 0.36 and 0.38 after two, three and four years (was 0.30, 0.33 and 0.34); the bound at three years is the IMF's 0.4 that the source names (was 0.35), and levelling off is tested a year later;
- broad money after the foreign rate +5 falls back four months later: 0.76 of its peak at month 240 (was 0.73; bound 0.75 → 0.8);
- the wage gap after world prices +10 is 0.0007 at month 240 (was 0.0004; bound 0.0005 → 0.001), the tail of the learning cycle;
- tourism −60: the key rate reaches zero in month 41, not 7, and until then the debt rule raises income tax 1.2 points, so output is 2.1% lower after 20 years (was 1.06%; bound −2 → −2.5, and a new bound on the tax rise); the escape clause itself still holds exactly;
- FX-4, lever-vetting item 4: after a credit boom (lending appetite +3) or a tax cut (−2.5) the key rate rises later (0.04 points by month 6 after the tax cut, was 0.10), and the real króna is up to 0.03% weaker by month 18, where it was never weaker than 1e-6. The test now checks the mechanism it names, that the krónur the carry trade buys never weaken the króna (the real króna is no weaker than in the same boom with the key rate held, to 1e-6), and bounds the regression as a known gap at 0.05%. The item-4 fix of króna stage 1 must bring it back under 1e-6; the proposal measured the same regression from the labour gap alone (+0.09% in the real rate over months 12–36 after lending +3, now +0.07%). (Decision 0013 found that stage 1's flow term adds to it, to 0.053% after lending +3 and 0.103% after the tax cut, and that no principled change inside stage 1 brings item 4 to its criterion: that needs this rule to see a credit boom in time, item 14, and probably a second way to finance a boom's deficit. The 5e-4 bound is kept, unloosened, in a release test expected to fail until then.)

**The lever report** (339 Iceland runs, none broken, 210/210 expectations): lock sign 54 → 32, explosive 26 → 28, extreme 43 → 44, asymmetry 1 → 0, unsettled 277 → 276. The lock-sign flags that went are the rule's old misreadings of shocks that move output and jobs differently (tourism, foreign demand, the króna, transfers, wage settlements); eight new ones on VAT ±2.5 and ±10 (investment) and benefits ±10 and ±30 (the króna, investment) are small (0.02–0.57) and fade: unlocked, the rule now reads what these levers do to unemployment. New flags, each explained in the lever-vetting record: explosive for the smelters' real profits after health or education +0.8 unlocked (−5.7% and −9.9% at month 240, still falling, as the higher key rate keeps the real króna strong), and for the income-tax rate after tourism −60 with the key rate locked (the escape clause above); extreme for exporters' real profits after world prices +40 unlocked (+55% at month 15, which the locked run already showed). The implied-neutral-rate diagnostic adds about 10 s to `bun run levers`.

## Alternatives considered

The proposal (section B) measured them:

- **Make-up at the zero bound** (prototype B): identical on the lever report, built up 8–12 months before the floor bound and was unbounded (owner's decision 8: not now).
- **Capital-based capacity for the markup** (prototype C): stable and small, but compares total GDP with business capital only.
- **A production-function gap**: the wrong sign in this many-sector model (health +3 read as slack).
- **Filtered or learned potential**: declares every lasting gap a change in potential, false hysteresis (Coibion, Gorodnichenko and Ulate 2018; Orphanides and van Norden 2002).
- **Freezing the neutral-rate learning at zero**: tourism −60 output −3% at month 240 and taxes up.
- **An unemployment-gap term beside the output gap**: raises the total weight on slack, and broke wage-back-consumption in decision 0009.
- **A ±5-point learning band**: would need a 7.7% real neutral rate for health +3.
- **A stronger response (aY 1, 1.6 per point)**: brought one expectation under its floor, but removed most of the first-year response to a wage settlement.

## Future work

The joint refit of the wage checks (phase 5): item 14's factor substitution, the slack strength, the consumption habit and the wage–price feedback together, against every wage check and the month-12 tripwire. The króna stages (phase 3 and 8): the item-4 fix, and a real-exchange-rate channel that shares the adjustment to lasting public spending. The zero bound (item 19): the floor's room first, then make-up if still wanted, with the escape clause keyed to the shadow rate. A capital-based accelerator with a consistent utilisation measure.
