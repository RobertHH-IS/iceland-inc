/**
 * Chart windows: what a small multiple or a big chart draws. Pure functions.
 *
 * Charts show an indicator in its display units (usually a deviation from baseline) over a
 * fixed window, by default the last 72 months. Before month 72 the line grows from the left,
 * afterwards the window scrolls. The zero line is the baseline; lever events are amber marks.
 */
import type { Id, ScenarioEvent } from '../../core/types.ts';
import type { IndicatorInfo, ModelInfo } from './info.ts';
import { leverValueLabel } from './levers.ts';

export const CHART_SPAN = 72;

export interface ChartWindow {
  /** First and last month shown (inclusive); `span` months fit the width. */
  from: number;
  to: number;
  span: number;
  values: number[];
  /** Reference line: 0 for deviations, the baseline level for 'level' indicators. */
  ref: number;
  /** y-range, always containing the reference line, padded and at least `minRange` tall. */
  lo: number;
  hi: number;
  last: number;
}

/**
 * The window of `series` (month-indexed, display units) ending at month `t`.
 * `minRange` stops a flat baseline from amplifying floating-point dust into a wiggle.
 */
export function chartWindow(series: ArrayLike<number>, t: number, span = CHART_SPAN, ref = 0, minRange = 0.02): ChartWindow {
  const to = Math.max(0, Math.min(Math.round(t), series.length - 1));
  const from = Math.max(0, to - span);
  const values: number[] = [];
  for (let m = from; m <= to; m++) values.push(series[m]);
  let lo = ref,
    hi = ref;
  for (const v of values)
    if (Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  if (hi - lo < minRange) {
    const c = (hi + lo) / 2;
    lo = c - minRange / 2;
    hi = c + minRange / 2;
    if (ref < lo) lo = ref;
    if (ref > hi) hi = ref;
  }
  const pad = (hi - lo) * 0.08;
  return { from, to, span, values, ref, lo: lo - pad, hi: hi + pad, last: values.length ? values[values.length - 1] : ref };
}

export function xAt(w: ChartWindow, month: number, width: number): number {
  return ((month - w.from) / w.span) * width;
}

export function yAt(w: ChartWindow, v: number, height: number): number {
  const span = w.hi - w.lo || 1;
  return height - ((v - w.lo) / span) * height;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** SVG path data for the line ("M x,y L x,y …"); gaps where values are not finite. */
export function linePath(w: ChartWindow, width: number, height: number): string {
  let d = '';
  let pen = false;
  w.values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = r1(xAt(w, w.from + i, width)),
      y = r1(yAt(w, v, height));
    d += `${pen ? 'L' : 'M'}${x},${y} `;
    pen = true;
  });
  return d.trim();
}

/** Closed area between the line and the reference line (for a soft fill). */
export function areaPath(w: ChartWindow, width: number, height: number): string {
  if (w.values.length < 2) return '';
  const y0 = r1(yAt(w, w.ref, height));
  const pts = w.values.map((v, i) => `${r1(xAt(w, w.from + i, width))},${r1(yAt(w, Number.isFinite(v) ? v : w.ref, height))}`);
  const x0 = r1(xAt(w, w.from, width)),
    x1 = r1(xAt(w, w.to, width));
  return `M${x0},${y0} L${pts.join(' L')} L${x1},${y0} Z`;
}

export interface EventMark {
  t: number;
  x: number;
  /** The month's last event: the lever the user changed (the panel records resets first). */
  lever: Id;
  value: number;
  fire: boolean;
  /** Every event of the month, in the order they were recorded. */
  events: { lever: Id; value: number; fire: boolean }[];
}

/** Lever events inside the window, as x positions: one mark per month, carrying all its events. */
export function eventMarks(events: readonly ScenarioEvent[], w: ChartWindow, width: number): EventMark[] {
  const byMonth = new Map<number, EventMark>();
  for (const e of events) {
    if (e.t < w.from || e.t > w.to) continue;
    const ev = { lever: e.lever, value: e.value, fire: !!e.fire };
    const m = byMonth.get(e.t);
    if (m) {
      m.events.push(ev);
      Object.assign(m, ev);
    } else byMonth.set(e.t, { t: e.t, x: xAt(w, e.t, width), ...ev, events: [ev] });
  }
  return [...byMonth.values()];
}

/** A mark's tooltip: "Month 12: Stabilisers → Automatic · Key interest rate → 3%", the last event first. */
export function eventMarkTitle(m: EventMark, info: Pick<ModelInfo, 'leverById'>): string {
  const one = (e: EventMark['events'][number]) => {
    const l = info.leverById.get(e.lever);
    return `${l?.label ?? e.lever} ${e.fire ? 'applied' : '→'} ${l ? leverValueLabel(l, e.value) : e.value}`;
  };
  return `Month ${m.t}: ${[...m.events].reverse().map(one).join(' · ')}`;
}

export interface ChartTab {
  id: string;
  label: string;
  indicators: IndicatorInfo[];
}

/** Chart tabs from IndicatorDef.group, in order of first appearance. */
export function chartTabs(indicators: IndicatorInfo[]): ChartTab[] {
  const tabs = new Map<string, ChartTab>();
  for (const ind of indicators) {
    const g = ind.group || 'Charts';
    let tab = tabs.get(g);
    if (!tab) {
      tab = { id: g, label: g, indicators: [] };
      tabs.set(g, tab);
    }
    tab.indicators.push(ind);
  }
  return [...tabs.values()];
}

/** Reference value for an indicator's chart: its baseline for 'level' displays, else 0. */
export function chartRef(ind: Pick<IndicatorInfo, 'display'>, series: ArrayLike<number>): number {
  return ind.display === 'level' ? (series.length ? series[0] : 0) : 0;
}

/** Tick values for a y-axis: the reference line and the extremes of the window. */
export function yTicks(w: ChartWindow): number[] {
  let lo = Infinity,
    hi = -Infinity;
  for (const v of w.values)
    if (Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  const ticks = [w.ref];
  const tol = (w.hi - w.lo) * 0.12;
  if (Number.isFinite(hi) && Math.abs(hi - w.ref) > tol) ticks.push(hi);
  if (Number.isFinite(lo) && Math.abs(lo - w.ref) > tol) ticks.push(lo);
  return ticks;
}
