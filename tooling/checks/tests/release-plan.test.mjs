import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PACKAGES, PACKAGE_NAMES, VERSION } from '../packages.manifest.mjs';
import { checkReleasePlan, PUBLISHED_PACKAGES, RELEASE_VERSION, versionedRelease } from '../release-plan.mjs';

const root = new URL('../../../', import.meta.url).pathname;
const CHANGESET = '.changeset/salmon-ui-0-2-0.md';
const release = (name, type, newVersion, oldVersion = '0.1.0') => ({ name, type, oldVersion, newVersion, changesets: ['x'] });
const plan = (version = '0.2.0', type = 'minor') => ({ changesets: [{ id: 'x' }], releases: PUBLISHED_PACKAGES.map((n) => release(n, type, version)) });

test('the release version is the manifest version, 0.2.0', () => {
  assert.equal(RELEASE_VERSION, '0.2.0');
  assert.equal(RELEASE_VERSION, VERSION);
});

test('the published packages are the 23 manifest packages', () => {
  assert.deepEqual(PUBLISHED_PACKAGES, PACKAGE_NAMES);
  assert.equal(PUBLISHED_PACKAGES.length, 23);
  assert.ok(PUBLISHED_PACKAGES.includes('@salmonui/mcp'));
  for (const gone of ['@salmonui/react', '@salmonui/data-grid-core', '@salmonui/data-grid-export']) assert.ok(!PUBLISHED_PACKAGES.includes(gone), gone);
});

test('a minor plan from 0.1.0 to 0.2.0 for every published package passes', () => {
  const status = plan();
  status.releases.push(release('@salmonui/example-vite-spa', 'none', '0.0.0', '0.0.0'));
  assert.deepEqual(checkReleasePlan(status, { fixed: [PUBLISHED_PACKAGES] }), []);
});

test('a major plan (1.0.0) fails for every published package', () => {
  const errors = checkReleasePlan(plan('1.0.0', 'major'));
  assert.equal(errors.length, PUBLISHED_PACKAGES.length);
  assert.match(errors[0], /@salmonui\/core: release plan is 0\.1\.0 -> 1\.0\.0 \(major\); expected exactly 0\.2\.0/);
});

test('a patch plan (0.1.1) or a second minor (0.3.0) fails', () => {
  assert.equal(checkReleasePlan(plan('0.1.1', 'patch')).length, PUBLISHED_PACKAGES.length);
  assert.equal(checkReleasePlan(plan('0.3.0', 'minor')).length, PUBLISHED_PACKAGES.length);
});

test('a missing published package or an empty plan fails', () => {
  const status = plan();
  status.releases = status.releases.filter((r) => r.name !== '@salmonui/pdf-viewer');
  assert.deepEqual(checkReleasePlan(status), ['@salmonui/pdf-viewer: no pending release (expected 0.2.0)']);
  assert.equal(checkReleasePlan({ changesets: [], releases: [] }).length, PUBLISHED_PACKAGES.length);
  assert.equal(checkReleasePlan(undefined).length, PUBLISHED_PACKAGES.length);
});

test('a version bump of a non-published package fails; type none passes', () => {
  const status = plan();
  status.releases.push(release('@salmonui/docs-site', 'patch', '0.0.1', '0.0.0'));
  assert.deepEqual(checkReleasePlan(status), ['@salmonui/docs-site: not a published package but the plan bumps it 0.0.0 -> 0.0.1 (patch)']);
  const removed = plan();
  removed.releases.push(release('@salmonui/react', 'minor', '0.2.0'));
  assert.equal(checkReleasePlan(removed).length, 1);
});

test('the fixed group must be exactly the published packages', () => {
  assert.deepEqual(checkReleasePlan(plan(), { fixed: [PUBLISHED_PACKAGES] }), []);
  assert.equal(checkReleasePlan(plan(), { fixed: [] }).length, 1);
  assert.equal(checkReleasePlan(plan(), { fixed: [PUBLISHED_PACKAGES.slice(1)] }).length, 1);
  assert.equal(checkReleasePlan(plan(), { fixed: [[...PUBLISHED_PACKAGES, '@salmonui/docs-site']] }).length, 1);
});

test('PUBLISHED_PACKAGES matches the non-private workspace packages and the config', () => {
  const names = readdirSync(join(root, 'packages'))
    .map((d) => join(root, 'packages', d, 'package.json'))
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, 'utf8')))
    .filter((pkg) => !pkg.private)
    .map((pkg) => pkg.name);
  assert.deepEqual([...names].sort(), [...PUBLISHED_PACKAGES].sort());
  for (const p of PACKAGES) assert.equal(JSON.parse(readFileSync(join(root, p.dir, 'package.json'), 'utf8')).name, p.name, p.dir);
  const config = JSON.parse(readFileSync(join(root, '.changeset/config.json'), 'utf8'));
  assert.deepEqual(checkReleasePlan(plan(), { fixed: config.fixed }), []);
});

test('the committed release changeset is a minor bump of every published package from 0.1.0', () => {
  // Once `changeset version` has run, the changeset is consumed and every
  // published package carries 0.2.0 instead.
  if (!existsSync(join(root, CHANGESET))) {
    assert.ok(versionedRelease(root), 'every published package is versioned 0.2.0 with no pending changeset');
    return;
  }
  for (const p of PACKAGES) assert.equal(JSON.parse(readFileSync(join(root, p.dir, 'package.json'), 'utf8')).version, '0.1.0', `${p.name} stays 0.1.0 in source until \`changeset version\``);
  const text = readFileSync(join(root, CHANGESET), 'utf8');
  const front = text.split('---')[1];
  const bumps = Object.fromEntries([...front.matchAll(/^"([^"]+)": (\w+)$/gm)].map((m) => [m[1], m[2]]));
  assert.deepEqual(Object.keys(bumps).sort(), [...PUBLISHED_PACKAGES].sort());
  for (const type of Object.values(bumps)) assert.equal(type, 'minor');
  assert.match(text, /0\.2\.0/);
  assert.match(text, /Breaking changes/);
  assert.match(text, /`@salmonui\/react` is removed/);
});
