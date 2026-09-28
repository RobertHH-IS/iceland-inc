# 0004. Stabilisers: policy is held unless you say otherwise

Status: accepted (September 2026).

## The request

The user raised the income-tax rate and the key interest rate moved. Two policy rules acted by themselves and looked like levers changing on their own: the central bank's Taylor-type rule (the old `keyRateMode` = Rule, with `keyRateAddon`) and the debt rule on income tax (the old `fiscalRule` = On). Policy levers should stay where the user sets them, and the model should not keep "balancing things out with the other levers". The user proposed, and confirmed, this design:

- **One global setting, "Stabilisers": Manual or Automatic. Manual is the default.**
- **Manual.** Policy reactions switch off: every POLICY lever stays exactly where it is set. Institutional responses remain: tax revenue and unemployment benefits still rise and fall with incomes and jobs, at the rates set. Each lever whose rule would act now turns red and says what the rule would do ("Central bank's inflation rule: 4.25%"), with an "Apply" button that sets the lever to it. The user becomes the stabiliser.
- **Automatic.** The rules act: the central bank's rule sets the key rate and the debt rule leans on the income-tax rate. The levers they act through say so ("Set by Central bank's inflation rule: 4.25%"), and the user's lever becomes an offset on top of the rule.

**Institutional responses versus policy reactions.** Taxes that fall and benefits that rise in a downturn are part of the rules of the game (the *automatic stabilisers* of economics); they work in both modes. A decision rule of an authority that moves a policy setting in response to the economy is a *policy reaction*; it acts only on Automatic, and only if it is declared as a stabiliser.

## Contract changes (`src/core/types.ts`)

All are optional or additive; models without stabilisers compile and run exactly as before.

| # | Where | Change | Why |
|---|---|---|---|
| 1 | `LeverDef.showWhen?: { lever; equals: number \| number[] }` | The interface shows the lever only while another lever has one of those values. Presentation only: the engine applies its value regardless. | The key rate is a level on Manual and an offset to the rule on Automatic; showing both would invite setting one that does nothing. |
| 2 | `StabiliserDef { id; label; lever; suggestion; threshold; description; concepts? }` | A declared automatic policy reaction: `lever` is the POLICY lever it acts on or stands in for, `suggestion` a variable holding what the rule would set that lever to now, in the lever's units, `threshold` the gap (lever units) above which it calls for action. | Makes every automatic policy reaction visible and nameable, so none can act unseen. |
| 3 | `StabiliserDef.offset?` | The lever that offsets the rule on Automatic when it is not `lever` itself (`keyRateAddon` for the key rate; the income-tax lever is its own offset). | On Automatic the Manual key-rate lever is hidden; the note "Set by …" belongs on the lever the user sees. Not in the brief; the smallest way to say which lever that is. |
| 4 | `StabiliserDef.feed?: { raise; lower; indicator }` | Feed messages when the stabiliser starts calling on Manual; `{value}` is the suggestion and `{change}` the gap, in lever units; `indicator` is the chart the message opens. | `FeedRule`s are fixed strings on indicator thresholds; the message needs the rule's number and its direction. Not in the brief. |
| 5 | `ModuleDef.stabilisers?`, `ModelDef.stabiliserMode?: { lever; manual; automatic }` | Modules declare stabilisers next to the rules that implement them; the model names its global mode lever. A value nearer `automatic` than `manual` is Automatic (a tie too). | One global setting, as the user asked. |
| 6 | `Engine.stabilisers(): StabiliserState[]` | `{ id, label, lever, offset, suggested, current, gap = suggested − current, calling, automatic, description }`, in declaration order. `calling` = Manual and \|gap\| > threshold; nothing calls on Automatic, where the rule acts itself. | What the interface draws. |
| 7 | `Engine.feed()` items | Optional `stabiliser` id on narration that comes from a stabiliser. | The interface can tell the two kinds apart. |
| 8 | `CompiledModel.stabilisers`, `CompiledModel.stabiliserMode` | Published by the compiler. | Plain data for `ModelInfo`. |
| 9 | `StabiliserDef.shadow?: Id[]` | Variables that only feed the suggestion on Manual (`ruleRate`, `taxRuleAdjustment`). Ideas at play leaves them out on Manual, and always leaves out the suggestion. Influences and term baselines follow the current mode: the baseline is evaluated in both modes. | On Manual the shadows move but drive nothing, so counting them showed the Taylor rule as the top idea at play while it did nothing (audit H8, L2, L3). |

**Compile-time validation** (`compile.ts`). `showWhen` must name another setting or choice lever (not itself, not a one-off) and list at least one value, each an option when that lever is a choice. `stabiliserMode` must name such a lever, with two different values that are options of it; a mode lever no rule reads is a warning, as is a mode without stabilisers. Stabilisers need a `stabiliserMode`, unique ids, a label, a description and a positive threshold; `lever` and `offset` must be settings or choices other than the mode lever; `suggestion` must be a variable (and counts as read, so it draws no "not read" warning); a feed must have both messages and a real indicator; a `shadow` must list variables other than the suggestion that no other rule reads on Manual (the dry run evaluates every rule in both modes) and no flow pays; concept ids are checked like any other. Kernel internals: `KModel.cstabilisers` (indices) and `KModel.modeLever`.

**Narration** (`engine.ts`). On Manual the engine adds a feed item when a stabiliser starts calling, kept sparse: not when the user moved the stabiliser's lever or the mode since last month (the lever panel shows that call at once), and never a repeat in the same direction within a year of the last message. The state it keeps is in the engine's snapshots, so `seek` and forks replay the narration exactly (tested).

## The Iceland model

| Before | Now |
|---|---|
| `keyRateMode` (Rule + add-on / Fixed), `keyRateAddon`, `keyRateFixed` ("Key rate: fixed level") | `stabilisers` (Manual 0 default / Automatic 1; module `stabilisers`, section "Stabilisers", Policy). `keyRateFixed` "Key interest rate" (%, default 3 = the neutral rate, shown on Manual). `keyRateAddon` "Key rate: your offset to the rule" (pp, shown on Automatic) |
| `fiscalRule` (On / Off) and parameter `fiscalRuleOn` | Removed: the debt rule acts on Automatic and suggests on Manual |
| Key rate = max(0, rule + add-on), or the fixed level | Manual: max(0, `keyRateFixed`). Automatic: max(0, the rule's rate + `keyRateAddon`) |
| Tax rate = baseline + lever + debt rule (when on) | Manual: baseline + `incomeTax`. Automatic: + the debt rule's adjustment |

Two stabilisers:

| Stabiliser | Lever | Offset | Suggestion | Threshold |
|---|---|---|---|---|
| `keyRateRule`, "Central bank's inflation rule" (central-bank.ts) | `keyRateFixed` | `keyRateAddon` | `keyRateSuggestion` = max(0, 100 × `ruleRate`), % | 0.125 pp |
| `debtRule`, "Debt rule on income tax" (government.ts) | `incomeTax` | `incomeTax` | `taxRuleSuggestion` = 100 × `taxRuleAdjustment`, pp | 0.25 pp |

Both suggestions are computed every month in both modes: `ruleRate` and `taxRuleAdjustment` keep their smoothing on Manual as shadows of what the rules would do, and are only left out of the key rate and the tax rate. The key rate's regime reads "Held where you set it" on Manual, and its explanation says who sets it in each mode; the debt rule's reads "Suggestion only (Manual)".

**Two choices that differ from the brief.**

- **Thresholds are half a lever step**, so a stabiliser calls exactly when "Apply" (which rounds to the step) would move the lever, and stops calling once applied. For income tax (step 0.5) that is the brief's 0.25 pp. For the key rate (step 0.25) it is 0.125 pp: with 0.25 pp, income tax +1 pp makes the rule call only in month 15 (the gap is 0.19 pp at month 12), and the brief also requires a call within 12 months. With 0.125 pp it calls in month 10.
- **The debt rule's suggestion is the whole income-tax shift the rule would set given today's debt**: the user's current shift plus the change the rule calls for from there. The brief's wording ("the rule's shift plus the user's current shift") read literally makes every "Apply" ratchet: after applying +0.8 pp the rule still sees the same debt and suggests another +0.8 pp on top, month after month. With the rule's total, "Apply" closes the gap as it does for the key rate, and the rule's later suggestions follow debt as it responds. The consequence is the same as for the key rate: on Manual, a hand-set income-tax change reads as a departure from the rule, and the lever turns red with the rule's number.

**The steady state is identical.** All 372 variables, 68 stock positions and every solved and derived parameter of the old baseline are bit-for-bit the same (two new variables hold the suggestions; `fiscalRuleOn` is gone). 240 months without a shock drift by at most 3.1e-12 on Manual (7.6e-12 before, when the rules were on) and 5.7e-12 on Automatic.

**Calibration.** Every published response the 23 existing checks compare with comes from an economy whose policy reacts, so each scenario now starts with `stabilisers` = Automatic at month 0. Their results are unchanged: the stored indicator paths of all 23 golden scenarios are bit-for-bit the same, only their event lists gained that event.

| Check | Range | Before | After |
|---|---|---:|---:|
| Rate +1 pp: output trough, % | −0.6 to −0.25 | −0.332 | −0.332 |
| Rate +1 pp: output trough quarter | 4 to 7 | 6 | 6 |
| Rate +1 pp: inflation trough, pp | −0.35 to −0.1 | −0.315 | −0.315 |
| Rate +1 pp: inflation trough quarter | 5 to 9 | 5 | 5 |
| Rate +1 pp: króna peak, % | 0.3 to 1.5 | 0.442 | 0.442 |
| Wages +10%: inflation peak, pp | 1.5 to 3.5 | 1.910 | 1.910 |
| Wages +10%: inflation peak quarter | 4 to 8 | 5 | 5 |
| Wages +10%: key-rate peak, pp | 0.8 to 2 | 1.274 | 1.274 |
| Wages +10%: unemployment peak, pp | 0.3 to 1.2 | 0.462 | 0.462 |
| Wages +10%: price level after 6 years, % | 3 to 8 | 3.118 | 3.118 |
| Wages +10%: output, unemployment, real wage, consumption at year 6 ÷ peak | 0 to 0.25 | 0.156, 0.150, 0.026, 0.036 | the same |
| Spending +1%: output, year-1 average, % | 0.3 to 0.8 | 0.717 | 0.717 |
| Spending +1%: money, banks − pension funds, pp | ≥ 0.5 | 1.190 | 1.190 |
| Króna −10%: price level at 8 quarters, % | 1.5 to 3 | 1.752 | 1.752 |
| Lending: impulse months 1–12, 13–24, held 18–48, pp | ≥ 0.2, ≤ −0.2, 0 to 0.3 | 0.859, −1.082, 0.226 | the same |
| Tourism −30%: króna at month 12, % | −10 to −2 | −7.144 | −7.144 |
| Aluminium +20%: share of the windfall paid abroad | 0.6 to 0.95 | 0.849 | 0.849 |
| Wages +10%: profit squeeze, tourism ÷ retail | 2 to 6 | 3.748 | 3.748 |

Five new checks, on the default setting unless stated (sources in `calibration.ts`):

| Check | Measure | Range | Result | Half step |
|---|---|---|---:|---:|
| `manual-tax-key-rate-held` | Income tax +1 pp held: largest change in the key rate over 20 years, pp | 0 to 0 (the design) | 0 | 0.0% |
| `manual-tax-output` | Income tax +1 pp held: output, year-2 average, % | −0.8 to −0.15 (revenue +0.65% of GDP × a two-year multiplier of 0.25–1.2, with no monetary offset) | −0.357 (Automatic: −0.263) | 0.0% |
| `manual-wage-inflation-peak` | Wages +10%: inflation peak, pp; not a number unless the key-rate rule is calling at the peak and every chart stays finite for 20 years | 1.5 to 4 (as the Automatic check, up to full pass-through without the rate rise) | 2.122 in month 15 (Automatic 1.910); the rule suggests 4.49% against the held 3% | 0.2% |
| `manual-no-shock-drift` | No shock: largest move of any chart over 20 years | 0 to 1e-9 | 4.7e-12 | |
| `automatic-no-shock-drift` | The same on Automatic | 0 to 1e-9 | 5.7e-12 | |

The harness's own baseline layer now runs on Manual (the default); `automatic-no-shock-drift` keeps the old mode covered. The property tests draw the mode like any other lever, so about half their runs are Manual.

**Manual stays finite and balanced** for 20 years under every key lever (wages +10%; income tax −10, +1 and +10 pp; health +3 and other services −3% of GDP; tourism −30%; króna −10%; lending +1% of GDP; a held key rate of 0%, 4% and 15%). Moderate shocks stay small: the largest output deviation after wages +10% is 0.39%, after income tax +1 pp 0.79% (still falling slowly at year 20, since nothing offsets the tax), after a key rate held 1 pp higher 0.48%.

**Feed.** On Manual, "The central bank's rule would raise (cut) the key rate to 4.25%" and "The debt rule would raise (cut) income tax by 0.3 pp". The old feed rule "Government debt rises; the tax rule slowly leans against it" is now "Government debt rises as a share of GDP", which is true in both modes.

## The reference economy

The same pattern: a `stabilisers` module and setting, `keyRateFixed` (Manual) and `keyRateAddon` (Automatic) with `showWhen`, and two stabilisers, `taylorRule` (lever `keyRateFixed`, offset `keyRateAddon`, threshold 0.125) and `debtRule` (lever `taxRate`, threshold 0.25). The Taylor rule moved from `keyRate` to a new `ruleRate` (its add-on still shifts the rule's target, as the lever always said, so on Automatic its suggestion includes your offset); `keyRate` is the rule's rate on Automatic and the lever's level on Manual. The debt rule moved from `taxRate` to `debtRuleRate`; `taxRate` is that rate on Automatic and the normal rate on Manual. On Automatic every result is bit-for-bit as before (baseline and calibration goldens unchanged).

**Its default stays Automatic.** The reference economy has no anchor other than its two rules. Held on Manual it swings for decades after a small shock (largest output deviation, %, 240 months):

| Shock | Manual, years 1–10 | Manual, years 11–20 | Manual, month 240 | Automatic, years 1–10 | Automatic, month 240 |
|---|---:|---:|---:|---:|---:|
| Spending +1% of GDP | 10.1 | 8.9 | −4.6 | 1.9 | 0.3 |
| Tax +1 pp | 8.5 | 7.4 | 0.4 | 1.4 | −0.2 |
| Wages +10% | 5.5 | 11.0 | −6.2 | 7.5 | 0.1 |
| Lending +1% of GDP | 7.3 | 9.4 | −9.4 | 1.5 | 0.6 |
| Key rate held at 4% | 5.6 | 12.4 | 12.2 | – | – |

Everything stays finite and the books balance, but a teaching model in which 1% of GDP of spending moves output by 10% for twenty years (the cycle takes some sixty years to die away) would teach the wrong lesson. Its author added the two rules as its stabilisers, so it starts on Automatic; Manual is one click away and shows why they are there. The rule for authors is unchanged: automatic policy reactions exist only as declared stabilisers, and act only on Automatic.

## The interface

- **The setting** sits at the top of the lever panel: a segmented Manual / Automatic control with the usual info toggle (the lever's description and definition). It is taken out of the accordion sections; it counts in the panel's "changed" total when off its default.
- **`showWhen`.** Hidden levers are not drawn and not counted in section badges; a section with no lever shown is not drawn. **Switching mode puts the levers the new mode hides back to their defaults** (`resetsWhenSetting` in `levers.ts`), so a hidden lever never carries a setting the user cannot see: switching to Automatic returns the Manual key rate to 3%, and switching to Manual returns the offset to 0, so the key rate goes back to 3% until the user sets it. Each reset is a lever event, so share links and replays reproduce it.
- **Manual.** A lever whose stabiliser is calling gets a red left edge, a red border and a light red tint, and a line of red text "<label>: <suggestion in lever units>" (e.g. "Central bank's inflation rule: 2.51%") with a small "Apply" button that sets the lever to the suggestion rounded to its step. Its section header gets a red dot, open or closed. The red is `#FF6B6B` (6.3:1 on the cards) and never appears without the text.
- **Automatic.** The lever that offsets each rule carries a cyan note "Set by <label>: <value>": on `keyRateAddon`, what the rule sets the key rate to; on the income-tax lever, the debt rule's shift on top of it.
- **The map.** The Central bank card's "Key rate" gets a small cyan "rule" marker on Automatic (`CardMetricSpec.stabiliser`); nothing else is added.
- **Share links** carry the mode like any lever event (`6:stabilisers:1`).
- **The frame** carries `stabilisers` (`Engine.stabilisers()`), keeping its identity when unchanged.

## Alternatives considered

- **Keep the per-rule switches** (`keyRateMode`, `fiscalRule`) and default them off. Two switches with different vocabularies for one idea, and nothing to say what an off rule would have done. One setting plus suggestions answers the user's question: "who is moving my levers?" Nobody, unless you choose Automatic.
- **Let the rules move the lever values themselves on Automatic.** The levers would then change without the user touching them, exactly the confusion that started this. The rules act on the variables; the levers only ever change when the user changes them.
- **Compute the suggestion only on Manual.** It would jump into existence at the switch and could not be shown on Automatic. Both modes compute it, and each rule's smoothing runs continuously.

## Known gaps

- On Manual the debt rule reads a hand-set tax change as a departure from the rule (its suggestion is the rule's whole shift), so raising income tax turns that lever red at once. That is consistent with the key rate, but a user who wants a discretionary tax change and the rule's lean on top of it needs Automatic.
- Switching to Manual resets the key rate to its default rather than holding the rate the rule had reached; to carry the rule's rate over, press "Apply" after switching.
- The reference economy starts on Automatic, unlike Iceland, for the reasons above.
