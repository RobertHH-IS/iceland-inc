/**
 * Golden scenarios: stored indicator paths, so any change in results shows up in review.
 * Files live in tests/golden/<modelId>/<scenario>.json and are compared with a tolerance.
 * `bun run harness --update-golden` rewrites them deliberately.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScenarioEvent } from '../core/types.ts';

export interface GoldenFile {
  format: 'iceland-inc/golden@1';
  modelId: string;
  scenario: string;
  months: number;
  events: ScenarioEvent[];
  /** Indicator paths in display units, months + 1 values each. */
  indicators: Record<string, number[]>;
}

export const GOLDEN_ABS = 1e-9;
export const GOLDEN_REL = 1e-7;

export function goldenPath(dir: string, modelId: string, scenario: string): string {
  return join(dir, modelId, `${scenario}.json`);
}

/** Every indicator value that is not a finite number, as 'indicator at month t'. A golden must
 *  never store one: JSON writes NaN and Infinity as null, which would later compare as 0. */
export function nonFiniteValues(g: GoldenFile): string[] {
  const bad: string[] = [];
  for (const [id, a] of Object.entries(g.indicators))
    for (let t = 0; t < a.length; t++) if (typeof a[t] !== 'number' || !Number.isFinite(a[t])) bad.push(`${id} at month ${t}`);
  return bad;
}

export function writeGolden(dir: string, g: GoldenFile): string {
  const bad = nonFiniteValues(g);
  if (bad.length) throw new Error(`golden '${g.scenario}' has ${bad.length} non-finite value(s), first ${bad[0]}`);
  const path = goldenPath(dir, g.modelId, g.scenario);
  mkdirSync(join(dir, g.modelId), { recursive: true });
  writeFileSync(path, JSON.stringify(g, null, 1) + '\n');
  return path;
}

export function readGolden(dir: string, modelId: string, scenario: string): GoldenFile | null {
  const path = goldenPath(dir, modelId, scenario);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as GoldenFile;
}

export interface GoldenComparison {
  pass: boolean;
  /** The point that most exceeds its tolerance: its difference divided by the tolerance there
   *  (above 1 fails; Infinity when either value is not a finite number)… */
  ratio: number;
  /** …and the absolute difference at that same point. */
  diff: number;
  /** Structural problems (scenario changed, indicators missing or added), then that point. */
  where: string;
}

/** Compare a new run with a stored one, point by point, against GOLDEN_ABS + GOLDEN_REL × |stored|. */
export function compareGolden(stored: GoldenFile, fresh: GoldenFile): GoldenComparison {
  const problems: string[] = [];
  if (stored.months !== fresh.months || JSON.stringify(stored.events) !== JSON.stringify(fresh.events)) problems.push('scenario definition changed');
  let ratio = 0,
    diff = 0,
    point = '';
  for (const [id, a] of Object.entries(fresh.indicators)) {
    const b: unknown[] | undefined = stored.indicators[id];
    if (!Array.isArray(b) || b.length !== a.length) {
      problems.push(`indicator '${id}' missing or of different length`);
      continue;
    }
    for (let t = 0; t < a.length; t++) {
      const x = a[t],
        y = b[t];
      const finite = typeof y === 'number' && Number.isFinite(y) && Number.isFinite(x);
      const d = finite ? Math.abs(x - y) : Infinity;
      const r = finite ? d / (GOLDEN_ABS + GOLDEN_REL * Math.abs(y)) : Infinity;
      if (r > ratio) {
        ratio = r;
        diff = d;
        point = finite ? `${id} at month ${t}` : `${id} at month ${t} is not a finite number (stored ${String(y)}, now ${String(x)})`;
      }
    }
  }
  for (const id of Object.keys(stored.indicators)) if (!(id in fresh.indicators)) problems.push(`indicator '${id}' no longer exists`);
  return { pass: !problems.length && ratio <= 1, ratio, diff, where: [...problems, point].filter(Boolean).join('; ') };
}
