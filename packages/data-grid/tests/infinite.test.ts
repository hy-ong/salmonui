// `infiniteScroll` on the server: a remote source
// is never read while rendering; the server renders one loading row, or the
// seeded first blocks (`initialResult`) with the full row count.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import type { DataSourceRequest, DataSourceResult, DataSource } from '@salmonui/data-grid/engine';
import { count, people, render, type Person } from './fixtures.ts';

function remote(): { source: DataSource<Person>; reads: DataSourceRequest[] } {
  const reads: DataSourceRequest[] = [];
  return {
    reads,
    source: {
      mode: 'remote',
      read(request): Promise<DataSourceResult<Person>> {
        reads.push(request);
        return new Promise(() => {});
      },
    },
  };
}

describe('infiniteScroll during server rendering', () => {
  it('renders one loading row and reads nothing', () => {
    const r = remote();
    const html = render({ data: r.source, infiniteScroll: true });
    assert.equal(r.reads.length, 0);
    // A skeleton row by default (`virtualization.skeletonRows`).
    assert.equal(count(html, /class="salmon-data-grid-row salmon-data-grid-loading-row salmon-data-grid-skeleton-row"/), 1);
    assert.match(html, /aria-busy="true"[^>]*class="salmon-data-grid-row salmon-data-grid-loading-row salmon-data-grid-skeleton-row"[^>]*data-row-id="__loading:0"/);
    assert.match(html, />Loading</);
    assert.doesNotMatch(html, /salmon-data-grid-empty/, 'not the empty state');
  });

  it('renders the seeded first blocks with the full row count', () => {
    const r = remote();
    const rows = people(300);
    const html = render({ data: r.source, infiniteScroll: { blockSize: 100, initialResult: { rows, totalRowCount: 50_000 } } });
    assert.equal(r.reads.length, 0);
    assert.match(html, /aria-rowcount="50001"/);
    assert.equal(count(html, /data-row-id="p\d+"/), 20, 'the initial range of the seeded rows');
    assert.match(html, /class="salmon-data-grid-body" style="height:1800000px"/, 'scroll height of the known total');
    const again = render({ data: r.source, infiniteScroll: { blockSize: 100, initialResult: { rows, totalRowCount: 50_000 } } });
    assert.equal(html, again, 'deterministic');
  });

  it('custom loading row content (renderLoadingRow)', () => {
    const r = remote();
    const html = render({
      data: r.source,
      infiniteScroll: true,
      renderLoadingRow: ({ rowIndex, status }) => createElement('em', null, `${status} ${rowIndex}`),
    });
    assert.match(html, /<em>loading 0<\/em>/);
  });

  it('local data is unchanged (every row is already loaded)', () => {
    const html = render({ rows: 100, infiniteScroll: { cache: true } });
    assert.match(html, /aria-rowcount="101"/);
    assert.equal(count(html, /salmon-data-grid-loading-row/), 0);
  });
});
