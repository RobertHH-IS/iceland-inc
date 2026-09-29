/**
 * What the robustness layer asks of a run beyond the accounting: every value finite (variables,
 * stocks and the charts' indicator series), every variable inside its plausible bounds and every
 * position with the sign its role gives it. Each is a failure (decision 0005): the property runs, the lever-extremes sweep and the golden
 * scenarios fail on any breach.
 *
 * Plausibility has two parts:
 *   bounds   economic invariants on variables, found by id, kind and unit, in the model's own units
 *   signs    the kernel's position-sign diagnostic (CheckReport.signViolations): a holder's asset
 *            is not negative and an issuer's liability is not turned into a claim (real assets have
 *            holders only). Positions a model declares free to take either sign
 *            (InstrumentDef.mayGoNegative, listed in decision 0005) are left out by the kernel.
 */
import { ROLE_HOLDER, type KModel } from '../core/compile.ts';
import type { KernelEngine } from '../core/engine.ts';

/** Float noise allowed at a bound of zero. */
export const BOUND_TOL = 1e-9;
/** Highest plausible unemployment rate, as a fraction. */
export const MAX_UNEMPLOYMENT = 0.5;

export interface Bound {
  /** Variable index in the model. */
  k: number;
  id: string;
  /** In words, for the report: "in [0, 0.5]", "> 0". */
  rule: string;
  ok(x: number): boolean;
}

/**
 * The invariants that apply to this model's variables:
 *   unemployment rates (`unemployment…`, a ratio held as a fraction or in %) in [0, 50%];
 *   unemployed people (`unemployed…`, a quantity) not negative;
 *   price indices (kind 'price', unit 'index') above zero;
 *   the key rate (`keyRate`) not negative.
 */
export function plausibilityBounds(m: KModel): Bound[] {
  const out: Bound[] = [];
  m.vars.forEach((v, k) => {
    const add = (rule: string, ok: (x: number) => boolean) => out.push({ k, id: v.id, rule, ok });
    if (/^unemployment/.test(v.id) && v.kind === 'ratio' && (v.unit === 'fraction' || v.unit === '%')) {
      const hi = v.unit === '%' ? 100 * MAX_UNEMPLOYMENT : MAX_UNEMPLOYMENT;
      add(`in [0, ${hi}]`, (x) => x >= -BOUND_TOL && x <= hi + BOUND_TOL);
    } else if (/^unemployed/.test(v.id) && v.kind === 'quantity') add('≥ 0', (x) => x >= -BOUND_TOL);
    else if (v.kind === 'price' && v.unit === 'index') add('> 0', (x) => x > 0);
    else if (v.id === 'keyRate') add('≥ 0', (x) => x >= -BOUND_TOL);
  });
  return out;
}

export interface Breach {
  kind: 'bound' | 'sign';
  /** The variable, or `instrument / player`. */
  what: string;
  rule: string;
  /** First month it breaks the rule, and its furthest value from the rule (a position in the
   *  Ctx.stock convention, where holders' assets and issuers' liabilities are both positive). */
  first: number;
  worst: number;
}

/**
 * The first variable, stock or indicator that is not finite, in words, or '' when every value is
 * finite. Indicators are checked as the charts show them (display units), so a chart that divides
 * by a variable reaching zero fails even when every variable is finite (audit M22).
 */
export function firstNonFinite(m: KModel, e: KernelEngine): string {
  for (let t = 0; t <= e.t; t++) {
    for (const v of m.vars) if (!Number.isFinite(e.valueAt(v.id, t))) return `${v.id} is not finite at month ${t}`;
    if (!e.positionsAt(t).every(Number.isFinite)) return `a stock is not finite at month ${t}`;
  }
  for (const ind of m.indicators) {
    const bad = e.series(ind.id).find((p) => !Number.isFinite(p.v));
    if (bad) return `chart ${ind.id} is not finite at month ${bad.t}`;
  }
  return '';
}

/**
 * Every bound or sign a run breaks, once each, with the first month and the furthest value,
 * ordered by first month (bounds before signs within a month). Signs come from the kernel's
 * diagnostic, so they honour its tolerance and the model's declared exemptions.
 */
export function plausibilityBreaches(m: KModel, e: KernelEngine, bounds: Bound[] = plausibilityBounds(m)): Breach[] {
  const out: Breach[] = [];
  const seen = new Map<string, Breach>();
  for (let t = 0; t <= e.t; t++)
    for (const b of bounds) {
      const x = e.valueAt(b.id, t);
      if (b.ok(x)) continue;
      const found = seen.get(b.id);
      if (!found) {
        const nb: Breach = { kind: 'bound', what: b.id, rule: b.rule, first: t, worst: x };
        seen.set(b.id, nb);
        out.push(nb);
      } else if (Math.abs(x) > Math.abs(found.worst)) found.worst = x;
    }
  for (const v of e.checks().signViolations ?? []) {
    const i = m.instruments.findIndex((x) => x.id === v.instrument);
    const p = m.players.findIndex((x) => x.id === v.player);
    const j = i * m.NP + p;
    const sign = m.role[j] === ROLE_HOLDER ? 1 : -1;
    let worst = v.value;
    for (let t = v.t; t <= e.t; t++) worst = Math.min(worst, sign * e.positionsAt(t)[j]);
    out.push({ kind: 'sign', what: `${v.instrument} / ${v.player}`, rule: v.role === 'holder' ? 'holder’s asset ≥ 0' : 'issuer’s liability ≥ 0', first: v.t, worst });
  }
  return out.sort((a, b) => a.first - b.first || (a.kind === b.kind ? 0 : a.kind === 'bound' ? -1 : 1));
}
