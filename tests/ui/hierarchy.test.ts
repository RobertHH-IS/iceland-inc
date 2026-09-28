/**
 * The expandable hierarchy on the flow map (view-models): expansion state, visible nodes, node
 * placement with its fallback, frames, the mapping of legs to pipes at mixed levels, card
 * mappings for groups, and share links that carry the open groups.
 */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../../src/core/engine.ts';
import type { Id, ModelDef } from '../../src/core/types.ts';
import { CARD_FULL, GROUP_EXTRA_H, fitMap, frameBoxes, hintsOverlap, layoutView, nodeRect, spreadHints, viewFitItems, viewHints, viewLayoutHints, type NodeBox } from '../../src/ui/model/geometry.ts';
import {
  aggregatePipes,
  cleanExpanded,
  collapseGroup,
  directMembers,
  effectiveExpanded,
  expandAll,
  expandGroup,
  expandableGroups,
  isHidden,
  legSnapshots,
  memberCount,
  nodeOfPlayer,
  nodePipes,
  pipeBetween,
  reveal,
  viewKey,
  viewTree,
  visibleNode,
} from '../../src/ui/model/hierarchy.ts';
import { describeModel, type ModelInfo } from '../../src/ui/model/info.ts';
import { resolveCardMetrics } from '../../src/ui/model/player-cards.ts';
import { decodeScenarioHash, encodeScenarioHash } from '../../src/ui/model/scenario-url.ts';
import { models } from '../../src/models/index.ts';
import { hierarchyModel } from '../fixtures/hierarchy.ts';

const engine = createEngine(hierarchyModel());
engine.setLever('exportBoom', 1);
engine.step(4);
const info = describeModel(engine.model, (id) => engine.baseline(id));
const legValues = Float64Array.from(engine.legs().map((l) => l.value));
const eff = (ids: Id[]) => effectiveExpanded(info, ids);

/** The hierarchy model with its players' layout hints changed. */
function infoWith(edit: (def: ModelDef) => void): ModelInfo {
  const def = hierarchyModel();
  def.modules[0].players = def.modules[0].players!.map((p) => ({ ...p, layout: p.layout ? { ...p.layout } : undefined }));
  edit(def);
  const e = createEngine(def);
  return describeModel(e.model, (id) => e.baseline(id));
}

const noOverlap = (nodes: NodeBox[]) => {
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) return false;
    }
  return true;
};

describe('expansion state', () => {
  test('one-player groups are always open; unknown ids are dropped', () => {
    expect(expandableGroups(info)).toEqual(['households', 'firms', 'domestic', 'exporters']);
    expect([...eff(['nothing'])].sort()).toEqual(['banks', 'cb', 'gov', 'world']);
    expect(eff(['firms']).has('firms')).toBe(true);
  });

  test('opening a group opens the groups around it; closing one closes those inside it', () => {
    const open = expandGroup(info, new Set(), 'exporters');
    expect([...open].sort()).toEqual(['exporters', 'firms']);
    const both = expandGroup(info, open, 'domestic');
    expect([...collapseGroup(info, both, 'firms')]).toEqual([]);
    expect([...collapseGroup(info, both, 'exporters')].sort()).toEqual(['domestic', 'firms']);
    expect([...expandAll(info)].sort()).toEqual(['domestic', 'exporters', 'firms', 'households']);
  });

  test('revealing a hidden player opens only the groups around it', () => {
    const r = reveal(info, new Set(), 'FF');
    expect([...r].sort()).toEqual(['exporters', 'firms']);
    const already = new Set(['firms', 'exporters']);
    expect(reveal(info, already, 'FA')).toBe(already);
    expect([...reveal(info, new Set(), 'exporters')]).toEqual(['firms']);
  });

  test('links keep only groups that can be opened, in model order', () => {
    expect(cleanExpanded(info, ['exporters', 'banks', 'nope', 'firms'])).toEqual(['firms', 'exporters']);
    expect(viewKey(new Set(['b', 'a']))).toBe(viewKey(new Set(['a', 'b'])));
  });
});

describe('visible nodes', () => {
  test('the node of each player agrees with the kernel’s nodeOf, in every view', () => {
    for (const ids of [[], ['firms'], ['firms', 'exporters'], ['households', 'firms', 'domestic', 'exporters'], ['exporters']]) {
      const e = eff(ids);
      for (const p of info.players) expect(nodeOfPlayer(info, p.id, e)).toBe(engine.model.nodeOf(p.id, [...e]));
    }
  });

  test('closed groups, open frames, and one-player groups drawn as their player', () => {
    const closed = viewTree(info, eff([]));
    expect(closed.nodes.map((n) => [n.id, n.kind])).toEqual([
      ['households', 'group'],
      ['firms', 'group'],
      ['B', 'player'],
      ['CB', 'player'],
      ['G', 'player'],
      ['W', 'player'],
    ]);
    expect(closed.frames).toEqual([]);
    const open = viewTree(info, eff(['firms']));
    expect(open.nodes.map((n) => n.id)).toEqual(['households', 'domestic', 'exporters', 'B', 'CB', 'G', 'W']);
    expect(open.frames.map((f) => [f.id, f.depth, f.items.map((i) => i.id)])).toEqual([['firms', 0, ['domestic', 'exporters']]]);
    expect(open.nodes.find((n) => n.id === 'exporters')!.frames).toEqual(['firms']);
    const deep = viewTree(info, eff(['firms', 'exporters']));
    expect(deep.frames.map((f) => [f.id, f.parent ?? null])).toEqual([
      ['firms', null],
      ['exporters', 'firms'],
    ]);
    expect(deep.nodes.find((n) => n.id === 'FF')!.frames).toEqual(['firms', 'exporters']);
  });

  test('where a player or group is: its node, the closed group hiding it, or null for an open group', () => {
    const e = eff(['firms']);
    expect(visibleNode(info, 'FF', e)).toBe('exporters');
    expect(visibleNode(info, 'H1', e)).toBe('households');
    expect(visibleNode(info, 'exporters', e)).toBe('exporters');
    expect(visibleNode(info, 'firms', e)).toBeNull();
    expect(visibleNode(info, 'banks', e)).toBe('B');
    expect(visibleNode(info, 'exporters', eff([]))).toBe('firms');
    expect(isHidden(info, 'FF', e)).toBe(true);
    expect(isHidden(info, 'exporters', e)).toBe(false);
  });

  test('member counts and direct members', () => {
    expect(memberCount(info, 'households')).toBe('2 players');
    expect(memberCount(info, 'firms')).toBe('2 groups');
    expect(memberCount(info, 'firms', { Firms: ['kind of firm', 'kinds of firm'] })).toBe('2 kinds of firm');
    expect(directMembers(info, 'firms')).toEqual([
      { id: 'domestic', kind: 'group' },
      { id: 'exporters', kind: 'group' },
    ]);
  });

  test('group cards find their numbers by id or by label, and fall back to net worth and cash in', () => {
    expect(resolveCardMetrics(info, 'firms', { Firms: [{ indicator: 'exports', label: 'Exports' }] }).map((m) => m.key)).toEqual(['i:exports']);
    expect(resolveCardMetrics(info, 'firms', {}).map((m) => m.kind)).toEqual(['netWorth', 'cashIn']);
    const iceland = describeModel(createEngine(models.find((m) => m.id === 'iceland')!).model, () => 0);
    for (const g of iceland.groups) expect(resolveCardMetrics(iceland, g.id).length).toBeGreaterThan(0);
  });
});

describe('node placement', () => {
  test('members sit at their own hints when they do not overlap, frames included', () => {
    for (const ids of [[], ['firms'], ['households'], ['households', 'firms']]) {
      const tree = viewTree(info, eff(ids));
      const hints = viewHints(info, tree);
      for (const n of tree.nodes) {
        const p = info.playerById.get(n.id);
        const want = p ? p.layout! : info.groupById.get(n.id)!.layout!;
        expect(hints.get(n.id)).toEqual({ x: want.x, y: want.y });
      }
    }
  });

  test('hints too close for the frames between them fall back to blocks', () => {
    // Construction (0.42) and Fisheries (0.6) are far enough apart as cards, not with the
    // Domestic firms and Exporters frames between them.
    const tree = viewTree(info, eff(['firms', 'exporters', 'domestic']));
    const hints = viewHints(info, tree);
    expect(hints.get('FC')).not.toEqual({ x: 0.82, y: 0.42 });
    const items = tree.nodes.map((n) => ({ hint: hints.get(n.id)!, extraH: n.kind === 'group' ? GROUP_EXTRA_H : 0, frames: n.frames }));
    expect(hintsOverlap(items.filter((_, i) => tree.nodes[i].frames.length))).toBe(false);
  });

  test('the layout is chosen for the size it is drawn at: nothing collides once it is spread', () => {
    for (const [cw, ch] of [
      [1056, 472],
      [696, 328],
      [360, 300],
    ]) {
      const tree = viewTree(info, eff([...expandAll(info)]));
      const hints = viewLayoutHints(info, tree, cw, ch);
      for (const h of hints.values()) expect(h.x >= 0 && h.x <= 1 && h.y >= 0 && h.y <= 1).toBe(true);
      const box = fitMap(viewFitItems(tree, hints), cw, ch);
      expect(box.scale).toBeGreaterThan(0.4);
    }
    // at a roomy size the fully expanded map needs no shrinking at all
    const tree = viewTree(info, eff([...expandAll(info)]));
    expect(fitMap(viewFitItems(tree, viewLayoutHints(info, tree, 1176, 504)), 1176, 504).scale).toBe(1);
  });

  test('overlapping or missing hints fall back to a column around the group, without overlaps', () => {
    const crowded = infoWith((def) => {
      for (const p of def.modules[0].players!) if (['FR', 'FC', 'FF', 'FA'].includes(p.id)) p.layout = { x: 0.8, y: 0.5 };
      delete def.modules[0].players!.find((p) => p.id === 'H2')!.layout;
    });
    for (const ids of [['firms'], ['firms', 'exporters'], ['firms', 'exporters', 'domestic'], ['households']]) {
      const tree = viewTree(crowded, effectiveExpanded(crowded, ids));
      const hints = viewHints(crowded, tree);
      const inside = tree.nodes.filter((n) => n.frames.length).map((n) => ({ hint: hints.get(n.id)!, extraH: n.kind === 'group' ? GROUP_EXTRA_H : 0 }));
      expect(hintsOverlap(inside)).toBe(false);
      for (const h of hints.values()) {
        expect(h.x).toBeGreaterThanOrEqual(0);
        expect(h.x).toBeLessThanOrEqual(1);
        expect(h.y).toBeGreaterThanOrEqual(0);
        expect(h.y).toBeLessThanOrEqual(1);
      }
    }
    // firms open with both sub-groups open: two blocks side by side or stacked, around x = 0.8
    const tree = viewTree(crowded, effectiveExpanded(crowded, ['firms', 'exporters', 'domestic']));
    const hints = viewHints(crowded, tree);
    const xs = ['FR', 'FC', 'FF', 'FA'].map((id) => hints.get(id)!.x);
    expect(Math.min(...xs)).toBeGreaterThan(0.45);
    // exporters stay together: a column
    expect(hints.get('FF')!.x).toBeCloseTo(hints.get('FA')!.x, 9);
  });

  test('many members make an arc toward the middle of the map', () => {
    const many = infoWith((def) => {
      const s = def.modules[0];
      s.players = s.players!.map((p) => (['FR', 'FC', 'FF', 'FA'].includes(p.id) ? { ...p, group: 'exporters', layout: undefined } : p));
      s.groups = s.groups!.filter((g) => g.id !== 'domestic');
      s.groups = s.groups.map((g) => (g.id === 'exporters' ? { ...g, parent: undefined, layout: { x: 0.85, y: 0.5 } } : g));
      s.players.push({ id: 'FX', label: 'Tourism', group: 'exporters', settlement: 'deposits', description: 'tourism' });
      s.instruments = s.instruments!.map((i) => (i.id === 'deposits' ? { ...i, holders: [...i.holders, 'FX'] } : i));
      s.groups = s.groups.filter((g) => g.id !== 'firms');
    });
    const tree = viewTree(many, effectiveExpanded(many, ['exporters']));
    const hints = viewHints(many, tree);
    const ids = tree.frames[0].items.map((i) => i.id);
    expect(ids).toHaveLength(5);
    const pts = ids.map((id) => hints.get(id)!);
    // a single column bowed toward the centre: the middle card is further left than the ends
    expect(pts[2].x).toBeLessThan(pts[0].x - 0.05);
    expect(pts[0].x).toBeCloseTo(pts[4].x, 9);
    expect(hintsOverlap(pts.map((hint) => ({ hint, extraH: 0 })))).toBe(false);
  });

  test('the map fits with no card overlapping another, collapsed and fully expanded, and frames wrap their members', () => {
    for (const ids of [[], expandAll(info)] as Id[][]) {
      const tree = viewTree(info, eff([...ids]));
      const hints = viewHints(info, tree);
      for (const [cw, ch] of [
        [1000, 640],
        [700, 420],
        [380, 300],
      ]) {
        const box = fitMap(viewFitItems(tree, hints), cw, ch);
        const nodes = layoutView(info, tree, hints, { width: box.w, height: box.h, cardW: box.card.w, cardH: box.card.h });
        expect(noOverlap(nodes)).toBe(true);
        for (const n of nodes) {
          expect(n.x - n.w / 2).toBeGreaterThanOrEqual(0);
          expect(n.x + n.w / 2).toBeLessThanOrEqual(box.w);
        }
        const byId = new Map(nodes.map((n) => [n.id, n]));
        const frames = frameBoxes(tree, byId, box);
        expect(frames.length).toBe(tree.frames.length);
        for (const f of frames)
          for (const n of nodes.filter((x) => x.frames!.includes(f.id))) {
            const r = nodeRect(n);
            expect(r.x).toBeGreaterThanOrEqual(f.x);
            expect(r.y).toBeGreaterThanOrEqual(f.y);
            expect(r.x + r.w).toBeLessThanOrEqual(f.x + f.w + 1e-9);
            expect(r.y + r.h).toBeLessThanOrEqual(f.y + f.h + 1e-9);
          }
      }
    }
  });

  test('hints are spread to use the whole map, never closer together', () => {
    const h = spreadHints(
      new Map([
        ['a', { x: 0.1, y: 0.4 }],
        ['b', { x: 0.8, y: 0.6 }],
        ['c', { x: 0.45, y: 0.5 }],
      ]),
    );
    expect(h.get('a')!.x).toBeCloseTo(0, 12);
    expect(h.get('b')!.x).toBeCloseTo(1, 12);
    expect(h.get('c')!.x).toBeCloseTo(0.5, 12);
    // at most 1.6 times: the y span of 0.2 becomes 0.32, centred
    expect(h.get('b')!.y - h.get('a')!.y).toBeCloseTo(0.32, 12);
    expect((h.get('a')!.y + h.get('b')!.y) / 2).toBeCloseTo(0.5, 12);
  });

  test('closed groups get taller cards', () => {
    const tree = viewTree(info, eff([]));
    const hints = viewHints(info, tree);
    const nodes = layoutView(info, tree, hints);
    expect(nodes.find((n) => n.id === 'firms')!.h).toBe(CARD_FULL.h + GROUP_EXTRA_H);
    expect(nodes.find((n) => n.id === 'B')!.h).toBe(CARD_FULL.h);
  });
});

describe('pipes at mixed levels', () => {
  const legs = legSnapshots(info, legValues);
  const key = (p: { from: Id; to: Id; kind: string }) => `${p.from}->${p.to}:${p.kind}`;

  test('legs summed to the visible nodes match the engine’s pipes for the same view', () => {
    for (const ids of [[], ['firms'], ['firms', 'exporters'], expandAll(info)] as Iterable<Id>[]) {
      const e = eff([...ids]);
      const mine = aggregatePipes(legs, (p) => nodeOfPlayer(info, p, e));
      const kernel = engine.pipes({ expanded: [...e] });
      expect(mine.map(key)).toEqual(kernel.map(key));
      mine.forEach((p, i) => {
        expect(p.value).toBeCloseTo(kernel[i].value, 12);
        expect(p.baseline).toBeCloseTo(kernel[i].baseline, 12);
      });
    }
  });

  test('a pipe between any two nodes is the same whatever is open', () => {
    const top = engine.pipes('group').find((p) => p.from === 'world' && p.to === 'firms')!;
    const p = pipeBetween(info, legValues, 'W', 'firms', 'cash')!;
    expect(p.value).toBeCloseTo(top.value, 12);
    expect(p.legs.map((l) => `${l.from}->${l.to}`)).toEqual(['W->FF', 'W->FA']);
    const players = pipeBetween(info, legValues, 'W', 'FF', 'cash')!;
    expect(players.value).toBeCloseTo(engine.pipes('player').find((x) => x.from === 'W' && x.to === 'FF')!.value, 12);
    expect(pipeBetween(info, legValues, 'households', 'households', 'cash')!.legs.map((l) => l.flow)).toEqual(['homes']);
    expect(pipeBetween(info, legValues, 'W', 'households', 'cash')).toBeNull();
  });

  test('a node’s pipes are drawn against the map as it is; a hidden node keeps its own ends', () => {
    const e = eff(['firms']);
    const ex = nodePipes(info, legValues, e, 'exporters');
    expect(ex.every((p) => p.from === 'exporters' || p.to === 'exporters')).toBe(true);
    expect(ex.find((p) => p.from === 'domestic' && p.to === 'exporters')!.value).toBeCloseTo(10, 12);
    const hidden = nodePipes(info, legValues, eff([]), 'FF');
    expect(hidden.map(key).sort()).toEqual(['FF->firms:cash', 'FF->households:cash', 'W->FF:cash', 'firms->FF:cash'].sort());
    expect(hidden.find((p) => p.from === 'firms' && p.to === 'FF')!.legs.map((l) => l.from)).toEqual(['FR']);
    // an open group lists the pipes of its visible members
    const open = nodePipes(info, legValues, e, 'firms');
    expect(open.some((p) => p.from === 'domestic' && p.to === 'exporters')).toBe(true);
    expect(open.some((p) => p.from === 'firms' || p.to === 'firms')).toBe(false);
  });
});

describe('share links with open groups', () => {
  test('round-trip the open groups next to the scenario', () => {
    const s = { modelId: 'hierarchy', months: 12, events: [{ t: 0, lever: 'exportBoom', value: 1 }], expanded: ['firms', 'exporters'] };
    const hash = encodeScenarioHash(s);
    expect(hash).toBe('m=hierarchy&t=12&e=0:exportBoom:1&x=firms,exporters');
    const d = decodeScenarioHash('#' + hash);
    expect(d.ok && d.state).toEqual({ modelId: 'hierarchy', months: 12, events: s.events, expanded: ['firms', 'exporters'] });
  });

  test('group ids with odd characters survive; a link without x leaves the map as it opens', () => {
    const d = decodeScenarioHash(encodeScenarioHash({ modelId: 'iceland', months: 0, events: [], expanded: ['Rest of world', 'a,b&c'] }));
    expect(d.ok && d.state.expanded).toEqual(['Rest of world', 'a,b&c']);
    const old = decodeScenarioHash('#m=iceland&t=3');
    expect(old.ok && old.state.expanded).toBeUndefined();
    expect(encodeScenarioHash({ modelId: 'x', months: 0, events: [], expanded: [] })).toBe('m=x&t=0');
    expect(decodeScenarioHash('#x=%E0%A4%A').ok).toBe(false);
  });
});
