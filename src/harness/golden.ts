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

export function writeGolden(dir: string, g: GoldenFile): string {
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

/** Compare a new run with a stored one: the worst excess over tolerance, and where. */
export function compareGolden(stored: GoldenFile, fresh: GoldenFile): { pass: boolean; maxDiff: number; where: string } {
  let maxDiff = 0;
  let where = '';
  let pass = stored.months === fresh.months && JSON.stringify(stored.events) === JSON.stringify(fresh.events);
  if (!pass) where = 'scenario definition changed';
  for (const [id, a] of Object.entries(fresh.indicators)) {
    const b = stored.indicators[id];
    if (!b || b.length !== a.length) {
      pass = false;
      where = `indicator '${id}' missing or of different length`;
      continue;
    }
    for (let t = 0; t < a.length; t++) {
      const d = Math.abs(a[t] - b[t]);
      if (d > maxDiff || Number.isNaN(d)) {
        maxDiff = Number.isNaN(d) ? Infinity : d;
        where = `${id} at month ${t}`;
      }
      if (!(d <= GOLDEN_ABS + GOLDEN_REL * Math.abs(b[t]))) pass = false;
    }
  }
  for (const id of Object.keys(stored.indicators))
    if (!(id in fresh.indicators)) {
      pass = false;
      where = `indicator '${id}' no longer exists`;
    }
  return { pass, maxDiff, where };
}
