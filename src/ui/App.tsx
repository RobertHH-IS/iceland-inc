/**
 * The interface: model choice and scenario links (App), and one model's workspace (Workspace):
 * levers left, the flow map (or the ledger) in the centre, the inspector, ideas at play and the
 * feed on the right, charts along the bottom.
 *
 * Everything is generated from the compiled model through the EngineClient; nothing here knows
 * which model it is showing.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Id, ModelDef } from '../core/types.ts';
import { models as registryModels } from '../models/index.ts';
import { createEngineClient, type EngineClient } from './engine-client.ts';
import type { Level } from './model/geometry.ts';
import type { ModelInfo } from './model/info.ts';
import { EMPTY_NAV, navBack, navClear, navCurrent, navForward, navGo, navPush, type NavState, type Selection } from './model/navigation.ts';
import { pickModel } from './model/registry.ts';
import { decodeScenarioHash, encodeScenarioHash, hasScenario, type HashState } from './model/scenario-url.ts';
import { Charts } from './views/Charts.tsx';
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
        e = { client: createEngineClient(def) };
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
  /** The URL hash at start-up, e.g. '#m=reference&t=24&e=0:keyRateAddon:1'. */
  initialHash?: string;
  /** Open this model (overrides the hash's model). */
  initialModelId?: Id;
}

export function App({ models = registryModels, initialHash = '', initialModelId }: AppProps) {
  const [pool] = useState(() => new ClientPool(models));
  const choices = useMemo(() => models.map((m) => ({ id: m.id, label: m.label })), [models]);
  const [notice, setNotice] = useState<string | null>(null);
  const [modelId, setModelId] = useState<Id>(() => {
    const boot = decodeScenarioHash(initialHash);
    const want = initialModelId ?? (boot.ok ? boot.state.modelId : undefined);
    const id = pickModel(pool.ids, want) ?? '';
    // Replay a shared scenario once, on the model it names.
    if (boot.ok && hasScenario(boot.state) && (!boot.state.modelId || boot.state.modelId === id)) {
      const c = pool.get(id).client;
      c?.load({ modelId: id, events: boot.state.events, months: boot.state.months });
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
      if (c && scenario && hasScenario(scenario)) c.load({ modelId: id, events: scenario.events, months: scenario.months });
      if (typeof window !== 'undefined' && !scenario) window.history.replaceState(null, '', `#m=${encodeURIComponent(id)}`);
    },
    [pool],
  );

  // A pasted link in the same tab: follow its hash.
  useEffect(() => {
    const onHash = () => {
      const d = decodeScenarioHash(window.location.hash);
      if (!d.ok) return setNotice(`Could not read the scenario link: ${d.error}`);
      const id = pickModel(pool.ids, d.state.modelId) ?? modelId;
      if (d.state.modelId && d.state.modelId !== id) setNotice(`This link is for model '${d.state.modelId}', which is not available here.`);
      if (id !== modelId) switchModel(id, d.state);
      else if (hasScenario(d.state)) pool.get(id).client?.load({ modelId: id, events: d.state.events, months: d.state.months });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [pool, modelId, switchModel]);

  useEffect(() => {
    const d = decodeScenarioHash(initialHash);
    if (!d.ok) setNotice(`Could not read the scenario link: ${d.error}`);
    else if (d.state.modelId && !pool.ids.includes(d.state.modelId)) setNotice(`This link is for model '${d.state.modelId}', which is not available here.`);
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
      models={choices}
      modelId={shownId}
      onModelChange={(id) => switchModel(id)}
      notice={failed && shownId !== modelId ? `Model '${modelId}' could not be started, showing '${shownId}' instead: ${failed}` : notice}
      onDismissNotice={() => setNotice(null)}
    />
  );
}

/** Map level to open a model at: groups when there are many players. */
export function defaultLevel(info: ModelInfo): Level {
  return info.players.length > 7 && info.groups.length < info.players.length ? 'group' : 'player';
}

interface WorkspaceProps {
  client: EngineClient;
  models: { id: Id; label: string }[];
  modelId: Id;
  onModelChange: (id: Id) => void;
  notice: string | null;
  onDismissNotice: () => void;
}

function Workspace({ client, models, modelId, onModelChange, notice, onDismissNotice }: WorkspaceProps) {
  const frame = useFrame(client);
  const info = client.info;
  const [level, setLevel] = useState<Level>(() => defaultLevel(info));
  const [stage, setStage] = useState<'map' | 'ledger'>('map');
  const [nav, setNav] = useState<NavState>(EMPTY_NAV);
  const [chartTab, setChartTab] = useState<string | null>(null);
  const [share, setShare] = useState<ShareState>({ status: 'idle' });
  const selection = navCurrent(nav);

  const onSelect = useCallback((s: Selection) => setNav((n) => navPush(n, s)), []);
  const onBack = useCallback(() => setNav(navBack), []);
  const onForward = useCallback(() => setNav(navForward), []);
  const onGo = useCallback((i: number) => setNav((n) => navGo(n, i)), []);
  const onClose = useCallback(() => setNav(navClear), []);
  const onShareDone = useCallback(() => setShare({ status: 'idle' }), []);

  const onShare = useCallback(() => {
    const hash = encodeScenarioHash(client.scenario());
    const url = `${window.location.href.split('#')[0]}#${hash}`;
    window.history.replaceState(null, '', `#${hash}`);
    const clip = navigator.clipboard;
    if (!clip) return setShare({ status: 'manual', url });
    clip.writeText(url).then(
      () => setShare({ status: 'copied', url }),
      () => setShare({ status: 'manual', url }),
    );
  }, [client]);

  // Space plays and pauses, unless focus is in a control that uses it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && el !== document.body && el.closest('button, input, select, textarea, a, [role="button"], [contenteditable="true"]')) return;
      e.preventDefault();
      client.toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client]);

  const selectedPipe = selection?.kind === 'pipe' ? frame.pipes[selection.level].find((p) => p.from === selection.from && p.to === selection.to && p.kind === selection.flowKind) : undefined;
  const hasGroups = info.groups.length < info.players.length;

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
        models={models}
        modelId={modelId}
        onModelChange={onModelChange}
        onShare={onShare}
        share={share}
        onShareDone={onShareDone}
      />
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
      <LeverPanel info={info} client={client} values={frame.levers} events={frame.events} />
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
          {hasGroups && (
            <div className="seg-group" role="group" aria-label="Detail">
              <button type="button" className={`seg ${level === 'group' ? 'on' : ''}`} aria-pressed={level === 'group'} onClick={() => setLevel('group')}>
                Groups
              </button>
              <button type="button" className={`seg ${level === 'player' ? 'on' : ''}`} aria-pressed={level === 'player'} onClick={() => setLevel('player')}>
                All players
              </button>
            </div>
          )}
          <span className="stage-hint muted small">{stage === 'map' ? 'Money flows along the pipes, always. Click a pipe or a player.' : 'Every flow is posted twice: each row sums to zero.'}</span>
        </div>
        {stage === 'map' ? (
          <FlowMap info={info} client={client} level={level} pipes={frame.pipes[level]} legs={frame.legs} regimes={frame.regimes} seq={frame.seq} selection={selection} onSelect={onSelect} />
        ) : (
          <LedgerView info={info} client={client} legs={frame.legs} level={level} onSelect={onSelect} />
        )}
      </main>
      <div className="side">
        <Inspector info={info} client={client} frame={frame} nav={nav} onSelect={onSelect} onBack={onBack} onForward={onForward} onGo={onGo} onClose={onClose} />
        <IdeasAtPlay info={info} client={client} seq={frame.seq} selection={selection} pipe={selectedPipe} onSelect={onSelect} />
        <Feed info={info} feed={frame.feed} onSelect={onSelect} />
      </div>
      <Charts info={info} client={client} t={frame.t} events={frame.events} tab={chartTab} onTab={setChartTab} selected={selection?.kind === 'indicator' ? selection.id : null} onSelect={onSelect} />
    </div>
  );
}
