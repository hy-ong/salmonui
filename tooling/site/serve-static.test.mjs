import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createStaticServer, parseHeaders, setContentType } from './serve-static.mjs';

let root;
let server;
let origin;

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'salmon-serve-static-'));
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'guide'));
  mkdirSync(join(root, '_next/static'), { recursive: true });
  writeFileSync(join(root, 'index.html'), 'home');
  writeFileSync(join(root, '404.html'), 'not found');
  writeFileSync(join(root, 'docs/sorting.html'), 'sorting');
  writeFileSync(join(root, 'guide/index.html'), 'guide');
  writeFileSync(join(root, '_next/static/app.js'), 'js');
  writeFileSync(join(root, '_headers'), ['/_next/static/*', '  Cache-Control: immutable', '/*', '  X-Content-Type-Options: nosniff', '/docs/:page', '  X-Page: yes', 'https://:project.pages.dev/*', '  X-Robots-Tag: noindex'].join('\n'));
  server = createStaticServer({ root });
  await new Promise((resolve) => server.listen(0, resolve));
  origin = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

const get = (path, init) => fetch(`${origin}${path}`, { redirect: 'manual', ...init });

test('clean URLs serve <route>.html and index.html', async () => {
  assert.equal(await (await get('/')).text(), 'home');
  const page = await get('/docs/sorting');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await page.text(), 'sorting');
  assert.equal(await (await get('/guide/')).text(), 'guide');
});

test('.html, index.html and directory URLs redirect to the canonical form', async () => {
  const html = await get('/docs/sorting.html?x=1');
  assert.equal(html.status, 308);
  assert.equal(html.headers.get('location'), '/docs/sorting?x=1');
  assert.equal((await get('/index.html')).headers.get('location'), '/');
  assert.equal((await get('/index')).headers.get('location'), '/');
  assert.equal((await get('/guide/index?x=1')).headers.get('location'), '/guide/?x=1');
  assert.equal((await get('/guide/index.html')).headers.get('location'), '/guide/');
  assert.equal((await get('/guide')).headers.get('location'), '/guide/');
  assert.equal((await get('/docs/sorting/')).headers.get('location'), '/docs/sorting');
});

test('missing files, _headers and traversal serve 404.html with status 404', async () => {
  for (const path of ['/docs/missing', '/api/orders', '/_headers', '/%2e%2e/etc/passwd', '/missing.html']) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), 'not found');
  }
  assert.equal((await get('/api/orders', { method: 'POST', body: '{}' })).status, 404);
});

test('_headers rules apply by path; host patterns need the host', async () => {
  const asset = await get('/_next/static/app.js');
  assert.equal(asset.headers.get('cache-control'), 'immutable');
  assert.equal(asset.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await get('/docs/sorting')).headers.get('x-page'), 'yes');
  assert.equal((await get('/docs/sorting')).headers.get('x-robots-tag'), null);
});

test('parseHeaders reads detach lines and absolute patterns', () => {
  const rules = parseHeaders('https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n/a\n  ! X-Robots-Tag\n');
  assert.equal(rules.length, 2);
  assert.equal(rules[0].pattern.absolute, true);
  assert.ok(rules[0].pattern.regex.test('salmonui.pages.dev/docs/x'));
  assert.ok(!rules[0].pattern.regex.test('salmonui.dev/docs/x'));
  assert.deepEqual(rules[1].detach, ['x-robots-tag']);
});

test('Markdown files: a _headers Content-Type wins for served files, not for the 404 page', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'salmon-serve-static-md-'));
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'index.html'), 'home');
  writeFileSync(join(dir, '404.html'), 'not found');
  writeFileSync(join(dir, 'docs/sorting.html'), 'sorting');
  writeFileSync(join(dir, 'docs/sorting.md'), '# Sorting\n');
  writeFileSync(join(dir, 'notes.txt'), 'notes\n');
  writeFileSync(join(dir, '_headers'), ['/*.md', '  Content-Type: text/markdown; charset=utf-8'].join('\n'));
  const md = createStaticServer({ root: dir });
  await new Promise((resolve) => md.listen(0, resolve));
  const at = `http://localhost:${md.address().port}`;
  try {
    const page = await fetch(`${at}/docs/sorting.md`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('content-type'), 'text/markdown; charset=utf-8');
    assert.equal(await page.text(), '# Sorting\n');
    assert.equal((await fetch(`${at}/docs/sorting`)).headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal((await fetch(`${at}/notes.txt`)).headers.get('content-type'), 'text/plain; charset=utf-8');
    const missing = await fetch(`${at}/docs/missing.md`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('content-type'), 'text/html; charset=utf-8');
  } finally {
    md.close();
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(setContentType({}, '/x/y.md')['content-type'], 'text/markdown; charset=utf-8');
  assert.deepEqual(setContentType({ 'Content-Type': 'a/b' }, '/x.md'), { 'content-type': 'a/b' });
  assert.deepEqual(setContentType({ 'Content-Type': 'a/b' }, '/x.md', false), { 'content-type': 'text/markdown; charset=utf-8' });
});
