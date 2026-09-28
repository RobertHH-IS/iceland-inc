# 0005. Position signs: a diagnostic beside the accounting checks

Status: accepted (September 2026). The kernel part is in place; the harness gate and the model floors follow (see "What comes next").

## The problem

The four accounting checks (architecture §4.4) prove that nothing leaks: every flow sums to zero, every financial instrument balances, every change in net worth is explained, and every position change has its postings. They say nothing about whether a balance sheet is one a real sector could have. A household's deposits can fall below zero, a pension fund can sell government bonds it does not own, a firm's loan can turn into an asset, and a firm's physical capital can go negative, while every residual stays below 1e-11.

The audit of 29 September 2026 (finding H1) found exactly that in the Iceland model. Setting each lever to its minimum and to its maximum for 240 months gives 38 lever-setting and position pairs with the wrong sign, among them:

- government bonds held by banks, pension funds and non-residents, and even the government's own bonds outstanding (surpluses buy back more bonds than holders have);
- deposits of pension funds (bond and foreign purchases paid from deposits), of working-age and young households (tax +10, VAT +10) and of non-residents (a large króna or pension-fund shock);
- business loans of fishing and other exporters (repayments beyond what they owe);
- the smelters' capital (aluminium −40: gross investment turns negative, see H2 below).

The reference economy has none, at rest or after its shocks.

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

Every exemption must be listed in this record with its reason, so that exemptions stay rare and reviewed. **Today there are none.** A candidate is non-residents' króna deposits (`deposits/W`), if the Iceland model chooses to treat them as a documented overdraft rather than give non-residents another buffer.

## Negative purchases (audit H2)

A negative `purchase` amount is not made an error. Postings are linear in their amount (decision 0001, change 3), so a negative purchase is an exact reversal: the buyer's real asset shrinks, and the seller pays the buyer and books negative income. It *un-produces* the asset; it is not a resale, which is a `trade`. The `LegDef` doc comment now says this, and that model authors should floor gross investment at zero with a `combine` and a named `regime`, so that capital shrinks only through depreciation. The sign diagnostic is what catches the harm a negative purchase can do: capital below zero.

## What comes next

1. **Model floors.** Each floor is a `combine` with a named `regime` on the existing rule, never a second equation (AGENTS.md rules 2 and 4): gross investment at least zero, firms' repayments at most what they owe, bond sales at most holdings, purchases paid from deposits capped by those deposits, buybacks capped by what holders can sell, and a liquidity limit on households' spending. Audit H1, step 3, lists them.
2. **The harness gate.** Once the floors land, the property and robustness layers fail on any violation of a position that is not exempt, and a sweep runs every lever at its minimum and maximum. Until then the diagnostic only reports.
3. **The interface** shows a violation as a warning, not as an accounting failure.

## Contract changes (`src/core/types.ts`)

| Where | Change |
|---|---|
| `InstrumentDef.mayGoNegative?: { reason; players? }` | The declared opt-out above. |
| `CheckReport.signViolations?`, `CheckReport.signTolerance?`, `SignViolation` | The diagnostic's report. |
| `EngineOptions.signTolerance?` (`engine.ts`) | The diagnostic's tolerance, default 1e-6. |
| `LegDef` doc | A negative purchase un-produces the asset; floor gross investment. |

All are optional or documentation; models compile and run exactly as before, and no number changes.
