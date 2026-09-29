/**
 * Wrong-signed positions, in words (decision 0005). The kernel records the first month each
 * position took a sign its role does not allow: a holder's asset below zero, or a liability that
 * has turned into a claim. The accounting still balances, so this is a warning beside the
 * accounting badge, never an accounting failure: the model has been pushed past what it
 * describes, and the balance sheet is one no real sector could have. Pure functions.
 */
import type { Id, SignViolation } from '../../core/types.ts';
import { nodeLabel, type ModelInfo } from './info.ts';

export interface PositionWarning {
  instrument: Id;
  player: Id;
  /** First month the position had the wrong sign. */
  t: number;
  /** The position that month in % of GDP, in the Ctx.stock convention (so negative). */
  value: number;
  /** 'holder' (an asset went below zero) or 'issuer' (a liability turned into a claim). */
  role: SignViolation['role'];
  /** "Deposits of Pension funds went below zero in month 34". The position may have recovered
   *  since, so the sentence names the month it first happened. */
  text: string;
}

const instrumentLabel = (info: ModelInfo, id: Id) => info.instrumentById.get(id)?.label ?? id;

/** Each violation in words, oldest first, as the kernel lists them. */
export function positionWarnings(info: ModelInfo, violations: readonly SignViolation[]): PositionWarning[] {
  return violations.map((v) => {
    const what = instrumentLabel(info, v.instrument);
    const who = nodeLabel(info, v.player);
    const text = v.role === 'holder' ? `${what} of ${who} went below zero in month ${v.t}` : `${what} owed by ${who} turned into a claim in month ${v.t}`;
    return { instrument: v.instrument, player: v.player, role: v.role, t: v.t, value: v.value, text };
  });
}

/** The header badge: how many positions, in a word, or '' when there are none. */
export function positionBadge(n: number): string {
  if (n === 0) return '';
  return n === 1 ? '1 impossible position' : `${n} impossible positions`;
}

/** What the badge and a balance sheet say about every warning: the books still balance. */
export const POSITION_NOTE =
  'The books still balance, but no real sector could hold this: the levers have pushed the model past what it describes. It is a warning, not an accounting error.';
