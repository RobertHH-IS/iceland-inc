# 0003. Splitting firms into six sectors (the Iceland model)

Status: accepted, with the player hierarchy (September 2026). This record covers the model. The kernel and flow-map side of the hierarchy (nested groups, pipes at mixed levels, group balance sheets) is in [0003-player-hierarchy.md](0003-player-hierarchy.md).

## 1. What changed

Engine v1 had two firms: domestic-market firms (FD) and exporters (FX). They are now six players in two groups, and the model declares its player hierarchy with `GroupDef`s:

| Group (id) | Parent | Players | Map position (x, y) |
|---|---|---|---|
| Households (`households`) | – | HY young 18–34, HW working age 35–66, HO older 67+ | 0.12, 0.55 |
| Firms (`firms`) | – | (groups below) | 0.86, 0.55 |
| Domestic firms (`domestic`) | `firms` | FC construction, FR retail and services | 0.86, 0.42 |
| Exporters (`exporters`) | `firms` | XF fisheries, XA aluminium, XT tourism, XO other exporters | 0.86, 0.68 |
| Banks (`banks`), Central bank (`central-bank`), Government (`government`), Pension funds (`pension-funds`), Rest of world (`world`) | – | B, CB, G, PF, W | as before |

Player hints: HY 0.12/0.38, HW 0.12/0.55, HO 0.12/0.72, FR 0.78/0.36, FC 0.93/0.45, XT 0.72/0.62, XF 0.86/0.62, XA 0.80/0.76, XO 0.93/0.74. Expanded siblings are at least 0.08 apart vertically or 0.13 horizontally.

Fourteen players, fifteen instruments, 372 variables and rules (266 before), 54 flows with 207 legs (139), 330 parameters (274), 27 levers (25), 51 charts (34), 32 module tests (26), 23 calibration checks (20). FD and FX are gone everywhere: structure, flows and legs, rules, the steady state, indicators, the feed, calibration, module tests and golden files.

## 2. Who sells what

| Sector | Sells | Buys at home | Imports |
|---|---|---|---|
| FC construction | all business and public investment (every sector pays FC for its machines and buildings; FC's own is a purchase inside the sector) and home repairs, 1.09% of household spending (CPI weight of dwelling maintenance, VIS01306) | materials and services from FR, 18% of its sales, solved so its value added matches the data | equipment (TiVA share of investment) and inputs |
| FR retail and services | the rest of household spending, all purchases of public services, exporters' domestic inputs, builders' purchases | – | consumer goods, inputs, supplies for public services |
| XF, XA, XT, XO | marine products, aluminium, tourism, other goods and services, each to W | energy, transport, food and services from FR | own imported inputs |

**Choice on construction:** no new-home building. Homes stay a fixed real stock traded between households (roadmap v3), so builders get public and business investment plus home repairs. Residential investment (5.1% of GDP) is outside the model, as before.

The household consumption legs, VAT (FR and FC each pass on their share), payroll and corporate tax, pension contributions, wages, dividends, deposit and loan interest, borrowing and depreciation all have a leg per sector.

## 3. Data

New leaves in `data/iceland/calibration.json` under `firm_sectors`, with sources in `calibration_notes.md`. The main ones were fetched from the PX-Web API: THJ08420 (value added, compensation, capital consumption by industry), THJ03105 (investment by industry), VIN10022 (register employment by industry and age band), UTA06203 and UTA03803 (imports of alumina, carbon electrodes, coke and jet fuel), VIS01306 (CPI weights), and the Central Bank's Financial Stability 2026/1 chart workbook (construction's bank debt).

| Sector | Exports | Imported inputs, share | Domestic inputs, share | Value added | Labour cost | Labour ÷ value added | Jobs, % of all | Investment | Retention | Bank loans |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| FC | – | – | 0.18 of sales | 7.34 (data) | 4.60 (data) | 0.63 | 8.5 | 1.02 | 0.47 | 7.35 (data share 17.7%) |
| FR | – | – | – | 59.40 (residual) | 21.49 (residual) | 0.45 (ex. VAT) | 39.9 | 11.98 | 0.52 | 20.47 (residual) |
| XF | 7.26 | 0.12 (assumed) | 0.25 | 4.55 (data) | 2.96 (data) | 0.65 | 5.5 | 1.11 | 0.96 | 6.23 (placeholder) |
| XA | 6.44 | 0.466 (data) | 0.36 | 1.13 (data) | 0.70 (data) | 0.62 | 1.3 | 0.18 | sweep | 0.42 (placeholder) |
| XT | 13.08 | 0.18 (assumed) | 0.31 | 6.65 (data) | 4.81 (estimate) | 0.72 | 8.9 | 0.55 | 0.38 | 4.98 (placeholder) |
| XO | 13.64 | 0.385 (residual) | 0.14 | 6.53 (estimate) | 4.15 (estimate) | 0.64 | 7.7 | 1.16 | 0.55 | 2.08 (placeholder) |

% of GDP unless stated; jobs are wage bills at baseline wages, public services hold the other 28.2%.

- **Exports** by line from calibration.json (tourism 13.1, marine 7.3, aluminium 6.4; other goods 5.5 and other services 8.1 both in XO).
- **Value added and pay:** construction, fisheries (fishing, aquaculture and fish processing) and basic metals from THJ08420 for 2025; tourism's value added from the tourism satellite account and its pay estimated from TSA employment times average pay in accommodation, air transport and travel agencies. v1's exporter aggregate (12.96% of GDP, 14.3% of jobs) counted only pharma among other exports; XO now has an estimate for all of them (other exports × the value-added share of output of the industries that make them), so exporters are 18.9% of GDP and 23.4% of jobs. Retail and services are what is left of the private sector.
- **Aluminium's imported inputs:** alumina ISK 95.5 bn + carbon anodes 52.1 bn + coke 0.7 bn = 46.6% of aluminium exports (2025). Other exporters take what is left of the TiVA import content of all exports (28.4%).
- **Foreign ownership:** the smelters 100% (Rio Tinto, Alcoa, Century); fisheries 0 (the law caps foreign ownership of fishing firms); tourism 10% (placeholder); other exporters 4%, solved so baseline dividends abroad stay at the data's 0.33% of GDP.
- **Investment:** the group totals stay v1's placeholders (13 and 3% of GDP) so the aggregate is unchanged; within each group they are split by 2025 gross fixed capital formation by industry. Retention ratios are solved so every sector's debt is steady. At 2025's heavy fleet investment and weak catches, fisheries keep 96% of their profit.
- **Tourism's young workers:** the register has no 18–34 split by industry. The share of workers outside ages 25–64 is 25.8% in tourism industries and 33.3% in accommodation and food, against 22.8% overall, so tourism's young share of jobs is set 30% above the average (assumed within that range).

## 4. Behaviour

- **Each sector's output follows its own demand.** Builders' real value added is proportional to their real sales; exporters' to their own export volume; retail and services' is the rest of output. Each sector hires toward its own value added (Okun) and economises on staff when the real product wage rises, as before.
- **The real exchange rate hits exporters differently.** Volumes: tourism most (elasticity 1), other exporters 0.8, fish 0.2, aluminium 0.05 (quotas and capacity). Revenue: fish and aluminium sell at world prices in foreign currency, so a weaker króna lifts their revenue at once; tourism and other exports are priced in krónur and gain only through volume. After a 10% sentiment shock, tourism's and other exporters' jobs rise most (+0.42% and +0.33% at month 3), while fisheries' and the smelters' profits jump (+49% and +113%, on thin margins).
- **Wage settlements hit every sector, but the squeeze follows labour intensity.** Real profit three months after +10% wages: tourism −24%, fisheries −22%, aluminium −16%, construction −14%, other exporters −14%, retail and services −6%. Aluminium is squeezed more than its 0.62 labour share suggests because its 2025 margin was thin.
- **Aluminium's profits leave the country.** The smelters' dividend rule is their own: the parents take after-tax profit minus what the smelters invest (and a debt term), so a windfall goes abroad at once and a loss is covered by the parents. With the aluminium price +20%, 85% of the extra profit is paid abroad within two years; the rest is corporate tax and extra investment.
- **Tourism employs the young.** Tourism pays 30% more of its wages to the young than their share of all jobs, and retail and services correspondingly less, so every age group's pay still adds up (module test). A change in tourism jobs moves young jobs more and working-age jobs less. Tourism −30%: youth unemployment +2.2 pp at month 12, working age +0.8 pp.
- **Retention is kept between 0 and 1.** A loss-making firm pays nothing out and its owners share the loss, instead of v1's formula paying out when retention exceeded one on a loss. The regime label says so ("Keeps all its profit"). It never binds in the calibration scenarios.
- **Retention reads last month's GDP** (as the debt-tied tax rule does), which takes the five retention rules and the exporters' dividends out of the income–spending block.
- **Superseded 29 September 2026 (trade-exporter-debt-spiral, trade-fish-windfall-hoarded): payout replaces retention.** Held for decades, the retention cap did bind: fish prices −30 or tourism +30 left fisheries keeping all their profit and borrowing without limit (loans 6% of GDP → 78–349% by month 600), and a fish windfall was 95% retained, then parked in deposits for ever once loans were repaid. The five retention rules are gone; each sector's dividends (`dividendsRule`, firms.ts) are its normal payout (1 − ρ₀) of baseline after-tax profit, plus the larger of `payMarginal` (0.3, Lintner) and the normal payout share of any change in after-tax profit, never below zero; minus `payDebt` (0.2 a year) × debt above its normal share of GDP (negative: owners put money in, as the smelters' parents already did); plus `paySpare` (1 a year) × deposits above target, which only arise once loans are repaid. Owners in Iceland put in at most `ownerCashSpeed` (0.1 a year) of their deposits, and pension funds only from deposits above the cash buffer they keep (pensions.ts), so firms' calls never drain the funds toward zero (in 40-year Manual collapses they did: public investment −3 overdrew them from month 456). Investment plans also fall when debt is above normal (`betaLev`, "Debt too high: investment cut"). The baseline is unchanged. Fish −30, tourism +30 and foreign demand +20 held for 50 years now keep every firm's loans at most 2.1 times their normal share of GDP; fish +30 pays owners 3.0% of GDP-years over five years (0.70 before).

## 5. Levers

All 25 v1 ids keep their meaning, with two sharper definitions and two new levers:

| Lever | Now |
|---|---|
| `tourism` | Drives XT's export volume (no longer multiplied by foreign demand). Since 29 September 2026 a rise reaches volumes over a few quarters and a fall within a month (`tourismFelt`, trade-month1-export-jump). |
| `foreignDemand` | Moves other exporters' volume one for one and marine volume by 0.3 of it (quotas); tourism has its own lever and the smelters run at capacity. Since 29 September 2026 it reaches volumes over a few quarters (`foreignDemandFelt`, `lamXD` 3 a year), so output peaks after about 9 months rather than in month 1. |
| `importPrices` (world prices) | Unchanged: imports, fish and aluminium in foreign currency. |
| `fishPrices` (new) | World fish prices, %, −30 to +30: level shift on top of world prices, persistent while set; mostly into fisheries' revenue and profit, with volume up only a little (about 3% at +30, through the profitability elasticity `eFish`: fuller use of quotas, the product mix and aquaculture). A third of profit above normal goes to the state as the fishing fee two years later (`fishingFee`, since 29 September 2026). |
| `aluminiumPrice` (new) | World aluminium price, %, −40 to +40: level shift on top of world prices, persistent while set; the alumina bill does not move, and the foreign owners take almost all of the extra profit. |

## 6. Calibration

All 20 v1 checks still pass. v1's aggregate ids for charts are kept: `profitsFD` and `profitsFX` are now the real after-tax profits of domestic firms and of exporters, computed as sums.

| Check | Range | Before | After |
|---|---|---:|---:|
| Rate +1 pp: output trough, % | −0.6 to −0.25 | −0.332 | −0.332 |
| Rate +1 pp: output trough quarter | 4 to 7 | 6 | 6 |
| Rate +1 pp: inflation trough, pp | −0.35 to −0.1 | −0.316 | −0.315 |
| Rate +1 pp: inflation trough quarter | 5 to 9 | 6 | 5 |
| Rate +1 pp: króna peak, % | 0.3 to 1.5 | 0.440 | 0.442 |
| Wages +10%: inflation peak, pp | 1.5 to 3.5 | 1.936 | 1.910 |
| Wages +10%: inflation peak quarter | 4 to 8 | 5 | 5 |
| Wages +10%: key-rate peak, pp | 0.8 to 2 | 1.298 | 1.274 |
| Wages +10%: unemployment peak, pp | 0.3 to 1.2 | 0.422 | 0.462 |
| Wages +10%: price level after 6 years, % | 3 to 8 | 3.238 | 3.118 |
| Wages +10%: output at year 6 ÷ peak | 0 to 0.25 | 0.185 | 0.156 |
| Wages +10%: unemployment at year 6 ÷ peak | 0 to 0.25 | 0.170 | 0.150 |
| Wages +10%: real wage at year 6 ÷ peak | 0 to 0.25 | 0.033 | 0.026 |
| Wages +10%: consumption at year 6 ÷ peak | 0 to 0.25 | 0.022 | 0.036 |
| Spending +1%: output, year-1 average, % | 0.3 to 0.8 | 0.718 | 0.717 |
| Spending +1%: money, banks − pension funds, pp | ≥ 0.5 | 1.185 | 1.190 |
| Króna −10%: price level at 8 quarters, % | 1.5 to 3 | 1.604 | 1.752 |
| Lending +1% for 12 months: impulse months 1–12, pp | ≥ 0.2 | 0.860 | 0.859 |
| Lending +1% for 12 months: impulse months 13–24, pp | ≤ −0.2 | −1.082 | −1.082 |
| Lending +1% held: largest impulse months 18–48, pp | 0 to 0.3 | 0.225 | 0.226 |

The differences come from the new composition, not from any aggregate parameter: exporters are now a larger, more labour-intensive and more exchange-rate-sensitive share of jobs, so unemployment reacts a little more to a wage settlement and the price level a little more to the króna. The inflation trough after a rate rise is flat across months 15 and 16 (−0.3151 against −0.3147; v1 had −0.3163 against −0.3165), so its quarter flips from 6 to 5 on a difference of 0.0004 pp; with half the step it is 6 again, a change of exactly the harness's 20% limit.

Three new checks, each with a reasoned range (sources in `calibration.ts`):

| Check | Measure | Range | Result |
|---|---|---|---:|
| `tourism-slump` | Tourism −30% held: króna value at month 12, %; NaN unless tourism's output falls more than any other sector's | −10 to −2 (2020: visitors −75%, trade-weighted króna −10% with FX sales and rate cuts; scaled and without intervention) | −7.1 (tourism −27%, next retail and services −1.2%) |
| `aluminium-windfall-abroad` | Aluminium price +20% held: extra dividends paid abroad ÷ the smelters' extra profit, months 1–24; NaN unless aluminium revenue rises | 0.6 to 0.95 (wholly foreign-owned; tax about 9%; 2024 FDI equity income 78% paid out) | 0.85 |
| `wage-squeeze-labour-intensive` | Wages +10%: first-quarter fall in real profit, tourism ÷ retail and services | 2 to 6 (first-round squeeze = 10% × labour ÷ profit: about 3.0 against 0.85) | 3.75 |

Half-step changes of the new measures: 1.2%, 0.1% and 0.2%.

## 7. Sector responses

Real after-tax profit, % vs baseline:

| Scenario | FC | FR | XF | XA | XT | XO | Króna, % |
|---|---:|---:|---:|---:|---:|---:|---:|
| Króna −10% (sentiment), month 3 | −9.3 | −1.7 | +48.8 | +112.6 | +0.4 | −4.6 | −8.3 |
| Tourism −30%, month 12 | −12.0 | −5.9 | +52.0 | +87.8 | −66.8 | −7.8 | −7.1 |
| Aluminium price +20%, month 12 | +1.3 | +0.1 | −2.0 | +299 | −0.1 | +0.2 | +0.4 |
| Fish prices +10%, month 12 | +4.0 | +0.6 | +49.7 | −19.6 | −0.2 | +1.3 | +1.9 |
| Foreign demand −10%, month 12 | −4.4 | −1.5 | +9.8 | +29.9 | +1.3 | −20.6 | −2.6 |
| Wages +10%, month 3 | −14.3 | −6.2 | −21.7 | −16.4 | −24.0 | −13.5 | −0.1 |
| Key rate +1 pp for 2 years, month 18 | −3.5 | −0.6 | −2.5 | +0.8 | −1.2 | 0.0 | +0.2 |

The smelters' profit is small (0.42% of GDP), so its percentages are large. A dearer fish price strengthens the króna and squeezes the smelters: the exporters compete for the same exchange rate.

## 8. Charts, feed and tests

- **Charts:** a fifth tab, *Firms by sector*: profits paid to foreign owners (pp of GDP), export revenue of each exporter, real profit of each sector, jobs in each sector. Suggested card metrics: FC `profitsFC`, `jobsFC`; FR `profitsFR`, `consumption`; XF `exportsXF`, `profitsXF`; XA `exportsXA`, `dividendsAbroad`; XT `exportsXT`, `jobsXT`; XO `exportsXO`, `profitsXO`; `domestic` `profitsFD`, `investment`; `exporters` `exports`, `profitsFX`; `firms` `output`, `investment`.
- **Feed:** six sector messages (tourism jobs down and up, builders' layoffs, fish revenue, profits abroad, tourism's squeeze).
- **Module tests:** the group declarations are valid (structure); sector exports add up to total exports after shocks, and the tourism lever moves tourism at least five times more than any other exporter (external); value added by sector matches the data, no sector borrows at baseline, the smelters pay all dividends abroad and most of a windfall leaves (firms); tourism pays the young more and every age group's pay still adds up (labour).
- **Flow ids:** the VAT flow is now `vatPayments` and exporters' domestic inputs `exporterPurchases`, because the kernel now warns when a flow and a variable that is not its leg amount share an id.

## 9. Performance

The simultaneous income–spending block has 50 rules (45 before): moving retention to last month's GDP took the five retention rules and the exporters' dividends out of it, and the sweep order computes output and builders' sales before the sectors read them. It takes 8.6 Gauss–Seidel iterations a month during a wage shock (the v1 port 7.9). Ids used on every evaluation are built once instead of on every call. On this machine, under load, a shocked month takes 87–130 µs in the speed test (v1 port 92–111 µs measured alongside it), and the harness's mean over 1,200 months is 52 µs (36 µs before). The budget is 200 µs.

## 10. Known gaps

- **Other exporters' value added and pay are estimates,** and 2025 was a weak year for the smelters (their net operating surplus was below zero), so aluminium's margin is thin and its profit swings by large percentages.
- **Bank loans by sector:** only construction's share is published; the other shares are placeholders.
- **Fisheries retain 96% of profit** at baseline because of 2025's heavy fleet investment against weak catches, so their baseline dividends are small (payout about 0.04 of after-tax profit, against about 0.2–0.35 in the industry). A change in their profit is now paid out at `payMarginal` (0.3), and the fishing fee is modelled only on profit above normal; recalibrating the baseline payout would mean solving another quantity (investment or the profit share) instead of ρ₀.
- **Tourism's young workforce** rests on a proxy (workers outside ages 25–64) and an assumed tilt.
- **No new-home building:** construction does not respond to house prices or mortgage credit except through consumption.
- **Book equity** of each firm is split by net assets and never changes (as in v1).
- **Long-run króna:** permanent export losses are closed only by the portfolio-balance and PPP terms, so the króna keeps falling for years (tourism −30% held: −18% after six years, −39% after twenty; v1 −32% after twenty). This was already so in v1.
- **Inputs between exporters and builders are proportional to sales,** with no substitution when relative prices move.
