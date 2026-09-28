/**
 * The expandable player hierarchy on the flow map: which groups are open, which nodes are
 * visible, and which node each player (or group) is drawn as. Pure functions.
 *
 * The map starts with every top-level group closed. Opening a group replaces its card by its
 * members, one level at a time: sub-groups stay closed until they are opened too. A group with
 * a single player (Banks, Central bank, …) has nothing to open: it is always drawn as that
 * player's card, so it counts as open ("effectively expanded").
 *
 * The engine draws pipes to the same nodes: engine.pipes({ expanded }) with the effective set.
 */
import type { FlowKind, Id, LegSnapshot, Pipe } from '../../core/types.ts';
import type { GroupInfo, ModelInfo } from './info.ts';

/** A group drawn as its only player's card: there is nothing to open. */
export const isTrivial = (g: GroupInfo): boolean => g.allPlayers.length <= 1;

/** Groups the user can open and close, parents first. */
export function expandableGroups(info: ModelInfo): Id[] {
  return info.groups.filter((g) => !isTrivial(g)).map((g) => g.id);
}

/** The groups that are open on the map: the user's choice plus every one-player group. */
export function effectiveExpanded(info: ModelInfo, expanded: Iterable<Id>): Set<Id> {
  const out = new Set<Id>();
  for (const id of expanded) {
    const g = info.groupById.get(id);
    if (g && !isTrivial(g)) out.add(id);
  }
  for (const g of info.groups) if (isTrivial(g)) out.add(g.id);
  return out;
}

/** A stable key for a set of open groups (for memoising and for share links). */
export function viewKey(expanded: Iterable<Id>): string {
  return [...expanded].sort().join(',');
}

/** The node a player is drawn as: its outermost closed group, or itself. */
export function nodeOfPlayer(info: ModelInfo, player: Id, eff: ReadonlySet<Id>): Id {
  for (const g of info.ancestorsOf.get(player) ?? []) if (!eff.has(g)) return g;
  return player;
}

/**
 * Where a player or group is on the map: the node it is drawn as or hidden in. An open group
 * is not a node (it is a frame around its members), so it gives null, as does an unknown id.
 */
export function visibleNode(info: ModelInfo, id: Id, eff: ReadonlySet<Id>): Id | null {
  const chain = info.ancestorsOf.get(id);
  if (!chain) return null;
  for (const g of chain) if (!eff.has(g)) return g;
  if (info.playerById.has(id)) return id;
  const g = info.groupById.get(id);
  if (!g || !g.allPlayers.length) return null;
  if (isTrivial(g)) return g.allPlayers[0];
  return eff.has(id) ? null : id;
}

/** True when the id is a player or group that is not drawn because a group around it is closed. */
export function isHidden(info: ModelInfo, id: Id, eff: ReadonlySet<Id>): boolean {
  return (info.ancestorsOf.get(id) ?? []).some((g) => !eff.has(g));
}

/* --------------------------------------------------------- expansion state */

const openable = (info: ModelInfo, id: Id) => {
  const g = info.groupById.get(id);
  return !!g && !isTrivial(g);
};

/** Open a group, and every group around it so that it can be seen. */
export function expandGroup(info: ModelInfo, expanded: ReadonlySet<Id>, id: Id): Set<Id> {
  const out = new Set(expanded);
  for (const g of [...(info.ancestorsOf.get(id) ?? []), id]) if (openable(info, g)) out.add(g);
  return out;
}

/** Close a group; its sub-groups close with it, so reopening shows one level again. */
export function collapseGroup(info: ModelInfo, expanded: ReadonlySet<Id>, id: Id): Set<Id> {
  const out = new Set(expanded);
  out.delete(id);
  for (const g of info.groups) if ((info.ancestorsOf.get(g.id) ?? []).includes(id)) out.delete(g.id);
  return out;
}

/** Open the groups around a player or group so that it is visible (it is itself left as it is). */
export function reveal(info: ModelInfo, expanded: ReadonlySet<Id>, id: Id): ReadonlySet<Id> {
  const need = (info.ancestorsOf.get(id) ?? []).filter((g) => openable(info, g) && !expanded.has(g));
  if (!need.length) return expanded;
  const out = new Set(expanded);
  for (const g of need) out.add(g);
  return out;
}

export function expandAll(info: ModelInfo): Set<Id> {
  return new Set(expandableGroups(info));
}

/** Keep only ids of groups that can be opened, in the model's order (for share links). */
export function cleanExpanded(info: ModelInfo, ids: Iterable<Id>): Id[] {
  const want = new Set(ids);
  return expandableGroups(info).filter((id) => want.has(id));
}

/* ------------------------------------------------------------ visible tree */

export interface ViewNode {
  id: Id;
  kind: 'player' | 'group';
  label: string;
  color: string;
  /** Every player the node stands for. */
  members: Id[];
  /** The open groups around the node, outermost first (the frames it sits in). */
  frames: Id[];
}

export interface ViewFrame {
  id: Id;
  label: string;
  color: string;
  depth: number;
  /** The open group around this one, if any. */
  parent?: Id;
  /** Direct contents, in model order: nodes and open sub-groups. */
  items: { id: Id; frame: boolean }[];
}

export interface ViewTree {
  nodes: ViewNode[];
  frames: ViewFrame[];
  /** Top-level items, in model order. */
  roots: { id: Id; frame: boolean }[];
}

const DEFAULT_COLOR = '#8FA3C7';

/** The nodes and frames visible for a set of effectively open groups. */
export function viewTree(info: ModelInfo, eff: ReadonlySet<Id>): ViewTree {
  const nodes: ViewNode[] = [];
  const frames: ViewFrame[] = [];
  const firstIndex = new Map<Id, number>();
  info.players.forEach((p, i) => {
    firstIndex.set(p.id, i);
    for (const g of info.ancestorsOf.get(p.id) ?? []) if (!firstIndex.has(g)) firstIndex.set(g, i);
  });
  const at = (id: Id) => firstIndex.get(id) ?? Infinity;
  const visit = (id: Id, around: Id[]): { id: Id; frame: boolean } | null => {
    const player = info.playerById.get(id);
    if (player) {
      nodes.push({ id, kind: 'player', label: player.label, color: player.color ?? DEFAULT_COLOR, members: [id], frames: around });
      return { id, frame: false };
    }
    const g = info.groupById.get(id);
    if (!g || !g.allPlayers.length) return null;
    if (isTrivial(g)) return visit(g.allPlayers[0], around);
    if (!eff.has(id)) {
      nodes.push({ id, kind: 'group', label: g.label, color: g.color ?? DEFAULT_COLOR, members: [...g.allPlayers], frames: around });
      return { id, frame: false };
    }
    const frame: ViewFrame = { id, label: g.label, color: g.color ?? DEFAULT_COLOR, depth: around.length, items: [] };
    if (around.length) frame.parent = around[around.length - 1];
    frames.push(frame);
    const inner = [...around, id];
    const kids = [...g.players, ...g.children].sort((a, b) => at(a) - at(b));
    for (const k of kids) {
      const item = visit(k, inner);
      if (item) frame.items.push(item);
    }
    return { id, frame: true };
  };
  const roots = info.roots.map((r) => visit(r, [])).filter((x): x is { id: Id; frame: boolean } => !!x);
  return { nodes, frames, roots };
}

/* -------------------------------------------------------------- the pipes */

/** A leg as the engine reports it, with its index in the model (LegInfo.index), so a view can
 *  find the leg's own amount variable even when a flow has several legs between two players. */
export interface ViewLeg extends LegSnapshot {
  index: number;
}

/** A pipe whose legs carry their index. */
export interface ViewPipe extends Pipe {
  legs: ViewLeg[];
}

/** Legs as the engine reports them, from the model description and a frame's leg values. */
export function legSnapshots(info: ModelInfo, legValues: ArrayLike<number>): ViewLeg[] {
  return info.legs.map((l) => ({ flow: l.flow, from: l.from, to: l.to, kind: l.kind, value: legValues[l.index] ?? 0, baseline: l.baseline, index: l.index }));
}

/** Players a node stands for: the player, or every player of a group. */
export function membersOf(info: ModelInfo, id: Id): Id[] {
  if (info.playerById.has(id)) return [id];
  return info.groupById.get(id)?.allPlayers ?? [];
}

/**
 * The pipe between two nodes, at any level and whatever is open on the map: every leg of
 * `kind` from a player of `from` to a player of `to`. Null when there is no such leg.
 *
 * When one end contains the other (a player and a closed group around it, or two nested
 * groups), legs with both ends inside the inner node are left out: they are that node's own
 * 'inside' pipe, which nodePipes lists separately. Groups are either nested or disjoint, so
 * the pipe is then exactly the legs between the inner node and the rest of the outer one.
 */
export function pipeBetween(info: ModelInfo, legValues: ArrayLike<number>, from: Id, to: Id, kind: FlowKind): ViewPipe | null {
  const A = new Set(membersOf(info, from)),
    B = new Set(membersOf(info, to));
  const both = from === to ? null : new Set([...A].filter((p) => B.has(p)));
  const legs = legSnapshots(info, legValues).filter((l) => l.kind === kind && A.has(l.from) && B.has(l.to) && !(both?.has(l.from) && both.has(l.to)));
  if (!legs.length) return null;
  return { from, to, kind, value: legs.reduce((s, l) => s + l.value, 0), baseline: legs.reduce((s, l) => s + l.baseline, 0), legs };
}

/** Sum legs into pipes between nodes, by (from node, to node, kind), in leg order. */
export function aggregatePipes<L extends LegSnapshot>(legs: L[], node: (player: Id) => Id): (Pipe & { legs: L[] })[] {
  const map = new Map<string, Pipe & { legs: L[] }>();
  for (const leg of legs) {
    const from = node(leg.from),
      to = node(leg.to);
    const key = `${from}\u0000${to}\u0000${leg.kind}`;
    let p = map.get(key);
    if (!p) {
      p = { from, to, kind: leg.kind, value: 0, baseline: 0, legs: [] };
      map.set(key, p);
    }
    p.value += leg.value;
    p.baseline += leg.baseline;
    p.legs.push(leg);
  }
  return [...map.values()];
}

/**
 * The pipes of a player or group against the map as it is: every leg with a member at one end
 * (or both), the other end drawn as its visible node. A node that is hidden inside a closed
 * group still gets its own pipes, with itself as the end.
 */
export function nodePipes(info: ModelInfo, legValues: ArrayLike<number>, eff: ReadonlySet<Id>, id: Id): ViewPipe[] {
  const members = new Set(membersOf(info, id));
  const hidden = isHidden(info, id, eff);
  const node = (p: Id) => (hidden && members.has(p) ? id : nodeOfPlayer(info, p, eff));
  return aggregatePipes(
    legSnapshots(info, legValues).filter((l) => members.has(l.from) || members.has(l.to)),
    node,
  );
}

/** How many members a group has, in words: '3 age groups', '2 kinds of firm'. */
export function memberCount(info: ModelInfo, groupId: Id, nouns?: Record<Id, [one: string, many: string]>): string {
  const g = info.groupById.get(groupId);
  if (!g) return '';
  const n = g.players.length + g.children.length;
  const noun = nouns?.[g.id] ?? nouns?.[g.label] ?? (g.children.length === 0 ? ['player', 'players'] : g.players.length === 0 ? ['group', 'groups'] : ['member', 'members']);
  return `${n} ${n === 1 ? noun[0] : noun[1]}`;
}

/** The direct members of a group, for lists: sub-groups and players, in model order. */
export function directMembers(info: ModelInfo, groupId: Id): { id: Id; kind: 'player' | 'group' }[] {
  const g = info.groupById.get(groupId);
  if (!g) return [];
  const order = new Map(info.players.map((p, i) => [p.id, i]));
  const at = (id: Id) => {
    const sub = info.groupById.get(id);
    return sub ? Math.min(...sub.allPlayers.map((p) => order.get(p) ?? Infinity)) : (order.get(id) ?? Infinity);
  };
  return [...g.players.map((id) => ({ id, kind: 'player' as const })), ...g.children.map((id) => ({ id, kind: 'group' as const }))].sort((a, b) => at(a.id) - at(b.id));
}
