import type { EngineClient } from '../engine-client.ts';
import { CURRENT_DATA, observationStatus, observationValue, startingDataComparison, type EconomicObservation } from '../model/current-data.ts';
import { contextDate } from '../model/economic-context.ts';

/** Extends the existing context panel; it never applies observations as lever events. */
export function CurrentDataAudit({ client }: { client: EngineClient }) {
  if (client.info.id !== 'iceland' && !client.info.paramById.has('growthReal')) return null;
  const comparisons = startingDataComparison(client);
  const groups = [...new Set(comparisons.map((row) => row.group))];
  const observationGroups = [...new Set(CURRENT_DATA.records.map((row) => row.group))];
  return (
    <section className="context-group current-data-audit" aria-label="Complete starting-data comparison">
      <h3>All {comparisons.length} charts: model start &amp; latest Iceland data</h3>
      <p className="small muted">The middle column is this simulation’s unchanged month-zero value. The measured references retain their dates and definitions. An index of 100, a forecast, an advertised loan rate and an observed stock each mean different things.</p>
      {groups.map((group) => (
        <details className="context-audit-group" key={group} open={group === 'Overview'}>
          <summary>{group} <span className="muted small">{comparisons.filter((row) => row.group === group).length} charts</span></summary>
          <div className="context-audit-table-wrap">
            <table className="context-audit-table">
              <thead><tr><th scope="col">Chart</th><th scope="col">Model start</th><th scope="col">Latest published reference &amp; definition</th></tr></thead>
              <tbody>{comparisons.filter((row) => row.group === group).map((row) => (
                <tr key={row.id} data-indicator={row.id}>
                  <th scope="row">{row.label}</th>
                  <td className="context-audit-model"><span className="mono">{row.modelValue}</span><span className="small muted context-audit-unit">{row.modelUnit}</span></td>
                  <td className="context-audit-reference">
                    {row.observations.map((record) => <Observation key={record.id} record={record} />)}
                    {row.comparability !== 'reference' && <span className="context-status context-status-forecast">{row.comparability === 'gap' ? 'No matching observation' : 'Different scope / proxy'}</span>}
                    <p className="small muted context-audit-qualification">{row.qualification}</p>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      ))}
      <details className="context-audit-group context-source-catalogue">
        <summary>Full source catalogue <span className="muted small">{CURRENT_DATA.records.length} dated records</span></summary>
        <p className="small muted">Latest available information as of {contextDate(CURRENT_DATA.asOf)}. Some annual observations cover 2024 or 2025; every forecast and calculation is labelled.</p>
        {observationGroups.map((group) => (
          <details className="context-audit-group" key={group}>
            <summary>{group}</summary>
            <div className="context-source-records">{CURRENT_DATA.records.filter((record) => record.group === group).map((record) => <Observation key={record.id} record={record} full />)}</div>
          </details>
        ))}
      </details>
    </section>
  );
}

function Observation({ record, full = false }: { record: EconomicObservation; full?: boolean }) {
  return (
    <div className="context-observation" data-observation={record.id}>
      <div className="small">{record.label}</div>
      <strong className="mono">{observationValue(record)}</strong>
      <div className="small context-period">{record.observationPeriod} · {observationStatus(record)}</div>
      {record.sourceUrl && <div className="small"><a href={record.sourceUrl} target="_blank" rel="noreferrer">{record.sourceLabel}</a>{record.publishedDate ? ` · published / updated ${contextDate(record.publishedDate)}` : ' · release / update date not verified'}</div>}
      {full && record.notes && <p className="small muted">{record.notes}</p>}
    </div>
  );
}
