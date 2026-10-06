/**
 * Optional borrower financing and loan-loss layer. The original stationary model is untouched.
 * Compose with withFinancialFragility(model), after any growth transformation. Money stocks
 * change only through the declared gross lending, repayment, accrual and write-off postings.
 */
import type { Ctx, Id, IndicatorDef, ModelDef, ModuleDef, ParamDef, RuleDef, VarDef } from '../../../core/types.ts';
import { EXPORTERS, EXPORT_OF, FIRMS, FIRM_NAME, GDP_BN, gapShare, lastMonth, terms, type Firm } from '../util.ts';
import { base } from '../steady.ts';

const positive = (x: number) => Math.max(0, x);
const clip = (x: number) => Math.min(1, positive(x));
const add = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
const ids = (prefix: string) => FIRMS.map((j) => `${prefix}${j}`);
const totalDebt = (c: Ctx, j: Firm) => c.stock('businessLoans', j) + c.stock('businessArrears', j);
const debtStocks = (j: Firm): [Id, Id][] => [['businessLoans', j], ['businessArrears', j]];
const deposits = (j: Firm): [Id, Id][] => [['deposits', j]];
const what = (j: Firm) => FIRM_NAME[j];

const assumption = (id: string, value: number, unit: string, description: string, min = 0, max?: number): ParamDef => ({
  id, value, unit, category: 'BEHAVIOUR', description, min, ...(max === undefined ? {} : { max }),
  provenance: { basis: 'assumed', note: 'Explicit financial-instability teaching assumption; not an estimated Icelandic statistic.' },
});
const params: ParamDef[] = [
  assumption('fragilityMaturityYears', 5, 'years', 'Average contractual life of performing business principal; this fraction comes due each year.', 0.25, 30),
  assumption('fragilityCapitalCushion', 0.02, 'fraction', 'Lenders require the existing minimum capital ratio plus this cushion for additional business credit.', 0, 0.1),
  assumption('fragilityCollateralAdvance', 1, 'fraction', 'Maximum business debt relative to capital at book value, adjusted by the domestic asset-price proxy.', 0.05, 3),
  assumption('fragilityRolloverCoverage', 0.5, 'ratio', 'Cash-service coverage at which lenders fully approve otherwise feasible refinancing; lower coverage reduces approval.', 0.01, 3),
  assumption('fragilityArrearsWeight', 1.5, 'risk weight', 'Risk weight on overdue business principal and capitalised unpaid interest.', 0.1, 3),
  assumption('fragilityRecoverySpeed', 2, 'fraction/yr', 'Maximum share of arrears recovered each year when borrowers have cash left after current service.', 0, 12),
  assumption('fragilityDefaultDelay', 0.5, 'years', 'Persistent interest shortfall or unpaid principal must last this long before a loss is recognised.', 0.01, 5),
  assumption('fragilityWriteoffSpeed', 1, 'fraction/yr', 'Share of unrecovered arrears written off each year after the default delay.', 0, 12),
  assumption('fragilityRiskSpeed', 0.5, 'fraction/yr', 'Speed at which lender confidence follows sustained good or bad cash-service conditions.', 0, 6),
  assumption('fragilityRiskCapitalRelief', 0.01, 'fraction', 'Maximum reduction of the extra capital cushion in confident times; minimum capital remains binding.', 0, 0.05),
  assumption('fragilityRiskCollateralLift', 0.25, 'fraction', 'Maximum proportional lift to collateral advance rates in confident times.', 0, 1),
];

function variable(id: Id, label: string, kind: VarDef['kind'] = 'flow', initial = 0): VarDef {
  const ratio = kind === 'ratio' || kind === 'index';
  return { id, label, unit: ratio ? 'ratio' : kind === 'state' ? 'years' : '% of baseline GDP/yr', kind,
    scale: ratio || kind === 'state' ? 'none' : 'nominal', initial };
}

/** Evaluate a source equation, including its own adjustment, without changing its contract. */
function evaluate(rule: RuleDef, c: Ctx, target = rule.target): number {
  const ts = Object.fromEntries((rule.terms ?? []).map((t) => [t.id, t.compute(c)]));
  const desired = rule.compute ? rule.compute(c) : rule.combine ? rule.combine(ts, c) : add(Object.values(ts));
  if (!rule.adjust) return desired;
  const speed = typeof rule.adjust.speed === 'string' ? c.p(rule.adjust.speed) : rule.adjust.speed;
  const k = rule.adjust.form === 'exponential' ? gapShare(speed, c.dt) : speed * c.dt;
  return c.lag(target) + k * (desired - c.lag(target));
}

function effectiveRules(model: ModelDef): Map<Id, RuleDef> {
  const all = model.modules.flatMap((m) => m.rules ?? []);
  const replaced = new Set(all.map((r) => r.replaces).filter((x): x is string => !!x));
  return new Map(all.filter((r) => !replaced.has(r.id)).map((r) => [r.target, r]));
}

/** Existing debt-sensitive plans and payouts must count overdue debt as well as performing loans. */
function includeArrears(c: Ctx): Ctx {
  return { ...c, stock: (ins, pl) => c.stock(ins, pl) + (ins === 'businessLoans' && FIRMS.includes(pl as Firm) ? c.stock('businessArrears', pl) : 0) };
}

function desiredRule(source: RuleDef, target: Id, label: string): RuleDef {
  const readsLoans = (source.stocks ?? []).filter(([ins, pl]) => ins === 'businessLoans' && FIRMS.includes(pl as Firm));
  return {
    ...source, id: `fragility.${target}`, target, replaces: undefined, label,
    stocks: [...(source.stocks ?? []), ...readsLoans.map(([, pl]): [Id, Id] => ['businessArrears', pl])],
    terms: source.terms?.map((t) => ({ ...t, compute: (c) => t.compute(includeArrears(c)) })),
    compute: source.compute ? (c) => source.compute!(includeArrears(c)) : undefined,
    combine: source.combine ? (ts, c) => source.combine!(ts, includeArrears(c)) : undefined,
    regime: undefined,
    explain: { what: label, rule: `${source.explain.rule} This is the requested amount before financing limits; overdue business debt still counts as debt.` },
  };
}

/** Adding a funding cap replaces an effective source rule explicitly, including a growth rule. */
function replacement(source: RuleDef, def: Omit<RuleDef, 'id' | 'target' | 'replaces'>): RuleDef {
  return { ...def, id: `fragility.${source.id}`, target: source.target, replaces: source.id };
}

function borrowerRules(j: Firm, source: Map<Id, RuleDef>, cashLegs: { amount: Id; sign: number }[]): RuleDef[] {
  const get = (id: string) => {
    const r = source.get(id);
    if (!r) throw new Error(`Financial fragility requires a determining rule for '${id}'`);
    return r;
  };
  const inv = get(`investment${j}`), emp = get(`employment${j}`), div = get(`dividends${j}`);
  const borrow = get(`borrowing${j}`), profit = get(`profits${j}`), interest = get(`loanInterest${j}`);
  const wantInv = `investmentDesired${j}`, wantEmp = `employmentDesired${j}`, wantDiv = `dividendsDesired${j}`;
  const cash = `cashForService${j}`, due = `interestDue${j}`, maturity = `principalMaturity${j}`;
  const approved = `creditApproved${j}`, requested = `creditRequested${j}`, coverage = `cashServiceCoverage${j}`;
  const paidPrincipal = `principalPaid${j}`, recovery = `arrearsRecovery${j}`;
  const unpaid = `interestUnpaid${j}`, overdue = `principalOverdue${j}`;
  const support = `ownerSupport${j}`;
  const rawSupport = (c: Ctx) => positive(-c.v(wantDiv));
  const operating = `operatingCash${j}`;
  const funds = (c: Ctx) => positive(c.stock('deposits', j) / c.dt + c.v(operating) + c.v(support) + c.v(approved));
  const originalInterest = (c: Ctx) => c.v('loanRate') * totalDebt(c, j);
  return [
    desiredRule(inv, wantInv, `Investment ${what(j)} would undertake with funding`),
    desiredRule(emp, wantEmp, `Jobs ${what(j)} would retain with funding`),
    desiredRule(div, wantDiv, `Payout or owner contribution ${what(j)} would request`),
    {
      id: operating, target: operating, category: 'IDENTITY', inputs: [...new Set(cashLegs.map((l) => l.amount))],
      terms: cashLegs.map((l, k) => ({ id: `leg${k}`, label: `${l.sign > 0 ? 'Cash received' : 'Cash paid'}: ${l.amount}`, compute: (c: Ctx) => l.sign * c.v(l.amount) })),
      explain: { what: `Actual operating cash earnings of ${what(j)}, after operating payments and taxes but before business interest, owner transfers and financing.`, rule: 'Sum of actual declared cash receipts minus operating cash payments. Builders also collect cash for investment goods delivered to other sectors; their own capital construction has no cash receipt. Accrued interest and book profit are not cash.' },
    },
    {
      id: due, target: due, category: 'CONTRACT', inputs: ['loanRate'], stocks: debtStocks(j),
      compute: originalInterest, concepts: ['accrual-vs-cash', 'minsky-instability'],
      explain: { what: `Contracted business interest owed by ${what(j)}, whether paid or accrued.`, rule: 'Interest = business loan rate × performing and overdue business debt. Unpaid interest remains an expense and a bank claim.' },
    },
    replacement(profit, {
      ...profit, inputs: [...(profit.inputs ?? []), unpaid],
      terms: profit.terms ? [...profit.terms, { id: 'unpaidInterest', label: 'Interest accrued but not paid', concept: 'accrual-vs-cash', compute: (c) => -c.v(unpaid) }] : undefined,
      compute: profit.compute ? (c) => profit.compute!(c) - c.v(unpaid) : undefined,
      explain: { what: profit.explain.what, rule: `${profit.explain.rule} Both paid and unpaid contracted interest are expenses; an unpaid bill is not a profit windfall.` },
    }),
    {
      id: maturity, target: maturity, category: 'CONTRACT', params: ['fragilityMaturityYears'], stocks: [['businessLoans', j]],
      compute: (c) => Math.min(c.stock('businessLoans', j) / c.dt, c.stock('businessLoans', j) / c.p('fragilityMaturityYears')),
      explain: { what: `Gross performing principal of ${what(j)} contractually coming due each year.`, rule: 'Principal due = performing business loans ÷ assumed contractual life. Refinancing must be approved even when net debt does not change.' },
    },
    {
      id: coverage, target: coverage, category: 'IDENTITY', inputs: [operating, due, maturity, `arrearsScheduled${j}`],
      compute: (c) => c.v(operating) / Math.max(1e-9, c.v(due) + c.v(maturity) + c.v(`arrearsScheduled${j}`)),
      concepts: ['minsky-instability'],
      explain: { what: `Operating cash earnings of ${what(j)} relative to contracted interest and principal service.`, rule: 'Coverage = actual operating cash receipts less operating payments and taxes ÷ (interest due + performing principal maturity + the declared arrears-workout instalment). It excludes cash buffers, owner support, refinancing, investment and dividends. This is a sector aggregate, not a count of individual firms.' },
    },
    {
      id: support, target: support, category: 'BEHAVIOUR', inputs: [wantDiv],
      // The existing payout rule has a common cash bound on all domestic owners. Read its actual
      // support request rather than inventing an unbounded additional shareholder transfer.
      compute: rawSupport,
      explain: { what: `Cash existing owners put into ${what(j)}.`, rule: 'The existing dividend rule requests negative payouts when debt is high; its domestic owner cash limits still bind. Foreign parents can support their subsidiary. Support is a transfer of existing money, not extra bank credit.' },
    },
    {
      id: `creditDesiredNet${j}`, target: `creditDesiredNet${j}`, category: 'BEHAVIOUR',
      inputs: [...new Set([...(borrow.inputs ?? []), wantInv, wantDiv, 'domesticPrice'])],
      lagInputs: borrow.lagInputs, params: borrow.params, stocks: [...(borrow.stocks ?? []), ['businessArrears', j]],
      compute: (c) => evaluate(borrow, { ...c, v: (id) => id === `investmentPurchase${j}` ? c.v(wantInv) * c.v('domesticPrice') : id === `dividends${j}` ? c.v(wantDiv) : c.v(id), stock: (ins, pl) => includeArrears(c).stock(ins, pl) }),
      concepts: ['endogenous-money', 'minsky-instability'],
      explain: { what: `Net credit ${what(j)} would request to carry out investment and payouts and rebuild its cash buffer.`, rule: 'Uses the existing firm cash-budget request, with requested rather than funded investment and dividends. It is a request, not an automatic loan.' },
    },
    {
      id: requested, target: requested, category: 'BEHAVIOUR', inputs: [maturity, `creditDesiredNet${j}`],
      compute: (c) => positive(c.v(maturity) + c.v(`creditDesiredNet${j}`)),
      explain: { what: `Gross new loan and refinancing request by ${what(j)}.`, rule: 'Request = principal coming due + desired net credit, floored at zero. A quiet borrower with unchanged debt still needs gross refinancing.' },
    },
    {
      id: approved, target: approved, category: 'BEHAVIOUR', inputs: [requested, maturity, 'creditCapitalCapacity', 'creditRequestedNewTotal', 'capitalRatio', 'lenderConfidence', 'housePrice', 'cpi'], lagInputs: [coverage],
      params: ['fragilityRolloverCoverage', 'fragilityCollateralAdvance', 'fragilityRiskCollateralLift', 'kapMin'], stocks: [...debtStocks(j), ['capital', j]],
      terms: terms(
        ['requested', 'Gross credit requested', 'endogenous-money', (c) => c.v(requested)],
        ['capital', 'Capital-constrained refinancing and additional credit', 'bank-capital', (c) => {
          const roll = Math.min(c.v(requested), c.v(maturity));
          const fresh = positive(c.v(requested) - c.v(maturity));
          const share = fresh / Math.max(1e-9, c.v('creditRequestedNewTotal'));
          return roll * clip(c.v('capitalRatio') / c.p('kapMin')) + Math.min(fresh, share * c.v('creditCapitalCapacity'));
        }],
        ['collateral', 'Collateral-constrained credit', 'minsky-instability', (c) => {
          const security = c.p('fragilityCollateralAdvance') * (1 + c.p('fragilityRiskCollateralLift') * c.v('lenderConfidence')) * c.stock('capital', j) * c.v('housePrice') / Math.max(1e-9, c.v('cpi'));
          return c.v(maturity) * clip(security / Math.max(1e-9, totalDebt(c, j))) + positive(security - totalDebt(c, j)) / c.dt;
        }],
        ['cashFlow', 'Recent cash-service quality', 'minsky-instability', (c) => c.v(requested) * clip(lastMonth(c, coverage) / c.p('fragilityRolloverCoverage'))],
      ),
      combine: (t) => Math.max(0, Math.min(t.requested, t.capital, t.collateral, t.cashFlow)),
      regime: (_c, v, t) => v < t.requested - 1e-9 ? t.capital <= v + 1e-9 ? 'Bank capital limits approved credit' : t.collateral <= v + 1e-9 ? 'Collateral limits approved credit' : 'Weak cash service limits refinancing' : null,
      concepts: ['bank-capital', 'minsky-instability'],
      explain: { what: `Gross business credit banks actually approve for ${what(j)}.`, rule: 'Approval is the smallest of the request, bank-capital capacity, collateral capacity and the cash-service test. More confident lenders loosen the extra cushion and collateral advance, while the capital minimum remains.' },
    },
    {
      id: `creditDenied${j}`, target: `creditDenied${j}`, category: 'IDENTITY', inputs: [requested, approved],
      compute: (c) => positive(c.v(requested) - c.v(approved)),
      explain: { what: `Gross requested business credit not approved for ${what(j)}.`, rule: 'Gross request minus gross approval. This includes additional credit as well as refinancing; it is not itself an unpaid obligation.' },
    },
    {
      id: `refinancingDenied${j}`, target: `refinancingDenied${j}`, category: 'IDENTITY', inputs: [requested, approved, maturity],
      compute: (c) => positive(Math.min(c.v(requested), c.v(maturity)) - Math.min(c.v(approved), c.v(maturity))),
      explain: { what: `Principal refinancing requested but refused for ${what(j)}.`, rule: 'Requested and approved credit are each allocated to contractual maturity first; their refinancing difference is refused. The borrower can still use deposits or owner cash to repay, so refused refinancing is not automatically default.' },
    },
    replacement(emp, {
      category: 'BEHAVIOUR', inputs: [wantEmp, operating, support, approved, 'wage', `employment${j}`],
      params: ['cEr', 'css'], stocks: deposits(j),
      terms: terms(
        ['desired', 'Jobs justified by demand', 'okun-law', (c) => c.v(wantEmp)],
        ['funded', 'Jobs that available cash can pay for', 'minsky-instability', (c) => {
          const pay = c.v('wage') * (1 + c.p('cEr') + c.p('css'));
          const beforePay = c.v(operating) + pay * c.v(`employment${j}`);
          return positive(c.stock('deposits', j) / c.dt + beforePay + c.v(support) + c.v(approved)) / Math.max(1e-9, pay);
        }],
      ),
      combine: (t) => positive(Math.min(t.desired, t.funded)),
      regime: (_c, v, t) => v < t.desired - 1e-9 ? 'Credit and cash exhausted: funded jobs cut' : null,
      concepts: ['minsky-instability', 'okun-law'],
      explain: { what: `Jobs ${what(j)} can actually pay for.`, rule: 'Demand sets desired jobs with its existing adjustment lag. If operating receipts, the cash buffer, owner support and approved credit cannot pay wages and employer charges, funded jobs are cut immediately. This teaching layer does not record unpaid wage claims.' },
    }),
    {
      id: cash, target: cash, category: 'IDENTITY', inputs: [operating, support, approved], stocks: deposits(j),
      compute: funds,
      explain: { what: `Cash ${what(j)} have available after operating costs and tax, before debt service, investment and payouts.`, rule: 'Available cash = opening deposits ÷ step + actual operating cash earnings after tax + actual owner cash support + approved gross credit. The operating cash measure excludes interest and non-cash accruals.' },
    },
    replacement(interest, {
      category: 'CONTRACT', inputs: [due, cash], compute: (c) => Math.min(c.v(due), c.v(cash)),
      regime: (c, v) => v < c.v(due) - 1e-9 ? 'Interest bill partly unpaid: balance accrued' : null,
      concepts: ['accrual-vs-cash'],
      explain: { what: `Business interest ${what(j)} actually pay in cash.`, rule: 'Cash interest is the lesser of contracted interest and available cash. The difference is recognised as an expense and added to arrears.' },
    }),
    {
      id: unpaid, target: unpaid, category: 'IDENTITY', inputs: [due, `loanInterest${j}`],
      compute: (c) => positive(c.v(due) - c.v(`loanInterest${j}`)),
      explain: { what: `Contracted interest ${what(j)} cannot pay in cash.`, rule: 'Interest due minus interest paid is accrued as a bank claim; later repayment is principal recovery, not a second interest expense or income.' },
    },
    {
      id: paidPrincipal, target: paidPrincipal, category: 'CONTRACT', inputs: [maturity, cash, `loanInterest${j}`, `creditDesiredNet${j}`], stocks: [['businessLoans', j]],
      compute: (c) => Math.min(c.stock('businessLoans', j) / c.dt, c.v(maturity) + positive(-c.v(`creditDesiredNet${j}`)), positive(c.v(cash) - c.v(`loanInterest${j}`))),
      explain: { what: `Performing loan principal ${what(j)} repay in cash, including voluntary repayment when cash is spare.`, rule: 'Repayment is limited by loans outstanding, scheduled principal plus desired voluntary repayment, and cash left after interest.' },
    },
    {
      id: overdue, target: overdue, category: 'CONTRACT', inputs: [maturity, paidPrincipal],
      compute: (c) => positive(c.v(maturity) - c.v(paidPrincipal)),
      explain: { what: `Matured principal ${what(j)} do not refinance or repay.`, rule: 'Scheduled principal minus cash principal paid moves from performing loans into arrears. The paired reclassification has zero income and is not a loan loss.' },
    },
    {
      id: `performingReclassification${j}`, target: `performingReclassification${j}`, category: 'IDENTITY', inputs: [overdue], compute: (c) => -c.v(overdue),
      explain: { what: `Performing principal removed when ${what(j)} miss maturity.`, rule: 'Exactly the negative of overdue principal; the matching arrears accrual offsets its income entry.' },
    },
    {
      id: `arrearsScheduled${j}`, target: `arrearsScheduled${j}`, category: 'CONTRACT', params: ['fragilityRecoverySpeed'], stocks: [['businessArrears', j]],
      compute: (c) => Math.min(c.stock('businessArrears', j) / c.dt, c.p('fragilityRecoverySpeed') * c.stock('businessArrears', j)),
      explain: { what: `Declared cash-workout instalment on old arrears owed by ${what(j)}.`, rule: 'Existing overdue claims × the assumed recovery speed, capped at all arrears in a step. This teaching workout contract is included in service coverage and continuing default, rather than treating overdue debt as free.' },
    },
    {
      id: recovery, target: recovery, category: 'CONTRACT', inputs: [cash, `loanInterest${j}`, paidPrincipal, `arrearsScheduled${j}`],
      compute: (c) => Math.min(c.v(`arrearsScheduled${j}`), positive(c.v(cash) - c.v(`loanInterest${j}`) - c.v(paidPrincipal))),
      explain: { what: `Cash arrears recovery from ${what(j)}.`, rule: 'After current interest and performing principal, spare cash repays overdue claims at the assumed recovery speed, never more than the claim. Recovery does not recognise interest twice.' },
    },
    {
      id: `arrearsMissed${j}`, target: `arrearsMissed${j}`, category: 'CONTRACT', inputs: [`arrearsScheduled${j}`, recovery],
      compute: (c) => positive(c.v(`arrearsScheduled${j}`) - c.v(recovery)),
      explain: { what: `Old arrears instalment ${what(j)} cannot pay.`, rule: 'Scheduled cash workout minus actual arrears recovery. This is existing overdue principal still unpaid; it creates no duplicate claim or expense.' },
    },
    replacement(inv, {
      category: 'BEHAVIOUR', inputs: [wantInv, cash, `loanInterest${j}`, paidPrincipal, recovery, 'domesticPrice'],
      terms: terms(['desired', 'Investment ordered with funding', 'investment-accelerator', (c) => c.v(wantInv)], ['funded', 'Cash left after debt service', 'minsky-instability', (c) => positive(c.v(cash) - c.v(`loanInterest${j}`) - c.v(paidPrincipal) - c.v(recovery)) / Math.max(1e-9, c.v('domesticPrice'))]),
      combine: (t) => positive(j === 'FC' ? t.desired : Math.min(t.desired, t.funded)), regime: (_c, v, t) => v < t.desired - 1e-9 ? 'Credit rationed: investment postponed' : null,
      concepts: ['minsky-instability', 'investment-accelerator'],
      explain: { what: `Investment ${what(j)} can fund.`, rule: j === 'FC' ? 'Builders construct their own capital inside the sector, without a cash purchase; funded employment still limits the wages they can pay.' : 'Actual investment is the lesser of existing desired spending and cash left after interest, principal and arrears recovery. Denied credit cuts purchases and output rather than creating an unbooked overdraft.' },
    }),
    replacement(div, {
      category: 'BEHAVIOUR', inputs: [wantDiv, support, cash, `loanInterest${j}`, paidPrincipal, recovery, `investmentPurchase${j}`],
      compute: (c) => c.v(wantDiv) < 0 ? -c.v(support) : Math.min(positive(c.v(wantDiv)), positive(c.v(cash) - c.v(`loanInterest${j}`) - c.v(paidPrincipal) - c.v(recovery) - (j === 'FC' ? 0 : c.v(`investmentPurchase${j}`)))),
      regime: (c, v) => c.v(wantDiv) > v + 1e-9 ? 'Cash retained: owner payouts cut' : null,
      explain: { what: `Funded owner payout by ${what(j)}, or bounded cash support from its owners.`, rule: 'Owners receive only cash remaining after operations, debt service and funded investment. Existing negative-payout owner-support limits are retained.' },
    }),
    replacement(borrow, {
      category: 'IDENTITY', inputs: [approved, paidPrincipal, recovery],
      terms: terms(['new', 'Approved gross loans', 'endogenous-money', (c) => c.v(approved)], ['principal', 'Performing principal repaid', 'money-destruction', (c) => -c.v(paidPrincipal)], ['recovery', 'Overdue principal recovered', 'money-destruction', (c) => -c.v(recovery)]),
      explain: { what: `Actual net cash business borrowing by ${what(j)}.`, rule: 'Approved gross credit minus cash repayment of performing principal and arrears. Principal reclassification and loan write-offs are separate non-cash events.' },
    }),
    {
      id: `distressAge${j}`, target: `distressAge${j}`, category: 'BEHAVIOUR', lagInputs: [`distressAge${j}`], inputs: [unpaid, overdue, `arrearsMissed${j}`],
      compute: (c) => c.v(unpaid) + c.v(overdue) + c.v(`arrearsMissed${j}`) > 1e-9 ? c.lag(`distressAge${j}`) + c.dt : 0,
      concepts: ['minsky-instability'],
      explain: { what: `Years ${what(j)} have continuously missed contracted business service.`, rule: 'The clock increases while current interest, performing maturity or the old arrears-workout instalment is missed. It resets when all three are met; repayment of old arrears continues through its declared workout.' },
    },
    {
      id: `loanWriteoff${j}`, target: `loanWriteoff${j}`, category: 'CONTRACT', inputs: [`distressAge${j}`, recovery], params: ['fragilityDefaultDelay', 'fragilityWriteoffSpeed'], stocks: [['businessArrears', j]],
      compute: (c) => c.v(`distressAge${j}`) + 1e-12 >= c.p('fragilityDefaultDelay') ? Math.min(positive(c.stock('businessArrears', j) / c.dt - c.v(recovery)), c.p('fragilityWriteoffSpeed') * c.stock('businessArrears', j)) : 0,
      regime: (c, v) => v > 1e-9 ? 'Persistent default: bank recognises unrecovered loss' : null,
      concepts: ['bank-capital', 'minsky-instability'],
      explain: { what: `Unrecoverable overdue claims on ${what(j)} banks write off.`, rule: 'After the assumed default delay, a share of existing arrears is written off, excluding amounts recovered this step. The write-off reduces the bank asset and borrower liability once, through the other-changes account.' },
    },
  ];
}

function aggregateRules(source: Map<Id, RuleDef>): RuleDef[] {
  const get = (id: Id) => source.get(id)!;
  const equity = get('bankEquity'), rwa = get('riskWeightedAssets'), profit = get('bankProfit'), dividend = get('bankDividends');
  const sumRule = (id: Id, inputs: Id[], description: string): RuleDef => ({ id, target: id, category: 'IDENTITY', inputs, terms: inputs.map((x) => ({ id: x, label: x, compute: (c: Ctx) => c.v(x) })), explain: { what: description, rule: 'Sum of the six borrower-sector amounts. Flows are annual rates; amounts paid in a kernel step are these rates multiplied by the step length.' } });
  return [
    replacement(equity, {
      ...equity, stocks: [...(equity.stocks ?? []), ['businessArrears', 'B']],
      terms: [...(equity.terms ?? []), { id: 'arrears', label: 'Overdue business claims', concept: 'bank-capital', compute: (c) => c.stock('businessArrears', 'B') }],
      explain: { what: equity.explain.what, rule: `${equity.explain.rule} Outstanding overdue business claims are also bank assets. Reclassifying a loan is not a loss; writing it off reduces equity.` },
    }),
    replacement(rwa, {
      ...rwa, params: [...(rwa.params ?? []), 'fragilityArrearsWeight'], stocks: [...(rwa.stocks ?? []), ['businessArrears', 'B']],
      terms: [...(rwa.terms ?? []), { id: 'arrears', label: 'Overdue claims × risk weight', concept: 'bank-capital', compute: (c) => c.p('fragilityArrearsWeight') * c.stock('businessArrears', 'B') }],
      explain: { what: rwa.explain.what, rule: `${rwa.explain.rule} Arrears carry their separately declared, higher risk weight.` },
    }),
    replacement(profit, {
      ...profit, inputs: [...(profit.inputs ?? []), ...ids('interestUnpaid')],
      terms: [...(profit.terms ?? []), { id: 'accruedInterest', label: 'Interest earned but not paid', concept: 'accrual-vs-cash', compute: (c) => add(ids('interestUnpaid').map((x) => c.v(x))) }],
      explain: { what: profit.explain.what, rule: `${profit.explain.rule} Contracted unpaid business interest is accrued income. Later arrears recovery is principal repayment; write-offs are recognised separately as losses in net worth.` },
    }),
    replacement(dividend, {
      ...dividend, adjust: undefined,
      lagInputs: [...new Set([...(dividend.lagInputs ?? []), ...(dividend.adjust ? [dividend.target] : [])])],
      terms: undefined, combine: undefined, compute: (c) => positive(evaluate(dividend, c)),
      regime: (c, v) => v === 0 && evaluate(dividend, c) < 0 ? 'Capital shortfall: bank payouts stopped' : null,
      explain: { what: dividend.explain.what, rule: `${dividend.explain.rule} Payouts cannot become an automatic, unbounded owner recapitalisation: when the calculated payout is negative, banks retain all earnings and ration credit.` },
    }),
    {
      id: 'creditRequestedNewTotal', target: 'creditRequestedNewTotal', category: 'IDENTITY', inputs: [...ids('creditRequested'), ...ids('principalMaturity')],
      compute: (c) => add(FIRMS.map((j) => positive(c.v(`creditRequested${j}`) - c.v(`principalMaturity${j}`)))),
      explain: { what: 'Requested additional business credit, excluding gross rollovers.', rule: 'Sum of each sector’s gross request above its principal maturity.' },
    },
    {
      id: 'creditCapitalCapacity', target: 'creditCapitalCapacity', category: 'BEHAVIOUR', inputs: ['bankEquity', 'riskWeightedAssets', 'lenderConfidence'], params: ['kapMin', 'rwL', 'fragilityCapitalCushion', 'fragilityRiskCapitalRelief'],
      compute: (c) => positive(c.v('bankEquity') / (c.p('kapMin') + positive(c.p('fragilityCapitalCushion') - c.p('fragilityRiskCapitalRelief') * c.v('lenderConfidence'))) - c.v('riskWeightedAssets')) / Math.max(1e-9, c.p('rwL')) / c.dt,
      concepts: ['bank-capital', 'minsky-instability'],
      explain: { what: 'Additional business lending current bank capital can support, at an annual issuance rate.', rule: 'Capital headroom = equity ÷ required capital ratio − risk-weighted assets, divided by the business-loan risk weight and the step length. Negative headroom permits no additional credit.' },
    },
    {
      id: 'creditCapitalShortfall', target: 'creditCapitalShortfall', category: 'IDENTITY', inputs: ['bankEquity', 'riskWeightedAssets', 'lenderConfidence'], params: ['kapMin', 'fragilityCapitalCushion', 'fragilityRiskCapitalRelief'],
      compute: (c) => positive((c.p('kapMin') + positive(c.p('fragilityCapitalCushion') - c.p('fragilityRiskCapitalRelief') * c.v('lenderConfidence'))) * c.v('riskWeightedAssets') - c.v('bankEquity')),
      concepts: ['bank-capital'],
      explain: { what: 'Bank equity missing from the capital requirement for additional business credit, as a stock amount.', rule: 'Required equity under the current credit standard minus actual bank equity, floored at zero. It closes new-credit capacity until retained earnings or smaller risk-weighted assets rebuild headroom.' },
    },
    {
      id: 'lenderConfidence', target: 'lenderConfidence', category: 'BEHAVIOUR', lagInputs: ['lenderConfidence', ...ids('cashServiceCoverage'), ...ids('loanWriteoff')], params: ['fragilityRiskSpeed'], stocks: FIRMS.flatMap(debtStocks),
      compute: (c) => {
        const weights = FIRMS.map((j) => totalDebt(c, j));
        const normal = add(FIRMS.map((j, k) => weights[k] * c.base(`cashServiceCoverage${j}`))) / Math.max(1e-9, add(weights));
        const actual = add(FIRMS.map((j, k) => weights[k] * lastMonth(c, `cashServiceCoverage${j}`))) / Math.max(1e-9, add(weights));
        const target = Math.max(-1, Math.min(1, (actual - normal) / Math.max(0.25, Math.abs(normal)) - add(ids('loanWriteoff').map((x) => lastMonth(c, x))) / Math.max(1e-9, add(weights))));
        return c.lag('lenderConfidence') + gapShare(c.p('fragilityRiskSpeed'), c.dt) * ((Math.abs(target) < 1e-12 ? 0 : target) - c.lag('lenderConfidence'));
      },
      concepts: ['minsky-instability'],
      explain: { what: 'Endogenous lender confidence: −1 cautious, 0 neutral, +1 confident.', rule: 'Persistent debt-weighted cash-service improvement over the solved starting coverage raises confidence; weak coverage and loan write-offs lower it. Confidence gradually changes credit standards, not the user’s lending-appetite lever. Quiet starting conditions remain neutral.' },
    },
    sumRule('businessCreditRequested', ids('creditRequested'), 'Gross business credit and refinancing requested'),
    sumRule('businessCreditApproved', ids('creditApproved'), 'Gross business credit and refinancing approved'),
    sumRule('businessCreditDenied', ids('creditDenied'), 'Gross requested business credit denied'),
    sumRule('businessRefinancingDenied', ids('refinancingDenied'), 'Requested principal refinancing denied'),
    sumRule('businessPrincipalMaturity', ids('principalMaturity'), 'Contractual gross business principal maturities'),
    sumRule('businessLoanLosses', ids('loanWriteoff'), 'Recognised business loan write-offs'),
    sumRule('businessArrearsRecovery', ids('arrearsRecovery'), 'Cash recoveries of overdue business claims'),
    ...(['hedge', 'speculative', 'ponzi'] as const).map((kind): RuleDef => ({
      id: `${kind}DebtShare`, target: `${kind}DebtShare`, category: 'IDENTITY', inputs: [...ids('cashServiceCoverage'), ...ids('operatingCash'), ...ids('interestDue')], stocks: FIRMS.flatMap(debtStocks),
      compute: (c) => {
        const is = (j: Firm) => {
          const ebit = c.v(`operatingCash${j}`);
          const p = ebit + 1e-9 < c.v(`interestDue${j}`);
          const h = c.v(`cashServiceCoverage${j}`) >= 1 - 1e-9;
          return kind === 'ponzi' ? p : kind === 'hedge' ? !p && h : !p && !h;
        };
        return add(FIRMS.map((j) => is(j) ? totalDebt(c, j) : 0)) / Math.max(1e-9, add(FIRMS.map((j) => totalDebt(c, j))));
      },
      concepts: ['minsky-instability'],
      explain: { what: `${kind === 'hedge' ? 'Hedge' : kind === 'ponzi' ? 'Ponzi' : 'Speculative'} financing share of business debt, using aggregate sector cash earnings.`, rule: 'Hedge earnings cover contracted interest, performing principal maturity and the arrears-workout instalment; speculative earnings cover interest but need principal financing; Ponzi earnings do not cover interest. Six sector averages can conceal differences among individual firms; these are debt-weighted sector classifications, not firm counts.' },
    })),
  ];
}

/** If imported and domestic materials cost more than sales, zero jobs alone cannot balance cash.
 * A firm can operate that loss-making production only while its cash and approved funding last.
 * Revenue and both input lines continue to use the same funded physical export volume. */
function fundedProductionRules(source: Map<Id, RuleDef>): RuleDef[] {
  return EXPORTERS.map((j) => {
    const volume = `exportVolume${EXPORT_OF[j]}`;
    const r = source.get(volume)!;
    const revenue = source.get(`exports${EXPORT_OF[j]}`)!;
    const imports = source.get(`imports${j}`)!;
    const domestic = source.get(`exporterInputs${j}`)!;
    const dependencies = [r, revenue, imports, domestic];
    return replacement(r, {
      category: 'BEHAVIOUR',
      owners: [j],
      inputs: [...new Set([...dependencies.flatMap((x) => x.inputs ?? []).filter((id) => id !== volume), `ownerSupport${j}`, `creditApproved${j}`, `depositInterest${j}`, `corporateTax${j}`, ...(j === 'XF' ? ['fishingFee'] : [])])],
      lagInputs: [...new Set(dependencies.flatMap((x) => [...(x.lagInputs ?? []), ...(x.adjust ? [x.target] : [])]))],
      params: [...new Set(dependencies.flatMap((x) => [...(x.params ?? []), ...(typeof x.adjust?.speed === 'string' ? [x.adjust.speed] : [])]))],
      stocks: [...dependencies.flatMap((x) => x.stocks ?? []), ['deposits', j]],
      terms: terms(
        ['desired', 'Demanded exports before funding limits', 'export-sectors', (c) => positive(evaluate(r, c))],
        ['funded', 'Materials that cash and approved credit can fund', 'minsky-instability', (c) => {
          const unit: Ctx = { ...c, v: (id) => id === volume ? 1 : c.v(id) };
          const margin = evaluate(revenue, unit) - evaluate(imports, unit) - evaluate(domestic, unit);
          const desired = positive(evaluate(r, c));
          if (margin >= 0) return desired;
          const available = c.stock('deposits', j) / c.dt + c.v(`ownerSupport${j}`) + c.v(`creditApproved${j}`) + c.v(`depositInterest${j}`) - c.v(`corporateTax${j}`) - (j === 'XF' ? c.v('fishingFee') : 0);
          return Math.min(desired, positive(available) / -margin);
        }],
      ),
      combine: (t) => Math.min(t.desired, t.funded),
      regime: (_c, v, t) => v < t.desired - 1e-9 ? 'Loss-making materials unfunded: production curtailed' : null,
      concepts: ['minsky-instability', 'export-sectors'],
      explain: { what: `Exports ${what(j)} can actually produce and finance.`, rule: `${r.explain.rule} When materials cost more than sales even before wages, production is additionally capped by deposits, actual owner support and approved credit. Sales and both imported and domestic inputs all follow this same funded physical volume.` },
    });
  });
}

function indicators(): IndicatorDef[] {
  const ratio = (id: string, label: string): IndicatorDef => ({ id, label, group: 'Financial stability', unit: '%', compute: (c) => c.v(id) * 100, display: 'level', level: { kind: 'ratio', unit: '%', nominal: (c) => c.v(id) * 100, real: (c) => c.v(id) * 100 }, description: 'Actual debt-weighted classification of six aggregate borrower sectors. Service includes contracted interest, performing maturity and the declared arrears-workout instalment; this is not a distribution or count of individual firms.', drivers: [id], concepts: ['minsky-instability'] });
  // one model unit is 1% of 2025 nominal GDP, ISK 49.41211 bn: a fixed unit, never an anchor value
  const isk = (c: Pick<Ctx, 'v' | 'stock'>, id: string) => ((id === 'businessArrearsAmount' ? c.stock('businessArrears', 'B') : c.v(id)) * GDP_BN) / 100;
  const money = (id: string, label: string, stock = false): IndicatorDef => ({
    id, label, group: 'Financial stability', unit: stock ? 'bn ISK' : 'bn ISK a year', display: 'level', compute: (c) => isk(c, id),
    level: { kind: 'amount', unit: stock ? 'bn ISK' : 'bn ISK a year', realUnit: stock ? 'bn ISK at baseline prices' : 'bn ISK a year at baseline prices', nominal: (c) => isk(c, id), real: (c) => isk(c, id) / c.v('cpi') },
    description: `${label}. ${stock ? 'Outstanding stock.' : 'Annual flow rate; actual monthly amounts divide by twelve.'} One model unit is 1% of 2025 nominal GDP, ISK 49.41211 bn.`, drivers: id === 'businessArrearsAmount' ? ids('principalOverdue') : [id], concepts: ['minsky-instability'],
  });
  return [money('businessCreditRequested', 'Business credit requested (gross)'), money('businessCreditApproved', 'Business credit approved (gross)'), money('businessCreditDenied', 'Business credit refused (gross)'), money('businessRefinancingDenied', 'Principal refinancing refused'), money('businessPrincipalMaturity', 'Business principal coming due'), money('businessArrearsAmount', 'Overdue business debt', true), money('businessLoanLosses', 'Bank business loan write-offs'), money('businessArrearsRecovery', 'Business arrears recovered'), money('creditCapitalShortfall', 'Bank business-credit capital shortfall', true), ratio('hedgeDebtShare', 'Hedge financing (sector debt share)'), ratio('speculativeDebtShare', 'Speculative financing (sector debt share)'), ratio('ponziDebtShare', 'Ponzi financing (sector debt share)'), {
    id: 'lenderConfidence', label: 'Lender confidence', group: 'Financial stability', unit: 'index (−1 to +1)', display: 'level', compute: (c) => c.v('lenderConfidence'), level: { kind: 'index', unit: 'index (−1 to +1)', nominal: (c) => c.v('lenderConfidence'), real: (c) => c.v('lenderConfidence') }, description: 'Lenders gradually loosen or tighten credit standards after good cash-service conditions or losses. It is separate from the user’s lending-appetite setting.', drivers: ['lenderConfidence'], concepts: ['minsky-instability'],
  }];
}

/** Build the optional module against the model's effective rules. */
export function createFinancialFragility(model: ModelDef): ModuleDef {
  const source = effectiveRules(model);
  const sourceVars = new Map(model.modules.flatMap((m) => m.vars ?? []).map((v) => [v.id, v]));
  const vars = FIRMS.flatMap((j): VarDef[] => [
    { ...sourceVars.get(`investment${j}`)!, id: `investmentDesired${j}`, label: `Desired investment, ${what(j)}` },
    { ...sourceVars.get(`employment${j}`)!, id: `employmentDesired${j}`, label: `Desired jobs, ${what(j)}` },
    variable(`dividendsDesired${j}`, `Requested owner payout, ${what(j)}`, 'flow', base(`dividends${j}`)),
    ...['operatingCash', 'interestDue', 'ownerSupport', 'creditDesiredNet', 'creditRequested', 'creditApproved', 'creditDenied', 'refinancingDenied', 'principalMaturity', 'cashForService', 'interestUnpaid', 'principalPaid', 'principalOverdue', 'performingReclassification', 'arrearsScheduled', 'arrearsRecovery', 'arrearsMissed', 'loanWriteoff'].map((k) => variable(`${k}${j}`, `${k}, ${what(j)}`)),
    variable(`cashServiceCoverage${j}`, `Cash-service coverage, ${what(j)}`, 'ratio'),
    variable(`distressAge${j}`, `Continuous missed service, ${what(j)}`, 'state'),
  ]);
  return {
    id: 'financial-fragility', label: 'Borrower financing and bank losses',
    description: 'Gross business maturities and constrained refinancing; funded investment and jobs; accrued unpaid service, recovery and loan write-offs; capital contraction and changing lender confidence. An optional teaching mechanism, not an Iceland default forecast.',
    requires: ['structure', 'firms', 'banks', 'labour-and-wages'], params,
    instruments: [{ id: 'businessArrears', label: 'Overdue business loans and interest', kind: 'financial', issuers: [...FIRMS], holders: ['B'], valuation: 'nominal', description: 'Bank-held overdue principal and capitalised unpaid business interest. Principal reclassification leaves total debt and equity unchanged; recoveries destroy deposits and retire claims, while write-offs reduce bank equity.' }],
    vars: [...vars, ...['creditRequestedNewTotal', 'creditCapitalCapacity', 'businessCreditRequested', 'businessCreditApproved', 'businessCreditDenied', 'businessRefinancingDenied', 'businessPrincipalMaturity', 'businessLoanLosses', 'businessArrearsRecovery'].map((id) => variable(id, id)), { ...variable('creditCapitalShortfall', 'Bank business-credit capital shortfall'), kind: 'quantity', unit: '% of baseline GDP' }, ...['hedgeDebtShare', 'speculativeDebtShare', 'ponziDebtShare'].map((id) => variable(id, id, 'ratio')), variable('lenderConfidence', 'Lender confidence', 'index')],
    rules: [...FIRMS.flatMap((j) => borrowerRules(j, source, model.modules.flatMap((m) => m.flows ?? []).flatMap((f) => {
      if (f.kind !== 'cash' || f.id === 'dividends' || f.id === 'loanInterest') return [];
      if (f.posting.type === 'transfer') return f.legs.filter((l) => l.from !== l.to && (l.from === j || l.to === j)).map((l) => ({ amount: l.amount, sign: l.to === j ? 1 : -1 }));
      if (f.posting.type === 'purchase') return f.legs.filter((l) => l.to === j && l.from !== j).map((l) => ({ amount: l.amount, sign: 1 }));
      return [];
    })).map((r) => ({ ...r, owners: r.target === `creditApproved${j}` ? ['B', j] : [j] }))), ...aggregateRules(source), ...fundedProductionRules(source), ...FIRMS.map((j) => {
      const r = source.get(`investmentPlan${j}`)!;
      return replacement(r, { ...r, stocks: [...(r.stocks ?? []), ['businessArrears', j]], terms: r.terms?.map((t) => ({ ...t, compute: (c) => t.compute(includeArrears(c)) })), compute: r.compute ? (c) => r.compute!(includeArrears(c)) : undefined, combine: r.combine ? (ts, c) => r.combine!(ts, includeArrears(c)) : undefined, explain: { what: r.explain.what, rule: `${r.explain.rule} Overdue business loans also count in the debt burden.` } });
    })],
    flows: [
      { id: 'businessGrossLending', label: 'Approved business loans and refinancing', kind: 'cash', account: 'financial', posting: { type: 'issue', instrument: 'businessLoans' }, legs: FIRMS.map((j) => ({ from: 'B', to: j, amount: `creditApproved${j}` })), concepts: ['endogenous-money'], explain: { what: 'Each approved gross loan creates a deposit and a performing loan. Refinanced principal is separately redeemed, so unchanged net credit does not hide gross funding needs.' } },
      { id: 'businessPrincipalRepayment', label: 'Performing business principal repaid', kind: 'cash', account: 'financial', posting: { type: 'redeem', instrument: 'businessLoans' }, legs: FIRMS.map((j) => ({ from: j, to: 'B', amount: `principalPaid${j}` })), concepts: ['money-destruction'], explain: { what: 'Borrowers pay principal from deposits; the performing bank claim and deposits are reduced.' } },
      { id: 'businessPerformingReclassification', label: 'Matured principal leaves performing loans', kind: 'accrual', account: 'capital', posting: { type: 'accrue', instrument: 'businessLoans' }, legs: FIRMS.map((j) => ({ from: j, to: 'B', amount: `performingReclassification${j}` })), concepts: ['accrual-vs-cash'], explain: { what: 'The negative performing-loan accrual is exactly offset by the positive overdue-principal accrual: no cash, no net income, no loss.' } },
      { id: 'businessPrincipalArrears', label: 'Matured principal enters arrears', kind: 'accrual', account: 'capital', posting: { type: 'accrue', instrument: 'businessArrears' }, legs: FIRMS.map((j) => ({ from: j, to: 'B', amount: `principalOverdue${j}` })), concepts: ['accrual-vs-cash'], explain: { what: 'The matching principal reclassification into arrears; the firm owes the same total principal and the bank owns the same total claim.' } },
      { id: 'businessInterestArrears', label: 'Unpaid business interest accrued', kind: 'accrual', account: 'current', posting: { type: 'accrue', instrument: 'businessArrears' }, legs: FIRMS.map((j) => ({ from: j, to: 'B', amount: `interestUnpaid${j}` })), concepts: ['accrual-vs-cash'], explain: { what: 'Unpaid contracted interest remains borrower expense and lender income, and is added to overdue debt. No cash is invented.' } },
      { id: 'businessArrearsRepayment', label: 'Business arrears recovered', kind: 'cash', account: 'financial', posting: { type: 'redeem', instrument: 'businessArrears' }, legs: FIRMS.map((j) => ({ from: j, to: 'B', amount: `arrearsRecovery${j}` })), concepts: ['money-destruction'], explain: { what: 'Cash recovery retires the overdue claim and deposits. The income was already recognised when interest accrued; it is not recognised again.' } },
      { id: 'businessLoanWriteoff', label: 'Unrecoverable business loans written off', kind: 'writeoff', account: 'other', posting: { type: 'writeoff', instrument: 'businessArrears' }, legs: FIRMS.map((j) => ({ from: 'B', to: j, amount: `loanWriteoff${j}` })), concepts: ['bank-capital', 'minsky-instability'], explain: { what: 'A recognised loan loss removes the bank claim and borrower liability once. Bank equity falls; the borrower has debt relief. No cash changes hands.' } },
    ], indicators: indicators(),
  };
}

/** Narrow model clone: the original net-credit posting is replaced by this module's gross legs. */
export function withFinancialFragility(model: ModelDef): ModelDef {
  if (model.modules.some((m) => m.id === 'financial-fragility')) return model;
  const module = createFinancialFragility(model);
  const old = model.modules.flatMap((m) => m.flows ?? []).filter((f) => f.id === 'businessBorrowing');
  if (old.length !== 1) throw new Error('Financial fragility requires exactly one original businessBorrowing posting');
  const solve = model.steadyState.solve;
  return { ...model,
    steadyState: { ...model.steadyState, ...(solve ? { solve: (p: Record<Id, number>) => {
      const out = solve(p);
      const seeded: Record<Id, number> = { ...out.vars, lenderConfidence: 0 };
      for (const j of FIRMS) {
        const loan = out.stocks.find(([i, pl]) => i === 'businessLoans' && pl === j)?.[2] ?? 0;
        const loanInterest = (out.vars.loanRate ?? p.keyRate0 + p.sL) * loan;
        const matures = loan / p.fragilityMaturityYears;
        const operating = (1 - p.tauF) * out.vars[`profits${j}`] + loanInterest - (j === 'FC' ? out.vars[`investment${j}`] : 0);
        seeded[`investmentDesired${j}`] = out.vars[`investment${j}`] ?? base(`investment${j}`);
        seeded[`employmentDesired${j}`] = out.vars[`employment${j}`] ?? base(`employment${j}`);
        seeded[`dividendsDesired${j}`] = out.vars[`dividends${j}`] ?? base(`dividends${j}`);
        seeded[`cashServiceCoverage${j}`] = operating / Math.max(1e-9, loanInterest + matures);
        seeded[`principalMaturity${j}`] = matures;
        seeded[`principalPaid${j}`] = matures;
        seeded[`interestDue${j}`] = loanInterest;
        seeded[`creditRequested${j}`] = matures;
        seeded[`creditApproved${j}`] = matures;
        seeded[`operatingCash${j}`] = operating;
      }
      return { ...out, vars: seeded };
    } } : {}) },
    modules: [...model.modules.map((m) => (m.flows ?? []).some((f) => f.id === 'businessBorrowing') ? { ...m, flows: m.flows!.filter((f) => f.id !== 'businessBorrowing') } : m), module],
  };
}
