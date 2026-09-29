/**
 * `bun run harness [--update-golden] [--full] [--model <id>] [--runs <n>] [--seed <n>]`
 *
 * Runs the six test layers for every model in src/models/index.ts, writes
 * reports/harness-<modelId>.md, prints a summary and exits with code 1 on any failure.
 * `--full` (before a merge, and nightly) also runs the half-step test at four times the sub-steps
 * a month, to measure each calibration measure's order of convergence (decision 0011); it adds
 * about a tenth to the run, and the everyday run leaves it out.
 * Implausible values and wrong-signed positions in the property runs, the lever-extremes sweep
 * and the golden scenarios are failures (decision 0005); only a model's declared exemptions
 * (InstrumentDef.mayGoNegative) are left out.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { models } from '../models/index.ts';
import { runHarness, type HarnessOptions } from './layers.ts';
import { renderReport } from './report.ts';

const root = resolve(import.meta.dir, '..', '..');
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const j = args.indexOf(name);
  return j >= 0 ? args[j + 1] : undefined;
};

const opts: HarnessOptions = {
  updateGolden: flag('--update-golden'),
  goldenDir: join(root, 'tests', 'golden'),
  propertyRuns: Number(option('--runs') ?? 40),
  propertyMonths: 120,
  seed: Number(option('--seed') ?? 20260928),
  extremeMonths: 240,
  full: flag('--full'),
};
const only = option('--model');
const selected = only ? models.filter((m) => m.id === only) : models;
if (only && !selected.length) {
  console.error(`no model '${only}' in src/models/index.ts (have: ${models.map((m) => m.id).join(', ')})`);
  process.exit(1);
}

mkdirSync(join(root, 'reports'), { recursive: true });
console.log('Iceland Inc. harness');
let allPass = true;
for (const def of selected) {
  const t0 = performance.now();
  let result;
  try {
    result = runHarness(def, opts);
  } catch (e) {
    allPass = false;
    console.log(`\n${def.id}: harness crashed: ${(e as Error).stack ?? e}`);
    continue;
  }
  const path = join(root, 'reports', `harness-${def.id}.md`);
  writeFileSync(path, renderReport(result));
  allPass &&= result.pass;
  console.log(`\n${def.id}  ${def.label}`);
  for (const l of result.layers) console.log(`  ${l.n} ${l.title.padEnd(14)} ${l.pass ? 'PASS' : 'FAIL'}  ${l.summary}`);
  console.log(`  step time ${result.microsPerStep.toFixed(1)} µs a month (${def.substeps ?? 1} kernel step(s)); harness ${((performance.now() - t0) / 1000).toFixed(1)} s; report ${path.slice(root.length + 1)}`);
}
console.log(`\n${allPass ? 'ALL PASS' : 'FAILURES: see the reports'}`);
process.exit(allPass ? 0 : 1);
