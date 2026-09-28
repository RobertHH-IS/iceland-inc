import { describe, expect, test } from 'bun:test';
import type { PlayerDef } from '../../src/core/types.ts';
import { CARD_COMPACT, CARD_FULL, CARD_H, CARD_W, MAP_H, MAP_W, MIN_MAP, boxExit, fitMap, layoutNodes, levelHints, pipeGeometry, pipeKey, pipeWidth, placeLabels, quadAt, widthScale, type NodeBox, type PipeLike } from '../../src/ui/model/geometry.ts';
import type { GroupInfo } from '../../src/ui/model/info.ts';

const player = (id: string, group: string, x?: number, y?: number): PlayerDef => ({ id, label: id, group, description: '', settlement: 'deposits', ...(x !== undefined ? { layout: { x, y: y! } } : {}) });

const players = [player('A', 'G1', 0.1, 0.5), player('B', 'G1', 0.3, 0.5), player('C', 'G2', 0.9, 0.2), player('D', 'G3')];
const groups: GroupInfo[] = [
  { id: 'G1', label: 'Group one', players: ['A', 'B'] },
  { id: 'G2', label: 'Group two', players: ['C'] },
  { id: 'G3', label: 'Group three', players: ['D'] },
];

const onBoundary = (p: { x: number; y: number }, n: NodeBox, gap: number) => {
  const dx = Math.abs(p.x - n.x) - n.w / 2,
    dy = Math.abs(p.y - n.y) - n.h / 2;
  return Math.max(dx, dy) >= -1e-9 && Math.max(dx, dy) <= gap + 1e-9;
};

describe('nodes from layout hints', () => {
  test('player level uses each hint, inside the frame', () => {
    const nodes = layoutNodes(players, groups, 'player');
    expect(nodes.map((n) => n.id)).toEqual(['A', 'B', 'C', 'D']);
    for (const n of nodes) {
      expect(n.x - n.w / 2).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w / 2).toBeLessThanOrEqual(MAP_W);
      expect(n.y - n.h / 2).toBeGreaterThanOrEqual(0);
      expect(n.y + n.h / 2).toBeLessThanOrEqual(MAP_H);
    }
    const [a, b] = nodes;
    expect(a.x).toBeLessThan(b.x);
    expect(a.y).toBe(b.y);
  });

  test('a player without a hint still gets a place', () => {
    const d = layoutNodes(players, groups, 'player').find((n) => n.id === 'D')!;
    expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
  });

  test('group level puts each group at the centroid of its players', () => {
    const p = layoutNodes(players, groups, 'player');
    const g = layoutNodes(players, groups, 'group');
    const g1 = g.find((n) => n.id === 'G1')!;
    expect(g1.x).toBeCloseTo((p[0].x + p[1].x) / 2, 9);
    expect(g1.y).toBeCloseTo(p[0].y, 9);
    expect(g1.members).toEqual(['A', 'B']);
    expect(g1.label).toBe('Group one');
  });

  test('the map is laid out in the container’s pixels, never below the minimum', () => {
    const roomy = fitMap([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1200, 700);
    expect(roomy).toMatchObject({ w: 1200, h: 704, scale: 1, card: CARD_FULL });
    const small = fitMap([], 380, 300);
    expect(small.w).toBeGreaterThanOrEqual(MIN_MAP.w - 8);
    expect(small.h).toBeGreaterThanOrEqual(MIN_MAP.h - 8);
    expect(small.w / small.h).toBeCloseTo(380 / 300, 1);
    expect(fitMap([], 0, 0)).toMatchObject({ w: MAP_W, h: MAP_H });
  });

  test('crowded hints shrink the map (or switch to compact cards) until no two cards overlap', () => {
    // three players stacked 0.15 apart, as households by age are in the Iceland model
    const crowded = [player('Y', 'H', 0.1, 0.4), player('W', 'H', 0.1, 0.55), player('O', 'H', 0.1, 0.7), player('X', 'X', 0.9, 0.5)];
    const hints = levelHints(crowded, [], 'player').map((h) => h.hint);
    const fit = fitMap(hints, 700, 380);
    expect(fit.scale).toBeLessThan(1);
    expect([CARD_FULL, CARD_COMPACT]).toContain(fit.card);
    const nodes = layoutNodes(crowded, [], 'player', { width: fit.w, height: fit.h, cardW: fit.card.w, cardH: fit.card.h });
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        const clear = Math.abs(a.x - b.x) >= a.w || Math.abs(a.y - b.y) >= a.h;
        expect(clear).toBe(true);
      }
    // with plenty of room, full cards at full size
    expect(fitMap(hints, 1400, 1100)).toMatchObject({ scale: 1, card: CARD_FULL });
  });
});

describe('pipe geometry', () => {
  const nodes = layoutNodes(players, groups, 'player');
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pipes: PipeLike[] = [
    { from: 'A', to: 'C', kind: 'cash' },
    { from: 'C', to: 'A', kind: 'cash' },
    { from: 'A', to: 'C', kind: 'accrual' },
    { from: 'B', to: 'B', kind: 'cash' },
    { from: 'B', to: 'B', kind: 'writeoff' },
  ];
  const geom = pipeGeometry(pipes, byId);

  test('every pipe gets a path, keyed from->to:kind', () => {
    expect([...geom.keys()].sort()).toEqual(pipes.map(pipeKey).sort());
    for (const g of geom.values()) expect(g.d).toMatch(/^M[-\d.]+,[-\d.]+ [QC]/);
  });

  test('pipes start and end on the edges of the cards, not inside them', () => {
    const g = geom.get('A->C:cash')!;
    expect(onBoundary(g.start, byId.get('A')!, 5)).toBe(true);
    expect(onBoundary(g.end, byId.get('C')!, 7)).toBe(true);
  });

  test('the two directions between a pair bow to opposite sides', () => {
    const a = byId.get('A')!,
      c = byId.get('C')!;
    const side = (p: { x: number; y: number }) => Math.sign((c.x - a.x) * (p.y - a.y) - (c.y - a.y) * (p.x - a.x));
    const ac = geom.get('A->C:cash')!,
      ca = geom.get('C->A:cash')!;
    expect(side(ac.mid)).not.toBe(0);
    expect(side(ac.mid)).toBe(-side(ca.mid));
  });

  test('a second kind in the same direction takes a wider lane', () => {
    const a = byId.get('A')!,
      c = byId.get('C')!;
    const dist = (p: { x: number; y: number }) => Math.abs((c.x - a.x) * (p.y - a.y) - (c.y - a.y) * (p.x - a.x)) / Math.hypot(c.x - a.x, c.y - a.y);
    expect(dist(geom.get('A->C:accrual')!.mid)).toBeGreaterThan(dist(geom.get('A->C:cash')!.mid) + 10);
  });

  test('a flow from a node to itself is a loop above it; loops of other kinds nest', () => {
    const l1 = geom.get('B->B:cash')!,
      l2 = geom.get('B->B:writeoff')!;
    const b = byId.get('B')!;
    expect(l1.selfLoop && l2.selfLoop).toBe(true);
    expect(l1.mid.y).toBeLessThan(b.y - CARD_H / 2);
    expect(l2.mid.y).toBeLessThan(l1.mid.y);
  });

  test('pipes to unknown nodes are skipped, and geometry is deterministic', () => {
    expect(pipeGeometry([{ from: 'A', to: 'Z', kind: 'cash' }], byId).size).toBe(0);
    const again = pipeGeometry([...pipes].reverse(), byId);
    for (const [k, g] of geom) expect(again.get(k)!.d).toBe(g.d);
  });

  test('boxExit and quadAt', () => {
    const p = boxExit({ x: 0, y: 0 }, CARD_W / 2, CARD_H / 2, { x: 1000, y: 0 }, 0);
    expect(p).toEqual({ x: CARD_W / 2, y: 0 });
    expect(quadAt({ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }, 0.5)).toEqual({ x: 5, y: 5 });
  });
});

describe('thickness', () => {
  test('width grows with the square root of size', () => {
    const scale = 64;
    const w1 = pipeWidth(4, scale, 16, 0),
      w4 = pipeWidth(16, scale, 16, 0);
    expect(w4 / w1).toBeCloseTo(2, 9);
    expect(pipeWidth(64, 64)).toBe(16);
  });

  test('clamped at both ends; the sign does not matter', () => {
    expect(pipeWidth(0, 64)).toBe(1.25);
    expect(pipeWidth(1e6, 64)).toBe(16 * 1.6);
    expect(pipeWidth(-16, 64)).toBe(pipeWidth(16, 64));
  });

  test('the width scale is the largest baseline, so widths do not jump as values move', () => {
    expect(widthScale([{ baseline: 3, value: 30 }, { baseline: -8, value: 1 }])).toBe(8);
    expect(widthScale([{ baseline: 0, value: 2 }])).toBe(2);
  });
});

describe('label placement', () => {
  test('labels that would collide are nudged apart and off the cards', () => {
    const card = { x: 0, y: 40, w: 100, h: 40 };
    const pos = placeLabels(
      [
        { key: 'a', x: 50, y: 10, w: 80, h: 20 },
        { key: 'b', x: 50, y: 10, w: 80, h: 20 },
        { key: 'c', x: 50, y: 60, w: 80, h: 20 },
      ],
      [card],
    );
    const a = pos.get('a')!,
      b = pos.get('b')!,
      c = pos.get('c')!;
    expect(a).toEqual({ x: 50, y: 10 });
    expect(Math.abs(a.y - b.y) >= 20 || Math.abs(a.x - b.x) >= 80).toBe(true);
    const inCard = c.x + 40 > card.x && c.x - 40 < card.x + card.w && c.y + 10 > card.y && c.y - 10 < card.y + card.h;
    expect(inCard).toBe(false);
  });
});
