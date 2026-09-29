/**
 * Reference economy: what theory predicts for each lever, marked ✓ or ✗ in the lever report
 * (bun run levers; docs/authoring.md section 12). The long-run entries record behaviour that is
 * intended, so a reviewer does not read it as a defect: with expectations partly anchored to the
 * target, a lasting boom leaves output above capacity and inflation steadily above target
 * (decision 0007), and a one-off wage settlement leaves the price level higher for good.
 */
import type { LeverExpectation } from '../../harness/lever-report.ts';

export const expectations: LeverExpectation[] = [
  {
    lever: 'lendingAppetite', setting: 'max', mode: 'Automatic', variable: 'investment', fromMonth: 1, toMonth: 24, sign: 1,
    theory: 'More credit supply finances more investment while net credit is flowing.',
    source: 'Bank of England (McLeay, Radia & Thomas 2014)',
  },
  {
    lever: 'lendingAppetite', setting: 'max', mode: 'Automatic', variable: 'creditImpulse', fromMonth: 24, toMonth: 48, sign: -1,
    theory: 'Credit impulse: once the extra lending is flowing, repayments on the extra debt slow net credit, so the impulse turns negative and the boost to demand fades.',
    source: 'Biggs, Mayer & Pick (2010)',
  },
  {
    lever: 'keyRateAddon', setting: 'max', mode: 'Automatic', variable: 'output', fromMonth: 6, toMonth: 60, sign: -1,
    theory: 'A tighter policy rate lowers demand and output.',
    source: 'Christiano, Eichenbaum & Evans (1999)',
  },
  {
    lever: 'keyRateAddon', setting: 'max', mode: 'Automatic', variable: 'inflation', fromMonth: 12, toMonth: 240, sign: -1,
    theory: 'A lasting offset works partly like a lower inflation target: inflation settles lower.',
    source: 'Taylor (1993); Woodford (2003, ch. 4)',
  },
  {
    lever: 'govSpending', setting: 'max', mode: 'Automatic', variable: 'output', fromMonth: 229, toMonth: 240, sign: 1,
    theory: 'Intended: with expectations anchored to the target, a lasting boom raises inflation by a steady amount rather than ever faster, so the Taylor rule leaves some output above capacity (the "back to the 1960s" Phillips curve). Were expectations to drift with inflation, output would return to capacity (Friedman 1968); the model keeps the anchor fixed.',
    source: 'Blanchard (2016)',
  },
  {
    lever: 'govSpending', setting: 'max', mode: 'Automatic', variable: 'inflation', fromMonth: 229, toMonth: 240, sign: 1,
    theory: 'Output above capacity keeps inflation above target.',
    source: 'Phillips (1958); Blanchard (2016)',
  },
  {
    lever: 'wageSettlement', setting: 'default', mode: 'Automatic', variable: 'priceLevel', fromMonth: 229, toMonth: 240, sign: 1,
    theory: 'An inflation-targeting central bank lets bygones be bygones: it does not bring the price level back down after a one-off cost shock.',
    source: 'Woodford (2003)',
  },
  {
    lever: 'taxRate', setting: 'max', mode: 'any', variable: 'realDisposableIncome', fromMonth: 1, toMonth: 12, sign: -1,
    theory: 'A higher income-tax rate lowers disposable income at once.',
    source: 'national accounts identity',
  },
  {
    lever: 'keyRateFixed', setting: 'min', mode: 'Manual', variable: 'inflation', fromMonth: 24, toMonth: 120, sign: 1,
    theory: 'A key rate held below neutral with no other anchor lets inflation rise (Wicksell’s cumulative process).',
    source: 'Wicksell (1898); Friedman (1968)',
  },
];
