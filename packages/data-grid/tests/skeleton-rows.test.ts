// `virtualization.skeletonRows`:
// rows that are not loaded yet render shimmer bars instead of the loading
// text, on the server too; on by default, `renderLoadingRow`
// wins.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import type { DataSourceResult, DataSource } from '@salmonui/data-grid/engine';
import { count, people, render, type Person } from './fixtures.ts';

const pending: DataSource<Person> = {
  mode: 'remote',
  read(): Promise<DataSourceResult<Person>> {
    return new Promise(() => {});
  },
};

// 10 seeded rows of 1,000: rows 10..19 of the 20-row initial range are placeholders.
const seeded = { blockSize: 100, initialResult: { rows: people(10), totalRowCount: 1_000 } };

describe('virtualization.skeletonRows', () => {
  it('renders skeleton rows with one bar per column and the loading text for assistive technology (default and explicit true)', () => {
    for (const virtualization of [undefined, true, { skeletonRows: true }] as const) {
    const html = render({ data: pending, infiniteScroll: seeded, ...(virtualization === undefined ? {} : { virtualization }) });
    assert.equal(count(html, /class="salmon-data-grid-row salmon-data-grid-loading-row salmon-data-grid-skeleton-row"/), 10);
    assert.match(html, /aria-busy="true"[^>]*class="salmon-data-grid-row salmon-data-grid-loading-row salmon-data-grid-skeleton-row"[^>]*data-row-id="__loading:10"/);
    // personColumns has 5 columns: 5 bars per row.
    assert.equal(count(html, /class="salmon-data-grid-skeleton-bar" aria-hidden="true"/), 50);
    assert.equal(count(html, /<span class="salmon-data-grid-visually-hidden">Loading<\/span>/), 10);
    // Loaded rows render as data rows.
    assert.match(html, /data-row-id="p9"/);
    assert.doesNotMatch(html, /data-row-id="p9"[^>]*salmon-data-grid-skeleton-row/);
    }
  });

  it('skeletonRows: false renders plain loading rows, no bars', () => {
    const html = render({ data: pending, infiniteScroll: seeded, virtualization: { skeletonRows: false } });
    assert.equal(count(html, /class="salmon-data-grid-row salmon-data-grid-loading-row"/), 10);
    assert.doesNotMatch(html, /salmon-data-grid-skeleton/);
  });

  it('the default path (no infinite scroll) renders no skeleton markup', () => {
    const html = render({ data: people(1_000) });
    assert.doesNotMatch(html, /salmon-data-grid-skeleton|salmon-data-grid-loading-row/);
  });

  it('renderLoadingRow wins over skeleton rows', () => {
    const html = render({
      data: pending,
      infiniteScroll: seeded,
      virtualization: { skeletonRows: true },
      renderLoadingRow: ({ rowIndex }: { rowIndex: number }) => createElement('em', null, `row ${rowIndex} pending`),
    } as never);
    assert.match(html, /<em>row 10 pending<\/em>/);
    assert.doesNotMatch(html, /salmon-data-grid-skeleton/);
  });
});
