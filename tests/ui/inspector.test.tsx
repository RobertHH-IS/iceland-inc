/**
 * What the inspector, the ledger, the lever panel and the header print (react-dom/server, no
 * browser): words from the label table instead of raw ids, one explanation per leg of a pipe, net
 * values in mixed ledger cells, no "Apply" for a rule that wants a value beyond its lever's range,
 * filled explanation templates, and a warning for positions with the wrong sign.
 */
import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { models } from '../../src/models/index.ts';
import type { StabiliserState } from '../../src/core/types.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { EN, labels } from '../../src/ui/labels.ts';
import { effectiveExpanded } from '../../src/ui/model/hierarchy.ts';
import { varLabel } from '../../src/ui/model/info.ts';
import { EMPTY_NAV, navPush, type NavState, type Selection } from '../../src/ui/model/navigation.ts';
import { positionBadge, positionWarnings } from '../../src/ui/model/signs.ts';
import { CategoryChip } from '../../src/ui/views/common.tsx';
import { FlowMap } from '../../src/ui/views/FlowMap.tsx';
import { Header } from '../../src/ui/views/Header.tsx';
import { Inspector } from '../../src/ui/views/Inspector.tsx';
import { LedgerView } from '../../src/ui/views/LedgerView.tsx';
import { LeverPanel } from '../../src/ui/views/LeverPanel.tsx';
import { hierarchyModel } from '../fixtures/hierarchy.ts';

const noop = () => {};
/** Rendered HTML without the markers React puts between adjacent pieces of text. */
const text = (html: string) => html.replace(/<!-- -->/g, '');
const iceland = models.find((m) => m.id === 'iceland')!;
const client = createEngineClient(iceland);
const info = client.info;
const frame = client.getFrame();
const inspect = (nav: NavState, c = client) =>
  text(renderToString(<Inspector info={c.info} client={c} frame={c.getFrame()} nav={nav} expanded={effectiveExpanded(c.info, [])} onSelect={noop} onBack={noop} onForward={noop} onGo={noop} onClose={noop} />));
const open = (...s: Selection[]) => s.reduce((n, x) => navPush(n, x), EMPTY_NAV);

describe('labels instead of raw ids', () => {
  test('the table covers every id, with words a translation can replace', () => {
    for (const table of Object.values(EN)) for (const [id, word] of Object.entries(table as Record<string, string>)) expect(word.length > 0 && word !== id).toBe(true);
    expect(labels).toBe(EN);
  });

  test('category chips print the word; the class keeps the id', () => {
    const html = renderToString(<CategoryChip category="BEHAVIOUR" />);
    expect(html).toContain('class="chip cat cat-behaviour"');
    expect(html).toContain('>Behaviour<');
  });

  test('breadcrumbs name what each item is', () => {
    const flow = info.flows[0];
    const html = inspect(open({ kind: 'var', id: 'keyRate' }, { kind: 'flow', id: flow.id }, { kind: 'indicator', id: info.indicators[0].id }, { kind: 'concept', id: info.concepts[0].id }, { kind: 'group', id: 'firms' }));
    for (const w of ['Variable', 'Flow', 'Chart', 'Idea', 'Group']) expect(html).toContain(`<span class="crumb-kind">${w}</span>`);
    expect(html).not.toMatch(/crumb-kind">(var|flow|indicator|concept|group)</);
  });

  test('a pipe names its kind and each flow’s account; a flow and a concept card too', () => {
    const accrual = frame.pipes.player.find((p) => p.kind !== 'cash')!;
    const html = inspect(open({ kind: 'pipe', from: accrual.from, to: accrual.to, flowKind: accrual.kind }));
    expect(html).toContain(`>${labels.flowKind[accrual.kind]}</span>`);
    expect(html).not.toContain(`>${accrual.kind.toUpperCase()}<`);
    const other = info.flows.find((f) => f.account === 'other')!;
    const flowHtml = inspect(open({ kind: 'flow', id: other.id }));
    expect(flowHtml).toContain(`${labels.flowKind[other.kind]} · Other changes · `);
    expect(flowHtml).not.toContain('other account');
    const pk = info.concepts.find((c) => c.school === 'post-keynesian')!;
    expect(inspect(open({ kind: 'concept', id: pk.id }))).toContain('<span class="chip quiet">Post-Keynesian</span>');
  });

  test('the map’s pipe labels and the ledger’s section titles come from the same table', () => {
    const eff = effectiveExpanded(info, []);
    const pipes = client.pipes({ expanded: [...eff] });
    const map = text(renderToString(<FlowMap info={info} client={client} expanded={eff} pipes={pipes} legs={frame.legs} regimes={frame.regimes} seq={frame.seq} selection={null} onSelect={noop} onOpenGroup={noop} onCloseGroup={noop} />));
    for (const kind of new Set(pipes.map((p) => p.kind))) expect(map).toContain(`, ${labels.flowKindPhrase[kind]}: `);
    expect(map).toContain(`, ${labels.flowKindPhrase.cash}: `);
    const ledger = text(renderToString(<LedgerView info={info} client={client} legs={frame.legs} columns="player" onSelect={noop} />));
    for (const a of new Set(info.flows.map((f) => f.account))) expect(ledger).toContain(labels.accountSection[a]);
  });
});

test('a pipe with several legs of one flow between the same two players explains each leg (M16)', () => {
  const html = inspect(open({ kind: 'pipe', from: 'domestic', to: 'W', flowKind: 'cash' }));
  const legs = info.legs.filter((l) => l.flow === 'imports' && ['FR', 'FC'].includes(l.from) && l.to === 'W');
  expect(legs.length).toBeGreaterThanOrEqual(5);
  for (const l of legs) expect(html).toContain(` · ${varLabel(info, l.amount)}</span>`);
});

test('the ledger shows a mixed cell’s net value, with the gross within the column as a note (M15)', () => {
  const html = renderToString(<LedgerView info={info} client={client} legs={frame.legs} columns="player" onSelect={noop} />);
  expect(html).toContain('within</span>');
  expect(html).not.toMatch(/>±1\.02</);
  const h = createEngineClient(hierarchyModel());
  // In the fixture, inputs between firms stay inside a closed Firms column: shown as ±gross.
  expect(text(renderToString(<LedgerView info={h.info} client={h} legs={h.getFrame().legs} columns="group" onSelect={noop} />))).toMatch(/>±\d/);
  h.dispose();
});

test('a rule that wants a key rate beyond the lever’s range gets a note, not Apply or a red dot (L18)', () => {
  const lever = info.leverById.get('keyRateFixed')!;
  const values = [...frame.levers];
  values[lever.index] = lever.max!;
  const stabilisers: StabiliserState[] = frame.stabilisers.map((s) => (s.lever === 'keyRateFixed' ? { ...s, suggested: lever.max! + 2, current: lever.max!, gap: 2, calling: true } : { ...s, calling: false }));
  const html = renderToString(<LeverPanel info={info} client={client} values={values} events={frame.events} stabilisers={stabilisers} />);
  expect(html).toContain('(beyond the lever’s range)</div>');
  expect(html).not.toContain('>Apply</button>');
  expect(html).not.toContain('class="call-dot"');
  expect(html).not.toMatch(/class="lever [^"]*calling"/);
  // One step short of the bound, the rule calls and Apply moves the lever to the bound.
  values[lever.index] = lever.max! - 1;
  const short = renderToString(<LeverPanel info={info} client={client} values={values} events={frame.events} stabilisers={stabilisers.map((s) => (s.lever === 'keyRateFixed' ? { ...s, current: lever.max! - 1 } : s))} />);
  expect(short).toContain('>Apply</button>');
  expect(short).toContain('class="call-dot"');
});

test('postings name instruments by their labels in a flow and on a pipe, never by id (60d4e12)', () => {
  const flow = info.flowById.get('mortgageIndexation')!;
  expect(flow.posting).toMatchObject({ type: 'accrue', instrument: 'mortgagesI' });
  const sentence = 'Interest or indexation added to mortgages, CPI-indexed:';
  const flowHtml = inspect(open({ kind: 'flow', id: flow.id }));
  expect(flowHtml).toContain(sentence);
  expect(flowHtml).not.toContain('mortgagesI');
  const leg = info.legs.find((l) => l.flow === flow.id)!;
  const pipeHtml = inspect(open({ kind: 'pipe', from: leg.from, to: leg.to, flowKind: 'accrual' }));
  expect(pipeHtml).toContain(sentence);
  expect(pipeHtml).not.toContain('added to mortgagesI');
  expect(inspect(open({ kind: 'flow', id: 'homePurchases' }))).toContain('Existing homes change hands for cash');
});

test('a flow’s explanation is shown with its {param} placeholders filled, in the flow and on a pipe (K5)', () => {
  const def = hierarchyModel();
  const wages = def.modules.flatMap((m) => m.flows ?? []).find((f) => f.id === 'wages')!;
  wages.explain = { what: 'Retail pays young households {lvl_wages_FR_H1} a year in wages.' };
  const h = createEngineClient(def);
  const flowHtml = inspect(open({ kind: 'flow', id: 'wages' }), h);
  expect(flowHtml).toContain('Retail pays young households 20 a year in wages.');
  expect(flowHtml).not.toContain('{lvl_wages_FR_H1}');
  const pipeHtml = inspect(open({ kind: 'pipe', from: 'FR', to: 'H1', flowKind: 'cash' }), h);
  expect(pipeHtml).toContain('Retail pays young households 20 a year in wages.');
  expect(pipeHtml).not.toContain('{lvl_wages_FR_H1}');
  h.dispose();
});

describe('positions with the wrong sign: a warning in the header and on the balance sheet (decision 0005, audit H1)', () => {
  const header = (c: ReturnType<typeof createEngineClient>) => {
    const f = c.getFrame();
    return text(
      renderToString(
        <Header info={c.info} client={c} t={f.t} horizon={f.horizon} playing={false} speed={1} ended={false} events={f.events} checks={f.checks} signViolations={f.signViolations} models={[{ id: c.info.id, label: c.info.label }]} modelId={c.info.id} onModelChange={noop} onShare={noop} share={{ status: 'idle' }} onShareDone={noop} />,
      ),
    );
  };

  test('the words: an asset below zero, a liability turned into a claim, and the badge count', () => {
    const w = positionWarnings(info, [
      { instrument: 'deposits', player: 'W', role: 'holder', t: 12, value: -0.5 },
      { instrument: 'govBonds', player: 'G', role: 'issuer', t: 40, value: -0.1 },
    ]);
    expect(w.map((x) => x.text)).toEqual([
      `${info.instrumentById.get('deposits')!.label} of ${info.playerById.get('W')!.label} went below zero in month 12`,
      `${info.instrumentById.get('govBonds')!.label} owed by ${info.playerById.get('G')!.label} turned into a claim in month 40`,
    ]);
    expect([0, 1, 2].map(positionBadge)).toEqual(['', '1 impossible position', '2 impossible positions']);
  });

  test('none at the baseline', () => {
    expect(frame.signViolations).toEqual([]);
    expect(header(client)).not.toContain('books warn');
    expect(inspect(open({ kind: 'player', id: 'PF' }))).not.toContain('bs-warning');
  });

  test('fish exports 2 lower: fisheries overdraw their deposits, and the header and their balance sheet say so calmly', () => {
    // In the fixture, fisheries then pay out 3 a year more than they earn from 5 in deposits.
    const h = createEngineClient(hierarchyModel(), { tickMs: 1e9 });
    h.setLever('exportBoom', -2);
    h.pause();
    h.step(36);
    const f = h.getFrame();
    expect(f.signViolations.map((v) => `${v.instrument}/${v.player}/${v.role}`)).toEqual(['deposits/FF/holder']);
    const t = f.signViolations[0].t;
    expect(t).toBeGreaterThan(12);
    // the accounts still balance: the badge is a warning, not the accounting failure
    expect(f.checks.ok).toBe(true);
    const top = header(h);
    expect(top).not.toContain('Accounts out of balance');
    expect(top).toContain('class="books warn"');
    expect(top).toContain('>1 impossible position</span>');
    expect(top).toContain(`Deposits of Fisheries went below zero in month ${t}`);
    expect(top).toContain('The books still balance');
    // on the player's balance sheet, the list and a mark on the row
    const ff = inspect(open({ kind: 'player', id: 'FF' }), h);
    expect(ff).toContain('class="bs-warning"');
    expect(ff).toContain(`<li>Deposits of Fisheries went below zero in month ${t}</li>`);
    expect(ff).toContain('(went below zero)');
    // on a group that contains them, and on no other player's
    expect(inspect(open({ kind: 'group', id: 'exporters' }), h)).toContain(`Deposits of Fisheries went below zero in month ${t}`);
    expect(inspect(open({ kind: 'player', id: 'FA' }), h)).not.toContain('bs-warning');
    // going back before that month clears the warning
    h.seek(t - 1);
    expect(h.getFrame().signViolations).toEqual([]);
    expect(header(h)).not.toContain('books warn');
    h.dispose();
  });

  test('Iceland: the frame carries the kernel’s violations, and the header lists every one (the Manual collapse known gap)', () => {
    // Non-residents now borrow krónur instead of overdrawing (review M6), so the known gap this
    // uses is the Manual collapse, where the pension funds overdraw (decision 0002 §6,
    // tests/models/iceland-balance-sheets), from month 288.
    const c = createEngineClient(iceland, { tickMs: 1e9 });
    c.setLever('publicInvestment', -3);
    c.setLever('foreignDemand', 20);
    c.setLever('incomeTax', 10);
    c.pause();
    c.step(300);
    const f = c.getFrame();
    expect(f.checks.ok).toBe(true);
    const html = header(c);
    expect(f.signViolations.length).toBeGreaterThan(0);
    expect(f.signViolations.map((v) => `${v.instrument}/${v.player}`)).toEqual(['deposits/PF']);
    for (const v of f.signViolations) expect(html).toContain(`of ${c.info.playerById.get(v.player)!.label} went below zero in month ${v.t}`);
    c.dispose();
  }, 30_000);
});
