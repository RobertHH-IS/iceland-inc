# Current monetary and financial values (as of 28 September 2026)

Companion to `current-financial.json`, which has 46 series. Each series gives its value, unit, period, source and a note. This file covers where the numbers came from, how the derived ones were computed, and what is still missing.

Status tags used below:
- **[primary]**: read directly from the source.
- **[derived]**: computed from primary figures, with the method stated.
- **[estimate]**: derived with a known approximation.
- **[secondary]**: taken from a secondary extract because the primary site blocked download.

## Headline values

| Id | Value | Period | Status |
|---|---|---|---|
| policyRate | 8.00% | since 19 Aug 2026 | primary (CBI series 75) |
| mortgageRateNonIndexedVariable | 9.90% | Sep 2026 | derived (average of 3 banks) |
| mortgageRateNonIndexedFixed | 8.75% (3-year fixed) | Sep 2026 | primary (all 3 banks) |
| mortgageRateIndexed | 4.40% real | 29 Sep 2026 | derived (median of 18 lenders) |
| hhDebtPctGDP | 70.55% of GDP | 2026Q2 | primary (FS 2026/2 I-29) |
| hhDebtISKbn | 3,625.5 bn | end-June 2026 | derived |
| hhDebtIndexedShare | 64.4% | end-July 2026 | derived (bank + pension-fund mortgages) |
| hhMortgagePensionFundShare / BankShare | 29.1% / 70.9% | end-July 2026 | derived |
| corpDebtPctGDP / corpDebtISKbn | 76.5% / 3,933 bn | 2026Q2 | estimate |
| netNewMortgageLendingISKbnMonth | 16.13 bn/month (12-month average 13.69) | July 2026 | primary (FS 2026/2 I-30) |
| m3ISKbn | 3,586.8 bn (+12.0% y/y) | Aug 2026 | primary |
| bankAssetsISKbn / bankDepositsISKbn | 6,582.3 / 3,802.0 bn | Aug 2026 | primary |
| bankCapitalRatio | 23.3% | end-June 2026 | primary (three systemically important banks) |
| fxReservesISKbn | 949 bn (USD 7,814.6 m) | end-Aug 2026 | primary |
| pfAssetsISKbn / pfForeignShare | 9,326.3 bn / 41.9% | end-July 2026 | primary |
| housePriceNominal12m / housePriceReal12m | +2.25% / -3.20% | Aug 2026 | secondary |
| expInflHouseholds2y / Firms2y / Market2y | 5.0% / 4.0% / 3.5% | Jun-Aug 2026 surveys | primary (MB 2026/3) |
| breakeven5y | 3.97% | Aug 2026 (to 14 Aug) | primary (MB 2026/3 chart 20) |
| eurIsk | 137.00 | 28 Sep 2026 | primary |
| tradeWeightedIndex / 12-month change | 177.95 / -1.9% (krona stronger) | 28 Sep 2026 | primary |
| wageAgreementInflationCeiling | 4.7% ceiling; actual 5.6%, so the condition failed | review 1 Sep 2026 | primary (ASÍ) |

## Sources and how they were read

1. **CBI CSV time-series service.** `https://cb.is/xmltimeseries/Default.aspx?DagsFra=YYYY-MM-DD&DagsTil=YYYY-MM-DD&TimeSeriesID=N&Type=csv`. It redirects from www.cb.is to cb.is, so use `curl -L`. The rows are `;`-separated, and dates are US-style M/D/YYYY.
   - A scan of IDs 1-7000 found the useful series:

     | Area | IDs |
     |---|---|
     | CPI | 1 (index), 2 (12-month change) |
     | REIBID and REIBOR | 3-20, 3170-3171 |
     | Penalty rate | 22 |
     | CBI rates | 24 overnight lending; 28 current accounts; 55 7-day collateralised loans; 75 **7-day term deposits = key rate**; 3459 reserve requirement |
     | Inflation target | 2093 |
     | Official exchange rates | 4055 USD, 4061 DKK, **4064 EUR**, 4091 NOK, 4103 GBP, 4106 CHF, 4109 SEK |
     | Exchange-rate indices | 4114-4117 average-rate indices by basket; **4118 = gengisvísitala, narrow trade basket**, the index used in Monetary Bulletin charts |
     | IMF SDDS (NSDP) series | 81 M1, 82 **M3**, 3285 M2; 130 **official reserves (USD)**, 131 foreign-currency reserves; 180-185 and 3286-3291 depository-corporations survey (claims on households, ID 3289; on other non-financial corporations, ID 3288) |

   - The NSDP series keep only 13 months of history. Use the CBI workbooks below for longer runs.
2. **CBI Databank.** Tables are downloaded with `POST https://databank.is/api/download` and the JSON body `{"url": "<source url>"}`. The page configuration and translations list the source URLs: `GET https://databank.is/api/config` and `GET https://databank.is/api/translation/en`, keys `*.EXCEL`. The tables used were:
   - `https://fr.sedlabanki.is/sdmx/v2/table/IS2_EXT/INN_BALANCE_SHEETS_TOTAL/1.0?format=xlsx`: balance sheet of deposit institutions, monthly, to Aug 2026.
   - `.../IS2_EXT/LIF_BALANCE_SHEETS_TOTAL/...`: pension-fund balance sheet, to Jul 2026.
   - `.../IS2_EXT/LIF_BALANCE_SHEETS_LOANS_SECTOR_TOTAL/...` and `..._LOANS_CLASS_TOTAL/...`: pension-fund loans by sector and indexation.
   - `.../IS2_EXT/LIF_NEW_LOANS_TOTAL/...`: pension funds' net new loans to households.
   - `https://sedlabanki.is/library?itemid=3227486f-fd21-4635-b8e0-7b0ab7210bd4`: deposit institutions' lending by sector and type (sheet IV households, sheet V firms).
   - `...itemid=b73e42d6-ba32-4eb3-b39e-1c70d2e45aec`: new lending less prepayments by sector and type.
   - `...itemid=19c3efc3-28e8-4850-a4ef-9795b5ca5cde`: deposits by sector.
   - `...itemid=76230f67-d5ae-4eb2-8469-0b5c282a7d70`: money supply M0-M3.
   - `...itemid=c0126d81-fd88-42bd-aee3-449e09b9089f`: CBI balance sheet. Downloaded, not used.
3. **CBI Financial Stability 2026/2.** Published 23 Sep 2026, so it replaces 2026/1 as the latest issue. The PDF is library item 42c02471-0279-4662-82f8-67d770698526, and the chapter chart data is item 873abb37-c29a-4cdf-833a-9f7b51740997. Used: charts I-28, I-29, I-30, I-31, I-34 and II-7; tables 1, 2, 4 and 7; and the text on reserves, capital, house prices and pension funds.
4. **CBI Monetary Bulletin 2026/3.** Published 19 Aug 2026; it is newer than 2026/2. The PDF is item bcb7e3d2-1030-4277-ab05-5eb71995a6d4, and the chart data is item 50dbbb33-8b7a-4e61-b1dc-94f01fe80c6a. Used: charts 4, 5, 6, 7, 17 and 20, and the text on real rates, money, expectations and the wage review.
5. **Hagstofa.** PX-Web table `THJ01601` (quarterly GDP, current prices) gave the four-quarter GDP of 5,138.9 bn ISK used as the denominator. The CPI comes from Hagstofa through CBI series 1 and 2. The Hagstofa API rate-limits hard (HTTP 429), so the requests used a retry with backoff.
6. **Lender rate sheets.**
   - Landsbankinn: `landsbankinn.is/uploads/documents/vextir/vaxtaakvordun-260901.pdf`, valid 1 Sep 2026.
   - Íslandsbanki: `cdn.islandsbanki.is/.../islandsbanki_vaxtatafla_ytri_vefur.pdf`, valid 3 Sep 2026.
   - Arion: `docs.arionbanki.is/.../Vaxtatafla-einstaklinga.pdf`, dated 24 Sep 2026.
   - Pension funds and small banks: the aurbjorg.is/husnaedislan comparison table, fetched 29 Sep 2026. Aurbjörg showed Landsbankinn's variable rate as 10.25%, which is stale. The bank's own sheet says 10.50%, so the three big banks were always taken from their own sheets.
7. **Wage agreements.** The ASÍ statement was read as reproduced by Eining-Iðja (ein.is), with the Monetary Bulletin 2026/3 text as a cross-check.

## Derivations

- **hhDebtISKbn** = 70.55% x 5,138.9 bn = 3,625.5 bn.
  - As a check, banks (2,326.5 bn) plus pension funds (840.7 bn) held 3,167.2 bn in June 2026. The remaining 458 bn is ÍL-sjóður, HMS, the student loan fund and other credit undertakings, which is plausible.
- **hhDebtIndexedShare** = (bank indexed mortgages 1,232.1 + pension-fund indexed mortgages 651.7) / (bank 2,073.7 + pension fund 851.2) = 64.4%, end-July 2026.
  - This leaves out the legacy ÍL-sjóður and HMS loans, which are nearly all indexed, so the true share is a little higher.
  - FS 2026/1 gave 65.0% for January 2026. New lending has since tilted to non-indexed loans: more than half of new mortgages in H1 2026 were non-indexed (FS 2026/2).
- **Shares of mortgages** (end-July 2026): pension funds 29.1%, banks 70.9%, of the banks' and pension funds' residential mortgages combined.
  - Against total household debt (derived, June 2026), banks hold 64.2%, pension funds 23.2% and others about 12.6%.
- **corpDebt** = bank loans to non-financial companies in June 2026 (2,221.8 bn) / the banks' share of corporate debt in 2026Q2 (56.49%, FS I-34) = 3,933 bn. That is 76.5% of four-quarter GDP.
  - Back-test: the same method at end-2025 gives 75.2%, against a published 75.5%.
  - The FS ratio covers firms' debt to domestic and foreign financial firms plus bonds they have issued.
- **mortgageRateNonIndexedVariable** = average of Arion 9.69, Íslandsbanki 9.50 and Landsbankinn 10.50, for loans up to 50% loan-to-value.
  - Variable rates now move with the key rate: Íslandsbanki and Landsbankinn set them as key rate + spread.
- **mortgageRateIndexed** = the median, across 18 lenders, of each lender's lowest CPI-indexed rate. The pension funds are now the main indexed lenders.
- **FX reserves in ISK** = USD 7,814.6 m x 121.42 = 948.8 bn, which matches the 949 bn in FS 2026/2.
- **Trade-weighted index, 12 months** = 177.9506 (28 Sep 2026) / 181.3978 (29 Sep 2025) - 1 = -1.90%. A falling index means a stronger króna.
- **Real house prices** = 1.0225 / 1.0563 - 1 = -3.20%, the same as HMS reports.

## Missing, weak or unverified

- **HMS house price CSV: not obtained.** hms.is answered with HTTP 429 or a JavaScript bot challenge to curl, WebFetch and the browser tool.
  - The August 2026 values (index 113.6, +0.09% m/m, +2.25% nominal, -3.20% real y/y, capital area -0.18% m/m) come from search-engine extracts of the HMS release of 15 Sep 2026.
  - They agree with Monetary Bulletin 2026/3 (+1.61% in July), with FS 2026/2 (real capital-area prices down "rúmlega 3%") and with Landsbankinn ("íbúðaverð hækkaði lítillega í ágúst").
  - The base period of the index was not verified. The HMS monthly report for September was not read.
- **IMF Article IV 2026: not used.** imf.org returned HTTP 403 for the press release, the concluding statement and the country report.
- **Pension-fund net new lending for August 2026** is not yet published (latest July). The FS total for net new mortgage lending also ends in July.
- **Breakevens** are the August 2026 monthly average to 14 Aug. No September value was found, and the CBI yield-curve data are not in the CSV service.
- **Household and firm expectation surveys** are the latest reported in MB 2026/3: households from the Gallup survey of June 2026, firms from the summer survey. The Gallup September household survey will appear with MB 2026/4.
- **Corporate debt** in ISK and as a share of GDP for 2026Q2 is an estimate (see above). The CBI published the ratio only to end-2025 (75.5%).
- **Household debt** in ISK is derived. The CBI publishes ratios, not the level.
- **Mortgage rates** are advertised list rates for loans up to 50-55% loan-to-value, not the average rate actually paid on the stock of loans. The CBI stopped publishing average bank lending rates in its CSV service (Hagstofa PEN01101 ends in 2016).
  - The effective rate on outstanding loans is missing. Many non-indexed loans are on fixed rates set in 2023-2025, and indexed loans issued before 23 Oct 2025 carry legacy rates, such as Landsbankinn's 4.00% base loan.
- **Next MPC decision:** 7 Oct 2026 according to a search extract. This was not verified on sedlabanki.is, whose pages render client-side.
- **Wage agreements:** there was no outcome as of 28 Sep 2026. The notice deadline is 16:00 on 8 Oct 2026, and the agreements lapse on 31 Oct 2026 if a party gives notice. Check again after 8 Oct.
- **September CPI** was due 29 Sep 2026, after the as-of date (Landsbankinn forecast 5.8%). All CPI figures here are for August.
