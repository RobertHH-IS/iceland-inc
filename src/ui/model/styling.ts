/**
 * Deviation styling: how a value's distance from its baseline is drawn. Pure functions.
 *
 * Visual grammar (architecture §7): amber glow means above baseline, blue-grey below; particles
 * speed up as a flow grows relative to its baseline; dashed pipes with no particles are
 * accruals, revaluations and write-offs, where no cash moves.
 */
import type { FlowKind } from '../../core/types.ts';

export type Tone = 'up' | 'down' | 'flat';

/** Relative changes smaller than this (0.1%) count as "at baseline". */
export const FLAT_BAND = 0.001;

export interface Deviation {
  /** (value − baseline) / |baseline|, or a signed 1 when the baseline is ~0 and the value is not. */
  rel: number;
  tone: Tone;
  /** 0..1: how strongly to draw the glow (full at a 20% change). */
  intensity: number;
}

export function deviation(value: number, baseline: number, flatBand = FLAT_BAND): Deviation {
  const d = value - baseline;
  let rel: number;
  if (Math.abs(baseline) > 1e-9) rel = d / Math.abs(baseline);
  else rel = Math.abs(d) > 1e-9 ? Math.sign(d) : 0;
  const tone: Tone = rel > flatBand ? 'up' : rel < -flatBand ? 'down' : 'flat';
  const intensity = tone === 'flat' ? 0 : Math.min(1, Math.sqrt(Math.abs(rel) / 0.2));
  return { rel, tone, intensity };
}

/** Tone for an indicator already shown as a deviation (0 = baseline). */
export function signTone(v: number, eps = 0.005): Tone {
  return v > eps ? 'up' : v < -eps ? 'down' : 'flat';
}

/**
 * Particle speed as a playback rate (1 = baseline speed): rises with |value| / |baseline|,
 * clamped to 0.25–4. A flow that is zero at baseline moves at 1.5 once it is not zero.
 * Returns 0 when the flow is zero (nothing moves).
 */
export function particleRate(value: number, baseline: number): number {
  const a = Math.abs(value);
  if (a < 1e-9) return 0;
  const b = Math.abs(baseline);
  if (b < 1e-9) return 1.5;
  return Math.max(0.25, Math.min(4, a / b));
}

export interface PipeStyle {
  width: number;
  tone: Tone;
  glow: number; // 0..1
  /** Cash pipes carry particles; other kinds are dashed and still. */
  particles: boolean;
  rate: number;
  /** A negative flow runs against the drawn direction. */
  reverse: boolean;
  dashed: boolean;
}

export function pipeStyle(kind: FlowKind, value: number, baseline: number, width: number): PipeStyle {
  const dev = deviation(value, baseline);
  const cash = kind === 'cash';
  const rate = particleRate(value, baseline);
  return {
    width,
    tone: dev.tone,
    glow: dev.intensity,
    particles: cash && rate > 0,
    rate,
    reverse: value < 0,
    dashed: !cash,
  };
}

/** Pick the pipes to label: the `n` with the largest absolute change from baseline. */
export function topChanged<T extends { value: number; baseline: number }>(pipes: T[], n = 7, min = 1e-4): T[] {
  return pipes
    .map((p) => ({ p, d: Math.abs(p.value - p.baseline) }))
    .filter((x) => x.d > min)
    .sort((a, b) => b.d - a.d)
    .slice(0, n)
    .map((x) => x.p);
}

/** Bar geometry for a change among siblings: signed fraction of the largest |change| (−1..1). */
export function changeBar(change: number, maxAbs: number): number {
  if (!(maxAbs > 1e-12)) return 0;
  return Math.max(-1, Math.min(1, change / maxAbs));
}
