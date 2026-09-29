/**
 * Iceland Inc.: the central bank (v1 equations E1–E3 and E26).
 *
 * A Taylor-type rule works out the key rate the central bank's inflation rule calls for, from
 * expected and actual inflation and the output gap, every month in both stabiliser modes. The rule
 * does not jump there: each month it closes part of the gap from the rate actually in force last
 * month, its own rate when it was in charge (Automatic) or the rate you held (Manual), so switching
 * to Automatic starts it from your rate (interest-rate smoothing). Who sets the key rate depends on
 * the stabiliser setting (decision 0004): in Manual you do, and the rule only suggests where it is
 * heading; in Automatic the rule does, and your lever is an offset to it. It never goes below zero.
 * The central bank pays the key rate on banks' reserves, earns interest on its bonds and foreign
 * reserves, and hands its profit to the government. It sells the normal yield on its foreign reserves
 * for krónur and slowly brings the reserves back toward their target share of GDP.
 */
import type { ModuleDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { gapShare, pickParams, terms, lastMonth, automatic, AUTOMATIC, MANUAL, STABILISERS } from '../util.ts';

export const centralBank: ModuleDef = {
  id: 'central-bank',
  label: 'Central bank',
  description: 'The key rate (set by you, or by a smoothed Taylor-type rule plus your offset), interest on reserves and the profit remitted to the government.',
  requires: ['stabilisers', 'structure', 'prices', 'government', 'external'],
  params: pickParams(ALL_PARAMS, ['i0', 'piT', 'aPi', 'aPiA', 'aY', 'lamPol', 'iFXR', 'lamRes', 'potentialOutput', 'bondCB', 'fxr', 'eqCB']),
  vars: [
    { id: 'ruleTarget', label: 'Key rate the rule is heading for', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('ruleRate'), description: 'Where the central bank’s inflation rule would put the key rate if it moved there at once, before your offset. Computed in both stabiliser modes.' },
    { id: 'ruleAnchor', label: 'Key rate the rule steps from', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('ruleRate'), description: 'The rate the rule starts next month’s step from: its own rate while it is in charge (Automatic), the key rate you hold (Manual).' },
    { id: 'ruleRate', label: 'Key rate the rule calls for', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('ruleRate'), description: 'The key rate the central bank’s inflation rule sets this month, before your offset: one smoothed step from the rate in force toward where it is heading. Computed in both stabiliser modes.' },
    { id: 'keyRateSuggestion', label: 'Key rate the rule suggests', unit: '%/yr', kind: 'rate', scale: 'none', description: 'Where the rule is heading, in percent, never below zero: what the “Apply” button sets the key-rate lever to in Manual mode.' },
    { id: 'keyRate', label: 'Key interest rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('keyRate') },
    { id: 'reserveInterest', label: 'Interest on reserves', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'fxReserveIncome', label: 'Income on foreign reserves', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'fxReserveSales', label: 'Reserves sold for krónur', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', description: 'Foreign reserves the central bank sells to non-residents for krónur: the normal yield on its reserves, plus a slow return toward their target share of GDP (below zero when it buys).' },
    { id: 'reserveIncomeKept', label: 'Reserve income kept abroad', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0, description: 'The part of the income on foreign reserves that stays in the reserves: what they earn above their normal yield, less any reserves sold above their target (below zero when the bank sells more than it earns).' },
    { id: 'cbProfit', label: 'Central-bank profit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('cbProfit') },
  ],
  rules: [
    {
      id: 'ruleTarget',
      target: 'ruleTarget',
      category: 'POLICY',
      label: 'Taylor-type rule: where it is heading',
      lagInputs: ['expectedInflation', 'inflation12ExTax', 'output'],
      params: ['i0', 'piT', 'aPi', 'aPiA', 'aY', 'potentialOutput', 'chi'],
      terms: terms(
        ['neutral', 'Neutral rate (real neutral + inflation target)', 'taylor-rule', (c) => c.p('i0') + c.p('piT')],
        ['expectedInflation', 'Expected inflation above target', 'taylor-rule', (c) => c.p('aPi') * (lastMonth(c, 'expectedInflation') - c.p('piT'))],
        ['actualInflation', 'Inflation over the past year at constant VAT, above target', 'taylor-rule', (c) => c.p('aPiA') * (lastMonth(c, 'inflation12ExTax') - c.p('piT'))],
        ['outputGap', 'Output above capacity', 'capacity-utilisation', (c) => c.p('aY') * (lastMonth(c, 'output') / c.p('potentialOutput') - 1)],
      ),
      concepts: ['taylor-rule'],
      explain: {
        what: 'Where the central bank’s inflation rule would put the key rate if it moved there at once. The rule itself moves toward it gradually (the key rate the rule calls for).',
        rule: 'Target = neutral nominal rate (the neutral real rate {i0%} + the inflation target {piT%}) + {aPi} × (expected inflation − target) + {aPiA} × (inflation over the past year at constant VAT − target) + {aY} × the output gap (last month’s output ÷ capacity − 1). Like the Central Bank of Iceland, the rule looks through the first, one-off price effect of a change in VAT: its actual-inflation term leaves VAT out of the CPI, while expected inflation, which a VAT change does lift, still counts in full. With expectations half anchored to the target ({chi}), a lasting point of inflation raises expected inflation about half a point, so the target rises {aPi} × (1 − {chi}) + {aPiA} points per point of actual inflation, more than one for one (the Taylor principle): the real interest rate people plan with, the key rate minus expected inflation, rises when inflation does.',
      },
    },
    {
      id: 'ruleAnchor',
      target: 'ruleAnchor',
      category: 'POLICY',
      label: 'The rate in force, which the rule steps from',
      inputs: ['ruleRate', 'keyRate'],
      levers: [STABILISERS],
      terms: terms(
        ['rule', 'The rule’s own rate (Automatic)', 'gradual-adjustment', (c) => (automatic(c) ? c.v('ruleRate') : 0)],
        ['held', 'The key rate you hold (Manual)', 'gradual-adjustment', (c) => (automatic(c) ? 0 : c.v('keyRate'))],
      ),
      concepts: ['gradual-adjustment'],
      explain: {
        what: 'The rate the rule starts next month’s step from: the rate it was actually in charge of.',
        rule: 'Automatic: the rule’s own rate this month (before your offset, and before the floor at zero, so a rule that wants to go below zero remembers it). Manual: the key rate you hold. So when you switch to Automatic the rule starts from your rate, not from a path it was never in charge of.',
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
      terms: terms(
        ['inForce', 'Where the rule stands: the rate in force last month', 'gradual-adjustment', (c) => (1 - gapShare(c.p('lamPol'), c.dt)) * c.lag('ruleAnchor')],
        ['target', 'A step toward where the rule is heading', 'taylor-rule', (c) => gapShare(c.p('lamPol'), c.dt) * c.v('ruleTarget')],
      ),
      concepts: ['taylor-rule', 'gradual-adjustment'],
      explain: {
        what: 'The key interest rate the central bank’s inflation rule sets this month. With stabilisers on Automatic it is the key rate (plus your offset); on Manual it is what the rule would do next if you switched. The rule moves gradually rather than jumping, as central banks do.',
        rule: 'Rate = the rate in force last month + a share of the gap between it and where the rule is heading. The share is 1 − e^(−{lamPol}/12) a month: about a tenth of the gap each month and 30% a quarter, so about 70% of last quarter’s rate carries over, as estimated policy rules find. The rate in force is the rule’s own rate while it is in charge (Automatic) and the rate you hold (Manual), so switching to Automatic moves the key rate one step from your rate, not straight to a path the rule was never in charge of. It is worked out every month in both modes.',
      },
    },
    {
      id: 'keyRateSuggestion',
      target: 'keyRateSuggestion',
      category: 'POLICY',
      label: 'The rule’s suggestion, in lever units',
      inputs: ['ruleTarget'],
      compute: (c) => Math.max(0, 100 * c.v('ruleTarget')),
      concepts: ['taylor-rule'],
      explain: {
        what: 'Where the central bank’s inflation rule is heading, in percent a year. In Manual mode the key-rate lever turns red when you are more than an eighth of a point away from it, and “Apply” sets the lever to it, rounded to a quarter point. On Automatic the rule would get there gradually, about a tenth of the way each month.',
        rule: 'Suggestion = where the rule is heading × 100, never below 0%. It is computed in both modes, so it is there as soon as you switch.',
      },
    },
    {
      id: 'keyRate',
      target: 'keyRate',
      category: 'POLICY',
      label: 'Key rate: yours, or the rule’s plus your offset',
      inputs: ['ruleRate'],
      levers: [STABILISERS, 'keyRateAddon', 'keyRateFixed'],
      terms: terms(
        ['rule', 'The central bank’s rule (Automatic)', 'taylor-rule', (c) => (automatic(c) ? c.v('ruleRate') : 0)],
        ['addOn', 'Your offset to the rule (Automatic)', 'taylor-rule', (c) => (automatic(c) ? c.lever('keyRateAddon') / 100 : 0)],
        ['set', 'The rate you set (Manual)', undefined, (c) => (automatic(c) ? 0 : c.lever('keyRateFixed') / 100)],
      ),
      combine: (t) => Math.max(0, t.rule + t.addOn + t.set),
      regime: (c, _v, t) => {
        if (!automatic(c)) return 'Held where you set it';
        return t.rule + t.addOn < 0 ? 'Zero lower bound binds' : null;
      },
      concepts: ['interest-rate-channel'],
      explain: {
        what: 'The interest rate the central bank sets: it pays it on banks’ reserves, and every other rate in the economy follows it.',
        rule: 'Who sets it depends on the Stabilisers setting. Manual (the default): you do. The key rate is the level of the “Key interest rate” lever and stays there until you change it; the central bank’s inflation rule only suggests a rate beside the lever. Automatic: the rule sets it, and your offset lever adds to or subtracts from the rule’s rate. It never goes below 0%.',
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
      category: 'POLICY',
      label: 'Reserve management',
      params: ['iFXR', 'fxr', 'lamRes'],
      stocks: [['fxReserves', 'CB']],
      lagInputs: ['gdpTrailing12'],
      terms: terms(
        ['normal', 'Normal yield turned into krónur', 'reserves-and-payments', (c) => c.p('iFXR') * c.stock('fxReserves', 'CB')],
        [
          'target',
          'Reserves above or below their target',
          'reserves-and-payments',
          (c) => c.p('lamRes') * (c.stock('fxReserves', 'CB') - (c.p('fxr') / 100) * lastMonth(c, 'gdpTrailing12')),
        ],
      ),
      concepts: ['reserves-and-payments'],
      explain: {
        what: 'Foreign currency the central bank sells to non-residents for krónur, out of its reserves (below zero when it buys).',
        rule: 'Sales = the normal reserve yield {iFXR%} × the reserves’ value in krónur + {lamRes} a year × (the reserves − their target of {fxr}% of GDP over the past 12 months). The central bank turns the normal return on its reserves into krónur, which it hands to the government with the rest of its profit. Anything the reserves earn above that, when rates abroad rise, first builds up the reserves in foreign currency, so it takes no krónur from non-residents at once. The bank then sells reserves above its target slowly back into krónur, and buys when they are below it, so the reserves settle near {fxr}% of GDP instead of growing without end. Non-residents pay out of their króna deposits.',
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
      id: 'keyRateFixed',
      label: 'Key interest rate',
      group: 'Policy',
      section: 'Central bank',
      kind: 'setting',
      unit: '%',
      default: 3,
      min: 0,
      max: 15,
      step: 0.25,
      showWhen: { lever: STABILISERS, equals: MANUAL },
      description: 'The central bank’s key interest rate, held where you set it. The central bank’s inflation rule only suggests a rate beside the lever.',
      definition:
        'Level of the key rate in percent a year, applied in the month it is set and held there until you change it (stabilisers on Manual). Nothing in the model moves it. The default, 3%, is the neutral rate, so the baseline is unchanged. Any lasting move held with taxes and spending also held (Manual) reverses its effect on output after about ten years, roughly in proportion to its size: a rise first cools the economy, but the government then pays more interest every year, as its bonds are refinanced at the higher rate (about a fifth of them a year) and on a debt that grows with that interest, and the interest is income for households and pension funds, who spend it. At 4%, output is about 0.5% below baseline after a year and about 0.7% below at the trough in the third year, back above it from about month 120 and about 0.45% above after 20 years; bigger moves reverse a little sooner and further (at 15%, month 101). A cut mirrors this. It has no effect while stabilisers are Automatic, when the rule sets the key rate and the debt rule leans against the debt.',
      concepts: ['taylor-rule'],
    },
    {
      id: 'keyRateAddon',
      label: 'Key rate: your offset to the rule',
      group: 'Policy',
      section: 'Central bank',
      kind: 'setting',
      unit: 'pp',
      default: 0,
      min: -3,
      max: 5,
      step: 0.25,
      showWhen: { lever: STABILISERS, equals: AUTOMATIC },
      description: 'Sets the key rate this many points above (or below) what the central bank’s inflation rule says.',
      definition:
        'Level shift in the key rate, in percentage points on top of the rule’s rate, applied in the month it is set and persistent while set (stabilisers on Automatic). The rule keeps reacting to inflation and output underneath it. A lasting offset acts partly like a lower inflation target (inflation stays about 0.2 pp below baseline per point) and partly as a lasting drag on output (about 0.3% per point after 20 years): expectations are only half anchored, and a higher rate moves interest income between borrowers and savers for good. That lasting output effect is a stock-flow departure from long-run neutrality, like the one a rate held high on Manual shows (decision 0002 §6). Setting it back to 0 returns the key rate to the rule’s rate that month. It has no effect while stabilisers are Manual.',
      concepts: ['taylor-rule', 'interest-rate-channel'],
    },
  ],
  stabilisers: [
    {
      id: 'keyRateRule',
      label: 'Central bank’s inflation rule',
      lever: 'keyRateFixed',
      offset: 'keyRateAddon',
      suggestion: 'keyRateSuggestion',
      shadow: ['ruleRate', 'ruleTarget', 'ruleAnchor'],
      // Half the lever's quarter-point step: it calls exactly when "Apply" would move the lever.
      threshold: 0.125,
      description:
        'A Taylor-type rule: the key rate the central bank is heading for, from expected inflation, inflation over the past year at constant VAT and the output gap. It moves there gradually from the rate in force, about a tenth of the way each month. On Automatic it sets the key rate; on Manual it suggests where it is heading, and the key-rate lever turns red when that is more than an eighth of a point away from your rate, so that applying it would move the lever a quarter-point step. Switching to Automatic starts the rule from the rate you held.',
      concepts: ['taylor-rule', 'gradual-adjustment'],
      feed: { raise: 'The central bank’s rule would raise the key rate to {value}%', lower: 'The central bank’s rule would cut the key rate to {value}%', indicator: 'keyRate' },
    },
  ],
  tests: [
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
      id: 'switch-starts-from-the-held-rate',
      label: 'Switching to Automatic after a Manual hold moves the key rate one smoothed step from the held rate, not to a path the rule was never in charge of',
      run: (e) => {
        const k = 1 - Math.exp(-e.influences('ruleRate').params.find((q) => q.id === 'lamPol')!.value / 12);
        e.setLever('keyRateFixed', 6);
        e.step(24);
        const held = e.value('keyRate');
        const target = e.value('ruleTarget');
        e.setLever(STABILISERS, AUTOMATIC);
        e.step(1);
        const move = e.value('keyRate') - held;
        const step = k * (e.value('ruleTarget') - held);
        return {
          pass: Math.abs(held - 0.06) < 1e-15 && Math.abs(move - step) < 1e-12 && Math.abs(move) < 0.25 * Math.abs(target - held),
          detail: `held 6% for two years (the rule heading for ${(100 * target).toFixed(2)}%); first month on Automatic ${(100 * e.value('keyRate')).toFixed(2)}%, a move of ${(100 * move).toFixed(2)} pp = ${k.toFixed(3)} × the gap`,
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
      id: 'manual-holds-the-key-rate',
      label: 'Manual: the key rate stays at the lever’s level while the rule’s suggestion moves; the default is the neutral rate',
      run: (e) => {
        const ps = e.influences('ruleTarget').params;
        const n = ps.find((p) => p.id === 'i0')!.value + ps.find((p) => p.id === 'piT')!.value;
        const lever = e.model.levers.find((l) => l.id === 'keyRateFixed')!;
        e.setLever('keyRateFixed', 7);
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
      id: 'automatic-rule-plus-offset-and-floor',
      label: 'Automatic: the key rate is the rule’s rate plus the offset, and never goes below zero',
      run: (e) => {
        e.setLever(STABILISERS, AUTOMATIC);
        e.setLever('keyRateAddon', 1);
        e.step(3);
        const sum = e.value('keyRate') - e.value('ruleRate') - 0.01;
        e.setLever('keyRateAddon', -3);
        e.step(2);
        const floorOk = e.value('keyRate') >= 0;
        return { pass: Math.abs(sum) < 1e-15 && floorOk, detail: `key rate − rule − 1 pp = ${sum.toExponential(1)}; after a −3 pp offset ${e.value('keyRate').toFixed(4)}` };
      },
    },
  ],
};
