# 0010. Policy padlocks: a lock on each lever with a rule

Status: accepted (September 2026). Supersedes the global stabiliser setting of [decision 0004](0004-stabilisers.md); the rest of 0004 (stabilisers are declared, a locked rule suggests, "Apply", the narration, shadows) stands.

## The request

Decision 0004 put every policy rule behind one global switch, Manual or Automatic. It kept levers still, but it made one choice for every rule at once, needed two levers for each policy (a held level on Manual and an offset to the rule on Automatic), and hid one of them in each mode. The owner asked for this design instead:

1. **Everything starts unlocked, which means automatic.** A policy lever with a rule behind it moves by itself: the rule sets the policy variable, and the lever's knob shows the live value. In Iceland those levers are the key rate (the central bank's inflation rule) and income tax (the debt rule); in the reference economy, its key rate and tax rate.
2. **Clicking the padlock locks the lever where it is now.** The policy variable holds that value until the user moves it. The rule keeps computing its suggestion, shown as on Manual before: the red marker, the Apply button and the feed message. Apply sets the lever to the suggestion and keeps it locked.
3. **Setting an unlocked lever, by dragging it or through a scenario event, locks it at the new value**, because the user has taken control. This is an engine rule, so the interface, scenarios and the harness agree.
4. **Unlocking hands the lever back to its rule**, which takes over smoothly from the value in force, with no jump in the first month.
5. **Locks are ordinary timeline events:** they replay, rewind (seek), fork and appear in share links like lever moves.
6. **Padlocks appear only on levers that have a rule.** VAT, spending, transfers, benefits, bond buyers and the DSTI and LTV caps never move by themselves and get none.
7. **The global setting, the add-on and the offset levers go.** One key-rate lever remains, `keyRate` (a level in %, formerly `keyRateFixed`), and one income-tax lever, `incomeTax` (pp against baseline). With every lock closed the model behaves as Manual did; with every lock open and no user move, as Automatic did.

## Kernel contract (`src/core/types.ts`)

| # | Where | Change | Why |
|---|---|---|---|
| 1 | `LeverDef.kind: 'lock'`, `LeverDef.locks?: { lever; stabiliser }` | A padlock is a lever of its own, 0 open (the default) and 1 closed, with the options Unlocked and Locked. **The compiler adds one per stabiliser, `<lever>Lock`** (`keyRateLock`, `incomeTaxLock`, `taxRateLock`), after the declared levers, with plain-English texts made from the stabiliser's and the lever's labels. A model may not declare one itself. | A lock that is a lever is set by the existing event machinery, so it replays, rewinds, forks and travels in share links with no new code; the engine snapshots it with the other lever values. Adding it in the compiler keeps the one-per-stabiliser rule true by construction. |
| 2 | `Ctx.locked(stabiliser)`, `RuleDef.locks?: Id[]` | A rule asks whether a stabiliser's padlock is closed, declaring the stabiliser in `locks`, as it declares `levers`. Reading a padlock with `lever()` is a compile error. | Rules read the lock by the stabiliser they belong to, not by a lever id they would have to spell. |
| 3 | `StabiliserDef.current(c: IndicatorCtx)` (required); `offset` removed | The policy value in force, in the lever's units, read at the end of a month (`100 × keyRate`; the income-tax shift in force). | What closing a padlock freezes the lever at, and what an unlocked lever shows. |
| 4 | `StabiliserState` | `{ id, label, lever, lock, locked, suggested, current, gap, calling, description }`. `current` is the lever's value while locked and `current()` while unlocked; `calling` = locked and \|gap\| > threshold. `automatic` and `offset` are gone. | What the interface draws. |
| 5 | `ModelDef.stabiliserMode` and `LeverDef.showWhen` removed; `ModelDef.legacyStabiliserMode` added | `showWhen` existed only to hide the lever of the other mode. The legacy description tells the migration how the model's old scenarios used the global setting (below). | Nothing is hidden any more. |
| 6 | `Scenario.version`; `SCENARIO_FORMAT` `iceland-inc/scenario@2`; `src/core/migrate.ts` | Version 2 is padlocks; version 1 is the global setting. `migrateScenario(model, s)` rewrites a version-1 scenario and returns notices; `engine.load` migrates one itself; `parseScenario` reads a file without a format tag as version 1. | Old files and share links load. |
| 7 | `KModel.stabiliserOfLever`, `KModel.inertByMask`, `CStabiliser.lock`; `Baseline.byMask` | Indices, and per lock configuration (a mask, bit j set when stabiliser j is locked) the variables that drive nothing and the baseline terms. | Ideas at play and influences follow the padlocks (below). |
| 8 | `lockAll(e, locked)`, `lockAllEvents(m, t, locked)` (`scenario.ts`) | Close or open every padlock: the old Manual in one call. | Tests, calibration and the harness. |

**The engine rules** (`applyEvent`, so every path that applies an event obeys them):

- **Closing an open padlock freezes the lever at the value in force**: the engine sets the lever to `current()`, read from the latest month, then closes the padlock. If the value in force is within `LOCK_SNAP` (1e-9 lever units) of the lever's own value, the lever keeps its value: locking an untouched lever at the baseline holds exactly its default, not a rounding of it (100 × 0.03 is not 3 in floating point). This keeps "every lock closed at month 0" bit-for-bit the old Manual.
- **Setting a lever whose padlock is open closes it**, and the lever takes the new value. No lock event is recorded: the replay applies the same rule. Apply is a setting of a locked lever, so it stays locked.
- **Opening a padlock** changes only the padlock. The lever keeps its stored value, which counts again only when it is locked again.

**Smooth takeover.** Each model's rules step from the value in force: Iceland's key-rate rule (`ruleAnchor`, decision 0007) and debt rule (`taxRuleAnchor`, decision 0009) already did; the reference economy's rules now do too (`ruleAnchor`, `taxRuleAnchor`), with their targets as variables of their own (`ruleTarget`, `taxRuleTarget`), as in Iceland. Unlocking therefore moves the policy one smoothed step from the held value.

**Shadows follow each stabiliser's lock.** A stabiliser's shadow variables drive nothing only while it is locked, and then only if no rule that still acts reads them: Iceland's debt rule reads where the key-rate rule is heading for its escape clause, so with only the key rate locked `ruleTarget` and `neutralRate` still count. The compiler works this out for every lock configuration by removing, until nothing changes, each shadow that a rule outside the inert set reads under it (`inertByMask`); with every stabiliser locked a declared shadow must stay inert (the old check). The baseline's terms are evaluated under every configuration (four for two stabilisers; at most eight stabilisers, 256 configurations), and influences compare with the configuration the values on show were computed under, so a lock shows from the next step.

**Stepping code touched** (for the branch that adds kernel sub-steps): `machine.ts` (`lockMask()` and `evalLocks`/`baseTermsByMask` replace `automaticNow()` and `evalAutomatic`/`baseTermsByMode` at the start of `evaluate()`; `Ctx.locked`), `engine.ts` (`applyEvent`, `stabilisers()`, the narration's per-stabiliser lock memory, `hLocks` in the history and `seek`, the migration in `load`), `steady.ts` (`byMask`). The order of a step is unchanged.

## Migration of version-1 scenarios

Each model declares `legacyStabiliserMode`: the old setting (`stabilisers`, Manual 0, Automatic 1, its old default: Manual in Iceland, Automatic in the reference economy), the held levels (Iceland `keyRateFixed` → `keyRate`, `incomeTax`; reference `keyRateFixed` → `keyRate`, `taxRate`) and the offsets (Iceland `keyRateAddon`, `incomeTaxOffset`; reference `keyRateAddon`, and `taxRate`, which was a level on Manual and a shift on top of the debt rule on Automatic). In month order:

- the old default, if Manual: every padlock closed at month 0;
- `stabilisers` = 0: every padlock closed at that month, **then each held lever set to the level the old Manual would have read** (its last value, set on Manual or Automatic, or its default). The owner's wording asked only for the locks; freezing at the rule's value instead of the held level would change the run, and with these sets it is the old one, number for number;
- `stabilisers` = 1: every padlock opened at that month;
- a held level set on Manual: kept, under its new id; set on Automatic, where it did nothing: dropped (and remembered for a later switch);
- an offset: dropped. If it was away from 0 while its rule acted, the run changes, and a notice says so: "From month 12 this scenario tilted a policy rule with 'keyRateAddon' = 1. Rules can no longer be tilted, so that setting was dropped and the rule acts as it is. To hold a policy away from its rule, lock its lever and set it."

Share links carry `v=2`; a link without `v` is version 1 and is migrated as it loads, and the interface shows the notices.

**Tested bit for bit.** Every golden scenario stored before this change (34 in Iceland, 9 in the reference economy), migrated from its version-1 event list, gives the stored indicator paths exactly, except the three whose offsets were dropped (both models' `all-levers-automatic`, the reference `rate-hike-output`). `tests/fixtures/scenarios-v1.json` keeps eight version-1 scenarios with values the engine gave before padlocks (held rates, switches both ways, the Iceland takeover); `tests/core/migrate.test.ts` checks each value exactly, and `tests/ui/scenario-url.test.ts` loads one as an old share link.

## Locked = Manual, unlocked = Automatic

| | Iceland | Reference economy |
|---|---|---|
| Every lock open, no user move, against Automatic | Bit for bit: every variable and position of every month, in every scenario checked | Bit for bit in every acting variable and position; the suggestions differ (below) |
| Every lock closed, against Manual | Bit for bit | Bit for bit in every acting variable and position; the shadows and suggestions differ (below) |
| Lever report runs (the same lever and value, Manual ↔ locked, Automatic ↔ unlocked) | 214 of 214 identical | 30 of 30 identical; the tax lever's unlocked runs are new (below) |
| Calibration (26 + 5 checks) | Every value unchanged | Unchanged but `rate-hike-output` (below) |

What differs, by design:

- **The reference economy's suggestions are where its rules are heading**, not their smoothed rates, as in Iceland since decision 0007 (`keyRateSuggestion` = 100 × `ruleTarget`; `taxRuleSuggestion` from `taxRuleTarget`). Its rules now step from the value in force, which is the held rate while locked, so a smoothed suggestion would be one step from the held rate and would hardly ever call.
- **Its takeover is smooth.** Switching the old reference economy to Automatic after a hold jumped onto the rule's shadow path; unlocking now moves one smoothed step from the held rate (`tests/models/reference-review.test.ts`).
- **The Iceland no-change golden (`baseline`) now runs unlocked**, its new default; its drift, below 1e-13, moved in the last digits. Iceland's module tests that set no padlock also run with the rules acting now; they all pass, and the details the harness report prints moved.

## Levers, calibration and expectations

- **Moving a policy lever locks only that lever.** The old Manual held both policy levers; now moving the key rate leaves income tax to the debt rule, and moving income tax leaves the key rate to its rule. That is a configuration the old design never produced, and the lever report shows its consequences:
  - *A held key rate with the debt rule acting* keeps cooling the economy, and the debt rule pays for the higher interest bill with taxes: Iceland at 6% ends with output 0.8% lower after 20 years, debt 30 points of GDP and income tax 3.5 points higher; at 15%, debt about 270 points and income tax 38 points higher (Extreme).
  - *A held tax with the central bank's rule acting* has no fiscal anchor. In these economies the interest a higher key rate pays is income that is spent, so an active monetary rule with no fiscal rule has no stable path (Leeper 1991): Iceland income tax −2.5 points ends with output 3.2%, debt 64 points of GDP and the key rate 7 points higher after 20 years, all still rising (Extreme, Explosive); +2.5 holds the key rate at zero from the eleventh year. The reference economy runs away sooner: its tax lever at −3 no longer stays finite for 20 years, so **its range is now −2 to +3** (it was ±3, when the lever was an offset under the debt rule); at −2 output ends 80% higher. These runs are in each lever's definition. To lean on a rule without holding the policy, lock the lever, set it, and unlock it: the rule carries on from there.
- **Calibration.** Iceland's checks keep their experiments: those that ran on Automatic run unlocked (the default), the rate experiment locks the key rate at +1 pp and income tax, and unlocks both at month 12, and the five Manual checks close both padlocks at month 0; they are renamed `locked-…` and `unlocked-no-shock-drift`. Every value is unchanged. The reference economy's `rate-hike-output` added a 1 pp offset to the Taylor rule for two years (−0.682%); rules can no longer be tilted, so it now locks the key rate 1 point above neutral for two years and then unlocks it (−1.492%, inside its range of −3 to −0.05).
- **Expectations.** Mode `Automatic` became `unlocked` and `Manual` `locked`. The offset expectations became expectations on the key rate or income tax locked higher or lower with the other rule acting (`unlocked`), except one, dropped with its reason in [the lever-vetting record](../audit/lever-vetting.md): the reference offset's "inflation settles lower over twenty years", which described a rule with a lower target, not a held rate. The expectations on the global switch became expectations on the padlocks: opening or closing one with no shock changes nothing. Iceland's report runs a third configuration, **'key rate locked'** (the key rate held, the debt rule acting), with two expectations of its own.
- **The harness** runs its lever extremes and all-levers goldens in two configurations, 'unlocked' and 'locked'; the padlocks are configurations, not levers, and need no expectations. The report's "Policy moved" flag now checks a policy instrument whenever it is held (its padlock closed, or it has no rule), and "Mode sign" became "Lock sign" (locked against unlocked).

## The interface

- **A padlock beside each lever with a rule** (`LeverPanel.tsx`): an open or closed padlock icon (`common.tsx`, in the style of the other icons), `aria-pressed`, `aria-label` "Lock the key interest rate" or "Unlock the key interest rate", and a `title` that says in plain words what the lock means now and what pressing it does. Levers without a rule have none.
- **Unlocked** levers look automatic, calmly: a hollow cyan knob, a cyan fill, a small "auto" tag, and the rule's live value to two decimals. A step (− or +) moves from that value and locks the lever there.
- **Locked** levers are the user's, amber like any changed lever, with an amber closed padlock; the red call, Apply and the red section dot show only while locked. A locked lever counts as changed; the padlock, not the undo button, hands it back.
- The Manual/Automatic control, the offset levers, the "Set by …" note and the client's `keepHiddenAtDefault` are gone. The map still marks a number "rule" while its stabiliser is unlocked.

## Alternatives considered

- **A lock state outside the lever values** (a set in the engine). It would need its own event kind, snapshots and share-link syntax; a lever needs none of these.
- **Declaring the padlocks in the models.** More text to keep in step with the stabilisers, and room for a lever with two padlocks or a stabiliser with none. The compiler writes them from the stabiliser, so every rule's lever has exactly one.
- **Keeping the offsets on unlocked levers.** The owner's design removes them: a lever either follows its rule or holds a value.
- **Locking at the rule's value when an old scenario switched to Manual** (the owner's literal wording). It changes old runs; setting the held levels after the lock reproduces them exactly.

## Known gaps

- Ideas at play counts every term upstream of a rule that acts: with only Iceland's key rate locked, the key-rate rule's target terms feed the debt rule's escape clause, so the Taylor rule can show as at play although the clause binds only near the zero bound.
- A held tax with the central bank's rule acting runs away within twenty years in both models, for the reasons above; the reference tax lever's range stops at −2 so that the lever extremes stay finite.
- The reference economy's `current()` for the debt rule measures the shift in force against the baseline rate, so a fork that overrides the normal tax rate (`forkParams`) shows the unlocked lever's value off by that override; the policy itself is unaffected.
