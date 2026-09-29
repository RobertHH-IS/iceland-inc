/**
 * Iceland Inc.: helpers for module tests that check a rule's arithmetic when the model takes each
 * month in several kernel steps (ModelDef.substeps, decision 0011). A month records its end, and
 * its legs as the month's total ÷ dt; these helpers give a test the month's totals and every
 * kernel step on its own, so an invariant that held for one step a month is checked for each step.
 */
import type { Engine, Id } from '../../core/types.ts';
import type { KernelEngine } from '../../core/engine.ts';

/** What a test can read after a kernel step: its variables and its positions (Ctx.stock sign). */
export interface StepRead {
  value(id: Id): number;
  stock(instrument: Id, player: Id): number;
}

/** A leg's total over the month just stepped, in % of baseline GDP: its average annual rate over the
 *  month's steps (engine.legs()) × one month. */
export function monthTotal(e: Engine, amount: Id): number {
  const leg = e.legs().find((l) => l.amount === amount);
  if (!leg) throw new Error(`monthTotal: no leg has the amount '${amount}'`);
  return leg.value * (e as KernelEngine).model.def.dt;
}

/**
 * A fork of `e` (with `params`, as fork() takes them) that calls `pick` after every kernel step and
 * keeps what it returns in `steps`, oldest first. Being a fork, it reaches the harness's
 * accounting layer like any other run a module test makes.
 */
export function stepByStep<T>(e: Engine, pick: (read: StepRead) => T, params: Record<Id, number> = {}): { engine: KernelEngine; steps: T[] } {
  const steps: T[] = [];
  const engine = (e as KernelEngine).fork({ params, testHooks: { afterSubstep: (_month, _substep, read) => void steps.push(pick(read)) } });
  return { engine, steps };
}

/** Kernel steps a month. */
export const stepsAMonth = (e: Engine): number => (e as KernelEngine).model.def.substeps ?? 1;
