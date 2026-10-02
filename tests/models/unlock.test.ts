/**
 * Unlocking hands a lever back at once (the owner, 2 October 2026: "If we then unlock the
 * padlock... then it can immediately react along with everything else"). For the four levers with
 * a rule (Iceland's key rate and income tax, the reference economy's key rate and tax rate): after
 * a hold away from where the rule is heading, the lever moves in the very next month, from the
 * value held, toward the rule's value; it keeps moving every month after that; and the rest of the
 * economy reacts with it. A smooth first step is right (central banks move in steps); a month
 * without a move, or a gap too small to act on, would be a bug.
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

    test('with the other lever locked it is handed back just the same', () => {
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
