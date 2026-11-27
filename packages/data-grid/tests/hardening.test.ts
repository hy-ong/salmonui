import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridColumn } from '@salmonui/data-grid';
import { ColumnResolver } from '../dist/data-grid/children.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, people, personColumns, render, type Person, newInstance } from './fixtures.ts';

// Hardening regressions that need no DOM (the browser halves live in
// tests/browser/hardening.spec.ts).

const same = (c: DataGridColumn<unknown>) => c;

describe('render-only column fields', () => {
  it('a render field change keeps the engine definition and reports the column; other fields recompile', () => {
    const resolver = new ColumnResolver();
    const a = resolver.resolve([{ field: 'name', cellClassName: 'a' }, { field: 'age' }], same);
    assert.deepEqual(a.renderChanged, [], 'first resolve reports nothing');
    const b = resolver.resolve([{ field: 'name', cellClassName: 'b', renderCell: () => 'x' }, { field: 'age' }], same);
    assert.equal(b.columns, a.columns, 'no recompile: the same definitions array');
    assert.equal((b.columns[0] as DataGridColumn<unknown>).cellClassName, 'b', 'the stable definition carries the latest render field');
    assert.deepEqual(b.renderChanged, ['name']);
    const c = resolver.resolve([{ field: 'name', cellClassName: 'b', renderCell: (b.columns[0] as DataGridColumn<unknown>).renderCell! }, { field: 'age' }], same);
    assert.deepEqual(c.renderChanged, [], 'equal render fields report nothing');
    // An inline valueGetter still recompiles that column (compared by identity).
    const d = resolver.resolve([{ field: 'name', cellClassName: 'b', valueGetter: () => 1 }, { field: 'age' }], same);
    assert.notEqual(d.columns[0], a.columns[0]);
    assert.equal(d.columns[1], a.columns[1]);
  });

  it('syncProps bumps the column render store without an engine recompile', () => {
    const data = people(3);
    const columns: DataGridColumn<Person>[] = [{ field: 'id', primaryKey: true }, { field: 'name', cellClassName: 'a' }];
    const instance = newInstance<Person>({ data, columns } as never, ':h1:');
    const compiled = instance.engine.getSnapshot().columns.byId.get('name');
    let notified = 0;
    instance.subscribeColumnRender(() => notified++);
    assert.equal(instance.renderKeyOf('name'), undefined, 'the default path has no keys');
    instance.syncProps({ data, columns: [columns[0]!, { field: 'name', cellClassName: 'b' }] } as never);
    assert.equal(notified, 1);
    assert.equal(instance.engine.getSnapshot().columns.byId.get('name'), compiled, 'not recompiled');
    assert.equal(typeof instance.renderKeyOf('name'), 'number');
    assert.equal(instance.renderKeyOf('id'), undefined, 'other columns keep their key');
  });
});

describe('pinned zones carry data-frozen-edge', () => {
  it('header, body, filter bar and aggregate footer rows mark both edges', () => {
    const columns = personColumns.map((c) => (c.field === 'joined' ? { ...c, pinned: 'end' as const } : c));
    const html = render({ columns, filtering: { ui: 'row' }, aggregates: [{ columns: [{ field: 'age', type: 'sum' }] }], rows: 5 });
    const rows = html.split('role="row"').slice(1);
    assert.ok(rows.length >= 8, 'header, filter bar, five data rows and the footer row');
    for (const row of rows) {
      assert.equal(count(row, /salmon-data-grid-pin--left" data-frozen-edge="start"/), 1, row.slice(0, 120));
      assert.equal(count(row, /salmon-data-grid-pin--right" data-frozen-edge="end"/), 1, row.slice(0, 120));
    }
    assert.equal(count(html, /class="salmon-data-grid-pin salmon-data-grid-pin--(left|right)">/), 0, 'no pinned zone without the edge attribute');
  });
});

describe('span-edge warning is not raised during render (pure renders)', () => {
  it('spanPlans reports clamped columns; warnSpanEdges warns once per column', () => {
    const columns: DataGridColumn<Person>[] = [{ field: 'id', primaryKey: true, pinned: 'start', colSpan: () => 3 }, { field: 'name', pinned: 'start' }, { field: 'age', colSpan: () => 5 }];
    const instance = newInstance<Person>({ id: 'span-pure', data: people(1), columns } as never, ':h2:');
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(' '));
    try {
      const view = instance.layout.getColumnView();
      const row = instance.engine.getRow('p0')!;
      const plans = instance.spanPlans(row, 'p0', 0, view);
      assert.deepEqual(plans?.clamped, ['id', 'age']);
      assert.deepEqual(warnings, [], 'planning never warns');
      instance.warnSpanEdges(plans!.clamped!);
      instance.warnSpanEdges(plans!.clamped!);
      assert.equal(warnings.length, 2);
      assert.match(warnings[0]!, /span-pure.*colSpan of column "id".*clamped\./);
    } finally {
      console.warn = original;
    }
  });
});

describe('filter menu open events', () => {
  it('onBeforeFilterMenuOpen gets field, ui and dialog and can cancel the opening', () => {
    const seen: { type: string; field: string; ui: string; dialog: string; source: string }[] = [];
    let cancel = true;
    const instance = newInstance<Person>(
      {
        data: people(3),
        columns: personColumns,
        filtering: { ui: 'excel' },
        onBeforeFilterMenuOpen: (e: { type: string; field: string; ui: string; dialog: string; source: string; preventDefault(): void }) => {
          seen.push({ type: e.type, field: e.field, ui: e.ui, dialog: e.dialog, source: e.source });
          if (cancel) e.preventDefault();
        },
      } as never,
      ':h3:',
    );
    instance.root = { closest: () => ({}), ownerDocument: { activeElement: null, body: {} }, contains: () => false, querySelector: () => null } as never;
    const anchorEl = { closest: () => null, getBoundingClientRect: () => ({ left: 1, top: 2, width: 3, height: 4 }) } as never;
    assert.equal(instance.chrome.openFilterMenu('name', 'keyboard', anchorEl), false);
    assert.equal(instance.chrome.isOpen(), false, 'prevented: the menu stays closed');
    cancel = false;
    assert.equal(instance.chrome.openFilterMenu('name', 'keyboard', anchorEl), true);
    assert.equal(instance.chrome.getOverlay()?.kind, 'filterMenu');
    assert.deepEqual(seen, [
      { type: 'beforeFilterMenuOpen', field: 'name', ui: 'excel', dialog: 'menu', source: 'keyboard' },
      { type: 'beforeFilterMenuOpen', field: 'name', ui: 'excel', dialog: 'menu', source: 'keyboard' },
    ]);
  });

  it("reports each dialog's ui, cancels the custom-condition section (dialog 'custom') and raises onFilterMenuOpen after opening", () => {
    type Seen = { type: string; field: string; ui: string; dialog: string; source: string };
    const seen: Seen[] = [];
    let cancel: string | null = null;
    const record = (e: Seen & { preventDefault(): void }) => {
      seen.push({ type: e.type, field: e.field, ui: e.ui, dialog: e.dialog, source: e.source });
      if (cancel === e.dialog) e.preventDefault();
    };
    const columns = personColumns.map((c) => (c.field === 'age' ? { ...c, filter: { ui: 'checklist' as const } } : c));
    const instance = newInstance<Person>(
      { data: people(3), columns, filtering: { ui: 'row' }, onBeforeFilterMenuOpen: record, onFilterMenuOpen: record } as never,
      ':h4:',
    );
    instance.root = { closest: () => ({}), ownerDocument: { activeElement: null, body: {} }, contains: () => false, querySelector: () => null } as never;
    const anchorEl = { closest: () => null, getBoundingClientRect: () => ({ left: 1, top: 2, width: 3, height: 4 }) } as never;
    const chrome = instance.chrome;
    // A filter row column opened from a menu shows the operator menu ('menu'); a column-level ui wins.
    assert.equal(chrome.openFilterMenu('name', 'api', anchorEl), true);
    chrome.filterMenuOpened('name', 'menu', 'api');
    chrome.close(false, 'api');
    assert.equal(chrome.openFilterMenu('age', 'pointer', anchorEl), true);
    chrome.filterMenuOpened('age', 'menu', 'pointer');
    // The custom-condition section: cancelled, then allowed.
    cancel = 'custom';
    assert.equal(chrome.beforeFilterMenuOpen('age', 'custom', 'pointer'), false);
    assert.equal(chrome.getOverlay()?.kind, 'filterMenu', 'cancelling the section keeps the menu open');
    cancel = null;
    assert.equal(chrome.beforeFilterMenuOpen('age', 'custom', 'pointer'), true);
    chrome.filterMenuOpened('age', 'custom', 'pointer');
    assert.deepEqual(seen, [
      { type: 'beforeFilterMenuOpen', field: 'name', ui: 'menu', dialog: 'menu', source: 'api' },
      { type: 'filterMenuOpen', field: 'name', ui: 'menu', dialog: 'menu', source: 'api' },
      { type: 'beforeFilterMenuOpen', field: 'age', ui: 'checklist', dialog: 'menu', source: 'pointer' },
      { type: 'filterMenuOpen', field: 'age', ui: 'checklist', dialog: 'menu', source: 'pointer' },
      { type: 'beforeFilterMenuOpen', field: 'age', ui: 'checklist', dialog: 'custom', source: 'pointer' },
      { type: 'beforeFilterMenuOpen', field: 'age', ui: 'checklist', dialog: 'custom', source: 'pointer' },
      { type: 'filterMenuOpen', field: 'age', ui: 'checklist', dialog: 'custom', source: 'pointer' },
    ]);
    // A column that cannot be filtered raises nothing.
    assert.equal(chrome.openFilterMenu('missing', 'api', anchorEl), false);
    assert.equal(seen.length, 7);
  });
});
