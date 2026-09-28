/**
 * Iceland Inc.: prices and expectations (v1 equations E9, E10, E12 and E47).
 *
 * Firms price at a markup on a smoothed unit cost, made of labour and imported inputs, and
 * capacity pressure pushes prices a little above it. Import prices in shops follow world prices
 * in krónur with a lag. The CPI weights domestic goods, imported goods and housing as in the
 * Statistics Iceland basket; VAT scales the first two. Expected inflation mixes the target (the
 * anchor) with a slowly updated memory of recent inflation.
 */
import type { ModuleDef } from '../../../core/types.ts';
import { ALL_PARAMS } from '../steady.ts';
import { pickParams, stepsIn, terms, lastMonth } from '../util.ts';

const vatFactor = (c: { v(id: string): number; p(id: string): number }) => (1 + c.v('vatRate')) / (1 + c.p('vat0'));

export const prices: ModuleDef = {
  id: 'prices',
  label: 'Prices and expectations',
  description: 'Markup pricing on smoothed unit labour and import costs, import prices, the CPI with data weights, inflation and expectations.',
  requires: ['structure', 'labour-and-wages', 'external', 'housing', 'government'],
  params: pickParams(ALL_PARAMS, ['aLab', 'eta', 'lamUC', 'lamP', 'lamPm', 'omD', 'omM', 'omH', 'chi', 'lamPia']),
  vars: [
    { id: 'importPrice', label: 'Import prices', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'Prices of imported goods in shops, in krónur (1 at baseline).' },
    { id: 'unitCost', label: 'Unit cost (as firms see it)', unit: 'index', kind: 'price', scale: 'nominal', initial: 1 },
    { id: 'domesticPrice', label: 'Domestic prices', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'Prices of goods and services made in Iceland, before VAT (1 at baseline).' },
    { id: 'cpi', label: 'Consumer price index', unit: 'index', kind: 'price', scale: 'nominal', initial: 1 },
    { id: 'inflation', label: 'Inflation (this month, annualised)', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0 },
    { id: 'inflation12', label: 'Inflation (12 months)', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0 },
    { id: 'adaptiveInflation', label: 'Remembered inflation', unit: 'fraction/yr', kind: 'expectation', scale: 'none', initial: 0, description: 'A slowly updated average of recent inflation.' },
    { id: 'expectedInflation', label: 'Expected inflation', unit: 'fraction/yr', kind: 'expectation', scale: 'none', initial: 0 },
  ],
  rules: [
    {
      id: 'importPrice',
      target: 'importPrice',
      category: 'BEHAVIOUR',
      label: 'Import-price pass-through',
      inputs: ['exchangeRate', 'worldPrice'],
      adjust: { speed: 'lamPm', form: 'exponential' },
      terms: terms(['worldPriceInKronur', 'World prices in krónur', 'exchange-rate-pass-through', (c) => c.v('exchangeRate') * c.v('worldPrice')]),
      concepts: ['exchange-rate-pass-through'],
      explain: {
        what: 'What imported goods cost in Icelandic shops, in krónur.',
        rule: 'Moves toward world prices × the exchange rate (krónur per unit of foreign currency) at speed {lamPm} a year: a weaker króna makes imports dearer, but retailers pass it on gradually.',
      },
    },
    {
      id: 'unitCost',
      target: 'unitCost',
      category: 'BEHAVIOUR',
      label: 'Unit cost',
      inputs: ['wage', 'importPrice'],
      params: ['aLab'],
      adjust: { speed: 'lamUC', form: 'exponential' },
      terms: terms(
        ['labour', 'Labour cost', 'cost-pass-through', (c) => c.p('aLab') * c.v('wage')],
        ['imports', 'Imported inputs', 'exchange-rate-pass-through', (c) => (1 - c.p('aLab')) * c.v('importPrice')],
      ),
      concepts: ['cost-pass-through'],
      explain: {
        what: 'What it costs firms to make one unit, as they judge it: a smoothed mix of wages and imported inputs.',
        rule: 'Moves toward {aLab} × wage rate + (1 − {aLab}) × import prices at speed {lamUC} a year.',
      },
    },
    {
      id: 'domesticPrice',
      target: 'domesticPrice',
      category: 'BEHAVIOUR',
      label: 'Markup pricing',
      inputs: ['unitCost'],
      lagInputs: ['output'],
      params: ['eta', 'potentialOutput'],
      adjust: { speed: 'lamP', form: 'exponential' },
      terms: terms(
        ['unitCost', 'Unit cost (with the normal markup)', 'markup-pricing', (c) => c.v('unitCost')],
        ['capacity', 'Capacity pressure', 'capacity-utilisation', (c) => c.v('unitCost') * c.p('eta') * (lastMonth(c, 'output') / c.p('potentialOutput') - 1)],
      ),
      concepts: ['markup-pricing', 'cost-pass-through'],
      explain: {
        what: 'Prices of goods and services made in Iceland, before VAT.',
        rule: 'Firms aim for a price that keeps their normal markup on unit cost, raised by {eta} × the output gap when capacity is stretched, and move toward it at speed {lamP} a year.',
      },
    },
    {
      id: 'cpi',
      target: 'cpi',
      category: 'IDENTITY',
      inputs: ['domesticPrice', 'importPrice', 'housingCost', 'vatRate'],
      params: ['omD', 'omM', 'omH', 'vat0'],
      terms: terms(
        ['domestic', 'Domestic goods and services', 'markup-pricing', (c) => vatFactor(c) * c.p('omD') * c.v('domesticPrice')],
        ['imported', 'Imported goods', 'exchange-rate-pass-through', (c) => vatFactor(c) * c.p('omM') * c.v('importPrice')],
        ['housing', 'Housing', 'credit-and-house-prices', (c) => c.p('omH') * c.v('housingCost')],
      ),
      explain: {
        what: 'The consumer price index (1 at baseline).',
        rule: 'CPI = VAT factor × ({omD%} × domestic prices + {omM%} × import prices) + {omH%} × housing costs, with the Statistics Iceland basket weights. The VAT factor is (1 + VAT rate) ÷ (1 + baseline VAT rate).',
      },
    },
    {
      id: 'inflation',
      target: 'inflation',
      category: 'IDENTITY',
      inputs: ['cpi'],
      lagInputs: ['cpi'],
      compute: (c) => Math.log(c.v('cpi') / c.lag('cpi')) / c.dt,
      explain: { what: 'How fast consumer prices rose this month, at an annual rate.', rule: 'Inflation = log change in the CPI this month ÷ one month.' },
    },
    {
      id: 'inflation12',
      target: 'inflation12',
      category: 'IDENTITY',
      inputs: ['cpi'],
      lagInputs: ['cpi'],
      compute: (c) => c.v('cpi') / c.lag('cpi', stepsIn(c, 1)) - 1,
      explain: { what: 'How much consumer prices rose over the past 12 months.', rule: 'Inflation (12 months) = CPI ÷ CPI a year ago − 1.' },
    },
    {
      id: 'adaptiveInflation',
      target: 'adaptiveInflation',
      category: 'BEHAVIOUR',
      inputs: ['inflation'],
      adjust: { speed: 'lamPia', form: 'exponential' },
      terms: terms(['recent', 'Inflation this month', 'adaptive-expectations', (c) => c.v('inflation')]),
      concepts: ['adaptive-expectations'],
      explain: { what: 'Inflation as people remember it: a slowly updated average of what they have seen.', rule: 'Moves toward this month’s inflation at speed {lamPia} a year.' },
    },
    {
      id: 'expectedInflation',
      target: 'expectedInflation',
      category: 'BEHAVIOUR',
      inputs: ['adaptiveInflation'],
      params: ['chi', 'piT'],
      terms: terms(
        ['anchor', 'Inflation target (anchor)', 'anchored-expectations', (c) => c.p('chi') * c.p('piT')],
        ['remembered', 'Remembered inflation', 'adaptive-expectations', (c) => (1 - c.p('chi')) * c.v('adaptiveInflation')],
      ),
      concepts: ['anchored-expectations', 'adaptive-expectations'],
      explain: {
        what: 'The inflation people expect. It feeds wage demands, real interest rates and the central bank’s rule.',
        rule: 'Expected = {chi} × the target + (1 − {chi}) × remembered inflation. The more people trust the target, the less a burst of inflation shifts expectations.',
      },
    },
  ],
  tests: [
    {
      id: 'cpi-weights-sum-to-one',
      label: 'The CPI weights (domestic, imported, housing) from the data sum to 1, so the baseline CPI is 1',
      run: (e) => {
        const ps = e.influences('cpi').params;
        const w = ['omD', 'omM', 'omH'].reduce((s, id) => s + ps.find((p) => p.id === id)!.value, 0);
        return { pass: Math.abs(w - 1) < 1e-12 && Math.abs(e.baseline('cpi') - 1) < 1e-12, detail: `weights sum to ${w}, baseline CPI ${e.baseline('cpi')}` };
      },
    },
  ],
};
