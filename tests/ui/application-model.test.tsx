/**
 * The owner's interface rules, in the moving model the application opens on (Iceland today once it
 * is registered; until then the growing variant with financial stress it is built on, which links
 * shared before still open), compared with its own no-change run, and in the views it adds:
 * a locked lever has nothing to approve, the lever panel and the charts carry no notes, unlocking
 * hands a lever back at once with the no-change run still in step, the inspector keeps no trail
 * and lists only what is in force, and no list in the interface grows without limit.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { applicationModels, createRegisteredEngine } from '../../src/models/index.ts';
import { App } from '../../src/ui/App.tsx';
import { createEngineClient, TICK_MS, type EngineClient } from '../../src/ui/engine-client.ts';
import { CURRENT_DATA } from '../../src/ui/model/current-data.ts';
import { financialSection, MAX_BORROWER_ROWS } from '../../src/ui/model/financial-health.ts';
import { effectiveExpanded } from '../../src/ui/model/hierarchy.ts';
import { EMPTY_NAV, navPush, type Selection } from '../../src/ui/model/navigation.ts';
import { LINK_ONLY_MODELS, PREFERRED_MODELS, pickModel, switcherModels } from '../../src/ui/model/registry.ts';
import { Charts } from '../../src/ui/views/Charts.tsx';
import { CurrentDataAudit } from '../../src/ui/views/CurrentDataAudit.tsx';
import { Feed } from '../../src/ui/views/Feed.tsx';
import { FinancialDetail } from '../../src/ui/views/FinancialDetail.tsx';
import { FlowMap } from '../../src/ui/views/FlowMap.tsx';
import { Inspector } from '../../src/ui/views/Inspector.tsx';
import { LeverPanel, LeverRow } from '../../src/ui/views/LeverPanel.tsx';

const noop = () => {};
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const ids = applicationModels.map((m) => m.id);
/** The moving model the application opens on: Iceland today, or (before it is registered) the growing variant. */
const opened = ids.includes('iceland-today') ? 'iceland-today' : 'iceland-growing';
const def = applicationModels.find((m) => m.id === opened)!;
/** A client as the application makes it: the registered engine, compared with its no-change run. */
const fresh = (): EngineClient => createEngineClient(createRegisteredEngine(def), { comparison: 'no-change', tickMs: 1e9 });
const panel = (c: EngineClient) => {
  const f = c.getFrame();
  return renderToString(<LeverPanel info={c.info} client={c} values={f.levers} events={f.events} stabilisers={f.stabilisers} />);
};
const inspect = (c: EngineClient, ...s: Selection[]) =>
  renderToString(<Inspector info={c.info} client={c} frame={c.getFrame()} nav={s.reduce((n, x) => navPush(n, x), EMPTY_NAV)} expanded={effectiveExpanded(c.info, [])} onSelect={noop} onBack={noop} onForward={noop} onClose={noop} />).replace(/<!-- -->/g, '');
const css = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');

describe(`the model the application opens on ('${opened}')`, () => {
  test('it is the first preferred model, it renders, and 1× is a month every second', () => {
    expect(PREFERRED_MODELS).toEqual(['iceland-today', 'iceland', 'reference']);
    expect(LINK_ONLY_MODELS).toEqual(['iceland-growing']);
    // Iceland today, or until it is registered the growing variant, never the stationary controls
    expect(pickModel(ids)).toBe(opened);
    // a link to the growing variant still opens it, though the switcher does not list it
    expect(pickModel(ids, 'iceland-growing')).toBe('iceland-growing');
    expect(switcherModels(applicationModels, 'iceland').map((m) => m.id)).not.toContain('iceland-growing');
    expect(switcherModels(applicationModels, 'iceland-growing').map((m) => m.id)).toContain('iceland-growing');
    expect(TICK_MS).toBe(1000);
    const html = renderToString(<App initialModelId={opened} />);
    expect(html).toContain(def.label);
    // every lever with a rule starts unlocked (the key rate's section is the open one), and
    // nothing asks for anything
    const c = fresh();
    expect(c.getFrame().stabilisers.map((s) => s.locked)).toEqual([false, false]);
    c.dispose();
    expect(html).toContain('aria-label="Lock the key interest rate"');
    expect(count(html, />auto<\/span>/g)).toBe(1);
    for (const gone of ['>Apply</button>', 'class="call-dot"', 'class="stab-call"', 'class="lock-note"', 'class="crumbs"', 'class="chart-context"', 'scroll for more', 'click the card'])
      expect(html).not.toContain(gone);
  });

  test('locked: the held value and a closed padlock, with nothing to approve, in the panel and in the feed', () => {
    const c = fresh();
    c.setLever('keyRateLock', 1);
    c.setLever('incomeTax', 1); // moving it locks it
    c.pause();
    c.step(12);
    const f = c.getFrame();
    expect(f.error).toBeNull();
    expect(f.stabilisers.every((s) => s.locked)).toBe(true);
    // the kernel still knows what the rules would do, and the no-change client keeps those lines
    expect(f.feed.some((x) => x.stabiliser)).toBe(true);
    const html = panel(c);
    expect(html).toContain('aria-label="Unlock the key interest rate"');
    for (const gone of ['>auto</span>', '>Apply</button>', 'class="call-dot"', 'class="stab-call"', 'class="stab-note"']) expect(html).not.toContain(gone);
    expect(html).not.toMatch(/class="lever [^"]*calling"/);
    const feed = renderToString(<Feed info={c.info} feed={f.feed} onSelect={noop} />);
    for (const x of f.feed.filter((y) => y.stabiliser)) expect(feed).not.toContain(x.message);
    c.dispose();
  });

  test('no notes about the locks in the panel, in any lock configuration', () => {
    const c = fresh();
    const locks = c.info.stabilisers.map((s) => c.getFrame().stabilisers.find((x) => x.id === s.id)!.lock);
    const notes = c.info.stabilisers.flatMap((s) => (s.lockedAloneNote ? [s.lockedAloneNote] : []));
    expect(notes.length).toBe(2);
    for (let mask = 0; mask < 1 << locks.length; mask++) {
      locks.forEach((lock, j) => c.setLever(lock, (mask >> j) & 1));
      c.pause();
      c.step(2);
      const html = panel(c);
      expect(html).not.toContain('class="lock-note"');
      for (const note of notes) expect(html).not.toContain(note);
      expect(html).toContain('<div class="panel-body scroll"><section class="acc');
    }
    c.dispose();
  });

  test('unlocking hands the lever back at once, and the no-change run stays in step with the month that runs first', () => {
    const c = fresh();
    const lever = c.info.leverById.get('keyRate')!;
    c.step(6);
    const raised = lever.default + 3; // three points above the start value (3% on the growing variant, 8% today)
    c.setLever('keyRate', raised); // a stepper click, which locks it …
    c.setLever('keyRateLock', 0); // … and the padlock, within the same month
    c.pause();
    const f = c.getFrame();
    expect(f.error).toBeNull();
    expect(f.t).toBe(7); // the month the lever was set in ran first
    const pad = f.stabilisers.find((s) => s.lever === 'keyRate')!;
    expect(pad.locked).toBe(false);
    expect(pad.current).toBeCloseTo(raised, 12);
    const html = renderToString(<LeverRow lever={lever} value={f.levers[lever.index]} fired={0} client={c} pad={pad} />);
    expect(html).toContain('class="lever auto"');
    expect(html).toContain('>auto</span>');
    // the comparison ran that month too: one value a month on both sides, and the same months
    expect(c.referenceVarSeries!('keyRate', 0, 7)).toHaveLength(8);
    expect(c.series('keyRate')).toHaveLength(8);
    expect(c.reportSeries('output', 'nominal')).toHaveLength(8);
    expect(c.referenceReportSeries!('output', 'nominal')).toHaveLength(8);
    // against the same month of the no-change run: no effect before the change, one after it
    expect(Math.abs(c.series('keyRate')[6])).toBeLessThan(1e-10);
    expect(c.series('keyRate')[7]).toBeGreaterThan(1);
    // the rule moves it from the value set, the next month
    c.step(1);
    const next = c.getFrame().stabilisers.find((s) => s.lever === 'keyRate')!;
    expect(next.locked).toBe(false);
    expect(next.current).toBeLessThan(raised);
    expect(c.referenceVarSeries!('keyRate', 0, 8)).toHaveLength(9);
    c.dispose();
  });

  test('the charts carry no notes: the measurement buttons, and each chart with its unit and an 84 px plot', () => {
    const c = fresh();
    c.step(3);
    const f = c.getFrame();
    for (const basis of ['nominal', 'real', 'deviation'] as const) {
      const html = renderToString(<Charts info={c.info} client={c} t={f.t} events={f.events} tab={null} onTab={noop} selected={null} onSelect={noop} basis={basis} onBasis={noop} />);
      expect(html).not.toContain('class="chart-context');
      expect(html).not.toContain('charts-note');
      expect(html).not.toContain('scroll for more');
      expect(html).toContain('<div class="panel-body scroll"><div class="chart-grid"');
      expect(count(html, /aria-pressed="true"/g)).toBe(1);
      const charts = count(html, /class="chart[ "]/g);
      expect(charts).toBeGreaterThan(0);
      expect(count(html, /class="chart-unit /g)).toBe(charts);
      expect(count(html, /viewBox="0 0 160 84"/g)).toBe(charts);
    }
    c.dispose();
  });

  test('the inspector keeps no trail, and a quiet economy lists no financing and no limits', () => {
    const c = fresh();
    c.step(12);
    const firms = inspect(c, { kind: 'var', id: 'keyRate' }, { kind: 'player', id: 'B' }, { kind: 'group', id: 'firms' });
    expect(firms).not.toContain('class="crumb');
    expect(firms).toContain(`aria-label="Back to ${c.info.playerById.get('B')!.label}"`);
    for (const html of [firms, inspect(c, { kind: 'player', id: 'B' }), inspect(c, { kind: 'player', id: 'XT' })]) {
      expect(html).not.toContain('financial-detail');
      expect(html).not.toContain('Limits in force');
      expect(html).not.toContain('>normal<');
    }
    for (const members of [c.info.groupById.get('firms')!.allPlayers, ['B'], c.info.players.map((p) => p.id)]) {
      expect(financialSection(c, members)).toBeNull();
      expect(renderToString(<FinancialDetail client={c} members={members} onSelect={noop} />)).toBe('');
    }
    c.dispose();
  });

  test('financing in the inspector is only what is in force: one sector in trouble shows its own short list', () => {
    const c = fresh();
    c.setLever('tourism', -80);
    c.pause();
    c.step(48);
    expect(c.getFrame().error).toBeNull();
    const firms = c.info.groupById.get('firms')!.allPlayers;
    const section = financialSection(c, firms)!;
    expect(section.health.severity).toBe('critical');
    expect(section.bank).toEqual([]); // the bank is not a firm
    expect(section.troubled.map((b) => b.id)).toEqual(['XT']);
    const rows = section.troubled[0].rows;
    expect(rows.length).toBeLessThanOrEqual(MAX_BORROWER_ROWS);
    // every amount listed is in force: above zero, or changed from the no-change run
    for (const r of rows.slice(1)) {
      if (r.change) expect(Math.abs(c.value(r.id) - c.baseline(r.id))).toBeGreaterThan(1e-7);
      else expect(c.value(r.id)).toBeGreaterThan(1e-7);
    }
    const labels = rows.map((r) => r.label);
    // which amounts are in force is the model's outcome: on the growing variant tourism firms stay
    // current on their loans at 3% rates; opened on today's 8% they fall into arrears, so their
    // list names the overdue principal and the write-offs instead of owner support
    if (opened === 'iceland-growing') expect(labels).toEqual(['Operating cash / debt service', 'Principal refinancing refused', 'Gross credit refused', 'Owner cash support', 'Funded investment', 'Funded jobs', 'Owner payout']);
    else {
      expect(labels[0]).toBe('Operating cash / debt service');
      expect(labels).toContain('Funded jobs');
      expect(new Set(labels).size).toBe(labels.length);
    }
    const html = inspect(c, { kind: 'group', id: 'firms' });
    expect(count(html, /class="financial-driver"/g)).toBe(rows.length);
    expect(html).toContain(`<h5>${c.info.playerById.get('XT')!.label}</h5>`);
    // the sectors that pay as usual are not listed, and nothing explains itself at length
    for (const quiet of ['Unpaid interest', 'Gross credit approved', 'Click an amount', 'not additive', ...(labels.includes('Claims written off') ? [] : ['Claims written off'])]) expect(html).not.toContain(quiet);
    expect(count(html, /<p class="muted small">Sector averages/g)).toBe(1);
    c.dispose();
  });

  test('several sectors in trouble at once show one row each, never every amount of every sector', () => {
    const c = fresh();
    c.setLever('keyRate', 15);
    c.setLever('tourism', -60);
    c.setLever('foreignDemand', -30);
    c.pause();
    c.step(60);
    expect(c.getFrame().error).toBeNull();
    const all = c.info.players.map((p) => p.id);
    const section = financialSection(c, all)!;
    expect(section.troubled.length).toBeGreaterThan(1);
    expect(section.bank.length).toBeLessThanOrEqual(3);
    const html = renderToString(<FinancialDetail client={c} members={all} onSelect={noop} />);
    expect(count(html, /class="financial-driver"/g)).toBe(section.troubled.length + section.bank.length);
    expect(html).not.toContain('<h5>');
    for (const b of section.troubled) expect(html).toContain(`<span>${c.info.playerById.get(b.id)!.label}</span>`);
    c.dispose();
  }, 30_000);

  test('a card in trouble has a steady outline and a badge that names it; nothing pulses or asks for a click', () => {
    const c = fresh();
    c.setLever('tourism', -80);
    c.pause();
    c.step(48);
    const f = c.getFrame();
    const eff = effectiveExpanded(c.info, c.info.groups.map((g) => g.id));
    const map = renderToString(<FlowMap info={c.info} client={c} expanded={eff} pipes={c.pipes({ expanded: [...eff] })} legs={f.legs} regimes={f.regimes} seq={f.seq} selection={null} onSelect={noop} onOpenGroup={noop} onCloseGroup={noop} />);
    expect(count(map, /class="node[^"]* financial-critical"/g)).toBe(1);
    expect(map).toContain('Unpaid business obligations');
    for (const gone of ['click the card', 'Red pulse', 'financial-legend', 'Grey']) expect(map).not.toContain(gone);
    const critical = css.slice(css.indexOf('.node.financial-critical .node-card'), css.indexOf('.financial-detail {'));
    expect(critical).toContain('stroke: var(--flow-down)');
    expect(critical).not.toContain('animation');
    expect(css).not.toContain('financial-pulse');
    c.dispose();
  });

  test('the starting-data comparison lists each chart with the observations mapped to it, not the whole catalogue', () => {
    const c = fresh();
    const html = renderToString(<CurrentDataAudit client={c} />);
    const mapped = CURRENT_DATA.indicatorMappings.reduce((n, m) => n + m.observationIds.length, 0);
    expect(count(html, /data-indicator=/g)).toBe(c.info.indicators.length);
    expect(Math.max(...CURRENT_DATA.indicatorMappings.map((m) => m.observationIds.length))).toBeLessThanOrEqual(10);
    expect(count(html, /data-observation=/g)).toBeLessThanOrEqual(mapped);
    expect(CURRENT_DATA.records.length).toBeGreaterThan(1000); // the catalogue itself stays in the data
    expect(html).not.toContain('Full source catalogue');
    c.dispose();
  });
});
