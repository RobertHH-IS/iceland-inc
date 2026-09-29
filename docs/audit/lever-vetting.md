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
| `tourism` | questionable | First three years plausible against 2020. A lasting loss gave lasting extra inflation; fisheries hoarded the windfall and borrowed without limit in a boom | 11 |
| `fishPrices` | wrong | First-round signs right, but the windfall went mostly to repaying debt and deposits, so a price boom lowered output and raised unemployment for two decades; fish volume rose despite quotas | 12 |
| `aluminiumPrice` | questionable | Core lesson right (85% of a windfall leaves as dividends). Investment against a thin baseline profit; small nominal drift | 7 |
| `lendingAppetite` | sound | Loans create deposits, the credit impulse jumps and fades, a temporary push gives a boom and bust. Minor: an unlabelled lending floor, concept tags | 8 |
| `dstiCap` | questionable | One representative borrower, so ±4 pp did nothing and −15 pp almost nothing | 5 |
| `ltvCap` | wrong | Exempted lending that replaces repayments, so even a 25% cap did nothing; off by default although 80%/90% caps are in force | 5 |
| `pfForeign` | questionable | Right at ±5. Extreme at ±20 (the króna doubled); no channel to domestic yields; the definition's timing wrong for large moves | 8 |
| `wageSettlement` | questionable | Every sign and the sequence right. Nominal wages gave back most of the settlement; the settlement triggered a mortgage-credit surge | 10 |
| `migration` | questionable | The buffer works in the right direction, but migrants carried no housing demand, so emigration raised house prices | 7 |
| `unemploymentBenefits` | wrong | Demand side sound, but no reservation-wage channel, so more generous benefits permanently lowered unemployment | 5 |
| `incomeTax` | questionable | Signs, linearity and multipliers right on Manual. A spiral at +10 pp; lasting inflation shifts; tagged as an automatic stabiliser | 9 |
| `incomeTaxOffset` | sound | The Taylor rule and the debt rule behave as they should; the debt rule was tagged with the spending-rule concept | 7 |
| `vat` | questionable | Short run right (full pass-through, base effect, indexation). In the long run a VAT rise lowered the price level; the rule reacted to first-round effects | 8 |
| `health`, `education`, `otherServices` | sound | Multipliers 0.75–0.89 on impact, ranked by import leakage; month 1 identical in both modes | 8, 6, 6 |
| `publicInvestment` | questionable | Short run right. No public capital; on Manual it lowered real wages and consumption for twenty years | 8 |
| `oldAgeTransfers`, `familyBenefits` | questionable | Mechanics sound, multipliers well below purchases. Tagged as automatic stabilisers; family benefits taxed though child and housing benefits are tax-free | 7, 7 |
| `bondBuyers` | sound | The money accounting is right; texts described yield and króna channels the model does not have | 6 |
| `netImmigration` | not vetted | Added by the fixes (LAB-6); its first expectations came from that fix, the long-run ones from the re-vetting (NETIMM-VANISHES) | 5 |

### Reference economy

| Lever | Verdict | What the vetting found | Expectations |
|---|---|---|---:|
| `stabilisers` | questionable | Automatic is a textbook Taylor rule plus debt rule. Manual has no nominal anchor, and swings grew to output ±10–25% without a warning in the text. It gets no expectations of its own | 0 |
| `wageSettlement` | questionable | Signs right; the output loss (−7.5%) and second round (price level +22%) too large | 9 |
| `lendingAppetite` | questionable | Short-run signs right, but the appetite added to investment for good, whatever net credit did | 10 |
| `keyRateAddon` | questionable | Signs and timing good; a lasting offset left a lasting output gap; the text did not explain why the key rate rises by only part of the offset | 9 |
| `keyRateFixed` | questionable | Signs right, sizes 3–5 times the evidence; the Taylor rule credited for a hand-set rate | 8 |
| `govSpending` | questionable | Automatic textbook; Manual output 25% above capacity and the debt ratio falling after a spending rise | 9 |
| `taxRate` | questionable | Automatic sound; Manual unanchored; the debt rule 5–8 times stronger than estimates | 8 |

## Confirmed problems and how they were fixed

Before → after figures are from the fix reviews; the decision records named give the detail.

### Monetary policy and the exchange rate (decision 0007)

- **MON-1, floating government debt.** Government bonds now pay a stock-weighted average coupon that reprices as bonds mature (5-year average maturity). Per pp held: month-1 budget cost −0.49 → −0.10 pp of GDP; the output sign reversal moves from month 106 to month 136 (at 4%) and is now described accurately in the lever's definition.
- **MON-2, jump on switching to Automatic.** The rule now smooths from the rate in force. After a 4% hold for a year the switch moves the key rate 4.00 → 3.79 in a month (was 4.00 → 2.47). The debt rule's shadow has the same pattern (open, below).
- **MON-4, housing drives disinflation.** Imputed rent is a market-rent index tied to real house prices with elasticity 0.5; housing's share of the disinflation at 24 months falls from 58% to 40%.
- **MON-5, weak króna response.** Closed in the final repairs: 0.415 → 0.562 → 0.687% per pp against QMM's 0.67 (betaI 0.35 → 0.5, once the slower consumption habit left room in the output-trough band).
- **MON-6, fast smoothing.** Quarterly inertia 0.47 → 0.70 (lamPol 1.4).
- **MON-7, concept tags.** A new interest-rate-channel concept; the Taylor rule no longer weighs on Manual.
- **MON-9, Taylor-principle test.** Tests the long-run coefficient that matters; aPiA 0.3 → 0.5, so lasting inflation moves the key rate 1.15 per point.
- **MON-11, output timing.** Partly: an investment planning stage makes investment bottom later. The calibration experiment’s output trough is in quarter 5, as QMM’s, through the smooth takeover by the rule; a 12-month hold that returns to 3% on Manual still troughs in month 12, the last month of the hold (open item 6).
- **FX-1, foreign income paid from non-residents' krónur.** Reserve income accrues to reserves, and reserves above an 18%-of-GDP target are sold back slowly. At +5 pp reserves settle at 23% of GDP instead of 46%, and broad money on Automatic +27% → +0.7%. Only partly fixed: the long drift largely remains until a foreign-currency liability exists (open).
- **FX-2, inverted J-curve.** A border import price follows the exchange rate at once; the wholesale price stays smoothed. A −10 króna shock now worsens the current account in month 1 (−1.78 pp) and improves it by month 12.
- **FX-4, carry and PPP.** Wanted carry holdings enter the portfolio target, so a credit boom or a rate rise no longer depreciates the real króna in the first two years. The slow PPP anchor is open.
- **FX-5, FX-6.** The kronaShock definition names the real mechanism (pension-fund rebalancing and the trade surplus) and says residents hold foreign assets but no foreign-currency debt.
- **FX-9, capital premium kink at baseline.** The loan premium is two-sided and linear around the capital target; asymmetry flags 6 → 0.
- **TAX-1, unbounded portfolio term.** The portfolio term is bounded and measured on net holdings. pfForeign −20: króna +104% → +19% at 12 months; incomeTax +10 on Manual: +1462% → +211% (+196% after the final repairs) at 240 months. The 0.2 log-point acceptance bound is met through month 180 but not at 240 (known gap with a tripwire test).
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

## Final repairs after the re-vetting

A second round of vetting (the re-vetting, 29 September 2026) re-ran every lever on the merged model and checked each fix against its acceptance target. Its blockers and majors were repaired as follows; what could not be repaired is in the open items. Figures are before → after, from the lever runs; decision record [0009](../decisions/0009-policy-rules-learn.md) has the policy changes.

- **The rule learns its neutral rate (trade-taylor-fixed-potential, AUTO-FIXED-NEUTRAL).** The Taylor rule's neutral real rate is now an estimate (`neutralRate`) revised by 0.15 points a year per point of inflation off target and per point of unemployment off normal, within 3 points of 3%. Learning from both makes the rule see labour-market slack that output misses, and lets the two terms offset after a one-off wage settlement (the estimate moves less than 0.005 in six years). On Automatic, months 180–240: tourism −15 inflation −0.054 → +0.007 pp (open item 2 closed, back in the gate); fish +30 −0.29 → −0.14 pp and unemployment +0.39 → +0.22; ltvCap 50 output at month 240 −0.58 → −0.33%; dstiCap −15 −0.31 → −0.16%; lendingAppetite −3 −0.53 → −0.19%; pfForeign +20 +2.07 → +0.93%. The consumption habit was slowed (lamC 0.9 → 0.6) so that the wage-settlement checks stay clear of the half-step limit (open item 12); that also brought the rate experiment's output trough from −0.57% to −0.49%.
- **Escape clause for the debt rule (ZLB-DEBT-RULE).** While the central bank's rule is heading below zero, the debt rule raises no taxes (it can still cut them). Tourism −60 on Automatic: income tax at month 240 +3.27 → 0 points; output −3.85 → −1.06%; unemployment +1.42 → +0.57 points; price level −17.7 → −7.6%; inflation over months 180–240 −0.94 → −0.20 pp. The key rate still sits at zero from month 7 to month 240, which the tourism definition now says.
- **The debt rule steps from the rate in force (MON-2 item 6).** After incomeTax −3 on Manual for 60 months, switching to Automatic moves the tax rate 35.53 → 35.71% in a month (was → 39.38%). Its suggestion is now where it is heading, as the key rate's is.
- **Net immigration stays (NETIMM-VANISHES).** Newcomers join the labour force for good and take the first new jobs; the key-rate rule counts them in capacity. At +5 thousand, after 20 years: Automatic output +0.04 → +2.8%, jobs +0.02 → +1.5%, real house prices 0 → +4.8%, unemployment +0.3 points; Manual output +1.2%, jobs +0.9%, unemployment +0.8 points. Three long-run expectations added.
- **Benefits and jobs (BENEFITS-PARTICIPATION), partly.** On Automatic the rule now aims at the higher normal unemployment that benefits bring, so +30 points lowers jobs (−0.04 → −0.22% at month 240) and output (+0.05 → −0.40%); two expectations added. On Manual the demand effect still wins (open item 16).
- **Credit and spending levers on Automatic.** Their lasting gaps are smaller and their definitions state them (dstiCap, ltvCap, lendingAppetite, the spending and tax levers).
- **Manual real drift (MANUAL-REAL-DRIFT), documented.** The spending, tax and transfer definitions give the long-run output, unemployment and price paths on Manual (income tax +2.5: output −0.6, −2.1 and −3.8% at months 12, 60 and 240; VAT +2.5: price level −6.8% at month 240).
- **A 15% key rate held (KRF-EXPLOSIVE-TOP), documented.** The definition gives the long-run magnitudes (output +28%, price level +46%, debt +350 points of GDP at month 240) and names fiscal dominance.
- **Reserve management and the reference central bank's profit (RULE11-FXRESERVE-MANUAL).** Both are operating rules of the central bank, not policy settings: reclassified from POLICY to CONTRACT (decision 0009).
- **Fishing fee (FISHFEE-ONESIDED).** The change in the fee follows profit both ways; only the whole fee is floored at zero. Fish −8: fee change 0 → −0.17% of GDP at month 36 (+8: +0.17).
- **MON-5.** Closed (above): the króna rises 0.69% per point in the first quarter.
- **Reference dividends (REF-WAGE-DIVIDEND-SPIKE).** Firms smooth dividends (half of a change in profit at once, the rest as normal profit catches up). After a 10% settlement on Manual, real disposable income at month 3 −3.3 → −0.9% and the fall in real consumption within a year −5.4 → −5.0%. The Automatic output trough is a little deeper (−4.7 → −4.9%; open item 10).
- **Reference texts and gate (REF-KRF-LONGRUN-REVERSAL, REF-LA-INTENDED-LONGRUN, REF-MANUAL-ANCHOR-TEXT).** The held key rate's definition says it reverses after about eight years (month 102 at 4.75%; +3% output after 20 years) and why; the lending appetite's says the lasting gain is an Automatic result resting on anchored expectations and reverses on Manual; the wage settlement's and the stabiliser setting's say which mode the 14% is and that on Manual the real value of deposits pulls prices back. The three long-run "intended" entries left the expectation gate for module tests that pin them as limitations (tests/models/reference-review.test.ts), with a tripwire on the held rate's months 180–240.
- **Smaller items.** The rule's zero floor on its suggestion is a combine with a regime; every floor in both models carries a regime label, so the report lists no untraced kinks; explanations drop the e^(−λ/12) formula and "log points"; the reference credit impulse is labelled pp of baseline GDP and the report's unit workaround is gone; the central bank's capital target is marked derived; a steadily growing price level is Unsettled, not Explosive; the harness report no longer stores machine-dependent timings; the Iceland speed test allows 250 µs; the consumption cap uses `gapShare` and the liquidity limits share one helper (`liquidRate`).

### Flags the reference report still shows

Every reference run has a flag other than Regimes, and each is expected: **Unsettled** in every run, because on Automatic a lasting lever leaves inflation at a steady offset (anchored expectations, decision 0008) so the price level keeps growing, and on Manual nothing anchors the price level; **Mode sign** where Manual and Automatic differ in month 12 (the held key rate against the rule); **Extreme** in four runs: a 15% wage settlement in either mode (firms' real cash profit −54% in month 1, as wages jump before prices follow), and on Manual the key rate held at 10% (broad money +103% by month 240), spending +3% of GDP (price level +94%) and the tax rate −3 points (+80%), where nothing anchors prices; and one **Explosive**, the key rate held at 10%, whose interest income keeps accelerating (open item 10).

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

Result: 227 of the 229 proposed expectations hold, and so do all 33 from the fixes; the files held 200 for Iceland Inc. and 56 for the reference economy. Every expectation marked in the vetting as "fails today, should pass after the fix" (dstiCap down, ltvCap, migration and house prices, fish prices and output in the first year, benefits and unemployment) now holds. The two that failed were left out of the gate (open items 1 and 2); the tourism one returned with the final repairs. After them the files hold 206 for Iceland Inc. and 53 for the reference economy (below).

## Open items

Each item names the re-vetting finding it carries (in brackets) and gives the figures after the final repairs.

1. **Inflation after a lasting foreign-rate rise does not quite return to target on Automatic (FX-1, fx-FX-1).** The expectation "foreignRate up, Automatic, inflation over months 180–240 does not move" still fails: −0.039 pp at +1.25 pp. On Manual the króna is 5.5% stronger at month 240 and still rising, prices 2.7% lower and inflation −0.29 pp; the current account still jumps about +0.34 pp of GDP in month 1 (target 0.05–0.1 per point) and the government balance +0.17. What remains is FX-1 without a foreign-currency liability that pays the foreign rate (banks' foreign funding or Treasury FX debt, a new instrument across banks, government and pension funds) or a documented net pass-through parameter; the convergence test waits for it. Left out of the gate.
2. **Closed for tourism −15; still open for large and other lasting shocks on Automatic (trade-taylor-fixed-potential, AUTO-FIXED-NEUTRAL, EXPECTATION-GAPS).** With the neutral rate learned, "tourism down, Automatic, inflation over months 180–240 does not move" holds again (+0.007 pp) and is back in the gate. These still fail "does not move" over months 180–240 on Automatic and are not in the gate: tourism −60 inflation −0.20 pp and unemployment +0.71 points (the key rate is at zero from month 7 to 240 and the neutral-rate estimate at its lower limit); fish +30 inflation −0.14 pp; health +3 inflation +0.62 pp and unemployment −1.1 points, education +3 +0.80 pp and −1.3 points (public services move jobs more than output, so the rule's estimate reaches its limit); ltvCap 50 output −0.36% and unemployment +0.13 points, dstiCap −15 output −0.18%, lendingAppetite −0.75 output −0.05% and −3 unemployment +0.09 points. A labour-based potential output (capacity that follows the labour force for all shocks, not only the net-immigration lever) and a wider or faster learning band are the next steps; each moves the wage and rate checks and needs its own recalibration.
3. **The nominal and real drift of lasting shocks on Manual (trade-nominal-drift, TAX-2, MANUAL-REAL-DRIFT).** With the key rate held and expectations half anchored, a lasting shock leaves inflation off target, and output and unemployment keep diverging too; the definitions now give the magnitudes. Income tax +2.5: output −0.6, −2.1 and −3.8% at months 12, 60 and 240, unemployment +1.2 points, price level −16%, króna +23%. Income tax +10: output −19%, unemployment +3.1 points at month 60 and +6.8 at month 240, inflation about −5 pp; the surplus rises from about 4 to about 14 pp of GDP by month 480, and the reason is now known: once every bond is bought back, the surplus piles up in the treasury account at the central bank, banks' reserves turn into an overdraft (−26% of GDP at month 480), and the interest banks pay on it returns to the government as central-bank profit (0.8% of baseline GDP a year, against nominal GDP down to a tenth), so the government earns interest on its savings while deflation shrinks everything else; the accounting is right, and the cure is an anchor on Manual, not a change to the buyback. VAT +2.5: price level −6.8% at month 240, so a VAT rise still ends up lowering prices on Manual. Health −3: output −6.1%, unemployment +3.4 points; public investment −3: output −9%. A lasting export gain on Manual ends with output below baseline (tourism +30 −1.4%, fish +30 −2.6% with unemployment +0.9 points over months 60–240). A tourism fall of 60% ends at the zero bound with deflation on Automatic (item 2). A weak nominal anchor for Manual (a stronger chi, or item 4's PPP anchor) is the fix.
4. **FX-4 PPP anchor (fx-FX-4).** The króna still follows domestic prices within a month; from year 2, accumulated deficits weaken the real króna. lendingAppetite +3 on Manual: real exchange rate +0.11% at month 24, +0.26% at 36, +0.54% at 60, with exports up; incomeTaxOffset −2.5 on Automatic +0.18% at month 36; incomeTax −2.5 on Manual +0.34% at month 24. The proposed tests (real exchange rate ≤ 0 and exports ≤ 0 over months 12–36 in both modes) would fail, so they are not written. Slowing the PPP term broke a calibration check at the vetting.
5. **TAX-1 remainder (tax-TAX-1).** The bounded portfolio term exceeds its 0.2 log-point bound at month 240 under income tax +10 on Manual (króna +196%, output −19%); a central-bank intervention counterparty is not built, and the pfForeign and incomeTax ranges are unchanged. Public investment +0.8 on Manual still lowers real consumption (−0.19% at month 36, −0.15% at month 240) against the acceptance of at least baseline from month 24: public investment adds no public capital and crowds out private spending through prices (the definition now says so). A separate import share for public investment was not added: no source gives one apart from the TiVA import content of all investment (muI), which it already uses; the lever text no longer says "bought from domestic firms".
6. **MON-11 output timing and the output trough (monetary-MON-11).** On Manual a 12-month hold that returns to 3% still troughs in month 12, the last month of the hold, and with a permanent hold inflation troughs in month 20, before output in month 38. The calibration experiment troughs in quarter 5 as QMM's, through the rule's smooth takeover, with the inflation trough −0.24 pp as QMM's (−0.24) and the output trough −0.52%, about 25% deeper than QMM's −0.41% (a known gap with a tripwire test in `calibration.ts`). A consumption-growth habit is not built.
7. **Closed: the debt rule's shadow (MON-2 item 6)** now steps from the rate in force.
8. **Exporters' operating margin and payout (XF-PAYOUT-KINK).** Under fish −30 fisheries stay loss-making before interest; their debt is bounded by owner injections, not by a crew-share wage. Their baseline payout is about 4% of profit, so it sits next to the "Profits too low to pay out" and "Owners put money in" regimes, and small unrelated shocks switch them for decades (at the re-vetting, foreign demand +5 had owners putting money in over months 55–240). Recalibrating the baseline payout needs another steady-state target (decision 0003); the fishPrices definition says so.
9. **TAX-7.** Consumption habit is in nominal spending (budgets sticky in krónur), so VAT +2.5 cuts real consumption 0.74% in month 1 against 0.13% for an income-tax rise of the same size; a real habit pushed a calibration check out of range. Documented in the consumption rule.
10. **Reference economy (reference-REF-LRPC-not-vertical, REF-credit-appetite-mechanism, REF-WAGE-DIVIDEND-SPIKE, REF-KRF-LONGRUN-REVERSAL).** The long-run Phillips curve is not vertical (a fixed anchor): keyRateAddon +3 leaves output −2.2% and govSpending +3 +1.6% at month 240 on Automatic, and the lending appetite at +2 peaks at +2.2% in month 18 and still gives +1.2% at month 240, because the rule has no integral term (the definitions say so; option B, a vertical long run, is not taken). Module tests pin these as limitations, not expectations. On Manual a held key rate reverses its effect after about eight years (4.75%: output −2.6% at month 36, +3.0% at month 240), through interest income spent and anchored expectations; the definition says so and a tripwire test covers months 180–240. After a wage settlement real consumption falls 1.42 times as much as real disposable income (was 1.57; limit 1.5), and the Automatic output trough is −4.9% against +0.5–1 pp of unemployment in the evidence for Iceland; firms now smooth dividends. Potential output does not grow with capital; a large lasting spending cut holds the key rate at zero for about 15 years (a liquidity trap, in its expectations).
11. **Assumed parameters** to calibrate against loan-level and rent data: turnover 0.05, average new-loan LTV 0.63, the DSTI and LTV spreads, the income smoothing, the migration speed and housing elasticity, the domestic funding premium; and the neutral-rate learning speeds and band (kappaR, kappaU, rStarBand) and the escape clause's band.
12. **Numerics.** A first-order time-step error of about 0.02 in the wage-settlement consumption measure (wage-back-consumption) needs a kernel change (first-order hold or sub-stepping). It binds: with the consumption habit at 0.9 any faster recovery after a settlement (the neutral-rate learning) put that measure near zero, where the error exceeds the half-step limit; lamC 0.6 keeps it at 0.19 with a half-step share of 0.92.
13. **Checks that are not signs.** The fish +30 zero-bound spiral and fisheries' debt appear only after 240 months; the cash limit and loan ratios are bounds, not signs. They are model tests (`tests/models/iceland-real-economy.test.ts`), not expectations, since the report measures only headlines and indicators over 240 months.
14. **Jobs react to wages before output (WAGE-JOBS-BEFORE-OUTPUT).** After a +10% wage settlement on Automatic, employment falls within months while output falls later (unemployment peaks near month 7, output troughs in months 22–25). A slow factor-substitution stage (firms' view of the wage gap adjusting at 0.25–0.5 a year) made jobs follow output and moved the unemployment peak to quarters 8–10 with every calibration check in range, but put wage-back-consumption at a half-step share of 1.00–1.17 (item 12), so it waits for the kernel fix.
15. **Wages give back part of a settlement at once (labour-LAB-2).** On Manual, nominal wages are +8.0% at month 12 (2 points below the settlement) and +3.5% at month 240; the CPI peaks at +4.1% and ends at +3.5%, against CBI's about 4. The remaining error-correction cut is a known gap in `calibration.ts` (KNOWN_GAPS, wage-price-level-6y, with a tripwire on CBI's 4%): a contract-length lag is not built.
16. **Benefits on Manual (BENEFITS-PARTICIPATION).** With the key rate held, benefits +30 points raise jobs 0.3% and output 0.85% after 20 years, while unemployment is 0.6 points higher over years 5–20: the demand effect outweighs the reservation wage, which raises normal unemployment by only 0.3 points (uBenefit). The expectation "benefits up, Manual, jobs fall over months 60–240" fails and is not in the gate; routing the benefit effect through job finding (fewer vacancies filled) is the next step.
17. **The króna after a one-off shock (KRONA-NOMINAL-SNAPBACK).** After a −25% shock the nominal króna is back at baseline by month 36 (+0.8% on Manual) and ends 1.4% stronger, so inflation is −2.2 pp at month 36 on Manual (−2.4 on Automatic) and the price level returns to baseline (+0.03% at month 240), where Iceland 2008–09 left it permanently higher. The output boost (about +2.3% at 12 months per 10% depreciation) rests on assumed trade elasticities (eTour 1, eOther 0.8) and epsM 0.84; comparing with QMM's exchange-rate experiment is not done.
18. **Tourism and inflation (TOURISM-INFLATION-WEAK).** Tourism −60 weakens the króna about 10% by month 24, but inflation over months 6–24 is −0.15 pp on Manual and +0.47 pp on Automatic, where 2020–21 saw about +2 pp; foreign demand +20 on Automatic lowers inflation over months 6–36 (−0.23 pp) while unemployment falls. The expectation "tourism −60, inflation up over months 6–24" fails in Manual mode and is not in the gate; the balance between pass-through and the Phillips curve needs its own review.
19. **The zero lower bound on Automatic.** Tourism −60 keeps the key rate at zero for 234 of 240 months; incomeTaxOffset +10 for most of the twenty years (output −3.0% at month 240; the user's own offset, which the escape clause leaves alone). The neutral-rate estimate winds down to its limit meanwhile; stopping it at zero (anti-windup) was tried and made the recovery slower (output −2.3% instead of −1.1% at month 240), because the rule then hovered at the edge of the escape clause.
20. **A 15% key rate held (KRF-EXPLOSIVE-TOP).** The run is explosive (fiscal dominance: output +28%, price level +46%, debt +350 points of GDP at month 240). The definition says so; the range and a warning in the interface are unchanged.

## Dropped as wrong or too strong

- The vetters themselves left out long-run "does not move" expectations wherever a known gap sits just above the report's floor of 0.01 (the reference economy's long run, the Iceland real wage after a settlement), and long-run nominal signs for tax levers until the nominal drift is fixed.
- The expectations in open items 1, 2, 16 and 18 are not dropped: their theory is right and the model is not yet. They return to the file when those fixes land (the tourism one in item 2 already has).
- The stabiliser switch expectations are kept, though at month 0 they are weak: they confirm decision 0004's single baseline, not the smooth takeover after a hold.

## How to rerun

```bash
bun run levers                   # both reports, with ✓ or ✗ per expectation; exits 1 if one fails
bun run levers --model iceland   # one model
bun run harness                  # the gate: robustness layer, "Lever expectations"
bun test tests/harness/lever-report.test.ts tests/models/models.test.ts
```

To vet a lever again, read its section of `reports/levers/<model>.md` in the order of [authoring §12](../authoring.md#12-vetting-levers), then trace it at several sizes and switch off terms in an engine fork to find the channel. To add or change an expectation, edit `src/models/<id>/expectations.ts`, rerun the report and the harness, and record here any you leave out.
