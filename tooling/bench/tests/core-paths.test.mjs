// tooling/bench/core-paths.mjs: which `bench` metrics gate as core paths.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CORE_PATHS, corePath } from '../core-paths.mjs';

const baseline = JSON.parse(readFileSync(new URL('../baseline.json', import.meta.url), 'utf8'));

test('the core paths are the documented ones (bundle is gated by bundle:check)', () => {
  assert.deepEqual(CORE_PATHS.map((c) => c.path), ['render', 'scroll', 'sort', 'filter', 'group', 'edit', 'export', 'pivot', 'sparklines in grid']);
});

test('core-path metrics map to their path', () => {
  assert.equal(corePath('rows=100000 cols=100 firstViewport'), 'render');
  assert.equal(corePath('vertical scroll 2000px/s wheel 100k x 100: p95'), 'scroll');
  assert.equal(corePath('horizontal scroll 2000px/s wide 10k x 500: max'), 'scroll');
  assert.equal(corePath('scrollToRow view index 90000 to painted'), 'scroll');
  assert.equal(corePath('grouped scroll 2000px/s: p95'), 'scroll');
  assert.equal(corePath('sparkline grid scroll 2000px/s: p95'), 'sparklines in grid');
  assert.equal(corePath('sort string column (cold)'), 'sort');
  assert.equal(corePath('multi-sort 3 columns (warm)'), 'sort');
  assert.equal(corePath('type filter char by char (cold)'), 'filter');
  assert.equal(corePath('group s0, d0, b0 + sum/avg n0..n2 (cold)'), 'group');
  assert.equal(corePath('edit.commit one cell'), 'edit');
  assert.equal(corePath('export xlsx 100k x 10'), 'export');
  assert.equal(corePath('pivot initial aggregation 1M rows (in-process)'), 'pivot');
  assert.equal(corePath('pivot initial aggregation 1M rows (worker)'), 'pivot');
  assert.equal(corePath('pivot drill down row member'), 'pivot');
  assert.equal(corePath('pivot drill up column member'), 'pivot');
  assert.equal(corePath('pivot filter apply row member'), 'pivot');
  assert.equal(corePath('pivot filter clear column member'), 'pivot');
  assert.equal(corePath('pivot sort row field'), 'pivot');
  assert.equal(corePath('pivot sort column field'), 'pivot');
});

test('tree mode sort, filter and scroll metrics join their core paths', () => {
  assert.equal(corePath('tree-large sort n4 number column (cold)'), 'sort');
  assert.equal(corePath('tree-large sort n4 number column (warm)'), 'sort');
  assert.equal(corePath("tree-large contains filter s0 filterMode 'ancestors' (cold)"), 'filter');
  assert.equal(corePath("tree-large contains filter s0 filterMode 'ancestors' (warm)"), 'filter');
  assert.equal(corePath('tree-large vertical scroll 2000px/s programmatic fully expanded: p95'), 'scroll');
  assert.equal(corePath('tree-large vertical scroll 2000px/s wheel fully expanded: handlerP95'), 'scroll');
  assert.equal(corePath('tree-large vertical scroll 2000px/s programmatic fully expanded (middle): p95'), 'scroll');
  // References and moves are reported, not core.
  assert.equal(corePath('flat 1M reference sort n4 number column (cold)'), null);
  assert.equal(corePath('tree-large move indent one row to painted'), null);
  assert.equal(corePath('index build, flat parentId'), null);
});

test('feature-specific metrics are not core paths', () => {
  for (const name of [
    'batch-dirty scroll 2000px/s: p95',
    'vertical scroll 2000px/s with spans: max',
    'vertical scroll 2000px/s with renderRow: p95',
    'lookup sort cold (display resolution + keys)',
    'lookup group cold',
    'column resize drag frame: frameP95',
    'clipboard.fill 1 x 10 to 10,000 x 10 (cell mode)',
    'remote first page paging: total',
    'detail expand all',
    'pivot value sort one column',
    'pivot move field between axes',
    'pivot ssr compute 10k rows (engine share)',
    'pivot expand all rows and columns',
  ]) {
    assert.equal(corePath(name), null, name);
  }
});

test('every core path except export, sparklines in grid (baseline pending a local bench run) and bundle has a baseline metric', () => {
  const metrics = Object.keys(baseline.environments.local.metrics);
  const paths = new Set(metrics.map(corePath).filter(Boolean));
  for (const { path } of CORE_PATHS) if (path !== 'export' && path !== 'sparklines in grid') assert.ok(paths.has(path), `no baseline metric for core path ${path}`);
});
