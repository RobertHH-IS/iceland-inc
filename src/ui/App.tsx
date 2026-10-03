/**
 * The interface: model choice and scenario links (App), and one model's workspace (Workspace):
 * levers left, the flow map (or the ledger) in the centre, the inspector, ideas at play and the
 * feed on the right, charts along the bottom.
 *
 * Everything is generated from the compiled model through the EngineClient; nothing here knows
 * which model it is showing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Id, ModelDef } from '../core/types.ts';
import { applicationModels as registryModels, createRegisteredEngine } from '../models/index.ts';
import { createEngineClient, type EngineClient } from './engine-client.ts';
import type { ReportBasis } from './model/charts.ts';
import { cleanExpanded, collapseGroup, effectiveExpanded, expandAll, expandGroup, expandableGroups, pipeBetween, reveal, viewKey } from './model/hierarchy.ts';
import { EMPTY_NAV, navBack, navClear, navCurrent, navForward, navPush, selectionKey, type NavState, type Selection } from './model/navigation.ts';
import { comparisonFor, linkTarget, pickModel, switcherModels } from './model/registry.ts';
import { decodeScenarioHash, encodeScenarioHash, hasScenario, type HashState } from './model/scenario-url.ts';
import { Charts } from './views/Charts.tsx';
import { BaselineContext, EconomicContextSummary } from './views/BaselineContext.tsx';
import { Feed } from './views/Feed.tsx';
import { FlowMap } from './views/FlowMap.tsx';
import { Header, type ShareState } from './views/Header.tsx';
import { useFrame } from './views/hooks.ts';
import { IdeasAtPlay } from './views/IdeasAtPlay.tsx';
import { Inspector } from './views/Inspector.tsx';
import { LedgerView } from './views/LedgerView.tsx';
import { LeverPanel } from './views/LeverPanel.tsx';

/** One engine client per model, created the first time the model is opened. */
class ClientPool {
  private entries = new Map<Id, { client?: EngineClient; error?: string }>();
  constructor(private readonly defs: ModelDef[]) {}

  get ids(): Id[] {
    return this.defs.map((d) => d.id);
  }

  get(id: Id): { client?: EngineClient; error?: string } {
    let e = this.entries.get(id);
    if (!e) {
      const def = this.defs.find((d) => d.id === id);
      try {
        if (!def) throw new Error(`no model '${id}' in the registry`);
        e = { client: createEngineClient(createRegisteredEngine(def), { comparison: comparisonFor(def), model: def }) };
      } catch (err) {
        e = { error: err instanceof Error ? err.message : String(err) };
      }
      this.entries.set(id, e);
    }
    return e;
  }

  pauseAll(): void {
    for (const e of this.entries.values()) e.client?.pause();
  }
}

export interface AppProps {
  /** Models to offer (default: the registry in src/models/index.ts). */
  models?: ModelDef[];
  /** The URL hash at start-up, e.g. '#m=reference&v=2&t=24&e=0:keyRate:4' (the key rate held at 4%). */
  initialHash?: string;
  /** Open this model (overrides the hash's model). */
  initialModelId?: Id;
}

/** Groups a link asks to open on the map; `n` changes whenever a new link arrives. */
export interface LinkView {
  expanded?: Id[];
  n: number;
}

export function App({ models = registryModels, initialHash = '', initialModelId }: AppProps) {
  const [pool] = useState(() => new ClientPool(models));
  const choices = useMemo(() => models.map((m) => ({ id: m.id, label: m.label })), [models]);
  const [notice, setNotice] = useState<string | null>(null);
  /** Notices from migrating a link written before padlocks (decision 0010), shown once it has loaded. */
  const bootNotices = useRef<string[]>([]);
  const [linkView, setLinkView] = useState<LinkView>(() => {
    const boot = decodeScenarioHash(initialHash);
    const forThis = boot.ok && (!boot.state.modelId || !initialModelId || boot.state.modelId === initialModelId);
    return { expanded: forThis && boot.ok ? boot.state.expanded : undefined, n: 0 };
  });
  const [modelId, setModelId] = useState<Id>(() => {
    const boot = decodeScenarioHash(initialHash);
    const want = initialModelId ?? (boot.ok ? boot.state.modelId : undefined);
    const id = pickModel(pool.ids, want) ?? '';
    // Replay a shared scenario once, on the model it names.
    if (boot.ok && hasScenario(boot.state) && (!boot.state.modelId || boot.state.modelId === id)) {
      const c = pool.get(id).client;
      bootNotices.current = c?.load({ modelId: id, events: boot.state.events, months: boot.state.months, version: boot.state.version }) ?? [];
    }
    return id;
  });

  let entry = pool.get(modelId);
  let shownId = modelId;
  if (!entry.client) {
    const alt = pool.ids.find((id) => id !== modelId && pool.get(id).client);
    if (alt) {
      shownId = alt;
      entry = pool.get(alt);
    }
  }
  const failed = pool.get(modelId).error;

  const switchModel = useCallback(
    (id: Id, scenario?: HashState) => {
      pool.pauseAll();
      setModelId(id);
      const c = pool.get(id).client;
      if (c && scenario && hasScenario(scenario)) {
        const notices = c.load({ modelId: id, events: scenario.events, months: scenario.months, version: scenario.version });
        if (notices.length) setNotice(notices.join(' '));
      }
      setLinkView((v) => ({ expanded: scenario?.expanded, n: v.n + 1 }));
      if (typeof window !== 'undefined' && !scenario) window.history.replaceState(null, '', `#m=${encodeURIComponent(id)}`);
    },
    [pool],
  );

  // A pasted link in the same tab: follow its hash.
  useEffect(() => {
    const onHash = () => {
      const d = decodeScenarioHash(window.location.hash);
      if (!d.ok) return setNotice(`Could not read the scenario link: ${d.error}`);
      const target = linkTarget(pool.ids, modelId, d.state.modelId);
      if (target.kind === 'unavailable') return setNotice(`This link is for model '${target.modelId}', which is not available here.`);
      if (target.kind === 'switch') return switchModel(target.id, d.state);
      if (hasScenario(d.state)) {
        const notices = pool.get(modelId).client?.load({ modelId, events: d.state.events, months: d.state.months, version: d.state.version }) ?? [];
        if (notices.length) setNotice(notices.join(' '));
      }
      if (d.state.expanded) setLinkView((v) => ({ expanded: d.state.expanded, n: v.n + 1 }));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [pool, modelId, switchModel]);

  useEffect(() => {
    const d = decodeScenarioHash(initialHash);
    if (!d.ok) setNotice(`Could not read the scenario link: ${d.error}`);
    else if (d.state.modelId && !pool.ids.includes(d.state.modelId)) setNotice(`This link is for model '${d.state.modelId}', which is not available here.`);
    else if (bootNotices.current.length) setNotice(bootNotices.current.join(' '));
  }, [initialHash, pool]);

  if (!entry.client)
    return (
      <div className="fatal panel" role="alert">
        <h1 className="title">
          ICELAND <span className="accent">INC.</span>
        </h1>
        <p>No model could be started.</p>
        <pre>{failed ?? entry.error}</pre>
      </div>
    );

  return (
    <Workspace
      key={shownId}
      client={entry.client}
      models={switcherModels(choices, shownId)}
      modelId={shownId}
      link={shownId === modelId ? linkView : { n: 0 }}
      onModelChange={(id) => switchModel(id)}
      notice={failed && shownId !== modelId ? `Model '${modelId}' could not be started, showing '${shownId}' instead: ${failed}` : notice}
      onDismissNotice={() => setNotice(null)}
    />
  );
}

interface WorkspaceProps {
  client: EngineClient;
  models: { id: Id; label: string }[];
  modelId: Id;
  /** Groups a shared link asks to open. */
  link: LinkView;
  onModelChange: (id: Id) => void;
  notice: string | null;
  onDismissNotice: () => void;
}

function Workspace({ client, models, modelId, link, onModelChange, notice, onDismissNotice }: WorkspaceProps) {
  const frame = useFrame(client);
  const info = client.info;
  // The map opens with every group closed, unless a shared link says otherwise.
  const [expanded, setExpanded] = useState<ReadonlySet<Id>>(() => new Set(cleanExpanded(info, link.expanded ?? [])));
  useEffect(() => {
    if (link.n > 0 && link.expanded) setExpanded(new Set(cleanExpanded(info, link.expanded)));
  }, [info, link]);
  const [stage, setStage] = useState<'map' | 'ledger'>('map');
  const [ledgerCols, setLedgerCols] = useState<'players' | 'map'>('players');
  const [nav, setNav] = useState<NavState>(EMPTY_NAV);
  const [chartTab, setChartTab] = useState<string | null>(null);
  const [reportBasis, setReportBasis] = useState<ReportBasis>('nominal');
  const [contextOpen, setContextOpen] = useState(false);
  const [share, setShare] = useState<ShareState>({ status: 'idle' });
  const selection = navCurrent(nav);

  const eff = useMemo(() => effectiveExpanded(info, expanded), [info, expanded]);
  const vkey = viewKey(eff);
  // Pipes at the level that is open on the map, recomputed each tick.
  const viewPipes = useMemo(() => client.pipes({ expanded: [...eff] }), [client, frame.seq, vkey]);
  // Stabilisers acting now (unlocked): the numbers they set get an "auto" marker on the map.
  const rulesActing = useMemo(() => frame.stabilisers.filter((st) => !st.locked).map((st) => st.id).join(' '), [frame.stabilisers]);
  const expandable = useMemo(() => expandableGroups(info), [info]);

  // Going to a player or group hidden inside a closed group (from the inspector, the ledger or
  // Back and Forward) opens the groups around it. Closing a group keeps the selection: the map
  // then highlights the closed group instead.
  const revealSelection = useCallback((s: Selection | null) => {
    if (s && (s.kind === 'player' || s.kind === 'group')) setExpanded((e) => reveal(info, e, s.id));
  }, [info]);
  const selKey = selection ? selectionKey(selection) : '';
  useEffect(() => revealSelection(selection), [selKey, nav.index]);

  const onSelect = useCallback(
    (s: Selection) => {
      setNav((n) => navPush(n, s));
      revealSelection(s);
    },
    [revealSelection],
  );
  const onOpenGroup = useCallback(
    (id: Id) => {
      setExpanded((e) => expandGroup(info, e, id));
      setNav((n) => navPush(n, { kind: 'group', id }));
    },
    [info],
  );
  const onCloseGroup = useCallback((id: Id) => setExpanded((e) => collapseGroup(info, e, id)), [info]);
  const onBack = useCallback(() => setNav(navBack), []);
  const onForward = useCallback(() => setNav(navForward), []);
  const onClose = useCallback(() => setNav(navClear), []);
  const onShareDone = useCallback(() => setShare({ status: 'idle' }), []);

  const onShare = useCallback(() => {
    const hash = encodeScenarioHash({ ...client.scenario(), expanded: cleanExpanded(info, expanded) });
    const url = `${window.location.href.split('#')[0]}#${hash}`;
    window.history.replaceState(null, '', `#${hash}`);
    const clip = navigator.clipboard;
    if (!clip) return setShare({ status: 'manual', url });
    clip.writeText(url).then(
      () => setShare({ status: 'copied', url }),
      () => setShare({ status: 'manual', url }),
    );
  }, [client, info, expanded]);

  // Space plays and pauses, unless focus is in a control that uses it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.defaultPrevented || contextOpen) return;
      const el = e.target as HTMLElement | null;
      if (el && el !== document.body && el.closest('button, input, select, textarea, a, [role="button"], [contenteditable="true"]')) return;
      e.preventDefault();
      client.toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client, contextOpen]);

  const selectedPipe = selection?.kind === 'pipe' ? (pipeBetween(info, frame.legs, selection.from, selection.to, selection.flowKind, frame.legBaselines) ?? undefined) : undefined;
  const allOpen = expandable.every((id) => expanded.has(id));
  const noneOpen = !expandable.some((id) => expanded.has(id));

  return (
    <div className="app">
      <Header
        info={info}
        client={client}
        t={frame.t}
        horizon={frame.horizon}
        playing={frame.playing}
        speed={frame.speed}
        ended={frame.ended}
        events={frame.events}
        checks={frame.checks}
        signViolations={frame.signViolations}
        models={models}
        modelId={modelId}
        onModelChange={onModelChange}
        onShare={onShare}
        share={share}
        onShareDone={onShareDone}
        onBaseline={() => setContextOpen(true)}
        baselineOpen={contextOpen}
      />
      <EconomicContextSummary client={client} />
      {contextOpen && <BaselineContext client={client} onClose={() => setContextOpen(false)} />}
      {(notice || frame.error || frame.ended) && (
        <div className="banner" role="alert">
          <span>{notice ?? frame.error ?? `The clock stopped at month ${frame.maxMonths}. Reset, or drag the timeline back to explore.`}</span>
          {notice && (
            <button type="button" className="btn small" onClick={onDismissNotice}>
              Dismiss
            </button>
          )}
        </div>
      )}
      <LeverPanel info={info} client={client} values={frame.levers} events={frame.events} stabilisers={frame.stabilisers} />
      <main className="stage panel" aria-label="The economy">
        <div className="stage-bar">
          <div className="seg-group" role="group" aria-label="View">
            <button type="button" className={`seg ${stage === 'map' ? 'on' : ''}`} aria-pressed={stage === 'map'} onClick={() => setStage('map')}>
              Flow map
            </button>
            <button type="button" className={`seg ${stage === 'ledger' ? 'on' : ''}`} aria-pressed={stage === 'ledger'} onClick={() => setStage('ledger')}>
              Ledger
            </button>
          </div>
          {expandable.length > 0 && stage === 'map' && (
            <div className="seg-group" role="group" aria-label="Groups on the map">
              <button type="button" className="seg" disabled={allOpen} onClick={() => setExpanded(expandAll(info))}>
                Expand all
              </button>
              <button type="button" className="seg" disabled={noneOpen} onClick={() => setExpanded(new Set())}>
                Collapse all
              </button>
            </div>
          )}
          {expandable.length > 0 && stage === 'ledger' && (
            <div className="seg-group" role="group" aria-label="Ledger columns">
              <button type="button" className={`seg ${ledgerCols === 'players' ? 'on' : ''}`} aria-pressed={ledgerCols === 'players'} onClick={() => setLedgerCols('players')}>
                Every player
              </button>
              <button type="button" className={`seg ${ledgerCols === 'map' ? 'on' : ''}`} aria-pressed={ledgerCols === 'map'} onClick={() => setLedgerCols('map')} title="One column per card on the flow map: closed groups are one column">
                Grouped as on the map
              </button>
            </div>
          )}
        </div>
        {stage === 'map' ? (
          <FlowMap info={info} client={client} expanded={eff} pipes={viewPipes} legs={frame.legs} t={frame.t} events={frame.events} regimes={frame.regimes} rulesActing={rulesActing} seq={frame.seq} selection={selection} onSelect={onSelect} onOpenGroup={onOpenGroup} onCloseGroup={onCloseGroup} />
        ) : (
          <LedgerView info={info} client={client} legs={frame.legs} t={frame.t} events={frame.events} columns={ledgerCols === 'map' ? { expanded: eff } : 'player'} onSelect={onSelect} />
        )}
      </main>
      <div className="side">
        <Inspector info={info} client={client} frame={frame} nav={nav} expanded={eff} basis={reportBasis} onSelect={onSelect} onBack={onBack} onForward={onForward} onClose={onClose} />
        <IdeasAtPlay info={info} client={client} seq={frame.seq} selection={selection} pipe={selectedPipe} onSelect={onSelect} />
        <Feed info={info} feed={frame.feed} onSelect={onSelect} month0={client.calendar} />
      </div>
      <Charts info={info} client={client} t={frame.t} events={frame.events} tab={chartTab} onTab={setChartTab} basis={reportBasis} onBasis={setReportBasis} selected={selection?.kind === 'indicator' ? selection.id : null} onSelect={onSelect} />
    </div>
  );
}
