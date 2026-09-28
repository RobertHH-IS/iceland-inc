/**
 * A small model with a two-level player hierarchy, for kernel and interface tests:
 *
 *   Households     → Young (H1), Older (H2)
 *   Firms          → Domestic firms → Retail (FR), Construction (FC)
 *                  → Exporters      → Fisheries (FF), Aluminium (FA)
 *   Banks (B), Central bank (CB), Government (G), Rest of world (W): one player each
 *
 * Every leg is a constant set by its own parameter, and each player's payments balance, so the
 * baseline is at rest. There are legs inside every group (home purchases between households,
 * inputs between firms and between exporters), both directions between some pairs, and an
 * accrual next to a cash flow between the same two players, so pipes can be checked at any
 * level of the hierarchy.
 */
import type { FlowDef, GroupDef, ModelDef, ModuleDef, ParamDef, PlayerDef, RuleDef, VarDef } from '../../src/core/types.ts';

const PAYMENT_SYSTEM = { bank: 'B', centralBank: 'CB', treasury: 'G', deposits: 'deposits', reserves: 'reserves', treasuryAccount: 'tsy' };

export const HIERARCHY_GROUPS: GroupDef[] = [
  { id: 'households', label: 'Households', description: 'Young and older households.' },
  { id: 'firms', label: 'Firms', description: 'Firms selling at home and abroad.' },
  { id: 'domestic', label: 'Domestic firms', parent: 'firms', description: 'Retail and construction.' },
  { id: 'exporters', label: 'Exporters', parent: 'firms', color: '#C8611A', description: 'Fisheries and aluminium.' },
  { id: 'banks', label: 'Banks', description: 'The bank.' },
  { id: 'cb', label: 'Central bank', description: 'The central bank.' },
  { id: 'gov', label: 'Government', description: 'The government.' },
  { id: 'world', label: 'Rest of world', description: 'Everyone abroad.' },
];

const P = (id: string, label: string, group: string, settlement: PlayerDef['settlement'], color: string, x: number, y: number): PlayerDef => ({
  id,
  label,
  group,
  settlement,
  color,
  description: label,
  layout: { x, y },
});

export const HIERARCHY_PLAYERS: PlayerDef[] = [
  P('H1', 'Young households', 'households', 'deposits', '#8FC3E8', 0.1, 0.4),
  P('H2', 'Older households', 'households', 'deposits', '#1B4B82', 0.1, 0.65),
  P('FR', 'Retail', 'domestic', 'deposits', '#F2A93B', 0.82, 0.26),
  P('FC', 'Construction', 'domestic', 'deposits', '#E0B060', 0.82, 0.42),
  P('FF', 'Fisheries', 'exporters', 'deposits', '#D2701F', 0.82, 0.6),
  P('FA', 'Aluminium', 'exporters', 'deposits', '#A0501A', 0.82, 0.78),
  P('B', 'Bank', 'banks', 'bank', '#009E73', 0.45, 0.9),
  P('CB', 'Central bank', 'cb', 'central-bank', '#CC79A7', 0.2, 0.08),
  P('G', 'Government', 'gov', 'treasury', '#B5A300', 0.5, 0.08),
  P('W', 'Rest of world', 'world', 'deposits', '#8C8C8C', 0.82, 0.06),
];

/** [flow, from, to, amount at baseline]. */
const LEGS: [string, string, string, number][] = [
  ['wages', 'FR', 'H1', 20],
  ['wages', 'FR', 'H2', 10],
  ['wages', 'FC', 'H1', 3],
  ['wages', 'FF', 'H1', 5],
  ['wages', 'FA', 'H2', 5],
  ['consumption', 'H1', 'FR', 22],
  ['consumption', 'H2', 'FR', 14],
  ['renovation', 'H2', 'FC', 3],
  ['homes', 'H1', 'H2', 3],
  ['tax', 'H1', 'G', 3],
  ['tax', 'H2', 'G', 1],
  ['purchases', 'G', 'FR', 4],
  ['inputs', 'FR', 'FF', 6],
  ['inputs', 'FR', 'FA', 4],
  ['inputs', 'FF', 'FA', 5],
  ['exports', 'W', 'FF', 4],
  ['exports', 'W', 'FA', 1],
  ['imports', 'FA', 'W', 5],
  ['loanInterest', 'FR', 'B', 1],
  ['repayment', 'FR', 'B', 1],
  ['depositInterest', 'B', 'FR', 1],
];

const FLOWS: Omit<FlowDef, 'legs'>[] = [
  { id: 'wages', label: 'Wages', kind: 'cash', account: 'current', posting: { type: 'transfer' }, concepts: ['wage-income'], explain: { what: 'wages' } },
  { id: 'consumption', label: 'Consumption', kind: 'cash', account: 'current', posting: { type: 'transfer' }, concepts: ['consumption-function'], explain: { what: 'spending' } },
  { id: 'renovation', label: 'Renovation', kind: 'cash', account: 'current', posting: { type: 'transfer' }, explain: { what: 'building work' } },
  { id: 'homes', label: 'Home purchases', kind: 'cash', account: 'current', posting: { type: 'transfer' }, concepts: ['housing-market'], explain: { what: 'homes' } },
  { id: 'tax', label: 'Tax', kind: 'cash', account: 'current', posting: { type: 'transfer' }, explain: { what: 'tax' } },
  { id: 'purchases', label: 'Government purchases', kind: 'cash', account: 'current', posting: { type: 'transfer' }, explain: { what: 'purchases' } },
  { id: 'inputs', label: 'Inputs', kind: 'cash', account: 'current', posting: { type: 'transfer' }, concepts: ['supply-chain'], explain: { what: 'inputs' } },
  { id: 'exports', label: 'Exports', kind: 'cash', account: 'current', posting: { type: 'transfer' }, concepts: ['export-demand'], explain: { what: 'exports' } },
  { id: 'imports', label: 'Imports', kind: 'cash', account: 'current', posting: { type: 'transfer' }, explain: { what: 'imports' } },
  { id: 'loanInterest', label: 'Loan interest', kind: 'accrual', account: 'current', posting: { type: 'accrue', instrument: 'loans' }, explain: { what: 'interest added to the loan' } },
  { id: 'repayment', label: 'Loan repayment', kind: 'cash', account: 'financial', posting: { type: 'redeem', instrument: 'loans' }, explain: { what: 'repayment' } },
  { id: 'depositInterest', label: 'Deposit interest', kind: 'cash', account: 'current', posting: { type: 'transfer' }, explain: { what: 'interest on deposits' } },
];

const amountId = (flow: string, from: string, to: string) => `${flow}_${from}_${to}`;

export function hierarchyModel(): ModelDef {
  const vars: VarDef[] = [];
  const params: ParamDef[] = [];
  const rules: RuleDef[] = [];
  for (const [flow, from, to, v] of LEGS) {
    const id = amountId(flow, from, to);
    vars.push({ id, label: `${flow} ${from} → ${to}`, unit: '% of GDP/yr', kind: 'flow', initial: v });
    params.push({ id: `lvl_${id}`, value: v, unit: '% of GDP/yr', category: 'BEHAVIOUR', description: `level of ${id}`, provenance: { basis: 'assumed' } });
    rules.push({ id, target: id, category: 'BEHAVIOUR', params: [`lvl_${id}`], compute: (c) => c.p(`lvl_${id}`), explain: { what: id, rule: `${id} = a constant` } });
  }
  const flows: FlowDef[] = FLOWS.map((f) => ({ ...f, legs: LEGS.filter((l) => l[0] === f.id).map(([flow, from, to]) => ({ from, to, amount: amountId(flow, from, to) })) }));
  const holders = HIERARCHY_PLAYERS.filter((p) => p.settlement === 'deposits').map((p) => p.id);
  const structure: ModuleDef = {
    id: 'structure',
    label: 'Players',
    description: 'Players in a two-level hierarchy.',
    groups: HIERARCHY_GROUPS,
    players: HIERARCHY_PLAYERS,
    instruments: [
      { id: 'deposits', label: 'Deposits', kind: 'financial', issuers: ['B'], holders, valuation: 'nominal', description: 'money' },
      { id: 'reserves', label: 'Reserves', kind: 'financial', issuers: ['CB'], holders: ['B'], valuation: 'nominal', description: 'reserves' },
      { id: 'tsy', label: 'Treasury account', kind: 'financial', issuers: ['CB'], holders: ['G'], valuation: 'nominal', description: 'treasury account' },
      { id: 'loans', label: 'Loans', kind: 'financial', issuers: ['FR', 'FF'], holders: ['B'], valuation: 'nominal', description: 'bank loans to firms' },
    ],
  };
  const economy: ModuleDef = {
    id: 'economy',
    label: 'Economy',
    description: 'Constant flows between the players.',
    vars,
    params,
    rules,
    flows,
    levers: [
      {
        id: 'exportBoom',
        label: 'Fish exports',
        group: 'World',
        kind: 'setting',
        unit: '% of GDP',
        default: 0,
        min: -2,
        max: 2,
        binds: { param: 'lvl_exports_W_FF', mode: 'add' },
        description: 'More fish sold abroad.',
        definition: 'Level shift in fish exports, in % of GDP a year, persistent while set; back to baseline when set to 0.',
      },
    ],
    indicators: [
      { id: 'exports', label: 'Exports', group: 'Overview', unit: '% vs baseline', display: 'deviation-pct', compute: (c) => c.v('exports_W_FF') + c.v('exports_W_FA'), description: 'Exports', drivers: ['exports_W_FF'] },
    ],
  };
  return {
    id: 'hierarchy',
    label: 'Hierarchy test',
    description: 'A small economy with nested groups of players.',
    modules: [structure, economy],
    paymentSystem: PAYMENT_SYSTEM,
    dt: 1 / 12,
    steadyState: {
      free: [],
      targets: [],
      initialStocks: [
        ['deposits', 'H1', 30],
        ['deposits', 'H2', 40],
        ['deposits', 'FR', 10],
        ['deposits', 'FC', 2],
        ['deposits', 'FF', 5],
        ['deposits', 'FA', 5],
        ['deposits', 'W', 10],
        ['loans', 'FR', 20],
        ['loans', 'FF', 10],
        ['reserves', 'B', 5],
        ['tsy', 'G', 5],
      ],
    },
  };
}
