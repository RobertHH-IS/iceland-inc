# Current Hagstofa values (as of 2026-09-28)

Companion to `current-hagstofa.json`. One line per series: id = value unit (period). Source, then caveats.
All values were fetched on 28-29 September 2026 from the Statistics Iceland PX-Web API (https://px.hagstofa.is/pxen/api/v1/en/, JSON-stat2).
"Derived" means computed by us from the cited Hagstofa table(s); the method is in the note. Nothing here is estimated or taken from memory.

## Prices and wages

- `cpiLevel` = 694.6 index points, base 1988 = 100 (VIS01000 title) (2026-08). Source: Hagstofa VIS01000. Consumer price index (vísitala neysluverðs). Table last updated 27 Aug 2026; the September 2026 index was not yet published on 28 Sep 2026.
- `cpiInflation12m` = 5.6 % change over 12 months (2026-08). Source: Hagstofa VIS01000. Headline 12-month CPI inflation. Jul 2026: 5.3%, Jun 2026: 5.2%.
- `cpiExHousingInflation12m` = 5.2 % change over 12 months (2026-08). Source: Hagstofa VIS01000 (Index = CPILH). CPI less housing cost. Index level 553.8. Jul 2026: 4.8%.
- `cpiInflationMonthly` = 0.2 % change on previous month (2026-08). Source: Hagstofa VIS01000. Month-on-month change, not annualised.
- `cpiInflation3mAnnualised` = 6.2 % per year, annualised 3-month change (2026-08). Source: Hagstofa VIS01000. Annualised rate over the latest 3 months, not seasonally adjusted. 6-month annualised: 6%.
- `wageIndex` = 1149.3 index points (LAU04000 long series from 1989) (2026-08). Source: Hagstofa LAU04000. Wage index (launavísitala), all employees. Monthly change in Jan 2026 was +3.4%, the largest in the past year.
- `wageIndex12m` = 5.7 % change over 12 months (2026-08). Source: Hagstofa LAU04000. Aug 2025: 7.7%, Jan 2026: 7.4%.
- `realWageGrowth12m` = 0.09 % change over 12 months (2026-08). Source: Derived: LAU04000 and VIS01000. Wage index 12-month change deflated by headline CPI 12-month change: (1.057/1.056 - 1). Hagstofa also publishes its own real wage index (not fetched).

## Labour market

- `unemploymentLFS` = 6.8 % of labour force (16-74) (2026-08). Source: Hagstofa VIN00002. Labour force survey, seasonally adjusted, monthly. Very noisy month to month (Jun 4.8, Jul 6.6, Aug 6.8). Prefer unemploymentLFStrend or the quarterly rate for a starting value.
- `unemploymentLFS3mAvg` = 6.07 % of labour force (16-74) (2026-06..2026-08). Source: Derived: Hagstofa VIN00002. Simple average of the seasonally adjusted monthly rates for Jun, Jul and Aug 2026.
- `unemploymentLFStrend` = 5.8 % of labour force (16-74) (2026-08). Source: Hagstofa VIN00003. LFS trend series (smoothed). Best single estimate of the current rate. Trend 16-24: 11.1%, 25-74: 4.8%.
- `unemploymentLFS_16_24` = 14.2 % of labour force aged 16-24 (2026-08). Source: Hagstofa VIN00002. Seasonally adjusted monthly; noisy (Jul 6.7, Aug 14.2). Trend Aug 2026: 11.1%.
- `unemploymentLFS_25_74` = 5.3 % of labour force aged 25-74 (2026-08). Source: Hagstofa VIN00002. Seasonally adjusted monthly. Trend Aug 2026: 4.8%.
- `unemploymentLFSq` = 6.5 % of labour force (16-74) (2026-Q2). Source: Hagstofa VIN00910. Quarterly LFS, not seasonally adjusted. 2026Q1: 7.3%, 2025Q2: 3.5%.
- `unemploymentLFSq_16_24` = 17.3 % of labour force aged 16-24 (2026-Q2). Source: Hagstofa VIN00910. Not seasonally adjusted. 2026Q1: 17.9%.
- `unemploymentLFSq_25_54` = 4.9 % of labour force aged 25-54 (2026-Q2). Source: Hagstofa VIN00910. Not seasonally adjusted. 2026Q1: 6.2%.
- `unemploymentLFSq_55_74` = 2.2 % of labour force aged 55-74 (2026-Q2). Source: Hagstofa VIN00910. Not seasonally adjusted. 2026Q1: 2.9%.
- `employmentRateLFSq` = 75.8 % of population aged 16-74 (2026-Q2). Source: Hagstofa VIN00910. Employed as share of population, not seasonally adjusted.
- `unemploymentLFS2025` = 4.3 % of labour force (16-74) (2025). Source: Hagstofa VIN00911. Annual average 2025 (2024: 3.3). By age 2025: 16-24 9.2%, 25-54 4%, 55-74 1.5%.
- `labourForceLFS` = 233700 persons (16-74) (2026-08). Source: Hagstofa VIN00002. Seasonally adjusted labour force; employed 217800, unemployed 15900. Trend labour force: 231400.

## GDP and expenditure

- `gdpNominal2025ISKbn` = 4941.211 billion ISK, current prices (2025). Source: Hagstofa THJ01102. GDP at market prices, 2025 (4941211 m ISK), September 2026 vintage. 2024: 4576629 m ISK. Nominal growth 2025: 7.97%.
- `gdpRealGrowth2025` = 1.09 % change on previous year, volume (2025). Source: Derived: Hagstofa THJ01103. From GDP at constant prices. 2024: -0.9%.
- `gdpDeflatorGrowth2025` = 6.81 % change on previous year (2025). Source: Derived: THJ01102 / THJ01103. Implicit GDP deflator: nominal growth divided by volume growth.
- `gdpRealGrowthYoY_2026Q2` = -1.1 % change on same quarter a year earlier, volume (2026-Q2). Source: Hagstofa THJ01601. Not seasonally adjusted. 2026Q1: 3.8%. Seasonally adjusted y/y: 2026Q2 0.3%, 2026Q1 3.7%.
- `gdpRealGrowthQoQsa_2026Q2` = -3 % change on previous quarter, volume, seasonally adjusted (2026-Q2). Source: Hagstofa THJ01601. Not annualised. 2026Q1: +3.7% (a large Q1 jump then fall). 2025Q4: -0.9%.
- `gdpRealGrowthYoY_2026Q1` = 3.8 % change on same quarter a year earlier, volume (2026-Q1). Source: Hagstofa THJ01601. Not seasonally adjusted.
- `gdpRealGrowthQoQsa_2026Q1` = 3.7 % change on previous quarter, volume, seasonally adjusted (2026-Q1). Source: Hagstofa THJ01601. Not annualised.
- `gdpNominal4QtoQ2_2026ISKbn` = 5138.861 billion ISK, current prices, sum of 4 quarters (2025-Q3..2026-Q2). Source: Derived: Hagstofa THJ01601. Rolling annual nominal GDP to 2026Q2. H1 2026 nominal GDP was 8.29% above H1 2025.
- `gdpNominalQ2_2026ISKbn` = 1286.832 billion ISK, current prices, one quarter (not annualised) (2026-Q2). Source: Hagstofa THJ01601. Not seasonally adjusted. Seasonally adjusted: 1292.989 bn.
- `consumptionShare2025` = 49.37 % of GDP (2025). Source: Hagstofa THJ01102. Private (household + NPISH) final consumption 2439647 m ISK.
- `govConsumptionShare2025` = 25.99 % of GDP (2025). Source: Hagstofa THJ01102. Government final consumption 1284176 m ISK.
- `investmentShare2025` = 26.86 % of GDP (2025). Source: Hagstofa THJ01102. Gross fixed capital formation 1327066 m ISK.
- `businessInvestmentShare2025` = 17.71 % of GDP (2025). Source: Hagstofa THJ01601 (sum of 2025 quarters). Business-sector investment 875037 m ISK. The three parts sum to annual GFCF in THJ01102 (1327066 vs 1327066).
- `housingInvestmentShare2025` = 5.06 % of GDP (2025). Source: Hagstofa THJ01601 (sum of 2025 quarters). Residential construction 250001 m ISK.
- `publicInvestmentShare2025` = 4.09 % of GDP (2025). Source: Hagstofa THJ01601 (sum of 2025 quarters). Government investment 202028 m ISK.
- `inventoryChangeShare2025` = -0.09 % of GDP (2025). Source: Hagstofa THJ01102. Changes in inventories -4304 m ISK.
- `exportsShare2025` = 40.42 % of GDP (2025). Source: Hagstofa THJ01102. Exports 1997388 m ISK: goods 19.25%, services 21.18%.
- `importsShare2025` = 42.56 % of GDP (2025). Source: Hagstofa THJ01102. Imports 2102762 m ISK (shown as a positive share): goods 27.1%, services 15.46%.

## External balance

- `currentAccount2025pctGDP` = -4 % of GDP (2025). Source: Derived: Hagstofa THJ01102. Goods -388032 + services 282658 + primary income -18849 + net current transfers (secondary income) -73517 = -197740 m ISK. THJ01102 row '11. Balance on current account' (-124223 m, -2.51% of GDP) omits secondary income. National-accounts basis; the Central Bank's balance-of-payments figure may differ.
- `currentAccount2025ISKbn` = -197.74 billion ISK (2025). Source: Derived: Hagstofa THJ01102. See currentAccount2025pctGDP.
- `primaryIncomeBalance2025pctGDP` = -0.38 % of GDP (2025). Source: Hagstofa THJ01102. Net primary income from abroad (wages and property income). 2024: -1.04%.
- `tradeBalanceGS_2026Q2ISKbn` = -87.785 billion ISK, one quarter (2026-Q2). Source: Hagstofa UTA05002. Balance of trade in goods and services, BoP basis: goods -154.4 bn, services 66.6 bn. 2026Q1: 10.4 bn. NOT the full current account: excludes primary and secondary income (Hagstofa publishes those only annually).
- `tradeBalanceGS_2026Q2pctGDP` = -6.82 % of quarterly GDP (2026-Q2). Source: Derived: UTA05002 / THJ01601. Q2 goods-and-services balance over Q2 nominal GDP (both not seasonally adjusted; Q2 is seasonally weak for tourism). 2026Q1: 0.81%.

## General government

- `govBalance2025pctGDP` = -2.6 % of GDP (2025). Source: Hagstofa THJ05111. General government financial balance (net lending) -130831 m ISK. 2024: -4.1%.
- `govRevenue2025pctGDP` = 43 % of GDP (2025). Source: Hagstofa THJ05111. Total revenue 2125023 m ISK.
- `govExpenditure2025pctGDP` = 45.7 % of GDP (2025). Source: Hagstofa THJ05111. Total expenditure 2255854 m ISK.
- `govBalanceQ2_2026pctGDP` = -3.8 % of quarterly GDP (2026-Q2). Source: Hagstofa THJ05811. General government financial balance -48.3 bn ISK in the quarter. 2026Q1: -1.3% (-16.6 bn). Not seasonally adjusted.
- `govBalance4QtoQ2_2026pctGDP` = -2.76 % of GDP, 4-quarter sum (2025-Q3..2026-Q2). Source: Derived: THJ05811 / THJ01601. Sum of the last four quarterly balances -141.7 bn ISK over 4-quarter nominal GDP.
- `govDebt2025pctGDP` = 56.68 % of GDP (2025). Source: Derived: Hagstofa THJ05181. Debt securities 1849178 + loans 951516 = 2800694 m ISK, end-2025, general government, non-consolidated. Excludes unfunded public-employee pension liabilities (25.2% of GDP) and other payables (6.4%).
- `govDebt2025ISKbn` = 2800.694 billion ISK (2025). Source: Derived: Hagstofa THJ05181. See govDebt2025pctGDP.
- `govLiabilities2025pctGDP` = 88.3 % of GDP (2025). Source: Hagstofa THJ05181. Total general government liabilities incl. pension obligations; 4360703 m ISK.
- `govFinancialAssets2025pctGDP` = 50 % of GDP (2025). Source: Hagstofa THJ05181. Deposits 10.1%, loans 10.7%, equity 21.3%, other 7.9%.
- `govNetFinancialAssets2025pctGDP` = -38.2 % of GDP (2025). Source: Hagstofa THJ05181. Financial assets less all liabilities. 2024: -34.1%.

## Population

- `populationTotal` = 394324 persons (2026-01-01). Source: Hagstofa MAN00101. Resident population on 1 January 2026.
- `population_0_17` = 84881 persons (2026-01-01). Source: Hagstofa MAN00101. Sum of single years of age, 1 January 2026; 21.53% of total.
- `population_18_34` = 96712 persons (2026-01-01). Source: Hagstofa MAN00101. Sum of single years of age, 1 January 2026; 24.53% of total.
- `population_35_66` = 157307 persons (2026-01-01). Source: Hagstofa MAN00101. Sum of single years of age, 1 January 2026; 39.89% of total.
- `population_67_plus` = 55424 persons (2026-01-01). Source: Hagstofa MAN00101. Sum of single years of age, 1 January 2026; 14.06% of total.
- `populationLatestQuarter` = 396500 persons (2026-Q2). Source: Hagstofa MAN10001. Quarterly population figure for 2026Q2, no age breakdown; foreign citizens 71130 (17.9%).

## Employment by sector (register data)

- `employmentRegisterTotal` = 225492 persons employed (register, main job) (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. 12-month average of monthly register-based employment, all ages, residents and non-residents. Jul 2026 alone: 238838 (seasonal peak).
- `empShareAgriFishing` = 3.05 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. A Agriculture, forestry and fishing: 6882 persons (12-month average).
- `empShareMiningManufacturing` = 9.65 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. B-C Mining and manufacturing: 21768 persons (12-month average).
- `empShareEnergyWater` = 1.45 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. D-E Electricity and water supply: 3265 persons (12-month average).
- `empShareConstruction` = 8.49 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. F Construction: 19138 persons (12-month average).
- `empShareTrade` = 11.91 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. G Wholesale and retail trade: 26850 persons (12-month average).
- `empShareTransport` = 5.85 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. H Transportation and storage: 13199 persons (12-month average).
- `empShareAccommodationFood` = 7.17 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. I Accommodation and food service: 16159 persons (12-month average).
- `empShareInfoComm` = 3.86 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. J Information and communication: 8704 persons (12-month average).
- `empShareFinance` = 2.6 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. K Financial and insurance: 5858 persons (12-month average).
- `empShareRealEstate` = 0.91 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. L Real estate: 2047 persons (12-month average).
- `empShareProfessionalAdmin` = 9.4 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. M-N Professional, scientific, technical, administrative and support: 21205 persons (12-month average). CAVEAT: in the fetched table the labels of 'M-N' and 'M' appear swapped (the row labelled 'M' equals M + N); this value uses the row that equals M + N.
- `empSharePublicEducationHealth` = 30.5 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. O-Q Public administration, education, health and social work: 68765 persons (12-month average).
- `empShareArts` = 2.64 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. R Arts, entertainment and recreation: 5946 persons (12-month average).
- `empShareOtherServices` = 2.5 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. S-X Other services: 5637 persons (12-month average).
- `empShareTourismIndustries` = 12.81 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. Tourism industries (Hagstofa aggregate, overlaps H, I, N): 28886 persons (12-month average).
- `empShareFishingIndustry` = 3.45 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. Fishing industry A:03 + C:10.2 (overlaps A and C): 7790 persons (12-month average).
- `empShareBasicMetals` = 0.89 % of register-employed persons (2025-08..2026-07). Source: Derived: Hagstofa VIN10022. C:24 Basic metals incl. aluminium smelters (inside B-C): 2007 persons (12-month average).

## Financial accounts by sector, end-2024

- `hhFinancialAssets` = 12638.7 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Households (S14) total financial assets: 12638671 m ISK = 276.2% of 2024 GDP (4576629 m). Of which pension entitlements and insurance (F6) 9540.6 bn, equity and fund shares 1185.6 bn, debt securities 295.6 bn.
- `hhDeposits` = 1524.7 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Households currency and deposits: 1524690 m ISK = 33.3% of 2024 GDP (4576629 m).
- `hhPensionEntitlements` = 9540.6 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Households insurance, pension and standardised guarantee schemes (F6): 9540557 m ISK = 208.5% of 2024 GDP (4576629 m). Mirror of pension-fund and insurer technical reserves.
- `hhLiabilities` = 3357.3 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Households total financial liabilities: 3357307 m ISK = 73.4% of 2024 GDP (4576629 m).
- `hhLoans` = 3291.9 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Households loans (liabilities): 3291887 m ISK = 71.9% of 2024 GDP (4576629 m). Mostly mortgages. CBI's end-2025 household debt: 69.9% of 2025 GDP (see calibration_notes.md).
- `hhNetFinancialAssets` = 9281.4 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Households net financial assets: 9281364 m ISK = 202.8% of 2024 GDP (4576629 m).
- `firmFinancialAssets` = 7893.4 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Non-financial corporations (S11) total financial assets: 7893374 m ISK = 172.5% of 2024 GDP (4576629 m). Deposits 867.3 bn, loans 2197.8 bn, equity 2887.7 bn, other receivables 1756.4 bn.
- `firmDeposits` = 867.3 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Non-financial corporations currency and deposits: 867294 m ISK = 19% of 2024 GDP (4576629 m).
- `firmLiabilities` = 13411.4 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Non-financial corporations total liabilities: 13411371 m ISK = 293% of 2024 GDP (4576629 m). Includes equity issued (F5) 5822.4 bn; non-consolidated, includes inter-company claims.
- `firmLoans` = 4875.2 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Non-financial corporations loans (liabilities): 4875173 m ISK = 106.5% of 2024 GDP (4576629 m). Non-consolidated (includes inter-company loans). Debt securities issued: 845.3 bn. CBI consolidated corporate debt end-2025: 75.5% of GDP.
- `firmDebtSecurities` = 845.3 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Non-financial corporations debt securities issued: 845293 m ISK = 18.5% of 2024 GDP (4576629 m).
- `govFinancialAssetsFA` = 2603.9 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. General government (S13) total financial assets: 2603927 m ISK = 56.9% of 2024 GDP (4576629 m). Financial-accounts basis; THJ05181 (government finance statistics) has end-2025 figures, see govFinancialAssets2025pctGDP.
- `govLiabilitiesFA` = 4166.5 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. General government total liabilities: 4166528 m ISK = 91% of 2024 GDP (4576629 m). Debt securities 2061.3 bn, loans 827.3 bn, pension obligations (F6) 1058.8 bn.
- `pfFinancialAssets` = 8201 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Pension funds (S129) total financial assets: 8200975 m ISK = 179.2% of 2024 GDP (4576629 m). Debt securities 2669 bn, loans (mostly mortgages) 682.7 bn, equity and fund shares (incl. foreign) 4633.6 bn, deposits 176.4 bn.
- `pfLiabilities` = 8249.5 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Pension funds total liabilities: 8249486 m ISK = 180.3% of 2024 GDP (4576629 m). Almost all pension entitlements (F6) 8239.5 bn.
- `pfLoans` = 682.7 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Pension funds loans (assets): 682746 m ISK = 14.9% of 2024 GDP (4576629 m). Mostly household mortgages; the pension funds association reports 796.4 bn of household housing loans at end-2025.
- `bankFinancialAssets` = 5908.9 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Other deposit-taking corporations (S122, banks) total financial assets: 5908861 m ISK = 129.1% of 2024 GDP (4576629 m). Loans 4577.5 bn, debt securities 680.8 bn, deposits (incl. at CBI) 403.3 bn.
- `bankLoans` = 4577.5 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Banks (S122) loans (assets): 4577525 m ISK = 100% of 2024 GDP (4576629 m).
- `bankLiabilities` = 5792.4 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Banks total liabilities: 5792408 m ISK = 126.6% of 2024 GDP (4576629 m). Includes equity issued (F5) 821.1 bn.
- `bankDepositLiabilities` = 3020.7 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Banks currency and deposits (liabilities): 3020691 m ISK = 66% of 2024 GDP (4576629 m). Deposits held by all sectors, incl. non-residents.
- `bankDebtSecurities` = 1499.4 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Banks debt securities issued (covered bonds, senior bonds): 1499419 m ISK = 32.8% of 2024 GDP (4576629 m).
- `cbFinancialAssets` = 953.4 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Central Bank (S121) total financial assets: 953446 m ISK = 20.8% of 2024 GDP (4576629 m). Debt securities 732.8 bn (largely FX reserves). Liabilities: currency and deposits 744.5 bn.
- `nationNetFinancialAssets` = 2337.9 billion ISK (2024). Source: Hagstofa THJ10001, stocks 31/12. Domestic sectors (S1) net financial assets = net international investment position: 2337947 m ISK = 51.1% of 2024 GDP (4576629 m). Rest of world (S2) net financial assets: -2314.8 bn.

## Missing or not available from Hagstofa

- Current account for the latest quarter (2026Q2): Hagstofa publishes only the quarterly balance of trade in goods and services (UTA05002, see `tradeBalanceGS_2026Q2ISKbn`). Quarterly primary and secondary income, and so the full current account, come from the Central Bank of Iceland's balance of payments and were not fetched.
- Government debt for the latest quarter: Hagstofa's government balance sheets (THJ05181, THJ05281) are annual, latest end-2025. The quarterly tables (THJ05811, THJ05812) cover revenue, expenditure and balance only.
- Financial accounts for end-2025: THJ10001 runs to 2024 (last updated 9 Oct 2025). The previous update came on 9 Oct 2025, so the end-2025 figures are probably weeks away; all sector balance sheets above are end-2024.
- Population by age for a later date than 1 January 2026: the quarterly table MAN10001 has no age breakdown.
- Unemployment for the model's age groups (18-34, 35-66, 67+): the LFS covers ages 16-74 and publishes 16-24, 25-54, 55-74 (quarterly) and 16-24, 25-74 (monthly). No 67+ rate exists.
- CPI and wage index for September 2026: not yet published on 28 September 2026 (latest is August).
- Real wage index as published by Hagstofa: not fetched; `realWageGrowth12m` is our own ratio of the wage and price indices.

## General caveats

- Monthly seasonally adjusted LFS unemployment is noisy (swings of 1-2 points month to month). Use `unemploymentLFStrend` (5.8%) or the quarterly rate for a starting value.
- The quarterly GDP series is not seasonally adjusted unless the id says `sa`. 2026Q1 was unusually strong and 2026Q2 unusually weak on a seasonally adjusted basis.
- 2025 national accounts are the September 2026 vintage (THJ01102 updated 4 Sep 2026; quarterly THJ01601 updated 31 Aug 2026). The 2025 quarterly sums equal the annual totals to within 1 m ISK.
- Financial accounts are non-consolidated: firms' loans include inter-company loans, and "liabilities" include equity issued (F5) for corporations.
- Ratios to GDP use the GDP of the same year as the stock or flow (2024 GDP 4,576,629 m ISK; 2025 GDP 4,941,211 m ISK).
