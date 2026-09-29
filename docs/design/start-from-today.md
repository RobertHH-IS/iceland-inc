# Starting Iceland Inc. from today

Status: proposal (design only; nothing here is implemented). Written against the code at commit `71812b5` and the data briefs for `data/iceland/current-hagstofa.json` and `data/iceland/current-financial.json`, which were still being fetched when this was written. Data as of 28 September 2026.

Iceland Inc. starts today from a stylised steady state: zero growth, zero inflation, the key rate at its 3% neutral level and every sector's net lending at zero. This proposal lets it start from Iceland as it is now, while keeping exact stock-flow accounting and the rule that effects compare a shocked run with an unshocked run in the same variant. Today means inflation of 5.6% (August 2026), a key rate of 8.00%, unemployment of about 6.8% and output 1.1% lower than a year earlier (2026Q2).

## Summary

1. **Semantics.** A *start* is a dated set of stocks, prices, rates, expectations, lever settings and the lag history before month 0. From a start the rules run unchanged. In charts and inspectors the *baseline* becomes the **no-change path**: the same start and variant with no lever moved. An *effect* is the run with levers minus the no-change path, month by month. The steady state stays as the start `steady` and as a fixed reference. Re-solving the steady state to today's levels is rejected, because today is not a steady state (§1).
2. **State.** Every instrument position is set from data through an explicit sector mapping. One declared residual position per instrument balances it. Every lagged variable gets a value, and a history where a rule looks back 12 months: 51 lagged variables, 33 gradually adjusting rules and 3 rules with 12-month lags (§2).
3. **No month-1 jumps.** Three tools, used in this order:
   - a consistent month 0, where every identity holds at the start;
   - latent adjustment states, solved so that month-1 changes match recent momentum;
   - declared, fading *start gaps*: an extra term on a behaviour rule, visible in the inspector, that closes the difference between the rule and today's data and fades at a stated speed.

   Policy, contract and identity rules never get a gap. Their parameters are set to today's values instead (§3).
4. **Kernel.** The changes are:
   - `ModelDef.starts: StartDef[]`;
   - `EngineOptions.start`;
   - `engine.startId`;
   - a start solver that reuses the steady-state Newton machinery;
   - a no-change *reference path* owned by the kernel, so charts, pipes, the ledger, influences, ideas at play and forks all compare with it;
   - `Scenario.start`;
   - `startReport()`.

   On the `steady` start everything stays bit-for-bit as it is (§4).
5. **Units.** The unit stays 1% of 2025 nominal GDP, so 1 model unit = ISK 49.412 bn. Price indices are set to 1 for the 2025 average, and real quantities are at 2025 prices. Today's nominal GDP is therefore about 104, not 100. Charts show levels in ISK or percent for both paths, with the effect on a separate, zero-aligned scale (§5).
6. **Tests.** The start must balance, reproduce its data at month 0 and stay within jump tolerances at month 1. The no-change path must be plausible over 24 months and finite over 20 years in both stabiliser modes. The calibration checks keep gating from `steady` and are also reported from `today` (§6).
7. **Findings that shape the plan** (appendix A):
   - `i0` is used both as a real and as a nominal neutral rate.
   - The inflation target is 0%.
   - The model is not neutral to trend inflation: with a 2.5% target the Automatic no-change path settles near 0.6% inflation, not 2.5%.
   - Floating-rate government debt makes the Manual 8% path snowball, with debt near 116% of GDP after 20 years.
   - The steady-state pension payouts are 13.9% of GDP, against 6.3% in the data.
   - A flat lag history makes `inflation12` start at 0.

---

## 1. What "start from today" means

### 1.1 The recommendation: (a) today's state, then the model's own rules

A **start** fixes, for month 0 (September 2026):

- every instrument position of every player;
- every price, wage and exchange-rate level, with enough history for the rules that look back;
- every expectation and smoothed variable, and the adjustment state of every partial-adjustment rule;
- every lever setting, which is today's policy: key rate 8.00%, today's effective tax rates and spending levels;
- the start's parameter values: today's target, spreads and policy parameters, each with provenance;
- the start gaps and how fast they fade.

From month 1 onwards the model's rules run as written. The start is not a steady state, so the economy moves even when nobody touches a lever. That movement is the **no-change path**. It is the model's statement of where Iceland goes if no policy setting changes. It is not a forecast, and the interface must say so, as it already says the model is "a teaching model that shows mechanisms".

Three definitions, used everywhere:

| Term | Definition |
|---|---|
| Start | `StartDef` (§4): state at month 0 plus parameter overrides and gaps. The steady state is the start `steady`. |
| No-change path (reference path) | The run from the same start, in the same variant (same parameters, same disabled terms), with no user events. Only the start's own `scheduled` events apply (§2.6). |
| Effect | Shocked run minus the no-change path at the same month (AGENTS.md rule 9). It is never a steady-state deviation when the start is `today`. |

Why this is the right target:

- **It keeps accounting exact.** Stocks enter once at month 0 as data, reconciled so that every instrument balances, and afterwards change only through postings (AGENTS.md rule 1).
- **It keeps the rules honest.** The rules keep the parameters the calibration checks were tuned on. Today's disequilibrium, such as high inflation, a large real rate and rising unemployment, is what the rules then resolve. That is exactly what a user wants to explore: "what happens if the central bank cuts now rather than in six months".
- **Effects stay clean.** Shocked and unshocked runs share every start assumption, so the start's imperfections, including the gaps, largely cancel in the effect.

### 1.2 Why not (b): re-solve the steady state at today's levels

(b) means solving the model's free parameters so that today's stocks and flows are a fixed point. Today is not a fixed point:

- Inflation is 5.6%, not zero. At a steady state with zero real growth, 5.6% inflation needs every nominal stock to grow at 5.6% a year. That contradicts the zero-net-lending targets in `steadyState.targets`, the 8% key rate, which is far above any neutral rate, and the 1.1% fall in output.
- Even a balanced-inflation steady state (roadmap v2) would put today's 8% key rate, 5.6% inflation and rising unemployment on a path that repeats forever. The Taylor rule, the wage curve and the pull of the price markup make that impossible.
- Solving 14 free parameters to force it would bury today's cyclical position inside "structural" parameters. The key rate would look neutral and unemployment normal. The model could then no longer say why inflation should fall.

What (b) gets right survives in (a): today's *portfolio preferences* are observed and are re-set as start parameters (§2.6, class N-a). That is not a steady-state solve; it just says that today's holdings are what their owners want.

### 1.3 What the steady state becomes

- It remains the start `steady`, the default for teaching and for the calibration checks.
- It remains the solved source of every *structural* parameter (`c0Y`, `rhoFR0`, `muD`, `mRY` and so on), which the `today` start inherits unless it overrides them explicitly.
- It is the value `Ctx.base()` returns in both starts. It must not become the reference path, or a rule's reference would depend on itself.
- It is an optional faint "2025 steady state" line on level charts.

---

## 2. What must be initialised

### 2.1 Units, calendar and normalisation

| Item | Choice | Why |
|---|---|---|
| Money unit | 1 unit = 1% of **2025** nominal GDP = ISK 4,941.211 bn / 100 = **ISK 49.41211 bn** (`GDP_BN` in `util.ts`) | Every parameter and `calibration.json` value is already in this unit. The steady state stays at exactly 100, and the conversion to ISK is one constant. Today's start therefore has `nominalGDP` ≈ 104 (2026Q2 annualised, from the data brief), not 100. |
| Price indices | 1 = the 2025 annual average for `cpi`, `wage`, `domesticPrice`, `importPrice`, `housingCost`, `housePrice`, `exchangeRate` and the world prices | Real quantities are then at 2025 prices, which matches the unit. Today's CPI is about 1.05–1.06. Level anchors such as `realHousePrice − 1` or `log(wage/domesticPrice)` are measured against the 2025 calibration. |
| Month 0 | September 2026, the opening state. The first simulated month (t = 1) is October 2026 | Stocks as of end-August 2026 (or 2026Q2 where only quarterly data exist), CPI of August 2026 (September's if published), the key rate as of 28 September 2026. Every position records its data period in the start report. |
| Seasonality | Use seasonally adjusted flows (GDP components, LFS unemployment) and a **smoothed** CPI history (see `cpi` in §2.5) | The model has no seasons. A raw monthly CPI has January and July sales dips, which would feed straight into `inflation`, indexation accruals and the month-1 jump tests. |

The brief's phrase "GDP = 100 at the start" is met for the `steady` start only. Re-basing the unit so that GDP is 100 in September 2026 would multiply every `calibration.json` value by 4,941/≈5,150. It would also make the steady state and today's start use different units, and it would change with every data vintage. A fixed unit and a single ISK constant are simpler.

### 2.2 Sector mapping (statistical sectors → players)

| Statistical sector (ESA 2010) | Model player(s) | Split | Notes |
|---|---|---|---|
| S.14 households + S.15 NPISH | `HY`, `HW`, `HO` | By age with the THJ09000 shares already used: `depSh*`, `mortShY`, the ownership shares `hsh*`, and wage shares | The older group's 9% of mortgage debt is folded into `HW`, as in `steady.ts` (`mortShY`). |
| S.11 non-financial corporations | `FC`, `FR`, `XF`, `XA`, `XT`, `XO` | By ÍSAT 2008 industry: F → `FC`; fishing, aquaculture and fish processing → `XF`; basic metals (24.42) → `XA`; tourism characteristic industries (TSA shares) → `XT`; the rest of exporters → `XO`; everything else → `FR` | As decision 0003. Where data exist only for all NFCs (deposits), the split uses the 2025 shares (`depShareFC`, `depFX` by export revenue). |
| S.122 deposit-taking corporations, plus ÍL-sjóður's housing loans, plus other lenders (S.123–S.127) for lending | `B` | One consolidated bank | Mortgages not held by pension funds are the banks' (`MNB`, `MIB` in `steady.ts`). |
| S.123–S.127 other financial intermediaries (deposits), S.128 insurers | `FR` (their deposits, part of M3); not modelled otherwise | | Recorded as a mapping loss in the start report. |
| S.121 central bank | `CB` | | |
| S.13 general government (state, municipalities, social security) | `G` | | |
| S.129 pension funds | `PF` | | |
| S.2 rest of the world | `W` | | Only the positions the model has (króna deposits, government bonds, equity, FX reserves, pension funds' foreign assets). The model's net position of `W` is not the net international investment position (NIIP); it is compared with it and reported. |

### 2.3 Instrument positions: data field → model units

Every value is converted as `model = ISK bn ÷ 49.41211`. "Derived" means the one position per instrument that the kernel fills so the instrument balances (declared explicitly, §4.3). "Residual" means a position computed from a balance-sheet identity of its player. Every residual is listed in the start report next to its data counterpart, where one exists. The key paths are **proposed** names; `today.ts` maps them to whatever the fetch agents write, and fails loudly on a missing key.

| Instrument | Position | Data concept (source) | Proposed key | Reconciliation |
|---|---|---|---|---|
| `deposits` | `HY`, `HW`, `HO` | Household deposits at deposit-taking corporations (CBI monthly sector deposits, Aug 2026). Age split by `depShY/W/O` (THJ09000, 2025) | `financial.deposits.households_isk_bn` | Data. |
| | `PF` | Pension funds' deposits (CBI pension-fund statistics) | `financial.pension_funds.deposits_isk_bn` | Data; sets `dPF0` (§2.6). |
| | `W` | Non-residents' króna deposits (CBI) | `financial.nonresident.krona_deposits_isk_bn` | Data. |
| | `XF`, `XA`, `XT`, `XO` | No direct data: `depFX` (placeholder, 5%) × today's export shares | — | Placeholder, flagged. |
| | `FC`, `FR` | Residual: M3 (CBI, Aug 2026) − households − PF − W − exporters; split by `depShareFC` | `financial.money.m3_isk_bn` | **Residual**, must be > 0. Checked against CBI NFC deposits + other financial intermediaries' deposits. |
| | `B` | Derived (the single issuer) | — | Derived. |
| `reserves` | `B` | Banks' current accounts, term deposits and certificates of deposit at the CBI (CBI balance sheet) | `financial.cbi.bank_reserves_isk_bn` | Data (in `steady.ts` this was a residual; today the CBI's net worth is simply what the data imply). `CB` is derived. |
| `treasuryAccount` | `G` | Treasury deposit at the CBI | `financial.cbi.treasury_deposit_isk_bn` | Data; also sets `tga` (§2.6). `CB` is derived. |
| `mortgagesN`, `mortgagesI` | `B`, `PF` by kind | Household housing loans by lender and indexation (CBI lending statistics / lifeyrismal.is sheet 4.2, as `steady.ts` uses). Pension funds by kind from their statistics; banks = total − PF (absorbs ÍL-sjóður and others) | `financial.household_debt.housing_loans_{indexed,nonindexed}_isk_bn`, `financial.pension_funds.mortgages_{indexed,nonindexed}_isk_bn` | Data; `B` is residual within the kind. |
| | `HY`, `HW` by kind | Lender totals by kind × `mortShY` / (1 − `mortShY`) | — | Balanced by construction: HY + HW = B + PF for each kind. The kernel still checks it. |
| `businessLoans` | six firms | Deposit-taking corporations' loans to NFCs (CBI), split by the CBI FS sector shares (`loanShareFC` data; others placeholder) | `financial.credit.bank_loans_nfc_isk_bn` | Data. Replaces `loanTotal` = 0.55 × corporate debt, a placeholder. `B` derived. |
| `govBonds` | `PF` | Pension funds' nominal government bonds | `financial.pension_funds.govt_bonds_nominal_isk_bn` | Data. |
| | `W` | Non-residents' share of Treasury bonds (Lánamál ríkisins) × nominal debt | `financial.govdebt.nonresident_share` | Data. |
| | `CB` | CBI holdings of Treasury bonds | `financial.cbi.govt_bonds_isk_bn` | Data (placeholder 1% today). |
| | `HO` | Households' direct bond holdings (THJ09000 "skuldabréf", or 0) | `hagstofa.household_bonds_isk_bn` | Data or placeholder (4% of GDP today looks high; flag it). |
| | `B` | Residual: nominal government debt − the above | — | **Residual** (banks plus every unmodelled holder: funds, insurers). Must be ≥ 0. |
| | `G` | Derived: general government nominal debt = gross debt × (1 − indexed share) (Hagstofa quarterly public finances; indexed share from Lánamál) | `hagstofa.govt.gross_debt_isk_bn`, `financial.govdebt.indexed_share` | Derived; checked against the data total. Replaces the `govIdxShare` placeholder (0.35). |
| `indexedBonds` | `PF` | All indexed government debt (the model has only this holder) | — | Data total; the model allows no other holder. Record the part held by others as a mapping loss. `G` derived. |
| `bankBonds` | `PF` | Residual of the bank balance sheet: B's assets − deposits − **bank equity (data: D-SIB equity, CBI FS)** | `financial.banks.equity_isk_bn` | **Residual** (all bank market funding, whoever holds it). Reported next to PF's actual bank and covered-bond holdings. `B` derived. |
| `shares` (book value) | `PF` | Residual of the PF balance sheet: PF total assets (data) − the PF positions above − foreign assets | `financial.pension_funds.total_assets_isk_bn` | **Residual** (domestic equity and domestic funds). Checked against PF domestic equity data. |
| | `HY`, `HW`, `HO` | Households' shares (THJ09000, 2025, age split as `eq*`) | `hagstofa.household_shares_isk_bn` | Data (at nominal value; flag it). |
| | `W` | Inward FDI equity (CBI international investment position, 2026Q2) | `financial.iip.fdi_equity_inward_isk_bn` | Data. |
| | six firms | Total held, allocated as `steady.ts` does: `pfEqFDshare` to domestic firms, the rest to exporters, within each group by net assets (deposits + capital − loans) | — | Balanced by construction. No rule reads `shares`; they only show on balance sheets and in net worth. |
| `fxReserves` | `CB` | CBI FX reserves (Aug 2026) | `financial.cbi.fx_reserves_isk_bn` | Data; `W` derived. Replaces the `fxr` placeholder (18%). |
| `foreignAssets` | `PF` | Pension funds' foreign assets | `financial.pension_funds.foreign_assets_isk_bn` | Data; sets `pfForeignTarget` (§2.6). `W` derived. |
| `pensionRights` | `PF` total | PF total assets − the funds' surplus (actuarial position; placeholder `pfNWshare` 5%) | `financial.pension_funds.actuarial_surplus_share` | Data or placeholder. `PF` is the single issuer, so it is derived from the holders. |
| | `HW`, `HO` | Split by `eShareW` (placeholder 0.55); better, accrued rights versus rights in payment | — | Placeholder, flagged. |
| `homes` (real) | `HY`, `HW`, `HO` | Residential property value: HMS property valuation 2026 × the house price index since the valuation date; split by `hsh*` | `hagstofa.housing_stock_value_isk_bn` | Data. Replaces `house0` = 200% (placeholder). |
| `capital` (real) | six firms | Net fixed capital stock by industry (national accounts), or the steady-state value × today's domestic price level | — | Read only by `depreciation{j}` (a write-off) and net worth. Low priority. |

Reconciliation order (the order matters, because residuals feed later residuals):

1. Convert every data value to model units and record its period.
2. Set the data positions.
3. Mortgage and business-loan lender residuals (`B`).
4. Government bonds: `B` is the residual holder.
5. Deposits: `FC` and `FR` are the M3 residual.
6. Bank bonds are the residual of B's balance sheet, given B's equity from data.
7. PF domestic shares are the residual of PF's balance sheet.
8. Allocate share issuers.
9. Let the kernel fill the derived positions (`B` for deposits and loans, `CB` for reserves and the treasury account, `G` for bonds, `W` for foreign claims, `PF` for pension rights), then run the balance check (§6, T1).
10. Cross-check each group's total financial assets and liabilities against the financial accounts (Hagstofa fjármálareikningar / CBI sector balance sheets) and report the ratio. Tolerance ±10%, as a warning: the instruments are simplified.

Residual policy: a residual may not be negative. If it is, the start fails with the numbers, instead of silently producing a firm with negative deposits. Placeholders keep their `placeholder` provenance and appear in the start report.

### 2.4 How the checks see the start

- The instrument balance is checked exactly (1e-9) at month 0, before any step.
- Net worth by player: bank equity = the data value, by construction. The CBI's net worth is compared with its reported equity. Households' net worth is compared with THJ09000 (2025, grown). `W` is compared with the NIIP. These are warnings with the gap shown.
- Month-1 accounting runs through the four existing checks unchanged.

### 2.5 Lagged and state variables

The compiled Iceland model has **51 lagged variables**: every variable a rule reads with `lag()`, and every gradually adjusted target. **33 rules** use `adjust`. Three rules look back 12 months: `inflation12` (on `cpi`), `creditImpulse` (on `netMortgageLending`) and `creditImpulseTotal` (on `netCreditTotal`). Every other lag is 1 month (`lastMonth` or `c.lag(id)`). The start must therefore give every lagged variable a value at month 0. It must also give 12 months of history for `cpi`, `netMortgageLending` and `netCreditTotal`. The ring buffer holds 25 slots; older slots take the oldest value given.

Kinds of treatment in the table:

- **Obs**: observed; set from data.
- **Id**: an identity; computed by evaluating the schedule at month 0 and checked against data where data exist.
- **Lat**: latent; solved in the start solve (§3.3) so that month-1 momentum matches data.
- **Tgt**: a smoothing state set equal to its own input at month 0.
- **Gap**: gets a fading start gap on its rule (§3.2).

| Variable (rule) | Kind | Source or condition | History |
|---|---|---|---|
| `cpi` | Obs | CPI (Hagstofa VIS01000), 2025 average = 1. Month 0 is the latest month. Months −1…−12 are a smooth path with the observed 12-month rate (5.6%) and the 3-month annualised rate, not raw seasonal months. The components below are then rescaled so that the CPI identity holds exactly | 12 months |
| `inflation12`, `inflation` | Id | Must reproduce 5.6% (±0.05 pp) at month 0 | — |
| `domesticPrice`, `importPrice`, `housingCost` | Obs | CPI sub-indices: domestic goods and services, imported goods, housing, divided by the VAT factor where it applies. Weights `omD`, `omM`, `omH`. They are then scaled jointly so that `cpi` = the identity at month 0 | 1 month |
| `unitCost` | Lat | Solved so that `domesticPrice` rises at the domestic component's 3-month annualised rate in month 1 | — |
| `wage` | Obs | Wage index (launavísitala), 2025 average = 1 | 1 month |
| `wageGrowth` | Gap | Rule vs data: the 3-month annualised wage-index growth. The gap stands for contracted raises the Phillips curve does not explain (fade 1/yr). A known next contract step can instead be a `scheduled` `wageSettlement` (§2.6) | — |
| `settlementJump` | 0 | | — |
| `adaptiveInflation` | Lat | `(Eπ_data − chi·piT)/(1 − chi)`, so that `expectedInflation` = measured expectations: the average of the CBI's firm and market-participant 1-year-ahead surveys, with the choice recorded | — |
| `expectedInflation` | Rule | Static rule; = measured (±0.05 pp) once `adaptiveInflation` is solved | — |
| `housePrice`, `logRealHousePrice`, `realHousePrice` | Obs | HMS house price index, 2025 = 1; real = housePrice ÷ cpi(−1) (the rule's own definition) | 1 month |
| `logRealHousePrice` (rule) | Gap | Month-1 change = recent real house-price momentum (3-month) | — |
| `exchangeRate`, `logExchangeRate` | Obs | CBI trade-weighted exchange-rate index, 2025 = 1 (up = weaker) | 1 month |
| `kronaSentiment` | Lat | Solved so that the króna's target equals today's rate plus its recent drift. This state *is* the model's "unexplained króna", fading at `lamSent`. With `lamFX` = 12/yr anything else would move the króna by 60% of any gap within one month | — |
| `sentimentShock` | 0 | | — |
| `realExchangeRate` | Obs | CBI real exchange rate (relative CPI), 2025 = 1, inverted to the model's direction | — |
| `worldPrice`, `fishPrice`, `aluminiumPrice` | Obs | Rule levels, via new parameters `worldPrice0`, `fishPrice0`, `aluminiumPrice0` (default 1): import prices in foreign currency, the marine price index in foreign currency, and LME aluminium, relative to 2025 | — |
| `foreignRate` | Obs | Trade-weighted policy rates, via a new parameter `iFnow` (default `iF0`). `iF0` stays the *normal* foreign rate in the carry terms | — |
| `ruleRate` | Obs | = the current key rate (8%). The rule's smoothing starts from where the CBI actually is, so the Automatic key rate does not jump and the Manual suggestion moves off 8% gradually | — |
| `keyRate`, `keyRateSuggestion` | Id | Manual: = the `keyRateFixed` lever (8.00). Automatic: `ruleRate` + `keyRateAddon` (0) | — |
| `realMortgageRate`, `stressTestPayment`, all rates | Id | From the key rate and the start's spreads (§2.6); checked against CBI average rates (±0.1 pp) | — |
| `consumptionY/W/O` | Obs + Gap | National accounts household consumption (seasonally adjusted, 2026Q2, annualised), split by the 2025 age shares; gap so that the month-1 change matches recent real growth | — |
| `investmentFC…XO` | Obs + Gap | Business GFCF (SA, annualised, 2025 prices) by 2025 industry shares; gap for momentum | — |
| `employmentFC…XO` | Obs + Gap | Register employment by industry (VIN10022), scaled as wage bills at 2025 wages: `N{j}0 × employed_j,today / employed_j,2025`; gap for momentum | — |
| `unemployment` (+ `unemployed{g}`) | Id + Gap | 6.8% (3-month average, SA LFS). The `unemployed{g}` rules get a gap (a labour-supply residual: immigration and participation outrunning jobs) sized so that each group's rate at month 0 matches LFS by age. It fades slowly (0.5/yr), so the 24-month path is the model's | — |
| `output`, `nominalGDP` | Id | Evaluated at month 0; must match real GDP (2025 prices) and nominal GDP (SA, annualised latest quarter) within ±1%. `potentialOutput` is set from the CBI output-gap estimate (§2.6) | — |
| `grossIncomeY/W`, `realDisposableIncome` | Id | Month-0 evaluation; lag 1 = the month-0 value | — |
| `netMortgageLending` | Obs | Net new household mortgage lending (CBI monthly), annualised, in model units | 12 months |
| `netCreditTotal` | Obs | Net new credit to households + NFCs (CBI) | 12 months |
| `profits{j}Smoothed` (6), `bankProfitSmoothed`, `pfIncomeSmoothed` | Tgt | = their input at month 0, such as `(1 − tauF)·profits{j}/cpi`. No data for "smoothed" concepts exist, and a gap here would move dividends, investment and credited returns for no reason | — |
| `taxRuleAdjustment` | 0 | The debt rule starts from nothing applied; on Automatic it phases in at `lamTau` | — |
| `bankEquity`, `riskWeightedAssets`, `capitalRatio` | Id | From positions; `capitalRatio` checked against the CBI's published ratio (±2 pp) | — |

### 2.6 Parameters and lever settings for today's policy

Parameter overrides in a start are like a variant applied after the steady state is solved (as `forkParams` is today). Every override carries provenance and a period. There are four classes.

**P — policy settings (POLICY parameters and levers): today's values, from data, never gaps.**

| Setting | Today | How |
|---|---|---|
| `keyRateFixed` (lever) | **8.00** | Start lever value. The lever bar's "unchanged" marker moves to 8.00. |
| `stabilisers` (lever) | Manual (0), per decision 0004 | Start lever value; both modes are tested. |
| `keyRateAddon` (lever) | 0 | |
| `piT` | **0.025** | The CBI target. Needs the neutral-rate split below. |
| `tau0`, `vat0`, `tauF`, `rr`, `css` | Effective rates solved in the start solve so that month-0 income tax, VAT, corporate tax, benefits and payroll tax equal revenue and spending over the latest four quarters (Hagstofa quarterly public finances) | The start's own settings, not lever moves; all levers stay at 0. `tau0` also absorbs non-tax revenue, as now. |
| `gHealth`, `gEdu`, `gOther`, `gInv`, `trOA`, `trFam` | Today's real levels (the 2026 budget or the latest four quarters, at 2025 prices) | Data. |
| `tga` | Today's treasury deposit | Data; otherwise `treasuryTopUp` = 12/yr would issue bonds to reach 5% within a month. |
| `debtR0` | 56.7% (kept) | The debt rule's anchor is a policy choice; kept so that Automatic behaves as calibrated. |
| `dstiY`, `dstiW`, floors and terms | Rules 1300/2025 (already data) | Unchanged. |
| `ltvLimit` (`ltvCap` lever), `ltvYExtra` | The current CBI loan-to-value rules (to be confirmed by the data brief; `ltvCap` is off in `steady`) | Start parameter, so the replace-bound lever starts at today's cap. |
| `kapT` | max(requirement + buffer, today's capital ratio) | Otherwise `bankDividends` (at `lamEq` = 1/yr) pays out any excess capital at once: a month-1 jump. |

**C — contract terms on today's stocks: from data, permanent.**

| Parameter | Today | Note |
|---|---|---|
| `sB` | spread of new nominal issues over the key rate | Since review MON-1 `sB` is the spread on new bonds only, and `bondRate` is the average coupon on the stock, which reprices over `bondMaturity`. On `today` the coupon's history can start at the data's effective rate on nominal debt, so month-0 interest equals the data without a negative `sB` (appendix A4). |
| `sMN`, `sL`, `mD`, `sBB` | Average rates on outstanding non-indexed mortgages, NFC loans, deposits and covered bonds, minus 8% | CBI interest-rate statistics. |
| `rMI0` | Average real rate on outstanding indexed mortgages − `psiIdx`·(8% − (i0 + piT)) | |
| `rBI0` | Average real coupon on indexed Treasury bonds | |
| `Tm` | Average remaining term from lender data | |
| `theta` | Indexed share of **new** lending, if published; otherwise the stock share (65%) | |
| `payout` | Payouts (data, 6.26% of 2025 GDP a year, at today's level) ÷ `pensionRights`(HO) | Fixes the steady state's 13.9% (appendix A5). |
| `cEr`, `cEe` | Statutory rates / re-solved from contributions | |

**N-a — holding preferences: re-set to today's observed ratios, permanent.** These targets are closed quickly, by `firmCashSpeed` = 12/yr, `lamReb` = 0.5, `lamBW` = 2 and `lamFA` = 0.5. If they kept their 2025 values, month 1 would see large, entirely artificial portfolio flows. A gap of 1% of GDP between a sector's deposits and `dep{j}0 × nominalGDP` becomes borrowing of 12% of GDP (annualised) in month 1. Today's holdings are the revealed preference.

| Parameter | Today |
|---|---|
| `dep{j}0` | deposits_j,0 / `nominalGDP`,0 |
| `bW0` | W's government bonds / `nominalGDP`,0 |
| `boSh0` | HO's bonds / (deposits + bonds) |
| `bbSh0`, `dPF0`, `nwPF0`, `pfForeignTarget` | PF's shares of assets today |
| `krona0` | Non-residents' real króna holdings today (portfolio-balance anchor) |

**N-b — normal activity levels and behavioural anchors: kept structural (from the steady state), except capacity.** `uBase`, `N{j}0`, `i{j}0`, `pi{j}0`, `l{j}0`, `ydH0`, `rmR0`, `mRY`, `mRW`, `LW0{g}`, `H0{g}`, `c0{g}` (with the exception below) and `rho{j}0` keep their steady values. They define "normal", so today's distance from normal is what drives the no-change path. The gaps (§3.2) make month 1 match data and then fade.

There are two principled exceptions:

- **Capacity.** The model has no growth, but capacity grew after 2025. So `potentialOutput` = real output at month 0 ÷ (1 + the CBI's latest output-gap estimate). The export capacities `xFish` (this fishing year's quotas) and `xAlu` (smelter output) are set from data. The labour-force normalisers `emp0{g}` and `U0{g}` come from the 2026 population and LFS participation, while `uBase` stays the 2025 normal rate.
- **Known structural misfits of the steady state.** `c0O` is re-solved at month 0 so that older households' consumption matches data after the payout fix. Keeping it would leave a permanent gap of about 7.6% of GDP in older households' income (payouts of 13.9% of GDP in the steady state against 6.26% in the data). This is permanent and flagged, not a fading gap.

**The neutral-rate split (a model change, bit-for-bit at steady).** `i0` is used as the *real* neutral rate in `consumption{g}.realRate` and as the *nominal* neutral rate in four places:

- `ruleRate.neutral`;
- `mortgageRateI.keyRate`;
- `logExchangeRate.carry`;
- `bondPurchasesW.carry`.

Those four must read `i0 + piT`. With `piT` = 0 nothing changes (appendix A1).

**Scheduled events.** A start may carry `scheduled` events that belong to the no-change path because they are already agreed and are not user policy, such as a signed wage step (`wageSettlement`, fired) in January 2027. They show on the timeline as grey marks. Removing one is a user event, so its effect is measured against the no-change path. Legislated **policy** changes (for example next year's budget) are **not** scheduled in stage 1. They would make a lever move on its own, which rule 10 forbids. Stage 5 may add them as visible, user-owned scenario events.

---

## 3. Avoiding artificial jumps in month 1

### 3.1 Where jumps come from (prototype evidence)

This comes from scratch prototypes (not kept in the repo). They write engine state directly. They are crude: price levels are normalised to 1, the stocks are the steady state's and unemployment is not set. They are evidence of mechanisms, not calibration.

| Naive start (history set, nothing solved) | Month 0 → month 1 | Cause |
|---|---|---|
| Monthly inflation, annualised | 5.6% momentum → **−0.4%** | Adjustment states sit at their targets, so prices stop rising at once |
| `inflation12` with a flat CPI history | 5.6% → **≈ 0%** | `fillRing` erases the 12-month history (A6) |
| Wage growth | ≈ 7% (assumed data) → **4.0%** = `expectedInflation` | Phillips curve at `uBase`; the contracted raises are not in the rule |
| Government deficit | 0 → **2.5% of GDP** | `tau0` was solved for a balanced budget at a 3% key rate; at 8% the floating debt costs more |
| `borrowingFR` | 0 → **−0.34% of GDP** | Cash flow at 8% rates and a deposit target that moves with GDP, closed at `firmCashSpeed` = 12/yr |
| `netMortgageLending` | 0 → **−0.44% of GDP** | Desired debt at an 8% key rate vs today's debt (`lamM`) |
| Current account | 0 → **−0.36% of GDP** | Imports and exports at today's rates vs 2025 volumes |

With a start solve for `unitCost`, `importPrice` and `housingCost` and one wage gap (4.2 pp fading at 1/yr), and with the CPI identity enforced at month 0, month-1 momentum matches the targets exactly. The path is then smooth: `inflation12` 5.58% (month 1), 5.41% (3), 4.84% (6), 3.23% (12) and 1.66% (24) with the key rate held at 8%.

### 3.2 Three tools, in order

1. **A consistent month 0.** The kernel evaluates the whole schedule once at the start state. Every IDENTITY must reproduce any value the start gives; for example, the CPI must equal its weighted components. Without this, `start-solve-demo.ts` showed the CPI falling 2.4% in month 1, because the component levels and the CPI history disagreed.
2. **Latent adjustment states.** For a partial-adjustment rule `x₁ = x₀ + k·(x*₀ − x₀)`, the month-1 change is set by the gap between target and state. Where the *state* is unobserved (`unitCost`, `adaptiveInflation`, `kronaSentiment`), the start solve picks it so the month-1 change equals recent momentum. For example, unit cost is about 3% above domestic prices, so prices are still catching up. Where the state is a smoother with no data (`*Smoothed`), it is set equal to its input.
3. **Fading start gaps (add-factors).** Where the state is observed and the rule's target at today's state still implies a month-1 change different from recent momentum, the rule gets a gap `g·e^(−f·t)`. It is added to the desired value, before any `adjust`. It is sized in the start solve and fades at `f` (default 1/yr, a half-life of about 8 months). This is what central-bank forecasting models call add-factors. Here it is an honest, labelled term: "Today's gap from this rule (fades by half in 8 months)". The inspector shows it, it is tagged with a concept `start-gap`, and it is in the start report. On `steady`, g = 0 and the term does not exist, so results are bit-for-bit.

Which tool applies to which rule:

| Rule class | Treatment |
|---|---|
| IDENTITY | Tool 1 only; never a gap. |
| CONTRACT | Parameters from data (§2.6 C); never a gap. |
| POLICY | Settings from data (§2.6 P); never a gap. The Taylor rule's suggestion is what it is. |
| BEHAVIOUR with an unobserved state or a smoother | Tool 2. |
| BEHAVIOUR, observed state, momentum mismatch | Tool 3, with a fading gap: `wageGrowth`, `consumption{g}`, `investment{j}`, `employment{j}`, `logRealHousePrice`, `unemployed{g}` (fade 0.5/yr), `exportVolumeTourism`, `exportVolumeOther`, `mortgageDemand{g}`, `importsConsumer`, `importsInputs*`. |
| BEHAVIOUR, known structural misfit | Re-solved intercept, permanent and flagged: `c0O` (and any other case listed with its reason). |

Guards: a gap larger than 25% of its rule's month-0 value is a start-report warning. A gap is never allowed on a rule whose target is a stock (the kernel rejects it; stocks change only through postings). The fade speed is a parameter with provenance (`assumed`), so the harness can vary it.

### 3.3 The start solve

This mirrors `solveBaseline` and reuses its Newton/Levenberg–Marquardt machinery (`numerics.ts`).

- **Unknowns:** the latent states listed in §2.5, the gap sizes `g_r`, and the policy parameters solved to data (`tau0`, `vat0`, `tauF`, `rr`, `c0O`).
- **Equations:** month-0 identities that the data pin down (CPI identity, `nominalGDP`, revenue items), and month-1 targets (momentum: `domesticPrice`, `importPrice`, `housingCost`, `wage`, `consumption{g}`, `investment{j}`, `employment{j}`, `logRealHousePrice`, `exchangeRate`, `unemployment` by age).
- **Evaluation:** load the start, run one step, and read residuals from the pre-step and post-step contexts. The Jacobian is by finite differences; there are about 40 unknowns, which takes milliseconds per column.
- **Output:** solved values into the start state, and the residual into the start report. It fails if the largest residual is above 1e-9 after polishing.

The solve runs once per (start, variant). Forks reuse the parent's solved start (§4.4).

### 3.4 Which parameters stop being the steady-state ones

For the `today` start only:

- **§2.6 P:** `piT`, `tau0`, `vat0`, `tauF`, `rr`, `css`, `g*`, `tr*`, `tga`, `ltvLimit` and `kapT`, plus the levers `keyRateFixed` and `ltvCap`.
- **§2.6 C:** `sB`, `sMN`, `sL`, `mD`, `sBB`, `rMI0`, `rBI0`, `Tm`, `theta` and `payout`.
- **§2.6 N-a:** `dep{j}0`, `bW0`, `boSh0`, `bbSh0`, `dPF0`, `nwPF0`, `pfForeignTarget` and `krona0`.
- **Capacity:** `potentialOutput`, `xFish`, `xAlu`, `emp0{g}` and `U0{g}`.
- **Re-solved:** `c0O`.
- **New parameters:** `worldPrice0`, `fishPrice0`, `aluminiumPrice0` and `iFnow`, plus the gap sizes and fade speeds.

Everything else keeps its steady-state or input value. That includes all speeds and elasticities (`lam*`, `beta*`, `phi*`, `eta`, `aLab`, `chi`) and the structural normalisers (§2.6 N-b). The start report lists every override with its steady value beside it.

### 3.5 The long run of the no-change path

The prototypes answer the question empirically (Automatic unless stated; 240–360 months):

| Setting | Where it goes | Kind |
|---|---|---|
| `piT` = 0 (today's model), Automatic | Back to the **old steady state**: inflation 0.0%, key rate 3.0%, unemployment 4.25%, debt 56% | Converges to the old steady state |
| `piT` = 2.5% with the neutral split, Automatic | A **new stationary path**: inflation ≈ 0.55%, key rate ≈ 3.6%, unemployment ≈ 4.4%, output gap ≈ 0, debt ≈ 57% of GDP, ratios to GDP stable, nominal levels growing ≈ 0.6% a year | Converges to a new steady state, **below target** |
| Same with `i0` = 1% | Inflation 0.94%, unemployment 4.24%, output 0.4% above potential | Target still missed |
| Same with `betaH` = 0 and fast price adjustment | Inflation 1.7% | Closer, still missed |
| Manual, key rate held at 8% | Inflation falls to ≈ 0.5–1% by years 3–5, unemployment rises to ≈ 5.2%. Then interest on floating government debt (8.5%) snowballs: debt 74% (year 5), 91% (year 10), **116% of GDP (year 20)**, deficit 7.3% of GDP. The extra interest income eventually lifts demand and inflation back to ≈ 3% | **Drift**: finite but not stationary |

Why the target is missed: the model is not neutral to trend inflation (A3). Level-form partial adjustment of prices and costs creates permanent relative-price wedges under trend inflation. The portfolio-balance term compares a nominal stock with a price-deflated anchor. And cash interest on non-indexed debt front-loads real burdens. The wage curve then balances only when inflation is below `piT`: `log(wage/domesticPrice)` settles about 2% above normal, and the wage error correction pulls wage growth down.

What to do:

- **Stage 1:** accept and document it. The 24-month path, which is what users read, is governed by the start and the gaps. The long run is tested for finiteness and bounds, not for convergence to 2.5%.
- **Stage 5 (roadmap v2):** a balanced-inflation reference. Partial adjustment gets a trend (§4.6), the portfolio anchor is scaled, and the intercepts are re-solved so that the Automatic no-change path converges to `piT` with `unemployment` at `uBase`.

### 3.6 Manual and Automatic

- **Manual (the default, decision 0004).** "No change" literally means the key rate stays at 8.00% for ever. From the calibrated start (demo), the rule's suggestion stays at 8.1–8.3% for about 6 months while inflation is still above 4.5%, then falls: 6.9% at month 12 and 4.6% at month 24. The lever turns red, and the feed says "The central bank's rule would cut the key rate to …%" (the existing stabiliser narration). The no-change path is then a *policy-inaction* counterfactual: an ex-ante real rate of about 4% at month 0 (8% minus 4% expected inflation), rising towards 6% as expectations fall. That is useful ("what does holding 8% do?"), but it is not a forecast. The start's opening feed message must say so.
- **Automatic.** The rule starts from `ruleRate` = 8% (no jump), stays at 8.1–8.3% for about 6 months, then cuts: 6.9% at month 12 and 5.3% at month 24 in the demo. Effects of lever moves are then responses *with* a reacting central bank, which is how published responses are measured.
- Both modes share the start, and the reference path is computed in the mode of the run it serves. Switching the mode mid-run is a user event, so the reference path does not switch.

---

## 4. Kernel API changes

### 4.1 Types (`src/core/types.ts`)

```ts
/** A dated starting point: today's economy, or any other. The steady state is the implicit start 'steady'. */
export interface StartDef {
  id: Id;                          // 'today'
  label: string;                   // 'Iceland on 28 September 2026' (translated like other model text)
  asOf: string;                    // ISO date of the data vintage: '2026-09-28'
  description: string;             // plain English; shown when the start is chosen
  /** Parameter values for this start, applied after the steady state is solved (like fork params). */
  params?: Record<Id, { value: number; provenance: Provenance }>;
  /** Instrument positions [instrument, player, value], Ctx sign convention, each with provenance.
   *  Unlike SteadyStateSpec.initialStocks nothing is filled silently: `derived` names the one
   *  position per financial instrument the kernel fills, and the start report prints it. */
  stocks: { at: [Id, Id]; value: number; provenance: Provenance; period?: string }[];
  derived: Record<Id /* instrument */, Id /* player */>;
  /** Month-0 values of lagged variables, with history for months −1, −2, … where rules look back. */
  vars: Record<Id, { now: number; history?: number[]; provenance: Provenance }>;
  /** Lever settings at month 0: today's policy. They are also the lever bars' "unchanged" markers. */
  levers?: Record<Id, number>;
  /** Events that belong to the no-change path (already agreed, not user policy). No POLICY levers. */
  scheduled?: ScenarioEvent[];
  /** Fading start gaps on BEHAVIOUR rules: g·exp(−fade·t), added to the desired value. */
  gaps?: Record<Id /* rule id */, { fade: Id | number; value?: number; label?: string }>;
  /** Start calibration: unknowns and targets, solved by Newton like the steady state. */
  solve?: {
    unknowns: ({ var: Id } | { param: Id } | { gap: Id })[];
    targets: { id: Id; describe: string; residual: (m0: IndicatorCtx, m1: IndicatorCtx) => number }[];
  };
}

export interface ModelDef {
  // … as now, plus:
  starts?: StartDef[];
  /** How model money units convert for display: 1 unit = ISK 49.41211 bn (1% of 2025 GDP). */
  moneyUnit?: { label: string; perUnit: number; basis: string };
}

export interface Scenario {
  modelId: Id;
  start?: Id;         // default 'steady'; scenario format bumps to iceland-inc/scenario@2
  events: ScenarioEvent[];
  months: number;
}
```

Kernel-generated gap terms: for each rule in `gaps`, the compiler appends a term `startGap` (label "Today's gap from this rule, fading", concept `start-gap`) whose value is `g_r·exp(−fade·t)`. For a rule with `combine` it is added after combining, and the rule is marked non-additive. The compiler accepts gaps only on BEHAVIOUR rules, and never on a rule whose target is read as a stock. Gap sizes live in engine state, so a fork can share them.

`Ctx.lag` doc change: before month 0 it returns the **start's history** (the steady value on `steady`). `Ctx.base` stays the steady state in every start.

### 4.2 Engine (`src/core/engine.ts`)

```ts
export interface EngineOptions {
  // … as now, plus:
  start?: Id;                 // default 'steady'
}
export interface KernelEngine extends Engine {
  readonly startId: Id;
  /** Positions, derived and residual positions with their data, identity checks, gaps, overrides. */
  startReport(): StartReport;
  /** The steady state, whatever the start (what baseline() returned before). */
  steady(varId: Id): number;
  /** An indicator's level (before the display transform) on this run and on the no-change path. */
  levelSeries(id: Id): number[];
  referenceSeries(id: Id): number[];
}
```

- **`reset()`** resets to the engine's start, not to the steady state. It sets positions, `cur`, the ring (now + history; `fillRing` is replaced by `initHistory(start)`), levers from `start.levers`, and gap sizes. Then it applies scheduled events at t = 0.
- **`baseline(varId)`** keeps its name, but its meaning becomes *the reference path at the current month*. On `steady` that is the steady state, so every existing caller is unchanged.
- **`IndicatorCtx.base` / `baseStock`**, `toDisplay`, `pipes()` and `legs()` baselines, `balanceSheet()` baselines, `influences()` (terms now vs reference terms at the same month), `ideasAtPlay()`, feed thresholds and the ledger's "change" column all read the reference path at month t.

### 4.3 The no-change path is the kernel's

Recommendation: the kernel owns it, as a second `Machine` stepped in lockstep. It is not left to the UI's engine client running a second engine. Influences, ideas at play, pipes (amber or blue-grey glow), balance sheets, the feed and forks all compute "vs baseline" inside the kernel. A UI-side second engine would leave all of them comparing with the steady state, which would be wrong in every view but the charts.

- The reference machine starts from the same start and variant and applies only `scheduled` events. It records vars, terms, desired values, positions and indicator levels. User events never touch it, so `seek`, `setLever` and `load` do not invalidate it. It is extended lazily to the current horizon.
- **On `steady`** the reference is the constant steady state. The kernel short-cuts to today's `baselineData`, bit-for-bit and at no cost.
- **Cost:** about twice the step cost (microseconds per month). The reference history is cached per engine.

### 4.4 Forks and variants

- `fork({ params })`: the fork reuses the parent's solved start (state, latent states, gap sizes) and runs its **own** reference path under its parameters. Shocked minus unshocked stays within one variant (rule 9).
- `fork({ disableTerms })`: a disabled term is held at the **parent's reference-path value of that term at the same month**. This generalises "held at baseline": the fork's unshocked run then equals the parent's no-change path exactly, and shocked minus unshocked isolates the channel.
- `EngineOptions.params` (a model variant) re-solves the steady state, and then re-runs the start solve, so each variant starts at the data.

### 4.5 Validating the initial state

When an engine is created with a start, the kernel:

1. builds positions from `stocks`, fills only the declared `derived` positions, and checks every financial instrument sums to zero (1e-9). This throws with the numbers otherwise, and also if a derived or residual position has the wrong sign where the start declares a sign;
2. evaluates the schedule at month 0 and checks every IDENTITY against any value the start gives (relative 1e-9), such as `cpi`, `inflation12`, `realHousePrice`, `nominalGDP` and `capitalRatio`;
3. checks that every lagged variable has a value, and every 12-month lag a 12-month history;
4. checks every lever value is within its range and every parameter override within its `min`/`max`;
5. runs the start solve, if any, and records its residual;
6. publishes `startReport()`: every position (data, derived or residual, with period and provenance), every override beside its steady value, every gap with its size relative to the rule's value, identity residuals, and the month-1 jump table (§6, T4).

### 4.6 Model-language additions that the start needs, all bit-for-bit on `steady`

- `adjust.trend?: Id`. Partial adjustment around a trend: `x₁ = x₀·e^{π·dt} + k·(x* − x₀·e^{π·dt})`, where π is the named variable (for example `expectedInflation`). This is for price-like rules: `unitCost`, `domesticPrice`, `importPrice`, `housingCost`. It is stage 5; with π = 0 it is identical to today.
- New parameters: `worldPrice0`, `fishPrice0`, `aluminiumPrice0` and `iFnow` (default 1, 1, 1 and `iF0`).
- The `i0` → `i0 + piT` split in the four nominal comparisons.

---

## 5. Units for display

- **Model units are unchanged:** money is % of 2025 nominal GDP (flows at annual rates); rates are fractions a year; price indices are 1 = 2025 average. `ModelDef.moneyUnit = { label: 'ISK bn', perUnit: 49.41211, basis: '1% of 2025 nominal GDP, Hagstofa THJ01102' }`.
- **Display conversions** (a `levelUnit` on `IndicatorDef`; the kernel's `format.ts` does the arithmetic):

| `levelUnit` | Conversion | Example |
|---|---|---|
| `isk-bn` | value × 49.41211 (flows: ISK bn a year; ÷ 12 for a month) | Mortgage debt 58.9 → ISK 2,909 bn |
| `isk-bn-2025` | real quantity × 49.41211, labelled "at 2025 prices" | Real output |
| `pct-gdp` | ratio to `nominalGDP` of the **same month** × 100 | Debt / GDP |
| `percent` | fraction × 100 | Key rate, inflation, unemployment |
| `index` | × 100, 2025 = 100 (optionally re-based to Hagstofa's own index base) | CPI, house prices |

- **Charts: "nominal change over time".** Each chart shows the *level* in its `levelUnit`: the run as a solid line, and the no-change path as a dashed line (flat on `steady`). The *effect* (the existing `display` transform, now vs the reference path) is drawn on its own scale as a shaded band or thin bars.

  If a true second y-axis is used, the effect axis must be zero-aligned, labelled with its unit ("pp vs no change", "% vs no change"), and coloured to match its series. Dual axes invite false comparisons of the two scales; the default should be a small effect strip under the level chart sharing the time axis, with the dual axis as an option. The x-axis shows calendar months (t = 0 is September 2026). The lever-event marks stay amber, and scheduled events are grey.

- **Balance sheets and the ledger** show ISK bn next to model units. The flow map's amber/blue-grey glow is vs the no-change path.

---

## 6. Acceptance tests

These form a new harness layer `starts` in `src/harness/layers.ts`, and `bun test` for the kernel parts. Tolerances are in model units unless stated.

| # | Test | Pass condition |
|---|---|---|
| T1 | Initial state balances | Every financial instrument: Σ assets − Σ liabilities < 1e-9 at month 0. Every residual position ≥ 0. Only declared positions are derived. |
| T2 | Month-0 identities | Every IDENTITY reproduces the start's values within 1e-9 (relative). `inflation12` = CPI data ± 0.05 pp; key rate = 8.00% exactly; unemployment = LFS ± 0.1 pp; `expectedInflation` = survey ± 0.05 pp; `nominalGDP` and real output within ±1% of the national accounts; every stock equals its data in ISK bn (rounding). |
| T3 | Accounting from month 1 | The four existing checks < 1e-9 for 240 months, in both modes. |
| T4 | Month-1 jumps | Rates other than policy: \|Δ\| < 0.10 pp. Monthly inflation (annualised) and wage growth within ±1.0 pp of their 3-month data momentum. Consumption, investment, employment, exports, imports and tax revenue: \|x₁/x₀ − 1 − momentum\| < 0.5%. Net flows (`deficit`, `borrowing{j}`, `netMortgageLending`, `bondIssue`, `currentAccount`, portfolio flows): \|Δ\| < 0.3% of GDP (annualised). Exchange rate: \|Δlog\| < 0.5%. The same bounds from month 1 to month 2 (no oscillation). Reported as a table in `startReport()`. |
| T5 | 24-month plausibility, Manual (8% held) | Key rate = 8.00 for all 24 months. Suggestion < 8 by month 12. `inflation12` at month 12 ∈ [2.0, 5.5]%, at month 24 ∈ [0.5, 4.5]%. Unemployment at month 24 ∈ [5.5, 9.0]%. Real output at month 24 within [−5, +3]% of month 0. Each range sourced from the CBI Monetary Bulletin 2026/3 forecast band and the banks' forecasts, recorded in `source`. |
| T6 | 24-month plausibility, Automatic | Key rate at month 12 < 8.0 and ∈ [4.0, 8.5]% throughout. `inflation12` at month 24 ∈ [1.5, 4.0]%. Unemployment at month 24 ∈ [5.0, 8.5]%. |
| T7 | 20-year finiteness, both modes | Every variable finite for 240 months. Unemployment ∈ [0, 30]%; `inflation12` ∈ [−10, 30]%; government debt < 300% of GDP; no instrument position changes sign unless it is allowed to. The long-run values are reported, not gated (see §3.5). |
| T8 | Reference integrity | With no user events, run = reference bit for bit, so every effect is exactly 0. `seek`/replay reproduces a straight run. A fork with no changes has zero effect. A disabled-term fork's unshocked run equals the parent's reference. |
| T9 | `steady` unchanged | Every existing test, golden and calibration check is bit-for-bit, and the 240-month drift is < 1e-9. On `steady` there are no gaps and the reference is the steady state. |
| T10 | Determinism and data refresh | The same start and scenario give identical numbers. A golden of the no-change path (months 1–24, both modes, about 15 headline series) is regenerated deliberately when `current-*.json` changes, and the diff appears in review. |
| T11 | Start report guards | Gaps > 25% of their rule's value, residual-vs-data gaps > 10%, and placeholders used for stocks are listed as warnings. The harness fails only on hard errors (T1–T3, T7). |

**The calibration checks.** Keep them gating from `steady`, as now. They measure the model's mechanisms (the response to a 1 pp hike, a 10% wage settlement, and so on) against published responses estimated around normal conditions. Their ranges and goldens stay valid, and they remain independent of data vintages.

Also run each check's scenario **from `today`**, measured as shocked minus the no-change path. With the kernel's reference path, `runScenario(model, events, months, { start: 'today' })` series are already effects. Report these beside the steady results. Promote to gates only the checks that are state-independent by construction:

- `fiscal-money-banks-vs-funds`;
- `lending-impulse-*`;
- `aluminium-windfall-abroad`;
- `wage-squeeze-labour-intensive`;
- `manual-tax-key-rate-held`.

The drift checks `manual-no-shock-drift` and `automatic-no-shock-drift` stay `steady`-only. Their `today` counterparts are T5–T7.

---

## 7. Risks and staged plan

### Risks

| Risk | Mitigation |
|---|---|
| **Data periods do not match** (Q2 stocks, August prices, a September rate) | Record every period. Month 0 = September 2026 opening. Roll quarterly stocks forward only by known flows, or accept a gap of up to 3 months and show it in the start report. |
| **Mapping losses** (covered bonds held beyond pension funds, indexed bonds held by banks, unmodelled holders) | Declared residuals with data cross-checks; warnings in T11; no silent auto-fill. |
| **Gaps hide misspecification** | Gaps only on BEHAVIOUR rules, fading, visible as terms, size-guarded, and listed in the report. Effects largely cancel them (same start in both runs). |
| **The long run misses the target** (§3.5); Manual debt snowball | Document it in the UI's start description. Gate on finiteness, not convergence. Fix in stage 5 (`adjust.trend`, portfolio anchor, re-solved neutral rate, repricing of government debt at its maturity). |
| **"Baseline" changes meaning** for users and code | Keep the `baseline()` name with a generalised meaning; add `steady()`. The UI labels the dashed line "no change from today" and never "baseline" on `today`. |
| **Floating-rate debt** exaggerates the fiscal effect of rate moves | Resolved for government bonds in review MON-1: `bondRate` is an average coupon that reprices over the debt's maturity. Non-indexed mortgages still float. |
| **Unemployment of 6.8% is a volatile monthly LFS figure** | Use the 3-month seasonally adjusted rate; the gap fades slowly (0.5/yr); the T5 range is wide. |
| **Placeholders become "today"** (`depFX`, `eShareW`, `fxr` → data, `house0` → data, `bondO`, the loan shares) | The start report lists every placeholder used; replacing each one is a follow-up. |
| **Performance** (the reference machine doubles steps) | Microseconds per month; lazy extension; a short-cut on `steady`. |
| **Scenario URLs and old files** | `start` defaults to `steady`; format `scenario@2`; URL key `s`. |

### Staged plan

| Stage | Scope | Done when |
|---|---|---|
| **0. Logic fixes, bit-for-bit** | Split `i0` → nominal neutral `i0 + piT` in `ruleRate`, `mortgageRateI`, `logExchangeRate` and `bondPurchasesW`. Add `worldPrice0`, `fishPrice0`, `aluminiumPrice0` and `iFnow`. Replace `fillRing` with a history-aware initialiser (the same values on `steady`). | All goldens and calibration unchanged; `bun test`, typecheck and harness pass. |
| **1. Kernel starts and reference path** | `StartDef`, `EngineOptions.start`, `startId`, validation (§4.5), `startReport()`, the reference machine, generalised `baseline()`, `steady()`, forks (§4.4), `Scenario.start`, the harness layer `starts` (T1–T3, T8–T9) with a test model. | T1–T3 and T8–T9 pass; T9 bit-for-bit. |
| **2. Iceland `today` data and reconciliation** | `src/models/iceland/today.ts`: the data map from `current-hagstofa.json` and `current-financial.json`, the sector mapping, positions and residuals (§2.3), start parameters (§2.6), lever settings, history. | T1, T2 and T11 pass with real data; the start report is reviewed. |
| **3. Start calibration** | Start solve in the kernel (§3.3), gap terms (§4.1), fade parameters; tune fades against T4–T6; the no-change golden (T10); `today` calibration runs reported. | T4–T7 and T10 pass in both modes. |
| **4. Interface** | Start picker (Steady / Iceland today); calendar months; level charts in ISK bn or % with the dashed no-change path and the effect strip or dual axis (§5); the lever "unchanged" markers at today's settings; the opening feed message; ISK on balance sheets and the ledger; start text through the Icelandic translation. | UI tests and a smoke render on both starts. |
| **5. Balanced-inflation reference (roadmap v2)** | `adjust.trend` on price-like rules; a nominally scaled portfolio anchor; re-solve intercepts so the Automatic no-change path converges to `piT` with `unemployment` = `uBase`; an effective government-bond rate with maturity repricing; pension payouts with growth. | Automatic no-change inflation → 2.5% ± 0.2 pp by year 20; T7 tightened to convergence. |

---

## Appendix A. Logic issues found while designing this

Each is confirmed by reading the code and, where stated, by the scratch prototypes.

- **A1. `i0` has two meanings.** It is a *real* neutral rate in `consumption{g}` (`keyRate − expectedInflation − i0`), but a *nominal* one in:
  - `ruleRate` (neutral term);
  - `mortgageRateI` (`psiIdx·(keyRate − i0)`);
  - `logExchangeRate` and `bondPurchasesW` (carry: `keyRate − i0 − (foreignRate − iF0)`).

  This is harmless only while inflation and `piT` are both 0. Fix: stage 0.
- **A2. The inflation target is 0% (`piT` = 0)**, so expectations anchor at 0 and the Taylor rule treats all inflation as excess. Iceland's target is 2.5%. On `today`, `piT` must be 0.025 (§2.6).
- **A3. The model is not neutral to trend inflation.** With `piT` = 2.5% and A1 fixed, the Automatic no-change path settles at about 0.55% inflation and a 3.6% key rate, not 2.5%. The miss barely moves with `i0` (0.94% at `i0` = 1%). It narrows only when level-form price adjustment is made fast and `betaH` = 0 (1.7%). The wedges are:
  - level partial adjustment of `unitCost`, `domesticPrice`, `importPrice` and `housingCost`;
  - the portfolio-balance term, which scales a nominal stock of non-residents' krónur by the price level;
  - demand-side drags from nominal cash interest.

  Fix: stage 5.
- **A4. Government bonds and non-indexed mortgages float with the key rate on the whole stock.** Resolved for government bonds (review MON-1): `bondRate` is now a stock-weighted average coupon; each month last month's new bonds and 1 ÷ `bondMaturity` (five years) of the rest reset to the key rate + `sB`, so a 1-point hike moves the government balance about −0.13 points of GDP in the first month instead of −0.49 (decision 0002 §6). On `today` its history can start at the data's effective rate. Non-indexed mortgages still reprice at once. Holding 8% on Manual still snowballs the debt, more slowly, because the coupon converges to the held rate (the figure of about 116% of GDP in 20 years predates the change).
- **A5. Steady-state pension payouts are 13.9% of GDP**, against 6.26% in the data (the `payout` comment in `pensions.ts` already says so). A start must set `payout` from data, which forces `c0O` to be re-solved.
- **A6. The lag history is flat.** `reset()` calls `fillRing`, so any start away from the steady state begins with `inflation12`, `creditImpulse` and `creditImpulseTotal` at 0 and indexation computed from a flat CPI. Fix: history-aware initialisation (stage 0).
- **A7. Fast-closing targets create month-1 jumps.** These are `firmCashSpeed` = 12/yr, `treasuryTopUp` = 12/yr and `lamFX` = 12/yr: any mismatch between today's holdings (or today's króna) and the steady anchors is closed within a month. Hence §2.6 N-a and the latent `kronaSentiment`.
- **A8. `keyRateFixed.default` = 3 is used as "the baseline setting" by the lever UI and by `HELD_RATE` in `calibration.ts`.** On `today`, "unchanged" is 8.00. That value must come from the start's lever settings, not from `LeverDef.default`.

## Appendix B. About the prototype numbers

The prototypes write engine internals directly (`(engine as any).M`) and patch rules in a copy of the model definition. They are not repo code. Their price levels are normalised to 1 and their stocks are the steady state's, so their numbers illustrate mechanisms, not today's calibration.
