/**
 * Reference economy: the government.
 *
 * The government buys goods and services, taxes household income and borrows its deficit by
 * selling bonds to the bank. Because the bank pays for the bonds and the government spends the
 * proceeds, deficits add to the money households and firms hold. A debt rule sets the tax rate
 * while the tax lever is unlocked (the default), and stands aside while it is locked (decision
 * 0010). Like the Taylor rule it steps from the rate in force, so unlocking carries on from it.
 * While the key rate is locked, so that the central bank does not react, the debt rule also leans
 * against the cycle and leans on debt only half as hard (decision 0016).
 */
import type { Ctx, ModuleDef, ParamDef } from '../../core/types.ts';
import { TAYLOR_RULE } from './central-bank.ts';

/** The debt rule's stabiliser id: rules that read its padlock declare `locks: [DEBT_RULE]`. */
export const DEBT_RULE = 'debtRule';
/** Your tax shift counts only while the tax lever is locked; unlocked, the debt rule sets the rate. */
const heldShift = (c: Ctx) => (c.locked(DEBT_RULE) ? c.p('taxShift') : 0);

/** The largest buyback this month (a negative issue): the bank's bonds, less what it sells the
 *  central bank this month, over one month. */
const buybackLimit = (c: Ctx) => c.v('openMarket') - c.stock('bonds', 'B') / c.dt;
/** A tax rate × households' income: wages, and deposit interest and dividends. The tax rule's terms
 *  are differences of these, so they add up to the unsplit tax to the last digit (review TAX-4). */
const onIncome = (c: Ctx, rate: number) => rate * c.v('wages') + rate * (c.v('depositInterestHH') + c.v('firmDividends') + c.v('bankDividends'));
/** While the key rate is locked, how far the debt rule is kept from moving the tax rate against the
 *  cycle, 0 to 1: from raising it for debt while output is below capacity (fully once it is
 *  fiscalSlumpBand below) and from cutting it for low debt while output is above (fully at
 *  fiscalBoomBand above); 0 while the key rate is unlocked (decision 0016). A rule that uses them
 *  declares lagInputs ['output'], params ['potentialOutput', 'fiscalSlumpBand', 'fiscalBoomBand']
 *  and locks [TAYLOR_RULE]. */
const gap = (c: Ctx) => c.lag('output') / c.p('potentialOutput') - 1;
const slumpWeight = (c: Ctx) => (c.locked(TAYLOR_RULE) ? Math.min(1, Math.max(0, -gap(c) / c.p('fiscalSlumpBand'))) : 0);
const boomWeight = (c: Ctx) => (c.locked(TAYLOR_RULE) ? Math.min(1, Math.max(0, gap(c) / c.p('fiscalBoomBand'))) : 0);
/** The debt term the rule acts on: while the key rate is locked, a rise it asks for fades out as
 *  output falls below capacity, and a cut as output rises above it. */
const debtAgainstCycle = (c: Ctx, debt: number) => debt * (1 - (debt > 0 ? slumpWeight(c) : boomWeight(c)));

const params: ParamDef[] = [
  {
    id: 'govSpendingReal',
    value: 16,
    unit: '% of GDP/yr',
    category: 'POLICY',
    description: 'Government purchases at baseline prices.',
    provenance: { basis: 'calibrated', note: 'Solved by the baseline so that the economy starts at capacity (GDP = 100).' },
  },
  {
    id: 'normalTaxRate',
    value: 0.2,
    unit: 'fraction',
    category: 'POLICY',
    description: 'Income-tax rate when government debt is at its baseline level.',
    provenance: { basis: 'calibrated', note: 'Solved by the baseline so that debt is 55% of GDP with a balanced budget.' },
  },
  {
    id: 'fiscalResponse',
    value: 0.3,
    unit: 'fraction',
    category: 'POLICY',
    description: 'Tax-rate points added per point of debt-to-GDP above baseline, divided by 100 (0.3: +3 points of tax for 10 points of debt).',
    provenance: {
      basis: 'assumed',
      note: 'Deliberately strong, for teaching: with a tax base of about 87% of GDP, 0.3 moves revenue about 0.26% of GDP per point of debt. Estimated fiscal reaction functions give about 0.02–0.1% of GDP (Bohn 1998, 2008; Mauro et al. 2015), so this rule settles debt several times faster than real governments do.',
    },
  },
  {
    id: 'fiscalCycle',
    value: 0.5,
    unit: 'fraction',
    category: 'POLICY',
    description: 'While the key rate is locked: tax-rate points the debt rule adds per 1% of output above capacity (and takes off per 1% below).',
    provenance: {
      basis: 'assumed',
      note: 'When monetary policy does not react, fiscal policy must lean against the cycle, with a slow debt term under it (Kirsanova, Leith and Wren-Lewis 2009); a debt-only rule is procyclical then. At 0.5, on a tax base of about 87% of GDP, revenue moves about 0.45% of GDP per 1% of output gap, on top of the automatic stabilisers: about the size of the discretionary responses estimated for OECD governments (Galí and Perotti 2003). Decision 0016.',
    },
  },
  {
    id: 'fiscalHeldShare',
    value: 0.5,
    unit: 'fraction',
    category: 'POLICY',
    description: 'While the key rate is locked: how hard the debt rule leans on debt, as a share of its usual strength.',
    provenance: {
      basis: 'assumed',
      note: 'The slow debt term under the counter-cyclical term (Kirsanova, Leith and Wren-Lewis 2009). At full strength a key rate held below neutral ran away: the debt ratio fell as prices rose, so the rule cut taxes into the boom (2.25% held: the price level 19% higher after 20 years and accelerating), and one held above neutral deepened the slump as the rule raised taxes to pay the interest bill (4.75%: output 13% lower). Decision 0016.',
    },
  },
  {
    id: 'fiscalSlumpBand',
    value: 0.01,
    unit: 'fraction',
    category: 'POLICY',
    description: 'While the key rate is locked, the debt rule raises no tax for debt while output is below capacity: the rise its debt term asks for fades out as output falls from capacity to this far below it (1%), and below that the rule does not raise the rate at all.',
    provenance: { basis: 'assumed', note: 'When monetary policy does not act, a fiscal rule that tightened in a slump would deepen it (Kirsanova, Leith and Wren-Lewis 2009). Without it the debt rule raised the tax rate 1.7 points by month 240 while a key rate held at 4.75% kept output 1.6% below capacity, and 8.9 points at 10% with output 4.3% below (review of decision 0016, 30 September 2026). Wider than fiscalBoomBand, as in the Iceland model: with the key rate held the debt rule is all that keeps debt from compounding (Leeper 1991), so in a long, mild slump it must still pay part of the interest bill. Decision 0016.' },
  },
  {
    id: 'fiscalBoomBand',
    value: 0.0025,
    unit: 'fraction',
    category: 'POLICY',
    description: 'While the key rate is locked, the debt rule cuts no tax for low debt while output is above capacity: the cut its debt term asks for fades out as output rises from capacity to this far above it (a quarter of 1%), and above that the rule does not cut the rate at all.',
    provenance: { basis: 'assumed', note: 'When monetary policy does not act, a fiscal rule that loosened in a boom would feed it (Kirsanova, Leith and Wren-Lewis 2009). Without it a key rate held at 0% cut the tax rate 1.6 points by month 240 while output stayed about 2% above capacity and the price level rose 14%, as the lower interest bill and rising prices shrank the debt ratio (review of decision 0016, 30 September 2026). Narrow, because holding back a cut costs nothing but time: the debt stays low, and the cut comes once the boom has passed. Decision 0016.' },
  },
  {
    id: 'fiscalSpeed',
    value: 0.5,
    unit: 'per year',
    category: 'POLICY',
    description: 'How fast the tax rate moves toward what the debt rule says (budgets change slowly).',
    provenance: { basis: 'assumed', note: 'Teaching value: the rule closes about two-fifths of the gap to its target rate in a year, about one budget round.' },
  },
  { id: 'taxShift', value: 0, unit: 'fraction', category: 'POLICY', description: 'Your change in the tax rate (set by the tax lever). It counts only while the lever is locked, added to the normal rate; unlocked, the debt rule sets the rate.', provenance: { basis: 'assumed', note: 'Zero at baseline; moved by a lever.' } },
  { id: 'treasuryTarget', value: 2, unit: '% of GDP', category: 'POLICY', description: 'Money the government keeps in its account at the central bank.', provenance: { basis: 'assumed' } },
  { id: 'treasuryTopUp', value: 6, unit: 'per year', category: 'POLICY', description: 'How fast bond sales restore the account to its target.', provenance: { basis: 'assumed' } },
];

export const government: ModuleDef = {
  id: 'government',
  label: 'Government',
  description: 'Spending, taxes, the deficit and the bonds that finance it.',
  requires: ['structure', 'labour-and-prices', 'central-bank', 'banking-and-credit'],
  params,
  vars: [
    { id: 'govSpending', label: 'Government spending', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'debtRatio', label: 'Government debt ratio', unit: '% of GDP', kind: 'ratio', scale: 'none', initial: 55 },
    { id: 'taxRuleTarget', label: 'Tax rate the debt rule is heading for', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0.23, description: 'Where the debt rule would put the tax rate if it moved there at once. Computed whether the tax lever is locked or not.' },
    { id: 'debtRuleRate', label: 'Tax rate the debt rule calls for', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0.23, description: 'The debt rule’s tax rate this month: one smoothed step from the rate in force toward where it is heading. Computed whether the tax lever is locked or not.' },
    { id: 'taxRuleAnchor', label: 'Tax rate the debt rule steps from', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0.23, description: 'The tax rate the debt rule starts next month’s step from: its own rate while it is in charge (tax unlocked), the rate you hold (locked).' },
    { id: 'taxRuleSuggestion', label: 'Tax shift the debt rule suggests', unit: 'pp', kind: 'rate', scale: 'none', description: 'Where the debt rule is heading, minus the normal rate, in percentage points: comparable with the tax lever.' },
    { id: 'taxRate', label: 'Income-tax rate', unit: 'fraction', kind: 'rate', scale: 'none' },
    { id: 'taxes', label: 'Income tax', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'bondInterestBank', label: 'Bond interest to the bank', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'bondInterestCB', label: 'Bond interest to the central bank', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'deficit', label: 'Government deficit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: 'bondIssue', label: 'New government bonds', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ],
  rules: [
    {
      id: 'govSpending',
      target: 'govSpending',
      category: 'POLICY',
      inputs: ['price'],
      params: ['govSpendingReal'],
      compute: (c) => c.p('govSpendingReal') * c.v('price'),
      concepts: ['multiplier'],
      explain: { what: 'What the government pays firms for goods and services.', rule: 'Spending = {govSpendingReal}% of GDP at baseline prices × price level.' },
    },
    {
      id: 'debtRatio',
      target: 'debtRatio',
      category: 'IDENTITY',
      inputs: ['price'],
      stocks: [['bonds', 'G']],
      params: ['potentialOutput'],
      compute: (c) => (100 * c.stock('bonds', 'G')) / (c.v('price') * c.p('potentialOutput')),
      concepts: ['deficits-and-money', 'automatic-stabilisers'],
      explain: {
        what: 'Government debt as a share of what the economy produces at capacity, at today’s prices. A recession alone does not raise it, so the debt rule does not tighten in a slump.',
        rule: 'Debt ratio = 100 × bonds outstanding ÷ (price level × capacity output).',
      },
    },
    {
      id: 'taxRuleTarget',
      target: 'taxRuleTarget',
      category: 'POLICY',
      label: 'Debt rule: where it is heading',
      lagInputs: ['debtRatio', 'output', 'taxRuleAnchor'],
      params: ['normalTaxRate', 'fiscalResponse', 'fiscalHeldShare', 'fiscalCycle', 'fiscalSlumpBand', 'fiscalBoomBand', 'potentialOutput'],
      locks: [TAYLOR_RULE],
      terms: [
        { id: 'normal', label: 'Normal tax rate', compute: (c) => c.p('normalTaxRate') },
        {
          id: 'debtRule',
          label: 'Debt above its starting level (half as hard while the key rate is locked)',
          concept: 'debt-feedback',
          compute: (c) => ((c.locked(TAYLOR_RULE) ? c.p('fiscalHeldShare') : 1) * c.p('fiscalResponse') * (c.lag('debtRatio') - c.base('debtRatio'))) / 100,
        },
        {
          id: 'cycle',
          label: 'Output above capacity, while the key rate is locked',
          concept: 'debt-feedback',
          compute: (c) => (c.locked(TAYLOR_RULE) ? c.p('fiscalCycle') * gap(c) : 0),
        },
      ],
      // While the key rate is locked the rule never moves the tax rate against the cycle (decision
      // 0016): the debt term's rises fade out below capacity and its cuts above, and the rate is not
      // stepped up from the one in force in a slump, nor down in a boom.
      combine: (t, c) => {
        const want = t.normal + debtAgainstCycle(c, t.debtRule) + t.cycle,
          inForce = c.lag('taxRuleAnchor');
        return want - slumpWeight(c) * Math.max(0, want - inForce) + boomWeight(c) * Math.max(0, inForce - want);
      },
      regime: (c, _v, t) => {
        const want = t.normal + debtAgainstCycle(c, t.debtRule) + t.cycle,
          inForce = c.lag('taxRuleAnchor');
        if (slumpWeight(c) > 0 && (t.debtRule > 0 || want > inForce)) return 'Key rate held: debt adds no tax while output is below capacity';
        if (boomWeight(c) > 0 && (t.debtRule < 0 || want < inForce)) return 'Key rate held: low debt cuts no tax while output is above capacity';
        return null;
      },
      concepts: ['debt-feedback'],
      explain: {
        what: 'Where the government’s debt rule would put the income-tax rate if it moved there at once. The rule itself moves toward it gradually.',
        rule: 'Target = {normalTaxRate%} + {fiscalResponse} × (debt ratio − its starting level) ÷ 100: 10 more points of debt mean about 3 more points of tax. Without such a rule, interest on a growing debt could feed on itself. Because the rule keeps leaning until debt is back where the tax rate balances the budget, it undoes any lasting change in the end; its strength sets how fast, and how far debt moves meanwhile (the tax change ÷ {fiscalResponse}, in points of GDP). At {fiscalResponse} it is several times stronger than real governments’ estimated reactions, so debt settles within a decade. While you hold the key rate locked, the central bank no longer steadies the economy, and a rule that leaned on debt alone would amplify shocks: it would cut taxes as rising prices shrank the debt ratio in a boom, and raise them to pay a higher interest bill in a slump. So then the rule also adds {fiscalCycle} points of tax per 1% of output above capacity (and cuts as much below it), and leans on debt only {fiscalHeldShare} as hard. And debt no longer moves the tax against the cycle: below capacity, the rise the debt term asks for fades out, gone once output is {fiscalSlumpBand%} below, and from there the rule raises no tax at all; above capacity, the cut it asks for fades out the same way, gone at {fiscalBoomBand%} above. So debt built up in a slump is paid back as output recovers, and debt shrunk in a boom is handed back as tax cuts only once the boom has passed. The first band is wider because with the key rate held the rule is all that stops debt compounding, so in a long, mild slump it must still pay part of the interest bill.',
      },
    },
    {
      id: 'debtRuleRate',
      target: 'debtRuleRate',
      category: 'POLICY',
      label: 'Debt rule, smoothed',
      inputs: ['taxRuleTarget'],
      lagInputs: ['taxRuleAnchor'],
      params: ['fiscalSpeed'],
      // A step from the rate in force toward the target: the linear partial adjustment `adjust`
      // would give, anchored on the rate in force so that unlocking carries on from the held rate.
      terms: [
        { id: 'inForce', label: 'Where the rule stands: the rate in force last month', concept: 'gradual-adjustment', compute: (c) => c.lag('taxRuleAnchor') },
        { id: 'step', label: 'A step toward where the rule is heading', concept: 'debt-feedback', compute: (c) => c.p('fiscalSpeed') * c.dt * (c.v('taxRuleTarget') - c.lag('taxRuleAnchor')) },
      ],
      concepts: ['debt-feedback', 'policy-lags'],
      explain: {
        what: 'The income-tax rate the government’s debt rule sets this month. While the tax lever is unlocked it is the tax rate; while you hold it locked it is what the rule would do next if you unlocked it.',
        rule: 'Rate = the rate in force last month + {fiscalSpeed} a year × one month × (where the rule is heading − the rate in force). The rate in force is the rule’s own while it is in charge and the rate you hold while the tax lever is locked, so unlocking carries on from your rate. It is worked out every month, locked or not.',
      },
    },
    {
      id: 'taxRuleSuggestion',
      target: 'taxRuleSuggestion',
      category: 'POLICY',
      inputs: ['taxRuleTarget'],
      params: ['normalTaxRate'],
      compute: (c) => 100 * (c.v('taxRuleTarget') - c.p('normalTaxRate')),
      explain: {
        what: 'The tax shift the debt rule is heading for, in percentage points: where the tax rate would go if its lever were unlocked.',
        rule: 'Suggestion = (where the debt rule is heading − {normalTaxRate%}) × 100. It is the whole shift the rule wants given today’s debt, so a lever already set there satisfies it.',
      },
    },
    {
      id: 'taxRate',
      target: 'taxRate',
      category: 'POLICY',
      label: 'Tax rate: the debt rule’s, or the normal rate while locked',
      inputs: ['debtRuleRate'],
      params: ['normalTaxRate'],
      locks: [DEBT_RULE],
      terms: [
        { id: 'rule', label: 'The debt rule (unlocked)', concept: 'debt-feedback', compute: (c) => (c.locked(DEBT_RULE) ? 0 : c.v('debtRuleRate')) },
        { id: 'normal', label: 'The normal rate (locked)', compute: (c) => (c.locked(DEBT_RULE) ? c.p('normalTaxRate') : 0) },
      ],
      concepts: ['policy-lags'],
      explain: {
        what: 'The income-tax rate before your tax lever.',
        rule: 'Unlocked (the default): the debt rule’s rate. Locked: the normal rate {normalTaxRate%}, to which the shift on your tax lever is added; the debt rule stands aside.',
      },
    },
    {
      id: 'taxRuleAnchor',
      target: 'taxRuleAnchor',
      category: 'POLICY',
      label: 'The tax rate in force, which the debt rule steps from',
      inputs: ['taxRate'],
      params: ['taxShift'],
      locks: [DEBT_RULE],
      terms: [
        { id: 'rate', label: 'The rate in force before your lever', concept: 'gradual-adjustment', compute: (c) => c.v('taxRate') },
        { id: 'held', label: 'The shift you hold (locked)', concept: 'gradual-adjustment', compute: heldShift },
      ],
      concepts: ['gradual-adjustment'],
      explain: {
        what: 'The tax rate the debt rule starts next month’s step from: the rate actually in force.',
        rule: 'Unlocked: the debt rule’s own rate this month. Locked: the normal rate plus the shift you hold. So when you unlock the tax lever the rule starts from your rate, not from a path it was never in charge of.',
      },
    },
    {
      id: 'taxes',
      target: 'taxes',
      category: 'POLICY',
      inputs: ['wages', 'depositInterestHH', 'firmDividends', 'bankDividends', 'taxRate'],
      params: ['taxShift', 'normalTaxRate'],
      locks: [DEBT_RULE],
      // Split by what sets the rate, so ideas at play tell the automatic stabiliser (tax at the
      // normal rate on income that moves with the cycle) from a decision to change the rate, yours
      // or the debt rule's (review TAX-4). The three terms add up to (tax rate + your change) × income.
      terms: [
        { id: 'normalRate', label: 'Normal rate × income', concept: 'automatic-stabilisers', compute: (c) => onIncome(c, c.p('normalTaxRate')) },
        { id: 'debtRule', label: 'The debt rule’s change to the rate × income (unlocked)', concept: 'debt-feedback', compute: (c) => onIncome(c, c.v('taxRate')) - onIncome(c, c.p('normalTaxRate')) },
        { id: 'taxShift', label: 'Your change to the rate × income (locked)', concept: 'multiplier', compute: (c) => onIncome(c, c.v('taxRate') + heldShift(c)) - onIncome(c, c.v('taxRate')) },
      ],
      concepts: ['automatic-stabilisers', 'multiplier'],
      explain: {
        what: 'Income tax households pay. It rises and falls with income, which steadies the economy.',
        rule: 'Tax = the income-tax rate × (wages + interest + dividends). The rate is the debt rule’s while the tax lever is unlocked, and the normal rate {normalTaxRate%} plus the shift on your lever (now {taxShift pp}) while it is locked.',
      },
    },
    {
      id: 'bondInterestBank',
      target: 'bondInterestBank',
      category: 'CONTRACT',
      inputs: ['bondRate'],
      stocks: [['bonds', 'B']],
      compute: (c) => c.v('bondRate') * c.stock('bonds', 'B'),
      concepts: ['interest-distribution'],
      explain: { what: 'Interest the government pays the bank on its bonds.', rule: 'Interest = bond rate × bonds held by the bank.' },
    },
    {
      id: 'bondInterestCB',
      target: 'bondInterestCB',
      category: 'CONTRACT',
      inputs: ['bondRate'],
      stocks: [['bonds', 'CB']],
      compute: (c) => c.v('bondRate') * c.stock('bonds', 'CB'),
      explain: { what: 'Interest the government pays the central bank on its bonds (it comes back as central-bank profit).', rule: 'Interest = bond rate × bonds held by the central bank.' },
    },
    {
      id: 'deficit',
      target: 'deficit',
      category: 'IDENTITY',
      inputs: ['govSpending', 'bondInterestBank', 'bondInterestCB', 'taxes', 'cbProfit'],
      terms: [
        { id: 'spending', label: 'Spending', compute: (c) => c.v('govSpending') },
        { id: 'interest', label: 'Interest on debt', concept: 'interest-distribution', compute: (c) => c.v('bondInterestBank') + c.v('bondInterestCB') },
        { id: 'taxes', label: 'Taxes', concept: 'automatic-stabilisers', compute: (c) => -c.v('taxes') },
        { id: 'cbProfit', label: 'Central-bank profit', compute: (c) => -c.v('cbProfit') },
      ],
      concepts: ['sectoral-balances', 'deficits-and-money'],
      explain: {
        what: 'Government spending and interest minus its income. The government’s deficit is the private sector’s surplus.',
        rule: 'Deficit = spending + interest on bonds − taxes − central-bank profit.',
      },
    },
    {
      id: 'bondIssue',
      target: 'bondIssue',
      category: 'POLICY',
      inputs: ['deficit', 'openMarket'],
      stocks: [
        ['treasuryAccount', 'G'],
        ['bonds', 'B'],
      ],
      params: ['treasuryTarget', 'treasuryTopUp'],
      terms: [
        { id: 'deficit', label: 'Deficit to finance', concept: 'deficits-and-money', compute: (c) => c.v('deficit') },
        { id: 'topUp', label: 'Refill the treasury account', compute: (c) => c.p('treasuryTopUp') * (c.p('treasuryTarget') - c.stock('treasuryAccount', 'G')) },
      ],
      // Not additive when negative: a buyback takes at most the bonds the bank has left after
      // this month's sales to the central bank; the rest of a surplus stays in the treasury account.
      combine: (t, c) => Math.max(buybackLimit(c), t.deficit + t.topUp),
      regime: (c, _v, t) => (t.deficit + t.topUp < buybackLimit(c) ? 'Buyback limited by the bank’s bonds' : null),
      concepts: ['deficits-and-money'],
      explain: {
        what: 'Bonds the government sells to the bank to pay its way (negative: buys back from it).',
        rule: 'Bonds sold = the deficit + {treasuryTopUp} × a year of any shortfall of the treasury account below {treasuryTarget}% of GDP. A surplus buys bonds back, but never more than the bank still holds: the rest of the surplus stays in the treasury account.',
      },
    },
  ],
  flows: [
    {
      id: 'govSpending',
      label: 'Government spending',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'G', to: 'F', amount: 'govSpending' }],
      concepts: ['multiplier', 'deficits-and-money'],
      explain: { what: 'The government pays firms from its central-bank account: the bank gains reserves and credits the firms’ deposits.' },
    },
    {
      id: 'taxes',
      label: 'Income tax',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'HH', to: 'G', amount: 'taxes' }],
      concepts: ['automatic-stabilisers'],
      explain: { what: 'Households pay tax from their deposits; the bank pays the government in reserves, so deposits shrink.' },
    },
    {
      id: 'bondInterest',
      label: 'Interest on government bonds',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [
        { from: 'G', to: 'B', amount: 'bondInterestBank' },
        { from: 'G', to: 'CB', amount: 'bondInterestCB' },
      ],
      concepts: ['interest-distribution'],
      explain: { what: 'The government pays interest to its bondholders.' },
    },
    {
      id: 'bondIssue',
      label: 'New government bonds',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'issue', instrument: 'bonds' },
      legs: [{ from: 'B', to: 'G', amount: 'bondIssue' }],
      concepts: ['deficits-and-money'],
      explain: { what: 'The bank buys new bonds, paying in reserves. When the government spends the money, deposits are created: deficits financed by banks add to money.' },
    },
  ],
  levers: [
    {
      id: 'govSpending',
      label: 'Government spending',
      group: 'Policy',
      section: 'Government',
      kind: 'setting',
      unit: '% of GDP/yr',
      default: 0,
      min: -3,
      max: 3,
      step: 0.5,
      binds: { param: 'govSpendingReal', mode: 'add' },
      description: 'More (or less) government purchases, at baseline prices.',
      definition:
        'Level shift in real government purchases, % of baseline GDP a year, persistent while set. Nominal spending also rises with the price level. A large lasting cut can push the key rate to zero with the policy rules acting, where the Taylor rule and deposit rates can fall no further (a liquidity trap): at −3 the key rate stays at or just above zero for about 15 years, output is still about 4% lower after ten and 1.4% lower after twenty, and it recovers only as the debt rule cuts taxes. Setting it back to 0 returns spending to its baseline level; the debt built up meanwhile remains.',
      concepts: ['multiplier', 'deficits-and-money'],
    },
    {
      id: 'taxRate',
      label: 'Income-tax rate',
      group: 'Policy',
      section: 'Government',
      kind: 'setting',
      unit: 'pp',
      default: 0,
      // Down to −1 only (−3 until padlocks, −2 until the review of decision 0016): locked below its
      // normal rate while the Taylor rule acts, a tax cut is never paid back and the economy runs
      // away (see the definition, lever-vetting open item 21). At −3 it no longer stays finite for
      // twenty years (decision 0010); at −2 it stays finite but ends with output 80% higher and a
      // key rate above 60%, numbers no student can read (review REF-TAX-RANGE-ABSURD). At −1 the
      // run is still Explosive, but bounded; the moderate step the lever report runs (−0.5) is
      // unchanged.
      min: -1,
      max: 3,
      step: 0.5,
      binds: { param: 'taxShift', mode: 'add', scale: 0.01 },
      description: 'The tax rate on household income, in points above (or below) its normal rate. A cut leaves households more to spend and the government less revenue, so it borrows and its debt rises; a rise does the opposite. Unlocked (the default), the debt rule sets it and the lever follows the rule. Move the lever, or close its padlock, to hold the rate yourself: debt then takes the strain, and the debt rule stands aside.',
      definition:
        'Level shift in the income-tax rate, in percentage points above (or below) its normal rate. Unlocked (the default) the debt rule sets the rate every month, leaning against government debt, and the lever shows its shift. Moving the lever, or closing its padlock, locks it: the rate is then the normal rate plus the lever’s shift, applied in the month it is set and held until you move it again, and the debt rule stands aside until you unlock it. Unlocking hands the rate back to the debt rule, which moves from the rate you held about 4% of the way toward where it is heading each month and gives the change back as debt returns to its level. The first thing a change does is to the budget. A cut of 1 point leaves households about 0.9% of GDP a year more after tax and the government as much less revenue, so it runs a deficit and borrows from the bank: government debt is about 3.9 points of GDP higher after five years and 9 after ten. Households spend most of the extra income, so output is about 1% higher after a year. Second, the Taylor rule leans against the extra demand: the key rate is about 0.4 point higher after a year and 1.6 points after five. A rise mirrors it: debt falls and output is lower. Held while the key rate is unlocked, though, nothing pays a tax cut back, and the Taylor rule cannot steady the economy on its own: in this economy the interest it raises is income that households spend, so a higher key rate adds to demand as well as cooling it (with no fiscal rule and an active monetary rule there is no stable path, Leeper 1991). At −0.5, output is 0.5% higher after a year and still rising after 20 years, 2% higher with the key rate 2.6 points higher; at −1, output is 6% higher after 20 years, the price level 18% higher and the key rate 7 points higher, all still rising, and broad money half as large again. That is why the range stops at −1: bigger cuts run away much faster (at −2, output would be 80% higher after 20 years, with a key rate above 60%). A rise sinks it the other way: at +1, output is 4% lower after 20 years and still falling, and the key rate reaches zero by then; at +3 the key rate is at or near zero from about the third year and output is 11% lower after 20 years (a liquidity trap). With the key rate locked too, nothing offsets the tax: at +1, output is about 3% lower after five years, and at −1 about 3.3% higher after five, with the price level 22% higher after 20. Setting it back to 0 while locked returns the rate to normal; to lean on the rule without holding the rate, lock it, set it, and unlock it again.',
      concepts: ['multiplier', 'debt-feedback'],
    },
  ],
  stabilisers: [
    {
      id: DEBT_RULE,
      label: 'Debt rule',
      lever: 'taxRate',
      suggestion: 'taxRuleSuggestion',
      // the shift in force, in points: the rate in force less the baseline rate, which is the normal rate
      current: (c) => 100 * (c.v('taxRuleAnchor') - c.base('taxRuleAnchor')),
      shadow: ['debtRuleRate', 'taxRuleAnchor', 'taxRuleTarget'],
      threshold: 0.25, // half the lever's half-point step: calls when Apply would move the lever
      description:
        'The government’s debt rule: about 3 points more income tax for 10 points more debt, reached gradually from the rate in force. While the key rate is locked it also leans against the cycle, cutting taxes when output is below capacity, leans on debt half as hard, and does not let debt push the tax against the cycle. While the tax lever is unlocked it sets the tax rate. While you hold it locked it stands aside: your rate holds and everything else reacts to it.',
      concepts: ['debt-feedback', 'policy-lags'],
      feed: { raise: 'The debt rule would raise income tax by {change} pp', lower: 'The debt rule would cut income tax by {change} pp', indicator: 'govDebt' },
      // ECON-5 (lever-vetting open item 21, decision 0016): by the owner's decision this is the lesson;
      // the panel says so.
      lockedAloneNote:
        'With income tax locked while the Taylor rule sets the key rate, nothing pays government debt back, and a lasting tax change can run away: the higher rates the rule sets add interest income as well as cooling spending. To lean on the debt rule instead, lock income tax, set it and unlock it again.',
    },
  ],
  tests: [
    {
      id: 'balanced-budget-at-baseline',
      label: 'At baseline the budget balances and the treasury account is at its target',
      run: (e) => {
        const d = e.baseline('deficit');
        const tga = e.balanceSheet('G').assets.find((a) => a.instrument === 'treasuryAccount')!.baseline;
        return { pass: Math.abs(d) < 1e-9 && Math.abs(tga - 2) < 1e-9, detail: `deficit ${d.toExponential(2)}, treasury account ${tga.toFixed(9)}` };
      },
    },
    {
      id: 'tax-arithmetic',
      label: 'Tax = rate × (wages + interest + dividends)',
      run: (e) => {
        const rate = e.value('taxRate') + e.influences('taxes').params.find((p) => p.id === 'taxShift')!.value;
        const base = e.value('wages') + e.value('depositInterestHH') + e.value('firmDividends') + e.value('bankDividends');
        const gap = e.value('taxes') - rate * base;
        return { pass: Math.abs(gap) < 1e-9, detail: `tax − rate × base = ${gap.toExponential(2)}` };
      },
    },
  ],
};
