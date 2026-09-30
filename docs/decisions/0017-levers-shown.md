# 0017. Fewer levers in the panel: the main ones of each section

Status: accepted (September 2026).

## The request

The Iceland lever panel had 25 levers in seven sections. The owner asked for a few fewer, not a collapsed list: "Not collapsed … I'm just saying we can reduce the number of levers we show, just a bit. Keep the main ones for each category."

## The decision

**The panel keeps its shape.** The same sections in the same order, the same layout, the padlocks, the red suggestions with "Apply" and the note while every lever with a rule is locked. There is no drawer, no collapsed "more" section and no separate panel for shocks.

**Seven less central Iceland levers are kept off it**, so it shows 18 of 25. Each section keeps its main levers, and its most important lever comes first:

| Section | Shown, in order | Kept off the panel |
|---|---|---|
| Central bank | key rate | |
| Financial stability | debt-service cap | loan-to-value cap |
| Government | income tax, VAT, health, public investment, unemployment benefits, who buys new government bonds | education, other public services, old-age and disability transfers, family and housing benefits |
| Banks | lending appetite | |
| Labour market | wage settlement, net immigration | migration buffer |
| Pension funds | pension funds' foreign share | |
| World economy | tourism, world fish prices, króna sentiment shock, foreign demand, world prices, foreign interest rate | world aluminium price |

Why each one is off the panel:

- **Loan-to-value cap** (`ltvCap`). Like the debt-service cap, it limits new mortgages to borrowers, so it works through the same channel: less new mortgage credit, fewer new deposits and lower house prices (the lever report: at 50%, mortgage debt −6.6 points of GDP over months 6–240; the debt-service cap at −15 points of income, −4.3). The section keeps the debt-service cap to show that channel.
- **Migration buffer** (`migration`). It is not a policy or a shock. It sets how much of a change in jobs is met by people arriving or leaving, and on its own it changes nothing: the lever report runs it on top of a fall in foreign demand for that reason. Net immigration stays, as the shock to the labour force.
- **Education and other public services** (`education`, `otherServices`). They work like health spending: the state pays staff and buys goods and services. Health stays as the example of spending on public services, and public investment as the example of investment.
- **Old-age and disability transfers, family and housing benefits** (`oldAgeTransfers`, `familyBenefits`). They are payments from the state to households, which differ mainly in which age group receives them. Income tax and unemployment benefits stay to show taxes and transfers.
- **World aluminium price** (`aluminiumPrice`). The smelters' foreign owners take almost all of the extra profit (its definition), so little of the change reaches Iceland. World prices already move aluminium prices together with import and fish prices.

The reference economy keeps all five of its levers.

**Order.** The order of a section is the order in which the model declares its levers (unchanged: `leverSections`). The central bank's section has one lever, the Government section already began with income tax and VAT, and the Labour market section with the wage settlement. Only the World economy section is reordered: tourism, fish prices and the króna shock first, then foreign demand, world prices and the foreign rate, then aluminium (`src/models/iceland/modules/external.ts`).

## A hidden lever is still a lever

**It stays in the model.** `LeverDef.shown: false` changes only the lever panel. The engine, scenarios, share links, calibration, the harness (property runs, lever extremes, golden scenarios and expectations) and the lever report run every lever as before.

**Nothing acts unseen.** While a hidden lever is off its default, or while the scenario has an event for it, the panel shows it in its own place in its section. This covers a shared link, a scenario loaded from a file and a lever set back to its default by a later event. The lever keeps its info toggle, bar and "back to baseline" button. Resetting the scenario hides it again.

**What the compiler checks** (`src/core/compile.ts`):

- `shown` is true or false;
- a lever with a padlock (a stabiliser's lever) is always shown, because hiding it would hide its padlock and its rule's suggestions;
- every section keeps at least one lever shown, so hiding levers can trim a section but never remove it.

## Kernel contract (`src/core/types.ts`)

| Where | Change | Why |
|---|---|---|
| `LeverDef.shown?: boolean` | Additive. Absent or true: the lever is in the panel; false: only while it is off its default or the scenario moves it. The compiler's padlocks do not set it. | A model says which of its levers are central. The interface stays generic: it reads the flag and never names a lever. |

## What moved

- **No run of the model.** No calibration check, expectation, lever-extreme run or golden scenario other than the two below changed.
- **The all-levers golden scenarios** (`all-levers-unlocked`, `all-levers-locked`). They move every lever in turn, three months apart, in declaration order, so the new World economy order changes which lever moves in months 12–27. The paths are identical through month 12 and differ from month 13. Both files were regenerated.
- **The property runs** draw levers by their position in the list, so 40 different random scenarios run: 40 of 40 pass, and the largest residual is 1.33e-12 (was 1.42e-12).
- **The lever report** (`reports/levers/iceland.*`) lists the World economy levers in the new order. Every run, flag and expectation is otherwise identical.

## Alternatives considered

- **A collapsed "more levers" section, or a drawer.** The owner ruled this out ("Not collapsed").
- **Ordering in the interface**, such as a per-model list in `src/ui/`. That would break the rule that the interface never names a model's levers. Declaration order already sets the order.
- **An `order` field on levers.** This adds more metadata for something declaration order already does.
- **Removing the levers.** That would lose the scenarios, share links and expectations that use them.
