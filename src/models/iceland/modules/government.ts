/**
 * Iceland Inc.: the government (v1 equations E23, E24, E30, E32, E37 and E42).
 *
 * Seven spending channels, each a flow with its own lever: health, education and other public
 * services (staff pay, their pension contributions and purchases from firms), public investment,
 * old-age and disability transfers, family and housing benefits, and unemployment benefits.
 * Revenue comes from income tax, VAT, payroll tax, corporate tax, the central bank's profit and
 * the state's bank dividends. A slow debt-tied rule nudges the income-tax rate when debt drifts
 * from baseline. The government borrows its cash deficit by selling bonds, and a lever decides
 * who buys them: banks and the central bank pay with new money, pension funds and older
 * households with money that already exists.
 */
import type { Ctx, Id, ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { AGE_LABEL, AGES, FIRMS, FIRM_NAME, HH, pickParams, terms, lastMonth } from '../util.ts';

type Channel = { id: string; label: string; level: Id; share: Id; lever: string; channel: string; what: string };
const CHANNELS: Channel[] = [
  { id: 'health', label: 'Public health services', level: 'gHealth', share: 'wsHealth', lever: 'health', channel: 'health', what: 'hospitals and clinics' },
  { id: 'education', label: 'Public education', level: 'gEdu', share: 'wsEdu', lever: 'education', channel: 'education', what: 'schools and universities' },
  { id: 'otherServices', label: 'Other public services', level: 'gOther', share: 'wsOther', lever: 'otherServices', channel: 'otherServices', what: 'administration, police, culture, road upkeep and subsidies' },
];
const PAYEES = [...AGES.map((g) => HH[g]), 'PF', 'FR'] as const;

/** Public staff in a channel, as a gross wage bill at baseline wages. */
const staff = (c: Ctx, ch: Channel) => (c.p(ch.share) * c.p(ch.level)) / (1 + c.p('cEr'));

const channelLegs: RuleDef[] = CHANNELS.flatMap((ch) =>
  PAYEES.map((to): RuleDef => {
    const id = `${ch.id}_${to}`;
    if (to === 'FR')
      return {
        id,
        target: id,
        category: 'POLICY',
        inputs: ['domesticPrice'],
        params: [ch.level, ch.share],
        compute: (c) => c.v('domesticPrice') * (1 - c.p(ch.share)) * c.p(ch.level),
        concepts: ['multiplier'],
        explain: { what: `What ${ch.label.toLowerCase()} (${ch.what}) buy from retail and service firms.`, rule: `Purchases = (1 − {${ch.share}}) × the real level {${ch.level}} × domestic prices.` },
      };
    if (to === 'PF')
      return {
        id,
        target: id,
        category: 'CONTRACT',
        inputs: ['wage'],
        params: [ch.level, ch.share, 'cEr', 'cEe'],
        compute: (c) => (c.p('cEr') + c.p('cEe')) * c.v('wage') * staff(c, ch),
        concepts: ['funded-pensions'],
        explain: { what: `Pension contributions for staff in ${ch.label.toLowerCase()}, paid straight to the pension funds.`, rule: '(employer {cEr%} + employee {cEe%}) × wage rate × public staff.' },
      };
    const g = AGES[PAYEES.indexOf(to)];
    return {
      id,
      target: id,
      category: 'POLICY',
      inputs: ['wage', `employment${g}`, 'employmentTotal'],
      params: [ch.level, ch.share, 'cEr', 'cEe'],
      compute: (c) => ((1 - c.p('cEe')) * c.v('wage') * staff(c, ch) * c.v(`employment${g}`)) / c.v('employmentTotal'),
      explain: {
        what: `Pay of staff in ${ch.label.toLowerCase()} who are ${AGE_LABEL[g]}, after the employee pension contribution.`,
        rule: `(1 − {cEe%}) × wage rate × public staff ({${ch.share}} × {${ch.level}} ÷ (1 + {cEr%})) × the ${AGE_LABEL[g]}’s share of all jobs.`,
      },
    };
  }),
);

const transferRules: RuleDef[] = [
  ...AGES.map(
    (g): RuleDef => ({
      id: `oldAgeTransfers${g}`,
      target: `oldAgeTransfers${g}`,
      category: 'POLICY',
      inputs: ['cpi'],
      params: ['trOA', 'oaShareY', 'oaShareO'],
      compute: (c) => c.p('trOA') * (g === 'Y' ? c.p('oaShareY') : g === 'O' ? c.p('oaShareO') : 1 - c.p('oaShareY') - c.p('oaShareO')) * c.v('cpi'),
      concepts: ['automatic-stabilisers'],
      explain: {
        what: `Old-age and disability transfers paid to the ${AGE_LABEL[g]}.`,
        rule: g === 'O' ? 'Transfers = real level {trOA} × the older share {oaShareO} (the public pension) × CPI.' : g === 'Y' ? 'Transfers = {trOA} × the young share {oaShareY} (disability) × CPI.' : 'Transfers = {trOA} × the rest (disability) × CPI.',
      },
    }),
  ),
  ...(['Y', 'W'] as const).map(
    (g): RuleDef => ({
      id: `familyBenefits${g}`,
      target: `familyBenefits${g}`,
      category: 'POLICY',
      inputs: ['cpi'],
      params: ['trFam', 'famShareY'],
      compute: (c) => c.p('trFam') * (g === 'Y' ? c.p('famShareY') : 1 - c.p('famShareY')) * c.v('cpi'),
      explain: { what: `Child, parental-leave and housing benefits paid to the ${AGE_LABEL[g]}.`, rule: `Benefits = real level {trFam} × ${g === 'Y' ? '{famShareY}' : '(1 − {famShareY})'} × CPI.` },
    }),
  ),
  ...AGES.map((g): RuleDef => {
    const [un, wb] = [`unemployed${g}`, `wb${g}`]; // built once: this rule sits in the income–spending block
    return {
      id: `unemploymentBenefits${g}`,
      target: `unemploymentBenefits${g}`,
      category: 'POLICY',
      inputs: ['wage', un],
      params: ['rr', 'rrShift', wb],
      compute: (c) => (c.p('rr') + c.p('rrShift')) * c.v('wage') * c.p(wb) * c.v(un),
      concepts: ['automatic-stabilisers'],
      explain: {
        what: `Unemployment benefits paid automatically to unemployed ${AGE_LABEL[g]}.`,
        rule: 'Benefits = replacement rate ({rr%} + the lever) × the average wage of the group × the number unemployed.',
      },
    };
  }),
];

const HOLDERS = [
  ['B', 'banks'],
  ['CB', 'the central bank'],
  ['PF', 'pension funds'],
  ['HO', 'older households'],
  ['W', 'non-residents'],
] as const;
const BUYERS = [
  ['B', 'banks', 1],
  ['CB', 'the central bank', 2],
  ['PF', 'pension funds', 3],
  ['HO', 'older households', 4],
] as const;

/** Share of new bonds each buyer takes, by the bond-buyer lever (0 mix, 1 banks, 2 CB, 3 PF, 4 older households). */
function buyerShare(c: Ctx, who: 'B' | 'CB' | 'PF' | 'HO'): number {
  const choice = Math.min(4, Math.max(0, Math.round(c.lever('bondBuyers'))));
  if (choice === 0) return who === 'B' ? c.p('bondMixBankShare') : who === 'PF' ? 1 - c.p('bondMixBankShare') : 0;
  return BUYERS.find(([k]) => k === who)![2] === choice ? 1 : 0;
}

const TAXES_H = AGES.map((g) => `incomeTax${g}`);
const SPEND: Id[] = CHANNELS.map((ch) => `spending${ch.id[0].toUpperCase()}${ch.id.slice(1)}`);
const TRANSFERS: Id[] = [...AGES.map((g) => `oldAgeTransfers${g}`), 'familyBenefitsY', 'familyBenefitsW', ...AGES.map((g) => `unemploymentBenefits${g}`)];
const INTEREST: Id[] = [...HOLDERS.map(([h]) => `bondInterest${h}`), 'indexedBondCoupon'];
const PAYROLL: Id[] = FIRMS.map((j) => `payrollTax${j}`);
const CORP: Id[] = FIRMS.map((j) => `corporateTax${j}`);
const sumV = (ids: Id[]) => (c: Ctx) => ids.reduce((s, id) => s + c.v(id), 0);

const vars: VarDef[] = [
  { id: 'publicEmployment', label: 'Public employment', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('publicEmployment'), description: 'Public staff as a gross wage bill at baseline wages.' },
  { id: 'publicValueAdded', label: 'Public value added (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real' },
  { id: 'publicPurchasesReal', label: 'Public purchases (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real' },
  { id: 'publicServicesReal', label: 'Public services (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real' },
  ...CHANNELS.flatMap((ch): VarDef[] => [
    ...PAYEES.map((to): VarDef => ({ id: `${ch.id}_${to}`, label: `${ch.label} → ${to === 'FR' ? 'retail and service firms (purchases)' : to === 'PF' ? 'pension funds (contributions)' : `${AGE_LABEL[AGES[PAYEES.indexOf(to)]]} (pay)`}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' })),
    { id: `spending${ch.id[0].toUpperCase()}${ch.id.slice(1)}`, label: `Spending on ${ch.label.toLowerCase()}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ]),
  { id: 'publicInvestment', label: 'Public investment', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ...AGES.map((g): VarDef => ({ id: `oldAgeTransfers${g}`, label: `Old-age and disability transfers, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' })),
  ...(['Y', 'W'] as const).map((g): VarDef => ({ id: `familyBenefits${g}`, label: `Family and housing benefits, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' })),
  ...AGES.map((g): VarDef => ({ id: `unemploymentBenefits${g}`, label: `Unemployment benefits, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`unemploymentBenefits${g}`) })),
  { id: 'vatRate', label: 'VAT rate (effective)', unit: 'fraction', kind: 'rate', scale: 'none', initial: base('vatRate') },
  { id: 'vat', label: 'VAT and taxes on goods', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('vat') },
  { id: 'vatFR', label: 'VAT passed on by retail and service firms', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'vatFC', label: 'VAT passed on by builders (home repairs)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'debtRatio', label: 'Government debt ratio', unit: 'ratio', kind: 'ratio', scale: 'none', initial: base('debtRatio'), description: 'Government bonds (nominal and indexed) ÷ last month’s annual GDP.' },
  { id: 'taxRuleAdjustment', label: 'Debt-rule tax adjustment', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0 },
  { id: 'taxRate', label: 'Income-tax rate', unit: 'fraction', kind: 'rate', scale: 'none', initial: base('taxRate') },
  ...AGES.map((g): VarDef => ({ id: `incomeTax${g}`, label: `Income tax, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`incomeTax${g}`) })),
  ...FIRMS.flatMap((j): VarDef[] => [
    { id: `payrollTax${j}`, label: `Payroll tax, ${FIRM_NAME[j]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: `corporateTax${j}`, label: `Corporate tax, ${FIRM_NAME[j]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  ]),
  { id: 'bondRate', label: 'Government-bond rate', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: base('bondRate') },
  ...HOLDERS.map(([h, who]): VarDef => ({ id: `bondInterest${h}`, label: `Bond interest to ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' })),
  { id: 'indexedBondCoupon', label: 'Real coupon on indexed bonds', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'bondIndexation', label: 'Indexation of indexed bonds', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'deficit', label: 'Government cash deficit', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  { id: 'bondIssue', label: 'New government bonds', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  ...BUYERS.map(([h, who]): VarDef => ({ id: `bondIssue${h}`, label: `New bonds bought by ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' })),
  { id: 'govBalance', label: 'Government balance', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0, description: 'Revenue minus spending on an accrual basis: indexation of indexed debt counts as spending.' },
];

const rules: RuleDef[] = [
  {
    id: 'publicEmployment',
    target: 'publicEmployment',
    category: 'POLICY',
    params: [...CHANNELS.flatMap((ch) => [ch.level, ch.share]), 'cEr'],
    terms: CHANNELS.map((ch) => ({ id: ch.id, label: ch.label, compute: (c: Ctx) => staff(c, ch) })),
    explain: { what: 'Public staff, measured as a gross wage bill at baseline wages.', rule: 'Staff = Σ over health, education and other services of pay share × real level ÷ (1 + {cEr%}).' },
  },
  {
    id: 'publicValueAdded',
    target: 'publicValueAdded',
    category: 'IDENTITY',
    params: CHANNELS.flatMap((ch) => [ch.level, ch.share]),
    terms: CHANNELS.map((ch) => ({ id: ch.id, label: ch.label, compute: (c: Ctx) => c.p(ch.share) * c.p(ch.level) })),
    explain: { what: 'What public services add to output at baseline prices: their staff costs.', rule: 'Σ pay share × real level, over the three service channels.' },
  },
  {
    id: 'publicPurchasesReal',
    target: 'publicPurchasesReal',
    category: 'IDENTITY',
    params: CHANNELS.flatMap((ch) => [ch.level, ch.share]),
    terms: CHANNELS.map((ch) => ({ id: ch.id, label: ch.label, concept: 'multiplier', compute: (c: Ctx) => (1 - c.p(ch.share)) * c.p(ch.level) })),
    explain: { what: 'What public services buy from firms, at baseline prices.', rule: 'Σ (1 − pay share) × real level, over the three service channels.' },
  },
  {
    id: 'publicServicesReal',
    target: 'publicServicesReal',
    category: 'IDENTITY',
    params: CHANNELS.map((ch) => ch.level),
    terms: CHANNELS.map((ch) => ({ id: ch.id, label: ch.label, compute: (c: Ctx) => c.p(ch.level) })),
    explain: { what: 'Public services (health, education, other) at baseline prices.', rule: 'Sum of the three real levels.' },
  },
  ...channelLegs,
  ...CHANNELS.map(
    (ch): RuleDef => ({
      id: `spending${ch.id[0].toUpperCase()}${ch.id.slice(1)}`,
      target: `spending${ch.id[0].toUpperCase()}${ch.id.slice(1)}`,
      category: 'IDENTITY',
      inputs: PAYEES.map((to) => `${ch.id}_${to}`),
      terms: terms(
        ['pay', 'Staff pay', undefined, sumV(AGES.map((g) => `${ch.id}_${HH[g]}`))],
        ['pensions', 'Pension contributions', 'funded-pensions', (c) => c.v(`${ch.id}_PF`)],
        ['purchases', 'Purchases from retail and service firms', 'multiplier', (c) => c.v(`${ch.id}_FR`)],
      ),
      explain: { what: `Total spending on ${ch.label.toLowerCase()}.`, rule: 'Spending = staff pay + their pension contributions + purchases from retail and service firms.' },
    }),
  ),
  {
    id: 'publicInvestment',
    target: 'publicInvestment',
    category: 'POLICY',
    inputs: ['domesticPrice'],
    params: ['gInv'],
    compute: (c) => c.v('domesticPrice') * c.p('gInv'),
    concepts: ['multiplier'],
    explain: { what: 'Roads, buildings and equipment the government buys from builders (who import part of it).', rule: 'Spending = real level {gInv}% of GDP (plus the lever) × domestic prices.' },
  },
  ...transferRules,
  {
    id: 'vatRate',
    target: 'vatRate',
    category: 'POLICY',
    params: ['vat0', 'vatShift'],
    terms: terms(['normal', 'Baseline effective rate', undefined, (c) => c.p('vat0')], ['lever', 'VAT lever', undefined, (c) => c.p('vatShift')]),
    explain: { what: 'The effective VAT rate on consumer spending.', rule: 'VAT rate = {vat0%} + the VAT lever. A change moves consumer prices at once.' },
  },
  {
    id: 'vat',
    target: 'vat',
    category: 'POLICY',
    inputs: ['vatRate', 'consumption'],
    compute: (c) => (c.v('vatRate') / (1 + c.v('vatRate'))) * c.v('consumption'),
    concepts: ['automatic-stabilisers'],
    explain: { what: 'VAT and other taxes on goods that shops collect from consumers and pass to the government.', rule: 'VAT = rate ÷ (1 + rate) × consumer spending (which includes the VAT).' },
  },
  {
    id: 'vatFR',
    target: 'vatFR',
    category: 'POLICY',
    inputs: ['vat'],
    params: ['maintShare'],
    compute: (c) => (1 - c.p('maintShare')) * c.v('vat'),
    explain: { what: 'VAT retail and service firms collect and pass on.', rule: 'Their share (1 − {maintShare%}) of household spending × the VAT on it.' },
  },
  {
    id: 'vatFC',
    target: 'vatFC',
    category: 'POLICY',
    inputs: ['vat'],
    params: ['maintShare'],
    compute: (c) => c.p('maintShare') * c.v('vat'),
    explain: { what: 'VAT builders collect on home repairs and pass on.', rule: 'Their share {maintShare%} of household spending × the VAT on it.' },
  },
  {
    id: 'debtRatio',
    target: 'debtRatio',
    category: 'IDENTITY',
    lagInputs: ['nominalGDP'],
    stocks: [
      ['govBonds', 'G'],
      ['indexedBonds', 'G'],
    ],
    compute: (c) => (c.stock('govBonds', 'G') + c.stock('indexedBonds', 'G')) / lastMonth(c, 'nominalGDP'),
    concepts: ['fiscal-rule'],
    explain: { what: 'Government debt as a share of a year’s GDP (as a ratio: 0.567 is 56.7%).', rule: 'Debt ratio = (nominal + indexed bonds at the start of the month) ÷ last month’s annual GDP.' },
  },
  {
    id: 'taxRuleAdjustment',
    target: 'taxRuleAdjustment',
    category: 'POLICY',
    label: 'Debt-tied tax rule',
    inputs: ['debtRatio'],
    params: ['fiscalRuleOn', 'phiTau', 'debtR0'],
    adjust: { speed: 'lamTau', form: 'exponential' },
    terms: terms(['debt', 'Debt above its baseline ratio', 'fiscal-rule', (c) => (c.p('fiscalRuleOn') >= 0.5 ? 1 : 0) * c.p('phiTau') * (c.v('debtRatio') - c.p('debtR0'))]),
    regime: (c) => (c.p('fiscalRuleOn') >= 0.5 ? null : 'Debt rule switched off'),
    concepts: ['fiscal-rule', 'automatic-stabilisers'],
    explain: {
      what: 'How far the debt-tied rule has moved the income-tax rate.',
      rule: 'Moves toward {phiTau} × (debt ratio − {debtR0}) at speed {lamTau} a year while the rule is on (toward zero when it is off). Ten points more debt eventually means about 2.5 points more tax.',
    },
  },
  {
    id: 'taxRate',
    target: 'taxRate',
    category: 'POLICY',
    inputs: ['taxRuleAdjustment'],
    params: ['tau0', 'incomeTaxShift'],
    terms: terms(
      ['normal', 'Baseline rate', undefined, (c) => c.p('tau0')],
      ['lever', 'Income-tax lever', undefined, (c) => c.p('incomeTaxShift')],
      ['debtRule', 'Debt-tied rule', 'fiscal-rule', (c) => c.v('taxRuleAdjustment')],
    ),
    explain: {
      what: 'The average tax rate on wages, benefits and pensions. At {tau0%} it also stands in for property taxes, other taxes on households and non-tax revenue.',
      rule: 'Rate = {tau0%} + the income-tax lever + the debt-tied rule’s adjustment.',
    },
  },
  ...AGES.map(
    (g): RuleDef => ({
      id: `incomeTax${g}`,
      target: `incomeTax${g}`,
      category: 'POLICY',
      inputs: ['taxRate', `grossIncome${g}`],
      compute: ((gross) => (c: Ctx) => c.v('taxRate') * c.v(gross))(`grossIncome${g}`),
      concepts: ['automatic-stabilisers'],
      explain: { what: `Income tax paid by the ${AGE_LABEL[g]}.`, rule: 'Tax = income-tax rate × gross income (wages, benefits and pensions).' },
    }),
  ),
  ...FIRMS.flatMap((j): RuleDef[] => [
    {
      id: `payrollTax${j}`,
      target: `payrollTax${j}`,
      category: 'POLICY',
      inputs: ['wage', `employment${j}`],
      params: ['css'],
      compute: (c) => c.p('css') * c.v('wage') * c.v(`employment${j}`),
      explain: { what: `Payroll tax (tryggingagjald) paid by ${FIRM_NAME[j]}.`, rule: 'Tax = {css%} × their gross wage bill.' },
    },
    {
      id: `corporateTax${j}`,
      target: `corporateTax${j}`,
      category: 'POLICY',
      inputs: [`profits${j}`],
      params: ['tauF'],
      compute: (c) => c.p('tauF') * c.v(`profits${j}`),
      concepts: ['automatic-stabilisers'],
      explain: { what: `Corporate income tax paid by ${FIRM_NAME[j]}.`, rule: 'Tax = effective rate {tauF%} × gross profit (set so baseline revenue matches the data). A loss earns a refund, so the state shares losses too.' },
    },
  ]),
  {
    id: 'bondRate',
    target: 'bondRate',
    category: 'CONTRACT',
    inputs: ['keyRate'],
    params: ['sB'],
    terms: terms(['keyRate', 'Key rate', 'taylor-rule', (c) => c.v('keyRate')], ['spread', 'Bond spread', undefined, (c) => c.p('sB')]),
    explain: { what: 'Interest on government bonds, which float with the key rate.', rule: 'Bond rate = key rate + {sB pp}.' },
  },
  ...HOLDERS.map(
    ([h, who]): RuleDef => ({
      id: `bondInterest${h}`,
      target: `bondInterest${h}`,
      category: 'CONTRACT',
      inputs: ['bondRate'],
      stocks: [['govBonds', h]],
      compute: (c) => c.v('bondRate') * c.stock('govBonds', h),
      concepts: ['interest-distribution'],
      explain: { what: `Interest the government pays ${who} on its bonds.`, rule: 'Interest = bond rate × bonds held at the start of the month.' },
    }),
  ),
  {
    id: 'indexedBondCoupon',
    target: 'indexedBondCoupon',
    category: 'CONTRACT',
    params: ['rBI0'],
    stocks: [['indexedBonds', 'PF']],
    compute: (c) => c.p('rBI0') * c.stock('indexedBonds', 'PF'),
    concepts: ['indexation'],
    explain: { what: 'The real coupon the government pays in cash on indexed bonds.', rule: 'Coupon = {rBI0%} × the indexed principal.' },
  },
  {
    id: 'bondIndexation',
    target: 'bondIndexation',
    category: 'CONTRACT',
    inputs: ['cpi'],
    lagInputs: ['cpi'],
    stocks: [['indexedBonds', 'PF']],
    compute: (c) => (c.stock('indexedBonds', 'PF') * (c.v('cpi') / c.lag('cpi') - 1)) / c.dt,
    concepts: ['indexation', 'accrual-vs-cash'],
    explain: { what: 'Inflation added to the principal of indexed government bonds (a yearly rate). No money moves.', rule: 'Indexation = indexed bonds × this month’s CPI change ÷ one month.' },
  },
  {
    id: 'deficit',
    target: 'deficit',
    category: 'IDENTITY',
    inputs: [...SPEND, 'publicInvestment', ...TRANSFERS, ...INTEREST, ...TAXES_H, 'vat', ...PAYROLL, ...CORP, 'cbProfit', 'bankDividendsG'],
    terms: terms(
      ['services', 'Public services', 'multiplier', sumV(SPEND)],
      ['investment', 'Public investment', 'multiplier', (c) => c.v('publicInvestment')],
      ['transfers', 'Transfers and benefits', 'automatic-stabilisers', sumV(TRANSFERS)],
      ['interest', 'Interest on debt', 'interest-distribution', sumV(INTEREST)],
      ['incomeTax', 'Income tax', 'automatic-stabilisers', (c) => -sumV(TAXES_H)(c)],
      ['vat', 'VAT', 'automatic-stabilisers', (c) => -c.v('vat')],
      ['payrollTax', 'Payroll tax', undefined, (c) => -sumV(PAYROLL)(c)],
      ['corporateTax', 'Corporate tax', 'automatic-stabilisers', (c) => -sumV(CORP)(c)],
      ['centralBank', 'Central-bank profit', undefined, (c) => -c.v('cbProfit')],
      ['bankDividends', 'Dividends from state-owned banks', undefined, (c) => -c.v('bankDividendsG')],
    ),
    concepts: ['sectoral-balances', 'deficits-and-money'],
    explain: {
      what: 'The government’s cash deficit: what it pays out minus what it takes in this month (a yearly rate). The government’s deficit is the rest of the economy’s surplus.',
      rule: 'Deficit = public services + investment + transfers + interest − income tax − VAT − payroll tax − corporate tax − central-bank profit − bank dividends.',
    },
  },
  {
    id: 'bondIssue',
    target: 'bondIssue',
    category: 'POLICY',
    inputs: ['deficit'],
    params: ['tga', 'treasuryTopUp'],
    stocks: [['treasuryAccount', 'G']],
    terms: terms(
      ['deficit', 'Deficit to finance', 'deficits-and-money', (c) => c.v('deficit')],
      ['topUp', 'Refill the treasury account', 'reserves-and-payments', (c) => c.p('treasuryTopUp') * (c.p('tga') - c.stock('treasuryAccount', 'G'))],
    ),
    concepts: ['deficits-and-money'],
    explain: {
      what: 'New government bonds sold this month (a yearly rate; negative means buying bonds back).',
      rule: 'Bonds sold = the cash deficit + {treasuryTopUp} × a year of any shortfall of the treasury account below {tga}% of GDP, so the account stays at its target.',
    },
  },
  ...BUYERS.map(
    ([h, who]): RuleDef => ({
      id: `bondIssue${h}`,
      target: `bondIssue${h}`,
      category: 'POLICY',
      inputs: ['bondIssue'],
      params: ['bondMixBankShare'],
      levers: ['bondBuyers'],
      compute: (c) => buyerShare(c, h) * c.v('bondIssue'),
      concepts: ['bond-buyers', h === 'B' || h === 'CB' ? 'endogenous-money' : 'deficits-and-money'],
      explain: {
        what: `New government bonds bought by ${who}. ${h === 'B' || h === 'CB' ? 'They pay with newly created money.' : 'They pay with deposits that already exist.'}`,
        rule: 'Their share of new bonds under the bond-buyer lever: mix ({bondMixBankShare%} banks, the rest pension funds), or all to banks, the central bank, pension funds or older households.',
      },
    }),
  ),
  {
    id: 'govBalance',
    target: 'govBalance',
    category: 'IDENTITY',
    inputs: ['deficit', 'bondIndexation'],
    terms: terms(['cash', 'Cash surplus', 'sectoral-balances', (c) => -c.v('deficit')], ['indexation', 'Indexation of indexed debt', 'indexation', (c) => -c.v('bondIndexation')]),
    concepts: ['sectoral-balances'],
    explain: { what: 'Revenue minus spending on an accrual basis: indexation added to indexed debt counts as spending.', rule: 'Balance = −(cash deficit + indexation of indexed bonds).' },
  },
];

const leverFor = (id: string, label: string, param: Id, unit: string, min: number, max: number, step: number, description: string, definition: string, concepts: Id[], scale?: number) => ({
  id,
  label,
  group: 'Policy',
  section: 'Government',
  kind: 'setting' as const,
  unit,
  default: 0,
  min,
  max,
  step,
  binds: { param, mode: 'add' as const, ...(scale ? { scale } : {}) },
  description,
  definition,
  concepts,
});

export const government: ModuleDef = {
  id: 'government',
  label: 'Government',
  description: 'Seven spending channels with their own levers; income tax, VAT, payroll and corporate tax; the debt-tied tax rule; bond financing and who buys the bonds.',
  requires: ['structure', 'labour-and-wages', 'prices', 'central-bank', 'banks', 'households', 'firms'],
  params: pickParams(ALL_PARAMS, [
    'gHealth', 'gEdu', 'gOther', 'gInv', 'wsHealth', 'wsEdu', 'wsOther', 'trOA', 'oaShareY', 'oaShareO', 'trFam', 'famShareY', 'rr', 'rrShift',
    'vat0', 'vatShift', 'tau0', 'incomeTaxShift', 'phiTau', 'lamTau', 'fiscalRuleOn', 'debtR0', 'css', 'tauF', 'sB', 'rBI0', 'tga', 'treasuryTopUp', 'bondMixBankShare',
    'compG', 'ueTarget', 'vatTarget', 'citTarget', 'govDebt', 'govIdxShare',
  ]),
  vars,
  rules,
  flows: [
    ...CHANNELS.map((ch) => ({
      id: `${ch.id}Spending`,
      label: ch.label,
      kind: 'cash' as const,
      account: 'current' as const,
      posting: { type: 'transfer' as const },
      channel: ch.channel,
      legs: PAYEES.map((to) => ({ from: 'G', to, amount: `${ch.id}_${to}` })),
      concepts: ['multiplier', 'deficits-and-money'],
      explain: { what: `The government runs ${ch.what}: it pays staff (their pension contributions go to pension funds) and buys supplies from retail and service firms.` },
    })),
    {
      id: 'publicInvestment',
      label: 'Public investment',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      channel: 'investment',
      legs: [{ from: 'G', to: 'FC', amount: 'publicInvestment' }],
      concepts: ['multiplier'],
      explain: { what: 'The government buys roads, buildings and equipment from builders. Public capital is not tracked, as in v1.' },
    },
    {
      id: 'oldAgeTransfers',
      label: 'Old-age and disability transfers',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      channel: 'oldAge',
      legs: AGES.map((g) => ({ from: 'G', to: HH[g], amount: `oldAgeTransfers${g}` })),
      concepts: ['automatic-stabilisers'],
      explain: { what: 'Social Insurance pays public pensions, mostly to older people, and disability benefits, mostly to working age.' },
    },
    {
      id: 'familyBenefits',
      label: 'Family and housing benefits',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      channel: 'family',
      legs: (['Y', 'W'] as const).map((g) => ({ from: 'G', to: HH[g], amount: `familyBenefits${g}` })),
      explain: { what: 'Child benefits, parental leave and housing support, paid to young and working-age families.' },
    },
    {
      id: 'unemploymentBenefits',
      label: 'Unemployment benefits',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      channel: 'unemployment',
      legs: AGES.map((g) => ({ from: 'G', to: HH[g], amount: `unemploymentBenefits${g}` })),
      concepts: ['automatic-stabilisers'],
      explain: { what: 'Paid automatically to the unemployed in each age group: when jobs are lost, spending rises without any decision.' },
    },
    {
      id: 'incomeTax',
      label: 'Personal income tax',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: AGES.map((g) => ({ from: HH[g], to: 'G', amount: `incomeTax${g}` })),
      concepts: ['automatic-stabilisers'],
      explain: { what: 'Households pay income tax on wages, benefits and pensions from their deposits; banks pass reserves to the treasury, so deposits shrink.' },
    },
    {
      id: 'vatPayments',
      label: 'VAT and taxes on goods',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [
        { from: 'FR', to: 'G', amount: 'vatFR' },
        { from: 'FC', to: 'G', amount: 'vatFC' },
      ],
      explain: { what: 'Shops, and builders doing home repairs, pass the VAT they collect on consumer spending to the government.' },
    },
    {
      id: 'payrollTax',
      label: 'Payroll tax',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: FIRMS.map((j) => ({ from: j, to: 'G', amount: `payrollTax${j}` })),
      explain: { what: 'Firms pay the social-security tax on their wage bills.' },
    },
    {
      id: 'corporateTax',
      label: 'Corporate income tax',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: FIRMS.map((j) => ({ from: j, to: 'G', amount: `corporateTax${j}` })),
      concepts: ['automatic-stabilisers'],
      explain: { what: 'Firms pay tax on their profits.' },
    },
    {
      id: 'bondInterest',
      label: 'Interest on government bonds',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: HOLDERS.map(([h]) => ({ from: 'G', to: h, amount: `bondInterest${h}` })),
      concepts: ['interest-distribution'],
      explain: { what: 'The government pays interest to bondholders: banks, the central bank, pension funds, older savers and foreign investors.' },
    },
    {
      id: 'indexedBondCoupon',
      label: 'Real coupon on indexed bonds',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'G', to: 'PF', amount: 'indexedBondCoupon' }],
      concepts: ['indexation'],
      explain: { what: 'The government pays the real coupon on indexed bonds held by pension funds.' },
    },
    {
      id: 'bondIndexation',
      label: 'Indexation of indexed bonds',
      kind: 'accrual',
      account: 'current',
      posting: { type: 'accrue', instrument: 'indexedBonds' },
      legs: [{ from: 'G', to: 'PF', amount: 'bondIndexation' }],
      concepts: ['indexation', 'accrual-vs-cash'],
      explain: { what: 'Inflation is added to the principal of indexed bonds: the government owes pension funds more, but no money moves.' },
    },
    {
      id: 'bondSales',
      label: 'New government bonds',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'issue', instrument: 'govBonds' },
      legs: BUYERS.map(([h]) => ({ from: h, to: 'G', amount: `bondIssue${h}` })),
      concepts: ['deficits-and-money', 'bond-buyers'],
      explain: { what: 'The government borrows its deficit by selling bonds. When banks or the central bank buy, new money is created; when pension funds or older households buy, existing deposits move to the government.' },
    },
  ],
  levers: [
    leverFor('incomeTax', 'Income-tax rate', 'incomeTaxShift', 'pp', -10, 10, 0.5, 'Changes the average tax rate on wages, benefits and pensions.', 'Level shift in the income-tax rate, in percentage points, applied at once and persistent while set, on top of the debt rule (which then leans against the change in debt it causes). Setting it back to 0 removes the shift.', ['automatic-stabilisers'], 0.01),
    leverFor('vat', 'VAT rate', 'vatShift', 'pp', -10, 10, 0.5, 'Changes the effective VAT rate on consumer spending; prices move at once.', 'Level shift in the effective VAT rate, in percentage points, applied at once and persistent while set. Consumer prices jump with it and indexed debts are revalued. Setting it back to 0 removes the shift (prices drop back).', ['cost-pass-through'], 0.01),
    leverFor('health', 'Health spending', 'gHealth', '% of GDP', -3, 3, 0.1, 'Real change in public health spending: staff pay and purchases.', 'Level shift in real health spending, % of baseline GDP a year, split between staff and purchases as at baseline; persistent while set. Nominal spending also rises with wages and prices. Setting it back to 0 returns spending to baseline; the debt built up meanwhile remains.', ['multiplier']),
    leverFor('education', 'Education spending', 'gEdu', '% of GDP', -3, 3, 0.1, 'Real change in public education spending.', 'Level shift in real education spending, % of baseline GDP a year, persistent while set, split between staff and purchases as at baseline. Setting it back to 0 returns spending to baseline.', ['multiplier']),
    leverFor('otherServices', 'Other public services', 'gOther', '% of GDP', -3, 3, 0.1, 'Real change in other public services: administration, police, culture, roads.', 'Level shift in real spending on other public services, % of baseline GDP a year, persistent while set, split between staff and purchases as at baseline. Setting it back to 0 returns spending to baseline.', ['multiplier']),
    leverFor('publicInvestment', 'Public investment', 'gInv', '% of GDP', -3, 3, 0.1, 'Real change in public investment bought from domestic firms.', 'Level shift in real public investment, % of baseline GDP a year, persistent while set; nominal spending moves with domestic prices. Setting it back to 0 returns it to baseline.', ['multiplier']),
    leverFor('oldAgeTransfers', 'Old-age and disability transfers', 'trOA', '% of GDP', -2, 2, 0.1, 'Real change in public pensions and disability benefits (mostly to older people).', 'Level shift in real old-age and disability transfers, % of baseline GDP a year, indexed to the CPI and split by age as at baseline; persistent while set. Setting it back to 0 ends it.', ['automatic-stabilisers', 'intergenerational-flows']),
    leverFor('familyBenefits', 'Family and housing benefits', 'trFam', '% of GDP', -2, 2, 0.1, 'Real change in child, parental-leave and housing benefits (young and working age).', 'Level shift in real family and housing benefits, % of baseline GDP a year, indexed to the CPI and split by age as at baseline; persistent while set. Setting it back to 0 ends it.', ['automatic-stabilisers']),
    leverFor('unemploymentBenefits', 'Unemployment-benefit rate', 'rrShift', 'pp of wage', -30, 30, 5, 'Changes the replacement rate paid automatically to the unemployed.', 'Level shift in the replacement rate, in percentage points of the average wage, applied to everyone unemployed at once and persistent while set. Setting it back to 0 ends it.', ['automatic-stabilisers'], 0.01),
    {
      id: 'fiscalRule',
      label: 'Debt-tied tax rule',
      group: 'Policy',
      section: 'Government',
      kind: 'choice',
      unit: 'switch',
      default: 1,
      min: 0,
      max: 1,
      step: 1,
      options: [
        { value: 0, label: 'Off' },
        { value: 1, label: 'On' },
      ],
      binds: { param: 'fiscalRuleOn', mode: 'replace' },
      description: 'When on, income tax slowly rises when government debt is above its baseline share of GDP, and falls when it is below.',
      definition:
        'Switch, persistent while set. On: the debt rule’s tax adjustment moves toward 0.25 × (debt ratio − baseline) at 0.5 a year. Off: the adjustment decays back to zero at the same speed, and nothing then stops interest on a growing debt from compounding.',
      concepts: ['fiscal-rule'],
    },
    {
      id: 'bondBuyers',
      label: 'Who buys new government bonds',
      group: 'Policy',
      section: 'Government',
      kind: 'choice',
      unit: 'choice',
      default: 0,
      min: 0,
      max: 4,
      step: 1,
      options: [
        { value: 0, label: 'Mix: 40% banks, 60% pension funds' },
        { value: 1, label: 'Banks' },
        { value: 2, label: 'Central bank' },
        { value: 3, label: 'Pension funds' },
        { value: 4, label: 'Older households' },
      ],
      description: 'Banks and the central bank pay with newly created money; pension funds and households pay with existing deposits.',
      definition:
        'Choice, persistent while set: every new bond sold (or bought back) from then on goes to the chosen buyer, or 40/60 to banks and pension funds in the mix. Bonds already sold stay where they are, though pension funds and older households slowly sell surplus bonds to banks to restore their portfolio shares.',
      concepts: ['bond-buyers', 'deficits-and-money', 'endogenous-money'],
    },
  ],
  tests: [
    {
      id: 'balanced-budget-at-baseline',
      label: 'At baseline the budget balances and the treasury account is at its target',
      run: (e) => {
        const d = e.baseline('deficit');
        const tga = e.balanceSheet('G').assets.find((a) => a.instrument === 'treasuryAccount')!.baseline;
        return { pass: Math.abs(d) < 1e-9 && Math.abs(tga - 5) < 1e-9, detail: `deficit ${d.toExponential(2)}, treasury account ${tga.toFixed(9)}` };
      },
    },
    {
      id: 'bond-buyer-lever',
      label: 'The bond-buyer lever changes who holds the new bonds',
      run: (e) => {
        const holdings = (eng: typeof e) => Object.fromEntries(['B', 'CB', 'PF', 'HO'].map((h) => [h, eng.balanceSheet(h).assets.find((a) => a.instrument === 'govBonds')!]));
        const out: string[] = [];
        let pass = true;
        for (const [choice, who] of [
          [2, 'CB'],
          [3, 'PF'],
          [4, 'HO'],
        ] as const) {
          const f = e.fork();
          f.setLever('bondBuyers', choice);
          f.setLever('otherServices', 1);
          f.step(1);
          const h = holdings(f);
          const gain = (k: string) => h[k].value - h[k].baseline;
          const ok = gain(who) > 0.05 && ['B', 'CB', 'PF', 'HO'].filter((k) => k !== who).every((k) => gain(k) < gain(who));
          pass &&= ok;
          out.push(`${who} +${gain(who).toFixed(3)}`);
        }
        return { pass, detail: `after one month of spending +1% of GDP, the chosen buyer's bonds: ${out.join(', ')}` };
      },
    },
    {
      id: 'bank-financed-deficit-creates-more-money',
      label: 'Spending financed by banks creates more broad money than spending financed by pension funds',
      run: (e) => {
        const money = (f: ReturnType<typeof e.fork>) => ['HY', 'HW', 'HO', ...FIRMS, 'PF'].reduce((s, pl) => s + f.balanceSheet(pl).assets.find((a) => a.instrument === 'deposits')!.value, 0);
        const run = (choice: number) => {
          const f = e.fork();
          f.setLever('bondBuyers', choice);
          f.setLever('otherServices', 1);
          f.step(12);
          return money(f);
        };
        const banks = run(1),
          funds = run(3);
        return { pass: banks - funds > 0.3, detail: `broad money after 12 months: bank-financed ${banks.toFixed(3)}, pension-fund-financed ${funds.toFixed(3)} (% of GDP)` };
      },
    },
  ],
};
