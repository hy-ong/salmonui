// Pager filter status: the SSR
// markup of `filtering.showStatus` with an initial filter.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { render } from './fixtures.ts';

const STATUS = /<div class="salmon-data-grid-pager__filter-status" data-filter-status="">([^<]*)<\/div>/;

function statusOf(html: string): string | undefined {
  return STATUS.exec(html)?.[1]?.replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<');
}

describe('filtering.showStatus', () => {
  it('the pager shows the initial filters on the server; nested groups flatten; lists stop after five values', () => {
    const html = render({
      rows: 40,
      paging: { pageSize: 5 },
      filtering: {
        filters: [
          { field: 'name', operator: 'startsWith', value: 'Person 1' },
          { logic: 'or', filters: [{ field: 'age', operator: 'greaterThanOrEqual', value: 30 }, { field: 'active', operator: 'equal', value: true }] },
        ],
      },
    });
    assert.equal(statusOf(html), 'Filtered by Name: Starts with Person 1; Age: Greater than or equal 30; Active: Equal true');
    assert.match(html, /role="navigation"[^>]*>.*salmon-data-grid-pager__filter-status/s, 'inside the pager landmark');
    const list = render({ rows: 40, paging: true, filtering: { filters: [{ field: 'age', operator: 'in', value: [20, 21, 22, 23, 24, 25] }, { field: 'name', operator: 'isNotEmpty' }] } });
    assert.equal(statusOf(list), 'Filtered by Age: In 20, 21, 22, 23, 24, …; Name: Not empty');
  });

  it('absent with showStatus false, without filters, without a pager, and with the menu UIs', () => {
    const filters = [{ field: 'name', operator: 'contains', value: '1' }] as const;
    assert.equal(statusOf(render({ rows: 40, paging: true, filtering: { filters, showStatus: false } })), undefined, 'showStatus false');
    assert.equal(statusOf(render({ rows: 40, paging: true, filtering: true })), undefined, 'no filter');
    const noPager = render({ rows: 40, filtering: { filters } });
    assert.doesNotMatch(noPager, /salmon-data-grid-pager/, 'no pager, no status');
    assert.equal(statusOf(render({ rows: 40, paging: true, filtering: { ui: 'excel', filters } })), undefined, 'filter bar only');
  });

  it('reads its text from the catalog', () => {
    const html = render({
      rows: 40,
      paging: true,
      localeText: { filterStatus: 'Gefiltert nach {conditions}', operatorContains: 'Enthält', filterStatusSeparator: ' | ' },
      filtering: { filters: [{ field: 'name', operator: 'contains', value: '1' }, { field: 'age', operator: 'between', value: [20, 30] }] },
    });
    assert.equal(statusOf(html), 'Gefiltert nach Name: Enthält 1 | Age: Between 20 – 30');
  });
});
