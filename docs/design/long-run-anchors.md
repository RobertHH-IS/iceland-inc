# Long-run anchors: fixing the 10- to 20-year behaviour of Iceland Inc.

Status: **approved** (revision 2 of 29 September 2026), with the owner's decisions below. Phases 1 to 4 are implemented; phase 3 is incomplete (its release blocker, item 4, is open). The text after this header is the proposal as approved; only its references to prototype branches, commits and working copies that are not public were replaced by plain descriptions ("the package", "variant 3").

**The owner's decisions.**

- **Padlocks replace the global switch and the third setting.** Instead of one Manual / Automatic setting, each policy lever with a rule has its own padlock ([decision 0010](../decisions/0010-policy-padlocks.md)). "Manual" in this proposal now reads *every policy lever with a rule locked* (the key rate and income tax both held), and "Automatic" *every one unlocked*, the default. Decision 3 (a design spike, then a release decision, for a third setting, "key rate held, fiscal rule on") is superseded: locking only the key rate is that configuration, and the lever report runs it as `key rate locked`. The proposal's changes to model rule 11 and architecture §3 for a three-mode harness are therefore not needed; the escape clause's reading of the shadow rule (R4) and the missing counter-cyclical term stay open questions (decisions 0012 and 0014).
- **Decisions 1, 2 and 4–13 are taken as recommended** (the table at the end).

**The phases, as done.** The decision records are numbered in the order they landed, so they differ from the numbers this proposal planned:

| Phase | Planned record | Record | State |
|---|---|---|---|
| 1. Time-stepping | 0010 | [0011](../decisions/0011-sub-steps.md) | Done: two sub-steps a month, the display contract, the half-step test on the converged answer |
| 2. Potential output | 0011 | [0012](../decisions/0012-labour-market-gap.md) | Done: the labour-market gap at 0.8, the month-12 wage tripwire, the tourism −15 re-specification, the implied-neutral-rate diagnostic |
| 3. Króna stage 1 | 0012 | [0013](../decisions/0013-krona-stage-1.md) | Implemented, **not releasable**: its release blocker, the item-4 fix, is not delivered (+0.135% against ≤ 0); it waits for phase 5 or an owner decision |
| 4. Documentation of the locked economy | 0013 (a) | [0014](../decisions/0014-locked-economy.md), part (a) | Done: the decision record, the student texts, the sign expectations and tripwires, and the interface note (shown while every lever with a rule is locked) |
| 5. Joint refit | amend 0009 and 0011 | | Next |
| 6. The norm test for the real economy | 0013 (b) | 0014, part (b) | Next |
| 7. Third setting | amend 0004 | | Superseded by the padlocks (above) |
| 8. Króna stage 2 | 0014 | | Later |
| 9. The rest | own records | | Later |

What each phase left open is in its record and in the [lever-vetting record](../audit/lever-vetting.md)'s open items.

---

The proposal draws on four pieces of work, each researched, prototyped and critiqued separately:

- the nominal anchor on Manual (the anchor prototypes);
- potential output (the potential prototypes);
- the króna (the króna prototypes);
- time-stepping (the numerics prototypes).

It also draws on combined runs built for this proposal (the combined variants and the package), which put the recommended fixes together and ran the full harness, the lever report and the unit tests on them.

Revision 2 answers two reviews. Its main changes:

- **Manual.** Issue D now separates two claims. The price level has no anchor on Manual, by construction. The real economy not settling is an open property of the model, not a theorem. A new sector-by-sector breakdown (R2) shows where the government's lasting surplus goes.
- **The strength of the rule's response to slack.** It is now set from the Central Bank of Iceland's own rule and its wage-shock evidence, not from a single expectation. The value that lands first is lower (aY × okunGap = 0.8, not 1.6), so the bank still reacts in the first year to a wage settlement.
- **Item 14 is measured in the combined model.** The factor-substitution fix does not simply land there: every setting tried pushes one wage check out of range. It needs a joint refit, planned as a phase of its own.
- **The króna.** The item-4 regression on Automatic is recorded as a regression and traced to its cause. The portfolio bound is gated before the bound, not after it. The flow parameter is set from króna evidence. Persistence gets a real-half-life test.
- **New sections:** a flag-by-flag comparison of the lever report, the unit-test failures by class, a display contract for sub-steps, measured run-time budgets and effort estimates.

It covers these open items of the [lever-vetting record](../audit/lever-vetting.md): 1–6, 10, 12, 14, 16–20 and TAX-2.

## Summary

The four problems are related, but they are not the same problem. Nor do they have the same kind of answer.

| # | Problem | Recommendation | Effect on Manual | When |
|---|---|---|---|---|
| A | **Time-stepping.** The engine's monthly step causes a first-order error. That error blocks two fixes that are already written (items 12, 14). | Run each month as N sub-steps (N = 2), with the accounting checked at every sub-step. Re-specify the half-step test so it asks whether the answer as the step goes to zero lies in the evidence range. Fix what the displays show under sub-steps. | None | First |
| B | **Potential output.** The central bank's rule measures slack against a fixed number, so some lasting shocks on Automatic never close (items 2, 14, 19). | The rule reads its gap from the labour market: an Okun-scaled gap between normal and actual unemployment, using the labour force the economy has. Land it at the strength the CBI's own rule implies (0.8 key-rate points per point of unemployment). Raise it only in a joint refit with item 14. | The paths do not change; only the rule's suggestion does | Second |
| C | **The króna.** It has no slow pull back to parity, a one-off shock fades too completely, and a tourism collapse raises inflation too little (items 4, 5, 17, 18, 1). | Stage 1: the portfolio term also prices the recent flow of krónur, and the reserve target is set in foreign currency. Before release, fix the item-4 regression it causes on Automatic. Stage 2: a re-specified design for the long-run real exchange rate and a home for net foreign assets (item 17). Stage 3: foreign-currency debt, as a data project (item 1). | None. Stage 1 removes an automatic reserve sale that acted on Manual. | Stage 1 third; stages 2 and 3 later |
| D | **Manual drift.** With policy held, a lasting fiscal change keeps drifting, and a high key rate held for years reverses its effect (items 3, 10, 16, 20, TAX-2). | Keep Manual exactly as it is. Accept, and document, that the **price level** has no anchor under a held key rate with fixed tax rates: that is by construction. Treat the fact that the **real economy** does not settle as an open model property, and find the missing stock-flow norm before writing it into a decision record. Correct the student texts. Gate only signs. Offer a third, opt-in setting only after a design spike. | None. The third setting would be a new mode; Manual stays the default and stays pure. | Documentation fourth; the norm search and the third setting after it |

The package to land first (A, B at the CBI-anchored strength, and stage 1 of C) was run together. Measured against today's model (*main*):

- **Gates.** All 31 calibration checks are in range. The worst half-step share is 0.40, and no check's estimated limit falls outside its range. 204 of 206 lever expectations hold; the two that fail are re-specified below, with reasons. The lever report has no broken run.
- **Long-run gaps on Automatic shrink by about half.** After health +3, inflation over months 180–240 falls from +0.62 to +0.30 points.
- **Wage settlements.** The bank still raises its rate in the first year after a 10% settlement: +0.67 points at month 12, against +0.94 on main.
- **The króna.** A 60% fall in tourism now weakens it by 11.6% within a year on Automatic, against 9.8%. Inflation rises over months 3–18 in both modes.
- **Manual.** The income-tax +10 spiral nearly stops accelerating: the inflation gap grows by 0.26 points between months 180 and 240, against 1.33 on main.
- **Manual drift.** After a lasting income-tax rise of 2.5 points, prices are 15.3% lower after 20 years, against 15.8%. That is expected; it is the point of issue D.

What the package does **not** fix, stated plainly:

- The real króna still returns with a half-life of about 15 months (Manual) and 12 months (Automatic), against QMM's 24–40. That is a known gap until stage 2.
- A credit boom on Automatic now weakens the real króna slightly, where it should strengthen it (item 4). This is a regression, and it must be fixed before stage 1 is released.
- The key rate still reacts to a wage settlement later than the CBI did, because jobs fall before output (item 14).
- The converged model gives a 10% wage rise about 3.1% on the CPI by year 6, at the bottom of its 3–5 range (the CBI's figure is about 4). That is the known gap that wages give back too much in the first year, now exposed rather than hidden by the step.

## How to read the numbers

- Every effect is measured against the no-change run in the same stabiliser mode (model rule 9).
- **Output** is % of baseline.
- **Inflation** is 12-month inflation, in percentage points.
- **Unemployment** is in points.
- **Price level** is the CPI, as a % difference.
- **Króna.** *e* is the price of foreign currency in krónur, as a % difference, so + means a weaker króna. *q* is the real exchange rate, *e* × world prices ÷ domestic prices, as a % difference, so + means Iceland is cheaper.
- **Main** is today's model: commit `075bb43`, the base of every branch here.
- **Package** is the recommended combination, built on main for this proposal. It contains:
  - the sub-stepping kernel with two sub-steps a month and the new half-step test (numerics prototype C);
  - the labour-market policy gap (potential prototype A), with `aY` 0.5 and `okunGap` 1.6;
  - the flow-priced portfolio term (króna prototype A), with `pbFlow` 0.008;
  - the reserve target set in foreign currency (króna E2, in the `worldPriceAnchor` form).
- **Package at `aY` 1** is the first revision's package. It differs only in the strength of the rule's response to slack. It is quoted where it shows a trade-off.
- **Variants** of the combination:
  - variant 1: the three fixes as prototyped;
  - variant 2: with `pbFlow` 0.008;
  - variant 3: with the króna stage-2 candidate D5b added;
  - variant 4: with the third stabiliser setting (F) and its escape-clause fix (R4) added.
- **Item 14 in the package** (the factor-substitution probe with `lamFS` 0.35 and `epsM` 0.9) was run in throwaway copies of the package only.
- **Machine load.** The runs were made on a machine shared with other agents, with a load average of 14–26. Wall-clock times are therefore only indicative; ratios between runs made side by side are more reliable. Model results are deterministic and unaffected.

---

## A. Time-stepping (open items 12, 14 and 6)

### What is wrong

The model is written as a continuous-time economy observed monthly:

- speeds are per year;
- partial adjustment closes 1 − e^(−λ·dt) of a gap each step;
- flows are annual rates multiplied by dt;
- information lags are fixed at one month of time.

The engine integrates that economy one month at a time with a first-order scheme. Stocks are posted from flows computed on start-of-month stocks, and targets are held within the step. The monthly path therefore differs from the continuous-time answer by an error that halves when the step halves. For the measure that binds, `wage-back-consumption` (consumption in year 6 after a 10% wage settlement, divided by its peak response):

| Steps a month | 1 | 2 | 4 | 8 | Limit as the step → 0 |
|---|---:|---:|---:|---:|---:|
| wage-back-consumption | 0.1857 | 0.2027 | 0.2112 | 0.2154 | ≈ 0.220 |

The observed order of convergence is 1.02, a clean first-order error.

- **The size of the error.** The monthly error is −0.034, or 13.5% of the check's range. That is twice the 0.017 half-step change the harness reports, as first-order theory predicts.
- **Other checks.** Other monthly errors, as a share of each check's range, are of the same order:
  - krona-pass-through-year1: 13.9%;
  - wage-price-level-6y: 7.7%;
  - wage-unemployment-peak: 7.5%.
- **The test.** The half-step test is also mis-specified. It allows a change of 10% of max(|value|, half the range width). So the allowance shrinks as a ratio improves toward 0, which is exactly the direction the economics wants after a settlement. This is why it blocked two fixes:
  - **The faster consumption habit.** `lamC` was slowed from 0.9 to 0.6 partly to stay inside the limit (decision 0009).
  - **The slow factor-substitution stage for jobs (item 14).** It lands at a half-step share of 1.00–1.17.
- **Item 6 is not numerical.** A 12-month hold troughs in month 12 at 1, 2, 4 and 8 steps a month. The early trough is structural (below).

### What theory and evidence say

- **Which reading applies.** A model whose parameters are per unit of time, converted exactly to its period, has committed to the continuous-time reading (Aadland and Huang 2004, "consistent high-frequency calibration"). Keen's Minsky integrates Godley tables as differential equations in exactly this way. The monthly engine is then an integrator, and its distance from the dt → 0 limit is discretisation error that must shrink with the step (Hairer, Nørsett and Wanner, *Solving ODEs I*).
- **The contested alternative.** The Godley–Lavoie discrete-period reading treats the period as part of the economics (Godley and Lavoie 2007; Romanchuk 2024). It is legitimate, but it is inconsistent with per-year parameters and month-fixed delays.
- **Accounting.** Every Runge–Kutta scheme preserves every linear invariant exactly (Hairer, Lubich and Wanner, *Geometric Numerical Integration*, Thm IV.1.5). All four accounting identities are linear, so any such scheme keeps them exact.
- **Higher order.** Raising the order of one piece does not raise the order of the whole. Heun's method wrapped around a step that is not a forward-Euler map stays first order (Gottlieb, Shu and Tadmor 2001, on SSP schemes).
- **Richardson extrapolation.** The estimate 2·v(h/2) − v(h) removes the leading error when the order is known. It is an estimator, not a path to display, because it satisfies no behavioural rule, floor or regime.

### Options considered, with measured results

| Option | What it does | Measured result | Verdict |
|---|---|---|---|
| **A: kernel sub-steps** | N sub-steps per month. Events, history and display stay monthly. Accounting is checked at every sub-step. | Worst half-step share 0.92 → 0.42 (N=2) → 0.20 (N=4). All 31 checks in range at N=2 and N=4. Drift 3.5e-12. | Needed |
| **B: re-specify the test only** | Bounded measures are judged on 10% of the range width. A Richardson limit must lie in the range. The observed order is reported. | Harness passes. It reveals that the item-14 fix's continuous-time wage-back-consumption, about 0.255, lies outside [0, 0.25]: the monthly 0.21 was in range only because of the step. | Needed |
| **C: A + B** | Both. | Worst share 0.36; 0 limits out of range. | **Recommended** |
| D: Heun (SSP-RK2) around the step | Two stages, average of the legs | Calibration 24/31. Halves one-off shocks; flips the lending impulse's sign. Still first order, at twice the cost. | Rejected |
| First-order hold on `adjust` rules | Ramp-invariant adjustment | Share 0.49 on wage-back-consumption, but rate-krona fails (1.07) and the global order stays 1 | Rejected |
| Implicit schemes | Solve end-of-step states jointly | Numerical damping (backward Euler) or ringing (trapezoid); Newton over the whole state, 5–20× the cost | Rejected |
| Richardson on displayed paths | Show 2·v(h/2) − v(h) | Breaks floors, regimes and term explanations | Harness only |

**In the package (C at N=2, with the other fixes):**

- all 31 checks in range;
- worst half-step share 0.40 (krona-pass-through-year1, whose range is only 0.08 wide);
- 0 Richardson limits outside a range;
- one timing check moves by one quarter between N=2 and N=4 (rate-output-timing, quarter 5 against 6), which the timing rule allows.

### Recommendation

Adopt option C. It is the only option that makes the displayed answer converge and makes the gate ask the right question: whether the model's answer depends on the step, and whether the converged answer lies inside the Icelandic evidence. It keeps:

- exact stock-flow accounting at every sub-step (the monthly Godley table is a sum of balanced sub-step tables);
- determinism;
- the rule language, unchanged, because the model is already written generically in dt.

Land it with five conditions.

1. **Sign the wage-back measures.** Make `wage-back-*` signed, with range [−0.25, 0.25]. `abs()` breaks the step comparison and the Richardson estimate when the ratio crosses zero.
2. **Fix the dividend flicker.** Diagnose and remove the new "flicker" flags on firms' dividends ("Pays out spare cash") that sub-steps bring (17 of the 18 new flicker flags; see the flag comparison below). The likely cure is to write the one-step "instant" deposit-target rule in the exponential `gapRate` form with an explicit speed, so its regime does not depend on N.
3. **A display contract for sub-steps.** What each view shows must not depend on N. Measured after income tax −5 at month 24, three kinds of displayed value halve each time N doubles:

   | Displayed value (per sub-step today) | N=1 | N=2 | N=4 |
   |---|---:|---:|---:|
   | Wage rule, term "Growth this month" | 6.75e-4 | 3.33e-4 | 1.65e-4 |
   | Neutral-rate rule, inflation term (the "× one month" revision) | 1.29e-4 | 6.27e-5 | 3.10e-5 |
   | `ruleRate`, the step toward its target | 2.34e-3 | 1.17e-3 | 5.89e-4 |

   At N=2 the influence panels and the ideas-at-play weights would show half a month under labels that say "this month". The contract:
   - **Ledger flows** are month totals, shown as the month's average annual rate.
   - **Stocks and levels** are month-end values.
   - **Terms that are changes per step** are summed over the month's sub-steps, or reworded as annual rates. Either way, the displayed value must stay the same across N to within first-order error.
   - **Lags.** The package has about 30 `c.lag(x)` reads, which become "last sub-step". Each is either replaced by `lastMonth` (an information lag of one month, which is economics) or its explanation is reworded, because "last month" would no longer be true.
   - **Regimes.** A regime is recorded as binding for the month if it binds in any sub-step. If it switches within the month, it is flagged. There is no majority rule, which would be a tie at N=2.
   - **Texts.** Audit the explanations and concept pages for "this month", "last month" and "one month" wording that relies on dt. There are 134 such phrases in 12 module files.
4. **Record, don't tune.** The converged model sits further from the CBI's evidence on the wage settlement. This also moves the owner's own teaching example, "a 10% wage rise adds about 4% to the CPI" (research report, "Wages +10%"):

   | wage-price-level-6y (CPI at year 6 after +10% wages) | Value | Estimated limit |
   |---|---:|---:|
   | Main | 3.49 | – |
   | Sub-steps alone (N=2) | 3.42 | 3.34 |
   | Package (sub-steps, labour gap at 0.8, króna stage 1) | 3.11 | 3.04 |

   The range is 3 to 5, and the CBI's figure is about 4. LAB-2's give-back is 2.01 points against its tripwire of 2. The package's stronger early rate response (section B) lowers the year-6 price level further, to the bottom of the range. Decision record 0010, decision record 0011 and the `wageSettlement` lever text must say that the converged model gives about 3–3.4%, not "about 4%", and that this exposes the known gap that wages give back too much in the first year. It is not a regression to be tuned away; it is an input to the phase-5 joint refit.
5. **Harness runs, budgets and gating (below).**

### Harness runs and budgets

- **Which runs, and when.** The default harness runs N and 2N and gates on the 2N Richardson limit. The 4N run gives the observed order. It belongs in a full run (before a merge and nightly), not in every run: the prototype ran it always, which is why its harness took 57 s against 30 s on main under load.
- **Measures whose order is far from 1.** Some peak and trough measures converge at an order far from 1: rate-output-trough 0.68, wage-key-rate-peak 0.6–2.6. The rule for them:
  - **Order p between 0.5 and 2 (full run).** Gate on the observed-order estimate v(h/2) + (v(h/2) − v(h)) / (2^p − 1).
  - **Order outside that band.** Report the limit as indicative, and do not gate on it.
  - **Default run (no 4N run).** Gate on the order-1 estimate. A measure that the last full run flagged as indicative is reported, not gated.
- **Run time.** Measured side by side on one machine under load, per shocked month and for the operations the interface performs:

  | Step count | Per month | A 240-month run (history, fork replay) | Seek to a month |
  |---|---:|---:|---:|
  | N=1 | 137–151 µs | 33–36 ms | 7–8 ms |
  | N=2 | 265–332 µs | 61–80 ms | 14–16 ms |
  | N=4 | 521–558 µs | 123–134 ms | 27–29 ms |

  The interface advances a month every two seconds, so stepping is never the limit. The operations that can be felt are a fork replay (every what-if) and a seek. Both scale linearly with N. The engine runs on the main thread.
- **Proposed budgets for the owner to accept:**
  - the speed test allows 250 × N µs per shocked month (500 µs at N=2);
  - a 240-month fork replay takes under 100 ms at N=2 on the reference machine;
  - a seek takes under 20 ms;
  - the default harness takes at most twice main's time.

  N=2 fits all four with room. N=4 would break the fork budget: 123–134 ms, a visible pause on every what-if. So N=4 needs either a looser interface budget or moving the engine off the main thread.

### Effect on the Manual principle

None. Levers and one-off shocks apply at the first sub-step of their month, and no rule moves a policy setting. `manual-tax-key-rate-held` is 0.000 at every N.

### Risks

- **Tests.** About 15 tests assume one kernel step a month, 7 of them the harness's own module tests (listed under "Unit tests" below). Rewriting them must keep the invariant each guards, not weaken it. For example, flows × dt = change in stock becomes a sum over sub-steps.
- **`/dt` floors.** Floors written as `−stock/dt` let a whole holding go in one sub-step, so extreme runs can change regime with N. Convert those that stand for behaviour to `liquidRate`/`gapRate` form.
- **Visible shifts.** Lever reports and goldens move by about half the monthly error. The largest move is the króna at month 240 under income tax +10 on Manual: 196 → 190. The decision record must say so.
- **Order.** The scheme stays first order. True second order needs rules that declare rates of change, and a kernel split between state and algebraic variables. That belongs in the decision record as future work.

### Acceptance tests

- **Half-step layer.** Compare N with 2N sub-steps. A bounded measure may move by at most 10% of its range width. The Richardson limit must lie inside the range, with 1% of the width as slack. The full run reports the observed order from a 4N run and applies the order rule above.
- **Kernel tests.**
  - The monthly ledger equals the sum of sub-step postings.
  - The month-average leg equals the mean of the sub-step values, for consumption, the wage bill and bank lending.
  - The dividends regime shows no flicker at N = 1, 2 and 4.
  - Displayed per-step terms (the wage growth term, the neutral-rate revision, the `ruleRate` step) are equal at N = 1, 2 and 4 to within first-order error.
- **Structural pin.** MON-11's 12-month hold troughs in month 12 at N = 1, 2, 4 and 8.
- **Invariance.** `manual-tax-key-rate-held` is 0 at every N.

### Implementation steps

1. **Kernel.**
   - Add `ModelDef.substeps` (whole numbers only), with `Machine.dt = def.dt / N`, a sub-step loop in `stepOnce`, and month-end recording.
   - Add month-total ledger accumulators, exposed as month total ÷ dt in `legs()`, `pipes()` and the ledger view.
   - Add a month-sum for per-step terms, and the regime rule "binding in any sub-step, flagged if it switches".
   - Fill N slots per month in `initHistory`.
2. **Display contract.** Audit the `c.lag` reads and the dt-dependent wording, and apply the contract above.
3. **Harness.** In `src/harness/layers.ts`: the range-width rule, the Richardson gate, the order rule, and the 4N run in the full mode only.
4. **Measures.** Make the `wage-back-*` measures signed.
5. **Dividend flicker.** Fix it, and move behavioural `/dt` floors to exponential form.
6. **Tests and goldens.**
   - Rewrite the tests that assume one step a month.
   - Set the speed test to 250 × N µs.
   - Regenerate the goldens deliberately.
7. **Texts.** Update architecture §4.2, the `wageSettlement` text (item 4 above), and write decision record 0010 (time-stepping). Update lever-vetting items 6, 12 and 14.

**Item 6 is economics, not numerics.** QMM's later output trough comes from inertia in growth rates: habit in consumption growth, investment adjustment costs and staggered wages (Fuhrer 2000; Christiano, Eichenbaum and Evans 2005). A growth-habit stage in consumption and investment is the fix. It stays an open item.

---

## B. Potential output and the policy gap (open items 2, 14 and 19)

### What is wrong

The Taylor rule's output gap is output ÷ (a fixed `potentialOutput` × (1 + the net-immigration newcomers' share)) − 1. Capacity therefore follows the labour force only for the net-immigration lever. It ignores the migration buffer, benefits and, above all, the sector mix.

Public services employ many staff per unit of measured output, because they are valued at cost. A shift toward them tightens the labour market while measured output falls. The rule then reads slack when there is none:

| Automatic, main | Output, month 240 | Unemployment, months 180–240 | Inflation, months 180–240 | Neutral-rate estimate |
|---|---:|---:|---:|---|
| Health +3 | −1.26% | −1.18 | +0.62 | at its 6% limit |
| Education +3 | −1.52% | −1.45 | +0.80 | at its 6% limit |
| Fish prices +30 | +0.19% | +0.24 | −0.14 | 1.74% |
| Net immigration +5 | +2.78% | +0.36 | −0.06 | 0.90% |
| Tourism −60 | −1.06% (234 months at zero) | +0.71 | −0.20 | at its 0% limit |

- **The fixed capacity is used twice more.** The same fixed number feeds the domestic investment accelerator and the markup's capacity term, while firms' capital (posted at historic cost) accumulates.
- **At the zero bound (item 19),** the only memory the rule has is the neutral-rate estimate winding down to its limit. That estimate does two jobs:
  - it makes up for the stimulus the floor prevents;
  - it keeps the debt rule's escape clause switched on.

### What theory and evidence say

**Consensus.**

- **Potential is a supply concept.** It is what the economy produces at the equilibrium unemployment rate (NAIRU; Carlin and Soskice's wage-setting = price-setting), with the labour force it actually has and its installed capital. The CBI's QMM builds trend employment exactly this way: trend participation × working-age population × (1 − NAIRU) (QMM v2.1 eq. 6.11). The CBO and the European Commission do the same.
- **A lasting demand shock moves the stabilising real rate, not potential.** A rule with a fixed neutral rate and a proportional gap therefore leaves a steady-state error, and it must learn the neutral rate (Laubach and Williams 2003; Orphanides and Williams 2002; Holston, Laubach and Williams 2017). That is decision 0009's integral term, which should stay.
- **The gap that drives wage inflation is the unemployment gap** (Galí 2011). An Okun-scaled unemployment gap is a standard way to write the rule (Rudebusch 2009 uses about 2 × (u* − u)). In the Keen and Godley–Lavoie traditions, too, the employment rate drives wages and capital sets capacity.
- **Iceland's neutral rate.** The IMF (2025 Article IV) puts Iceland's neutral real rate near 2.7%; the CBI's own estimate is near 2¼% (OECD 2025).

**The CBI's own rule.** QMM's rule puts 0.5 on the four-quarter average output gap (QMM v2.1 eq. 4.1; Hunt's Bayesian estimate is 0.47). What that means per point of unemployment depends on the Okun ratio used to convert it:

| Okun ratio (output gap % per point of unemployment) | Source | QMM's 0.5, per point of unemployment |
|---:|---|---:|
| 1.2 | Ball, Leigh and Loungani (2017): coefficient −0.82, Spain, the most responsive | 0.6 |
| 1.6 | The model's own ratio for a private-demand shock (tourism −15, month 12) | 0.8 |
| 2.1 | Ball, Leigh and Loungani: −0.48, United States | 1.0 |
| 6 | Ball, Leigh and Loungani: −0.17, Japan, the least responsive | 3.0 |

I found no published Okun coefficient for Iceland. QMM's own unemployment equation (eq. 6.6) links unemployment only weakly, and only to output growth, not to the level of the output gap. That points to a low coefficient, and so to a high ratio, as migration and hours absorb much of the cycle (MB 2021/2 Box 3; IMF 2025). So QMM's slack response per point of unemployment lies between about 0.6 and 3. The model's own Okun ratio gives 0.8, the lower end.

**Contested.**

- **Hysteresis.** It is strong in capital and productivity after tightenings and recessions (Jordà, Singh and Taylor 2024; Cerra, Fatás and Saxena 2023), and weak in the NAIRU itself.
- **Filtered potential.** Filter-based potential reacts to transitory demand shocks and misleads in real time (Coibion, Gorodnichenko and Ulate 2018; Orphanides and van Norden 2002).
- **Make-up at the zero bound.** A rule that remembers the shortfall cuts the costs of the floor (Reifschneider and Williams 2000; Eggertsson and Woodford 2003; Kiley and Roberts 2017), but by less when expectations are not forward-looking (Bernanke, Kiley and Roberts 2019). The CBI follows no make-up commitment.

### Options considered, with measured results

| Option | Measured result (Automatic; inflation and unemployment averaged over months 180–240) | Verdict |
|---|---|---|
| **A: labour-market gap.** aY × okunGap × (normal − actual unemployment), with okunGap 1.6 (the model's own Okun ratio). Potential is shown as output ÷ (1 + gap). The newcomer special case is removed. | Reads the right sign for every shock tested, including shifts in the sector mix and migration. Manual paths identical. Its strength is the question (next table). | **Recommended** |
| B: A plus a make-up state for the zero bound | Identical on the lever report (lasting shocks never lift off). After temporary episodes, cumulative losses fall. But it builds 8–12 months before the floor binds (it keys on `ruleTarget`, not the smoothed rate plus the offset), and it is unbounded (36 point-years; a displayed −19% rule target). | Decide separately, after it is re-specified |
| C: capital-based capacity for the accelerator and markup | Stable and small, but the markup term compares total GDP (including public services and exports) with business capital only. After health +3 it reads utilisation +1.8% when business output over business capital is −4.0%. | Accelerator only, re-specified, later |
| Production-function (Cobb–Douglas) gap | Wrong sign in this multi-sector model: health +3 −1.8% (slack) while unemployment is 0.62 below normal | Display only |
| Filtered or learned potential | Would declare every lasting gap a change in potential: false hysteresis | Rejected |
| Freezing neutral-rate learning at zero | Lasting tourism −60: output −1.07 → −2.97% (or −3.45% without make-up); taxes +2.5 to +3.1 points | Rejected |
| Adding an unemployment-gap term instead of replacing the output gap | Raises the total weight on slack; broke wage-back-consumption in decision 0009 | Rejected |
| A ±5-point learning band | Needs a 7.7% real neutral rate to remove the health residual | Rejected |

**How strong should the response be?** The first revision chose 1.6 (`aY` 1). That was justified partly by US rules and partly by bringing one expectation (tourism −15, "inflation over months 180–240 does not move") back under its 0.01 threshold, at 0.009. The reviewers were right that this is gate-fitting. The tourism −15 residual is the tail of a slow learning cycle, not a steady error. The inflation gap is −0.08 at month 60, crosses zero near month 180 and is +0.02 by month 240, at every strength tested. And the stronger response has a real cost: it removes most of the rule's reaction to a wage settlement in the first year, because jobs fall before output (item 14).

Measured in the package (N=2), against main:

| Automatic | Main | 0.8 (`aY` 0.5) | 1.28 (`aY` 0.8) | 1.6 (`aY` 1) |
|---|---:|---:|---:|---:|
| Wage settlement +10%: key rate at month 12 (estimated limit) | +0.94 | +0.67 (≈ 0.59) | +0.39 | +0.20 (≈ 0.10) |
| Wage settlement +10%: key-rate peak (range 1–1.5) | 1.26 | 1.47 | 1.21 | 1.06 |
| Health +3: inflation, months 180–240 | +0.62 | +0.30 | +0.22 | +0.17 |
| Education +3: inflation, months 180–240 | +0.80 | +0.39 | +0.28 | +0.21 |
| Tourism −15: inflation, months 180–240 | +0.007 | +0.020 | +0.013 | +0.009 |
| Tourism −60: output / unemployment at month 240 | −1.06% / +0.57 | −1.24% / +0.57 | – | −0.12% / +0.22 |
| Tourism −60: months at zero | 234 | 199 | – | 228 |
| wage-price-level-6y (range 3–5; CBI about 4) | 3.49 | 3.11 | – | 3.42 |
| Calibration | 31/31 | 31/31 | 31/31 | 31/31 |

The CBI raised its rate early and firmly after the 2022–24 wage round. The research report puts the policy-rate peak at +1 to +1.5 points in quarters 2–4 after a 10% settlement (CBI DYNIMO, MB 2026/2). A response that is only a tenth of a point at month 12 contradicts that. Only the 0.8 setting keeps at least half of the lower bound of that peak at month 12, and it still halves the health and education residuals.

**Item 14 does not simply land in the combined model.** The factor-substitution fix (jobs react to a slowly perceived wage cost, `lamFS` 0.35, `epsM` 0.9) passed every gate in the numerics prototype. In the combined package it restores the early rate response: +0.99 at month 12, with an estimated limit of about 0.93. But no setting tried keeps both wage checks in range. The converged year-6 consumption response ends above its range, or the key-rate peak ends above its range:

| Package + item 14 (N=2) | wage-key-rate-peak (1–1.5) | wage-back-consumption, estimated limit (0–0.25) | rate-output-trough (−0.6 to −0.25) |
|---|---:|---:|---:|
| `aY` 1 | 1.51 | 0.27 | −0.52 |
| `aY` 1.1 | 1.45 | 0.30 | −0.52 |
| `aY` 1.2, `lamC` 0.8 | 1.49 | 0.27 | −0.58 |
| `aY` 1.3, `lamC` 0.85 | 1.46 | 0.27 | −0.59 |
| `aY` 1.25, `lamC` 0.75 | 1.44 | 0.30 | −0.56 |
| `aY` 1, `lamC` 0.9 | 1.63 | 0.17 | −0.60 (out) |

With item 14 at `aY` 1.1, the full harness gives 30/31 calibration and 203/206 expectations. So item 14 needs a joint refit of its own (phase 5), with the wage-price feedback and the consumption response to interest income in the search. It is not a one-line addition to phase 2.

### Recommendation

Adopt option A: the policy gap is read from the labour market, measured against the wage curve's own normal unemployment, using the labour force the economy has. It is the concept QMM, Carlin and Soskice, and Galí use. It is the only candidate tested that reads the right sign for every shock, including shifts in the sector mix and migration.

- **Anchor the strength on the CBI.** Land it at aY × okunGap = 0.8 (`aY` 0.5, `okunGap` 1.6). That is QMM's 0.5 on the output gap, converted at the model's own Okun ratio. It keeps a CBI-like first-year response to wage settlements, and it halves the long-run residuals. Record the product as the calibrated quantity, with this basis. Revisit it only in the phase-5 joint refit with item 14, against the CBI's wage-shock evidence (wage-key-rate-peak and a new month-12 check), not against a single expectation.
- **Re-specify the tourism −15 expectation, with its reason recorded (model rule 12).** It tests inflation over months 180–240, which catches the upswing of a slow learning cycle. Replace it with a test that the cycle dies out: the largest inflation gap over months 180–240 is under 0.05 points and under half the largest over months 36–96. The package gives 0.034 against 0.108, which passes; main gives 0.019 against 0.074, and every strength tested passes.
- **Keep the neutral-rate learning** and its ±3-point band.
- **Explain what remains.** The health and education residuals (+0.30 and +0.39 points) belong to missing small-open-economy channels, not to potential: adjustment through the real exchange rate, and labour supply that follows lasting tightness. Say so in the lever texts and in the vetting record.
- **Add a diagnostic.** Add an "implied neutral rate" line to the lever report: the constant real rate that would leave unemployment at normal and inflation on target by month 240. It shows how far outside the band the needed rate lies.
- **Name the capacities apart.** The package's Overview indicator is called `potentialOutput`, the same id as the fixed parameter that the markup's capacity term and the investment accelerator still read. Rename the indicator `potentialOutputSeen` (the variable it shows), and say in the markup and accelerator texts that both still read the fixed baseline capacity. For now the markup keeps the fixed capacity: C showed that a capital-based markup term mis-measures utilisation. Decide its capacity together with the capital-based accelerator (phase 8).
- **Label the displayed potential honestly.** okunGap 1.6 is a month-12 ratio that includes labour hoarding, and no published Icelandic estimate exists to check it against. So the Overview label should read "the central bank's estimate from the labour market", not "what the economy can produce".
- **Zero bound (item 19), in this order.**
  1. **Give the floor Iceland's room first.** With a 0% target and a 3% neutral real rate, the model has 3 points between the neutral rate and the floor. Iceland has about 4.5–5 (a 2.5% target plus a neutral real rate of 2¼–2.7%; the CBI's low was 0.75% in 2020–21). The months at zero (tourism −60: 199; health −3: 215) are partly an artefact of that baseline. Until the start-from-today baseline with a 2.5% target exists, the zero-bound decision record should say so, and a diagnostic run with 5 points of room should be reported next to every months-at-zero figure.
  2. **Only then decide make-up.** If item 19 still wants make-up, re-specify it:
     - accumulate keyRate − (ruleRate + offset), which is the stimulus actually withheld;
     - cap it (Kiley and Roberts style);
     - key the escape clause to the shadow rate;
     - decide it in the same decision record, as a policy-regime choice, not a correctness fix.
- **Build capital-based capacity for the accelerator only,** with utilisation measured consistently: business output over business capital. Keep a production-function potential for display only.
- **Reject** filtered potential, hysteresis in the NAIRU by default, freezing learning at zero, and a wider band.

### Effect on the Manual principle

None on paths. Every Manual headline path is identical to main's, because the rule only suggests on Manual. The suggestion itself changes, which decision 0004 requires, since it is computed in both modes.

### Risks

- **Wage settlements (item 14).** Even at 0.8 the rule eases earlier than on main: +0.67 against +0.94 at month 12. The item-14 fix restores it but needs the joint refit above. Until then a tripwire guards the month-12 response (acceptance tests).
- **Public spending on Automatic now costs more output and more debt.** Measured at month 240 (package against main):

  | Automatic, +3% of GDP | Output | Key rate | Debt ratio |
  |---|---:|---:|---:|
  | Health | −2.46% (main −1.26%) | +3.9 points (main +2.5) | +48.6 points (main +38.1) |
  | Education | −3.04% (main −1.52%) | +4.1 points (main +2.4) | +49.6 points (main +36.5) |

  That is correct given the labour scarcity. But the crowding-out runs through high interest rates, and the higher interest bill slows the debt rule, because the real-exchange-rate channel is missing. It is a visible teaching change, and the owner must accept it or stage it (decision 5 below).
- **The balance of risks at the zero bound.** Health −3 spends 215 months at zero, against 178 on main, because the rule now sees the slack. Tourism −60 spends 199 against 234. See item 19 above.
- **Credit levers.** ltvCap 50 leaves output −0.39% at month 240, against −0.33% on main: slow learning of a small gap.
- **The margins are thin.** Four checks sit near an edge in the package:
  - fiscal-output-year1: 0.598, against a top of 0.6;
  - wage-key-rate-peak: 1.47, against a top of 1.5;
  - wage-unemployment-peak: estimated limit 0.995, against a top of 1.

  - wage-price-level-6y: 3.11 (estimated limit 3.04), against a bottom of 3.

  Any later retune can push one of them out. That is why phase 5 is one joint refit, not a series of separate adjustments.

### Acceptance tests

- **Module tests.**
  - The gap equals okunGap × (u* − u).
  - Displayed potential follows the labour force under the migration lever and under net immigration.
  - Manual paths are bit-identical to a run with the old gap.
  - The rule's response per point of lasting unemployment is aY × okunGap.
- **A new tripwire on wage settlements.** After +10% wages on Automatic, the key rate at month 12 must be at least 0.5 points on its Richardson limit: half the lower end of the CBI's +1 to +1.5 peak in quarters 2–4. The package gives about 0.59. The first revision's package, at 1.6, gave about 0.10 and would have failed.
- **Tripwires, as known gaps.** On Automatic, months 180–240:
  - health +3 and education +3: inflation below +0.45 points;
  - fish +30: inflation within ±0.1.

  Today they are +0.30, +0.39 and −0.09. Tighten them as the króna work closes the channel.
- **Expectations.**
  - Re-specify tourism −15 as the decay test above.
  - Bring health, education and fish "does not move" back only when they pass.

### Implementation steps

1. **Code.**
   - `central-bank.ts`: the `outputGap` variable (POLICY, a shadow of the key-rate stabiliser) and a new `ruleTarget` term. Drop `newcomerShare` from the rule.
   - `labour-and-wages.ts`: a shared `normalUnemployment` helper, also used by `neutralRate`.
   - `indicators.ts`: the display indicator `potentialOutputSeen`, labelled as the bank's estimate.
2. **Parameters and concepts.**
   - Add `okunGap`, with its provenance: the model's own ratio at month 12, including hoarding, and the absence of an Icelandic estimate.
   - Rewrite the note on `aY`: the calibrated quantity is the product, 0.8, which is QMM's 0.5 at the model's Okun ratio.
   - Update the concept pages for capacity utilisation and the neutral rate, and say which capacity the markup and the accelerator read.
3. **Texts.** Update the definitions that quote changed figures: net immigration, ltvCap, dstiCap, keyRateAddon, health, education.
4. **Tests.**
   - Re-pin the tripwires the change moves: E6 pass-through, FX-1 broad money, FX-4 real króna, the world-price wage gap, the MON-11 trough month.
   - Fix the UI regex.
   - Add the month-12 tripwire.
5. **Records.** Write decision record 0011 (the policy gap is read from the labour market, at the CBI-anchored strength), with the rejected alternatives and the product table above. Update items 2, 14 and 19.

---

## C. The króna (open items 4, 5, 17, 18 and 1)

### What is wrong

On main, after a one-off 25% fall in sentiment toward the króna, held on Manual:

| Month | 12 | 60 | 120 | 240 | 480 |
|---|---:|---:|---:|---:|---:|
| Price of foreign currency, % | +23.9 | +2.1 | +0.2 | −1.4 | −3.8 |
| Price level, % | +5.7 | +2.4 | +1.9 | +0.03 | −3.1 |
| Real exchange rate, % | +20.3 | −0.1 | −1.8 | −1.7 | −0.9 |

- **Item 17: the snap-back.** The nominal króna is back by month 36 and the price level returns to baseline. After 2008–09, Iceland's price level stayed permanently higher.
- **Item 18: tourism and inflation.** Tourism −60 weakens the króna by only 7% (Manual) and 10% (Automatic) within a year. Inflation over months 3–18 is −0.14 points on Manual.
- **Item 5: the portfolio bound.** The bounded portfolio term exceeds its 0.2 bound under income tax +10. Item 5 also covers public investment +0.8 lowering real consumption on Manual.
- **Item 4: booms.** Booms weaken the real króna.
- **Item 1: the foreign rate.** Without a foreign-currency liability, a higher foreign rate leaves a lasting drift.

The prototypes found the root cause. The price level and net foreign assets are both, roughly, integrals of the real exchange rate over time. Every holder of foreign-currency positions has a fixed target: pension funds' foreign share, the central bank's reserves, and non-residents' normal króna holdings. So net foreign assets are forced back to baseline, which forces the integral of the real rate back to about zero, and the price level follows. The portfolio term also reacts only to stocks that have already built up, not to a flow the market can see coming.

### What theory and evidence say

**Consensus.**

- **The nominal rate is relative prices times the real rate:** log e = (p − p*) + q. That is QMM's identity (eq. 4.10), so the króna following domestic prices within the month is not an error. What needs a slow anchor is the **real** rate.
- **UIP with a risk premium sets q in the short run** (QMM eq. 4.9–4.16; Engel 2016; Itskhoki and Mukhin 2021).
- **PPP pulls q back slowly,** with a half-life of 3–5 years (Rogoff 1996; Sarno and Taylor 2002). QMM's own equations imply roughly 2–3.3 years around its equilibrium real rate.
- **Base drift.** Under inflation targeting a one-off shock leaves the price level and the nominal rate permanently shifted; only q returns (Svensson 1999). QMM says the nominal equilibrium is set by monetary policy. After large devaluations the real depreciation persists through slow non-tradable prices, and the nominal rate does not snap back (Burstein, Eichenbaum and Rebelo 2005).
- **Portfolio balance adds a stock channel** (Kouri 1976; Branson 1977; Gabaix and Maggiori 2015). With forward-looking investors, predictable flows are priced at once and then the rate drifts (Blanchard, Giavazzi and Sa 2005). Higher net foreign assets go with a slightly stronger long-run real rate (Lane and Milesi-Ferretti 2004).
- **Pass-through in Iceland** is 0.15 within the quarter and 0.23 in the long run (Edwards and Cabezas, CBI WP85), or 0.2 at 12 months and 0.4 at 36 (IMF 2024).
- **2020.** The trade-weighted króna fell nearly 10% within the year, and inflation rose from 1.7% to 3.6% despite a 7% fall in GDP. That inflation figure is an **upper bound** for a tourism shock alone. It also contains the CBI's rate cuts, the housing boom that followed and global price shocks. It supports gating the **sign** of inflation after a tourism collapse, not its size.

**Contested.**

- whether the nominal rate or prices do most of the PPP reversion (Cheung, Lai and Bergman 2004);
- the size of portfolio-balance effects;
- whether a credit boom must appreciate the real rate. With a held nominal rate, a domestically financed boom should weaken it. With an inflation-targeting rule that tightens, it should strengthen it, as in Iceland in 2004–07, when carry-trade inflows came in and the króna was strong.

**One claim of the first memo was wrong.** Making the domestic-price leg of PPP slow is not the fix. It broke wage-key-rate-peak (0.79 against a range of 1–1.5). And under a held nominal rate, falling prices raise the real rate, so real-rate UIP gives a real *appreciation*, not a depreciation (anchor prototype E3). An exchange-rate block cannot anchor Manual.

### Options considered, with measured results

After kronaShock −25, "P240/P24" is the price level at month 240 as a share of its month-24 level. 1 means a lasting level shift; 0 means a full return.

| Option | Measured result | Verdict |
|---|---|---|
| **A: flow-priced portfolio term.** The term reads holdings plus the recent (quarter-average) flow of krónur to non-residents, in a deeper market with a smooth 0.2 bound. | Tourism −60 depreciates 12–14% in a year, and inflation over months 3–18 turns positive (+0.46 Manual, +0.84 Automatic). P240/P24 0.25 (Manual) and 0.15 (Automatic). Late real overshoot −3.8%. 31/31. | **Recommended now**, with the fixes below |
| **E2: reserve target in foreign currency.** Uses the `worldPriceAnchor` form. | Reserve sales in months 0–36 after −25: 1.39 → 0.22% of GDP. No automatic foreign-exchange sales into a depreciation on Manual. Little effect on base drift. | **Recommended now** |
| B: flow-led, weak stock term | Clean base drift, but lasting export losses close through deflation (tourism −60 price level −18.8%). The surplus parks as a 16.5%-of-GDP króna short. | Rejected |
| C: banks' net foreign funding | Unhedged, pre-2008 structure; does not fix FX-1 | Rejected; superseded by E4 |
| E1: pension funds rebalance revaluation slowly | Delays the payback, does not remove it (P240/P24 0.11) | Rejected |
| E3: slowly adapting holdings norm | First real base drift (P240/P24 0.76 Manual), but lasting export shocks close through deflation | Part of D5b |
| E4: currency-matched FX loans, bank FX funding, Treasury eurobonds | Halves the FX-1 gap (0.29 → 0.17 per point). No open position. Puts two rate checks on QMM. But the steady-state closure cuts pension funds' bank bonds from 27.8 to 16% of GDP and breaks their liquidity in collapses. | Stage 3, a data project |
| E5: real carry gap (QMM's RID) | wage-key-rate-peak 1.61, out of range (the Walters loop) | Revisit in decision 0007's joint search |
| E6: smoother flow term | No gain | Rejected |
| D5b: E3 plus a learned "fundamentals" term (a behavioural equilibrium exchange rate) | The only candidate that met all three E7 criteria at 240 months. On Manual it reverses later: price level +6.3% at month 240, −6.0% at month 600, output still falling. | Right direction; re-specify (stage 2) |
| D8b: everything together | Most complete, but inherits E4's closure problem | Not landable |

**What the flow term is.** It is not the forward-looking pricing of Blanchard, Giavazzi and Sa, although it is motivated by it. It extrapolates: the market treats the last quarter's flow of krónur as the flow still to come, and prices about `pbFlow ÷ pbStock` years of it. The texts should call it "extrapolative expectations of flows".

**Setting `pbFlow` from króna evidence.** The first revision set `pbFlow` at 0.008 because that brought the year-1 fiscal multiplier back under its 0.6 limit. The reviewers were right that a króna parameter should not be tuned to a fiscal check. So here it is identified from the króna's own evidence. A lasting 60% fall in tourism should weaken the króna within a year at least as much as the temporary 2020 slump did: a trade-weighted fall of nearly 10%, and 14.9% against the euro. Since 2020 was seen as temporary, a lasting loss should go somewhat further, but not to the 20% that D5b gives. Measured in the package on Automatic:

| `pbFlow` | Króna weaker at month 12 after tourism −60 | Inflation, months 3–18 | krona-pass-through-year1 (0.15–0.23) | fiscal-output-year1 (0.3–0.6) | Real half-life after kronaShock −25, Manual / Automatic |
|---:|---:|---:|---:|---:|---|
| Main (no flow term) | 9.8% | +0.31 | 0.195 | 0.532 | 12 / 10 months |
| 0.004 | 10.6% | +0.27 | – | – | 17 / 13 months |
| 0.006 | 11.6% | +0.39 | – | – | 16 / 12 months |
| 0.008 | 12.6% | +0.50 | 0.193 | 0.59 | 15 / 12 months |
| 0.0121 (a year of flow) | 14.5% | +0.74 | – | 0.61 | 13 / 10 months |

(These rows are at `aY` 1, where the sweep was run. At the package's `aY` 0.5 and `pbFlow` 0.008 the króna is 11.6% weaker at month 12, inflation over months 3–18 is +0.37, and fiscal-output-year1 is 0.598.)

The band that fits the evidence is roughly 0.004 to 0.0121. Inside it, a lower value also lengthens the real half-life, which is the direction the evidence wants. **Recommended: `pbFlow` 0.008, the middle of the band.** It is recorded as identified from the 2020 depreciation, with the horizon of flows it implies (about eight months) recorded as assumed. The fiscal multiplier then sits at 0.598, inside its range but on the edge.

If a later change pushes the multiplier out, investigate the multiplier's own path, not the króna horizon. The mechanism: public investment raises imports, the current account worsens, the flow term weakens the króna, and net exports rise. The labour-market gap adds to it, because the rule tightens less when unemployment moves less than output. The multiplier's range (0.3–0.6) is itself an inference from a cross-country median and Iceland's openness.

**The package, against main:**

| Measured against the no-change run | Main | Package |
|---|---:|---:|
| kronaShock −25, Manual: price level at months 12 / 60 / 120 / 240 | 5.7 / 2.4 / 1.9 / 0.03 | 5.4 / 7.4 / 5.9 / 1.5 |
| kronaShock −25, Manual: price of foreign currency at months 12 / 60 / 120 / 240 | 23.9 / 2.1 / 0.2 / −1.4 | 24.0 / 10.0 / 2.9 / −2.0 |
| kronaShock −25, Automatic: price level at months 12 / 60 / 120 / 240 | 5.0 / 0.8 / 0.9 / 0.2 | 5.1 / 4.3 / 3.1 / 0.7 |
| kronaShock −25: lowest real rate over months 61–240 (Manual / Automatic) | −1.8 / −1.6 | −4.3 / −3.8 |
| kronaShock −25: real half-life after month 3 (Manual / Automatic) | 12 / 10 months | 15 / 12 months |
| Tourism −60: króna weaker at month 12 (Manual / Automatic) | 7.2 / 9.8% | 10.6 / 11.6% |
| Tourism −60: inflation, months 3–18 (Manual / Automatic) | −0.14 / +0.31 | +0.27 / +0.37 |
| Income tax +10, Manual: output at month 240 | −18.9% | −14.7% |
| Income tax +10, Manual: growth of the inflation gap, months 180 → 240 | 1.33 | 0.26 |
| Lending appetite +3, Automatic: real rate, mean over months 12–36 | +0.02 | +0.13 |

**Where the price-level persistence comes from.** After kronaShock −25, the reviewers asked whether the lasting price level is pass-through that stays, or something else. The split, in the package at month 120:

| kronaShock −25, month 120 | CPI | Domestic prices | Import prices | Wages | Output at month 12 | Lowest unemployment |
|---|---:|---:|---:|---:|---:|---|
| Manual, main | +1.9% | +2.0% | +0.3% | +2.8% | +5.7% | −1.6 (month 24) |
| Manual, package | +5.9% | +6.0% | +3.4% | +6.9% | +5.7% | −1.8 (month 31) |
| Automatic, package | +3.1% | +3.1% | +0.1% | +4.2% | +5.1% | −1.2 (month 24) |

Import prices come back with the nominal króna. The lasting part of the price level is **domestic**. It is driven by wages, after a longer boom: the weaker króna lasts longer, so net exports stay higher for longer. That is a legitimate channel (QMM's own premium shock opens a positive output gap through net exports), but it is not base drift through pass-through. And the model's boom is large: output +5.7% at month 12 after a 25% shock. The headline "a lasting price level for a decade" in the first revision overstated what happens. On Automatic the price level at month 240 is only 0.12 of its month-24 level.

**H5, the persistence of sentiment.** Does the real króna come back fast because the sentiment shock itself fades fast? No. Sentiment fades at 0.1 a year, a half-life of about 7 years, yet the real rate halves within about 15 months. Making sentiment fade faster (0.35 a year, QMM's premium persistence) shortens the real half-life further, to 10 months (Manual) and 9 (Automatic), and turns P240/P24 negative. So the fast real reversion comes from the portfolio closure overriding the premium, not from the premium itself. That is the substance of the complaint in item 17, and it is stage 2's job.

**Item 4 on Automatic is a regression, not a regime effect.** The first revision called it "regime-dependent". That was wrong: on Automatic the rule tightens, and the textbook sign, and Iceland's 2004–07 experience, is a real appreciation. The decomposition, for lending appetite +3 on Automatic over months 12–36:

| Automatic, lending appetite +3, months 12–36 | Main | Labour gap only (prototype, `aY` 0.8) | Króna stage 1 only | Package |
|---|---:|---:|---:|---:|
| Real exchange rate, mean (+ = weaker) | +0.02 | +0.09 | +0.08 | +0.13 |
| Key rate, mean | +0.28 | +0.17 | +0.29 | +0.14 |
| Flow of krónur to non-residents, % of GDP a year | – | – | +0.11 | +0.11 |

The two changes add up:

- **The labour-market gap.** In a credit boom, output rises before unemployment falls, because firms hoard labour and migrants fill jobs. So the rule tightens about 40–50% less, and the carry trade strengthens the króna less.
- **The flow term.** It reads the boom's import outflow: the flow is already +0.05% of GDP at month 12, when the key rate has risen only 0.04 points. The stock term nets out the krónur the carry trade wants, but the flow term does not.

Main already failed the vetting's proposed test narrowly (+0.02). The package fails it by more.

- **The candidate fix** is to price only the flow the carry trade does not absorb: pbFlow × (inflow − the change in the carry trade's wanted holdings). That is the flow counterpart of what the stock term already does.
- **The second part** belongs to item 14: once jobs follow output on the right timing, the labour gap should see a credit boom sooner.

This fix is a **blocker for releasing stage 1**. It is guarded by a tripwire: on Automatic, the real rate after lending appetite +3 must average ≤ 0 over months 12–36. The existing unit test "a credit or tax-cut boom with higher rates leaves the real króna stronger for a year and a half" (FX-4) also fails in the package, narrowly.

**Item 5: the bound binds; it is not satisfied.** Under income tax +10 on Manual, the portfolio term reaches −0.194 log points at month 240, against a bound of 0.2. On the side where non-residents are short of krónur, the term is 0.2 × tanh(gap ÷ 0.2), so it can never pass 0.2. A gate on the bounded output passes by construction. The gap before the bound is about −0.42 log points: the tanh is 97% saturated. So:

- gate on the gap before the bound, or on the real króna's distance from parity, not on the bounded output;
- keep a regime label, "Portfolio balance near its limit", shown when the tanh is more than 80% saturated, so the lever report shows it (model rule 2);
- say that stage 1 does not close item 5's other part: public investment +0.8 lowering real consumption on Manual stays open.

**Fish prices +30.** The first-year GDP-volume expectation fails in the package, and the model's GDP volume stays below baseline over months 13–60 as well (−0.21% on Automatic, −0.60% on Manual; main −0.29% and −0.84%). Real gross domestic income rises by 2.75% in year 1. For a quota-bound windfall, GDP volume is theoretically ambiguous. The spending effect raises non-tradables, but the stronger króna crowds out other exports (Corden and Neary 1982); with no resource movement, the net sign depends on how much of the spending goes on imports. A test on real gross domestic income alone would hold by construction, because a better terms of trade raises it mechanically. So:

- keep year-1 output as a **documented ambiguous case**: reported, with its measured value, not deleted;
- add two real tests that do not hold by construction: the spending effect (real household consumption up over months 1–36) and Dutch disease (other exports and tourism down over months 12–60);
- add real gross domestic income up in year 1 as a third, labelled as the terms-of-trade accounting effect.

**The stage-2 candidate D5b**, added to the package (variant 3, with `aY` 0.8), confirms both the promise and the critique:

- **Automatic** (the price level as a share of its month-24 level): P240/P24 rises to 0.53 and P480/P24 to 0.30.
- **Manual:** P240/P24 is 0.84, but P480/P24 is −0.20 and the price level is −6.4% at month 600, with the króna 9.6% stronger. Without a nominal anchor (issue D), no exchange-rate design gives Manual a lasting level.
- **Tourism −60:** the króna is 20–21% weaker within a year, against about 13% in 2020, when the slump was seen as temporary.
- **The multiplier:** fiscal-output-year1 lands at 0.600, on the edge of its range.

### Recommendation

**Stage 1: A plus E2, with `pbFlow` 0.008 identified from the 2020 depreciation.** It is:

- consistent with theory (markets price foreseeable flows; reserve adequacy is a foreign-currency concept);
- a change to price rules only, with no new stock.

It closes item 18. It closes the bound part of item 5, but only in the sense that the bound is now smooth and visible. It improves item 17 but does not solve it.

Before release it needs three things:

- the item-4 fix and its tripwire;
- the bound's regime label and a gate before the bound;
- the fish re-specification.

State its 15-month (Manual) and 12-month (Automatic) real half-life as a known gap until stage 2.

**Stage 2, item 17: take D5b's structure forward, re-specified.** The economically correct design has three parts:

1. **A place to rest.** Net foreign assets get a home that is not pinned. Residents (pension funds, or firms' and households' foreign-currency deposits in a Godley–Lavoie wealth-share portfolio) hold foreign-currency assets that pay the foreign rate and are revalued with the króna. That replaces non-residents borrowing krónur from Icelandic banks for decades (9% of GDP in D5b).
2. **One slow closure on Iceland's total net foreign assets.** It should be a slow debt-elastic premium (Schmitt-Grohé and Uribe 2003) with a Lane and Milesi-Ferretti-sized slope. It replaces a norm that acts on one component, non-residents' krónur.
3. **An equilibrium real rate that moves with an endogenous underlying current-account gap,** measured at the baseline real rate and at potential, and learned by the market. This is the IMF's EBA macroeconomic-balance approach (Phillips et al. 2013) and Clark and MacDonald's BEER. It should not be keyed to particular levers.

Then refit persistence against a real-half-life target, not only a price-level one (acceptance tests).

**Stage 3, item 1: foreign-currency liabilities (E4) as a data project.** Build it on CBI and IMF balance-sheet data, with a closure that keeps banks' foreign funding matched by foreign-currency loans and liquid foreign-currency assets, and keeps bank bonds at their data level.

### Effect on the Manual principle

None on policy. E2 improves Manual: today the reserve target, set in krónur, makes the central bank sell reserves into a depreciation on Manual, a de facto intervention. In foreign-currency terms it no longer does. A later foreign-exchange intervention rule would be POLICY, declared as a stabiliser (model rule 11), and would only suggest on Manual.

### Risks

- **Base drift makes Manual look worse beyond 240 months.** The package leaves the price level at −5.3% at month 480 after −25 on Manual, against −3.1% on main. The 240-month report must not be the only judge of base drift. Judge it on Automatic, to month 480.
- **The late real overshoot is larger** (−4.3% against −1.8%) until stage 2 gives net foreign assets a home.
- **Item 4 regresses** until its fix lands (above).
- **pfForeign −20 on Manual.** The pension funds bring 20 points of assets home. The flow term prices that inflow, the króna strengthens more, and the deflation is deeper at month 180 (inflation −0.97, against −0.27 on main) before it fades (−0.29 at month 240). That is the flow term doing its job. It is not accelerating inflation (issue D's tripwire).
- **rate-krona falls from 0.69 to 0.61** (QMM 0.67): the joint search of decision 0007 should be rerun.
- **About 12 tripwire tests move** and must be restated with reasons (see "Unit tests").

### Acceptance tests

**Stage 1.**

- **Back into the gate:** "tourism −60, inflation up over months 6–24", in both modes, as a **sign** (the package gives +0.31 Manual and +0.49 Automatic). The 2020 figure is an upper bound, so the size is not gated.
- **Tripwires:**
  - tourism −60 on Automatic weakens the króna by at least 8% by month 12;
  - lending appetite +3 on Automatic: the real rate averages ≤ 0 over months 12–36 (item 4; the release blocker);
  - under income tax ±10 on Manual, the portfolio **gap before the bound** is reported, and the regime label appears whenever the bound is more than 80% saturated;
  - reserve sales in months 0–36 after kronaShock −25 on Manual are below 0.3% of GDP.
- **Fish +30:** the three tests above replace the year-1 output test, which stays reported as an ambiguous case.
- **Known gap, stated:** the real half-life after kronaShock −25 is 15 months (Manual) and 12 (Automatic).

**Stage 2.**

- **Real persistence.** After kronaShock −25, the real rate's half-life (from month 3) lies in or near QMM's 24–40 months, in both modes. H5 showed that the portfolio closure, not the premium, sets it today.
- **Split the price level.** At months 60 and 120 after kronaShock ±25, report the CPI's import-price and domestic parts separately. Gate the import-price part on the nominal króna's own persistence, and require that the domestic part does not come mainly from a boom larger than QMM's: output at month 12 below a stated multiple of QMM's premium-shock output response.
- **Price level at month 480 on Automatic.** The first revision proposed P480/P24 ≥ 0.5 without deriving it. It cannot be derived from QMM's published figures: QMM documents only a premium shock that lasts four quarters (QMM v2.1 §12.3; pass-through about 0.25 at the peak). So until a QMM run of a lasting premium shock is obtained from the CBI, gate only the **sign** (the price level above baseline at month 480 on Automatic) and report the ratio.
- **Manual:** the price level does not change sign before month 240. Beyond that, Manual has no anchor.
- **Lasting export shocks on Automatic** (tourism −15, −60; foreign demand −20; fish −30; aluminium −40): inflation over months 180–240 within ±0.3 points.
- **The lowest real rate after month 60** lies within the Lane and Milesi-Ferretti effect of the change in net foreign assets, not a flat 2%.

**Stage 3.** FX-1: the current account in month 1 per point of the foreign rate below 0.1% of GDP, and the Automatic "does not move" expectation back in the gate.

### Implementation steps

1. **Stage 1.**
   - `external.ts`: the flow-priced portfolio term (`pbStock`, `pbFlow`, `pbBound`, `lamFlowFX`, the state `kronaInflowW`), the carry-netted flow (item-4 fix) and the saturation regime label. Remove `betaH` and `fxDepth`: the package left them declared and unused, which fails the provenance test.
   - `central-bank.ts`: E2's reserve target in the `worldPriceAnchor` form.
   - **Provenance.**
     - `pbFlow`: identified from the 2020 depreciation, with the horizon of flows it implies assumed.
     - `pbStock` and `pbBound`: as the prototype recorded.
     - The fiscal-output-year1 margin (0.598 of 0.6) recorded as an edge.
   - Rewrite the króna tripwires.
   - Write decision record 0012, superseding decision 0007's portfolio section. Update items 4, 5, 17 and 18.
2. **Stage 2.** Run the four remaining requested experiments first (H5 is done):
   - H1: E7 to 600 months;
   - H2: the resident foreign-currency home;
   - H3: the EBA-style gap;
   - H4: the persistence refit, against the real-half-life target.

   Then choose, and write decision record 0014.
3. **Stage 3.** Gather the data on banks' foreign-currency balance sheets and Treasury foreign-currency debt. Rebuild E4's closure, and write a decision record.

---

## D. Manual: the price level and the real economy with policy held (open items 3, 10, 16, 20 and TAX-2)

### What is wrong

On Manual, the key rate and the tax rates never move unless the user moves them. On main:

| Manual, main | Month 12 | 60 | 120 | 240 | 480 | 600 |
|---|---:|---:|---:|---:|---:|---:|
| Income tax +2.5: output | −0.56% | −2.09% | −3.03% | −3.81% | −4.76% | −5.22% |
| Income tax +2.5: inflation | −0.37 | −0.74 | −0.88 | −1.11 | −1.40 | −1.53 |
| Income tax +2.5: price level | −0.4% | −2.9% | −6.7% | −15.8% | −34.8% | −43.8% |
| Income tax +2.5: debt ratio, points of GDP | −1.3 | −4.9 | −8.3 | −14.1 | −28.5 | −38.4 |
| Income tax +10: inflation | −1.47 | −3.75 | −4.11 | −6.04 | −6.54 | −5.93 |
| VAT +2.5: price level | +1.5% | +0.5% | −1.5% | −6.8% | −19.1% | −25.3% |
| Key rate held at 4.75% (+1.75): output | −0.87% | −1.14% | −0.16% | +1.34% | +2.98% | +3.48% |

- **The held rate reverses.** At 4.75% output turns positive in month 131; at 4% in month 136; at 6% in month 124.
- **The 15% hold is explosive:** debt is 346 points of GDP higher at month 240.
- **The reference economy's held rate** reverses after about eight years (item 10).

Two different things are wrong here, and they need different answers:

- **(a) The price level has no anchor.** Prices trend for as long as a lasting shock keeps unemployment off normal.
- **(b) The real economy does not settle.** Output, the debt ratio and some sectors' balance sheets keep moving for centuries.

### (a) The price level: no anchor, by construction

**What theory and evidence say.**

- **Drift is correct while the rate is off the natural rate (consensus).** This is Wicksell's cumulative process. A lasting shock that lowers the natural rate leaves a held rate too high for good. With expectations partly anchored to the target (the model's `chi` 0.5, close to QMM's steady-state weight of about 0.57), a lasting unemployment gap gives a lasting inflation gap, and the price level trends. With fully adaptive expectations it would accelerate (Friedman 1968). Under rational expectations an interest-rate peg is indeterminate (Sargent and Wallace 1975). So "prices 16% lower after 20 years" is not wrong in itself.
- **Long holds in practice gave quiet, stable inflation, not spirals** (Japan; the zero-bound years 2009–21; Cochrane 2018; Debortoli, Galí and Gambetti 2019). That is the lesson of anchored expectations and a flat Phillips curve (Blanchard 2016; Hazell, Herreño, Nakamura and Steinsson 2022). A sound Manual mode should not show an inflation gap that keeps growing within 20 years.
- **The anchor is borrowed from a central bank expected to act.** QMM says it outright: monetary policy provides the nominal anchor. Iceland's long-term expectations became much better anchored after about 2012, but not fully (Pétursson, CBI WP 77). Credibility erodes after years of misses (Carvalho, Eusepi, Moench and Preston 2023).
- **Godley and Lavoie (WP 494) are specific about the anchor.** With the tax rate fixed and an exogenous interest rate, their stock-flow economy converges in real terms. A fiscal reaction is needed only to hit an inflation *target* when the long-run Phillips curve is vertical. So a stock-flow model with fixed taxes has no reason to lack a real steady state. It lacks only a nominal one.

**How steep is the model's long-run Phillips curve?** The size of the drift the owner complained about scales with it. Measured at month 240 on Manual (inflation gap ÷ unemployment gap):

| Manual, month 240 | Unemployment gap | Inflation gap | Slope |
|---|---:|---:|---:|
| Income tax +2.5 | +1.23 | −1.08 | 0.88 |
| Income tax +10 | +4.98 | −4.21 | 0.85 |
| VAT +2.5 | +0.68 | −0.60 | 0.88 |
| Health −3 | +3.41 | −2.70 | 0.79 |

So the model's long-run slope is about 0.8–0.9 points of inflation per point of unemployment. That is roughly phiU ÷ chi, less the wage-share correction and the import share of the CPI. For comparison:

- **QMM.** Its price equation puts 0.083 a quarter on the average output gap, with 0.625 on lagged inflation (eq. 7.1). If expectations stay anchored, a lasting 1% output gap therefore gives 0.22–0.42 points of inflation. At an Okun ratio of 1.6 that is about 0.35–0.7 per point of unemployment. (QMM itself imposes a vertical long run; this is the anchored-expectations analogue.)
- **The United States since the 1990s.** Estimates put the slope near 0.2 or below (Blanchard 2016; Hazell et al. 2022).

The model is therefore steeper than the Icelandic benchmark and much steeper than the international evidence. That is the honest lever on the *size* of the drift. Halving the slope would roughly halve the 20-year price drift. It adds no anchor, and it is a calibration question for decision 0008 (phiU, the wage error correction), separate from `chi`. Raising `chi` above QMM's value to hide the drift remains ruled out.

**Conclusion for (a).** Under a held key rate with fixed tax rates, nothing but people's partial trust in the target anchors prices. That is by construction and should stay. The non-vertical long-run Phillips curve is a defensible 10–20-year description of anchored expectations (Blanchard 2016; Akerlof, Dickens and Perry 2000), not a claim about the very long run.

### (b) The real economy: an open model property, not a theorem

The first revision said that with r > g and a fixed primary surplus, the debt ratio has no floor. That sentence was wrong for this model and is withdrawn. Manual fixes tax *rates*, not the primary surplus, so the primary balance is endogenous. Godley and Lavoie (WP 494) show that such an economy "will not generate explosive interest flows" even with r > g. The model's own long runs show the real drift is not about the Phillips curve either. With the Phillips-curve slope set to zero (`phiU` 0), on main:

| Manual, `phiU` 0 | Output, month 240 / 480 / 1200 / 2400 | Government balance at month 2400 |
|---|---|---|
| Income tax +2.5 | −4.64 / −5.81 / −6.82 / −8.92% | still +0.20 points of GDP |
| Income tax +10 | −19.9 / −22.3 / −8.9 / +73% | +907 points; exporters' net assets −4615% of GDP |

With the default `phiU`, income tax +2.5 flips to output +24.6% at month 2400. A stock-flow model that behaves like this is missing a stock-flow norm somewhere.

**R2 (new): where the lasting surplus goes.** For income tax +2.5 on Manual with `phiU` 0, net lending by sector (cash and accrual flows in minus out) is measured against the no-change run, in % of GDP, averaged over a year:

| Net lending, % of GDP | Months 229–240 | 589–600 | 1189–1200 | 2389–2400 |
|---|---:|---:|---:|---:|
| Government | +0.07 | +0.07 | +0.07 | +0.44 |
| Pension funds | +0.29 | +0.21 | +0.40 | +0.46 |
| Households | −0.44 | −0.31 | −0.43 | −0.57 |
| Banks | +0.23 | +0.14 | +0.06 | −0.18 |
| Domestic firms | −0.08 | −0.08 | −0.09 | −0.11 |
| Exporters and rest of world | about 0 | about 0 | about 0 | about 0 |

These are cash and accrual flows between sectors. The model's reported government balance (+0.20 points at month 2400 in the table above) is on an accrual basis that also counts the indexation of indexed debt, which under deflation is a gain; so the two measures differ.

Net financial assets by sector, again against the no-change run, in points of each run's GDP. This excludes homes, capital and the "shares" instrument, which never changes in value and so distorts ratios as nominal GDP falls:

| Net financial assets, points of GDP | Month 240 | 1200 | 2400 | Main instruments at month 2400 |
|---|---:|---:|---:|---|
| Government | +13.7 | +32.6 | +68.8 | bonds retired +36.6; treasury cash +32.5 |
| Pension funds | −3.1 | −10.0 | −25.6 | bonds −13.4; foreign assets −6.7; rights owed −4.0 |
| Central bank | −2.0 | −8.5 | −21.9 | treasury account owed −32.5; banks' reserves overdrawn +11.7 |
| Fisheries | −0.9 | −1.8 | −17.5 | loans −17.5 |
| Households | −3.5 | −5.3 | −5.9 | deposits, mortgages |
| Banks | +0.6 | +1.0 | +4.6 | business loans +19.9 (mostly to fisheries); bonds −14.4; reserves −11.7 |

What this shows:

- **The government's claims keep growing, and faster.** Once it has bought back every bond it can, the surplus piles up as idle cash in its treasury account at the central bank (the "buyback limited by holdings" regime). By month 2400 that is 32.5 points of GDP.
- **Three sectors absorb the counterpart, and none of them adjusts its spending.**
  - **The pension funds.** They lose their bonds and their net position falls by 26 points of GDP. The rule that passes gains and losses to members (`lamPFnw`) credits returns to rights, and rights do not enter consumption. R3 put rights into consumption, and it did not help because the effect is small.
  - **The central bank.** It takes the government's cash as a liability (32.5 points). On the other side, banks' reserves go overdrawn (a claim on banks of 11.7 points), and the central bank's own net financial position falls by the rest. Nothing in the model makes the central bank or the government act on that position.
  - **Fisheries.** Their loans grow without limit, because the owners' cash cap is set by the owner with the least cash (E1 found this).
- **In flow terms,** the lasting government surplus is matched by households' lasting net borrowing (about 0.5% of GDP a year), while the pension funds keep saving.
- **In Godley–Lavoie's model** the holder of the government's debt is the household, whose spending falls with its wealth, so income falls until the budget balances. Here the holders are pension funds and banks, and the leak ends in balance sheets with no norm.

**What this means.** Whether Manual's real economy has a steady state is an open question about the model's sector norms, not a law of economics. Before decision record 0013 says anything about (b), three candidate norms should be tested together, to month 2400, with `phiU` 0 and at its default:

1. **A pension-fund funding-ratio rule,** as in Act 129/1997 Art. 39: when the funds' net position is off by more than 10%, or by more than 5% for five years, members' rights or contributions change. It passes the funds' loss to households, whose wealth then falls. R3's rights-in-consumption term makes that reach spending.
2. **The treasury account.** Idle government cash should pay the key rate, or be lent back through a rule, so that the surplus does not simply leave circulation.
3. **E1** (insolvent firms' loans written off, and owners stopping recapitalisation), which removes fisheries' unbounded loans.

The decision rule: if output then settles (a change under 0.3 points between months 1200 and 2400) and the government balance returns to within 0.1 points of GDP, (b) was a missing norm and should be fixed. If not, (b) is a property of this model's sector structure, and decision record 0013 should say so in those words, not as a theorem.

### The earlier experiments, in this light

Ten candidates have now been tested for an anchor. The last two are new, because the critique argued the conclusion might be a calibration artefact.

| Candidate | What it is | Result (Manual, income tax +2.5 unless stated) |
|---|---|---|
| E1 | Insolvent firms' loans written off; owners stop recapitalising | Inert to month 240. With `phiU` 0, output −4.64 / −5.81 / −6.82 / −8.29% at months 240 / 480 / 1200 / 2400. Fixes fisheries' unbounded loans; settles nothing on its own. |
| E2 | Households target wealth as a ratio to disposable income | With `phiU` 0, output −4.61 / −5.91 / −7.01 / −9.05% at months 240 / 480 / 1200 / 2400. No convergence; with `phiU` 1.2 every variant turns explosive after month 1200. Households are not the marginal holders of government debt (R2). |
| E5 | Capacity follows firms' real capital (capital hysteresis) | Held-rate reversal only 1 month later; fails the half-step test |
| B / E6 | Hysteresis in normal unemployment | Bounded, it re-accelerates when the band binds; unbounded, it turns drift into permanent unemployment (+2.9 points, output −7.1% at month 1200) |
| A / E3 | Slow PPP (anchor round) | A real appreciation, not a depreciation, under a held nominal rate |
| D (reference economy) | Extra interest income spent at half the rate | The reversal gets *larger* (+3.60 against +2.97% at month 240): unexplained (R6) |
| **R1** | **The baseline's r − g cut from 3 to 1 point.** The neutral rate `i0` is 1% or 2% instead of 3%, re-solved. | **Not the cause.** At `i0` 1%: output −3.34 / −3.80 / −7.10 / −2.68% at months 240 / 480 / 1200 / 2400. Held +1.75 turns positive in month 144 (137 at `i0` 2%; 131 on main). At `i0` 1%: calibration 31/31, drift 2.2e-12, 205/206 expectations. |
| **R3** | **Pension rights enter consumption** (0.02 a year of rights above normal, working-age and older households) | Output −3.79 / −4.78 / −8.26% at months 240 / 480 / 1200 (main −3.81 / −4.76 / −8.17). The held-rate reversal comes *earlier* (+1.75: month 124). Clean on every gate, but inert alone: R2 shows why (rights barely move). |
| Package (this proposal) | Sub-steps, labour gap, flow-priced króna | Output −3.83% and price level −15.3% at month 240. The income-tax +10 inflation gap no longer grows (1.33 → 0.26 over months 180 → 240). |
| F | A third setting: key rate held, debt rule on | Converges for tax shocks (below). |

### The held key rate: what to teach

The reversal of a held high rate after about 11 years runs through the **interest-income channel of stock-flow models**. With tax rates fixed, the government's higher interest bill is private income, and once enough debt has built up, spending out of it outweighs the higher rate (Godley and Lavoie, model PC; decision 0002 names it this way). Interest reaches households two ways:

- **Directly,** through older households' bonds.
- **Slowly, through the pension funds.** Higher interest raises their income, the credited returns rule passes it to members' rights, and higher rights raise payouts (a fixed payout rate × pensioners' rights).

The reversal is at the **strong end of the evidence**:

- tightening lowers output for more than a decade (Jordà, Singh and Taylor 2024);
- savers who gain interest income spend little of it (Auclert 2019).

Two other theories are **not** what the model shows, and the texts should say so:

- **Fiscal dominance** (Sargent and Wallace 1981; Blanchard 2004) is a real-world route by which a high rate can backfire, through forced monetisation or a default-risk premium that weakens the currency. The model has neither: nothing forces the central bank to monetise, and there is no debt premium (SP-8). The 15% hold explodes through interest compounding on debt with fixed tax rates (r well above g), not through monetisation. The text can say that "in real economies, a debt this large would also raise questions of fiscal dominance, which the model leaves out".
- **The fiscal theory of the price level** (Leeper 1991; Sims 2011; Cochrane 2023) is a contested contrast. Under a held rate with fixed taxes it predicts a *one-time* shift of the price level, after which inflation returns to i − r. It does not predict the model's continuing slide (−44% by month 600). Mention it as the leading theory for this policy mix that the model does not follow, not as agreeing with the model.

### The third setting (prototype F), measured

F adds a stabiliser option: "Key rate held (an interest-rate peg), debt rule on". The key rate is the Manual lever's level, and the debt rule and the income-tax offset set the tax rate, as on Automatic. Manual and Automatic are untouched, and every gate passes as built.

Two fixes the critique asked for change its results:

1. **The escape clause.** It read the unused Taylor rule's suggestion, not the rate actually held. In the combined run it reads the held rate (fix R4).
2. **The theory label.** Under Leeper, an interest-rate peg with a debt-responsive tax is the indeterminate regime, not an anchor. F works here as fiscal demand stabilisation when monetary policy does not act. The general case is Kirsanova, Leith and Wren-Lewis (2009), with Godley and Lavoie (WP 494). The euro area of 2010–13 and Galí and Monacelli (2008) are an **analogy only**. They concern a currency union, an exchange-rate peg, where the terms of trade give a real anchor that a held key rate with a floating króna does not have. Icelandic students know the króna's past exchange-rate pegs, so the interface should always say "key rate held", never "peg" alone.

| Mode 2 ("key rate held, debt rule on") | F as built: months 240 / 480 / 1200 | F with R4: months 240 / 480 / 1200 |
|---|---|---|
| Income-tax offset +2.5: output | −1.39 / −0.85 / −0.21% | same |
| Income-tax offset +2.5: inflation | −0.38 / −0.24 / −0.06 | same |
| Health +3: inflation | +1.48 / +1.21 / +0.74 | same |
| Key rate held at 6%: output | −0.82 / −0.23 / −0.18% | −3.00 / −2.65 / −0.21% |
| Key rate held at 6%: tax change, points | +3.5 / +4.3 / +4.5 | +5.2 / +4.8 / +3.1 |
| Tourism −60, key rate held at 3%: output | −0.69 / −0.47 / −1.35% | −6.26 / −4.88 / −3.82% |
| Tourism −60, key rate held at 3%: tax change, points | +1.8 / +5.6 / +13.5 | +7.7 / +8.3 / +11.2 |
| Key rate held at 15% | explosive | explosive |

- **What F does well.** It pins the debt ratio for tax shocks. It removes the held-rate reversal: no held rate from 4% to 6% turns output positive before month 1200.
- **What it does not do.**
  - It converges over a century, not a decade. Income-tax offset +2.5 is still −0.21% at month 1200.
  - It does not anchor a spending rise. Health +3 still has inflation +0.74 points at month 1200.
  - With the escape clause fixed, a debt rule with the key rate held tightens in a slump: tourism −60 at 3% raises taxes 7.7 points by month 240. So a debt-only rule is not the right fiscal rule when monetary policy does not act. Theory for that case (Kirsanova et al. 2009) calls for a counter-cyclical term with a slow debt term under it.

### Recommendation

1. **Keep Manual exactly as it is.** It is the owner's design.
2. **Write decision record 0013 in two parts.**
   - **(a) No anchor for the price level: by construction.** A held key rate with fixed tax rates has no nominal anchor in a backward-looking stock-flow model. Document it, with the measured long-run Phillips slope (0.8–0.9) against QMM's analogue (0.35–0.7) and the international evidence (about 0.2). Refer the slope, which sets the *size* of the drift, to decision 0008 as a calibration question.
   - **(b) The real economy not settling: open.** Record R2 and the three candidate norms. Do not call it a theorem until the norm test above has run.
3. **Teach it correctly in the texts.** Give the income-tax, VAT, key-rate and stabiliser definitions:
   - **Wicksell:** with the key rate held after a lasting tax rise, the rate is too high for the new economy, so prices keep falling while unemployment stays up.
   - **The held rate:** the interest-income channel of stock-flow models, at the strong end of the evidence (Auclert 2019; Jordà, Singh and Taylor 2024). Fiscal dominance is mentioned only as a real-world route the model does not contain. The fiscal theory is mentioned only as a contested contrast that predicts a one-time level shift, not a trend.
   - **A factual correction.** The key-rate text says pension funds "spend" interest. It should say that interest reaches pensioners slowly, through credited returns and then higher pensions.
   - **The honest limit.** With the key rate held and tax rates fixed, nothing but partial trust in the target anchors prices.
4. **Gate only signs on Manual** (acceptance tests). Reject output bands: the model's own long run has no asymptote.
5. **Add an interface note** when a Manual run holds a lasting lever beyond ten years: that on Manual nothing anchors prices, and effects this far out show an economy without its nominal anchor.
6. **The third setting: a design spike now, a release decision later.**
   - **Spike.** Prototype the rule: the prototype's debt rule plus the escape clause on the held rate (R4, built), a counter-cyclical term on the labour-market gap of section B (so a slump with the key rate held does not bring tax rises), and an error-correcting (PI) debt term (R5), so spending shocks settle within about 20–30 years.
   - **Release, against stated gates** (acceptance tests). Releasing it amends decision 0004, **AGENTS.md model rule 11** ("stabilisers act only in Automatic mode" becomes "act only in the modes that declare them"), and **architecture §3** (two modes become three).
   - **Scope.** The third setting is for the Iceland model only. The reference economy is the Godley–Lavoie teaching model and keeps its two modes. The harness's mode list becomes per model.
7. **Not recommended now:**
   - slow de-anchoring of `chi` (decision 0008 found zero-bound traps; revisit after the third setting exists);
   - fiscal-theory or neo-Fisherian equations;
   - household wealth norms (E2);
   - NAIRU or capital hysteresis for this issue.
8. **Explain D before using it (reference economy, item 10).** Halving the propensity to spend extra interest income made the reversal larger. Decompose it into interest income, the wealth term and the baseline-preserving offset (R6) before interest income is measured in real, Haig–Simons terms.

**Item 16 (benefits on Manual).** Its demand effect wins because nothing on Manual closes the gap. The fix is the missing supply channel: benefits acting through job finding. That belongs to the labour-market work, not to an anchor.

### Effect on the Manual principle

Fully preserved. Nothing in steps 1–5 moves a policy setting. The candidate norms in (b) are behaviour of pension funds, the treasury account and firms, not policy reactions. The third setting is a separate mode that the user chooses; Manual stays the default and stays pure.

### Risks

- **Students may read drift as a bug.** The texts and the interface note are the mitigation.
- **Signs are weak gates.** The tripwires carry the magnitudes.
- **An ungated third mode would be a user-facing path with no regression gate.** It must not ship before its gates exist.
- **A debt-only fiscal rule with the key rate held is procyclical** (tourism −60 above). Shipping F as built, even with R4, would teach austerity as the anchor. The counter-cyclical term is required, not optional.
- **The pension-fund norm is Icelandic law, but its calibration is not.** Art. 39 gives the trigger bands, not the speed or split between rights and contributions. Those would be assumed.

### Acceptance tests

- **Manual signs.**
  - Income tax +2.5: output below baseline over months 1–240.
  - VAT +2.5: price level up over months 1–36. The long-run sign stays ungated.
  - Key rate held 3 points higher: output down over months 1–96. In the package the 6% hold turns output positive in month 126 (124 on main), so a gate to month 120 would be six months from flipping.
- **Tripwires** (module tests, which can use longer runs and bounds):
  - **The held-rate reversal month.** For the 6% hold on Manual it lies in months 110–160, pinned with its reason (the interest-income channel). The package gives 126.
  - **No growing inflation gap within 240 months on Manual.** The first revision's rule, "the change in inflation over months 180–240 stays below 0.5 points", also catches inflation *returning* toward zero. pfForeign −20 fails it in the package (+0.68), but its inflation gap is shrinking, from −0.97 to −0.29. The tripwire is re-specified as: the *absolute* inflation gap grows by less than 0.5 points between months 180 and 240, for every lever extreme except the 15% key rate, which is documented as interest compounding on fixed tax rates. Measured over every lever at its minimum and maximum:

    | Largest growth of the inflation gap, months 180 → 240 | Main | Package |
    |---|---|---|
    | Excluding the 15% hold | 1.33 (income tax +10) | 0.34 (public investment −3) |
    | The 15% hold | 1.44 | 2.12 |

  - **The debt ratio** after income tax +2.5 on Manual, pinned at month 240 as a known limitation.
  - **Exporters' net assets** (capital plus deposits minus loans; not net worth including "shares") stay above zero to month 600.
- **The norm test for (b),** as specified above, before decision record 0013's part (b) is written.
- **Third setting** (before release):
  - output within 0.1% and inflation within 0.05 points of baseline by month 1200 for the lasting tax and spending levers and tourism ±15;
  - no held rate from +1 to +3 points turns output positive before month 480;
  - the escape clause is active only when the held rate is at or below `escapeBand`;
  - with the key rate held at 3%, tourism −60 raises taxes by no more than the counter-cyclical term allows.

### Implementation steps

1. Write decision record 0013, part (a), with the slope table and the experiment table. Part (b) records R2 and the pending norm test.
2. Rewrite the texts: income tax, VAT, key rate held, stabilisers, and the reference economy's held rate. Update lever-vetting items 3, 10, 16, 20 and TAX-2.
3. Add the Manual sign expectations and the tripwires.
4. Add the interface note for long Manual holds.
5. Run the norm test for (b): the pension-fund funding-ratio rule with R3, the treasury-account rule and E1, to month 2400.
6. The third-setting spike (if approved), then its release decision.
7. R6 in the reference economy; then decide on real (Haig–Simons) interest income there.

---

## Interactions

The combined runs measured these directly. Each interaction is listed with what it means for the order of work.

| # | Interaction | Measured | Consequence |
|---|---|---|---|
| 1 | **Time-stepping moves every calibration check.** | Every check moves toward its dt → 0 limit by about half its monthly error at N=2. The Richardson gate exposes fixes that are in range only because of the step (item 14's wage-back-consumption, about 0.255 on its own and 0.27–0.30 in the package). | Land A first. Every later calibration is done once, on the converged model. |
| 2 | **The strength of the rule's response to slack trades long-run gaps against the first-year response to wage settlements.** | At 1.6: health +3 residual +0.17, but the key rate at month 12 after +10% wages is about +0.10 on its limit. At 0.8: +0.30 and about +0.59. Main: +0.62 and +0.94. | Land B at 0.8. Raise it only with item 14. |
| 3 | **Item 14 conflicts with the wage checks in the combined model.** | With item 14, the key rate at month 12 is back to about +0.93. But every setting tried leaves wage-key-rate-peak above 1.5 or wage-back-consumption's limit above 0.25. | A joint refit (phase 5), not a follow-up line. |
| 4 | **The labour gap and the flow-priced króna both raise the year-1 fiscal multiplier.** | fiscal-output-year1: main 0.532; sub-steps 0.537; labour gap 0.567; króna A 0.575; together 0.598–0.610 depending on `aY` and `pbFlow`. D5b on top gives 0.600. | Record it as an edge. If it leaves the range, investigate the multiplier's path, not the króna horizon. |
| 5 | **The labour gap and the flow term together cause the item-4 regression.** | Lending appetite +3, Automatic, real rate over months 12–36: main +0.02; labour gap +0.09; króna stage 1 +0.08; package +0.13. | Carry-netted flow term, plus item 14's timing. A release blocker for stage 1. |
| 6 | **The króna fix helps Manual, but cannot anchor it.** | Income tax +10: output −18.9 → −14.7% at month 240; the inflation gap's growth over months 180 → 240 is 0.26 points, against 1.33. Income tax +2.5: price level −15.8 → −15.3%. D5b on Manual reverses after month 240 (price level −6.4% at month 600). | Judge base drift on Automatic. Manual's drift is issue D's, and the texts own it. |
| 7 | **The labour gap and the zero bound.** | Health −3: months at zero 178 → 215. Tourism −60: 234 → 199. | Item 19 starts by giving the floor Iceland's room. |
| 8 | **The third setting and the escape clause.** | Reading the held rate (R4) changes mode 2 a lot: a 6% hold costs 3.0% of output at month 240 (was 0.8%). Tourism −60 with the key rate held at 3% brings 7.7 points of tax rises. | The third setting needs its own rule design; F as built would mislead. |
| 9 | **The labour gap raises the debt cost of public spending on Automatic.** | Health +3: debt +48.6 points at month 240 against +38.1; the key rate is +3.9 against +2.5 points. | An owner decision (decision 5). The real-exchange-rate channel (króna stage 2) should carry part of the adjustment later. |

### Gate results of the combined runs

"Module tests" are the harness's own layer; "unit tests" are `bun test`.

| Gate | Main | Package (`aY` 0.5, N=2) | Package at `aY` 1 (first revision) | Package + item 14 (`aY` 1.1) |
|---|---|---|---|---|
| Accounting, drift | pass (drift 7.6e-12) | pass (3.4e-12) | pass (3.4e-12) | pass (3.4e-12) |
| Calibration | 31/31 | 31/31 (edges: fiscal-output-year1 0.598, wage-key-rate-peak 1.47) | 31/31 | 30/31 (wage-back-consumption 0.269) |
| Half-step | old rule: share 0.92 | worst share 0.40; 0 limits out | 0.40; 0 out | 0.68; 1 limit out |
| Lever expectations | 206/206 | 204/206 (tourism −15 residual, fish year 1) | 204/206 (fish year 1, migration government balance) | 203/206 |
| Lever report | 0 broken runs | 0 broken runs | 0 broken runs | not run |
| Module tests | 53/53 | 45/53 (7 assume one step a month; 1 on pension-fund pace) | 45/53 | 45/53 |
| Golden scenarios | 34/34 | 0/34 (must be regenerated; new indicator) | 0/34 | 0/34 |
| Unit tests | all but the speed test under load | 29 named failures (below) | 28 named failures | not run |

### Flag-by-flag comparison of the lever report (main → package)

Model rule 12 requires every new flag to be explained. Counts exclude "Regimes" and "Unsettled", which record, rather than flag, behaviour.

| Change | Flags | Explanation | Action |
|---|---|---|---|
| **New Flicker (18)** | 17 on firms' dividends ("Pays out spare cash": dividendsFC, FR, XF, XT, XO), under many levers; 1 on non-residents' bond purchases (pfForeign −20, Automatic) | Sub-steps sample a knife-edge regime (`spare > 1e-9`) while deposits hover at their target. The bond-purchase one is the carry trade's cap switching as the flow term moves the króna. | Condition 2 of section A (exponential deposit-target rule). The bond-purchase flicker gets a material threshold. |
| **New Explosive (4)** | Aluminium smelters' real profits after health or education +0.8 on Automatic (−5.6% and −9.9% at month 240, still moving); CPI after aluminium price +40 on Manual (−2.7% at month 240); investment after pfForeign −20 on Automatic (+1.8%) | Smelters: the higher key rate keeps the real króna stronger for longer, and smelters' profits are in foreign currency; similar flags existed on main for the ±3 levers. CPI: Manual's missing anchor (issue D). Investment: slow neutral-rate learning of a small gap. | Explained. The smelter drift closes when króna stage 2 moves the equilibrium real rate. |
| **New Extreme (1)** | Exporters' real profits +56.6% at month 12 after world prices +40, Automatic | The flow term weakens the króna further when import prices jump, and exporters' prices are in foreign currency. Manual already had this flag (+67.6%). | Explained; a 40% price shock is extreme by design. |
| **Changed Extreme: public spending on Automatic** | Debt at month 240 after +3% of GDP: health +38.1 → +48.6, education +36.5 → +49.6, other services +40.4 → +46.9, public investment +40.4 → +42.3 points | The labour-market gap reads the labour scarcity, the key rate is higher, and the interest bill slows the debt rule. | Owner decision 5. |
| **New Mode sign (6)** | VAT ±2.5 and ±10: investment moves in opposite directions on the two modes; benefits ±30: the króna and investment | On Automatic the rule now reads unemployment, so it responds to these levers differently from Manual, where it only suggests. The effects are 0.02–0.56% and fade. | Explained in the lever texts. |
| **Gone** | 33 Mode sign, 2 Explosive (fish −30 CPI on Manual; tourism +30 CPI on Manual), 1 Extreme (pfForeign −20 debt on Manual) | The króna now weakens after export losses on Manual as on Automatic. | – |

### Unit tests (`bun test`), by class

The first revision reported "31 failures" from a run on an intermediate commit. Rerun on the package at `aY` 1, `bun test` reports 30 failures: 28 named tests, plus two interface test files that could not load React in the throwaway copy (an environment gap, not a model result). The recommended package adds one named failure: the MON-11 investment-timing tripwire.

| Class | Tests | How each is rewritten without weakening it |
|---|---|---|
| **One kernel step a month (15)** | GDP over the past 12 months; the debt charts and debt rule divided by it; the debt ratio's treasury-cash netting; the ledger's net-worth row against the balance sheets; MON-2 "one smoothed step" (×3: the calibration file, the central-bank module, the tax-rule switch); the debt rule counted once; the LTV cap's first-month magnitudes; indexation moves no deposits; a bank mortgage creates deposits; the funds' foreign revaluation without payment; firms' deposit target; the government's buyback shares; reserve income at once (L13) | Flows × dt = change in stock becomes a sum over sub-steps. "One smoothed step" becomes N compounded sub-steps. First-month magnitudes compare month totals. |
| **The speed test (1)** | 250 µs per shocked month | 250 × N µs (section A). |
| **Tripwires the package moves (12)** | E6 pass-through (0.355 vs < 0.35); FX-1 broad money (11.3 vs < 10); FX-4 real króna in a carry boom (3.8e-6 vs ≤ 1e-6); pfForeign ±20 asymmetry (1.83 vs < 1.5); income tax +10 króna within a fifth of parity; MON-1 reversal month (138 vs ≤ 136); MON-11 investment trough timing (package only); the world-price wage gap (0.00061 vs < 0.0005); LAB-2 give-back (2.012 vs < 2); M6 non-residents' króna loans (3.22 vs ≤ 3.18); the funds' overdraft known gap (no longer occurs by month 300); the pension funds' foreign-allocation pace (+20: 8.8 points at month 12 vs about 7.5) | Each is restated against the converged value, with its reason. FX-4 and the item-4 tripwire are restated only after the item-4 fix; they must not be loosened to pass. LAB-2 stays a known gap (section A, condition 4). |
| **Housekeeping (1)** | Every parameter declared once: `betaH` and `fxDepth` left declared | Remove them (stage 1). |

## Recommended order of work

Each phase is a branch of its own. Each is reviewed, passes the harness and a clean lever report, regenerates the goldens deliberately, and has its decision record. Sizes are rough: S is up to 3 days of work and review, M is 1–2 weeks, L is 3 weeks or more.

| Phase | Work | Depends on | Record | Size | Main risk |
|---|---|---|---|---|---|
| 0 | The owner's decisions (below) | – | – | – | – |
| 1 | Time-stepping: sub-steps, the new half-step test, signed wage-back measures, the dividend fix, the display contract (month totals, per-step terms, lags, regimes, wording), budgets | – | 0010 | L | The display contract touches the kernel, the ledger, pipes and legs, the influence panels, about 15 failing tests, 34 goldens and about 134 text phrases. |
| 2 | Potential: the labour-market gap at 0.8, the month-12 wage tripwire, the tourism −15 re-specification, the implied-neutral-rate diagnostic, the indicator rename, texts, provenance notes | 1 | 0011 | M | Thin calibration margins (fiscal-output-year1 0.598, wage-key-rate-peak 1.47, wage-price-level-6y 3.11). |
| 3 | Króna stage 1: flow-priced portfolio term (`pbFlow` 0.008), reserve target in foreign currency, **the item-4 fix (blocker)**, the bound's regime label, the fish re-specification, tripwires, provenance, removal of `betaH` and `fxDepth` | 1, 2 | 0012 | M | The item-4 fix may move rate-krona and the fiscal multiplier again. |
| 4 | Manual documentation: decision record 0013 part (a), texts, sign expectations, tripwires, interface note | 3 (the inflation-gap tripwire needs it) | 0013 (a) | S | Low. |
| 5 | Joint refit: item 14's factor substitution, the slack strength, `lamC`, the wage-price feedback, and a rerun of decision 0007's joint search (rate-krona), against every wage check and the month-12 tripwire | 1–3 | amend 0009 and 0011 | M–L | No setting tried so far passes; it may need new economics (the consumption response to interest income, item 10). |
| 6 | The norm test for Manual's real economy (b): pension-fund funding-ratio rule with R3, the treasury-account rule, E1 | 4 | 0013 (b) | M | It may settle the real economy only slowly, or not at all. Either answer is recorded. |
| 7 | Third setting (if approved): design spike (R4, counter-cyclical term, PI debt term); then, on a release decision, the three-mode harness and gates, rule 11 and architecture §3, interface | 2, 4 | amend 0004 | M (spike), L (release) | A procyclical or slow rule taught as "the anchor". |
| 8 | Króna stage 2 (item 17): experiments H1–H4, then the resident foreign-currency home, the closure on total net foreign assets, an endogenous equilibrium real rate, and the persistence refit | 3 | 0014 | L | New instruments and closures; the balance-sheet tests. |
| 9 | Later: zero bound (Iceland's room first, then make-up if still wanted); foreign-currency liabilities (item 1, data project); capital-based accelerator and the markup's capacity; a growth habit for item 6; benefits through job finding (item 16); real interest income in the reference economy (item 10, after R6) | as noted | own records | L in total | Data availability for item 1. |

## Decisions for the owner

| # | Decision | Recommended answer |
|---|---|---|
| 1 | Keep Manual pure, and accept that its **price level** has no anchor by construction, documented and gated by signs only? | **Yes.** A held key rate with fixed tax rates has no nominal anchor; a hidden reaction would break the design. |
| 2 | Treat Manual's **real economy** not settling as an open model property, and run the norm test (pension-fund funding ratio, treasury account, E1) before writing it down as a fact? | **Yes.** R2 shows where the surplus goes; Godley and Lavoie's own result says a fixed-tax-rate economy should settle in real terms. |
| 3a | Approve a design spike for a third, opt-in setting, "Key rate held, fiscal rule on"? | **Yes.** It is the correct way to teach that with the key rate held, fiscal policy has to stabilise. |
| 3b | Release it? | **Decide later,** against the gates in section D. Releasing amends decision 0004, model rule 11 and architecture §3. Iceland model only; Manual stays the default. |
| 4 | Sub-steps per month, and the run-time budgets? | **N=2,** with the budgets in section A (250 × N µs a month; a 240-month fork under 100 ms; a seek under 20 ms; the harness at most twice main's time). N=4 only if the fork budget is relaxed or the engine moves off the main thread. |
| 5 | Accept that, on Automatic, public-spending levers now show larger output losses and more debt (health +3: output −2.5%, debt +48.6 points at month 240), while the real-exchange-rate channel is missing? | **Yes, with the lever texts saying so.** The alternative, keeping the old gap until the króna work carries part of the adjustment, keeps a gap that reads the wrong sign. |
| 6 | Replace the half-step test with the range-width rule and a Richardson limit that must lie in range? | **Yes.** |
| 7 | Define the policy gap and displayed potential from the labour market, at the strength the CBI's rule implies (0.8), and revisit the strength only in a joint refit with item 14? | **Yes.** |
| 8 | Adopt a make-up commitment at the zero bound now? | **No.** First give the floor Iceland's room (a 2.5% target in the start-from-today baseline, or a diagnostic offset); then decide make-up, re-specified, in the same record. The CBI has no such commitment. |
| 9 | Target lasting base drift after a one-off króna shock, with a real half-life near QMM's 24–40 months? | **Yes** (stage 2), gated on Automatic, with the price level at month 480 gated by sign until a QMM run of a lasting premium shock is obtained. On Manual only the sign to month 240 is gated. |
| 10 | Re-specify three expectations, with the reasons recorded (model rule 12)? tourism −15 as a decaying cycle; fish +30 as three real tests with year-1 output kept as a reported ambiguous case; the migration government-balance expectation scoped to Manual if it fails again | **Yes.** |
| 11 | Lower the baseline's neutral rate (r − g) to cure the Manual drift? | **No.** R1 shows it does not settle Manual. Revisit the neutral rate and a 2.5% inflation target in the start-from-today work. |
| 12 | Refer the steepness of the long-run Phillips curve (0.8–0.9, against QMM's 0.35–0.7) to decision 0008's calibration? | **Yes.** It sets the size of the Manual drift; it is not an anchor. |
| 13 | Build foreign-currency liabilities (item 1)? | **Yes, as a data project** after stage 1. Not before CBI and IMF balance-sheet data are in hand. |

## References

**Numerics**

- Aadland, D. and K. Huang (2004), Consistent high-frequency calibration, *Journal of Economic Dynamics and Control* 28(11). https://www.sciencedirect.com/science/article/abs/pii/S0165188903002070
- Christiano, L., M. Eichenbaum and C. Evans (2005), Nominal rigidities and the dynamic effects of a shock to monetary policy, *JPE* 113(1). https://www.journals.uchicago.edu/doi/abs/10.1086/426038
- Fuhrer, J. (2000), Habit formation in consumption and its implications for monetary-policy models, *AER* 90(3). https://www.aeaweb.org/articles?id=10.1257/aer.90.3.367
- Gottlieb, S., C.-W. Shu and E. Tadmor (2001), Strong stability-preserving high-order time discretization methods, *SIAM Review* 43(1). https://doi.org/10.1137/S003614450036757X
- Hairer, E., C. Lubich and G. Wanner (2006), *Geometric Numerical Integration*, 2nd ed., Springer. https://link.springer.com/book/10.1007/3-540-30666-8
- Hairer, E., S. Nørsett and G. Wanner, *Solving Ordinary Differential Equations I*, Springer. https://link.springer.com/book/10.1007/978-3-540-78862-1
- Keen, S., Minsky software, `engine/rungeKutta.cc`. https://github.com/highperformancecoder/minsky
- Romanchuk, B. (2024), In defence of discrete time models. https://bondeconomics.substack.com/p/in-defence-of-discrete-time-models

**Potential output and policy rules**

- Ball, L., D. Leigh and P. Loungani (2017), Okun's law: fit at 50?, *Journal of Money, Credit and Banking* 49(7) (NBER w18668). https://www.nber.org/system/files/working_papers/w18668/w18668.pdf
- Bernanke, B., M. Kiley and J. Roberts (2019), Monetary policy strategies for a low-rate environment. https://www.federalreserve.gov/econres/feds/files/2019009pap.pdf
- Carlin, W. and D. Soskice (2015), *Macroeconomics: Institutions, Instability, and the Financial System*, OUP.
- Central Bank of Iceland, *Monetary Bulletin* 2021/2, Box 3. https://cb.is/library/news-and-publications/publications/monetary-bulletin/2021/may/PM212_R3.pdf
- Cerra, V., A. Fatás and S. Saxena (2023), Hysteresis and business cycles, *Journal of Economic Literature* 61(1). https://www.aeaweb.org/articles?id=10.1257%2Fjel.20211584
- Coibion, O., Y. Gorodnichenko and M. Ulate (2018), The cyclical sensitivity in estimates of potential output, *BPEA*. https://www.brookings.edu/wp-content/uploads/2018/09/BPEA_Fall2018_The-Cyclical-Sensitivity-in-Estimates-of-Potential-Output.pdf
- Daníelsson, Á. et al. (2011), *QMM: A Quarterly Macroeconomic Model of the Icelandic Economy*, v2.1, Central Bank of Iceland. https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf
- Eggertsson, G. and M. Woodford (2003), The zero bound on interest rates and optimal monetary policy, *BPEA*.
- Galí, J. (2011), The return of the wage Phillips curve, *JEEA* 9(3).
- Holston, K., T. Laubach and J. Williams (2017), Measuring the natural rate of interest, *Journal of International Economics* 108. https://www.sciencedirect.com/science/article/pii/S0022199617300065
- IMF (2025), Iceland: 2025 Article IV, Box 1, Assessing the neutral real policy rate. https://www.imf.org/-/media/files/publications/cr/2025/english/1islea2025001-print-pdf.pdf
- Jordà, Ò., S. Singh and A. Taylor (2024), The long-run effects of monetary policy, *REStat* (NBER w26666). https://www.nber.org/papers/w26666
- Kiley, M. and J. Roberts (2017), Monetary policy in a low interest rate world, *BPEA* Spring 2017.
- Laubach, T. and J. Williams (2003), Measuring the natural rate of interest, *REStat* 85(4).
- OECD (2025), *OECD Economic Surveys: Iceland 2025*. https://www.oecd.org/en/publications/oecd-economic-surveys-iceland-2025_890dbe05-en.html
- Orphanides, A. and S. van Norden (2002), The unreliability of output-gap estimates in real time, *REStat* 84(4).
- Orphanides, A. and J. Williams (2002), Robust monetary policy rules with unknown natural rates, *BPEA*.
- Reifschneider, D. and J. Williams (2000), Three lessons for monetary policy in a low-inflation era, *JMCB* 32(4).
- Rudebusch, G. (2009), The Fed's monetary policy response to the current crisis, *FRBSF Economic Letter* 2009-17.

**The króna**

- Blanchard, O., F. Giavazzi and F. Sa (2005), International investors, the U.S. current account, and the dollar, *BPEA*. https://www.nber.org/papers/w11137
- Branson, W. (1977), Asset markets and relative prices in exchange rate determination, *Sozialwissenschaftliche Annalen* 1.
- Burstein, A., M. Eichenbaum and S. Rebelo (2005), Large devaluations and the real exchange rate, *JPE* 113(4).
- Cheung, Y.-W., K. Lai and M. Bergman (2004), Dissecting the PPP puzzle, *Journal of International Economics* 64(1).
- Clark, P. and R. MacDonald (1998), Exchange rates and economic fundamentals: the BEER and FEER approaches, IMF WP 98/67.
- Corden, W. M. and J. P. Neary (1982), Booming sector and de-industrialisation in a small open economy, *Economic Journal* 92(368).
- Edwards, S. and L. Cabezas (2022), Exchange rate pass-through, monetary policy, and real exchange rates: Iceland and the 2008 crisis, *Open Economies Review* (CBI WP85). https://pmc.ncbi.nlm.nih.gov/articles/PMC8743165/
- Engel, C. (2016), Exchange rates, interest rates, and the risk premium, *AER* 106(2).
- Gabaix, X. and M. Maggiori (2015), International liquidity and exchange rate dynamics, *QJE* 130(3).
- IMF (2024), Iceland: Selected Issues, Country Report 24/222. https://www.imf.org/en/-/media/files/publications/cr/2024/english/1islea2024002-print-pdf.pdf
- Itskhoki, O. and D. Mukhin (2021), Exchange rate disconnect in general equilibrium, *JPE* 129(8).
- Kouri, P. (1976), The exchange rate and the balance of payments in the short run and in the long run, *Scandinavian Journal of Economics* 78(2).
- Lane, P. and G. M. Milesi-Ferretti (2004), The transfer problem revisited, *REStat* 86(4).
- Phillips, S. et al. (2013), The External Balance Assessment (EBA) methodology, IMF WP 13/272.
- Rogoff, K. (1996), The purchasing power parity puzzle, *Journal of Economic Literature* 34(2).
- Sarno, L. and M. Taylor (2002), *The Economics of Exchange Rates*, CUP.
- Schmitt-Grohé, S. and M. Uribe (2003), Closing small open economy models, *Journal of International Economics* 61(1).
- Svensson, L. (1999), Price-level targeting versus inflation targeting: a free lunch?, *JMCB* 31(3).

**Manual: the anchor and the real economy**

- Act on Mandatory Pension Insurance and on the Activities of Pension Funds, No. 129/1997, Art. 39.
- Akerlof, G., W. Dickens and G. Perry (2000), Near-rational wage and price setting and the long-run Phillips curve, *BPEA*.
- Auclert, A. (2019), Monetary policy and the redistribution channel, *AER* 109(6).
- Blanchard, O. (2004), Fiscal dominance and inflation targeting: lessons from Brazil, NBER w10389.
- Blanchard, O. (2016), The Phillips curve: back to the '60s?, *AER P&P* 106(5).
- Carvalho, C., S. Eusepi, E. Moench and B. Preston (2023), Anchored inflation expectations, *AEJ: Macro* 15(1).
- Cochrane, J. (2018), Michelson-Morley, Fisher, and Occam: the radical implications of stable quiet inflation at the zero bound, *NBER Macroeconomics Annual 2017*.
- Cochrane, J. (2023), *The Fiscal Theory of the Price Level*, Princeton.
- Debortoli, D., J. Galí and L. Gambetti (2019), On the empirical (ir)relevance of the zero lower bound constraint, NBER w25820.
- Friedman, M. (1968), The role of monetary policy, *AER* 58(1).
- Galí, J. and T. Monacelli (2008), Optimal monetary and fiscal policy in a currency union, *Journal of International Economics* 76(1).
- Godley, W. and M. Lavoie (2007), Fiscal policy in a stock-flow consistent (SFC) model, Levy WP 494. https://www.levyinstitute.org/pubs/wp_494.pdf
- Godley, W. and M. Lavoie (2007), *Monetary Economics*, Palgrave Macmillan.
- Hazell, J., J. Herreño, E. Nakamura and J. Steinsson (2022), The slope of the Phillips curve: evidence from U.S. states, *QJE* 137(3).
- Kirsanova, T., C. Leith and S. Wren-Lewis (2009), Monetary and fiscal policy interaction: the current consensus assignment in the light of recent developments, *Economic Journal* 119(541).
- Leeper, E. (1991), Equilibria under 'active' and 'passive' monetary and fiscal policies, *Journal of Monetary Economics* 27(1).
- Pétursson, T. G., Disinflation and improved anchoring of long-term inflation expectations: the Icelandic experience, CBI Working Paper 77. https://ideas.repec.org/p/ice/wpaper/wp77.html
- Sargent, T. and N. Wallace (1975), 'Rational' expectations, the optimal monetary instrument, and the optimal money supply rule, *JPE* 83(2).
- Sargent, T. and N. Wallace (1981), Some unpleasant monetarist arithmetic, *FRB Minneapolis Quarterly Review* 5(3).
- Sims, C. (2011), Stepping on a rake: the role of fiscal policy in the inflation of the 1970s, *European Economic Review* 55(1).
- Wicksell, K. (1898), *Interest and Prices*.
