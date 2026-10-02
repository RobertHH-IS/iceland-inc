/**
 * Charts: tabs from IndicatorDef.group; small multiples of actual nominal/real levels or the
 * legacy deviation over the last 72 months, with a baseline line and amber event marks. Click to open
 * its inspector. Only the open tab renders. The panel carries no notes: the measurement buttons say
 * what is drawn, and each chart names its own unit.
 */
import { memo, useMemo } from 'react';
import type { Id, ScenarioEvent } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';
import { CHART_SPAN, REPORT_BASES, chartTabs, chartWindow, fmtReport, reportDescription, reportLabel, reportMinRange, reportRef, reportUnit, type ReportBasis } from '../model/charts.ts';
import type { IndicatorInfo, ModelInfo } from '../model/info.ts';
import { signTone } from '../model/styling.ts';
import { ChartSvg } from './ChartSvg.tsx';
import type { OnSelect } from './common.tsx';

interface ChartsProps {
  info: ModelInfo;
  client: EngineClient;
  t: number;
  events: readonly ScenarioEvent[];
  tab: string | null;
  onTab: (id: string) => void;
  selected: Id | null;
  onSelect: OnSelect;
  basis?: ReportBasis;
  onBasis?: (basis: ReportBasis) => void;
}

export function Charts({ info, client, t, events, tab, onTab, selected, onSelect, basis = 'nominal', onBasis }: ChartsProps) {
  const tabs = useMemo(() => chartTabs(info.indicators), [info]);
  const active = tabs.find((x) => x.id === tab) ?? tabs[0];
  const hasLevels = info.indicators.some((ind) => ind.level);
  const measurement: ReportBasis = hasLevels ? basis : 'deviation';
  return (
    <section className="charts panel" aria-labelledby="charts-title">
      <div className="panel-head">
        <h2 id="charts-title">Charts</h2>
        <div className="tabs" role="tablist" aria-label="Chart groups">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" id={`tab-${x.id}`} aria-selected={x === active} aria-controls="charts-grid" className={`tab ${x === active ? 'on' : ''}`} onClick={() => onTab(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        {onBasis && hasLevels && <div className="report-basis" role="group" aria-label="Chart measurement">
          {REPORT_BASES.map((x) => <button key={x.id} type="button" className={`tab ${basis === x.id ? 'on' : ''}`} aria-pressed={basis === x.id} onClick={() => onBasis(x.id)}>{x.id === 'deviation' && client.comparison === 'no-change' ? 'Effect vs no change' : x.label}</button>)}
        </div>}
        {!hasLevels && <span className="muted small charts-note">change vs baseline</span>}
      </div>
      <div className="panel-body scroll">
        {active ? (
          <div className="chart-grid" id="charts-grid" role="tabpanel" aria-labelledby={`tab-${active.id}`}>
            {active.indicators.map((ind) => (
              <SmallChart key={ind.id} info={info} ind={ind} basis={measurement} comparison={client.comparison} series={client.reportSeries(ind.id, measurement)} reference={client.referenceReportSeries?.(ind.id, measurement)} t={t} events={events} selected={selected === ind.id} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          <p className="muted">This model has no charts.</p>
        )}
      </div>
    </section>
  );
}

interface SmallChartProps {
  info: ModelInfo;
  ind: IndicatorInfo;
  series: readonly number[];
  reference?: readonly number[];
  t: number;
  events: readonly ScenarioEvent[];
  selected: boolean;
  onSelect: OnSelect;
  basis: ReportBasis;
  comparison?: 'opening' | 'no-change';
}

const SmallChart = memo(function SmallChart({ info, ind, series, reference, basis, comparison, t, events, selected, onSelect }: SmallChartProps) {
  const win = chartWindow(series, t, CHART_SPAN, reportRef(ind, series, basis), reportMinRange(ind, series, basis), reference);
  const text = fmtReport(win.last, ind, basis);
  const label = reportLabel(ind, basis), unit = reportUnit(ind, basis, comparison);
  const tone = signTone(win.last - win.ref);
  return (
    <button type="button" className={`chart${selected ? ' selected' : ''}`} data-indicator={ind.id} onClick={() => onSelect({ kind: 'indicator', id: ind.id })} aria-label={`${label}: ${text}, ${unit}. Open this chart`} title={`${reportDescription(ind, basis)} ${comparison === 'no-change' ? 'No change at this month' : 'Baseline'}: ${fmtReport(win.ref, ind, basis)}.`}>
      <span className="chart-head">
        <span className="chart-label">{label}</span>
        <span className={`chart-val mono tone-${tone}`}>{text}</span>
      </span>
      <span className="chart-unit muted small">{unit}</span>
      <ChartSvg win={win} events={events} info={info} />
    </button>
  );
});
