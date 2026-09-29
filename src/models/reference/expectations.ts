/**
 * Reference economy: what theory predicts for each lever, marked ✓ or ✗ in the lever report
 * (bun run levers; docs/authoring.md section 12). The harness (bun run harness, robustness layer)
 * fails when one does not hold. The short- and medium-run signs come from the lever vetting of 29
 * September 2026 (docs/audit/lever-vetting.md). The long-run entries are signs theory gives any
 * inflation-targeting economy: a one-off wage settlement leaves the price level higher for good, and
 * a large lasting cut in spending holds the key rate at zero for years (a liquidity trap). What
 * rests only on this model's fixed anchor for expectations (decision 0008), such as a lasting boom
 * leaving output above capacity, is not an expectation: module tests pin it as a known limitation
 * (tests/models/reference-review.test.ts; lever-vetting open item 10).
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
  // ------------------------------------------------ from the lever vetting of 29 September 2026
  // Government spending
  { lever: 'govSpending', setting: 'up', variable: 'output', fromMonth: 1, toMonth: 12, sign: 1, theory: 'Keynesian spending multiplier: government purchases are output at once and raise incomes and consumption.', source: 'Blanchard & Perotti (2002) QJE; Ramey (2019) JEP' },
  { lever: 'govSpending', setting: 'min', variable: 'output', fromMonth: 1, toMonth: 12, sign: -1, theory: 'The multiplier in reverse: lower purchases cut output and incomes.', source: 'Ramey (2019) JEP' },
  { lever: 'govSpending', setting: 'up', variable: 'deficit', fromMonth: 1, toMonth: 6, sign: 1, theory: 'Budget accounting: extra spending widens the deficit before higher tax revenue offsets part of it.', source: 'Godley & Lavoie (2007), Monetary Economics, ch. 3' },
  { lever: 'govSpending', setting: 'up', variable: 'unemployment', fromMonth: 3, toMonth: 24, sign: -1, theory: 'Okun’s law: more output needs more work.', source: 'Okun (1962); Ball, Leigh & Loungani (2017)' },
  { lever: 'govSpending', setting: 'up', variable: 'inflation', fromMonth: 12, toMonth: 36, sign: 1, theory: 'Phillips curve: a tighter labour market raises wage growth, which passes into prices.', source: 'Phillips (1958); Galí (2011)' },
  { lever: 'govSpending', setting: 'up', mode: 'Automatic', variable: 'keyRate', fromMonth: 6, toMonth: 36, sign: 1, theory: 'Taylor rule: the central bank raises its rate against a positive output gap and rising inflation.', source: 'Taylor (1993)' },
  { lever: 'govSpending', setting: 'up', mode: 'Automatic', variable: 'investment', fromMonth: 24, toMonth: 120, sign: -1, theory: 'Crowding out: under a Taylor rule, higher real rates reduce private investment once the initial accelerator boost fades.', source: 'Blanchard, Macroeconomics (IS–LM/IS–MP); Woodford (2011) AEJ Macro' },

  // The income-tax rate
  { lever: 'taxRate', setting: 'up', variable: 'output', fromMonth: 1, toMonth: 12, sign: -1, theory: 'Tax multiplier: a higher income-tax rate lowers disposable income and consumption.', source: 'Romer & Romer (2010) AER; Mertens & Ravn (2013) AER' },
  { lever: 'taxRate', setting: 'down', variable: 'output', fromMonth: 1, toMonth: 12, sign: 1, theory: 'Tax multiplier in reverse: a tax cut raises disposable income and spending.', source: 'Romer & Romer (2010) AER' },
  { lever: 'taxRate', setting: 'up', variable: 'realDisposableIncome', fromMonth: 1, toMonth: 12, sign: -1, theory: 'Disposable income is income after tax, so a higher tax rate lowers it at once.', source: 'National accounts identity (SNA 2008)' },
  { lever: 'taxRate', setting: 'up', variable: 'realConsumption', fromMonth: 1, toMonth: 12, sign: -1, theory: 'Consumption function: spending follows disposable income.', source: 'Keynes (1936); Jappelli & Pistaferri (2010)' },
  { lever: 'taxRate', setting: 'up', variable: 'deficit', fromMonth: 1, toMonth: 6, sign: -1, theory: 'Budget accounting: higher tax revenue narrows the deficit.', source: 'Godley & Lavoie (2007), ch. 3' },
  { lever: 'taxRate', setting: 'up', variable: 'unemployment', fromMonth: 3, toMonth: 24, sign: 1, theory: 'Okun’s law: lower output needs less work.', source: 'Okun (1962)' },
  { lever: 'taxRate', setting: 'up', mode: 'Automatic', variable: 'keyRate', fromMonth: 6, toMonth: 36, sign: -1, theory: 'Taylor rule: the central bank cuts its rate against the negative output gap and lower inflation.', source: 'Taylor (1993)' },

  // The offset to the rule
  { lever: 'keyRateAddon', setting: 'up', mode: 'Automatic', variable: 'keyRate', fromMonth: 1, toMonth: 12, sign: 1, theory: 'A positive offset raises the rule’s target, so the key rate rises in the short run.', source: 'Taylor (1993)' },
  { lever: 'keyRateAddon', setting: 'up', mode: 'Automatic', variable: 'output', fromMonth: 6, toMonth: 36, sign: -1, theory: 'Monetary transmission: higher real rates reduce investment and consumption, with lags.', source: 'Christiano, Eichenbaum & Evans (1999); Ramey (2016)' },
  { lever: 'keyRateAddon', setting: 'down', mode: 'Automatic', variable: 'output', fromMonth: 6, toMonth: 36, sign: 1, theory: 'Monetary easing: lower real rates raise interest-sensitive demand.', source: 'Christiano, Eichenbaum & Evans (1999)' },
  { lever: 'keyRateAddon', setting: 'up', mode: 'Automatic', variable: 'inflation', fromMonth: 12, toMonth: 60, sign: -1, theory: 'Tighter policy lowers inflation after a lag, through the output gap and the Phillips curve.', source: 'Havranek & Rusnak (2013) IJCB' },
  { lever: 'keyRateAddon', setting: 'up', mode: 'Automatic', variable: 'unemployment', fromMonth: 6, toMonth: 36, sign: 1, theory: 'Okun’s law following the monetary contraction.', source: 'Okun (1962); Ramey (2016)' },
  { lever: 'keyRateAddon', setting: 'up', mode: 'Automatic', variable: 'investment', fromMonth: 6, toMonth: 36, sign: -1, theory: 'User cost of capital: a higher real loan rate lowers investment.', source: 'Jorgenson (1963); Chirinko (1993)' },
  { lever: 'keyRateAddon', setting: 'max', mode: 'Automatic', variable: 'priceLevel', fromMonth: 24, toMonth: 120, sign: -1, theory: 'Persistent tightening (a lower implied inflation target) lowers the path of the price level.', source: 'Taylor (1993); Woodford (2003)' },

  // The key rate held on Manual
  { lever: 'keyRateFixed', setting: 'up', mode: 'Manual', variable: 'keyRate', fromMonth: 1, toMonth: 240, sign: 1, theory: 'On Manual the key rate is held where the user sets it.', source: 'Decision 0004 (policy held on Manual)' },
  { lever: 'keyRateFixed', setting: 'up', mode: 'Manual', variable: 'output', fromMonth: 3, toMonth: 24, sign: -1, theory: 'Interest-rate channel: a higher held rate reduces demand.', source: 'Christiano, Eichenbaum & Evans (1999); Bernanke & Gertler (1995)' },
  { lever: 'keyRateFixed', setting: 'down', mode: 'Manual', variable: 'output', fromMonth: 3, toMonth: 24, sign: 1, theory: 'Interest-rate channel: a lower held rate raises demand.', source: 'Christiano, Eichenbaum & Evans (1999)' },
  { lever: 'keyRateFixed', setting: 'up', mode: 'Manual', variable: 'inflation', fromMonth: 12, toMonth: 36, sign: -1, theory: 'A contraction lowers inflation through the Phillips curve, with lags.', source: 'Havranek & Rusnak (2013)' },
  { lever: 'keyRateFixed', setting: 'up', mode: 'Manual', variable: 'unemployment', fromMonth: 3, toMonth: 24, sign: 1, theory: 'Okun’s law.', source: 'Okun (1962)' },
  { lever: 'keyRateFixed', setting: 'up', mode: 'Manual', variable: 'investment', fromMonth: 3, toMonth: 24, sign: -1, theory: 'User cost of capital.', source: 'Jorgenson (1963); Chirinko (1993)' },
  { lever: 'keyRateFixed', setting: 'up', mode: 'Manual', variable: 'realConsumption', fromMonth: 3, toMonth: 24, sign: -1, theory: 'Intertemporal substitution plus the fall in income that follows.', source: 'Hall (1988); Ramey (2016)' },

  // Wage settlement
  { lever: 'wageSettlement', setting: 'max', variable: 'priceLevel', fromMonth: 1, toMonth: 240, sign: 1, theory: 'Markup pricing and cost pass-through: higher unit labour costs raise prices, and a one-off level shift is not reversed.', source: 'Kalecki (1954); Blanchard (1986) QJE' },
  { lever: 'wageSettlement', setting: 'min', variable: 'priceLevel', fromMonth: 3, toMonth: 60, sign: -1, theory: 'Cost pass-through in reverse: lower unit labour costs lower prices.', source: 'Kalecki (1954); Blanchard (1986)' },
  { lever: 'wageSettlement', setting: 'max', variable: 'inflation', fromMonth: 1, toMonth: 12, sign: 1, theory: 'Pass-through of the cost jump raises measured inflation over the following year.', source: 'Bernanke & Blanchard (2023)' },
  { lever: 'wageSettlement', setting: 'max', variable: 'realWage', fromMonth: 1, toMonth: 12, sign: 1, theory: 'Nominal wages jump before prices adjust, so real wages rise at first.', source: 'Blanchard (1986)' },
  { lever: 'wageSettlement', setting: 'max', variable: 'realProfit', fromMonth: 1, toMonth: 12, sign: -1, theory: 'Profit squeeze: wage costs rise before prices catch up.', source: 'Glyn & Sutcliffe (1972); Goodwin (1967)' },
  { lever: 'wageSettlement', setting: 'max', mode: 'Automatic', variable: 'keyRate', fromMonth: 3, toMonth: 24, sign: 1, theory: 'Taylor rule: the central bank reacts to higher inflation.', source: 'Taylor (1993)' },
  { lever: 'wageSettlement', setting: 'max', mode: 'Automatic', variable: 'output', fromMonth: 12, toMonth: 36, sign: -1, theory: 'Cost-push shock plus a policy response gives stagflation: output falls as real rates and real incomes adjust.', source: 'Blanchard, Macroeconomics (AS–AD); Galí (2015), ch. 5' },
  { lever: 'wageSettlement', setting: 'max', mode: 'Automatic', variable: 'unemployment', fromMonth: 12, toMonth: 36, sign: 1, theory: 'Okun’s law following the policy-induced slowdown.', source: 'Okun (1962)' },

  // Lending appetite
  { lever: 'lendingAppetite', setting: 'max', variable: 'broadMoney', fromMonth: 1, toMonth: 60, sign: 1, theory: 'Endogenous money: new bank loans create deposits.', source: 'McLeay, Radia & Thomas (2014) BoE Quarterly Bulletin' },
  { lever: 'lendingAppetite', setting: 'min', variable: 'broadMoney', fromMonth: 1, toMonth: 60, sign: -1, theory: 'Money destruction: less new lending while repayments continue shrinks deposits.', source: 'McLeay, Radia & Thomas (2014)' },
  { lever: 'lendingAppetite', setting: 'max', variable: 'investment', fromMonth: 1, toMonth: 24, sign: 1, theory: 'Credit-supply expansion finances extra investment.', source: 'Gilchrist & Zakrajšek (2012) AER; Bernanke & Gertler (1995)' },
  { lever: 'lendingAppetite', setting: 'max', variable: 'output', fromMonth: 1, toMonth: 24, sign: 1, theory: 'Credit impulse: accelerating credit adds to demand.', source: 'Biggs, Mayer & Pick (2010); Mian, Sufi & Verner (2017) QJE' },
  { lever: 'lendingAppetite', setting: 'min', variable: 'output', fromMonth: 1, toMonth: 24, sign: -1, theory: 'A negative credit impulse subtracts from demand.', source: 'Biggs, Mayer & Pick (2010); Gilchrist & Zakrajšek (2012)' },
  { lever: 'lendingAppetite', setting: 'max', variable: 'privateDebt', fromMonth: 12, toMonth: 60, sign: 1, theory: 'More lending raises the stock of private debt relative to GDP.', source: 'Jordà, Schularick & Taylor (2013)' },
  { lever: 'lendingAppetite', setting: 'max', variable: 'unemployment', fromMonth: 3, toMonth: 24, sign: -1, theory: 'Okun’s law following the credit-driven boom.', source: 'Okun (1962)' },
  { lever: 'lendingAppetite', setting: 'max', mode: 'Automatic', variable: 'keyRate', fromMonth: 6, toMonth: 36, sign: 1, theory: 'Taylor rule leans against the boom.', source: 'Taylor (1993)' },
];
