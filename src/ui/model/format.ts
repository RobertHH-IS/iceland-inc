/**
 * Number formatting for the interface. Pure functions, no DOM.
 *
 * Model units (src/core/types.ts): money flows are % of baseline annual GDP at annual rates,
 * stocks are % of baseline GDP, rates are fractions per year, prices are indices. Indicators
 * arrive already in their display units ('% vs baseline', 'pp vs baseline', 'pp of GDP', …).
 */

/** Typographic minus, so negative numbers line up with positive ones in DM Mono. */
export const MINUS = '−';

/** Values smaller than this print as zero (no "−0.00" from floating-point dust). */
const DUST = 1e-9;

/** Decimal places that keep about three significant figures for everyday magnitudes. */
export function adaptiveDigits(v: number): number {
  const a = Math.abs(v);
  if (a >= 100) return 0;
  if (a >= 10) return 1;
  if (a >= 0.1 || a < DUST) return 2;
  if (a >= 0.01) return 3;
  return 4;
}

/** A plain number with a typographic minus. `digits` defaults to adaptiveDigits(v). */
export function fmtNum(v: number, digits?: number): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? '–' : v > 0 ? '∞' : `${MINUS}∞`;
  const d = digits ?? adaptiveDigits(v);
  const x = Math.abs(v) < 0.5 * 10 ** -d || Math.abs(v) < DUST ? 0 : v;
  const s = Math.abs(x).toFixed(d);
  return x < 0 ? MINUS + s : s;
}

/** A change: always signed ("+0.42", "−1.3", "0.00"). */
export function fmtSigned(v: number, digits?: number): string {
  const s = fmtNum(v, digits);
  if (s.startsWith(MINUS) || /^0(\.0*)?$/.test(s) || !Number.isFinite(v)) return s;
  return '+' + s;
}

/** How a unit string should be displayed. */
export type UnitKind = 'fraction' | 'index' | 'percent' | 'pp' | 'plain';

export function unitKind(unit: string): UnitKind {
  const u = unit.trim();
  if (/^fraction\b/.test(u) || u === 'rate') return 'fraction';
  if (u === 'index') return 'index';
  if (/^pp\b/.test(u)) return 'pp';
  if (u.startsWith('%')) return 'percent';
  return 'plain';
}

/** The part of a fraction unit after the word "fraction", e.g. " of deposits". */
function fractionTail(unit: string): string {
  const rest = unit.trim().replace(/^fraction/, '');
  return rest === '/yr' ? '' : rest;
}

/**
 * A model value with its unit: "3.00%" for a rate held as a fraction, "12.3% of GDP/yr" for a
 * flow, "1.042" for an index, "8 years" for anything else.
 */
export function fmtValue(v: number, unit: string, digits?: number): string {
  switch (unitKind(unit)) {
    case 'fraction': {
      const pct = v * 100;
      return `${fmtNum(pct, digits ?? Math.min(2, adaptiveDigits(pct)))}%${fractionTail(unit)}`;
    }
    case 'index':
      return fmtNum(v, digits ?? 3);
    case 'percent':
      return `${fmtNum(v, digits)}${unit.trim()}`;
    case 'pp':
      return `${fmtNum(v, digits)} ${unit.trim()}`;
    default:
      return unit.trim() ? `${fmtNum(v, digits)} ${unit.trim()}` : fmtNum(v, digits);
  }
}

/**
 * A change in a model value: pp for fractions ("+0.25 pp"), % of the baseline for indices
 * ("+1.2%"), the unit itself for money ("+0.4% of GDP/yr").
 */
export function fmtChange(d: number, unit: string, base?: number, digits?: number): string {
  switch (unitKind(unit)) {
    case 'fraction': {
      const pp = d * 100;
      return `${fmtSigned(pp, digits ?? Math.min(2, adaptiveDigits(pp)))} pp`;
    }
    case 'index':
      if (base !== undefined && Math.abs(base) > DUST) return `${fmtSigned((d / Math.abs(base)) * 100, digits ?? 2)}%`;
      return fmtSigned(d, digits ?? 3);
    case 'percent':
      return `${fmtSigned(d, digits)}${unit.trim()}`;
    case 'pp':
      return `${fmtSigned(d, digits)} ${unit.trim()}`;
    default:
      return unit.trim() ? `${fmtSigned(d, digits)} ${unit.trim()}` : fmtSigned(d, digits);
  }
}

/** A value for a tight space (player cards): percentages for fractions, bare numbers for money. */
export function fmtCompact(v: number, unit: string): string {
  switch (unitKind(unit)) {
    case 'fraction':
      return `${fmtNum(v * 100, 2)}%`;
    case 'index':
      return fmtNum(v, 3);
    default:
      return fmtNum(v);
  }
}

/** A change for a tight space: "+0.25pp" for fractions, "+1.2%" for indices, "+0.4" otherwise. */
export function fmtCompactChange(d: number, unit: string, base?: number): string {
  switch (unitKind(unit)) {
    case 'fraction':
      return `${fmtSigned(d * 100, 2)}pp`;
    case 'index':
      return base !== undefined && Math.abs(base) > DUST ? `${fmtSigned((d / Math.abs(base)) * 100, 1)}%` : fmtSigned(d, 3);
    default:
      return fmtSigned(d);
  }
}

/** The unit to print once above a column of compact values ("%" for fractions). */
export function unitCaption(unit: string): string {
  switch (unitKind(unit)) {
    case 'fraction':
      return `%${fractionTail(unit)}, changes in pp`;
    case 'index':
      return 'index, 1 = baseline';
    default:
      return unit.trim();
  }
}

/** A value already in an indicator's display units ("% vs baseline" → "+1.20%", "pp of GDP" → "+0.40 pp"). */
export function fmtIndicator(v: number, unit: string, display: 'deviation-pct' | 'deviation-pp' | 'deviation' | 'level' = 'deviation'): string {
  const u = unit.trim();
  if (display === 'level') return fmtValue(v, u);
  const digits = Math.abs(v) >= 10 ? 1 : 2;
  if (u.startsWith('% vs') || u === '%') return `${fmtSigned(v, digits)}%`;
  if (u.startsWith('pp')) return `${fmtSigned(v, digits)} pp`;
  return u ? `${fmtSigned(v, digits)} ${u}` : fmtSigned(v, digits);
}

/** Short unit label for an indicator axis ("% vs baseline" → "%", "pp of GDP" → "pp"). */
export function shortUnit(unit: string): string {
  const u = unit.trim();
  if (u.startsWith('%')) return '%';
  if (u.startsWith('pp')) return 'pp';
  return u;
}

/** Relative change as a percentage of the baseline, or null when the baseline is ~0. */
export function relChangePct(value: number, baseline: number): number | null {
  return Math.abs(baseline) > DUST ? ((value - baseline) / Math.abs(baseline)) * 100 : null;
}

/** The simulation clock. Month 0 is the baseline; months count up from there. */
export function fmtClock(t: number): { month: number; year: number; monthOfYear: number; label: string; short: string } {
  const m = Math.max(0, Math.round(t));
  const year = Math.floor(m / 12) + 1;
  const monthOfYear = (m % 12) + 1;
  return { month: m, year, monthOfYear, label: `Year ${year} · Month ${monthOfYear}`, short: `M${m}` };
}

/** Months as a duration: "5 months", "2 years", "2 yr 3 mo". */
export function fmtMonths(n: number): string {
  const m = Math.max(0, Math.round(n));
  if (m < 12) return `${m} month${m === 1 ? '' : 's'}`;
  const y = Math.floor(m / 12),
    r = m % 12;
  return r ? `${y} yr ${r} mo` : `${y} year${y === 1 ? '' : 's'}`;
}

/** Residual for the accounting badge: "1.2e−12". */
export function fmtResidual(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  return v.toExponential(1).replace('-', MINUS);
}
