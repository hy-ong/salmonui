// docs/site/lib/catalog.mjs `checkCatalog` and the docs:coverage report
// (tooling/checks/docs-coverage.mjs).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { checkCatalog } from '../../../docs/site/lib/catalog.mjs';

const doc = (slug, title, section, demos, extra = {}) => ({ slug, title, section, demos, hasTitle: true, hasDescription: true, ...extra });
const demo = (id, title, category, extra = {}) => ({ id, title, category, hasMeta: true, hasComponent: true, hasTitle: true, hasDescription: true, ...extra });

test('docs:coverage passes on the repository catalog and lists every section', () => {
  const script = new URL('../docs-coverage.mjs', import.meta.url).pathname;
  const r = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const json = JSON.parse(r.stdout);
  assert.deepEqual(json.errors, []);
  assert.ok(json.sections.includes('data-grid') && json.sections.includes('buttons'), json.sections.join(', '));
  assert.ok(json.docsPages > 100 && json.demos > 100);
});

test('checkCatalog rejects two docs pages or two demos of one section with the same title', () => {
  const docs = [doc('toolbar', 'Toolbar', 'data-grid', ['grid-toolbar']), doc('toolbar', 'Toolbar', 'navigation', ['nav-toolbar', 'nav-toolbar-2'])];
  const shared = (errors) => errors.filter((error) => error.includes('share the title'));
  // Same title in different sections is fine: page titles add the section.
  const ok = checkCatalog(docs, [demo('grid-toolbar', 'Toolbar', 'data-grid'), demo('nav-toolbar', 'Toolbar', 'navigation'), demo('nav-toolbar-2', 'Toolbar menu', 'navigation')]);
  assert.deepEqual(shared(ok.errors), []);
  const bad = checkCatalog(docs, [demo('grid-toolbar', 'Toolbar', 'data-grid'), demo('nav-toolbar', 'Toolbar', 'navigation'), demo('nav-toolbar-2', 'toolbar', 'navigation')]);
  assert.deepEqual(shared(bad.errors), ['demos nav-toolbar, nav-toolbar-2 of section navigation share the title "toolbar"; titles must be unique within a section']);
});

test('checkCatalog reports dangling, unembedded and misplaced demos and missing front matter', () => {
  const docs = [doc('sorting', 'Sorting', 'data-grid', ['sorting', 'ghost']), doc('button', 'Button', 'buttons', ['grid-in-buttons'], { hasDescription: false })];
  const demos = [demo('sorting', 'Sorting', 'data-grid'), demo('lonely', 'Lonely', 'data-grid'), demo('grid-in-buttons', 'Grid', 'data-grid'), demo('Bad_Name', 'Bad', 'data-grid', { hasComponent: false })];
  const errors = checkCatalog(docs, demos).errors;
  assert.ok(errors.includes('docs page "sorting": unknown demo "ghost"'), errors.join('\n'));
  assert.ok(errors.includes('demo "lonely": not embedded in any docs page (frontmatter `demos`)'));
  assert.ok(errors.includes("demo \"grid-in-buttons\": category data-grid but embedded by another section's page"));
  assert.ok(errors.includes('docs page "buttons/button": frontmatter has no `description`'));
  assert.ok(errors.includes('demo "Bad_Name": folder name must be kebab-case'));
  assert.ok(errors.includes('demo "Bad_Name": missing Demo.tsx'));
});
