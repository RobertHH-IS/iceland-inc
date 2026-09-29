/**
 * Reference economy: what theory predicts for each lever, marked ✓ or ✗ in the lever report
 * (bun run levers; docs/authoring.md section 12). The long-run entries record behaviour that is
 * intended, so a reviewer does not read it as a defect: with expectations partly anchored to the
 * target, a lasting boom leaves output above capacity and inflation steadily above target
 * (decision 0007), a one-off wage settlement leaves the price level higher for good, and a large
 * lasting cut in spending holds the key rate at zero for years (a liquidity trap).
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
    lever: 'lendingAppetite', setting: 'max', mode: 'Automatic', variable: 'output', fromMonth: 229, toMonth: 240, sign: 1,
    theory: 'Intended: the boost fades from its peak (about 2.1% after a year and a half; a module test checks it falls by more than a third) but output stays about 1% higher for good. The extra loans stay in the economy as household deposits, and the interest on the extra debt and on a higher key rate reaches households as income, which they spend (the stock-flow view of credit: a lasting rise in lending leaves a lasting rise in money).',
    source: 'Godley & Lavoie (2007, ch. 7); Keen (2011)',
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
    lever: 'govSpending', setting: 'min', mode: 'Automatic', variable: 'keyRate', fromMonth: 48, toMonth: 180, sign: -1,
    theory: 'Intended: a large lasting cut in spending pushes the key rate to zero, where neither it nor deposit rates can fall further, so monetary policy cannot offset the cut (a liquidity trap). The key rate stays at or just above zero for about 15 years, until the debt rule’s tax cuts have brought demand back; output is still about 4% lower after ten years and 1.4% lower after twenty, and still recovering. With a zero inflation target and a 3% neutral rate the central bank has only 3 points to cut.',
    source: 'Eggertsson & Krugman (2012); DeLong & Summers (2012); Eggertsson, Juelsrud, Summers & Wold (2019)',
  },
  {
    lever: 'govSpending', setting: 'min', mode: 'Automatic', variable: 'output', fromMonth: 229, toMonth: 240, sign: -1,
    theory: 'Intended: after a liquidity trap output recovers only as fast as fiscal policy brings demand back, here the debt rule cutting taxes as debt falls, so twenty years on it is still below where it would have been.',
    source: 'DeLong & Summers (2012)',
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
