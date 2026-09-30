/**
 * LeverPanel: accordion sections from LeverDef.section (fallback: group). Settings get −/+
 * steppers and a bar with the baseline marker; choices become buttons; one-offs get a size
 * stepper and "Apply now". Each lever has an info toggle with its description and precise
 * definition. Changed levers are highlighted, with a count per section.
 *
 * Padlocks (decision 0010): a lever with a rule behind it (a stabiliser) has a small padlock
 * beside it. Unlocked, the default, the rule moves the lever: its knob and value follow the live
 * value, marked "auto", and a step from there locks it at the new value. Locked, the lever holds
 * where it is; when its rule calls for action the lever turns red, says what the rule would set it
 * to and offers "Apply", and its section header gets a red dot. When Apply could not move the
 * lever (the rule wants a value beyond its range), the suggestion is a plain note, without Apply
 * or a red dot. Pressing the padlock locks the lever where it is, or hands it back to its rule.
 * Levers without a rule have no padlock and never move by themselves. While every lever with a
 * rule is locked, one calm line at the top of the panel says that nothing then pulls prices back
 * over the long run, with a link to the idea that explains why (decision 0014). While one is locked
 * and another unlocked, the locked one's note, if its stabiliser has one, says what holding it
 * alone does (StabiliserDef.lockedAloneNote, decision 0015), there and in its padlock's title. A
 * lever held off its baseline has a "back to baseline" button; for a lever with a padlock it keeps
 * the lever locked.
 *
 * Changing a lever starts the clock if it is paused: the change then filters through the
 * economy month by month.
 */
import { memo, useMemo, useState } from 'react';
import type { Id, ScenarioEvent, StabiliserState } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';
import type { LeverInfo, ModelInfo } from '../model/info.ts';
import type { Selection } from '../model/navigation.ts';
import {
  allLockedNote,
  canResetToBaseline,
  canStep,
  changedCountWithLocks,
  firedCounts,
  isLeverChanged,
  leverBar,
  leverSections,
  leverValueLabel,
  lockActionLabel,
  lockedAloneNotes,
  lockTitle,
  NOMINAL_ANCHOR_CONCEPT,
  padlocksByLever,
  sectionCalling,
  shownValue,
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
  /** Open a selection in the inspector (the locked-economy note's link to its idea). */
  onSelect?: (s: Selection) => void;
}

const NO_STABILISERS: readonly StabiliserState[] = [];

export const LeverPanel = memo(function LeverPanel({ info, client, values, events, stabilisers = NO_STABILISERS, onSelect }: LeverPanelProps) {
  // the padlocks are drawn beside their levers, not as levers of their own
  const sections = useMemo(() => leverSections(info.levers.filter((l) => l.kind !== 'lock')), [info]);
  const fired = useMemo(() => firedCounts(events), [events]);
  const marks = useMemo(() => stabiliserMarks(stabilisers, info.leverById), [stabilisers, info]);
  const pads = useMemo(() => padlocksByLever(stabilisers), [stabilisers]);
  const lockedNote = useMemo(() => allLockedNote(stabilisers, info.leverById), [stabilisers, info]);
  const aloneNotes = useMemo(() => lockedAloneNotes(stabilisers, new Map(info.stabilisers.map((s) => [s.id, s.lockedAloneNote]))), [stabilisers, info]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(info.levers.length <= 8 ? sections.map((s) => s.id) : sections.slice(0, 2).map((s) => s.id)));
  const total = sections.reduce((n, s) => n + changedCountWithLocks(s, values, fired, pads), 0);
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
        {sections.length === 0 && <p className="muted">This model has no levers.</p>}
        {lockedNote && (
          <p className="lock-note">
            {lockedNote}
            {onSelect && info.conceptById.has(NOMINAL_ANCHOR_CONCEPT) && (
              <>
                {' '}
                <button type="button" className="navlink" onClick={() => onSelect({ kind: 'concept', id: NOMINAL_ANCHOR_CONCEPT })} aria-label={`Why? Open the idea: ${info.conceptById.get(NOMINAL_ANCHOR_CONCEPT)!.title}`}>
                  Why?
                </button>
              </>
            )}
          </p>
        )}
        {[...aloneNotes.values()].map((note) => (
          <p key={note} className="lock-note">
            {note}
          </p>
        ))}
        {sections.map((s) => {
          const n = changedCountWithLocks(s, values, fired, pads);
          const calling = sectionCalling(s, marks);
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
                  {s.levers.map((l) => (
                    <LeverRow key={l.id} lever={l} value={values[l.index] ?? l.default} fired={fired.get(l.id) ?? 0} client={client} mark={marks.get(l.id)} pad={pads.get(l.id)} note={aloneNotes.get(l.id)} />
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

/** The padlock beside a lever with a rule: closed (locked) or open (unlocked, the rule moves it). */
function Padlock({ lever: l, pad, client, note }: { lever: LeverInfo; pad: StabiliserState; client: EngineClient; note?: string }) {
  return (
    <button
      type="button"
      className={`icon-btn tiny padlock${pad.locked ? ' on' : ''}`}
      aria-pressed={pad.locked}
      aria-label={lockActionLabel(l, pad.locked)}
      title={lockTitle(l, pad, note)}
      onClick={() => client.setLever(pad.lock, pad.locked ? 0 : 1)}
    >
      <Icon name={pad.locked ? 'lock' : 'unlock'} size={14} />
    </button>
  );
}

const LeverRow = memo(function LeverRow({
  lever: l,
  value: stored,
  fired,
  client,
  mark,
  pad,
  note,
}: {
  lever: LeverInfo;
  value: number;
  fired: number;
  client: EngineClient;
  mark?: StabiliserMark;
  pad?: StabiliserState;
  /** The lever's locked-alone note (lockedAloneNotes), for its padlock's title. */
  note?: string;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const value = shownValue(stored, pad);
  const auto = !!pad && !pad.locked;
  // An unlocked lever follows its rule's live value: shown, and read out, to two decimals.
  const shown = auto ? Number(value.toFixed(2)) : value;
  const changed = isLeverChanged(l, value, new Map<Id, number>([[l.id, fired]]), pad);
  const infoId = `lever-info-${l.id}`;
  const calling = mark?.kind === 'calling' ? mark : undefined;
  return (
    <div className={['lever', changed && 'changed', calling && 'calling', auto && 'auto'].filter(Boolean).join(' ')}>
      <div className="lever-head">
        <span className="lever-label" id={`lever-label-${l.id}`}>
          {l.label}
        </span>
        {auto && (
          <span className="auto-tag" title={`Set by ${pad.label}`}>
            auto
          </span>
        )}
        {l.kind === 'setting' && <span className="lever-value mono">{leverValueLabel(l, shown)}</span>}
        {pad && <Padlock lever={l} pad={pad} client={client} note={note} />}
        {canResetToBaseline(l, value, pad) && (
          <button
            type="button"
            className="icon-btn tiny"
            onClick={() => client.setLever(l.id, l.default)}
            aria-label={`Set ${l.label} back to its baseline${pad ? ', keeping it locked' : ''}`}
            title={pad ? 'Back to baseline (stays locked)' : 'Back to baseline'}
          >
            <Icon name="undo" size={14} />
          </button>
        )}
        <button type="button" className={`icon-btn tiny ${showInfo ? 'on' : ''}`} aria-expanded={showInfo} aria-controls={infoId} aria-label={`About ${l.label}`} onClick={() => setShowInfo((x) => !x)}>
          <Icon name="info" size={14} />
        </button>
      </div>
      {l.kind === 'setting' && <SettingControl lever={l} value={value} shown={shown} client={client} />}
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
      {mark?.kind === 'beyond' && <div className="stab-note">{mark.text}</div>}
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

/** `shown` is the value as the row displays it (an unlocked lever's rounded to two decimals), for
 *  the bar's accessible name; the steppers step from `value`. */
function SettingControl({ lever: l, value, shown = value, client }: { lever: LeverInfo; value: number; shown?: number; client: EngineClient }) {
  const bar = leverBar(l, value);
  const down = stepLever(l, value, -1),
    up = stepLever(l, value, 1);
  return (
    <div className="stepper">
      <button type="button" className="icon-btn step-btn" onClick={() => client.setLever(l.id, down)} disabled={!canStep(l, value, -1)} aria-label={`Lower ${l.label} to ${leverValueLabel(l, down)}`}>
        <Icon name="minus" size={14} />
      </button>
      <div className="lbar" role="img" aria-label={`${l.label}: ${leverValueLabel(l, shown)}, baseline ${leverValueLabel(l, l.default)}, range ${leverValueLabel(l, bar.min)} to ${leverValueLabel(l, bar.max)}`}>
        <span className="lbar-track" />
        <span className="lbar-fill" style={{ left: `${bar.fillFrom * 100}%`, width: `${(bar.fillTo - bar.fillFrom) * 100}%` }} />
        <span className="lbar-base" style={{ left: `${bar.base * 100}%` }} title="Baseline" />
        <span className="lbar-knob" style={{ left: `${bar.value * 100}%` }} />
      </div>
      <button type="button" className="icon-btn step-btn" onClick={() => client.setLever(l.id, up)} disabled={!canStep(l, value, 1)} aria-label={`Raise ${l.label} to ${leverValueLabel(l, up)}`}>
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
