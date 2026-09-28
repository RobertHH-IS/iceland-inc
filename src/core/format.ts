/**
 * Units and display helpers shared by the kernel, the harness and the interface.
 *
 * Model units (see types.ts): money flows in % of baseline annual GDP at annual rates, money
 * stocks in % of baseline GDP, rates as fractions per year, prices as indices (baseline 1).
 */
import type { IndicatorDef, Posting, VarDef } from './types.ts';

/** Convert an indicator level to its display units. A zero baseline cannot give a percent
 *  deviation, so 'deviation-pct' then falls back to the plain difference × 100. */
export function toDisplay(display: IndicatorDef['display'], level: number, base: number): number {
  switch (display) {
    case 'deviation-pct':
      return Math.abs(base) > 1e-12 ? (level / base - 1) * 100 : (level - base) * 100;
    case 'deviation-pp':
      return (level - base) * 100;
    case 'deviation':
      return level - base;
    default:
      return level;
  }
}

/** Round for display; tiny values print as 0 (no "-0.00"). */
export function formatNumber(v: number, digits = 2, signed = false): string {
  if (!Number.isFinite(v)) return String(v);
  const x = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v;
  const s = x.toFixed(digits);
  return signed && x > 0 ? '+' + s : s;
}

/** A value with its unit, e.g. "3.00%" for a rate, "12.5% of GDP" for a flow. */
export function formatValue(v: number, unit: string, digits = 2): string {
  const u = unit.trim();
  if (u === 'fraction' || u === 'fraction/yr' || u === 'rate') return `${formatNumber(v * 100, digits)}%`;
  if (u === 'index') return formatNumber(v, digits + 1);
  if (u.startsWith('%')) return `${formatNumber(v, digits)}${u}`;
  return `${formatNumber(v, digits)} ${u}`;
}

/** The suffix of an explain-text placeholder: none (`{k}`), percent (`{rate%}`) or points (`{rate pp}`). */
export type TemplateSuffix = '' | '%' | ' pp';

/** How a placeholder's value is written. The default is English: `{rate%}` of 0.035 is "3.5%",
 *  `{rate pp}` "3.5 pp", `{k}` of 1.5 "1.5". A translation passes its own, with its own decimal mark. */
export type TemplateFormatter = (value: number, suffix: TemplateSuffix) => string;

export const englishTemplateFormat: TemplateFormatter = (v, suffix) => {
  if (suffix === '%') return `${+(v * 100).toPrecision(3)}%`;
  if (suffix === ' pp') return `${+(v * 100).toPrecision(3)} pp`;
  return String(+v.toPrecision(4));
};

const PLACEHOLDER = /\{(\w+)( pp|%)?\}/g;

/** Fill {paramId}, {paramId%} and {paramId pp} placeholders in explain texts. A placeholder
 *  whose id the lookup does not know (or whose value is not finite) is left as written. */
export function fillTemplate(text: string, lookup: (id: string) => number | undefined, format: TemplateFormatter = englishTemplateFormat): string {
  return text.replace(PLACEHOLDER, (whole, id: string, suffix?: string) => {
    const v = lookup(id);
    if (typeof v !== 'number' || !Number.isFinite(v)) return whole;
    return format(v, (suffix ?? '') as TemplateSuffix);
  });
}

/** The ids named by placeholders in an explain text, in order of first use. */
export function templateIds(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((x) => x[1]))];
}

/**
 * How big "one unit of change" is for a variable, so changes of different measures can be
 * compared (used to weight ideas at play): 1 pp of GDP for money, 1 pp for rates and ratios
 * (0.01 for a fraction, 1 for a variable already held in percent or points, such as '%/yr',
 * 'pp' or '% of GDP'), and 1% of the baseline for prices, indices and anything else.
 */
export function unitScale(v: Pick<VarDef, 'kind' | 'unit'>, base: number): number {
  const pctOfBase = 0.01 * Math.max(Math.abs(base), 1e-9);
  const u = v.unit.trim();
  if (isPointUnit(u)) return 1; // already in points: 1 pp, or 1 pp of GDP
  switch (v.kind) {
    case 'rate':
    case 'ratio':
    case 'expectation':
      return 0.01;
    case 'price':
    case 'index':
      return pctOfBase;
    default:
      return /GDP/i.test(u) ? 1 : pctOfBase;
  }
}

/** A unit written in percent or percentage points ('%/yr', '% of GDP', 'pp'). */
const isPointUnit = (u: string) => u.startsWith('%') || /^pp\b/.test(u);

/** Units `unitScale` understands for a rate, ratio or expectation: a fraction (scale 0.01),
 *  log points (0.01), or a percent or points unit (1). Any other unit gets a compile warning,
 *  because its scale would be a guess. */
export function knownRateUnit(unit: string): boolean {
  const u = unit.trim();
  return ['fraction', 'fraction/yr', 'ratio', 'log points'].includes(u) || isPointUnit(u) || /GDP/i.test(u);
}

/** A label written inside a sentence: "Bank deposits" → "bank deposits"; "VAT" stays. */
export function inSentence(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
}

/** The `label` lookup for describePosting: instrument and real-asset labels, written inside a
 *  sentence. Pass a model's instruments, e.g. `describePosting(flow.posting, postingLabels(info.instruments))`. */
export function postingLabels(instruments: readonly { id: string; label?: string }[]): (id: string) => string | undefined {
  const byId = new Map(instruments.map((i) => [i.id, i.label]));
  return (id) => {
    const l = byId.get(id);
    return l ? inSentence(l) : undefined;
  };
}

/** Plain-English description of a posting type, for the inspector. `label` names an instrument
 *  or real asset by its id (see postingLabels); without it the ids are printed. Labels are
 *  mostly plural ("homes", "government bonds"), so the sentences read with a plural. */
export function describePosting(p: Posting, label: (id: string) => string | undefined = () => undefined): string {
  const name = (id: string) => label(id) ?? id;
  switch (p.type) {
    case 'transfer':
      return 'A cash payment for income or spending: the payer’s saving falls and the payee’s rises.';
    case 'purchase':
      return `A cash payment that buys a real asset (${name(p.realAsset)}) at cost: the buyer swaps money for the asset; the seller earns income.`;
    case 'issue':
      return `A new claim (${name(p.instrument)}): the lender pays the borrower and gains the claim. A bank lender pays by creating a deposit, which is new money.`;
    case 'redeem':
      return `A repayment of ${name(p.instrument)}: the borrower pays the lender and the claim shrinks on both sides. Repaying a bank destroys the deposit used.`;
    case 'trade':
      return `Existing ${name(p.instrument)} change hands for cash: the buyer pays the seller.`;
    case 'accrue':
      return `Interest or indexation added to ${name(p.instrument)}: the debtor owes more and the creditor holds more. No money moves.`;
    case 'revalue':
      return `A change in the value of ${name(p.instrument)}, or their reclassification between two holders: no money moves and it is not income; it goes to the revaluation account.`;
    case 'writeoff':
      return `A write-off of ${name(p.instrument)}: value is lost without any payment.`;
  }
}
