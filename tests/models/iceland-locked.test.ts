/**
 * The economy with every policy lever locked (decision 0014; phase 4 of the long-run-anchors
 * proposal, docs/design/long-run-anchors.md §D). With the key rate and income tax both held, the
 * price level has no nominal anchor by construction, and only signs are gated as lever
 * expectations. These tripwires carry the magnitudes the signs cannot: the month a held key rate
 * reverses its effect on output, and that no inflation gap grows within twenty years. Each effect
 * is measured against the no-change run with every padlock closed (model rule 9).
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { lockAll } from '../../src/core/scenario.ts';
import { createEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { referenceModel } from '../../src/models/reference/index.ts';
import { withConcepts } from '../../src/models/index.ts';

const model = compile(withConcepts(icelandModel));
const base = createEngine(model);

/** A run from the baseline with every padlock closed at month 0 and, if given, one lever moved:
 *  settings are set (which keeps them locked), one-offs fired. */
function locked(lever: string | null, value: number, months: number) {
  const e = createEngine(model, { baseline: base.baselineData, dev: false });
  lockAll(e, true);
  if (lever) {
    if (model.levers.find((l) => l.id === lever)!.kind === 'oneoff') e.fire(lever, value);
    else e.setLever(lever, value);
  }
  e.step(months);
  return e;
}
const series = (e: ReturnType<typeof locked>, id: string) => e.series(id).map((p) => p.v);
const noChange = locked(null, 0, 240);

describe('decision 0014: the held-rate reversal, the interest-income channel', () => {
  test('a key rate held at 6% with income tax locked cools output for about ten years, then lifts it: back above baseline in months 110–160', () => {
    const e = locked('keyRate', 6, 240);
    const output = series(e, 'output');
    // Cooling first: every month of the first eight years below baseline (the sign the lever
    // expectation gates as a mean), with the trough in the fourth year (−2.3% in month 39).
    expect(Math.max(...output.slice(1, 97))).toBeLessThan(0);
    // Then the reversal: month 126 (124 before the long-run-anchors phases). With tax rates held,
    // the government's growing interest bill is private income, and once enough debt has built up,
    // spending out of it outweighs the higher rate (Godley and Lavoie's model PC). That is the
    // strong end of the evidence (Jordà, Singh and Taylor 2024; Auclert 2019), so it is pinned as a
    // tripwire, not gated as an expectation: earlier than month 110 would mean the channel has
    // grown stronger, later than month 160 that it has gone.
    const back = output.findIndex((y, m) => m >= 24 && y > 0);
    expect(back).toBeGreaterThanOrEqual(110);
    expect(back).toBeLessThanOrEqual(160);
    // The channel, as the key-rate definition describes it. At once: older households' interest
    // income, about 13% higher in real terms in month 1.
    const real = (x: ReturnType<typeof locked>, id: string, m: number) => x.valueAt(id, m) / x.valueAt('cpi', m);
    const gain = (id: string, m: number) => real(e, id, m) / real(noChange, id, m) - 1;
    expect(gain('propertyIncomeO', 1)).toBeGreaterThan(0.1);
    // Slowly, through the pension funds: their extra income is credited to members' rights, and
    // pensions rise only as those rights are paid out: real payouts +0.7% after a year, +8.5%
    // after ten years (+12.8% after twenty).
    expect(gain('pensionPayouts', 12)).toBeLessThan(0.01);
    expect(gain('pensionPayouts', 120)).toBeGreaterThan(0.05);
    expect(e.valueAt('returnsCredited', 120)).toBeGreaterThan(noChange.valueAt('returnsCredited', 120) + 1);
  });
});

describe('decision 0014: no inflation gap grows within twenty years with every policy lever locked', () => {
  /** How much the absolute inflation gap (12-month CPI inflation, pp, against the no-change run)
   *  grows from month 180 to month 240. The first revision of the proposal gated the change in
   *  inflation itself, which also caught a gap shrinking toward zero (pension funds' foreign share
   *  −20 then); this is its re-specification. */
  const growth = (e: ReturnType<typeof locked>) => {
    const inf = series(e, 'inflation'), nc = series(noChange, 'inflation');
    return Math.abs(inf[240] - nc[240]) - Math.abs(inf[180] - nc[180]);
  };

  test('every lever alone at its min and at its max (every option of a choice): the absolute gap grows by less than 0.5 points over months 180–240, except the 15% key rate', () => {
    const rows: { run: string; growth: number }[] = [];
    for (const l of model.levers) {
      if (l.kind === 'lock') continue;
      const values = l.kind === 'choice' ? (l.options ?? []).map((o) => o.value) : [l.min, l.max];
      for (const v of values) if (v !== undefined && v !== l.default) rows.push({ run: `${l.id} ${v}`, growth: growth(locked(l.id, v, 240)) });
    }
    expect(rows.length).toBeGreaterThan(40);
    // The documented exception: a key rate held at 15% with tax rates fixed compounds interest on a
    // debt that nothing pays down (the rate far above growth), so its inflation gap keeps growing
    // (+2.16 points over months 180–240). It stays pinned as growing, so that the exception is
    // dropped if it no longer needs to be.
    const exception = rows.find((r) => r.run === 'keyRate 15')!;
    expect(exception.growth).toBeGreaterThan(0.5);
    // Everything else. The largest now is public investment −3 (+0.34); income tax +10, 1.33 on
    // main before the long-run-anchors phases, is +0.25.
    const worst = rows.filter((r) => r !== exception).sort((a, b) => b.growth - a.growth);
    expect(worst.filter((r) => r.growth >= 0.5)).toEqual([]);
    expect(worst[0].growth).toBeGreaterThan(0); // the gaps are measured, not all zero
  }, 60_000);
});

describe('decision 0014: what the texts teach about the locked economy', () => {
  const reference = compile(withConcepts(referenceModel));
  const definitions = [...model.levers, ...reference.levers].map((l) => `${l.id}: ${l.definition}`);
  const def = (m: typeof model, id: string) => m.levers.find((l) => l.id === id)!.definition;
  const sentences = (text: string) => text.split(/(?<=[.:;])\s+/);

  test('the held-rate reversal is the interest-income channel, at the strong end of the evidence, in both models', () => {
    for (const d of [def(model, 'keyRate'), def(reference, 'keyRate')]) {
      expect(d).toMatch(/interest-income channel of stock-flow models/);
      expect(d).toMatch(/strong end of the evidence/);
      expect(d).toMatch(/Jordà, Singh and Taylor 2024/);
      expect(d).toMatch(/Auclert 2019/);
    }
  });

  test('interest reaches pensioners slowly, through credited returns; pension funds do not spend it', () => {
    const d = def(model, 'keyRate');
    expect(d).toMatch(/slowly, through the pension funds, whose extra income is credited to members’ pension rights/);
    expect(d).not.toMatch(/pension funds, who spend it/);
  });

  test('fiscal dominance appears only as a route the model lacks, and the fiscal theory of the price level only as a contrast', () => {
    const dominance = definitions.flatMap((d) => sentences(d).filter((s) => /fiscal dominance/i.test(s)));
    expect(dominance.length).toBeGreaterThan(0);
    for (const s of dominance) expect(s).toMatch(/which the model leaves out/);
    const ftpl = definitions.flatMap((d) => sentences(d).filter((s) => /fiscal theory/i.test(s)));
    expect(ftpl.length).toBeGreaterThan(0);
    for (const s of ftpl) expect(s).toMatch(/^Nor does the model follow the fiscal theory/);
  });

  test('the tax and spending levers name Wicksell’s cumulative process and the honest limit', () => {
    for (const id of ['incomeTax', 'vat', 'health', 'publicInvestment', 'unemploymentBenefits']) {
      const d = def(model, id);
      expect(d).toMatch(/Wicksell’s cumulative process/);
      expect(d).toMatch(/With the key rate held and tax rates fixed, nothing but people’s partial trust in the target anchors prices/);
      expect(d).toMatch(/an open question about the model, not a law of economics/);
    }
  });
});
