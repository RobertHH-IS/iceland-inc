/**
 * EngineClient: the only way the interface talks to the engine.
 *
 * It runs a KernelEngine on the main thread today. Everything it hands to views is plain,
 * structured-clonable data (ModelInfo once, a Frame per tick, and detail answers such as an
 * Influence or a BalanceSheet), so a Web Worker can implement the same interface later: the
 * worker would post Frames, and the detail methods would answer from the latest results of the
 * queries the views have asked for (see docs/interface.md).
 *
 * The clock: while playing, the client advances one month per tick, recording every indicator
 * month by month for the charts. A tick comes every TICK_MS ÷ speed: at 1× a month every two
 * seconds, at 3× every two-thirds of a second, at 6× every third of a second.
 * setLever and fire start the clock when it is paused. seek moves anywhere between month 0 and
 * the furthest month simulated so far (the horizon); going back replays from the engine's
 * snapshots, so the numbers are identical to a straight run.
 *
 * Padlocks (decision 0010) are levers like any other: locking, unlocking and a lever moved while
 * unlocked (which locks it) are lever events, so they replay, rewind and travel in share links.
 * A scenario written before padlocks (format 1) is migrated as it loads, and load() returns the
 * notices of anything the migration could not carry over.
 */
import { createEngine, type EngineOptions, type KernelEngine } from '../core/engine.ts';
import type { BalanceSheet, FeedEntry, Id, Influence, ModelDef, Pipe, PipeView, Scenario, ScenarioEvent, SignViolation, StabiliserState } from '../core/types.ts';
import { migrateScenario, SCENARIO_VERSION } from '../core/migrate.ts';
import { describeModel, type ModelInfo } from './model/info.ts';

export type Speed = 1 | 3 | 6;
export const SPEEDS: readonly Speed[] = [1, 3, 6];
/** Milliseconds per month at 1×; a speed of 3 or 6 divides it. */
export const TICK_MS = 2000;
/** The clock stops here (100 years): the history of every variable is kept for seek(). */
export const MAX_MONTHS = 1200;

/** A feed message as the kernel gives it: the English sentence, and the rule, direction, value
 *  and change a translation can build its own sentence from (docs/i18n/architecture.md, K1). */
export type FeedItem = FeedEntry;

export interface IdeaWeight {
  concept: Id;
  weight: number;
  via: Id[];
}

export interface ChecksSummary {
  ok: boolean;
  maxResidual: number;
  tolerance: number;
  failures: number;
  items: { id: Id; label: string; residual: number }[];
}

/** What views draw each tick. Arrays keep their identity when their contents did not change. */
export interface Frame {
  seq: number;
  modelId: Id;
  /** Current month (0 = baseline). */
  t: number;
  /** Furthest month simulated so far (the timeline slider's range). */
  horizon: number;
  maxMonths: number;
  playing: boolean;
  speed: Speed;
  /** True once the clock has reached maxMonths. */
  ended: boolean;
  events: readonly ScenarioEvent[];
  /** Current lever values, by LeverInfo.index. */
  levers: readonly number[];
  /** Current leg values, by LegInfo.index (engine.legs() order). */
  legs: Float64Array;
  pipes: { player: Pipe[]; group: Pipe[] };
  checks: ChecksSummary;
  /** Positions that took the wrong sign since the last reset, oldest first (checks().signViolations):
   *  a warning beside the accounting badge, never an accounting failure (decision 0005). */
  signViolations: readonly SignViolation[];
  /** Narration, newest first. */
  feed: readonly FeedItem[];
  /** Active regime of each rule that has one (null when nothing special), by rule id. */
  regimes: Readonly<Record<Id, string | null>>;
  /** Every stabiliser now: whether it is locked, what it suggests, the value in force, and whether
   *  it calls for action (locked, and further from its rule than its threshold). */
  stabilisers: readonly StabiliserState[];
  /** The last action that failed, if any. */
  error: string | null;
}

export interface EngineClient {
  readonly info: ModelInfo;
  subscribe(listener: () => void): () => void;
  getFrame(): Frame;
  /* the clock */
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeed(s: Speed): void;
  step(months?: number): void;
  reset(): void;
  seek(month: number): void;
  /* levers (both start the clock when it is paused) */
  setLever(id: Id, value: number): void;
  fire(id: Id, size?: number): void;
  /* scenarios */
  scenario(): Scenario;
  /** Replay a scenario from the baseline. One written before padlocks (version 1) is migrated
   *  first; the notices say what the migration could not carry over (none otherwise). */
  load(s: Scenario): string[];
  /* details, on demand */
  influences(id: Id): Influence;
  ideasAtPlay(scope?: Id): IdeaWeight[];
  /** A player's balance sheet, or a group's (the sum of its players'). */
  balanceSheet(playerOrGroup: Id): BalanceSheet;
  /** Pipes now, at a level of the player hierarchy or for the groups open on the map. */
  pipes(view: 'player' | 'group' | PipeView): Pipe[];
  /** An indicator in display units, months 0..t. */
  series(indicatorId: Id): readonly number[];
  /** A variable's raw values for months from..to (inclusive, clamped to 0..t). */
  varSeries(varId: Id, from: number, to: number): number[];
  value(varId: Id): number;
  baseline(varId: Id): number;
  dispose(): void;
}

export interface ClientOptions {
  engine?: EngineOptions;
  maxMonths?: number;
  tickMs?: number;
}

const sameEvents = (a: readonly ScenarioEvent[], b: readonly ScenarioEvent[]) =>
  a.length === b.length && a.every((e, i) => e.t === b[i].t && e.lever === b[i].lever && e.value === b[i].value && !!e.fire === !!b[i].fire);

const sameNumbers = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

const sameViolations = (a: readonly SignViolation[], b: readonly SignViolation[]) =>
  a.length === b.length && a.every((x, i) => x.instrument === b[i].instrument && x.player === b[i].player && x.t === b[i].t && Object.is(x.value, b[i].value));

const sameStabilisers = (a: readonly StabiliserState[], b: readonly StabiliserState[]) =>
  a.length === b.length && a.every((x, i) => x.id === b[i].id && Object.is(x.suggested, b[i].suggested) && Object.is(x.current, b[i].current) && x.calling === b[i].calling && x.locked === b[i].locked);

class MainThreadClient implements EngineClient {
  readonly info: ModelInfo;
  private readonly engine: KernelEngine;
  private readonly listeners = new Set<() => void>();
  private readonly maxMonths: number;
  private readonly tickMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private playing = false;
  private speed: Speed = 1;
  private horizon = 0;
  private ended = false;
  private seq = 0;
  private error: string | null = null;
  private hist: number[][] = [];
  private frame!: Frame;
  private readonly regimeRules: { id: Id; target: Id }[];
  /** Each rule's regime at the baseline: a badge only appears when the regime differs from it. */
  private readonly baseRegimes: Record<Id, string | null> = {};

  constructor(source: ModelDef | KernelEngine, opts: ClientOptions = {}) {
    this.engine = 'baselineData' in source ? source : createEngine(source, opts.engine);
    const e = this.engine;
    this.info = describeModel(e.model, (id) => e.baseline(id), e.warnings);
    this.maxMonths = opts.maxMonths ?? MAX_MONTHS;
    this.tickMs = opts.tickMs ?? TICK_MS;
    this.regimeRules = this.info.rules.filter((r) => r.hasRegime).map((r) => ({ id: r.id, target: r.target }));
    if (this.regimeRules.length) {
      const base = createEngine(e.model.def, { dev: false });
      for (const r of this.regimeRules) {
        try {
          this.baseRegimes[r.id] = base.influences(`var:${r.target}`).regime ?? null;
        } catch {
          this.baseRegimes[r.id] = null;
        }
      }
    }
    this.horizon = e.t;
    this.rebuildHistory();
    this.publish(false);
  }

  /* ------------------------------------------------------------ store API */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getFrame = (): Frame => this.frame;

  private publish(notify = true): void {
    const e = this.engine;
    const prev = this.frame as Frame | undefined;
    const levers = this.info.levers.map((l) => e.leverValue(l.id));
    const events = e.events;
    const legList = e.legs();
    const legs = new Float64Array(legList.length);
    legList.forEach((l, i) => (legs[i] = l.value));
    const ck = e.checks();
    const tolerance = ck.tolerance ?? 1e-9;
    const failures = ck.failures?.length ?? 0;
    const checks: ChecksSummary = { ok: failures === 0 && ck.maxResidual <= tolerance, maxResidual: ck.maxResidual, tolerance, failures, items: ck.items };
    const violations = ck.signViolations ?? [];
    const rawFeed = e.feed();
    const feed =
      prev && prev.feed.length === rawFeed.length && (rawFeed.length === 0 || (prev.feed[0].t === rawFeed[rawFeed.length - 1].t && prev.feed[0].message === rawFeed[rawFeed.length - 1].message))
        ? prev.feed
        : rawFeed.reverse();
    const regimes: Record<Id, string | null> = {};
    for (const r of this.regimeRules) {
      try {
        const now = e.influences(`var:${r.target}`).regime ?? null;
        regimes[r.id] = now !== this.baseRegimes[r.id] ? now : null;
      } catch {
        regimes[r.id] = null;
      }
    }
    const sameRegimes = prev && this.regimeRules.every((r) => prev.regimes[r.id] === regimes[r.id]);
    const stabilisers = e.stabilisers();
    this.frame = {
      seq: ++this.seq,
      modelId: this.info.id,
      t: e.t,
      horizon: this.horizon,
      maxMonths: this.maxMonths,
      playing: this.playing,
      speed: this.speed,
      ended: this.ended,
      events: prev && sameEvents(prev.events, events) ? prev.events : events,
      levers: prev && sameNumbers(prev.levers, levers) ? prev.levers : levers,
      legs,
      pipes: { player: e.pipes('player'), group: e.pipes('group') },
      checks,
      signViolations: prev && sameViolations(prev.signViolations, violations) ? prev.signViolations : violations,
      feed,
      regimes: sameRegimes ? prev!.regimes : regimes,
      stabilisers: prev && sameStabilisers(prev.stabilisers, stabilisers) ? prev.stabilisers : stabilisers,
      error: this.error,
    };
    if (notify) for (const fn of [...this.listeners]) fn();
  }

  /** Run an action; record its error (if any) in the next frame instead of throwing into a view. */
  private act(fn: () => void): void {
    try {
      fn();
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
    this.publish();
  }

  /* -------------------------------------------------------------- history */

  private rebuildHistory(): void {
    this.hist = this.info.indicators.map((ind) => this.engine.series(ind.id).map((p) => p.v));
  }

  private record(): void {
    const t = this.engine.t;
    this.info.indicators.forEach((ind, i) => {
      const h = this.hist[i];
      h.length = t;
      h.push(this.engine.indicator(ind.id));
    });
  }

  /** Step month by month (recording every indicator), stopping at maxMonths. */
  private advance(n: number): void {
    for (let k = 0; k < n; k++) {
      if (this.engine.t >= this.maxMonths) {
        this.ended = true;
        this.stopTimer();
        this.playing = false;
        break;
      }
      this.engine.step(1);
      this.record();
      if (this.engine.t > this.horizon) this.horizon = this.engine.t;
    }
  }

  /* ---------------------------------------------------------------- clock */

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick = (): void => {
    if (!this.playing) return;
    this.act(() => this.advance(1));
  };

  private start(): void {
    if (this.engine.t >= this.maxMonths) {
      this.ended = true;
      return;
    }
    this.playing = true;
    if (this.timer === null) this.timer = setInterval(this.tick, this.tickMs / this.speed);
  }

  private halt(): void {
    this.playing = false;
    this.stopTimer();
  }

  play(): void {
    this.start();
    this.publish();
  }

  pause(): void {
    this.halt();
    this.publish();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(s: Speed): void {
    this.speed = SPEEDS.includes(s) ? s : 1;
    if (this.timer !== null) {
      this.stopTimer();
      this.timer = setInterval(this.tick, this.tickMs / this.speed);
    }
    this.publish();
  }

  step(months = 1): void {
    this.halt();
    this.act(() => this.advance(Math.max(1, Math.round(months))));
  }

  reset(): void {
    this.halt();
    this.act(() => {
      this.engine.reset();
      this.horizon = 0;
      this.ended = false;
      this.rebuildHistory();
    });
  }

  seek(month: number): void {
    const target = Math.max(0, Math.min(this.horizon, Math.round(month)));
    if (target === this.engine.t) return;
    this.halt();
    this.act(() => {
      if (target < this.engine.t) {
        this.engine.seek(target);
        for (const h of this.hist) h.length = target + 1;
        this.ended = false;
      } else this.advance(target - this.engine.t);
    });
  }

  /* --------------------------------------------------------------- levers */

  setLever(id: Id, value: number): void {
    this.act(() => {
      this.engine.setLever(id, value);
      if (!this.playing) this.start();
    });
  }

  fire(id: Id, size?: number): void {
    this.act(() => {
      this.engine.fire(id, size);
      if (!this.playing) this.start();
    });
  }

  /* ------------------------------------------------------------ scenarios */

  scenario(): Scenario {
    return { modelId: this.info.id, events: this.engine.events, months: this.engine.t };
  }

  load(s: Scenario): string[] {
    this.halt();
    let notices: string[] = [];
    this.act(() => {
      try {
        const now = (s.version ?? SCENARIO_VERSION) < SCENARIO_VERSION ? migrateScenario(this.engine.model, s) : { scenario: s, notices: [] };
        notices = now.notices;
        this.engine.load({ ...now.scenario, months: Math.min(s.months, this.maxMonths) });
      } catch (err) {
        this.engine.reset();
        this.horizon = 0;
        this.ended = false;
        this.rebuildHistory();
        throw err;
      }
      this.horizon = this.engine.t;
      this.ended = this.engine.t >= this.maxMonths;
      this.rebuildHistory();
    });
    return notices;
  }

  /* -------------------------------------------------------------- details */

  influences(id: Id): Influence {
    return this.engine.influences(id);
  }

  ideasAtPlay(scope?: Id): IdeaWeight[] {
    try {
      return this.engine.ideasAtPlay(scope);
    } catch {
      return this.engine.ideasAtPlay();
    }
  }

  balanceSheet(playerOrGroup: Id): BalanceSheet {
    return this.engine.balanceSheet(playerOrGroup);
  }

  pipes(view: 'player' | 'group' | PipeView): Pipe[] {
    return this.engine.pipes(view);
  }

  series(indicatorId: Id): readonly number[] {
    const i = this.info.indicatorById.get(indicatorId)?.index;
    if (i === undefined) throw new Error(`unknown indicator '${indicatorId}'`);
    return this.hist[i];
  }

  varSeries(varId: Id, from: number, to: number): number[] {
    const a = Math.max(0, Math.round(from)),
      b = Math.min(this.engine.t, Math.round(to));
    const out: number[] = [];
    for (let m = a; m <= b; m++) out.push(this.engine.valueAt(varId, m));
    return out;
  }

  value(varId: Id): number {
    return this.engine.value(varId);
  }

  baseline(varId: Id): number {
    return this.engine.baseline(varId);
  }

  dispose(): void {
    this.halt();
    this.listeners.clear();
  }
}

/** Create a client for a model (compiles it and solves its baseline) or wrap an existing engine. */
export function createEngineClient(source: ModelDef | KernelEngine, opts: ClientOptions = {}): EngineClient {
  return new MainThreadClient(source, opts);
}
