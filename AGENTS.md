# Working on Iceland Inc.

These rules apply to everyone who changes this repository, people and coding agents alike. Read `docs/architecture.md` before your first change.

## Model rules

1. **Stocks change only through flow postings.** Never write an instrument position directly. One-off shocks may change only non-stock state, through `ShockApi`.
2. **One rule per variable.** To change how a variable is determined, add a rule with `replaces` in a module; do not add a second equation for it.
3. **Label every rule** `IDENTITY`, `CONTRACT`, `BEHAVIOUR` or `POLICY`. Published whole-model responses are calibration checks, never equations.
4. **Write rules as named terms** whenever they are additive, and set `combine` or `regime` when they are not. Tag terms with concepts.
5. **Every parameter has provenance:** `data` (with source and vintage), `calibrated`, `derived`, `assumed` or `placeholder`.
6. **Every lever has a precise `definition`:** level or growth, persistent or one-off, and what happens when it ends.
7. **Units are explicit.** Money flows are % of baseline annual GDP at annual rates; stocks are % of baseline annual GDP; rates are fractions per year. Never label two different measures with the same unit.
8. **Explanations are plain English.** Every `explain.what` and `explain.rule` should be readable by a curious non-economist. Define terms the first time you use them.
9. **Counterfactuals compare shocked and unshocked runs within the same variant,** and are never shown as an additive waterfall.

## Before you push

```bash
bun test          # kernel and module unit tests
bun run typecheck # TypeScript
bun run harness   # accounting, drift, calibration and robustness report
```

The harness must pass: accounting residuals and 240-month baseline drift below 1e-9, and every calibration check inside its range. If a change moves calibration results, say so in the pull request and update the golden scenarios deliberately.

## Packages

Only install npm registry versions published at least seven days ago, including transitive dependencies. `bunfig.toml` and `.npmrc` enforce this for Bun and npm. For a new resolution, run `bun install --lockfile-only` first to confirm the gate. If no eligible version exists, stop and report it; do not disable the gate, add exclusions or switch package managers. Keep `bun.lock` committed. Prefer no new dependency at all: the kernel has none.
