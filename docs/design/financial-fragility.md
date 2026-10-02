# Borrower financing and financial instability

The optional `withFinancialFragility(model)` transformation makes refinancing, missed obligations,
loan recovery and bank losses executable. The original `icelandModel` remains the stationary
control. The application composes this layer **after** growth, so actual growing investment,
employment and export production remain subject to funding limits. Opening portfolios still come
from the solved stationary calibration; this is a teaching transition, not observed Iceland today.

Minsky distinguishes borrowers whose operating cash covers all contracted service, borrowers who
must refinance principal, and borrowers whose operating cash cannot cover interest. He also
describes prosperity encouraging weaker financing standards. This module implements a limited
aggregate version of those mechanisms. See his primary account, [The Financial Instability
Hypothesis, Working Paper 74 (1992), pp. 6–8](https://www.levyinstitute.org/pubs/wp74.pdf).

## Cash and gross financing

For each of the six firm sectors, `operatingCash<sector>` sums actual declared cash receipts less
operating cash payments and taxes. It excludes business interest, owner transfers, new loans,
repayments and non-cash accruals. Builders collect cash for investment goods sold to other sectors;
building their own capital settles no cash. Book profit and operating cash are separate measures.

Performing principal comes due continuously at `businessLoans / fragilityMaturityYears`. The
parameter is an explicit assumed contractual life, **not** the Treasury maturity strategy or a
measured Icelandic business-loan average. A quiet firm can therefore refinance gross principal
while net borrowing and its loan stock remain unchanged.

`creditRequested<sector>` combines that maturity with the existing requested cash budget, using
desired investment and payouts. `creditApproved<sector>` is bounded by lender capital, collateral
and last month's cash-service coverage. Capital headroom is based on actual equity and
risk-weighted assets; arrears enter both, with a separately declared risk weight. The collateral
proxy is capital at book value multiplied by the real house-price index. It is an assumed business
collateral proxy, not a measured commercial-property valuation. Banks can roll existing principal
above their minimum capital ratio, while extra credit requires the additional cushion. All capacity
amounts are converted from stocks into annual issuance rates by dividing by the kernel step.

Cash buffers and the existing bounded negative-dividend owner support remain available. Support
is a transfer of owners' existing money; it does not automatically create credit. Operating payments
come first. Exhausted cash cuts funded jobs. Remaining cash pays contracted interest, performing
principal, the arrears-workout instalment, actual investment, then positive owner payouts. Denied
credit can postpone real purchases rather than produce a negative deposit balance. Builders' own
capital construction is exempt from a cash-purchase limit; their materials and wages still cost cash.

When an exporter's material inputs cost more than sales even before wages, zero jobs would not
make its cash budget feasible. Funded production then limits the common physical volume used by
export receipts, imported inputs and domestic inputs. This preserves each line's actual receipt and
input prices. The layer does not substitute CPI for trade deflators or add GDP credit by hand.

## Arrears, recovery and losses

`businessArrears` is a bank asset and borrower liability. Every change is a ledger posting:

| Event | Performing loan | Arrears | Cash | Recognised income / net worth |
| --- | --- | --- | --- | --- |
| Approved gross loan | increases | unchanged | deposit created | no income |
| Cash principal payment | decreases | unchanged | deposit cancelled | no income |
| Missed principal maturity | decreases | increases equally | none | paired accruals offset to zero income |
| Unpaid contracted interest | unchanged | increases | none | expense for firm, income for bank |
| Arrears recovery | unchanged | decreases | deposit cancelled | no second income or expense |
| Unrecoverable claim written off | unchanged | decreases | none | bank net worth falls; borrower gets debt relief once |

`interestDue = loanInterest + interestUnpaid`. Firm profits and corporate tax retain the full
contracted interest expense; bank profit retains paid plus accrued interest income. Recovering
that accrued claim is principal repayment. Write-offs use the other-changes account, rather than
subtracting the same loss again from bank profit. Arrears remain in investment/payout debt burdens.

The assumed workout instalment is `arrearsScheduled = min(arrears / step,
fragilityRecoverySpeed × arrears)`. Actual recovery cannot exceed spare cash or the claim.
`arrearsMissed` records a missed old-claim instalment without creating another claim. The
`distressAge` clock continues while interest, performing maturity or this instalment is missed,
and resets only when all three are met. After the assumed delay, unrecovered old claims are written
off at the assumed speed. Claims recovered in the same step cannot also be written off.

Banks stop dividends at zero when capital is short. They retain earnings and restrict credit;
negative bank dividends do not invoke an unlimited automatic recapitalisation by households or
pension funds. Losses reduce bank equity once and can reduce subsequent lending capacity.

## Diagnostics and scope

`cashServiceCoverage` divides operating cash by interest due plus performing maturity plus the
arrears-workout instalment. Hedge earnings cover this service; speculative earnings cover interest
but need principal financing; Ponzi earnings cannot cover interest. `hedgeDebtShare`,
`speculativeDebtShare` and `ponziDebtShare` partition outstanding performing and overdue business
debt across **six sector averages**. They are not firm counts or an observed distribution, and
cash buffers or owner support can prevent an aggregate Ponzi sector from immediately defaulting.

`lenderConfidence` gradually follows recent cash-service improvement relative to solved opening
coverage and actual loan losses. Confident lenders lower the extra capital cushion and lift the
collateral advance. The minimum capital ratio still binds. The existing lending-appetite lever
retains its user setting and semantics. Neutral quiet conditions leave confidence at zero.

There are no borrower loan cohorts, individual default probabilities, household mortgage defaults,
bank funding runs, market-priced share claims or forced asset fire sales in this layer. Funded jobs
are cut rather than accruing unpaid wages. Loss/recovery timing, collateral advances and lender
confidence speeds are visible assumptions, not estimates of Icelandic default behaviour.

## Verification

`tests/models/iceland-fragility.test.ts` checks immutable composition, all original quiet variables
and positions for 240 months, gross rollovers, cash/recognised-income reconciliation, both sides of
each write-off, recovery, lender-capital effects, cash classifications, real trade-price identities,
the former long-horizon exporter cash breach, and reset/seek/load/fork/reporting purity.

The independent `tests/models/iceland-growth-crisis-integration.test.ts` audits raw ledger arrays,
cash availability, all positions and physical-capital installation at each substep. Its scenarios
include 1,200 quiet growing months, 240 months of rate/tourism shocks, severe collateral/default
stress, same-month reference reporting, deterministic replay and multiple substep counts.

Run both focused suites and `bun run typecheck`. The original model's full tests, harness and lever
reports remain separate regression gates; an evolving reference is not claimed to be a fixed point.
