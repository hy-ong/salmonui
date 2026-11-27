import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createControlledDataSource, createJsonDataSource, createLiveDataSource, createOfflineDataSource } from '@salmonui/data';
import { createLocalDataSource, type DataSource } from '@salmonui/data-grid/engine';
import type { DataGridColumn } from '@salmonui/data-grid';
import { count, people, personColumns, render, type Person } from './fixtures.ts';

// SSR and hydration: useSyncExternalStore's getServerSnapshot
// returns what the server rendered (the engine's construction state), never
// the live state. react-dom/server reads getServerSnapshot, exactly like
// hydration does, so a data change that lands mid-render must not reach the
// markup rendered after it.

/** Columns whose first header template replaces the source rows once, mid-render. */
function changingColumns(change: () => void): DataGridColumn<Person>[] {
  let done = false;
  return personColumns.map((c, i) =>
    i === 0
      ? {
          ...c,
          renderHeader: () => {
            if (!done) {
              done = true;
              change();
            }
            return 'ID';
          },
        }
      : c,
  );
}

describe('hydration snapshots (getServerSnapshot)', () => {
  it('the tab stop stays where the server put it when rows change mid-render', () => {
    const source = createLocalDataSource<Person>(people(30), { getRowId: (p) => p.id });
    let changed = false;
    const html = render({
      rows: 0,
      data: source,
      columns: changingColumns(() => {
        changed = true;
        source.setRows([]);
      }),
    });
    assert.ok(changed, 'the source changed during the render');
    assert.equal(count(html, /tabindex="0"/), 1, 'exactly one tab stop');
    assert.match(html, /data-row-id="p0"[^>]*>(?:<div[^>]*>)*<div role="gridcell" aria-colindex="1" tabindex="0"/);
    assert.equal(count(html, /role="columnheader"[^>]*tabindex="0"/), 0);
    assert.match(html, />Person 0</, 'rows render from the state the grid was created with');
    assert.equal(count(html, /data-row-id="p\d+"/), 20);
  });
});

// Creating the grid happens during render (including renders React discards):
// data sources are subscribed, read, loaded and their user callbacks invoked
// only after mount, never while rendering.
describe('data sources during render', () => {
  it('controlled, offline, live, JSON and custom sources are not touched while rendering', () => {
    const calls = { onQueryChange: 0, load: 0, connect: 0, initialRead: 0, fetch: 0, read: 0, subscribe: 0 };
    const rows = people(30);
    const sources: DataSource<Person>[] = [
      createControlledDataSource<Person>({
        onQueryChange: (request) => {
          calls.onQueryChange++;
          return { version: request.version, rows, totalRowCount: rows.length };
        },
      }),
      createOfflineDataSource<Person>({
        load: async () => {
          calls.load++;
          return rows;
        },
      }),
      createLiveDataSource<Person>({
        initial: {
          mode: 'local',
          read: (request) => {
            calls.initialRead++;
            return { version: request.version, rows };
          },
        },
        getRowId: (p) => p.id,
        connect: () => {
          calls.connect++;
        },
      }),
      createJsonDataSource<Person>({
        url: '/api/people',
        key: 'id',
        fetch: () => {
          calls.fetch++;
          return new Promise(() => {});
        },
      }),
      {
        mode: 'remote',
        read: (request) => {
          calls.read++;
          return { version: request.version, rows };
        },
        subscribe: () => {
          calls.subscribe++;
          return () => {};
        },
      },
    ];
    for (const dataSource of sources) {
      const html = render({ rows: 0, data: dataSource });
      assert.match(html, /role="grid"/);
      assert.equal(count(html, /data-row-id=/), 0, `${dataSource.mode} source renders no rows on the server`);
    }
    assert.deepEqual(calls, { onQueryChange: 0, load: 0, connect: 0, initialRead: 0, fetch: 0, read: 0, subscribe: 0 });
  });

  it('remote and live sources render their loading state; local data still renders synchronously', () => {
    const remote: DataSource<Person> = { mode: 'remote', read: (request) => ({ version: request.version, rows: people(3) }) };
    assert.match(render({ rows: 0, data: remote }), /role="grid"[^>]*aria-busy="true"/);
    const local = render({ rows: 0, data: createLocalDataSource(people(25), { getRowId: (p) => p.id }) });
    assert.equal(count(local, /data-row-id="p\d+"/), 20);
    assert.doesNotMatch(local, /aria-busy/);
    assert.equal(render({ rows: 25 }), local, 'a local source renders exactly like the data prop');
  });
});
