/**
 * Iceland Inc.: small helpers shared by the modules.
 *
 * `gapShare` is the partial-adjustment share v1 used everywhere: a gap closed at speed λ per year
 * shrinks by the factor e^(−λ·dt) each step, so 1 − e^(−λ·dt) of it is closed. Rules that are
 * *flows* closing a stock gap use `gapRate` (that share per step, as an annual rate); rules for
 * state variables use the kernel's `adjust: { speed, form: 'exponential' }`, which is the same
 * arithmetic.
 */
import type { Ctx, Id, ParamDef, Provenance, RuleDef } from '../../core/types.ts';
import raw from '../../../data/iceland/calibration.json' with { type: 'json' };

/** Share of a gap closed in one step at speed λ per year (v1's kf). */
export const gapShare = (lam: number, dt: number): number => 1 - Math.exp(-lam * dt);

/** A gap closed at speed λ per year, expressed as a flow per year: (1 − e^(−λ·dt)) / dt. */
export const gapRate = (lam: number, dt: number): number => (1 - Math.exp(-lam * dt)) / dt;

/** How fast any holder can draw down deposits (or króna holdings) to pay for something, as a yearly
 *  rate: the share 1 − e^(−liquiditySpeed·dt) of them in a step, ÷ dt. Every liquidity limit in the
 *  model (households' cash in hand, the pension funds' and non-residents' cash for purchases,
 *  non-residents' repayments) uses it; a rule that calls it declares params ['liquiditySpeed']. */
export const liquidRate = (c: Ctx): number => gapRate(c.p('liquiditySpeed'), c.dt);

/** Annuity factor: the yearly payment per króna of a loan at rate r over T years. */
export const annuity = (r: number, T: number): number => (Math.abs(r) < 1e-12 ? 1 / T : r / (1 - Math.pow(1 + r, -T)));

/** One step as a fraction of a year, rounded to whole steps: "n years ago" for lag(). */
export const stepsIn = (c: Ctx, years: number): number => Math.max(1, Math.round(years / c.dt));

/** A variable's value one month ago. Behaviour reacts to last month's news whatever the step
 *  length, so halving the step does not halve the model's reaction lags (at the standard step of
 *  one month this is simply the previous step). Accounting lags (this step's change in a price)
 *  use c.lag(id) directly. */
export const lastMonth = (c: Ctx, id: Id): number => c.lag(id, stepsIn(c, 1 / 12));

/** The global stabiliser setting (modules/stabilisers.ts): 0 Manual, 1 Automatic. A rule that reads
 *  it declares `levers: [STABILISERS]`. */
export const STABILISERS = 'stabilisers';
export const MANUAL = 0;
export const AUTOMATIC = 1;
/** True when the policy rules act (Automatic); false when policy levers are held (Manual). */
export const automatic = (c: Ctx): boolean => Math.round(c.lever(STABILISERS)) >= AUTOMATIC;

/** Age groups of households and the two borrowing groups. */
export const AGES = ['Y', 'W', 'O'] as const;
export type Age = (typeof AGES)[number];
export const BORROWERS = ['Y', 'W'] as const;
export const HH: Record<Age, Id> = { Y: 'HY', W: 'HW', O: 'HO' };
export const AGE_LABEL: Record<Age, string> = { Y: 'young (18–34)', W: 'working-age (35–66)', O: 'older (67+)' };
export const AGE_SHORT: Record<Age, string> = { Y: 'young', W: 'working-age', O: 'older' };

/** Firms by sector (decision 0003): two domestic sectors and four exporters. */
export const DOMESTIC = ['FC', 'FR'] as const;
export const EXPORTERS = ['XF', 'XA', 'XT', 'XO'] as const;
export const FIRMS = [...DOMESTIC, ...EXPORTERS] as const;
export type Firm = (typeof FIRMS)[number];
export type Exporter = (typeof EXPORTERS)[number];
export const isExporter = (j: Firm): j is Exporter => j[0] === 'X';
/** Lower-case names for sentences ("wages {name} pay"). */
export const FIRM_NAME: Record<Firm, string> = {
  FC: 'construction firms',
  FR: 'retail and service firms',
  XF: 'fisheries',
  XA: 'aluminium smelters',
  XT: 'tourism firms',
  XO: 'other exporters',
};
/** The export line each exporter sells (ids used by external.ts: exportsFish, exportVolumeFish, …). */
export const EXPORT_OF: Record<Exporter, 'Fish' | 'Aluminium' | 'Tourism' | 'Other'> = { XF: 'Fish', XA: 'Aluminium', XT: 'Tourism', XO: 'Other' };
/** Baseline real value added: data for five sectors (gva*), the residual for retail and services. */
export const VA0: Record<Firm, Id> = { FC: 'gvaFC', FR: 'vaFR0', XF: 'gvaXF', XA: 'gvaXA', XT: 'gvaXT', XO: 'gvaXO' };

/* ------------------------------------------------------------------ data */

interface Leaf {
  value: number;
  unit?: string;
  year?: number | string;
  source?: string;
}

/** 2025 nominal GDP, bn ISK (Hagstofa THJ01102), used to turn bn ISK into % of GDP. */
export const GDP_BN = 4941.211;

/** A leaf of data/iceland/calibration.json by dotted path, e.g. 'cpi_weights.housing'. */
export function datum(path: string): Leaf {
  let o: unknown = raw;
  for (const k of path.split('.')) o = (o as Record<string, unknown>)?.[k];
  const leaf = o as Leaf | undefined;
  if (!leaf || typeof leaf.value !== 'number' || !Number.isFinite(leaf.value)) throw new Error(`calibration.json has no numeric value at '${path}'`);
  return leaf;
}

/** Provenance for a value read from calibration.json. */
export function dataProv(path: string, note?: string): Provenance {
  const d = datum(path);
  return { basis: 'data', source: `${d.source} [calibration.json: ${path}]`, vintage: String(d.year ?? ''), note };
}

export const assumed = (note?: string): Provenance => ({ basis: 'assumed', note });
export const placeholder = (note?: string): Provenance => ({ basis: 'placeholder', note: note ?? 'Placeholder until better data are found (as in engine v1).' });
/** Tuned in engine v1 against the calibration checks (SPEC §7.3). */
export const tuned = (what = 'the calibration checks'): Provenance => ({ basis: 'calibrated', note: `Tuned in engine v1 against ${what} (legacy/v1-engine/SPEC.md §7.3).` });
export const derived = (note: string): Provenance => ({ basis: 'derived', note });
export const solved = (note: string): Provenance => ({ basis: 'calibrated', note: `Solved by the steady state: ${note}` });

/* ---------------------------------------------------------- rule helpers */

/** Terms of a rule, from [id, label, concept, compute] tuples. */
export function terms(...ts: [id: Id, label: string, concept: Id | undefined, compute: (c: Ctx) => number][]): RuleDef['terms'] {
  return ts.map(([id, label, concept, compute]) => (concept ? { id, label, concept, compute } : { id, label, compute }));
}

/** Pick parameter definitions by id from a table (each module owns the ones it lists). */
export function pickParams(table: Record<Id, ParamDef>, ids: Id[]): ParamDef[] {
  return ids.map((id) => {
    const p = table[id];
    if (!p) throw new Error(`Iceland model: unknown parameter '${id}'`);
    return p;
  });
}

/** Sum of a list of numbers. */
export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Sum of a rule's named terms, for a `combine` that floors or caps the sum (AGENTS.md rule 4). */
export const sumTerms = (t: Record<Id, number>): number => sum(Object.values(t));
