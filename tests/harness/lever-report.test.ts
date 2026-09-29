/**
 * The lever-response report (src/harness/lever-report.ts): which settings it runs, that it
 * measures every effect against the no-change run in the same mode, that it is deterministic,
 * that a run with no event shows no effect at all, and that its flags fire on the paths they
 * describe.
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, type KModel } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { runScenario } from '../../src/core/scenario.ts';
import type { LeverDef } from '../../src/core/types.ts';
import { models } from '../../src/models/index.ts';
import { leverReportSpecs } from '../../src/harness/lever-headlines.ts';
import {
  HORIZONS,
  LEVER_THRESHOLDS,
  effectOf,
  hiddenIn,
  leverReport,
  leverSettings,
  measureNoEvent,
  moderatePair,
  pathFlags,
  readExpectations,
  regimeUses,
  sawtooth,
  summarise,
  type LeverReport,
} from '../../src/harness/lever-report.ts';
import { renderLeverJson, renderLeverMarkdown, renderLeverPaths } from '../../src/harness/lever-render.ts';

const refDef = models.find((m) => m.id === 'reference')!;
const ref = compile(refDef);
const lever = (id: string) => ref.levers.find((l) => l.id === id)!;
const values = (l: LeverDef) => leverSettings(l).map((s) => s.value);

let cached: LeverReport | null = null;
const report = () => (cached ??= leverReport(ref));

describe('settings', () => {
  test('a setting runs at its min, its max and a quarter of the way to each, snapped to its step', () => {
    // lendingAppetite: default 0, range −2 to 2, step 0.25
    expect(values(lever('lendingAppetite'))).toEqual([-2, -0.5, 0.5, 2]);
    const roles = leverSettings(lever('lendingAppetite')).map((s) => s.roles);
    expect(roles).toEqual([['min'], ['down'], ['up'], ['max']]);
    // keyRateFixed: default 3, range 0 to 10, step 0.25: down 3 − 0.75, up 3 + 1.75
    expect(values(lever('keyRateFixed'))).toEqual([0, 2.25, 4.75, 10]);
  });

  test('a moderate step is at least one step, and a setting at a bound has no step that way', () => {
    const l: LeverDef = { id: 'x', label: 'x', group: 'Policy', kind: 'setting', unit: 'pp', default: 0, min: 0, max: 1, step: 0.5, description: '', definition: '' };
    expect(leverSettings(l).map((s) => [s.value, s.roles])).toEqual([
      [0.5, ['up']],
      [1, ['max']],
    ]);
  });

  test('a one-off fires at its min, max, default and half of it, and the opposites that fit; never 0', () => {
    // wageSettlement: default 10, range −5 to 15: −10 does not fit, −5 is both the min and −half
    const s = leverSettings(lever('wageSettlement'));
    expect(s.map((x) => x.value)).toEqual([-5, 5, 10, 15]);
    expect(s[0].roles).toEqual(['min', '-half']);
    const krona = models.find((m) => m.id === 'iceland')!.modules.flatMap((m) => m.levers ?? []).find((l) => l.id === 'kronaShock')!;
    expect(values(krona)).toEqual([-25, -10, -5, 5, 10, 25]);
    expect(moderatePair(krona, leverSettings(krona))).toMatchObject({ down: { value: -5 }, up: { value: 5 }, from: 0 });
  });

  test('a choice runs every option but its default', () => {
    const buyers = models.find((m) => m.id === 'iceland')!.modules.flatMap((m) => m.levers ?? []).find((l) => l.id === 'bondBuyers')!;
    expect(values(buyers)).toEqual(buyers.options!.map((o) => o.value).filter((v) => v !== buyers.default));
  });

  test('a lever hidden in a mode (showWhen) is not run there, and the report says so', () => {
    const mode = ref.def.stabiliserMode!;
    expect(hiddenIn(ref, lever('keyRateFixed'), mode.automatic)).toBe(true);
    expect(hiddenIn(ref, lever('keyRateFixed'), mode.manual)).toBe(false);
    expect(hiddenIn(ref, lever('keyRateAddon'), mode.manual)).toBe(true);
    const s = report().levers.find((x) => x.id === 'keyRateFixed')!;
    expect(s.skipped.map((x) => x.mode)).toEqual(['Automatic']);
    expect(new Set(s.runs.map((r) => r.mode))).toEqual(new Set(['Manual']));
    expect(renderLeverMarkdown(report())).toContain('Not run on Automatic: the lever is shown only on Manual (showWhen).');
  });
});

describe('the reference report', () => {
  test('every lever but the stabiliser setting has a section, with a run per setting and shown mode', () => {
    const r = report();
    expect(r.levers.map((s) => s.id)).toEqual(ref.levers.filter((l) => l.id !== ref.def.stabiliserMode!.lever).map((l) => l.id));
    for (const s of r.levers) expect(s.runs.length).toBe(s.settings.length * (r.modes.length - s.skipped.length));
    expect(r.runs).toBe(r.levers.reduce((a, s) => a + s.runs.length, 0));
    expect(r.horizons).toEqual(HORIZONS);
    expect(r.headlines.map((h) => h.id)).toEqual(leverReportSpecs.reference.headlines.map((h) => ('indicator' in h ? h.indicator : h.id)));
    for (const s of r.levers) for (const run of s.runs) expect(run.indicators.map((x) => x.id)).toEqual(ref.indicators.map((i) => i.id));
  });

  test('an effect is the difference from the no-change run in the same mode, month by month', () => {
    const r = report();
    const mode = ref.def.stabiliserMode!;
    const run = r.levers.find((s) => s.id === 'govSpending')!.runs.find((x) => x.mode === 'Automatic' && x.roles.includes('max'))!;
    const modeEv = { t: 0, lever: mode.lever, value: mode.automatic };
    const shocked = runScenario(ref, [modeEv, { t: 0, lever: 'govSpending', value: run.value }], 240);
    const none = runScenario(ref, [modeEv], 240);
    const out = run.indicators.find((x) => x.id === 'output')!;
    HORIZONS.forEach((h, k) => {
      const want = ((shocked.value('output', h) / none.value('output', h)) - 1) * 100;
      expect(out.at[k]).toBeCloseTo(want, 9);
    });
    const debt = run.indicators.find((x) => x.id === 'govDebt')!;
    expect(debt.at[3]).toBeCloseTo(shocked.series('govDebt')[12] - none.series('govDebt')[12], 9);
  });

  test('it is deterministic: two reports render identical files', () => {
    const again = leverReport(compile(refDef));
    expect(renderLeverMarkdown(again)).toBe(renderLeverMarkdown(report()));
    expect(renderLeverJson(again)).toBe(renderLeverJson(report()));
  });

  test('the JSON parses and holds every run with its indicators; paths come only when asked for', () => {
    const j = JSON.parse(renderLeverJson(report()));
    expect(j.format).toBe('iceland-inc/levers@1');
    expect(j.levers.flatMap((s: { runs: unknown[] }) => s.runs).length).toBe(report().runs);
    expect(j.levers[0].runs[0].paths).toBeUndefined();
    const withPaths = leverReport(ref, { months: 24, levers: ['govSpending'], paths: true });
    const p = JSON.parse(renderLeverPaths(withPaths));
    expect(p.levers[0].runs[0].paths.output).toHaveLength(25);
  });

  test('the no-change runs stay at the baseline and raise no flag', () => {
    for (const n of report().noChange) {
      expect(n.drift).toBeLessThan(1e-8);
      expect(n.flags).toEqual([]);
    }
  });

  test('regimes that differ from the no-change run are listed with their months', () => {
    const uses = report().levers.flatMap((s) => s.runs.flatMap((r) => r.regimes));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      expect(u.months.length).toBeGreaterThan(0);
      for (const [a, b] of u.months) expect(b).toBeGreaterThanOrEqual(a);
    }
  });
});

describe('a run with no event', () => {
  test.each(models.map((m) => [m.id, m] as const))('%s: zero effect everywhere and no flag', (_, def) => {
    const run = measureNoEvent(def, 60);
    for (const s of [...run.headlines, ...run.indicators]) {
      expect(s.at.every((x) => x === 0)).toBe(true);
      expect(s.peak).toBe(0);
      expect(s.longRun).toBe(0);
    }
    for (const p of Object.values(run.paths!)) expect(p.every((x) => x === 0)).toBe(true);
    expect(run.flags).toEqual([]);
    expect(run.regimes).toEqual([]);
  });
});

describe('flags', () => {
  const T = LEVER_THRESHOLDS;
  const flagsOf = (path: number[], gradual = false) => pathFlags({ gradual }, path, summarise('x', path, HORIZONS.filter((h) => h < path.length)));

  test('a synthetic sawtooth path is flagged; a smooth one is not', () => {
    const saw = Array.from({ length: 241 }, (_, t) => (t === 0 ? 0 : 1 + (t % 2 ? 0.2 : -0.2) * Math.exp(-t / 100)));
    expect(sawtooth(saw, T.sawWindow, 0.001).alternations).toBeGreaterThanOrEqual(T.sawRun);
    expect(flagsOf(saw).map((f) => f.kind)).toContain('sawtooth');
    const smooth = Array.from({ length: 241 }, (_, t) => 1 - Math.exp(-t / 12));
    expect(sawtooth(smooth, T.sawWindow, 0.001).alternations).toBe(0);
    expect(flagsOf(smooth)).toEqual([]);
  });

  test('alternations below the threshold, or too few in a row, do not count', () => {
    const tiny = Array.from({ length: 61 }, (_, t) => (t % 2 ? 1e-4 : 0));
    expect(sawtooth(tiny, 60, 0.001).alternations).toBe(0);
    const three = [0, 1, 0, 1, 0, 0, 0, 0];
    expect(sawtooth(three, 60, 0.001).alternations).toBe(T.sawRun - 1);
  });

  test('a gradual variable with its peak in month 1 is a month-1 jump; a variable that may jump is not', () => {
    const jump = Array.from({ length: 241 }, (_, t) => (t === 0 ? 0 : 2 * Math.exp(-t / 24)));
    expect(flagsOf(jump, true).map((f) => f.kind)).toContain('jump');
    expect(flagsOf(jump, false).map((f) => f.kind)).not.toContain('jump');
  });

  test('a path still rising at month 240 is unsettled; one growing without bound is explosive', () => {
    const creeping = Array.from({ length: 241 }, (_, t) => 1 + 0.004 * t - (t ? 0 : 1));
    expect(flagsOf(creeping).map((f) => f.kind)).toContain('unsettled');
    const exploding = Array.from({ length: 241 }, (_, t) => 0.1 * Math.exp(t / 40));
    expect(flagsOf(exploding).map((f) => f.kind)).toContain('explosive');
  });

  test('a regime switching on and off month after month is counted, with the months it differs', () => {
    const rules = [{ id: 'floor' }] as unknown as KModel['rules'];
    const none = Array.from({ length: 121 }, () => [null]);
    const flick = Array.from({ length: 121 }, (_, t) => [t >= 50 && t < 70 && t % 2 ? 'Floor binds' : null]);
    const [u] = regimeUses({ rules }, [0], flick, none);
    expect(u.rule).toBe('floor');
    expect(u.labels).toEqual(['Floor binds']);
    expect(u.noChange).toEqual(['–']);
    expect(u.months[0]).toEqual([51, 51]);
    expect(u.months).toHaveLength(10);
    expect(u.switches).toBe(20);
    expect(u.densest).toBeGreaterThanOrEqual(T.flickerSwitches);
    const once = Array.from({ length: 121 }, (_, t) => [t >= 30 ? 'Cap binds' : null]);
    expect(regimeUses({ rules }, [0], once, none)[0]).toMatchObject({ months: [[30, 120]], switches: 1, densest: 1 });
    expect(regimeUses({ rules }, [0], none, none)).toEqual([]);
  });

  test('the engine keeps each month’s regime labels, in rule order', () => {
    const e = createEngine(ref);
    e.step(3);
    const labels = e.regimesAt(3);
    expect(labels).toHaveLength(ref.rules.length);
    ref.rules.forEach((r, j) => {
      if (!r.regime) expect(labels[j]).toBeNull();
    });
    expect(() => e.regimesAt(4)).toThrow(/no history/);
  });

  test('effects are in display units: % of the no-change level, pp for rates, differences otherwise', () => {
    expect(effectOf('deviation-pct', 102, 100)).toBeCloseTo(2, 12);
    expect(effectOf('deviation-pp', 0.05, 0.04)).toBeCloseTo(1, 12);
    expect(effectOf('deviation', 57, 55)).toBe(2);
  });

  test('on Manual, a policy instrument moved by a lever not its own is flagged', () => {
    // Pretend the key rate belonged to no lever: moving the Manual key rate must then be flagged.
    const spec = { ...leverReportSpecs.reference, policy: [{ variable: 'keyRate', label: 'key rate', levers: [] }] };
    const r = leverReport(ref, { months: 24, levers: ['keyRateFixed'], spec, expectations: null });
    const runs = r.levers[0].runs;
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) expect(run.flags.map((f) => f.kind)).toContain('policyMoved');
    // with the real spec, it is the lever's own instrument and nothing is flagged
    const ok = leverReport(ref, { months: 24, levers: ['keyRateFixed'], expectations: null });
    for (const run of ok.levers[0].runs) expect(run.flags.map((f) => f.kind)).not.toContain('policyMoved');
  });

  test('declared expectations are marked ✓ or ✗', () => {
    const r = leverReport(ref, {
      months: 60,
      levers: ['keyRateAddon'],
      expectations: [
        { lever: 'keyRateAddon', setting: 'max', mode: 'Automatic', variable: 'output', fromMonth: 6, toMonth: 36, sign: -1, theory: 'A higher key rate cools demand.', source: 'test' },
        { lever: 'keyRateAddon', setting: 'max', variable: 'output', fromMonth: 6, toMonth: 36, sign: 1, theory: 'Deliberately wrong.', source: 'test' },
        { lever: 'keyRateAddon', setting: 99, variable: 'output', fromMonth: 6, toMonth: 36, sign: 1, theory: 'No such run.', source: 'test' },
      ],
    });
    expect(r.expectations!.map((x) => x.pass)).toEqual([true, false, false]);
    expect(r.expectations![2].checks).toEqual([]);
    const md = renderLeverMarkdown(r);
    expect(md).toContain('✓ output falls over months 6–36');
    expect(md).toContain('✗ output rises over months 6–36');
    expect(md).toContain('no matching run');
  });

  test('expectations are read from <model>/expectations.ts when the model has one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lever-exp-'));
    try {
      mkdirSync(join(dir, 'm'));
      writeFileSync(join(dir, 'm', 'expectations.ts'), "export const expectations = [{ lever: 'x', setting: 'max', variable: 'output', fromMonth: 1, toMonth: 12, sign: 1, theory: 't', source: 's' }];\n");
      expect(readExpectations('m', dir)).toEqual([{ lever: 'x', setting: 'max', variable: 'output', fromMonth: 1, toMonth: 12, sign: 1, theory: 't', source: 's' }]);
      expect(readExpectations('none', dir)).toBeNull();
      mkdirSync(join(dir, 'bad'));
      writeFileSync(join(dir, 'bad', 'expectations.ts'), 'export const other = 1;\n');
      expect(() => readExpectations('bad', dir)).toThrow(/expectations/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('every model has a headline list whose variables exist', () => {
  for (const def of models) {
    const m = compile(def);
    const spec = leverReportSpecs[def.id];
    expect(spec).toBeDefined();
    const e = createEngine(m);
    for (const h of spec.headlines) {
      if ('indicator' in h) expect(m.indicatorIndex.has(h.indicator)).toBe(true);
      else {
        for (const v of h.vars) expect(m.varIndex.has(v)).toBe(true);
        expect(Number.isFinite(h.level((id) => e.baseline(id)))).toBe(true);
      }
    }
    for (const p of spec.policy) {
      expect(m.varIndex.has(p.variable)).toBe(true);
      for (const l of p.levers) expect(m.leverIndex.has(l)).toBe(true);
    }
  }
});
