/**
 * Iceland Inc.: prices and expectations (v1 equations E9, E10, E12 and E47).
 *
 * Firms price at a markup on a smoothed unit cost, made of labour and imported inputs (pay rises
 * are priced in faster than moves in import costs), and capacity pressure pushes prices a little
 * above it. Imports are invoiced in foreign currency, so what Iceland pays abroad (border import
 * prices) moves with world prices × the exchange rate at once; importers pass it on to the prices
 * they charge in Iceland (wholesale import prices) with a lag, and their margins take the difference
 * meanwhile. Buyers in Iceland pay more: the domestic cost of getting the goods to them (unloading,
 * wholesale, transport and retail) is part of what shops and firms pay, so only part of a weaker
 * króna reaches the CPI and unit cost (review E6). The CPI weights domestic goods, imported goods and housing as in the
 * Statistics Iceland basket; VAT scales the first two. Household spending is turned into a volume
 * with a consumption deflator that leaves out the housing part, which here follows market rents
 * and is mostly owner-occupiers' imputed rent, never paid in cash (audit H4). Expected inflation
 * mixes the target (the anchor) with a slowly updated memory of recent inflation.
 */
import type { ModuleDef } from '../../../core/types.ts';
import { ALL_PARAMS, base } from '../steady.ts';
import { pickParams, stepsIn, terms, lastMonth } from '../util.ts';

/** How far VAT in shop prices is above or below its baseline: (1 + the rate built into prices) ÷
 *  (1 + the baseline rate). */
const vatFactor = (c: { v(id: string): number; p(id: string): number }) => (1 + c.v('vatInPrices')) / (1 + c.p('vat0'));

export const prices: ModuleDef = {
  id: 'prices',
  label: 'Prices and expectations',
  description: 'Markup pricing on smoothed unit labour and import costs, import prices, the CPI with data weights, inflation and expectations.',
  requires: ['structure', 'labour-and-wages', 'external', 'housing', 'government'],
  params: pickParams(ALL_PARAMS, ['aLab', 'eta', 'lamUC', 'lamUCw', 'lamP', 'lamPm', 'distM', 'omD', 'omM', 'omH', 'chi', 'lamPia', 'lamVat']),
  vars: [
    {
      id: 'borderImportPrice',
      label: 'Border import prices',
      unit: 'index',
      kind: 'price',
      scale: 'nominal',
      initial: 1,
      description: 'What Iceland pays abroad for its imports, in krónur: world prices × the exchange rate (1 at baseline). Imports are invoiced in foreign currency, so it moves with the króna at once. Imports are paid for at these prices.',
    },
    {
      id: 'importPrice',
      label: 'Wholesale import prices',
      unit: 'index',
      kind: 'price',
      scale: 'nominal',
      initial: 1,
      description: 'What importers charge in Iceland for imported goods and inputs as they arrive (1 at baseline): border import prices, passed on with a lag.',
    },
    {
      id: 'deliveredImportPrice',
      label: 'Imported goods, delivered',
      unit: 'index',
      kind: 'price',
      scale: 'nominal',
      initial: 1,
      description: 'What buyers in Iceland pay for imported goods and inputs, before VAT (1 at baseline): import prices plus the Icelandic cost of getting them to the buyer (unloading, wholesale, transport and retail).',
    },
    { id: 'labourCostSeen', label: 'Labour cost (as firms see it)', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'The wage rate as firms build it into their prices (1 at baseline).' },
    { id: 'importCostSeen', label: 'Import cost (as firms see it)', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'What imported inputs cost delivered, as firms build it into their prices (1 at baseline).' },
    { id: 'unitCost', label: 'Unit cost (as firms see it)', unit: 'index', kind: 'price', scale: 'nominal', initial: 1 },
    { id: 'domesticPrice', label: 'Domestic prices', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'Prices of goods and services made in Iceland, before VAT (1 at baseline).' },
    { id: 'vatInPrices', label: 'VAT built into shop prices', unit: 'fraction', kind: 'rate', scale: 'none', initial: base('vatRate'), description: 'The VAT rate shops have so far passed into their prices: it follows the statutory rate within a few months.' },
    { id: 'cpi', label: 'Consumer price index', unit: 'index', kind: 'price', scale: 'nominal', initial: 1 },
    { id: 'cpiExTax', label: 'Consumer prices at constant VAT', unit: 'index', kind: 'price', scale: 'nominal', initial: 1, description: 'The CPI with VAT held at its baseline rate (1 at baseline), like Statistics Iceland’s index at constant tax rates.' },
    {
      id: 'consumptionDeflator',
      label: 'Prices of what households pay for',
      unit: 'index',
      kind: 'price',
      scale: 'nominal',
      initial: 1,
      description: 'The CPI without its housing part: domestic and imported goods and services with VAT (1 at baseline). It turns household spending into a volume.',
    },
    { id: 'inflation', label: 'Inflation (this month, annualised)', unit: 'fraction/yr', kind: 'rate', scale: 'none', initial: 0 },
    { id: 'inflation12', label: 'Inflation (12 months)', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0 },
    { id: 'inflation12ExTax', label: 'Inflation at constant VAT (12 months)', unit: 'fraction', kind: 'rate', scale: 'none', initial: 0, description: 'How much consumer prices at constant VAT rose over the past 12 months.' },
    { id: 'adaptiveInflation', label: 'Remembered inflation', unit: 'fraction/yr', kind: 'expectation', scale: 'none', initial: 0, description: 'A slowly updated average of recent inflation.' },
    { id: 'expectedInflation', label: 'Expected inflation', unit: 'fraction/yr', kind: 'expectation', scale: 'none', initial: 0 },
  ],
  rules: [
    {
      id: 'borderImportPrice',
      target: 'borderImportPrice',
      category: 'IDENTITY',
      label: 'Imports invoiced in foreign currency',
      inputs: ['exchangeRate', 'worldPrice'],
      compute: (c) => c.v('exchangeRate') * c.v('worldPrice'),
      concepts: ['exchange-rate-pass-through'],
      explain: {
        what: 'What Iceland pays abroad for its imports, in krónur. Imports are paid for at these prices.',
        rule: 'Border import prices = world prices × the exchange rate (krónur per unit of foreign currency). Almost all of Iceland’s imports are invoiced in foreign currency, mostly euros and dollars, so a weaker króna makes the import bill dearer in krónur at once.',
      },
    },
    {
      id: 'importPrice',
      target: 'importPrice',
      category: 'BEHAVIOUR',
      label: 'Import-price pass-through',
      inputs: ['borderImportPrice'],
      adjust: { speed: 'lamPm', form: 'exponential' },
      terms: terms(['border', 'What importers pay abroad (border import prices)', 'exchange-rate-pass-through', (c) => c.v('borderImportPrice')]),
      concepts: ['exchange-rate-pass-through'],
      explain: {
        what: 'What importers charge in Iceland for imported goods and inputs as they arrive: the wholesale price, before the domestic distribution margin.',
        rule: 'Moves toward border import prices (world prices × the exchange rate) at speed {lamPm} a year: importers pay the new price abroad at once, but reprice their stocks and contracts at home gradually, and their margins take the difference meanwhile.',
      },
    },
    {
      id: 'deliveredImportPrice',
      target: 'deliveredImportPrice',
      category: 'IDENTITY',
      label: 'Distribution margin',
      inputs: ['importPrice'],
      lagInputs: ['domesticPrice'],
      params: ['distM'],
      terms: terms(
        ['imported', 'The goods as they arrive', 'exchange-rate-pass-through', (c) => (1 - c.p('distM')) * c.v('importPrice')],
        ['distribution', 'Unloading, wholesale, transport and retail in Iceland', 'markup-pricing', (c) => c.p('distM') * lastMonth(c, 'domesticPrice')],
      ),
      concepts: ['exchange-rate-pass-through'],
      explain: {
        what: 'What households and firms in Iceland pay for imported goods and inputs, before VAT.',
        rule: 'Delivered price = (1 − {distM}) × import prices + {distM} × last month’s domestic prices. The second part is the Icelandic cost of getting the goods to the buyer (unloading, wholesale, transport and retail), paid in krónur and priced like other domestic goods. So when foreign currency becomes 10% dearer, what buyers pay for imported goods rises by 10% × (1 − {distM}) once import prices have caught up, and by more only as domestic prices rise too.',
      },
    },
    {
      id: 'labourCostSeen',
      target: 'labourCostSeen',
      category: 'BEHAVIOUR',
      label: 'Labour cost as firms see it',
      inputs: ['wage'],
      adjust: { speed: 'lamUCw', form: 'exponential' },
      terms: terms(['wage', 'Wage rate', 'cost-pass-through', (c) => c.v('wage')]),
      concepts: ['cost-pass-through'],
      explain: {
        what: 'The wage rate as firms build it into their costs, 1 at baseline.',
        rule: 'Moves toward the wage rate at speed {lamUCw} a year: pay rises are known and hit every payslip, so firms price them in within a few months.',
      },
    },
    {
      id: 'importCostSeen',
      target: 'importCostSeen',
      category: 'BEHAVIOUR',
      label: 'Import cost as firms see it',
      inputs: ['deliveredImportPrice'],
      adjust: { speed: 'lamUC', form: 'exponential' },
      terms: terms(['delivered', 'Imported inputs as delivered', 'exchange-rate-pass-through', (c) => c.v('deliveredImportPrice')]),
      concepts: ['exchange-rate-pass-through'],
      explain: {
        what: 'What imported inputs cost as firms build it into their prices, 1 at baseline.',
        rule: 'Moves toward what imported inputs cost delivered at speed {lamUC} a year: firms work through stocks bought earlier and wait to see whether a move in the króna lasts.',
      },
    },
    {
      id: 'unitCost',
      target: 'unitCost',
      category: 'IDENTITY',
      label: 'Unit cost',
      inputs: ['labourCostSeen', 'importCostSeen'],
      params: ['aLab'],
      terms: terms(
        ['labour', 'Labour cost', 'cost-pass-through', (c) => c.p('aLab') * c.v('labourCostSeen')],
        ['imports', 'Imported inputs', 'exchange-rate-pass-through', (c) => (1 - c.p('aLab')) * c.v('importCostSeen')],
      ),
      concepts: ['cost-pass-through'],
      explain: {
        what: 'What it costs firms to make one unit, as they judge it: a mix of wages and imported inputs.',
        rule: 'Unit cost = {aLab} × labour cost as firms see it + (1 − {aLab}) × imported inputs as firms see it. Firms price in a pay rise faster ({lamUCw} a year) than a move in import costs ({lamUC} a year).',
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
      id: 'vatInPrices',
      target: 'vatInPrices',
      category: 'BEHAVIOUR',
      label: 'VAT pass-through',
      inputs: ['vatRate'],
      adjust: { speed: 'lamVat', form: 'exponential' },
      terms: terms(['statutory', 'The VAT rate in force', 'cost-pass-through', (c) => c.v('vatRate')]),
      concepts: ['cost-pass-through'],
      explain: {
        what: 'The VAT rate shops have built into their prices so far.',
        rule: 'Moves toward the VAT rate in force at speed {lamVat} a year: shops reprice over a few months, not all on the day the rate changes. Until they do, the difference stays in their margins (VAT itself is paid at the new rate at once).',
      },
    },
    {
      id: 'cpi',
      target: 'cpi',
      category: 'IDENTITY',
      inputs: ['domesticPrice', 'deliveredImportPrice', 'housingCost', 'vatInPrices'],
      params: ['omD', 'omM', 'omH', 'vat0'],
      terms: terms(
        ['domestic', 'Domestic goods and services', 'markup-pricing', (c) => vatFactor(c) * c.p('omD') * c.v('domesticPrice')],
        ['imported', 'Imported goods', 'exchange-rate-pass-through', (c) => vatFactor(c) * c.p('omM') * c.v('deliveredImportPrice')],
        ['housing', 'Housing', 'credit-and-house-prices', (c) => c.p('omH') * c.v('housingCost')],
      ),
      explain: {
        what: 'The consumer price index (1 at baseline).',
        rule: 'CPI = VAT factor × ({omD%} × domestic prices + {omM%} × imported goods as delivered) + {omH%} × housing costs, with the Statistics Iceland basket weights. The VAT factor is (1 + the VAT rate built into prices) ÷ (1 + the baseline VAT rate).',
      },
    },
    {
      id: 'cpiExTax',
      target: 'cpiExTax',
      category: 'IDENTITY',
      inputs: ['domesticPrice', 'deliveredImportPrice', 'housingCost'],
      params: ['omD', 'omM', 'omH'],
      terms: terms(
        ['domestic', 'Domestic goods and services', 'markup-pricing', (c) => c.p('omD') * c.v('domesticPrice')],
        ['imported', 'Imported goods', 'exchange-rate-pass-through', (c) => c.p('omM') * c.v('deliveredImportPrice')],
        ['housing', 'Housing', 'credit-and-house-prices', (c) => c.p('omH') * c.v('housingCost')],
      ),
      explain: {
        what: 'Consumer prices with VAT held at its baseline rate (1 at baseline): the CPI without the direct effect of a change in VAT.',
        rule: 'CPI at constant VAT = {omD%} × domestic prices + {omM%} × imported goods as delivered + {omH%} × housing costs: the CPI with its VAT factor left at 1. A VAT change still reaches it later if it pushes up wages and domestic prices.',
      },
    },
    {
      id: 'consumptionDeflator',
      target: 'consumptionDeflator',
      category: 'IDENTITY',
      label: 'Consumption deflator',
      inputs: ['domesticPrice', 'deliveredImportPrice', 'vatInPrices'],
      params: ['omD', 'omM', 'vat0'],
      terms: terms(
        ['domestic', 'Domestic goods and services', 'markup-pricing', (c) => (vatFactor(c) * c.p('omD') * c.v('domesticPrice')) / (c.p('omD') + c.p('omM'))],
        ['imported', 'Imported goods', 'exchange-rate-pass-through', (c) => (vatFactor(c) * c.p('omM') * c.v('deliveredImportPrice')) / (c.p('omD') + c.p('omM'))],
      ),
      explain: {
        what: 'The prices of the goods and services households pay for, with VAT (1 at baseline). Household spending ÷ this is real consumption.',
        rule: 'Deflator = VAT factor × ({omD%} × domestic prices + {omM%} × imported goods as delivered) ÷ ({omD%} + {omM%}): the CPI without its housing part. In the CPI, most of housing ({omH%}) is owner-occupiers’ imputed rent, what they would pay to rent their own homes; nobody pays it in cash, and here it follows market rents, which rise with house prices. Household spending is a cash flow that does not change when rents and house prices do, so dividing it by the full CPI would count a rise in house prices as households buying less. Excluding housing avoids that, and the deflator still rises one for one with a general rise in prices. The full CPI still drives indexation, inflation, expectations, wages and the key rate.',
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
      id: 'inflation12ExTax',
      target: 'inflation12ExTax',
      category: 'IDENTITY',
      inputs: ['cpiExTax'],
      lagInputs: ['cpiExTax'],
      compute: (c) => c.v('cpiExTax') / c.lag('cpiExTax', stepsIn(c, 1)) - 1,
      explain: {
        what: 'How much consumer prices at constant VAT rose over the past 12 months. The central bank’s rule reacts to it, so it looks through the one-off jump in prices when VAT changes.',
        rule: 'Inflation at constant VAT (12 months) = CPI at constant VAT ÷ the same a year ago − 1.',
      },
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
