/**
 * Iceland Inc.: the central bank (v1 equations E1–E3 and E26).
 *
 * A smoothed rule sets the key rate from expected and actual inflation and the output gap. The
 * lever can add to the rule or hold the rate fixed; it never goes below zero. The central bank
 * pays the key rate on banks' reserves, earns interest on its bonds and foreign reserves, and
 * hands its profit to the government.
 */
import type { ModuleDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { pickParams, terms, lastMonth } from '../util.ts';

const mode = (x: number) => (Math.round(x) >= 1 ? 'fixed' : 'rule');

export const centralBank: ModuleDef = {
  id: 'central-bank',
  label: 'Central bank',
  description: 'The key rate (a smoothed Taylor-type rule with an add-on or a fixed setting), interest on reserves and the profit remitted to the government.',
  requires: ['structure', 'prices', 'government'],
  params: pickParams(ALL_PARAMS, ['i0', 'piT', 'aPi', 'aPiA', 'aY', 'lamPol', 'iFXR', 'potentialOutput', 'bondCB', 'fxr', 'eqCB']),
  vars: [
    { id: 'ruleRate', label: 'Key rate the rule calls for', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('ruleRate'), description: 'The key rate the central bank’s rule points to, before any add-on.' },
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
        ['neutral', 'Neutral rate', 'taylor-rule', (c) => c.p('i0')],
        ['expectedInflation', 'Expected inflation above target', 'anchored-expectations', (c) => c.p('aPi') * (lastMonth(c, 'expectedInflation') - c.p('piT'))],
        ['actualInflation', 'Inflation over the past year above target', 'taylor-rule', (c) => c.p('aPiA') * (lastMonth(c, 'inflation12') - c.p('piT'))],
        ['outputGap', 'Output above capacity', 'capacity-utilisation', (c) => c.p('aY') * (lastMonth(c, 'output') / c.p('potentialOutput') - 1)],
      ),
      concepts: ['taylor-rule', 'policy-lags'],
      explain: {
        what: 'The key interest rate the central bank’s rule points to. The bank moves toward it gradually rather than jumping.',
        rule: 'Target = neutral rate {i0%} + {aPi} × (expected inflation − target) + {aPiA} × (inflation over the past year − target) + {aY} × the output gap (last month’s output ÷ capacity − 1). The rate closes the gap to that target at speed {lamPol} a year (about a quarter of it each month).',
      },
    },
    {
      id: 'keyRate',
      target: 'keyRate',
      category: 'POLICY',
      label: 'Key rate: rule, add-on or fixed',
      inputs: ['ruleRate'],
      levers: ['keyRateMode', 'keyRateAddon', 'keyRateFixed'],
      terms: terms(
        ['rule', 'What the rule says', 'taylor-rule', (c) => c.v('ruleRate')],
        ['addOn', 'Policy add-on (lever)', 'policy-lags', (c) => c.lever('keyRateAddon') / 100],
      ),
      combine: (t, c) => Math.max(0, mode(c.lever('keyRateMode')) === 'fixed' ? c.lever('keyRateFixed') / 100 : t.rule + t.addOn),
      regime: (c, _v, t) => {
        if (mode(c.lever('keyRateMode')) === 'fixed') return 'Held fixed by the lever';
        return t.rule + t.addOn < 0 ? 'Zero lower bound binds' : null;
      },
      concepts: ['taylor-rule'],
      explain: {
        what: 'The interest rate the central bank sets: it pays it on banks’ reserves, and every other rate in the economy follows it.',
        rule: 'Key rate = the rule’s rate + the add-on lever, or the fixed level when the key-rate setting is Fixed. It never goes below 0%.',
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
      explain: { what: 'Interest the central bank pays on banks’ reserves. It creates new reserves.', rule: 'Interest = key rate × reserves.' },
    },
    {
      id: 'fxReserveIncome',
      target: 'fxReserveIncome',
      category: 'BEHAVIOUR',
      params: ['iFXR'],
      stocks: [['fxReserves', 'CB']],
      compute: (c) => c.p('iFXR') * c.stock('fxReserves', 'CB'),
      explain: { what: 'Interest and dividends the central bank earns on its foreign reserves.', rule: 'Income = foreign yield {iFXR%} × the reserves’ value in krónur.' },
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
      id: 'keyRateMode',
      label: 'Key-rate setting',
      group: 'Policy',
      section: 'Central bank',
      kind: 'choice',
      unit: 'mode',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      options: [
        { value: 0, label: 'Rule (+ add-on)' },
        { value: 1, label: 'Fixed' },
      ],
      description: 'Follow the central bank’s rule (plus any add-on), or hold the key rate at a fixed level.',
      definition:
        'Switch, persistent while set: 0 = the key rate follows the rule plus the add-on; 1 = it is held at the fixed level at once. Switching back returns the rate to the rule, whose own smoothing has kept running meanwhile.',
      concepts: ['taylor-rule'],
    },
    {
      id: 'keyRateAddon',
      label: 'Key rate: add-on to the rule',
      group: 'Policy',
      section: 'Central bank',
      kind: 'setting',
      unit: 'pp',
      default: 0,
      min: -3,
      max: 5,
      step: 0.25,
      description: 'Sets the key rate this many points above (or below) what the rule says.',
      definition:
        'Level shift in the key rate, in percentage points, applied at once and persistent while set (used only in Rule mode). Setting it back to 0 returns the key rate to what the rule says that month.',
      concepts: ['taylor-rule', 'policy-lags'],
    },
    {
      id: 'keyRateFixed',
      label: 'Key rate: fixed level',
      group: 'Policy',
      section: 'Central bank',
      kind: 'setting',
      unit: '%',
      default: 3,
      min: 0,
      max: 15,
      step: 0.25,
      description: 'The key rate used when the key-rate setting is Fixed.',
      definition: 'Level of the key rate in percent a year, persistent while set and used only in Fixed mode. It has no effect while the rule is in charge.',
      concepts: ['taylor-rule'],
    },
  ],
  tests: [
    {
      id: 'neutral-at-baseline',
      label: 'At baseline the key rate equals the neutral rate',
      run: (e) => {
        const n = e.influences('ruleRate').params.find((p) => p.id === 'i0')!.value;
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
      id: 'fixed-mode-and-floor',
      label: 'Fixed mode holds the key rate at the lever’s level; the rate never goes below zero',
      run: (e) => {
        e.setLever('keyRateMode', 1);
        e.setLever('keyRateFixed', 7);
        e.step(1);
        const fixed = e.value('keyRate');
        e.setLever('keyRateMode', 0);
        e.setLever('keyRateAddon', -3);
        e.step(2);
        const floorOk = e.value('keyRate') >= 0;
        return { pass: Math.abs(fixed - 0.07) < 1e-12 && floorOk, detail: `fixed ${fixed}, after a −3 pp add-on ${e.value('keyRate').toFixed(4)}` };
      },
    },
  ],
};
