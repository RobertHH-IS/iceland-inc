/* ---------------------------------------------------------------- 10_params.js
 * THE parameter file. Every parameter: {id, value, unit, category, basis, description}.
 * category: IDENTITY | CONTRACT | BEHAVIOUR | POLICY.
 * basis: "data: <source>" | "assumed" | "placeholder" | "calibrated to target".
 * Data values are read from CALIB_DATA (data/calibration.json, injected at build time); when a value is
 * missing the fallback is used and flagged "placeholder". Values marked "calibrated to target" are
 * solved by the steady-state routine (40_steady.js) and filled in at model creation.
 * Units: flows and stocks in % of baseline annual GDP (baseline GDP = 100); rates as fractions per year;
 * speeds (lam*) in 1/year (mean lag = 1/lam years).
 */
var CAL = (typeof CALIB_DATA !== 'undefined' && CALIB_DATA) || {};
var GDP_BN = 4941.211;   // 2025 nominal GDP, bn ISK (Hagstofa THJ01102), used to turn bn ISK into % of GDP

function dat(path, fallback, f) {
  var c = CAL[path];
  if (!c || typeof c.value !== 'number' || !isFinite(c.value)) return { v: fallback, b: 'placeholder (data pending: ' + path + ')' };
  return { v: f ? f(c.value) : c.value, b: 'data: ' + c.source + ' [' + path + ', ' + c.year + ']' };
}

function paramSpec() {
  var L = [], A = 'assumed', CT = 'calibrated to target', PH = 'placeholder';
  function P(id, v, unit, cat, basis, desc) { L.push({ id: id, value: v, unit: unit, category: cat, basis: basis, description: desc }); }
  function PD(id, d, unit, cat, desc) { P(id, d.v, unit, cat, d.b, desc); }
  var pct = function (x) { return x / 100; };
  var hh = 'households.', cof = 'government_cofog_pct_gdp.', eco = 'government_economic_pct_gdp.', sp = cof + 'social_protection_breakdown.';

  // --- scale and time
  P('Y0', 100, '% of baseline GDP', 'IDENTITY', A, 'Baseline annual nominal GDP. Every stock and flow is measured in % of this.');
  P('dt', 1 / 12, 'year', 'IDENTITY', A, 'Length of one model step (one month).');

  // --- public spending channels (real, % of baseline GDP)
  var gH = dat(cof + 'health', 8.58), gE = dat(cof + 'education', 7.03), tot = dat(cof + 'total', 45.65);
  var gInt = dat(eco + 'interest', 4.66), gBen = dat(eco + 'social_benefits', 7.28), gCap = dat(eco + 'gross_fixed_capital_formation', 4.18);
  var gComp = dat(eco + 'compensation_of_employees', 14.4);
  PD('gHealth', gH, '% of GDP', 'POLICY', 'Health spending (public wages + purchases).');
  PD('gEdu', gE, '% of GDP', 'POLICY', 'Education spending (public wages + purchases).');
  P('gOther', tot.v - gInt.v - gBen.v - gCap.v - gH.v - gE.v, '% of GDP', 'POLICY',
    'data: derived = COFOG total - interest - social benefits - investment - health - education (THJ05142/THJ05143, 2025)',
    'Other public services (administration, police, culture, roads upkeep, subsidies ...).');
  PD('gInv', gCap, '% of GDP', 'POLICY', 'Public investment, bought from domestic firms.');
  P('wsHealth', 0.55, 'share', 'POLICY', A, 'Share of health spending that is public wages (incl. employer pension contribution).');
  P('wsEdu', 0.70, 'share', 'POLICY', A, 'Share of education spending that is public wages.');
  P('compG', gComp.v, '% of GDP', 'IDENTITY', gComp.b, 'Public compensation of employees; fixes the wage share of other services.');
  var trUE = dat(sp + 'unemployment', 0.76), fam = dat(sp + 'family_children', 2.65), hou = dat(sp + 'housing', 0.31);
  P('trOA', gBen.v - trUE.v - fam.v - hou.v, '% of GDP', 'POLICY',
    'data: derived = social benefits - unemployment - family - housing (THJ05143/THJ05142, 2025)', 'Old-age and disability cash transfers (Social Insurance, TR).');
  var pubPen = dat('pensions.public_old_age_pension_pct_gdp', 2.48);
  P('oaShareO', pubPen.v / (gBen.v - trUE.v - fam.v - hou.v), 'share', 'POLICY', pubPen.b + ' / old-age and disability transfers',
    'Share of old-age and disability transfers paid to the old (67+): the public old-age pension.');
  P('oaShareY', 0.07, 'share', 'POLICY', A, 'Share of old-age and disability transfers (disability) paid to the young; the rest goes to working age.');
  P('trFam', fam.v + hou.v, '% of GDP', 'POLICY', 'data: COFOG family & children + housing (THJ05142, 2025)', 'Family, parental-leave and housing benefits.');
  P('famShareY', 0.55, 'share', 'POLICY', A, 'Share of family and housing benefits paid to the young (parental leave, rent support).');
  P('ueTarget', trUE.v, '% of GDP', 'POLICY', trUE.b, 'Baseline unemployment benefits; fixes the replacement rate.');

  // --- taxes
  P('vatTarget', dat('tax_revenue_pct_gdp.vat_and_taxes_on_goods', 12.01).v, '% of GDP', 'POLICY',
    dat('tax_revenue_pct_gdp.vat_and_taxes_on_goods', 12.01).b, 'Baseline VAT and taxes on goods; fixes the effective VAT rate on consumption.');
  var cit = dat('tax_revenue_pct_gdp.corporate_income_tax', 2.99);
  P('citTarget', cit.v, '% of GDP', 'POLICY', cit.b, 'Baseline corporate income tax revenue; fixes the effective tax rate on gross profits.');
  P('css', 0.0635, 'rate', 'POLICY', 'assumed (statutory social security tax, tryggingagjald)', 'Payroll tax on private wages.');
  P('phiTau', 0.25, 'rate per unit debt/GDP', 'POLICY', A, 'Debt-tied tax rule: income-tax rate rises 0.25 pp per pp of debt/GDP above baseline.');
  P('lamTau', 0.5, '1/yr', 'POLICY', A, 'Speed at which the debt-tied tax rule is phased in (slow stabiliser).');

  // --- pensions
  var conT = dat('pensions.pf_contributions_pct_gdp', 9.69), pfA = dat('pensions.pf_assets_pct_gdp', 179.7), pfF = dat('pensions.pf_foreign_asset_share', 41.5);
  P('cEr', 0.115, 'share of gross wage', 'CONTRACT', 'assumed (legal minimum employer contribution 11.5%)', 'Employer pension contribution, on top of the gross wage.');
  P('conTarget', 7.39, '% of GDP', 'CONTRACT', 'data: mutual-insurance contributions 365.2 bn (Landssamtok lifeyrissjoda, 2025); ' + conT.b + ' total incl. personal pensions ' + conT.v,
    'Baseline pension contributions (mutual schemes); fixes the employee contribution rate.');
  PD('pfAssets', pfA, '% of GDP', 'IDENTITY', 'Pension fund total assets.');
  PD('pfForeignShare', pfF, '% of PF assets', 'IDENTITY', 'Foreign share of pension fund assets.');
  P('pfDepShare', 0.04, 'share of PF assets', 'BEHAVIOUR', PH, 'Pension funds\' deposit (liquidity) share.');
  P('pfNWshare', 0.05, 'share of PF assets', 'IDENTITY', PH, 'Pension funds\' surplus (assets above accrued rights).');
  P('eShareW', 0.55, 'share', 'IDENTITY', PH, 'Share of pension rights held by working-age members (rest: pensioners).');

  // --- labour market
  var comp = 2624.4 / GDP_BN * 100;
  P('compTotal', comp, '% of GDP', 'IDENTITY', 'data: compensation of employees 2,624.4 bn (Hagstofa THJ08420, 2025)', 'Total compensation of employees (wages + employer contributions + payroll tax).');
  PD('fxEmpShare', dat('export_sector.employment_share', 14.3, pct), 'share', 'IDENTITY', 'Exporters\' share of employment (and of the private+public wage bill).');
  var gr = ['young_18_34', 'working_35_66', 'old_67_plus'], pk = ['age_18_34', 'age_35_66', 'age_67_plus'], G3 = ['Y', 'W', 'O'];
  var fall = { pop: [96712, 157307, 55424], er: [83.5, 83.7, 18.6], ur: [5.8, 3.5, 1.2], ws: [28.64, 66.81, 3.26], dep: [14.07, 43.72, 42.2], mort: [22.47, 68.41, 9.12] };
  var wsum = 0, ws3 = [];
  for (var g = 0; g < 3; g++) { ws3[g] = dat(hh + gr[g] + '.share_of_total_wage_income', fall.ws[g]); wsum += ws3[g].v; }
  for (g = 0; g < 3; g++) {
    PD('pop' + G3[g], dat('population.' + pk[g], fall.pop[g], function (x) { return x / 1000; }), 'thousand persons', 'IDENTITY', 'Population of the age group.');
    PD('er' + G3[g], dat(hh + gr[g] + '.employment_rate', fall.er[g], pct), 'share of population', 'IDENTITY', 'Employment rate of the age group.');
    PD('u0' + G3[g], dat(hh + gr[g] + '.unemployment_rate', fall.ur[g], pct), 'share of labour force', 'IDENTITY', 'Baseline unemployment rate of the age group.');
    P('wsh' + G3[g], ws3[g].v / wsum, 'share of wage bill', 'IDENTITY', ws3[g].b + ' (renormalised to exclude under-18s)', 'Age group\'s share of the wage bill.');
  }
  P('cycY', 1.8, 'relative', 'BEHAVIOUR', A, 'Cyclicality of young employment (x average swing).');
  P('cycW', 0.85, 'relative', 'BEHAVIOUR', A, 'Cyclicality of working-age employment.');
  P('cycO', 0.5, 'relative', 'BEHAVIOUR', A, 'Cyclicality of old-age employment.');
  P('mig', 0.3, 'share', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Migration buffer: share of an employment change met by workers arriving/leaving (labour force moves with it).');
  P('sigW', 0.15, 'elasticity', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Employment vs the real product wage (wage / domestic price): firms economise on staff when wages outpace prices.');
  P('okun', 0.6, 'elasticity', 'BEHAVIOUR', A, 'Employment elasticity to sector output (labour hoarding below 1).');
  P('lamN', 3, '1/yr', 'BEHAVIOUR', A, 'Employment adjustment speed.');

  // --- exports, imports, investment
  var ex = 'exports_pct_gdp.';
  PD('xFish', dat(ex + 'marine_products', 7.26), '% of GDP', 'IDENTITY', 'Marine exports (priced in foreign currency).');
  PD('xAlu', dat(ex + 'aluminium', 6.44), '% of GDP', 'IDENTITY', 'Aluminium exports (priced in foreign currency).');
  PD('xTour', dat(ex + 'tourism', 13.08), '% of GDP', 'IDENTITY', 'Tourism exports (priced in kronur).');
  P('xOther', dat(ex + 'other_goods', 5.54).v + dat(ex + 'other_services', 8.1).v, '% of GDP', 'IDENTITY', dat(ex + 'other_services', 8.1).b + ' + other goods',
    'Other goods and services exports (priced in kronur).');
  PD('vaFXtarget', dat('export_sector.value_added_share_of_gdp', 12.96), '% of GDP', 'IDENTITY', 'Exporters\' value added; fixes their purchases of domestic inputs.');
  P('iFD0', 13, '% of GDP', 'BEHAVIOUR', PH + ' (incl. construction for the housing market)', 'Baseline investment of domestic-market firms.');
  P('iFX0', 3, '% of GDP', 'BEHAVIOUR', PH, 'Baseline investment of exporters.');
  PD('muC', dat('cpi_weights.imported_goods', 25, pct), 'share', 'BEHAVIOUR', 'Import share of consumer spending (proxy: CPI imported-goods weight).');
  P('muG', 0.4, 'share', 'BEHAVIOUR', PH + ' (set within a plausible 0.3-0.4 range by the fiscal-multiplier check)', 'Import share of government purchases (medicines, equipment).');
  PD('muI', dat('import_content.investment', 44.4, pct), 'share', 'BEHAVIOUR', 'Import share of investment goods (TiVA import content of GFCF).');
  PD('muX', dat('import_content.exports', 28.4, pct), 'per unit', 'BEHAVIOUR', 'Imported inputs per unit of exports (alumina, fuel, aircraft services; TiVA import content of exports).');
  P('epsM', 0.6, 'elasticity', 'BEHAVIOUR', A, 'Import volumes vs the real exchange rate.');
  P('eFish', 0.2, 'elasticity', 'BEHAVIOUR', A, 'Marine export volume vs real exchange rate (quota-bound).');
  P('eAlu', 0.05, 'elasticity', 'BEHAVIOUR', A, 'Aluminium export volume vs real exchange rate (capacity-bound).');
  P('eTour', 1.0, 'elasticity', 'BEHAVIOUR', A, 'Tourism export volume vs real exchange rate.');
  P('eOther', 0.8, 'elasticity', 'BEHAVIOUR', A, 'Other export volume vs real exchange rate.');
  P('lamRer', 1.0, '1/yr', 'BEHAVIOUR', A, 'Speed at which trade volumes react to the real exchange rate.');

  // --- balance sheets (% of GDP)
  var hdep = 1557.4 / GDP_BN * 100;
  P('hhDep', hdep, '% of GDP', 'IDENTITY', 'data: household deposits 1,557.4 bn on tax returns (Hagstofa THJ09000, end-2025)', 'Household deposits.');
  for (g = 0; g < 3; g++) PD('depSh' + G3[g], dat(hh + gr[g] + '.share_of_household_deposits', fall.dep[g], pct), 'share', 'IDENTITY', 'Age group\'s share of household deposits.');
  P('mortTot', 2909.2 / GDP_BN * 100, '% of GDP', 'IDENTITY', 'data: household housing loans 2,909.2 bn (lifeyrismal.is sheet 4.2, CBI data, end-2025)', 'Household mortgage debt (banks + pension funds + HFF).');
  PD('mortShY', dat(hh + 'young_18_34.share_of_household_mortgage_debt', 22.47, pct), 'share', 'IDENTITY', 'Young households\' share of mortgage debt (the old\'s 9% is folded into working age: the model\'s old own outright).');
  PD('theta', dat('money_credit.indexed_share_of_mortgages', 45, pct), 'share', 'CONTRACT', 'CPI-indexed share of mortgages (both borrower groups).');
  P('pfMortI', 590.8 / GDP_BN * 100, '% of GDP', 'IDENTITY', 'data: pension-fund indexed housing loans 590.8 bn (lifeyrismal.is, end-2025)', 'Pension-fund indexed mortgages.');
  P('pfMortN', 205.6 / GDP_BN * 100, '% of GDP', 'IDENTITY', 'data: pension-fund non-indexed housing loans 205.6 bn (lifeyrismal.is, end-2025)', 'Pension-fund non-indexed mortgages.');
  var corp = dat('money_credit.corporate_debt_pct_gdp', 75.5);
  P('loanFD', 0.55 * corp.v * 0.75, '% of GDP', 'IDENTITY', 'placeholder: ' + corp.b + ' x assumed domestic-bank share 0.55 x domestic-market share 0.75', 'Bank loans to domestic-market firms.');
  P('loanFX', 0.55 * corp.v * 0.25, '% of GDP', 'IDENTITY', 'placeholder: same total x exporters\' share 0.25', 'Bank loans to exporters.');
  PD('govDebt', dat('money_credit.govt_debt_pct_gdp', 56.7), '% of GDP', 'IDENTITY', 'Gross government debt.');
  P('govIdxShare', 0.35, 'share', 'CONTRACT', PH, 'CPI-indexed share of government debt (held by pension funds).');
  PD('pfGovShare', dat('pensions.pf_share_of_govt_bonds', 58.6, pct), 'share', 'IDENTITY', 'Pension funds\' share of government bonds (applied to all government debt; indexed bonds first).');
  P('bondCB', 1, '% of GDP', 'IDENTITY', PH, 'Central bank\'s government bonds.');
  P('bondO', 4, '% of GDP', 'IDENTITY', PH, 'Old households\' government bonds.');
  P('bondW', 0.072 * dat('money_credit.govt_debt_pct_gdp', 56.7).v, '% of GDP', 'IDENTITY', 'data: foreign holders 7.2% of Treasury bonds (calibration_notes, pensions.pf_share_of_govt_bonds) x government debt',
    'Non-residents\' government bonds (carry trade).');
  PD('m3', dat('money_credit.broad_money_m3_pct_gdp', 67.4), '% of GDP', 'IDENTITY', 'Broad money M3; fixes domestic-market firms\' deposits (money itself stays a sum of deposits).');
  P('fxr', 18, '% of GDP', 'IDENTITY', PH, 'Central bank foreign reserves.');
  P('tga', 5, '% of GDP', 'IDENTITY', PH, 'Treasury account at the central bank (target).');
  P('eqCB', 2, '% of GDP', 'IDENTITY', PH, 'Central bank equity.');
  P('depFX', 5, '% of GDP', 'IDENTITY', PH, 'Exporters\' deposits.');
  P('depW', 3, '% of GDP', 'IDENTITY', PH, 'Non-residents\' krona deposits.');
  P('eqHY', 1, '% of GDP', 'IDENTITY', PH, 'Domestic shares held by young households (balance-sheet display only).');
  P('eqHW', 10, '% of GDP', 'IDENTITY', PH, 'Domestic shares held by working-age households (display only).');
  P('eqHO', 5, '% of GDP', 'IDENTITY', PH, 'Domestic shares held by old households (display only).');
  P('eqW', 10, '% of GDP', 'IDENTITY', PH, 'Foreign-owned equity in exporters, aluminium smelters (display only).');
  P('pfEqFDshare', 0.7, 'share', 'IDENTITY', PH, 'Share of equity (pension funds, households) that is in domestic-market firms.');
  P('divFDY', 0.05, 'share', 'IDENTITY', PH, 'Share of domestic firms\' distributed profit (dividends and owners\' income) going to the young.');
  P('divFDW', 0.67, 'share', 'IDENTITY', PH, 'Share going to working age (owners, self-employed).');
  P('divFDO', 0.18, 'share', 'IDENTITY', 'assumed (67+ capital income 117.4 bn, Hagstofa THJ09001)', 'Share going to the old; the rest (10%) to pension funds.');
  P('fdiTarget', 0.33, '% of GDP', 'IDENTITY', 'data: equity income on inward FDI 2024, dividends + reinvested earnings (Eurostat bop_c6_a; calibration_notes export_sector)',
    'Baseline dividends to foreign owners of exporters; fixes the foreign share of exporters\' dividends.');
  P('divFXdomW', 0.55, 'weight', 'IDENTITY', PH, 'Domestic split of exporters\' dividends: working-age weight (old 0.15, pension funds 0.30).');
  P('house0', 200, '% of GDP', 'IDENTITY', PH, 'Value of the housing stock (memo item, non-financial).');
  var own = [0, 1, 2].map(function (g) { return dat(hh + gr[g] + '.home_ownership_rate', [66.6, 83.8, 88.4][g], pct).v * fall.pop[g] * [0.6, 1, 1][g]; });
  var ownB = 'data: home-ownership rate x population (' + dat(hh + 'young_18_34.home_ownership_rate', 0).b.replace(/^data: /, '') + ') x assumed relative home value (young 0.6)';
  P('hshY', own[0] / sum(own), 'share', 'IDENTITY', ownB, 'Young households\' share of housing wealth.');
  P('hshW', own[1] / sum(own), 'share', 'IDENTITY', ownB, 'Working-age households\' share of housing wealth (rest: old).');
  P('purY', 1.2, '% of GDP per yr', 'BEHAVIOUR', PH, 'Homes bought by the young from the old each year (net).');
  P('purW', 1.0, '% of GDP per yr', 'BEHAVIOUR', PH, 'Homes bought by working age from the old each year (net).');

  // --- banks
  P('kapT', 0.22, 'ratio', 'POLICY', 'assumed (total capital requirement ~20% + buffer)', 'Banks\' target capital ratio.');
  P('kapMin', 0.18, 'ratio', 'POLICY', A, 'Capital ratio at which the loan premium reaches its maximum.');
  P('rwM', 0.35, 'weight', 'POLICY', 'assumed (Basel standardised mortgage risk weight)', 'Risk weight on mortgages.');
  P('rwL', 1.0, 'weight', 'POLICY', 'assumed (Basel standardised corporate risk weight)', 'Risk weight on firm loans.');
  P('sCap', 0.02, 'rate', 'BEHAVIOUR', A, 'Loan premium when capital falls to the minimum.');
  P('lamEq', 1, '1/yr', 'BEHAVIOUR', A, 'Speed at which banks rebuild capital by cutting dividends.');
  P('lamDivB', 1, '1/yr', 'BEHAVIOUR', A, 'Bank dividend smoothing.');
  P('divBshG', 0.35, 'share', 'IDENTITY', 'assumed (state owns Landsbankinn)', 'Share of bank dividends paid to the government.');
  P('divBshPF', 0.35, 'share', 'IDENTITY', PH, 'Share of bank dividends paid to pension funds.');
  P('divBshW', 0.2, 'share', 'IDENTITY', PH, 'Share of bank dividends paid to working-age households (the rest to the old).');

  // --- rates (zero-inflation baseline, so real = nominal)
  P('i0', 0.03, 'rate', 'POLICY', A, 'Neutral key rate (real, zero-inflation baseline).');
  P('piT', 0, 'rate', 'POLICY', 'assumed (target set to 0 in the zero-inflation baseline; Iceland targets 2.5%)', 'Inflation target.');
  P('mD', 0.01, 'rate', 'BEHAVIOUR', A, 'Deposit margin below the key rate.');
  P('sB', 0.005, 'rate', 'CONTRACT', A, 'Government bond spread (floating-rate bonds).');
  P('sL', 0.025, 'rate', 'BEHAVIOUR', A, 'Firm loan spread.');
  P('sMN', 0.01, 'rate', 'BEHAVIOUR', A, 'Non-indexed mortgage spread.');
  P('rMI0', 0.025, 'rate', 'BEHAVIOUR', A, 'Real rate on indexed mortgages at baseline.');
  P('psiIdx', 0.4, 'ratio', 'BEHAVIOUR', A, 'Pass-through of the key rate to indexed real mortgage rates.');
  P('rBI0', 0.02, 'rate', 'CONTRACT', A, 'Real coupon on indexed government bonds.');
  P('sBB', 0.01, 'rate', 'CONTRACT', A, 'Bank bond spread over the key rate.');
  P('iF0', 0.02, 'rate', 'BEHAVIOUR', A, 'Cash yield on pension funds\' foreign assets and foreign rate.');
  P('iFXR', 0.02, 'rate', 'BEHAVIOUR', A, 'Yield on central bank reserves.');

  // --- mortgage contracts and borrower-based rules (Rules 1300/2025)
  P('Tm', 25, 'years', 'CONTRACT', A, 'Average remaining term: 1/Tm of the stock is repaid each year.');
  P('dstiY', 0.40, 'share of income', 'POLICY', 'data: Rules 1300/2025 (first-time buyers 40%)', 'Debt-service cap, young (first-time buyers).');
  P('dstiW', 0.35, 'share of income', 'POLICY', 'data: Rules 1300/2025', 'Debt-service cap, working age.');
  P('floorN', 0.055, 'rate', 'POLICY', 'data: Rules 1300/2025', 'Stress-test rate floor, non-indexed loans.');
  P('termN', 40, 'years', 'POLICY', 'data: Rules 1300/2025', 'Maximum term in the test, non-indexed loans.');
  P('floorI', 0.03, 'rate', 'POLICY', 'data: Rules 1300/2025', 'Stress-test real-rate floor, indexed loans.');
  P('termI', 25, 'years', 'POLICY', 'data: Rules 1300/2025', 'Maximum term in the test, indexed loans.');
  P('capUse0', 0.6, 'ratio', 'BEHAVIOUR', A, 'Baseline new lending as a share of the debt-service cap (cap slack).');
  P('ltvY', 0.90, 'share', 'POLICY', 'assumed (first-time buyer LTV limit)', 'Loan-to-value cap, young (only when the LTV lever is on).');
  P('ltvW', 0.85, 'share', 'POLICY', A, 'Loan-to-value cap, working age (only when the LTV lever is on).');

  // --- households: consumption and mortgage demand
  P('aLY', 0.95, 'MPC', 'BEHAVIOUR', A, 'Young: propensity to consume out of labour and transfer income.');
  P('aLW', 0.90, 'MPC', 'BEHAVIOUR', A, 'Working age: propensity to consume out of labour and transfer income.');
  P('aLO', 0.85, 'MPC', 'BEHAVIOUR', A, 'Old: propensity to consume out of pensions and transfers.');
  P('aK', 0.2, 'MPC', 'BEHAVIOUR', 'assumed (v0 stabiliser: low MPC out of interest and dividends)', 'Propensity to consume out of real property income.');
  P('betaC', 0.6, 'per unit real rate', 'BEHAVIOUR', CT + ' (rate-shock output trough)', 'Saving response to the real key rate.');
  P('aWY', 0.15, 'per yr', 'BEHAVIOUR', A, 'Young: extra spending per krona of liquid wealth above baseline (real).');
  P('aWW', 0.10, 'per yr', 'BEHAVIOUR', A, 'Working age: wealth effect on liquid wealth above baseline.');
  P('aWO', 0.15, 'per yr', 'BEHAVIOUR', A, 'Old: wealth effect on liquid wealth above baseline (spend down savings).');
  P('aNL', 0.5, 'MPC', 'BEHAVIOUR', A, 'Share of net new mortgage borrowing spent (beyond home purchases).');
  P('aHY', 0.01, 'per yr', 'BEHAVIOUR', A, 'Housing-wealth effect, young.');
  P('aHW', 0.015, 'per yr', 'BEHAVIOUR', A, 'Housing-wealth effect, working age.');
  P('aHO', 0.03, 'per yr', 'BEHAVIOUR', A, 'Housing-wealth effect, old.');
  P('lamC', 0.9, '1/yr', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Consumption habit: speed at which spending moves to its new desired level.');
  P('betaM', 3, 'per unit real rate', 'BEHAVIOUR', A, 'Desired mortgage debt vs real mortgage rate.');
  P('lamM', 0.25, '1/yr', 'BEHAVIOUR', A, 'Speed of moving mortgage debt to its desired level.');
  P('betaMH', 0.5, 'elasticity', 'BEHAVIOUR', A, 'Desired mortgage debt vs real house prices.');

  // --- housing
  P('lamH', 1.0, '1/yr', 'BEHAVIOUR', A, 'House price adjustment speed.');
  P('betaHY', 1.0, 'elasticity', 'BEHAVIOUR', A, 'Real house prices vs real household disposable income.');
  P('betaHC', 3, 'per unit of GDP', 'BEHAVIOUR', A, 'Real house prices vs the net mortgage credit flow (x100 = % per % of GDP).');
  P('betaHR', 2, 'per unit real rate', 'BEHAVIOUR', A, 'Real house prices vs the real mortgage rate.');
  P('lamHC', 1.0, '1/yr', 'BEHAVIOUR', A, 'Speed at which the CPI housing component follows house prices.');

  // --- firms
  P('betaPi', 0.3, 'elasticity', 'BEHAVIOUR', A, 'Investment vs real profits.');
  P('betaRI', 1.5, 'per unit real rate', 'BEHAVIOUR', CT + ' (rate-shock output trough)', 'Investment vs real loan rate.');
  P('betaU', 0.5, 'per unit gap', 'BEHAVIOUR', A, 'Investment vs capacity utilisation (accelerator).');
  P('lamInv', 1.5, '1/yr', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Investment adjustment speed (planning lag).');
  P('lamPi', 2, '1/yr', 'BEHAVIOUR', A, 'Smoothing of profits seen by investors.');
  P('rhoL', 1, 'per unit leverage', 'BEHAVIOUR', A, 'Firms retain more profit when debt/GDP is above baseline.');

  // --- prices, wages, expectations
  P('omH', dat('cpi_weights.housing', 24.5, pct).v, 'share', 'IDENTITY', dat('cpi_weights.housing', 24.5).b, 'CPI weight of housing.');
  P('omM', dat('cpi_weights.imported_goods', 25, pct).v, 'share', 'IDENTITY', dat('cpi_weights.imported_goods', 25).b, 'CPI weight of imported goods.');
  P('omD', dat('cpi_weights.domestic_goods_and_services', 50.5, pct).v, 'share', 'IDENTITY', dat('cpi_weights.domestic_goods_and_services', 50.5).b, 'CPI weight of domestic goods and services.');
  P('aLab', 0.55, 'share', 'BEHAVIOUR', CT + ' (wage-shock price level)', 'Labour share of domestic unit cost (rest: imported inputs).');
  P('eta', 0.5, 'per unit gap', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Capacity utilisation pushes prices above unit cost.');
  P('lamUC', 1.5, '1/yr', 'BEHAVIOUR', CT + ' (wage-shock inflation peak timing)', 'Speed at which firms\' view of unit cost follows actual costs.');
  P('lamP', 2.0, '1/yr', 'BEHAVIOUR', CT + ' (wage-shock inflation peak timing)', 'Speed at which prices follow the markup on unit cost.');
  P('lamPm', 2.0, '1/yr', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Import price adjustment speed (retail pass-through).');
  P('phiU', 1.2, 'pp per pp', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Wage Phillips curve slope.');
  P('phiW', 0.4, '1/yr', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Wage error correction: wage growth slows while wages are high relative to domestic prices (main-course model).');
  P('chi', 0.5, 'weight', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Weight of the inflation target (anchor) in expectations.');
  P('lamPia', 1.5, '1/yr', 'BEHAVIOUR', A, 'Speed of adaptive expectations.');

  // --- policy rule
  P('aPi', 1.3, 'pp per pp', 'POLICY', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Key-rate response to expected inflation.');
  P('aY', 0.6, 'pp per %', 'POLICY', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Key-rate response to the output gap.');
  P('aPiA', 0.3, 'pp per pp', 'POLICY', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Key-rate response to actual 12-month inflation.');
  P('lamPol', 3, '1/yr', 'POLICY', A, 'Key-rate smoothing speed.');

  // --- exchange rate and non-residents
  P('betaI', 0.55, '% per pp', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Krona response to the interest differential (carry demand).');
  P('betaH', 0.3, 'elasticity', 'BEHAVIOUR', A, 'Krona response to non-residents\' real krona holdings (portfolio balance).');
  P('lamFX', 12, '1/yr', 'BEHAVIOUR', A, 'Exchange-rate adjustment speed.');
  P('lamSent', 0.1, '1/yr', 'BEHAVIOUR', CT + ' (calibration checks, see docs/SPEC.md section 7)', 'Decay of a krona sentiment shock.');
  P('psiB', 5, 'per unit rate', 'BEHAVIOUR', A, 'Non-resident bond demand vs the interest differential.');
  P('lamBW', 2, '1/yr', 'BEHAVIOUR', A, 'Speed of non-resident bond purchases.');

  // --- pension funds and portfolio rules
  P('lamFA', 0.5, '1/yr', 'BEHAVIOUR', A, 'Pension funds\' speed of moving foreign assets to target (through new flows).');
  P('lamReb', 0.5, '1/yr', 'BEHAVIOUR', A, 'Portfolio rebalancing speed (pension funds, old households) in bonds.');
  P('lamPFnw', 0.3, '1/yr', 'BEHAVIOUR', A, 'Speed at which pension-fund gains or losses are credited to members.');
  P('lamPFinc', 1, '1/yr', 'BEHAVIOUR', A, 'Smoothing of pension-fund income credited to members.');

  // --- solved (filled in by the steady state)
  var S = [
    ['tau0', 'rate', 'POLICY', 'Income-tax rate (covering all taxes on households and other revenue) that balances the baseline budget.'],
    ['tauF', 'rate', 'POLICY', 'Effective corporate tax rate on gross profits giving baseline revenue (citTarget).'],
    ['muXD', 'per unit', 'BEHAVIOUR', 'Exporters\' domestic inputs per unit of exports giving exporters\' value added (vaFXtarget).'],
    ['bondPF', '% of GDP', 'IDENTITY', 'Pension funds\' nominal government bonds: data share of government debt minus indexed bonds.'],
    ['bbondPF', '% of GDP', 'IDENTITY', 'Bank bonds held by pension funds: closes the bank balance sheet given deposits (M3), loans and capital.'],
    ['divFXW', 'share', 'IDENTITY', 'Foreign owners\' share of exporters\' dividends giving fdiTarget.'],
    ['vat0', 'rate', 'POLICY', 'Effective VAT rate on consumption giving baseline VAT revenue (vatTarget).'],
    ['cEe', 'share of gross wage', 'CONTRACT', 'Employee pension contribution giving baseline contributions (conTarget).'],
    ['rr', 'ratio', 'POLICY', 'Unemployment benefit replacement rate giving baseline spending (ueTarget).'],
    ['wsOther', 'share', 'POLICY', 'Wage share of other public services giving public compensation (compG).'],
    ['muD', 'share', 'BEHAVIOUR', 'Import share of domestic firms\' inputs: current account balanced at baseline.'],
    ['rhoFD0', 'share', 'BEHAVIOUR', 'Domestic firms\' retention ratio: retained profit = investment.'],
    ['rhoFX0', 'share', 'BEHAVIOUR', 'Exporters\' retention ratio: retained profit = investment.'],
    ['c0Y', '% of GDP (real)', 'BEHAVIOUR', 'Young: autonomous (price-indexed) spending giving zero baseline saving.'],
    ['c0W', '% of GDP (real)', 'BEHAVIOUR', 'Working age: autonomous spending giving zero baseline saving.'],
    ['c0O', '% of GDP (real)', 'BEHAVIOUR', 'Old: autonomous spending giving zero baseline saving.'],
    ['payout', 'per yr', 'CONTRACT', 'Pension payout rate on pensioners\' rights: rights stock stable.'],
    ['ageing', 'per yr', 'IDENTITY', 'Share of working-age rights moving to pensioners each year as members retire.'],
    ['nuY', 'share', 'POLICY', 'Young: share of income that belongs to new borrowers (sets DSTI cap slack).'],
    ['nuW', 'share', 'POLICY', 'Working age: share of income that belongs to new borrowers.'],
    ['mRY', 'ratio', 'BEHAVIOUR', 'Young: desired mortgage debt / gross income.'],
    ['mRW', 'ratio', 'BEHAVIOUR', 'Working age: desired mortgage debt / gross income.']
  ];
  S.forEach(function (x) { P(x[0], null, x[1], x[2], CT, x[3]); });
  return L;
}

function buildParams(over) {
  var spec = paramSpec(), p = {}, meta = {};
  spec.forEach(function (x) { p[x.id] = x.value; meta[x.id] = x; });
  if (over) for (var k in over) { p[k] = over[k]; if (meta[k]) meta[k] = Object.assign({}, meta[k], { value: over[k], basis: 'override' }); }
  return { p: p, meta: meta, list: spec };
}
