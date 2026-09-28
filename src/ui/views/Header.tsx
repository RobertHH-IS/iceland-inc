/**
 * Header: title, model name and switcher, the clock and its transport controls, the timeline
 * slider (seek), the accounting badge from engine.checks(), and scenario sharing.
 */
import { memo, useCallback, useEffect, useRef, type ChangeEvent } from 'react';
import type { Id, ScenarioEvent } from '../../core/types.ts';
import { SPEEDS, type ChecksSummary, type EngineClient, type Speed } from '../engine-client.ts';
import { fmtClock, fmtResidual } from '../model/format.ts';
import type { ModelInfo } from '../model/info.ts';
import { leverValueLabel } from '../model/levers.ts';
import { Icon } from './common.tsx';

export interface ModelChoice {
  id: Id;
  label: string;
}

export type ShareState = { status: 'idle' } | { status: 'copied'; url: string } | { status: 'manual'; url: string };

interface HeaderProps {
  info: ModelInfo;
  client: EngineClient;
  t: number;
  horizon: number;
  playing: boolean;
  speed: Speed;
  ended: boolean;
  events: readonly ScenarioEvent[];
  checks: ChecksSummary;
  models: ModelChoice[];
  modelId: Id;
  onModelChange: (id: Id) => void;
  onShare: () => void;
  share: ShareState;
  onShareDone: () => void;
}

export const Header = memo(function Header(p: HeaderProps) {
  const { client, info } = p;
  const clock = fmtClock(p.t);
  return (
    <header className="header panel">
      <div className="brand">
        <h1 className="title">
          ICELAND <span className="accent">INC.</span>
        </h1>
        <div className="model-name" title={info.description}>
          {info.label}
        </div>
      </div>

      <div className="transport" role="group" aria-label="Simulation clock">
        <button type="button" className="icon-btn" onClick={() => client.reset()} aria-label="Reset to the baseline (clears all lever changes)" title="Reset to the baseline">
          <Icon name="reset" />
        </button>
        <button type="button" className={`icon-btn play ${p.playing ? 'on' : ''}`} onClick={() => client.toggle()} aria-label={p.playing ? 'Pause' : 'Play'} aria-pressed={p.playing} disabled={p.ended && !p.playing} title={p.playing ? 'Pause (space)' : 'Play (space)'}>
          <Icon name={p.playing ? 'pause' : 'play'} size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={() => client.step(1)} aria-label="Step one month" title="Step one month" disabled={p.ended}>
          <Icon name="step" />
        </button>
        <div className="speeds" role="group" aria-label="Months per tick">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={`seg ${p.speed === s ? 'on' : ''}`} aria-pressed={p.speed === s} aria-label={`${s} month${s > 1 ? 's' : ''} per tick`} onClick={() => client.setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="clock" aria-live="off">
        <span className="clock-month mono" aria-label={`Month ${clock.month}`}>
          {clock.short}
        </span>
        <span className="clock-year">{clock.label}</span>
      </div>

      <Timeline client={client} info={info} t={p.t} horizon={p.horizon} events={p.events} />

      <div className="status">
        <span className={`books ${p.checks.ok ? 'ok' : 'bad'}`} title={p.checks.items.map((c) => `${c.label}: ${fmtResidual(c.residual)}`).join('\n') + `\nTolerance ${fmtResidual(p.checks.tolerance)}`} role="status">
          {p.checks.ok ? 'Books balance ✓' : `Books off ✗ ${fmtResidual(p.checks.maxResidual)}`}
        </span>
        <label className="model-switch">
          <span className="sr-only">Model</span>
          <select value={p.modelId} onChange={(e) => p.onModelChange(e.target.value)} aria-label="Choose a model">
            {p.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <ShareButton share={p.share} onShare={p.onShare} onDone={p.onShareDone} />
      </div>
    </header>
  );
});

function Timeline({ client, info, t, horizon, events }: { client: EngineClient; info: ModelInfo; t: number; horizon: number; events: readonly ScenarioEvent[] }) {
  const max = Math.max(1, horizon);
  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => client.seek(Number(e.target.value)), [client]);
  return (
    <div className="timeline">
      <div className="timeline-track">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={Math.min(t, max)}
          onChange={onChange}
          disabled={horizon === 0}
          aria-label="Timeline"
          aria-valuetext={`Month ${t} of ${horizon} simulated`}
          title="Drag to travel back and forth over the months simulated so far"
        />
        <div className="timeline-marks" aria-hidden="true">
          {events.map((e, i) => {
            const l = info.leverById.get(e.lever);
            return <span key={i} className={`tmark ${e.t > t ? 'future' : ''}`} style={{ left: `calc(7px + (100% - 14px) * ${Math.min(e.t, max) / max})` }} title={`Month ${e.t}: ${l?.label ?? e.lever} ${e.fire ? 'applied' : '→'} ${l ? leverValueLabel(l, e.value) : e.value}`} />;
          })}
        </div>
      </div>
      <span className="timeline-label mono">
        {t}/{horizon}
      </span>
    </div>
  );
}

function ShareButton({ share, onShare, onDone }: { share: ShareState; onShare: () => void; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (share.status === 'copied') {
      const id = setTimeout(onDone, 2200);
      return () => clearTimeout(id);
    }
    if (share.status === 'manual') inputRef.current?.select();
  }, [share, onDone]);
  return (
    <div className="share">
      <button type="button" className="btn" onClick={onShare} aria-label="Share this scenario: copy a link that replays it exactly">
        <Icon name="share" /> {share.status === 'copied' ? 'Link copied' : 'Share scenario'}
      </button>
      {share.status === 'manual' && (
        <div className="share-pop panel" role="dialog" aria-label="Scenario link">
          <label>
            Copy this link:
            <input ref={inputRef} readOnly value={share.url} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button type="button" className="icon-btn" onClick={onDone} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}
