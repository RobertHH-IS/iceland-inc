/**
 * Unlocking hands a lever back at once (the owner, 2 October 2026: "If we then unlock the
 * padlock... then it can immediately react along with everything else"). For the four levers with
 * a rule (Iceland's key rate and income tax, the reference economy's key rate and tax rate): after
 * a hold away from where the rule is heading, the lever moves in the very next month, from the
 * value held, toward the rule's value; it keeps moving every month after that; and the rest of the
 * economy reacts with it. A smooth first step is right (central banks move in steps); a month
 * without a move, or a gap too small to act on, would be a bug.
 *
 * Two things at the edges are pinned here as well. A lever is in force once a month has run with
 * it, so in the kernel a lever set and unlocked within one month was never in force (the interface
 * runs the month first, tests/ui/engine-client.test.ts). And while the key rate is held away from
 * neutral, the debt rule's destination can be the tax rate handed back to it, which then stands
 * still until the boom or slump has passed: decision 0016's rule that the tax never moves against
 * the cycle, recorded as a choice, with the question it leaves for the owner.
 */
import { describe, expect, test } from 'bun:test';
import { createEngine, type KernelEngine } from '../../src/core/engine.ts';
import type { ModelDef } from '../../src/core/types.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { referenceModel } from '../../src/models/reference/index.ts';

interface Case {
  model: ModelDef;
  lever: string;
  /** The other lever with a rule. */
  other: string;
  /** Holds away from the lever's default, in lever units: two points each way where the range
   *  allows, and one click of the stepper each way. */
  offsets: number[];
  /** The first month's move after a hold two points from the rule, in lever units. */
  firstMove: number;
  /** The share of the gap a month's step closes: between these. */
  share: [number, number];
}

const CASES: Case[] = [
  { model: icelandModel, lever: 'keyRate', other: 'incomeTax', offsets: [2, -2, 0.25, -0.25], firstMove: 0.22, share: [0.1, 0.12] },
  { model: icelandModel, lever: 'incomeTax', other: 'keyRate', offsets: [2, -2, 0.5, -0.5], firstMove: 0.08, share: [0.035, 0.045] },
  { model: referenceModel, lever: 'keyRate', other: 'taxRate', offsets: [2, -2, 0.25, -0.25], firstMove: 0.18, share: [0.08, 0.1] },
  // the reference tax lever goes down to −1 only
  { model: referenceModel, lever: 'taxRate', other: 'keyRate', offsets: [2, -1, 0.5, -0.5], firstMove: 0.08, share: [0.035, 0.05] },
];

const bases = new Map<ModelDef, KernelEngine>();
const fresh = (model: ModelDef): KernelEngine => {
  if (!bases.has(model)) bases.set(model, createEngine(model, { dev: false }));
  return createEngine(model, { dev: false, baseline: bases.get(model)!.baselineData });
};
const pad = (e: KernelEngine, lever: string) => e.stabilisers().find((s) => s.lever === lever)!;

/** Hold `lever` at its default + `offset` for `months`, with the other lever's padlock open or
 *  closed, then unlock it. `keep` is the same run with the lever still held. */
function holdThenUnlock(c: Case, offset: number, months: number, otherLocked = false) {
  const e = fresh(c.model);
  if (otherLocked) e.setLever(pad(e, c.other).lock, 1);
  e.setLever(c.lever, e.leverValue(c.lever) + offset); // moving it locks it
  e.step(months);
  const before = pad(e, c.lever);
  const keep = e.fork();
  e.setLever(before.lock, 0);
  return { e, keep, held: before.current, gap: before.suggested - before.current };
}

for (const c of CASES) {
  describe(`unlocking ${c.model.id}'s ${c.lever} after a hold`, () => {
    test('the lever moves in the very next month, from the value held, toward where its rule is heading, whether the hold was a month or five years and two points or one click', () => {
      for (const offset of c.offsets) {
        for (const months of [1, 12, 60]) {
          const { e, held, gap } = holdThenUnlock(c, offset, months);
          expect(held).toBeCloseTo(e.leverValue(c.lever), 12); // held exactly where it was set
          expect(Math.sign(gap)).toBe(-Math.sign(offset));
          // unlocked, and nothing has jumped before the month runs
          expect(pad(e, c.lever).locked).toBe(false);
          expect(pad(e, c.lever).current).toBeCloseTo(held, 12);
          e.step(1);
          const share = (pad(e, c.lever).current - held) / gap;
          expect(share).toBeGreaterThan(c.share[0]); // no delay and no dead zone
          expect(share).toBeLessThan(c.share[1]); // one smoothed step, not a jump onto the rule's path
        }
      }
    });

    test(`two points from the rule, the first month moves it about ${c.firstMove} ${c.lever === 'keyRate' ? 'point' : 'pp'}`, () => {
      const { e, held, gap } = holdThenUnlock(c, 2, 1);
      expect(Math.abs(gap)).toBeCloseTo(2, 1);
      e.step(1);
      expect(held - pad(e, c.lever).current).toBeCloseTo(c.firstMove, 2);
    });

    test('it keeps moving every month after that, and output reacts from the first month, with jobs, inflation and the other rule from the second', () => {
      for (const offset of c.offsets.slice(0, 2)) {
        const { e, keep, held, gap } = holdThenUnlock(c, offset, 12);
        let last = held;
        for (let m = 1; m <= 24; m++) {
          e.step(1);
          keep.step(1);
          const now = pad(e, c.lever).current;
          expect(now).not.toBe(last);
          // for the first half-year, well short of where the rule is heading, always toward it
          if (m <= 6) expect(Math.sign(now - last)).toBe(Math.sign(gap));
          last = now;
          expect(pad(keep, c.lever).current).toBe(held); // still held, it never moves
          // the economy with the lever handed back parts from the one that still holds it
          expect(e.value('output')).not.toBe(keep.value('output'));
          if (m > 1) for (const i of ['unemployment', 'inflation']) expect(e.indicator(i)).not.toBe(keep.indicator(i));
          if (m > 1) expect(pad(e, c.other).current).not.toBe(pad(keep, c.other).current);
        }
        // handing back a lever held high (a high key rate, a high tax) lifts output, and one held low lowers it
        expect(Math.sign(e.value('output') - keep.value('output'))).toBe(Math.sign(offset));
      }
    });

    test('with the other lever locked at its default it is handed back just the same', () => {
      for (const offset of c.offsets) {
        const { e, keep, held, gap } = holdThenUnlock(c, offset, 12, true);
        e.step(1);
        keep.step(1);
        const share = (pad(e, c.lever).current - held) / gap;
        expect(share).toBeGreaterThan(c.share[0]);
        expect(share).toBeLessThan(c.share[1]);
        expect(pad(e, c.other).locked).toBe(true);
        expect(pad(e, c.other).current).toBe(pad(keep, c.other).current); // the other stays where it is held
        expect(e.value('output')).not.toBe(keep.value('output'));
      }
    });
  });
}

describe('a lever set and unlocked within one month (the kernel’s contract)', () => {
  test('it was never in force, so its rule carries on from where it stood; a month with it is enough to hand back from it', () => {
    for (const c of CASES) {
      const e = fresh(c.model);
      e.step(6);
      const set = e.leverValue(c.lever) + 2;
      const held = e.fork();
      e.setLever(c.lever, set);
      expect(pad(e, c.lever)).toMatchObject({ locked: true, current: set });
      e.setLever(pad(e, c.lever).lock, 0);
      // no month ran with the lever: the value in force is still the rule's own
      expect(pad(e, c.lever).current).toBeCloseTo(set - 2, 9);
      // the interface therefore runs one month before it opens the padlock (EngineClient.setLever)
      held.setLever(c.lever, set);
      held.step(1);
      held.setLever(pad(held, c.lever).lock, 0);
      expect(pad(held, c.lever).current).toBeCloseTo(set, 12);
      held.step(1);
      const share = (pad(held, c.lever).current - set) / -2;
      expect(share).toBeGreaterThan(c.share[0]);
      expect(share).toBeLessThan(c.share[1]);
    }
  });
});

describe('a tax lever handed back while the key rate is held away from neutral (decision 0016)', () => {
  /** Hold the key rate at `key` and the tax lever `shift` points from its default for `months`,
   *  then unlock the tax lever. */
  const handBack = (c: Case, key: number, shift: number, months: number) => {
    const e = fresh(c.model);
    e.setLever('keyRate', key);
    e.setLever(c.lever, shift);
    e.step(months);
    const before = pad(e, c.lever);
    e.setLever(before.lock, 0);
    return { e, held: before.current, heading: before.suggested };
  };
  /** How many of the next `months` leave the tax lever where it was the month before. */
  const monthsStill = (e: KernelEngine, lever: string, months: number) => {
    let n = 0,
      last = pad(e, lever).current;
    for (let m = 1; m <= months; m++) {
      e.step(1);
      const now = pad(e, lever).current;
      if (Math.abs(now - last) < 1e-9) n++;
      last = now;
    }
    return n;
  };
  const TAX = CASES.filter((c) => c.lever !== 'keyRate');
  // the key rate held low (a boom) or high (a slump), the tax lever held with the cycle's lean and
  // beyond it, and how long the definition says it then stands still: [model, key rate, shift,
  // months held, months it stands still at least, the month by which it has moved]
  const STILL: [string, number, number, number, number, number][] = [
    ['iceland', 0, 1, 12, 96, 120], // "more than eight years" in the lever's definition
    ['iceland', 8, -1, 36, 36, 72],
    ['reference', 1, 1, 12, 30, 72], // "almost three years"
    ['reference', 6, -1, 12, 30, 72],
  ];

  test('the debt rule does not move the tax against the cycle, so a rate held above its own in a boom, or below it in a slump, stands still until the cycle has passed', () => {
    // Decision 0016: with the key rate held, no tax rise while output is more than 1% below
    // potential and no cut while it is more than a quarter of a percent above. The rule's
    // destination is then the rate in force, so the lever shows "auto" at the held rate: handed
    // back, with nowhere to go yet. Letting the rule unwind a held shift toward its
    // cycle-consistent rate would also let it raise taxes as a slump eases and cut them as a boom
    // fades, which the tests of decision 0016 forbid; whether a hand-back should be an exception
    // is a question for the owner.
    for (const [modelId, key, shift, months, still, moved] of STILL) {
      const c = TAX.find((x) => x.model.id === modelId)!;
      const { e, held, heading } = handBack(c, key, shift, months);
      expect(held).toBe(shift);
      expect(heading).toBeCloseTo(held, 9); // where the rule is heading is the rate in force
      expect(pad(e, c.lever).locked).toBe(false);
      e.step(1);
      expect(e.influences('var:taxRuleTarget').regime).toMatch(shift > 0 ? /^Key rate held: low debt cuts no tax/ : /^Key rate held: debt adds no tax/);
      const output = e.value('output');
      expect(monthsStill(e, c.lever, still - 1)).toBe(still - 1);
      expect(pad(e, c.lever).current).toBeCloseTo(held, 9);
      expect(e.value('output')).not.toBe(output); // the rest of the economy moves on
      e.step(moved - still);
      expect(Math.abs(pad(e, c.lever).current - held)).toBeGreaterThan(0.05); // and so does the rule, once the cycle has passed
    }
    const def = (c: Case) => bases.get(c.model)!.model.levers.find((l) => l.id === c.lever)!.definition;
    expect(def(TAX[0])).toMatch(/with the key rate held at 0%, income tax held 1 point up for a year and then unlocked stays there for more than eight years/);
    expect(def(TAX[1])).toMatch(/with the key rate held at 1%, a tax rate held 1 point up for a year and then unlocked stays there for almost three years/);
  });

  test('held the other way, against the cycle’s lean, it moves in the very next month', () => {
    for (const [modelId, key, shift, months] of STILL) {
      const c = TAX.find((x) => x.model.id === modelId)!;
      const { e, held, heading } = handBack(c, key, -shift, months);
      expect(Math.sign(heading - held)).toBe(Math.sign(shift));
      e.step(1);
      const share = (pad(e, c.lever).current - held) / (heading - held);
      expect(share).toBeGreaterThan(c.share[0]);
      expect(share).toBeLessThan(c.share[1]);
    }
  });
});
