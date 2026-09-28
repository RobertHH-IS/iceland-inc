/**
 * LeverPanel: accordion sections from LeverDef.section (fallback: group). Settings get −/+
 * steppers and a bar with the baseline marker; choices become buttons; one-offs get a size
 * stepper and "Apply now". Each lever has an info toggle with its description and precise
 * definition. Changed levers are highlighted, with a count per section.
 *
 * Changing a lever starts the clock if it is paused: the change then filters through the
 * economy month by month.
 */
import { memo, useMemo, useState } from 'react';
import type { Id, ScenarioEvent } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';
import type { LeverInfo, ModelInfo } from '../model/info.ts';
import { changedCount, firedCounts, isChanged, leverBar, leverSections, leverValueLabel, stepLever } from '../model/levers.ts';
import { Icon } from './common.tsx';

interface LeverPanelProps {
  info: ModelInfo;
  client: EngineClient;
  values: readonly number[];
  events: readonly ScenarioEvent[];
}

export const LeverPanel = memo(function LeverPanel({ info, client, values, events }: LeverPanelProps) {
  const sections = useMemo(() => leverSections(info.levers), [info]);
  const fired = useMemo(() => firedCounts(events), [events]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(info.levers.length <= 8 ? sections.map((s) => s.id) : sections.slice(0, 2).map((s) => s.id)));
  const total = sections.reduce((n, s) => n + changedCount(s, values, fired), 0);
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <aside className="levers panel" aria-labelledby="levers-title">
      <div className="panel-head">
        <h2 id="levers-title">Levers</h2>
        <span className="muted small">{total ? `${total} changed` : 'at baseline'}</span>
      </div>
      <p className="panel-lede">Pull a lever and the machine runs on while the change filters through the flows to a new resting point.</p>
      <div className="panel-body scroll">
        {sections.length === 0 && <p className="muted">This model has no levers.</p>}
        {sections.map((s) => {
          const n = changedCount(s, values, fired);
          const isOpen = open.has(s.id);
          const bodyId = `levers-${s.id.replace(/\W+/g, '-')}`;
          return (
            <section key={s.id} className={`acc ${isOpen ? 'open' : ''}`}>
              <h3 className="acc-h">
                <button type="button" className="acc-head" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggle(s.id)}>
                  <span className="acc-title">{s.title}</span>
                  {n > 0 && (
                    <span className="count" aria-label={`${n} changed`}>
                      {n}
                    </span>
                  )}
                  <span className="acc-meta muted small">{s.levers.length}</span>
                  <span className="acc-chev">
                    <Icon name="chevron" size={14} />
                  </span>
                </button>
              </h3>
              {isOpen && (
                <div className="acc-body" id={bodyId}>
                  {s.levers.map((l) => (
                    <LeverRow key={l.id} lever={l} value={values[l.index] ?? l.default} fired={fired.get(l.id) ?? 0} client={client} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
});

const LeverRow = memo(function LeverRow({ lever: l, value, fired, client }: { lever: LeverInfo; value: number; fired: number; client: EngineClient }) {
  const [showInfo, setShowInfo] = useState(false);
  const changed = isChanged(l, value, new Map<Id, number>([[l.id, fired]]));
  const infoId = `lever-info-${l.id}`;
  return (
    <div className={`lever ${changed ? 'changed' : ''}`}>
      <div className="lever-head">
        <span className="lever-label" id={`lever-label-${l.id}`}>
          {l.label}
        </span>
        {l.kind !== 'oneoff' && <span className="lever-value mono">{leverValueLabel(l, value)}</span>}
        {l.kind !== 'oneoff' && changed && (
          <button type="button" className="icon-btn tiny" onClick={() => client.setLever(l.id, l.default)} aria-label={`Set ${l.label} back to its baseline`} title="Back to baseline">
            <Icon name="undo" size={14} />
          </button>
        )}
        <button type="button" className={`icon-btn tiny ${showInfo ? 'on' : ''}`} aria-expanded={showInfo} aria-controls={infoId} aria-label={`About ${l.label}`} onClick={() => setShowInfo((x) => !x)}>
          <Icon name="info" size={14} />
        </button>
      </div>
      {l.kind === 'setting' && <SettingControl lever={l} value={value} client={client} />}
      {l.kind === 'choice' && <ChoiceControl lever={l} value={value} client={client} />}
      {l.kind === 'oneoff' && <OneOffControl lever={l} fired={fired} client={client} />}
      {showInfo && (
        <div className="lever-info" id={infoId}>
          <p>{l.description}</p>
          <p>
            <strong>Definition.</strong> {l.definition}
          </p>
        </div>
      )}
    </div>
  );
});

function SettingControl({ lever: l, value, client }: { lever: LeverInfo; value: number; client: EngineClient }) {
  const bar = leverBar(l, value);
  const down = stepLever(l, value, -1),
    up = stepLever(l, value, 1);
  return (
    <div className="stepper">
      <button type="button" className="icon-btn step-btn" onClick={() => client.setLever(l.id, down)} disabled={down === value} aria-label={`Lower ${l.label} to ${leverValueLabel(l, down)}`}>
        <Icon name="minus" size={14} />
      </button>
      <div className="lbar" role="img" aria-label={`${l.label}: ${leverValueLabel(l, value)}, baseline ${leverValueLabel(l, l.default)}, range ${leverValueLabel(l, bar.min)} to ${leverValueLabel(l, bar.max)}`}>
        <span className="lbar-track" />
        <span className="lbar-fill" style={{ left: `${bar.fillFrom * 100}%`, width: `${(bar.fillTo - bar.fillFrom) * 100}%` }} />
        <span className="lbar-base" style={{ left: `${bar.base * 100}%` }} title="Baseline" />
        <span className="lbar-knob" style={{ left: `${bar.value * 100}%` }} />
      </div>
      <button type="button" className="icon-btn step-btn" onClick={() => client.setLever(l.id, up)} disabled={up === value} aria-label={`Raise ${l.label} to ${leverValueLabel(l, up)}`}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}

function ChoiceControl({ lever: l, value, client }: { lever: LeverInfo; value: number; client: EngineClient }) {
  return (
    <div className="choices" role="group" aria-labelledby={`lever-label-${l.id}`}>
      {(l.options ?? []).map((o) => {
        const on = Math.abs(o.value - value) < 1e-12;
        return (
          <button key={o.value} type="button" className={`seg ${on ? 'on' : ''} ${o.value === l.default ? 'base' : ''}`} aria-pressed={on} onClick={() => client.setLever(l.id, o.value)} title={o.value === l.default ? 'Baseline' : undefined}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function OneOffControl({ lever: l, fired, client }: { lever: LeverInfo; fired: number; client: EngineClient }) {
  const [size, setSize] = useState(l.default);
  const down = stepLever(l, size, -1),
    up = stepLever(l, size, 1);
  return (
    <div className="oneoff">
      <div className="stepper compact">
        <button type="button" className="icon-btn step-btn" onClick={() => setSize(down)} disabled={down === size} aria-label={`Smaller ${l.label}: ${leverValueLabel(l, down)}`}>
          <Icon name="minus" size={14} />
        </button>
        <span className="oneoff-size mono" aria-live="polite">
          {leverValueLabel(l, size)}
        </span>
        <button type="button" className="icon-btn step-btn" onClick={() => setSize(up)} disabled={up === size} aria-label={`Larger ${l.label}: ${leverValueLabel(l, up)}`}>
          <Icon name="plus" size={14} />
        </button>
      </div>
      <button type="button" className="btn apply" onClick={() => client.fire(l.id, size)} aria-label={`Apply ${l.label} of ${leverValueLabel(l, size)} now`}>
        Apply now
      </button>
      {fired > 0 && <span className="muted small">applied ×{fired}</span>}
    </div>
  );
}
