/**
 * Key numbers on the player and group cards of the flow map.
 *
 * Each model may name one or two indicators (or variables) per player and per group. A group's
 * entry is looked up by its id, then by its label, so a mapping can be written before the
 * model's group ids are settled. Ids that the model does not have are skipped, so a mapping
 * written ahead of a model port is harmless. A card with nothing mapped falls back to the net
 * worth of the player (or of the group's players) and the cash it receives from outside.
 * To add a mapping for a new model, add an entry to PLAYER_CARDS keyed by the model id, and
 * name what a group's members are in GROUP_NOUNS ("3 age groups").
 */
import type { Id } from '../../core/types.ts';
import type { ModelInfo } from './info.ts';

export interface CardMetricSpec {
  /** An indicator id (shown in its display units) … */
  indicator?: Id;
  /** … or a variable id (shown as its value with the change from baseline). */
  variable?: Id;
  /** Short label for the card; defaults to the indicator's or variable's label. */
  label?: string;
}

export type CardMapping = Record<Id, CardMetricSpec[]>;

export const PLAYER_CARDS: Record<Id, CardMapping> = {
  reference: {
    HH: [{ indicator: 'unemployment', label: 'Unemployment' }, { variable: 'consumption', label: 'Spending' }],
    F: [{ indicator: 'output', label: 'Output' }, { variable: 'investment', label: 'Investment' }],
    B: [{ indicator: 'broadMoney', label: 'Broad money' }, { indicator: 'creditImpulse', label: 'Credit impulse' }],
    CB: [{ indicator: 'keyRate', label: 'Key rate' }, { indicator: 'inflation', label: 'Inflation' }],
    G: [{ indicator: 'govDebt', label: 'Debt' }, { variable: 'deficit', label: 'Deficit' }],
    // Group level: the reference model has one player per group, with the group as its label.
    Households: [{ indicator: 'unemployment', label: 'Unemployment' }, { variable: 'consumption', label: 'Spending' }],
    Firms: [{ indicator: 'output', label: 'Output' }, { variable: 'investment', label: 'Investment' }],
    Banks: [{ indicator: 'broadMoney', label: 'Broad money' }, { indicator: 'creditImpulse', label: 'Credit impulse' }],
    'Central bank': [{ indicator: 'keyRate', label: 'Key rate' }, { indicator: 'inflation', label: 'Inflation' }],
    Government: [{ indicator: 'govDebt', label: 'Debt' }, { variable: 'deficit', label: 'Deficit' }],
  },
  iceland: {
    HY: [{ indicator: 'rdiY', label: 'Real income' }, { indicator: 'unemploymentY', label: 'Unemployment' }],
    HW: [{ indicator: 'rdiW', label: 'Real income' }, { indicator: 'unemploymentW', label: 'Unemployment' }],
    HO: [{ indicator: 'rdiO', label: 'Real income' }, { indicator: 'unemploymentO', label: 'Unemployment' }],
    FC: [{ indicator: 'profitsFC', label: 'Profits' }, { indicator: 'jobsFC', label: 'Jobs' }],
    FR: [{ indicator: 'profitsFR', label: 'Profits' }, { indicator: 'consumption', label: 'Demand' }],
    XF: [{ indicator: 'exportsXF', label: 'Exports' }, { indicator: 'profitsXF', label: 'Profits' }],
    XA: [{ indicator: 'exportsXA', label: 'Exports' }, { indicator: 'dividendsAbroad', label: 'Profits abroad' }],
    XT: [{ indicator: 'exportsXT', label: 'Exports' }, { indicator: 'jobsXT', label: 'Jobs' }],
    XO: [{ indicator: 'exportsXO', label: 'Exports' }, { indicator: 'profitsXO', label: 'Profits' }],
    B: [{ indicator: 'bankCapital', label: 'Capital ratio' }, { indicator: 'broadMoney', label: 'Broad money' }],
    CB: [{ indicator: 'keyRate', label: 'Key rate' }, { indicator: 'inflation', label: 'Inflation' }],
    G: [{ indicator: 'govBalance', label: 'Balance' }, { indicator: 'govDebt', label: 'Debt' }],
    PF: [{ indicator: 'pfAssets', label: 'Assets' }],
    W: [{ indicator: 'currentAccount', label: 'Current acct' }, { indicator: 'krona', label: 'Króna' }],
    // Groups, by id or label.
    Households: [{ indicator: 'consumption', label: 'Spending' }, { indicator: 'unemployment', label: 'Unemployment' }],
    Firms: [{ indicator: 'output', label: 'Output' }, { indicator: 'investment', label: 'Investment' }],
    'Domestic firms': [{ indicator: 'consumption', label: 'Demand' }, { indicator: 'profitsFD', label: 'Profits' }],
    Exporters: [{ indicator: 'exports', label: 'Exports' }, { indicator: 'profitsFX', label: 'Profits' }],
    Banks: [{ indicator: 'broadMoney', label: 'Broad money' }, { indicator: 'bankCapital', label: 'Capital ratio' }],
    'Central bank': [{ indicator: 'keyRate', label: 'Key rate' }, { indicator: 'inflation', label: 'Inflation' }],
    Government: [{ indicator: 'govBalance', label: 'Balance' }, { indicator: 'govDebt', label: 'Debt' }],
    'Pension funds': [{ indicator: 'pfAssets', label: 'Assets' }],
    'Rest of world': [{ indicator: 'currentAccount', label: 'Current acct' }, { indicator: 'krona', label: 'Króna' }],
  },
};

/** What a group's direct members are called, singular and plural, by group id or label:
 *  a closed group's card says "3 age groups". Without an entry: "3 players" or "2 groups". */
export const GROUP_NOUNS: Record<Id, Record<Id, [one: string, many: string]>> = {
  iceland: {
    Households: ['age group', 'age groups'],
    Firms: ['kind of firm', 'kinds of firm'],
    'Domestic firms': ['sector', 'sectors'],
    Exporters: ['export industry', 'export industries'],
  },
};

export type ResolvedMetric =
  | { key: string; kind: 'indicator'; id: Id; label: string }
  | { key: string; kind: 'variable'; id: Id; label: string }
  | { key: string; kind: 'netWorth'; label: string }
  | { key: string; kind: 'cashIn'; label: string };

/** The metrics a node's card shows: the model's mapping where it resolves, else the fallback. */
export function resolveCardMetrics(info: ModelInfo, nodeId: Id, mapping: CardMapping | undefined = PLAYER_CARDS[info.id], max = 2): ResolvedMetric[] {
  const out: ResolvedMetric[] = [];
  const group = info.playerById.has(nodeId) ? undefined : info.groupById.get(nodeId);
  const specs = mapping?.[nodeId] ?? (group ? mapping?.[group.label] : undefined) ?? [];
  for (const spec of specs) {
    if (out.length >= max) break;
    if (spec.indicator && info.indicatorById.has(spec.indicator)) {
      const ind = info.indicatorById.get(spec.indicator)!;
      out.push({ key: `i:${ind.id}`, kind: 'indicator', id: ind.id, label: spec.label ?? ind.label });
    } else if (spec.variable && info.varById.has(spec.variable)) {
      const v = info.varById.get(spec.variable)!;
      out.push({ key: `v:${v.id}`, kind: 'variable', id: v.id, label: spec.label ?? v.label });
    }
  }
  if (out.length) return out;
  return [
    { key: 'nw', kind: 'netWorth', label: 'Net worth' },
    { key: 'in', kind: 'cashIn', label: 'Cash in' },
  ].slice(0, max) as ResolvedMetric[];
}
