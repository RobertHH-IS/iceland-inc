/**
 * Choosing a model from the registry. The interface lists whatever src/models/index.ts
 * registers, so a newly ported model appears without interface code.
 */
import type { Id } from '../../core/types.ts';

/** Models the interface prefers to open, in order. */
export const PREFERRED_MODELS: Id[] = ['iceland-growing', 'iceland', 'reference'];

/** The model to open: the one a link asks for if it exists, else the first preferred one present, else the first. */
export function pickModel(ids: Id[], requested?: Id | null): Id | undefined {
  if (requested && ids.includes(requested)) return requested;
  for (const p of PREFERRED_MODELS) if (ids.includes(p)) return p;
  return ids[0];
}

/**
 * What to do with a scenario link pasted while a model is open. A link for a model that is not
 * available is refused (with a notice) and changes nothing: the current run stays as it is, and
 * the link is never replayed on another model. A link that names no model is for the current one.
 */
export type LinkTarget = { kind: 'unavailable'; modelId: Id } | { kind: 'switch'; id: Id } | { kind: 'current'; id: Id };

export function linkTarget(ids: Id[], current: Id, requested?: Id | null): LinkTarget {
  if (!requested || requested === current) return { kind: 'current', id: current };
  if (!ids.includes(requested)) return { kind: 'unavailable', modelId: requested };
  return { kind: 'switch', id: requested };
}
