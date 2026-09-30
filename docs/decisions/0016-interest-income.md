# 0016. Interest income, and the debt rule while the key rate is held

Status: accepted (September 2026), in part. It answers the owner's request on tax levers and the review items ECON-2 to ECON-5 of the verification of phases 1–4. Part B, the debt rule while only the key rate is locked, is done: it supersedes the open questions R4 and the counter-cyclical term of [decision 0015](0015-downturn-escape-clause.md) and closes lever-vetting open item 22. Part A, the interest-income channel, was measured in both models and changed in neither; the runaway of a held tax change with the central bank's rule acting (ECON-5, open item 21) stays open, for the reasons measured below.

## The request

The owner: "Why would changing income tax not directly affect debt? That is the most normal effect, not a central bank reaction. Taxes, debt and wage negotiations will be the most common levers the user wants to play with. Government debt is exactly NOT the locked element; it's the reaction."

So, in the default state (both padlocks open), setting income tax locks it, the debt rule steps aside, and the effects should be led by the budget: a cut means less revenue, a deficit, rising debt and more household income and demand; the central bank's reaction comes second and should steady the economy. The verification found instead:

- **ECON-5.** Iceland income tax −2.5 held while the key-rate rule acts: output +3.23%, the price level +13.1% and still accelerating, the key rate +4.8 points and government debt +47 points of GDP at month 240, flagged Explosive. The reference economy's tax rate −2 gave output +80% and a key rate above 60%, and its range had been cut to −2 to stay finite.
- **REF-KEYRATE-ALONE.** The reference key rate held at 2.25% with its debt rule acting was Explosive (the price level +19% and accelerating); 4.75% gave output −13.4%, and 0% a price level +59%.
- **ECON-2, ECON-3, ECON-4.** With only Iceland's key rate locked, the debt rule's escape clause read where the unused central-bank rule was heading, not the rate in force (the proposal's R4), and the rule leaned on debt alone, so it raised taxes in private-demand slumps.

## Part A: the interest-income channel, measured

**Where interest lands.** In Iceland the government's nominal bonds are held by banks (14.4% of GDP at baseline), pension funds (13.4, and all 19.8 of the indexed bonds), older households (4.0, a placeholder), non-residents (4.1) and the central bank (1.0). Banks pay depositors the key rate less a margin; pension funds credit their income to members' rights, which reach pensions only as they are paid out (about a fifth of pensioners' rights a year); households spend `aK` = 0.2 of real interest and dividends at once, and the rest joins their savings, of which they spend 10–15% a year above normal (`aW`); non-residents' interest stays in their króna deposits. In the reference economy the bank holds most of the bonds and pays out all its profit as dividends, and households spend 0.9 of disposable income, interest and dividends included, and 9% of their deposits a year.

**The evidence.** The marginal propensity to consume out of labour income is about 0.6–0.9, out of interest and capital income about 0.1–0.3: interest goes mostly to wealthier savers, whose spending responds little to income changes (Jappelli and Pistaferri 2010, 2014; Kaplan and Violante 2022; Auclert 2019). Spending out of financial wealth is about 3 cents a króna a year (Poterba 2000; Chodorow-Reich, Nenov and Simsek 2021). Iceland's `aK` = 0.2 is inside that range, and its bond holdings follow the data (`pfGovShare`), so Iceland's routing was already close to the evidence; its savings are spent faster than the wealth evidence says. The reference economy spends interest like wages, at the top of the range.

**What was tried, and what it did** (month 240, against the no-change run in the same configuration, key-rate rule acting and the tax lever held):

| Change | Iceland income tax −2.5: output, price level, key rate, debt | Side effects |
|---|---|---|
| None (today) | +3.23%, +13.1%, +4.80 pp, +47 pp of GDP; Explosive | |
| Iceland: interest and dividends saved, kept apart and spent at 3% a year (a mental account, Shefrin and Thaler 1988) | +2.48%, +11.7%, +4.24 pp, +49; Explosive | the tourism −15 expectation that inflation dies out fails (0.079 over months 180–240 against a limit of 0.05): the slower channel lengthens the learning cycle |
| Iceland: pension funds credit the actuarial return (3.8% real, derived; the regulated discount rate is 3.5%) plus CPI indexation, and surpluses at 0.1 a year | +3.03%, +12.8%, +4.71 pp, +49; Explosive | none measured; too small to carry |
| Iceland: every household interest channel switched off (the wealth term, spending out of property income, credited pension income) | +0.95%, +7.7%, +2.55 pp, +53; Explosive | a counterfactual, not a model |
| Iceland: the króna's portfolio term switched off | +1.38%, +5.6%, +2.01 pp, +40; debt still Explosive | a counterfactual: most of the late drift is the króna (below) |

| Change | Reference tax rate −1: output, price level, key rate, debt | Side effects |
|---|---|---|
| None (today) | +6.13%, +17.9%, +7.23 pp, +24.9; Explosive | |
| Interest income (deposit interest and the bank's dividends) spent at 0.25, the rest kept and spent at 3% a year, the baseline re-solved | +1.20%, +6.4%, +1.62 pp, +14.4; settles | the baseline changes: households need a lower income to spend it all, so government spending doubles to 32% of GDP and the tax rate to 39% to keep GDP at 100 and debt at 55%; rejected |
| The same, with the baseline kept (usual interest spent as before, a change in it at 0.25) | +2.3%, +10.2%, +3.0 pp, +24.8; Explosive | the wage-settlement trough deepens from 4.9% to 5.7–6.0% (the review band is 3–5%); a spending cut of 3% of GDP holds the key rate at zero for 3 years, not 15; the lending appetite's lasting gain falls from 1.2% to 0.1%; `savingIncentive` must fall from 0.7 to 0.25 to keep the locked rate check in range |
| Only the bank's dividends (the route of the government's interest) at 0.25 | +0.99%, +4.7%, +1.31 pp, +17.1 | the wage trough 5.4%; the locked rate check −2.9% (range −2 to −0.3) |

**Why none of them makes a held tax change settle.** Two things keep the runaway going after the household channel is cut:

1. **Debt compounds in a zero-growth economy.** With tax rates held, a lasting deficit adds interest to interest at the real bond rate less growth, about 3.5% a year here (a 3% neutral real rate, a 0.5-point spread, no growth). The lever report's Explosive test asks whether the last year's move is at least 1.2 times the move five years earlier, and e^(5 × 0.035) = 1.19: any rise in the key rate or in the deficit tips a held tax change's debt path over it. This is the Leeper (1991) result, active monetary policy with no fiscal anchor, made sharper by the zero-growth baseline; in Iceland's data nominal growth and bond yields are close (r − g near zero), and the model's balanced-growth baseline (roadmap v2) would bring that back.
2. **In Iceland, the króna.** The deficit sends krónur abroad, through imports and through the pension funds, which buy foreign assets as their income grows; non-residents then hold more krónur than they want, and portfolio balance weakens the króna, so exports rise and imported inflation keeps the key rate climbing, which raises the pension funds' income again. With the portfolio term switched off, inflation after the tax cut stays at about 0.3 point and the key rate 2 points up; with it, inflation climbs to 1.1 points. This is lever-vetting item 4 (booms weaken the real króna), which króna stage 2 is to fix.

So the evidence-based changes shrink the runaway but cannot stop it here, and each moves calibrated behaviour that rests on the old channel. Adopting them needs the joint recalibration the long-run-anchors proposal plans (the reference economy's R6 and interest in real terms; phase 5 for Iceland's wage block), not a change in passing. The texts now lead with the budget instead, and say where the long-run drift comes from.

## Part B: the debt rule while only the key rate is locked (decided)

While the key rate is locked the central bank does not react, so the debt rule must steady the economy in its place, leaning against the cycle with a slow debt term under it (Kirsanova, Leith and Wren-Lewis 2009), and the proposal asked for exactly that with R4. Both models now do it; while the key rate is unlocked nothing changes.

- **A counter-cyclical term.** Iceland: `phiGap` = 0.5 income-tax points per point of the output gap the central bank reads from the labour market (decision 0012); the reference economy: `fiscalCycle` = 0.5 points per 1% of output above capacity, the gap its Taylor rule reads. On tax bases of about two-thirds and 87% of GDP that is 0.3–0.45% of GDP of revenue per point of gap on top of the automatic stabilisers, the size of the discretionary responses estimated for OECD governments (Galí and Perotti 2003). At 1 Iceland's slumps were shallower still (tourism −60: output −3.8% at month 60 against −5.2%) at the cost of tax swings twice as large.
- **A slow debt term.** Iceland `phiTauHeld`, the reference `fiscalHeldShare`: the debt term at half its strength. At a quarter a held rate 3 points above neutral turned Iceland's output positive before month 480, which the proposal's acceptance test forbids; at half no held rate from +1 to +3 points does (the largest effect is −0.04%, −0.07% and −0.11% at 4, 5 and 6%), and a model test gates it.
- **R4, the escape clause on the rate in force (Iceland).** While the key rate is locked the zero-bound condition reads the rate held, not where the unused rule is heading: fully on at zero, off at `escapeBand` (0.25 point) or above, and only while output is below potential (fully `downturnBand` below). The proposal's R4 had no condition on the cycle; measured without it, a rate held at zero in a boom (health +3) kept income tax exactly where it was for twenty years, so the clause would have stopped the rule leaning against the boom. The regime label says "Escape clause: no tax rise while the key rate you hold is at zero in a slump". Unlocked, the clause is unchanged.

`taxRuleTarget` (Iceland) and `taxRuleTarget` (reference) read the key rate's padlock (`locks`), and their terms, regime labels and explanations say all of this. The key-rate lever's texts, the debt rules' stabiliser descriptions and the lever panel's line while only the key rate is locked (`lockedAloneNote`) now say that the debt rule steadies the economy in the central bank's place.

## What moved

**The key rate locked, the debt rule acting** (Iceland's `key rate locked` configuration, where the key rate's own runs sit; month 12 / 60 / 240):

| | Output, % | Income tax, points | Debt, points of GDP |
|---|---|---|---|
| Tourism −60 | −5.36 / −6.27 / −0.95 → −5.30 / −5.38 / −1.57 | +0.01 / +0.01 / +3.38 → −0.59 / −0.98 / +4.53 | 42.4 → 41.3 at 240 |
| Lending appetite −3 | −0.54 / −1.83 / −1.28 → −0.54 / −1.62 / −0.57 | +0.01 / +0.43 / +1.14 → −0.01 / −0.03 / +0.69 | 4.5 → 7.0 |
| Loan-to-value cap 50 | at 240: −1.12 → −0.58 | +0.87 → +0.44 | 3.7 → 5.1 |
| Foreign demand −20 | at 240: −0.88 → −0.26 | +1.40 → +0.98 | 5.5 → 8.2 |
| Pension funds' foreign share −20 | at 240: −2.52 → −2.71 | +0.50 → +1.52 | 21.2 → 22.7 |
| Key rate 6% | −1.42 / −2.50 / −1.13 → −1.42 / −2.03 / −0.67 | +0.03 / +1.38 / +3.08 → −0.02 / +0.29 / +3.57 | 27.1 → 31.6 |
| Key rate 15% | at 240: −4.21 → +5.37 | +35.3 → +31.9 (idle to month 96 → cut 0.2 point through the slump, +9.4 by month 120) | 245 → 264 |
| Key rate 0% | at 240: +3.36 → +1.70 (price level +18.6 → +11.4%) | −3.31 → −1.92 | −13.3 → −19.4 |
| Health +3 | at 240: +2.14 → +1.90 | +2.93 → +2.79 (+0.75 → +1.81 at month 60) | 12.3 → 10.5 |
| VAT −10 | at 240: +2.63 → +3.75 | +4.73 → +3.68 | 19.5 → 22.7 |
| Public investment −3 | at 240: −2.53 → −3.58 | −4.79 → −3.91 | −20.0 → −22.9 |
| VAT +2.5 | −0.62 / −1.00 / −0.63 → −0.62 / −0.99 / −0.98 | −1.19 → −0.93 at 240 | −5.0 → −5.7 |
| Wage settlement +10 | −0.63 / −0.34 / −0.19 → −0.61 / −0.18 / −0.10 | −0.02 → −0.25 at month 12 | 0.6 → 1.1 |

Private-demand slumps now bring tax cuts, and end shallower; the slow debt term pays the debt back later and more gently, so lasting fiscal shocks (VAT −10, public investment −3) are offset less after twenty years than by the full-strength rule, and a 15% hold still explodes (decision 0014). The unlocked and every-lever-locked configurations do not move: income tax ±2.5 and ±10, VAT ±2.5 and the wage settlement give the same numbers as before in both, and so does every calibration check of Iceland.

**The reference economy's key rate held, its debt rule acting** (month 12 / 60 / 240): 2.25%, output +0.74 / +1.68 / +4.31% → +0.69 / +0.53 / +0.76%, the price level +19.4% (Explosive) → +4.8%; 4.75%, output −1.71 / −3.79 / −13.36% → −1.60 / −1.07 / −1.61%, debt +32.0 → +18.4 points; 0%, the price level +58.6% (Explosive) → +13.9%, output +9.95 → +2.14%; 10%, output −34% → −4.3%. With both levers locked, and its tax lever held with the Taylor rule acting, nothing moves (tax −1: output +6.13%, the key rate +7.2 points at month 240, still Explosive, open item 21). Its calibration check `rate-hike-output`, which holds the key rate 1 point up for two years with the debt rule acting, moves from −1.492 to −1.147 (range −3 to −0.05): the rule now cuts taxes in the slump.

**The lever reports.** Iceland: Explosive 28 → 27 (health −3 and other public services −3 with the key rate locked go; pension funds' foreign share −20 with the key rate locked is new: the slow debt term still raises income tax 0.24 point a year at month 240), Extreme 38 → 37 (education +3 with the key rate locked), Unsettled 268 → 269, 216/216 expectations. Reference: Explosive 6 → 4 and Extreme 8 → 6 (the key rate held at 0% and 2.25%, and 4.75%, with the debt rule acting), Lock sign 12 → 14 (the key rate at 2.25% and 4.75%: real disposable income at month 12 moves opposite ways locked and unlocked, by 0.04–0.22%, as the debt rule's tax cuts or rises now reach it), 52/52 expectations.

**The implied neutral rate** (a diagnostic, decision 0012) holds the key rate, so the debt rule it reports now leans against the cycle as well: a high held rate brings tax cuts. Health, education and other public services +3 and pension funds' foreign share +20 now have no constant rate in the range that brings inflation to target (7.3–9.2% before); tourism −60 crosses once, at 6.9% (4 times, nearest at 1.65%, before); the cuts of public spending cross at 10.7–11.8%, where inflation rises with the rate (8.8–9.0% before, and none for other public services −3). Its tests say so.

**Goldens and fixtures.** `all-levers-unlocked` in both models and the reference `calibration-rate-hike-output` are updated; the version-1 fixture does not move.

## What stays open

- **ECON-5 (open item 21).** Held income tax with the central bank's rule acting still runs away in both models, for the two reasons in part A. The texts lead with the budget and debt, and say that the drift comes from interest compounding on the debt and, in Iceland, the króna. The test that no moderate tax step is Explosive stays marked as expected to fail, with the reasons; its tripwire is unchanged. What would close it: a balanced-growth baseline (roadmap v2), króna stage 2, the joint recalibration that would let the evidence-based interest routing in (the reference economy's R6), or a fiscal anchor while the tax is held. The owner decides which.
- **The reference economy's tax-rate range stays at −2 to +3:** a held cut with the Taylor rule acting still runs away (at −2, output is 80% higher after twenty years), so −3 is not restored.

## References

- Auclert, A. (2019), Monetary policy and the redistribution channel, *American Economic Review* 109(6).
- Chodorow-Reich, G., P. Nenov and A. Simsek (2021), Stock market wealth and the real economy: a local labor market approach, *American Economic Review* 111(5).
- Galí, J. and R. Perotti (2003), Fiscal policy and monetary integration in Europe, *Economic Policy* 18(37).
- Jappelli, T. and L. Pistaferri (2010), The consumption response to income changes, *Annual Review of Economics* 2; (2014), Fiscal policy and MPC heterogeneity, *American Economic Journal: Macroeconomics* 6(4).
- Kaplan, G. and G. Violante (2022), The marginal propensity to consume in heterogeneous agent models, *Annual Review of Economics* 14.
- Kirsanova, T., C. Leith and S. Wren-Lewis (2009), Monetary and fiscal policy interaction: the current consensus assignment in the light of recent developments, *Economic Journal* 119(541).
- Leeper, E. (1991), Equilibria under 'active' and 'passive' monetary and fiscal policies, *Journal of Monetary Economics* 27(1).
- Poterba, J. (2000), Stock market wealth and consumption, *Journal of Economic Perspectives* 14(2).
- Shefrin, H. and R. Thaler (1988), The behavioral life-cycle hypothesis, *Economic Inquiry* 26(4).
- Lög um starfsemi lífeyrissjóða (Act on pension funds) no. 129/1997, art. 39; Regulation 391/1998 (the 3.5% real discount rate).
