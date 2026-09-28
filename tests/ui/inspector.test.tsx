/**
 * What the inspector, the ledger and the lever panel print (react-dom/server, no browser):
 * words from the label table instead of raw ids, one explanation per leg of a pipe, net values
 * in mixed ledger cells, and no "Apply" for a rule that wants a value beyond its lever's range.
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
import { CategoryChip } from '../../src/ui/views/common.tsx';
import { FlowMap } from '../../src/ui/views/FlowMap.tsx';
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
