/**
 * Amounts and changes on a dated opening (src/ui/model/effects.ts): the change since today, the
 * effect against the no-change path, money in the currency and calendar months.
 */
import { describe, expect, test } from 'bun:test';
import { calendarLabel, calendarMonth, changeNotes, displayOf, effect, fmtCardChange, fmtChangeOf, flowMeasure, januaries, leverMoved, measureOf, money, monthLabel, oneChange, priceYear, sinceToday } from '../../src/ui/model/effects.ts';
import { fitCardRow, textWidth } from '../../src/ui/model/player-cards.ts';
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

  test('a ~0 denominator has no percentage change: an amount is a difference, a rate still has its pp', () => {
    expect(sinceToday('amount', 3, 0)).toEqual({ value: 3, unit: 'level' });
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

describe('where a percentage means nothing, a difference', () => {
  const flow = measureOf(dated, '% of GDP/yr');
  const isk = (bn: number) => bn / TODAY_MONEY.perUnit; // ISK bn as model units

  test('the deficit: ISK 41.7 bn a year against 3.2 bn without the change is a difference, not +1187%', () => {
    const e = effect(flow, flow.level(isk(41.7)), flow.level(isk(3.24)));
    expect(e!.unit).toBe('level');
    expect(e!.value).toBeCloseTo(38.46, 9);
    expect(fmtChangeOf(e, flow)).toBe('+ISK 38.5 bn a year');
    expect(changeNotes(dated, 12, true, flow, flow.level(isk(41.7)), flow.level(0), flow.level(isk(3.24))).map((n) => n.text)).toEqual(['+ISK 41.7 bn a year since Sep 2026', '+ISK 38.5 bn a year vs no change']);
    // in a table whose header names the unit, and on a card
    expect(changeNotes(dated, 12, true, flow, flow.level(isk(41.7)), flow.level(isk(41.7)), flow.level(isk(3.24)))[0].change).toBe('+38.5');
    expect(fmtCardChange(e, flow)).toBe('+38.5 bn');
  });

  test('an amount that crosses zero, or whose reference is below ISK 12 bn or a tenth of the amount now, is a difference', () => {
    expect(sinceToday(flow, flow.level(isk(-17.2)), flow.level(isk(5.9)))!.unit).toBe('level'); // central-bank profit turning to a loss
    expect(effect(flow, flow.level(isk(20)), flow.level(isk(10)))!.unit).toBe('level'); // below the floor
    expect(effect(flow, flow.level(isk(500)), flow.level(isk(40)))!.unit).toBe('level'); // under a tenth of now
    expect(effect(flow, flow.level(isk(2618)), flow.level(isk(2664)))).toMatchObject({ unit: '%' });
    expect(fmtChangeOf(effect(flow, flow.level(isk(2618)), flow.level(isk(2664))), flow)).toBe(`${MINUS}1.7%`);
    // a difference too small to read is not written
    expect(fmtChangeOf(effect(flow, flow.level(isk(3.02)), flow.level(isk(3))), flow)).toBeNull();
    // a negative amount of the same sign and size keeps its %
    expect(sinceToday(flow, flow.level(isk(-110)), flow.level(isk(-100)))!.value).toBeCloseTo(-10, 9);
  });

  test('log points, a ratio and a share of the population are centred on zero: always a difference in their unit', () => {
    const confidence = measureOf(dated, 'ratio');
    expect(confidence.kind).toBe('difference');
    expect(fmtChangeOf(effect(confidence, -0.028, 0.0009), confidence)).toBe(`${MINUS}0.029 ratio`); // not −3145%
    const house = measureOf(dated, 'log points');
    expect(fmtChangeOf(effect(house, -0.016, 0.024), house)).toBe(`${MINUS}0.040 log points`); // not −167%
    const migrants = measureOf(dated, '% of adult population');
    expect(changeNotes(dated, 12, true, migrants, 0.096, 0, 0.19).map((n) => n.text)).toEqual(['+0.10 pp since Sep 2026', `${MINUS}0.09 pp vs no change`]);
    expect(fmtChangeOf(effect(house, 0.0242, 0.0240), house)).toBeNull();
  });

  test('a revaluation or a write-off swings around zero: its changes are differences in ISK', () => {
    const reval = flowMeasure(dated, 'revaluation');
    expect(reval.kind).toBe('difference');
    expect(fmtChangeOf(effect(reval, reval.level(isk(105)), reval.level(isk(46))), reval, 'card')).toBe('+59.0 bn'); // not +128%
    expect(flowMeasure(dated, 'writeoff').kind).toBe('difference');
    expect(flowMeasure(dated, 'cash').kind).toBe('amount');
    expect(flowMeasure(dated, 'accrual').kind).toBe('amount');
  });

  test('a card writes a change briefly: −1.7%, +1.9pp', () => {
    expect(fmtCardChange({ value: -1.66, unit: '%' })).toBe(`${MINUS}1.7%`);
    expect(fmtCardChange({ value: 1.92, unit: 'pp' })).toBe('+1.9pp');
    expect(fmtCardChange({ value: 0.04, unit: 'pp' })).toBeNull();
  });
});

describe('a card row keeps its label', () => {
  test('the label in full; the number drops its scale, then the effect gives way, before the label is cut', () => {
    expect(fitCardRow(164, { label: 'Spending', value: '2,618 bn', change: `${MINUS}1.7%`, rule: false })).toEqual({ label: 'Spending', value: '2,618 bn', change: `${MINUS}1.7%` });
    expect(fitCardRow(164, { label: 'Broad money', value: '3,414 bn', change: `${MINUS}1.1%`, rule: false })).toEqual({ label: 'Broad money', value: '3,414', change: `${MINUS}1.1%` });
    expect(fitCardRow(164, { label: 'Key rate', value: '6.00%', change: '+1.9pp', rule: true })).toEqual({ label: 'Key rate', value: '6.00%', change: '+1.9pp' });
    // no room for the effect beside "Unemployment": the value's colour and the accessible name carry it
    expect(fitCardRow(164, { label: 'Unemployment', value: '3.94%', change: '+0.3pp', rule: false })).toEqual({ label: 'Unemployment', value: '3.94%', change: '' });
    // only a label that does not fit beside its number alone is cut
    expect(fitCardRow(150, { label: 'Net lending to the rest of the world', value: '−1,234.5', rule: false }).label).toMatch(/^Net lending.*…$/);
    expect(textWidth('3.94%', 11, true)).toBeCloseTo(33, 9);
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
    // the year of the GDP the basis names, not a vintage that comes first; a declared year wins
    expect(priceYear({ ...TODAY_MONEY, basis: 'September 2026 vintage: Hagstofa THJ01102, 2025 GDP at current prices' })).toBe('2025');
    expect(priceYear({ ...TODAY_MONEY, basis: 'September 2026 vintage', priceYear: 2025 })).toBe('2025');
    expect(priceYear({ ...TODAY_MONEY, basis: 'September 2026 vintage' })).toBeNull();
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
