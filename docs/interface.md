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
| `play()`, `pause()`, `toggle()`, `setSpeed(1 \| 3 \| 6)`, `step(n)` | The clock. While playing, each tick advances one month, and a tick comes every 2 s ÷ `speed` (1× is a month every two seconds), one at a time, recording every indicator |
| `reset()` | Back to the baseline; clears the scenario |
| `seek(month)` | Anywhere between month 0 and the furthest month simulated (the timeline slider). Going back replays from the engine's snapshots, so the numbers match a straight run exactly |
| `setLever(id, value)`, `fire(id, size)` | Change a lever. Both start the clock if it is paused |
| `scenario()`, `load(scenario)` | The scenario so far, and deterministic replay (used by shared links) |
| `influences`, `ideasAtPlay`, `balanceSheet` (a player's or a group's), `pipes(view)` (at `'player'`, `'group'` or `{ expanded }`), `series`, `varSeries`, `value`, `baseline` | Details on demand |
| `subscribe`, `getFrame` | A store for `useSyncExternalStore`: one `Frame` per tick |

Views receive plain data only: `client.info` (a `ModelInfo`: players, the group tree, flows, legs, rules, levers, indicators and concepts, without the model's functions) and a `Frame` per tick (month, horizon, clock state, events, lever values, leg values, pipes at player and top-group level, accounting checks, the feed, active regimes and every stabiliser's state from `engine.stabilisers()`). The map asks for the pipes of the groups it has open with `client.pipes({ expanded })` each tick. Arrays in a frame keep their identity when their contents did not change, so memoised views skip work.

**Why this shape.** Everything the client hands out can be structured-cloned, so a Web Worker can implement the same interface: the worker would own the engine and post `ModelInfo` once and a `Frame` per tick; the detail methods would answer from the latest results of the queries the open views registered (the inspector's influences, the ideas panel's scope), sent along with each frame. Views would not change.

The clock stops at 1,200 months (100 years), because the engine keeps every month's state for `seek`.

### View-models (`src/ui/model/`)

Pure functions that turn engine data into what the views draw. Each has tests in `tests/ui/`.

| File | Covers |
|---|---|
| `info.ts` | `describeModel`: the plain-data model description, with the group tree (`ancestorsOf`, `roots`); which players a regime rule belongs to |
| `hierarchy.ts` | The expandable hierarchy: which groups are open (one-player groups always are), the visible nodes and frames, the node a player or group is drawn as, opening, closing and revealing, pipes between any two nodes, member counts |
| `geometry.ts` | Node positions from layout hints, with the fallback arrangement for open groups; fitting the map to its container so cards (and frames) never overlap; frames; pipe curves (lanes, self-loops); thickness ∝ √size; label placement |
| `styling.ts` | Deviation styling: amber above baseline, blue-grey below, glow intensity, particle speed from value/baseline, the most changed pipes |
| `format.ts` | Numbers and units: typographic minus, pp for rates held as fractions, % for indices, the clock |
| `levers.ts` | Accordion sections (by `section`, falling back to `group`), and the levers each shows: all but those a model keeps off the panel (`shown: false`), which appear while off their default or moved by the scenario (`shownSections`, decision 0017); steppers on the step grid (a step never moves the wrong way, even from a value a padlock froze outside the range), the lever bar, changed counts (a lever with a padlock counts while it is locked), padlocks (the stabiliser behind each lever with a rule, the live value an unlocked lever shows, the padlock's label and title), the note a lever's info panel adds while its stabiliser is locked and another acts (`lockedAloneNotes`), and when a lever gets the "back to baseline" button (`canResetToBaseline`) |
| `charts.ts` | Chart windows (the last 72 months), paths, lever-event marks, tabs by indicator group |
| `ledger.ts` | The Godley table: signed cells, row sums, effects on net worth, grouped by account |
| `navigation.ts` | Selections (a pipe is named by its two ends, at any level), breadcrumb history, the ideas-at-play scope of a selection |
| `ideas.ts` | Ranking ideas at play and the concepts a selection expresses |
| `scenario-url.ts` | Scenario and open groups ⇄ URL hash |
| `player-cards.ts` | The key numbers on each player and group card, and the words for a group's members, per model |
| `markdown.ts` | A small, safe markdown reader for concept cards |
| `registry.ts` | Which model to open |

## 2. The views and the engine API

| View | What it shows | Engine API |
|---|---|---|
| **Header** | Title, model name and switcher, clock, play/pause/step/speed/reset, the timeline slider with lever-event marks, "Books balance ✓" (or "Accounts out of balance"), a calmer amber badge ("2 impossible positions") when a position has taken the wrong sign, whose tooltip lists each one and its first month ([decision 0005](decisions/0005-position-signs.md): a warning, not an accounting failure), share | `t`, `step`, `seek`, `reset`, `checks()` (with `signViolations`), `events` |
| **FlowMap** (SVG) | Closed groups, open groups' frames and players, from layout hints; pipes with moving particles (cash) or dashes (accruals, revaluations, write-offs); flows inside a closed group as a loop on its card; thickness, glow and speed from value vs baseline; labels on the seven most changed pipes; one or two key numbers per card; a badge when a regime binds. Click a group to open it | `pipes({ expanded })`, `legs()`, indicators, `balanceSheet()`, `influences().regime` |
| **LeverPanel** | Accordion sections of the model's main levers: a lever the model keeps off the panel (`LeverDef.shown: false`; seven of Iceland's 25, such as the loan-to-value cap and the world aluminium price) appears in its own place in its section while it is off its default or the scenario has an event for it, so a shared link never sets a lever unseen ([decision 0017](decisions/0017-levers-shown.md)); settings with −/+ and a bar (baseline marker, current value); choices as buttons; one-offs with a size and "Apply now"; an info toggle that opens the lever's info panel, with its description and definition; changed levers highlighted, with counts. A lever with a rule has a padlock beside it (open or closed icon, `aria-pressed`, "Lock the key interest rate" / "Unlock the key interest rate", a title that says what it means). Unlocked, the rule moves the lever: the knob and value follow the live value, marked "auto" in calm cyan, and a step from there locks it at the new value. Locked, the lever holds, amber like any changed lever, and everything else reacts to it: there is no suggestion, no red mark and nothing to approve ([decision 0010](decisions/0010-policy-padlocks.md), amended 2 October 2026). The panel carries no notes about the locks (the owner removed them on 2 October 2026; decisions [0014](decisions/0014-locked-economy.md) and [0015](decisions/0015-downturn-escape-clause.md)). What holding one lever alone does is said only on demand: while one lever with a rule is locked and another unlocked, the locked one's info panel adds its `StabiliserDef.lockedAloneNote`, if it has one (Iceland's income tax held while the central bank's rule acts is paid for with debt; its key rate held while the debt rule acts leaves the debt rule to steady the economy). That nothing pulls prices back while every lever with a rule is locked is in the key-rate lever's definition and in the idea *Nominal anchor*, which the *Taylor rule* and *Anchored expectations* cards link to. A lever held off its baseline has a "back to baseline" button; on a lever with a padlock it sets the default and keeps the lever locked, since unlocking hands the lever to its rule, not back to the baseline. An unlocked lever's value, and the bar's accessible name, are rounded to two decimals | `leverValue`, `setLever`, `fire`, `events`, `stabilisers()` |
| **Inspector** | Breadcrumbs with back and forward. **Pipe:** its legs, each with its amount's influence. **Variable:** its influence; a term's inputs link upstream. **Player:** the groups it is part of, live balance sheet, net worth (with a warning above it, and "(went below zero)" or "(turned into a claim)" on the row, for a position that went below zero or turned into a claim), biggest pipes, regimes. **Group:** description, members (click one to go to it, opening the map as needed), the summed balance sheet of its players, with the same warning for any member, its biggest pipes as the map shows them, regimes. **Indicator:** description, big chart, drivers and their influences. **Concept:** the concept card | `influences()`, `balanceSheet()`, `series()` |
| **IdeasAtPlay** | The ideas doing the work for the selection (or the whole economy), with weight bars and the terms they come from | `ideasAtPlay(scope)` |
| **Charts** | Tabs by indicator group; small multiples of the deviation from baseline over the last 72 months, a zero line and amber marks at lever events | `series()`, `events` |
| **Feed** | Narration, newest first; click to open the indicator | `feed()` |
| **Ledger** | A live Godley table: flows as rows grouped by account, every player as a column (or, as an option, one column per card on the map), value and change from baseline, row sums of 0 ✓, each row's effect on total net worth, and each column's change in net worth | `legs()` |

An influence shows the rule's plain-English `what` and `rule`, its category (IDENTITY, CONTRACT, BEHAVIOUR or POLICY), the active regime, desired vs actual for rules that adjust gradually, each term now vs baseline with a change bar, a note when the terms combine non-additively, parameters with their provenance (basis, source, vintage, note), and concept chips. For additive rules the term changes sum exactly to the change in the desired value, and the inspector says so.

Influences use the `var:` prefix for leg amounts (a variable and a flow often share an id) and `flow:` for flows. Ideas-at-play scopes are a player, a group at any depth, a variable, a flow, an indicator or a pipe `from->to:kind` whose ends are players or groups at any level.

### The expandable hierarchy on the map

The map opens with every group closed. A group with one player (Banks, Central bank, …) is simply that player's card. A closed group is a stack of cards with its member count ("3 age groups"), its members' colour dots, one or two numbers and a chevron; "click to open" appears on hover. Clicking it opens it in place and shows it in the inspector: its members take its place inside a soft frame, one level at a time (Firms → Domestic firms and Exporters; Exporters → Fisheries, Aluminium, Tourism, Other exporters). The frame's name tab (or the frame itself) closes the group, and its sub-groups with it. "Expand all" and "Collapse all" sit above the map.

- **Where members go.** At their own layout hints (sub-groups at their group's) when every one has a hint and no two cards, with the frames between them, would overlap. Otherwise the open group is laid out as nested blocks around its position: a column, a gentle arc toward the middle when there are more than four, or side-by-side columns; shorter and wider arrangements are tried until the block is clear of the other cards and groups. The layout is chosen for the size at which it will be drawn, then spread to use the whole map, and cards shrink (to compact one-line cards if that helps) only when nothing else fits.
- **Motion.** Opening and closing take 360 ms: cards glide from the group's card to their places, cards of a closing group slide into it and fade, pipes crossfade. Nothing moves when the user asks for reduced motion.
- **Selections.** A pipe is named by its ends and means every leg between them, so it stays selected whatever is open; the map highlights the pipe that carries it. A player hidden in a closed group lights up the group. Going to a hidden player or group from the inspector, the ledger or the breadcrumbs opens the groups around it.
- **Widths** share one reference (the largest pipe between top-level groups), so a pipe is as thick in every view.

## 3. Visual language

- Dark "exhibit" stage (`#0B0F1A`) with a soft radial glow and a dot grid; glass panels with a 1 px light border and 16 px radius.
- Text `#EEF2FA`, muted `#9EA8C2`, accent cyan `#7FE3FF`, amber `#FFB454` (above baseline), blue-grey `#8FA3C7` (below).
- Outfit for the interface, DM Mono for numbers (Google Fonts).
- Particles are cash moving; thickness is the size of the flow; dashed pipes move no cash.
- A stack of cards is a closed group; a dashed frame, tinted with the group's colour, is an open one.
- Charts show deviations from baseline with amber marks at lever events.

Accessibility: every control is a real button with an accessible name; pipes, player and group cards and frame tabs are focusable and act on Enter or Space (group cards and frame tabs say whether they are expanded); focus rings are visible; text meets 4.5:1 contrast on the panels; `prefers-reduced-motion` stops the particle animation, the opening and closing of groups, and other transitions. Space plays and pauses when focus is not in a control.

**Layout.** On a desktop: levers on the left, the map (or the ledger) in the centre, the inspector, ideas and feed on the right, charts along the bottom. Below 1,100 px the map goes on top with levers and inspector side by side; below 760 px everything stacks and the map scales to fit.

## 4. Performance

A tick advances the engine up to six months and publishes one frame; views are memoised so a tick redraws only what changed. The flow map computes its layout once per model, set of open groups and container size; pipes and cards re-render only when their numbers change; charts render only the open tab; the ledger renders only when shown. Particle speed changes go through the Web Animations API (`updatePlaybackRate`), so dots never jump.

Measured with a synthetic model of Iceland's size (60 pipes, 34 players, 32 charts) at 6×: 0.2 ms of engine and frame work per tick, and React commits of about 4–6 ms (median, development build) at four ticks a second.

## 5. Extending the interface

**A new model or module** needs no interface code. Players appear on the map at their `layout` hint (0..1, x right, y down; without one they go on a ring), inside their groups: declare `GroupDef`s (nested with `parent`) for a hierarchy the user can open, or give players a free `group` label for flat groups. Flows become pipes, levers join sections, indicators join chart tabs by `group`, and concepts become cards. Give players a `color` for the card accent.

**Player- and group-card numbers.** Each card shows one or two numbers. Add an entry for your model to `PLAYER_CARDS` in `src/ui/model/player-cards.ts`, keyed by player id and by group id (or, for a group, its label):

```ts
export const PLAYER_CARDS: Record<Id, CardMapping> = {
  mymodel: {
    HH: [{ indicator: 'unemployment', label: 'Unemployment' }, { variable: 'consumption', label: 'Spending' }],
    Households: [{ indicator: 'consumption', label: 'Spending' }],
  },
};
```

An `indicator` shows in its display units; a `variable` shows its value and its change from baseline. Ids the model does not have are skipped, and a card with nothing left falls back to net worth and cash received (for a group: its players' net worth and the cash they receive from outside it). Name a group's members in `GROUP_NOUNS` (`Households: ['age group', 'age groups']`) so a closed card says "3 age groups" rather than "3 players". Give a metric `stabiliser: '<StabiliserDef id>'` when a stabiliser sets that number: while that stabiliser is unlocked (its rule acting) the card marks it "rule" (the central bank's key rate).

**Regime badges.** A rule with a `regime` shows a badge on the cards of the players it belongs to. The model language does not say which that is, so `regimeOwners` in `info.ts` infers it: the players whose stocks the rule reads, plus the payers of legs whose amount the rule sets (or, failing that, one or two steps downstream). A badge appears only when the regime differs from the baseline's. Unlocked, the default, the baseline has no key-rate regime, so "Held where you set it" (the key rate while its padlock is closed) shows on the Central bank and Rest of world cards whenever the key rate is locked, and goes when it is unlocked.

**A custom view.** Write a component that takes `info: ModelInfo`, `client: EngineClient` and whatever part of the `Frame` it needs, and add it to `Workspace` in `App.tsx`. Keep engine access to `client` methods, put any computation in a pure function under `src/ui/model/` with a test, and wrap the component in `memo` with props that keep their identity between ticks when nothing changed. A different "skin" (such as the 3D island in the roadmap) is a different set of views over the same client.

## 6. Shared links

"Share scenario" writes the scenario to the URL hash and copies the link:

```
#m=iceland&v=2&t=36&e=0:keyRate:4,12:!wageSettlement:10,24:keyRateLock:0&x=firms,exporters
```

`m` is the model, `v` the scenario format version, `t` the month to replay to, `e` the lever events as `month:lever:value`, with `!` before a fired one-off, and `x` the groups open on the map. Padlocks are lever events like any other (`keyRateLock:1` locks the key rate, `:0` unlocks it). Opening the link replays the scenario from the baseline, so it shows exactly the same numbers, with the same groups open; without `x` every group starts closed. Unknown keys are ignored. A link without `v` was written before padlocks (version 1, with the global Manual / Automatic setting): it is migrated as it loads (`src/core/migrate.ts`, decision 0010), and a notice says if a setting that tilted a rule was dropped.

## 7. Tests

`bun test tests/ui` covers the view-models (pipe geometry and map fitting, formatting, the scenario URL round trip with open groups, lever sections and steppers, chart windows, the ledger against the engine's balance sheets, navigation, markdown and ideas), the hierarchy (expansion state, visible nodes against the kernel's `nodeOf`, node placement and its fallback, frames, pipes at mixed levels against the engine's), the levers each model shows (Iceland's 18 main levers in order, and a hidden lever appearing once a scenario sets it), the engine client (clock, seek, replay, frames and stabilisers) and a smoke test that renders `<App/>` with `react-dom/server` for every registered model and for a test model with a two-level hierarchy (`tests/fixtures/hierarchy.ts`), with every group closed and fully expanded, plus the lever panel and map with the padlocks open and closed (no notes about the locks in any combination, and a locked-alone note only in the lever's info panel), and a shared link that sets a lever Iceland keeps off the panel. The engine-client and scenario-URL tests cover locking, unlocking, locking by stepping an unlocked lever, locks in replays and time travel, and old share links migrated as they load.
