/**
 * Amounts and changes on a model that opens on a dated month 0 (docs/design/today-opening.md §6
 * and §7). Pure functions.
 *
 *   Level              the run's value: × the money unit for money (ISK bn, a year for flows),
 *                      × 100 for a rate held as a fraction
 *   Today's value      the same at month 0; it never changes with a lever
 *   No-change path     the same model from the same month 0, with no lever moved
 *   Change since today (now − today) ÷ |today| in %, or pp for rates
 *   Effect             (now − no change) ÷ |no change| at the same month in %, or pp for rates
 *
 * Beside an amount there are at most two changes: the change since today, from month 1, and the
 * effect against the no-change path, only once a lever has moved. With no lever moved every
 * effect is exactly 0, and at month 0 every change since today is 0, so neither is shown.
 * The denominators are magnitudes, so a negative amount that falls (a deficit that deepens, a net
 * worth below zero that sinks further) reads as a fall.
 *
 * A percentage is only meaningful against a sizeable amount of the same sign. An amount that
 * crosses zero, or whose reference is small (below the measure's floor, or below a tenth of the
 * amount now), is compared as a difference in its own unit ("+ISK 38.5 bn a year"); so is a
 * quantity centred on zero (log points, a ratio, a share of the population), always.
 */
import type { FlowKind, ScenarioEvent } from '../../core/types.ts';
import type { CalendarMonth, MoneyUnit } from './contract.ts';
import { adaptiveDigits, fmtNum, fmtSigned, fmtValue, MINUS, unitKind } from './format.ts';
import type { Tone } from './styling.ts';

export type { CalendarMonth, MoneyUnit } from './contract.ts';

/** 'difference': a quantity centred on zero, whose change is a difference in its own unit. */
export type EffectKind = 'amount' | 'index' | 'rate' | 'difference';

/** A change: in % of the reference, in pp for a rate, or (`level`) a difference in the value's own
 *  level unit (ISK bn for money). */
export interface Change {
  value: number;
  unit: '%' | 'pp' | 'level';
}

/** How a difference in level units is written: in full ("+ISK 38.5 bn a year"), for a row
 *  ("+ISK 38.5 bn/yr"), for a card ("+38.5 bn") or under a header that names the unit ("+38.5").
 *  null when it rounds to nothing. */
export type DiffStyle = 'text' | 'short' | 'card' | 'bare';

/** How changes in one measure are taken and written: its kind, the smallest reference a
 *  percentage is taken of (in level units), and how a difference is written. A Measure is one. */
export interface ChangeScale {
  kind: EffectKind;
  floor?: number;
  diff?: (d: number, style: DiffStyle) => string | null;
}

/** Below this a denominator counts as zero: no percentage change is meaningful. */
const TINY = 1e-9;
/** A reference smaller than this share of the amount now gives no meaningful percentage
 *  (a deficit of ISK 3 bn that becomes 42 bn is not "+1,187%"). */
const SMALL_SHARE = 0.1;

const scaleOf = (s: EffectKind | ChangeScale): ChangeScale => (typeof s === 'string' ? { kind: s } : s);

function relative(scale: EffectKind | ChangeScale, now: number, ref: number): Change | null {
  if (!Number.isFinite(now) || !Number.isFinite(ref)) return null;
  const { kind, floor = 0 } = scaleOf(scale);
  if (kind === 'rate') return { value: now - ref, unit: 'pp' };
  if (kind === 'difference') return { value: now - ref, unit: 'level' };
  if (kind === 'index') return Math.abs(ref) > TINY ? { value: ((now - ref) / Math.abs(ref)) * 100, unit: '%' } : null;
  const size = Math.abs(ref);
  if (!(size > TINY) || now * ref < 0 || size < floor || size < SMALL_SHARE * Math.abs(now)) return { value: now - ref, unit: 'level' };
  return { value: ((now - ref) / size) * 100, unit: '%' };
}

/** The change since today: amounts and indices in % of today's (month-0) value, rates in pp, and
 *  a difference where a percentage means nothing (see above). null for an index at ~0. */
export function sinceToday(kind: EffectKind | ChangeScale, now: number, today: number): Change | null {
  return relative(kind, now, today);
}

/** The effect of the levers moved: amounts and indices in % of the no-change value at the same
 *  month, rates in pp, and a difference where a percentage means nothing. */
export function effect(kind: EffectKind | ChangeScale, now: number, noChange: number): Change | null {
  return relative(kind, now, noChange);
}

/** A difference with no measure to write it: signed, to about three figures. */
function plainDiff(d: number): string | null {
  const digits = Math.min(3, adaptiveDigits(d));
  return Math.abs(d) < 0.5 * 10 ** -digits ? null : fmtSigned(d, digits);
}

/** A change as it is written beside an amount ("+0.5%", "−0.40 pp", "+ISK 38.5 bn a year"), or
 *  null when it rounds to zero at that precision: a change too small to read is not shown. */
export function fmtChangeOf(c: Change | null, scale?: EffectKind | ChangeScale, style: DiffStyle = 'text'): string | null {
  if (!c) return null;
  if (c.unit === 'level') {
    const diff = scale ? scaleOf(scale).diff : undefined;
    return diff ? diff(c.value, style) : plainDiff(c.value);
  }
  const digits = c.unit === 'pp' ? 2 : Math.abs(c.value) >= 10 ? 0 : 1;
  if (Math.abs(c.value) < 0.5 * 10 ** -digits) return null;
  return c.unit === 'pp' ? `${fmtSigned(c.value, digits)} pp` : `${fmtSigned(c.value, digits)}%`;
}

/** A change for a card, where room is short: "−1.7%", "+1.9pp", "+38.5 bn". */
export function fmtCardChange(c: Change | null, scale?: EffectKind | ChangeScale): string | null {
  if (!c) return null;
  if (c.unit === 'pp') return Math.abs(c.value) < 0.05 ? null : `${fmtSigned(c.value, 1)}pp`;
  return fmtChangeOf(c, scale, 'card');
}

const grouped = (v: number, digits: number) =>
  new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(v));

/** Model money in the currency: "ISK 2,113 bn", "ISK 2,740 bn a year", "−ISK 147.5 bn a year".
 *  `short` writes "a year" as "/yr", for a row; `card` is the number and its scale alone
 *  ("2,740 bn"), for a map card whose accessible name says the rest; `number` is the number alone. */
export function money(unit: MoneyUnit, x: number, flow: boolean): { value: number; text: string; short: string; card: string; number: string } {
  const value = x * unit.perUnit;
  if (!Number.isFinite(value)) return { value, text: fmtNum(value), short: fmtNum(value), card: fmtNum(value), number: fmtNum(value) };
  const digits = Math.min(2, adaptiveDigits(value));
  const zero = Math.abs(value) < 0.5 * 10 ** -digits;
  const sign = zero || value > 0 ? '' : MINUS;
  const n = grouped(zero ? 0 : value, digits);
  const [currency, ...rest] = unit.label.split(' ');
  const body = `${sign}${currency} ${n}${rest.length ? ` ${rest.join(' ')}` : ''}`;
  const scale = rest.length ? ` ${rest.join(' ')}` : '';
  return { value, text: flow ? `${body} a year` : body, short: flow ? `${body}/yr` : body, card: `${sign}${n}${scale}`, number: `${sign}${n}` };
}

/** The year of the prices the money unit is measured at ("2025"): its declared `priceYear`, else
 *  the year of the GDP its basis names ("2025 GDP at current prices"); never any other year the
 *  basis mentions (a vintage, a release date). null when neither is given. */
export function priceYear(unit: MoneyUnit): string | null {
  if (unit.priceYear !== undefined) return String(unit.priceYear);
  return unit.basis.match(/\b((?:19|20)\d\d) GDP\b/)?.[1] ?? null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The calendar month `t` months after month 0. */
export function calendarMonth(month0: CalendarMonth, t: number): CalendarMonth {
  const k = month0.month - 1 + Math.round(t);
  return { year: month0.year + Math.floor(k / 12), month: ((k % 12) + 12) % 12 + 1 };
}

/** "September 2026" (long) or "Sep 2026" (short) for model month `t`. */
export function calendarLabel(month0: CalendarMonth, t: number, style: 'long' | 'short'): string {
  const c = calendarMonth(month0, t);
  const name = MONTHS[c.month - 1];
  return `${style === 'long' ? name : name.slice(0, 3)} ${c.year}`;
}

/** The model months in 0..horizon that are Januaries: the timeline's year ticks. */
export function januaries(month0: CalendarMonth, horizon: number): { t: number; year: number }[] {
  const out: { t: number; year: number }[] = [];
  for (let t = (13 - month0.month) % 12; t <= horizon; t += 12) if (t > 0) out.push({ t, year: calendarMonth(month0, t).year });
  return out;
}

/* ---------------------------------------------------------------- display */

/** How one model's numbers are written. A model with a calendar opens on a dated month 0: months
 *  are calendar months, money is in the currency and changes are read against today. */
export interface Display {
  month0: CalendarMonth | null;
  money: MoneyUnit | null;
  /** The comparison is a no-change run that moves (a growing economy, a dated opening). */
  moving: boolean;
  /** "since Sep 2026": what a change since today is called. */
  since: string;
}

export function displayOf(c: { calendar?: CalendarMonth | null; moneyUnit?: MoneyUnit | null; comparison?: 'opening' | 'no-change' }): Display {
  const month0 = c.calendar ?? null;
  return { month0, money: c.moneyUnit ?? null, moving: c.comparison === 'no-change', since: month0 ? `since ${calendarLabel(month0, 0, 'short')}` : 'since the start' };
}

/** A model that opens on a dated month 0. */
export const isDated = (d: Display): boolean => d.month0 !== null;

/** Month `t` on the clock: "September 2026" on a dated model, else "Month 12". */
export function monthLabel(d: Display, t: number, style: 'long' | 'short' = 'short'): string {
  return d.month0 ? calendarLabel(d.month0, t, style) : `Month ${Math.round(t)}`;
}

/** Has a lever moved before month `t`? A lever set in month t acts from month t + 1, so its
 *  effect shows from then (and not at a month the timeline has gone back to before it). */
export function leverMoved(events: readonly ScenarioEvent[], t: number): boolean {
  return events.some((e) => e.t < t);
}

/** What a model value measures, and how to write it and its changes. */
export interface Measure extends ChangeScale {
  /** A money amount shown in the currency. */
  money: boolean;
  /** The value as a level: in the currency for money, in % for a rate held as a fraction. */
  level(x: number): number;
  /** "ISK 2,740 bn a year", "8.00%", "1.042". */
  text(x: number): string;
  /** For a card: "ISK 2,740 bn/yr", "8.00%". */
  short(x: number): string;
  /** For a table whose header names the unit: "2,740", "8.00%". */
  bare(x: number): string;
  floor: number;
  diff(d: number, style: DiffStyle): string | null;
}

const MONEY_UNIT = /^% of (?:baseline |opening )?GDP(\/yr| a year| per year)?$/;
/** Quantities centred on zero: their changes are differences in their own unit, never a %. */
const CENTRED_UNIT = /^(?:log points|ratio)\b/;
/** The smallest money amount, in model units (0.25% of GDP, about ISK 12 bn), that a percentage
 *  change is taken of. */
const MONEY_FLOOR = 0.25;
/** A money difference smaller than this (ISK 0.05 bn) is not written. */
const MONEY_DUST = 0.05;

/** How a value in `unit` is written on this display. Money ('% of GDP/yr', '% of GDP') is in the
 *  currency where the model has a money unit, a real quantity (`scale` 'real') at the money unit's
 *  prices; a rate held as a fraction is in %; anything else keeps its unit. A share of a population
 *  ('% of adult population'), log points and ratios are centred on zero: their changes are
 *  differences (pp for a share). `kind` 'difference' makes any measure one (a revaluation). */
export function measureOf(d: Display, unit: string, scale?: 'nominal' | 'real' | 'none', kind?: 'difference'): Measure {
  const u = unit.trim();
  const m = d.money ? u.match(MONEY_UNIT) : null;
  if (m && d.money) {
    const unitM = d.money, flow = !!m[1];
    const year = scale === 'real' ? priceYear(unitM) : null;
    const tail = scale === 'real' ? ` at ${year ? `${year} ` : 'start '}prices` : '';
    const diff = (x: number, style: DiffStyle): string | null => {
      if (!(Math.abs(x) >= MONEY_DUST)) return null;
      const w = money(unitM, x / unitM.perUnit, flow);
      const body = style === 'text' ? w.text : style === 'short' ? w.short : style === 'card' ? w.card : w.number;
      return x > 0 ? `+${body}` : body;
    };
    return {
      kind: kind ?? 'amount',
      money: true,
      floor: MONEY_FLOOR * unitM.perUnit,
      level: (x) => x * unitM.perUnit,
      text: (x) => money(unitM, x, flow).text + tail,
      short: (x) => money(unitM, x, flow).short,
      bare: (x) => money(unitM, x, flow).number,
      diff,
    };
  }
  const k = unitKind(u);
  const share = k === 'percent';
  const centred = share || CENTRED_UNIT.test(u) || kind === 'difference';
  const effectKind: EffectKind = k === 'fraction' || k === 'percentRate' || k === 'pp' ? 'rate' : centred ? 'difference' : k === 'index' ? 'index' : 'amount';
  const short = (x: number) => (k === 'fraction' ? `${fmtNum(x * 100, 2)}%` : k === 'index' ? fmtNum(x, 3) : fmtValue(x, u));
  const diff = (x: number, style: DiffStyle): string | null => {
    const digits = share ? 2 : centred ? 3 : Math.min(2, adaptiveDigits(x));
    if (!(Math.abs(x) >= 0.5 * 10 ** -digits)) return null;
    const n = fmtSigned(x, digits);
    if (style === 'bare' || style === 'card') return share ? `${n}pp` : n;
    return share ? `${n} pp` : u ? `${n} ${u}` : n;
  };
  return { kind: effectKind, money: false, floor: 0, level: (x) => (k === 'fraction' ? x * 100 : x), text: (x) => fmtValue(x, u), short, bare: short, diff };
}

/** A flow of money of this kind, in the currency a year. A revaluation or a write-off is a change
 *  in value that swings around zero, so its changes are differences, never a %. */
export function flowMeasure(d: Display, kind: FlowKind = 'cash'): Measure {
  return measureOf(d, '% of GDP/yr', undefined, kind === 'cash' || kind === 'accrual' ? undefined : 'difference');
}

export interface ChangeNote {
  kind: 'since' | 'effect';
  /** "+0.5% since Sep 2026", "−0.4% vs no change". */
  text: string;
  /** The change alone, for a table whose header names the unit: "+0.5%", "+38.5". */
  change: string;
  tone: Tone;
}

/** The one change a compact row shows: the effect against the no-change path (`ref`) once a lever
 *  has moved, else the change since today (`ref` is then today's value) from month 1. A difference
 *  is written for a row (`style`), or bare under a header that names the unit. */
export function oneChange(t: number, moved: boolean, scale: EffectKind | ChangeScale, now: number, ref: number, style: DiffStyle = 'short'): { change: string; tone: Tone } | null {
  if (!moved && t < 1) return null;
  const c = moved ? effect(scale, now, ref) : sinceToday(scale, now, ref);
  const change = fmtChangeOf(c, scale, style);
  return change && c ? { change, tone: c.value > 0 ? 'up' : 'down' } : null;
}

/** The changes written beside an amount at month `t`: since today from month 1, and the effect
 *  against the no-change path once a lever has moved. Values are levels (Measure.level). */
export function changeNotes(d: Display, t: number, moved: boolean, scale: EffectKind | ChangeScale, now: number, today: number, noChange: number): ChangeNote[] {
  const out: ChangeNote[] = [];
  const add = (k: ChangeNote['kind'], c: Change | null, label: string) => {
    const text = fmtChangeOf(c, scale, 'text');
    if (text && c) out.push({ kind: k, text: `${text} ${label}`, change: fmtChangeOf(c, scale, 'bare') ?? text, tone: c.value > 0 ? 'up' : 'down' });
  };
  if (t >= 1) add('since', sinceToday(scale, now, today), d.since);
  if (moved) add('effect', effect(scale, now, noChange), 'vs no change');
  return out;
}
