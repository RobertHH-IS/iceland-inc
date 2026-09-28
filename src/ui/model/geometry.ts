/**
 * Flow-map geometry: where nodes sit and how pipes curve between them. Pure functions.
 *
 * Nodes come from the players' layout hints (0..1, x right, y down). A closed group sits at
 * its own hint, which defaults to the centroid of its players. An open group is a frame around
 * its members: they sit at their own hints when every one has a hint and no two cards would
 * overlap; otherwise the whole open group is laid out as nested blocks around the group's
 * position (a column, a gentle arc when there are many, or side-by-side columns when one would
 * be too tall). Pipes are quadratic curves that bow to the right of their direction of travel,
 * so the two directions between a pair of nodes never overlap, and extra pipes between the same
 * pair (other kinds) take wider lanes. A flow from a node to itself (firms buying from firms,
 * or anything inside a closed group) is drawn as a loop above the node.
 */
import type { FlowKind, Id, PlayerDef } from '../../core/types.ts';
import type { ModelInfo } from './info.ts';
import type { ViewTree } from './hierarchy.ts';

/** The part of a group the old player/group levels need. */
export interface GroupLike {
  id: Id;
  label: string;
  players: Id[];
  color?: string;
}

export interface Pt {
  x: number;
  y: number;
}

export const MAP_W = 1000;
export const MAP_H = 640;
export const CARD_W = 164;
export const CARD_H = 64;

export interface NodeBox {
  id: Id;
  label: string;
  short: string;
  color: string;
  /** Centre, in map units. */
  x: number;
  y: number;
  w: number;
  h: number;
  members: Id[];
  /** A closed group (a stack of cards) or a player. */
  kind?: 'player' | 'group';
  /** Open groups around the node, outermost first. */
  frames?: Id[];
}

export type Level = 'player' | 'group';

/** Smallest map, in map units: below this the map is laid out at this size and scaled down. */
export const MIN_MAP = { w: 600, h: 400 };

/** Card sizes: the full card has two key numbers, the compact one (for crowded maps) one. */
export interface CardSize {
  w: number;
  h: number;
  lines: 1 | 2;
}
export const CARD_FULL: CardSize = { w: CARD_W, h: CARD_H, lines: 2 };
export const CARD_COMPACT: CardSize = { w: 150, h: 44, lines: 1 };
const CARD_GAP = 10;
/** A closed group's card is taller: it has a row for its member count and colour dots. */
export const GROUP_EXTRA_H = 16;
/** Frames around open groups: padding, and the extra top room for the frame's label. */
export const FRAME_PAD = 12;
export const FRAME_TOP = 24;

/** Extra clearance two cards need for the frames between them: each frame around one card but
 *  not the other puts its padding between them, and its label too when it is the lower card's. */
export function frameClearance(a: readonly Id[] = [], b: readonly Id[] = [], aAbove = true): { x: number; y: number } {
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  const ea = a.length - common,
    eb = b.length - common;
  const [upper, lower] = aAbove ? [ea, eb] : [eb, ea];
  return { x: (ea + eb) * FRAME_PAD, y: upper * FRAME_PAD + lower * FRAME_TOP };
}

export interface LayoutOptions {
  width?: number;
  height?: number;
  cardW?: number;
  cardH?: number;
}

/** Margins that keep cards (and self-loops above the top row) inside the frame. */
function margins(cardW: number, cardH: number): { px: number; py: number } {
  return { px: cardW / 2 + 12, py: cardH / 2 + 34 };
}

/** Map a 0..1 layout hint into the map, keeping cards inside the frame. */
export function placeHint(hint: Pt, o: Required<LayoutOptions>): Pt {
  const { px, py } = margins(o.cardW, o.cardH);
  return { x: px + hint.x * (o.width - 2 * px), y: py + hint.y * (o.height - 2 * py) };
}

/** Evenly spaced points on an ellipse: the fallback for players without a layout hint. */
export function ringHint(i: number, n: number): Pt {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
  return { x: 0.5 + 0.45 * Math.cos(a), y: 0.5 + 0.42 * Math.sin(a) };
}

/** Layout hints (0..1) of the nodes at a level: players' own, or each group's centroid. */
export function levelHints(players: PlayerDef[], groups: GroupLike[], level: Level): { id: Id; hint: Pt }[] {
  const hints = new Map<Id, Pt>();
  players.forEach((p, i) => hints.set(p.id, p.layout ? { x: p.layout.x, y: p.layout.y } : ringHint(i, players.length)));
  if (level === 'player') return players.map((p) => ({ id: p.id, hint: hints.get(p.id)! }));
  return groups.map((g) => {
    const pts = g.players.map((id) => hints.get(id)).filter((p): p is Pt => !!p);
    const hint = pts.length ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length } : { x: 0.5, y: 0.5 };
    return { id: g.id, hint };
  });
}

/** A node to fit on the map: its hint, how much taller than a card it is, and the open groups
 *  around it (outermost first), whose frames need room. */
export interface FitItem extends Pt {
  extraH?: number;
  frames?: readonly Id[];
}

/** True when no two cards overlap on a map of w × h. */
function cardsFit(hints: FitItem[], w: number, h: number, card: CardSize): boolean {
  const extra = Math.max(0, ...hints.map((p) => p.extraH ?? 0));
  const { px, py } = margins(card.w, card.h + extra);
  const uw = w - 2 * px,
    uh = h - 2 * py;
  if (uw <= 0 || uh <= 0) return false;
  for (let i = 0; i < hints.length; i++)
    for (let j = i + 1; j < hints.length; j++) {
      const a = hints[i],
        b = hints[j];
      const apart = frameClearance(a.frames, b.frames, a.y <= b.y);
      const dx = Math.abs(a.x - b.x) * uw,
        dy = Math.abs(a.y - b.y) * uh;
      if (dx < card.w + CARD_GAP + apart.x && dy < card.h + ((a.extraH ?? 0) + (b.extraH ?? 0)) / 2 + CARD_GAP + apart.y) return false;
    }
  return true;
}

/** The largest scale s ≤ sMax at which a container of cw × ch, laid out at (cw/s) × (ch/s), fits the cards. */
function fitScale(hints: FitItem[], cw: number, ch: number, card: CardSize, sMax: number): number {
  if (cardsFit(hints, cw / sMax, ch / sMax, card)) return sMax;
  let lo = 0.2,
    hi = sMax;
  if (!cardsFit(hints, cw / lo, ch / lo, card)) return lo;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (cardsFit(hints, cw / mid, ch / mid, card)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface MapFit {
  /** Logical map size, in map units; the SVG shows it scaled to the container. */
  w: number;
  h: number;
  /** Map units per container pixel is 1 / scale. */
  scale: number;
  card: CardSize;
}

/**
 * Fit the map to a container of cw × ch pixels. The map is laid out in the container's own
 * pixels when it can be (so text stays crisp), never smaller than MIN_MAP, and scaled down
 * further only as much as needed for no two cards to overlap. When full cards would need more
 * than a little shrinking, compact one-line cards are used instead if they fit better.
 * Sizes are rounded to 8 units so small resizes do not re-layout.
 */
export function fitMap(hints: FitItem[], cw: number, ch: number): MapFit {
  const W = cw > 0 ? cw : MAP_W,
    H = ch > 0 ? ch : MAP_H;
  const sMax = Math.min(1, W / MIN_MAP.w, H / MIN_MAP.h);
  const sFull = fitScale(hints, W, H, CARD_FULL, sMax);
  let card = CARD_FULL,
    s = sFull;
  if (sFull < sMax * 0.9) {
    const sCompact = fitScale(hints, W, H, CARD_COMPACT, sMax);
    if (sCompact > sFull * 1.05) {
      card = CARD_COMPACT;
      s = sCompact;
    }
  }
  const r8 = (v: number) => Math.max(8, Math.round(v / 8) * 8);
  return { w: r8(W / s), h: r8(H / s), scale: s, card };
}

/** Node boxes for the map at player or group level. */
export function layoutNodes(players: PlayerDef[], groups: GroupLike[], level: Level, opts: LayoutOptions = {}): NodeBox[] {
  const o: Required<LayoutOptions> = { width: MAP_W, height: MAP_H, cardW: CARD_W, cardH: CARD_H, ...opts };
  const hints = new Map(levelHints(players, groups, level).map((h) => [h.id, h.hint]));
  if (level === 'player')
    return players.map((p) => {
      const c = placeHint(hints.get(p.id)!, o);
      return { id: p.id, label: p.label, short: p.short ?? p.id, color: p.color ?? '#8FA3C7', x: c.x, y: c.y, w: o.cardW, h: o.cardH, members: [p.id] };
    });
  return groups.map((g) => {
    const c = placeHint(hints.get(g.id)!, o);
    return { id: g.id, label: g.label, short: g.label, color: g.color ?? '#8FA3C7', x: c.x, y: c.y, w: o.cardW, h: o.cardH, members: [...g.players] };
  });
}

/* ------------------------------------------------------ the expandable view */

/** The usable part of a map (where card centres go), in map units. */
export interface Area {
  w: number;
  h: number;
}

/** The usable area of a map laid out for a container of cw × ch pixels at full size (before
 *  any shrinking to make cards fit): the frame of reference for deciding whether hints
 *  overlap and for the fallback arrangement. Defaults to the nominal MAP_W × MAP_H map. */
export function layoutArea(cw = MAP_W, ch = MAP_H): Area {
  const W = cw > 0 ? cw : MAP_W,
    H = ch > 0 ? ch : MAP_H;
  const s = Math.min(1, W / MIN_MAP.w, H / MIN_MAP.h);
  return { w: W / s - 2 * (CARD_W / 2 + 12), h: H / s - 2 * (CARD_H / 2 + 34) };
}

const NOMINAL: Area = layoutArea();

/** Players' own hints, with a ring for players that have none. */
export function playerHints(players: PlayerDef[]): Map<Id, Pt> {
  return new Map(players.map((p, i) => [p.id, p.layout ? { x: p.layout.x, y: p.layout.y } : ringHint(i, players.length)]));
}

/** A node's own hint: a player's layout, or a group's (its declared layout or the centroid of
 *  its players), with `own` false when it had to be made up. */
function ownHint(info: ModelInfo, base: Map<Id, Pt>, id: Id): { hint: Pt; own: boolean } {
  const p = info.playerById.get(id);
  if (p) return { hint: base.get(id)!, own: !!p.layout };
  const g = info.groupById.get(id);
  if (g?.layout) return { hint: { ...g.layout }, own: true };
  const pts = (g?.allPlayers ?? []).map((x) => base.get(x)).filter((x): x is Pt => !!x);
  const hint = pts.length ? { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length } : { x: 0.5, y: 0.5 };
  return { hint, own: false };
}

/** Would full cards at these hints overlap (frames between them included) on a map with this
 *  usable area (default: nominal)? */
export function hintsOverlap(items: { hint: Pt; extraH: number; frames?: readonly Id[] }[], area: Area = NOMINAL): boolean {
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i],
        b = items[j];
      const apart = frameClearance(a.frames, b.frames, a.hint.y <= b.hint.y);
      const dx = Math.abs(a.hint.x - b.hint.x) * area.w,
        dy = Math.abs(a.hint.y - b.hint.y) * area.h;
      if (dx < CARD_W + CARD_GAP + apart.x && dy < CARD_H + (a.extraH + b.extraH) / 2 + CARD_GAP + apart.y) return true;
    }
  return false;
}

interface Block {
  w: number;
  h: number;
  /** Node centres relative to the block's centre, in map units. */
  pts: Map<Id, Pt>;
}

const COL_GAP = 24,
  ROW_GAP = 14;

/**
 * Arrange blocks around a centre without overlaps: one column when it fits the height budget
 * (bowed into a gentle arc toward the middle of the map when there are more than four), else
 * as few side-by-side columns as fit.
 */
function arrange(blocks: Block[], bow: number, maxH: number): Block {
  const n = blocks.length;
  const total = blocks.reduce((s, b) => s + b.h, 0) + ROW_GAP * Math.max(0, n - 1);
  const cols = Math.max(1, Math.min(n, Math.ceil(total / Math.max(maxH, CARD_H * 1.5))));
  // Fill columns in order, each up to an even share of the height.
  const columns: Block[][] = [];
  const share = total / cols;
  let cur: Block[] = [],
    h = 0;
  for (const b of blocks) {
    if (cur.length && h + b.h > share + 1 && columns.length < cols - 1) {
      columns.push(cur);
      cur = [];
      h = 0;
    }
    cur.push(b);
    h += b.h + ROW_GAP;
  }
  columns.push(cur);
  const widths = columns.map((c) => Math.max(...c.map((b) => b.w)));
  const heights = columns.map((c) => c.reduce((s, b) => s + b.h, 0) + ROW_GAP * (c.length - 1));
  const arc = columns.length === 1 && n > 4 ? bow : 0;
  const W = widths.reduce((s, w) => s + w, 0) + COL_GAP * (columns.length - 1) + Math.abs(arc);
  const H = Math.max(...heights);
  const pts = new Map<Id, Pt>();
  let x0 = -W / 2 + (arc < 0 ? -arc : 0);
  columns.forEach((c, ci) => {
    const cx = x0 + widths[ci] / 2;
    let y = -heights[ci] / 2;
    c.forEach((b, i) => {
      const t = c.length > 1 ? (2 * i) / (c.length - 1) - 1 : 0;
      const bx = cx + arc * (1 - t * t);
      const by = y + b.h / 2;
      for (const [id, p] of b.pts) pts.set(id, { x: bx + p.x, y: by + p.y });
      y += b.h + ROW_GAP;
    });
    x0 += widths[ci] + COL_GAP;
  });
  return { w: W, h: H, pts };
}

/**
 * Hints (0..1) of every visible node. Nodes outside open groups sit at their own hints. An open
 * top-level group keeps its members' own hints when they all have one and no two overlap on a
 * map of this usable area (see layoutArea); otherwise it is laid out as nested blocks (a frame
 * per open group) centred on its position.
 */
export function viewHints(info: ModelInfo, tree: ViewTree, area: Area = NOMINAL): Map<Id, Pt> {
  const base = playerHints(info.players);
  const frames = new Map(tree.frames.map((f) => [f.id, f]));
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const extraH = (id: Id) => (byId.get(id)?.kind === 'group' ? GROUP_EXTRA_H : 0);
  const out = new Map<Id, Pt>();
  const nodesIn = (id: Id): Id[] => frames.get(id)!.items.flatMap((it) => (it.frame ? nodesIn(it.id) : [it.id]));
  const block = (id: Id, frame: boolean, bow: number, maxH: number): Block => {
    if (!frame) return { w: CARD_W, h: CARD_H + extraH(id), pts: new Map([[id, { x: 0, y: 0 }]]) };
    const inner = arrange(
      frames.get(id)!.items.map((it) => block(it.id, it.frame, bow, maxH - FRAME_PAD - FRAME_TOP)),
      bow,
      maxH - FRAME_PAD - FRAME_TOP,
    );
    // Room for the frame: padding all round and the label on top.
    const pts = new Map<Id, Pt>();
    for (const [k, p] of inner.pts) pts.set(k, { x: p.x, y: p.y + (FRAME_TOP - FRAME_PAD) / 2 });
    return { w: inner.w + 2 * FRAME_PAD, h: inner.h + FRAME_PAD + FRAME_TOP, pts };
  };
  // Where every top-level item would sit on its own: the obstacles an open group's block avoids.
  const roots = tree.roots.map((r) => ({ ...r, own: ownHint(info, base, r.id) }));
  const layouts = new Map<Id, { hint: Pt; own: boolean; id: Id; extraH: number; frames: Id[] }[]>();
  const fallback: Id[] = [];
  for (const r of roots) {
    if (!r.frame) {
      out.set(r.id, r.own.hint);
      continue;
    }
    const inside = nodesIn(r.id).map((id) => ({ id, ...ownHint(info, base, id), extraH: extraH(id), frames: byId.get(id)!.frames }));
    layouts.set(r.id, inside);
    if (inside.every((x) => x.own) && !hintsOverlap(inside, area)) for (const x of inside) out.set(x.id, x.hint);
    else fallback.push(r.id);
  }
  const clamp = (v: number, half: number) => (half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, v)));
  const bowOf = (id: Id) => (roots.find((r) => r.id === id)!.own.hint.x <= 0.5 ? 1 : -1) * CARD_W * 0.35;
  const fullH = Math.max(area.h, CARD_H * 2) * 0.95;
  // Each open group laid out in full at its own position: what the others must keep clear of.
  const homes = new Map(
    fallback.map((id) => {
      const b = block(id, true, bowOf(id), fullH);
      const at = roots.find((r) => r.id === id)!.own.hint;
      const c = { x: clamp(at.x, (b.w / 2 - CARD_W / 2 - FRAME_PAD) / area.w), y: clamp(at.y, (b.h / 2 - CARD_H / 2 - FRAME_TOP) / area.h) };
      return [id, { b, c }] as const;
    }),
  );
  const rectOfNode = (p: Pt, h: number): Rect => ({ x: p.x * area.w - CARD_W / 2, y: p.y * area.h - h / 2, w: CARD_W, h });
  for (const id of fallback) {
    const r = roots.find((x) => x.id === id)!;
    const obstacles: Rect[] = roots
      .filter((o) => o.id !== id)
      .flatMap((o) => {
        if (!o.frame) return [rectOfNode(o.own.hint, CARD_H + extraH(o.id))];
        const home = homes.get(o.id);
        if (home) return [{ x: home.c.x * area.w - home.b.w / 2, y: home.c.y * area.h - home.b.h / 2, w: home.b.w, h: home.b.h }];
        return layouts.get(o.id)!.map((x) => rectOfNode(x.hint, CARD_H + x.extraH));
      });
    // Try the full height first, then shorter and wider arrangements, and keep the first that
    // finds a place clear of the other cards and groups. If none does, keep the full-height
    // arrangement at the group's own position: the map then scales down, but stays predictable.
    let best: { b: Block; c: Pt } | null = null;
    for (const f of [1, 0.8, 0.63, 0.47]) {
      const b = f === 1 ? homes.get(id)!.b : block(id, true, bowOf(id), fullH * f);
      const c = placeBlock(b, r.own.hint, obstacles, area);
      if (c.cost === 0) {
        best = { b, c };
        break;
      }
    }
    const { b, c } = best ?? homes.get(id)!;
    for (const [nid, p] of b.pts) out.set(nid, { x: Math.min(1, Math.max(0, c.x + p.x / area.w)), y: Math.min(1, Math.max(0, c.y + p.y / area.h)) });
  }
  return out;
}

/**
 * Where to centre an open group's block: as near its own position as possible, inside the map,
 * and clear of the obstacles around it; `cost` is the overlap with them (0 when clear).
 */
function placeBlock(b: Block, at: Pt, obstacles: Rect[], area: Area): Pt & { cost: number } {
  const clamp = (v: number, half: number) => (half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, v)));
  const hx = (b.w / 2 - CARD_W / 2 - FRAME_PAD) / area.w,
    hy = (b.h / 2 - CARD_H / 2 - FRAME_TOP) / area.h;
  const overlap = (c: Pt) => {
    const x0 = c.x * area.w - b.w / 2 - CARD_GAP,
      x1 = c.x * area.w + b.w / 2 + CARD_GAP,
      y0 = c.y * area.h - b.h / 2 - CARD_GAP,
      y1 = c.y * area.h + b.h / 2 + CARD_GAP;
    let sum = 0;
    for (const o of obstacles) {
      const w = Math.min(x1, o.x + o.w) - Math.max(x0, o.x);
      const h = Math.min(y1, o.y + o.h) - Math.max(y0, o.y);
      if (w > 0 && h > 0) sum += w * h;
    }
    return sum;
  };
  const home = { x: clamp(at.x, hx), y: clamp(at.y, hy) };
  // A block larger than the map cannot be placed well anywhere.
  if (b.w > area.w + CARD_W + 2 * FRAME_PAD || b.h > area.h + CARD_H + FRAME_PAD + FRAME_TOP) return { ...home, cost: Infinity };
  const steps: number[] = [0];
  for (let k = 1; k <= 8; k++) steps.push(k * 0.05, -k * 0.05);
  const tries = steps.flatMap((dx) => steps.map((dy) => ({ x: clamp(at.x + dx, hx), y: clamp(at.y + dy, hy) })));
  const dist = (p: Pt) => Math.hypot((p.x - at.x) * area.w, (p.y - at.y) * area.h);
  let best: (Pt & { cost: number }) | null = null;
  let bestD = Infinity;
  for (const p of tries) {
    const cost = overlap(p),
      d = dist(p);
    if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && d < bestD)) {
      best = { ...p, cost };
      bestD = d;
    }
  }
  return best!;
}

/**
 * Stretch hints so the nodes use the whole map: along each axis the nodes' span is scaled up
 * (at most `max` times) and centred. Distances only grow, so nothing new overlaps.
 */
export function spreadHints(hints: Map<Id, Pt>, max = 1.6): Map<Id, Pt> {
  const pts = [...hints.values()];
  if (pts.length < 2) return hints;
  const axis = (k: 'x' | 'y') => {
    const lo = Math.min(...pts.map((p) => p[k])),
      hi = Math.max(...pts.map((p) => p[k]));
    const f = hi - lo > 1e-9 ? Math.min(max, 1 / (hi - lo)) : 1;
    return (v: number) => Math.min(1, Math.max(0, 0.5 + (v - (lo + hi) / 2) * f));
  };
  const fx = axis('x'),
    fy = axis('y');
  return new Map([...hints].map(([id, p]) => [id, { x: fx(p.x), y: fy(p.y) }]));
}

/**
 * The hints for a view on a container of cw × ch pixels. The layout is tried on the container
 * at full size, then on larger virtual maps (which the fit then scales down), and the first on
 * which no two cards or frames collide is kept: the arrangement is chosen for the size at which
 * it will actually be drawn. Hints are finally spread to use the whole map.
 */
export function viewLayoutHints(info: ModelInfo, tree: ViewTree, cw: number, ch: number): Map<Id, Pt> {
  const W = cw > 0 ? cw : MAP_W,
    H = ch > 0 ? ch : MAP_H;
  let last: Map<Id, Pt> | null = null;
  for (const k of [1, 1.15, 1.3, 1.5, 1.75, 2, 2.4, 3]) {
    const area = layoutArea(W * k, H * k);
    const hints = spreadHints(viewHints(info, tree, area));
    last = hints;
    const items = tree.nodes.map((n) => ({ hint: hints.get(n.id)!, extraH: n.kind === 'group' ? GROUP_EXTRA_H : 0, frames: n.frames }));
    if (!hintsOverlap(items, area)) return hints;
  }
  return last!;
}

/** What to fit on the map for a view: each node's hint, extra height and frames. */
export function viewFitItems(tree: ViewTree, hints: Map<Id, Pt>): FitItem[] {
  return tree.nodes.map((n) => ({ ...hints.get(n.id)!, extraH: n.kind === 'group' ? GROUP_EXTRA_H : 0, frames: n.frames }));
}

/** Node boxes for a view of the hierarchy, in map units. */
export function layoutView(info: ModelInfo, tree: ViewTree, hints: Map<Id, Pt>, opts: LayoutOptions = {}): NodeBox[] {
  const o: Required<LayoutOptions> = { width: MAP_W, height: MAP_H, cardW: CARD_W, cardH: CARD_H, ...opts };
  const extra = tree.nodes.some((n) => n.kind === 'group') ? GROUP_EXTRA_H : 0;
  return tree.nodes.map((n) => {
    const c = placeHint(hints.get(n.id) ?? { x: 0.5, y: 0.5 }, { ...o, cardH: o.cardH + extra });
    const short = n.kind === 'player' ? (info.playerById.get(n.id)?.short ?? n.id) : n.label;
    return { id: n.id, label: n.label, short, color: n.color, x: c.x, y: c.y, w: o.cardW, h: o.cardH + (n.kind === 'group' ? GROUP_EXTRA_H : 0), members: [...n.members], kind: n.kind, frames: [...n.frames] };
  });
}

export interface FrameBox extends Rect {
  id: Id;
  label: string;
  color: string;
  depth: number;
}

/** Frames around open groups: the box around their nodes and inner frames, plus padding,
 *  kept inside the map. Outer frames come first (drawn underneath). */
export function frameBoxes(tree: ViewTree, nodes: Map<Id, NodeBox>, bounds: { w: number; h: number }): FrameBox[] {
  const byId = new Map(tree.frames.map((f) => [f.id, f]));
  const memo = new Map<Id, Rect>();
  const rectOf = (id: Id): Rect | null => {
    if (memo.has(id)) return memo.get(id)!;
    const f = byId.get(id)!;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const it of f.items) {
      const r = it.frame ? rectOf(it.id) : nodes.has(it.id) ? nodeRect(nodes.get(it.id)!) : null;
      if (!r) continue;
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    if (!(x1 > x0)) return null;
    const rx = Math.max(2, x0 - FRAME_PAD),
      ry = Math.max(2, y0 - FRAME_TOP),
      r = { x: rx, y: ry, w: Math.min(bounds.w - 2, x1 + FRAME_PAD) - rx, h: Math.min(bounds.h - 2, y1 + FRAME_PAD) - ry };
    memo.set(id, r);
    return r;
  };
  return tree.frames.flatMap((f) => {
    const r = rectOf(f.id);
    return r ? [{ ...r, id: f.id, label: f.label, color: f.color, depth: f.depth }] : [];
  });
}

export interface PipeLike {
  from: Id;
  to: Id;
  kind: FlowKind;
}

export interface PipeGeom {
  key: string;
  from: Id;
  to: Id;
  kind: FlowKind;
  /** SVG path data, drawn from `from` to `to` (particles move along it). */
  d: string;
  start: Pt;
  end: Pt;
  /** Point halfway along the curve, for labels. */
  mid: Pt;
  selfLoop: boolean;
}

export const KIND_ORDER: FlowKind[] = ['cash', 'accrual', 'revaluation', 'writeoff'];

export function pipeKey(p: PipeLike): string {
  return `${p.from}->${p.to}:${p.kind}`;
}

/** Where a ray from a box's centre toward `toward` leaves the box (plus a gap). */
export function boxExit(c: Pt, halfW: number, halfH: number, toward: Pt, gap = 4): Pt {
  const dx = toward.x - c.x,
    dy = toward.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: c.x, y: c.y - halfH - gap };
  const t = Math.min(dx !== 0 ? halfW / Math.abs(dx) : Infinity, dy !== 0 ? halfH / Math.abs(dy) : Infinity);
  const ux = dx / len,
    uy = dy / len;
  return { x: c.x + dx * t + ux * gap, y: c.y + dy * t + uy * gap };
}

/** Point on a quadratic Bézier. */
export function quadAt(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export interface GeometryOptions {
  /** Bow of the first lane, in map units, at the curve's midpoint. */
  lane?: number;
  /** Extra bow per further lane in the same direction. */
  laneStep?: number;
}

/** Geometry for every pipe, keyed by pipeKey. Deterministic for a given set of pipes. */
export function pipeGeometry(pipes: PipeLike[], nodes: Map<Id, NodeBox>, opts: GeometryOptions = {}): Map<string, PipeGeom> {
  const lane = opts.lane ?? 20,
    laneStep = opts.laneStep ?? 18;
  const out = new Map<string, PipeGeom>();
  const pairs = new Map<string, PipeLike[]>();
  const loops = new Map<Id, PipeLike[]>();
  for (const p of pipes) {
    if (!nodes.has(p.from) || !nodes.has(p.to)) continue;
    if (p.from === p.to) {
      const arr = loops.get(p.from) ?? [];
      arr.push(p);
      loops.set(p.from, arr);
      continue;
    }
    const k = p.from < p.to ? `${p.from}\u0000${p.to}` : `${p.to}\u0000${p.from}`;
    const arr = pairs.get(k) ?? [];
    arr.push(p);
    pairs.set(k, arr);
  }
  const kindRank = (k: FlowKind) => KIND_ORDER.indexOf(k);
  for (const group of pairs.values()) {
    group.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0) || kindRank(a.kind) - kindRank(b.kind));
    const laneIx = new Map<string, number>();
    for (const p of group) {
      const dir = `${p.from}\u0000${p.to}`;
      const i = laneIx.get(dir) ?? 0;
      laneIx.set(dir, i + 1);
      const A = nodes.get(p.from)!,
        B = nodes.get(p.to)!;
      const dx = B.x - A.x,
        dy = B.y - A.y;
      const len = Math.hypot(dx, dy) || 1;
      // Unit normal to the right of the direction of travel (screen coordinates, y down).
      const nx = -dy / len,
        ny = dx / len;
      const bow = lane + i * laneStep;
      const midX = (A.x + B.x) / 2,
        midY = (A.y + B.y) / 2;
      const ctrl = { x: midX + nx * 2 * bow, y: midY + ny * 2 * bow };
      const start = boxExit(A, A.w / 2, A.h / 2, ctrl);
      const end = boxExit(B, B.w / 2, B.h / 2, ctrl, 6);
      const mid = quadAt(start, ctrl, end, 0.5);
      out.set(pipeKey(p), {
        key: pipeKey(p),
        from: p.from,
        to: p.to,
        kind: p.kind,
        d: `M${r1(start.x)},${r1(start.y)} Q${r1(ctrl.x)},${r1(ctrl.y)} ${r1(end.x)},${r1(end.y)}`,
        start,
        end,
        mid,
        selfLoop: false,
      });
    }
  }
  for (const [id, group] of loops) {
    group.sort((a, b) => kindRank(a.kind) - kindRank(b.kind));
    const N = nodes.get(id)!;
    group.forEach((p, i) => {
      const top = N.y - N.h / 2 - 2;
      const spread = 18 + i * 10,
        rise = 44 + i * 16,
        reach = 34 + i * 12;
      const start = { x: N.x - spread, y: top },
        end = { x: N.x + spread, y: top };
      const c1 = { x: N.x - reach, y: top - rise },
        c2 = { x: N.x + reach, y: top - rise };
      out.set(pipeKey(p), {
        key: pipeKey(p),
        from: p.from,
        to: p.to,
        kind: p.kind,
        d: `M${r1(start.x)},${r1(start.y)} C${r1(c1.x)},${r1(c1.y)} ${r1(c2.x)},${r1(c2.y)} ${r1(end.x)},${r1(end.y)}`,
        start,
        end,
        mid: { x: N.x, y: top - rise * 0.75 },
        selfLoop: true,
      });
    });
  }
  return out;
}

/**
 * Pipe thickness ∝ √size, scaled so the largest baseline pipe of the map is `maxW` wide.
 * `scale` is that largest |baseline| (a fixed reference, so widths do not jump as values move).
 */
export function pipeWidth(value: number, scale: number, maxW = 16, minW = 1.25): number {
  const s = scale > 1e-12 ? scale : 1;
  const w = maxW * Math.sqrt(Math.abs(value) / s);
  return Math.max(minW, Math.min(maxW * 1.6, w));
}

/** Largest |baseline| across pipes (the width reference). */
export function widthScale(pipes: { baseline: number; value: number }[]): number {
  let m = 0;
  for (const p of pipes) m = Math.max(m, Math.abs(p.baseline));
  if (m < 1e-12) for (const p of pipes) m = Math.max(m, Math.abs(p.value));
  return m || 1;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect, pad = 2) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/**
 * Place pipe labels (centred rectangles, in priority order) so they do not overlap each other or
 * the node cards: each label tries its anchor, then small vertical and horizontal nudges, and
 * keeps its anchor if nothing is free. Returns the centre of each label by key.
 */
export function placeLabels(labels: { key: string; x: number; y: number; w: number; h: number }[], obstacles: Rect[], bounds?: { w: number; h: number }): Map<string, Pt> {
  const placed: Rect[] = [];
  const out = new Map<string, Pt>();
  const nudges: [number, number][] = [[0, 0]];
  for (const d of [14, 28, 42, 56]) nudges.push([0, -d], [0, d]);
  for (const d of [40, 80]) nudges.push([-d, 0], [d, 0], [-d, -20], [d, 20]);
  for (const l of labels) {
    let best: Pt | null = null;
    for (const [dx, dy] of nudges) {
      const r = { x: l.x + dx - l.w / 2, y: l.y + dy - l.h / 2, w: l.w, h: l.h };
      if (bounds && (r.x < 0 || r.y < 0 || r.x + r.w > bounds.w || r.y + r.h > bounds.h)) continue;
      if (placed.some((p) => overlaps(p, r)) || obstacles.some((o) => overlaps(o, r))) continue;
      best = { x: l.x + dx, y: l.y + dy };
      placed.push(r);
      break;
    }
    if (!best) {
      best = { x: l.x, y: l.y };
      placed.push({ x: l.x - l.w / 2, y: l.y - l.h / 2, w: l.w, h: l.h });
    }
    out.set(l.key, best);
  }
  return out;
}

/** The rectangle a node card covers. */
export function nodeRect(n: NodeBox): Rect {
  return { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h };
}
