# 0002. Porting the Iceland model from engine v1

Status: accepted, with the first platform version of the Iceland model (September 2026).

Engine v1 (`legacy/v1-engine`) was one hand-written monthly step of about 270 lines. The port declares the same economy as 14 modules in `src/models/iceland/`, and the kernel now does the accounting, payments, checks, scheduling, steady state and influences. This record lists the kernel and harness changes the port needed, how v1's constructs map onto the model language, and how the port's results compare with v1's.

## 1. What was built

| Module | File | Contents |
|---|---|---|
| `structure` | `modules/structure.ts` | 10 players in 7 groups with layout hints; 15 instruments (13 financial, homes and firms' capital) |
| `central-bank` | `modules/central-bank.ts` | 5 rules: the smoothed rule, the key rate (rule + add-on, or fixed; zero floor), interest on reserves, income on FX reserves, profit remitted to government; 3 levers |
| `banks` | `modules/banks.ts` | 26 rules: equity, risk-weighted assets, capital ratio, the capital premium, deposit / loan / mortgage / bank-bond rates, interest legs, profit, smoothed profit, dividends; the lending-appetite lever |
| `prices` | `modules/prices.ts` | 8 rules: import prices, smoothed unit cost, markup pricing with capacity pressure, CPI with data weights and VAT, inflation (monthly and 12-month), expectations |
| `housing` | `modules/housing.ts` | 11 rules: real house prices, house prices, the CPI housing component, home purchases, revaluation of homes, homes moving with their owners as they age |
| `mortgages` | `modules/mortgages.ts` | 44 rules: real mortgage rate, the debt-service stress test, desired debt, demand, the DSTI and LTV caps, lending (regimes name the binding cap), repayments, net lending, credit impulses, and 24 legs (new loans, repayments, interest, indexation by borrower and lender); 2 levers |
| `households` | `modules/households.ts` | 19 rules: gross income, net labour income, property income, disposable income and consumption by age group; older savers' bond share |
| `external` | `modules/external.ts` | 29 rules: world prices, foreign rate, sentiment, the króna, the real exchange rate, exports by type, imports by component, FX revaluations, carry trade, current account; 5 levers |
| `firms` | `modules/firms.ts` | 27 rules: investment with a planning lag, profits, smoothed profits, retention, dividends (incl. foreign owners), capital and depreciation, business borrowing, output and nominal GDP |
| `labour-and-wages` | `modules/labour-and-wages.ts` | 23 rules: the wage Phillips curve with error correction, the wage rate and settlements, employment by sector and age, the migration buffer, unemployment; 2 levers |
| `government` | `modules/government.ts` | 58 rules: the seven spending channels as separate flows, taxes, the debt-tied rule, bond interest and indexation, the deficit, bond issuance and the bond-buyer choice; 11 levers |
| `pensions` | `modules/pensions.ts` | 16 rules: contributions, rights earned, payouts, credited returns, retirement, fund income, portfolio (foreign assets, bank bonds, government bonds); 1 lever |
| `indicators` | `modules/indicators.ts` | v1's 34 charts, same ids, in the tabs Overview, People, Money and credit, Government and world |
| `feed` | `modules/feed.ts` | v1's 18 feed rules |

Plus `params.ts` (input parameters with provenance), `steady.ts` (the closed-form steady state and the solved and derived parameters), `calibration.ts` (v1's 20 checks) and `index.ts`. In total: 266 variables and rules, 53 flows with 139 legs, 274 parameters, 25 levers, 34 indicators, 26 module tests. One simultaneous block of 45 rules (the income–spending loop). Step time about 36 µs in the harness’s timing run and 80–110 µs a month while a large shock works through, against a budget of 200 µs.

## 2. Contract, kernel and harness changes

All are small and backwards compatible; the reference model's results are unchanged.

| # | Where | Change | Why |
|---|---|---|---|
| 1 | `RuleDef.adjust` (types.ts), compile.ts, machine.ts | Optional `form: 'exponential'`: the share of the gap closed each step is 1 − e^(−speed·dt) instead of speed·dt. No overshoot warning for this form. | v1 used this exact first-order lag everywhere (`kf`). With the linear form, speeds such as the króna's 12 a year close the whole gap in one month (v1: 63%), and every speed of 1.5–3 a year runs 7–15% fast. The exponential form reproduces v1 exactly and changes less when the step is halved. |
| 2 | `LegDef` doc (types.ts), compile.ts, format.ts | A `revalue` between two holders of the same instrument is a reclassification: value moves from `from` to `to`, no cash, no income. Allowed for financial and real instruments. The ledger code was already correct for it. | v1's retirement row moves pension rights from working-age members to pensioners, and homes must move with their owners as they age. Neither has a counterpart that issues the claim to route through. |
| 3 | compile.ts | Parameters that the closed-form `steadyState.solve` reads count as used (the compiler dry-runs `solve` on a recording record). | The data inputs of the closed form (population, employment rates, M3, tax revenues, ...) are read by nothing else, so each gave an "unused parameter" warning, although the warning text already says "or the steady-state solver". |
| 4 | harness `layers.ts` | Half-step sensitivity: the change may be 20% of the measure, or 10% of the width of the check's range when that is larger (only when both ends of the range are finite). | A measure near zero makes a relative change meaningless. v1's check "consumption at year 6 ÷ peak" is 0.02–0.04: the step length moves it by 0.01, which is 50% of the value but 5% of its range [0, 0.25]. v1 itself changes it by 33% when the step is halved. The tolerance widens only for measures smaller than half their range's width (4 Iceland checks, 1 reference check), and every other measure of both models still passes the old 20% test (the largest change is 4.8%). |

Tests: `tests/core/contract-0002.test.ts`.

## 3. How v1 maps onto the model language

- **Partial adjustment.** Every `s.x += kf(lam) (target − s.x)` of v1 is a rule with terms for the target and `adjust: { speed, form: 'exponential' }`, so the inspector shows the desired value and what moves it. Stock-gap *flows* (carry trade, portfolio rebalancing) use the same share per step as an annual rate (`gapRate` in `util.ts`).
- **Timing.** v1 computed a month in a fixed order, reading some states before and some after their update. Each read is now a same-step input or a lag, as v1 had it. Behavioural lags use `lastMonth()` (`util.ts`): the previous step at the standard step of a month, and still a month when the step is halved, so the model's reaction lags do not shrink with the step. Accounting lags (this month's price change for indexation and revaluation) stay one step.
- **One-offs.** A wage settlement and a króna sentiment shock set a "this month" state variable (`settlementJump`, `sentimentShock`) that is zero in every other month. As in v1, the settlement lands on top of the month's normal wage growth, and the sentiment shock on top of the faded sentiment. (Shocking the lagged wage directly would have let the error-correction term see the new wage one month early, 3% off v1.)
- **"After this month's flows".** v1 set firms' borrowing and bond issuance from deposits and the treasury account *after* the month's payments. Here they are identities of this month's cash gap (investment + tax + dividends − profit; the government's cash deficit) plus a top-up of any gap to target at 12 a year, which closes it within the month at the standard step: the same numbers as v1.
- **Portfolio rules** (bank bonds, pension-fund liquidity, older savers' bond share) use the start of the month's stocks, where v1 used stocks after the month's flows. The foreign-asset rule adds this month's revaluation, so funds react to a króna move in the same month, as in v1 (without it the króna path after a depreciation differed by 5%).
- **Pensions.** A payout is a redemption of pension rights: the fund pays cash and the pensioner's rights shrink. v1 posted a cash transfer and a separate accrual using up the rights, with the same stock changes. Retirement is a reclassification (change 2).
- **Money** is never computed: broad money is the sum of deposits, and every cash leg settles through the kernel's payment system. The same mortgage creates money when a bank lends and moves it when a pension fund does (module test), and deficits add more money when banks buy the bonds (module test and calibration check).
- **Indexation** of indexed mortgages and bonds is an `accrue` posting (module test: it moves no deposits).
- **Steady state.** `steady.ts` is v1's `40_steady.js`, extended with capital, homes and the new derived parameters. It returns every stock, every state variable and every solved or derived parameter, and the first step from it is an exact fixed point (residual 1.7e-13, no Newton iteration needed). Eleven balancing parameters are paired with the data they balance as the spec's free parameters and targets (tau0 ↔ government debt 56.7%, c0 ↔ each age group's deposits, muD ↔ non-residents' deposits, rho ↔ firms' debt, payout and ageing ↔ pension rights, mR ↔ mortgage debt), so the Newton polish keeps them for any variant.
- **Checks.** v1's 20 checks keep their scenarios and ranges; open ends are ±∞ instead of ±100. The bank-versus-pension-fund money check needs two scenarios, so its measure runs the pension-fund-financed counterpart itself on the same engine (`calibration.ts`).

## 4. Comparison with v1

Legacy results from `node legacy/v1-engine/run_tests.js` (rebuilt against `data/iceland/calibration.json`, reproducing `test_output.txt`); the port from `bun run harness`. Months after the shock in brackets.

### Calibration checks

| Check | Range | v1 | New |
|---|---|---:|---:|
| Rate +1 pp: output trough, % | −0.6 to −0.25 | −0.33 | −0.33 |
| Rate +1 pp: output trough quarter | 4 to 7 | 6 | 6 |
| Rate +1 pp: inflation trough, pp | −0.35 to −0.1 | −0.31 | −0.32 |
| Rate +1 pp: inflation trough quarter | 5 to 9 | 6 | 6 |
| Rate +1 pp: króna peak, % | 0.3 to 1.5 | 0.44 | 0.44 |
| Wages +10%: inflation peak, pp | 1.5 to 3.5 | 1.95 | 1.94 |
| Wages +10%: inflation peak quarter | 4 to 8 | 5 | 5 |
| Wages +10%: key-rate peak, pp | 0.8 to 2 | 1.31 | 1.30 |
| Wages +10%: unemployment peak, pp | 0.3 to 1.2 | 0.42 | 0.42 |
| Wages +10%: price level after 6 years, % | 3 to 8 | 3.25 | 3.24 |
| Wages +10%: output at year 6 ÷ peak | 0 to 0.25 | 0.19 | 0.19 |
| Wages +10%: unemployment at year 6 ÷ peak | 0 to 0.25 | 0.17 | 0.17 |
| Wages +10%: real wage at year 6 ÷ peak | 0 to 0.25 | 0.03 | 0.03 |
| Wages +10%: consumption at year 6 ÷ peak | 0 to 0.25 | 0.04 | 0.02 |
| Spending +1%: output, year-1 average, % | 0.3 to 0.8 | 0.72 | 0.72 |
| Spending +1%: money, banks − pension funds, pp | ≥ 0.5 | 1.14 | 1.19 |
| Króna −10%: price level at 8 quarters, % | 1.5 to 3 | 1.62 | 1.60 |
| Lending +1% for 12 months: impulse months 1–12, pp | ≥ 0.2 | 0.86 | 0.86 |
| Lending +1% for 12 months: impulse months 13–24, pp | ≤ −0.2 | −1.08 | −1.08 |
| Lending +1% held: largest impulse months 18–48, pp | 0 to 0.3 | 0.23 | 0.22 |

### Key outcomes of five scenarios

| Scenario | Outcome | Unit | v1 | New | Difference |
|---|---|---|---:|---:|---:|
| Wages +10% | Inflation peak | pp | 1.95 (m14) | 1.94 (m14) | 0.6% |
| Wages +10% | Key-rate peak | pp | 1.31 (m16) | 1.30 (m16) | 0.8% |
| Wages +10% | Unemployment peak | pp | 0.42 (m25) | 0.42 (m25) | 0.5% |
| Wages +10% | Young unemployment peak | pp | 0.64 (m25) | 0.64 (m25) | 0.5% |
| Wages +10% | Output trough | % | −0.64 (m27) | −0.64 (m27) | 0.5% |
| Wages +10% | Price level after 6 years | % | 3.25 | 3.24 | 0.4% |
| Wages +10% | Real wage after 1 year | % | 5.30 | 5.31 | 0.1% |
| Wages +10% | Real disposable income, young, month 3 | % | 6.42 | 6.42 | 0.0% |
| Wages +10% | Real disposable income, older, month 3 | % | −1.05 | −1.05 | 0.0% |
| Wages +10% | Króna after 6 years | % | −3.15 | −3.16 | 0.1% |
| Wages +10% | Broad money after 2 years | % | 5.16 | 5.19 | 0.7% |
| Key rate +1 pp, 8 quarters | Output trough | % | −0.33 (m16) | −0.33 (m16) | 0.3% |
| Key rate +1 pp, 8 quarters | Inflation trough | pp | −0.31 (m16) | −0.32 (m16) | 1.1% |
| Key rate +1 pp, 8 quarters | Króna peak (first 8 quarters) | % | 0.44 (m2) | 0.44 (m2) | 0.4% |
| Key rate +1 pp, 8 quarters | Unemployment peak | pp | 0.11 (m20) | 0.11 (m20) | 0.4% |
| Key rate +1 pp, 8 quarters | Consumption, month 18 | % | −0.51 | −0.50 | 0.8% |
| Key rate +1 pp, 8 quarters | Investment, month 18 | % | −1.08 | −1.08 | 0.1% |
| Key rate +1 pp, 8 quarters | Real house prices, month 18 | % | −1.42 | −1.42 | 0.2% |
| Key rate +1 pp, 8 quarters | Broad money, month 24 | % | −0.70 | −0.70 | 0.2% |
| Key rate +1 pp, 8 quarters | Real disposable income, young, month 12 | % | −0.38 | −0.38 | 0.6% |
| Key rate +1 pp, 8 quarters | Real disposable income, working age, month 12 | % | −0.69 | −0.69 | 0.4% |
| Key rate +1 pp, 8 quarters | Real disposable income, older, month 12 | % | 0.84 | 0.84 | 0.1% |
| Key rate +1 pp, 8 quarters | Government debt, month 24 | pp of GDP | 1.27 | 1.27 | 0.1% |
| Govt purchases +1% of GDP (banks buy the bonds) | Output, year-1 average | % | 0.72 | 0.72 | 0.0% |
| Govt purchases +1% of GDP | Output after 6 years | % | 0.49 | 0.49 | 0.2% |
| Govt purchases +1% of GDP | Unemployment, month 12 | pp | −0.59 | −0.59 | 0.0% |
| Govt purchases +1% of GDP | Inflation, month 24 | pp | 0.50 | 0.50 | 1.3% |
| Govt purchases +1% of GDP | Key rate, month 24 | pp | 0.80 | 0.79 | 0.7% |
| Govt purchases +1% of GDP | Broad money, month 24, banks buy the bonds | % | 2.89 | 2.94 | 1.7% |
| Govt purchases +1% of GDP | Broad money, month 24, pension funds buy | % | 0.84 | 0.80 | 4.3% |
| Govt purchases +1% of GDP | Government debt after 6 years | pp of GDP | 5.16 | 5.16 | 0.1% |
| Govt purchases +1% of GDP | Income-tax rate after 6 years | pp | 0.86 | 0.86 | 0.1% |
| Króna −10% (sentiment) | Króna, month 3 | % | −8.17 | −8.16 | 0.1% |
| Króna −10% (sentiment) | Price level after 8 quarters | % | 1.62 | 1.60 | 1.2% |
| Króna −10% (sentiment) | Inflation peak | pp | 1.88 (m12) | 1.87 (m12) | 0.6% |
| Króna −10% (sentiment) | Key-rate peak | pp | 1.49 (m12) | 1.48 (m12) | 0.5% |
| Króna −10% (sentiment) | Exports, month 12 | % | 2.01 | 2.00 | 0.7% |
| Króna −10% (sentiment) | Current account, month 12 | pp of GDP | 0.40 | 0.40 | 0.9% |
| Króna −10% (sentiment) | Exporters’ profits, month 3 | % | 19.21 | 19.18 | 0.2% |
| Króna −10% (sentiment) | Pension-fund assets, month 3 | % | 2.97 | 2.96 | 0.2% |
| Króna −10% (sentiment) | Real wage, month 12 | % | −1.10 | −1.09 | 0.8% |
| Wages +10% and rate +1 pp (months 3–27) | Inflation peak | pp | 1.67 (m13) | 1.66 (m13) | 0.8% |
| Wages +10% and rate +1 pp | Price level after 2 years | % | 2.25 | 2.22 | 1.3% |
| Wages +10% and rate +1 pp | Price level after 6 years | % | 2.88 | 2.86 | 0.4% |
| Wages +10% and rate +1 pp | Output trough | % | −0.96 (m26) | −0.96 (m26) | 0.4% |
| Wages +10% and rate +1 pp | Unemployment peak | pp | 0.53 (m25) | 0.53 (m25) | 0.5% |
| Wages +10% and rate +1 pp | Young unemployment peak | pp | 0.80 (m25) | 0.81 (m25) | 0.5% |
| Wages +10% and rate +1 pp | Key-rate peak | pp | 1.97 (m15) | 1.96 (m15) | 0.6% |
| Wages +10% and rate +1 pp | Cumulative output, 6 years | %-years | −2.32 | −2.32 | 0.2% |
| Wages +10% and rate +1 pp | Cumulative inflation, 6 years | pp-years | 2.85 | 2.83 | 0.5% |

**No outcome differs by more than 10%.** Peak and trough months are the same everywhere. The largest difference, broad money when pension funds buy the bonds (4.3%), comes from the portfolio rules acting on the start of the month's stocks: pension funds that bought new bonds with deposits sell some to banks one month later than in v1, so bank-created money catches up one month later. The only calibration measure that moved noticeably, consumption at year 6 ÷ peak (0.04 → 0.02), is a path crossing zero: 0.01 pp of consumption, well inside [0, 0.25].

## 5. Simplifications and improvements

Improvements over v1:
- Every flow is a set of legs with its own rule, so pipes are exact and each is explained; v1 split multi-party rows after the fact.
- Homes are a real asset: purchases between generations are trades, homes are revalued with house prices, and they move with their owners as they age, so households' net worth includes housing (v1: a memo item). The loan-to-value cap uses the value of the homes each group owns.
- Firms own their capital: investment buys machines and buildings, and depreciation (8% a year, assumed) writes them off, so firms' balance sheets are complete (v1 counted investment as current spending). Neither change moves any v1 result.
- Pension payouts follow the national-accounts treatment (a redemption of rights).
- Behavioural lags are a month whatever the step length (`lastMonth`), and partial adjustment is the exact first-order lag, so halving the step moves every calibration measure by at most 5% except the near-zero one above (v1's own half-step differences were up to 33%).
- Regimes name the binding constraint: debt-service cap, loan-to-value cap, stress-test floors, the zero lower bound, fixed key rate, capital premium, debt rule off.
- Every parameter has provenance: 61 values from `data/iceland/calibration.json` (or its notes) with source and vintage; 93 assumed, 30 placeholder and 19 tuned as in v1; and 71 solved or derived by the steady state, each saying what it is solved from.

Simplifications, kept from v1 or new:
- Shares are held at constant book value (as v1): owners' income arrives as dividends by fixed payout shares. The compiler notes that nothing posts to them.
- Public capital is not tracked: public investment is a spending channel, as in v1.
- Portfolio rebalancing (bank bonds, pension-fund liquidity, older savers' bonds) reacts to the start of the month's stocks (section 3).

## 6. Known gaps

- **Zero-growth, zero-inflation baseline**, as v1: pension payouts are about 14% of GDP against 6.3% in the data (balanced growth is v2).
- **Floors in extreme settings (audit H1, H2, H6, H7, M6, M9–M11).** Balance sheets must stay possible: no holder's asset below zero, no issuer's liability turned into an asset, no negative real capital. The accounting checks cannot see this, so each channel that broke it has a floor, written as a `combine` of the existing rule with a plain-English regime. None binds at the baseline (drift stays below 1e-9) or changes a calibration result by more than 1.3e-4.
  - *Firms:* gross investment is never negative ("No new investment: capital only wears out"), so capital only depreciates; net borrowing is at least −loans ÷ one step ("Loans repaid in full: spare cash stays in deposits").
  - *Government bonds:* a buyback never exceeds the nominal bonds banks, the central bank, pension funds and older households hold, and is taken from them in proportion to their holdings whatever the bond-buyer choice; the rest of a surplus stays in the treasury account ("Buyback limited by holdings"). Pension funds and older households chosen as buyers take only what their deposits pay for; banks take the rest. The debt ratio nets treasury cash above its target.
  - *Trades with banks:* pension funds, older households and non-residents sell at most the bonds they hold after the month's buyback, and buy at most what banks still hold (in that order).
  - *Liquidity:* nobody pays with deposits they do not have. A payer may draw at most 1 − e^(−`liquiditySpeed` × one month) (63%) of its deposits in a month beyond its income. Pension funds spend it in turn on new bonds, foreign assets, bank bonds and bonds from banks. When their deposits fall below `pfLiquidityFloorShare` (half) of their usual share they sell foreign assets, but never more than non-residents have krónur for, and let bank bonds run off for whatever foreign sales cannot raise; the foreign-allocation lever shrinks their bank-bond and deposit targets in proportion. Non-residents sell bonds when the month's payments would take their deposits below `wDepositFloorShare` (half) of their usual share. Households spend at most their cash income plus that share of their deposits (older households keep `hoBondCashShare`, half of it, for bonds). The deposit rate is never below 0%. `liquiditySpeed` and the three shares are assumed parameters in `params.ts`.

  The model test `tests/models/iceland-balance-sheets.test.ts` runs every lever alone at its min and at its max for 20 years in each mode where it acts, and the worst combinations; before the floors, 59 positions in 35 of those runs had the wrong sign. In 450 random two- and three-lever combinations at their extremes (both modes), 534 of 900 runs had a wrong-sign position other than reserves before the floors, and 2 after. What remains (each pinned by the model test):
  - **Banks' reserves under a long surplus held on Manual.** Once every bond that can be bought back has been (income tax +10 or public investment −3 held for more than about 13 and 18 years), the surplus builds up in the treasury account and drains banks' reserves one for one, below zero. Reserve interest is the key rate × reserves, so a negative balance behaves as an overdraft at the central bank at the key rate, but the model has no instrument for it. A central-bank lending facility (or a sovereign fund for the surplus) would close this. On Automatic the debt rule cuts taxes first.
  - **Non-residents' krónur under a large current-account surplus.** Exporters are paid from non-residents' króna deposits. When those deposits and all their government bonds are used up (for example pension funds bringing 20 points of assets home while tourism is 30% up, or a long Manual surplus with strong foreign demand), the surplus overdraws their deposits, by up to 0.2% of GDP for a few months, until the stronger króna closes it. Nothing else supplies them krónur: the audit's non-resident króna borrowing (a bank loan to W) or central-bank intervention would.
  - **Pension funds in a collapse.** If the economy collapses for 20 years (public investment −3, foreign demand +20 and income tax +10 held on Manual), contributions fall toward zero while pensions are paid in full. The funds sell their government bonds, foreign assets and bank bonds, then overdraw deposits by up to 2.8% of GDP, because they never sell shares or mortgages and pensions are never cut.
  - **No shutdown.** At the lowest aluminium prices the smelters make losses for years and their foreign parents keep them going with negative dividends; they stop investing but cannot cut output or close.
  - **No unsecured credit.** A household whose deposits run out spends only its income; it cannot borrow except through mortgages.
  - A key rate held at 15% on Manual for 30 years stays finite (an inflationary spiral: nominal consumption is four times its baseline by then).
- **Newton cannot find the baseline alone.** The steady state has directions that nothing pins down: the price level (a zero-inflation model with no price-level target), holdings nobody trades at baseline (the central bank's bonds, shares) and older households' homes. The closed form sets them; Newton only polishes (it needs no iteration at the default parameters), and from a perturbed guess it converges slowly within its 60 iterations.
- **Placeholders** remain where v1 had them (30 values, flagged; v1's hard-coded 0.15 older households' weight in exporters' dividends is now one of them): firm investment and loans, the central bank's balance sheet, the import share of public purchases, housing values and turnover, pension-fund liquidity and surplus, and several payout shares.
