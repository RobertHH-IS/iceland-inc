# 0014. Every policy lever locked: the price level has no nominal anchor, by construction

Status: accepted (September 2026), part (a). Phase 4 of the [long-run anchors proposal](../design/long-run-anchors.md) (section D), with the owner's decisions 1, 2 and 12. The proposal's "Manual" is now *every policy lever with a rule locked*: the key rate and income tax both held ([decision 0010](0010-policy-padlocks.md)). Part (b), whether the real economy settles, is open; its norm test is next work (phase 6, below). This record documents open items 3, 10, 20 and TAX-2 of the [lever-vetting record](../audit/lever-vetting.md); item 16 stays open.

## The problem

With every policy lever locked, the key rate and the tax rates never move unless the user moves them. A lasting change then keeps drifting. Measured against the no-change run with every padlock closed, on today's model (two steps a month, the labour-market gap and króna stage 1; the proposal's figures for the model before them in brackets, at month 240):

| Every policy lever locked | Month 12 | 60 | 120 | 240 | 480 | 600 |
|---|---:|---:|---:|---:|---:|---:|
| Income tax +2.5: output | −0.57% | −2.06% | −3.01% | −3.86% (−3.81) | −4.95% | −5.48% |
| Income tax +2.5: inflation, pp | −0.37 | −0.69 | −0.85 | −1.09 (−1.11) | −1.42 | −1.57 |
| Income tax +2.5: price level | −0.4% | −2.8% | −6.5% | −15.4% (−15.8) | −34.5% | −43.7% |
| Income tax +2.5: debt ratio, points of GDP | −1.4 | −5.0 | −8.4 | −14.5 (−14.1) | −29.3 | −36.7 |
| Income tax +10: inflation, pp | −1.47 | −3.29 | −3.57 | −4.22 (−6.04) | −4.55 | −4.68 |
| VAT +2.5: price level | +1.5% | +0.5% | −1.5% | −6.7% (−6.8) | −18.9% | −25.1% |
| Key rate held at 4.75%: output | −0.82% | −1.19% | −0.20% | +1.36% (+1.34) | +3.08% | +3.59% |

A key rate held 3 points up (6%) turns output positive in month 126 (124 before), and at 15% the run is explosive. Two different things are wrong here, and they need different answers:

- **(a) The price level has no anchor.** Prices trend for as long as a lasting change keeps unemployment off normal.
- **(b) The real economy does not settle.** Output, the debt ratio and some sectors' balance sheets keep moving for centuries.

## (a) The decision: no nominal anchor, by construction

**Locked stays exactly as it is (owner's decision 1).** No rule reacts to prices while both padlocks are closed, and no hidden reaction is added: that would break model rule 11. With the key rate held and tax rates fixed, nothing but people's partial trust in the target anchors prices. That is the lesson, and the texts teach it.

**Why this is right, not a bug.**

- *Drift is correct while the rate is off the natural rate.* This is Wicksell's cumulative process (Wicksell 1898): a lasting shock that lowers the rate the economy needs leaves a held rate too high for good, so prices keep falling while unemployment stays up. With expectations half anchored to the target (`chi` 0.5, close to QMM's steady-state weight of about 0.57), a lasting unemployment gap gives a lasting inflation gap, and the price level trends. Fully adaptive expectations would make it accelerate (Friedman 1968); under rational expectations an interest-rate peg is indeterminate (Sargent and Wallace 1975).
- *Long holds in practice gave quiet inflation, not spirals* (Japan; the zero-bound years 2009–21; Cochrane 2018; Debortoli, Galí and Gambetti 2019): the lesson of anchored expectations and a flat Phillips curve (Blanchard 2016; Hazell, Herreño, Nakamura and Steinsson 2022). The anchor is borrowed from a central bank expected to act; QMM says so outright, Iceland's long-term expectations became better anchored after about 2012 but not fully (Pétursson, CBI Working Paper 77), and credibility erodes after years of misses (Carvalho, Eusepi, Moench and Preston 2023).
- *A stock-flow model with fixed taxes lacks only a nominal steady state.* Godley and Lavoie (Levy WP 494) show that with the tax rate fixed and an exogenous interest rate their economy converges in real terms; a fiscal reaction is needed only to hit an inflation *target* when the long-run Phillips curve is vertical.

**The size of the drift is the long-run Phillips slope, a calibration question (owner's decision 12).** Inflation gap ÷ unemployment gap at month 240, every policy lever locked:

| Every policy lever locked, month 240 | Unemployment gap, points | Inflation gap, pp | Slope |
|---|---:|---:|---:|
| Income tax +2.5 | +1.24 | −1.09 | 0.88 |
| Income tax +10 | +4.99 | −4.22 | 0.85 |
| VAT +2.5 | +0.69 | −0.60 | 0.88 |
| Health −3 | +3.43 | −2.71 | 0.79 |

The model's slope is about 0.8–0.9 points of inflation per point of unemployment, as before these phases. The anchored-expectations analogue of QMM's price equation (0.083 a quarter on the output gap, 0.625 on lagged inflation, eq. 7.1, at an Okun ratio of 1.6) is about 0.35–0.7, and US estimates since the 1990s are near 0.2 or below. Halving the slope would roughly halve the 20-year drift; it adds no anchor. It is referred to the calibration of the wage and price block (`phiU`, the wage error correction), with decision 0008's anchored-expectations reasoning, in the joint refit (phase 5). Raising `chi` above QMM's value to hide the drift stays ruled out.

## The held key rate: what the texts teach

A key rate held higher with income tax locked too first cools the economy, then reverses its effect on output after about ten years. At 6%: output is 1.42% lower after a year and 2.30% lower at the trough (month 39), above baseline from month 126, and 2.86% higher after 20 years with inflation 0.88 point higher. This is the **interest-income channel of stock-flow models** (Godley and Lavoie, model PC; decision 0002 named it so). With tax rates fixed, the government's growing interest bill is private income, and once enough debt has built up, spending out of it outweighs the higher rate. Interest reaches people two ways:

- **At once,** as interest on older households' bonds and deposits: their real interest income is 13% higher in the first month.
- **Slowly, through the pension funds.** Their higher income is credited to members' pension rights (`returnsCredited`), and higher rights raise pensions only as they are paid out (a fixed payout rate × pensioners' rights). Real pension payouts are 0.7% higher after a year, 4.9% after five, 8.5% after ten and 12.8% after 20. The key-rate text used to say that pension funds spend interest; they do not, and it now says how it reaches pensioners.

The reversal is at the **strong end of the evidence**: tightening does lower output for more than a decade (Jordà, Singh and Taylor 2024), but savers who gain interest income spend little of it (Auclert 2019). The texts say so, and the reversal month is a tripwire, not an expectation.

Two other theories are **not** what the model shows, and the texts say so:

- **Fiscal dominance** (Sargent and Wallace 1981; Blanchard 2004) is a real-world route by which a high rate can backfire, through forced monetisation or a default-risk premium that weakens the currency. The model has neither: nothing forces the central bank to buy debt, and there is no debt premium (lever-vetting SP-8). The 15% hold explodes because interest compounds on a debt that fixed tax rates never pay down, with the rate far above growth: output +34%, the price level +61%, government debt +320 points of GDP and the deficit 42% of GDP at month 240, still accelerating. The key-rate text now names fiscal dominance only as a question a real debt this large would raise, "which the model leaves out"; before, it called the run fiscal dominance.
- **The fiscal theory of the price level** (Leeper 1991; Sims 2011; Cochrane 2023) is the leading theory for a held rate with fixed taxes, and a contested one. It predicts a *one-time* shift of the price level, after which inflation settles, not the model's continuing slide (income tax +2.5: −44% by month 600). The text mentions it only as the theory the model does not follow.

## The texts

- **The key rate** (Iceland): the both-locked paragraph names the interest-income channel, its two routes to people, the strong end of the evidence, why the 15% run explodes, fiscal dominance as a route the model leaves out and the fiscal theory as a contrast; the locked sentence names Wicksell's cumulative process. The lever is tagged with the new idea *Nominal anchor*.
- **The nine tax, spending and transfer levers** (`HELD_RATE` in `government.ts`: income tax, VAT, the four public-spending levers, old-age transfers, family benefits and unemployment benefits): with the key rate held after a lasting tax rise, the rate is too high for the new economy, so prices keep falling while unemployment stays up (Wicksell); with the key rate held and tax rates fixed, nothing but people's partial trust in the target anchors prices; whether output and unemployment would ever settle is an open question about the model, not a law of economics.
- **The reference economy's key rate:** the reversal after about eight years is labelled the interest-income channel, at the strong end of the evidence.
- **A new idea, *Nominal anchor*** (`nominal-anchor`, Policy theme): what pins down prices in the long run, Wicksell's cumulative process when nothing does, why trust in the target slows the drift but cannot stop it, and that in Iceland Inc. the missing anchor is by design while the real economy settling is an open question.

`tests/models/iceland-locked.test.ts` holds the texts to this: both key-rate definitions name the channel and the evidence, the Iceland one says interest reaches pensioners through credited returns and never that pension funds spend it, every sentence in any lever definition of either model that mentions fiscal dominance says the model leaves it out, every one that mentions the fiscal theory begins "Nor does the model follow", and the tax and spending levers name Wicksell and the honest limit.

## The gates

Only signs are gated, and only over months the model can defend (owner's decision 1). Output bands are rejected: the model's own long run has no level to test against. Three lever expectations, every policy lever locked:

| Expectation | Months | Measured (mean effect) | Why this window |
|---|---|---:|---|
| Key rate up (6%): output falls | 1–96 | −1.70% (every month below baseline) | The reversal comes in month 126; a window to month 120 would sit six months from flipping |
| Income tax up (+2.5): output falls | 1–240 | −2.68% (every month below baseline) | The Wicksellian slump lasts for as long as the rate is held |
| VAT up (+2.5): price level rises | 1–36 | +1.36% | Pass-through first; the level falls below baseline from month 75 and the long-run sign stays ungated |

Two tripwires carry the magnitudes, in `tests/models/iceland-locked.test.ts`:

- **The held-rate reversal month.** For a key rate held at 6% with income tax locked, output is below baseline in every month of the first eight years and back above it in months 110–160 (now 126), pinned with its reason, the interest-income channel. The same test checks the channel: older households' real interest income up by more than 10% in the first month, real pension payouts up by less than 1% after a year and by more than 5% after ten, and credited returns above the no-change run.
- **No growing inflation gap within 240 months.** For every lever alone at its min and at its max (and every option of a choice), with every policy lever locked, the absolute inflation gap grows by less than 0.5 points between months 180 and 240. The proposal's first rule, "the change in inflation over months 180–240 stays below 0.5 points", also caught a gap shrinking toward zero, so this is its re-specified form. The one exception is the 15% key rate, whose gap keeps growing through interest compounding on fixed tax rates; the test pins it as growing by more than 0.5 so that the exception is dropped if it no longer needs to be.

  | Largest growth of the absolute inflation gap, months 180 → 240 | Main (proposal) | Proposal's package | Now |
  |---|---:|---:|---:|
  | Excluding the 15% hold | 1.33 (income tax +10) | 0.34 (public investment −3) | 0.34 (public investment −3) |
  | Next largest now | | | foreign rate +5 0.32, VAT +10 0.30, other services −3 0.28, income tax +10 0.25 |
  | The 15% hold | 1.44 | 2.12 | 2.16 |

The proposal's other two tripwires belong to part (b): they pin how the real economy drifts, which the norm test may change on purpose. They were first left to phase 6; the verification of phases 1–4 asked for them now, so that an unintended change shows before that work lands, and they are in `tests/models/iceland-locked.test.ts`, each saying that phase 6 may move it: the debt ratio after income tax +2.5 is 14.5 points of GDP lower at month 240 (bounds −16 to −13), and exporters' net assets (capital plus deposits less business loans) stay above zero to month 600 after income tax +2.5 (28.8 at baseline, 18.3 at month 600; bound 15), while after +10 they fall below zero in month 507, pinned to months 480–540 as a known limitation (fisheries' loans grow without limit, R2).

## The interface note

The proposal asked for a note when a Manual run holds a lasting lever beyond ten years. With padlocks the condition the user controls is the locks, so the note follows them: while every lever with a rule is locked, the lever panel shows one calm line at its top, "With the key interest rate and the income-tax rate both locked, nothing pulls prices back over the long run.", with a "Why?" link that opens *Nominal anchor* in the inspector. It is muted text, not a warning: locking both is a legitimate experiment, and the note says how to read its long run. The line is built from the stabilisers' levers (`allLockedNote` in `src/ui/model/levers.ts`), so the reference economy gets the same line, and it goes as soon as either padlock opens. A UI test renders the panel unlocked, with only the key rate locked, with both locked (with and without the link) and after unlocking income tax.

## (b) The real economy: open, not a theorem

The proposal's first revision said the debt ratio has no floor with r > g and a fixed primary surplus. That was wrong for this model and stays withdrawn: locked levers fix tax *rates*, not the primary surplus, and Godley and Lavoie show such an economy "will not generate explosive interest flows" even with r > g. The model's own long runs show the real drift is not about the Phillips curve either: with its slope set to zero (`phiU` 0), income tax +2.5 still gives output −4.6, −5.8, −6.8 and −8.9% at months 240, 480, 1200 and 2400 (measured before the long-run-anchors phases). The proposal's sector breakdown (R2) shows where the lasting surplus goes: once the government has bought back every bond it can, it piles up as idle cash in the treasury account at the central bank, and three sectors absorb the counterpart without changing their spending: the pension funds (their credited returns go to rights, which do not enter consumption), the central bank (whose net position nothing makes it or the government act on) and fisheries (whose loans grow without limit).

So whether the locked economy has a real steady state is an open question about the model's sector norms. **Next work (phase 6, part (b) of this record):** test three candidate norms together, to month 2400, with `phiU` 0 and at its default:

1. a pension-fund funding-ratio rule, as in Act 129/1997 Art. 39, with the proposal's R3 (pension rights in consumption);
2. the treasury account: idle government cash pays the key rate, or is lent back through a rule;
3. E1: insolvent firms' loans written off, and owners stopping recapitalisation.

The decision rule stays the proposal's: if output then settles (a change under 0.3 points between months 1200 and 2400) and the government balance returns to within 0.1 points of GDP, (b) was a missing norm and is fixed; if not, part (b) says in those words that it is a property of this model's sector structure. In the reference economy the same step is R6: decompose the held rate's reversal into interest income, the wealth term and the baseline-preserving offset before interest income is measured in real, Haig–Simons terms (lever-vetting item 10).

## What moved

No rule, parameter, calibration value or golden scenario changed: the model's numbers are the same. The Iceland lever report gains three expectations (216 of 216 hold, was 213) and new definition texts for the key rate and the nine levers above; its flags do not move. The reference report changes only the key rate's definition (52 of 52 hold). The harness reports count one more concept (68).

## Alternatives considered

- **A hidden anchor on locked levers** (a reaction to prices while the padlocks are closed): breaks model rule 11 and the owner's design. Rejected.
- **Raising `chi` above QMM's value** to shrink the drift: hides the lesson. Ruled out.
- **Lowering the baseline's r − g** (the proposal's R1): does not settle the locked economy (owner's decision 11).
- **Slow de-anchoring of `chi`, fiscal-theory or neo-Fisherian equations, household wealth norms, NAIRU or capital hysteresis:** not recommended by the proposal, and not built.
- **A third setting, "key rate held, fiscal rule on" (decision 3):** superseded by the padlocks. Locking only the key rate is that configuration (the lever report's `key rate locked`), as prototype F was built; the escape clause still reads the central bank's shadow rule, not the held rate (the proposal's R4), and a debt-only rule with the key rate held has no counter-cyclical term. Both stay open questions for the owner (recorded with decision 0012).

## References

- Auclert, A. (2019), Monetary policy and the redistribution channel, *AER* 109(6).
- Blanchard, O. (2004), Fiscal dominance and inflation targeting: lessons from Brazil, NBER w10389.
- Blanchard, O. (2016), The Phillips curve: back to the '60s?, *AER P&P* 106(5).
- Carvalho, C., S. Eusepi, E. Moench and B. Preston (2023), Anchored inflation expectations, *AEJ: Macro* 15(1).
- Cochrane, J. (2018), Michelson-Morley, Fisher, and Occam: the radical implications of stable quiet inflation at the zero bound, *NBER Macroeconomics Annual 2017*.
- Cochrane, J. (2023), *The Fiscal Theory of the Price Level*, Princeton.
- Debortoli, D., J. Galí and L. Gambetti (2019), On the empirical (ir)relevance of the zero lower bound constraint, NBER w25820.
- Friedman, M. (1968), The role of monetary policy, *AER* 58(1).
- Godley, W. and M. Lavoie (2007), Fiscal policy in a stock-flow consistent (SFC) model, Levy WP 494; and *Monetary Economics*, Palgrave Macmillan.
- Hazell, J., J. Herreño, E. Nakamura and J. Steinsson (2022), The slope of the Phillips curve: evidence from U.S. states, *QJE* 137(3).
- Jordà, Ò., S. Singh and A. Taylor (2024), The long-run effects of monetary policy, *REStat* (NBER w26666).
- Leeper, E. (1991), Equilibria under 'active' and 'passive' monetary and fiscal policies, *Journal of Monetary Economics* 27(1).
- Pétursson, T. G., Disinflation and improved anchoring of long-term inflation expectations: the Icelandic experience, CBI Working Paper 77.
- Sargent, T. and N. Wallace (1975), 'Rational' expectations, the optimal monetary instrument, and the optimal money supply rule, *JPE* 83(2); (1981), Some unpleasant monetarist arithmetic, *FRB Minneapolis Quarterly Review* 5(3).
- Sims, C. (2011), Stepping on a rake: the role of fiscal policy in the inflation of the 1970s, *European Economic Review* 55(1).
- Wicksell, K. (1898), *Interest and Prices*.
