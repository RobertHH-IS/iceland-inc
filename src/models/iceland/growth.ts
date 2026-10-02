/** Public construction API for the explicitly evolving Iceland teaching variant. */
import { compile } from '../../core/compile.ts';
import { createEngine, type EngineOptions, type KernelEngine } from '../../core/engine.ts';
import type { Baseline } from '../../core/steady.ts';
import type { Ctx, ModelDef } from '../../core/types.ts';
import { concepts } from '../../concepts/library.ts';
import { icelandModel } from './index.ts';
import { FIRMS } from './util.ts';
import { createGrowthModule, effectiveRules, GROWTH_DEFAULTS, GROWTH_PROFILE, growthAnchor, type GrowthAssumptions } from './modules/growth.ts';

export { GROWTH_DEFAULTS, GROWTH_PROFILE } from './modules/growth.ts';
export interface GrowingIcelandOptions extends Partial<GrowthAssumptions> {
  id?: string;
  /** A mechanism-enhanced stationary definition, before growth wraps its effective rules. */
  baseModel?: ModelDef;
  additionalModules?: ModelDef['modules'];
  /** Applied after growth; e.g. caps actual investment with financing approvals. */
  modelTransform?: (model: ModelDef) => ModelDef;
  /** Kernel steps per recorded month; monthly time and annual assumptions are unchanged. */
  substeps?: number;
}

const addConcepts = (model: ModelDef): ModelDef => {
  if (model.modules.some((m) => m.id === 'concepts')) return model;
  const own = new Set(model.modules.flatMap((m) => m.concepts ?? []).map((c) => c.id));
  return { ...model, modules: [...model.modules, { id: 'concepts', label: 'Concept library', description: 'Economic ideas.', concepts: concepts.filter((c) => !own.has(c.id)) }] };
};

export function createGrowingIcelandModel(options: GrowingIcelandOptions = {}): ModelDef {
  const assumptions: GrowthAssumptions = { ...GROWTH_DEFAULTS,
    ...Object.fromEntries(Object.keys(GROWTH_DEFAULTS).flatMap((id) => options[id as keyof GrowthAssumptions] === undefined ? [] : [[id, options[id as keyof GrowthAssumptions]]])),
  };
  for (const id of ['realGrowth', 'populationGrowth', 'worldGrowth', 'inflation'] as const) {
    if (!Number.isFinite(assumptions[id]) || assumptions[id] < 0 || assumptions[id] > 0.06) throw new Error(`${id}: expected an annual fraction between 0 and 0.06 for the growing teaching profile`);
  }
  if (!(Number.isFinite(assumptions.capitalElasticity) && assumptions.capitalElasticity >= 0 && assumptions.capitalElasticity <= 1)) throw new Error('capitalElasticity: expected a fraction between 0 and 1');
  if (options.substeps !== undefined && !(Number.isInteger(options.substeps) && options.substeps >= 1)) throw new Error('substeps: expected a positive whole number');
  const source = options.baseModel ?? icelandModel;
  if (source.modules.some((m) => m.id === 'growth')) throw new Error('Growth is already present; construct from the stationary source model');
  const model: ModelDef = {
    ...source, id: options.id ?? 'iceland-growth-reference', label: 'Iceland Inc. — growing reference',
    description: `${source.description} ${GROWTH_PROFILE.description} ${GROWTH_PROFILE.limitation}`,
    substeps: options.substeps ?? source.substeps,
    modules: [
      ...source.modules.map((m) => ({ ...m, params: m.params?.map((p) => p.id === 'piT' ? { ...p, value: assumptions.inflation, description: 'Inflation target for the growing teaching variant; initial actual inflation remains the stationary opening value.', provenance: { basis: 'assumed' as const, source: GROWTH_PROFILE.inflationSource, note: 'Default inspired by the CBI 2.5% target, not current observed inflation. i0 remains the neutral real rate.' } } : p) })),
      createGrowthModule(source, assumptions), ...(options.additionalModules ?? []),
    ],
    // The stationary mechanism calibration remains attached only to the stationary control.
    calibration: [],
  };
  return addConcepts(options.modelTransform ? options.modelTransform(model) : model);
}

/**
 * Map the original solved calibration into an evolving model's opening state by IDs.
 * No fixed-point claim is made for this variant; no positions are changed after startup.
 * Appended mechanism diagnostics are evaluated against the fixed opening state. A transform
 * may seed its additional state variables through steadyState.solve().vars or initialVars.
 */
export function initialBaselineForGrowingModel(model: ModelDef, engineOptions: EngineOptions = {}): Baseline {
  const m = compile(addConcepts(model));
  if (!model.modules.some((x) => x.id === 'growth')) throw new Error('Expected a model containing the growth module');
  const oldModel = compile(addConcepts({ ...icelandModel, substeps: model.substeps }));
  const stationaryParams = Object.fromEntries(Object.entries(engineOptions.params ?? {}).filter(([id]) => oldModel.paramIndex.has(id) && id !== 'piT'));
  const old = createEngine(oldModel, { dev: engineOptions.dev, solverTol: engineOptions.solverTol, maxIter: engineOptions.maxIter, lagWindow: engineOptions.lagWindow, params: stationaryParams }).baselineData;
  const pBase = new Float64Array(m.params.map((p) => {
    const anchor = p.id.startsWith('growthAnchor.') ? p.id.slice('growthAnchor.'.length) : p.id;
    const oi = oldModel.paramIndex.get(anchor);
    return engineOptions.params?.[p.id] ?? (p.id === 'piT' || oi === undefined ? p.value : old.pBase[oi]);
  }));
  const pRecord = Object.fromEntries(m.params.map((p, j) => [p.id, pBase[j]]));
  // A transformed solve may initialise new expectations/diagnostics; its stock solution is not
  // used to rescale the stationary opening portfolio.
  const seeded = { ...model.steadyState.initialVars, ...model.steadyState.solve?.(pRecord).vars };
  const vars = new Float64Array(m.vars.map((v) => {
    const oi = oldModel.varIndex.get(v.id);
    return oi === undefined ? seeded[v.id] ?? v.initial ?? 0 : old.vars[oi];
  }));
  const positions = new Float64Array(m.NI * m.NP);
  for (const [ins, i] of m.instrumentIndex) for (const [player, j] of m.playerIndex) {
    const oi = oldModel.instrumentIndex.get(ins), oj = oldModel.playerIndex.get(player);
    if (oi !== undefined && oj !== undefined) positions[i * m.NP + j] = old.positions[oi * oldModel.NP + oj];
  }
  const stock = (ins: string, player: string) => {
    const j = m.instrumentIndex.get(ins)! * m.NP + m.playerIndex.get(player)!;
    return m.role[j] === 2 ? -positions[j] : positions[j];
  };
  let initialCapital = 0;
  for (const j of FIRMS) {
    const capital = stock('capital', j);
    vars[m.varIndex.get(`productiveCapitalReal${j}`)!] = capital;
    initialCapital += capital;
  }
  vars[m.varIndex.get('productiveCapitalReal')!] = initialCapital;
  vars[m.varIndex.get('productiveCapacity')!] = old.vars[oldModel.varIndex.get('output')!];
  vars[m.varIndex.get('referenceCapacity')!] = old.vars[oldModel.varIndex.get('output')!];
  const dt = model.dt / (model.substeps ?? 1);
  const values = (v: string) => {
    const j = m.varIndex.get(v);
    if (j === undefined) throw new Error(`Opening context: unknown variable ${v}`);
    return vars[j];
  };
  const ctx = (mask: number): Ctx => ({ v: values, lag: values, p: (id) => pBase[m.paramIndex.get(id)!], stock,
    base: values, lever: (id) => {
      const j = m.leverIndex.get(id)!, l = m.clevers[j];
      return l.mode === 'replace' && l.bindParam >= 0 ? pBase[l.bindParam] / l.scale : m.levers[j].default;
    }, locked: (id) => !!(mask & (1 << m.stabilisers.findIndex((s) => s.id === id))), t: -dt, dt,
  });
  // The new states' initial definitions are meaningful at t=0. Only new algebraic diagnostics
  // are evaluated; advancing a lagged stock-like state would invent a pre-start transaction.
  const seedRules = effectiveRules(model).filter((r) => !oldModel.varIndex.has(r.target) && !m.lagged[m.varIndex.get(r.target)!]);
  for (let pass = 0; pass < seedRules.length + 1; pass++) {
    let changed = false;
    for (const r of seedRules) {
      const c = ctx(0);
      const t = Object.fromEntries((r.terms ?? []).map((term) => [term.id, term.compute(c)]));
      const x = r.terms ? r.combine ? r.combine(t, c) : Object.values(t).reduce((sum, value) => sum + value, 0) : r.compute!(c);
      const j = m.varIndex.get(r.target)!;
      changed ||= Math.abs(x - vars[j]) > 1e-13;
      vars[j] = x;
    }
    if (!changed) break;
  }
  // Matched physical/reference quantities may be lagged by the mechanism; they still have an
  // exact opening definition independent of that dependency graph.
  for (const id of ['growthRealIndex', 'growthPopulationIndex', 'growthProductivityIndex', 'growthWorldDemandIndex', 'growthPriceIndex']) vars[m.varIndex.get(id)!] = 1;
  for (const j of FIRMS) vars[m.varIndex.get(`productiveCapitalReal${j}`)!] = stock('capital', j);
  vars[m.varIndex.get('productiveCapitalReal')!] = initialCapital;
  vars[m.varIndex.get('productiveCapacity')!] = vars[m.varIndex.get('referenceCapacity')!] = old.vars[oldModel.varIndex.get('output')!];
  const byMask = Array.from({ length: 1 << m.stabilisers.length }, (_, mask) => {
    const c = ctx(mask), terms = new Float64Array(m.cterms.map((term) => term.def.compute(c)));
    const desired = new Float64Array(m.crules.map((r) => {
      if (!r.def.terms) return r.def.compute!(c);
      const t = Object.fromEntries(r.def.terms.map((term, j) => [term.id, terms[r.termStart + j]]));
      return r.def.combine ? r.def.combine(t, c) : Object.values(t).reduce((sum, value) => sum + value, 0);
    }));
    return { terms, desired };
  });
  for (const [j, x] of vars.entries()) if (!Number.isFinite(x)) throw new Error(`Non-finite opening variable ${m.vars[j].id}`);
  return { ...old, pBase, exoBase: new Float64Array(vars), positions, vars, terms: byMask[0].terms, desired: byMask[0].desired,
    byMask, regimes: m.crules.map(() => null), method: 'none', iterations: 0, targets: [],
    warnings: [...old.warnings, 'Opening portfolios and original variables come from the solved stationary calibration. This evolving reference is a transition, not a solved fixed point or an observed Iceland-today state.'],
  };
}

export function createGrowingIcelandEngine(options: GrowingIcelandOptions = {}, engineOptions: EngineOptions = {}): KernelEngine {
  const model = createGrowingIcelandModel(options);
  const baseline = engineOptions.baseline ?? initialBaselineForGrowingModel(model, engineOptions);
  return createEngine(model, { ...engineOptions, baseline });
}
