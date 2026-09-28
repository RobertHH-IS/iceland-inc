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
   - every change in net worth equals saving plus revaluations and write-offs;
   - every stock change is explained by cash, accrual, revaluation and write-off postings.

   Beside these four identities, a diagnostic watches every position's sign: an overdrawn asset or a liability that has turned into a claim balances perfectly, but no real sector could hold it (§4.4).
7. **The baseline is computed.** A steady state is *solved*: closed-form where a module provides it, then polished with Newton. It is published as an output, and the harness fails if it drifts over 20 years.
8. **Deterministic, replayable, forkable.** The state is plain data and a scenario is a list of lever events. The same scenario always gives the same numbers. That makes time travel, shareable scenarios, video rendering and honest counterfactuals possible: counterfactuals compare shocked and unshocked runs *within the same model variant*.
9. **Modules compose the economy.** Players, instruments, flows, rules, levers, indicators, concepts and tests arrive together in modules. A more detailed module replaces a simpler one explicitly (`replaces`), so growth is additive and reviewable.
10. **Provenance everywhere.** Every parameter says whether it is data (with source and vintage), calibrated, derived, assumed or a placeholder. The interface shows this next to each rule.
11. **The interface is generic.** The flow map, levers, charts, ledger, balance sheets and inspector are all generated from the compiled model. A new module appears in the interface without interface code, with optional layout hints.
12. **Few dependencies, pinned by age.** TypeScript on Bun, React for the interface, and nothing else in the kernel. Packages must be at least 7 days old (`bunfig.toml`, `.npmrc`).

## 3. The model language

All types live in `src/core/types.ts`. In brief:

| Concept | What it is | Example |
|---|---|---|
| **Player** | A sector with a balance sheet and a way of paying (`settlement`) | Young households (18–34), exporters, the central bank |
| **Group** | Players drawn together on the map; groups nest, and the map opens them one level at a time | Firms = Domestic firms (construction, retail) + Exporters (fisheries, aluminium, tourism, other) |
| **Instrument** | A stock: financial (someone's asset and someone's liability) or real | Deposits, CPI-indexed mortgages, government bonds, homes |
| **Variable** | A named quantity with a unit | Key rate, CPI, the wage bill of exporters |
| **Rule** | The one equation that sets a variable: terms (additive), a combine (e.g. `min`), optional gradual adjustment, a regime label | Desired mortgage lending = Σ terms; actual = min(desired, debt-service cap, loan-to-value cap) |
| **Flow** | A transaction type with a *posting* and *legs* (payer → payee, each with its own amount variable) | Wages: exporters → young households, exporters → working-age households, … |
| **Posting** | How a leg changes balance sheets: `transfer`, `purchase`, `issue`, `redeem`, `trade`, `accrue`, `revalue`, `writeoff` | A bank `issue` of a mortgage creates a deposit; a pension-fund `issue` moves an existing one |
| **Lever** | A setting or one-off shock with a precise definition; `showWhen` shows it only while another lever has given values | Key interest rate (%, persistent, shown on Manual); wage settlement (one-off level shift) |
| **Stabiliser** | An automatic POLICY reaction, declared: the lever it acts on, a variable with what it would set that lever to now, and a threshold for "calling for action". It acts only when the model's stabiliser setting is Automatic | The central bank's inflation rule on the key rate; the debt rule on income tax |
| **Indicator** | A chart series computed from variables and stocks, with a display transform | Broad money, % vs baseline |
| **Concept** | An economic idea with a plain-English explanation and references | "Loans create deposits" (Bank of England 2014) |
| **Module** | A bundle of all of the above, plus its own tests | `pensions/funded`, `government/cofog-channels` |

### The player hierarchy

Players are the unit of accounting; groups are a way of looking at them. A module declares `GroupDef`s (with an optional `parent`) and each player names its own group. The compiler checks the tree (unique ids, parents that exist, no cycles, every player in a declared group, no id that is both a group and a player) and publishes it as `CompiledModel.groups`, parents first, with each group's direct `players`, sub-groups (`children`) and `allPlayers`. A group's colour and layout default to its first player's colour and its players' centroid. A model without `GroupDef`s gets flat groups from its players' `group` labels, as before.

The map shows a group as one node until it is expanded. `nodeOf(player, expanded)` is the player's outermost closed group, or the player itself when every group around it is open, and `engine.pipes({ expanded })` sums legs to those nodes (legs inside a node become a loop on it). A group's balance sheet is the sum of its players', instrument by instrument, without netting claims between them. Because groups own nothing, opening and closing them can never change a number. Decision record [0003](decisions/0003-player-hierarchy.md) has the details.

### Policy is held; stabilisers are a setting

A POLICY lever never changes unless the user changes it, and no rule moves a policy setting behind the user's back. Some policy rules do react to the economy by design, such as a central bank's inflation rule or a debt-tied tax rule. Each is declared as a `StabiliserDef` next to the rules that implement it, and one global setting (`ModelDef.stabiliserMode`, a choice lever) decides whether they act:

- **Manual** (the Iceland model's default): policy reactions are off. The key rate is the level on its lever and the income-tax rate is its baseline plus the user's shift, and they stay there. Each rule still works out what it *would* do every month (its `suggestion`, a shadow value), and `engine.stabilisers()` reports it: when the lever is further from the suggestion than the stabiliser's threshold, the stabiliser is *calling*, the lever panel turns that lever red with the rule's number and an "Apply" button, and the feed says so. The user becomes the stabiliser.
- **Automatic**: the rules act on the variables (the key rate is the rule's rate; the debt rule's adjustment is added to the tax rate), and the user's lever becomes an offset on top of the rule. The lever values themselves still change only when the user changes them; the interface marks the levers a rule acts through ("Set by the central bank's inflation rule: 4.25%").

This is different from *institutional responses*, the automatic stabilisers of economics: tax revenue that falls and unemployment benefits that rise when incomes and jobs fall. Those are the rules of the game at the rates the user has set, and they work in both modes. The baseline is the same in both modes, and `showWhen` hides the lever that does nothing in the current mode (the Manual key rate on Automatic, the offset on Manual). Decision record [0004](decisions/0004-stabilisers.md) has the details, and why the reference economy starts on Automatic.

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
4. Run the accounting checks, and the position-sign diagnostic beside them.
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
| Net worth | Each player's change in net worth equals its saving plus revaluations and write-offs. Saving is income received minus income paid and current spending, including accrued interest; a seller's sales count as income. Buying a real asset (investment, homes) swaps money for the asset and does not change the buyer's net worth, and financial transactions change composition; neither changes net worth. Saving minus investment would be net lending, which this check does not use |
| Stock reconciliation | Every position's change equals cash + accrual + revaluation + write-off postings for that position |

A failed check is recorded in `checks().failures`, or thrown with `onCheckFailure: 'throw'`. A throw comes after the month is recorded and its lever events applied, so the engine is where a replay would be.

**Position signs (a diagnostic, tolerance 1e-6).** The four checks prove that nothing leaks, but they pass just as well when a household's deposits go below zero, a pension fund sells bonds it does not have, or a firm's capital stock turns negative. So every step, the engine also checks each position's sign against its role: a holder's asset must be at least −1e-6, an issuer's liability at least −1e-6 (in the `Ctx.stock` convention, where both are positive), and a real asset, which has holders only, at least −1e-6. The first month each position breaks this is recorded in `checks().signViolations` (instrument, player, role, month, value). It is not an accounting failure: it never throws and never appears in `failures`, and it has its own tolerance (`EngineOptions.signTolerance`), because a position a millionth of a unit below zero is a rounding matter, not an accounting one. A model that deliberately lets a position take either sign (a net position, such as an overdraft facility) declares it with `InstrumentDef.mayGoNegative`, which needs a reason. Decision record [0005](decisions/0005-position-signs.md) has the details.

### 4.5 Baseline

The steady-state spec gives:
- initial stocks;
- a list of free parameters;
- the same number of targets, such as "mortgage debt = 72% of GDP" or "deposits of older households = 42% of household deposits".

The kernel first uses the module's closed-form solver if there is one. It then polishes with damped Newton on the fixed-point condition *state(t+1) = state(t)* plus the targets. The solved baseline, including every flow, is written to a report.

The engine starts every run from the solved baseline. `lag()` before month 0 reads a lag history that `Machine.initHistory` sets up: month 0's values, and optionally earlier months for some variables. From the steady state the history is flat, because a steady state has no past to speak of. A start from today's data will pass its own months before month 0 ([design](design/start-from-today.md) §2.5). The engine's `lagWindow` option reaches the baseline solver too, so a rule may look back further than two years.

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
| **A group** | On the map, a closed group opens to show its members. In the inspector: its description, members, the summed balance sheet of its players, and its biggest pipes as the map shows them |
| **An indicator** | How it is computed, its drivers, and their influences |
| **"Ideas at play"** | `ideasAtPlay(scope)` weights each concept by how much the terms tagged with it move their rule, across the scope (a pipe, a player, a flow, an indicator or the whole economy), and lists them with the terms they come from. For an additive rule that is the term's change; for a rule with `combine` it is the term's one-at-a-time effect on the rule's value, so a cap that does not bind weighs nothing. Stabiliser suggestions never count, and on Manual neither do the stabilisers' shadow variables, which then drive nothing. Because they are live, the ideas at play shift as the shock travels: markup pricing first, then adaptive expectations, then the Taylor rule, then endogenous money |
| **The feed** | Declarative threshold rules on indicators. These are narration only, never logic |

## 6. The harness

`bun run harness` builds each model and writes `reports/harness-<model>.md`. It runs six kinds of test:

1. **Compilation:** unique ids, one rule per variable, every reference resolved, schedule built, and warnings listed.
2. **Contract unit tests:** each module's `tests` (amortisation, indexation, debt-service test arithmetic, payment-system cases).
3. **Accounting:** all four checks across every scenario, with the maximum residual reported. The position-sign diagnostic (§4.4) runs on the same engines; its violations are available from `checks().signViolations` but do not yet fail the harness (decision 0005).
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
  - the flow map, with groups that open in place, one level at a time;
  - the stabiliser setting and lever sections, with each rule's suggestion (Manual) or its value (Automatic);
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
| **A group** | Add a `GroupDef` (with a `parent` to nest it) and set the players' `group` to its id. Give it a description and, optionally, a layout hint for its closed card |
| **A flow** | Add a `FlowDef` with its posting and legs, and one rule per leg amount (usually a family). The kernel posts it, checks it and draws it |
| **A behaviour** | Add a rule with terms and concepts. To refine an existing one, add a rule with `replaces` in a new module and keep the old module for comparison |
| **A lever** | Add a `LeverDef` with a precise `definition` and bind it to a parameter or exogenous variable, or give it a `fire` for one-off shocks that touch only non-stock state |
| **A policy reaction** | Declare it as a `StabiliserDef` in its module, compute its suggestion in both modes, and make the rules apply it only when the stabiliser setting is Automatic |
| **A chart** | Add an `IndicatorDef` with drivers and concepts |
| **An idea** | Add a `ConceptDef` and tag the rules and terms that express it |
| **A calibration target** | Add a `CalibrationCheck` with a source for its range |

`docs/authoring.md` walks through each with examples.

## 9. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | TypeScript on Bun, React for the interface | Types make the model language self-documenting; Bun runs TypeScript, tests and bundles with no extra tooling; React is the most familiar interface library for contributors. Preact's smaller size was considered and does not matter here, because the engine, not rendering, does the heavy work |
| 2 | Legs with their own amounts | Exact pipes and a navigable influence graph |
| 3 | One rule per variable, with categories | Prevents double-counting; separates accounting from assumptions |
| 4 | Additive terms, with non-additivity flagged | Exact, honest within-rule influences |
| 5 | Payment system in the kernel | Money creation emerges from who pays whom, so it cannot drift from the accounting |
| 6 | Deterministic scenarios and forks | Time travel, sharing, video, honest counterfactuals |
| 7 | Monthly step, flows at annual rates in % of baseline GDP | Readable numbers; the step can be changed; the harness checks sensitivity |
| 8 | Engine v1 kept in `legacy/` | A reference to port from and to compare results against |
| 9 | Groups are views over players, not players ([0003](decisions/0003-player-hierarchy.md)) | Opening and closing groups can never change the accounting; pipes and balance sheets at any level are sums of the same legs and positions |
| 10 | Policy is held; stabilisers are a setting, Manual by default ([0004](decisions/0004-stabilisers.md)) | Levers never move by themselves; every automatic policy reaction is declared, acts only on Automatic, and is a visible suggestion on Manual |

## 10. Roadmap

| Version | Scope |
|---|---|
| **v1** (this base) | Kernel, harness, reference model and the Iceland model ported from engine v1, with its 10 players and 20 calibration checks passing. Generic interface with pipes, influences, ideas at play, charts, levers, ledger and balance sheets |
| **v2** | Balanced-growth baseline with 2.5% inflation (fixes pension payouts); replace the placeholder parameters; scenario sharing; Web Worker |
| **v3** | Richer housing (rents, construction, supply lag); bank loan losses and funding; multiple banks; FX intervention; household cohorts by debt type |
| **Later** | 3D island skin; guided lessons built from scenarios; video export through HyperFrames; Icelandic translation |
