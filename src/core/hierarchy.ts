/**
 * The player hierarchy: groups of players, nested (Firms → Exporters → Fisheries).
 *
 * The compiler calls buildHierarchy() to validate the model's GroupDefs and build the tree the
 * flow map draws. A model with no GroupDefs keeps the old behaviour: each player's `group`
 * label becomes a flat, top-level group. A player whose `group` is empty sits at the top level
 * on its own.
 *
 * The map shows a group as one node until it is expanded, one level at a time. nodeFor() says
 * which node a player is drawn as: its OUTERMOST collapsed enclosing group, or the player itself
 * when every enclosing group is expanded. Groups have no balance sheet of their own; theirs is
 * the sum of their members' (see engine.balanceSheet).
 */
import type { CompiledModel, GroupDef, Id, PlayerDef } from './types.ts';

export type CompiledGroup = CompiledModel['groups'][number];

export interface Hierarchy {
  /** Parents before children (a pre-order walk in declaration order). */
  groups: CompiledGroup[];
  groupIndex: Map<Id, number>;
  /** For each player (by index), its enclosing groups, outermost first. */
  chains: Id[][];
  /** True when the model declares GroupDefs (false: flat groups from the players' labels). */
  declared: boolean;
}

interface Tagged<T> {
  def: T;
  module: Id;
}

const inUnit = (p: { x: number; y: number }) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

function centroid(players: PlayerDef[]): { x: number; y: number } | undefined {
  const pts = players.filter((p) => p.layout).map((p) => p.layout!);
  if (!pts.length) return undefined;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

const firstColor = (players: PlayerDef[]) => players.find((p) => p.color)?.color;

/** The node a player is drawn as, given its chain of enclosing groups (outermost first). */
export function nodeFor(chain: readonly Id[], expanded: ReadonlySet<Id>, player: Id): Id {
  for (const g of chain) if (!expanded.has(g)) return g;
  return player;
}

/** Validate the GroupDefs (errors and warnings go to `err` and `warn`) and build the tree. */
export function buildHierarchy(players: Tagged<PlayerDef>[], defs: Tagged<GroupDef>[], err: (m: string) => void, warn: (m: string) => void): Hierarchy {
  const plist = players.map((p) => p.def);
  if (!defs.length) return flatGroups(plist, warn);

  let failed = false;
  const fail = (m: string) => {
    failed = true;
    err(m);
  };
  const playerIds = new Set(plist.map((p) => p.id));
  const byId = new Map<Id, Tagged<GroupDef>>();
  for (const g of defs) {
    const d = g.def;
    if (!d || !d.id) {
      fail(`a group in module '${g.module}' has no id`);
      continue;
    }
    if (byId.has(d.id)) {
      fail(`duplicate group id '${d.id}' (modules '${byId.get(d.id)!.module}' and '${g.module}')`);
      continue;
    }
    if (playerIds.has(d.id)) fail(`group id '${d.id}' (module '${g.module}') is also a player id; groups and players are both nodes on the map, so their ids must differ`);
    if (!d.label) fail(`group '${d.id}' (module '${g.module}') has no label`);
    if (!d.description) warn(`group '${d.id}' has no description`);
    if (d.layout && !inUnit(d.layout)) warn(`group '${d.id}' has a layout hint outside 0..1`);
    byId.set(d.id, g);
  }
  for (const [id, g] of byId) {
    const parent = g.def.parent;
    if (parent && parent !== id && !byId.has(parent)) fail(`group '${id}' (module '${g.module}') has parent '${parent}', which is not a declared group`);
  }
  // Cycles: follow the parents from every group; a chain must end at a top-level group.
  const reported = new Set<string>();
  for (const id of byId.keys()) {
    const seen: Id[] = [];
    let cur: Id | undefined = id;
    while (cur && byId.has(cur)) {
      const at = seen.indexOf(cur);
      if (at >= 0) {
        const cycle = seen.slice(at);
        const key = [...cycle].sort().join('\u0000');
        if (!reported.has(key)) {
          reported.add(key);
          fail(`groups form a cycle: ${[...cycle, cur].map((c) => `'${c}'`).join(' → ')}; every chain of parents must end at a top-level group`);
        }
        break;
      }
      seen.push(cur);
      cur = byId.get(cur)!.def.parent || undefined;
    }
  }
  for (const { def: p, module } of players)
    if (p.group && !byId.has(p.group)) fail(`player '${p.id}' (module '${module}') is in group '${p.group}', which is not a declared group; a model that declares groups must place every player in one of them`);
  if (failed) return { groups: [], groupIndex: new Map(), chains: plist.map(() => []), declared: true };

  // Enclosing chain of every group and player, outermost first.
  const groupChain = new Map<Id, Id[]>();
  const chainOf = (id: Id): Id[] => {
    let c = groupChain.get(id);
    if (!c) {
      const parent = byId.get(id)!.def.parent;
      c = parent ? [...chainOf(parent), parent] : [];
      groupChain.set(id, c);
    }
    return c;
  };
  const chains = plist.map((p) => (p.group ? [...chainOf(p.group), p.group] : []));

  // Pre-order walk from the top-level groups, children in declaration order.
  const kids = new Map<Id, Id[]>();
  const tops: Id[] = [];
  for (const [id, g] of byId) {
    const parent = g.def.parent;
    if (parent) kids.set(parent, [...(kids.get(parent) ?? []), id]);
    else tops.push(id);
  }
  const order: Id[] = [];
  const walk = (id: Id) => {
    order.push(id);
    for (const k of kids.get(id) ?? []) walk(k);
  };
  tops.forEach(walk);

  const groups: CompiledGroup[] = order.map((id) => {
    const d = byId.get(id)!.def;
    const direct = plist.filter((p) => p.group === id);
    const all = plist.filter((_, j) => chains[j].includes(id));
    if (!all.length) warn(`group '${id}' has no players`);
    const g: CompiledGroup = {
      id,
      label: d.label,
      depth: chainOf(id).length,
      children: kids.get(id) ?? [],
      players: direct.map((p) => p.id),
      allPlayers: all.map((p) => p.id),
      description: d.description,
    };
    if (d.parent) g.parent = d.parent;
    const color = d.color ?? firstColor(all);
    if (color) g.color = color;
    const layout = d.layout ? { x: d.layout.x, y: d.layout.y } : centroid(all);
    if (layout) g.layout = layout;
    return g;
  });
  return { groups, groupIndex: new Map(groups.map((g, j) => [g.id, j])), chains, declared: true };
}

/** No GroupDefs: flat, top-level groups from the players' `group` labels, as before. */
function flatGroups(plist: PlayerDef[], warn: (m: string) => void): Hierarchy {
  const groups: CompiledGroup[] = [];
  const groupIndex = new Map<Id, number>();
  for (const p of plist) {
    if (!p.group) continue;
    let j = groupIndex.get(p.group);
    if (j === undefined) {
      j = groups.length;
      groupIndex.set(p.group, j);
      groups.push({ id: p.group, label: p.group, depth: 0, children: [], players: [], allPlayers: [] });
    }
    groups[j].players.push(p.id);
    groups[j].allPlayers.push(p.id);
  }
  const playerIds = new Set(plist.map((p) => p.id));
  for (const g of groups) {
    const members = plist.filter((p) => g.players.includes(p.id));
    const color = firstColor(members);
    if (color) g.color = color;
    const layout = centroid(members);
    if (layout) g.layout = layout;
    // A one-player group named after its player is harmless: both are the same node.
    if (playerIds.has(g.id) && !(g.players.length === 1 && g.players[0] === g.id))
      warn(`group '${g.id}' has the id of a player; balanceSheet('${g.id}') and ideasAtPlay('${g.id}') resolve to the player`);
  }
  return { groups, groupIndex, chains: plist.map((p) => (p.group ? [p.group] : [])), declared: false };
}
