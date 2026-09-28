# Icelandic translation: architecture

Status: a proposal (September 2026). Nothing described here is implemented yet. Read with [inventory.md](inventory.md), which says what has to be translated and where it lives, and [glossary.md](glossary.md), which gives the terms.

## 0. The recommendation in brief

1. **Model definitions stay English and keyed by id.** There is no `Localized` type in `src/core/types.ts`. Icelandic lives in **locale catalogs keyed by entity id and field**: `rules.keyRate.what`, `levers.dstiCap.definition`, `feed.rateUp`. Catalogs are typed TypeScript modules under `src/i18n/`.
2. **Translation happens at the boundary, for display only.** A pure function `localizeInfo(info, catalog)` turns the English `ModelInfo` into an Icelandic one. The views keep reading `info.players[i].label` and mostly do not change. Ids, units, lever groups, sections and regime strings stay English inside the program, because code uses them as keys.
3. **The kernel hands out ids and numbers, not finished sentences**, wherever the interface shows text: feed items, regimes, posting descriptions and influence fallbacks. The contract changes are small and additive, and English behaviour does not change.
4. **The language is part of the URL** (`#…&l=is`), next to the scenario. A shared link opens in the sender's language, and a toggle in the header switches it.
5. **Numbers are formatted by locale:**
   - decimal comma (Ritreglur §21.2.8);
   - full stop between thousands (Ritreglur §22.4), with the thin space the brief mentioned available as an option;
   - typographic minus;
   - no space before %.
6. **Tests enforce completeness.** Missing, stale or placeholder-mismatched Icelandic fails `bun test`. The Icelandic UI messages are type-checked against the English ones, so `bun run typecheck` fails on a missing key. A pseudo-locale render catches any string that bypasses the catalogs.

## 1. What the design must respect

These facts come from reading the code (details in [inventory.md §2](inventory.md#2-ui-strings-srcui)):

- **Labels double as keys:**
  - lever sections use their title as their id (`leverSections`), and `GROUP_ORDER = ['Policy', 'Economy', 'World']` compares English group names (`src/ui/model/levers.ts`);
  - chart tabs use the indicator group string as their id (`chartTabs`, `src/ui/model/charts.ts`);
  - `PLAYER_CARDS` and `GROUP_NOUNS` fall back to a group's **label** (`src/ui/model/player-cards.ts`, `memberCount` in `hierarchy.ts`);
  - the reference model's group ids *are* English labels (`'Households'`);
  - regime badges compare regime strings with the baseline's;
  - the mortgage module's test compares a regime string.
- **Units are parsed.** `unitKind`, `fmtIndicator`, `shortUnit` and `fractionTail` (`src/ui/model/format.ts`) read the English unit string to decide how to format.
- **The kernel writes English:**
  - `describePosting` (which prints instrument **ids**);
  - the influence fallbacks for exogenous variables and indicators;
  - flow-leg labels `"A → B"`;
  - feed messages. Stabiliser feed numbers are formatted with a decimal point by `feedNumber` in `src/core/engine.ts`.

  `fillTemplate` formats parameters with a decimal point and fills only `explain.rule`. That is why `taxRate.explain.what` shows `{tau0%}` unfilled.
- **Rule families generate text from name tables** (`AGE_LABEL`, `FIRM_NAME`, `DEP_LABEL`, `WHO`). Icelandic needs those names in four grammatical cases.
- **Map geometry depends on label length** (`maxChars`, `tabWidth`, `labelWidth` in `FlowMap.tsx`; `src/ui/model/geometry.ts`).
- **`ModelInfo` must stay structured-cloneable**, so that a Web Worker engine remains possible (`docs/interface.md`).
- **The volume is uneven.** About 2,600 strings and 37,000 words, a third of it in concept bodies. The English bundle should not grow for users who never switch language.

## 2. Catalogs by id, or a `Localized` type in the definitions?

| | A. Catalogs keyed by entity id and field (recommended) | B. `type Text = string \| { en: string; is?: string }` in the definitions |
|---|---|---|
| Model authors | Write English as today; the model language does not change | Every label, description and explanation becomes an object; `types.ts` and every reader change |
| Rule families | The Icelandic family is written once in the catalog with a case table (§3.3), keyed by the generated ids | Icelandic grammar moves into model code, next to the equations |
| Review | Translation pull requests touch only `src/i18n/`; economists review equations, translators review words | Mixed diffs in the model files |
| Bundle | The Icelandic catalogs load only when Icelandic is chosen (dynamic `import()`) | Both languages always ship |
| Harness, tests, golden files | Unchanged (English) | Must choose a language everywhere a label is read |
| Completeness | A test walks the definitions and looks up every key | The type system can make `is` required, but only once every field is migrated |
| Risk | Keys can drift from definitions, handled by extraction, source hashes and the test (§6) | Low drift, high churn |

Option B's one advantage, co-location, is outweighed by the rule-family grammar and by the size of the change to the kernel's contract. **Choose A.** Keep one exception: `ConceptDef` could carry an optional `is` block later if concepts move to their own files, but the same catalog mechanism works for concepts too (§3.4).

## 3. Files and types

```
src/i18n/
  types.ts            Locale, NumberStyle, ModelCatalog, ConceptCatalog, Fmt
  format.ts           createFmt(locale): numbers, units, plurals, dates (§5)
  extract.ts          extractModel(def) → every translatable key with its English (shared by script and test)
  localize.ts         localizeInfo(info, catalog, fmt): ModelInfo (display copy)
  catalogs.ts         registry: which catalogs exist per locale and model, loaded lazily
  context.tsx         I18nProvider, useI18n(): { locale, t, fmt, cat }
  ui/en.ts            UI messages, English: the source of truth for keys
  ui/is.ts            UI messages, Icelandic: typed as UiMessages
  is/grammar.ts       case tables for names used in rule families
  is/iceland.ts       ModelCatalog for the Iceland model
  is/reference.ts     ModelCatalog for the reference model
  is/concepts.ts      ConceptCatalog (the largest file; its own chunk)
  is/units.ts         display text for unit strings
  source/*.json       generated: every key, its English and a hash (committed)
  is/*.lock.json      generated: the hash of the English each Icelandic entry was translated from
scripts/i18n.ts       extract | missing <locale> | lock <locale>
tests/i18n.test.ts    completeness, placeholders, staleness, pseudo-locale leak (§6)
```

### 3.1 UI messages

The English file defines the keys; the Icelandic file must match it exactly, so `tsc` enforces completeness for the 251 UI keys ([inventory Appendix A](inventory.md#appendix-a-ui-message-keys)):

```ts
// src/i18n/types.ts
export type Locale = 'en' | 'is';
export interface Fmt {
  locale: Locale;
  num(v: number, digits?: number): string; // "3,25"
  signed(v: number, digits?: number): string; // "+0,25", "−1,3"
  value(v: number, unit: string, digits?: number): string; // unit is the English unit id
  change(d: number, unit: string, base?: number): string;
  unit(unit: string): string; // display text: "% of GDP/yr" → "% af VLF á ári"
  plural(n: number, forms: { one: string; other: string }): string; // Intl.PluralRules
  date(d: Date): string; // "28. september 2026"
}

// src/i18n/ui/en.ts
import type { Fmt } from '../types.ts';
export const en = {
  'levers.title': 'Levers',
  'levers.changed': (p: { n: number }) => `${p.n} changed`,
  'levers.setBy': (p: { rule: string; value: string }) => `Set by ${p.rule}: ${p.value}`,
  'header.speed': (p: { n: number }, f: Fmt) => `${p.n} ${f.plural(p.n, { one: 'month', other: 'months' })} per tick`,
  'inspector.balanceSheetGroup': 'Balance sheet of all its players',
  // … 251 keys
} as const;
export type UiKey = keyof typeof en;
export type UiMessages = { [K in UiKey]: (typeof en)[K] extends string ? string : (typeof en)[K] };

// src/i18n/ui/is.ts
import type { UiMessages } from './en.ts';
export const is: UiMessages = {
  'levers.title': 'Stjórntæki',
  'levers.changed': ({ n }) => `${n} breytt`,
  'levers.setBy': ({ rule, value }) => `Ákvarðað af ${rule}: ${value}`,
  'header.speed': ({ n }, f) => `${n} ${f.plural(n, { one: 'mánuður', other: 'mánuðir' })} í hverju skrefi`,
  'inspector.balanceSheetGroup': 'Samanlagður efnahagsreikningur aðila',
  // …
};
```

Three rules make messages safe for Icelandic grammar:

- **whole sentences** with named parameters, never fragments joined in the view (today `'Balance sheet' + ' of all its players'`);
- **plurals through `f.plural`**, because Icelandic singular covers 1, 21, 31 and 101 but not 11;
- **names passed in the case the sentence needs.** For a name inside a UI sentence, the message receives the nominative and is phrased so that the nominative fits: "Aðili: Ung heimili", not "…ungra heimila".

`t(key, params)` looks the key up in the current locale and falls back to English. The functions stay on the main thread, so `ModelInfo` remains cloneable.

### 3.2 Model catalogs

```ts
// src/i18n/types.ts
import type { Id } from '../core/types.ts';
type T = string;
export interface ModelCatalog {
  model?: { label?: T; description?: T };
  players?: Record<Id, { label?: T; short?: T; description?: T }>;
  groups?: Record<Id, { label?: T; description?: T }>;
  instruments?: Record<Id, { label?: T; description?: T }>;
  vars?: Record<Id, { label?: T; description?: T }>;
  params?: Record<Id, { description?: T; note?: T }>; // provenance.source is a citation: not translated
  rules?: Record<Id, { label?: T; what?: T; rule?: T; terms?: Record<Id, T>; regimes?: Record<string, T> }>;
  flows?: Record<Id, { label?: T; what?: T }>;
  levers?: Record<Id, { label?: T; description?: T; definition?: T; options?: Record<number, T> }>;
  stabilisers?: Record<Id, { label?: T; description?: T; raise?: T; lower?: T }>;
  indicators?: Record<Id, { label?: T; description?: T }>;
  feed?: Record<Id, T>;
  /** Display names for strings the model uses as ids. Keyed by the English string. */
  leverGroups?: Record<string, T>; // 'Policy' → 'Hagstjórn'
  sections?: Record<string, T>; // 'Central bank' → 'Seðlabanki'
  chartGroups?: Record<string, T>; // 'Money and credit' → 'Peningar og útlán'
  /** Card metric labels and group nouns (src/ui/model/player-cards.ts), by node id. */
  cards?: Record<Id, T[]>;
  groupNouns?: Record<Id, [one: T, many: T]>;
}
export interface ConceptCatalog {
  concepts: Record<Id, { title: T; oneLiner: T; body: T }>;
  themes?: Record<string, T>;
}
```

- **Keys** are the definition's own ids. Instance ids from families (`loanInterestXT`, `mortgageLendingY`) are keys too, so the completeness test sees every one of the 2,647 instances.
- **Regimes** are keyed by their English text under their rule: `rules.mortgageLendingY.regimes['Debt-service cap binds']`. The English stays the value the program compares, and only display is translated.
- **Units** (`src/i18n/is/units.ts`) are keyed by the English unit string: `{'% of GDP/yr': '% af VLF á ári', 'pp vs baseline': 'prósentustig frá grunnferli', 'fraction of deposits': 'af innlánum', …}`. The formatter still decides *how* to format from the English unit (§5).

### 3.3 Rule families and grammar

`src/i18n/is/grammar.ts` holds case tables for every name that families interpolate, and the catalog generates the family entries with the same loops as the module:

```ts
// src/i18n/is/grammar.ts
type Cases = { nf: string; þf: string; þgf: string; ef: string };
export const AGE: Record<'Y' | 'W' | 'O', Cases & { short: string }> = {
  Y: { nf: 'ung heimili', þf: 'ung heimili', þgf: 'ungum heimilum', ef: 'ungra heimila', short: 'ungir (18–34 ára)' },
  W: { nf: 'heimili á vinnualdri', þf: 'heimili á vinnualdri', þgf: 'heimilum á vinnualdri', ef: 'heimila á vinnualdri', short: 'vinnualdur (35–66 ára)' },
  O: { nf: 'eldri heimili', þf: 'eldri heimili', þgf: 'eldri heimilum', ef: 'eldri heimila', short: 'eldri (67 ára og eldri)' },
};
export const FIRM: Record<'FC' | 'FR' | 'XF' | 'XA' | 'XT' | 'XO', Cases> = {
  FC: { nf: 'byggingarfyrirtæki', þf: 'byggingarfyrirtæki', þgf: 'byggingarfyrirtækjum', ef: 'byggingarfyrirtækja' },
  XA: { nf: 'álver', þf: 'álver', þgf: 'álverum', ef: 'álvera' },
  // …
};

// src/i18n/is/iceland.ts (excerpt)
import { FIRMS } from '../../models/iceland/util.ts';
import { FIRM } from './grammar.ts';
export const iceland: ModelCatalog = {
  vars: {
    ...Object.fromEntries(FIRMS.map((j) => [`loanInterest${j}`, { label: `Vextir af útlánum til ${FIRM[j].ef}` }])),
    // …
  },
};
```

This keeps the translator's work near the number of *unique* English strings (2,073, not 2,647), and the Icelandic grammar in one place. Importing id lists such as `FIRMS` from the model is fine. Importing English *labels* is not: the catalog must not depend on English wording.

### 3.4 Concepts

`src/i18n/is/concepts.ts` has 59 entries of title, one-liner and body (markdown, 12,742 English words). It loads as its own chunk with `import()` the first time a concept card or the ideas panel needs it. `scripts/concepts-index.ts` gains a `--locale is` flag that writes `docs/concepts.is.md`. The English limits in `tests/concepts.test.ts` (≤ 25-word one-liners, 80–250-word bodies) also apply to the Icelandic text, which is usually shorter.

### 3.5 Where the translation is applied

```ts
// src/i18n/localize.ts
export function localizeInfo(info: ModelInfo, cat: ModelCatalog, concepts: ConceptCatalog | undefined, fmt: Fmt): ModelInfo;
```

- It returns a copy in which every `label`, `short`, `description`, `explain.what`, lever `definition`, option label, indicator description, feed message, stabiliser text, concept title, one-liner and body is Icelandic where the catalog has it and English otherwise.
- It **never overwrites ids, `unit`, `LeverInfo.group`, `LeverInfo.section` or `IndicatorInfo.group`**. Instead it adds display fields: `LeverInfo.sectionLabel`, `LeverInfo.groupLabel`, `IndicatorInfo.groupLabel`, `unitLabel` on variables, parameters, levers and indicators, and `RuleInfo.rule` holds the unfilled Icelandic `explain.rule` template.
- `App.tsx` builds it once per model and locale with `useMemo`, and the views receive the localized `info`. Because the geometry reads `info`, the map is laid out from Icelandic labels, and every player needs an Icelandic `short` for tight cards.

Changes needed in the views and view-models:

| Where | Change |
|---|---|
| `levers.ts` `leverSections` | `id` stays the English section; `title = l.sectionLabel ?? id`. `GROUP_ORDER` keeps comparing `l.group` (English) |
| `charts.ts` `chartTabs` | `id` stays the English group; `label = ind.groupLabel ?? id` |
| `player-cards.ts` `resolveCardMetrics`, `hierarchy.ts` `memberCount` | Look up by id only; for the reference model, whose group ids are English labels, that still works. Labels come from `cat.cards` and `cat.groupNouns` |
| `format.ts` (UI) | Functions take a `Fmt` (or become methods of it); English defaults keep the current tests passing |
| All views | Literals become `t('…')`; `CATEGORY_HELP`, `BASIS_LABEL` and the label table in `src/ui/labels.ts` (categories, schools, flow kinds, `flowKindPhrase`, accounts, `accountSection`, selection kinds) become message keys |
| `Inspector.tsx` `InfluenceView` | Rule text comes from `info.ruleByTarget` (localized), filled with `fillTemplate(text, id => the value in inf.params, fmt)`; term labels come from `info.termByKey`; regimes from `cat.rules[id].regimes[english] ?? english` |
| `Inspector.tsx` `BsRow` | Instrument labels come from `info.instrumentById`, not from `client.balanceSheet()` |
| `Feed.tsx` | Renders `cat.feed[item.rule]`, or the stabiliser's `raise`/`lower` template filled with `fmt.num(item.value)`, falling back to `item.message` |
| `index.html`, `main.tsx` | Set `document.documentElement.lang` and `document.title` from the locale; the boot text is replaced as soon as React mounts |

## 4. Kernel and model changes (additive; English output unchanged)

| # | Where | Change | Why |
|---|---|---|---|
| K1 | `types.ts` `Engine.feed()` entries and `src/ui/engine-client.ts` `FeedItem` | Add `rule?: Id` (the `FeedRule` id), and for stabiliser messages `dir?: 1 \| -1`, `value?: number`, `change?: number`. Keep `message` | The interface can render the message in any language, with locale numbers. Today the English sentence and its decimal point are baked in by `feedNumber` |
| K2 | `types.ts` `RuleDef` | Add `regimes?: string[]`: every string `regime()` can return | Regime strings become enumerable for extraction and translation. A test (§6) runs the golden scenarios and checks that every regime returned is declared |
| K3 | `core/format.ts` `fillTemplate` | **Done.** An optional formatter argument `(value, suffix) => string`; the default, `englishTemplateFormat`, is today's English behaviour. `influenceOf` fills `explain.what` as well as `explain.rule`, so `{tau0%}` in `taxRate.explain.what` is filled | The interface fills Icelandic templates with Icelandic numbers, and the `{tau0%}` bug is fixed in both languages |
| K4 | `core/influence.ts` | **Done in the kernel.** `Influence.params` lists every parameter a placeholder names, with its effective value after levers, as well as the rule's own, so `{kapT}` in `capitalRatio` and `{muX}` in `importsExporters` fill from it. An engine-client `paramValue(id)` is now optional | The interface fills templates from `Influence.params` alone. The compiler warns about a placeholder that names no parameter |
| K5 | `core/format.ts` `describePosting` | **Done.** It takes a label lookup for instruments and real assets; `postingLabels(instruments)` builds one from (localized) instrument labels. The interface can still render from `posting.type` with message keys `posting.*` instead | It prints instrument ids today, in English too |
| K6 | `core/influence.ts` | **Done.** `Influence.rule.source` is `'rule' \| 'flow' \| 'indicator' \| 'exogenous'`, and `Influence.rule.levers` lists the lever ids of an exogenous variable | The interface can show the right message ("Set from outside the model by …") in the locale |
| K7 | `CHECKS` | No change: the interface translates by check id (`check.flow-balance`, …) | |

None of these changes the harness, the golden scenarios or any number.

## 5. Language toggle and number formatting

### 5.1 The URL

- Add `locale?: Locale` to `HashState` in `src/ui/model/scenario-url.ts` under the key `l`, for example `#m=iceland&t=36&e=0:keyRateAddon:1&x=firms&l=is`. The decoder already ignores unknown keys, so old links keep working, and older builds ignore `l`.
- Resolution order at start-up:
  1. `l` in the hash;
  2. the last choice kept in `localStorage`, read and written in `try/catch` as a per-viewer convenience only;
  3. `navigator.language` starting with `is`;
  4. English.
- The toggle in `Header.tsx` is a two-button segmented control, **Íslenska | English**, each button marked with its own `lang`. Switching calls `history.replaceState` with the current hash plus `l`, so the scenario, the clock and the open groups are untouched. The engine is not touched at all. `App.switchModel` currently replaces the hash with `#m=<id>`; it must keep `l`. "Share scenario" writes `l`, so a shared link opens in the sender's language.

### 5.2 Numbers, units and dates

```ts
// src/i18n/format.ts
export interface NumberStyle { decimal: string; group: string; groupFrom: number; minus: string; percentSpace: string }
export const STYLE: Record<Locale, NumberStyle> = {
  en: { decimal: '.', group: ',', groupFrom: 5, minus: '−', percentSpace: '' },
  is: { decimal: ',', group: '.', groupFrom: 4, minus: '−', percentSpace: '' }, // Ritreglur §21.2.8, §22.4
};
```

- **Format by hand from `toFixed`, not with `Intl.NumberFormat`.** The output is then identical in Bun, Chrome, Safari and Firefox, so tests are exact. `Intl.NumberFormat('is-IS')` prints `4.941,21` and a hyphen-minus, which would need post-processing anyway. Use `Intl.PluralRules('is')` for plurals and `Intl.DateTimeFormat('is-IS')` for dates ("28. september 2026").
- **Thousands separator.** Icelandic orthography puts a full stop between thousands, never inside years (Ritreglur §22.4). The Central Bank and Statistics Iceland do the same (`2.909,2 ma.kr.`). The brief proposed a thin space: that is the SI and ISO style. It is available as `group: ' '` (a narrow no-break space, which does not wrap), but I recommend the full stop. Years, months and model ids are never grouped. Most model numbers are percentages of GDP under 1,000, so grouping rarely shows.

Examples:

| English | Icelandic |
|---|---|
| `3.25%` | `3,25%` |
| `+0.25 pp` | `+0,25 prósentustig` (compact: `+0,25 %-stig`) |
| `−1.3% of GDP/yr` | `−1,3% af VLF á ári` |
| `12,345.6` | `12.345,6` |
| `1.042` (index) | `1,042` |
| `Year 2 · Month 3` | `Ár 2 · Mánuður 3` |
| `5 months`, `2 yr 3 mo` | `5 mánuðir`, `2 ár og 3 mán.` |
| `21 months` | `21 mánuður` |
| `1.2e−12` (accounting badge) | `1,2e−12` |

Functions that must go through `Fmt`:
- `fmtNum`, `fmtSigned`, `fmtValue`, `fmtChange`, `fmtCompact`, `fmtCompactChange`, `unitCaption`, `fmtIndicator`, `shortUnit`, `fmtClock`, `fmtMonths` and `fmtResidual` (`src/ui/model/format.ts`);
- `leverValueLabel` (`levers.ts`), which uses `Number.toString`;
- `fillTemplate` (K3) and the stabiliser feed (K1).

The formatter still classifies by the **English** unit (`unitKind('fraction of deposits')`) and prints `fmt.unit(unit)` for the words. There is no numeric input in the interface, only steppers, so no Icelandic numbers ever need parsing.

## 6. Tests

`tests/i18n.test.ts`, using `extractModel` from `src/i18n/extract.ts`: the same walk as the inventory, which returns `{ key, en, kind }[]` for every translatable field of a model definition, rule families included.

```ts
import { describe, expect, test } from 'bun:test';
import { models, conceptLibrary } from '../src/models/index.ts';
import { extractModel, extractConcepts, lookup, placeholders, sourceHash } from '../src/i18n/extract.ts';
import { MODEL_CATALOGS, CONCEPT_CATALOGS, LOCKS } from '../src/i18n/catalogs.ts';
import { en } from '../src/i18n/ui/en.ts';
import { is } from '../src/i18n/ui/is.ts';

describe('Icelandic', () => {
  for (const m of models) {
    test(`${m.id}: every translatable string has Icelandic`, async () => {
      const cat = await MODEL_CATALOGS.is[m.id]();
      const missing = extractModel(m).filter((e) => !lookup(cat, e.key)?.trim()).map((e) => e.key);
      expect(missing).toEqual([]); // prints every missing key, e.g. "rules.taxRate.what"
    });
    test(`${m.id}: placeholders match the English`, async () => {
      const cat = await MODEL_CATALOGS.is[m.id]();
      const bad = extractModel(m).filter((e) => {
        const t = lookup(cat, e.key);
        return t && placeholders(t).join() !== placeholders(e.en).join(); // {tau0%}, {value}, {change}
      });
      expect(bad.map((e) => e.key)).toEqual([]);
    });
    test(`${m.id}: no translation is stale`, () => {
      const lock = LOCKS.is[m.id]; // key → hash of the English it was translated from
      const stale = extractModel(m).filter((e) => lock[e.key] && lock[e.key] !== sourceHash(e.en));
      expect(stale.map((e) => e.key)).toEqual([]);
    });
  }
  test('UI: every message is translated and differs from English where it should', () => {
    const same = Object.keys(en).filter((k) => typeof en[k] === 'string' && en[k] === is[k] && !ALLOWED_SAME.has(k));
    expect(same).toEqual([]); // ALLOWED_SAME: 'ledger.balanced' ("0 ✓"), 'clock.monthShort', …
  });
  test('concepts: title, one-liner and body in Icelandic, within the length limits', async () => { /* … */ });
  test('regimes: every string a rule returns is declared and translated', () => { /* run golden scenarios, collect engine regimes */ });
});
```

Beyond completeness:

- **Staleness.** `bun scripts/i18n.ts lock is` records the hash of the English each entry was translated from, after review. When the English changes, for example because the parallel recalibration rewrites "about 13% of GDP", the test names the Icelandic entries to revisit.
- **Pseudo-locale leak test.** The test builds a locale `xx` in which every catalog string (UI, model and concept) is wrapped as `⟦…⟧`. It then renders `<App locale="xx" />` with `react-dom/server` for every registered model, reusing the harness of `tests/ui/view-model.test.ts`:
  - with groups closed and fully expanded;
  - in both stabiliser modes;
  - with the inspector on a pipe, a player, a group, a variable, a flow, an indicator and a concept.

  It collects text nodes and `aria-label`, `title` and `aria-valuetext` attributes, removes the `⟦…⟧` spans, numbers, unit symbols and ids, and fails on any remaining run of three or more letters. This catches a hard-coded string that a developer adds to a view without a message key, which neither the type checker nor the model walk can see.
- **Terminology lint (warning only).** For glossary pairs whose English term appears in the source string, check that the preferred Icelandic stem appears in the translation (for example "key interest rate" should give "stýrivext").

## 7. Keeping new modules translatable

Add these rules to `AGENTS.md` and `docs/authoring.md` when the plumbing lands:

1. **Write definitions in English, as now.** Icelandic goes in `src/i18n/is/*.ts`, in the same pull request or a follow-up before release.
2. **Never use a label as a key, and never parse a label.** Give sections, groups and chart tabs stable English ids. Look nodes up by id.
3. **Declare `regimes`** on every rule that has a `regime`.
4. **Put data in placeholders, not prose.** A number that comes from data goes in a `{param}` placeholder, so that recalibration does not make translations stale.
5. **Write interface text as whole-sentence messages** with named parameters and `plural()`. Do not join fragments in a view.
6. **Families.** When a module adds a rule family, add its Icelandic family function and any new names to `src/i18n/is/grammar.ts`.
7. **Run `bun scripts/i18n.ts missing is`**, which prints the keys a change introduced as a ready-to-paste TypeScript skeleton, with the English beside each key.

Rollout, so that the Icelandic interface is useful early:

| Phase | Scope | Strings | Words |
|---|---|---:|---:|
| 1 | Plumbing (§3.5, K1–K6, the `l` key, the toggle hidden behind `?l=is`), no translation | — | — |
| 2 | UI messages, card labels, and the Iceland model's names: players, groups, instruments, levers (label, options), stabilisers, indicators (label), sections, chart tabs, units, feed, regimes | ≈ 530 | ≈ 2,450 |
| 3 | Iceland variables, rules, terms, flows, lever definitions, indicator and parameter descriptions and notes | ≈ 1,880 | ≈ 21,850 |
| 4 | Concept library | 177 | 12,742 |
| 5 | Reference model | 372 | ≈ 3,700 |

During the rollout the completeness test is strict for the scopes listed in `src/i18n/is/required.ts`, and the toggle is public from phase 3. The list grows each phase and ends as "every registered model and the concept library". From then on, any new user-facing string without Icelandic fails `bun test`.

## 8. How this meets the other work in progress

- **Recalibration to current Statistics Iceland values.** It changes English prose that contains numbers: 310 Iceland texts, and "Calibrated to 2025 data" in the model description. Prefer placeholders (rule 4). The staleness test flags whatever still changes.
- **Dual-axis charts showing nominal and real change.** The new axis and legend texts need message keys, for example `chart.axisNominal` "nafnvirði (vinstri ás)" and `chart.axisReal` "raunvirði (hægri ás)". Both axes must format through `Fmt`. If the indicator definition gains a second unit, keep it an English unit id, translated through `units`.
