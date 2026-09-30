/**
 * The decision records and the places that summarise them agree: every record from 0004 on has
 * a row in the architecture's decisions table (§9), the table uses the padlock words, and króna
 * stage 1's release, decided by the owner on 30 September 2026 with item 4 open, reads the same in
 * every summary and in the name of the failing test that holds item 4.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

const doc = (path: string): string => readFileSync(new URL(`../docs/${path}`, import.meta.url), 'utf8');
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
