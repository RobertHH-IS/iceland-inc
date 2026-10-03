/**
 * Chart windows: what a small multiple or a big chart draws. Pure functions.
 *
 * Charts show an indicator in its display units (usually a deviation from baseline) over a
 * fixed window, by default the last 72 months. Before month 72 the line grows from the left,
 * afterwards the window scrolls. The zero line is the baseline; lever events are amber marks.
 */
import type { Id, ScenarioEvent } from '../../core/types.ts';
import type { IndicatorInfo, ModelInfo } from './info.ts';
import type { MoneyUnit } from './contract.ts';
import { priceYear } from './effects.ts';
import { leverValueLabel } from './levers.ts';
import { adaptiveDigits, fmtIndicator, fmtNum, MINUS } from './format.ts';

export type ReportBasis = 'nominal' | 'real' | 'deviation';
export const REPORT_BASES: { id: ReportBasis; label: string }[] = [
  { id: 'nominal', label: 'Nominal levels' },
  { id: 'real', label: 'Real levels' },
  { id: 'deviation', label: 'Change vs baseline' },
];

export function reportLabel(ind: IndicatorInfo, basis: ReportBasis): string {
  return basis === 'deviation' ? ind.label : (basis === 'real' ? ind.level?.realLabel ?? ind.level?.nominalLabel : ind.level?.nominalLabel) ?? ind.label;
}

/** A chart's unit, named once: "ISK bn a year", "%", "% vs no change". Where the model has a money
 *  unit, prices and indices are named by its year ("at 2025 prices", "index, 2025 = 100"). */
export function reportUnit(ind: IndicatorInfo, basis: ReportBasis, comparison: 'opening' | 'no-change' = 'opening', money?: MoneyUnit | null): string {
  const raw = basis === 'deviation' || !ind.level ? ind.unit : basis === 'real' ? ind.level.realUnit ?? ind.level.unit : ind.level.unit;
  let unit = raw.replace(/\bbn ISK\b/, 'ISK bn');
  // without a declared price year the prices are the start's, never "baseline"
  const year = money ? priceYear(money) ?? 'start' : null;
  if (year) unit = unit.replace('baseline prices', `${year} prices`).replace('baseline = 100', `${year} = 100`);
  return basis === 'deviation' && comparison === 'no-change' ? unit.replace('vs baseline', 'vs no change') : unit;
}

export function reportDescription(ind: IndicatorInfo, basis: ReportBasis): string {
  return basis === 'deviation' ? ind.description : (basis === 'real' ? ind.level?.realDescription ?? ind.level?.description : ind.level?.description) ?? ind.description;
}

/** A level as it is written: "8.00%", "104.9", "ISK 2,740 bn a year". For an amount, 'bare' leaves
 *  the unit out ("2,740"), where a chart names it once below, and 'card' is the number and its
 *  scale ("2,740 bn"), for a map card whose accessible name says the rest. */
export function fmtReport(value: number, ind: IndicatorInfo, basis: ReportBasis, style: 'full' | 'bare' | 'card' = 'full'): string {
  if (basis === 'deviation' || !ind.level) return fmtIndicator(value, ind.unit, ind.display);
  const level = ind.level;
  if (level.kind === 'rate' || level.kind === 'ratio') return `${fmtNum(value, level.kind === 'rate' ? 2 : 1)}%`;
  if (level.kind === 'index') return fmtNum(value, 1);
  if (!Number.isFinite(value)) return fmtNum(value);
  const digits = adaptiveDigits(value);
  const x = Math.abs(value) < 1e-9 ? 0 : value;
  const n = new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(x));
  if (style === 'bare') return `${x < 0 ? MINUS : ''}${n}`;
  if (style === 'card') return `${x < 0 ? MINUS : ''}${n} bn`;
  return `${x < 0 ? MINUS : ''}ISK ${n} bn${level.unit.includes('a year') ? ' a year' : ''}`;
}

export function reportRef(ind: IndicatorInfo, series: ArrayLike<number>, basis: ReportBasis): number {
  return basis !== 'deviation' && ind.level ? series[0] ?? 0 : chartRef(ind, series);
}

/** Keep trivial changes on a large level from filling the chart. Rates are in actual %. */
export function reportMinRange(ind: IndicatorInfo, series: ArrayLike<number>, basis: ReportBasis): number {
  if (basis === 'deviation' || !ind.level) return 0.02;
  return ind.level.kind === 'rate' ? 0.5 : ind.level.kind === 'ratio' ? 1 : ind.level.kind === 'index' ? 2 : Math.max(0.1, Math.abs(series[0] ?? 0) * 0.01);
}

export const CHART_SPAN = 72;

export interface ChartWindow {
  /** First and last month shown (inclusive); `span` months fit the width. */
  from: number;
  to: number;
  span: number;
  values: number[];
  /** Matching months of an evolving no-change path, if supplied. */
  referenceValues?: number[];
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
export function chartWindow(series: ArrayLike<number>, t: number, span = CHART_SPAN, ref = 0, minRange = 0.02, reference?: ArrayLike<number>): ChartWindow {
  const to = Math.max(0, Math.min(Math.round(t), series.length - 1));
  const from = Math.max(0, to - span);
  const values: number[] = [];
  for (let m = from; m <= to; m++) values.push(series[m]);
  const referenceValues = reference?.length ? Array.from({ length: to - from + 1 }, (_, i) => reference[from + i]) : undefined;
  if (referenceValues) ref = referenceValues.at(-1) ?? ref;
  let lo = ref,
    hi = ref;
  for (const v of [...values, ...(referenceValues ?? [])])
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
  return { from, to, span, values, ...(referenceValues ? { referenceValues } : {}), ref, lo: lo - pad, hi: hi + pad, last: values.length ? values[values.length - 1] : ref };
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
  if (w.referenceValues) {
    const point = (v: number, i: number) => `${r1(xAt(w, w.from + i, width))},${r1(yAt(w, Number.isFinite(v) ? v : w.ref, height))}`;
    const actual = w.values.map(point);
    const reference = w.referenceValues.map(point).reverse();
    return `M${actual.join(' L')} L${reference.join(' L')} Z`;
  }
  const y0 = r1(yAt(w, w.ref, height));
  const pts = w.values.map((v, i) => `${r1(xAt(w, w.from + i, width))},${r1(yAt(w, Number.isFinite(v) ? v : w.ref, height))}`);
  const x0 = r1(xAt(w, w.from, width)),
    x1 = r1(xAt(w, w.to, width));
  return `M${x0},${y0} L${pts.join(' L')} L${x1},${y0} Z`;
}

export interface EventMark {
  t: number;
  x: number;
  /** The month's last event: the lever the user changed last that month. */
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

/** A mark's tooltip: "Month 12: Key interest rate → 4% · Padlock on Key interest rate → Unlocked", the last event first.
 *  `month` names the month ("Sep 2027" on a dated model). */
export function eventMarkTitle(m: EventMark, info: Pick<ModelInfo, 'leverById'>, month: (t: number) => string = (t) => `Month ${t}`): string {
  const one = (e: EventMark['events'][number]) => {
    const l = info.leverById.get(e.lever);
    return `${l?.label ?? e.lever} ${e.fire ? 'triggered' : '→'} ${l ? leverValueLabel(l, e.value) : e.value}`;
  };
  return `${month(m.t)}: ${[...m.events].reverse().map(one).join(' · ')}`;
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
  // Headlines also belong in Overview; their original specialist tabs stay available.
  const overview = tabs.get('Overview');
  if (overview && indicators.some((ind) => ind.id === 'output')) {
    const featured = ['govDebtAmount', 'govDebt', 'mortgageDebt', 'broadMoney', 'exports', 'imports', 'currentAccount', 'govBalance', 'pfAssets', 'krona', 'businessCreditApproved', 'businessArrearsAmount', 'ponziDebtShare'];
    for (const id of featured) {
      const ind = indicators.find((x) => x.id === id);
      if (ind && !overview.indicators.some((x) => x.id === id)) overview.indicators.push(ind);
    }
    const first = ['output', 'keyRate', 'inflation', 'govDebtAmount', 'govDebt', 'unemployment', 'consumption', 'investment', 'broadMoney', 'mortgageDebt'];
    overview.indicators = [
      ...first.flatMap((id) => overview.indicators.filter((ind) => ind.id === id)),
      ...overview.indicators.filter((ind) => !first.includes(ind.id)),
    ];
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
  for (const v of [...w.values, ...(w.referenceValues ?? [])])
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
