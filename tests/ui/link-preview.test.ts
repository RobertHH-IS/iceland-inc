/**
 * Link previews and search metadata (docs/interface.md §8): what LinkedIn, Facebook, Slack, X and
 * search engines read from the page without running it.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');
const html = readFileSync(join(root, 'src/ui/index.html'), 'utf8');
const meta = (key: string): string | undefined =>
  new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];
const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];

describe('link preview', () => {
  test('has every tag LinkedIn reads, with the same words as the page', () => {
    for (const key of ['og:title', 'og:description', 'og:image', 'og:url']) expect(meta(key)).toBeTruthy();
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
    expect(meta('og:title')).toBe(title);
    expect(meta('twitter:title')).toBe(title);
    expect(meta('og:description')).toBe(meta('description'));
    expect(meta('twitter:description')).toBe(meta('description'));
    expect(meta('twitter:card')).toBe('summary_large_image');
  });

  test('uses one full address for the page, and the image sits at the site root', () => {
    expect(canonical).toMatch(/^https:\/\/[^/]+\/$/);
    expect(meta('og:url')).toBe(canonical);
    const image = meta('og:image')!;
    expect(image.startsWith(canonical!)).toBe(true);
    expect(meta('twitter:image')).toBe(image);
    expect(existsSync(join(root, 'public', image.slice(canonical!.length)))).toBe(true);
  });

  test('the image is the size the tags say, and within LinkedIn’s limits', () => {
    const file = join(root, 'public', meta('og:image')!.slice(canonical!.length));
    const png = readFileSync(file);
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(String(width)).toBe(meta('og:image:width')!);
    expect(String(height)).toBe(meta('og:image:height')!);
    // LinkedIn: at least 1200 x 627, about 1.91 wide for 1 high, under 5 MB
    expect(width).toBeGreaterThanOrEqual(1200);
    expect(height).toBeGreaterThanOrEqual(627);
    expect(Math.abs(width / height - 1.91)).toBeLessThan(0.02);
    expect(statSync(file).size).toBeLessThan(5 * 1024 * 1024);
  });

  test('the build copies public/ to the site root, and robots.txt and the sitemap name the same address', () => {
    const build: string = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts.build;
    expect(build).toContain('cp -R public/. dist/');
    expect(readFileSync(join(root, 'public/robots.txt'), 'utf8')).toContain(`Sitemap: ${canonical}sitemap.xml`);
    expect(readFileSync(join(root, 'public/sitemap.xml'), 'utf8')).toContain(`<loc>${canonical}</loc>`);
    expect(existsSync(join(root, 'public/favicon.ico'))).toBe(true);
  });
});
