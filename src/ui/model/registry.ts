/**
 * Choosing a model from the registry. The interface lists whatever src/models/index.ts
 * registers, so a newly ported model appears without interface code.
 */
import type { Id, ModelDef } from '../../core/types.ts';
import type { DatedModelDef } from './contract.ts';

/** Models the interface prefers to open, in order: Iceland today, then the stationary controls. */
export const PREFERRED_MODELS: Id[] = ['iceland-today', 'iceland', 'reference'];

/** Models a shared link may still open, though the model switcher does not list them: links
 *  shared before the application opened on Iceland today name 'iceland-growing'. */
export const LINK_ONLY_MODELS: Id[] = ['iceland-growing'];

/** The model to open: the one a link asks for if it exists, else Iceland today, else (until Iceland
 *  today is registered) the moving variant the link-only list names, which is nearer today than
 *  the stationary controls; then the controls, the first that is not link-only, or the first. */
export function pickModel(ids: Id[], requested?: Id | null): Id | undefined {
  if (requested && ids.includes(requested)) return requested;
  const [today, ...controls] = PREFERRED_MODELS;
  for (const p of [today, ...LINK_ONLY_MODELS, ...controls]) if (ids.includes(p)) return p;
  return ids.find((id) => !LINK_ONLY_MODELS.includes(id)) ?? ids[0];
}

/** The models the switcher lists: every registered one except the link-only ones, unless that is
 *  the one open (a link opened it). */
export function switcherModels<T extends { id: Id }>(models: readonly T[], open: Id): T[] {
  return models.filter((m) => !LINK_ONLY_MODELS.includes(m.id) || m.id === open);
}

/** What a model's changes are measured against: its no-change run for a model that grows or opens
 *  on a dated month 0, else its solved, stationary opening. */
export function comparisonFor(def: ModelDef): 'opening' | 'no-change' {
  return def.modules.some((m) => m.id === 'growth') || !!(def as DatedModelDef).opening ? 'no-change' : 'opening';
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
