/**
 * Iceland Inc. — the model language and engine contract.
 *
 * A model is DECLARED as data plus small pure functions, then COMPILED and RUN by the
 * kernel. The kernel knows nothing about Iceland: it knows players, instruments,
 * variables, rules, flows, levers, indicators and concepts.
 *
 * Paradigm (Keen / Godley): the economy is money flowing between the balance sheets of
 * players. Every flow is posted twice (payer −, payee +). Stocks change ONLY through
 * postings. Behaviour decides how big the flows are; accounting decides where the money
 * goes. See docs/architecture.md for the reasoning behind every choice here.
 *
 * Units convention (whole model):
 *   - Money flows: % of baseline annual nominal GDP, at an annual rate (baseline GDP = 100).
 *   - Money stocks: % of baseline annual nominal GDP.
 *   - Rates: fractions per year (0.05 = 5%). Prices: indices (baseline = 1).
 *   - Time: years; the step dt is 1/12 (one month).
 */

export type Id = string;

/** What kind of truth an equation expresses. Shown to users next to every rule. */
export type Category =
  | 'IDENTITY' //  accounting: always true by construction (a sum, a balance)
  | 'CONTRACT' //  institutional or contractual rule: amortisation, indexation, a legal cap
  | 'BEHAVIOUR' // an assumption about how people or firms act; adjustable
  | 'POLICY'; //   a decision rule or setting of an authority (central bank, government)

/** Where a number comes from. Every parameter carries one; the inspector shows it. */
export interface Provenance {
  basis: 'data' | 'assumed' | 'placeholder' | 'calibrated' | 'derived';
  source?: string; // URL, table id or citation
  vintage?: string; // e.g. "2025"
  note?: string;
}

export interface ParamDef {
  id: Id;
  value: number;
  unit: string;
  category: Category;
  description: string;
  provenance: Provenance;
  min?: number;
  max?: number;
}

/* ------------------------------------------------------------------ players */

/** How a player pays and gets paid. The payment system settles every cash leg. */
export type Settlement =
  | 'deposits' //  holds deposits at the bank (households, firms, pension funds, rest of world)
  | 'bank' //      the bank: pays depositors by crediting deposits; pays the state/CB in reserves
  | 'treasury' //  the government: pays from its account at the central bank
  | 'central-bank'; // the central bank: issues reserves and the treasury account

export interface PlayerDef {
  id: Id;
  label: string;
  short?: string;
  /** The group the player belongs to directly: a GroupDef id, or (in models that declare
   *  no GroupDefs) a free label such as 'Households', which becomes a top-level group.
   *  Empty: the player sits at the top level on its own. */
  group: string;
  color?: string;
  description: string;
  settlement: Settlement;
  /** Layout hint for the flow map, normalised 0..1 (x right, y down). */
  layout?: { x: number; y: number };
}

/**
 * A node in the player hierarchy. Groups nest: Firms → Exporters → Fisheries (a player).
 * The flow map shows a group as one node until the user expands it, one level at a time;
 * pipes are then drawn to whatever level is visible. Groups have no balance sheet of their
 * own: theirs is the sum of their members'.
 */
export interface GroupDef {
  id: Id;
  label: string;
  parent?: Id; // enclosing group; none = top level
  color?: string;
  description: string;
  /** Where the collapsed node sits (normalised 0..1). Default: the centroid of its members. */
  layout?: { x: number; y: number };
}

/* -------------------------------------------------------------- instruments */

export interface InstrumentDef {
  id: Id;
  label: string;
  kind: 'financial' | 'real';
  /** Financial: players whose LIABILITY it is. Real assets: empty. */
  issuers: Id[];
  /** Players who may hold it as an ASSET. */
  holders: Id[];
  /** Informational. Revaluation flows do the actual revaluing. */
  valuation: 'nominal' | 'cpi-indexed' | 'fx' | 'price-index' | 'at-cost';
  description: string;
  concepts?: Id[];
}

/* ---------------------------------------------------------------- variables */

export interface VarDef {
  id: Id;
  label: string;
  unit: string;
  description?: string;
  kind: 'flow' | 'price' | 'rate' | 'ratio' | 'quantity' | 'expectation' | 'index' | 'state' | 'exogenous';
  /** How the variable scales on a growth path (for the balanced-growth baseline). */
  scale?: 'nominal' | 'real' | 'none';
  /** Value used before the first step if the baseline solver does not set it. */
  initial?: number;
}

/* -------------------------------------------------------------------- rules */

/** Read-only view of the model inside a rule, term, indicator or regime function. */
export interface Ctx {
  /** Same-step value of a variable. Must be declared in `inputs`. */
  v(id: Id): number;
  /** Value k steps ago (default 1). Must be declared in `lagInputs`. k runs from 1 to the
   *  engine's lag window (two years of steps by default); use Math.round(n / c.dt) for
   *  "n years ago" so the rule survives a change of step. Before t = 0 it is the baseline. */
  lag(id: Id, k?: number): number;
  /** Parameter value, after any lever that binds to it. Must be declared in `params`. */
  p(id: Id): number;
  /** Stock position of a player in an instrument at the end of the previous step
   *  (asset positive for holders, liability positive for issuers). Declare in `stocks`. */
  stock(instrument: Id, player: Id): number;
  /** Current value of a lever setting. Declare in `levers`. */
  lever(id: Id): number;
  /** Baseline (steady-state) value of a variable. Allowed without declaration.
   *  While the baseline is being solved it returns the current guess, so a rule that
   *  measures a gap against base() cannot pin the steady state; use a parameter for that. */
  base(id: Id): number;
  readonly t: number; // years since start
  readonly dt: number; // years per step
}

/** One named, additive piece of a rule. Terms make influences exact within the rule. */
export interface TermDef {
  id: Id; // unique within the rule
  label: string; // plain words: "Higher key rate"
  concept?: Id; // the economic idea this term expresses
  compute: (c: Ctx) => number;
}

/**
 * The ONE rule that determines a variable. Exactly one of `terms` or `compute`.
 *   value* = combine(terms)  (default: sum of terms)  or  compute(ctx)
 *   if `adjust` is set: value = lag(value) + k·(value* − lag(value))  (gradual adjustment), with
 *     k = speed·dt (form 'linear', the default) or k = 1 − exp(−speed·dt) (form 'exponential')
 */
export interface RuleDef {
  id: Id;
  target: Id; // the variable this rule determines
  category: Category;
  label?: string;
  inputs?: Id[]; // same-step dependencies (create simultaneity if they loop)
  lagInputs?: Id[]; // previous-step dependencies (never create simultaneity)
  params?: Id[];
  stocks?: [instrument: Id, player: Id][];
  levers?: Id[];
  terms?: TermDef[];
  /** Non-additive combination of term values, e.g. Math.min for binding caps. */
  combine?: (terms: Record<Id, number>, c: Ctx) => number;
  compute?: (c: Ctx) => number;
  /** Partial adjustment toward the rule's value (Keen-style time constants). */
  /** Speed per year (a param id or a number). Form 'linear' (default) closes speed·dt of the gap
   *  each step. Form 'exponential' closes 1 − exp(−speed·dt): the exact solution of a first-order
   *  lag over one step with the target held fixed. It never overshoots, however fast the speed,
   *  and changes less when the step is halved. */
  adjust?: { speed: Id | number; form?: 'linear' | 'exponential' };
  /** Name the active branch, e.g. "Debt-service cap binds". Null when nothing special. */
  regime?: (c: Ctx, value: number, terms: Record<Id, number>) => string | null;
  concepts?: Id[];
  explain: {
    what: string; // plain English: what this quantity is
    rule: string; // plain English with the formula; may use {paramId} placeholders
  };
  /** Set when a module deliberately replaces another module's rule for the same target. */
  replaces?: Id;
}

/* -------------------------------------------------------------------- flows */

export type FlowKind = 'cash' | 'accrual' | 'revaluation' | 'writeoff';
export type Account = 'current' | 'capital' | 'financial' | 'other';

/** How a flow's legs change balance sheets. The kernel implements each exactly once. */
export type Posting =
  /** Cash payment for income or spending (wages, taxes, interest, consumption). */
  | { type: 'transfer' }
  /** Cash payment that buys a real asset at cost (investment, new homes). */
  | { type: 'purchase'; realAsset: Id }
  /** New claim: the lender (`from`) pays the borrower (`to`) cash and gains the claim;
   *  the borrower owes it. A bank lender pays by creating a deposit: new money. */
  | { type: 'issue'; instrument: Id }
  /** Repayment: borrower pays lender cash; the claim shrinks on both sides. */
  | { type: 'redeem'; instrument: Id }
  /** Existing asset changes hands for cash: buyer pays seller, position moves. */
  | { type: 'trade'; instrument: Id }
  /** Interest or indexation capitalised into the claim: no cash moves. */
  | { type: 'accrue'; instrument: Id }
  /** Valuation change (e.g. FX): no cash, no income; goes to the revaluation account. */
  | { type: 'revalue'; instrument: Id }
  | { type: 'writeoff'; instrument: Id };

/**
 * One payer → payee component of a flow, with its own amount variable (≥ 0 normally).
 * Direction conventions per posting:
 *   transfer / purchase: from = payer, to = payee.
 *   issue:   from = lender (pays cash, gains the asset), to = borrower (gets cash, owes the claim).
 *   redeem:  from = borrower (pays cash), to = lender (claim reduced).
 *   trade:   from = buyer (pays cash, gains the asset), to = seller.
 *   accrue:  from = debtor (owes more), to = creditor (claim grows).
 *   revalue / writeoff: from = the side that loses value, to = the side that gains.
 *   A REAL asset has no issuer, so its revalue / writeoff is one-sided: set from = to = the
 *   holder. The holder's asset changes by +amount (revalue) or −amount (writeoff).
 *   A revalue between two different HOLDERS of the same instrument is a reclassification: value
 *   moves from one holder to the other with no cash and no income (retirement moving pension
 *   rights, households taking their homes with them as they age).
 * A negative amount reverses the posting (a negative issue is a repayment).
 * Pipes on the flow map are drawn from `from` to `to`; particles move with the cash.
 */
export interface LegDef {
  from: Id;
  to: Id;
  amount: Id; // variable id, annual rate
}

export interface FlowDef {
  id: Id;
  label: string;
  kind: FlowKind;
  account: Account;
  posting: Posting;
  legs: LegDef[];
  channel?: string; // e.g. 'health' for government spending channels
  concepts?: Id[];
  explain: { what: string };
}

/* ------------------------------------------------------------------- levers */

export interface LeverDef {
  id: Id;
  label: string;
  group: 'Policy' | 'Economy' | 'World' | string;
  section?: string; // UI accordion section, e.g. 'Central bank'
  kind: 'setting' | 'choice' | 'oneoff';
  unit: string;
  default: number; // baseline setting (settings) or default size (one-offs)
  min?: number;
  max?: number;
  step?: number;
  options?: { value: number; label: string }[]; // for 'choice'
  /** Settings bind to a parameter (replace or add) or to an exogenous variable.
   *  `scale` converts lever units to model units (default 1), e.g. 0.01 for a lever in pp
   *  bound to a rate held as a fraction: add → base + scale·value; replace → scale·value. */
  binds?: { param: Id; mode: 'replace' | 'add'; scale?: number } | { variable: Id; mode: 'replace' | 'add'; scale?: number };
  /** One-off shocks may only change NON-stock state (a wage level, expectations, sentiment).
   *  The kernel rejects writes to instrument positions, so accounting cannot break. */
  fire?: (s: ShockApi, size: number) => void;
  description: string;
  /** Precise definition: level vs growth, duration, what happens when it ends. */
  definition: string;
  concepts?: Id[];
  /** Show the lever only while another lever (a setting or choice) has one of these values,
   *  e.g. only in one stabiliser mode. Presentation only: the engine still applies its value. */
  showWhen?: { lever: Id; equals: number | number[] };
}

/**
 * A stabiliser: an automatic POLICY reaction, such as a central bank's inflation rule or a
 * debt-tied tax rule, declared so that it never acts unseen. The model's global stabiliser
 * setting (ModelDef.stabiliserMode) decides whether it acts:
 *   Automatic: the model's rules apply it (the user's lever becomes an offset to the rule);
 *   Manual:    policy levers stay where the user sets them, and the stabiliser only suggests.
 * The model must compute `suggestion` in BOTH modes (in Manual it is a shadow value).
 */
export interface StabiliserDef {
  id: Id;
  label: string; // "Central bank’s inflation rule"
  /** The POLICY lever it acts on or stands in for: the lever the user sets in Manual mode. */
  lever: Id;
  /** Variable: what the rule would set `lever` to now, in the lever's units. */
  suggestion: Id;
  /** In lever units: |suggestion − lever value| above this counts as calling for action. */
  threshold: number;
  description: string;
  concepts?: Id[];
  /** Automatic mode: the lever that offsets the rule, when it is not `lever` itself (a key-rate
   *  add-on that replaces a hidden key-rate level). Default: `lever`. */
  offset?: Id;
  /** Feed messages when the stabiliser starts calling in Manual mode: `raise` when the suggestion
   *  is above the lever, `lower` when below. `{value}` is the suggestion and `{change}` the size of
   *  the gap, in lever units. `indicator` is the chart the message opens. */
  feed?: { raise: string; lower: string; indicator: Id };
}

/** A stabiliser now (Engine.stabilisers()). `gap` = suggested − current, in lever units. */
export interface StabiliserState {
  id: Id;
  label: string;
  lever: Id;
  /** The lever that offsets the rule in Automatic mode (`lever` unless declared). */
  offset: Id;
  suggested: number;
  current: number;
  gap: number;
  /** Manual mode and |gap| > threshold: the rule would move the lever if it were in charge. */
  calling: boolean;
  /** The model's stabiliser setting is Automatic: the rule is acting. */
  automatic: boolean;
  description: string;
}

export interface ShockApi {
  /** Latest value of a variable (its previous-step value as the next step will see it). */
  get(varId: Id): number;
  /** Set the previous-step value of a state variable (the shock is then felt this step).
   *  Only variables some rule reads with lag() (or adjusts gradually) can be shocked;
   *  anything else, and every instrument position, is rejected. */
  setLagged(varId: Id, value: number): void;
}

/* --------------------------------------------------------------- indicators */

export interface IndicatorCtx {
  v(id: Id): number; // current value of any variable
  base(id: Id): number; // its baseline value
  stock(instrument: Id, player: Id): number; // current position
  baseStock(instrument: Id, player: Id): number;
}

export interface IndicatorDef {
  id: Id;
  label: string;
  group: string; // chart tab, e.g. 'Overview', 'People'
  /** Display unit after the transform, e.g. '% vs baseline', 'pp vs baseline'. */
  unit: string;
  compute: (c: IndicatorCtx) => number; // the LEVEL
  /** How the chart shows it:
   *   'deviation-pct': (level / baseline − 1) × 100   (e.g. output, % vs baseline)
   *   'deviation-pp':  (level − baseline) × 100       (for levels held as fractions: rates, shares)
   *   'deviation':     level − baseline               (levels already in display units, e.g. % of GDP)
   *   'level':         level                                                                   */
  display: 'deviation-pct' | 'deviation-pp' | 'deviation' | 'level';
  description: string;
  /** The variable(s) behind it, so the inspector can open their rules. */
  drivers?: Id[];
  concepts?: Id[];
}

/* ----------------------------------------------------------------- concepts */

export type School =
  | 'accounting'
  | 'post-keynesian'
  | 'keynesian'
  | 'new-keynesian'
  | 'monetarist'
  | 'institutional'
  | 'empirical';

export interface ConceptDef {
  id: Id;
  title: string;
  oneLiner: string; // ≤ 25 words, plain English
  body: string; // markdown, 80–250 words, plain English, no jargon without explanation
  school: School;
  references?: { title: string; url?: string }[];
  related?: Id[];
}

/* -------------------------------------------------------------------- feed */

export interface FeedRule {
  id: Id;
  indicator: Id;
  above?: number;
  below?: number;
  message: string; // "The central bank raises its key rate"
  concept?: Id;
}

/* ------------------------------------------------------------------ modules */

export interface ModuleTest {
  id: Id;
  label: string;
  run: (engine: Engine) => { pass: boolean; detail: string };
}

/** A self-contained piece of the economy. Models are lists of modules. */
export interface ModuleDef {
  id: Id;
  label: string;
  description: string;
  requires?: Id[];
  groups?: GroupDef[];
  players?: PlayerDef[];
  instruments?: InstrumentDef[];
  vars?: VarDef[];
  params?: ParamDef[];
  rules?: RuleDef[];
  flows?: FlowDef[];
  levers?: LeverDef[];
  indicators?: IndicatorDef[];
  concepts?: ConceptDef[];
  feed?: FeedRule[];
  /** Automatic policy reactions this module's rules implement (see StabiliserDef). */
  stabilisers?: StabiliserDef[];
  tests?: ModuleTest[];
}

/** Calibration targets checked by the harness: a scenario and a plausible range. */
export interface CalibrationCheck {
  id: Id;
  label: string;
  scenario: ScenarioEvent[];
  months: number;
  measure: (run: RunResult) => number;
  range: [number, number];
  source?: string; // where the target range comes from
}

export interface SteadyStateSpec {
  /** Parameters the solver may move to hit the targets (same count as targets). */
  free: Id[];
  targets: { id: Id; describe: string; residual: (c: IndicatorCtx) => number }[];
  /** Initial stock positions [instrument, player, value] and variable guesses.
   *  Values use the Ctx.stock sign convention (holders' assets and issuers' liabilities are
   *  both positive). A financial instrument's single issuer (or else single holder) may be
   *  left out: the kernel fills it so the instrument balances. */
  initialStocks: [Id, Id, number][];
  initialVars?: Record<Id, number>;
  /** Optional closed-form solver; if present the kernel uses it before Newton polishing. */
  solve?: (params: Record<Id, number>) => { stocks: [Id, Id, number][]; vars: Record<Id, number>; params?: Record<Id, number> };
}

export interface ModelDef {
  id: Id;
  label: string;
  description: string;
  modules: ModuleDef[];
  paymentSystem: {
    bank: Id; // the (consolidated) bank player
    centralBank: Id;
    treasury: Id; // the government player
    deposits: Id; // instrument: bank deposits
    reserves: Id; // instrument: reserves at the central bank
    treasuryAccount: Id; // instrument: government account at the central bank
  };
  dt: number; // 1/12
  steadyState: SteadyStateSpec;
  calibration?: CalibrationCheck[];
  /** The global stabiliser setting: the lever whose value says Manual or Automatic. Required
   *  when any module declares stabilisers. A value nearer `automatic` than `manual` is Automatic. */
  stabiliserMode?: { lever: Id; manual: number; automatic: number };
}

/* ------------------------------------------------------------------ runtime */

export interface ScenarioEvent {
  t: number; // step index at which it applies (= month index at the standard dt of 1/12), before that step runs
  lever: Id;
  value: number; // new setting, or size for a one-off
  fire?: boolean; // true for one-offs
}

export interface Scenario {
  modelId: Id;
  events: ScenarioEvent[];
  months: number;
}

export interface RunResult {
  months: number;
  series(indicatorId: Id): number[]; // per month, in display units; months + 1 entries (index 0 = baseline)
  value(varId: Id, month: number): number;
}

/** A leg's flow this step, for pipes and the ledger view. */
export interface LegSnapshot {
  flow: Id;
  from: Id;
  to: Id;
  kind: FlowKind;
  value: number;
  baseline: number;
}

/** Which groups are expanded on the flow map. Unknown ids are ignored; a group whose
 *  parent is collapsed stays hidden whether it is listed or not. */
export interface PipeView {
  expanded: readonly Id[];
}

/** A pipe = all legs between two nodes (players or groups) of one kind. */
export interface Pipe {
  from: Id;
  to: Id;
  kind: FlowKind;
  value: number;
  baseline: number;
  legs: LegSnapshot[];
}

export interface BalanceSheet {
  player: Id;
  assets: { instrument: Id; label: string; value: number; baseline: number }[];
  liabilities: { instrument: Id; label: string; value: number; baseline: number }[];
  netWorth: number;
  netWorthBaseline: number;
}

/** "What is driving this right now?" — exact within a rule, by construction. */
export interface Influence {
  id: Id; // variable, leg amount, flow or indicator
  label: string;
  value: number;
  baseline: number;
  category?: Category;
  rule?: { id: Id; what: string; rule: string };
  regime?: string | null;
  /** For rules with gradual adjustment: the desired value the variable is moving toward. */
  desired?: number;
  desiredBaseline?: number;
  /** Term values now vs baseline. Sums to the change in the desired value for additive rules. */
  terms: { id: Id; label: string; value: number; baseline: number; change: number; concept?: Id; inputs: Id[] }[];
  /** True when terms are combined non-additively (e.g. a min), so changes do not simply add. */
  nonAdditive: boolean;
  params: { id: Id; value: number; unit: string; provenance: Provenance }[];
  upstream: Id[]; // variables this one reads (for navigation and trace-back)
  concepts: Id[];
}

export interface CheckReport {
  t: number;
  maxResidual: number;
  items: { id: Id; label: string; residual: number }[];
  /** Tolerance the residuals are compared with (1e-9 by default). */
  tolerance?: number;
  /** Every check that exceeded the tolerance since the last reset, oldest first. */
  failures?: { t: number; id: Id; residual: number }[];
}

export interface Engine {
  readonly model: CompiledModel;
  readonly t: number; // months since start
  reset(): void;
  step(n?: number): void;
  setLever(id: Id, value: number): void;
  fire(id: Id, size?: number): void;
  leverValue(id: Id): number;
  readonly events: ScenarioEvent[];
  /** Replay a scenario deterministically from the baseline. */
  load(s: Scenario): void;
  seek(month: number): void; // deterministic time travel (replays from snapshots)
  value(varId: Id): number;
  baseline(varId: Id): number;
  indicator(id: Id): number; // current, in display units
  series(id: Id): { t: number; v: number }[]; // indicator in display units (or a variable's raw values), full history
  legs(): LegSnapshot[];
  /**
   * Pipes at a chosen level of the player hierarchy.
   *   'player' — every player; 'group' — top-level groups only;
   *   { expanded } — mixed: each player is drawn as its OUTERMOST collapsed ancestor group,
   *   or as itself when all its ancestors are expanded. Legs inside one visible node are
   *   returned as a pipe from the node to itself (drawn as a loop).
   */
  pipes(level: 'player' | 'group' | PipeView): Pipe[];
  /** A player's balance sheet, or a group's: the sum of its members' (claims between
   *  members are kept gross, so a group's balance sheet is not consolidated). */
  balanceSheet(playerOrGroup: Id): BalanceSheet;
  influences(id: Id): Influence;
  /** Concepts weighted by how much their terms currently move things (for "ideas at play").
   *  The scope is the economy (default), a player, a group at any depth, a flow, a variable,
   *  an indicator, or a pipe 'from->to[:kind]' whose ends are players or groups at any level
   *  (a group end stands for all its players). */
  ideasAtPlay(scope?: Id): { concept: Id; weight: number; via: Id[] }[];
  checks(): CheckReport;
  /** Narration: feed rules crossing their thresholds, and (Manual mode) stabilisers that start
   *  calling for action, marked with the stabiliser's id. */
  feed(): { t: number; message: string; indicator: Id; concept?: Id; stabiliser?: Id }[];
  /** Every declared stabiliser now, in declaration order: what it suggests, and whether it acts
   *  (Automatic) or calls for action (Manual, gap above its threshold). */
  stabilisers(): StabiliserState[];
  /** Independent copy for counterfactuals: compare shock vs no-shock within the SAME variant.
   *  The fork replays this engine's events from the baseline under its own options.
   *  disableTerms ('ruleId.termId' or 'varId.termId') holds those terms at their baseline
   *  values ("without this channel"); params override parameter values without re-solving
   *  the baseline. */
  fork(opts?: { disableTerms?: Id[]; params?: Record<Id, number> }): Engine;
}

/** Output of the compiler: validated, indexed and ordered. */
export interface CompiledModel {
  def: ModelDef;
  players: PlayerDef[];
  /** The player hierarchy, parents before children. `players` are direct members,
   *  `allPlayers` every descendant player, `children` the direct child groups. */
  groups: {
    id: Id;
    label: string;
    parent?: Id;
    depth: number; // 0 = top level
    children: Id[];
    players: Id[];
    allPlayers: Id[];
    color?: string;
    description?: string;
    layout?: { x: number; y: number };
  }[];
  /** The node a player is drawn as, given the expanded groups: its outermost collapsed
   *  enclosing group, or the player itself when every enclosing group is expanded. */
  nodeOf(player: Id, expanded: readonly Id[] | ReadonlySet<Id>): Id;
  instruments: InstrumentDef[];
  vars: VarDef[];
  params: ParamDef[];
  rules: RuleDef[];
  flows: FlowDef[];
  levers: LeverDef[];
  indicators: IndicatorDef[];
  concepts: ConceptDef[];
  feed: FeedRule[];
  /** Declared stabilisers of every module, in module order. */
  stabilisers: StabiliserDef[];
  stabiliserMode?: { lever: Id; manual: number; automatic: number };
  /** Evaluation schedule: ordered blocks; a block with >1 rule is solved simultaneously. */
  schedule: { rules: Id[]; simultaneous: boolean }[];
  ruleFor(varId: Id): RuleDef | undefined;
  warnings: string[];
}
