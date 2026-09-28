/**
 * Ideas at play: which economic ideas are doing the work, for a selection or the whole economy.
 * engine.ideasAtPlay(scope) weights each concept by how far the terms tagged with it have moved
 * from baseline (in comparable units); these helpers rank and describe the result.
 */
import type { Id, Pipe } from '../../core/types.ts';
import type { ModelInfo } from './info.ts';
import type { Selection } from './navigation.ts';
import { viaTarget } from './navigation.ts';

export interface IdeaRow {
  concept: Id;
  title: string;
  oneLiner: string;
  weight: number;
  /** Weight relative to the top idea (0..1), for the bar. */
  rel: number;
  /** Share of the total weight of the ideas listed (0..1). */
  share: number;
  via: { id: Id; label: string; selection: Selection | null }[];
  moreVia: number;
}

/** Rank the ideas: known concepts only, top `n`, with bars and readable "via" labels. */
export function topIdeas(info: ModelInfo, raw: { concept: Id; weight: number; via: Id[] }[], n = 8, viaMax = 3): IdeaRow[] {
  const known = raw.filter((r) => info.conceptById.has(r.concept) && r.weight > 0);
  const total = known.reduce((s, r) => s + r.weight, 0);
  const top = known.slice(0, n);
  const max = top.length ? top[0].weight : 1;
  return top.map((r) => {
    const c = info.conceptById.get(r.concept)!;
    const via = r.via.slice(0, viaMax).map((id) => {
      const t = viaTarget(info, id);
      return { id, label: t?.label ?? id, selection: t?.selection ?? null };
    });
    return { concept: r.concept, title: c.title, oneLiner: c.oneLiner, weight: r.weight, rel: r.weight / max, share: total > 0 ? r.weight / total : 0, via, moreVia: Math.max(0, r.via.length - viaMax) };
  });
}

/**
 * Concepts attached to a selection by the model itself (not weighted by movement). Shown when
 * nothing has moved yet, so the panel still says which ideas the selection expresses.
 */
export function staticConcepts(info: ModelInfo, s: Selection | null, pipe?: Pipe): Id[] {
  const out = new Set<Id>();
  const addRule = (varId: Id) => {
    const r = info.ruleByTarget.get(varId);
    if (!r) return;
    r.concepts.forEach((c) => out.add(c));
    r.terms.forEach((t) => t.concept && out.add(t.concept));
  };
  if (!s) {
    for (const f of info.flows) (f.concepts ?? []).forEach((c) => out.add(c));
  } else if (s.kind === 'pipe') {
    for (const leg of pipe?.legs ?? []) {
      (info.flowById.get(leg.flow)?.concepts ?? []).forEach((c) => out.add(c));
      for (const i of info.legsByKey.get(`${leg.flow}\u0000${leg.from}\u0000${leg.to}`) ?? []) addRule(info.legs[i].amount);
    }
  } else if (s.kind === 'var') addRule(s.id);
  else if (s.kind === 'flow') {
    (info.flowById.get(s.id)?.concepts ?? []).forEach((c) => out.add(c));
    for (const l of info.legs) if (l.flow === s.id) addRule(l.amount);
  } else if (s.kind === 'indicator') {
    const ind = info.indicatorById.get(s.id);
    (ind?.concepts ?? []).forEach((c) => out.add(c));
  } else if (s.kind === 'player' || s.kind === 'group') {
    const members = new Set(s.kind === 'player' ? [s.id] : (info.groupById.get(s.id)?.players ?? []));
    for (const ins of info.instruments) if ([...ins.holders, ...ins.issuers].some((p) => members.has(p))) (ins.concepts ?? []).forEach((c) => out.add(c));
  } else if (s.kind === 'concept') (info.conceptById.get(s.id)?.related ?? []).forEach((c) => out.add(c));
  return [...out].filter((c) => info.conceptById.has(c));
}
