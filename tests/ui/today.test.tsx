/**
 * The interface on a model that opens on a dated month 0 (docs/design/today-opening.md §7, T12):
 * calendar months, amounts in ISK, the change since today from month 1, the effect against the
 * no-change path only once a lever has moved, one calm line and nothing to approve.
 *
 * Until Iceland today is registered the tests run on a dated stand-in (./today-fixture.ts); the
 * last block runs the same checks on 'iceland-today' itself once it is.
 */
import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { applicationModels, createRegisteredEngine } from '../../src/models/index.ts';
import { App } from '../../src/ui/App.tsx';
import { createEngineClient, TICK_MS, type EngineClient } from '../../src/ui/engine-client.ts';
import { startingDataComparison } from '../../src/ui/model/current-data.ts';
import { priceYear } from '../../src/ui/model/effects.ts';
import { todayLine } from '../../src/ui/model/economic-context.ts';
import { effectiveExpanded } from '../../src/ui/model/hierarchy.ts';
import { EMPTY_NAV, navPush, type Selection } from '../../src/ui/model/navigation.ts';
import { decodeScenarioHash, encodeScenarioHash } from '../../src/ui/model/scenario-url.ts';
import { BaselineContext, EconomicContextSummary } from '../../src/ui/views/BaselineContext.tsx';
import { Charts } from '../../src/ui/views/Charts.tsx';
import { CurrentDataAudit } from '../../src/ui/views/CurrentDataAudit.tsx';
import { Feed } from '../../src/ui/views/Feed.tsx';
import { FlowMap } from '../../src/ui/views/FlowMap.tsx';
import { Header } from '../../src/ui/views/Header.tsx';
import { Inspector } from '../../src/ui/views/Inspector.tsx';
import { LedgerView } from '../../src/ui/views/LedgerView.tsx';
import { LeverPanel } from '../../src/ui/views/LeverPanel.tsx';
import { datedClient, datedModel, OPENING } from './today-fixture.ts';

const noop = () => {};
const clean = (html: string) => html.replace(/<!-- -->/g, '');
const text = (html: string) => clean(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const models = [datedModel, ...applicationModels];
/** An effect written beside an amount ("−0.4% vs no change"), not the charts' button of that name. */
const CHANGE_VS_NO_CHANGE = /[+−][\d.]+(%| pp),? vs no change/;

const map = (c: EngineClient, open: string[] = []) => {
  const f = c.getFrame();
  const eff = effectiveExpanded(c.info, open);
  return clean(renderToString(<FlowMap info={c.info} client={c} expanded={eff} pipes={c.pipes({ expanded: [...eff] })} legs={f.legs} t={f.t} events={f.events} regimes={f.regimes} rulesActing={f.stabilisers.filter((x) => !x.locked).map((x) => x.id).join(' ')} seq={f.seq} selection={null} onSelect={noop} onOpenGroup={noop} onCloseGroup={noop} />));
};
const pipeTitles = (html: string) => [...html.matchAll(/<g class="pipe [^"]*" role="button" tabindex="0" aria-label="([^"]*)"/g)].map((m) => m[1]);
const cardLabels = (html: string) => [...html.matchAll(/<g class="node[^"]*"[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
const inspect = (c: EngineClient, ...s: Selection[]) =>
  clean(renderToString(<Inspector info={c.info} client={c} frame={c.getFrame()} nav={s.reduce((n, x) => navPush(n, x), EMPTY_NAV)} expanded={effectiveExpanded(c.info, [])} onSelect={noop} onBack={noop} onForward={noop} onClose={noop} />));
const ledger = (c: EngineClient) => {
  const f = c.getFrame();
  return clean(renderToString(<LedgerView info={c.info} client={c} legs={f.legs} t={f.t} events={f.events} columns="player" onSelect={noop} />));
};
/** A client stepped `months` with the key rate held at 6% from month 0, or with nothing moved. */
const run = (months: number, lever = false) => {
  const c = datedClient();
  if (lever) c.setLever('keyRate', 6);
  c.pause();
  c.step(months);
  expect(c.getFrame().error).toBeNull();
  return c;
};

describe('a dated opening: the start', () => {
  test('the application shows September 2026, amounts in ISK, "auto" on the card and the lever, and the one line', () => {
    const html = clean(renderToString(<App models={models} initialModelId={datedModel.id} />));
    expect(html).toContain('>September 2026</div>');
    expect(html).toContain('>Starting data</button>');
    expect(html).toContain('ISK 2,550 bn a year'); // household consumption, a pipe's title
    expect(html).toContain('ISK 3,330 bn'); // broad money on the banks' card
    expect(html).toContain('<tspan class="node-rule"> auto</tspan>');
    expect(html).toContain('>auto</span>');
    expect(html).toContain(`<span class="context-today">${todayLine({ calendar: datedModel.calendar!.month0, openingInfo: null, info: { label: datedModel.label } as never })}</span>`);
    // the strip is the one line: no key-rate pair, no forecasts
    expect(html).not.toContain('Assumed path:');
    expect(html).not.toContain('2026 forecast');
    // nothing to approve and no notes
    for (const gone of ['Apply', 'class="call-dot"', 'class="stab-call"', 'class="lock-note"', 'class="stab-note"']) expect(html).not.toContain(gone);
    // month 0 is today: no change is shown
    expect(html).not.toContain('since Sep 2026');
    expect(html).not.toMatch(CHANGE_VS_NO_CHANGE);
  });

  test('the one line names the opening when the engine reports one', () => {
    const c = datedClient();
    expect(c.openingInfo).toEqual({ ...OPENING, recordsUsed: [] });
    expect(c.comparison).toBe('no-change');
    const strip = clean(renderToString(<EconomicContextSummary client={c} />));
    expect(text(strip).trim()).toBe('Iceland on 30 September 2026, from published data. Without your changes it follows its own rules (dashed lines): a teaching model, not a forecast.');
    c.dispose();
  });

  test('without a dated opening nothing changes: model units, model months, the context strip', () => {
    const c = createEngineClient(createRegisteredEngine(applicationModels.find((m) => m.id === 'iceland-growing')!), { comparison: 'no-change', tickMs: 1e9 });
    expect(c.calendar).toBeNull();
    expect(c.moneyUnit).toBeNull();
    expect(c.openingInfo).toBeNull();
    expect(todayLine(c)).toBeNull();
    expect(clean(renderToString(<EconomicContextSummary client={c} />))).toContain('Assumed path:');
    expect(pipeTitles(map(c))[0]).toContain('without your changes at this month');
    c.dispose();
  });

  test('the clock and the timeline are in calendar months, with a tick at each January', () => {
    const c = run(30);
    const f = c.getFrame();
    const html = clean(renderToString(<Header info={c.info} client={c} t={f.t} horizon={f.horizon} playing={false} speed={1} ended={false} events={f.events} checks={f.checks} signViolations={f.signViolations} models={[{ id: datedModel.id, label: datedModel.label }]} modelId={datedModel.id} onModelChange={noop} onShare={noop} share={{ status: 'idle' }} onShareDone={noop} onBaseline={noop} />));
    expect(html).toContain('>March 2029</div>');
    expect(html).toContain('aria-valuetext="March 2029, month 30 of 30 simulated"');
    expect((html.match(/class="tyear"/g) ?? []).length).toBe(3); // Jan 2027, 2028, 2029
    expect(html).toContain('aria-label="Back to the start (clears all lever changes)"');
    c.dispose();
  });

  test('1× is one month every two seconds', () => {
    const delays: number[] = [];
    const real = globalThis.setInterval;
    globalThis.setInterval = ((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      return real(fn, 1e9);
    }) as typeof setInterval;
    try {
      const c = createEngineClient(createRegisteredEngine(datedModel), { model: datedModel });
      c.play();
      c.pause();
      c.dispose();
    } finally {
      globalThis.setInterval = real;
    }
    expect(TICK_MS).toBe(2000);
    expect(delays).toEqual([2000]);
  });
});

describe('a dated opening: changes since today and effects', () => {
  test('at month 12 with no lever moved, a pipe shows its change since Sep 2026 and no effect', () => {
    const c = run(12);
    const html = map(c);
    const titles = pipeTitles(html);
    expect(titles.some((t) => / · [+−][\d.]+% since Sep 2026/.test(t))).toBe(true);
    expect(html).not.toMatch(CHANGE_VS_NO_CHANGE);
    // the cards show levels, with no effect while nothing has moved
    for (const card of cardLabels(html)) expect(card).not.toMatch(/vs no change/);
    c.dispose();
  });

  test('after a lever moves, a card and a pipe show the effect vs no change; the same months with no lever show none', () => {
    const c = run(12, true);
    const html = map(c);
    expect(pipeTitles(html).some((t) => /since Sep 2026 · [+−][\d.]+% vs no change$/.test(t))).toBe(true);
    const bank = cardLabels(html).find((l) => l.startsWith('Central bank.'))!;
    expect(bank).toMatch(/^Central bank\. Key rate 6\.00%, \+[\d.]+ pp vs no change\. Inflation /);
    // the effect is a small number of its own beside the level, so it never takes the label's room
    expect(html).toMatch(/<tspan class="node-mval tone-up"[^>]*>6\.00%<\/tspan><tspan class="node-mchg tone-up" dx="3">\+[\d.]+pp<\/tspan>/);
    const quiet = run(12);
    expect(map(quiet)).not.toMatch(CHANGE_VS_NO_CHANGE);
    c.dispose();
    quiet.dispose();
  });

  test('after a lever moves the cards keep their labels in full', () => {
    const labelsOf = (html: string) => [...html.matchAll(/<tspan class="node-mlabel">([^<]*)<\/tspan>/g)].map((m) => m[1]);
    const quiet = labelsOf(map(run(12)));
    const moved = map(run(12, true));
    expect(labelsOf(moved)).toEqual(quiet);
    for (const l of ['Key rate', 'Unemployment', 'Spending', 'Investment', 'Broad money', 'Inflation', 'Current acct']) expect(labelsOf(moved)).toContain(l);
    expect(labelsOf(moved).some((l) => l.endsWith('…'))).toBe(false);
    expect((moved.match(/class="node-mchg/g) ?? []).length).toBeGreaterThan(5);
  });

  test('a change is a difference where a percentage would mean nothing: an amount near zero, a quantity centred on zero, a revaluation', () => {
    const c = run(12, true);
    const head = (id: string) => text(inspect(c, { kind: 'var', id }).match(/<div class="inf-head">.*?<\/div>/)![0]);
    // the deficit was about zero at the start: ISK, not "+1187%"
    expect(head('deficit')).toMatch(/\+ISK [\d.]+ bn a year vs no change/);
    expect(head('lenderConfidence')).toMatch(/[+−][\d.]+ ratio vs no change/);
    expect(head('logRealHousePrice')).toMatch(/[+−][\d.]+ log points since Sep 2026 [+−][\d.]+ log points vs no change/);
    // nowhere on the map or in these details is a change of a thousand per cent or more
    const html = map(c) + ['deficit', 'bondIssue', 'bondIssuePF', 'cbProfit', 'lenderConfidence', 'logRealHousePrice', 'debtRatio'].map((id) => inspect(c, { kind: 'var', id })).join('');
    expect(text(html)).not.toMatch(/[+−][\d,]{4,}%/);
    // a revaluation pipe's label is in ISK
    expect(map(c)).toMatch(/<tspan class="plabel-name">Revaluation[^<]*<\/tspan><tspan class="plabel-val" dx="5">[+−][\d.,]+ bn<\/tspan>/);
    c.dispose();
  });

  test('today’s amounts are month 0’s, in every frame and after a lever, a seek and a reset', () => {
    const c = datedClient();
    const pipes0 = c.pipes('player'), sheet0 = c.balanceSheet('HW'), legs0 = c.getFrame().legToday;
    for (const p of pipes0) {
      expect(p.today).toBe(p.value);
      p.legs.forEach((l) => expect(l.today).toBe(l.value));
    }
    for (const r of [...sheet0.assets, ...sheet0.liabilities]) expect(r.today).toBe(r.value);
    expect(sheet0.netWorthToday).toBe(sheet0.netWorth);
    const gdp0 = c.value('nominalGDP');
    c.setLever('keyRate', 6);
    c.pause();
    c.step(24);
    c.seek(12);
    const f = c.getFrame();
    expect(f.legToday).toBe(legs0);
    expect(c.pipes('player').map((p) => p.today)).toEqual(pipes0.map((p) => p.value));
    expect(c.balanceSheet('HW').netWorthToday).toBe(sheet0.netWorth);
    expect(c.opening!('nominalGDP')).toBe(gdp0);
    expect(c.value('nominalGDP')).not.toBe(gdp0);
    c.reset();
    expect(c.getFrame().legToday).toBe(legs0);
    c.dispose();
  });

  test('a lever set this month shows no effect until a month has run with it', () => {
    const c = run(12);
    c.setLever('keyRate', 6);
    c.pause();
    expect(map(c)).not.toMatch(CHANGE_VS_NO_CHANGE);
    c.step(1);
    expect(map(c)).toMatch(CHANGE_VS_NO_CHANGE);
    c.dispose();
  });

  test('the inspector: a pipe and a balance sheet in ISK, with the change since today and, after a lever moves, the effect', () => {
    const quiet = run(12);
    const pipe = inspect(quiet, { kind: 'pipe', from: 'households', to: 'firms', flowKind: 'cash' });
    expect(pipe).toMatch(/<span class="mono big">ISK [\d,]+ bn a year<\/span><span class="mono delta tone-(up|down)">[+−][\d.]+% since Sep 2026<\/span>/);
    expect(pipe).not.toContain('vs no change');
    expect(pipe).not.toContain('% of opening GDP');
    const bank = inspect(quiet, { kind: 'player', id: 'B' });
    expect(bank).toContain('<p class="muted small">ISK bn · now · since Sep 2026</p>');
    expect(bank).toMatch(/<td>Net worth<\/td><td class="num mono">[\d,.]+<\/td><td class="num"><span class="mono delta tone-(up|down)">[+−][\d.]+%<\/span><\/td><td class="num"><\/td>/);
    const moved = run(12, true);
    expect(inspect(moved, { kind: 'pipe', from: 'households', to: 'firms', flowKind: 'cash' })).toMatch(/since Sep 2026<\/span><span class="mono delta tone-(up|down)">[+−][\d.]+% vs no change<\/span>/);
    expect(inspect(moved, { kind: 'player', id: 'B' })).toContain('<p class="muted small">ISK bn · now · since Sep 2026 · vs no change</p>');
    // a variable: its level in %, the change since today in pp, and the chart against the dashed no-change path
    const rate = inspect(moved, { kind: 'var', id: 'keyRate' });
    expect(rate).toContain('<span class="inf-now mono">6.00%</span>');
    expect(rate).toMatch(/\+3\.00 pp since Sep 2026/);
    expect(rate).toContain('class="zero reference-line"');
    quiet.dispose();
    moved.dispose();
  });

  test('money parameters are at the money unit’s prices, and nothing says "baseline" in the inspector’s own words', () => {
    const c = run(3);
    const html = inspect(c, { kind: 'var', id: 'consumptionY' });
    expect(html).toMatch(/ISK [\d,.]+ bn a year at 2025 prices/);
    for (const id of ['keyRate', 'consumptionY']) {
      // the model's own texts (what a rule does, its parameters' notes) are the model's words
      const own = inspect(c, { kind: 'var', id }).replace(/<p class="inf-(what|rule)">.*?<\/p>/g, '').replace(/<div class="params">[\s\S]*?<\/ul><\/div>/g, '');
      expect(text(own)).not.toMatch(/baseline/i);
    }
    c.dispose();
  });

  test('the ledger: ISK bn a year; small numbers since today, then the effect once a lever has moved', () => {
    expect(text(ledger(datedClient()))).toContain('ISK bn a year. − pays, + receives.');
    const quiet = run(12);
    const q = ledger(quiet);
    expect(text(q)).toContain('ISK bn a year. − pays, + receives; small numbers: change since Sep 2026.');
    expect(q).toMatch(/<span class="mono small tone-(up|down)">[+−][\d.]+%<\/span>/);
    expect(q).toContain('0 ✓');
    const moved = run(12, true);
    expect(text(ledger(moved))).toContain('small numbers: effect vs no change at this month.');
    quiet.dispose();
    moved.dispose();
  });

  test('charts and the feed name calendar months; each chart its unit once', () => {
    const c = run(14, true);
    const f = c.getFrame();
    const charts = clean(renderToString(<Charts info={c.info} client={c} t={f.t} events={f.events} tab={null} onTab={noop} selected={null} onSelect={noop} basis="nominal" onBasis={noop} />));
    expect(charts).toContain('<title>Sep 2026: Key interest rate → 6%</title>');
    expect(charts).toContain('<span class="chart-unit muted small">ISK bn a year</span>');
    expect(charts).not.toMatch(/bn ISK/);
    const real = clean(renderToString(<Charts info={c.info} client={c} t={f.t} events={f.events} tab={null} onTab={noop} selected={null} onSelect={noop} basis="real" onBasis={noop} />));
    expect(real).toContain('ISK bn a year at 2025 prices');
    expect(clean(renderToString(<Charts info={c.info} client={c} t={f.t} events={f.events} tab={null} onTab={noop} selected={null} onSelect={noop} basis="deviation" onBasis={noop} />))).toContain('>Effect vs no change</button>');
    const big = inspect(c, { kind: 'indicator', id: 'keyRate' });
    expect(big).toContain('>Sep 2026</text>');
    expect(big).toContain('>Nov 2027</text>');
    const feed = clean(renderToString(<Feed info={c.info} feed={[{ t: 4, message: 'Inflation is falling', indicator: 'inflation' }]} onSelect={noop} month0={c.calendar} />));
    expect(feed).toContain('<span class="mono feed-t">Jan 2027</span>');
    c.dispose();
  });
});

describe('a dated opening: starting data and links', () => {
  test('each chart’s month-0 value beside its records, marked used for the start or for comparison, and unmoved by a lever', () => {
    const c = datedClient({ recordsUsed: ['macro.cpiInflationYoY'] });
    const before = startingDataComparison(c).map((r) => r.modelValue);
    const html = clean(renderToString(<CurrentDataAudit client={c} />));
    expect(html).toContain('<h3>Each chart at the start, beside its records</h3>');
    expect(html).toContain('<th scope="col">Model, Sep 2026</th>');
    expect(html).toMatch(/data-observation="macro.cpiInflationYoY"><div class="small">[^<]*<span class="context-use used">used for the start<\/span>/);
    expect(html).toMatch(/data-observation="financial.policyRate"><div class="small">[^<]*<span class="context-use">for comparison<\/span>/);
    for (const row of startingDataComparison(c)) expect(row.observations.length).toBeLessThanOrEqual(10);
    expect(html).not.toContain('inherits the calibrated 3% opening rate');
    // the snapshot's qualifications describe the stationary and growing variants: none on a dated opening
    expect(html).not.toContain('context-audit-qualification');
    c.setLever('keyRate', 6);
    c.pause();
    c.step(12);
    expect(startingDataComparison(c).map((r) => r.modelValue)).toEqual(before);
    const dialog = clean(renderToString(<BaselineContext client={c} onClose={noop} />));
    expect(dialog).toContain('>Starting data</h2>');
    expect(dialog).toContain('What the no-change path assumes');
    expect(dialog).not.toContain('Iceland: current reference');
    // nothing about the old opening: no 3% rate, no zero inflation, no stationary or calibrated start, no baseline
    expect(text(dialog)).not.toMatch(/(?<![\d.])3%|zero inflation|stationary|calibrated|neutral|baseline/i);
    c.dispose();
  });

  test('the opening travels silently in a share link: o is written and read, with no line about it', () => {
    const c = datedClient();
    c.setLever('keyRate', 6);
    c.pause();
    c.step(3);
    const scenario = c.scenario() as ReturnType<EngineClient['scenario']> & { opening?: string };
    expect(scenario.opening).toBe(OPENING.id);
    const hash = encodeScenarioHash({ ...scenario, expanded: [] });
    expect(hash).toBe(`m=dated-fixture&v=2&o=${OPENING.id}&t=3&e=0:keyRate:6`);
    const back = decodeScenarioHash(hash);
    expect(back.ok && back.state.opening).toBe(OPENING.id);
    expect(back.ok && back.state.events).toEqual([{ t: 0, lever: 'keyRate', value: 6 }]);
    const html = clean(renderToString(<App models={models} initialHash={`#${hash}`} />));
    expect(html).toContain('>December 2026</div>');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain(OPENING.id);
    c.dispose();
  });

  test('a link to the growing variant still opens it, and the switcher lists it only then', () => {
    const growing = clean(renderToString(<App models={applicationModels} initialHash="#m=iceland-growing" />));
    expect(growing).toContain('<option value="iceland-growing" selected="">');
    const plain = clean(renderToString(<App models={applicationModels} initialHash="#m=iceland" />));
    expect(plain).not.toContain('value="iceland-growing"');
  });

  test('the lever panel: the start value, "auto" while unlocked, and no notes', () => {
    const c = run(2);
    const f = c.getFrame();
    const html = clean(renderToString(<LeverPanel info={c.info} client={c} values={f.levers} events={f.events} stabilisers={f.stabilisers} />));
    expect(html).toContain('>auto</span>');
    expect(html).toMatch(/aria-label="Key interest rate: [\d.]+%, start value 3%/);
    expect(html).not.toMatch(/baseline/i);
    c.dispose();
  });
});

const today = applicationModels.find((m) => m.id === 'iceland-today');

describe.skipIf(!today)('Iceland today, once registered (T12)', () => {
  test('the application opens on it: September 2026, a key rate of 8.00% marked auto, ISK amounts and the one line, with nothing to approve', () => {
    const html = clean(renderToString(<App />));
    expect(html).toContain('>September 2026</div>');
    expect(html).toContain('Key rate 8.00%, auto: set by its rule');
    expect(html).toContain('>auto</span>');
    expect(html).toMatch(/ISK [\d,]+ bn/);
    expect(html).toContain('from published data. Without your changes it follows its own rules (dashed lines): a teaching model, not a forecast.');
    for (const gone of ['Apply', 'class="call-dot"', 'class="lock-note"', 'since Sep 2026']) expect(html).not.toContain(gone);
    expect(html).not.toMatch(CHANGE_VS_NO_CHANGE);
    expect(text(html)).not.toMatch(/baseline/i);
  });

  test('its money unit names 2025 prices, and its starting data say nothing of the old opening', () => {
    const mu = (today as typeof today & { moneyUnit?: Parameters<typeof priceYear>[0] }).moneyUnit;
    expect(mu && priceYear(mu)).toBe('2025');
    const c = createEngineClient(createRegisteredEngine(today!), { comparison: 'no-change', model: today, tickMs: 1e9 });
    expect(text(clean(renderToString(<BaselineContext client={c} onClose={noop} />)))).not.toMatch(/(?<![\d.])3%|zero inflation|stationary|calibrated|neutral|baseline/i);
    c.dispose();
  });

  test('since today without a lever, the effect only after one', () => {
    const c = createEngineClient(createRegisteredEngine(today!), { comparison: 'no-change', model: today, tickMs: 1e9 });
    c.step(12);
    const quiet = map(c);
    expect(pipeTitles(quiet).some((t) => t.includes('since Sep 2026'))).toBe(true);
    expect(quiet).not.toMatch(CHANGE_VS_NO_CHANGE);
    c.setLever('keyRate', 7);
    c.step(3);
    expect(map(c)).toMatch(CHANGE_VS_NO_CHANGE);
    c.dispose();
  });
});
