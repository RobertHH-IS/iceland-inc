import { describe, expect, test } from 'bun:test';
import { models } from '../../src/models/index.ts';
import { createEngine } from '../../src/core/engine.ts';
import { describeModel } from '../../src/ui/model/info.ts';
import { buildLedger, cellShows, legEffects } from '../../src/ui/model/ledger.ts';
import { expandableGroups } from '../../src/ui/model/hierarchy.ts';
import { hierarchyModel } from '../fixtures/hierarchy.ts';

describe('leg effects', () => {
  test('payments move net worth; claims only change its composition; purchases add the asset', () => {
    expect(legEffects({ posting: 'transfer', oneSided: false }, 5)).toEqual({ cellFrom: -5, cellTo: 5, nwFrom: -5, nwTo: 5 });
    expect(legEffects({ posting: 'issue', oneSided: false }, 5)).toEqual({ cellFrom: -5, cellTo: 5, nwFrom: 0, nwTo: 0 });
    expect(legEffects({ posting: 'purchase', oneSided: false }, 5)).toEqual({ cellFrom: -5, cellTo: 5, nwFrom: 0, nwTo: 5 });
    expect(legEffects({ posting: 'writeoff', oneSided: true }, 5)).toEqual({ cellFrom: -5, cellTo: 0, nwFrom: -5, nwTo: 0 });
    expect(legEffects({ posting: 'revalue', oneSided: true }, 5)).toEqual({ cellFrom: 5, cellTo: 0, nwFrom: 5, nwTo: 0 });
  });
});

for (const def of [...models, hierarchyModel()])
  describe(`ledger for '${def.id}'`, () => {
    const engine = createEngine(def);
    const info = describeModel(engine.model, (id) => engine.baseline(id));
    const legValues = () => Float64Array.from(engine.legs().map((l) => l.value));

    test('every flow is a row, grouped by account; every two-sided row sums to zero', () => {
      const t = buildLedger(info, legValues());
      expect(t.columns.map((c) => c.id)).toEqual(info.players.map((p) => p.id));
      expect(t.sections.flatMap((s) => s.rows).length).toBe(info.flows.length);
      for (const s of t.sections) for (const r of s.rows) expect(r.flow.account).toBe(s.account);
      expect(t.allBalanced).toBe(true);
      expect(t.maxRowResidual).toBeLessThan(1e-9);
    });

    test('group columns sum their players: top-level groups, or the map’s nodes', () => {
      const p = buildLedger(info, legValues(), 'player');
      const g = buildLedger(info, legValues(), 'group');
      expect(g.columns.map((c) => c.id)).toEqual(info.roots);
      const total = (x: typeof p) => x.netWorth.reduce((s, n) => s + n.value, 0);
      expect(total(g)).toBeCloseTo(total(p), 9);
      for (const expanded of [new Set<string>(), new Set(info.groups.map((x) => x.id))]) {
        const m = buildLedger(info, legValues(), { expanded });
        expect(total(m)).toBeCloseTo(total(p), 9);
        expect(m.allBalanced).toBe(true);
      }
      expect(buildLedger(info, legValues(), { expanded: new Set(info.groups.map((x) => x.id)) }).columns.map((c) => c.id).sort()).toEqual(info.players.map((x) => x.id).sort());
    });

    test('the net-worth row matches the balance sheets month by month, after a shock', () => {
      const e = engine.fork();
      const lever = info.levers.find((l) => l.kind === 'setting' && l.max !== undefined && l.max > l.default);
      if (lever) e.setLever(lever.id, lever.max!);
      e.step(5);
      const before = info.players.map((p) => e.balanceSheet(p.id).netWorth);
      e.step(1);
      const after = info.players.map((p) => e.balanceSheet(p.id).netWorth);
      const t = buildLedger(info, Float64Array.from(e.legs().map((l) => l.value)));
      info.players.forEach((_, i) => expect(t.netWorth[i].value * info.dt).toBeCloseTo(after[i] - before[i], 9));
    });

    test('the cells a row shows add up to its Σ: ±gross only for a cell whose legs all stay in its column', () => {
      const e = engine.fork();
      const lever = info.levers.find((l) => l.kind === 'setting' && l.max !== undefined && l.max > l.default);
      if (lever) e.setLever(lever.id, lever.max!);
      e.step(6);
      const legs = Float64Array.from(e.legs().map((l) => l.value));
      const ex = expandableGroups(info);
      const views: Parameters<typeof buildLedger>[2][] = ['player', 'group'];
      for (let m = 0; m < 1 << Math.min(ex.length, 8); m++) views.push({ expanded: new Set(ex.filter((_, i) => m & (1 << i))) });
      for (const view of views)
        for (const s of buildLedger(info, legs, view).sections)
          for (const r of s.rows) {
            let shown = 0;
            for (const c of r.cells) {
              if (!c) continue;
              if (cellShows(c) === 'gross') expect(Math.abs(c.value)).toBeLessThan(1e-9 * Math.max(1, c.gross));
              else shown += c.value;
            }
            expect(shown).toBeCloseTo(r.sum, 9);
            if (!r.oneSided) expect(Math.abs(shown)).toBeLessThan(1e-9 * Math.max(1, ...r.cells.map((c) => (c ? Math.abs(c.value) : 0))));
          }
    });

    test('at the baseline the economy is at rest: no player’s net worth changes', () => {
      const t = buildLedger(info, legValues());
      for (const n of t.netWorth) expect(Math.abs(n.baseline)).toBeLessThan(1e-9);
    });
  });

test('a cell with legs inside its column and to other columns shows its net value (Iceland investment, firms in construction)', () => {
  const def = models.find((m) => m.id === 'iceland')!;
  const engine = createEngine(def);
  const info = describeModel(engine.model, (id) => engine.baseline(id));
  const t = buildLedger(info, Float64Array.from(engine.legs().map((l) => l.value)));
  const row = t.sections.flatMap((s) => s.rows).find((r) => r.flow.id === 'investment')!;
  const fc = row.cells[t.columns.findIndex((c) => c.id === 'FC')]!;
  expect(fc.both && fc.external).toBe(true);
  expect(cellShows(fc)).toBe('net');
  // The ±gross within the column (about 1 % of GDP) used to hide the net receipts (about 15).
  expect(fc.value).toBeGreaterThan(10 * fc.gross);
  expect(cellShows({ both: true, external: false })).toBe('gross');
  expect(cellShows({ both: false, external: true })).toBe('net');
});
