/**
 * FlowMap: the players and groups of the model and the pipes between them, at whatever level
 * of the hierarchy is open (engine.pipes({ expanded })).
 *
 * A closed group is a stack of cards with its member count and colour dots; clicking it opens
 * it in place: its members replace it, inside a soft frame that closes the group again when
 * clicked. Cards glide from the group's position to their own and pipes crossfade (about
 * 360 ms; nothing moves when the user asks for reduced motion).
 *
 * Every cash pipe carries moving particles (a CSS dash animation); thickness ∝ √size; particle
 * speed rises with value/baseline (the animation's playback rate); an amber glow means above
 * baseline, blue-grey below; dashed pipes without particles are accruals, revaluations and
 * write-offs. Flows inside a closed group are a loop on its card. The seven most changed pipes
 * are labelled. Click a pipe, a player or a group to inspect it.
 *
 * On a model that opens on a dated month 0 (docs/design/today-opening.md §7), amounts are in the
 * currency ("ISK 2,740 bn a year"); a pipe's title adds its change since today from month 1 and
 * its effect against the no-change path once a lever has moved, and a card's numbers are levels,
 * with a small effect only once a lever has moved. Nothing pulses.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { FlowKind, Id, ScenarioEvent } from '../../core/types.ts';
import type { ClientPipe, EngineClient } from '../engine-client.ts';
import { fmtReport } from '../model/charts.ts';
import { changeNotes, displayOf, effect, fmtCardChange, fmtChangeOf, flowMeasure, isDated, leverMoved, measureOf, money, type ChangeScale, type Display } from '../model/effects.ts';
import { labels } from '../labels.ts';
import { fmtCompact, fmtCompactChange, fmtIndicator, fmtNum, fmtSigned } from '../model/format.ts';
import { MAP_H, MAP_W, fitMap, frameBoxes, layoutView, nodeRect, pipeGeometry, pipeKey, pipeWidth, placeLabels, viewFitItems, viewLayoutHints, widthScale, type FrameBox, type NodeBox, type Pt, type PipeGeom } from '../model/geometry.ts';
import { directMembers, memberCount, viewKey, viewTree, visibleNode, type ViewTree } from '../model/hierarchy.ts';
import type { ModelInfo } from '../model/info.ts';
import { nodeColor, nodeLabel } from '../model/info.ts';
import type { Selection } from '../model/navigation.ts';
import { cardFamily, fitCardRow, GROUP_NOUNS, resolveCardMetrics, type ResolvedMetric } from '../model/player-cards.ts';
import { financialHealth } from '../model/financial-health.ts';
import { deviation, pipeStyle, signTone, topChanged, type Tone } from '../model/styling.ts';
import type { OnSelect } from './common.tsx';
import { usePrefersReducedMotion } from './hooks.ts';

interface FlowMapProps {
  info: ModelInfo;
  client: EngineClient;
  /** Groups open on the map, one-player groups included (see effectiveExpanded). */
  expanded: ReadonlySet<Id>;
  /** The pipes for that view: client.pipes({ expanded }). */
  pipes: ClientPipe[];
  legs: Float64Array;
  /** The month shown and the lever events so far: changes since today show from month 1, effects
   *  once a lever has moved. */
  t?: number;
  events?: readonly ScenarioEvent[];
  regimes: Readonly<Record<Id, string | null>>;
  /** Stabilisers acting now (unlocked), space-separated ids: their numbers get an "auto" marker. */
  rulesActing?: string;
  seq: number;
  selection: Selection | null;
  onSelect: OnSelect;
  /** Open a closed group (and show it in the inspector). */
  onOpenGroup: (id: Id) => void;
  /** Close an open group. */
  onCloseGroup: (id: Id) => void;
}

/** How long cards take to glide and pipes to crossfade when a group opens or closes. */
export const ANIM_MS = 360;

interface PipeShot {
  key: string;
  d: string;
  kind: FlowKind;
  tone: Tone;
  width: number;
}

interface Snapshot {
  key: string;
  w: number;
  h: number;
  nodes: Map<Id, NodeBox>;
  pipes: PipeShot[];
}

interface Anim {
  id: number;
  /** False for the first frame (cards drawn where they come from), then true (they move). */
  run: boolean;
  /** Old map units → new map units. */
  sx: number;
  sy: number;
  origins: Map<Id, Pt>;
  ghosts: { node: NodeBox; from: Pt; to: Pt }[];
  oldPipes: PipeShot[];
  newPipes: Set<string>;
  newNodes: Set<Id>;
}

let animSeq = 0;

const NO_EVENTS: readonly ScenarioEvent[] = [];

export const FlowMap = memo(function FlowMap({ info, client, expanded, pipes, legs, t = 0, events = NO_EVENTS, regimes, rulesActing = '', seq, selection, onSelect, onOpenGroup, onCloseGroup }: FlowMapProps) {
  const display = useMemo(() => displayOf(client), [client]);
  const moved = leverMoved(events, t);
  // Lay the map out in the container's own pixels, so text stays readable at any size, and
  // scale it down only as far as the cards need to stay clear of each other.
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ cw: MAP_W, ch: MAP_H });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = (w: number, h: number) => {
      const next = { cw: Math.round(w / 8) * 8, ch: Math.round(h / 8) * 8 };
      if (next.cw > 0 && next.ch > 0) setSize((b) => (b.cw === next.cw && b.ch === next.ch ? b : next));
    };
    const r = el.getBoundingClientRect();
    fit(r.width, r.height);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => fit(e.contentRect.width, e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const vkey = viewKey(expanded);
  const tree = useMemo(() => viewTree(info, expanded), [info, vkey]);
  // Hints for this view on a map of this size: open groups whose members' hints would overlap
  // are laid out as blocks, for the size at which the map will be drawn; then spread out.
  const hints = useMemo(() => viewLayoutHints(info, tree, size.cw, size.ch), [info, tree, size]);
  const box = useMemo(() => fitMap(viewFitItems(tree, hints), size.cw, size.ch), [tree, hints, size]);
  const nodes = useMemo(() => layoutView(info, tree, hints, { width: box.w, height: box.h, cardW: box.card.w, cardH: box.card.h }), [info, tree, hints, box]);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const frames = useMemo(() => frameBoxes(tree, nodeMap, box), [tree, nodeMap, box]);
  const signature = pipes.map(pipeKey).join('|');
  // The set of pipes is fixed for a model and view, so their geometry is too: it is recomputed
  // only when that set or the layout changes, not on every tick. Widths share one reference
  // (the largest pipe between top-level groups), so a pipe is as thick in every view.
  const geom = useMemo(() => pipeGeometry(pipes, nodeMap), [nodeMap, signature]);
  const scale = useMemo(() => widthScale(client.pipes('group')), [client]);
  const top = topChanged(pipes, 7);
  const labelText = top.map((p) => ({ p, ...pipeLabelText(info, p, display) }));
  // Labels keep clear of the cards and of the frames' name tabs.
  const cards = useMemo(() => [...nodes.map(nodeRect), ...frames.map((f) => ({ x: f.x + 14, y: f.y - 10, w: tabWidth(f.label), h: 20 }))], [nodes, frames]);
  const labelPos = placeLabels(
    labelText.flatMap(({ p, text }) => {
      const g = geom.get(pipeKey(p));
      return g ? [{ key: pipeKey(p), x: g.mid.x, y: g.mid.y, w: labelWidth(text), h: 20 }] : [];
    }),
    cards,
    { w: box.w, h: box.h },
  );

  const focus = useMemo(() => focusOf(info, tree, expanded, selection), [info, tree, expanded, selection]);
  const hasFocus = focus.nodes.size > 0 || !!focus.pipe;
  const lit = (id: Id) => !hasFocus || focus.nodes.has(id);

  /* ------------------------------------------------ opening and closing */
  const reduce = usePrefersReducedMotion();
  const last = useRef<Snapshot | null>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  useLayoutEffect(() => {
    const prev = last.current;
    if (!prev || prev.key === vkey || reduce) {
      setAnim(null);
      return;
    }
    const sx = box.w / prev.w,
      sy = box.h / prev.h;
    const scaled = (p: Pt): Pt => ({ x: p.x * sx, y: p.y * sy });
    const origins = new Map<Id, Pt>();
    const newNodes = new Set<Id>();
    for (const n of nodes) {
      const was = prev.nodes.get(n.id);
      if (was) {
        origins.set(n.id, scaled(was));
        continue;
      }
      newNodes.add(n.id);
      // A member of a group that has just opened starts on the group's card.
      const from = (info.ancestorsOf.get(n.id) ?? []).map((g) => prev.nodes.get(g)).find((x) => !!x);
      if (from) origins.set(n.id, scaled(from));
    }
    const ghosts: Anim['ghosts'] = [];
    for (const [id, was] of prev.nodes) {
      if (nodeMap.has(id)) continue;
      // A member of a group that has just closed slides into the group's card and fades.
      const into = visibleNode(info, id, expanded);
      const target = into ? nodeMap.get(into) : undefined;
      ghosts.push({ node: was, from: scaled(was), to: target ? { x: target.x, y: target.y } : scaled(was) });
    }
    const keys = new Set(pipes.map(pipeKey));
    const prevKeys = new Set(prev.pipes.map((p) => p.key));
    const id = ++animSeq;
    setAnim({ id, run: false, sx, sy, origins, ghosts, oldPipes: prev.pipes.filter((p) => !keys.has(p.key)), newPipes: new Set([...keys].filter((k) => !prevKeys.has(k))), newNodes });
    const done = setTimeout(() => setAnim((a) => (a && a.id === id ? null : a)), ANIM_MS + 90);
    return () => clearTimeout(done);
    // Only a change of view starts an animation; resizes and ticks do not.
  }, [vkey]);
  // FLIP: once the cards are drawn where they come from, make the browser compute that style,
  // then move them to where they go; the CSS transition animates between the two.
  useLayoutEffect(() => {
    if (!anim || anim.run) return;
    wrap.current?.getBoundingClientRect();
    setAnim((a) => (a && a.id === anim.id ? { ...a, run: true } : a));
  }, [anim?.id, anim?.run]);
  // Remember what is on screen, for the next change of view.
  useLayoutEffect(() => {
    last.current = {
      key: vkey,
      w: box.w,
      h: box.h,
      nodes: nodeMap,
      pipes: pipes.flatMap((p) => {
        const g = geom.get(pipeKey(p));
        return g ? [{ key: g.key, d: g.d, kind: p.kind, tone: deviation(p.value, p.baseline).tone, width: pipeWidth(p.value, scale) }] : [];
      }),
    };
  });
  const at = (n: NodeBox): Pt => (anim && !anim.run ? (anim.origins.get(n.id) ?? n) : n);
  const closedGroups = nodes.filter((n) => n.kind === 'group').length;

  return (
    <div className="flowmap">
      <div className="map-wrap" ref={wrap}>
        <svg
          className={`map ${hasFocus ? 'has-focus' : ''}${box.card.lines === 1 ? ' compact' : ''}${anim?.run ? ' animating' : ''}`}
          viewBox={`0 0 ${box.w} ${box.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={`Flow map of ${info.label}: ${nodes.length} nodes${closedGroups ? ` (${closedGroups} closed group${closedGroups === 1 ? '' : 's'})` : ''} and ${pipes.length} pipes`}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,1 L9,5 L0,9 z" className="arrowhead" />
            </marker>
          </defs>
          <g className="frames">
            {frames.map((f) => (
              <FrameBack key={f.id} frame={f} selected={focus.frame === f.id} onClose={onCloseGroup} />
            ))}
          </g>
          {anim && anim.oldPipes.length > 0 && (
            <g className="pipes-old" transform={`scale(${anim.sx} ${anim.sy})`} aria-hidden="true">
              {anim.oldPipes.map((p) => (
                <path key={p.key} className={`old-pipe kind-${p.kind} tone-${p.tone}${p.kind === 'cash' ? '' : ' dashed'}`} d={p.d} style={{ strokeWidth: p.width }} />
              ))}
            </g>
          )}
          <g className="pipes">
            {pipes.map((p) => {
              const k = pipeKey(p);
              const g = geom.get(k);
              if (!g) return null;
              const related = focus.pipe ? k === focus.pipe : focus.nodes.has(p.from) || focus.nodes.has(p.to);
              return <PipeView key={k} geom={g} pipe={p} label={pipeTitle(info, display, p, t, moved)} width={pipeWidth(p.value, scale)} selected={k === focus.pipe} related={related} entering={!!anim?.newPipes.has(k)} onSelect={onSelect} />;
            })}
          </g>
          <g className="frame-tabs">
            {frames.map((f) => (
              <FrameTab key={f.id} frame={f} selected={focus.frame === f.id} onClose={onCloseGroup} />
            ))}
          </g>
          <g className="pipe-labels" aria-hidden="true">
            {labelText.map(({ p, name, change }) => {
              const k = pipeKey(p);
              const pos = labelPos.get(k);
              return pos ? <PipeLabel key={k} at={pos} name={name} change={change} tone={deviation(p.value, p.baseline).tone} /> : null;
            })}
          </g>
          {anim && anim.ghosts.length > 0 && (
            <g className="ghosts" aria-hidden="true">
              {anim.ghosts.map((g) => (
                <GhostCard key={g.node.id} node={g.node} at={anim.run ? g.to : g.from} gone={anim.run} />
              ))}
            </g>
          )}
          <g className="nodes">
            {nodes.map((n) => {
              const p = at(n);
              return (
                <NodeCardLive
                  key={n.id}
                  info={info}
                  client={client}
                  node={n}
                  px={p.x}
                  py={p.y}
                  lines={box.card.lines}
                  legs={legs}
                  display={display}
                  t={t}
                  moved={moved}
                  regimes={regimes}
                  rulesActing={rulesActing}
                  seq={seq}
                  selected={focus.selected === n.id}
                  dim={!lit(n.id)}
                  entering={!!anim && anim.newNodes.has(n.id) && !anim.origins.has(n.id)}
                  onSelect={onSelect}
                  onOpenGroup={onOpenGroup}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <Legend grouped={info.groups.some((g) => g.allPlayers.length > 1)} moving={client.comparison === 'no-change'} />
    </div>
  );
});

/**
 * What to highlight for a selection: the node a player or group is drawn as (a closed group
 * lights up for a player hidden inside it), every node inside an open group, and the pipe
 * that carries a selected pipe's legs at this view.
 */
function focusOf(info: ModelInfo, tree: ViewTree, eff: ReadonlySet<Id>, s: Selection | null): { nodes: Set<Id>; selected: Id | null; frame: Id | null; pipe: string | null } {
  const none = { nodes: new Set<Id>(), selected: null, frame: null, pipe: null };
  if (!s) return none;
  if (s.kind === 'player' || s.kind === 'group') {
    const v = visibleNode(info, s.id, eff);
    if (v) return { nodes: new Set([v]), selected: v, frame: null, pipe: null };
    if (s.kind === 'group' && tree.frames.some((f) => f.id === s.id)) return { nodes: new Set(tree.nodes.filter((n) => n.frames.includes(s.id)).map((n) => n.id)), selected: null, frame: s.id, pipe: null };
    return none;
  }
  if (s.kind === 'pipe') {
    const a = visibleNode(info, s.from, eff),
      b = visibleNode(info, s.to, eff);
    if (!a || !b) return none;
    return { nodes: new Set([a, b]), selected: null, frame: null, pipe: pipeKey({ from: a, to: b, kind: s.flowKind }) };
  }
  return none;
}

function activate(e: KeyboardEvent, fn: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
}

/* ----------------------------------------------------------------- frames */

const FrameBack = memo(function FrameBack({ frame: f, selected, onClose }: { frame: FrameBox; selected: boolean; onClose: (id: Id) => void }) {
  return (
    <rect className={`frame depth-${Math.min(f.depth, 2)}${selected ? ' selected' : ''}`} x={f.x} y={f.y} width={f.w} height={f.h} rx={18} style={{ ['--frame' as string]: f.color }} onClick={() => onClose(f.id)}>
      <title>{`${f.label}: click the frame to close it`}</title>
    </rect>
  );
});

const tabWidth = (label: string) => Math.min(240, 40 + label.length * 6.6);

const FrameTab = memo(function FrameTab({ frame: f, selected, onClose }: { frame: FrameBox; selected: boolean; onClose: (id: Id) => void }) {
  const w = tabWidth(f.label);
  const close = () => onClose(f.id);
  return (
    <g className={`frame-tab${selected ? ' selected' : ''}`} transform={`translate(${Math.round(f.x + 14)},${Math.round(f.y)})`} role="button" tabIndex={0} aria-label={`Close ${f.label}`} aria-expanded={true} onClick={close} onKeyDown={(e) => activate(e, close)} style={{ ['--frame' as string]: f.color }}>
      <title>{`Close ${f.label}`}</title>
      <rect x={0} y={-10} width={w} height={20} rx={10} />
      <circle className="frame-dot" cx={11} cy={0} r={3.5} />
      <text x={20} y={4}>
        {f.label}
      </text>
      <path className="frame-chev" d={`M${w - 17},3 l4,-4 l4,4`} />
    </g>
  );
});

/* ------------------------------------------------------------------ pipes */

/** A pipe's title and accessible name: its ends and flows, then the amount. On a dated model:
 *  "ISK 2,740 bn a year · +0.5% since Sep 2026 · −0.4% vs no change". */
function pipeTitle(info: ModelInfo, d: Display, pipe: ClientPipe, t: number, moved: boolean): string {
  const flows = [...new Set(pipe.legs.map((l) => l.flow))].map((f) => info.flowById.get(f)?.label ?? f);
  const ends = pipe.from === pipe.to ? `Within ${nodeLabel(info, pipe.from)}` : `${nodeLabel(info, pipe.from)} to ${nodeLabel(info, pipe.to)}`;
  const head = `${ends}, ${labels.flowKindPhrase[pipe.kind]}: ${flows.join(', ')}.`;
  if (!isDated(d)) return `${head} ${fmtNum(pipe.value)} now, ${fmtNum(pipe.baseline)} ${d.moving ? 'without your changes at this month (% of opening GDP a year)' : 'at baseline (% of GDP a year)'}.`;
  const m = flowMeasure(d, pipe.kind);
  const notes = changeNotes(d, t, moved, m, m.level(pipe.value), m.level(pipe.today), m.level(pipe.baseline));
  return `${head} ${[m.text(pipe.value), ...notes.map((n) => n.text)].join(' · ')}`;
}

interface PipeViewProps {
  geom: PipeGeom;
  pipe: ClientPipe;
  /** Its title and accessible name (pipeTitle). */
  label: string;
  width: number;
  selected: boolean;
  related: boolean;
  entering: boolean;
  onSelect: OnSelect;
}

const PipeView = memo(
  function PipeView({ geom, pipe, label, width, selected, related, entering, onSelect }: PipeViewProps) {
    const st = pipeStyle(pipe.kind, pipe.value, pipe.baseline, width);
    const particles = useRef<SVGPathElement>(null);
    const rate = Math.round(st.rate * 100) / 100;
    useEffect(() => {
      const el = particles.current;
      if (!el || typeof el.getAnimations !== 'function') return;
      for (const a of el.getAnimations()) {
        if (typeof a.updatePlaybackRate === 'function') a.updatePlaybackRate(rate);
        else a.playbackRate = rate;
      }
    }, [rate, st.reverse, st.particles]);
    const open = () => onSelect({ kind: 'pipe', from: pipe.from, to: pipe.to, flowKind: pipe.kind });
    return (
      <g className={`pipe kind-${pipe.kind} tone-${st.tone}${selected ? ' selected' : ''}${related ? ' related' : ''}${entering ? ' enter' : ''}`} role="button" tabIndex={0} aria-label={label} onClick={open} onKeyDown={(e) => activate(e, open)}>
        <title>{label}</title>
        <path className="pipe-hit" d={geom.d} style={{ strokeWidth: Math.max(14, width + 8) }} />
        {st.tone !== 'flat' && <path className="pipe-glow" d={geom.d} style={{ strokeWidth: width + 7 + 6 * st.glow, opacity: 0.18 + 0.5 * st.glow }} />}
        <path className={`pipe-body${st.dashed ? ' dashed' : ''}`} d={geom.d} style={{ strokeWidth: width }} markerEnd={geom.selfLoop ? undefined : 'url(#arrow)'} />
        {st.particles && <path ref={particles} className={`pipe-particles${st.reverse ? ' rev' : ''}`} d={geom.d} style={{ strokeWidth: Math.max(2.2, Math.min(7, width * 0.62)) }} />}
      </g>
    );
  },
  (a, b) =>
    a.geom === b.geom &&
    a.width === b.width &&
    a.selected === b.selected &&
    a.related === b.related &&
    a.entering === b.entering &&
    a.label === b.label &&
    a.pipe.value === b.pipe.value &&
    a.pipe.baseline === b.pipe.baseline &&
    a.onSelect === b.onSelect,
);

/** The label on one of the most changed pipes: its flow and its change from the comparison; on a
 *  dated model in % of the no-change amount, or in ISK where a % means nothing (a revaluation, an
 *  amount that crosses zero or is small). */
function pipeLabelText(info: ModelInfo, pipe: ClientPipe, d: Display): { name: string; change: string; text: string } {
  const flows = [...new Set(pipe.legs.map((l) => l.flow))];
  const name = flows.length === 1 ? (info.flowById.get(flows[0])?.label ?? flows[0]) : `${flows.length} flows`;
  const m = isDated(d) ? flowMeasure(d, pipe.kind) : null;
  const change = (m ? fmtChangeOf(effect(m, m.level(pipe.value), m.level(pipe.baseline)), m, 'card') : null) ?? fmtSigned(pipe.value - pipe.baseline);
  return { name, change, text: `${name} ${change}` };
}

const labelWidth = (text: string) => Math.min(240, 14 + text.length * 6.1);

const PipeLabel = memo(function PipeLabel({ at, name, change, tone }: { at: Pt; name: string; change: string; tone: Tone }) {
  const w = labelWidth(`${name} ${change}`);
  return (
    <g className={`plabel tone-${tone}`} transform={`translate(${Math.round(at.x)},${Math.round(at.y)})`}>
      <rect x={-w / 2} y={-10} width={w} height={20} rx={10} />
      <text textAnchor="middle" y={4}>
        <tspan className="plabel-name">{name}</tspan>
        <tspan className="plabel-val" dx={5}>
          {change}
        </tspan>
      </text>
    </g>
  );
});

/* ------------------------------------------------------------------ nodes */

interface MetricText {
  key: string;
  label: string;
  text: string;
  tone: Tone;
  /** On a dated model, once a lever has moved: the small effect beside the number ("−1.7%"). */
  change?: string;
  /** What the card's accessible name says, when it says more than the card ("+0.4% vs no change"). */
  said?: string;
}

/** A card number on a dated model: its level in today's units, with a small effect against the
 *  no-change path once a lever has moved, and nothing else. The card shows an amount as "2,550 bn";
 *  its accessible name says it in full ("ISK 2,550 bn a year"). Values passed to `show` are levels. */
function datedMetric(m: ResolvedMetric, info: ModelInfo, client: EngineClient, d: Display, node: NodeBox, legs: Float64Array, moved: boolean): MetricText | null {
  const show = (text: string, full: string, scale: ChangeScale, now: number, noChange: number): MetricText => {
    const e = moved ? effect(scale, now, noChange) : null;
    const change = fmtCardChange(e, scale);
    const said = fmtChangeOf(e, scale, 'text');
    return { key: m.key, label: m.label, text, change: change ?? undefined, tone: change && e ? (e.value > 0 ? 'up' : 'down') : 'flat', said: said ? `${full}, ${said} vs no change` : full };
  };
  const stockM = measureOf(d, '% of GDP'), flowM = measureOf(d, '% of GDP/yr');
  switch (m.kind) {
    case 'indicator': {
      const ind = info.indicatorById.get(m.id)!;
      if (!ind.level) return null;
      const s = client.reportSeries(m.id, 'nominal'), r = client.referenceReportSeries?.(m.id, 'nominal') ?? [];
      const v = s[s.length - 1] ?? 0;
      return show(fmtReport(v, ind, 'nominal', 'card'), fmtReport(v, ind, 'nominal'), { kind: ind.level.kind === 'rate' || ind.level.kind === 'ratio' ? 'rate' : 'amount' }, v, r[s.length - 1] ?? v);
    }
    case 'variable': {
      const vd = info.varById.get(m.id)!;
      const ms = measureOf(d, vd.unit, vd.scale);
      const v = client.value(m.id);
      return show(ms.money && d.money ? money(d.money, v, false).card : ms.short(v), ms.text(v), ms, ms.level(v), ms.level(client.baseline(m.id)));
    }
    case 'netWorth': {
      const bs = client.balanceSheet(node.id);
      const mu = d.money;
      return show(mu ? money(mu, bs.netWorth, false).card : fmtNum(bs.netWorth), mu ? money(mu, bs.netWorth, false).text : fmtNum(bs.netWorth), stockM, stockM.level(bs.netWorth), stockM.level(bs.netWorthBaseline));
    }
    case 'cashIn': {
      const set = new Set(node.members);
      let v = 0, b = 0;
      for (const l of info.legs)
        if (l.kind === 'cash' && set.has(l.to) && !set.has(l.from)) {
          v += legs[l.index];
          b += client.getFrame().legBaselines?.[l.index] ?? l.baseline;
        }
      const mu = d.money;
      return show(mu ? money(mu, v, true).card : fmtNum(v), mu ? money(mu, v, true).text : fmtNum(v), flowM, flowM.level(v), flowM.level(b));
    }
  }
}

function evalMetric(m: ResolvedMetric, info: ModelInfo, client: EngineClient, node: NodeBox, legs: Float64Array, d: Display, moved: boolean): MetricText {
  try {
    const dated = isDated(d) ? datedMetric(m, info, client, d, node, legs, moved) : null;
    if (dated) return dated;
    switch (m.kind) {
      case 'indicator': {
        const ind = info.indicatorById.get(m.id)!;
        const s = client.series(m.id);
        const v = s.length ? s[s.length - 1] : 0;
        return { key: m.key, label: m.label, text: fmtIndicator(v, ind.unit, ind.display), tone: ind.display === 'level' ? signTone(v - (s[0] ?? 0)) : signTone(v) };
      }
      case 'variable': {
        const vd = info.varById.get(m.id)!;
        const v = client.value(m.id),
          b = client.baseline(m.id);
        const d = v - b;
        const tone = deviation(v, b).tone;
        return { key: m.key, label: m.label, text: tone === 'flat' ? fmtCompact(v, vd.unit) : `${fmtCompact(v, vd.unit)} ${fmtCompactChange(d, vd.unit, b)}`, tone };
      }
      case 'netWorth': {
        const bs = client.balanceSheet(node.id);
        const v = bs.netWorth,
          b = bs.netWorthBaseline;
        const tone = deviation(v, b).tone;
        return { key: m.key, label: m.label, text: tone === 'flat' ? fmtNum(v) : `${fmtNum(v)} ${fmtSigned(v - b)}`, tone };
      }
      case 'cashIn': {
        const set = new Set(node.members);
        let v = 0,
          b = 0;
        for (const l of info.legs)
          if (l.kind === 'cash' && set.has(l.to) && !set.has(l.from)) {
            v += legs[l.index];
            b += client.getFrame().legBaselines?.[l.index] ?? l.baseline;
          }
        const tone = deviation(v, b).tone;
        return { key: m.key, label: m.label, text: tone === 'flat' ? fmtNum(v) : `${fmtNum(v)} ${fmtSigned(v - b)}`, tone };
      }
    }
  } catch {
    return { key: m.key, label: m.label, text: '–', tone: 'flat' };
  }
}

interface NodeLiveProps {
  info: ModelInfo;
  client: EngineClient;
  node: NodeBox;
  px: number;
  py: number;
  lines: 1 | 2;
  legs: Float64Array;
  display: Display;
  t: number;
  moved: boolean;
  regimes: Readonly<Record<Id, string | null>>;
  rulesActing: string;
  seq: number;
  selected: boolean;
  dim: boolean;
  entering: boolean;
  onSelect: OnSelect;
  onOpenGroup: (id: Id) => void;
}

/** Computes the card's live numbers each tick, then hands strings to the memoised card. */
function NodeCardLive({ info, client, node, px, py, lines, legs, display, moved, regimes, rulesActing, selected, dim, entering, onSelect, onOpenGroup }: NodeLiveProps) {
  const metrics = useMemo(() => resolveCardMetrics(info, node.id, undefined, lines), [info, node.id, lines]);
  const owned = useMemo(() => {
    const members = new Set(node.members);
    return [...info.regimeOwners].filter(([, owners]) => owners.some((o) => members.has(o))).map(([rule]) => rule);
  }, [info, node.members]);
  const group = node.kind === 'group';
  const count = useMemo(() => (group ? memberCount(info, node.id, GROUP_NOUNS[cardFamily(info)]) : ''), [info, node.id, group]);
  const dots = useMemo(() => (group ? directMembers(info, node.id).map((m) => nodeColor(info, m.id)).join(' ') : ''), [info, node.id, group]);
  const values = metrics.map((m) => evalMetric(m, info, client, node, legs, display, moved));
  const binding = owned.map((r) => regimes[r]).filter((x): x is string => !!x);
  const health = financialHealth(client, node.members);
  const acting = rulesActing ? rulesActing.split(' ') : [];
  const byRule = (m: ResolvedMetric | undefined) => !!m && 'stabiliser' in m && !!m.stabiliser && acting.includes(m.stabiliser);
  return (
    <NodeCard
      node={node}
      px={px}
      py={py}
      count={count}
      dots={dots}
      m1={values[0]?.label ?? ''}
      v1={values[0]?.text ?? ''}
      c1={values[0]?.change ?? ''}
      s1={values[0]?.said}
      t1={values[0]?.tone ?? 'flat'}
      m2={values[1]?.label ?? ''}
      v2={values[1]?.text ?? ''}
      c2={values[1]?.change ?? ''}
      s2={values[1]?.said}
      t2={values[1]?.tone ?? 'flat'}
      r1={byRule(metrics[0])}
      r2={byRule(metrics[1])}
      regime={health?.label ?? binding[0] ?? null}
      regimeCount={binding.length}
      severity={health?.severity}
      selected={selected}
      dim={dim}
      entering={entering}
      onSelect={onSelect}
      onOpenGroup={onOpenGroup}
    />
  );
}

interface NodeCardProps {
  node: NodeBox;
  px: number;
  py: number;
  /** For a closed group: "3 age groups", and its members' colours (space-separated). */
  count: string;
  dots: string;
  m1: string;
  v1: string;
  t1: Tone;
  m2: string;
  v2: string;
  t2: Tone;
  /** The small effect beside each number, once a lever has moved on a dated model ("−1.7%"). */
  c1: string;
  c2: string;
  /** The numbers as the accessible name says them, when that differs from v1 and v2. */
  s1?: string;
  s2?: string;
  /** The number is set by a stabiliser that is acting (unlocked): mark it "auto", as its lever is. */
  r1: boolean;
  r2: boolean;
  regime: string | null;
  regimeCount: number;
  severity?: 'warning' | 'critical';
  selected: boolean;
  dim: boolean;
  entering: boolean;
  onSelect: OnSelect;
  onOpenGroup: (id: Id) => void;
}

const NodeCard = memo(function NodeCard({ node: n, px, py, count, dots, m1, v1, t1, m2, v2, t2, c1, c2, s1 = v1, s2 = v2, r1, r2, regime, regimeCount, severity, selected, dim, entering, onSelect, onOpenGroup }: NodeCardProps) {
  const group = n.kind === 'group';
  const x = px - n.w / 2,
    y = py - n.h / 2;
  const open = () => (group ? onOpenGroup(n.id) : onSelect({ kind: 'player', id: n.id }));
  const label = group
    ? `${n.label}, a group of ${count}. ${m1} ${s1}${r1 ? ', auto: set by its rule' : ''}. ${m2 ? `${m2} ${s2}${r2 ? ', auto: set by its rule' : ''}.` : ''}${regime ? ` ${regime}.` : ''} Open it to see its members.`
    : `${n.label}. ${m1} ${s1}${r1 ? ', auto: set by its rule' : ''}. ${m2 ? `${m2} ${s2}${r2 ? ', auto: set by its rule' : ''}.` : ''}${regime ? ` ${regime}.` : ''} Open its balance sheet.`;
  const maxChars = Math.floor((n.w - (group ? 40 : 22)) / 7.2);
  // The full name when it fits, else the player's short name; never a cut-off label if avoidable.
  const name = n.label.length <= maxChars ? n.label : n.short && n.short.length < n.label.length ? n.short : n.label;
  const title = name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;
  const compact = n.h - (group ? 16 : 0) < 56;
  const shift = group ? 16 : 0;
  // the label keeps its words; the number, then its effect, give way (fitCardRow)
  const row = (y0: number, m: string, v: string, c: string, t: Tone, rule: boolean) => {
    const f = fitCardRow(n.w, { label: m, value: v, change: c, rule });
    return (
      <text className="node-metric" x={14} y={y0}>
        <tspan className="node-mlabel">{f.label}</tspan>
        {rule && <tspan className="node-rule"> auto</tspan>}
        <tspan className={`node-mval tone-${t}`} x={n.w - 10} textAnchor="end">
          {f.value}
        </tspan>
        {f.change && (
          <tspan className={`node-mchg tone-${t}`} dx={3}>
            {f.change}
          </tspan>
        )}
      </text>
    );
  };
  const badgeW = regime ? Math.min(150, 14 + regime.length * 5.6) : 0;
  const colours = dots ? dots.split(' ').slice(0, 7) : [];
  const titleY = compact ? 18 : 20;
  return (
    <g
      className={`node${group ? ' group' : ''}${selected ? ' selected' : ''}${dim ? ' dim' : ''}${entering ? ' enter' : ''}${severity ? ` financial-${severity}` : ''}`}
      style={{ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)` }}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={group ? false : undefined}
      onClick={open}
      onKeyDown={(e) => activate(e, open)}
    >
      <title>{group ? `Open ${n.label}` : n.label}</title>
      {group && (
        <>
          <rect className="node-stack s2" x={10} y={8} width={n.w - 20} height={n.h} rx={12} />
          <rect className="node-stack s1" x={5} y={4} width={n.w - 10} height={n.h} rx={12} />
        </>
      )}
      <rect className="node-card" width={n.w} height={n.h} rx={12} />
      <rect className="node-accent" x={0} y={compact ? 8 : 10} width={3.5} height={n.h - (compact ? 16 : 20)} rx={1.75} style={{ fill: n.color }} />
      <text className="node-title" x={14} y={titleY}>
        {title}
      </text>
      {group && (
        <>
          <path className="node-chev" d={`M${n.w - 22},${titleY - 7} l5,5 l5,-5`} />
          <g className="node-meta">
            {colours.map((c, i) => (
              <circle key={i} cx={17 + i * 8.5} cy={titleY + 12} r={3} style={{ fill: c }} />
            ))}
            <text x={17 + colours.length * 8.5 + 3} y={titleY + 15.5}>
              {count}
            </text>
          </g>
        </>
      )}
      {m1 && row((compact ? 35 : 39) + shift, m1, v1, c1, t1, r1)}
      {m2 && !compact && row(55 + shift, m2, v2, c2, t2, r2)}
      {regime && (
        <g className="regime-badge" transform={`translate(${n.w - 8},-8)`}>
          <title>{regime}</title>
          <rect x={-badgeW} y={0} width={badgeW} height={17} rx={8.5} />
          <text x={-7} y={12} textAnchor="end">
            {regime.length > 24 ? regime.slice(0, 23) + '…' : regime}
            {regimeCount > 1 ? ` +${regimeCount - 1}` : ''}
          </text>
        </g>
      )}
    </g>
  );
});

/** A card that is leaving the map (its group closed): it slides into the group and fades. */
function GhostCard({ node: n, at, gone }: { node: NodeBox; at: Pt; gone: boolean }) {
  return (
    <g className="ghost" style={{ transform: `translate(${Math.round(at.x - n.w / 2)}px, ${Math.round(at.y - n.h / 2)}px)`, opacity: gone ? 0 : 1 }}>
      <rect className="node-card" width={n.w} height={n.h} rx={12} />
      <rect className="node-accent" x={0} y={10} width={3.5} height={n.h - 20} rx={1.75} style={{ fill: n.color }} />
      <text className="node-title" x={14} y={20}>
        {n.label.length <= 18 ? n.label : n.short && n.short.length <= 18 ? n.short : n.label.slice(0, 17) + '…'}
      </text>
    </g>
  );
}

/* ----------------------------------------------------------------- legend */

const Legend = memo(function Legend({ grouped, moving }: { grouped: boolean; moving?: boolean }) {
  return (
    <div className="legend" aria-label="How to read the map">
      <span className="lg">
        <svg width="34" height="10" aria-hidden="true">
          <line x1="2" y1="5" x2="32" y2="5" className="lg-body" />
          <line x1="2" y1="5" x2="32" y2="5" className="lg-dots" />
        </svg>
        money moving
      </span>
      <span className="lg">
        <svg width="34" height="10" aria-hidden="true">
          <line x1="2" y1="5" x2="32" y2="5" className="lg-up" />
        </svg>
        ↑ {moving ? 'Above no-change path' : 'More than baseline'}
      </span>
      <span className="lg">
        <svg width="34" height="10" aria-hidden="true">
          <line x1="2" y1="5" x2="32" y2="5" className="lg-down" />
        </svg>
        ↓ {moving ? 'Below no-change path' : 'Less than baseline'}
      </span>
      <span className="lg">
        <svg width="34" height="10" aria-hidden="true">
          <line x1="2" y1="5" x2="32" y2="5" className="lg-dashed" />
        </svg>
        value change, no money moves
      </span>
    </div>
  );
});
