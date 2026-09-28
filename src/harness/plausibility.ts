/**
 * What the robustness layer asks of a run beyond the accounting: every value finite (a failure),
 * and plausible values (warnings for now; `Severity` switches them to failures).
 *
 * Plausibility has two parts:
 *   bounds   economic invariants on variables, found by id, kind and unit, in the model's own units
 *   signs    every position has the sign its role gives it: a holder's asset is not negative, an
 *            issuer's liability is not positive (real assets have holders only)
 *
 * The sign test here is the harness's own reading of architecture §4.4 and audit H1. When the
 * kernel reports sign breaches itself, read them from the engine instead.
 */
import { ROLE_HOLDER, ROLE_ISSUER, type KModel } from '../core/compile.ts';
import type { KernelEngine } from '../core/engine.ts';

export type Severity = 'warn' | 'fail';

/** Float noise allowed at a bound of zero. */
export const BOUND_TOL = 1e-9;
/** Allowed wrong-signed position, in % of baseline GDP: far above float noise, far below anything visible. */
export const SIGN_TOL = 1e-6;
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
  /** First month it breaks the rule, and its furthest value from the rule. */
  first: number;
  worst: number;
}

/** The first variable or stock that is not finite, in words, or '' when every value is finite. */
export function firstNonFinite(m: KModel, e: KernelEngine): string {
  for (let t = 0; t <= e.t; t++) {
    for (const v of m.vars) if (!Number.isFinite(e.valueAt(v.id, t))) return `${v.id} is not finite at month ${t}`;
    if (!e.positionsAt(t).every(Number.isFinite)) return `a stock is not finite at month ${t}`;
  }
  return '';
}

/** Every bound or sign a run breaks, once each, with the first month and the furthest value. */
export function plausibilityBreaches(m: KModel, e: KernelEngine, bounds: Bound[] = plausibilityBounds(m)): Breach[] {
  const found = new Map<string, Breach>();
  const note = (kind: Breach['kind'], what: string, rule: string, t: number, x: number, further: (a: number, b: number) => boolean) => {
    const b = found.get(what);
    if (!b) found.set(what, { kind, what, rule, first: t, worst: x });
    else if (further(x, b.worst)) b.worst = x;
  };
  for (let t = 0; t <= e.t; t++) {
    for (const b of bounds) {
      const x = e.valueAt(b.id, t);
      if (!b.ok(x)) note('bound', b.id, b.rule, t, x, (a, w) => Math.abs(a) > Math.abs(w));
    }
    const pos = e.positionsAt(t);
    for (let i = 0; i < m.NI; i++)
      for (let p = 0; p < m.NP; p++) {
        const j = i * m.NP + p;
        const what = () => `${m.instruments[i].id} / ${m.players[p].id}`;
        if (m.role[j] === ROLE_HOLDER && pos[j] < -SIGN_TOL) note('sign', what(), 'holder ≥ 0', t, pos[j], (a, w) => a < w);
        else if (m.role[j] === ROLE_ISSUER && pos[j] > SIGN_TOL) note('sign', what(), 'issuer ≤ 0', t, pos[j], (a, w) => a > w);
      }
  }
  return [...found.values()];
}
