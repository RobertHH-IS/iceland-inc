/**
 * The harness layer `opening` (docs/design/today-opening.md §8): for an application model with a
 * dated opening, the hard failures T1–T3, T7 and T8, and the opening report (T11).
 *
 *   T1  every financial instrument balances at month 0, every position has the right sign and a
 *       basis of data, residual, mirror or allocated
 *   T2  every gated check passes, every rule reproduces the values the opening holds, and no
 *       regime is active at month 0 that is not active on the anchor
 *   T3  the four accounting checks stay below the tolerance and no position takes the wrong sign
 *       for 240 months, with every padlock open (the default) and with every one closed
 *   T7  every value stays finite and plausible for 240 months, in both configurations
 *   T8  with no events the run is the no-change run bit for bit; seek and fork reproduce it
 *
 * The report is reports/opening-<model>.md.
 */
import type { IndicatorCtx, ModelDef } from '../core/types.ts';
import type { KernelEngine } from '../core/engine.ts';
import { createRegisteredEngine } from '../models/index.ts';
import { lockAll } from '../core/scenario.ts';
import { DEFAULT_TOLERANCE } from '../core/checks.ts';
import { openingFailures, POSITION_BASES, type OpeningReport } from '../core/opening.ts';
import { firstNonFinite, plausibilityBreaches } from './plausibility.ts';

export interface OpeningLayerResult {
  modelId: string;
  label: string;
  pass: boolean;
  rows: { id: string; title: string; pass: boolean; detail: string }[];
  report: OpeningReport | null;
  /** The opening's path table (OpeningDef.path), by padlock configuration: reported, never gated. */
  path?: { note?: string; months: number[]; configs: { name: string; rows: { id: string; label: string; reference?: string; digits: number; values: number[] }[] }[] };
}

/** The opening's path rows read from a finished run, at the months it names. */
function pathTable(def: ModelDef, runs: { name: string; e: KernelEngine }[], months: number): OpeningLayerResult['path'] {
  const path = def.opening?.path;
  if (!path) return undefined;
  const shown = path.months.filter((t) => t >= 0 && t <= months);
  const configs = runs.map(({ name, e }) => {
    const m = e.model;
    const ctx = (t: number): IndicatorCtx => {
      const pos = e.positionsAt(t);
      const stock = (ins: string, pl: string) => {
        const j = m.instrumentIndex.get(ins)! * m.NP + m.playerIndex.get(pl)!;
        return m.role[j] === 2 ? -pos[j] : pos[j];
      };
      const at0 = e.positionsAt(0);
      // base and baseStock read month 0 of the run (today), as OpeningPathRow says
      return { v: (id) => e.valueAt(id, t), base: (id) => e.valueAt(id, 0), stock, baseStock: (ins, pl) => {
        const j = m.instrumentIndex.get(ins)! * m.NP + m.playerIndex.get(pl)!;
        return m.role[j] === 2 ? -at0[j] : at0[j];
      } };
    };
    return { name, rows: path.rows.map((r) => ({ id: r.id, label: r.label, reference: r.reference, digits: r.digits ?? 2, values: shown.map((t) => r.measure(ctx(t))) })) };
  });
  return { note: path.note, months: shown, configs };
}

const e2 = (x: number) => (Number.isFinite(x) ? x.toExponential(2) : String(x));

/** Run T1–T3, T7 and T8 on a model with an opening. */
export function runOpeningLayer(def: ModelDef, opts: { months?: number } = {}): OpeningLayerResult {
  const months = opts.months ?? 240;
  const rows: OpeningLayerResult['rows'] = [];
  const row = (id: string, title: string, pass: boolean, detail: string) => rows.push({ id, title, pass, detail });
  let e: KernelEngine;
  try {
    if (!def.opening) throw new Error(`model '${def.id}' has no opening`);
    e = createRegisteredEngine(def);
  } catch (err) {
    row('T1', 'Opening balances', false, `the opening does not build: ${(err as Error).message}`);
    return { modelId: def.id, label: def.label, pass: false, rows, report: null };
  }
  const m = e.model;
  const report = e.opening!;

  // T1: balances, signs and bases at month 0
  const pos = e.positionsAt(0);
  let worst = 0;
  m.instruments.forEach((ins, i) => {
    if (ins.kind !== 'financial') return;
    let s = 0;
    for (let p = 0; p < m.NP; p++) s += pos[i * m.NP + p];
    worst = Math.max(worst, Math.abs(s));
  });
  const badBasis = report.positions.filter((p) => !POSITION_BASES.includes(p.source.basis) || (p.source.basis === 'allocated' && !p.source.note));
  const signs = e.checks().signViolations ?? [];
  row(
    'T1',
    'Opening balances',
    worst <= DEFAULT_TOLERANCE && !badBasis.length && !signs.length,
    `largest instrument imbalance ${e2(worst)}; ${report.positions.length} positions (${countBy(report.positions.map((p) => p.source.basis))})${badBasis.length ? `; bad basis: ${badBasis.map((p) => `${p.instrument} / ${p.player}`).join(', ')}` : ''}${signs.length ? `; wrong sign: ${signs.map((v) => `${v.instrument} / ${v.player}`).join(', ')}` : ''}`,
  );

  // T2: checks, rules and regimes at month 0
  const failures = openingFailures(report);
  const gated = report.checks.filter((c) => c.gate && !c.id.startsWith('rule:')).length;
  row('T2', 'Month-0 values', !failures.length, failures.length ? failures.join('; ') : `${gated} gated check${gated === 1 ? '' : 's'} pass; every rule reproduces the values the opening holds; no regime beyond the anchor's`);

  // T3 and T7: both configurations, `months` months
  const runs: { name: string; e: KernelEngine }[] = [];
  for (const locked of [false, true]) {
    const x = createRegisteredEngine(def, { baseline: e.baselineData });
    if (locked) lockAll(x);
    x.step(months);
    runs.push({ name: locked ? 'every padlock closed' : 'every padlock open', e: x });
  }
  const acc = runs.map(({ name, e: x }) => {
    const res = Math.max(...x.maxResiduals().map((r) => r.residual));
    const sv = x.checks().signViolations ?? [];
    return { name, ok: res <= DEFAULT_TOLERANCE && !(x.checks().failures ?? []).length && !sv.length, text: `${name}: largest residual ${e2(res)}${sv.length ? `, wrong sign: ${sv.map((v) => `${v.instrument} / ${v.player} from month ${v.t}`).join(', ')}` : ''}` };
  });
  row('T3', `Accounting for ${months} months`, acc.every((a) => a.ok), acc.map((a) => a.text).join('; '));
  const plaus = runs.map(({ name, e: x }) => {
    const nf = firstNonFinite(x.model, x);
    const br = plausibilityBreaches(x.model, x).filter((b) => b.kind === 'bound');
    return { ok: !nf && !br.length, text: `${name}: ${nf || (br.length ? br.map((b) => `${b.what} ${b.rule} from month ${b.first}`).join(', ') : 'finite and plausible')}` };
  });
  row('T7', `Finite and plausible for ${months} months`, plaus.every((p) => p.ok), plaus.map((p) => p.text).join('; '));

  // T8: no events is the no-change run, bit for bit; seek and fork reproduce it
  const straight = runs[0].e;
  const ref = createRegisteredEngine(def, { baseline: e.baselineData });
  const span = Math.min(months, 36);
  ref.step(span);
  const same = (a: KernelEngine, b: KernelEngine, t: number) => {
    const va = m.vars.every((v) => Object.is(a.valueAt(v.id, t), b.valueAt(v.id, t)));
    const pa = a.positionsAt(t),
      pb = b.positionsAt(t);
    return va && pa.every((x, j) => Object.is(x, pb[j]));
  };
  let firstDiff = -1;
  for (let t = 0; t <= span && firstDiff < 0; t++) if (!same(straight, ref, t)) firstDiff = t;
  const fork = ref.fork();
  ref.seek(Math.floor(span / 3));
  ref.seek(span);
  let seekDiff = -1;
  for (let t = 0; t <= span && seekDiff < 0; t++) if (!same(straight, ref, t)) seekDiff = t;
  const forkSame = same(fork, straight, span);
  row(
    'T8',
    'No-change integrity',
    firstDiff < 0 && seekDiff < 0 && forkSame,
    firstDiff >= 0 ? `a run with no events differs from the no-change run at month ${firstDiff}` : seekDiff >= 0 ? `seek differs at month ${seekDiff}` : !forkSame ? 'a fork with no change differs' : `a run with no events, seek and a fork all equal the no-change run bit for bit for ${span} months`,
  );
  return { modelId: def.id, label: def.label, pass: rows.every((r) => r.pass), rows, report, path: pathTable(def, runs, months) };
}

function countBy(xs: string[]): string {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].map(([k, n]) => `${n} ${k}`).join(', ');
}

const num = (x: number, d = 3) => {
  if (!Number.isFinite(x)) return String(x);
  if (x !== 0 && (Math.abs(x) < 10 ** -d || Math.abs(x) >= 1e7)) return x.toExponential(2);
  return x.toFixed(d);
};
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** reports/opening-<model>.md: the layer's results and the opening report. */
export function renderOpeningReport(r: OpeningLayerResult): string {
  const L: string[] = [];
  L.push(`# Opening report: ${r.label} (\`${r.modelId}\`)`, '');
  L.push(`Generated by \`bun run harness\`. Overall: **${r.pass ? 'PASS' : 'FAIL'}**.`, '');
  L.push('| Test | What | Result | Detail |', '|---|---|---|---|');
  for (const x of r.rows) L.push(`| ${x.id} | ${x.title} | ${x.pass ? 'PASS' : '**FAIL**'} | ${cell(x.detail)} |`);
  const o = r.report;
  if (!o) return L.join('\n') + '\n';
  L.push('', `## ${o.label}`, '');
  L.push(`Opening \`${o.id}\`, as of ${o.asOf}${o.month0 ? `; month 0 is ${o.month0.year}-${String(o.month0.month).padStart(2, '0')}` : ''}.`, '');
  L.push(
    `Start solve: ${o.solve.mode}, ${o.solve.unknowns} unknown${o.solve.unknowns === 1 ? '' : 's'}, ${o.solve.iterations} iteration${o.solve.iterations === 1 ? '' : 's'}, largest residual ${e2(o.solve.residual)}${Number.isFinite(o.solve.condition) ? `, condition number ${num(o.solve.condition, 2)}` : ''}.`,
    '',
  );
  if (o.checks.length) {
    L.push('### Checks', '', '| Check | Value | Expected | Tolerance | Gate | Result |', '|---|---:|---:|---:|---|---|');
    for (const c of o.checks) L.push(`| ${c.id} | ${num(c.value, 4)} | ${num(c.expected, 4)} | ${num(c.tolerance, 4)} | ${c.gate ? 'gate' : 'warn'} | ${c.pass ? 'pass' : '**fail**'} |`);
    L.push('');
  }
  if (o.gaps.length) {
    L.push('### Start gaps', '', '| Group | Targets | Size | Scale | Share of the rule | Fade a year | Half-life (months) |', '|---|---|---:|---|---:|---:|---:|');
    for (const g of o.gaps) L.push(`| ${g.group} | ${g.targets.join(', ')} | ${num(g.value, 5)} | ${g.scale} | ${num(g.shareOfRule, 4)} | ${num(g.fade, 2)} | ${g.halfLifeMonths} |`);
    L.push('');
  }
  if (o.month1.length) {
    L.push('### Months 1 and 2', '', '| Quantity | Month 0 | Month 1 | Month 2 | Bound | Result |', '|---|---:|---:|---:|---:|---|');
    for (const x of o.month1) L.push(`| ${x.id} | ${num(x.month0, 5)} | ${num(x.month1, 5)} | ${num(x.month2, 5)} | ${num(x.bound, 4)} | ${x.pass ? 'pass' : '**fail**'} |`);
    L.push('');
  }
  if (r.path) {
    const month = (t: number) => {
      if (!o.month0) return `Month ${t}`;
      const k = o.month0.month - 1 + t;
      return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][k % 12]} ${o.month0.year + Math.floor(k / 12)} (month ${t})`;
    };
    L.push('### The path with no lever moved', '', r.path.note ?? 'The model’s own path from the opening, beside published figures. Shown for comparison; it is not a test.', '');
    for (const c of r.path.configs) {
      L.push(`With ${c.name}:`, '', `| Quantity | ${r.path.months.map(month).join(' | ')} | Published, for comparison |`, `|---|${r.path.months.map(() => '---:').join('|')}|---|`);
      for (const x of c.rows) L.push(`| ${cell(x.label)} | ${x.values.map((v) => (Number.isFinite(v) ? v.toFixed(x.digits) : String(v))).join(' | ')} | ${cell(x.reference ?? '')} |`);
      L.push('');
    }
  }
  L.push('### Positions at month 0', '', `| Instrument | Player | Model units | ${o.positions.some((p) => p.money !== null) ? 'Money' : ''} | Basis | Records | Period | Note |`, '|---|---|---:|---:|---|---|---|---|');
  for (const p of o.positions) L.push(`| ${p.instrument} | ${p.player} | ${num(p.value)} | ${p.money === null ? '' : num(p.money, 1)} | ${p.source.basis} | ${(p.source.records ?? []).join(', ')} | ${p.source.period ?? ''} | ${cell(p.source.note ?? '')} |`);
  L.push('', '### Variables the opening holds', '', '| Variable | Value | Basis | Records | Period |', '|---|---:|---|---|---|');
  for (const v of o.vars) L.push(`| ${v.id} | ${num(v.value, 5)} | ${v.source.basis} | ${(v.source.records ?? []).join(', ')} | ${v.source.period ?? ''} |`);
  L.push('', '### Parameters', '', '| Parameter | Value | On the anchor | Basis | Note |', '|---|---:|---:|---|---|');
  for (const p of o.params) L.push(`| ${p.id} | ${num(p.value, 5)} | ${num(p.anchor, 5)} | ${p.provenance.basis} | ${cell(p.provenance.note ?? p.provenance.source ?? '')} |`);
  if (o.anchors.length) {
    L.push('', '### Anchor overrides', '', '| Variable | Anchor read | Structural anchor |', '|---|---:|---:|');
    for (const a of o.anchors) L.push(`| ${a.id} | ${num(a.value, 5)} | ${num(a.structural, 5)} |`);
  }
  if (o.regimes.length) {
    L.push('', '### Regimes at month 0', '', '| Rule | Regime | Padlocks closed (mask) | On the anchor |', '|---|---|---:|---|');
    for (const x of o.regimes) L.push(`| ${x.rule} | ${cell(x.regime)} | ${x.mask} | ${x.onAnchor ? 'yes' : '**no**'} |`);
  }
  L.push('', `### Records used (${o.recordsUsed.length})`, '', o.recordsUsed.length ? o.recordsUsed.map((x) => `\`${x}\``).join(', ') : 'None.', '');
  L.push('### Warnings', '', ...(o.warnings.length ? o.warnings.map((w) => `- ${w}`) : ['None.']), '');
  return L.join('\n');
}
