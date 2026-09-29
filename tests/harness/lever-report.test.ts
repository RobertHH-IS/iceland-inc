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
  DEFAULT_MONTHS,
  HORIZONS,
  LEVER_THRESHOLDS,
  UNIT_MEANINGS,
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
  untracedRules,
  type LeverReport,
} from '../../src/harness/lever-report.ts';
import { renderLeverJson, renderLeverMarkdown, renderLeverPaths, reportName } from '../../src/harness/lever-render.ts';

const refDef = models.find((m) => m.id === 'reference')!;
const ref = compile(refDef);
const iceDef = models.find((m) => m.id === 'iceland')!;
const ice = compile(iceDef);
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

  test('the moderate steps mirror each other on a symmetric range, halves rounding away from the default', () => {
    // ±3 in steps of 0.1: a quarter is 0.75, 7.5 steps, so both ways go 8 steps (not −0.7 and +0.8)
    const l: LeverDef = { id: 'x', label: 'x', group: 'Policy', kind: 'setting', unit: '% of GDP', default: 0, min: -3, max: 3, step: 0.1, description: '', definition: '' };
    expect(values(l)).toEqual([-3, -0.8, 0.8, 3]);
    expect(values(ice.levers.find((x) => x.id === 'health')!)).toEqual([-3, -0.8, 0.8, 3]);
    // off-centre default: 30 in 0–80 by 5 goes down 7.5 → 10 and up 12.5 → 15
    expect(values(ice.levers.find((x) => x.id === 'migration')!)).toEqual([0, 20, 45, 80]);
    // a one-off's half is snapped the same way on either sign
    const o: LeverDef = { id: 'o', label: 'o', group: 'Policy', kind: 'oneoff', unit: '%', default: 5, min: -5, max: 5, step: 1, description: '', definition: '' };
    expect(values(o)).toEqual([-5, -3, 3, 5]);
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

  test('with onlyExpected, only the runs an expectation needs are made, through the given runner, with the same results', () => {
    const expectations = [
      { lever: 'keyRateAddon', setting: 'max', mode: 'Automatic', variable: 'output', fromMonth: 6, toMonth: 36, sign: -1, theory: 'A higher key rate cools demand.', source: 'test' },
      { lever: 'govSpending', setting: 'up', variable: 'deficit', fromMonth: 1, toMonth: 6, sign: 1, theory: 'Spending widens the deficit.', source: 'test' },
    ] as const;
    const made: string[] = [];
    const base = createEngine(ref);
    const r = leverReport(ref, {
      months: 60,
      onlyExpected: true,
      expectations: [...expectations],
      engine: base,
      run: (events, months) => {
        made.push(events.map((e) => `${e.lever}=${e.value}`).join(' '));
        return runScenario(base, events, months).engine;
      },
    });
    const full = leverReport(ref, { months: 60, levers: ['keyRateAddon', 'govSpending'], expectations: [...expectations] });
    // two no-change runs, keyRateAddon at its max on Automatic, govSpending up in both modes
    expect(made).toEqual(['stabilisers=0', 'stabilisers=1', 'stabilisers=1 keyRateAddon=3', 'stabilisers=0 govSpending=1', 'stabilisers=1 govSpending=1']);
    expect(r.runs).toBe(3);
    expect(r.levers.map((s) => s.id)).toEqual(['keyRateAddon', 'govSpending']);
    expect(r.expectations).toEqual(full.expectations);
    expect(r.expectations!.every((x) => x.pass)).toBe(true);
  });

  test('an expectation on the stabiliser setting is checked on the switch between the no-change runs', () => {
    const r = leverReport(ref, {
      months: 60,
      onlyExpected: true,
      expectations: [
        { lever: 'stabilisers', setting: 0, mode: 'Automatic', variable: 'output', fromMonth: 1, toMonth: 60, sign: 0, theory: 'At the steady state, switching mode changes nothing.', source: 'test' },
        { lever: 'stabilisers', setting: 1, mode: 'Manual', variable: 'keyRate', fromMonth: 1, toMonth: 60, sign: 1, theory: 'Deliberately wrong.', source: 'test' },
      ],
    });
    expect(r.runs).toBe(0);
    expect(r.expectations!.map((x) => x.checks.length)).toEqual([1, 1]);
    expect(r.expectations!.map((x) => x.pass)).toEqual([true, false]);
    const md = renderLeverMarkdown(r);
    expect(md).toContain('is checked on the switch from one mode to the other');
    expect(md).toContain('Expectations that do not hold:');
  });

  test('an expectation naming a lever the model does not have stops the report', () => {
    expect(() => leverReport(ref, { months: 12, onlyExpected: true, expectations: [{ lever: 'noSuchLever', setting: 'max', variable: 'output', fromMonth: 1, toMonth: 12, sign: 1, theory: 't', source: 's' }] })).toThrow(/noSuchLever/);
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

describe('units', () => {
  test('every unit a report shows is defined, and the legend defines each one', () => {
    const r = report();
    const used = new Set([...r.headlines, ...r.indicators].map((h) => h.unit));
    expect(new Set(r.units.map((u) => u.unit))).toEqual(used);
    const md = renderLeverMarkdown(r);
    for (const u of r.units) {
      expect(UNIT_MEANINGS[u.unit]).toBeDefined();
      expect(md).toContain(`- **${u.unit}**: ${UNIT_MEANINGS[u.unit]}.`);
    }
  });

  test('a unit the report does not define fails loudly', () => {
    const spec = { ...leverReportSpecs.reference, headlines: [{ id: 'odd', label: 'Odd', vars: ['deficit'], level: (v: (id: string) => number) => v('deficit'), display: 'deviation' as const, unit: 'pp of widgets' }] };
    expect(() => leverReport(ref, { months: 12, levers: ['govSpending'], spec, expectations: null })).toThrow(/pp of widgets/);
  });

  test('the reference fiscal headlines are ratios to current GDP, like the debt indicators', () => {
    const r = report();
    for (const id of ['deficit', 'bankEquity']) expect(r.headlines.find((h) => h.id === id)!.unit).toBe('pp of GDP');
    const k = r.headlines.findIndex((h) => h.id === 'deficit');
    const run = r.levers.find((s) => s.id === 'taxRate')!.runs.find((x) => x.mode === 'Manual' && x.roles.includes('min'))!;
    const mode = ref.def.stabiliserMode!;
    const modeEv = { t: 0, lever: mode.lever, value: mode.manual };
    const shocked = runScenario(ref, [modeEv, { t: 0, lever: 'taxRate', value: run.value }], 240);
    const none = runScenario(ref, [modeEv], 240);
    const ratio = (x: typeof none, t: number) => (100 * x.value('deficit', t)) / x.value('gdp', t);
    expect(run.headlines[k].at[HORIZONS.indexOf(240)]).toBeCloseTo(ratio(shocked, 240) - ratio(none, 240), 9);
    // the credit impulse is a nominal flow, and the report says so
    expect(r.indicators.find((h) => h.id === 'creditImpulse')!.unit).toBe('pp of baseline GDP');
    expect(r.unitNotes.map((n) => n.id)).toEqual(['creditImpulse']);
  });
});

describe('what the report cannot see, and levers that need help', () => {
  test('rules that combine terms non-additively without a regime label are listed as kinks not traced', () => {
    expect(untracedRules(ref)).toEqual([]);
    const u = untracedRules(ice);
    expect(u).toContain('employmentFC');
    expect(u).toContain('exportVolumeTourism');
    for (const id of u) {
      const rule = ice.rules.find((r) => r.id === id)!;
      expect(rule.combine).toBeDefined();
      expect(rule.regime).toBeUndefined();
    }
    const r = leverReport(ice, { months: 12, levers: ['vat'], expectations: null });
    expect(r.untraced).toEqual(u);
    expect(renderLeverMarkdown(r)).toContain('Kinks not traced: ');
  });

  test('a lever that moves nothing is inert; its companion shock gives it something to act on', () => {
    const r = leverReport(ice, {
      months: 36,
      levers: ['migration'],
      expectations: [{ lever: 'migration', setting: 'min', mode: 'Manual', variable: 'unemployment', fromMonth: 3, toMonth: 24, sign: 1, theory: 'Without the buffer, residents take the job losses.', source: 'test', withCompanion: true }],
    });
    const s = r.levers[0];
    expect(s.crossFlags.filter((f) => f.kind === 'inert' && !f.companion)).toHaveLength(1);
    expect(s.companion).toMatchObject({ lever: 'foreignDemand', value: -20 });
    expect(s.companionRuns).toHaveLength(s.runs.length);
    expect(s.crossFlags.some((f) => f.kind === 'inert' && f.companion)).toBe(false);
    const k = r.headlines.findIndex((h) => h.id === 'unemployment');
    const min = s.companionRuns.find((x) => x.mode === 'Manual' && x.roles.includes('min'))!;
    expect(min.companion).toBe(true);
    expect(min.headlines[k].peak).toBeGreaterThan(0.1);
    // measured against the companion alone, so the effect is the buffer's, not the demand shock's
    const mode = ice.def.stabiliserMode!;
    const modeEv = { t: 0, lever: mode.lever, value: mode.manual };
    const extra = { t: 0, lever: 'foreignDemand', value: -20 };
    const both = runScenario(ice, [modeEv, extra, { t: 0, lever: 'migration', value: 0 }], 36);
    const alone = runScenario(ice, [modeEv, extra], 36);
    expect(min.headlines[k].at[HORIZONS.indexOf(12)]).toBeCloseTo(100 * (both.value('unemployment', 12) - alone.value('unemployment', 12)), 9);
    expect(r.expectations![0]).toMatchObject({ pass: true, withCompanion: true });
    expect(r.expectations![0].checks).toHaveLength(1);
    expect(renderLeverMarkdown(r)).toContain(', with Foreign demand -20 %');
  });

  test('a runaway headline is extreme; a routine one is not', () => {
    const r = report();
    const tax = r.levers.find((s) => s.id === 'taxRate')!;
    const kinds = (roles: string, mode: string) => tax.runs.find((x) => x.mode === mode && x.roles.includes(roles))!.flags.map((f) => f.kind);
    // a 3-point tax cut on Manual more than doubles the price level in 20 years
    expect(kinds('min', 'Manual')).toContain('extreme');
    expect(kinds('up', 'Automatic')).not.toContain('extreme');
  });
});

test('another horizon writes its own, git-ignored, report files', () => {
  expect(reportName('iceland', DEFAULT_MONTHS)).toBe('iceland');
  expect(reportName('iceland', 120)).toBe('iceland-120m');
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
    for (const [id, c] of Object.entries(spec.companions ?? {})) {
      expect(m.leverIndex.has(id)).toBe(true);
      expect(m.leverIndex.has(c.lever)).toBe(true);
    }
    for (const id of Object.keys(spec.indicatorUnits ?? {})) expect(m.indicatorIndex.has(id)).toBe(true);
  }
});
