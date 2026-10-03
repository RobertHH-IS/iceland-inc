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
 */
import type { ScenarioEvent } from '../../core/types.ts';
import type { CalendarMonth, MoneyUnit } from './contract.ts';
import { adaptiveDigits, fmtNum, fmtSigned, fmtValue, MINUS, unitKind } from './format.ts';
import type { Tone } from './styling.ts';

export type { CalendarMonth, MoneyUnit } from './contract.ts';

export type EffectKind = 'amount' | 'index' | 'rate';

export interface Change {
  value: number;
  unit: '%' | 'pp';
}

/** Below this a denominator counts as zero: no percentage change is meaningful. */
const TINY = 1e-9;

function relative(kind: EffectKind, now: number, ref: number): Change | null {
  if (!Number.isFinite(now) || !Number.isFinite(ref)) return null;
  if (kind === 'rate') return { value: now - ref, unit: 'pp' };
  if (!(Math.abs(ref) > TINY)) return null;
  return { value: ((now - ref) / Math.abs(ref)) * 100, unit: '%' };
}

/** The change since today: amounts and indices in % of today's (month-0) value; rates in pp.
 *  null when today's value is ~0. */
export function sinceToday(kind: EffectKind, now: number, today: number): Change | null {
  return relative(kind, now, today);
}

/** The effect of the levers moved: amounts and indices in % of the no-change value at the same
 *  month; rates in pp. null when the no-change value is ~0. */
export function effect(kind: EffectKind, now: number, noChange: number): Change | null {
  return relative(kind, now, noChange);
}

/** A change as it is written beside an amount ("+0.5%", "−0.40 pp"), or null when it rounds to
 *  zero at that precision: a change too small to read is not shown. */
export function fmtChangeOf(c: Change | null): string | null {
  if (!c) return null;
  const digits = c.unit === 'pp' ? 2 : Math.abs(c.value) >= 10 ? 0 : 1;
  if (Math.abs(c.value) < 0.5 * 10 ** -digits) return null;
  return c.unit === 'pp' ? `${fmtSigned(c.value, digits)} pp` : `${fmtSigned(c.value, digits)}%`;
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

/** The year of the prices the money unit is measured at ("2025"), read from its basis. */
export function priceYear(unit: MoneyUnit): string | null {
  return unit.basis.match(/\b(?:19|20)\d\d\b/)?.[0] ?? null;
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

/** What a model value measures, and how to write it. */
export interface Measure {
  kind: EffectKind;
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
}

const MONEY_UNIT = /^% of (?:baseline |opening )?GDP(\/yr| a year| per year)?$/;

/** How a value in `unit` is written on this display. Money ('% of GDP/yr', '% of GDP') is in the
 *  currency where the model has a money unit, a real quantity (`scale` 'real') at the money unit's
 *  prices; a rate held as a fraction is in %; anything else keeps its unit. */
export function measureOf(d: Display, unit: string, scale?: 'nominal' | 'real' | 'none'): Measure {
  const u = unit.trim();
  const m = d.money ? u.match(MONEY_UNIT) : null;
  if (m && d.money) {
    const unitM = d.money, flow = !!m[1];
    const year = scale === 'real' ? priceYear(unitM) : null;
    const tail = scale === 'real' ? ` at ${year ? `${year} ` : 'start '}prices` : '';
    return {
      kind: 'amount',
      money: true,
      level: (x) => x * unitM.perUnit,
      text: (x) => money(unitM, x, flow).text + tail,
      short: (x) => money(unitM, x, flow).short,
      bare: (x) => money(unitM, x, flow).number,
    };
  }
  const k = unitKind(u);
  const kind: EffectKind = k === 'fraction' || k === 'percentRate' || k === 'pp' ? 'rate' : k === 'index' ? 'index' : 'amount';
  const short = (x: number) => (k === 'fraction' ? `${fmtNum(x * 100, 2)}%` : k === 'index' ? fmtNum(x, 3) : fmtValue(x, u));
  return { kind, money: false, level: (x) => (k === 'fraction' ? x * 100 : x), text: (x) => fmtValue(x, u), short, bare: short };
}

export interface ChangeNote {
  kind: 'since' | 'effect';
  /** "+0.5% since Sep 2026", "−0.4% vs no change". */
  text: string;
  /** The change alone: "+0.5%". */
  change: string;
  tone: Tone;
}

/** The one change a compact row shows: the effect against the no-change path (`ref`) once a lever
 *  has moved, else the change since today (`ref` is then today's value) from month 1. */
export function oneChange(t: number, moved: boolean, kind: EffectKind, now: number, ref: number): { change: string; tone: Tone } | null {
  if (!moved && t < 1) return null;
  const c = moved ? effect(kind, now, ref) : sinceToday(kind, now, ref);
  const change = fmtChangeOf(c);
  return change && c ? { change, tone: c.value > 0 ? 'up' : 'down' } : null;
}

/** The changes written beside an amount at month `t`: since today from month 1, and the effect
 *  against the no-change path once a lever has moved. Values are levels (Measure.level). */
export function changeNotes(d: Display, t: number, moved: boolean, kind: EffectKind, now: number, today: number, noChange: number): ChangeNote[] {
  const out: ChangeNote[] = [];
  const add = (k: ChangeNote['kind'], c: Change | null, label: string) => {
    const change = fmtChangeOf(c);
    if (change && c) out.push({ kind: k, text: `${change} ${label}`, change, tone: c.value > 0 ? 'up' : 'down' });
  };
  if (t >= 1) add('since', sinceToday(kind, now, today), d.since);
  if (moved) add('effect', effect(kind, now, noChange), 'vs no change');
  return out;
}
