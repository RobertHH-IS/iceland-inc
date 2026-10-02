/**
 * Feed: engine.feed(), newest first. Narration only: threshold crossings of indicators.
 * Clicking an item opens its indicator. The kernel also reports what a locked lever's rule would
 * do; the feed leaves those out, because a locked lever is the user's decision and needs no prompt
 * (the owner's decision, 2 October 2026).
 */
import { memo } from 'react';
import type { FeedItem } from '../engine-client.ts';
import type { ModelInfo } from '../model/info.ts';
import { ConceptChip, type OnSelect } from './common.tsx';

export const Feed = memo(function Feed({ info, feed: all, onSelect }: { info: ModelInfo; feed: readonly FeedItem[]; onSelect: OnSelect }) {
  const feed = all.filter((f) => !f.stabiliser);
  return (
    <section className="feed panel" aria-labelledby="feed-title">
      <div className="panel-head">
        <h2 id="feed-title">What is happening</h2>
      </div>
      <div className="panel-body scroll">
        {feed.length > 0 && (
          <ol className="feed-list" aria-live="polite">
            {feed.map((f, i) => (
              <li key={`${f.t}-${f.indicator}-${i}`} className="feed-item">
                <span className="mono feed-t">M{f.t}</span>
                <button type="button" className="feed-msg" onClick={() => onSelect({ kind: 'indicator', id: f.indicator })} aria-label={`Month ${f.t}: ${f.message}. Open the chart`}>
                  {f.message}
                </button>
                {f.concept && <ConceptChip info={info} id={f.concept} onSelect={onSelect} />}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
});
