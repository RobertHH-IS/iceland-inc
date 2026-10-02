import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { CURRENT_DATA, OBSERVATION_BY_ID, observationValue, startingDataComparison } from '../../src/ui/model/current-data.ts';
import { CurrentDataAudit } from '../../src/ui/views/CurrentDataAudit.tsx';
import { EconomicContextSummary } from '../../src/ui/views/BaselineContext.tsx';

describe('dated Iceland data audit', () => {
  test('every chart has exactly one mapping and all referenced observations exist', () => {
    const client = createEngineClient(icelandModel);
    const ids = client.info.indicators.map((indicator) => indicator.id).sort();
    const mappings = CURRENT_DATA.indicatorMappings;
    expect(mappings.map((mapping) => mapping.indicatorId).sort()).toEqual(ids);
    expect(new Set(mappings.map((mapping) => mapping.indicatorId)).size).toBe(ids.length);
    expect(new Set(CURRENT_DATA.records.map((record) => record.id)).size).toBe(CURRENT_DATA.records.length);
    for (const mapping of mappings) {
      expect(mapping.qualification.trim().length).toBeGreaterThan(20);
      for (const id of mapping.observationIds) expect(OBSERVATION_BY_ID.has(id)).toBe(true);
      if (mapping.comparability !== 'gap') expect(mapping.observationIds.length).toBeGreaterThan(0);
    }
    client.dispose();
  });

  test('observations preserve units, source URLs and publication vintages', () => {
    expect(observationValue(OBSERVATION_BY_ID.get('macro.governmentEmploymentLegalFormShareAnnual2025')!)).toBe('25.58 % of same-table employed persons');
    expect(observationValue(OBSERVATION_BY_ID.get('macro.populationForeignCitizens')!)).toBe('71,130 persons');
    for (const record of CURRENT_DATA.records) {
      expect(record.unit.trim().length).toBeGreaterThan(0);
      expect(record.observationPeriod.trim().length).toBeGreaterThan(0);
      expect(record.notes.trim().length).toBeGreaterThan(0);
      if (record.value !== null) expect(Number.isFinite(record.value)).toBe(true);
      if (!['gap', 'unverified'].includes(record.status)) {
        expect(new URL(record.sourceUrl).protocol).toBe('https:');
        expect(record.sourceLabel.trim().length).toBeGreaterThan(0);
      }
      if (record.publishedDate) {
        expect(record.publishedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(record.publishedDate <= CURRENT_DATA.asOf).toBe(true);
      }
      expect(observationValue(record)).not.toMatch(/NaN|undefined/);
    }
  });

  test('current rates are measured references, and viewing them never rewrites a scenario', () => {
    const client = createEngineClient(icelandModel);
    client.load({ modelId: 'iceland', version: 2, months: 12, events: [{ t: 0, lever: 'keyRate', value: 4 }] });
    const before = client.scenario();
    const frame = client.getFrame();
    const comparisons = startingDataComparison(client);
    const rate = comparisons.find((row) => row.id === 'keyRate')!;
    expect(rate.modelValue).toBe('3.00%');
    expect(rate.observations.some((observation) => observation.value === 8 && observation.status === 'observed')).toBe(true);
    const inflation = comparisons.find((row) => row.id === 'inflation')!;
    expect(inflation.observations.some((observation) => observation.value === 5.9 && observation.publishedDate === '2026-09-29')).toBe(true);
    const html = renderToStaticMarkup(<CurrentDataAudit client={client} />);
    expect((html.match(/data-indicator=/g) ?? []).length).toBe(client.info.indicators.length);
    expect(html).toContain('No matching observation');
    expect(html).toContain('Model start');
    const summary = renderToStaticMarkup(<EconomicContextSummary client={client} />);
    expect(summary).toContain('3.00% key rate');
    expect(summary).toContain('Iceland policy 8.00%');
    expect(client.scenario()).toEqual(before);
    expect(client.getFrame()).toBe(frame);
    client.dispose();
  });
});
