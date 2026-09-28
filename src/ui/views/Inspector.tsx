/**
 * Inspector: what is driving the selected thing right now, from engine.influences().
 *
 *   Pipe      its legs; for each leg, the amount's influence (rule, category, regime,
 *             desired vs actual, terms now vs baseline, parameters with provenance, concepts)
 *   Variable  its influence; clicking a term's input walks upstream to that variable
 *   Player    live balance sheet, net worth, biggest pipes, regimes
 *   Indicator description, drivers, a big chart and the drivers' influences
 *   Concept   the concept card
 *
 * Breadcrumbs keep the path of clicks, with back and forward.
 */
import { memo, useEffect, useRef, type ReactNode } from 'react';
import type { Id, Influence, Pipe } from '../../core/types.ts';
import { describePosting } from '../../core/format.ts';
import type { EngineClient, Frame } from '../engine-client.ts';
import { chartRef, chartWindow } from '../model/charts.ts';
import { fmtChange, fmtCompact, fmtCompactChange, fmtIndicator, fmtNum, fmtSigned, fmtValue, shortUnit, unitCaption } from '../model/format.ts';
import type { Level } from '../model/geometry.ts';
import { nodeColor, nodeLabel, nodeMembers, varLabel, type ModelInfo } from '../model/info.ts';
import { canBack, canForward, navCurrent, selectionKey, selectionLabel, type NavState } from '../model/navigation.ts';
import { changeBar, deviation, signTone } from '../model/styling.ts';
import { ChartSvg } from './ChartSvg.tsx';
import { CategoryChip, ChangeBar, ConceptChip, ConceptChips, Delta, Disclosure, Icon, Markdown, NavLink, ProvenanceNote, type OnSelect } from './common.tsx';

interface InspectorProps {
  info: ModelInfo;
  client: EngineClient;
  frame: Frame;
  nav: NavState;
  onSelect: OnSelect;
  onBack: () => void;
  onForward: () => void;
  onGo: (index: number) => void;
  onClose: () => void;
}

export function Inspector({ info, client, frame, nav, onSelect, onBack, onForward, onGo, onClose }: InspectorProps) {
  const sel = navCurrent(nav);
  const first = Math.max(0, nav.stack.length - 6);
  const body = useRef<HTMLDivElement>(null);
  const key = sel ? selectionKey(sel) : '';
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
    // On a phone the inspector sits below the map: bring it into view when something is opened.
    if (key && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches) body.current?.closest('.inspector')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [key, nav.index]);
  return (
    <section className="inspector panel" aria-labelledby="inspector-title">
      <div className="panel-head">
        <h2 id="inspector-title">Inspector</h2>
        <div className="crumb-nav">
          <button type="button" className="icon-btn tiny" onClick={onBack} disabled={!canBack(nav)} aria-label="Back to the previous selection">
            <Icon name="back" size={14} />
          </button>
          <button type="button" className="icon-btn tiny" onClick={onForward} disabled={!canForward(nav)} aria-label="Forward">
            <Icon name="forward" size={14} />
          </button>
          {sel && (
            <button type="button" className="icon-btn tiny" onClick={onClose} aria-label="Close the inspector">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>
      {nav.stack.length > 0 && (
        <nav className="crumbs" aria-label="What you clicked">
          <ol>
            {first > 0 && <li className="muted">…</li>}
            {nav.stack.slice(first).map((s, j) => {
              const i = first + j;
              const current = i === nav.index;
              return (
                <li key={i}>
                  <button type="button" className={`crumb ${current ? 'current' : ''}`} aria-current={current ? 'page' : undefined} onClick={() => onGo(i)}>
                    <span className="crumb-kind">{s.kind === 'var' ? 'variable' : s.kind}</span> {selectionLabel(s, info)}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="panel-body scroll" ref={body}>
        {!sel && <Intro info={info} />}
        {sel?.kind === 'pipe' && <PipeDetail info={info} client={client} frame={frame} from={sel.from} to={sel.to} kind={sel.flowKind} level={sel.level} onSelect={onSelect} />}
        {(sel?.kind === 'player' || sel?.kind === 'group') && <NodeDetail info={info} client={client} frame={frame} id={sel.id} kind={sel.kind} onSelect={onSelect} />}
        {sel?.kind === 'var' && <VarDetail info={info} client={client} frame={frame} id={sel.id} onSelect={onSelect} />}
        {sel?.kind === 'flow' && <FlowDetail info={info} client={client} id={sel.id} onSelect={onSelect} />}
        {sel?.kind === 'indicator' && <IndicatorDetail info={info} client={client} frame={frame} id={sel.id} onSelect={onSelect} />}
        {sel?.kind === 'concept' && <ConceptDetail info={info} id={sel.id} onSelect={onSelect} />}
      </div>
    </section>
  );
}

function Intro({ info }: { info: ModelInfo }) {
  return (
    <div className="intro">
      <p className="lede">{info.description}</p>
      <p>
        Click any <strong>pipe</strong> or <strong>player</strong> on the map, a <strong>chart</strong> or an <strong>idea</strong>. The inspector shows what is driving it right now: the rule behind it, its terms now against the baseline, the parameters and where they come from, and the economic ideas at play.
      </p>
      <p className="muted small">
        {info.players.length} players · {info.flows.length} flows · {info.legs.length} legs · {info.rules.length} rules · {info.levers.length} levers · {info.indicators.length} charts
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- influence */

function unitOf(info: ModelInfo, inf: Influence, id: Id): string {
  if (id.startsWith('flow:') || (!id.startsWith('var:') && !id.startsWith('indicator:') && info.flowById.has(id) && !info.varById.has(id))) return '% of GDP/yr';
  if (id.startsWith('indicator:')) return '';
  return info.varById.get(inf.id)?.unit ?? '';
}

/** One variable's (or flow's) influence: exact within its rule. */
export function InfluenceView({ info, client, id, onSelect, compact = false }: { info: ModelInfo; client: EngineClient; id: Id; onSelect: OnSelect; compact?: boolean }) {
  let inf: Influence;
  try {
    inf = client.influences(id);
  } catch (err) {
    return <p className="error">{err instanceof Error ? err.message : String(err)}</p>;
  }
  const unit = unitOf(info, inf, id);
  const dev = deviation(inf.value, inf.baseline);
  const maxAbs = Math.max(1e-12, ...inf.terms.map((t) => Math.abs(t.change)));
  const sumChange = inf.terms.reduce((s, t) => s + t.change, 0);
  const isFlow = id.startsWith('flow:');
  const r = info.ruleByTarget.get(inf.id);
  return (
    <div className="influence">
      <div className="inf-head">
        <CategoryChip category={inf.category} />
        {r?.label && <span className="inf-rulename">{r.label}</span>}
        {inf.regime && (
          <span className="chip regime" title="The branch of the rule that is active now">
            {inf.regime}
          </span>
        )}
        <span className="inf-now mono">{fmtValue(inf.value, unit)}</span>
        <Delta text={dev.tone === 'flat' ? 'at baseline' : fmtChange(inf.value - inf.baseline, unit, inf.baseline)} tone={dev.tone} />
      </div>
      {inf.rule && !compact && <p className="inf-what">{inf.rule.what}</p>}
      {inf.rule && <p className="inf-rule">{inf.rule.rule}</p>}
      {inf.desired !== undefined && inf.desiredBaseline !== undefined && <DesiredRow value={inf.value} baseline={inf.baseline} desired={inf.desired} desiredBaseline={inf.desiredBaseline} unit={unit} />}
      {inf.terms.length > 0 && (
        <div className="terms">
          <div className="terms-head">
            <span>{isFlow ? 'Legs' : 'Terms'}</span>
            <span className="muted small">now · baseline · change{unit ? ` (${unitCaption(unit)})` : ''}</span>
          </div>
          <ul>
            {inf.terms.map((t) => (
              <li key={t.id} className="term">
                <div className="term-top">
                  <span className="term-label">{t.label}</span>
                  {t.concept && <ConceptChip info={info} id={t.concept} onSelect={onSelect} />}
                </div>
                <div className="term-nums">
                  <span className="mono">{fmtCompact(t.value, unit)}</span>
                  <span className="mono muted">{fmtCompact(t.baseline, unit)}</span>
                  <ChangeBar rel={changeBar(t.change, maxAbs)} />
                  <Delta text={fmtCompactChange(t.change, unit)} tone={signTone(t.change, 1e-9)} />
                </div>
                {t.inputs.length > 0 && (
                  <div className="term-inputs">
                    <span className="muted small">{isFlow ? 'set by' : 'reads'}</span>
                    {t.inputs.map((v) => (
                      <NavLink key={v} selection={{ kind: 'var', id: v }} onSelect={onSelect} title={`What drives ${varLabel(info, v)}?`}>
                        {varLabel(info, v)}
                      </NavLink>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {inf.nonAdditive ? (
            <p className="note">
              <strong>Non-additive.</strong> These terms are combined by a cap, floor or product, not a sum, so their changes do not add up to the change in the value. The regime says which branch is active.
            </p>
          ) : (
            <p className="note sum">
              Changes sum to <span className="mono">{fmtCompactChange(sumChange, unit)}</span>, exactly the change in {inf.desired !== undefined ? 'the desired value' : 'the value'}.
            </p>
          )}
        </div>
      )}
      {inf.params.length > 0 && (
        <div className="params">
          <div className="terms-head">
            <span>Parameters</span>
          </div>
          <ul>
            {inf.params.map((p) => {
              const def = info.paramById.get(p.id);
              return (
                <li key={p.id} className="param">
                  <div className="param-top">
                    <span className="param-desc" title={p.id}>
                      {def?.description ?? p.id}
                    </span>
                    <span className="mono param-val">{fmtValue(p.value, p.unit)}</span>
                  </div>
                  <ProvenanceNote p={p.provenance} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {inf.upstream.length > 0 && !isFlow && (
        <div className="reads">
          <span className="muted small">Reads</span>
          {inf.upstream.map((v) => (
            <NavLink key={v} selection={{ kind: 'var', id: v }} onSelect={onSelect}>
              {varLabel(info, v)}
            </NavLink>
          ))}
        </div>
      )}
      <ConceptChips info={info} ids={inf.concepts} onSelect={onSelect} />
    </div>
  );
}

function DesiredRow({ value, baseline, desired, desiredBaseline, unit }: { value: number; baseline: number; desired: number; desiredBaseline: number; unit: string }) {
  const gap = desired - value;
  const moved = desired - desiredBaseline;
  const progress = Math.abs(moved) > 1e-12 ? Math.max(0, Math.min(1, (value - baseline) / moved)) : 1;
  return (
    <div className="desired">
      <div className="desired-top">
        <span>Adjusts gradually toward</span>
        <span className="mono">{fmtValue(desired, unit)}</span>
      </div>
      <div className="desired-bar" role="img" aria-label={`Actual ${fmtValue(value, unit)}, desired ${fmtValue(desired, unit)}`}>
        <span className="desired-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="muted small">
        actual {fmtValue(value, unit)} · gap {fmtChange(gap, unit)} · desired at baseline {fmtValue(desiredBaseline, unit)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pipe */

function PipeDetail({ info, client, frame, from, to, kind, level, onSelect }: { info: ModelInfo; client: EngineClient; frame: Frame; from: Id; to: Id; kind: string; level: Level; onSelect: OnSelect }) {
  const pipe = frame.pipes[level].find((p) => p.from === from && p.to === to && p.kind === kind);
  if (!pipe) return <p className="muted">This pipe is not part of the map at this level.</p>;
  const dev = deviation(pipe.value, pipe.baseline);
  const byFlow = new Map<Id, Pipe['legs']>();
  for (const l of pipe.legs) byFlow.set(l.flow, [...(byFlow.get(l.flow) ?? []), l]);
  const nodeKind = level === 'player' ? 'player' : 'group';
  let shown = 0;
  return (
    <div className="detail">
      <h3 className="detail-title">
        <NavLink selection={{ kind: nodeKind, id: from }} onSelect={onSelect}>
          <Swatch color={nodeColor(info, from)} /> {nodeLabel(info, from)}
        </NavLink>
        <span className="arrow">→</span>
        <NavLink selection={{ kind: nodeKind, id: to }} onSelect={onSelect}>
          <Swatch color={nodeColor(info, to)} /> {nodeLabel(info, to)}
        </NavLink>
      </h3>
      <div className="bignum">
        <span className="mono big">{fmtNum(pipe.value)}</span>
        <span className="muted small">% of GDP a year · baseline {fmtNum(pipe.baseline)}</span>
        <Delta text={dev.tone === 'flat' ? 'at baseline' : fmtSigned(pipe.value - pipe.baseline)} tone={dev.tone} />
        <span className={`chip kind kind-${pipe.kind}`}>{pipe.kind === 'cash' ? 'CASH' : pipe.kind.toUpperCase()}</span>
      </div>
      {[...byFlow].map(([flowId, legs]) => {
        const flow = info.flowById.get(flowId);
        return (
          <div key={flowId} className="flow-block">
            <h4>
              <NavLink selection={{ kind: 'flow', id: flowId }} onSelect={onSelect}>
                {flow?.label ?? flowId}
              </NavLink>
              <span className="muted small"> · {flow?.account} account</span>
            </h4>
            {flow && <p className="inf-what">{flow.explain.what}</p>}
            {flow && <p className="muted small">{describePosting(flow.posting)}</p>}
            {flow && <ConceptChips info={info} ids={flow.concepts ?? []} onSelect={onSelect} />}
            {legs.map((leg, j) => {
              const idx = info.legsByKey.get(`${leg.flow}\u0000${leg.from}\u0000${leg.to}`) ?? [];
              const amount = info.legs[idx[Math.min(j, idx.length - 1)] ?? -1]?.amount;
              const ldev = deviation(leg.value, leg.baseline);
              const open = shown++ < 2;
              return (
                <Disclosure
                  key={`${leg.from}-${leg.to}-${j}`}
                  className="leg"
                  defaultOpen={open}
                  title={
                    <span>
                      {nodeLabel(info, leg.from)} → {nodeLabel(info, leg.to)}
                      {amount && <span className="muted small"> · {varLabel(info, amount)}</span>}
                    </span>
                  }
                  meta={
                    <>
                      <span className="mono">{fmtNum(leg.value)}</span> <Delta text={ldev.tone === 'flat' ? '' : fmtSigned(leg.value - leg.baseline)} tone={ldev.tone} />
                    </>
                  }
                >
                  {amount ? <InfluenceView info={info} client={client} id={`var:${amount}`} onSelect={onSelect} /> : <p className="muted">No amount variable found for this leg.</p>}
                </Disclosure>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} aria-hidden="true" />;
}

/* ---------------------------------------------------------------- player */

function NodeDetail({ info, client, frame, id, kind, onSelect }: { info: ModelInfo; client: EngineClient; frame: Frame; id: Id; kind: 'player' | 'group'; onSelect: OnSelect }) {
  const members = nodeMembers(info, id);
  const player = info.playerById.get(id);
  const rows = new Map<Id, { label: string; side: 'asset' | 'liability'; value: number; baseline: number }>();
  let nw = 0,
    nwb = 0;
  for (const p of members) {
    const bs = client.balanceSheet(p);
    nw += bs.netWorth;
    nwb += bs.netWorthBaseline;
    for (const a of bs.assets) {
      const k = `a:${a.instrument}`;
      const r = rows.get(k) ?? { label: a.label, side: 'asset' as const, value: 0, baseline: 0 };
      r.value += a.value;
      r.baseline += a.baseline;
      rows.set(k, r);
    }
    for (const l of bs.liabilities) {
      const k = `l:${l.instrument}`;
      const r = rows.get(k) ?? { label: l.label, side: 'liability' as const, value: 0, baseline: 0 };
      r.value += l.value;
      r.baseline += l.baseline;
      rows.set(k, r);
    }
  }
  const assets = [...rows.values()].filter((r) => r.side === 'asset');
  const liabs = [...rows.values()].filter((r) => r.side === 'liability');
  const level: Level = kind === 'player' ? 'player' : 'group';
  const pipes = frame.pipes[level]
    .filter((p) => p.from === id || p.to === id)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 8);
  const memberSet = new Set(members);
  const regimes = [...info.regimeOwners].filter(([, owners]) => owners.some((o) => memberSet.has(o)));
  const group = player ? info.groupOf.get(player.id) : undefined;
  return (
    <div className="detail">
      <h3 className="detail-title">
        <Swatch color={nodeColor(info, id)} /> {nodeLabel(info, id)}
      </h3>
      {player && <p className="inf-what">{player.description}</p>}
      {kind === 'group' && members.length > 1 && (
        <p className="members">
          <span className="muted small">Players:</span>
          {members.map((m) => (
            <NavLink key={m} selection={{ kind: 'player', id: m }} onSelect={onSelect}>
              {nodeLabel(info, m)}
            </NavLink>
          ))}
        </p>
      )}
      {kind === 'player' && group && group !== id && info.groupById.get(group)!.players.length > 1 && (
        <p className="members">
          <span className="muted small">Part of</span>
          <NavLink selection={{ kind: 'group', id: group }} onSelect={onSelect}>
            {nodeLabel(info, group)}
          </NavLink>
        </p>
      )}
      <h4 className="sub">Balance sheet</h4>
      <p className="muted small">% of baseline annual GDP · now · baseline · change</p>
      <table className="bs">
        <tbody>
          <tr className="bs-head">
            <th colSpan={4}>Assets</th>
          </tr>
          {assets.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                none
              </td>
            </tr>
          )}
          {assets.map((r) => (
            <BsRow key={r.label} {...r} />
          ))}
          <tr className="bs-head">
            <th colSpan={4}>Liabilities</th>
          </tr>
          {liabs.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                none
              </td>
            </tr>
          )}
          {liabs.map((r) => (
            <BsRow key={r.label} {...r} />
          ))}
          <BsRow label="Net worth" value={nw} baseline={nwb} strong />
        </tbody>
      </table>
      <h4 className="sub">Biggest pipes</h4>
      <ul className="pipe-list">
        {pipes.map((p) => {
          const out = p.from === id;
          const other = out ? p.to : p.from;
          const flows = [...new Set(p.legs.map((l) => info.flowById.get(l.flow)?.label ?? l.flow))];
          const dev = deviation(p.value, p.baseline);
          return (
            <li key={`${p.from}-${p.to}-${p.kind}`}>
              <button type="button" className="pipe-row" onClick={() => onSelect({ kind: 'pipe', from: p.from, to: p.to, flowKind: p.kind, level })}>
                <span className="pipe-dir">{out ? 'to' : 'from'}</span>
                <span className="pipe-other">
                  {other === id ? 'itself' : nodeLabel(info, other)}
                  <span className="muted small"> · {flows.join(', ')}</span>
                </span>
                <span className="mono">{fmtNum(p.value)}</span>
                <Delta text={dev.tone === 'flat' ? '' : fmtSigned(p.value - p.baseline)} tone={dev.tone} />
              </button>
            </li>
          );
        })}
      </ul>
      {regimes.length > 0 && (
        <>
          <h4 className="sub">Regimes</h4>
          <ul className="regime-list">
            {regimes.map(([ruleId]) => {
              const r = info.ruleById.get(ruleId)!;
              const active = frame.regimes[ruleId];
              return (
                <li key={ruleId}>
                  <NavLink selection={{ kind: 'var', id: r.target }} onSelect={onSelect}>
                    {r.label ?? varLabel(info, r.target)}
                  </NavLink>
                  <span className={`chip ${active ? 'regime' : 'quiet'}`}>{active ?? 'normal'}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function BsRow({ label, value, baseline, strong }: { label: string; value: number; baseline: number; strong?: boolean }) {
  const dev = deviation(value, baseline);
  return (
    <tr className={strong ? 'bs-total' : undefined}>
      <td>{label}</td>
      <td className="num mono">{fmtNum(value)}</td>
      <td className="num mono muted">{fmtNum(baseline)}</td>
      <td className="num">
        <Delta text={dev.tone === 'flat' ? '·' : fmtSigned(value - baseline)} tone={dev.tone} />
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------- variable */

function VarDetail({ info, client, frame, id, onSelect }: { info: ModelInfo; client: EngineClient; frame: Frame; id: Id; onSelect: OnSelect }) {
  const v = info.varById.get(id);
  if (!v) return <p className="muted">Unknown variable '{id}'.</p>;
  const from = Math.max(0, frame.t - 72);
  const raw = client.varSeries(id, from, frame.t);
  const base = client.baseline(id);
  const scaled = raw.map((x) => x - base);
  const win = chartWindow(padSeries(scaled, from), frame.t, 72, 0, 1e-6 * Math.max(1, Math.abs(base)));
  const legs = info.legs.filter((l) => l.amount === id);
  const readers = info.rules.filter((r) => r.inputs.includes(id) || r.lagInputs.includes(id)).slice(0, 12);
  return (
    <div className="detail">
      <h3 className="detail-title">{v.label}</h3>
      {v.description && <p className="inf-what">{v.description}</p>}
      <div className="var-chart">
        <ChartSvg win={win} events={frame.events} info={info} width={360} height={70} />
        <span className="muted small">change from baseline, last {Math.min(72, frame.t)} months · unit {v.unit}</span>
      </div>
      <InfluenceView info={info} client={client} id={`var:${id}`} onSelect={onSelect} />
      {legs.length > 0 && (
        <p className="members">
          <span className="muted small">Pays</span>
          {legs.map((l) => (
            <NavLink key={l.index} selection={{ kind: 'pipe', from: l.from, to: l.to, flowKind: l.kind, level: 'player' }} onSelect={onSelect}>
              {nodeLabel(info, l.from)} → {nodeLabel(info, l.to)}
            </NavLink>
          ))}
        </p>
      )}
      {readers.length > 0 && (
        <p className="members">
          <span className="muted small">Read by</span>
          {readers.map((r) => (
            <NavLink key={r.id} selection={{ kind: 'var', id: r.target }} onSelect={onSelect}>
              {r.label ?? varLabel(info, r.target)}
            </NavLink>
          ))}
        </p>
      )}
    </div>
  );
}

/** Put a window of values back at its months, so chartWindow can index it by month. */
function padSeries(values: number[], from: number): number[] {
  const out = new Array<number>(from).fill(Number.NaN);
  return out.concat(values);
}

/* ------------------------------------------------------------------ flow */

function FlowDetail({ info, client, id, onSelect }: { info: ModelInfo; client: EngineClient; id: Id; onSelect: OnSelect }) {
  const f = info.flowById.get(id);
  if (!f) return <p className="muted">Unknown flow '{id}'.</p>;
  return (
    <div className="detail">
      <h3 className="detail-title">{f.label}</h3>
      <p className="inf-what">{f.explain.what}</p>
      <p className="muted small">
        {f.kind} · {f.account} account · {describePosting(f.posting)}
      </p>
      <InfluenceView info={info} client={client} id={`flow:${id}`} onSelect={onSelect} compact />
    </div>
  );
}

/* ------------------------------------------------------------- indicator */

function IndicatorDetail({ info, client, frame, id, onSelect }: { info: ModelInfo; client: EngineClient; frame: Frame; id: Id; onSelect: OnSelect }) {
  const ind = info.indicatorById.get(id);
  if (!ind) return <p className="muted">Unknown chart '{id}'.</p>;
  const series = client.series(id);
  const win = chartWindow(series, frame.t, 120, chartRef(ind, series));
  const now = series.length ? series[series.length - 1] : 0;
  const drivers = (ind.drivers ?? []).filter((d) => info.varById.has(d));
  return (
    <div className="detail">
      <h3 className="detail-title">{ind.label}</h3>
      <div className="bignum">
        <span className={`mono big tone-${signTone(now - win.ref)}`}>{fmtIndicator(now, ind.unit, ind.display)}</span>
        <span className="muted small">
          {ind.unit} · {ind.group}
        </span>
      </div>
      <p className="inf-what">{ind.description}</p>
      <div className="bigchart">
        <ChartSvg win={win} events={frame.events} info={info} width={380} height={170} axes unit={shortUnit(ind.unit)} />
      </div>
      <ConceptChips info={info} ids={ind.concepts ?? []} onSelect={onSelect} />
      {drivers.length > 0 && (
        <>
          <h4 className="sub">Drivers</h4>
          <p className="members">
            {drivers.map((d) => (
              <NavLink key={d} selection={{ kind: 'var', id: d }} onSelect={onSelect}>
                {varLabel(info, d)}
              </NavLink>
            ))}
          </p>
          <h4 className="sub">What drives them now</h4>
          {drivers.map((d, i) => (
            <Disclosure key={d} title={varLabel(info, d)} defaultOpen={i === 0} meta={<DriverMeta info={info} client={client} id={d} />}>
              <InfluenceView info={info} client={client} id={`var:${d}`} onSelect={onSelect} compact />
            </Disclosure>
          ))}
        </>
      )}
    </div>
  );
}

function DriverMeta({ info, client, id }: { info: ModelInfo; client: EngineClient; id: Id }): ReactNode {
  const v = client.value(id),
    b = client.baseline(id);
  const unit = info.varById.get(id)?.unit ?? '';
  const dev = deviation(v, b);
  return <Delta text={dev.tone === 'flat' ? 'at baseline' : fmtChange(v - b, unit, b)} tone={dev.tone} />;
}

/* --------------------------------------------------------------- concept */

const ConceptDetail = memo(function ConceptDetail({ info, id, onSelect }: { info: ModelInfo; id: Id; onSelect: OnSelect }) {
  const c = info.conceptById.get(id);
  if (!c) return <p className="muted">Unknown idea '{id}'.</p>;
  return (
    <article className="detail concept-card">
      <h3 className="detail-title">{c.title}</h3>
      <p className="school">
        <span className="chip quiet">{c.school.replace('-', ' ')}</span>
      </p>
      <p className="lede">{c.oneLiner}</p>
      <Markdown source={c.body} />
      {c.references && c.references.length > 0 && (
        <>
          <h4 className="sub">References</h4>
          <ul className="refs">
            {c.references.map((r, i) => (
              <li key={i}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.title}
                  </a>
                ) : (
                  r.title
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {c.related && c.related.length > 0 && (
        <>
          <h4 className="sub">Related ideas</h4>
          <ConceptChips info={info} ids={c.related} onSelect={onSelect} />
        </>
      )}
    </article>
  );
});
