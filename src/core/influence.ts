/**
 * "What is driving this right now?" (architecture §3 and §5).
 *
 * influenceOf: for a variable, its rule's terms now vs their baseline values. For additive
 * rules the term changes sum exactly to the change in the desired value; rules with a
 * `combine` are flagged nonAdditive and show values and the active regime instead.
 * This is a WITHIN-rule decomposition. System-wide questions ("how much is due to the credit
 * channel?") need counterfactual forks, never a waterfall.
 *
 * ideasAtPlay: weights each concept by the absolute change in the terms tagged with it
 * (and, for rule- and flow-level tags, the change in the rule's desired value or the flow),
 * across a scope and everything upstream of it. Changes are measured in comparable units:
 * pp of GDP for money, pp for rates and ratios, % of baseline for prices and indices.
 */
import type { Id, Influence } from './types.ts';
import type { KModel } from './compile.ts';
import { describePosting, fillTemplate, unitScale } from './format.ts';

export interface InfluenceSource {
  m: KModel;
  cur: Float64Array;
  baseVars: Float64Array;
  termVal: Float64Array;
  baseTerms: Float64Array;
  desired: Float64Array;
  baseDesired: Float64Array;
  regimes: (string | null)[];
  pEff: Float64Array;
  indicatorLevel(i: number): number;
  indicatorBase(i: number): number;
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

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
      rule: { id: flow.id, what: flow.explain.what, rule: describePosting(flow.posting) },
      regime: null,
      terms,
      nonAdditive: false,
      params: [],
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
      rule: { id: ind.id, what: ind.description, rule: `Shown as ${ind.display} (${ind.unit}).` },
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
      rule: { id: v.id, what: v.description ?? v.label, rule: levers.length ? `Set from outside the model by the lever(s): ${levers.map((l) => l.label).join(', ')}.` : 'Set from outside the model (exogenous).' },
    };
  }
  const cr = m.crules[r];
  const rule = cr.def;
  const terms: Influence['terms'] = [];
  for (let j = cr.termStart; j < cr.termStart + cr.termCount; j++) {
    const t = m.cterms[j];
    const value = S.termVal[j];
    const baseline = S.baseTerms[j];
    terms.push({ id: t.def.id, label: t.def.label, value, baseline, change: value - baseline, concept: t.def.concept, inputs: t.reads });
  }
  const pIdx = uniq([...cr.params, ...(cr.adjustParam >= 0 ? [cr.adjustParam] : [])]);
  const params = pIdx.map((j) => {
    const p = m.params[j];
    return { id: p.id, value: S.pEff[j], unit: p.unit, provenance: p.provenance };
  });
  const out: Influence = {
    id: v.id,
    label: v.label,
    value: S.cur[k],
    baseline: S.baseVars[k],
    category: rule.category,
    rule: { id: rule.id, what: rule.explain.what, rule: fillTemplate(rule.explain.rule, paramLookup(S)) },
    regime: rule.regime ? S.regimes[r] : null,
    terms,
    nonAdditive: !!rule.combine,
    params,
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
function nodeMembers(m: KModel, id: Id): Set<number> | undefined {
  const p = m.playerIndex.get(id);
  if (p !== undefined) return new Set([p]);
  const g = m.groupIndex.get(id);
  return g === undefined ? undefined : new Set(m.groups[g].allPlayers.map((x) => m.playerIndex.get(x)!));
}

/** Variables (by index) that a scope id starts from, plus the flows in the scope. */
function scopeSeeds(m: KModel, scope?: Id): { vars: number[]; flows: number[] } | null {
  if (!scope || scope === 'economy') return null;
  const legsWhere = (pred: (from: number, to: number, flow: number) => boolean) => {
    const legs = m.clegs.filter((l) => pred(l.from, l.to, l.flow));
    return { vars: legs.map((l) => l.amount), flows: uniq(legs.map((l) => l.flow)) };
  };
  const k = m.varIndex.get(scope);
  if (k !== undefined) return { vars: [k], flows: [] };
  const f = m.flowIndex.get(scope);
  if (f !== undefined) return legsWhere((_a, _b, fl) => fl === f);
  const members = nodeMembers(m, scope);
  if (members) return legsWhere((a, b) => members.has(a) || members.has(b));
  const i = m.indicatorIndex.get(scope);
  if (i !== undefined) return { vars: (m.indicators[i].drivers ?? []).map((d) => m.varIndex.get(d)!), flows: [] };
  const pipe = /^(.+?)->(.+?)(?::(\w+))?$/.exec(scope);
  if (pipe) {
    // A pipe between two nodes at any level: a group end stands for all its players. Between
    // nested nodes, legs inside the inner node are its own pipe, as in the interface's pipeBetween.
    const [, a, b, kind] = pipe;
    const A = nodeMembers(m, a),
      B = nodeMembers(m, b);
    if (!A || !B) throw new Error(`ideasAtPlay: pipe scope '${scope}' names '${A ? b : a}', which is not a player or group`);
    const inBoth = (p: number) => A.has(p) && B.has(p);
    return legsWhere((from, to, fl) => A.has(from) && B.has(to) && (a === b || !(inBoth(from) && inBoth(to))) && (!kind || m.flows[fl].kind === kind));
  }
  throw new Error(`ideasAtPlay: unknown scope '${scope}' (use a player, group, flow, variable, indicator or 'from->to[:kind]')`);
}

/** Rules feeding the seed variables, transitively (same-step and lagged inputs). */
export function upstreamRules(m: KModel, seeds: number[]): Set<number> {
  const seen = new Set<number>();
  const stack = [...seeds];
  const visitedVar = new Set<number>();
  while (stack.length) {
    const v = stack.pop()!;
    if (visitedVar.has(v)) continue;
    visitedVar.add(v);
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
  const rules = seeds ? upstreamRules(m, seeds.vars) : new Set(m.crules.map((c) => c.idx));
  const flows = seeds ? seeds.flows : m.flows.map((_, j) => j);
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
    for (let j = cr.termStart; j < cr.termStart + cr.termCount; j++) {
      const t = m.cterms[j];
      add(t.def.concept, Math.abs(S.termVal[j] - S.baseTerms[j]) / scale, t.key);
    }
    const dw = Math.abs(S.desired[r] - S.baseDesired[r]) / scale;
    for (const c of cr.def.concepts ?? []) add(c, dw, cr.def.id);
  }
  for (const f of flows) {
    let d = 0;
    for (const l of m.clegs) if (l.flow === f) d += S.cur[l.amount] - S.baseVars[l.amount];
    for (const c of m.flows[f].concepts ?? []) add(c, Math.abs(d), m.flows[f].id);
  }
  return [...acc.entries()]
    .map(([concept, e]) => ({ concept, weight: e.weight, via: e.via }))
    .sort((a, b) => b.weight - a.weight || (a.concept < b.concept ? -1 : 1));
}
