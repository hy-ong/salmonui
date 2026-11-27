// Viewport methods of DataGridApi (view-api.ts): the row math of
// `getPageSizeForHeight`
// before mount (header and footer rows only; the browser test covers the
// toolbar and pager), and `scrollTo` without a viewport.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { people, personColumns, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function make(props: Partial<DataGridProps<Person>> = {}) {
  const instance = newInstance<Person>({ data: people(100), columns: personColumns, 'aria-label': 'People', ...props } as never, `:v${seq++}:`);
  const unmount = instance.mount();
  return { instance, api: instance.api, unmount };
}

describe('getPageSizeForHeight', () => {
  it('fits whole rows of the default 36 px rowHeight below the 40 px header', () => {
    const { api, unmount } = make();
    assert.equal(api.getPageSizeForHeight(400), 10); // (400 - 40) / 36
    assert.equal(api.getPageSizeForHeight(399), 9); // partial rows do not count
    assert.equal(api.getPageSizeForHeight(40 + 36), 1);
    unmount();
  });

  it('uses a fixed rowHeight and headerHeight', () => {
    const { api, unmount } = make({ rowHeight: 50, headerHeight: 30 });
    assert.equal(api.getPageSizeForHeight(530), 10); // (530 - 30) / 50
    assert.equal(api.getPageSizeForHeight(529), 9);
    unmount();
  });

  it('subtracts every header row (stacked headers, filter bar) and the footer aggregate rows', () => {
    const { instance, api, unmount } = make({ rowHeight: 40 });
    instance.layout.setHeaderRows(2);
    assert.equal(api.getPageSizeForHeight(400), 8); // (400 - 2 * 40) / 40
    instance.layout.setFooterRows(2);
    assert.equal(api.getPageSizeForHeight(400), 6); // (400 - 80 - 2 * 40) / 40
    unmount();
  });

  it('counts the estimated row height when rows are measured', () => {
    const { api, unmount } = make({ estimatedRowHeight: 60, rowHeight: 30 });
    assert.equal(api.getPageSizeForHeight(400), 6); // (400 - 40) / 60
    unmount();
  });

  it('returns 0 when no row fits', () => {
    const { api, unmount } = make();
    assert.equal(api.getPageSizeForHeight(40), 0);
    assert.equal(api.getPageSizeForHeight(75), 0);
    assert.equal(api.getPageSizeForHeight(0), 0);
    assert.equal(api.getPageSizeForHeight(-10), 0);
    unmount();
  });
});

describe('scrollTo', () => {
  it('is a no-op before mount (no viewport)', () => {
    const { api, unmount } = make();
    assert.doesNotThrow(() => api.scrollTo({ top: 500, left: 20 }));
    assert.doesNotThrow(() => api.scrollTo({}));
    unmount();
  });
});
