import { describe, expect, test } from 'bun:test';
import type { IndicatorInfo, LeverInfo } from '../../src/ui/model/info.ts';
import { CHART_SPAN, areaPath, chartRef, chartTabs, chartWindow, eventMarkTitle, eventMarks, linePath, xAt, yAt, yTicks } from '../../src/ui/model/charts.ts';

const series = (n: number, f: (m: number) => number) => Array.from({ length: n }, (_, m) => f(m));

describe('chart windows', () => {
  test('before month 72 the window starts at 0 and grows from the left', () => {
    const w = chartWindow(series(11, (m) => m), 10);
    expect([w.from, w.to, w.span]).toEqual([0, 10, CHART_SPAN]);
    expect(w.values).toHaveLength(11);
    expect(xAt(w, 10, 720)).toBeCloseTo(100);
  });

  test('afterwards it scrolls: always the last 72 months, ending now', () => {
    const w = chartWindow(series(201, (m) => m), 200);
    expect([w.from, w.to]).toEqual([128, 200]);
    expect(w.values[0]).toBe(128);
    expect(w.last).toBe(200);
    expect(xAt(w, 200, 144)).toBe(144);
  });

  test('a seek back shows the window ending at the current month', () => {
    const w = chartWindow(series(201, (m) => m), 50);
    expect([w.from, w.to, w.last]).toEqual([0, 50, 50]);
  });

  test('the y-range always contains the zero line, with padding', () => {
    const w = chartWindow(series(30, (m) => 1 + m / 10), 29);
    expect(w.lo).toBeLessThan(0);
    expect(w.hi).toBeGreaterThan(3.9);
    expect(yAt(w, w.lo, 50)).toBeCloseTo(50);
    expect(yAt(w, w.hi, 50)).toBeCloseTo(0);
  });

  test('a flat baseline does not blow floating-point dust up into a wiggle', () => {
    const w = chartWindow(series(40, (m) => (m % 2 ? 1e-13 : -1e-13)), 39);
    expect(w.hi - w.lo).toBeGreaterThanOrEqual(0.02);
    const ys = w.values.map((v) => yAt(w, v, 50));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);
  });

  test("'level' indicators use their baseline as the reference line", () => {
    const s = series(10, (m) => 5 + m);
    expect(chartRef({ display: 'level' }, s)).toBe(5);
    expect(chartRef({ display: 'deviation-pct' }, s)).toBe(0);
  });
});

describe('paths and marks', () => {
  test('one point per month, with gaps for missing values', () => {
    const w = chartWindow([0, 1, Number.NaN, 3, 4], 4, 4);
    const d = linePath(w, 40, 20);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/L/g)).toHaveLength(2);
    expect(areaPath(w, 40, 20)).toMatch(/Z$/);
  });

  test('lever events inside the window become marks, one per month', () => {
    const w = chartWindow(series(101, () => 0), 100);
    const marks = eventMarks(
      [
        { t: 10, lever: 'old', value: 1 },
        { t: 40, lever: 'a', value: 1 },
        { t: 40, lever: 'b', value: 2 },
        { t: 90, lever: 'c', value: 3, fire: true },
      ],
      w,
      72,
    );
    expect(marks.map((m) => m.t)).toEqual([40, 90]);
    expect(marks[0].x).toBeCloseTo(12);
    expect(marks[1].fire).toBe(true);
    // A month's mark carries every event in it; the last one (the user's change) leads.
    expect(marks[0].events.map((e) => e.lever)).toEqual(['a', 'b']);
    expect(marks[0]).toMatchObject({ lever: 'b', value: 2, fire: false });
  });

  test('a mode switch’s mark names the switch first, then the reset recorded before it', () => {
    const w = chartWindow(series(30, () => 0), 29);
    const lever = (id: string, label: string, extra: Partial<LeverInfo> = {}) => [id, { id, label, unit: '', kind: 'setting', default: 0, ...extra } as LeverInfo] as const;
    const info = { leverById: new Map([lever('keyRateFixed', 'Key interest rate', { unit: '%', default: 3 }), lever('stabilisers', 'Stabilisers', { kind: 'choice', options: [{ value: 0, label: 'Manual' }, { value: 1, label: 'Automatic' }] })]) };
    const [m] = eventMarks(
      [
        { t: 12, lever: 'keyRateFixed', value: 3 },
        { t: 12, lever: 'stabilisers', value: 1 },
      ],
      w,
      100,
    );
    expect(eventMarkTitle(m, info)).toBe('Month 12: Stabilisers → Automatic · Key interest rate → 3%');
    expect(eventMarkTitle(eventMarks([{ t: 3, lever: 'shock', value: 10, fire: true }], w, 100)[0], info)).toBe('Month 3: shock applied 10');
  });

  test('axis ticks: the reference line and the extremes', () => {
    const w = chartWindow(series(20, (m) => -m / 4), 19);
    const ticks = yTicks(w);
    expect(ticks[0]).toBe(0);
    expect(ticks).toContain(-19 / 4);
  });
});

describe('tabs', () => {
  test('one tab per indicator group, in order of first appearance', () => {
    const ind = (id: string, group: string, index: number) => ({ id, group, index, label: id, unit: '%', display: 'deviation-pct', description: '' }) as IndicatorInfo;
    const tabs = chartTabs([ind('a', 'Overview', 0), ind('b', 'Money', 1), ind('c', 'Overview', 2), ind('d', '', 3)]);
    expect(tabs.map((t) => [t.label, t.indicators.map((i) => i.id)])).toEqual([
      ['Overview', ['a', 'c']],
      ['Money', ['b']],
      ['Charts', ['d']],
    ]);
  });
});
