/**
 * Iceland Inc.: the input parameters, ported from engine v1's parameter file
 * (legacy/v1-engine/src/10_params.js).
 *
 * Every parameter has provenance: 'data' values are read from data/iceland/calibration.json with
 * their source and vintage; the rest are 'assumed', 'placeholder' or 'calibrated' (tuned in v1
 * against the calibration checks) exactly as v1 flagged them. Parameters the steady state solves
 * or derives (tax rates that balance budgets, baseline normalisers) are in steady.ts.
 *
 * Units: flows in % of baseline annual GDP a year; stocks in % of baseline GDP; rates as fractions
 * a year; speeds (lam*) per year, so the mean lag is 1/lam years.
 */
import type { Category, Id, ParamDef, Provenance } from '../../core/types.ts';
import { assumed, dataProv, datum, derived, GDP_BN, placeholder, tuned } from './util.ts';

const list: ParamDef[] = [];
function P(id: Id, value: number, unit: string, category: Category, description: string, provenance: Provenance, range?: { min?: number; max?: number }): void {
  list.push({ id, value, unit, category, description, provenance, ...range });
}
const d = (path: string) => datum(path).value;
const pct = (path: string) => datum(path).value / 100;
const cof = 'government_cofog_pct_gdp.';
const eco = 'government_economic_pct_gdp.';
const sp = cof + 'social_protection_breakdown.';
const hh = 'households.';
const GROUP = { Y: 'young_18_34', W: 'working_35_66', O: 'old_67_plus' } as const;
const POP = { Y: 'age_18_34', W: 'age_35_66', O: 'age_67_plus' } as const;
const AGE_NAME = { Y: 'young (18–34)', W: 'working-age (35–66)', O: 'older (67+)' } as const;

/* ------------------------------------------------------------- scale */
P('Y0', 100, '% of GDP/yr', 'IDENTITY', 'Baseline annual nominal GDP: every stock and flow is measured in % of it.', assumed('The unit of the model.'));

/* -------------------------------------------- public spending channels */
P('gHealth', d(cof + 'health'), '% of GDP/yr', 'POLICY', 'Health spending, real: staff pay (with pension contributions) plus purchases from firms.', dataProv(cof + 'health'));
P('gEdu', d(cof + 'education'), '% of GDP/yr', 'POLICY', 'Education spending, real: staff pay plus purchases.', dataProv(cof + 'education'));
{
  const v = d(cof + 'total') - d(eco + 'interest') - d(eco + 'social_benefits') - d(eco + 'gross_fixed_capital_formation') - d(cof + 'health') - d(cof + 'education');
  P('gOther', v, '% of GDP/yr', 'POLICY', 'Other public services, real: administration, police, culture, road upkeep, subsidies.', {
    ...dataProv(cof + 'total'),
    note: 'Derived: COFOG total − interest − social benefits − public investment − health − education (Hagstofa THJ05142/THJ05143).',
  });
}
P('gInv', d(eco + 'gross_fixed_capital_formation'), '% of GDP/yr', 'POLICY', 'Public investment, real, bought from domestic firms.', dataProv(eco + 'gross_fixed_capital_formation'));
P('wsHealth', 0.55, 'fraction', 'POLICY', 'Share of health spending that is staff pay (compensation: including the employer pension contribution and the payroll tax).', assumed());
P('wsEdu', 0.7, 'fraction', 'POLICY', 'Share of education spending that is staff pay (compensation, as for health).', assumed());
P('compG', d(eco + 'compensation_of_employees'), '% of GDP/yr', 'IDENTITY', 'Public compensation of employees; it fixes the pay share of other public services. Like private compensation it includes the employer pension contribution and the payroll tax (tryggingagjald), which the government pays to itself.', dataProv(eco + 'compensation_of_employees', 'Also includes accrued public pension obligations beyond the 11.5% employer rate, so public gross wages are still somewhat overstated (audit L11).'));
{
  const oa = d(eco + 'social_benefits') - d(sp + 'unemployment') - d(sp + 'family_children') - d(sp + 'housing');
  P('trOA', oa, '% of GDP/yr', 'POLICY', 'Old-age and disability cash transfers (Social Insurance, TR), real.', {
    ...dataProv(eco + 'social_benefits'),
    note: 'Derived: social benefits − unemployment − family − housing (THJ05143/THJ05142).',
  });
  P('oaShareO', d('pensions.public_old_age_pension_pct_gdp') / oa, 'fraction', 'POLICY', 'Share of old-age and disability transfers paid to older households: the public old-age pension.', {
    ...dataProv('pensions.public_old_age_pension_pct_gdp'),
    note: 'Public old-age pension ÷ old-age and disability transfers.',
  });
}
P('oaShareY', 0.07, 'fraction', 'POLICY', 'Share of old-age and disability transfers (disability) paid to the young; the rest goes to working age.', assumed());
P('trFam', d(sp + 'family_children') + d(sp + 'housing'), '% of GDP/yr', 'POLICY', 'Child, parental-leave and housing benefits, real.', {
  ...dataProv(sp + 'family_children'),
  note: 'COFOG family and children + housing (THJ05142).',
});
P('famShareY', 0.55, 'fraction', 'POLICY', 'Share of family and housing benefits paid to the young (parental leave, rent support).', assumed());
P('ueTarget', d(sp + 'unemployment'), '% of GDP/yr', 'POLICY', 'Baseline unemployment benefits; they fix the replacement rate.', dataProv(sp + 'unemployment'));

/* ----------------------------------------------------------------- taxes */
P('vatTarget', d('tax_revenue_pct_gdp.vat_and_taxes_on_goods'), '% of GDP/yr', 'POLICY', 'Baseline VAT and taxes on goods; they fix the effective VAT rate on consumer spending.', dataProv('tax_revenue_pct_gdp.vat_and_taxes_on_goods'));
P('citTarget', d('tax_revenue_pct_gdp.corporate_income_tax'), '% of GDP/yr', 'POLICY', 'Baseline corporate income tax; it fixes the effective tax rate on profits.', dataProv('tax_revenue_pct_gdp.corporate_income_tax'));
P('css', 0.0635, 'fraction', 'POLICY', 'Payroll tax (tryggingagjald) on gross wages. Firms pay it to the government; on public staff the government pays it to itself, so there it nets out of the cash budget.', assumed('Statutory social security tax rate.'));
P('phiTau', 0.25, 'fraction', 'POLICY', 'Debt-tied tax rule: the income-tax rate rises 0.25 points per point of debt-to-GDP above baseline.', assumed());
P('lamTau', 0.5, 'per year', 'POLICY', 'How fast the debt-tied tax rule phases in (a slow stabiliser).', assumed());

/* -------------------------------------------------------------- pensions */
P('cEr', 0.115, 'fraction', 'CONTRACT', 'Employer pension contribution, on top of the gross wage.', assumed('Legal minimum employer contribution, 11.5%.'));
P('conTarget', 7.39, '% of GDP/yr', 'CONTRACT', 'Baseline pension contributions to the mutual schemes; they fix the employee contribution rate.', {
  basis: 'data',
  source: 'Landssamtök lífeyrissjóða, Hagtölur lífeyrissjóða workbook, sheet 2.7: mutual-insurance contributions ISK 365.2 bn ÷ 2025 GDP [calibration.json: pensions.pf_contributions_pct_gdp, notes]',
  vintage: '2025',
  note: `Total including personal pensions: ${d('pensions.pf_contributions_pct_gdp')}% of GDP.`,
});
P('pfAssets', d('pensions.pf_assets_pct_gdp'), '% of GDP', 'IDENTITY', 'Pension funds’ total assets.', dataProv('pensions.pf_assets_pct_gdp'));
P('pfForeignShare', d('pensions.pf_foreign_asset_share'), '% of PF assets', 'IDENTITY', 'Foreign share of pension-fund assets.', dataProv('pensions.pf_foreign_asset_share'));
P('pfDepShare', 0.04, 'fraction', 'BEHAVIOUR', 'Pension funds’ deposits (their liquidity), as a share of their assets.', placeholder());
P('pfNWshare', 0.05, 'fraction', 'IDENTITY', 'Pension funds’ surplus: assets above the rights they owe, as a share of assets.', placeholder());
P('eShareW', 0.55, 'fraction', 'IDENTITY', 'Share of pension rights held by working-age members (the rest by pensioners).', placeholder());

/* ---------------------------------------------------------- labour market */
P('compTotal', (2624.4 / GDP_BN) * 100, '% of GDP/yr', 'IDENTITY', 'Total compensation of employees: wages, employer contributions and payroll tax.', {
  basis: 'data',
  source: 'Hagstofa THJ08420: compensation of employees ISK 2,624.4 bn ÷ 2025 GDP [calibration.json: labour.wage_share_of_factor_income, notes]',
  vintage: '2025',
});
{
  // Firms by sector (decision 0003): each sector's labour cost is its compensation of employees;
  // retail and services employ the rest of the private wage bill.
  const fs = 'firm_sectors.';
  P('compFC', d(fs + 'construction.compensation_pct_gdp'), '% of GDP/yr', 'IDENTITY', 'Construction’s compensation of employees (wages, pension contributions, payroll tax).', dataProv(fs + 'construction.compensation_pct_gdp'));
  P('compXF', d(fs + 'fisheries.compensation_pct_gdp'), '% of GDP/yr', 'IDENTITY', 'Fisheries’ compensation of employees (fishing, aquaculture and fish processing).', dataProv(fs + 'fisheries.compensation_pct_gdp'));
  P('compXA', d(fs + 'aluminium.compensation_pct_gdp'), '% of GDP/yr', 'IDENTITY', 'Compensation of employees in basic metals (the aluminium smelters and silicon plants).', dataProv(fs + 'aluminium.compensation_pct_gdp'));
  P('compXT', d(fs + 'tourism.compensation_pct_gdp'), '% of GDP/yr', 'IDENTITY', 'Tourism’s compensation of employees.', dataProv(fs + 'tourism.compensation_pct_gdp', 'Estimate: tourism-attributable employed persons × average pay in accommodation, air transport and travel agencies.'));
  P('compXO', d(fs + 'other_exporters.compensation_pct_gdp'), '% of GDP/yr', 'IDENTITY', 'Other exporters’ compensation of employees (pharma, data centres, IT, transport, business services).', dataProv(fs + 'other_exporters.compensation_pct_gdp', 'Estimate: each part of their value added × its industry’s labour share.'));
  P('youthTiltXT', 0.3, 'fraction', 'BEHAVIOUR', 'How much more of tourism’s jobs and pay go to the young than their share of all jobs (0.3: 30% more).', assumed(`Between the register ratios of workers outside ages 25–64: tourism industries ${d(fs + 'tourism.share_of_workers_outside_25_64')}% ÷ all 22.8% = 1.13, accommodation and food 33.3% ÷ 22.8% = 1.46 (VIN10022, 2025) [calibration.json: ${fs}tourism.share_of_workers_outside_25_64].`), { min: 0, max: 1 });
}
{
  const wsum = (['Y', 'W', 'O'] as const).reduce((s, g) => s + d(`${hh}${GROUP[g]}.share_of_total_wage_income`), 0);
  for (const g of ['Y', 'W', 'O'] as const) {
    P(`pop${g}`, d(`population.${POP[g]}`) / 1000, 'thousand persons', 'IDENTITY', `Population, ${AGE_NAME[g]}.`, dataProv(`population.${POP[g]}`));
    P(`er${g}`, pct(`${hh}${GROUP[g]}.employment_rate`), 'fraction', 'IDENTITY', `Employment rate, ${AGE_NAME[g]}.`, dataProv(`${hh}${GROUP[g]}.employment_rate`));
    P(`u0${g}`, pct(`${hh}${GROUP[g]}.unemployment_rate`), 'fraction', 'IDENTITY', `Baseline unemployment rate, ${AGE_NAME[g]}.`, dataProv(`${hh}${GROUP[g]}.unemployment_rate`));
    P(`wsh${g}`, d(`${hh}${GROUP[g]}.share_of_total_wage_income`) / wsum, 'fraction', 'IDENTITY', `Share of the wage bill earned by the ${AGE_NAME[g]}.`, dataProv(`${hh}${GROUP[g]}.share_of_total_wage_income`, 'Renormalised to exclude under-18s.'));
  }
}
P('cycY', 1.8, 'ratio', 'BEHAVIOUR', 'How strongly young people’s jobs swing with the economy, relative to the average.', assumed());
P('cycW', 0.85, 'ratio', 'BEHAVIOUR', 'How strongly working-age jobs swing, relative to the average.', assumed());
P('cycO', 0.5, 'ratio', 'BEHAVIOUR', 'How strongly older workers’ jobs swing, relative to the average.', assumed());
P('mig', 0.3, 'fraction', 'BEHAVIOUR', 'Migration buffer: share of a change in jobs met by workers arriving or leaving, so the labour force moves with it.', tuned(), { min: 0, max: 0.8 });
P('uFloor', 0.3, 'fraction', 'BEHAVIOUR', 'Frictional floor: however many jobs there are, each age group keeps at least this share of its normal number of unemployed (people between jobs); extra jobs are filled by people arriving from abroad.', assumed('Teaching value: a boom can take unemployment well below normal but not to zero (audit M5, 29 September 2026).'), { min: 0, max: 1 });
P('uFloorStart', 0.6, 'fraction', 'BEHAVIOUR', 'Share of a group’s normal number of unemployed below which extra jobs start to be filled by people arriving from abroad rather than by the unemployed (above it, unemployment follows jobs exactly as before).', assumed('Teaching value; any value between uFloor and 1 leaves the baseline and moderate shocks unchanged (audit M5, 29 September 2026).'), { min: 0, max: 1 });
P('sigW', 0.15, 'elasticity', 'BEHAVIOUR', 'Jobs versus the real product wage (wage ÷ domestic prices): firms economise on staff when pay outpaces prices.', tuned());
P('okun', 0.6, 'elasticity', 'BEHAVIOUR', 'Jobs versus a sector’s output (below 1: firms hoard labour).', assumed());
P('lamN', 3, 'per year', 'BEHAVIOUR', 'How fast employment adjusts.', assumed());
P('phiU', 1.2, 'fraction', 'BEHAVIOUR', 'Wage Phillips curve: points of extra wage growth per point of unemployment below normal.', tuned());
P('phiW', 0.4, 'per year', 'BEHAVIOUR', 'Wage error correction: wage growth slows while wages are high relative to domestic prices (the Nordic main-course model).', tuned());

/* ----------------------------------------------- exports, imports, investment */
P('xFish', d('exports_pct_gdp.marine_products'), '% of GDP/yr', 'IDENTITY', 'Marine exports at baseline, priced in foreign currency.', dataProv('exports_pct_gdp.marine_products'));
P('xAlu', d('exports_pct_gdp.aluminium'), '% of GDP/yr', 'IDENTITY', 'Aluminium exports at baseline, priced in foreign currency.', dataProv('exports_pct_gdp.aluminium'));
P('xTour', d('exports_pct_gdp.tourism'), '% of GDP/yr', 'IDENTITY', 'Tourism exports at baseline, priced in krónur.', dataProv('exports_pct_gdp.tourism'));
P('xOther', d('exports_pct_gdp.other_goods') + d('exports_pct_gdp.other_services'), '% of GDP/yr', 'IDENTITY', 'Other goods and services exports at baseline, priced in krónur.', {
  ...dataProv('exports_pct_gdp.other_services'),
  note: 'Other services + other goods (UTA05003).',
});
{
  // Value added by sector: each fixes the sector's purchases of domestic inputs (decision 0003).
  const fs = 'firm_sectors.';
  P('gvaFC', d(fs + 'construction.value_added_pct_gdp'), '% of GDP/yr', 'IDENTITY', 'Construction’s value added; it fixes what builders buy from retail and service firms.', dataProv(fs + 'construction.value_added_pct_gdp'));
  P('gvaXF', d(fs + 'fisheries.value_added_pct_gdp'), '% of GDP/yr', 'IDENTITY', 'Fisheries’ value added (fishing, aquaculture and fish processing).', dataProv(fs + 'fisheries.value_added_pct_gdp'));
  P('gvaXA', d(fs + 'aluminium.value_added_pct_gdp'), '% of GDP/yr', 'IDENTITY', 'Value added of basic metals: the aluminium smelters.', dataProv(fs + 'aluminium.value_added_pct_gdp', '2025 was a weak year for the smelters (net operating surplus below zero).'));
  P('gvaXT', d(fs + 'tourism.value_added_pct_gdp'), '% of GDP/yr', 'IDENTITY', 'Tourism’s direct value added.', dataProv(fs + 'tourism.value_added_pct_gdp'));
  P('gvaXO', d(fs + 'other_exporters.value_added_pct_gdp'), '% of GDP/yr', 'IDENTITY', 'Other exporters’ value added.', dataProv(fs + 'other_exporters.value_added_pct_gdp', 'Estimate: other exports × the value-added share of output of the industries that make them.'));
  P('mXF', 0.12, 'fraction', 'BEHAVIOUR', 'Fisheries’ imported inputs per unit of exports: fuel, fishing gear, packaging.', assumed('Marine diesel and fuel oil imports (UTA06203, 2025: 43.6 and 6.9 bn ISK) are partly burnt by the fleet; with gear and packaging about 12% of marine exports.'));
  P('mXA', pct(fs + 'aluminium.imported_inputs_share_of_exports'), 'fraction', 'BEHAVIOUR', 'Aluminium smelters’ imported inputs per unit of exports: alumina, carbon anodes and coke.', dataProv(fs + 'aluminium.imported_inputs_share_of_exports'));
  P('mXT', 0.18, 'fraction', 'BEHAVIOUR', 'Tourism’s imported inputs per unit of exports: jet fuel, imported food and aircraft services.', assumed(`Jet fuel imports alone are ${d(fs + 'tourism.jet_fuel_imports_pct_gdp')}% of GDP, 8.5% of tourism exports (UTA06203, 2025); imported food, goods and aircraft leasing and maintenance assumed to add as much again [calibration.json: ${fs}tourism.jet_fuel_imports_pct_gdp].`));
  // Investment: the group totals stay the v1 placeholders; the split follows gross fixed capital formation by industry.
  const gX = ['fisheries', 'aluminium', 'tourism', 'other_exporters'].reduce((s, k) => s + d(`${fs}${k}.gfcf_pct_gdp`), 0);
  const gfcfNote = (k: string) => `Share of exporters’ GFCF by industry (THJ03105, 2025): ${d(`${fs}${k}.gfcf_pct_gdp`)} of ${gX.toFixed(2)}% of GDP.`;
  P('invShareXF', d(fs + 'fisheries.gfcf_pct_gdp') / gX, 'fraction', 'BEHAVIOUR', 'Fisheries’ share of exporters’ baseline investment.', dataProv(fs + 'fisheries.gfcf_pct_gdp', gfcfNote('fisheries')));
  P('invShareXA', d(fs + 'aluminium.gfcf_pct_gdp') / gX, 'fraction', 'BEHAVIOUR', 'Aluminium smelters’ share of exporters’ baseline investment.', dataProv(fs + 'aluminium.gfcf_pct_gdp', gfcfNote('aluminium')));
  P('invShareXT', d(fs + 'tourism.gfcf_pct_gdp') / gX, 'fraction', 'BEHAVIOUR', 'Tourism’s share of exporters’ baseline investment (other exporters make the rest).', dataProv(fs + 'tourism.gfcf_pct_gdp', gfcfNote('tourism')));
  P('invShareFC', d(fs + 'construction.gfcf_pct_gdp') / (d(fs + 'business_gfcf_pct_gdp') - gX), 'fraction', 'BEHAVIOUR', 'Construction’s share of domestic firms’ baseline investment (retail and services make the rest).', dataProv(fs + 'construction.gfcf_pct_gdp', `Construction’s GFCF ÷ business GFCF outside the exporters (${d(fs + 'business_gfcf_pct_gdp')} − ${gX.toFixed(2)}% of GDP), THJ03105, 2025.`));
  P('maintShare', pct(fs + 'construction.household_maintenance_share_of_spending'), 'fraction', 'BEHAVIOUR', 'Share of household spending that goes to builders for maintenance and repair of homes.', dataProv(fs + 'construction.household_maintenance_share_of_spending'));
  P('fdWeightFish', 0.3, 'fraction', 'BEHAVIOUR', 'How much of a change in foreign demand moves marine export volumes (other exports move one for one).', assumed('Catches are capped by quotas, so stronger demand shows up mostly in prices (the fish-price lever); 0.3 lets demand shift the catch mix and aquaculture a little.'));
}
P('iFD0', 13, '% of GDP/yr', 'BEHAVIOUR', 'Baseline investment of domestic firms (construction and retail and services), before the split by sector.', placeholder());
P('iFX0', 3, '% of GDP/yr', 'BEHAVIOUR', 'Baseline investment of the four exporters together, before the split by sector.', placeholder('Gross fixed capital formation of the export industries was about 4% of GDP in 2025 (calibration.json: firm_sectors.*.gfcf_pct_gdp); the v1 value is kept so aggregate results stay comparable.'));
P('muC', pct('cpi_weights.imported_goods'), 'fraction', 'BEHAVIOUR', 'Import share of consumer spending (proxy: the CPI weight of imported goods).', dataProv('cpi_weights.imported_goods'));
P('muG', 0.4, 'fraction', 'BEHAVIOUR', 'Import share of government purchases (medicines, equipment).', placeholder('Set within a plausible 0.3–0.4 range by the fiscal-multiplier check (v1).'));
P('muI', pct('import_content.investment'), 'fraction', 'BEHAVIOUR', 'Import share of investment goods (TiVA import content of investment).', dataProv('import_content.investment'));
P('muX', pct('import_content.exports'), 'fraction', 'BEHAVIOUR', 'Imported inputs per unit of exports, all exporters together (TiVA); what fisheries, aluminium and tourism do not use sets other exporters’ import share.', dataProv('import_content.exports'));
P('epsM', 0.6, 'elasticity', 'BEHAVIOUR', 'Import volumes versus the real exchange rate.', assumed());
P('eFish', 0.2, 'elasticity', 'BEHAVIOUR', 'Marine export volume versus the real exchange rate: a supply response, since fish sells at world prices and a weaker króna makes it more profitable (small: catches are quota-bound).', assumed());
P('eAlu', 0.05, 'elasticity', 'BEHAVIOUR', 'Aluminium export volume versus the real exchange rate: a supply response, since aluminium sells at a dollar price (tiny: the smelters run at capacity).', assumed());
P('eTour', 1, 'elasticity', 'BEHAVIOUR', 'Tourism volume versus the real exchange rate.', assumed());
P('eOther', 0.8, 'elasticity', 'BEHAVIOUR', 'Other export volume versus the real exchange rate.', assumed());
P('lamRer', 1, 'per year', 'BEHAVIOUR', 'How fast trade volumes react to the real exchange rate.', assumed());
P('depreciationRate', 0.08, 'per year', 'CONTRACT', 'Share of firms’ machines and buildings that wears out each year.', assumed('New in the port: v1 had no capital stock. About 8% gives business capital near 200% of GDP.'));

/* -------------------------------------------------------- balance sheets */
P('hhDep', (1557.4 / GDP_BN) * 100, '% of GDP', 'IDENTITY', 'Household deposits.', {
  basis: 'data',
  source: 'Hagstofa THJ09000: household deposits ISK 1,557.4 bn on tax returns ÷ 2025 GDP [calibration.json: households.*.share_of_household_deposits, notes]',
  vintage: '2025',
});
for (const g of ['Y', 'W', 'O'] as const)
  P(`depSh${g}`, pct(`${hh}${GROUP[g]}.share_of_household_deposits`), 'fraction', 'IDENTITY', `Share of household deposits held by the ${AGE_NAME[g]}.`, dataProv(`${hh}${GROUP[g]}.share_of_household_deposits`));
P('mortTot', (2909.2 / GDP_BN) * 100, '% of GDP', 'IDENTITY', 'Household mortgage debt (banks, pension funds and the old Housing Financing Fund).', {
  basis: 'data',
  source: 'lifeyrismal.is Hagtölur sheet 4.2 (CBI data): household housing loans ISK 2,909.2 bn ÷ 2025 GDP [calibration.json: pensions.pf_share_of_mortgage_stock, notes]',
  vintage: '2025',
});
P('mortShY', pct(`${hh}young_18_34.share_of_household_mortgage_debt`), 'fraction', 'IDENTITY', 'Young households’ share of mortgage debt (the older group’s 9% is folded into working age: the model’s older households own outright).', dataProv(`${hh}young_18_34.share_of_household_mortgage_debt`));
P('theta', pct('money_credit.indexed_share_of_mortgages'), 'fraction', 'CONTRACT', 'CPI-indexed share of mortgages, old and new, for both borrowing groups.', dataProv('money_credit.indexed_share_of_mortgages'));
P('pfMortI', (590.8 / GDP_BN) * 100, '% of GDP', 'IDENTITY', 'Pension funds’ CPI-indexed mortgages.', {
  basis: 'data',
  source: 'lifeyrismal.is Hagtölur: pension-fund indexed housing loans ISK 590.8 bn ÷ 2025 GDP [calibration.json: pensions.pf_share_of_mortgage_stock, notes]',
  vintage: '2025',
});
P('pfMortN', (205.6 / GDP_BN) * 100, '% of GDP', 'IDENTITY', 'Pension funds’ non-indexed mortgages.', {
  basis: 'data',
  source: 'lifeyrismal.is Hagtölur: pension-fund non-indexed housing loans ISK 205.6 bn ÷ 2025 GDP [calibration.json: pensions.pf_share_of_mortgage_stock, notes]',
  vintage: '2025',
});
{
  const corp = d('money_credit.corporate_debt_pct_gdp');
  P('loanTotal', 0.55 * corp, '% of GDP', 'IDENTITY', 'Bank loans to firms, all sectors.', placeholder(`Corporate debt ${corp}% of GDP (CBI Financial Stability 2026/1, calibration.json: money_credit.corporate_debt_pct_gdp) × assumed domestic-bank share 0.55. The systemically important banks’ loans to firms were ISK 2,024 bn at end-2025 (41% of GDP; CBI FS 2026/1 chart II-7), close to this.`));
  P('loanShareFC', pct('firm_sectors.construction.share_of_bank_corporate_loans'), 'fraction', 'IDENTITY', 'Construction’s share of bank loans to firms.', dataProv('firm_sectors.construction.share_of_bank_corporate_loans'));
  const loanNote = 'Fisheries, real estate and services hold about two-thirds of banks’ loans to firms (IMF Country Report 25/141); the split among exporters is assumed. Retail and services, which include real-estate companies, hold the rest.';
  P('loanShareXF', 0.15, 'fraction', 'IDENTITY', 'Fisheries’ share of bank loans to firms (quota-backed lending).', placeholder(loanNote));
  P('loanShareXA', 0.01, 'fraction', 'IDENTITY', 'Aluminium smelters’ share of bank loans to firms: they borrow mostly from their foreign parents.', placeholder(loanNote));
  P('loanShareXT', 0.12, 'fraction', 'IDENTITY', 'Tourism’s share of bank loans to firms (hotels, airlines, tour operators).', placeholder(loanNote));
  P('loanShareXO', 0.05, 'fraction', 'IDENTITY', 'Other exporters’ share of bank loans to firms.', placeholder(loanNote));
}
P('govDebt', d('money_credit.govt_debt_pct_gdp'), '% of GDP', 'IDENTITY', 'Gross government debt.', dataProv('money_credit.govt_debt_pct_gdp'));
P('govIdxShare', 0.35, 'fraction', 'CONTRACT', 'CPI-indexed share of government debt (held by pension funds).', placeholder());
P('pfGovShare', pct('pensions.pf_share_of_govt_bonds'), 'fraction', 'IDENTITY', 'Pension funds’ share of government bonds (applied to all government debt; indexed bonds first).', dataProv('pensions.pf_share_of_govt_bonds'));
P('bondCB', 1, '% of GDP', 'IDENTITY', 'The central bank’s government bonds.', placeholder());
P('bondO', 4, '% of GDP', 'IDENTITY', 'Older households’ government bonds.', placeholder());
P('bondW', 0.072 * d('money_credit.govt_debt_pct_gdp'), '% of GDP', 'IDENTITY', 'Non-residents’ government bonds (carry trade).', {
  ...dataProv('pensions.pf_share_of_govt_bonds'),
  note: 'Foreign holders 7.2% of Treasury bonds (Lánamál ríkisins, 31 Dec 2025) × government debt.',
});
P('m3', d('money_credit.broad_money_m3_pct_gdp'), '% of GDP', 'IDENTITY', 'Broad money (M3). It fixes domestic firms’ deposits at the start; afterwards money is only ever a sum of deposits.', dataProv('money_credit.broad_money_m3_pct_gdp'));
P('fxr', 18, '% of GDP', 'IDENTITY', 'Central-bank foreign-exchange reserves.', placeholder());
P('tga', 5, '% of GDP', 'POLICY', 'Treasury account at the central bank: the government keeps it at this level by selling bonds.', placeholder());
P('eqCB', 2, '% of GDP', 'IDENTITY', 'Central-bank equity.', placeholder());
P('depFX', 5, '% of GDP', 'IDENTITY', 'Exporters’ deposits, all four sectors, split by export revenue.', placeholder());
P('depShareFC', 0.11, 'fraction', 'IDENTITY', 'Construction’s share of domestic firms’ deposits (retail and services hold the rest).', placeholder('Construction’s share of domestic firms’ value added (7.3 of about 67% of GDP).'));
P('depW', 3, '% of GDP', 'IDENTITY', 'Non-residents’ króna deposits.', placeholder());
P('eqHY', 1, '% of GDP', 'IDENTITY', 'Domestic shares held by young households (balance sheet only).', placeholder());
P('eqHW', 10, '% of GDP', 'IDENTITY', 'Domestic shares held by working-age households (balance sheet only).', placeholder());
P('eqHO', 5, '% of GDP', 'IDENTITY', 'Domestic shares held by older households (balance sheet only).', placeholder());
P('eqW', 10, '% of GDP', 'IDENTITY', 'Foreign-owned equity in exporters, such as the aluminium smelters (balance sheet only; split by the dividends each exporter pays abroad).', placeholder());
P('pfEqFDshare', 0.7, 'fraction', 'IDENTITY', 'Share of domestic equity (pension funds, households) that is in domestic firms; within each group it is split by after-tax profit.', placeholder());
P('divFDY', 0.05, 'fraction', 'IDENTITY', 'Share of domestic firms’ distributed profit (dividends and owners’ income) going to the young.', placeholder());
P('divFDW', 0.67, 'fraction', 'IDENTITY', 'Share going to working-age owners and the self-employed.', placeholder());
P('divFDO', 0.18, 'fraction', 'IDENTITY', 'Share going to older households; the rest (10%) goes to pension funds.', assumed('Capital income of the 67+ group, ISK 117.4 bn (Hagstofa THJ09001).'));
P('fdiTarget', 0.33, '% of GDP/yr', 'IDENTITY', 'Baseline dividends to foreign owners of exporters (the smelters’ parents and others); it fixes the foreign share of other exporters’ dividends.', {
  ...dataProv('export_sector.profits_to_foreign_owners_pct_gdp'),
  note: 'Equity income only (dividends + reinvested earnings) on inward FDI, 2024: 0.33% of GDP (calibration notes).',
});
P('divXTW', 0.1, 'fraction', 'IDENTITY', 'Foreign owners’ share of tourism firms’ dividends (foreign-owned hotels and tour operators).', placeholder());
P('divFXdomW', 0.55, 'fraction', 'IDENTITY', 'Working-age households’ weight in the domestic split of exporters’ dividends.', placeholder());
P('divFXdomO', 0.15, 'fraction', 'IDENTITY', 'Older households’ weight in the domestic split of exporters’ dividends (pension funds get 1 − divFXdomW − divFXdomO).', placeholder());
P('house0', 200, '% of GDP', 'IDENTITY', 'Value of the housing stock.', placeholder());
{
  const rel = { Y: 0.6, W: 1, O: 1 };
  const own = (g: 'Y' | 'W' | 'O') => d(`${hh}${GROUP[g]}.home_ownership_rate`) * d(`population.${POP[g]}`) * rel[g];
  const tot = own('Y') + own('W') + own('O');
  const note = 'Home-ownership rate × population, with young people’s homes assumed worth 0.6 of others’.';
  P('hshY', own('Y') / tot, 'fraction', 'IDENTITY', 'Young households’ share of housing wealth.', dataProv(`${hh}young_18_34.home_ownership_rate`, note));
  P('hshW', own('W') / tot, 'fraction', 'IDENTITY', 'Working-age households’ share of housing wealth (the rest is older households’).', dataProv(`${hh}working_35_66.home_ownership_rate`, note));
}
P('purY', 1.2, '% of GDP/yr', 'BEHAVIOUR', 'Homes the young buy from older households each year, at baseline prices.', placeholder());
P('purW', 1, '% of GDP/yr', 'BEHAVIOUR', 'Homes working-age households buy from older households each year, at baseline prices.', placeholder());

/* ----------------------------------------------------------------- banks */
P('kapT', 0.22, 'fraction', 'POLICY', 'Banks’ target capital ratio (equity ÷ risk-weighted assets).', assumed('Total capital requirement about 20% plus a buffer.'));
P('kapMin', 0.18, 'fraction', 'POLICY', 'Capital ratio at which the loan premium reaches its maximum.', assumed());
P('rwM', 0.35, 'fraction', 'POLICY', 'Risk weight on mortgages.', assumed('Basel standardised mortgage risk weight.'));
P('rwL', 1, 'fraction', 'POLICY', 'Risk weight on business loans.', assumed('Basel standardised corporate risk weight.'));
P('sCap', 0.02, 'fraction/yr', 'BEHAVIOUR', 'Loan premium when bank capital falls to its minimum.', assumed());
P('lamEq', 1, 'per year', 'BEHAVIOUR', 'How fast banks rebuild capital by cutting dividends.', assumed());
P('lamDivB', 1, 'per year', 'BEHAVIOUR', 'Smoothing of bank profits behind dividends.', assumed());
P('divBshG', 0.35, 'fraction', 'IDENTITY', 'Share of bank dividends paid to the government (it owns Landsbankinn).', assumed());
P('divBshPF', 0.35, 'fraction', 'IDENTITY', 'Share of bank dividends paid to pension funds.', placeholder());
P('divBshW', 0.2, 'fraction', 'IDENTITY', 'Share of bank dividends paid to working-age households (the rest to older households).', placeholder());

/* ----------------------------------------------------------------- rates */
P('i0', 0.03, 'fraction/yr', 'POLICY', 'Neutral real key rate. The nominal neutral rate, which the key rate is compared with, is i0 + piT.', assumed());
P('piT', 0, 'fraction/yr', 'POLICY', 'Inflation target of the model. Iceland targets 2.5%; the zero-inflation baseline uses 0, so only deviations show.', assumed());
P('mD', 0.01, 'fraction/yr', 'BEHAVIOUR', 'Deposit margin below the key rate.', assumed());
P('sB', 0.005, 'fraction/yr', 'CONTRACT', 'Spread of the floating government-bond rate over the key rate.', assumed());
P('sL', 0.025, 'fraction/yr', 'BEHAVIOUR', 'Spread of business-loan rates over the key rate.', assumed());
P('sMN', 0.01, 'fraction/yr', 'BEHAVIOUR', 'Spread of non-indexed mortgage rates over the key rate.', assumed());
P('rMI0', 0.025, 'fraction/yr', 'BEHAVIOUR', 'Real rate on indexed mortgages at baseline.', assumed());
P('psiIdx', 0.4, 'fraction', 'BEHAVIOUR', 'Pass-through of the key rate to the real rate on indexed mortgages.', assumed());
P('rBI0', 0.02, 'fraction/yr', 'CONTRACT', 'Real coupon on indexed government bonds.', assumed());
P('sBB', 0.01, 'fraction/yr', 'CONTRACT', 'Spread of bank (covered) bonds over the key rate.', assumed());
const IF0 = 0.02;
P('iF0', IF0, 'fraction/yr', 'BEHAVIOUR', 'Normal foreign interest rate. Carry traders compare the key rate above its nominal neutral (i0 + piT) with the foreign rate above this.', assumed());
P('iFnow', IF0, 'fraction/yr', 'POLICY', 'Foreign interest rate in force at the start, before the foreign-rate lever; also the cash yield on pension funds’ foreign assets.', derived('Equal to iF0 on the steady start. A start from today sets today’s foreign rate here, so the rate gap with abroad starts where it is (docs/design/start-from-today.md §4.6).'));
P('iFXR', 0.02, 'fraction/yr', 'BEHAVIOUR', 'Yield on the central bank’s foreign reserves at the normal foreign rate; it moves one for one with the foreign rate.', assumed());

/* ------------------------------------ mortgage contracts and borrower-based rules */
P('Tm', 25, 'years', 'CONTRACT', 'Average remaining term of mortgages: 1/Tm of the debt is repaid each year.', assumed());
P('dstiY', 0.4, 'fraction', 'POLICY', 'Debt-service cap for the young (first-time buyers): payments at stressed rates may take this share of income.', {
  basis: 'data',
  source: 'Central Bank of Iceland Rules No. 1300/2025 on maximum debt service-to-income ratios (first-time buyers 40%)',
  vintage: '2025',
});
P('dstiW', 0.35, 'fraction', 'POLICY', 'Debt-service cap for other borrowers.', { basis: 'data', source: 'Central Bank of Iceland Rules No. 1300/2025 (35%)', vintage: '2025' });
P('floorN', 0.055, 'fraction/yr', 'POLICY', 'Stress-test rate floor for non-indexed loans.', { basis: 'data', source: 'Central Bank of Iceland Rules No. 1300/2025 (5.5%)', vintage: '2025' });
P('termN', 40, 'years', 'POLICY', 'Longest term allowed in the stress test for non-indexed loans.', { basis: 'data', source: 'Central Bank of Iceland Rules No. 1300/2025 (40 years)', vintage: '2025' });
P('floorI', 0.03, 'fraction/yr', 'POLICY', 'Stress-test real-rate floor for indexed loans.', { basis: 'data', source: 'Central Bank of Iceland Rules No. 1300/2025 (3%)', vintage: '2025' });
P('termI', 25, 'years', 'POLICY', 'Longest term allowed in the stress test for indexed loans.', { basis: 'data', source: 'Central Bank of Iceland Rules No. 1300/2025 (25 years)', vintage: '2025' });
P('capUse0', 0.6, 'fraction', 'BEHAVIOUR', 'Baseline new lending as a share of what the debt-service cap allows (slack under the cap).', assumed());
P('ltvYExtra', 0.05, 'fraction', 'POLICY', 'Extra loan-to-value room for the young (first-time buyers) when the LTV cap is on.', assumed('v1: first-time buyers get 5 points more.'));

/* ------------------------------------------ households: spending and borrowing */
P('aLY', 0.95, 'fraction', 'BEHAVIOUR', 'Young: share of labour and transfer income spent.', assumed());
P('aLW', 0.9, 'fraction', 'BEHAVIOUR', 'Working age: share of labour and transfer income spent.', assumed());
P('aLO', 0.85, 'fraction', 'BEHAVIOUR', 'Older: share of pensions and transfers spent.', assumed());
P('aK', 0.2, 'fraction', 'BEHAVIOUR', 'Share of real interest and dividend income spent (low: a stabiliser kept from v0).', assumed());
P('betaC', 0.6, 'fraction', 'BEHAVIOUR', 'How much spending falls per point of real key rate above neutral (as a share of income-based spending, per unit rate).', tuned('the rate-shock output trough'));
P('aWY', 0.15, 'per year', 'BEHAVIOUR', 'Young: extra spending per króna of liquid wealth above baseline, a year.', assumed());
P('aWW', 0.1, 'per year', 'BEHAVIOUR', 'Working age: extra spending per króna of liquid wealth above baseline, a year.', assumed());
P('aWO', 0.15, 'per year', 'BEHAVIOUR', 'Older: extra spending per króna of liquid wealth above baseline, a year (spending down savings).', assumed());
P('aNL', 0.5, 'fraction', 'BEHAVIOUR', 'Share of net new mortgage borrowing spent on goods and services (beyond the homes themselves).', assumed());
P('aHY', 0.01, 'per year', 'BEHAVIOUR', 'Young: housing-wealth effect on spending.', assumed());
P('aHW', 0.015, 'per year', 'BEHAVIOUR', 'Working age: housing-wealth effect on spending.', assumed());
P('aHO', 0.03, 'per year', 'BEHAVIOUR', 'Older: housing-wealth effect on spending.', assumed());
P('lamC', 0.9, 'per year', 'BEHAVIOUR', 'Consumption habit: how fast spending moves toward its target.', tuned());
P('betaM', 3, 'fraction', 'BEHAVIOUR', 'Desired mortgage debt versus the real mortgage rate (share lost per unit of rate).', assumed());
P('lamM', 0.25, 'per year', 'BEHAVIOUR', 'How fast households move their mortgage debt toward what they want.', assumed());
P('betaMH', 0.5, 'elasticity', 'BEHAVIOUR', 'Desired mortgage debt versus real house prices.', assumed());

/* --------------------------------------------------------------- housing */
P('lamH', 1, 'per year', 'BEHAVIOUR', 'How fast real house prices adjust.', assumed());
P('betaHY', 1, 'elasticity', 'BEHAVIOUR', 'Real house prices versus real household disposable income.', assumed());
P('betaHC', 3, 'fraction', 'BEHAVIOUR', 'Real house prices versus the flow of net mortgage credit (×100: % per % of GDP).', assumed());
P('betaHR', 2, 'fraction', 'BEHAVIOUR', 'Real house prices versus the real mortgage rate (share lost per unit of rate).', assumed());
P('lamHC', 1, 'per year', 'BEHAVIOUR', 'How fast the housing component of the CPI follows house prices.', assumed('House prices stand in for market rents: since June 2024 Statistics Iceland measures owner-occupied housing by rental equivalence (HMS rental register), which follows house prices more loosely and slowly. Not yet re-estimated against the post-2024 CPI housing series; a rent block is planned for v3.'));

/* ------------------------------------------------------------------ firms */
P('betaPi', 0.3, 'elasticity', 'BEHAVIOUR', 'Investment versus real profits.', assumed());
P('betaRI', 1.5, 'fraction', 'BEHAVIOUR', 'Investment versus the real loan rate (share lost per unit of rate).', tuned('the rate-shock output trough'));
P('betaU', 0.5, 'fraction', 'BEHAVIOUR', 'Investment versus capacity use (the accelerator).', assumed());
P('lamInv', 1.5, 'per year', 'BEHAVIOUR', 'Investment planning lag: how fast investment moves toward its target.', tuned());
P('lamPi', 2, 'per year', 'BEHAVIOUR', 'Smoothing of the profits investors look at.', assumed());
P('rhoL', 1, 'fraction', 'BEHAVIOUR', 'Firms retain more profit when their debt is above its baseline share of GDP.', assumed());
P('firmCashSpeed', 12, 'per year', 'BEHAVIOUR', 'How fast firms borrow or repay to bring their deposits back to target (12: within about a month, as in v1).', assumed('v1 closed the gap every month.'));

/* ---------------------------------------------- prices, wages, expectations */
P('omH', pct('cpi_weights.housing'), 'fraction', 'IDENTITY', 'CPI weight of housing: owner-occupiers’ imputed rent (20.9) and actual rents (3.6).', dataProv('cpi_weights.housing', 'Imputed rent has been measured by rental equivalence (HMS market rents) since June 2024; the model’s housing component follows house prices as a stand-in.'));
P('omM', pct('cpi_weights.imported_goods'), 'fraction', 'IDENTITY', 'CPI weight of imported goods.', dataProv('cpi_weights.imported_goods'));
P('omD', pct('cpi_weights.domestic_goods_and_services'), 'fraction', 'IDENTITY', 'CPI weight of domestic goods and services.', dataProv('cpi_weights.domestic_goods_and_services'));
P('aLab', 0.55, 'fraction', 'BEHAVIOUR', 'Labour’s share of domestic unit cost (the rest is imported inputs).', tuned('the wage-shock price level'));
P('eta', 0.5, 'fraction', 'BEHAVIOUR', 'How far capacity pressure pushes prices above unit cost (per unit of output gap).', tuned());
P('lamUC', 1.5, 'per year', 'BEHAVIOUR', 'How fast firms’ view of their unit cost follows actual costs.', tuned('the wage-shock inflation peak timing'));
P('lamP', 2, 'per year', 'BEHAVIOUR', 'How fast prices follow the markup on unit cost.', tuned('the wage-shock inflation peak timing'));
P('lamPm', 2, 'per year', 'BEHAVIOUR', 'How fast import prices in shops follow world prices in krónur (retail pass-through).', tuned());
P('chi', 0.5, 'fraction', 'BEHAVIOUR', 'Weight of the inflation target in expectations (how well anchored they are).', tuned());
P('lamPia', 1.5, 'per year', 'BEHAVIOUR', 'How fast the remembered rate of inflation updates (adaptive expectations).', assumed());

/* ------------------------------------------------------------ policy rule */
P('aPi', 1.3, 'fraction', 'POLICY', 'Key-rate response to expected inflation above target (points per point).', tuned());
P('aY', 1, 'fraction', 'POLICY', 'Key-rate response to the output gap (points per % of output).', {
  basis: 'calibrated',
  note: 'Re-tuned from v1’s 0.6 after the consumption deflator stopped reading house-price moves as changes in real spending (audit H4, 29 September 2026). That removed a false early recovery after a rate rise, and the output trough moved to the last quarter of the 8-quarter rate-shock scenario (outside rate-output-timing’s 4–7). betaC and betaRI move the depth of the trough, not its timing. 1.0 is the output-gap weight of Taylor’s (1999) balanced rule, and keeps every check in range, also with the rate held 1 pp for four quarters as in the CBI QMM experiment.',
});
P('aPiA', 0.3, 'fraction', 'POLICY', 'Key-rate response to actual 12-month inflation above target.', tuned());
P('lamPol', 3, 'per year', 'POLICY', 'How fast the key rate moves toward what its rule says (smoothing).', assumed());

/* --------------------------------------------- exchange rate and non-residents */
P('betaI', 0.55, 'fraction', 'BEHAVIOUR', 'Króna response to the interest-rate gap with abroad (log points per unit of rate): carry demand.', tuned());
P('betaH', 0.3, 'elasticity', 'BEHAVIOUR', 'Króna response to non-residents’ real króna holdings (portfolio balance).', assumed());
P('lamFX', 12, 'per year', 'BEHAVIOUR', 'How fast the exchange rate moves toward its target.', assumed());
P('lamPPP', 0.2, 'per year', 'BEHAVIOUR', 'How fast the króna’s long-run anchor absorbs a change in world prices (purchasing-power parity): 0.2 a year is a half-life of about 3.5 years.', assumed('Sarno and Taylor (2002) report a consensus half-life of deviations from PPP of three to five years (the purchasing-power-parity concept page); 0.2 a year sits inside it. Audit H5, 29 September 2026.'));
P('lamSent', 0.1, 'per year', 'BEHAVIOUR', 'How fast a króna sentiment shock fades (about 10% of it a year).', tuned());
P('psiB', 5, 'fraction', 'BEHAVIOUR', 'Non-residents’ bond demand versus the interest-rate gap (share per unit of rate).', assumed());
P('lamBW', 2, 'per year', 'BEHAVIOUR', 'How fast non-residents move their bond holdings toward what they want.', assumed());

/* -------------------------------------------- pension funds and portfolio rules */
P('lamFA', 0.5, 'per year', 'BEHAVIOUR', 'How fast pension funds move their foreign assets toward target, through new flows.', assumed());
P('lamReb', 0.5, 'per year', 'BEHAVIOUR', 'Portfolio rebalancing speed of pension funds and older households in bonds.', assumed());
P('lamPFnw', 0.3, 'per year', 'BEHAVIOUR', 'How fast pension-fund gains or losses are credited to members.', assumed());
P('lamPFinc', 1, 'per year', 'BEHAVIOUR', 'Smoothing of the fund income credited to members.', assumed());

/* ------------------------------------------------ government financing */
P('treasuryTopUp', 12, 'per year', 'POLICY', 'How fast bond sales restore the treasury account to its target (12: within about a month, as in v1).', assumed('v1 closed the gap every month.'));
P('bondMixBankShare', 0.4, 'fraction', 'POLICY', 'Banks’ share of new government bonds in the default mix; pension funds buy the rest.', assumed('v1 default: 40% banks, 60% pension funds.'));

/* ------------------------------------------------ world prices at the start */
const startLevel = (what: string) => derived(`1 on the steady start (${what} at their 2025 level). A start from today sets today’s level relative to 2025 here (docs/design/start-from-today.md §4.6).`);
P('worldPrice0', 1, 'index', 'BEHAVIOUR', 'Foreign-currency level of world prices at the start, before the world-prices lever.', startLevel('world prices'));
P('fishPrice0', 1, 'index', 'BEHAVIOUR', 'Foreign-currency level of marine-product prices at the start, before the fish-price lever.', startLevel('fish prices'));
P('aluminiumPrice0', 1, 'index', 'BEHAVIOUR', 'Foreign-currency level of the aluminium price at the start, before the aluminium-price lever.', startLevel('aluminium prices'));

/* ------------------------------------------------ lever settings (baseline 0) */
const lev = (note: string): Provenance => ({ basis: 'assumed', note: `Zero at baseline; ${note}` });
P('incomeTaxShift', 0, 'fraction', 'POLICY', 'Your change in the income-tax rate (the income-tax lever). With stabilisers on Automatic, the debt rule’s adjustment is added on top.', lev('set by the income-tax lever.'));
P('vatShift', 0, 'fraction', 'POLICY', 'Change in the effective VAT rate (the VAT lever).', lev('set by the VAT lever.'));
P('rrShift', 0, 'fraction', 'POLICY', 'Change in the unemployment-benefit replacement rate (the lever).', lev('set by the unemployment-benefit lever.'));
P('dstiShift', 0, 'fraction', 'POLICY', 'Shift of both debt-service caps (the debt-service-cap lever).', lev('set by the debt-service-cap lever.'));
P('ltvLimit', 0, 'fraction', 'POLICY', 'Loan-to-value cap; 0 means off (the lever).', lev('the LTV cap is off unless the lever turns it on.'));
P('lendingAppetite', 0, '% of GDP/yr', 'BEHAVIOUR', 'Extra mortgage lending banks are keen to push each year (the lending-appetite lever).', lev('set by the lending-appetite lever.'));
P('pfForeignShift', 0, 'fraction', 'BEHAVIOUR', 'Shift of pension funds’ target foreign share (the foreign-allocation lever).', lev('set by the foreign-allocation lever.'));
P('foreignDemandShift', 0, 'fraction', 'BEHAVIOUR', 'Change in foreign demand for Icelandic exports (the foreign-demand lever).', lev('set by the foreign-demand lever.'));
P('tourismShift', 0, 'fraction', 'BEHAVIOUR', 'Change in foreign visitors’ spending (the tourism lever).', lev('set by the tourism lever.'));
P('foreignRateShift', 0, 'fraction/yr', 'POLICY', 'Change in the foreign interest rate (the foreign-rate lever).', lev('set by the foreign-rate lever.'));
P('worldPriceShift', 0, 'fraction', 'BEHAVIOUR', 'Change in world prices of imports, fish and aluminium, in foreign currency (the world-prices lever).', lev('set by the world-prices lever.'));
P('fishPriceShift', 0, 'fraction', 'BEHAVIOUR', 'Change in world prices of marine products, in foreign currency, on top of world prices (the fish-price lever).', lev('set by the fish-price lever.'));
P('aluminiumPriceShift', 0, 'fraction', 'BEHAVIOUR', 'Change in the world aluminium price, in foreign currency, on top of world prices (the aluminium-price lever).', lev('set by the aluminium-price lever.'));

/** Input parameters by id. */
export const INPUT_PARAMS: Record<Id, ParamDef> = Object.fromEntries(list.map((p) => [p.id, p]));

/** Default values of the input parameters (what the closed-form steady state starts from). */
export const INPUT_VALUES: Record<Id, number> = Object.fromEntries(list.map((p) => [p.id, p.value]));
