# Iceland Inc.

**An explorable economy of Iceland, built as money flowing between balance sheets.**

Pull a lever, such as a 10% wage settlement, a higher key rate, a cut in health spending or a weaker króna, and watch the change filter through the economy month by month until it settles. Click any flow to see what is driving it right now, the rule behind it, where the numbers come from and which economic ideas are at play.

Iceland Inc. is for learning, not forecasting. It starts from a quiet, steady baseline so that the effect of one change can be seen on its own.

## The idea

The model follows the flow paradigm of Wynne Godley and Steve Keen:

- **Players** hold balance sheets: three household age groups, domestic firms, exporters, banks, the central bank, the government, pension funds and the rest of the world.
- **Flows** move money between them. Every flow is recorded twice, as a minus for the payer and a plus for the payee, so nothing leaks.
- **Stocks** (deposits, loans, bonds, homes) change only because flows post to them. Money is created when banks lend or buy government bonds, and destroyed when loans are repaid. It is never set by a formula.
- **Rules** decide how big each flow is. Each variable has one rule, labelled as accounting, contract, behaviour or policy, and built from named terms. That makes "why is this moving?" answerable exactly.
- **Policy has padlocks.** The key rate and income tax have rules behind them: the central bank's inflation rule and the debt rule. Unlocked (the default) the rule moves the lever; move the lever, or close its padlock, and it stays where you set it while the rule only suggests, turning the lever red when it would move it. Every other policy lever stays where you set it.
- **Concepts** such as endogenous money, markup pricing, the Taylor rule and the credit impulse are attached to rules, so the interface can say which ideas are doing the work at any moment.

## Status

The foundation is in place and tested:

| Part | Where | State |
|---|---|---|
| Model language and engine contract | `src/core/types.ts` | Done |
| Kernel: compiler, payment system, ledger, solver, influences, scenarios | `src/core/` | Done, no runtime dependencies |
| Test harness: accounting, drift, calibration, robustness | `src/harness/` | Done |
| Reference model: a small teaching economy | `src/models/reference/` | Done, 3/3 calibration checks |
| Iceland model, as 14 modules | `src/models/iceland/` | Done: 14 players in a hierarchy of groups (six firm sectors, decision 0003), 372 variables, 23/23 calibration checks |
| Concept library: 59 economic ideas | `src/concepts/` | Done |
| Interface: flow map, inspector, ideas at play, levers, charts, ledger | `src/ui/` | Done (React) |
| Calibration data with sources | `data/iceland/` | Done |

Current results are in `reports/harness-*.md`: accounting residuals around 1e-12, no drift over 240 months, and the Iceland model within 4.3% of the legacy engine on 50 compared outcomes.

Next steps:
1. A balanced-growth baseline with 2.5% inflation, which fixes the overstated pension payouts.
2. Replacing the remaining placeholder parameters.
3. A "real terms" view that removes the effect of inflation from flows.
4. Showing a pipe's own drivers before upstream ones in "ideas at play".
5. Hiding badges for inactive caps.
6. "With and without this channel" comparisons.
7. A Web Worker for the engine.
8. A public demo site on GitHub Pages.

## Quick start

You need [Bun](https://bun.sh) 1.4 or later.

```bash
bun install
bun test
bun run harness
bun run dev
```

## Run the interface

```bash
bun run dev     # http://localhost:3000, with hot reload
bun run build   # a static site in dist/ that works from any sub-path (GitHub Pages)
```

The interface opens the Iceland model when it is registered in `src/models/index.ts`, otherwise the reference economy; the model switcher in the header lists every registered model. Pull a lever on the left and the clock starts: watch the pipes glow and the charts move, click any pipe, player, chart or idea to see what drives it, and use "Share scenario" for a link that replays exactly. See [docs/interface.md](docs/interface.md) for how it is built and how to extend it.

## Repository map

```
docs/                 architecture, authoring guide, decisions, research background
src/core/             the kernel (knows nothing about Iceland)
src/harness/          acceptance tests and reports
src/models/reference/ a small teaching model
src/models/iceland/   Iceland Inc., as modules
src/concepts/         the library of economic ideas
src/ui/               the interface
data/iceland/         calibration statistics with sources
legacy/v1-engine/     the previous engine, kept for reference and comparison
```

## Contributing

Read [docs/architecture.md](docs/architecture.md) first. The rules that keep the model sound are in [AGENTS.md](AGENTS.md); they apply to people as well as coding agents.

## Licence

MIT. See [LICENSE](LICENSE).
