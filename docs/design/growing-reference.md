# Growing teaching reference

Implemented in `src/models/iceland/growth.ts` and `modules/growth.ts`. The stationary `icelandModel` remains the control for fixed-point, calibration and golden tests. This variant starts from its solved opening portfolio and then evolves. It is not an observed Iceland-today start, an official forecast, or an exactly solved balanced-growth equilibrium.

## Assumptions and source boundary

Rates below are annual fractions in the API. The reference indices compound as `(1 + annual rate) ^ elapsed years` and start at 1.

| Assumption | Default | Meaning and provenance |
| --- | ---: | --- |
| Normal domestic real quantities | 1.4% a year | Persistent **assumption** inspired by the CBI's full-year 2026 forecast, published 19 August 2026. The original one-year forecast is not a century-long forecast. [CBI Monetary Bulletin 2026/3](https://indicators.cb.is/news-and-publications/article/monetary-bulletin-2026-3). |
| Population and normal labour force | 0.5% a year | Teaching assumption, with unchanged age shares. No separate births, deaths or cohort-ageing forecast. Net immigration through the existing lever is additional to this path. |
| Labour productivity | About 0.8955% a year | Derived assumed trend: `(1.014 / 1.005) − 1`. Normal real quantities equal the population index times the productivity index. It is not an observed productivity residual. |
| World-demand proxy | 3.0% a year | Persistent **assumption** inspired by the IMF's PPP-weighted full-year 2026 world-GDP forecast, published 8 July 2026, retained in audit record `world.growth2026`. Unit elasticity for tourism and other export orders is another assumption; world GDP growth is not measured growth in Icelandic exports. [IMF July WEO update](https://www.imf.org/en/publications/weo/issues/2026/07/08/world-economic-outlook-update-july-2026). |
| Price trend and variant inflation target | 2.5% a year | Assumption inspired by the CBI's inflation target. Foreign prices sharing the same trend is a further simplifying assumption. It is separate from the audited September 2026 actual CPI increase of 5.9% and current key rate of 8%. [CBI target](https://indicators.cb.is/monetary-policy/inflation-target/). |
| Capital shortfall exponent | 0.35 | Assumed sensitivity, not an estimated Iceland production coefficient. |
| Export capacity headroom | 10% | Assumed spare capacity relative to normal sector volume, reduced by an actual productive-capital shortfall. It prevents world orders compounding faster than domestic supply from creating unlimited production. |
| Additional investment requested for growth | 100% | Normal plans include the real trend's required capital expansion. Actual spending remains endogenous and may be reduced by profits, rates, debt and the optional credit mechanism. |

The dated economic-data audit is verified as of 30 September 2026. This profile deliberately keeps source facts, forecasts and persistent assumptions distinct. The neutral **real** rate `i0` remains 3%; it is not relabelled as today's observed nominal policy rate. Opening nominal key rate is inherited at 3% and the variant's inflation target becomes 2.5%, so the initial run is a transition. The foreign rate remains the original income-yield assumption; it is not an equity-price return.

## What changes in the economy

Growth changes the equations' normal consumption, public-service and transfer levels, normal firm investment and profit benchmarks, employment and unemployed-person benchmarks, export orders, and world price levels. Additive spending-lever shifts retain their fixed baseline-GDP units. Existing identities still calculate revenues, profits, wages, taxes, real GDP and nominal GDP from their components. Actual GDP is never set equal to a trend or rescaled after the fact.

Nominal money stocks remain in the original fixed baseline annual GDP units. New capital comes from the existing purchase postings; depreciation remains a write-off. Deposits, loans, bonds, pension rights and net worth evolve from actual payments, accruals and revaluations. Nothing multiplies ledger positions by a growth index.

The physical-capital quantity state is deliberately separate from nominal capital at historical cost. For each sector and kernel step it is:

`physical capital = previous physical capital + dt × (previous actual real investment − depreciation rate × previous physical capital)`.

The installation lag is one kernel step. Initial physical quantity equals the opening at-cost stock at its normalised price of 1; it is a stylised quantity measure, not a newly observed physical-capital dataset. Deflating all historic nominal capital at today's price would incorrectly reprice old investment cohorts; the implementation avoids that shortcut.

Available productive capacity follows the declared labour/productivity path, reduced when actual capital falls below the capital needed for that path. Surplus capital cannot exceed this labour/productivity ceiling. Firm pricing and the domestic investment accelerator read this capacity. Export orders are separately limited by available sector capital and the declared growing labour/productivity capacity. The demand identity may still temporarily put GDP above or below productive capacity; price and labour-market responses resolve the pressure rather than overwriting GDP.

Wage bargaining includes the assumed productivity trend and compares pay per productivity unit with value-added prices. Hiring measures the wage cost per productivity unit. Price-level and quantity adjustment rules carry the known trend while smoothing deviations. The consumption carry remains inside its existing cash ceiling. In portfolio balance, sensitivities are measured per unit of the growing normal real economy and the normal nominal portfolio-expansion flow is subtracted from the flow-pressure term. These are explicit growing-variant relationships; no actual foreign position is rescaled.

## Construction and comparison

`createGrowingIcelandModel(options)` accepts `id`, `realGrowth`, `populationGrowth`, `worldGrowth`, `inflation`, `capitalElasticity`, `substeps`, `baseModel`, `additionalModules`, and `modelTransform`.

The standalone default ID is `iceland-growth-reference`. The application's combined growth and financial-stress profile keeps `iceland-growing`; they are distinct definitions. A caller using custom annual rates, engine parameters or transforms must give that profile a distinct ID before exporting portable scenarios. The current application exposes the canonical default profile, and its no-change reference always uses the same parameters as the experiment. A profile ID identifies a registered model definition; it does not encode arbitrary constructor options.

`createGrowingIcelandEngine(options, engineOptions)` uses `initialBaselineForGrowingModel(model, engineOptions)` to map the stationary solved opening parameters, variables and portfolios by IDs into the variant. The mapped baseline is an opening state, not a fixed-point result. Added mechanisms can seed their new state through `steadyState.solve(...).vars`; new algebraic diagnostics are evaluated against the opening state. This uses the kernel's normal baseline initialization rather than writing live positions. `modelTransform` runs after growth so borrower funding caps can wrap its effective actual-investment target. `baseModel` also supports wrapping a mechanism-enhanced stationary source; replacement discovery follows the chains by target.

Every shocked experiment must compare with a fresh unshocked engine using the **same variant and options**. Structural `Ctx.base` anchors remain the opening state; they are not replaced by a simulated comparison series. Reset and seek replay the reference indices, physical-capital states and all postings deterministically.

The four indicators in **Growth and capacity** are `referenceWorldDemand`, `referencePopulation`, `actualProductiveCapacity` and `fundedPhysicalCapital`. Each is a quantity index with opening = 100; nominal and real price bases therefore show the same quantity. They report the declared reference path or actual installed capacity, rather than an inflation-deflated financial asset amount. The application compares these with the same-month unshocked path when showing experiment effects.

When all four trend rates are zero, growth keeps the original determining rules, allowing the stationary equations and scenario outputs to be compared directly. The extra physical-capital and reference diagnostics remain available. The stationary model itself is unchanged.

## Validation and limits

Focused tests in `tests/models/iceland-growth.test.ts` verify the opening mapping; zero-rate stationary and shocked-path parity; all 1,200 no-change months with finite values, unemployment and price domains, correct position signs and accounting residuals below `1e-9`; physical versus nominal capital recurrences; investment-to-capacity linkage; compounding across substep choices; and reset, seek and fork replay.

The standalone default path at month 1,200 has real GDP about 389.6, nominal GDP about 4,714.4 and capacity about 398.8, in fixed baseline-GDP units. CPI is about 13.2; annual inflation is about 2.38%, unemployment 4.42% and the key rate 4.99%. These are model-run results, not predictions. They are not guaranteed targets: growth, inflation, debt and the distribution of income can differ from their normal-path assumptions.

Housing supply is still fixed; this implementation does not add housing construction, rents by tenure, public productive capital, changing demographic age composition, innovation, climate/energy constraints, an explicit global production model, autonomous foreign equity-price trends or a fully calibrated current-data opening. The optional financial-fragility layer provides funded investment and borrower crisis mechanisms separately. Long-run numerical feasibility does not establish empirical forecast validity or prove that the evolving path is a balanced-growth equilibrium.

## Independent financial-composition review

The financial layer was reviewed against actual cash and ledger postings, rather than only its displayed accounting-profit variables. Sector operating cash uses declared operating receipts and payments. Construction-sector capital formation delivered to itself is correctly excluded from cash receipts and payments. Approved gross loans enter the cash pool once; interest, principal, externally purchased investment and dividends compete for that pool. Export sales and both input lines use the same funded physical export volume. Internal capital formation remains an aggregate own-production assumption: this is not a materials inventory or an engineering model of builders' ability to deliver their own capital.

Unpaid performing principal moves into arrears without creating additional total debt or income. Unpaid interest accrues as a matched bank claim and borrower expense. Recoveries retire the claim with cash without recognizing income again. A write-off removes the bank claim and borrower liability once; the resulting bank-equity loss follows its balance-sheet identity. Arrears remain in loan-interest, borrowing-plan, dividend, coverage and risk-weighted-asset calculations. Coverage and distress also include a declared arrears-workout instalment, so paying only new service does not automatically clear continuing overdue distress. These are nominal annual-rate business contracts; the existing CPI-indexed mortgage contract remains separate.

An independent 240-month severe experiment (key rate 15%, tourism −60%, collateral advance 0.1, default delay one month) checked 480 kernel steps. Maximum discrepancies were below `1.14e-13` for operating cash, `7.49e-14` for deposit cash waterfalls, `7.11e-15` for total-debt recurrence and `1.39e-17` for bilateral write-offs. Cumulative write-offs were 8.4671 fixed baseline-GDP units; the accounting residual stayed below `2.45e-12`, with no sign or accounting violations. A zero-growth, unshocked 240-month composition kept lender confidence neutral and produced no arrears or write-offs. The separate integration suite passed all nine tests, including the 1,200-month growing no-change path, funded investment and capacity, replay, same-variant comparison and every declared lever endpoint in both lock configurations.

The financing classes describe debt-weighted averages of six sectors, not counts of individual firms. The collateral proxy, refinancing maturity, workout speed and default delay are teaching assumptions. Business arrears continue to accrue ordinary nominal interest; prudential provisioning and interest-suspension rules are not implemented. Household mortgage default, bank resolution, deposit flight, fire-sale market clearing and legal insolvency procedures remain outside this layer.
