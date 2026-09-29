/**
 * Reference economy: the stabiliser setting (decision 0004).
 *
 * The economy has two policy rules that can react by themselves: the central bank's Taylor rule
 * and the government's debt rule on the income-tax rate. This module declares the one setting that
 * decides whether they do. Unlike the Iceland model, the reference economy starts on Automatic: it
 * has no other nominal anchor than the Taylor rule, so with both rules held a lasting shock keeps
 * moving output and prices for years (decisions 0004 and 0008 have the numbers). Manual is there
 * to show why.
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
        'Who reacts when the economy moves: you or the policy rules. Automatic (this economy’s default): the Taylor rule sets the key rate and the debt rule sets the income-tax rate; your levers add to them. Manual: every policy lever stays where you set it, and the rules only suggest. In both, taxes still rise and fall with incomes. This economy has no nominal anchor other than these rules: on Manual, with the key rate held, a lasting shock feeds on itself for years.',
      definition:
        'Switch, persistent while set, taking effect in the month it is set. Automatic (1, the default here): the key rate follows the Taylor rule, whose target includes your offset, and the income-tax rate follows the debt rule, plus your tax lever. Manual (0): the key rate is the level of the “Key interest rate” lever and the tax rate is its normal level plus your tax lever; both rules keep computing what they would do, shown as suggestions. The baseline is the same in both modes. On Manual no policy rule anchors prices: with the key rate held, rising inflation lowers the real interest rate and feeds more spending (Wicksell’s cumulative process), so output can run well above capacity for years and prices and debt ratios drift for decades. The only pull back is slow: higher prices lower the real value of households’ deposits, which holds their spending back (a real-balance effect), so after a 10% wage settlement the price level peaks about 12% higher and then drifts back toward 7.5% higher over twenty years. Treat effects beyond two or three years on Manual as a picture of an economy without its nominal anchor (decision 0004).',
      concepts: ['taylor-rule', 'debt-feedback', 'policy-lags'],
    },
  ],
};
