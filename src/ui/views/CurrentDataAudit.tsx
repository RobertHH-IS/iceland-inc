import type { EngineClient } from '../engine-client.ts';
import { observationStatus, observationValue, startingDataComparison, type EconomicObservation } from '../model/current-data.ts';
import { contextDate } from '../model/economic-context.ts';
import { calendarLabel } from '../model/effects.ts';

/**
 * Extends the existing context panel; it never applies observations as lever events. Each chart
 * shows the observations mapped to it and nothing more: the full dated catalogue (over a thousand
 * records) stays in data/iceland as the audit record, not as a list in the interface.
 */
export function CurrentDataAudit({ client }: { client: EngineClient }) {
  if (client.info.id !== 'iceland' && !client.info.paramById.has('growthReal')) return null;
  const comparisons = startingDataComparison(client);
  const groups = [...new Set(comparisons.map((row) => row.group))];
  const month0 = client.calendar;
  return (
    <section className="context-group current-data-audit" aria-label="Complete starting-data comparison">
      {month0 ? <h3>Each chart at the start, beside its records</h3> : <h3>All {comparisons.length} charts: model start &amp; latest Iceland data</h3>}
      {!month0 && <p className="small muted">The middle column is this simulation’s unchanged month-zero value. The measured references retain their dates and definitions. An index of 100, a forecast, an advertised loan rate and an observed stock each mean different things.</p>}
      {groups.map((group) => (
        <details className="context-audit-group" key={group} open={group === 'Overview'}>
          <summary>{group} <span className="muted small">{comparisons.filter((row) => row.group === group).length} charts</span></summary>
          <div className="context-audit-table-wrap">
            <table className="context-audit-table">
              <thead><tr><th scope="col">Chart</th><th scope="col">{month0 ? `Model, ${calendarLabel(month0, 0, 'short')}` : 'Model start'}</th><th scope="col">{month0 ? 'Published records' : <>Latest published reference &amp; definition</>}</th></tr></thead>
              <tbody>{comparisons.filter((row) => row.group === group).map((row) => (
                <tr key={row.id} data-indicator={row.id}>
                  <th scope="row">{row.label}</th>
                  <td className="context-audit-model"><span className="mono">{row.modelValue}</span><span className="small muted context-audit-unit">{row.modelUnit}</span></td>
                  <td className="context-audit-reference">
                    {row.observations.map((record) => <Observation key={record.id} record={record} use={month0 ? (row.used.has(record.id) ? 'used for the start' : 'for comparison') : undefined} />)}
                    {row.comparability !== 'reference' && <span className="context-status context-status-forecast">{row.comparability === 'gap' ? 'No matching observation' : 'Different scope / proxy'}</span>}
                    <p className="small muted context-audit-qualification">{row.qualification}</p>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}

/** `use`: on a dated opening, whether the opening was built from the record or it is there for comparison. */
function Observation({ record, use }: { record: EconomicObservation; use?: string }) {
  return (
    <div className="context-observation" data-observation={record.id}>
      <div className="small">{record.label}{use && <span className={`context-use${use === 'used for the start' ? ' used' : ''}`}>{use}</span>}</div>
      <strong className="mono">{observationValue(record)}</strong>
      <div className="small context-period">{record.observationPeriod} · {observationStatus(record)}</div>
      {record.sourceUrl && <div className="small"><a href={record.sourceUrl} target="_blank" rel="noreferrer">{record.sourceLabel}</a>{record.publishedDate ? ` · published / updated ${contextDate(record.publishedDate)}` : ' · release / update date not verified'}</div>}
    </div>
  );
}
