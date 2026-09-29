/**
 * Iceland Inc.: the players and the instruments that connect them.
 *
 * Fourteen players in a hierarchy of groups (decision 0003): households (young, working age,
 * older); firms, split into domestic firms (construction; retail and services) and exporters
 * (fisheries, aluminium, tourism, other exporters); and one-player groups for the banks (as one),
 * the central bank, the government, the pension funds and the rest of the world. Fifteen
 * instruments: thirteen financial claims (someone's asset and someone else's liability) and two
 * real assets, homes and firms' capital.
 */
import type { GroupDef, ModuleDef, PlayerDef } from '../../../core/types.ts';
import { FIRMS } from '../util.ts';

export const structure: ModuleDef = {
  id: 'structure',
  label: 'Players and instruments',
  description: 'Households by age, six kinds of firm in two groups, banks, the central bank, the government, pension funds and the rest of the world, with the claims between them.',
  groups: [
    {
      id: 'households',
      label: 'Households',
      color: '#3A87C8',
      description: 'Everyone living in Iceland, in three age groups: the young, working age and older people. They work, spend, borrow for homes and save.',
      layout: { x: 0.12, y: 0.55 },
    },
    {
      id: 'firms',
      label: 'Firms',
      color: '#E08A2E',
      description: 'All private businesses: firms that sell at home (builders, shops and services) and the four big export industries.',
      layout: { x: 0.86, y: 0.55 },
    },
    {
      id: 'domestic',
      label: 'Domestic firms',
      parent: 'firms',
      color: '#F2A93B',
      description: 'Firms that sell in Iceland: builders, and the shops, services and utilities that sell to households, the government and exporters.',
      layout: { x: 0.86, y: 0.42 },
    },
    {
      id: 'exporters',
      label: 'Exporters',
      parent: 'firms',
      color: '#C8611A',
      description: 'The four industries that earn foreign currency: fisheries, aluminium, tourism and other exports such as pharma, data centres and software.',
      layout: { x: 0.86, y: 0.68 },
    },
    { id: 'banks', label: 'Banks', color: '#009E73', description: 'All commercial banks as one.', layout: { x: 0.38, y: 0.9 } },
    { id: 'central-bank', label: 'Central bank', color: '#CC79A7', description: 'Seðlabanki Íslands.', layout: { x: 0.15, y: 0.1 } },
    { id: 'government', label: 'Government', color: '#B5A300', description: 'The state and municipalities.', layout: { x: 0.5, y: 0.1 } },
    { id: 'pension-funds', label: 'Pension funds', color: '#882255', description: 'The funded pension system.', layout: { x: 0.62, y: 0.9 } },
    { id: 'world', label: 'Rest of world', color: '#8C8C8C', description: 'Everyone outside Iceland.', layout: { x: 0.85, y: 0.1 } },
  ],
  players: [
    {
      id: 'HY',
      label: 'Young households (18–34)',
      short: 'Young 18–34',
      group: 'households',
      color: '#8FC3E8',
      description: 'People aged 18 to 34 and their children. They work, rent or buy their first home with a mortgage, and swing most in and out of jobs.',
      settlement: 'deposits',
      layout: { x: 0.12, y: 0.38 },
    },
    {
      id: 'HW',
      label: 'Working-age households (35–66)',
      short: 'Working age 35–66',
      group: 'households',
      color: '#3A87C8',
      description: 'People aged 35 to 66. They earn most of the wages, carry most of the mortgage debt, own most small businesses and build up pension rights.',
      settlement: 'deposits',
      layout: { x: 0.12, y: 0.55 },
    },
    {
      id: 'HO',
      label: 'Older households (67+)',
      short: 'Older 67+',
      group: 'households',
      color: '#1B4B82',
      description: 'People aged 67 and over. They live on pensions and savings, own their homes outright and sell homes to younger people.',
      settlement: 'deposits',
      layout: { x: 0.12, y: 0.72 },
    },
    {
      id: 'FC',
      label: 'Construction',
      short: 'Construction',
      group: 'domestic',
      color: '#E8C547',
      description: 'Builders and the firms that deliver and install machines and buildings. They sell all business and public investment and repair homes, import equipment and buy materials and services at home. About 7% of GDP and 8.5% of jobs.',
      settlement: 'deposits',
      layout: { x: 0.93, y: 0.45 },
    },
    {
      id: 'FR',
      label: 'Retail and services',
      short: 'Retail and services',
      group: 'domestic',
      color: '#F2A93B',
      description: 'Shops, wholesalers, restaurants, utilities, finance, property and other services selling at home. They sell most of what households and public services buy, supply exporters and builders, import consumer goods and pass VAT to the government.',
      settlement: 'deposits',
      layout: { x: 0.78, y: 0.36 },
    },
    {
      id: 'XF',
      label: 'Fisheries',
      short: 'Fisheries',
      group: 'exporters',
      color: '#2A9D8F',
      description: 'Fishing, aquaculture and fish processing: marine exports of about 7% of GDP. Owned in Iceland (the law limits foreign ownership). Catches are mostly quota-bound, so revenue moves with world fish prices and the króna and volume only a little.',
      settlement: 'deposits',
      layout: { x: 0.86, y: 0.62 },
    },
    {
      id: 'XA',
      label: 'Aluminium',
      short: 'Aluminium',
      group: 'exporters',
      color: '#9AA5B1',
      description: 'The three aluminium smelters, wholly owned by Rio Tinto, Alcoa and Century. They import alumina and carbon anodes, buy power at home, sell at world prices in dollars, and send their profits to their foreign owners.',
      settlement: 'deposits',
      layout: { x: 0.8, y: 0.76 },
    },
    {
      id: 'XT',
      label: 'Tourism',
      short: 'Tourism',
      group: 'exporters',
      color: '#E76F51',
      description: 'Hotels, restaurants, airlines and tour operators serving foreign visitors: the largest export, about 13% of GDP. Labour-intensive, with many young workers, and very sensitive to the króna.',
      settlement: 'deposits',
      layout: { x: 0.72, y: 0.62 },
    },
    {
      id: 'XO',
      label: 'Other exporters',
      short: 'Other exports',
      group: 'exporters',
      color: '#B5651D',
      description: 'Pharmaceuticals, data centres, software, freight transport, engineering and other goods and services sold abroad: about 14% of GDP of exports.',
      settlement: 'deposits',
      layout: { x: 0.93, y: 0.74 },
    },
    {
      id: 'B',
      label: 'Banks',
      short: 'Banks',
      group: 'banks',
      color: '#009E73',
      description: 'All commercial banks as one. They keep everyone’s deposits, lend to households and firms, and hold government bonds and reserves.',
      settlement: 'bank',
      layout: { x: 0.38, y: 0.9 },
    },
    {
      id: 'CB',
      label: 'Central bank',
      short: 'Central bank',
      group: 'central-bank',
      color: '#CC79A7',
      description: 'Seðlabanki Íslands. It sets the key rate, pays interest on banks’ reserves, holds the foreign-exchange reserves and keeps the government’s account.',
      settlement: 'central-bank',
      layout: { x: 0.15, y: 0.1 },
    },
    {
      id: 'G',
      label: 'Government',
      short: 'Government',
      group: 'government',
      color: '#B5A300',
      description: 'State and municipalities. They run health, education and other services, pay transfers, collect taxes and borrow by selling bonds.',
      settlement: 'treasury',
      layout: { x: 0.5, y: 0.1 },
    },
    {
      id: 'PF',
      label: 'Pension funds',
      short: 'Pension funds',
      group: 'pension-funds',
      color: '#882255',
      description: 'The funded pension system, worth about 180% of GDP. Funds collect contributions, pay pensions, lend mortgages and invest at home and abroad.',
      settlement: 'deposits',
      layout: { x: 0.62, y: 0.9 },
    },
    {
      id: 'W',
      label: 'Rest of world',
      short: 'Abroad',
      group: 'world',
      color: '#8C8C8C',
      description: 'Everyone outside Iceland: buyers of exports, sellers of imports, tourists, foreign owners, and investors holding krónur.',
      settlement: 'deposits',
      layout: { x: 0.85, y: 0.1 },
    },
  ],
  instruments: [
    {
      id: 'deposits',
      label: 'Bank deposits',
      kind: 'financial',
      issuers: ['B'],
      holders: ['HY', 'HW', 'HO', ...FIRMS, 'PF', 'W'],
      valuation: 'nominal',
      description: 'Money as most people know it: a claim on the banks. Created when banks lend, buy bonds or pay; destroyed when they are repaid.',
      concepts: ['endogenous-money', 'broad-money'],
    },
    {
      id: 'reserves',
      label: 'Central-bank reserves',
      kind: 'financial',
      issuers: ['CB'],
      holders: ['B'],
      valuation: 'nominal',
      description: 'Banks’ accounts at the central bank. Every payment between the private sector and the state moves reserves. Below zero, the banks are borrowing reserves from the central bank.',
      concepts: ['reserves-and-payments'],
      // Decision 0005: the one declared exemption in the Iceland model.
      mayGoNegative: {
        reason:
          'The reserve account is the banks’ net position at the central bank. When a long surplus has repaid every bond that can be bought back, the treasury account keeps the rest and drains reserves; the central bank then lends banks the reserves they need against collateral (its standing lending facility), which the model records as a negative balance charged at the key rate.',
        players: ['B', 'CB'],
      },
    },
    {
      id: 'treasuryAccount',
      label: 'Treasury account',
      kind: 'financial',
      issuers: ['CB'],
      holders: ['G'],
      valuation: 'nominal',
      description: 'The government’s account at the central bank: taxes arrive here and spending leaves from here.',
      concepts: ['reserves-and-payments'],
    },
    {
      id: 'mortgagesN',
      label: 'Mortgages, non-indexed',
      kind: 'financial',
      issuers: ['HY', 'HW'],
      holders: ['B', 'PF'],
      valuation: 'nominal',
      description: 'Home loans at a floating nominal rate that follows the key rate. Lent by banks and pension funds.',
      concepts: ['amortisation', 'interest-distribution'],
    },
    {
      id: 'mortgagesI',
      label: 'Mortgages, CPI-indexed',
      kind: 'financial',
      issuers: ['HY', 'HW'],
      holders: ['B', 'PF'],
      valuation: 'cpi-indexed',
      description: 'Home loans whose principal grows with the consumer price index; the borrower pays a low real rate in cash. About 65% of Icelandic mortgages.',
      concepts: ['indexation', 'accrual-vs-cash'],
    },
    {
      id: 'businessLoans',
      label: 'Business loans',
      kind: 'financial',
      issuers: [...FIRMS],
      holders: ['B'],
      valuation: 'nominal',
      description: 'What firms owe the banks. Firms borrow to keep enough cash on hand; each new loan creates a deposit.',
      concepts: ['endogenous-money', 'money-destruction'],
    },
    {
      id: 'govBonds',
      label: 'Government bonds',
      kind: 'financial',
      issuers: ['G'],
      holders: ['B', 'CB', 'PF', 'HO', 'W'],
      valuation: 'nominal',
      description: 'Nominal government bonds at fixed coupons, refinanced at the current rate as they mature (about five years on average). Held by banks, the central bank, pension funds, older savers and foreign carry traders.',
      concepts: ['deficits-and-money', 'bond-buyers'],
    },
    {
      id: 'indexedBonds',
      label: 'Government bonds, CPI-indexed',
      kind: 'financial',
      issuers: ['G'],
      holders: ['PF'],
      valuation: 'cpi-indexed',
      description: 'Government bonds whose principal grows with the CPI, held by pension funds. Indexation adds to the debt without any cash moving.',
      concepts: ['indexation'],
    },
    {
      id: 'bankBonds',
      label: 'Bank bonds',
      kind: 'financial',
      issuers: ['B'],
      holders: ['PF'],
      valuation: 'nominal',
      description: 'Covered bonds the banks sell to pension funds. When a fund buys one, its deposit is cancelled, so broad money shrinks.',
      concepts: ['broad-money'],
    },
    {
      id: 'shares',
      label: 'Company shares (book value)',
      kind: 'financial',
      issuers: [...FIRMS],
      holders: ['HY', 'HW', 'HO', 'PF', 'W'],
      valuation: 'at-cost',
      description: 'Ownership of firms at book value. Held constant, as in v1: the owners’ income arrives as dividends, set by fixed payout shares.',
      concepts: ['net-worth'],
    },
    {
      id: 'fxReserves',
      label: 'Foreign-exchange reserves',
      kind: 'financial',
      issuers: ['W'],
      holders: ['CB'],
      valuation: 'fx',
      description: 'The central bank’s foreign assets, worth more krónur when the króna weakens.',
      concepts: ['revaluation', 'floating-exchange-rate'],
    },
    {
      id: 'kronaLoansW',
      label: 'Non-residents’ króna loans',
      kind: 'financial',
      issuers: ['W'],
      holders: ['B'],
      valuation: 'nominal',
      description: 'Krónur non-residents borrow from Icelandic banks when a month’s payments would overdraw their deposits after they have sold every government bond; they repay as their deposits recover. Zero at baseline.',
      concepts: ['endogenous-money', 'current-account'],
    },
    {
      id: 'foreignAssets',
      label: 'Pension funds’ foreign assets',
      kind: 'financial',
      issuers: ['W'],
      holders: ['PF'],
      valuation: 'fx',
      description: 'Foreign shares and bonds held by pension funds, about 42% of their assets. Buying them means selling krónur.',
      concepts: ['revaluation', 'funded-pensions'],
    },
    {
      id: 'pensionRights',
      label: 'Pension rights',
      kind: 'financial',
      issuers: ['PF'],
      holders: ['HW', 'HO'],
      valuation: 'nominal',
      description: 'What pension funds owe their members. Contributions and credited returns add to them; pensions paid use them up.',
      concepts: ['pension-entitlements', 'funded-pensions'],
    },
    {
      id: 'homes',
      label: 'Homes',
      kind: 'real',
      issuers: [],
      holders: ['HY', 'HW', 'HO'],
      valuation: 'price-index',
      description: 'Owner-occupied homes at market value. Younger households buy them from older ones; their value moves with house prices.',
      concepts: ['intergenerational-flows', 'housing-wealth-effect'],
    },
    {
      id: 'capital',
      label: 'Machines and buildings',
      kind: 'real',
      issuers: [],
      holders: [...FIRMS],
      valuation: 'at-cost',
      description: 'Firms’ capital, valued at what it cost. Investment adds to it and wear and tear reduces it. New in the port: v1 counted investment as spending.',
      concepts: ['net-worth'],
    },
  ],
  tests: [
    {
      id: 'group-hierarchy-valid',
      label: 'The player hierarchy is valid: every player sits in exactly one leaf group, and every group’s parent chain reaches the top without a loop',
      run: () => checkGroups(structure.groups ?? [], structure.players ?? []),
    },
  ],
};

/** Every player's group is a declared leaf group (one with no child groups); parents exist and
 *  chains end at a top-level group; every group contains at least one player. */
export function checkGroups(groups: GroupDef[], players: PlayerDef[]): { pass: boolean; detail: string } {
  const problems: string[] = [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  if (byId.size !== groups.length) problems.push('duplicate group ids');
  const parents = new Set(groups.map((g) => g.parent).filter((x): x is string => !!x));
  for (const g of groups) {
    if (g.parent && !byId.has(g.parent)) problems.push(`group '${g.id}' has unknown parent '${g.parent}'`);
    const seen = new Set<string>([g.id]);
    let at = g;
    while (at.parent && byId.has(at.parent)) {
      if (seen.has(at.parent)) {
        problems.push(`group '${g.id}' is in a parent loop`);
        break;
      }
      seen.add(at.parent);
      at = byId.get(at.parent)!;
    }
    for (const k of ['x', 'y'] as const) if (g.layout && !(g.layout[k] >= 0 && g.layout[k] <= 1)) problems.push(`group '${g.id}' layout ${k} outside 0..1`);
  }
  for (const p of players) {
    if (!byId.has(p.group)) problems.push(`player '${p.id}' is in unknown group '${p.group}'`);
    else if (parents.has(p.group)) problems.push(`player '${p.id}' sits in '${p.group}', which is not a leaf group`);
  }
  const below = (id: string): boolean => players.some((p) => p.group === id) || groups.some((g) => g.parent === id && below(g.id));
  for (const g of groups) if (!below(g.id)) problems.push(`group '${g.id}' has no players`);
  const tops = groups.filter((g) => !g.parent).map((g) => g.id);
  return { pass: problems.length === 0, detail: problems.length ? problems.join('; ') : `${players.length} players in ${groups.length} groups; top level: ${tops.join(', ')}` };
}
