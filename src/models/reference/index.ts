/**
 * Reference economy: a small closed economy that shows the flow paradigm at work.
 *
 * Five players (households, firms, a bank, the central bank and the government), six
 * instruments and about forty variables. The baseline is a steady state with zero growth and
 * zero inflation, solved by the kernel. This is the model the authoring guide walks through.
 */
import type { ModelDef } from '../../core/types.ts';
import { structure } from './structure.ts';
import { labourPrices } from './labour-prices.ts';
import { demand } from './demand.ts';
import { banking } from './banking.ts';
import { centralBank } from './central-bank.ts';
import { government } from './government.ts';
import { indicators } from './indicators.ts';
import { calibration } from './calibration.ts';

export const referenceModel: ModelDef = {
  id: 'reference',
  label: 'Reference economy',
  description: 'A small closed economy with households, firms, a bank, a central bank and a government, for learning the flow paradigm.',
  modules: [structure, labourPrices, demand, banking, centralBank, government, indicators],
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
    // Two parameters are solved so that two targets hold. Everything else (every stock and
    // every variable with a past) is solved from "nothing changes from one month to the next".
    free: ['govSpendingReal', 'normalTaxRate'],
    targets: [
      { id: 'gdp-is-100', describe: 'Nominal GDP is 100: the unit of the model', residual: (c) => c.v('gdp') - 100 },
      { id: 'debt-is-55', describe: 'Government debt is 55% of GDP', residual: (c) => c.stock('bonds', 'G') - 55 },
    ],
    // Starting guesses; the solver finds the exact values. Liabilities are positive too.
    initialStocks: [
      ['deposits', 'HH', 83],
      ['deposits', 'F', 12],
      ['reserves', 'B', 9.5],
      ['treasuryAccount', 'G', 2],
      ['loans', 'B', 48],
      ['bonds', 'B', 43],
      ['bonds', 'CB', 12],
      ['capital', 'F', 250],
    ],
    initialVars: { consumption: 69, disposableIncome: 69, firmProfit: 16 },
  },
  calibration,
  // Scenarios written before padlocks (format 1): the global setting was Automatic by default here;
  // on Manual the key rate and the tax shift were held levels, on Automatic the key-rate offset and
  // the tax lever tilted the rules (decision 0010). Switching to Automatic after a hold jumped onto
  // the rules' shadow paths; unlocking now steps from the held values, so such a run differs from
  // the switch on.
  legacyStabiliserMode: {
    lever: 'stabilisers',
    manual: 0,
    automatic: 1,
    default: 1,
    held: { keyRateFixed: 'keyRate', taxRate: 'taxRate' },
    offsets: ['keyRateAddon', 'taxRate'],
    takeoverChanged: true,
  },
};
