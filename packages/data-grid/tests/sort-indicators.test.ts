import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { count, render } from './fixtures.ts';

// sorting.indicators: 'always' renders the arrow pair on every sortable header.
describe('sorting.indicators', () => {
  it('default: only a sorted header carries an indicator', () => {
    assert.equal(count(render({ sorting: true }), /salmon-data-grid-sort-indicator"/g), 0);
    assert.equal(count(render({ sorting: { sortBy: [{ field: 'name', direction: 'asc' }] } }), /salmon-data-grid-sort-indicator"/g), 1);
    assert.equal(count(render({ sorting: { sortBy: [{ field: 'name', direction: 'asc' }] } }), /data-pair/g), 0);
  });

  it("'always': every sortable header shows the pair, the sorted one with its direction", () => {
    const html = render({ sorting: { indicators: 'always', sortBy: [{ field: 'name', direction: 'desc' }] } });
    const pairs = count(html, /data-pair=""/g);
    assert.equal(pairs, 5);
    assert.equal(count(html, /data-direction="desc"/g), 1);
    assert.equal(count(html, /data-direction="none"/g), 4);
  });
});
