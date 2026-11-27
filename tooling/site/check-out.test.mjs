import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  caseCollisions,
  checkOut,
  fileCountStats,
  fileKind,
  formatReport,
  internalTarget,
  isTextFile,
  isDocsPage,
  isReferencePage,
  jsonLdProblems,
  KB,
  landingLimit,
  LIMITS,
  markdownLinks,
  pagePath,
  parseArgs,
  parseHtml,
  planningHits,
  payloadsByPage,
  SKILLS_INDEX,
  SKILLS_SCHEMA,
  vendorHits,
} from './check-out.mjs';

const SITE = 'https://salmonui.dev';
const script = fileURLToPath(new URL('./check-out.mjs', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'salmon-check-out-'));
after(() => rmSync(temp, { recursive: true, force: true }));

let counter = 0;
/** Writes a fixture export; `files` maps relative paths to contents. */
function fixture(files) {
  const dir = join(temp, `out-${counter++}`);
  for (const [path, content] of Object.entries(files)) {
    if (content === undefined) continue;
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

function page({ path, title, description = `${title} description`, h1 = title, body = '', head = '', robots = '', canonical }) {
  const href = canonical ?? (path === '/' ? `${SITE}/` : `${SITE}${path}`);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="description" content="${description}">${robots ? `<meta name="robots" content="${robots}">` : ''}
${href ? `<link rel="canonical" href="${href}">` : ''}${head}</head><body>${h1 ? `<h1>${h1}</h1>` : ''}${body}</body></html>`;
}

const SKILL = `---\nname: salmonui-x\ndescription: "X"\n---\n\n# X\n\n- [Docs](${SITE}/docs.md)\n`;
const digest = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const skillsIndex = (skills = [{ name: 'salmonui-x', type: 'skill-md', description: 'X', url: `${SITE}/skills/salmonui-x/SKILL.md`, digest: digest(SKILL) }]) =>
  JSON.stringify({ $schema: SKILLS_SCHEMA, skills });

const searchManifest = (shards = [{ id: 'grid', title: 'Grid', records: 1 }], records = []) => JSON.stringify({ version: 2, records, shards });
const searchShard = (id = 'grid', records = [{ kind: 'section', title: 'Sorting', text: '', url: '/docs/sorting' }]) => JSON.stringify({ version: 2, id, records });

/** A small valid export: landing, two docs pages, a 404, sitemap, search manifest and shard, AI docs and one Agent Skill. */
function validFiles(overrides = {}) {
  return {
    'index.html': page({
      path: '/',
      title: 'Salmon UI: grids',
      head: '<script src="/_next/static/chunks/main.js" async></script><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>',
      body: '<a href="/docs">Docs</a> <a href="/docs/sorting#multi-sort">Multi</a> <img src="/logo.svg" alt="">',
    }),
    'docs.html': page({ path: '/docs', title: 'Docs | Salmon UI', body: '<a href="/docs/sorting">Sorting</a> <a href="#top">Top</a><span id="top"></span>' }),
    'docs/sorting.html': page({ path: '/docs/sorting', title: 'Sorting | Salmon UI', body: '<h2 id="multi-sort">Multi-sort</h2><a href="/">Home</a> <a href="https://example.com/x">ext</a>' }),
    '404.html': page({ path: '/404', title: 'Not found | Salmon UI', robots: 'noindex', canonical: '' }),
    '_next/static/chunks/main.js': 'console.log("hello");'.repeat(10),
    'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    'sitemap.xml': `<?xml version="1.0"?><urlset><url><loc>${SITE}/</loc></url><url><loc>${SITE}/docs</loc></url><url><loc>${SITE}/docs/sorting</loc></url></urlset>`,
    'search/manifest.json': searchManifest(),
    'search/grid.json': searchShard(),
    'llms.txt': `# Salmon UI\n\n> A grid.\n\n## Docs\n\n- [Docs](${SITE}/docs.md): home\n- [Sorting](${SITE}/docs/sorting.md): sort\n- [Full](${SITE}/llms-full.txt)\n`,
    'llms-full.txt': '# Sorting\n\nCanonical: x\n',
    'docs.md': `# Docs\n\n- [Sorting](${SITE}/docs/sorting)\n`,
    'skills/salmonui-x/SKILL.md': SKILL,
    [SKILLS_INDEX]: skillsIndex(),
    'docs/sorting.md': `# Sorting\n\nSee [multi](${SITE}/docs/sorting#multi-sort) and [mail](mailto:a@b.c).\n\n\`\`\`tsx\n<!-- not a marker --> [x](relative)\n\`\`\`\n\nInline \`[y](relative)\`.\n`,
    ...overrides,
  };
}

const messages = (result, group) => result.errors.filter((e) => !group || e.group === group).map((e) => `${e.file}: ${e.message}`);

describe('helpers', () => {
  test('file count limits: error from 18,000, warning from 15,000, under the Pages 20,000', () => {
    assert.equal(LIMITS.maxFiles, 18_000);
    assert.equal(LIMITS.warnFiles, 15_000);
    assert.equal(LIMITS.pagesMaxFiles, 20_000);
  });

  test('fileKind and payloadsByPage classify the export', () => {
    const files = ['index.html', 'index.txt', '__next._tree.txt', 'docs/x.html', 'docs/x.md', 'docs/x.txt', 'docs/x/__next._full.txt', 'docs/x/y.html', '_next/static/a.js', 'search/grid.json', 'llms.txt', 'og.png'];
    const set = new Set(files);
    assert.deepEqual(
      files.map((f) => fileKind(f, set)),
      ['html', 'rsc-payload', 'rsc-segments', 'html', 'markdown', 'rsc-payload', 'rsc-segments', 'html', 'next-assets', 'search', 'other', 'images'],
    );
    assert.deepEqual(
      [...payloadsByPage(files)],
      [
        ['index.html', ['index.txt', '__next._tree.txt']],
        ['docs/x.html', ['docs/x.txt', 'docs/x/__next._full.txt']],
      ],
    );
  });

  test('fileCountStats projects the headroom per page kind', () => {
    const files = [
      'docs.html', 'docs.md', 'docs.txt', 'docs/__next._full.txt', 'docs/__next._tree.txt',
      'docs/reference/react/data-grid.html', 'docs/reference/react/data-grid.md',
      'docs/reference/react/data-grid/DataGrid.html', 'docs/reference/react/data-grid/DataGrid.md',
      '404.html',
    ];
    const stats = fileCountStats(files, 100);
    assert.equal(stats.total, 10);
    assert.deepEqual(stats.byKind, { html: 4, markdown: 3, 'rsc-payload': 1, 'rsc-segments': 2 });
    assert.equal(stats.documentOnlyPages, 2);
    assert.equal(stats.navigablePages, 1);
    assert.equal(stats.perDocumentOnlyPage, 2);
    assert.equal(stats.perNavigablePage, 5);
    assert.equal(stats.room, 89);
    assert.equal(stats.roomDocumentOnlyPages, 44);
    assert.equal(stats.roomNavigablePages, 17);
  });

  test('pagePath maps exported files to clean URLs', () => {
    assert.equal(pagePath('index.html'), '/');
    assert.equal(pagePath('docs.html'), '/docs');
    assert.equal(pagePath('docs/reference/react/index.html'), '/docs/reference/react/');
    assert.equal(pagePath('docs/x.html'), '/docs/x');
  });

  test('landingLimit is recorded + 10% capped at the ceiling', () => {
    assert.equal(landingLimit(null), LIMITS.landingCeilingGzip);
    assert.equal(landingLimit(100 * KB), Math.floor(110 * KB));
    assert.equal(landingLimit(240 * KB), 250 * KB);
    assert.equal(landingLimit(), 250 * KB, 'the recorded 242.9 KB + 10% is capped at the 250 KB ceiling');
  });

  test('internalTarget classifies references', () => {
    assert.equal(internalTarget('https://example.com/a', '/docs/x', SITE), null);
    assert.equal(internalTarget('mailto:a@b.c', '/', SITE), null);
    assert.equal(internalTarget('//cdn.example.com/a.js', '/', SITE), null);
    assert.deepEqual(internalTarget(`${SITE}/docs#a`, '/', SITE), { pathname: '/docs', hash: 'a', absolute: true });
    assert.deepEqual(internalTarget('sorting?x=1#h', '/docs/x', SITE), { pathname: '/docs/sorting', hash: 'h' });
    assert.deepEqual(internalTarget('/_next/a.js?dpl=1', '/', SITE), { pathname: '/_next/a.js', hash: '' });
  });

  test('parseHtml reads head facts and ignores script bodies', () => {
    const facts = parseHtml(
      `<html lang="en"><head><title>A &amp; B</title><meta content="Desc" name="description">
<link rel="canonical" href="${SITE}/a"><script>self.x = '<h1 href="/nope">';</script>
<link rel="modulepreload" href="/m.js"></head><body><svg><title>icon</title></svg><h1 id="t">A</h1>
<!-- <a href="/commented"> --><a href='/b' name="anchor">b</a></body></html>`,
    );
    assert.equal(facts.lang, 'en');
    assert.equal(facts.title, 'A & B');
    assert.equal(facts.description, 'Desc');
    assert.deepEqual(facts.canonical, [`${SITE}/a`]);
    assert.equal(facts.h1, 1);
    assert.deepEqual([...facts.ids].sort(), ['anchor', 't']);
    assert.deepEqual(facts.scripts, ['/m.js']);
    assert.ok(!facts.refs.some((r) => r.value === '/nope' || r.value === '/commented'));
    assert.ok(facts.refs.some((r) => r.value === '/b'));
  });

  test('parseHtml leaves nomodule scripts out of first-load JS but checks their links', () => {
    const facts = parseHtml(
      '<html><head><script src="/polyfills.js" noModule=""></script><script nomodule src="/legacy.js"></script><script src="/main.js" async></script></head><body></body></html>',
    );
    assert.deepEqual(facts.scripts, ['/main.js']);
    assert.ok(facts.refs.some((r) => r.value === '/polyfills.js'));
    assert.ok(facts.refs.some((r) => r.value === '/legacy.js'));
  });

  test('jsonLdProblems requires @context and @type', () => {
    assert.deepEqual(jsonLdProblems({ '@context': 'https://schema.org', '@type': 'WebSite' }), []);
    assert.deepEqual(jsonLdProblems({ '@type': 'WebSite' }), ['has no @context']);
    assert.deepEqual(jsonLdProblems({ '@context': 'x', '@graph': [{ '@type': 'A' }, {}] }), ['a @graph node has no @type']);
    assert.deepEqual(jsonLdProblems([1]), ['is not an object']);
  });

  test('parseArgs', () => {
    const defaults = parseArgs([], {});
    assert.match(defaults.dir, /docs\/site\/out\/?$/);
    assert.equal(defaults.siteUrl, SITE);
    assert.equal(parseArgs([], { SITE_URL: 'https://x.dev/' }).siteUrl, 'https://x.dev');
    const custom = parseArgs(['/tmp/out', '--json', '--site-url', 'https://y.dev//'], {});
    assert.deepEqual([custom.dir, custom.json, custom.siteUrl], ['/tmp/out', true, 'https://y.dev']);
    assert.throws(() => parseArgs(['--bogus'], {}), /unknown option/);
    assert.throws(() => parseArgs(['a', 'b'], {}), /unexpected argument/);
    assert.throws(() => parseArgs(['--site-url'], {}), /needs a value/);
  });
});

describe('checkOut', () => {
  test('a valid export passes and reports first-load JS', () => {
    const result = checkOut(fixture(validFiles()), { siteUrl: SITE });
    assert.deepEqual(messages(result), []);
    assert.equal(result.ok, true);
    assert.equal(result.stats.pages, 4);
    assert.ok(result.stats.landing.gzip > 0);
    assert.equal(result.stats.firstLoadJs['/'].scripts, 1);
  });

  test('the root canonical and sitemap URL may omit the slash', () => {
    const files = validFiles();
    files['index.html'] = files['index.html'].replace(`href="${SITE}/"`, `href="${SITE}"`);
    files['sitemap.xml'] = files['sitemap.xml'].replace(`<loc>${SITE}/</loc>`, `<loc>${SITE}</loc>`);
    assert.deepEqual(messages(checkOut(fixture(files), { siteUrl: SITE })), []);
  });

  test('a missing directory fails', () => {
    const result = checkOut(join(temp, 'nope'), { siteUrl: SITE });
    assert.equal(result.ok, false);
    assert.match(messages(result)[0], /run `npm run site:build`/);
  });

  test('broken links, anchors and non-canonical links fail', () => {
    const result = checkOut(
      fixture(
        validFiles({
          'docs.html': page({
            path: '/docs',
            title: 'Docs | Salmon UI',
            body: '<a href="/docs/sorting">S</a> <a href="/docs/missing">M</a> <a href="/docs/sorting#nope">A</a> <a href="#gone">G</a> <a href="/docs/sorting.html">H</a> <img src="/missing.png">',
          }),
        }),
      ),
      { siteUrl: SITE },
    );
    const links = messages(result, 'links');
    assert.equal(links.length, 5, links.join('\n'));
    assert.ok(links.some((m) => m.includes('/docs/missing') && m.includes('does not resolve')));
    assert.ok(links.some((m) => m.includes('id "nope" on docs/sorting.html')));
    assert.ok(links.some((m) => m.includes('id "gone" on this page')));
    assert.ok(links.some((m) => m.includes('/docs/sorting.html') && m.includes('canonical form')));
    assert.ok(links.some((m) => m.includes('/missing.png')));
  });

  test('sitemap URLs must use SITE_URL, resolve, and cover indexable pages', () => {
    const result = checkOut(
      fixture(
        validFiles({
          'sitemap.xml': `<urlset><url><loc>https://other.dev/docs</loc></url><url><loc>${SITE}/</loc></url><url><loc>${SITE}/docs/gone</loc></url><url><loc>${SITE}/404</loc></url></urlset>`,
        }),
      ),
      { siteUrl: SITE },
    );
    const sitemap = messages(result, 'sitemap');
    assert.ok(sitemap.some((m) => m.includes('does not start with SITE_URL')));
    assert.ok(sitemap.some((m) => m.includes('/docs/gone does not resolve')));
    assert.ok(sitemap.some((m) => m.includes('404 page')));
    assert.ok(sitemap.some((m) => m.startsWith('docs.html: indexable page is missing')));
    assert.ok(sitemap.some((m) => m.startsWith('docs/sorting.html: indexable page is missing')));
  });

  test('a different SITE_URL fails canonical and sitemap checks', () => {
    const result = checkOut(fixture(validFiles()), { siteUrl: 'https://preview.salmonui.dev' });
    assert.ok(messages(result, 'seo').some((m) => m.includes('should be "https://preview.salmonui.dev/docs"')));
    assert.ok(messages(result, 'sitemap').length > 0);
  });

  test('SEO rules: lang, h1, title, description, canonical, JSON-LD, noindex', () => {
    const result = checkOut(
      fixture(
        validFiles({
          'docs.html': page({ path: '/docs', title: 'Sorting | Salmon UI', description: 'Sorting | Salmon UI description', h1: '', canonical: '/docs' }).replace(' lang="en"', ''),
          'docs/sorting.html': page({
            path: '/docs/sorting',
            title: 'Sorting | Salmon UI',
            body: '<h1>Second</h1><a href="/">Home</a> <a href="/docs">Docs</a>',
            head: '<script type="application/ld+json">{not json}</script><script type="application/ld+json">{"@type":"TechArticle"}</script>',
          }),
          '404.html': page({ path: '/404', title: 'Not found', description: '', canonical: '' }),
        }),
      ),
      { siteUrl: SITE },
    );
    const seo = messages(result, 'seo');
    const expect = [
      'docs.html: <html> has no lang attribute',
      'docs.html: has 0 <h1> elements',
      'docs.html: canonical "/docs" is not absolute',
      'docs/sorting.html: has 2 <h1> elements',
      'docs/sorting.html: JSON-LD block 1 does not parse',
      'docs/sorting.html: JSON-LD block 2: has no @context',
      '404.html: has no <meta name="description">',
      '404.html: the 404 page needs',
      'docs.html, docs/sorting.html: share the <title> "Sorting | Salmon UI"',
      'docs.html, docs/sorting.html: share the meta description',
    ];
    for (const text of expect) assert.ok(seo.some((m) => m.startsWith(text)), `missing "${text}" in\n${seo.join('\n')}`);
  });

  test('missing canonical and title fail', () => {
    const result = checkOut(
      fixture(validFiles({ 'docs.html': page({ path: '/docs', title: '', canonical: '', body: '<a href="/docs/sorting">S</a>' }) })),
      { siteUrl: SITE },
    );
    const seo = messages(result, 'seo');
    assert.ok(seo.includes('docs.html: has no <title>'));
    assert.ok(seo.includes('docs.html: has no <link rel="canonical">'));
  });

  test('budgets: landing first-load JS, search manifest and each search shard', () => {
    const big = randomBytes(400 * KB);
    const noise = (bytes) => randomBytes(bytes).toString('base64');
    const result = checkOut(
      fixture(
        validFiles({
          '_next/static/chunks/main.js': big,
          'search/manifest.json': searchManifest([{ id: 'grid', title: 'Grid', records: 1 }], [{ kind: 'section', title: 'x', text: noise(LIMITS.searchManifestGzip), url: '/docs' }]),
          'search/grid.json': searchShard('grid', [{ kind: 'section', title: 'x', text: noise(LIMITS.searchShardGzip), url: '/docs' }]),
        }),
      ),
      { siteUrl: SITE },
    );
    const budgets = messages(result, 'budgets');
    assert.ok(budgets.some((m) => m.startsWith('index.html: landing first-load JS') && m.includes('ceiling')), budgets.join('\n'));
    assert.ok(budgets.some((m) => m.startsWith('search/manifest.json:') && m.includes('over 40.0 KB')), budgets.join('\n'));
    assert.ok(budgets.some((m) => m.startsWith('search/grid.json:') && m.includes('over 60.0 KB')), budgets.join('\n'));
    assert.equal(result.stats.search.shards, 1);
    assert.equal(result.stats.search.largest.file, 'search/grid.json');

    const recorded = checkOut(fixture(validFiles()), { siteUrl: SITE, landingRecordedGzip: 10 });
    assert.ok(messages(recorded, 'budgets').some((m) => m.includes('recorded 0.0 KB + 10%')));
  });

  test('budgets: every API reference page, raw and gzip', () => {
    const ref = (path, body) => page({ path, title: `${path} | Salmon UI`, body });
    const compressible = 'x'.repeat(LIMITS.referencePageBytes + 1);
    const noisy = randomBytes(LIMITS.referencePageGzip + KB).toString('base64').slice(0, 100 * KB);
    const result = checkOut(
      fixture(
        validFiles({
          'docs/reference.html': ref('/docs/reference', '<a href="/docs/reference/big">big</a> <a href="/docs/reference/big/Noisy">noisy</a>'),
          'docs/reference.md': `# r\n`,
          'docs/reference/big.html': ref('/docs/reference/big', compressible),
          'docs/reference/big.md': `# b\n`,
          'docs/reference/big/Noisy.html': ref('/docs/reference/big/Noisy', noisy),
          'docs/reference/big/Noisy.md': `# n\n`,
          'sitemap.xml': `<urlset>${['/', '/docs', '/docs/sorting', '/docs/reference', '/docs/reference/big', '/docs/reference/big/Noisy'].map((p) => `<url><loc>${SITE}${p === '/' ? '/' : p}</loc></url>`).join('')}</urlset>`,
        }),
      ),
      { siteUrl: SITE },
    );
    const budgets = messages(result, 'budgets');
    assert.equal(budgets.length, 2, budgets.join('\n'));
    assert.match(budgets[0], /^docs\/reference\/big\.html: reference page is 400\.\d KB, over 400\.0 KB$/);
    assert.match(budgets[1], /^docs\/reference\/big\/Noisy\.html: reference page is \d+\.\d KB gzip, over 60\.0 KB$/);
    assert.equal(result.stats.referencePages.pages, 3);
    assert.equal(result.stats.referencePages.largest.file, 'docs/reference/big.html');
    assert.equal(result.stats.referencePages.largestGzip.file, 'docs/reference/big/Noisy.html');
    assert.ok(isReferencePage('docs/reference.html'));
    assert.ok(isReferencePage('docs/reference/react/data-grid/DataGrid.html'));
    assert.ok(!isReferencePage('docs/reference/react.md'));
    assert.ok(!isReferencePage('docs/sorting.html'));
  });

  test('search: listed shards exist and match, unlisted shard files fail', () => {
    const result = checkOut(
      fixture(
        validFiles({
          'search/manifest.json': searchManifest([
            { id: 'grid', title: 'Grid', records: 2 },
            { id: 'gone', title: 'Gone', records: 0 },
            { id: 'manifest', title: 'Bad', records: 0 },
            { id: 'wrong', title: 'Wrong', records: 0 },
          ]),
          'search/wrong.json': searchShard('other', []),
          'search/stray.json': searchShard('stray', []),
        }),
      ),
      { siteUrl: SITE },
    );
    const budgets = messages(result, 'budgets');
    assert.deepEqual(budgets.sort(), [
      'search/gone.json: is listed by the search manifest but missing',
      'search/grid.json: has 1 records; the manifest says 2',
      'search/manifest.json: lists an invalid or duplicate shard id "manifest"',
      'search/stray.json: is not listed by the search manifest',
      'search/wrong.json: is not a version 2 shard with id wrong and a records array',
    ]);

    const old = checkOut(fixture(validFiles({ 'search/manifest.json': JSON.stringify({ version: 1, records: [] }) })), { siteUrl: SITE });
    assert.ok(messages(old, 'budgets').includes('search/manifest.json: is not a version 2 manifest with records and shards arrays'));
  });

  test('caseCollisions groups paths that differ only by case', () => {
    assert.deepEqual(caseCollisions(['a/Foo.html', 'a/foo.html', 'a/Bar.html', 'b/foo.html', 'A/FOO.HTML']), [['A/FOO.HTML', 'a/Foo.html', 'a/foo.html']]);
    assert.deepEqual(caseCollisions(['a/Foo-type.html', 'a/foo-function.html']), []);
  });

  test('a missing search manifest, sitemap or 404 page fails', () => {
    const files = validFiles();
    delete files['search/manifest.json'];
    delete files['search/grid.json'];
    delete files['sitemap.xml'];
    delete files['404.html'];
    const result = checkOut(fixture(files), { siteUrl: SITE });
    const all = messages(result);
    assert.ok(all.includes('null: search/manifest.json is missing'));
    assert.ok(all.includes('null: sitemap.xml is missing'));
    assert.ok(all.includes('null: 404.html is missing'));
  });

  test('file limits and /api/ files', () => {
    const result = checkOut(fixture(validFiles({ 'api/orders': '[]' })), { siteUrl: SITE });
    assert.ok(messages(result, 'files').some((m) => m.startsWith('api/orders:')));
  });

  test('vendor: no text file of the export names another component vendor', () => {
    const shard = searchShard('grid', [{ kind: 'section', title: 'Paging', text: 'Like EJ2 grids', url: '/docs/sorting' }]);
    const result = checkOut(
      fixture(
        validFiles({
          'docs/sorting.md': '# Sorting\n\nMigrating from Syncfusion.\n',
          'search/grid.json': shard,
          '_next/static/chunks/x.js': 'import "@syncfusion/ej2-grids";',
          'docs/sorting.txt': 'syncfusion '.repeat(9),
          'og.png': 'syncfusion',
        }),
      ),
      { siteUrl: SITE },
    );
    const vendor = messages(result, 'vendor');
    assert.ok(vendor.some((m) => m.startsWith('docs/sorting.md: line 3: "Syncfusion"') && m.includes('Migrating from Syncfusion')));
    assert.ok(vendor.some((m) => m.startsWith('search/grid.json:') && m.includes('"EJ2"')));
    assert.ok(vendor.some((m) => m.startsWith('_next/static/chunks/x.js:')));
    assert.equal(vendor.filter((m) => m.startsWith('docs/sorting.txt:')).length, 6);
    assert.ok(vendor.some((m) => m.includes('"4 more"')));
    assert.ok(!vendor.some((m) => m.startsWith('og.png')), 'binary files are not scanned');
    assert.equal(vendorHits('ej2-grids, the ej2 package, sej2x').length, 2);
    assert.equal(isTextFile('a/b.rsc'), true);
    assert.equal(isTextFile('a/b.woff2'), false);
  });

  test('planning: no shown text file of the export carries tracking IDs, work packages or design-doc paths', () => {
    const result = checkOut(
      fixture(
        validFiles({
          'docs/sorting.md': '# Sorting\n\nSee QQX-01 and UTF-8, GS1-128, QQX-0123, XQQX-01x.\n',
          'search/grid.json': searchShard('grid', [{ kind: 'section', title: 'QQZ-88', text: 'x', url: '/docs/sorting' }]),
          'docs/paging.txt': 'Planned in QQ-WP4; see docs/architecture/x.md.',
          'og.png': 'QQX-01',
        }),
      ),
      { siteUrl: SITE },
    );
    const planning = messages(result, 'planning');
    assert.ok(planning.some((m) => m.startsWith('docs/sorting.md: line 3: planning text "QQX-01"')), planning.join('\n'));
    assert.ok(planning.some((m) => m.startsWith('search/grid.json:') && m.includes('"QQZ-88"')));
    assert.equal(planning.filter((m) => m.startsWith('docs/sorting.md:')).length, 1, 'UTF-8, GS1-128, QQX-0123 and XQQX-01x are not tracking IDs');
    assert.equal(planning.filter((m) => m.startsWith('docs/paging.txt:')).length, 2);
    assert.ok(!planning.some((m) => m.startsWith('og.png')), 'binary files are not scanned');
    assert.deepEqual(planningHits('QQX-10..22 (QQX-02) `QQY-01`').map((hit) => hit.match), ['QQX-10', 'QQX-02', 'QQY-01']);
  });

  test('document-only pages must not keep an RSC payload', () => {
    const symbol = page({ path: '/docs/reference/react/x/Y', title: 'Y | Salmon UI', body: '<a href="/docs">Docs</a>' });
    const result = checkOut(
      fixture(
        validFiles({
          'docs.html': page({ path: '/docs', title: 'Docs | Salmon UI', body: '<a href="/docs/sorting">Sorting</a> <a href="/docs/reference/react/x/Y">Y</a>' }),
          'docs/reference/react/x/Y.html': symbol,
          'docs/reference/react/x/Y.md': `# Y\n\nCanonical: ${SITE}/docs/reference/react/x/Y\n`,
          'docs/reference/react/x/Y.txt': '0:{}',
          'docs/reference/react/x/Y/__next._tree.txt': '0:{}',
          'docs.txt': '0:{}',
          'sitemap.xml': `<urlset><url><loc>${SITE}/</loc></url><url><loc>${SITE}/docs</loc></url><url><loc>${SITE}/docs/sorting</loc></url><url><loc>${SITE}/docs/reference/react/x/Y</loc></url></urlset>`,
        }),
      ),
      { siteUrl: SITE },
    );
    assert.deepEqual(messages(result), [
      'docs/reference/react/x/Y.txt: RSC payload of a document-only page; build-export.mjs removes it',
      'docs/reference/react/x/Y/__next._tree.txt: RSC payload of a document-only page; build-export.mjs removes it',
    ]);
    assert.equal(result.stats.fileCount.documentOnlyPages, 1);
    const report = formatReport(result);
    assert.match(report, /files: \d+ \(error at 18000, Cloudflare Pages limit 20000\): /);
    assert.match(report, /file projection: \d+ files of headroom; 1 document-only pages at 4\.0 files each/);
  });

  test('pages without inbound links are warnings, not errors', () => {
    const result = checkOut(
      fixture(
        validFiles({
          'orphan.html': page({ path: '/orphan', title: 'Orphan | Salmon UI', body: '<a href="/">Home</a>' }),
          'sitemap.xml': `<urlset><url><loc>${SITE}/</loc></url><url><loc>${SITE}/docs</loc></url><url><loc>${SITE}/docs/sorting</loc></url><url><loc>${SITE}/orphan</loc></url></urlset>`,
        }),
      ),
      { siteUrl: SITE },
    );
    assert.equal(result.ok, true, messages(result).join('\n'));
    assert.deepEqual(result.warnings.map((w) => w.file), ['orphan.html']);
  });
});

describe('ai (AI-readable docs)', () => {
  test('a valid export reports the AI docs sizes', () => {
    const result = checkOut(fixture(validFiles()), { siteUrl: SITE });
    assert.deepEqual(messages(result, 'ai'), []);
    assert.equal(result.stats.ai.llms.links, 3);
    assert.equal(result.stats.ai.markdownFiles, 3);
    assert.equal(result.stats.ai.largestMarkdown.file, 'docs/sorting.md');
    assert.equal(result.stats.ai.skills, 1);
  });

  test('missing llms files and broken or relative llms.txt links fail', () => {
    const missing = messages(checkOut(fixture(validFiles({ 'llms.txt': undefined, 'llms-full.txt': undefined })), { siteUrl: SITE }), 'ai');
    assert.ok(missing.includes('null: llms.txt is missing'), missing.join('\n'));
    assert.ok(missing.includes('null: llms-full.txt is missing'));
    const broken = messages(
      checkOut(fixture(validFiles({ 'llms.txt': `Salmon\n\n- [Gone](${SITE}/docs/gone.md)\n- [Rel](/docs.md)\n- [Ext](https://example.com/x)\n` })), { siteUrl: SITE }),
      'ai',
    );
    assert.ok(broken.some((m) => m.includes('does not start with an H1')));
    assert.ok(broken.some((m) => m.includes('no `>` summary')));
    assert.ok(broken.some((m) => m.includes(`${SITE}/docs/gone.md does not resolve`)));
    assert.ok(broken.some((m) => m.includes('link /docs.md is not absolute')));
    assert.ok(broken.some((m) => m.includes('https://example.com/x is not absolute on SITE_URL')));
  });

  test('every /docs page needs its .md sibling; out/markdown/ must be gone', () => {
    const result = messages(checkOut(fixture(validFiles({ 'docs/sorting.md': undefined, 'markdown/docs.md': '# x\n' })), { siteUrl: SITE }), 'ai');
    assert.ok(result.includes('docs/sorting.html: has no Markdown version docs/sorting.md'), result.join('\n'));
    assert.ok(result.some((m) => m.startsWith('markdown/docs.md: out/markdown/ must be moved')));
    assert.ok(result.some((m) => m.includes(`${SITE}/docs/sorting.md does not resolve`)));
  });

  test('.md files: demo markers, HTML comments, relative and broken links fail outside code', () => {
    const result = messages(
      checkOut(
        fixture(
          validFiles({
            'docs.md': '# Docs\n\n<!-- demo: sorting -->\n\n[rel](/docs/sorting) [anchor](#top)\n',
            'docs/sorting.md': `# Sorting\n\n<!-- note -->\n\n[gone](${SITE}/docs/gone)\n`,
          }),
        ),
        { siteUrl: SITE },
      ),
      'ai',
    );
    assert.ok(result.includes('docs.md: contains a raw demo marker'), result.join('\n'));
    assert.ok(result.includes('docs.md: link "/docs/sorting" is not absolute'));
    assert.ok(result.includes('docs.md: link "#top" is not absolute'));
    assert.ok(result.includes('docs/sorting.md: contains an HTML comment'));
    assert.ok(result.includes(`docs/sorting.md: link ${SITE}/docs/gone does not resolve to a file in the export`));
  });

  test('Agent Skills: index, names, urls, digests and front matter', () => {
    const missing = messages(checkOut(fixture(validFiles({ [SKILLS_INDEX]: undefined })), { siteUrl: SITE }), 'ai');
    assert.ok(missing.includes(`null: ${SKILLS_INDEX} is missing (Agent Skills)`), missing.join('\n'));
    const bad = messages(
      checkOut(
        fixture(
          validFiles({
            'skills/salmonui-x/SKILL.md': `${SKILL}changed\n`,
            'skills/salmonui-orphan/SKILL.md': '---\nname: salmonui-orphan\ndescription: o\n---\n',
            'skills/salmonui-y/SKILL.md': '---\nname: other\n---\n',
            [SKILLS_INDEX]: skillsIndex([
              { name: 'salmonui-x', type: 'skill-md', description: 'X', url: `${SITE}/skills/salmonui-x/SKILL.md`, digest: digest(SKILL) },
              { name: 'salmonui-y', type: 'skill-md', description: 'Y', url: `${SITE}/skills/salmonui-y/SKILL.md`, digest: digest('---\nname: other\n---\n') },
              { name: 'Bad Name', type: 'archive', description: '', url: '/x', digest: 'sha256:0' },
            ]),
          }),
        ),
        { siteUrl: SITE },
      ),
      'ai',
    );
    assert.ok(bad.includes(`${SKILLS_INDEX} salmonui-x: digest does not match skills/salmonui-x/SKILL.md`), bad.join('\n'));
    assert.ok(bad.includes('skills/salmonui-y/SKILL.md: front matter has no `name: salmonui-y`'));
    assert.ok(bad.includes('skills/salmonui-y/SKILL.md: front matter has no `description`'));
    assert.ok(bad.includes('skills/salmonui-orphan/SKILL.md: is not listed in ' + SKILLS_INDEX));
    assert.ok(bad.includes(`${SKILLS_INDEX} Bad Name: name must be kebab-case, at most 64 characters`));
    assert.ok(bad.includes(`${SKILLS_INDEX} Bad Name: type must be "skill-md"`));
    assert.ok(bad.some((m) => m.startsWith(`${SKILLS_INDEX} Bad Name: url must be`)));
    assert.ok(bad.includes(`${SKILLS_INDEX} Bad Name: skills/Bad Name/SKILL.md is missing`));
  });

  test('markdownLinks skips fenced and inline code', () => {
    assert.deepEqual(markdownLinks('a [x](https://a/b) `[y](z)`\n```\n[q](r)\n```\n![i](/p.png "t")'), ['https://a/b', '/p.png']);
    assert.equal(isDocsPage('docs.html'), true);
    assert.equal(isDocsPage('docs/reference/react/index.html'), true);
    assert.equal(isDocsPage('demos/x.html'), false);
  });
});

describe('CLI', () => {
  test('exit codes and --json', () => {
    const ok = spawnSync(process.execPath, [script, fixture(validFiles()), '--site-url', SITE, '--json'], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).ok, true);

    const bad = spawnSync(process.execPath, [script, fixture(validFiles({ 'search/grid.json': '{' })), '--site-url', SITE], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /FAIL budgets \(1\)\n {2}search\/grid\.json: does not parse/);

    const usage = spawnSync(process.execPath, [script, '--nope'], { encoding: 'utf8' });
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /unknown option --nope/);
  });
});
