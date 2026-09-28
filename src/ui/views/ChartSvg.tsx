/**
 * Chart drawing shared by the small multiples and the inspector's big chart.
 */
import { memo } from 'react';
import type { ScenarioEvent } from '../../core/types.ts';
import { areaPath, eventMarks, linePath, yAt, yTicks, type ChartWindow } from '../model/charts.ts';
import { fmtNum } from '../model/format.ts';
import type { ModelInfo } from '../model/info.ts';
import { leverValueLabel } from '../model/levers.ts';

interface SparkProps {
  win: ChartWindow;
  events: readonly ScenarioEvent[];
  info: ModelInfo;
  width?: number;
  height?: number;
  axes?: boolean;
  unit?: string;
}

/** The line, the reference (zero) line and amber marks at lever events. */
export const ChartSvg = memo(function ChartSvg({ win, events, info, width = 160, height = 54, axes = false, unit = '' }: SparkProps) {
  const padL = axes ? 44 : 0,
    padB = axes ? 16 : 0,
    padT = axes ? 6 : 2;
  const W = width - padL,
    H = height - padB - padT;
  const y0 = yAt(win, win.ref, H);
  const tone = win.last - win.ref > 1e-9 ? 'up' : win.last - win.ref < -1e-9 ? 'down' : 'flat';
  const marks = eventMarks(events, win, W);
  const ticks = axes ? yTicks(win) : [];
  return (
    <svg className={`chart-svg tone-${tone}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={axes ? 'xMidYMid meet' : 'none'} aria-hidden="true">
      <g transform={`translate(${padL},${padT})`}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line className={i === 0 ? 'zero' : 'grid'} x1={0} x2={W} y1={yAt(win, v, H)} y2={yAt(win, v, H)} vectorEffect="non-scaling-stroke" />
            <text className="axis" x={-6} y={yAt(win, v, H) + 3.5} textAnchor="end">
              {fmtNum(v)}
              {i === 0 && unit ? ` ${unit}` : ''}
            </text>
          </g>
        ))}
        {!axes && <line className="zero" x1={0} x2={W} y1={y0} y2={y0} vectorEffect="non-scaling-stroke" />}
        {marks.map((m) => {
          const l = info.leverById.get(m.lever);
          return (
            <line key={m.t} className="evmark" x1={m.x} x2={m.x} y1={0} y2={H} vectorEffect="non-scaling-stroke">
              <title>{`Month ${m.t}: ${l?.label ?? m.lever} ${m.fire ? 'applied' : '→'} ${l ? leverValueLabel(l, m.value) : m.value}`}</title>
            </line>
          );
        })}
        <path className="area" d={areaPath(win, W, H)} />
        <path className="line" d={linePath(win, W, H)} vectorEffect="non-scaling-stroke" />
        {axes && (
          <>
            <text className="axis" x={0} y={H + 13}>
              M{win.from}
            </text>
            <text className="axis" x={W} y={H + 13} textAnchor="end">
              M{win.to}
            </text>
          </>
        )}
      </g>
    </svg>
  );
});
