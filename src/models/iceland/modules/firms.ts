/**
 * Iceland Inc.: firms by sector (v1 equations E21, E31, E33, E41 and E48, split by decision 0003).
 *
 * Six sectors: construction and retail and services sell at home; fisheries, aluminium, tourism
 * and other exporters sell abroad. Each sector's output follows its own demand: builders sell all
 * investment goods and home repairs; retail and services sell what households and public services
 * buy and supply builders and exporters; each exporter sells its own export line. Profit is sales
 * minus imports, domestic inputs, labour costs and net interest, so a wage settlement squeezes the
 * labour-intensive sectors hardest.
 *
 * Firms invest toward a level set by recent profits, the real loan rate and (at home) how busy
 * capacity is, with a planning lag. Domestically owned firms keep a share of after-tax profit to
 * pay for investment (more when they are indebted) and pay out the rest. The aluminium smelters are
 * wholly foreign-owned: their parents take whatever cash the smelters do not reinvest, so a windfall
 * from dearer aluminium leaves the country. Firms borrow from banks whatever keeps their deposits at
 * target: that is where new business credit, and the money it creates, comes from.
 */
import type { Ctx, Id, ModuleDef, RuleDef, VarDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { EXPORT_OF, FIRMS, FIRM_NAME, isExporter, lastMonth, pickParams, sum, terms, type Firm } from '../util.ts';

/** Labour cost of a sector: wage × employment × (1 + employer contribution + payroll tax). Ids are
 *  built once per sector, not on every evaluation: several of these rules sit in the income–spending
 *  block, which is solved about ten times a month. */
const EMP = Object.fromEntries(FIRMS.map((j) => [j, `employment${j}`])) as Record<Firm, Id>;
const labourCost = (c: Ctx, j: Firm) => (1 + c.p('cEr') + c.p('css')) * c.v('wage') * c.v(EMP[j]);

/* ----------------------------------------------------------------- owners */

type Owner = 'HY' | 'HW' | 'HO' | 'PF' | 'W';
/** Who receives each sector's dividends. Exported so households and pension funds read the same list. */
export const OWNERS: Record<Firm, Owner[]> = {
  FC: ['HY', 'HW', 'HO', 'PF'],
  FR: ['HY', 'HW', 'HO', 'PF'],
  XF: ['HW', 'HO', 'PF'],
  XA: ['W'],
  XT: ['HW', 'HO', 'PF', 'W'],
  XO: ['HW', 'HO', 'PF', 'W'],
};
/** Dividend legs paid to an owner, e.g. ['dividendsFC_HW', 'dividendsFR_HW', …]. */
export const dividendsTo = (to: Owner): Id[] => FIRMS.filter((j) => OWNERS[j].includes(to)).map((j) => `dividends${j}_${to}`);

const WHO: Record<Owner, string> = { HY: 'young households', HW: 'working-age households', HO: 'older households', PF: 'pension funds', W: 'foreign owners' };
/** Foreign owners' share of an exporter's dividends (the smelters' goes through its own rule). */
const FOREIGN: Partial<Record<Firm, Id>> = { XT: 'divXTW', XO: 'divXOW' };

/** Share of sector j's dividends paid to an owner, and the parameters it reads. */
function ownerShare(j: Firm, to: Owner): { params: Id[]; share: (c: Ctx) => number; rule: string } {
  if (!isExporter(j)) {
    if (to === 'PF') return { params: ['divFDY', 'divFDW', 'divFDO'], share: (c) => 1 - c.p('divFDY') - c.p('divFDW') - c.p('divFDO'), rule: 'What is left after the young ({divFDY%}), working age ({divFDW%}) and older households ({divFDO%}).' };
    const k = { HY: 'divFDY', HW: 'divFDW', HO: 'divFDO' }[to as 'HY' | 'HW' | 'HO'];
    return { params: [k], share: (c) => c.p(k), rule: `Their share {${k}%} of distributed profit, the same for both domestic sectors.` };
  }
  if (j === 'XA') return { params: [], share: () => 1, rule: 'All of it: the three smelters are wholly owned by Rio Tinto, Alcoa and Century.' };
  const f = FOREIGN[j];
  const foreign = (c: Ctx) => (f ? c.p(f) : 0);
  const fp = f ? [f] : [];
  if (to === 'W') return { params: fp, share: foreign, rule: `Foreign owners’ share {${f}%}.` };
  const dom = f ? `After foreign owners’ share {${f}%}, the rest` : 'Fishing firms are owned in Iceland (the law caps foreign ownership), so all of it';
  const rule = `${dom} is split: working age {divFXdomW}, older households {divFXdomO}, pension funds the remainder.`;
  if (to === 'HW') return { params: [...fp, 'divFXdomW', 'divFXdomO'], share: (c) => (1 - foreign(c)) * c.p('divFXdomW'), rule };
  if (to === 'HO') return { params: [...fp, 'divFXdomW', 'divFXdomO'], share: (c) => (1 - foreign(c)) * c.p('divFXdomO'), rule };
  return { params: [...fp, 'divFXdomW', 'divFXdomO'], share: (c) => (1 - foreign(c)) * (1 - c.p('divFXdomW') - c.p('divFXdomO')), rule };
}

const dividendLegs: RuleDef[] = FIRMS.flatMap((j) =>
  OWNERS[j].map((to): RuleDef => {
    const o = ownerShare(j, to);
    const div = `dividends${j}`;
    return {
      id: `dividends${j}_${to}`,
      target: `dividends${j}_${to}`,
      category: j === 'XA' ? 'IDENTITY' : 'BEHAVIOUR',
      inputs: [div],
      params: o.params,
      compute: (c) => o.share(c) * c.v(div),
      ...(to === 'W' ? { concepts: ['current-account'] } : {}),
      explain: { what: `Dividends and owners’ income ${FIRM_NAME[j]} pay ${WHO[to]}.`, rule: o.rule },
    };
  }),
);

/* ------------------------------------------------------------- behaviour */

type T = [string, string, string | undefined, (c: Ctx) => number];
const sumTerms = (t: Record<Id, number>) => Object.values(t).reduce((a, b) => a + b, 0);

function investmentRule(j: Firm): RuleDef {
  const i0 = `i${j}0`;
  const pi0 = `pi${j}0`;
  const accel = !isExporter(j);
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
      ...(accel ? ([['capacity', 'Busy capacity', 'investment-accelerator', (c: Ctx) => c.p(i0) * c.p('betaU') * (lastMonth(c, 'output') / c.p('potentialOutput') - 1)]] as T[]) : []),
    ),
    // Gross investment cannot be negative: a firm can stop buying machines but cannot sell them
    // back to builders. The floor acts on the target, before the planning lag, so investment and
    // capital (which then only wears out) stay at or above zero.
    combine: (t) => Math.max(0, sumTerms(t)),
    regime: (_c, _v, t) => (sumTerms(t) < 0 ? 'No new investment: capital only wears out' : null),
    concepts: ['investment-accelerator', 'policy-lags'],
    explain: {
      what: `Investment by ${FIRM_NAME[j]} in machines and buildings, at baseline prices. They buy them from builders.`,
      rule: `Target = {${i0}} × [1 + {betaPi} × (their smoothed real profits ÷ baseline − 1) − {betaRI} × (real loan rate − baseline)${accel ? ' + {betaU} × output gap' : ''}], never below zero: firms can stop buying machines but cannot sell them back to builders, so their capital then only wears out. Plans turn into spending at speed {lamInv} a year, so the peak effect of a rate change comes after about a year.`,
    },
  };
}

const netInterest = (j: Firm): T => {
  const dep = `depositInterest${j}`,
    loan = `loanInterest${j}`;
  return ['interest', 'Net interest', 'interest-distribution', (c) => c.v(dep) - c.v(loan)];
};
const labourTerm = (j: Firm): T => ['labour', 'Labour costs (wages, pension contributions, payroll tax)', 'profit-squeeze', (c) => -labourCost(c, j)];

const EXPORTER_RULE: Record<string, string> = {
  XF: 'Profit = marine exports − imported fuel and gear − domestic inputs − labour costs − net interest. Fish sell at world prices in foreign currency, so a weaker króna or dearer fish lifts revenue at once while costs follow slowly.',
  XA: 'Profit = aluminium exports − imported alumina and anodes − domestic inputs (mostly power) − labour costs − net interest. Aluminium sells at a world price in dollars and labour is a small cost, so profit swings with the aluminium price and the króna.',
  XT: 'Profit = what foreign visitors spend − imported jet fuel and food − domestic inputs − labour costs − net interest. Tourism is priced in krónur and uses a lot of labour, so wage rises squeeze it hard and a strong króna keeps visitors away.',
  XO: 'Profit = other exports − imported inputs − domestic inputs − labour costs − net interest. Priced in krónur and sold in competitive markets, so volumes react to the real exchange rate.',
};

function profitsRule(j: Firm): RuleDef {
  const common = ['wage', `employment${j}`, `loanInterest${j}`, `depositInterest${j}`];
  if (j === 'FC')
    return {
      id: 'profitsFC',
      target: 'profitsFC',
      category: 'IDENTITY',
      inputs: ['domesticPrice', 'investmentReal', 'consumption', 'vat', 'importsEquipment', 'importsInputsFC', 'constructionInputs', ...common],
      params: ['cEr', 'css', 'maintShare'],
      terms: terms(
        ['investment', 'Machines and buildings sold (business and public investment)', 'investment-accelerator', (c) => c.v('domesticPrice') * c.v('investmentReal')],
        ['repairs', 'Home repairs for households, after VAT', 'consumption-function', (c) => c.p('maintShare') * (c.v('consumption') - c.v('vat'))],
        ['imports', 'Imported equipment and inputs', 'import-leakage', (c) => -(c.v('importsEquipment') + c.v('importsInputsFC'))],
        ['materials', 'Materials and services bought at home', undefined, (c) => -c.v('constructionInputs')],
        labourTerm(j),
        netInterest(j),
      ),
      concepts: ['profit-squeeze', 'investment-accelerator'],
      explain: {
        what: 'Builders’ gross profit (before corporate tax), including owners’ and self-employed income.',
        rule: 'Profit = business and public investment (builders deliver all machines and buildings) + home repairs ({maintShare%} of household spending, after VAT) − imported equipment and inputs − materials and services bought from retail and service firms − labour costs (wages × (1 + {cEr%} + {css%})) − net interest. Investment swings much more than consumption, so builders ride the investment cycle.',
      },
    };
  if (j === 'FR')
    return {
      id: 'profitsFR',
      target: 'profitsFR',
      category: 'IDENTITY',
      inputs: ['consumption', 'vat', 'domesticPrice', 'publicPurchasesReal', 'exporterInputs', 'constructionInputs', 'importsConsumer', 'importsInputsFR', 'importsPublic', ...common],
      params: ['cEr', 'css', 'maintShare'],
      terms: terms(
        ['consumers', 'Sales to households, after VAT', 'consumption-function', (c) => (1 - c.p('maintShare')) * (c.v('consumption') - c.v('vat'))],
        ['government', 'Sales to government for public services', 'multiplier', (c) => c.v('domesticPrice') * c.v('publicPurchasesReal')],
        ['exporters', 'Sales to exporters (energy, transport, food, services)', 'export-sectors', (c) => c.v('exporterInputs')],
        ['builders', 'Sales to builders (materials, engineering)', 'investment-accelerator', (c) => c.v('constructionInputs')],
        ['imports', 'Imports (consumer goods, inputs, supplies for public services)', 'import-leakage', (c) => -(c.v('importsConsumer') + c.v('importsInputsFR') + c.v('importsPublic'))],
        labourTerm(j),
        netInterest(j),
      ),
      concepts: ['profit-squeeze'],
      explain: {
        what: 'Retail and service firms’ gross profit (before corporate tax), including owners’ and self-employed income and the housing services homeowners provide themselves.',
        rule: 'Profit = sales to households (all but home repairs, after VAT) + purchases by public services + inputs sold to exporters and builders − imports − labour costs (wages × (1 + {cEr%} + {css%})) − net interest.',
      },
    };
  const k = EXPORT_OF[j];
  const [x, im, di] = [`exports${k}`, `imports${j}`, `exporterInputs${j}`];
  return {
    id: `profits${j}`,
    target: `profits${j}`,
    category: 'IDENTITY',
    inputs: [x, im, di, ...common],
    params: ['cEr', 'css'],
    terms: terms(
      ['exports', 'Export revenue', 'export-sectors', (c) => c.v(x)],
      ['importedInputs', 'Imported inputs', 'import-leakage', (c) => -c.v(im)],
      ['domesticInputs', 'Domestic inputs', undefined, (c) => -c.v(di)],
      labourTerm(j),
      netInterest(j),
    ),
    concepts: j === 'XF' || j === 'XA' ? ['profit-squeeze', 'exchange-rate-pass-through'] : ['profit-squeeze', 'real-exchange-rate'],
    explain: { what: `Gross profit of ${FIRM_NAME[j]}, before corporate tax.`, rule: EXPORTER_RULE[j] },
  };
}

function valueAddedRule(j: Firm): RuleDef {
  if (j === 'FC')
    return {
      id: 'valueAddedFC',
      target: 'valueAddedFC',
      category: 'IDENTITY',
      inputs: ['salesFC'],
      params: ['gvaFC', 'salesFC0'],
      terms: terms(['sales', 'Builders’ sales relative to baseline', 'investment-accelerator', (c) => (c.p('gvaFC') * c.v('salesFC')) / c.p('salesFC0')]),
      explain: { what: 'What builders add to output, at baseline prices.', rule: 'Value added = baseline value added {gvaFC} × real sales ÷ baseline sales {salesFC0}: builders use fixed shares of imports and domestic inputs.' },
    };
  if (j === 'FR')
    return {
      id: 'valueAddedFR',
      target: 'valueAddedFR',
      category: 'IDENTITY',
      inputs: ['output', 'publicValueAdded', ...FIRMS.filter((k) => k !== 'FR').map((k) => `valueAdded${k}`)],
      terms: terms(
        ['output', 'Output', 'multiplier', (c) => c.v('output')],
        ['public', 'Public services’ value added', undefined, (c) => -c.v('publicValueAdded')],
        ['builders', 'Builders’ value added', 'investment-accelerator', (c) => -c.v('valueAddedFC')],
        ['exporters', 'Exporters’ value added', 'export-sectors', (c) => -(c.v('valueAddedXF') + c.v('valueAddedXA') + c.v('valueAddedXT') + c.v('valueAddedXO'))],
      ),
      explain: { what: 'What retail and service firms add to output, at baseline prices.', rule: 'Their value added = real output − public staff − builders’ and exporters’ value added.' },
    };
  const vol = `exportVolume${EXPORT_OF[j]}`;
  const m = j === 'XO' ? 'mXO' : `m${j}`;
  const d = `d${j}`;
  return {
    id: `valueAdded${j}`,
    target: `valueAdded${j}`,
    category: 'IDENTITY',
    inputs: [vol],
    params: [m, d],
    terms: terms(
      ['exports', 'Exports', 'export-sectors', (c) => c.v(vol)],
      ['importedInputs', 'Imported inputs', 'import-leakage', (c) => -c.p(m) * c.v(vol)],
      ['domesticInputs', 'Domestic inputs', undefined, (c) => -c.p(d) * c.v(vol)],
    ),
    explain: { what: `What ${FIRM_NAME[j]} add to output, at baseline prices.`, rule: `Value added = export volume × (1 − {${m}} imported inputs − {d${j}} domestic inputs).` },
  };
}

function dividendsRule(j: Firm): RuleDef {
  if (j === 'XA')
    return {
      id: 'dividendsXA',
      target: 'dividendsXA',
      category: 'BEHAVIOUR',
      label: 'Foreign parents take the free cash',
      inputs: ['profitsXA', 'investmentPurchaseXA'],
      lagInputs: ['nominalGDP'],
      params: ['tauF', 'rhoL', 'lXA0', 'piXA0'],
      stocks: [['businessLoans', 'XA']],
      terms: terms(
        ['afterTax', 'After-tax profit', 'export-sectors', (c) => (1 - c.p('tauF')) * c.v('profitsXA')],
        ['investment', 'Kept for investment', 'investment-accelerator', (c) => -c.v('investmentPurchaseXA')],
        ['debt', 'Debt above normal', 'minsky-instability', (c) => -c.p('rhoL') * c.p('piXA0') * (c.stock('businessLoans', 'XA') / lastMonth(c, 'nominalGDP') - c.p('lXA0'))],
      ),
      concepts: ['current-account', 'export-sectors'],
      explain: {
        what: 'What the aluminium smelters pay their foreign parents: dividends and other owners’ income, all of it abroad. Negative means the parents put money in.',
        rule: 'Payout = after-tax profit ((1 − {tauF%}) × profit) − what the smelters spend on investment − {rhoL} × baseline after-tax profit {piXA0} × (their bank debt ÷ last month’s annual GDP − {lXA0}). The parents sweep up every króna not reinvested, so a rise in the aluminium price leaves Iceland almost at once, and so do losses.',
      },
    };
  const [prof, ret] = [`profits${j}`, `retention${j}`];
  return {
    id: `dividends${j}`,
    target: `dividends${j}`,
    category: 'BEHAVIOUR',
    inputs: [prof, ret],
    params: ['tauF'],
    compute: (c) => (1 - c.v(ret)) * (1 - c.p('tauF')) * c.v(prof),
    explain: { what: `Profit ${FIRM_NAME[j]} pay out to owners (dividends, and owners’ and self-employed income).`, rule: 'Dividends = (1 − retention) × (1 − {tauF%}) × profit.' },
  };
}

function retentionRule(j: Firm): RuleDef[] {
  if (j === 'XA') return [];
  const [rho0, l0] = [`rho${j}0`, `l${j}0`];
  return [
    {
      id: `retention${j}`,
      target: `retention${j}`,
      category: 'BEHAVIOUR',
      lagInputs: ['nominalGDP'],
      params: [`rho${j}0`, 'rhoL', `l${j}0`],
      stocks: [['businessLoans', j]],
      terms: terms(
        ['normal', 'Normal retention', undefined, (c) => c.p(rho0)],
        ['debt', 'Debt above normal', 'minsky-instability', (c) => c.p('rhoL') * (c.stock('businessLoans', j) / lastMonth(c, 'nominalGDP') - c.p(l0))],
      ),
      combine: (t) => Math.min(1, Math.max(0, t.normal + t.debt)),
      regime: (_c, _v, t) => (t.normal + t.debt > 1 ? 'Keeps all its profit' : t.normal + t.debt < 0 ? 'Pays out all its profit' : null),
      explain: {
        what: `Share of after-tax profit ${FIRM_NAME[j]} keep rather than pay out.`,
        rule: `Retention = {rho${j}0} + {rhoL} × (their debt ÷ last month’s annual GDP − its baseline {l${j}0}), kept between 0 and 1: firms keep more when they owe more, but never more than all of their profit, so a loss-making firm pays nothing out and its owners share the loss.`,
      },
    },
  ];
}

function firmRules(j: Firm): RuleDef[] {
  const who = FIRM_NAME[j];
  return [
    investmentRule(j),
    {
      id: `investmentPurchase${j}`,
      target: `investmentPurchase${j}`,
      category: 'IDENTITY',
      inputs: [`investment${j}`, 'domesticPrice'],
      compute: (c) => c.v(`investment${j}`) * c.v('domesticPrice'),
      explain: { what: `What ${who} spend on machines and buildings, bought from builders.`, rule: 'Spending = real investment × domestic prices.' },
    },
    {
      id: `depreciation${j}`,
      target: `depreciation${j}`,
      category: 'CONTRACT',
      params: ['depreciationRate'],
      stocks: [['capital', j]],
      compute: (c) => c.p('depreciationRate') * c.stock('capital', j),
      concepts: ['accrual-vs-cash'],
      explain: { what: `Wear and tear on the machines and buildings of ${who}.`, rule: 'Depreciation = {depreciationRate%} of their capital a year. No money moves; the capital is simply worth less.' },
    },
    profitsRule(j),
    valueAddedRule(j),
    {
      id: `profits${j}Smoothed`,
      target: `profits${j}Smoothed`,
      category: 'BEHAVIOUR',
      inputs: [`profits${j}`, 'cpi'],
      params: ['tauF'],
      adjust: { speed: 'lamPi', form: 'exponential' },
      terms: terms(['afterTax', 'Real after-tax profit this month', 'profit-squeeze', (c) => ((1 - c.p('tauF')) * c.v(`profits${j}`)) / c.v('cpi')]),
      concepts: ['gradual-adjustment'],
      explain: { what: `Real after-tax profit of ${who} as investors see it: smoothed over recent months.`, rule: 'Moves toward (1 − {tauF%}) × profit ÷ CPI at speed {lamPi} a year.' },
    },
    ...retentionRule(j),
    dividendsRule(j),
    {
      id: `borrowing${j}`,
      target: `borrowing${j}`,
      category: 'BEHAVIOUR',
      label: 'Firms’ budget constraint',
      inputs: [`investmentPurchase${j}`, `corporateTax${j}`, `dividends${j}`, `profits${j}`, 'nominalGDP'],
      params: [`dep${j}0`, 'firmCashSpeed'],
      stocks: [
        ['deposits', j],
        ['businessLoans', j],
      ],
      terms: terms(
        ['investment', 'Investment', 'investment-accelerator', (c) => c.v(`investmentPurchase${j}`)],
        ['tax', 'Corporate tax', undefined, (c) => c.v(`corporateTax${j}`)],
        ['dividends', 'Dividends', undefined, (c) => c.v(`dividends${j}`)],
        ['profit', 'Profit', 'profit-squeeze', (c) => -c.v(`profits${j}`)],
        ['cash', 'Restore target deposits', 'endogenous-money', (c) => c.p('firmCashSpeed') * (c.p(`dep${j}0`) * c.v('nominalGDP') - c.stock('deposits', j))],
      ),
      // A firm can repay no more than it owes: once its loans are paid off, spare cash stays in
      // its deposits rather than turning the loan into a claim on the bank.
      combine: (t, c) => Math.max(-c.stock('businessLoans', j) / c.dt, sumTerms(t)),
      regime: (c, _v, t) => (sumTerms(t) < -c.stock('businessLoans', j) / c.dt ? 'Loans repaid in full: spare cash stays in deposits' : null),
      concepts: ['endogenous-money'],
      explain: {
        what: `New bank loans ${who} take (negative: repay). Each loan creates a deposit; each repayment destroys one.`,
        rule: `Borrowing = investment + corporate tax + dividends − profit (the cash they are short of this month) + {firmCashSpeed} × a year of any shortfall of deposits below {dep${j}0} of GDP. At {firmCashSpeed} a year the gap closes within about a month. They never repay more than they owe: once their loans are paid off, spare cash stays in their deposits.`,
      },
    },
  ];
}

/* -------------------------------------------------------------- variables */

const vars: VarDef[] = [
  ...FIRMS.flatMap((j): VarDef[] => {
    const who = FIRM_NAME[j];
    return [
      { id: `investment${j}`, label: `Investment, ${who} (real)`, unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base(`investment${j}`) },
      { id: `investmentPurchase${j}`, label: `Investment spending, ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
      { id: `depreciation${j}`, label: `Depreciation, ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' },
      { id: `profits${j}`, label: `Profit, ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`profits${j}`) },
      { id: `profits${j}Smoothed`, label: `Real after-tax profit, ${who} (smoothed)`, unit: '% of GDP/yr', kind: 'flow', scale: 'real', initial: base(`profits${j}Smoothed`) },
      { id: `valueAdded${j}`, label: `Value added, ${who} (real)`, unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base(`valueAdded${j}`) },
      ...(j === 'XA' ? [] : [{ id: `retention${j}`, label: `Retention ratio, ${who}`, unit: 'fraction', kind: 'ratio', scale: 'none', initial: base(`retention${j}`) } satisfies VarDef]),
      { id: `dividends${j}`, label: `Dividends, ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base(`dividends${j}`) },
      { id: `borrowing${j}`, label: `Net borrowing, ${who}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: 0 },
      ...OWNERS[j].map((to): VarDef => ({ id: `dividends${j}_${to}`, label: `Dividends, ${who} → ${WHO[to]}`, unit: '% of GDP/yr', kind: 'flow', scale: 'nominal' })),
    ];
  }),
  { id: 'salesFC', label: 'Builders’ sales (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', description: 'Machines and buildings for business and public investment, plus home repairs after VAT, at baseline prices.' },
  { id: 'constructionInputs', label: 'Builders’ purchases at home', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', description: 'Materials, engineering and transport builders buy from retail and service firms.' },
  { id: 'dividendsAbroad', label: 'Dividends paid abroad', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('dividendsAbroad'), description: 'Profits exporters pay their foreign owners: the smelters’ parents and others.' },
  { id: 'investmentReal', label: 'Investment (real)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('investmentReal'), description: 'Business and public investment at baseline prices.' },
  { id: 'output', label: 'Output (real GDP)', unit: '% of GDP/yr', kind: 'quantity', scale: 'real', initial: base('output'), description: 'Everything produced in a year, at baseline prices.' },
  { id: 'nominalGDP', label: 'GDP (nominal)', unit: '% of GDP/yr', kind: 'flow', scale: 'nominal', initial: base('nominalGDP'), description: 'Everything produced in a year, at today’s prices (100 at baseline).' },
];

const DIV_W = dividendsTo('W');
const Cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export const firms: ModuleDef = {
  id: 'firms',
  label: 'Firms and output',
  description:
    'Six sectors (builders, retail and services, fisheries, aluminium, tourism, other exporters): each one’s investment, profit, retention, dividends (the smelters’ all abroad), capital, depreciation and borrowing; builders’ sales and purchases; output as the sum of demand.',
  requires: ['structure', 'labour-and-wages', 'prices', 'banks', 'external', 'government', 'households'],
  params: pickParams(ALL_PARAMS, [
    'iFD0', 'iFX0', 'betaPi', 'betaRI', 'betaU', 'lamInv', 'lamPi', 'rhoL', 'firmCashSpeed', 'depreciationRate', 'cEr', 'rl0',
    'divFDY', 'divFDW', 'divFDO', 'divXTW', 'divXOW', 'divFXdomW', 'divFXdomO', 'fdiTarget', 'depFX', 'depShareFC', 'pfEqFDshare',
    'loanTotal', 'loanShareFC', 'loanShareXF', 'loanShareXA', 'loanShareXT', 'loanShareXO',
    'invShareFC', 'invShareXF', 'invShareXA', 'invShareXT', 'maintShare', 'gvaFC', 'salesFC0', 'dFC', 'vaFR0',
    ...FIRMS.flatMap((j) => [`i${j}0`, `pi${j}0`, `l${j}0`, `dep${j}0`, ...(j === 'XA' ? [] : [`rho${j}0`])]),
  ]),
  vars,
  rules: [
    // Output and builders' sales come first: the income–spending block is swept in declaration
    // order, and the sectors' value added and profits read them.
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
      id: 'salesFC',
      target: 'salesFC',
      category: 'IDENTITY',
      inputs: ['investmentReal', 'consumption', 'vat', 'cpi'],
      params: ['maintShare'],
      terms: terms(
        ['investment', 'Machines and buildings (business and public investment)', 'investment-accelerator', (c) => c.v('investmentReal')],
        ['repairs', 'Home repairs, after VAT', 'consumption-function', (c) => (c.p('maintShare') * (c.v('consumption') - c.v('vat'))) / c.v('cpi')],
      ),
      explain: { what: 'What builders sell, at baseline prices.', rule: 'Sales = real business and public investment + home repairs ({maintShare%} of household spending, after VAT, ÷ CPI).' },
    },
    {
      id: 'constructionInputs',
      target: 'constructionInputs',
      category: 'BEHAVIOUR',
      inputs: ['domesticPrice', 'investmentReal', 'consumption', 'vat'],
      params: ['dFC', 'maintShare'],
      compute: (c) => c.p('dFC') * (c.v('domesticPrice') * c.v('investmentReal') + c.p('maintShare') * (c.v('consumption') - c.v('vat'))),
      concepts: ['investment-accelerator'],
      explain: { what: 'Materials, engineering and transport builders buy from retail and service firms.', rule: 'Purchases = {dFC} per króna of builders’ sales (set so builders’ value added matches the data).' },
    },
    ...FIRMS.flatMap(firmRules),
    {
      id: 'investmentReal',
      target: 'investmentReal',
      category: 'IDENTITY',
      inputs: FIRMS.map((j) => `investment${j}`),
      params: ['gInv'],
      terms: [
        ...FIRMS.map((j) => ({ id: j, label: Cap(FIRM_NAME[j]), concept: 'investment-accelerator', compute: (c: Ctx) => c.v(`investment${j}`) })),
        { id: 'public', label: 'Public investment', compute: (c: Ctx) => c.p('gInv') },
      ],
      explain: { what: 'All investment, business and public, at baseline prices.', rule: 'Investment = the six sectors’ investment + public investment ({gInv}% of GDP plus the lever).' },
    },
    ...dividendLegs,
    {
      id: 'dividendsAbroad',
      target: 'dividendsAbroad',
      category: 'IDENTITY',
      inputs: DIV_W,
      terms: DIV_W.map((id) => ({ id, label: id.includes('XA') ? 'Aluminium smelters' : id.includes('XT') ? 'Tourism' : 'Other exporters', concept: 'current-account', compute: (c: Ctx) => c.v(id) })),
      explain: { what: 'Profits exporters pay to their foreign owners.', rule: 'Sum of the smelters’, tourism’s and other exporters’ dividends to foreign owners.' },
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
      legs: FIRMS.map((j) => ({ from: j, to: 'FC', amount: `investmentPurchase${j}` })),
      concepts: ['investment-accelerator'],
      explain: { what: 'Firms buy machines and buildings from builders. Builders’ own purchases stay inside the sector; every other sector pays builders.' },
    },
    {
      id: 'constructionInputs',
      label: 'Builders’ materials and services',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: [{ from: 'FC', to: 'FR', amount: 'constructionInputs' }],
      concepts: ['investment-accelerator'],
      explain: { what: 'Builders buy materials, engineering and transport from retail and service firms, so an investment boom reaches them too.' },
    },
    {
      id: 'depreciation',
      label: 'Depreciation',
      kind: 'writeoff',
      account: 'other',
      posting: { type: 'writeoff', instrument: 'capital' },
      legs: FIRMS.map((j) => ({ from: j, to: j, amount: `depreciation${j}` })),
      concepts: ['accrual-vs-cash', 'net-worth'],
      explain: { what: 'Machines and buildings wear out: firms’ capital, and their net worth, fall without any payment.' },
    },
    {
      id: 'dividends',
      label: 'Dividends and owners’ income',
      kind: 'cash',
      account: 'current',
      posting: { type: 'transfer' },
      legs: FIRMS.flatMap((j) => OWNERS[j].map((to) => ({ from: j, to, amount: `dividends${j}_${to}` }))),
      concepts: ['interest-distribution'],
      explain: { what: 'Firms pay out profit to households (including owners’ and self-employed income), pension funds and foreign owners. The smelters pay everything abroad.' },
    },
    {
      id: 'businessBorrowing',
      label: 'Business borrowing (net)',
      kind: 'cash',
      account: 'financial',
      posting: { type: 'issue', instrument: 'businessLoans' },
      legs: FIRMS.map((j) => ({ from: 'B', to: j, amount: `borrowing${j}` })),
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
      label: 'At baseline every sector’s retained profit exactly pays for its investment, so no firm borrows',
      run: (e) => {
        const b = FIRMS.map((j) => e.baseline(`borrowing${j}`));
        return { pass: b.every((x) => Math.abs(x) < 1e-9), detail: FIRMS.map((j, k) => `${j} ${b[k].toExponential(2)}`).join(', ') };
      },
    },
    {
      id: 'value-added-by-sector-from-data',
      label: 'At baseline builders’ and exporters’ value added equal the data, and all value added sums to GDP',
      run: (e) => {
        const want: Record<string, number> = { FC: 7.34, XF: 4.55, XA: 1.13, XT: 6.65, XO: 6.53 };
        const bad = Object.entries(want).filter(([j, x]) => Math.abs(e.baseline(`valueAdded${j}`) - x) > 1e-9);
        const total = sum(FIRMS.map((j) => e.baseline(`valueAdded${j}`))) + e.baseline('publicValueAdded');
        return { pass: bad.length === 0 && Math.abs(total - 100) < 1e-9, detail: `${FIRMS.map((j) => `${j} ${e.baseline(`valueAdded${j}`).toFixed(2)}`).join(', ')}; with public services ${total.toFixed(9)}` };
      },
    },
    {
      id: 'firms-keep-target-deposits',
      label: 'After a shock firms borrow so that their deposits stay at their target share of GDP',
      run: (e) => {
        e.fire('wageSettlement', 10);
        e.step(6);
        const ke = e as unknown as { stock(i: string, p: string): number };
        const out = (['FR', 'XT'] as const).map((j) => {
          const want = e.influences(`borrowing${j}`).params.find((p) => p.id === `dep${j}0`)!.value * e.value('nominalGDP');
          return { j, want, got: ke.stock('deposits', j) };
        });
        return { pass: out.every((x) => Math.abs(x.got - x.want) < 1e-6 * Math.abs(x.want) + 1e-3), detail: out.map((x) => `${x.j}: deposits ${x.got.toFixed(4)} vs target ${x.want.toFixed(4)}`).join('; ') };
      },
    },
    {
      id: 'investment-and-capital-never-negative',
      label: 'With the aluminium price −40% and pension funds 20 points less abroad for 20 years, no sector’s investment or capital goes below zero and loss-making smelters stop investing',
      run: (e) => {
        const ke = e as unknown as { stock(i: string, p: string): number };
        e.setLever('aluminiumPrice', -40);
        e.setLever('pfForeign', -20);
        let minI = Infinity,
          minK = Infinity,
          stopped = 0;
        for (let t = 0; t < 240; t++) {
          e.step(1);
          for (const j of FIRMS) {
            minI = Math.min(minI, e.value(`investment${j}`));
            minK = Math.min(minK, ke.stock('capital', j));
          }
          if (e.influences('investmentXA').regime?.startsWith('No new investment')) stopped++;
        }
        return { pass: minI >= 0 && minK >= 0 && stopped > 0, detail: `lowest investment ${minI.toFixed(4)}, lowest capital ${minK.toFixed(4)} (% of GDP); smelters invest nothing for ${stopped} months` };
      },
    },
    {
      id: 'loans-never-an-asset',
      label: 'When tourism collapses, fisheries’ swelling cash repays their loans in full and then stays in their deposits: no firm’s loan becomes a claim on the bank',
      run: (e) => {
        const ke = e as unknown as { stock(i: string, p: string): number };
        e.setLever('tourism', -60);
        let minLoan = Infinity,
          repaid = 0;
        for (let t = 0; t < 240; t++) {
          e.step(1);
          for (const j of FIRMS) minLoan = Math.min(minLoan, ke.stock('businessLoans', j));
          if (e.influences('borrowingXF').regime) repaid++;
        }
        return { pass: minLoan >= -1e-9 && repaid > 0, detail: `lowest loan balance ${minLoan.toExponential(2)} (% of GDP); fisheries debt-free for ${repaid} months, deposits ${ke.stock('deposits', 'XF').toFixed(2)}` };
      },
    },
    {
      id: 'aluminium-dividends-abroad',
      label: 'The smelters pay all their dividends abroad, and a dearer aluminium price sends most of the extra profit to foreign owners',
      run: (e) => {
        const legs = e.legs().filter((l) => l.from === 'XA' && l.flow === 'dividends');
        const allAbroad = legs.length === 1 && legs[0].to === 'W' && Math.abs(e.baseline('dividendsXA_W') - e.baseline('dividendsXA')) < 1e-12;
        e.setLever('aluminiumPrice', 20);
        let dDiv = 0,
          dProfit = 0;
        for (let t = 0; t < 24; t++) {
          e.step(1);
          dDiv += e.value('dividendsXA_W') - e.baseline('dividendsXA_W');
          dProfit += e.value('profitsXA') - e.baseline('profitsXA');
        }
        const share = dDiv / dProfit;
        return {
          pass: allAbroad && dProfit > 0 && share > 0.6,
          detail: `smelters' only dividend leg goes to W: ${allAbroad}; over 24 months extra profit ${(dProfit / 12).toFixed(3)} and extra dividends abroad ${(dDiv / 12).toFixed(3)} (% of GDP, summed over years): ${(100 * share).toFixed(0)}%`,
        };
      },
    },
  ],
};
