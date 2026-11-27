// Grouping API and group events through the React layer, without a DOM:
// `DataGridInstance` + `mount()` wires
// the before/after command hooks the `<DataGrid>` component uses; the lazy
// caption row is rendered with react-dom/server inside the grid contexts of
// a mounted instance, so its markup reflects the live group status.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { DataSourceRequest, DataSourceResult, DataSource, GroupedRowEnvelope } from '@salmonui/data-grid/engine';
import type { DataGridColumn, DataGridGroupChangeEvent, DataGridGroupToggleEvent, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { DataGridInstanceContext, DataGridRenderContext } from '../dist/data-grid/context.js';
import { DataGridGroupCaptionRow } from '../dist/data-grid/Group.js';
import { people, personColumns, type Person, newInstance } from './fixtures.ts';

const FALSE_GROUP = '__g:[["active",false]]';
const TRUE_GROUP = '__g:[["active",true]]';

let seq = 0;
function make(props: Partial<DataGridProps<Person>> = {}): { instance: DataGridInstance<Person>; unmount: () => void } {
  const instance = newInstance<Person>(
    { data: people(10), columns: personColumns as DataGridColumn<Person>[], 'aria-label': 'People', grouping: { groupBy: ['active'] }, ...props } as never,
    `:ga${seq++}:`,
  );
  const unmount = instance.mount();
  return { instance, unmount };
}

const groupBy = (instance: DataGridInstance<Person>): string[] =>
  (instance.engine.getModuleState('grouping') as { grouping: readonly { columnId: string }[] }).grouping.map((g) => g.columnId);

describe('grouping API', () => {
  it('api.groupColumn(field, index) inserts at the index and api.clearGrouping() removes every level', () => {
    const changes: DataGridGroupChangeEvent[] = [];
    const { instance, unmount } = make({ onGroupChange: (e) => changes.push(e) });
    assert.deepEqual(groupBy(instance), ['active']);
    assert.equal(instance.api.groupColumn('age', 0).status, 'applied');
    assert.deepEqual(groupBy(instance), ['age', 'active']);
    assert.equal(instance.api.groupColumn('name').status, 'applied');
    assert.deepEqual(groupBy(instance), ['age', 'active', 'name'], 'without an index the column is appended');
    assert.equal(instance.api.clearGrouping().status, 'applied');
    assert.deepEqual(groupBy(instance), []);
    assert.equal((instance.engine as unknown as { getRowIdAt(i: number): string }).getRowIdAt(0), 'p0', 'flat rows again');
    assert.deepEqual(
      changes.map((e) => [e.action, e.field, [...e.previousGroupBy], [...e.groupBy], e.source]),
      [
        ['group', 'age', ['active'], ['age', 'active'], 'api'],
        ['group', 'name', ['age', 'active'], ['age', 'active', 'name'], 'api'],
        ['clear', null, ['age', 'active', 'name'], [], 'api'],
      ],
    );
    unmount();
  });

  it('api.collapseAllGroups() / api.expandAllGroups() set every group and report each visible caption', () => {
    const toggles: DataGridGroupToggleEvent<Person>[] = [];
    const { instance, unmount } = make({ onGroupToggle: (e) => toggles.push(e) });
    const expanded = (id: string): boolean | undefined => instance.api.getGroup(id)?.expanded;
    assert.equal(expanded(FALSE_GROUP), true);
    assert.equal(instance.api.collapseAllGroups().status, 'applied');
    assert.equal(expanded(FALSE_GROUP), false);
    assert.equal(expanded(TRUE_GROUP), false);
    assert.equal(instance.engine.getSnapshot().rows.count, 2, 'only the two captions remain');
    assert.deepEqual(toggles.map((e) => [e.groupId, e.expanded]).sort(), [[FALSE_GROUP, false], [TRUE_GROUP, false]]);
    toggles.length = 0;
    assert.equal(instance.api.expandAllGroups().status, 'applied');
    assert.equal(expanded(FALSE_GROUP), true);
    assert.equal(expanded(TRUE_GROUP), true);
    assert.equal(instance.engine.getSnapshot().rows.count, 12);
    assert.deepEqual(toggles.map((e) => [e.groupId, e.expanded]).sort(), [[FALSE_GROUP, true], [TRUE_GROUP, true]]);
    unmount();
  });
});

describe('group toggle events', () => {
  it('onBeforeGroupToggle preventDefault() cancels api.toggleGroup; onGroupToggle reports path, key, lazy and rows()', () => {
    const before: DataGridGroupToggleEvent<Person>[] = [];
    const after: DataGridGroupToggleEvent<Person>[] = [];
    let cancel = true;
    const { instance, unmount } = make({
      onBeforeGroupToggle: (e) => {
        before.push(e);
        if (cancel) e.preventDefault();
      },
      onGroupToggle: (e) => after.push(e),
    });
    assert.notEqual(instance.api.toggleGroup(FALSE_GROUP).status, 'applied');
    assert.equal(instance.api.getGroup(FALSE_GROUP)?.expanded, true, 'the cancelled toggle left the group expanded');
    assert.equal(before.length, 1);
    assert.equal(before[0]?.type, 'beforeGroupToggle');
    assert.equal(before[0]?.expanded, false, 'the before-event proposes the new state');
    assert.equal(before[0]?.defaultPrevented, true);
    assert.equal(after.length, 0, 'no after-event for a cancelled toggle');

    cancel = false;
    assert.equal(instance.api.toggleGroup([{ columnId: 'active', key: false }]).status, 'applied');
    assert.equal(instance.api.getGroup(FALSE_GROUP)?.expanded, false);
    assert.equal(before.length, 2, 'a path target reaches onBeforeGroupToggle too');
    assert.equal(before[1]?.groupId, FALSE_GROUP);
    assert.equal(after.length, 1);
    const e = after[0] as DataGridGroupToggleEvent<Person>;
    assert.equal(e.type, 'groupToggle');
    assert.equal(e.source, 'api');
    assert.equal(e.groupId, FALSE_GROUP);
    assert.deepEqual(e.path, [{ columnId: 'active', key: false }]);
    assert.equal(e.key, false);
    assert.equal(e.expanded, false);
    assert.equal(e.lazy, false);
    assert.deepEqual(
      e.rows().map((r) => r.id),
      ['p1', 'p3', 'p5', 'p7', 'p9'],
    );
    unmount();
  });
});

describe('group change events', () => {
  it('onBeforeGroupChange preventDefault() cancels; onGroupChange reports previousGroupBy and the ungroup / move / clear actions', () => {
    const before: DataGridGroupChangeEvent[] = [];
    const after: DataGridGroupChangeEvent[] = [];
    let cancel = true;
    const { instance, unmount } = make({
      grouping: { groupBy: ['active', 'age'] },
      onBeforeGroupChange: (e) => {
        before.push(e);
        if (cancel) e.preventDefault();
      },
      onGroupChange: (e) => after.push(e),
    });
    assert.notEqual(instance.api.ungroupColumn('age').status, 'applied');
    assert.deepEqual(groupBy(instance), ['active', 'age'], 'the cancelled ungroup changed nothing');
    assert.deepEqual([before[0]?.action, before[0]?.field, [...(before[0]?.groupBy ?? [])], [...(before[0]?.previousGroupBy ?? [])]], ['ungroup', 'age', ['active'], ['active', 'age']]);
    assert.equal(after.length, 0);

    cancel = false;
    assert.equal(instance.dispatchFrom('pointer', { type: 'grouping.move', columnId: 'age', toIndex: 0 }).status, 'applied');
    assert.deepEqual(groupBy(instance), ['age', 'active']);
    assert.equal(instance.api.ungroupColumn('active').status, 'applied');
    assert.deepEqual(groupBy(instance), ['age']);
    assert.equal(instance.api.clearGrouping().status, 'applied');
    assert.deepEqual(groupBy(instance), []);
    assert.deepEqual(
      after.map((e) => [e.type, e.action, e.field, [...e.previousGroupBy], [...e.groupBy], e.source]),
      [
        ['groupChange', 'move', 'age', ['active', 'age'], ['age', 'active'], 'pointer'],
        ['groupChange', 'ungroup', 'active', ['age', 'active'], ['age'], 'api'],
        ['groupChange', 'clear', null, ['age'], [], 'api'],
      ],
    );
    assert.deepEqual(
      before.slice(1).map((e) => [e.type, e.action]),
      [
        ['beforeGroupChange', 'move'],
        ['beforeGroupChange', 'ungroup'],
        ['beforeGroupChange', 'clear'],
      ],
    );
    unmount();
  });

  it('onGroupChange fires when the grouping change dispatches nested commands (a selected cell range)', () => {
    const after: DataGridGroupChangeEvent[] = [];
    const { instance, unmount } = make({ grouping: { groupBy: [] }, selection: { mode: 'cell', multiple: true }, onGroupChange: (e) => after.push(e) });
    assert.equal(instance.api.selectCellRange({ rowId: 'p0', field: 'name' }, { rowId: 'p2', field: 'age' }).status, 'applied');
    assert.equal(instance.api.groupColumn('active').status, 'applied');
    assert.deepEqual(groupBy(instance), ['active']);
    assert.equal(instance.api.ungroupColumn('active').status, 'applied');
    assert.deepEqual(
      after.map((e) => [e.action, e.field, [...e.groupBy]]),
      [
        ['group', 'active', ['active']],
        ['ungroup', 'active', []],
      ],
    );
    unmount();
  });
});

// ---------------------------------------------------------------------------
// lazy group caption status and Retry
// ---------------------------------------------------------------------------

/** Remote lazy-group source: the root level answers at once; child loads wait for `respond`. */
function lazySource(rows: readonly Person[]) {
  const pending: { request: DataSourceRequest; resolve: (r: DataSourceResult<Person>) => void; reject: (e: unknown) => void }[] = [];
  const source: DataSource<Person> = {
    mode: 'remote',
    capabilities: { lazyGroups: true },
    read(request) {
      const path = request.groupPath;
      if (path && path.length === 0) {
        const envelopes: GroupedRowEnvelope<Person>[] = [false, true].map((key) => ({
          kind: 'group',
          key,
          columnId: 'active',
          groupPath: [{ columnId: 'active', key }],
          count: rows.filter((r) => r.active === key).length,
        }));
        return { version: request.version, rows: envelopes as unknown as Person[], totalRowCount: 2, performed: ['search', 'filter', 'sort', 'group', 'aggregate', 'page'] };
      }
      return new Promise((resolve, reject) => pending.push({ request, resolve, reject }));
    },
  };
  const respond = (ok: boolean): void => {
    const next = pending.shift();
    assert.ok(next, 'a child load is pending');
    if (!ok) {
      next.reject(new Error('offline'));
      return;
    }
    const key = next.request.groupPath?.[0]?.key;
    const children = rows.filter((r) => r.active === key);
    next.resolve({ version: next.request.version, rows: children, totalRowCount: children.length, performed: ['search', 'filter', 'sort', 'group', 'aggregate', 'page'] });
  };
  return { source, respond, pending };
}

async function idle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

/** The caption row of a mounted instance, rendered inside the grid contexts (live, not the server snapshot). */
function renderCaption(instance: DataGridInstance<Person>, rowId: string): string {
  const render = {
    text: instance.text,
    headerRows: 1,
    resizable: false,
    reorderable: false,
    filterBar: false,
    frozenTop: 0,
    frozenBottom: 0,
    cellRangeBorder: false,
    headerGroupToggle: false,
    sortIndicators: false,
    searchHighlight: null,
  };
  const element: ReactElement = createElement(
    DataGridInstanceContext,
    { value: instance as never },
    createElement(DataGridRenderContext, { value: render as never }, createElement(DataGridGroupCaptionRow, { rowId, rowIndex: 0, view: instance.layout.getColumnView() as never })),
  );
  return renderToString(element);
}

describe('lazy group caption status', () => {
  it('a loading group caption carries data-status="loading" and a status message; a failed load shows Retry, and retry reloads', async () => {
    const data = people(6);
    const { source, respond, pending } = lazySource(data);
    const toggles: DataGridGroupToggleEvent<Person>[] = [];
    const { instance, unmount } = make({ data: source, grouping: { groupBy: ['active'], lazy: true }, onGroupToggle: (e) => toggles.push(e) });
    await idle();
    assert.equal(instance.api.getGroup(FALSE_GROUP)?.status, 'idle', 'collapsed lazy groups have not loaded their children');
    const idleCaption = renderCaption(instance, FALSE_GROUP);
    assert.match(idleCaption, /data-status="idle"/);
    assert.doesNotMatch(idleCaption, /salmon-data-grid-group-caption__status/);

    assert.equal(instance.api.toggleGroup(FALSE_GROUP).status, 'applied');
    assert.equal(toggles.at(-1)?.lazy, true, 'onGroupToggle reports lazy mode');
    assert.equal(pending.length, 1);
    assert.equal(instance.api.getGroup(FALSE_GROUP)?.status, 'loading');
    const loading = renderCaption(instance, FALSE_GROUP);
    assert.match(loading, /class="salmon-data-grid-row salmon-data-grid-group-caption"[^>]*data-status="loading"/);
    assert.match(loading, /<span class="salmon-data-grid-group-caption__status" role="status">[^<]+<\/span>/);
    assert.doesNotMatch(loading, /salmon-data-grid-group-caption__retry/);

    respond(false);
    await idle();
    assert.equal(instance.api.getGroup(FALSE_GROUP)?.status, 'error');
    const failed = renderCaption(instance, FALSE_GROUP);
    assert.match(failed, /data-status="error"/);
    assert.match(failed, /<span class="salmon-data-grid-group-caption__status" data-error="">[^<]+(?:<!-- -->[^<]*)?<button type="button" class="salmon-data-grid-group-caption__retry" tabindex="-1">Retry<\/button><\/span>/);

    // The Retry button dispatches `grouping.retry` for its group (Group.tsx onClick).
    assert.equal(instance.dispatchFrom('pointer', { type: 'grouping.retry', group: FALSE_GROUP }).status, 'applied');
    assert.equal(instance.api.getGroup(FALSE_GROUP)?.status, 'loading');
    respond(true);
    await idle();
    assert.equal(instance.api.getGroup(FALSE_GROUP)?.status, 'ready');
    assert.doesNotMatch(renderCaption(instance, FALSE_GROUP), /data-status=|salmon-data-grid-group-caption__retry/);
    const ids = Array.from({ length: instance.engine.getSnapshot().rows.count }, (_, i) => (instance.engine as unknown as { getRowIdAt(i: number): string }).getRowIdAt(i));
    assert.deepEqual(ids, [FALSE_GROUP, 'p1', 'p3', 'p5', TRUE_GROUP]);
    unmount();
  });
});
