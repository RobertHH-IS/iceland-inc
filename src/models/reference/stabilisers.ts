/**
 * Reference economy: the stabiliser setting (decision 0004).
 *
 * The economy has two policy rules that can react by themselves: the central bank's Taylor rule
 * and the government's debt rule on the income-tax rate. This module declares the one setting that
 * decides whether they do. Unlike the Iceland model, the reference economy starts on Automatic: it
 * has no other anchor, so with both rules held it swings for decades after a small shock
 * (decision 0004 has the numbers). Manual is there to show why.
 */
import type { Ctx, ModuleDef } from '../../core/types.ts';

export const MANUAL = 0;
export const AUTOMATIC = 1;
/** True when the policy rules act (Automatic). A rule that reads it declares `levers: ['stabilisers']`. */
export const automatic = (c: Ctx): boolean => Math.round(c.lever('stabilisers')) >= AUTOMATIC;

export const stabilisers: ModuleDef = {
  id: 'stabilisers',
  label: 'Stabilisers',
  description: 'The setting that decides whether the Taylor rule and the debt rule act by themselves or only suggest.',
  levers: [
    {
      id: 'stabilisers',
      label: 'Stabilisers',
      group: 'Policy',
      section: 'Stabilisers',
      kind: 'choice',
      unit: 'mode',
      default: AUTOMATIC,
      min: MANUAL,
      max: AUTOMATIC,
      step: 1,
      options: [
        { value: MANUAL, label: 'Manual' },
        { value: AUTOMATIC, label: 'Automatic' },
      ],
      description:
        'Who reacts when the economy moves: you or the policy rules. Automatic (this economy’s default): the Taylor rule sets the key rate and the debt rule sets the income-tax rate; your levers add to them. Manual: every policy lever stays where you set it, and the rules only suggest. In both, taxes still rise and fall with incomes.',
      definition:
        'Switch, persistent while set, taking effect in the month it is set. Automatic (1, the default here): the key rate follows the Taylor rule, whose target includes your offset, and the income-tax rate follows the debt rule, plus your tax lever. Manual (0): the key rate is the level of the “Key interest rate” lever and the tax rate is its normal level plus your tax lever; both rules keep computing what they would do, shown as suggestions. The baseline is the same in both modes.',
      concepts: ['taylor-rule', 'policy-lags'],
    },
  ],
};
