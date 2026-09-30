/**
 * Iceland Inc.: the central bank (v1 equations E1–E3 and E26).
 *
 * A Taylor-type rule works out the key rate the central bank's inflation rule calls for, from
 * expected and actual inflation and the output gap, every month, whether the key rate is locked or
 * not. The rule does not jump there: each month it closes part of the gap from the rate actually in
 * force last month, its own rate when it was in charge (unlocked) or the rate you held (locked), so
 * unlocking starts it from your rate (interest-rate smoothing). Who sets the key rate depends on the
 * key-rate lever's padlock (decision 0010): unlocked (the default) the rule does, and the lever
 * follows it; locked, you do, and the rule only suggests where it is heading. It never goes below zero.
 * The rule's neutral rate is an estimate the central bank revises slowly while inflation or
 * unemployment stays away from normal, so a lasting shock does not leave inflation off target for
 * good (an integral term, clamped to a band).
 * The rule reads its output gap from the labour market (decision 0012): Okun's factor times how far
 * unemployment is below normal, so the potential output it measures against follows the labour force
 * the economy has, whatever moves it (newcomers, the migration buffer, a shift toward services that
 * need many staff). The fixed baseline capacity, `potentialOutput`, is still what the markup's
 * capacity term and the investment accelerator read.
 * The central bank pays the key rate on banks' reserves, earns interest on its bonds and foreign
 * reserves, and hands its profit to the government. It sells the normal yield on its foreign reserves
 * for krónur and slowly brings the reserves back toward their target share of GDP.
 */
import type { Ctx, Id, ModuleDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { normalUnemployment, restrainingUnemployment } from './labour-and-wages.ts';
import { stepByStep, stepsAMonth } from '../testing.ts';
import { gapShare, lockPolicy, overMonth, pickParams, terms, lastMonth, MONTH, KEY_RATE_RULE } from '../util.ts';

/** How far the rule was heading below zero last month, as a share of escapeBand (0 to 1): at 1 the
 *  rule is stuck at the zero lower bound. The debt rule's escape clause (government.ts) uses the
 *  same. Last month's news, as for every policy reading (decision 0011). */
export const zeroBoundWeight = (c: Ctx): number => Math.min(1, Math.max(0, -lastMonth(c, 'ruleTarget') / c.p('escapeBand')));

/** The share of the gap to its target a smoothed policy rule closes: each kernel step while it is
 *  in charge (its lever unlocked), and a whole month's at once for the value shown while its lever
 *  is locked, so the rate shown on a locked lever is where the rule would stand after its first
 *  month in charge, whatever the step (decisions 0010 and 0011). `rule` is the stabiliser's id; a
 *  rule that calls it declares `locks: [rule]`. */
export const ruleStep = (c: Ctx, lam: number, rule: Id): number => gapShare(lam, c.locked(rule) ? MONTH : c.dt);

/** The reserve target in krónur, set in foreign currency (decision 0013): fxr% of the past 12
 *  months' real GDP (each month at baseline prices before averaging), valued at the world prices the
 *  króna has adjusted to and turned into krónur at last month's exchange rate. A move in the króna
 *  revalues the reserves and the target alike, so it triggers no sales. The slow anchor, not world
 *  prices themselves, so that a jump in world prices does not move the target before the króna has
 *  absorbed it. Real GDP, not the past year's GDP in krónur ÷ this month's prices: during a
 *  depreciation-driven inflation that ratio understates real GDP and the target, and the bank
 *  would sell reserves into the depreciation (review of decision 0013). Real GDP enters as a ratio
 *  to its baseline, so at baseline the target is exactly fxr% of GDP. */
export const reserveTarget = (c: Ctx): number =>
  (c.p('fxr') / 100) * c.base('nominalGDP') * (lastMonth(c, 'outputTrailing12') / c.base('outputTrailing12')) * lastMonth(c, 'exchangeRate') * Math.exp(lastMonth(c, 'worldPriceAnchor'));

export const centralBank: ModuleDef = {
  id: 'central-bank',
  label: 'Central bank',
  description: 'The key rate (set by a smoothed Taylor-type rule, or held by you when you lock it), interest on reserves and the profit remitted to the government.',
  requires: ['structure', 'prices', 'government', 'external'],
  params: pickParams(ALL_PARAMS, ['i0', 'kappaR', 'kappaU', 'rStarBand', 'piT', 'aPi', 'aPiA', 'aY', 'okunGap', 'lamPol', 'iFXR', 'lamRes', 'potentialOutput', 'bondCB', 'fxr', 'eqCB']),
  vars: [
    { id: 'neutralRate', label: 'Neutral real rate, as the central bank estimates it', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: ALL_PARAMS.i0.value, description: 'The real key rate the central bank thinks neither heats nor cools the economy. It starts at its normal level and is revised slowly while inflation stays off target.' },
    { id: 'outputGap', label: 'Output gap, as the central bank measures it', unit: 'fraction', kind: 'ratio', scale: 'none', initial: 0, description: 'How far output is above potential output, as the central bank measures it from the labour market: what the economy can produce at normal unemployment with the workers it has. A fraction: 0.01 means output 1% above potential. Computed whether the key rate is locked or not.' },
    { id: 'potentialOutputSeen', label: 'Potential output, as the central bank estimates it', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: ALL_PARAMS.potentialOutput.value, description: 'What the central bank estimates the economy can produce at normal unemployment with the workers it has, at baseline prices: last month’s output less the output gap it reads from the labour market. Computed whether the key rate is locked or not.' },
    { id: 'ruleTarget', label: 'Key rate the rule is heading for', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('ruleRate'), description: 'Where the central bank’s inflation rule would put the key rate if it moved there at once. Computed whether the key rate is locked or not.' },
    { id: 'ruleAnchor', label: 'Key rate the rule steps from', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('ruleRate'), description: 'The rate the rule starts its next step from: its own rate while it is in charge (key rate unlocked), the key rate you hold (locked).' },
    { id: 'ruleRate', label: 'Key rate the rule calls for', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('ruleRate'), description: 'The key rate the central bank’s inflation rule sets this month: a month’s smoothed step from the rate in force toward where it is heading. Computed whether the key rate is locked or not.' },
    { id: 'keyRateSuggestion', label: 'Key rate the rule suggests', unit: '%/yr', kind: 'rate', scale: 'none', description: 'Where the rule is heading, in percent, never below zero: what the “Apply” button sets the key-rate lever to while it is locked.' },
    { id: 'keyRate', label: 'Key interest rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('keyRate') },
    { id: 'reserveInterest', label: 'Interest on reserves', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'fxReserveIncome', label: 'Income on foreign reserves', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'fxReserveSales', label: 'Reserves sold for krónur', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', description: 'Foreign reserves the central bank sells to non-residents for krónur: the normal yield on its reserves, plus a slow return toward their target share of GDP (below zero when it buys).' },
    { id: 'reserveIncomeKept', label: 'Reserve income kept abroad', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0, description: 'The part of the income on foreign reserves that stays in the reserves: what they earn above their normal yield, less any reserves sold above their target (below zero when the bank sells more than it earns).' },
    { id: 'cbProfit', label: 'Central-bank profit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('cbProfit') },
  ],
  rules: [
    {
      id: 'neutralRate',
      target: 'neutralRate',
      category: 'POLICY',
      label: 'Neutral rate, learned slowly',
      lagInputs: ['neutralRate', 'inflation12ExTax', 'unemployment', 'benefitSearch'],
      params: ['i0', 'kappaR', 'kappaU', 'rStarBand', 'piT', 'uBase', 'uBenefit', 'rrShift'],
      terms: overMonth(
        terms(
          ['previous', 'Last month’s estimate', 'gradual-adjustment', (c) => c.lag('neutralRate')],
          ['inflation', 'Inflation still above (or below) target: this month’s revision', 'neutral-rate', (c) => c.p('kappaR') * c.dt * (lastMonth(c, 'inflation12ExTax') - c.p('piT'))],
          [
            'labourMarket',
            'Unemployment still below (or above) normal: this month’s revision',
            'neutral-rate',
            (c) => c.p('kappaU') * c.dt * (normalUnemployment(c) - restrainingUnemployment(c)),
          ],
        ),
        { previous: 'first', inflation: 'sum', labourMarket: 'sum' },
      ),
      combine: (t, c) => Math.min(c.p('i0') + c.p('rStarBand'), Math.max(c.p('i0') - c.p('rStarBand'), t.previous + t.inflation + t.labourMarket)),
      regime: (c, _v, t) => (Math.abs(t.previous + t.inflation + t.labourMarket - c.p('i0')) > c.p('rStarBand') ? 'Estimate at its limit' : null),
      concepts: ['neutral-rate', 'taylor-rule'],
      explain: {
        what: 'The real interest rate the central bank thinks neither heats nor cools the economy (the neutral rate), as it estimates it. It starts at the normal {i0%} and is revised slowly while inflation or unemployment stays away from normal, so a lasting shock does not leave inflation off target for good.',
        rule: 'Estimate = last month’s + {kappaR} × one month × (inflation over the past year at constant VAT − the target) + {kappaU} × one month × (normal unemployment − unemployment a month earlier), revised a little at each step of the month, kept within {rStarBand%} points of {i0%}. A point of inflation above target that lasts a year raises it {kappaR} points; so does a year with unemployment a point below normal. Normal unemployment is the rate at which wages grow only with expected inflation: {uBase%}, plus the part more generous benefits add; people searching longer because of the benefits are not counted. It is worked out every month, also while you hold the key rate locked, so unlocking starts from it.',
      },
    },
    {
      id: 'outputGap',
      target: 'outputGap',
      category: 'POLICY',
      label: 'Output gap from the labour market (Okun’s law)',
      lagInputs: ['unemployment', 'benefitSearch'],
      params: ['okunGap', 'uBase', 'uBenefit', 'rrShift'],
      terms: terms(['labourMarket', 'Unemployment below normal, times Okun’s factor', 'okun-law', (c) => c.p('okunGap') * (normalUnemployment(c) - restrainingUnemployment(c))]),
      concepts: ['capacity-utilisation', 'okun-law'],
      explain: {
        what: 'How far output is above potential output, as the central bank measures it: what the economy can produce at normal unemployment with the workers it has. A fraction: 0.01 means output 1% above potential.',
        rule: 'Gap = {okunGap} × (normal unemployment − unemployment a month earlier). Normal unemployment is the rate at which wages grow only with expected inflation: {uBase%}, plus the part more generous benefits add; people searching longer because of the benefits are not counted. Scarce workers, not output as such, push up wages, so the central bank reads the gap from the labour market, as the Central Bank of Iceland’s own model builds potential from the labour force and the unemployment rate that keeps inflation steady. Okun’s law turns it into output: each point of unemployment below normal counts as about {okunGap}% more output than the economy can keep up. So potential output follows the labour force for every shock: newcomers, workers arriving or leaving with the jobs, and a shift of spending toward public services that need many staff for each króna of output. It is worked out every month, also while you hold the key rate locked.',
      },
    },
    {
      id: 'potentialOutputSeen',
      target: 'potentialOutputSeen',
      category: 'IDENTITY',
      inputs: ['outputGap'],
      lagInputs: ['output'],
      compute: (c) => lastMonth(c, 'output') / (1 + c.v('outputGap')),
      concepts: ['capacity-utilisation'],
      explain: {
        what: 'What the central bank estimates the economy can produce at normal unemployment with the workers it has, at baseline prices. It is the bank’s estimate from the labour market, not a measure of machines and buildings: firms’ pricing and investment still compare output with the fixed baseline capacity.',
        rule: 'Potential = output a month earlier ÷ (1 + the output gap).',
      },
    },
    {
      id: 'ruleTarget',
      target: 'ruleTarget',
      category: 'POLICY',
      label: 'Taylor-type rule: where it is heading',
      inputs: ['outputGap'],
      lagInputs: ['expectedInflation', 'inflation12ExTax', 'neutralRate'],
      params: ['piT', 'aPi', 'aPiA', 'aY', 'chi'],
      terms: terms(
        ['neutral', 'Neutral rate (its estimate of the real neutral rate + the inflation target)', 'neutral-rate', (c) => lastMonth(c, 'neutralRate') + c.p('piT')],
        ['expectedInflation', 'Expected inflation above target', 'taylor-rule', (c) => c.p('aPi') * (lastMonth(c, 'expectedInflation') - c.p('piT'))],
        ['actualInflation', 'Inflation over the past year at constant VAT, above target', 'taylor-rule', (c) => c.p('aPiA') * (lastMonth(c, 'inflation12ExTax') - c.p('piT'))],
        ['outputGap', 'Output above potential: unemployment below normal', 'capacity-utilisation', (c) => c.p('aY') * c.v('outputGap')],
      ),
      concepts: ['taylor-rule'],
      explain: {
        what: 'Where the central bank’s inflation rule would put the key rate if it moved there at once. The rule itself moves toward it gradually (the key rate the rule calls for).',
        rule: 'Target = the neutral rate + {aPi} × (expected inflation − target) + {aPiA} × (inflation over the past year − target) + {aY} × the output gap. The neutral rate is the inflation target {piT%} plus the real rate the central bank thinks neither heats nor cools the economy: normally {i0%}, revised slowly while inflation or unemployment stays away from normal (see the neutral rate). The output gap is the central bank’s measure of how far output is above what the economy can produce at normal unemployment with the workers it has: {okunGap} × (normal unemployment − unemployment a month earlier), in percent (see the output gap). So the rule moves the key rate {aY} × {okunGap} points for each point of unemployment below normal. Like the Central Bank of Iceland, the rule looks through the one-off price effect of a VAT change: its inflation term leaves VAT out of the CPI, while expected inflation, which a VAT change does lift, counts in full. Expectations are half anchored to the target ({chi}), so a lasting point of inflation raises expected inflation about half a point, and the target by {aPi} × (1 − {chi}) + {aPiA} points in all: more than one for one (the Taylor principle), so the real interest rate people plan with rises when inflation does.',
      },
    },
    {
      id: 'ruleAnchor',
      target: 'ruleAnchor',
      category: 'POLICY',
      label: 'The rate in force, which the rule steps from',
      inputs: ['ruleRate', 'keyRate'],
      locks: [KEY_RATE_RULE],
      terms: terms(
        ['rule', 'The rule’s own rate (unlocked)', 'gradual-adjustment', (c) => (c.locked(KEY_RATE_RULE) ? 0 : c.v('ruleRate'))],
        ['held', 'The key rate you hold (locked)', 'gradual-adjustment', (c) => (c.locked(KEY_RATE_RULE) ? c.v('keyRate') : 0)],
      ),
      concepts: ['gradual-adjustment'],
      explain: {
        what: 'The rate the rule starts its next step from: the rate it was actually in charge of.',
        rule: 'Unlocked: the rule’s own rate this month (before the floor at zero, so a rule that wants to go below zero remembers it). Locked: the key rate you hold. So when you unlock the key rate the rule starts from your rate, not from a path it was never in charge of.',
      },
    },
    {
      id: 'ruleRate',
      target: 'ruleRate',
      category: 'POLICY',
      label: 'Taylor-type rule, smoothed',
      inputs: ['ruleTarget'],
      lagInputs: ['ruleAnchor'],
      params: ['lamPol'],
      locks: [KEY_RATE_RULE],
      terms: [
        { id: 'inForce', label: 'Where the rule stands: the rate in force last month', concept: 'gradual-adjustment', month: 'first', compute: (c) => c.lag('ruleAnchor') },
        { id: 'step', label: 'This month’s steps toward where the rule is heading (unlocked)', concept: 'taylor-rule', month: 'sum', compute: (c) => (c.locked(KEY_RATE_RULE) ? 0 : ruleStep(c, c.p('lamPol'), KEY_RATE_RULE) * (c.v('ruleTarget') - c.lag('ruleAnchor'))) },
        { id: 'nextStep', label: 'Its first month’s step, if you unlocked it (locked)', concept: 'taylor-rule', compute: (c) => (c.locked(KEY_RATE_RULE) ? ruleStep(c, c.p('lamPol'), KEY_RATE_RULE) * (c.v('ruleTarget') - c.lag('ruleAnchor')) : 0) },
      ],
      concepts: ['taylor-rule', 'gradual-adjustment'],
      explain: {
        what: 'The key interest rate the central bank’s inflation rule sets this month. While the key rate is unlocked it is the key rate; while you hold it locked it is where the rule would stand after its first month in charge if you unlocked it. The rule moves gradually rather than jumping, as central banks do.',
        rule: 'Rate = the rate in force last month + a share of the gap between it and where the rule is heading: about a tenth of the gap each month ({lamPol} a year) and 30% a quarter, so about 70% of last quarter’s rate carries over, as estimated policy rules find. The model takes each month in two steps, and the rule closes its share of the gap at each, which comes to the same tenth over the month. The rate in force is the rule’s own rate while it is in charge (unlocked) and the rate you hold (locked), so unlocking moves the key rate one month’s step from your rate, not straight to a path the rule was never in charge of. It is worked out every month, locked or not.',
      },
    },
    {
      id: 'keyRateSuggestion',
      target: 'keyRateSuggestion',
      category: 'POLICY',
      label: 'The rule’s suggestion, in lever units',
      inputs: ['ruleTarget'],
      terms: terms(['rule', 'Where the rule is heading', 'taylor-rule', (c) => 100 * c.v('ruleTarget')]),
      combine: (t) => Math.max(0, t.rule),
      regime: (_c, _v, t) => (t.rule < 0 ? 'Suggestion at the zero floor' : null),
      concepts: ['taylor-rule'],
      explain: {
        what: 'Where the central bank’s inflation rule is heading, in percent a year. While you hold the key rate locked, its lever turns red when you are more than an eighth of a point away from it, and “Apply” sets the lever to it, rounded to a quarter point. Unlocked, the rule gets there gradually, about a tenth of the way each month.',
        rule: 'Suggestion = where the rule is heading × 100, never below 0%. It is computed whether the key rate is locked or not, so it is there as soon as you lock it.',
      },
    },
    {
      id: 'keyRate',
      target: 'keyRate',
      category: 'POLICY',
      label: 'Key rate: the rule’s, or yours while locked',
      inputs: ['ruleRate'],
      levers: ['keyRate'],
      locks: [KEY_RATE_RULE],
      terms: terms(
        ['rule', 'The central bank’s rule (unlocked)', 'taylor-rule', (c) => (c.locked(KEY_RATE_RULE) ? 0 : c.v('ruleRate'))],
        ['held', 'The rate you hold (locked)', undefined, (c) => (c.locked(KEY_RATE_RULE) ? c.lever('keyRate') / 100 : 0)],
      ),
      combine: (t) => Math.max(0, t.rule + t.held),
      regime: (c, _v, t) => {
        if (c.locked(KEY_RATE_RULE)) return 'Held where you set it';
        return t.rule < 0 ? 'Zero lower bound binds' : null;
      },
      concepts: ['interest-rate-channel'],
      explain: {
        what: 'The interest rate the central bank sets: it pays it on banks’ reserves, and every other rate in the economy follows it.',
        rule: 'Who sets it depends on the padlock beside the “Key interest rate” lever. Unlocked (the default): the central bank’s inflation rule sets it, and the lever shows the rule’s rate. Locked: you do. The key rate is the level on the lever and stays there until you move it; the rule only suggests a rate beside the lever. Moving the lever locks it; unlocking hands it back to the rule, which carries on from your rate. It never goes below 0%.',
      },
    },
    {
      id: 'reserveInterest',
      target: 'reserveInterest',
      category: 'POLICY',
      inputs: ['keyRate'],
      stocks: [['reserves', 'B']],
      compute: (c) => c.v('keyRate') * c.stock('reserves', 'B'),
      concepts: ['reserves-and-payments'],
      explain: {
        what: 'Interest the central bank pays on banks’ reserves. It creates new reserves.',
        rule: 'Interest = key rate × reserves. If reserves are below zero, the banks are borrowing them from the central bank and pay it the key rate instead (the real lending facility charges a little more).',
      },
    },
    {
      id: 'fxReserveIncome',
      target: 'fxReserveIncome',
      category: 'BEHAVIOUR',
      inputs: ['foreignRate'],
      params: ['iFXR', 'iF0'],
      stocks: [['fxReserves', 'CB']],
      terms: terms(
        ['normal', 'Normal yield on the reserves', 'current-account', (c) => c.p('iFXR') * c.stock('fxReserves', 'CB')],
        ['foreignRate', 'Change in rates abroad', 'current-account', (c) => (c.v('foreignRate') - c.p('iF0')) * c.stock('fxReserves', 'CB')],
      ),
      concepts: ['current-account'],
      explain: {
        what: 'Interest and dividends the central bank earns on its foreign reserves. They are paid in foreign currency and added to the reserves.',
        rule: 'Income = (the normal reserve yield {iFXR%} + (the foreign interest rate − its normal level {iF0%})) × the reserves’ value in krónur. Reserves are held in foreign bonds and deposits, so their yield follows rates abroad point for point. The income counts in the current account, but no krónur change hands: it is paid in foreign currency into the reserves.',
      },
    },
    {
      id: 'fxReserveSales',
      target: 'fxReserveSales',
      // An operating rule of the central bank, like its profit remittance, not a policy setting a
      // user holds: it acts the same whether the policy levers are locked or not (decision 0009).
      category: 'CONTRACT',
      label: 'Reserve management (an operating rule)',
      params: ['iFXR', 'fxr', 'lamRes'],
      stocks: [['fxReserves', 'CB']],
      lagInputs: ['outputTrailing12', 'exchangeRate', 'worldPriceAnchor'],
      terms: terms(
        ['normal', 'Normal yield turned into krónur', 'reserves-and-payments', (c) => c.p('iFXR') * c.stock('fxReserves', 'CB')],
        ['target', 'Reserves above or below their target (set in foreign currency)', 'reserves-and-payments', (c) => c.p('lamRes') * (c.stock('fxReserves', 'CB') - reserveTarget(c))],
      ),
      concepts: ['reserves-and-payments'],
      explain: {
        what: 'Foreign currency the central bank sells to non-residents for krónur, out of its reserves (below zero when it buys).',
        rule: 'Sales = the normal reserve yield {iFXR%} × the reserves’ value in krónur + {lamRes} a year × (the reserves − their target). Reserve adequacy is a foreign-currency idea, so the target is set in foreign currency: {fxr}% of the past 12 months’ real GDP (each month at baseline prices), valued at the world prices the króna has adjusted to, and turned into krónur at last month’s exchange rate. A move in the króna revalues the reserves and the target alike, so it triggers no sales: the bank does not sell reserves into a depreciation, which would be intervention by the back door. Real growth, and a slow change in the real exchange rate, move the target. The central bank turns the normal return on its reserves into krónur, which it hands to the government with the rest of its profit. Anything the reserves earn above that, when rates abroad rise, first builds up the reserves in foreign currency, so it takes no krónur from non-residents at once. The bank then sells reserves above its target slowly back into krónur, and buys when they are below it, so the reserves settle near {fxr}% of GDP (at the real exchange rate of the time) instead of growing without end. Non-residents pay out of their króna deposits. This is how the central bank runs its balance sheet under its reserve-adequacy mandate, not a policy setting: no lever holds it, and it works the same whether the policy levers are locked or not.',
      },
    },
    {
      id: 'reserveIncomeKept',
      target: 'reserveIncomeKept',
      category: 'IDENTITY',
      inputs: ['fxReserveIncome', 'fxReserveSales'],
      compute: (c) => c.v('fxReserveIncome') - c.v('fxReserveSales'),
      explain: {
        what: 'The part of the income on foreign reserves that stays abroad in the reserves, a yearly rate: zero at baseline.',
        rule: 'Kept = income on foreign reserves − reserves sold for krónur. It counts in the current account like any income, but it is not paid in krónur, so it does not take krónur from non-residents.',
      },
    },
    {
      id: 'cbProfit',
      target: 'cbProfit',
      category: 'IDENTITY',
      inputs: ['bondInterestCB', 'fxReserveIncome', 'reserveInterest'],
      terms: terms(
        ['bonds', 'Interest on its government bonds', 'interest-distribution', (c) => c.v('bondInterestCB')],
        ['foreign', 'Income on foreign reserves', undefined, (c) => c.v('fxReserveIncome')],
        ['reserves', 'Interest paid on banks’ reserves', 'reserves-and-payments', (c) => -c.v('reserveInterest')],
      ),
      explain: {
        what: 'The central bank’s profit, all of which it hands to the government.',
        rule: 'Profit = interest on its government bonds + income on foreign reserves − interest paid on reserves. Revaluations of the reserves when the króna moves are not profit and stay with the bank.',
      },
    },
  ],
  flows: [
    {
      id: 'reserveInterest',
      label: 'Interest on reserves',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'CB', to: 'B', amount: 'reserveInterest' }],
      concepts: ['reserves-and-payments'],
      explain: { what: 'The central bank pays the key rate on banks’ reserves by crediting their reserve accounts.' },
    },
    {
      id: 'fxReserveIncome',
      label: 'Income on foreign reserves',
      kind: 'accrual',
      account: 'current',
      posting: { type: 'accrue', instrument: 'fxReserves' },
      legs: [{ from: 'W', to: 'CB', amount: 'fxReserveIncome' }],
      concepts: ['current-account'],
      explain: { what: 'Foreign reserves earn interest and dividends in foreign currency, which is added to the reserves. No krónur move.' },
    },
    {
      id: 'fxReserveSales',
      label: 'Reserves sold for krónur',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'redeem', instrument: 'fxReserves' },
      legs: [{ from: 'W', to: 'CB', amount: 'fxReserveSales' }],
      concepts: ['reserves-and-payments'],
      explain: { what: 'The central bank sells foreign currency out of its reserves to non-residents, who pay with their króna deposits; banks pass on reserves.' },
    },
    {
      id: 'cbRemittance',
      label: 'Central-bank profit to government',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'CB', to: 'G', amount: 'cbProfit' }],
      explain: { what: 'The central bank hands its profit to the government’s account.' },
    },
  ],
  levers: [
    {
      id: 'keyRate',
      label: 'Key interest rate',
      group: 'Policy',
      section: 'Central bank',
      kind: 'setting',
      unit: '%',
      default: 3,
      min: 0,
      max: 15,
      step: 0.25,
      description:
        'The central bank’s key interest rate. Unlocked (the default), the central bank’s inflation rule sets it and the lever follows the rule. Move the lever, or close its padlock, to hold the rate yourself; the rule then only suggests a rate beside the lever.',
      definition:
        'Level of the key rate in percent a year. Unlocked (the default) the central bank’s inflation rule sets it every month, and the lever shows the rule’s rate. Moving the lever, or closing its padlock, locks it: the key rate is then held at the lever’s level from the month it is set until you move it again, and the rule only suggests a rate beside the lever. Closing the padlock holds the rate in force that month. Unlocking hands the key rate back to the rule, which moves from the rate you held about a tenth of the way toward where it is heading each month, so the rate does not jump. The default, 3%, is the neutral rate, so the baseline is unchanged. The rule reads three things: the inflation people expect, inflation over the past year at constant VAT, and the output gap, which it reads from how far unemployment is below normal (decision 0012). So it looks partly through a jump in prices that comes from costs. After a wage settlement of 10%, inflation is 2.6 points higher after a year but the key rate only 0.7 point higher, because jobs are being lost and expected inflation has risen only about 1 point; after world prices 10% higher (inflation +2.0 points) the key rate is 1.2 points higher, and after the króna 10% weaker (+1.8 points) 1.0 point. For a while the real interest rate falls, which softens the blow to jobs. A VAT rise is left out of the inflation the rule reads, but people’s expectations rise with the higher prices, so the rule still leans against it at first, even as output falls: after VAT +2.5 points the key rate is 0.4 point higher after nine months, and it is cut below baseline only from the third year, once expectations have come back down. While the key rate is locked, nothing anchors inflation but people’s partial trust in the target: a lasting change that keeps unemployment off its normal rate keeps inflation off target for as long as you hold the rate, and the price level drifts (Wicksell’s cumulative process; decisions 0002 §6 and 0014). Held while income tax is unlocked, the central bank no longer steadies the economy, so the debt rule does more than lean on debt: it also leans against the cycle, adding income tax when output is above potential and cutting it when output is below (half a point of tax per 1% of output gap), and leans on debt only half as hard, as fiscal rules must when monetary policy does not act (Kirsanova, Leith and Wren-Lewis 2009; decision 0016). And it does not let debt push the tax against the cycle: while output is more than 1% below potential it raises no tax, whatever rate you hold, and while output is above potential it does not hand lower debt back as tax cuts. So a higher rate still cools the economy, and the debt rule pays for the higher interest bill slowly, once the slump has faded: at 6%, output is about 1.4% below baseline after a year and 2.2% below after three, as the rule cuts taxes a little; then output recovers and the rule raises them as debt builds up: 0.3% below after 20 years, with the price level 4% lower, government debt 34 points of GDP higher and income tax 3.5 points higher. Held 5 points above neutral or more, the debt built up in the slump lifts output a little above baseline for a few years in the second decade (at 8%, by up to 0.4% around year ten), the interest-income channel described below, before the rule’s tax rises bring it back down. When private demand falls, the rule cuts taxes instead of deepening the slump: after lending appetite −3, output is 0.4% below baseline after 20 years with income tax 0.6 point higher (before decision 0016, when the rule leaned on debt alone, 1.3% below with income tax 1.1 points higher). At 15% the interest bill runs away: debt ends about 270 points of GDP higher and income tax 33 points higher, rates no government could sustain; treat that run as showing why real central banks do not hold such rates, not as a forecast. Held at 0%, output is 1.4% higher after a year and 2.3% after three; the rule raises taxes against the boom (half a point by year five) and cuts them only once it has passed, so output is 0.4% higher after 20 years and the price level 5.7% higher. With income tax locked too, nothing in the model reacts, and any lasting move reverses its effect on output after about ten years, roughly in proportion to its size. That is the interest-income channel of stock-flow models (Godley and Lavoie’s model PC; decision 0014). A rise first cools the economy, but the government then pays more interest every year, as its bonds are refinanced at the higher rate (about a fifth of them a year) and on a debt that grows with that interest, and with tax rates held that interest is private income. It reaches people two ways: at once, as interest on older households’ bonds and deposits, which they spend; and slowly, through the pension funds, whose extra income is credited to members’ pension rights and raises pensions only as the rights are paid out (at 6%, pensions buy about 0.7% more after a year, 5% more after five years and 13% more after 20). Once enough debt has built up, spending out of that income outweighs the higher rate. That is the strong end of the evidence: tightening does lower output for more than a decade (Jordà, Singh and Taylor 2024), but savers who gain interest income spend little of it (Auclert 2019), so a real economy would reverse later, if at all. At 4%, output is about 0.5% below baseline after a year and about 0.8% below at the trough early in the fourth year, back above it from about month 138 and about 0.7% above after 20 years; bigger moves reverse sooner and much further. At 6%, output is 2.3% lower at the trough, above baseline from month 126 and 2.9% higher after 20 years, with inflation 0.9 point higher. At the top of the range the run becomes explosive: at 15%, output falls 10% by the fourth year, is above baseline from month 110, and after 20 years is 34% higher with unemployment 3 points lower, the price level 61% higher, real wages 38% lower, government debt 320 points of GDP higher and the deficit 42% of GDP, still accelerating. It explodes because interest compounds on a debt that fixed tax rates never pay down, with the interest rate far above the economy’s growth, not because the central bank prints money to pay the bills: the model has no route by which it would, and no risk premium on government debt. In real economies a debt this large would also raise questions of fiscal dominance, which the model leaves out. Nor does the model follow the fiscal theory of the price level, the leading theory for a held rate with fixed taxes, which predicts a one-time jump in prices after which inflation settles: here prices keep trending. A cut mirrors this.',
      concepts: ['taylor-rule', 'interest-rate-channel', 'nominal-anchor'],
    },
  ],
  stabilisers: [
    {
      id: KEY_RATE_RULE,
      label: 'Central bank’s inflation rule',
      lever: 'keyRate',
      suggestion: 'keyRateSuggestion',
      current: (c) => 100 * c.v('keyRate'),
      shadow: ['ruleRate', 'ruleTarget', 'ruleAnchor', 'neutralRate', 'outputGap', 'potentialOutputSeen'],
      // Half the lever's quarter-point step: it calls exactly when "Apply" would move the lever.
      threshold: 0.125,
      description:
        'A Taylor-type rule: the key rate the central bank is heading for, from expected inflation, inflation over the past year at constant VAT and the output gap, which it reads from how far unemployment is below normal. It moves there gradually from the rate in force, about a tenth of the way each month, and revises its estimate of the neutral rate slowly while inflation or unemployment stays off normal. While the key rate is unlocked it sets it. While you hold the key rate locked it suggests where it is heading, and the lever turns red when that is more than an eighth of a point away from your rate, so that applying it would move the lever a quarter-point step. Unlocking starts the rule from the rate you held.',
      concepts: ['taylor-rule', 'gradual-adjustment'],
      feed: { raise: 'The central bank’s rule would raise the key rate to {value}%', lower: 'The central bank’s rule would cut the key rate to {value}%', indicator: 'keyRate' },
      // ECON-3 (decisions 0015 and 0016): while the key rate is held the debt rule leans against the
      // cycle, and debt never moves the tax against it.
      lockedAloneNote:
        'With the key rate locked while the debt rule sets income tax, the debt rule steadies the economy in the central bank’s place: it cuts taxes when output falls below potential and raises them when output is above it. Debt never pushes the tax the other way: the rule pays debt back slowly, once output has recovered, and hands low debt back as tax cuts only once a boom has passed.',
    },
  ],
  tests: [
    {
      id: 'reserve-target-in-foreign-currency',
      label: 'The reserve target is set in foreign currency: fxr% of GDP at baseline, and a fall in the króna revalues it with the reserves, so it triggers no sales (decision 0013)',
      run: (e) => {
        const ke = e as unknown as { stock(i: string, p: string): number; valueAt(id: string, m: number): number };
        const fxr = e.influences('fxReserveSales').params.find((x) => x.id === 'fxr')!.value;
        const target0 = e.influences('fxReserveSales').terms.find((x) => x.id === 'target')!.value;
        lockPolicy(e);
        e.fire('kronaShock', -25);
        e.step(6); // the target reads last month's rate, so it trails the reserves while the króna is still falling
        // reserves ÷ target now, against reserves ÷ what a target in krónur (fxr% of the past year's GDP) would be
        const lam = e.influences('fxReserveSales').params.find((x) => x.id === 'lamRes')!.value;
        const target = ke.stock('fxReserves', 'CB') - e.influences('fxReserveSales').terms.find((x) => x.id === 'target')!.value / lam;
        const inKronur = (fxr / 100) * ke.valueAt('gdpTrailing12', e.t - 1);
        const [gapFX, gapISK] = [ke.stock('fxReserves', 'CB') / target - 1, ke.stock('fxReserves', 'CB') / inKronur - 1];
        return { pass: Math.abs(target0) < 1e-12 && Math.abs(gapFX) < 0.02 && gapISK > 0.1, detail: `six months after a 25% fall in sentiment: reserves ${(100 * gapFX).toFixed(2)}% above their target (a target in krónur would put them ${(100 * gapISK).toFixed(1)}% above it)` };
      },
    },
    {
      id: 'neutral-at-baseline',
      label: 'At baseline the key rate equals the neutral nominal rate (real neutral + inflation target)',
      run: (e) => {
        const ps = e.influences('ruleTarget').params;
        const n = ps.find((p) => p.id === 'i0')!.value + ps.find((p) => p.id === 'piT')!.value;
        const k = e.baseline('keyRate');
        return { pass: Math.abs(k - n) < 1e-12, detail: `key rate ${k} vs neutral ${n}` };
      },
    },
    {
      id: 'taylor-principle',
      label: 'The Taylor principle, with expectations half anchored: the rule raises the key rate by more than a point per point of lasting actual inflation (and more still per point of expected inflation), so the real rate people plan with (key rate − expected inflation) rises with inflation',
      run: (e) => {
        const ps = e.influences('ruleTarget').params;
        const p = (id: string) => ps.find((q) => q.id === id)!.value;
        const chi = e.influences('expectedInflation').params.find((q) => q.id === 'chi')!.value;
        // (v1 checked only aPi + aPiA > 1; with aPiA 0.3 lasting actual inflation moved the key rate 0.95 per point)
        // lasting inflation pi: remembered inflation settles at pi, expected inflation at (1 − chi) × pi
        const perActual = p('aPi') * (1 - chi) + p('aPiA');
        const perExpected = p('aPi') + p('aPiA') / (1 - chi);
        const realRate = perActual - (1 - chi);
        return {
          pass: perActual > 1 && perExpected > perActual && realRate > 0,
          detail: `per point of lasting actual inflation ${perActual.toFixed(2)} = aPi × (1 − chi) + aPiA with chi = ${chi}; per point of expected inflation ${perExpected.toFixed(2)}; real rate per point of actual inflation +${realRate.toFixed(2)}`,
        };
      },
    },
    {
      id: 'unlock-starts-from-the-held-rate',
      label: 'Unlocking the key rate after holding it moves it one month’s smoothed step from the held rate, not to a path the rule was never in charge of: each of the month’s kernel steps closes its share of the gap from the rate before it',
      run: (e) => {
        const lamPol = e.influences('ruleRate').params.find((q) => q.id === 'lamPol')!.value;
        const N = stepsAMonth(e);
        const k = 1 - Math.exp(-lamPol / 12); // a month's share
        const ks = 1 - Math.exp(-lamPol / 12 / N); // a kernel step's share
        const { engine: f, steps } = stepByStep(e, (r) => ({ key: r.value('keyRate'), target: r.value('ruleTarget') }));
        f.setLever('keyRate', 6); // moving the lever locks it
        f.step(24);
        const held = f.value('keyRate');
        const target = f.value('ruleTarget');
        f.setLever('keyRateLock', 0);
        steps.length = 0;
        f.step(1);
        // each step: from the rate before it, ks of the gap to where the rule is heading then
        let prev = held,
          worst = 0;
        for (const s of steps) {
          worst = Math.max(worst, Math.abs(s.key - (prev + ks * (s.target - prev))));
          prev = s.key;
        }
        const move = f.value('keyRate') - held;
        return {
          pass: Math.abs(held - 0.06) < 1e-15 && steps.length === N && worst < 1e-12 && Math.abs(move) < 0.25 * Math.abs(target - held),
          detail: `held 6% for two years (the rule heading for ${(100 * target).toFixed(2)}%); first month unlocked ${(100 * f.value('keyRate')).toFixed(2)}%, a move of ${(100 * move).toFixed(2)} pp = ${(move / (target - held)).toFixed(3)} × the gap in ${N} steps (a month’s share is ${k.toFixed(3)}); largest step off its rule ${worst.toExponential(1)}`,
        };
      },
    },
    {
      id: 'output-gap-from-the-labour-market',
      label: 'The rule’s output gap is Okun’s factor × (normal unemployment − unemployment a month earlier), potential output is last month’s output ÷ (1 + the gap), and the rule moves the key rate aY × okunGap = 0.8 points per point of unemployment below normal (decision 0012)',
      run: (e) => {
        const inf = e.influences('outputGap');
        const p = (id: string) => inf.params.find((q) => q.id === id)!.value;
        const aY = e.influences('ruleTarget').params.find((q) => q.id === 'aY')!.value;
        e.fire('wageSettlement', 10);
        e.step(11);
        const u = e.value('unemployment'),
          s = e.value('benefitSearch'),
          output = e.value('output');
        e.step(1);
        const slack = p('uBase') + p('uBenefit') * p('rrShift') - u / (1 + s * (1 - u));
        const gap = e.value('outputGap');
        const term = e.influences('ruleTarget').terms.find((t) => t.id === 'outputGap')!.value;
        const potential = e.value('potentialOutputSeen');
        return {
          pass:
            Math.abs(gap - p('okunGap') * slack) < 1e-15 &&
            Math.abs(term - aY * gap) < 1e-15 &&
            Math.abs(potential - output / (1 + gap)) < 1e-12 &&
            Math.abs(term / slack - 0.8) < 1e-12 &&
            slack < -0.005,
          detail: `a year after a 10% wage settlement: unemployment ${(100 * -slack).toFixed(2)} points above normal, gap ${(100 * gap).toFixed(3)}% = ${p('okunGap')} × that, the rule’s gap term ${(100 * term).toFixed(3)} pp (${(term / slack).toFixed(3)} per point of unemployment below normal), potential output ${potential.toFixed(3)} against output ${output.toFixed(3)} a month earlier`,
        };
      },
    },
    {
      id: 'locked-paths-do-not-read-the-gap',
      label: 'With both policy levers locked, the output gap only feeds the rule’s suggestion: a different Okun factor and slack response change no path but the stabilisers’ shadows and suggestions (decision 0012)',
      run: (e) => {
        lockPolicy(e);
        e.fire('wageSettlement', 10);
        e.setLever('tourism', -15);
        const f = e.fork({ params: { aY: 1, okunGap: 2 } });
        e.step(36);
        f.step(36);
        const skip = new Set(e.model.def.modules.flatMap((m) => (m.stabilisers ?? []).flatMap((x) => [...(x.shadow ?? []), x.suggestion])));
        let worst = 0,
          at = '';
        for (const v of e.model.vars) {
          if (skip.has(v.id)) continue;
          const d = Math.abs(e.value(v.id) - f.value(v.id));
          if (d > worst) [worst, at] = [d, v.id];
        }
        const moved = Math.abs(e.value('keyRateSuggestion') - f.value('keyRateSuggestion'));
        return {
          pass: worst === 0 && moved > 0.01,
          detail: `after 36 months, largest difference outside the shadows ${worst}${at ? ` (${at})` : ''}; the key-rate suggestion differs by ${moved.toFixed(3)} points`,
        };
      },
    },
    {
      id: 'looks-through-vat',
      label: 'The rule looks through the first, one-off price effect of a VAT rise: its actual-inflation term does not move, while expected inflation still counts',
      run: (e) => {
        e.setLever('vat', 2.5);
        e.step(9);
        const inf = e.influences('ruleTarget');
        const term = (id: string) => inf.terms.find((t) => t.id === id)!;
        const actual = term('actualInflation').value - term('actualInflation').baseline;
        const expected = term('expectedInflation').value - term('expectedInflation').baseline;
        const headline = e.value('inflation12') - e.value('inflation12ExTax');
        return {
          pass: headline > 0.01 && Math.abs(actual) < 0.2 * 0.3 * headline && expected > 0,
          detail: `after 9 months of VAT +2.5 pp: headline 12-month inflation ${(100 * headline).toFixed(2)} pp above the constant-VAT rate; actual-inflation term ${(100 * actual).toFixed(3)} pp, expected-inflation term +${(100 * expected).toFixed(3)} pp`,
        };
      },
    },
    {
      id: 'locked-holds-the-key-rate',
      label: 'Locked: the key rate stays at the lever’s level while the rule’s suggestion moves; the default is the neutral rate',
      run: (e) => {
        const ps = e.influences('ruleTarget').params;
        const n = ps.find((p) => p.id === 'i0')!.value + ps.find((p) => p.id === 'piT')!.value;
        const lever = e.model.levers.find((l) => l.id === 'keyRate')!;
        e.setLever('keyRate', 7);
        e.fire('wageSettlement', 10);
        e.step(12);
        const held = e.value('keyRate');
        const rule = e.value('keyRateSuggestion');
        return {
          pass: Math.abs(held - 0.07) < 1e-15 && Math.abs(rule - 7) > 0.5 && Math.abs(lever.default / 100 - n) < 1e-12,
          detail: `key rate ${held} after 12 months of a wage shock; the rule suggests ${rule.toFixed(2)}%; default ${lever.default}% vs neutral ${100 * n}%`,
        };
      },
    },
    {
      id: 'unlocked-rule-sets-the-rate-and-locking-freezes-it',
      label: 'Unlocked: the key rate is the rule’s rate, never below zero; locking it freezes it at the rate in force, with no jump',
      run: (e) => {
        e.fire('wageSettlement', 10);
        e.step(6);
        const gap = e.value('keyRate') - Math.max(0, e.value('ruleRate'));
        const before = e.value('keyRate');
        e.setLever('keyRateLock', 1);
        const frozen = e.leverValue('keyRate');
        e.step(3);
        const held = e.value('keyRate');
        return {
          pass: gap === 0 && Math.abs(frozen - 100 * before) < 1e-12 && Math.abs(held - before) < 1e-15 && Math.abs(e.value('keyRateSuggestion') - 100 * held) > 0.01,
          detail: `unlocked: key rate − max(0, rule) = ${gap}; locked at month 6 at ${frozen.toFixed(4)}% (the rate in force ${(100 * before).toFixed(4)}%), ${(100 * held).toFixed(4)}% three months later`,
        };
      },
    },
  ],
};
