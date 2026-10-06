/**
 * The interface renders for every registered model, and for a test model with a two-level
 * hierarchy of groups (react-dom/server, no browser): at the baseline with every group closed,
 * fully expanded, after a replayed scenario from a shared link (which may open groups), and
 * with the inspector open on every kind of selection; and the lever panel and map in both
 * stabiliser modes.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { App } from '../../src/ui/App.tsx';
import { models } from '../../src/models/index.ts';
import type { Id, ModelDef } from '../../src/core/types.ts';
import { createEngineClient } from '../../src/ui/engine-client.ts';
import { effectiveExpanded, expandAll, viewTree } from '../../src/ui/model/hierarchy.ts';
import { leverValueLabel } from '../../src/ui/model/levers.ts';
import { encodeScenarioHash } from '../../src/ui/model/scenario-url.ts';
import { EMPTY_NAV, navPush, type Selection } from '../../src/ui/model/navigation.ts';
import { Inspector } from '../../src/ui/views/Inspector.tsx';
import { IdeasAtPlay } from '../../src/ui/views/IdeasAtPlay.tsx';
import { LedgerView } from '../../src/ui/views/LedgerView.tsx';
import { FlowMap } from '../../src/ui/views/FlowMap.tsx';
import { LeverPanel, LeverRow } from '../../src/ui/views/LeverPanel.tsx';
import { Feed } from '../../src/ui/views/Feed.tsx';
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
          const html = renderToString(<Inspector info={info} client={client} frame={frame} nav={nav} expanded={eff} onSelect={noop} onBack={noop} onForward={noop} onClose={noop} />);
          expect(html).not.toContain('class="error"');
          if (sel.kind === 'pipe' || sel.kind === 'var') expect(html).toMatch(/class="chip cat cat-\w+"[^>]*>(Identity|Contract|Behaviour|Policy)</);
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

test('a lever Iceland keeps off the panel is not drawn until a shared link sets it; then it is, in its section (decision 0017)', () => {
  const plain = renderToString(<App models={models} initialHash="#m=iceland" />);
  expect(plain).toContain('>Debt-service cap<'); // Financial stability is open at the start
  expect(plain).not.toContain('>Loan-to-value cap<');
  const hash = '#' + encodeScenarioHash({ modelId: 'iceland', events: [{ t: 0, lever: 'ltvCap', value: 70 }], months: 6, expanded: [] });
  const html = renderToString(<App models={models} initialHash={hash} />);
  expect(html).toContain('>Loan-to-value cap<');
  expect(html.indexOf('>Loan-to-value cap<')).toBeGreaterThan(html.indexOf('>Debt-service cap<'));
  expect(html).toContain('aria-label="Loan-to-value cap: 70%, start value 80%');
});

test('an unknown model in a link falls back to a registered one', () => {
  const html = renderToString(<App models={models} initialHash="#m=no-such-model" />);
  expect(html).toContain('ICELAND');
  expect(html).toContain('Levers');
});

test('each small chart’s plot is 84 px tall, in its viewBox and in the stylesheet alike, so its lines stay crisp', () => {
  const html = renderToString(<App models={models} initialHash="#m=iceland" />);
  const plots = html.match(/<svg class="chart-svg[^>]*>/g) ?? [];
  expect(plots.length).toBeGreaterThan(0);
  for (const svg of plots) expect(svg).toContain('viewBox="0 0 160 84"');
  const css = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.chart \.chart-svg \{[^}]*\bheight: 84px;/);
});

describe('the lever panel and the map with padlocks (decision 0010)', () => {
  const iceland = models.find((m) => m.id === 'iceland')!;

  test('unlocked, the default: an open padlock beside each lever with a rule, the knob following the rule, no Manual/Automatic control; the map marks the key rate "auto", as the lever is', () => {
    const client = createEngineClient(iceland);
    client.setLever('otherServices', 2);
    client.pause();
    client.step(12);
    const f = client.getFrame();
    const html = renderToString(<LeverPanel info={client.info} client={client} values={f.levers} events={f.events} stabilisers={f.stabilisers} />);
    expect(html).not.toContain('>Manual<');
    expect(html).not.toContain('>Automatic<');
    expect(html).not.toContain('Padlock on'); // the padlocks are not levers of their own
    expect(html).toContain('>Key interest rate<');
    expect(html).toMatch(/aria-pressed="false" aria-label="Lock the key interest rate" title="Unlocked: Central bank’s inflation rule sets the key interest rate/);
    expect(count(html, /class="icon-btn tiny padlock"/g)).toBe(1); // the Government section is closed
    expect(html).toContain('class="lever auto"');
    expect(html).toContain('>auto</span>');
    // the knob and the value show the rule's live rate, not the stored 3%
    const live = f.stabilisers.find((s) => s.id === 'keyRateRule')!.current;
    expect(live).not.toBe(3);
    expect(html).toContain(`>${Number(live.toFixed(2))}%</span>`); // to two decimals while it moves
    // and read out the same, not to six decimals that change every month (review m7)
    expect(html).toContain(`aria-label="Key interest rate: ${Number(live.toFixed(2))}%, start value 3%`);
    expect(html).not.toContain('class="call-dot"');
    expect(html).not.toContain('>Apply</button>');
    const info = client.info;
    const eff = effectiveExpanded(info, []);
    const map = (acting: string) =>
      renderToString(<FlowMap info={info} client={client} expanded={eff} pipes={client.pipes({ expanded: [...eff] })} legs={f.legs} regimes={f.regimes} rulesActing={acting} seq={f.seq} selection={null} onSelect={noop} onOpenGroup={noop} onCloseGroup={noop} />);
    expect(count(map('keyRateRule debtRule'), /class="node-rule"/g)).toBe(1);
    expect(count(map(''), /class="node-rule"/g)).toBe(0);
    client.dispose();
  });

  test('every aria-controls names an element on the page: a closed section or info panel controls nothing (review UI-2)', () => {
    for (const m of models) {
      const client = createEngineClient(m);
      client.pause();
      const f = client.getFrame();
      const html = renderToString(<LeverPanel info={client.info} client={client} values={f.levers} events={f.events} stabilisers={f.stabilisers} />);
      const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((x) => x[1]);
      expect(controls.length).toBeGreaterThan(0); // the open sections
      for (const id of controls) expect(html).toContain(`id="${id}"`);
      // a closed section's header says it is closed and points nowhere
      if (m.id === 'iceland') expect(html).toContain('class="acc-head" aria-expanded="false">');
      client.dispose();
    }
  });

  test('a padlock closed on a moving rate shows the frozen value to two decimals', () => {
    const client = createEngineClient(iceland);
    client.fire('wageSettlement', 10);
    client.pause();
    client.step(18);
    client.setLever('keyRateLock', 1); // freezes the key rate at the rule's live value
    client.pause();
    const f = client.getFrame();
    const frozen = f.levers[client.info.levers.findIndex((l) => l.id === 'keyRate')];
    expect(Number(frozen.toFixed(2))).not.toBe(frozen); // not a round number
    const html = renderToString(<LeverPanel info={client.info} client={client} values={f.levers} events={f.events} stabilisers={f.stabilisers} />);
    expect(html).toContain(`>${Number(frozen.toFixed(2))}%</span>`);
    expect(html).not.toContain(`>${Number(frozen.toFixed(6))}%</span>`);
    client.dispose();
  });

  test('locked: a closed padlock and the held value, with nothing to approve: no Apply, no red mark, no red dot, and no “the rule would” line in the feed (owner’s decision, 2 October 2026)', () => {
    const client = createEngineClient(iceland);
    client.setLever('keyRateLock', 1);
    client.setLever('incomeTax', 1); // moving it locks it
    client.pause();
    client.step(12);
    const f = client.getFrame();
    // the kernel still knows what the rules would do (the padlock hands the lever back to them)
    expect(f.stabilisers.every((s) => s.locked && s.calling)).toBe(true);
    expect(f.feed.some((x) => x.stabiliser)).toBe(true);
    const html = renderToString(<LeverPanel info={client.info} client={client} values={f.levers} events={f.events} stabilisers={f.stabilisers} />);
    expect(html).toMatch(/aria-pressed="true" aria-label="Unlock the key interest rate" title="Locked: the key interest rate stays where you set it, and everything else reacts to it\./);
    expect(html).not.toContain('>auto</span>');
    expect(html).not.toMatch(/class="lever [^"]*calling"/);
    expect(html).not.toContain('class="stab-call"');
    expect(html).not.toContain('>Apply</button>');
    expect(html).not.toContain('class="call-dot"');
    expect(html).toContain('>3%</span>'); // held where it is
    const feed = renderToString(<Feed info={client.info} feed={f.feed} onSelect={noop} />);
    for (const x of f.feed.filter((y) => y.stabiliser)) expect(feed).not.toContain(x.message);
    client.dispose();
  });

  test('no notes about the locks in the panel, in any lock configuration; a padlock’s title stays short (owner’s decision, 2 October 2026)', () => {
    for (const m of models) {
      const client = createEngineClient(m);
      const locks = client.info.stabilisers.map((s) => client.getFrame().stabilisers.find((x) => x.id === s.id)!.lock);
      const notes = client.info.stabilisers.flatMap((s) => (s.lockedAloneNote ? [s.lockedAloneNote] : []));
      if (m.id === 'iceland') expect(notes.length).toBe(2); // the model keeps its notes, for the info panels
      // every combination of open and closed padlocks
      for (let mask = 0; mask < 1 << locks.length; mask++) {
        locks.forEach((lock, j) => client.setLever(lock, (mask >> j) & 1));
        client.pause();
        client.step(3);
        const f = client.getFrame();
        expect(f.stabilisers.map((s) => s.locked)).toEqual(locks.map((_, j) => ((mask >> j) & 1) === 1));
        const html = renderToString(<LeverPanel info={client.info} client={client} values={f.levers} events={f.events} stabilisers={f.stabilisers} />);
        expect(html).not.toContain('class="lock-note"');
        expect(html).not.toContain('nothing pulls prices back');
        expect(html).not.toContain('Why?');
        for (const note of notes) expect(html).not.toContain(note);
        for (const title of html.match(/title="Locked: [^"]*"/g) ?? []) expect(title).toEndWith('which carries on from where it is."');
        // nothing between the panel's head and its first section
        expect(html).toContain('<div class="panel-body scroll"><section class="acc');
      }
      client.dispose();
    }
  });

  test('a lever locked while the other rule acts: its stabiliser’s note only on demand, in the lever’s info panel (decision 0015)', () => {
    const client = createEngineClient(iceland);
    const info = client.info;
    const defNote = (id: string) => info.stabilisers.find((s) => s.id === id)!.lockedAloneNote!;
    /** The lever panel with these levers' info panels open. */
    const panel = (open: Id[]) => {
      const f = client.getFrame();
      return renderToString(<LeverPanel info={info} client={client} values={f.levers} events={f.events} stabilisers={f.stabilisers} initialInfo={open} />);
    };
    /** What a lever's info panel holds, in the panel with it open. */
    const about = (lever: string) => panel([lever]).match(new RegExp(`<div class="lever-info" id="lever-info-${lever}">(.*?)</div>`))![1];
    const PLAIN = /^<p>.*<\/p><p><strong>Definition\.<\/strong>.*<\/p>$/;
    // unlocked, the default: the description and the definition, nothing more
    expect(about('incomeTax')).toMatch(PLAIN);
    expect(about('incomeTax')).not.toContain(defNote('debtRule'));
    // income tax held while the central bank's rule acts: a tax change can run away (ECON-5)
    client.setLever('incomeTax', -2.5); // moving it locks it
    client.pause();
    client.step(3);
    expect(defNote('debtRule')).toMatch(/^Government borrowing and debt already adjust automatically to the cash deficit/);
    expect(defNote('debtRule')).toContain('your tax setting stays fixed');
    expect(about('incomeTax')).toEndWith(`<p>${defNote('debtRule')}</p>`);
    expect(about('keyRate')).toMatch(PLAIN);
    expect(about('keyRate')).not.toContain(defNote('keyRateRule'));
    // only there: with the info panel closed the note is nowhere in the panel, and with every
    // info panel open it is there once
    expect(panel([])).not.toContain(defNote('debtRule'));
    expect(panel([])).not.toContain('class="lever-info"');
    expect(panel(info.levers.map((l) => l.id)).split(defNote('debtRule'))).toHaveLength(2);
    // the key rate held while the debt rule acts: the debt rule steadies the economy in its place (ECON-3)
    client.setLever('incomeTaxLock', 0);
    client.setLever('keyRateLock', 1);
    client.step(1);
    expect(about('keyRate')).toEndWith(`<p>${defNote('keyRateRule')}</p>`);
    expect(about('incomeTax')).toMatch(PLAIN);
    expect(about('incomeTax')).not.toContain(defNote('debtRule'));
    // both held: neither is locked alone
    client.setLever('incomeTaxLock', 1);
    client.step(1);
    for (const html of [about('incomeTax'), about('keyRate')]) {
      expect(html).toMatch(PLAIN);
      for (const id of ['debtRule', 'keyRateRule']) expect(html).not.toContain(defNote(id));
    }
    // a held key rate off its start value has a one-click way back that keeps it locked (review m6)
    client.setLever('keyRate', 4.25);
    client.step(1);
    expect(panel([])).toContain('aria-label="Set Key interest rate back to its start value, keeping it locked"');
    client.dispose();
  });

  test('unlocking hands the lever back at once: in the frame right after, the lever is "auto" at the value held, with nothing else to click, and a month later it has moved; after a year’s hold, or with the padlock pressed before the clock ticks', () => {
    const CASES: [model: string, lever: string, held: number, label: string][] = [
      ['iceland', 'keyRate', 5, '5%'],
      ['iceland', 'incomeTax', 2, '+2 pp'],
      ['reference', 'keyRate', 5, '5%'],
      ['reference', 'taxRate', 2, '+2 pp'],
    ];
    // held for a year, or not at all: a stepper click and then the padlock within one month
    for (const [modelId, id, held, label, months] of CASES.flatMap((c) => [[...c, 12] as const, [...c, 0] as const])) {
      const client = createEngineClient(models.find((m) => m.id === modelId)!);
      const lever = client.info.leverById.get(id)!;
      const row = () => {
        const f = client.getFrame();
        const pad = f.stabilisers.find((s) => s.lever === id)!;
        return { pad, html: renderToString(<LeverRow lever={lever} value={f.levers[lever.index]} fired={0} client={client} pad={pad} />) };
      };
      client.setLever(id, held); // moving it locks it
      client.pause();
      if (months) client.step(months);
      const before = row();
      expect(before.pad.locked).toBe(true);
      expect(before.html).toContain('class="lever changed"');
      expect(Math.abs(before.pad.suggested - held)).toBeGreaterThan(1); // the rule is heading elsewhere
      const t = client.getFrame().t;
      client.setLever(before.pad.lock, 0); // the padlock, pressed
      client.pause();
      // the same month, before anything has moved: automatic already (a lever set this month
      // has its month first, so the rule takes it over from the value set)
      const { pad, html } = row();
      expect(client.getFrame().t).toBe(months ? t : t + 1);
      expect(pad.locked).toBe(false);
      expect(pad.calling).toBe(false);
      expect(pad.current).toBeCloseTo(held, 12);
      expect(html).toContain('class="lever auto"');
      expect(html).toContain('>auto</span>');
      expect(html).toContain(`<span class="lever-value mono">${label}</span>`);
      expect(html).toMatch(/aria-pressed="false" aria-label="Lock the [^"]+" title="Unlocked: /);
      // the padlock, the info toggle and the two steppers: no way back to click, nothing to approve
      expect(count(html, /<button /g)).toBe(4);
      expect(html).not.toContain('back to its start value');
      // the next month the lever shows the rule's first step from the value held
      client.step(1);
      const after = row();
      expect(after.pad.locked).toBe(false);
      expect(Math.sign(after.pad.current - held)).toBe(Math.sign(before.pad.suggested - held));
      expect(Math.abs(after.pad.current - held)).toBeGreaterThan(0.05);
      expect(after.html).toContain('class="lever auto"');
      expect(after.html).toContain(`<span class="lever-value mono">${leverValueLabel(lever, Number(after.pad.current.toFixed(2)))}</span>`);
      expect(after.html).not.toContain(`<span class="lever-value mono">${label}</span>`);
      client.dispose();
    }
  });
});
