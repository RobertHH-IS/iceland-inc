/**
 * Iceland Inc.: the stabiliser setting (decision 0004).
 *
 * Two policy rules can react to the economy by themselves: the central bank's inflation rule
 * (central-bank.ts) and the debt rule on income tax (government.ts). This module declares the one
 * global setting that decides whether they do. In Manual (the default) every policy lever stays
 * where the user sets it and the rules only suggest; in Automatic they act, and the user's levers
 * become offsets to them. Institutional responses (tax revenue and unemployment benefits rising
 * and falling with incomes and jobs) work the same way in both modes.
 */
import type { ModuleDef } from '../../../core/types.ts';
import { AUTOMATIC, MANUAL, STABILISERS } from '../util.ts';

export const stabilisers: ModuleDef = {
  id: 'stabilisers',
  label: 'Stabilisers',
  description: 'The global setting that decides whether the policy rules (the central bank’s inflation rule and the debt rule on income tax) act by themselves or only suggest.',
  levers: [
    {
      id: STABILISERS,
      label: 'Stabilisers',
      group: 'Policy',
      section: 'Stabilisers',
      kind: 'choice',
      unit: 'mode',
      default: MANUAL,
      min: MANUAL,
      max: AUTOMATIC,
      step: 1,
      options: [
        { value: MANUAL, label: 'Manual' },
        { value: AUTOMATIC, label: 'Automatic' },
      ],
      description:
        'Who reacts when the economy moves: you or the policy rules. Manual: every policy lever stays exactly where you set it; the central bank’s inflation rule and the debt rule only suggest, and a lever turns red when its rule would act. Automatic: the central bank’s rule sets the key rate and the debt rule leans on the income-tax rate; your levers then add to or subtract from what the rules do. In both, tax revenue and unemployment benefits still rise and fall with incomes and jobs, at the rates set.',
      definition:
        'Switch, persistent while set, taking effect in the month it is set. Manual (0, the default): the key rate is the level of the “Key interest rate” lever, and the income-tax rate is its baseline plus the income-tax lever; both rules keep computing what they would do, shown as suggestions. Automatic (1): the key rate is the rule’s rate plus your offset, and the debt rule’s adjustment is added to the income-tax rate. Switching back to Manual stops both reactions at once: the key rate returns to the level set on its lever and the debt rule’s adjustment drops out of the tax rate. The baseline is the same in both modes.',
      concepts: ['taylor-rule', 'fiscal-rule'],
    },
  ],
};
