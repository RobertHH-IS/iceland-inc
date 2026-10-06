/** Visitor counts (docs/interface.md §9): which hosts load Vercel's counting script. */
import { describe, expect, test } from 'bun:test';
import { countsVisits } from '../../src/ui/analytics.ts';

describe('visitor counts', () => {
  test('the public site and its preview deployments count visits', () => {
    for (const host of ['iceland-inc.vercel.app', 'iceland-inc-git-main-nomi.vercel.app', 'ICELAND-INC.vercel.app', 'example.is']) expect(countsVisits(host)).toBe(true);
  });

  test('a development server and a file opened from disk do not', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'app.localhost', 'iceland.test', '']) expect(countsVisits(host)).toBe(false);
  });
});
