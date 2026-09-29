/**
 * The Iceland model as a port of engine v1, with firms split into six sectors (decision 0003):
 * players and groups, parameters and provenance, levers, charts, the steady state against v1's
 * published numbers, and step time.
 */
import { describe, expect, test } from 'bun:test';
import { compile } from '../../src/core/compile.ts';
import { lockAll } from '../../src/core/scenario.ts';
import { createEngine } from '../../src/core/engine.ts';
import { icelandModel } from '../../src/models/iceland/index.ts';
import { ALL_PARAMS, BASE } from '../../src/models/iceland/steady.ts';
import { concepts } from '../../src/concepts/library.ts';
import { withConcepts } from '../../src/models/index.ts';
import { snapToStep } from '../../src/ui/model/levers.ts';

const model = compile(withConcepts(icelandModel));

// v1's levers, less its two policy-rule switches (keyRateMode, fiscalRule), which padlocks replaced
// (decisions 0004 and 0010), and less its key-rate add-on: a rule can no longer be tilted.
const V1_LEVERS = [
  'keyRate', 'incomeTax', 'vat', 'health', 'education', 'otherServices', 'publicInvestment',
  'oldAgeTransfers', 'familyBenefits', 'unemploymentBenefits', 'bondBuyers', 'dstiCap', 'ltvCap', 'wageSettlement',
  'lendingAppetite', 'pfForeign', 'migration', 'foreignDemand', 'tourism', 'kronaShock', 'foreignRate', 'importPrices',
];
const SECTOR_LEVERS = ['fishPrices', 'aluminiumPrice'];
/** The padlocks the compiler adds, one per stabiliser (decision 0010). */
const STABILISER_LEVERS = ['keyRateLock', 'incomeTaxLock'];
/** A labour-supply shock into a steady economy (labour-LAB-6). */
const LABOUR_LEVERS = ['netImmigration'];
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

  test('v1’s levers with the same ids (less its two rule switches and the add-on), the fish- and aluminium-price levers, the two padlocks and net immigration; a precise definition each', () => {
    expect(model.levers.map((l) => l.id).sort()).toEqual([...V1_LEVERS, ...SECTOR_LEVERS, ...STABILISER_LEVERS, ...LABOUR_LEVERS].sort());
    for (const l of model.levers) expect(l.definition.length).toBeGreaterThan(40);
  });

  test('two stabilisers, each with a padlock on its lever, unlocked by default', () => {
    expect(model.stabilisers.map((s) => [s.id, s.lever, s.suggestion])).toEqual([
      ['keyRateRule', 'keyRate', 'keyRateSuggestion'],
      ['debtRule', 'incomeTax', 'taxRuleSuggestion'],
    ]);
    const lever = (id: string) => model.levers.find((l) => l.id === id)!;
    for (const [lock, locks] of [
      ['keyRateLock', { lever: 'keyRate', stabiliser: 'keyRateRule' }],
      ['incomeTaxLock', { lever: 'incomeTax', stabiliser: 'debtRule' }],
    ] as const) {
      expect(lever(lock).kind).toBe('lock');
      expect(lever(lock).default).toBe(0);
      expect(lever(lock).locks).toEqual(locks);
    }
    // no global setting and no offsets any more
    for (const id of ['stabilisers', 'keyRateAddon', 'keyRateFixed', 'incomeTaxOffset']) expect(model.levers.some((l) => l.id === id)).toBe(false);
    const e = createEngine(model, { dev: false });
    expect(e.stabilisers().map((s) => [s.lock, s.locked])).toEqual([
      ['keyRateLock', false],
      ['incomeTaxLock', false],
    ]);
  });

  test('the debt rule is counted once: after “Apply” while income tax is locked, unlocking moves the tax rate only by one smoothed step of the rule (audit M8)', () => {
    const e = createEngine(model, { dev: false });
    lockAll(e); // both policy levers locked
    e.setLever('otherServices', 3); // debt builds up, so the rule calls for a higher tax
    e.step(48);
    const rule = e.stabilisers().find((s) => s.id === 'debtRule')!;
    expect(rule.calling).toBe(true);
    const info = model.levers.map((l, index) => ({ ...l, index }));
    const applied = snapToStep(info.find((l) => l.id === 'incomeTax')!, rule.suggested);
    e.setLever('incomeTax', applied); // Apply
    e.step(1);
    const manual = e.value('taxRate');
    const heading = e.value('taxRuleTarget');
    e.setLever('incomeTaxLock', 0);
    expect(e.leverValue('incomeTax')).toBe(applied); // the lever keeps its value; unlocked, it no longer counts
    e.step(1);
    const tau0 = e.influences('taxRate').params.find((p) => p.id === 'tau0')!.value;
    const k = 1 - Math.exp(-e.influences('taxRuleAdjustment').params.find((p) => p.id === 'lamTau')!.value / 12);
    // Unlocked: the baseline rate plus the rule's adjustment, and nothing from the lever on top.
    expect(e.value('taxRate')).toBeCloseTo(tau0 + e.value('taxRuleAdjustment'), 15);
    // The rule steps from the rate in force (the applied lever), so the rate moves by one smoothed
    // step toward where the rule is heading, not by the whole adjustment a second time.
    expect(Math.abs(applied / 100 - heading)).toBeLessThanOrEqual(0.0025 + 1e-12);
    expect(Math.abs(e.value('taxRate') - manual - k * (e.value('taxRuleTarget') - applied / 100))).toBeLessThan(1e-12);
    expect(Math.abs(e.value('taxRate') - manual)).toBeLessThan(applied / 100 / 2);
  });

  test('unlocking income tax after a held tax cut moves the tax rate one small step from the rate you held, not to the debt rule’s path (lever review MON-2 item 6)', () => {
    const e = createEngine(model, { dev: false });
    lockAll(e); // both policy levers locked
    e.setLever('incomeTax', -3);
    e.step(60);
    const held = e.value('taxRate');
    e.setLever('incomeTaxLock', 0);
    e.step(1);
    const k = 1 - Math.exp(-e.influences('taxRuleAdjustment').params.find((p) => p.id === 'lamTau')!.value / 12);
    const move = e.value('taxRate') - held;
    // before the anchor, the rate jumped from 35.53% to 39.38% in this month
    expect(Math.abs(move - k * (e.value('taxRuleTarget') + 0.03))).toBeLessThan(1e-12);
    expect(Math.abs(move)).toBeLessThan(0.005);
  });

  test('v1’s 34 charts, with the same ids, in four tabs, plus all jobs (lever review EXPECTATION-GAPS) and 17 charts by firm sector in a fifth', () => {
    expect(model.indicators.map((i) => i.id).sort()).toEqual([...V1_SERIES, 'employment', ...SECTOR_SERIES].sort());
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
  // muXD, divFXW, rhoFD0 and rhoFX0 are replaced by per-sector values. Public gross wages divide
  // compensation by the same labour-cost factor as private ones (audit L11), so the public wage bill
  // is 5.7% smaller than in v1, which moves the parameters solved from the wage bill (cEe, rr, nuY,
  // nuW, mRY, mRW) by up to 6%.
  const V1_UNCHANGED: Record<string, number> = { tauF: 0.0901, vat0: 0.3033, wsOther: 0.342 };
  // Old-age and disability transfers now come from TR's payments (audit L15), which moves the split of
  // gross income by age, and with it the debt-to-income ratios mR* and the debt-service shares nu*.
  // v1's debt-service cap was a share of gross income; it is now a share of income after income tax
  // (Rules 1300/2025, audit M4), so nu × (1 − tau0) is what compares with v1's nu. Tax-free child and
  // housing benefits are now outside gross income but inside the income the mortgage rules read
  // (review SP-4), which leaves mR* as they were and moves nu* × (1 − tau0) by about 3%.
  // These six moved for a stated reason, so each is pinned at its new value (to 0.01%), and its move
  // from v1 must stay within 8%: an unintended move of a few percent fails the first check.
  const solvedValue = (id: string) => e.baselineData.pBase[model.paramIndex.get(id)!];
  // nu now also covers the loans sellers pay off when homes change hands within an age group (turnRate
  // × sellerDebt, lever review credit-gross-mortgage-flows-vs-home-purchases and its review), so v1's
  // nu compares with nu × the share of gross lending that is amortisation.
  const param = (id: string) => model.params.find((p) => p.id === id)!.value;
  const afterTax = (id: 'nuY' | 'nuW') => {
    const sold = param('turnRate') * solvedValue(id === 'nuY' ? 'sellerDebtY' : 'sellerDebtW');
    return solvedValue(id) * (1 - solvedValue('tau0')) * (1 / param('Tm') / (1 / param('Tm') + sold));
  };
  const V1_EXPLAINED: Record<string, { v1: number; now: number; value: () => number }> = {
    cEe: { v1: 0.0465, now: 0.048975, value: () => solvedValue('cEe') },
    rr: { v1: 0.3879, now: 0.393879, value: () => solvedValue('rr') },
    mRY: { v1: 0.8906, now: 0.923974, value: () => solvedValue('mRY') },
    mRW: { v1: 1.4206, now: 1.430036, value: () => solvedValue('mRW') },
    'nuY × (1 − tau0)': { v1: 0.0088, now: 0.0087939, value: () => afterTax('nuY') },
    'nuW × (1 − tau0)': { v1: 0.016, now: 0.0159011, value: () => afterTax('nuW') },
  };
  const V1_MOVED: Record<string, number> = { tau0: 0.3848, c0Y: 0.9612, c0W: 9.5947, c0O: 4.4101, payout: 0.1788, ageing: 0.1159, muD: 0.0267 };
  const e = createEngine(model);

  test('solved balancing parameters that do not depend on the firm split equal v1’s to four decimals', () => {
    for (const [id, want] of Object.entries(V1_UNCHANGED)) expect(Math.abs(solvedValue(id) - want)).toBeLessThan(6e-5);
  });

  test('those the public wage bill, TR’s payments and after-tax income move are pinned at their new values, within 8% of v1’s', () => {
    for (const [id, { v1, now, value }] of Object.entries(V1_EXPLAINED)) {
      expect(Math.abs(value() / now - 1), id).toBeLessThan(1e-4);
      expect(Math.abs(value() / v1 - 1), id).toBeLessThan(0.08);
    }
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
  test('a shocked month steps in well under 250 µs', () => {
    const e = createEngine(model, { dev: false });
    lockAll(e); // both policy levers locked
    e.fire('wageSettlement', 10);
    e.step(50); // warm up the JIT
    const t0 = performance.now();
    e.step(600);
    const us = ((performance.now() - t0) * 1000) / 600;
    console.log(`Iceland model: ${model.NV} variables, ${model.clegs.length} legs, block of ${Math.max(...model.schedule.map((b) => b.rules.length))} rules: ${us.toFixed(1)} µs per step`);
    // About 150–180 µs alone with 413 variables; 250 leaves room for another test run sharing the
    // machine (it measured 205 µs under load at 200, lever review perf-test-flaky).
    expect(us).toBeLessThan(250 * PERF_SLACK);
  });
});
