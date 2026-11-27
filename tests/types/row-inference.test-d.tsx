// Type-contract test: user code infers its row type through the public API
// (no `any` in published declarations). Generic
// defaults are `unknown`, so these cases guard that typed rows still flow
// into callbacks, events, the DataGridApi, and module façades.
import { createDataGridEngine, type ChildGridConfig, type ColumnDef, type EditOptions, type DataGridModule, type HierarchyOptions } from '@salmonui/data-grid/engine';
import { type RowId } from '@salmonui/core/data';
import { createSortModule } from '@salmonui/data-grid/engine/sort';
import { createEditModule, type EditDraft } from '@salmonui/data-grid/engine/edit';
import type { CustomValidator, ValidatorContext } from '@salmonui/core/validation';
import { createJsonDataSource, type FetchLike } from '@salmonui/data';
import { defineChildGrid, DataGrid, DataGridDefaultCell, DataGridSearchBox, useDataGridApi, type DataGridApi, type DataGridChildGrid, type DataGridColumn, type DataGridProps, type DataGridRowDragEvent } from '@salmonui/data-grid';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

interface Order {
  readonly id: string;
  readonly amount: number;
  readonly customerId: string;
}
interface Line {
  readonly lineId: string;
  readonly orderId: string;
}
interface Customer {
  readonly customerId: string;
}

const orders: Order[] = [{ id: 'o1', amount: 1, customerId: 'c1' }];

// DataGrid infers Row from `data` without an explicit type argument.
export const inferred = (
  <DataGrid
    aria-label="Orders"
    data={orders}
    getRowId={(row) => {
      expectType<Equal<typeof row, Order>>(true);
      return row.id;
    }}
    columns={[
      { field: 'amount', valueGetter: (row) => row.amount * 2 },
      {
        field: 'id',
        renderCell: (ctx) => {
          expectType<Equal<typeof ctx.row, Order>>(true);
          return <DataGridDefaultCell column={ctx.column} value={ctx.value} formattedValue={ctx.formattedValue} />;
        },
      },
    ]}
    onSelectionChange={(event) => {
      expectType<Equal<ReturnType<typeof event.rows>[number], Order>>(true);
    }}
    onReady={(api) => {
      expectType<Equal<typeof api, DataGridApi<Order>>>(true);
      expectType<Equal<NonNullable<ReturnType<typeof api.getRowInfo>>['row'], Order | null>>(true);
    }}
  />
);

// Column callbacks see the row type.
const columns: DataGridColumn<Order>[] = [
  {
    field: 'amount',
    valueGetter: (row) => {
      expectType<Equal<typeof row, Order>>(true);
      return row.amount;
    },
    validation: {
      required: true,
      validate: (value, row, ctx) => {
        expectType<Equal<typeof row, Order>>(true);
        expectType<Equal<typeof ctx.column.def, ColumnDef<Order>>>(true);
        return typeof value === 'number' && value > row.amount ? null : 'too small';
      },
    },
  },
];
const props: DataGridProps<Order> = { data: orders, columns };
void props;

// Typed validators and edit options are assignable where the row type is known.
const positive: CustomValidator<Order> = (value, row) => (row.amount >= 0 && value !== null ? null : 'negative');
void positive;
const edit: EditOptions<Order> = {
  isCellEditable: (ctx) => ctx.row.amount > 0,
  newRow: () => ({ amount: 0 }),
};
void edit;
// A validator shared across row types is generic over the row.
const required = <Row,>(value: unknown, _row: Row, _ctx: ValidatorContext<Row>) => (value === null ? 'required' : null);
const reused: ColumnDef<Order> = { field: 'id', validation: { validate: required } };
void reused;

// DataGridApi methods keep the row type.
declare const api: DataGridApi<Order>;
expectType<Equal<NonNullable<ReturnType<typeof api.getRowInfo>>['row'], Order | null>>(true);
export const search = <DataGridSearchBox api={api} />;
export function Slot() {
  const slotApi = useDataGridApi<Order>();
  expectType<Equal<typeof slotApi, DataGridApi<Order>>>(true);
  return null;
}

// Engine: modules keep their façades; the row type is inferred from options.
const engine = createDataGridEngine({
  getRowId: (row: Order) => row.id,
  columns: [{ field: 'amount', valueGetter: (row: Order) => row.amount }],
  dataSource: orders,
  modules: [createSortModule<Order>(), createEditModule<Order>()],
});
expectType<Equal<ReturnType<typeof engine.getRow>, Order | undefined>>(true);
expectType<Equal<Parameters<typeof engine.edit.getDraft>, [rowId: RowId, columnId: string]>>(true);
expectType<Equal<ReturnType<typeof engine.edit.getDraft>, EditDraft | undefined>>(true);
engine.sort.clear();
// Typed modules are DataGridModules of their row type.
const modules: readonly DataGridModule<Order>[] = [createSortModule<Order>(), createEditModule<Order>()];
void modules;

// Hierarchy: nested child grid configs are typed per level.
const childGrid: ChildGridConfig<Line, Order, Customer> = {
  parentField: 'id',
  childField: 'orderId',
  data: (parent) => {
    expectType<Equal<typeof parent.row, Order>>(true);
    return [];
  },
  getRowId: (row) => row.lineId,
  childGrid: { relationField: 'customerId', data: [] as Customer[], getRowId: (row) => row.customerId },
};
const hierarchy: HierarchyOptions<Line, Order, Customer> = { childGrid };
void hierarchy;

// The platform fetch and typed custom fetches are FetchLike.
const platform: FetchLike = fetch;
const custom: FetchLike = async (url, init) => {
  expectType<Equal<typeof url, string>>(true);
  void init?.signal?.aborted;
  return { ok: true, status: 200, json: async () => ({ url }), text: async () => '' };
};
createJsonDataSource<Order>({ url: '/orders', fetch: custom, key: 'id' });
void platform;

// Child grids: defineChildGrid types the child rows and the parent row;
// the result fits the `childGrid` prop of a grid of parents. Nested levels too.
const lineGrid = defineChildGrid<Line, Order>({
  data: (parent) => {
    expectType<Equal<typeof parent.row, Order>>(true);
    return [] as Line[];
  },
  joinField: 'orderId',
});
const orderGrid = defineChildGrid<Order, Customer>({
  data: orders,
  joinField: 'customerId',
  columns: [
    {
      field: 'id',
      primaryKey: true,
      renderCell: (ctx) => {
        expectType<Equal<typeof ctx.row, Order>>(true);
        return ctx.row.id;
      },
    },
  ],
  getRowId: (row) => {
    expectType<Equal<typeof row, Order>>(true);
    return row.id;
  },
  childGrid: lineGrid,
});
expectType<Equal<typeof orderGrid, DataGridChildGrid<unknown, Customer>>>(true);
const customers: Customer[] = [{ customerId: 'c1' }];
const nested: DataGridProps<Customer> = { data: customers, childGrid: orderGrid };
void nested;
// An inline childGrid sees child rows as unknown.
<DataGrid data={customers} childGrid={{ data: orders, joinField: 'customerId', getRowId: (row) => {
  expectType<Equal<typeof row, unknown>>(true);
  return 'x';
} }} />;
// Row drag events keep the row type.
<DataGrid
  data={orders}
  rowDrag
  onRowDrop={(event: DataGridRowDragEvent<Order>) => {
    expectType<Equal<ReturnType<typeof event.rows>, readonly Order[]>>(true);
  }}
  renderDetail={({ row }) => {
    expectType<Equal<typeof row, Order>>(true);
    return row.id;
  }}
/>;
