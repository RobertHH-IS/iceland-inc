/**
 * The compiler: turns a declared ModelDef into a validated, indexed and scheduled model.
 *
 *   1. merge modules and apply `replaces`;
 *   2. check that ids are unique and every reference resolves (including levers' `showWhen`,
 *      the stabiliser setting and each stabiliser's levers and suggestion), and build the
 *      player hierarchy (groups; see hierarchy.ts);
 *   3. enforce one rule per endogenous variable;
 *   4. dry-run every rule, term and indicator against a recording context, so that reading
 *      an undeclared input (or an id that does not exist) is a compile error;
 *   5. build the same-step dependency graph, find its strongly connected components
 *      (Tarjan) and order them; a component with a loop is a simultaneous block;
 *   6. collect warnings (unused parameters, variables with no history, levers bound to
 *      nothing, concepts that are referenced but not defined, and a few more).
 *
 * Errors are collected and thrown together as a CompileError. The kernel never guesses.
 */
import type {
  CompiledModel,
  ConceptDef,
  Ctx,
  FeedRule,
  FlowDef,
  Id,
  IndicatorCtx,
  IndicatorDef,
  InstrumentDef,
  LeverDef,
  ModelDef,
  GroupDef,
  ModuleDef,
  ParamDef,
  PlayerDef,
  RuleDef,
  Settlement,
  StabiliserDef,
  TermDef,
  VarDef,
} from './types.ts';
import { buildHierarchy, nodeFor } from './hierarchy.ts';

export interface CompileOptions {
  /** Concepts defined outside the model (e.g. the shared library). Model concepts win. */
  extraConcepts?: ConceptDef[];
}

export class CompileError extends Error {
  constructor(
    readonly errors: string[],
    readonly warnings: string[],
  ) {
    super(`Model does not compile (${errors.length} error${errors.length === 1 ? '' : 's'}):\n  - ${errors.join('\n  - ')}`);
    this.name = 'CompileError';
  }
}

/* ------------------------------------------------------------- internal form */

export const POSTING_CODE = { transfer: 0, purchase: 1, issue: 2, redeem: 3, trade: 4, accrue: 5, revalue: 6, writeoff: 7 } as const;
export type PostingCode = (typeof POSTING_CODE)[keyof typeof POSTING_CODE];
export const KIND_CODE = { cash: 0, accrual: 1, revaluation: 2, writeoff: 3 } as const;
export const SETTLEMENT_CODE: Record<Settlement, number> = { deposits: 0, bank: 1, treasury: 2, 'central-bank': 3 };
export const ROLE_NONE = 0;
export const ROLE_HOLDER = 1;
export const ROLE_ISSUER = 2;

export interface CTerm {
  key: string; // 'ruleId.termId'
  rule: number;
  def: TermDef;
  /** Variables the term read during the compile-time dry run (for navigation). */
  reads: Id[];
}

export interface CRule {
  idx: number;
  def: RuleDef;
  module: Id;
  target: number;
  inputs: number[];
  lagInputs: number[];
  params: number[];
  termStart: number;
  termCount: number;
  /** Param index of the adjustment speed, or -1 when the speed is a number (adjustNum). */
  adjustParam: number;
  adjustNum: number;
  hasAdjust: boolean;
  /** True for adjust form 'exponential': k = 1 − exp(−speed·dt) instead of speed·dt. */
  adjustExp: boolean;
  /** Maps used by the per-rule context: declared id → global index. */
  inputMap: Map<Id, number>;
  lagMap: Map<Id, number>;
  paramMap: Map<Id, number>;
  leverMap: Map<Id, number>;
  /** 'instrument\u0000player' → position index × 2 + (1 if the player is the issuer). */
  stockMap: Map<string, number>;
}

export interface CLeg {
  flow: number;
  from: number;
  to: number;
  amount: number;
  posting: PostingCode;
  instrument: number; // -1 for transfers
  kind: number;
  /** Real-asset revalue / writeoff: posts to one holder only, so the row need not sum to zero. */
  oneSided: boolean;
}

export interface CLever {
  def: LeverDef;
  bindParam: number;
  bindVar: number;
  mode: 'replace' | 'add' | null;
  scale: number;
}

export interface PaymentIndex {
  bank: number;
  centralBank: number;
  treasury: number;
  deposits: number;
  reserves: number;
  treasuryAccount: number;
}

/** The compiled model with the indices the kernel runs on. */
export interface KModel extends CompiledModel {
  NV: number;
  NP: number;
  NI: number;
  varIndex: Map<Id, number>;
  paramIndex: Map<Id, number>;
  playerIndex: Map<Id, number>;
  instrumentIndex: Map<Id, number>;
  leverIndex: Map<Id, number>;
  flowIndex: Map<Id, number>;
  indicatorIndex: Map<Id, number>;
  ruleIndex: Map<Id, number>;
  conceptIndex: Map<Id, number>;
  /** Rule index per variable, -1 for exogenous variables. */
  ruleOfVar: Int32Array;
  exogenous: Uint8Array;
  /** Variables read with lag() by some rule, or adjusted gradually: the model's state. */
  lagged: Uint8Array;
  crules: CRule[];
  cterms: CTerm[];
  termKeyIndex: Map<string, number>;
  clegs: CLeg[];
  clevers: CLever[];
  blocks: { rules: number[]; simultaneous: boolean }[];
  /** role[ins * NP + player]: 0 none, 1 holder, 2 issuer. */
  role: Uint8Array;
  /** signExempt[ins * NP + player]: 1 where InstrumentDef.mayGoNegative lets the position take
   *  either sign, so the position-sign diagnostic skips it. */
  signExempt: Uint8Array;
  settlement: Uint8Array;
  pay: PaymentIndex;
  /** Module that declared each rule/flow/etc. (for messages and the inspector). */
  origin: Map<string, Id>;
  /** Group index by id (the player hierarchy). */
  groupIndex: Map<Id, number>;
  /** For each player (by index), its enclosing groups, outermost first. */
  groupChains: Id[][];
  /** Indices behind each stabiliser, in `stabilisers` order. */
  cstabilisers: CStabiliser[];
  /** Lever index of the stabiliser setting, or -1 when the model has none. */
  modeLever: number;
}

export interface CStabiliser {
  lever: number;
  offset: number;
  suggestion: number;
  /** Module that declared it (for messages). */
  module: Id;
}

/** Is a stabiliser-mode lever value Automatic? The value nearer `automatic` wins; a tie is Automatic. */
export function isAutomatic(mode: { manual: number; automatic: number }, value: number): boolean {
  return Math.abs(value - mode.automatic) <= Math.abs(value - mode.manual);
}

/* ---------------------------------------------------------------- utilities */

const sk = (ins: Id, player: Id) => ins + '\u0000' + player;

/** Tarjan's strongly connected components. `adj[v]` lists the nodes v depends on, so each
 *  component is emitted after every component it depends on (a valid evaluation order). */
export function tarjan(n: number, adj: number[][]): number[][] {
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const out: number[][] = [];
  let counter = 0;
  for (let s = 0; s < n; s++) {
    if (index[s] !== -1) continue;
    const work: [number, number][] = [[s, 0]];
    index[s] = low[s] = counter++;
    stack.push(s);
    onStack[s] = 1;
    while (work.length) {
      const top = work[work.length - 1];
      const v = top[0];
      const edges = adj[v];
      if (top[1] < edges.length) {
        const w = edges[top[1]++];
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = 1;
          work.push([w, 0]);
        } else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
      } else {
        work.pop();
        if (work.length) {
          const u = work[work.length - 1][0];
          low[u] = Math.min(low[u], low[v]);
        }
        if (low[v] === index[v]) {
          const comp: number[] = [];
          let w: number;
          do {
            w = stack.pop()!;
            onStack[w] = 0;
            comp.push(w);
          } while (w !== v);
          out.push(comp);
        }
      }
    }
  }
  return out;
}

/** Order components so dependencies come first, preferring declaration order among ties. */
function orderComponents(n: number, adj: number[][], comps: number[][]): number[][] {
  const compOf = new Int32Array(n);
  comps.forEach((c, j) => c.forEach((v) => (compOf[v] = j)));
  const nc = comps.length;
  const indeg = new Int32Array(nc);
  const users: Set<number>[] = comps.map(() => new Set());
  for (let v = 0; v < n; v++)
    for (const w of adj[v]) {
      const a = compOf[w],
        b = compOf[v];
      if (a !== b && !users[a].has(b)) {
        users[a].add(b);
        indeg[b]++;
      }
    }
  const key = comps.map((c) => Math.min(...c));
  const ready: number[] = [];
  for (let j = 0; j < nc; j++) if (indeg[j] === 0) ready.push(j);
  const order: number[][] = [];
  while (ready.length) {
    let best = 0;
    for (let j = 1; j < ready.length; j++) if (key[ready[j]] < key[ready[best]]) best = j;
    const c = ready.splice(best, 1)[0];
    order.push([...comps[c]].sort((a, b) => a - b));
    for (const u of users[c]) if (--indeg[u] === 0) ready.push(u);
  }
  return order;
}

/* ------------------------------------------------------------------ compile */

interface Tagged<T> {
  def: T;
  module: Id;
}

export function isCompiled(x: unknown): x is KModel {
  return typeof x === 'object' && x !== null && 'crules' in x && 'schedule' in x;
}

export function compile(def: ModelDef, opts: CompileOptions = {}): KModel {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);

  if (!def || typeof def !== 'object') throw new CompileError(['model definition is missing'], []);
  if (!def.id) err('model has no id');
  if (!(def.dt > 0 && def.dt <= 1)) err(`model dt must be in (0, 1] years, got ${def.dt}`);

  /* 1. modules ------------------------------------------------------------ */
  const modules = def.modules ?? [];
  const moduleIds = new Set<Id>();
  for (const m of modules) {
    if (moduleIds.has(m.id)) err(`duplicate module id '${m.id}'`);
    moduleIds.add(m.id);
  }
  for (const m of modules) for (const r of m.requires ?? []) if (!moduleIds.has(r)) err(`module '${m.id}' requires module '${r}', which is not in the model`);

  function gather<T>(pick: (m: ModuleDef) => T[] | undefined): Tagged<T>[] {
    const out: Tagged<T>[] = [];
    for (const m of modules) for (const d of pick(m) ?? []) out.push({ def: d, module: m.id });
    return out;
  }
  const players = gather((m) => m.players);
  const groupDefs = gather((m) => m.groups as GroupDef[] | undefined);
  const instruments = gather((m) => m.instruments);
  const vars = gather((m) => m.vars);
  const params = gather((m) => m.params);
  let rules = gather((m) => m.rules);
  const flows = gather((m) => m.flows);
  const levers = gather((m) => m.levers);
  const indicators = gather((m) => m.indicators);
  const concepts = gather((m) => m.concepts);
  const feed = gather((m) => m.feed);
  const stabilisers = gather((m) => m.stabilisers);

  /* 2. replaces ----------------------------------------------------------- */
  const ruleById = new Map<Id, Tagged<RuleDef>>();
  for (const r of rules) {
    if (ruleById.has(r.def.id)) err(`duplicate rule id '${r.def.id}' (modules '${ruleById.get(r.def.id)!.module}' and '${r.module}')`);
    else ruleById.set(r.def.id, r);
  }
  const replaced = new Map<Id, Id>();
  for (const r of rules) {
    const target = r.def.replaces;
    if (!target) continue;
    const old = ruleById.get(target);
    if (!old) err(`rule '${r.def.id}' (module '${r.module}') replaces rule '${target}', which does not exist`);
    else if (old.def.target !== r.def.target)
      err(`rule '${r.def.id}' replaces '${target}' but sets '${r.def.target}' instead of '${old.def.target}'; a replacement must set the same variable`);
    if (replaced.has(target)) err(`rule '${target}' is replaced twice (by '${replaced.get(target)}' and '${r.def.id}')`);
    replaced.set(target, r.def.id);
  }
  rules = rules.filter((r) => !replaced.has(r.def.id));

  /* 3. unique ids per kind ------------------------------------------------ */
  function indexOf<T extends { id: Id }>(list: Tagged<T>[], what: string): Map<Id, number> {
    const map = new Map<Id, number>();
    list.forEach((x, j) => {
      if (!x.def.id) err(`a ${what} in module '${x.module}' has no id`);
      else if (map.has(x.def.id)) err(`duplicate ${what} id '${x.def.id}' (modules '${list[map.get(x.def.id)!].module}' and '${x.module}')`);
      else map.set(x.def.id, j);
    });
    return map;
  }
  const playerIndex = indexOf(players, 'player');
  const instrumentIndex = indexOf(instruments, 'instrument');
  const varIndex = indexOf(vars, 'variable');
  const paramIndex = indexOf(params, 'parameter');
  const flowIndex = indexOf(flows, 'flow');
  const leverIndex = indexOf(levers, 'lever');
  const indicatorIndex = indexOf(indicators, 'indicator');
  indexOf(feed, 'feed rule');
  indexOf(stabilisers, 'stabiliser');
  const conceptList: ConceptDef[] = [];
  const conceptIndex = new Map<Id, number>();
  for (const c of concepts) {
    if (conceptIndex.has(c.def.id)) err(`duplicate concept id '${c.def.id}' (module '${c.module}')`);
    else {
      conceptIndex.set(c.def.id, conceptList.length);
      conceptList.push(c.def);
    }
  }
  for (const c of opts.extraConcepts ?? [])
    if (!conceptIndex.has(c.id)) {
      conceptIndex.set(c.id, conceptList.length);
      conceptList.push(c);
    }
  for (const id of varIndex.keys()) {
    // a flow may share its id with the amount variable of its own leg; anything else is ambiguous
    const f = flowIndex.get(id);
    if (f !== undefined && !(flows[f].def.legs ?? []).some((l) => l.amount === id)) warn(`id '${id}' is both a variable and a flow; influences('${id}') resolves to the variable`);
  }

  const NP = players.length,
    NI = instruments.length,
    NV = vars.length;
  const origin = new Map<string, Id>();
  const tagOrigin = (kind: string, list: Tagged<{ id: Id }>[]) => list.forEach((x) => origin.set(`${kind}:${x.def.id}`, x.module));
  tagOrigin('player', players);
  tagOrigin('instrument', instruments);
  tagOrigin('var', vars);
  tagOrigin('param', params);
  tagOrigin('rule', rules);
  tagOrigin('flow', flows);
  tagOrigin('lever', levers);
  tagOrigin('indicator', indicators);

  /* 4. instruments and roles ---------------------------------------------- */
  const role = new Uint8Array(NI * NP);
  instruments.forEach(({ def: ins }, i) => {
    if (ins.kind !== 'financial' && ins.kind !== 'real') err(`instrument '${ins.id}' has unknown kind '${ins.kind}'`);
    if (ins.kind === 'real' && (ins.issuers ?? []).length) err(`real instrument '${ins.id}' cannot have issuers`);
    if (ins.kind === 'financial' && !(ins.issuers ?? []).length) err(`financial instrument '${ins.id}' has no issuer`);
    if (!(ins.holders ?? []).length) err(`instrument '${ins.id}' has no holders`);
    for (const p of ins.issuers ?? []) {
      const pi = playerIndex.get(p);
      if (pi === undefined) err(`instrument '${ins.id}' lists unknown issuer '${p}'`);
      else role[i * NP + pi] = ROLE_ISSUER;
    }
    for (const p of ins.holders ?? []) {
      const pi = playerIndex.get(p);
      if (pi === undefined) err(`instrument '${ins.id}' lists unknown holder '${p}'`);
      else if (role[i * NP + pi] === ROLE_ISSUER) err(`player '${p}' is both an issuer and a holder of '${ins.id}'`);
      else role[i * NP + pi] = ROLE_HOLDER;
    }
  });
  const roleOf = (ins: number, pl: number) => role[ins * NP + pl];
  const signExempt = new Uint8Array(NI * NP);
  instruments.forEach(({ def: ins, module }, i) => {
    const free = ins.mayGoNegative;
    if (!free) return;
    const where = `instrument '${ins.id}' (module '${module}') mayGoNegative`;
    if (typeof free.reason !== 'string' || !free.reason.trim()) err(`${where} needs a reason: say why this position may take either sign`);
    const list = free.players ?? [...(ins.issuers ?? []), ...(ins.holders ?? [])];
    if (free.players && !free.players.length) err(`${where} lists no players (leave 'players' out to exempt every position)`);
    for (const p of list) {
      const pi = playerIndex.get(p);
      if (pi === undefined) err(`${where} lists unknown player '${p}'`);
      else if (roleOf(i, pi) === ROLE_NONE) err(`${where} lists '${p}', which neither holds nor issues it`);
      else signExempt[i * NP + pi] = 1;
    }
  });

  /* 5. players and the payment system ------------------------------------- */
  const settlement = new Uint8Array(NP);
  players.forEach(({ def: p }, j) => {
    if (!(p.settlement in SETTLEMENT_CODE)) err(`player '${p.id}' has unknown settlement '${p.settlement}'`);
    else settlement[j] = SETTLEMENT_CODE[p.settlement];
    if (p.layout && !(p.layout.x >= 0 && p.layout.x <= 1 && p.layout.y >= 0 && p.layout.y <= 1)) warn(`player '${p.id}' has a layout hint outside 0..1`);
    if (!p.layout) warn(`player '${p.id}' has no layout hint`);
  });
  const hierarchy = buildHierarchy(players, groupDefs, err, warn);
  const ps = def.paymentSystem;
  const pay: PaymentIndex = { bank: -1, centralBank: -1, treasury: -1, deposits: -1, reserves: -1, treasuryAccount: -1 };
  if (!ps) err('model has no paymentSystem');
  else {
    const pl = (id: Id, what: string, want: Settlement) => {
      const j = playerIndex.get(id);
      if (j === undefined) {
        err(`paymentSystem.${what} '${id}' is not a player`);
        return -1;
      }
      if (players[j].def.settlement !== want) err(`paymentSystem.${what} '${id}' must have settlement '${want}'`);
      return j;
    };
    const ins = (id: Id, what: string) => {
      const j = instrumentIndex.get(id);
      if (j === undefined) err(`paymentSystem.${what} '${id}' is not an instrument`);
      return j ?? -1;
    };
    pay.bank = pl(ps.bank, 'bank', 'bank');
    pay.centralBank = pl(ps.centralBank, 'centralBank', 'central-bank');
    pay.treasury = pl(ps.treasury, 'treasury', 'treasury');
    pay.deposits = ins(ps.deposits, 'deposits');
    pay.reserves = ins(ps.reserves, 'reserves');
    pay.treasuryAccount = ins(ps.treasuryAccount, 'treasuryAccount');
    const issuedBy = (i: number, p: number, what: string, by: string) => {
      if (i >= 0 && p >= 0 && roleOf(i, p) !== ROLE_ISSUER) err(`the ${what} instrument '${instruments[i].def.id}' must be issued by the ${by} '${players[p].def.id}'`);
    };
    const heldBy = (i: number, p: number, what: string) => {
      if (i >= 0 && p >= 0 && roleOf(i, p) !== ROLE_HOLDER) err(`player '${players[p].def.id}' must hold the ${what} instrument '${instruments[i].def.id}' to make payments`);
    };
    issuedBy(pay.deposits, pay.bank, 'deposits', 'bank');
    issuedBy(pay.reserves, pay.centralBank, 'reserves', 'central bank');
    issuedBy(pay.treasuryAccount, pay.centralBank, 'treasury-account', 'central bank');
    heldBy(pay.reserves, pay.bank, 'reserves');
    heldBy(pay.treasuryAccount, pay.treasury, 'treasury-account');
    players.forEach(({ def: p }, j) => {
      if (p.settlement === 'deposits') heldBy(pay.deposits, j, 'deposits');
      if (p.settlement === 'bank' && j !== pay.bank) err(`player '${p.id}' settles as a bank but paymentSystem.bank is '${ps.bank}' (one consolidated bank)`);
      if (p.settlement === 'central-bank' && j !== pay.centralBank) err(`player '${p.id}' settles as a central bank but paymentSystem.centralBank is '${ps.centralBank}'`);
      if (p.settlement === 'treasury' && j !== pay.treasury) err(`player '${p.id}' settles as the treasury but paymentSystem.treasury is '${ps.treasury}'`);
    });
  }

  /* 6. variables and rules ------------------------------------------------ */
  const exogenous = new Uint8Array(NV);
  vars.forEach(({ def: v }, j) => {
    if (v.kind === 'exogenous') exogenous[j] = 1;
    if (v.initial !== undefined && !Number.isFinite(v.initial)) err(`variable '${v.id}' has a non-finite initial value`);
  });
  params.forEach(({ def: p }) => {
    if (!Number.isFinite(p.value)) err(`parameter '${p.id}' has a non-finite value`);
    if (!p.provenance || !p.provenance.basis) err(`parameter '${p.id}' has no provenance`);
    if (p.provenance?.basis === 'data' && !p.provenance.source) warn(`parameter '${p.id}' is marked as data but has no source`);
  });

  const ruleOfVar = new Int32Array(NV).fill(-1);
  rules.forEach(({ def: r, module }, j) => {
    const vi = varIndex.get(r.target);
    if (vi === undefined) {
      err(`rule '${r.id}' (module '${module}') sets unknown variable '${r.target}'`);
      return;
    }
    if (exogenous[vi]) err(`rule '${r.id}' sets '${r.target}', which is declared exogenous (exogenous variables have no rule)`);
    if (ruleOfVar[vi] >= 0) {
      const other = rules[ruleOfVar[vi]];
      err(`duplicate rule: '${r.target}' is set by rule '${other.def.id}' (module '${other.module}') and rule '${r.id}' (module '${module}'); one rule per variable, use 'replaces' to swap one for the other`);
    } else ruleOfVar[vi] = j;
  });
  vars.forEach(({ def: v, module }, j) => {
    if (!exogenous[j] && ruleOfVar[j] < 0) err(`missing rule: variable '${v.id}' (module '${module}') has no rule; add one, or declare it kind 'exogenous'`);
  });

  const leverIsOneoff = (id: Id) => levers[leverIndex.get(id)!]?.def.kind === 'oneoff';
  const crules: CRule[] = [];
  const cterms: CTerm[] = [];
  const termKeyIndex = new Map<string, number>();
  const lagged = new Uint8Array(NV);
  const usedParams = new Set<Id>();
  const leverReadByRule = new Set<Id>();
  const CATS = new Set(['IDENTITY', 'CONTRACT', 'BEHAVIOUR', 'POLICY']);

  rules.forEach(({ def: r, module }, j) => {
    const where = `rule '${r.id}' (module '${module}')`;
    if (!CATS.has(r.category)) err(`${where} has no valid category (IDENTITY, CONTRACT, BEHAVIOUR or POLICY)`);
    if (!r.explain || !r.explain.what || !r.explain.rule) err(`${where} needs explain.what and explain.rule`);
    const hasTerms = Array.isArray(r.terms);
    if (hasTerms === (typeof r.compute === 'function')) err(`${where} must have exactly one of 'terms' or 'compute'`);
    if (hasTerms && !r.terms!.length) err(`${where} has an empty terms list`);
    if (r.combine && !hasTerms) err(`${where} has 'combine' but no terms`);
    const mapIds = (ids: Id[] | undefined, index: Map<Id, number>, what: string) => {
      const m = new Map<Id, number>();
      for (const id of ids ?? []) {
        const k = index.get(id);
        if (k === undefined) err(`${where} declares unknown ${what} '${id}'`);
        else m.set(id, k);
      }
      return m;
    };
    const inputMap = mapIds(r.inputs, varIndex, 'input');
    const lagMap = mapIds(r.lagInputs, varIndex, 'lagged input');
    const paramMap = mapIds(r.params, paramIndex, 'parameter');
    const leverMap = mapIds(r.levers, leverIndex, 'lever');
    for (const id of r.params ?? []) usedParams.add(id);
    for (const id of r.levers ?? []) {
      leverReadByRule.add(id);
      if (leverIndex.has(id) && leverIsOneoff(id)) err(`${where} reads one-off lever '${id}'; one-off levers act through fire(), not as settings`);
    }
    for (const k of lagMap.values()) lagged[k] = 1;
    const stockMap = new Map<string, number>();
    for (const pair of r.stocks ?? []) {
      const [ins, pl] = pair;
      const ii = instrumentIndex.get(ins),
        pi = playerIndex.get(pl);
      if (ii === undefined) err(`${where} declares a stock of unknown instrument '${ins}'`);
      if (pi === undefined) err(`${where} declares a stock of unknown player '${pl}'`);
      if (ii === undefined || pi === undefined) continue;
      const ro = roleOf(ii, pi);
      if (ro === ROLE_NONE) err(`${where} declares stock ['${ins}', '${pl}'], but '${pl}' neither holds nor issues '${ins}'`);
      stockMap.set(sk(ins, pl), (ii * NP + pi) * 2 + (ro === ROLE_ISSUER ? 1 : 0));
    }
    let adjustParam = -1,
      adjustNum = 0;
    const hasAdjust = !!r.adjust;
    const adjustExp = r.adjust?.form === 'exponential';
    if (r.adjust) {
      const sp = r.adjust.speed;
      const form = r.adjust.form;
      if (form !== undefined && form !== 'linear' && form !== 'exponential') err(`${where} has unknown adjustment form '${form}' (use 'linear' or 'exponential')`);
      if (typeof sp === 'number') {
        adjustNum = sp;
        if (!(sp > 0)) err(`${where} has a non-positive adjustment speed`);
        else if (!adjustExp && sp * def.dt > 1) warn(`${where}: adjustment speed ${sp}/yr × dt ${def.dt} > 1 overshoots each step`);
      } else {
        const k = paramIndex.get(sp);
        if (k === undefined) err(`${where} adjusts at unknown parameter speed '${sp}'`);
        else {
          adjustParam = k;
          usedParams.add(sp);
          const v = params[k].def.value;
          if (!adjustExp && v * def.dt > 1) warn(`${where}: adjustment speed ${sp} = ${v}/yr × dt ${def.dt} > 1 overshoots each step`);
        }
      }
      const ti = varIndex.get(r.target);
      if (ti !== undefined) lagged[ti] = 1;
    }
    const termStart = cterms.length;
    const seen = new Set<Id>();
    for (const t of r.terms ?? []) {
      if (!t.id) err(`${where} has a term without an id`);
      if (seen.has(t.id)) err(`${where} has two terms with id '${t.id}'`);
      seen.add(t.id);
      if (typeof t.compute !== 'function') err(`${where} term '${t.id}' has no compute function`);
      const key = `${r.id}.${t.id}`;
      termKeyIndex.set(key, cterms.length);
      cterms.push({ key, rule: j, def: t, reads: [] });
    }
    crules.push({
      idx: j,
      def: r,
      module,
      target: varIndex.get(r.target) ?? -1,
      inputs: [...inputMap.values()],
      lagInputs: [...lagMap.values()],
      params: [...paramMap.values()],
      termStart,
      termCount: cterms.length - termStart,
      adjustParam,
      adjustNum,
      hasAdjust,
      adjustExp,
      inputMap,
      lagMap,
      paramMap,
      leverMap,
      stockMap,
    });
  });
  // term keys by target variable as aliases ('varId.termId')
  for (const t of cterms) {
    const alias = `${rules[t.rule].def.target}.${t.def.id}`;
    if (!termKeyIndex.has(alias)) termKeyIndex.set(alias, termKeyIndex.get(t.key)!);
  }

  /* 7. flows and legs ----------------------------------------------------- */
  const clegs: CLeg[] = [];
  const legAmountUse = new Map<Id, number>();
  const playerInFlow = new Uint8Array(NP);
  const instrumentPosted = new Uint8Array(NI);
  const kindFor: Record<string, keyof typeof KIND_CODE> = {
    transfer: 'cash',
    purchase: 'cash',
    issue: 'cash',
    redeem: 'cash',
    trade: 'cash',
    accrue: 'accrual',
    revalue: 'revaluation',
    writeoff: 'writeoff',
  };
  flows.forEach(({ def: f, module }, fj) => {
    const where = `flow '${f.id}' (module '${module}')`;
    const pt = f.posting?.type;
    if (!pt || !(pt in POSTING_CODE)) {
      err(`${where} has unknown posting type '${pt}'`);
      return;
    }
    if (!(f.kind in KIND_CODE)) err(`${where} has unknown kind '${f.kind}'`);
    else if (kindFor[pt] !== f.kind) err(`${where}: a '${pt}' posting must have kind '${kindFor[pt]}', not '${f.kind}'`);
    const acc = f.account;
    if ((pt === 'issue' || pt === 'redeem' || pt === 'trade') && acc !== 'financial') warn(`${where}: '${pt}' postings belong on the financial account, not '${acc}'`);
    if ((pt === 'transfer' || pt === 'purchase' || pt === 'accrue') && acc !== 'current' && acc !== 'capital') warn(`${where}: '${pt}' postings belong on the current or capital account, not '${acc}'`);
    if ((pt === 'revalue' || pt === 'writeoff') && acc !== 'other') warn(`${where}: '${pt}' postings belong on the 'other' account (other changes in net worth), not '${acc}'`);
    if (!f.explain?.what) err(`${where} needs explain.what`);
    if (!(f.legs ?? []).length) err(`${where} has no legs`);
    let ins = -1;
    const insId = pt === 'purchase' ? (f.posting as { realAsset: Id }).realAsset : pt === 'transfer' ? undefined : (f.posting as { instrument: Id }).instrument;
    if (insId !== undefined) {
      const ii = instrumentIndex.get(insId);
      if (ii === undefined) err(`${where} posts to unknown instrument '${insId}'`);
      else {
        ins = ii;
        instrumentPosted[ii] = 1;
        const kind = instruments[ii].def.kind;
        if (pt === 'purchase' && kind !== 'real') err(`${where}: a purchase buys a real asset, but '${insId}' is financial`);
        if ((pt === 'issue' || pt === 'redeem' || pt === 'accrue') && kind !== 'financial') err(`${where}: '${pt}' needs a financial instrument, but '${insId}' is real`);
      }
    }
    (f.legs ?? []).forEach((leg, li) => {
      const lw = `${where} leg ${li + 1} (${leg.from} → ${leg.to})`;
      const from = playerIndex.get(leg.from),
        to = playerIndex.get(leg.to),
        amount = varIndex.get(leg.amount);
      if (from === undefined) err(`${lw}: unknown player '${leg.from}'`);
      if (to === undefined) err(`${lw}: unknown player '${leg.to}'`);
      if (amount === undefined) err(`${lw}: unknown amount variable '${leg.amount}'`);
      else legAmountUse.set(leg.amount, (legAmountUse.get(leg.amount) ?? 0) + 1);
      if (from === undefined || to === undefined || amount === undefined) return;
      playerInFlow[from] = playerInFlow[to] = 1;
      let oneSided = false;
      if (ins >= 0) {
        const insDef = instruments[ins].def;
        const rf = roleOf(ins, from),
          rt = roleOf(ins, to);
        const need = (ok: boolean, msg: string) => {
          if (!ok) err(`${lw}: ${msg}`);
        };
        const H = ROLE_HOLDER,
          I = ROLE_ISSUER;
        switch (pt) {
          case 'purchase':
            need(rf === H, `the buyer '${leg.from}' must be a holder of '${insDef.id}'`);
            break;
          case 'issue':
            need(rf === H, `the lender '${leg.from}' must be a holder of '${insDef.id}'`);
            need(rt === I, `the borrower '${leg.to}' must be an issuer of '${insDef.id}'`);
            break;
          case 'redeem':
            need(rf === I, `the borrower '${leg.from}' must be an issuer of '${insDef.id}'`);
            need(rt === H, `the lender '${leg.to}' must be a holder of '${insDef.id}'`);
            break;
          case 'trade':
            need(rf === H && rt === H && from !== to, `buyer and seller must be two different holders of '${insDef.id}'`);
            break;
          case 'accrue':
            need(rf === I, `the debtor '${leg.from}' must be an issuer of '${insDef.id}'`);
            need(rt === H, `the creditor '${leg.to}' must be a holder of '${insDef.id}'`);
            break;
          case 'revalue':
          case 'writeoff':
            if (pt === 'revalue' && from !== to && rf === H && rt === H) {
              // a reclassification between two holders: value moves, no cash, no income
            } else if (insDef.kind === 'real') {
              need(from === to && rf === H, `a real asset is revalued or written off one-sided (from = to = the holder), or revalued between two holders`);
              oneSided = true;
            } else if (pt === 'revalue') need((rf === H && rt === I) || (rf === I && rt === H), `one side must hold and the other issue '${insDef.id}', or both must hold it (a reclassification)`);
            else need(rf === H && rt === I, `a write-off moves value from the holder (from) to the issuer (to) of '${insDef.id}'`);
            break;
        }
      }
      clegs.push({
        flow: fj,
        from,
        to,
        amount,
        posting: POSTING_CODE[pt as keyof typeof POSTING_CODE],
        instrument: ins,
        kind: KIND_CODE[kindFor[pt]],
        oneSided,
      });
    });
  });
  for (const [id, n] of legAmountUse) if (n > 1) warn(`variable '${id}' is the amount of ${n} legs; each leg normally has its own amount`);
  players.forEach(({ def: p }, j) => {
    if (!playerInFlow[j]) warn(`player '${p.id}' takes part in no flow`);
  });
  instruments.forEach(({ def: ins }, j) => {
    const isPay = j === pay.deposits || j === pay.reserves || j === pay.treasuryAccount;
    if (!isPay && !instrumentPosted[j]) warn(`instrument '${ins.id}' has no flow posting to it, so it never changes`);
  });

  /* 8. levers ------------------------------------------------------------- */
  const clevers: CLever[] = levers.map(({ def: l, module }) => {
    const where = `lever '${l.id}' (module '${module}')`;
    if (!l.definition) err(`${where} needs a precise 'definition' (level or growth, duration, what happens when it ends)`);
    if (!['setting', 'choice', 'oneoff'].includes(l.kind)) err(`${where} has unknown kind '${l.kind}'`);
    if (l.kind === 'oneoff' && typeof l.fire !== 'function') err(`${where} is one-off but has no fire()`);
    if (l.kind !== 'oneoff' && l.fire) warn(`${where} is a setting but has fire(); fire is only used by one-off levers`);
    if (l.kind === 'choice' && !(l.options ?? []).length) warn(`${where} is a choice without options`);
    if (!Number.isFinite(l.default)) err(`${where} has a non-finite default`);
    let bindParam = -1,
      bindVar = -1,
      mode: 'replace' | 'add' | null = null,
      scale = 1;
    if (l.binds) {
      mode = l.binds.mode;
      scale = l.binds.scale ?? 1;
      if (mode !== 'replace' && mode !== 'add') err(`${where} binds with unknown mode '${mode}'`);
      if (!Number.isFinite(scale) || scale === 0) err(`${where} binds with an invalid scale`);
      if (l.kind === 'oneoff') err(`${where} is one-off and cannot bind to a parameter or variable`);
      if ('param' in l.binds) {
        const k = paramIndex.get(l.binds.param);
        if (k === undefined) err(`${where} binds to unknown parameter '${l.binds.param}'`);
        else {
          bindParam = k;
          usedParams.add(l.binds.param);
        }
      } else {
        const k = varIndex.get(l.binds.variable);
        if (k === undefined) err(`${where} binds to unknown variable '${l.binds.variable}'`);
        else if (!exogenous[k]) err(`${where} binds to '${l.binds.variable}', which has a rule; levers bind to parameters or exogenous variables`);
        else bindVar = k;
      }
    } else if (l.kind !== 'oneoff' && !leverReadByRule.has(l.id)) warn(`lever '${l.id}' is bound to nothing: it binds no parameter or variable and no rule reads it`);
    return { def: l, bindParam, bindVar, mode, scale };
  });
  /** A lever another declaration refers to: it must exist and be a setting or choice. */
  const settingLever = (id: Id | undefined, where: string, what: string): number => {
    const k = id === undefined ? undefined : leverIndex.get(id);
    if (k === undefined) {
      err(`${where} ${what} unknown lever '${id}'`);
      return -1;
    }
    if (levers[k].def.kind === 'oneoff') err(`${where} ${what} one-off lever '${id}'; it must be a setting or a choice`);
    return k;
  };
  /** Values a choice lever cannot take are almost certainly typos. */
  const checkOption = (k: number, value: number, where: string) => {
    const l = levers[k]?.def;
    if (!Number.isFinite(value)) err(`${where}: value ${value} is not a finite number`);
    else if (l?.kind === 'choice' && (l.options ?? []).length && !l.options!.some((o) => o.value === value)) err(`${where}: ${value} is not an option of choice lever '${l.id}'`);
  };
  levers.forEach(({ def: l, module }) => {
    if (!l.showWhen) return;
    const where = `lever '${l.id}' (module '${module}')`;
    if (l.showWhen.lever === l.id) err(`${where} showWhen refers to itself`);
    const k = settingLever(l.showWhen.lever, where, 'showWhen refers to');
    const vals = Array.isArray(l.showWhen.equals) ? l.showWhen.equals : [l.showWhen.equals];
    if (!vals.length) err(`${where} showWhen lists no values`);
    if (k >= 0) for (const v of vals) checkOption(k, v, `${where} showWhen`);
  });

  /* 8b. stabilisers --------------------------------------------------------- */
  const sm = def.stabiliserMode;
  let modeLever = -1;
  if (sm) {
    modeLever = settingLever(sm.lever, 'stabiliserMode', 'names');
    if (modeLever >= 0) {
      checkOption(modeLever, sm.manual, 'stabiliserMode.manual');
      checkOption(modeLever, sm.automatic, 'stabiliserMode.automatic');
      if (!leverReadByRule.has(sm.lever)) warn(`stabiliserMode lever '${sm.lever}' is read by no rule, so the mode changes nothing`);
    }
    if (sm.manual === sm.automatic) err('stabiliserMode: manual and automatic must be different values');
    if (!stabilisers.length) warn('stabiliserMode is declared but no module declares a stabiliser');
  } else if (stabilisers.length) err(`the model declares ${stabilisers.length} stabiliser(s) but no stabiliserMode: say which lever switches them between Manual and Automatic`);
  const cstabilisers: CStabiliser[] = stabilisers.map(({ def: s, module }) => {
    const where = `stabiliser '${s.id}' (module '${module}')`;
    if (!s.label) err(`${where} has no label`);
    if (!s.description) err(`${where} needs a description`);
    if (!(Number.isFinite(s.threshold) && s.threshold > 0)) err(`${where} needs a positive threshold (in lever units)`);
    const lever = settingLever(s.lever, where, 'acts on');
    const offset = s.offset === undefined ? lever : settingLever(s.offset, where, 'offsets with');
    if (lever >= 0 && lever === modeLever) err(`${where} acts on the stabiliser setting itself`);
    if (offset >= 0 && offset === modeLever && offset !== lever) err(`${where} offsets with the stabiliser setting itself`);
    const suggestion = varIndex.get(s.suggestion) ?? -1;
    if (suggestion < 0) err(`${where} suggests unknown variable '${s.suggestion}'`);
    if (s.feed) {
      if (!s.feed.raise || !s.feed.lower) err(`${where} feed needs both a 'raise' and a 'lower' message`);
      if (!indicatorIndex.has(s.feed.indicator)) err(`${where} feed opens unknown indicator '${s.feed.indicator}'`);
    }
    return { lever, offset, suggestion, module };
  });

  /* 9. indicators, feed, steady state, calibration ------------------------ */
  indicators.forEach(({ def: ind, module }) => {
    const where = `indicator '${ind.id}' (module '${module}')`;
    if (typeof ind.compute !== 'function') err(`${where} has no compute function`);
    if (!['deviation-pct', 'deviation-pp', 'deviation', 'level'].includes(ind.display)) err(`${where} has unknown display '${ind.display}'`);
    for (const d of ind.drivers ?? []) if (!varIndex.has(d)) err(`${where} lists unknown driver '${d}'`);
  });
  feed.forEach(({ def: f, module }) => {
    if (!indicatorIndex.has(f.indicator)) err(`feed rule '${f.id}' (module '${module}') watches unknown indicator '${f.indicator}'`);
    if (f.above === undefined && f.below === undefined) warn(`feed rule '${f.id}' has neither 'above' nor 'below'`);
  });
  const ss = def.steadyState;
  if (!ss) err('model has no steadyState spec');
  else {
    for (const id of ss.free ?? []) {
      if (!paramIndex.has(id)) err(`steadyState.free lists unknown parameter '${id}'`);
      usedParams.add(id);
    }
    if ((ss.free ?? []).length !== (ss.targets ?? []).length)
      err(`steadyState has ${(ss.free ?? []).length} free parameters but ${(ss.targets ?? []).length} targets; they must match`);
    for (const [ins, pl, v] of ss.initialStocks ?? []) {
      const ii = instrumentIndex.get(ins),
        pi = playerIndex.get(pl);
      if (ii === undefined || pi === undefined) err(`steadyState.initialStocks has unknown position ['${ins}', '${pl}']`);
      else if (roleOf(ii, pi) === ROLE_NONE) err(`steadyState.initialStocks: '${pl}' neither holds nor issues '${ins}'`);
      if (!Number.isFinite(v)) err(`steadyState.initialStocks ['${ins}', '${pl}'] is not finite`);
    }
    for (const id of Object.keys(ss.initialVars ?? {})) if (!varIndex.has(id)) err(`steadyState.initialVars has unknown variable '${id}'`);
  }
  for (const c of def.calibration ?? []) {
    for (const e of c.scenario) {
      const l = leverIndex.get(e.lever);
      if (l === undefined) err(`calibration check '${c.id}' uses unknown lever '${e.lever}'`);
      else if (!!e.fire !== (levers[l].def.kind === 'oneoff')) err(`calibration check '${c.id}': lever '${e.lever}' must ${e.fire ? 'not ' : ''}be fired`);
    }
    if (!(c.range[0] <= c.range[1])) err(`calibration check '${c.id}' has an empty range`);
  }

  /* 10. dry run: every read must be declared and must exist --------------- */
  const probeVar = (k: number) => vars[k].def.initial ?? ss?.initialVars?.[vars[k].def.id] ?? 1;
  const probeStocks = new Map<string, number>();
  for (const [ins, pl, v] of ss?.initialStocks ?? []) probeStocks.set(sk(ins, pl), v);
  const undeclared = new Set<string>();
  crules.forEach((cr) => {
    const r = cr.def;
    const where = `rule '${r.id}' (module '${cr.module}')`;
    let reads: Id[] = [];
    const note = (msg: string) => {
      if (!undeclared.has(where + msg)) {
        undeclared.add(where + msg);
        err(`${where} ${msg}`);
      }
    };
    const ctx: Ctx = {
      v(id) {
        const k = varIndex.get(id);
        if (k === undefined) {
          note(`reads unknown variable v('${id}')`);
          return 1;
        }
        if (!cr.inputMap.has(id)) note(`reads v('${id}') without declaring it in inputs`);
        reads.push(id);
        return probeVar(k);
      },
      lag(id, kk = 1) {
        const k = varIndex.get(id);
        if (k === undefined) {
          note(`reads unknown variable lag('${id}')`);
          return 1;
        }
        if (!cr.lagMap.has(id)) note(`reads lag('${id}') without declaring it in lagInputs`);
        if (!(Number.isInteger(kk) && kk >= 1)) note(`reads lag('${id}', ${kk}); k must be a whole number of steps ≥ 1`);
        reads.push(id);
        return probeVar(k);
      },
      p(id) {
        const k = paramIndex.get(id);
        if (k === undefined) {
          note(`reads unknown parameter p('${id}')`);
          return 1;
        }
        if (!cr.paramMap.has(id)) note(`reads p('${id}') without declaring it in params`);
        return params[k].def.value;
      },
      stock(ins, pl) {
        if (!instrumentIndex.has(ins) || !playerIndex.has(pl)) {
          note(`reads unknown stock('${ins}', '${pl}')`);
          return 1;
        }
        if (!cr.stockMap.has(sk(ins, pl))) note(`reads stock('${ins}', '${pl}') without declaring it in stocks`);
        return probeStocks.get(sk(ins, pl)) ?? 1;
      },
      lever(id) {
        const k = leverIndex.get(id);
        if (k === undefined) {
          note(`reads unknown lever('${id}')`);
          return 0;
        }
        if (!cr.leverMap.has(id)) note(`reads lever('${id}') without declaring it in levers`);
        return levers[k].def.default;
      },
      base(id) {
        const k = varIndex.get(id);
        if (k === undefined) {
          note(`reads unknown base('${id}')`);
          return 1;
        }
        return probeVar(k);
      },
      t: 0,
      dt: def.dt,
    };
    const guard = (what: string, fn: () => void) => {
      try {
        fn();
      } catch (e) {
        warn(`${where}: ${what} threw during the compile-time dry run: ${(e as Error).message}`);
      }
    };
    const termValues: Record<Id, number> = {};
    for (let j = 0; j < cr.termCount; j++) {
      const t = cterms[cr.termStart + j];
      reads = [];
      guard(`term '${t.def.id}'`, () => {
        termValues[t.def.id] = t.def.compute(ctx);
      });
      t.reads = [...new Set(reads)];
    }
    if (r.combine) guard('combine', () => void r.combine!(termValues, ctx));
    if (r.compute) guard('compute', () => void r.compute!(ctx));
    if (r.regime) guard('regime', () => void r.regime!(ctx, 1, termValues));
  });
  const readByIndicators = new Set<Id>();
  indicators.forEach(({ def: ind, module }) => {
    const where = `indicator '${ind.id}' (module '${module}')`;
    const ictx: IndicatorCtx = {
      v(id) {
        const k = varIndex.get(id);
        if (k === undefined) {
          err(`${where} reads unknown variable '${id}'`);
          return 1;
        }
        readByIndicators.add(id);
        return probeVar(k);
      },
      base(id) {
        const k = varIndex.get(id);
        if (k === undefined) {
          err(`${where} reads unknown variable base('${id}')`);
          return 1;
        }
        readByIndicators.add(id);
        return probeVar(k);
      },
      stock(ins, pl) {
        const ii = instrumentIndex.get(ins),
          pi = playerIndex.get(pl);
        if (ii === undefined || pi === undefined || roleOf(ii, pi) === ROLE_NONE) err(`${where} reads invalid stock('${ins}', '${pl}')`);
        return probeStocks.get(sk(ins, pl)) ?? 1;
      },
      baseStock(ins, pl) {
        return this.stock(ins, pl);
      },
    };
    try {
      if (typeof ind.compute === 'function') ind.compute(ictx);
    } catch (e) {
      warn(`${where} threw during the compile-time dry run: ${(e as Error).message}`);
    }
  });

  /* 11. schedule ---------------------------------------------------------- */
  const NR = crules.length;
  const adj: number[][] = crules.map((cr) => {
    const deps: number[] = [];
    for (const v of cr.inputs) {
      const rr = ruleOfVar[v];
      if (rr >= 0) deps.push(rr);
    }
    return deps;
  });
  const comps = orderComponents(NR, adj, tarjan(NR, adj));
  const blocks = comps.map((c) => ({
    rules: c,
    simultaneous: c.length > 1 || adj[c[0]].includes(c[0]),
  }));

  /* 12. warnings ---------------------------------------------------------- */
  const referenced = (id: Id | undefined, where: string) => {
    if (id && !conceptIndex.has(id)) warn(`concept '${id}' (used by ${where}) is not defined by any module`);
  };
  const conceptWarned = new Set<Id>();
  const refConcept = (id: Id | undefined, where: string) => {
    if (!id || conceptIndex.has(id) || conceptWarned.has(id)) return;
    conceptWarned.add(id);
    referenced(id, where);
  };
  rules.forEach(({ def: r }) => {
    for (const c of r.concepts ?? []) refConcept(c, `rule '${r.id}'`);
    for (const t of r.terms ?? []) refConcept(t.concept, `rule '${r.id}' term '${t.id}'`);
  });
  flows.forEach(({ def: f }) => (f.concepts ?? []).forEach((c) => refConcept(c, `flow '${f.id}'`)));
  levers.forEach(({ def: l }) => (l.concepts ?? []).forEach((c) => refConcept(c, `lever '${l.id}'`)));
  indicators.forEach(({ def: i }) => (i.concepts ?? []).forEach((c) => refConcept(c, `indicator '${i.id}'`)));
  instruments.forEach(({ def: i }) => (i.concepts ?? []).forEach((c) => refConcept(c, `instrument '${i.id}'`)));
  feed.forEach(({ def: f }) => refConcept(f.concept, `feed rule '${f.id}'`));
  stabilisers.forEach(({ def: s }) => (s.concepts ?? []).forEach((c) => refConcept(c, `stabiliser '${s.id}'`)));
  conceptList.forEach((c) => (c.related ?? []).forEach((r) => refConcept(r, `concept '${c.id}'`)));

  // parameters the closed-form steady state reads count as used: dry-run it on a recording record
  if (ss?.solve) {
    const rec: Record<Id, number> = {};
    params.forEach(({ def: p }) => (rec[p.id] = p.value));
    const probe = new Proxy(rec, {
      get(t, k) {
        if (typeof k === 'string') usedParams.add(k);
        return Reflect.get(t, k);
      },
    });
    try {
      ss.solve(probe);
    } catch (e) {
      warn(`steadyState.solve threw during the compile-time dry run: ${(e as Error).message}`);
    }
  }
  params.forEach(({ def: p }) => {
    if (!usedParams.has(p.id)) warn(`parameter '${p.id}' is not used by any rule, lever or the steady-state solver`);
  });
  const readVars = new Set<Id>(readByIndicators);
  crules.forEach((cr) => {
    for (const id of cr.inputMap.keys()) readVars.add(id);
    for (const id of cr.lagMap.keys()) readVars.add(id);
  });
  flows.forEach(({ def: f }) => (f.legs ?? []).forEach((l) => readVars.add(l.amount)));
  indicators.forEach(({ def: i }) => (i.drivers ?? []).forEach((d) => readVars.add(d)));
  clevers.forEach((l) => {
    if (l.bindVar >= 0) readVars.add(vars[l.bindVar].def.id);
  });
  stabilisers.forEach(({ def: s }) => readVars.add(s.suggestion));
  vars.forEach(({ def: v }, j) => {
    if (!readVars.has(v.id)) warn(`variable '${v.id}' is not read by any rule, leg or indicator`);
    if (lagged[j] && v.initial === undefined && ss?.initialVars?.[v.id] === undefined && !ss?.solve)
      warn(`variable '${v.id}' has no history: it is read with lag() or adjusts gradually but has no 'initial' value or initialVars guess, so the baseline solver starts it at 0`);
  });

  if (errors.length) throw new CompileError(errors, warnings);

  /* 13. assemble ---------------------------------------------------------- */
  const groups = hierarchy.groups;
  const groupChains = hierarchy.chains;
  const ruleIndex = new Map<Id, number>();
  crules.forEach((cr, j) => ruleIndex.set(cr.def.id, j));
  const ruleList = crules.map((c) => c.def);

  const model: KModel = {
    def,
    players: players.map((x) => x.def as PlayerDef),
    groups,
    instruments: instruments.map((x) => x.def as InstrumentDef),
    vars: vars.map((x) => x.def as VarDef),
    params: params.map((x) => x.def as ParamDef),
    rules: ruleList,
    flows: flows.map((x) => x.def as FlowDef),
    levers: levers.map((x) => x.def as LeverDef),
    indicators: indicators.map((x) => x.def as IndicatorDef),
    concepts: conceptList,
    feed: feed.map((x) => x.def as FeedRule),
    stabilisers: stabilisers.map((x) => x.def as StabiliserDef),
    stabiliserMode: sm ? { ...sm } : undefined,
    schedule: blocks.map((b) => ({ rules: b.rules.map((j) => ruleList[j].id), simultaneous: b.simultaneous })),
    ruleFor(varId: Id) {
      const k = varIndex.get(varId);
      return k === undefined || ruleOfVar[k] < 0 ? undefined : ruleList[ruleOfVar[k]];
    },
    nodeOf(player: Id, expanded: readonly Id[] | ReadonlySet<Id>): Id {
      const j = playerIndex.get(player);
      if (j === undefined) throw new Error(`nodeOf: unknown player '${player}'`);
      return nodeFor(groupChains[j], expanded instanceof Set ? expanded : new Set(expanded), player);
    },
    warnings,
    NV,
    NP,
    NI,
    varIndex,
    paramIndex,
    playerIndex,
    instrumentIndex,
    leverIndex,
    flowIndex,
    indicatorIndex,
    ruleIndex,
    conceptIndex,
    ruleOfVar,
    exogenous,
    lagged,
    crules,
    cterms,
    termKeyIndex,
    clegs,
    clevers,
    blocks,
    role,
    signExempt,
    settlement,
    pay,
    origin,
    groupIndex: hierarchy.groupIndex,
    groupChains,
    cstabilisers,
    modeLever,
  };
  return model;
}
