import { useMemo, useState } from 'react';
import { createFilterModule, createPagingModule, createSearchModule, createSortModule } from '@salmonui/data-grid/engine';
import {
  DataGrid,
  type DataGridAggregateContext,
  type DataGridAggregateRow,
  type DataGridApi,
  type DataGridColumn,
  type DataGridGroupChangeEvent,
  type DataGridGroupToggleEvent,
  type DataGridProps,
  type DataGridSelection,
  type DataGridSelectionChangeEvent,
} from '@salmonui/data-grid';
import { ThemeProvider, type SalmonColorScheme } from '@salmonui/core/theme';
import type { Row } from './fixture.ts';
import '@salmonui/data-grid/styles.css';

export interface AppProps {
  rows: Row[];
  columns: DataGridColumn<Row>[];
  maxScrollHeight: number | undefined;
  estimatedRowHeight: number | undefined;
  onApi: (api: DataGridApi<Row> | null) => void;
  /** Feature switches read from the URL (browser tests and demos). */
  features: {
    sort: boolean;
    filter: boolean;
    paging: number | null;
    /** `false` turns selection off; undefined keeps the default (single row). */
    selection: DataGridSelection | false | undefined;
    controlled: boolean;
    dir: 'ltr' | 'rtl' | null;
    defaultSelectedRowIds: string[] | undefined;
    group: string[] | null;
    aggregates: boolean;
    collapsed: boolean;
    search?: boolean;
  };
  /** Extra DataGrid props (column chrome demos and browser tests). */
  extra?: Partial<DataGridProps<Row>>;
  onSelectionChange?: (change: DataGridSelectionChangeEvent<Row>) => void;
  onGroupEvent?: (event: { type: string; [key: string]: unknown }) => void;
}

// Templates choose where an aggregate shows (footer, group footer, group caption).
const show = ({ formatted }: DataGridAggregateContext<Row>) => Object.entries(formatted).map(([type, value]) => `${type}: ${value}`).join(' ');
const AGGREGATES: DataGridAggregateRow<Row>[] = [
  {
    columns: [
      { field: 'n4', type: ['sum', 'average'], format: 'N0', renderFooter: show, renderGroupFooter: show, renderGroupCaption: show },
      { field: 'n5', type: 'max', format: 'N0', renderFooter: show, renderGroupFooter: show },
      { field: 'n6', type: 'min', format: 'N0' },
    ],
  },
];

export function App({ rows, columns, maxScrollHeight, estimatedRowHeight, onApi, features, onSelectionChange, onGroupEvent, extra }: AppProps) {
  const [scheme, setScheme] = useState<SalmonColorScheme>('auto');
  const [selected, setSelected] = useState<readonly string[]>(features.defaultSelectedRowIds ?? []);
  // Modules are initial-only; create them once.
  const modules = useMemo(
    () => [...(features.filter ? [createFilterModule<Row>()] : []), ...(features.sort ? [createSortModule<Row>()] : []), ...(features.paging ? [createPagingModule<Row>()] : []), ...(features.search ? [createSearchModule<Row>()] : [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const grid = (
    <DataGrid<Row>
      aria-labelledby="grid-title"
      data={rows}
      columns={columns}
      height={600}
      timeZone="UTC"
      // onReady: with `editing` it fires once the lazy editing chunk is loaded.
      onReady={onApi}
      modules={modules}
      // The browser tests resize and reorder columns (both default to off).
      resizable
      reorderable
      {...(features.paging ? { paging: { page: 1, pageSize: features.paging } } : {})}
      {...(features.group
        ? {
            // Chip reorder, header group toggles, and grouped columns kept visible (the tests use all three; the chip sort toggle follows `sorting`).
            grouping: { groupBy: features.group, defaultExpanded: !features.collapsed, reorderable: true, showHeaderToggle: true, showGroupedColumns: true },
            onGroupChange: (e: DataGridGroupChangeEvent) => onGroupEvent?.({ type: 'change', action: e.action, field: e.field, groupBy: [...e.groupBy] }),
            onGroupToggle: (e: DataGridGroupToggleEvent<Row>) => onGroupEvent?.({ type: e.expanded ? 'expand' : 'collapse', groupId: e.groupId }),
          }
        : {})}
      {...(features.aggregates ? { aggregates: AGGREGATES } : {})}
      {...(features.selection !== undefined || features.controlled || features.defaultSelectedRowIds
        ? { selection: features.selection === false ? false : { ...features.selection, ...(features.controlled || features.defaultSelectedRowIds ? { rowIds: selected } : {}) } }
        : {})}
      {...(features.controlled
        ? {
            onSelectionChange: (change: DataGridSelectionChangeEvent<Row>) => {
              onSelectionChange?.(change);
              setSelected(change.rowIds);
            },
          }
        : onSelectionChange
          ? { onSelectionChange }
          : {})}
      {...(estimatedRowHeight !== undefined ? { estimatedRowHeight, textWrap: 'content' as const } : {})}
      {...(maxScrollHeight !== undefined ? { virtualization: { maxScrollHeight } } : {})}
      {...extra}
    />
  );
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <header className="app__bar">
        <h1 id="grid-title">
          Salmon UI Data Grid · {rows.length.toLocaleString('en-US')} × {columns.length}
        </h1>
        <label>
          Scheme{' '}
          <select value={scheme} onChange={(e) => setScheme(e.target.value as SalmonColorScheme)}>
            <option value="auto">auto</option>
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </label>
      </header>
      {/* `dir` on an ancestor: the grid inherits the direction. */}
      {features.dir ? <div dir={features.dir}>{grid}</div> : grid}
      <button type="button" className="app__after">
        After grid
      </button>
    </ThemeProvider>
  );
}
