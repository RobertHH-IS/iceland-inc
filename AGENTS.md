# Working on Iceland Inc.

These rules apply to everyone who changes this repository, people and coding agents alike. Read `docs/architecture.md` before your first change.

## Model rules

1. **Stocks change only through flow postings.** Never write an instrument position directly. One-off shocks may change only non-stock state, through `ShockApi`.
2. **One rule per variable.** To change how a variable is determined, add a rule with `replaces` in a module; do not add a second equation for it. A floor or a cap (gross investment at least zero, sales at most holdings) goes on the existing rule as a `combine` with a `regime` that names, in plain English, what binds ("Sales limited by holdings"), never as a second rule.
3. **Label every rule** `IDENTITY`, `CONTRACT`, `BEHAVIOUR` or `POLICY`. Published whole-model responses are calibration checks, never equations.
4. **Write rules as named terms** whenever they are additive, and set `combine` or `regime` when they are not. Tag terms with concepts.
5. **Every parameter has provenance:** `data` (with source and vintage), `calibrated`, `derived`, `assumed` or `placeholder`.
6. **Every lever has a precise `definition`:** level or growth, persistent or one-off, and what happens when it ends.
7. **Units are explicit.** Money flows are % of baseline annual GDP at annual rates; stocks are % of baseline annual GDP; rates are fractions per year. Never label two different measures with the same unit.
8. **Explanations are plain English.** Every `explain.what` and `explain.rule` should be readable by a curious non-economist. Define terms the first time you use them.
9. **Counterfactuals compare shocked and unshocked runs within the same variant,** and are never shown as an additive waterfall.
10. **Positions keep the sign their role gives them.** A holder's asset never goes below zero and a liability never turns into a claim. A position that may take either sign by design (an overdraft facility, a net position) is declared with `InstrumentDef.mayGoNegative` and a reason, and needs a row in [decision 0005](docs/decisions/0005-position-signs.md); otherwise add a floor (rule 2).
11. **POLICY settings never change unless the user changes them;** automatic policy reactions exist only as declared stabilisers (`StabiliserDef`), which act only in Automatic mode and appear as suggestions in Manual mode. Compute each stabiliser's suggestion in both modes ([decision 0004](docs/decisions/0004-stabilisers.md)).
12. **Every lever has expectations and a clean lever report.** Declare what theory predicts for it in `src/models/<id>/expectations.ts`: signs any sound model should show, each with its theory and source, over months the model can resolve. A new or changed lever must leave `bun run levers` clean: every expectation ✓, no broken run (Non-finite, Residual, Sign, Implausible), and every new flag explained. Never weaken an expectation to make it pass; when one fails, fix the model or record why the expectation is wrong or out of reach in [docs/audit/lever-vetting.md](docs/audit/lever-vetting.md) ([docs/authoring.md](docs/authoring.md) §12).

## Before you push

```bash
bun test          # kernel and module unit tests
bun run typecheck # TypeScript
bun run harness   # accounting, drift, calibration, robustness and lever-expectation report
                  # (CI runs it with --full, which adds the half-step test's order of convergence)
bun run levers    # lever-response report; commit it when behaviour changes
```

The harness must pass: accounting residuals and 240-month baseline drift below 1e-9, every calibration check inside its range, and every lever expectation holding. The property runs, the lever-extremes sweep and the golden scenarios also fail on a value that is not finite (variables, stocks and charts), an implausible value (an unemployment rate outside [0, 50%], unemployed people below zero, a price index at or below zero, a negative key rate) or a position with the wrong sign (model rule 10). If a change moves calibration results, say so in the pull request and update the golden scenarios deliberately.

## Packages

Only install npm registry versions published at least seven days ago, including transitive dependencies. `bunfig.toml` and `.npmrc` enforce this for Bun and npm. For a new resolution, run `bun install --lockfile-only` first to confirm the gate. If no eligible version exists, stop and report it; do not disable the gate, add exclusions or switch package managers. Keep `bun.lock` committed. Prefer no new dependency at all: the kernel has none.
