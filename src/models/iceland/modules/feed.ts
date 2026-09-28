/**
 * Iceland Inc.: the narration feed, ported from engine v1's feedRules. Each rule fires when a
 * chart's displayed deviation crosses its threshold. The feed only narrates; it never changes
 * the model.
 */
import type { ModuleDef } from '../../../core/types.ts';

export const feed: ModuleDef = {
  id: 'feed',
  label: 'Narration feed',
  description: 'Messages that narrate threshold crossings of the charts, as in engine v1.',
  requires: ['indicators'],
  feed: [
    { id: 'rateUp', indicator: 'keyRate', above: 0.25, message: 'The central bank raises its key rate', concept: 'taylor-rule' },
    { id: 'rateDown', indicator: 'keyRate', below: -0.25, message: 'The central bank cuts its key rate', concept: 'taylor-rule' },
    { id: 'lendLess', indicator: 'netMortgage', below: -0.15, message: 'Banks lend less, so less new money is created', concept: 'endogenous-money' },
    { id: 'lendMore', indicator: 'netMortgage', above: 0.15, message: 'Banks lend more, creating new deposits', concept: 'endogenous-money' },
    { id: 'ciNeg', indicator: 'creditImpulse', below: -0.15, message: 'Credit is slowing: the credit impulse turns negative', concept: 'credit-impulse' },
    { id: 'youthJobs', indicator: 'unemploymentY', above: 0.3, message: 'Unemployment among young people rises', concept: 'okun-law' },
    { id: 'jobsUp', indicator: 'unemployment', below: -0.2, message: 'More people find work', concept: 'okun-law' },
    { id: 'inflUp', indicator: 'inflation', above: 0.5, message: 'Inflation picks up', concept: 'cost-pass-through' },
    { id: 'inflDown', indicator: 'inflation', below: -0.2, message: 'Inflation eases', concept: 'taylor-rule' },
    { id: 'kronaWeak', indicator: 'krona', below: -2, message: 'The króna weakens, making imports dearer', concept: 'exchange-rate-pass-through' },
    { id: 'kronaStrong', indicator: 'krona', above: 1, message: 'The króna strengthens as foreign money seeks higher rates', concept: 'carry-trade' },
    { id: 'housing', indicator: 'realHousePrice', above: 2, message: 'House prices outpace consumer prices', concept: 'credit-and-house-prices' },
    { id: 'housingDown', indicator: 'realHousePrice', below: -2, message: 'Real house prices fall', concept: 'credit-and-house-prices' },
    { id: 'debt', indicator: 'govDebt', above: 2, message: 'Government debt rises; the tax rule slowly leans against it', concept: 'fiscal-rule' },
    { id: 'realWageDown', indicator: 'realWage', below: -1, message: 'Real wages fall as prices outpace pay', concept: 'real-wages' },
    { id: 'oldGain', indicator: 'rdiO', above: 0.5, message: 'Older savers gain from higher interest income', concept: 'borrowers-and-savers' },
    { id: 'youngSqueeze', indicator: 'rdiY', below: -0.5, message: 'Young households’ budgets are squeezed', concept: 'borrowers-and-savers' },
    { id: 'money', indicator: 'broadMoney', above: 1, message: 'Broad money grows as new deposits are created', concept: 'endogenous-money' },
  ],
};
