/**
 * LeverPanel: accordion sections from LeverDef.section (fallback: group). Settings get −/+
 * steppers and a bar with the baseline marker; choices become buttons; one-offs get a size
 * stepper and "Apply now". Each lever has an info toggle with its description and precise
 * definition. Changed levers are highlighted, with a count per section. A lever with `showWhen`
 * is hidden (and not counted) unless the lever it names has one of the listed values.
 *
 * Stabilisers (decision 0004): the model's stabiliser setting sits at the top as Manual /
 * Automatic. On Manual, a lever whose stabiliser is calling for action turns red, says what the
 * rule would set it to and offers "Apply"; its section header gets a red dot. When Apply could
 * not move the lever (the rule wants a value beyond its range), the suggestion is a plain note,
 * without Apply or a red dot. On Automatic, the
 * lever that offsets a rule says what the rule sets. Switching mode puts the levers the new mode
 * hides back to their defaults.
 *
 * Changing a lever starts the clock if it is paused: the change then filters through the
 * economy month by month.
 */
import { memo, useMemo, useState } from 'react';
import type { Id, ScenarioEvent, StabiliserState } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';
import type { LeverInfo, ModelInfo } from '../model/info.ts';
import {
  firedCounts,
  isChanged,
  isShown,
  leverBar,
  leverSections,
  leverValueLabel,
  resetsWhenSetting,
  sectionCalling,
  shownChangedCount,
  stabiliserMarks,
  stepLever,
  type StabiliserMark,
} from '../model/levers.ts';
import { Icon } from './common.tsx';

interface LeverPanelProps {
  info: ModelInfo;
  client: EngineClient;
  values: readonly number[];
  events: readonly ScenarioEvent[];
  /** Every stabiliser now (Frame.stabilisers); empty for a model without them. */
  stabilisers?: readonly StabiliserState[];
}

const NO_STABILISERS: readonly StabiliserState[] = [];

/** Set a lever, first putting back to default the levers that its new value hides. */
function setWithResets(info: ModelInfo, client: EngineClient, values: readonly number[], id: Id, value: number): void {
  for (const r of resetsWhenSetting(info.levers, values, id, value)) client.setLever(r.id, r.value);
  client.setLever(id, value);
}

export const LeverPanel = memo(function LeverPanel({ info, client, values, events, stabilisers = NO_STABILISERS }: LeverPanelProps) {
  const modeLever = info.stabiliserMode ? info.leverById.get(info.stabiliserMode.lever) : undefined;
  const sections = useMemo(() => leverSections(info.levers.filter((l) => l.id !== modeLever?.id)), [info, modeLever]);
  const fired = useMemo(() => firedCounts(events), [events]);
  const marks = useMemo(() => stabiliserMarks(stabilisers, info.leverById), [stabilisers, info]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(info.levers.length <= 8 ? sections.map((s) => s.id) : sections.slice(0, 2).map((s) => s.id)));
  const modeChanged = modeLever ? isChanged(modeLever, values[modeLever.index] ?? modeLever.default, fired) : false;
  const total = sections.reduce((n, s) => n + shownChangedCount(s, values, fired, info.leverById), 0) + (modeChanged ? 1 : 0);
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
        {total > 0 && <span className="muted small">{total} changed</span>}
      </div>
      <div className="panel-body scroll">
        {modeLever && <StabiliserControl info={info} lever={modeLever} value={values[modeLever.index] ?? modeLever.default} values={values} client={client} />}
        {sections.length === 0 && <p className="muted">This model has no levers.</p>}
        {sections.map((s) => {
          const shown = s.levers.filter((l) => isShown(l, values, info.leverById));
          if (!shown.length) return null;
          const n = shownChangedCount(s, values, fired, info.leverById);
          const calling = sectionCalling(s, marks, values, info.leverById);
          const isOpen = open.has(s.id);
          const bodyId = `levers-${s.id.replace(/\W+/g, '-')}`;
          return (
            <section key={s.id} className={`acc ${isOpen ? 'open' : ''}`}>
              <h3 className="acc-h">
                <button type="button" className="acc-head" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggle(s.id)}>
                  <span className="acc-title">{s.title}</span>
                  {calling && <span className="call-dot" role="img" aria-label="A rule would move a lever here" title="A rule would move a lever here" />}
                  {n > 0 && (
                    <span className="count" aria-label={`${n} changed`}>
                      {n}
                    </span>
                  )}
                  <span className="acc-chev">
                    <Icon name="chevron" size={14} />
                  </span>
                </button>
              </h3>
              {isOpen && (
                <div className="acc-body" id={bodyId}>
                  {shown.map((l) => (
                    <LeverRow key={l.id} lever={l} value={values[l.index] ?? l.default} fired={fired.get(l.id) ?? 0} client={client} mark={marks.get(l.id)} />
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

/** The stabiliser setting: Manual / Automatic, with its description behind the info toggle. */
function StabiliserControl({ info, lever: l, value, values, client }: { info: ModelInfo; lever: LeverInfo; value: number; values: readonly number[]; client: EngineClient }) {
  const [showInfo, setShowInfo] = useState(false);
  const infoId = `lever-info-${l.id}`;
  return (
    <div className="stab-mode">
      <div className="lever-head">
        <span className="lever-label" id={`lever-label-${l.id}`}>
          {l.label}
        </span>
        <button type="button" className={`icon-btn tiny ${showInfo ? 'on' : ''}`} aria-expanded={showInfo} aria-controls={infoId} aria-label={`About ${l.label}`} onClick={() => setShowInfo((x) => !x)}>
          <Icon name="info" size={14} />
        </button>
      </div>
      <div className="choices stab-choices" role="group" aria-labelledby={`lever-label-${l.id}`}>
        {(l.options ?? []).map((o) => {
          const on = Math.abs(o.value - value) < 1e-12;
          return (
            <button key={o.value} type="button" className={`seg ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => !on && setWithResets(info, client, values, l.id, o.value)}>
              {o.label}
            </button>
          );
        })}
      </div>
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
}

const LeverRow = memo(function LeverRow({ lever: l, value, fired, client, mark }: { lever: LeverInfo; value: number; fired: number; client: EngineClient; mark?: StabiliserMark }) {
  const [showInfo, setShowInfo] = useState(false);
  const changed = isChanged(l, value, new Map<Id, number>([[l.id, fired]]));
  const infoId = `lever-info-${l.id}`;
  const calling = mark?.kind === 'calling' ? mark : undefined;
  return (
    <div className={`lever ${changed ? 'changed' : ''} ${calling ? 'calling' : ''}`}>
      <div className="lever-head">
        <span className="lever-label" id={`lever-label-${l.id}`}>
          {l.label}
        </span>
        {l.kind === 'setting' && <span className="lever-value mono">{leverValueLabel(l, value)}</span>}
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
      {calling && (
        <div className="stab-call">
          <span>{calling.text}</span>
          <button type="button" className="btn small stab-apply" onClick={() => calling.apply !== value && client.setLever(l.id, calling.apply)} aria-label={`Apply: set ${l.label} to ${leverValueLabel(l, calling.apply)}`} title={`Set to ${leverValueLabel(l, calling.apply)}`}>
            Apply
          </button>
        </div>
      )}
      {(mark?.kind === 'acting' || mark?.kind === 'beyond') && <div className="stab-note">{mark.text}</div>}
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
