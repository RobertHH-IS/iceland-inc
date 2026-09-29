# 0007. Reference economy: anchored expectations, credit that follows its flow, a calmer demand block

Status: accepted (September 2026). From the economists' review of the lever-response report (`reports/levers/reference.md`), problems REF-LRPC-not-vertical, REF-wage-second-round, REF-manual-rate-sensitivity, REF-realbalance-too-strong, REF-credit-appetite-mechanism, REF-negative-deposit-rate and REF-manual-no-capacity-ceiling.

Unless a line says otherwise, every number below is the lever report's: the effect against the no-change run in the same mode, on Automatic, at month 240.

## The problems

- **The wage rule hid a partly anchored Phillips curve.** Wages passed on 0.7 of expected inflation, and expected inflation followed actual inflation alone. So a lasting boom or policy offset left a permanent output gap with steady inflation (key-rate offset +3: output −1.91%, inflation −1.46 pp; lending appetite +2: output +1.15%), while the natural rate was described as "unemployment at which wages grow only with expected inflation", which was untrue at 0.7.
- **Second-round effects were large.** A one-off 10% wage settlement raised the price level 21.9% for good.
- **Demand was too sensitive with no policy reaction.** On Manual, a key rate held 1 point higher for two years cost 2.6% of output within a year and 3.9% at the trough; spending and tax multipliers were about 3 within two years.
- **Inflation cut spending hard.** Households saved 0.9 of what expected inflation took off their deposits: 5% expected inflation cut desired spending by almost 4% of GDP, and the wage settlement cost 7.5% of output (real consumption −9.2%).
- **The lending-appetite lever was an investment shift, not a credit shock.** New loans jumped by the full setting in month 1 while investment adjusted at 2 a year, so firms first held idle deposits and paid them out as dividends; and investment stayed higher for twenty years whatever happened to net credit.
- **Deposits could pay a negative rate:** −1% with the key rate at 0%.
- **Nothing pinned the central bank's capital,** so the solved baseline (government spending, the tax rate, who holds the bonds) moved with unrelated settings such as the speed of consumption.

## The decisions

**Wages pass on all of expected inflation, and expected inflation is partly anchored to the target** (`labour-prices.ts`). `wageIndexation` is 1, as in the Iceland model's wage rule. Expected inflation moves toward 0.4 × inflation + 0.6 × the target (`expectationsAnchor` = 0.6; `inflationTarget` = 0, a new POLICY parameter the Taylor rule now also reads). This is Blanchard's (2016) "back to the 1960s" Phillips curve: while people trust the target, a lasting boom raises inflation by a steady amount instead of an accelerating one, so some output gap remains, and a one-off cost shock spreads only partly into the next wage round. The long-run gaps stay about as before (key-rate offset +3: output −1.92%, inflation −0.75 pp; government spending +3: output +1.47%, inflation +0.55 pp), but they now come from an explicit, documented anchor rather than a hidden one, and `src/models/reference/expectations.ts` marks them as intended. The wage settlement now raises the price level 12.2% (was 21.9%).

**Rate sensitivity and the multiplier are lower** (`demand.ts`): the saving incentive 0.7 (was 1), investment's rate sensitivity 0.45 (was 0.6), the accelerator 0.15 (was 0.3), and spending adjusts at 2 a year (was 4). Three calibration checks now hold the Manual responses: `manual-rate-hike-output` (−1.42% at the trough, was −3.87%), `manual-spending-multiplier` (+1.67% in year 1, was +2.30%) and `manual-tax-output` (−1.83% in year 2, was −3.12%). On Automatic: `rate-hike-output` −0.67 (was −0.99), `spending-multiplier` 1.63 (was 1.87), `wage-settlement-inflation` 8.50 (was 9.17).

**Households save to make up half of the inflation loss on their deposits** (`inflationAwareness` = 0.45, half the 0.9 they spend of income), a teaching value for partial money illusion; the term is tagged with the new concept `haig-simons-income`. With the anchor, the wage settlement now costs 6.5% of output at the trough (was 7.5%) and real consumption 7.3% (was 9.2%). Most of the rest is the Taylor rule reacting to the jump in 12-month inflation (the key rate rises about 4 points within a year) and the squeeze on firms' profits while prices catch up with wages; the lever's definition says so.

**The lending appetite works through the flow of net credit** (`banking.ts`, `demand.ts`). Firms take up the extra credit as fast as they turn plans into spending and spend the net new credit (the extra lending minus repayments on the extra debt, `creditInvestment`) on investment; a memo line, `appetiteLoans`, tracks the extra debt inside the loan book. Investment is now firms' own plans (`investmentPlan`, the old rule) plus that spending. So new loans and the spending they pay for move together (month 1: +0.33 each, was +2.13 against +0.33), the boost fades as repayments catch up (output +2.1% at month 19, +1.1% by year 10), the credit impulse turns negative after about two years, and when the appetite ends investment falls below normal until the extra debt is repaid. Output stays about 1% higher in the long run because the extra loans left extra deposits, which households spend from.

**Deposit rates are floored at zero,** as in the Iceland model ("Deposit rate at its floor: bank margin squeezed"). With the deposit rate stuck at zero once the key rate is below 1%, a large lasting cut can take the economy to the zero lower bound: spending −3 on Automatic keeps the key rate at zero for two years and output is still 1.3% lower at month 240, recovering as the debt rule cuts taxes. With the old demand block and fully adaptive expectations, the floor alone turned that run into a deflationary trap (output −13% and falling), which is one reason for the decisions above.

**The central bank keeps a capital target** (`cbCapitalTarget` = 7.2% of GDP, where the solver used to put it): it hands the government its profit plus capital above the target, minus any shortfall. The baseline is now unique; government spending is 16.56% of GDP (16.58% before), the tax rate 20.94% (20.96%).

**The Manual caveat is in the interface.** The stabilisers and key-rate levers say that with the key rate held nothing else anchors prices (Wicksell's cumulative process), so effects beyond two or three years on Manual show an economy without its nominal anchor.

## Alternatives considered

- **Full indexation to fully adaptive expectations** (Friedman 1968, Phelps 1967), which makes the long-run Phillips curve vertical. With the old demand settings it removes the long-run gaps from demand booms (spending +3: +0.24% output; lending appetite +2: +0.03%), but with the deposit-rate floor it sends Automatic into deflationary traps at the zero lower bound, with wages falling as fast as the floor allows (spending −3: output −13% and falling; lending appetite −2: −8.6%; tax +3: −3.6%), makes the wage settlement raise prices 57%, and lets inflation run away on Manual (spending +3: prices up more than fifty-fold in twenty years).
- **An anchor that drifts slowly toward actual inflation** (Erceg and Levin 2003), which would make the Phillips curve vertical in the very long run. In trials with the anchor at 0.5, learning at 0.05–0.2 a year, the traps return (spending −3: output −5.7% to −8.2% at month 240) and the wage settlement raises prices 23–39%. The anchor is fixed instead, which is a limit of this model: it does not show expectations coming unstuck when the target is missed for years.
- **Only lowering the rate sensitivities** (saving incentive 0.5, investment 0.3). Households' interest income on their deposits (0.9 × 76% of GDP per point of rate) then nearly outweighs the saving incentive, so the Taylor rule loses its grip: spending +3 leaves output 3% higher for good, the spending multiplier reaches 2.6, and cuts fall into traps (spending −3 and lending appetite −2: −13% at month 240). **Lowering the propensity to spend income** instead moves the solved baseline a long way (at 0.8, government spending 51% of GDP and a 60% tax rate) unless the propensity to spend wealth moves with it.
- **A fading lending lever tied to lagged total net lending** (κ × net lending): it would pick up the credit that investment itself induces. The appetite's own sub-ledger avoids that.

## The reference economy on Manual

Decision 0004's table (largest output deviation, %, 240 months), before → after:

| Shock | Manual, years 1–10 | Manual, years 11–20 | Manual, month 240 | Automatic, years 1–10 | Automatic, month 240 |
|---|---:|---:|---:|---:|---:|
| Spending +1% of GDP | 10.1 → 3.8 | 8.9 → 3.4 | −4.6 → 2.7 | 1.9 → 1.6 | 0.3 → 0.4 |
| Tax +1 pp | 8.5 → 3.2 | 7.4 → 3.1 | 0.4 → −2.3 | 1.4 → 1.2 | −0.2 → −0.3 |
| Wages +10% | 5.5 → 3.4 | 11.0 → 0.8 | −6.2 → −0.2 | 7.5 → 6.5 | 0.1 → 0.1 |
| Lending +1% of GDP | 7.3 → 2.3 | 9.4 → 0.7 | −9.4 → −0.7 | 1.5 → 1.1 | 0.6 → 0.5 |
| Key rate held at 4% | 5.6 → 1.5 | 12.4 → 1.6 | 12.2 → 1.6 | – | – |

Manual now swings for years rather than decades, but the default stays Automatic: with the key rate held, a lasting shock still moves output 3–4% and prices keep drifting.
