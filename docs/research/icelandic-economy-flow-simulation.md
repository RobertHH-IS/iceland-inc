# Pull One Lever, Watch Iceland Respond

The simulation should be a **shock-propagation lab, not a forecast**. A stylised Iceland sits on the bench in a steady state: every balance sheet and every Godley row is consistent, inflation is at the 2.5% target, the policy rate is at its neutral level (about 5% nominal), and unemployment is at its natural rate of about 4%. The user moves one lever and watches the effects filter through households, firms, banks, the central bank, government, pension funds and the rest of the world, with every variable shown as a deviation from a flat baseline. The bench inherits Iceland's real structure rather than its current position: a wage share of about 60% of factor income, pension funds worth about 180% of GDP fed by a 15.5% payroll contribution, roughly 60% of mortgages indexed to the CPI, imports making up about a third of the consumer basket, exchange-rate pass-through of 0.15–0.23, and caps on debt service (35% of disposable income) and loan-to-value (80%). Steve Keen's flow approach supplies the mechanics: loans create deposits, new credit adds to demand, and interest flows from debtors to creditors. The Central Bank of Iceland's models supply default strengths and lags, such as a policy-rate effect on output and inflation that peaks after about five quarters. The user's own example shows why the step-by-step view teaches well. With prices unchanged, a 10% wage rise cuts profits by about 15%, not 10%, because wages are 60 of every 100 krónur of factor income. Passing the cost through needs domestic prices about 6% higher, which becomes roughly 4% on the CPI once imported goods are counted. From there, expectations, the policy rate, indexed and non-indexed borrowing, house prices, jobs and the króna each move in turn. The real economy settles back, while the price level and the indexed balance sheets stay permanently higher. Every magnitude below is an illustrative default taken from published coefficients, not a prediction, and the dials are meant to be turned: Keen's demand identity is contested, and several Icelandic coefficients were estimated on data ending in 2006 or 2017.

## Accounting is the physics; behaviour is a set of dials

Keen's framework starts from a point central banks now accept: **when a bank lends, it creates a matching deposit**. Most money is therefore bank-created, and repaying a loan destroys money ([Bank of England 2014](https://www.bankofengland.co.uk/-/media/boe/files/quarterly-bulletin/2014/money-creation-in-the-modern-economy.pdf)). In Iceland, notes and coin were ISK 61bn of M3's ISK 3,587bn in August 2026 ([CBI broad money](https://sedlabanki.is/library?itemid=76230f67-d5ae-4eb2-8469-0b5c282a7d70)), so about 98% of broad money is bank deposits. Keen adds three claims:

1. Credit, the rate of change of private debt, is a component of aggregate demand ([Keen 2020](https://www.tandfonline.com/doi/abs/10.1080/09538259.2020.1810887)).
2. Changes in growth and asset prices follow the *acceleration* of debt. This is the credit impulse, defined as the change in new borrowing as a share of GDP ([VoxEU](https://cepr.org/voxeu/columns/myth-phoenix-miracle)).
3. House-price change follows mortgage acceleration, because the money spent on housing roughly equals new mortgage debt ([Keen 2025](https://profstevekeen.substack.com/p/the-housing-market-is-a-rigged-game)).

Minsky enters through Keen's extension of Goodwin's growth cycle. In that model, firms borrow to invest beyond their profits. Wage share, employment and private debt then cycle, and the system either settles or breaks down depending on interest rates and starting conditions ([Grasselli & Costa Lima 2012](https://ms.mcmaster.ca/~grasselli/GrasselliCostaLima_MAFE_online.pdf)).

The Godley table makes this teachable. In Keen's Minsky software each flow is entered twice on its row, every row must satisfy assets − liabilities − equity = 0, and the column sums are the equations that move each stock ([Minsky manual](https://minsky.sourceforge.io/manual/Ravel/node131.html)). Stock-flow-consistent (SFC) practice adds two rules. In the balance-sheet matrix, every financial row sums to zero across sectors, because every asset is someone else's liability. In the transactions matrix, both rows and columns sum to zero. The model's long run is defined by stable ratios of stocks to flows ([Nikiforos & Zezza 2017](https://www.levyinstitute.org/pubs/wp_891.pdf)). That definition makes a steady state the natural baseline for a lab. Because nothing can leak, the last equation is redundant and serves as a check; the R package sfcr confirms consistency this way ([sfcr, model SIM](https://joaomacalos.github.io/sfcr/articles/articles/gl1-sim.html)).

Keen expresses behaviour as time constants in years ([Keen 2011](https://www.aeaweb.org/conference/2011/retrieve.php?pdfid=185)). A first-order lag closes about 63% of a gap in one time constant. Three chained lags give the S-shaped "DELAY3" response used in system dynamics ([isee systems](https://www.iseesystems.com/resources/help/v10/Content/Reference/Builtins/Delay_builtins.htm)).

Interest rates work through three channels ([Nikiforos & Zezza](https://www.levyinstitute.org/pubs/wp_891.pdf)):

1. Every financial stock implies an income flow from debtor to creditor.
2. New credit changes spending.
3. The stock of wealth or debt changes saving.

Godley and Lavoie's GROWTH model supplies a ready-made credit block. In it, gross new loans are a share of disposable income that falls by 0.4 of a point for each point of real lending rate, repayments run at 10% of the stock a year, and net new credit enters consumption directly ([sfcr, model GROWTH](https://joaomacalos.github.io/sfcr/articles/articles/gl8-growth.html)). Mainstream ideas survive as swappable behavioural modules rather than as structure:

| Mainstream relationship | Role in the flow lab |
|---|---|
| Taylor rule | The central bank's reaction function. Interest paid and received then flows through the matrix automatically |
| Expectations-augmented Phillips curve | Split into a wage-bargaining equation and a markup price equation, so inflation emerges from the two |
| IS curve | Replaced by explicit spending out of income, new credit and wealth, and by investment out of profits and the real rate |
| Okun's law | Follows from definitions: employment grows with output minus productivity and labour-force growth |
| Fiscal multiplier | Emerges from the stock-flow norms instead of being a fixed number |
| Credit accelerator | Demand includes new credit; the change in demand includes the credit impulse |

The critiques set the limits on what the lab may claim:

- Palley argues that Keen's identity (demand equals income plus new debt) ignores leakages from the circular flow of income and relies on an opaque velocity of money ([Palley 2014](http://www.thomaspalley.com/docs/research/ad_and_debt.pdf)).
- Lavoie replies that SFC models already handle banks and debt without redefining demand ([Lavoie 2014](https://www.elgaronline.com/view/journals/roke/2-3/roke.2014.03.04.xml)).
- Keen himself warned that model time "is in no way intended to match actual time" ([Keen 1995](https://keenomics.s3.amazonaws.com/debtdeflation_media/papers/Keen1995FinanceEconomicBreakdown_JPKE_OCRed.pdf)).

The honest design follows from these. Present the accounting as fact. Split new credit into spending on current output, which enters GDP, and purchases of existing assets, which move prices only; this makes Palley's leakage point visible. Label every behavioural curve as an adjustable dial.

## A steady-state Iceland sits on the bench

The baseline is a stationary economy with default settings:

| Setting | Default |
|---|---|
| Inflation | 2.5% target |
| Real policy rate | Neutral: about 2¼% on the CBI's estimate, 2.7% on the IMF's ([CBI MB 2026/2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf); [IMF Article IV 2026](https://www.imf.org/-/media/files/publications/cr/2026/english/1islea2026001.pdf)) |
| Nominal policy rate | About 5% |
| Unemployment | 4%, the CBI's equilibrium rate |
| Real trend growth | Zero by default, so every deviation is visible; an optional constant trend of 1.2% productivity growth |
| Wage growth | Equals productivity growth plus 2.5%, which the CBI puts at about 3¾% a year with a trend |

Every chart shows deviations from this baseline in percentage points or per cent, and a flat line always means "nothing happened".

A steady state with inflation has its own stock-flow rules, and the bench teaches them before any lever moves. With 2.5% inflation and no real growth, every stock must grow 2.5% a year for its ratio to GDP to hold. Non-indexed mortgages therefore need net new lending of about 2.5% of their stock each year. Indexed mortgages keep their real value through the indexation row alone, with no new lending at all. Deposits must also grow 2.5% a year, so money has to be created continually by bank lending or government deficits. On the fiscal-rule debt measure of about 44% of GDP, the debt-stabilising deficit is roughly 1.1% of GDP (my arithmetic). The current account and sectoral balances are set to stylised consistent values, such as a balanced current account, rather than 2025's actual deficit of 3.6% of GDP. The engine solves for these steady-state values from the target ratios, much as SFC packages initialise models at a stationary state ([godley](https://gamrot.github.io/godley/)).

### Structural ratios come from real balance sheets

Statistics Iceland's financial accounts give every sector's stocks by instrument ([THJ10001](https://px.hagstofa.is/pxen/api/v1/en/Efnahagur/thjodhagsreikningar/fjarmalareikningar/fjarmalareikningar/THJ10001.px)). Dividing by 2024 GDP (ISK 4,577bn) turns them into the ratios the bench is scaled to. These are the latest all-sector figures, end-2024, as a share of GDP:

| Sector (code) | Financial assets | Liabilities | Net financial worth | Ratios the bench keeps |
|---|---|---|---|---|
| Households (S14) | 276% | 73% | +203% | Pension entitlements 208%; deposits 33%; loans 72% |
| Firms (S11) | 172% | 293% | −121% | Loans owed 107%; equity issued 127% |
| Banks (S122) | 129% | 127% | +3% | Loans 100%; deposits owed 66%; bonds issued 33% |
| Central bank (S121) | 21% | 21% | 0% | Almost all assets are FX reserves |
| Government (S13) | 57% | 91% | −34% | Bonds 45%; pension liabilities 23% |
| Pension funds (S129) | 179% | 180% | −1% | Equity and fund shares 101%; bonds 58%; loans 15% |
| Rest of world (S2, its own view) | 103% | 153% | −51% | Iceland is a net creditor of about half of GDP |

Smaller financial sub-sectors (investment funds, insurers, other intermediaries) fold into an "other financial" column so that every row sums to zero. Non-financial capital, at replacement cost and excluding land, adds these ratios ([THJ03204](https://px.hagstofa.is/pxen/api/v1/en/Efnahagur/thjodhagsreikningar/fjarmunamyndun_fjarmunaeign/fjarmunaeign/THJ03204.px)):

| Capital stock | ISK bn | Year | Share of GDP |
|---|---|---|---|
| Housing | 5,250 | 2024 | About 115% |
| Business | 6,540 | 2025 | About 130% |
| Government | 2,373 | 2025 | About 50% |

The flow ratios come from the national and government accounts:

| Godley row | Payer → payee | Share of GDP | Source |
|---|---|---|---|
| Wages and salaries | Firms, government → households | ~42% (2024) | [THJ06021](https://px.hagstofa.is/pxen/api/v1/en/Efnahagur/thjodhagsreikningar/tekjuskipting/tekjuskipting/THJ06021.px) |
| Household consumption | Households → firms | ~49% | [THJ01102](https://px.hagstofa.is/pxen/api/v1/en/Efnahagur/thjodhagsreikningar/landsframl/1_landsframleidsla/THJ01102.px) |
| General government revenue / spending | Private sector ↔ government | 43.0% / 45.7% | [Statistics Iceland](https://statice.is/publications/news-archive/public-finance/general-government-finances-2025) |
| Social benefits | Government → households | ~7% | [Statistics Iceland](https://statice.is/publications/news-archive/public-finance/general-government-finances-2025) |
| Government interest, including indexation | Government → bondholders, mostly pension funds | ~4.7% | [Statistics Iceland](https://statice.is/publications/news-archive/public-finance/general-government-finances-2025) |
| Household interest paid / received | Households ↔ lenders and banks | ~3.6% / ~3.1% | [THJ06021](https://px.hagstofa.is/pxen/api/v1/en/Efnahagur/thjodhagsreikningar/tekjuskipting/tekjuskipting/THJ06021.px) |
| Pension contributions | Wage bill → pension funds | ~6.5% (derived: 15.5% of wages) | [OECD](https://www.oecd.org/en/publications/2025/11/pensions-at-a-glance-2025_76510fe4/full-report/contributions-paid-into-pension-plans_00ab41bc.html) |
| Exports, of which tourism | Rest of world → firms | ~40%, of which ~13% | [THJ01102](https://px.hagstofa.is/pxen/api/v1/en/Efnahagur/thjodhagsreikningar/landsframl/1_landsframleidsla/THJ01102.px); [Íslandsbanki](https://www.islandsbanki.is/en/news/current-account-balance-set-to-improve-after-2025-deficit) |
| Imports | Households, firms → rest of world | ~43% | [THJ01102](https://px.hagstofa.is/pxen/api/v1/en/Efnahagur/thjodhagsreikningar/landsframl/1_landsframleidsla/THJ01102.px) |

Unless marked, the ratios use 2025 values over 2025 GDP of ISK 4,941bn.

Mid-2026 figures confirm the proportions. Banks' total assets are ISK 6.6tn ([CBI](https://fr.sedlabanki.is/sdmx/v2/table/IS2_EXT/INN_BALANCE_SHEETS_TOTAL/1.0?format=xlsx)). Pension funds hold ISK 9.3tn, 42% of it abroad ([CBI](https://fr.sedlabanki.is/sdmx/v2/table/IS2_EXT/LIF_BALANCE_SHEETS_TOTAL/1.0?format=xlsx)). Housing loans total ISK 3,047bn ([HMS](https://hms.is/skyrslur/manadarskyrsla-september-2026)), with about ISK 2,085bn at banks (59% indexed) and ISK 859bn at pension funds (77% indexed).

Almost all of this data is public:

- Statistics Iceland runs a keyless PX-Web API ([Hagstofa API](https://px.hagstofa.is/pxen/api/v1/en/)).
- The CBI's quarterly financial accounts, which record who lends to whom, are reachable only through an undocumented proxy that could break ([CBI SDMX](https://fr.sedlabanki.is/sdmx/v2/data/dataflow/IS2_EXT/FINANCIAL_ACCOUNTS/1.0/*?lastNObservations=1&format=csv)).
- HMS, the housing authority, publishes price and rent indices as stable CSV files ([HMS](https://frs3o1zldvgn.objectstorage.eu-frankfurt-1.oci.customer-oci.com/n/frs3o1zldvgn/b/public_data_for_download/o/kaupvisitala.csv)).

Two measurement conflicts should be stated in the lab notes. Survey unemployment was 6.8% in August 2026 against 3.9% registered ([Statistics Iceland](https://statice.is/publications/news-archive/labour-market/labour-market-in-august-2026)). The HMS and Statistics Iceland house-price indices also disagree month to month.

### Four Icelandic wirings shape every experiment

**Indexation.** CPI-indexed annuity loans have payments fixed in real terms and principal that grows with inflation. They are 54% of household debt ([IMF Article IV 2026](https://www.imf.org/-/media/files/publications/cr/2026/english/1islea2026001.pdf)) and 65% of mortgages ([CBI FS 2026/1](https://cb.is/library/?itemid=2b8ca96c-aacc-4bcb-bd7d-a956b8a2f922)). The bench therefore needs three repricing clocks. Non-indexed variable loans follow the policy rate within about a month. Non-indexed fixed loans reprice in lumps when their 3–5-year fixed periods reset. Indexed loans price off the long real rate. Borrowers switch between types about 12–18 months after rates turn.

Estimates of the reset wave conflict. The CBI and Hypostat put fixed-rate resets at ISK 245bn for 2024 ([Hypostat 2024](https://hypo.org/app/uploads/sites/3/2024/08/Iceland.pdf)), while Heimildin reported ISK 128bn for banks' books ([Heimildin](https://heimildin.is/grein/19008/)).

Indexation is a non-cash Godley row. Under the national-accounting standards, indexation to a broad index such as the CPI is interest that accrues and is reinvested in the loan, not a holding gain ([SNA 2008](https://unstats.un.org/unsd/nationalaccount/docs/SNA2008.pdf) paras 17.277–17.282; ESA 2010 4.46). The borrower records an interest expense and a larger debt, the lender records interest income and a larger asset, and no króna changes hands at the time. About 40% of Treasury debt is indexed, and the government accounts record the indexation as interest expense as it accrues ([Fiscal Plan 2027–2031](https://www.stjornarradid.is/library/03-Verkefni/Efnahagsmal-og-opinber-fjarmal/FjarmalaaAetlun-2027-31/Skjol-og-gogn/Fjarmalaaaetlun_2027-2031_A4-prent.pdf)). Extra inflation therefore raises what the government owes bondholders, mostly pension funds, almost one-for-one on the indexed stock, but that extra is added to the debt rather than paid in cash.

**Borrowing caps and who lends.** New mortgages are capped at debt service of 35% of disposable income (40% for first-time buyers) and at a loan-to-value (LTV) of 80% (90% for first-time buyers) ([CBI FS 2026/1](https://cb.is/library/?itemid=2b8ca96c-aacc-4bcb-bd7d-a956b8a2f922)). Pension funds apply about 70% LTV. The debt-service test does not use the contract terms. Under Rules 1300/2025, in force since December 2025, it assumes an annuity at the contract rate but at least 5.5% over at most 40 years for non-indexed loans, and at least 3% over at most 25 years for indexed loans ([Stjórnartíðindi 1300/2025](https://island.is/stjornartidindi/nr/f2fc66b9-0dfd-44a6-b795-51117d37a095)). With those test terms, annuity arithmetic (mine) gives:
- A rise in the non-indexed rate from 4% to 9.5% cuts the maximum loan by about 36%, not by half, because the 5.5% floor already applied at 4%.
- An indexed loan at 4.5% real allows about 46% more borrowing than a non-indexed loan at 9.5%.

(An earlier draft used a 30-year indexed term and no rate floor, which gave "roughly halving" and 60%.) The simulation should compute the contract payment, the regulatory test payment and the deposit available separately, and show which constraint binds.

The two lenders also differ in how they create money. A bank mortgage creates a new deposit (pair creation). A pension-fund mortgage recycles contributions and moves existing deposits.

**Pension funds and the króna.** Pension funds held ISK 8,878bn at end-2025, 179% of GDP ([CBI FS 2026/1](https://cb.is/library/?itemid=2b8ca96c-aacc-4bcb-bd7d-a956b8a2f922)). They are funded by the OECD's highest mandatory contribution, 15.5% of salary. They discount liabilities at a fixed 3.5% real rate ([IMF FSAP 2023](https://sedlabanki.is/library/um-sedlabankann/ags/1ISLEA2023009.pdf)), and 42% of their assets are foreign, under a legal cap that rises to 65% by 2036.

Their foreign-currency purchases, normally ISK 80–120bn a year, are the largest recurring outflow of krónur. In 2025 these purchases fell to ISK 54bn, which the CBI says moved the króna substantially. Tourism is the largest inflow, at 32% of export revenue ([Íslandsbanki](https://www.islandsbanki.is/en/news/current-account-balance-set-to-improve-after-2025-deficit)).

The circuit is closed and domestic: government and mortgage interest flow largely to pension funds and on to retirees.

**Bargaining and labour supply.** Union density is about 90%. Act 55/1980 makes negotiated terms a legal floor for every worker, yet about 200 unions bargain separately ([OECD 2017](https://www.oecd.org/content/dam/oecd/en/publications/reports/2017/11/labour-market-and-collective-bargaining-in-iceland-sharing-the-spoils-without-spoiling-the-shares_aa3e7fb6/851fc29b-en.pdf)). Wage drift adds 2–3 pp a year on top of contractual raises ([CBI MB 2026/2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)). Private-sector deals set the pattern and public-sector deals catch up.

Agreements carry inflation review clauses, a discrete form of indexation. The 2024 stability agreements reopen if 12-month CPI in August 2026 exceeds 4.7% ([SA](https://www.sa.is/frettatengt/frettir/hver-eru-forsenduakvaedi-kjarasamninga)).

Migration is the labour-market shock absorber. Immigrants are 19.6% of the population ([Statistics Iceland](https://www.statice.is/publications/news-archive/inhabitants/population-by-origin/)) and more than half of the unemployed. The IMF finds the Beveridge curve has flattened because migration follows the business cycle ([IMF 2026](https://www.imf.org/-/media/files/publications/cr/2026/english/1islea2026001.pdf)).

## One lever at a time: nine experiments traced round by round

Each experiment starts from the steady state and moves one lever while everything else stays at baseline. Each step names:

- the round and approximate timing;
- the Godley row that moves, written as payer (−) → payee (+);
- the concept at work;
- an illustrative default magnitude.

The magnitudes come from the dial defaults in the next section: CBI model coefficients where they exist, and labelled assumptions or my own arithmetic where they do not. They show direction, order of magnitude and timing. They are not forecasts.

### Wages +10%: the user's example in full

This experiment is a one-off 10% rise in every negotiated wage, private and public, with nothing else changed.

The arithmetic holds the first surprise. Of every 100 krónur of domestic factor income, about 60 go to wages and 40 to gross profits ([CBI MB 2026/2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)). Raise wages 10% with prices unchanged, and wages go from 60 to 66. Profits, which are the residual, fall from 40 to 34. That is **a 15% profit squeeze, not 10%**, and the wage share becomes 66%.

To pass on the extra cost, so that each unit again earns its old króna margin, domestic value-added prices must rise **about 6%** (wage share × wage rise, 0.6 × 10%). Restoring the profit *share* to 40% would need the full 10%. The CBI's QMM model's long run, which holds the labour share constant, eventually pushes towards that ([QMM v4.0](https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf)).

The CPI moves less than domestic prices, because about a third of the consumer basket is imported ([CBI MB 2026/2, Box 2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)). A 6% rise on the domestic two-thirds is about **4% on the CPI** once pass-through is complete. Firms pass costs through only gradually. The CBI finds short-run effects of unit labour costs on prices unstable, even though prices, labour costs and import prices move together in the long run ([Danielsson, CBI WP87](https://ideas.repec.org/p/ice/wpaper/wp87.html)). Contractual raises in early 2026 did appear to be largely passed on within a quarter ([CBI MB 2026/2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)).

| Round (timing) | Godley row: payer (−) → payee (+) | Concept | Illustrative default |
|---|---|---|---|
| 1 (month 0) | Wages: firms (−6 per 100 of factor income) → households (+6); government's own wage bill +10% | Distributive shock; profits are the residual | Profits −15%; wage share 66%; public wage bill (~14.5% of GDP, [IMF 2026](https://www.imf.org/-/media/files/publications/cr/2026/english/1islea2026001.pdf)) up ~1.45% of GDP |
| 1 (month 0) | Contributions: employers and households → pension funds; income tax: households → government | Payroll-linked saving; automatic tax take | Pension inflow +~0.65% of GDP a year (derived); nominal disposable income +6–7% (assumption: wages ~77% of household income ([Eurostat](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Households_-_statistics_on_income%2C_saving_and_investment)), ~35% marginal wedge) |
| 2 (months 1–6) | Sales: households → firms at higher prices | Markup pricing; partial cost pass-through | Domestic prices +2–3% in two quarters (assumption: about half of the 6% passed on quickly) |
| 2 (months 1–12) | Import prices unchanged; imports: households, firms → rest of world | Imported share dilutes CPI | CPI +2% in year 1, approaching +4% as pass-through completes |
| 3 (quarters 1–3) | No money flow; information only | Adaptive expectations | Households' 1-year expectations up ~0.4 pp after one quarter, towards ~+1 pp while inflation stays high (persistence 0.67, weight on last inflation 0.15, [IMF SI 2024](https://www.imf.org/en/-/media/files/publications/cr/2024/english/1islea2024002-print-pdf.pdf)) |
| 3 (quarters 1–4) | Central bank → banks: interest on banks' deposits at the CBI | Taylor-type reaction | Policy rate +1 to +1.5 pp at peak in quarters 2–4; the CBI's DYNIMO model (+0.3 pp for wages 1 pp above baseline in each of two years) scales to about +1.5 pp. The real rate rises less, because expectations rose too |
| 4 (month 1 onward) | Interest: variable-rate borrowers → banks; banks → depositors | Interest as a distributive flow | Only variable non-indexed loans (~20% of mortgages) reprice at once; depositors and pension funds gain; household net interest roughly flat in year 1 |
| 4 (quarters 2–5) | New lending: bank loan (+) with matching deposit (+) slows for non-indexed borrowers, grows for indexed | Endogenous money; debt-service cap binding | Non-indexed cap: income +6.5%, payment +15% (7% → 8.25% over 40 years) ⇒ max loan ≈ −7%. Indexed cap (3.5% → 3.8% real, assumed) ⇒ ≈ +3%. Mix shifts to indexed over 12–18 months; real new lending falls, nominal roughly flat |
| 4 (continuous) | Indexation: households' principal (−) → lenders (+), non-cash | Indexation revaluation | Extra CPI of 4% on indexed mortgages (~38% of GDP) ⇒ ~1.5% of GDP added to debt; on indexed Treasury debt (~15% of GDP) ⇒ ~0.6% of GDP more paid; pension funds' indexed assets (~64% of GDP) gain ~2.5% of GDP, largely the counterpart of the first two (derived) |
| 5 (quarters 4–6) | House purchases: buyers' deposits → sellers' | Affordability anchor; long real rate | Nominal house prices roughly flat, real −2 to −4% (assumption); effect peaks after 4–5 quarters |
| 5 (quarters 1–4) | Consumption: households → firms; imports: firms → rest of world | Lagged spending response; import leakage | Real disposable income +2–4% ⇒ consumption ~+1% in year 1 (0.33 elasticity, net of rate and precaution effects); a third or more leaks into imports ([QMM v4.0](https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf)) |
| 5 (quarters 0–4) | FX: carry inflow versus import payments | Rate differential; trade balance | Króna +0.7–1% on the hike ([QMM v2.1](https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf)), offset by a weaker trade balance; net small |
| 6 (quarters 2–8) | Firms cut hours and hiring; fewer migrants arrive | Profit squeeze; Okun's law; migration buffer | DYNIMO: −0.7 pp hours per +1 pp wages ([CBI MB 2026/2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)); default caps a 10% shock at about −3% (assumption). Unemployment +0.5–1 pp at peak |
| 6 (quarters 2–8) | Unemployment benefits: government → households | Automatic stabilisers | Benefits sit outside the spending cap; deficit wider by ~0.5–1% of GDP in year 1 (assumption) |
| 7 (quarters 4–12) | Later wage settlements come in lower | Wage Phillips curve | −0.41 pp a quarter per point of unemployment gap ⇒ wage growth 1.6–2.6 pp a year below baseline while the gap lasts |
| Settles (years 3–6) | All rows return to baseline flows | Long-run homogeneity; constant labour share | Real variables back to baseline; price level permanently higher; wage share back near 60% |

Where the system settles depends on one dial. The real economy returns to baseline over three to six years, because the wage share is anchored near 60% in the long run and the unemployment gap slows wage growth until it gets back there. Either prices climb towards the full 10%, or later wage growth falls short of baseline by the difference. A hawkish central-bank rule puts more of the adjustment on jobs; a lenient one puts more on prices.

Balance sheets keep a permanent footprint. The price level is higher. Non-indexed debts and deposits have lost real value, a quiet transfer from savers to non-indexed borrowers. Indexed debts have not lost value, and pension funds have collected the indexation.

The rounds make one thing visible that no single chart does: a wage rise is at once a transfer from profits to wages, a cost shock, a demand shock, a reason for the central bank to move, and a revaluation of every indexed balance sheet in the country.

### Policy rate +1 pp

The CBI raises the key rate by 1 pp for four quarters, and its rule then takes over.

| Round (timing) | Godley row: payer (−) → payee (+) | Concept | Illustrative default |
|---|---|---|---|
| 1 (day 0) | Rest of world buys krónur (carry inflow) | Rate differential; exchange-rate channel | Króna +0.67% on impact, real peak in quarter 4 ([QMM v2.1](https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf)); CPI −0.1 pp over a year via pass-through |
| 2 (month 1) | Interest: variable-rate borrowers → banks; banks → depositors | Interest as distribution | ~ISK 7bn a year more paid on ~ISK 660bn of variable non-indexed mortgages, against ~ISK 8bn more received if half of households' ~ISK 1.7tn of bank deposits reprice (assumption). Borrowers lose; savers and pension funds gain |
| 3 (quarters 1–3) | New lending: fewer loan-and-deposit pairs created | Endogenous money; debt-service cap; credit demand | Non-indexed max loan −10% (7% → 8%); gross new lending −5% (0.4 per point of real rate); slow switch to indexed loans |
| 3 (quarters 2–3) | Investment and consumption: firms and households spend less | Rate-sensitive demand | Business investment down more than 1% and consumption −0.25% by quarter 3 ([QMM v2.1](https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf)) |
| 4 (quarters 4–5) | House purchases slow | Long real rate; affordability | Real house prices −0.5 to −1.5% (the long nominal rate moves only 24 bp per 100 bp); output −0.41% and inflation −0.24 pp at the quarter-5 trough |
| 5 (quarters 5–24) | Rule reverses; indexation accrues more slowly | Taylor-type reaction; migration buffer | Unemployment only ~+0.04 pp after two years; effects fade over 5–6 years |

The lesson is that a hike redistributes income from borrowers to savers before it shrinks anything.

### Government spending +1% of GDP: borrowed or taxed

The government buys 1% of GDP more from firms, financed either by selling bonds or by raising income tax.

| Round (timing) | Godley row: payer (−) → payee (+) | Concept | Illustrative default |
|---|---|---|---|
| 1 (month 0) | Purchases: government → firms. Deficit version: bonds sold to pension funds and banks. Tax version: households → government | Sectoral balances: a government deficit equals a private surplus plus a current-account deficit | Deficit version adds 1% of GDP to government debt each year |
| 2 (quarters 1–4) | Wages and consumption: firms → households → firms; imports → rest of world | Multiplier with import leakage | Output +0.3–0.6% (deficit), +0.1–0.3% (tax); no Iceland estimate exists, so these are an inference from the ~0.7 cross-country median and Iceland's openness ([IMF WP 2026/043](https://www.elibrary.imf.org/view/journals/001/2026/043/article-A001-en.xml)) |
| 3 (quarters 2–6) | Price and rate response | Price Phillips curve (0.095 per 1% output gap per quarter); Taylor-type rule | Inflation +0.1–0.25 pp a year; policy rate +0.3–0.6 pp (deficit version) |
| 4 (year 1 onward) | Interest: government → bondholders (mostly pension funds) | Stock-flow accumulation | Debt ratio drifts up in the deficit version; ~40% of it indexed |

A value-added-tax variant flips the short run. The levy raises measured CPI immediately (2027 fee rises were estimated at +0.3 pp, [NordiskPost](https://www.nordiskpost.com/2026/09/08/iceland-2027-budget-surplus/)), revalues indexed debt and nudges expectations up, even though it withdraws demand.

### Tighter borrowing caps

The debt-service cap drops from 35% to 30% and the LTV cap from 80% to 75%.

| Round (timing) | Godley row: payer (−) → payee (+) | Concept | Illustrative default |
|---|---|---|---|
| 1 (month 0) | No flow; the rule changes | Borrower-based measures bind on new flows, not on existing stocks | Max loan −14% for borrowers at the debt-service cap, −6% for borrowers at the LTV cap; existing borrowers unaffected |
| 2 (months 1–6) | New lending: fewer loan-and-deposit pairs; demand shifts to indexed loans and to pension funds (already at ~70% LTV) | Credit rationing; loan-type substitution | Net new mortgages −5 to −10% (assumption; depends on the share of borrowers at the caps) |
| 3 (quarters 2–6) | House purchases and housing starts fall | Affordability anchor; negative credit impulse | Real house prices −1 to −3% (assumption); completions fall 2–3 years later |
| 4 (quarters 2–6) | Little change in consumption or the policy rate | Weak wealth effect | Consumption −0.1 to −0.2% via a 0.12 wealth elasticity ([QMM v4.0](https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf)) |

Unlike a rate hike, tighter caps give depositors no windfall, move the króna not at all and leave existing variable-rate borrowers alone. Hypostat credits the 2022 LTV cuts with helping real house prices fall in 2023 ([Hypostat 2024](https://hypo.org/app/uploads/sites/3/2024/08/Iceland.pdf)).

### A bank credit boom

Banks' lending appetite rises, and net new mortgages run 1% of GDP above baseline for four quarters.

| Round (timing) | Godley row: payer (−) → payee (+) | Concept | Illustrative default |
|---|---|---|---|
| 1 (monthly) | Bank: +loan asset, +deposit liability; household: +deposit, +mortgage | Endogenous money (pair creation) | M3 (~73% of GDP) grows ~1.4% faster |
| 2 (months 0–6) | Buyers' deposits → sellers' deposits for existing homes; some → builders and shops | Split between asset purchases and goods (Palley's leakage made visible) | Default split: 70% existing homes, 20% new building, 10% consumption (assumption) |
| 3 (quarters 1–4) | House purchases at rising prices | Credit impulse; Keen's rule that price change follows mortgage acceleration | House-price growth rises while credit accelerates and peaks with the impulse |
| 4 (quarters 2–12) | Construction and imports rise | Supply conveyor; import leakage | Starts rise, completions come 2–3 years later; the current account weakens |
| 5 (after quarter 4) | The extra flow of new credit ends | Credit impulse turns negative while the flow falls back (it would be zero if the flow merely stayed at its higher level) | Demand growth falls back even though debt stays higher; the debt-service ratio rises and the cap binds sooner |

This experiment carries Keen's central lesson: the level of demand includes the flow of new credit, and the *change* in demand follows the change in that flow, the credit impulse ([Biggs, Mayer & Pick 2010](https://www.bde.es/f/webpi/SES/seminars/2015/files/sie1515.pdf); [Keen 2011](https://www.paecon.net/PAEReview/issue57/Keen57.pdf)). If new borrowing stays at a higher but steady level, the impulse is zero: demand stops growing but does not fall. It turns negative only when the flow itself falls, as it does when this temporary boost ends. The simulation should show the debt stock, the net borrowing flow and the credit impulse side by side.

### A 10% króna depreciation

The króna falls 10% on a shift in sentiment, with no change in fundamentals.

| Round (timing) | Godley row: payer (−) → payee (+) | Concept | Illustrative default |
|---|---|---|---|
| 1 (day 0) | Revaluation of foreign-currency stocks, non-cash | Valuation effects on the net international position | Pension funds' foreign assets +ISK 391bn (~8% of GDP); CBI reserves +ISK 95bn; firms' FX loans +ISK 57bn (~1.2% of GDP) (derived from mid-2026 stocks) |
| 2 (months 1–12) | Imports: households and firms → rest of world, more krónur per unit | Exchange-rate pass-through | CPI +1.5 pp in a year, +2.3 pp long run ([CBI WP85](https://ideas.repec.org/p/ice/wpaper/wp85.html)); the IMF's 0.4 at 36 months implies up to +4 pp |
| 3 (quarters 1–4) | Information; indexation of household principal → lenders | Adaptive expectations; indexation revaluation | Household expectations +0.3 pp, fading within 4–6 quarters ([IMF SI 2024](https://www.imf.org/en/-/media/files/publications/cr/2024/english/1islea2024002-print-pdf.pdf)); indexed mortgages +~0.9% of GDP |
| 4 (quarters 1–4) | Central bank → banks | Taylor-type reaction | Policy rate +0.25–0.75 pp (assumption) |
| 5 (quarters 2–8) | Rest of world → exporters (tourism, fish, aluminium earn more krónur) | Competitiveness; real-wage squeeze | Export volumes rise slowly (assumption); falling real wages raise the odds of a wage-clause trigger |

### A tourism export shock

Tourist receipts fall 20%, about ISK 126bn or 2.5% of GDP (derived from 2025 receipts of ISK 629bn).

| Round (timing) | Godley row: payer (−) → payee (+) | Concept | Illustrative default |
|---|---|---|---|
| 1 (heaviest in quarter 3) | Rest of world → hotels, airlines and restaurants shrinks | Export demand shock with seasonality | GDP −1 to −1.5% (assumption: about half of receipts is domestic value added) |
| 2 (months 1–6) | Wages: firms → workers shrink; fewer migrant arrivals | Okun's law; migration buffer | Unemployment +0.5–1 pp, rising faster among foreign workers |
| 3 (months 1–6) | FX inflows fall | FX clearing; pass-through | Króna −5 to −10% (assumption) ⇒ CPI +0.75–1.5 pp, partly offsetting the export loss |
| 4 (quarters 1–4) | Government → households via benefits; less tax in | Automatic stabilisers outside the spending cap | Deficit +0.3–0.6% of GDP (assumption) |
| 5 (quarters 1–8) | Central bank; rental housing demand | Reaction function; housing demand | If expectations hold, the CBI can cut; rents and house prices soften |

### Pension funds tilt abroad

Pension funds buy ISK 50bn a year more foreign currency, about 1% of GDP, using more of their rising foreign-asset cap.

| Round (timing) | Godley row: payer (−) → payee (+) | Concept | Illustrative default |
|---|---|---|---|
| 1 (monthly) | Pension-fund deposits → foreign-currency sellers; foreign assets rise | Portfolio shift: an asset swap with no GDP flow | Outflow +ISK 50bn a year against a normal ISK 80–120bn ([CBI FS 2026/1](https://cb.is/library/?itemid=2b8ca96c-aacc-4bcb-bd7d-a956b8a2f922)) |
| 2 (months 0–6) | FX clearing | Flow-driven exchange rate | Króna −2 to −4% (assumption; no Iceland estimate exists) |
| 3 (months 0–12) | Fewer domestic bonds bought; less lending to members | Portfolio balance | Indexed yields +10–30 bp (assumption) ⇒ indexed mortgage payments up; banks' covered-bond funding costs rise |
| 4 (quarters 1–8) | Imports cost more | Pass-through | CPI +0.3–0.6 pp over 1–2 years |
| 5 (long run) | Pension funds hold more foreign assets; someone else holds fewer (the central bank's reserves if it sold the currency) or foreigners hold more krónur | Portfolio swap; the net international position changes only through the current account and valuation effects ([IMF BPM6](https://www.imf.org/external/pubs/ft/bop/2007/pdf/chap7.pdf) 7.5, 14.12) | Retirees become more exposed to foreign markets and to the króna's value |

### A wage deal with or without a government package

Two deals raise low earners' disposable income by a similar amount (assumption). In A, wages rise 7% with no package. In B, wages rise 3.5% and the state adds transfers of about 0.4% of GDP a year. That figure comes from the government's own estimate of up to ISK 80bn over four years for the 2024 agreements ([Stjórnarráðið](https://www.stjornarradid.is/efst-a-baugi/frettir/stok-frett/2024/03/07/Vaxandi-velsaeld-Adgerdir-stjornvalda-til-studnings-fjogurra-ara-kjarasamningum/)). Iceland Review reported ISK 50bn, about 0.25% of GDP a year ([Iceland Review](https://www.icelandreview.com/news/economy/new-wage-agreement-aims-to-stabilise-icelands-economy/)).

| Round (timing) | Godley row: payer (−) → payee (+) | Concept | Illustrative default |
|---|---|---|---|
| 1 (month 0) | A: firms → households. B: firms → households at half the size, plus government → households | Who bears the cost | Profit squeeze −10.5% (A) against −5.25% (B) |
| 2 (quarters 1–4) | Sales at higher prices | Cost pass-through | Domestic prices +4.2% (A) against +2.1% (B); CPI ≈ +2.8% against +1.4% |
| 3 (quarters 1–4) | Central bank → banks | Adaptive expectations; Taylor-type reaction | B needs roughly half of A's rate response, so mortgage rates rise less |
| 4 (year 1 onward) | Government → households; government borrows from pension funds | Sectoral balances | B widens the deficit by ~0.25–0.4% of GDP a year, or needs taxes elsewhere |
| 5 (review date) | Inflation threshold check | Discrete indexation through a review clause | A is more likely to breach the threshold and reopen the deal |

## Dial defaults for every causal link

Every arrow in the lab is a dial with a default. "Sourced" values come from the cited estimates. "Derived" values are my arithmetic on sourced numbers. "Assumed" values are placeholders chosen to give plausible magnitudes, for users to change.

| Link | Functional form | Iceland default | Lag or time constant | Basis and source |
|---|---|---|---|---|
| Policy rule | i = r* + π^e + 1.5(π^e − 2.5%) + 0.5·gap, smoothed | r* 2¼–2.7% real ⇒ ~5% nominal | Adjusts over ~1 quarter | r* sourced ([CBI MB 2026/2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf); [IMF 2026](https://www.imf.org/-/media/files/publications/cr/2026/english/1islea2026001.pdf)); coefficients assumed (textbook Taylor) |
| Policy → variable non-indexed rate | Spread over policy | Pass-through 1.0; spread 2 pp | ~1 month | Pass-through sourced ([CBI MB 2024/2](https://www.cb.is/library/Skraarsafn---EN/Monetary-Bulletin/2024/May-2024/Monetary%20Bulletin%202024_2.pdf)); spread assumed |
| Policy → fixed non-indexed rate | Cohorts reset | 3–5-year fixes | At reset | Sourced ([Hypostat 2024](https://hypo.org/app/uploads/sites/3/2024/08/Iceland.pdf)) |
| Policy → long nominal rate | Linear | +24 bp per 100 bp | Immediate | Sourced ([QMM v2.1](https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf)) |
| Deposit-rate pass-through | Linear | 0.5 | ~1–3 months | Assumed |
| Credit demand | η = η0 − 0.4·real rate | η0 set to steady state | τ 0.5–1.5 years | Godley–Lavoie form ([sfcr GROWTH](https://joaomacalos.github.io/sfcr/articles/articles/gl8-growth.html)); τ assumed |
| Borrowing cap | min(LTV × price, DSTI × income ÷ payment factor) | DSTI 35%/40%; LTV 80%/90%; pension funds ~70% | Immediate on new loans | Sourced ([CBI FS 2026/1](https://cb.is/library/?itemid=2b8ca96c-aacc-4bcb-bd7d-a956b8a2f922)) |
| Loan-type switching | Flow share follows the payment gap between types | Indexed share of mortgages 65%, of household debt 54% | 12–18 months | Shares sourced; lag derived from history |
| Indexation | Principal grows by π each month | Indexed mortgages ≈38% of GDP; ~40% of Treasury debt indexed | Continuous | Sourced; ratio derived |
| House prices | Blend of credit flow, affordability anchor and unsold-stock buffer ([BoE SWP 614](https://www.bankofengland.co.uk/-/media/boe/files/working-paper/2016/a-dynamic-model-of-financial-balances-for-the-uk); [Zezza 2008](http://gesd.free.fr/zezza8.pdf)) | −1.4% on impact, −1.6% at 4 quarters, −0.9% long run per 1 pp long indexed real rate | Peak at 4–5 quarters | Elasticities sourced ([QMM v2.1](https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf)); blend weights assumed |
| Housing supply | Starts respond to price and rates; three-stage delay to completion | — | 2–3 years | Lag derived from history |
| Consumption | Lagged response to real income, wealth, unemployment and real rate | Income 0.33 at 1 year, 0.96 long run; wealth 0.12; −0.72 per 1 pp unemployment; −0.42 at 4 quarters and −1.2 long run per 1 pp real rate | Three-stage delay ≈ 1.7 years | Coefficients sourced ([QMM v4.0](https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf)); delay fit derived |
| Business investment | Keen profit-share function plus real rate | More than −1% at quarter 3 per 1 pp | Trough at quarter 3 | Rate effect sourced ([QMM v2.1](https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf)); profit function assumed |
| Wage bargaining | Δw = 0.629(Δprod + π^e long run) + 0.371Δw₋₁ − 0.412(u − 4%) + 0.167Δterms of trade | Plus settlements and drift of 2–3 pp | Quarterly | Sourced ([QMM v4.0](https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf); [CBI MB 2026/2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)) |
| Public catch-up | Relative-wage term | Closes the private–public gap | ~12 months | Assumed, following the pattern in [KTN/BHM](https://www.bhm.is/greinar/vorskyrsla-kjaratolfr%C3%A6%C3%B0inefndar-2026-launa%C3%BEroun-og) |
| Domestic price setting | Weighted unit labour cost (~0.6) + unit profits + net taxes | Pass-through ratio dial: 6% (króna margin kept) to 10% (share restored) per 10% wages | τ 2–4 quarters | Identity sourced ([CBI MB 2026/2, Box 2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)); speed assumed |
| CPI composition | ⅔ domestic, ⅓ imported | — | — | Sourced ([CBI MB 2026/2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)) |
| Price Phillips curve | 0.226 lagged inflation + 0.416 breakevens + 0.358 target + 0.095 gap | — | Quarterly | Sourced ([QMM v4.0](https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf)) |
| Expectations | π^e = 0.67π^e₋₁ + 0.15π₋₁ + anchor | Announcement effect 0 (no estimate) | τ ≈ 7–8 months | Sourced ([IMF SI 2024](https://www.imf.org/en/-/media/files/publications/cr/2024/english/1islea2024002-print-pdf.pdf)); τ derived |
| Exchange-rate pass-through | Distributed lag | 0.15 short run, 0.23 long run | 1–3 years | Sourced ([CBI WP85](https://ideas.repec.org/p/ice/wpaper/wp85.html)) |
| Króna | Clears FX flows; +0.67% per 1 pp rate differential | Pension-fund buying ISK 80–120bn a year | Impact; real peak at 4 quarters | Sourced ([QMM v2.1](https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf); [CBI FS 2026/1](https://cb.is/library/?itemid=2b8ca96c-aacc-4bcb-bd7d-a956b8a2f922)); flow elasticities assumed |
| Import leakage | Marginal import share of spending | 0.35–0.45 | Same period | Assumed from the ~43% import ratio |
| Unemployment (Okun) | Gap closes ~60% a quarter | Natural rate 4% | Quarterly | Sourced ([QMM v4.0](https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf)) |
| Hours response to wages | Linear, capped | −0.7 pp per +1 pp wages | 1–2 years | Sourced ([CBI DYNIMO scenario](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)); cap assumed |
| Migration | Labour force responds to wage and vacancy gaps | Absorbs ~half of labour-demand swings | ~2–4 quarters | Assumed; direction sourced ([IMF 2026](https://www.imf.org/-/media/files/publications/cr/2026/english/1islea2026001.pdf)) |
| Fiscal rule | Real discretionary growth ≤2% a year; interest and unemployment benefits outside the cap; 30% debt anchor | Stabilisers float | Annual | Sourced ([Fiscal Plan 2027–2031](https://www.stjornarradid.is/library/03-Verkefni/Efnahagsmal-og-opinber-fjarmal/FjarmalaaAetlun-2027-31/Skjol-og-gogn/Fjarmalaaaetlun_2027-2031_A4-prent.pdf)) |
| Fiscal multiplier | Emerges from the model | ~0.3–0.6 in year 1 | — | Derived inference ([IMF WP 2026/043](https://www.elibrary.imf.org/view/journals/001/2026/043/article-A001-en.xml)) |
| Pension funds | 15.5% contributions; portfolio shares respond to returns | Foreign target 43.5%, cap 54% → 65%; 3.5% real discount rate | Monthly | Levels sourced ([CBI FS 2026/1](https://cb.is/library/?itemid=2b8ca96c-aacc-4bcb-bd7d-a956b8a2f922)); response assumed |
| Review clause | Reopen if CPI exceeds the threshold | 4.7% (2024 agreements) | Annual check | Sourced ([SA](https://www.sa.is/frettatengt/frettir/hver-eru-forsenduakvaedi-kjarasamninga)); outcome dial assumed |

## An experiment lab, not a governor game

No existing product does this:

- The Phillips machine (MONIAC) and the FT's remake show money as water but cannot show credit creation ([EUR](https://www.eur.nl/en/news/virtual-successor-phillips-machine-promises-bring-economics-life-way-never-seen)).
- Minsky has the double-entry rigour but no narrative ([Minsky manual](https://minsky.sourceforge.io/manual/minsky/node130.html)).
- The Fed's "Chair the Fed" has lags but hides the economy; only about 20% of games end in reappointment ([ERIC](https://eric.ed.gov/?id=EJ1295169)).
- EconViz animates two T-accounts but has no macro dynamics ([EconViz](https://econviz.org/how-loans-create-money/)).

The lab combines the water's legibility, Minsky's accounting and EconViz's narration around a single act: move one lever on a quiet bench.

**The bench.** The steady-state Iceland sits under glass. Every chart is a flat line at zero, labelled "baseline". The user picks one lever from a lever rack:

- wages, the policy rate, government spending or taxes;
- the debt-service or LTV caps, bank lending appetite;
- the exchange rate, tourism receipts, pension-fund allocation;
- a wage deal with or without a package.

Each lever has a size slider and a duration: a one-off level shift, a temporary pulse or a permanent change. A faint ghost baseline stays on every chart and every building, so the gap between solid and ghost is the effect. Link toggles act as experiments on the model itself. The user can switch off indexation, freeze migration, fix the policy rate, or swap adaptive for anchored expectations and a Taylor rule for a "park-it" rule. They then see which part of the result each link produced.

**Rounds and continuous time.** Rounds mode steps through the causal graph in the order of each link's typical lag: impact, weeks, quarters, years. At each click it pauses to highlight the Godley rows that fired, with a − in the payer's column and a + in the payee's, and a "Σ = 0" tick that turns green. Continuous mode runs a monthly clock. A pressure pulse leaves the lever and travels along the causal chain at speeds tied to the model's actual lags, as signals do in Nicky Case's LOOPY ([GitHub ncase/loopy](https://github.com/ncase/loopy)). Its glow fades as the effect dissipates. Both modes read the same precomputed run, so they never disagree.

**Visual grammar.** The encoding never changes:

| Element | Always means |
|---|---|
| Particles | Money moving |
| Blocks | Stocks, stacked in T-account towers per sector |
| Dials | Rates |
| Conveyors | Delays (the mortgage pipeline, the queue of fixed-rate loans awaiting reset, the three-stage consumption lag) |
| Glow | Causal pressure |

A bank loan appears as pair creation: a loan block and a deposit block spawn together. A pension-fund loan visibly moves an existing deposit instead. Indexation shows as hatched growth on indexed blocks without any particle moving. Sector colours follow the colour-blind-safe Okabe–Ito palette ([ConceptViz](https://conceptviz.app/blog/okabe-ito-palette-hex-codes-complete-reference)):

| Sector | Colour |
|---|---|
| Households | Sky blue |
| Firms | Orange |
| Banks | Blue |
| Central bank | Gold |
| Government | Vermilion |
| Pension funds | Bluish green |
| Rest of world | Reddish purple |

Deficits are never coloured red, following Victoria 3's lesson that good/bad colouring pushes players to fix imbalances reflexively ([Paradox DD #61](https://www.paradoxinteractive.com/games/victoria-3/news/victoria-3-dev-diary-61-data-visualization)).

**Explanations.** Clicking any moved variable opens a "why did this move?" trace. It compares "with this channel" and "without this channel", each being the shocked run minus the unshocked run within the same model variant, so switching a channel off cannot change the comparison baseline. These comparisons are not an additive waterfall: when two channels are both needed for an effect, switching off either one removes all of it, so the "contributions" can add up to more than 100%. The causal path lights up back to the lever.

Concept cards are keyed to whichever link is active: markup pricing, pass-through, adaptive expectations, the Taylor-type reaction, endogenous money, the credit impulse, a binding debt-service cap, indexation revaluation, import leakage and automatic stabilisers. They are written from the model's state, for example "the real rate rose less than the nominal rate because expectations rose too". Each card shows its dial's value and source.

A "predict first" prompt asks users to sketch the path before revealing it; research on interactive articles finds that prediction improves recall ([Distill](https://distill.pub/2020/communicating-with-interactive-articles/)). A lab-notes drawer lists every assumption.

**Build.** No JavaScript SFC library was found, so the core is new code. It should be a pure, deterministic TypeScript engine defined by a JSON Godley specification (sectors, instruments, rows, behavioural equations, dials with source and basis). It:

- solves for the steady state first;
- asserts that every row and column sums to zero on every monthly step;
- precomputes each experiment and its link-off counterfactuals as arrays, so scrubbing, rounds and trace-backs are lookups.

Two practical guides apply. Fixed timesteps keep runs reproducible ([Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/)). The engine should first be validated against Godley–Lavoie's SIM, PC and BMW models in the R package godley ([godley](https://gamrot.github.io/godley/)).

Particle positions that are closed-form functions of time let the same scene render frame-exactly under HyperFrames' seek-driven clock for explainer videos.

Suggested rendering stack:

- Three.js with instanced particles for the bench;
- SVG for the ledgers and the Godley heatmap;
- uPlot for deviation charts ([uPlot](https://github.com/leeoniya/uPlot));
- GSAP, now free, for camera moves ([Webflow](https://webflow.com/blog/gsap-becomes-free)).

Constraints:

- Minsky is GPLv3 and Insight Maker's engine is AGPL, so reimplement their equations rather than embed their code ([GitHub scottfr/simulation](https://github.com/scottfr/simulation)).
- This workspace's AGENTS.md requires npm packages published at least seven days ago.
- Reduced-motion mode should replace particles with static flow widths.

History replays, a dated "present-day" start and governor-style challenges can come later as optional extras. They are not the core mode.

## Conclusion

Framing the simulation as a lab changes what it can honestly claim. A forecast has to be right about Iceland in 2027. An experiment only has to be right about the accounting and transparent about the dials. That is a standard the SFC discipline and the CBI's published coefficients can actually meet.

The experiments also show that most lessons come from the *order* of effects, not their size. A wage rise squeezes profits by more than the wage percentage before any price moves. A rate hike pays savers before it cuts borrowing. A credit boom stops lifting demand as soon as the lending flow stops rising, and drags on it when the flow falls. Indexation leaves a permanent imprint on balance sheets after every flow has returned to baseline.

Magnitudes on this bench are illustrative. The sequence, the signs and the accounting are the teachable core. The main build risk is not the physics but the calibration of a handful of assumed dials: deposit pass-through, migration response, house-price blend weights and FX-flow elasticities. Those should be surfaced prominently rather than buried.

## Appendix: history as a check on lags and magnitudes

History's only role here is to confirm that the default lags and sizes are plausible.

**House prices.** House-price growth peaked about five quarters after the first hike in 2004 (+33% y/y in Q3 2005) and about four quarters after the first hike in May 2021 (+22.9% in Q2 2022). Real growth stalled after 8–10 quarters in both cycles ([FRED/BIS](https://fred.stlouisfed.org/series/QISN368BIS); [FRED call rate](https://fred.stlouisfed.org/series/IRSTCI01ISM156N)). This matches the 4–5-quarter peak dial.

**Unemployment.** Unemployment stayed between 2.7% and 3.2% through 2005–08, and between 3.3% and 3.6% through 2022–24, despite large hikes ([FRED](https://fred.stlouisfed.org/series/LRHUTTTTISM156S)). This supports a small rate-to-unemployment link and a strong migration buffer.

**Inflation and the króna.** Inflation fell from 18.6% in January 2009 to about 2.5% by late 2010, roughly seven quarters after the króna stabilised under capital controls ([FRED CPI](https://fred.stlouisfed.org/series/CPALTT01ISM659N)). After 2012, expectations are better anchored ([Pétursson 2018](https://centerforfinancialstability.org/iceland/petursson_paper.pdf)). When the króna fell about 20% against the dollar in 2018–19, inflation peaked only near 3.7% ([FRED CPI](https://fred.stlouisfed.org/series/CPALTT01ISM659N)), and the CBI could cut rates after WOW air's collapse ([Detroit News/Bloomberg](https://eu.detroitnews.com/story/business/2019/05/22/wow-air-collapse-decimates-iceland-economy/39506655/)). This matches pass-through defaults of 0.15–0.23.

**Loan-type switching.** Borrowers moved into indexed loans about 12–18 months into the 2021–23 hiking cycle, and back out about 17 months after cuts began ([CBI MB 2026/2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)).

**Housing supply.** Housing starts fell from 4,158 to 1,887 while completions kept rising for another year, which confirms the 2–3-year supply conveyor ([Hypostat 2024](https://hypo.org/app/uploads/sites/3/2024/08/Iceland.pdf)).

**Limits of the rate lever.** Two episodes show that other forces can overwhelm it. In 2004–08, private credit rose from 100% to 301% of GDP while the policy rate climbed to 18%, because banks funded lending abroad and the carry trade strengthened the króna ([World Bank](https://data.worldbank.org/indicator/FS.AST.PRVT.GD.ZS?locations=IS); [NBER w24005](https://www.nber.org/system/files/working_papers/w24005/w24005.pdf); [Sigurjónsson 2015](https://github.com/mathiasrw/monetary-reform/blob/master/monetary-reform.md)). In 2024, prices re-accelerated at a 9.25% policy rate after the Grindavík buy-out ([CBI MB 2026/2](https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf)). The bench can include a foreign-funded credit channel and exogenous housing-demand shocks as optional levers.

**Wage indexation.** Fully indexed wages pushed inflation to 84% in 1983. The 1990 national consensus agreement ended the spiral ([SA](https://www.sa.is/frettatengt/frettir/thjodarsatt-fyrir-30-arum-markadi-vatnaskil)). This is a sanity check for a wage-indexation toggle.
