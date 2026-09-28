/**
 * Iceland Inc.: domestic-market firms and exporters (v1 equations E21, E31, E33, E41 and E48).
 *
 * Firms invest toward a level set by recent profits, the real loan rate and (for domestic
 * firms) how busy their capacity is, with a planning lag. Profit is sales minus imports, labour
 * costs and net interest. Firms keep a share of after-tax profit to pay for investment (more when
 * they are indebted) and pay out the rest; part of exporters' dividends goes to foreign owners.
 * Firms borrow from banks whatever keeps their deposits at their target: that is where new
 * business credit, and the money it creates, comes from.
 */
import type { Ctx, ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { pickParams, terms, lastMonth } from '../util.ts';

const FIRMS = [
  ['FD', 'domestic firms'],
  ['FX', 'exporters'],
] as const;

/** Labour cost per unit of employment: wage + employer contribution + payroll tax. */
const labourCost = (c: Ctx, j: 'FD' | 'FX') => (1 + c.p('cEr') + c.p('css')) * c.v('wage') * c.v(`employment${j}`);

const DIV_FD = [
  ['HY', 'divFDY'],
  ['HW', 'divFDW'],
  ['HO', 'divFDO'],
  ['PF', ''],
] as const;
const DIV_FX = [
  ['HW', 'HW'],
  ['HO', 'HO'],
  ['PF', 'PF'],
  ['W', 'W'],
] as const;
const WHO: Record<string, string> = { HY: 'young households', HW: 'working-age households', HO: 'older households', PF: 'pension funds', W: 'foreign owners' };

/** Exporters' payout shares: foreign owners divFXW, the rest split working age / older / pension funds. */
function fxShare(c: Ctx, to: 'HW' | 'HO' | 'PF' | 'W'): number {
  const f = c.p('divFXW');
  if (to === 'W') return f;
  if (to === 'HW') return (1 - f) * c.p('divFXdomW');
  if (to === 'HO') return (1 - f) * c.p('divFXdomO');
  return (1 - f) * (1 - c.p('divFXdomW') - c.p('divFXdomO'));
}

const dividendLegs: RuleDef[] = [
  ...DIV_FD.map(
    ([to, share]): RuleDef => ({
      id: `dividendsFD_${to}`,
      target: `dividendsFD_${to}`,
      category: 'BEHAVIOUR',
      inputs: ['dividendsFD'],
      params: share ? [share] : ['divFDY', 'divFDW', 'divFDO'],
      compute: (c) => (share ? c.p(share) : 1 - c.p('divFDY') - c.p('divFDW') - c.p('divFDO')) * c.v('dividendsFD'),
      explain: {
        what: `Dividends and owners’ income domestic firms pay ${WHO[to]}.`,
        rule: share ? `Their share {${share}%} of domestic firms’ distributed profit.` : 'What is left after the young ({divFDY%}), working age ({divFDW%}) and older households ({divFDO%}).',
      },
    }),
  ),
  ...DIV_FX.map(
    ([to]): RuleDef => ({
      id: `dividendsFX_${to}`,
      target: `dividendsFX_${to}`,
      category: 'BEHAVIOUR',
      inputs: ['dividendsFX'],
      params: ['divFXW', 'divFXdomW', 'divFXdomO'],
      compute: (c) => fxShare(c, to) * c.v('dividendsFX'),
      explain: {
        what: `Dividends exporters pay ${WHO[to]}.`,
        rule:
          to === 'W'
            ? 'Foreign owners (the aluminium smelters’ parents and others) get {divFXW%} of exporters’ distributed profit.'
            : 'After foreign owners’ share {divFXW%}, the rest is split working age {divFXdomW}, older households {divFXdomO}, pension funds the remainder.',
      },
    }),
  ),
];

function investmentRule(j: 'FD' | 'FX'): RuleDef {
  const i0 = j === 'FD' ? 'iFD0' : 'iFX0';
  const pi0 = j === 'FD' ? 'piFD0' : 'piFX0';
  const accel = j === 'FD';
  return {
    id: `investment${j}`,
    target: `investment${j}`,
    category: 'BEHAVIOUR',
    label: accel ? 'Investment with a planning lag' : 'Exporters’ investment',
    inputs: ['loanRate'],
    lagInputs: [`profits${j}Smoothed`, 'expectedInflation', ...(accel ? ['output'] : [])],
    params: [i0, pi0, 'betaPi', 'betaRI', 'rl0', ...(accel ? ['betaU', 'potentialOutput'] : [])],
    adjust: { speed: 'lamInv', form: 'exponential' },
    terms: terms(
      ['normal', 'Normal investment', undefined, (c) => c.p(i0)],
      ['profits', 'Recent profits', 'investment-accelerator', (c) => c.p(i0) * c.p('betaPi') * (lastMonth(c, `profits${j}Smoothed`) / c.p(pi0) - 1)],
      ['realRate', 'Cost of borrowing', 'policy-lags', (c) => -c.p(i0) * c.p('betaRI') * (c.v('loanRate') - lastMonth(c, 'expectedInflation') - c.p('rl0'))],
      ...(accel ? ([['capacity', 'Busy capacity', 'investment-accelerator', (c: Ctx) => c.p(i0) * c.p('betaU') * (lastMonth(c, 'output') / c.p('potentialOutput') - 1)]] as [string, string, string, (c: Ctx) => number][]) : []),
    ),
    concepts: ['investment-accelerator', 'policy-lags'],
    explain: {
      what: `Investment by ${j === 'FD' ? 'domestic firms' : 'exporters'} in machines and buildings, at baseline prices.`,
      rule: `Target = {${i0}} × [1 + {betaPi} × (smoothed real profits ÷ baseline − 1) − {betaRI} × (real loan rate − baseline)${accel ? ' + {betaU} × output gap' : ''}]. Plans turn into spending at speed {lamInv} a year, so the peak effect of a rate change comes after about a year.`,
    },
  };
}

function profitsRule(j: 'FD' | 'FX'): RuleDef {
  if (j === 'FD')
    return {
      id: 'profitsFD',
      target: 'profitsFD',
      category: 'IDENTITY',
      inputs: ['consumption', 'vat', 'domesticPrice', 'publicPurchasesReal', 'investmentReal', 'exporterInputs', 'importsConsumer', 'importsInputs', 'importsEquipment', 'importsPublic', 'wage', 'employmentFD', 'loanInterestFD', 'depositInterestFD'],
      params: ['cEr', 'css'],
      terms: terms(
        ['consumers', 'Sales to households, after VAT', 'consumption-function', (c) => c.v('consumption') - c.v('vat')],
        ['government', 'Sales to government for public services', 'multiplier', (c) => c.v('domesticPrice') * c.v('publicPurchasesReal')],
        ['investment', 'Sales of investment goods (business and public)', 'investment-accelerator', (c) => c.v('domesticPrice') * c.v('investmentReal')],
        ['exporters', 'Sales to exporters', 'export-sectors', (c) => c.v('exporterInputs')],
        ['imports', 'Imports', 'import-leakage', (c) => -(c.v('importsConsumer') + c.v('importsInputs') + c.v('importsEquipment') + c.v('importsPublic'))],
        ['labour', 'Labour costs (wages, pension contributions, payroll tax)', 'profit-squeeze', (c) => -labourCost(c, 'FD')],
        ['interest', 'Net interest', 'interest-distribution', (c) => c.v('depositInterestFD') - c.v('loanInterestFD')],
      ),
      concepts: ['profit-squeeze'],
      explain: {
        what: 'Domestic firms’ gross profit (before corporate tax), including owners’ and self-employed income.',
        rule: 'Profit = sales to households (after VAT) + purchases by public services + investment goods (their own, exporters’ and public investment) + inputs sold to exporters − imports − labour costs (wages × (1 + {cEr%} + {css%})) − interest on loans + interest on deposits.',
      },
    };
  return {
    id: 'profitsFX',
    target: 'profitsFX',
    category: 'IDENTITY',
    inputs: ['exportValue', 'importsExporters', 'exporterInputs', 'wage', 'employmentFX', 'loanInterestFX', 'depositInterestFX'],
    params: ['cEr', 'css'],
    terms: terms(
      ['exports', 'Export revenue', 'export-sectors', (c) => c.v('exportValue')],
      ['importedInputs', 'Imported inputs', 'import-leakage', (c) => -c.v('importsExporters')],
      ['domesticInputs', 'Domestic inputs', undefined, (c) => -c.v('exporterInputs')],
      ['labour', 'Labour costs', 'profit-squeeze', (c) => -labourCost(c, 'FX')],
      ['interest', 'Net interest', 'interest-distribution', (c) => c.v('depositInterestFX') - c.v('loanInterestFX')],
    ),
    concepts: ['profit-squeeze', 'exchange-rate-pass-through'],
    explain: {
      what: 'Exporters’ gross profit, before corporate tax.',
      rule: 'Profit = export revenue − imported and domestic inputs − labour costs − net interest. A weaker króna lifts fish and aluminium revenue at once, while costs follow slowly.',
    },
  };
}

function firmRules(j: 'FD' | 'FX'): RuleDef[] {
  const who = j === 'FD' ? 'domestic firms' : 'exporters';
  const rho0 = j === 'FD' ? 'rhoFD0' : 'rhoFX0';
  const l0 = j === 'FD' ? 'lFD0' : 'lFX0';
  const dep0 = j === 'FD' ? 'depFD0' : 'depFX0';
  return [
    investmentRule(j),
    {
      id: `investmentPurchase${j}`,
      target: `investmentPurchase${j}`,
      category: 'IDENTITY',
      inputs: [`investment${j}`, 'domesticPrice'],
      compute: (c) => c.v(`investment${j}`) * c.v('domesticPrice'),
      explain: { what: `What ${who} spend on machines and buildings, bought from domestic firms.`, rule: 'Spending = real investment × domestic prices.' },
    },
    {
      id: `depreciation${j}`,
      target: `depreciation${j}`,
      category: 'CONTRACT',
      params: ['depreciationRate'],
      stocks: [['capital', j]],
      compute: (c) => c.p('depreciationRate') * c.stock('capital', j),
      concepts: ['accrual-vs-cash'],
      explain: { what: `Wear and tear on ${who}’ machines and buildings.`, rule: 'Depreciation = {depreciationRate%} of their capital a year. No money moves; the capital is simply worth less.' },
    },
    profitsRule(j),
    {
      id: `profits${j}Smoothed`,
      target: `profits${j}Smoothed`,
      category: 'BEHAVIOUR',
      inputs: [`profits${j}`, 'cpi'],
      params: ['tauF'],
      adjust: { speed: 'lamPi', form: 'exponential' },
      terms: terms(['afterTax', 'Real after-tax profit this month', 'profit-squeeze', (c) => ((1 - c.p('tauF')) * c.v(`profits${j}`)) / c.v('cpi')]),
      concepts: ['gradual-adjustment'],
      explain: { what: `${j === 'FD' ? 'Domestic firms’' : 'Exporters’'} real after-tax profit as investors see it: smoothed over recent months.`, rule: 'Moves toward (1 − {tauF%}) × profit ÷ CPI at speed {lamPi} a year.' },
    },
    {
      id: `retention${j}`,
      target: `retention${j}`,
      category: 'BEHAVIOUR',
      inputs: ['nominalGDP'],
      params: [rho0, 'rhoL', l0],
      stocks: [['businessLoans', j]],
      terms: terms(
        ['normal', 'Normal retention', undefined, (c) => c.p(rho0)],
        ['debt', 'Debt above normal', 'minsky-instability', (c) => c.p('rhoL') * (c.stock('businessLoans', j) / c.v('nominalGDP') - c.p(l0))],
      ),
      explain: {
        what: `Share of after-tax profit ${who} keep rather than pay out.`,
        rule: `Retention = {${rho0}} + {rhoL} × (their debt ÷ GDP − its baseline {${l0}}): firms keep more when they owe more.`,
      },
    },
    {
      id: `dividends${j}`,
      target: `dividends${j}`,
      category: 'BEHAVIOUR',
      inputs: [`profits${j}`, `retention${j}`],
      params: ['tauF'],
      compute: (c) => (1 - c.v(`retention${j}`)) * (1 - c.p('tauF')) * c.v(`profits${j}`),
      explain: { what: `Profit ${who} pay out to owners (dividends, and owners’ and self-employed income).`, rule: 'Dividends = (1 − retention) × (1 − {tauF%}) × profit.' },
    },
    {
      id: `borrowing${j}`,
      target: `borrowing${j}`,
      category: 'BEHAVIOUR',
      label: 'Firms’ budget constraint',
      inputs: [`investmentPurchase${j}`, `corporateTax${j}`, `dividends${j}`, `profits${j}`, 'nominalGDP'],
      params: [dep0, 'firmCashSpeed'],
      stocks: [['deposits', j]],
      terms: terms(
        ['investment', 'Investment', 'investment-accelerator', (c) => c.v(`investmentPurchase${j}`)],
        ['tax', 'Corporate tax', undefined, (c) => c.v(`corporateTax${j}`)],
        ['dividends', 'Dividends', undefined, (c) => c.v(`dividends${j}`)],
        ['profit', 'Profit', 'profit-squeeze', (c) => -c.v(`profits${j}`)],
        ['cash', 'Restore target deposits', 'endogenous-money', (c) => c.p('firmCashSpeed') * (c.p(dep0) * c.v('nominalGDP') - c.stock('deposits', j))],
      ),
      concepts: ['endogenous-money'],
      explain: {
        what: `New bank loans ${who} take (negative: repay). Each loan creates a deposit; each repayment destroys one.`,
        rule: `Borrowing = investment + corporate tax + dividends − profit (the cash they are short of this month) + {firmCashSpeed} × a year of any shortfall of deposits below {${dep0}} of GDP. At {firmCashSpeed} a year the gap closes within about a month.`,
      },
    },
  ];
}

const vars: VarDef[] = [
  ...FIRMS.flatMap(([j, who]): VarDef[] => [
    { id: `investment${j}`, label: `Investment, ${who} (real)`, unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base(`investment${j}`) },
    { id: `investmentPurchase${j}`, label: `Investment spending, ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: `depreciation${j}`, label: `Depreciation, ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
    { id: `profits${j}`, label: `Profit, ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`profits${j}`) },
    { id: `profits${j}Smoothed`, label: `Real after-tax profit, ${who} (smoothed)`, unit: '% of GDP/yr', kind: 'flow', scale: 'real', initial: base(`profits${j}Smoothed`) },
    { id: `retention${j}`, label: `Retention ratio, ${who}`, unit: 'fraction', kind: 'ratio', scale: 'none', initial: base(`retention${j}`) },
    { id: `dividends${j}`, label: `Dividends, ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`dividends${j}`) },
    { id: `borrowing${j}`, label: `Net borrowing, ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
  ]),
  { id: 'investmentReal', label: 'Investment (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('investmentReal'), description: 'Business and public investment at baseline prices.' },
  { id: 'output', label: 'Output (real GDP)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('output'), description: 'Everything produced in a year, at baseline prices.' },
  { id: 'nominalGDP', label: 'GDP (nominal)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('nominalGDP'), description: 'Everything produced in a year, at today’s prices (100 at baseline).' },
  ...DIV_FD.map(([to]): VarDef => ({ id: `dividendsFD_${to}`, label: `Dividends, domestic firms → ${WHO[to]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' })),
  ...DIV_FX.map(([to]): VarDef => ({ id: `dividendsFX_${to}`, label: `Dividends, exporters → ${WHO[to]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' })),
];

export const firms: ModuleDef = {
  id: 'firms',
  label: 'Firms and output',
  description: 'Investment with a planning lag, profits, retention and dividends (including to foreign owners), capital and depreciation, business borrowing, and output as the sum of demand.',
  requires: ['structure', 'labour-and-wages', 'prices', 'banks', 'external', 'government', 'households'],
  params: pickParams(ALL_PARAMS, [
    'iFD0', 'iFX0', 'betaPi', 'betaRI', 'betaU', 'lamInv', 'lamPi', 'rhoL', 'firmCashSpeed', 'depreciationRate', 'cEr',
    'rhoFD0', 'rhoFX0', 'piFD0', 'piFX0', 'rl0', 'lFD0', 'lFX0', 'depFD0', 'depFX0',
    'divFDY', 'divFDW', 'divFDO', 'divFXW', 'divFXdomW', 'divFXdomO', 'loanFD', 'loanFX', 'depFX', 'pfEqFDshare', 'fdiTarget',
  ]),
  vars,
  rules: [
    ...firmRules('FD'),
    ...firmRules('FX'),
    {
      id: 'investmentReal',
      target: 'investmentReal',
      category: 'IDENTITY',
      inputs: ['investmentFD', 'investmentFX'],
      params: ['gInv'],
      terms: terms(
        ['domestic', 'Domestic firms', 'investment-accelerator', (c) => c.v('investmentFD')],
        ['exporters', 'Exporters', 'investment-accelerator', (c) => c.v('investmentFX')],
        ['public', 'Public investment', undefined, (c) => c.p('gInv')],
      ),
      explain: { what: 'All investment, business and public, at baseline prices.', rule: 'Investment = domestic firms + exporters + public investment ({gInv}% of GDP plus the lever).' },
    },
    ...dividendLegs,
    {
      id: 'output',
      target: 'output',
      category: 'IDENTITY',
      label: 'Output follows demand',
      inputs: ['realConsumption', 'publicServicesReal', 'investmentReal', 'exportVolume', 'importVolume'],
      terms: terms(
        ['consumption', 'Household consumption', 'consumption-function', (c) => c.v('realConsumption')],
        ['government', 'Public services', 'multiplier', (c) => c.v('publicServicesReal')],
        ['investment', 'Investment', 'investment-accelerator', (c) => c.v('investmentReal')],
        ['exports', 'Exports', 'export-sectors', (c) => c.v('exportVolume')],
        ['imports', 'Imports', 'import-leakage', (c) => -c.v('importVolume')],
      ),
      concepts: ['multiplier', 'capacity-utilisation'],
      explain: {
        what: 'Everything produced in Iceland in a year, at baseline prices (real GDP).',
        rule: 'Output = consumption + public services + investment + exports − imports, all at baseline prices. Output follows demand; pressure on capacity shows up in jobs, prices and the key rate.',
      },
    },
    {
      id: 'nominalGDP',
      target: 'nominalGDP',
      category: 'IDENTITY',
      inputs: ['consumption', 'wage', 'publicEmployment', 'domesticPrice', 'publicPurchasesReal', 'investmentReal', 'exportValue', 'importsConsumer', 'importsInputs', 'importsEquipment', 'importsPublic', 'importsExporters'],
      params: ['cEr'],
      terms: terms(
        ['consumption', 'Household consumption', 'consumption-function', (c) => c.v('consumption')],
        ['government', 'Public services (staff costs and purchases)', 'multiplier', (c) => (1 + c.p('cEr')) * c.v('wage') * c.v('publicEmployment') + c.v('domesticPrice') * c.v('publicPurchasesReal')],
        ['investment', 'Investment', 'investment-accelerator', (c) => c.v('domesticPrice') * c.v('investmentReal')],
        ['exports', 'Exports', 'export-sectors', (c) => c.v('exportValue')],
        ['imports', 'Imports', 'import-leakage', (c) => -(c.v('importsConsumer') + c.v('importsInputs') + c.v('importsEquipment') + c.v('importsPublic') + c.v('importsExporters'))],
      ),
      concepts: ['sectoral-balances'],
      explain: {
        what: 'Everything produced in a year at today’s prices (nominal GDP); 100 at baseline, the unit of the model.',
        rule: 'GDP = consumption + public services (staff pay with employer contributions, plus purchases) + investment + exports − imports. It is not imposed at 100: the baseline gets there because every income matches a spending.',
      },
    },
  ],
  flows: [
    {
      id: 'investment',
      label: 'Business investment',
      kind: 'cash',
      account: 'capital',
      posting: { type: 'purchase', realAsset: 'capital' },
      legs: [
        { from: 'FD', to: 'FD', amount: 'investmentPurchaseFD' },
        { from: 'FX', to: 'FD', amount: 'investmentPurchaseFX' },
      ],
      concepts: ['investment-accelerator'],
      explain: { what: 'Firms buy machines and buildings from domestic firms. Domestic firms’ own purchases stay inside the sector; exporters pay domestic firms.' },
    },
    {
      id: 'depreciation',
      label: 'Depreciation',
      kind: 'writeoff',
      account: 'other',
      posting: { type: 'writeoff', instrument: 'capital' },
      legs: [
        { from: 'FD', to: 'FD', amount: 'depreciationFD' },
        { from: 'FX', to: 'FX', amount: 'depreciationFX' },
      ],
      concepts: ['accrual-vs-cash', 'net-worth'],
      explain: { what: 'Machines and buildings wear out: firms’ capital, and their net worth, fall without any payment.' },
    },
    {
      id: 'dividends',
      label: 'Dividends and owners’ income',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [...DIV_FD.map(([to]) => ({ from: 'FD', to, amount: `dividendsFD_${to}` })), ...DIV_FX.map(([to]) => ({ from: 'FX', to, amount: `dividendsFX_${to}` }))],
      concepts: ['interest-distribution'],
      explain: { what: 'Firms pay out profit to households (including owners’ and self-employed income), pension funds and foreign owners.' },
    },
    {
      id: 'businessBorrowing',
      label: 'Business borrowing (net)',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'issue', instrument: 'businessLoans' },
      legs: [
        { from: 'B', to: 'FD', amount: 'borrowingFD' },
        { from: 'B', to: 'FX', amount: 'borrowingFX' },
      ],
      concepts: ['endogenous-money', 'money-destruction'],
      explain: { what: 'Banks lend to firms by crediting their deposits (new money); when firms repay, the deposits are cancelled.' },
    },
  ],
  tests: [
    {
      id: 'gdp-identity-not-imposed',
      label: 'At baseline C + G + I + X − IM = 100 without being imposed (profits come from the income side)',
      run: (e) => {
        const gap = e.baseline('nominalGDP') - 100;
        const real = e.baseline('output') - 100;
        return { pass: Math.abs(gap) < 1e-9 && Math.abs(real) < 1e-9, detail: `nominal GDP − 100 = ${gap.toExponential(2)}, real output − 100 = ${real.toExponential(2)}` };
      },
    },
    {
      id: 'retained-profit-pays-for-investment',
      label: 'At baseline firms’ retained profit exactly pays for their investment, so they borrow nothing',
      run: (e) => {
        const b = ['borrowingFD', 'borrowingFX'].map((id) => e.baseline(id));
        return { pass: b.every((x) => Math.abs(x) < 1e-9), detail: `net borrowing FD ${b[0].toExponential(2)}, FX ${b[1].toExponential(2)}` };
      },
    },
    {
      id: 'firms-keep-target-deposits',
      label: 'After a shock firms borrow so that their deposits stay at their target share of GDP',
      run: (e) => {
        e.fire('wageSettlement', 10);
        e.step(6);
        const ke = e as unknown as { stock(i: string, p: string): number };
        const want = e.influences('borrowingFD').params.find((p) => p.id === 'depFD0')!.value * e.value('nominalGDP');
        const got = ke.stock('deposits', 'FD');
        return { pass: Math.abs(got - want) < 1e-6 * Math.abs(want) + 1e-3, detail: `deposits ${got.toFixed(4)} vs target ${want.toFixed(4)} (% of GDP)` };
      },
    },
  ],
};
