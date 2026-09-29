/**
 * Iceland Inc.: the central bank (v1 equations E1–E3 and E26).
 *
 * A smoothed Taylor-type rule works out the key rate the central bank's inflation rule calls for,
 * from expected and actual inflation and the output gap, every month in both stabiliser modes.
 * Who sets the key rate depends on the stabiliser setting (decision 0004): in Manual you do, and
 * the rule's rate is only a suggestion; in Automatic the rule does, and your lever is an offset to
 * it. It never goes below zero. The central bank pays the key rate on banks' reserves, earns
 * interest on its bonds and foreign reserves, and hands its profit to the government.
 */
import type { ModuleDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { pickParams, terms, lastMonth, automatic, AUTOMATIC, MANUAL, STABILISERS } from '../util.ts';

export const centralBank: ModuleDef = {
  id: 'central-bank',
  label: 'Central bank',
  description: 'The key rate (set by you, or by a smoothed Taylor-type rule plus your offset), interest on reserves and the profit remitted to the government.',
  requires: ['stabilisers', 'structure', 'prices', 'government', 'external'],
  params: pickParams(ALL_PARAMS, ['i0', 'piT', 'aPi', 'aPiA', 'aY', 'lamPol', 'iFXR', 'potentialOutput', 'bondCB', 'fxr', 'eqCB']),
  vars: [
    { id: 'ruleRate', label: 'Key rate the rule calls for', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('ruleRate'), description: 'The key rate the central bank’s inflation rule points to, before your offset. Computed in both stabiliser modes.' },
    { id: 'keyRateSuggestion', label: 'Key rate the rule suggests', unit: '%/yr', kind: 'rate', scale: 'none', description: 'The rule’s rate in percent, never below zero: what the “Apply” button sets the key-rate lever to in Manual mode.' },
    { id: 'keyRate', label: 'Key interest rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('keyRate') },
    { id: 'reserveInterest', label: 'Interest on reserves', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'fxReserveIncome', label: 'Income on foreign reserves', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'cbProfit', label: 'Central-bank profit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('cbProfit') },
  ],
  rules: [
    {
      id: 'ruleRate',
      target: 'ruleRate',
      category: 'POLICY',
      label: 'Taylor-type rule',
      lagInputs: ['expectedInflation', 'inflation12', 'output'],
      params: ['i0', 'piT', 'aPi', 'aPiA', 'aY', 'potentialOutput'],
      adjust: { speed: 'lamPol', form: 'exponential' },
      terms: terms(
        ['neutral', 'Neutral rate (real neutral + inflation target)', 'taylor-rule', (c) => c.p('i0') + c.p('piT')],
        ['expectedInflation', 'Expected inflation above target', 'anchored-expectations', (c) => c.p('aPi') * (lastMonth(c, 'expectedInflation') - c.p('piT'))],
        ['actualInflation', 'Inflation over the past year above target', 'taylor-rule', (c) => c.p('aPiA') * (lastMonth(c, 'inflation12') - c.p('piT'))],
        ['outputGap', 'Output above capacity', 'capacity-utilisation', (c) => c.p('aY') * (lastMonth(c, 'output') / c.p('potentialOutput') - 1)],
      ),
      concepts: ['taylor-rule', 'policy-lags'],
      explain: {
        what: 'The key interest rate the central bank’s inflation rule points to. With stabilisers on Automatic it sets the key rate; on Manual it is only a suggestion shown beside the key-rate lever. The rule moves gradually rather than jumping.',
        rule: 'Target = neutral nominal rate (the neutral real rate {i0%} + the inflation target {piT%}) + {aPi} × (expected inflation − target) + {aPiA} × (inflation over the past year − target) + {aY} × the output gap (last month’s output ÷ capacity − 1). The rate closes the gap to that target at speed {lamPol} a year (about a quarter of it each month). It is worked out every month in both modes.',
      },
    },
    {
      id: 'keyRateSuggestion',
      target: 'keyRateSuggestion',
      category: 'POLICY',
      label: 'The rule’s suggestion, in lever units',
      inputs: ['ruleRate'],
      compute: (c) => Math.max(0, 100 * c.v('ruleRate')),
      concepts: ['taylor-rule'],
      explain: {
        what: 'The key rate the central bank’s inflation rule would set now, in percent a year. In Manual mode the key-rate lever turns red when you are more than an eighth of a point away from it, and “Apply” sets the lever to it, rounded to a quarter point.',
        rule: 'Suggestion = the rule’s rate × 100, never below 0%. It is computed in both modes, so it is there as soon as you switch.',
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
        ['addOn', 'Your offset to the rule (Automatic)', 'policy-lags', (c) => (automatic(c) ? c.lever('keyRateAddon') / 100 : 0)],
        ['set', 'The rate you set (Manual)', undefined, (c) => (automatic(c) ? 0 : c.lever('keyRateFixed') / 100)],
      ),
      combine: (t) => Math.max(0, t.rule + t.addOn + t.set),
      regime: (c, _v, t) => {
        if (!automatic(c)) return 'Held where you set it';
        return t.rule + t.addOn < 0 ? 'Zero lower bound binds' : null;
      },
      concepts: ['taylor-rule'],
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
        ['foreignRate', 'Change in rates abroad', 'carry-trade', (c) => (c.v('foreignRate') - c.p('iF0')) * c.stock('fxReserves', 'CB')],
      ),
      explain: {
        what: 'Interest and dividends the central bank earns on its foreign reserves.',
        rule: 'Income = (the normal reserve yield {iFXR%} + (the foreign interest rate − its normal level {iF0%})) × the reserves’ value in krónur. Reserves are held in foreign bonds and deposits, so their yield follows rates abroad point for point.',
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
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'W', to: 'CB', amount: 'fxReserveIncome' }],
      explain: { what: 'Foreign reserves earn interest and dividends; the krónur arrive from abroad and banks pass on reserves.' },
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
        'Level of the key rate in percent a year, applied in the month it is set and held there until you change it (stabilisers on Manual). Nothing in the model moves it. The default, 3%, is the neutral rate, so the baseline is unchanged. It has no effect while stabilisers are Automatic, when the rule sets the key rate.',
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
        'Level shift in the key rate, in percentage points on top of the rule’s rate, applied in the month it is set and persistent while set (stabilisers on Automatic). The rule keeps reacting to inflation and output underneath it. Setting it back to 0 returns the key rate to the rule’s rate that month. It has no effect while stabilisers are Manual.',
      concepts: ['taylor-rule', 'policy-lags'],
    },
  ],
  stabilisers: [
    {
      id: 'keyRateRule',
      label: 'Central bank’s inflation rule',
      lever: 'keyRateFixed',
      offset: 'keyRateAddon',
      suggestion: 'keyRateSuggestion',
      shadow: ['ruleRate'],
      // Half the lever's quarter-point step: it calls exactly when "Apply" would move the lever.
      threshold: 0.125,
      description:
        'A Taylor-type rule: the key rate the central bank would set from expected inflation, inflation over the past year and the output gap, moving about a quarter of the way each month. On Automatic it sets the key rate; on Manual it suggests a rate, and the key-rate lever turns red when the rule is more than an eighth of a point away from your rate, so that applying it would move the lever a quarter-point step.',
      concepts: ['taylor-rule', 'policy-lags'],
      feed: { raise: 'The central bank’s rule would raise the key rate to {value}%', lower: 'The central bank’s rule would cut the key rate to {value}%', indicator: 'keyRate' },
    },
  ],
  tests: [
    {
      id: 'neutral-at-baseline',
      label: 'At baseline the key rate equals the neutral nominal rate (real neutral + inflation target)',
      run: (e) => {
        const ps = e.influences('ruleRate').params;
        const n = ps.find((p) => p.id === 'i0')!.value + ps.find((p) => p.id === 'piT')!.value;
        const k = e.baseline('keyRate');
        return { pass: Math.abs(k - n) < 1e-12, detail: `key rate ${k} vs neutral ${n}` };
      },
    },
    {
      id: 'taylor-principle',
      label: 'The rule moves the key rate by more than a point per point of inflation',
      run: (e) => {
        const ps = e.influences('ruleRate').params;
        const a = ps.find((p) => p.id === 'aPi')!.value + ps.find((p) => p.id === 'aPiA')!.value;
        return { pass: a > 1, detail: `aPi + aPiA = ${a}` };
      },
    },
    {
      id: 'manual-holds-the-key-rate',
      label: 'Manual: the key rate stays at the lever’s level while the rule’s suggestion moves; the default is the neutral rate',
      run: (e) => {
        const ps = e.influences('ruleRate').params;
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
