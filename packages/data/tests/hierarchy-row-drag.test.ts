// Hierarchy grids over the JSON protocol: child grids read through createJsonDataSource
// with the relation sent as a wire `where` condition, and row
// reorder persisted as `changed` order values that the reference handler
// stores, so a re-read returns the new order.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFilterModule,
  createDataGridEngine,
  createSortModule,
  type DataGridOptions,
  type RowDragDropState,
} from '@salmonui/data-grid/engine';
import { createDetailModule } from '@salmonui/data-grid/engine/expansion';
import { createHierarchyModule } from '@salmonui/data-grid/engine/hierarchy';
import { createRowDragDropModule } from '@salmonui/data-grid/engine/row-drag-drop';
import { createJsonDataSource, type JsonTransport, type WireReadRequest, type WireWriteRequest } from '@salmonui/data';
import { createJsonQueryHandler } from '@salmonui/data/server';
import { ORDER_FIELDS, orderServer, orders, type Order } from './helpers.ts';

async function idle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

function recording(handle: (req: unknown) => unknown): { transport: JsonTransport; sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    transport: async (req) => {
      sent.push(JSON.parse(JSON.stringify(req)));
      return JSON.parse(JSON.stringify(handle(req)));
    },
  };
}

const ids = (engine: { getSnapshot(): { rows: { count: number } }; getRowIdAt(i: number): string | undefined }): string[] =>
  Array.from({ length: engine.getSnapshot().rows.count }, (_, i) => engine.getRowIdAt(i) as string);

describe('child grids over the JSON protocol', () => {
  it('sends the relation as a where condition and composes child filters', async () => {
    const server = orderServer();
    const { transport, sent } = recording((req) => server.handle(req));
    const childSource = createJsonDataSource<Order>({ transport, key: 'OrderID', fields: ORDER_FIELDS, rowShape: 'object' });
    const employees = [{ EmployeeID: 3, name: 'E3' }, { EmployeeID: 5, name: 'E5' }];
    const parent = createDataGridEngine({
      id: 'emp',
      getRowId: (r: { EmployeeID: number }) => String(r.EmployeeID),
      columns: [{ field: 'EmployeeID', primaryKey: true }, { field: 'name' }],
      dataSource: employees,
      modules: [createDetailModule(), createHierarchyModule()] as const,
      hierarchy: { childGrid: { relationField: 'EmployeeID', data: childSource, columns: [{ field: 'OrderID', type: 'number', primaryKey: true }, { field: 'ShipCountry' }, { field: 'EmployeeID', type: 'number' }] } },
    });
    parent.dispatch({ type: 'detail.expand', rowId: '3' });
    const descriptor = parent.hierarchy.getChildGrid('3');
    assert.ok(descriptor);
    const modules = [createSortModule<Order>(), createFilterModule<Order>()] as const;
    const child = createDataGridEngine<Order, typeof modules>({ ...(descriptor.options as DataGridOptions<Order>), modules });
    child.getSnapshot();
    await idle();
    const expected = orders().filter((o) => o.EmployeeID === 3).map((o) => String(o.OrderID));
    assert.deepEqual(ids(child), expected);
    const reads = sent.filter((m) => (m as WireReadRequest).query !== undefined) as WireReadRequest[];
    assert.deepEqual(reads.at(-1)?.query.where, { field: 'EmployeeID', op: 'equal', value: 3 });
    child.dispatch({ type: 'filter.byColumn', columnId: 'ShipCountry', operator: 'equal', value: 'France' });
    await idle();
    const last = (sent.filter((m) => (m as WireReadRequest).query !== undefined) as WireReadRequest[]).at(-1);
    assert.deepEqual(last?.query.where, { and: [{ field: 'EmployeeID', op: 'equal', value: 3 }, { field: 'ShipCountry', op: 'equal', value: 'France' }] });
    assert.deepEqual(ids(child), orders().filter((o) => o.EmployeeID === 3 && o.ShipCountry === 'France').map((o) => String(o.OrderID)));
  });
});

describe('row reorder over the JSON protocol', () => {
  it('writes order values as changed rows and re-reads the persisted order', async () => {
    interface Item {
      id: number;
      title: string;
      rank: number;
    }
    const server = createJsonQueryHandler(
      Array.from({ length: 6 }, (_, i) => ({ id: i, title: `item ${i}`, rank: (i + 1) * 10 })),
      { key: 'id', fields: ['id', 'title', 'rank'] },
    );
    const { transport, sent } = recording((req) => server.handle(req));
    const source = createJsonDataSource<Item>({ transport, key: 'id', fields: ['id', 'title', 'rank'], rowShape: 'object' });
    const modules = [createSortModule<Item>(), createRowDragDropModule<Item>()] as const;
    const engine = createDataGridEngine<Item, typeof modules>({
      getRowId: (r) => String(r.id),
      columns: [{ field: 'id', type: 'number', primaryKey: true }, { field: 'title' }, { field: 'rank', type: 'number' }],
      dataSource: source,
      modules,
      rowDragDrop: { orderField: 'rank' },
      defaultQuery: { sorting: [{ columnId: 'rank', direction: 'asc' }] },
    });
    engine.getSnapshot();
    await idle();
    assert.deepEqual(ids(engine), ['0', '1', '2', '3', '4', '5']);
    // Reorder from index 4 to 1: item 4 ends at data index 1.
    assert.equal(engine.dispatch({ type: 'rowDragDrop.reorder', fromIndexes: [4], toIndex: 1 }).status, 'applied');
    await idle();
    const write = sent.find((m) => (m as WireWriteRequest).write !== undefined) as WireWriteRequest;
    assert.deepEqual(write.write.changed, [{ key: 4, set: { rank: 15 } }]);
    assert.equal((engine.getModuleState<RowDragDropState>('rowDragDrop') as RowDragDropState).lastDrop?.status, 'applied');
    assert.deepEqual(ids(engine), ['0', '4', '1', '2', '3', '5']);
    assert.equal(server.rows().find((r) => r['id'] === 4)?.['rank'], 15);
  });
});
