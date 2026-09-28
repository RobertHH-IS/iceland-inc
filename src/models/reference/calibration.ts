/**
 * Reference economy: calibration checks. These are CHECKS on whole-model responses, never
 * equations. The ranges are wide on purpose: a teaching model only has to get signs and rough
 * sizes right.
 */
import type { CalibrationCheck } from '../../core/types.ts';

const SOURCE = 'teaching model: qualitative sign/size check';
const peak = (xs: number[]) => Math.max(...xs);
const trough = (xs: number[]) => Math.min(...xs);

export const calibration: CalibrationCheck[] = [
  {
    id: 'rate-hike-output',
    label: 'Key rate +1 pp for 2 years: output trough, % vs baseline',
    scenario: [
      { t: 0, lever: 'keyRateAddon', value: 1 },
      { t: 24, lever: 'keyRateAddon', value: 0 },
    ],
    months: 60,
    measure: (run) => trough(run.series('output')),
    range: [-3, -0.05],
    source: SOURCE,
  },
  {
    id: 'spending-multiplier',
    label: 'Government spending +1% of GDP: output peak, % vs baseline',
    scenario: [{ t: 0, lever: 'govSpending', value: 1 }],
    months: 60,
    measure: (run) => peak(run.series('output')),
    range: [0.3, 3],
    source: SOURCE,
  },
  {
    id: 'wage-settlement-inflation',
    label: 'Wage settlement +10%: 12-month inflation peak, pp vs baseline',
    scenario: [{ t: 0, lever: 'wageSettlement', value: 10, fire: true }],
    months: 48,
    measure: (run) => peak(run.series('inflation')),
    range: [2, 15],
    source: SOURCE,
  },
];
