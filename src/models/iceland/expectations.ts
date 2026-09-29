/**
 * Iceland Inc.: what the lever-response report (bun run levers) checks each lever against. Each entry
 * is the sign of a lever's mean effect on a headline or indicator over a span of months, against the
 * no-change run in the same mode (src/harness/lever-report.ts, LeverExpectation). They come from the
 * lever vetting of 29 September 2026 (reports/levers) and pin the signs its fixes restored.
 *
 * Checks that are not signs (the cash limit never binding, households keeping a quarter of their
 * deposits, every firm's loans staying below three times their normal share of GDP) cannot be written
 * here, since the report measures only headlines and indicators; they are model tests in
 * tests/models/iceland-real-economy.test.ts.
 */
import type { LeverExpectation } from '../../harness/lever-report.ts';

export const expectations: LeverExpectation[] = [
  // Taxes (tax-TAX-2, trade-nominal-drift): VAT raises the price level once, in the first year.
  { lever: 'vat', setting: 'up', variable: 'priceLevel', fromMonth: 1, toMonth: 12, sign: 1, theory: 'VAT is passed on to consumer prices: a lasting rise moves the price level once.', source: 'Benedek, De Mooij, Keen and Wingender (2020), International Tax and Public Finance 27' },
  { lever: 'vat', setting: 'down', variable: 'priceLevel', fromMonth: 1, toMonth: 12, sign: -1, theory: 'VAT is passed on to consumer prices: a lasting cut lowers the price level once.', source: 'Benedek, De Mooij, Keen and Wingender (2020), International Tax and Public Finance 27' },
  { lever: 'incomeTax', setting: 'up', mode: 'Manual', variable: 'consumption', fromMonth: 1, toMonth: 24, sign: -1, theory: 'A higher income tax cuts disposable income and so spending (with a cash buffer, gradually).', source: 'Godley and Lavoie (2007), Monetary Economics, ch. 3' },

  // Exports (trade-month1-export-jump, trade-nominal-drift): more foreign demand raises output while it builds up.
  { lever: 'foreignDemand', setting: 'max', variable: 'output', fromMonth: 1, toMonth: 24, sign: 1, theory: 'Open-economy multiplier: more foreign demand raises output over the following quarters.', source: 'Justiniano and Preston (2010), Journal of International Economics 81' },
  { lever: 'foreignDemand', setting: 'max', variable: 'exports', fromMonth: 1, toMonth: 24, sign: 1, theory: 'More foreign demand raises export volumes.', source: 'Justiniano and Preston (2010), Journal of International Economics 81' },
  { lever: 'tourism', setting: 'max', variable: 'output', fromMonth: 1, toMonth: 24, sign: 1, theory: 'More visitors raise output over the following quarters.', source: 'CBI QMM simulations' },
  { lever: 'tourism', setting: 'min', variable: 'output', fromMonth: 1, toMonth: 24, sign: -1, theory: 'A collapse in visitors lowers output at once (2010, 2020).', source: 'Statistics Iceland national accounts, 2020' },
  { lever: 'tourism', setting: 'max', variable: 'krona', fromMonth: 12, toMonth: 240, sign: 1, theory: 'A lasting export gain strengthens the currency in real and nominal terms (Dutch disease).', source: 'Corden and Neary (1982), Economic Journal 92' },

  // Fish prices (trade-fish-windfall-hoarded, trade-exporter-debt-spiral): profit moves, owners and the state share a windfall.
  { lever: 'fishPrices', setting: 'max', variable: 'profitsFX', fromMonth: 1, toMonth: 60, sign: 1, theory: 'Quotas cap the catch, so a higher price goes mainly into fisheries’ profit (resource rent).', source: 'Arnason (2008) on Iceland’s ITQ fisheries' },
  { lever: 'fishPrices', setting: 'max', mode: 'Manual', variable: 'govBalance', fromMonth: 24, toMonth: 60, sign: 1, theory: 'The state takes a share of resource rent through the fishing fee and corporate tax.', source: 'Lög um veiðigjald nr. 145/2018' },
  { lever: 'fishPrices', setting: 'min', variable: 'profitsFX', fromMonth: 1, toMonth: 60, sign: -1, theory: 'A lower price cuts fisheries’ profit, since volume is quota-bound.', source: 'Arnason (2008) on Iceland’s ITQ fisheries' },
  { lever: 'fishPrices', setting: 'min', variable: 'investment', fromMonth: 12, toMonth: 240, sign: -1, theory: 'A squeezed, indebted exporter invests less (cash-flow and leverage constraints on investment).', source: 'Fazzari, Hubbard and Petersen (1988), Brookings Papers 1988:1' },

  // Benefits (labour-LAB-1): more generous benefits raise normal unemployment after a year or so.
  { lever: 'unemploymentBenefits', setting: 'max', variable: 'unemployment', fromMonth: 60, toMonth: 240, sign: 1, theory: 'A higher replacement rate lengthens job search and raises reservation wages, so equilibrium unemployment rises.', source: 'Layard, Nickell and Jackman (1991), Unemployment; Mortensen and Pissarides (1994)' },
  { lever: 'unemploymentBenefits', setting: 'up', variable: 'unemployment', fromMonth: 60, toMonth: 240, sign: 1, theory: 'A higher replacement rate lengthens job search and raises reservation wages, so equilibrium unemployment rises.', source: 'Layard, Nickell and Jackman (1991), Unemployment; Mortensen and Pissarides (1994)' },
  { lever: 'unemploymentBenefits', setting: 'min', variable: 'unemployment', fromMonth: 60, toMonth: 240, sign: -1, theory: 'Less generous benefits shorten job search, so equilibrium unemployment falls.', source: 'Layard, Nickell and Jackman (1991), Unemployment; Mortensen and Pissarides (1994)' },

  // Wages and labour supply (labour-LAB-2, labour-LAB-6).
  { lever: 'wageSettlement', setting: 'default', variable: 'priceLevel', fromMonth: 1, toMonth: 72, sign: 1, theory: 'A general pay rise is passed on to prices (battle of markups).', source: 'Blanchard (1986), Journal of Political Economy 94; CBI Monetary Bulletin 2026/2, Box 2' },
  { lever: 'wageSettlement', setting: 'default', variable: 'realWage', fromMonth: 1, toMonth: 12, sign: 1, theory: 'Nominal pay is set for the contract; prices catch up only gradually.', source: 'Bårdsen et al. (2005), The Econometrics of Macroeconomic Modelling' },
  { lever: 'netImmigration', setting: 'default', variable: 'unemployment', fromMonth: 1, toMonth: 24, sign: 1, theory: 'A labour-supply shock raises unemployment until the newcomers are absorbed.', source: 'Borjas (1995), Journal of Economic Perspectives 9(2)' },
  { lever: 'netImmigration', setting: 'default', variable: 'realWage', fromMonth: 1, toMonth: 24, sign: -1, theory: 'More job-seekers slow wage growth (the wage Phillips curve).', source: 'Borjas (1995), Journal of Economic Perspectives 9(2)' },

  // The key rate (monetary-MON-11): a higher rate held a year lowers investment and output.
  { lever: 'keyRateFixed', setting: 'up', mode: 'Manual', variable: 'investment', fromMonth: 1, toMonth: 24, sign: -1, theory: 'A higher real borrowing cost lowers investment, with a lag.', source: 'Christiano, Eichenbaum and Evans (2005), Journal of Political Economy 113' },
  { lever: 'keyRateFixed', setting: 'up', mode: 'Manual', variable: 'output', fromMonth: 1, toMonth: 24, sign: -1, theory: 'Monetary tightening lowers output within two years.', source: 'Christiano, Eichenbaum and Evans (2005), Journal of Political Economy 113' },
];
