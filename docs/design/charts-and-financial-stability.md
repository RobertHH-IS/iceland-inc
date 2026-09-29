# Charts, levels and financial stability: design

Status: proposal, 29 September 2026. Nothing here is built yet.

Since [decision 0010](../decisions/0010-policy-padlocks.md), read *Manual* as "every policy lever locked" and *Automatic* as "every policy lever unlocked" (now the default); the offset levers and `keyRateFixed` (now `keyRate`) are gone.

Scope: the chart panel (`src/ui/views/Charts.tsx`, `ChartSvg.tsx`, `src/ui/model/charts.ts`), the indicator module (`src/models/iceland/modules/indicators.ts`) and the small engine and API changes they need. It assumes the separate change that starts Iceland Inc. from today's economy (2026 data, Hagstofa first) instead of a stylised steady state.

What the user asked for:

1. "The overview should include all the charts… we can include financial stability charts."
2. "The charts also need to show nominal change over time… maybe two axis chart?"
3. Iceland Inc. starts from today's values. The baseline becomes the **no-change path**: the economy from today with no lever moved. Charts show real-world **levels** over time (key rate 8.00%, inflation 5.6%, GDP in ISK bn), plus the effect of the user's levers against the no-change path.

This document reads "nominal change over time" as: show each measure as it actually is (rates in %, amounts in krónur at current prices, ratios as ratios), moving over time, not only as a deviation from a reference. Where a measure has a real (price-adjusted) and a nominal version, both are available, and nominal is the default.

---

## 0. Recommendations in brief

1. **One scrolling Overview** of all 64 charts in 8 sections with sticky sub-headings: Headline, Prices and rates, Spending and profits, Households, Money and credit, Financial stability, Government and the world, and Firms by sector. The old tabs become a section bar that scrolls to a section and highlights the one in view. They are no longer filters. There is one real filter: "Moved by your changes". Only visible charts re-render.
2. **No dual axis.** Every chart has two panels on one time axis:
   - a **level panel**, with the level as a solid line, the no-change path dashed on the same axis, and the gap shaded;
   - a thin **effect strip** underneath, showing the difference from the no-change path around its own zero line.

   A global switch offers "Levels and effect" (the default) or "Effect only", which is today's compact deviation view. A second switch sets how krónur are shown: at current prices (nominal, the default) or at start-month prices.
3. **14 financial-stability charts**, all computable from existing variables and stocks. Ten are new and four move in from other groups:
   - household debt to disposable income;
   - the debt-service ratio, and the debt-service ratio including indexation;
   - use of the debt-service cap;
   - house prices to income;
   - real house prices;
   - the indexed share of mortgages;
   - credit to GDP, with a gap measure;
   - the bank capital ratio;
   - government debt to GDP;
   - the net international investment position;
   - pension funds' foreign share;
   - FX reserves in months of imports;
   - the real króna.

   Each chart has declared reference lines, such as "cap binds", the banks' capital target and the inflation target.
4. **Every indicator declares a level unit**: % for rates, % of GDP for ratios, ISK bn (or ISK bn a year) for amounts, an index (start = 100) for prices, and thousands of people for counts. The model unit converts to ISK with one declared constant: ISK bn per 100 model units, currently `GDP_BN` = 4,941.211 (2025 nominal GDP, Hagstofa THJ01102).
5. **Engine:**
   - Indicator levels are already recorded. Expose them (`levels`).
   - Add a **no-change reference path**: a companion run with no lever events, advanced alongside the main run.
   - Measure every deviation, feed threshold and calibration check against that path instead of the constant steady-state baseline.
   - Extend `IndicatorDef` with `level`, `extras` and `thresholds`.
   - Add a trailing-12-month nominal GDP variable for stock ratios.
   - Add calendar dates, from a declared start month.
6. **Logic issues found** (section 8):
   - Deviations are measured against a constant baseline. This becomes wrong once the start is not a steady state, and three calibration measures have the same problem.
   - Three flows are labelled "% of GDP" but are % of *baseline* GDP.
   - Stock ratios use the current month's annualised GDP.
   - Pension payouts are about twice the data, which inflates older households' income.
   - Several descriptions assume zero inflation.

---

## 1. What the charts do today, and what breaks

- 51 indicators in 5 tabs: Overview (11), People (7), Money and credit (9), Government and world (7), and Firms by sector (17). Only the open tab renders.
- `IndicatorDef.compute` returns a **level** in model units. `display` turns it into a deviation from the **steady-state baseline**:
  - `deviation-pct`: (level ÷ base − 1) × 100;
  - `deviation-pp`: (level − base) × 100;
  - `deviation`: level − base.

  The engine computes `baseInd` once, from the solved baseline (`src/core/engine.ts`, `baseInd` in the constructor), and `series()` returns only display values. The raw levels already exist in `hInd` but are not exposed.
- Small multiples are 160 × 54 SVG sparklines over the last 72 months, with a zero line, a tone-coloured line and area, amber event marks and no axes. The inspector's chart (380 × 170) adds three y-ticks and "M0 … M120".

Once month 0 is today's economy (inflation 5.6%, key rate 8.00%), the no-change run moves on its own: inflation drifts, nominal GDP grows and debt ratios change. "Level minus the month-0 level" then mixes that drift with the effect of the user's levers. The reference must become a **path** (section 7.2).

---

## 2. Definitions used below

| Term | Meaning |
|---|---|
| **Start** | Month 0: today's economy (for example, September 2026) as calibrated from Hagstofa, the Central Bank of Iceland and others. The charts' time axis shows calendar months from here. |
| **No-change path** | The same model variant run from the same start with **no lever events**: every lever at its default. That means stabilisers on Manual, the key rate held at today's rate and fiscal settings held. Any exogenous paths the start calibration declares (world prices, agreed wage rises) are included. Label it "No change (today's policy held)". It is not a forecast. |
| **Level** | The indicator's value in real-world units: %, % of GDP, ISK bn, an index or people. |
| **Effect** | Level minus the no-change level in the same month: pp for rates and ratios, % for amounts and indices. This is the model's honest counterfactual (AGENTS.md rule 9): shocked minus unshocked, within the same variant. |
| **Ŷ** | ISK bn per 100 model money units. Model flows are "% of baseline annual GDP", so 1 model unit = Ŷ/100 ISK bn. Today Ŷ = `GDP_BN` = 4,941.211 (2025, Hagstofa THJ01102, `src/models/iceland/util.ts`). |

The start calibration should make 100 model units equal the **annualised nominal GDP at the start month**, so that price indices (1 at start) and the money unit describe the same moment. If it keeps 100 = 2025 GDP, the % of GDP readouts still hold (they divide by current nominal GDP). But "ISK bn at start prices" then mixes 2025 volumes with 2026 prices, and needs a correction factor declared next to Ŷ.

---

## 3. The Overview: every chart on one scrolling page

### 3.1 Sections and order

Each chart sits in exactly one section. The order follows the story a reader asks about: headline numbers, then prices, spending, people, money, risks, the state and the world, and sectors. Within a section, related charts sit side by side, so a row of four reads as one idea at the desktop width (4 columns at 190 px minimum).

| # | Section (Icelandic working title) | Charts, in order | Count |
|---|---|---|---|
| A | **Headline** (Helstu stærðir) | `nominalGdp`*, `output`, `inflation`, `keyRate`, `unemployment`, `housePrice`*, `krona`, `realWage` | 8 |
| B | **Prices and rates** (Verðlag og vextir) | `priceLevel`, `expInflation`, `mortgageRate`, `realMortgageRate`* | 4 |
| C | **Spending and profits** (Útgjöld og hagnaður) | `consumption`, `investment`, `profitsFD`, `profitsFX` | 4 |
| D | **Households** (Heimili) | `unemploymentY`, `unemploymentW`, `unemploymentO`, `rdiY`, `rdiW`, `rdiO` | 6 |
| E | **Money and credit** (Peningar og útlán) | `broadMoney`, `netMortgage`, `creditImpulse`, `creditImpulseTotal`, `mortgageDebt`, `pfAssets` | 6 |
| F | **Financial stability** (Fjármálastöðugleiki) | `hhDebtIncome`*, `debtService`*, `debtServiceIdx`*, `dstiUsage`*, `houseToIncome`*, `realHousePrice`, `indexedShare`*, `creditToGdp`*, `bankCapital`, `govDebt`, `niip`*, `pfForeignShare`, `reserveMonths`*, `realKrona`* | 14 |
| G | **Government and the world** (Ríkið og umheimurinn) | `govBalance`, `incomeTaxRate`, `currentAccount`, `dividendsAbroad`, `exports`, `imports` | 6 |
| H | **Firms by sector** (Atvinnugreinar) | one row per sector: [`exportsX·`], `profits·`, `jobs·` for FC, FR, XF, XA, XT, XO | 16 |

\* new. That makes 51 existing and 13 new charts, 64 in all. `realHousePrice`, `bankCapital`, `govDebt` and `pfForeignShare` move into F. `dividendsAbroad` moves into G. Sector charts are regrouped by sector rather than by measure, so reading across a row tells one sector's story. The two domestic sectors have no export chart, so their rows start with profits.

`IndicatorDef.group` keeps its meaning (it is now the section). A new optional `tags` field lets one chart match several filters later, such as `govDebt` in both Government and Financial stability, without drawing it twice.

### 3.2 Navigation, filters and sticky headings

- **Section bar** in the panel head, replacing the tab list: chips for A–H. Clicking a chip scrolls its section heading to the top. The chip of the section in view is highlighted by an IntersectionObserver scrollspy, with `aria-current="true"`. It is a `nav`, not a `tablist`, because nothing is hidden.
- **Sticky sub-headings** (`position: sticky; top: 0` inside `.panel-body.scroll`). Each shows:
  - the section name and its chart count;
  - a small amber or blue-grey dot when any chart in the section has moved beyond its "notable effect" size (section 4.4);
  - a chevron that collapses the section. Collapsed sections are remembered per viewer in `localStorage`, wrapped in try/catch. All sections start open.
- **One filter**, "Moved by your changes". It hides charts whose effect has stayed below the notable size since the first lever event. It is off by default, and disabled with a hint until a lever has moved. No other filters: the section bar already finds things.
- **Global switches** at the right of the panel head:
  - "Levels and effect" or "Effect only" (section 4);
  - "Krónur: current prices" or "Krónur: start prices", which affects only ISK charts.
- **One legend line** under the head, drawn once for all charts: solid "With your changes", dashed "No change (today's policy held)", the shaded "Difference", and the event mark.
- **Performance.** 64 charts at four ticks a second is too many to redraw. Each `SmallChart` gets a `visible` flag from a shared IntersectionObserver with a one-screen margin. Off-screen charts keep their last render (`memo` compares `visible && series`). Only visible charts compute windows. This keeps redraws to the 12–20 charts on screen, as the single tab does today.
- **Narrow screens** (< 760 px): 2 columns, a horizontally scrolling chip bar and the same sticky headings.

---

## 4. Levels and change: the chart design

### 4.1 Options considered

| Option | What it draws | Good | Bad |
|---|---|---|---|
| **A. Dual axis** | Level on a left axis; change vs no-change on a right axis, as a second line | One panel | The two scales are independent, so the lines' crossings, relative heights and slopes mean nothing, yet readers compare them. The change line is derived from lines already implied (level − no-change), so it encodes the same fact twice on different scales. For rates, both axes are in % or pp with different zeros ("−0.75" reads as a level). There is no room for two labelled axes at 160 × 54. Screen readers and hover must explain which axis each number belongs to. Dual axes are a well-known source of misreading in data-visualisation practice. |
| **B. One axis, two lines, gap shaded** | Level solid, no-change dashed, area between shaded | Honest: one scale, one unit. Shows both the level and the effect. Works in greyscale (solid vs dashed). | A small effect on a big level vanishes. Nominal GDP growing 7% a year across a 6-year window spans about 50%, and a −0.5% effect is under a pixel. |
| **C. Toggle** | Levels or effect, never both | Each view is clean | Hides one of the two things the user asked for. Switching loses context. |
| **D. B plus an effect strip** | B in the top panel; underneath, sharing the x-axis, a thin strip of the effect around its own zero | Both are always visible, each on its own honest scale in its own unit. A small effect is still readable in the strip, and the number in the header gives its size. | Two panels per chart (the strip is about 25% of the height). The strip's scale varies by chart, so the header number carries the size. |

### 4.2 Recommendation

**D by default, with C's "Effect only" as a compact alternative.** Reject the dual axis.

- D answers "maybe two axis?" with **two panels, not two axes**. You get the level and the change at once, each with its own zero and unit, and the panels never share a y-scale they would have to be reconciled against.
- The strip gets a **minimum range** per level kind, so floating-point dust or a trivial effect cannot fill it (the same idea as today's `minRange`, in effect units):
  - rates and shares: ±0.05 pp;
  - % of GDP: ±0.1 pp;
  - ISK, indices and counts: ±0.1%;
  - months: ±0.05;
  - multiples (×): ±0.02.
- Before any lever moves, the dashed line coincides with the solid line and is hidden. The strip is a flat hairline, and the header shows no effect chip. The level lines alone are already informative, because the economy moves from today.
- "Effect only" is today's chart, relabelled "vs no change". It suits scanning 64 charts to see what moved, and the "Moved by your changes" filter pairs with it.

### 4.3 What each chart shows

**Small multiple** (about 190 × 84 px: an 18 px header, a 50 px level panel and a 16 px strip).

- **Header:** the label on the left. On the right, the level now and an effect chip:
  - "7.25% · −0.75 pp";
  - Icelandic: "7,25% · −0,75 prst.".

  The chip is amber when positive and blue-grey when negative. As today, the colour means above or below, not good or bad.
- **Level panel:**
  - a solid `--accent` line (1.8 px) for the level;
  - a dashed `--muted` line (1.2 px, 3 3) for no change;
  - the gap filled amber at 12% opacity where the level is above no change and blue-grey at 12% where it is below. The fill is split at crossings.
  - Two faint gridlines at "nice" values (1–2–5 steps), labelled inside the left edge in 9 px mono.
  - The y-range covers both lines in the window, padded 8%, with a minimum range per kind: 0.5 pp for rates, 1 pp for ratios, 2 points for indices and 1% of the level for ISK and counts.
  - Zero is not forced into view, because these are line charts.
  - Reference lines (section 5) as muted dotted lines, without labels.
- **Effect strip:** a zero line, and the effect as a filled area (amber or blue-grey) with no labels. The header gives the size.
- **Event marks:** a vertical line through both panels at each lever event, with one mark per month (as `eventMarks` does today).
  - Proposed change: draw them as `--text` at 45% opacity, dotted, instead of amber. Amber now also means "above no change" in the shaded gap, and the two would collide.
  - The start (month 0) gets a thin solid mark when it is in the window.
- **Hover:** a hairline and two dots follow the pointer. The header switches to the hovered month ("mar. 2028 · 7.25% · −0.75 pp") and returns to the current month on leave. Clicking still opens the inspector.
- **Time window:** the last 72 months, as today. Before month 72 the line grows from the left of a window that starts at the start month, or 24 months before it when pre-start history exists (section 7.5).

**Inspector chart** (380 × 220: a 150 px level panel and a 50 px effect panel).

- A left y-axis on each panel, with 3–5 nice ticks in its own unit: "%" for the level and "pp" for the effect, for example.
- An x-axis in calendar time: "2027", "2028" at each January, and the start month labelled "Start · Sep 2026".
- Reference lines labelled at the right edge ("Cap binds 100%", "Target 2.5%").
- Numbered event flags at the top of the level panel. Hovering a flag, or a legend list under the chart, gives "Jan 2027 · Key interest rate → 7.50%".
- A **pinned readout box**. It sits at the top-right and does not follow the cursor, so it never covers the lines. It lists, for the hovered month (default: now):

  | Row | Example |
  |---|---|
  | Date | mar. 2028 |
  | With your changes | 7.25% |
  | No change | 8.00% |
  | Effect | −0.75 pp (money and indices: "−22 bn ISK (−0.4%)") |
  | 12-month change | money and indices only: "+6.8%" |
  | Start value | 8.00% (Sep 2026) |
  | Extras | declared per indicator, e.g. "Rule suggests 6.50%" or "Demand turned away 22%" |
  | Events this month | Key interest rate → 7.50% |

- Keyboard: the chart is focusable. ← and → move one month, Shift+← and Shift+→ a year, Home and End go to the ends. An `aria-live="polite"` region reads the row. Its `aria-label` summarises: "Key interest rate, 7.25% in March 2028, 0.75 points below no change."

### 4.4 By kind of measure

| Kind | Examples | Level axis and readout | Effect | 12-month change in hover | "Notable effect" (filter and section dot) |
|---|---|---|---|---|---|
| **Rate** (fraction → %) | key rate, inflation, mortgage rates, unemployment, tax rate | "%", ticks with 1 decimal, readout with 2 (8.00%) | pp (prst.) | no | 0.05 pp |
| **Share or ratio** (fraction or % of something → %) | capital ratio, foreign share, indexed share, debt/income, DSR, cap usage | "%" or "% of income", readout with 1 decimal | pp | no | 0.1 pp |
| **% of GDP** (already a ratio to current GDP) | government debt, credit/GDP, current account, NIIP | "% of GDP", readout with 1 decimal | pp | no | 0.1 pp |
| **Index** (price-type ratio, rebased) | CPI, house prices, wages, real króna | "Start = 100", readout with 1 decimal | % | yes | 0.1% |
| **ISK amount** (model money × Ŷ/100) | nominal GDP, broad money, profits, exports | "bn ISK a year" for flows (annual rate) or "bn ISK" for stocks. Thousands separators, 0 decimals at 100 or more. Current or start prices by the global switch. | % in the chip; ISK bn and % in the hover | yes | 0.1% |
| **Count** | unemployed people, jobs by sector | "thousand people", 1 decimal | % in the chip; thousands in the hover | yes | 0.1% |
| **Months or multiple** | reserves in months of imports | "months", 1 decimal | months | no | 0.05 |

When the no-change level of an amount is close to zero, a % effect blows up. For any amount whose reference is below 5% of its start value in absolute terms, show the effect as an ISK difference, not %. This is the same problem as `toDisplay`'s zero-baseline fallback.

**Icelandic formatting.** Use `Intl.NumberFormat('is-IS')` and `Intl.DateTimeFormat('is-IS', { month: 'short', year: 'numeric' })`:

- decimal comma and thousands point: "5.480 ma.kr.", "8,00%";
- "prst." for percentage points, "ma.kr." for bn ISK, "þús." for thousand;
- working labels: "Með breytingum þínum" (with your changes), "Án breytinga" (no change), "Áhrif" (effect), "Upphaf" (start).

The translation pass decides the final wording.

---

## 5. Financial-stability charts

All formulas use existing ids, which were checked against the compiled model on 29 September 2026. The values are at the current (2025) steady state and are sanity checks only; the start calibration will change them. `stock(i, p)` is the indicator context's signed position: holders' assets and issuers' liabilities are both positive.

Shorthand:

- `M` = Σ over p ∈ {HY, HW} of [`stock(mortgagesN,p)` + `stock(mortgagesI,p)`]: household mortgage debt.
- `DI` = `disposableIncomeY` + `disposableIncomeW` + `disposableIncomeO`.
- `INT_p` = `mortgageInterest_p_B` + `mortgageInterest_p_PF`.
- `IDX_p` = `indexation_p_B` + `indexation_p_PF`.
- `AMORT_g` = the `amortisation` term of `mortgageRepaymentg`: mortgage debt of group g ÷ `Tm`. `mortgageRepaymentg` also holds the loans paid off when homes are sold (`turnRate` × `sellerDebtg` × debt, about 1.7 times amortisation), which the buyer's new loan replaces.
- `cappedVolume(k, σ)` (modules/borrowers.ts): the share of wanted new lending that comes from borrowers above a cap k times what the average borrower wants, for borrowers spread log-normally with log-standard deviation σ.
- `L` = Σ over j ∈ {FC, FR, XF, XA, XT, XO} of `stock(businessLoans, j)`.
- `Y` = `nominalGDP`, or `gdpTrailing12` once added (section 7.4).
- `IM` = `importsConsumer` + `importsInputs` + `importsEquipment` + `importsPublic` + `importsExporters`.

| # | id, label | Formula (level) | Unit | Now | Why it matters in Iceland | Reference lines |
|---|---|---|---|---|---|---|
| 1 | `hhDebtIncome`, Household debt / disposable income | 100 × `M` ÷ `DI` | % of a year's income | 114.1 | The Central Bank's Financial Stability report tracks this ratio. It measures how many years of after-tax income households owe. In 2008–10 indexation and FX loans drove it up as incomes fell. | Start value (label). Pre-start history when available. |
| 2 | `debtService`, Debt-service ratio (cash) | 100 × Σ over (g, p) ∈ {(Y, HY), (W, HW)} of [`INT_p` + `AMORT_g`] ÷ Σ over the same pairs of [`disposableIncomeg` + `INT_p`] | % of borrowers' income before interest | 10.5 | Payments are what bite. A fast rise in the DSR is one of the best short-run early-warning signals of banking stress (Drehmann and Juselius, BIS). This is borrowers' (18–66) income. A BIS-comparable version divides by all households' income: 7.8. Only scheduled amortisation counts: loans paid off at a sale are not paid out of income, and adding them would more than double the ratio. | Start value |
| 3 | `debtServiceIdx`, Debt service including indexation | As #2 with `IDX_p` added to the numerator | same | 10.5 | Iceland-specific. On CPI-indexed loans (65% of the stock) inflation is added to the principal, not paid. Cash payments hide the true cost. After a 10% wage settlement the cash DSR moves −0.2 pp at 12 months, while this one moves +1.8 pp. | Line #2 (in the inspector only) |
| 4 | `dstiUsage`, Borrowers at the debt-service cap | 100 × Σ over g ∈ {Y, W} of `mortgageDemandg` × `cappedVolume`(`dstiCapg` ÷ `mortgageDemandg`, `sigmaDsti`) ÷ Σ over g of `mortgageDemandg` | % of wanted new lending | 9.9 | The Central Bank's debt-service rule (Rules 1300/2025: 35%, or 40% for first-time buyers, at stressed rates) is Iceland's main borrower-based tool. Borrowers differ, so the cap binds on those who want to borrow most, not on the average: this is the share of wanted lending from borrowers whose payments would pass the cap. They borrow up to it, so lending falls short of demand smoothly as the share grows. With the cap 12 pp tighter and banks pushing 1% of GDP, 61% of wanted lending is at the cap and lending is 17% below demand. | Start value. Extras: "Wanted lending trimmed" = 100 × (1 − (`mortgageLendingY` + `mortgageLendingW`) ÷ (`mortgageDemandY` + `mortgageDemandW`)), 0 at start because the caps' baseline trim is part of demand; demand ÷ cap (60% at start, `capUse0`); per-group shares; the binding regime ("binds for many borrowers"). |
| 5 | `houseToIncome`, House prices to income | (`housePrice` ÷ `DI`), rebased to 100 at start | index, start = 100 | 100 | Affordability and overvaluation. The Central Bank and HMS watch house prices relative to wages and incomes. An index avoids the placeholder value of the housing stock (`house0` = 200% of GDP). | 100 (start) |
| 6 | `realHousePrice`, Real house prices (moved) | `realHousePrice`, rebased | index, start = 100 | 100 | Housing is households' main collateral. Credit-driven price booms and busts drive loan losses and consumption. | 100 |
| 7 | `indexedShare`, Indexed share of mortgages | 100 × Σ over p ∈ {HY, HW} of `stock(mortgagesI,p)` ÷ `M` | % of mortgage debt | 65.0 | Indexed loans weaken the key rate's cash-flow channel and move inflation risk to borrowers' balance sheets. **Model limit:** new lending is split at a fixed `theta` (65%), so this moves only through indexation. The 2023–25 shift towards indexed loans when nominal rates rose is not modelled. | Start value |
| 8 | `creditToGdp`, Credit to GDP | 100 × (`M` + `L`) ÷ `Y` | % of GDP | 100.4 | Basel III's guide for the countercyclical capital buffer is the credit-to-GDP **gap**: the buffer starts when the gap exceeds 2 pp and reaches its maximum at 10 pp. In the model, credit is household mortgages plus bank business loans. It excludes firms' bonds and foreign loans (data: household 69.9% and corporate 75.5% of GDP). | Level: the start value. Gap (extra, phase 3): the level minus a one-sided HP trend (λ = 400,000, quarterly) seeded with the Central Bank's or BIS's pre-start trend and slope (section 7.5), with lines at +2 and +10 pp. Until then, the effect strip is the "gap vs no change". |
| 9 | `bankCapital`, Bank capital ratio (moved) | 100 × `capitalRatio` | % of risk-weighted assets | 22.0 | Loss-absorbing capacity. In the model, a ratio below target raises loan rates (`loanPremium`). | **`kapT` 22% "Banks' target"** and **`kapMin` 18% "Maximum loan premium"**, both read from parameters (section 7.1) |
| 10 | `govDebt`, Government debt / GDP (moved) | 100 × (`stock(govBonds,G)` + `stock(indexedBonds,G)`) ÷ `Y` | % of GDP | 56.7 | Fiscal space for a crisis. Indexed bonds grow with inflation. | Start value. The fiscal rule's 30% limit (Act 123/2015) uses a narrower, net definition, so it is mentioned in the description but not drawn. |
| 11 | `niip`, Net international investment position | 100 × (`stock(fxReserves,CB)` + `stock(foreignAssets,PF)` − `stock(deposits,W)` − `stock(govBonds,W)` − `stock(shares,W)`) ÷ `Y` | % of GDP | 75.5 | Iceland went from a deeply negative position before 2008 to a positive one, largely through pension funds' foreign assets. A weaker króna raises it in krónur. **Levels depend on placeholders** (`depW` = 3, `eqW` = 10), and banks' foreign funding is missing. Calibrate to the Central Bank's IIP before trusting the level. | 0 ("Iceland owes = owns") |
| 12 | `pfForeignShare`, Pension funds' foreign share (moved) | 100 × `stock(foreignAssets,PF)` ÷ `pensionFundAssets` | % of fund assets | 41.5 | Diversification away from Iceland versus pressure on the króna when funds buy abroad. | The statutory ceiling on foreign-currency assets, a parameter to add with its source and year. It is being raised stepwise under the pension-funds act; verify this year's figure before drawing it. |
| 13 | `reserveMonths`, FX reserves in months of imports | 12 × `stock(fxReserves,CB)` ÷ `IM` | months | 5.2 | A buffer against sudden outflows: the carry-trade unwind of 2008 and the capital controls that followed. | **3 months** (IMF rule of thumb, guide). Extra: "Reserves ÷ non-residents' króna holdings" = `stock(fxReserves,CB)` ÷ (`stock(deposits,W)` + `stock(govBonds,W)`) (2.54×; line at 1×). |
| 14 | `realKrona`, Real króna (up = stronger) | `cpi` ÷ (`exchangeRate` × `worldPrice`), rebased | index, start = 100 | 100 | The Central Bank's real exchange rate on relative consumer prices uses the same convention: up = stronger. A real króna far above its average has preceded current-account deficits and corrections. It uses the unsmoothed measure; `realExchangeRate` is smoothed "as trade sees it". | 100. Pre-start average when history exists. |

**Sanity runs** of the current model (effects against an unshocked run, from a scratch script). The indicators respond in the expected directions:

- **Key rate 3% → 5% (Manual).** At 12 months: DSR +1.7 pp, cap usage −15 pp, real house prices −3%. At 36 months: household debt/income −3.0 pp. Government debt/GDP +1.8 pp at 12 months and +10.5 pp at 72 months, because nothing corrects the deficit on Manual.
- **Looser credit** (lending appetite +2% of GDP a year, cap 10 pp looser). Cap usage +25 pp at 12 months. At 36 months: household debt/income +9.2 pp and credit/GDP +3.9 pp. Real house prices +4%.
- **Króna sentiment −10%.** At 12 months: real króna −2.4% (CPI-based), NIIP +3.5 pp, reserves cover of non-residents' króna 2.5× → 3.3×.
- **Wage settlement +10%.** At 12 months: cash DSR −0.2 pp, DSR including indexation +1.8 pp, indexed share +0.4 pp.

---

## 6. Level units for every indicator

Constants:

- k = Ŷ / 100 ISK bn per model unit (49.412 today).
- Populations by age come from `calibration.json` `population.*` (Hagstofa MAN00101, 1 January 2026).

"Nominal" says what the nominal version is and whether the switch applies.

Unit columns:

- **Level unit:** "bn/yr" means ISK bn a year at an annual rate.
- **Effect:** "pct" = % vs no change, "pp" = percentage points, "diff" = a difference in the level unit.

### A. Headline

| id | Level (unit) | Level from the model | Nominal | Effect |
|---|---|---|---|---|
| `nominalGdp`* | GDP, bn/yr | `nominalGDP` × k | It is nominal. Its start-price twin is `output`. | pct |
| `output` | Real GDP, bn/yr at start prices | `output` × k | Twin: `nominalGdp` | pct |
| `inflation` | % (12-month CPI) | 100 × `inflation12` | A nominal rate by definition. Line at the 2.5% target and a faint 1–4% band (the Central Bank's target and tolerance). | pp |
| `keyRate` | % | 100 × `keyRate` | Nominal rate. Extra: "Rule suggests" `keyRateSuggestion` (already in %). | pp |
| `unemployment` | % of labour force | 100 × `unemployment` | – (a ratio). Extra: unemployed people, thousands = Σ over g of `unemployedg`. | pp |
| `housePrice`* | Index, start = 100 | `housePrice`, rebased | Nominal house prices. Real twin: `realHousePrice`. An anchor to the HMS price index can be added. | pct |
| `krona` | ISK per euro (up = weaker) | `exchangeRate` × EURISK₀, where EURISK₀ is the start month's Central Bank mid-rate (new datum). This scales the model's single foreign-currency composite onto the euro, so label it "≈". Relabel the chart "Exchange rate (ISK per euro)", as Icelanders read the gengisvísitala: up = weaker. | Nominal rate | pct (+ = weaker; the sign flips from today's "+ stronger") |
| `realWage` | Index, start = 100 | `wage` ÷ `cpi`, rebased | Twin: the nominal wage index `wage`, rebased (switch). An anchor to Hagstofa's wage index is possible. | pct |

### B. Prices and rates

| id | Level (unit) | Level from the model | Nominal | Effect |
|---|---|---|---|---|
| `priceLevel` | CPI, start = 100 | `cpi`, rebased (optional anchor: Hagstofa CPI, May 1988 = 100) | Nominal price level. Hover: 12-month change = inflation. | pct |
| `expInflation` | % | 100 × `expectedInflation` | – | pp |
| `mortgageRate` | % | 100 × `mortgageRateN` | Nominal (non-indexed) rate | pp |
| `realMortgageRate`* | % | 100 × `realMortgageRate` | The real counterpart. Extra: indexed real rate 100 × `mortgageRateI`. | pp |

### C. Spending and profits

| id | Level (unit) | Level from the model | Nominal (switch) | Effect |
|---|---|---|---|---|
| `consumption` | bn/yr, start prices | `realConsumption` × k | `consumption` × k | pct |
| `investment` | bn/yr, start prices | `investmentReal` × k | (Σ over j of `investmentPurchasej` + `publicInvestment`) × k (checked: 20.18 = 20.18 at start) | pct |
| `profitsFD` | bn/yr, start prices | Σ over j ∈ {FC, FR} of (`profitsj` − `corporateTaxj`) ÷ `cpi` × k | Without ÷ `cpi` | pct (diff when near 0) |
| `profitsFX` | bn/yr, start prices | Same over XF, XA, XT, XO | Without ÷ `cpi` | pct (diff when near 0) |

### D. Households

| id | Level (unit) | Level from the model | Nominal | Effect |
|---|---|---|---|---|
| `unemploymentY/W/O` | % | 100 × `unemploymentg` | –. Extra: `unemployedg` (thousands). | pp |
| `rdiY/W/O` | Index, start = 100 **for now**. Later: ISK thousand per person a month at start prices. | `disposableIncomeg` ÷ `cpi`, rebased. Per person: × k × 10⁹ ÷ popg ÷ 12 ÷ 10³. | Twin without ÷ `cpi` | pct |

Per-person levels wait for the calibration fix. They come out at 402, 737 and **1,041** thousand ISK a month for the young, working-age and older. The older figure is far above Hagstofa THJ09001 (11.3 m ISK per *family* a year), because pension payouts are overstated (section 8, L4).

### E. Money and credit

| id | Level (unit) | Level from the model | Nominal | Effect |
|---|---|---|---|---|
| `broadMoney` | bn ISK | Σ over the money holders of `stock(deposits, ·)` × k (3,330 at the current start) | It is nominal. Extra: % of GDP = 100 × Σ ÷ `Y`. | pct |
| `netMortgage` | bn/yr | `netMortgageLending` × k | Nominal. Extra: % of GDP = 100 × `netMortgageLending` ÷ `nominalGDP`. **Fixes a mislabel**: today it is "% of GDP" but is % of *baseline* GDP. | diff (bn) |
| `creditImpulse` | % of GDP | 100 × `creditImpulse` ÷ `nominalGDP` (fixes the same mislabel) | – | pp |
| `creditImpulseTotal` | % of GDP | 100 × `creditImpulseTotal` ÷ `nominalGDP` | – | pp |
| `mortgageDebt` | % of GDP | 100 × `M` ÷ `Y` (today it sums the holders' side, which is the same number) | – | pp |
| `pfAssets` | bn ISK | `pensionFundAssets` × k (nominal) | Start-price twin ÷ `cpi` (today's chart). Extra: % of GDP (179.7 at the current start). | pct |

### F. Financial stability

Section 5 gives the formulas. Units are % (1–4, 7, 9, 12), % of GDP (8, 10, 11), an index with start = 100 (5, 6, 14) and months (13). Effects are pp, except pct for the indices and "months" for #13. They are all ratios of nominal amounts, or real indices, so the price switch does not apply. `houseToIncome` needs no switch either: it divides a nominal price by a nominal income.

### G. Government and the world

| id | Level (unit) | Level from the model | Nominal | Effect |
|---|---|---|---|---|
| `govBalance` | % of GDP | 100 × `govBalance` ÷ `nominalGDP` (accrual: indexation counts as spending) | Extra: bn/yr | pp |
| `incomeTaxRate` | % | 100 × `taxRate` | – | pp |
| `currentAccount` | % of GDP | 100 × `currentAccount` ÷ `nominalGDP` | Extra: bn/yr | pp |
| `dividendsAbroad` | bn/yr | `dividendsAbroad` × k | Nominal. Extra: % of GDP. | diff (bn) |
| `exports` | bn/yr, start prices | `exportVolume` × k | `exportValue` × k | pct |
| `imports` | bn/yr, start prices | `importVolume` × k | `IM` × k | pct |

### H. Firms by sector

| id | Level (unit) | Level from the model | Nominal | Effect |
|---|---|---|---|---|
| `exportsX·` | bn/yr | `exports{Fish,Aluminium,Tourism,Other}` × k | Already nominal (revenue in krónur). Twin: `exportVolume…` × k. | pct |
| `profits·` | bn/yr, start prices | (`profitsj` − `corporateTaxj`) ÷ `cpi` × k | Without ÷ `cpi` | pct (diff when near 0; aluminium is only 0.42% of GDP) |
| `jobs·` | Thousand jobs | `employmentj` ÷ `employmentj`(0) × sharej × E₀. `employmentj` is a wage bill at start wages, so headcounts come from data shares: `calibration.json` `firm_sectors.*.employment_share` × employed persons E₀ (labour force × (1 − u), `labour.*`). Where a share is missing (FR, XO), use the model's start split and mark it "derived". | – | pct |

---

## 7. Engine, model and interface changes

### 7.1 `IndicatorDef` (src/core/types.ts)

These are backwards compatible: indicators without `level` keep today's behaviour.

```ts
export interface IndicatorDef {
  // … existing fields; `display` stays and is the effect transform ('deviation-pct' = pct, 'deviation-pp' = pp, 'deviation' = diff)
  /** How to show compute()'s level in real-world units. */
  level?: {
    kind: 'rate' | 'share' | 'pct-gdp' | 'isk' | 'index' | 'count' | 'months' | 'multiple';
    unit: string;               // axis label, e.g. '%', '% of GDP', 'bn ISK a year' (a translation key)
    scale?: number | 'isk';     // multiply the level: a number, or 'isk' for the model's Ŷ/100
    rebase?: boolean;           // indices: divide by the start value, × 100
    real?: boolean;             // an amount at start prices; `nominal` gives the current-price twin
    nominal?: (c: IndicatorCtx) => number;
    direction?: string;         // e.g. 'up = weaker króna'
    digits?: number;
  };
  /** Reference lines in level units, drawn dotted; values may track a parameter so levers move them. */
  thresholds?: { value: number | { param: Id; scale?: number }; label: string; kind: 'limit' | 'target' | 'guide' }[];
  /** Hover and inspector rows only, never drawn: 'Rule suggests', 'Demand turned away'. */
  extras?: { id: Id; label: string; compute: (c: IndicatorCtx) => number; level: NonNullable<IndicatorDef['level']> }[];
  tags?: string[];
}
```

`ModelDef` gains the display anchors, each with provenance like any datum:

```ts
display?: {
  start: { year: number; month: number };   // month 0 on the time axis
  iskBnPer100: number;                      // Ŷ (GDP_BN today)
  anchors?: Record<Id, { value: number; unit: string; provenance: Provenance }>; // EURISK₀, CPI 1988=100 at start, populations, employed persons
};
```

### 7.2 Kernel: levels and the no-change reference path (src/core/engine.ts)

- **Levels.** `hInd` already stores levels month by month. Add `levels(id): number[]` for months 0..t, and `levelAt(id, month)`.
- **Reference path.** At creation the engine builds a **companion machine** from the same baseline and variant (same `params`, `forkParams` and `disableTerms`) with **no events**. It advances lazily to the main run's horizon, in blocks of 12 months, and records indicator levels (and, for 7.3, variables).
  - Cost: about 40–110 µs a month. The clock's 1,200-month limit is about 0.1 s, spread over playing.
  - Memory: 1,200 × (indicators + variables) doubles, about 4 MB.
  - Seeking does not touch it, because it is independent of the user's events.
  - Add `reference(id): number[]`, `referenceAt(id, month)` and `referenceValue(varId, month)`.
- **Deviations** become `toDisplay(display, level[t], reference[t])` instead of `(level[t], baseInd)`. For a model whose start is a steady state (the reference model, and today's Iceland model), reference[t] equals `baseInd` to within the drift tolerance, so every existing number, golden scenario and test is unchanged. Add a kernel test that asserts this.
- **Feed rules** compare effects against the reference (the same code with a new reference). Add an optional `FeedRule.on: 'effect' | 'level'` so a model can narrate a level ("Inflation falls below 4%"). The wording must say "than with no change" where it compares (section 8, L5).
- **Forks** carry their own reference, built from the fork's options. A "without this channel" counterfactual is then shocked minus unshocked with the channel off in both, as rule 9 requires.
- **`RunResult`** gains `level(id, m)`, `reference(id, m)` and `effect(id, m)`. Calibration measures should use `effect`, not `value(id, m) − value(id, 0)` (section 8, L1).
- **Cross-cutting.** The inspector's "now vs baseline" term changes, pipe glow and player-card deltas also compare with the steady state. They should read the reference run's month t too, which means recording the reference machine's terms, desired values and leg values as well. That is outside the charts, but it is the same change. Note it in the start-calibration decision record.

### 7.3 EngineClient (src/ui/engine-client.ts)

- `series(id)` stays: the effect, in display units.
- Add `levels(id)` and `reference(id)`, both months 0..t in level units after `scale` and `rebase`, as plain arrays for the future worker.
- Add `extrasAt(id, month)`.
- `info.display` carries the start date, Ŷ and the anchors. `ModelInfo.indicators` carries `level`, `thresholds` (with parameter values resolved per frame) and the `extras` metadata.

### 7.4 Model: a trailing-GDP denominator

Add `gdpTrailing12` (IDENTITY, in `firms.ts` next to `nominalGDP`): the mean of `nominalGDP` over the last 12 months, recursively `lag + (nominalGDP − lag(nominalGDP, 12)) ÷ 12`, initialised at the start value. Official debt and credit ratios divide by the past four quarters' GDP. The current month's annualised GDP runs about half a year's nominal growth ahead, so with 7% nominal growth it understates a 57% debt ratio by about 2 pp. Use `gdpTrailing12` for the stock ratios `mortgageDebt`, `govDebt`, `creditToGdp` and `niip`, and for `debtRatio` if the debt rule should match the published ratio. Flow ratios keep the same-month `nominalGDP`.

### 7.5 Pre-start history and the credit gap (phase 3)

- Add an optional `IndicatorDef.history = { source, vintage, points: [yyyy-mm, value][] }` in level units, from a new `data/iceland/history.json`. Hagstofa should come first: CPI, wage index, GDP, unemployment (LFS) and household disposable income. The Central Bank covers the key rate, the real exchange rate, household debt, credit, IIP and reserves; HMS covers house prices.
- In level mode, draw it as a muted grey line to the left of the start mark. The start is then visibly today's economy, and thresholds such as "average since 2000" can be data-based.
- **Credit gap.** A one-sided HP filter in Kalman form (λ = 400,000 on quarter-end values), run over the history plus the simulated path, gives the Basel gap. Show it as the extra "Credit gap (Basel)", with guide lines at +2 and +10 pp in the inspector. Without history the trend starts flat at the start value and the gap means nothing, so ship this only with the data.

### 7.6 UI model (src/ui/model/charts.ts and format.ts)

These are pure functions with unit tests:

- `levelWindow(level, reference, t, span, spec)`: the y-range over both lines, with a minimum range per kind.
- `niceTicks(lo, hi, n)`: 1–2–5 steps.
- `gapPaths(win)`: above and below polygons, split at crossings.
- `effectWindow(effect, t, span, kind)`.
- `dateTicks(start, from, to)`.
- `readoutAt(month)`.
- `fmtLevel(v, level, locale)` and `fmtEffect(d, display, level, locale)`.

`ChartSvg` becomes `LevelChart`, drawing the two panels with a shared x. The current `ChartSvg` survives as the "Effect only" view and the variable chart.

---

## 8. Logic issues found in the current chart implementation

| # | Severity | Where | Issue | Fix |
|---|---|---|---|---|
| L1 | High, once the start is not a steady state | `engine.ts` (`baseInd`, `toDisplay` in `indicator`, `series` and `updateFeed`). `calibration.ts:89` (`pctOf`: `value(id, m)` ÷ `value(id, 0)`) and `calibration.ts:342–343` (`dividendsAbroad` and `profitsXA` minus month 0). | Deviations, feed thresholds and three calibration measures compare with the month-0 or steady-state value. From a moving start they mix the economy's own drift with the effect of the shock. | The reference path, and `RunResult.effect` (7.2) |
| L2 | Medium | `indicators.ts`: `netMortgage` (unit "% of GDP"), `creditImpulse` and `creditImpulseTotal` ("pp of GDP") | The values are % of *baseline* GDP (fixed krónur), labelled as % of GDP. After a 10% wage settlement, at 12 months: 0.937 labelled vs 0.904 of actual GDP (3.6% off). With 2026 inflation the error grows every month. | Divide by `nominalGDP`, or show ISK bn (section 6.E) |
| L3 | Low–medium | `mortgageDebt`, `govDebt` (÷ `nominalGDP` this month), `debtRatio` (÷ last month's) | Stock ratios divide by the current annualised GDP, not the trailing year, as official statistics do. The bias is about 2 pp on government debt at 7% nominal growth. | `gdpTrailing12` (7.4) |
| L4 | Medium (calibration) | `pensionPayouts` = 13.9% of GDP vs `pensions.pf_benefits_paid_pct_gdp` = 6.26% in `calibration.json` | Older households' disposable income is about 1.04 m ISK per person a month, roughly double THJ09001. This inflates `DI`, which lowers household debt/income and the DSR denominator. It is the roadmap's "overstated pension payouts". | The start calibration. Until then, keep `rdi*` levels as indices. |
| L5 | Low | `inflation` description ("The baseline has zero inflation"), `i0` ("real, as the baseline has zero inflation"), `Charts.tsx` note "change vs baseline", feed wording ("Inflation picks up", "House prices outpace consumer prices"), architecture §7 "charts show deviations from baseline" | This text assumes the zero-inflation steady state. | Rewrite against "no change". The feed says "higher than with no change". |
| L6 | Low | `toDisplay` 'deviation-pct' | A % deviation explodes when the reference nears zero. With a moving reference, sector profits (aluminium 0.42% of GDP) or net flows can cross it mid-run. | Fall back to a difference, per 4.4 |
| L7 | Low (design) | Visual grammar: amber is both "above baseline" and "lever event" | Gap shading and event marks collide in level charts. | Neutral dotted event marks (4.3) |
| L8 | Information | Model coverage behind the financial-stability charts | Household debt is mortgages only (58.9% of GDP vs 69.9% in the data). Business credit is bank loans only (41.5% vs 75.5%). NIIP rests on placeholders (`depW`, `eqW`) and has no bank foreign funding. The housing stock is a placeholder (`house0`). Cap usage starts at an assumed 60% (`capUse0`), and the spread of borrowers around it (`sigmaDsti`, `sigmaLtv`) and the average new loan-to-value (`ltvAvg0`) are assumed until the Central Bank's loan-level distributions are used. The indexed share cannot shift at the margin (`theta` is fixed). | Say so in each description, and prefer effects over levels until the data arrive |
| L9 | Information | `realExchangeRate` is smoothed ("as trade sees it") and inverted (up = cheaper Iceland) | Unsuitable as the published real exchange rate | `realKrona` uses the unsmoothed CPI-based ratio, with up = stronger (section 5, #14) |

---

## 9. Order of work

1. **With the start-from-today change:**
   - reference path, `levels` and `effect` in the kernel and client (7.2, 7.3);
   - calendar axis;
   - `level` on all 51 existing indicators (section 6), plus L2 and L3 and `gdpTrailing12`;
   - `LevelChart` with the effect strip;
   - Overview sections, section bar, visibility gating;
   - updated calibration measures (L1).

   Tests:
   - kernel: reference = baseline for a steady-state model, and effect = shocked − reference for a fork;
   - `tests/ui/charts.test.ts`: windows, nice ticks, gap splitting at crossings, date ticks, minimum ranges;
   - engine client: levels and reference arrays;
   - smoke render with all sections open and collapsed;
   - harness goldens unchanged for the reference model.
2. **Financial stability and polish:**
   - the 10 new indicators, 3 new headline or price charts, thresholds and extras;
   - the price switch;
   - hover and keyboard readouts;
   - Icelandic number and date formatting through the translation pass.
3. **Data:** `history.json` from Hagstofa, the Central Bank and HMS; the Basel credit gap; per-person income levels after the pension-payout fix; anchors (EURISK₀, CPI 1988 = 100).
