/**
 * IdeasAtPlay: the economic ideas doing the work right now, weighted by engine.ideasAtPlay for
 * the current selection (or the whole economy), each with a weight bar and the terms it comes
 * from. They shift as a shock travels through the economy.
 */
import type { Pipe } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';
import { staticConcepts, topIdeas } from '../model/ideas.ts';
import type { ModelInfo } from '../model/info.ts';
import { selectionLabel, selectionScope, type Selection } from '../model/navigation.ts';
import { ConceptChip, type OnSelect } from './common.tsx';

interface IdeasProps {
  info: ModelInfo;
  client: EngineClient;
  seq: number;
  selection: Selection | null;
  pipe?: Pipe;
  onSelect: OnSelect;
}

export function IdeasAtPlay({ info, client, selection, pipe, onSelect }: IdeasProps) {
  const scope = selectionScope(selection);
  const ideas = topIdeas(info, client.ideasAtPlay(scope), 7);
  const where = selection && selection.kind !== 'concept' ? selectionLabel(selection, info) : 'the whole economy';
  return (
    <section className="ideas panel" aria-labelledby="ideas-title">
      <div className="panel-head">
        <h2 id="ideas-title">Ideas at play</h2>
        <span className="muted small ideas-scope" title={where}>
          in {where}
        </span>
      </div>
      <div className="panel-body scroll">
        {ideas.length === 0 ? (
          <div className="ideas-empty">
            <p className="muted small">Nothing has moved from the baseline here yet, so no idea is doing any work. Pull a lever and watch the ideas change as the shock travels.</p>
            <StaticIdeas info={info} selection={selection} pipe={pipe} onSelect={onSelect} />
          </div>
        ) : (
          <ol className="idea-list">
            {ideas.map((it) => (
              <li key={it.concept} className="idea">
                <div className="idea-top">
                  <button type="button" className="idea-title" onClick={() => onSelect({ kind: 'concept', id: it.concept })} title={it.oneLiner} aria-label={`${it.title}: ${Math.round(it.share * 100)}% of the movement. Open the idea`}>
                    {it.title}
                  </button>
                  <span className="mono small idea-share">{Math.round(it.share * 100)}%</span>
                </div>
                <span className="wbar" aria-hidden="true">
                  <span style={{ width: `${Math.max(2, it.rel * 100)}%` }} />
                </span>
                <div className="idea-via">
                  {it.via.map((v) =>
                    v.selection ? (
                      <button key={v.id} type="button" className="via" onClick={() => onSelect(v.selection!)} title="Open what this term drives">
                        {v.label}
                      </button>
                    ) : (
                      <span key={v.id} className="via">
                        {v.label}
                      </span>
                    ),
                  )}
                  {it.moreVia > 0 && <span className="muted small">+{it.moreVia} more</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function StaticIdeas({ info, selection, pipe, onSelect }: { info: ModelInfo; selection: Selection | null; pipe?: Pipe; onSelect: OnSelect }) {
  const ids = staticConcepts(info, selection, pipe).slice(0, 10);
  if (!ids.length) return null;
  return (
    <>
      <p className="muted small">Ideas {selection ? 'this expresses' : 'the model is built on'}:</p>
      <div className="chips">
        {ids.map((id) => (
          <ConceptChip key={id} info={info} id={id} onSelect={onSelect} dim />
        ))}
      </div>
    </>
  );
}
