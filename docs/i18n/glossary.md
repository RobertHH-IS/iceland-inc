# English–Icelandic glossary for Iceland Inc.

Status: a draft for review by an Icelandic economist. It was checked on 28–29 September 2026 against the sources below. The inventory is in [inventory.md](inventory.md) and the code design in [architecture.md](architecture.md).

**Use.** One Icelandic term per concept, used the same way in the interface, the model texts and the concept library. Where the Central Bank (SÍ) or Statistics Iceland (Hagstofa) has a settled term, use it, because learners will meet it in the news and in the data. Where usage varies, the preferred form comes first and alternatives follow in the notes. Nouns are given in the nominative; plural forms and gender are noted where they cause trouble.

## Sources

| Code | Source | What was checked |
|---|---|---|
| ÍÐ-HAG | Íðorðabankinn (Árnastofnun), *Hagfræði* collection, idord.arnastofnun.is | English–Icelandic entries, looked up one by one through the bank's search API |
| ÍÐ-ENDUR, ÍÐ-STJ, ÍÐ-… | Íðorðabankinn, other collections: *Endurskoðun*, *Stjórnsýsluorð*, *PISCES* (fisheries), *Álorðasafnið*, *Hagrannsóknir*, *Tölfræði*, *Stærðfræði*, *LíSA* | Same |
| SÍ-PM | Seðlabanki Íslands, *Peningamál* 2024/4 (full text) and 2026/3 (19 August 2026, statement of the Monetary Policy Committee) | Term frequencies and contexts in the Icelandic text |
| SÍ-FS | Seðlabanki Íslands, *Fjármálastöðugleiki* 2026/2 (September 2026), announcement page | Contexts |
| SÍ-GB | Gagnabanki Seðlabanka Íslands (gagnabanki.sedlabanki.is), the bilingual interface catalogue (EN/IS key pairs) | Official pairs, for example "CBI key interest rate (policy rate)" = "Meginvextir SÍ (stýrivextir)" |
| SÍ-web | sedlabanki.is: site sections (Peningastefna, Fjármálastöðugleiki, Þjóðhagsvarúð, Lánþegaskilyrði fasteignalána, Gjaldeyrisforði, Markaðsaðgerðir, Greiðslumiðlun) and the explainer "Hverjir eru meginvextir (stýrivextir) Seðlabankans" | Section names and titles |
| SÍ-R | Reglur nr. 1300/2025 um hámark greiðslubyrðar fasteignalána í hlutfalli við tekjur neytenda (replaced nr. 1130/2025) | Legal terms |
| SÍ-GL | SÍ, "Eru áhrif gengisbreytinga á verð mat- og drykkjarvöru samhverf?" | *gengisleki* |
| HAG | Hagstofa Íslands, Icelandic PX tables: THJ01102 (Landsframleiðsla og þjóðartekjur), THJ06020 (Meginniðurstöður innlendra geira), THJ06029 (Útlönd S.2), THJ01202 (Þjóðhagslegur sparnaður og lánahreyfingar), THJ05111 (Helstu hagstærðir hins opinbera), THJ05165, THJ08404 (Vinnsluvirði atvinnugreina), THJ03105 (Fjármunamyndun), VIS01000 (Vísitala neysluverðs), VIS01004 (Vísitölur til verðtryggingar), VIS01106 (Vísitala markaðsverðs íbúðarhúsnæðis); subject pages | Row and dimension names |
| FJR | Fjármála- og efnahagsráðuneytið, *Fjármálaáætlun 2027–2031* | Term frequencies and contexts |
| RR | *Ritreglur* (Íslensk málnefnd, Árnastofnun, ritreglur.arnastofnun.is), §21.2.8 and §22.4 | Number formatting |
| MEDIA | RÚV, mbl.is, Vísir, Landsbankinn (secondary) | Everyday usage |
| PROP | Proposed here: no authoritative entry was found | Needs review |

The interface has no Icelandic precedent for its own words (lever, pipe, inspector), so those are proposals by nature.

## 1. The platform and the interface

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| Iceland Inc. (product name) | Ísland hf. | "hf." (hlutafélag) matches "Inc." Alternative: keep "Iceland Inc." as a brand in both languages. This is a product decision | PROP |
| player (on the map) | aðili (pl. aðilar) | SÍ and Hagstofa say *aðilar* for economic agents ("innlendir aðilar", "erlendir aðilar"). "Leikandi" sounds like a game or theatre; avoid it | SÍ-GB |
| sector (institutional) | geiri | "haggeiri" for institutional sector (ÍÐ-HAG); Hagstofa dimension "Geiri" (S.11 … S.2). Industry = atvinnugrein | ÍÐ-HAG, HAG-THJ06020 |
| group (of players) | hópur | "3 aldurshópar", "2 tegundir fyrirtækja" | PROP |
| lever | stjórntæki | As the brief proposes. "hagstjórnartæki" is the policy-instrument sense; "vogarstöng" is the physical lever (ÍÐ). The panel title "Levers" → "Stjórntæki" | PROP |
| setting (a lever kind) | stilling | | PROP |
| one-off (shock) | einskiptisaðgerð | Button "Apply now" → "Beita núna". Alternatives: "einskiptisbreyting", "skellur" (shock, ÍÐ-HAG) | PROP, ÍÐ-HAG |
| choice (a lever kind) | val | | PROP |
| stabilisers (the platform's global setting) | sveiflujafnarar | Collision warning: in Icelandic public finance, *sjálfvirkir sveiflujafnarar* are the automatic stabilisers of fiscal policy (FJR), which in this model work in both modes. "Sveiflujafnarar: Sjálfvirkt" would read as exactly that. Either keep "Sveiflujafnarar" and use the option names below, or rename the setting "Stefnuviðbrögð" (policy reactions), which is safer | FJR, PROP |
| Manual (stabiliser mode) | Handstýrt | "Handvirkt" also works, but pairs with "Sjálfvirkt"; see the collision above | PROP |
| Automatic (stabiliser mode) | Sjálfstýrt | Deliberately not "Sjálfvirkt" (see stabilisers) | PROP |
| stabiliser (one declared rule) | stefnuregla | "Central bank's inflation rule" → "verðbólguregla Seðlabankans"; "Debt rule on income tax" → "skuldaregla um tekjuskatt" | PROP |
| calling for action (a stabiliser) | kallar á aðgerð | Lever note: "Regla Seðlabankans: 8,25%", button "Beita" | PROP |
| Set by … (Automatic) | Ákvarðað af … | "Ákvarðað af verðbólgureglu Seðlabankans: 4,25%" | PROP |
| baseline | grunnferill | The model's baseline is a computed steady state, not a forecast, so not SÍ's *grunnspá* (baseline forecast, 73 uses in SÍ-PM 2024/4). "vs baseline" → "frá grunnferli" | PROP, SÍ-PM |
| steady state | jafnstaða | Alternatives: "jafnvægi", "stöðugt ástand" | ÍÐ-HAG |
| scenario | sviðsmynd | SÍ calls alternative scenarios *fráviksdæmi*. "Share scenario" → "Deila sviðsmynd" | ÍÐ-LíSA, SÍ-PM |
| counterfactual ("with / without this channel") | samanburðardæmi | "með og án þessarar miðlunarleiðar". ÍÐ-HAG has only the adjective *staðlaus* | PROP |
| channel (of transmission) | miðlunarleið | As in "miðlun peningastefnunnar" | SÍ-PM |
| flow map | flæðikort | | PROP |
| pipe (flow between two nodes) | leiðsla | Alternative: "rás" | PROP |
| leg (payer → payee part of a flow) | leggur (pl. leggir) | | PROP |
| ledger (the live Godley table) | höfuðbók | The table itself is a "færslufylki" (see §2). ÍÐ-HAG/ÍÐ-ENDUR: ledger = höfuðbók | ÍÐ-HAG, ÍÐ-ENDUR |
| inspector (panel) | rýnir | Alternative: "Nánar" | PROP |
| ideas at play | hugmyndir að verki | Alternative: "kenningar að verki" | PROP |
| idea, concept (card) | hugmynd; hugtak | The concept library → "hugtakasafn" | PROP |
| feed ("What is happening") | Hvað er að gerast | The feed as a thing: "atburðaskrá" | PROP |
| rule (the one equation for a variable) | regla | Use "jafna" when the formula itself is meant | PROP |
| term (additive part of a rule) | liður | | ÍÐ-STÆRÐFR |
| regime (active branch of a rule) | virkt skilyrði | e.g. "Hámark greiðslubyrðar bindur". Heading "Regimes" → "Virk skilyrði"; "normal" → "venjulegt" | PROP |
| non-additive | ekki samleggjanlegt | | PROP |
| IDENTITY (rule category) | SAMSEMD | ÍÐ-HAG and ÍÐ-Hagrannsóknir: identity = samsemd | ÍÐ-HAG |
| CONTRACT | SAMNINGUR | | PROP |
| BEHAVIOUR | HEGÐUN | | PROP |
| POLICY | STEFNA | Alternative: "HAGSTJÓRN" | PROP |
| parameter | stiki | Not "færibreyta" (mathematics) | ÍÐ-HAG, ÍÐ-Tölfræði |
| variable | breyta | | ÍÐ-HAG |
| indicator (chart series) | vísir | SÍ publishes *Hagvísar* (economic indicators) | ÍÐ-Hagrannsóknir, SÍ-GB |
| chart | graf | SÍ-GB uses "Línurit" for a line graph | SÍ-GB |
| dual-axis chart | graf með tveimur lóðásum | Left axis → "vinstri ás", right axis → "hægri ás", for the nominal-and-real charts the user asked for | PROP |
| time series | tímaröð | | ÍÐ-HAG, SÍ-GB |
| deviation from baseline | frávik frá grunnferli | | ÍÐ-HAG |
| change vs baseline | breyting frá grunnferli | | PROP |
| simulation | herming | | ÍÐ-HAG |
| model | líkan | | ÍÐ-HAG |
| data (provenance) | gögn | | PROP |
| calibrated | kvarðað | calibration = kvörðun | ÍÐ (several) |
| derived | afleitt | | PROP |
| assumed | forsenda | | PROP |
| placeholder | bráðabirgðagildi | | PROP |
| source | heimild | "Heimildir: Hagstofa Íslands, Seðlabanki Íslands" | SÍ-GB |
| reset | endurstilla | Tooltip: "Aftur á grunnferil" | SÍ-GB |
| share | deila | | SÍ-GB |
| play / pause / step one month | spila / gera hlé / einn mánuð áfram | | PROP |
| timeline | tímalína | | PROP |
| month / year | mánuður / ár | Clock: "Ár 1 · Mánuður 3". Short "M12": keep "M", which also stands for *mánuður* | PROP |
| books balance / out of balance | bókhaldið stemmir / bókhaldið stemmir ekki | | PROP |

## 2. Accounting and stock-flow consistency

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| balance sheet | efnahagsreikningur | SÍ-GB uses *efnahagsyfirlit* for statistical balance sheets | ÍÐ-HAG, ÍÐ-ENDUR |
| assets | eignir | | ÍÐ-HAG |
| liabilities | skuldir | ÍÐ-HAG also has *fjárhagsskuldbinding* | ÍÐ-ENDUR |
| net worth | hrein eign | For a firm or bank, "eigið fé" (ÍÐ-ENDUR). FJR tables use "Hrein eign" | FJR, ÍÐ-ENDUR |
| stock (quantity) | stöðustærð; staða | Alternatives: stofnstærð, stofn | ÍÐ-HAG |
| flow | flæði; flæðistærð | Alternative: straumstærð | ÍÐ-HAG |
| stock-flow consistency | samræmi stöðu og flæðis | Adjective: "stöðu- og flæðisamræmdur" | PROP (from ÍÐ-HAG) |
| double-entry bookkeeping | tvíhliða bókhald | | ÍÐ-HAG |
| transactions-flow matrix (Godley table) | færslufylki | "færslufylki (Godley-tafla)" on first use | PROP |
| accounting identity | bókhaldsjafna; samsemd | | ÍÐ-HAG |
| accrual basis / cash basis | rekstrargrunnur / greiðslugrunnur | | ÍÐ-HAG |
| accrual (a posting: no cash moves) | áfallið (lýsingarorð); áföllnun | "Mortgage indexation (accrued)" → "Verðbætur íbúðalána (áfallnar)" | PROP (from ÍÐ-HAG) |
| revaluation | endurmat | | ÍÐ-HAG, ÍÐ-ENDUR |
| write-off | niðurfærsla | "afskrift" also means depreciation (Hagstofa "Afskrift fjármunaeignar"), so use niðurfærsla for losses on claims | ÍÐ-HAG (afskrifa), PROP |
| payment (transfer posting) | greiðsla; tilfærsla | For transfer payments, ÍÐ-HAG gives tilfærsla / millifærsla | ÍÐ-HAG |
| purchase (of a real asset) | kaup | | PROP |
| issue (a new claim) | lánveiting; útgáfa | Loans: "lánveiting"; bonds: "útgáfa" | PROP |
| redeem, repayment | endurgreiðsla; afborgun | | ÍÐ-ENDUR, ÍÐ-HAG |
| trade (an existing claim) | viðskipti með kröfu | | PROP |
| claim | krafa | | PROP |
| current account (of the ledger: income and spending) | rekstrarliðir: tekjur og útgjöld | Not *viðskiptajöfnuður*, which is the balance-of-payments current account (§8) | PROP |
| capital account | fjármagnsreikningur | | PROP (SNA usage) |
| financial account | fjármálareikningur | Hagstofa: *Fjármálareikningar* | HAG |
| other changes in volume | aðrar breytingar | "Aðrar breytingar: áfallið, endurmat og niðurfærslur" | PROP |
| saving | sparnaður | "Vergur sparnaður", "Hreinn sparnaður" | ÍÐ-HAG, HAG-THJ06020 |
| net lending (+) / net borrowing (−) | hrein lánveiting / hrein lántaka | Hagstofa sums it as "Lánahreyfingar nettó" | HAG-THJ01202 |
| sectoral balances | fjárhagsjöfnuður geira | | PROP |
| property income | eignatekjur | | ÍÐ-HAG, HAG-THJ06029 |
| operating surplus | rekstrarafgangur | "Vergur rekstrarafgangur" | ÍÐ-HAG, HAG-THJ06020 |
| profit | hagnaður | | ÍÐ-ENDUR |
| dividends | arður; arðgreiðslur | "Dividends and owners' income" → "arður og tekjur eigenda" | ÍÐ-HAG, HAG-THJ06029 |
| retained earnings | óráðstafaður hagnaður | Balance-sheet item: "óráðstafað eigið fé" (ÍÐ-ENDUR) | ÍÐ-HAG |
| retention ratio | hlutfall hagnaðar sem haldið er eftir | Short: "eftirhaldshlutfall" | PROP |
| book value | bókfært verð | | ÍÐ-HAG, ÍÐ-ENDUR |
| company shares | hlutabréf | | ÍÐ-HAG, SÍ-GB |
| depreciation (of capital) | afskriftir | Hagstofa: "Afskrift fjármunaeignar" | HAG-THJ01102, ÍÐ-HAG |

## 3. Money, banks and the central bank

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| central bank | seðlabanki; Seðlabanki Íslands (SÍ) | | ÍÐ-HAG |
| key interest rate | stýrivextir | The brief's term, and the everyday word. SÍ's formal term is **meginvextir** (vextir á sjö daga bundnum innlánum): 17 uses in SÍ-PM 2024/4 and none of "stýrivextir". SÍ glosses the two together: "Meginvextir SÍ (stýrivextir)" (SÍ-GB) and "Hverjir eru meginvextir (stýrivextir)?" (SÍ-web). Recommended: lever label "Stýrivextir (meginvextir)", then "stýrivextir" in running text | SÍ-GB, SÍ-web, SÍ-PM |
| monetary policy | peningastefna | ÍÐ-HAG's older entry is *peningamálastefna* | SÍ-web |
| Monetary Policy Committee | peningastefnunefnd | | SÍ-web, SÍ-PM |
| policy rule (Taylor-type) | peningastefnuregla | "Taylor-regla" in the concept card | SÍ-PM |
| Taylor rule | Taylor-regla | | PROP (with SÍ-PM) |
| neutral real interest rate | hlutlausir raunvextir | | SÍ-PM |
| real interest rate | raunvextir | | ÍÐ-HAG, SÍ-PM |
| nominal interest rate | nafnvextir | | ÍÐ-HAG |
| monetary stance, tightness | peningalegt aðhald; taumhald | | SÍ-PM |
| monetary transmission | miðlun peningastefnunnar | | SÍ-PM |
| policy lags | tafir í miðlun | lag = töf, tímatöf | ÍÐ-HAG |
| zero lower bound | núllmörk vaxta | | PROP |
| reserves (banks' deposits at the central bank) | innstæður banka í Seðlabanka | Short label: "Seðlabankainnstæður". ÍÐ-HAG's "varasjóður banka" is dated. SÍ-GB speaks of "viðskiptareikningar" and "bindiskyldar innstæður" | SÍ-GB, PROP |
| reserve requirement | bindiskylda | | ÍÐ-HAG, SÍ-GB |
| foreign-exchange reserves | gjaldeyrisforði | SÍ-FS also says "gjaldeyrisvaraforði" | ÍÐ-HAG, SÍ-web |
| treasury | ríkissjóður | | ÍÐ-HAG, SÍ-GB |
| treasury account (at the central bank) | reikningur ríkissjóðs í Seðlabanka | | PROP |
| payment system | greiðslukerfi | SÍ's department is *Greiðslumiðlun* (payment services) | SÍ-web, PROP |
| broad money (M3) | peningamagn (M3) | SÍ-PM also says "vítt peningamagn". ÍÐ-HAG gives "peningamagn og sparifé" | SÍ-GB, SÍ-PM |
| money creation | peningamyndun | | PROP |
| endogenous money: loans create deposits | innræn peningamyndun: útlán skapa innlán | endogenous = innri, innrænn; exogenous = útrænn, ytri | ÍÐ-HAG, ÍÐ (other), PROP |
| money destruction: repayment destroys deposits | eyðing peninga: afborganir eyða innlánum | | PROP |
| deposits | innlán; innstæður | "Bank deposits" (the instrument) → "bankainnstæður" | SÍ-GB |
| deposit-taking banks | innlánsstofnanir | | SÍ-GB |
| deposit rate / lending rate | innlánsvextir / útlánsvextir | ÍÐ-ENDUR has útlánsvextir; innlánsvextir is its standard counterpart | ÍÐ-ENDUR, PROP |
| loans (a bank's) | útlán | Borrower's side: "lán" | SÍ-GB, ÍÐ-ENDUR |
| new credit | ný útlán | | SÍ-GB |
| business loans | útlán til fyrirtækja | | PROP |
| credit impulse | útlánahvati | No authoritative term found | PROP |
| bank capital | eigið fé banka | | ÍÐ-ENDUR |
| capital ratio | eiginfjárhlutfall | | PROP (standard supervisory usage; not checked here) |
| risk-weighted assets | áhættuvegnar eignir | Also "áhættugrunnur" | PROP |
| risk weight | áhættuvog | | PROP |
| capital premium on loans | eiginfjárálag á útlánavexti | | PROP |
| spread, margin | álag; vaxtaálag | Bank's net margin: "vaxtamunur" | ÍÐ-HAG |
| risk premium | áhættuþóknun | | ÍÐ-HAG |
| bond | skuldabréf | | ÍÐ-HAG |
| government bonds | ríkisskuldabréf | SÍ-GB uses "ríkisverðbréf" for bonds and bills together | ÍÐ-HAG, SÍ-GB |
| CPI-indexed government bonds | verðtryggð ríkisskuldabréf | | SÍ-GB |
| bank bonds (covered) | sértryggð skuldabréf banka | Short: "bankaskuldabréf" | PROP |
| yield | ávöxtunarkrafa | | SÍ-PM, SÍ-FS |
| open-market operations | markaðsaðgerðir | | SÍ-web |
| interest-rate differential with abroad | vaxtamunur gagnvart útlöndum | | SÍ-PM |
| carry trade | vaxtamunarviðskipti | | MEDIA (Landsbankinn), SÍ usage |
| state-owned bank | banki í eigu ríkisins | Landsbankinn | PROP |

## 4. Credit, mortgages, housing and financial stability

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| financial stability | fjármálastöðugleiki | | SÍ-web |
| Financial Stability Committee | fjármálastöðugleikanefnd | | SÍ-web |
| macroprudential policy | þjóðhagsvarúð | Also "þjóðhagsvarúðarstefna" | SÍ-web |
| borrower-based measures | lánþegaskilyrði | | SÍ-web |
| debt service | greiðslubyrði | | ÍÐ-HAG |
| debt-service-to-income cap | hámark greiðslubyrðar | The ratio itself: "greiðslubyrðarhlutfall" (MEDIA, lenders). Full legal name: "hámark greiðslubyrðar fasteignalána í hlutfalli við tekjur neytenda" | SÍ-R, SÍ-web |
| loan-to-value cap | hámark veðsetningarhlutfalls | | SÍ-web |
| loan-to-value ratio | veðsetningarhlutfall | | SÍ-web |
| first-time buyers | fyrstu kaupendur | SÍ-FS: "kaupendur fyrstu fasteignar" | SÍ-FS, SÍ-web |
| stress-test rate floor | lágmarksvextir (við útreikning greiðslubyrðar) | "Indexed floor applies" → "Lágmarksvextir verðtryggðra lána gilda" | SÍ-web |
| stress test (affordability test) | greiðslumat | For bank solvency: "álagspróf" | PROP |
| mortgage | íbúðalán | The rules use "fasteignalán"; both are in use, along with "húsnæðislán" (MEDIA) | SÍ-R, SÍ-FS |
| CPI-indexed | verðtryggður | Very frequent in SÍ-PM | SÍ-PM |
| non-indexed | óverðtryggður | 20 uses in SÍ-PM 2024/4 | SÍ-PM |
| indexation (the mechanism) | verðtrygging | | ÍÐ-ENDUR |
| indexation (the amount added) | verðbætur | | ÍÐ-ENDUR |
| index for indexation | vísitala til verðtryggingar | | HAG-VIS01004 |
| amortisation | afborgun | | ÍÐ-HAG |
| annuity loan | jafngreiðslulán | | ÍÐ-HAG |
| annuity factor | jafngreiðslustuðull | | PROP |
| loan term | lánstími | | SÍ-web |
| desired mortgage debt | æskileg íbúðaskuld | | PROP |
| lending appetite (banks') | útlánavilji banka | | PROP |
| house prices | íbúðaverð | Hagstofa's index: "Vísitala markaðsverðs íbúðarhúsnæðis" | SÍ-PM, HAG-VIS01106 |
| real house prices | raunverð íbúða | | SÍ-FS |
| homes (the real asset) | íbúðarhúsnæði; íbúðir | | HAG |
| housing cost (in the CPI) | húsnæðisliður VNV | | SÍ-PM |
| imputed rent | reiknuð húsaleiga | | SÍ-PM, ÍÐ-HAG |
| housing wealth effect | auðsáhrif húsnæðis | wealth effect = auðsáhrif | ÍÐ-HAG |
| home repairs | viðhald íbúðarhúsnæðis | | PROP |
| systemic risk | kerfisáhætta | | SÍ-FS |
| Minsky's financial instability hypothesis | tilgáta Minskys um óstöðugleika fjármálakerfisins | | PROP |

## 5. Prices, wages and jobs

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| inflation | verðbólga | | ÍÐ-HAG |
| inflation target | verðbólgumarkmið | "verðbólga í markmiði" | SÍ-GB, SÍ-PM |
| inflation expectations | verðbólguvæntingar | | SÍ-PM |
| anchored expectations | kjölfesta verðbólguvæntinga | Adjective: "kjölfestar væntingar" | SÍ-PM |
| adaptive expectations | aðlagaðar væntingar | ÍÐ also lists "aðlagaðar vændir" | ÍÐ-HAG |
| underlying inflation | undirliggjandi verðbólga | | SÍ-PM |
| 12-month inflation | tólf mánaða verðbólga | Chart unit: "12 mánaða breyting (%)" | SÍ-GB |
| consumer price index (CPI) | vísitala neysluverðs (VNV) | | ÍÐ-HAG, HAG-VIS01000, SÍ-GB |
| CPI excluding housing | vísitala neysluverðs án húsnæðis | | SÍ-GB |
| price level | verðlag | | ÍÐ-HAG, SÍ-GB |
| import prices | innflutningsverð | | ÍÐ-HAG, SÍ-PM |
| export prices | útflutningsverð | | ÍÐ-PISCES, SÍ-PM |
| world prices | heimsmarkaðsverð | "World fish prices" → "verð sjávarafurða erlendis"; "World aluminium price" → "álverð á heimsmarkaði" | PROP |
| markup | álagning | | ÍÐ-HAG |
| markup pricing | álagningarverðlagning | | PROP (from ÍÐ-HAG) |
| unit cost | einingarkostnaður | | ÍÐ-HAG |
| unit labour cost | launakostnaður á framleidda einingu | | SÍ-PM |
| cost pass-through | miðlun kostnaðar út í verðlag | | PROP (after SÍ-PM usage) |
| exchange-rate pass-through | gengisleki | | SÍ-GL |
| cost-push inflation | kostnaðarverðbólga | | ÍÐ-HAG |
| wage-price spiral | víxlgengi verðlags og launa | Also "launa- og verðlagsskrúfa" | ÍÐ-HAG |
| wages | laun | | ÍÐ-HAG |
| wage rate | launataxti | Also "kauptaxti" | ÍÐ-HAG |
| wage growth | launavöxtur; launahækkanir | | SÍ-PM |
| wage index | launavísitala | | HAG |
| wage bill | launagreiðslur; launakostnaður | "Launagreiðslur" in the national accounts (D.1) | HAG-THJ06029 |
| wage settlement (collective agreement) | kjarasamningur; launahækkun samkvæmt kjarasamningi | Lever: "Kjarasamningsbundin launahækkun" | ÍÐ-STJ, SÍ-PM |
| wage bargaining | kjarasamningsgerð | | PROP |
| wage Phillips curve | Phillips-ferill launa | | ÍÐ-HAG |
| sticky wages (downwards) | torbreytanleg laun (niður á við) | | ÍÐ-HAG |
| real wages | raunlaun; kaupmáttur launa | | ÍÐ-HAG, ÍÐ-STJ |
| purchasing power | kaupmáttur | | ÍÐ-HAG |
| profit squeeze | þrenging hagnaðar | | PROP |
| unemployment | atvinnuleysi | | ÍÐ-HAG, SÍ-PM |
| unemployment rate | atvinnuleysishlutfall | "atvinnuleysi (%)" is also common | ÍÐ-HAG |
| natural rate of unemployment | jafnvægisatvinnuleysi | ÍÐ-HAG: "náttúrlegt atvinnuleysi", "eðlislægt atvinnuleysi" | ÍÐ-HAG, PROP |
| employment | atvinna; fjöldi starfandi | | ÍÐ-HAG |
| jobs | störf | | SÍ-PM |
| hours worked | vinnustundir | "heildarvinnustundir" | ÍÐ-HAG, SÍ-PM |
| labour market | vinnumarkaður | Tight: "spenna á vinnumarkaði"; slack: "slaki" | ÍÐ-STJ, SÍ-PM |
| labour force | vinnuafl; mannafli | | ÍÐ-STJ |
| participation rate | atvinnuþátttaka | | ÍÐ-HAG |
| migration (buffer) | búferlaflutningar | "Migration buffer" → "búferlaflutningar sem höggdeyfir" | ÍÐ-STJ, HAG |
| Okun's law | lögmál Okuns | | PROP |
| productivity | framleiðni | | ÍÐ-HAG |
| payroll tax | tryggingagjald | Iceland's payroll tax is *tryggingagjald*. ÍÐ-HAG's generic "launaskattur" is not the Icelandic tax | FJR |
| pension contributions | iðgjöld (til lífeyrissjóða) | Employer's share: "mótframlag launagreiðanda" | ÍÐ-HAG, PROP |

## 6. Demand, output and firms

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| gross domestic product (GDP) | verg landsframleiðsla (VLF) | | HAG-THJ01102 |
| output (real GDP) | framleiðsla; VLF að raunvirði | | ÍÐ-HAG |
| potential output, capacity | framleiðslugeta | "% af framleiðslugetu" | ÍÐ-HAG, SÍ-PM |
| output gap | framleiðsluspenna (+) / slaki (−) | SÍ also says "framleiðsluslaki" | SÍ-PM |
| capacity utilisation | nýting afkastagetu | | ÍÐ-HAG |
| household consumption | einkaneysla | | HAG-THJ01102, ÍÐ-HAG |
| public consumption | samneysla | | HAG-THJ01102, ÍÐ-HAG |
| investment (national accounts) | fjármunamyndun | Everyday: "fjárfesting" (ÍÐ-HAG) | HAG-THJ01102, HAG-THJ03105 |
| business investment | atvinnuvegafjárfesting | | SÍ-PM |
| residential investment | íbúðafjárfesting | | SÍ-PM |
| public investment | fjárfesting hins opinbera | | ÍÐ-HAG, SÍ-PM |
| value added | vinnsluvirði | | ÍÐ-HAG, HAG-THJ08404 |
| inputs; intermediate consumption | aðföng; aðfanganotkun | | ÍÐ-HAG |
| disposable income | ráðstöfunartekjur | | ÍÐ-HAG, HAG-THJ06020 |
| real disposable income | kaupmáttur ráðstöfunartekna | Also "raunráðstöfunartekjur" | SÍ-PM, PROP |
| gross income | heildartekjur | | PROP |
| consumption function | neyslufall | | ÍÐ-HAG |
| marginal propensity to consume | jaðarneysluhneigð | | ÍÐ-HAG |
| multiplier | margfaldari | Also "margföldunaráhrif" | ÍÐ-HAG |
| investment accelerator | fjárfestingarhraðall | accelerator = hraðall | PROP |
| paradox of thrift | sparnaðarþverstæða | | ÍÐ-HAG |
| import leakage | innflutningsleki | leakage = leki | ÍÐ-HAG |
| habit persistence | vanafesta í neyslu | | PROP |
| aggregate demand | heildareftirspurn | | ÍÐ-HAG |
| demand / supply | eftirspurn / framboð | | ÍÐ-HAG |
| firms | fyrirtæki | | ÍÐ-ENDUR |
| non-financial corporations | fyrirtæki önnur en fjármálastofnanir | SÍ-GB: "atvinnufyrirtæki" | HAG-THJ06020, SÍ-GB |
| domestic firms | innlend fyrirtæki | Or "fyrirtæki á heimamarkaði" | PROP |
| exporters | útflutningsfyrirtæki | ÍÐ-HAG: exporter = útflytjandi | ÍÐ-HAG, PROP |
| fisheries | sjávarútvegur | Hagstofa subject heading | ÍÐ-PISCES, HAG |
| marine products | sjávarafurðir | | ÍÐ-PISCES, SÍ-PM |
| aquaculture | fiskeldi | SÍ-PM also has "landeldi" (land-based farming) | ÍÐ-STJ |
| fishing quota | aflamark | Everyday: "kvóti" | PROP |
| aluminium smelters | álver | | ÍÐ-SJÓMENN, SÍ-PM |
| alumina / anodes | súrál / rafskaut | | ÍÐ-Álorðasafnið |
| tourism | ferðaþjónusta | | ÍÐ-HAG, HAG, SÍ-PM |
| construction (firms) | byggingariðnaður; byggingarstarfsemi | | SÍ-FS |
| retail and services | verslun og þjónusta | | PROP |
| other exporters | önnur útflutningsfyrirtæki | Short: "annar útflutningur" | PROP |
| data centres | gagnaver | | SÍ-PM |
| machines and buildings (fixed capital) | fastafjármunir | Everyday: "vélar og byggingar". Machinery and equipment: "vélar, áhöld og tæki" | ÍÐ-HAG |
| foreign owners | erlendir eigendur | | PROP |
| net borrowing (firms) | hrein lántaka | | PROP |

## 7. Government and public finance

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| government (the player) | hið opinbera | The sector S.13. The treasury: "ríkissjóður" | HAG-THJ06020, SÍ-GB |
| central government / local government | ríkið / sveitarfélög | | ÍÐ-HAG, SÍ-GB |
| government debt | skuldir hins opinbera | Central government: "skuldir ríkissjóðs" | FJR, ÍÐ-HAG |
| debt ratio | skuldahlutfall | | ÍÐ-HAG |
| government balance | afkoma hins opinbera; heildarafkoma | Hagstofa: "Tekjuafgangur / -halli" | FJR, HAG-THJ05111 |
| primary balance | frumjöfnuður | | FJR, SÍ-PM |
| deficit | halli | "fjárlagahalli" (budget); "cash deficit" → "greiðsluhalli" | ÍÐ-HAG, PROP |
| surplus | afgangur | | HAG-THJ05111 |
| fiscal rule | fjármálaregla | | FJR |
| debt rule | skuldaregla | | FJR |
| Iceland's fiscal stability rule | stöðugleikaregla | The expenditure rule for the A1 part from 2026 | FJR |
| fiscal policy | stefna í ríkisfjármálum | The statutory plan is *fjármálastefna*, with *fjármálaáætlun* | ÍÐ-HAG, FJR |
| fiscal stance | aðhaldsstig ríkisfjármála | | SÍ-PM |
| automatic stabilisers (of fiscal policy) | sjálfvirkir sveiflujafnarar | See the collision warning in §1 | FJR |
| income tax | tekjuskattur | Personal: "tekjuskattur einstaklinga" | ÍÐ-HAG |
| corporate income tax | tekjuskattur lögaðila | | FJR, ÍÐ-ENDUR |
| VAT | virðisaukaskattur (VSK) | | ÍÐ-HAG |
| taxes on goods | vörugjöld; skattar á vörur | | ÍÐ-HAG |
| tax rate / effective tax rate | skatthlutfall / virkt skatthlutfall | | ÍÐ-HAG |
| tax revenue | skatttekjur | | ÍÐ-HAG |
| transfers | tilfærslur | Social: "félagslegar tilfærslur" | FJR, HAG-THJ05165 |
| old-age and disability transfers | ellilífeyrir og örorkulífeyrir | | FJR |
| family and housing benefits | barnabætur, fæðingarorlof og húsnæðisbætur | Lever: "Fjölskyldu- og húsnæðisstuðningur" | FJR |
| unemployment benefits | atvinnuleysisbætur | | FJR |
| replacement rate | bótahlutfall | "Hlutfall af meðallaunum" | PROP |
| public services | opinber þjónusta | | PROP |
| health | heilbrigðismál | Hagstofa: "Heilbrigðisútgjöld" | HAG |
| education | menntamál | Hagstofa: "Fræðsluútgjöld" | HAG |
| interest expenditure | vaxtagjöld | | FJR |
| central-bank profit to government | arðgreiðsla Seðlabankans til ríkissjóðs | | PROP |
| who buys government bonds | hverjir kaupa ríkisskuldabréf | | PROP |

## 8. The rest of the world

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| rest of the world (player) | útlönd | Hagstofa sector "Útlönd (S.2)". Alternative: "umheimurinn". Short label "Abroad" → "Útlönd" | HAG-THJ06029, ÍÐ-HAG |
| non-residents / residents | erlendir aðilar / innlendir aðilar | | SÍ-GB |
| exports / imports | útflutningur / innflutningur | "Útflutningur vöru og þjónustu" | HAG-THJ01102 |
| current account (balance of payments) | viðskiptajöfnuður | | HAG-THJ06029, SÍ-PM |
| balance on goods and services | vöru- og þjónustujöfnuður | | HAG-THJ06029 |
| balance of payments | greiðslujöfnuður | | ÍÐ-HAG |
| exchange rate | gengi (krónunnar) | | ÍÐ-HAG, SÍ-PM |
| króna appreciates / depreciates | gengi krónunnar hækkar / lækkar | The krona strengthening = gengi hækkar (SÍ usage). Indicator "Króna value (+ stronger)" → "Gengi krónunnar (+ = sterkari)" | ÍÐ-HAG, SÍ-PM |
| real exchange rate | raungengi | | ÍÐ-HAG, SÍ-GB |
| floating exchange rate | fljótandi gengi | | ÍÐ-HAG |
| purchasing power parity | jafnvirðisgengi | Also "kaupmáttarjöfnuður" | ÍÐ-HAG |
| terms of trade | viðskiptakjör | | ÍÐ-HAG, SÍ-PM |
| foreign demand | erlend eftirspurn | | PROP |
| foreign interest rate | erlendir vextir | | PROP |
| króna sentiment | tiltrú á krónunni | "Króna sentiment shock" → "tiltrúarskellur krónunnar" | PROP |
| foreign assets | erlendar eignir | | PROP |
| world economy | alþjóðahagkerfið | Lever section "World economy" → "Umheimurinn" | PROP |
| competitiveness | samkeppnishæfni | | ÍÐ-HAG |

## 9. Pensions

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| pension funds | lífeyrissjóðir | | ÍÐ-HAG, SÍ-GB |
| funded pensions | sjóðsöfnunarkerfi lífeyrisréttinda | ÍÐ-HAG: "söfnunarsjóður lífeyrissparnaðar" | ÍÐ-HAG, PROP |
| pension rights, entitlements | lífeyrisréttindi | | HAG-THJ06029 |
| pension payouts | lífeyrisgreiðslur | | ÍÐ-HAG |
| pensioners | lífeyrisþegar | Old-age pensioners: "ellilífeyrisþegar" | ÍÐ-STJ |
| retirement | starfslok | | ÍÐ-HAG |
| rate of return / real return | ávöxtun / raunávöxtun | | ÍÐ-HAG |
| returns credited to members | ávöxtun færð á réttindi sjóðfélaga | sjóðfélagi = fund member | PROP |
| foreign allocation | hlutfall erlendra eigna | | PROP |
| actuarial | tryggingafræðilegur | | ÍÐ-HAG |

## 10. People and distribution

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| households | heimili | Sector S.14 | ÍÐ-HAG, HAG-THJ06020 |
| young households (18–34) | ung heimili (18–34 ára) | Short: "Ungir 18–34" | PROP |
| working-age households (35–66) | heimili á vinnualdri (35–66 ára) | Short: "Vinnualdur 35–66" | PROP |
| older households (67+) | eldri heimili (67 ára og eldri) | Short: "Eldri 67+" | PROP |
| borrowers and savers | lántakendur og sparifjáreigendur | | PROP |
| flows between generations | flæði milli kynslóða | | PROP |
| income distribution | tekjuskipting | | ÍÐ-STJ |
| inequality | ójöfnuður | | ÍÐ-HAG |

## 11. Units and number formatting

| English | Icelandic | Notes and alternatives | Source |
|---|---|---|---|
| percent | prósent (%) | Written with no space: "5,3%" | SÍ-PM |
| percentage point (pp) | prósentustig | SÍ writes "prósentur" in running text (35 uses in SÍ-PM 2024/4 and none of "prósentustig"). ÍÐ-HAG and the media use "prósentustig". No standard abbreviation was found; propose "%-stig" in tight spaces | ÍÐ-HAG, MEDIA, SÍ-PM |
| % of GDP | % af VLF | | SÍ-PM |
| % of GDP a year | % af VLF á ári | | PROP |
| % vs baseline | % frá grunnferli | | PROP |
| pp vs baseline | prósentustig frá grunnferli | | PROP |
| pp of GDP | prósentustig af VLF | | PROP |
| index (1 = baseline) | vísitala (1 = grunnferill) | | ÍÐ-HAG |
| per year | á ári | | PROP |
| years | ár | | SÍ-GB |
| thousand persons | þúsund manns | | PROP |
| elasticity | teygni | | ÍÐ-HAG |
| ratio | hlutfall | As in skuldahlutfall (ÍÐ-HAG) | PROP |
| log points | lograstig | | PROP |
| billion ISK | ma.kr. | | SÍ-GB |
| at constant prices (real) | á föstu verðlagi; að raunvirði | Suffix "(real)" → "(að raunvirði)" | ÍÐ-HAG |
| at current prices (nominal) | á verðlagi hvers árs; að nafnvirði | For the nominal-and-real dual-axis charts | ÍÐ-HAG, ÍÐ-PISCES |
| decimal separator | komma (5,3) | RR §21.2.8 | RR |
| thousands separator | punktur (4.941) | RR §22.4: a full stop separates thousands, never in years. The brief proposed a thin space; that is the SI and ISO style, not Icelandic practice, and SÍ and Hagstofa use the full stop | RR |

Count: 347 entries in 11 sections. This is more than the 150–250 the brief asked for, because every term the interface shows is covered. The economics vocabulary is §2–§10 (271 entries); §1 covers the platform (57) and §11 the units (19).
