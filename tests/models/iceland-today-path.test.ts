/**
 * Iceland today, the path (docs/design/today-opening.md §8). What is tested here is that the start
 * is sound, not that the path agrees with anyone's forecast (the owner's decision of 6 October
 * 2026): a key rate the user locks at 8.00 stays 8.00 (T6), twenty years run finite and plausible
 * in both padlock configurations (T7), and the path with no lever moved is pinned by a golden, so
 * a change that moves it is seen (T10). How that path compares with the Central Bank's forecast
 * and the market survey is reported in reports/opening-iceland-today.md and decision 0018.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { lockAll } from '../../src/core/scenario.ts';
import type { KernelEngine } from '../../src/core/engine.ts';
import { createRegisteredEngine, withConcepts } from '../../src/models/index.ts';
import { icelandTodayModel } from '../../src/models/iceland/today/index.ts';

const model = withConcepts(icelandTodayModel);
const MONEY_HOLDERS = ['HY', 'HW', 'HO', 'FC', 'FR', 'XF', 'XA', 'XT', 'XO', 'PF'];
const PF_ASSETS = ['deposits', 'govBonds', 'indexedBonds', 'bankBonds', 'mortgagesN', 'mortgagesI', 'shares', 'foreignAssets'];

interface Run {
  e: KernelEngine;
  at(id: string, t: number): number;
  stock(ins: string, pl: string, t: number): number;
}

/** Run `months` months, unlocked or with both padlocks closed and the key rate held at 8. */
function run(months: number, locked: boolean): Run {
  const e = createRegisteredEngine(model);
  if (locked) {
    lockAll(e);
    e.setLever('keyRate', 8);
  }
  const m = e.model;
  const stock = (ins: string, pl: string, t: number) => {
    const j = m.instrumentIndex.get(ins)! * m.NP + m.playerIndex.get(pl)!;
    const x = e.positionsAt(t)[j];
    return m.role[j] === 2 ? -x : x;
  };
  e.step(months);
  const at = (id: string, t: number) => e.valueAt(id, t);
  return { e, at, stock };
}

const within = (x: number, lo: number, hi: number) => expect({ x, inside: x >= lo && x <= hi }).toEqual({ x, inside: true });
const pfAssets = (r: Run, t: number) => PF_ASSETS.reduce((s, ins) => s + r.stock(ins, 'PF', t), 0);

describe('T6: a key rate the user locks at 8.00 stays 8.00', () => {
  test('for 24 months, whatever the rule would do', () => {
    const r = run(24, true);
    for (let t = 0; t <= 24; t++) expect(Math.abs(r.at('keyRate', t) - 0.08)).toBeLessThan(1e-12);
    expect(r.e.stabilisers().every((s) => s.locked)).toBe(true);
  });
});

describe('T7: twenty years, both configurations', () => {
  for (const locked of [false, true])
    test(`${locked ? 'every padlock closed, key rate 8' : 'every padlock open'}: finite, plausible, accounting below 1e-9, no wrong sign`, () => {
      const r = run(240, locked);
      for (const vd of r.e.model.vars) for (const t of [1, 12, 60, 120, 240]) expect(Number.isFinite(r.at(vd.id, t))).toBe(true);
      for (let t = 0; t <= 240; t++) {
        within(100 * r.at('unemployment', t), 0, 30);
        within(100 * r.at('inflation12', t), -10, 30);
        expect(r.at('debtRatio', t)).toBeLessThan(3);
      }
      const checks = r.e.checks();
      expect(checks.maxResidual).toBeLessThanOrEqual(1e-9);
      expect(checks.failures ?? []).toEqual([]);
      expect(checks.signViolations ?? []).toEqual([]);
    }, 60_000);
});

describe('T10: the path with no lever moved is pinned: months 0–24, both lock configurations, 16 series', () => {
  const dir = new URL('../golden/iceland-today/', import.meta.url);
  const series = (r: Run): Record<string, number[]> => {
    const months = Array.from({ length: 25 }, (_, t) => t);
    const of = (f: (t: number) => number) => months.map(f);
    return {
      keyRate: of((t) => r.at('keyRate', t)),
      inflation12: of((t) => r.at('inflation12', t)),
      cpi: of((t) => r.at('cpi', t)),
      expectedInflation: of((t) => r.at('expectedInflation', t)),
      unemployment: of((t) => r.at('unemployment', t)),
      wageGrowth: of((t) => r.at('wageGrowth', t)),
      exchangeRate: of((t) => r.at('exchangeRate', t)),
      output: of((t) => r.at('output', t)),
      nominalGDP: of((t) => r.at('nominalGDP', t)),
      debtRatio: of((t) => r.at('debtRatio', t)),
      deficit: of((t) => r.at('deficit', t)),
      mortgageDebtAmount: of((t) => ['HY', 'HW'].reduce((s, h) => s + r.stock('mortgagesN', h, t) + r.stock('mortgagesI', h, t), 0)),
      broadMoney: of((t) => MONEY_HOLDERS.reduce((s, h) => s + r.stock('deposits', h, t), 0)),
      pfAssets: of((t) => pfAssets(r, t)),
      housePrice: of((t) => r.at('housePrice', t)),
      currentAccount: of((t) => r.at('currentAccount', t)),
    };
  };
  for (const locked of [false, true])
    test(`${locked ? 'padlocks closed' : 'padlocks open'}: the path matches the golden to 1e-9 (UPDATE_GOLDEN=1 regenerates it deliberately)`, () => {
      const got = series(run(24, locked));
      const file = new URL(`no-change-${locked ? 'locked' : 'unlocked'}.json`, dir);
      if (process.env.UPDATE_GOLDEN || !existsSync(file)) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, JSON.stringify({ format: 'iceland-inc/golden-today@1', modelId: model.id, opening: model.opening!.id, config: locked ? 'every padlock closed, key rate 8.00' : 'every padlock open', months: 24, series: got }, null, 1) + '\n');
      }
      const want = (JSON.parse(readFileSync(file, 'utf8')) as { series: Record<string, number[]> }).series;
      expect(Object.keys(got)).toEqual(Object.keys(want));
      for (const [id, xs] of Object.entries(got)) xs.forEach((x, t) => expect({ id, t, same: Math.abs(x - want[id][t]) <= 1e-9 * Math.max(1, Math.abs(want[id][t])) }).toEqual({ id, t, same: true }));
    });
});
