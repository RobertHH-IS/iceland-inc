import { describe, expect, test } from 'bun:test';
import type { LeverInfo } from '../../src/ui/model/info.ts';
import { changedCount, clampLever, firedCounts, isChanged, leverBar, leverSections, leverStep, leverValueLabel, niceStep, stepDecimals, stepLever } from '../../src/ui/model/levers.ts';

let n = 0;
const lever = (p: Partial<LeverInfo> & { id: string }): LeverInfo => ({
  label: p.id,
  group: 'Policy',
  kind: 'setting',
  unit: 'pp',
  default: 0,
  description: '',
  definition: '',
  index: n++,
  ...p,
});

describe('sections', () => {
  const levers = [
    lever({ id: 'wage', group: 'Economy', section: 'Labour market', kind: 'oneoff', index: 0 }),
    lever({ id: 'fx', group: 'World', index: 1 }),
    lever({ id: 'rate', group: 'Policy', section: 'Central bank', index: 2 }),
    lever({ id: 'tax', group: 'Policy', section: 'Government', index: 3 }),
    lever({ id: 'spend', group: 'Policy', section: 'Government', index: 4 }),
    lever({ id: 'mood', group: 'Mood', index: 5 }),
    lever({ id: 'credit', group: 'Economy', section: 'Banks', index: 6 }),
  ];
  const sections = leverSections(levers);

  test('grouped by section, falling back to the group', () => {
    expect(sections.map((s) => s.title)).toEqual(['Central bank', 'Government', 'Labour market', 'Banks', 'World', 'Mood']);
    expect(sections.find((s) => s.title === 'Government')!.levers.map((l) => l.id)).toEqual(['tax', 'spend']);
    expect(sections.find((s) => s.title === 'World')!.group).toBe('World');
  });

  test('changed levers are counted per section; a one-off counts once fired', () => {
    const values = [10, 0, 0.25, 0, 0, 0, 0];
    const fired = firedCounts([{ t: 3, lever: 'wage', value: 10, fire: true }, { t: 5, lever: 'wage', value: 5, fire: true }]);
    expect(fired.get('wage')).toBe(2);
    expect(changedCount(sections[0], values, fired)).toBe(1);
    expect(changedCount(sections[1], values, fired)).toBe(0);
    expect(changedCount(sections[2], values, fired)).toBe(1);
    expect(changedCount(sections[2], values, new Map())).toBe(0);
    expect(isChanged(levers[2], 1e-15, fired)).toBe(false);
  });
});

describe('steppers', () => {
  const l = lever({ id: 'rate', min: -2, max: 3, step: 0.25 });

  test('steps land on the grid and are clamped', () => {
    expect(stepLever(l, 0, 1)).toBe(0.25);
    expect(stepLever(l, 0.25, -1)).toBe(0);
    expect(stepLever(l, 3, 1)).toBe(3);
    expect(stepLever(l, -2, -1)).toBe(-2);
    // no floating-point dust after many steps
    let v = 0;
    for (let i = 0; i < 7; i++) v = stepLever({ ...l, step: 0.1, max: 10 }, v, 1);
    expect(v).toBe(0.7);
  });

  test('an off-grid value snaps to the next grid point in the direction of the click', () => {
    expect(stepLever(l, 0.4, 1)).toBe(0.5);
    expect(stepLever(l, 0.4, -1)).toBe(0.25);
  });

  test('a lever without a step gets a nice one from its range', () => {
    expect(leverStep({ min: 0, max: 10 })).toBe(0.5);
    expect(leverStep({})).toBe(1);
    expect(niceStep(0.37)).toBe(0.5);
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(1e-7)).toBe(7);
    expect(clampLever({ min: 0, max: 1 }, 2)).toBe(1);
  });
});

describe('the bar', () => {
  test('baseline marker and value as fractions of the range, fill between them', () => {
    const b = leverBar(lever({ id: 'x', min: -2, max: 3, default: 0 }), 1);
    expect(b.base).toBeCloseTo(0.4);
    expect(b.value).toBeCloseTo(0.6);
    expect([b.fillFrom, b.fillTo]).toEqual([b.base, b.value]);
    const down = leverBar(lever({ id: 'x', min: -2, max: 3, default: 0 }), -2);
    expect(down.value).toBe(0);
    expect(down.fillFrom).toBe(0);
  });

  test('a lever without a range gets one around its default', () => {
    const b = leverBar(lever({ id: 'x', default: 5, step: 1 }), 5);
    expect(b.min).toBe(-5);
    expect(b.max).toBe(15);
    expect(b.base).toBeCloseTo(0.5);
  });
});

describe('labels', () => {
  test('signed settings, plain one-offs, option labels for choices', () => {
    expect(leverValueLabel(lever({ id: 'a', unit: 'pp' }), 0.25)).toBe('+0.25 pp');
    expect(leverValueLabel(lever({ id: 'a', unit: '%', kind: 'oneoff', default: 10 }), 10)).toBe('10%');
    expect(leverValueLabel(lever({ id: 'a', unit: '% of GDP/yr' }), -1)).toBe('−1% of GDP/yr');
    expect(leverValueLabel(lever({ id: 'c', kind: 'choice', unit: '', options: [{ value: 0, label: 'Floating' }, { value: 1, label: 'Pegged' }] }), 1)).toBe('Pegged');
  });
});
