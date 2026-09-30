import { describe, expect, test } from 'bun:test';
import type { LeverInfo } from '../../src/ui/model/info.ts';
import {
  allLockedNote,
  canStep,
  changedCount,
  changedCountWithLocks,
  clampLever,
  firedCounts,
  isChanged,
  isLeverChanged,
  leverBar,
  leverSections,
  leverStep,
  leverValueLabel,
  lockActionLabel,
  lockTitle,
  niceStep,
  padlocksByLever,
  sectionCalling,
  shownValue,
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

  test('a stepper never moves the wrong way: at the edge of the range, or from a value a padlock froze outside it, it is off', () => {
    expect(canStep(l, 0, 1)).toBe(true);
    expect(canStep(l, 0, -1)).toBe(true);
    expect(canStep(l, 3, 1)).toBe(false);
    expect(canStep(l, -2, -1)).toBe(false);
    // income tax frozen at +38.16 by its padlock (above its max of 3 here): + would cut it to 3
    expect(stepLever(l, 38.16, 1)).toBe(3);
    expect(canStep(l, 38.16, 1)).toBe(false);
    expect(canStep(l, 38.16, -1)).toBe(true);
    expect(canStep(l, -5, -1)).toBe(false);
    expect(canStep(l, -5, 1)).toBe(true);
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

describe('padlocks and stabilisers (decisions 0004 and 0010)', () => {
  const rate = lever({ id: 'rate', label: 'Key interest rate', unit: '%', default: 3, min: 0, max: 15, step: 0.25, index: 0, section: 'Central bank' });
  const lock = lever({ id: 'rateLock', kind: 'lock', unit: 'lock', default: 0, min: 0, max: 1, step: 1, index: 1, section: 'Central bank', options: [{ value: 0, label: 'Unlocked' }, { value: 1, label: 'Locked' }] });
  const tax = lever({ id: 'tax', label: 'Income-tax rate', default: 0, min: -10, max: 10, step: 0.5, index: 2, section: 'Government' });
  const vat = lever({ id: 'vat', label: 'VAT rate', default: 0, min: -10, max: 10, step: 0.5, index: 3, section: 'Government' });
  const byId = new Map([rate, lock, tax, vat].map((l) => [l.id, l]));
  const [bank, gov] = leverSections([rate, tax, vat]);
  const state = (over: Partial<{ locked: boolean; current: number; suggested: number; calling: boolean }> = {}) => ({ id: 'rule', label: 'Central bank’s rule', lever: 'rate', lock: 'rateLock', locked: false, current: 3.4, suggested: 4.2713, calling: false, ...over });

  test('only a lever with a rule gets a padlock; its label and title say what it does', () => {
    const pads = padlocksByLever([state()]);
    expect([...pads.keys()]).toEqual(['rate']);
    expect(pads.has('vat')).toBe(false);
    expect(lockActionLabel(rate, false)).toBe('Lock the key interest rate');
    expect(lockActionLabel(rate, true)).toBe('Unlock the key interest rate');
    expect(lockActionLabel(tax, false)).toBe('Lock the income-tax rate');
    expect(lockActionLabel(vat, false)).toBe('Lock the VAT rate'); // an acronym keeps its capitals
    expect(lockTitle(rate, { label: 'Central bank’s rule', locked: false })).toBe('Unlocked: Central bank’s rule sets the key interest rate, and the lever follows it. Lock to hold it where it is; moving the lever locks it too.');
    expect(lockTitle(rate, { label: 'Central bank’s rule', locked: true })).toContain('Locked: the key interest rate stays where you set it');
    expect(leverValueLabel(lock, 1)).toBe('Locked');
  });

  test('unlocked, the lever shows the live value its rule sets; locked, its own', () => {
    expect(shownValue(3, state())).toBe(3.4);
    expect(shownValue(4.5, state({ locked: true, current: 4.5 }))).toBe(4.5);
    expect(shownValue(2, undefined)).toBe(2);
    expect(shownValue(3, state({ current: NaN }))).toBe(3);
    // a step from the live value: the client then sets it, which locks it at the new value
    expect(stepLever(rate, shownValue(3, state()), 1)).toBe(3.5);
  });

  test('a lever with a padlock counts as changed while it is locked, not while its rule moves it', () => {
    const none = new Map<string, number>();
    expect(isLeverChanged(rate, 3.4, none, state())).toBe(false);
    expect(isLeverChanged(rate, 3, none, state({ locked: true }))).toBe(true);
    expect(isLeverChanged(vat, 1, none)).toBe(true);
    const pads = padlocksByLever([state()]);
    expect(changedCountWithLocks(bank, [3, 0, 0, 0], none, pads)).toBe(0);
    expect(changedCountWithLocks(bank, [3, 1, 0, 0], none, padlocksByLever([state({ locked: true })]))).toBe(1);
    expect(changedCountWithLocks(gov, [3, 0, 1, 0.5], none, pads)).toBe(2);
    expect(changedCount(gov, [3, 0, 1, 0.5], none)).toBe(2);
  });

  test('Apply rounds the suggestion to the lever’s step grid, within its range', () => {
    expect(snapToStep(rate, 4.27)).toBe(4.25);
    expect(snapToStep(rate, 4.38)).toBe(4.5);
    expect(snapToStep(rate, -1)).toBe(0);
    expect(snapToStep(tax, 0.83)).toBe(1);
    expect(snapToStep(tax, -0.07)).toBe(0);
  });

  test('locked: a calling stabiliser marks its lever red with its suggestion; unlocked: nothing, the lever follows the rule', () => {
    const locked = stabiliserMarks([state({ locked: true, current: 3, calling: true })], byId);
    expect(locked.get('rate')).toEqual({ kind: 'calling', stabiliser: 'rule', label: 'Central bank’s rule', text: 'Central bank’s rule: 4.27%', suggested: 4.2713, apply: 4.25 });
    expect(sectionCalling(bank, locked)).toBe(true);
    expect(sectionCalling(gov, locked)).toBe(false);
    expect(stabiliserMarks([state({ locked: true, current: 3 })], byId).size).toBe(0);
    // an unlocked rule never shows a call, even if the engine were to report one
    expect(stabiliserMarks([state({ calling: true })], byId).size).toBe(0);
    const debt = stabiliserMarks([{ id: 'debt', label: 'Debt rule', lever: 'tax', suggested: 0.834, current: 0, calling: true, locked: true }], byId);
    expect(debt.get('tax')).toMatchObject({ text: 'Debt rule: +0.83 pp', apply: 1 });
  });

  test('a rule that wants more than the lever’s range: at the bound, no Apply and no red dot; short of it, Apply goes to the bound', () => {
    const s = state({ locked: true, suggested: 17.2, current: 15, calling: true });
    const atMax = stabiliserMarks([s], byId);
    expect(atMax.get('rate')).toEqual({ kind: 'beyond', stabiliser: 'rule', label: 'Central bank’s rule', text: 'Central bank’s rule: 17.2% (beyond the lever’s range)', suggested: 17.2 });
    expect(sectionCalling(bank, atMax)).toBe(false);
    const below = stabiliserMarks([{ ...s, current: 12 }], byId);
    expect(below.get('rate')).toMatchObject({ kind: 'calling', apply: 15 });
    expect(sectionCalling(bank, below)).toBe(true);
    // The same at the lower bound.
    expect(stabiliserMarks([{ ...s, suggested: -0.8, current: 0 }], byId).get('rate')).toMatchObject({ kind: 'beyond' });
    // Within half a step of where the lever is, Apply would not move it either.
    expect(stabiliserMarks([{ ...s, suggested: 4.3, current: 4.25 }], byId).get('rate')).toMatchObject({ kind: 'beyond', text: 'Central bank’s rule: 4.3% (the nearest step is where the lever is)' });
  });

  test('every lever with a rule locked: one calm line that nothing pulls prices back (decision 0014); any padlock open, or no padlocks: none', () => {
    const debt = { lever: 'tax', locked: true };
    expect(allLockedNote([state({ locked: true }), debt], byId)).toBe('With the key interest rate and the income-tax rate both locked, nothing pulls prices back over the long run.');
    expect(allLockedNote([state(), debt], byId)).toBeNull();
    expect(allLockedNote([state({ locked: true }), { ...debt, locked: false }], byId)).toBeNull();
    expect(allLockedNote([], byId)).toBeNull();
    expect(allLockedNote([state({ locked: true })], byId)).toBe('With the key interest rate locked, nothing pulls prices back over the long run.');
    expect(allLockedNote([state({ locked: true }), debt, { lever: 'vat', locked: true }], byId)).toBe('With the key interest rate, the income-tax rate and the VAT rate all locked, nothing pulls prices back over the long run.');
  });
});
