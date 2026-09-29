/**
 * ModelInfo: everything the views need to know about a compiled model, as plain data.
 *
 * The compiled model carries functions (rules, terms, indicators, one-off shocks). Views never
 * see those: they read this description, built once per model. It is structured-clonable, so a
 * Web Worker engine could send it across in one message.
 */
import type {
  Account,
  Category,
  CompiledModel,
  ConceptDef,
  FeedRule,
  FlowDef,
  FlowKind,
  Id,
  IndicatorDef,
  InstrumentDef,
  LeverDef,
  ParamDef,
  PlayerDef,
  Posting,
  StabiliserDef,
  VarDef,
} from '../../core/types.ts';
import type { KModel } from '../../core/compile.ts';

export type LeverInfo = Omit<LeverDef, 'fire'> & { index: number };
export type IndicatorInfo = Omit<IndicatorDef, 'compute'> & { index: number };
/** A stabiliser as plain data: its `current` function stays in the engine. */
export type StabiliserInfo = Omit<StabiliserDef, 'current'>;
export type FlowInfo = FlowDef & { index: number };

/** One payer → payee leg, in the order engine.legs() returns them. */
export interface LegInfo {
  index: number;
  flow: Id;
  from: Id;
  to: Id;
  /** The variable that sets the leg's amount (its influence explains the leg). */
  amount: Id;
  kind: FlowKind;
  account: Account;
  posting: Posting['type'];
  /** A real asset revalued or written off: posts to its holder only. */
  oneSided: boolean;
  baseline: number;
}

export interface TermInfo {
  id: Id;
  /** 'ruleId.termId', as ideasAtPlay reports it. */
  key: string;
  label: string;
  concept?: Id;
}

export interface RuleInfo {
  id: Id;
  target: Id;
  category: Category;
  label?: string;
  what: string;
  concepts: Id[];
  terms: TermInfo[];
  inputs: Id[];
  lagInputs: Id[];
  stocks: [Id, Id][];
  hasRegime: boolean;
  nonAdditive: boolean;
  adjusts: boolean;
}

/** A group of the player hierarchy: `players` are direct members, `allPlayers` every
 *  descendant player, `children` the direct sub-groups (see CompiledModel.groups). */
export type GroupInfo = CompiledModel['groups'][number];

export interface ModelInfo {
  id: Id;
  label: string;
  description: string;
  dt: number;
  players: PlayerDef[];
  groups: GroupInfo[];
  instruments: InstrumentDef[];
  vars: VarDef[];
  params: ParamDef[];
  flows: FlowInfo[];
  legs: LegInfo[];
  rules: RuleInfo[];
  levers: LeverInfo[];
  indicators: IndicatorInfo[];
  concepts: ConceptDef[];
  feed: FeedRule[];
  /** Declared stabilisers (automatic policy reactions), each with a padlock on its lever (a lever
   *  of kind 'lock' in `levers`, decision 0010). */
  stabilisers: StabiliserInfo[];
  warnings: string[];
  /* lookups */
  varById: Map<Id, VarDef>;
  paramById: Map<Id, ParamDef>;
  playerById: Map<Id, PlayerDef>;
  groupById: Map<Id, GroupInfo>;
  /** A player's own group (its direct parent), or the player's id when it has none. */
  groupOf: Map<Id, Id>;
  /** Enclosing groups of every player and group, outermost first ([] at the top level). */
  ancestorsOf: Map<Id, Id[]>;
  /** The top of the map: top-level groups and players outside any group, in model order. */
  roots: Id[];
  flowById: Map<Id, FlowInfo>;
  leverById: Map<Id, LeverInfo>;
  indicatorById: Map<Id, IndicatorInfo>;
  conceptById: Map<Id, ConceptDef>;
  ruleById: Map<Id, RuleInfo>;
  ruleByTarget: Map<Id, RuleInfo>;
  termByKey: Map<string, { rule: RuleInfo; term: TermInfo }>;
  instrumentById: Map<Id, InstrumentDef>;
  /** Leg indices by 'flow\u0000from\u0000to' (usually one). */
  legsByKey: Map<string, number[]>;
  /** Players each regime rule most plausibly belongs to (for the badge on player cards). */
  regimeOwners: Map<Id, Id[]>;
}

export const legKey = (flow: Id, from: Id, to: Id): string => `${flow}\u0000${from}\u0000${to}`;

const byId = <T extends { id: Id }>(xs: T[]): Map<Id, T> => new Map(xs.map((x) => [x.id, x]));

/** Describe a compiled model as plain data. `baseline(varId)` gives a variable's baseline value. */
export function describeModel(m: KModel, baseline: (varId: Id) => number, warnings: string[] = m.warnings): ModelInfo {
  const flows: FlowInfo[] = m.flows.map((f, index) => ({ ...f, index }));
  const players = m.players.map((p) => ({ ...p }));
  const legs: LegInfo[] = m.clegs.map((l, index) => {
    const f = m.flows[l.flow];
    const amount = m.vars[l.amount].id;
    return {
      index,
      flow: f.id,
      from: m.players[l.from].id,
      to: m.players[l.to].id,
      amount,
      kind: f.kind,
      account: f.account,
      posting: f.posting.type,
      oneSided: l.oneSided,
      baseline: baseline(amount),
    };
  });
  const rules: RuleInfo[] = m.rules.map((r) => ({
    id: r.id,
    target: r.target,
    category: r.category,
    label: r.label,
    what: r.explain.what,
    concepts: [...(r.concepts ?? [])],
    terms: (r.terms ?? []).map((t) => ({ id: t.id, key: `${r.id}.${t.id}`, label: t.label, concept: t.concept })),
    inputs: [...(r.inputs ?? [])],
    lagInputs: [...(r.lagInputs ?? [])],
    stocks: (r.stocks ?? []).map(([i, p]) => [i, p] as [Id, Id]),
    hasRegime: !!r.regime,
    nonAdditive: !!r.combine,
    adjusts: !!r.adjust,
  }));
  const levers: LeverInfo[] = m.levers.map((l, index) => {
    const { fire: _fire, ...rest } = l;
    return { ...rest, index };
  });
  const indicators: IndicatorInfo[] = m.indicators.map((ind, index) => {
    const { compute: _compute, ...rest } = ind;
    return { ...rest, index };
  });
  const groups: GroupInfo[] = m.groups.map((g) => ({ ...g, children: [...g.children], players: [...g.players], allPlayers: [...g.allPlayers], ...(g.layout ? { layout: { ...g.layout } } : {}) }));
  const groupIds = new Set(groups.map((g) => g.id));
  const groupOf = new Map<Id, Id>(players.map((p) => [p.id, p.group && groupIds.has(p.group) ? p.group : p.id]));
  const ancestorsOf = new Map<Id, Id[]>();
  for (const g of groups) ancestorsOf.set(g.id, g.parent ? [...ancestorsOf.get(g.parent)!, g.parent] : []);
  for (const p of players) ancestorsOf.set(p.id, p.group && groupIds.has(p.group) ? [...ancestorsOf.get(p.group)!, p.group] : []);
  const firstPlayer = new Map<Id, number>();
  players.forEach((p, i) => ancestorsOf.get(p.id)!.forEach((g) => firstPlayer.has(g) || firstPlayer.set(g, i)));
  const roots = [
    ...groups.filter((g) => !g.parent).map((g) => ({ id: g.id, at: firstPlayer.get(g.id) ?? Infinity })),
    ...players.flatMap((p, i) => (ancestorsOf.get(p.id)!.length ? [] : [{ id: p.id, at: i }])),
  ]
    .sort((a, b) => a.at - b.at)
    .map((r) => r.id);

  const termByKey = new Map<string, { rule: RuleInfo; term: TermInfo }>();
  for (const r of rules) for (const t of r.terms) termByKey.set(t.key, { rule: r, term: t });
  const legsByKey = new Map<string, number[]>();
  for (const l of legs) {
    const k = legKey(l.flow, l.from, l.to);
    const arr = legsByKey.get(k);
    if (arr) arr.push(l.index);
    else legsByKey.set(k, [l.index]);
  }

  return {
    id: m.def.id,
    label: m.def.label,
    description: m.def.description,
    dt: m.def.dt,
    players,
    groups,
    instruments: m.instruments.map((i) => ({ ...i })),
    vars: m.vars.map((v) => ({ ...v })),
    params: m.params.map((p) => ({ ...p })),
    flows,
    legs,
    rules,
    levers,
    indicators,
    concepts: m.concepts.map((c) => ({ ...c })),
    feed: m.feed.map((f) => ({ ...f })),
    stabilisers: m.stabilisers.map(({ current: _current, ...s }) => ({ ...s, ...(s.concepts ? { concepts: [...s.concepts] } : {}), ...(s.feed ? { feed: { ...s.feed } } : {}), ...(s.shadow ? { shadow: [...s.shadow] } : {}) })),
    warnings: [...warnings],
    varById: byId(m.vars),
    paramById: byId(m.params),
    playerById: byId(players),
    groupById: byId(groups),
    groupOf,
    ancestorsOf,
    roots,
    flowById: byId(flows),
    leverById: byId(levers),
    indicatorById: byId(indicators),
    conceptById: byId(m.concepts),
    ruleById: byId(rules),
    ruleByTarget: new Map(rules.map((r) => [r.target, r])),
    termByKey,
    instrumentById: byId(m.instruments),
    legsByKey,
    regimeOwners: regimeOwners(rules, legs),
  };
}

/**
 * Which players a rule with a regime belongs to. The model language does not say, so this is a
 * heuristic: the players whose stocks the rule reads, plus the payers of legs whose amount is
 * the rule's target; failing that, the payers of legs one or two steps downstream.
 */
export function regimeOwners(rules: RuleInfo[], legs: LegInfo[]): Map<Id, Id[]> {
  const readers = new Map<Id, Id[]>();
  for (const r of rules)
    for (const v of [...r.inputs, ...r.lagInputs]) {
      const arr = readers.get(v);
      if (arr) arr.push(r.target);
      else readers.set(v, [r.target]);
    }
  const payersOf = (vars: Set<Id>) => {
    const out = new Set<Id>();
    for (const l of legs) if (vars.has(l.amount)) out.add(l.from);
    return out;
  };
  const out = new Map<Id, Id[]>();
  for (const r of rules) {
    if (!r.hasRegime) continue;
    const owners = new Set<Id>(r.stocks.map(([, p]) => p));
    let frontier = new Set<Id>([r.target]);
    const seen = new Set<Id>(frontier);
    for (let depth = 0; depth < 3; depth++) {
      const payers = payersOf(frontier);
      if (payers.size || depth === 2) {
        payers.forEach((p) => owners.add(p));
        if (payers.size) break;
      }
      const next = new Set<Id>();
      for (const v of frontier) for (const w of readers.get(v) ?? []) if (!seen.has(w)) (seen.add(w), next.add(w));
      frontier = next;
      if (!frontier.size) break;
    }
    out.set(r.id, [...owners]);
  }
  return out;
}

/** Label for a variable, falling back to its id. */
export function varLabel(info: ModelInfo, id: Id): string {
  return info.varById.get(id)?.label ?? id;
}

/** Label for a player or group node. */
export function nodeLabel(info: ModelInfo, id: Id): string {
  return info.playerById.get(id)?.label ?? info.groupById.get(id)?.label ?? id;
}

/** Colour for a player or group node. */
export function nodeColor(info: ModelInfo, id: Id): string {
  return info.playerById.get(id)?.color ?? info.groupById.get(id)?.color ?? '#8FA3C7';
}

/** Members of a node: a player is its own member; a group lists all its players, at any depth. */
export function nodeMembers(info: ModelInfo, id: Id): Id[] {
  if (info.playerById.has(id)) return [id];
  return info.groupById.get(id)?.allPlayers ?? [];
}
