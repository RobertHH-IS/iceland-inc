# Authoring guide

This guide shows how to write a model for Iceland Inc., using the small **Reference economy** in `src/models/reference/` as the example. Read [architecture.md](architecture.md) first for the ideas; this page is about the code. The model language is in [src/core/types.ts](../src/core/types.ts), and the kernel's behaviour where the types are silent is recorded in [decisions/0001](decisions/0001-kernel-contract-changes.md).

## 1. A model is a list of modules

```ts
// src/models/reference/index.ts
export const referenceModel: ModelDef = {
  id: 'reference',
  label: 'Reference economy',
  description: '…',
  modules: [structure, labourPrices, demand, banking, centralBank, government, indicators],
  paymentSystem: { bank: 'B', centralBank: 'CB', treasury: 'G', deposits: 'deposits', reserves: 'reserves', treasuryAccount: 'treasuryAccount' },
  dt: 1 / 12,
  steadyState: { … },
  calibration,
  legacyStabiliserMode: { … }, // how to read scenarios written before padlocks (section 7)
};
```

Each module (`ModuleDef`) bundles players, instruments, variables, parameters, rules, flows, levers, indicators, concepts, feed rules and tests. Modules can use each other's ids; list what a module relies on in `requires`. Register a model by adding it to `models` in `src/models/index.ts`, which also attaches the shared concept library as a module named `concepts`.

| File | Module | What it holds |
|---|---|---|
| `structure.ts` | `structure` | 5 players, 6 instruments |
| `labour-prices.ts` | `labour-and-prices` | jobs, wages, prices, expectations; wage-settlement lever |
| `demand.ts` | `demand` | disposable income, consumption, investment, GDP |
| `banking.ts` | `banking-and-credit` | loans, repayments, interest, dividends; lending-appetite lever |
| `central-bank.ts` | `central-bank` | Taylor rule (a stabiliser), reserves, open-market operations; the key-rate lever |
| `government.ts` | `government` | spending, the debt rule (a stabiliser), taxes, deficit, bonds; spending and tax levers |
| `indicators.ts` | `indicators` | 8 charts and the narration feed |
| `calibration.ts` | (model level) | 6 calibration checks |
| `expectations.ts` | (lever report) | what theory predicts for each lever (section 12) |

**Units.** Money flows are % of baseline annual GDP at annual rates (unit `'% of GDP/yr'`), money stocks % of baseline GDP (`'% of GDP'`), rates are fractions per year (`'fraction/yr'`), prices are indices (`'index'`). Baseline GDP is 100.

## 2. Players

```ts
{
  id: 'B',
  label: 'Bank',
  group: 'Banks',
  color: '#009E73',
  description: 'All banks as one. It keeps everyone’s deposits, lends to firms and holds government bonds.',
  settlement: 'bank',
  layout: { x: 0.48, y: 0.82 },
}
```

`settlement` says how a player pays; the kernel's payment system does the rest:

| Settlement | Who | Pays with |
|---|---|---|
| `deposits` | households, firms, pension funds, rest of world | its bank deposit |
| `bank` | the (one, consolidated) bank | new deposits to depositors; reserves to the state |
| `treasury` | the government | its account at the central bank |
| `central-bank` | the central bank | new reserves or treasury-account balances |

That is why the model never computes money: a bank paying a depositor creates a deposit, a depositor paying the bank destroys one, and payments between the private sector and the state move reserves. `group` draws players together on the map; `layout` places them (0..1, x right, y down).

## 3. Instruments

```ts
{
  id: 'loans',
  label: 'Business loans',
  kind: 'financial',
  issuers: ['F'],   // whose liability it is
  holders: ['B'],   // who may hold it as an asset
  valuation: 'nominal',
  description: 'What firms owe the bank. Each new loan creates a deposit; each repayment destroys one.',
  concepts: ['endogenous-money', 'money-destruction'],
}
```

Financial instruments have issuers and holders and always sum to zero. Real assets (`kind: 'real'`, `issuers: []`) such as `capital` are held without a counterpart. A player cannot hold and issue the same instrument. **Stocks change only through flow postings**; nothing writes a position directly.

## 4. Flows, legs and postings

A flow is a transaction type. Each leg (payer → payee) has its **own amount variable**, set by its own rule:

```ts
{
  id: 'newLoans',
  label: 'New loans',
  kind: 'cash',
  account: 'financial',
  posting: { type: 'issue', instrument: 'loans' },
  legs: [{ from: 'B', to: 'F', amount: 'newLoans' }],
  concepts: ['endogenous-money'],
  explain: { what: 'The bank lends to firms by crediting their deposit accounts: new money is created.' },
}
```

| Posting | `from` | `to` | Kind | Account |
|---|---|---|---|---|
| `transfer` | payer | payee | cash | current / capital |
| `purchase` (real asset) | buyer | seller | cash | capital |
| `issue` | lender (gains the claim) | borrower | cash | financial |
| `redeem` | borrower (pays) | lender | cash | financial |
| `trade` | buyer | seller | cash | financial |
| `accrue` | debtor (owes more) | creditor | accrual | current |
| `revalue` / `writeoff` | side that loses | side that gains | revaluation / writeoff | other |

A `revalue` between two holders of the same instrument is a reclassification: value moves from `from` to `to` with no cash and no income, as when retirement moves pension rights from working-age members to pensioners in the Iceland model. A real asset has no issuer, so its `revalue` / `writeoff` is otherwise one-sided with `from = to` = the holder, as in depreciation:

```ts
{ id: 'depreciation', kind: 'writeoff', account: 'other', posting: { type: 'writeoff', instrument: 'capital' },
  legs: [{ from: 'F', to: 'F', amount: 'depreciation' }], … }
```

A flow may have several legs (`depositInterest` pays households and firms, each with its own amount). The same `issue` creates money when the lender is the bank and moves existing deposits when the lender pays with deposits.

## 5. Variables and rules

Every variable has a unit and a kind; variables with a `kind` other than `'exogenous'` need **exactly one rule**. A rule declares everything it reads, is labelled with a category, and explains itself in plain English:

```ts
{
  id: 'consumption',
  target: 'consumption',
  category: 'BEHAVIOUR',
  label: 'Consumption function',
  inputs: ['disposableIncome', 'depositRate', 'expectedInflation'], // same-month values
  stocks: [['deposits', 'HH']],                                      // end of last month
  params: ['propensityFromIncome', 'inflationAwareness', 'propensityFromWealth', 'savingIncentive', 'neutralRate', 'depositSpread'],
  adjust: { speed: 'consumptionSpeed' },                             // partial adjustment
  terms: [
    { id: 'income', label: 'Spending out of income', concept: 'consumption-function',
      compute: (c) => c.p('propensityFromIncome') * c.v('disposableIncome') },
    { id: 'inflationLoss', label: 'Inflation eats savings', concept: 'haig-simons-income',
      compute: (c) => -c.p('inflationAwareness') * c.v('expectedInflation') * c.stock('deposits', 'HH') },
    { id: 'wealth', label: 'Spending out of savings', concept: 'stock-flow-consistency',
      compute: (c) => c.p('propensityFromWealth') * c.stock('deposits', 'HH') },
    { id: 'realRate', label: 'Reward for saving', concept: 'interest-rate-channel',
      compute: (c) => -c.p('savingIncentive') * 100 * (c.v('depositRate') - c.v('expectedInflation') - (c.p('neutralRate') - c.p('depositSpread'))) },
  ],
  concepts: ['consumption-function', 'paradox-of-thrift', 'multiplier'],
  explain: { what: 'What households spend …', rule: 'Households aim to spend {propensityFromIncome} of their income … at speed {consumptionSpeed} a year. …' },
}
```

- **Categories:** `IDENTITY` (accounting), `CONTRACT` (institutional rule), `BEHAVIOUR` (an assumption), `POLICY` (an authority's decision rule).
- **Declarations:** `c.v(id)` needs `inputs`, `c.lag(id, k)` needs `lagInputs`, `c.p(id)` needs `params`, `c.stock(ins, player)` needs `stocks`, `c.lever(id)` needs `levers`, `c.locked(stabiliser)` needs `locks`. The compiler dry-runs every rule, so an undeclared read is a compile error, and in dev mode the engine also throws on one at run time.
- **Terms:** the desired value is the sum of the terms, so the inspector can show exactly which term moved. Write rules as terms whenever they add up.
- **Adjust:** with `adjust`, value = the previous step's value + speed × dt × (desired − the previous step's value). Speeds are per year. The target's own lag is read automatically. With `adjust: { speed, form: 'exponential' }` the share closed each step is 1 − e^(−speed × dt) instead: the exact first-order lag, which never overshoots and changes less when the step is halved (the Iceland model uses it throughout, as engine v1 did).
- **Explain:** `{paramId}`, `{paramId%}` and `{paramId pp}` in `explain.rule` are filled with live parameter values.
- **Lags:** `c.lag(id)` is the previous kernel step, which is last month only at one step a month; for "a year ago" write `c.lag(id, Math.round(1 / c.dt))`, and for "last month" `c.lag(id, Math.round(1 / (12 * c.dt)))` (the Iceland model's `lastMonth`), so the rule means the same whatever the step. A state's own previous value and an accounting change over the step (indexation, a revaluation) are the previous step; news people react to is last month's.
- **Steps a month:** `ModelDef.substeps` takes each month in N kernel steps (the Iceland model takes 2, [decision 0011](decisions/0011-sub-steps.md)); rules see dt ÷ N in `c.dt`, so write every rule in `c.dt` and speeds per year, and it runs at any N. A month shows variables and stocks at its end and legs as its total ÷ dt. A term that is a change per step (a month's growth, one step toward a target) sets `month: 'sum'`, and the term that carries the level in (last month's wage) `month: 'first'`, so the inspector shows "this month" whatever N is and the two add up to the month-end value; other terms show the month's last step. A rule that must say what happens over a whole month (what a locked rule shows it would do in its first month in charge) uses the month itself, not `c.dt`.

When a rule is **not** additive, set `combine` and name the branch with `regime`. The Taylor rule cannot set a negative key rate:

```ts
terms: [ neutral, inflation, outputGap, addOn ],
combine: (t) => Math.max(0, t.neutral + t.inflation + t.outputGap + t.addOn),
regime: (_c, _v, t) => (t.neutral + t.inflation + t.outputGap + t.addOn < 0 ? 'Zero lower bound binds' : null),
```

The inspector then shows each term's value, the active regime and `nonAdditive: true`, not a sum. The wage Phillips curve does the same with a floor on wage cuts ("Wages sticky downwards").

**Same-month loops are fine.** Consumption depends on income, which depends on wages, which depend on output, which depends on consumption. The compiler finds the loop and solves it each month as a simultaneous block (Gauss–Seidel, with Newton as a fallback). Reading a variable with `lag()` breaks a loop, which is often the more honest model anyway: the reference economy's wage growth reacts to last month's unemployment.

## 6. Parameters and provenance

```ts
{ id: 'taylorInflation', value: 1.5, unit: 'fraction', category: 'POLICY',
  description: 'Points of key rate per point of inflation above target. …',
  provenance: { basis: 'assumed', note: 'Teaching value, chosen to give readable dynamics.' } }
```

Every parameter says where it comes from: `data` (with `source` and `vintage`), `calibrated`, `derived`, `assumed` or `placeholder`. Parameters solved by the baseline (section 10) are `calibrated`.

## 7. Levers

A lever is a setting or a one-off with a precise `definition`: level or growth, persistent or one-off, and what happens when it ends.

**A setting bound to a parameter.** `add` adds the lever's value to the parameter; `scale` converts user units to model units:

```ts
{
  id: 'taxRate', label: 'Income-tax rate', group: 'Policy', section: 'Government',
  kind: 'setting', unit: 'pp', default: 0, min: -1, max: 3, step: 0.5,
  binds: { param: 'taxShift', mode: 'add', scale: 0.01 },
  description: 'The tax rate on household income, in points above (or below) its normal rate. Unlocked (the default), the debt rule sets it …',
  definition: 'Level shift in the income-tax rate, in percentage points above (or below) its normal rate. …',
}
```

**A setting read by a rule.** The key-rate lever binds nothing; the key-rate rule declares `levers: ['keyRate']` and reads `c.lever('keyRate') / 100`, but only while the lever is locked (below).

### Policy reactions are stabilisers, and their levers have padlocks

A POLICY setting never changes unless the user changes it, or a declared rule moves it while its padlock is open. A rule that reacts to the economy by moving a policy setting (a Taylor rule, a debt rule) is a *stabiliser*: declare it, and the compiler gives its lever a padlock ([decisions 0004 and 0010](decisions/0010-policy-padlocks.md)). Unlocked (the default), the rule sets the policy; locked, the lever holds and the rule only suggests. Closing the padlock freezes the lever at the value in force; setting the lever while it is unlocked closes the padlock at the new value; opening it hands the lever back to the rule. Levers without a rule have no padlock.

1. **The padlock.** Nothing to write: the compiler adds a lever of kind `lock`, `<lever>Lock` (`keyRateLock`, `taxRateLock`), 0 open and 1 closed, with plain-English texts. A rule reads it with `c.locked(stabiliserId)` and declares the stabiliser in `locks`.
2. **The shadow value.** Compute what the rule would do every month, locked or not. The reference's Taylor rule has a target of its own, `ruleTarget`, and a smoothed rate, `ruleRate`, which the key rate uses only while unlocked:

```ts
{ id: 'keyRate', target: 'keyRate', category: 'POLICY', inputs: ['ruleRate'], levers: ['keyRate'], locks: [TAYLOR_RULE],
  terms: [
    { id: 'rule', label: 'The Taylor rule (unlocked)', compute: (c) => (c.locked(TAYLOR_RULE) ? 0 : c.v('ruleRate')) },
    { id: 'held', label: 'The rate you hold (locked)', compute: (c) => (c.locked(TAYLOR_RULE) ? c.lever('keyRate') / 100 : 0) },
  ],
  … }
```

   Let the rule step from the value actually in force, not from its own shadow: `adjust` always anchors on the variable's last value, which while locked is a path the rule was never in charge of, so unlocking would jump onto it. Both models keep the rate in force as a variable of its own (`ruleAnchor`: the rule's own rate while unlocked, the held key rate while locked) and step from it (decisions 0007 and 0010). In a model that takes several steps a month (decision 0011), write the step as its own term: taken at every kernel step and shown summed over the month while unlocked (`month: 'sum'`), and a whole month's step at once while locked, so the value shown on a locked lever is where the rule would stand after its first month in charge, whatever the step (the Iceland model's `ruleStep`).
3. **The suggestion,** a variable in the lever's own units, so it can be compared with the lever and "Apply" can set it: `keyRateSuggestion = 100 × ruleTarget` (%), where the rule is heading, so the lever calls as soon as the rule would lean one way. For a rule that adds to a lever (a tax shift), suggest the whole shift the rule would set, not the rule's addition on top of the user's setting: otherwise each "Apply" would ratchet.
4. **The value in force,** `current`, in the lever's units: what closing the padlock freezes the lever at, and what the lever shows while unlocked. At the baseline it must equal the lever's default.
5. **The declaration,** in the module with the rules:

```ts
stabilisers: [{
  id: TAYLOR_RULE, label: 'Taylor rule',
  lever: 'keyRate',               // the POLICY lever it moves while unlocked
  suggestion: 'keyRateSuggestion',
  current: (c) => 100 * c.v('keyRate'),  // the value in force, in the lever's units
  shadow: ['ruleRate', 'ruleAnchor', 'ruleTarget'],  // variables that only feed the suggestion while locked
  threshold: 0.125,               // lever units; half the lever's step calls exactly when Apply would move it
  description: 'The central bank’s Taylor rule: …',
  feed: { raise: 'The Taylor rule would raise the key rate to {value}%', lower: 'The Taylor rule would cut the key rate to {value}%', indicator: 'keyRate' },
}],
```

`engine.stabilisers()` then reports each one: `lock`, `locked`, `suggested`, `current`, `gap` and `calling` (locked and the gap above the threshold). The interface draws a padlock beside the lever and shows the live value while unlocked. While it is locked the interface shows only the padlock and the held value: no suggestion, no red mark and no "Apply" button, and it leaves the engine's narration of a call out of the feed (decision 0010, amended 2 October 2026). List the shadow variables in `shadow`: while the stabiliser is locked they drive nothing, so ideas at play leaves them out (the suggestion is always left out, because it restates the rule in lever units), unless a rule that still acts reads them; the compiler checks that no other rule reads them when every stabiliser is locked. Keep the baseline identical locked or not: at the steady state the rule must suggest exactly what the lever's default gives. Where holding this lever while another rule acts does something a student would not expect, say so in `lockedAloneNote`, one calm sentence the lever's info panel adds while this stabiliser is locked and another is unlocked; it shows nowhere else (Iceland's income tax held while the central bank's rule acts leaves debt to take the strain and can run away over decades; its key rate held while the debt rule acts makes the debt rule steady the economy in the central bank's place; decisions 0015 and 0016).

**Old scenarios.** A model that had the old global Manual / Automatic setting describes it in `ModelDef.legacyStabiliserMode` (its lever and default, the held levels by their new ids, the offsets), and `migrateScenario` rewrites a version-1 scenario to padlocks (decision 0010). Set `takeoverChanged` when unlocking no longer does what the old switch to Automatic did (the reference economy's rules now step from the held value), so that a migrated switch after a hold carries a notice.

**A one-off.** `fire` may change only non-stock state, through the restricted `ShockApi`. Here it lifts last month's wage rate, so the jump is felt this month:

```ts
fire: (s, size) => s.setLagged('wage', s.get('wage') * (1 + size / 100)),
```

The kernel rejects any attempt to write an instrument position, and a shock to a variable nobody reads with `lag()`.

Pick lever ranges the model handles: the harness's property tests pull random combinations anywhere within them.

**Fewer levers in the panel.** The lever panel groups levers by `section` (falling back to `group`), in the order the model declares them, so declare each section's most important lever first. A model with many levers can keep its less central ones off the panel with `shown: false` ([decision 0017](decisions/0017-levers-shown.md); Iceland hides seven of its 25, such as the loan-to-value cap and the migration buffer):

```ts
{ id: 'ltvCap', label: 'Loan-to-value cap', group: 'Policy', section: 'Financial stability', shown: false, … }
```

A hidden lever is still a lever. Scenarios, share links, calibration, the harness and the lever report use it as before, so it needs a definition and expectations like any other. The panel shows it in its own place while it is off its default or the scenario has an event for it, so a lever a link sets never acts unseen. The compiler rejects a hidden lever with a padlock (hiding it would hide the rule's suggestions) and a section whose levers are all hidden: hide levers to trim a section, never to remove one.

## 8. Indicators and the feed

Indicators are the charts. `compute` returns the level; `display` turns it into a deviation from baseline:

```ts
{
  id: 'broadMoney', label: 'Broad money', group: 'Money and credit',
  unit: '% vs baseline', display: 'deviation-pct',
  compute: (c) => c.stock('deposits', 'HH') + c.stock('deposits', 'F'),
  description: 'Deposits of households and firms. No formula sets it: …',
  drivers: ['newLoans', 'loanRepayments', 'bondIssue'],
  concepts: ['endogenous-money', 'money-destruction', 'double-entry'],
}
```

`deviation-pct` is (level ÷ baseline − 1) × 100; `deviation-pp` is (level − baseline) × 100 for levels held as fractions (rates); `deviation` is level − baseline for levels already in display units (% of GDP). Feed rules narrate threshold crossings of an indicator's displayed value; they never change the model:

```ts
{ id: 'rateUp', indicator: 'keyRate', above: 0.25, message: 'The central bank raises its key rate', concept: 'taylor-rule' }
```

## 9. Concepts

Tag rules, terms, flows, instruments, levers, indicators and feed rules with concept ids from the shared library (`src/concepts/library.ts`), such as `endogenous-money`, `markup-pricing`, `taylor-rule` or `credit-impulse`. Tag the **term** that expresses an idea whenever you can: `ideasAtPlay()` weights each concept by how much the terms tagged with it have moved their rule from baseline, so the ideas at play shift as a shock travels. In a rule with `combine`, a term counts by its one-at-a-time effect on the rule's value (a factor of a product at the product's level; a cap that does not bind not at all), so tag the factor that carries the idea. An id that no module defines is a compile warning. To add a new idea, add a `ConceptDef` to the library (or to a module's `concepts`).

## 10. The steady-state baseline

The baseline is solved, not assumed:

```ts
steadyState: {
  free: ['govSpendingReal', 'normalTaxRate'],
  targets: [
    { id: 'gdp-is-100', describe: 'Nominal GDP is 100: the unit of the model', residual: (c) => c.v('gdp') - 100 },
    { id: 'debt-is-55', describe: 'Government debt is 55% of GDP', residual: (c) => c.stock('bonds', 'G') - 55 },
  ],
  initialStocks: [['deposits', 'HH', 83], ['deposits', 'F', 12], ['reserves', 'B', 9.5], ['treasuryAccount', 'G', 2],
                  ['loans', 'B', 48], ['bonds', 'B', 43], ['bonds', 'CB', 12], ['capital', 'F', 250]],
  initialVars: { consumption: 69, disposableIncome: 69, firmProfit: 16 },
},
```

The solver finds the free parameters, every stock and every variable with a past (read with `lag()` or adjusted) such that nothing changes from one month to the next and the targets hold. The numbers above are only starting guesses. Stocks use the `Ctx.stock` sign convention (liabilities are positive too), and a single issuer can be left out: the bank's deposit liability, the firms' loans and the government's bonds are filled in so each instrument balances. A module may also give a closed-form `solve(params)`, which the kernel uses before polishing with Newton.

Two things make a baseline well posed:

- **Something must pin every stock.** In the reference economy households spend a share of their deposits (pinning deposits), firms and the bank pay out cash and capital above targets, the central bank keeps reserves at a share of deposits, and loans are repaid over a fixed term.
- **Gaps that must be zero at the baseline should be measured against parameters**, such as `potentialOutput`. `c.base(id)` returns the current guess while solving, so a gap against `base()` is zero by construction. The debt rule uses `base('debtRatio')` on purpose: it only leans against debt drifting away from wherever the baseline puts it.

`engine.baselineReport()` publishes the result, and the harness writes it into its report as a balance-sheet matrix, a transactions-flow matrix and a table of every variable.

## 11. Calibration checks and module tests

Published whole-model responses are **checks**, never equations:

```ts
{
  id: 'rate-hike-output',
  label: 'Key rate locked 1 pp above neutral for 2 years, then unlocked: output trough, % vs baseline',
  scenario: [{ t: 0, lever: 'keyRate', value: 4 }, { t: 24, lever: 'keyRateLock', value: 0 }],
  months: 60,
  measure: (run) => Math.min(...run.series('output')),
  range: [-3, -0.05],
  source: 'teaching model: qualitative sign/size check',
}
```

Module tests check a module's own arithmetic on a fresh engine at the baseline:

```ts
{
  id: 'repayment-arithmetic',
  label: 'Repayments = loans outstanding ÷ loan term',
  run: (e) => {
    const term = e.influences('loanRepayments').params.find((p) => p.id === 'loanTerm')!.value;
    const loans = e.balanceSheet('F').liabilities.find((l) => l.instrument === 'loans')!.value;
    const got = e.value('loanRepayments');
    return { pass: Math.abs(got - loans / term) < 1e-9, detail: `repayments ${got} vs ${loans / term}` };
  },
}
```

`bun test` runs every module test and calibration check; `bun run harness` runs them too, with the accounting, drift and robustness layers, and writes `reports/harness-<model>.md`. Its half-step test reruns every check at twice the kernel steps a month and asks whether the answer as the step goes to zero lies in the check's range; `bun run harness --full` (which CI runs) adds a run at four times the steps to measure each measure's order of convergence. A measure whose order is outside 0.5–2 (a peak that does not move with the step, rounding error) must say why in `limitIndicative`; its limit is then reported, not gated ([decision 0011](decisions/0011-sub-steps.md)).

## 12. Vetting levers

The harness proves that the accounting holds and that the calibration checks pass. It does not tell you whether a lever does what economics says it should. `bun run levers` is for that question: it moves every lever hard, one at a time, and writes a report that a person or an agent can read lever by lever.

```bash
bun run levers                           # every model, 240 months
bun run levers --model iceland           # one model
bun run levers --months 120              # another horizon: writes <model>-120m.md and .json (git-ignored)
bun run levers --paths reports/levers/paths   # also the full monthly paths (large, git-ignored)
```

It writes `reports/levers/<model>.md` for reading and `reports/levers/<model>.json` for tools, and prints how long it took: about 0.1 s for the reference economy and about 40 s for Iceland, most of it the implied-neutral scans. The output depends on nothing but the model, so a rerun changes the files only when behaviour changes. Treat the diff like a golden scenario: when you change a model on purpose, regenerate the report, read what moved, and commit it with the change.

**What it runs.** A setting runs at its min, its max and a moderate step each way from its default (a quarter of the distance to each bound, snapped to the lever's step). A one-off fires at its min, its max, its default size and half of it, and at those two with the opposite sign where the range allows. A choice runs every option other than the default, which is the no-change run. Each value is applied before month 1 and held; a one-off fires once. Each runs in every lock configuration: `unlocked` (every rule acts, the default), `locked` (every padlock closed at month 0) and any a model adds in `lever-headlines.ts` (Iceland adds `key rate locked`: the key rate held, the debt rule acting). Moving a policy lever locks it, so its own runs hold it in every configuration; where that leaves two configurations the same (the key rate's runs in `key rate locked` and `unlocked`), the run is made once, shown in the later one as the same run, and its flags are counted once. The padlocks are not run as levers: they set up the configurations. A lever that can only act on top of another shock (a migration buffer needs job changes to buffer; the choice of bond buyer needs bonds to be sold) declares a **companion shock** in `src/harness/lever-headlines.ts`: it is run again with the companion, and those runs are measured against the run with the companion alone.

**What it measures.** Every effect is the run minus the **no-change run in the same lock configuration**: the same engine and padlocks with no lever event, compared month by month. It is never measured from month 0, so drift, the padlocks and anything else the two runs share cancel out. Effects are in the variable's display unit, and the report's legend defines each unit it uses (`UNIT_MEANINGS`): **%** is the percent difference from the no-change level; **pp** a difference in percentage points of a rate or share; **pp of GDP** a difference in a ratio to nominal GDP (this month's, or the past 12 months'), which does not grow with prices; **pp of baseline GDP** a difference in a nominal amount measured in % of baseline GDP, which does. A headline or indicator whose unit is not defined stops the report, so a new unit gets a definition before anyone reads it; where a model's own unit is ambiguous, `indicatorUnits` in `lever-headlines.ts` restates it and the report says why. For every indicator and every headline variable the report records the effect at months 1, 3, 6, 12, 24, 36, 60, 120 and 240, the peak and its month, and the long-run value (the mean over the final 12 months).

**Headline variables** are declared per model in `src/harness/lever-headlines.ts`: an indicator, or a level computed from variables (real consumption is nominal consumption ÷ the price level). Mark as `gradual` the ones that should adjust over months (output, jobs, spending, stocks of debt and money), and as `policy` the instruments that stabilisers move. The same file lists the policy instruments that must hold still while they are held (their padlock closed, or always for one without a rule), each with the levers allowed to move it and its padlock, any companion shocks, and any extra lock configurations. A new model needs an entry there; the tests check that every id exists.

**Flags.** Each run lists its flags, one bullet per kind, and the summary table counts them by lever. The report states every threshold (`LEVER_THRESHOLDS` in `src/harness/lever-report.ts`).

| Flag | What it usually means |
|---|---|
| Non-finite, Residual, Sign, Implausible | The run is broken: a NaN, an accounting leak, an overdrawn position or an impossible value. Fix the model before reading anything else |
| Extreme | A headline level moved by more than 50% of its no-change value, or a rate or ratio by more than 25 pp. No routine policy change does that within 20 years; it is usually a runaway nominal path (the price level, the króna, money) that the long Unsettled list would otherwise hide |
| Policy moved | A held policy instrument (its padlock closed, or one without a rule) moved although its own lever did not: a rule reacts where only an unlocked stabiliser may ([decisions 0004 and 0010](decisions/0010-policy-padlocks.md)) |
| Month-1 jump | A variable that should build up gradually does most of its moving in the first month. Sometimes it is accounting (public spending is output at once); often a missing adjustment speed |
| Sawtooth | The path zigzags from one month to the next. Economies do not; a floor or cap switching on and off, or an overshooting adjustment, does |
| Flicker | A rule's regime label changes many times within five years: the floor or cap behind a sawtooth, named |
| Unsettled, Explosive | Still moving after 20 years, or growing without bound. A permanent change in inflation moves the price level for ever, which is right; a debt ratio or exchange rate that runs away usually is not |
| Asymmetry | The moderate up and down steps give responses of different size or direction per unit of lever. Caps and floors that bind one way cause it; check that the one that binds is meant to |
| Lock sign | The runs with every policy lever locked and every one unlocked move a headline in opposite directions at month 12. Often right (the Taylor rule turns an inflationary boom into a slowdown), but each one deserves a sentence of explanation |
| Inert | No run moves anything. The lever either needs another shock to act on (declare a companion) or is not wired to anything |
| Regimes | Informational: every rule whose regime differs from the no-change run, with the months. It tells you which floor, cap or limit drives the result |

The Regimes and Flicker flags see only rules with a regime label. A rule that combines its terms with a min, a max or a cap but has no label can bind unseen, so the report lists every such rule under *Kinks not traced*; give it a regime label (section 5) and the report will show it.

**Implied neutral rates.** A model whose policy rule learns its neutral rate within a band can declare `impliedNeutral` in `lever-headlines.ts` (Iceland does). For every run with every rule acting whose estimate ends at the edge of its band, the report then holds the key-rate lever on top of the run's lever, scans the lever's range every `IMPLIED_NEUTRAL_GRID` (0.5) points, and bisects to 0.01 points inside the bracket where inflation over the final five years crosses target nearest the rule's estimate. It lists that rate, less the inflation target, beside the band, with which way inflation moves with the rate there and how many crossings the range has: inflation need not fall as a held rate rises, so the ends of the range alone cannot say that no rate works. The other rules keep acting, so the optional `tax` indicator reports the fiscal rule's instrument at the final month, held at that rate and in the run itself. Holding the key rate locks it, so a rule that changes form while the key rate is locked would change the answer; the optional `hold` sets parameters for the scan's runs that keep such rules in their usual form (Iceland: `heldRateFiscal: 0`, decision 0016). It shows how much of a gap left after 20 years is the band's, and how far outside it the rate the economy needs lies ([decision 0012](decisions/0012-labour-market-gap.md)). The harness gate does not run it.

**How to vet a lever.** Read its definition first, then for each run ask, in order:

1. *Is the run healthy?* No flags from the first row of the table above.
2. *Is the sign right?* Name the theory that predicts it: a higher key rate cools demand and strengthens the currency (uncovered interest parity), a tax cut raises disposable income, a higher foreign rate weakens the króna. Where the locked and unlocked runs differ, say which stabiliser explains it.
3. *Is the timing right?* Prices and wages move first where contracts or pass-through say so; output, jobs and credit build up over quarters. Check the month-1 column and the peak month.
4. *Is the size plausible?* Compare with the calibration checks and with published estimates; per unit of lever, the moderate steps should be about the same size as the extremes unless a regime binds.
5. *Does it settle?* After a persistent setting, ratios should reach a new level; after a one-off, most effects should fade.
6. *What drives it?* The regimes list names the binding floors and caps; the interface's inspector shows the terms behind any variable in any month.

**Expectations.** Every model declares what theory predicts in `src/models/<id>/expectations.ts`, and the report marks each one ✓ or ✗ (and counts them in the summary). They are a regression gate: the harness's robustness layer runs them all and fails when one does not hold, when a lever other than the padlocks has none, or when a run it makes is broken; `bun run levers` exits with code 1 on the same failures, after writing its reports. An expectation is a sign that any sound model should show, backed by a theory and a source, over a span of months the model can resolve:

```ts
import type { LeverExpectation } from '../../harness/lever-report.ts';

export const expectations: LeverExpectation[] = [
  {
    lever: 'foreignRate', setting: 'max', mode: 'any', variable: 'krona', fromMonth: 6, toMonth: 60, sign: -1,
    theory: 'Uncovered interest parity: a higher foreign rate makes króna assets less attractive, so the króna weakens.',
    source: 'Dornbusch (1976)',
  },
];
```

`setting` is a lever value or a role (`min`, `max`, `up`, `down`, `default`, `half`, `-default`, `-half`); `mode` is a lock configuration (`unlocked`, `locked`, or one the model adds) or `any`; `variable` is a headline or an indicator id; `sign` is +1, −1 or 0 for the mean effect over the months (0: smaller than the report's floor of 0.01). Where theory predicts that an effect dies out, but the model's path is a slow cycle whose late mean can cross the floor on an upswing, write `sign: 0` with `decays: { earlier: [from, to], below, share }`: the largest move over the months named must be below `below` and below `share` × the largest over the earlier window (Iceland's tourism −15 inflation, decision 0012). Set `withCompanion: true` to check the runs on top of the lever's companion shock instead. An expectation that matches no run fails, so a renamed lever cannot pass silently, and one that names a lever the model does not have stops the report. A padlock is not run as a lever; an expectation on one (`setting` 1 to close it or 0 to open it, `mode` the configuration it starts from) is checked by closing or opening it at month 0 with no shock, against that configuration's no-change run.

How to write them:

- **Every lever needs some.** Cover what the lever is for (its main channel, with the timing theory gives), the policy reaction where a rule acts (unlocked), and anything the model must not do (a policy instrument that must hold still while locked: sign 0).
- **Name a theory and a source** a reader can look up, in plain English. A sign without a reason is only a snapshot of today's model.
- **Choose windows the model can resolve.** A sign over months 1–3 of a variable that builds up over quarters, or a 0 over twenty years where the model is known to leave a small gap, is too strong for a simplified model; say so rather than write it.
- **With every policy lever locked, gate signs over months the model can defend, not levels.** The price level then has no nominal anchor by construction, and the model's long run has no level to test against ([decision 0014](decisions/0014-locked-economy.md)); put magnitudes, such as the month a held key rate reverses its effect, in tripwire tests with their reasons.
- **Do not weaken an expectation to make it pass.** When one fails, decide whether the model or the expectation is wrong. Fix a small, safe model error with a test. A larger one stays out of the file and goes to the open problems in [the lever-vetting record](audit/lever-vetting.md), with the numbers; an expectation that is wrong or too strong is dropped there with the reason.

**A clean lever report** is what a lever change must leave behind: every expectation ✓, no run with a Non-finite, Residual, Sign or Implausible flag, and every other flag the change adds explained (in the lever's definition, a decision record or the lever-vetting record). Regenerate the report with the change and commit it; a reviewer reads its diff like a golden scenario. How the levers were last vetted, and what is still open, is in [docs/audit/lever-vetting.md](audit/lever-vetting.md).

## 13. How to …

**Add a player.** Add a `PlayerDef` with its `settlement`, `group` and `layout`; add it to the `holders` or `issuers` of the instruments it uses (a depositor must hold the deposit instrument); add the flows that touch it, each leg with its own amount rule; give its stocks starting guesses in `initialStocks`, and make sure some behaviour pins each of them.

**Add a flow.** Add a `FlowDef` with the posting and legs, one variable per leg amount, and a rule for each. Choose the posting from the table in section 4; the kernel posts, settles, checks and draws it. If the flow must be zero at baseline for the steady state to hold, the solver will tell you: it will not converge, or the drift layer fails.

**Add a behaviour.** Add a variable and a rule written as terms, with concepts on the terms. To refine an existing rule, put the new rule in a new module with `replaces: '<old rule id>'` and the same `target`; the old module stays for comparison, and removing the new module restores the old behaviour. Two rules for one variable without `replaces` is a compile error.

**Add a lever.** Add a `LeverDef` with a precise `definition`. Bind a setting to a parameter or exogenous variable (with `scale` if the units differ), or let a rule read it through `levers`. For a one-off, write `fire` using only `ShockApi.get` and `setLagged`. Give it a range the model survives: the harness pulls random combinations within it. Declare it where its section's order wants it (the most important first), and set `shown: false` if it is not one of its section's main levers (section 7). Add its expectations to `src/models/<id>/expectations.ts` (the harness fails on a lever without any), then run `bun run levers --model <id>`, vet its section of the report and leave the report clean (section 12).

**Add a policy reaction.** Declare it as a stabiliser (section 7): a shadow value computed locked or not, a suggestion and a value in force in the lever's units, a `StabiliserDef`, and rules that apply it only while its padlock is open and step it from the value in force. Check the model locked too: the harness runs every lever with every padlock closed, and its property tests draw the padlocks like any other lever.

**Add a chart.** Add an `IndicatorDef` with `drivers`, `concepts` and the right `display`. The harness stores every indicator in the golden scenarios, so run `bun run harness --update-golden` once and commit the new files.

**Add an idea.** Add a `ConceptDef` to `src/concepts/library.ts` and tag the terms that express it.

**When the harness fails.** The report says which layer and why. Compile errors list every problem at once. Accounting failures give the check and month. A drift failure names the variable or stock that moves: it usually means something the baseline should pin is left free, or a rule compares against `base()` where it needs a parameter. A changed golden scenario is expected when you change behaviour: check the new paths make sense, then run `bun run harness --update-golden` and say so in the pull request.
