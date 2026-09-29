# 0005. Position signs: a diagnostic beside the accounting checks

Status: accepted (September 2026). The kernel diagnostic, the model floors, the harness gate and the interface warning are in place.

## The problem

The four accounting checks (architecture §4.4) prove that nothing leaks: every flow sums to zero, every financial instrument balances, every change in net worth is explained, and every position change has its postings. They say nothing about whether a balance sheet is one a real sector could have. A household's deposits can fall below zero, a pension fund can sell government bonds it does not own, a firm's loan can turn into an asset, and a firm's physical capital can go negative, while every residual stays below 1e-11.

The audit of 29 September 2026 (finding H1) found exactly that in the Iceland model. Setting each lever to its minimum and to its maximum for 240 months gives 38 lever-setting and position pairs with the wrong sign, among them:

- government bonds held by banks, pension funds and non-residents, and even the government's own bonds outstanding (surpluses buy back more bonds than holders have);
- deposits of pension funds (bond and foreign purchases paid from deposits), of working-age and young households (tax +10, VAT +10) and of non-residents (a large króna or pension-fund shock);
- business loans of fishing and other exporters (repayments beyond what they owe);
- the smelters' capital (aluminium −40: gross investment turns negative, see H2 below).

The reference economy had none at rest or after its calibration shocks, but the lever-extremes sweep found one: a key rate held at 0% on Manual bought back more bonds than the bank held (and seven lever settings drove unemployment below zero, audit M22).

## The decision

**A separate diagnostic, not a fifth accounting check.** `measureChecks` and `CHECKS` stay the four accounting identities. The sign test is a question of plausibility, not of bookkeeping: a wrong-sign position can balance exactly. Keeping it apart keeps the 1e-9 accounting semantics, the fixed four residuals and `onCheckFailure: 'throw'` unchanged.

**The rule.** `measureSigns` (`src/core/checks.ts`) compares each position with its role (`KModel.role`), using the `Ctx.stock` convention in which holders' assets and issuers' liabilities are both positive:

- a holder's asset must be at least −tolerance;
- an issuer's liability must be at least −tolerance (a signed position above +tolerance means the liability has become a claim);
- a real asset has holders only, so the holder rule covers it.

The tolerance is the diagnostic's own, 1e-6 by default (`EngineOptions.signTolerance`): far above rounding and far below any position that matters. A NaN position is left to the accounting checks, which already count NaN as a failure.

**What the engine records.** Every step, and at month 0, the engine runs the diagnostic and records the **first** month each position breaks the rule, once per instrument and player: `CheckReport.signViolations: { instrument, player, role, t, value }[]`, oldest first, with `value` the position that month in the `Ctx.stock` convention. `CheckReport.signTolerance` gives the tolerance. A violation never throws and never enters `failures` or the residuals. `reset()` clears them; `seek`, `fork` and `load` reproduce them exactly, because they are rebuilt from the same steps.

**A declared opt-out.** Some positions are net positions by design: an overdraft facility, a clearing account, a net foreign position. A model says so on the instrument:

```ts
mayGoNegative?: { reason: string; players?: Id[] };
```

`reason` is required and must say why the sign is free. `players` limits the exemption to those holders or issuers; leaving it out exempts every position of the instrument. The compiler rejects an empty reason, an empty `players` list, unknown players, and players that neither hold nor issue the instrument. Exempt positions are skipped by the diagnostic (`KModel.signExempt`).

Every exemption must be listed in this record with its reason, so that exemptions stay rare and reviewed; a model test (`tests/models/models.test.ts`) fails when a declared exemption has no row below.

### Exemptions

| Model | Instrument | Positions | Reason |
|---|---|---|---|
| iceland | `reserves` | `B`, `CB` | The reserve account is the banks' net position at the central bank. Below zero, the banks are borrowing reserves from the central bank's lending facility against collateral, and pay the key rate on them (reserve interest is key rate × reserves; the real facility charges a little more). It happens only when a surplus held on Manual has bought back every bond it can (income tax +10 after about 13 years, public investment −3 after about 18): the treasury account keeps the rest of the surplus, and taxes paid into it drain reserves one for one. The alternative, a separate central-bank loan instrument, would show the same numbers on two lines. |

Considered and **not** exempted: non-residents' króna deposits (`deposits/W`). The Iceland model gives non-residents a buffer instead (they sell government bonds when their deposits run low), so no single lever at its limit overdraws them. Two combinations of extreme levers still do (decision 0002 §6), and stay pinned as known gaps in `tests/models/iceland-balance-sheets.test.ts` rather than hidden by an exemption.

## Negative purchases (audit H2)

A negative `purchase` amount is not made an error. Postings are linear in their amount (decision 0001, change 3), so a negative purchase is an exact reversal: the buyer's real asset shrinks, and the seller pays the buyer and books negative income. It *un-produces* the asset; it is not a resale, which is a `trade`. The `LegDef` doc comment now says this, and that model authors should floor gross investment at zero with a `combine` and a named `regime`, so that capital shrinks only through depreciation. The sign diagnostic is what catches the harm a negative purchase can do: capital below zero.

## The model floors

Each floor is a `combine` with a named `regime` on the existing rule, never a second equation (AGENTS.md rules 2 and 4), and none binds at the baseline.

- **Iceland** (decision 0002 §6 lists them): gross investment at least zero, firms' repayments at most what they owe, bond sales at most holdings, purchases paid from deposits capped by those deposits, buybacks capped by what holders can sell, a liquidity limit on households' spending, and a floor on the unemployed pool.
- **Reference economy:** the unemployment rate approaches the 2% between jobs in a boom but never reaches it: below 3% the extra work comes more and more from people joining the labour force and from longer hours (`unemployment`, regime "Few unemployed left: …"). The wage Phillips curve reads the work firms employ, not the floored rate, so excess demand keeps raising wages and prices; an earlier cap on hiring instead turned excess demand into output with wage pressure stuck at the floor (review E2). The central bank's open-market purchases take at most the bonds the bank holds and its sales at most its own ("Limited by the bank's bonds", "Limited by the central bank's bonds"); a surplus buys back at most the bonds the bank still holds after those sales, and the rest stays in the treasury account ("Buyback limited by the bank's bonds"). None changes a calibration result. The reference goldens moved by at most 8e-5, solver noise from the reordered simultaneous block; the unemployment floor binds in none of them.

## The harness gate

The property runs, the lever-extremes sweep (every lever alone at its minimum and at its maximum for 240 months, in each stabiliser mode that shows it) and the golden scenarios fail on any sign violation the kernel reports, and on any implausible value (an unemployment rate outside [0, 50%], unemployed people below zero, a price index at or below zero, a negative key rate). The harness reads the violations from `checks().signViolations`, so a declared exemption is honoured there as everywhere else. There is no switch to turn the gate into a warning: a position that may take either sign is declared on the instrument and listed above. A golden path with a breach is neither compared nor written.

## The interface

A combination of levers the harness never tries (the known gaps above) can still reach a wrong-signed position. The declared exemption is not one: banks' reserves below zero are a loan from the central bank, and the balance sheet shows them as a negative number without a warning. The interface shows it as a warning, not as an accounting failure: `Frame.signViolations` carries the kernel's list, the header shows a calm amber badge ("1 impossible position") beside the accounting badge, with each position and its first month in the tooltip, and the balance sheet of the player, or of any group containing it, lists them above the table and marks the row "(went below zero)" or "(turned into a claim)"; the sentences name the first month, since the position may have recovered. The words (`src/ui/model/signs.ts`) say that the books still balance but that no real sector could hold this. Going back in time before the first month clears the warning, as the kernel's list is rebuilt. `tests/ui/inspector.test.tsx` covers it.

## Contract changes (`src/core/types.ts`)

| Where | Change |
|---|---|
| `InstrumentDef.mayGoNegative?: { reason; players? }` | The declared opt-out above. |
| `CheckReport.signViolations?`, `CheckReport.signTolerance?`, `SignViolation` | The diagnostic's report. |
| `EngineOptions.signTolerance?` (`engine.ts`) | The diagnostic's tolerance, default 1e-6. |
| `LegDef` doc | A negative purchase un-produces the asset; floor gross investment. |

All are optional or documentation; models compile and run exactly as before, and no number changes.
