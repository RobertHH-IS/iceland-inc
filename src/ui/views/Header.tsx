/**
 * Header: title, model name and switcher, the clock and its transport controls, the timeline
 * slider (seek), the accounting badge from engine.checks(), a calmer badge for positions with
 * the wrong sign (decision 0005: a warning, not an accounting failure), and scenario sharing.
 * On a model that opens on a dated month 0 the clock and the timeline are in calendar months
 * ("September 2026"), with a small tick at each January.
 */
import { memo, useCallback, useEffect, useRef, type ChangeEvent } from 'react';
import type { Id, ScenarioEvent, SignViolation } from '../../core/types.ts';
import { SPEEDS, type ChecksSummary, type EngineClient, type Speed } from '../engine-client.ts';

const SPEED_LABELS: Record<Speed, string> = {
  1: 'A month every 2 seconds',
  3: 'Three months every 2 seconds',
  6: 'Six months every 2 seconds',
};
import { calendarLabel, displayOf, januaries, monthLabel } from '../model/effects.ts';
import { fmtClock, fmtResidual } from '../model/format.ts';
import type { ModelInfo } from '../model/info.ts';
import { leverValueLabel } from '../model/levers.ts';
import { POSITION_NOTE, positionBadge, positionWarnings } from '../model/signs.ts';
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
  signViolations: readonly SignViolation[];
  models: ModelChoice[];
  modelId: Id;
  onModelChange: (id: Id) => void;
  onShare: () => void;
  share: ShareState;
  onShareDone: () => void;
  /** Dated economic context and the assumptions of the model's start. */
  onBaseline?: () => void;
  baselineOpen?: boolean;
}

export const Header = memo(function Header(p: HeaderProps) {
  const { client, info } = p;
  const clock = fmtClock(p.t);
  const month0 = client.calendar;
  const clockLabel = month0 ? calendarLabel(month0, p.t, 'long') : clock.label;
  return (
    <header className="header panel">
      <div className="brand">
        <h1 className="title">
          ICELAND <span className="accent">INC.</span>
        </h1>
      </div>

      <div className="transport" role="group" aria-label="Simulation clock">
        <button type="button" className="icon-btn" onClick={() => client.reset()} aria-label={month0 ? 'Back to the start (clears all lever changes)' : 'Reset to the baseline (clears all lever changes)'} title={month0 ? 'Back to the start' : 'Reset to the baseline'}>
          <Icon name="reset" />
        </button>
        <button type="button" className={`icon-btn play ${p.playing ? 'on' : ''}`} onClick={() => client.toggle()} aria-label={p.playing ? 'Pause' : 'Play'} aria-pressed={p.playing} disabled={p.ended && !p.playing} title={p.playing ? 'Pause (space)' : 'Play (space)'}>
          <Icon name={p.playing ? 'pause' : 'play'} size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={() => client.step(1)} aria-label="Step one month" title="Step one month" disabled={p.ended}>
          <Icon name="step" />
        </button>
        <div className="speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={`seg ${p.speed === s ? 'on' : ''}`} aria-pressed={p.speed === s} aria-label={SPEED_LABELS[s]} title={SPEED_LABELS[s]} onClick={() => client.setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="clock mono" aria-live="off" aria-label={month0 ? `${clockLabel}, month ${clock.month}` : `Month ${clock.month}`}>
        {clockLabel}
      </div>

      <Timeline client={client} info={info} t={p.t} horizon={p.horizon} events={p.events} />

      <div className="status">
        {!p.checks.ok && (
          <span className="books bad" title={p.checks.items.map((c) => `${c.label}: ${fmtResidual(c.residual)}`).join('\n')} role="alert">
            Accounts out of balance: {fmtResidual(p.checks.maxResidual)}
          </span>
        )}
        {p.signViolations.length > 0 && <PositionBadge info={info} violations={p.signViolations} />}
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
        {p.onBaseline && (
          <button type="button" className="btn baseline-button" onClick={p.onBaseline} aria-expanded={p.baselineOpen ?? false} aria-controls={p.baselineOpen ? 'baseline-context' : undefined}>
            {month0 ? 'Starting data' : <>Baseline &amp; current data</>}
          </button>
        )}
        <ShareButton share={p.share} onShare={p.onShare} onDone={p.onShareDone} />
      </div>
    </header>
  );
});

/** Positions with the wrong sign: a quiet badge whose tooltip lists each one and its first month. */
function PositionBadge({ info, violations }: { info: ModelInfo; violations: readonly SignViolation[] }) {
  const list = positionWarnings(info, violations);
  const title = [...list.map((w) => w.text), '', POSITION_NOTE].join('\n');
  return (
    <span className="books warn" title={title} role="status" aria-label={`${positionBadge(list.length)}. ${list.map((w) => w.text).join('. ')}. ${POSITION_NOTE}`}>
      {positionBadge(list.length)}
    </span>
  );
}

function Timeline({ client, info, t, horizon, events }: { client: EngineClient; info: ModelInfo; t: number; horizon: number; events: readonly ScenarioEvent[] }) {
  const max = Math.max(1, horizon);
  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => client.seek(Number(e.target.value)), [client]);
  const display = displayOf(client);
  const at = (m: number) => `calc(7px + (100% - 14px) * ${Math.min(m, max) / max})`;
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
          aria-valuetext={display.month0 ? `${calendarLabel(display.month0, t, 'long')}, month ${t} of ${horizon} simulated` : `Month ${t} of ${horizon} simulated`}
          title="Drag to travel back and forth over the months simulated so far"
        />
        <div className="timeline-marks" aria-hidden="true">
          {display.month0 && horizon > 0 && januaries(display.month0, horizon).map((j) => <span key={j.t} className="tyear" style={{ left: at(j.t) }} />)}
          {events.map((e, i) => {
            const l = info.leverById.get(e.lever);
            return <span key={i} className={`tmark ${e.t > t ? 'future' : ''}`} style={{ left: at(e.t) }} title={`${monthLabel(display, e.t)}: ${l?.label ?? e.lever} ${e.fire ? 'triggered' : '→'} ${l ? leverValueLabel(l, e.value) : e.value}`} />;
          })}
        </div>
      </div>
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
