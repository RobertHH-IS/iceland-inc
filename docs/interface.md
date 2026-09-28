# The interface

The interface in `src/ui/` shows a model as a live machine: money flowing between players' balance sheets, all the time. Pull a lever and the machine keeps running while the change filters through the flows, month by month, to a new resting point. Click any flow to see what is driving it right now.

It is generic. Everything on screen comes from the compiled model and the engine; no view knows which model it is showing. A model registered in `src/models/index.ts` appears in the model switcher without interface code. The interface opens `iceland` when it is registered, otherwise `reference`.

```bash
bun run dev     # serve src/ui/index.html with hot reload (http://localhost:3000)
bun run build   # bundle a static site into dist/ (works from any sub-path, e.g. GitHub Pages)
```

## 1. Layers

```
src/ui/
  index.html, main.tsx, styles.css   entry point and the visual language
  engine-client.ts                   the only code that talks to the engine
  model/                             view-models: pure functions, unit-tested in tests/ui/
  views/                             React components, one per panel
  App.tsx                            model choice, shared links, and the workspace layout
```

### The engine client

`createEngineClient(modelDef)` wraps a `KernelEngine` behind the `EngineClient` interface:

| Method | What it does |
|---|---|
| `play()`, `pause()`, `toggle()`, `setSpeed(1 \| 3 \| 6)`, `step(n)` | The clock. While playing, each tick (every 250 ms, about four a second) advances `speed` months, one at a time, recording every indicator |
| `reset()` | Back to the baseline; clears the scenario |
| `seek(month)` | Anywhere between month 0 and the furthest month simulated (the timeline slider). Going back replays from the engine's snapshots, so the numbers match a straight run exactly |
| `setLever(id, value)`, `fire(id, size)` | Change a lever. Both start the clock if it is paused |
| `scenario()`, `load(scenario)` | The scenario so far, and deterministic replay (used by shared links) |
| `influences`, `ideasAtPlay`, `balanceSheet`, `series`, `varSeries`, `value`, `baseline` | Details on demand |
| `subscribe`, `getFrame` | A store for `useSyncExternalStore`: one `Frame` per tick |

Views receive plain data only: `client.info` (a `ModelInfo`: players, groups, flows, legs, rules, levers, indicators and concepts, without the model's functions) and a `Frame` per tick (month, horizon, clock state, events, lever values, leg values, pipes at both levels, accounting checks, the feed and active regimes). Arrays in a frame keep their identity when their contents did not change, so memoised views skip work.

**Why this shape.** Everything the client hands out can be structured-cloned, so a Web Worker can implement the same interface: the worker would own the engine and post `ModelInfo` once and a `Frame` per tick; the detail methods would answer from the latest results of the queries the open views registered (the inspector's influences, the ideas panel's scope), sent along with each frame. Views would not change.

The clock stops at 1,200 months (100 years), because the engine keeps every month's state for `seek`.

### View-models (`src/ui/model/`)

Pure functions that turn engine data into what the views draw. Each has tests in `tests/ui/`.

| File | Covers |
|---|---|
| `info.ts` | `describeModel`: the plain-data model description; which players a regime rule belongs to |
| `geometry.ts` | Node positions from layout hints (player or group level); fitting the map to its container so cards never overlap; pipe curves (lanes, self-loops); thickness ∝ √size; label placement |
| `styling.ts` | Deviation styling: amber above baseline, blue-grey below, glow intensity, particle speed from value/baseline, the most changed pipes |
| `format.ts` | Numbers and units: typographic minus, pp for rates held as fractions, % for indices, the clock |
| `levers.ts` | Accordion sections (by `section`, falling back to `group`), steppers on the step grid, the lever bar, changed counts |
| `charts.ts` | Chart windows (the last 72 months), paths, lever-event marks, tabs by indicator group |
| `ledger.ts` | The Godley table: signed cells, row sums, effects on net worth, grouped by account |
| `navigation.ts` | Selections, breadcrumb history, the ideas-at-play scope of a selection |
| `ideas.ts` | Ranking ideas at play and the concepts a selection expresses |
| `scenario-url.ts` | Scenario ⇄ URL hash |
| `player-cards.ts` | The key numbers on each player card, per model |
| `markdown.ts` | A small, safe markdown reader for concept cards |
| `registry.ts` | Which model to open |

## 2. The views and the engine API

| View | What it shows | Engine API |
|---|---|---|
| **Header** | Title, model name and switcher, clock, play/pause/step/speed/reset, the timeline slider with lever-event marks, "Books balance ✓", share | `t`, `step`, `seek`, `reset`, `checks()`, `events` |
| **FlowMap** (SVG) | Players or groups from layout hints; pipes with moving particles (cash) or dashes (accruals, revaluations, write-offs); thickness, glow and speed from value vs baseline; labels on the seven most changed pipes; one or two key numbers per card; a badge when a regime binds | `pipes(level)`, `legs()`, indicators, `balanceSheet()`, `influences().regime` |
| **LeverPanel** | Accordion sections; settings with −/+ and a bar (baseline marker, current value); choices as buttons; one-offs with a size and "Apply now"; an info toggle with the lever's description and definition; changed levers highlighted, with counts | `leverValue`, `setLever`, `fire`, `events` |
| **Inspector** | Breadcrumbs with back and forward. **Pipe:** its legs, each with its amount's influence. **Variable:** its influence; a term's inputs link upstream. **Player:** live balance sheet, net worth, biggest pipes, regimes. **Indicator:** description, big chart, drivers and their influences. **Concept:** the concept card | `influences()`, `balanceSheet()`, `series()` |
| **IdeasAtPlay** | The ideas doing the work for the selection (or the whole economy), with weight bars and the terms they come from | `ideasAtPlay(scope)` |
| **Charts** | Tabs by indicator group; small multiples of the deviation from baseline over the last 72 months, a zero line and amber marks at lever events | `series()`, `events` |
| **Feed** | Narration, newest first; click to open the indicator | `feed()` |
| **Ledger** | A live Godley table: flows as rows grouped by account, players (or groups) as columns, value and change from baseline, row sums of 0 ✓, each row's effect on total net worth, and each column's change in net worth | `legs()` |

An influence shows the rule's plain-English `what` and `rule`, its category (IDENTITY, CONTRACT, BEHAVIOUR or POLICY), the active regime, desired vs actual for rules that adjust gradually, each term now vs baseline with a change bar, a note when the terms combine non-additively, parameters with their provenance (basis, source, vintage, note), and concept chips. For additive rules the term changes sum exactly to the change in the desired value, and the inspector says so.

Influences use the `var:` prefix for leg amounts (a variable and a flow often share an id) and `flow:` for flows. Ideas-at-play scopes are a player, a group, a variable, a flow, an indicator or a pipe `from->to:kind`.

## 3. Visual language

- Dark "exhibit" stage (`#0B0F1A`) with a soft radial glow and a dot grid; glass panels with a 1 px light border and 16 px radius.
- Text `#EEF2FA`, muted `#9EA8C2`, accent cyan `#7FE3FF`, amber `#FFB454` (above baseline), blue-grey `#8FA3C7` (below).
- Outfit for the interface, DM Mono for numbers (Google Fonts).
- Particles are cash moving; thickness is the size of the flow; dashed pipes move no cash.
- Charts show deviations from baseline with amber marks at lever events.

Accessibility: every control is a real button with an accessible name; pipes and player cards are focusable and open with Enter or Space; focus rings are visible; text meets 4.5:1 contrast on the panels; `prefers-reduced-motion` stops the particle animation and other transitions. Space plays and pauses when focus is not in a control.

**Layout.** On a desktop: levers on the left, the map (or the ledger) in the centre, the inspector, ideas and feed on the right, charts along the bottom. Below 1,100 px the map goes on top with levers and inspector side by side; below 760 px everything stacks and the map scales to fit.

## 4. Performance

A tick advances the engine up to six months and publishes one frame; views are memoised so a tick redraws only what changed. The flow map computes its geometry once per model, level and container size; pipes and cards re-render only when their numbers change; charts render only the open tab; the ledger renders only when shown. Particle speed changes go through the Web Animations API (`updatePlaybackRate`), so dots never jump.

Measured with a synthetic model of Iceland's size (60 pipes, 34 players, 32 charts) at 6×: 0.2 ms of engine and frame work per tick, and React commits of about 4–6 ms (median, development build) at four ticks a second.

## 5. Extending the interface

**A new model or module** needs no interface code. Players appear on the map at their `layout` hint (0..1, x right, y down; without one they go on a ring), grouped by `group`. Flows become pipes, levers join sections, indicators join chart tabs by `group`, and concepts become cards. Give players a `color` for the card accent.

**Player-card numbers.** Each card shows one or two numbers. Add an entry for your model to `PLAYER_CARDS` in `src/ui/model/player-cards.ts`, keyed by player id and by group id:

```ts
export const PLAYER_CARDS: Record<Id, CardMapping> = {
  mymodel: {
    HH: [{ indicator: 'unemployment', label: 'Unemployment' }, { variable: 'consumption', label: 'Spending' }],
    Households: [{ indicator: 'consumption', label: 'Spending' }],
  },
};
```

An `indicator` shows in its display units; a `variable` shows its value and its change from baseline. Ids the model does not have are skipped, and a card with nothing left falls back to net worth and cash received.

**Regime badges.** A rule with a `regime` shows a badge on the cards of the players it belongs to. The model language does not say which that is, so `regimeOwners` in `info.ts` infers it: the players whose stocks the rule reads, plus the payers of legs whose amount the rule sets (or, failing that, one or two steps downstream).

**A custom view.** Write a component that takes `info: ModelInfo`, `client: EngineClient` and whatever part of the `Frame` it needs, and add it to `Workspace` in `App.tsx`. Keep engine access to `client` methods, put any computation in a pure function under `src/ui/model/` with a test, and wrap the component in `memo` with props that keep their identity between ticks when nothing changed. A different "skin" (such as the 3D island in the roadmap) is a different set of views over the same client.

## 6. Shared links

"Share scenario" writes the scenario to the URL hash and copies the link:

```
#m=reference&t=36&e=0:keyRateAddon:1,12:!wageSettlement:10
```

`m` is the model, `t` the month to replay to, and `e` the lever events as `month:lever:value`, with `!` before a fired one-off. Opening the link replays the scenario from the baseline, so it shows exactly the same numbers. Unknown keys are ignored.

## 7. Tests

`bun test tests/ui` covers the view-models (pipe geometry and map fitting, formatting, the scenario URL round trip, lever sections and steppers, chart windows, the ledger against the engine's balance sheets, navigation, markdown and ideas), the engine client (clock, seek, replay, frames) and a smoke test that renders `<App/>` with `react-dom/server` for every registered model.
