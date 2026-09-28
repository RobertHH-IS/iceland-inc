/**
 * The interface renders for every registered model (react-dom/server, no browser): at the
 * baseline, after a replayed scenario from a shared link, and with the inspector open.
 */
import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { App } from '../../src/ui/App.tsx';
import { models } from '../../src/models/index.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { encodeScenarioHash } from '../../src/ui/model/scenario-url.ts';
import { EMPTY_NAV, navPush, type Selection } from '../../src/ui/model/navigation.ts';
import { Inspector } from '../../src/ui/views/Inspector.tsx';
import { IdeasAtPlay } from '../../src/ui/views/IdeasAtPlay.tsx';
import { LedgerView } from '../../src/ui/views/LedgerView.tsx';
import { FlowMap } from '../../src/ui/views/FlowMap.tsx';

for (const def of models) {
  describe(`interface for model '${def.id}'`, () => {
    test('renders <App/> at the baseline without throwing', () => {
      const html = renderToString(<App models={models} initialModelId={def.id} />);
      expect(html).toContain('ICELAND');
      expect(html).toContain(def.label);
      expect(html).toContain('Levers');
      expect(html).toContain('Inspector');
      expect(html).toContain('Ideas at play');
      // every player (or group) of the model is on the map
      const client = createEngineClient(def);
      const names = client.info.players.length > 7 ? client.info.groups.map((g) => g.label) : client.info.players.map((p) => p.label);
      const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
      for (const n of names) expect(html).toContain(esc(n.slice(0, 12)));
      client.dispose();
    });

    test('the inspector, ideas, ledger and map render every kind of selection after a shock', () => {
      const client = createEngineClient(def);
      const info = client.info;
      const setting = info.levers.find((l) => l.kind === 'setting' && l.max !== undefined && l.max > l.default);
      if (setting) client.setLever(setting.id, setting.max!);
      client.pause();
      client.step(24);
      const frame = client.getFrame();
      const pipe = frame.pipes.player.find((p) => p.kind === 'cash') ?? frame.pipes.player[0];
      const rule = info.rules.find((r) => r.terms.length > 0);
      const selections: Selection[] = [
        ...(pipe ? [{ kind: 'pipe', from: pipe.from, to: pipe.to, flowKind: pipe.kind, level: 'player' } as Selection] : []),
        { kind: 'player', id: info.players[0].id },
        { kind: 'group', id: info.groups[0].id },
        ...(rule ? [{ kind: 'var', id: rule.target } as Selection] : []),
        { kind: 'flow', id: info.flows[0].id },
        ...(info.indicators[0] ? [{ kind: 'indicator', id: info.indicators[0].id } as Selection] : []),
        ...(info.concepts[0] ? [{ kind: 'concept', id: info.concepts[0].id } as Selection] : []),
      ];
      const noop = () => {};
      let nav = EMPTY_NAV;
      for (const sel of selections) {
        nav = navPush(nav, sel);
        const html = renderToString(<Inspector info={info} client={client} frame={frame} nav={nav} onSelect={noop} onBack={noop} onForward={noop} onGo={noop} onClose={noop} />);
        expect(html).not.toContain('class="error"');
        if (sel.kind === 'pipe' || sel.kind === 'var') expect(html).toMatch(/IDENTITY|CONTRACT|BEHAVIOUR|POLICY/);
        const ideas = renderToString(<IdeasAtPlay info={info} client={client} seq={frame.seq} selection={sel} pipe={pipe} onSelect={noop} />);
        expect(ideas).toContain('Ideas at play');
      }
      for (const level of ['player', 'group'] as const) {
        expect(renderToString(<LedgerView info={info} client={client} legs={frame.legs} level={level} onSelect={noop} />)).toContain('0 ✓');
        const map = renderToString(<FlowMap info={info} client={client} level={level} pipes={frame.pipes[level]} legs={frame.legs} regimes={frame.regimes} seq={frame.seq} selection={selections[0]} onSelect={noop} />);
        expect((map.match(/class="pipe /g) ?? []).length).toBe(frame.pipes[level].length);
      }
      client.dispose();
    });

    test('replays a shared scenario from the URL hash', () => {
      const client = createEngineClient(def);
      const setting = client.info.levers.find((l) => l.kind === 'setting' && l.max !== undefined && l.max > l.default);
      const oneoff = client.info.levers.find((l) => l.kind === 'oneoff');
      const events = [
        ...(setting ? [{ t: 0, lever: setting.id, value: setting.max! }] : []),
        ...(oneoff ? [{ t: 3, lever: oneoff.id, value: oneoff.default, fire: true }] : []),
      ];
      const hash = '#' + encodeScenarioHash({ modelId: def.id, events, months: 18 });
      const html = renderToString(<App models={models} initialHash={hash} />);
      expect(html).toContain('M18');
      expect(html).not.toContain('Could not read');
      client.dispose();
    });
  });
}

test('an unknown model in a link falls back to a registered one', () => {
  const html = renderToString(<App models={models} initialHash="#m=no-such-model" />);
  expect(html).toContain('ICELAND');
  expect(html).toContain('Levers');
});
