# 0006. Household spending is deflated without housing; the rule's output-gap weight is Taylor's

Status: accepted (September 2026). Implemented in commit 1cc6c66 (audit H4).

## The problem

Engine v1 turned household spending into a volume by dividing it by the CPI (v1 SPEC equation E38, real consumption `c = C/P`), and the port kept that. But 24.5 points of the Iceland CPI are housing, and in the model housing costs follow house prices. Most of that part (20.9 of the 24.5) is owner-occupiers' imputed rent: what they would pay to rent their own homes, which nobody pays in cash. Household spending itself is a cash flow set by the consumption function, and it does not change when house prices do.

So a rise in house prices raised the CPI, and the model read it as households buying less. Output starts from real consumption, so output, retail and services, jobs and the output gap all followed a signal that no one had spent. Builders' repair sales were divided by the CPI in the same way. In the rate experiment, falling house prices after a rate rise showed up as a false early recovery in real spending.

## The decision

**A consumption deflator: the CPI without its housing part.** A new variable, `consumptionDeflator` ("Prices of what households pay for", `prices.ts`):

> deflator = VAT factor × (omD × domestic prices + omM × import prices) ÷ (omD + omM)

It is 1 at baseline and rises one for one with a general rise in prices, so under trend inflation it adds no false growth. It is used in:

- **real consumption:** `realConsumption = consumption ÷ consumptionDeflator` (households.ts). This is v1's E38 with a different price index. The import volumes that read real consumption follow it;
- **the consumption function's price-scaled terms:** autonomous spending (`c0 × deflator`), the savings anchor (`deflator × LW0`) and housing wealth (`× deflator`). About 29% of baseline spending comes from these terms; with the full CPI they would have moved with house prices in nominal terms while their deflator did not, leaving the same distortion in mirror image.

**Builders' repairs are deflated by domestic prices.** `salesFC`'s repairs term divides household repair spending, already net of VAT, by domestic prices, because builders are domestic producers.

**The full CPI stays everywhere else:** indexation of CPI-linked mortgages and bonds, measured inflation, expectations, wage bargaining, real incomes (`realDisposableIncome`, which drives house prices), profit smoothing and the central bank's rule. Those are about the index people and contracts actually use.

**Considered and not done.** The audit's reviewer preferred a deflator that keeps actual rents (3.6 of the 24.5 points, paid in cash) at housing costs and lets imputed rent follow goods prices; dropping all housing, as here, was accepted as the simpler version, and the rent weights are not yet parameters. Paying imputed rent to retail and service firms in cash (the audit's option (b)) was rejected: it would inflate their taxed profit, investment and dividends. The start-from-today work (design/start-from-today.md) must re-anchor month-0 real consumption with this deflator, since at the start it will not equal the CPI.

## The key-rate rule's output-gap weight: aY from 0.6 to 1.0

With the false recovery gone, the output trough in v1's rate-shock scenario (a 1 pp offset on the rule for 8 quarters) moved to the last quarter of the offset, quarter 8, outside `rate-output-timing`'s range of 4–7. The consumption-function parameters betaC and betaRI, which the audit suggested re-tuning, move the depth of the trough, not its timing. A stronger response of the key rate to the output gap does move the timing: `aY` was raised from v1's 0.6 to 1.0, the weight on the output gap in Taylor's (1999) balanced rule.

Since then the rate checks run the CBI QMM experiment instead (the key rate held 1 pp above baseline for four quarters, then the rule; audit M12/M20), and under it 0.6 and 1.0 both keep every rate check in range. No calibration check selects 1.0, so its provenance is `assumed` (Taylor 1999), not `calibrated` (AGENTS.md rule 5). It stays at 1.0 because it is the literature's value and every check passes with it.

## What moved

All 29 calibration checks pass before and after. The moves in commit 1cc6c66, under the scenarios of that time (before → after):

| Check | Before | After |
|---|---|---|
| rate-output-trough | −0.332 | −0.347 |
| rate-output-timing | 6 | 6 |
| rate-inflation-trough | −0.315 | −0.301 |
| wage-price-level-6y | 3.118 | 3.308 |
| wage-back-output | 0.156 | 0.213 |
| fiscal-output-year1 | 0.717 | 0.670 |
| manual-tax-output | −0.357 | −0.405 |
| krona-price-level-8q | 1.752 | 1.617 |
| tourism-slump | −7.144 | −7.373 |
| world-prices-krona-year1 | 1.446 | 1.641 |

Every scenario golden moved. The rate checks were later re-based on the QMM experiment (audit M12/M20); `reports/harness-iceland.md` has the current values.
