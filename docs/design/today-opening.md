# Opening on Iceland today: implementation plan

Status: plan (design only; nothing here is implemented). Written against commit `d9eee5a`, with the dated snapshot `data/iceland/observations-2026-09-30.json` (1,137 records, verified 30 September 2026) and the two data briefs `data/iceland/current-hagstofa.json` and `current-financial.json` (as of 28 September 2026).

The owner asked for the application to open on Iceland as it is now, so that every change is seen against today's levels. Today the application opens on the growing variant (`iceland-growing`), which starts from the stationary 2025 calibration: a key rate of 3.00%, zero inflation and every amount in "% of opening GDP". This plan replaces that opening with a dated one, built from the snapshot, and keeps everything else that already works: the growing variant's rules, the padlocks, the no-change comparison run and the level reports.

It builds on [start from today's data](start-from-today.md) (the approved design, written before padlocks, sub-steps and the growing variant) and keeps its principles: a dated start; the no-change path as the comparison; effects as the run minus the no-change path; a consistent month 0; no artificial jumps in month 1; declared, fading start gaps on behaviour rules only; acceptance tests T1–T11.

## 0. Summary

1. **Month 0 is September 2026.** The opening is Iceland on 30 September 2026. Stocks, prices, rates, expectations and lag histories are set from the snapshot, through declared mappings. Each financial instrument has exactly one residual position, and every residual is listed in an opening report with its cross-check (§1).
2. **Headline values at month 0:** key rate 8.00%, 12-month inflation 5.9%, unemployment 5.8%, wage growth 5.7%, the króna 4.7% stronger than its 2025 average, government debt ISK 2,800.7 bn (56.7% of 2025 GDP), household mortgages ISK 2,936.3 bn, pension-fund assets ISK 9,326.3 bn, household deposits ISK 2,113.0 bn and nominal GDP of ISK 5,138.9 bn a year (§1.2).
3. **The money unit does not change:** one model unit is 1% of 2025 nominal GDP, ISK 49.41211 bn. Price indices are 1 at their 2025 averages, so today's nominal GDP is 104.0 units, not 100. The interface shows ISK billions (flows a year) and percent (§2).
4. **Smoothness.** Month 0 is consistent: every identity holds. The following are solved so that month 1 continues recent momentum:
   - five latent states, including the central bank's estimate of the neutral rate, so that its rule is at rest at 8.00%;
   - ten fading start gaps on behaviour rules (wages, consumption, investment, hiring, labour supply, house prices, mortgage demand). These fade at 1 a year, or 0.5 a year for labour supply (§3).
5. **Policy today.** The padlocks start unlocked, so both policy rules act from month 1. Both rules start at rest, and the key-rate lever's unchanged mark is 8.00%. Rule arithmetic puts the key rate near 7.3% after a year and 6.2% after two, against the market participants' expected 6.25% (§4).
6. **The default model.** A new profile, `iceland-today`, is the growing variant with financial stress plus this opening. The application opens on it. `iceland` and `reference` stay the stationary controls for the harness, unchanged. `iceland-growing` stays registered so that its old links still replay (§5).
7. **Kernel changes are small and bit-for-bit on every existing model:**
   - a baseline may carry a lag history and separate anchors;
   - a generic opening builder, solver and report;
   - a start-gap helper;
   - calendar and money-unit metadata.

   The no-change comparison stays where it already works, in the engine client (§6).
8. **The interface** shows calendar months, ISK amounts and the percentage change against the no-change path at the same month, with one calm line about the comparison. It shows no notes, approvals or suggestions (§7).
9. **Acceptance tests T1–T12** have concrete numbers and sources (§8). **Work packages A (kernel), B (Iceland today) and C (interface)** have disjoint file ownership (§9).

### What changes from the earlier design

| Earlier design (start-from-today.md) | This plan | Why |
|---|---|---|
| `StartDef` on `ModelDef.starts`, chosen by `EngineOptions.start` | One `OpeningDef` per application profile (`ModelDef.opening`); the profile is the start | The application has one opening; the stationary controls must stay untouched. A start picker would be a second control the owner did not ask for. |
| Kernel-owned reference machine | Keep the engine client's no-change engine (`comparison: 'no-change'`) | It exists, is tested (`tests/ui/no-change-comparison.test.tsx`) and already feeds influences, ideas at play, pipes, balance sheets and charts through `reference` arguments. |
| Manual (key rate held) as the default no-change path | Padlocks unlocked: both rules act from month 1 (decision 0010) | The owner's standing rule. Holding 8.00% is a user choice and is tested (T6). |
| Kernel-generated gap terms | A model-language helper `withStartGaps` that wraps rules through `replaces`, as the growth module does | One rule per variable, visible terms, no kernel special case. |
| `i0` split, `worldPrice0`/`fishPrice0`/`aluminiumPrice0`/`iFnow`, history-aware `initHistory` (stage 0) | Already done | `ruleTarget` reads `neutralRate + piT`; `Machine.initHistory(now, history)` exists. |
| Inflation 5.6% (August), unemployment 6.8% | 5.9% (September CPI); 5.8% (LFS trend) | The snapshot supersedes the August brief. The trend series is Hagstofa's own smoothed estimate; the monthly 6.8% is noisy (§1.2). |
| A long run that misses the target (0.55% inflation) | The growing variant's trends and 2.5% target; its 1,200-month path settles near 2.4% ([growing reference](growing-reference.md)) | The moving start now has a moving reference to return to. |

---

## 1. The opening state

### 1.1 Month 0, units and data periods

- **Month 0 is the end of September 2026.** The first simulated month, t = 1, is October 2026. The model is observed monthly; month t is the calendar month t months after September 2026.
- **Money:** % of 2025 nominal GDP. One unit is ISK 49.41211 bn (§2). Flows are at annual rates.
- **Price indices are 1 at their 2025 averages:** `cpi`, `cpiExTax`, `consumptionDeflator`, `domesticPrice`, `importPrice`, `housingCost`, `housePrice`, `wage`, `exchangeRate`, and the world prices. Real quantities are at 2025 prices.
- **Flows at month 0 are rolling four-quarter sums to 2026Q2.** They are not seasonally adjusted, but annual sums carry no season. Rates and prices are the latest observation.
- **The snapshot's flag:** every one of the 194 records that names a model target carries `directInitialisationSafe: false`. This plan respects it: no record is copied into a position or variable directly. Each value goes through a conversion and a declared mapping, and is checked in the opening report.

Data periods that meet at month 0 (each is recorded per position in the opening report):

| Period | What |
|---|---|
| 30 Sep 2026 | Key rate, exchange rates, bond yields, advertised bank rates |
| Sep 2026 | CPI and its 12-month change |
| Aug 2026 | Bank deposits, bank loans and mortgages, bank equity, M3, CBI balance sheet, wage index, LFS unemployment, house prices |
| Jul 2026 | Pension-fund assets and mortgages, net new mortgage lending |
| 2026Q2 | National accounts flows (rolling four quarters), current account, government balance (rolling four quarters) |
| 2026Q3 | Inflation-expectation surveys |
| 31 Dec 2025 | General-government debt (THJ05181), household tax-return shares by age (2025 tax year) |
| 31 Dec 2024 | Financial accounts: household equity holdings, pension funds' net worth ratio |

### 1.2 Headline opening values

"Gate" means acceptance test T2 fails outside the tolerance. "Warn" means the opening report lists the difference (T11). Model values are in model units unless a unit is given.

| Quantity | Opening value | Model value | Record(s) | Tolerance |
|---|---|---|---|---|
| Key rate | **8.00%** | `keyRate` = 0.08 | `financial.policyRate` (in force since 19 Aug 2026) | exact (≤ 1e-12), gate |
| 12-month CPI inflation | **5.9%** (Sep 2026) | `inflation12` = 0.059; `cpi` = 697.3 / 653.1 = 1.06768 | `macro.cpiInflationYoY`, `macro.cpiIndex`, `macro.cpiAnnualAverage` | ±0.05 pp, gate |
| One-year inflation expectations | **4.3%** | `expectedInflation` = 0.043 | mean of `macro.expectedInflationBusinesses1Y` (4.7) and `macro.expectedInflationMarketAgents1Y` (3.9) | ±0.05 pp, gate |
| Unemployment | **5.8%** | `unemployment` = 0.058 | `macro.unemploymentLFSTrend` (Aug 2026). Cross-checks: `macro.unemploymentLFSSA` 6.8, `macro.unemploymentLFSSA3M` 6.07 | ±0.10 pp, gate |
| Wage growth, 12 months | **5.7%** | `wage`(0) ÷ `wage`(−12) − 1 | `macro.wageGrowthYoY` (Aug 2026) | ±0.10 pp, gate |
| Króna, trade-weighted | **4.7% stronger** than the 2025 average; króna index 104.9 | `exchangeRate` = 0.95321 (up = weaker) | `external.fx.tradeWeightedIndex.relative2025` (30 Sep 2026) | relative 1e-9, gate |
| House prices | 1.9% above the 2025 average; real 4.5% below | `housePrice` = 1.01929 | `macro.housePriceRebased2025Average` (Aug 2026) | relative 1e-9, gate |
| Non-indexed mortgage rate | **9.90%** | `mortgageRateN` = 0.09897 | `financial.mortgageNAdvertised` (mean of three banks) | ±0.05 pp, gate |
| Indexed mortgage rate (real) | **4.65%** | `mortgageRateI` = 0.0465 | mean of `financial.mortgageIAdvertisedLandsbankinn`, `…Islandsbanki`, `…Arion` (4.45, 4.55, 4.94) | ±0.05 pp, gate |
| Government bond rate (average coupon on the stock) | **7.49%** | `bondRate` = 0.0749 | `financial.bondParNominal5Year` (29 Sep 2026) | ±0.05 pp, gate |
| Deposit rate | 7.00% | `depositRate` = `keyRate` − `mD` | No outstanding-weighted rate (`financial.depositOutstandingWeightedRate` is a gap). 3-month fixed rates 7.45–8.00 (`financial.depositFixed3*`), demand deposits 0.05–0.50 | warn |
| Business-loan rate | 10.30% | `loanRate` | `financial.businessPreferredLandsbankinn` (one bank) | warn |
| **Government debt** | **ISK 2,800.7 bn = 56.7% of 2025 GDP** | `govBonds`(G) + `indexedBonds`(G) = 56.680 | `financial.governmentBorrowingDebt` (end-2025), `financial.governmentBorrowingDebtRatioExact` 56.68 | stock ±0.1 bn; ratio to 2025 GDP ±0.05 pp, gate |
| Household mortgage debt | **ISK 2,936.3 bn**, 64.3% indexed | 59.425 | `financial.mortgagesBanksIndexed`, `…Nonindexed`, `…FX` (Aug 2026); `financial.mortgagesPFIndexed`, `…PFNonindexed` (Jul 2026) | ±0.1 bn, gate |
| Pension-fund assets | **ISK 9,326.3 bn**, 41.9% foreign | 188.743 | `financial.pensionAssets`, `financial.pensionForeignShare` (Jul 2026) | ±0.1 bn and ±0.05 pp, gate |
| Household deposits | **ISK 2,113.0 bn** | 42.762 | `financial.depositsHH` 1,996.2 + `financial.depositsNPISH` 116.8 (Aug 2026) | ±0.1 bn, gate |
| Deposits of all non-banks (money in the model) | ISK 3,671.9 bn | 74.312 | `financial.depositsTotal` − `financial.depositsGovernment` (Aug 2026) | ±0.1 bn, gate |
| **Nominal GDP** | **ISK 5,138.9 bn a year** | `nominalGDP` and `gdpTrailing12` = 104.000 | `macro.gdpNominalRolling4Q` (2025Q3–2026Q2) | ±1%, gate (it is an identity at month 0) |
| Real GDP at 2025 prices | 100.3 | `output` | Bridge: 100 × (1 + `macro.gdpRealGrowthQuarterYoYSA` 0.3%) | ±1%, warn |
| General-government balance | −2.76% of GDP (−ISK 141.7 bn) | deficit at month 0 | `fiscal.balance.rolling4q` | ±0.25 pp after the solve, gate |
| Current account | −3.0% of GDP | `currentAccount` | `external.currentAccount.rolling4q.pctGDP` | ±1 pp, warn |

The government debt chart divides debt by the past 12 months' GDP, so it opens at 2,800.7 ÷ 5,138.9 = **54.5%**. The 56.7% is the published ratio: the same end-2025 stock divided by 2025 GDP. The debt is not rolled forward with 2026 deficits, because the snapshot has no general-government debt after end-2025. The opening report shows both ratios on one row.

### 1.3 Instrument positions

Every value is converted as `model = ISK bn ÷ 49.41211`, in the Ctx sign convention (assets and liabilities both positive). For each instrument, exactly one position is the **residual**: the one position not set from a record, computed from an identity. In a two-sided instrument, the kernel fills the other side as its mirror. The kernel checks that no other position is filled silently (T1). A residual may not be negative: the build fails with the numbers rather than open on an impossible balance sheet.

| Instrument | Positions from records (ISK bn → units) | The residual | Identity it closes | Cross-check (T11 warns beyond ±10%) |
|---|---|---|---|---|
| `deposits` | HY 297.4 (6.018), HW 923.9 (18.697), HO 891.7 (18.046): households and NPISH 2,113.0, split 14.07 / 43.72 / 42.20% (`financial.householdTaxDepositsShare{Y,W,O}`). The six firms hold 1,193.9 (24.162): non-financial corporations 834.9 (`financial.depositsNFC`) plus other financial corporations other than pension funds 359.0 (542.9 − 183.9; their deposits are money the model must hold somewhere), split by the 2025 opening shares: FC 108.4, FR 877.4, XF 37.4, XA 33.2, XT 67.3, XO 70.2. PF 183.9 (3.721, `financial.depositsPF`). W 181.1 (3.666, `financial.depositsNonresident`) | **B** = Σ holders = 3,671.9 (74.312) | Instrument balance | Bank deposits less government deposits: 3,802.0 − 130.1 = 3,671.9 (exact). Government deposits at banks (130.1) are a mapping loss: the model's government keeps its money at the central bank |
| `treasuryAccount` | G 420.2 (8.505): Treasury ISK account 109.8 + Treasury FX deposit 310.4 (`financial.centralBankTreasuryISKAccount`, `…TreasuryFXDeposit`) | **CB** (mirror) | Instrument balance | The FX deposit is held as krónur in the model (stated in the report) |
| `reserves` | none | **B** = CB assets − treasury account − CB equity = 948.8 + 17.4 − 420.2 − 38.8 = 507.2 (10.265); CB mirrors | CB balance sheet, with CB equity 38.8 from `financial.centralBankNetEquity` | Banks' deposits, including at the CBI, 403.3 at end-2024 (the note on `bankFinancialAssets` in `current-hagstofa.json`): 1.26, warn |
| `mortgagesN` | Lenders: B 848.5 (17.172; non-indexed 848.48 + FX 0.04), PF 199.6 (4.039). HY 235.5 (4.766) = 22.47% of the total (`financial.householdTaxMortgageDebtShareY`) | **HW** = total − HY = 812.6 (16.445) | Instrument balance | The older group's 9.1% is folded into HW, as in `steady.ts`. Loans from ÍL-sjóður and HMS are not in the data (`financial.mortgagesAllLendersCurrent` is a gap): a mapping loss |
| `mortgagesI` | B 1,236.6 (25.026), PF 651.7 (13.188), HY 424.3 (8.587) | **HW** = 1,463.9 (29.627) | Instrument balance | Indexed share 64.3% (`hhDebtIndexedShare`, 64.4%) |
| `businessLoans` | B 2,231.1 (45.153, `financial.bankBusinessLoans`). Borrowers: FC 456.6 (construction loans, the note on `corpLoansBanksISKbn` in `current-financial.json`), and XF 15%, XA 1%, XT 12%, XO 5% (placeholders `loanShareX*`, kept) | **FR** = 1,038.2 (21.011) | Instrument balance | Corporate debt to all lenders 3,933.1 (estimate): banks' share 56.5% (`financial.corporateDebtBankShare`) |
| `govBonds` | G 1,839.8 (37.233) = debt 2,800.7 − indexed 960.9. CB 17.4 (0.353, `financial.centralBankGovernmentBonds`). HO 295.6 (5.982, `financial.householdFinancialBonds`, 2024, all debt securities). W 516.1 (10.445) = 7.2% of Treasury bonds 1,570.5 (the Lánamál share in `calibration.json`; `financial.treasuryBondsNominalValue`) + Treasury foreign debt 403.0 (`financial.centralTreasuryForeignDebt`). PF 0 = max(0, PF Treasury holdings 913.5 − indexed 960.9) | **B** = 1,010.6 (20.453): banks and every holder the model does not have (funds, insurers) | Instrument balance | The Treasury's foreign-currency debt is held by W as króna bonds in the model (a mapping simplification, §10 R2) |
| `indexedBonds` | G 960.9 (19.447, `financial.centralTreasuryIndexedDebt`) | **PF** (mirror; the model's only holder) | Instrument balance | PF's Treasury holdings, 913.5 (`financial.pensionTreasuryBondsNominalValue`): the 47.5 excess is indexed debt held by others, a mapping loss |
| `bankBonds` | none | **B** issues B's assets − deposits − equity = 5,834.1 − 3,671.9 − 830.1 = 1,332.1 (26.959); PF mirrors | B balance sheet, with equity 830.1 (`financial.bankBookEquity`) | Banks' debt securities 1,499.4 at end-2024 (`financial.bankDebtSecuritiesLiabilities2024`): 0.89, warn. Bank assets in the model 5,834.1 against 6,582.3 (`financial.bankAssets`): 0.89, warn |
| `shares` | Households 1,185.6 (`financial.householdFinancialEquitiesUnits`, 2024), split 1 : 10 : 5 (the `eqH*` placeholders): HY 74.1, HW 741.0, HO 370.5. W 494.1 (`eqW` placeholder; FDI equity is a gap) | **PF** holds PF assets − its other positions = 9,326.3 − 7,237.9 = 2,088.4 (42.265). The six issuers are allocated as `steady.ts` does (by net assets) | PF balance sheet | PF domestic equities and units, 1,377.2 (`financial.pensionDomesticEquitiesUnits`): 1.52, warn |
| `fxReserves` | CB 948.8 (19.203, `financial.centralBankForeignReserves`) | **W** (mirror) | Instrument balance | USD 7,814.6 m (`financial.fxReservesUSDm`) |
| `foreignAssets` | PF 3,909.8 (79.126, `financial.pensionForeignAssets`) | **W** (mirror) | Instrument balance | — |
| `pensionRights` | PF issues PF assets × (1 − net-worth share) = 9,326.3 × 1.00592 = 9,381.5 (189.862). The net-worth share is −0.59%, from the financial accounts (`financial.pensionNetFinancialAssets2024` ÷ `financial.pensionFinancialAssets2024`). HW 55% (`eShareW` placeholder) = 5,159.8 | **HO** = 4,221.7 | Instrument balance | Households' pension entitlements, 9,540.6 at end-2024 (`financial.householdFinancialPensionInsurance`): 0.98 |
| `kronaLoansW` | 0 | — | — | No record. The instrument starts empty, as in 2025 |
| `businessArrears` | 0 | — | — | Every sector pays as usual at month 0 |
| `homes` (real) | Value 13,044.7 (`financial.residentialAssessment2027`, valued February 2026) ÷ `housePrice` 1.01929 = quantity 259.0. Split 9.76 / 59.69 / 30.55% (`financial.householdTaxRealEstateShare{Y,W,O}`) | none (a real asset) | — | Tax-return real estate, 11,081.6 (2025): 1.18, warn (assessed against tax values) |
| `capital` (real) | The stationary quantities, kept: FC 12.77, FR 149.73, XF 13.85, XA 2.29, XT 6.88, XO 14.49 | none | — | No capital-stock record. Placeholder, listed |

Net worth at month 0, compared in the report (warnings only, because the scopes differ):
- **Banks:** ISK 830.1 bn (data, by construction). Model capital ratio 28.0% (risk weights `rwM` 0.35, `rwL` 1) against 23.3% published for the D-SIBs (`financial.bankCapitalRatio`).
- **Central bank:** 38.8 (data, by construction).
- **Pension funds:** −55.2.
- **Government:** −2,380.5, against −1,889.9 in `financial.governmentNetFinancialAssets`. The model leaves out government equity and loans; the data include pension liabilities.
- **Rest of the world:** −3,667.3, so Iceland's model net position is +3,667.3 against the published +2,408 (`external.niip.Q2_2026`): 1.52. The model has no FDI liabilities, firms' foreign loans (14.9% of corporate debt) or banks' foreign funding.
- **Households, net financial worth:** 10,039.4 against 9,281.4 (`financial.householdFinancialNetWorth`, 2024): 1.08.

Reconciliation order: convert every record and record its period; set the data positions; residuals in this order: mortgages (HW), business loans (FR), government bonds (B), deposits (B), central bank (reserves), bank bonds, PF shares, then the share issuers; the kernel fills the mirrors; T1.

### 1.4 Variables with a past

The compiled `iceland-growing` model has **124 variables read with a lag or adjusted gradually**. 49 of them are partial-adjustment states. The rules read six variables further back than one month, so these get a history:
- `cpi`, `cpiExTax` (12-month inflation);
- `netMortgageLending`, `netCreditTotal` (credit impulses);
- `nominalGDP`, `output` (`gdpTrailing12`, `outputTrailing12`).

`wage` also gets a 12-month history, for the wage check in T2. `lagReach` (§6) confirms the list on the compiled profile, and the opening fails if a variable read further back has no history.

Kinds of treatment:
- **Obs**: set from a record.
- **Eval**: an identity or rule evaluated at month 0 and checked.
- **Lat**: latent, solved in the opening solve (§3.2).
- **Tgt**: a smoother, set equal to its own input at month 0.
- **0**: a shock or memory state, starting empty.

| Family (count) | Variables and treatment | Value at month 0, source, history |
|---|---|---|
| Central bank (4) | `neutralRate` **Lat**: solved so the rule's target equals the key rate in force. `ruleTarget` **Eval**. `ruleAnchor` **Obs** = 0.08. `reserveIncomeKept` **0** | `neutralRate` ≈ 2.70% (rule arithmetic, §4.3; within `i0` ± `rStarBand`) |
| Banks (1) | `bankProfitSmoothed` **Tgt** | — |
| Prices (12) | `cpi`, `cpiExTax` **Obs** with a 12-month history. `domesticPrice`, `importPrice` **Obs** = 1.00819 × 1.057 = 1.06566. `housingCost` **Obs** = 1.07391, chosen so that the CPI identity with `omH` = 0.245 holds exactly. `consumptionDeflator` **Obs** (bridge). `labourCostSeen`, `importCostSeen` **Lat**. `vatInPrices` **Tgt** = `vat0`. `inflation12ExTax` **Eval** = 5.9%. `adaptiveInflation` **Lat** = (4.3 − 0.5 × 2.5) ÷ 0.5 = 6.1%. `expectedInflation` **Eval** = 4.3% (checked) | History: log-linear from `cpi`(−12) = 1.06768 ÷ 1.059 = 1.00819 to `cpi`(0), a smooth path at the 12-month rate rather than raw seasonal months. The components share the ex-housing rate 5.7% (`macro.cpiExHousingInflationYoY`); the domestic and import split is a gap (`macro.gapCpiImportDomesticWeights`) |
| Housing and mortgages (8) | `housePrice` **Obs** 1.01929. `logRealHousePrice` **Obs** = ln(1.01929 ÷ `cpi`(−1)). `realMortgageRate` **Eval**. `settledMigrants`, `permIncomeY`, `permIncomeW` **Tgt**. `netMortgageLending` **Obs** = 16.13 bn a month × 12 = 193.6 bn a year (3.917), `financial.netNewMortgageLendingISKbnMonth`. `netCreditTotal` **Obs** = (16.55 + 25.38) × 12 = 503.2 (10.184), `financial.netNewLendingHouseholdsMovingAverageISKbnMonth` + `financial.netNewLendingFirmsISKbnMonth` | Both credit series: 12 months flat at today's rate (no year-earlier record), so both credit impulses open at 0 |
| Households (6) | `consumptionY/W/O` **Obs**: rolling-4Q consumption 2,518.4 (50.967, `macro.consumptionNominalRolling4Q`) ÷ `cpi`, split by the 2025 opening shares. Gaps on Y and W; `c0O` is re-solved (§3.3). `grossIncomeY/W`, `realDisposableIncome` **Eval** | — |
| External (12) | `exchangeRate` **Obs** 0.95321. `logExchangeRate` = −0.04792. `kronaSentiment` **Lat**. `sentimentShock` **0**. `realExchangeRate`, `worldPriceAnchor`, `kronaInflowW`, `foreignDemandFelt`, `tourismFelt`, `profitabilityFish`, `profitabilityAluminium` **Tgt**. `currentAccount` **Eval** (warn against −3.0%) | — |
| Firms (22) | `investmentPlan{j}`, `investment{j}` **Obs**: business GFCF, rolling 4Q 887.7 (`macro.businessInvestmentNominalRolling4Q`) ÷ `domesticPrice`, split by the 2025 opening shares. `profits{j}Smoothed` **Tgt**. `output`, `nominalGDP` **Eval** (checked). `gdpTrailing12`, `outputTrailing12` **Obs** | `nominalGDP` and `output`: 12 months flat at 104.000 and 100.3 (the rolling sums) |
| Labour (13) | `wage` **Obs** (bridge, §1.6). `employment{j}` **Obs**: each sector's 2025 opening level × its register ratio, 12-month average over the 2025 average. FC 19,138 ÷ 19,167; XF 7,790 ÷ 7,836; XA 2,007 ÷ 2,050; XT 28,886 ÷ 29,228 (`macro.employmentRegisterRollingIndustry{13,32,9,31}`, `macro.employmentRegisterAnnual2025Industry{…}`). FR and XO so that the total ratio is 225,492 ÷ 225,194 = 1.0013 (`macro.employmentRegisterRolling12M`, `macro.employmentRegisterAnnual2025`). `unemployment` **Eval** = 5.8% (the `unemployed{g}` gaps size it). `valueAddedPrice` **Eval**. `wageGapSeen` **Tgt**. `labourInflow`, `benefitSearch`, `settlementJump` **0** | `wage` history: 12 months back at 5.7% |
| Government (7) | `taxRuleAnchor` **Obs** = today's effective income-tax rate (the rule starts at rest). `incomeTaxY/W`, `familyBenefitsY/W`, `bondIssue` **Eval**. `bondRate` **Obs** = 0.0749 | — |
| Pensions (2) | `pfIncomeSmoothed` **Tgt**. `foreignAssetPurchases` **Obs** = 72 bn in eight months × 12 ÷ 8 = 108 bn a year (2.186), from the note on `pfForeignShare` in `current-financial.json` | — |
| Growth (6) | `productiveCapitalReal{j}` = the `capital` quantities (as `initialBaselineForGrowingModel` does) | — |
| Financial fragility (31) | `investmentDesired{j}`, `employmentDesired{j}` **Tgt** (gaps on `employmentDesired`, §3.3). `cashServiceCoverage{j}` **Eval**. `loanWriteoff{j}`, `distressAge{j}` **0**. `lenderConfidence` at its normal value | — |

The growing variant's reference indices (`growthRealIndex`, `growthPopulationIndex`, `growthProductivityIndex`, `growthWorldDemandIndex`, `growthPriceIndex`) are 1 at month 0, so the trends compound from September 2026.

### 1.5 Parameters the opening sets

The opening sets parameters after the anchors are solved, as `forkParams` does. Every one carries provenance, and the report lists each beside its anchor value.

**P: policy settings, today's values (never gaps).**
- `piT` = 0.025 (`financial.inflationTarget`; already the growing variant's value).
- **Income tax.** `tau0` is solved so that month-0 revenue equals the latest four quarters, ISK 2,187.0 bn (`fiscal.revenue.rolling4q`). `vat0`, `tauF` and `rr` keep their 2025 values (`gap.fiscal.tau0` and `gap.fiscal.vat0` say no current effective rate was verified), and `css` = 6.35% (`statutory.payroll.general`, already equal).
- **Spending.** `gHealth`, `gEdu`, `gOther`, `gInv`, `trOA` and `trFam` are scaled by one common factor, so that month-0 non-interest spending equals `fiscal.expenditure.rolling4q` (2,328.9) less the model's month-0 interest bill. The two together give the balance of −2.76% of GDP.
- `tga` = 8.505, today's treasury account, so `treasuryTopUp` (12 a year) issues no bonds in month 1.
- `debtR0` = the model's debt ratio at month 0 (54.5%), so the income-tax response to debt starts at rest. The 2025 value, 56.7%, would cut taxes from month 1 for no reason but the change of denominator.
- `fxr` is set so that the reserve target equals today's reserves at month 0: about 20.1, against 19.2% of 2025 GDP. The target is valued at today's exchange rate and output.
- `kapT` = the model's capital ratio at month 0, 28.0%, so bank dividends do not pay out a gap at `lamEq`.
- Already equal to data, confirmed by T2:
  - `ltvLimit` 0.80, `ltvYExtra` 0.10 (`financial.mortgageLTV*`);
  - `dstiY` 0.40, `dstiW` 0.35 (`financial.mortgageDSTI*`);
  - `floorN` 0.055, `termN` 40, `floorI` 0.03, `termI` 25 (`financial.mortgageStress*`).

**C: contract terms on today's stocks, from records.**

| Parameter | Today | Was | Record |
|---|---|---|---|
| `sMN` | 1.897 pp | 1 pp | `financial.mortgageNAdvertised` − 8.00 (advertised rates; the outstanding-weighted rate is a gap) |
| `rMI0` | 3.65% | 2.5% | 4.65 − `psiIdx` 0.4 × (8.00 − (3.00 + 2.50)) |
| `sL` | 2.30 pp | 2.5 pp | `financial.businessPreferredLandsbankinn` − 8.00 (one bank; flagged) |
| `rBI0` | 3.41% | 2.0% | `financial.bondParIndexed5Year` |
| `bondRate` history | 7.49% | `i0 + sB` | `financial.bondParNominal5Year`. `sB`, the spread on new issues, keeps 0.5 pp: no record measures it, and the inverted yield curve (7.82 / 7.49 / 7.08 at 3 / 5 / 10 years) is the market expecting cuts, which the model's rule supplies |
| `theta` | 0.643 | 0.65 | Indexed share of the stock (§1.3) |
| `payout` | 361.5 ÷ HO's rights = 8.56% a year | 18.07% (solved; payouts 13.9% of GDP) | `financial.pensionDomesticBenefitsPaid2025` (7.32% of 2025 GDP). This fixes appendix A5 of the earlier design |
| `mD`, `sBB` | kept, 1 pp | | No record; flagged |

**N-a: holding preferences, re-set to today's ratios.** These close fast (`firmCashSpeed` 12 a year, `lamBW` 2, `lamReb` and `lamFA` 0.5), so keeping 2025 values would cause large, artificial portfolio flows in month 1.
- `dep{j}0` = each firm's deposits ÷ `nominalGDP`(0).
- `bW0` = W's government bonds ÷ `nominalGDP`(0) = 0.1004.
- `boSh0` = 295.6 ÷ (891.7 + 295.6) = 0.249.
- PF shares: `bbSh0` = 1,332.1 ÷ 9,326.3 = 0.1428; `dPF0` = 0.0197; `nwPF0` = −0.0059.
- `pfForeignTarget` = 0.4192 (`financial.pensionForeignShare`).
- `krona0` = W's króna holdings, 181.1 + 516.1 = 697.2 bn (14.11).

**N-b: normal levels.** These keep their structural values, except for capacity and population:
- `pop{Y,W,O}` from 1 January 2026 (`macro.populationYoung` 96,712, `macro.populationWorking` 157,307, `macro.populationOld` 55,424). The labour-force normalisers follow with 2025 participation, and `uBase` stays the 2025 normal rate, 4.24% (2025 LFS average 4.3%, series `unemploymentLFS2025` in `current-hagstofa.json`).
- `potentialOutput` (the base of `referenceCapacity`) = real output ÷ (1 + the labour-market output gap at month 0) = 100.3 ÷ (1 − 0.0249) = 102.9. The CBI's own gap estimate is a gap (`macro.gapPotentialOutput`). This reading is the one the key-rate rule uses, so the two agree.
- Export normals at today's rolling volumes, valued at today's prices and exchange rate: `xFish` (marine 381.0, `external.exports.marine.rolling4q`), `xAlu` (301.0), `xTour` (634.8), `xOther` (700.7). These are demand normals, like capacity, so exports need no start gap.

**Re-solved, permanent and flagged:** `c0O`. The payout fix lowers older households' income by about 6.6 points of GDP, so their autonomous spending is re-solved so that their desired consumption at month 0 equals their opening consumption. This is a known structural misfit of the steady state, not a fading gap.

### 1.6 What is not yet data (bridges and placeholders)

The opening uses the following. Each appears in the report as `assumed` or `placeholder`, and each is a follow-up for the data generation script, which is not in the repository.

| Item | Bridge | Missing record |
|---|---|---|
| `wage` level against its 2025 average | `cpi`(Aug 2026) × (1 + `macro.realWageGrowthYoY` 0.035%) = 694.6 ÷ 653.1 × 1.00035 = 1.06391 | LAU04000 2025 average |
| CPI component levels | 2025-average ratios assumed equal to the headline's at month −12 | VIS01000 sub-index 2025 averages, import and domestic split |
| Real GDP level | 2025 × (1 + SA year-on-year growth 0.3%) | QNA seasonally adjusted volume level |
| `consumptionDeflator` | Same bridge as `cpi`, at the ex-housing rate | CPILH 2025 average |
| World, fish and aluminium prices | 1 × the growth price index (`gap.external.worldPrice0` and so on) | Prices relative to 2025 |
| Placeholders | `eShareW` 0.55; `loanShareX*`; the `eqH*` age split; `eqW`; capital quantities; `mD`, `sBB`, `sB` | Sector and age splits |

---

## 2. The money unit

- **Model money stays in its unit.** One unit is 1% of 2025 nominal GDP: ISK 4,941.211 bn ÷ 100 = **ISK 49.41211 bn** (`macro.gdpNominalAnnual`; `GDP_BN` in `src/models/iceland/util.ts`). Flows are at annual rates.
  - Every parameter and `calibration.json` value is already in this unit.
  - The stationary controls keep GDP = 100.
  - The ISK value never changes with a data vintage.
  - Today's GDP is 104.0 units.
- **`ModelDef.moneyUnit`** = `{ label: 'ISK bn', perUnit: 49.41211, basis: 'Hagstofa THJ01102: 2025 GDP at current prices, ISK 4,941.211 bn (September 2026 vintage); one model unit is 1% of it' }`.
- **Conversions:**
  - a flow becomes ISK bn a year, value × 49.41211; a month's amount is ÷ 12;
  - a stock becomes ISK bn, value × 49.41211;
  - a real quantity becomes ISK bn at 2025 prices;
  - a rate held as a fraction becomes % (× 100);
  - an index is shown as 2025 = 100, or as the source's own base where the interface shows a record beside it.
- **One fix in the level reports:** `isk()` in `modules/indicators.ts` and the money indicators in `modules/financial-fragility.ts` divide by `c.base('nominalGDP')`. On an opening that is not 100 this would rescale every amount by 1 ÷ 1.04. They must use the fixed unit (`GDP_BN / 100`). On the stationary models the two differ by at most 1e-16 relative, and no golden or report holds a level in ISK.

---

## 3. Smoothness

### 3.1 A consistent month 0

The kernel evaluates the whole schedule once at the opening state. Every identity must reproduce any value the opening gives to within 1e-9 relative (T2): for example, the CPI as the weighted sum of its components, `nominalGDP` as the sum of its components, the 12-month inflation from the history, and `realHousePrice`. Terms, desired values and regimes at month 0 come from this evaluation, under every padlock configuration (`byMask`), as `initialBaselineForGrowingModel` already does.

### 3.2 Latent states: solved, not observed

| State | Solved so that | Record |
|---|---|---|
| `neutralRate` | The rule's target at month 0 equals the key rate in force, 8.00%: the central bank is where its rule says. About 2.70% | `financial.policyRate`, and the inputs of §4.3 |
| `adaptiveInflation` | `expectedInflation` = 4.3% | The expectation surveys |
| `labourCostSeen` | Month-1 change in `domesticPrice`, annualised, equals the six-month CPI rate, 5.7% | `macro.cpiAnnualized6M` |
| `importCostSeen` | The same for `importPrice` | `macro.cpiAnnualized6M` |
| `kronaSentiment` | Month-1 change in `logExchangeRate` equals its recent drift, −2.1% a year | `financial.tradeWeightedIndexNarrowYoY` |

Smoothers with no data (the `*Smoothed` profits, `permIncome*`, the `*Felt` demand states, `worldPriceAnchor`, `kronaInflowW`, `realExchangeRate`, `profitability*`, `vatInPrices`, `wageGapSeen`, `investmentDesired{j}`) are set equal to their input at month 0. A gap there would move dividends, investment or prices for no reason.

### 3.3 Fading start gaps

A start gap is one extra term on a behaviour rule: `g · exp(−f · t)`, with t in years from month 0. It is labelled "Today's gap from this rule, fading (half gone in 8 months)", tagged with the concept `start-gap`, and shown in the inspector like any other term. g is solved in the opening solve; f is a parameter with provenance `assumed`. On an adjusting rule the gap is added to the desired value before the adjustment; on a rule with `combine` it is added after combining. Gaps are allowed only on BEHAVIOUR rules, never on a rule whose target is a stock (stocks change only through postings), and never on POLICY, CONTRACT or IDENTITY rules.

| Rule (target) | What the gap stands for | Solved to match | Unknowns | Fade (half-life) |
|---|---|---|---|---|
| `wageGrowth` | Contracted raises the wage curve does not explain (the 2024 agreements run to 2028) | `wage` growth over 12 months at month 0 = 5.7% (`macro.wageGrowthYoY`); the rule alone gives about 3.3% | 1 | 1/yr (8.3 months) |
| `consumptionY`, `consumptionW` | Spending momentum | Month-1 real change = +0.8% a year (`macro.consumptionRealGrowthQuarterYoY`) | 2 | 1/yr |
| `investmentPlan{j}` (6) | Investment momentum | Month-1 change in total business investment = +10.1% a year (`macro.businessInvestmentRealGrowthQuarterYoY`); one common relative gap for all six | 1 | 1/yr |
| `employmentDesired{j}` (6) | Hiring momentum | Month-1 change in employment = +0.13% a year (register ratio above); one common relative gap | 1 | 1/yr |
| `unemployed{Y,W,O}` | Labour supply (immigration and participation) outrunning jobs | `unemployment` = 5.8% at month 0, split by the 2025 age pattern (the age bands are a gap in the data) | 3 | 0.5/yr (16.6 months) |
| `logRealHousePrice` | House-price momentum | Month-1 real change = −3.2% a year (`macro.housePriceRealGrowthYoY`) | 1 | 1/yr |
| `mortgageDemandY`, `mortgageDemandW` | New lending above the rule's desired pace | Net new mortgage lending at month 0 = 3.917 (193.6 bn a year), split by `mortShY`; one common gap | 1 | 1/yr |

That gives 10 gap unknowns. With the 5 latent states, `tau0` and `c0O`, **the opening solve has 17 unknowns** and the same number of targets. It reuses the steady-state Newton and Levenberg–Marquardt machinery (`numerics.ts`): each evaluation loads the candidate opening, takes one month and reads the residuals from months 0 and 1. The spending factor, `tga`, `debtR0`, `fxr`, `kapT` and the N-a ratios are closed-form and set before the solve. The solve fails if its largest residual is above 1e-9 after polishing.

Guards (T11): a gap larger than 25% of its rule's month-0 value is a warning. The investment gap is the one most likely to reach it, because 10.1% is a noisy quarterly rate.

### 3.4 What stays put in month 1

- Stocks change only through postings from month 1.
- The fast holding targets are at today's ratios (§1.5 N-a), so `firmCashSpeed`, `treasuryTopUp`, `lamBW` and `lamFX` see no gap.
- The two policy rules start at rest (§4).
- T4 bounds every remaining month-1 change.

---

## 4. Policy today

### 4.1 Lever defaults and their unchanged marks

The profile sets each lever's `default` to today's setting. The default is the lever's unchanged mark and what "back to the start value" restores.

| Lever | Start value | Note |
|---|---|---|
| `keyRate` | **8.00** | Padlock unlocked: the lever shows the live rate, marked "auto". The mark stays at 8.00 |
| `incomeTax` | 0 pp | Relative to today's effective rate (`tau0`, solved). The definition names that rate once |
| `vat` | 0 pp | Relative to the effective VAT rate, kept from 2025 |
| `health`, `education`, `otherServices`, `publicInvestment`, `oldAgeTransfers`, `familyBenefits` | 0 | Relative to today's levels (§1.5 P) |
| `unemploymentBenefits` | 0 pp | Today's replacement rate (`rr`) |
| `ltvCap` | 80 | `financial.mortgageLTVGeneralCap` |
| `dstiCap` | 0 pp | Rules 1300/2025: 40% / 35% |
| `keyRateLock`, `incomeTaxLock` | 0 (unlocked) | The owner's rule: padlocks start unlocked |
| The rest (shocks, world, migration, bond buyers, `pfForeign`) | Their current defaults | None describes a policy setting of today |

`LeverDef.default` stays 3 in the stationary `iceland` model, where `HELD_RATE` in `calibration.ts` and the goldens use it.

### 4.2 The padlocks start unlocked

From month 1, the central bank's rule sets the key rate and the debt rule sets the income-tax adjustment, on the no-change path and on every run. Both rules start at rest:
- the rule's target equals 8.00% at month 0 (`neutralRate`, §3.2);
- `debtR0` equals today's debt ratio (§1.5).

So nothing jumps when the clock starts, and every later move is the rule's response to how the economy evolves. When the user moves a lever, it locks at that value and everything else reacts. Unlocking hands it back to its rule, which steps from the value in force (decision 0010).

### 4.3 What the central bank's rule does in the first two years

The rule (`ruleTarget`, decision 0012):

```
target = (neutral estimate + 2.5) + 1.3 × (expected inflation − 2.5) + 0.5 × (12-month inflation at constant VAT − 2.5) + 0.8 × (4.24 − unemployment)
```

The key rate closes about 11% of the gap to the target each month (`lamPol` 1.4 a year).

At month 0: 5.20 + 1.3 × 1.8 + 0.5 × 3.4 − 0.8 × 1.56 = **8.00**, with the neutral estimate at 2.70%.

The table below is **rule arithmetic, not a model run**. It feeds assumed paths for inflation, expectations and unemployment into the rule, including its neutral-rate learning (`kappaR`, `kappaU` 0.15). The central path is shaped on the CBI's forecast (Monetary Bulletin 2026/3): inflation averaging 3.6% in 2027 (`macro.cpiInflationForecastAnnualAverage2027`) and unemployment 5.9% in 2026 and 5.2% in 2027 (`macro.unemploymentForecast2026`, `…2027`).

| Path (inflation, expectations, unemployment at months 12 and 24) | Month 6 | Month 12 | Month 18 | Month 24 |
|---|---|---|---|---|
| Central (4.0 / 3.6 / 5.5; 3.0 / 3.0 / 5.2) | 7.79 | 7.31 | 6.77 | **6.23** |
| Slow disinflation (4.6 / 3.9 / 5.6; 3.6 / 3.3 / 5.4) | 7.88 | 7.62 | 7.24 | 6.78 |
| Fast disinflation (3.4 / 3.3 / 5.4; 2.6 / 2.8 / 5.0) | 7.70 | 7.01 | 6.32 | 5.78 |
| Market participants' survey, 10–12 Aug 2026 | | 8% in 2026Q3 | | **6.25%** in two years |

The survey is in the note on `expInflMarket2y` in `current-financial.json`. On the central path the rule cuts gradually from the start of 2027 and is within a few hundredths of the market's 6.25% at two years. The model's own disinflation decides the actual path: the earlier design's prototype disinflated faster (3.2% at month 12 with 8% held), which would cut sooner. T5 gates the result against wide, sourced bands, and the no-change golden (T10) records it.

The **debt rule**, unlocked, raises income tax only as debt rises above today's ratio (`phiTau` 0.25 points per point of debt, phased in at `lamTau` 0.5 a year). With a deficit of 2.76% of GDP and nominal growth near 4–6%, the ratio moves slowly and so does the tax. Its counter-cyclical form applies only while the key rate is locked (decision 0016).

---

## 5. The application's default model

### 5.1 The profile

- **`iceland-today`**, labelled "Iceland Inc. · today". It is built as `createGrowingFinancialModel({ id: 'iceland-today', modelTransform })`. The transform applies today's parameters (§1.5), lever defaults (§4.1) and start gaps (§3.3). The profile also declares:
  - `opening: ICELAND_OPENING` (id `iceland-2026-09-30`);
  - `calendar: { month0: { year: 2026, month: 9 } }`;
  - `moneyUnit` (§2).
- **Growth assumptions:** the defaults of the growing variant (real 1.4%, population 0.5%, world 3.0%, prices 2.5%, `GROWTH_DEFAULTS`), unchanged. They now compound from September 2026.
- **The description** says plainly: the economy as published on 30 September 2026, then the model's own rules; a teaching model, not a forecast.

### 5.2 Registry and controls

| List | Contents | Used by |
|---|---|---|
| `models` (`src/models/index.ts`) | `reference`, `iceland`, unchanged | The harness, the lever reports, the goldens and the calibration checks: the stationary controls for mechanisms |
| `applicationModels` | `iceland-today`, `iceland-growing`, `iceland`, `reference` | The interface |
| `PREFERRED_MODELS` (`src/ui/model/registry.ts`) | `iceland-today`, `iceland`, `reference` | The model the application opens |
| `LINK_ONLY_MODELS` (new, `registry.ts`) | `iceland-growing` | Opens from a link but is not listed in the switcher, so the switcher stays short and old links still replay exactly |

`createRegisteredEngine(def)` builds the anchors as now (the steady state, or `initialBaselineForGrowingModel` for a growing model). When `def.opening` exists, it passes them to `openingBaseline` and hands the result to `createEngine` as its baseline. The engine client's no-change engine is created from the same baseline (`baseline: e.baselineData`, as now), so it opens on the same month 0 bit for bit.

### 5.3 Scenarios and share links

- **`Scenario.opening?: Id`** (optional) records the opening a scenario was made from; `scenario()` writes it. The format stays version 2, because the field is additive and older readers ignore it.
- **The link key `o`** carries it: `#m=iceland-today&v=2&o=iceland-2026-09-30&t=24&e=1:keyRate:7.5&x=…`. It is written by "Share scenario".
- **On load:**
  - A link whose `o` matches the model's opening replays exactly.
  - A link from an earlier opening, after a data refresh, replays its events on the current opening, with one line in the existing link-notice place: "This link was made from Iceland on 30 September 2026; it now starts from <date>." Lever events are levels and times, so they stay meaningful.
  - A link without `o` for `iceland-today` is treated as the current opening.
- Links to `iceland-growing`, `iceland` and `reference` are unchanged.

---

## 6. The engine contract

Engineers A, B and C build against these names and types. They are additive: absent, every existing model and test behaves bit for bit as now (T9).

```ts
/* ---------- src/core/types.ts (A) ---------- */

/** A calendar month; month runs 1–12. */
export interface CalendarMonth { year: number; month: number }

/** How model money is shown in a currency. Model money stays in its unit (% of baseline annual GDP). */
export interface MoneyUnit {
  label: string;     // 'ISK bn'
  perUnit: number;   // 49.41211: currency units per model unit
  basis: string;     // where the conversion comes from, in plain English
}

/** Where a month-0 value comes from. */
export interface OpeningSource {
  basis: 'data' | 'residual' | 'mirror' | 'solved' | 'evaluated' | 'assumed' | 'placeholder';
  records?: Id[];    // observation ids, e.g. 'financial.depositsHH'
  period?: string;   // e.g. '2026-08-31'
  note?: string;     // the conversion, or the identity a residual closes
}
export interface OpeningStock { at: [Id, Id]; value: number; source: OpeningSource }   // Ctx sign convention, model units
export interface OpeningVar { value: number; history?: number[]; source: OpeningSource } // history: months −1, −2, …
export interface OpeningParam { value: number; provenance: Provenance }

/** A month-0 value the opening must reproduce (T2), or report (T11) when gate is false. */
export interface OpeningCheck {
  id: Id; label: string; records: Id[];
  measure: (c: IndicatorCtx) => number;   // in the unit of `value`
  value: number; tolerance: number; gate: boolean;
}
/** A condition the opening solve meets, read from months 0 and 1. */
export interface OpeningTarget {
  id: Id; describe: string; records: Id[];
  residual: (month0: IndicatorCtx, month1: IndicatorCtx) => number;
}
/** What a model's opening builder returns. */
export interface OpeningState {
  stocks: OpeningStock[];
  /** Exactly one position per financial instrument, which the kernel fills so the instrument balances. */
  fills: Record<Id /* instrument */, Id /* player */>;
  vars: Record<Id, OpeningVar>;
  params: Record<Id, OpeningParam>;
  solve?: { unknowns: ({ var: Id } | { param: Id })[]; targets: OpeningTarget[] };
  checks: OpeningCheck[];
}
/** Read-only view of the anchor state (the solved steady state, or a growing model's mapped state). */
export interface OpeningAnchors {
  param(id: Id): number;
  value(id: Id): number;
  stock(instrument: Id, player: Id): number;
}
/** A dated opening: the economy at month 0, from data. */
export interface OpeningDef {
  id: Id;                // 'iceland-2026-09-30'
  label: string;         // 'Iceland on 30 September 2026'
  asOf: string;          // '2026-09-30'
  description: string;   // plain English, one short paragraph
  build(anchors: OpeningAnchors): OpeningState;
}
export interface ModelDef {
  // … as now, plus:
  calendar?: { month0: CalendarMonth };
  moneyUnit?: MoneyUnit;
  opening?: OpeningDef;
}
export interface Scenario {
  // … as now, plus:
  opening?: Id;          // OpeningDef.id the scenario was made from
}

/* ---------- src/core/steady.ts (A): Baseline gains two optional fields ---------- */
export interface Baseline {
  // … as now, plus:
  /** Months −1, −2, … by variable index; reset() hands them to Machine.initHistory. */
  history?: Map<number, Float64Array>;
  /** What Ctx.base and IndicatorCtx.base read: the structural anchor. Defaults to `vars`. */
  anchors?: Float64Array;
}

/* ---------- src/core/opening.ts (A, new) ---------- */
export interface Opening extends Baseline {
  history: Map<number, Float64Array>;
  anchors: Float64Array;
  report: OpeningReport;
}
export interface OpeningReport {
  id: Id; label: string; asOf: string; month0: CalendarMonth | null;
  positions: { instrument: Id; player: Id; value: number; money: number | null; source: OpeningSource }[];
  params: { id: Id; value: number; anchor: number; provenance: Provenance }[];
  gaps: { target: Id; value: number; shareOfRule: number; fade: number }[];
  checks: { id: Id; value: number; expected: number; tolerance: number; pass: boolean; gate: boolean }[];
  month1: { id: Id; month0: number; month1: number; bound: number; pass: boolean }[];   // T4 table
  solve: { unknowns: number; iterations: number; residual: number };
  warnings: string[];    // T11
}
/** Build, validate (T1, T2), evaluate month 0 under every padlock configuration, and solve. Throws with the numbers on a hard failure. */
export function openingBaseline(m: KModel, def: OpeningDef, anchor: Baseline, opts?: { tol?: number; maxIter?: number }): Opening;
/** How many months back each variable is read at month 0 (found by evaluating one step with a recording lag()). */
export function lagReach(m: KModel, base: Baseline): Map<Id, number>;
/** Model-language helper: add a fading start-gap term to each named BEHAVIOUR rule, by target, through `replaces`. */
export function withStartGaps(model: ModelDef, gaps: Record<Id /* target */, { fade: number; label?: string }>): ModelDef;
// Each gap's size is the parameter `startGap.<target>` (default 0); its fade is `startGapFade.<target>` (per year).

/* ---------- src/core/engine.ts (A) ---------- */
export interface KernelEngine {
  // … as now, plus:
  readonly opening: OpeningReport | null;
  readonly moneyUnit: MoneyUnit | null;
  /** The calendar month of a model month, or null for a model without a calendar. */
  calendar(month: number): CalendarMonth | null;
}
// reset() loads baselineData.positions, .vars and .history (Machine.initHistory(now, history)).
// Ctx.base, IndicatorCtx.base and baseStock read baselineData.anchors (default vars), as before for every existing model.
// Existing and unchanged: levelAt(id, month, basis), levels(id, basis), indicatorAt(id, month, reference),
// influences(id, reference), ideasAtPlay(scope, reference).

/* ---------- src/models/index.ts (A, then B registers) ---------- */
export function createRegisteredEngine(model: ModelDef, options?: EngineOptions): KernelEngine;
// anchors = model has growth ? initialBaselineForGrowingModel(model, options) : solveBaseline(...);
// baseline = model.opening ? openingBaseline(compile(model), model.opening, anchors) : anchors.

/* ---------- src/models/iceland/today/ (B) ---------- */
export const ICELAND_TODAY_ID = 'iceland-today';
export const ICELAND_OPENING: OpeningDef;              // id 'iceland-2026-09-30'
export function createIcelandTodayModel(): ModelDef;  // growing + financial stress + today's settings + gaps + opening
export const icelandTodayModel: ModelDef;
export function record(id: Id): { value: number; unit: string; period: string; source: string };  // throws on a missing id or a null value

/* ---------- src/ui/engine-client.ts (C, against A) ---------- */
export interface EngineClient {
  // … as now (comparison, baseline, opening, reportSeries, referenceReportSeries, referenceVarSeries), plus:
  readonly calendar: CalendarMonth | null;     // month 0
  readonly moneyUnit: MoneyUnit | null;
  readonly openingInfo: { id: Id; label: string; asOf: string } | null;
}
// comparison is 'no-change' for every model with a growth module or an opening.
// baseline(id) is the no-change run at the current month; opening(id) is month 0 (today).

/* ---------- src/ui/model/effects.ts (C, new, pure) ---------- */
export type EffectKind = 'amount' | 'index' | 'rate';
/** amount and index: % vs no change; rate (fractions and % shares): pp vs no change. null when the no-change value is ~0. */
export function effect(kind: EffectKind, now: number, noChange: number): { value: number; unit: '%' | 'pp' } | null;
export function money(unit: MoneyUnit, x: number, flow: boolean): { value: number; text: string };  // 'ISK 2,113 bn', 'ISK 2,518 bn a year'
export function calendarLabel(month0: CalendarMonth, t: number, style: 'long' | 'short'): string;    // 'September 2026', 'Sep 2026'
```

Definitions used by all three:
- **Level:** a variable or indicator's value in the run, converted by `moneyUnit` for money, × 100 for rates.
- **No-change path:** the client's reference engine, from the same baseline, in the same variant, with no events.
- **Effect:** the run minus the no-change path at the same month, shown as % of the no-change amount for money and indices, or in pp for rates.

With no events, every effect is exactly 0 (T8).

---

## 7. The interface contract

What each view shows on `iceland-today`. The owner's standing rules hold everywhere:
- nothing to approve, no "Apply", no red suggestion marks, no prompts, no notes about locks;
- padlocks start unlocked;
- a lever the user moves locks at that value;
- playback at 1× is one month every two seconds;
- React.

| View | Shows |
|---|---|
| **The one line** (replaces the context strip) | "Iceland on 30 September 2026, from published data. Without your changes it follows its own rules (dashed lines): a teaching model, not a forecast." Nothing else in the strip: no key-rate pair, no forecast list |
| **Header clock and timeline** | Calendar months: "September 2026" at month 0, "October 2026" at month 1. Compact form "Sep 2026". Timeline ticks at each January. Lever-event marks as now |
| **Cards on the map** | One or two numbers each, in today's units: key rate 8.00% ("rule" while unlocked), unemployment 5.8%, deposits or net worth in ISK bn. After a lever moves, a small signed change against the no-change path (% for amounts, pp for rates); none while there is no change. The red outline and badge for unpaid business debt stay; nothing pulses |
| **Pipes** | Thickness from the ISK amount, as now. Label and title: "ISK 2,518 bn a year · +1.2% vs no change". Green and red glow against the no-change path at the same month |
| **Inspector: pipes and variables** | Each amount in ISK bn a year (flows) or ISK bn (stocks), each rate in %. Beside it, the effect: % vs no change for amounts, pp for rates. A rule's terms are in the rule's unit converted the same way. A start gap appears as a term, "Today's gap from this rule, fading (half gone in 8 months)", and never as a note. Parameters in money units show ISK bn a year at 2025 prices |
| **Inspector: players and groups** | Balance sheet rows: position now in ISK bn and % vs no change; net worth the same. The limits in force and the financing section as now (bounded) |
| **Inspector: indicators** | The big chart in the measurement the charts panel shows, with the no-change path dashed |
| **Ledger** | Cells in ISK bn a year; the small number is % vs no change at this month; row sums 0 ✓; column changes in net worth in ISK bn |
| **Lever panel** | Each lever's unchanged mark at today's setting (§4.1): key rate 8.00, tax and spending at 0. The key rate shows its live value, marked "auto", while unlocked. "Back to the start value" restores the start value and keeps a lever with a padlock locked. The info panel's definition names today's setting once (for example, today's effective income-tax rate). No notes, suggestions or approvals |
| **Charts** | The default measurement is nominal levels: ISK bn (a year for flows), %, or an index with 2025 = 100. The run is a solid line and the no-change path a dashed line. The other two buttons: real levels ("at 2025 prices") and the change vs no change (% or pp). The x-axis is in calendar months. Each chart names its unit once; the panel has no notes |
| **"Starting data" dialog** (the header's "Baseline & current data") | Each chart's month-0 value beside the records mapped to it, marked "used for the start" or "for comparison", in groups that open on demand. At most 10 records per chart. No catalogue. The model rows read `client.opening()`, so moving a lever never rewrites them |
| **Feed** | As now: narration against the no-change path. No opening message |
| **Share** | Writes `m`, `v`, `o`, `t`, `e`, `x` (§5.3). One load line when `o` differs |

Words: the interface says "no change", "today" and "start" on `iceland-today`, and never "baseline". Units are written "ISK 2,113 bn" and "ISK 2,518 bn a year"; table headers say "ISK bn".

---

## 8. Acceptance tests

T1–T3, T7 and T8 are hard failures in a new harness layer `opening`, run for every application model with an opening. Its report is `reports/opening-iceland-today.md`. All of T1–T12 are in `bun test`.

| # | Test | Pass condition (source) |
|---|---|---|
| T1 | Opening balances | Every financial instrument: Σ assets − Σ liabilities ≤ 1e-9 at month 0. Every residual ≥ 0: B deposits 3,671.9; B reserves 507.2; B government bonds 1,010.6; bank bonds 1,332.1; PF shares 2,088.4; FR loans 1,038.2; HW mortgages 812.6 and 1,463.9; HO rights 4,221.7 (ISK bn, ±0.5). Only the positions in `fills` and the declared residuals are computed. A missing record id or a null value throws |
| T2 | Month-0 values | Every gated row of §1.2 within its tolerance. Every identity reproduces the opening's values to 1e-9 relative. Every `OpeningCheck` with `gate: true` passes. The ISK conversion is the fixed unit: `levels('govDebtAmount')[0]` = 2,800.7 ± 0.1 |
| T3 | Accounting from month 1 | The four checks < 1e-9 and no sign violation for 240 months, padlocks unlocked (default) and both locked |
| T4 | Month-1 continuity, padlocks unlocked | Key rate \|Δ\| ≤ 0.10 pp; other rates \|Δ\| ≤ 0.10 pp. CPI inflation in month 1 (annualised) 5.7 ± 1.0% (`macro.cpiAnnualized6M`). Wage growth 5.7 ± 1.0%. Real consumption, business investment, employment and real house prices: \|x₁/x₀ − 1 − m/12\| < 0.5%, with m = +0.8, +10.1, +0.13 and −3.2% a year. Net flows (deficit, `borrowing{j}`, `netMortgageLending`, `bondIssue`, `currentAccount`, `bondPurchasesW`, `foreignAssetPurchases`, `fxReserveSales`): \|Δ\| < 0.3 units (ISK 14.8 bn a year). Exchange rate \|Δ log\| < 0.5%. The same bounds from month 1 to month 2. The table is in `OpeningReport.month1` |
| T5 | Two years, padlocks unlocked (the no-change path) | Key rate at month 12 in [6.5, 7.9]% (rule arithmetic 7.3, §4.3). Key rate at month 24 in [5.25, 7.25]% (market participants' 6.25% ± 1). 2027 average of `inflation12` (months 4–15) in [2.6, 4.6]% (CBI 3.6, `macro.cpiInflationForecastAnnualAverage2027`). `inflation12` at month 24 in [1.5, 4.5]%. 2027 average unemployment in [4.2, 6.7]% (CBI 5.2, `macro.unemploymentForecast2027`). Real output at month 24 within [−3, +5]% of month 0 (CBI growth 1.4% in 2026 and 1.9% in 2027, `macro.gdpRealGrowthForecast2026` and `…2027`) |
| T6 | Two years with the key rate locked at 8.00 (a user's choice) | Key rate 8.00 for all 24 months. `inflation12` at month 24 in [0.5, 4.5]%. Unemployment at month 24 in [5.0, 9.0]%. Real output at month 24 within [−6, +3]% (bands of the earlier design's T5) |
| T7 | Twenty years, both configurations | Every variable finite for 240 months; unemployment in [0, 30]%; `inflation12` in [−10, 30]%; government debt < 300% of GDP; no sign violations. The long-run values are reported (expected: inflation near 2.4–2.5% with the rules acting, as on the growing reference), not gated |
| T8 | No-change integrity | With no events the run equals the reference bit for bit. Every effect the client reports is exactly 0: `baseline()`, pipes, balance sheets, `Frame.legBaselines`, `series()`, `reportSeries('deviation')`. `seek` and replay reproduce a straight run. A fork with no change has zero effect |
| T9 | Controls unchanged | `iceland` and `reference`: every golden, calibration check, expectation, harness report and lever report unchanged, and the 240-month drift < 1e-9. `iceland-growing`: its tests pass unchanged; its opening is the same |
| T10 | Determinism and data refresh | The same opening and scenario give identical numbers. A golden of the no-change path, months 0–24, both lock configurations, 16 series: `keyRate`, `inflation12`, `cpi`, `expectedInflation`, `unemployment`, `wageGrowth`, `exchangeRate`, `output`, `nominalGDP`, debt ratio, deficit, `mortgageDebtAmount`, broad money, `pfAssets`, `housePrice`, `currentAccount`. Stored in `tests/golden/iceland-today/`; regenerated deliberately when any data file changes, with the diff in review |
| T11 | Opening report guards | Warnings, listed and not failing: gaps > 25% of their rule's month-0 value; cross-checks off by > 10% (expected today: reserves 1.26, bank bonds 0.89, bank assets 0.89, PF shares 1.52, home value 1.18, net external position 1.52, capital ratio 28.0 vs 23.3); every placeholder and bridge in §1.6; every data period |
| T12 | Interface (C) | Server render of `<App/>` opens `iceland-today`, shows "September 2026", key rate "8.00%" and "auto", amounts with "ISK" and "bn", and the one line. No "Apply", no suggestion mark, no lock note and no "baseline" in the rendered text. After a lever move, a card shows a % effect, and the same frame with no events shows none. A link with `o` round-trips. A link to `iceland-growing` opens it. The engine-client clock still ticks one month per 2 s at 1× |

---

## 9. Work packages

### 9.1 File ownership

| Area | A (kernel, opening mechanics) | B (Iceland today) | C (interface) |
|---|---|---|---|
| `src/core/**` | owns | — | — |
| `src/concepts/library.ts` (concept `start-gap`) | owns | — | — |
| `src/harness/**` (layer `opening`) | owns | — | — |
| `src/models/index.ts` | `createRegisteredEngine` (first) | registration (after A) | — |
| `src/models/iceland/**`, `data/iceland/**`, `scripts/extract-today.ts` | — | owns | — |
| `src/ui/**` | — | — | owns |
| `tests/core/**`, `tests/fixtures/opening.ts` | owns | — | reads |
| `tests/models/iceland-today*.test.ts`, `tests/golden/iceland-today/`, `reports/opening-*`, `reports/levers/iceland-today.*` | — | owns | — |
| `tests/ui/**` | — | — | owns |
| Docs | `docs/architecture.md` §4.5, `docs/authoring.md` (an "Openings" section) | Decision record `0018-iceland-today-opening.md` with its row in architecture §9; `docs/current-economic-context.md`; `docs/design/growing-reference.md` (one line); this plan's status | `docs/interface.md` |

### 9.2 A: kernel and opening mechanics

1. **Types and baseline fields** (§6): `CalendarMonth`, `MoneyUnit`, `Opening*`, `ModelDef.calendar/moneyUnit/opening`, `Scenario.opening`, `Baseline.history/anchors`. `reset()` passes the history to `Machine.initHistory`; `Ctx.base` and `IndicatorCtx.base` read the anchors. Bit-for-bit test: every existing golden and the stationary drift (T9).
2. **`openingBaseline`:**
   - `buildPositions` with explicit `fills`, rejecting silent fills, negative residuals and unknown ids;
   - month-0 evaluation (terms, desired, regimes, `byMask`);
   - `lagReach` and the history check;
   - parameter ranges;
   - `OpeningCheck` gating;
   - `OpeningReport`.
3. **The opening solve:** unknowns and targets; one-month evaluations; Levenberg–Marquardt from `numerics.ts`; fails above 1e-9.
4. **`withStartGaps`:** wraps rules by target through replacement chains (as `effectiveRules` in `modules/growth.ts` does). It accepts BEHAVIOUR only, rejects stock targets, and adds a labelled `startGap` term tagged `start-gap`. Also the concept `start-gap` in plain English.
5. **Engine metadata:** `opening`, `moneyUnit`, `calendar(month)`; `scenario()` writes `opening`; load keeps it.
6. **The generalised `createRegisteredEngine`** (§5.2), and the harness layer `opening` (T1–T3, T7, T11 report).
7. **`tests/fixtures/opening.ts`:** a two-sector test model with a dated opening, a 12-month history, one latent state and one start gap. A tests against it (T1–T3, T8, T9) and C builds against it before B lands.

Order: 1 → 2 → 3 → 4, 5 and 6. Hand-off to B after step 2 (positions and checks) and again after step 4.

### 9.3 B: Iceland today, builds on A

1. **Data access.** `scripts/extract-today.ts` writes `data/iceland/today-2026-09-30.json`: the records the opening and the interface use, copied verbatim (id, value, unit, period, source, status). A test checks that each equals the snapshot record. `today/data.ts` reads by id and throws on a missing id or null value. The engine bundle then carries a small file instead of the 1.46 MB snapshot; C can switch `current-data.ts` to it.
2. **The profile** `createIcelandTodayModel()`: today's parameters (§1.5), lever defaults (§4.1), gaps (§3.3), `calendar`, `moneyUnit`, `opening`.
3. **`ICELAND_OPENING.build`:** positions and residuals (§1.3, in the stated order), variables and histories (§1.4), bridges flagged (§1.6), checks (§1.2), and the solve (§3.2, §3.3).
4. **The level fix** (§2) in `modules/indicators.ts` and `modules/financial-fragility.ts`, and the real unit's label "at 2025 prices" on this profile.
5. **Tests:**
   - `tests/models/iceland-today-opening.test.ts` (T1, T2, T4, T11);
   - `iceland-today-path.test.ts` (T5, T6, T7);
   - the golden (T10).

   Run `bun run levers` on `iceland-today`, measured against the no-change path, and commit `reports/levers/iceland-today.md`. It is non-gating until reviewed; any sign that differs from the stationary expectation is explained in `docs/audit/lever-vetting.md`, and no stationary expectation is weakened.
6. **Registration** in `applicationModels`, after A's `createRegisteredEngine`. Decision record 0018. Update `docs/current-economic-context.md`: the records now applied are listed by id, and the snapshot file itself is not edited.

### 9.4 C: the interface, in parallel with A and B

1. **`engine-client.ts`:** `calendar`, `moneyUnit`, `openingInfo`; `comparison` is 'no-change' for growth or an opening.
2. **`src/ui/model/effects.ts`:** `effect`, `money`, `calendarLabel`. `format.ts`: the calendar clock. `info.ts`: `moneyUnit`, `calendar`, lever start values.
3. **Views (§7):** header and timeline, the one line, cards, pipes, inspector rows, ledger, lever marks and "back to the start value", charts (axis and units), the dialog's model rows and its "used for the start" marks.
4. **`registry.ts`:** `PREFERRED_MODELS`, `LINK_ONLY_MODELS`. `scenario-url.ts`: the `o` key and its load line.
5. **Tests:**
   - T12;
   - update `tests/ui/application-model.test.tsx` to `iceland-today`;
   - unit tests for `effect`, `money` and `calendarLabel`;
   - smoke render with `tests/fixtures/opening.ts` before B lands, then with `iceland-today`.

   Update `docs/interface.md`.

C needs from A: the types and the fixture (A step 7, early). C needs from B only the registered profile, at the end.

---

## 10. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Month 0 is a composite of periods** (end-2025 debt, July pension data, August banks, 2026Q2 flows, a 2024 net-worth ratio) | Every position carries its period in the report. Nothing is rolled forward by guessed flows. The debt chart's 54.5% and the published 56.7% are shown side by side |
| R2 | **Model and data concepts differ.** The Treasury's foreign debt (403.0) is held by W as króna bonds, which raises W's bonds from 113.1 to 516.1 and scales the carry-trade term (`bW0`, `krona0`) by about 4.5. Other financial corporations' deposits sit with FR. 47.5 bn of indexed bonds held by others is lost | T4 bounds the portfolio flows. B also runs the alternative (W 113.1, B absorbs 403.0) and keeps whichever passes T4 and T5 with the smaller króna response, recording the choice in decision 0018. Cross-checks in T11 |
| R3 | **The payout fix and a negative pension-fund net worth** (−0.59%) change the growing variant's pension dynamics: payouts fall from 13.9% to 7.3% of GDP and `c0O` is re-solved | T7 over 240 months in both configurations; the 1,200-month growth test is run on the profile and reported. If `nwPF0` < 0 upsets crediting, use 0 and record it |
| R4 | **Gaps hide misspecification.** Investment momentum of 10.1% a year is a noisy quarterly rate; wage contracts run to 2028 | Gaps only on behaviour rules, visible as terms, fading, size-guarded (T11), and they largely cancel in effects, since both runs share them. A 2027 wage step could be a scheduled no-change event later; it is not in this plan |
| R5 | **The rule cuts faster than the market expects** if the model disinflates faster than the CBI (the earlier prototype reached 3.2% at month 12) | T5's bands are sourced. A failure is investigated in the model (expectations anchoring `chi`, `lamPia`, the wage gap's fade), never fixed by widening the band |
| R6 | **Unemployment choice.** The owner may compare with the headline 6.8% | The trend 5.8% is Hagstofa's smoothed series and matches the CBI's 2026 average (5.9%). The dialog shows all three records beside the model's 5.8% |
| R7 | **Missing records** (wage index and CPI component 2025 averages, the real GDP level, outstanding-weighted rates, bank reserves, FDI equity, the output gap) | Declared bridges with `assumed` provenance (§1.6), listed in the report. Each is a follow-up for the data generation script, which is not in the repository |
| R8 | **Bundle size:** the engine would import the 1.46 MB snapshot | The extract file (B step 1). The interface can drop the full import too |
| R9 | **Levers from a moving start:** effects against a moving path may peak at different months than on the stationary controls | The stationary expectations stay the gate (T9). The today lever report is non-gating until reviewed and explained |
| R10 | **Links after a data refresh** replay on new numbers | The `o` key and a single load line. `iceland-growing` stays link-only |
| R11 | **Readers take the no-change path for a forecast**: it moves a lot (inflation falling, the key rate cut) | The one line says it is not a forecast. The profile's description says the same. No forecast list is shown in the strip |
| R12 | **Load time:** the stationary anchor solve, the 17-unknown opening solve and two engines | About 17 × 10 one-month evaluations at microseconds each. Measured in A's tests, with a budget of 200 ms on the test machine |
