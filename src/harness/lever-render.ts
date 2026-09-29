/**
 * Rendering of the lever-response report (lever-report.ts): Markdown for people, JSON for
 * agents and tools, and the optional full paths. Nothing here depends on the clock, so the same
 * model always renders the same files.
 */
import { DEFAULT_MONTHS, FLAG_KINDS, LEVER_THRESHOLDS, LONG_RUN_MONTHS, fmtEffect, type ExpectationResult, type Flag, type LeverReport, type LeverRun, type LeverSection } from './lever-report.ts';

/** File name (without extension) of a model's report: `<model>` at the default horizon, which is
 *  committed, and `<model>-<n>m` at any other, which is git-ignored. */
export const reportName = (modelId: string, months: number) => (months === DEFAULT_MONTHS ? modelId : `${modelId}-${months}m`);

const fmt = fmtEffect;

const esc = (s: string) => s.replace(/\|/g, '/');
const flagTitle = (k: string) => FLAG_KINDS.find((f) => f.kind === k)?.title ?? k;
const modeText = (mode: string) => (mode ? `, ${mode}` : '');

/** A run's flags: 'Flags: none.', or one bullet per kind (details are '; '-separated lists). */
function flagLines(flags: Flag[], indent = ''): string[] {
  if (!flags.length) return [`${indent}Flags: none.`];
  return [`${indent}Flags:`, ...(indent ? [] : ['']), ...flags.map((f) => `${indent}- **${flagTitle(f.kind)}**: ${esc(f.detail)}.`)];
}

function runTable(r: LeverReport, run: LeverRun): string[] {
  const L: string[] = [];
  const rows: string[] = [];
  const still: string[] = [];
  r.headlines.forEach((h, i) => {
    const s = run.headlines[i];
    if (Math.abs(s.peak) < LEVER_THRESHOLDS.unmoved && Number.isFinite(s.peak)) {
      still.push(h.label);
      return;
    }
    rows.push(`| ${esc(h.label)} (${h.unit}) | ${s.at.map(fmt).join(' | ')} | ${fmt(s.peak)} | ${s.peakMonth} | ${fmt(s.longRun)} |`);
  });
  if (rows.length) L.push(`| Variable (unit) | ${r.horizons.map((h) => `m${h}`).join(' | ')} | Peak | Peak month | Long run |`, `|---|${r.horizons.map(() => '---:').join('|')}|---:|---:|---:|`, ...rows, '');
  if (still.length) L.push(`Unmoved (every effect below ${LEVER_THRESHOLDS.unmoved}): ${still.join(', ')}.`, '');
  L.push(...flagLines(run.flags), '');
  if (run.regimes.length) {
    L.push('Regimes that differ from the no-change run:', '');
    for (const g of run.regimes) {
      const spells = g.months.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
      const months = spells.length > 10 ? `${spells.slice(0, 10).join(', ')} … (${spells.length} spells in all)` : spells.join(', ');
      const flips = g.switches ? `; its label changed ${g.switches} time(s) in the run` : '';
      L.push(`- \`${g.rule}\`: ${g.labels.map((x) => `“${esc(x)}”`).join(' / ')} instead of ${g.noChange.map((x) => `“${esc(x)}”`).join(' / ')}, months ${months}${flips}`);
    }
    L.push('');
  }
  return L;
}

/** One line per expectation: ✓ or ✗, what theory predicts, and the mean effect in each run. */
function expectationLines(ex: ExpectationResult[]): string[] {
  return ex.map((x) => {
    const got = x.checks.length ? x.checks.map((c) => `${c.value}${modeText(c.mode)}: ${fmt(c.mean)}`).join('; ') : 'no matching run';
    return `- ${x.pass ? '✓' : '✗'} ${x.variable} ${x.sign > 0 ? 'rises' : x.sign < 0 ? 'falls' : 'does not move'} over months ${x.fromMonth}–${x.toMonth} (${x.setting}, ${x.mode}${x.withCompanion ? ', with the companion shock' : ''}): ${got}. ${esc(x.theory)} (${esc(x.source)})`;
  });
}

function leverSection(r: LeverReport, s: LeverSection): string[] {
  const L: string[] = [];
  const range = s.kind === 'choice' ? '' : `, range ${s.min ?? '–'} to ${s.max ?? '–'}${s.step ? ` in steps of ${s.step}` : ''}`;
  L.push(`## ${esc(s.label)} (\`${s.id}\`)`, '');
  L.push(`*${s.kind === 'oneoff' ? 'One-off' : s.kind === 'choice' ? 'Choice' : 'Setting'}, unit ${s.unit}, default ${s.default}${range}.*`, '');
  L.push(`${s.description}`, '');
  L.push(`**Definition.** ${s.definition}`, '');
  L.push(`Runs: ${s.settings.map((x) => x.label).join('; ')}.${s.kind === 'oneoff' ? ' A one-off fires once, before month 1.' : ' Each is set before month 1 and held.'}`, '');
  for (const k of s.skipped) L.push(`Not run on ${k.mode}: ${k.why}.`, '');
  if (s.companion) L.push(`Also run on top of a companion shock, **${esc(s.companion.label)}** (\`${s.companion.lever}\`), because ${esc(s.companion.why)}. Those runs are measured against the run with the companion shock alone, in the same mode, and follow the plain runs.`, '');
  const cross = s.crossFlags;
  if (cross.length) {
    L.push('Comparisons between runs:', '');
    for (const f of cross) {
      const where = [f.companion ? 'with the companion shock' : '', f.mode ?? ''].filter(Boolean).join(', ');
      L.push(`- **${flagTitle(f.kind)}**${where ? ` (${where})` : ''}: ${esc(f.detail)}.`);
    }
    L.push('');
  }
  const ex = r.expectations?.filter((x) => x.lever === s.id) ?? [];
  if (ex.length) L.push('Expectations:', '', ...expectationLines(ex), '');
  for (const run of s.runs) {
    L.push(`### ${esc(run.label)}${modeText(run.mode)}`, '');
    L.push(...runTable(r, run));
  }
  for (const run of s.companionRuns) {
    L.push(`### ${esc(run.label)}${modeText(run.mode)}, with ${esc(s.companion!.label)}`, '');
    L.push(...runTable(r, run));
  }
  return L;
}

export function renderLeverMarkdown(r: LeverReport): string {
  const L: string[] = [];
  L.push(`# Lever responses: ${r.label} (\`${r.modelId}\`)`, '');
  L.push(
    `Generated by \`bun run levers\`. Every lever is moved hard, one at a time, and held for ${r.months} months (a one-off fires once)${r.modes.length > 1 ? `, in each stabiliser mode (${r.modes.join(', ')})` : ''}: ${r.runs} runs. The lever is set before month 1 is computed (event t = 0), so month 1 is the first month it acts. **Every effect is the difference from the no-change run in the same mode** (the same engine and mode, no lever event), month by month; nothing is measured from month 0.`,
    '',
  );
  L.push(
    `Columns m1 … m${r.horizons[r.horizons.length - 1]} are the effect in those months; *Peak* is the largest effect in absolute value and its month; *Long run* is the mean effect over the final ${LONG_RUN_MONTHS} months. Effects below ${LEVER_THRESHOLDS.unmoved} show as 0. Each variable's unit is in brackets after its name:`,
    '',
  );
  for (const u of r.units) L.push(`- **${u.unit}**: ${u.meaning}.`);
  L.push('');
  for (const n of r.unitNotes) L.push(`\`${n.id}\` is reported in ${n.unit}: ${esc(n.why)}.`, '');
  if (r.untraced.length)
    L.push(
      `Kinks not traced: ${r.untraced.map((x) => `\`${x}\``).join(', ')} combine their terms non-additively (a min, a max, a cap) but carry no regime label, so the Regimes and Flicker flags cannot show when they bind or switch.`,
      '',
    );
  L.push('The JSON file beside this one has the same data, every indicator at the same horizons, and the thresholds. How to read and vet the report: `docs/authoring.md`, “Vetting levers”.', '');

  L.push('## Flags', '', '| Flag | Meaning and threshold |', '|---|---|');
  for (const f of FLAG_KINDS) L.push(`| ${f.title} | ${f.meaning} |`);
  L.push('');

  L.push('## Summary', '', 'Number of runs with each flag (comparisons between runs count once per pair; an inert lever once). *Runs* adds the runs on top of a companion shock after a +.', '');
  const kinds = FLAG_KINDS.map((f) => f.kind);
  const exCol = r.expectations ? ' | Expectations ✓/✗' : '';
  L.push(`| Lever | Runs | ${FLAG_KINDS.map((f) => f.title).join(' | ')}${exCol} |`, `|---|---:|${kinds.map(() => '---:').join('|')}${r.expectations ? '|---:' : ''}|`);
  for (const s of r.levers) {
    const all = [...s.runs, ...s.companionRuns];
    const counts = kinds.map((k) => all.filter((x) => x.flags.some((f) => f.kind === k)).length + s.crossFlags.filter((f) => f.kind === k).length);
    const ex = r.expectations?.filter((x) => x.lever === s.id) ?? [];
    const exCell = r.expectations ? ` | ${ex.length ? `${ex.filter((x) => x.pass).length}/${ex.filter((x) => !x.pass).length}` : ''}` : '';
    L.push(`| [${esc(s.label)}](#${anchor(s)}) (\`${s.id}\`) | ${s.runs.length}${s.companionRuns.length ? ` + ${s.companionRuns.length}` : ''} | ${counts.map((c) => (c ? String(c) : '')).join(' | ')}${exCell} |`);
  }
  L.push('');
  if (r.stabiliserLever) L.push(`The stabiliser setting (\`${r.stabiliserLever}\`) is not run as a lever: its values are the modes every other lever runs in.`, '');

  L.push('## Headline variables', '');
  L.push(`Each run's table shows these. *Gradual* ones are checked for a month-1 jump; *policy* ones are left out of the Manual-versus-Automatic sign test, since the stabilisers move them on Automatic by design.`, '');
  L.push('| Variable | Id | Unit | Gradual | Policy |', '|---|---|---|---|---|');
  for (const h of r.headlines) L.push(`| ${esc(h.label)} | \`${h.id}\` | ${h.unit} | ${h.gradual ? 'yes' : ''} | ${h.policy ? 'yes' : ''} |`);
  L.push('');
  if (r.missing.length) L.push(`Not in this model: ${r.missing.join(', ')}.`, '');
  L.push(`Policy instruments checked on Manual: ${r.policy.map((p) => `the ${p.label} (\`${p.variable}\`, ${p.levers.length ? `moved only by ${p.levers.map((x) => `\`${x}\``).join(' or ')}` : 'moved by no lever on Manual'})`).join('; ')}.`, '');

  L.push('## No-change runs', '');
  for (const n of r.noChange) {
    const f = flagLines(n.flags, '  ');
    L.push(`- ${n.mode || 'The model'}: largest move of a headline from its baseline ${n.drift.toExponential(2)} (display units). ${n.flags.length ? '' : f[0].trim()}`.trimEnd(), ...(n.flags.length ? f : []));
  }
  L.push('');

  if (r.expectations) {
    const pass = r.expectations.filter((x) => x.pass).length;
    L.push('## Expectations', '', `${pass} of ${r.expectations.length} expectations hold (src/models/${r.modelId}/expectations.ts). Each lever's section lists its own; the harness fails when one does not hold.`, '');
    const failing = r.expectations.filter((x) => !x.pass);
    if (failing.length) L.push('Expectations that do not hold:', '', ...expectationLines(failing), '');
    const sw = r.expectations.filter((x) => x.lever === r.stabiliserLever);
    if (sw.length)
      L.push(
        `The stabiliser setting (\`${r.stabiliserLever}\`) is checked on the switch from one mode to the other with no shock: the no-change run of the mode switched to (the setting's value), measured against the no-change run of the mode switched from (the expectation's mode).`,
        '',
        ...expectationLines(sw),
        '',
      );
  }

  for (const s of r.levers) L.push(...leverSection(r, s));
  return L.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** GitHub's heading anchor for a lever section. */
function anchor(s: LeverSection): string {
  return `${s.label} (${s.id})`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Numbers rounded to 6 significant digits; non-finite numbers become strings so JSON keeps them. */
function rounded(_k: string, v: unknown): unknown {
  if (typeof v !== 'number') return v;
  if (!Number.isFinite(v)) return String(v);
  return v === 0 ? 0 : Number(v.toPrecision(6));
}

/** One value per line at the top, one lever header and one run per line below: small diffs when
 *  a model changes, and still plain JSON. */
function jsonLines(head: Record<string, unknown>, listKey: string, items: { head: Record<string, unknown>; runs: unknown[] }[]): string {
  const line = (x: unknown) => JSON.stringify(x, rounded);
  const top = Object.entries(head).map(([k, v]) => ` ${JSON.stringify(k)}: ${line(v)}`);
  const body = items.map((it) => {
    const h = Object.entries(it.head).map(([k, v]) => `${JSON.stringify(k)}: ${line(v)}`);
    return `  {${h.join(', ')}${h.length ? ', ' : ''}"runs": [\n${it.runs.map((r) => `    ${line(r)}`).join(',\n')}\n  ]}`;
  });
  return `{\n${top.join(',\n')},\n ${JSON.stringify(listKey)}: [\n${body.join(',\n')}\n ]\n}\n`;
}

/** The report as JSON, without the full paths (those go to their own file). */
export function renderLeverJson(r: LeverReport): string {
  const { levers, ...head } = r;
  return jsonLines(
    head,
    'levers',
    levers.map(({ runs, companionRuns, ...h }) => ({ head: h, runs: [...runs, ...companionRuns].map(({ paths: _, ...run }) => run) })),
  );
}

/** Full monthly effect paths of the headlines, one line per run. */
export function renderLeverPaths(r: LeverReport): string {
  return jsonLines(
    { format: `${r.format}-paths`, modelId: r.modelId, months: r.months, headlines: r.headlines.map((h) => h.id) },
    'levers',
    r.levers.map((s) => ({ head: { id: s.id }, runs: [...s.runs, ...s.companionRuns].map((run) => ({ value: run.value, mode: run.mode, ...(run.companion ? { companion: true } : {}), paths: run.paths ?? {} })) })),
  );
}
