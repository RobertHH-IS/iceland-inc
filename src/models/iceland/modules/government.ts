/**
 * Iceland Inc.: the government (v1 equations E23, E24, E30, E32, E37 and E42).
 *
 * Seven spending channels, each a flow with its own lever: health, education and other public
 * services (staff pay, their pension contributions and purchases from firms), public investment,
 * old-age and disability transfers, family and housing benefits, and unemployment benefits.
 * Revenue comes from income tax, VAT, payroll tax, corporate tax, the central bank's profit and
 * the state's bank dividends. A slow debt-tied rule works out how far it would move the income-tax
 * rate when debt drifts from baseline; it acts only when stabilisers are Automatic, and is a
 * suggestion on the income-tax lever when they are Manual (decision 0004). The government borrows its cash deficit by selling bonds, and a lever decides
 * who buys them: banks and the central bank pay with new money, pension funds and older
 * households with money that already exists.
 */
import type { Ctx, Id, ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { AGE_LABEL, AGES, FIRMS, FIRM_NAME, HH, pickParams, terms, lastMonth, automatic, AUTOMATIC, MANUAL, STABILISERS } from '../util.ts';
import { cashToSpend } from './banks.ts';
import { PF_CASH, pfCashForNewBonds } from './pensions.ts';

type Channel = { id: string; label: string; level: Id; share: Id; lever: string; channel: string; what: string };
const CHANNELS: Channel[] = [
  { id: 'health', label: 'Public health services', level: 'gHealth', share: 'wsHealth', lever: 'health', channel: 'health', what: 'hospitals and clinics' },
  { id: 'education', label: 'Public education', level: 'gEdu', share: 'wsEdu', lever: 'education', channel: 'education', what: 'schools and universities' },
  { id: 'otherServices', label: 'Other public services', level: 'gOther', share: 'wsOther', lever: 'otherServices', channel: 'otherServices', what: 'administration, police, culture, road upkeep and subsidies' },
];
const PAYEES = [...AGES.map((g) => HH[g]), 'PF', 'FR'] as const;

/** Public staff in a channel, as a gross wage bill at baseline wages. The pay share is compensation
 *  of employees, which includes the employer pension contribution and the payroll tax, as for
 *  firms; the government pays that payroll tax to itself, so it nets out of the cash budget. */
const staff = (c: Ctx, ch: Channel) => (c.p(ch.share) * c.p(ch.level)) / (1 + c.p('cEr') + c.p('css'));

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
        params: [ch.level, ch.share, 'cEr', 'css', 'cEe'],
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
      params: [ch.level, ch.share, 'cEr', 'css', 'cEe'],
      compute: (c) => ((1 - c.p('cEe')) * c.v('wage') * staff(c, ch) * c.v(`employment${g}`)) / c.v('employmentTotal'),
      explain: {
        what: `Pay of staff in ${ch.label.toLowerCase()} who are ${AGE_LABEL[g]}, after the employee pension contribution.`,
        rule: `(1 − {cEe%}) × wage rate × public staff ({${ch.share}} × {${ch.level}} ÷ (1 + {cEr%} + {css%}), since the pay share includes the employer pension contribution and the payroll tax) × the ${AGE_LABEL[g]}’s share of all jobs.`,
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
      // A fixed real amount, indexed to prices: it does not move with jobs or incomes, so it is not
      // an automatic stabiliser. A change to it is a decision, spent through the recipients' MPC.
      concepts: ['consumption-function', 'intergenerational-flows'],
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
      concepts: ['consumption-function'],
      explain: {
        what: `Child, parental-leave and housing benefits paid to the ${AGE_LABEL[g]}. Child and housing benefits are tax-free; parental-leave pay and the rest are taxed.`,
        rule: `Benefits = real level {trFam} × ${g === 'Y' ? '{famShareY}' : '(1 − {famShareY})'} × CPI. The share {famTaxableShare%} is taxable income.`,
      },
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

type Buyer = (typeof BUYERS)[number][0];
/** Share of new bonds each buyer takes, by the bond-buyer lever (0 mix, 1 banks, 2 CB, 3 PF, 4 older households). */
function buyerShare(c: Ctx, who: Buyer): number {
  const choice = Math.min(4, Math.max(0, Math.round(c.lever('bondBuyers'))));
  if (choice === 0) return who === 'B' ? c.p('bondMixBankShare') : who === 'PF' ? 1 - c.p('bondMixBankShare') : 0;
  return BUYERS.find(([k]) => k === who)![2] === choice ? 1 : 0;
}
/** Nominal government bonds the government can buy back: all but non-residents', who trade theirs
 *  with banks. Indexed bonds are never redeemed here. */
const bondsHeld = (c: Ctx) => BUYERS.reduce((s, [h]) => s + c.stock('govBonds', h), 0);
const BOND_STOCKS = BUYERS.map(([h]): [Id, Id] => ['govBonds', h]);
/** A holder's share of a buyback: in proportion to what it holds at the start of the month. */
const buybackShare = (c: Ctx, h: Buyer) => {
  const all = bondsHeld(c);
  return all > 0 ? c.stock('govBonds', h) / all : 0;
};
/** Share of nominal bonds whose coupon is reset this month: last month's new bonds (as a share of
 *  the stock at the start of the month, which includes them) plus a month's maturities, 1 ÷ average
 *  maturity, of the rest. Buybacks take bonds at every coupon alike, so they leave the average. */
const repricedShare = (c: Ctx) => {
  const stock = c.stock('govBonds', 'G');
  if (!(stock > 0)) return 1;
  const fresh = Math.min(1, (Math.max(0, c.lag('bondIssue')) * c.dt) / stock);
  return fresh + (1 - fresh) * Math.min(1, c.dt / c.p('bondMaturity'));
};
/** New bonds a pension fund or older household can pay for this month: pension funds the cash above
 *  the buffer they keep (pensions.ts; their other purchases take what is left), older households
 *  the share hoBondCashShare of their cash in hand (the rest is for their spending, households.ts). */
const buyerCash = (c: Ctx, h: 'PF' | 'HO') => (h === 'PF' ? pfCashForNewBonds(c) : c.p('hoBondCashShare') * cashToSpend(c, h));

const TAXES_H = AGES.map((g) => `incomeTax${g}`);
const GROSS_H = AGES.map((g) => `grossIncome${g}`);
/** The debt rule's part of the income-tax rate: it acts only on Automatic (on Manual it is a suggestion). */
const debtRulePart = (c: Ctx) => (automatic(c) ? c.v('taxRuleAdjustment') : 0);
/** Share of consumer spending (which includes VAT) that is VAT at a given rate. */
const vatShare = (rate: number) => rate / (1 + rate);
const SPEND: Id[] = CHANNELS.map((ch) => `spending${ch.id[0].toUpperCase()}${ch.id.slice(1)}`);
const DECIDED_TRANSFERS: Id[] = [...AGES.map((g) => `oldAgeTransfers${g}`), 'familyBenefitsY', 'familyBenefitsW'];
const UNEMPLOYMENT: Id[] = AGES.map((g) => `unemploymentBenefits${g}`);
const TRANSFERS: Id[] = [...DECIDED_TRANSFERS, ...UNEMPLOYMENT];
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
  ...(['Y', 'W'] as const).map((g): VarDef => ({ id: `familyBenefits${g}`, label: `Family and housing benefits, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`familyBenefits${g}`) })),
  ...AGES.map((g): VarDef => ({ id: `unemploymentBenefits${g}`, label: `Unemployment benefits, ${AGE_LABEL[g]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`unemploymentBenefits${g}`) })),
  { id: 'vatRate', label: 'VAT rate (effective)', unit: 'fraction', kind: 'rate', scale: 'none', initial: base('vatRate') },
  { id: 'vat', label: 'VAT and taxes on goods', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('vat') },
  { id: 'vatFR', label: 'VAT passed on by retail and service firms', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'vatFC', label: 'VAT passed on by builders (home repairs)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
  { id: 'debtRatio', label: 'Government debt ratio', unit: 'ratio', kind: 'ratio', scale: 'none', initial: base('debtRatio'), description: 'Government bonds (nominal and indexed), less any treasury cash above its target balance, ÷ GDP over the 12 months to last month.' },
  { id: 'taxRuleAdjustment', label: 'Debt-rule tax adjustment', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0, description: 'How far the debt rule would move the income-tax rate. Computed in both stabiliser modes; added to the rate only on Automatic.' },
  { id: 'taxRuleSuggestion', label: 'Income-tax shift the debt rule suggests', unit: 'pp', kind: 'rate', scale: 'none', description: 'The debt rule’s adjustment in percentage points: comparable with the income-tax lever.' },
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
    params: [...CHANNELS.flatMap((ch) => [ch.level, ch.share]), 'cEr', 'css'],
    terms: CHANNELS.map((ch) => ({ id: ch.id, label: ch.label, compute: (c: Ctx) => staff(c, ch) })),
    explain: {
      what: 'Public staff, measured as a gross wage bill at baseline wages.',
      rule: 'Staff = Σ over health, education and other services of pay share × real level ÷ (1 + {cEr%} + {css%}). The pay share is compensation of employees, which includes the employer pension contribution and the payroll tax, as for firms.',
    },
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
      explain: {
        what: `Total cash spending on ${ch.label.toLowerCase()}.`,
        rule: 'Spending = staff pay + their pension contributions + purchases from retail and service firms. The payroll tax on public staff is paid by the government to itself, so it is neither spent nor collected in cash.',
      },
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
    explain: { what: 'The effective VAT rate on consumer spending.', rule: 'VAT rate = {vat0%} + the VAT lever. Shops pass a change into their prices over a few months (see VAT built into shop prices).' },
  },
  {
    id: 'vat',
    target: 'vat',
    category: 'POLICY',
    inputs: ['vatRate', 'consumption'],
    params: ['vat0'],
    // Split so that ideas at play can tell the automatic stabiliser (VAT at the baseline rate on
    // spending that moves with the cycle) from a decision to change the rate (review TAX-4).
    terms: terms(
      ['base', 'Baseline rate × spending', 'automatic-stabilisers', (c) => vatShare(c.p('vat0')) * c.v('consumption')],
      ['rateChange', 'Your change to the rate × spending', 'multiplier', (c) => (vatShare(c.v('vatRate')) - vatShare(c.p('vat0'))) * c.v('consumption')],
    ),
    explain: {
      what: 'VAT and other taxes on goods that shops collect from consumers and pass to the government.',
      rule: 'VAT = rate ÷ (1 + rate) × consumer spending (which includes the VAT). The first part, at the baseline rate {vat0%}, rises and falls with spending by itself (an automatic stabiliser); the second is the change you make to the rate.',
    },
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
    lagInputs: ['gdpTrailing12'],
    params: ['tga'],
    stocks: [
      ['govBonds', 'G'],
      ['indexedBonds', 'G'],
      ['treasuryAccount', 'G'],
    ],
    compute: (c) => (c.stock('govBonds', 'G') + c.stock('indexedBonds', 'G') - (c.stock('treasuryAccount', 'G') - c.p('tga'))) / lastMonth(c, 'gdpTrailing12'),
    concepts: ['fiscal-rule'],
    explain: {
      what: 'Government debt as a share of a year’s GDP (as a ratio: 0.567 is 56.7%), net of any cash the treasury holds above its usual balance.',
      rule: 'Debt ratio = (nominal + indexed bonds − treasury account above its target {tga}% of GDP, at the start of the month) ÷ GDP over the 12 months to last month, as official statistics measure it. The treasury account is normally at its target; it rises above it only once every bond that can be bought back has been.',
    },
  },
  {
    id: 'taxRuleAdjustment',
    target: 'taxRuleAdjustment',
    category: 'POLICY',
    label: 'Debt-tied tax rule',
    inputs: ['debtRatio'],
    params: ['phiTau', 'debtR0'],
    levers: [STABILISERS],
    adjust: { speed: 'lamTau', form: 'exponential' },
    terms: terms(['debt', 'Debt above its baseline ratio', 'fiscal-rule', (c) => c.p('phiTau') * (c.v('debtRatio') - c.p('debtR0'))]),
    regime: (c) => (automatic(c) ? null : 'Suggestion only (Manual)'),
    concepts: ['fiscal-rule'],
    explain: {
      what: 'How far the debt rule would move the income-tax rate: added to the rate (with your offset) when stabilisers are Automatic, only suggested on the income-tax lever when they are Manual.',
      rule: 'Moves toward {phiTau} × (debt ratio − {debtR0}) at speed {lamTau} a year, in both modes. Ten points more debt eventually means about 2.5 points more tax.',
    },
  },
  {
    id: 'taxRuleSuggestion',
    target: 'taxRuleSuggestion',
    category: 'POLICY',
    label: 'The debt rule’s suggestion, in lever units',
    inputs: ['taxRuleAdjustment'],
    compute: (c) => 100 * c.v('taxRuleAdjustment'),
    concepts: ['fiscal-rule'],
    explain: {
      what: 'The income-tax shift the debt rule would set now, in percentage points from the baseline rate: the same units as the income-tax lever. In Manual mode the lever turns red when it is more than a quarter point away, and “Apply” sets the lever to it, rounded to half a point.',
      rule: 'Suggestion = the debt rule’s adjustment × 100. It is the whole shift the rule would want given today’s debt, so a lever already set there satisfies it.',
    },
  },
  {
    id: 'taxRate',
    target: 'taxRate',
    category: 'POLICY',
    label: 'Income-tax rate: yours, or the rule’s plus your offset',
    inputs: ['taxRuleAdjustment'],
    params: ['tau0', 'incomeTaxShift'],
    levers: [STABILISERS, 'incomeTaxOffset'],
    // Each mode reads its own lever, as the key rate does: the engine applies a hidden lever's
    // value, so a shift set with "Apply" on Manual must not also count as an offset on Automatic.
    terms: terms(
      ['normal', 'Baseline rate', undefined, (c) => c.p('tau0')],
      ['lever', 'The shift you set (Manual)', undefined, (c) => (automatic(c) ? 0 : c.p('incomeTaxShift'))],
      ['offset', 'Your offset to the rule (Automatic)', undefined, (c) => (automatic(c) ? c.lever('incomeTaxOffset') / 100 : 0)],
      ['debtRule', 'Debt rule (Automatic)', 'fiscal-rule', (c) => (automatic(c) ? c.v('taxRuleAdjustment') : 0)],
    ),
    explain: {
      what: 'The average tax rate on wages, taxable benefits and pensions. Tax-free child and housing benefits are outside it. At {tau0%} it also stands in for property taxes, other taxes on households and non-tax revenue.',
      rule: 'Who sets it depends on the Stabilisers setting. Manual (the default): rate = {tau0%} + the income-tax lever, and it stays where you set it; the debt rule only suggests a value beside the lever. Automatic: rate = {tau0%} + the debt rule’s adjustment + your offset lever.',
    },
  },
  ...AGES.map((g): RuleDef => {
    const gross = `grossIncome${g}`; // built once: this rule sits in the income–spending block
    return {
      id: `incomeTax${g}`,
      target: `incomeTax${g}`,
      category: 'POLICY',
      inputs: ['taxRate', 'taxRuleAdjustment', gross],
      params: ['tau0'],
      levers: [STABILISERS],
      // Split so that ideas at play can tell the automatic stabiliser (tax at the baseline rate on
      // income that moves with the cycle) from a decision to change the rate, yours or the debt
      // rule's (review TAX-4). The three terms add up to the income-tax rate × gross income.
      terms: terms(
        ['base', 'Baseline rate × income', 'automatic-stabilisers', (c) => c.p('tau0') * c.v(gross)],
        ['rateChange', 'Your change to the rate × income', 'multiplier', (c) => (c.v('taxRate') - c.p('tau0') - debtRulePart(c)) * c.v(gross)],
        ['debtRule', 'The debt rule’s change to the rate × income (Automatic)', 'fiscal-rule', (c) => debtRulePart(c) * c.v(gross)],
      ),
      explain: {
        what: `Income tax paid by the ${AGE_LABEL[g]}.`,
        rule: 'Tax = income-tax rate × gross taxable income (wages, taxable benefits and pensions). At the baseline rate {tau0%} it rises and falls with incomes by itself (an automatic stabiliser); on top of that comes your change to the rate, and on Automatic the debt rule’s.',
      },
    };
  }),
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
    lagInputs: ['bondRate', 'bondIssue'],
    params: ['sB', 'bondMaturity'],
    stocks: [['govBonds', 'G']],
    terms: terms(
      ['held', 'Bonds still at their old coupon', 'interest-distribution', (c) => (1 - repricedShare(c)) * c.lag('bondRate')],
      ['repriced', 'Bonds refinanced at the key rate + spread', 'taylor-rule', (c) => repricedShare(c) * (c.v('keyRate') + c.p('sB'))],
    ),
    concepts: ['interest-distribution'],
    explain: {
      what: 'The average coupon the government pays on its nominal bonds, the same whoever holds them. Most bonds pay the fixed coupon they were sold with, so the average moves toward the key rate + {sB pp} only as bonds mature and are refinanced, and as new bonds are sold.',
      rule: 'Rate = last month’s average × the share not repriced + (key rate + {sB pp}) × the share repriced this month. The share repriced is the bonds sold last month (as a share of all nominal bonds) plus a month’s worth, 1 ÷ {bondMaturity} years, of the rest, which mature and are refinanced. Selling many new bonds therefore moves the average faster.',
    },
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
    inputs: [...SPEND, 'publicInvestment', ...TRANSFERS, ...INTEREST, ...TAXES_H, ...GROSS_H, 'taxRuleAdjustment', 'vat', 'consumption', ...PAYROLL, ...CORP, 'cbProfit', 'bankDividendsG'],
    params: ['tau0', 'vat0'],
    levers: [STABILISERS],
    // Taxes and transfers are split as in their own rules: what moves with the cycle by itself
    // (automatic stabilisers) apart from the decisions, yours or the debt rule's (review TAX-4).
    terms: terms(
      ['services', 'Public services', 'multiplier', sumV(SPEND)],
      ['investment', 'Public investment', 'multiplier', (c) => c.v('publicInvestment')],
      ['transfers', 'Old-age, disability, family and housing benefits', 'multiplier', sumV(DECIDED_TRANSFERS)],
      ['unemploymentBenefits', 'Unemployment benefits', 'automatic-stabilisers', sumV(UNEMPLOYMENT)],
      ['interest', 'Interest on debt', 'interest-distribution', sumV(INTEREST)],
      ['incomeTax', 'Income tax at the baseline rate', 'automatic-stabilisers', (c) => -c.p('tau0') * sumV(GROSS_H)(c)],
      ['incomeTaxChange', 'Income tax: your change to the rate', 'multiplier', (c) => -(sumV(TAXES_H)(c) - (c.p('tau0') + debtRulePart(c)) * sumV(GROSS_H)(c))],
      ['incomeTaxDebtRule', 'Income tax: the debt rule’s change (Automatic)', 'fiscal-rule', (c) => -debtRulePart(c) * sumV(GROSS_H)(c)],
      ['vat', 'VAT at the baseline rate', 'automatic-stabilisers', (c) => -vatShare(c.p('vat0')) * c.v('consumption')],
      ['vatChange', 'VAT: your change to the rate', 'multiplier', (c) => -(c.v('vat') - vatShare(c.p('vat0')) * c.v('consumption'))],
      ['payrollTax', 'Payroll tax', undefined, (c) => -sumV(PAYROLL)(c)],
      ['corporateTax', 'Corporate tax', 'automatic-stabilisers', (c) => -sumV(CORP)(c)],
      ['centralBank', 'Central-bank profit', undefined, (c) => -c.v('cbProfit')],
      ['bankDividends', 'Dividends from state-owned banks', undefined, (c) => -c.v('bankDividendsG')],
    ),
    concepts: ['sectoral-balances', 'deficits-and-money'],
    explain: {
      what: 'The government’s cash deficit: what it pays out minus what it takes in this month (a yearly rate). The government’s deficit is the rest of the economy’s surplus.',
      rule: 'Deficit = public services + investment + transfers and benefits + interest − income tax − VAT − payroll tax − corporate tax − central-bank profit − bank dividends. Unemployment benefits, and income tax and VAT at their baseline rates, move with jobs, incomes and spending by themselves (automatic stabilisers); the other transfers and any change in tax rates are decisions.',
    },
  },
  {
    id: 'bondIssue',
    target: 'bondIssue',
    category: 'POLICY',
    inputs: ['deficit'],
    params: ['tga', 'treasuryTopUp'],
    stocks: [['treasuryAccount', 'G'], ...BOND_STOCKS],
    terms: terms(
      ['deficit', 'Deficit to finance', 'deficits-and-money', (c) => c.v('deficit')],
      ['topUp', 'Refill the treasury account', 'reserves-and-payments', (c) => c.p('treasuryTopUp') * (c.p('tga') - c.stock('treasuryAccount', 'G'))],
    ),
    // The government cannot buy back more bonds than there are: a surplus beyond that stays in
    // its treasury account (and is spent down first when a deficit returns).
    combine: (t, c) => Math.max(-bondsHeld(c) / c.dt, t.deficit + t.topUp),
    regime: (c, _v, t) => (t.deficit + t.topUp < -bondsHeld(c) / c.dt ? 'Buyback limited by holdings: the surplus stays in the treasury account' : null),
    concepts: ['deficits-and-money'],
    explain: {
      what: 'New government bonds sold this month (a yearly rate; negative means buying bonds back).',
      rule: 'Bonds sold = the cash deficit + {treasuryTopUp} × a year of any shortfall of the treasury account below {tga}% of GDP, so the account stays at its target. The government never buys back more than the bonds banks, the central bank, pension funds and older households hold; once they are all repaid, a surplus builds up in the treasury account.',
    },
  },
  ...BUYERS.map(([h, who]): RuleDef => {
    const nonBank = h === 'PF' || h === 'HO';
    const sale = (c: Ctx) => Math.max(0, c.v('bondIssue')) * buyerShare(c, h);
    const buyback = (c: Ctx) => Math.min(0, c.v('bondIssue')) * buybackShare(c, h);
    // What pension funds and older households were due to buy but could not pay for.
    const overflow = (c: Ctx, k: 'PF' | 'HO') => Math.max(0, c.v('bondIssue')) * buyerShare(c, k) - Math.max(0, c.v(`bondIssue${k}`));
    return {
      id: `bondIssue${h}`,
      target: `bondIssue${h}`,
      category: 'POLICY',
      inputs: ['bondIssue', ...(h === 'B' ? ['bondIssuePF', 'bondIssueHO'] : []), ...(h === 'PF' ? PF_CASH.inputs : [])],
      params: ['bondMixBankShare', ...(nonBank ? ['liquiditySpeed'] : []), ...(h === 'HO' ? ['hoBondCashShare'] : []), ...(h === 'PF' ? PF_CASH.params.filter((p) => p !== 'liquiditySpeed') : [])],
      levers: ['bondBuyers'],
      stocks: [...BOND_STOCKS, ...(nonBank ? [['deposits', h] as [Id, Id]] : [])],
      terms: terms(
        ['sale', 'Their share of new bonds (bond-buyer lever)', 'bond-buyers', sale],
        ...(h === 'B' ? ([['overflow', 'New bonds other buyers could not pay for', 'endogenous-money', (c: Ctx) => overflow(c, 'PF') + overflow(c, 'HO')]] as [string, string, string, (c: Ctx) => number][]) : []),
        ['buyback', 'Bonds bought back, in proportion to holdings', 'deficits-and-money', buyback],
      ),
      ...(nonBank
        ? {
            combine: (t: Record<Id, number>, c: Ctx) => Math.min(t.sale, buyerCash(c, h)) + t.buyback,
            regime: (c: Ctx, _v: number, t: Record<Id, number>) => (t.sale > buyerCash(c, h) ? 'Limited by cash in hand: banks take the rest' : null),
          }
        : {}),
      concepts: ['bond-buyers', h === 'B' || h === 'CB' ? 'endogenous-money' : 'deficits-and-money'],
      explain: {
        what: `New government bonds bought by ${who} (negative: bonds the government buys back from them). ${h === 'B' || h === 'CB' ? 'They pay with newly created money.' : 'They pay with deposits that already exist.'}`,
        rule: `Their share of new bonds under the bond-buyer lever: mix ({bondMixBankShare%} banks, the rest pension funds), or all to banks, the central bank, pension funds or older households.${
          nonBank
            ? ` They buy only what they can pay for from their deposits this month (${h === 'PF' ? 'at most about 63% of what they hold above the cash buffer they keep, and nothing while below it' : '{hoBondCashShare%} of the about 63% of them they can draw'}; the liquidity speed is {liquiditySpeed} a year); banks take the rest.`
            : h === 'B' ? ' Banks also take whatever pension funds or older households cannot pay for.' : ''
        } When the government buys bonds back, it buys from every holder in proportion to what they hold.`,
      },
    };
  }),
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
  description: 'Seven spending channels with their own levers; income tax, VAT, payroll and corporate tax; the debt-tied tax rule (a stabiliser); bond financing and who buys the bonds.',
  requires: ['stabilisers', 'structure', 'labour-and-wages', 'prices', 'central-bank', 'banks', 'households', 'firms'],
  params: pickParams(ALL_PARAMS, [
    'gHealth', 'gEdu', 'gOther', 'gInv', 'wsHealth', 'wsEdu', 'wsOther', 'trOA', 'oaShareY', 'oaShareO', 'trFam', 'famShareY', 'famTaxableShare', 'rr', 'rrShift',
    'vat0', 'vatShift', 'tau0', 'incomeTaxShift', 'phiTau', 'lamTau', 'debtR0', 'css', 'tauF', 'sB', 'bondMaturity', 'rBI0', 'tga', 'treasuryTopUp', 'bondMixBankShare',
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
      concepts: ['consumption-function', 'intergenerational-flows'],
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
      explain: { what: 'Child benefits, parental leave and housing support, paid to young and working-age families. Child and housing benefits are tax-free, so a króna of them reaches families in full; parental-leave pay is taxed.' },
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
      // No flow-level tag: the income-tax rules split the automatic stabiliser (the baseline rate
      // on income that moves with the cycle) from a change in the rate (review TAX-4).
      explain: { what: 'Households pay income tax on wages, taxable benefits and pensions from their deposits; banks pass reserves to the treasury, so deposits shrink.' },
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
    {
      ...leverFor('incomeTax', 'Income-tax rate', 'incomeTaxShift', 'pp', -10, 10, 0.5, 'Changes the average tax rate on wages, benefits and pensions, held where you set it. The debt rule only suggests a value beside the lever.', 'Level shift in the income-tax rate, in percentage points from its baseline, applied in the month it is set and held there until you change it (stabilisers on Manual). This is the whole change: the debt rule only suggests a value beside the lever. Setting it back to 0 removes your shift. It has no effect while stabilisers are Automatic, when the debt rule and your offset set the rate.', ['multiplier', 'consumption-function'], 0.01),
      showWhen: { lever: STABILISERS, equals: MANUAL },
    },
    {
      id: 'incomeTaxOffset',
      label: 'Income tax: your offset to the rule',
      group: 'Policy',
      section: 'Government',
      kind: 'setting',
      unit: 'pp',
      default: 0,
      min: -10,
      max: 10,
      step: 0.5,
      showWhen: { lever: STABILISERS, equals: AUTOMATIC },
      description: 'Sets the income-tax rate this many points above (or below) where the debt rule puts it.',
      definition:
        'Level shift in the income-tax rate, in percentage points on top of the baseline rate and the debt rule’s adjustment, applied in the month it is set and persistent while set (stabilisers on Automatic). The debt rule keeps leaning against government debt underneath it. Setting it back to 0 leaves the rate to the rule. It has no effect while stabilisers are Manual.',
      concepts: ['multiplier', 'fiscal-rule'],
    },
    leverFor('vat', 'VAT rate', 'vatShift', 'pp', -10, 10, 0.5, 'Changes the effective VAT rate on consumer spending; shops pass it into prices over a few months.', 'Level shift in the effective VAT rate, in percentage points, applied at once and persistent while set. VAT is paid at the new rate at once; shops pass it into their prices over a few months (about 40% in the first month, nearly all within six), keeping the difference in their margins meanwhile. Consumer prices follow, and indexed debts are revalued with them. Setting it back to 0 removes the shift (prices drop back the same way).', ['cost-pass-through', 'multiplier'], 0.01),
    leverFor('health', 'Health spending', 'gHealth', '% of GDP', -3, 3, 0.1, 'Real change in public health spending: staff pay and purchases.', 'Level shift in real health spending, % of baseline GDP a year, split between staff and purchases as at baseline; persistent while set. Nominal spending also rises with wages and prices. Setting it back to 0 returns spending to baseline; the debt built up meanwhile remains.', ['multiplier']),
    leverFor('education', 'Education spending', 'gEdu', '% of GDP', -3, 3, 0.1, 'Real change in public education spending.', 'Level shift in real education spending, % of baseline GDP a year, persistent while set, split between staff and purchases as at baseline. Setting it back to 0 returns spending to baseline.', ['multiplier']),
    leverFor('otherServices', 'Other public services', 'gOther', '% of GDP', -3, 3, 0.1, 'Real change in other public services: administration, police, culture, roads.', 'Level shift in real spending on other public services, % of baseline GDP a year, persistent while set, split between staff and purchases as at baseline. Setting it back to 0 returns spending to baseline.', ['multiplier']),
    leverFor('publicInvestment', 'Public investment', 'gInv', '% of GDP', -3, 3, 0.1, 'Real change in public investment bought from domestic firms.', 'Level shift in real public investment, % of baseline GDP a year, persistent while set; nominal spending moves with domestic prices. Setting it back to 0 returns it to baseline.', ['multiplier']),
    leverFor('oldAgeTransfers', 'Old-age and disability transfers', 'trOA', '% of GDP', -2, 2, 0.1, 'Real change in public pensions and disability benefits (mostly to older people).', 'Level shift in real old-age and disability transfers, % of baseline GDP a year, indexed to the CPI and split by age as at baseline; persistent while set. Setting it back to 0 ends it.', ['multiplier', 'consumption-function', 'intergenerational-flows']),
    leverFor('familyBenefits', 'Family and housing benefits', 'trFam', '% of GDP', -2, 2, 0.1, 'Real change in child, parental-leave and housing benefits (young and working age).', 'Level shift in real family and housing benefits, % of baseline GDP a year, indexed to the CPI and split by age as at baseline; persistent while set. Setting it back to 0 ends it.', ['multiplier', 'consumption-function', 'borrowers-and-savers']),
    leverFor('unemploymentBenefits', 'Unemployment-benefit rate', 'rrShift', 'pp of wage', -30, 30, 5, 'Changes the replacement rate paid automatically to the unemployed.', 'Level shift in the replacement rate, in percentage points of the average wage, applied to everyone unemployed at once and persistent while set. Setting it back to 0 ends it.', ['automatic-stabilisers'], 0.01),
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
        'Choice, persistent while set: every new bond sold from then on goes to the chosen buyer, or 40/60 to banks and pension funds in the mix. Pension funds and older households buy only what their deposits can pay for that month; banks take the rest. When the budget is in surplus the government buys bonds back from every holder in proportion to what they hold, whatever the choice. Bonds already sold stay where they are, though pension funds and older households slowly sell surplus bonds to banks to restore their portfolio shares. New bonds pay the key rate plus its spread whoever buys, so the choice changes money and who receives the interest, not interest rates. Non-residents are not an option: they buy and sell bonds with banks on their own, through the carry trade.',
      concepts: ['bond-buyers', 'deficits-and-money', 'endogenous-money'],
    },
  ],
  stabilisers: [
    {
      id: 'debtRule',
      label: 'Debt rule on income tax',
      lever: 'incomeTax',
      offset: 'incomeTaxOffset',
      suggestion: 'taxRuleSuggestion',
      shadow: ['taxRuleAdjustment'],
      // Half the lever's half-point step: it calls exactly when "Apply" would move the lever.
      threshold: 0.25,
      description:
        'A slow rule that leans the income-tax rate against government debt: about 2.5 points more tax for ten points more debt (as a share of GDP), reached gradually. On Automatic it sets the income-tax rate, and your offset lever adds to or subtracts from it; on Manual it suggests a value for the income-tax lever, which turns red when you are more than a quarter point away, so that applying it would move the lever a half-point step.',
      concepts: ['fiscal-rule'],
      feed: { raise: 'The debt rule would raise income tax by {change} pp', lower: 'The debt rule would cut income tax by {change} pp', indicator: 'incomeTaxRate' },
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
      id: 'buyback-by-holdings',
      label: 'In a surplus the government buys bonds back from every holder in proportion to its holdings, never more than there are; the rest of the surplus stays in the treasury account',
      run: (e) => {
        const ke = e as unknown as { stock(i: string, p: string): number };
        e.setLever('bondBuyers', 2); // the central bank buys new bonds, but buybacks come from everyone
        e.setLever('incomeTax', 10);
        const held = BUYERS.map(([h]) => ke.stock('govBonds', h)); // at the start of the month
        e.step(1);
        const all = held.reduce((a, b) => a + b, 0);
        const shares = BUYERS.map(([h], k) => Math.abs(e.value(`bondIssue${h}`) / e.value('bondIssue') - held[k] / all));
        let lowest = Infinity,
          capped = 0;
        for (let t = 1; t < 240; t++) {
          e.step(1);
          lowest = Math.min(lowest, ...HOLDERS.map(([h]) => ke.stock('govBonds', h)));
          if (e.influences('bondIssue').regime) capped++;
        }
        const tga = ke.stock('treasuryAccount', 'G');
        return {
          pass: Math.max(...shares) < 1e-12 && lowest >= -1e-9 && ke.stock('govBonds', 'G') >= -1e-9 && capped > 0 && tga > 5,
          detail: `buyback shares differ from holding shares by at most ${Math.max(...shares).toExponential(1)}; lowest holding ${lowest.toExponential(2)}; buyback capped for ${capped} months; treasury account ${tga.toFixed(2)}% of GDP`,
        };
      },
    },
    {
      id: 'non-bank-buyers-pay-with-cash-they-have',
      label: 'When pension funds or older households are the sole buyers of a very large deficit, they buy only what their deposits pay for and banks take the rest',
      run: (e) => {
        const ke = e as unknown as { stock(i: string, p: string): number };
        const out: string[] = [];
        let pass = true;
        for (const [choice, who] of [
          [3, 'PF'],
          [4, 'HO'],
        ] as const) {
          const f = e.fork() as unknown as typeof e & typeof ke;
          f.setLever('bondBuyers', choice);
          // A deficit of about 16% of GDP in the first year, growing. Without the tax cut (about 9%)
          // pension funds pay for all of it for 20 years by selling foreign assets and bank bonds.
          for (const l of ['health', 'education', 'otherServices', 'publicInvestment']) f.setLever(l, 3);
          f.setLever('incomeTax', -10);
          let lowest = Infinity,
            banksTook = 0;
          for (let t = 0; t < 240; t++) {
            f.step(1);
            lowest = Math.min(lowest, f.stock('deposits', who));
            if (f.value('bondIssueB') > 0) banksTook++;
          }
          pass &&= lowest >= 0 && banksTook > 0;
          out.push(`${who}: lowest deposits ${lowest.toFixed(3)}, banks took the rest in ${banksTook} months`);
        }
        return { pass, detail: out.join('; ') };
      },
    },
    {
      id: 'family-benefits-mostly-tax-free',
      label: 'Only the taxable share of family benefits is income-taxed: a point more costs the budget about 0.85 of a point at once, not 1 − the tax rate',
      run: (e) => {
        const f = e.fork();
        f.setLever('familyBenefits', 1);
        f.step(1);
        const share = f.influences('grossIncomeY').params.find((p) => p.id === 'famTaxableShare')!.value;
        const dFam = f.value('familyBenefitsY') - f.baseline('familyBenefitsY');
        const taxed = f.influences('grossIncomeY').terms.find((t) => t.id === 'family')!.change;
        const untaxed = f.influences('netLabourIncomeY').terms.find((t) => t.id === 'familyTaxFree')!.change;
        const balance = f.value('govBalance') - f.baseline('govBalance');
        const pass = Math.abs(taxed - share * dFam) < 1e-12 && Math.abs(untaxed - (1 - share) * dFam) < 1e-12 && share > 0.3 && share < 0.45 && balance < -0.8 && balance > -0.9;
        return { pass, detail: `taxable share ${share.toFixed(3)}; young: +${dFam.toFixed(4)} benefits, +${taxed.toFixed(4)} taxable, +${untaxed.toFixed(4)} tax-free; government balance ${balance.toFixed(3)} (% of GDP) in month 1` };
      },
    },
    {
      id: 'bonds-reprice-as-they-mature',
      label: 'A key rate 1 point higher reaches the average bond coupon as bonds mature and new ones are sold, not at once (review MON-1)',
      run: (e) => {
        const held = e.model.levers.find((l) => l.id === 'keyRateFixed')!.default + 1;
        const bill = (f: ReturnType<typeof e.fork>) => HOLDERS.reduce((s, [h]) => s + f.value(`bondInterest${h}`) - f.baseline(`bondInterest${h}`), 0);
        const path = (extraSpending: number) => {
          const f = e.fork();
          f.setLever('keyRateFixed', held);
          if (extraSpending) f.setLever('otherServices', extraSpending);
          const out: { rate: number; bill: number }[] = [];
          for (const months of [1, 11, 108]) {
            f.step(months);
            out.push({ rate: 100 * (f.value('bondRate') - f.baseline('bondRate')), bill: bill(f) });
          }
          return out;
        };
        const [m1, m12, m120] = path(0);
        const deficit = path(5)[1];
        const pass = m1.rate > 0 && m1.rate < 0.03 && m12.rate > 0.15 && m12.rate < 0.25 && m120.rate > 0.85 && deficit.rate > m12.rate && m1.bill < 0.02 && m12.bill > 0.05 && m12.bill < 0.15;
        return {
          pass,
          detail: `bond rate +${m1.rate.toFixed(3)} pp in month 1, +${m12.rate.toFixed(3)} at month 12 (+${deficit.rate.toFixed(3)} with spending 5% of GDP higher), +${m120.rate.toFixed(3)} at month 120; interest bill +${m1.bill.toFixed(3)} and +${m12.bill.toFixed(3)} % of GDP`,
        };
      },
    },
    {
      id: 'bond-buyers-leave-the-rate',
      label: 'Who buys new bonds changes money, not the bond rate; non-residents are not an option (they trade with banks)',
      run: (e) => {
        const rate = (choice: number) => {
          const f = e.fork();
          f.setLever('bondBuyers', choice);
          f.setLever('otherServices', 1);
          f.step(12);
          return f.value('bondRate');
        };
        const rates = [0, 1, 2, 3, 4].map(rate);
        const options = e.model.levers.find((l) => l.id === 'bondBuyers')!.options!.map((o) => o.label);
        const pass = Math.max(...rates) - Math.min(...rates) < 1e-15 && !options.some((o) => /non-resident|foreign/i.test(o));
        return { pass, detail: `bond rate after 12 months for each choice: ${rates.map((r) => r.toFixed(6)).join(', ')}; options: ${options.join(', ')}` };
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
