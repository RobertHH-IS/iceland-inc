/**
 * Choosing a model from the registry. The interface lists whatever src/models/index.ts
 * registers, so a newly ported model appears without interface code.
 */
import type { Id } from '../../core/types.ts';

/** Models the interface prefers to open, in order. */
export const PREFERRED_MODELS: Id[] = ['iceland', 'reference'];

/** The model to open: the one a link asks for if it exists, else the first preferred one present, else the first. */
export function pickModel(ids: Id[], requested?: Id | null): Id | undefined {
  if (requested && ids.includes(requested)) return requested;
  for (const p of PREFERRED_MODELS) if (ids.includes(p)) return p;
  return ids[0];
}
