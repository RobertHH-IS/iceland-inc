/**
 * Reference economy: the central bank.
 *
 * A Taylor-type rule works out the key rate from inflation and the output gap. While the key-rate
 * lever is unlocked (the default) it sets the key rate; locked, the key rate is held where the user
 * sets it and the rule stands aside (decision 0010). The rule steps from the rate in force, so
 * unlocking carries on from the held rate. The central bank pays the key rate on
 * the bank's reserves, keeps reserves near a target by buying or selling government bonds
 * (open-market operations) and hands its profit to the government.
 */
import type { ModuleDef, ParamDef } from '../../core/types.ts';

/** The Taylor rule's stabiliser id: rules that read its padlock declare `locks: [TAYLOR_RULE]`. */
export const TAYLOR_RULE = 'taylorRule';

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
  requires: ['structure', 'labour-and-prices'],
  params,
  vars: [
    { id: 'ruleTarget', label: 'Key rate the rule is heading for', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0.03, description: 'Where the Taylor rule would put the key rate if it moved there at once. Computed whether the key rate is locked or not.' },
    { id: 'ruleRate', label: 'Key rate the rule calls for', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0.03, description: 'The Taylor rule’s rate this month: one smoothed step from the rate in force toward where it is heading. Computed whether the key rate is locked or not.' },
    { id: 'ruleAnchor', label: 'Key rate the rule steps from', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0.03, description: 'The rate the rule starts next month’s step from: its own rate while it is in charge (key rate unlocked), the key rate you hold (locked).' },
    { id: 'keyRateSuggestion', label: 'Key rate the rule suggests', unit: '%/yr', kind: 'rate', scale: 'none', description: 'Where the rule is heading, in percent: comparable with the key-rate lever.' },
    { id: 'keyRate', label: 'Key interest rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0.03 },
    { id: 'bondRate', label: 'Bond rate', unit: 'fraction/yr', kind: 'rate', scale: 'none' },
    { id: 'reserveInterest', label: 'Interest on reserves', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'openMarket', label: 'Central-bank bond purchases', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'cbProfit', label: 'Central-bank profit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ],
  rules: [
    {
      id: 'ruleTarget',
      target: 'ruleTarget',
      category: 'POLICY',
      label: 'Taylor rule: where it is heading',
      inputs: ['inflation12', 'expectedInflation'],
      lagInputs: ['output'],
      params: ['neutralRate', 'inflationTarget', 'taylorInflation', 'taylorLookThrough', 'taylorOutput', 'potentialOutput'],
      terms: [
        { id: 'neutral', label: 'Neutral rate', compute: (c) => c.p('neutralRate') },
        {
          id: 'inflation',
          label: 'Inflation above target',
          concept: 'taylor-rule',
          compute: (c) => c.p('taylorInflation') * ((1 - c.p('taylorLookThrough')) * c.v('inflation12') + c.p('taylorLookThrough') * c.v('expectedInflation') - c.p('inflationTarget')),
        },
        { id: 'outputGap', label: 'Output above capacity', concept: 'taylor-rule', compute: (c) => c.p('taylorOutput') * (c.lag('output') / c.p('potentialOutput') - 1) },
      ],
      combine: (t) => Math.max(0, t.neutral + t.inflation + t.outputGap),
      regime: (_c, _v, t) => (t.neutral + t.inflation + t.outputGap < 0 ? 'Zero lower bound binds' : null),
      concepts: ['taylor-rule'],
      explain: {
        what: 'Where the Taylor rule would put the key rate if it moved there at once. The rule itself moves toward it gradually (the key rate the rule calls for).',
        rule: 'Target = {neutralRate%} + {taylorInflation} × inflation above the {inflationTarget%} target + {taylorOutput} × last month’s output gap, never below zero. The inflation it reads is a blend: {taylorLookThrough} of it is expected inflation, the rest the last 12 months’ inflation, so the rule looks partly through a one-off jump in prices. The neutral rate is fixed, so a lasting change in demand leaves inflation a little off target for good: the rule holds the key rate away from neutral only while inflation or output is off. At zero the rule can cut no further, and neither can deposit rates. A large lasting cut in demand can then hold the key rate at zero for years: government spending 3% of GDP lower keeps it there for about 15 years, with output still 4% down after ten, because only the debt rule’s slow tax cuts bring demand back (a liquidity trap).',
      },
    },
    {
      id: 'ruleRate',
      target: 'ruleRate',
      category: 'POLICY',
      label: 'Taylor rule, smoothed',
      inputs: ['ruleTarget'],
      lagInputs: ['ruleAnchor'],
      params: ['policySpeed'],
      // A step from the rate in force toward the target: the linear partial adjustment `adjust`
      // would give, but anchored on the rate in force rather than the rule's own last value, so
      // unlocking the key rate carries on from the held rate (decision 0010).
      terms: [
        { id: 'inForce', label: 'Where the rule stands: the rate in force last month', concept: 'gradual-adjustment', compute: (c) => c.lag('ruleAnchor') },
        { id: 'step', label: 'A step toward where the rule is heading', concept: 'taylor-rule', compute: (c) => c.p('policySpeed') * c.dt * (c.v('ruleTarget') - c.lag('ruleAnchor')) },
      ],
      concepts: ['taylor-rule', 'gradual-adjustment'],
      explain: {
        what: 'The key rate the Taylor rule sets this month. While the key rate is unlocked it is the key rate; while you hold it locked it is what the rule would do next if you unlocked it.',
        rule: 'Rate = the rate in force last month + {policySpeed} a year × one month × (where the rule is heading − the rate in force). The rate in force is the rule’s own while it is in charge and the rate you hold while the key rate is locked, so unlocking carries on from your rate instead of jumping to a path the rule was never in charge of. It is worked out every month, locked or not.',
      },
    },
    {
      id: 'keyRateSuggestion',
      target: 'keyRateSuggestion',
      category: 'POLICY',
      inputs: ['ruleTarget'],
      compute: (c) => 100 * c.v('ruleTarget'),
      concepts: ['taylor-rule'],
      explain: {
        what: 'Where the Taylor rule is heading, in percent a year: where the key rate would go if its lever were unlocked.',
        rule: 'Suggestion = where the rule is heading × 100 (never below zero, like the rule). It is not smoothed, so the lever calls as soon as the rule would lean one way.',
      },
    },
    {
      id: 'keyRate',
      target: 'keyRate',
      category: 'POLICY',
      label: 'Key rate: the rule’s, or yours while locked',
      inputs: ['ruleRate'],
      levers: ['keyRate'],
      locks: [TAYLOR_RULE],
      terms: [
        { id: 'rule', label: 'The Taylor rule (unlocked)', concept: 'taylor-rule', compute: (c) => (c.locked(TAYLOR_RULE) ? 0 : c.v('ruleRate')) },
        { id: 'held', label: 'The rate you hold (locked)', compute: (c) => (c.locked(TAYLOR_RULE) ? c.lever('keyRate') / 100 : 0) },
      ],
      regime: (c) => (c.locked(TAYLOR_RULE) ? 'Held where you set it' : null),
      concepts: ['interest-rate-channel'],
      explain: {
        what: 'The interest rate the central bank sets. Every other rate in the economy follows it.',
        rule: 'Who sets it depends on the padlock beside the “Key interest rate” lever. Unlocked (the default): the Taylor rule does, and the lever shows the rule’s rate. Locked: you do; the key rate is the level on the lever and stays there until you move it. Moving the lever locks it.',
      },
    },
    {
      id: 'ruleAnchor',
      target: 'ruleAnchor',
      category: 'POLICY',
      label: 'The rate in force, which the rule steps from',
      inputs: ['ruleRate', 'keyRate'],
      locks: [TAYLOR_RULE],
      terms: [
        { id: 'rule', label: 'The rule’s own rate (unlocked)', concept: 'gradual-adjustment', compute: (c) => (c.locked(TAYLOR_RULE) ? 0 : c.v('ruleRate')) },
        { id: 'held', label: 'The key rate you hold (locked)', concept: 'gradual-adjustment', compute: (c) => (c.locked(TAYLOR_RULE) ? c.v('keyRate') : 0) },
      ],
      concepts: ['gradual-adjustment'],
      explain: {
        what: 'The rate the Taylor rule starts next month’s step from: the rate it was actually in charge of.',
        rule: 'Unlocked: the rule’s own rate this month. Locked: the key rate you hold. So when you unlock the key rate the rule starts from your rate, not from a path it was never in charge of.',
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
        rule: 'Payment = interest on its bonds − interest paid on reserves, plus {cbPayoutSpeed} × a year of any capital above {cbCapitalTarget}% of GDP (minus if below). At the baseline its capital is on target, so it hands over exactly its profit. This is the law that governs the central bank’s accounts, not a policy setting: it works the same whether the policy levers are locked or not.',
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
      id: 'keyRate',
      label: 'Key interest rate',
      group: 'Policy',
      section: 'Central bank',
      kind: 'setting',
      unit: '%',
      default: 3,
      min: 0,
      max: 10,
      step: 0.25,
      description:
        'The key interest rate. Unlocked (the default), the Taylor rule sets it and the lever follows the rule. Move the lever, or close its padlock, to hold the rate yourself. A held rise cools the economy for several years; held for longer, its effect reverses, because the interest it pays out is spent.',
      definition:
        'Level of the key rate in percent a year. Unlocked (the default) the Taylor rule sets it every month, and the lever shows the rule’s rate. Moving the lever, or closing its padlock, locks it: the key rate is then held at the lever’s level from the month it is set until you move it again, and the rule stands aside until you unlock it. Closing the padlock holds the rate in force that month. Unlocking hands the key rate back to the rule, which moves from the rate you held a twelfth of the way toward where it is heading each month, so the rate does not jump. The default, 3%, is the neutral rate. The Taylor rule keeps that neutral rate fixed; it does not learn a new one, as Iceland’s rule does (decision 0009). So after a lasting change in demand, with the rule acting, inflation settles a little off target: the rule holds the key rate away from 3% only while inflation or output is off. After lending appetite −2, inflation is still 0.5 point below target after 20 years, with the key rate at 1.2% and the price level 10% lower; after government spending 3% of GDP lower, inflation is 0.7 point below target and the price level 25% lower. Held while the tax lever is unlocked, the debt rule steadies the economy in the central bank’s place: while the key rate is locked it cuts taxes when output is below capacity and raises them above it, and leans on debt only half as hard; and debt never pushes the tax the other way, so the rule raises no tax for debt while output is more than 1% below capacity and cuts none for low debt while it is above (decision 0016). So a higher rate cools the economy while the rule cuts taxes, and pays the higher interest bill back once output has nearly recovered: at 4.75%, output is about 1.5% lower after three years and 0.4% lower after 20, with government debt 16 points of GDP higher, the tax rate 1.2 points higher and the price level 4% lower; at 10%, output ends 0.3% lower with debt 65 points higher. A rate held below neutral does the opposite: at 0%, the rule raises taxes against the boom (0.7 point after three years), output is 1.7% higher after three years and 0.15% after 20, and the price level 3.7% higher. (When the rule leaned on debt alone it amplified both: it raised taxes to pay the higher interest bill, so at 4.75% output ended 13% lower, and it cut taxes as rising prices shrank the debt ratio, so at 0% the price level ran away, 59% higher after 20 years.) With the tax lever locked too, for the first years a higher rate works as textbooks say: at 4.75%, output is about 2.6% lower after three years. Held for longer, the effect reverses, after about eight years (month 102 at 4.75%, sooner for bigger moves: month 85 at 10%): the interest on government bonds and on deposits is income for households, and the higher rate also means more of it on a larger stock of deposits, so they spend more and more of it, while anchored expectations keep inflation from running away. At 4.75% output is about 3% higher after 20 years and inflation about 1.1 points higher; at 10%, 13% and 5.5 points, with the price level 46% higher; at 0%, 2.4% lower. The same stock-flow channel reverses a held Iceland key rate (MON-1). This is the interest-income channel of stock-flow models (Godley and Lavoie’s model PC), at the strong end of the evidence: tightening lowers output for more than a decade in the data (Jordà, Singh and Taylor 2024), and savers spend little of the interest they gain (Auclert 2019). So effects beyond a few years show the interest-income channel of an economy without its policy rules, and with nothing but partial trust in the target to anchor prices, not what a central bank would do.',
      concepts: ['taylor-rule', 'interest-rate-channel'],
    },
  ],
  stabilisers: [
    {
      id: TAYLOR_RULE,
      label: 'Taylor rule',
      lever: 'keyRate',
      suggestion: 'keyRateSuggestion',
      current: (c) => 100 * c.v('keyRate'),
      shadow: ['ruleRate', 'ruleAnchor', 'ruleTarget'],
      threshold: 0.125, // half the lever's quarter-point step: calls when Apply would move the lever
      description:
        'The central bank’s Taylor rule: the key rate it would set from inflation and the output gap, reached gradually from the rate in force. While the key rate is unlocked it sets it. While you hold the key rate locked it stands aside: your rate holds and everything else reacts to it.',
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
        const a = p('ruleTarget', 'taylorInflation') * (1 - p('ruleTarget', 'taylorLookThrough') * p('expectedInflation', 'expectationsAnchor'));
        return { pass: a > 1, detail: `key rate per point of lasting inflation = ${a.toFixed(3)}` };
      },
    },
    {
      id: 'neutral-at-baseline',
      label: 'At baseline the key rate equals the neutral rate',
      run: (e) => {
        const n = e.influences('ruleTarget').params.find((p) => p.id === 'neutralRate')!.value;
        return { pass: Math.abs(e.baseline('keyRate') - n) < 1e-12, detail: `key rate ${e.baseline('keyRate')} vs neutral ${n}` };
      },
    },
  ],
};
