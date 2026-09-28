/**
 * The interface renders for every registered model, and for a test model with a two-level
 * hierarchy of groups (react-dom/server, no browser): at the baseline with every group closed,
 * fully expanded, after a replayed scenario from a shared link (which may open groups), and
 * with the inspector open on every kind of selection; and the lever panel and map in both
 * stabiliser modes.
 */
import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { App } from '../../src/ui/App.tsx';
import { models } from '../../src/models/index.ts';
import type { Id, ModelDef } from '../../src/core/types.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { effectiveExpanded, expandAll, viewTree } from '../../src/ui/model/hierarchy.ts';
import { encodeScenarioHash } from '../../src/ui/model/scenario-url.ts';
import { EMPTY_NAV, navPush, type Selection } from '../../src/ui/model/navigation.ts';
import { Inspector } from '../../src/ui/views/Inspector.tsx';
import { IdeasAtPlay } from '../../src/ui/views/IdeasAtPlay.tsx';
import { LedgerView } from '../../src/ui/views/LedgerView.tsx';
import { FlowMap } from '../../src/ui/views/FlowMap.tsx';
import { LeverPanel } from '../../src/ui/views/LeverPanel.tsx';
import { hierarchyModel } from '../fixtures/hierarchy.ts';

const all: ModelDef[] = [...models, hierarchyModel()];
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const noop = () => {};

for (const def of all) {
  describe(`interface for model '${def.id}'`, () => {
    test('renders <App/> at the baseline with every group closed', () => {
      const html = renderToString(<App models={all} initialModelId={def.id} />);
      expect(html).toContain('ICELAND');
      expect(html).toContain(def.label);
      expect(html).toContain('Levers');
      expect(html).toContain('Inspector');
      expect(html).toContain('Ideas at play');
      const client = createEngineClient(def);
      const info = client.info;
      const tree = viewTree(info, effectiveExpanded(info, []));
      // every top-level node is on the map, and nothing inside a closed group is
      for (const n of tree.nodes) expect(html).toContain(esc(n.label.slice(0, 12)));
      expect(count(html, /class="node[ "]/g)).toBe(tree.nodes.length);
      expect(tree.frames).toHaveLength(0);
      const groups = tree.nodes.filter((n) => n.kind === 'group');
      expect(count(html, /class="node group/g)).toBe(groups.length);
      if (groups.length) expect(html).toContain('Expand all');
      client.dispose();
    });

    test('the map renders collapsed and fully expanded; the inspector, ideas and ledger every kind of selection', () => {
      const client = createEngineClient(def);
      const info = client.info;
      const setting = info.levers.find((l) => l.kind === 'setting' && l.max !== undefined && l.max > l.default);
      if (setting) client.setLever(setting.id, setting.max!);
      client.pause();
      client.step(24);
      const frame = client.getFrame();
      const closed = effectiveExpanded(info, []);
      const open = effectiveExpanded(info, expandAll(info));
      for (const eff of [closed, open]) {
        const tree = viewTree(info, eff);
        const pipes = client.pipes({ expanded: [...eff] });
        const map = renderToString(
          <FlowMap info={info} client={client} expanded={eff} pipes={pipes} legs={frame.legs} regimes={frame.regimes} seq={frame.seq} selection={null} onSelect={noop} onOpenGroup={noop} onCloseGroup={noop} />,
        );
        expect(count(map, /class="pipe /g)).toBe(pipes.length);
        expect(count(map, /class="node[ "]/g)).toBe(tree.nodes.length);
        expect(count(map, /class="frame depth/g)).toBe(tree.frames.length);
        expect(count(map, /class="frame-tab[ "]/g)).toBe(tree.frames.length);
        for (const n of tree.nodes) expect(map).toContain(`<title>${esc(n.kind === 'group' ? `Open ${n.label}` : n.label)}</title>`);
        // every pipe joins two nodes that are on the map
        const ids = new Set(tree.nodes.map((n) => n.id));
        for (const p of pipes) expect(ids.has(p.from) && ids.has(p.to)).toBe(true);
      }
      // fully expanded, every player has its own card
      expect(viewTree(info, open).nodes.map((n) => n.id).sort()).toEqual(info.players.map((p) => p.id).sort());

      const topPipe = client.pipes('group').find((p) => p.kind === 'cash' && p.from !== p.to) ?? client.pipes('group')[0];
      const pipe = frame.pipes.player.find((p) => p.kind === 'cash') ?? frame.pipes.player[0];
      const rule = info.rules.find((r) => r.terms.length > 0);
      const deepest = [...info.groups].sort((a, b) => b.depth - a.depth)[0];
      const selections: Selection[] = [
        ...(pipe ? [{ kind: 'pipe', from: pipe.from, to: pipe.to, flowKind: pipe.kind } as Selection] : []),
        ...(topPipe ? [{ kind: 'pipe', from: topPipe.from, to: topPipe.to, flowKind: topPipe.kind } as Selection] : []),
        { kind: 'player', id: info.players[0].id },
        { kind: 'group', id: info.groups[0].id },
        ...(deepest ? [{ kind: 'group', id: deepest.id } as Selection] : []),
        ...(rule ? [{ kind: 'var', id: rule.target } as Selection] : []),
        { kind: 'flow', id: info.flows[0].id },
        ...(info.indicators[0] ? [{ kind: 'indicator', id: info.indicators[0].id } as Selection] : []),
        ...(info.concepts[0] ? [{ kind: 'concept', id: info.concepts[0].id } as Selection] : []),
      ];
      let nav = EMPTY_NAV;
      for (const sel of selections) {
        nav = navPush(nav, sel);
        for (const eff of [closed, open]) {
          const html = renderToString(<Inspector info={info} client={client} frame={frame} nav={nav} expanded={eff} onSelect={noop} onBack={noop} onForward={noop} onGo={noop} onClose={noop} />);
          expect(html).not.toContain('class="error"');
          if (sel.kind === 'pipe' || sel.kind === 'var') expect(html).toMatch(/IDENTITY|CONTRACT|BEHAVIOUR|POLICY/);
          if (sel.kind === 'group') {
            expect(html).toContain('Balance sheet');
            expect(html).toContain('Members');
          }
          const map = renderToString(
            <FlowMap info={info} client={client} expanded={eff} pipes={client.pipes({ expanded: [...eff] })} legs={frame.legs} regimes={frame.regimes} seq={frame.seq} selection={sel} onSelect={noop} onOpenGroup={noop} onCloseGroup={noop} />,
          );
          expect(map).toContain('class="map');
        }
        const ideas = renderToString(<IdeasAtPlay info={info} client={client} seq={frame.seq} selection={sel} pipe={pipe} onSelect={noop} />);
        expect(ideas).toContain('Ideas at play');
      }
      for (const columns of ['player', 'group', { expanded: closed }, { expanded: open }] as const)
        expect(renderToString(<LedgerView info={info} client={client} legs={frame.legs} columns={columns} onSelect={noop} />)).toContain('0 ✓');
      client.dispose();
    });

    test('replays a shared scenario from the URL hash, with the groups it opens', () => {
      const client = createEngineClient(def);
      const info = client.info;
      const setting = info.levers.find((l) => l.kind === 'setting' && l.max !== undefined && l.max > l.default);
      const oneoff = info.levers.find((l) => l.kind === 'oneoff');
      const events = [...(setting ? [{ t: 0, lever: setting.id, value: setting.max! }] : []), ...(oneoff ? [{ t: 3, lever: oneoff.id, value: oneoff.default, fire: true }] : [])];
      const expanded: Id[] = [...expandAll(info)];
      const hash = '#' + encodeScenarioHash({ modelId: def.id, events, months: 18, expanded });
      const html = renderToString(<App models={all} initialHash={hash} />);
      expect(html).toContain('M18');
      expect(html).not.toContain('Could not read');
      const tree = viewTree(info, effectiveExpanded(info, expanded));
      expect(count(html, /class="node[ "]/g)).toBe(tree.nodes.length);
      for (const f of tree.frames) expect(html).toContain(`aria-label="Close ${esc(f.label)}"`);
      client.dispose();
    });
  });
}

test('a link can open one group of the hierarchy and leave the rest closed', () => {
  const html = renderToString(<App models={all} initialHash="#m=hierarchy&t=0&x=firms" />);
  expect(html).toContain('aria-label="Close Firms"');
  expect(html).toContain('<title>Open Exporters</title>');
  expect(html).toContain('<title>Open Households</title>');
  expect(html).not.toContain('<title>Fisheries</title>');
});

test('an unknown model in a link falls back to a registered one', () => {
  const html = renderToString(<App models={models} initialHash="#m=no-such-model" />);
  expect(html).toContain('ICELAND');
  expect(html).toContain('Levers');
});

describe('the lever panel and the map with stabilisers (decision 0004)', () => {
  const iceland = models.find((m) => m.id === 'iceland')!;

  test('Manual: the setting on top, only the Manual key-rate lever, red calling levers with Apply, red dots on their sections', () => {
    const client = createEngineClient(iceland);
    client.setLever('incomeTax', 1);
    client.pause();
    client.step(12);
    const f = client.getFrame();
    expect(f.stabilisers.every((s) => s.calling)).toBe(true);
    const html = renderToString(<LeverPanel info={client.info} client={client} values={f.levers} events={f.events} stabilisers={f.stabilisers} />);
    expect(html).toContain('class="stab-mode"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Manual</);
    expect(html).toContain('>Key interest rate<');
    expect(html).not.toContain('Key rate: your offset to the rule');
    expect(count(html, /class="lever [^"]*calling"/g)).toBe(1); // the Government section is closed
    expect(html).toMatch(/class="stab-call"><span>Central bank’s inflation rule: 2\.\d\d%<\/span>/);
    expect(html).toContain('>Apply</button>');
    expect(count(html, /class="call-dot"/g)).toBe(2); // Central bank and Government
    client.dispose();
  });

  test('Automatic: the offset lever instead, with what the rule sets; the map marks the key rate "rule"', () => {
    const client = createEngineClient(iceland);
    client.setLever('stabilisers', 1);
    client.pause();
    client.step(3);
    const f = client.getFrame();
    const html = renderToString(<LeverPanel info={client.info} client={client} values={f.levers} events={f.events} stabilisers={f.stabilisers} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Automatic</);
    expect(html).toContain('Key rate: your offset to the rule');
    expect(html).not.toContain('>Key interest rate<');
    expect(html).toContain('class="stab-note">Set by Central bank’s inflation rule: 3%');
    expect(html).not.toContain('class="call-dot"');
    const info = client.info;
    const eff = effectiveExpanded(info, []);
    const map = (acting: string) =>
      renderToString(<FlowMap info={info} client={client} expanded={eff} pipes={client.pipes({ expanded: [...eff] })} legs={f.legs} regimes={f.regimes} rulesActing={acting} seq={f.seq} selection={null} onSelect={noop} onOpenGroup={noop} onCloseGroup={noop} />);
    expect(count(map('keyRateRule debtRule'), /class="node-rule"/g)).toBe(1);
    expect(count(map(''), /class="node-rule"/g)).toBe(0);
    client.dispose();
  });
});
