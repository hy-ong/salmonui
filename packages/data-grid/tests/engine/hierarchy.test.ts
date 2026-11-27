// Hierarchy grid model: child grid descriptors, relation
// scoping over arrays, local, and remote sources, nested levels, and option
// inheritance. Child engines are built from the descriptors exactly as the
// renderer will build them.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFilterModule,
  createDataGridEngine,
  createLocalDataSource,
  type ChildGridConfig,
  type DataSourceRequest,
  type DataSource,
  type DataGridOptions,
  type WriteRequest,
} from '@salmonui/data-grid/engine';
import { createDetailModule } from '@salmonui/data-grid/engine/expansion';
import { childRowsOf, createChildDataSource, createHierarchyModule } from '@salmonui/data-grid/engine/hierarchy';

interface Employee {
  readonly EmployeeID: number;
  readonly name: string;
}
interface Order {
  readonly OrderID: number;
  readonly EmployeeID: number;
  readonly CustomerID: string;
}
interface Customer {
  readonly CustomerID: string;
  readonly company: string;
}

const employees: Employee[] = [1, 2, 3].map((id) => ({ EmployeeID: id, name: `E${id}` }));
const orders: Order[] = [];
for (let i = 0; i < 12; i++) orders.push({ OrderID: 100 + i, EmployeeID: 1 + (i % 3), CustomerID: `C${i % 2}` });
const customers: Customer[] = [
  { CustomerID: 'C0', company: 'Zero' },
  { CustomerID: 'C1', company: 'One' },
];

function parentEngine<Child>(childGrid: ChildGridConfig<Child, Employee>) {
  return createDataGridEngine({
    id: 'emp',
    getRowId: (r: Employee) => String(r.EmployeeID),
    columns: [{ field: 'EmployeeID', primaryKey: true }, { field: 'name' }],
    dataSource: employees,
    modules: [createDetailModule<Employee>(), createHierarchyModule<Employee>()],
    hierarchy: { childGrid },
    locale: 'de-DE',
  });
}

function childEngine<Child>(options: DataGridOptions<Child>) {
  const modules = [createFilterModule<Child>(), createDetailModule<Child>(), createHierarchyModule<Child>()] as const;
  return createDataGridEngine<Child, typeof modules>({ ...options, modules });
}

function ids<Row>(engine: { getSnapshot(): { rows: { count: number } }; getRowIdAt(i: number): string | undefined }): string[] {
  const out: string[] = [];
  for (let i = 0; i < engine.getSnapshot().rows.count; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
}

describe('hierarchy', () => {
  it('describes a child grid filtered by relationField with a stable identity', () => {
    const engine = parentEngine({ relationField: 'EmployeeID', data: orders, columns: [{ field: 'OrderID', primaryKey: true }, { field: 'CustomerID' }] });
    engine.dispatch({ type: 'detail.expand', rowId: '2' });
    const child = engine.hierarchy.getChildGrid('2');
    assert.ok(child);
    assert.equal(child.id, 'emp/2');
    assert.equal(child.depth, 1);
    assert.deepEqual(child.relation, { parentField: 'EmployeeID', childField: 'EmployeeID', value: 2 });
    assert.deepEqual({ ...child.filter }, { columnId: 'EmployeeID', operator: 'equal', value: 2, predicate: 'and', source: 'api' });
    assert.equal(engine.hierarchy.getChildGrid('2'), child);
    assert.equal(child.options.locale, 'de-DE', 'child grids inherit the locale');
    const c = childEngine(child.options as DataGridOptions<Order>);
    assert.deepEqual(ids(c), ['101', '104', '107', '110']);
    assert.equal(engine.hierarchy.getChildGrid('nope'), undefined);
  });

  it('nests child grids', () => {
    const engine = parentEngine({
      relationField: 'EmployeeID',
      data: orders,
      columns: [{ field: 'OrderID', primaryKey: true }, { field: 'CustomerID' }],
      childGrid: { relationField: 'CustomerID', data: customers, columns: [{ field: 'CustomerID', primaryKey: true }, { field: 'company' }] },
    });
    const level1 = childEngine(engine.hierarchy.getChildGrid('1')?.options as DataGridOptions<Order>);
    assert.deepEqual(ids(level1), ['100', '103', '106', '109']);
    const level2 = level1.hierarchy.getChildGrid('103');
    assert.ok(level2);
    assert.equal(level2.id, 'emp/1/103');
    assert.equal(level2.depth, 2);
    const c2 = childEngine(level2.options as DataGridOptions<Customer>);
    assert.deepEqual(ids(c2), ['C1']);
  });

  it('uses explicit parentField and childField and a factory per parent', () => {
    const seen: string[] = [];
    const engine = parentEngine({
      parentField: 'EmployeeID',
      childField: 'EmployeeID',
      getRowId: (o: Order) => `o${o.OrderID}`,
      data: (parent) => {
        seen.push(parent.rowId);
        return orders;
      },
    });
    const child = childEngine(engine.hierarchy.getChildGrid('3')?.options as DataGridOptions<Order>);
    assert.deepEqual(ids(child), ['o102', 'o105', 'o108', 'o111']);
    assert.deepEqual(seen, ['3']);
  });

  it('requires a relation and a child row id', () => {
    assert.throws(() => parentEngine({ data: orders, getRowId: (o: Order) => String(o.OrderID) }), /relationField/);
    assert.throws(() => parentEngine({ relationField: 'EmployeeID', data: orders }), /getRowId/);
  });

  it('scopes a remote source: the relation filter comes first and cannot be cleared', async () => {
    const requests: DataSourceRequest[] = [];
    const remote: DataSource<Order> = {
      mode: 'remote',
      read(request) {
        requests.push(request);
        const filters = request.query.filters;
        const value = (filters[0] as { value: number }).value;
        const rows = orders.filter((o) => o.EmployeeID === value);
        return Promise.resolve({ version: request.version, rows, totalRowCount: rows.length, performed: ['filter', 'search', 'sort', 'page'] as const });
      },
    };
    const engine = parentEngine({ relationField: 'EmployeeID', data: remote, columns: [{ field: 'OrderID', primaryKey: true }, { field: 'CustomerID' }] });
    const child = childEngine(engine.hierarchy.getChildGrid('1')?.options as DataGridOptions<Order>);
    child.getSnapshot();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(ids(child), ['100', '103', '106', '109']);
    child.dispatch({ type: 'filter.byColumn', columnId: 'CustomerID', operator: 'equal', value: 'C1' });
    child.dispatch({ type: 'filter.clear' });
    const last = requests[requests.length - 1] as DataSourceRequest;
    assert.deepEqual(last.query.filters, [{ columnId: 'EmployeeID', operator: 'equal', value: 1, predicate: 'and', source: 'api' }]);
    assert.ok(requests.some((r) => r.query.filters.length === 2 && (r.query.filters[1] as { columnId: string }).columnId === 'CustomerID'));
  });

  it('scopes a shared local source and writes through it, stamping the relation on added rows', async () => {
    const shared = createLocalDataSource(orders, { getRowId: (o: Order) => String(o.OrderID) });
    const scoped = createChildDataSource<Order>(shared, { childField: 'EmployeeID', value: 2 });
    const child = createDataGridEngine({ getRowId: (o: Order) => String(o.OrderID), columns: [{ field: 'OrderID' }], dataSource: scoped });
    assert.deepEqual(ids(child), ['101', '104', '107', '110']);
    const request: WriteRequest<Order> = {
      version: 1,
      added: [{ tempId: '999', row: { OrderID: 999, CustomerID: 'C9' } as Order }],
      changed: [],
      deleted: [],
      mode: 'row',
      signal: new AbortController().signal,
    };
    await scoped.write?.(request);
    assert.equal(shared.getRows().at(-1)?.EmployeeID, 2);
    assert.deepEqual(ids(child), ['101', '104', '107', '110', '999']);
  });

  it('indexes a child array once per identity (O(1) per parent)', () => {
    const a = childRowsOf(orders, 'EmployeeID', 1);
    assert.equal(childRowsOf(orders, 'EmployeeID', 1), a);
    assert.equal(a.length, 4);
    assert.equal(childRowsOf(orders, 'EmployeeID', 42).length, 0);
    const date = new Date(Date.UTC(2025, 0, 1));
    const dated = [{ d: new Date(date.getTime()) }, { d: new Date(0) }];
    assert.equal(childRowsOf(dated, 'd', date).length, 1, 'dates match by instant');
    assert.equal(createChildDataSource(orders, { childField: 'EmployeeID', value: 1 }), createChildDataSource(orders, { childField: 'EmployeeID', value: 1 }));
  });

  it('creates descriptors only for the parents asked for (expand-all)', () => {
    const engine = parentEngine({ relationField: 'EmployeeID', data: orders, getRowId: (o: Order) => String(o.OrderID) });
    engine.dispatch({ type: 'detail.expandAll' });
    assert.deepEqual(ids(engine), ['1', '__detail:1', '2', '__detail:2', '3', '__detail:3']);
    assert.ok(engine.hierarchy.getChildGrid('1'));
  });
});
