# 0009. The key-rate rule learns its neutral rate; the debt rule has an escape clause and steps from the rate in force; reserve management is an operating rule

Status: accepted (September 2026). The policy findings of the re-vetting of 29 September 2026 (`docs/audit/lever-vetting.md`, "Final repairs after the re-vetting"). It builds on decisions 0004 (stabilisers) and 0007 (the rule smooths from the rate in force).

## The problems

**A fixed neutral rate leaves lasting shocks with lasting gaps on Automatic (trade-taylor-fixed-potential, AUTO-FIXED-NEUTRAL).** The Taylor rule compared the key rate with a fixed neutral real rate (`i0`, 3%) and output with a fixed capacity (`potentialOutput`). A proportional rule then leaves a steady-state error after any lasting real shock: over months 180–240, tourism −60 left inflation −0.94 pp, fish +30 −0.29 pp and health ±3 about ±1 pp, and credit tightening did more lasting damage on Automatic than on Manual (ltvCap 50: output −0.58% at month 240 and still falling). Public services move jobs more than output, so after education +3 the rule saw no output gap while unemployment was 1.8 points below normal.

**The debt rule tightened in a liquidity trap (ZLB-DEBT-RULE).** Tourism −60 on Automatic held the key rate at zero from month 7 to month 240 while the debt rule raised income tax by up to 3.3 points: pro-cyclical tightening when monetary policy had no room left. Output ended 3.85% lower, the price level 17.7% lower.

**The debt rule jumped at a switch (MON-2 item 6).** Its shadow followed debt in both modes but not the rate in force, so switching to Automatic after incomeTax −3 on Manual for five years moved the tax rate 35.53% → 39.38% in one month: the pattern decision 0007 removed from the key rate.

**Two automatic reactions were labelled POLICY without being declared stabilisers (RULE11-FXRESERVE-MANUAL).** The central bank's reserve sales toward its target (`fxReserveSales`, Iceland) and the reference central bank's payout of capital above its target (`cbProfit`) react to the economy in both modes. Rule 11 lets a POLICY setting move only as a declared stabiliser.

## The decisions

**The neutral rate is an estimate the rule revises (`neutralRate`, a shadow of the key-rate stabiliser).** Each month it moves by `kappaR` (0.15 a year) × (inflation at constant VAT − target) + `kappaU` (0.15 a year) × (normal unemployment − unemployment), within `rStarBand` (3 points) of `i0`. Normal unemployment is the wage curve's: `uBase` plus what more generous benefits add, with the people searching longer because of the benefits left out, as the wage curve leaves them out. This is an integral term: a lasting gap keeps nudging the rate until it is gone (Laubach and Williams 2003; Orphanides and Williams 2002). Learning from the labour market as well as from inflation lets the rule see slack that output misses, and makes the two terms offset after a one-off wage settlement, when inflation and unemployment rise together (the estimate moves by less than 0.005 in six years). It is computed in both modes, like the rest of the rule's shadow, so switching to Automatic starts from it.

**Capacity follows the net-immigration lever.** The rule's output gap divides output by `potentialOutput` × (1 + the newcomers' share of the baseline labour force), so a wave of workers who stay is counted as capacity, not as a boom to lean against. For other shocks capacity stays fixed; the neutral-rate learning corrects what that leaves (open item 2 of the vetting record). *Superseded by [decision 0012](0012-labour-market-gap.md): the rule now reads its gap from the labour market, so potential output follows the labour force for every shock.*

**The debt rule has an escape clause and steps from the rate in force.** Its target (`taxRuleTarget`, `phiTau` × debt above baseline) is capped at the shift in force while the key-rate rule is heading below zero, phased in over the first `escapeBand` (a quarter point) of the shortfall: no tax rises while monetary policy has no room, cuts still allowed. It is a stabiliser interaction under decision 0004: both reactions are declared, and the clause acts in both modes (on Manual it shapes the suggestion only). Like the key rate (decision 0007), the rule's adjustment is one smoothed step from `taxRuleAnchor`, the shift in force: its own adjustment on Automatic, the income-tax lever's shift on Manual. The suggestion on the income-tax lever is where the rule is heading, as the key rate's is.

**Reserve management and the reference central bank's payout are operating rules (CONTRACT).** No lever sets them and no user holds them; they are how a central bank runs its balance sheet under its mandate and the law on its accounts, like the interest it pays on reserves or the open-market operations that keep reserves at their target. They act the same in both modes, and they are labelled CONTRACT ("institutional or contractual rule"), not POLICY. The lever report's "Policy moved" check follows the policy settings (the key rate, the tax rates, VAT), which still never move on Manual unless the user moves them.

## Recalibration

| Parameter | Before | After | Why |
|---|---:|---:|---|
| `kappaR`, `kappaU` | none | 0.15, 0.15 | learning speeds; at 0.2 each a world-price rise left a wage gap of 0.0006 after 20 years (a model test), and either alone pushed a wage check out of range |
| `rStarBand` | none | 0.03 | the band of neutral-rate estimates for advanced economies, 2000–2020 |
| `escapeBand` | none | 0.0025 | fully on once the key rate is stuck; wider bands let the rule hover at the edge with taxes creeping up |
| `lamC` | 0.9 | 0.6 | with the learned neutral rate, consumption after a wage settlement was back near baseline by year 6, where the model's time-step error exceeds the half-step limit on wage-back-consumption (vetting open item 12); 0.6 a year is within Fuhrer's (2000) quarterly habit estimates |
| `betaI` | 0.35 | 0.5 | the slower habit left room in rate-output-trough's band to make the króna as sensitive to the rate as QMM's (MON-5 closed) |

Calibration checks that moved (before → after): `rate-output-trough` −0.57 → −0.52 (known gap: 25% deeper than QMM, was 40%); `rate-inflation-trough` −0.22 → −0.24; `rate-krona` 0.56 → 0.69 (no longer a known gap); `wage-key-rate-peak` 1.40 → 1.26; `wage-unemployment-peak` 0.93 → 0.96; `wage-price-level-6y` 3.79 → 3.49; `wage-back-output` 0.07 → 0.10; `wage-back-consumption` 0.23 → 0.19 (half-step share 0.97 → 0.92); `world-prices-krona-year1` 1.15 → 1.47; `tourism-slump` −4.82 → −5.10; `manual-tax-output` −0.43 → −0.34. Every check stays in its range.

## Alternatives considered

- **An unemployment-gap term in the rule instead of learning.** It leans harder on labour-market slack but leaves the steady-state error; at a weight of 1–2 it pushed wage-back-consumption out of range.
- **Learning from inflation alone.** A one-off wage settlement then winds the estimate up by about half a point and pushes wage-key-rate-peak above its range.
- **Stopping the estimate from falling while the rule is stuck at zero (anti-windup).** The rule then hovers just below zero, the escape clause is only partly on, and taxes creep up: tourism −60 ended with output −2.3% instead of −1.1%.
- **A slow factor-substitution stage for jobs (WAGE-JOBS-BEFORE-OUTPUT)** was tried alongside and works, but pushes wage-back-consumption past the half-step limit; it waits for the kernel's time-step fix (vetting open items 12 and 14).

## Known gaps

Lasting shocks still leave gaps on Automatic where the estimate reaches its band or capacity does not follow the labour force (public spending ±3, credit tightening, tourism −60 at the zero bound), and the foreign-rate lever keeps its FX-1 drift. The vetting record lists them with figures (open items 1–3 and 19).
