import { memo, useEffect, useId, useRef } from 'react';
import type { EngineClient } from '../engine-client.ts';
import { CONTEXT_GAPS, CONTEXT_SOURCES, CONTEXT_VERIFIED_ON, ICELAND_CONTEXT, WORLD_CONTEXT, contextDate, modelContext, todayLine, trendContext, type ContextRow } from '../model/economic-context.ts';
import { calendarLabel } from '../model/effects.ts';
import { Icon } from './common.tsx';
import { CurrentDataAudit } from './CurrentDataAudit.tsx';

const statusLabel = { observed: 'Observed', derived: 'Calculated from observations', forecast: 'Forecast', estimate: 'Estimate', 'model-assumption': 'Model assumption' } as const;

/** Small dated reference strip; displayed even while the detailed context panel is closed. On a
 *  model that opens on a dated month 0 it is one calm line and nothing else (todayLine). */
export const EconomicContextSummary = memo(function EconomicContextSummary({ client }: { client: EngineClient }) {
  const line = todayLine(client);
  if (line)
    return (
      <aside className="economic-context-summary" aria-label="What the simulation starts from">
        <span className="context-today">{line}</span>
      </aside>
    );
  const modelId = client.info.id;
  const growing = client.info.paramById.has('growthReal');
  const growth = client.info.paramById.get('growthReal')?.value ?? 0;
  const inflation = client.info.paramById.get('growthInflation')?.value ?? 0;
  const keyRate = client.info.varById.has('keyRate') ? `${((client.opening?.('keyRate') ?? client.baseline('keyRate')) * 100).toFixed(2)}% key rate at opening` : '';
  return (
    <aside className="economic-context-summary" aria-label="Model start and current economic reference">
      <strong className="context-model-start">{growing ? `Assumed path: ${(growth * 100).toFixed(1)}% real growth · ${(inflation * 100).toFixed(1)}% price trend` : 'Model start: 0% real growth · 0% inflation'}{keyRate && ` · ${keyRate}`}</strong>
      {modelId !== 'iceland' && !growing && <span className="context-reference-label">Iceland reference</span>}
      <a href={CONTEXT_SOURCES.cbiForecast.url} target="_blank" rel="noreferrer" title="CBI forecast published 19 August 2026; full-year growth, not observed quarterly growth">Iceland GDP +1.4% · 2026 forecast</a>
      <a href={CONTEXT_SOURCES.world.url} target="_blank" rel="noreferrer" title="IMF forecast published 8 July 2026; world real GDP, PPP weighted">World GDP +3.0% · 2026 forecast</a>
      <a href={CONTEXT_SOURCES.policy.url} target="_blank" rel="noreferrer" title="Central Bank of Iceland seven-day term-deposit rate; decision 19 August 2026">Iceland policy 8.00% · 19 Aug</a>
      <a href={CONTEXT_SOURCES.governmentTable.url} target="_blank" rel="noreferrer" title="Observed general-government securities plus loans, divided by 2025 annual GDP; published 15 September 2026. Total liabilities including pensions and payables are a separate 88.3% measure.">Gov borrowing/GDP 56.7% · end-2025</a>
      <span className="context-vintage">Verified {contextDate(CONTEXT_VERIFIED_ON)}</span>
    </aside>
  );
});

export function BaselineContext({ client, onClose }: { client: EngineClient; onClose: () => void }) {
  const month0 = client.calendar;
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        latestClose.current();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary, [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.current.focus();
      } else if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <div className="baseline-context-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section id="baseline-context" ref={panel} className="baseline-context panel" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <div className="panel-head">
          <h2 id={titleId}>{month0 ? 'Starting data' : <>Baseline &amp; current context</>}</h2>
          <button ref={closeButton} type="button" className="icon-btn" aria-label={month0 ? 'Close the starting data' : 'Close economic context'} onClick={onClose}><Icon name="close" /></button>
        </div>
        {month0 ? (
          <div className="baseline-context-body panel-body scroll">
            <p id={descriptionId}>The simulation starts from {client.openingInfo?.label ?? calendarLabel(month0, 0, 'long')}. Each chart’s value at the start sits beside the published records mapped to it: a record marked “used for the start” set the opening; the others are there for comparison.</p>
            <CurrentDataAudit client={client} />
            {trendContext(client).length > 0 && <ContextGroup title="What the no-change path assumes" rows={trendContext(client)} />}
          </div>
        ) : (
        <div className="baseline-context-body panel-body scroll">
          <p id={descriptionId}>{client.comparison === 'no-change'
            ? 'The simulation starts from the calibrated teaching economy and evolves under the explicit growth assumptions below. Your experiment is compared with an event-free run of the same model at the same month. The starting portfolios and rates are not today’s observed Icelandic state.'
            : 'The simulation starts from a stationary economy. Dated real-world observations and forecasts provide context; they do not drive this run.'}</p>
          <p className="context-vintage muted small">Primary sources verified {contextDate(CONTEXT_VERIFIED_ON)}. This is a saved reference snapshot, refreshed deliberately rather than a live feed.</p>
          <CurrentDataAudit client={client} />
          <ContextGroup title={`${client.info.label}: model start`} rows={modelContext(client)} />
          <ContextGroup title="Iceland: current reference" rows={ICELAND_CONTEXT} />
          <ContextGroup title="World & foreign rates: current reference" rows={WORLD_CONTEXT} />
          <section className="context-group context-gaps" aria-label="Baseline scope">
            <h3>What drives the baseline</h3>
            <p>{client.comparison === 'no-change' ? 'Normal domestic demand, population, productivity, foreign demand and prices follow the displayed assumptions. Funded investment builds productive capacity. Refinancing approvals, unpaid obligations, recoveries and bank losses can move the economy away from that path. The no-change curve includes those same mechanisms and assumptions.' : CONTEXT_GAPS}</p>
            <p>{client.comparison === 'no-change' ? 'Net worth can change before you move a lever, through saving, interest, exchange-rate revaluation and write-offs. Foreign equity-price appreciation is still outside this extension.' : 'Net worth can change through saving, revaluations and write-offs. At the unchanged solved start those effects balance.'} Nominal and real level charts show the simulated economy; the observations above describe the outside world.</p>
          </section>
        </div>
        )}
      </section>
    </div>
  );
}

function ContextGroup({ title, rows }: { title: string; rows: readonly ContextRow[] }) {
  const id = useId();
  return (
    <section className="context-group" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <dl className="context-list">
        {rows.map((row) => (
          <div className="context-row" key={row.id}>
            <dt>{row.label}<span className={`context-status context-status-${row.status}`}>{statusLabel[row.status]}</span></dt>
            <dd>
              <div className="context-value mono">{row.value}</div>
              <div className="context-period small">{row.period}</div>
              <p className="context-detail muted small">{row.detail}</p>
              {row.sources && <div className="context-sources small">{row.sources.map((source, index) => <span key={source.url}>{index > 0 && ' · '}<a href={source.url} target="_blank" rel="noreferrer">{source.label}</a> ({contextDate(source.publishedOn)})</span>)}</div>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
