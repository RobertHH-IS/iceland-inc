/**
 * The lever-response report (src/harness/lever-report.ts): which settings it runs, that it
 * measures every effect against the no-change run in the same lock configuration, that it is deterministic,
 * that a run with no event shows no effect at all, and that its flags fire on the paths they
 * describe.
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, type KModel } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { lockAllEvents, runScenario } from '../../src/core/scenario.ts';
import type { LeverDef } from '../../src/core/types.ts';
import { models } from '../../src/models/index.ts';
import { leverReportSpecs } from '../../src/harness/lever-headlines.ts';
import {
  DEFAULT_MONTHS,
  HORIZONS,
  IMPLIED_NEUTRAL_GRID,
  LEVER_THRESHOLDS,
  UNIT_MEANINGS,
  effectOf,
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
    // keyRate: default 3, range 0 to 10, step 0.25: down 3 − 0.75, up 3 + 1.75
    expect(values(lever('keyRate'))).toEqual([0, 2.25, 4.75, 10]);
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

  test('a policy lever runs in every lock configuration; the padlocks are not run as levers, and the report says so', () => {
    const r = report();
    expect(r.modes).toEqual(['unlocked', 'locked']);
    expect(r.locks).toEqual(['keyRateLock', 'taxRateLock']);
    const s = r.levers.find((x) => x.id === 'keyRate')!;
    expect(new Set(s.runs.map((x) => x.mode))).toEqual(new Set(['unlocked', 'locked']));
    expect(r.levers.some((x) => r.locks.includes(x.id))).toBe(false);
    expect(renderLeverMarkdown(r)).toContain('The padlocks (`keyRateLock`, `taxRateLock`) are not run as levers');
  });
});

describe('the reference report', () => {
  test('every lever but the padlocks has a section, with a run per setting and lock configuration', () => {
    const r = report();
    expect(r.levers.map((s) => s.id)).toEqual(ref.levers.filter((l) => l.kind !== 'lock').map((l) => l.id));
    for (const s of r.levers) expect(s.runs.length).toBe(s.settings.length * r.modes.length);
    expect(r.runs).toBe(r.levers.reduce((a, s) => a + s.runs.length, 0));
    expect(r.horizons).toEqual(HORIZONS);
    expect(r.headlines.map((h) => h.id)).toEqual(leverReportSpecs.reference.headlines.map((h) => ('indicator' in h ? h.indicator : h.id)));
    for (const s of r.levers) for (const run of s.runs) expect(run.indicators.map((x) => x.id)).toEqual(ref.indicators.map((i) => i.id));
  });

  test('an effect is the difference from the no-change run in the same lock configuration, month by month', () => {
    const r = report();
    const run = r.levers.find((s) => s.id === 'govSpending')!.runs.find((x) => x.mode === 'locked' && x.roles.includes('max'))!;
    const locked = lockAllEvents(ref);
    const shocked = runScenario(ref, [...locked, { t: 0, lever: 'govSpending', value: run.value }], 240);
    const none = runScenario(ref, locked, 240);
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
    // a price level whose inflation has settled at a steady offset grows linearly: unsettled, not explosive
    const drifting = Array.from({ length: 241 }, (_, t) => 0.05 * t);
    expect(flagsOf(drifting).map((f) => f.kind)).toEqual(['unsettled']);
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

  test('a held policy instrument moved by a lever not its own is flagged; an unlocked one is its rule’s to move', () => {
    // Pretend the key rate belonged to no lever: moving the key rate must then be flagged, in both
    // configurations, since moving it locks it.
    const spec = { ...leverReportSpecs.reference, policy: [{ variable: 'keyRate', label: 'key rate', levers: [], lock: 'keyRateLock' }] };
    const r = leverReport(ref, { months: 24, levers: ['keyRate'], spec, expectations: null });
    const runs = r.levers[0].runs;
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) expect(run.flags.map((f) => f.kind)).toContain('policyMoved');
    // with the real spec, it is the lever's own instrument and nothing is flagged
    const ok = leverReport(ref, { months: 24, levers: ['keyRate'], expectations: null });
    for (const run of ok.levers[0].runs) expect(run.flags.map((f) => f.kind)).not.toContain('policyMoved');
    // government spending moves the key rate only where the Taylor rule is unlocked
    const g = leverReport(ref, { months: 24, levers: ['govSpending'], expectations: null }).levers[0].runs;
    for (const run of g) expect(run.flags.some((f) => f.kind === 'policyMoved')).toBe(false);
    const held = leverReport(ref, { months: 24, levers: ['govSpending'], spec: { ...leverReportSpecs.reference, policy: [{ variable: 'keyRate', label: 'key rate', levers: [] }] }, expectations: null }).levers[0].runs;
    expect(held.filter((run) => run.flags.some((f) => f.kind === 'policyMoved')).map((run) => run.mode)).toEqual(held.filter((run) => run.mode === 'unlocked').map(() => 'unlocked'));
  });

  test('declared expectations are marked ✓ or ✗', () => {
    const r = leverReport(ref, {
      months: 60,
      levers: ['keyRate'],
      expectations: [
        { lever: 'keyRate', setting: 'max', mode: 'unlocked', variable: 'output', fromMonth: 6, toMonth: 36, sign: -1, theory: 'A higher key rate cools demand.', source: 'test' },
        { lever: 'keyRate', setting: 'max', variable: 'output', fromMonth: 6, toMonth: 36, sign: 1, theory: 'Deliberately wrong.', source: 'test' },
        { lever: 'keyRate', setting: 99, variable: 'output', fromMonth: 6, toMonth: 36, sign: 1, theory: 'No such run.', source: 'test' },
      ],
    });
    expect(r.expectations!.map((x) => x.pass)).toEqual([true, false, false]);
    expect(r.expectations![2].checks).toEqual([]);
    const md = renderLeverMarkdown(r);
    expect(md).toContain('✓ output falls over months 6–36');
    expect(md).toContain('✗ output rises over months 6–36');
    expect(md).toContain('no matching run');
  });

  test('the implied neutral rate: where the learned estimate ends at its limit, the constant key rate that leaves inflation on target over the final five years (decision 0012)', () => {
    const r = leverReport(ice, { months: 240, levers: ['health'], expectations: null });
    const runs = r.levers[0].runs;
    const up = runs.find((x) => x.mode === 'unlocked' && x.roles.includes('max'))!;
    const y = up.impliedNeutral!;
    // health +3: the estimate is held at the top of its 0–6% band, and the economy needs more
    expect(y.estimate).toBeCloseTo(y.band[1], 9);
    expect(y.band).toEqual([0, 6]);
    expect(y.rate!).toBeGreaterThan(y.band[1] + 1);
    // held at that rate (the inflation target is 0), inflation over months 180–240 is on target.
    // The scan holds the key rate with the debt rule in its usual form (heldRateFiscal 0), not the
    // form it takes while you hold the key rate (decision 0016), so these runs do too.
    const base = createEngine(ice).fork({ params: { heldRateFiscal: 0 } });
    const mean = (events: { t: number; lever: string; value: number }[]) => {
      const e = runScenario(base, events, 240).engine;
      let s = 0;
      for (let t = 180; t <= 240; t++) s += e.valueAt('inflation12', t) - base.baseline('inflation12');
      return (100 * s) / 61;
    };
    const at = (rate: number) => mean([{ t: 0, lever: 'health', value: 3 }, { t: 0, lever: 'keyRate', value: rate }]);
    expect(Math.abs(at(y.rate!))).toBeLessThan(0.01);
    expect(at(y.rate! - 0.25)).toBeGreaterThan(0);
    expect(at(y.rate! + 0.25)).toBeLessThan(0);
    // the textbook direction, one crossing on the grid; the debt rule's reaction is reported
    expect(y.rising).toBe(false);
    expect(y.crossings).toBe(1);
    expect(y.runs).toBeGreaterThan(Math.round(15 / IMPLIED_NEUTRAL_GRID));
    const run = runScenario(base, [{ t: 0, lever: 'health', value: 3 }, { t: 0, lever: 'keyRate', value: y.rate! }], 240).engine;
    expect(y.tax!).toBeCloseTo(100 * (run.valueAt('taxRate', 240) - base.baseline('taxRate')), 9);
    expect(y.taxRun!).toBeGreaterThan(0);
    expect(y.tax!).toBeGreaterThan(y.taxRun!);
    // only unlocked runs whose estimate ends at its limit; a smaller rise stays inside the band
    expect(runs.filter((x) => x.impliedNeutral).every((x) => x.mode === 'unlocked')).toBe(true);
    expect(runs.find((x) => x.mode === 'unlocked' && x.roles.includes('up'))!.impliedNeutral).toBeUndefined();
    const md = renderLeverMarkdown(r);
    expect(md).toContain('## Implied neutral rates');
    expect(md).toContain(`Implied neutral rate: ${y.rate!.toFixed(2)}% real`);
    // the harness gate leaves it out, and a model without the spec has none
    const gate = leverReport(ice, { months: 240, onlyExpected: true, expectations: [{ lever: 'health', setting: 'max', mode: 'unlocked', variable: 'output', fromMonth: 1, toMonth: 12, sign: 1, theory: 't', source: 's' }] });
    expect(gate.levers[0].runs.some((x) => x.impliedNeutral)).toBe(false);
    expect(report().levers.some((s) => s.runs.some((x) => x.impliedNeutral))).toBe(false);
  }, 60_000);

  test('the implied neutral rate is found where inflation crosses target, even when it crosses more than once or rises with the rate (tourism −60 and health −3, decision 0012)', () => {
    // Held at a constant rate after tourism −60, inflation over months 180–240 crosses target more
    // than once across the key rate's range, so comparing the ends of the range alone would wrongly
    // say no rate works. (Before decision 0015 it also rose with the rate near the crossing; with
    // the debt rule's taxes held through the slump it now falls there.)
    const r = leverReport(ice, { months: 240, levers: ['tourism', 'health'], expectations: null });
    const min = r.levers[0].runs.find((x) => x.mode === 'unlocked' && x.roles.includes('min'))!;
    const y = min.impliedNeutral!;
    expect(y.estimate).toBeCloseTo(y.band[0], 9);
    expect(y.rate).not.toBeNull();
    expect(y.outside).toBeUndefined();
    expect(y.crossings).toBeGreaterThan(1);
    // the crossing nearest the estimate (0%) lies between 1% and 3%, and held there inflation is on target
    expect(y.rate!).toBeGreaterThan(1);
    expect(y.rate!).toBeLessThan(3);
    const base = createEngine(ice).fork({ params: { heldRateFiscal: 0 } });
    const onTarget = (lever: string, value: number, rate: number) => {
      const e = runScenario(base, [{ t: 0, lever, value }, { t: 0, lever: 'keyRate', value: rate }], 240).engine;
      let s = 0;
      for (let t = 180; t <= 240; t++) s += e.valueAt('inflation12', t) - base.baseline('inflation12');
      expect(Math.abs((100 * s) / 61)).toBeLessThan(0.01);
    };
    onTarget('tourism', -60, y.rate!);
    // Health −3 with the rules acting: inflation rises with a held key rate near the crossing
    // (about 9%), the interest-income channel at work, and the report says so.
    const cut = r.levers[1].runs.find((x) => x.mode === 'unlocked' && x.roles.includes('min'))!.impliedNeutral!;
    expect(cut.rising).toBe(true);
    expect(cut.rate!).toBeGreaterThan(cut.band[1]);
    onTarget('health', -3, cut.rate!);
    const md = renderLeverMarkdown(r);
    expect(md).toContain('there, inflation rises with the key rate rather than falls');
    expect(md).not.toContain('does not fall as the rate rises');
  }, 90_000);

  test('a configuration that differs from an earlier one only in the padlock the lever’s own move closes repeats its run: made once, measured, counted once (review ECON-9)', () => {
    const r = leverReport(ice, { months: 24, levers: ['keyRate', 'incomeTax', 'vat'], expectations: null });
    const [key, tax, vat] = r.levers;
    const pairs = (s: typeof key, mode: string, as: string) => {
      const dup = s.runs.filter((x) => x.mode === mode);
      expect(dup.length).toBe(s.settings.length);
      for (const d of dup) {
        expect(d.sameAs).toBe(as);
        const orig = s.runs.find((x) => x.mode === as && x.value === d.value)!;
        expect(orig.sameAs).toBeUndefined();
        // the same run, measured against a no-change run that differs only in rounding (about 5e-13
        // after 240 months): the same effects to the report's precision
        d.headlines.forEach((h, i) => h.at.forEach((v, j) => expect(Math.abs(v - orig.headlines[i].at[j])).toBeLessThan(1e-9)));
      }
    };
    pairs(key, 'key rate locked', 'unlocked'); // setting the key rate locks it
    pairs(tax, 'key rate locked', 'locked'); // setting income tax locks it, and the key rate is locked already
    expect(vat.runs.some((x) => x.sameAs)).toBe(false); // no padlock of its own
    // made once: three configurations of VAT, two of each policy lever
    expect(r.runs).toBe(3 * vat.settings.length + 2 * key.settings.length + 2 * tax.settings.length);
    const md = renderLeverMarkdown(r);
    expect(md).toContain('The same run as in the *unlocked* configuration');
    const row = md.split('\n').find((x) => x.includes('(`keyRate`) |'))!;
    expect(row.split('|')[2].trim()).toBe(String(2 * key.settings.length));
  }, 60_000);

  describe('known limitation (review ECON-5, lever-vetting open item 21, decision 0016): a tax lever held while the central bank’s rule acts', () => {
    // Moving a tax lever locks it; with the key-rate rule still acting, nothing pays a tax cut back,
    // so no stable path exists (Leeper 1991). Decision 0016 measured the evidence-based ways to
    // weaken the interest-income channel: they shrink the runaway but cannot remove it here, because
    // in these zero-growth baselines debt compounds at about 3.5% a year (r − g) on any lasting
    // deficit, which the Explosive test reads as acceleration, and in Iceland the deficit also
    // weakens the króna through non-residents' holdings (lever-vetting item 4). What removes it: a
    // balanced-growth baseline (roadmap v2, r − g near zero), króna stage 2, or a fiscal anchor
    // while the tax is held; the owner decides. Until then the lever panel says so
    // (StabiliserDef.lockedAloneNote) and these pin it.
    const moderate = (m: KModel, id: string) => {
      const spec = { ...leverReportSpecs[m.def.id], impliedNeutral: undefined };
      const r = leverReport(m, { months: 240, levers: [id], expectations: null, spec });
      return r.levers[0].runs.filter((x) => x.mode === 'unlocked' && (x.roles.includes('up') || x.roles.includes('down')));
    };
    const at240 = (run: ReturnType<typeof moderate>[number], id: string) => run.headlines.find((h) => h.id === id)!.at.at(-1)!;

    test.failing('OWNER DECISION PENDING: no moderate tax step with the central bank’s rule acting is Explosive within 240 months (Iceland ±2.5, reference −0.5 and +1)', () => {
      // Expected to fail until one of the fixes above lands; bun reports it as soon as it passes,
      // and then `.failing` comes off with lever-vetting open item 21.
      for (const run of [...moderate(ice, 'incomeTax'), ...moderate(ref, 'taxRate')]) expect(run.flags.some((f) => f.kind === 'explosive')).toBe(false);
    }, 60_000);

    test('tripwire: how far the moderate steps run away after 20 years does not grow', () => {
      // Iceland income tax −2.5: output +3.23%, the price level +13.1% and the key rate +4.8 points
      // at month 240, all still rising; +2.5: the price level −10.8%. Reference −0.5: output +2.07%,
      // the price level +7.3%; +1: the price level −11.9%. Bounds about a fifth above today's.
      const [down, up] = moderate(ice, 'incomeTax');
      expect(at240(down, 'priceLevel')).toBeLessThan(16);
      expect(at240(down, 'output')).toBeLessThan(4);
      expect(at240(down, 'keyRate')).toBeLessThan(6);
      expect(at240(up, 'priceLevel')).toBeGreaterThan(-13.5);
      const [cut, rise] = moderate(ref, 'taxRate');
      expect(at240(cut, 'priceLevel')).toBeLessThan(9);
      expect(at240(cut, 'output')).toBeLessThan(2.5);
      expect(at240(rise, 'priceLevel')).toBeGreaterThan(-14.5);
    }, 60_000);
  });

  test('an expectation that an effect dies out compares its largest move late with its largest earlier (decision 0012)', () => {
    // a one-off wage settlement: inflation jumps in the first year and fades
    const x = { lever: 'wageSettlement', setting: 'max', mode: 'unlocked', variable: 'inflation', fromMonth: 48, toMonth: 60, sign: 0 as const, theory: 'A one-off fades.', source: 'test' };
    const r = leverReport(ref, {
      months: 60,
      onlyExpected: true,
      expectations: [
        { ...x, decays: { earlier: [1, 24], below: 10, share: 0.5 } },
        { ...x, decays: { earlier: [1, 24], below: 0, share: 0.5 } }, // nothing is below 0: deliberately wrong
        { ...x, decays: { earlier: [1, 24], below: 10, share: 0 } }, // nor below 0 × the earlier move
      ],
    });
    const [ok, low, share] = r.expectations!;
    expect([ok.pass, low.pass, share.pass]).toEqual([true, false, false]);
    const c = ok.checks[0];
    // the largest absolute effect in each window, measured as the report measures every effect
    const run = r.levers[0].runs.find((u) => u.mode === 'unlocked')!;
    expect(c.earlier!).toBeGreaterThan(2 * c.mean);
    expect(c.earlier!).toBeCloseTo(Math.abs(run.indicators.find((i) => i.id === 'inflation')!.peak), 12);
    const md = renderLeverMarkdown(r);
    expect(md).toContain('✓ inflation dies out: its largest move over months 48–60 is below 10 and below 0.5 × its largest over months 1–24');
    // a decay test needs sign 0 and an earlier window that ends before the late one
    expect(() => leverReport(ref, { months: 12, onlyExpected: true, expectations: [{ ...x, sign: 1, decays: { earlier: [1, 6], below: 1, share: 0.5 } }] })).toThrow(/dies out needs sign 0/);
    expect(() => leverReport(ref, { months: 60, onlyExpected: true, expectations: [{ ...x, decays: { earlier: [1, 50], below: 1, share: 0.5 } }] })).toThrow(/earlier window/);
  });

  test('with onlyExpected, only the runs an expectation needs are made, through the given runner, with the same results', () => {
    const expectations = [
      { lever: 'keyRate', setting: 'max', mode: 'unlocked', variable: 'output', fromMonth: 6, toMonth: 36, sign: -1, theory: 'A higher key rate cools demand.', source: 'test' },
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
    const full = leverReport(ref, { months: 60, levers: ['keyRate', 'govSpending'], expectations: [...expectations] });
    // two no-change runs, keyRate at its max unlocked, govSpending up in both configurations
    expect(made).toEqual(['', 'keyRateLock=1 taxRateLock=1', 'keyRate=10', 'govSpending=1', 'keyRateLock=1 taxRateLock=1 govSpending=1']);
    expect(r.runs).toBe(3);
    expect(r.levers.map((s) => s.id)).toEqual(['keyRate', 'govSpending']);
    expect(r.expectations).toEqual(full.expectations);
    expect(r.expectations!.every((x) => x.pass)).toBe(true);
  });

  test('an expectation on a padlock is checked by closing or opening it at month 0, with no shock', () => {
    const r = leverReport(ref, {
      months: 60,
      onlyExpected: true,
      expectations: [
        { lever: 'keyRateLock', setting: 1, mode: 'unlocked', variable: 'output', fromMonth: 1, toMonth: 60, sign: 0, theory: 'At the steady state, locking changes nothing.', source: 'test' },
        { lever: 'taxRateLock', setting: 0, mode: 'locked', variable: 'keyRate', fromMonth: 1, toMonth: 60, sign: 1, theory: 'Deliberately wrong.', source: 'test' },
      ],
    });
    expect(r.runs).toBe(2);
    expect(r.levers).toEqual([]);
    expect(r.expectations!.map((x) => x.checks.length)).toEqual([1, 1]);
    expect(r.expectations!.map((x) => x.pass)).toEqual([true, false]);
    const md = renderLeverMarkdown(r);
    expect(md).toContain('The padlocks are checked by closing (1) or opening (0) one at month 0');
    expect(md).toContain('Expectations that do not hold:');
  });

  test('an expectation naming a lock configuration the report does not run stops it', () => {
    expect(() => leverReport(ref, { months: 12, onlyExpected: true, expectations: [{ lever: 'govSpending', setting: 'max', mode: 'Manual', variable: 'output', fromMonth: 1, toMonth: 12, sign: 1, theory: 't', source: 's' }] })).toThrow(/configuration 'Manual'/);
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
    const run = r.levers.find((s) => s.id === 'taxRate')!.runs.find((x) => x.mode === 'locked' && x.roles.includes('min'))!;
    const locked = lockAllEvents(ref);
    const shocked = runScenario(ref, [...locked, { t: 0, lever: 'taxRate', value: run.value }], 240);
    const none = runScenario(ref, locked, 240);
    const ratio = (x: typeof none, t: number) => (100 * x.value('deficit', t)) / x.value('gdp', t);
    expect(run.headlines[k].at[HORIZONS.indexOf(240)]).toBeCloseTo(ratio(shocked, 240) - ratio(none, 240), 9);
    // the credit impulse is a nominal flow, and the report says so
    expect(r.indicators.find((h) => h.id === 'creditImpulse')!.unit).toBe('pp of baseline GDP');
  });
});

describe('what the report cannot see, and levers that need help', () => {
  test('rules that combine terms non-additively without a regime label are listed as kinks not traced', () => {
    // every floor and cap in both models now carries a regime label (review UNTRACED-KINKS)
    expect(untracedRules(ref)).toEqual([]);
    expect(untracedRules(ice)).toEqual([]);
    const floor = { ...ice.rules.find((r) => r.id === 'employmentFC')!, regime: undefined };
    expect(untracedRules({ rules: [floor] })).toEqual(['employmentFC']);
    const r = leverReport(ice, { months: 12, levers: ['vat'], expectations: null });
    expect(r.untraced).toEqual([]);
    expect(renderLeverMarkdown(r)).not.toContain('Kinks not traced: ');
    expect(renderLeverMarkdown({ ...r, untraced: ['employmentFC'] })).toContain('Kinks not traced: `employmentFC`');
  });

  test('a lever that moves nothing is inert; its companion shock gives it something to act on', () => {
    const r = leverReport(ice, {
      months: 36,
      levers: ['migration'],
      expectations: [{ lever: 'migration', setting: 'min', mode: 'locked', variable: 'unemployment', fromMonth: 3, toMonth: 24, sign: 1, theory: 'Without the buffer, residents take the job losses.', source: 'test', withCompanion: true }],
    });
    const s = r.levers[0];
    expect(s.crossFlags.filter((f) => f.kind === 'inert' && !f.companion)).toHaveLength(1);
    expect(s.companion).toMatchObject({ lever: 'foreignDemand', value: -20 });
    expect(s.companionRuns).toHaveLength(s.runs.length);
    expect(s.crossFlags.some((f) => f.kind === 'inert' && f.companion)).toBe(false);
    const k = r.headlines.findIndex((h) => h.id === 'unemployment');
    const min = s.companionRuns.find((x) => x.mode === 'locked' && x.roles.includes('min'))!;
    expect(min.companion).toBe(true);
    expect(min.headlines[k].peak).toBeGreaterThan(0.1);
    // measured against the companion alone, so the effect is the buffer's, not the demand shock's
    const locked = lockAllEvents(ice);
    const extra = { t: 0, lever: 'foreignDemand', value: -20 };
    const both = runScenario(ice, [...locked, extra, { t: 0, lever: 'migration', value: 0 }], 36);
    const alone = runScenario(ice, [...locked, extra], 36);
    expect(min.headlines[k].at[HORIZONS.indexOf(12)]).toBeCloseTo(100 * (both.value('unemployment', 12) - alone.value('unemployment', 12)), 9);
    expect(r.expectations![0]).toMatchObject({ pass: true, withCompanion: true });
    expect(r.expectations![0].checks).toHaveLength(1);
    expect(renderLeverMarkdown(r)).toContain(', with Foreign demand -20 %');
  });

  test('a runaway headline is extreme; a routine one is not', () => {
    const r = report();
    const tax = r.levers.find((s) => s.id === 'taxRate')!;
    const kinds = (roles: string, mode: string) => tax.runs.find((x) => x.mode === mode && x.roles.includes(roles))!.flags.map((f) => f.kind);
    // a 2-point tax cut held with the Taylor rule acting runs away within 20 years (decision 0010)
    expect(kinds('min', 'unlocked')).toContain('extreme');
    expect(kinds('up', 'locked')).not.toContain('extreme');
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
  }
});
