import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, people, personColumns, render, type Person, newInstance } from './fixtures.ts';

// DataGrid height, row virtualization switches and row height on the server and
// in the instance. Browser counterparts:
// tests/browser/virtualization-gaps.spec.ts.

const rowsIn = (html: string) => count(html, /role="row" aria-rowindex="\d+" class="salmon-data-grid-row" data-row-id=/);
const viewportStyle = (html: string) => /class="salmon-data-grid-viewport"( style="[^"]*")?/.exec(html)?.[1] ?? '';

describe('grid height and row virtualization on the server', () => {
  it("height 'auto' renders every row, not the initial range", () => {
    const html = render({ rows: 600, height: 'auto' });
    assert.equal(rowsIn(html), 600);
    assert.match(html, /data-row-id="p599"/);
    assert.match(html, /role="grid"[^>]*data-auto-height=""/);
    assert.equal(viewportStyle(html), '', 'no fixed viewport height');
  });

  it('the default height is 400 px and rows are virtualized to the initial range', () => {
    const html = render({ rows: 600 });
    assert.equal(viewportStyle(html), ' style="height:400px"');
    assert.doesNotMatch(html, /data-auto-height/);
    assert.equal(rowsIn(html), 20);
    assert.equal(viewportStyle(render({ rows: 10, height: 250 })), ' style="height:250px"');
    assert.equal(viewportStyle(render({ rows: 10, height: '50vh' })), ' style="height:50vh"');
  });

  it('virtualization={false} renders every row and every column at the default height', () => {
    const columns: DataGridColumn<Person>[] = [...personColumns];
    for (let i = 0; i < 40; i++) columns.push({ id: `x${i}`, field: 'name', header: `Extra ${i}`, width: 120 });
    const html = render({ rows: 300, columns, virtualization: false });
    assert.equal(rowsIn(html), 300);
    assert.equal(count(html, /role="gridcell"/), 300 * columns.length);
    assert.equal(viewportStyle(html), ' style="height:400px"');
    // Rows only: columns stay virtualized to the initial range.
    const rowsOnly = render({ rows: 300, columns, virtualization: { rows: false } });
    assert.equal(rowsIn(rowsOnly), 300);
    assert.ok(count(rowsOnly, /role="gridcell"/) < 300 * columns.length);
  });

  it("height '100%' sizes the root from the parent and lets the viewport fill it", () => {
    const html = render({ rows: 1000, height: '100%' });
    assert.match(html, /role="grid"[^>]*style="[^"]*height:100%/);
    assert.equal(viewportStyle(html), ' style="flex:1 1 0;min-height:0"');
    assert.equal(rowsIn(html), 20, 'still row-virtualized');
  });

  it('a non-default rowHeight sizes rows and the scroll height', () => {
    const html = render({ rows: 1000, rowHeight: 24 });
    assert.match(html, /--salmon-data-grid-row-height:24px/);
    assert.match(html, /class="salmon-data-grid-body" style="height:24000px"/);
    assert.match(render({ rows: 1000 }), /class="salmon-data-grid-body" style="height:36000px"/);
  });
});

describe("height 'auto' development warning", () => {
  function mountWarnings(props: Partial<DataGridProps<Person>>, id: string): string[] {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    try {
      const instance = newInstance<Person>({ 'aria-label': 'People', columns: personColumns, ...props } as never, id);
      instance.syncProps({ 'aria-label': 'People', columns: personColumns, ...props } as never);
      const teardown = instance.mount();
      teardown();
    } finally {
      console.warn = original;
    }
    return warnings.filter((w) => w.includes('height="auto"'));
  }

  it('warns once above 500 rows, not at 500 or with a fixed height', () => {
    const above = mountWarnings({ data: people(501), height: 'auto' }, ':auto-a:');
    assert.equal(above.length, 1);
    assert.match(above[0] as string, /renders every row \(501\); give the grid a height to enable row virtualization/);
    assert.deepEqual(mountWarnings({ data: people(500), height: 'auto' }, ':auto-b:'), []);
    assert.deepEqual(mountWarnings({ data: people(5000), height: 400 }, ':auto-c:'), []);
    assert.deepEqual(mountWarnings({ data: people(5000) }, ':auto-d:'), []);
  });
});
