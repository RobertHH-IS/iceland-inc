/**
 * The records the Iceland-today opening reads, from the extract file
 * data/iceland/today-2026-09-30.json (written by scripts/extract-today.ts from the dated snapshot).
 * `record(id)` throws on an id that is not in the extract or whose value is null (a gap in the
 * data): a bridge must be declared in the opening instead (docs/design/today-opening.md §1.6).
 */
import type { Id } from '../../../core/types.ts';
import raw from '../../../../data/iceland/today-2026-09-30.json' with { type: 'json' };

export interface TodayRecord {
  id: Id;
  label: string;
  value: number;
  unit: string;
  /** The observation period, e.g. '2026-08-31' or '2025Q3–2026Q2'. */
  period: string;
  /** The source: the publisher, and the URL when there is one. */
  source: string;
  status: string;
  notes?: string;
}

interface RawRecord {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  observationPeriod: string;
  publishedDate?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string;
  status: string;
  modelMapping?: string;
  notes?: string;
}

export const EXTRACT = raw as { format: string; asOf: string; snapshot: string; records: RawRecord[]; solution: Record<string, number> };

const byId = new Map<string, RawRecord>(EXTRACT.records.map((r) => [r.id, r]));

/** True when the extract carries the record and it has a value. */
export function hasRecord(id: Id): boolean {
  const r = byId.get(id);
  return !!r && typeof r.value === 'number' && Number.isFinite(r.value);
}

/** A record with a value. Throws on a missing id or a null value. */
export function record(id: Id): TodayRecord {
  const r = byId.get(id);
  if (!r) throw new Error(`Iceland today: no record '${id}' in data/iceland/today-2026-09-30.json (add it to src/models/iceland/today/records.ts and rerun scripts/extract-today.ts)`);
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) throw new Error(`Iceland today: record '${id}' has no value (${r.status}); declare a bridge for it instead`);
  return {
    id: r.id,
    label: r.label,
    value: r.value,
    unit: r.unit,
    period: r.observationPeriod,
    source: `${r.sourceLabel ?? 'unnamed source'}${r.sourceUrl ? `, ${r.sourceUrl}` : ''}`,
    status: r.status,
    ...(r.notes ? { notes: r.notes } : {}),
  };
}

/** The value of a record (a shorthand). */
export const value = (id: Id): number => record(id).value;

/** The committed solution of the start solve (empty until scripts/extract-today.ts --solve wrote it). */
export const COMMITTED_SOLUTION: Readonly<Record<string, number>> = EXTRACT.solution ?? {};
