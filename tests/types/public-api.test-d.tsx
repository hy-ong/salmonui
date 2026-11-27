// Type-contract test: compiles against the built
// dist/*.d.ts through the package exports map. A failing compile means the
// public API changed; update this file in the same change on purpose.
import { createDataGridEngine, createLocalDataSource, type DataSource } from '@salmonui/data-grid/engine';
import { createJsonDataSource } from '@salmonui/data';
import { DataGrid, DataGridAggregate, DataGridAggregateRow, DataGridColumn, type DataGridApi, type DataGridProps, type DataGridSelectionChangeEvent } from '@salmonui/data-grid';
import { ThemeProvider, type SalmonThemeInput } from '@salmonui/core/theme';
import * as themeEntry from '@salmonui/core/theme';
import { createThemeCss, getThemeHash, ThemeStyle } from '@salmonui/core/server';
import { getDataGridInitialRange } from '@salmonui/data-grid/server';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

interface Order {
  readonly id: string;
  readonly amount: number;
  readonly placed: Date;
}

const rows: Order[] = [{ id: 'o1', amount: 1, placed: new Date(0) }];

// Columns are typed by row.
const columns: DataGridColumn<Order>[] = [
  { field: 'id', primaryKey: true },
  { field: 'amount', type: 'number', align: 'end', pinned: 'end' },
  { id: 'computed', valueGetter: (row) => row.amount * 2 },
];

// DataGrid props.
const props: DataGridProps<Order> = { data: rows, columns, height: 480, timeZone: 'UTC' };
// @ts-expect-error `dataSource` is `data`
const renamedData: DataGridProps<Order> = { dataSource: rows, columns };
void renamedData;
// @ts-expect-error `headerText` is `header`
const renamedHeader: DataGridColumn<Order> = { field: 'id', headerText: 'ID' };
void renamedHeader;
// Feature props are `boolean | options`; events are single event objects.
const featureProps: DataGridProps<Order> = {
  data: rows,
  columns,
  getRowId: (row) => row.id,
  selection: { multiple: true, rowIds: ['o1'] },
  sorting: { multiple: true, sortBy: [{ field: 'amount', direction: 'desc' }] },
  grouping: true,
  paging: { pageSize: 20 },
  onBeforeSelectionChange: (event) => event.preventDefault(),
  onSelectionChange: (event) => {
    expectType<Equal<typeof event, DataGridSelectionChangeEvent<Order>>>(true);
    void event.rows();
  },
};
void featureProps;
export const element = <DataGrid<Order> aria-label="Orders" {...props} />;
// Columns and aggregates as JSX children.
export const jsxColumns = (
  <DataGrid<Order> aria-label="Orders" data={rows} getRowId={(row) => row.id}>
    <DataGridColumn field="id" header="ID" primaryKey />
    <DataGridColumn header="Money">
      <DataGridColumn field="amount" type="number" />
    </DataGridColumn>
    <DataGridAggregateRow>
      <DataGridAggregate field="amount" type="sum" />
    </DataGridAggregateRow>
  </DataGrid>
);

// Theme input: color seeds, colorScheme and the appearance settings.
const theme: SalmonThemeInput = { colors: { primary: '#0f766e' }, colorScheme: 'auto' };
const dense: SalmonThemeInput = { density: 'compact', fontFamily: 'Inter, sans-serif', neutral: { chroma: 0.03 }, surfaces: { sidebar: '#192225', tableHeader: 'primary' } };
void dense;
// @ts-expect-error two densities only
const roomy: SalmonThemeInput = { density: 'roomy' };
void roomy;
// @ts-expect-error no radius input
const rounded: SalmonThemeInput = { radius: 8 };
void rounded;
export const themed = (
  <ThemeProvider theme={theme}>
    <ThemeStyle theme={theme} />
  </ThemeProvider>
);
expectType<Equal<ReturnType<typeof createThemeCss>, string>>(true);
expectType<Equal<ReturnType<typeof getThemeHash>, string>>(true);
getDataGridInitialRange({ rowCount: 10, centerColumnCount: 5 });

// The client theme entry never re-exports the server-only theme style.
// @ts-expect-error ThemeStyle lives in @salmonui/core/server only
void themeEntry.ThemeStyle;

// Core engine and local data source.
const source: DataSource<Order> = createLocalDataSource(rows, { getRowId: (row) => row.id });
const engine = createDataGridEngine<Order>({ getRowId: (row) => row.id, columns: [{ field: 'id' }], dataSource: source });
void engine.getSnapshot();

// Remote data source.
void createJsonDataSource;

// DataGridApi is generic over Row.
declare const api: DataGridApi<Order>;
expectType<Equal<typeof api.element, HTMLDivElement | null>>(true);
api.selectRows('o1', { mode: 'toggle' });
api.sortColumn('amount', 'asc', { multiple: true });
api.focusCell('o1', 'amount');

// Globalization: localeText is a catalog of templates and plural forms; persistState and the state API.
const localized: DataGridProps<Order> = {
  locale: 'de-DE',
  dir: 'auto',
  localeText: { noRows: 'Keine Daten', rowsSelected: { one: '1 Zeile', other: '{count} Zeilen' } },
  persistState: { key: 'orders', exclude: ['scroll'], version: 2 },
};
void localized;
// @ts-expect-error messages are strings or plural forms, not functions
const badText: DataGridProps<Order> = { localeText: { pageButton: (page: number) => `Page ${page}` } };
void badText;
const saved = api.getState({ exclude: ['selection'] });
expectType<Equal<typeof saved.version, 1>>(true);
expectType<Equal<ReturnType<typeof api.restoreState>['status'], 'applied' | 'partial'>>(true);
api.resetState();
