/**
 * The parts of the engine contract for a dated opening that the interface reads
 * (docs/design/today-opening.md §6): a calendar for month 0, the money unit, and which opening a
 * model starts from. The kernel declares them in src/core/types.ts (CalendarMonth, MoneyUnit,
 * ModelDef.calendar/moneyUnit/opening, KernelEngine.opening/moneyUnit/calendar); until it does,
 * the interface reads them structurally from here, so a model or engine without them behaves
 * exactly as before.
 */
import type { KernelEngine } from '../../core/engine.ts';
import type { Id, ModelDef } from '../../core/types.ts';

/** A calendar month; month runs 1–12. */
export interface CalendarMonth {
  year: number;
  month: number;
}

/** How model money is shown in a currency: `perUnit` currency units per model unit. `priceYear`
 *  (an addition to §6) is the year whose prices real amounts are at and indices are 100 in; without
 *  it the interface reads the year of the GDP that `basis` names. */
export interface MoneyUnit {
  label: string;
  perUnit: number;
  basis: string;
  priceYear?: number;
}

/** What the interface shows of a dated opening: its name, date and the records it was built from. */
export interface OpeningInfo {
  id: Id;
  label: string;
  asOf: string;
  recordsUsed: Id[];
}

/** A model definition that may carry a dated opening (§6, ModelDef). */
export type DatedModelDef = ModelDef & {
  calendar?: { month0: CalendarMonth };
  moneyUnit?: MoneyUnit;
  opening?: { id: Id; label: string; asOf: string };
};

/** An engine that may report its dated opening (§6, KernelEngine). */
export type DatedEngine = KernelEngine & {
  readonly opening?: { id: Id; label: string; asOf: string; recordsUsed?: Id[] } | null;
  readonly moneyUnit?: MoneyUnit | null;
  calendar?: (month: number) => CalendarMonth | null;
};

/** The calendar, money unit and opening of an engine, from the engine itself where it reports
 *  them, else from the model definition it was built from. */
export function datedMeta(engine: DatedEngine, def?: DatedModelDef): { calendar: CalendarMonth | null; moneyUnit: MoneyUnit | null; opening: OpeningInfo | null } {
  const calendar = (typeof engine.calendar === 'function' ? engine.calendar(0) : null) ?? def?.calendar?.month0 ?? null;
  const moneyUnit = engine.moneyUnit ?? def?.moneyUnit ?? null;
  const o: { id: Id; label: string; asOf: string; recordsUsed?: Id[] } | null = engine.opening ?? def?.opening ?? null;
  const opening = o ? { id: o.id, label: o.label, asOf: o.asOf, recordsUsed: [...(o.recordsUsed ?? [])] } : null;
  return { calendar, moneyUnit, opening };
}
