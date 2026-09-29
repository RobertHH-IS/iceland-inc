/**
 * The six test layers of architecture §6, run for one model:
 *
 *   1. compilation      ids, one rule per variable, references, schedule, warnings
 *   2. module tests     each module's own tests, on a fresh engine at the baseline
 *   3. accounting       the four checks across every scenario the harness runs
 *   4. baseline         240 months without a shock: drift of every variable and stock
 *   5. calibration      the model's CalibrationChecks, PASS/FAIL against their ranges
 *   6. robustness       property tests, lever extremes, half-step and tolerance sensitivity,
 *                       determinism, golden scenarios
 */
import type { CalibrationCheck, ModelDef, RunResult, ScenarioEvent } from '../core/types.ts';
import { compile, CompileError, type KModel } from '../core/compile.ts';
import { createEngine, type KernelEngine } from '../core/engine.ts';
import { runScenario } from '../core/scenario.ts';
import { CHECKS, DEFAULT_TOLERANCE } from '../core/checks.ts';
import { baselineReport, type BaselineReport } from '../core/steady.ts';
import { compareGolden, nonFiniteValues, readGolden, writeGolden, GOLDEN_ABS, GOLDEN_REL, type GoldenFile } from './golden.ts';
import { firstNonFinite, plausibilityBounds, plausibilityBreaches, type Breach } from './plausibility.ts';
import { allLeversScenarios, leverExtremeRuns, timingShock, type HarnessScenario } from './scenarios.ts';
import { rng } from './rng.ts';

export interface HarnessOptions {
  updateGolden: boolean;
  goldenDir: string;
  propertyRuns: number;
  propertyMonths: number;
  seed: number;
  /** Months of each lever-extremes run. */
  extremeMonths: number;
}

export interface LayerResult {
  n: number;
  title: string;
  pass: boolean;
  /** One line for the summary. */
  summary: string;
  /** Markdown for the report. */
  body: string[];
}

export interface HarnessResult {
  modelId: string;
  label: string;
  pass: boolean;
  layers: LayerResult[];
  microsPerStep: number;
  /** What the step timing ran: the shock, how many fresh runs of how many months, and the most
   *  solver iterations in a month (above 1 shows the shock kept the simultaneous block working). */
  timing?: { shock: string; runs: number; months: number; maxIterations: number };
  baseline?: BaselineReport;
  model?: KModel;
}

export const DRIFT_TOL = 1e-9;
export const HALF_STEP_TOL = 0.1; // relative change of each continuous calibration measure
/** For a measure near zero a relative change means little, so the change may also be as large as
 *  HALF_STEP_TOL × HALF_STEP_BAND of the width of the check's range (when both ends are finite). */
export const HALF_STEP_BAND = 0.5;
/** A timing measure (CalibrationCheck.kind 'timing', in whole quarters) may move by one quarter. */
export const HALF_STEP_TIMING_TOL = 1;
export const SOLVER_TOL_TOL = 1e-6; // indicator change when the solver tolerance is loosened

const e2 = (x: number) => (Number.isFinite(x) ? x.toExponential(2) : String(x));
const f = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const verdict = (ok: boolean) => (ok ? 'PASS' : 'FAIL');

/**
 * How far a calibration measure moved when the time step was halved, as a share of what is
 * allowed (at most 1 passes; NaN fails). A timing measure may move by HALF_STEP_TIMING_TOL
 * quarters; any other by HALF_STEP_TOL of its value, or of HALF_STEP_BAND × the width of its
 * range when that is larger (a measure near zero).
 */
export function halfStepShare(c: CalibrationCheck, v: number, vh: number): number {
  if (c.kind === 'timing') return Math.abs(vh - v) / HALF_STEP_TIMING_TOL;
  const width = Number.isFinite(c.range[0]) && Number.isFinite(c.range[1]) ? c.range[1] - c.range[0] : 0;
  return Math.abs(vh - v) / Math.max(Math.abs(v), HALF_STEP_BAND * width, 1e-9) / HALF_STEP_TOL;
}

/**
 * Make every fork of `e`, and every fork of those, land in `kids`, so the accounting layer can
 * check runs a module test makes on forks. Track them after the test: it keeps stepping them.
 */
function collectForks(e: KernelEngine, kids: KernelEngine[]): KernelEngine {
  const fork = e.fork.bind(e);
  e.fork = (o) => {
    const c = fork(o);
    kids.push(c);
    return collectForks(c, kids);
  };
  return e;
}

interface Tracked {
  name: string;
  months: number;
  residuals: { id: string; residual: number }[];
  failures: number;
}

export function runHarness(def: ModelDef, opts: HarnessOptions): HarnessResult {
  const layers: LayerResult[] = [];
  const out: HarnessResult = { modelId: def.id, label: def.label, pass: false, layers, microsPerStep: 0 };
  const notRun = (n: number, title: string, why: string): LayerResult => ({ n, title, pass: false, summary: `not run: ${why}`, body: [`Not run: ${why}.`] });

  /* ---------------------------------------------------------- 1. compile */
  let m: KModel;
  try {
    m = compile(def);
  } catch (e) {
    const errs = e instanceof CompileError ? e.errors : [(e as Error).message];
    layers.push({ n: 1, title: 'Compilation', pass: false, summary: `${errs.length} error(s)`, body: ['Errors:', '', ...errs.map((x) => `- ${x}`)] });
    for (const [n, t] of [[2, 'Module tests'], [3, 'Accounting'], [4, 'Baseline'], [5, 'Calibration'], [6, 'Robustness']] as const) layers.push(notRun(n, t, 'the model does not compile'));
    return out;
  }
  out.model = m;
  const blocks = m.schedule.filter((b) => b.simultaneous);
  const counts = `${m.players.length} players, ${m.instruments.length} instruments, ${m.vars.length} variables, ${m.params.length} parameters, ${m.rules.length} rules, ${m.flows.length} flows (${m.clegs.length} legs), ${m.levers.length} levers, ${m.indicators.length} indicators, ${m.concepts.length} concepts`;
  layers.push({
    n: 1,
    title: 'Compilation',
    pass: true,
    summary: `${m.vars.length} variables, ${blocks.length} simultaneous block(s), ${m.warnings.length} warning(s)`,
    body: [
      `Compiled: ${counts}.`,
      '',
      `Schedule: ${m.schedule.length} blocks, ${blocks.length} simultaneous${blocks.length ? ': ' + blocks.map((b) => `[${b.rules.join(', ')}]`).join('; ') : ''}.`,
      '',
      m.warnings.length ? `Warnings (${m.warnings.length}):` : 'Warnings: none.',
      '',
      ...m.warnings.map((w) => `- ${w}`),
    ],
  });

  /* ---------------------------------------------- baseline and tracking */
  let engine: KernelEngine;
  try {
    engine = createEngine(m);
  } catch (e) {
    layers.push(notRun(2, 'Module tests', 'the baseline could not be solved'));
    layers.push(notRun(3, 'Accounting', 'the baseline could not be solved'));
    layers.push({ n: 4, title: 'Baseline', pass: false, summary: 'baseline solve failed', body: [`The baseline could not be solved: ${(e as Error).message}`] });
    layers.push(notRun(5, 'Calibration', 'the baseline could not be solved'));
    layers.push(notRun(6, 'Robustness', 'the baseline could not be solved'));
    return out;
  }
  out.baseline = baselineReport(m, engine.baselineData);
  const tracked: Tracked[] = [];
  const track = (name: string, e: KernelEngine) => tracked.push({ name, months: e.t, residuals: e.maxResiduals(), failures: e.checks().failures!.length });
  const run = (name: string, events: ScenarioEvent[], months: number, eng: KernelEngine = engine) => {
    const r = runScenario(eng, events, months);
    track(name, r.engine);
    return r;
  };

  /* ----------------------------------------------------- 2. module tests */
  {
    const rows: string[] = [];
    let n = 0,
      ok = 0;
    for (const mod of def.modules)
      for (const t of mod.tests ?? []) {
        n++;
        let pass = false,
          detail = '';
        const kids: KernelEngine[] = [];
        const fresh = collectForks(createEngine(m, { baseline: engine.baselineData }), kids);
        try {
          const r = t.run(fresh);
          pass = r.pass;
          detail = r.detail;
        } catch (e) {
          detail = `threw: ${(e as Error).message}`;
        }
        if (pass) ok++;
        track(`module test ${mod.id}/${t.id}`, fresh);
        kids.forEach((c, i) => track(`module test ${mod.id}/${t.id}, fork ${i + 1}`, c));
        rows.push(`| ${mod.id} | ${t.label} | ${verdict(pass)} | ${detail.replace(/\|/g, '/')} |`);
      }
    layers.push({
      n: 2,
      title: 'Module tests',
      pass: ok === n,
      summary: `${ok}/${n} pass`,
      body: n ? ['| Module | Test | Result | Detail |', '|---|---|---|---|', ...rows] : ['The model has no module tests.'],
    });
  }

  /* ------------------------------------------------ 4. baseline (drift) */
  let layer4: LayerResult;
  {
    const e = createEngine(m, { baseline: engine.baselineData });
    const months = 240;
    e.step(months);
    track('baseline, 240 months', e);
    const drift: { id: string; d: number }[] = [];
    for (const v of m.vars) {
      let d = 0;
      for (let t = 0; t <= months; t++) d = Math.max(d, Math.abs(e.valueAt(v.id, t) - e.baseline(v.id)));
      drift.push({ id: `variable ${v.id}`, d: Number.isNaN(d) ? Infinity : d });
    }
    const p0 = e.positionsAt(0);
    m.instruments.forEach((ins, i) =>
      m.players.forEach((pl, p) => {
        const j = i * m.NP + p;
        if (!m.role[j]) return;
        let d = 0;
        for (let t = 0; t <= months; t++) d = Math.max(d, Math.abs(e.positionsAt(t)[j] - p0[j]));
        drift.push({ id: `stock ${ins.id} / ${pl.id}`, d: Number.isNaN(d) ? Infinity : d });
      }),
    );
    drift.sort((a, b) => b.d - a.d);
    const worst = drift[0]?.d ?? 0;
    const b = out.baseline!;
    const ok = worst < DRIFT_TOL && b.residual < 1e-9;
    layer4 = {
      n: 4,
      title: 'Baseline',
      pass: ok,
      summary: `drift ${e2(worst)} over ${months} months (solver residual ${e2(b.residual)})`,
      body: [
        `Solver: ${b.method}, ${b.iterations} iteration(s), ${b.unknowns} unknowns, largest residual ${e2(b.residual)}.`,
        '',
        `Solved parameters: ${Object.entries(b.solved).map(([k, v]) => `${k} = ${f(v, 6)}`).join(', ') || 'none'}.`,
        '',
        `Targets: ${b.targets.map((t) => `${t.describe} (residual ${e2(t.residual)})`).join('; ') || 'none'}.`,
        '',
        `No-shock run of ${months} months: largest drift of ${m.vars.length} variables and ${drift.length - m.vars.length} stock positions is ${e2(worst)} (limit ${e2(DRIFT_TOL)}): ${verdict(ok)}.`,
        '',
        '| Largest drifts | Max abs change |',
        '|---|---|',
        ...drift.slice(0, 5).map((x) => `| ${x.id} | ${e2(x.d)} |`),
      ],
    };
  }

  /* ----------------------------------------------------- 5. calibration */
  const calib = def.calibration ?? [];
  const measures: number[] = [];
  let layer5: LayerResult;
  {
    const rows: string[] = [];
    let ok = 0;
    // A measure may run a comparison scenario on its run's engine (runScenario keeps the engine's
    // options); the harness cannot track that run, so a failed check in it throws instead.
    const calEngine = createEngine(m, { baseline: engine.baselineData, onCheckFailure: 'throw' });
    for (const c of calib) {
      let v = NaN,
        pass = false,
        note = '';
      try {
        const r = run(`calibration ${c.id}`, c.scenario, c.months, calEngine);
        v = c.measure(r);
        pass = v >= c.range[0] && v <= c.range[1];
      } catch (e) {
        note = ` (threw: ${(e as Error).message})`;
      }
      measures.push(v);
      if (pass) ok++;
      rows.push(`| ${c.id} | ${c.label} | ${f(v)}${note} | ${c.range[0]} to ${c.range[1]} | ${c.source ?? ''} | ${verdict(pass)} |`);
    }
    layer5 = {
      n: 5,
      title: 'Calibration',
      pass: ok === calib.length,
      summary: `${ok}/${calib.length} pass`,
      body: calib.length ? ['| Check | Scenario and measure | Result | Range | Source | Verdict |', '|---|---|---|---|---|---|', ...rows] : ['The model has no calibration checks.'],
    };
  }

  /* ------------------------------------------------------ 6. robustness */
  const body6: string[] = [];
  let pass6 = true;
  const sum6: string[] = [];
  const levers = m.levers;
  // What every property, lever-extremes and golden run must satisfy: finite values, passing
  // accounting checks, plausible values and positions with the right sign (decision 0005).
  const bounds = plausibilityBounds(m);
  let worstRes = 0;
  const inspect = (name: string, events: ScenarioEvent[], months: number): { why: string; breaches: Breach[] } => {
    try {
      const e = run(name, events, months).engine;
      for (const x of e.maxResiduals()) worstRes = Math.max(worstRes, x.residual);
      const fails = e.checks().failures!.length;
      const why = firstNonFinite(m, e) || (fails ? `${fails} accounting failure(s)` : '');
      return { why, breaches: plausibilityBreaches(m, e, bounds) };
    } catch (err) {
      return { why: `threw: ${(err as Error).message}`, breaches: [] };
    }
  };
  const failNote = (b: Breach[]) => `${b.length} implausible value(s) or wrong-signed position(s), first ${b[0].what} (${b[0].rule}) at month ${b[0].first}, furthest ${f(b[0].worst, 4)}`;
  const signTol = engine.checks().signTolerance ?? 0;
  const exempt = m.instruments.flatMap((ins) => (ins.mayGoNegative ? [`\`${ins.id}\`${ins.mayGoNegative.players ? ` (${ins.mayGoNegative.players.join(', ')})` : ''}`] : []));
  const plausibleNote = `Plausibility: ${bounds.length} bounds on variables (${[...new Set(bounds.map((b) => b.rule))].map((r) => `${bounds.filter((b) => b.rule === r).map((b) => `\`${b.id}\``).join(', ')} ${r}`).join('; ')}), and the kernel's position-sign diagnostic: a holder's asset and an issuer's liability at least −${e2(signTol)} (exempt, decision 0005: ${exempt.join(', ') || 'none'}). Any breach fails the run`;
  // 6a. property tests
  {
    const rand = rng(opts.seed);
    let ok = 0;
    const bad: string[] = [];
    for (let k = 0; k < opts.propertyRuns; k++) {
      const nEv = 1 + Math.floor(rand() * 4);
      const events: ScenarioEvent[] = [];
      for (let j = 0; j < nEv; j++) {
        const l = levers[Math.floor(rand() * levers.length)];
        const lo = l.min ?? l.default - 1,
          hi = l.max ?? l.default + 1;
        const value = Math.round((lo + rand() * (hi - lo)) * 1000) / 1000;
        events.push(l.kind === 'oneoff' ? { t: Math.floor(rand() * 25), lever: l.id, value, fire: true } : { t: Math.floor(rand() * 25), lever: l.id, value });
      }
      events.sort((a, b) => a.t - b.t);
      const { why, breaches } = inspect(`property run ${k + 1}`, events, opts.propertyMonths);
      if (why || breaches.length) bad.push(`- run ${k + 1}: ${why || failNote(breaches)}; events ${JSON.stringify(events)}`);
      else ok++;
    }
    const pass = ok === opts.propertyRuns;
    pass6 &&= pass;
    sum6.push(`property ${ok}/${opts.propertyRuns}`);
    body6.push(
      '### Property tests',
      '',
      `${opts.propertyRuns} runs of ${opts.propertyMonths} months, each with 1 to 4 random lever events (values uniform within each lever's range, months 0 to 24; seed ${opts.seed}). Every variable, stock and chart must stay finite and every accounting check must pass. ${plausibleNote}. Largest residual: ${e2(worstRes)}. ${ok}/${opts.propertyRuns} pass: ${verdict(pass)}.`,
      '',
      ...bad.slice(0, 10),
      '',
    );
  }
  // 6b. lever extremes
  {
    const t0 = performance.now();
    const runs = leverExtremeRuns(m);
    let ok = 0;
    const bad: string[] = [];
    const rows: string[] = [];
    let nBreach = 0;
    const affected = new Set<string>();
    for (const x of runs) {
      const setting = `${x.lever} = ${x.value}${x.mode ? `, ${x.mode}` : ''}`;
      const { why, breaches } = inspect(`lever extreme ${setting}`, x.events, opts.extremeMonths);
      if (why || breaches.length) bad.push(`- ${setting}: ${why || failNote(breaches)}`);
      else ok++;
      nBreach += breaches.length;
      for (const b of breaches) {
        affected.add(`${b.kind}:${b.what}`);
        rows.push(`| ${x.lever} | ${x.value} | ${x.mode || '–'} | ${b.what} (${b.rule}) | ${b.first} | ${f(b.worst, 4)} |`);
      }
    }
    const seconds = (performance.now() - t0) / 1000;
    const pass = ok === runs.length;
    pass6 &&= pass;
    sum6.push(`extremes ${ok}/${runs.length} (${nBreach} breach(es))`);
    const modes = def.stabiliserMode ? ', in each stabiliser mode that shows the lever' : '';
    body6.push(
      '### Lever extremes',
      '',
      `Every lever alone at its min and at its max (a choice: each option other than its default), from month 0 for ${opts.extremeMonths} months${modes}: ${runs.length} runs in ${f(seconds, 1)} s. Every variable, stock and chart must stay finite and every accounting check must pass. ${plausibleNote}. ${ok}/${runs.length} pass: ${verdict(pass)}.`,
      '',
      ...bad.slice(0, 10),
      '',
      rows.length ? `${rows.length} breach(es) of ${affected.size} bound(s) or position(s):` : 'No implausible values and no wrong-signed positions.',
      '',
      ...(rows.length ? ['| Lever | Value | Mode | Breach | First month | Furthest value |', '|---|---|---|---|---|---|', ...rows] : []),
      '',
    );
  }
  // 6c. half-step sensitivity
  {
    const rows: string[] = [];
    let worstRel = 0,
      worstQuarters = 0;
    let ok = true;
    let half: KernelEngine | null = null;
    try {
      half = createEngine({ ...def, dt: def.dt / 2 }, { onCheckFailure: 'throw' });
    } catch (err) {
      ok = false;
      rows.push(`| (half-step model) | | | threw: ${(err as Error).message} | FAIL |`);
    }
    if (half)
      calib.forEach((c, j) => {
        let vh = NaN,
          note = '';
        try {
          const events = c.scenario.map((e) => ({ ...e, t: e.t * 2 }));
          const r = run(`half-step ${c.id}`, events, c.months * 2, half);
          // The engine lets a measure's own comparison run (calibration.ts fundsFinancedRun) use the same step.
          const sub: RunResult & { engine: KernelEngine } = {
            months: c.months,
            series: (id) => r.series(id).filter((_, t) => t % 2 === 0),
            value: (id, month) => r.value(id, month * 2),
            engine: r.engine,
          };
          vh = c.measure(sub);
        } catch (err) {
          note = ` (threw: ${(err as Error).message})`;
        }
        const v = measures[j];
        const share = halfStepShare(c, v, vh);
        const pass = share <= 1;
        ok &&= pass;
        let change: string;
        if (c.kind === 'timing') {
          worstQuarters = Math.max(worstQuarters, Math.abs(vh - v));
          change = `${f(vh - v, 0)} quarter(s)`;
        } else {
          const rel = share * HALF_STEP_TOL;
          worstRel = Math.max(worstRel, Number.isNaN(rel) ? Infinity : rel);
          change = `${f(100 * rel, 1)}%`;
        }
        rows.push(`| ${c.id} | ${f(v)} | ${f(vh)}${note} | ${change} | ${verdict(pass)} |`);
      });
    pass6 &&= ok;
    sum6.push(`half-step ${f(100 * worstRel, 1)}%${calib.some((c) => c.kind === 'timing') ? ` and ${f(worstQuarters, 0)} quarter(s)` : ''}`);
    body6.push(
      '### Half-step sensitivity',
      '',
      `Each calibration scenario rerun with half the time step (dt = ${def.dt / 2}). A timing measure (the quarter of a peak or trough) may move by ${HALF_STEP_TIMING_TOL} quarter; any other measure by at most ${100 * HALF_STEP_TOL}% of its value, or ${100 * HALF_STEP_TOL * HALF_STEP_BAND}% of the width of its target range when that is larger (a measure near zero). ${verdict(ok)}.`,
      '',
      '| Check | dt | dt / 2 | Change | Verdict |',
      '|---|---|---|---|---|',
      ...rows,
      '',
    );
  }
  // 6d. solver-tolerance sensitivity and 6e. determinism
  {
    let worstTol = 0;
    let deterministic = true;
    const notes: string[] = [];
    const scen: { id: string; events: ScenarioEvent[]; months: number }[] = calib.length ? calib.map((c) => ({ id: c.id, events: c.scenario, months: c.months })) : [{ id: 'baseline', events: [], months: 60 }];
    for (const s of scen) {
      const a = run(`tolerance ref ${s.id}`, s.events, s.months);
      const loose = run(`tolerance 1e-9 ${s.id}`, s.events, s.months, createEngine(m, { baseline: engine.baselineData, solverTol: 1e-9 }));
      for (const ind of m.indicators) {
        const x = a.series(ind.id),
          y = loose.series(ind.id);
        for (let t = 0; t < x.length; t++) worstTol = Math.max(worstTol, Math.abs(x[t] - y[t]));
      }
      // determinism: a completely fresh model, compiled and solved again
      const b = run(`determinism ${s.id}`, s.events, s.months, createEngine(compile(def)));
      for (let t = 0; t <= s.months && deterministic; t++)
        for (const v of m.vars)
          if (!Object.is(a.value(v.id, t), b.value(v.id, t))) {
            deterministic = false;
            notes.push(`- ${s.id}: ${v.id} differs at month ${t}`);
            break;
          }
    }
    // seek equals a straight run
    const s0 = scen[0];
    const straight = run('seek reference', s0.events, s0.months);
    const sk = createEngine(m, { baseline: engine.baselineData });
    sk.load({ modelId: m.def.id, events: s0.events, months: s0.months });
    const mid = Math.floor(s0.months / 2) + 1;
    sk.seek(mid);
    let seekOk = m.vars.every((v) => Object.is(sk.value(v.id), straight.value(v.id, mid)));
    sk.seek(s0.months);
    seekOk &&= m.vars.every((v) => Object.is(sk.value(v.id), straight.value(v.id, s0.months)));
    track('seek replay', sk);
    const tolOk = worstTol < SOLVER_TOL_TOL;
    pass6 &&= tolOk && deterministic && seekOk;
    sum6.push(`tolerance ${e2(worstTol)}`, deterministic && seekOk ? 'deterministic' : 'NOT deterministic');
    body6.push(
      '### Solver tolerance',
      '',
      `Loosening the Gauss–Seidel tolerance from 1e-12 to 1e-9 moves any indicator by at most ${e2(worstTol)} (limit ${e2(SOLVER_TOL_TOL)}): ${verdict(tolOk)}.`,
      '',
      '### Determinism',
      '',
      `Each scenario run twice from independently compiled and solved models gives bit-identical variables: ${verdict(deterministic)}. Seeking back to month ${mid} and forward again reproduces the straight run exactly: ${verdict(seekOk)}.`,
      '',
      ...notes,
      '',
    );
  }
  // 6f. golden scenarios
  {
    const scen: HarnessScenario[] = [{ name: 'baseline', events: [], months: 24 }];
    for (const c of calib) scen.push({ name: `calibration-${c.id}`, events: c.scenario, months: c.months });
    scen.push(...allLeversScenarios(m));
    const rows: string[] = [];
    let ok = 0;
    for (const s of scen) {
      // An event at or after the last month never reaches the recorded history (events apply after recording).
      const late = s.events.filter((e) => e.t >= s.months);
      if (late.length) {
        rows.push(`| ${s.name} | | ${late.length} event(s) at or after month ${s.months} would never apply, first ${late[0].lever} at ${late[0].t} | FAIL |`);
        continue;
      }
      const r = run(`golden ${s.name}`, s.events, s.months);
      // A golden path must be one a real economy could take: plausible values, right-signed positions.
      const breaches = plausibilityBreaches(m, r.engine, bounds);
      if (breaches.length) {
        rows.push(`| ${s.name} | ${opts.updateGolden ? 'not written' : 'not compared'} | ${failNote(breaches)} | FAIL |`);
        continue;
      }
      const g: GoldenFile = { format: 'iceland-inc/golden@1', modelId: m.def.id, scenario: s.name, months: s.months, events: s.events, indicators: {} };
      for (const ind of m.indicators) g.indicators[ind.id] = r.series(ind.id);
      if (opts.updateGolden) {
        const bad = nonFiniteValues(g);
        if (bad.length) {
          rows.push(`| ${s.name} | not written | ${bad.length} value(s) not finite, first ${bad[0]} | FAIL |`);
          continue;
        }
        writeGolden(opts.goldenDir, g);
        ok++;
        rows.push(`| ${s.name} | written | | PASS |`);
        continue;
      }
      const stored = readGolden(opts.goldenDir, m.def.id, s.name);
      if (!stored) {
        rows.push(`| ${s.name} | missing (run \`bun run harness --update-golden\`) | | FAIL |`);
        continue;
      }
      const c = compareGolden(stored, g);
      if (c.pass) ok++;
      rows.push(`| ${s.name} | ${e2(c.diff)} (${f(c.ratio, 2)} × tolerance) | ${c.where} | ${verdict(c.pass)} |`);
    }
    const pass = ok === scen.length;
    pass6 &&= pass;
    sum6.push(`golden ${ok}/${scen.length}${opts.updateGolden ? ' (updated)' : ''}`);
    body6.push(
      '### Golden scenarios',
      '',
      `Stored indicator paths in \`tests/golden/${m.def.id}/\`, compared point by point with tolerance ${GOLDEN_ABS} + ${GOLDEN_REL} × |stored value|; a stored or new value that is not a finite number fails, and so does a run with an implausible value or a wrong-signed position (the checks of the lever extremes). The table shows the point furthest outside, or nearest to, its tolerance. The all-levers scenarios move every lever in turn, one every 3 months, and run 36 months past the last${def.stabiliserMode ? ', once in each stabiliser mode, moving only the levers that mode shows' : ''}. ${opts.updateGolden ? 'Updated in this run.' : ''}`,
      '',
      '| Scenario | Difference at the worst point | Where | Verdict |',
      '|---|---|---|---|',
      ...rows,
      '',
    );
  }
  const layer6: LayerResult = { n: 6, title: 'Robustness', pass: pass6, summary: sum6.join(', '), body: body6 };

  /* ------------------------------------------------------ 3. accounting */
  {
    const worst: Record<string, number> = {};
    for (const c of CHECKS) worst[c.id] = 0;
    let failures = 0;
    let steps = 0;
    for (const t of tracked) {
      steps += t.months;
      failures += t.failures;
      for (const r of t.residuals) worst[r.id] = Math.max(worst[r.id], r.residual);
    }
    const max = Math.max(...Object.values(worst));
    const ok = failures === 0 && max <= DEFAULT_TOLERANCE;
    layers.push({
      n: 3,
      title: 'Accounting',
      pass: ok,
      summary: `max residual ${e2(max)} over ${tracked.length} runs (${steps} months)`,
      body: [
        `All four checks after every step of every run the harness makes, including the forks module tests make: ${tracked.length} runs, ${steps} months in total. Tolerance ${DEFAULT_TOLERANCE}. Failed steps: ${failures}. ${verdict(ok)}. A comparison run that a calibration measure makes itself is not counted here; a failed check in it throws, which fails that check.`,
        '',
        '| Check | Largest residual |',
        '|---|---|',
        ...CHECKS.map((c) => `| ${c.label} | ${e2(worst[c.id])} |`),
      ],
    });
  }
  layers.push(layer4, layer5, layer6);
  layers.sort((a, b) => a.n - b.n);

  // timing: fresh runs under a shock, timed through its transient, after one run to warm up the JIT
  {
    const shock = timingShock(m);
    const runs = 10,
      months = 120;
    const shocked = () => {
      const e = createEngine(m, { baseline: engine.baselineData });
      shock?.apply(e);
      return e;
    };
    shocked().step(months);
    let ms = 0,
      maxIterations = 0;
    for (let k = 0; k < runs; k++) {
      const e = shocked();
      const t0 = performance.now();
      e.step(months);
      ms += performance.now() - t0;
      maxIterations = Math.max(maxIterations, e.stats().maxIterations);
    }
    out.microsPerStep = (ms * 1000) / (runs * months);
    out.timing = { shock: shock?.describe ?? 'no shock (the model has no lever to shock it with)', runs, months, maxIterations };
  }
  out.pass = layers.every((l) => l.pass);
  return out;
}
