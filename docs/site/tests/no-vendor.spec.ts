import { expect, test } from '@playwright/test';
import { VENDOR_PATTERN } from '../../../tooling/checks/planning-tokens.mjs';

// The website never names another component vendor. `site:check` scans every text file of
// the static export; this spec covers the served routes in every SITE_MODE:
// HTML pages, every Markdown page linked from llms.txt, llms-full.txt, the
// sitemap, the search manifest and shards, and api.json.

const VENDOR = new RegExp(VENDOR_PATTERN.source, 'i');
const SITE_URL = (process.env.SITE_URL?.trim() || 'https://salmonui.dev').replace(/\/+$/, '');
const sitePath = (url: string) => (url.startsWith(SITE_URL) ? url.slice(SITE_URL.length) || '/' : url);

/** The first vendor hit of `text` with 40 characters of context, or undefined. */
function vendorHit(text: string): string | undefined {
  const match = VENDOR.exec(text);
  if (!match) return undefined;
  return text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40).replace(/\s+/g, ' ');
}

test('no served page, Markdown file, index or search shard names another vendor', async ({ request }) => {
  test.setTimeout(180_000);
  const hits: string[] = [];
  const check = async (path: string): Promise<string> => {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const text = await response.text();
    const hit = vendorHit(text);
    if (hit) hits.push(`${path}: …${hit}…`);
    return text;
  };

  for (const path of ['/', '/docs', '/docs/data-grid', '/docs/reference', '/demos', '/demos/data-grid', '/llms-full.txt', '/sitemap.xml', '/docs/reference/api.json']) {
    await check(path);
  }
  const llms = await check('/llms.txt');
  const markdown = new Set([...llms.matchAll(/\]\(([^)\s]+\.md)\)/g)].map((m) => sitePath(m[1]!)));
  for (const path of markdown) await check(path);

  const manifest = JSON.parse(await check('/search/manifest.json')) as { shards: { id: string }[] };
  for (const shard of manifest.shards) await check(`/search/${shard.id}.json`);

  expect(hits).toEqual([]);
});
