/**
 * `bun run levers [--model <id>] [--months <n>] [--paths <dir>]`
 *
 * Moves every lever of every model (or one) hard, one at a time, and writes
 * reports/levers/<model>.md and reports/levers/<model>.json (lever-report.ts). Another horizon
 * writes reports/levers/<model>-<n>m.md and .json instead, which are git-ignored, so the committed
 * 240-month reports stay as they are. With --paths it also writes <dir>/<model>.json, the full
 * monthly effect path of every headline in every run; those files are large, so
 * reports/levers/paths/ is git-ignored. Prints the runtime, and exits with code 1 when a run is
 * broken (a Non-finite, Residual, Sign or Implausible flag) or an expectation does not hold.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { models } from '../models/index.ts';
import { BROKEN_FLAGS, DEFAULT_MONTHS, leverReport } from './lever-report.ts';
import { renderLeverJson, renderLeverMarkdown, renderLeverPaths, reportName } from './lever-render.ts';

const root = resolve(import.meta.dir, '..', '..');
const args = process.argv.slice(2);
const option = (name: string) => {
  const j = args.indexOf(name);
  if (j < 0) return undefined;
  const v = args[j + 1];
  if (v === undefined || v.startsWith('--')) {
    console.error(`${name} needs a value`);
    process.exit(1);
  }
  return v;
};

const only = option('--model');
const months = Number(option('--months') ?? DEFAULT_MONTHS);
if (!(Number.isInteger(months) && months >= 1)) {
  console.error('--months must be a whole number of at least 1');
  process.exit(1);
}
const pathsOpt = option('--paths');
const pathsDir = pathsOpt === undefined ? undefined : isAbsolute(pathsOpt) ? pathsOpt : resolve(process.cwd(), pathsOpt);
const selected = only ? models.filter((m) => m.id === only) : models;
if (only && !selected.length) {
  console.error(`no model '${only}' in src/models/index.ts (have: ${models.map((m) => m.id).join(', ')})`);
  process.exit(1);
}

const outDir = join(root, 'reports', 'levers');
mkdirSync(outDir, { recursive: true });
if (pathsDir) mkdirSync(pathsDir, { recursive: true });
console.log('Iceland Inc. lever responses');
let failed = false;
const shown = (p: string) => relative(process.cwd(), p) || p;
for (const def of selected) {
  const t0 = performance.now();
  const r = leverReport(def, { months, paths: !!pathsDir });
  const name = reportName(def.id, months);
  const md = join(outDir, `${name}.md`),
    json = join(outDir, `${name}.json`);
  writeFileSync(md, renderLeverMarkdown(r));
  writeFileSync(json, renderLeverJson(r));
  const written = [md, json];
  if (pathsDir) {
    const p = join(pathsDir, `${name}.json`);
    writeFileSync(p, renderLeverPaths(r));
    written.push(p);
  }
  const flagged = r.levers.reduce((a, s) => a + s.runs.filter((x) => x.flags.some((f) => f.kind !== 'regime')).length, 0);
  const broken = r.levers.reduce((a, s) => a + [...s.runs, ...s.companionRuns].filter((x) => x.flags.some((f) => BROKEN_FLAGS.includes(f.kind))).length, 0);
  const failing = r.expectations?.filter((x) => !x.pass) ?? [];
  if (broken || failing.length) failed = true;
  console.log(`\n${def.id}  ${def.label}`);
  console.log(`  ${r.levers.length} levers, ${r.runs} runs of ${months} months, ${flagged} run(s) with a flag other than Regimes, ${broken} broken`);
  if (r.expectations) console.log(`  expectations: ${r.expectations.length - failing.length}/${r.expectations.length} hold${failing.length ? `; not: ${failing.map((x) => `${x.lever} ${x.setting} ${x.variable}`).join(', ')}` : ''}`);
  console.log(`  ${((performance.now() - t0) / 1000).toFixed(1)} s; wrote ${written.map(shown).join(', ')}`);
}
// A broken run or an expectation that does not hold fails the command, after the reports are
// written so they can be read.
if (failed) {
  console.log('\nFAILURES: a broken run or an expectation that does not hold (see the reports)');
  process.exit(1);
}
