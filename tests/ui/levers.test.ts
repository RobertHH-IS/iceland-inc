import { describe, expect, test } from 'bun:test';
import type { LeverInfo } from '../../src/ui/model/info.ts';
import { models } from '../../src/models/index.ts';
import { createEngineClient, type EngineClient } from '../../src/ui/engine-client.ts';
import {
  canResetToBaseline,
  canStep,
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
  lockedAloneNotes,
  lockTitle,
  niceStep,
  padlocksByLever,
  isLeverShown,
  shownSections,
  shownValue,
  snapToStep,
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
    const noPads = new Map();
    expect(changedCountWithLocks(sections[0], values, fired, noPads)).toBe(1);
    expect(changedCountWithLocks(sections[1], values, fired, noPads)).toBe(0);
    expect(changedCountWithLocks(sections[2], values, fired, noPads)).toBe(1);
    expect(changedCountWithLocks(sections[2], values, new Map(), noPads)).toBe(0);
    expect(isChanged(levers[2], 1e-15, fired)).toBe(false);
  });
});

describe('levers kept off the panel (shown: false, decision 0017)', () => {
  const levers = [
    lever({ id: 'tax', section: 'Government', index: 0 }),
    lever({ id: 'schools', section: 'Government', shown: false, index: 1 }),
    lever({ id: 'spend', section: 'Government', index: 2 }),
    lever({ id: 'cap', section: 'Stability', default: 80, shown: false, index: 3 }),
    lever({ id: 'rate', section: 'Central bank', shown: true, index: 4 }),
  ];
  const all = leverSections(levers);
  const ids = (s: ReturnType<typeof shownSections>) => s.map((x) => `${x.title}: ${x.levers.map((l) => l.id).join(', ')}`);

  test('a hidden lever at its default with no event is left out, and a section with nothing left goes; the others are returned as they are', () => {
    const shown = shownSections(all, [0, 0, 0, 80, 0], []);
    expect(ids(shown)).toEqual(['Government: tax, spend', 'Central bank: rate']);
    expect(shown[1]).toBe(all.find((s) => s.title === 'Central bank')!);
    expect(isLeverShown(levers[4], 0, false)).toBe(true); // shown: true is the default
    expect(isLeverShown(levers[0], 0, false)).toBe(true);
  });

  test('it appears in its own place while it is off its default, or while the scenario has an event for it (even back at its default)', () => {
    expect(ids(shownSections(all, [0, 0.5, 0, 70, 0], []))).toEqual(['Government: tax, schools, spend', 'Stability: cap', 'Central bank: rate']);
    expect(ids(shownSections(all, [0, 0, 0, 80, 0], [{ t: 12, lever: 'schools', value: 0 }]))).toEqual(['Government: tax, schools, spend', 'Central bank: rate']);
    expect(isLeverShown(levers[1], 1e-15, false)).toBe(false);
  });
});

describe('the levers each model shows (decision 0017)', () => {
  const panel = (c: EngineClient) => {
    const f = c.getFrame();
    return shownSections(leverSections(c.info.levers.filter((l) => l.kind !== 'lock')), f.levers, f.events).map((s) => [s.title, s.levers.map((l) => l.id)] as const);
  };
  const iceland = models.find((m) => m.id === 'iceland')!;
  const HIDDEN = ['ltvCap', 'migration', 'education', 'otherServices', 'oldAgeTransfers', 'familyBenefits', 'aluminiumPrice'];

  test('Iceland shows the 18 main levers, the most important first in each section; the seven others are still levers of the model', () => {
    const c = createEngineClient(iceland);
    expect(panel(c)).toEqual([
      ['Central bank', ['keyRate']],
      ['Financial stability', ['dstiCap']],
      ['Government', ['incomeTax', 'vat', 'health', 'publicInvestment', 'unemploymentBenefits', 'bondBuyers']],
      ['Banks', ['lendingAppetite']],
      ['Labour market', ['wageSettlement', 'netImmigration']],
      ['Pension funds', ['pfForeign']],
      ['World economy', ['tourism', 'fishPrices', 'kronaShock', 'foreignDemand', 'importPrices', 'foreignRate']],
    ]);
    expect(panel(c).flatMap(([, l]) => l).length).toBe(18);
    const declared = c.info.levers.filter((l) => l.kind !== 'lock');
    expect(declared.length).toBe(25);
    expect(declared.filter((l) => l.shown === false).map((l) => l.id).sort()).toEqual([...HIDDEN].sort());
    c.dispose();
  });

  test('a hidden lever a scenario sets appears in its own place in its section, and stays while the scenario moves it', () => {
    const c = createEngineClient(iceland);
    c.load({ modelId: 'iceland', events: [{ t: 0, lever: 'ltvCap', value: 70 }, { t: 0, lever: 'education', value: 1 }, { t: 6, lever: 'aluminiumPrice', value: 10 }, { t: 12, lever: 'aluminiumPrice', value: 0 }], months: 18 });
    const byTitle = new Map(panel(c));
    expect(byTitle.get('Financial stability')).toEqual(['dstiCap', 'ltvCap']);
    expect(byTitle.get('Government')).toEqual(['incomeTax', 'vat', 'health', 'education', 'publicInvestment', 'unemploymentBenefits', 'bondBuyers']);
    // back at its default at month 12, but the scenario still moves it
    expect(c.getFrame().levers[c.info.levers.findIndex((l) => l.id === 'aluminiumPrice')]).toBe(0);
    expect(byTitle.get('World economy')!.at(-1)).toBe('aluminiumPrice');
    expect(byTitle.get('Labour market')).toEqual(['wageSettlement', 'netImmigration']);
    c.dispose();
  });

  test('the reference economy shows all five of its levers', () => {
    const c = createEngineClient(models.find((m) => m.id === 'reference')!);
    expect(panel(c).flatMap(([, l]) => l)).toEqual(['keyRate', 'govSpending', 'taxRate', 'wageSettlement', 'lendingAppetite']);
    c.dispose();
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
    // short: what the padlock means and what a press does, and no note after it
    expect(lockTitle(rate, { label: 'Central bank’s rule', locked: true })).toBe('Locked: the key interest rate stays where you set it, and everything else reacts to it. Unlock to hand it back to Central bank’s rule, which carries on from where it is.');
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
    expect(changedCountWithLocks(gov, [3, 0, 1, 0.5], none, new Map())).toBe(2);
  });

  test('back to baseline: a lever off its default, and one with a padlock only while it is locked (it stays locked); never a one-off', () => {
    expect(canResetToBaseline(vat, 1)).toBe(true);
    expect(canResetToBaseline(vat, 0)).toBe(false);
    // a key rate held at 4.25%: one click back to 3%, still held (review m6)
    expect(canResetToBaseline(rate, 4.25, state({ locked: true, current: 4.25 }))).toBe(true);
    expect(canResetToBaseline(rate, 3, state({ locked: true, current: 3 }))).toBe(false);
    // unlocked, the rule moves it: unlocking was the hand-back, and there is nothing of the user's to undo
    expect(canResetToBaseline(rate, 3.4, state())).toBe(false);
    expect(canResetToBaseline(lever({ id: 'wage', kind: 'oneoff', default: 10 }), 5)).toBe(false);
  });

  test('snapToStep rounds a value to the lever’s step grid, within its range', () => {
    expect(snapToStep(rate, 4.27)).toBe(4.25);
    expect(snapToStep(rate, 4.38)).toBe(4.5);
    expect(snapToStep(rate, -1)).toBe(0);
    expect(snapToStep(tax, 0.83)).toBe(1);
    expect(snapToStep(tax, -0.07)).toBe(0);
  });

  test('a stabiliser locked while another is unlocked has its note, if it has one, for its lever’s info panel (decision 0015); all locked or all unlocked: none', () => {
    const debt = { id: 'debt', lever: 'tax', locked: true };
    const notes = new Map([['debt', 'Tax held alone.'], ['rule', 'Key rate held alone.']]);
    expect([...lockedAloneNotes([state(), debt], notes)]).toEqual([['tax', 'Tax held alone.']]);
    expect([...lockedAloneNotes([state({ locked: true }), { ...debt, locked: false }], notes)]).toEqual([['rate', 'Key rate held alone.']]);
    expect(lockedAloneNotes([state({ locked: true }), debt], notes).size).toBe(0);
    expect(lockedAloneNotes([state(), { ...debt, locked: false }], notes).size).toBe(0);
    expect(lockedAloneNotes([state(), debt], new Map()).size).toBe(0);
  });
});
