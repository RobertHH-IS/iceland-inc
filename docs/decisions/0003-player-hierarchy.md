# 0003. An expandable player hierarchy

Status: accepted, with the hierarchy in the kernel and the flow map (September 2026).

## The request

"We should have households, and then when you click on it, it will expand into its constituent components. Same thing with firms: domestic and exports."

The flow map starts compact: Households, Firms, Banks, Central bank, Government, Pension funds, Rest of world. Clicking a group opens it in place, one level at a time: Firms → Domestic firms and Exporters → Fisheries, Aluminium, Tourism, Other exporters. Clicking the open group's frame closes it again. Pipes are always drawn between whatever is visible.

## Design

**Groups are declared, players stay the unit of accounting.** A module may declare `GroupDef`s (`id`, `label`, `parent`, `color`, `description`, `layout`). A player's `group` names the group it belongs to directly. Groups have no balance sheet, flows or rules of their own: everything a group shows is the sum of its players'. So the hierarchy is a way of *looking* at the model and cannot change a number: the harness's goldens are unchanged.

**The compiler builds the tree** (`src/core/hierarchy.ts`, called from `compile.ts`):

- validation: unique group ids; every parent declared; no cycles (a group that is its own parent is one); when the model declares any groups, every player's group must be one of them; no id may be both a group and a player (both are nodes on the map). A group without a description or without players is a warning.
- `CompiledModel.groups` is the tree, parents first (a pre-order walk in declaration order), each with `depth`, `children` (direct sub-groups), `players` (direct members) and `allPlayers` (every descendant player, in player order).
- defaults: a group's `color` is its first player's; its `layout` is the centroid of its players' layout hints.
- `nodeOf(player, expanded)` walks the player's chain of groups from the top; the first one that is not expanded is the node; if every one is, the player is its own node. An expanded group inside a closed one stays hidden.

**Backward compatible.** A model without `GroupDef`s gets flat top-level groups from its players' `group` labels, exactly as before: same ids, labels, order, players and colours. `pipes('group')` gives the same pipes as before (tested against the old aggregation on the reference model).

**Pipes at mixed levels.** `engine.pipes({ expanded })` maps each leg's ends through `nodeOf` and sums legs by (from node, to node, kind). The two directions stay separate, as do kinds. Legs inside one visible node become a pipe from the node to itself, drawn as a loop on its card (home purchases between households, inputs between firms). `'player'` and `'group'` (top-level groups) still work. Every leg is in exactly one pipe at every view, so totals are conserved per kind (tested).

**Group balance sheets.** `engine.balanceSheet(group)` sums its players' positions instrument by instrument, assets and liabilities apart. Claims between members are not netted: a group holding a deposit issued by another of its members shows both.

**Ideas at play.** A scope may be a group at any depth, and a pipe `from->to[:kind]` whose ends are players or groups at any level; a group end stands for all its players.

## Contract refinements (`src/core/types.ts`)

| # | Where | Change | Why |
|---|---|---|---|
| 1 | `CompiledModel.nodeOf` | `expanded` may be a `readonly Id[]` or a `ReadonlySet<Id>`; the doc says what the node is | The interface keeps the open groups in a `Set`; building an array for every player on every tick is waste |
| 2 | `PipeView.expanded` | `readonly Id[]`; unknown ids are ignored, and a group whose parent is closed stays hidden whether it is listed or not | Callers pass what they have; the rule for hidden groups had to be stated |
| 3 | `PlayerDef.group` doc | An empty group puts the player at the top level on its own | Before, such a player became a one-player group named after itself, which would now clash with the rule that groups and players have different ids. Its pipes are unchanged |
| 4 | `Engine.ideasAtPlay` doc | Lists the scopes, including groups at any depth and pipes between nodes at any level | The interface builds such scopes |

Internal kernel additions (not in the contract): `KModel.groupIndex` and `KModel.groupChains` (each player's groups, outermost first).

## The interface

- **State.** The workspace keeps the open groups (`expanded: Set<Id>`); the map starts with every group closed. "Expand all" and "Collapse all" replace the old "Groups / All players" toggle. A group with a single player (Banks, Central bank, Government, Pension funds, Rest of world) counts as always open: it is drawn as that player's card and has nothing to open (`effectiveExpanded`).
- **Closed groups** are a stack of cards: label and colour, the member count in words ("3 age groups", "2 kinds of firm", from `GROUP_NOUNS`), colour dots for the direct members, one or two numbers (group entries in `PLAYER_CARDS`, found by id or by label; otherwise net worth and cash from outside the group), a chevron and a "click to open" hint on hover. Clicking one opens it and shows it in the inspector.
- **Open groups** are a soft dashed frame around their visible members, with a name tab that closes the group; clicking the frame itself closes it too. Closing a group closes its sub-groups, so reopening shows one level again.
- **Placement.** Members sit at their own layout hints (sub-groups at their group's), unless a hint is missing or two cards (with the frames between them) would overlap. Then the whole open top-level group is laid out as nested blocks, one frame per open group: a column, a gentle arc toward the middle of the map when there are more than four, or side-by-side columns. Shorter, wider arrangements are tried until the block is clear of the other cards and groups; if none is, the full arrangement stays at the group's position. The layout is chosen for the size at which it will be drawn (tried on the container, then on larger virtual maps that the fit scales down), and hints are finally spread to use the whole map. Group cards are 16 units taller, and the fit keeps room for frames between cards.
- **Motion.** Opening or closing takes 360 ms: cards glide from the group's card to their places (a CSS transform transition started with the FLIP technique), cards of a closing group slide into it and fade, pipes crossfade (old ones fade out, new ones in). Nothing moves with `prefers-reduced-motion`.
- **Pipes and selections are view-independent.** A selected pipe is named by its two ends, players or groups at any level, and means every leg of its kind between them (`pipeBetween`), so it survives opening and closing. When one end contains the other (a player and a closed group around it), legs inside the inner end are left out: they are its own 'inside' pipe. The map highlights the pipe that carries it at the current view. A selected player hidden in a closed group lights up the group; going to a hidden player or group from the inspector, the ledger or the breadcrumbs opens the groups around it.
- **Ledger.** Players as columns, or "grouped as on the map" (one column per visible card).
- **Share links** carry the open groups: `&x=firms,exporters`. Links without `x` open with every group closed.

## Alternatives considered

- **Aggregating pipes in the interface only.** The interface could sum legs to its visible nodes itself (it does, in `aggregatePipes`, for tests and for a node's pipe list). The engine does it for the map so that the pipes on screen come from the kernel, and a future Web Worker can answer `pipes(view)` like any other detail query.
- **A `short`/member-noun field on `GroupDef`.** The words for a group's members ("age groups") are presentation, so they live next to the card mappings in `player-cards.ts`, keyed by group id or label.
- **Consolidated group balance sheets.** Netting claims between members would hide, for example, pension rights that households hold on pension funds if both were in one group. Gross sums match the ledger's columns and keep the instrument rows meaningful.

## Known gaps

- The fallback arrangement avoids other cards and groups but does not move them; when a map is too small for every card at full size, it scales down (compact cards) rather than rearranging the rest of the map.
- Self-pipe loops sit above their card, so in a tight column a loop can cross the card above it.
- Group cards show fallback numbers (net worth and cash in) for groups without an entry in `PLAYER_CARDS`.
