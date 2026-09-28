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
- **Concepts** such as endogenous money, markup pricing, the Taylor rule and the credit impulse are attached to rules, so the interface can say which ideas are doing the work at any moment.

## Status

This is the foundation release. The platform's design is in [docs/architecture.md](docs/architecture.md), and the model language and engine contract are in [src/core/types.ts](src/core/types.ts). The previous engine (v1, plain JavaScript, 10 players, 20 calibration checks passing) is kept in [legacy/v1-engine](legacy/v1-engine) as a reference while it is ported into the platform.

| Part | Where | State |
|---|---|---|
| Model language and engine contract | `src/core/types.ts` | Done |
| Kernel: compiler, payment system, ledger, solver, influences, scenarios | `src/core/` | In progress |
| Test harness: accounting, drift, calibration, robustness | `src/harness/` | In progress |
| Reference model (small, for learning and kernel tests) | `src/models/reference/` | In progress |
| Iceland model, as modules | `src/models/iceland/` | In progress |
| Concept library | `src/concepts/` | In progress |
| Interface: flow map, inspector, levers, charts, ledger | `src/ui/` | In progress |
| Calibration data with sources | `data/iceland/` | Done |

## Quick start

You need [Bun](https://bun.sh) 1.4 or later.

```bash
bun install
bun test
bun run harness
bun run dev
```

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
