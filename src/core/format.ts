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

/** Fill {paramId}, {paramId%} and {paramId pp} placeholders in explain texts. */
export function fillTemplate(text: string, lookup: (id: string) => number | undefined): string {
  return text.replace(/\{(\w+)( pp|%)?\}/g, (whole, id: string, suffix?: string) => {
    const v = lookup(id);
    if (typeof v !== 'number' || !Number.isFinite(v)) return whole;
    if (suffix === '%') return `${+(v * 100).toPrecision(3)}%`;
    if (suffix === ' pp') return `${+(v * 100).toPrecision(3)} pp`;
    return String(+v.toPrecision(4));
  });
}

/**
 * How big "one unit of change" is for a variable, so changes of different measures can be
 * compared (used to weight ideas at play): 1 pp of GDP for money, 1 pp for rates and ratios,
 * 1% of the baseline for prices, indices and anything else.
 */
export function unitScale(v: Pick<VarDef, 'kind' | 'unit'>, base: number): number {
  const pctOfBase = 0.01 * Math.max(Math.abs(base), 1e-9);
  switch (v.kind) {
    case 'rate':
    case 'ratio':
    case 'expectation':
      return 0.01;
    case 'price':
    case 'index':
      return pctOfBase;
    default:
      return /GDP/i.test(v.unit) ? 1 : pctOfBase;
  }
}

/** Plain-English description of a posting type, for the inspector. */
export function describePosting(p: Posting): string {
  switch (p.type) {
    case 'transfer':
      return 'A cash payment for income or spending: the payer’s saving falls and the payee’s rises.';
    case 'purchase':
      return `A cash payment that buys a real asset (${p.realAsset}) at cost: the buyer swaps money for the asset; the seller earns income.`;
    case 'issue':
      return `A new claim (${p.instrument}): the lender pays the borrower and gains the claim. A bank lender pays by creating a deposit, which is new money.`;
    case 'redeem':
      return `A repayment of ${p.instrument}: the borrower pays the lender and the claim shrinks on both sides. Repaying a bank destroys the deposit used.`;
    case 'trade':
      return `An existing ${p.instrument} changes hands for cash: the buyer pays the seller.`;
    case 'accrue':
      return `Interest or indexation added to ${p.instrument}: the debtor owes more and the creditor holds more. No money moves.`;
    case 'revalue':
      return `A change in the value of ${p.instrument}: no money moves and it is not income; it goes to the revaluation account.`;
    case 'writeoff':
      return `A write-off of ${p.instrument}: value is lost without any payment.`;
  }
}
