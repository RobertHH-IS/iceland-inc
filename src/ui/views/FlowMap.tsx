/**
 * FlowMap: players (or groups) and the pipes between them, from engine.pipes(level).
 *
 * Every cash pipe carries moving particles (a CSS dash animation); thickness ∝ √size; particle
 * speed rises with value/baseline (the animation's playback rate); an amber glow means above
 * baseline, blue-grey below; dashed pipes without particles are accruals, revaluations and
 * write-offs. The seven most changed pipes are labelled. Click a pipe or a player to inspect it.
 */
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Id, Pipe } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';
import { fmtCompact, fmtCompactChange, fmtIndicator, fmtNum, fmtSigned } from '../model/format.ts';
import { MAP_H, MAP_W, fitMap, layoutNodes, levelHints, nodeRect, pipeGeometry, pipeKey, pipeWidth, placeLabels, widthScale, type Level, type NodeBox, type Pt, type PipeGeom } from '../model/geometry.ts';
import type { ModelInfo } from '../model/info.ts';
import { nodeLabel } from '../model/info.ts';
import type { Selection } from '../model/navigation.ts';
import { resolveCardMetrics, type ResolvedMetric } from '../model/player-cards.ts';
import { deviation, pipeStyle, signTone, topChanged, type Tone } from '../model/styling.ts';
import type { OnSelect } from './common.tsx';

interface FlowMapProps {
  info: ModelInfo;
  client: EngineClient;
  level: Level;
  pipes: Pipe[];
  legs: Float64Array;
  regimes: Readonly<Record<Id, string | null>>;
  seq: number;
  selection: Selection | null;
  onSelect: OnSelect;
}

const KIND_WORD: Record<string, string> = { cash: 'cash', accrual: 'accrual (no cash moves)', revaluation: 'revaluation (no cash moves)', writeoff: 'write-off (no cash moves)' };

export const FlowMap = memo(function FlowMap({ info, client, level, pipes, legs, regimes, seq, selection, onSelect }: FlowMapProps) {
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
  const hints = useMemo(() => levelHints(info.players, info.groups, level).map((h) => h.hint), [info, level]);
  const box = useMemo(() => fitMap(hints, size.cw, size.ch), [hints, size]);
  const nodes = useMemo(() => layoutNodes(info.players, info.groups, level, { width: box.w, height: box.h, cardW: box.card.w, cardH: box.card.h }), [info, level, box]);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const signature = pipes.map(pipeKey).join('|');
  // The set of pipes is fixed for a model and level, so geometry and the width scale are too:
  // they are recomputed only when that set changes, not on every tick.
  const geom = useMemo(() => pipeGeometry(pipes, nodeMap), [nodeMap, signature]);
  const scale = useMemo(() => widthScale(pipes), [info, level, signature]);
  const top = topChanged(pipes, 7);
  const labelText = top.map((p) => ({ p, ...pipeLabelText(info, p) }));
  const cards = useMemo(() => nodes.map(nodeRect), [nodes]);
  const labelPos = placeLabels(
    labelText.flatMap(({ p, text }) => {
      const g = geom.get(pipeKey(p));
      return g ? [{ key: pipeKey(p), x: g.mid.x, y: g.mid.y, w: labelWidth(text), h: 20 }] : [];
    }),
    cards,
    { w: box.w, h: box.h },
  );

  const focusNode = selection && (selection.kind === 'player' || selection.kind === 'group') ? mapToLevel(info, selection.id, level) : null;
  const pipeSel = selection && selection.kind === 'pipe' && selection.level === level ? selection : null;
  const focusPipe = pipeSel ? `${pipeSel.from}->${pipeSel.to}:${pipeSel.flowKind}` : null;
  const hasFocus = !!(focusNode || focusPipe);
  const lit = (id: Id) => !hasFocus || focusNode === id || (!!pipeSel && (pipeSel.from === id || pipeSel.to === id));

  return (
    <div className="flowmap">
      <div className="map-wrap" ref={wrap}>
      <svg className={`map ${hasFocus ? 'has-focus' : ''}${box.card.lines === 1 ? ' compact' : ''}`} viewBox={`0 0 ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={`Flow map of ${info.label}: ${nodes.length} ${level === 'player' ? 'players' : 'groups'} and ${pipes.length} pipes`}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9 z" className="arrowhead" />
          </marker>
        </defs>
        <g className="pipes">
          {pipes.map((p) => {
            const k = pipeKey(p);
            const g = geom.get(k);
            if (!g) return null;
            const related = focusPipe ? k === focusPipe : focusNode ? p.from === focusNode || p.to === focusNode : false;
            return <PipeView key={k} info={info} geom={g} pipe={p} width={pipeWidth(p.value, scale)} selected={k === focusPipe} related={related} level={level} onSelect={onSelect} />;
          })}
        </g>
        <g className="pipe-labels" aria-hidden="true">
          {labelText.map(({ p, name, change }) => {
            const k = pipeKey(p);
            const at = labelPos.get(k);
            return at ? <PipeLabel key={k} at={at} name={name} change={change} tone={deviation(p.value, p.baseline).tone} /> : null;
          })}
        </g>
        <g className="nodes">
          {nodes.map((n) => (
            <NodeCardLive key={n.id} info={info} client={client} node={n} lines={box.card.lines} level={level} legs={legs} regimes={regimes} seq={seq} selected={focusNode === n.id} dim={!lit(n.id)} onSelect={onSelect} />
          ))}
        </g>
      </svg>
      </div>
      <Legend />
    </div>
  );
});

/** A player selected at group level is shown as its group, and a group at player level as nothing. */
function mapToLevel(info: ModelInfo, id: Id, level: Level): Id | null {
  if (level === 'group') return info.groupById.has(id) ? id : (info.groupOf.get(id) ?? null);
  return info.playerById.has(id) ? id : null;
}

function activate(e: KeyboardEvent, fn: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
}

/* ------------------------------------------------------------------ pipes */

interface PipeViewProps {
  info: ModelInfo;
  geom: PipeGeom;
  pipe: Pipe;
  width: number;
  selected: boolean;
  related: boolean;
  level: Level;
  onSelect: OnSelect;
}

const PipeView = memo(
  function PipeView({ info, geom, pipe, width, selected, related, level, onSelect }: PipeViewProps) {
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
    const flows = [...new Set(pipe.legs.map((l) => l.flow))].map((f) => info.flowById.get(f)?.label ?? f);
    const label = `${nodeLabel(info, pipe.from)} to ${nodeLabel(info, pipe.to)}, ${KIND_WORD[pipe.kind]}: ${flows.join(', ')}. ${fmtNum(pipe.value)} now, ${fmtNum(pipe.baseline)} at baseline (% of GDP a year).`;
    const open = () => onSelect({ kind: 'pipe', from: pipe.from, to: pipe.to, flowKind: pipe.kind, level });
    return (
      <g className={`pipe kind-${pipe.kind} tone-${st.tone}${selected ? ' selected' : ''}${related ? ' related' : ''}`} role="button" tabIndex={0} aria-label={label} onClick={open} onKeyDown={(e) => activate(e, open)}>
        <title>{label}</title>
        <path className="pipe-hit" d={geom.d} style={{ strokeWidth: Math.max(14, width + 8) }} />
        {st.tone !== 'flat' && <path className="pipe-glow" d={geom.d} style={{ strokeWidth: width + 7 + 6 * st.glow, opacity: 0.18 + 0.5 * st.glow }} />}
        <path className={`pipe-body${st.dashed ? ' dashed' : ''}`} d={geom.d} style={{ strokeWidth: width }} markerEnd={geom.selfLoop ? undefined : 'url(#arrow)'} />
        {st.particles && <path ref={particles} className={`pipe-particles${st.reverse ? ' rev' : ''}`} d={geom.d} style={{ strokeWidth: Math.max(2.2, Math.min(7, width * 0.62)) }} />}
      </g>
    );
  },
  (a, b) => a.geom === b.geom && a.width === b.width && a.selected === b.selected && a.related === b.related && a.pipe.value === b.pipe.value && a.pipe.baseline === b.pipe.baseline && a.info === b.info && a.level === b.level && a.onSelect === b.onSelect,
);

function pipeLabelText(info: ModelInfo, pipe: Pipe): { name: string; change: string; text: string } {
  const flows = [...new Set(pipe.legs.map((l) => l.flow))];
  const name = flows.length === 1 ? (info.flowById.get(flows[0])?.label ?? flows[0]) : `${flows.length} flows`;
  const change = fmtSigned(pipe.value - pipe.baseline);
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
}

function evalMetric(m: ResolvedMetric, info: ModelInfo, client: EngineClient, members: Id[], legs: Float64Array): MetricText {
  try {
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
        let v = 0,
          b = 0;
        for (const p of members) {
          const bs = client.balanceSheet(p);
          v += bs.netWorth;
          b += bs.netWorthBaseline;
        }
        const tone = deviation(v, b).tone;
        return { key: m.key, label: m.label, text: tone === 'flat' ? fmtNum(v) : `${fmtNum(v)} ${fmtSigned(v - b)}`, tone };
      }
      case 'cashIn': {
        const set = new Set(members);
        let v = 0,
          b = 0;
        for (const l of info.legs)
          if (l.kind === 'cash' && set.has(l.to) && !set.has(l.from)) {
            v += legs[l.index];
            b += l.baseline;
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
  lines: 1 | 2;
  level: Level;
  legs: Float64Array;
  regimes: Readonly<Record<Id, string | null>>;
  seq: number;
  selected: boolean;
  dim: boolean;
  onSelect: OnSelect;
}

/** Computes the card's live numbers each tick, then hands strings to the memoised card. */
function NodeCardLive({ info, client, node, lines, level, legs, regimes, selected, dim, onSelect }: NodeLiveProps) {
  const metrics = useMemo(() => resolveCardMetrics(info, node.id, undefined, lines), [info, node.id, lines]);
  const owned = useMemo(() => {
    const members = new Set(node.members);
    return [...info.regimeOwners].filter(([, owners]) => owners.some((o) => members.has(o))).map(([rule]) => rule);
  }, [info, node.members]);
  const values = metrics.map((m) => evalMetric(m, info, client, node.members, legs));
  const binding = owned.map((r) => regimes[r]).filter((x): x is string => !!x);
  return (
    <NodeCard
      node={node}
      kind={level === 'player' ? 'player' : 'group'}
      m1={values[0]?.label ?? ''}
      v1={values[0]?.text ?? ''}
      t1={values[0]?.tone ?? 'flat'}
      m2={values[1]?.label ?? ''}
      v2={values[1]?.text ?? ''}
      t2={values[1]?.tone ?? 'flat'}
      regime={binding[0] ?? null}
      regimeCount={binding.length}
      selected={selected}
      dim={dim}
      onSelect={onSelect}
    />
  );
}

interface NodeCardProps {
  node: NodeBox;
  kind: 'player' | 'group';
  m1: string;
  v1: string;
  t1: Tone;
  m2: string;
  v2: string;
  t2: Tone;
  regime: string | null;
  regimeCount: number;
  selected: boolean;
  dim: boolean;
  onSelect: OnSelect;
}

const NodeCard = memo(function NodeCard({ node: n, kind, m1, v1, t1, m2, v2, t2, regime, regimeCount, selected, dim, onSelect }: NodeCardProps) {
  const x = n.x - n.w / 2,
    y = n.y - n.h / 2;
  const open = () => onSelect({ kind, id: n.id });
  const label = `${n.label}${n.members.length > 1 ? ` (${n.members.length} players)` : ''}. ${m1} ${v1}. ${m2 ? `${m2} ${v2}.` : ''}${regime ? ` ${regime}.` : ''} Open its balance sheet.`;
  const maxChars = Math.floor((n.w - 22) / 7.2);
  const title = n.label.length > maxChars ? n.label.slice(0, maxChars - 1) + '…' : n.label;
  const compact = n.h < 56;
  const row = (y0: number, m: string, v: string, t: Tone) => (
    <text className="node-metric" x={14} y={y0}>
      <tspan className="node-mlabel">{m.length > 14 ? m.slice(0, 13) + '…' : m}</tspan>
      <tspan className={`node-mval tone-${t}`} x={n.w - 10} textAnchor="end">
        {v}
      </tspan>
    </text>
  );
  const badgeW = regime ? Math.min(150, 14 + regime.length * 5.6) : 0;
  return (
    <g className={`node${selected ? ' selected' : ''}${dim ? ' dim' : ''}`} transform={`translate(${Math.round(x)},${Math.round(y)})`} role="button" tabIndex={0} aria-label={label} onClick={open} onKeyDown={(e) => activate(e, open)}>
      <title>{n.label}</title>
      <rect className="node-card" width={n.w} height={n.h} rx={12} />
      <rect className="node-accent" x={0} y={compact ? 8 : 10} width={3.5} height={n.h - (compact ? 16 : 20)} rx={1.75} style={{ fill: n.color }} />
      <text className="node-title" x={14} y={compact ? 18 : 20}>
        {title}
      </text>
      {m1 && row(compact ? 35 : 39, m1, v1, t1)}
      {m2 && !compact && row(55, m2, v2, t2)}
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

/* ----------------------------------------------------------------- legend */

const Legend = memo(function Legend() {
  return (
    <div className="legend" aria-label="How to read the map">
      <span className="lg">
        <svg width="34" height="10" aria-hidden="true">
          <line x1="2" y1="5" x2="32" y2="5" className="lg-body" />
          <line x1="2" y1="5" x2="32" y2="5" className="lg-dots" />
        </svg>
        cash moving
      </span>
      <span className="lg">
        <svg width="34" height="12" aria-hidden="true">
          <line x1="2" y1="3" x2="32" y2="3" className="lg-body" strokeWidth="1.5" />
          <line x1="2" y1="9" x2="32" y2="9" className="lg-body" strokeWidth="5" />
        </svg>
        thickness ∝ √size
      </span>
      <span className="lg">
        <svg width="34" height="10" aria-hidden="true">
          <line x1="2" y1="5" x2="32" y2="5" className="lg-up" />
        </svg>
        above baseline
      </span>
      <span className="lg">
        <svg width="34" height="10" aria-hidden="true">
          <line x1="2" y1="5" x2="32" y2="5" className="lg-down" />
        </svg>
        below baseline
      </span>
      <span className="lg">
        <svg width="34" height="10" aria-hidden="true">
          <line x1="2" y1="5" x2="32" y2="5" className="lg-dashed" />
        </svg>
        accrual, revaluation, write-off: no cash moves
      </span>
      <span className="lg muted">Click any pipe or player to see what drives it.</span>
    </div>
  );
});
