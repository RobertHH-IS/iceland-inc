# 0015. The debt rule's escape clause also covers a severe downturn

Status: accepted (September 2026). A repair from the verification of phases 1–4 of the [long-run anchors proposal](../design/long-run-anchors.md) (review items ECON-2 to ECON-5). It amends the escape clause of [decision 0009](0009-policy-rules-learn.md). What it leaves open is in the [lever-vetting record](../audit/lever-vetting.md), open items 21 and 22.

## The problem

Decision 0009 gave the debt rule an escape clause: while the central bank's inflation rule is heading below zero, the rule raises no taxes. Since decision 0012 the central bank reads slack from unemployment, which rises more slowly than output falls, so after a large fall in exports the key rate reaches zero only in the fourth or fifth year. Until then the escape clause did not apply, and the debt rule raised income tax in the middle of the slump. Tourism −60 with the policy rules acting (review ECON-4), against main before decision 0012:

| Tourism −60, rules acting | Main | Before this decision | Now |
|---|---:|---:|---:|
| Income tax, points, months 12 / 36 / 120 / 240 | 0.00 / 0.00 / 0.00 / 0.00 | +0.26 / +1.21 / +1.25 / +1.25 | +0.01 / +0.01 / +0.01 / +1.02 |
| Output, %, months 60 / 240 | −3.95 / −1.06 | −4.72 / −1.19 | −3.82 / −0.57 |
| Price level at month 240, % | | −7.8 | −2.9 |
| Inflation, months 180–240, pp | | −0.18 | +0.04 |
| Government debt at month 240, points of GDP | | +12.2 | +15.7 |
| Key rate first at zero; months at zero | month 7; 234 | month 43; 198 | month 49; 192 |

A debt rule that tightens in a severe slump before monetary policy has run out of room is procyclical consolidation, which Iceland's and the EU's fiscal rules are written to avoid.

## The decision

**The escape clause has a second condition: a severe downturn.** The debt rule's target (`taxRuleTarget`) does not rise above the shift in force while either condition holds, each phased in over a band so that nothing jumps; its weight is the stronger of the two:

- **a severe downturn** (new): the output gap the central bank reads from the labour market (`outputGap`, decision 0012) below −`downturnGap` (1.5% of output, about a point of unemployment above normal), fully on at −(`downturnGap` + `downturnBand`) = −3%;
- **the central bank's rule heading below zero** (decision 0009): as before, over the first `escapeBand` (0.25 point) of the shortfall.

The rule's regime label names the one that binds: "Escape clause: no tax rise in a severe downturn", or "Escape clause: no tax rise while the central bank's rule is heading below zero". The second label replaces "… while the key rate is stuck at zero", which was false with the key rate locked at 6% or 15% (review ECON-2): the clause reads where the rule is heading, not the rate in force.

| Parameter | Value | Basis |
|---|---|---|
| `downturnGap` | 0.015 | assumed: the European Commission's matrix of required fiscal effort (COM(2015) 12) asks less consolidation in "bad times", an output gap below −1.5%, and none for a country with debt below 60% of GDP (Iceland's baseline) in "very bad times", below −3%; Iceland's fiscal rules (Public Finance Act 123/2015) may be set aside after a severe economic shock, as they were from 2020 |
| `downturnBand` | 0.015 | assumed: the matrix's "bad times", where the effort is lower but not nil, as a linear phase-in |

The output gap is a shadow variable of the key-rate stabiliser; the debt rule reads it locked or not, as it already read where the key-rate rule is heading (decision 0010). The clause, like the rest of the rule, only prevents rises: the rule can still cut taxes.

## What moved

- **Tourism −60 with the rules acting** (table above): income tax no longer rises through the slump; output recovers faster than on main. Late in the second decade the rule's target hovers at the edge of zero, where the zero-bound clause is only partly on, and income tax creeps up, +1.02 points at month 240, as decision 0009 found for that band. The model test that pinned the old tax rise (below 1.5 points, output above −2.5% at month 240) now asks for no rise to month 120 (below 0.05), output above −4.2% at month 60 and above −1% at month 240, and a tax rise below 1.2 at month 240; both labels are tested.
- **Tourism −60 with the key rate locked:** income tax +0.01 through month 120 (was +0.95 from month 36); output −6.27% at month 60 (was −7.07%) and −0.95% at month 240 (was −0.90%).
- **Nothing else moves by more than 0.05% of output** in the lever report: the moves are in runs whose gap passes −1.5% for a while (net immigration +10 with the key rate locked, 0.04%; the króna +25, pension funds' foreign share −20, the key rate at 15%, import prices −20 and wage settlement +20, all smaller). No calibration check moves; no flag or expectation of either lever report changes. Two golden scenarios move (`calibration-tourism-slump` from month 5, `all-levers-unlocked` from month 38, beyond the golden tolerance) and are updated, and so does one legacy scenario in `tests/fixtures/scenarios-v1.json` (I2-auto, a tourism slump from month 24).
- **Mild slumps are unchanged.** Tourism −15, foreign demand −20 and lending appetite −3 keep the gap above −1.5%, so the debt rule still leans against their debt (tourism −15: income tax +0.27 points at month 36; a test checks it).
- **The implied-neutral-rate diagnostic:** held at a constant rate after tourism −60, inflation over months 180–240 still crosses target more than once, near 1.65% now; it no longer rises with the rate there (the test of a rising crossing now uses health −3, where it does).

## What this does not fix, and why

**R4, the escape clause on the rate in force, stays open (review ECON-2; open item 22).** With the key rate locked the zero-bound condition reads the unused rule, not the rate held. The proposal's fix R4 keys it to the held rate. Measured with this decision's rule, R4 alone makes the configuration more procyclical, as the proposal found for its prototype: tourism −60 with the key rate held at 3% ends with output −4.76% at month 240 (−0.95% without R4) and income tax +7.9 points; a 6% hold, −3.08% (−1.13%); pension funds' foreign share −20, −4.86% (−2.54%). So R4 waits for the counter-cyclical term the proposal requires with it. The label and the texts now say what the clause reads, and a model test pins today's behaviour: the 6% hold switches the clause on from about month 103, and the 15% hold keeps the debt rule idle for eight years while debt climbs 115 points of GDP, then consolidates fast.

**The counter-cyclical term (review ECON-3; open item 22).** With only the key rate locked, the debt rule leans against debt alone. The downturn condition stops it tightening in a severe slump, but in a mild one it still raises taxes as revenue falls (output at month 240, locked → key rate locked: lending appetite −3 +0.13 → −1.28%, loan-to-value cap 50 −0.20 → −1.12%, foreign demand −20 +0.63 → −0.88%). A fiscal rule for a held key rate would lean against the cycle, with a slow debt term under it (Kirsanova, Leith and Wren-Lewis 2009); the proposal's third-setting acceptance tests are its gate. That is a design for the owner, not a repair. Until then the key-rate lever's definition says so, and so does a line in the lever panel while the key rate is locked and income tax is not (`StabiliserDef.lockedAloneNote`).

**A tax lever held while the central bank's rule acts (review ECON-5; open item 21).** Moving income tax locks it, and with the key-rate rule acting nothing pays a tax cut back: the model has no stable path (Leeper 1991), and both teaching models run away on moderate steps (Iceland −2.5: output +3.2%, the price level +13.1% and the key rate +4.8 points at month 240, flagged Explosive; the reference economy's −0.5 and +1 likewise). The fix needs the owner: a fiscal backstop while the tax is held, a weaker interest-income channel, or a moved tax lever that tilts the debt rule rather than holding it. Until then the lever panel says it while income tax is locked and the key rate is not, a release-style test (`test.failing`) holds the criterion that no moderate tax step is Explosive, and a tripwire stops the runaway growing.

## Alternatives considered

- **R4 alone** (the reviewer's first option): measured above; it trades a false label for procyclical consolidation with the key rate held.
- **Relabelling only** (the reviewer's minimum): done, but it leaves tourism −60's tax rise in the slump.
- **The counter-cyclical term now:** the right fix for the key-rate-locked configuration, but a design with its own acceptance tests (convergence by month 1200, no held rate turning output positive before month 480), not a repair; it is open item 22.
- **A slump condition on unemployment directly:** equivalent, since the gap is Okun's factor times unemployment above normal; the gap is the measure the fiscal-rule literature uses.

## References

- European Commission (2015), Making the best use of the flexibility within the existing rules of the Stability and Growth Pact, COM(2015) 12.
- Kirsanova, T., C. Leith and S. Wren-Lewis (2009), Monetary and fiscal policy interaction: the current consensus assignment in the light of recent developments, *Economic Journal* 119(541).
- Leeper, E. (1991), Equilibria under 'active' and 'passive' monetary and fiscal policies, *Journal of Monetary Economics* 27(1).
- Lög um opinber fjármál (Public Finance Act) no. 123/2015.
