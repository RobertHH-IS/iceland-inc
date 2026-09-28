/**
 * Flow-map geometry: where nodes sit and how pipes curve between them. Pure functions.
 *
 * Nodes come from the players' layout hints (0..1, x right, y down). At group level a group
 * sits at the centroid of its players. Pipes are quadratic curves that bow to the right of
 * their direction of travel, so the two directions between a pair of nodes never overlap, and
 * extra pipes between the same pair (other kinds) take wider lanes. A flow from a node to
 * itself (firms buying from firms) is drawn as a loop above the node.
 */
import type { FlowKind, Id, PlayerDef } from '../../core/types.ts';
import type { GroupInfo } from './info.ts';

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
export function levelHints(players: PlayerDef[], groups: GroupInfo[], level: Level): { id: Id; hint: Pt }[] {
  const hints = new Map<Id, Pt>();
  players.forEach((p, i) => hints.set(p.id, p.layout ? { x: p.layout.x, y: p.layout.y } : ringHint(i, players.length)));
  if (level === 'player') return players.map((p) => ({ id: p.id, hint: hints.get(p.id)! }));
  return groups.map((g) => {
    const pts = g.players.map((id) => hints.get(id)).filter((p): p is Pt => !!p);
    const hint = pts.length ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length } : { x: 0.5, y: 0.5 };
    return { id: g.id, hint };
  });
}

/** True when no two cards overlap on a map of w × h. */
function cardsFit(hints: Pt[], w: number, h: number, card: CardSize): boolean {
  const { px, py } = margins(card.w, card.h);
  const uw = w - 2 * px,
    uh = h - 2 * py;
  if (uw <= 0 || uh <= 0) return false;
  for (let i = 0; i < hints.length; i++)
    for (let j = i + 1; j < hints.length; j++) {
      const dx = Math.abs(hints[i].x - hints[j].x) * uw,
        dy = Math.abs(hints[i].y - hints[j].y) * uh;
      if (dx < card.w + CARD_GAP && dy < card.h + CARD_GAP) return false;
    }
  return true;
}

/** The largest scale s ≤ sMax at which a container of cw × ch, laid out at (cw/s) × (ch/s), fits the cards. */
function fitScale(hints: Pt[], cw: number, ch: number, card: CardSize, sMax: number): number {
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
export function fitMap(hints: Pt[], cw: number, ch: number): MapFit {
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
export function layoutNodes(players: PlayerDef[], groups: GroupInfo[], level: Level, opts: LayoutOptions = {}): NodeBox[] {
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
