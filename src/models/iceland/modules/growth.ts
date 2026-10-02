/** An evolving teaching reference: changes normal quantities, not ledger positions. */
import type { Ctx, IndicatorDef, ModelDef, ModuleDef, ParamDef, RuleDef } from '../../../core/types.ts';
import { AGES, FIRMS } from '../util.ts';

export interface GrowthAssumptions {
  realGrowth: number;
  populationGrowth: number;
  worldGrowth: number;
  inflation: number;
  capitalElasticity: number;
}

export const GROWTH_DEFAULTS: Readonly<GrowthAssumptions> = Object.freeze({
  realGrowth: 0.014, populationGrowth: 0.005, worldGrowth: 0.03,
  inflation: 0.025, capitalElasticity: 0.35,
});

export const GROWTH_PROFILE = {
  id: 'growing-teaching',
  label: 'Growing teaching reference',
  description: 'A transition from the solved stationary calibration. Persistent assumed trends, not a forecast or an observed Iceland-today opening state.',
  verifiedAsOf: '2026-09-30',
  realGrowthSource: 'https://indicators.cb.is/news-and-publications/article/monetary-bulletin-2026-3',
  realGrowthVintage: 'CBI Monetary Bulletin 2026/3, published 19 August 2026; 2026 forecast 1.4%',
  worldGrowthSource: 'https://www.imf.org/en/publications/weo/issues/2026/07/08/world-economic-outlook-update-july-2026',
  worldGrowthVintage: 'IMF July 2026 update, published 8 July 2026; PPP-weighted 2026 world forecast 3.0%',
  inflationSource: 'https://indicators.cb.is/monetary-policy/inflation-target/',
  limitation: 'Repeating one-year forecast numbers is an explicit teaching assumption. World GDP is a demand proxy with unit elasticity, not measured growth in Icelandic exports. Population growth and unchanged age shares are assumed; this is not a cohort or migration forecast. Foreign interest is an income yield, not an equity-price return.',
} as const;

const union = (...sets: (readonly string[] | undefined)[]) => [...new Set(sets.flatMap((s) => s ?? []))];
export const growthAnchor = (id: string) => `growthAnchor.${id}`;

/** Respect replacement chains when composing growth with another mechanism. */
export function effectiveRules(model: ModelDef): RuleDef[] {
  const rules = model.modules.flatMap((m) => m.rules ?? []);
  const replaced = new Set(rules.flatMap((r) => r.replaces ? [r.replaces] : []));
  return rules.filter((r) => !replaced.has(r.id));
}

const referenceIndex = (id: string, label: string, param: string): RuleDef => ({
  id, target: id, category: 'BEHAVIOUR', params: [param],
  compute: (c) => Math.exp(Math.log1p(c.p(param)) * (c.t + c.dt)),
  explain: { what: label, rule: 'The explicit assumed annual trend compounds with elapsed simulation time. It changes normal targets in equations; actual output still follows demand.' },
});

/** Dynamic normal levels. A user's additive level shift stays in baseline-GDP units. */
function normalFactor(id: string, target: string): string | undefined {
  if (/^(N(?:FC|FR|XF|XA|XT|XO)0|Ntot0|Ng0[YWO]|U0[YWO]|emp0[YWO]|pop[YWO])$/.test(id)) return 'growthPopulationIndex';
  if (['gHealth', 'gEdu', 'gOther'].includes(id)) {
    return target === 'publicEmployment' || /_(HY|HW|HO|PF)$/.test(target)
      ? 'growthPopulationIndex' : 'growthRealIndex';
  }
  if (/^(i(?:FC|FR|XF|XA|XT|XO)0|pi(?:FC|FR|XF|XA|XT|XO)0|c0[YWO]|LW0[YWO]|gva(?:FC|XF|XA|XT|XO)|vaFR0)$/.test(id)
      || ['gInv', 'trOA', 'trFam', 'ydH0', 'Y0', 'krona0', 'bondW'].includes(id)) return 'growthRealIndex';
  if (['xFish', 'xAlu'].includes(id)) return 'growthRealIndex';
  if (['xTour', 'xOther'].includes(id)) return 'growthWorldDemandIndex';
  if (['worldPrice0', 'fishPrice0', 'aluminiumPrice0'].includes(id)) return 'growthPriceIndex';
  return undefined;
}

/** Known-trend carry removes the spurious wedge of smoothing a growing level. */
function carryRate(target: string, c: Ctx): number {
  if (['domesticPrice', 'importPrice', 'labourCostSeen', 'importCostSeen', 'housingCost'].includes(target)) return Math.log1p(c.p('growthInflation'));
  if (/^employment(?:FC|FR|XF|XA|XT|XO)$/.test(target)) return Math.log1p(c.p('growthPopulation'));
  if (/^(investment(?:Plan)?(?:FC|FR|XF|XA|XT|XO)|profits(?:FC|FR|XF|XA|XT|XO)Smoothed)$/.test(target)) return Math.log1p(c.p('growthReal'));
  if (/^consumption[YWO]$/.test(target)) return Math.log1p(c.p('growthReal')) + Math.log1p(c.p('growthInflation'));
  return 0;
}
const carried = (target: string) => ['domesticPrice', 'importPrice', 'labourCostSeen', 'importCostSeen', 'housingCost'].includes(target)
  || /^(employment(?:FC|FR|XF|XA|XT|XO)|investment(?:Plan)?(?:FC|FR|XF|XA|XT|XO)|profits(?:FC|FR|XF|XA|XT|XO)Smoothed|consumption[YWO])$/.test(target);

export function createGrowthModule(source: ModelDef, assumptions: GrowthAssumptions): ModuleDef {
  const originalParams = new Map(source.modules.flatMap((m) => m.params ?? []).map((p) => [p.id, p]));
  const allRules = effectiveRules(source);
  const evolving = assumptions.realGrowth !== 0 || assumptions.populationGrowth !== 0 || assumptions.worldGrowth !== 0 || assumptions.inflation !== 0;
  const anchors = new Set<string>();
  const replacements: RuleDef[] = [];
  for (const r of allRules) {
    const scaled = (r.params ?? []).flatMap((id) => normalFactor(id, r.target) ? [id] : []);
    const capacity = r.params?.includes('potentialOutput');
    const productivity = r.target === 'labourCostSeen' || r.target === 'wageGapSeen' || /^employment(?:FC|FR|XF|XA|XT|XO)$/.test(r.target);
    const investment = /^investmentPlan(?:FC|FR|XF|XA|XT|XO)$/.test(r.target);
    const wageGrowth = r.target === 'wageGrowth';
    const carry = !!r.adjust && carried(r.target);
    const exportSector = ({ exportVolumeFish: 'XF', exportVolumeAluminium: 'XA', exportVolumeTourism: 'XT', exportVolumeOther: 'XO' } as Record<string, string>)[r.target];
    const portfolio = r.target === 'portfolioGap';
    if (!evolving || (!scaled.length && !capacity && !productivity && !investment && !wageGrowth && !carry && !exportSector && !portfolio)) continue;
    for (const p of scaled) anchors.add(p);
    const factorInputs = scaled.map((p) => normalFactor(p, r.target)!);
    const inputs = union(r.inputs, factorInputs, capacity ? ['productiveCapacity'] : [], productivity ? ['growthProductivityIndex'] : [], exportSector ? [`productiveCapitalReal${exportSector}`, 'growthRealIndex'] : [], portfolio ? ['growthRealIndex'] : []);
    const params = union(r.params, scaled.map(growthAnchor), carry || wageGrowth || investment ? ['growthReal', 'growthPopulation', 'growthInflation'] : [],
      carry && typeof r.adjust!.speed === 'string' ? [r.adjust!.speed] : [], investment ? ['growthCapitalExpansion', growthAnchor(`i${r.target.slice(-2)}0`), 'depreciationRate'] : [], exportSector ? ['growthExportHeadroom', 'growthCapitalElasticity'] : [], portfolio ? ['growthReal', 'growthInflation'] : []);
    const wrap = (c: Ctx): Ctx => ({
      ...c,
      p: (id) => {
        if (id === 'potentialOutput' && capacity) return c.v('productiveCapacity');
        if (portfolio && (id === 'pbStock' || id === 'pbFlow')) return c.p(id) / c.v('growthRealIndex');
        const factor = scaled.includes(id) ? normalFactor(id, r.target) : undefined;
        return c.p(id) + (factor ? c.p(growthAnchor(id)) * (c.v(factor) - 1) : 0);
      },
      v: (id) => id === 'wage' && productivity ? c.v(id) / c.v('growthProductivityIndex') : c.v(id),
      lag: (id, k) => id === 'wage' && productivity ? c.lag(id, k) / Math.exp(Math.log(c.v('growthProductivityIndex')) -
        (Math.log1p(c.p('growthReal')) - Math.log1p(c.p('growthPopulation'))) * (k ?? 1) * c.dt) : c.lag(id, k),
    });
    if (productivity) params.push(...union(['growthReal', 'growthPopulation']).filter((p) => !params.includes(p)));
    let terms = r.terms?.map((term) => ({ ...term, compute: (c: Ctx) => term.compute(wrap(c)) }));
    const extra = [] as NonNullable<RuleDef['terms']>;
    if (wageGrowth) extra.push({ id: 'productivityTrend', label: 'Assumed labour-productivity growth', compute: (c) => Math.log1p(c.p('growthReal')) - Math.log1p(c.p('growthPopulation')) });
    if (portfolio) extra.push({ id: 'normalGrowingFlow', label: 'Normal nominal expansion of the reference króna portfolio', concept: 'floating-exchange-rate', compute: (c) =>
      -c.p('pbFlow') * c.p(growthAnchor('krona0')) * (Math.log1p(c.p('growthReal')) + Math.log1p(c.p('growthInflation'))) });
    if (investment) {
      const i0 = `i${r.target.slice(-2)}0`;
      anchors.add(i0);
      inputs.push(...union(['growthRealIndex']).filter((id) => !inputs.includes(id)));
      extra.push({ id: 'capacityExpansion', label: 'Investment for the assumed expanding productive-capital path', concept: 'investment-accelerator',
        compute: (c) => c.p('growthCapitalExpansion') * Math.log1p(c.p('growthReal')) * c.p(growthAnchor(i0)) / c.p('depreciationRate') * c.v('growthRealIndex') });
    }
    if (carry) extra.push({ id: 'trendCarry', label: 'Carry the known trend while adjusting deviations', concept: 'gradual-adjustment', compute: (c) => {
      const speed = typeof r.adjust!.speed === 'string' ? c.p(r.adjust!.speed) : r.adjust!.speed;
      const k = r.adjust!.form === 'exponential' ? 1 - Math.exp(-speed * c.dt) : speed * c.dt;
      return k > 0 ? (1 - k) / k * c.lag(r.target) * Math.expm1(carryRate(r.target, c) * c.dt) : 0;
    } });
    if (exportSector) {
      const x0 = (r.params ?? []).find((id) => ['xFish', 'xAlu', 'xTour', 'xOther'].includes(id))!;
      extra.push({ id: 'availableCapacity', label: 'Export capacity supplied by actual productive investment', concept: 'capacity-utilisation', compute: (c) =>
        c.p('growthExportHeadroom') * c.p(growthAnchor(x0)) * c.v('growthRealIndex') * Math.pow(Math.min(1, Math.max(1e-12,
          c.v(`productiveCapitalReal${exportSector}`) / (c.base(`productiveCapitalReal${exportSector}`) * c.v('growthRealIndex')))), c.p('growthCapitalElasticity')) });
    }
    // Compute-only rules need no additive decomposition unless we introduce a carry term.
    if (!terms && extra.length) terms = [{ id: 'existingTarget', label: 'Existing behavioural target', compute: (c) => r.compute!(wrap(c)) }];
    const originalTermIds = new Set(r.terms?.map((t) => t.id) ?? ['existingTarget']);
    const originalTerms = (t: Record<string, number>) => Object.fromEntries(Object.entries(t).filter(([id]) => originalTermIds.has(id)));
    const combined = terms ? (t: Record<string, number>, c: Ctx) => {
      const old = originalTerms(t);
      // Consumption's existing cash ceiling must also constrain the trend carry.
      if (/^consumption[YWO]$/.test(r.target)) old.trendCarry = t.trendCarry ?? 0;
      let value = r.combine ? r.combine(old, wrap(c)) : Object.values(old).reduce((s, x) => s + x, 0);
      value += (t.productivityTrend ?? 0) + (t.capacityExpansion ?? 0) + (t.normalGrowingFlow ?? 0);
      if (investment) value = Math.max(0, value);
      if (exportSector) value = Math.min(value, t.availableCapacity);
      return value + (/^consumption[YWO]$/.test(r.target) ? 0 : t.trendCarry ?? 0);
    } : undefined;
    replacements.push({ ...r, id: `growth.${r.id}`, replaces: r.id, inputs, params,
      ...(exportSector ? { owners: [exportSector] } : {}),
      lagInputs: union(r.lagInputs, carry ? [r.target] : []),
      ...(terms ? { terms: [...terms, ...extra], compute: undefined, combine: combined } : { compute: (c: Ctx) => r.compute!(wrap(c)) }),
      regime: (c, value, t) => {
        const old = originalTerms(t);
        if (/^consumption[YWO]$/.test(r.target)) old.trendCarry = t.trendCarry ?? 0;
        const oldRegime = r.regime?.(wrap(c), value, old);
        if (oldRegime) return oldRegime;
        if (exportSector && value >= t.availableCapacity - 1e-10) return 'Export orders limited by productive capacity';
        return investment && value <= 0 ? 'No new investment: capital only wears out' : null;
      },
      explain: { what: r.explain.what, rule: `${r.explain.rule} In this evolving variant, named normal levels follow the declared population, productivity, demand or price trend. Additive user level shifts retain their baseline-GDP units.${capacity ? ' Capacity is now linked to accumulated real investment and physical depreciation, with the declared labour and productivity path.' : ''}${productivity ? ' Wage costs are measured per unit of trend productivity.' : ''}${investment ? ' The separately shown expansion term finances additional productive capital through the existing purchase postings.' : ''}${carry ? ' The trend-carry term lets adjustment close deviations without treating the known growing level as a permanent surprise.' : ''}${exportSector ? ' Orders cannot exceed the declared export headroom times the growing labour/productivity capacity, reduced when actual sector capital falls short. Faster world demand therefore does not create unlimited Icelandic production capacity.' : ''}${portfolio ? ' Portfolio sensitivity is per unit of the growing normal real economy, so a larger economy does not mechanically amplify the same proportional imbalance. The flow term subtracts the ordinary expansion needed for a portfolio growing with the declared real and price trends; no actual position is rescaled.' : ''}` },
    });
  }
  const params: ParamDef[] = [
    { id: 'growthReal', value: assumptions.realGrowth, unit: 'fraction/yr', category: 'BEHAVIOUR', description: 'Persistent assumed normal real-demand growth; actual GDP is endogenous.', provenance: { basis: 'assumed', source: GROWTH_PROFILE.realGrowthSource, vintage: GROWTH_PROFILE.realGrowthVintage, note: 'Default inspired by a one-year forecast; repeating it indefinitely is an assumption, not a forecast.' } },
    { id: 'growthPopulation', value: assumptions.populationGrowth, unit: 'fraction/yr', category: 'BEHAVIOUR', description: 'Assumed population and normal labour-force growth; fixed age shares.', provenance: { basis: 'assumed', note: '0.5% annual teaching assumption, not a demographic forecast or observed migration rate.' } },
    { id: 'growthWorld', value: assumptions.worldGrowth, unit: 'fraction/yr', category: 'BEHAVIOUR', description: 'Persistent foreign-demand proxy for tourism and other exports, with assumed unit elasticity.', provenance: { basis: 'assumed', source: GROWTH_PROFILE.worldGrowthSource, vintage: GROWTH_PROFILE.worldGrowthVintage, note: 'PPP world-GDP forecast repeated as a teaching demand proxy, not an Iceland export forecast.' } },
    { id: 'growthInflation', value: assumptions.inflation, unit: 'fraction/yr', category: 'BEHAVIOUR', description: 'Assumed common price trend and variant inflation target; actual CPI still follows its price equations.', provenance: { basis: 'assumed', source: GROWTH_PROFILE.inflationSource, note: 'Default 2.5% is inspired by the CBI target, not September actual CPI growth (5.9%). Foreign prices sharing this trend is a further teaching assumption.' } },
    { id: 'growthCapitalElasticity', value: assumptions.capitalElasticity, unit: 'fraction', category: 'BEHAVIOUR', description: 'Sensitivity of productive capacity to capital shortfall relative to its growing reference.', provenance: { basis: 'assumed', note: 'Stylised 0.35 exponent; not an estimated Iceland production-function coefficient.' } },
    { id: 'growthCapitalExpansion', value: 1, unit: 'fraction', category: 'BEHAVIOUR', description: 'Share of additional capital needed for the declared real-growth path included in normal investment plans.', provenance: { basis: 'assumed', note: 'Full financing request (1). Actual investment still responds to profits, rates, debt and funding constraints.' } },
    { id: 'growthExportHeadroom', value: 1.1, unit: 'ratio', category: 'BEHAVIOUR', description: 'Export volume capacity relative to normal sector volume, before productive-capital shortages.', provenance: { basis: 'assumed', note: '10% spare capacity is a teaching assumption, not measured Iceland export capacity. It prevents unlimited exports when world demand compounds faster than domestic supply.' } },
    ...[...anchors].map((id): ParamDef => ({ id: growthAnchor(id), value: originalParams.get(id)!.value, unit: originalParams.get(id)!.unit, category: 'IDENTITY', description: `Opening solved normal level of ${id}, retained separately so additive lever shifts are not compounded.`, provenance: { basis: 'derived', note: `Mapped from the original stationary solve (${id}); preserves its calibration and provenance.` } })),
  ];
  return {
    id: 'growth', label: 'Growing reference and productive capacity', description: GROWTH_PROFILE.description,
    requires: ['firms', 'labour-and-wages', 'government', 'external', 'prices'], params,
    vars: [
      ...['growthRealIndex', 'growthPopulationIndex', 'growthProductivityIndex', 'growthWorldDemandIndex', 'growthPriceIndex'].map((id) => ({ id, label: id.replace('growth', 'Reference '), unit: 'index', kind: 'index' as const, scale: 'none' as const, initial: 1 })),
      ...AGES.map((g) => ({ id: `referencePopulation${g}`, label: `Reference population, ${g}`, unit: 'thousand persons', kind: 'quantity' as const, scale: 'none' as const, initial: originalParams.get(`pop${g}`)!.value, description: 'Assumed population path with fixed age shares; net-immigration lever changes are separate.' })),
      { id: 'referenceCapacity', label: 'Reference productive capacity', unit: '% of baseline GDP/yr', kind: 'quantity', scale: 'real', initial: originalParams.get('potentialOutput')!.value },
      ...FIRMS.map((j) => ({ id: `productiveCapitalReal${j}`, label: `Productive-capital quantity, ${j}`, unit: '% of baseline GDP', kind: 'state' as const, scale: 'real' as const, initial: originalParams.get(`i${j}0`)!.value / originalParams.get('depreciationRate')!.value, description: 'Stylised physical-capital quantity accumulated from actual real investment, minus physical wear. Opening at-cost capital is normalised at price 1; this is not the nominal book-value ledger stock.' })),
      { id: 'productiveCapitalReal', label: 'Productive-capital quantity, all firms', unit: '% of baseline GDP', kind: 'quantity', scale: 'real' },
      { id: 'productiveCapacity', label: 'Productive capacity', unit: '% of baseline GDP/yr', kind: 'quantity', scale: 'real', initial: originalParams.get('potentialOutput')!.value },
    ],
    indicators: [
      ['referenceWorldDemand', 'World-demand reference', 'growthWorldDemandIndex', 'Declared growing demand proxy, initial = 100. This is an assumed demand path inspired by a dated world-GDP forecast, not a model of global production or a measure of Icelandic export growth.'],
      ['referencePopulation', 'Population reference', 'growthPopulationIndex', 'Declared population path, initial = 100, with fixed age shares. The existing net-immigration lever is additional; births, deaths and cohort ageing are not modelled here.'],
      ['actualProductiveCapacity', 'Available productive capacity', 'productiveCapacity', 'Available productive capacity relative to its opening level (100), linked to actual real investment, physical wear, and the assumed labour/productivity path. It is a stylised supply constraint, not observed potential GDP.'],
      ['fundedPhysicalCapital', 'Installed productive-capital quantity', 'productiveCapitalReal', 'Physical-capital quantity relative to its opening level (100). Actual real investment is installed after one kernel step and capital wears out. This is separate from capital recorded at historical nominal cost; the financial extension can constrain investment through funding approvals.'],
    ].map(([id, label, driver, description]): IndicatorDef => ({
      id, label, group: 'Growth and capacity', unit: 'index (opening = 100)', display: 'level',
      compute: (c) => 100 * c.v(driver) / c.base(driver),
      level: { kind: 'index', unit: 'index (opening = 100)', nominal: (c) => 100 * c.v(driver) / c.base(driver), real: (c) => 100 * c.v(driver) / c.base(driver), description: 'Quantity index; both price bases show the same physical or reference quantity.', realDescription: 'Quantity index; both price bases show the same physical or reference quantity.' },
      drivers: [driver], description,
    })),
    rules: [
      referenceIndex('growthRealIndex', 'Normal domestic real-quantity path', 'growthReal'),
      referenceIndex('growthPopulationIndex', 'Normal population and labour-force path', 'growthPopulation'),
      referenceIndex('growthWorldDemandIndex', 'Foreign-demand proxy path', 'growthWorld'),
      referenceIndex('growthPriceIndex', 'Assumed common price-trend path', 'growthInflation'),
      { id: 'growthProductivityIndex', target: 'growthProductivityIndex', category: 'BEHAVIOUR', inputs: ['growthRealIndex', 'growthPopulationIndex'], compute: (c) => c.v('growthRealIndex') / c.v('growthPopulationIndex'), explain: { what: 'Assumed output per worker trend.', rule: 'Normal real quantities ÷ normal labour force. This derived trend is an explicit teaching assumption; productivity is not an observed GDP residual or a shock-driven endogenous innovation process.' } },
      ...AGES.map((g): RuleDef => ({ id: `referencePopulation${g}`, target: `referencePopulation${g}`, category: 'BEHAVIOUR', params: [`pop${g}`], inputs: ['growthPopulationIndex'], compute: (c) => c.p(`pop${g}`) * c.v('growthPopulationIndex'), explain: { what: 'Population on the assumed path, in thousands.', rule: 'Opening age-group population × the declared population trend. Age shares stay fixed; births, deaths and cohort ageing are not separately modelled.' } })),
      { id: 'referenceCapacity', target: 'referenceCapacity', category: 'BEHAVIOUR', inputs: ['growthRealIndex'], params: ['potentialOutput'], compute: (c) => c.p('potentialOutput') * c.v('growthRealIndex'), explain: { what: 'Productive capacity aimed for by the declared labour/productivity path.', rule: 'Opening capacity × the normal real-quantity index. Actual capacity also depends on whether investment supplies the required productive capital.' } },
      ...FIRMS.map((j): RuleDef => ({ id: `productiveCapitalReal${j}`, target: `productiveCapitalReal${j}`, category: 'IDENTITY', lagInputs: [`productiveCapitalReal${j}`, `investment${j}`], params: ['depreciationRate'], terms: [
        { id: 'previous', label: 'Previous physical-capital quantity', month: 'first', compute: (c) => c.lag(`productiveCapitalReal${j}`) },
        { id: 'installed', label: 'Last step’s actual real investment installed', month: 'sum', compute: (c) => c.dt * c.lag(`investment${j}`) },
        { id: 'wear', label: 'Physical wear', month: 'sum', compute: (c) => -c.dt * c.p('depreciationRate') * c.lag(`productiveCapitalReal${j}`) },
      ], explain: { what: 'Productive-capital quantity, distinct from the at-cost money ledger.', rule: 'Previous quantity + actual real investment installed after one kernel step − proportional physical wear. Only funded actual investment supplies new capacity; depreciation and purchase postings continue to determine the separate nominal ledger stock.' } })),
      { id: 'productiveCapitalReal', target: 'productiveCapitalReal', category: 'IDENTITY', inputs: FIRMS.map((j) => `productiveCapitalReal${j}`), terms: FIRMS.map((j) => ({ id: j, label: j, compute: (c: Ctx) => c.v(`productiveCapitalReal${j}`) })), explain: { what: 'Total productive-capital quantity.', rule: 'Sum over the six firm sectors, excluding housing and unmodelled public capital.' } },
      { id: 'productiveCapacity', target: 'productiveCapacity', category: 'BEHAVIOUR', owners: [], inputs: ['referenceCapacity', 'productiveCapitalReal', 'growthRealIndex'], params: ['growthCapitalElasticity'], terms: [
        { id: 'labourProductivity', label: 'Declared labour and productivity capacity', compute: (c) => c.v('referenceCapacity') },
        { id: 'capitalAdequacy', label: 'Capital supplied relative to the required growing quantity', compute: (c) => c.v('productiveCapitalReal') / (c.base('productiveCapitalReal') * c.v('growthRealIndex')) },
      ], combine: (t, c) => t.labourProductivity * Math.pow(Math.min(1, Math.max(1e-12, t.capitalAdequacy)), c.p('growthCapitalElasticity')),
      regime: (_c, _v, t) => t.capitalAdequacy < 1 - 1e-8 ? 'Capital shortfall limits productive capacity' : 'Labour and productivity path limits productive capacity',
      explain: { what: 'Capacity available to firms’ pricing and investment rules.', rule: 'Labour/productivity capacity × min(1, actual capital ÷ required capital) raised to the assumed capital exponent. Insufficient investment reduces capacity; surplus capital cannot exceed the declared labour/productivity ceiling. This is a stylised supply constraint, not a production accounting identity.' } },
      ...replacements,
    ],
  };
}
