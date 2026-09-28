import { describe, expect, test } from 'bun:test';
import type { LeverInfo } from '../../src/ui/model/info.ts';
import {
  changedCount,
  clampLever,
  firedCounts,
  isChanged,
  isShown,
  leverBar,
  leverSections,
  leverStep,
  leverValueLabel,
  niceStep,
  resetsWhenSetting,
  sectionCalling,
  shownChangedCount,
  snapToStep,
  stabiliserMarks,
  stepDecimals,
  stepLever,
} from '../../src/ui/model/levers.ts';

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

describe('showWhen and stabilisers (decision 0004)', () => {
  const mode = lever({ id: 'mode', kind: 'choice', default: 0, index: 0, section: 'Stabilisers', options: [{ value: 0, label: 'Manual' }, { value: 1, label: 'Automatic' }] });
  const fixed = lever({ id: 'fixed', unit: '%', default: 3, min: 0, max: 15, step: 0.25, index: 1, section: 'Central bank', showWhen: { lever: 'mode', equals: 0 } });
  const offset = lever({ id: 'offset', default: 0, min: -3, max: 5, step: 0.25, index: 2, section: 'Central bank', showWhen: { lever: 'mode', equals: [1] } });
  const tax = lever({ id: 'tax', default: 0, min: -10, max: 10, step: 0.5, index: 3, section: 'Government' });
  const all = [mode, fixed, offset, tax];
  const byId = new Map(all.map((l) => [l.id, l]));
  const [bank, gov] = leverSections([fixed, offset, tax]);

  test('a lever shows only while the lever its showWhen names has one of the values', () => {
    expect([isShown(fixed, [0, 3, 0, 0], byId), isShown(offset, [0, 3, 0, 0], byId)]).toEqual([true, false]);
    expect([isShown(fixed, [1, 3, 0, 0], byId), isShown(offset, [1, 3, 0, 0], byId)]).toEqual([false, true]);
    expect(isShown(tax, [1, 3, 0, 0], byId)).toBe(true);
  });

  test('hidden levers are not counted in section badges', () => {
    const values = [1, 4.5, 1, 0]; // Automatic, with a stale Manual rate and an offset
    expect(changedCount(bank, values, new Map())).toBe(2);
    expect(shownChangedCount(bank, values, new Map(), byId)).toBe(1);
  });

  test('switching mode puts the levers the new mode hides back to their defaults', () => {
    expect(resetsWhenSetting(all, [0, 4.5, 0, 1], 'mode', 1)).toEqual([{ id: 'fixed', value: 3 }]);
    expect(resetsWhenSetting(all, [1, 3, 1.25, 1], 'mode', 0)).toEqual([{ id: 'offset', value: 0 }]);
    expect(resetsWhenSetting(all, [1, 3, 0, 1], 'mode', 0)).toEqual([]);
    expect(resetsWhenSetting(all, [0, 4.5, 0, 1], 'tax', 2)).toEqual([]);
  });

  test('Apply rounds the suggestion to the lever’s step grid, within its range', () => {
    expect(snapToStep(fixed, 4.27)).toBe(4.25);
    expect(snapToStep(fixed, 4.38)).toBe(4.5);
    expect(snapToStep(fixed, -1)).toBe(0);
    expect(snapToStep(tax, 0.83)).toBe(1);
    expect(snapToStep(tax, -0.07)).toBe(0);
  });

  test('Manual: a calling stabiliser marks its lever red with its suggestion; Automatic: a note on the offset', () => {
    const s = { id: 'rule', label: 'Central bank’s rule', lever: 'fixed', offset: 'offset', suggested: 4.2713, current: 3, calling: true, automatic: false };
    const manual = stabiliserMarks([s], byId);
    expect(manual.get('fixed')).toEqual({ kind: 'calling', stabiliser: 'rule', label: 'Central bank’s rule', text: 'Central bank’s rule: 4.27%', suggested: 4.2713, apply: 4.25 });
    expect(manual.has('offset')).toBe(false);
    expect(sectionCalling(bank, manual, [0, 3, 0, 0], byId)).toBe(true);
    expect(sectionCalling(gov, manual, [0, 3, 0, 0], byId)).toBe(false);
    expect(stabiliserMarks([{ ...s, calling: false }], byId).size).toBe(0);
    const auto = stabiliserMarks([{ ...s, calling: false, automatic: true }], byId);
    expect(auto.get('offset')).toEqual({ kind: 'acting', stabiliser: 'rule', label: 'Central bank’s rule', text: 'Set by Central bank’s rule: 4.27%' });
    const debt = stabiliserMarks([{ id: 'debt', label: 'Debt rule', lever: 'tax', offset: 'tax', suggested: 0.834, current: 0, calling: true, automatic: false }], byId);
    expect(debt.get('tax')).toMatchObject({ text: 'Debt rule: +0.83 pp', apply: 1 });
  });

  test('a rule that wants more than the lever’s range: at the bound, no Apply and no red dot; short of it, Apply goes to the bound', () => {
    const s = { id: 'rule', label: 'Central bank’s rule', lever: 'fixed', offset: 'offset', suggested: 17.2, current: 15, calling: true, automatic: false };
    const atMax = stabiliserMarks([s], byId);
    expect(atMax.get('fixed')).toEqual({ kind: 'beyond', stabiliser: 'rule', label: 'Central bank’s rule', text: 'Central bank’s rule: 17.2% (beyond the lever’s range)', suggested: 17.2 });
    expect(sectionCalling(bank, atMax, [0, 15, 0, 0], byId)).toBe(false);
    const below = stabiliserMarks([{ ...s, current: 12 }], byId);
    expect(below.get('fixed')).toMatchObject({ kind: 'calling', apply: 15 });
    expect(sectionCalling(bank, below, [0, 12, 0, 0], byId)).toBe(true);
    // The same at the lower bound.
    expect(stabiliserMarks([{ ...s, suggested: -0.8, current: 0 }], byId).get('fixed')).toMatchObject({ kind: 'beyond' });
    // Within half a step of where the lever is, Apply would not move it either.
    expect(stabiliserMarks([{ ...s, suggested: 4.3, current: 4.25 }], byId).get('fixed')).toMatchObject({ kind: 'beyond', text: 'Central bank’s rule: 4.3% (the nearest step is where the lever is)' });
  });
});
