# Authoring guide

This guide shows how to write a model for Iceland Inc., using the small **Reference economy** in `src/models/reference/` as the example. Read [architecture.md](architecture.md) first for the ideas; this page is about the code. The model language is in [src/core/types.ts](../src/core/types.ts), and the kernel's behaviour where the types are silent is recorded in [decisions/0001](decisions/0001-kernel-contract-changes.md).

## 1. A model is a list of modules

```ts
// src/models/reference/index.ts
export const referenceModel: ModelDef = {
  id: 'reference',
  label: 'Reference economy',
  description: '…',
  modules: [stabilisers, structure, labourPrices, demand, banking, centralBank, government, indicators],
  paymentSystem: { bank: 'B', centralBank: 'CB', treasury: 'G', deposits: 'deposits', reserves: 'reserves', treasuryAccount: 'treasuryAccount' },
  dt: 1 / 12,
  steadyState: { … },
  calibration,
  stabiliserMode: { lever: 'stabilisers', manual: 0, automatic: 1 },
};
```

Each module (`ModuleDef`) bundles players, instruments, variables, parameters, rules, flows, levers, indicators, concepts, feed rules and tests. Modules can use each other's ids; list what a module relies on in `requires`. Register a model by adding it to `models` in `src/models/index.ts`, which also attaches the shared concept library as a module named `concepts`.

| File | Module | What it holds |
|---|---|---|
| `stabilisers.ts` | `stabilisers` | the Manual / Automatic setting for the policy rules (section 7) |
| `structure.ts` | `structure` | 5 players, 6 instruments |
| `labour-prices.ts` | `labour-and-prices` | jobs, wages, prices, expectations; wage-settlement lever |
| `demand.ts` | `demand` | disposable income, consumption, investment, GDP |
| `banking.ts` | `banking-and-credit` | loans, repayments, interest, dividends; lending-appetite lever |
| `central-bank.ts` | `central-bank` | Taylor rule (a stabiliser), reserves, open-market operations; key-rate levers |
| `government.ts` | `government` | spending, the debt rule (a stabiliser), taxes, deficit, bonds; spending and tax levers |
| `indicators.ts` | `indicators` | 8 charts and the narration feed |
| `calibration.ts` | (model level) | 3 calibration checks |

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
  params: ['propensityFromIncome', 'propensityFromWealth', 'savingIncentive', 'neutralRate', 'depositSpread'],
  adjust: { speed: 'consumptionSpeed' },                             // partial adjustment
  terms: [
    { id: 'income', label: 'Spending out of income', concept: 'consumption-function',
      compute: (c) => c.p('propensityFromIncome') * c.v('disposableIncome') },
    { id: 'inflationLoss', label: 'Inflation eats savings', concept: 'accrual-vs-cash',
      compute: (c) => -c.p('propensityFromIncome') * c.v('expectedInflation') * c.stock('deposits', 'HH') },
    { id: 'wealth', label: 'Spending out of savings', concept: 'stock-flow-consistency',
      compute: (c) => c.p('propensityFromWealth') * c.stock('deposits', 'HH') },
    { id: 'realRate', label: 'Reward for saving', concept: 'taylor-rule',
      compute: (c) => -c.p('savingIncentive') * 100 * (c.v('depositRate') - c.v('expectedInflation') - (c.p('neutralRate') - c.p('depositSpread'))) },
  ],
  concepts: ['consumption-function', 'paradox-of-thrift', 'multiplier'],
  explain: { what: 'What households spend …', rule: 'Households aim to spend {propensityFromIncome} of their income … at speed {consumptionSpeed} a year. …' },
}
```

- **Categories:** `IDENTITY` (accounting), `CONTRACT` (institutional rule), `BEHAVIOUR` (an assumption), `POLICY` (an authority's decision rule).
- **Declarations:** `c.v(id)` needs `inputs`, `c.lag(id, k)` needs `lagInputs`, `c.p(id)` needs `params`, `c.stock(ins, player)` needs `stocks`, `c.lever(id)` needs `levers`. The compiler dry-runs every rule, so an undeclared read is a compile error, and in dev mode the engine also throws on one at run time.
- **Terms:** the desired value is the sum of the terms, so the inspector can show exactly which term moved. Write rules as terms whenever they add up.
- **Adjust:** with `adjust`, value = last month's value + speed × dt × (desired − last month's value). Speeds are per year. The target's own lag is read automatically. With `adjust: { speed, form: 'exponential' }` the share closed each step is 1 − e^(−speed × dt) instead: the exact first-order lag, which never overshoots and changes less when the step is halved (the Iceland model uses it throughout, as engine v1 did).
- **Explain:** `{paramId}`, `{paramId%}` and `{paramId pp}` in `explain.rule` are filled with live parameter values.
- **Lags:** `c.lag(id)` is last month; for "a year ago" write `c.lag(id, Math.round(1 / c.dt))` so the rule survives the half-step test.

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
  kind: 'setting', unit: 'pp', default: 0, min: -3, max: 3, step: 0.5,
  binds: { param: 'taxShift', mode: 'add', scale: 0.01 },
  description: 'Raises (or cuts) the tax rate on household income by this many points, on top of the debt rule.',
  definition: 'Level shift in the income-tax rate, in percentage points, persistent while set. …',
}
```

**A setting read by a rule.** The key-rate offset binds nothing; the Taylor rule declares `levers: ['stabilisers', 'keyRateAddon']` and reads `c.lever('keyRateAddon') / 100` in its `addOn` term (only on Automatic, below).

**A lever shown in one mode only.** `showWhen` shows a lever only while another lever has one of the listed values. The Manual key rate and the offset to the rule are never on screen together:

```ts
{ id: 'keyRateFixed', label: 'Key interest rate', unit: '%', default: 3, step: 0.25, showWhen: { lever: 'stabilisers', equals: 0 }, … },
{ id: 'keyRateAddon', label: 'Key rate: your offset to the rule', unit: 'pp', default: 0, step: 0.25, showWhen: { lever: 'stabilisers', equals: 1 }, … },
```

It is presentation only: the engine still applies a hidden lever's value, so the rules must ignore it in the other mode, and the lever panel puts it back to its default when the mode hides it. The compiler checks that `showWhen` names another setting or choice, and that each value is one of its options.

### Policy reactions are stabilisers

A POLICY setting never changes unless the user changes it. A rule that reacts to the economy by moving a policy setting (a Taylor rule, a debt rule) is a *stabiliser*: declare it, and make it act only when the model's stabiliser setting is Automatic ([decision 0004](decisions/0004-stabilisers.md)).

1. **The setting.** One choice lever for the whole model (`stabilisers.ts`: Manual 0, Automatic 1), named in `ModelDef.stabiliserMode`.
2. **The shadow value.** Compute what the rule would do every month in both modes. The reference's Taylor rule is a variable of its own, `ruleRate`, and the key rate uses it only on Automatic:

```ts
{ id: 'keyRate', target: 'keyRate', category: 'POLICY', inputs: ['ruleRate'], levers: ['stabilisers', 'keyRateFixed'],
  terms: [
    { id: 'rule', label: 'The Taylor rule (Automatic)', compute: (c) => (automatic(c) ? c.v('ruleRate') : 0) },
    { id: 'set', label: 'The rate you set (Manual)', compute: (c) => (automatic(c) ? 0 : c.lever('keyRateFixed') / 100) },
  ],
  … }
```

3. **The suggestion,** a variable in the lever's own units, so it can be compared with the lever and "Apply" can set it: `keyRateSuggestion = 100 × ruleRate` (%). For a rule that adds to a lever (a tax shift), suggest the whole shift the rule would set, not the rule's addition on top of the user's setting: otherwise each "Apply" would ratchet.
4. **The declaration,** in the module with the rules:

```ts
stabilisers: [{
  id: 'taylorRule', label: 'Taylor rule',
  lever: 'keyRateFixed',          // the POLICY lever it stands in for (set by the user on Manual)
  offset: 'keyRateAddon',         // the lever that offsets it on Automatic, if not `lever` itself
  suggestion: 'keyRateSuggestion',
  shadow: ['ruleRate'],           // variables that only feed the suggestion on Manual
  threshold: 0.125,               // lever units; half the lever's step calls exactly when Apply would move it
  description: 'The central bank’s Taylor rule: …',
  feed: { raise: 'The Taylor rule would raise the key rate to {value}%', lower: 'The Taylor rule would cut the key rate to {value}%', indicator: 'keyRate' },
}],
```

`engine.stabilisers()` then reports each one: `suggested`, `current` (the lever), `gap`, `calling` (Manual and the gap above the threshold) and `automatic`. The interface turns a calling lever red with the suggestion and an "Apply" button, marks the offset lever with the rule's value on Automatic, and the engine narrates a call in the feed. List the shadow variables in `shadow`: on Manual they drive nothing, so ideas at play leaves them out (the suggestion is always left out, because it restates the rule in lever units), and the compiler checks that no other rule reads them on Manual. Keep the baseline identical in both modes: at the steady state the rule must suggest exactly what the lever's default gives.

**A one-off.** `fire` may change only non-stock state, through the restricted `ShockApi`. Here it lifts last month's wage rate, so the jump is felt this month:

```ts
fire: (s, size) => s.setLagged('wage', s.get('wage') * (1 + size / 100)),
```

The kernel rejects any attempt to write an instrument position, and a shock to a variable nobody reads with `lag()`.

Pick lever ranges the model handles: the harness's property tests pull random combinations anywhere within them.

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
  label: 'Key rate +1 pp for 2 years: output trough, % vs baseline',
  scenario: [{ t: 0, lever: 'keyRateAddon', value: 1 }, { t: 24, lever: 'keyRateAddon', value: 0 }],
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

`bun test` runs every module test and calibration check; `bun run harness` runs them too, with the accounting, drift and robustness layers, and writes `reports/harness-<model>.md`.

## 12. Vetting levers

The harness proves that the accounting holds and that the calibration checks pass. It does not tell you whether a lever does what economics says it should. `bun run levers` is for that question: it moves every lever hard, one at a time, and writes a report that a person or an agent can read lever by lever.

```bash
bun run levers                           # every model, 240 months
bun run levers --model iceland           # one model
bun run levers --months 120              # a shorter horizon
bun run levers --paths reports/levers/paths   # also the full monthly paths (large, git-ignored)
```

It writes `reports/levers/<model>.md` for reading and `reports/levers/<model>.json` for tools, and prints how long it took: about 0.1 s for the reference economy and 6 s for Iceland. The output depends on nothing but the model, so a rerun changes the files only when behaviour changes. Treat the diff like a golden scenario: when you change a model on purpose, regenerate the report, read what moved, and commit it with the change.

**What it runs.** A setting runs at its min, its max and a moderate step each way from its default (a quarter of the distance to each bound, snapped to the lever's step). A one-off fires at its min, its max, its default size and half of it, and at those two with the opposite sign where the range allows. A choice runs every option. Each value is applied before month 1 and held; a one-off fires once. Each runs in both stabiliser modes, except in a mode where `showWhen` hides the lever; the report says which runs it skipped. The stabiliser setting itself is not run as a lever: its two values are the modes.

**What it measures.** Every effect is the run minus the **no-change run in the same mode**: the same engine and mode with no lever event, compared month by month. It is never measured from month 0, so drift, the mode and anything else the two runs share cancel out. Effects are in the variable's display unit: % of the no-change level for levels, pp for rates and shares, pp of GDP for ratios to GDP. For every indicator and every headline variable the report records the effect at months 1, 3, 6, 12, 24, 36, 60, 120 and 240, the peak and its month, and the long-run value (the mean over the final 12 months).

**Headline variables** are declared per model in `src/harness/lever-headlines.ts`: an indicator, or a level computed from variables (real consumption is nominal consumption ÷ the price level). Mark as `gradual` the ones that should adjust over months (output, jobs, spending, stocks of debt and money), and as `policy` the instruments that stabilisers move. The same file lists the policy instruments that must hold still on Manual, each with the levers allowed to move it. A new model needs an entry there; the tests check that every id exists.

**Flags.** Each run gets a flags line, and the summary table counts them by lever. The report states every threshold (`LEVER_THRESHOLDS` in `src/harness/lever-report.ts`).

| Flag | What it usually means |
|---|---|
| Non-finite, Residual, Sign, Implausible | The run is broken: a NaN, an accounting leak, an overdrawn position or an impossible value. Fix the model before reading anything else |
| Policy moved | On Manual, a policy instrument moved although its own lever did not: a rule reacts where only a stabiliser may ([decision 0004](decisions/0004-stabilisers.md)) |
| Month-1 jump | A variable that should build up gradually does most of its moving in the first month. Sometimes it is accounting (public spending is output at once); often a missing adjustment speed |
| Sawtooth | The path zigzags from one month to the next. Economies do not; a floor or cap switching on and off, or an overshooting adjustment, does |
| Flicker | A rule's regime label changes many times within five years: the floor or cap behind a sawtooth, named |
| Unsettled, Explosive | Still moving after 20 years, or growing without bound. A permanent change in inflation moves the price level for ever, which is right; a debt ratio or exchange rate that runs away usually is not |
| Asymmetry | The moderate up and down steps give responses of different size or direction per unit of lever. Caps and floors that bind one way cause it; check that the one that binds is meant to |
| Mode sign | Manual and Automatic move a headline in opposite directions at month 12. Often right (the Taylor rule turns an inflationary boom into a slowdown), but each one deserves a sentence of explanation |
| Regimes | Informational: every rule whose regime differs from the no-change run, with the months. It tells you which floor, cap or limit drives the result |

**How to vet a lever.** Read its definition first, then for each run ask, in order:

1. *Is the run healthy?* No flags from the first row of the table above.
2. *Is the sign right?* Name the theory that predicts it: a higher key rate cools demand and strengthens the currency (uncovered interest parity), a tax cut raises disposable income, a higher foreign rate weakens the króna. Where Manual and Automatic differ, say which stabiliser explains it.
3. *Is the timing right?* Prices and wages move first where contracts or pass-through say so; output, jobs and credit build up over quarters. Check the month-1 column and the peak month.
4. *Is the size plausible?* Compare with the calibration checks and with published estimates; per unit of lever, the moderate steps should be about the same size as the extremes unless a regime binds.
5. *Does it settle?* After a persistent setting, ratios should reach a new level; after a one-off, most effects should fade.
6. *What drives it?* The regimes list names the binding floors and caps; the interface's inspector shows the terms behind any variable in any month.

**Expectations.** A model may declare what theory predicts in `src/models/<id>/expectations.ts`, and the report marks each one ✓ or ✗ (and counts them in the summary):

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

`setting` is a lever value or a role (`min`, `max`, `up`, `down`, `default`, `half`, `-default`, `-half`); `mode` is `Manual`, `Automatic` or `any`; `variable` is a headline or an indicator id; `sign` is +1, −1 or 0 for the mean effect over the months (0: smaller than the report's floor of 0.01). An expectation that matches no run fails, so a renamed lever cannot pass silently.

## 13. How to …

**Add a player.** Add a `PlayerDef` with its `settlement`, `group` and `layout`; add it to the `holders` or `issuers` of the instruments it uses (a depositor must hold the deposit instrument); add the flows that touch it, each leg with its own amount rule; give its stocks starting guesses in `initialStocks`, and make sure some behaviour pins each of them.

**Add a flow.** Add a `FlowDef` with the posting and legs, one variable per leg amount, and a rule for each. Choose the posting from the table in section 4; the kernel posts, settles, checks and draws it. If the flow must be zero at baseline for the steady state to hold, the solver will tell you: it will not converge, or the drift layer fails.

**Add a behaviour.** Add a variable and a rule written as terms, with concepts on the terms. To refine an existing rule, put the new rule in a new module with `replaces: '<old rule id>'` and the same `target`; the old module stays for comparison, and removing the new module restores the old behaviour. Two rules for one variable without `replaces` is a compile error.

**Add a lever.** Add a `LeverDef` with a precise `definition`. Bind a setting to a parameter or exogenous variable (with `scale` if the units differ), or let a rule read it through `levers`. For a one-off, write `fire` using only `ShockApi.get` and `setLagged`. Give it a range the model survives: the harness pulls random combinations within it. Then run `bun run levers --model <id>` and vet its section of the report (section 12).

**Add a policy reaction.** Declare it as a stabiliser (section 7): a shadow value computed in both modes, a suggestion in the lever's units, a `StabiliserDef`, and rules that apply it only on Automatic. Check the model in Manual too: the harness's property tests draw the mode like any other lever.

**Add a chart.** Add an `IndicatorDef` with `drivers`, `concepts` and the right `display`. The harness stores every indicator in the golden scenarios, so run `bun run harness --update-golden` once and commit the new files.

**Add an idea.** Add a `ConceptDef` to `src/concepts/library.ts` and tag the terms that express it.

**When the harness fails.** The report says which layer and why. Compile errors list every problem at once. Accounting failures give the check and month. A drift failure names the variable or stock that moves: it usually means something the baseline should pin is left free, or a rule compares against `base()` where it needs a parameter. A changed golden scenario is expected when you change behaviour: check the new paths make sense, then run `bun run harness --update-golden` and say so in the pull request.
