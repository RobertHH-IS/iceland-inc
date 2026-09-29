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
  // Old-age and disability transfers are TR's pension payments; family benefits are the rest of
  // social benefits (THJ05143 item 27), so the three cash channels still add up to item 27.
  const OA = 'pensions.public_old_age_pension_pct_gdp';
  const DIS = 'pensions.public_disability_pension_pct_gdp';
  const oldAge = d(OA);
  const oa = oldAge + d(DIS);
  const tr = { source: `${datum(OA).source} [calibration.json: ${OA}, ${DIS}]`, vintage: String(datum(OA).year) };
  P('trOA', oa, '% of GDP/yr', 'POLICY', 'Old-age and disability cash transfers (Social Insurance, TR), real.', {
    ...derived(`TR old-age pension ${oldAge} + disability pension ${d(DIS)}% of GDP (TR annual report 2025).`),
    ...tr,
  });
  P('oaShareO', oldAge / oa, 'fraction', 'POLICY', 'Share of old-age and disability transfers paid to older households: the public old-age pension.', {
    ...derived(`TR old-age pension ÷ (old-age + disability pensions): ${oldAge} ÷ ${oa.toFixed(2)} (TR annual report 2025).`),
    ...tr,
  });
  const fam = d(eco + 'social_benefits') - d(sp + 'unemployment') - oa;
  P('trFam', fam, '% of GDP/yr', 'POLICY', 'Family, housing and other benefits, real: child benefits, parental leave, housing benefits and the rest of social benefits.', {
    ...dataProv(eco + 'social_benefits'),
    basis: 'derived',
    note: `The rest of social benefits: item 27 (${d(eco + 'social_benefits')}) − unemployment (${d(sp + 'unemployment')}) − old-age and disability pensions (${oa.toFixed(2)}) (THJ05143/THJ05142, TR 2025). Besides child, parental-leave and housing benefits it holds other TR payments (rehabilitation pension, supplements), municipal assistance, and the non-cash part of the unemployment figure, which comes from a COFOG function that includes administration. Child and housing benefits are tax-free, the rest taxable (famTaxableShare).`,
  });
  // Only the taxable part of family benefits is income-taxed (review SP-4): taxable social benefits
  // from withholding-tax data, less the old-age, disability and unemployment benefits (all taxable),
  // leave the taxable part of this channel.
  const taxable = d(eco + 'taxable_social_benefits');
  const ue = d(sp + 'unemployment');
  P('famTaxableShare', (taxable - oa - ue) / fam, 'fraction', 'CONTRACT', 'Share of family and housing benefits that is income-taxed: parental-leave pay, TR rehabilitation pensions and supplements, and municipal assistance. Child benefits (barnabætur), interest rebates and housing benefits (húsnæðisbætur) are tax-free.', {
    ...dataProv(eco + 'taxable_social_benefits'),
    basis: 'derived',
    note: `(taxable social benefits ${taxable} − old-age and disability pensions ${oa.toFixed(2)} − unemployment ${ue}) ÷ family and other benefits ${fam.toFixed(2)} (Hagstofa TEK02011, THJ05143/THJ05142, TR 2025). Tax-free: child, interest and housing benefits (Income Tax Act 90/2003, art. 28). The unemployment figure includes some administration, so the share is if anything a little low.`,
  });
}
P('oaShareY', 0.07, 'fraction', 'POLICY', 'Share of old-age and disability transfers (disability) paid to the young; the rest goes to working age.', assumed());
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
P('sigW', 0.3, 'elasticity', 'BEHAVIOUR', 'Jobs versus wages relative to the value-added price (domestic prices less the imported inputs in them): firms economise on staff when pay outpaces what they earn.', { basis: 'calibrated', note: 'v1 tuned 0.15 against the wage-shock checks with wages measured against domestic prices. Measured against the value-added price (trade-nominal-drift, 29 September 2026) and with the contract lag (lamWG), 0.3 puts the wage-shock unemployment peak at about 0.9 points (0.5–1) with every other check in range.' });
P('okun', 0.6, 'elasticity', 'BEHAVIOUR', 'Jobs versus a sector’s output (below 1: firms hoard labour).', assumed());
P('lamN', 3, 'per year', 'BEHAVIOUR', 'How fast employment adjusts.', assumed());
P('phiU', 1.2, 'fraction', 'BEHAVIOUR', 'Wage Phillips curve: points of extra wage growth per point of unemployment below normal.', tuned());
P('lamWG', 1, 'per year', 'BEHAVIOUR', 'How fast the wage gap wage bargainers see (wages against the value-added price) follows the actual gap: agreements run for a year or more, so a gap is bargained away over the following rounds.', { basis: 'calibrated', note: 'A contract lag (labour-LAB-2, 29 September 2026): without it the error correction began to pull wages back in the month after a settlement, so after a 10% settlement nominal wages gave back 2.7 points within a year and prices only 2.2. With it, and with phiW, sigW and lamUCw retuned, wages give back about 1.9 points and consumer prices rise about 2.8 in the first year on Manual, and every wage-shock check stays in range. Icelandic general agreements run for several years: those signed in 2024 run to 2028.' });
P('epsSearch', 0.25, 'elasticity', 'BEHAVIOUR', 'How much longer people search for work when unemployment benefits are more generous: the share by which the number unemployed rises per unit of relative rise in the replacement rate.', assumed('Nickell (1997, Journal of Economic Perspectives 11(3)) and the OECD Jobs Strategy find that a higher replacement rate raises unemployment, by less than often claimed; Nordic benefit-duration studies find elasticities of unemployment duration of about 0.2–0.5. 0.25 gives unemployment about 0.6–0.8 points higher when the rate is 30 points higher (labour-LAB-1, 29 September 2026).'));
P('lamSearch', 1.33, 'per year', 'BEHAVIOUR', 'How fast job search adjusts to a change in unemployment benefits: at 1.33 a year, most of the effect within a year and a half.', assumed('Search behaviour changes as claims are renewed and new spells start, over about three quarters on average (labour-LAB-1, 29 September 2026).'));
P('uBenefit', 0.01, 'fraction', 'BEHAVIOUR', 'How far a higher unemployment-benefit rate raises the normal rate of unemployment through wage setting: points of normal unemployment per unit of replacement rate (0.3 points for 30 points of the wage).', assumed('Kept small: in Layard, Nickell and Jackman’s wage-setting curve more generous benefits raise the pay workers hold out for, but Icelandic benefits are capped and bargaining is centralised. A larger value turns mostly into lasting inflation and a higher real wage rather than unemployment, since unemployment here is set by demand (labour-LAB-1, 29 September 2026).'));
P('lamInflow', 0.5, 'per year', 'BEHAVIOUR', 'How fast workers arriving through the net-immigration lever find work or move on: at 0.5 a year, half within about a year and a half.', assumed('Teaching value. Newcomers in Iceland mostly find work within a year or two, in tourism, construction and fish processing (IMF 2026, Beveridge curve; labour-LAB-6, 29 September 2026).'));
P('inflowShY', 0.6, 'fraction', 'BEHAVIOUR', 'Share of arrivals through the net-immigration lever who are young (18–34).', assumed('Most immigrants to Iceland arrive young (Statistics Iceland, migration by age); the rest are of working age.'));
P('inflowShW', 0.4, 'fraction', 'BEHAVIOUR', 'Share of arrivals through the net-immigration lever who are of working age (35–66).', assumed('The rest of the arrivals after the young; none are 67 or over.'));
P('inflowShO', 0, 'fraction', 'BEHAVIOUR', 'Share of arrivals through the net-immigration lever who are 67 or over.', assumed('Labour migrants are of working age.'));
P('phiW', 0.7, 'per year', 'BEHAVIOUR', 'Wage error correction: wage growth slows while wages, as bargainers see them, are high relative to the value-added price (the Nordic main-course model).', { basis: 'calibrated', note: 'v1 tuned 0.4 with wages measured against domestic prices and no contract lag. Against the value-added price, with the gap seen by bargainers following the actual gap at lamWG, 0.7 keeps real variables back within about a fifth of their peak by year 6 (wage-back-*, at most 0.25) with the key-rate peak at about 1.46 (at most 1.5); 0.4 left output and unemployment 30% of their peak at year 6 (labour-LAB-2 and trade-nominal-drift, 29 September 2026).' });

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
P('muG', 0.4, 'fraction', 'BEHAVIOUR', 'Import share of government purchases (medicines, equipment).', placeholder('Within the research report’s assumed import leakage of 0.35–0.45 of spending (dial table, "Import leakage", from the ~43% import ratio). v1 tuned it within 0.3–0.4 against its fiscal-multiplier check; that check now measures public investment, whose imports use muI, so it no longer tests this value.'));
P('muI', pct('import_content.investment'), 'fraction', 'BEHAVIOUR', 'Import share of investment goods (TiVA import content of investment).', dataProv('import_content.investment'));
P('muX', pct('import_content.exports'), 'fraction', 'BEHAVIOUR', 'Imported inputs per unit of exports, all exporters together (TiVA); what fisheries, aluminium and tourism do not use sets other exporters’ import share.', dataProv('import_content.exports'));
P('epsM', 0.75, 'elasticity', 'BEHAVIOUR', 'Import volumes versus the real exchange rate.', {
  basis: 'calibrated',
  note: 'Within the 0.5–1 range of import price elasticities estimated for small open economies. Raised from v1’s assumed 0.6 when imports came to be paid at border prices (lever review FX-2, 29 September 2026): with lamRer it sets how fast trade closes a current-account gap, and 0.75 keeps world-prices-krona-year1, wage-unemployment-peak and rate-inflation-trough in range together.',
});
P('eFish', 0.2, 'elasticity', 'BEHAVIOUR', 'Marine export volume versus profitability (the world fish price × the exchange rate ÷ domestic prices): a supply response, since fish sells at world prices and a weaker króna or dearer fish makes it more profitable. Small, because catches are mostly quota-bound: volume moves through fuller use of quotas, the product mix and aquaculture, which quotas do not cap.', assumed());
P('eAlu', 0.05, 'elasticity', 'BEHAVIOUR', 'Aluminium export volume versus the real exchange rate: a supply response, since aluminium sells at a dollar price (tiny: the smelters run at capacity).', assumed());
P('eTour', 1, 'elasticity', 'BEHAVIOUR', 'Tourism volume versus the real exchange rate.', assumed());
P('eOther', 0.8, 'elasticity', 'BEHAVIOUR', 'Other export volume versus the real exchange rate.', assumed());
P('lamXD', 3, 'per year', 'BEHAVIOUR', 'How fast a change in foreign demand, or a rise in foreign visitors, reaches export volumes: at 3 a year about a fifth in the first month and 95% within a year.', assumed('Foreign orders and visitor numbers respond over quarters, not in the month demand shifts: the GDP response to a foreign-demand shock in small open economies is hump-shaped, peaking after 3–6 quarters (Justiniano and Preston 2010, Journal of International Economics 81; CBI QMM simulations). Before, the lever moved volumes in full in month 1, so output peaked in month 1 (trade-month1-export-jump, 29 September 2026).'));
P('lamTourDown', 50, 'per year', 'BEHAVIOUR', 'How fast a fall in foreign visitors reaches tourism volumes: at 50 a year, 98% within a month.', assumed('Visitors can stop coming at once, as after the 2010 eruption and in 2020; rises are limited by flights, hotel rooms and staff and follow lamXD.'));
P('lamRer', 1.5, 'per year', 'BEHAVIOUR', 'How fast trade volumes react to the real exchange rate.', {
  basis: 'calibrated',
  note: 'About 40% of a change in the real exchange rate reaches trade volumes within four months and 78% within a year, as the J-curve literature finds volumes turn within 6–12 months (Magee 1973). Raised from v1’s assumed 1 when imports came to be paid at border prices (lever review FX-2, 29 September 2026), so that the current account turns within a year after a depreciation; checked with epsM against world-prices-krona-year1 and wage-unemployment-peak.',
});
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
P('pfGovShare', pct('pensions.pf_share_of_govt_bonds'), 'fraction', 'IDENTITY', 'Pension funds’ share of government bonds (applied to all government debt; indexed bonds first).', dataProv('pensions.pf_share_of_govt_bonds', `The datum is a share of Treasury bonds (ISK 1,490.5 bn, about ${((1490.5 / GDP_BN) * 100).toFixed(1)}% of GDP), but the model applies it to all general-government debt (${d('money_credit.govt_debt_pct_gdp')}% of GDP, including loans and municipal debt). So the funds hold about ${(pct('pensions.pf_share_of_govt_bonds') * d('money_credit.govt_debt_pct_gdp')).toFixed(1)}% of GDP of government debt in the model against ${((873.8 / GDP_BN) * 100).toFixed(1)}% in Treasury bonds in the data.`));
P('bondCB', 1, '% of GDP', 'IDENTITY', 'The central bank’s government bonds.', placeholder());
P('bondO', 4, '% of GDP', 'IDENTITY', 'Older households’ government bonds.', placeholder());
P(
  'bondW',
  0.072 * d('money_credit.govt_debt_pct_gdp'),
  '% of GDP',
  'IDENTITY',
  'Non-residents’ government bonds (carry trade).',
  derived(
    `Foreign holders’ 7.2% share of Treasury bonds (Lánamál ríkisins, 31 Dec 2025; calibration.json: pensions.pf_share_of_govt_bonds, notes) × general-government debt (Hagstofa THJ05181). The share is applied to a broader aggregate than it was measured on: on Treasury bonds alone it would be ${((0.072 * 1490.5) / GDP_BN * 100).toFixed(2)}% of GDP.`,
  ),
);
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
P('fdiTarget', 0.33, '% of GDP/yr', 'IDENTITY', 'Baseline profits paid to foreign owners of exporters (the smelters’ parents and others), paid in the model as cash dividends; it fixes the foreign share of other exporters’ dividends.', {
  basis: 'derived',
  source: 'Eurostat bop_c6_a (BPM6, CBI source), income on inward direct investment, 2024: dividends ISK 11.9 bn + reinvested earnings 3.4 bn ÷ 2024 GDP [calibration.json: export_sector.profits_to_foreign_owners_pct_gdp, notes]',
  vintage: '2024',
  note: 'Equity income (dividends plus reinvested earnings), not the leaf’s value of 1.25, which also counts intercompany interest. The model pays all of it as cash dividends; reinvested earnings are never paid in cash, and dividends alone were about 0.26% of GDP. That lower value is not used because the smelters’ dividends alone are about as large, which would leave other exporters a negative foreign share.',
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
P('purY', 1.2, '% of GDP/yr', 'BEHAVIOUR', 'Homes the young buy from older households each year, at baseline prices: the net flow of homes between generations, not all sales.', placeholder());
P('purW', 1, '% of GDP/yr', 'BEHAVIOUR', 'Homes working-age households buy from older households each year, at baseline prices: the net flow between generations, not all sales.', placeholder());
P('turnRate', 0.05, 'per year', 'BEHAVIOUR', 'Share of the young’s and of working-age households’ homes sold each year to others in the same age group. The seller repays the mortgage on the home and the buyer takes out a new one, so the money nets out within the group but gross mortgage lending and repayment are several times larger than the net flows.', assumed('HMS (Housing and Construction Authority) registers about 10–12 thousand residential purchase agreements a year on about 160 thousand dwellings, 6–7% of the stock; leaving out new builds and the sales between generations already in purY and purW gives about 5%. With it and ltvAvg0, baseline gross mortgage lending is about 6.3% of GDP a year (lever review credit-gross-mortgage-flows-vs-home-purchases, 29 September 2026).'), { min: 0, max: 0.2 });
P('ltvAvg0', 0.63, 'fraction', 'BEHAVIOUR', 'Average loan-to-value of new mortgages at baseline: new loans pay for 63% of the price of the homes bought, for the young and for working-age buyers. Sellers’ loans, repaid at the sale, are larger than their group’s average loan (sellerDebtY, sellerDebtW), since that average includes homes bought long ago with little debt left.', assumed('New mortgages in Iceland average roughly 60–70% of the price, first-time buyers more (Central Bank of Iceland, Financial Stability); to be set from those data. Fixing it for both groups makes the 90% cap on first-time buyers trim some of the young’s loans, as it does in the data: with the average taken from placeholder home values it was 40% for the young, and their cap never bound (review of the lever fixes, 29 September 2026).'), { min: 0.3, max: 0.9 });

/* ----------------------------------------------------------------- banks */
P('kapT', 0.22, 'fraction', 'POLICY', 'Banks’ target capital ratio (equity ÷ risk-weighted assets): the requirement plus the buffer banks choose to keep. The baseline sits exactly on it, and loans cost neither more nor less there.', assumed('Total capital requirement about 20% plus a management buffer of about 2 points, so the baseline already holds the buffer and is not solved above it.'));
P('kapMin', 0.18, 'fraction', 'POLICY', 'Capital ratio at which the loan premium reaches its maximum.', assumed());
P('rwM', 0.35, 'fraction', 'POLICY', 'Risk weight on mortgages.', assumed('Basel standardised mortgage risk weight.'));
P('rwL', 1, 'fraction', 'POLICY', 'Risk weight on business loans.', assumed('Basel standardised corporate risk weight.'));
P('sCap', 0.02, 'fraction/yr', 'BEHAVIOUR', 'Loan premium when bank capital falls to its minimum. The premium rises in proportion from zero at target; above target the same slope gives a discount of at most half this.', assumed('The discount above target makes the premium symmetric around the baseline, so small moves in capital either way price loans by the same amount (lever review FX-9, 29 September 2026).'));
P('lamEq', 1, 'per year', 'BEHAVIOUR', 'How fast banks rebuild capital by cutting dividends.', assumed());
P('lamDivB', 1, 'per year', 'BEHAVIOUR', 'Smoothing of bank profits behind dividends.', assumed());
P('divBshG', 0.35, 'fraction', 'IDENTITY', 'Share of bank dividends paid to the government (it owns Landsbankinn).', assumed());
P('divBshPF', 0.35, 'fraction', 'IDENTITY', 'Share of bank dividends paid to pension funds.', placeholder());
P('divBshW', 0.2, 'fraction', 'IDENTITY', 'Share of bank dividends paid to working-age households (the rest to older households).', placeholder());

/* ----------------------------------------------------------------- rates */
P('i0', 0.03, 'fraction/yr', 'POLICY', 'Neutral real key rate. The nominal neutral rate, which the key rate is compared with, is i0 + piT.', assumed());
P('piT', 0, 'fraction/yr', 'POLICY', 'Inflation target of the model. Iceland targets 2.5%; the zero-inflation baseline uses 0, so only deviations show.', assumed());
P('mD', 0.01, 'fraction/yr', 'BEHAVIOUR', 'Deposit margin below the key rate.', assumed());
P('sB', 0.005, 'fraction/yr', 'CONTRACT', 'Spread over the key rate of the coupon on newly sold nominal government bonds. Bonds already sold keep their coupon until they mature (bondMaturity).', assumed());
P('bondMaturity', 5, 'years', 'CONTRACT', 'Average time to maturity of nominal government bonds: each year about 1 ÷ this of them mature and are refinanced at the current rate.', {
  basis: 'data',
  source: 'Lánamál ríkisins, Medium-Term Debt Management Strategy 2026–2030 (29 December 2025): average time to maturity of Treasury debt at least five years. https://lanamal.is/asset/13854/stefna-i-lanamalum-2026-2030-enska.pdf',
  vintage: '2025',
  note: 'The strategy’s floor, applied to the nominal bonds. Nominal debt (3- and 5-year RIKB bonds and T-bills of up to a year) is shorter than indexed RIKS (10 and 20 years), which the model treats separately; general-government loans and municipal debt are not in the strategy. Before review MON-1 the whole nominal stock repriced with the key rate every month.',
});
P('sL', 0.025, 'fraction/yr', 'BEHAVIOUR', 'Spread of business-loan rates over the key rate.', assumed());
P('sMN', 0.01, 'fraction/yr', 'BEHAVIOUR', 'Spread of non-indexed mortgage rates over the key rate.', assumed());
P('rMI0', 0.025, 'fraction/yr', 'BEHAVIOUR', 'Real rate on indexed mortgages at baseline.', assumed());
P('psiIdx', 0.4, 'fraction', 'BEHAVIOUR', 'Pass-through of the key rate to the real rate on indexed mortgages.', assumed());
P('rBI0', 0.02, 'fraction/yr', 'CONTRACT', 'Real coupon on indexed government bonds.', assumed());
P('sBB', 0.01, 'fraction/yr', 'CONTRACT', 'Spread of bank (covered) bonds over the key rate.', assumed());
const IF0 = 0.02;
P('iF0', IF0, 'fraction/yr', 'BEHAVIOUR', 'Normal foreign interest rate. Carry traders compare the key rate above its nominal neutral (i0 + piT) with the foreign rate above this.', assumed());
P('iFnow', IF0, 'fraction/yr', 'POLICY', 'Foreign interest rate in force at the start, before the foreign-rate lever.', derived('Equal to iF0 on the steady start. A start from today sets today’s foreign rate here, so the rate gap with abroad starts where it is (docs/design/start-from-today.md §4.6).'));
P('pfForeignRatePass', 0.3, 'fraction', 'BEHAVIOUR', 'Share of pension funds’ foreign assets whose cash yield follows the foreign interest rate: the bonds and deposits. The rest is shares and equity funds, whose dividends do not rise when rates abroad do.', assumed('The funds’ foreign assets are mainly foreign shares and units in equity funds (Íslandsbanki, "Pension funds’ foreign assets hit all-time high", 2019; funds’ investment policies such as a 70/30 split of foreign equities and bonds). A higher foreign rate paid on all of them made the funds’ extra income, converted into krónur, outweigh the carry trade and strengthen the króna (review E3).'));
P('psiPF', 1, 'fraction', 'BEHAVIOUR', 'Points of assets pension funds add to their target foreign share for each point the foreign interest rate is above normal: higher yields abroad draw more of their savings abroad.', assumed('Teaching value. Uncovered interest parity: when rates abroad rise, domestic savers as well as foreign carry traders move money out of krónur, and Iceland’s pension funds are the largest domestic buyer of foreign currency (Central Bank of Iceland, Financial Stability). At 1, a 1-point rise shifts about 1.8% of GDP abroad over two to three years, enough to outweigh the funds’ extra foreign income for the first two years (review E3). The key rate is left out: most of the funds’ domestic assets are indexed at fixed real rates, and adding it pushed the key-rate calibration checks outside their bands.'));
P('kapPFdom', 0.017, 'fraction/yr', 'BEHAVIOUR', 'Extra yield on covered bonds and mortgages per unit of fall in pension funds’ demand for domestic assets (their domestic tilt): 1.7 points for a fall of all of it, so about 0.15 pp when the lever moves 5 points of assets abroad and 0.6 pp for 20.', tuned('the pension-fund tilt abroad: with the capital discount banks give while inflation lifts their capital, indexed mortgage rates are still 0.05–0.4 pp higher after two years at +5, and at +20 real house prices do not rise above no change within three years on Manual (review of the lever fixes, 29 September 2026). Portfolio balance and preferred habitat: the yield on an asset rises when its natural buyers want less of it (Tobin 1969; Vayanos and Vila 2021). The research report’s “Pension funds tilt abroad” scenario expects indexed yields +10–30 bp and dearer covered-bond funding for banks (docs/research/icelandic-economy-flow-simulation.md; lever review credit-pf-foreign-no-domestic-yield-channel, 29 September 2026); this sits at the top of that range for moderate tilts. Driven by the funds’ target, not their holdings, so it moves smoothly.'));
P('psiPFdomN', 1, 'fraction', 'BEHAVIOUR', 'Share of the domestic funding premium passed to non-indexed mortgage rates: all of it, as banks price new loans on their marginal funding, the covered bonds the funds buy, even though deposits fund part of the book.', tuned('the pension-fund tilt abroad, with kapPFdom (review of the lever fixes, 29 September 2026). Half, the first choice, left real house prices rising within three years of a 20-point tilt on Manual.'));
P('iFXR', 0.02, 'fraction/yr', 'BEHAVIOUR', 'Yield on the central bank’s foreign reserves at the normal foreign rate; it moves one for one with the foreign rate.', assumed());
P('lamRes', 0.2, 'per year', 'POLICY', 'How fast the central bank sells foreign reserves above its target (fxr, in % of GDP) back into krónur, or buys them when they are below it.', assumed('Teaching value: a slow reserve policy, so that a lasting rise in rates abroad builds up the reserves for years before they are sold, and the reserves settle near their target instead of compounding (lever review FX-1 follow-up, 29 September 2026). The Central Bank of Iceland manages its reserves against adequacy targets (about 18–20% of GDP; IMF reserve-adequacy metric) and buys and sells foreign currency in the market to do so.'));

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
P('capUse0', 0.6, 'fraction', 'BEHAVIOUR', 'Baseline new lending as a share of what the debt-service cap would allow if every new borrower borrowed right up to it: the average borrower’s payments use 60% of the cap.', assumed());
P('sigmaDsti', 0.35, 'fraction', 'BEHAVIOUR', 'How much new borrowers differ in the share of income their payments would take (log-standard deviation, loan-weighted). With capUse0 it puts about 10% of new lending with borrowers at the debt-service cap at baseline.', assumed('To be calibrated to the distribution of debt service on new mortgages in the Central Bank of Iceland’s Financial Stability reports. Borrower-based caps bind on the tail of borrowers, not on the average (Kuttner and Shim 2016; Alam et al. 2019, IMF WP 19/66); with one representative borrower the cap did nothing until tightened by 14 points (lever review credit-dsti-representative-borrower, 29 September 2026).'), { min: 0.05, max: 1 });
P('sigmaLtv', 0.22, 'fraction', 'BEHAVIOUR', 'How much home buyers differ in the share of the price they borrow (log-standard deviation, loan-weighted). At baseline about a sixth of working-age buyers’ new lending, and a fifteenth of the young’s, goes to buyers at the cap (80%, and 90% for first-time buyers).', assumed('To be calibrated to the distribution of loan-to-value ratios on new mortgages (Central Bank of Iceland, Financial Stability). Loan-to-value limits bind at origination on the buyers who want to borrow most (Richter, Schularick and Shim 2019; Cerutti, Claessens and Laeven 2017).'), { min: 0.05, max: 1 });
P('ltvLimit', 0.8, 'fraction', 'POLICY', 'Loan-to-value cap on new mortgages: the largest loan as a share of the price of the home bought (the lever; first-time buyers get ltvYExtra more).', {
  basis: 'data',
  source: 'Central Bank of Iceland Rules No. 1131/2025 on maximum loan-to-value ratios, art. 3: 80% in general and 90% for first-time buyers, in force 3 November 2025 (also CBI Financial Stability 2026/1)',
  vintage: '2025',
});
P('ltvYExtra', 0.1, 'fraction', 'POLICY', 'Extra loan-to-value room for the young (first-time buyers).', {
  basis: 'data',
  source: 'Central Bank of Iceland Rules No. 1131/2025 on maximum loan-to-value ratios, art. 3: 80% in general and 90% for first-time buyers, in force 3 November 2025 (also CBI Financial Stability 2026/1)',
  vintage: '2025',
  note: 'The model treats every young buyer as a first-time buyer, an approximation. v1 used 5 points (the 85% limit of earlier rules).',
});

/* ------------------------------------------ households: spending and borrowing */
P('aLY', 0.95, 'fraction', 'BEHAVIOUR', 'Young: share of labour and transfer income spent.', assumed());
P('aLW', 0.9, 'fraction', 'BEHAVIOUR', 'Working age: share of labour and transfer income spent.', assumed());
P('aLO', 0.85, 'fraction', 'BEHAVIOUR', 'Older: share of pensions and transfers spent.', assumed());
P('aK', 0.2, 'fraction', 'BEHAVIOUR', 'Share of real interest and dividend income spent (low: a stabiliser kept from v0).', assumed());
P('betaC', 0.6, 'fraction', 'BEHAVIOUR', 'How much spending falls per point of real key rate above neutral (as a share of income-based spending, per unit rate).', tuned('the rate-shock output trough'));
P('aWY', 0.15, 'per year', 'BEHAVIOUR', 'Young: extra spending per króna of liquid wealth above baseline, a year.', assumed());
P('aWW', 0.1, 'per year', 'BEHAVIOUR', 'Working age: extra spending per króna of liquid wealth above baseline, a year.', assumed());
P('aWO', 0.15, 'per year', 'BEHAVIOUR', 'Older: extra spending per króna of liquid wealth above baseline, a year (spending down savings).', assumed());
P('aBuf', 1, 'per year', 'BEHAVIOUR', 'How hard households cut spending as their savings fall below a buffer of a few months of spending: extra saving a year per króna of shortfall.', assumed('Buffer-stock saving (Carroll 1997, Quarterly Journal of Economics 112(1)): households hold a precautionary cushion and save hard to rebuild it when it runs low. Before it, a lasting 5-point income-tax rise with the key rate held drained working-age deposits almost to zero within 20 years and the cash limit bound (tax-TAX-2, 29 September 2026).'));
P('bufMonths', 5, 'months', 'BEHAVIOUR', 'The cash buffer households protect, in months of their own spending. At baseline every group holds more (young households about 6.6 months, working-age about 6), so it does not bind.', assumed('Chosen so that income tax +5 points or VAT +10 points held for 20 years on Manual leave working-age deposits at about a third of baseline instead of emptying them (tax-TAX-2, 29 September 2026).'));
P('aNL', 0.5, 'fraction', 'BEHAVIOUR', 'Share of net new mortgage borrowing spent on goods and services (beyond the homes themselves).', assumed());
P('aHY', 0.01, 'per year', 'BEHAVIOUR', 'Young: housing-wealth effect on spending.', assumed());
P('aHW', 0.015, 'per year', 'BEHAVIOUR', 'Working age: housing-wealth effect on spending.', assumed());
P('aHO', 0.03, 'per year', 'BEHAVIOUR', 'Older: housing-wealth effect on spending.', assumed());
P('lamC', 0.9, 'per year', 'BEHAVIOUR', 'Consumption habit: how fast spending moves toward its target.', tuned());
P('betaM', 3, 'fraction', 'BEHAVIOUR', 'Desired mortgage debt versus the real mortgage rate (share lost per unit of rate).', assumed());
P('lamM', 0.25, 'per year', 'BEHAVIOUR', 'How fast households move their mortgage debt toward what they want.', assumed());
P('betaMH', 0.5, 'elasticity', 'BEHAVIOUR', 'Desired mortgage debt versus real house prices.', assumed());
P('lamYP', 1, 'per year', 'BEHAVIOUR', 'How fast the income households borrow against (their lasting income) follows their gross income: a mean lag of about a year.', assumed('Permanent income: credit demand follows income households expect to last, not last month’s pay (Friedman 1957; the credit channel, Bernanke and Gertler 1995). With a one-year mean lag the extra borrowing after a 10% wage settlement builds up and peaks after about a year in both modes, as the lever review asked; borrowing against last month’s income turned the settlement into net mortgage lending 1.2% of GDP a year higher from month 2, about half of all baseline lending then (lever review LAB-3, 29 September 2026).'));

/* --------------------------------------------------------------- housing */
const RENT: Provenance = {
  basis: 'calibrated',
  note: 'Since June 2024 Statistics Iceland measures owner-occupied housing in the CPI by rental equivalence, from market rents in the HMS rental register, so the housing component is a rent index (lever review MON-4, 29 September 2026). Market rents respond to house prices partly and slowly, and may even rise after a rate rise as buyers turn to renting (Dias and Duarte 2019, "Monetary policy, housing rents, and inflation dynamics", Journal of Applied Econometrics). Tuned so the key-rate experiment’s inflation trough comes nearer QMM’s −0.24 pp (rate-inflation-trough) with every other calibration check in range; to be re-estimated against the HMS rent index (leiguvísitala) and Statistics Iceland’s post-June-2024 imputed-rent series.',
};
P('lamH', 1, 'per year', 'BEHAVIOUR', 'How fast real house prices adjust.', assumed());
P('betaHY', 1, 'elasticity', 'BEHAVIOUR', 'Real house prices versus real household disposable income.', assumed());
P('betaHC', 3, 'fraction', 'BEHAVIOUR', 'Real house prices versus the flow of net mortgage credit (×100: % per % of GDP).', assumed());
P('betaHR', 2, 'fraction', 'BEHAVIOUR', 'Real house prices versus the real mortgage rate (share lost per unit of rate).', assumed());
P('betaHN', 1, 'elasticity', 'BEHAVIOUR', 'Real house prices versus the adult population: 1% more people raise the target by about 1%, as the housing stock is fixed.', placeholder('Saiz (2007, "The impact of immigration on housing rents and prices", Journal of Urban Economics) finds rents and prices rise about 1% for an inflow of immigrants of 1% of a city’s population. Before this term the migration buffer moved only the unemployment count, so more arrivals in a boom lowered house prices through slower wage growth (lever review LAB-4, 29 September 2026). Income is already in the rule, so the right value may be lower; to be estimated.'));
P('lamMig', 1, 'per year', 'BEHAVIOUR', 'How fast housing demand follows the people who have arrived or left: newcomers rent or buy over months, and leavers give up homes as leases end (a mean lag of about a year).', assumed('Keeps housing demand from reversing the month jobs do; with it, a larger migration buffer lowers house prices in a bust and raises them in a boom on average over years 1–5, not only at first (lever review LAB-4, 29 September 2026).'));
P('lamRent', 0.5, 'per year', 'BEHAVIOUR', 'How fast market rents, the housing component of the CPI, move toward their target: at 0.5 a year about 40% of a gap closes in a year, as leases are reset.', RENT);
P('betaRentH', 0.5, 'elasticity', 'BEHAVIOUR', 'Market rents versus real house prices: rents rise 0.5% for each 1% rise in house prices relative to other prices, in the long run.', RENT);
P('betaRentY', 1, 'elasticity', 'BEHAVIOUR', 'Market rents versus households’ real disposable income, in the long run: one for one, so rents keep their share of income.', RENT);

/* ------------------------------------------------------------------ firms */
P('betaPi', 0.3, 'elasticity', 'BEHAVIOUR', 'Investment versus real profits.', assumed());
P('betaRI', 1.5, 'fraction', 'BEHAVIOUR', 'Investment versus the real loan rate (share lost per unit of rate).', tuned('the rate-shock output trough'));
P('betaU', 0.5, 'fraction', 'BEHAVIOUR', 'Investment versus capacity use (the accelerator).', assumed());
P('lamInv', 1.5, 'per year', 'BEHAVIOUR', 'Investment planning lag: how fast investment moves toward its target.', tuned());
P('lamInvSpend', 3, 'per year', 'BEHAVIOUR', 'How fast planned investment becomes spending: machines are ordered and buildings built over the following months.', assumed('Time to build (Kydland and Prescott 1982): with plans moving at lamInv and spending following them at 3 a year, investment’s response to a rate change peaks a quarter or two after the change and outlasts it (monetary-MON-11, 29 September 2026).'));
P('lamPi', 2, 'per year', 'BEHAVIOUR', 'Smoothing of the profits investors look at.', assumed());
P('rhoL', 1, 'fraction', 'BEHAVIOUR', 'The aluminium smelters’ parents take less cash out when the smelters’ debt is above its baseline share of GDP (per unit of baseline after-tax profit).', assumed());
P('payMarginal', 0.3, 'fraction', 'BEHAVIOUR', 'Share of a change in after-tax profit that domestically owned and other exporting firms pay out at once (the rest repays debt, until the debt rule pays it out too).', assumed('Lintner (1956): firms move dividends toward a target payout only partly each year; 0.3 is a typical speed. Before, fisheries paid out about 5% of a windfall at the margin (trade-fish-windfall-hoarded, 29 September 2026).'));
P('payDebt', 0.2, 'per year', 'BEHAVIOUR', 'How fast owners bring a firm’s debt back to its normal share of GDP: the share of the excess (or shortfall) a year added to (or taken from) dividends. When profit is not enough, the owners put new money in.', assumed('Stock-flow norm (Godley and Lavoie 2007, ch. 11): firms’ debt-to-income converges. After 2008 Icelandic firms were recapitalised by owners and creditors. At 0.2 a year, fish prices −30, tourism +30 or foreign demand +20 held for 50 years keep every firm’s debt at most about twice its normal share of GDP; before, retention capped at 1 let fisheries’ loans grow without limit (trade-exporter-debt-spiral, 29 September 2026).'));
P('ownerCashSpeed', 0.1, 'per year', 'BEHAVIOUR', 'The most a firm can call on its owners in Iceland to put in: this share a year of each owner’s deposits, in proportion to its stake.', assumed('Owners cannot put in money they do not have. At 0.1 a year the cap never binds when a single sector is squeezed (fish prices −30 or tourism +30), but in a deflationary collapse of the whole economy it keeps owners, pension funds above all, from being drained to pay for every firm’s debt at once.'));
P('paySpare', 1, 'per year', 'BEHAVIOUR', 'How fast a firm with no bank debt pays out deposits above its usual holdings.', assumed('As the smelters’ parents sweep up free cash: within about a year.'));
P('fishFee', 0.33, 'fraction', 'POLICY', 'Fishing fee (veiðigjald): the share of fisheries’ profit above normal the state takes, two years later.', assumed('Lög um veiðigjald nr. 145/2018 set the fee at 33% of the fleet’s calculated fishing profit, from its accounts two years earlier. The model keeps the baseline fee inside fisheries’ normal costs and government revenue and adds only the part that follows profit above normal, so the baseline is unchanged (trade-fish-windfall-hoarded, 29 September 2026). https://www.althingi.is/lagas/nuna/2018145.html'));
P('betaLev', 0.3, 'fraction', 'BEHAVIOUR', 'Investment versus debt: share of normal investment lost when a firm’s debt is twice its normal share of GDP.', assumed('Financial-accelerator and cash-flow effects on investment (Fazzari, Hubbard and Petersen 1988; Bernanke, Gertler and Gilchrist 1999): a firm that owes more than usual invests less (trade-exporter-debt-spiral, 29 September 2026).'));
P('firmCashSpeed', 12, 'per year', 'BEHAVIOUR', 'How fast firms borrow or repay to bring their deposits back to target (12: within about a month, as in v1).', assumed('v1 closed the gap every month.'));

/* ---------------------------------------------- prices, wages, expectations */
P('omH', pct('cpi_weights.housing'), 'fraction', 'IDENTITY', 'CPI weight of housing: owner-occupiers’ imputed rent (20.9) and actual rents (3.6).', dataProv('cpi_weights.housing', 'Imputed rent has been measured by rental equivalence (HMS market rents) since June 2024; the model’s housing component is a market-rent index (housing.ts).'));
P('omM', pct('cpi_weights.imported_goods'), 'fraction', 'IDENTITY', 'CPI weight of imported goods.', dataProv('cpi_weights.imported_goods'));
P('omD', pct('cpi_weights.domestic_goods_and_services'), 'fraction', 'IDENTITY', 'CPI weight of domestic goods and services.', dataProv('cpi_weights.domestic_goods_and_services'));
P('aLab', 0.55, 'fraction', 'BEHAVIOUR', 'Labour’s share of domestic unit cost (the rest is imported inputs).', tuned('the wage-shock price level'));
P('eta', 0.07, 'fraction', 'BEHAVIOUR', 'How far capacity pressure pushes prices above unit cost (per unit of output gap).', {
  basis: 'calibrated',
  note: 'Calibrated to the CBI QMM rate experiment (rate-inflation-trough). v1 tuned 0.5 while the key rate dropped about 1.5 pp the month the rule took over after the hold, which cut the experiment short; once the rule eases smoothly from the rate held (lever review MON-2, 29 September 2026), 0.5 made inflation fall about 0.47 pp against QMM’s 0.24 pp for an output fall of the same size, so prices reacted to slack about twice as strongly as QMM’s. The trough is still about 40% deeper than QMM’s and near the band’s edge, a known gap (calibration.ts KNOWN_GAPS): holding terms at baseline shows the extra depth comes from the króna and housing channels, while capacity pressure at 0.07 adds only about 0.02 pp. Flat price Phillips curves (Hazell, Herreño, Nakamura and Steinsson 2022, Quarterly Journal of Economics 137(3); Del Negro, Lenza, Primiceri and Tambalotti 2020, Brookings Papers on Economic Activity) make a small direct effect of slack on prices plausible, but they are not an estimate of eta: the value is set by the check. Wages and the króna still carry slack into prices.',
});
P('lamUC', 1.5, 'per year', 'BEHAVIOUR', 'How fast firms’ view of what imported inputs cost follows what they actually cost delivered.', tuned('the wage-shock inflation peak timing; since labour-LAB-2 it sets only the import part of unit cost, which krona-pass-through-year1 checks'));
P('lamUCw', 2.5, 'per year', 'BEHAVIOUR', 'How fast firms’ view of their labour cost follows the wage rate: at 2.5 a year a fifth of a pay rise is in their costs within a month and nearly half within three months.', {
  basis: 'calibrated',
  note: 'Tuned so that after a 10% wage settlement the real-wage gain erodes mainly through prices catching up, with the wage-shock checks (inflation peak, key-rate peak, unemployment peak, price level after 6 years, real variables back in years 3–6) in range. A single speed for labour and import costs could not do both: at 3 a year for both, krona-pass-through-year1 rose to about 0.25, above WP85’s 0.23 (labour-LAB-2, 29 September 2026). 2.5 leaves the wage-shock key-rate peak and price level after six years further inside their ranges than 3.',
});
P('lamP', 2, 'per year', 'BEHAVIOUR', 'How fast prices follow the markup on unit cost.', tuned('the wage-shock inflation peak timing'));
P('lamPm', 2, 'per year', 'BEHAVIOUR', 'How fast the prices importers charge at home (wholesale import prices) follow what they pay abroad, world prices × the exchange rate: they reprice stocks and contracts bought earlier gradually. What Iceland pays abroad moves at once (border import prices).', tuned());
P('distM', 0.35, 'fraction', 'BEHAVIOUR', 'Share of what buyers in Iceland pay for imported goods and inputs that is the Icelandic cost of getting them to the buyer (unloading, wholesale, transport and retail), priced like other domestic goods. Only the rest follows world prices in krónur, with the lag of wholesale import prices.', {
  basis: 'calibrated',
  note: 'Campa and Goldberg (2010, "The sensitivity of the CPI to exchange rates: distribution margins, imported inputs, and trade exposure", Review of Economics and Statistics 92(2)) find that distribution margins on household consumption goods are between 30% and 50% of purchasers’ prices across OECD countries; Burstein, Neves and Rebelo (2003, Journal of Monetary Economics 50) put distribution costs above 40% of retail prices in the United States. One margin serves both consumer goods and firms’ imported inputs, which carry smaller margins, so it sits at the low end of that range. 0.35 is chosen there so that world prices +10% raise the CPI 1.5–2.3% within a year, as CBI WP85’s pass-through of 0.15–0.23 gives (checks world-prices-cpi-year1 and krona-pass-through-year1). Before it, buyers paid world prices in krónur one for one and the CPI rose 2.7% in a year and 3.7% in two (review E6, 29 September 2026). https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr247.pdf',
});
P('chi', 0.5, 'fraction', 'BEHAVIOUR', 'Weight of the inflation target in expectations (how well anchored they are).', tuned());
P('lamVat', 6, 'per year', 'BEHAVIOUR', 'How fast shops pass a change in VAT into their prices: at 6 a year about 40% in the first month, 78% within a quarter and 95% within six months.', assumed('Teaching value for the speed. Pass-through of standard-rate VAT changes is close to full across countries (Benedek, De Mooij, Keen and Wingender 2020, "Varieties of VAT pass through", International Tax and Public Finance), but not always immediate, and weaker for cuts than for rises (Benzarti, Carloni, Harju and Kosonen 2020, Journal of Political Economy). Passing it all through in the month the rate changed made real spending jump 8% in month 1 for a 10-point cut (review E4).'));
P('lamPia', 1.5, 'per year', 'BEHAVIOUR', 'How fast the remembered rate of inflation updates (adaptive expectations).', assumed());

/* ------------------------------------------------------------ policy rule */
P('aPi', 1.3, 'fraction', 'POLICY', 'Key-rate response to expected inflation above target (points per point).', tuned());
P(
  'aY',
  1,
  'fraction',
  'POLICY',
  'Key-rate response to the output gap (points per % of output).',
  assumed(
    'Taylor’s (1999) balanced-rule weight on the output gap. No calibration check selects it: after audit H4 (the consumption deflator) and M12/M20 (the CBI QMM rate experiment), v1’s 0.6 and 1.0 both keep every rate check in range. It was raised from 0.6 because, under v1’s old rate-shock scenario (a 1 pp offset on the rule for 8 quarters), 0.6 put the output trough outside rate-output-timing’s range; decision 0006 has the history.',
  ),
);
P('aPiA', 0.5, 'fraction', 'POLICY', 'Key-rate response to actual 12-month inflation above target (at constant VAT).', {
  basis: 'calibrated',
  note: 'Raised from v1’s 0.3 so that the rule obeys the Taylor principle for lasting actual inflation too (Taylor 1993; Woodford 2003): with expectations half anchored (chi 0.5) a lasting point of inflation raises the key rate aPi × (1 − chi) + aPiA = 1.15 points, not 0.95 (lever review MON-9 and trade-taylor-fixed-potential, 29 September 2026). Checked against wage-key-rate-peak (+1 to +1.5 pp) and wage-unemployment-peak.',
});
P('lamPol', 1.4, 'per year', 'POLICY', 'How fast the key rate moves toward what its rule says (smoothing): at 1.4 a year about 11% of the gap closes each month and 30% each quarter.', assumed('Estimated policy rules smooth the rate heavily: about 70–85% of last quarter’s rate carries over (Clarida, Galí and Gertler 2000, Quarterly Journal of Economics 115(1)), and the CBI’s QMM and DYNIMO rules have similar inertia. 1.4 a year leaves e^(−0.35) = 0.70 of the gap each quarter, the low end of that range. v1’s 3 (0.47 a quarter; legacy/v1-engine/SPEC.md) was half as inert (lever review MON-6, 29 September 2026). The checks bound it from below: much slower and the rule does not lean hard enough on a wage shock (wage-unemployment-peak).'));

/* --------------------------------------------- exchange rate and non-residents */
P('betaI', 0.35, 'fraction', 'BEHAVIOUR', 'Króna response to the interest-rate gap with abroad (log points per unit of rate): carry demand.', {
  basis: 'calibrated',
  note: 'Together with the carry trade’s wish to hold more krónur when Icelandic rates are high (portfolio balance, psiB), it sets the króna’s rise on impact per point of rate gap: about 0.6% in the first quarter against CBI QMM’s 0.67% (rate-krona). Lowered from v1’s 0.55 when the portfolio term came to count the carry trade’s wanted holdings (lever review FX-4 and MON-5, 29 September 2026); with 0.55 the króna rose about 0.8% and inflation fell too far in the rate experiment.',
});
P('betaH', 0.27, 'elasticity', 'BEHAVIOUR', 'Króna response to non-residents’ real króna holdings (portfolio balance), against what they want to hold, in a market of depth fxDepth.', {
  basis: 'calibrated',
  note: 'With fxDepth it sets how far the króna moves per 1% of GDP of krónur non-residents take on: 0.27 ÷ (krona0 + fxDepth) ≈ 1.7% at baseline, about 5% after a year of a 30% tourism slump (tourism-slump, against about 4% scaled from 2020), falling for larger swings. v1 assumed 0.3 on non-residents’ holdings alone, about 4% per 1% of GDP and unbounded (lever review TAX-1, 29 September 2026).',
});
P('fxDepth', 9, '% of GDP', 'BEHAVIOUR', 'Depth of the króna market beyond non-residents’ own holdings: other holders who take krónur on or give them up as the price moves (residents’ foreign-currency deposits, banks’ currency positions, exporters converting their earnings).', {
  basis: 'calibrated',
  note: 'A stand-in for the rest of the króna market until central-bank data on those positions are used: residents’ foreign-currency deposits alone are of this order. It bounds the portfolio premium: counting a short position down to half the depth, however few krónur non-residents hold the term makes the króna at most betaH × log((krona0 + fxDepth) ÷ (fxDepth ÷ 2)) ≈ 0.34 log points (about 40%) stronger, where v1’s premium had no bound (pension funds bringing 20 points of assets home made the króna twice as dear). Chosen with betaH so that tourism-slump and world-prices-krona-year1 stay in range (lever review TAX-1, 29 September 2026).',
});
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

/* ------------------------------------------------ liquidity: nobody pays with money they do not have */
const liq = 'New in the port (audit H1): keeps balance sheets possible far from the baseline; it never binds at the baseline.';
P('liquiditySpeed', 12, 'per year', 'BEHAVIOUR', 'How fast pension funds, households and non-residents can draw down their deposits to buy assets, or households to spend beyond their income: at 12 a year, at most 63% of their deposits in a month.', assumed(liq));
P('pfLiquidityFloorShare', 0.5, 'fraction', 'BEHAVIOUR', 'Cash buffer of pension funds, as a share of their usual deposit holdings: they buy assets only with deposits above it, and below it sell foreign assets, then let bank bonds run off, to rebuild it.', assumed(liq));
P('wDepositFloorShare', 0.5, 'fraction', 'BEHAVIOUR', 'Cash buffer of non-residents, as a share of their usual deposit share of króna holdings: they buy bonds only with deposits above it, and below it sell government bonds to rebuild it.', assumed(liq));
P('hoBondCashShare', 0.5, 'fraction', 'BEHAVIOUR', 'Share of older households’ spendable deposits set aside for buying bonds; the rest is for spending.', assumed(liq));

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
P('incomeTaxShift', 0, 'fraction', 'POLICY', 'Your change in the income-tax rate (the income-tax lever, Manual only). On Automatic the rate is the baseline plus the debt rule’s adjustment plus your offset (incomeTaxOffset).', lev('set by the income-tax lever.'));
P('vatShift', 0, 'fraction', 'POLICY', 'Change in the effective VAT rate (the VAT lever).', lev('set by the VAT lever.'));
P('rrShift', 0, 'fraction', 'POLICY', 'Change in the unemployment-benefit replacement rate (the lever).', lev('set by the unemployment-benefit lever.'));
P('dstiShift', 0, 'fraction', 'POLICY', 'Shift of both debt-service caps (the debt-service-cap lever).', lev('set by the debt-service-cap lever.'));
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
