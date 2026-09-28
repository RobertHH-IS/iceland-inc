# Iceland Inc. architecture

Iceland Inc. is a platform for building an explorable economy. It is not a single hard-coded model. This document explains the shape of the platform and why each choice was made, so that people can add players, flows, rules, levers and charts without weakening what already works.

## 1. The paradigm in one paragraph

The economy is **money flowing between the balance sheets of players**: households, firms, banks, the central bank, government, pension funds and the rest of the world. Every flow is recorded twice, as a minus for the payer and a plus for the payee, in the tradition of Wynne Godley's transaction matrices and Steve Keen's Minsky software. Stocks (deposits, loans, bonds, homes) change **only** because flows post to them. *Behaviour* decides how big each flow is. *Accounting* decides where the money goes and guarantees that nothing leaks. The user pulls a lever, and the machine keeps running while the change filters through the flows until the system settles.

## 2. Design principles

1. **Flows are first-class.** Everything that happens is a flow with legs (payer → payee). Pipes on the map, ledger rows and balance-sheet changes are all views of the same leg data.
2. **The model is declared; the kernel runs it.** Model authors write data and small pure functions (`src/core/types.ts`). The kernel compiles, validates, schedules and runs them, and knows nothing about Iceland.
3. **One rule per variable.** Every endogenous variable has exactly one determining rule, tagged `IDENTITY`, `CONTRACT`, `BEHAVIOUR` or `POLICY`. The compiler rejects duplicates and missing rules. Published results, such as "a 1 pp hike lowers output 0.4% after five quarters", are calibration *checks*, never extra equations.
4. **Explainable by construction.** Rules are written as named, additive *terms*: "Higher key rate", "Higher incomes", "Debt-service cap binds". Because the kernel records every term every month, "what is driving this flow right now?" has an exact answer inside each rule, not a guess reconstructed afterwards.
5. **Ideas are data.** Every rule, term, flow and lever can point to *concepts*, such as endogenous money, markup pricing, the Taylor rule or the credit impulse. The interface can then say which economic ideas are doing the work at this moment.
6. **Accounting is enforced, not trusted.** Stocks cannot be written directly. Every step, the kernel checks that:
   - flows sum to zero;
   - every instrument balances across holders and issuers;
   - every change in net worth equals saving plus revaluations;
   - every stock change is explained by cash, accrual, revaluation and write-off postings.
7. **The baseline is computed.** A steady state is *solved*: closed-form where a module provides it, then polished with Newton. It is published as an output, and the harness fails if it drifts over 20 years.
8. **Deterministic, replayable, forkable.** The state is plain data and a scenario is a list of lever events. The same scenario always gives the same numbers. That makes time travel, shareable scenarios, video rendering and honest counterfactuals possible: counterfactuals compare shocked and unshocked runs *within the same model variant*.
9. **Modules compose the economy.** Players, instruments, flows, rules, levers, indicators, concepts and tests arrive together in modules. A more detailed module replaces a simpler one explicitly (`replaces`), so growth is additive and reviewable.
10. **Provenance everywhere.** Every parameter says whether it is data (with source and vintage), calibrated, derived, assumed or a placeholder. The interface shows this next to each rule.
11. **The interface is generic.** The flow map, levers, charts, ledger, balance sheets and inspector are all generated from the compiled model. A new module appears in the interface without interface code, with optional layout hints.
12. **Few dependencies, pinned by age.** TypeScript on Bun, Preact for the interface, and nothing else in the kernel. Packages must be at least 7 days old (`bunfig.toml`, `.npmrc`).

## 3. The model language

All types live in `src/core/types.ts`. In brief:

| Concept | What it is | Example |
|---|---|---|
| **Player** | A sector with a balance sheet and a way of paying (`settlement`) | Young households (18–34), exporters, the central bank |
| **Group** | Players drawn together on the map | Households = young + working-age + older |
| **Instrument** | A stock: financial (someone's asset and someone's liability) or real | Deposits, CPI-indexed mortgages, government bonds, homes |
| **Variable** | A named quantity with a unit | Key rate, CPI, the wage bill of exporters |
| **Rule** | The one equation that sets a variable: terms (additive), a combine (e.g. `min`), optional gradual adjustment, a regime label | Desired mortgage lending = Σ terms; actual = min(desired, debt-service cap, loan-to-value cap) |
| **Flow** | A transaction type with a *posting* and *legs* (payer → payee, each with its own amount variable) | Wages: exporters → young households, exporters → working-age households, … |
| **Posting** | How a leg changes balance sheets: `transfer`, `purchase`, `issue`, `redeem`, `trade`, `accrue`, `revalue`, `writeoff` | A bank `issue` of a mortgage creates a deposit; a pension-fund `issue` moves an existing one |
| **Lever** | A setting or one-off shock with a precise definition | Key-rate add-on (pp, persistent); wage settlement (one-off level shift) |
| **Indicator** | A chart series computed from variables and stocks, with a display transform | Broad money, % vs baseline |
| **Concept** | An economic idea with a plain-English explanation and references | "Loans create deposits" (Bank of England 2014) |
| **Module** | A bundle of all of the above, plus its own tests | `pensions/funded`, `government/cofog-channels` |

### Why legs carry their own amounts

In engine v1, multi-payer, multi-payee rows were split between pairs *after the fact*, in proportion to shares. Here each leg (for example exporters → young households for wages) has its own amount variable, set by its own rule, usually from a rule family. That gives three things for free:
- pipes are exact;
- clicking a pipe leads straight to the rules behind it;
- the influence graph runs from a pipe to its rule, its terms, their inputs and back to the lever.

### Why terms, and what "influence" means

A rule such as

```
desired consumption = 0.9 × disposable income + 0.03 × liquid wealth − 0.3 × real rate × debt + 0.5 × new borrowing
```

is declared as four terms. Each month the kernel stores each term's value. The inspector shows how much each term has changed from its baseline value, and for additive rules those changes sum *exactly* to the change in the desired value. That is an honest, within-equation decomposition.

It is **not** a system-wide decomposition. The question "how much of the fall in output is due to the credit channel?" needs a counterfactual: run the model with that channel switched off, both shocked and unshocked, and compare. Those comparisons do *not* add up to 100% when channels interact, and the interface labels them "with / without this channel", never as a waterfall.

Non-additive rules (a `min` of caps, a product) set `nonAdditive: true`. They show each term's value and the active regime ("Debt-service cap binds"), not a sum.

## 4. The runtime

### 4.1 Compilation

`compile(modelDef)`:
1. merges modules and applies `replaces`;
2. checks that ids are unique and every reference resolves;
3. enforces one rule per endogenous variable;
4. builds the same-step dependency graph from `inputs`, finds its strongly connected components and orders them;
5. marks blocks with loops as *simultaneous*.

Lagged inputs never create loops, so gradual adjustment is also the cheapest way to keep a model explicit. The compiler warns about unused parameters, variables without history, levers bound to nothing and concepts referenced but not defined.

### 4.2 One step (one month)

1. Apply the lever events scheduled for this month (settings change parameters or exogenous variables; one-offs call `fire` through the restricted `ShockApi`).
2. Evaluate the schedule in order. Simultaneous blocks are solved by Gauss–Seidel iteration to tolerance, with Newton as a fallback. Record every term, the desired value and the regime.
3. Post every leg (amount × dt) through the **payment system** and the posting rules.
4. Run the accounting checks.
5. Record history: variables, legs, terms and indicators. Take a full-state snapshot every 12 months for fast `seek`.

### 4.3 The payment system

Every cash leg settles according to each side's `settlement`:
- **Non-bank to non-bank** (both `deposits`): deposits move between holders, and the bank's deposit liability is unchanged in total.
- **Non-bank to bank:** the payer's deposit shrinks, and so does the bank's liability (money is destroyed, as when a loan is repaid).
- **Bank to non-bank:** the bank credits a deposit (money is created, as when a bank lends or pays interest).
- **Anything involving the government or central bank:** reserves and the treasury account move at the central bank, and the bank passes the payment on to its depositors.

Because this is implemented once, *money creation is never computed by a formula*. It emerges from who pays whom. The same mortgage creates money when a bank lends it and moves existing money when a pension fund does. Government deficits create money when banks or the central bank buy the bonds, and move existing money when pension funds or savers buy them.

### 4.4 Accounting checks (every step, tolerance 1e-9)

| Check | Meaning |
|---|---|
| Flow balance | Every flow's legs sum to zero by construction; row sums are re-checked on the posted values |
| Instrument balance | For every financial instrument, the sum held as assets equals the sum owed as liabilities |
| Net worth | Each player's change in net worth equals its income minus spending on current and capital account, plus revaluations. Financial transactions change composition, not net worth |
| Stock reconciliation | Every position's change equals cash + accrual + revaluation + write-off postings for that position |

### 4.5 Baseline

The steady-state spec gives:
- initial stocks;
- a list of free parameters;
- the same number of targets, such as "mortgage debt = 72% of GDP" or "deposits of older households = 42% of household deposits".

The kernel first uses the module's closed-form solver if there is one. It then polishes with damped Newton on the fixed-point condition *state(t+1) = state(t)* plus the targets. The solved baseline, including every flow, is written to a report.

The engine is ready for a **balanced-growth baseline**. Variables carry a `scale` of `nominal`, `real` or `none`, so the solver can work on ratios to nominal GDP. That is needed for real growth with 2.5% inflation (roadmap v2), which also fixes v1's overstated pension payouts.

### 4.6 Scenarios, time travel and counterfactuals

- A **scenario** is `{events: [{t, lever, value, fire?}], months}`. It can be shared as a URL or file, replayed exactly, and rendered frame-exactly to video.
- **`seek(month)`** restores the nearest snapshot and replays forward, which is fast because a month costs microseconds.
- **`fork({disableTerms, params})`** makes an independent engine. A counterfactual is always (shocked − unshocked) in the same fork.

## 5. Explaining what is happening

| Clicking | Shows |
|---|---|
| **A pipe** | Its legs, the flows they belong to, value vs baseline, and for each leg its amount variable's `Influence`: the rule, its category, the regime, terms now vs baseline, parameters with provenance, and concepts |
| **A term** | The input variables it reads. Following them walks the influence graph upstream, and `trace` highlights the path back to the lever that started it |
| **A player** | Its live balance sheet (value, baseline, change), its biggest pipes, and its binding constraints |
| **An indicator** | How it is computed, its drivers, and their influences |
| **"Ideas at play"** | `ideasAtPlay(scope)` weights each concept by the absolute change in the terms tagged with it, across the scope (a pipe, a player or the whole economy), and lists them with the terms they come from. Because they are live, the ideas at play shift as the shock travels: markup pricing first, then adaptive expectations, then the Taylor rule, then endogenous money |
| **The feed** | Declarative threshold rules on indicators. These are narration only, never logic |

## 6. The harness

`bun run harness` builds each model and writes `reports/harness-<model>.md`. It runs six kinds of test:

1. **Compilation:** unique ids, one rule per variable, every reference resolved, schedule built, and warnings listed.
2. **Contract unit tests:** each module's `tests` (amortisation, indexation, debt-service test arithmetic, payment-system cases).
3. **Accounting:** all four checks across every scenario, with the maximum residual reported.
4. **Baseline:** 240 months with no shock; the maximum drift of every variable and stock must be below 1e-9.
5. **Calibration:** the model's `CalibrationCheck`s, each a scenario, a measure and a plausible range with a source. The result is a PASS/FAIL table.
6. **Robustness:**
   - **property tests:** random lever combinations within range produce no NaNs and no failed checks;
   - **numerics:** half-step and tolerance sensitivity;
   - **determinism:** the same scenario gives identical results;
   - **golden scenarios:** stored outputs, so any change in results is visible in review.

`bun test` runs the kernel's own unit tests and every module's tests. GitHub Actions runs both on each push.

## 7. The interface

- **`EngineClient`** wraps the engine. It runs on the main thread today, and a Web Worker with the same interface can come later. Views receive compact snapshots and ask for details (influences, balance sheets) on demand.
- **Views, all generated from the compiled model:**
  - the flow map, at group or player level;
  - lever sections;
  - the inspector for pipes, players, indicators, concepts and terms;
  - chart tabs by indicator group;
  - the ledger (a live Godley table);
  - balance sheets;
  - ideas at play;
  - the event feed;
  - the scenario timeline, with scrubbing via `seek`.
- **Visual grammar:**
  - particles are cash moving, and thickness is the size of the flow;
  - amber glow means above baseline, blue-grey below;
  - dashed lines are accruals or revaluations, where no cash moves;
  - charts show deviations from baseline with amber marks at lever events.
- **Skins** are separate views over the same engine. The glow circuit is the default; the 3D island bench and video renders come later.

## 8. How to extend it

| To add… | Do this |
|---|---|
| **A player** | Add a `PlayerDef` with `settlement` and a layout hint, its instruments and holders, and the flows that touch it. The steady state gets new targets and free parameters |
| **A flow** | Add a `FlowDef` with its posting and legs, and one rule per leg amount (usually a family). The kernel posts it, checks it and draws it |
| **A behaviour** | Add a rule with terms and concepts. To refine an existing one, add a rule with `replaces` in a new module and keep the old module for comparison |
| **A lever** | Add a `LeverDef` with a precise `definition` and bind it to a parameter or exogenous variable, or give it a `fire` for one-off shocks that touch only non-stock state |
| **A chart** | Add an `IndicatorDef` with drivers and concepts |
| **An idea** | Add a `ConceptDef` and tag the rules and terms that express it |
| **A calibration target** | Add a `CalibrationCheck` with a source for its range |

`docs/authoring.md` walks through each with examples.

## 9. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | TypeScript on Bun, Preact for the interface | Types make the model language self-documenting; Bun runs TypeScript, tests and bundles with no extra tooling; Preact is small and stable |
| 2 | Legs with their own amounts | Exact pipes and a navigable influence graph |
| 3 | One rule per variable, with categories | Prevents double-counting; separates accounting from assumptions |
| 4 | Additive terms, with non-additivity flagged | Exact, honest within-rule influences |
| 5 | Payment system in the kernel | Money creation emerges from who pays whom, so it cannot drift from the accounting |
| 6 | Deterministic scenarios and forks | Time travel, sharing, video, honest counterfactuals |
| 7 | Monthly step, flows at annual rates in % of baseline GDP | Readable numbers; the step can be changed; the harness checks sensitivity |
| 8 | Engine v1 kept in `legacy/` | A reference to port from and to compare results against |

## 10. Roadmap

| Version | Scope |
|---|---|
| **v1** (this base) | Kernel, harness, reference model and the Iceland model ported from engine v1, with its 10 players and 20 calibration checks passing. Generic interface with pipes, influences, ideas at play, charts, levers, ledger and balance sheets |
| **v2** | Balanced-growth baseline with 2.5% inflation (fixes pension payouts); replace the placeholder parameters; scenario sharing; Web Worker |
| **v3** | Richer housing (rents, construction, supply lag); bank loan losses and funding; multiple banks; FX intervention; household cohorts by debt type |
| **Later** | 3D island skin; guided lessons built from scenarios; video export through HyperFrames; Icelandic translation |
