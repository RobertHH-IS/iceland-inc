# Opening on Iceland today: implementation plan

Status: implemented (October 2026). Packages A (kernel, `src/core/opening.ts`), C (interface) and B (`src/models/iceland/today`, [decision 0018](../decisions/0018-iceland-today-opening.md), which records the choices, every place the arithmetic below and the code's result differ, and the acceptance tests' findings: the tests of the start hold except one row of T4, which is open; by the owner's decision of 6 October 2026 the comparison of the path with published forecasts, T5 and the rest of T6, is reported and is not a test). The text below is revision 2 of the plan as it was implemented against. Written against commit `d9eee5a`, with the dated snapshot `data/iceland/observations-2026-09-30.json` (1,137 records, verified 30 September 2026) and the two data briefs `data/iceland/current-hagstofa.json` and `current-financial.json` (as of 28 September 2026). Revision 2 answers a review of revision 1; §11 lists what changed and why.

The owner asked for the application to open on Iceland as it is now, so that every change is seen against today's levels. Today the application opens on the growing variant (`iceland-growing`), which starts from the stationary 2025 calibration: a key rate of 3.00%, zero inflation and every amount in "% of opening GDP". This plan replaces that opening with a dated one, built from the snapshot, and keeps everything else that already works: the growing variant's rules, the padlocks, the no-change comparison run and the level reports.

It builds on [start from today's data](start-from-today.md) (the approved design, written before padlocks, sub-steps and the growing variant) and keeps its principles: a dated start; the no-change path as the comparison; effects as the run minus the no-change path; a consistent month 0; no artificial jumps in month 1; declared, fading start gaps on behaviour rules only; acceptance tests T1–T11.

## 0. Summary

1. **Month 0 is September 2026.** The opening is Iceland on 30 September 2026. Stocks, prices, rates, expectations and lag histories are set from the snapshot through declared mappings. Each financial instrument has exactly one residual position, and every residual is listed in an opening report with its cross-check (§1).
2. **Headline values at month 0:**
   - key rate 8.00%, 12-month inflation 5.9%, unemployment 5.8%, wage growth 5.7%;
   - the króna 4.7% stronger than its 2025 average;
   - government debt ISK 2,800.7 bn (56.7% of 2025 GDP);
   - household mortgages ISK 2,936.3 bn, pension-fund assets ISK 9,326.3 bn, household deposits ISK 2,113.0 bn;
   - GDP of ISK 5,138.9 bn over the four quarters to 2026Q2, which is ISK 5,348.4 bn a year at September 2026 prices (§1.2, §1.7).
3. **The money unit does not change:** one model unit is 1% of 2025 nominal GDP, ISK 49.41211 bn. Price indices are 1 at their 2025 averages. The interface shows ISK billions (flows a year) and percent (§2).
4. **Prices hold together.** World prices are set from trading partners' inflation and the króna from its index, so import prices start at the border price. Domestic prices then follow from the CPI identity, and the misfits the rules cannot explain are declared as start gaps (§1.4, §3).
5. **Smoothness.**
   - Month 0 is consistent: every identity holds.
   - Four always-on families of fading start gaps (six unknowns): wages, labour supply, firms' margins and the króna. These are solved so that month 1 continues today's wage growth, CPI inflation and króna drift.
   - Smoothers start at rest.
   - Six further gap families are declared but switched on only if the month-1 test fails without them (§3).
6. **Policy today.** The padlocks start unlocked, so both policy rules act from month 1, and both start at rest. The key-rate lever's unchanged mark is 8.00%. Rule arithmetic puts the key rate near 7.3% after a year and 6.2% after two, against the market participants' expected 6.25% (§4).
7. **The default model.** A new profile, `iceland-today`, is the growing variant with financial stress plus this opening, and the application opens on it. `iceland` and `reference` stay unchanged as the stationary controls for the harness. `iceland-growing` stays registered so that its old links still replay (§5).
8. **Kernel changes are small and bit-for-bit on every existing model:**
   - a baseline may carry a lag history and separate anchors;
   - a generic opening builder with a closed-form pass, a rank-checked solve and a report;
   - a start-gap helper with tied groups;
   - calendar and money-unit metadata.

   The no-change comparison stays in the engine client, where it already works (§6).
9. **The interface** shows calendar months and ISK amounts. Beside each amount it shows the change since today and, once a lever has moved, the effect against the no-change path. One calm line explains the comparison. There are no notes, approvals or suggestions (§7).
10. **Acceptance tests T1–T12** have concrete numbers and sources (§8). **Work packages A (kernel), B (Iceland today) and C (interface)** have disjoint file ownership (§9).

### What changes from the earlier design

| Earlier design (start-from-today.md) | This plan | Why |
|---|---|---|
| `StartDef` on `ModelDef.starts`, chosen by `EngineOptions.start` | One `OpeningDef` per application profile (`ModelDef.opening`); the profile is the start | The application has one opening, and the stationary controls must stay untouched. A start picker would be a second control the owner did not ask for |
| Kernel-owned reference machine | Keep the engine client's no-change engine (`comparison: 'no-change'`) | It exists and is tested (`tests/ui/no-change-comparison.test.tsx`). It already feeds influences, ideas at play, pipes, balance sheets and charts through `reference` arguments |
| Manual (key rate held) as the default no-change path | Padlocks unlocked: both rules act from month 1 (decision 0010) | The owner's standing rule. Holding 8.00% is a user's choice and is tested (T6) |
| Kernel-generated gap terms | A model-language helper `withStartGaps` that wraps rules through `replaces`, as the growth module does | One rule per variable, visible terms, no kernel special case |
| `worldPrice0`/`fishPrice0`/`aluminiumPrice0`/`iFnow` set from data; `importPrice` solved | The parameters exist (default 1, 1, 1, `iF0`). This plan sets them from records or declared bridges, and starts `importPrice` at the border price (§1.4, §1.6) | Leaving them at 1 broke the import-price block (review, §11) |
| Inflation 5.6% (August), unemployment 6.8% | 5.9% (September CPI); 5.8% (LFS trend) | The snapshot supersedes the August brief. The trend series is Hagstofa's own smoothed estimate; the monthly 6.8% is noisy (§1.2) |
| A long run that misses the target (0.55% inflation) | The growing variant's trends and 2.5% target; its 1,200-month path settles near 2.4% ([growing reference](growing-reference.md)) | A moving start now has a moving reference to return to |
| Pension payouts re-calibrated in the start (appendix A5) | Not in the opening: the anchor's payout ratio is kept and the misfit is reported (§1.5) | Changing a behaviour parameter inside one profile would make `iceland-today` and `iceland-growing` differ in behaviour, not only in their start. A payout fix is its own reviewed calibration change |

---

## 1. The opening state

### 1.1 Month 0, units and data periods

- **Month 0 is the end of September 2026.** The first simulated month, t = 1, is October 2026; month t is the calendar month t months after September 2026.
- **Money** is in % of 2025 nominal GDP: one unit is ISK 49.41211 bn (§2). Flows are at annual rates.
- **Price indices are 1 at their 2025 averages:** `cpi`, `cpiExTax`, `consumptionDeflator`, `domesticPrice`, `importPrice`, `borderImportPrice`, `deliveredImportPrice`, `housingCost`, `housePrice`, `wage`, `exchangeRate` and the world prices. Real quantities are at 2025 prices. The 2025 average is centred on 30 June 2025, month −15.
- **Flows at month 0 are annual rates at September 2026 prices.** The national-accounts records are rolling four-quarter sums to 2026Q2, centred on month −9 and valued at that window's prices. Each one is multiplied by **F = 1.04078**: the CPI in September 2026 (1.06768) divided by the CPI's average over the window, months −14 to −3 (1.02585, from the price path in §1.4). Volumes are held at their window level, which is a small simplification: real GDP grew 0.3% year on year (`macro.gdpRealGrowthQuarterYoYSA`). Rates, prices and credit flows (monthly records) are the latest observation and get no factor.
- **The snapshot's flag:** every one of the 194 records that names a model target carries `directInitialisationSafe: false`. This plan respects it: no record is copied into a position or variable directly. Each value goes through a conversion and a declared mapping, and is checked in the opening report.

Data periods that meet at month 0 (each is recorded per position in the opening report):

| Period | What |
|---|---|
| 30 Sep 2026 | Key rate, exchange rates, foreign policy rates, bond yields, advertised bank rates |
| Sep 2026 | CPI and its 12-month change |
| Aug 2026 | Bank deposits, bank loans and mortgages, bank equity, M3, CBI balance sheet, wage index, LFS unemployment, house prices |
| Jul 2026 | Pension-fund assets and mortgages, net new mortgage lending |
| 2025Q3–2026Q2 | National accounts flows, current account, government revenue and expenditure (rolling four quarters, moved to month 0 by F) |
| 2026Q3 | Inflation-expectation surveys |
| 2026 (forecast) | Trading partners' inflation (`world.partnersInflation2026`), for the world-price bridge |
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
| House prices | 1.9% above the 2025 average; 4.5% lower in real terms | `housePrice` = 1.01929 | `macro.housePriceRebased2025Average` (Aug 2026) | relative 1e-9, gate |
| Non-indexed mortgage rate | **9.90%** | `mortgageRateN` = 0.09897 | `financial.mortgageNAdvertised` (mean of three banks) | ±0.05 pp, gate |
| Indexed mortgage rate (real) | **4.65%** | `mortgageRateI` = 0.0465 | mean of `financial.mortgageIAdvertisedLandsbankinn`, `…Islandsbanki`, `…Arion` (4.45, 4.55, 4.94) | ±0.05 pp, gate |
| Government bond rate (average coupon on the stock) | **7.49%** | `bondRate` = 0.0749 | `financial.bondParNominal5Year` (29 Sep 2026) | ±0.05 pp, gate |
| Deposit rate | 7.00% | `depositRate` = `keyRate` − `mD` | No outstanding-weighted rate (`financial.depositOutstandingWeightedRate` is a gap). 3-month fixed rates 7.45–8.00 (`financial.depositFixed3*`), demand deposits 0.05–0.50 (`financial.depositDemand*`) | warn (§1.8) |
| Business-loan rate | 10.30% | `loanRate` | `financial.businessPreferredLandsbankinn` (one bank) | warn |
| Foreign interest rate | 3.375% | `foreignRate` = `iFnow` | Mean of `world.rate.ECB.deposit` 2.50, `world.rate.BoE.bankRate` 3.75 and the midpoint of `world.rate.Fed.targetLower`/`…Upper` 3.875 (bridge, §1.6) | exact to the bridge, gate |
| **Government debt** | **ISK 2,800.7 bn = 56.7% of 2025 GDP** | `govBonds`(G) + `indexedBonds`(G) = 56.680 | `financial.governmentBorrowingDebt` (end-2025), `financial.governmentBorrowingDebtRatioExact` 56.68 | stock ±0.1 bn; ratio to 2025 GDP ±0.05 pp, gate |
| Household mortgage debt | **ISK 2,936.3 bn**, 64.3% indexed | 59.425 | `financial.mortgagesBanksIndexed`, `…Nonindexed`, `…FX` (Aug 2026); `financial.mortgagesPFIndexed`, `…PFNonindexed` (Jul 2026) | ±0.1 bn, gate |
| Pension-fund assets | **ISK 9,326.3 bn**, 41.9% foreign | 188.743 | `financial.pensionAssets`, `financial.pensionForeignShare` (Jul 2026) | ±0.1 bn and ±0.05 pp, gate |
| Household deposits | **ISK 2,113.0 bn** | 42.762 | `financial.depositsHH` 1,996.2 + `financial.depositsNPISH` 116.8 (Aug 2026) | ±0.1 bn, gate |
| Deposits of all non-banks (money in the model) | ISK 3,671.9 bn | 74.312 | `financial.depositsTotal` − `financial.depositsGovernment` (Aug 2026) | ±0.1 bn, gate |
| **GDP, four quarters to 2026Q2** | **ISK 5,138.9 bn** | `nominalGDP` averaged over months −14 to −3 = 104.000 | `macro.gdpNominalRolling4Q` (2025Q3–2026Q2) | relative 1e-9, gate (it fixes the GDP history) |
| GDP, annual rate in September 2026 | ISK 5,348.4 bn a year | `nominalGDP` = 108.241 | The rolling sum × F (§1.1); the components are reconciled in §1.7 | relative 1e-9, gate |
| GDP, past 12 months | ISK 5,212.1 bn | `gdpTrailing12` = 105.482 | The GDP history, log-linear at 5.66% a year, which reproduces both rows above | follows, gate through the two rows above |
| Imports and exports | ISK 2,113.1 bn and 2,099.8 bn a year | 42.764 and 42.495 | `macro.importsNominalRolling4Q` 2,068.2 and `macro.exportsNominalRolling4Q` 2,017.5, × F, mapped as in §1.7 | ±2%, gate |
| Real GDP at 2025 prices | about 100.3 | `output` (evaluated) | Bridge: 100 × (1 + `macro.gdpRealGrowthQuarterYoYSA` 0.3%) | ±3%, warn (fixed 2025 prices against a chain-linked growth rate) |
| General-government balance | −2.76% of GDP (−ISK 147.5 bn a year) | revenue − expenditure at month 0 | `fiscal.revenue.rolling4q` 2,187.0 and `fiscal.expenditure.rolling4q` 2,328.9, × F; `fiscal.balance.rolling4q.pctGDP` | ±0.05 pp, gate (both sides are set, §1.5) |
| Current account | −3.0% of GDP | `currentAccount` (evaluated) | `external.currentAccount.rolling4q.pctGDP` | ±1 pp, warn |

The government debt chart divides debt by the past 12 months' GDP, so it opens at 2,800.7 ÷ 5,212.1 = **53.7%**. The 56.7% is the published ratio: the same end-2025 stock divided by 2025 GDP. The debt is not rolled forward with 2026 deficits, because the snapshot has no general-government debt after end-2025. The opening report shows both ratios on one row.

### 1.3 Instrument positions

Every value is converted as `model = ISK bn ÷ 49.41211`, in the Ctx sign convention (assets and liabilities both positive). For each instrument, exactly one position is the **residual**: the one position not set from a record, computed from an identity. In a two-sided instrument the kernel fills the other side as its mirror. Each position carries a basis (§6, `OpeningSource.basis`): **data**, **residual**, **mirror** (the kernel's fill) or **allocated** (split by a declared key). T1 fails on any other computed position. A residual may not be negative: the build fails with the numbers rather than open on an impossible balance sheet.

| Instrument | Positions from records (ISK bn → units) | The residual | Identity it closes | Cross-check (T11 warns beyond ±10%) |
|---|---|---|---|---|
| `deposits` | HY 297.4 (6.018), HW 923.9 (18.697), HO 891.7 (18.046): households and NPISH 2,113.0, split 14.07 / 43.72 / 42.20% (`financial.householdTaxDepositsShare{Y,W,O}`). The six firms hold 1,193.9 (24.162): non-financial corporations 834.9 (`financial.depositsNFC`) plus other financial corporations other than pension funds, 359.0 (542.9 − 183.9; their deposits are money the model must hold somewhere). This is **allocated** by the 2025 opening shares: FC 108.4, FR 877.4, XF 37.4, XA 33.2, XT 67.3, XO 70.2. PF 183.9 (3.721, `financial.depositsPF`). W 181.1 (3.666, `financial.depositsNonresident`) | **B** = Σ holders = 3,671.9 (74.312) | Instrument balance | Bank deposits less government deposits: 3,802.0 − 130.1 = 3,671.9 (exact). Government deposits at banks (130.1) are a mapping loss: the model's government keeps its money at the central bank |
| `treasuryAccount` | G 420.2 (8.505): Treasury ISK account 109.8 + Treasury FX deposit 310.4 (`financial.centralBankTreasuryISKAccount`, `…TreasuryFXDeposit`) | **CB** (mirror) | Instrument balance | The FX deposit is held as krónur in the model (stated in the report) |
| `reserves` | none | **B** = CB assets − treasury account − CB equity = 948.8 + 17.4 − 420.2 − 38.8 = 507.2 (10.265); CB mirrors | CB balance sheet, with CB equity 38.8 from `financial.centralBankNetEquity` | Banks' deposits, including at the CBI, 403.3 at end-2024 (the note on `bankFinancialAssets` in `current-hagstofa.json`): 1.26, warn |
| `mortgagesN` | Lenders: B 848.5 (17.172; non-indexed 848.48 + FX 0.04), PF 199.6 (4.039). HY 235.5 (4.766) = 22.47% of the total (`financial.householdTaxMortgageDebtShareY`) | **HW** = total − HY = 812.6 (16.445) | Instrument balance | The older group's 9.1% is folded into HW, as in `steady.ts`. Loans from ÍL-sjóður and HMS are not in the data (`financial.mortgagesAllLendersCurrent` is a gap): a mapping loss |
| `mortgagesI` | B 1,236.6 (25.026), PF 651.7 (13.188), HY 424.3 (8.587) | **HW** = 1,463.9 (29.627) | Instrument balance | Indexed share 64.3% (`hhDebtIndexedShare`, 64.4%) |
| `businessLoans` | B 2,231.1 (45.153, `financial.bankBusinessLoans`). Borrowers: FC 456.6 (construction loans, the note on `corpLoansBanksISKbn` in `current-financial.json`), and **allocated** XF 15%, XA 1%, XT 12%, XO 5% (placeholders `loanShareX*`, kept) | **FR** = 1,038.2 (21.011) | Instrument balance | Corporate debt to all lenders 3,933.1 (estimate): banks' share 56.5% (`financial.corporateDebtBankShare`) |
| `govBonds` | G 1,839.8 (37.233) = debt 2,800.7 − indexed 960.9. CB 17.4 (0.353, `financial.centralBankGovernmentBonds`). HO 295.6 (5.982, `financial.householdFinancialBonds`, 2024, all debt securities). W 516.1 (10.445) = 7.2% of Treasury bonds 1,570.5 (the Lánamál share in `calibration.json`; `financial.treasuryBondsNominalValue`) + Treasury foreign debt 403.0 (`financial.centralTreasuryForeignDebt`). PF 0 = max(0, PF Treasury holdings 913.5 − indexed 960.9) | **B** = 1,010.6 (20.453): banks and every holder the model does not have (funds, insurers) | Instrument balance | The Treasury's foreign-currency debt is held by W as króna bonds in the model (a mapping simplification, §10 R2) |
| `indexedBonds` | G 960.9 (19.447, `financial.centralTreasuryIndexedDebt`) | **PF** (mirror; the model's only holder) | Instrument balance | PF's Treasury holdings, 913.5 (`financial.pensionTreasuryBondsNominalValue`): the 47.5 excess is indexed debt held by others, a mapping loss |
| `bankBonds` | none | **B** issues B's assets − deposits − equity = 5,834.1 − 3,671.9 − 830.1 = 1,332.1 (26.959); PF mirrors | B balance sheet, with equity 830.1 (`financial.bankBookEquity`) | Banks' debt securities 1,499.4 at end-2024 (`financial.bankDebtSecuritiesLiabilities2024`): 0.89, warn. Bank assets in the model 5,834.1 against 6,582.3 (`financial.bankAssets`): 0.89, warn |
| `shares` | Households 1,185.6 (`financial.householdFinancialEquitiesUnits`, 2024), **allocated** 1 : 10 : 5 (the `eqH*` placeholders): HY 74.1, HW 741.0, HO 370.5. W 494.1 (`eqW` placeholder; FDI equity is a gap) | **PF** holds PF assets − its other positions = 9,326.3 − 7,237.9 = 2,088.4 (42.265). The six issuers are **allocated** by net assets, as `steady.ts` does (the key is named in the report) | PF balance sheet | PF domestic equities and units, 1,377.2 (`financial.pensionDomesticEquitiesUnits`): 1.52, warn |
| `fxReserves` | CB 948.8 (19.203, `financial.centralBankForeignReserves`) | **W** (mirror) | Instrument balance | USD 7,814.6 m (`financial.fxReservesUSDm`) |
| `foreignAssets` | PF 3,909.8 (79.126, `financial.pensionForeignAssets`) | **W** (mirror) | Instrument balance | — |
| `pensionRights` | PF issues PF assets × (1 − net-worth share) = 9,326.3 × 1.00592 = 9,381.5 (189.862). The net-worth share, −0.59%, is from the financial accounts (`financial.pensionNetFinancialAssets2024` ÷ `financial.pensionFinancialAssets2024`). HW holds 55% (`eShareW` placeholder) = 5,159.8 | **HO** = 4,221.7 (85.439) | Instrument balance | Households' pension entitlements, 9,540.6 at end-2024 (`financial.householdFinancialPensionInsurance`): 0.98 |
| `kronaLoansW` | 0 | — | — | No record. The instrument starts empty, as in 2025 |
| `businessArrears` | 0 | — | — | Every sector pays as usual at month 0 |
| `homes` (real) | Value 13,044.7 (`financial.residentialAssessment2027`, valued February 2026) ÷ `housePrice` 1.01929 = quantity 259.0. **Allocated** 9.76 / 59.69 / 30.55% (`financial.householdTaxRealEstateShare{Y,W,O}`) | none (a real asset) | — | Tax-return real estate, 11,081.6 (2025): 1.18, warn (assessed against tax values) |
| `capital` (real) | The stationary quantities, kept: FC 12.77, FR 149.73, XF 13.85, XA 2.29, XT 6.88, XO 14.49 (basis **allocated**, key: the 2025 calibration) | none | — | No capital-stock record. Placeholder, listed |

Net worth at month 0, compared in the report (warnings only, because the scopes differ):
- **Banks:** ISK 830.1 bn (data, by construction). Model capital ratio 28.0% (risk weights `rwM` 0.35, `rwL` 1) against 23.3% published for the D-SIBs (`financial.bankCapitalRatio`).
- **Central bank:** 38.8 (data, by construction).
- **Pension funds:** −55.2.
- **Government:** −2,380.5, against −1,889.9 in `financial.governmentNetFinancialAssets`. The model leaves out government equity and loans; the data include pension liabilities.
- **Rest of the world:** −3,667.3, so Iceland's net position in the model is +3,667.3, against the published +2,408 (`external.niip.Q2_2026`): 1.52. The model has no FDI liabilities, firms' foreign loans (14.9% of corporate debt) or banks' foreign funding.
- **Households, net financial worth:** 10,039.4 against 9,281.4 (`financial.householdFinancialNetWorth`, 2024): 1.08.

Reconciliation order:
1. Convert every record and record its period, then set the data positions.
2. Compute the residuals in this order: mortgages (HW), business loans (FR), government bonds (B), deposits (B), central bank (reserves), bank bonds, PF shares, then the share issuers (allocated).
3. The kernel fills the mirrors.
4. Run T1.

### 1.4 Variables with a past

The compiled `iceland-growing` model has **124 variables that are read with a lag or adjusted gradually**, 49 of them partial-adjustment states.
- **Histories longer than one month.** The rules read six variables further back than one month: `cpi` and `cpiExTax` (12-month inflation), `netMortgageLending` and `netCreditTotal` (credit impulses), and `nominalGDP` and `output` (`gdpTrailing12`, `outputTrailing12`). These get a 12-month history. `wage` also gets one, for the wage check in T2.
- **One-month histories.** Every other variable read with a lag at month 0 is flat (x(−1) = x(0)) unless it is listed here. `domesticPrice`(−1) and `exchangeRate`(−1) are declared, because the CPI identity and the reserve target read them at month 0.
- **The check.** `lagReach` (§6) confirms the list on the compiled profile. The opening fails if a variable is read further back than its history reaches.

Kinds of treatment:
- **Obs:** set from a record, through a declared conversion.
- **Eval:** an identity or a non-adjusting rule, evaluated at month 0 and checked.
- **Closed:** a closed-form value computed from the evaluated month 0 (the `derive` pass, §3.4).
- **Tgt:** a smoother, set equal to its own input at month 0 (at rest).
- **0:** a shock or memory state, starting empty.

| Family (count) | Variables and treatment | Value at month 0, source, history |
|---|---|---|
| Central bank (4) | `neutralRate` **Closed**: the value at which the rule's target equals the key rate in force. `ruleTarget` **Eval**. `ruleAnchor` **Obs** = 0.08. `reserveIncomeKept` **0** | `neutralRate` ≈ 2.70% (rule arithmetic, §4.3; within `i0` ± `rStarBand`) |
| Banks (1) | `bankProfitSmoothed` **Tgt** | — |
| World prices (parameters, §1.5 P) | `worldPrice` **Eval** = `worldPrice0` = 1.03386: the 2025 average × (1 + `world.partnersInflation2026` 2.7%)^(15/12). `fishPrice`, `aluminiumPrice` **Eval** = `fishPrice0` = `aluminiumPrice0` = 1.03386 (bridge: their prices relative to world prices unchanged since 2025; `gap.external.fishPrice0`, `gap.external.aluminiumPrice0`). `foreignRate` **Eval** = `iFnow` = 0.03375 | Bridges in §1.6 |
| Import prices (4) | `borderImportPrice` **Eval** = 0.95321 × 1.03386 = **0.98549**. `importPrice` **Obs** = 0.98549: at the border price, so the pass-through rule is at rest (bridge; the imported-goods CPI sub-index is a gap). `deliveredImportPrice` **Eval** = 0.65 × 0.98549 + 0.35 × `domesticPrice`(−1) = **1.01970**. `importCostSeen` **Tgt** = 1.01970 | — |
| Domestic prices and the CPI (9) | `cpi`, `cpiExTax` **Obs**, with a 12-month history. `housingCost` **Obs** = 1.07389, so that the housing-free part of the CPI rose at its own 12-month rate (`macro.cpiExHousingInflationYoY` 5.7%): (1.06768 − 0.755 × 1.06566) ÷ 0.245. `domesticPrice` **Eval from the CPI identity** = **1.08841**: the value that, with the delivered import price, makes the housing-free part equal 0.755 × 1.06566. `domesticPrice`(−1) = 1.08325 (one month at 5.7% a year). `consumptionDeflator` **Eval** = 1.06566. `labourCostSeen` **Closed** = **1.05171**, the value whose month-1 change equals the wage's (5.7% a year): k × W(1) ÷ (e^(g/12) − (1 − k) e^(c/12)), with k = 1 − e^(−`lamUCw`/12), g = 0.057 and c = ln 1.025 the carried trend. `unitCost` **Eval** = 0.55 × 1.05171 + 0.45 × 1.01970 = 1.03731. `vatInPrices` **Tgt** = `vat0`. `inflation12ExTax` **Eval** = 5.9%. `adaptiveInflation` **Closed** = (4.3 − 0.5 × 2.5) ÷ 0.5 = 6.1%. `expectedInflation` **Eval** = 4.3% (checked) | CPI history: log-linear from `cpi`(−12) = 1.06768 ÷ 1.059 = 1.00819 to `cpi`(0), and from 1 at month −15 to `cpi`(−12). It is a smooth path at the 12-month rate rather than raw seasonal months. Domestic prices are 4.9% above their markup on unit cost (1.08841 ÷ 1.03731): a misfit the pricing rule carries as a start gap (§3.3) |
| Housing and mortgages (8) | `housePrice` **Obs** 1.01929. `logRealHousePrice` **Obs** = ln(1.01929 ÷ `cpi`(−1)), since `housePrice` = `realHousePrice` × last month's CPI. `realMortgageRate` **Eval**. `settledMigrants`, `permIncomeY`, `permIncomeW` **Tgt**. `netMortgageLending` **Eval**, warn against 16.13 bn a month × 12 = 193.6 bn a year (3.917; `financial.netNewMortgageLendingISKbnMonth`). `netCreditTotal` **Eval**, warn against (16.55 + 25.38) × 12 = 503.2 (10.184; `financial.netNewLendingHouseholdsMovingAverageISKbnMonth` + `financial.netNewLendingFirmsISKbnMonth`) | Both credit series: 12 months flat at their month-0 value, so both credit impulses open at 0 and the history agrees with the rule |
| Households (6) | `consumptionY/W/O` **Obs**: the model's 2025 consumption × the national-accounts ratio × F (§1.7) = 55.447, split by the 2025 opening shares. `grossIncomeY/W`, `realDisposableIncome` **Eval** | — |
| External (12) | `exchangeRate` **Obs** 0.95321; `logExchangeRate` = −0.04792. `kronaSentiment` **0** (the user's króna-shock channel; never used for a start gap). `sentimentShock` **0**. `realExchangeRate` **Tgt** = 0.98549 ÷ 1.08841 = 0.90544. `profitabilityFish`, `profitabilityAluminium` **Tgt** (the same value under the price bridge). `worldPriceAnchor` **Tgt** = ln 1.03386 = 0.03330. `kronaInflowW`, `foreignDemandFelt`, `tourismFelt` **Tgt**. `currentAccount` **Eval**, warn against −3.0% | `exchangeRate`(−1) = 0.95321 × e^(0.0209/12): one month at the 12-month drift |
| Firms (22) | `investment{j}`, `investmentPlan{j}` **Obs**: the model's 2025 business investment × the national-accounts ratio × F (§1.7) = 16.893 nominal, ÷ `domesticPrice` = 15.521 real, split by the 2025 opening shares. `profits{j}Smoothed` **Tgt**. `output` **Eval** (warn). `nominalGDP` **Eval** = 108.241 (gate). `gdpTrailing12`, `outputTrailing12` **Eval** from their histories | `nominalGDP`: log-linear back from 108.241 at 5.66% a year, the rate at which its average over months −14 to −3 is 104.000. `output`: back at 0.3% a year |
| Labour (13) | `wage` **Obs** (bridge, §1.6). `employment{j}` **Obs**: each sector's 2025 opening level × its register ratio, 12-month average over the 2025 average. FC 19,138 ÷ 19,167; XF 7,790 ÷ 7,836; XA 2,007 ÷ 2,050; XT 28,886 ÷ 29,228 (`macro.employmentRegisterRollingIndustry{13,32,9,31}`, `macro.employmentRegisterAnnual2025Industry{…}`). FR and XO are set so that the total ratio is 225,492 ÷ 225,194 = 1.0013 (`macro.employmentRegisterRolling12M`, `macro.employmentRegisterAnnual2025`). `unemployed{g}`, `unemployment` **Eval** = 5.8% (the labour-supply gaps size it, §3.3). `valueAddedPrice` **Eval**. `wageGapSeen` **Tgt**. `labourInflow`, `benefitSearch`, `settlementJump` **0** | `wage` history: 12 months back at 5.7% |
| Government (7) | `taxRuleAnchor` **Obs** = today's effective income-tax rate (the rule starts at rest). `incomeTaxY/W`, `familyBenefitsY/W`, `bondIssue` **Eval**. `bondRate` **Obs** = 0.0749 | — |
| Pensions (2) | `pfIncomeSmoothed` **Tgt**. `foreignAssetPurchases` **Eval**, warn against 72 bn in eight months × 12 ÷ 8 = 108 bn a year (2.186; the note on `pfForeignShare` in `current-financial.json`) | — |
| Growth (6) | `productiveCapitalReal{j}` = the `capital` quantities (as `initialBaselineForGrowingModel` does) | — |
| Financial fragility (31) | `investmentDesired{j}`, `employmentDesired{j}` **Tgt**. `cashServiceCoverage{j}` **Eval**; their structural anchors are set to these month-0 values (§1.5, anchor overrides). `loanWriteoff{j}`, `distressAge{j}` **0**. `lenderConfidence` **0** (neutral), and stays neutral because its normal is today's coverage | — |

The growing variant's reference indices (`growthRealIndex`, `growthPopulationIndex`, `growthProductivityIndex`, `growthWorldDemandIndex` and `growthPriceIndex`) are 1 at month 0, so the trends compound from September 2026.

### 1.5 Parameters the opening sets

The opening sets parameters after the anchors are solved, as `forkParams` does. Every one carries provenance, and the report lists each one beside its anchor value. Most are closed-form values computed from the evaluated month 0 (the `derive` pass, §3.4).

**Growth anchors move with their parameters.** The growing variant scales a parameter with a growth anchor as `p + growthAnchor.<p> × (index − 1)` (`modules/growth.ts`, line 100), and caps export orders at `growthExportHeadroom` × `growthAnchor.<x0>` × the index (line 127). So whenever the opening re-sets a parameter that has a growth anchor, it sets `growthAnchor.<p>` to the same value. B does this through one helper, `setNormal(id, value, provenance)`, and T2 checks it. On this profile it applies to:
- `gHealth`, `gEdu`, `gOther`, `gInv`, `trOA` and `trFam`;
- `xFish`, `xAlu`, `xTour` and `xOther`;
- `krona0` and `bondW`;
- `pop{Y,W,O}`;
- `worldPrice0`, `fishPrice0` and `aluminiumPrice0`.

Without it, fish exports would open capped. Today's marine volume, 8.144, is above 1.1 × the 2025 normal of 7.26, which is 7.99.

**P: policy settings, today's values (never gaps).**
- `piT` = 0.025 (`financial.inflationTarget`; already the growing variant's value).
- **World prices and the foreign rate:**
  - `worldPrice0` = 1.03386 (bridge, §1.6). `fishPrice0` = `aluminiumPrice0` = 1.03386 (bridge; their records are gaps).
  - `iFnow` = 0.03375 (bridge, §1.6). `iF0` stays 2%, the normal foreign rate in the carry terms, so the rate gap with abroad starts where it is: (8.00 − 5.50) − (3.375 − 2.00) = **1.125 pp**.
- **Income tax.** `tau0` (Closed) is set so that month-0 revenue equals the latest four quarters at month-0 prices: 2,187.0 × F = ISK 2,276.2 bn a year (`fiscal.revenue.rolling4q`). `vat0`, `tauF` and `rr` keep their 2025 values (`gap.fiscal.tau0` and `gap.fiscal.vat0` say no current effective rate was verified). `css` = 6.35% (`statutory.payroll.general`) is already equal.
- **Government consumption.** `gHealth`, `gEdu` and `gOther` are scaled by one common factor (Closed), so that public services at month 0 equal government consumption in §1.7: 31.888 units (ISK 1,575.6 bn a year).
- **Public investment.** `gInv` (Closed) = 4.18 × (198.861 ÷ 202.028) × F ÷ `domesticPrice` = 3.934 real (`macro.governmentInvestmentNominalRolling4Q`, `…Annual`).
- **Transfers.** `trOA` and `trFam` are scaled by one common factor (Closed), so that total expenditure equals 2,328.9 × F = ISK 2,423.9 bn a year (`fiscal.expenditure.rolling4q`), with the model's month-0 interest bill included. Revenue and expenditure together give the balance of −2.76% of GDP.
- `tga` = 8.505, today's treasury account, so `treasuryTopUp` (12 a year) issues no bonds in month 1.
- `debtR0` = the model's debt ratio at month 0, 53.7%, so the income-tax response to debt starts at rest. The 2025 value, 56.7%, would cut taxes from month 1 only because the denominator changed.
- `fxr` (Closed) ≈ 19.4: the value at which the reserve target equals today's reserves at month 0 (19.203 units), with the target valued at last month's exchange rate, today's world-price anchor and real output. Before, it was 19.2% of 2025 GDP.
- `kapT` = the model's capital ratio at month 0, 28.0%, so bank dividends do not pay out a gap at `lamEq`.
- Already equal to data, confirmed by T2:
  - `ltvLimit` 0.80, `ltvYExtra` 0.10 (`financial.mortgageLTV*`);
  - `dstiY` 0.40, `dstiW` 0.35 (`financial.mortgageDSTI*`);
  - `floorN` 0.055, `termN` 40, `floorI` 0.03, `termI` 25 (`financial.mortgageStress*`).

**C: contract terms on today's stocks, from records.**

| Parameter | Today | Was | Record |
|---|---|---|---|
| `sMN` | 1.897 pp | 1 pp | `financial.mortgageNAdvertised` − 8.00 (advertised rates; the outstanding-weighted rate is a gap; checked in §1.8) |
| `rMI0` | 3.65% | 2.5% | 4.65 − `psiIdx` 0.4 × (8.00 − (3.00 + 2.50)) |
| `sL` | 2.30 pp | 2.5 pp | `financial.businessPreferredLandsbankinn` − 8.00 (one bank; flagged) |
| `rBI0` | 3.41% | 2.0% | `financial.bondParIndexed5Year` |
| `bondRate` history | 7.49% | `i0 + sB` | `financial.bondParNominal5Year`. `sB`, the spread on new issues, stays at 0.5 pp: no record measures it. The inverted yield curve (7.82 / 7.49 / 7.08 at 3 / 5 / 10 years) is the market expecting cuts, which the model's rule supplies |
| `theta` | 0.643 | 0.65 | Indexed share of the stock (§1.3) |
| `mD`, `sBB` | kept, 1 pp | | No record isolates them; flagged and checked in §1.8 |

**`payout` is not re-set (decision 0018 records the choice).** The anchor's payout ratio, 18.07% of pension rights a year, stays. On today's rights for older households (4,221.7) it pays ISK 763.0 bn a year, against 361.5 bn of domestic benefits paid in 2025 (`financial.pensionDomesticBenefitsPaid2025`). That ratio of 2.11 is a warning in T11, not a start gap. Fixing it is a separate change to the base calibration, with the goldens and the harness regenerated and reviewed, after which the opening reads the fixed value. `c0O` is not re-solved either.

**N-a: holding preferences, re-set to today's ratios.** These close fast (`firmCashSpeed` 12 a year, `lamBW` 2, `lamReb` and `lamFA` 0.5), so keeping the 2025 values would cause large, artificial portfolio flows in month 1. All are Closed.
- `dep{j}0` = each firm's deposits ÷ `nominalGDP`(0), 108.241.
- `bW0` = W's government bonds ÷ `nominalGDP`(0) = 10.445 ÷ 108.241 = 0.0965.
- `boSh0` = 295.6 ÷ (891.7 + 295.6) = 0.249.
- PF shares: `bbSh0` = 1,332.1 ÷ 9,326.3 = 0.1428; `dPF0` = 0.0197; `nwPF0` = −0.0059.
- `pfForeignTarget` = 0.4192 (`financial.pensionForeignShare`).
- `bondW` = W's real government bonds = 10.445 ÷ `domesticPrice`(−1) = 9.642.
- `krona0` = W's real króna holdings less the carry trade's extra wanted bonds = (3.666 + 10.445) ÷ 1.08325 − 9.642 × `psiB` 5 × 0.01125 = 13.026 − 0.542 = **12.484**. The stock part of the portfolio gap is then 0 at month 0, and the flow part is the krónur still flowing to non-residents.
- **Import propensities.** `muC`, `muD`, `muI` and `muG` are scaled by one common factor κ (Closed), so that behavioural imports at month 0 equal the reconciled imports, 42.764 (§1.7). Exporters' import shares (`mX*`) are input–output data and stay. A κ outside [0.9, 1.1] is a warning. The strong real króna (0.905) alone raises imports by 0.905^−0.84 = 1.087, so κ is expected below 1.

**N-b: normal levels.** These keep their structural values, except for capacity, population and exports:
- `pop{Y,W,O}` from 1 January 2026 (`macro.populationYoung` 96,712, `macro.populationWorking` 157,307, `macro.populationOld` 55,424). The labour-force normalisers follow with 2025 participation. `uBase` stays at the 2025 normal rate, 4.24% (2025 LFS average 4.3%, series `unemploymentLFS2025` in `current-hagstofa.json`).
- `potentialOutput` (the base of `referenceCapacity`, Closed) = `output`(0) ÷ (1 + the labour-market output gap at month 0), with the gap = `okunGap` 1.6 × (4.24 − 5.8)% = −2.49%. The CBI's own gap estimate is a gap (`macro.gapPotentialOutput`). This is the reading the key-rate rule uses, so the two agree.
- **Export normals** (Closed) `xFish`, `xAlu`, `xTour` and `xOther`, with their growth anchors. Each is the month-0 volume ÷ (foreign demand felt × competitiveness^elasticity) at month 0, so the export rules open at today's volumes. The volumes at month-0 prices are:
  - marine 381.0 × F ÷ 49.41211 ÷ 0.98549 = 8.144;
  - aluminium 6.433;
  - tourism 634.8 × F ÷ 49.41211 ÷ 1.08841 = 12.284;
  - other 13.559.

  The receipts records are `external.exports.{marine,aluminium,tourism,other}.rolling4q`. These are demand normals, like capacity, so exports need no start gap. T2 then checks that no export opens in the capacity regime.

**Anchor overrides (what `c.base` reads).** `Ctx.base` and `IndicatorCtx.base` read the structural anchor (§6). Every such read in a rule or level report was audited:

| Read | Where | Decision |
|---|---|---|
| `c.base('cashServiceCoverage{j}')` | `lenderConfidence`, `financial-fragility.ts:326` | **Override to the month-0 value.** Against the 2025 anchor (a 3% key rate), today's coverage at a 10.3% loan rate is far below normal, so confidence would head for −1 from month 1 and the no-change path would open with a self-made credit squeeze. With the override, confidence opens neutral and moves only with coverage from here (T4, T5) |
| `c.base('nominalGDP')`, `c.base('outputTrailing12')` | `reserveTarget`, `central-bank.ts:51` | **Keep the 2025 anchor.** The target is "fxr% of GDP at 2025 prices", scaled by real output against 2025, as decision 0013 intends. `fxr` is set in closed form above, so the target equals today's reserves |
| `c.base('productiveCapitalReal')`, `c.base('productiveCapitalReal{j}')` | `productiveCapacity` and export capacity, `growth.ts:128, 207` | **Keep.** The opening keeps the capital quantities, so the adequacy ratio is 1 at month 0 either way |
| `c.base(driver)` | The four growth indicators, `growth.ts:187` | **Override `productiveCapacity` to its month-0 value.** No rule reads its base, so only the indicator changes, and all four indices open at 100, as their unit, "index (opening = 100)", says |
| `c.base('nominalGDP')` | `isk()` in `indicators.ts:36` and the money indicators in `financial-fragility.ts:398` | **Replace with the fixed unit** (§2) |
| `f.baseStock('deposits', j)` | A check in `firms.ts:739` | Not a rule; unchanged |

### 1.6 What is not yet data (bridges and placeholders)

The opening uses the following. Each appears in the report as `assumed` or `placeholder`. Each is a follow-up for the data generation script, which is not in the repository; when the snapshot gains a record, B replaces the bridge.

| Item | Bridge | Missing record |
|---|---|---|
| Flows at month-0 prices | × F = 1.04078, the CPI's rise from the window average to September 2026 (§1.1) | Monthly or seasonally adjusted national accounts at September 2026 |
| `wage` level against its 2025 average | `cpi`(Aug 2026) × (1 + `macro.realWageGrowthYoY` 0.035%) = 694.6 ÷ 653.1 × 1.00035 = 1.06391 | LAU04000 2025 average |
| CPI component levels | Housing-free components at the housing-free 12-month rate (5.7%), housing from the identity, domestic prices from the identity | VIS01000 sub-index 2025 averages |
| `importPrice` | At the border price (the pass-through rule at rest) | Hagstofa CPI by origin, imported-goods sub-index, as a level against 2025 (`macro.gapCpiImportDomesticWeights`; the snapshot has only its shares, 25.0% in January and 24.8% in September 2026) |
| `worldPrice0` | (1.027)^(15/12) = 1.03386: trading partners' 2026 inflation forecast (`world.partnersInflation2026`) over the 15 months since mid-2025 | `gap.external.worldPrice0` |
| `fishPrice0`, `aluminiumPrice0` | Equal to `worldPrice0`: prices relative to world prices unchanged since 2025 | `gap.external.fishPrice0`, `gap.external.aluminiumPrice0` |
| `iFnow` | Unweighted mean of the ECB, Bank of England and Federal Reserve policy rates | The CBI's trade-basket currency weights |
| Real GDP level | 2025 × (1 + seasonally adjusted year-on-year growth, 0.3%) (warning only) | QNA seasonally adjusted volume level |
| Placeholders | `eShareW` 0.55; `loanShareX*`; the `eqH*` age split; `eqW`; capital quantities; `mD`, `sBB`, `sB` | Sector and age splits |

### 1.7 Expenditure reconciliation at month 0

The model's 2025 calibration does not copy the national accounts one for one. `steady.ts` derives consumption from the income side and imports from the current account, and it has no separate line for housing investment or inventories. In 2025 the model's household consumption was 51.6% of GDP against 49.4% in the national accounts. So each month-0 component is the model's 2025 component × its national-accounts counterpart's ratio (rolling four quarters ÷ 2025) × F. This keeps the one mapping the model has. Imports are the single declared residual, and a scale on the import propensities makes the behavioural rules produce it (κ, §1.5).

| Component | Model 2025 | Record: rolling ÷ 2025 | Month 0 (units) | ISK bn a year | Treatment and tolerance |
|---|---|---|---|---|---|
| Household consumption | 51.609 | `macro.consumptionNominalRolling4Q` ÷ `…Annual` = 2,518.4 ÷ 2,439.6 = 1.03228 | 55.447 | 2,739.7 | Data (consumption states), exact |
| Public services | 29.530 | `macro.governmentConsumptionNominalRolling4Q` ÷ `…Annual` = 1.03755 | 31.888 | 1,575.6 | Data (spending scale), exact |
| Business investment | 16.000 | `macro.businessInvestmentNominalRolling4Q` ÷ `…Annual` = 1.01443 | 16.893 | 834.7 | Data (investment states), exact |
| Public investment | 4.180 | `macro.governmentInvestmentNominalRolling4Q` ÷ `…Annual` = 0.98432 | 4.282 | 211.6 | Data (`gInv`), exact |
| Exports | 40.420 | Receipts by sector × F (§1.5 N-b); the mapped ratio gives 42.491 | 42.495 | 2,099.8 | Data (export normals); ±2% of `macro.exportsNominalRolling4Q` × F, gate |
| Imports | 41.739 | `macro.importsNominalRolling4Q` ÷ `…Annual` = 0.98354, mapped: 42.726 | **42.764** | 2,113.1 | **Residual**: GDP − the other components. Against the mapped record +0.09%; ±2%, gate. κ makes the import rules produce it |
| **GDP** | 100.000 | `macro.gdpNominalRolling4Q` ÷ 49.41211 × F | **108.241** | 5,348.4 | The identity, exact |

Housing investment (`macro.housingInvestmentNominalRolling4Q`, 246.9) and inventories (5.3) have no model line, as in 2025. The opening report shows each model component beside its own record at face value, as a warning row explaining the 2025 mapping. For example, the model's consumption is ISK 2,739.7 bn a year, while Hagstofa's rolling four quarters are 2,518.4 bn, which is 2,621.1 bn at month-0 prices.

### 1.8 Interest and income cross-checks (warnings)

Rates applied to whole stocks are advertised or market rates, because no outstanding-weighted rate is in the snapshot. These checks show how far that goes. They are month-0 annual rates against 2025 calendar-year records.

| Check | Model at month 0 | Record | Ratio |
|---|---|---|---|
| Household mortgage interest | 1,048.1 × 9.897% + 1,888.3 × 4.65% (real) = ISK 191.5 bn | `macro.familyMortgageInterestTotal` 151.2 (2025 tax returns) | 1.27 |
| General-government interest | 1,839.8 × 7.49% + 960.9 × 3.41% (real) = ISK 170.6 bn | `fiscal.interest.2025` 230.2 (includes indexation and interest on other liabilities) | 0.74 |
| Households' interest on deposits | 2,113.0 × 7.00% = ISK 147.9 bn | No interest-only record. `macro.familyCapitalIncomeTotal` 355.3 includes dividends, rents and gains, so it is an upper bound: warn if model property income exceeds it | — |
| Pension payouts | ISK 763.0 bn (§1.5) | `financial.pensionDomesticBenefitsPaid2025` 361.5 | 2.11 |
| Older households' income | evaluated | `macro.familyIncomeAfterInterestO` 453.7 | B reports |

`mD` stays 1 pp. A deposit rate of 7.00% on all deposits overstates households' interest income, since demand deposits pay 0.05–0.50%. An outstanding-weighted deposit rate would settle it (`financial.depositOutstandingWeightedRate` is a gap).

---

## 2. The money unit

- **Model money stays in its unit.** One unit is 1% of 2025 nominal GDP: ISK 4,941.211 bn ÷ 100 = **ISK 49.41211 bn** (`macro.gdpNominalAnnual`; `GDP_BN` in `src/models/iceland/util.ts`). Flows are at annual rates.
  - Every parameter and `calibration.json` value is already in this unit.
  - The stationary controls keep GDP = 100.
  - The ISK value never changes with a data vintage.
  - Today's GDP is 108.241 units at an annual rate (§1.7).
- **`ModelDef.moneyUnit`** = `{ label: 'ISK bn', perUnit: 49.41211, basis: 'Hagstofa THJ01102: 2025 GDP at current prices, ISK 4,941.211 bn (September 2026 vintage); one model unit is 1% of it' }`.
- **Conversions:**
  - a flow becomes ISK bn a year (value × 49.41211); a month's amount is ÷ 12;
  - a stock becomes ISK bn (value × 49.41211);
  - a real quantity becomes ISK bn at 2025 prices;
  - a rate held as a fraction becomes % (× 100);
  - an index is shown as 2025 = 100, or on the source's own base where the interface shows a record beside it.
- **One fix in the level reports (not applied; decision 0018).** The claim below that the two conversions agree on the stationary models does not hold for a stationary variant solved with another `Y0`, which an existing test checks, so the conversion was left as it is. On `iceland-today` the structural anchor of nominal GDP is 100 and is not overridden, so its amounts are exactly ISK 49.41211 bn per unit. The original text: `isk()` in `modules/indicators.ts` and the money indicators in `modules/financial-fragility.ts` divide by `c.base('nominalGDP')`. Under §6, `base` reads the structural anchor, where `nominalGDP` = 100, so the conversion would still be right on `iceland-today`. It is replaced by the fixed unit (`GDP_BN / 100`) anyway: an ISK amount must not depend on an anchor value, and anchors can now be overridden (§1.5). On the stationary models the two differ by at most 1e-16 relative, and no golden or report holds a level in ISK.

---

## 3. Smoothness

### 3.1 A consistent month 0

The kernel evaluates the whole schedule once at the opening state. Every identity and every non-adjusting rule must reproduce any value the opening gives it to within 1e-9 relative (T2): for example, the CPI as the weighted sum of its components, `nominalGDP` as the sum of its components, the 12-month inflation from the history, and `realHousePrice`. Terms, desired values and regimes at month 0 come from this evaluation, under every padlock configuration (`byMask`), as `initialBaselineForGrowingModel` already does.

### 3.2 States at rest, closed forms and what is solved

- **At rest (Tgt):** every smoother without data is set equal to its input at month 0. These are:
  - the `*Smoothed` profits, `permIncome*` and the `*Felt` demand states;
  - `worldPriceAnchor`, `kronaInflowW`, `realExchangeRate`, `profitability*` and `importCostSeen`;
  - `vatInPrices`, `wageGapSeen`, `investmentDesired{j}` and `employmentDesired{j}`.

  A gap in any of these would move dividends, investment or prices for no reason. `importPrice` is at rest against the border price too.
- **Closed form:** `neutralRate`, `adaptiveInflation` and `labourCostSeen` (§1.4), plus the parameters marked Closed in §1.5. Each is a direct function of the evaluated month 0. `labourCostSeen` follows wages from a known distance, so firms' view of labour cost keeps pace with the 5.7% wage growth.
- **Solved:** only the start gaps (§3.3). The earlier revision's latent `importCostSeen`, solved against `importPrice`, is gone. `importPrice` does not read `importCostSeen`, so that column of the Jacobian was zero. `kronaSentiment` is no longer used either: it is the user's króna-shock channel.

### 3.3 Fading start gaps

A start gap is one extra term on a behaviour rule: g · b · exp(−f · t), with t in years from month 0.
- **Size.** g is solved, and is the parameter `startGap.<group>`.
- **Scale.** b is 1 for an absolute gap. For a relative gap it is the rule's month-0 value, `startGapBase.<target>`, set by the opening.
- **Fade.** f is the parameter `startGapFade.<group>`, per year, with provenance `assumed`.
- **Where it applies.** On an adjusting rule the term is added to the desired value before the adjustment; on a rule with `combine`, after combining. Gaps are allowed only on BEHAVIOUR rules: never on a rule whose target is a stock (stocks change only through postings), and never on POLICY, CONTRACT or IDENTITY rules.
- **How it shows.** The term is labelled "Today's gap from this rule, fading (half gone in N months)", with N = round(12 · ln 2 ÷ f), or "in about N years" (to the half year) when N exceeds 24. It is tagged with the concept `start-gap` and appears in the inspector like any other term.

**Always on (four groups, six unknowns).** Each is a level or rate the data set and the rule cannot reproduce. Without the gap, month 1 would jump.

| Group (targets, scale) | What the gap stands for | Solved to match (target, read from months 0 and 1) | Unknowns | Fade (half-life) |
|---|---|---|---|---|
| `wage` (`wageGrowth`, absolute) | Contracted raises the wage curve does not explain (the 2024 agreements run to 2028) | Month-1 `wageGrowth` = 5.7% a year (`macro.wageGrowthYoY`; the instantaneous rate, so the gap moves it). The 12-month 5.7% at month 0 is a T2 check, met by the history | 1 | 1/yr (8 months) |
| `labourSupply{Y,W,O}` (`unemployed{g}`, relative, three groups) | Labour supply (immigration and participation) outrunning jobs | `unemployment{g}`(0) = the group's 2025 rate × 5.8 ÷ 4.24 (the age bands are a gap in the data), so the total is 5.8% | 3 | 0.5/yr (17 months) |
| `markup` (`domesticPrice`, relative) | Domestic prices 4.9% above their usual markup on costs: services and other domestic prices have outrun wages and import costs since 2025 (real wages are flat, `macro.realWageGrowthYoY` 0.035%) | Month-1 CPI inflation, annualised = 5.7% (`macro.cpiAnnualized6M`). The gap is expected near +0.06 to +0.09 of the rule's value, depending on how fast rents move in month 1 | 1 | 0.5/yr (17 months) |
| `krona` (`logExchangeRate`, absolute) | Today's real appreciation that the rule's purchasing-power, carry and portfolio terms do not explain. At month 0 those terms put the target at +0.0776 (purchasing power +0.0467, carry −0.0056, flows +0.0365) against −0.0479 actual | Month-1 change in `logExchangeRate` = −2.09% a year (`financial.tradeWeightedIndexNarrowYoY`). The gap is about −0.128 log points | 1 | 0.2/yr = `lamPPP` (about 3½ years). The evidence the króna rule cites puts the half-life of deviations from purchasing-power parity at three to five years |

**Conditional (declared, switched on only if T4 fails without them).** These families have a data level at month 0 and an adjusting rule that may want a different level. B first runs T4 with them off. A family is switched on only if its own T4 row fails, and decision 0018 records which ones are on. Each is one tied unknown, solved so that its month-1 change equals the growing variant's trend: no momentum is read from noisy year-on-year rates. Families that stay off add no term to any rule.

| Group (targets, scale) | Month-1 target | Fade |
|---|---|---|
| `spending` (`consumption{Y,W,O}`, relative) | Real consumption grows at `growthReal` | 1/yr |
| `investment` (`investmentPlan{j}`, relative) | Real business investment grows at `growthReal` | 1/yr |
| `hiring` (`employmentDesired{j}`, relative) | Employment grows at `growthPopulation` | 1/yr |
| `housePrices` (`logRealHousePrice`, absolute) | Real house prices unchanged | 1/yr |
| `rents` (`housingCost`, relative) | Housing cost grows at `growthInflation` | 1/yr |
| `mortgageDemand` (`mortgageDemand{Y,W}`, relative) | Net mortgage lending unchanged | 1/yr |

Guards (T11): a relative gap larger than 25% of its rule's month-0 value is a warning. So is an absolute gap above its declared bound: 5 pp for `wage`, 0.15 log points for `krona`.

### 3.4 The opening solve

Each evaluation of the opening does four things:
1. Apply the unknowns.
2. Run the `derive` pass: the closed-form values of §1.4 and §1.5, computed from the evaluated month 0. This is repeated until nothing moves by more than 1e-12, at most 20 rounds.
3. Evaluate month 0, and take one month.
4. Read each target's residual from months 0 and 1.

The unknowns are the six always-on gaps plus any conditional ones, so 6 to 12 in all. Every target pairs with one unknown that moves it: wages, unemployment by group, CPI, the króna and, when on, the conditional families.
- **Structural-rank check.** Before solving, `openingBaseline` takes a finite difference of every residual with respect to every unknown at the start point. Every unknown must move at least one target by more than 1e-10 (relative to the target's scale), and every target must depend on at least one unknown. Otherwise it throws, naming the offending unknowns and targets. It also throws if the Jacobian's condition number exceeds 1e10, naming the most collinear pair. A tests this on the fixture with a deliberately inert unknown and a deliberately unreachable target.
- **The solve** uses the steady-state Newton and Levenberg–Marquardt machinery in `numerics.ts`, and fails if its largest residual is above 1e-9 after polishing.
- **Committed solution.** The solve runs only in tests and the harness. B commits the solved unknowns to the extract file (`data/iceland/today-2026-09-30.json`, block `solution`). At load, `openingBaseline` runs in check mode: it applies the committed values, runs `derive`, evaluates months 0 and 1, and requires every residual below 1e-9; otherwise it throws with the residuals. A test re-solves from scratch and requires agreement with the committed values to 1e-9 relative. So a code change that moves the opening fails a test before any deploy, and page load costs one `derive` pass and one month (R12).

### 3.5 What stays put in month 1

- Stocks change only through postings from month 1.
- The fast holding targets are at today's ratios (§1.5 N-a), so `firmCashSpeed`, `treasuryTopUp`, `lamBW` and `lamFX` see no gap from holdings.
- The two policy rules start at rest (§4).
- The import-price block is at rest: `importPrice` at the border price, `importCostSeen` at the delivered price.
- Lender confidence is neutral and stays so, because its normal is today's coverage.
- T4 bounds every remaining month-1 change.

---

## 4. Policy today

### 4.1 Lever defaults and their unchanged marks

The profile sets each lever's `default` to today's setting. The default is the lever's unchanged mark and what "back to the start value" restores.

| Lever | Start value | Note |
|---|---|---|
| `keyRate` | **8.00** | Padlock unlocked: the lever shows the live rate, marked "auto". The mark stays at 8.00 |
| `incomeTax` | 0 pp | Relative to today's effective rate (`tau0`, closed form). The definition names that rate once |
| `vat` | 0 pp | Relative to the effective VAT rate, kept from 2025 |
| `health`, `education`, `otherServices`, `publicInvestment`, `oldAgeTransfers`, `familyBenefits` | 0 | Relative to today's levels (§1.5 P) |
| `unemploymentBenefits` | 0 pp | Today's replacement rate (`rr`) |
| `ltvCap` | 80 | `financial.mortgageLTVGeneralCap` |
| `dstiCap` | 0 pp | Rules 1300/2025: 40% / 35% |
| `foreignRate`, `importPrices`, `fishPrices`, `aluminiumPrice` | 0 | Shifts from today's levels (`iFnow`, `worldPrice0`, `fishPrice0`, `aluminiumPrice0`) |
| `keyRateLock`, `incomeTaxLock` | 0 (unlocked) | The owner's rule: padlocks start unlocked |
| The rest (shocks, `tourism`, `foreignDemand`, `lendingAppetite`, `wageSettlement`, migration, `bondBuyers`, `pfForeign`) | Their current defaults | None describes a policy setting of today |

`LeverDef.default` stays 3 in the stationary `iceland` model, where `HELD_RATE` in `calibration.ts` and the goldens use it.

### 4.2 The padlocks start unlocked

From month 1 the central bank's rule sets the key rate and the debt rule sets the income-tax adjustment, on the no-change path and on every run. Both rules start at rest:
- the rule's target equals 8.00% at month 0 (`neutralRate`, closed form);
- `debtR0` equals today's debt ratio (§1.5).

So nothing jumps when the clock starts, and every later move is the rule's response to how the economy evolves. When the user moves a lever, it locks at that value and everything else reacts. Unlocking hands it back to its rule, which steps from the value in force (decision 0010).

### 4.3 What the central bank's rule does in the first two years

The rule (`ruleTarget`, decision 0012):

```
target = (neutral estimate + 2.5) + 1.3 × (expected inflation − 2.5) + 0.5 × (12-month inflation at constant VAT − 2.5) + 0.8 × (4.24 − unemployment)
```

The key rate closes about 11% of the gap to the target each month (`lamPol` 1.4 a year).

At month 0: 5.20 + 1.3 × 1.8 + 0.5 × 3.4 − 0.8 × 1.56 = **8.00**, with the neutral estimate at 2.70%.

The table below is **rule arithmetic, not a model run**. It feeds assumed paths for inflation, expectations and unemployment into the rule, including its neutral-rate learning (`kappaR`, `kappaU` 0.15). The central path is shaped on the CBI's forecast (Monetary Bulletin 2026/3): inflation averaging 3.6% in 2027 (`macro.cpiInflationForecastAnnualAverage2027`), and unemployment of 5.9% in 2026 and 5.2% in 2027 (`macro.unemploymentForecast2026`, `…2027`).

| Path (inflation, expectations, unemployment at months 12 and 24) | Month 6 | Month 12 | Month 18 | Month 24 |
|---|---|---|---|---|
| Central (4.0 / 3.6 / 5.5; 3.0 / 3.0 / 5.2) | 7.79 | 7.31 | 6.77 | **6.23** |
| Slow disinflation (4.6 / 3.9 / 5.6; 3.6 / 3.3 / 5.4) | 7.88 | 7.62 | 7.24 | 6.78 |
| Fast disinflation (3.4 / 3.3 / 5.4; 2.6 / 2.8 / 5.0) | 7.70 | 7.01 | 6.32 | 5.78 |
| Market participants' survey, 10–12 Aug 2026 | | 8% in 2026Q3 | | **6.25%** in two years |

The survey is in the note on `expInflMarket2y` in `current-financial.json`. On the central path the rule cuts gradually from the start of 2027 and is within a few hundredths of the market's 6.25% at two years. The model's own disinflation decides the actual path. Two forces push it in opposite directions:
- the fading margin gap pulls domestic inflation down;
- the fading króna gap and the purchasing-power term, which ties the króna to domestic prices at once, push import prices up (§10 R5).

T5 reports the result beside these published figures, and the no-change golden (T10) records it. It is a comparison, not a test (the owner's decision, 6 October 2026): the path is the model's own rules' outcome and does not have to agree with the Central Bank's forecast or the market's.

The **debt rule**, unlocked, raises income tax only as debt rises above today's ratio (`phiTau` 0.25 points per point of debt, phased in at `lamTau` 0.5 a year). With a deficit of 2.76% of GDP and nominal growth near 4–6%, the ratio moves slowly, and so does the tax. Its counter-cyclical form applies only while the key rate is locked (decision 0016).

---

## 5. The application's default model

### 5.1 The profile

- **`iceland-today`**, labelled "Iceland Inc. · today", is built as `createGrowingFinancialModel({ id: 'iceland-today', modelTransform })`. The transform applies today's parameters (§1.5), the lever defaults (§4.1) and the active start-gap groups (§3.3). The profile also declares:
  - `opening: ICELAND_OPENING` (id `iceland-2026-09-30`);
  - `calendar: { month0: { year: 2026, month: 9 } }`;
  - `moneyUnit` (§2).
- **Growth assumptions:** the defaults of the growing variant (real 1.4%, population 0.5%, world 3.0%, prices 2.5%; `GROWTH_DEFAULTS`), unchanged. They now compound from September 2026.
- **The description** says plainly: the economy as published on 30 September 2026, then the model's own rules; a teaching model, not a forecast.

### 5.2 Registry and controls

| List | Contents | Used by |
|---|---|---|
| `models` (`src/models/index.ts`) | `reference`, `iceland`, unchanged | The harness, the lever reports, the goldens and the calibration checks: the stationary controls for mechanisms |
| `applicationModels` | `iceland-today`, `iceland-growing`, `iceland`, `reference` | The interface |
| `PREFERRED_MODELS` (`src/ui/model/registry.ts`) | `iceland-today`, `iceland`, `reference` | The model the application opens |
| `LINK_ONLY_MODELS` (new, `registry.ts`) | `iceland-growing` | Links shared until now name `iceland-growing`, the current default. It still opens from such a link but is not listed in the switcher, so the switcher stays short |

`createRegisteredEngine(def)` builds the anchors as now: the steady state, or `initialBaselineForGrowingModel` for a growing model. When `def.opening` exists, it passes them to `openingBaseline` (check mode) and hands the result to `createEngine` as its baseline. The engine client's no-change engine is created from the same baseline (`baseline: e.baselineData`, as now), so it opens on the same month 0, bit for bit.

### 5.3 Scenarios and share links

- **`Scenario.opening?: Id`** (optional) records the opening a scenario was made from; `scenario()` writes it. The format stays at version 2, because the field is additive and older readers ignore it.
- **The link key `o`** carries it: `#m=iceland-today&v=2&o=iceland-2026-09-30&t=24&e=1:keyRate:7.5&x=…`. "Share scenario" writes it silently. On load it is read and kept, and nothing is shown. There is one opening today, so a link always replays on it. A message about older openings waits until a second opening exists.
- Links to `iceland-growing`, `iceland` and `reference` are unchanged.

---

## 6. The engine contract

Engineers A, B and C build against these names and types. They are additive: when they are absent, every existing model and test behaves bit for bit as now (T9).

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

/** Where a month-0 value comes from. T1 accepts positions with basis data, residual, mirror or allocated only. */
export interface OpeningSource {
  basis: 'data' | 'residual' | 'mirror' | 'allocated' | 'solved' | 'closed' | 'evaluated' | 'assumed' | 'placeholder';
  records?: Id[];    // observation ids, e.g. 'financial.depositsHH'
  period?: string;   // e.g. '2026-08-31'
  note?: string;     // the conversion, the identity a residual closes, or the allocation key
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
  scale: number;     // the residual's typical size, for the rank check
  residual: (month0: IndicatorCtx, month1: IndicatorCtx) => number;
}
export type OpeningUnknown = { var: Id } | { param: Id };   // a tied gap group is one param: 'startGap.<group>'
/** What a model's opening builder returns. */
export interface OpeningState {
  stocks: OpeningStock[];
  /** Exactly one position per financial instrument, which the kernel fills so the instrument balances. */
  fills: Record<Id /* instrument */, Id /* player */>;
  vars: Record<Id, OpeningVar>;
  /** Every parameter the opening sets, with provenance; `derive` may replace the values. */
  params: Record<Id, OpeningParam>;
  /** Overrides of the structural anchor read by Ctx.base and IndicatorCtx.base, by variable.
   *  'month0' is the variable's evaluated month-0 value. Listed in the report. */
  anchors?: Record<Id, number | 'month0'>;
  /** Closed-form values from the evaluated month 0. The kernel repeats derive → evaluate
   *  until nothing moves by more than 1e-12 (at most 20 rounds), inside every solve evaluation. */
  derive?: (month0: IndicatorCtx) => { params?: Record<Id, number>; vars?: Record<Id, number> };
  solve?: {
    unknowns: OpeningUnknown[];
    targets: OpeningTarget[];
    /** Committed values of the unknowns, keyed by var or param id. Check mode applies them. */
    solution?: Record<Id, number>;
  };
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
  vars: { id: Id; value: number; source: OpeningSource }[];
  params: { id: Id; value: number; anchor: number; provenance: Provenance }[];
  anchors: { id: Id; value: number; structural: number }[];        // the overrides
  gaps: { group: Id; targets: Id[]; value: number; scale: 'relative' | 'absolute'; shareOfRule: number; fade: number; halfLifeMonths: number }[];
  checks: { id: Id; value: number; expected: number; tolerance: number; pass: boolean; gate: boolean }[];
  month1: { id: Id; month0: number; month1: number; month2: number; bound: number; pass: boolean }[];   // T4 table
  regimes: { rule: Id; regime: string; onAnchor: boolean }[];       // active at month 0, by padlock configuration
  solve: { mode: 'check' | 'solve'; unknowns: number; iterations: number; residual: number; condition: number };
  /** Every record used: the union over positions, vars, params, checks and targets. */
  recordsUsed: Id[];
  warnings: string[];    // T11
}
/** Build, validate (T1, T2), evaluate month 0 under every padlock configuration, run derive, then
 *  check the committed solution (mode 'check', the default when one is given) or solve (mode 'solve').
 *  Throws with the numbers on a hard failure, a rank failure or a residual above 1e-9. */
export function openingBaseline(m: KModel, def: OpeningDef, anchor: Baseline,
  opts?: { mode?: 'check' | 'solve'; tol?: number; maxIter?: number }): Opening;
/** How many months back each variable is read at month 0 (found by evaluating one step with a recording lag()). */
export function lagReach(m: KModel, base: Baseline): Map<Id, number>;
/** Model-language helper: add a fading start-gap term, per group, to the named BEHAVIOUR rules, through `replaces`.
 *  Creates `startGap.<group>` (default 0) and `startGapFade.<group>` (the fade, per year); for a relative group also
 *  `startGapBase.<target>` per target (that rule's month-0 value, set by the opening). The term on each target is
 *  startGap × (relative ? startGapBase : 1) × exp(−fade × t). */
export function withStartGaps(model: ModelDef,
  groups: Record<Id /* group */, { targets: Id[]; fade: number; scale: 'relative' | 'absolute'; label?: string }>): ModelDef;
/** "half gone in 8 months" / "half gone in about 3½ years", from a fade per year. */
export function halfLifeText(fade: number): string;

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
export const START_GAP_GROUPS: Parameters<typeof withStartGaps>[1];   // the always-on groups and any conditional ones switched on
export function createIcelandTodayModel(): ModelDef;  // growing + financial stress + today's settings + gaps + opening
export const icelandTodayModel: ModelDef;
export function record(id: Id): { value: number; unit: string; period: string; source: string };  // throws on a missing id or a null value
export function setNormal(state: OpeningState, id: Id, value: number, provenance: Provenance): void;  // also sets growthAnchor.<id> when it exists

/* ---------- src/ui/engine-client.ts (C, against A) ---------- */
export interface EngineClient {
  // … as now (comparison, baseline, opening, reportSeries, referenceReportSeries, referenceVarSeries), plus:
  readonly calendar: CalendarMonth | null;     // month 0
  readonly moneyUnit: MoneyUnit | null;
  readonly openingInfo: { id: Id; label: string; asOf: string; recordsUsed: Id[] } | null;
}
// comparison is 'no-change' for every model with a growth module or an opening.
// baseline(id) is the no-change run at the current month; opening(id) is month 0 (today).

/* ---------- src/ui/model/effects.ts (C, new, pure) ---------- */
export type EffectKind = 'amount' | 'index' | 'rate';
export interface Change { value: number; unit: '%' | 'pp' }
/** The change since today: amount and index, % of today's (month-0) nominal value; rate, pp. null at month 0 or when today's value is ~0. */
export function sinceToday(kind: EffectKind, now: number, today: number): Change | null;
/** The lever's effect: amount and index, % of the no-change value at the same month; rate, pp. null when the no-change value is ~0. */
export function effect(kind: EffectKind, now: number, noChange: number): Change | null;
export function money(unit: MoneyUnit, x: number, flow: boolean): { value: number; text: string };  // 'ISK 2,113 bn', 'ISK 2,740 bn a year'
export function calendarLabel(month0: CalendarMonth, t: number, style: 'long' | 'short'): string;    // 'September 2026', 'Sep 2026'
```

Definitions used by all three:
- **Level:** a variable or indicator's value in the run, converted by `moneyUnit` for money and × 100 for rates.
- **Today's value:** the same at month 0, `client.opening(id)`. It never changes with a lever.
- **No-change path:** the client's reference engine, from the same baseline, in the same variant, with no events.
- **Change since today:** the run at month t against today's value. For money and indices it is % of today's nominal amount; for rates it is in pp.
- **Effect:** the run minus the no-change path at the same month. For money and indices it is % of the no-change amount at that month; for rates it is in pp.

With no events every effect is exactly 0 (T8). At month 0 every change since today is 0.

---

## 7. The interface contract

What each view shows on `iceland-today`. The owner's standing rules hold everywhere:
- nothing to approve, no "Apply", no red suggestion marks, no prompts, no notes about locks;
- padlocks start unlocked;
- a lever the user moves locks at that value;
- playback at 1× is one month every two seconds;
- React.

Beside an amount there are at most two changes:
- **the change since today**, shown from month 1;
- **the effect against the no-change path**, shown only once a lever has moved.

Words are "since Sep 2026" and "vs no change".

| View | Shows |
|---|---|
| **The one line** (replaces the context strip) | "Iceland on 30 September 2026, from published data. Without your changes it follows its own rules (dashed lines): a teaching model, not a forecast." Nothing else in the strip: no key-rate pair, no forecast list |
| **Header clock and timeline** | Calendar months: "September 2026" at month 0, "October 2026" at month 1, compact form "Sep 2026". Timeline ticks at each January. Lever-event marks as now |
| **Cards on the map** | One or two numbers each, in today's units: key rate 8.00% (marked "auto" while unlocked, the same word as the lever), unemployment 5.8%, deposits or net worth in ISK bn. After a lever moves, a small signed effect against the no-change path (% for amounts, pp for rates); none while nothing has changed. The red outline and badge for unpaid business debt stay; nothing pulses |
| **Pipes** | Thickness from the ISK amount, as now. Label and title: "ISK 2,740 bn a year · +0.5% since Sep 2026", and after a lever moves "· −0.4% vs no change". Green and red glow against the no-change path at the same month |
| **Inspector: pipes and variables** | Each amount in ISK bn a year (flows) or ISK bn (stocks), each rate in %. Beside it, the change since today and, after a lever moves, the effect. A rule's terms are in the rule's unit, converted the same way. A start gap appears as a term, "Today's gap from this rule, fading (half gone in 8 months)", with the half-life from `halfLifeText(startGapFade.<group>)`, and never as a note. Parameters in money units show ISK bn a year at 2025 prices |
| **Inspector: players and groups** | Balance-sheet rows: the position now in ISK bn, the change since today, and the effect after a lever moves; net worth the same. The limits in force and the financing section as now (bounded) |
| **Inspector: indicators** | The big chart in the measurement the charts panel shows, with the no-change path dashed |
| **Ledger** | Cells in ISK bn a year. The small number is the effect against the no-change path at this month after a lever moves, and the change since today before that. Row sums 0 ✓; column changes in net worth in ISK bn |
| **Lever panel** | Each lever's unchanged mark at today's setting (§4.1): key rate 8.00, tax and spending at 0. While unlocked, the key rate shows its live value, marked "auto". "Back to the start value" restores the start value and keeps a lever with a padlock locked. The info panel's definition names today's setting once (for example, today's effective income-tax rate). No notes, suggestions or approvals |
| **Charts** | The default measurement is nominal levels: ISK bn (a year for flows), %, or an index with 2025 = 100. The run is a solid line and the no-change path a dashed line, both starting at today's value. The other two buttons are real levels ("at 2025 prices") and the effect vs no change (% or pp). The x-axis is in calendar months. Each chart names its unit once; the panel has no notes |
| **"Starting data" dialog** (the header's "Baseline & current data") | Each chart's month-0 value beside the records mapped to it. A record is marked "used for the start" when it is in `openingInfo.recordsUsed`, and "for comparison" otherwise. Groups open on demand, with at most 10 records per chart. No catalogue. The model rows read `client.opening()`, so moving a lever never rewrites them |
| **Feed** | As now: narration against the no-change path. No opening message |
| **Share** | Writes `m`, `v`, `o`, `t`, `e`, `x` (§5.3), with no load line |

Words: on `iceland-today` the interface says "no change", "today" and "start", and never "baseline". Units are written "ISK 2,113 bn" and "ISK 2,740 bn a year"; table headers say "ISK bn".

---

## 8. Acceptance tests

T1–T3, T7 and T8 are hard failures in a new harness layer, `opening`, run for every application model with an opening. Its report is `reports/opening-iceland-today.md`. All of T1–T12 are in `bun test`.

| # | Test | Pass condition (source) |
|---|---|---|
| T1 | Opening balances | Every financial instrument: Σ assets − Σ liabilities ≤ 1e-9 at month 0. Every residual ≥ 0, in ISK bn ±0.5: B deposits 3,671.9; B reserves 507.2; B government bonds 1,010.6; bank bonds 1,332.1; PF shares 2,088.4; FR loans 1,038.2; HW mortgages 812.6 and 1,463.9; HO rights 4,221.7. Every position's basis is data, residual, mirror or allocated; an allocated position names its key. A missing record id or a null value throws |
| T2 | Month-0 values | Every gated row of §1.2 is within its tolerance, including the GDP window identity (104.000), the month-0 GDP (108.241) and imports and exports (±2%). Every identity and non-adjusting rule reproduces the opening's values to 1e-9 relative. Every `OpeningCheck` with `gate: true` passes. The ISK conversion is the fixed unit: `levels('govDebtAmount')[0]` = 2,800.7 ± 0.1. Every re-set parameter with a growth anchor equals its anchor. No regime is active at month 0 that is not active on the anchor, under either padlock configuration; in particular no export is capacity-limited and no credit is rationed. The four growth indices are 100 |
| T3 | Accounting from month 1 | The four checks are below 1e-9 and there is no sign violation for 240 months, with padlocks unlocked (the default) and with both locked |
| T4 | Month-1 continuity, padlocks unlocked | **Solved rows, exact to 1e-9:** month-1 `wageGrowth` 5.7%; CPI inflation in month 1, annualised, 5.7% (`macro.cpiAnnualized6M`); `logExchangeRate` change −2.09% a year. **Rows bounded in months 1 and 2:** key rate \|Δ\| ≤ 0.10 pp; other rates \|Δ\| ≤ 0.10 pp; CPI inflation (annualised) in month 2 within ±1.0 pp of month 1; wage growth in month 2 within ±0.5 pp; `importPrice` \|Δ log\| < 0.5%; exchange rate \|Δ log\| < 0.5% a month. Real consumption, business investment, employment and real house prices: \|x₁/x₀ − 1 − m/12\| < 0.5%, with m the growing variant's trend (1.4%, 1.4%, 0.5% and 0%); a failure here is what switches a conditional gap on (§3.3). `lenderConfidence` \|Δ\| ≤ 0.02. The business-credit approval ratio (`businessCreditApproved` ÷ `businessCreditRequested`) \|Δ\| ≤ 1 pp. Net flows (deficit, `borrowing{j}`, `netMortgageLending`, `bondIssue`, `currentAccount`, `bondPurchasesW`, `foreignAssetPurchases`, `fxReserveSales`): \|Δ\| < 0.3 units (ISK 14.8 bn a year). The table is in `OpeningReport.month1` |
| T5 | Two years, padlocks unlocked (the no-change path): **reported, not gated** (the owner's decision, 6 October 2026) | The path is the outcome of the model's own rules, not a forecast, and it does not have to agree with anyone's. The opening report (`reports/opening-iceland-today.md`) and decision 0018 show it beside the published figures: the key rate at months 6, 12, 18 and 24 beside the market participants' 6.25% in two years and the rule arithmetic of §4.3; `inflation12` beside the Central Bank's 3.6% average for 2027 (`macro.cpiInflationForecastAnnualAverage2027`); unemployment beside 5.2% for 2027 (`macro.unemploymentForecast2027`); real output beside growth of 1.4% in 2026 and 1.9% in 2027 (`macro.gdpRealGrowthForecast2026` and `…2027`); the króna. **Credit and pensions**, also reported: whether any business credit is refused or any credit-rationing regime appears in months 1–24, `lenderConfidence`, PF assets ÷ the past 12 months' GDP (178.9% at month 0) and net foreign-asset purchases beside today's pace of 108 bn a year (2.07% of GDP). No parameter, rule, fade, gap or mapping may be chosen or tuned to move these rows. If the credit rows showed the opening making a squeeze of its own in its first months, that would be reported as a fault of the start, not tuned away |
| T6 | Two years with the key rate locked at 8.00 (a user's choice) | **Gate:** the key rate is 8.00 for all 24 months. **Reported, not gated** (the owner's decision, 6 October 2026): `inflation12`, unemployment and real output at month 24 with the rate held, shown in the opening report beside the same published figures |
| T7 | Twenty years, both configurations | Every variable finite for 240 months; unemployment in [0, 30]%; `inflation12` in [−10, 30]%; government debt below 300% of GDP; no sign violations. The long-run values are reported, not gated (expected: inflation near 2.4–2.5% with the rules acting, as on the growing reference). The 1,200-month path of PF assets ÷ GDP and PF net worth is reported in `reports/opening-iceland-today.md` |
| T8 | No-change integrity | With no events the run equals the reference bit for bit. Every effect the client reports is exactly 0: `baseline()`, pipes, balance sheets, `Frame.legBaselines`, `series()`, `reportSeries('deviation')`. `seek` and replay reproduce a straight run. A fork with no change has zero effect |
| T9 | Controls unchanged | `iceland` and `reference`: every golden, calibration check, expectation, harness report and lever report is unchanged, and the 240-month drift is below 1e-9. `iceland-growing`: its tests pass unchanged, and its opening is the same |
| T10 | Determinism, the committed solution and data refresh | The same opening and scenario give identical numbers. Check mode at load passes with residuals below 1e-9; a fresh solve agrees with the committed solution to 1e-9 relative. A golden of the no-change path, months 0–24, both lock configurations, 16 series: `keyRate`, `inflation12`, `cpi`, `expectedInflation`, `unemployment`, `wageGrowth`, `exchangeRate`, `output`, `nominalGDP`, debt ratio, deficit, `mortgageDebtAmount`, broad money, `pfAssets`, `housePrice`, `currentAccount`. Stored in `tests/golden/iceland-today/`, and regenerated deliberately when any data file changes, with the diff in review |
| T11 | Opening report guards | Warnings, listed and not failing: gaps beyond their guards (§3.3); κ outside [0.9, 1.1]; cross-checks off by more than 10% (expected today: reserves 1.26, bank bonds 0.89, bank assets 0.89, PF shares 1.52, home value 1.18, net external position 1.52, capital ratio 28.0 vs 23.3); the expenditure rows at face value (§1.7); the interest and income checks (§1.8: mortgage interest 1.27, government interest 0.74, pension payouts 2.11); credit flows against their records (§1.4); every placeholder and bridge in §1.6; every data period. Also, from the CPI-by-origin shares (24.8 ÷ 25.0 over January–September 2026, about −1.2% a year), imported goods' price relative to the CPI in month 1, warned if its sign differs |
| T12 | Interface (C) | A server render of `<App/>` opens `iceland-today` and shows "September 2026", key rate "8.00%" and "auto" (on the card and the lever), amounts with "ISK" and "bn", and the one line. The rendered text has no "Apply", no suggestion mark, no lock note and no "baseline". **Since today:** at month 0 no change is shown; at month 12 with no lever moved, a pipe title shows "since Sep 2026" and no "vs no change". **Effect:** after a lever move, a card and a pipe title show "vs no change", and the same frame with no events shows none. `sinceToday` and `effect` unit tests cover amount, index and rate, and ~0 denominators. A link with `o` round-trips silently; a link to `iceland-growing` opens it. The engine-client clock still ticks one month per 2 s at 1× |

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

1. **Types and baseline fields** (§6):
   - `CalendarMonth`, `MoneyUnit` and the `Opening*` types;
   - `ModelDef.calendar/moneyUnit/opening`, `Scenario.opening`, `Baseline.history/anchors`;
   - `reset()` passes the history to `Machine.initHistory`, and `Ctx.base` and `IndicatorCtx.base` read the anchors.

   Bit-for-bit test: every existing golden and the stationary drift (T9).
2. **`openingBaseline`:**
   - `buildPositions` with explicit `fills`, rejecting silent fills, negative residuals, unknown ids and bases outside data, residual, mirror and allocated;
   - anchor overrides (`'month0'` resolved after the first evaluation);
   - month-0 evaluation (terms, desired values, regimes, `byMask`) and the regime comparison with the anchor;
   - `lagReach` and the history check;
   - the `derive` fixed point;
   - parameter ranges;
   - `OpeningCheck` gating;
   - `OpeningReport`, with `recordsUsed`.
3. **The opening solve:**
   - unknowns and targets, evaluated over one month;
   - the structural-rank and condition checks, which throw naming the offenders;
   - Levenberg–Marquardt from `numerics.ts`, failing above 1e-9;
   - check mode with a committed solution.
4. **`withStartGaps`** with tied groups and relative or absolute scale. It wraps rules by target through replacement chains (as `effectiveRules` in `modules/growth.ts` does). It accepts BEHAVIOUR rules only and rejects stock targets. It adds one labelled term per target, tagged `start-gap`, and creates `startGap.<group>`, `startGapFade.<group>` and `startGapBase.<target>`. Also `halfLifeText`, and the concept `start-gap` in plain English.
5. **Engine metadata:** `opening`, `moneyUnit`, `calendar(month)`. `scenario()` writes `opening`, and load keeps it.
6. **The generalised `createRegisteredEngine`** (§5.2, check mode) and the harness layer `opening` (T1–T3, T7, the T11 report).
7. **`tests/fixtures/opening.ts`:** a two-sector test model with a dated opening, a 12-month history, a `derive` value, one anchor override, a tied relative gap group of two targets and one absolute gap, and a committed solution. Two more fixtures exercise the rank check: an inert unknown and an unreachable target. A tests against them (T1–T3, T8, T9), and C builds against them before B lands. **A publishes the fixture first**, before steps 2–6 are complete.

Order: 7 (types and fixture skeleton) → 1 → 2 → 3 → 4, 5 and 6. Hand-off to B after step 2 (positions, checks, derive) and again after step 4.

### 9.3 B: Iceland today, builds on A

1. **Data access.** `scripts/extract-today.ts` writes `data/iceland/today-2026-09-30.json`: the records the opening and the interface use, copied verbatim (id, value, unit, period, source, status), plus the block `solution`. A test checks that each record equals the snapshot record. `today/data.ts` reads by id, and throws on a missing id or a null value. The engine bundle then carries a small file instead of the 1.46 MB snapshot, and C can switch `current-data.ts` to it.
2. **The profile** `createIcelandTodayModel()`: today's parameters (§1.5) through `setNormal` where a growth anchor exists, the lever defaults (§4.1), `START_GAP_GROUPS` (§3.3), `calendar`, `moneyUnit` and `opening`.
3. **`ICELAND_OPENING.build`:**
   - positions and residuals (§1.3, in the stated order);
   - variables and histories, including the price block (§1.4);
   - the expenditure reconciliation (§1.7);
   - `derive` for every Closed value (§1.4, §1.5);
   - the anchor overrides (`cashServiceCoverage{j}`, `productiveCapacity`);
   - bridges flagged (§1.6);
   - checks (§1.2, §1.8);
   - the solve (§3.3, §3.4).
4. **The conditional gaps.** Run T4 with all six conditional families off. Switch on only the families whose own row fails, re-solve, and commit the solution. Decision 0018 records the outcome, with the T4 numbers before and after.
5. **The level fix** (§2) in `modules/indicators.ts` and `modules/financial-fragility.ts`, and the real unit's label "at 2025 prices" on this profile.
6. **Tests:**
   - `tests/models/iceland-today-opening.test.ts` (T1, T2, T4, T11, and the re-solve of T10);
   - `iceland-today-path.test.ts` (T6's first line, T7, and the golden of T10; T5 and the rest of T6 are reported in the opening report, not asserted);
   - the golden (T10).

   Run `bun run levers` on `iceland-today`, measured against the no-change path, and commit `reports/levers/iceland-today.md`. It is non-gating until reviewed. Any sign that differs from the stationary expectation is explained in `docs/audit/lever-vetting.md`, and no stationary expectation is weakened.
7. **The Treasury's foreign debt.** Run the alternative mapping (W holds 113.1, B absorbs 403.0, with `krona0` and `bondW` re-derived) against T4. Keep the mapping with the smaller króna response (the criterion is the króna, never a T5 comparison), and record the choice in decision 0018.
8. **Registration** in `applicationModels`, after A's `createRegisteredEngine`. Decision record 0018 also records:
   - the payout route (§1.5);
   - the bridges;
   - the conditional gaps switched on.

   Update `docs/current-economic-context.md`: the records now applied are listed by id, and the snapshot file itself is not edited.

### 9.4 C: the interface, in parallel with A and B

1. **`engine-client.ts`:** `calendar`, `moneyUnit` and `openingInfo` (with `recordsUsed`); `comparison` is 'no-change' for a model with growth or an opening.
2. **`src/ui/model/effects.ts`:** `sinceToday`, `effect`, `money` and `calendarLabel`. In `format.ts`, the calendar clock. In `info.ts`, `moneyUnit`, `calendar` and the lever start values.
3. **Views (§7):**
   - the header and timeline, and the one line;
   - cards ("auto"), pipes, inspector rows (since today and effect), the ledger;
   - lever marks and "back to the start value";
   - charts (axis and units);
   - the dialog's model rows and its "used for the start" marks from `recordsUsed`.
4. **`registry.ts`:** `PREFERRED_MODELS` and `LINK_ONLY_MODELS`. In `scenario-url.ts`, the `o` key, read and written silently.
5. **Tests:**
   - T12;
   - update `tests/ui/application-model.test.tsx` to `iceland-today`;
   - unit tests for `sinceToday`, `effect`, `money` and `calendarLabel`;
   - a smoke render with `tests/fixtures/opening.ts` before B lands, then with `iceland-today`.

   Update `docs/interface.md`.

C needs from A the types and the fixture (A step 7, early). C needs from B only the registered profile, at the end.

---

## 10. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Month 0 is a composite of periods** (end-2025 debt, July pension data, August banks, national accounts to 2026Q2 moved forward by F, a 2024 net-worth ratio). The GDP at an annual rate, 5,348.4, will be compared with Hagstofa's 5,138.9 | Every position carries its period in the report, and nothing is rolled forward by guessed flows. F is one declared factor from the CPI. The dialog shows the four-quarter GDP (5,138.9, reproduced exactly by the history) beside the annual rate. The debt chart's 53.7% and the published 56.7% are shown side by side |
| R2 | **Model and data concepts differ.** The Treasury's foreign debt (403.0) is held by W as króna bonds, which raises W's bonds from 113.1 to 516.1 and enlarges `bondW` and `krona0`. Other financial corporations' deposits sit with FR. 47.5 bn of indexed bonds held by others is lost. The 2025 expenditure mapping shows model consumption at 2,739.7 against Hagstofa's 2,518.4 | T4 bounds the portfolio flows. B runs the alternative mapping (§9.3 step 7) and records the choice. The cross-checks are in T11, and §1.7 shows each component beside its record |
| R3 | **Pension payouts are twice the data** (ISK 763.0 bn against 361.5 bn), because the anchor's payout ratio is kept | Chosen deliberately (route b, decision 0018), so that `iceland-today` and `iceland-growing` share their behaviour. T5 reports PF assets and foreign purchases over two years; the long-run PF path is reported. The fix is a separate calibration change with regenerated, reviewed goldens |
| R4 | **Gaps hide misspecification.** The margin gap (about 5–9%) and the króna gap (about −0.13 log points) are large | They are only on behaviour rules, visible as terms, fading, size-guarded (T11), and they largely cancel in effects, since both runs share them. Conditional gaps go on only when T4 fails. A 2027 wage step could later be a scheduled no-change event; it is not in this plan |
| R5 | **The rule's path differs from the market's and the Central Bank's.** The purchasing-power term moves the króna's target with domestic prices at once. With domestic inflation near 6% and world inflation at 2.5%, that alone weakens the target by about 3.5% a year, on top of the fading króna gap (about 2.5% a year at first). The margin gap pulls the other way. Either can push inflation, and with it the cuts, away from the Central Bank's path | Accepted, by the owner's decision of 6 October 2026: the path with no lever moved is the model's own rules' outcome, not a forecast, and it does not have to stay near anyone's. T5 and T6 show it beside the published figures as a comparison (reported, not gated), and decision 0018 says in plain English why the two differ. Nothing in the model is chosen or tuned to bring them together; the one line of the interface says it is not a forecast (R10) |
| R6 | **Unemployment choice.** The owner may compare with the headline 6.8% | The trend 5.8% is Hagstofa's smoothed series and matches the CBI's 2026 average (5.9%). The dialog shows all three records beside the model's 5.8% |
| R7 | **Missing records:** the wage index and CPI component 2025 averages, the imported-goods CPI index, the FX prices of world goods, fish and aluminium, the foreign-rate basket weights, the real GDP level, outstanding-weighted rates, bank reserves, FDI equity and the output gap | Declared bridges with `assumed` provenance (§1.6), listed in the report. Each is a follow-up for the data generation script, which is not in the repository |
| R8 | **Bundle size:** the engine would import the 1.46 MB snapshot | The extract file (B step 1). The interface can drop the full import too |
| R9 | **Levers from a moving start:** effects against a moving path may peak at different months than on the stationary controls | The stationary expectations stay the gate (T9). The `iceland-today` lever report is non-gating until reviewed and explained |
| R10 | **Readers take the no-change path for a forecast:** it moves a lot (inflation falling, the key rate cut) | The one line says it is not a forecast, and so does the profile's description. No forecast list is shown in the strip |
| R11 | **The committed solution goes stale** when code or data change | Check mode throws on any residual above 1e-9, and the re-solve test compares, so CI fails before a deploy (T10) |
| R12 | **Load time and platform floating point** | No solve at load: one `derive` pass, months 0 and 1 and a residual check, on top of the anchor solve and two engines. The budget is 200 ms on the test machine, measured in A's tests. The committed solution makes the numbers the same on every platform to the check tolerance |

---

## 11. Revision 2: what changed after review

| Review point | Change |
|---|---|
| Blocker: the import-price block did not hold together; a zero Jacobian column | World, fish and aluminium prices and the foreign rate are set from records or bridges (§1.5 P, §1.6). `importPrice` starts at the border price, and domestic prices come from the CPI identity (§1.4). `importCostSeen` is at rest, and the `importCostSeen → importPrice` target is gone. The króna's remaining misfit is a declared start gap on its rule, not in `kronaSentiment` (§3.3). One deviation: `labourCostSeen` is set in closed form to keep pace with wages, not solved. Solving it would put firms' view of labour cost about 11% above actual wages, and its 2.5-a-year adjustment would then pull prices down faster than any gap. The misfit is a margin, so it goes where margins live: a start gap on the pricing rule |
| Blocker: targets that do not depend on their unknowns | The wage target is month-1 `wageGrowth`, and the 12-month rate is a T2 check. Every target pairs with an unknown that moves it (§3.4). `openingBaseline` checks structural rank and conditioning, and throws naming the offenders; A tests it on fixtures |
| `lenderConfidence` against a 2025 normal | `OpeningState.anchors` overrides the anchor; `cashServiceCoverage{j}` uses its month-0 value. Every `c.base`/`baseStock` read is audited in §1.5. T4 and T5 cover confidence, the approval ratio and rationing regimes |
| Growth anchors not updated; fish exports capped at month 0 | `setNormal` sets `growthAnchor.<id>` with every re-set parameter, and T2 checks it. Export normals are recomputed with today's world and fish prices. T2 asserts that no regime is active at month 0 beyond the anchor's |
| Nominal GDP gated without an expenditure reconciliation | §1.7: every component from its record through the 2025 mapping, with imports as the one residual and κ on the import propensities. Imports and exports are gated at ±2%; the current account is a warning. Flows are moved to September 2026 prices by F (§1.1), so prices and volumes agree at month 0 |
| The payout re-calibration inside the opening | Route (b): the anchor's payout is kept, `c0O` is not re-solved, and the misfit is reported. T5 reports PF assets and foreign purchases; the 1,200-month PF path is reported (§1.5, R3) |
| The literal request for the change on today's amounts | `sinceToday` is added to the contract and shown beside every amount; the effect vs no change appears only after a lever moves (§6, §7, T12) |
| Tied unknowns not expressible | `withStartGaps` takes groups with relative or absolute scale. The A fixture has a tied group |
| Over-engineered momentum gaps; a hard-coded half-life | Four always-on groups remain: wage, labour supply, margin and króna. The other families are conditional on T4 and aim at the trend, not at noisy year-on-year rates. The label's half-life comes from `halfLifeText(fade)` |
| §2's stated reason | Corrected: the fixed unit is kept so that amounts never depend on an anchor. The growth indices open at 100 through an anchor override |
| Rates applied to whole stocks | §1.8 adds warning checks against tax-return mortgage interest, government interest and capital income; `mD` stays, flagged |
| Allocated share positions | `basis: 'allocated'`, with T1 accepting data, residual, mirror and allocated only |
| Records used for the start | `OpeningReport.recordsUsed`, which the dialog reads |
| The `o` key's load line; "rule" against "auto" | `o` is written and read silently, with no load line. "auto" is used on both the card and the lever. `LINK_ONLY_MODELS` stays, because today's links name `iceland-growing` |
| A live 17-unknown solve on every page load | The solution is committed to the extract file and checked at load; tests re-solve and compare (§3.4, T10, R11, R12) |
