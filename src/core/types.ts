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
  /** Opt out of the position-sign diagnostic (CheckReport.signViolations) for positions the
   *  model knowingly lets take the other sign: a holder's asset below zero (an overdraft) or an
   *  issuer's liability below zero (a net claim), in the Ctx.stock sign convention. `players`
   *  limits it to those holders or issuers (default: every position of the instrument). The
   *  `reason` is required and says why the sign is free, e.g. "non-residents' króna deposits
   *  are a net position: below zero is an overdraft at domestic banks". Decision 0005. */
  mayGoNegative?: { reason: string; players?: Id[] };
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
  /** Value k kernel steps ago (default 1: the previous step, a sub-step when the model takes
   *  several a month). Must be declared in `lagInputs`. k runs from 1 to the engine's lag window
   *  (two years of steps by default); use Math.round(n / c.dt) for "n years ago" so the rule
   *  survives a change of step. Before t = 0 it is the baseline. */
  lag(id: Id, k?: number): number;
  /** Parameter value, after any lever that binds to it. Must be declared in `params`. */
  p(id: Id): number;
  /** Stock position of a player in an instrument at the end of the previous step
   *  (asset positive for holders, liability positive for issuers). Declare in `stocks`. */
  stock(instrument: Id, player: Id): number;
  /** Current value of a lever setting. Declare in `levers`. */
  lever(id: Id): number;
  /** Is a stabiliser's padlock closed? Closed (locked): the policy lever stays where the user set
   *  it, and everything else reacts. Open (unlocked, the default): the rule sets the policy
   *  variable. Declare the stabiliser's id in `locks`. */
  locked(stabiliser: Id): boolean;
  /** Baseline (steady-state) value of a variable. Allowed without declaration.
   *  While the baseline is being solved it returns the current guess, so a rule that
   *  measures a gap against base() cannot pin the steady state; use a parameter for that. */
  base(id: Id): number;
  readonly t: number; // years since start
  readonly dt: number; // years per kernel step: the model's dt ÷ its substeps
}

/** One named, additive piece of a rule. Terms make influences exact within the rule. */
export interface TermDef {
  id: Id; // unique within the rule
  label: string; // plain words: "Higher key rate"
  concept?: Id; // the economic idea this term expresses
  compute: (c: Ctx) => number;
  /** How a month shows the term when the model runs several kernel steps a month
   *  (ModelDef.substeps). By default the month shows the value at its last sub-step, which is
   *  right for a level or a rate per year. A term that is a change per kernel step (a month's
   *  growth, one step toward a target) is `'sum'`: the month shows its sum over the sub-steps, and
   *  its baseline × the sub-steps, so the inspector reads "this month" whatever the step. A term
   *  that carries a level into the step (last month's wage rate) is `'first'`: the month shows the
   *  value at its first sub-step, so `'first'` + `'sum'` terms add up to the month-end value. */
  month?: 'sum' | 'first';
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
  /** Stabilisers whose padlock the rule reads with `locked()` (StabiliserDef ids). */
  locks?: Id[];
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
  /** Players whose cards show this regime. [] keeps a global regime in the equation inspector;
   * omitted uses the UI's existing stock/flow ownership inference. Reporting metadata only. */
  owners?: Id[];
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
 * A negative amount reverses the posting (a negative issue is a repayment). Postings are linear
 * in the amount, so every negative amount keeps the accounting exact, but it may not mean what
 * the flow's name says:
 *   purchase < 0 un-produces the real asset: the buyer's asset shrinks and the seller pays the
 *     buyer and books negative income. It is not a resale; move a used asset between holders
 *     with a `trade`. Model authors should floor gross investment at zero (a `combine` with a
 *     named `regime`), so that capital shrinks only through depreciation.
 * The position-sign diagnostic (CheckReport.signViolations) reports a stock that such a
 * reversal drives below zero.
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
  /** Is the lever in the lever panel (default true)? false keeps a less central lever off it: it
   *  still runs everywhere else (the engine, scenarios, share links, the harness and the lever
   *  report), and the panel shows it in its section while it is off its default or a scenario
   *  moves it, so nothing acts unseen. A lever with a padlock is always shown (decision 0017). */
  shown?: boolean;
  /** 'lock' levers are made by the compiler, one per stabiliser (its padlock); models declare
   *  settings, choices and one-offs. */
  kind: 'setting' | 'choice' | 'oneoff' | 'lock';
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
  /** Padlocks only (kind 'lock'): the policy lever this padlock locks, and its stabiliser. */
  locks?: { lever: Id; stabiliser: Id };
}

/**
 * A stabiliser: an automatic POLICY reaction, such as a central bank's inflation rule or a
 * debt-tied tax rule, declared so that it never acts unseen. Each stabiliser's lever has a padlock
 * (a 'lock' lever the compiler adds, `<lever>Lock`, decision 0010):
 *   Unlocked (open, the default): the rule sets the policy variable, and the lever shows its value;
 *   Locked (closed): the policy variable holds the lever's value, and everything else reacts.
 * Closing the padlock freezes the lever at the value in force (`current`); setting the lever while
 * it is unlocked closes the padlock at the new value. The model must compute `suggestion` whether
 * the padlock is open or closed (while it is closed it is a shadow value).
 */
export interface StabiliserDef {
  id: Id;
  label: string; // "Central bank’s inflation rule"
  /** The POLICY lever it moves while unlocked: the lever the user holds by locking it. */
  lever: Id;
  /** Variable: what the rule would set `lever` to now, in the lever's units. */
  suggestion: Id;
  /** The policy value in force, in the lever's units, read at the end of a month: what closing
   *  the padlock freezes the lever at, and what the lever shows while it is unlocked. At the
   *  baseline it must equal the lever's default. */
  current: (c: IndicatorCtx) => number;
  /** In lever units: |suggestion − lever value| above this counts as calling for action. */
  threshold: number;
  description: string;
  concepts?: Id[];
  /** Feed messages when a locked stabiliser starts calling: `raise` when the suggestion is above
   *  the lever, `lower` when below. `{value}` is the suggestion and `{change}` the size of the gap,
   *  in lever units. `indicator` is the chart the message opens. */
  feed?: { raise: string; lower: string; indicator: Id };
  /** Variables that only feed the suggestion while the stabiliser is locked, such as the rate a
   *  Taylor rule calls for: then they drive nothing, so ideas at play leaves them out (unless an
   *  unlocked stabiliser's rule still reads them). The compiler checks that no other rule reads
   *  them when every stabiliser is locked. */
  shadow?: Id[];
  /** One calm line, in plain English, that the lever's info panel adds while this stabiliser is
   *  locked and another is unlocked: what holding this lever alone, with the other rules acting,
   *  does that a student would not expect (decision 0015). It shows nowhere else. */
  lockedAloneNote?: string;
}

/** A stabiliser now (Engine.stabilisers()). `gap` = suggested − current, in lever units. */
export interface StabiliserState {
  id: Id;
  label: string;
  lever: Id;
  /** Its padlock: the 'lock' lever to set to 1 (lock) or 0 (unlock). */
  lock: Id;
  /** The padlock is closed: the lever stays where the user set it, and everything else reacts. */
  locked: boolean;
  suggested: number;
  /** The policy value in force, in lever units: the lever's value while locked, the rule's
   *  value (StabiliserDef.current) while unlocked. */
  current: number;
  gap: number;
  /** Locked and |gap| > threshold: the rule would move the lever if it were in charge. */
  calling: boolean;
  description: string;
}

/**
 * How to read a scenario written before padlocks (scenario format 1, decision 0010). Then one
 * global lever switched every stabiliser between Manual (held) and Automatic (the rules act), the
 * held levels had levers of their own, and on Automatic offset levers tilted the rules.
 */
export interface LegacyStabiliserMode {
  /** The old global setting, its two values and its default. */
  lever: Id;
  manual: number;
  automatic: number;
  default: number;
  /** Levers the old Manual mode held, by old id → new id: kept on Manual, dropped on Automatic
   *  (where they did nothing). */
  held: Record<Id, Id>;
  /** Levers that tilted a rule on Automatic: dropped, with a notice when one was set away from 0
   *  while it acted. A lever may be both held and an offset (a tax lever that was a level on
   *  Manual and a shift on top of the rule on Automatic). */
  offsets: Id[];
  /** True when the rules no longer took over the old way: switching to Automatic after a hold
   *  jumped onto the rule's shadow path, and unlocking now steps from the held value. The run
   *  then differs from that month on, and the migration says so. */
  takeoverChanged?: boolean;
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

/** Reporting only: these functions read recorded values and never set economic state. */
export type IndicatorBasis = 'nominal' | 'real';
export interface IndicatorLevelDef {
  kind: 'rate' | 'ratio' | 'amount' | 'index';
  unit: string;
  realUnit?: string;
  nominalLabel?: string;
  realLabel?: string;
  description?: string;
  realDescription?: string;
  scale?: number;
  rebase?: boolean;
  nominal?: (c: IndicatorCtx) => number;
  real?: (c: IndicatorCtx) => number;
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
  /** Optional actual-level views; compute/display remain the legacy effect contract. */
  level?: IndicatorLevelDef;
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
  /** Automatic policy reactions this module's rules implement (see StabiliserDef); each one's
   *  lever gets a padlock. */
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
  /** 'timing': the measure is a time in whole quarters (the quarter of a peak or trough), so the
   *  harness's half-step test allows it to move by one quarter, not by a share of its value.
   *  Default 'level': a continuous measure. */
  kind?: 'level' | 'timing';
  /** Why the measure's continuous-time limit is only indicative: the full harness
   *  (`bun run harness --full`) measured an order of convergence outside [0.5, 2] (a peak or
   *  trough whose month moves with the step, say). The half-step test then reports the limit and
   *  does not gate on it; the full run fails when a measure's order leaves the band undeclared. */
  limitIndicative?: string;
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
  /** Kernel steps per recorded step, N (a whole number, default 1; decision 0011). The engine
   *  applies lever events, records history, takes snapshots and narrates once per dt (a month),
   *  and in between advances the rules and the ledger N times by dt / N, each sub-step a complete,
   *  balanced step with its own accounting checks. Rules see dt / N in c.dt and c.lag(id) is the
   *  last sub-step, so a lag of a month is c.lag(id, N) (the Iceland model's `lastMonth`). What
   *  the month shows (the display contract): variables and stocks at the month's end; legs,
   *  pipes and the ledger as the month's total ÷ dt (its average annual rate); a term as
   *  TermDef.month says; a rule's regime if it held in any sub-step, flagged when it switched. */
  substeps?: number;
  steadyState: SteadyStateSpec;
  calibration?: CalibrationCheck[];
  /** How to migrate scenarios written for the model's old global stabiliser setting (scenario
   *  format 1). Without it, old scenarios load unchanged. */
  legacyStabiliserMode?: LegacyStabiliserMode;
  /** The calendar month that model month 0 is (a dated opening). Without it months are counted
   *  from the start only. */
  calendar?: { month0: CalendarMonth };
  /** How model money is shown in a currency. Model money stays in its unit. */
  moneyUnit?: MoneyUnit;
  /** A dated opening: the economy at month 0, from data, instead of the solved steady state.
   *  createRegisteredEngine (src/models/index.ts) builds it on top of the model's anchor state. */
  opening?: OpeningDef;
  /** Fading start gaps that withStartGaps (opening.ts) added, by group: which rules carry them
   *  and how they fade. Declared metadata for the opening report; the rules themselves carry the
   *  terms. */
  startGaps?: Record<Id, StartGapGroup>;
  /** The trend a variable is at rest on, as log growth a year (default 0: at rest means flat).
   *  An opening (opening.ts) puts the past of a variable it does not give a history on this
   *  trend, so a rule that carries a known trend (a growing model's smoothers) starts with no gap
   *  from it. `p` reads the opening's parameters. */
  restTrend?: (variable: Id, p: (id: Id) => number) => number;
}

/* ------------------------------------------------------------------ openings */

/** A calendar month; month runs 1–12. */
export interface CalendarMonth {
  year: number;
  month: number;
}

/** How model money is shown in a currency. Model money stays in its unit (% of baseline annual
 *  GDP): a flow becomes currency a year, a stock currency, by `perUnit`. */
export interface MoneyUnit {
  /** 'ISK bn' */
  label: string;
  /** Currency units per model unit, e.g. 49.41211 (ISK bn per 1% of 2025 GDP). */
  perUnit: number;
  /** Where the conversion comes from, in plain English. */
  basis: string;
}

/** Where a month-0 value comes from. Positions accept data, residual, mirror or allocated only:
 *  a position is read from a record, closes an identity, is the kernel's fill of its instrument,
 *  or is split by a declared key (named in `note`). */
export interface OpeningSource {
  basis: 'data' | 'residual' | 'mirror' | 'allocated' | 'solved' | 'closed' | 'evaluated' | 'assumed' | 'placeholder';
  /** Observation ids, e.g. 'financial.depositsHH'. */
  records?: Id[];
  /** The data period, e.g. '2026-08-31'. */
  period?: string;
  /** The conversion, the identity a residual closes, or the allocation key. */
  note?: string;
}

/** A position at month 0, in the Ctx.stock sign convention (assets and liabilities both
 *  positive), in model units. */
export interface OpeningStock {
  at: [instrument: Id, player: Id];
  value: number;
  source: OpeningSource;
}

/** A variable the opening holds at month 0. `history` gives earlier months: [month −1, month −2,
 *  …]. A variable read further back than one month needs a history that reaches as far. */
export interface OpeningVar {
  value: number;
  history?: number[];
  source: OpeningSource;
}

/** A parameter the opening sets. `records` lists the observations it comes from, for the
 *  report's list of records used. */
export interface OpeningParam {
  value: number;
  provenance: Provenance;
  records?: Id[];
}

/** A month-0 value the opening must reproduce (gate) or only report (gate false). */
export interface OpeningCheck {
  id: Id;
  label: string;
  records: Id[];
  /** In the unit of `value`. */
  measure: (c: IndicatorCtx) => number;
  value: number;
  tolerance: number;
  gate: boolean;
}

/** A condition the opening solve meets, read from months 0 and 1. */
export interface OpeningTarget {
  id: Id;
  describe: string;
  records: Id[];
  /** The residual's typical size, for the rank and conditioning checks. */
  scale: number;
  residual: (month0: IndicatorCtx, month1: IndicatorCtx) => number;
}

/** A quantity that should move smoothly from month 0 into months 1 and 2: the report's
 *  continuity table. It passes when |measure(1) − measure(0) − trend| and |measure(2) −
 *  measure(1) − trend| are both at most `bound`. */
export interface OpeningContinuity {
  id: Id;
  label: string;
  measure: (c: IndicatorCtx) => number;
  bound: number;
  /** The change a month that is expected anyway (a trend), in the measure's unit. Default 0. */
  trend?: number;
}

/** Month 0 as `derive` sees it: the evaluated values, and the parameters as they stand. */
export interface OpeningCtx extends IndicatorCtx {
  p(id: Id): number;
}

/** What the opening solve may move: a variable the opening holds, or a parameter. A tied
 *  start-gap group is one parameter, 'startGap.<group>'. */
export type OpeningUnknown = { var: Id } | { param: Id };

/** What a model's opening builder returns. */
export interface OpeningState {
  stocks: OpeningStock[];
  /** Exactly one position per financial instrument, which the kernel fills so the instrument
   *  balances (basis 'mirror'). Every other position is listed in `stocks`. */
  fills: Record<Id /* instrument */, Id /* player */>;
  vars: Record<Id, OpeningVar>;
  /** Every parameter the opening sets, with provenance; `derive` may replace the values. */
  params: Record<Id, OpeningParam>;
  /** Overrides of the structural anchor that Ctx.base and IndicatorCtx.base read, by variable.
   *  'month0' is the variable's evaluated month-0 value. Listed in the report. */
  anchors?: Record<Id, number | 'month0'>;
  /** Closed-form values from the evaluated month 0: parameters listed in `params` and variables
   *  listed in `vars`. The kernel repeats evaluate → derive until nothing moves by more than
   *  1e-12 (at most 20 rounds), inside every solve evaluation. */
  derive?: (month0: OpeningCtx) => { params?: Record<Id, number>; vars?: Record<Id, number> };
  solve?: {
    unknowns: OpeningUnknown[];
    targets: OpeningTarget[];
    /** Committed values of the unknowns, keyed by var or param id. Check mode applies them. */
    solution?: Record<Id, number>;
  };
  checks: OpeningCheck[];
  /** Quantities whose month-1 and month-2 changes the report bounds (its `month1` table). */
  continuity?: OpeningContinuity[];
}

/** Read-only view of the anchor state (the solved steady state, or a growing model's mapped
 *  state) that an opening builds on. */
export interface OpeningAnchors {
  param(id: Id): number;
  value(id: Id): number;
  stock(instrument: Id, player: Id): number;
}

/** A dated opening: the economy at month 0, from data. */
export interface OpeningDef {
  /** 'iceland-2026-09-30' */
  id: Id;
  /** 'Iceland on 30 September 2026' */
  label: string;
  /** '2026-09-30' */
  asOf: string;
  /** Plain English, one short paragraph. */
  description: string;
  build(anchors: OpeningAnchors): OpeningState;
  /** Quantities the opening report shows along the run with no lever moved, beside what published
   *  forecasts or surveys say. Reported for comparison only, never a pass condition: the path is
   *  the model's own rules' outcome, not a forecast. */
  path?: OpeningPath;
}

/** One row of the opening report's path table. */
export interface OpeningPathRow {
  id: Id;
  /** With its unit, e.g. 'Key rate, %'. */
  label: string;
  /** The value at a month of the run, in the unit the label names. Here `c.base(id)` is the
   *  variable's value at month 0 of the run (today), and `c.baseStock` the position at month 0. */
  measure: (c: IndicatorCtx) => number;
  /** What a published forecast or survey says, in plain English, with its source. */
  reference?: string;
  /** Decimals shown (default 2). */
  digits?: number;
}

/** The path table: the months shown and its rows. */
export interface OpeningPath {
  months: number[];
  rows: OpeningPathRow[];
  /** One plain-English sentence above the table. */
  note?: string;
}

/** A group of fading start gaps (withStartGaps): one solved size, `startGap.<group>`, shared by
 *  every target rule, fading at `fade` a year. A relative group scales the term by each rule's
 *  month-0 value (`startGapBase.<target>`); an absolute one is in the rule's own unit. */
export interface StartGapGroup {
  targets: Id[];
  fade: number;
  scale: 'relative' | 'absolute';
  label?: string;
  /** The size above which the opening report warns: a share of the rule's value for a relative
   *  group (default 0.25), the rule's unit for an absolute one (default: no guard). */
  bound?: number;
}

/* ------------------------------------------------------------------ runtime */

export interface ScenarioEvent {
  t: number; // the recorded step (month, at dt 1/12) at which it applies, before its first kernel sub-step runs
  lever: Id;
  value: number; // new setting, or size for a one-off
  fire?: boolean; // true for one-offs
}

export interface Scenario {
  modelId: Id;
  events: ScenarioEvent[];
  months: number;
  /** Scenario format version (migrate.ts): 2 since padlocks (decision 0010), 1 before, when one
   *  global setting switched the stabilisers. Absent means the current version, except in a file
   *  or link without a format tag (parseScenario, the share link's `v`), which is version 1. */
  version?: number;
  /** The opening (OpeningDef.id) the scenario was made from. Additive: older readers ignore it,
   *  and the format stays at version 2. */
  opening?: Id;
}

export interface RunResult {
  months: number;
  series(indicatorId: Id): number[]; // per month, in display units; months + 1 entries (index 0 = baseline)
  value(varId: Id, month: number): number;
}

/** A leg's flow this month, for pipes and the ledger view: the month's total ÷ dt, its average
 *  annual rate over the month's sub-steps (the amount variable itself at one sub-step a month). */
export interface LegSnapshot {
  flow: Id;
  from: Id;
  to: Id;
  kind: FlowKind;
  /** The variable that sets the leg's amount at each kernel step (engine.legs() and the
   *  baseline report fill it). */
  amount?: Id;
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
  /** The explanation, with parameter placeholders filled. `source` says where it comes from: a
   *  variable's rule, a flow, an indicator, or (for an exogenous variable) outside the model, set
   *  by the `levers` listed. */
  rule?: { id: Id; what: string; rule: string; source: 'rule' | 'flow' | 'indicator' | 'exogenous'; levers?: Id[] };
  regime?: string | null;
  /** True when the regime changed between the month's sub-steps (ModelDef.substeps): the label
   *  shown held in at least one of them, not in all. */
  regimeSwitched?: boolean;
  /** For rules with gradual adjustment: the desired value the variable is moving toward. */
  desired?: number;
  desiredBaseline?: number;
  /** Term values now vs baseline. Sums to the change in the desired value for additive rules. */
  terms: { id: Id; label: string; value: number; baseline: number; change: number; concept?: Id; inputs: Id[] }[];
  /** True when terms are combined non-additively (e.g. a min), so changes do not simply add. */
  nonAdditive: boolean;
  /** The rule's parameters, and any other parameter its explain texts name, with provenance. */
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
  /** Position-sign diagnostic, separate from the four accounting checks: the first month each
   *  position had the wrong sign since the last reset, oldest first. A holder's asset below
   *  −signTolerance or an issuer's liability below −signTolerance (a real asset has holders
   *  only). `value` is the position in the Ctx.stock sign convention, so it is negative.
   *  Positions exempted by InstrumentDef.mayGoNegative are left out. Never a failure: the
   *  accounting still balances, but the balance sheet is one no real sector could have. */
  signViolations?: SignViolation[];
  /** Tolerance of the sign diagnostic (1e-6 by default). */
  signTolerance?: number;
}

/** One position that went to the wrong sign (CheckReport.signViolations). */
export interface SignViolation {
  instrument: Id;
  player: Id;
  /** 'holder' (an asset below zero) or 'issuer' (a liability below zero). */
  role: 'holder' | 'issuer';
  /** First month the position was beyond the tolerance. */
  t: number;
  /** The position that month, Ctx.stock sign convention (negative). */
  value: number;
}

/** A feed message (Engine.feed()). `message` is the finished English sentence; the other
 *  fields let an interface build it in another language. */
export interface FeedEntry {
  t: number;
  message: string;
  indicator: Id;
  concept?: Id;
  /** A threshold message: the FeedRule's id. */
  rule?: Id;
  /** A stabiliser message: the stabiliser's id (it is locked and started calling for action). */
  stabiliser?: Id;
  /** Stabiliser messages: +1 when the rule would raise the lever (its `raise` text), −1 lower. */
  dir?: 1 | -1;
  /** Stabiliser messages: the suggestion ({value}) and the size of the gap ({change}), in the
   *  lever's units, rounded to two decimals exactly as the message shows them. */
  value?: number;
  change?: number;
}

export interface Engine {
  readonly model: CompiledModel;
  readonly t: number; // months since start
  reset(): void;
  step(n?: number): void;
  /** Set a lever from this month on. Padlocks (decision 0010): setting a lever whose padlock is
   *  open closes it, so the lever holds the new value; closing a padlock (setting it to 1) freezes
   *  its lever at the value in force; opening it (0) hands the lever back to its rule. */
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
  /** Reporting levels from recorded months; callbacks never alter economic state. */
  levelAt(id: Id, month: number, basis?: IndicatorBasis): number;
  levels(id: Id, basis?: IndicatorBasis): number[];
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
   *  (a group end stands for all its players). Between nested nodes, a pipe scope excludes
   *  legs with both ends inside the inner node (its own pipe), as pipeBetween does. An
   *  unprefixed id is looked up as a variable, flow, player or group, then indicator; prefix it
   *  with 'var:', 'flow:', 'indicator:', 'player:' or 'group:' when kinds share an id. */
  ideasAtPlay(scope?: Id): { concept: Id; weight: number; via: Id[] }[];
  checks(): CheckReport;
  /** Narration: feed rules crossing their thresholds (marked with the rule's id), and locked
   *  stabilisers that start calling for action (marked with the stabiliser's id, the direction
   *  and the numbers in the message). */
  feed(): FeedEntry[];
  /** Every declared stabiliser now, in declaration order: whether it is locked, what it suggests,
   *  the value in force, and whether it calls for action (locked, gap above its threshold). */
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
  /** The declared levers, then one padlock (kind 'lock') per stabiliser, in stabiliser order. */
  levers: LeverDef[];
  indicators: IndicatorDef[];
  concepts: ConceptDef[];
  feed: FeedRule[];
  /** Declared stabilisers of every module, in module order. */
  stabilisers: StabiliserDef[];
  /** Evaluation schedule: ordered blocks; a block with >1 rule is solved simultaneously. */
  schedule: { rules: Id[]; simultaneous: boolean }[];
  ruleFor(varId: Id): RuleDef | undefined;
  warnings: string[];
}
