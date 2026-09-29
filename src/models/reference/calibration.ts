/**
 * Reference economy: calibration checks. These are CHECKS on whole-model responses, never
 * equations. The ranges are wide on purpose: a teaching model only has to get signs and rough
 * sizes right.
 */
import type { CalibrationCheck } from '../../core/types.ts';

const SOURCE = 'teaching model: qualitative sign/size check';
const peak = (xs: number[]) => Math.max(...xs);
const trough = (xs: number[]) => Math.min(...xs);
/** Mean of months from..to (the series starts at month 0). */
const mean = (xs: number[], from: number, to: number) => xs.slice(from, to + 1).reduce((s, x) => s + x, 0) / (to - from + 1);
/** Manual: the policy rules only suggest, so nothing offsets the shock (decision 0004). */
const MANUAL = { t: 0, lever: 'stabilisers', value: 0 };

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
  // With no policy reaction (review REF-manual-rate-sensitivity): before these checks a key rate
  // held 1 point higher for two years cost 3.9% of output, and the tax and spending multipliers
  // were about 3 within two years.
  {
    id: 'manual-rate-hike-output',
    label: 'Manual: key rate held at 4% (+1 pp) for 2 years: output trough, % vs baseline',
    scenario: [MANUAL, { t: 0, lever: 'keyRateFixed', value: 4 }, { t: 24, lever: 'keyRateFixed', value: 3 }],
    months: 60,
    measure: (run) => trough(run.series('output')),
    range: [-2, -0.3],
    source:
      'Christiano, Eichenbaum & Evans (1999) and Ramey (2016): a 1 pp policy-rate shock lowers output about 0.5–1.5% at its peak; a rate held for two years while inflation falls, so that the real rate keeps rising, may cost somewhat more',
  },
  {
    id: 'manual-spending-multiplier',
    label: 'Manual: government spending +1% of GDP: output, year-1 average, % vs baseline',
    scenario: [MANUAL, { t: 0, lever: 'govSpending', value: 1 }],
    months: 24,
    measure: (run) => mean(run.series('output'), 1, 12),
    range: [0.5, 2.5],
    source: 'Ramey (2016); Ramey & Zubairy (2018): government-purchase multipliers of about 0.6–1.5, up to about 2 when monetary policy does not react',
  },
  {
    id: 'manual-tax-output',
    label: 'Manual: income tax +1 pp: output, year-2 average, % vs baseline',
    scenario: [MANUAL, { t: 0, lever: 'taxRate', value: 1 }],
    months: 24,
    measure: (run) => mean(run.series('output'), 13, 24),
    range: [-2, -0.3],
    source: 'Ramey (2016): tax multipliers of about 1–3 at their peak; +1 pp of income tax raises revenue about 0.9% of GDP here',
  },
];
