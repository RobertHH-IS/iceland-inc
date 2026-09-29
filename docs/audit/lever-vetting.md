# Lever vetting, 29 September 2026

Economists vetted every lever of both models against theory and evidence. They proposed the signs any sound model should show, and those signs are now a regression gate: `src/models/<id>/expectations.ts`, checked by the harness and by `bun run levers` ([authoring §12](../authoring.md#12-vetting-levers)). This record says how the vetting was done, what each lever was found to do, what was fixed, what was refuted, and what is still open.

## How the vetting was done

1. **Vetting.** Eight groups of economists each took a set of levers: monetary policy, the exchange rate, trade, credit and housing, the labour market, taxes, public spending, and the reference economy. Each group read the lever definitions, the modules and the committed lever report (`reports/levers/`), then ran its own experiments:
   - traces of single levers at several sizes, in both stabiliser modes, to check signs, timing, linearity and symmetry;
   - counterfactuals that switch off one term of a rule (engine forks with disabled terms) to find which channel drives a result;
   - parameter variants, and runs of 480 to 720 months where the 240-month report could not show whether a path settles;
   - comparisons with published responses: the Central Bank of Iceland's QMM and DYNIMO experiments, VAR studies, multiplier surveys and the 2020 tourism collapse.

   Each group gave a verdict per lever (sound, questionable or wrong), a list of claimed problems, and a list of expectations: signs over spans of months, each with the theory behind it and a source.
2. **Challenge.** One or two reviewers who had not made a claim tried to refute each one by reproducing its numbers and testing its diagnosis. A claim was upheld only if the numbers reproduced and the diagnosis held; the reviewers often refined the fix. 53 problems were upheld and 18 claims refuted.
3. **Fixes.** The upheld problems were fixed in five areas (monetary policy and the exchange rate, fiscal, credit and housing, the real economy, the reference economy), each on its own branch, each reviewed, then merged. The golden scenarios, harness reports and lever reports were regenerated deliberately with the merge.
4. **The gate.** The proposed expectations were written into the two expectation files and run. The harness now fails when any of them does not hold, when a lever has none, or when a run it makes is broken. Where one failed, we decided whether the model or the expectation was wrong (below).

## Per-lever verdicts

The verdict is the vetters' at the time of the vetting; *Expectations* is how many are in the gate now (all hold). A lever marked questionable or wrong was so for the reasons given; most of those reasons were then fixed (next section).

### Iceland Inc.

| Lever | Verdict | What the vetting found | Expectations |
|---|---|---|---:|
| `keyRateFixed` | questionable | 1–36 months sound, linear and close to QMM (output −0.44% at 12 months per pp, inflation −0.32 pp, króna +0.35% on impact). Floating government debt reversed the sign after about eight years; 58% of the disinflation came from imputed rent; mislabelled concepts | 10 |
| `keyRateAddon` | questionable | Short run right. A lasting offset permanently lowered output and raised unemployment | 7 |
| `stabilisers` | questionable | Switching with no shock changes nothing (below 5e-12). Switching to Automatic after a hold jumped the key rate by 1.5–5.8 pp in a month | 3 |
| `kronaShock` | questionable | Signs right, pass-through about 0.2 at a year. The current account improved in month 1 (an inverted J-curve); the definition credited the wrong mechanism for the recovery; no foreign-currency debt | 8 |
| `foreignRate` | wrong | First three years right. Then the króna appreciated without bound and prices fell, because foreign income was paid out of non-residents' krónur | 7 |
| `importPrices` | questionable | Short and medium run sound; the inverted J-curve again; prices never settle on Manual | 8 |
| `foreignDemand` | questionable | Signs right. Export volumes and output jumped fully in month 1; nominal drift; exporters' debt without limit | 8 |
| `tourism` | questionable | First three years plausible against 2020. A lasting loss gave lasting extra inflation; fisheries hoarded the windfall and borrowed without limit in a boom | 10 |
| `fishPrices` | wrong | First-round signs right, but the windfall went mostly to repaying debt and deposits, so a price boom lowered output and raised unemployment for two decades; fish volume rose despite quotas | 12 |
| `aluminiumPrice` | questionable | Core lesson right (85% of a windfall leaves as dividends). Investment against a thin baseline profit; small nominal drift | 7 |
| `lendingAppetite` | sound | Loans create deposits, the credit impulse jumps and fades, a temporary push gives a boom and bust. Minor: an unlabelled lending floor, concept tags | 8 |
| `dstiCap` | questionable | One representative borrower, so ±4 pp did nothing and −15 pp almost nothing | 5 |
| `ltvCap` | wrong | Exempted lending that replaces repayments, so even a 25% cap did nothing; off by default although 80%/90% caps are in force | 5 |
| `pfForeign` | questionable | Right at ±5. Extreme at ±20 (the króna doubled); no channel to domestic yields; the definition's timing wrong for large moves | 8 |
| `wageSettlement` | questionable | Every sign and the sequence right. Nominal wages gave back most of the settlement; the settlement triggered a mortgage-credit surge | 10 |
| `migration` | questionable | The buffer works in the right direction, but migrants carried no housing demand, so emigration raised house prices | 7 |
| `unemploymentBenefits` | wrong | Demand side sound, but no reservation-wage channel, so more generous benefits permanently lowered unemployment | 3 |
| `incomeTax` | questionable | Signs, linearity and multipliers right on Manual. A spiral at +10 pp; lasting inflation shifts; tagged as an automatic stabiliser | 9 |
| `incomeTaxOffset` | sound | The Taylor rule and the debt rule behave as they should; the debt rule was tagged with the spending-rule concept | 7 |
| `vat` | questionable | Short run right (full pass-through, base effect, indexation). In the long run a VAT rise lowered the price level; the rule reacted to first-round effects | 8 |
| `health`, `education`, `otherServices` | sound | Multipliers 0.75–0.89 on impact, ranked by import leakage; month 1 identical in both modes | 8, 6, 6 |
| `publicInvestment` | questionable | Short run right. No public capital; on Manual it lowered real wages and consumption for twenty years | 8 |
| `oldAgeTransfers`, `familyBenefits` | questionable | Mechanics sound, multipliers well below purchases. Tagged as automatic stabilisers; family benefits taxed though child and housing benefits are tax-free | 7, 7 |
| `bondBuyers` | sound | The money accounting is right; texts described yield and króna channels the model does not have | 6 |
| `netImmigration` | not vetted | Added by the fixes (LAB-6); its expectations come from that fix | 2 |

### Reference economy

| Lever | Verdict | What the vetting found | Expectations |
|---|---|---|---:|
| `stabilisers` | questionable | Automatic is a textbook Taylor rule plus debt rule. Manual has no nominal anchor, and swings grew to output ±10–25% without a warning in the text. It gets no expectations of its own | 0 |
| `wageSettlement` | questionable | Signs right; the output loss (−7.5%) and second round (price level +22%) too large | 9 |
| `lendingAppetite` | questionable | Short-run signs right, but the appetite added to investment for good, whatever net credit did | 11 |
| `keyRateAddon` | questionable | Signs and timing good; a lasting offset left a lasting output gap; the text did not explain why the key rate rises by only part of the offset | 9 |
| `keyRateFixed` | questionable | Signs right, sizes 3–5 times the evidence; the Taylor rule credited for a hand-set rate | 8 |
| `govSpending` | questionable | Automatic textbook; Manual output 25% above capacity and the debt ratio falling after a spending rise | 11 |
| `taxRate` | questionable | Automatic sound; Manual unanchored; the debt rule 5–8 times stronger than estimates | 8 |

## Confirmed problems and how they were fixed

Before → after figures are from the fix reviews; the decision records named give the detail.

### Monetary policy and the exchange rate (decision 0007)

- **MON-1, floating government debt.** Government bonds now pay a stock-weighted average coupon that reprices as bonds mature (5-year average maturity). Per pp held: month-1 budget cost −0.49 → −0.14 pp of GDP; the output sign reversal moves from month 106 to month 120 and is now described accurately in the lever's definition.
- **MON-2, jump on switching to Automatic.** The rule now smooths from the rate in force. After a 4% hold for a year the switch moves the key rate 4.00 → 3.79 in a month (was 4.00 → 2.47). The debt rule's shadow has the same pattern (open, below).
- **MON-4, housing drives disinflation.** Imputed rent is a market-rent index tied to real house prices with elasticity 0.5; housing's share of the disinflation at 24 months falls from 58% to 40%.
- **MON-5, weak króna response.** Narrowed, not closed: 0.415 → 0.562% per pp against QMM's 0.67 (known gap).
- **MON-6, fast smoothing.** Quarterly inertia 0.47 → 0.70 (lamPol 1.4).
- **MON-7, concept tags.** A new interest-rate-channel concept; the Taylor rule no longer weighs on Manual.
- **MON-9, Taylor-principle test.** Tests the long-run coefficient that matters; aPiA 0.3 → 0.5, so lasting inflation moves the key rate 1.15 per point.
- **MON-11, output timing.** Partly: an investment planning stage makes investment bottom later; the output trough is still in quarter 4 on its own (quarter 5 with the smooth takeover).
- **FX-1, foreign income paid from non-residents' krónur.** Reserve income accrues to reserves, and reserves above an 18%-of-GDP target are sold back slowly. At +5 pp reserves settle at 23% of GDP instead of 46%, and broad money on Automatic +27% → +0.7%. Only partly fixed: the long drift largely remains until a foreign-currency liability exists (open).
- **FX-2, inverted J-curve.** A border import price follows the exchange rate at once; the wholesale price stays smoothed. A −10 króna shock now worsens the current account in month 1 (−1.78 pp) and improves it by month 12.
- **FX-4, carry and PPP.** Wanted carry holdings enter the portfolio target, so a credit boom or a rate rise no longer depreciates the real króna in the first two years. The slow PPP anchor is open.
- **FX-5, FX-6.** The kronaShock definition names the real mechanism (pension-fund rebalancing and the trade surplus) and says residents hold foreign assets but no foreign-currency debt.
- **FX-9, capital premium kink at baseline.** The loan premium is two-sided and linear around the capital target; asymmetry flags 6 → 0.
- **TAX-1, unbounded portfolio term.** The portfolio term is bounded and measured on net holdings. pfForeign −20: króna +104% → +19% at 12 months; incomeTax +10 on Manual: +1462% → +338% at 240 months. The 0.2 log-point acceptance bound is met through month 180 but not at 240 (known gap with a tripwire test).
- **TAX-8, the rule and VAT.** The rule's actual-inflation term looks through VAT; expected inflation still sees it.
- **Trade, Taylor principle part.** aPiA 0.5 (see MON-9).

### Fiscal

- **MON-1** as above (bond repricing).
- **SP-4.** Only the taxable 36% of family benefits is taxed (derived from Hagstofa TEK02011): month-1 budget cost per point 0.61 → 0.85, 12-month output +0.35% → +0.46%.
- **TAX-4.** Income tax, VAT, the deficit and net labour income are split into the base, the user's change and the debt rule, and transfers are retagged. After an income-tax cut, the multiplier ranks 2nd and automatic stabilisers 16th (was 15th and 2nd). Mirrored in the reference model.
- **SP-7.** Text: new bonds pay key rate plus a spread whoever buys; non-residents trade through the carry trade.

### Credit and housing

- **ltvCap (three claims).** The cap applies to all new purchase lending, with a smooth distribution of loan-to-value ratios (average new loan 63%); gross turnover of the housing stock is modelled; the default is today's 80% (90% for first-time buyers) and the lever runs monotonically from 50 to 100. A 50% cap now lowers mortgage debt by 1.03 pp of GDP and real house prices by 1.97% at 12 months.
- **dstiCap.** A distributional cap: −4 pp cuts lending 0.5–3%, −15 pp 10–20%, and +4 raises it.
- **Gross flows.** Baseline gross lending 2.4 → 6.3% of GDP, so lendingAppetite −3 halves origination instead of stopping it for three years.
- **pfForeign.** A domestic funding premium: tilting abroad raises covered-bond and indexed mortgage rates (0.145 and 0.075 pp at +5), and house prices no longer rise in the first three years at +20. The definition gives the cash-limited pace of large moves.
- **Lending floor label, concept tags.** The zero floor is labelled; credit concepts separate stock, flow and impulse.
- **LAB-3.** Desired debt follows smoothed income: the wage settlement's month-2 credit surge +1.27 → +0.10 pp of GDP.
- **LAB-4.** Migrants carry housing demand; emigration in a bust now lowers house prices.

### The real economy

- **Nominal drift (partly).** Wages and hiring are measured against the value-added price, so a terms-of-trade change no longer sets off endless conflict inflation. On Automatic, tourism −15 inflation at month 240 +0.82 → +0.07 pp (−0.04 now); on Manual +1.05 → +0.46. A real-side regression remains on Manual (open).
- **Exporter debt spiral.** Payout follows a partial-adjustment rule with owner injections and a leverage term on investment; worst loans relative to baseline over 600 months at most 2.1×.
- **Fish windfall hoarded.** Dividends and a fishing fee: five-year dividends at fish +30 0.70 → 3.03% of GDP-years, fee 1.36.
- **Month-1 export jump.** Rises in foreign demand and tourism arrive over quarters; falls in tourism stay sudden. Output peaks at month 9.
- **Fish volume and quotas.** Text now says quotas cap the catch and volume moves only a little.
- **LAB-1.** Benefits slow job search and shift wage setting: +30 pp raises mean unemployment over months 60–240 by +0.61 (Manual) and +0.78 pp (Automatic), was −0.15 and −0.05.
- **LAB-2.** Unit cost split into labour and import parts; the nominal give-back of a settlement at 12 months 2.7 → 1.9 points.
- **LAB-6.** A new netImmigration lever (a labour-supply shock).
- **TAX-2.** A cash-buffer term in consumption: working-age deposits no longer run out under income tax +5 or VAT +10.

### Reference economy (decision 0008)

- **FX-7, TAX-5.** New concepts: terms of trade, Dutch disease, resource rent, and a debt-feedback rule; tags corrected in both models.
- **SP-12.** The bond-buyer text says the state saves only the spread on central-bank-held bonds.
- **Negative deposit rate.** Floored at zero, with a regime label.
- **Tax explain on Manual, debt-rule strength.** Texts name the rate charged in each mode; the strong debt rule is documented as a teaching value.
- **Credit appetite mechanism.** The appetite finances investment through net new credit; the credit impulse turns negative after two years, with payback.
- **Long-run Phillips curve.** Wage indexation 1 with expectations anchored to the target (Blanchard 2016). Not vertical: the anchor is a documented model limit.
- **Second round, real-balance effect.** The price level after +10% wages +21.9 → +13.9%; the output trough −7.5 → −4.7%.
- **Manual rate sensitivity and capacity.** A calmer demand block: a 1 pp hold for two years −3.87 → −1.42% of output; Manual G+3 peak output +24.9 → +11.1%; three new Manual calibration checks. The texts say Manual has no nominal anchor.
- **Offset explanation.** The keyRateAddon definition explains the rule leaning against the offset.

## Refuted claims

In every case the numbers reproduced; the challenge rejected the diagnosis:

- **MON-8** (fixed-rate mortgages): the policy-lags concept does not say what the claim said it does, and floating mortgages are a known simplification.
- **FX-8** (the `importPrices` id): students never see the id; the lever's label and definition say world prices.
- **Exporter investment on a thin margin**: the documented arithmetic of a constant-elasticity rule on a small baseline profit, not an elasticity that explodes.
- **Aluminium rent linkages**: the missing power-price and alumina links are simplifications, not a defect in what the lever teaches.
- **Tourism jobs counted as wage bill**: the gap between the wage-bill share and the headcount share mixes two definitions, and the unemployment response is plausible against 2020.
- **Lending appetite raises spreads**: the small premium comes from bank capital falling during the boom, which is right.
- **No lasting house-price level effect of easier credit**: house prices follow the flow of credit by design.
- **LAB-5** (an instant migration buffer), **LAB-7** (fast employment), **LAB-8** (the wage rule's wording and tags): acceptable simplifications or correct texts.
- **TAX-6** (the month-1 budget sign after a VAT change): the indexation accrual is correct and documented.
- **TAX-9** (VAT pass-through speed) and **TAX-10** (±10 pp tax ranges): deliberate, documented choices.
- **SP-1** (no public capital), **SP-5** (one consumption habit), **SP-6** (public staff hired at once), **SP-8** (no debt premium on the bond rate) and **SP-11** (the bond-buyer lever counted Inert on its plain runs): documented design choices; the companion runs carry the bond-buyer lever.

## The regression gate

The vetting proposed 229 expectations: 185 for Iceland Inc. and 44 for the reference economy. The fix branches had already added 21 and 12 of their own. All are in the two files, with these changes of form:

- Modes: `both` became `any`; `manual` and `automatic` became `Manual` and `Automatic`.
- The migration expectations proposed on top of foreign demand −20% use `withCompanion: true`, which is that lever's companion shock; the bond-buyer ones use the option values (1 banks, 2 the central bank, 3 pension funds, 4 older households) on top of theirs.
- The stabiliser switch: the lever report and the harness now check an expectation on the stabiliser setting on the switch from one mode's no-change run to the other's. The switch is at month 0; a switch after a hold (MON-2) is covered by module tests instead.
- ltvCap: the vetting's "up" meant a 25% cap when the lever ran from 0 (off) to 25. After the fix the lever runs from 50 to 100 around today's 80%, so "up" is a loosening; the five ltvCap expectations now use `min` (a 50% cap), which is what they test.
- Four proposed expectations duplicated ones the fixes had added (VAT up and down on the price level, foreign demand on output and exports); each pair became one entry with both sources.

Result: 227 of the 229 proposed expectations hold, and so do all 33 from the fixes; the files hold 200 for Iceland Inc. and 56 for the reference economy. Every expectation marked in the vetting as "fails today, should pass after the fix" (dstiCap down, ltvCap, migration and house prices, fish prices and output in the first year, benefits and unemployment) now holds. The two that fail are left out of the gate (open items 1 and 2).

## Open items

1. **Inflation after a lasting foreign-rate rise does not quite return to target on Automatic.** The expectation "foreignRate up, Automatic, inflation over months 180–240 does not move" fails: −0.047 pp (at +1.25 pp; −0.25 pp at +5, +0.09 at −3). The model is wrong and the fix is not small: what remains is FX-1 without a foreign-currency liability that pays the foreign rate (a new instrument across banks, government and pension funds) and the rule's fixed neutral rate. Left out of the gate.
2. **Inflation after a lasting tourism fall does not quite return to target on Automatic.** "tourism down, Automatic, inflation over months 180–240 does not move" fails: −0.054 pp at −15 (−0.88 pp at −60, −0.07 at +30; fish +30 −0.29, foreign demand −20 −0.07). The cause is the Taylor rule's fixed neutral rate and fixed potential output (trade-taylor-fixed-potential): a proportional rule leaves a steady-state error. A slow neutral-rate learning term fixed it in a trial but pushed the wage calibration checks out of range, so it needs its own recalibration. Left out of the gate.
3. **The nominal side of lasting shocks on Manual.** With the key rate held and expectations half anchored, a lasting shock leaves inflation off target and the price level drifting (the texts say so). A lasting export gain on Manual ends with output below baseline after about ten years (tourism +30 −1.8%). The targets of the nominal-drift fix are not all met: Automatic trade levers within ±0.1 pp at months 180–240 fail for fish ±30 and tourism −60; public spending ±3 leaves about ±1 pp of inflation after 20 years on Automatic.
4. **FX-4 PPP anchor.** The króna still follows domestic prices within a month; from year 2, accumulated deficits weaken the real króna. Slowing the PPP term broke a calibration check.
5. **TAX-1 remainder.** The bounded portfolio term exceeds its 0.2 log-point bound at month 240 under income tax +10 on Manual; a central-bank intervention stabiliser and a separate import share for public investment are not built.
6. **MON-11 output timing, MON-5 króna response, the rate troughs.** The output trough of a 12-month hold is in quarter 4 (QMM: quarter 5); the króna responds 0.56% per pp (QMM 0.67); the output and inflation troughs are about 40% deeper than QMM. All are known gaps with tripwire tests in `calibration.ts`.
7. **The debt rule's shadow** (MON-2 item 6) jumps when switching to Automatic after a hold, as the rate rule did.
8. **Exporters' operating margin.** Under fish −30 fisheries stay loss-making before interest; their debt is bounded by owner injections, not by a crew-share wage.
9. **TAX-7.** Consumption habit is in nominal spending (budgets sticky in krónur), so VAT hits real consumption at once; a real habit pushed a calibration check out of range.
10. **Reference economy.** The long-run Phillips curve is not vertical (a fixed anchor); real consumption falls 1.57 times as much as real disposable income after a wage settlement (limit 1.5); potential output does not grow with capital; a large lasting spending cut holds the key rate at zero for about 15 years (documented as a liquidity trap, marked intended in its expectations).
11. **Assumed parameters** to calibrate against loan-level and rent data: turnover 0.05, average new-loan LTV 0.63, the DSTI and LTV spreads, the income smoothing, the migration speed and housing elasticity, the domestic funding premium.
12. **Numerics.** A first-order time-step error of about 0.02 in the wage-settlement consumption measure needs a kernel change (first-order hold or sub-stepping).
13. **Checks that are not signs.** The fish +30 zero-bound spiral and fisheries' debt appear only after 240 months; the cash limit and loan ratios are bounds, not signs. They are model tests (`tests/models/iceland-real-economy.test.ts`), not expectations, since the report measures only headlines and indicators over 240 months.

## Dropped as wrong or too strong

- The vetters themselves left out long-run "does not move" expectations wherever a known gap sits just above the report's floor of 0.01 (the reference economy's long run, the Iceland real wage after a settlement), and long-run nominal signs for tax levers until the nominal drift is fixed.
- The two expectations in open items 1 and 2 are not dropped: their theory is right and the model is not yet. They return to the file when those fixes land.
- The stabiliser switch expectations are kept, though at month 0 they are weak: they confirm decision 0004's single baseline, not the smooth takeover after a hold.

## How to rerun

```bash
bun run levers                   # both reports, with ✓ or ✗ per expectation; exits 1 if one fails
bun run levers --model iceland   # one model
bun run harness                  # the gate: robustness layer, "Lever expectations"
bun test tests/harness/lever-report.test.ts tests/models/models.test.ts
```

To vet a lever again, read its section of `reports/levers/<model>.md` in the order of [authoring §12](../authoring.md#12-vetting-levers), then trace it at several sizes and switch off terms in an engine fork to find the channel. To add or change an expectation, edit `src/models/<id>/expectations.ts`, rerun the report and the harness, and record here any you leave out.
