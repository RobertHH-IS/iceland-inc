/**
 * A dated stand-in for Iceland today, for the interface's tests before the profile is registered
 * (docs/design/today-opening.md §9.4): the growing variant with financial stress, given the
 * calendar and money unit of the dated opening. Its numbers are the growing variant's (a 3% key
 * rate, zero inflation at month 0); only how the interface writes them is under test here.
 * `withOpening` adds what an engine with a dated opening reports (its id, label, date and the
 * records it used), as the kernel's KernelEngine.opening will.
 */
import type { Id } from '../../src/core/types.ts';
import type { KernelEngine } from '../../src/core/engine.ts';
import { applicationModels, createRegisteredEngine } from '../../src/models/index.ts';
import { createEngineClient, type EngineClient } from '../../src/ui/engine-client.ts';
import type { DatedModelDef, MoneyUnit } from '../../src/ui/model/contract.ts';

export const TODAY_MONEY: MoneyUnit = {
  label: 'ISK bn',
  perUnit: 49.41211,
  basis: 'Hagstofa THJ01102: 2025 GDP at current prices, ISK 4,941.211 bn (September 2026 vintage); one model unit is 1% of it',
};

const growing = applicationModels.find((m) => m.id === 'iceland-growing')!;

export const datedModel: DatedModelDef = {
  ...growing,
  id: 'dated-fixture',
  label: 'Dated test economy',
  calendar: { month0: { year: 2026, month: 9 } },
  moneyUnit: TODAY_MONEY,
};

export const OPENING = { id: 'fixture-2026-09-30', label: 'Iceland on 30 September 2026', asOf: '2026-09-30' };

/** An engine that reports a dated opening built from `recordsUsed`. */
export function withOpening(engine: KernelEngine, recordsUsed: Id[] = []): KernelEngine {
  Object.defineProperty(engine, 'opening', { value: { ...OPENING, recordsUsed }, enumerable: false });
  return engine;
}

/** A client as the application makes it for a dated model: compared with its no-change run. */
export function datedClient(opts: { recordsUsed?: Id[]; opening?: boolean } = {}): EngineClient {
  const engine = createRegisteredEngine(datedModel);
  if (opts.opening !== false) withOpening(engine, opts.recordsUsed);
  return createEngineClient(engine, { comparison: 'no-change', model: datedModel, tickMs: 1e9 });
}
