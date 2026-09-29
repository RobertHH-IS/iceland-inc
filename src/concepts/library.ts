/**
 * The concept library: the economic ideas that rules, terms, flows, levers and indicators
 * point to, so the interface can say which ideas are "at play" at any moment.
 *
 * Writing rules for entries:
 *   - `oneLiner`: at most 25 words, plain English.
 *   - `body`: 80–220 words of markdown for a curious non-economist. Define jargon the first
 *     time it appears, give an Icelandic example where natural, and say briefly where
 *     schools of thought disagree.
 *   - `references`: 1–3 reputable sources. Every URL below was checked to resolve in
 *     September 2026 (publisher pages behind bot checks are linked by DOI instead).
 *   - `related`: ids of other concepts in this library.
 *
 * `tests/concepts.test.ts` enforces the limits. `docs/concepts.md` is generated from this
 * file by `bun run scripts/concepts-index.ts`.
 */
import type { ConceptDef, Id } from '../core/types.ts';

type Ref = { title: string; url?: string };

/** Join paragraphs into one markdown body. */
const p = (...paragraphs: string[]): string => paragraphs.join('\n\n');

/* --------------------------------------------------------------- references */

const ref = {
  boe2014: {
    title: 'McLeay, Radia & Thomas (2014), "Money creation in the modern economy", Bank of England Quarterly Bulletin 2014 Q1',
    url: 'https://www.bankofengland.co.uk/quarterly-bulletin/2014/q1/money-creation-in-the-modern-economy',
  },
  boe2014intro: {
    title: 'McLeay, Radia & Thomas (2014), "Money in the modern economy: an introduction", Bank of England Quarterly Bulletin 2014 Q1',
    url: 'https://www.bankofengland.co.uk/-/media/boe/files/quarterly-bulletin/2014/money-in-the-modern-economy-an-introduction.pdf',
  },
  godleyLavoie: {
    title: 'Godley & Lavoie (2007), Monetary Economics: An Integrated Approach to Credit, Money, Income, Production and Wealth, Palgrave Macmillan',
    url: 'https://doi.org/10.1057/9780230626546',
  },
  nikiforosZezza: {
    title: 'Nikiforos & Zezza (2017), "Stock-flow consistent macroeconomic models: a survey", Levy Economics Institute Working Paper 891',
    url: 'https://www.levyinstitute.org/pubs/wp_891.pdf',
  },
  sna2008: {
    title: 'United Nations, European Commission, IMF, OECD & World Bank (2009), System of National Accounts 2008',
    url: 'https://unstats.un.org/unsd/nationalaccount/docs/SNA2008.pdf',
  },
  godley1999: {
    title: 'Godley (1999), "Seven unsustainable processes: medium-term prospects and policies for the United States and the world", Levy Institute Special Report',
    url: 'https://www.levyinstitute.org/pubs/sr/sevenproc.pdf',
  },
  bpm6: {
    title: 'IMF (2009), Balance of Payments and International Investment Position Manual, sixth edition (BPM6)',
    url: 'https://www.imf.org/external/pubs/ft/bop/2007/pdf/bpm6.pdf',
  },
  lavoie2014: {
    title: 'Lavoie (2014), Post-Keynesian Economics: New Foundations, Edward Elgar',
    url: 'https://doi.org/10.4337/9781783475827',
  },
  keen1995: {
    title: 'Keen (1995), "Finance and economic breakdown: modeling Minsky\'s financial instability hypothesis", Journal of Post Keynesian Economics 17(4)',
    url: 'https://keenomics.s3.amazonaws.com/debtdeflation_media/papers/Keen1995FinanceEconomicBreakdown_JPKE_OCRed.pdf',
  },
  keen2011aea: {
    title: 'Keen (2011), "A monetary Minsky model of the Great Moderation and the Great Recession", paper for the AEA annual meeting',
    url: 'https://www.aeaweb.org/conference/2011/retrieve.php?pdfid=185',
  },
  keen2011rwer: {
    title: 'Keen (2011), "Economic growth, asset markets and the credit accelerator", real-world economics review 57',
    url: 'https://www.paecon.net/PAEReview/issue57/Keen57.pdf',
  },
  keen2020: {
    title: 'Keen (2020), "Emergent macroeconomics: deriving Minsky\'s financial instability hypothesis directly from macroeconomic definitions", Review of Political Economy',
    url: 'https://doi.org/10.1080/09538259.2020.1810887',
  },
  biggsMayerPick: {
    title: 'Biggs, Mayer & Pick (2010), "Credit and economic recovery: demystifying phoenix miracles"',
    url: 'https://www.bde.es/f/webpi/SES/seminars/2015/files/sie1515.pdf',
  },
  palley2014: {
    title: 'Palley (2014), "Effective demand, endogenous money, and debt: a Keynesian critique of Keen and an alternative theoretical framework"',
    url: 'http://www.thomaspalley.com/docs/research/ad_and_debt.pdf',
  },
  lavoie2014roke: {
    title: 'Lavoie (2014), "A comment on \'Endogenous money and effective demand\': a revolution or a step backwards?", Review of Keynesian Economics 2(3)',
    url: 'https://www.elgaronline.com/view/journals/roke/2-3/roke.2014.03.04.xml',
  },
  minsky1992: {
    title: 'Minsky (1992), "The financial instability hypothesis", Levy Economics Institute Working Paper 74',
    url: 'https://www.levyinstitute.org/pubs/wp74.pdf',
  },
  cbiFs2026: {
    title: 'Central Bank of Iceland (2026), Financial Stability 2026/1',
    url: 'https://cb.is/library/?itemid=2b8ca96c-aacc-4bcb-bd7d-a956b8a2f922',
  },
  cbiMb2026: {
    title: 'Central Bank of Iceland (2026), Monetary Bulletin 2026/2',
    url: 'https://cb.is/library?itemid=391735d2-e7f9-4974-942a-debafc264a6e&type=pdf',
  },
  cbiMoney: {
    title: 'Central Bank of Iceland, money supply and monetary aggregates (M1, M2, M3), monthly statistics',
    url: 'https://sedlabanki.is/library?itemid=76230f67-d5ae-4eb2-8469-0b5c282a7d70',
  },
  rules1300: {
    title: 'Central Bank of Iceland, Rules no. 1300/2025 on maximum debt service-to-income ratios for consumer mortgages (Stjórnartíðindi)',
    url: 'https://island.is/stjornartidindi/nr/f2fc66b9-0dfd-44a6-b795-51117d37a095',
  },
  hypostat2024: {
    title: 'Elíasson & Skúlason (2024), "Iceland", Hypostat 2024 country report, European Mortgage Federation',
    url: 'https://hypo.org/app/uploads/sites/3/2024/08/Iceland.pdf',
  },
  qmm2011: {
    title: 'Central Bank of Iceland (2011), QMM: A Quarterly Macroeconomic Model of the Icelandic Economy, version 2.1',
    url: 'https://english.sedlabanki.is/library/?itemid=14262546-54d5-4aed-a520-4daa6d6407cb&type=pdf',
  },
  qmm2019: {
    title: 'Daníelsson et al. (2019), QMM: A Quarterly Macroeconomic Model of the Icelandic Economy, version 4.0, Central Bank of Iceland Working Paper 82',
    url: 'https://cb.is/library/news-and-publications/publications/working-papers/WP82_net.pdf',
  },
  edwardsCabezas: {
    title: 'Edwards & Cabezas (2021), "Exchange rate pass-through, monetary policy, and real exchange rates: Iceland and the 2008 crisis", Central Bank of Iceland Working Paper 85',
    url: 'https://ideas.repec.org/p/ice/wpaper/wp85.html',
  },
  danielsson2021: {
    title: 'Daníelsson (2021), "Wages and prices of foreign goods in the inflationary process in Iceland", Central Bank of Iceland Working Paper 87',
    url: 'https://ideas.repec.org/p/ice/wpaper/wp87.html',
  },
  imf2026: {
    title: 'IMF (2026), Iceland: 2026 Article IV Consultation, Country Report 26/208',
    url: 'https://www.imf.org/-/media/files/publications/cr/2026/english/1islea2026001.pdf',
  },
  imf2024si: {
    title: 'IMF (2024), Iceland: Selected Issues, Country Report 24/222',
    url: 'https://www.imf.org/en/-/media/files/publications/cr/2024/english/1islea2024002-print-pdf.pdf',
  },
  imfFsap2023: {
    title: 'IMF (2023), Iceland FSAP: Technical Note on Pension Fund Regulation and Supervision, Country Report 23/282',
    url: 'https://sedlabanki.is/library/um-sedlabankann/ags/1ISLEA2023009.pdf',
  },
  fiscalPlan: {
    title: 'Government of Iceland (2026), Fjármálaáætlun 2027–2031 (Fiscal Plan 2027–2031), section 3.1.2 on the stability rule',
    url: 'https://www.stjornarradid.is/library/03-Verkefni/Efnahagsmal-og-opinber-fjarmal/FjarmalaaAetlun-2027-31/Skjol-og-gogn/Fjarmalaaaetlun_2027-2031_A4-prent.pdf',
  },
  staticeGov2025: {
    title: 'Statistics Iceland (2026), "General government finances 2025"',
    url: 'https://statice.is/publications/news-archive/public-finance/general-government-finances-2025',
  },
  staticePopulation: {
    title: 'Statistics Iceland (2026), "Population by origin"',
    url: 'https://www.statice.is/publications/news-archive/inhabitants/population-by-origin/',
  },
  sila2017: {
    title: 'Sila (2017), "Labour market and collective bargaining in Iceland: sharing the spoils without spoiling the shares", OECD Economics Department Working Paper 1439',
    url: 'https://www.oecd.org/content/dam/oecd/en/publications/reports/2017/11/labour-market-and-collective-bargaining-in-iceland-sharing-the-spoils-without-spoiling-the-shares_aa3e7fb6/851fc29b-en.pdf',
  },
  saReviewClauses: {
    title: 'Samtök atvinnulífsins (SA Confederation of Icelandic Enterprise), "Hver eru forsenduákvæði kjarasamninga?" (What are the review clauses in wage agreements?)',
    url: 'https://www.sa.is/frettatengt/frettir/hver-eru-forsenduakvaedi-kjarasamninga',
  },
  islandsbanki2026: {
    title: 'Íslandsbanki Research (2026), "Current account balance set to improve after 2025 deficit"',
    url: 'https://www.islandsbanki.is/en/news/current-account-balance-set-to-improve-after-2025-deficit',
  },
  coenen2012: {
    title: 'Coenen et al. (2012), "Effects of Fiscal Stimulus in Structural Models", American Economic Journal: Macroeconomics 4(1)',
    url: 'https://www.aeaweb.org/articles?id=10.1257/mac.4.1.22',
  },
  lanamal: {
    title: 'Government Debt Management (Lánamál ríkisins), Iceland',
    url: 'https://www.lanamal.is/en',
  },
  mishkin1995: {
    title: 'Mishkin (1995), "Symposium on the monetary transmission mechanism", Journal of Economic Perspectives 9(4)',
    url: 'https://doi.org/10.1257/jep.9.4.3',
  },
  bernankeGertler1995: {
    title: 'Bernanke & Gertler (1995), "Inside the black box: the credit channel of monetary policy transmission", Journal of Economic Perspectives 9(4)',
    url: 'https://doi.org/10.1257/jep.9.4.27',
  },
  taylor1993: {
    title: 'Taylor (1993), "Discretion versus policy rules in practice", Carnegie-Rochester Conference Series on Public Policy 39',
    url: 'https://web.stanford.edu/~johntayl/Papers/Discretion.PDF',
  },
  fedRules: {
    title: 'Federal Reserve Board, "Policy rules and how policymakers use them"',
    url: 'https://www.federalreserve.gov/monetarypolicy/policy-rules-and-how-policymakers-use-them.htm',
  },
  bernanke2007: {
    title: 'Bernanke (2007), "Inflation expectations and inflation forecasting", speech at the NBER Summer Institute',
    url: 'https://www.federalreserve.gov/newsevents/speech/bernanke20070710a.htm',
  },
  imfInflationTargeting: {
    title: 'Jahan, "Inflation targeting: holding the line", IMF Finance & Development, Back to Basics',
    url: 'https://www.imf.org/external/pubs/ft/fandd/basics/72-inflation-targeting.htm',
  },
  friedman1968: {
    title: 'Friedman (1968), "The role of monetary policy", American Economic Review 58(1)',
    url: 'https://www.aeaweb.org/aer/top20/58.1.1-17.pdf',
  },
  phillips1958: {
    title: 'Phillips (1958), "The relation between unemployment and the rate of change of money wage rates in the United Kingdom, 1861–1957", Economica 25(100)',
    url: 'https://doi.org/10.1111/j.1468-0335.1958.tb00003.x',
  },
  blanchardKatz1999: {
    title: 'Blanchard & Katz (1999), "Wage dynamics: reconciling theory and evidence", American Economic Review 89(2)',
    url: 'https://www.aeaweb.org/articles?id=10.1257/aer.89.2.69',
  },
  imfKeynes: {
    title: 'Jahan, Mahmud & Papageorgiou (2014), "What is Keynesian economics?", IMF Finance & Development 51(3)',
    url: 'https://www.imf.org/external/pubs/ft/fandd/2014/09/basics.htm',
  },
  imfMultipliers: {
    title: 'Batini, Eyraud, Forni & Weber (2014), "Fiscal multipliers: size, determinants, and use in macroeconomic projections", IMF Technical Notes and Manuals 14/04',
    url: 'https://www.imf.org/external/pubs/ft/tnm/2014/tnm1404.pdf',
  },
  imfFiscalPolicy: {
    title: 'Horton & El-Ganainy (2009), "What is fiscal policy?", IMF Finance & Development 46(2)',
    url: 'https://www.imf.org/external/pubs/ft/fandd/2009/06/basics.htm',
  },
  imfMacroprudential: {
    title: 'IMF (2013), "Key aspects of macroprudential policy", IMF Policy Paper',
    url: 'https://www.imf.org/external/np/pp/eng/2013/061013b.pdf',
  },
  weo2015ch4: {
    title: 'IMF (2015), World Economic Outlook, April 2015, chapter 4: "Private investment: what\'s the holdup?"',
    url: 'https://www.imf.org/external/pubs/ft/weo/2015/01/pdf/c4.pdf',
  },
  samuelson1939: {
    title: 'Samuelson (1939), "Interactions between the multiplier analysis and the principle of acceleration", Review of Economics and Statistics 21(2)',
    url: 'https://doi.org/10.2307/1927758',
  },
  okun2013: {
    title: 'Ball, Leigh & Loungani (2013), "Okun\'s law: fit at fifty?", NBER Working Paper 18668',
    url: 'https://www.nber.org/papers/w18668',
  },
  fuhrer2000: {
    title: 'Fuhrer (2000), "Habit formation in consumption and its implications for monetary-policy models", American Economic Review 90(3)',
    url: 'https://www.aeaweb.org/articles?id=10.1257/aer.90.3.367',
  },
  havranekRusnak: {
    title: 'Havranek & Rusnak (2013), "Transmission lags of monetary policy: a meta-analysis", International Journal of Central Banking 9(4)',
    url: 'https://www.ijcb.org/sites/default/files/journal/v9n4/ijcb-v9n4-transmission-lags-monetary-policy-meta-analysis.pdf',
  },
  basel3: {
    title: 'Bank for International Settlements, "Basel III: international regulatory framework for banks"',
    url: 'https://www.bis.org/bcbs/basel3.htm',
  },
  carryTrades: {
    title: 'Brunnermeier, Nagel & Pedersen (2008), "Carry trades and currency crashes", NBER Working Paper 14473',
    url: 'https://www.nber.org/papers/w14473',
  },
  imfCurrentAccount: {
    title: 'Ghosh & Ramakrishnan, "Current account deficits: is there a problem?", IMF Finance & Development, Back to Basics',
    url: 'https://www.imf.org/external/pubs/ft/fandd/basics/pdf/ghosh_current-account-deficits.pdf',
  },
  imfRealExchangeRate: {
    title: 'Catão (2007), "Why real exchange rates?", IMF Finance & Development 44(3)',
    url: 'https://www.imf.org/external/pubs/ft/fandd/2007/09/basics.htm',
  },
  sarnoTaylor: {
    title: 'Sarno & Taylor (2002), "Purchasing power parity and the real exchange rate", IMF Staff Papers 49(1)',
    url: 'https://www.imf.org/external/pubs/ft/staffp/2002/01/pdf/sarno.pdf',
  },
  caseQuigleyShiller: {
    title: 'Case, Quigley & Shiller (2001), "Comparing wealth effects: the stock market versus the housing market", NBER Working Paper 8606',
    url: 'https://www.nber.org/papers/w8606',
  },
  greatMortgaging: {
    title: 'Jordà, Schularick & Taylor (2014), "The great mortgaging: housing finance, crises, and business cycles", NBER Working Paper 20501',
    url: 'https://www.nber.org/papers/w20501',
  },
  auclert2019: {
    title: 'Auclert (2019), "Monetary policy and the redistribution channel", American Economic Review 109(6)',
    url: 'https://www.aeaweb.org/articles?id=10.1257/aer.20160137',
  },
  doepkeSchneider: {
    title: 'Doepke & Schneider (2006), "Inflation and the redistribution of nominal wealth", Journal of Political Economy 114(6)',
    url: 'https://doi.org/10.1086/508379',
  },
  blanchard2017: {
    title: 'Blanchard (2017), "On the need for (at least) five classes of macro models", Peterson Institute for International Economics',
    url: 'https://www.piie.com/blogs/realtime-economic-issues-watch/need-least-five-classes-macro-models',
  },
  iseeDelays: {
    title: 'isee systems, "Delay builtins" (first- and third-order delays in system dynamics), Stella/iThink help',
    url: 'https://www.iseesystems.com/resources/help/v10/Content/Reference/Builtins/Delay_builtins.htm',
  },
} satisfies Record<string, Ref>;

/* ----------------------------------------------------------------- concepts */

export const concepts: ConceptDef[] = [
  /* ============================== Accounting ============================== */
  {
    id: 'double-entry',
    title: 'Double-entry bookkeeping',
    oneLiner:
      'Every payment is recorded twice, as a minus for the payer and a plus for the payee, so money never appears or vanishes unnoticed.',
    body: p(
      `Double-entry bookkeeping is the rule that every transaction has two sides. When a household pays a shop 10,000 krónur, the household's deposit falls by 10,000 and the shop's rises by 10,000. Nothing is created or lost in between.`,
      `National accountants go one step further and call it *quadruple entry*: a transaction between two parties changes each party's accounts twice. The household records spending and a smaller deposit; the shop records a sale and a larger deposit (SNA 2008, paras 2.50–2.58).`,
      `Iceland Inc. is built on this rule. Every flow is made of *legs*, each with a payer and a payee, and the kernel posts each leg to both balance sheets. At the end of every simulated month it checks that all the pluses and minuses cancel to within a billionth. That is why the model can promise that money is never created by a formula: if the accounting did not balance, the run would fail.`,
      `Double entry does not say *how big* a flow will be. That is a matter of behaviour, which is open to debate. It only guarantees that wherever the money goes, it is counted on both sides.`,
    ),
    school: 'accounting',
    references: [ref.sna2008, ref.godleyLavoie],
    related: ['stock-flow-consistency', 'net-worth', 'sectoral-balances', 'accrual-vs-cash'],
  },
  {
    id: 'stock-flow-consistency',
    title: 'Stock-flow consistency',
    oneLiner:
      "Stocks such as deposits and debts change only because flows add to or subtract from them, and every financial asset is someone's liability.",
    body: p(
      `A *stock* is an amount at a moment in time, such as the deposits in your account on 1 January. A *flow* is an amount over a period, such as your wages for the year. Stock-flow consistency means the two always fit together: this year's closing stock equals last year's, plus the flows that added to it, minus the flows that took from it, plus any revaluation.`,
      `Wynne Godley and Marc Lavoie built a family of *stock-flow consistent* (SFC) models on this principle. They add a second rule: every financial asset is someone else's liability, so across all sectors financial assets and liabilities sum to zero. Every Icelandic mortgage, for example, is a debt of a household and an asset of a bank, a pension fund or another lender.`,
      `Why it matters: many older models tracked flows such as income and spending but ignored the debts and wealth those flows piled up. SFC models cannot. If a sector runs deficits year after year, its debt must grow, and the interest on that debt becomes a new flow. Consistency does not make a model right, but it stops it quietly breaking the arithmetic.`,
    ),
    school: 'accounting',
    references: [ref.godleyLavoie, ref.nikiforosZezza],
    related: ['double-entry', 'net-worth', 'revaluation', 'sectoral-balances', 'steady-state-baseline'],
  },
  {
    id: 'net-worth',
    title: 'Net worth',
    oneLiner: 'What a player owns minus what it owes. It grows with saving and revaluations, not with borrowing.',
    body: p(
      `Net worth is the value of everything a player owns (its *assets*) minus everything it owes (its *liabilities*). For a household that might be a flat, deposits and pension rights, minus a mortgage.`,
      `Two things change net worth. The first is *saving*: income minus spending on things that are used up. The second is *revaluation*: a change in the price of something already held, such as a rise in house prices, or a weaker króna raising the krónur value of foreign shares.`,
      `Borrowing does not change net worth. Taking out a 40 million krónur mortgage adds 40 million to your deposits and 40 million to your debts at the same moment. Buying a flat with the money swaps one asset for another.`,
      `Iceland Inc. checks this every month for every player: the change in net worth must equal saving plus revaluations. For the country as a whole, domestic financial assets and liabilities cancel, so national net worth is real assets (homes, factories, roads) plus net claims on the rest of the world. The IMF put Iceland's net claims abroad at about 44% of GDP in 2025.`,
    ),
    school: 'accounting',
    references: [ref.sna2008, ref.imf2026],
    related: ['double-entry', 'stock-flow-consistency', 'revaluation', 'housing-wealth-effect', 'current-account'],
  },
  {
    id: 'sectoral-balances',
    title: 'Sectoral balances',
    oneLiner:
      'The surpluses and deficits of the private sector, the government and the rest of the world always sum to zero.',
    body: p(
      `Every króna one sector spends beyond its income must be received by another sector as a surplus. Group the economy into the private sector (households and firms), the government and the rest of the world, and the arithmetic is exact:`,
      `*private surplus + government surplus + rest-of-world surplus = 0*`,
      `The rest of the world's surplus with Iceland is Iceland's current-account deficit. In 2025 Iceland's general government deficit was 2.6% of GDP and its current-account deficit 3.6%, so the private sector as a whole must have spent roughly 1% of GDP more than its income.`,
      `Wynne Godley used this identity to warn, years ahead, that the growing private-sector deficits in the United States in the late 1990s could not last.`,
      `The identity is not a theory: it does not say which balance drives the others, and economists disagree about causation. Some argue that government deficits are mostly the passive result of private decisions to save; others that deficits crowd out private spending. The accounting only guarantees that the numbers add up.`,
    ),
    school: 'accounting',
    references: [ref.godley1999, ref.staticeGov2025, ref.imf2026],
    related: ['current-account', 'deficits-and-money', 'paradox-of-thrift', 'net-worth', 'double-entry'],
  },
  {
    id: 'accrual-vs-cash',
    title: 'Accrual versus cash',
    oneLiner:
      'Some income is earned without any money changing hands, such as indexation added to a loan. Accounts record it when it is earned.',
    body: p(
      `Cash accounting records a payment when money moves. Accrual accounting records income and costs when they are *earned* or *owed*, whether or not money moves at the same time. National accounts use accruals (SNA 2008, para 2.55).`,
      `The difference matters in Iceland because of CPI indexation. When prices rise 0.5% in a month, the principal of an indexed mortgage grows 0.5%. The borrower now owes more and the lender is owed more, but no króna has been paid. In the accounts, that increase is interest that has *accrued*: income for the lender and a cost for the borrower, immediately added to the loan. The same treatment applies to indexed Treasury bonds.`,
      `Iceland Inc. draws accruals as dashed pipes. They change balance sheets and net worth but move no deposits, so they create no money and put no cash in anyone's pocket. That is why a burst of inflation can raise a pension fund's income a great deal while barely changing the cash it receives that month.`,
    ),
    school: 'accounting',
    references: [ref.sna2008],
    related: ['indexation', 'revaluation', 'net-worth', 'interest-distribution', 'double-entry'],
  },
  {
    id: 'revaluation',
    title: 'Revaluation',
    oneLiner:
      'A change in the price of something already owned, such as foreign shares when the króna falls. It changes wealth without any payment.',
    body: p(
      `A revaluation, or *holding gain or loss*, happens when the market value of an asset or liability changes while you hold it. Nobody pays anybody; the price simply moves. National accounts record these changes in a separate revaluation account, apart from income and saving (SNA 2008, chapter 12).`,
      `Iceland has large revaluations because so many balance sheets hold foreign currency. Pension funds keep over 40% of their assets abroad. If the króna falls 10%, those assets are suddenly worth 10% more in krónur, and pension wealth jumps without a single payment. A firm with a euro loan sees its debt rise in the same way; Iceland Inc. has no foreign-currency loans, so only the gains on foreign assets appear.`,
      `Revaluations change net worth but not income: a fund whose foreign shares rise in value has not earned more interest. They can still change behaviour. A household that feels richer because its home is worth more may spend more (see the housing wealth effect).`,
      `In Iceland Inc., revaluations are dashed pipes that pass through the accounting checks like any other posting, so the model shows who gained and who lost. Note that CPI indexation of loan principal is *not* a revaluation in the national accounts: it counts as accrued interest.`,
    ),
    school: 'accounting',
    references: [ref.sna2008, ref.cbiFs2026],
    related: ['net-worth', 'accrual-vs-cash', 'indexation', 'floating-exchange-rate', 'housing-wealth-effect', 'funded-pensions'],
  },

  /* ================================= Money ================================= */
  {
    id: 'endogenous-money',
    title: 'Endogenous money: loans create deposits',
    oneLiner:
      'When a bank lends, it creates a new deposit for the borrower. Most money is created this way, not printed by the central bank.',
    body: p(
      `When a bank grants a mortgage, it does not hand over someone else's savings. It adds the loan to its assets and, at the same moment, credits the borrower's account with a new deposit, which is its liability. New money has been created. The Bank of England's 2014 article "Money creation in the modern economy" is the standard plain-English account.`,
      `*Endogenous* means the amount of money is determined inside the economy, by how much households and firms want to borrow and how much banks are willing to lend, rather than being fixed from outside by the central bank. In Iceland, notes and coins are under 2% of broad money; the rest is bank deposits.`,
      `The central bank still matters. It sets the interest rate that shapes the price of loans, and regulation limits how far banks can expand (see bank capital). Economists still debate how freely banks lend: post-Keynesian *horizontalists* see banks meeting any creditworthy demand at a given rate, while *structuralists* stress rising costs and risks as lending grows.`,
      `In Iceland Inc., money creation is never a formula. It emerges from the payment system: a bank mortgage creates a deposit, while a pension-fund mortgage moves an existing one.`,
    ),
    school: 'post-keynesian',
    references: [ref.boe2014, ref.lavoie2014, ref.cbiMoney],
    related: ['money-destruction', 'broad-money', 'reserves-and-payments', 'bank-capital', 'credit-impulse', 'deficits-and-money'],
  },
  {
    id: 'money-destruction',
    title: 'Money destruction: repayment destroys deposits',
    oneLiner:
      'When a borrower repays a bank loan, the deposit used to pay is cancelled along with the debt, and the money stock shrinks.',
    body: p(
      `Money creation runs in reverse too. When you pay 200,000 krónur off a bank mortgage, the bank reduces your deposit by 200,000 and your loan by 200,000. Both sides of its balance sheet shrink, and that money no longer exists anywhere (Bank of England 2014).`,
      `So the stock of money depends on the race between new lending and repayment. If households borrow from banks faster than they repay, deposits grow; if repayments outpace new loans, deposits fall, even though nobody has "lost" money in the everyday sense.`,
      `Other payments to a bank work the same way. Interest paid to a bank removes deposits until the bank spends its income on wages, dividends or interest to depositors, which puts deposits back into circulation.`,
      `Who is repaid matters. Repaying a pension-fund loan destroys nothing: the deposit simply moves from the borrower to the fund. In Iceland, where pension funds hold a large share of mortgages, the same repayments can have quite different effects on the money stock depending on the lender. Iceland Inc. works this out in its payment system, leg by leg.`,
    ),
    school: 'accounting',
    references: [ref.boe2014, ref.boe2014intro],
    related: ['endogenous-money', 'broad-money', 'amortisation', 'reserves-and-payments'],
  },
  {
    id: 'reserves-and-payments',
    title: 'Reserves and the payment system',
    oneLiner:
      "Banks settle payments with each other, and with the government, in reserves: accounts they hold at the central bank.",
    body: p(
      `People pay each other in bank deposits. Banks, in turn, pay each other in *reserves*: deposits that banks hold at the central bank. When a customer of one bank pays a customer of another, deposits move between the customers and reserves move between the banks at the Central Bank of Iceland.`,
      `The government banks at the central bank too, in the Treasury's account. When the state pays a pension or a nurse's wage, the Treasury account falls, the recipient's bank gains reserves, and the bank credits the recipient's deposit. Taxes run the other way. So government spending adds deposits and reserves to the private sector, and taxes remove them.`,
      `Households cannot hold reserves; they never leave the central bank's books. Like most central banks since 2008, the Central Bank of Iceland steers market interest rates through the rate it pays on banks' deposits with it (its key rate is the seven-day term deposit rate), rather than by rationing reserves.`,
      `Iceland Inc. has one consolidated bank, so transfers between banks disappear. What stays visible is the link between the bank, the central bank and the Treasury: every payment involving the state moves reserves and the Treasury account, and the bank passes it on to depositors.`,
    ),
    school: 'institutional',
    references: [ref.boe2014intro, ref.boe2014, ref.cbiMb2026],
    related: ['endogenous-money', 'deficits-and-money', 'bond-buyers', 'broad-money', 'money-destruction'],
  },
  {
    id: 'deficits-and-money',
    title: 'Government deficits and money',
    oneLiner:
      'Deficits add deposits when banks or the central bank buy the bonds, and move existing money when pension funds or savers buy them.',
    body: p(
      `When the government spends more than it collects in taxes, the difference ends up in private-sector deposits. To cover the gap, it sells bonds. What happens to the money stock depends on who buys them:`,
      `- **A bank buys:** it pays in reserves, and the deposits the government spent stay in the economy. Broad money rises, much as when a bank lends.\n- **The central bank buys:** the same, with the reserves created directly. This is what quantitative easing did in many countries.\n- **A pension fund or a saver buys:** they pay with deposits they already hold. The deficit adds deposits in one place and the bond purchase removes them in another, so broad money is roughly unchanged. Existing money has been moved, not created.`,
      `Pension funds are among the largest holders of Icelandic Treasury bonds, so much of the state's borrowing recycles pension contributions rather than creating new money.`,
      `Economists disagree about what follows. Modern Monetary Theory stresses that a government borrowing in its own currency cannot run out of it; mainstream economists stress that deficits can raise interest rates, inflation or future taxes. Both accept the accounting above.`,
    ),
    school: 'accounting',
    references: [ref.boe2014, ref.godleyLavoie],
    related: ['bond-buyers', 'reserves-and-payments', 'endogenous-money', 'sectoral-balances', 'broad-money', 'funded-pensions'],
  },
  {
    id: 'broad-money',
    title: 'Broad money (M3)',
    oneLiner: 'Notes, coins and bank deposits held by the public. In Iceland almost all of it is bank deposits.',
    body: p(
      `*Broad money* is the money the public can spend or quickly turn into spending. The Central Bank of Iceland publishes three measures: M1 (notes and coins in circulation plus current accounts), M2 (M1 plus savings deposits) and M3 (M2 plus time deposits).`,
      `Notes and coins are a small part. In August 2026 they were about ISK 61bn of M3's ISK 3,587bn, under 2%. The rest is deposits: liabilities of banks, created mainly when banks lend or buy securities (see endogenous money, and deficits and money).`,
      `In Iceland Inc., broad money is a result, not a lever. It grows when banks lend or buy bonds faster than loans are repaid, which is why a credit boom shows up as faster money growth.`,
      `Monetarists once argued that central banks should control inflation by targeting the growth of money. Most central banks gave that up from the 1980s, because the link between money and prices proved unstable. Today most, including Iceland's, target inflation directly and set an interest rate. Money growth is still watched as a signal of credit conditions.`,
    ),
    school: 'institutional',
    references: [ref.cbiMoney, ref.boe2014intro],
    related: ['endogenous-money', 'money-destruction', 'deficits-and-money', 'credit-impulse'],
  },

  /* ================================= Credit ================================ */
  {
    id: 'credit-impulse',
    title: 'Credit impulse',
    oneLiner:
      'The change in the flow of new borrowing. A steady credit flow means zero impulse; only speeding up or slowing down moves demand growth.',
    body: p(
      `Keep three things apart. The *stock* of debt is what is owed. The *flow* of credit is net new borrowing each year, the change in the stock. The *credit impulse* is the change in that flow, the "acceleration" of debt, usually measured as a share of GDP.`,
      `Biggs, Mayer and Pick (2010) argued that spending financed by new borrowing is part of demand, so the growth of demand follows the credit impulse rather than the credit flow. That explains "phoenix miracles": economies that recover while the debt stock is still shrinking, because borrowing is falling more slowly. Steve Keen went further, arguing that aggregate demand equals income plus the change in debt.`,
      `Suppose Icelandic households borrow a net 1% of GDP more each year for four years. The impulse is positive in the first year and zero while the flow stays at its new level. When the extra borrowing stops, the impulse turns negative and demand growth falls, even though debt is higher than ever.`,
      `The claim is contested. Thomas Palley argues that Keen's formula ignores leakages from the circular flow of income, and Marc Lavoie that stock-flow consistent models already capture the role of credit without redefining demand. Much new credit also buys existing homes and assets rather than new output.`,
    ),
    school: 'post-keynesian',
    references: [ref.biggsMayerPick, ref.keen2011rwer, ref.palley2014],
    related: ['endogenous-money', 'credit-and-house-prices', 'minsky-instability', 'consumption-function', 'multiplier'],
  },
  {
    id: 'debt-service-constraint',
    title: 'Debt-service constraint',
    oneLiner:
      'Iceland caps new mortgage payments at 35% of disposable income (40% for first-time buyers), tested at stressed interest rates and terms.',
    body: p(
      `A *debt-service-to-income* (DSTI) cap limits how much of a borrower's monthly disposable income may go on loan payments. Under the Central Bank of Iceland's Rules no. 1300/2025, payments on a new consumer mortgage may not exceed 35% of disposable income, or 40% for a first-time buyer.`,
      `The test does not use the loan's actual terms. Lenders must assume an annuity at the contract rate but at least 5.5% over at most 40 years for non-indexed loans, and at least 3% over at most 25 years for CPI-indexed loans. Because of the floor, a rise in non-indexed rates that stays below 5.5% does not tighten the test at all; above it, every extra point of interest cuts the maximum loan.`,
      `When the cap binds, it sets the size of the loan, whatever the borrower wants or the bank would offer. That is why a rate rise can cut lending sharply for stretched buyers while leaving richer ones untouched. The cap applies only to new loans, so existing borrowers are unaffected. Lenders may exempt a small share of new loans.`,
      `In Iceland Inc., new mortgage lending is the smallest of the desired loan and the debt-service and loan-to-value caps, and the inspector names the one that binds.`,
    ),
    school: 'institutional',
    references: [ref.rules1300, ref.cbiFs2026],
    related: ['loan-to-value', 'macroprudential-policy', 'amortisation', 'indexation', 'endogenous-money', 'credit-and-house-prices'],
  },
  {
    id: 'loan-to-value',
    title: 'Loan-to-value cap',
    oneLiner:
      "A limit on the size of a mortgage relative to the home's value: in Iceland 80%, or 90% for first-time buyers.",
    body: p(
      `The *loan-to-value* (LTV) ratio is the size of a mortgage divided by the value of the home it is secured on. A 48 million krónur loan on a 60 million flat has an LTV of 80%. The rest, the *down payment*, must come from the buyer's savings or other sources.`,
      `The Central Bank of Iceland caps LTV on new consumer mortgages at 80%, or 90% for first-time buyers (raised from 85% in 2025). Pension funds, which also lend to their members, often lend at lower ratios.`,
      `An LTV cap protects both sides. If house prices fall, a borrower with a larger deposit is less likely to owe more than the home is worth, and the lender is less likely to lose money. It also damps a feedback loop in which rising prices justify bigger loans, which push prices higher still. Hypostat's Iceland report credits the lower LTV limits and higher bank capital requirements of 2022 with contributing to the fall in real house prices in 2023.`,
      `LTV and debt-service caps bind on different people: buyers with good incomes but few savings hit the LTV cap, while buyers with savings but modest incomes hit the debt-service cap.`,
    ),
    school: 'institutional',
    references: [ref.cbiFs2026, ref.hypostat2024, ref.imfMacroprudential],
    related: ['debt-service-constraint', 'macroprudential-policy', 'credit-and-house-prices', 'bank-capital'],
  },
  {
    id: 'amortisation',
    title: 'Amortisation',
    oneLiner:
      "Paying off a loan's principal over time. Annuity loans have level payments; equal-principal loans start high and fall.",
    body: p(
      `*Amortisation* is the gradual repayment of a loan's *principal*, the amount borrowed, as distinct from the interest charged on it. Icelandic mortgages come in two main shapes:`,
      `- **Annuity loans** (*jafngreiðslulán*): the payment is the same each month. Early payments are mostly interest, later ones mostly principal.\n- **Equal-principal loans** (*jafnar afborganir*): the same slice of principal is repaid each month, so payments start high and fall as the interest shrinks.`,
      `With a CPI-indexed annuity, the payment is level in *real* terms instead: it rises with prices, and the principal is uprated for inflation each month. In the early years indexation can add more to the principal than the payments take off, so the debt in krónur grows even as it shrinks in real terms.`,
      `Amortisation matters for money: principal repaid to a bank destroys deposits, while principal repaid to a pension fund moves them. It also matters for the baseline. With inflation, new non-indexed lending must exceed repayments by the inflation rate times the stock for debt to keep pace with nominal GDP.`,
    ),
    school: 'institutional',
    references: [ref.rules1300, ref.hypostat2024, ref.boe2014],
    related: ['indexation', 'money-destruction', 'debt-service-constraint', 'steady-state-baseline'],
  },
  {
    id: 'indexation',
    title: 'CPI indexation',
    oneLiner:
      'Icelandic indexed loans add inflation to the principal each month. National accounts treat that as interest earned, not as a price change.',
    body: p(
      `Much Icelandic debt is *verðtryggð*: indexed to the consumer price index (CPI). The borrower pays a lower, *real* interest rate, and the principal grows each month in line with inflation. In early 2026 indexed loans were about 54% of household debt (IMF) and 65% of mortgages (Central Bank of Iceland).`,
      `Under the System of National Accounts (SNA 2008, paras 17.277–17.282), the indexation added to principal counts as *interest* that accrues and is reinvested in the loan, not as a holding gain. The borrower records an interest cost and a larger debt; the lender records interest income and a larger asset. No króna changes hands at the time.`,
      `Indexation changes how monetary policy works. A higher key rate raises payments on variable non-indexed loans within weeks, but indexed borrowers feel it mainly through the long real rate and, later, through inflation itself. The IMF notes that indexed loans have cushioned the impact of high nominal rates on borrowers. Critics argue that indexation blunts monetary policy and puts inflation risk on households; defenders reply that it keeps payments affordable and protects savers, above all pension funds.`,
    ),
    school: 'institutional',
    references: [ref.sna2008, ref.cbiFs2026, ref.imf2026],
    related: ['accrual-vs-cash', 'amortisation', 'interest-distribution', 'funded-pensions', 'borrowers-and-savers', 'debt-service-constraint'],
  },
  {
    id: 'interest-distribution',
    title: 'Interest as distribution',
    oneLiner:
      'Every debt carries an interest flow from debtor to creditor. Higher rates move income from borrowers to savers, often before they reduce spending.',
    body: p(
      `Behind every loan is a flow of interest from borrower to lender. When interest rates rise, that flow grows. The money is not destroyed; it is *redistributed*, from households and firms with debts to people and institutions holding deposits and bonds.`,
      `In Iceland the main creditors are banks and pension funds, and behind the banks stand depositors, many of them older households. A rate rise therefore takes income from young mortgage holders and indebted firms and passes part of it to savers and to pension funds, which pay it on to retirees. Whether total spending falls depends on who adjusts more: borrowers who lose, or savers who gain but are less likely to spend the extra.`,
      `Research on this *redistribution channel* (Auclert 2019) finds it strengthens monetary policy, because borrowers tend to spend a larger share of any change in income. Stock-flow consistent models make the channel explicit, since every stock of debt implies an interest flow.`,
      `Timing matters. Variable-rate non-indexed loans reprice almost at once; fixed-rate loans reprice when their fixed period ends; indexed loans respond mainly through inflation. In a flow model each stream is its own pipe, so the redistribution is visible month by month.`,
    ),
    school: 'post-keynesian',
    references: [ref.auclert2019, ref.godleyLavoie, ref.nikiforosZezza],
    related: ['borrowers-and-savers', 'intergenerational-flows', 'indexation', 'taylor-rule', 'funded-pensions', 'bank-capital'],
  },
  {
    id: 'bank-capital',
    title: 'Bank capital and the limits to money creation',
    oneLiner: 'Banks can create money by lending, but profitability, borrowers\' demand and capital rules limit how far and how fast.',
    body: p(
      `If banks create money when they lend, what stops them lending without limit? The Bank of England (2014) gives three answers. Banks must lend profitably, at rates that borrowers will pay and that cover costs and losses. Borrowers must want loans, and they destroy money when they repay. And regulation requires banks to hold *capital*: a cushion of shareholders' funds that absorbs losses before depositors are hurt.`,
      `Capital rules, set internationally under Basel III, require a bank's capital to be at least a set share of its *risk-weighted assets*, its loans weighted by how risky they are. More lending needs more capital, which must come from retained profits or new shares. At the end of 2025 Iceland's three large banks had a combined capital ratio of just under 24%, 3–5 percentage points above what the Central Bank requires.`,
      `The limits are real but not fixed. In a boom, profits and rising asset prices make capital easy to raise, which is one reason credit can surge. Iceland's banks grew to many times the size of the economy before they failed in 2008, a reminder that capital measured in good times can overstate resilience.`,
    ),
    school: 'institutional',
    references: [ref.boe2014, ref.basel3, ref.cbiFs2026],
    related: ['endogenous-money', 'macroprudential-policy', 'minsky-instability', 'loan-to-value'],
  },
  {
    id: 'minsky-instability',
    title: "Minsky's financial instability hypothesis",
    oneLiner:
      'Long periods of stability encourage riskier borrowing, so a financial system can drift from safe to fragile on its own.',
    body: p(
      `Hyman Minsky argued that stability breeds instability. After years of steady growth, lenders and borrowers grow confident, and finance shifts through three stages:`,
      `- **Hedge finance:** income covers both interest and repayments.\n- **Speculative finance:** income covers interest, but loans must be rolled over.\n- **Ponzi finance:** income does not even cover interest, so borrowers rely on rising asset prices to refinance or sell.`,
      `As more borrowers move into the later stages, a small rise in interest rates or fall in asset prices can force sales, lower prices and a crisis.`,
      `Steve Keen (1995) turned the idea into a mathematical model in which firms borrow to invest beyond their profits, and debt, wages and employment cycle until the system either settles or breaks down. His later work links it to the credit impulse. Iceland's 2003–2008 boom is often read in Minsky's terms: rapid bank expansion funded abroad, soaring asset prices and heavy borrowing, followed by collapse in October 2008.`,
      `Mainstream economists more often model crises as shocks hitting a stable system, and the evidence for a self-generated cycle is debated. Iceland Inc. does not predict crises; it shows how debt and interest flows can make an economy more fragile.`,
    ),
    school: 'post-keynesian',
    references: [ref.minsky1992, ref.keen1995, ref.keen2020],
    related: ['credit-impulse', 'endogenous-money', 'bank-capital', 'credit-and-house-prices', 'macroprudential-policy'],
  },

  /* =========================== Prices and wages ============================ */
  {
    id: 'markup-pricing',
    title: 'Markup pricing',
    oneLiner: 'Firms set prices by adding a margin to their cost per unit, above all wages and imported inputs.',
    body: p(
      `Most firms do not wait for the market to discover a price. They work out their cost per unit of output, above all wages and imported materials, and add a *markup* to cover overheads and profit. Michał Kalecki made this central to post-Keynesian economics, and surveys of how firms actually set prices find cost-based pricing is common.`,
      `Markup pricing explains why inflation often starts with costs. If wages rise 10% and the markup is unchanged, prices must rise by roughly the wage share of costs times 10%. The Central Bank of Iceland decomposes domestic prices in a similar way, into unit labour costs, unit profits and net taxes.`,
      `The markup itself can move. When demand is strong or competition weak, firms can widen it; when demand is weak, they may squeeze it. Whether markups rise or fall over the business cycle is still debated.`,
      `New Keynesian models also have firms pricing as a markup over cost, but add that prices change only now and then, so firms set them looking ahead to future costs. Post-Keynesians put more weight on current costs and conventions. Both reject the idea that prices jump instantly to clear every market.`,
    ),
    school: 'post-keynesian',
    references: [ref.lavoie2014, ref.cbiMb2026],
    related: ['cost-pass-through', 'profit-squeeze', 'wage-bargaining', 'exchange-rate-pass-through', 'real-wages'],
  },
  {
    id: 'cost-pass-through',
    title: 'Cost pass-through',
    oneLiner: 'How much, and how fast, higher costs such as wages show up in the prices firms charge.',
    body: p(
      `*Pass-through* is the share of a cost increase that firms pass on to customers as higher prices, and the speed at which they do it.`,
      `The arithmetic sets the range. In Iceland, wages are about 60% of gross factor income, the income earned by labour and capital together. If wages rise 10% and firms want to keep their króna margin per unit, domestic prices must rise about 6% (0.6 × 10%). To restore the old profit *share*, prices would have to rise the full 10%. And since roughly a third of the consumer basket is imported, a 6% rise in domestic prices lifts the CPI by only about 4%.`,
      `How much actually passes through depends on demand, competition and expectations. Central Bank research finds that consumer prices, unit labour costs and import prices move together in the long run (Daníelsson 2021), but short-run effects vary. The Bank found that contractual pay rises and higher public levies at the start of 2026 appeared largely to have been passed on to prices within the first quarter.`,
      `Because pass-through takes time, a wage settlement first squeezes profits and only later raises prices. Its speed and extent are behavioural assumptions, not fixed laws.`,
    ),
    school: 'empirical',
    references: [ref.cbiMb2026, ref.danielsson2021],
    related: ['markup-pricing', 'profit-squeeze', 'exchange-rate-pass-through', 'wage-bargaining', 'real-wages'],
  },
  {
    id: 'exchange-rate-pass-through',
    title: 'Exchange-rate pass-through',
    oneLiner:
      'When the króna falls, imports cost more in krónur. Pass-through measures how much of that reaches consumer prices, and how fast.',
    body: p(
      `About a third of the Icelandic consumer basket is imported goods, and many other prices contain imported inputs. When the króna weakens, those goods cost more in krónur, and part of the increase reaches consumer prices. *Exchange-rate pass-through* measures how much and how fast.`,
      `Pass-through is rarely complete. Importers and retailers may absorb some of the change in their margins, especially if they expect it to reverse, and many prices include local costs, such as wages, rent and transport, that do not depend on the currency. A study for the Central Bank (Edwards & Cabezas 2021) found that pass-through in Iceland declined after the inflation-targeting framework was reformed following the 2008 crisis.`,
      `Pass-through matters more in Iceland than in large economies because the króna moves a lot and imports are a big share of spending. A depreciation raises the CPI and, through indexation, the principal of indexed loans, and it can trigger the review clauses in wage agreements.`,
      `It happens in stages. Iceland's imports are invoiced in foreign currency, so the import bill in krónur moves with the króna at once (Gopinath et al. 2020); importers and shops reprice gradually, and their margins take the difference. It works in reverse too: a stronger króna lowers import prices and helps bring inflation down.`,
    ),
    school: 'empirical',
    references: [ref.edwardsCabezas, ref.cbiMb2026, ref.imf2024si],
    related: ['floating-exchange-rate', 'cost-pass-through', 'indexation', 'carry-trade', 'anchored-expectations', 'real-exchange-rate'],
  },
  {
    id: 'wage-bargaining',
    title: 'Wage bargaining in Iceland',
    oneLiner:
      'Collective agreements cover about 90% of Icelandic workers or more, with pattern-setting private deals and inflation review clauses.',
    body: p(
      `In Iceland, pay is set mainly through collective agreements between unions and employers' associations. Union membership is among the highest in the world, and Act 55/1980 makes the terms of an agreement the legal minimum for everyone in that occupation, members or not. Bargaining coverage is estimated at about 90% of workers or more.`,
      `Three features shape the economy:`,
      `- **Many unions:** about 200 bargain separately, which can lead to leapfrogging claims in booms.\n- **Pattern bargaining:** large private-sector deals, such as the 2024 "stability agreements", set the pattern, and public-sector deals tend to follow.\n- **Review clauses** (*forsenduákvæði*): agreements can be reopened if conditions miss agreed thresholds. The 2024 private-sector agreements could be reopened, and possibly terminated, if 12-month inflation in August 2026 exceeded 4.7%.`,
      `Because settlements are large and synchronised, a wage round works like one economy-wide shock: a transfer from profits to wages, a cost shock for firms, a boost to household income and a signal to the central bank, all at once.`,
      `Economists debate whether coordinated bargaining restrains wages or raises them. The OECD (Sila 2017) finds Iceland's model has worked less well in booms.`,
    ),
    school: 'institutional',
    references: [ref.sila2017, ref.saReviewClauses, ref.cbiMb2026],
    related: ['wage-phillips-curve', 'profit-squeeze', 'cost-pass-through', 'real-wages', 'anchored-expectations', 'indexation'],
  },
  {
    id: 'wage-phillips-curve',
    title: 'Wage Phillips curve',
    oneLiner: 'Wages tend to rise faster when unemployment is low and more slowly when it is high.',
    body: p(
      `In 1958 A. W. Phillips found that in Britain money wages had risen faster in years of low unemployment. When workers are scarce, employers bid up pay and unions ask for more; when jobs are scarce, both are more cautious. This is the *wage Phillips curve*.`,
      `Later economists added expectations: what matters is how fast wages rise *compared with* expected inflation and productivity growth. If everyone expects 2.5% inflation, wages might rise by about 2.5% plus productivity growth when unemployment is at its normal level, faster when it is below and slower when it is above. The Central Bank of Iceland's QMM model has a relationship of this kind, with wage growth responding to the gap between unemployment and its natural rate, to productivity and to the terms of trade.`,
      `The strength of the link is disputed. In many countries the curve looked flat for years before 2020, then steep in the post-pandemic inflation. Blanchard and Katz (1999) find the relationship in wage data but with differences across countries. The OECD, citing Central Bank research, reports that Icelandic real wages respond unusually strongly to the unemployment gap.`,
      `In a flow model, this is one of the forces that brings the economy back towards baseline after a wage shock.`,
    ),
    school: 'keynesian',
    references: [ref.phillips1958, ref.blanchardKatz1999, ref.qmm2019],
    related: ['wage-bargaining', 'okun-law', 'adaptive-expectations', 'anchored-expectations', 'real-wages', 'migration-buffer'],
  },
  {
    id: 'adaptive-expectations',
    title: 'Adaptive expectations',
    oneLiner:
      'People expect future inflation to look like recent inflation, revising their forecast gradually as prices surprise them.',
    body: p(
      `Under *adaptive expectations*, people form their view of future inflation from what they have recently seen. If inflation has been 6% for a year, they expect something close to 6%, and they revise that forecast step by step as each new figure arrives. Milton Friedman (1968) used this idea to argue that any attempt to hold unemployment below its natural rate would only raise expected, and then actual, inflation.`,
      `Adaptive expectations explain inflation *persistence*: once inflation takes hold, wage claims and price-setting carry it into the next year. Icelanders have long experience of this.`,
      `The IMF (2024) estimated that Icelandic households' one-year inflation expectations depend strongly on their own previous expectations (a weight of about two-thirds) and partly on last period's inflation. In its words, the evidence on anchoring is mixed.`,
      `Critics note that purely adaptive expectations ignore what people know, such as a credible central bank's commitment to its target. That is the case for anchored and rational expectations. Most practical models, including central banks' own, blend backward-looking and forward-looking elements.`,
    ),
    school: 'monetarist',
    references: [ref.friedman1968, ref.imf2024si],
    related: ['anchored-expectations', 'wage-phillips-curve', 'taylor-rule', 'wage-bargaining', 'policy-lags'],
  },
  {
    id: 'anchored-expectations',
    title: 'Anchored expectations',
    oneLiner:
      'When people trust the inflation target, they expect inflation to return to it, so shocks fade instead of feeding on themselves.',
    body: p(
      `Inflation expectations are *anchored* when people expect inflation to return to the central bank's target, whatever it is today. The Central Bank of Iceland's target, agreed with the government in 2001, is 2.5% a year.`,
      `Anchoring matters because expectations feed into wages and prices. If workers and firms believe a jump in import prices is temporary, they do not build it into next year's pay claims and price lists, and the jump fades. If they do not believe it, it spreads. Ben Bernanke (2007) described well-anchored long-run expectations as central to modern monetary policy, and IMF work finds that inflation targeting has broadly helped to anchor them.`,
      `In Iceland the picture is mixed. The IMF (2024) found some anchoring of long-term expectations but strong persistence in households' short-term expectations, and in 2026 the Central Bank reported that short-term expectations had risen more than long-term ones.`,
      `Anchoring is earned by a record of hitting the target and lost by missing it. New Keynesian models often assume strong anchoring; many post-Keynesian and empirical researchers treat it as fragile. In a model, the strength of the pull towards the target is a dial worth varying rather than a known constant.`,
    ),
    school: 'new-keynesian',
    references: [ref.bernanke2007, ref.imfInflationTargeting, ref.imf2024si],
    related: ['adaptive-expectations', 'taylor-rule', 'exchange-rate-pass-through', 'wage-bargaining', 'policy-lags'],
  },
  {
    id: 'profit-squeeze',
    title: 'Profit squeeze',
    oneLiner:
      'Profits are what is left after costs, so a pay rise not matched by prices cuts profits proportionally more than wages rise.',
    body: p(
      `Profits are a *residual*: what remains of a firm's income after wages and other costs are paid. That makes them move more than proportionally.`,
      `Take 100 krónur of domestic factor income, of which about 60 goes to wages and 40 to gross profits, roughly Iceland's split in 2025. Raise wages 10% with prices unchanged and wages go from 60 to 66. Profits fall from 40 to 34: a squeeze of 15%, not 10%. The wage share rises from 60% to 66%.`,
      `What happens next is the subject of a long debate. Firms may pass the cost on in higher prices (see cost pass-through), restoring margins but eroding the real pay rise. They may cut hiring and investment, raising unemployment and slowing later wage growth. Richard Goodwin modelled this tug-of-war between wages and profits as a cycle, and Keen's Minsky models build on it.`,
      `Post-Keynesians add a twist: workers spend most of what they earn, so higher wages also raise sales and can partly restore profits. Whether an economy is *wage-led* or *profit-led* is an empirical question. Small, open economies, where much spending leaks abroad and exporters compete on cost, are more likely to be profit-led.`,
    ),
    school: 'post-keynesian',
    references: [ref.cbiMb2026, ref.lavoie2014, ref.keen1995],
    related: ['markup-pricing', 'cost-pass-through', 'wage-bargaining', 'real-wages', 'investment-accelerator', 'okun-law'],
  },
  {
    id: 'real-wages',
    title: 'Real wages',
    oneLiner: 'What a wage can buy: pay adjusted for prices. Real wages rise only when pay grows faster than inflation.',
    body: p(
      `A *nominal* wage is the number of krónur you are paid. A *real* wage is what those krónur can buy: the nominal wage divided by the price level. If pay rises 7% and prices rise 5%, the real wage rises about 2%.`,
      `Keynes pointed out a puzzle that still matters: workers bargain over nominal wages, but the real wage they end up with also depends on prices, which firms set. A large settlement can be partly undone if firms pass the cost on, and a fall in the króna can cut real wages quickly by raising import prices.`,
      `In the long run, real wages grow roughly with productivity, the output of an hour's work. In the short run they swing with bargaining power, the exchange rate and the business cycle. The IMF (2026) notes that Icelandic real wages strengthened in 2025 as nominal wage growth outpaced falling inflation.`,
      `Real wages link many ideas in Iceland Inc. They shape how much households can spend, whether review clauses in wage agreements are triggered, and how large the profit squeeze is. A rise in real wages without a matching rise in productivity means a higher wage share and a lower profit share.`,
    ),
    school: 'keynesian',
    references: [ref.imf2026, ref.cbiMb2026],
    related: ['wage-bargaining', 'cost-pass-through', 'profit-squeeze', 'exchange-rate-pass-through', 'consumption-function'],
  },

  /* =========================== Demand and output =========================== */
  {
    id: 'consumption-function',
    title: 'Consumption function',
    oneLiner:
      'Household spending depends mainly on income, and also on wealth, interest rates, new borrowing and fear of unemployment.',
    body: p(
      `Keynes proposed that when income rises, people spend part of the increase and save the rest. The share of an extra króna that is spent is the *marginal propensity to consume*. This simple *consumption function* is the backbone of most macroeconomic models.`,
      `Later work added more influences. People smooth spending over time, so a one-off windfall is spent more slowly than a lasting pay rise. Wealth matters: households with more assets spend more. Interest rates matter: higher rates reward saving and raise borrowers' payments. Fear of unemployment encourages *precautionary* saving. And new borrowing lets people spend more than their income.`,
      `The Central Bank of Iceland's QMM model makes long-run consumption depend on real disposable income, real household wealth and the real short-term interest rate, with unemployment adding a short-run precautionary effect.`,
      `In Iceland Inc., a consumption rule is written as a sum of named terms, such as "higher incomes", "liquid wealth", "interest on debt" and "new borrowing", so the inspector can show which term is moving spending at any moment. Economists differ on the weights: post-Keynesians stress current income and credit, mainstream models expected lifetime income. Every weight is an adjustable assumption.`,
    ),
    school: 'keynesian',
    references: [ref.imfKeynes, ref.qmm2019, ref.godleyLavoie],
    related: ['multiplier', 'paradox-of-thrift', 'habit-persistence', 'housing-wealth-effect', 'credit-impulse', 'import-leakage'],
  },
  {
    id: 'paradox-of-thrift',
    title: 'Paradox of thrift',
    oneLiner: 'If everyone tries to save more at once, spending and incomes fall, and total saving may not rise at all.',
    body: p(
      `Saving more is sensible for one household. But one person's spending is another's income. If all households try to save more at the same time, shops sell less, firms cut hours and jobs, incomes fall, and the saving people can afford shrinks with their incomes. Total saving may end up no higher while everyone is poorer. This is the *paradox of thrift*, popularised by Keynes.`,
      `Sectoral balances show why. The private sector as a whole can raise its net saving only if another sector, the government or the rest of the world, runs a bigger deficit. If neither does, the attempt to save more ends in lower income instead.`,
      `The paradox has limits, and economists argue about them. In the classical and much of the mainstream view, higher saving funds more investment through lower interest rates and so raises future output. In a small open economy such as Iceland, lower domestic spending also cuts imports and may weaken the króna, which helps exporters and cushions the fall in income.`,
      `In a flow model, a rise in households' desire to save shows up first as lower spending and income, and only later, if at all, as more wealth.`,
    ),
    school: 'keynesian',
    references: [ref.godleyLavoie, ref.lavoie2014],
    related: ['sectoral-balances', 'consumption-function', 'multiplier', 'import-leakage', 'automatic-stabilisers'],
  },
  {
    id: 'multiplier',
    title: 'The multiplier',
    oneLiner:
      "An extra króna of spending becomes someone's income, part of which is spent again, so the total effect can exceed the first injection.",
    body: p(
      `When the government pays for a new school, the builders are paid; they spend part of their income in shops; the shops pay their staff, who spend part of theirs; and so on. Each round is smaller, because some income is saved, some goes in taxes and some is spent on imports. The *multiplier* is the total rise in output divided by the first injection of spending.`,
      `Tax cuts and benefits multiply less than purchases: recipients save part of the first round (Coenen et al. 2012).`,
      `Leakages set its size. Iceland's imports equal over 40% of GDP, so much of each round leaks abroad. Taxes that rise with income shrink it further, and if the central bank raises rates in response, it shrinks again. IMF guidance (Batini et al. 2014) finds that fiscal multipliers are larger in downturns and smaller in very open economies and where monetary policy leans against fiscal policy.`,
      `Economists disagree about the size. Some argue that households save tax cuts in anticipation of later tax rises (*Ricardian equivalence*); others that multipliers are large in deep slumps. Keynesian models put the multiplier at the centre of fiscal policy.`,
      `Iceland Inc. has no multiplier parameter. The multiplier emerges from the spending rules and leakages, and can be measured by comparing a run with extra spending to one without.`,
    ),
    school: 'keynesian',
    references: [ref.imfKeynes, ref.imfMultipliers, ref.coenen2012],
    related: ['import-leakage', 'consumption-function', 'automatic-stabilisers', 'paradox-of-thrift', 'counterfactual'],
  },
  {
    id: 'investment-accelerator',
    title: 'Investment accelerator',
    oneLiner: 'Firms invest more when sales are growing and they need more capacity, so investment swings harder than output.',
    body: p(
      `Firms buy machines, buildings and software to meet demand. If sales are steady, they only need to replace what wears out. If sales are growing, they need more capacity, so investment depends on the *growth* of output, not just its level. This is the *accelerator*. Paul Samuelson (1939) showed that combining it with the multiplier can produce boom-and-bust cycles.`,
      `The accelerator helps explain why investment is the most volatile part of demand: a slowdown in sales growth, even without a fall in sales, can cut investment sharply. The IMF (2015) found that weak output explains most of the slump in business investment in advanced economies after the 2008 crisis.`,
      `Other forces matter too. Higher interest rates raise the cost of funds; profits provide the money and confidence to invest, a point stressed by Kalecki and in Keen's Minsky models; and uncertainty makes firms wait.`,
      `The Central Bank of Iceland's QMM model gives short-run business investment accelerator properties, with output growth driving investment growth. It treats aluminium, aircraft and ship investment separately, because a single smelter or aircraft order can move Iceland's investment figures on its own.`,
    ),
    school: 'keynesian',
    references: [ref.samuelson1939, ref.weo2015ch4, ref.qmm2011],
    related: ['multiplier', 'capacity-utilisation', 'profit-squeeze', 'minsky-instability', 'policy-lags'],
  },
  {
    id: 'import-leakage',
    title: 'Import leakage',
    oneLiner:
      'Part of every króna spent in Iceland buys imports, so it supports incomes abroad and leaks out of the domestic income circuit.',
    body: p(
      `When Icelanders spend, part of the money buys goods and services made abroad: cars, fuel, clothes, holidays and the imported parts of almost everything else. That part becomes income for foreign producers, not Icelandic ones. Economists call it a *leakage* from the circular flow of income, alongside saving and taxes.`,
      `Iceland is a very open economy. Imports equal over 40% of GDP, and around a third of the consumer basket is imported goods. So when demand rises, a large share of it spills abroad. That limits pressure on domestic capacity and prices, but it weakens the multiplier and worsens the trade balance.`,
      `Import leakage is one reason fiscal stimulus has a smaller effect on output in small open economies than in large ones, and why a spending boom in Iceland shows up quickly in a wider current-account deficit.`,
      `The money does not vanish. The krónur paid for imports end up with foreigners, who may spend them on Icelandic exports, hold Icelandic assets or sell them for other currencies, which moves the exchange rate. In Iceland Inc., imports are a flow from domestic players to the rest of the world, which has a balance sheet of its own.`,
    ),
    school: 'keynesian',
    references: [ref.imfMultipliers, ref.qmm2019],
    related: ['multiplier', 'current-account', 'floating-exchange-rate', 'consumption-function', 'export-sectors'],
  },
  {
    id: 'capacity-utilisation',
    title: 'Capacity utilisation',
    oneLiner:
      'How hard firms are running their existing staff and equipment. High utilisation means pressure on prices; low utilisation means slack.',
    body: p(
      `Firms rarely run flat out. *Capacity utilisation* measures how close they are to the output they could produce with their current staff, machines and buildings. When it is high, firms struggle to meet orders, raise prices more easily and invest to expand. When it is low, there is *slack*: output could rise without much pressure on prices.`,
      `The Central Bank of Iceland tracks this with Gallup's surveys of company executives, asking whether their firms are short of staff and could meet unexpected demand, combined with other data into a resource-utilisation indicator. In spring 2026 about 43% of executives reported difficulty responding to unexpected demand, close to the historical average, and the Bank expected a slack of just under 1% of capacity in 2026.`,
      `Economists disagree about the long run. Mainstream models assume utilisation returns to a normal rate, so demand affects output only temporarily. Kaleckian post-Keynesian models allow utilisation to stay above or below normal for long periods, so demand can shape growth itself; others reply that firms keep investing until utilisation returns to normal.`,
      `Capacity is the idea behind the *output gap*, one of the inputs to a central bank's policy rule.`,
    ),
    school: 'post-keynesian',
    references: [ref.cbiMb2026, ref.lavoie2014],
    related: ['investment-accelerator', 'okun-law', 'markup-pricing', 'taylor-rule', 'wage-phillips-curve'],
  },
  {
    id: 'okun-law',
    title: "Okun's law",
    oneLiner:
      'When output grows more slowly than its trend, unemployment tends to rise, by a roughly stable amount per point of lost output.',
    body: p(
      `In 1962 Arthur Okun noticed a regular pattern in US data: each percentage point by which output fell short of its potential came with roughly a third to half a point more unemployment. Firms facing weaker sales cut hours and hiring first, and jobs later.`,
      `*Okun's law* is a rule of thumb, not a law of nature. Its size differs across countries, depending on how easily firms hire and fire and how much they adjust hours instead of jobs. Ball, Leigh and Loungani (2013) find it a strong and fairly stable relationship in most advanced economies, with coefficients that vary from country to country.`,
      `The Central Bank of Iceland's QMM model contains an Okun-type relation between the gap of unemployment from its natural rate and the gap between actual and potential output growth.`,
      `Iceland has a twist: migration. Foreign workers, about a fifth of the population, arrive when jobs are plentiful and fewer come when they are not. Employment can then swing with output while unemployment moves less than Okun's law would suggest (see migration as a buffer). Through unemployment benefits, the same link turns falling output into higher government spending.`,
    ),
    school: 'empirical',
    references: [ref.okun2013, ref.qmm2019, ref.imf2026],
    related: ['capacity-utilisation', 'migration-buffer', 'wage-phillips-curve', 'automatic-stabilisers', 'investment-accelerator'],
  },
  {
    id: 'habit-persistence',
    title: 'Habit persistence',
    oneLiner:
      'People adjust spending gradually because they are used to a standard of living, so consumption responds slowly to changes in income.',
    body: p(
      `People get used to a way of life. A family that gets a pay rise does not spend all of it at once, and a family whose income falls does not slash spending overnight either. *Habit persistence* means that today's spending depends partly on yesterday's.`,
      `James Duesenberry argued in 1949 that people judge their spending against their own past and against their neighbours. Modern models build habits into household preferences. Jeffrey Fuhrer (2000) showed that adding habit formation helps models match the slow, hump-shaped response of consumption to interest-rate changes seen in the data.`,
      `Habits explain why a shock to income, such as a wage settlement or a slump in tourism, shows up in consumption over quarters rather than weeks. They also explain why households may borrow or draw down savings to protect their living standard when income falls.`,
      `The evidence from individual households is weaker than in aggregate data, and some economists think other frictions, such as slow attention to news or borrowing limits, explain the same patterns. In Iceland Inc., gradual adjustment of spending towards its desired level plays the same role.`,
    ),
    school: 'new-keynesian',
    references: [ref.fuhrer2000, ref.qmm2019],
    related: ['consumption-function', 'gradual-adjustment', 'policy-lags', 'multiplier'],
  },

  /* ================================= Policy ================================ */
  {
    id: 'taylor-rule',
    title: 'Taylor rule',
    oneLiner:
      'A simple recipe for setting interest rates: raise them when inflation is above target or the economy runs hot, cut them when below.',
    body: p(
      `John Taylor (1993) noticed that US interest rates could be described by a simple formula:`,
      `*key rate = neutral real rate + inflation + 0.5 × (inflation − target) + 0.5 × output gap*`,
      `The *neutral real rate* is the inflation-adjusted rate that neither stimulates nor restrains the economy; the *output gap* is how far output is above or below its sustainable level. The key feature is that the rate moves more than one-for-one with inflation, so the *real* rate rises when inflation climbs.`,
      `Many central-bank models, including the Central Bank of Iceland's QMM, describe policy with rules of this kind. In 2026 the Bank estimated its neutral real rate at about 2¼%, against an inflation target of 2.5%, and the key rate stood at 7.75% after rises in the spring.`,
      `A Taylor rule is a description, not an instruction. The Monetary Policy Committee weighs many indicators, and the Federal Reserve notes that different rules can give quite different answers. Post-Keynesians add that rate changes redistribute income as much as they curb demand. In Iceland Inc., the rule sets the key rate only when stabilisers are Automatic; on Manual it only suggests one.`,
    ),
    school: 'new-keynesian',
    references: [ref.taylor1993, ref.fedRules, ref.cbiMb2026],
    related: ['policy-lags', 'anchored-expectations', 'interest-distribution', 'capacity-utilisation', 'adaptive-expectations', 'carry-trade'],
  },
  {
    id: 'interest-rate-channel',
    title: 'Interest-rate channel',
    oneLiner: 'How a change in the key rate reaches spending: through the rates banks and the government pay and charge, saving and borrowing.',
    body: p(
      `The central bank sets only one rate, the rate it pays on banks' reserves. The *interest-rate channel* is how that rate travels to the rest of the economy (Mishkin 1995). Banks pass it on to the rates on deposits, loans and mortgages, and the government's borrowing costs follow it too.`,
      `Households then weigh spending today against spending later: a higher *real* rate, the rate after expected inflation, rewards saving and makes borrowing dearer. Firms compare the return on a new machine or building with the cost of the money to pay for it, the *user cost of capital*. Bernanke and Gertler (1995) add that higher rates also weaken borrowers' balance sheets, which tightens credit further.`,
      `This is transmission, not a decision. It works the same whether the rate was set by a rule such as the Taylor rule or held by hand. In Iceland many mortgages are CPI-indexed or fixed for years, so the channel reaches borrowers more slowly than in countries with floating-rate loans. In Iceland Inc., the key rate passes into bank, bond and mortgage rates, and the real rate enters households' spending and firms' investment.`,
    ),
    school: 'keynesian',
    references: [ref.mishkin1995, ref.bernankeGertler1995, ref.cbiMb2026],
    related: ['taylor-rule', 'policy-lags', 'interest-distribution', 'consumption-function', 'investment-accelerator'],
  },
  {
    id: 'policy-lags',
    title: 'Policy lags',
    oneLiner:
      'Interest-rate changes take many months, often more than a year, to have their largest effect on output and inflation.',
    body: p(
      `Milton Friedman warned that monetary policy works with "long and variable lags". A rate rise changes some borrowing costs at once, but households and firms take time to revise their plans, contracts take time to reset, and prices respond more slowly still.`,
      `A meta-analysis of 67 studies (Havranek & Rusnak 2013) found that prices reach their largest response to a rate change after 29 months on average, and later in countries with more developed financial systems. The Central Bank of Iceland's QMM model shows the largest effect of a one-point rate rise on both output and inflation in the fifth quarter, with the economy close to baseline after five to six years.`,
      `Lags create a dilemma: a central bank must act on forecasts of where the economy will be, not where it is, and acting late and hard can overshoot. Fiscal policy has lags too, in deciding, legislating and spending.`,
      `Iceland adds its own delays. Many mortgages are CPI-indexed or have rates fixed for up to five years, so a higher key rate reaches many borrowers only slowly. In Iceland Inc., lags come from gradual adjustment in behaviour, so the ideas at play shift month by month after a lever is pulled.`,
    ),
    school: 'monetarist',
    references: [ref.havranekRusnak, ref.qmm2011, ref.hypostat2024],
    related: ['taylor-rule', 'gradual-adjustment', 'indexation', 'anchored-expectations', 'automatic-stabilisers'],
  },
  {
    id: 'automatic-stabilisers',
    title: 'Automatic stabilisers',
    oneLiner: 'Taxes that fall and benefits that rise in a downturn cushion incomes without any new decision by the government.',
    body: p(
      `When the economy slows, the government's budget moves on its own. People earn and spend less, so they pay less income tax and VAT; more people lose their jobs, so unemployment benefits rise. The deficit widens, supporting household income just when private demand is weak. In a boom the reverse happens. These are *automatic stabilisers*: unlike new measures, they need no decision and suffer no implementation delay (Horton & El-Ganainy 2009).`,
      `Their size depends on the size of government and how progressive taxes are. Iceland's general government collected 43% of GDP and spent 45.7% in 2025, so its stabilisers are substantial.`,
      `Iceland's fiscal rule is designed to let them work: unemployment benefits and interest costs are outside its spending ceiling, so a downturn can raise them without breaking the rule.`,
      `Stabilisers are not free. The deficits they create add to public debt, and if a downturn proves permanent they can delay adjustment. Some economists want them strengthened; others worry they weaken budget discipline. In a flow model, stabilisers emerge from tax and benefit rules tied to income and unemployment, not from a separate equation.`,
    ),
    school: 'keynesian',
    references: [ref.imfFiscalPolicy, ref.staticeGov2025, ref.fiscalPlan],
    related: ['fiscal-rule', 'multiplier', 'sectoral-balances', 'okun-law', 'policy-lags'],
  },
  {
    id: 'fiscal-rule',
    title: "Iceland's fiscal stability rule",
    oneLiner:
      "Since 2026, the state's underlying spending may grow by at most 2% a year in real terms, with some items outside the cap.",
    body: p(
      `A *fiscal rule* is a legal limit on government budgets. In 2025 the Althingi added a *stability rule* (*stöðugleikaregla*) to article 7 of the Public Finance Act: the underlying expenditure of the central government's A1 part may grow by at most 2% a year in real terms. It applies from 2026.`,
      `"Underlying" means some items are excluded, notably interest costs, unemployment benefits, pension obligations, investment contributions and statutory transfers to municipalities. Spending may also grow faster if new revenue measures pay for it. The rule aims to stop spending growing systematically faster than the economy, and to stop temporary revenue, such as a boom's windfall, being spent on permanent programmes. The fiscal plan for 2027–2031 projects real growth well below the 2% ceiling.`,
      `Because benefits and interest are outside the cap, automatic stabilisers still work in a downturn. The IMF says the rule should help counter Iceland's history of *pro-cyclical* policy, spending more in booms and less in slumps, and suggests reassessing the 2% limit regularly. Critics of spending rules in general warn that they can squeeze public investment or push spending off budget.`,
    ),
    school: 'institutional',
    references: [ref.fiscalPlan, ref.imf2026],
    related: ['automatic-stabilisers', 'bond-buyers', 'sectoral-balances', 'multiplier', 'deficits-and-money'],
  },
  {
    id: 'macroprudential-policy',
    title: 'Macroprudential policy',
    oneLiner:
      'Rules that protect the financial system as a whole, such as caps on mortgage borrowing and extra capital buffers for banks.',
    body: p(
      `Traditional bank supervision asks whether each bank is safe. *Macroprudential* policy asks whether the system as a whole is safe: whether households and firms are borrowing too much, whether banks share the same risks, and whether a boom is building that could end in a crash (IMF 2013).`,
      `Its tools fall into two groups:`,
      `- **Borrower-based measures** limit new loans. In Iceland these are the debt-service cap (35% of disposable income, 40% for first-time buyers) and the loan-to-value cap (80%, or 90% for first-time buyers).\n- **Capital-based measures** require banks to hold more capital, for example a countercyclical buffer that rises in good times and can be released in bad times.`,
      `In Iceland, these tools are set by the Central Bank's Financial Stability Committee.`,
      `Unlike a rate rise, a tighter borrowing cap does not raise payments for existing borrowers, give depositors a windfall or move the króna. It slows new credit directly. That narrowness is both its strength and its limit: it can cool a housing boom without cooling the whole economy, but borrowing can move to lenders outside its reach.`,
    ),
    school: 'institutional',
    references: [ref.imfMacroprudential, ref.cbiFs2026, ref.rules1300],
    related: ['debt-service-constraint', 'loan-to-value', 'bank-capital', 'credit-and-house-prices', 'minsky-instability'],
  },
  {
    id: 'bond-buyers',
    title: 'Who buys government bonds',
    oneLiner:
      'Whether banks, the central bank, pension funds or foreigners buy new government bonds changes the money supply, who earns the interest and the króna.',
    body: p(
      `The Treasury finances deficits and refinances maturing debt by selling bonds, managed by Government Debt Management (*Lánamál ríkisins*). Who buys them matters in four ways:`,
      `- **Money:** banks and the central bank pay with newly created reserves, leaving new deposits in the economy; pension funds and households pay with deposits that already exist (see deficits and money).\n- **Interest rates:** if domestic savers must be persuaded to hold more bonds, yields may rise. Iceland Inc. leaves this out: its new bonds pay the key rate plus a fixed spread, whoever buys.\n- **The króna:** foreign buyers must first buy krónur. In 2025 foreign financial institutions bought about ISK 100bn net of krónur, roughly double 2024, drawn by the interest-rate differential; such inflows support the currency but can reverse (see carry trade). In the Iceland model they trade bonds with banks on their own, not through the bond-buyer lever.\n- **Who earns the interest:** indexed Treasury bonds pay indexation to their holders, largely pension funds, and so, in the end, to retirees.`,
      `Pension funds are natural buyers of long, indexed bonds because their liabilities are long and in real terms. That closes a domestic circuit: contributions flow to the funds, the funds lend to the state, and the state pays interest back to the funds.`,
    ),
    school: 'institutional',
    references: [ref.lanamal, ref.cbiFs2026, ref.boe2014],
    related: ['deficits-and-money', 'funded-pensions', 'carry-trade', 'reserves-and-payments', 'fiscal-rule', 'indexation'],
  },

  /* ================================ External =============================== */
  {
    id: 'floating-exchange-rate',
    title: 'Floating exchange rate',
    oneLiner: "The króna's value is set each day by supply of and demand for krónur, not fixed by the central bank.",
    body: p(
      `The króna *floats*: its price against other currencies is set in the foreign-exchange market by the flows of krónur being bought and sold. Exporters and foreign tourists sell foreign currency for krónur; importers, pension funds investing abroad and foreigners leaving Icelandic assets sell krónur for foreign currency. The price moves until the two sides match. The Central Bank can buy or sell currency from its reserves but does not target a level.`,
      `A float acts as a *shock absorber*. If tourism slumps, the króna tends to weaken, which makes Icelandic goods and holidays cheaper abroad and imports dearer at home, protecting jobs at the cost of higher inflation. The IMF (2026) calls the flexible exchange rate Iceland's main shock absorber.`,
      `The costs are volatility and pass-through to prices. A small currency can swing sharply on capital flows, as in 2008, when the króna collapsed and capital controls followed for years. Pension funds' foreign purchases, typically ISK 80–120bn a year, are the largest regular outflow.`,
      `Whether Iceland would be better off with the euro is a long-running debate. The IMF's 2026 analysis found a mixed picture: the euro would remove currency risk, but also the króna as a stabiliser.`,
    ),
    school: 'institutional',
    references: [ref.imf2026, ref.cbiFs2026],
    related: ['exchange-rate-pass-through', 'carry-trade', 'current-account', 'real-exchange-rate', 'funded-pensions', 'revaluation'],
  },
  {
    id: 'carry-trade',
    title: 'Carry trade',
    oneLiner:
      'Investors borrow in low-interest currencies to hold high-interest ones, such as the króna, pushing it up until the trade unwinds.',
    body: p(
      `In a *carry trade*, an investor borrows in a currency with low interest rates, such as the yen or the euro, and holds assets in one with high rates, such as the króna. As long as the exchange rate holds steady, the investor pockets the difference, the *carry*.`,
      `Carry trades push the high-rate currency up, sometimes for years. But they are fragile: if the currency starts to fall, months of interest gains can vanish in days, and investors rush for the exit together. Brunnermeier, Nagel and Pedersen (2008) show that exchange-rate moves between high-rate and low-rate currencies are *negatively skewed*: steady gains punctuated by sudden crashes when carry trades unwind. Traders say such currencies go up by the stairs and down by the lift.`,
      `Iceland learned this the hard way. Before 2008, high rates drew large foreign inflows, including króna "glacier bonds" issued abroad, which lifted the króna and fed a consumption boom. When the flows reversed, the króna collapsed.`,
      `The incentive remains. In 2025 foreign financial institutions' net purchases of krónur roughly doubled to about ISK 100bn, attracted by the interest-rate differential. A rate rise that draws such money in strengthens the króna and lowers import prices, which helps fight inflation but hurts exporters.`,
    ),
    school: 'empirical',
    references: [ref.carryTrades, ref.cbiFs2026],
    related: ['floating-exchange-rate', 'taylor-rule', 'bond-buyers', 'exchange-rate-pass-through', 'minsky-instability'],
  },
  {
    id: 'current-account',
    title: 'Current account',
    oneLiner:
      "Iceland's income from the rest of the world minus its payments to it: trade, plus cross-border interest, dividends and transfers.",
    body: p(
      `The *current account* records a country's income from and payments to the rest of the world, other than borrowing and lending. It has three parts: the trade balance; *primary income* (interest, dividends and wages across borders); and *secondary income* (transfers such as remittances).`,
      `A deficit means Iceland pays out more than it earns abroad, so it must borrow from foreigners or run down foreign assets. A surplus means it is lending to the rest of the world. In accounting terms, the current account equals national saving minus domestic investment (IMF BPM6), and it mirrors the sectoral balances: the rest of the world's surplus is Iceland's deficit.`,
      `Iceland ran a current-account deficit of 3.6% of GDP in 2025. Primary income swings with the profits of the foreign-owned smelters, which count as income paid abroad.`,
      `After a fall in the currency the current account often worsens before it improves (the *J-curve*, Magee 1973): imports cost more at once, while volumes take six to twelve months to respond. Deficits are not always bad: borrowing to build productive capacity can pay for itself. They are risky when they fund booms, as before 2008. Today Iceland is a net creditor, with a net international investment position of about 44% of GDP in 2025, helped by pension funds' large foreign assets.`,
    ),
    school: 'accounting',
    references: [ref.bpm6, ref.imfCurrentAccount, ref.imf2026],
    related: ['sectoral-balances', 'export-sectors', 'import-leakage', 'floating-exchange-rate', 'net-worth'],
  },
  {
    id: 'real-exchange-rate',
    title: 'Real exchange rate',
    oneLiner:
      'The exchange rate adjusted for prices or wages at home and abroad: a measure of how competitive Icelandic goods and services are.',
    body: p(
      `The *nominal* exchange rate says how many krónur buy a euro. The *real* exchange rate adjusts it for prices: it compares the cost of Icelandic goods with the cost of similar goods abroad, both in the same currency (Catão 2007).`,
      `A *real appreciation* means Iceland has become more expensive relative to its trading partners. It can happen because the króna strengthens, because Icelandic prices or wages rise faster than foreign ones, or both. Either way, exporters and firms competing with imports lose ground, while Icelandic households find foreign goods and holidays cheaper.`,
      `Iceland's real exchange rate, measured with consumer prices or unit labour costs, swings widely. It rose steeply in the boom before 2008, collapsed with the króna and has risen again with the tourism boom. The IMF (2026) warns that competitiveness pressures could emerge as tourism growth slows.`,
      `The real exchange rate ties several levers together. A wage settlement raises it through costs; a depreciation lowers it through the currency but raises import prices, which may later feed back into wages. Economists debate how much of a real appreciation reflects productivity catching up and how much is lost competitiveness.`,
    ),
    school: 'empirical',
    references: [ref.imfRealExchangeRate, ref.imf2026],
    related: ['purchasing-power-parity', 'floating-exchange-rate', 'export-sectors', 'wage-bargaining', 'exchange-rate-pass-through'],
  },
  {
    id: 'purchasing-power-parity',
    title: 'Purchasing power parity',
    oneLiner: 'The idea that, in the long run, exchange rates should make the same goods cost the same everywhere.',
    body: p(
      `*Purchasing power parity* (PPP) says that, once converted into a common currency, a basket of goods should cost the same in every country. If Icelandic prices rise 5% faster than euro-area prices, PPP predicts that the króna will eventually fall about 5% against the euro, leaving the real exchange rate unchanged.`,
      `As a short-run theory PPP fails badly. Exchange rates move far more than price levels, and many things, such as haircuts, rent and restaurant meals, cannot be traded across borders, so their prices can differ a great deal. Iceland has been famously expensive for visitors for a long time.`,
      `As a long-run tendency PPP has more support, but the pull is slow. Sarno and Taylor (2002), reviewing the evidence, report a consensus that half of any deviation from PPP disappears in about three to five years, with signs that large deviations correct faster than small ones. Richer countries also tend to have higher price levels, partly because their productivity is higher in traded goods (the *Balassa–Samuelson effect*).`,
      `PPP exchange rates are also used to compare living standards, which is why international statistics often report GDP at both market and PPP rates.`,
    ),
    school: 'empirical',
    references: [ref.sarnoTaylor, ref.imfRealExchangeRate],
    related: ['real-exchange-rate', 'floating-exchange-rate', 'exchange-rate-pass-through', 'model-limits'],
  },
  {
    id: 'export-sectors',
    title: "Iceland's export sectors",
    oneLiner:
      "Tourism, marine products, aluminium and, increasingly, intellectual property earn most of Iceland's foreign currency.",
    body: p(
      `Iceland lives by exporting: exports of goods and services are around 40% of GDP. In 2025 export revenue came mainly from four sources (Íslandsbanki 2026):`,
      `- **Tourism:** ISK 629bn, 32% of export revenue, by far the largest and highly seasonal.\n- **Marine products:** ISK 359bn, 18%, dependent on fish stocks, quotas and world prices.\n- **Aluminium:** ISK 318bn, 16%, from three smelters that are entirely foreign-owned and run on Icelandic hydro and geothermal power.\n- **Intellectual property**, such as pharmaceuticals and software: ISK 292bn, 15%.`,
      `The sectors behave differently. Tourism is labour-intensive and employs many foreign workers, so a tourism shock hits jobs, wages and migration. Aluminium uses mostly imported inputs, so less of its revenue stays in Iceland as income; and because the smelters are foreign-owned, their profits flow abroad as primary income, while their owners also absorb most of the losses when aluminium prices fall. Fisheries earnings swing with catches, as in 2025's disappointing season.`,
      `A strong króna squeezes every exporter's earnings in krónur and a weak one lifts them, which is why the exchange rate, wages and export prices together decide Iceland's competitiveness.`,
    ),
    school: 'empirical',
    references: [ref.islandsbanki2026, ref.imf2026],
    related: ['current-account', 'real-exchange-rate', 'floating-exchange-rate', 'migration-buffer', 'import-leakage'],
  },

  /* ================================ Housing ================================ */
  {
    id: 'credit-and-house-prices',
    title: 'Mortgage credit and house prices',
    oneLiner:
      'Rising house prices need a growing flow of mortgage money, so price growth tends to follow the acceleration of mortgage credit.',
    body: p(
      `Most homes are bought with borrowed money, so the money spent on housing in a year is largely the new mortgage credit created that year, plus buyers' savings. Steve Keen argues that this makes the *change* in house prices follow the *acceleration* of mortgage debt: the housing version of the credit impulse. When new mortgage lending grows faster each year, prices rise faster; when lending merely stops growing, price rises slow; and prices can fall while total debt is still rising (Keen 2011).`,
      `Jordà, Schularick and Taylor (2014), using data on 17 advanced economies since 1870, show that mortgage lending's share of bank balance sheets roughly doubled over the twentieth century and that housing finance has come to shape recessions and recoveries.`,
      `In Iceland, credit and housing interact with the borrowing caps, which limit how much new credit can flow, and with the mix of lenders: banks create deposits when they lend, while pension funds recycle existing ones.`,
      `Other forces move prices too: incomes, interest rates, population growth (fast in Iceland, driven by immigration) and the supply and cost of new homes. Many economists see credit as one driver among several, and causation runs both ways: higher prices also mean bigger loans.`,
    ),
    school: 'post-keynesian',
    references: [ref.keen2011rwer, ref.greatMortgaging, ref.cbiFs2026],
    related: ['credit-impulse', 'housing-wealth-effect', 'debt-service-constraint', 'loan-to-value', 'endogenous-money', 'minsky-instability', 'intergenerational-flows'],
  },
  {
    id: 'housing-wealth-effect',
    title: 'Housing wealth effect',
    oneLiner:
      'When home values rise, owners feel richer and can borrow more against their homes, so they tend to spend a little more.',
    body: p(
      `For most Icelandic households, the home is the largest asset they can sell or borrow against. When house prices rise, owners' net worth rises, even though nothing has been paid (a revaluation). Many then spend a little more: the *housing wealth effect*.`,
      `Case, Quigley and Shiller (2001), studying 14 countries and US states, found a statistically significant and rather large effect of housing wealth on consumption. The Central Bank of Iceland's QMM model counts housing wealth in the household wealth that drives consumption over time.`,
      `Economists disagree about why it happens. One view is a true wealth effect: people feel richer. A second is a *collateral* effect: higher prices let owners borrow more against their homes, which matters most for households short of cash. A third is that prices and spending both respond to a common cause, such as expected income growth.`,
      `There is also a distributional twist. Higher prices make owners richer but future buyers, often the young, poorer, since they must pay more for the same home. For the country as a whole, a higher price for the same houses is not extra real wealth. In Iceland, indexation adds another twist: inflation raises the principal of indexed mortgages and erodes owners' equity.`,
    ),
    school: 'empirical',
    references: [ref.caseQuigleyShiller, ref.qmm2019],
    related: ['credit-and-house-prices', 'consumption-function', 'revaluation', 'net-worth', 'intergenerational-flows'],
  },

  /* ================================ Pensions =============================== */
  {
    id: 'funded-pensions',
    title: "Iceland's funded pensions",
    oneLiner:
      'Workers and employers pay at least 15.5% of wages into pension funds, whose assets are worth about 180% of GDP.',
    body: p(
      `Iceland's occupational pensions are *funded*: contributions are invested, and pensions are paid from the resulting assets, rather than from current workers' taxes as in a *pay-as-you-go* system. Membership is mandatory, and the minimum contribution is 15.5% of wages, split between employer and employee (IMF 2023).`,
      `The funds are huge. At the end of 2025 they held ISK 8,878bn, 179% of GDP, among the largest pension systems in the world relative to the economy. Over 40% of their assets are foreign, under a legal limit that rises to 65% by 2036. That size makes them central to the model:`,
      `- **Contributions** are a large, steady flow from wages into the funds.\n- **Lending:** the funds buy Treasury and housing bonds and lend to members directly, moving existing deposits rather than creating new ones.\n- **Currency:** their foreign purchases, typically ISK 80–120bn a year, are the largest regular outflow of krónur.\n- **Indexation:** as big holders of indexed debt, they gain when inflation raises indexed principal.`,
      `The funds value their liabilities using a fixed 3.5% real discount rate, so their solvency depends on real returns. Some economists argue their size gives them outsized influence over interest rates and the króna; others see them as stabilising, long-term domestic investors.`,
    ),
    school: 'institutional',
    references: [ref.imfFsap2023, ref.cbiFs2026],
    related: ['pension-entitlements', 'bond-buyers', 'indexation', 'floating-exchange-rate', 'intergenerational-flows', 'deficits-and-money'],
  },
  {
    id: 'pension-entitlements',
    title: 'Pension entitlements',
    oneLiner:
      "Households' claims on pension funds count as household wealth in the national accounts, and as liabilities of the funds.",
    body: p(
      `When you pay into a pension fund, you acquire a claim: a right to a future pension. The System of National Accounts treats these *pension entitlements* as a financial asset of households and a liability of the fund (SNA 2008, chapter 17). A fund's assets, the bonds, shares and loans it holds, are matched by what it owes its members.`,
      `In Iceland, pension entitlements are households' largest financial asset, far larger than their bank deposits. That changes how household balance sheets should be read: a young worker with a mortgage and little in the bank may still own substantial pension rights.`,
      `Entitlements differ from deposits. They cannot be spent today; their value depends on the fund's future returns and on assumptions such as life expectancy; and they are locked in until retirement, except that voluntary pension savings may be used towards a home. So they may affect spending less than the same amount of cash.`,
      `In Iceland Inc., contributions add to entitlements, pensions paid reduce them, and investment returns raise them. Because each entitlement is both a household asset and a fund liability, the accounting stays balanced and a fund's net worth stays close to zero.`,
    ),
    school: 'accounting',
    references: [ref.sna2008, ref.imfFsap2023],
    related: ['funded-pensions', 'net-worth', 'stock-flow-consistency', 'intergenerational-flows'],
  },

  /* ============================== Distribution ============================= */
  {
    id: 'borrowers-and-savers',
    title: 'Borrowers and savers',
    oneLiner: 'The same shock helps some households and hurts others, depending on whether they owe money or own it.',
    body: p(
      `Averages hide the most important fact about money: some people owe it and others own it. A rise in interest rates takes income from borrowers and gives it to savers. Inflation erodes the real value of non-indexed debts, helping borrowers, and of deposits, hurting savers. A fall in the króna raises the krónur value of foreign assets and of foreign-currency debts (Iceland Inc. models only the assets).`,
      `Because borrowers and savers spend differently, these transfers change total demand. Borrowers, often younger and short of cash, tend to spend a larger share of any change in income. Auclert (2019) shows that this *redistribution channel* amplifies monetary policy, and Doepke and Schneider (2006) show that surprise inflation moves wealth from bondholders to debtors.`,
      `Iceland has a twist: with about two-thirds of mortgages CPI-indexed, inflation does not erode most housing debt as it would elsewhere. Instead, indexed borrowers' principal rises with prices, and the gain goes to lenders, mostly banks and pension funds. Non-indexed borrowers and depositors face the usual transfers.`,
      `Iceland Inc. splits households into three age groups partly to make these differences visible. A single household sector would net them out and hide who gains and who loses.`,
    ),
    school: 'empirical',
    references: [ref.auclert2019, ref.doepkeSchneider, ref.cbiFs2026],
    related: ['interest-distribution', 'intergenerational-flows', 'indexation', 'taylor-rule', 'funded-pensions'],
  },
  {
    id: 'intergenerational-flows',
    title: 'Flows between generations',
    oneLiner:
      'Young households borrow to buy homes from older ones, so rate rises and inflation move income and wealth between generations.',
    body: p(
      `Follow the money in a housing market and it runs between age groups. Young households borrow from banks and pension funds to buy homes, often from older households who are moving or downsizing. The sellers put the proceeds into deposits, bonds and other savings. Over a lifetime, people move from being net borrowers to net savers.`,
      `That pattern shapes who wins and loses from policy. A rise in interest rates raises young mortgage holders' payments and increases the interest income of older savers and of pension funds, which pay pensions to retirees. Doepke and Schneider (2006) found that in the United States, surprise inflation moves wealth from older, richer households holding bonds to young, middle-class households with fixed-rate mortgages.`,
      `Iceland differs because of indexation. With most mortgages indexed, inflation adds to young borrowers' debts rather than eroding them, and pension funds, which hold much of that debt, collect the indexation on behalf of their older members.`,
      `House prices add a further transfer: high prices enrich existing owners, who are mostly older, and raise the cost of entry for the young. Iceland Inc. splits households into three age groups so that these flows between generations appear as pipes of their own.`,
    ),
    school: 'empirical',
    references: [ref.doepkeSchneider, ref.auclert2019],
    related: ['borrowers-and-savers', 'interest-distribution', 'indexation', 'funded-pensions', 'credit-and-house-prices', 'housing-wealth-effect'],
  },

  /* ================================ Modelling ============================== */
  {
    id: 'steady-state-baseline',
    title: 'Steady-state baseline',
    oneLiner:
      'Iceland Inc. starts from a calm economy in which every ratio holds still, so the effect of a single change can be seen clearly.',
    body: p(
      `Iceland Inc. does not start from today's economy, with all its moving parts. It starts from a *steady state*: a baseline in which the ratios of stocks to flows, such as debt to income or deposits to GDP, stay constant month after month. The kernel solves for this state and checks that it does not drift over 20 simulated years.`,
      `Why start there? Because a flat line makes changes easy to see. Pull one lever and every chart shows the deviation from baseline, so any movement is the result of that lever alone. Godley and Lavoie's stock-flow consistent models work the same way: the long run is defined by stable stock-flow ratios, and experiments are departures from it.`,
      `A steady state has its own logic. Stocks settle where new lending just balances repayment, and where each sector's saving just matches the growth of its wealth. If the baseline includes inflation, nominal stocks must keep growing simply to hold their ratios still, so new money must be created continually.`,
      `The baseline is a teaching device, not a picture of Iceland today. Real economies are never at rest, and the ratios are calibrated to recent data where possible.`,
    ),
    school: 'post-keynesian',
    references: [ref.godleyLavoie, ref.nikiforosZezza],
    related: ['stock-flow-consistency', 'counterfactual', 'model-limits', 'gradual-adjustment'],
  },
  {
    id: 'counterfactual',
    title: 'Counterfactuals',
    oneLiner: 'To measure what a change did, compare the shocked run with an unshocked run of the same model, not with the past.',
    body: p(
      `A *counterfactual* is what would have happened otherwise. In Iceland Inc., the effect of a lever is always measured as the difference between two runs of the same model variant, one with the change and one without. Because the model is deterministic, the unshocked run is exactly the baseline, so any difference is caused by the lever.`,
      `Comparisons must stay within one model variant. Comparing a run of a detailed housing module with a baseline from a simpler one would mix up the effect of the shock with the effect of changing the model.`,
      `The same method answers questions about channels, such as "how much of the fall in output comes through credit?" Switch the credit channel off, run shocked and unshocked versions, and compare with the full model. But such answers do not add up to 100%. Channels interact: less credit lowers income, which lowers credit further. Remove two channels one at a time and their separate effects may sum to more or less than the total. That is why the interface shows each channel as "with / without this channel", never as a waterfall of shares.`,
      `Within a single additive rule, by contrast, the named terms do add up exactly.`,
    ),
    school: 'empirical',
    references: [ref.godleyLavoie, ref.nikiforosZezza],
    related: ['steady-state-baseline', 'model-limits', 'multiplier', 'stock-flow-consistency'],
  },
  {
    id: 'model-limits',
    title: 'What this model can and cannot tell you',
    oneLiner: 'Iceland Inc. is a teaching simplification that shows mechanisms and orders of magnitude. It is not a forecast.',
    body: p(
      `Every model leaves things out; that makes it useful. Iceland Inc. keeps the accounting exact, so money cannot appear or vanish, but its behaviour (how people spend, borrow, charge or invest) is assumed. Some are estimated from Icelandic data, some borrowed from other models and some are placeholders; the inspector shows which for every parameter.`,
      `What it is good for: seeing mechanisms, such as how a wage rise becomes a profit squeeze, a price rise, a rate rise and an indexation transfer; tracing who pays whom; and a feel for directions, sizes and timing.`,
      `What it is not: a forecast of the Icelandic economy, an official view, or a substitute for the models of the Central Bank or the Ministry of Finance. It starts from a calm steady state, not today. It has one bank, simple expectations and a few types of household, and banks do not fail unless someone builds that in. No sector owes foreign currency, so the damage a falling króna did to balance sheets in 2008 is absent: as a net creditor (Lane & Shambaugh 2010), Iceland gains wealth when the króna falls.`,
      `Model time is also approximate, as Steve Keen cautioned of his Minsky model, and Olivier Blanchard (2017) argues that economics needs different models for different jobs. This is a teaching model.`,
    ),
    school: 'empirical',
    references: [ref.blanchard2017, ref.keen1995],
    related: ['counterfactual', 'steady-state-baseline', 'gradual-adjustment'],
  },

  /* ============== Added: Icelandic labour supply and model timing ============= */
  {
    id: 'migration-buffer',
    title: 'Migration as a buffer',
    oneLiner:
      'Foreign workers come to Iceland when jobs are plentiful and fewer come when jobs are scarce, softening swings in unemployment.',
    body: p(
      `Iceland's labour force expands and contracts with the business cycle, largely through migration. Immigrants were 19.6% of the population on 1 January 2026, and the share has risen fast over the past decade. Many work in tourism, construction and fish processing, sectors that hire quickly in booms.`,
      `When demand is strong, employers recruit abroad, especially from other countries in the European Economic Area, whose citizens can move freely. When demand weakens, fewer arrive and some leave. The labour force adjusts to demand, so unemployment rises less than it otherwise would. The IMF (2026) finds that Iceland's *Beveridge curve*, the link between job vacancies and unemployment, has flattened because immigration follows the business cycle.`,
      `The buffer has limits. Workers who stay through a downturn add to measured unemployment, and fast population growth adds to demand for housing and public services.`,
      `It also changes how shocks show up. A fall in demand appears more in employment and population than in the unemployment rate, which weakens the usual Okun and Phillips-curve links and eases pressure on wages in booms.`,
    ),
    school: 'empirical',
    references: [ref.staticePopulation, ref.imf2026],
    related: ['okun-law', 'wage-phillips-curve', 'export-sectors', 'credit-and-house-prices'],
  },
  {
    id: 'gradual-adjustment',
    title: 'Gradual adjustment',
    oneLiner:
      'People and firms close the gap between where they are and where they want to be step by step, not all at once.',
    body: p(
      `Most things in an economy cannot change overnight. A firm that wants more staff has to recruit; a household that wants to spend less has contracts and habits to unwind. So Iceland Inc. separates what a player *wants*, the desired value set by its rule, from what it *does* this month.`,
      `Each month, a variable with gradual adjustment closes a fixed fraction of the gap between its current and desired values. The speed is described by a *time constant*: the time it takes to close about 63% of the gap. With a time constant of one year, roughly 63% of an adjustment happens in the first year and 86% by the end of the second. Chaining several such steps gives the S-shaped delays used in system dynamics.`,
      `Steve Keen writes behaviour this way in his Minsky models, and the idea echoes the partial-adjustment models of econometrics. It keeps timing explicit instead of assuming that markets clear instantly.`,
      `The inspector shows both the desired level and the actual level moving towards it; the gap between them says the economy is still adjusting. Time constants are uncertain behavioural assumptions: change them and the path changes, though usually not the destination.`,
    ),
    school: 'post-keynesian',
    references: [ref.keen2011aea, ref.iseeDelays],
    related: ['policy-lags', 'habit-persistence', 'steady-state-baseline', 'model-limits'],
  },
];

/**
 * Themes for grouping concepts in the index and the interface. Every concept appears in
 * exactly one theme (checked by tests/concepts.test.ts).
 */
export const conceptThemes: { theme: string; ids: Id[] }[] = [
  { theme: 'Accounting', ids: ['double-entry', 'stock-flow-consistency', 'net-worth', 'sectoral-balances', 'accrual-vs-cash', 'revaluation'] },
  { theme: 'Money', ids: ['endogenous-money', 'money-destruction', 'reserves-and-payments', 'deficits-and-money', 'broad-money'] },
  {
    theme: 'Credit',
    ids: ['credit-impulse', 'debt-service-constraint', 'loan-to-value', 'amortisation', 'indexation', 'interest-distribution', 'bank-capital', 'minsky-instability'],
  },
  {
    theme: 'Prices and wages',
    ids: [
      'markup-pricing',
      'cost-pass-through',
      'exchange-rate-pass-through',
      'wage-bargaining',
      'wage-phillips-curve',
      'adaptive-expectations',
      'anchored-expectations',
      'profit-squeeze',
      'real-wages',
    ],
  },
  {
    theme: 'Demand and output',
    ids: [
      'consumption-function',
      'paradox-of-thrift',
      'multiplier',
      'investment-accelerator',
      'import-leakage',
      'capacity-utilisation',
      'okun-law',
      'habit-persistence',
      'migration-buffer',
    ],
  },
  { theme: 'Policy', ids: ['taylor-rule', 'interest-rate-channel', 'policy-lags', 'automatic-stabilisers', 'fiscal-rule', 'macroprudential-policy', 'bond-buyers'] },
  {
    theme: 'External',
    ids: ['floating-exchange-rate', 'carry-trade', 'current-account', 'real-exchange-rate', 'purchasing-power-parity', 'export-sectors'],
  },
  { theme: 'Housing', ids: ['credit-and-house-prices', 'housing-wealth-effect'] },
  { theme: 'Pensions', ids: ['funded-pensions', 'pension-entitlements'] },
  { theme: 'Distribution', ids: ['borrowers-and-savers', 'intergenerational-flows'] },
  { theme: 'Modelling', ids: ['steady-state-baseline', 'counterfactual', 'model-limits', 'gradual-adjustment'] },
];

/** Look up a concept by id. */
export const conceptById: ReadonlyMap<Id, ConceptDef> = new Map(concepts.map((c) => [c.id, c]));
