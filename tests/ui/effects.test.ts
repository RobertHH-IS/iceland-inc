/**
 * Amounts and changes on a dated opening (src/ui/model/effects.ts): the change since today, the
 * effect against the no-change path, money in the currency and calendar months.
 */
import { describe, expect, test } from 'bun:test';
import { calendarLabel, calendarMonth, changeNotes, displayOf, effect, fmtChangeOf, januaries, leverMoved, measureOf, money, monthLabel, oneChange, priceYear, sinceToday } from '../../src/ui/model/effects.ts';
import { eventMarkTitle, eventMarks, chartWindow } from '../../src/ui/model/charts.ts';
import { MINUS } from '../../src/ui/model/format.ts';
import { TODAY_MONEY } from './today-fixture.ts';

const SEP_2026 = { year: 2026, month: 9 };
const dated = displayOf({ calendar: SEP_2026, moneyUnit: TODAY_MONEY, comparison: 'no-change' });

describe('the change since today and the effect', () => {
  test('amounts and indices in % of the reference; rates in pp', () => {
    expect(sinceToday('amount', 105, 100)).toEqual({ value: 5, unit: '%' });
    expect(sinceToday('index', 99, 100)).toEqual({ value: -1, unit: '%' });
    expect(sinceToday('rate', 7.25, 8)).toEqual({ value: -0.75, unit: 'pp' });
    expect(effect('amount', 99.6, 100)!.value).toBeCloseTo(-0.4, 12);
    expect(effect('rate', 8, 7.5)).toEqual({ value: 0.5, unit: 'pp' });
  });

  test('no change gives exactly zero, and month 0 against today is zero', () => {
    expect(effect('amount', 2740, 2740)).toEqual({ value: 0, unit: '%' });
    expect(sinceToday('rate', 8, 8)).toEqual({ value: 0, unit: 'pp' });
    expect(fmtChangeOf(effect('amount', 2740, 2740))).toBeNull();
  });

  test('a ~0 denominator has no percentage change; a rate still has its pp', () => {
    expect(sinceToday('amount', 3, 0)).toBeNull();
    expect(effect('index', 1, 1e-12)).toBeNull();
    expect(sinceToday('rate', 0.5, 0)).toEqual({ value: 0.5, unit: 'pp' });
    expect(sinceToday('amount', Number.NaN, 1)).toBeNull();
  });

  test('a negative amount that falls reads as a fall (the denominator is its size)', () => {
    expect(sinceToday('amount', -110, -100)!.value).toBeCloseTo(-10, 12);
    expect(sinceToday('amount', -90, -100)!.value).toBeCloseTo(10, 12);
  });

  test('written signed, and not at all when it rounds to zero', () => {
    expect(fmtChangeOf({ value: 0.5, unit: '%' })).toBe('+0.5%');
    expect(fmtChangeOf({ value: -0.4, unit: '%' })).toBe(`${MINUS}0.4%`);
    expect(fmtChangeOf({ value: 12.34, unit: '%' })).toBe('+12%');
    expect(fmtChangeOf({ value: -0.4, unit: 'pp' })).toBe(`${MINUS}0.40 pp`);
    expect(fmtChangeOf({ value: 0.04, unit: '%' })).toBeNull();
    expect(fmtChangeOf({ value: 0.004, unit: 'pp' })).toBeNull();
    expect(fmtChangeOf(null)).toBeNull();
  });
});

describe('money and months', () => {
  test('model money in ISK billions, flows a year', () => {
    expect(money(TODAY_MONEY, 42.762, false).text).toBe('ISK 2,113 bn');
    expect(money(TODAY_MONEY, 55.447, true).text).toBe('ISK 2,740 bn a year');
    expect(money(TODAY_MONEY, 55.447, true).short).toBe('ISK 2,740 bn/yr');
    expect(money(TODAY_MONEY, 55.447, true).number).toBe('2,740');
    expect(money(TODAY_MONEY, 55.447, true).card).toBe('2,740 bn');
    expect(money(TODAY_MONEY, 55.447, true).value).toBeCloseTo(55.447 * 49.41211, 9);
    expect(money(TODAY_MONEY, -2.985, true).text).toBe(`${MINUS}ISK 147 bn a year`);
    expect(money(TODAY_MONEY, 0.3, false).text).toBe('ISK 14.8 bn');
    expect(money(TODAY_MONEY, 0, false).text).toBe('ISK 0.00 bn');
    expect(priceYear(TODAY_MONEY)).toBe('2025');
  });

  test('calendar months from month 0', () => {
    expect(calendarLabel(SEP_2026, 0, 'long')).toBe('September 2026');
    expect(calendarLabel(SEP_2026, 1, 'long')).toBe('October 2026');
    expect(calendarLabel(SEP_2026, 0, 'short')).toBe('Sep 2026');
    expect(calendarLabel(SEP_2026, 4, 'short')).toBe('Jan 2027');
    expect(calendarLabel(SEP_2026, 24, 'short')).toBe('Sep 2028');
    expect(calendarMonth(SEP_2026, 15)).toEqual({ year: 2027, month: 12 });
    expect(januaries(SEP_2026, 30)).toEqual([{ t: 4, year: 2027 }, { t: 16, year: 2028 }, { t: 28, year: 2029 }]);
    expect(januaries({ year: 2026, month: 1 }, 12)).toEqual([{ t: 12, year: 2027 }]);
    expect(monthLabel(dated, 12)).toBe('Sep 2027');
    expect(monthLabel(displayOf({}), 12)).toBe('Month 12');
  });

  test('a lever event mark names its calendar month', () => {
    const info = { leverById: new Map([['keyRate', { id: 'keyRate', label: 'Key interest rate', unit: '%', kind: 'setting', default: 8 }]]) } as never;
    const w = chartWindow([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 13);
    const [m] = eventMarks([{ t: 12, lever: 'keyRate', value: 7.5 }], w, 100);
    expect(eventMarkTitle(m, info, (t) => calendarLabel(SEP_2026, t, 'short'))).toBe('Sep 2027: Key interest rate → 7.5%');
  });
});

describe('what a value measures on a dated model', () => {
  test('money in ISK, real quantities at the money unit’s prices, rates in %, indices as they are', () => {
    const flow = measureOf(dated, '% of GDP/yr');
    expect(flow).toMatchObject({ kind: 'amount', money: true });
    expect(flow.text(55.447)).toBe('ISK 2,740 bn a year');
    expect(flow.level(1)).toBe(49.41211);
    expect(measureOf(dated, '% of GDP').text(42.762)).toBe('ISK 2,113 bn');
    expect(measureOf(dated, '% of baseline GDP/yr', 'real').text(55.447)).toBe('ISK 2,740 bn a year at 2025 prices');
    const rate = measureOf(dated, 'fraction/yr');
    expect(rate.kind).toBe('rate');
    expect(rate.level(0.08)).toBeCloseTo(8, 12);
    expect(rate.text(0.08)).toBe('8.00%');
    expect(measureOf(dated, 'index').kind).toBe('index');
    expect(measureOf(dated, 'thousand persons').text(12)).toBe('12.0 thousand persons');
    // without a money unit, money keeps the model's unit
    expect(measureOf(displayOf({ calendar: SEP_2026 }), '% of GDP/yr').text(55.447)).toBe('55.4% of GDP/yr');
  });

  test('beside an amount: since today from month 1, the effect only once a lever has moved', () => {
    expect(dated.since).toBe('since Sep 2026');
    expect(changeNotes(dated, 0, false, 'amount', 2740, 2740, 2740)).toEqual([]);
    expect(changeNotes(dated, 12, false, 'amount', 2754, 2740, 2754).map((n) => n.text)).toEqual(['+0.5% since Sep 2026']);
    const both = changeNotes(dated, 12, true, 'amount', 2743, 2740, 2754);
    expect(both.map((n) => n.text)).toEqual(['+0.1% since Sep 2026', `${MINUS}0.4% vs no change`]);
    expect(both.map((n) => n.tone)).toEqual(['up', 'down']);
    expect(changeNotes(dated, 12, true, 'rate', 7.5, 8, 7.31).map((n) => n.text)).toEqual([`${MINUS}0.50 pp since Sep 2026`, '+0.19 pp vs no change']);
    expect(oneChange(0, false, 'amount', 5, 4)).toBeNull();
    expect(oneChange(3, false, 'amount', 5, 4)).toEqual({ change: '+25%', tone: 'up' });
    expect(oneChange(3, true, 'amount', 4, 5)).toEqual({ change: `${MINUS}20%`, tone: 'down' });
  });

  test('a lever has moved once a month has run with it', () => {
    expect(leverMoved([], 12)).toBe(false);
    expect(leverMoved([{ t: 12, lever: 'keyRate', value: 7 }], 12)).toBe(false);
    expect(leverMoved([{ t: 12, lever: 'keyRate', value: 7 }], 13)).toBe(true);
    expect(leverMoved([{ t: 12, lever: 'keyRate', value: 7 }], 6)).toBe(false); // the timeline went back before it
  });
});
