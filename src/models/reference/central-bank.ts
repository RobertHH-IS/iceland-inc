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
  { id: 'neutralRate', value: 0.03, unit: 'fraction/yr', category: 'POLICY', description: 'Key rate when inflation is on target and output is at capacity.', provenance: assumed },
  {
    id: 'inflationTarget',
    value: 0,
    unit: 'fraction/yr',
    category: 'POLICY',
    description: 'The inflation the central bank aims for, and that people partly expect whatever inflation is now. Zero here: the baseline has stable prices.',
    provenance: { basis: 'assumed', note: 'The baseline is a steady state with zero inflation (roadmap v2 adds a growing baseline with 2.5% inflation, the Central Bank of Iceland’s target).' },
  },
  { id: 'taylorInflation', value: 1.5, unit: 'fraction', category: 'POLICY', description: 'Points of key rate per point of inflation above target. Above 1, real rates rise when inflation does.', provenance: assumed },
  {
    id: 'taylorLookThrough',
    value: 0.5,
    unit: 'fraction',
    category: 'POLICY',
    description:
      'How far the central bank looks through a jump in prices: the share of the rule’s inflation term read from expected inflation rather than the last 12 months’ inflation. A one-off jump in costs lifts 12-month inflation for a year, but expected inflation much less.',
    provenance: {
      basis: 'assumed',
      note: 'Teaching value for a rule that reacts partly to forecast inflation (Clarida, Galí & Gertler 2000) and looks through the first round of a one-off cost shock (Blanchard & Bernanke 2023). With it a 10% wage settlement costs about 4.7% of output at the trough, not 6.5% (review REF-realbalance-too-strong). It is kept at 0.5 so the rule still obeys the Taylor principle: with expectations anchored to the target with weight 0.6, the key rate rises 1.5 × (1 − 0.5 × 0.6) = 1.05 points per point of lasting inflation.',
    },
  },
  { id: 'taylorOutput', value: 1, unit: 'fraction', category: 'POLICY', description: 'Points of key rate per 1% of output above capacity (Taylor’s 1999 variant; his 1993 rule used 0.5).', provenance: assumed },
  { id: 'policySpeed', value: 1, unit: 'per year', category: 'POLICY', description: 'How fast the key rate moves toward what the rule says (central banks move in steps).', provenance: assumed },
  { id: 'bondSpread', value: 0.005, unit: 'fraction/yr', category: 'CONTRACT', description: 'How far the bond rate sits above the key rate.', provenance: assumed },
  { id: 'reserveRatio', value: 0.1, unit: 'fraction of deposits', category: 'POLICY', description: 'Reserves the central bank aims to supply, as a share of deposits.', provenance: assumed },
  { id: 'reserveSpeed', value: 6, unit: 'per year', category: 'POLICY', description: 'How fast open-market operations close the gap to the reserve target.', provenance: assumed },
  {
    id: 'cbCapitalTarget',
    value: 7.2,
    unit: '% of GDP',
    category: 'POLICY',
    description: 'The central bank’s own capital (its bonds minus the reserves and treasury balance it owes) that it keeps; it hands the government its profit plus anything above this.',
    provenance: {
      basis: 'derived',
      note: 'The central bank’s capital (its bonds − reserves − the treasury balance) in the reference steady state as the baseline solver found it before this target existed: bonds about 18.0 − reserves about 8.8 − the treasury balance 2.0 = 7.2% of GDP, set by the reserve target (reserveRatio) and the two solved targets (GDP 100, government debt 55% of GDP). Before this target nothing pinned the central bank’s capital, so the solved baseline (government spending, the tax rate, who holds the bonds) shifted with unrelated settings such as adjustment speeds.',
    },
  },
  { id: 'cbPayoutSpeed', value: 1, unit: 'per year', category: 'POLICY', description: 'How fast the central bank pays out capital above its target (or keeps profit back when below).', provenance: assumed },
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
      inputs: ['inflation12', 'expectedInflation'],
      lagInputs: ['output'],
      params: ['neutralRate', 'inflationTarget', 'taylorInflation', 'taylorLookThrough', 'taylorOutput', 'potentialOutput'],
      levers: ['stabilisers', 'keyRateAddon'],
      adjust: { speed: 'policySpeed' },
      terms: [
        { id: 'neutral', label: 'Neutral rate', compute: (c) => c.p('neutralRate') },
        {
          id: 'inflation',
          label: 'Inflation above target',
          concept: 'taylor-rule',
          compute: (c) => c.p('taylorInflation') * ((1 - c.p('taylorLookThrough')) * c.v('inflation12') + c.p('taylorLookThrough') * c.v('expectedInflation') - c.p('inflationTarget')),
        },
        { id: 'outputGap', label: 'Output above capacity', concept: 'taylor-rule', compute: (c) => c.p('taylorOutput') * (c.lag('output') / c.p('potentialOutput') - 1) },
        { id: 'addOn', label: 'Your offset (Automatic)', concept: 'taylor-rule', compute: (c) => (automatic(c) ? c.lever('keyRateAddon') / 100 : 0) },
      ],
      combine: (t) => Math.max(0, t.neutral + t.inflation + t.outputGap + t.addOn),
      regime: (_c, _v, t) => (t.neutral + t.inflation + t.outputGap + t.addOn < 0 ? 'Zero lower bound binds' : null),
      concepts: ['taylor-rule', 'gradual-adjustment'],
      explain: {
        what: 'The key rate the Taylor rule calls for. With stabilisers on Automatic it is the key rate; on Manual it is only a suggestion beside the key-rate lever.',
        rule: 'Target = {neutralRate%} + {taylorInflation} × inflation above the {inflationTarget%} target + {taylorOutput} × last month’s output gap, plus your offset on Automatic, never below zero. The inflation it reads is a blend: {taylorLookThrough} of it is expected inflation, the rest the last 12 months’ inflation, so the rule looks partly through a one-off jump in prices. The rate moves toward the target at speed {policySpeed} a year, in both modes. The other terms react as inflation and output respond, so they pull against your offset: the lower inflation and output it brings pull the target back down. At zero the rule can cut no further, and neither can deposit rates. A large lasting cut in demand can then hold the key rate at zero for years: government spending 3% of GDP lower keeps it there for about 15 years, with output still 4% down after ten, because only the debt rule’s slow tax cuts bring demand back (a liquidity trap).',
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
      concepts: ['interest-rate-channel'],
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
        { id: 'keyRate', label: 'Key rate', concept: 'interest-rate-channel', compute: (c) => c.v('keyRate') },
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
        ['bonds', 'B'],
        ['bonds', 'CB'],
      ],
      params: ['reserveRatio', 'reserveSpeed'],
      terms: [{ id: 'reserveGap', label: 'Reserves below target', concept: 'reserves-and-payments', compute: (c) => c.p('reserveSpeed') * (c.p('reserveRatio') * c.stock('deposits', 'B') - c.stock('reserves', 'B')) }],
      // Not additive at the ends: nobody sells bonds it does not have.
      combine: (t, c) => Math.min(c.stock('bonds', 'B') / c.dt, Math.max(-c.stock('bonds', 'CB') / c.dt, t.reserveGap)),
      regime: (c, _v, t) =>
        t.reserveGap > c.stock('bonds', 'B') / c.dt ? 'Limited by the bank’s bonds' : t.reserveGap < -c.stock('bonds', 'CB') / c.dt ? 'Limited by the central bank’s bonds' : null,
      concepts: ['reserves-and-payments'],
      explain: {
        what: 'Bonds the central bank buys from the bank (negative: sells), paying in reserves.',
        rule: 'Purchases = {reserveSpeed} × a year of the gap between the reserve target ({reserveRatio} × deposits) and reserves. The central bank cannot buy more bonds in a month than the bank holds, nor sell more than it holds itself.',
      },
    },
    {
      id: 'cbProfit',
      target: 'cbProfit',
      category: 'CONTRACT',
      inputs: ['bondInterestCB', 'reserveInterest'],
      stocks: [
        ['bonds', 'CB'],
        ['reserves', 'CB'],
        ['treasuryAccount', 'CB'],
      ],
      params: ['cbCapitalTarget', 'cbPayoutSpeed'],
      terms: [
        { id: 'profit', label: 'Profit', concept: 'reserves-and-payments', compute: (c) => c.v('bondInterestCB') - c.v('reserveInterest') },
        {
          id: 'capitalSurplus',
          label: 'Capital above target',
          concept: 'net-worth',
          compute: (c) => c.p('cbPayoutSpeed') * (c.stock('bonds', 'CB') - c.stock('reserves', 'CB') - c.stock('treasuryAccount', 'CB') - c.p('cbCapitalTarget')),
        },
      ],
      explain: {
        what: 'The central bank’s profit, handed to the government.',
        rule: 'Payment = interest on its bonds − interest paid on reserves, plus {cbPayoutSpeed} × a year of any capital above {cbCapitalTarget}% of GDP (minus if below). At the baseline its capital is on target, so it hands over exactly its profit. This is the law that governs the central bank’s accounts, not a policy setting: it works the same on Manual and Automatic.',
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
      description: 'Sets the key-rate target this many points above (or below) what the Taylor rule says. The rule then leans against it, so the key rate itself rises by much less.',
      definition:
        'Level shift in the key-rate target, in percentage points, persistent while set (stabilisers on Automatic). The key rate moves toward the new target gradually, and output and inflation fall (or rise, if negative). As they do, the rule’s own inflation and output terms cancel part of the offset, so the key rate rises by only about half of it at its peak, after a little over a year. Held for years, the offset works partly like a lower inflation target: inflation settles lower, by about a quarter of the offset. Because expectations stay anchored to the target, output also stays below capacity, by about 0.7% per point of offset, and the rule’s own terms end up cancelling nearly all of the offset, so the key rate ends close to where it started. Setting it back to 0 returns policy to the rule. It has no effect on Manual.',
      concepts: ['taylor-rule', 'policy-lags', 'anchored-expectations'],
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
      description: 'The key interest rate, held where you set it (stabilisers on Manual). A rise cools the economy for several years; held for longer, its effect reverses, because the interest it pays out is spent.',
      definition:
        'Level of the key rate in percent a year, applied in the month it is set and held there until you change it (stabilisers on Manual); the Taylor rule only suggests. The default, 3%, is the neutral rate. For the first years a higher rate works as textbooks say: at 4.75%, output is about 2.6% lower after three years. Held for longer, the effect reverses, after about eight years (month 102 at 4.75%, sooner for bigger moves: month 85 at 10%): the interest on government bonds and on deposits is income for households, and the higher rate also means more of it on a larger stock of deposits, so they spend more and more of it, while anchored expectations keep inflation from running away. At 4.75% output is about 3% higher after 20 years and inflation about 1.1 points higher; at 10%, 13% and 5.5 points, with the price level 46% higher; at 0%, 2.4% lower. The same stock-flow channel reverses a held Iceland key rate (MON-1). So effects beyond a few years show the interest-income channel of an economy without a policy rule, not what a central bank would do. It has no effect on Automatic.',
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
      label: 'The rule raises the key rate by more than one point per point of lasting inflation',
      run: (e) => {
        const p = (rule: string, id: string) => e.influences(rule).params.find((x) => x.id === id)!.value;
        // Lasting inflation π moves expected inflation by (1 − anchor) × π, so the blend the rule
        // reads moves by (1 − lookThrough × anchor) × π.
        const a = p('ruleRate', 'taylorInflation') * (1 - p('ruleRate', 'taylorLookThrough') * p('expectedInflation', 'expectationsAnchor'));
        return { pass: a > 1, detail: `key rate per point of lasting inflation = ${a.toFixed(3)}` };
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
