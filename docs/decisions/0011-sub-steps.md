# 0011. Two kernel steps a month, a display contract that does not depend on them, and a half-step test that asks for the converged answer

Status: accepted (September 2026). Phase 1 of the [long-run anchors proposal](../design/long-run-anchors.md) (section A), with the owner's decisions 4 and 6: two sub-steps a month, the run-time budgets, and the half-step test judged on the range width with a Richardson limit that must lie in range. It closes open item 12 of the lever-vetting record and unblocks item 14.

## The problem

The model is written as a continuous-time economy observed monthly: speeds are per year, partial adjustment closes 1 − e^(−λ·dt) of a gap each step, flows are annual rates multiplied by dt, and behavioural information lags are a month (`lastMonth`). The kernel integrated it one month at a time with a first-order scheme: stocks were posted from flows computed on start-of-month stocks. So every monthly result differed from the continuous-time answer by an error that halves when the step halves. For the measure that bound, wage-back-consumption, the monthly error was 13.5% of the check's range, and krona-pass-through-year1's 13.9%.

The half-step test hid this and blocked sound fixes at the same time. It allowed a change of 10% of the larger of the value and half the range width, so a ratio that improved toward 0 (a real variable settling after a wage settlement) was judged ever more strictly. The consumption habit was slowed from 0.9 to 0.6 partly to stay inside it (decision 0009), and the slow factor-substitution stage for jobs (open item 14) failed it.

## The decisions

**The kernel takes each month in N sub-steps (`ModelDef.substeps`; the Iceland model has 2).** Lever events, history, snapshots, the feed and every month-indexed API stay monthly: `engine.t` counts months, `seek`, `fork`, scenarios and charts are unchanged. Between two months the machine advances N times by dt ÷ N, and every sub-step is a complete, balanced step: it evaluates the schedule, posts every leg, and runs the four accounting checks and the position-sign diagnostic. The month records the worst residual of its sub-steps, so the monthly Godley table is a sum of balanced sub-step tables and the accounting is exact at every sub-step, not only at the month's end. Rules see dt ÷ N in `c.dt`; `c.lag(id)` is the last sub-step and `lastMonth` (a lag of N sub-steps) a month. Levers and one-off shocks apply at the first sub-step of their month. The scheme stays first order: the error is halved, not removed (below).

**The display contract: what a month shows does not depend on N.**

| Shown | At N sub-steps |
|---|---|
| Variables, stocks, balance sheets, charts | the month's end (the last sub-step) |
| Legs, pipes, the ledger, a flow's influence, flow-level weights in ideas at play | the month's total ÷ dt: the mean of the sub-steps' amounts, its average annual rate (`LegSnapshot.value`, which now names its `amount` variable) |
| A term that is a change per step (`TermDef.month: 'sum'`) | its sum over the sub-steps, with its baseline × N |
| A term that carries a level into the step (`TermDef.month: 'first'`) | its value at the month's first sub-step, so 'first' + 'sum' terms add up to the month-end value |
| Any other term | the last sub-step's value (a level or a rate per year, which does not scale with the step) |
| A regime | binding for the month if it binds in any sub-step: the last label named in the month (`regimesAt`); a label that changed between sub-steps is flagged (`regimeSwitchesAt`, `Influence.regimeSwitched`, and "part of the month" in the inspector). There is no majority rule, which would be a tie at N = 2 |

The Iceland terms that are changes per step are summed: the wage rule's growth and settlement, the neutral rate's two revisions, the key-rate rule's and the debt rule's steps toward their targets, the bond coupon's repricing and the króna sentiment's fading and shock. Each rule's carried-in level is 'first'. The key-rate rule (`ruleRate`) and the debt rule (`taxRuleAdjustment`) were rewritten as the level in force plus a step: while the rule's lever is unlocked the step is taken at every sub-step and summed, so unlocking moves the rate by one month's smoothed step compounded over the sub-steps (the MON-2 tests check each sub-step); while it is locked the value shown is where the rule would stand after its first month in charge, a whole month's share at once (`ruleStep`, which reads the rule's own padlock, decision 0010), so the suggestion's shadow no longer halves with N. At one step a month both are exactly the rules they were.

**The lags.** Every plain `c.lag(id)` in the Iceland model was read against its meaning. A state's own previous value (the wage, the neutral rate, sentiment, the newcomers, the rule anchors), an accounting change over the step (indexation and revaluations: the price change over the step ÷ the step) and the consumption habit's cash cap stay one sub-step, since that is what they are. Behavioural information lags were already `lastMonth`; the one that was not, the escape clause's reading of the rule's target (`zeroBoundWeight`), is now `lastMonth`, as policy reads last month's news. The house price's lag of the CPI, which only breaks a same-step loop, stays a sub-step and says so.

**The explanations.** The 134 time-step phrases in the Iceland module files were audited. With the display contract most stay true ("last month's wage rate", "growth this month", "a month's worth"). Those that described a one-step lag as "last month", or said "one step" where they meant a month, were reworded (the key-rate and debt rules, the neutral-rate estimate, the house price, inflation, trailing GDP, the bond coupon). Texts that describe the step name it plainly: "the model takes each month in two steps".

**Two fixed-point rules became first-order lags.** Firms' borrowing to restore their deposit target and the government's bond sales to refill the treasury account closed the whole gap in one step (a speed of 12 a year × a month). At N = 2 that is half the gap per step, so the answer depended on N, and firms' deposits hovered on their target, where the dividend rule's spare-cash branch switched on and off (17 of the 18 new flicker flags in the proposal's package). Both now close the gap at their speed as a first-order lag (`gapRate`: 63% within a month, 95% within a quarter) whatever the step. That removed all but four of the flicker flags: fisheries' dividends still switched in the króna −25% (both configurations), foreign rate −3 and VAT +10 runs, because deposits that follow their target as a lag sit a hair above it. The dividend rule therefore names "Pays out spare cash" only once deposits are more than 1% above their usual level (a display threshold, assumed), which removed the last four. The payout is paid whatever the label; the threshold leaves unnamed payouts of up to about 0.002% of GDP a year (month 4 after the króna −25%, about 4% of fisheries' usual dividend). The lever report has no flicker flag.

**The half-step test (harness layer 6c).** Each calibration scenario is rerun at 2N sub-steps a month. A measure with a bounded range may move by 10% of the range's width, whatever its value; a half-open one by 10% of its value; a timing measure by one quarter. The Richardson estimate of the answer as the step goes to zero, v(h/2) + (v(h/2) − v(h)), must lie inside the range, with 1% of its width as slack. `bun run harness --full` (before a merge, and nightly) also runs 4N sub-steps, measures each measure's order of convergence p = log2(|v(h) − v(h/2)| ÷ |v(h/2) − v(h/4)|), and gates on the limit at that order, v(h/2) + (v(h/2) − v(h)) ÷ (2^p − 1), where p is in 0.5–2. Outside that band the limit is only indicative and is not gated; the check must say so (`CalibrationCheck.limitIndicative`, with the reason), so the everyday run, which takes p = 1, knows. Two checks do: wage-key-rate-peak, whose peak converges non-monotonically (1.2622 at 2 and 4 sub-steps, 1.2619 at 8) and moves by less than 0.001, and unlocked-no-shock-drift, which is rounding error. (Since [decision 0012](0012-labour-market-gap.md), wage-key-rate-peak converges at an order of about 1.5 and is gated, while wage-inflation-peak and tourism-slump are declared indicative, each with its reason.) The 4N run adds about a tenth to the harness's time; it stays out of the everyday run, and CI runs it.

**The wage-back measures are signed**, with the range ±0.25: an overshoot past baseline is as unsettled as the same share still to go, and abs() folds a ratio that crosses zero back on itself, which breaks both the step comparison and the Richardson estimate. wage-back-consumption was −0.19 at one step a month all along; abs() had reported 0.19.

**The budgets (owner's decision 4).** Gated in `tests/models/iceland.test.ts`: at most 250 × N µs a shocked month; a 240-month fork (every what-if in the interface) under 100 ms; a seek back under 20 ms. The fourth, the everyday harness at most twice main's time, is measured and recorded here, not gated. The rule context now reads its declared inputs, lags and parameters from plain lookup tables instead of `Map`s, and a stock read no longer builds a string; that cut the cost of a kernel step by about a quarter, so two sub-steps a month cost 1.2–1.4 times what one month did before rather than twice.

| Measured side by side (shared machine, load 10–17) | Main (one step a month) | Two sub-steps | Budget |
|---|---:|---:|---:|
| A shocked month | 140–170 µs | 155–200 µs | 500 µs |
| A 240-month fork | 31–33 ms | 36–49 ms | 100 ms |
| The slowest seek back | – | 2–3 ms | 20 ms |
| `bun run harness` | 14.6 s | 17–21 s | 29 s |
| `bun run harness --full` | – | about a tenth more than `bun run harness` | – |

**Remeasured after phases 2–4 and decision 0015** (30 September 2026, back to back on one machine, three runs each): `bun run harness` takes 9.3–10.0 s on main and 19.0–20.1 s on this model, about 2.0×, at the budget (the final verification measured 10.4–10.9 against 19.7–20.5 s, 1.9×). The table's 14.6 s for main was measured under heavier load and understated the ratio. The phases after the sub-steps used the headroom: the harness now makes 585 runs, against main's 507 (the lever expectations of phases 2–4 and more calibration checks). The budget is still recorded, not gated, so the next phase (the joint refit) must not add harness runs without buying time back (lever-vetting open item 23).

## What moved

The accounting is exact at every sub-step (largest residual 2.3e-11 over 510 runs), baseline drift is 3.4e-12 (7.6e-12 before), and every calibration check is in range. Moving from one step a month to two moves each measure about half-way to its continuous-time limit (main, which took one step a month; this decision, at two; and the limit the everyday run estimates):

| Check | Main | Now | Limit |
|---|---:|---:|---:|
| wage-price-level-6y | 3.493 | 3.415 | 3.34 |
| locked-wage-inflation-peak | 2.800 | 2.763 | 2.74 |
| wage-back-consumption (now signed) | −0.186 | −0.203 | −0.22 |
| wage-unemployment-peak | 0.960 | 0.978 | 1.00 |
| wage-inflation-peak | 2.697 | 2.672 | 2.64 |
| krona-pass-through-year1 | 0.195 | 0.190 | 0.18 |
| world-prices-krona-year1 | 1.468 | 1.384 | 1.28 |
| tourism-slump | −5.097 | −5.193 | −5.27 |
| fiscal-money-banks-vs-funds | 1.016 | 0.999 | 0.98 |
| rate-inflation-trough | −0.237 | −0.230 | −0.22 |
| wage-back-output | 0.100 | 0.093 | 0.09 |
| rate-output-trough | −0.518 | −0.522 | −0.53 |

The others move by less than 0.02. The worst half-step share is 0.38 (krona-pass-through-year1, whose range is only 0.08 wide), against 0.92 under the old rule, and no limit falls outside its range. The full run finds orders of 0.68–1.72 for the gated measures (rate-output-trough the lowest, as the proposal found). Timing checks do not move.

**Record, don't tune.** The converged model sits further from the CBI's evidence on a wage settlement: the CPI is about 3.4% higher after six years (3.3% in the limit), not "about 4%", and wages give back 2.01 points in the first year (1.97 at one step a month, about 2.05 in the limit), so the LAB-2 tripwire is restated at 2.1 with that reason. This is the known gap that wages give back too much in the first year, now exposed rather than hidden by the step. It is an input to the joint refit of the wage checks (phase 5), not a regression to be tuned away; the calibration sources, `KNOWN_GAPS` and the `wageSettlement` lever say so. wage-unemployment-peak's limit, 1.00, is at the top of its range: the thinnest margin.

The goldens and the lever reports move by about half the monthly error. The largest move is the króna at month 240 under income tax +10 with both policy levers locked, 196% → 190%. The lever report's flags, measured before the padlocks landed (two configurations, Manual and Automatic): flicker 0 → 0 (the 17 the proposal's package added do not appear), explosive 18 → 19 (new: investment +2.7% at month 240 after pfForeign −20 with the rules acting, the slow neutral-rate learning of a small gap, as the proposal found), mode sign 54 → 50 (four fade below the report's floor), and no broken run; every lever expectation holds.

**With the padlocks (decision 0010).** Both landed together. The padlock contract and this one meet in the policy rules and the history: the engine records each month's lock configuration beside its terms, legs and regimes, and `ruleStep` reads the rule's own padlock. Locked still equals the old Manual and unlocked the old Automatic, bit for bit, at two steps a month: every golden of the engine before padlocks at two steps, migrated, gives its stored paths exactly (except the three whose offsets were dropped), all 214 comparable Iceland lever runs are identical, and the version-1 fixture's Iceland values are those of that engine. Against the padlocks' own report at one step a month (three lock configurations), two steps a month move these flags: explosive 24 → 26 (investment after pfForeign −20 unlocked, above, and the income-tax rate after pfForeign −20 with the key rate locked, where the debt rule is still raising it 0.05 points a year at month 240), extreme 44 → 43 (broad money after health +3 with the key rate locked, 50.0% at month 240 before, now just under the threshold), lock sign 58 → 54 (the same four as above), and unsettled: wage settlement +20 locked in, +10 with the key rate locked out. No run is broken, and every expectation holds (210 for Iceland Inc., 52 for the reference economy).

## What stays true

- **A locked lever stays where it is set** (the old Manual principle). Levers, padlocks and shocks apply at the first sub-step of their month, and no rule moves a locked policy setting. locked-tax-key-rate-held is 0 at N = 1, 2 and 4.
- **Item 6 is economics, not numerics.** A 12-month hold at 4% that returns to 3%, both policy levers locked, troughs in month 12 at N = 1, 2, 4 and 8 (a test). QMM's later trough comes from inertia in growth rates (Fuhrer 2000; Christiano, Eichenbaum and Evans 2005); a growth-habit stage is the fix, and it stays open.
- **Determinism.** The same scenario gives the same numbers at a given N, seek and fork included; one step a month (`substeps` 1 or absent) reproduces the old kernel bit for bit.

## Alternatives considered

The proposal (section A) measured them: Heun's method around the step (still first order, twice the cost, flips the lending impulse's sign), a first-order hold on `adjust` rules (breaks rate-krona, the global order stays 1), implicit schemes (numerical damping or ringing, Newton over the whole state at 5–20 times the cost), and showing Richardson-extrapolated paths (they satisfy no rule, floor or regime; the estimate is for the harness only). Four sub-steps a month would halve the error again but break the fork budget unless the engine moves off the main thread.

## Future work

The scheme is first order. True second order needs rules that declare rates of change and a kernel that separates state from algebraic variables. Floors written as −stock ÷ dt (a holder cannot sell more than it has) are constraints, not behaviour, and stay; a floor that stands for behaviour should be a `gapRate` or `liquidRate`. Open item 14 (jobs react to wages before output) can now be tried against the converged model, in the joint refit.
