/**
 * Reference economy: the central bank.
 *
 * A Taylor-type rule works out the key rate from inflation and the output gap. With stabilisers on
 * Automatic (this economy's default) it sets the key rate; on Manual the key rate is held where the
 * user sets it and the rule only suggests (decision 0004). The central bank pays the key rate on
 * the bank's reserves, keeps reserves near a target by buying or selling government bonds
 * (open-market operations) and hands its profit to the government.
 */
import type { ModuleDef, ParamDef } from '../../core/types.ts';
import { automatic, AUTOMATIC, MANUAL } from './stabilisers.ts';

const assumed = { basis: 'assumed' as const, note: 'Teaching value, chosen to give readable dynamics.' };

const params: ParamDef[] = [
  { id: 'neutralRate', value: 0.03, unit: 'fraction/yr', category: 'POLICY', description: 'Key rate when inflation is on target (zero here) and output is at capacity.', provenance: assumed },
  { id: 'taylorInflation', value: 1.5, unit: 'fraction', category: 'POLICY', description: 'Points of key rate per point of inflation above target. Above 1, real rates rise when inflation does.', provenance: assumed },
  { id: 'taylorOutput', value: 1, unit: 'fraction', category: 'POLICY', description: 'Points of key rate per 1% of output above capacity (Taylor’s 1999 variant; his 1993 rule used 0.5).', provenance: assumed },
  { id: 'policySpeed', value: 1, unit: 'per year', category: 'POLICY', description: 'How fast the key rate moves toward what the rule says (central banks move in steps).', provenance: assumed },
  { id: 'bondSpread', value: 0.005, unit: 'fraction/yr', category: 'CONTRACT', description: 'How far the bond rate sits above the key rate.', provenance: assumed },
  { id: 'reserveRatio', value: 0.1, unit: 'fraction of deposits', category: 'POLICY', description: 'Reserves the central bank aims to supply, as a share of deposits.', provenance: assumed },
  { id: 'reserveSpeed', value: 6, unit: 'per year', category: 'POLICY', description: 'How fast open-market operations close the gap to the reserve target.', provenance: assumed },
];

export const centralBank: ModuleDef = {
  id: 'central-bank',
  label: 'Central bank',
  description: 'The key rate (a Taylor rule), interest on reserves, open-market operations and the central bank’s profit.',
  requires: ['stabilisers', 'structure', 'labour-and-prices'],
  params,
  vars: [
    { id: 'ruleRate', label: 'Key rate the rule calls for', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0.03, description: 'The Taylor rule’s rate, computed in both stabiliser modes.' },
    { id: 'keyRateSuggestion', label: 'Key rate the rule suggests', unit: '%/yr', kind: 'rate', scale: 'none', description: 'The rule’s rate in percent: comparable with the key-rate lever.' },
    { id: 'keyRate', label: 'Key interest rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0.03 },
    { id: 'bondRate', label: 'Bond rate', unit: 'fraction/yr', kind: 'rate', scale: 'none' },
    { id: 'reserveInterest', label: 'Interest on reserves', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'openMarket', label: 'Central-bank bond purchases', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'cbProfit', label: 'Central-bank profit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ],
  rules: [
    {
      id: 'ruleRate',
      target: 'ruleRate',
      category: 'POLICY',
      label: 'Taylor rule',
      inputs: ['inflation12'],
      lagInputs: ['output'],
      params: ['neutralRate', 'taylorInflation', 'taylorOutput', 'potentialOutput'],
      levers: ['stabilisers', 'keyRateAddon'],
      adjust: { speed: 'policySpeed' },
      terms: [
        { id: 'neutral', label: 'Neutral rate', compute: (c) => c.p('neutralRate') },
        { id: 'inflation', label: 'Inflation above target', concept: 'taylor-rule', compute: (c) => c.p('taylorInflation') * c.v('inflation12') },
        { id: 'outputGap', label: 'Output above capacity', concept: 'taylor-rule', compute: (c) => c.p('taylorOutput') * (c.lag('output') / c.p('potentialOutput') - 1) },
        { id: 'addOn', label: 'Your offset (Automatic)', concept: 'policy-lags', compute: (c) => (automatic(c) ? c.lever('keyRateAddon') / 100 : 0) },
      ],
      combine: (t) => Math.max(0, t.neutral + t.inflation + t.outputGap + t.addOn),
      regime: (_c, _v, t) => (t.neutral + t.inflation + t.outputGap + t.addOn < 0 ? 'Zero lower bound binds' : null),
      concepts: ['taylor-rule', 'policy-lags'],
      explain: {
        what: 'The key rate the Taylor rule calls for. With stabilisers on Automatic it is the key rate; on Manual it is only a suggestion beside the key-rate lever.',
        rule: 'Target = {neutralRate%} + {taylorInflation} × 12-month inflation + {taylorOutput} × last month’s output gap, plus your offset on Automatic, never below zero. The rate moves toward the target at speed {policySpeed} a year, in both modes.',
      },
    },
    {
      id: 'keyRateSuggestion',
      target: 'keyRateSuggestion',
      category: 'POLICY',
      inputs: ['ruleRate'],
      compute: (c) => 100 * c.v('ruleRate'),
      concepts: ['taylor-rule'],
      explain: {
        what: 'The key rate the Taylor rule would set now, in percent a year: what “Apply” sets the key-rate lever to on Manual.',
        rule: 'Suggestion = the rule’s rate × 100 (never below zero, like the rule).',
      },
    },
    {
      id: 'keyRate',
      target: 'keyRate',
      category: 'POLICY',
      label: 'Key rate: the rule’s, or yours',
      inputs: ['ruleRate'],
      levers: ['stabilisers', 'keyRateFixed'],
      terms: [
        { id: 'rule', label: 'The Taylor rule (Automatic)', concept: 'taylor-rule', compute: (c) => (automatic(c) ? c.v('ruleRate') : 0) },
        { id: 'set', label: 'The rate you set (Manual)', compute: (c) => (automatic(c) ? 0 : c.lever('keyRateFixed') / 100) },
      ],
      regime: (c) => (automatic(c) ? null : 'Held where you set it'),
      concepts: ['taylor-rule'],
      explain: {
        what: 'The interest rate the central bank sets. Every other rate in the economy follows it.',
        rule: 'Who sets it depends on the Stabilisers setting. Automatic (the default here): the Taylor rule does, and your offset shifts the rule’s target. Manual: you do; the key rate is the level of the “Key interest rate” lever and stays there until you change it.',
      },
    },
    {
      id: 'bondRate',
      target: 'bondRate',
      category: 'CONTRACT',
      inputs: ['keyRate'],
      params: ['bondSpread'],
      terms: [
        { id: 'keyRate', label: 'Key rate', concept: 'taylor-rule', compute: (c) => c.v('keyRate') },
        { id: 'spread', label: 'Term premium', compute: (c) => c.p('bondSpread') },
      ],
      explain: { what: 'Interest the government pays on its bonds (a floating rate).', rule: 'Bond rate = key rate + {bondSpread pp}.' },
    },
    {
      id: 'reserveInterest',
      target: 'reserveInterest',
      category: 'POLICY',
      inputs: ['keyRate'],
      stocks: [['reserves', 'B']],
      compute: (c) => c.v('keyRate') * c.stock('reserves', 'B'),
      concepts: ['reserves-and-payments'],
      explain: { what: 'Interest the central bank pays on the bank’s reserves.', rule: 'Interest = key rate × reserves.' },
    },
    {
      id: 'openMarket',
      target: 'openMarket',
      category: 'POLICY',
      stocks: [
        ['deposits', 'B'],
        ['reserves', 'B'],
      ],
      params: ['reserveRatio', 'reserveSpeed'],
      compute: (c) => c.p('reserveSpeed') * (c.p('reserveRatio') * c.stock('deposits', 'B') - c.stock('reserves', 'B')),
      concepts: ['reserves-and-payments'],
      explain: {
        what: 'Bonds the central bank buys from the bank (negative: sells), paying in reserves.',
        rule: 'Purchases = {reserveSpeed} × a year of the gap between the reserve target ({reserveRatio} × deposits) and reserves.',
      },
    },
    {
      id: 'cbProfit',
      target: 'cbProfit',
      category: 'POLICY',
      inputs: ['bondInterestCB', 'reserveInterest'],
      compute: (c) => c.v('bondInterestCB') - c.v('reserveInterest'),
      explain: { what: 'The central bank’s profit, handed to the government.', rule: 'Profit = interest on its bonds − interest paid on reserves. All of it goes to the government.' },
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
      explain: { what: 'The central bank pays interest on reserves by crediting the bank’s reserve account.' },
    },
    {
      id: 'openMarket',
      label: 'Open-market operations',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'trade', instrument: 'bonds' },
      legs: [{ from: 'CB', to: 'B', amount: 'openMarket' }],
      concepts: ['reserves-and-payments'],
      explain: { what: 'The central bank buys bonds from the bank and pays with new reserves (or sells them and takes reserves back).' },
    },
    {
      id: 'cbProfit',
      label: 'Central-bank profit',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'CB', to: 'G', amount: 'cbProfit' }],
      explain: { what: 'The central bank hands its profit to the government’s account.' },
    },
  ],
  levers: [
    {
      id: 'keyRateAddon',
      label: 'Key rate: your offset to the rule',
      group: 'Policy',
      section: 'Central bank',
      kind: 'setting',
      unit: 'pp',
      default: 0,
      min: -2,
      max: 3,
      step: 0.25,
      showWhen: { lever: 'stabilisers', equals: AUTOMATIC },
      description: 'Sets the key-rate target this many points above (or below) what the Taylor rule says.',
      definition:
        'Level shift in the key-rate target, in percentage points, persistent while set (stabilisers on Automatic). The key rate moves toward the new target gradually. Setting it back to 0 returns policy to the rule. It has no effect on Manual.',
      concepts: ['taylor-rule', 'policy-lags'],
    },
    {
      id: 'keyRateFixed',
      label: 'Key interest rate',
      group: 'Policy',
      section: 'Central bank',
      kind: 'setting',
      unit: '%',
      default: 3,
      min: 0,
      max: 10,
      step: 0.25,
      showWhen: { lever: 'stabilisers', equals: MANUAL },
      description: 'The key interest rate, held where you set it (stabilisers on Manual).',
      definition:
        'Level of the key rate in percent a year, applied in the month it is set and held there until you change it (stabilisers on Manual); the Taylor rule only suggests. The default, 3%, is the neutral rate. It has no effect on Automatic.',
      concepts: ['taylor-rule'],
    },
  ],
  stabilisers: [
    {
      id: 'taylorRule',
      label: 'Taylor rule',
      lever: 'keyRateFixed',
      offset: 'keyRateAddon',
      suggestion: 'keyRateSuggestion',
      shadow: ['ruleRate'],
      threshold: 0.125, // half the lever's quarter-point step: calls when Apply would move the lever
      description:
        'The central bank’s Taylor rule: the key rate it would set from inflation and the output gap, reached gradually. On Automatic it sets the key rate (your offset shifts its target); on Manual it suggests a rate, and the key-rate lever turns red when applying it would move the lever.',
      concepts: ['taylor-rule', 'policy-lags'],
      feed: { raise: 'The Taylor rule would raise the key rate to {value}%', lower: 'The Taylor rule would cut the key rate to {value}%', indicator: 'keyRate' },
    },
  ],
  tests: [
    {
      id: 'taylor-principle',
      label: 'The rule raises the key rate by more than one point per point of inflation',
      run: (e) => {
        const a = e.influences('ruleRate').params.find((p) => p.id === 'taylorInflation')!.value;
        return { pass: a > 1, detail: `taylorInflation = ${a}` };
      },
    },
    {
      id: 'neutral-at-baseline',
      label: 'At baseline the key rate equals the neutral rate',
      run: (e) => {
        const n = e.influences('ruleRate').params.find((p) => p.id === 'neutralRate')!.value;
        return { pass: Math.abs(e.baseline('keyRate') - n) < 1e-12, detail: `key rate ${e.baseline('keyRate')} vs neutral ${n}` };
      },
    },
  ],
};
