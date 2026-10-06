# 0018. Iceland today: the application opens on the economy of 30 September 2026

Status: accepted (October 2026). The application's default model, `iceland-today`, is the growing variant with financial stress opened on Iceland as the published data have it on 30 September 2026 ([plan](../design/today-opening.md); the kernel side is architecture §4.5). This record keeps the choices the plan left to the engineer, every place where the plan's arithmetic and the code's result differ, what the tests of the start found, and how the model's own path compares with published forecasts. By the owner's decision of 6 October 2026 that comparison is reported and is not a test: the path with no lever moved does not have to agree with the Central Bank's forecast or the market's, and nothing in the model may be chosen or tuned to make it. Numbers are from `reports/opening-iceland-today.md` and the tests in `tests/models/iceland-today-*.test.ts`.

## What was built

- `src/models/iceland/today/`: the profile (`createIcelandTodayModel`, `icelandTodayModel`), the opening builder (`opening.ts`: positions, variables with their past, parameters with provenance, closed forms, anchor overrides, checks, continuity rows, the start solve), the record access (`data.ts`, `records.ts`).
- `scripts/extract-today.ts` copies the 153 records the opening reads into `data/iceland/today-2026-09-30.json`, with the committed solution of the start solve (`--solve` re-solves and rewrites it). The snapshot is not edited.
- The level reports keep their conversion (`isk()` in `modules/indicators.ts`, the money indicators of `modules/financial-fragility.ts`): the plan's §2 change to a fixed unit was made and then reverted, see the table of differences below.
- An optional `OpeningDef.path` (`src/core/types.ts`) and a section of the harness's opening report (`src/harness/opening.ts`) show the path with no lever moved beside published figures. Both are additive and absent on every other model.
- The harness's opening layer passes for `iceland-today`: T1 (77 positions: 23 data, 37 allocated, 15 mirror, 2 residual; largest imbalance 3e-15), T2 (28 gated checks; every rule reproduces the values the opening holds; no regime beyond the anchor's), T3 and T7 for 240 months in both padlock configurations, T8.

## The choices

### The payout route (plan §1.5, R3)

Route (b), as the plan prescribes: the anchor's payout ratio, 18.07% of pensioners' rights a year, is kept, and `c0O` is not re-solved. On today's rights for older households (ISK 4,221.7 bn) the model pays ISK 763.0 bn a year, 2.11 × the ISK 361.5 bn of domestic benefits paid in 2025 (`financial.pensionDomesticBenefitsPaid2025`). The opening report carries it as a warning (`pensionPayoutsCrossCheck`), and older households' income after interest is 1.88 × the 2025 tax returns for the same reason. A payout fix is a change to the base calibration, with the goldens and the harness regenerated and reviewed; the opening then reads the fixed value.

### The bridges (plan §1.6)

Each is marked `assumed` in the opening and listed in the report's warnings:

| Bridge | Value | Replaced when the snapshot gains |
|---|---|---|
| Flows at month-0 prices, F | 1.04078: the CPI in September 2026 (1.06768) ÷ its average over months −14 to −3 (1.02585), on the log-linear CPI path | Monthly or seasonally adjusted national accounts |
| `wage` against its 2025 average | 1.06296: the CPI one month back on the opening's path (1.06292) × (1 + real wage growth 0.035%). The plan wrote 1.06391 from the August CPI, 694.6, which is not a record in the snapshot (it is in `docs/current-economic-context.md`); the opening uses only records, so it reads August from the September index at the 12-month rate | LAU04000 2025 average, or the August index |
| CPI component levels | The housing-free part at its own 12-month rate (5.7%): `consumptionDeflator` 1.06566, `housingCost` 1.07389, `domesticPrice` 1.08839 from the identity | VIS01000 sub-index 2025 averages |
| `importPrice` | 0.98549, the border price, so the pass-through rule is at rest | The imported-goods CPI sub-index as a level against 2025 |
| `worldPrice0`, `fishPrice0`, `aluminiumPrice0` | 1.03386 = (1.027)^(15/12) | `gap.external.*` |
| `iFnow` | 3.375%, the unweighted mean of the ECB, Bank of England and Federal Reserve rates | The trade-basket weights |
| Real GDP level | A warning only: `output` 98.15 against 100.3 (2025 × 1.003), inside ±3% | A seasonally adjusted volume level |
| Placeholders kept | `eShareW`, `loanShareX*`, the `eqH*` split, `eqW`, the capital quantities, `mD`, `sBB`, `sB`, `depFX` (the firms' deposit shares come from the 2025 opening) | Sector and age splits |

### The conditional gaps (plan §3.3, §9.3 step 4)

T4 was run with all six conditional families off. One failed its own row: **real house prices** rose 0.60% in month 1 and 0.56% in month 2 against a bound of 0.5% (the rule's income, rate and population terms sit above today's level). So `housePrices` is on, solved at −0.0759 log points (half-life 8 months), and its row now holds exactly in month 1. Spending (real consumption −0.11% in month 1), investment (+0.03%), hiring (jobs +0.22% a month against a 0.04% trend, inside 0.5%), rents (housing costs +0.32% a month) and mortgage demand (net lending moves 0.03 units) stayed inside their rows with the families off and are not on.

The always-on gaps, solved (7 unknowns, 3 Newton iterations, largest residual 7e-14, condition number 461):

| Group | Size | What it says |
|---|---|---|
| wage | −3.34 points of wage growth (absolute; guard 5) | The wage curve wants about 9.0% (expected inflation 4.3 + the error correction's 5.1, since wages are 7.3% below the value-added price, less 1.9 for slack, plus 0.9 of trend productivity); the data say 5.7 |
| labourSupplyY, W, O | +0.300, +0.293, +0.296 of each rule's value (relative; guard 0.25, so all three are warnings) | Today's 5.8% is 1.56 points above the 2025 normal rate; the gap is the extra unemployed |
| markup | +0.0775 of the rule's value (relative) | Domestic prices 4.9% above the normal markup on unit cost; the plan expected +0.06 to +0.09 |
| krona | −0.0932 log points (absolute; guard 0.15) | The rule's target is +0.0776 against −0.0479 actual; the plan expected about −0.128 |
| housePrices | −0.0759 log points (absolute) | As above |

The solve targets of §3.3 hold to 1e-9 in the engine's month 1: wage growth 5.7%, CPI inflation 5.7% annualised, the króna's log change −2.11% a year (ln(1 − 0.02085)), each group's unemployment rate and the real house price.

### The Treasury's foreign-currency debt (plan §9.3 step 7, R2)

The plan's criterion is the króna response: keep the mapping with the smaller one. Both were run with everything else equal:

| | Non-residents hold it as króna bonds (the plan's first mapping) | The banks hold it (chosen) |
|---|---|---|
| W's government bonds | ISK 516.1 bn; `bondW` 9.64, `krona0` 12.48 real | 113.1 bn; `bondW` 2.11, `krona0` 5.38 |
| Banks' government bonds, bank bonds, PF shares | 1,010.6, 1,332.1, 2,088.4 (the plan's T1 figures) | 1,413.6, 1,735.1, 1,685.4 |
| Price of foreign currency at months 6, 12, 24 (0.9532 today) | 0.9721, 0.9957, 1.0372 | 0.9724, 0.9947, 1.0345 |
| Largest monthly log move, months 1–24 | 0.0047 | 0.0048 |
| Month-1 continuity (T4) | the same rows hold | the same |
| Bank assets against the record | 0.89 (a warning) | 0.95 (inside ±10%) |
| Net external position against the record | 1.52 | 1.69 (the debt is no longer a foreign claim in the model) |

The króna moves less over one and two years with the banks holding the debt (8.2% against 8.4% weaker at month 24), so that mapping is the default (`foreignDebtHolder: 'B'`). The difference is small, and it is not uniform: at month 6 and in the largest single month the first mapping moves the króna marginally less. Two things besides the criterion point the same way: non-residents' króna holdings are then as the data have them, which is what the portfolio-balance term measures, and bank assets come inside their cross-check. The choice was made on the króna response and those two points, before the comparison with forecasts was looked at; the two mappings give the same key rate, inflation and unemployment to within 0.05 points at months 12 and 24. Because the banks hold the debt, three of T1's residuals differ from the plan's table by the ISK 403.0 bn moved; the test checks them at the values above, and checks the plan's own figures under the first mapping, which stays available (`createIcelandTodayModel({ foreignDebtHolder: 'W' })`). Going back to it is that one default, a re-solve and a regenerated golden.

### Positions: how the plan's "residual" is written

The kernel fills exactly one position per financial instrument and labels it `mirror`. Where the plan's residual closes an instrument (deposits at the banks, mortgages of the working-age group, retail firms' loans, banks' government bonds, pensioners' rights, the fill of the treasury account, indexed bonds, reserves abroad, foreign assets, króna loans, arrears) it is that fill; the report shows `mirror` and the note names the instrument it balances. Where the residual closes a balance sheet it is listed as `residual` with the identity: banks' reserves (the central bank's balance sheet) and bank bonds (the banks'). Pension funds' shares are the fill of `shares`, which gives the same number as the plan's balance-sheet residual because the six issuers are allocated from the total that includes it; a gated check (`pfAssets`) holds the funds' assets at ISK 9,326.3 bn.

### Parameters the opening sets beyond the plan's list

- **`dep{j}0`, the firms' cash-buffer normal**, is set at deposits ÷ GDP × (1 + 0.00599) rather than deposits ÷ GDP. The buffer rule closes its gap at 12 a year; on a path whose nominal GDP grows at today's 5.66% the buffer is always that small distance behind its target, and with the plan's ratio the cash term opened at exactly zero and jumped to its growth-path flow in month 1 (retail firms' borrowing −0.47 → +0.66 units). With the lag the opening flow is +0.68 and month 1's +1.24 (nominal GDP grows 0.74% in month 1, faster than the 0.46% the lag assumes, because domestic prices rise 7.9% a year while import prices fall). That row is still outside its 0.3-unit bound, by 0.26 (ISK 13 bn a year on a ISK 1,038 bn book). It is the one row of T4 that does not hold, T4 is a gate, and it is open: `tests/models/iceland-today-opening.test.ts` names it and pins its size so that it cannot grow unseen.
- **`depW`**, non-residents' normal deposits, is set with `bondW` (3.38 real), so the share of króna holdings they keep in deposits stays today's. The plan set only `bondW` and `krona0`.
- **`sMN` and `rMI0`** are net of the pension funds' domestic funding premium, which is on at month 0 (rates abroad are above their normal level, so the funds tilt home: +0.04 points on both mortgage rates). Without it the rates opened 0.04 points above the advertised ones.
- **`startGapBase.unemployed{g}`** is set by `derive` to today's unemployed in each group (the group's rate × its labour force at month 0) rather than left to the kernel, whose default base, the rule's own month-0 value, includes the gap term and would have needed more rounds than the closed forms allow to settle.
- **The group unemployment rates** are each 2025's × one common factor, solved so that the whole labour force's rate is 5.8% with today's jobs by age (the factor is 1.363; the plan's 5.8 ÷ 4.24 gave 5.81% in total).

### Where the plan's arithmetic and the code differ

| Item | Plan | Code | Why |
|---|---|---|---|
| `labourCostSeen` | 1.05171, with a monthly adjustment share and wages growing 5.7% | 1.05423 | The kernel takes two steps a month, and the growth wrap measures the wage per unit of trend productivity, so the smoother's input grows at 5.7 − 0.9 = 4.8% a year; the closed form uses the kernel's step and that rate |
| `wage` | 1.06391 | 1.06296 | The August CPI is not a record (above) |
| `domesticPrice` | 1.08841 | 1.08839 | Follows from the wage bridge through the CPI identity's rounding only |
| `neutralRate` | about 2.70% | 2.704% | Agrees |
| `krona0` | 12.484 | 5.377 | The banks hold the foreign debt (above); with the plan's mapping the code gives 12.48 |
| `fxr` | about 19.4 | 19.85 | The reserve target reads real output over the past 12 months against the anchor's (98.0 against 100), which the plan's rounding left out |
| `potentialOutput` | — | 100.66 = 98.15 ÷ (1 − 0.0249) | As the plan defines it |
| `tau0` | — | 0.3855 (2025: 0.3853) | Revenue ISK 2,276.2 bn a year as the record; the base includes the pension payouts above |
| Public services | one factor | 1.0036 on `gHealth`, `gEdu`, `gOther` | Nominal services ISK 1,575.6 bn a year as the plan |
| Transfers | one factor | 1.3125 on `trOA` (5.53) and `trFam` (3.03) | Expenditure ISK 2,423.9 bn a year as the record; the model's interest bill (ISK 170.6 bn) is 0.74 of the 2025 record, and the 2025 mapping of services leaves the rest to transfers |
| κ | expected below 1 | 0.979 | Inside [0.9, 1.1]; imports open at ISK 2,113.1 bn a year, +0.09% on the mapped record |
| Export normals | — | `xFish` 8.31, `xAlu` 6.47, `xTour` 13.57, `xOther` 14.68 (2025: 7.26, 6.44, 13.08, 13.64), with their growth anchors | Today's volumes ÷ competitiveness; no export opens capped (T2) |
| GDP over the past 12 months | 105.482 (ISK 5,212.1 bn), on monthly values | 105.36 (ISK 5,206.0 bn) | The kernel averages 24 half-month steps and reads the half-months between two months as their mean; the debt chart opens at 53.8% rather than 53.7% |
| Unemployment at month 0 | 5.8% | 5.8000% | The common factor above |
| The ISK conversion of the level reports (§2) | Replace `c.base('nominalGDP')` with the fixed unit; "on the stationary models the two differ by at most 1e-16" | Not applied: the existing conversion is kept | The claim does not hold for a stationary variant solved with another `Y0`: `tests/ui/reporting.test.ts` checks that such a variant shows its amounts scaled by its own solved GDP, and the fixed unit broke it (ISK 5,380.7 bn against 4,941.2). The change was made in the first commit of this package and reverted in the second, so the controls are unchanged. On `iceland-today` the structural anchor of nominal GDP is 100 and is not overridden, so the conversion is exactly ISK 49.41211 bn per unit, and a test holds government debt at ISK 2,800.7 bn |
| Current account | −3.0% of GDP, a warning | +1.65% of GDP | The model has no FDI income payments, no interest on firms' and banks' foreign borrowing and a smaller trade deficit (−0.27 units against the data's −1.0% of GDP); the warning stands |

### What the opening report warns about (T11)

Beyond the bridges and the three labour-supply guards: reserves 1.26 × the 2024 figure, bank bonds 1.16, pension funds' domestic shares 1.52, home values 1.18, the net external position 1.69, the capital ratio 28.0% against 23.3%, government net financial worth 1.26, mortgage interest 1.27 × the 2025 tax returns, government interest 0.74, pension payouts 2.11, older households' income 1.88, households' property income ISK 518 bn a year above the 2025 capital-income total (the deposit rate of 7% on all deposits and the dividends the 2025 calibration pays households), the deposit rate 7.00% against three-month fixed rates of 7.45–8.00 (the outstanding-weighted rate is a gap), public services at face value 1.14 × the record (the 2025 mapping; consumption 1.05 and investment 0.93 are inside), net mortgage lending −ISK 7.3 bn a year against +193.6 (the desired-debt rule wants slightly less debt than households carry at today's real rates), net credit +11.9 against +503, and pension funds' foreign purchases ISK 64.4 bn a year against 108 (the funds' assets grow slowly, see below). From the CPI-by-origin shares the plan expected imported goods' price relative to the CPI to fall about 1.2% a year; in month 1 it falls 2.3% a year, the same sign.

## What the tests of the start found

These test that the start is sound. They stay gates.

**T1, T2, T3, T8** hold (above). **T10:** the committed solution is checked at load and a fresh solve agrees with it to 1e-9; a golden pins the path with no lever moved for months 0–24 in both padlock configurations (16 series), so a change that moves it is seen.

**T4, month-1 continuity.** Every row holds except one: retail and service firms' net borrowing moves 0.56 units in month 1 against a bound of 0.3 (above). That row is open. The króna strengthens 0.18% in month 1 (solved) and weakens 0.34% in month 2, inside its 0.5% bound: the purchasing-power term of the króna rule follows domestic prices at once, and the solved gap fixes only the first month.

**T6, first line.** A key rate the user locks at 8.00 stays 8.00 for 24 months.

**T7.** Both configurations run 240 months finite and plausible, with accounting below 1e-9 and no position of the wrong sign. The plan also asks for the 1,200-month path of pension assets to be reported. It does not reach 1,200 months, and that is an open item, said plainly: with the padlocks unlocked the income–spending block stops converging in month 1059, after inflation has risen to 13% by month 900 and 23% by month 1000 with the key rate at 21–30% and government debt turned negative; with the key rate held at 8 it stops in month 1119, after a long quiet stretch (unemployment near 2%, inflation 4.4–5.6%, debt 73–80% of GDP, pension assets 147–158% of GDP). Until then the books are right: the first accounting residual above 1e-9 is in month 1019 (unlocked) and 1104 (locked), and the first position of the wrong sign in month 1056 and 1102 (firms' deposits). The growing control passes 1,200 months from its own start. The gate is 240 months, which holds.

## The path with no lever moved, beside the published figures

This is a comparison, not a test (the owner's decision, 6 October 2026). The path is what the model's own rules do from 30 September 2026; it is not a forecast, and no parameter, rule, fade, gap or mapping was chosen with these figures in mind. `reports/opening-iceland-today.md` carries the same table for both padlock configurations, out to month 240.

| With the padlocks unlocked | Mar 2027 (month 6) | Sep 2027 (12) | Mar 2028 (18) | Sep 2028 (24) | Published, for comparison |
|---|---:|---:|---:|---:|---|
| Key rate, % | 8.07 | 7.94 | 7.70 | 7.76 | 8.00 today. Market participants (survey of 10–12 August 2026): 8% in 2026Q3, 6.25% in two years. The plan's arithmetic of the rule on the Central Bank's forecast path (§4.3): 7.79, 7.31, 6.77, 6.23 |
| CPI inflation over 12 months, % | 5.42 | 4.43 | 4.05 | 4.41 | 5.9 today. Central Bank: 3.6 on average in 2027; the model's 2027 average is 4.86 |
| Unemployment, % | 5.05 | 4.59 | 4.26 | 3.98 | 5.8 today. Central Bank: 5.9 on average in 2026, 5.2 in 2027; the model's 2027 average is 4.79 |
| Real GDP, % above today | 0.9 | 2.8 | 4.8 | 6.6 | Central Bank: growth of 1.4% in 2026 and 1.9% in 2027 |
| Króna: price of foreign currency (2025 = 1) | 0.9724 | 0.9947 | 1.0160 | 1.0345 | 0.9532 today; no forecast in the snapshot. The króna is 2.0, 4.3, 6.4 and 8.2% weaker than today |
| Wage growth, % a year | 7.3 | 8.0 | 7.9 | 7.4 | 5.7 over the 12 months to August 2026 |

With the key rate locked at 8.00 and income tax locked, the path is close to the same for two years: inflation 4.44% at month 12 and 4.38% at month 24, unemployment 4.59% and 4.00%, real GDP 2.8% and 6.5% above today, foreign currency at 0.9945 and 1.0331.

So the model's path has more growth, lower unemployment, higher wage growth and inflation, and a higher key rate than the Central Bank and the market expect. Three things in the model account for most of it:

1. **The growing variant grows fast from any start.** The control, `iceland-growing`, started from its own stationary 2025 state, takes unemployment from 4.2% to 3.2% in two years, output 5.9% higher and its key rate from 3% to 6%; at month 240 it has unemployment of 3.9%, inflation of 3.1% and a key rate of 9.4%. The dated opening shares those rules.
2. **The labour-supply gap fades** (half gone in 17 months, the plan's figure), so unemployment falls from 5.8% to 4.0% in two years whatever demand does. The wage curve then pushes wage growth to 8%, and the key-rate rule's reading of slack turns from a drag of 1.25 points on its target to a small push, which offsets what lower inflation and expectations take off it. For information only: with a fade of 0.2 or 0.1 a year, unemployment at month 24 would be 4.4% or 4.6% and the key rate 7.4% or 7.3%, with inflation and output hardly changed. The plan's 0.5 a year is used.
3. **The króna weakens** 8% in two years, because its rule follows domestic prices at once and they rise 8.2% over the two years; that keeps import prices from falling.

**Credit and pensions over the two years, also reported.** No business credit is refused in any month and no credit-rationing regime appears; lender confidence stays between −0.02 and 0.00 (it drifts to −0.2 by month 120). So the opening does not make a credit squeeze of its own in its first months. Pension-fund assets go from 179% of the past year's GDP to 170% at month 24, with net worth rising from −0.6% to 2.5% of assets, and the funds' net foreign purchases average 0.67% of GDP a year against about 2.1% in January–August 2026.

## The controls

**T9.** The stationary models' goldens, calibration checks, expectations and reports are unchanged (`bun run harness`, `bun run levers`), and so is every test of the controls: the plan's change to the level reports was reverted because it changed a stationary variant (the table of differences above).

**The lever report** (`reports/levers/iceland-today.md`) is measured against the no-change path from the opening and is non-gating; see `docs/audit/lever-vetting.md` for the signs that differ from the stationary expectations.

## Follow-ups

- Open, a gate: retail and service firms' borrowing in month 1 (T4).
- Open, reported: the path does not reach 1,200 months (T7's reported row).
- The owner's choice on the pension payout (route (b) kept) and on the fiscal mapping (transfers scaled 1.31 to carry the deficit).
- The data generation script, which is not in the repository: the bridges' records.
- The two interface tests in `tests/ui/application-model.test.tsx` that assumed the stationary start (a key rate set to 6 is a rise from 3% and a cut from 8%; tourism firms under tourism −80 fall into arrears at 8% rates and list their overdue principal and write-offs) now read the opened model's start value and outcome.
