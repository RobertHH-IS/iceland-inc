/**
 * The Iceland model as a port of engine v1, with firms split into six sectors (decision 0003):
 * players and groups, parameters and provenance, levers, charts, the steady state against v1's
 * published numbers, and step time.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { createEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { ALL_PARAMS, BASE } from '../../src/models/iceland/steady.ts';
import { concepts } from '../../src/concepts/library.ts';
import { withConcepts } from '../../src/models/index.ts';

const model = compile(withConcepts(icelandModel));

const V1_LEVERS = [
  'keyRateMode', 'keyRateAddon', 'keyRateFixed', 'incomeTax', 'vat', 'health', 'education', 'otherServices', 'publicInvestment',
  'oldAgeTransfers', 'familyBenefits', 'unemploymentBenefits', 'fiscalRule', 'bondBuyers', 'dstiCap', 'ltvCap', 'wageSettlement',
  'lendingAppetite', 'pfForeign', 'migration', 'foreignDemand', 'tourism', 'kronaShock', 'foreignRate', 'importPrices',
];
const SECTOR_LEVERS = ['fishPrices', 'aluminiumPrice'];
const V1_SERIES = [
  'output', 'consumption', 'investment', 'unemployment', 'unemploymentY', 'unemploymentW', 'unemploymentO', 'realWage', 'profitsFD', 'profitsFX',
  'inflation', 'priceLevel', 'expInflation', 'keyRate', 'mortgageRate', 'broadMoney', 'creditImpulse', 'creditImpulseTotal', 'netMortgage',
  'mortgageDebt', 'bankCapital', 'realHousePrice', 'krona', 'currentAccount', 'exports', 'imports', 'govBalance', 'govDebt', 'incomeTaxRate',
  'rdiY', 'rdiW', 'rdiO', 'pfAssets', 'pfForeignShare',
];
const FIRMS = ['FC', 'FR', 'XF', 'XA', 'XT', 'XO'];
const SECTOR_SERIES = ['dividendsAbroad', ...['XF', 'XA', 'XT', 'XO'].map((j) => `exports${j}`), ...FIRMS.map((j) => `profits${j}`), ...FIRMS.map((j) => `jobs${j}`)];

describe('Iceland model: structure', () => {
  test('fourteen players in a hierarchy of nine groups, with layout hints', () => {
    expect(model.players.map((p) => p.id)).toEqual(['HY', 'HW', 'HO', ...FIRMS, 'B', 'CB', 'G', 'PF', 'W']);
    expect(model.groups.map((g) => g.id)).toEqual(['households', 'firms', 'domestic', 'exporters', 'banks', 'central-bank', 'government', 'pension-funds', 'world']);
    const byId = new Map(model.groups.map((g) => [g.id, g]));
    expect(model.groups.filter((g) => !g.parent).map((g) => g.id)).toEqual(['households', 'firms', 'banks', 'central-bank', 'government', 'pension-funds', 'world']);
    expect(byId.get('firms')!.children).toEqual(['domestic', 'exporters']);
    expect(byId.get('domestic')!.players).toEqual(['FC', 'FR']);
    expect(byId.get('exporters')!.players).toEqual(['XF', 'XA', 'XT', 'XO']);
    expect(byId.get('households')!.players).toEqual(['HY', 'HW', 'HO']);
    for (const p of model.players) expect(p.layout).toBeDefined();
    for (const g of model.groups) expect(g.layout).toBeDefined();
  });

  test('the only compiler warning is the constant book value of shares (as in v1)', () => {
    expect(model.warnings).toEqual(["instrument 'shares' has no flow posting to it, so it never changes"]);
  });

  test('every parameter is declared once, by one module, with provenance; data carry a source and vintage', () => {
    const ids = icelandModel.modules.flatMap((m) => (m.params ?? []).map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...Object.keys(ALL_PARAMS)].filter((id) => !ids.includes(id))).toEqual([]);
    for (const p of model.params) {
      expect(p.provenance.basis).toBeDefined();
      if (p.provenance.basis === 'data') {
        expect(p.provenance.source ?? '').not.toBe('');
        expect(p.provenance.vintage ?? '').not.toBe('');
      }
    }
  });

  test('v1’s 25 levers, with the same ids, plus the fish- and aluminium-price levers; a precise definition each', () => {
    expect(model.levers.map((l) => l.id).sort()).toEqual([...V1_LEVERS, ...SECTOR_LEVERS].sort());
    for (const l of model.levers) expect(l.definition.length).toBeGreaterThan(40);
  });

  test('v1’s 34 charts, with the same ids, in four tabs, plus 17 charts by firm sector in a fifth', () => {
    expect(model.indicators.map((i) => i.id).sort()).toEqual([...V1_SERIES, ...SECTOR_SERIES].sort());
    expect([...new Set(model.indicators.map((i) => i.group))]).toEqual(['Overview', 'People', 'Money and credit', 'Government and world', 'Firms by sector']);
  });

  test('the seven spending channels are separate flows', () => {
    const ch = model.flows.filter((f) => f.channel).map((f) => f.channel);
    expect(ch.sort()).toEqual(['education', 'family', 'health', 'investment', 'oldAge', 'otherServices', 'unemployment']);
  });

  test('concept tags use only ids from the shared library', () => {
    const lib = new Set(concepts.map((c) => c.id));
    const used = new Set<string>();
    for (const m of icelandModel.modules) {
      for (const r of m.rules ?? []) {
        (r.concepts ?? []).forEach((c) => used.add(c));
        (r.terms ?? []).forEach((t) => t.concept && used.add(t.concept));
      }
      for (const x of [...(m.flows ?? []), ...(m.levers ?? []), ...(m.indicators ?? []), ...(m.instruments ?? [])]) (x.concepts ?? []).forEach((c) => used.add(c));
      for (const f of m.feed ?? []) if (f.concept) used.add(f.concept);
    }
    expect([...used].filter((c) => !lib.has(c))).toEqual([]);
  });
});

describe('Iceland model: the steady state matches engine v1', () => {
  // engine v1, legacy/v1-engine/test_output.txt section 1. The firm split (decision 0003) leaves the
  // parameters that do not depend on who owns which firm as they were; those that balance
  // households’ and pension funds’ dividend income and the current account move a little. v1's
  // muXD, divFXW, rhoFD0 and rhoFX0 are replaced by per-sector values.
  const V1_UNCHANGED: Record<string, number> = { tauF: 0.0901, vat0: 0.3033, cEe: 0.0465, rr: 0.3879, wsOther: 0.342, nuY: 0.0088, nuW: 0.016, mRY: 0.8906, mRW: 1.4206 };
  const V1_MOVED: Record<string, number> = { tau0: 0.3848, c0Y: 0.9612, c0W: 9.5947, c0O: 4.4101, payout: 0.1788, ageing: 0.1159, muD: 0.0267 };
  const e = createEngine(model);
  const solvedValue = (id: string) => e.baselineData.pBase[model.paramIndex.get(id)!];

  test('solved balancing parameters that do not depend on the firm split equal v1’s to four decimals', () => {
    for (const [id, want] of Object.entries(V1_UNCHANGED)) expect(Math.abs(solvedValue(id) - want)).toBeLessThan(6e-5);
  });

  test('those that balance dividend income and the current account stay within 8% of v1’s', () => {
    for (const [id, want] of Object.entries(V1_MOVED)) expect(Math.abs(solvedValue(id) / want - 1)).toBeLessThan(0.08);
  });

  test('GDP = 100 is not imposed but comes out of the closed form (v1’s gdpCheck)', () => {
    expect(Math.abs(BASE.gdpCheck)).toBeLessThan(1e-12);
    expect(Math.abs(e.baseline('nominalGDP') - 100)).toBeLessThan(1e-9);
  });

  test('the closed form is already a fixed point: Newton needs no iteration', () => {
    expect(e.baselineData.method).toBe('closed-form + newton');
    expect(e.baselineData.iterations).toBe(0);
    expect(e.baselineData.residual).toBeLessThan(1e-11);
  });

  test('balance sheet as in v1 SPEC §4: broad money 67.4, bank bonds 27.8, reserves 12.0, pension assets 179.7 (% of GDP)', () => {
    const money = ['HY', 'HW', 'HO', ...FIRMS, 'PF'].reduce((s, pl) => s + e.stock('deposits', pl), 0);
    expect(money).toBeCloseTo(67.4, 9);
    expect(e.stock('bankBonds', 'PF')).toBeCloseTo(27.85, 2);
    expect(e.stock('reserves', 'B')).toBeCloseTo(12, 9);
    const pf = ['deposits', 'govBonds', 'indexedBonds', 'bankBonds', 'mortgagesN', 'mortgagesI', 'shares', 'foreignAssets'].reduce((s, ins) => s + e.stock(ins, 'PF'), 0);
    expect(pf).toBeCloseTo(179.7, 9);
  });
});

// Shared CI runners are several times slower and noisier than a developer machine,
// so timing budgets are loosened there; the local budget stays tight.
const PERF_SLACK = process.env.CI ? 10 : 1;

describe('Iceland model: speed', () => {
  test('a shocked month steps in well under 200 µs', () => {
    const e = createEngine(model, { dev: false });
    e.fire('wageSettlement', 10);
    e.step(50); // warm up the JIT
    const t0 = performance.now();
    e.step(600);
    const us = ((performance.now() - t0) * 1000) / 600;
    console.log(`Iceland model: ${model.NV} variables, ${model.clegs.length} legs, block of ${Math.max(...model.schedule.map((b) => b.rules.length))} rules: ${us.toFixed(1)} µs per step`);
    expect(us).toBeLessThan(200 * PERF_SLACK);
  });
});
