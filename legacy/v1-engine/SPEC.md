# Iceland Inc. engine v1: specification

Iceland Inc. is an educational, stock-flow-consistent (SFC) simulation of money moving between the sectors of a stylised Icelandic economy, in the Godley-table tradition used by Steve Keen and Wynne Godley. The UI runs it as a live machine. The user moves a lever. The effects then filter through month by month until the system settles at a new resting point, compared against a quiet steady-state baseline. **It is not a forecast and not a scripted story.** Numbers are deviations from a stylised steady state, and the model is built to show mechanisms.

This spec updates `engine-v0/SPEC.md`. The generated tables (between `<!-- BEGIN/END -->` markers) come from the built bundle; refresh them with `node engine/tools/spec_tables.js update`.

## 1. Files and how to run

| Path | What |
|---|---|
| `engine/src/00_util.js` | helpers (partial adjustment, annuity factor) |
| `engine/src/10_params.js` | **the parameter file**: every parameter with `{id, value, unit, category, basis, description}`; data values are read from `data/calibration.json` |
| `engine/src/20_structure.js` | sectors, instruments, transaction rows with plain-English explanations |
| `engine/src/30_ledger.js` | double-entry ledger, settlement, per-step accounting checks |
| `engine/src/40_steady.js` | computed steady state (balance sheets and balancing parameters) |
| `engine/src/50_behaviour.js` | one monthly step: behaviour modules, income-expenditure block, postings, financing |
| `engine/src/60_series.js` | reported series, their explanations, feed rules |
| `engine/src/70_api.js` | browser API (`createModel`) |
| `engine/build.js` | concatenates `src/` into `build/iceland-inc-engine.js` and injects the calibration data |
| `engine/build/iceland-inc-engine.js` | the browser bundle: one classic script, `var IcelandInc = (function(){ ... })();` |
| `engine/index.js` | Node entry: loads the built bundle through `new Function` |
| `engine/run_tests.js`, `engine/test_output.txt` | test suite (runs against the built file) and its saved output |
| `engine/tools/` | calibration checks, grid-search calibrator, generator for this spec's tables |

`node engine/build.js && node engine/run_tests.js`. Plain Node 24, no packages. The build embeds `data/calibration.json`, so rebuild after the data changes, then rerun the tests. The calibration checks must still pass.

## 2. Units, conventions, solution method

- **Units.**
  - Baseline nominal GDP = 100, so a flow of 1 is 1% of baseline annual GDP.
  - Flows are annual rates inside the engine. A monthly step moves `rate x dt`, with dt = 1/12.
  - Stocks use the same unit.
  - Rates are fractions per year. Prices are indices (baseline 1).
  - Speeds `lam*` are per year, with a mean lag of 1/lam years; `k(lam) = 1 - exp(-lam dt)`.
- **Baseline.** Zero inflation and zero real growth, so every stock and flow is constant. The inflation target is 0; Iceland's actual target is 2.5%, and only deviations are displayed.
- **Display.** Every series is a deviation from the steady state: `%` for levels (output, prices, money) or `pp` for rates and ratios. Series with the unit `% of GDP` are differences in % of baseline GDP.
- **Solution.** Most of each step is explicit, using lagged values: the key rate, rates, wages, prices, the krona, house prices, credit decisions, investment, exports and fiscal settings. Only the income-expenditure block is simultaneous: employment, wages, benefits, taxes, profits, dividends, disposable income, consumption, imports and GDP. That block is solved by Gauss-Seidel on (real GDP, nominal GDP, consumption) to a relative tolerance of 1e-10, usually in 3-6 iterations.
- **Accounting.** Every balance-sheet change is a *leg* (sector, instrument, amount, kind), with kind cash, accrual, revaluation or write-off.
  - Payments settle in deposits (households, firms, pension funds, rest of world), in the Treasury account at the central bank (government), or in reserves (bank to central bank).
  - Banks and the central bank pay by creating their own liabilities. That is how bank lending, and bond purchases by banks or the central bank, create money.
- **Checks asserted every step** (the run throws above 1e-9):
  - every transaction row sums to 0;
  - for each sector, change in financial net worth = saving + revaluations;
  - each instrument sums to 0 across holders, in both stocks and flows;
  - for each (sector, instrument), change in stock = cash + accrual + revaluation + write-off.

## 3. Sectors and instruments

Sectors (10 Godley columns):

| Id | Sector | Group |
|---|---|---|
| HY | Young households, 18-34 | Households |
| HW | Working-age households, 35-66 | Households |
| HO | Older households, 67+ | Households |
| FD | Domestic-market firms: retail, services, construction | Firms |
| FX | Exporters: fish, aluminium, tourism, other | Firms |
| B | Banks | Banks |
| CB | Central bank | Central bank |
| G | Government | Government |
| PF | Pension funds | Pension funds |
| W | Rest of world | Rest of world |

Children sit inside the household groups and receive family benefits. Colours are colour-blind safe, with one hue family per group and lightness steps for subgroups (`model.sectors`).

Instruments (13):
- deposits (liability of B);
- reserves (CB);
- the Treasury account (CB);
- non-indexed and CPI-indexed mortgages (HY/HW to B/PF);
- business loans (FD/FX to B);
- nominal floating-rate government bonds (held by B, CB, PF, HO, W);
- CPI-indexed government bonds (held by PF);
- bank bonds, i.e. covered bonds (B to PF);
- company shares at book value (FD/FX to households, PF, W; display only, as dividends follow payout shares);
- FX reserves (W to CB), valued at e;
- pension funds' foreign assets (W to PF), valued at e;
- pension rights (PF to HW/HO).

**Wages and pension contributions are never counted twice.** The gross wage bill `w N` is the wage before income tax and before the employee's pension contribution.
- The wage row pays households `(1 - cEe) w N`.
- Employers pay the employer contribution `cEr w N` on top, plus the employee part `cEe w N`, straight to pension funds (the `pencon` row; public employers pay inside their spending rows).
- Labour cost = `(1 + cEr + css) w N` in firms and `(1 + cEr) w N` in government.
- Contributions create pension rights for working-age members (the accrual row `penadj`). Payouts are cash to the old and use up their rights.
- Members' rights move from HW to HO as people retire. This is a reclassification, shown as an "other change", not a transaction.

## 4. Balance-sheet matrix (baseline, % of GDP; + asset, - liability)

<!-- BEGIN:bs -->
| Instrument | HY | HW | HO | FD | FX | B | CB | G | PF | W | Sum |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Bank deposits | 4.4 | 13.8 | 13.3 | 23.7 | 5.0 | -70.4 |  |  | 7.2 | 3.0 | 0 |
| Central bank reserves |  |  |  |  |  | 12.0 | -12.0 |  |  |  | 0 |
| Treasury account at the central bank |  |  |  |  |  |  | -5.0 | 5.0 |  |  | 0 |
| Mortgages, non-indexed | -4.6 | -16.0 |  |  |  | 16.4 |  |  | 4.2 |  | 0 |
| Mortgages, CPI-indexed | -8.6 | -29.7 |  |  |  | 26.3 |  |  | 12.0 |  | 0 |
| Business loans |  |  |  | -31.1 | -10.4 | 41.5 |  |  |  |  | 0 |
| Government bonds |  |  | 4.0 |  |  | 14.4 | 1.0 | -36.9 | 13.4 | 4.1 | 0 |
| Government bonds, CPI-indexed |  |  |  |  |  |  |  | -19.8 | 19.8 |  | 0 |
| Bank bonds |  |  |  |  |  | -27.8 |  |  | 27.8 |  | 0 |
| Company shares (book value) | 1.0 | 10.0 | 5.0 | -25.7 | -21.0 |  |  |  | 20.7 | 10.0 | 0 |
| Foreign-exchange reserves |  |  |  |  |  |  | 18.0 |  |  | -18.0 | 0 |
| Foreign assets of pension funds |  |  |  |  |  |  |  |  | 74.6 | -74.6 | 0 |
| Pension rights |  | 93.9 | 76.8 |  |  |  |  |  | -170.7 |  | 0 |
| **Net financial worth** | **-7.8** | **72.0** | **99.1** | **-33.2** | **-26.4** | **12.4** | **2.0** | **-51.7** | **9.0** | **-75.5** | **0** |
| Memo: homes (non-financial) | 35.2 | 120.1 | 44.6 |  |  |  |  |  |  |  | |
<!-- END:bs -->

The balance sheets are closed by residuals:
- **Domestic-market firms' deposits** give broad money (M3) = 67.4% of GDP (data).
- **Bank bonds held by pension funds** close the bank balance sheet: loans + bonds + reserves = deposits + bank bonds + equity. In reality part of this funding is foreign-currency bonds held abroad.
- **Banks' government bonds** hold whatever government debt the other holders don't.
- **Pension funds' domestic shares** make pension assets 179.7% of GDP (data).
- **Central bank reserves** close the central bank's balance sheet.
- **Bank equity** = 22% x risk-weighted assets.

Iceland's net foreign position here (+75% of GDP) is higher than the actual one. Banks' and firms' foreign-currency debt and inward direct investment beyond the smelters are not modelled.

## 5. Transactions-flow matrix (baseline, % of GDP per year)

Each row sums to 0. Signs: + receives, - pays. For financial rows, + means the sector receives cash: it borrows or sells an asset. Accrual rows move no money. Their capitalisation into the loan, bond or pension-right principal is the flow-of-funds mirror, and it is not shown as a separate row. Deposit, reserve and Treasury-account changes, i.e. the money itself, are the settlement of every row, and `flows()` leaves them out. Each sector's column of saving rows (current + capital) equals its net lending; with the financial rows and deposit changes, every column sums to 0.

<!-- BEGIN:tx -->
| Row | kind | HY | HW | HO | FD | FX | B | CB | G | PF | W | Sum |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Household consumption (`cons`) | cash | -8.27 | -27.21 | -16.13 | 51.61 |  |  |  |  |  |  | 0 |
| VAT and taxes on goods (`vat`) | cash |  |  |  | -12.01 |  |  |  | 12.01 |  |  | 0 |
| Public health services (`g_health`) | cash | 1.17 | 2.73 | 0.13 | 3.86 |  |  |  | -8.58 | 0.68 |  | 0 |
| Public education (`g_edu`) | cash | 1.22 | 2.85 | 0.14 | 2.11 |  |  |  | -7.03 | 0.71 |  | 0 |
| Other public services (`g_other`) | cash | 1.18 | 2.76 | 0.13 | 9.16 |  |  |  | -13.92 | 0.69 |  | 0 |
| Public investment (`g_inv`) | cash |  |  |  | 4.18 |  |  |  | -4.18 |  |  | 0 |
| Business investment (`inv`) | cash |  |  |  | 3.00 | -3.00 |  |  |  |  |  | 0 |
| Exporters' domestic inputs (`inputs`) | cash |  |  |  | 15.98 | -15.98 |  |  |  |  |  | 0 |
| Exports (`exports`) | cash |  |  |  |  | 40.42 |  |  |  |  | -40.42 | 0 |
| Imports (`imports`) | cash |  |  |  | -30.26 | -11.48 |  |  |  |  | 41.74 | 0 |
| Wages (private sector) (`wages`) | cash | 9.09 | 21.20 | 1.03 | -25.08 | -6.24 |  |  |  |  |  | 0 |
| Pension contributions (private employers) (`pencon`) | cash |  |  |  | -4.25 | -1.06 |  |  |  | 5.30 |  | 0 |
| Payroll tax (`paytax`) | cash |  |  |  | -1.67 | -0.42 |  |  | 2.09 |  |  | 0 |
| Personal income tax (`inctax`) | cash | -5.72 | -12.36 | -6.80 |  |  |  |  | 24.88 |  |  | 0 |
| Corporate income tax (`corptax`) | cash |  |  |  | -2.56 | -0.43 |  |  | 2.99 |  |  | 0 |
| Old-age and disability transfers (`ben_oa`) | cash | 0.25 | 0.83 | 2.48 |  |  |  |  | -3.56 |  |  | 0 |
| Family and housing benefits (`ben_fam`) | cash | 1.63 | 1.33 |  |  |  |  |  | -2.96 |  |  | 0 |
| Unemployment benefits (`ben_ue`) | cash | 0.32 | 0.44 |  |  |  |  |  | -0.76 |  |  | 0 |
| Pension payouts (`penpay`) | cash |  |  | 13.74 |  |  |  |  |  | -13.74 |  | 0 |
| Interest on deposits (`int_dep`) | cash | 0.09 | 0.28 | 0.27 | 0.47 | 0.10 | -1.41 |  |  | 0.14 | 0.06 | 0 |
| Interest on reserves (`int_res`) | cash |  |  |  |  |  | 0.36 | -0.36 |  |  |  | 0 |
| Mortgage interest (cash) (`int_mort`) | cash | -0.40 | -1.38 |  |  |  | 1.32 |  |  | 0.47 |  | 0 |
| Interest on business loans (`int_loan`) | cash |  |  |  | -1.71 | -0.57 | 2.28 |  |  |  |  | 0 |
| Interest on government bonds (`int_bond`) | cash |  |  | 0.14 |  |  | 0.50 |  | -1.29 | 0.47 | 0.14 | 0 |
| Real coupon on indexed bonds (`int_bondI`) | cash |  |  |  |  |  |  |  | -0.40 | 0.40 |  | 0 |
| Interest on bank bonds (`int_bbond`) | cash |  |  |  |  |  | -1.11 |  |  | 1.11 |  | 0 |
| Income on FX reserves (`int_fxr`) | cash |  |  |  |  |  |  | 0.36 |  |  | -0.36 | 0 |
| Income on pension funds' foreign assets (`int_fa`) | cash |  |  |  |  |  |  |  |  | 1.49 | -1.49 | 0 |
| Dividends and owners' income (`div`) | cash | 0.64 | 9.54 | 2.66 | -12.83 | -1.35 | -1.94 |  | 0.68 | 2.27 | 0.33 | 0 |
| Central bank profit to government (`cbrem`) | cash |  |  |  |  |  |  |  |  |  |  | 0 |
| Pension rights: earned minus used (accrued) (`penadj`) | accrual |  | 7.39 | -13.74 |  |  |  |  |  | 6.35 |  | 0 |
| Returns credited to pension rights (`penret`) | accrual |  | 3.49 | 2.86 |  |  |  |  |  | -6.35 |  | 0 |
| Purchases of existing homes (`homes`) | cash, cap. | -1.20 | -1.00 | 2.20 |  |  |  |  |  |  |  | 0 |
| New mortgages (`mort_new`) | cash, fin. | 0.53 | 1.83 |  |  |  | -1.71 |  |  | -0.64 |  | 0 |
| Mortgage repayments (`mort_rep`) | cash, fin. | -0.53 | -1.83 |  |  |  | 1.71 |  |  | 0.64 |  | 0 |
| Retirement: rights move to pensioners (`ageing`) | reval, other |  | -10.88 | 10.88 |  |  |  |  |  |  |  | 0 |

Rows with no baseline flow (they move only after a shock): `idx_mort`, `idx_bond`, `loans`, `bond_iss`, `bond_trade`, `bbond`, `fa_buy`, `rev_fxr`, `rev_fa`
<!-- END:tx -->

## 6. Equations (one determining equation per endogenous variable)

Subscript -1 means the previous step. `gap = y-1/y0 - 1`. Tags match the `[En]` comments in `src/50_behaviour.js`. Published whole-model responses are **checks** (section 7.3), never equations.

| # | Equation | Category |
|---|---|---|
| E1 | Rule rate `iS += k(lamPol)[i0 + aPi(pi_e - piT) + aPiA(pi12 - piT) + aY gap - iS]` | POLICY |
| E2 | Key rate `i = iS + add-on` (rule; rule + add-on) or `i = fixed` (fixed mode) | POLICY |
| E3 | Floor `i >= 0` | POLICY |
| E4 | Loan premium `prem = sCap max(0, kapT - kap-1)/(kapT - kapMin)`; `kap = E_B/RWA` (IDENTITY) | BEHAVIOUR |
| E5 | `i_d = i - mD`, `i_b = i + sB`, `i_l = i + sL + prem`, `i_mN = i + sMN + prem`, `r_mI = rMI0 + psiIdx(i - i0) + prem`, `i_bb = i + sBB`; indexed-bond coupon `rBI0` | BEHAVIOUR / CONTRACT |
| E6 | Wages `ln w += [pi_e + phiU(u* - u-1) - phiW ln(w/p_d)] dt + settlement` (Phillips curve + main-course error correction) | BEHAVIOUR |
| E7 | Krona sentiment `s = s-1 exp(-lamSent dt) + shock` | BEHAVIOUR |
| E8 | `ln e* = ln(p_d/p_f) + s - betaI[(i - i0) - (i_f - i_f0)] + betaH ln[(D_W + B_W)/(p_d H_W0)]`; `ln e += k(lamFX)(ln e* - ln e)` (PPP anchor, carry, portfolio balance) | BEHAVIOUR |
| E9 | Import prices `p_m += k(lamPm)(e p_f - p_m)` | BEHAVIOUR |
| E10 | Unit cost `uc += k(lamUC)(aLab w + (1 - aLab) p_m - uc)`; domestic prices `p_d += k(lamP)(uc (1 + eta gap) - p_d)` | BEHAVIOUR |
| E11 | Real house price `ln q* = betaHY ln(yd_H-1/yd_H0) + betaHC NL-1/Y0 - betaHR(r_m-1 - r_m0)`, `ln q += k(lamH)(ln q* - ln q)`; `p_h = q P-1`; CPI housing `p_hc += k(lamHC)(p_h - p_hc)` | BEHAVIOUR |
| E12 | CPI `P = (1+v)/(1+v0)(omD p_d + omM p_m) + omH p_hc`; real exchange rate seen by trade `q_s += k(lamRer)(e p_f/p_d - q_s)` | IDENTITY / BEHAVIOUR |
| E13 | Indexation `IDX = (indexed mortgages, indexed bonds) x (P/P-1 - 1)`, accrued and capitalised (no cash) | CONTRACT |
| E14 | Revaluation `REV = (FX reserves, PF foreign assets) x (e/e-1 - 1)` | IDENTITY |
| E15 | Desired mortgage debt `M*_g = mR_g Inc_g-1 [1 - betaM(r_m - r_m0)] q^betaMH`, `r_m = theta r_mI + (1-theta)(i_mN - pi_e)` | BEHAVIOUR |
| E16 | Repayment `REP_g = M_g / Tm` | CONTRACT |
| E17 | Desired lending `DES_g = REP_g + lamM(M*_g - M_g) + lending appetite x share_g` | BEHAVIOUR |
| E18 | DSTI cap `CAP_g = nu_g Inc_g DSTI_g / A`, `A = theta ann(max(r_mI, 3%), 25) + (1-theta) ann(max(i_mN, 5.5%), 40)` (Rules 1300/2025; 40% young, 35% others) | POLICY |
| E19 | LTV cap (optional) `CAPL_g = REP_g + max(0, LTV_g p_h H_g - M_g)` | POLICY |
| E20 | `DISB_g = max(0, min(DES, CAP, CAPL))`; binding constraint reported per group; theta indexed; lenders by pension-fund share | IDENTITY |
| E21 | Investment `I_j += k(lamInv)(I_j0[1 + betaPi(Pi_j/Pi_j0 - 1) - betaRI(r_l - r_l0) + betaU gap] - I_j)`; `betaU` for FD only | BEHAVIOUR |
| E22 | Exports `x_k = X_k0 fdem (tour) q_s^eps_k`; fish and aluminium priced `e p_f`, tourism and other priced `p_d`; exporters' inputs `muX x` imported, `muXD x` bought from FD | BEHAVIOUR |
| E23 | Spending channels `g_s = g_s0 + lever`; public employment `N_G = ws g_s/(1+cEr)`; transfers `P x (tr + lever)`; unemployment benefit rate `rr` | POLICY |
| E24 | Income-tax rate `tau = tau0 + lever + tauR`, `tauR += k(lamTau)(switch x phiTau(b-1 - b0) - tauR)` (debt-tied rule, slow) | POLICY |
| E25 | Bank profit (interest income + indexation - deposit and bank-bond interest); dividends `= smoothed profit - lamEq(kapT RWA - E_B)` | IDENTITY / BEHAVIOUR |
| E26 | Central bank profit `i_b B_CB + iFXR FXR - i R`, remitted to government | IDENTITY / POLICY |
| E27 | Pensions: payouts `payout x E_O`; credited returns `smoothed income + lamPFnw(NW_PF - nw* A_PF)`; retirement `ageing x E_W` | CONTRACT / BEHAVIOUR |
| E28 | Sector employment `N_j += k(lamN)(N_j0 (va_j/va_j0)^okun (w/p_d)^-sigW - N_j)`; `va_FD = y - va_FX - va_G` | BEHAVIOUR |
| E29 | Employment by age `N_g = N_g0 + c_g(N - N0)` (young swing 1.8x); labour force `LF_g = LF_g0 + mig(emp_g - emp_g0)`; `u_g = 1 - emp_g/LF_g` | BEHAVIOUR |
| E30 | Wages by sector and group, contributions `(cEr + cEe) w N`, payroll tax `css w N_priv`, unemployment benefits `rr w wb_g U_g` | IDENTITY |
| E31 | Profits `Pi_FD = C - VAT + p_d(g_P + inv + x_d) - IM_FD - LC_FD - i_l L_FD + i_d D_FD`; `Pi_FX = X - p_m im_X - p_d x_d - LC_FX - i_l L_FX + i_d D_FX` | IDENTITY |
| E32 | Corporate tax `tauF x Pi` | POLICY |
| E33 | Retention `rho_j = rho_j0 + rhoL(L_j/Y - l_j0)`; distributed `(1-rho)(1-tauF)Pi`, split by payout shares | BEHAVIOUR |
| E34 | Household income: taxable = wages + benefits + pensions; `YDL = taxable (1 - tau) - mortgage interest`; `YDK = interest + dividends` | IDENTITY |
| E35 | Target spending `C*_g = [aL_g(YDL_g + home sales - purchases) + aK(YDK_g - pi_e LW_g)](1 - betaC rgap) + c0_g P + aW_g(LW_g - P LW0_g) + aNL NL_g + aH_g H_g(q - 1)P` | BEHAVIOUR |
| E36 | Consumption habit `C_g += k(lamC)(C*_g - C_g)` | BEHAVIOUR |
| E37 | VAT `v/(1+v) C` | POLICY |
| E38 | Real consumption `c = C/P` | IDENTITY |
| E39 | Imports by component: consumer `muC c`, inputs `muD(c + inv + x_d)`, equipment `muI inv`, public purchases `muG g_P` (all x `q_s^-epsM`), exporters' inputs `muX x` | BEHAVIOUR |
| E40 | `y = c + sum g_s + inv + x - im`; `Y = C + G_nom + p_d inv + X - p_m im` | IDENTITY |
| E41 | Firm loans `dL_j = d_j Y - D_j` (after this month's flows: the firm budget constraint) | IDENTITY |
| E42 | Bond issuance = cash deficit (keeps the Treasury account at target), split among banks, central bank, pension funds and older households (lever) | IDENTITY / POLICY |
| E43 | Pension funds: foreign `dFA = k(lamFA)(phi A - FA)` with `phi` = target + lever; bank bonds toward a share of assets | BEHAVIOUR |
| E44 | Non-resident carry `dB_W = k(lamBW)(bW Y[1 + psiB((i - i0) - (i_f - i_f0))] - B_W)` bought from banks; pension-fund liquidity (bonds vs deposits); older households' bond share | BEHAVIOUR |
| E45 | Deposits, reserves, Treasury account: settlement buffers from each budget constraint | IDENTITY |
| E46 | **Broad money** = deposits of HY + HW + HO + FD + FX + PF: no money formula, it emerges from the ledger. Credit impulse `CI = NL_t - NL_t-12` (net new mortgage lending, annual rate; total adds firm borrowing) | IDENTITY |
| E47 | Expectations `pi_a += k(lamPia)(ln(P/P-1)/dt - pi_a)`, `pi_e = chi piT + (1 - chi) pi_a`; `pi12 = P/P-12 - 1` | BEHAVIOUR / IDENTITY |
| E48 | Smoothed profits (investors), bank profit (dividends), fund income (credited returns) | BEHAVIOUR |

v0's three stabilisers are kept:
- the debt-tied tax rule (E24, now phased in slowly and switchable);
- a low MPC out of interest and dividends (`aK = 0.2`, E35);
- long-run PPP for the krona (E8: homogeneous in `p_d/p_f`).

## 7. Calibration

### 7.1 Parameters

All parameters, with metadata, are in `engine/src/10_params.js`; `model.params` returns them at run time with solved values filled in. They break down as follows (see appendix A):
- **data** values are read from `data/calibration.json`, with the source cited;
- **assumed** values are marked as such;
- **placeholder** values are used where data is still missing; they are flagged in the basis and counted in test section 1;
- **calibrated to target** values are either solved by the steady state or tuned against the calibration checks.

Data used includes:
- the age groups' shares of population, employment, unemployment, wages, deposits and mortgage debt;
- COFOG and economic-type spending;
- tax revenues;
- the export split;
- export value added and employment;
- pension contributions, assets, foreign share and mortgage share;
- CPI weights;
- M3;
- the indexed mortgage share;
- import content (TiVA);
- pension funds' share of government bonds;
- the public old-age pension;
- home ownership rates.

### 7.2 Steady-state method (`src/40_steady.js`)

1. **Targets from data** fix:
   - public spending by channel;
   - compensation of employees (private and public);
   - exporters' employment share and value added;
   - exports by type;
   - transfers;
   - VAT, corporate and payroll revenue;
   - pension contributions;
   - balance sheets.

   The residuals of section 4 close the balance sheets.
2. **Each sector's zero net lending is solved for one balancing parameter**, because in a stationary state every stock is constant:
   - government balance gives the income-tax rate `tau0`. This rate also stands in for other taxes on households and non-tax revenue.
   - FD and FX: retained profit = investment gives the retention ratios.
   - HY, HW and HO: the cash budget gives consumption, which gives the autonomous spending terms `c0_g`.
   - Rest of world: the current account = 0 gives imports, which gives the input-import share `muD`.
   - Pension funds: rights stocks constant give the payout rate and the retirement (ageing) rate. Returns credited = fund income.
   - Banks and the central bank pay out their profit.
   - Exporters' domestic inputs `muXD` come from exporters' value added; the effective corporate rate `tauF` from corporate revenue; the replacement rate from unemployment spending; the employee contribution from contributions.
3. **Behavioural normalisers** are set to baseline quantities: desired mortgage ratios, the DSTI cohort share (baseline lending = 60% of the cap), deposit targets, portfolio shares, and baseline profits for investment.
4. **Check, not imposed:** `C + G + I + X - IM - 100` comes out at about 1e-14. Firms' profit is computed from the income side with Y = 100, so this identity only holds if every formula agrees with the ledger.
5. **No drift:** a 240-month run with no shock stays within about 3e-12 of the steady state in every series and balance-sheet entry (test section 2).

### 7.3 Calibration checks (targets vs results)

The behavioural parameters were iterated against these whole-model responses using `tools/calibrate.js`, which grid-searches and ranks by the smallest margin inside every band. The responses are **checks**: none of them is an equation in the model. All pass, and the smallest margin is 0.12 of a band's width.

<!-- BEGIN:calib -->
| Scenario | Target | Result | Verdict |
|---|---|---|---|
| Key rate +1 pp for 8 quarters | output trough, % -0.6 to -0.25 | -0.33 | PASS |
| Key rate +1 pp for 8 quarters | output trough timing, quarter 4 to 7 | q6 (month 16) | PASS |
| Key rate +1 pp for 8 quarters | annual inflation trough, pp -0.35 to -0.1 | -0.31 | PASS |
| Key rate +1 pp for 8 quarters | inflation trough timing, quarter 5 to 9 | q6 (month 16) | PASS |
| Key rate +1 pp for 8 quarters | krona appreciation (peak, first 8 quarters), % 0.3 to 1.5 | +0.44 | PASS |
| Wages +10% one-off | inflation peak, pp 1.5 to 3.5 | +1.95 | PASS |
| Wages +10% one-off | inflation peak timing, quarter 4 to 8 | q5 (month 14) | PASS |
| Wages +10% one-off | key-rate peak, pp 0.8 to 2 | +1.31 | PASS |
| Wages +10% one-off | unemployment peak, pp 0.3 to 1.2 | +0.42 | PASS |
| Wages +10% one-off | price level after 6 years, % 3 to 8 | +3.25 | PASS |
| Wages +10% one-off | output at year 6 / peak deviation 0 to 0.25 | 19% of peak -0.64 | PASS |
| Wages +10% one-off | unemployment at year 6 / peak deviation 0 to 0.25 | 17% of peak +0.42 | PASS |
| Wages +10% one-off | real wage at year 6 / peak deviation 0 to 0.25 | 3% of peak +9.94 | PASS |
| Wages +10% one-off | consumption at year 6 / peak deviation 0 to 0.25 | 4% of peak +0.98 | PASS |
| Govt purchases +1% of GDP | output, year-1 average, % 0.3 to 0.8 | +0.72 | PASS |
| Govt purchases +1% of GDP | broad money, bank- minus PF-financed, pp (min of m12, m24) >= 0.5 | +1.14 (banks +2.89% vs PF +0.84% at m24) | PASS |
| Krona -10% sentiment | price level at 8 quarters, % 1.5 to 3 | +1.62 | PASS |
| Lending +1% of GDP for 12 months | credit impulse, months 1-12 (minimum), pp >= 0.2 | +0.86 | PASS |
| Lending +1% of GDP for 12 months | credit impulse, months 13-24 (maximum), pp <= -0.2 | -1.08 | PASS |
| Lending +1% held constant | largest absolute credit impulse, months 18-48, pp 0 to 0.3 | +0.23 | PASS |
<!-- END:calib -->

Notes on the calibration:
- The v0 miscalibration came from full, fast wage-to-price pass-through and an exchange-rate channel that was too strong. v1 fixes it with these behavioural choices, each one equation per variable:
  - cost-plus pricing on a smoothed unit cost, with labour's share of domestic unit cost at 0.55 (E10);
  - a main-course error-correction term in wages (E6), so real wages return;
  - a real-product-wage elasticity of staffing (E28), so a wage settlement costs jobs directly;
  - a consumption habit (E36) and an investment planning lag (E21), which put the rate-shock trough at 4-7 quarters;
  - the output gap weight in the rule raised to 0.6 and a weight of 0.3 on actual inflation;
  - a slowly fading krona sentiment shock (10% a year), which gives the 8-quarter pass-through.
- The fiscal check uses "other public services" +1% of GDP (34% wages, 66% purchases). The year-1 multiplier (about 0.7) depends on the placeholder import share of public purchases (`muG` = 0.4). With `muG` = 0.3 the multiplier is about 0.8.
- The rate-shock output and inflation troughs are flat between quarters 4 and 8. The trough quarter is therefore sensitive to small parameter changes, even though its size is not.
- No target was unreachable. The wage-shock "back to 25% of peak" check needed the wage error correction (E6). Without it, real wages stay about 4% high after 6 years and output about 1% low. This is a behavioural choice from the Nordic main-course wage model, not an added equation.

### 7.4 Key results for the UI (see `engine/test_output.txt`)

**Combined policy**: wages +10%, then from month 3 a key-rate add-on of +1 pp for 24 months, against wages alone.

| Measure | Wages alone | Wages + rate |
|---|---|---|
| Inflation peak | +1.95 pp | +1.67 pp |
| Price level after 6 years | +3.25% | +2.88% |
| Output trough | -0.64% | -0.96% |
| Unemployment peak | +0.42 pp | +0.53 pp |
| Young unemployment peak | +0.64 pp | +0.80 pp |
| Key-rate peak | +1.31 pp | +1.97 pp |
| Cumulative output over 6 years | -1.65%-years | -2.32%-years |
| Cumulative inflation | 3.23 pp-years | 2.85 pp-years |

The user buys about 0.4 pp-years less inflation with 0.7%-years of lost output, and young workers bear the largest share of the unemployment.

**Distribution.**
- Key rate +1 pp: real disposable income falls 0.4% for the young and 0.7% for working age, who carry the mortgage debt, and rises 1.1% for the old, who are savers.
- Wage shock: young incomes rise 6.4% at first, while the old lose about 1% as prices rise ahead of pensions.

## 8. Browser API as implemented

`IcelandInc.createModel(opts?)`, with `opts = {substeps: steps per month (default 1), params: {id: value} overrides, tol}`.
- `model.reset()`; `model.step(n = 1)` advances n months; `model.t` is months since start.
- `model.levers`: `[{id, group: 'Policy'|'Economy'|'World', label, unit, min, max, step, value, baseline, kind: 'setting'|'oneoff', description, options?}]`. There are 25 levers:
  - key-rate mode, add-on and fixed level;
  - income tax and VAT;
  - health, education, other services and public investment;
  - old-age and family transfers;
  - the unemployment-benefit rate;
  - the debt-tied tax rule switch;
  - who buys new bonds;
  - the DSTI and LTV caps;
  - the wage settlement (one-off);
  - bank lending appetite;
  - the pension-fund foreign allocation;
  - the migration buffer;
  - foreign demand and tourism;
  - the krona shock (one-off);
  - the foreign interest rate;
  - world prices.
- `model.setLever(id, value)` for settings. `model.fire(id)` applies a one-off at its `value`, which is its size. Changes apply from the current month and are logged in `model.events` as `[{t, id, label}]`.
- `model.sectors`: `[{id, label, group, color}]`. `model.seriesMeta`: `[{id, label, unit, group, description}]`, with 34 series. `model.series(id)` returns `[{t, v}]` deviations for up to 600 months plus the current point; `model.value(id)` returns the current deviation.
- `model.flows()`: `[{row, rowLabel, channel?, kind, type, entries, baselineEntries}]` in % of baseline GDP at annual rates. Every row sums to 0.
- `model.pairFlows()`: `[{from, to, kind, value, baseline, rows}]` (method below).
- `model.balanceSheet(id)`: `{assets, liabilities, netWorth, netWorthBaseline}` in % of baseline GDP. Households also get `memo` (homes).
- `model.explain(rowOrSeriesId)`: `{title, what, rule, category, params: [{id, value, unit, basis}], source}`. Numbers in `rule` are filled from the live parameters.
- `model.checks()`: `{last, max, solverIterations, gdpCheck}`.
- `model.feedRules`: `[{id, series, above|below, message}]`, for example "The central bank raises its key rate", "Banks lend less, so less new money is created", "Unemployment among young people rises".

**Pair-flow method.** The ledger records every posting as an exact payer-to-payee amount.
- Where one economic flow has several payers or payees, the engine splits it proportionally when posting:
  - wages to age groups in proportion to each group's employment;
  - mortgage interest and repayments to banks and pension funds in proportion to their holdings of that loan type;
  - dividends by fixed payout shares;
  - deposit and bond interest by each holder's stock.
- Pipes are aggregated by (from, to, kind) over the month.
- Self-payments (domestic firms' own investment) are dropped.
- Opposite directions stay as separate pipes; they are not netted.
- For every sector, pipes in minus pipes out equals the sum of its row entries (tested to 1e-15).

**Additions and deviations from the requested contract:**
- Extra fields and methods:
  - `options` on the mode, switch and choice levers;
  - `type` on flow rows;
  - an optional size argument in `fire(id, size)`;
  - `model.credit()`: desired lending, DSTI and LTV caps, and the binding constraint per borrower group;
  - `model.steadyState()`;
  - `model.params`, `model.instruments`, and `model._state()` for tests.
- Calling `setLever` on a one-off lever sets its size without logging an event; the event is logged when it is fired.
- `flows()` leaves out the settlement rows (changes in deposits, reserves and the Treasury account, i.e. the money itself). It also leaves out the capitalisation mirror of accrual rows, since both are implied.

Performance: about 30 microseconds per month in Node/V8, against a browser budget of 3 ms. The bundle loads with `new Function` in a bare JavaScript realm (test section 0).

## 9. Limitations and next steps

- **Stationary pensions.** In a zero-growth steady state a funded system pays out contributions plus returns. Baseline pension payouts are therefore about 14% of GDP, against 6.3% today, and older households' baseline income and spending are too high. The system is really still maturing and the economy grows. A growth-adjusted (detrended) steady state would fix this.
- **Taxes.** The income-tax rate (38%) also stands in for property taxes, other taxes and non-tax revenue. The effective corporate rate (9%) applies to gross profits.
- **Owners' income.** "Dividends" include owners' and self-employed income, which is why domestic firms pay out about 13% of GDP.
- **Housing.** The housing stock is fixed. There is no residential investment by households (construction sits in firms' investment), no rents between households, and no house-price revaluation of net worth (homes are a memo item). Homes change hands between generations at a fixed real rate.
- **Money and debt stock-flow.**
  - Bank bonds are all held by pension funds and are in krona.
  - There is no foreign-currency debt, no bank operating costs and no loan losses. Write-offs are supported by the ledger but unused.
  - Government bonds are floating-rate, so there are no bond-price revaluations.
- **Supply.** Output follows demand; capacity pressure moves prices, not output. There is no capital-driven potential output and no productivity growth. After a permanent public-spending cut, unemployment returns to normal only slowly, through prices and policy.
- **Krona.** The krona is a reduced-form portfolio-balance equation with PPP homogeneity; there is no explicit interest parity. The central bank does not intervene.
- **Numerics.** One-step lags make results depend on the step length at O(dt). Halving the step roughly halves the difference, which is at most about 0.08 pp in the krona after a wage shock (test section 8).
- **Placeholders.** 29 placeholder parameters remain, flagged in `model.params`. Among them are several balance-sheet holdings, investment levels, the import share of public purchases, housing values and turnover, and pension-fund liquidity and surplus. The research data is still being completed. Rebuild and rerun the tests after each data update.
- **Next steps:**
  - a detrended growth steady state (it fixes the pension distortion);
  - rents between households;
  - bank credit losses and foreign-currency funding;
  - fixed-rate long bonds with revaluation;
  - capital-driven potential output;
  - checks against Central Bank of Iceland QMM impulse responses as they are published;
  - a per-lever "what to watch" script for the UI feed.

## Appendix A. Parameters (generated from the built bundle)

<!-- BEGIN:params -->
| id | value | unit | category | basis | description |
|---|---:|---|---|---|---|
| `Y0` | 100 | % of baseline GDP | IDENTITY | assumed | Baseline annual nominal GDP. Every stock and flow is measured in % of this. |
| `gHealth` | 8.58 | % of GDP | POLICY | data: Hagstofa THJ05142 (General government total expenditure by functions, % of GDP) [government_cofog_pct_gdp.health, 2025] | Health spending (public wages + purchases). |
| `gEdu` | 7.03 | % of GDP | POLICY | data: Hagstofa THJ05142 (General government total expenditure by functions, % of GDP) [government_cofog_pct_gdp.education, 2025] | Education spending (public wages + purchases). |
| `gOther` | 13.92 | % of GDP | POLICY | data: derived = COFOG total - interest - social benefits - investment - health - education (THJ05142/THJ05143, 2025) | Other public services (administration, police, culture, roads upkeep, subsidies ...). |
| `gInv` | 4.18 | % of GDP | POLICY | data: Hagstofa THJ05143 (General government total expenditure by economic type, % of GDP) [government_economic_pct_gdp.gross_fixed_capital_formation, 2025] | Public investment, bought from domestic firms. |
| `wsHealth` | 0.55 | share | POLICY | assumed | Share of health spending that is public wages (incl. employer pension contribution). |
| `wsEdu` | 0.7 | share | POLICY | assumed | Share of education spending that is public wages. |
| `compG` | 14.4 | % of GDP | IDENTITY | data: Hagstofa THJ05143 (General government total expenditure by economic type, % of GDP) [government_economic_pct_gdp.compensation_of_employees, 2025] | Public compensation of employees; fixes the wage share of other services. |
| `trOA` | 3.56 | % of GDP | POLICY | data: derived = social benefits - unemployment - family - housing (THJ05143/THJ05142, 2025) | Old-age and disability cash transfers (Social Insurance, TR). |
| `oaShareO` | 0.6966 | share | POLICY | data: Tryggingastofnun (TR) annual report 2025, via Stjornarradid news 13 May 2026 (stjornarradid.is/.../Arsskyrsla-TR-86.000-einstaklingar...) [pensions.public_old_age_pension_pct_gdp, 2025] / old-age and disability transfers | Share of old-age and disability transfers paid to the old (67+): the public old-age pension. |
| `oaShareY` | 0.07 | share | POLICY | assumed | Share of old-age and disability transfers (disability) paid to the young; the rest goes to working age. |
| `trFam` | 2.96 | % of GDP | POLICY | data: COFOG family & children + housing (THJ05142, 2025) | Family, parental-leave and housing benefits. |
| `famShareY` | 0.55 | share | POLICY | assumed | Share of family and housing benefits paid to the young (parental leave, rent support). |
| `ueTarget` | 0.76 | % of GDP | POLICY | data: Hagstofa THJ05142 (General government total expenditure by functions, % of GDP) group 1050 [government_cofog_pct_gdp.social_protection_breakdown.unemployment, 2025] | Baseline unemployment benefits; fixes the replacement rate. |
| `vatTarget` | 12.01 | % of GDP | POLICY | data: Hagstofa THJ05132 (General government revenue, % of GDP) [tax_revenue_pct_gdp.vat_and_taxes_on_goods, 2025] | Baseline VAT and taxes on goods; fixes the effective VAT rate on consumption. |
| `citTarget` | 2.99 | % of GDP | POLICY | data: Hagstofa THJ05132 (General government revenue, % of GDP) [tax_revenue_pct_gdp.corporate_income_tax, 2025] | Baseline corporate income tax revenue; fixes the effective tax rate on gross profits. |
| `css` | 0.0635 | rate | POLICY | assumed (statutory social security tax, tryggingagjald) | Payroll tax on private wages. |
| `phiTau` | 0.25 | rate per unit debt/GDP | POLICY | assumed | Debt-tied tax rule: income-tax rate rises 0.25 pp per pp of debt/GDP above baseline. |
| `lamTau` | 0.5 | 1/yr | POLICY | assumed | Speed at which the debt-tied tax rule is phased in (slow stabiliser). |
| `cEr` | 0.115 | share of gross wage | CONTRACT | assumed (legal minimum employer contribution 11.5%) | Employer pension contribution, on top of the gross wage. |
| `conTarget` | 7.39 | % of GDP | CONTRACT | data: mutual-insurance contributions 365.2 bn (Landssamtok lifeyrissjoda, 2025); data: Landssamtok lifeyrissjoda, Hagtolur lifeyrissjoda workbook (lifeyrismal.is/static/files/Hagtolur/hagtolur-a-vefinn-2026_6a.xlsx), compiled from CBI (FME) data, sheet 2.7 [pensions.pf_contributions_pct_gdp, 2025] total incl. personal pensions 9.69 | Baseline pension contributions (mutual schemes); fixes the employee contribution rate. |
| `pfAssets` | 179.7 | % of GDP | IDENTITY | data: Landssamtok lifeyrissjoda, Hagtolur lifeyrissjoda workbook (lifeyrismal.is/static/files/Hagtolur/hagtolur-a-vefinn-2026_6a.xlsx), compiled from CBI (FME) data, sheet 1.3 (end-2025 portfolio) [pensions.pf_assets_pct_gdp, 2025] | Pension fund total assets. |
| `pfForeignShare` | 41.5 | % of PF assets | IDENTITY | data: Landssamtok lifeyrissjoda, Hagtolur lifeyrissjoda workbook (lifeyrismal.is/static/files/Hagtolur/hagtolur-a-vefinn-2026_6a.xlsx), compiled from CBI (FME) data, sheet 1.3 [pensions.pf_foreign_asset_share, 2025] | Foreign share of pension fund assets. |
| `pfDepShare` | 0.04 | share of PF assets | BEHAVIOUR | placeholder | Pension funds' deposit (liquidity) share. |
| `pfNWshare` | 0.05 | share of PF assets | IDENTITY | placeholder | Pension funds' surplus (assets above accrued rights). |
| `eShareW` | 0.55 | share | IDENTITY | placeholder | Share of pension rights held by working-age members (rest: pensioners). |
| `compTotal` | 53.11 | % of GDP | IDENTITY | data: compensation of employees 2,624.4 bn (Hagstofa THJ08420, 2025) | Total compensation of employees (wages + employer contributions + payroll tax). |
| `fxEmpShare` | 0.143 | share | IDENTITY | data: Hagstofa VIN10022 (register employment by activity, 2025 avg) + SAM08010 (TSA employed persons) [export_sector.employment_share, 2025] | Exporters' share of employment (and of the private+public wage bill). |
| `popY` | 96.71 | thousand persons | IDENTITY | data: Hagstofa MAN00101 (Population by sex and age, 1 January) [population.age_18_34, 2026] | Population of the age group. |
| `erY` | 0.835 | share of population | IDENTITY | data: Eurostat lfsa_pganws (LFS population by labour status, Iceland, thousands; data supplied by Hagstofa) [households.young_18_34.employment_rate, 2025] | Employment rate of the age group. |
| `u0Y` | 0.058 | share of labour force | IDENTITY | data: Eurostat lfsa_pganws (LFS population by labour status, Iceland, thousands; data supplied by Hagstofa) [households.young_18_34.unemployment_rate, 2025] | Baseline unemployment rate of the age group. |
| `wshY` | 0.2901 | share of wage bill | IDENTITY | data: Hagstofa TEK02011 (All taxable payments by sex and age, monthly withholding-tax data, summed Jan-Dec 2025) [households.young_18_34.share_of_total_wage_income, 2025] (renormalised to exclude under-18s) | Age group's share of the wage bill. |
| `popW` | 157.3 | thousand persons | IDENTITY | data: Hagstofa MAN00101 (Population by sex and age, 1 January) [population.age_35_66, 2026] | Population of the age group. |
| `erW` | 0.837 | share of population | IDENTITY | data: Eurostat lfsa_pganws (LFS population by labour status, Iceland, thousands; data supplied by Hagstofa) [households.working_35_66.employment_rate, 2025] | Employment rate of the age group. |
| `u0W` | 0.035 | share of labour force | IDENTITY | data: Eurostat lfsa_pganws (LFS population by labour status, Iceland, thousands; data supplied by Hagstofa) [households.working_35_66.unemployment_rate, 2025] | Baseline unemployment rate of the age group. |
| `wshW` | 0.6768 | share of wage bill | IDENTITY | data: Hagstofa TEK02011 (All taxable payments by sex and age, monthly withholding-tax data, summed Jan-Dec 2025) [households.working_35_66.share_of_total_wage_income, 2025] (renormalised to exclude under-18s) | Age group's share of the wage bill. |
| `popO` | 55.42 | thousand persons | IDENTITY | data: Hagstofa MAN00101 (Population by sex and age, 1 January) [population.age_67_plus, 2026] | Population of the age group. |
| `erO` | 0.186 | share of population | IDENTITY | data: Eurostat lfsa_pganws (LFS population by labour status, Iceland, thousands; data supplied by Hagstofa) [households.old_67_plus.employment_rate, 2025] | Employment rate of the age group. |
| `u0O` | 0.012 | share of labour force | IDENTITY | data: Eurostat lfsa_pganws (LFS population by labour status, Iceland, thousands; data supplied by Hagstofa) [households.old_67_plus.unemployment_rate, 2025] | Baseline unemployment rate of the age group. |
| `wshO` | 0.03303 | share of wage bill | IDENTITY | data: Hagstofa TEK02011 (All taxable payments by sex and age, monthly withholding-tax data, summed Jan-Dec 2025) [households.old_67_plus.share_of_total_wage_income, 2025] (renormalised to exclude under-18s) | Age group's share of the wage bill. |
| `cycY` | 1.8 | relative | BEHAVIOUR | assumed | Cyclicality of young employment (x average swing). |
| `cycW` | 0.85 | relative | BEHAVIOUR | assumed | Cyclicality of working-age employment. |
| `cycO` | 0.5 | relative | BEHAVIOUR | assumed | Cyclicality of old-age employment. |
| `mig` | 0.3 | share | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Migration buffer: share of an employment change met by workers arriving/leaving (labour force moves with it). |
| `sigW` | 0.15 | elasticity | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Employment vs the real product wage (wage / domestic price): firms economise on staff when wages outpace prices. |
| `okun` | 0.6 | elasticity | BEHAVIOUR | assumed | Employment elasticity to sector output (labour hoarding below 1). |
| `lamN` | 3 | 1/yr | BEHAVIOUR | assumed | Employment adjustment speed. |
| `xFish` | 7.26 | % of GDP | IDENTITY | data: Hagstofa UTA05003 (Selected items of exports of goods and services, quarterly, summed) + THJ01102 GDP [exports_pct_gdp.marine_products, 2025] | Marine exports (priced in foreign currency). |
| `xAlu` | 6.44 | % of GDP | IDENTITY | data: Hagstofa UTA05003 (Selected items of exports of goods and services, quarterly, summed) + THJ01102 GDP [exports_pct_gdp.aluminium, 2025] | Aluminium exports (priced in foreign currency). |
| `xTour` | 13.08 | % of GDP | IDENTITY | data: Hagstofa UTA05003 (Selected items of exports of goods and services, quarterly, summed) + THJ01102 GDP [exports_pct_gdp.tourism, 2025] | Tourism exports (priced in kronur). |
| `xOther` | 13.64 | % of GDP | IDENTITY | data: Hagstofa UTA05003 (Selected items of exports of goods and services, quarterly, summed) + THJ01102 GDP [exports_pct_gdp.other_services, 2025] + other goods | Other goods and services exports (priced in kronur). |
| `vaFXtarget` | 12.96 | % of GDP | IDENTITY | data: Hagstofa THJ08420 (Production approach components by kind of activity); Hagstofa SAM08008 (tourism satellite account) [export_sector.value_added_share_of_gdp, 2025] | Exporters' value added; fixes their purchases of domestic inputs. |
| `iFD0` | 13 | % of GDP | BEHAVIOUR | placeholder (incl. construction for the housing market) | Baseline investment of domestic-market firms. |
| `iFX0` | 3 | % of GDP | BEHAVIOUR | placeholder | Baseline investment of exporters. |
| `muC` | 0.25 | share | BEHAVIOUR | data: Hagstofa VIS01101 (CPI by expenditure groups, 'breakdown' = weights, Jan 2026 basket) [cpi_weights.imported_goods, 2026] | Import share of consumer spending (proxy: CPI imported-goods weight). |
| `muG` | 0.4 | share | BEHAVIOUR | placeholder (set within a plausible 0.3-0.4 range by the fiscal-multiplier check) | Import share of government purchases (medicines, equipment). |
| `muI` | 0.444 | share | BEHAVIOUR | data: OECD TiVA 2025 edition, DSD_TIVA_MAINSH@DF_MAINSH (sdmx.oecd.org/sti-public), Iceland, GFCF_VA_SH (100 - Iceland-origin share 55.58) [import_content.investment, 2022] | Import share of investment goods (TiVA import content of GFCF). |
| `muX` | 0.284 | per unit | BEHAVIOUR | data: OECD TiVA 2025 edition, DSD_TIVA_MAINSH@DF_MAINSH (sdmx.oecd.org/sti-public), Iceland, EXGR_FVA (foreign value added in gross exports) [import_content.exports, 2022] | Imported inputs per unit of exports (alumina, fuel, aircraft services; TiVA import content of exports). |
| `epsM` | 0.6 | elasticity | BEHAVIOUR | assumed | Import volumes vs the real exchange rate. |
| `eFish` | 0.2 | elasticity | BEHAVIOUR | assumed | Marine export volume vs real exchange rate (quota-bound). |
| `eAlu` | 0.05 | elasticity | BEHAVIOUR | assumed | Aluminium export volume vs real exchange rate (capacity-bound). |
| `eTour` | 1 | elasticity | BEHAVIOUR | assumed | Tourism export volume vs real exchange rate. |
| `eOther` | 0.8 | elasticity | BEHAVIOUR | assumed | Other export volume vs real exchange rate. |
| `lamRer` | 1 | 1/yr | BEHAVIOUR | assumed | Speed at which trade volumes react to the real exchange rate. |
| `hhDep` | 31.52 | % of GDP | IDENTITY | data: household deposits 1,557.4 bn on tax returns (Hagstofa THJ09000, end-2025) | Household deposits. |
| `depShY` | 0.1407 | share | IDENTITY | data: Hagstofa THJ09000 (Liabilities, assets and net worth by family type, age and residence, tax returns) [households.young_18_34.share_of_household_deposits, 2025] | Age group's share of household deposits. |
| `depShW` | 0.4372 | share | IDENTITY | data: Hagstofa THJ09000 (Liabilities, assets and net worth by family type, age and residence, tax returns) [households.working_35_66.share_of_household_deposits, 2025] | Age group's share of household deposits. |
| `depShO` | 0.422 | share | IDENTITY | data: Hagstofa THJ09000 (Liabilities, assets and net worth by family type, age and residence, tax returns) [households.old_67_plus.share_of_household_deposits, 2025] | Age group's share of household deposits. |
| `mortTot` | 58.88 | % of GDP | IDENTITY | data: household housing loans 2,909.2 bn (lifeyrismal.is sheet 4.2, CBI data, end-2025) | Household mortgage debt (banks + pension funds + HFF). |
| `mortShY` | 0.2247 | share | IDENTITY | data: Hagstofa THJ09000 (Liabilities, assets and net worth by family type, age and residence, tax returns) [households.young_18_34.share_of_household_mortgage_debt, 2025] | Young households' share of mortgage debt (the old's 9% is folded into working age: the model's old own outright). |
| `theta` | 0.65 | share | CONTRACT | data: Central Bank of Iceland, Fjarmalastodugleiki 2026/1 (25 Mar 2026), chart data workbook (sedlabanki.is/library/?itemid=5355f431-e53e-44ad-a213-a9d8749f8bca), text p. on household credit [money_credit.indexed_share_of_mortgages, 2026] | CPI-indexed share of mortgages (both borrower groups). |
| `pfMortI` | 11.96 | % of GDP | IDENTITY | data: pension-fund indexed housing loans 590.8 bn (lifeyrismal.is, end-2025) | Pension-fund indexed mortgages. |
| `pfMortN` | 4.161 | % of GDP | IDENTITY | data: pension-fund non-indexed housing loans 205.6 bn (lifeyrismal.is, end-2025) | Pension-fund non-indexed mortgages. |
| `loanFD` | 31.14 | % of GDP | IDENTITY | placeholder: data: Central Bank of Iceland, Fjarmalastodugleiki 2026/1 (25 Mar 2026), chart data workbook (sedlabanki.is/library/?itemid=5355f431-e53e-44ad-a213-a9d8749f8bca), chart I-27 [money_credit.corporate_debt_pct_gdp, 2025] x assumed domestic-bank share 0.55 x domestic-market share 0.75 | Bank loans to domestic-market firms. |
| `loanFX` | 10.38 | % of GDP | IDENTITY | placeholder: same total x exporters' share 0.25 | Bank loans to exporters. |
| `govDebt` | 56.7 | % of GDP | IDENTITY | data: Hagstofa THJ05181 (General government financial assets and liabilities) [money_credit.govt_debt_pct_gdp, 2025] | Gross government debt. |
| `govIdxShare` | 0.35 | share | CONTRACT | placeholder | CPI-indexed share of government debt (held by pension funds). |
| `pfGovShare` | 0.586 | share | IDENTITY | data: Lanamal rikisins (Government Debt Management), Markadsupplysingar January 2026, table 'Eigendur rikisverdbrefa 31. desember 2025' (lanamal.is/asset/13858) [pensions.pf_share_of_govt_bonds, 2025] | Pension funds' share of government bonds (applied to all government debt; indexed bonds first). |
| `bondCB` | 1 | % of GDP | IDENTITY | placeholder | Central bank's government bonds. |
| `bondO` | 4 | % of GDP | IDENTITY | placeholder | Old households' government bonds. |
| `bondW` | 4.082 | % of GDP | IDENTITY | data: foreign holders 7.2% of Treasury bonds (calibration_notes, pensions.pf_share_of_govt_bonds) x government debt | Non-residents' government bonds (carry trade). |
| `m3` | 67.4 | % of GDP | IDENTITY | data: IMF MFS_MA (Monetary Aggregates), series ISL BM_MAI = broad money (national M3), api.imf.org SDMX; CBI source [money_credit.broad_money_m3_pct_gdp, 2024] | Broad money M3; fixes domestic-market firms' deposits (money itself stays a sum of deposits). |
| `fxr` | 18 | % of GDP | IDENTITY | placeholder | Central bank foreign reserves. |
| `tga` | 5 | % of GDP | IDENTITY | placeholder | Treasury account at the central bank (target). |
| `eqCB` | 2 | % of GDP | IDENTITY | placeholder | Central bank equity. |
| `depFX` | 5 | % of GDP | IDENTITY | placeholder | Exporters' deposits. |
| `depW` | 3 | % of GDP | IDENTITY | placeholder | Non-residents' krona deposits. |
| `eqHY` | 1 | % of GDP | IDENTITY | placeholder | Domestic shares held by young households (balance-sheet display only). |
| `eqHW` | 10 | % of GDP | IDENTITY | placeholder | Domestic shares held by working-age households (display only). |
| `eqHO` | 5 | % of GDP | IDENTITY | placeholder | Domestic shares held by old households (display only). |
| `eqW` | 10 | % of GDP | IDENTITY | placeholder | Foreign-owned equity in exporters, aluminium smelters (display only). |
| `pfEqFDshare` | 0.7 | share | IDENTITY | placeholder | Share of equity (pension funds, households) that is in domestic-market firms. |
| `divFDY` | 0.05 | share | IDENTITY | placeholder | Share of domestic firms' distributed profit (dividends and owners' income) going to the young. |
| `divFDW` | 0.67 | share | IDENTITY | placeholder | Share going to working age (owners, self-employed). |
| `divFDO` | 0.18 | share | IDENTITY | assumed (67+ capital income 117.4 bn, Hagstofa THJ09001) | Share going to the old; the rest (10%) to pension funds. |
| `fdiTarget` | 0.33 | % of GDP | IDENTITY | data: equity income on inward FDI 2024, dividends + reinvested earnings (Eurostat bop_c6_a; calibration_notes export_sector) | Baseline dividends to foreign owners of exporters; fixes the foreign share of exporters' dividends. |
| `divFXdomW` | 0.55 | weight | IDENTITY | placeholder | Domestic split of exporters' dividends: working-age weight (old 0.15, pension funds 0.30). |
| `house0` | 200 | % of GDP | IDENTITY | placeholder | Value of the housing stock (memo item, non-financial). |
| `hshY` | 0.1761 | share | IDENTITY | data: home-ownership rate x population (Hagstofa LIF03211 (EU-SILC: Individuals, tenure status by sex and age, 2004-2016) [households.young_18_34.home_ownership_rate, 2016]) x assumed relative home value (young 0.6) | Young households' share of housing wealth. |
| `hshW` | 0.6007 | share | IDENTITY | data: home-ownership rate x population (Hagstofa LIF03211 (EU-SILC: Individuals, tenure status by sex and age, 2004-2016) [households.young_18_34.home_ownership_rate, 2016]) x assumed relative home value (young 0.6) | Working-age households' share of housing wealth (rest: old). |
| `purY` | 1.2 | % of GDP per yr | BEHAVIOUR | placeholder | Homes bought by the young from the old each year (net). |
| `purW` | 1 | % of GDP per yr | BEHAVIOUR | placeholder | Homes bought by working age from the old each year (net). |
| `kapT` | 0.22 | ratio | POLICY | assumed (total capital requirement ~20% + buffer) | Banks' target capital ratio. |
| `kapMin` | 0.18 | ratio | POLICY | assumed | Capital ratio at which the loan premium reaches its maximum. |
| `rwM` | 0.35 | weight | POLICY | assumed (Basel standardised mortgage risk weight) | Risk weight on mortgages. |
| `rwL` | 1 | weight | POLICY | assumed (Basel standardised corporate risk weight) | Risk weight on firm loans. |
| `sCap` | 0.02 | rate | BEHAVIOUR | assumed | Loan premium when capital falls to the minimum. |
| `lamEq` | 1 | 1/yr | BEHAVIOUR | assumed | Speed at which banks rebuild capital by cutting dividends. |
| `lamDivB` | 1 | 1/yr | BEHAVIOUR | assumed | Bank dividend smoothing. |
| `divBshG` | 0.35 | share | IDENTITY | assumed (state owns Landsbankinn) | Share of bank dividends paid to the government. |
| `divBshPF` | 0.35 | share | IDENTITY | placeholder | Share of bank dividends paid to pension funds. |
| `divBshW` | 0.2 | share | IDENTITY | placeholder | Share of bank dividends paid to working-age households (the rest to the old). |
| `i0` | 0.03 | rate | POLICY | assumed | Neutral key rate (real, zero-inflation baseline). |
| `piT` | 0 | rate | POLICY | assumed (target set to 0 in the zero-inflation baseline; Iceland targets 2.5%) | Inflation target. |
| `mD` | 0.01 | rate | BEHAVIOUR | assumed | Deposit margin below the key rate. |
| `sB` | 0.005 | rate | CONTRACT | assumed | Government bond spread (floating-rate bonds). |
| `sL` | 0.025 | rate | BEHAVIOUR | assumed | Firm loan spread. |
| `sMN` | 0.01 | rate | BEHAVIOUR | assumed | Non-indexed mortgage spread. |
| `rMI0` | 0.025 | rate | BEHAVIOUR | assumed | Real rate on indexed mortgages at baseline. |
| `psiIdx` | 0.4 | ratio | BEHAVIOUR | assumed | Pass-through of the key rate to indexed real mortgage rates. |
| `rBI0` | 0.02 | rate | CONTRACT | assumed | Real coupon on indexed government bonds. |
| `sBB` | 0.01 | rate | CONTRACT | assumed | Bank bond spread over the key rate. |
| `iF0` | 0.02 | rate | BEHAVIOUR | assumed | Cash yield on pension funds' foreign assets and foreign rate. |
| `iFXR` | 0.02 | rate | BEHAVIOUR | assumed | Yield on central bank reserves. |
| `Tm` | 25 | years | CONTRACT | assumed | Average remaining term: 1/Tm of the stock is repaid each year. |
| `dstiY` | 0.4 | share of income | POLICY | data: Rules 1300/2025 (first-time buyers 40%) | Debt-service cap, young (first-time buyers). |
| `dstiW` | 0.35 | share of income | POLICY | data: Rules 1300/2025 | Debt-service cap, working age. |
| `floorN` | 0.055 | rate | POLICY | data: Rules 1300/2025 | Stress-test rate floor, non-indexed loans. |
| `termN` | 40 | years | POLICY | data: Rules 1300/2025 | Maximum term in the test, non-indexed loans. |
| `floorI` | 0.03 | rate | POLICY | data: Rules 1300/2025 | Stress-test real-rate floor, indexed loans. |
| `termI` | 25 | years | POLICY | data: Rules 1300/2025 | Maximum term in the test, indexed loans. |
| `capUse0` | 0.6 | ratio | BEHAVIOUR | assumed | Baseline new lending as a share of the debt-service cap (cap slack). |
| `ltvY` | 0.9 | share | POLICY | assumed (first-time buyer LTV limit) | Loan-to-value cap, young (only when the LTV lever is on). |
| `ltvW` | 0.85 | share | POLICY | assumed | Loan-to-value cap, working age (only when the LTV lever is on). |
| `aLY` | 0.95 | MPC | BEHAVIOUR | assumed | Young: propensity to consume out of labour and transfer income. |
| `aLW` | 0.9 | MPC | BEHAVIOUR | assumed | Working age: propensity to consume out of labour and transfer income. |
| `aLO` | 0.85 | MPC | BEHAVIOUR | assumed | Old: propensity to consume out of pensions and transfers. |
| `aK` | 0.2 | MPC | BEHAVIOUR | assumed (v0 stabiliser: low MPC out of interest and dividends) | Propensity to consume out of real property income. |
| `betaC` | 0.6 | per unit real rate | BEHAVIOUR | calibrated to target (rate-shock output trough) | Saving response to the real key rate. |
| `aWY` | 0.15 | per yr | BEHAVIOUR | assumed | Young: extra spending per krona of liquid wealth above baseline (real). |
| `aWW` | 0.1 | per yr | BEHAVIOUR | assumed | Working age: wealth effect on liquid wealth above baseline. |
| `aWO` | 0.15 | per yr | BEHAVIOUR | assumed | Old: wealth effect on liquid wealth above baseline (spend down savings). |
| `aNL` | 0.5 | MPC | BEHAVIOUR | assumed | Share of net new mortgage borrowing spent (beyond home purchases). |
| `aHY` | 0.01 | per yr | BEHAVIOUR | assumed | Housing-wealth effect, young. |
| `aHW` | 0.015 | per yr | BEHAVIOUR | assumed | Housing-wealth effect, working age. |
| `aHO` | 0.03 | per yr | BEHAVIOUR | assumed | Housing-wealth effect, old. |
| `lamC` | 0.9 | 1/yr | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Consumption habit: speed at which spending moves to its new desired level. |
| `betaM` | 3 | per unit real rate | BEHAVIOUR | assumed | Desired mortgage debt vs real mortgage rate. |
| `lamM` | 0.25 | 1/yr | BEHAVIOUR | assumed | Speed of moving mortgage debt to its desired level. |
| `betaMH` | 0.5 | elasticity | BEHAVIOUR | assumed | Desired mortgage debt vs real house prices. |
| `lamH` | 1 | 1/yr | BEHAVIOUR | assumed | House price adjustment speed. |
| `betaHY` | 1 | elasticity | BEHAVIOUR | assumed | Real house prices vs real household disposable income. |
| `betaHC` | 3 | per unit of GDP | BEHAVIOUR | assumed | Real house prices vs the net mortgage credit flow (x100 = % per % of GDP). |
| `betaHR` | 2 | per unit real rate | BEHAVIOUR | assumed | Real house prices vs the real mortgage rate. |
| `lamHC` | 1 | 1/yr | BEHAVIOUR | assumed | Speed at which the CPI housing component follows house prices. |
| `betaPi` | 0.3 | elasticity | BEHAVIOUR | assumed | Investment vs real profits. |
| `betaRI` | 1.5 | per unit real rate | BEHAVIOUR | calibrated to target (rate-shock output trough) | Investment vs real loan rate. |
| `betaU` | 0.5 | per unit gap | BEHAVIOUR | assumed | Investment vs capacity utilisation (accelerator). |
| `lamInv` | 1.5 | 1/yr | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Investment adjustment speed (planning lag). |
| `lamPi` | 2 | 1/yr | BEHAVIOUR | assumed | Smoothing of profits seen by investors. |
| `rhoL` | 1 | per unit leverage | BEHAVIOUR | assumed | Firms retain more profit when debt/GDP is above baseline. |
| `omH` | 0.245 | share | IDENTITY | data: Hagstofa VIS01101 (CPI by expenditure groups, 'breakdown' = weights, Jan 2026 basket) [cpi_weights.housing, 2026] | CPI weight of housing. |
| `omM` | 0.25 | share | IDENTITY | data: Hagstofa VIS01101 (CPI by expenditure groups, 'breakdown' = weights, Jan 2026 basket) [cpi_weights.imported_goods, 2026] | CPI weight of imported goods. |
| `omD` | 0.505 | share | IDENTITY | data: Hagstofa VIS01101 (CPI by expenditure groups, 'breakdown' = weights, Jan 2026 basket) [cpi_weights.domestic_goods_and_services, 2026] | CPI weight of domestic goods and services. |
| `aLab` | 0.55 | share | BEHAVIOUR | calibrated to target (wage-shock price level) | Labour share of domestic unit cost (rest: imported inputs). |
| `eta` | 0.5 | per unit gap | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Capacity utilisation pushes prices above unit cost. |
| `lamUC` | 1.5 | 1/yr | BEHAVIOUR | calibrated to target (wage-shock inflation peak timing) | Speed at which firms' view of unit cost follows actual costs. |
| `lamP` | 2 | 1/yr | BEHAVIOUR | calibrated to target (wage-shock inflation peak timing) | Speed at which prices follow the markup on unit cost. |
| `lamPm` | 2 | 1/yr | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Import price adjustment speed (retail pass-through). |
| `phiU` | 1.2 | pp per pp | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Wage Phillips curve slope. |
| `phiW` | 0.4 | 1/yr | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Wage error correction: wage growth slows while wages are high relative to domestic prices (main-course model). |
| `chi` | 0.5 | weight | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Weight of the inflation target (anchor) in expectations. |
| `lamPia` | 1.5 | 1/yr | BEHAVIOUR | assumed | Speed of adaptive expectations. |
| `aPi` | 1.3 | pp per pp | POLICY | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Key-rate response to expected inflation. |
| `aY` | 0.6 | pp per % | POLICY | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Key-rate response to the output gap. |
| `aPiA` | 0.3 | pp per pp | POLICY | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Key-rate response to actual 12-month inflation. |
| `lamPol` | 3 | 1/yr | POLICY | assumed | Key-rate smoothing speed. |
| `betaI` | 0.55 | % per pp | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Krona response to the interest differential (carry demand). |
| `betaH` | 0.3 | elasticity | BEHAVIOUR | assumed | Krona response to non-residents' real krona holdings (portfolio balance). |
| `lamFX` | 12 | 1/yr | BEHAVIOUR | assumed | Exchange-rate adjustment speed. |
| `lamSent` | 0.1 | 1/yr | BEHAVIOUR | calibrated to target (calibration checks, see docs/SPEC.md section 7) | Decay of a krona sentiment shock. |
| `psiB` | 5 | per unit rate | BEHAVIOUR | assumed | Non-resident bond demand vs the interest differential. |
| `lamBW` | 2 | 1/yr | BEHAVIOUR | assumed | Speed of non-resident bond purchases. |
| `lamFA` | 0.5 | 1/yr | BEHAVIOUR | assumed | Pension funds' speed of moving foreign assets to target (through new flows). |
| `lamReb` | 0.5 | 1/yr | BEHAVIOUR | assumed | Portfolio rebalancing speed (pension funds, old households) in bonds. |
| `lamPFnw` | 0.3 | 1/yr | BEHAVIOUR | assumed | Speed at which pension-fund gains or losses are credited to members. |
| `lamPFinc` | 1 | 1/yr | BEHAVIOUR | assumed | Smoothing of pension-fund income credited to members. |
| `tau0` | 0.3848 | rate | POLICY | calibrated to target | Income-tax rate (covering all taxes on households and other revenue) that balances the baseline budget. |
| `tauF` | 0.09015 | rate | POLICY | calibrated to target | Effective corporate tax rate on gross profits giving baseline revenue (citTarget). |
| `muXD` | 0.3954 | per unit | BEHAVIOUR | calibrated to target | Exporters' domestic inputs per unit of exports giving exporters' value added (vaFXtarget). |
| `bondPF` | 13.38 | % of GDP | IDENTITY | calibrated to target | Pension funds' nominal government bonds: data share of government debt minus indexed bonds. |
| `bbondPF` | 27.85 | % of GDP | IDENTITY | calibrated to target | Bank bonds held by pension funds: closes the bank balance sheet given deposits (M3), loans and capital. |
| `divFXW` | 0.2452 | share | IDENTITY | calibrated to target | Foreign owners' share of exporters' dividends giving fdiTarget. |
| `vat0` | 0.3033 | rate | POLICY | calibrated to target | Effective VAT rate on consumption giving baseline VAT revenue (vatTarget). |
| `cEe` | 0.04648 | share of gross wage | CONTRACT | calibrated to target | Employee pension contribution giving baseline contributions (conTarget). |
| `rr` | 0.3879 | ratio | POLICY | calibrated to target | Unemployment benefit replacement rate giving baseline spending (ueTarget). |
| `wsOther` | 0.342 | share | POLICY | calibrated to target | Wage share of other public services giving public compensation (compG). |
| `muD` | 0.02672 | share | BEHAVIOUR | calibrated to target | Import share of domestic firms' inputs: current account balanced at baseline. |
| `rhoFD0` | 0.5033 | share | BEHAVIOUR | calibrated to target | Domestic firms' retention ratio: retained profit = investment. |
| `rhoFX0` | 0.6903 | share | BEHAVIOUR | calibrated to target | Exporters' retention ratio: retained profit = investment. |
| `c0Y` | 0.9612 | % of GDP (real) | BEHAVIOUR | calibrated to target | Young: autonomous (price-indexed) spending giving zero baseline saving. |
| `c0W` | 9.595 | % of GDP (real) | BEHAVIOUR | calibrated to target | Working age: autonomous spending giving zero baseline saving. |
| `c0O` | 4.41 | % of GDP (real) | BEHAVIOUR | calibrated to target | Old: autonomous spending giving zero baseline saving. |
| `payout` | 0.1788 | per yr | CONTRACT | calibrated to target | Pension payout rate on pensioners' rights: rights stock stable. |
| `ageing` | 0.1159 | per yr | IDENTITY | calibrated to target | Share of working-age rights moving to pensioners each year as members retire. |
| `nuY` | 0.008778 | share | POLICY | calibrated to target | Young: share of income that belongs to new borrowers (sets DSTI cap slack). |
| `nuW` | 0.016 | share | POLICY | calibrated to target | Working age: share of income that belongs to new borrowers. |
| `mRY` | 0.8906 | ratio | BEHAVIOUR | calibrated to target | Young: desired mortgage debt / gross income. |
| `mRW` | 1.421 | ratio | BEHAVIOUR | calibrated to target | Working age: desired mortgage debt / gross income. |
<!-- END:params -->
