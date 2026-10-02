/** The application's growing teaching profile with executable borrower financing constraints. */
import { createEngine, type EngineOptions, type KernelEngine } from '../../core/engine.ts';
import type { ModelDef } from '../../core/types.ts';
import { createGrowingIcelandModel, initialBaselineForGrowingModel, type GrowingIcelandOptions } from './growth.ts';
import { withFinancialFragility } from './modules/financial-fragility.ts';

export function createGrowingFinancialModel(options: GrowingIcelandOptions = {}): ModelDef {
  return {
    ...createGrowingIcelandModel({ ...options, id: options.id ?? 'iceland-growing', modelTransform: (model) => withFinancialFragility(options.modelTransform?.(model) ?? model) }),
    label: 'Iceland Inc. · growth and financial stress',
    description: 'Households by age, six firm sectors, banks, pensions, government and the foreign economy with a complete money-flow ledger. The evolving no-change economy follows explicit domestic demand, foreign demand, population and price assumptions. Borrowers refinance gross maturities; funding limits spending, and unpaid obligations can reduce bank capital. Opening portfolios come from the calibrated 2025 teaching economy; today’s observed rates and holdings are shown separately in Baseline & current data.',
  };
}

export const growingFinancialModel = createGrowingFinancialModel();

export function createGrowingFinancialEngine(options: GrowingIcelandOptions = {}, engineOptions: EngineOptions = {}): KernelEngine {
  const model = createGrowingFinancialModel(options);
  return createEngine(model, { ...engineOptions, baseline: engineOptions.baseline ?? initialBaselineForGrowingModel(model, engineOptions) });
}
