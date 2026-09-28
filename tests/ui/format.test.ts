import { describe, expect, test } from 'bun:test';
import { MINUS, adaptiveDigits, fmtChange, fmtClock, fmtCompact, fmtCompactChange, fmtIndicator, fmtMonths, fmtNum, fmtResidual, fmtSigned, fmtValue, relChangePct, unitKind } from '../../src/ui/model/format.ts';

describe('numbers', () => {
  test('adaptive digits keep about three significant figures', () => {
    expect(adaptiveDigits(123.4)).toBe(0);
    expect(adaptiveDigits(12.34)).toBe(1);
    expect(adaptiveDigits(1.234)).toBe(2);
    expect(adaptiveDigits(0.0123)).toBe(3);
    expect(adaptiveDigits(0.00123)).toBe(4);
  });

  test('typographic minus, no negative zero, dust prints as zero', () => {
    expect(fmtNum(-1.5)).toBe(`${MINUS}1.50`);
    expect(fmtNum(-1e-13)).toBe('0.00');
    expect(fmtNum(-0.0001, 2)).toBe('0.00');
    expect(fmtNum(66.666)).toBe('66.7');
    expect(fmtNum(Number.NaN)).toBe('–');
  });

  test('signed changes', () => {
    expect(fmtSigned(0.42)).toBe('+0.42');
    expect(fmtSigned(-0.42)).toBe(`${MINUS}0.42`);
    expect(fmtSigned(0)).toBe('0.00');
    expect(fmtSigned(1e-12)).toBe('0.00');
  });
});

describe('units', () => {
  test('unit kinds', () => {
    expect(unitKind('fraction/yr')).toBe('fraction');
    expect(unitKind('fraction of deposits')).toBe('fraction');
    expect(unitKind('index')).toBe('index');
    expect(unitKind('% of GDP/yr')).toBe('percent');
    expect(unitKind('pp vs baseline')).toBe('pp');
    expect(unitKind('years')).toBe('plain');
  });

  test('values with units', () => {
    expect(fmtValue(0.03, 'fraction/yr')).toBe('3.00%');
    expect(fmtValue(0.1, 'fraction of deposits')).toBe('10.0% of deposits');
    expect(fmtValue(1.0423, 'index')).toBe('1.042');
    expect(fmtValue(66.67, '% of GDP/yr')).toBe('66.7% of GDP/yr');
    expect(fmtValue(8, 'years')).toBe('8.00 years');
  });

  test('changes: pp for fractions, % of baseline for indices, the unit for money', () => {
    expect(fmtChange(0.0025, 'fraction/yr')).toBe('+0.25 pp');
    expect(fmtChange(0.012, 'index', 1)).toBe('+1.20%');
    expect(fmtChange(-0.4, '% of GDP/yr')).toBe(`${MINUS}0.40% of GDP/yr`);
  });

  test('compact forms for cards and term columns', () => {
    expect(fmtCompact(0.05, 'fraction')).toBe('5.00%');
    expect(fmtCompact(69.2, '% of GDP/yr')).toBe('69.2');
    expect(fmtCompactChange(0.001, 'fraction')).toBe('+0.10pp');
    expect(fmtCompactChange(0.02, 'index', 1)).toBe('+2.0%');
    expect(fmtCompactChange(-0.5, '% of GDP/yr')).toBe(`${MINUS}0.50`);
  });

  test('indicators in display units', () => {
    expect(fmtIndicator(1.234, '% vs baseline', 'deviation-pct')).toBe('+1.23%');
    expect(fmtIndicator(-0.25, 'pp vs baseline', 'deviation-pp')).toBe(`${MINUS}0.25 pp`);
    expect(fmtIndicator(0.4, 'pp of GDP', 'deviation')).toBe('+0.40 pp');
    expect(fmtIndicator(12.5, '% vs baseline', 'deviation-pct')).toBe('+12.5%');
  });

  test('relative change needs a baseline', () => {
    expect(relChangePct(110, 100)).toBeCloseTo(10);
    expect(relChangePct(1, 0)).toBeNull();
  });
});

describe('clock and misc', () => {
  test('month 0 is year 1, month 1; month 14 is year 2, month 3', () => {
    expect(fmtClock(0).label).toBe('Year 1 · month 1');
    expect(fmtClock(14)).toMatchObject({ month: 14, year: 2, monthOfYear: 3, short: 'M14' });
  });

  test('durations and residuals', () => {
    expect(fmtMonths(5)).toBe('5 months');
    expect(fmtMonths(24)).toBe('2 years');
    expect(fmtMonths(27)).toBe('2 yr 3 mo');
    expect(fmtResidual(1.2e-12)).toBe(`1.2e${MINUS}12`);
    expect(fmtResidual(0)).toBe('0');
  });
});
