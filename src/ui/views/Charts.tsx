/**
 * Charts: tabs from IndicatorDef.group; small multiples of the deviation from baseline over
 * the last 72 months, with a zero line and amber marks at lever events. Click a chart to open
 * its inspector. Only the open tab renders.
 */
import { memo, useMemo } from 'react';
import type { Id, ScenarioEvent } from '../../core/types.ts';
import type { EngineClient } from '../engine-client.ts';
import { CHART_SPAN, chartRef, chartTabs, chartWindow } from '../model/charts.ts';
import { fmtIndicator } from '../model/format.ts';
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
}

export function Charts({ info, client, t, events, tab, onTab, selected, onSelect }: ChartsProps) {
  const tabs = useMemo(() => chartTabs(info.indicators), [info]);
  const active = tabs.find((x) => x.id === tab) ?? tabs[0];
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
        <span className="muted small charts-note">change vs baseline</span>
      </div>
      <div className="panel-body scroll">
        {active ? (
          <div className="chart-grid" id="charts-grid" role="tabpanel" aria-labelledby={`tab-${active.id}`}>
            {active.indicators.map((ind) => (
              <SmallChart key={ind.id} info={info} ind={ind} series={client.series(ind.id)} t={t} events={events} selected={selected === ind.id} onSelect={onSelect} />
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
  t: number;
  events: readonly ScenarioEvent[];
  selected: boolean;
  onSelect: OnSelect;
}

const SmallChart = memo(function SmallChart({ info, ind, series, t, events, selected, onSelect }: SmallChartProps) {
  const win = chartWindow(series, t, CHART_SPAN, chartRef(ind, series));
  const text = fmtIndicator(win.last, ind.unit, ind.display);
  const tone = signTone(win.last - win.ref);
  return (
    <button type="button" className={`chart${selected ? ' selected' : ''}`} onClick={() => onSelect({ kind: 'indicator', id: ind.id })} aria-label={`${ind.label}: ${text}. Open this chart`} title={ind.description}>
      <span className="chart-head">
        <span className="chart-label">{ind.label}</span>
        <span className={`chart-val mono tone-${tone}`}>{text}</span>
      </span>
      <ChartSvg win={win} events={events} info={info} />
    </button>
  );
});
