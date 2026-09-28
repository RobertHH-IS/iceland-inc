/**
 * Iceland Inc.: a stylised Icelandic economy as money flowing between ten balance sheets.
 *
 * Ported from engine v1 (legacy/v1-engine): three household age groups, domestic firms and
 * exporters, the banks, the central bank, the government, the pension funds and the rest of the
 * world. The baseline is a steady state with zero growth and zero inflation, computed in closed
 * form from Icelandic data (steady.ts) and polished by the kernel's Newton solver. It is a
 * teaching model that shows mechanisms, not a forecast.
 */
import type { ModelDef } from '../../core/types.ts';
import { structure } from './modules/structure.ts';
import { labourAndWages } from './modules/labour-and-wages.ts';
import { prices } from './modules/prices.ts';
import { households } from './modules/households.ts';
import { mortgages } from './modules/mortgages.ts';
import { firms } from './modules/firms.ts';
import { banks } from './modules/banks.ts';
import { centralBank } from './modules/central-bank.ts';
import { government } from './modules/government.ts';
import { pensions } from './modules/pensions.ts';
import { external } from './modules/external.ts';
import { housing } from './modules/housing.ts';
import { indicators } from './modules/indicators.ts';
import { feed } from './modules/feed.ts';
import { bindCalibrationModel, calibration } from './calibration.ts';
import { steadyState, type IcelandSteadyState } from './steady.ts';

/** Data targets of the last closed-form solve: a model variant keeps its own targets. */
let T: IcelandSteadyState['targets'] | null = null;
const target = (k: keyof IcelandSteadyState['targets']) => {
  if (!T) throw new Error('Iceland steady state: targets read before the closed-form solve ran');
  return T[k];
};

export const icelandModel: ModelDef = {
  id: 'iceland',
  label: 'Iceland Inc.',
  description:
    'A stylised Icelandic economy: households by age, domestic firms and exporters, banks, the central bank, the government, pension funds and the rest of the world, with money created and destroyed by who pays whom. Calibrated to 2025 data; a steady-state teaching model, not a forecast.',
  // Module order sets the order of rules inside the simultaneous income–spending block, which
  // Gauss–Seidel sweeps in declaration order: households first, then output and jobs, then taxes.
  modules: [structure, centralBank, banks, prices, housing, mortgages, households, external, firms, labourAndWages, government, pensions, indicators, feed],
  paymentSystem: {
    bank: 'B',
    centralBank: 'CB',
    treasury: 'G',
    deposits: 'deposits',
    reserves: 'reserves',
    treasuryAccount: 'treasuryAccount',
  },
  dt: 1 / 12,
  steadyState: {
    // Each balancing parameter of v1's steady state is paired with the data it balances: every
    // sector's net lending is zero at the data stock. The closed form (steady.ts) gets them
    // exactly; Newton polishing keeps them there for any variant of the parameters.
    free: ['tau0', 'c0Y', 'c0W', 'c0O', 'muD', 'rhoFD0', 'rhoFX0', 'payout', 'ageing', 'mRY', 'mRW'],
    targets: [
      { id: 'government-debt', describe: 'Government debt is 56.7% of GDP (data) with a balanced budget: sets the income-tax rate tau0', residual: (c) => c.stock('govBonds', 'G') + c.stock('indexedBonds', 'G') - target('govDebt') },
      { id: 'deposits-young', describe: 'Young households’ deposits at the data level, with zero saving: sets c0Y', residual: (c) => c.stock('deposits', 'HY') - target('depHY') },
      { id: 'deposits-working', describe: 'Working-age households’ deposits at the data level: sets c0W', residual: (c) => c.stock('deposits', 'HW') - target('depHW') },
      { id: 'deposits-older', describe: 'Older households’ deposits at the data level: sets c0O', residual: (c) => c.stock('deposits', 'HO') - target('depHO') },
      { id: 'nonresident-deposits', describe: 'Non-residents’ króna deposits steady at 3% of GDP, so the current account balances: sets the input-import share muD', residual: (c) => c.stock('deposits', 'W') - target('depW') },
      { id: 'loans-domestic-firms', describe: 'Domestic firms’ bank debt steady at its level: retained profit pays for investment (rhoFD0)', residual: (c) => c.stock('businessLoans', 'FD') - target('loanFD') },
      { id: 'loans-exporters', describe: 'Exporters’ bank debt steady: sets rhoFX0', residual: (c) => c.stock('businessLoans', 'FX') - target('loanFX') },
      { id: 'rights-pensioners', describe: 'Pensioners’ rights steady: payouts = contributions + fund income (payout rate)', residual: (c) => c.stock('pensionRights', 'HO') - target('rightsHO') },
      { id: 'rights-working', describe: 'Working-age rights steady: retirement moves them on as fast as they build up (ageing rate)', residual: (c) => c.stock('pensionRights', 'HW') - target('rightsHW') },
      { id: 'mortgages-young', describe: 'Young households’ mortgage debt at the data level (22.5% of household mortgages): desired debt ratio mRY', residual: (c) => c.stock('mortgagesN', 'HY') + c.stock('mortgagesI', 'HY') - target('mortY') },
      { id: 'mortgages-working', describe: 'Working-age mortgage debt at the data level: desired debt ratio mRW', residual: (c) => c.stock('mortgagesN', 'HW') + c.stock('mortgagesI', 'HW') - target('mortW') },
    ],
    initialStocks: [],
    solve: (params) => {
      const s = steadyState(params);
      T = s.targets;
      return { stocks: s.stocks, vars: s.vars, params: s.params };
    },
  },
  calibration,
};

bindCalibrationModel(icelandModel);
