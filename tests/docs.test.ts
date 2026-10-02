/**
 * The decision records and the places that summarise them agree: every record from 0004 on has
 * a row in the architecture's decisions table (§9), the table uses the padlock words, and króna
 * stage 1's release, decided by the owner on 30 September 2026 with item 4 open, reads the same in
 * every summary and in the name of the failing test that holds item 4. And the texts people work
 * from describe a locked lever as the interface shows it: where the user set it, with nothing to
 * approve.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

const file = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const doc = (path: string): string => file(`docs/${path}`);
const section = (text: string, from: string, to: string): string => {
  const start = text.indexOf(from);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = text.indexOf(to, start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
};

describe('decision records', () => {
  const table = section(doc('architecture.md'), '## 9. Decisions', '## 10.');

  // 0001–0003 came before the table kept one row per record (the kernel contract, the port and
  // the firm split are described in the architecture's own sections), so the check starts at 0004.
  const records = readdirSync(new URL('../docs/decisions/', import.meta.url))
    .filter((f) => /^\d{4}-.*\.md$/.test(f) && Number(f.slice(0, 4)) >= 4)
    .sort();

  test('there are records from 0004 on to check', () => {
    expect(records.length).toBeGreaterThanOrEqual(14);
  });
  for (const f of records) {
    test(`${f} has a row in the architecture's decisions table`, () => {
      expect(table).toContain(`(decisions/${f})`);
    });
  }

  test("króna stage 1 is released with item 4 open, by the owner's decision, in every summary", () => {
    const released = "released with item 4 open, by the owner's decision of 30 September 2026";
    const status = doc('decisions/0013-krona-stage-1.md').split('\n').find((l) => l.startsWith('Status:')) ?? '';
    expect(status.toLowerCase()).toContain(released.toLowerCase());
    const row19 = table.split('\n').find((l) => l.startsWith('| 19 |')) ?? '';
    expect(row19.toLowerCase()).toContain(released.toLowerCase());
    const anchors = section(doc('design/long-run-anchors.md'), 'Status:', '\n---\n');
    expect(anchors).toContain('Released with item 4 open');
    const item4 = section(doc('audit/lever-vetting.md'), '## Open items', '\n## ').split('\n').find((l) => l.startsWith('4. ')) ?? '';
    expect(item4).toContain("released with it open, by the owner's decision of 30 September 2026");
    for (const text of [status, row19, anchors, item4]) expect(text.toLowerCase()).not.toContain('not releasable');
    // The failing test that holds item 4 is a phase-5 criterion, not a release criterion.
    const krona = readFileSync(new URL('./models/iceland-krona.test.ts', import.meta.url), 'utf8');
    expect(krona).toContain("test.failing('PHASE 5 CRITERION, not met (item 4, released open by decision 0013)");
    expect(krona).not.toContain('RELEASE CRITERION');
  });

  test('the decisions table uses the padlock words: Manual and Automatic only where row 16 names what padlocks replaced', () => {
    for (const row of table.split('\n').filter((l) => /^\| \d+ \|/.test(l) && !l.startsWith('| 16 |'))) expect(row).not.toMatch(/\b(Manual|Automatic)\b/);
  });

  test("the long-run anchors' status table names the owner's decisions 0016 and 0017", () => {
    const anchors = section(doc('design/long-run-anchors.md'), 'Status:', '\n---\n');
    expect(anchors).toContain('(../decisions/0016-interest-income.md)');
    expect(anchors).toContain('(../decisions/0017-levers-shown.md)');
  });
});

describe('a locked lever, in the texts people work from', () => {
  // The owner, 2 October 2026: a lever the user sets is locked there and everything else reacts;
  // the interface suggests nothing and asks for no approval. The decision records and design
  // notes keep their history; these are the texts that say how things are now.
  const TEXTS = ['AGENTS.md', 'README.md', 'docs/architecture.md', 'docs/authoring.md', 'docs/interface.md', 'src/core/types.ts'];

  test('none says a locked lever’s rule "only suggests", or that the panel shows a suggestion', () => {
    const stale = /only suggests?\b|suggests while it is locked|shows the rule[’']s suggestion/;
    const lines = TEXTS.flatMap((path) => file(path).split('\n').filter((l) => stale.test(l)).map((l) => `${path}: ${l.trim().slice(0, 100)}`));
    expect(lines).toEqual([]);
  });

  test('model rule 11 and the padlock’s own comment say it stays where the user set it and everything else reacts', () => {
    const rule11 = file('AGENTS.md').split('\n').find((l) => l.startsWith('11. ')) ?? '';
    expect(rule11).toContain('locked, the lever stays where the user set it and everything else reacts');
    expect(file('src/core/types.ts')).toContain('/** The padlock is closed: the lever stays where the user set it, and everything else reacts. */');
  });
});
