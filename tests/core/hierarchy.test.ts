/**
 * The player hierarchy (decision 0003): building and validating the group tree, nodeOf, pipes
 * at mixed levels, group balance sheets, ideas-at-play scopes, and that models without
 * GroupDefs (the reference model) behave exactly as before.
 */
import { describe, expect, test } from 'bun:test';
import { compile, CompileError } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import type { FlowKind, GroupDef, ModelDef, Pipe } from '../../src/core/types.ts';
import { referenceModel } from '../../src/models/reference/index.ts';
import { hierarchyModel } from '../fixtures/hierarchy.ts';
import { tinyModel } from './fixtures.ts';

function errorsOf(def: ModelDef): string[] {
  try {
    compile(def);
  } catch (e) {
    if (e instanceof CompileError) return e.errors;
    throw e;
  }
  return [];
}

/** The hierarchy model with its GroupDefs (and optionally its players) changed. */
function withGroups(edit: (groups: GroupDef[]) => GroupDef[], editPlayers?: (def: ModelDef) => void): ModelDef {
  const def = hierarchyModel();
  const s = def.modules[0];
  s.groups = edit(s.groups!.map((g) => ({ ...g })));
  s.players = s.players!.map((p) => ({ ...p }));
  editPlayers?.(def);
  return def;
}

const model = compile(hierarchyModel());
const group = (id: string) => model.groups.find((g) => g.id === id)!;

describe('the group tree', () => {
  test('parents come before children, with depth, children, direct players and all players', () => {
    expect(model.groups.map((g) => g.id)).toEqual(['households', 'firms', 'domestic', 'exporters', 'banks', 'cb', 'gov', 'world']);
    expect(group('firms')).toMatchObject({ depth: 0, children: ['domestic', 'exporters'], players: [], allPlayers: ['FR', 'FC', 'FF', 'FA'] });
    expect(group('exporters')).toMatchObject({ parent: 'firms', depth: 1, children: [], players: ['FF', 'FA'], allPlayers: ['FF', 'FA'] });
    expect(group('households')).toMatchObject({ depth: 0, players: ['H1', 'H2'], allPlayers: ['H1', 'H2'], description: 'Young and older households.' });
    expect(group('households').parent).toBeUndefined();
    for (const g of model.groups) {
      const i = model.groups.indexOf(g);
      if (g.parent) expect(model.groups.findIndex((x) => x.id === g.parent)).toBeLessThan(i);
    }
  });

  test('colour defaults to the first member’s; layout to the centroid of all players', () => {
    expect(group('firms').color).toBe('#F2A93B'); // Retail, the first player of Firms
    expect(group('exporters').color).toBe('#C8611A'); // declared
    expect(group('households').layout!.x).toBeCloseTo(0.1, 12);
    expect(group('households').layout!.y).toBeCloseTo(0.525, 12);
    expect(group('firms').layout!.y).toBeCloseTo((0.26 + 0.42 + 0.6 + 0.78) / 4, 12);
    const declared = compile(withGroups((gs) => gs.map((g) => (g.id === 'firms' ? { ...g, layout: { x: 0.7, y: 0.5 } } : g))));
    expect(declared.groups.find((g) => g.id === 'firms')!.layout).toEqual({ x: 0.7, y: 0.5 });
  });

  test('the hierarchy model compiles and its baseline is at rest', () => {
    const e = createEngine(model);
    e.step(24);
    for (const v of model.vars) expect(Math.abs(e.value(v.id) - e.baseline(v.id))).toBeLessThan(1e-12);
    expect(e.checks().failures).toEqual([]); // every step, not only the last
    expect(Math.max(...e.maxResiduals().map((r) => r.residual))).toBeLessThan(1e-9);
  });
});

describe('validation', () => {
  test('duplicate group ids', () => {
    const errs = errorsOf(withGroups((gs) => [...gs, { id: 'firms', label: 'Again', description: 'x' }]));
    expect(errs.some((e) => e.includes("duplicate group id 'firms'"))).toBe(true);
  });

  test('a parent that does not exist', () => {
    const errs = errorsOf(withGroups((gs) => gs.map((g) => (g.id === 'exporters' ? { ...g, parent: 'industry' } : g))));
    expect(errs.some((e) => e.includes("group 'exporters'") && e.includes("parent 'industry', which is not a declared group"))).toBe(true);
  });

  test('cycles, including a group that is its own parent', () => {
    const two = errorsOf(withGroups((gs) => gs.map((g) => (g.id === 'firms' ? { ...g, parent: 'exporters' } : g))));
    expect(two.some((e) => e.startsWith('groups form a cycle') && e.includes("'firms'") && e.includes("'exporters'"))).toBe(true);
    expect(two.filter((e) => e.startsWith('groups form a cycle'))).toHaveLength(1);
    const self = errorsOf(withGroups((gs) => gs.map((g) => (g.id === 'banks' ? { ...g, parent: 'banks' } : g))));
    expect(self.some((e) => e.startsWith("groups form a cycle: 'banks' → 'banks'"))).toBe(true);
  });

  test('a player’s group must be declared when the model declares groups', () => {
    const errs = errorsOf(
      withGroups(
        (gs) => gs,
        (def) => (def.modules[0].players![0].group = 'Households'),
      ),
    );
    expect(errs.some((e) => e.includes("player 'H1'") && e.includes("group 'Households', which is not a declared group"))).toBe(true);
  });

  test('a group id may not also be a player id', () => {
    const errs = errorsOf(withGroups((gs) => [...gs, { id: 'FR', label: 'Clash', parent: 'domestic', description: 'x' }]));
    expect(errs.some((e) => e.includes("group id 'FR'") && e.includes('also a player id'))).toBe(true);
  });

  test('a group without an id or label is an error; an empty group or one without a description warns', () => {
    const errs = errorsOf(withGroups((gs) => [...gs, { id: '', label: 'Nameless', description: 'x' }, { id: 'unnamed', label: '', description: 'x' }]));
    expect(errs.some((e) => e.includes('has no id'))).toBe(true);
    expect(errs.some((e) => e.includes("group 'unnamed'") && e.includes('has no label'))).toBe(true);
    const w = compile(withGroups((gs) => [...gs, { id: 'empty', label: 'Empty', description: '' }])).warnings;
    expect(w).toContain("group 'empty' has no players");
    expect(w).toContain("group 'empty' has no description");
  });
});

describe('models without GroupDefs', () => {
  test('flat top-level groups from the players’ labels, as before', () => {
    const m = compile(tinyModel());
    expect(m.groups.map((g) => [g.id, g.label, g.depth, g.players, g.allPlayers, g.children])).toEqual([
      ['Private', 'Private', 0, ['HH'], ['HH'], []],
      ['Bank', 'Bank', 0, ['B'], ['B'], []],
      ['CB', 'CB', 0, ['CB'], ['CB'], []],
      ['G', 'G', 0, ['G'], ['G'], []],
    ]);
    // a one-player group named after its player is not a clash
    expect(m.warnings.some((w) => w.includes('has the id of a player'))).toBe(false);
  });

  test('the reference model keeps its five groups, colours and pipes', () => {
    const m = compile(referenceModel);
    expect(m.groups.map((g) => g.id)).toEqual(['Households', 'Firms', 'Banks', 'Central bank', 'Government']);
    expect(m.groups.map((g) => g.color)).toEqual(m.players.map((p) => p.color));
    for (const g of m.groups) expect(g).toMatchObject({ depth: 0, children: [], players: g.allPlayers, label: g.id });
    const e = createEngine(m);
    e.setLever('keyRateAddon', 1);
    e.step(18);
    // what pipes('group') was before the hierarchy: legs summed by each player's group label
    const old = new Map<string, { value: number; baseline: number; n: number }>();
    const groupOf = (id: string) => m.players.find((p) => p.id === id)!.group;
    for (const l of e.legs()) {
      const k = `${groupOf(l.from)}->${groupOf(l.to)}:${l.kind}`;
      const o = old.get(k) ?? { value: 0, baseline: 0, n: 0 };
      old.set(k, { value: o.value + l.value, baseline: o.baseline + l.baseline, n: o.n + 1 });
    }
    const now = e.pipes('group');
    expect(now.map((p) => `${p.from}->${p.to}:${p.kind}`)).toEqual([...old.keys()]);
    for (const p of now) {
      const o = old.get(`${p.from}->${p.to}:${p.kind}`)!;
      expect([p.value, p.baseline, p.legs.length]).toEqual([o.value, o.baseline, o.n]);
    }
    expect(e.pipes({ expanded: [] })).toEqual(now);
    expect(e.pipes({ expanded: m.groups.map((g) => g.id) })).toEqual(e.pipes('player'));
    // a group's balance sheet is its one player's
    const hh = e.balanceSheet('HH');
    expect({ ...e.balanceSheet('Households'), player: 'HH' }).toEqual(hh);
  });

  test('an empty group label puts the player at the top level on its own', () => {
    const def = tinyModel();
    def.modules[0].players![0].group = '';
    const m = compile(def);
    expect(m.groups.map((g) => g.id)).toEqual(['Bank', 'CB', 'G']);
    expect(m.nodeOf('HH', [])).toBe('HH');
    expect(createEngine(m).pipes('group').some((p) => p.from === 'HH' || p.to === 'HH')).toBe(true);
  });
});

describe('nodeOf', () => {
  test('the outermost collapsed group, or the player when every group around it is open', () => {
    expect(model.nodeOf('FF', [])).toBe('firms');
    expect(model.nodeOf('FF', ['firms'])).toBe('exporters');
    expect(model.nodeOf('FF', ['firms', 'exporters'])).toBe('FF');
    expect(model.nodeOf('FR', ['firms', 'exporters'])).toBe('domestic');
    expect(model.nodeOf('H1', new Set(['households']))).toBe('H1');
    expect(model.nodeOf('B', [])).toBe('banks');
  });

  test('an open group inside a closed one stays hidden; unknown ids are ignored', () => {
    expect(model.nodeOf('FF', ['exporters'])).toBe('firms');
    expect(model.nodeOf('FF', ['nothing', 'firms'])).toBe('exporters');
  });

  test('an unknown player throws', () => {
    expect(() => model.nodeOf('ZZ', [])).toThrow(/unknown player/);
  });
});

const VIEWS = ['player', 'group', { expanded: [] }, { expanded: ['firms'] }, { expanded: ['firms', 'exporters'] }, { expanded: ['households', 'firms', 'domestic'] }, { expanded: ['exporters'] }] as const;

describe('pipes at mixed levels', () => {
  const e = createEngine(model);
  e.setLever('exportBoom', 1.5);
  e.step(3);
  const legs = e.legs();
  const kinds: FlowKind[] = ['cash', 'accrual', 'revaluation', 'writeoff'];
  const sumBy = (xs: { kind: FlowKind; value: number; baseline: number }[], k: FlowKind) =>
    xs.filter((x) => x.kind === k).reduce((s, x) => [s[0] + x.value, s[1] + x.baseline], [0, 0]);

  test('every view conserves the totals of each kind, and every leg is in exactly one pipe', () => {
    for (const v of VIEWS) {
      const pipes = e.pipes(v);
      for (const k of kinds) {
        const [pv, pb] = sumBy(pipes, k),
          [lv, lb] = sumBy(legs, k);
        expect(pv).toBeCloseTo(lv, 12);
        expect(pb).toBeCloseTo(lb, 12);
      }
      expect(pipes.reduce((n, p) => n + p.legs.length, 0)).toBe(legs.length);
      for (const p of pipes) {
        const s = p.legs.reduce((a, l) => a + l.value, 0);
        expect(p.value).toBeCloseTo(s, 12);
        for (const l of p.legs) expect(l.kind).toBe(p.kind);
      }
    }
  });

  test('pipe ends are the visible nodes of the view', () => {
    const expanded = ['firms'];
    const visible = new Set(model.players.map((p) => model.nodeOf(p.id, expanded)));
    expect([...visible].sort()).toEqual(['banks', 'cb', 'domestic', 'exporters', 'gov', 'households', 'world']);
    for (const p of e.pipes({ expanded })) {
      expect(visible.has(p.from) && visible.has(p.to)).toBe(true);
      for (const l of p.legs) expect([model.nodeOf(l.from, expanded), model.nodeOf(l.to, expanded)]).toEqual([p.from, p.to]);
    }
  });

  test('legs inside one visible node become a self-pipe', () => {
    const find = (ps: Pipe[], from: string, to: string, kind: FlowKind = 'cash') => ps.find((p) => p.from === from && p.to === to && p.kind === kind);
    const top = e.pipes('group');
    const hh = find(top, 'households', 'households')!;
    expect(hh.legs.map((l) => l.flow)).toEqual(['homes']);
    const firms = find(top, 'firms', 'firms')!;
    expect(firms.legs.map((l) => `${l.from}->${l.to}`).sort()).toEqual(['FF->FA', 'FR->FA', 'FR->FF']);
    expect(firms.value).toBeCloseTo(15, 12);
    const open = e.pipes({ expanded: ['firms'] });
    expect(find(open, 'firms', 'firms')).toBeUndefined();
    expect(find(open, 'exporters', 'exporters')!.legs.map((l) => `${l.from}->${l.to}`)).toEqual(['FF->FA']);
    expect(find(open, 'domestic', 'exporters')!.value).toBeCloseTo(10, 12);
    expect(e.pipes('player').some((p) => p.from === p.to)).toBe(false);
  });

  test('the two directions stay separate, and so do kinds', () => {
    const top = e.pipes('group');
    const toW = top.find((p) => p.from === 'firms' && p.to === 'world')!;
    const fromW = top.find((p) => p.from === 'world' && p.to === 'firms')!;
    expect(toW.value).toBeCloseTo(5, 12);
    expect(fromW.value).toBeCloseTo(6.5, 12); // exports, with the boom
    const cash = top.find((p) => p.from === 'firms' && p.to === 'banks' && p.kind === 'cash')!;
    const accrual = top.find((p) => p.from === 'firms' && p.to === 'banks' && p.kind === 'accrual')!;
    expect(cash.legs.map((l) => l.flow)).toEqual(['repayment']);
    expect(accrual.legs.map((l) => l.flow)).toEqual(['loanInterest']);
  });
});

describe('group balance sheets', () => {
  const e = createEngine(model);
  e.setLever('exportBoom', 2);
  e.step(7);
  const sumOf = (players: string[]) => {
    const rows = new Map<string, number[]>();
    let nw = 0,
      nwb = 0;
    for (const p of players) {
      const bs = e.balanceSheet(p);
      nw += bs.netWorth;
      nwb += bs.netWorthBaseline;
      for (const [side, list] of [
        ['a', bs.assets],
        ['l', bs.liabilities],
      ] as const)
        for (const r of list) {
          const k = `${side}:${r.instrument}`;
          const o = rows.get(k) ?? [0, 0];
          rows.set(k, [o[0] + r.value, o[1] + r.baseline]);
        }
    }
    return { rows, nw, nwb };
  };

  test('equal the sum of their members, instrument by instrument, at every depth', () => {
    for (const g of model.groups) {
      const bs = e.balanceSheet(g.id);
      const want = sumOf(g.allPlayers);
      expect(bs.player).toBe(g.id);
      expect(bs.netWorth).toBeCloseTo(want.nw, 12);
      expect(bs.netWorthBaseline).toBeCloseTo(want.nwb, 12);
      const got = [...bs.assets.map((r) => [`a:${r.instrument}`, r.value, r.baseline] as const), ...bs.liabilities.map((r) => [`l:${r.instrument}`, r.value, r.baseline] as const)];
      expect(got.map((r) => r[0] as string).sort()).toEqual([...want.rows.keys()].sort());
      for (const [k, v, b] of got) {
        expect(v).toBeCloseTo(want.rows.get(k)![0], 12);
        expect(b).toBeCloseTo(want.rows.get(k)![1], 12);
      }
    }
    // Firms = Domestic firms + Exporters
    expect(e.balanceSheet('firms').netWorth).toBeCloseTo(e.balanceSheet('domestic').netWorth + e.balanceSheet('exporters').netWorth, 12);
  });

  test('claims between members are kept gross, not netted', () => {
    const def = tinyModel();
    def.modules[0].players!.find((p) => p.id === 'B')!.group = 'Private';
    const t = createEngine(compile(def));
    const bs = t.balanceSheet('Private');
    expect(bs.assets.find((r) => r.instrument === 'deposits')!.value).toBeCloseTo(50, 9);
    expect(bs.liabilities.find((r) => r.instrument === 'deposits')!.value).toBeCloseTo(50, 9);
    expect(bs.netWorth).toBeCloseTo(t.balanceSheet('HH').netWorth + t.balanceSheet('B').netWorth, 12);
  });

  test('an unknown id throws', () => {
    expect(() => e.balanceSheet('nobody')).toThrow(/unknown player or group/);
  });
});

describe('ideas at play with groups and mixed pipes', () => {
  const e = createEngine(model);
  e.setLever('exportBoom', 2);
  e.step(2);
  const concepts = (scope?: string) => e.ideasAtPlay(scope).map((x) => x.concept);

  test('groups at any depth and pipes between nodes at any level are valid scopes', () => {
    for (const scope of ['firms', 'exporters', 'households', 'world->firms:cash', 'world->exporters', 'world->FF:cash', 'exporters->exporters:cash', 'firms->households', 'FF->households:cash'])
      expect(() => e.ideasAtPlay(scope)).not.toThrow();
    expect(() => e.ideasAtPlay('nobody->firms')).toThrow(/not a player or group/);
  });

  test('a pipe scope covers exactly the legs between its two nodes', () => {
    expect(concepts('world->exporters:cash')).toEqual(['export-demand']);
    expect(concepts('world->FF')).toEqual(['export-demand']);
    expect(concepts('world->domestic')).toEqual([]);
    expect(concepts('exporters')).toContain('export-demand');
    expect(concepts('households')).toEqual([]);
  });
});
