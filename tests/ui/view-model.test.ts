/**
 * The rest of the view-model layer: navigation, markdown, player cards, ideas at play, styling
 * and model choice.
 */
import { describe, expect, test } from 'bun:test';
import { models } from '../../src/models/index.ts';
import { createEngine } from '../../src/core/engine.ts';
import { describeModel } from '../../src/ui/model/info.ts';
import { EMPTY_NAV, canBack, canForward, navBack, navClear, navCurrent, navForward, navGo, navPush, selectionScope, selectionValid, viaTarget, type Selection } from '../../src/ui/model/navigation.ts';
import { inlineText, parseInline, parseMarkdown, safeHref } from '../../src/ui/model/markdown.ts';
import { PLAYER_CARDS, resolveCardMetrics } from '../../src/ui/model/player-cards.ts';
import { staticConcepts, topIdeas } from '../../src/ui/model/ideas.ts';
import { changeBar, deviation, particleRate, pipeStyle, signTone, topChanged } from '../../src/ui/model/styling.ts';
import { pickModel } from '../../src/ui/model/registry.ts';

const reference = models.find((m) => m.id === 'reference')!;
const engine = createEngine(reference);
const info = describeModel(engine.model, (id) => engine.baseline(id));

describe('breadcrumb navigation', () => {
  const a: Selection = { kind: 'player', id: 'HH' };
  const b: Selection = { kind: 'var', id: 'consumption' };
  const c: Selection = { kind: 'concept', id: 'multiplier' };

  test('push, back, forward, go', () => {
    let n = navPush(navPush(navPush(EMPTY_NAV, a), b), c);
    expect(navCurrent(n)).toEqual(c);
    n = navBack(navBack(n));
    expect(navCurrent(n)).toEqual(a);
    expect(canBack(n)).toBe(false);
    expect(canForward(n)).toBe(true);
    n = navForward(n);
    expect(navCurrent(n)).toEqual(b);
    expect(navCurrent(navGo(n, 2))).toEqual(c);
  });

  test('opening something new drops the forward history; re-opening the current item does nothing', () => {
    let n = navPush(navPush(navPush(EMPTY_NAV, a), b), c);
    n = navBack(navBack(n));
    const d: Selection = { kind: 'indicator', id: 'output' };
    n = navPush(n, d);
    expect(n.stack).toEqual([a, d]);
    expect(navPush(n, { kind: 'indicator', id: 'output' })).toBe(n);
  });

  test('close keeps history, so Back returns to it', () => {
    const n = navClear(navPush(navPush(EMPTY_NAV, a), b));
    expect(navCurrent(n)).toBeNull();
    expect(n.stack).toEqual([a, b]);
  });

  test('history is capped', () => {
    let n = EMPTY_NAV;
    for (let i = 0; i < 80; i++) n = navPush(n, { kind: 'var', id: `v${i}` });
    expect(n.stack.length).toBe(50);
    expect(navCurrent(n)).toEqual({ kind: 'var', id: 'v79' });
  });

  test('scopes for ideas at play; validity against the model', () => {
    expect(selectionScope({ kind: 'pipe', from: 'HH', to: 'F', flowKind: 'cash', level: 'player' })).toBe('HH->F:cash');
    expect(selectionScope(c)).toBeUndefined();
    expect(selectionScope(null)).toBeUndefined();
    expect(selectionValid(a, info)).toBe(true);
    expect(selectionValid({ kind: 'player', id: 'nobody' }, info)).toBe(false);
    // every scope the interface builds is one the engine accepts
    for (const s of [a, b, { kind: 'pipe', from: 'HH', to: 'F', flowKind: 'cash', level: 'player' } as Selection, { kind: 'group', id: 'Households' } as Selection, { kind: 'indicator', id: 'broadMoney' } as Selection])
      expect(() => engine.ideasAtPlay(selectionScope(s))).not.toThrow();
  });

  test('"via" ids from ideasAtPlay resolve to readable labels and a place to go', () => {
    const t = viaTarget(info, 'consumption.income')!;
    expect(t.label).toContain('Spending out of income');
    expect(t.selection).toEqual({ kind: 'var', id: 'consumption' });
    expect(viaTarget(info, 'depositInterest')!.selection).toEqual({ kind: 'flow', id: 'depositInterest' });
    expect(viaTarget(info, 'nothing')).toBeNull();
  });
});

describe('markdown', () => {
  test('paragraphs, lists, emphasis and links', () => {
    const blocks = parseMarkdown('First *para* with **bold**.\n\n- **A:** one\n- two\n\n1. x\n2. y\n\n## Head\n\nSee [the Bank](https://www.bankofengland.co.uk/).');
    expect(blocks.map((b) => b.type)).toEqual(['p', 'ul', 'ol', 'h', 'p']);
    const p = blocks[0];
    expect(p.type === 'p' && p.children.map((x) => x.type)).toEqual(['text', 'em', 'text', 'strong', 'text']);
    expect(blocks[1].type === 'ul' && inlineText(blocks[1].items[0])).toBe('A: one');
    const link = blocks[4].type === 'p' ? blocks[4].children.find((x) => x.type === 'link') : undefined;
    expect(link && link.type === 'link' && link.href).toBe('https://www.bankofengland.co.uk/');
  });

  test('unsafe links render as text', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(parseInline('[x](javascript:alert(1))').every((x) => x.type === 'text')).toBe(true);
  });

  test('every concept body in the library parses into readable text', () => {
    for (const c of info.concepts) {
      const blocks = parseMarkdown(c.body);
      expect(blocks.length).toBeGreaterThan(0);
      const text = blocks.map((b) => (b.type === 'ul' || b.type === 'ol' ? b.items.map(inlineText).join(' ') : inlineText(b.children))).join(' ');
      expect(text).not.toContain('**');
    }
  });
});

describe('player cards', () => {
  test('the reference mapping resolves for every player', () => {
    for (const p of info.players) {
      const m = resolveCardMetrics(info, p.id);
      expect(m.length).toBeGreaterThan(0);
      expect(m.every((x) => x.kind === 'indicator' || x.kind === 'variable')).toBe(true);
    }
  });

  test('unknown ids are skipped; with nothing left the card falls back to net worth and cash in', () => {
    const m = resolveCardMetrics(info, 'HH', { HH: [{ indicator: 'nope' }, { variable: 'consumption' }] });
    expect(m.map((x) => x.key)).toEqual(['v:consumption']);
    const f = resolveCardMetrics(info, 'HH', {});
    expect(f.map((x) => x.kind)).toEqual(['netWorth', 'cashIn']);
    expect(resolveCardMetrics(info, 'HH', undefined, 1)).toHaveLength(1);
    expect(PLAYER_CARDS.reference).toBeDefined();
  });
});

describe('ideas at play', () => {
  test('ranked, normalised, with readable "via" labels, once something moves', () => {
    const e = engine.fork();
    e.setLever('keyRateAddon', 2);
    e.step(12);
    const rows = topIdeas(info, e.ideasAtPlay(), 5);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].rel).toBe(1);
    for (const r of rows) {
      expect(r.rel).toBeLessThanOrEqual(1);
      expect(r.share).toBeGreaterThan(0);
      expect(r.title).toBe(info.conceptById.get(r.concept)!.title);
    }
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeLessThanOrEqual(1 + 1e-12);
  });

  test('at the baseline nothing is at play, but the selection still names its ideas', () => {
    expect(topIdeas(info, engine.ideasAtPlay())).toEqual([]);
    const ids = staticConcepts(info, { kind: 'var', id: 'consumption' });
    expect(ids).toContain('consumption-function');
    expect(staticConcepts(info, null).length).toBeGreaterThan(0);
  });
});

describe('deviation styling', () => {
  test('amber above, blue-grey below, flat within 0.1%', () => {
    expect(deviation(105, 100).tone).toBe('up');
    expect(deviation(95, 100).tone).toBe('down');
    expect(deviation(100.05, 100).tone).toBe('flat');
    expect(deviation(0.1, 0).tone).toBe('up');
    expect(deviation(120, 100).intensity).toBe(1);
    expect(signTone(-0.3)).toBe('down');
  });

  test('particles speed up with value/baseline and stop at zero', () => {
    expect(particleRate(100, 100)).toBe(1);
    expect(particleRate(200, 100)).toBe(2);
    expect(particleRate(1000, 100)).toBe(4);
    expect(particleRate(1, 100)).toBe(0.25);
    expect(particleRate(0, 100)).toBe(0);
    expect(particleRate(2, 0)).toBe(1.5);
  });

  test('only cash pipes carry particles; other kinds are dashed; negative flows run backwards', () => {
    expect(pipeStyle('cash', 5, 5, 3)).toMatchObject({ particles: true, dashed: false, reverse: false });
    expect(pipeStyle('accrual', 5, 5, 3)).toMatchObject({ particles: false, dashed: true });
    expect(pipeStyle('cash', -2, -1, 3).reverse).toBe(true);
  });

  test('the most changed pipes are labelled', () => {
    const pipes = [0.1, 5, -3, 0, 2].map((d, i) => ({ id: i, value: 10 + d, baseline: 10 }));
    expect(topChanged(pipes, 3).map((p) => p.id)).toEqual([1, 2, 4]);
    expect(changeBar(-2, 4)).toBe(-0.5);
    expect(changeBar(1, 0)).toBe(0);
  });
});

describe('model choice', () => {
  test("opens 'iceland' when registered, else 'reference'; a link's model wins when it exists", () => {
    expect(pickModel(['reference', 'iceland'])).toBe('iceland');
    expect(pickModel(['reference'])).toBe('reference');
    expect(pickModel(['other'])).toBe('other');
    expect(pickModel(['reference', 'iceland'], 'reference')).toBe('reference');
    expect(pickModel(['reference'], 'missing')).toBe('reference');
    expect(pickModel([])).toBeUndefined();
  });
});
