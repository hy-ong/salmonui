// Render features: detection, the static and
// lazy registries, the `features` prop, the SSR markup of a feature through
// the static registry, and the `#data-grid-features` conditions.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { paging } from '@salmonui/data-grid/features';
import { readFeatures as readStatic } from '../dist/data-grid/features/registry-static.js';
import { overrideFeatureLoader, readFeatures as readLazy } from '../dist/data-grid/features/registry-lazy.js';
import { requiredFeatures } from '../dist/data-grid/features/detect.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import type { DataGridFeature, DataGridFeatureName } from '../dist/data-grid/features/types.js';
import { count, newInstance, people, personColumns, render, type Person } from './fixtures.ts';

type Thenable = Promise<readonly DataGridFeature[]> & { status?: string; value?: readonly DataGridFeature[]; reason?: unknown };
const isThenable = (v: unknown): v is Thenable => typeof (v as { then?: unknown })?.then === 'function';
const names = (list: readonly DataGridFeature[]) => list.map((f) => f.name);

describe('render feature detection', () => {
  it('requires paging when the prop is set, never for false or absent', () => {
    assert.deepEqual(requiredFeatures({} as never), []);
    assert.deepEqual(requiredFeatures({ paging: false } as never), []);
    assert.deepEqual(requiredFeatures({ paging: true } as never), ['paging']);
    assert.deepEqual(requiredFeatures({ paging: {} } as never), ['paging']);
    // The modules prop is not inspected.
    assert.deepEqual(requiredFeatures({ modules: [{ name: 'paging' }] } as never), []);
  });
});

describe('static registry', () => {
  it('answers synchronously with the needed features', () => {
    const out = readStatic(['paging'], undefined);
    assert.ok(Array.isArray(out));
    assert.deepEqual(names(out as readonly DataGridFeature[]), ['paging']);
    assert.equal((out as readonly DataGridFeature[])[0], paging);
    assert.deepEqual(readStatic([], undefined), []);
  });

  it('merges provided features, deduplicated by name (the provided object wins)', () => {
    const mine = { ...paging } as DataGridFeature;
    const out = readStatic(['paging'], [mine]) as readonly DataGridFeature[];
    assert.equal(out.length, 1);
    assert.equal(out[0], mine);
  });
});

describe('lazy registry', () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('loads a missing feature once, then answers synchronously', async () => {
    let loads = 0;
    restore = overrideFeatureLoader('paging', async () => {
      loads++;
      return paging;
    });
    const first = readLazy(['paging'], undefined);
    assert.ok(isThenable(first));
    assert.equal(first.status, 'pending');
    // The same missing set shares one thenable while it is pending.
    assert.equal(readLazy(['paging'], undefined), first);
    await first;
    assert.equal(first.status, 'fulfilled');
    assert.deepEqual(names(first.value ?? []), ['paging']);
    // A retry reads the same, now fulfilled thenable (`use` returns its value synchronously).
    assert.equal(readLazy(['paging'], undefined), first);
    // A set whose features were loaded for another set answers with an array.
    const restoreOther = overrideFeatureLoader('spans' as DataGridFeatureName, async () => ({ name: 'spans' }) as DataGridFeature);
    try {
      loads = 0;
      const both = readLazy(['paging', 'spans'] as DataGridFeatureName[], undefined);
      assert.ok(isThenable(both));
      await both;
      const alone = readLazy(['spans'] as DataGridFeatureName[], undefined);
      assert.ok(Array.isArray(alone));
      assert.deepEqual(names(alone as readonly DataGridFeature[]), ['spans']);
    } finally {
      restoreOther();
    }
    assert.equal(loads, 1);
  });

  it('never loads a provided feature', () => {
    restore = overrideFeatureLoader('paging', () => assert.fail('a provided feature must not load'));
    const out = readLazy(['paging'], [paging]);
    assert.ok(Array.isArray(out));
    assert.equal((out as readonly DataGridFeature[])[0], paging);
  });

  it('starts every missing load in parallel', async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    restore = overrideFeatureLoader('paging', async () => {
      started.push('paging');
      await gate;
      return paging;
    });
    const restoreOther = overrideFeatureLoader('spans' as DataGridFeatureName, async () => {
      started.push('spans');
      await gate;
      return { name: 'spans' } as DataGridFeature;
    });
    try {
      const t = readLazy(['paging', 'spans'] as DataGridFeatureName[], undefined);
      assert.ok(isThenable(t));
      // Both loaders started before either settled.
      await Promise.resolve();
      assert.deepEqual(started.sort(), ['paging', 'spans']);
      release();
      await t;
      assert.deepEqual(names(t.value ?? []).sort(), ['paging', 'spans']);
    } finally {
      restoreOther();
    }
  });

  it('evicts a failed load so the next creation retries, and reports it in development', async () => {
    let attempt = 0;
    restore = overrideFeatureLoader('paging', async () => {
      attempt++;
      if (attempt === 1) throw new Error('chunk failed');
      return paging;
    });
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const first = readLazy(['paging'], undefined);
      assert.ok(isThenable(first));
      await assert.rejects(first, /chunk failed/);
      assert.equal(first.status, 'rejected');
      assert.ok(errors.some((e) => String(e[0]).includes('paging')), 'console.error names the feature');
      const second = readLazy(['paging'], undefined);
      assert.ok(isThenable(second));
      assert.notEqual(second, first);
      await second;
      assert.equal(second.status, 'fulfilled');
      assert.equal(attempt, 2);
    } finally {
      console.error = original;
    }
  });
});

describe('paging render feature (static registry, SSR)', () => {
  it('renders the pager on the server as plain grid markup, with no placeholder and no boundary', () => {
    const html = render({ rows: 100, paging: { pageSize: 10 } });
    assert.match(html, /class="salmon-data-grid-pager" role="navigation"/);
    assert.equal(count(html, /role="row" aria-rowindex/), 1 + 10, 'header row + one page');
    // No placeholder; the grid root carries the pending mark until it hydrates.
    assert.doesNotMatch(html, /aria-busy="true"/);
    assert.match(html, /role="grid"[^>]*data-salmon-pending=""/);
    // The grid has no Suspense boundary of its own.
    assert.doesNotMatch(html, /<!--\$/);
  });

  it('streams as plain markup through renderToPipeableStream (nothing outlined, no swap script)', async () => {
    const server = await import('react-dom/server');
    const { PassThrough } = await import('node:stream');
    const { createElement } = await import('react');
    const { DataGrid } = await import('@salmonui/data-grid');
    const html = await new Promise<string>((resolve, reject) => {
      const out = new PassThrough();
      let text = '';
      out.on('data', (chunk) => (text += String(chunk)));
      out.on('end', () => resolve(text));
      const element = createElement(DataGrid as never, { 'aria-label': 'People', data: people(500), columns: personColumns, timeZone: 'UTC', paging: { pageSize: 100 } });
      const stream = server.renderToPipeableStream(element, { onShellReady: () => stream.pipe(out), onShellError: reject });
    });
    // A 100-row page is far above React's progressiveChunkSize (12.8 KB): inside a boundary it would be outlined.
    assert.ok(html.length > 13_000, `markup size ${html.length}`);
    assert.match(html, /role="grid"/);
    assert.match(html, /class="salmon-data-grid-pager"/);
    assert.doesNotMatch(html, /aria-busy="true"/);
    assert.doesNotMatch(html, /<!--\$|\$RC|<template id="B:/);
  });

  it('keeps the tree of a grid without features (no Suspense boundary)', () => {
    const html = render({ rows: 5 });
    assert.doesNotMatch(html, /<!--\$-->/);
    assert.doesNotMatch(html, /salmon-data-grid-pager/);
    assert.doesNotMatch(html, /data-salmon-pending/);
  });

  it('a provided feature whose trigger does not hold changes nothing', () => {
    assert.equal(render({ rows: 5, features: [paging] }), render({ rows: 5 }));
  });

  it('the features prop removes the gate: the same markup without the pending mark', () => {
    const provided = render({ rows: 30, paging: { pageSize: 10 }, features: [paging] });
    assert.doesNotMatch(provided, /data-salmon-pending/);
    assert.equal(provided, render({ rows: 30, paging: { pageSize: 10 } }).replace(' data-salmon-pending=""', ''));
  });

  it('an instance without the feature registers no paging module and renders no pager part', () => {
    const instance = newInstance<Person>({ data: people(5), columns: personColumns, paging: { pageSize: 2 } }, ':feat1:');
    assert.ok(instance.query.pagingState(), 'the helper resolves paging from the static registry');
    assert.ok(instance.features.parts.Pager);
    const bare = new DataGridInstance<Person>({ data: people(5), columns: personColumns, paging: { pageSize: 2 } } as never, ':feat2:');
    assert.equal(bare.query.pagingState(), undefined);
    assert.equal(bare.features.parts.Pager, null);
  });
});

describe('#data-grid-features conditions', () => {
  const probe = join(import.meta.dirname, 'feature-registry-probe.tmp.mjs');
  const run = (conditions: string[]) => {
    writeFileSync(probe, "import { readFeatures } from '#data-grid-features';\nconst r = readFeatures(['paging'], undefined);\nconsole.log(typeof r.then === 'function' ? 'lazy' : 'static');\nif (typeof r.then === 'function') r.then(() => {}, () => {});\n");
    try {
      return spawnSync(process.execPath, [...conditions.flatMap((c) => ['-C', c]), probe], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } });
    } finally {
      rmSync(probe, { force: true });
    }
  };
  it('resolves the static registry under Node defaults and worker conditions', () => {
    assert.equal(run([]).stdout.trim(), 'static');
    assert.equal(run(['workerd', 'worker', 'browser']).stdout.trim(), 'static');
    assert.equal(run(['edge-light', 'browser']).stdout.trim(), 'static');
  });
  it('resolves the lazy registry under the browser condition (`node -C browser`)', () => {
    assert.equal(run(['browser']).stdout.trim(), 'lazy');
  });
  it('a server render that resolved the lazy registry suspends (renderToString fails) and warns in development', () => {
    writeFileSync(
      probe,
      "import { createElement } from 'react';\nimport { renderToString } from 'react-dom/server';\nimport { DataGrid } from '@salmonui/data-grid';\ntry { console.log(renderToString(createElement(DataGrid, { 'aria-label': 'P', data: [], columns: [{ field: 'id' }], paging: true }))); } catch (e) { console.log('threw: ' + e.message); }\n",
    );
    try {
      const child = spawnSync(process.execPath, ['-C', 'browser', probe], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'development' } });
      // Never a placeholder in server markup: with no boundary of its own the suspension reaches the root.
      assert.match(child.stdout, /^threw: /);
      assert.doesNotMatch(child.stdout, /aria-busy="true"/);
      assert.match(child.stderr, /lazy render feature registry was reached during a server render/);
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
