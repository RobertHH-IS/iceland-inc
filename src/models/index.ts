/**
 * The model registry. The harness and the interface load `models` from here.
 *
 * Every model gets the shared concept library as an extra module named 'concepts', so the
 * concept ids its rules, terms, flows and levers use resolve to explanations.
 */
import type { ConceptDef, ModelDef } from '../core/types.ts';
import { referenceModel } from './reference/index.ts';

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

export const models: ModelDef[] = [withConcepts(referenceModel)];
