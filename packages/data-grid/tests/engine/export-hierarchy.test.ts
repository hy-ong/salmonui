// Hierarchy export and print modes: the detail
// hook built from the `detail` expansion state and `hierarchy` child grid
// descriptors, nested levels, and every-page parents.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, createPagingModule, type ChildGridConfig } from '@salmonui/data-grid/engine';
import { createDetailModule } from '@salmonui/data-grid/engine/expansion';
import { createExportModel, createExportModule, exportCsv, hierarchyExportDetail, type ExportDetailRow, type ExportModel } from '@salmonui/data-grid/engine/export';
import { createHierarchyModule } from '@salmonui/data-grid/engine/hierarchy';

interface Employee {
  readonly EmployeeID: number;
  readonly name: string;
}
interface Order {
  readonly OrderID: number;
  readonly EmployeeID: number;
  readonly CustomerID: string;
}

const employees: Employee[] = [1, 2, 3, 4].map((id) => ({ EmployeeID: id, name: `E${id}` }));
const orders: Order[] = [];
for (let i = 0; i < 8; i++) orders.push({ OrderID: 100 + i, EmployeeID: 1 + (i % 4), CustomerID: `C${i % 2}` });
const customers = [
  { CustomerID: 'C0', company: 'Zero' },
  { CustomerID: 'C1', company: 'One' },
];

const childGrid: ChildGridConfig = {
  relationField: 'EmployeeID',
  data: orders,
  columns: [{ field: 'OrderID', primaryKey: true }, { field: 'CustomerID' }],
  childGrid: { relationField: 'CustomerID', data: customers, columns: [{ field: 'CustomerID', primaryKey: true }, { field: 'company' }] },
};

function parent(paged = false) {
  return createDataGridEngine({
    id: 'emp',
    getRowId: (r: Employee) => String(r.EmployeeID),
    columns: [{ field: 'EmployeeID', primaryKey: true }, { field: 'name' }],
    dataSource: employees,
    modules: [createDetailModule<Employee>(), createHierarchyModule<Employee>(), createExportModule<Employee>(), ...(paged ? [createPagingModule<Employee>()] : [])],
    hierarchy: { childGrid },
    ...(paged ? { defaultQuery: { paging: { page: 1, pageSize: 2 } } } : {}),
  });
}

const opt = <T,>(hook: T | undefined) => (hook ? { detail: hook } : {});

function details<Row>(model: ExportModel<Row>): ExportDetailRow<Row>[] {
  return [...model.rows()].filter((r): r is ExportDetailRow<Row> => r.kind === 'detail');
}

describe('hierarchy export detail', () => {
  it('expanded exports the expanded parents only; all exports every parent; none exports none', () => {
    const engine = parent();
    engine.dispatch({ type: 'detail.expand', rowId: '2' });
    const expanded = createExportModel(engine, { hierarchy: 'expanded', ...opt(hierarchyExportDetail(engine, 'expanded')) });
    assert.deepEqual(details(expanded).map((d) => d.parentId), ['2']);
    const child = details(expanded)[0]?.detail.model as ExportModel<Order>;
    assert.deepEqual(child.columns.map((c) => c.columnId), ['OrderID', 'CustomerID']);
    assert.deepEqual([...child.rows()].filter((r) => r.kind === 'data').map((r) => r.id), ['101', '105']);
    const all = createExportModel(engine, { hierarchy: 'all', ...opt(hierarchyExportDetail(engine, 'all')) });
    assert.deepEqual(details(all).map((d) => d.parentId), ['1', '2', '3', '4']);
    assert.equal(hierarchyExportDetail(engine, 'none'), undefined);
  });

  it('nests child levels and builds parents of every page (not only the visible page)', () => {
    const engine = parent(true);
    assert.equal(engine.getSnapshot().rows.count, 2);
    const model = createExportModel(engine, { scope: 'filtered', hierarchy: 'all', ...opt(hierarchyExportDetail(engine, 'all')) });
    assert.deepEqual(details(model).map((d) => d.parentId), ['1', '2', '3', '4']);
    const level1 = details(model)[0]?.detail.model as ExportModel<Order>;
    const level2 = details(level1);
    assert.equal(level2.length, 2);
    assert.deepEqual(level2.map((d) => [...(d.detail.model as ExportModel<{ company: string }>).rows()].map((r) => (r.kind === 'data' ? r.row.company : null))), [['Zero'], ['Zero']]);
  });

  it('the user detail hook wins; null suppresses; grids without the modules keep the user hook', async () => {
    const engine = parent();
    const hook = hierarchyExportDetail(engine, 'all', ({ rowId }) => (rowId === '1' ? { text: ['custom'] } : rowId === '2' ? null : undefined));
    const model = createExportModel(engine, { hierarchy: 'all', ...opt(hook) });
    assert.deepEqual(details(model).map((d) => [d.parentId, d.detail.text?.[0] ?? 'model']), [['1', 'custom'], ['3', 'model'], ['4', 'model']]);
    const plain = createDataGridEngine({ getRowId: (r: Employee) => String(r.EmployeeID), columns: [{ field: 'name' }], dataSource: employees, modules: [createExportModule<Employee>()] });
    const user = () => null;
    assert.equal(hierarchyExportDetail(plain, 'all', user), user);
    // CSV has no detail form: the rows export unchanged.
    const csv = await exportCsv(engine, { hierarchy: 'all' }, { ...opt(hierarchyExportDetail(engine, 'all')) });
    assert.equal(csv?.data.split('\r\n').filter(Boolean).length, 5);
  });

  it('detail templates without child grids follow the mode: expanded rows only, all, none', () => {
    const engine = createDataGridEngine({
      getRowId: (r: Employee) => String(r.EmployeeID),
      columns: [{ field: 'EmployeeID', primaryKey: true }, { field: 'name' }],
      dataSource: employees,
      modules: [createDetailModule<Employee>(), createExportModule<Employee>()],
    });
    engine.dispatch({ type: 'detail.expand', rowId: '3' });
    const user = ({ row }: { row: Employee }) => ({ text: [`about ${row.name}`] });
    const run = (mode: 'expanded' | 'all' | 'none') => {
      const hook = hierarchyExportDetail(engine, mode, user);
      return details(createExportModel(engine, { hierarchy: mode, ...opt(hook) })).map((d) => [d.parentId, d.detail.text?.[0]]);
    };
    assert.deepEqual(run('expanded'), [['3', 'about E3']]);
    assert.deepEqual(run('all'), [['1', 'about E1'], ['2', 'about E2'], ['3', 'about E3'], ['4', 'about E4']]);
    assert.deepEqual(run('none'), []);
    // With child grids too, `expanded` skips the user hook on collapsed rows.
    const withChildren = parent();
    withChildren.dispatch({ type: 'detail.expand', rowId: '2' });
    const hook = hierarchyExportDetail(withChildren, 'expanded', ({ rowId }) => (rowId === '1' ? { text: ['custom'] } : undefined));
    assert.deepEqual(details(createExportModel(withChildren, { hierarchy: 'expanded', ...opt(hook) })).map((d) => d.parentId), ['2']);
  });
});
