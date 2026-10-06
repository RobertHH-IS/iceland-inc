/**
 * The model registry. The harness and the interface load `models` from here.
 *
 * Every model gets the shared concept library as an extra module named 'concepts', so the
 * concept ids its rules, terms, flows and levers use resolve to explanations.
 */
import type { ConceptDef, ModelDef } from '../core/types.ts';
import { referenceModel } from './reference/index.ts';
import { icelandModel } from './iceland/index.ts';
import { growingFinancialModel } from './iceland/growing-financial.ts';
import { icelandTodayModel } from './iceland/today/index.ts';
import { initialBaselineForGrowingModel } from './iceland/growth.ts';
import { createEngine, type EngineOptions, type KernelEngine } from '../core/engine.ts';
import { compile } from '../core/compile.ts';
import { solveBaseline } from '../core/steady.ts';
import { openingBaseline } from '../core/opening.ts';

/** The shared concept library, if it is present (it is written separately). Without it the
 *  models still run; the compiler just warns that their concept ids are undefined. */
async function loadConcepts(): Promise<ConceptDef[]> {
  try {
    // @ts-ignore: the library may not exist yet in a partial checkout
    const lib = (await import('../concepts/library.ts')) as { concepts?: ConceptDef[] };
    return Array.isArray(lib.concepts) ? lib.concepts : [];
  } catch {
    return [];
  }
}

export const conceptLibrary: ConceptDef[] = await loadConcepts();

/** Add the concept library as a module, keeping concepts the model defines itself. */
export function withConcepts(model: ModelDef, library: ConceptDef[] = conceptLibrary): ModelDef {
  if (!library.length || model.modules.some((m) => m.id === 'concepts')) return model;
  const own = new Set(model.modules.flatMap((m) => (m.concepts ?? []).map((c) => c.id)));
  const concepts = library.filter((c) => !own.has(c.id));
  return {
    ...model,
    modules: [...model.modules, { id: 'concepts', label: 'Concept library', description: 'Economic ideas with plain-English explanations.', concepts }],
  };
}

export const models: ModelDef[] = [withConcepts(referenceModel), withConcepts(icelandModel)];

/** The application opens on Iceland today (the growing variant with financial stress, opened on the
 *  dated snapshot); the fixed-point controls stay in `models`, and the growing variant stays
 *  registered so that older links still replay. */
export const applicationModels: ModelDef[] = [withConcepts(icelandTodayModel), withConcepts(growingFinancialModel), ...models];

/**
 * The engine an application model runs on. Its anchor state is the solved steady state, or the
 * growing variant's mapped state; a model with a dated opening (ModelDef.opening) starts from that
 * opening, built on the anchor and checked against its committed solution (opening.ts). A baseline
 * in `options` is used as it is.
 */
export function createRegisteredEngine(model: ModelDef, options: EngineOptions = {}): KernelEngine {
  if (options.baseline) return createEngine(model, options);
  const growth = model.modules.some((m) => m.id === 'growth');
  if (!model.opening) return createEngine(model, { ...options, ...(growth ? { baseline: initialBaselineForGrowingModel(model, options) } : {}) });
  const m = compile(model, { extraConcepts: options.extraConcepts });
  const anchor = growth ? initialBaselineForGrowingModel(model, options) : solveBaseline(m, { params: options.params, dev: options.dev, lagWindow: options.lagWindow });
  return createEngine(m, { ...options, baseline: openingBaseline(m, model.opening, anchor, { lagWindow: options.lagWindow, dev: options.dev }) });
}
