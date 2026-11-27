// `search` and `toolbar` render features: detection, the SSR markup through
// the static registry (initial search-filtered rows, the toolbar), the inert parts and
// selectors of a grid without them, and the client late enable of the
// toolbar.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { search, toolbar } from '@salmonui/data-grid/features';
import { requiredFeatures } from '../dist/data-grid/features/detect.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, newInstance, people, personColumns, render, type Person } from './fixtures.ts';

describe('search and toolbar detection', () => {
  it('requires search when the prop is set, never for false or absent', () => {
    assert.deepEqual(requiredFeatures({ search: false } as never), []);
    assert.deepEqual(requiredFeatures({ search: true } as never), ['search']);
    assert.deepEqual(requiredFeatures({ search: { text: 'x' } } as never), ['search']);
  });

  it('requires the toolbar for at least one item or a renderToolbar', () => {
    assert.deepEqual(requiredFeatures({ toolbar: [] } as never), []);
    assert.deepEqual(requiredFeatures({ toolbar: ['print'] } as never), ['toolbar']);
    assert.deepEqual(requiredFeatures({ renderToolbar: () => null } as never), ['toolbar']);
    assert.deepEqual(requiredFeatures({ toolbar: ['search'], search: true, paging: true } as never), ['paging', 'search', 'toolbar']);
  });
});

describe('search render feature (static registry, SSR)', () => {
  it('filters the initial rows in the server markup', () => {
    const html = render({ rows: 50, search: { text: 'Person 1' } });
    // Person 1, 10..19: 11 rows plus the header row.
    assert.equal(count(html, /role="row" aria-rowindex/), 1 + 11);
    assert.doesNotMatch(html, /aria-busy="true"/);
    assert.match(html, /role="grid"[^>]*data-salmon-pending=""/);
  });

  it('highlights the matches in the server markup with search.highlight', () => {
    const html = render({ rows: 20, search: { text: 'Person 1', highlight: true } });
    assert.match(html, /<mark class="salmon-data-grid-search-mark">Person 1<\/mark>/);
  });

  it('the features prop removes the gate: the same markup without the pending mark', () => {
    const props = { rows: 30, search: { text: 'Person 2' } };
    assert.equal(render({ ...props, features: [search] }), render(props).replace(' data-salmon-pending=""', ''));
  });

  it('an instance without the feature registers no search module and its highlighter is inert', () => {
    const instance = newInstance<Person>({ data: people(5), columns: personColumns, search: { text: 'Person 1' } }, ':srch1:');
    assert.equal(instance.engine.getSnapshot().rows.count, 1);
    assert.equal(instance.query.searchState()?.text, 'Person 1');
    const bare = new DataGridInstance<Person>({ data: people(5), columns: personColumns, search: { text: 'Person 1' } } as never, ':srch2:');
    assert.equal(bare.query.searchState(), undefined);
    assert.equal(bare.engine.getSnapshot().rows.count, 5);
    assert.equal(bare.features.selectors.searchHighlighter({} as never, {} as never), null);
  });
});

describe('toolbar render feature (static registry, SSR)', () => {
  it('renders the toolbar and its search box on the server', () => {
    const html = render({ rows: 5, toolbar: ['print', 'search'], search: true });
    assert.match(html, /role="toolbar"/);
    assert.match(html, /role="search"/);
    assert.ok(html.indexOf('role="toolbar"') < html.indexOf('role="grid"'), 'the toolbar is the previous sibling of the grid');
    assert.doesNotMatch(html, /aria-busy="true"/);
  });

  it('renderToolbar alone requires the feature', () => {
    const html = render({ rows: 5, renderToolbar: ({ defaultToolbar }) => defaultToolbar });
    assert.match(html, /role="toolbar"/);
  });

  it('no toolbar without its trigger, even when the feature is provided', () => {
    assert.equal(render({ rows: 5, features: [toolbar] }), render({ rows: 5 }));
    assert.doesNotMatch(render({ rows: 5, toolbar: [] }), /role="toolbar"/);
  });
});

describe('toolbar late enable', () => {
  const quiet = <T>(fn: (warnings: string[]) => T): T => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
    try {
      return fn(warnings);
    } finally {
      console.warn = original;
    }
  };

  it('installs the toolbar when its trigger turns on after creation, notifies the view once and never warns', () => {
    quiet((warnings) => {
      const props = { data: people(5), columns: personColumns, 'aria-label': 'P' };
      const instance = newInstance<Person>(props, ':late1:');
      assert.equal(instance.getToolbarPart(), null);
      let notified = 0;
      instance.subscribeColumnRender(() => notified++);
      const version = instance.getColumnRenderVersion();
      instance.syncProps({ ...props, toolbar: ['print'] } as never);
      // The server registry answers synchronously; the browser one installs when the chunk arrives.
      assert.equal(notified, 1);
      assert.ok(instance.getToolbarPart());
      assert.equal(instance.getServerToolbarPart(), null, 'the server snapshot stays the creation part');
      assert.equal(instance.getColumnRenderVersion(), version + 1, 'headers and cells re-render once');
      // Later syncs do not reinstall it; turning it off keeps it loaded.
      instance.syncProps({ ...props, toolbar: [] } as never);
      instance.syncProps({ ...props, toolbar: ['print', 'add'] } as never);
      assert.equal(notified, 1);
      assert.ok(!warnings.some((w) => w.includes('"toolbar" feature was turned on after')), warnings.join('\n'));
    });
  });

  it('creation-only features still warn when turned on later', () => {
    quiet((warnings) => {
      const props = { data: people(5), columns: personColumns, 'aria-label': 'P', id: 'late-search-grid' };
      const instance = newInstance<Person>(props, ':late2:');
      instance.syncProps({ ...props, search: true } as never);
      assert.equal(instance.query.searchState(), undefined);
      assert.ok(warnings.some((w) => w.includes('"search" feature was turned on after')), warnings.join('\n'));
    });
  });
});
