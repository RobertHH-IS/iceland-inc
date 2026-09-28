/**
 * Small models for kernel tests.
 */
import type { LegDef, ModelDef, ModuleDef, ParamDef, RuleDef, VarDef } from '../../src/core/types.ts';

const assumed = { basis: 'assumed' as const };

/** The players and payment instruments every model needs (bank, central bank, government). */
export function paymentModule(depositHolders: string[] = ['HH']): ModuleDef {
  return {
    id: 'payments',
    label: 'Payment system',
    description: 'Bank, central bank, government and the means of payment.',
    players: [
      ...depositHolders.map((id, j) => ({ id, label: id, group: 'Private', description: id, settlement: 'deposits' as const, layout: { x: 0.1, y: (j + 1) / (depositHolders.length + 1) } })),
      { id: 'B', label: 'Bank', group: 'Bank', description: 'bank', settlement: 'bank', layout: { x: 0.5, y: 0.9 } },
      { id: 'CB', label: 'Central bank', group: 'CB', description: 'central bank', settlement: 'central-bank', layout: { x: 0.9, y: 0.9 } },
      { id: 'G', label: 'Government', group: 'G', description: 'government', settlement: 'treasury', layout: { x: 0.9, y: 0.1 } },
    ],
    instruments: [
      { id: 'deposits', label: 'Deposits', kind: 'financial', issuers: ['B'], holders: depositHolders, valuation: 'nominal', description: 'money' },
      { id: 'reserves', label: 'Reserves', kind: 'financial', issuers: ['CB'], holders: ['B'], valuation: 'nominal', description: 'reserves' },
      { id: 'tsy', label: 'Treasury account', kind: 'financial', issuers: ['CB'], holders: ['G'], valuation: 'nominal', description: 'treasury account' },
    ],
  };
}

export const PAYMENT_SYSTEM = { bank: 'B', centralBank: 'CB', treasury: 'G', deposits: 'deposits', reserves: 'reserves', treasuryAccount: 'tsy' };

/**
 * A tiny model: households pay the government a tax proportional to a spending variable,
 * the government spends it back. Modules can be added or swapped to provoke compile errors.
 */
export function tinyModel(extra: ModuleDef[] = [], core?: Partial<ModuleDef>): ModelDef {
  const coreModule: ModuleDef = {
    id: 'core',
    label: 'Core',
    description: 'A tax and a spending flow.',
    vars: [
      { id: 'spend', label: 'Spending', unit: '% of GDP/yr', kind: 'flow', initial: 10 },
      { id: 'tax', label: 'Tax', unit: '% of GDP/yr', kind: 'flow', initial: 10 },
    ],
    params: [{ id: 'level', value: 10, unit: '% of GDP/yr', category: 'POLICY', description: 'spending level', provenance: assumed }],
    rules: [
      { id: 'spend', target: 'spend', category: 'POLICY', params: ['level'], compute: (c) => c.p('level'), explain: { what: 'spending', rule: 'spend = level' } },
      { id: 'tax', target: 'tax', category: 'POLICY', inputs: ['spend'], compute: (c) => c.v('spend'), explain: { what: 'tax', rule: 'tax = spend' } },
    ],
    flows: [
      { id: 'spend', label: 'Spending', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: [{ from: 'G', to: 'HH', amount: 'spend' }], explain: { what: 'spending' } },
      { id: 'tax', label: 'Tax', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: [{ from: 'HH', to: 'G', amount: 'tax' }], explain: { what: 'tax' } },
    ],
    ...core,
  };
  return {
    id: 'tiny',
    label: 'Tiny',
    description: 'test model',
    modules: [paymentModule(), coreModule, ...extra],
    paymentSystem: PAYMENT_SYSTEM,
    dt: 1 / 12,
    steadyState: {
      free: [],
      targets: [],
      initialStocks: [
        ['deposits', 'HH', 50],
        ['reserves', 'B', 5],
        ['tsy', 'G', 5],
      ],
    },
  };
}

/** Build a rule with sensible defaults. */
export function rule(r: Partial<RuleDef> & Pick<RuleDef, 'id' | 'target'>): RuleDef {
  return { category: 'BEHAVIOUR', explain: { what: r.id, rule: r.id }, ...r } as RuleDef;
}

export function variable(id: string, initial = 0, kind: VarDef['kind'] = 'flow'): VarDef {
  return { id, label: id, unit: '% of GDP/yr', kind, initial };
}

export function param(id: string, value: number): ParamDef {
  return { id, value, unit: 'fraction', category: 'BEHAVIOUR', description: id, provenance: assumed };
}

/**
 * A synthetic model of k households for performance tests (8 variables each, so k = 25 gives
 * about 200 variables). Firms pay wages out of same-month GDP, which makes one large
 * simultaneous block (like a real income–expenditure loop), and dividends out of last
 * month's GDP. Households consume out of income and deposits with partial adjustment.
 */
export function syntheticModel(k = 25): ModelDef {
  const H = Array.from({ length: k }, (_, i) => `H${i + 1}`);
  const share = (i: number) => (2 * (i + 1)) / (k * (k + 1)); // shares sum to 1
  const a1 = 0.8,
    a2 = 0.1,
    ws = 0.6,
    Y = 100;
  const vars: VarDef[] = [variable('gdp', Y)];
  const rules: RuleDef[] = [
    rule({
      id: 'gdp',
      target: 'gdp',
      category: 'IDENTITY',
      inputs: H.map((h) => `cons_${h}`),
      compute: (c) => {
        let s = 0;
        for (const h of H) s += c.v(`cons_${h}`);
        return s;
      },
    }),
  ];
  const legsW: LegDef[] = [],
    legsD: LegDef[] = [],
    legsC: LegDef[] = [];
  const stocks: [string, string, number][] = [['deposits', 'F', 20]];
  H.forEach((h, i) => {
    const s = share(i);
    const inc = s * Y;
    stocks.push(['deposits', h, ((1 - a1) * inc) / a2]);
    vars.push(
      variable(`wages_${h}`, ws * inc),
      variable(`div_${h}`, (1 - ws) * inc),
      variable(`income_${h}`, inc),
      variable(`cons_${h}`, inc),
      variable(`saving_${h}`, 0),
      { id: `wealth_${h}`, label: 'wealth', unit: '% of GDP', kind: 'state', initial: ((1 - a1) * inc) / a2 },
      { id: `wealthRatio_${h}`, label: 'wealth/income', unit: 'years', kind: 'ratio', initial: (1 - a1) / a2 },
      { id: `mpc_${h}`, label: 'spending/income', unit: 'fraction', kind: 'ratio', initial: 1 },
    );
    rules.push(
      rule({ id: `wages_${h}`, target: `wages_${h}`, category: 'IDENTITY', inputs: ['gdp'], params: ['wageShare'], compute: (c) => s * c.p('wageShare') * c.v('gdp') }),
      rule({ id: `div_${h}`, target: `div_${h}`, lagInputs: ['gdp'], params: ['wageShare'], compute: (c) => s * (1 - c.p('wageShare')) * c.lag('gdp') }),
      rule({
        id: `income_${h}`,
        target: `income_${h}`,
        category: 'IDENTITY',
        inputs: [`wages_${h}`, `div_${h}`],
        terms: [
          { id: 'wages', label: 'Wages', compute: (c) => c.v(`wages_${h}`) },
          { id: 'dividends', label: 'Dividends', compute: (c) => c.v(`div_${h}`) },
        ],
      }),
      rule({
        id: `cons_${h}`,
        target: `cons_${h}`,
        inputs: [`income_${h}`],
        stocks: [['deposits', h]],
        params: ['mpcIncome', 'mpcWealth'],
        adjust: { speed: 'consSpeed' },
        terms: [
          { id: 'income', label: 'Out of income', compute: (c) => c.p('mpcIncome') * c.v(`income_${h}`) },
          { id: 'wealth', label: 'Out of wealth', compute: (c) => c.p('mpcWealth') * c.stock('deposits', h) },
        ],
      }),
      rule({ id: `saving_${h}`, target: `saving_${h}`, category: 'IDENTITY', inputs: [`income_${h}`, `cons_${h}`], compute: (c) => c.v(`income_${h}`) - c.v(`cons_${h}`) }),
      rule({ id: `wealth_${h}`, target: `wealth_${h}`, category: 'IDENTITY', stocks: [['deposits', h]], compute: (c) => c.stock('deposits', h) }),
      rule({ id: `wealthRatio_${h}`, target: `wealthRatio_${h}`, category: 'IDENTITY', inputs: [`wealth_${h}`, `income_${h}`], compute: (c) => c.v(`wealth_${h}`) / c.v(`income_${h}`) }),
      rule({ id: `mpc_${h}`, target: `mpc_${h}`, category: 'IDENTITY', inputs: [`cons_${h}`, `income_${h}`], compute: (c) => c.v(`cons_${h}`) / c.v(`income_${h}`) }),
    );
    legsW.push({ from: 'F', to: h, amount: `wages_${h}` });
    legsD.push({ from: 'F', to: h, amount: `div_${h}` });
    legsC.push({ from: h, to: 'F', amount: `cons_${h}` });
  });
  const pay = paymentModule(['F', ...H]);
  return {
    id: 'synthetic',
    label: `Synthetic (${k} households)`,
    description: 'performance test model',
    modules: [
      pay,
      {
        id: 'economy',
        label: 'Economy',
        description: 'households and firms',
        vars,
        params: [param('mpcIncome', a1), param('mpcWealth', a2), param('wageShare', ws), { ...param('consSpeed', 4), unit: 'per year' }],
        rules,
        flows: [
          { id: 'wages', label: 'Wages', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: legsW, explain: { what: 'wages' } },
          { id: 'dividends', label: 'Dividends', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: legsD, explain: { what: 'dividends' } },
          { id: 'consumption', label: 'Consumption', kind: 'cash', account: 'current', posting: { type: 'transfer' }, legs: legsC, explain: { what: 'consumption' } },
        ],
        levers: [
          {
            id: 'thrift',
            label: 'Thrift',
            group: 'Economy',
            kind: 'setting',
            unit: 'pp',
            default: 0,
            min: -10,
            max: 10,
            binds: { param: 'mpcIncome', mode: 'add', scale: -0.01 },
            description: 'households save more',
            definition: 'Level shift in the propensity to save out of income, persistent while set.',
          },
        ],
        indicators: [{ id: 'output', label: 'Output', group: 'Overview', unit: '% vs baseline', display: 'deviation-pct', compute: (c) => c.v('gdp'), description: 'GDP' }],
      },
    ],
    paymentSystem: PAYMENT_SYSTEM,
    dt: 1 / 12,
    steadyState: { free: [], targets: [], initialStocks: [...stocks, ['reserves', 'B', 5], ['tsy', 'G', 5]] },
  };
}
