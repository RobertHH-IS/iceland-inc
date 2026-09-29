/**
 * Inspector: what is driving the selected thing right now, from engine.influences().
 *
 *   Pipe      its legs; for each leg, the amount's influence (rule, category, regime,
 *             desired vs actual, terms now vs baseline, parameters with provenance, concepts)
 *   Variable  its influence; clicking a term's input walks upstream to that variable
 *   Player    live balance sheet, net worth, a warning on any position with the wrong sign
 *             (decision 0005), biggest pipes, regimes
 *   Group     description, members, the balance sheet of all its players, biggest pipes
 *             against the map as it is, regimes
 *   Indicator description, drivers, a big chart and the drivers' influences
 *   Concept   the concept card
 *
 * Breadcrumbs keep the path of clicks, with back and forward.
 */
import { memo, useEffect, useRef, type ReactNode } from 'react';
import type { BalanceSheet, FlowKind, Id, Influence } from '../../core/types.ts';
import { describePosting, postingLabels } from '../../core/format.ts';
import type { EngineClient, Frame } from '../engine-client.ts';
import { chartRef, chartWindow } from '../model/charts.ts';
import { fmtChange, fmtCompact, fmtCompactChange, fmtIndicator, fmtNum, fmtSigned, fmtValue, shortUnit, unitCaption } from '../model/format.ts';
import { directMembers, memberCount, nodePipes, pipeBetween, type ViewLeg } from '../model/hierarchy.ts';
import { nodeColor, nodeLabel, nodeMembers, varLabel, type ModelInfo } from '../model/info.ts';
import { GROUP_NOUNS } from '../model/player-cards.ts';
import { labels } from '../labels.ts';
import { canBack, canForward, navCurrent, selectionKey, selectionLabel, type NavState } from '../model/navigation.ts';
import { POSITION_NOTE, positionWarnings } from '../model/signs.ts';
import { changeBar, deviation, signTone } from '../model/styling.ts';
import { ChartSvg } from './ChartSvg.tsx';
import { CategoryChip, ChangeBar, ConceptChip, ConceptChips, Delta, Disclosure, Icon, Markdown, NavLink, ProvenanceNote, type OnSelect } from './common.tsx';

interface InspectorProps {
  info: ModelInfo;
  client: EngineClient;
  frame: Frame;
  nav: NavState;
  /** Groups open on the map (effectively): pipes are listed against the map as it is. */
  expanded: ReadonlySet<Id>;
  onSelect: OnSelect;
  onBack: () => void;
  onForward: () => void;
  onGo: (index: number) => void;
  onClose: () => void;
}

export function Inspector({ info, client, frame, nav, expanded, onSelect, onBack, onForward, onGo, onClose }: InspectorProps) {
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
                    <span className="crumb-kind">{labels.selectionKind[s.kind]}</span> {selectionLabel(s, info)}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="panel-body scroll" ref={body}>
        {!sel && <Intro info={info} />}
        {sel?.kind === 'pipe' && <PipeDetail info={info} client={client} frame={frame} from={sel.from} to={sel.to} kind={sel.flowKind} onSelect={onSelect} />}
        {(sel?.kind === 'player' || sel?.kind === 'group') && <NodeDetail info={info} client={client} frame={frame} expanded={expanded} id={sel.id} kind={sel.kind} onSelect={onSelect} />}
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

/** A flow's explanation with its {param} placeholders filled with the parameters in force, as
 *  the flow's influence gives it; the declared text if that fails. */
function flowWhat(client: EngineClient, id: Id, declared: string): string {
  try {
    return client.influences(`flow:${id}`).rule?.what ?? declared;
  } catch {
    return declared;
  }
}

/** A player or a group, as a selection. */
const nodeSelection = (info: ModelInfo, id: Id) => (info.playerById.has(id) ? ({ kind: 'player', id } as const) : ({ kind: 'group', id } as const));

function PipeDetail({ info, client, frame, from, to, kind, onSelect }: { info: ModelInfo; client: EngineClient; frame: Frame; from: Id; to: Id; kind: FlowKind; onSelect: OnSelect }) {
  const pipe = pipeBetween(info, frame.legs, from, to, kind);
  if (!pipe) return <p className="muted">No flow of this kind runs between these two.</p>;
  const dev = deviation(pipe.value, pipe.baseline);
  const byFlow = new Map<Id, ViewLeg[]>();
  for (const l of pipe.legs) byFlow.set(l.flow, [...(byFlow.get(l.flow) ?? []), l]);
  let shown = 0;
  return (
    <div className="detail">
      <h3 className="detail-title">
        <NavLink selection={nodeSelection(info, from)} onSelect={onSelect}>
          <Swatch color={nodeColor(info, from)} /> {nodeLabel(info, from)}
        </NavLink>
        <span className="arrow">→</span>
        {from === to ? (
          <span className="muted">itself</span>
        ) : (
          <NavLink selection={nodeSelection(info, to)} onSelect={onSelect}>
            <Swatch color={nodeColor(info, to)} /> {nodeLabel(info, to)}
          </NavLink>
        )}
      </h3>
      {from === to && info.groupById.has(from) && <p className="muted small">Flows between the members of {nodeLabel(info, from)}, drawn as a loop on its card while it is closed.</p>}
      <div className="bignum">
        <span className="mono big">{fmtNum(pipe.value)}</span>
        <span className="muted small">% of GDP a year · baseline {fmtNum(pipe.baseline)}</span>
        <Delta text={dev.tone === 'flat' ? 'at baseline' : fmtSigned(pipe.value - pipe.baseline)} tone={dev.tone} />
        <span className={`chip kind kind-${pipe.kind}`}>{labels.flowKind[pipe.kind]}</span>
      </div>
      {[...byFlow].map(([flowId, legs]) => {
        const flow = info.flowById.get(flowId);
        return (
          <div key={flowId} className="flow-block">
            <h4>
              <NavLink selection={{ kind: 'flow', id: flowId }} onSelect={onSelect}>
                {flow?.label ?? flowId}
              </NavLink>
              {flow && <span className="muted small"> · {labels.account[flow.account]}</span>}
            </h4>
            {flow && <p className="inf-what">{flowWhat(client, flowId, flow.explain.what)}</p>}
            {flow && <p className="muted small">{describePosting(flow.posting, postingLabels(info.instruments))}</p>}
            {flow && <ConceptChips info={info} ids={flow.concepts ?? []} onSelect={onSelect} />}
            {legs.map((leg) => {
              const amount = info.legs[leg.index]?.amount;
              const ldev = deviation(leg.value, leg.baseline);
              const open = shown++ < 2;
              return (
                <Disclosure
                  key={leg.index}
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

function NodeDetail({ info, client, frame, expanded, id, kind, onSelect }: { info: ModelInfo; client: EngineClient; frame: Frame; expanded: ReadonlySet<Id>; id: Id; kind: 'player' | 'group'; onSelect: OnSelect }) {
  const members = nodeMembers(info, id);
  const player = info.playerById.get(id);
  const group = kind === 'group' ? info.groupById.get(id) : undefined;
  let bs: BalanceSheet;
  try {
    bs = client.balanceSheet(id);
  } catch (err) {
    return <p className="error">{err instanceof Error ? err.message : String(err)}</p>;
  }
  const pipes = nodePipes(info, frame.legs, expanded, id)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 8);
  const memberSet = new Set(members);
  const regimes = [...info.regimeOwners].filter(([, owners]) => owners.some((o) => memberSet.has(o)));
  const path = info.ancestorsOf.get(id) ?? [];
  const warnings = positionWarnings(info, frame.signViolations).filter((w) => memberSet.has(w.player));
  const warned = (instrument: Id, role: 'holder' | 'issuer') => warnings.some((w) => w.instrument === instrument && w.role === role);
  const inside = new Set(info.groupById.has(id) ? [id, ...info.groups.filter((g) => (info.ancestorsOf.get(g.id) ?? []).includes(id)).map((g) => g.id), ...members] : [id]);
  return (
    <div className="detail">
      <h3 className="detail-title">
        <Swatch color={nodeColor(info, id)} /> {nodeLabel(info, id)}
      </h3>
      {path.length > 0 && (
        <p className="members group-path">
          <span className="muted small">Part of</span>
          {path.map((g, i) => (
            <span key={g} className="path-step">
              {i > 0 && <span className="muted small">›</span>}
              <NavLink selection={{ kind: 'group', id: g }} onSelect={onSelect}>
                {nodeLabel(info, g)}
              </NavLink>
            </span>
          ))}
        </p>
      )}
      {player && <p className="inf-what">{player.description}</p>}
      {group?.description && <p className="inf-what">{group.description}</p>}
      {group && (
        <>
          <h4 className="sub">
            Members
          </h4>
          <ul className="member-list">
            {directMembers(info, id).map((m) => {
              const sub = info.groupById.get(m.id);
              return (
                <li key={m.id}>
                  <button type="button" className="member-row" onClick={() => onSelect({ kind: m.kind, id: m.id })}>
                    <Swatch color={nodeColor(info, m.id)} />
                    <span className="member-name">{nodeLabel(info, m.id)}</span>
                    {sub && <span className="muted small">{memberCount(info, m.id, GROUP_NOUNS[info.id])}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h4 className="sub">Balance sheet{group ? ' of all its players' : ''}</h4>
      <p className="muted small">% of GDP · now · baseline · change{group ? ' · not netted between members' : ''}</p>
      {warnings.length > 0 && (
        <div className="bs-warning" role="status">
          <ul>
            {warnings.map((w) => (
              <li key={`${w.instrument}/${w.player}`}>{w.text}</li>
            ))}
          </ul>
          <p>{POSITION_NOTE}</p>
        </div>
      )}
      <table className="bs">
        <tbody>
          <tr className="bs-head">
            <th colSpan={4}>Assets</th>
          </tr>
          {bs.assets.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                none
              </td>
            </tr>
          )}
          {bs.assets.map((r) => (
            <BsRow key={r.instrument} label={r.label} value={r.value} baseline={r.baseline} warn={warned(r.instrument, 'holder') ? 'went below zero' : undefined} />
          ))}
          <tr className="bs-head">
            <th colSpan={4}>Liabilities</th>
          </tr>
          {bs.liabilities.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                none
              </td>
            </tr>
          )}
          {bs.liabilities.map((r) => (
            <BsRow key={r.instrument} label={r.label} value={r.value} baseline={r.baseline} warn={warned(r.instrument, 'issuer') ? 'turned into a claim' : undefined} />
          ))}
          <BsRow label="Net worth" value={bs.netWorth} baseline={bs.netWorthBaseline} strong />
        </tbody>
      </table>
      <h4 className="sub">Biggest pipes{group ? ' as the map shows them' : ''}</h4>
      <ul className="pipe-list">
        {pipes.map((p) => {
          const within = inside.has(p.from) && inside.has(p.to);
          const out = inside.has(p.from);
          const other = out ? p.to : p.from;
          const flows = [...new Set(p.legs.map((l) => info.flowById.get(l.flow)?.label ?? l.flow))];
          const dev = deviation(p.value, p.baseline);
          return (
            <li key={`${p.from}-${p.to}-${p.kind}`}>
              <button type="button" className="pipe-row" onClick={() => onSelect({ kind: 'pipe', from: p.from, to: p.to, flowKind: p.kind })}>
                <span className="pipe-dir">{within ? 'inside' : out ? 'to' : 'from'}</span>
                <span className="pipe-other">
                  {within ? (p.from === p.to ? nodeLabel(info, p.from) : `${nodeLabel(info, p.from)} → ${nodeLabel(info, p.to)}`) : nodeLabel(info, other)}
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

/** `warn`: what went wrong with the position (decision 0005), shown after its label. */
function BsRow({ label, value, baseline, strong, warn }: { label: string; value: number; baseline: number; strong?: boolean; warn?: string }) {
  const dev = deviation(value, baseline);
  return (
    <tr className={strong ? 'bs-total' : warn ? 'bs-warn' : undefined}>
      <td>
        {label}
        {warn && (
          <span className="bs-warn-mark" title="A position no real sector could hold: see the warning above">
            {' '}
            ({warn})
          </span>
        )}
      </td>
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
            <NavLink key={l.index} selection={{ kind: 'pipe', from: l.from, to: l.to, flowKind: l.kind }} onSelect={onSelect}>
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
      <p className="inf-what">{flowWhat(client, id, f.explain.what)}</p>
      <p className="muted small">
        {labels.flowKind[f.kind]} · {labels.account[f.account]} · {describePosting(f.posting, postingLabels(info.instruments))}
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
        <span className="chip quiet">{labels.school[c.school]}</span>
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
