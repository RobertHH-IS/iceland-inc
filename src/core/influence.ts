/**
 * "What is driving this right now?" (architecture §3 and §5).
 *
 * influenceOf: for a variable, its rule's terms now vs their baseline values. For additive
 * rules the term changes sum exactly to the change in the desired value; rules with a
 * `combine` are flagged nonAdditive and show values and the active regime instead.
 * This is a WITHIN-rule decomposition. System-wide questions ("how much is due to the credit
 * channel?") need counterfactual forks, never a waterfall. Baselines are those of the current
 * stabiliser mode, so switching mode with no shock shows no change.
 *
 * ideasAtPlay: weights each concept by how much the terms tagged with it move their rule
 * (and, for rule- and flow-level tags, the change in the rule's desired value or in the flow's
 * legs within the scope), across a scope and everything upstream of it. For an additive rule
 * a term's weight is its change; for a rule with `combine` (a product, a cap, a floor) it is
 * the term's one-at-a-time effect: the combine with that term alone at its current value, the
 * others at baseline, minus the combine at baseline. So a factor of a product counts at the
 * product's level, and a cap that does not bind weighs nothing. Changes are measured in
 * comparable units: pp of GDP for money, pp for rates and ratios, % of baseline for prices and
 * indices. Stabiliser suggestions are left out (they restate their rule in lever units), and on
 * Manual so are the stabilisers' shadow variables, which then drive nothing.
 */
import type { Ctx, Id, Influence } from './types.ts';
import type { KModel } from './compile.ts';
import { describePosting, fillTemplate, templateIds, unitScale } from './format.ts';

export interface InfluenceSource {
  m: KModel;
  cur: Float64Array;
  baseVars: Float64Array;
  termVal: Float64Array;
  /** Baseline term and desired values in the current stabiliser mode. */
  baseTerms: Float64Array;
  desired: Float64Array;
  baseDesired: Float64Array;
  regimes: (string | null)[];
  pEff: Float64Array;
  /** The stabiliser setting is Automatic (true for a model without one). */
  automatic: boolean;
  /** A rule's context on the current state (for its `combine`). */
  ctxOf(rule: number): Ctx;
  indicatorLevel(i: number): number;
  indicatorBase(i: number): number;
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

/** An instrument's label written inside a sentence ("Bank deposits" → "bank deposits"). */
function instrumentLabel(m: KModel): (id: Id) => string | undefined {
  return (id) => {
    const l = m.instruments.find((x) => x.id === id)?.label;
    return l && /^[A-Z][a-z]/.test(l) ? l[0].toLowerCase() + l.slice(1) : l;
  };
}

/** Influence of a variable, flow or indicator. Ids are looked up in that order; prefix an id
 *  with 'var:', 'flow:' or 'indicator:' when kinds share an id (an indicator is often named
 *  after the variable it shows). */
export function influenceOf(S: InfluenceSource, rawId: Id): Influence {
  const { m } = S;
  const pre = /^(var|flow|indicator):(.+)$/.exec(rawId);
  const kind = pre?.[1];
  const id = pre ? pre[2] : rawId;
  const k = !kind || kind === 'var' ? m.varIndex.get(id) : undefined;
  if (k !== undefined) return varInfluence(S, k);
  const f = !kind || kind === 'flow' ? m.flowIndex.get(id) : undefined;
  if (f !== undefined) {
    const flow = m.flows[f];
    const legs = m.clegs.filter((l) => l.flow === f);
    const terms = legs.map((l) => {
      const amt = m.vars[l.amount];
      const value = S.cur[l.amount];
      const baseline = S.baseVars[l.amount];
      return { id: amt.id, label: `${m.players[l.from].label} → ${m.players[l.to].label}`, value, baseline, change: value - baseline, inputs: [amt.id] };
    });
    let value = 0,
      baseline = 0;
    for (const t of terms) {
      value += t.value;
      baseline += t.baseline;
    }
    return {
      id,
      label: flow.label,
      value,
      baseline,
      rule: { id: flow.id, what: fillTemplate(flow.explain.what, paramLookup(S)), rule: describePosting(flow.posting, instrumentLabel(m)), source: 'flow' },
      regime: null,
      terms,
      nonAdditive: false,
      params: paramsNamedIn(S, [], [flow.explain.what]),
      upstream: uniq(terms.map((t) => t.id)),
      concepts: [...(flow.concepts ?? [])],
    };
  }
  const i = !kind || kind === 'indicator' ? m.indicatorIndex.get(id) : undefined;
  if (i !== undefined) {
    const ind = m.indicators[i];
    return {
      id,
      label: ind.label,
      value: S.indicatorLevel(i),
      baseline: S.indicatorBase(i),
      rule: { id: ind.id, what: ind.description, rule: `Shown as ${ind.display} (${ind.unit}).`, source: 'indicator' },
      regime: null,
      terms: [],
      nonAdditive: false,
      params: [],
      upstream: [...(ind.drivers ?? [])],
      concepts: [...(ind.concepts ?? [])],
    };
  }
  throw new Error(`influences: '${rawId}' is not a variable, flow or indicator of model '${m.def.id}'`);
}

function paramLookup(S: InfluenceSource) {
  return (pid: string) => {
    const j = S.m.paramIndex.get(pid);
    return j === undefined ? undefined : S.pEff[j];
  };
}

/** Parameters (with provenance): the given indices, then any other parameter the texts name,
 *  so that everything a placeholder shows is listed (and can be filled again, e.g. in another
 *  language, from `Influence.params` alone). */
function paramsNamedIn(S: InfluenceSource, own: number[], texts: string[]): Influence['params'] {
  const { m } = S;
  const named = texts.flatMap((x) => templateIds(x)).flatMap((pid) => m.paramIndex.get(pid) ?? []);
  return uniq([...own, ...named]).map((j) => {
    const p = m.params[j];
    return { id: p.id, value: S.pEff[j], unit: p.unit, provenance: p.provenance };
  });
}

function varInfluence(S: InfluenceSource, k: number): Influence {
  const { m } = S;
  const v = m.vars[k];
  const r = m.ruleOfVar[k];
  if (r < 0) {
    const levers = m.clevers.filter((l) => l.bindVar === k).map((l) => l.def);
    return {
      id: v.id,
      label: v.label,
      value: S.cur[k],
      baseline: S.baseVars[k],
      regime: null,
      terms: [],
      nonAdditive: false,
      params: [],
      upstream: [],
      concepts: uniq(levers.flatMap((l) => l.concepts ?? [])),
      rule: {
        id: v.id,
        what: v.description ?? v.label,
        rule: levers.length ? `Set from outside the model by the lever(s): ${levers.map((l) => l.label).join(', ')}.` : 'Set from outside the model (exogenous).',
        source: 'exogenous',
        levers: levers.map((l) => l.id),
      },
    };
  }
  const cr = m.crules[r];
  const rule = cr.def;
  const terms: Influence['terms'] = [];
  const baseTerms = S.baseTerms;
  for (let j = cr.termStart; j < cr.termStart + cr.termCount; j++) {
    const t = m.cterms[j];
    const value = S.termVal[j];
    const baseline = baseTerms[j];
    terms.push({ id: t.def.id, label: t.def.label, value, baseline, change: value - baseline, concept: t.def.concept, inputs: t.reads });
  }
  const lookup = paramLookup(S);
  const out: Influence = {
    id: v.id,
    label: v.label,
    value: S.cur[k],
    baseline: S.baseVars[k],
    category: rule.category,
    rule: { id: rule.id, what: fillTemplate(rule.explain.what, lookup), rule: fillTemplate(rule.explain.rule, lookup), source: 'rule' },
    regime: rule.regime ? S.regimes[r] : null,
    terms,
    nonAdditive: !!rule.combine,
    params: paramsNamedIn(S, [...cr.params, ...(cr.adjustParam >= 0 ? [cr.adjustParam] : [])], [rule.explain.what, rule.explain.rule]),
    upstream: uniq([...(rule.inputs ?? []), ...(rule.lagInputs ?? [])]),
    concepts: uniq([...(rule.concepts ?? []), ...(rule.terms ?? []).map((t) => t.concept).filter((c): c is Id => !!c)]),
  };
  if (cr.hasAdjust) {
    out.desired = S.desired[r];
    out.desiredBaseline = S.baseDesired[r];
  }
  return out;
}

/** Players (by index) a node id stands for: the player itself, or every player of a group. */
function nodeMembers(m: KModel, id: Id, kind?: 'player' | 'group'): Set<number> | undefined {
  const p = kind === 'group' ? undefined : m.playerIndex.get(id);
  if (p !== undefined) return new Set([p]);
  const g = kind === 'player' ? undefined : m.groupIndex.get(id);
  return g === undefined ? undefined : new Set(m.groups[g].allPlayers.map((x) => m.playerIndex.get(x)!));
}

/** What a scope starts from: seed variables, and the legs (by index) in the scope. */
interface Seeds {
  vars: number[];
  legs: number[];
}

/** The seeds of a scope id, or null for the whole economy. An unprefixed id is looked up as a
 *  variable, flow, player or group, then indicator, then pipe; 'var:', 'flow:', 'indicator:',
 *  'player:' and 'group:' prefixes pick the kind when ids are shared. */
function scopeSeeds(m: KModel, scope?: Id): Seeds | null {
  if (!scope || scope === 'economy') return null;
  const legsWhere = (pred: (from: number, to: number, flow: number) => boolean): Seeds => {
    const legs: number[] = [];
    m.clegs.forEach((l, j) => pred(l.from, l.to, l.flow) && legs.push(j));
    return { vars: legs.map((j) => m.clegs[j].amount), legs };
  };
  const flowSeeds = (f: number) => legsWhere((_a, _b, fl) => fl === f);
  const pre = /^(var|flow|indicator|player|group):(.+)$/.exec(scope);
  const kind = pre?.[1];
  const id = pre ? pre[2] : scope;
  if (!kind || kind === 'var') {
    const k = m.varIndex.get(id);
    if (k !== undefined) {
      // an unprefixed flow id that is also its own leg's amount: the flow is a superset
      const f = kind ? undefined : m.flowIndex.get(id);
      if (f !== undefined && m.clegs.some((l) => l.flow === f && l.amount === k)) return flowSeeds(f);
      return { vars: [k], legs: [] };
    }
  }
  if (!kind || kind === 'flow') {
    const f = m.flowIndex.get(id);
    if (f !== undefined) return flowSeeds(f);
  }
  if (!kind || kind === 'player' || kind === 'group') {
    const members = nodeMembers(m, id, kind as 'player' | 'group' | undefined);
    if (members) return legsWhere((a, b) => members.has(a) || members.has(b));
  }
  if (!kind || kind === 'indicator') {
    const i = m.indicatorIndex.get(id);
    if (i !== undefined) return { vars: (m.indicators[i].drivers ?? []).map((d) => m.varIndex.get(d)!), legs: [] };
  }
  if (kind) throw new Error(`ideasAtPlay: '${id}' is not a ${kind} of model '${m.def.id}'`);
  const pipe = /^(.+?)->(.+?)(?::(\w+))?$/.exec(scope);
  if (pipe) {
    // A pipe between two nodes at any level: a group end stands for all its players.
    const [, a, b, flowKind] = pipe;
    const A = nodeMembers(m, a),
      B = nodeMembers(m, b);
    if (!A || !B) throw new Error(`ideasAtPlay: pipe scope '${scope}' names '${A ? b : a}', which is not a player or group`);
    return legsWhere((from, to, fl) => A.has(from) && B.has(to) && (!flowKind || m.flows[fl].kind === flowKind));
  }
  throw new Error(`ideasAtPlay: unknown scope '${scope}' (use a player, group, flow, variable, indicator or 'from->to[:kind]', optionally prefixed 'var:', 'flow:', 'indicator:', 'player:' or 'group:')`);
}

/** Variables that drive nothing now: every stabiliser's suggestion, and on Manual its shadows. */
export function inertVars(m: KModel, automatic: boolean): Set<number> {
  const out = new Set<number>();
  for (const cs of m.cstabilisers) {
    if (cs.suggestion >= 0) out.add(cs.suggestion);
    if (!automatic) for (const k of cs.shadow) out.add(k);
  }
  return out;
}

/** Rules feeding the seed variables, transitively (same-step and lagged inputs). The walk does
 *  not go through `skip` variables, unless they are seeds themselves. */
export function upstreamRules(m: KModel, seeds: number[], skip?: Set<number>): Set<number> {
  const seen = new Set<number>();
  const stack = [...seeds];
  const visitedVar = new Set<number>();
  const seedSet = new Set(seeds);
  while (stack.length) {
    const v = stack.pop()!;
    if (visitedVar.has(v)) continue;
    visitedVar.add(v);
    if (skip?.has(v) && !seedSet.has(v)) continue;
    const r = m.ruleOfVar[v];
    if (r < 0 || seen.has(r)) continue;
    seen.add(r);
    const cr = m.crules[r];
    for (const u of cr.inputs) stack.push(u);
    for (const u of cr.lagInputs) stack.push(u);
  }
  return seen;
}

export function ideasAtPlay(S: InfluenceSource, scope?: Id): { concept: Id; weight: number; via: Id[] }[] {
  const { m } = S;
  const seeds = scopeSeeds(m, scope);
  const inert = inertVars(m, S.automatic);
  const { termVal, baseTerms, desired, baseDesired } = S; // the baselines of the current mode, read once
  const rules = seeds ? upstreamRules(m, seeds.vars, inert) : new Set(m.crules.filter((c) => !inert.has(c.target)).map((c) => c.idx));
  const acc = new Map<Id, { weight: number; via: Id[] }>();
  const add = (concept: Id | undefined, w: number, via: Id) => {
    if (!concept || !(w > 1e-12)) return;
    const e = acc.get(concept) ?? { weight: 0, via: [] };
    e.weight += w;
    if (!e.via.includes(via)) e.via.push(via);
    acc.set(concept, e);
  };
  for (const r of rules) {
    const cr = m.crules[r];
    const scale = unitScale(m.vars[cr.target], S.baseVars[cr.target]);
    const effect = cr.def.combine ? termEffects(S, r, baseTerms) : null;
    for (let j = cr.termStart; j < cr.termStart + cr.termCount; j++) {
      const t = m.cterms[j];
      if (!t.def.concept) continue;
      const d = effect ? effect[j - cr.termStart] : termVal[j] - baseTerms[j];
      add(t.def.concept, Math.abs(d) / scale, t.key);
    }
    const dw = Math.abs(desired[r] - baseDesired[r]) / scale;
    for (const c of cr.def.concepts ?? []) add(c, dw, cr.def.id);
  }
  // flow-level tags: the change in the flow's legs within the scope
  const flowChange = new Map<number, number>();
  const legs = seeds ? seeds.legs : m.clegs.map((_, j) => j);
  for (const j of legs) {
    const l = m.clegs[j];
    flowChange.set(l.flow, (flowChange.get(l.flow) ?? 0) + S.cur[l.amount] - S.baseVars[l.amount]);
  }
  for (const [f, d] of flowChange) for (const c of m.flows[f].concepts ?? []) add(c, Math.abs(d), m.flows[f].id);
  return [...acc.entries()]
    .map(([concept, e]) => ({ concept, weight: e.weight, via: e.via }))
    .sort((a, b) => b.weight - a.weight || (a.concept < b.concept ? -1 : 1));
}

/** For a rule with `combine`: each term's one-at-a-time effect on the desired value, in the
 *  target's units: combine(baseline terms, this one now) − combine(baseline terms), with the
 *  rule's context on the current state (anything the combine reads from it cancels out). */
export function termEffects(S: InfluenceSource, r: number, baseTerms: Float64Array = S.baseTerms): number[] {
  const { m, termVal } = S;
  const cr = m.crules[r];
  const combine = cr.def.combine!;
  const ctx = S.ctxOf(r);
  const rec: Record<Id, number> = {};
  const end = cr.termStart + cr.termCount;
  for (let j = cr.termStart; j < end; j++) rec[m.cterms[j].def.id] = baseTerms[j];
  const at = combine(rec, ctx);
  const out: number[] = [];
  for (let j = cr.termStart; j < end; j++) {
    const tid = m.cterms[j].def.id;
    rec[tid] = termVal[j];
    out.push(combine(rec, ctx) - at);
    rec[tid] = baseTerms[j];
  }
  return out;
}
