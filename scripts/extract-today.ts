/**
 * `bun scripts/extract-today.ts [--solve]`
 *
 * Writes data/iceland/today-2026-09-30.json: the records the Iceland-today opening uses
 * (src/models/iceland/today/records.ts), copied from the dated snapshot
 * data/iceland/observations-2026-09-30.json, plus the block `solution`, the committed values of the
 * opening's start solve (docs/design/today-opening.md §3.4). The engine bundle then carries this
 * small file instead of the whole snapshot. The snapshot itself is never edited.
 *
 * Without --solve the existing `solution` block is kept as it is. With --solve the opening is
 * solved from scratch (mode 'solve') and the solved unknowns are written; commit the result with
 * the code change that moved it (the check-mode test fails until the two agree).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RECORD_IDS } from '../src/models/iceland/today/records.ts';

const root = resolve(import.meta.dir, '..');
const snapshotPath = join(root, 'data', 'iceland', 'observations-2026-09-30.json');
const outPath = join(root, 'data', 'iceland', 'today-2026-09-30.json');

interface SnapshotRecord {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  observationPeriod: string;
  publishedDate: string | null;
  sourceUrl: string | null;
  sourceLabel?: string;
  status: string;
  modelMapping?: string;
  notes?: string;
}
/** The fields copied verbatim. */
export const EXTRACT_FIELDS = ['id', 'label', 'value', 'unit', 'observationPeriod', 'publishedDate', 'sourceUrl', 'sourceLabel', 'status', 'modelMapping', 'notes'] as const;

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as { asOf: string; records: SnapshotRecord[] };
const byId = new Map(snapshot.records.map((r) => [r.id, r]));
const missing = RECORD_IDS.filter((id) => !byId.has(id));
if (missing.length) {
  console.error(`records not in the snapshot: ${missing.join(', ')}`);
  process.exit(1);
}
const records = [...RECORD_IDS].sort().map((id) => {
  const r = byId.get(id)!;
  const out: Record<string, unknown> = {};
  for (const f of EXTRACT_FIELDS) if (r[f] !== undefined) out[f] = r[f];
  return out;
});

let solution: Record<string, number> = {};
if (existsSync(outPath)) solution = (JSON.parse(readFileSync(outPath, 'utf8')) as { solution?: Record<string, number> }).solution ?? {};
if (process.argv.includes('--solve')) {
  const { compile } = await import('../src/core/compile.ts');
  const { openingBaseline } = await import('../src/core/opening.ts');
  const { initialBaselineForGrowingModel } = await import('../src/models/iceland/growth.ts');
  const { icelandTodayModel } = await import('../src/models/iceland/today/index.ts');
  const { withConcepts } = await import('../src/models/index.ts');
  const model = withConcepts(icelandTodayModel);
  const m = compile(model);
  const o = openingBaseline(m, model.opening!, initialBaselineForGrowingModel(model), { mode: 'solve' });
  solution = o.report.solve.solution;
  console.log(`solved ${o.report.solve.unknowns} unknowns in ${o.report.solve.iterations} iterations; largest residual ${o.report.solve.residual.toExponential(2)}, condition number ${o.report.solve.condition.toFixed(1)}`);
  for (const [id, x] of Object.entries(solution)) console.log(`  ${id} = ${x}`);
}

const out = {
  format: 'iceland-inc/today-extract@1',
  asOf: snapshot.asOf,
  snapshot: 'data/iceland/observations-2026-09-30.json',
  description: 'The records the Iceland-today opening (src/models/iceland/today) reads, copied from the dated snapshot by scripts/extract-today.ts, and the committed solution of its start solve. Edit the snapshot, not this file; rerun the script to refresh it.',
  records,
  solution,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${outPath.slice(root.length + 1)}: ${records.length} records, ${Object.keys(solution).length} solved unknowns`);
