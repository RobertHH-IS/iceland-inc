/**
 * Key numbers on the player cards of the flow map.
 *
 * Each model may name one or two indicators (or variables) per player and per group. Ids that
 * the model does not have are skipped, so a mapping written ahead of a model port is harmless.
 * A card with nothing mapped falls back to the player's net worth and the cash it receives.
 * To add a mapping for a new model, add an entry to PLAYER_CARDS keyed by the model id.
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
  // Written against engine v1's series ids; entries the port renames are skipped until updated.
  iceland: {
    HY: [{ indicator: 'rdiY', label: 'Real income' }, { indicator: 'unemploymentY', label: 'Unemployment' }],
    HW: [{ indicator: 'rdiW', label: 'Real income' }, { indicator: 'unemploymentW', label: 'Unemployment' }],
    HO: [{ indicator: 'rdiO', label: 'Real income' }, { indicator: 'unemploymentO', label: 'Unemployment' }],
    FD: [{ indicator: 'profitsFD', label: 'Profits' }, { indicator: 'output', label: 'Output' }],
    FX: [{ indicator: 'profitsFX', label: 'Profits' }, { indicator: 'exports', label: 'Exports' }],
    B: [{ indicator: 'bankCapital', label: 'Capital ratio' }, { indicator: 'broadMoney', label: 'Broad money' }],
    CB: [{ indicator: 'keyRate', label: 'Key rate' }, { indicator: 'inflation', label: 'Inflation' }],
    G: [{ indicator: 'govBalance', label: 'Balance' }, { indicator: 'govDebt', label: 'Debt' }],
    PF: [{ indicator: 'pfAssets', label: 'Assets' }],
    W: [{ indicator: 'currentAccount', label: 'Current account' }, { indicator: 'krona', label: 'Króna' }],
    Households: [{ indicator: 'consumption', label: 'Spending' }, { indicator: 'unemployment', label: 'Unemployment' }],
    Firms: [{ indicator: 'output', label: 'Output' }, { indicator: 'investment', label: 'Investment' }],
    Banks: [{ indicator: 'broadMoney', label: 'Broad money' }, { indicator: 'bankCapital', label: 'Capital ratio' }],
    'Central bank': [{ indicator: 'keyRate', label: 'Key rate' }, { indicator: 'inflation', label: 'Inflation' }],
    Government: [{ indicator: 'govBalance', label: 'Balance' }, { indicator: 'govDebt', label: 'Debt' }],
    'Pension funds': [{ indicator: 'pfAssets', label: 'Assets' }],
    'Rest of world': [{ indicator: 'currentAccount', label: 'Current account' }, { indicator: 'krona', label: 'Króna' }],
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
  for (const spec of mapping?.[nodeId] ?? []) {
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
