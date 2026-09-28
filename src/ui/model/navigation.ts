/**
 * What the inspector shows, and breadcrumb navigation through what the user clicked.
 * Pure data and reducers.
 */
import type { FlowKind, Id } from '../../core/types.ts';
import type { ModelInfo } from './info.ts';
import { nodeLabel, varLabel } from './info.ts';

/** What the inspector shows. A pipe is named by its two ends, players or groups at any level
 *  of the hierarchy: it is every leg of its kind from a player of `from` to a player of `to`,
 *  so it stays the same pipe whatever is open on the map. */
export type Selection =
  | { kind: 'pipe'; from: Id; to: Id; flowKind: FlowKind }
  | { kind: 'player'; id: Id }
  | { kind: 'group'; id: Id }
  | { kind: 'var'; id: Id }
  | { kind: 'flow'; id: Id }
  | { kind: 'indicator'; id: Id }
  | { kind: 'concept'; id: Id };

export interface NavState {
  stack: Selection[];
  /** Index of the current item in `stack`, or −1 when nothing is selected. With the inspector
   *  closed, the item that was closed is the last one in `stack`, so Back reopens it. */
  index: number;
}

export const EMPTY_NAV: NavState = { stack: [], index: -1 };

export function selectionKey(s: Selection): string {
  return s.kind === 'pipe' ? `pipe:${s.from}->${s.to}:${s.flowKind}` : `${s.kind}:${s.id}`;
}

export function sameSelection(a: Selection | null | undefined, b: Selection | null | undefined): boolean {
  return !!a && !!b && selectionKey(a) === selectionKey(b);
}

export function navCurrent(n: NavState): Selection | null {
  return n.index >= 0 ? (n.stack[n.index] ?? null) : null;
}

/** Open a selection: drops any "forward" history, and does nothing if it is already current.
 *  After a close, the new selection is added after the one that was closed. */
export function navPush(n: NavState, s: Selection, limit = 50): NavState {
  if (sameSelection(navCurrent(n), s)) return n;
  const keep = n.index < 0 ? n.stack.length : n.index + 1;
  const stack = [...n.stack.slice(0, keep), s];
  const over = Math.max(0, stack.length - limit);
  return { stack: stack.slice(over), index: stack.length - 1 - over };
}

/** Back: the previous item, or, with the inspector closed, the item that was closed. */
export function navBack(n: NavState): NavState {
  if (n.index < 0) return n.stack.length ? { ...n, index: n.stack.length - 1 } : n;
  return n.index > 0 ? { ...n, index: n.index - 1 } : n;
}

export function navForward(n: NavState): NavState {
  return canForward(n) ? { ...n, index: n.index + 1 } : n;
}

export function navGo(n: NavState, index: number): NavState {
  return index >= 0 && index < n.stack.length ? { ...n, index } : n;
}

/** Close the inspector. The history up to the closed item is kept, so Back reopens it. */
export function navClear(n: NavState): NavState {
  return n.index < 0 ? n : { stack: [...n.stack.slice(0, n.index + 1)], index: -1 };
}

export const canBack = (n: NavState) => n.index > 0 || (n.index < 0 && n.stack.length > 0);
/** Nothing lies ahead of a closed inspector: the closed item was the last. */
export const canForward = (n: NavState) => n.index >= 0 && n.index < n.stack.length - 1;

/** The ideasAtPlay scope for a selection (undefined = the whole economy). */
export function selectionScope(s: Selection | null): Id | undefined {
  if (!s) return undefined;
  switch (s.kind) {
    case 'pipe':
      return `${s.from}->${s.to}:${s.flowKind}`;
    case 'concept':
      return undefined;
    default:
      return s.id;
  }
}

/** Short label for breadcrumbs and headings. */
export function selectionLabel(s: Selection, info: ModelInfo): string {
  switch (s.kind) {
    case 'pipe':
      return `${nodeLabel(info, s.from)} → ${nodeLabel(info, s.to)}`;
    case 'player':
    case 'group':
      return nodeLabel(info, s.id);
    case 'var':
      return varLabel(info, s.id);
    case 'flow':
      return info.flowById.get(s.id)?.label ?? s.id;
    case 'indicator':
      return info.indicatorById.get(s.id)?.label ?? s.id;
    case 'concept':
      return info.conceptById.get(s.id)?.title ?? s.id;
  }
}

/** Does a selection still exist in this model (after a model switch or a stale link)? */
export function selectionValid(s: Selection, info: ModelInfo): boolean {
  switch (s.kind) {
    case 'pipe':
      return (info.playerById.has(s.from) || info.groupById.has(s.from)) && (info.playerById.has(s.to) || info.groupById.has(s.to));
    case 'player':
      return info.playerById.has(s.id);
    case 'group':
      return info.groupById.has(s.id);
    case 'var':
      return info.varById.has(s.id);
    case 'flow':
      return info.flowById.has(s.id);
    case 'indicator':
      return info.indicatorById.has(s.id);
    case 'concept':
      return info.conceptById.has(s.id);
  }
}

/** What an ideas-at-play "via" id points to: a term key, a rule id or a flow id. */
export function viaTarget(info: ModelInfo, via: Id): { label: string; selection: Selection } | null {
  const term = info.termByKey.get(via);
  if (term) return { label: `${term.term.label} (${varLabel(info, term.rule.target)})`, selection: { kind: 'var', id: term.rule.target } };
  const rule = info.ruleById.get(via);
  if (rule) return { label: rule.label ?? varLabel(info, rule.target), selection: { kind: 'var', id: rule.target } };
  const flow = info.flowById.get(via);
  if (flow) return { label: flow.label, selection: { kind: 'flow', id: flow.id } };
  return null;
}
