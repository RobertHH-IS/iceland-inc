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
  /** A stabiliser (StabiliserDef id) that sets this number when it acts: the card then marks
   *  it "rule" while that stabiliser is unlocked (decisions 0004 and 0010). */
  stabiliser?: Id;
}

export type CardMapping = Record<Id, CardMetricSpec[]>;

export const PLAYER_CARDS: Record<Id, CardMapping> = {
  reference: {
    HH: [{ indicator: 'unemployment', label: 'Unemployment' }, { variable: 'consumption', label: 'Spending' }],
    F: [{ indicator: 'output', label: 'Output' }, { variable: 'investment', label: 'Investment' }],
    B: [{ indicator: 'broadMoney', label: 'Broad money' }, { indicator: 'creditImpulse', label: 'Credit impulse' }],
    CB: [{ indicator: 'keyRate', label: 'Key rate', stabiliser: 'taylorRule' }, { indicator: 'inflation', label: 'Inflation' }],
    G: [{ indicator: 'govDebt', label: 'Debt' }, { variable: 'deficit', label: 'Deficit' }],
    // Group level: the reference model has one player per group, with the group as its label.
    Households: [{ indicator: 'unemployment', label: 'Unemployment' }, { variable: 'consumption', label: 'Spending' }],
    Firms: [{ indicator: 'output', label: 'Output' }, { variable: 'investment', label: 'Investment' }],
    Banks: [{ indicator: 'broadMoney', label: 'Broad money' }, { indicator: 'creditImpulse', label: 'Credit impulse' }],
    'Central bank': [{ indicator: 'keyRate', label: 'Key rate', stabiliser: 'taylorRule' }, { indicator: 'inflation', label: 'Inflation' }],
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
    CB: [{ indicator: 'keyRate', label: 'Key rate', stabiliser: 'keyRateRule' }, { indicator: 'inflation', label: 'Inflation' }],
    G: [{ indicator: 'govBalance', label: 'Balance' }, { indicator: 'govDebt', label: 'Debt' }],
    PF: [{ indicator: 'pfAssets', label: 'Assets' }],
    W: [{ indicator: 'currentAccount', label: 'Current acct' }, { indicator: 'krona', label: 'Króna' }],
    // Groups, by id or label.
    Households: [{ indicator: 'consumption', label: 'Spending' }, { indicator: 'unemployment', label: 'Unemployment' }],
    Firms: [{ indicator: 'output', label: 'Output' }, { indicator: 'investment', label: 'Investment' }],
    'Domestic firms': [{ indicator: 'consumption', label: 'Demand' }, { indicator: 'profitsFD', label: 'Profits' }],
    Exporters: [{ indicator: 'exports', label: 'Exports' }, { indicator: 'profitsFX', label: 'Profits' }],
    Banks: [{ indicator: 'broadMoney', label: 'Broad money' }, { indicator: 'bankCapital', label: 'Capital ratio' }],
    'Central bank': [{ indicator: 'keyRate', label: 'Key rate', stabiliser: 'keyRateRule' }, { indicator: 'inflation', label: 'Inflation' }],
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

/** An evolving Iceland variant keeps the same familiar map cards and group vocabulary. */
export function cardFamily(info: ModelInfo): Id {
  return info.paramById.has('growthReal') && info.playerById.has('HY') ? 'iceland' : info.id;
}

export type ResolvedMetric =
  | { key: string; kind: 'indicator'; id: Id; label: string; stabiliser?: Id }
  | { key: string; kind: 'variable'; id: Id; label: string; stabiliser?: Id }
  | { key: string; kind: 'netWorth'; label: string }
  | { key: string; kind: 'cashIn'; label: string };

/** The metrics a node's card shows: the model's mapping where it resolves, else the fallback. */
export function resolveCardMetrics(info: ModelInfo, nodeId: Id, mapping: CardMapping | undefined = PLAYER_CARDS[cardFamily(info)], max = 2): ResolvedMetric[] {
  const out: ResolvedMetric[] = [];
  const group = info.playerById.has(nodeId) ? undefined : info.groupById.get(nodeId);
  const specs = mapping?.[nodeId] ?? (group ? mapping?.[group.label] : undefined) ?? [];
  for (const spec of specs) {
    if (out.length >= max) break;
    if (spec.indicator && info.indicatorById.has(spec.indicator)) {
      const ind = info.indicatorById.get(spec.indicator)!;
      out.push({ key: `i:${ind.id}`, kind: 'indicator', id: ind.id, label: spec.label ?? ind.label, ...(spec.stabiliser ? { stabiliser: spec.stabiliser } : {}) });
    } else if (spec.variable && info.varById.has(spec.variable)) {
      const v = info.varById.get(spec.variable)!;
      out.push({ key: `v:${v.id}`, kind: 'variable', id: v.id, label: spec.label ?? v.label, ...(spec.stabiliser ? { stabiliser: spec.stabiliser } : {}) });
    }
  }
  if (out.length) return out;
  return [
    { key: 'nw', kind: 'netWorth', label: 'Net worth' },
    { key: 'in', kind: 'cashIn', label: 'Cash in' },
  ].slice(0, max) as ResolvedMetric[];
}

/* ------------------------------------------------------------- one row */

/** A rough width of text in px: Outfit (the interface font) by letter shape, a little generous so a
 *  row that is estimated to fit does; DM Mono exactly (0.6 em a character). */
export function textWidth(s: string, px: number, mono = false): number {
  if (mono) return s.length * 0.6 * px;
  let em = 0;
  for (const ch of s) em += /[ilIjtfr.,:;'|!() ]/.test(ch) ? 0.3 : /[mwMW%@]/.test(ch) ? 0.82 : /[A-Z]/.test(ch) ? 0.64 : 0.54;
  return em * px;
}

/** What one card row shows: its label, its value and, once a lever has moved, the value's small
 *  effect. The label comes first: where room is short the value drops its scale ("2,618" for
 *  "2,618 bn"; the accessible name says it in full), then the effect is left to the value's colour
 *  and the accessible name, and the label is cut only when it and the value alone do not fit.
 *  Sizes: the card's 11 px, the effect's 9.5 px and the "auto" mark. */
export function fitCardRow(width: number, row: { label: string; value: string; change?: string; rule: boolean }): { label: string; value: string; change: string } {
  // the row starts 14 px in and ends 10 px from the edge; " auto" is about 19 px; 6 px between
  const room = width - 14 - 10 - (row.rule ? 22 : 0) - 6;
  const labelW = textWidth(row.label, 11);
  const scaleless = row.value.replace(/ bn$/, '');
  const fits = (value: string, change: string) => labelW + textWidth(value, 11, true) + (change ? 3 + textWidth(change, 9.5, true) : 0) <= room;
  const tries: [string, string][] = row.change ? [[row.value, row.change], [scaleless, row.change], [row.value, ''], [scaleless, '']] : [[row.value, ''], [scaleless, '']];
  for (const [value, change] of tries) if (fits(value, change)) return { label: row.label, value, change };
  // the label and the value alone do not fit: cut the label
  const value = row.value;
  let label = row.label;
  const left = room - textWidth(value, 11, true);
  while (label.length > 4 && textWidth(`${label}…`, 11) > left) label = label.slice(0, -1);
  return { label: label === row.label ? label : `${label.trimEnd()}…`, value, change: '' };
}
