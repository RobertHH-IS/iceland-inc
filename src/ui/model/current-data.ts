/** Dated observations for comparison with the simulation, with their original scopes. */
import raw from '../../../data/iceland/observations-2026-09-30.json' with { type: 'json' };
import type { EngineClient } from '../engine-client.ts';
import { fmtReport, reportLabel, reportUnit } from './charts.ts';

export interface EconomicObservation {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  observationPeriod: string;
  publishedDate: string | null;
  sourceUrl: string;
  sourceLabel: string;
  status: 'observed' | 'derived' | 'forecast' | 'estimate' | 'statutory' | 'unverified' | 'gap' | 'source-disagreement';
  originalStatus?: string;
  group: string;
  notes: string;
}
export interface StartingDataMapping {
  indicatorId: string;
  observationIds: string[];
  comparability: 'reference' | 'proxy' | 'gap';
  qualification: string;
}
interface ObservationSnapshot {
  asOf: string;
  records: EconomicObservation[];
  indicatorMappings: StartingDataMapping[];
}

// The generation script validates the schema, dates, source ownership and exhaustive mappings.
export const CURRENT_DATA = raw as ObservationSnapshot;
export const OBSERVATION_BY_ID = new Map(CURRENT_DATA.records.map((record) => [record.id, record]));
const MAPPING_BY_ID = new Map(CURRENT_DATA.indicatorMappings.map((mapping) => [mapping.indicatorId, mapping]));

export const OBSERVATION_STATUS = {
  observed: 'Observed', derived: 'Calculated from observations', forecast: 'Forecast',
  estimate: 'Estimate', statutory: 'Current statutory setting', unverified: 'Not freshly verified', gap: 'Data gap', 'source-disagreement': 'Sources disagree',
} as const;

/** Preserve distinctions that a generic observed/calculated badge would hide. */
export function observationStatus(record: EconomicObservation): string {
  const specific: Record<string, string> = {
    'advertised-product': 'Advertised product rate',
    'derived-product-summary': 'Calculated from product quotes; unweighted',
    'dated-market-quote': 'Dated market quote',
    'policy-definition': 'Policy definition',
    'dated-assessment': 'Dated valuation assessment',
    'preliminary': 'Preliminary observation',
  };
  return specific[record.originalStatus ?? ''] ?? OBSERVATION_STATUS[record.status];
}

export function observationValue(record: EconomicObservation): string {
  if (record.value === null) return record.status === 'unverified' ? 'Not freshly verified' : 'No verified value';
  // A percentage denominator can mention people; only headcount units round to integers.
  const digits = /^(?:persons|people|households)\b/i.test(record.unit) ? 0 : 2;
  const value = new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits }).format(Math.abs(record.value) < 1e-10 ? 0 : record.value).replace('-', '−');
  return `${value} ${record.unit}`;
}

/** At most this many records beside one chart: the dialog is no catalogue. */
export const MAX_RECORDS_PER_CHART = 10;

/** Always read month zero of this variant. Moving a lever must not rewrite the audit. On a model
 *  that opens on a dated month 0, each record says whether the opening used it (`used`), and there
 *  is no qualification: the snapshot's qualifications (data/iceland, never edited) describe how the
 *  stationary and growing variants differ from the records, which is not how a dated opening
 *  starts. The chart's value, its records and the comparability mark say what there is to say. */
export function startingDataComparison(client: EngineClient) {
  if (client.info.id !== 'iceland' && !client.info.paramById.has('growthReal')) return [];
  const dated = !!client.calendar;
  const used = new Set(client.openingInfo?.recordsUsed ?? []);
  return client.info.indicators.map((indicator) => {
    const mapping = MAPPING_BY_ID.get(indicator.id);
    const unit = reportUnit(indicator, 'nominal', 'opening', client.moneyUnit);
    return {
      id: indicator.id,
      label: reportLabel(indicator, 'nominal'),
      group: indicator.group || 'Charts',
      modelValue: fmtReport(client.reportSeries(indicator.id, 'nominal')[0], indicator, 'nominal', 'bare'),
      modelUnit: unit,
      observations: (mapping?.observationIds ?? []).map((id) => OBSERVATION_BY_ID.get(id)).filter((record): record is EconomicObservation => !!record).slice(0, MAX_RECORDS_PER_CHART),
      used,
      comparability: mapping?.comparability ?? 'gap',
      qualification: dated
        ? null
        : client.info.paramById.has('growthReal') && indicator.id === 'inflation'
        ? 'Both measure the twelve-month consumer-price change. This evolving variant inherits zero inflation and its price history at the calibrated opening, then follows its explicit assumed price trend and endogenous price equations. It is not initialised from the current observed CPI history.'
        : client.info.paramById.has('growthReal') && indicator.id === 'keyRate'
          ? 'Same seven-day policy-rate concept. This variant inherits the calibrated 3% opening rate, then reacts to evolving inflation and activity. The observed 8% decision is a separate dated reference; the growing profile is not initialised from today’s observed monetary state.'
          : mapping?.qualification ?? 'No observation with the same definition was verified.',
    };
  });
}
