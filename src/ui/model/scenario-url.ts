/**
 * Scenario ⇄ URL hash, so a shared link replays exactly.
 *
 *   #m=reference&t=36&e=0:keyRateAddon:1,12:!wageSettlement:10
 *
 *   m  model id
 *   t  month to replay to (the scenario's `months`)
 *   e  events, comma-separated: month:lever:value, with '!' before the lever for a one-off
 *      that is fired. Lever ids are URI-encoded; values use JavaScript's shortest exact
 *      decimal form, so they round-trip bit for bit.
 *   x  the groups open on the flow map, comma-separated and URI-encoded (view state only:
 *      it does not change the numbers). Without it the map opens with every group closed.
 *
 * Unknown keys are ignored, so the hash can carry more view state later without breaking links.
 */
import type { Id, Scenario, ScenarioEvent } from '../../core/types.ts';

export interface HashState {
  modelId?: Id;
  months: number;
  events: ScenarioEvent[];
  /** Groups open on the flow map; undefined when the link does not say. */
  expanded?: Id[];
}

export type DecodeResult = { ok: true; state: HashState } | { ok: false; error: string };

function encodeEvent(e: ScenarioEvent): string {
  return `${e.t}:${e.fire ? '!' : ''}${encodeURIComponent(e.lever)}:${String(e.value)}`;
}

/** Encode a scenario (and, optionally, the groups open on the map) as a URL hash, without the '#'. */
export function encodeScenarioHash(s: Pick<Scenario, 'modelId' | 'events' | 'months'> & { expanded?: readonly Id[] }): string {
  const parts = [`m=${encodeURIComponent(s.modelId)}`, `t=${Math.max(0, Math.round(s.months))}`];
  const events = [...s.events].sort((a, b) => a.t - b.t);
  if (events.length) parts.push(`e=${events.map(encodeEvent).join(',')}`);
  if (s.expanded?.length) parts.push(`x=${s.expanded.map(encodeURIComponent).join(',')}`);
  return parts.join('&');
}

/** Decode a URL hash (with or without the leading '#'). An empty hash decodes to no scenario. */
export function decodeScenarioHash(hash: string): DecodeResult {
  const h = hash.replace(/^#/, '').trim();
  const state: HashState = { months: 0, events: [] };
  if (!h) return { ok: true, state };
  for (const part of h.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq < 0 ? part : part.slice(0, eq);
    const val = eq < 0 ? '' : part.slice(eq + 1);
    if (key === 'm') {
      try {
        state.modelId = decodeURIComponent(val);
      } catch {
        return { ok: false, error: `bad model id '${val}'` };
      }
    } else if (key === 't') {
      const t = Number(val);
      if (!(Number.isInteger(t) && t >= 0)) return { ok: false, error: `bad month '${val}'` };
      state.months = t;
    } else if (key === 'x') {
      const ids: Id[] = [];
      for (const raw of val.split(',')) {
        if (!raw) continue;
        try {
          ids.push(decodeURIComponent(raw));
        } catch {
          return { ok: false, error: `bad group id '${raw}'` };
        }
      }
      state.expanded = ids;
    } else if (key === 'e') {
      if (!val) continue;
      for (const raw of val.split(',')) {
        const bits = raw.split(':');
        if (bits.length !== 3) return { ok: false, error: `bad event '${raw}'` };
        const t = Number(bits[0]);
        const fire = bits[1].startsWith('!');
        let lever: string;
        try {
          lever = decodeURIComponent(fire ? bits[1].slice(1) : bits[1]);
        } catch {
          return { ok: false, error: `bad lever id in '${raw}'` };
        }
        const value = Number(bits[2]);
        if (!(Number.isInteger(t) && t >= 0) || !lever || bits[2] === '' || !Number.isFinite(value)) return { ok: false, error: `bad event '${raw}'` };
        state.events.push(fire ? { t, lever, value, fire: true } : { t, lever, value });
      }
    }
  }
  state.events.sort((a, b) => a.t - b.t);
  return { ok: true, state };
}

/** True when a decoded hash asks for a scenario to be replayed (not just a model). */
export function hasScenario(s: HashState): boolean {
  return s.events.length > 0 || s.months > 0;
}
